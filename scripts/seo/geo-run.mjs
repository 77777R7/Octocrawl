#!/usr/bin/env node
// One GEO round: the core set of the prompt library (docs/seo/library/geo-prompts.md) asked of an assistant through its
// official API, each prompt several times, in the pilot Howard approved on 2026-11-01 (docs/seo/library/decisions.md
// G-10 to G-12). Protocol rule 5: these are API answers, not what the assistant's app shows, and are recorded as such.
//
//   node scripts/seo/geo-run.mjs --dry-run                 list the prompts and the calls a round would make; no API call
//   node scripts/seo/geo-run.mjs                           the core set × 3 runs on Claude (claude-opus-5-5, web search on)
//   node scripts/seo/geo-run.mjs --runs 1 --ids P02-04     fewer calls, for a check
//   node scripts/seo/geo-run.mjs --all                     the whole library instead of the core set
//   node scripts/seo/geo-run.mjs --model ID                another Claude model
//   node scripts/seo/geo-run.mjs --round NAME              the round's folder name (default <UTC date>-claude-api); a round
//                                                          that already has answers is continued: only missing or failed
//                                                          runs are asked again, and the summary is rebuilt from all of them
//   node scripts/seo/geo-run.mjs --summarize --round NAME  rebuild the summary and review sheet without asking anything,
//                                                          for the prompts and runs the round was last asked with
//   node scripts/seo/geo-run.mjs --out DIR                 keep rounds under DIR (default: W2L_SEO_DIR, else .w2l/seo of
//                                                          the main checkout), in DIR/geo-runs/<round>/
//
// Needs ANTHROPIC_API_KEY (for example `set -a; . ~/Code/w2l/.w2l/access/anthropic.env; set +a`). Behind a proxy, run
// with NODE_USE_ENV_PROXY=1; the round says whether it ran proxied or direct. Each answer is kept whole, with the request,
// so a count can be checked against what the assistant wrote. The round writes summary.json, summary.md (the numbers a
// program can read) and review.md (the answers to judge by hand: recommended or only named, check points right or not);
// the dated record under research/seo/ is written from them after that judgement (protocol §3).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { UNFINISHED_STOPS, analyzeAnswer, parsePrompts, readClaudeAnswer, renderReview, renderRound, summarizeRound } from './geo-lib.mjs'

const LIBRARY = 'docs/seo/library/geo-prompts.md'
const DEFAULT_MODEL = 'claude-opus-5-5'
// Where the assistant is told the person is; the 2026-10-16 sample asked for US results too.
const LOCATION = { type: 'approximate', country: 'US' }
const CONCURRENCY = 3
// A server-side search loop that pauses is sent again at most this many times (pause_turn).
const MAX_CONTINUATIONS = 5

export function parseArgs(argv) {
  const options = { runs: 3, ids: null, all: false, model: DEFAULT_MODEL, round: null, out: null, dryRun: false, summarize: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => { if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`); return argv[++i] }
    if (arg === '--runs') options.runs = Number(value())
    else if (arg === '--ids') options.ids = value().split(',').map(id => id.trim()).filter(Boolean)
    else if (arg === '--all') options.all = true
    else if (arg === '--model') options.model = value()
    else if (arg === '--round') options.round = value()
    else if (arg === '--out') options.out = value()
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--summarize') options.summarize = true
    else throw new Error(`unknown option ${arg}`)
  }
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 30) throw new Error('--runs must be a whole number from 1 to 30')
  if (options.round !== null && !/^[\w.-]+$/.test(options.round)) throw new Error('--round must be a plain folder name')
  if (options.summarize && options.round === null) throw new Error('--summarize needs --round')
  return options
}

/** The prompts a round asks: the core set (or all of them), narrowed to --ids, which must all exist. */
export function selectPrompts(prompts, { all, ids }) {
  if (ids !== null) {
    const unknown = ids.filter(id => !prompts.some(prompt => prompt.id === id))
    if (unknown.length) throw new Error(`no prompt ${unknown.join(', ')} in ${LIBRARY}`)
    return prompts.filter(prompt => ids.includes(prompt.id))
  }
  return all ? prompts : prompts.filter(prompt => prompt.core)
}

export const answerFile = (id, run) => `${id}-r${run}.json`

/** Whether a saved run has to be asked (again): none on file, a failed one, or an answer that did not finish. */
export function needsAsking(saved) {
  if (!saved || saved.error) return true
  return UNFINISHED_STOPS.includes(saved.responses?.at(-1)?.stop_reason)
}

/** The answer records of a round folder, one file per run: { id, run, outcome, route, sourceCommit, askedAt, error } for
 * a failed or unfinished run, else the same with `text`, `model`, `analysis` and `refused`. */
export function readRound(dir, prompts) {
  const byId = new Map(prompts.map(prompt => [prompt.id, prompt]))
  const records = []
  for (const name of readdirSync(dir).filter(file => /^P\d\d-\d\d-r\d+\.json$/.test(file)).sort()) {
    const saved = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    const prompt = byId.get(saved.id)
    if (!prompt) throw new Error(`${name} answers ${saved.id}, which is not in ${LIBRARY}`)
    const base = { id: saved.id, run: saved.run, outcome: prompt.outcome, route: saved.route ?? null, sourceCommit: saved.sourceCommit ?? null, askedAt: saved.askedAt ?? null }
    if (saved.error) { records.push({ ...base, error: saved.error }); continue }
    const answer = readClaudeAnswer(saved.responses)
    if (UNFINISHED_STOPS.includes(answer.stopReason)) { records.push({ ...base, error: `unfinished answer (stop_reason ${answer.stopReason})` }); continue }
    records.push({ ...base, text: answer.text, model: answer.model, refused: answer.stopReason === 'refusal', analysis: analyzeAnswer(answer) })
  }
  return records
}

/** Asks one prompt once: the API's messages in order, sent again while the server pauses its search loop. */
export async function askClaude(client, model, prompt) {
  const tools = [{ type: 'web_search_20260209', name: 'web_search', user_location: LOCATION }]
  const messages = [{ role: 'user', content: prompt }]
  const responses = []
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const response = await client.messages.create({ model, max_tokens: 16000, tools, messages })
    responses.push(response)
    if (response.stop_reason !== 'pause_turn') return { request: { model, max_tokens: 16000, tools }, responses }
    messages.push({ role: 'assistant', content: response.content })
  }
  throw new Error(`the answer was still paused after ${MAX_CONTINUATIONS} continuations`)
}

const reason = error => (error instanceof Error ? `${error.constructor.name}: ${error.message.split('\n')[0]}`.slice(0, 500) : String(error))

/** Runs `work` over `items`, `limit` at a time. */
async function pool(items, limit, work) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  }))
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd())
  const prompts = parsePrompts(readFileSync(join(repoRoot, LIBRARY), 'utf8'))
  const round = options.round ?? `${new Date().toISOString().slice(0, 10)}-claude-api`
  const mainCheckout = resolve(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], repoRoot), '..')
  const dir = join(resolve(options.out ?? process.env.W2L_SEO_DIR ?? join(mainCheckout, '.w2l', 'seo')), 'geo-runs', round)
  // A round keeps the prompts and runs it was asked with (plan.json); a summary is rebuilt against that plan, so a
  // rebuild with other options cannot make the round look larger or smaller than it was.
  const planFile = join(dir, 'plan.json')
  if (options.summarize && !existsSync(planFile)) throw new Error(`${dir} has no plan.json: no round of that name was asked`)
  const plan = options.summarize ? JSON.parse(readFileSync(planFile, 'utf8')) : null
  const chosen = plan ? selectPrompts(prompts, { all: false, ids: plan.ids }) : selectPrompts(prompts, options)
  const runs = plan ? plan.runs : options.runs
  const jobs = chosen.flatMap(prompt => Array.from({ length: runs }, (_, index) => ({ prompt, run: index + 1 })))

  if (options.dryRun) {
    for (const prompt of chosen) console.log(`${prompt.id}\t${prompt.outcome}\t${prompt.prompt}`)
    console.log(`${chosen.length} prompts × ${options.runs} runs = ${jobs.length} calls to ${options.model}; answers would go to ${dir}`)
    return
  }
  mkdirSync(dir, { recursive: true })
  const route = process.env.NODE_USE_ENV_PROXY === '1' && (process.env.HTTPS_PROXY || process.env.https_proxy) ? 'proxied (HTTPS_PROXY)' : 'direct'
  const commit = git(['rev-parse', 'HEAD'], repoRoot)
  const sourceCommit = git(['status', '--porcelain'], repoRoot) === '' ? commit : `${commit} (uncommitted changes)`
  if (!options.summarize) {
    writeFileSync(planFile, `${JSON.stringify({ ids: chosen.map(prompt => prompt.id), runs, model: options.model }, null, 1)}\n`)
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()
    const todo = jobs.filter(({ prompt, run }) => {
      const file = join(dir, answerFile(prompt.id, run))
      return needsAsking(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null)
    })
    console.log(`${todo.length} of ${jobs.length} calls to make (${jobs.length - todo.length} already answered in ${dir})`)
    let done = 0
    await pool(todo, CONCURRENCY, async ({ prompt, run }) => {
      const askedAt = new Date().toISOString()
      const started = performance.now()
      let saved
      try {
        const asked = await askClaude(client, options.model, prompt.prompt)
        saved = { id: prompt.id, run, prompt: prompt.prompt, askedAt, ms: Math.round(performance.now() - started), route, sourceCommit, ...asked }
      } catch (error) {
        saved = { id: prompt.id, run, prompt: prompt.prompt, askedAt, ms: Math.round(performance.now() - started), route, sourceCommit, error: reason(error) }
      }
      writeFileSync(join(dir, answerFile(prompt.id, run)), `${JSON.stringify(saved, null, 1)}\n`)
      done++
      console.log(`${done}/${todo.length} ${prompt.id} run ${run}: ${saved.error ? `failed (${saved.error})` : needsAsking(saved) ? 'unfinished' : 'answered'}`)
    })
  }

  const ids = new Set(chosen.map(prompt => prompt.id))
  const records = readRound(dir, prompts).filter(record => ids.has(record.id) && record.run <= runs)
  const summary = summarizeRound(records, jobs.map(({ prompt, run }) => ({ id: prompt.id, run })))
  const count = values => Object.fromEntries([...new Set(values)].map(value => [value, values.filter(v => v === value).length]))
  const asked = records.map(record => record.askedAt).filter(Boolean).sort()
  // How the answers were asked comes from the answers themselves; a summary rebuilt later may run on another route or commit.
  const meta = {
    round, platform: 'Claude', models: [...new Set(records.map(record => record.model).filter(Boolean))], location: LOCATION.country,
    prompts: chosen.length, runs, askedFrom: asked[0] ?? null, askedTo: asked.at(-1) ?? null,
    routes: count(records.map(record => record.route ?? 'unknown')), commits: count(records.map(record => record.sourceCommit ?? 'unknown')),
    librarySha256: createHash('sha256').update(readFileSync(join(repoRoot, LIBRARY))).digest('hex'),
  }
  writeFileSync(join(dir, 'summary.json'), `${JSON.stringify({ meta, summary }, null, 1)}\n`)
  writeFileSync(join(dir, 'summary.md'), renderRound(meta, summary))
  writeFileSync(join(dir, 'review.md'), renderReview(records, prompts))
  console.log(`${summary.valid} valid answers, ${summary.failed.length} failed; summary and review sheet in ${dir}`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
