// PA access task set runner (G0 of the enhanced-access phase, ROADMAP.md "PA · Enhanced access").
//
// Runs the tasks in research/access/tasks.v1.json through a running local API (npm run api),
// judges each answer by the task's own predicates, writes one JSON line per attempt under
// .w2l/access/runs/<timestamp>/ and, with --record, a Markdown summary that is the committed record.
//
// Usage: node research/access/run-set.mjs [--set frozen|blind|all] [--only T01,T02] [--warm]
//          [--access '{"tier":"standard"}'] [--record research/access/runs/<date>-<label>-<commit>.md]
//        node research/access/run-set.mjs --rejudge .w2l/access/runs/<timestamp>
//   Env: W2L_API_URL (default http://127.0.0.1:8787)
//   --rejudge re-evaluates a finished run's saved Markdown against the current predicates in
//   tasks.v1.json, without fetching, and rewrites that run's attempts.jsonl and summary.json.
//
// Method:
//   verified       the API answered `success` or `partial` and every predicate passed. Each task
//                  carries at least one data predicate (markdownIncludes, markdownMatches,
//                  markdownCountMin, minTables, listRecordsMin, or field on a json./list. path); a status or lane check alone
//                  never makes a task verified.
//   falseSuccess   the API answered `success` and a data predicate failed: content was claimed
//                  that the task's target data does not support.
//   observed       HTTP status, status, reason, lane, channels tried, gate-related trace events.
//   intervention   what the run asked for (--access, cold or warm) and the lane and egress the
//                  answer recorded.
//   suspected      always { cause: 'unknown', confidence: 'not_isolated' } here. A run through the
//                  product changes several variables at once (headers, protocol stack, cookies,
//                  timing), so it cannot isolate why a site refused. Library-level probes may fill
//                  this in elsewhere, labelled library_probe.
//   cold / warm    --warm sends each task a second time right after the first, with maxAge 0 so it
//                  is not a cache hit; the two attempts are counted apart.
//   cost           externalCostUsd as the API reports it, null when unknown; egressCostUsd is null
//                  because nothing measures it yet. A table with any null is reported as unknown.
//   denominator    every task in the selected set, including ones the API could not answer.
//
// Each answer's Markdown is saved under .w2l/access/runs/<timestamp>/pages/ (git-ignored), so the
// predicates can be re-checked with --rejudge; the committed record holds only the fields above.

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const setFilter = flag('--set') ?? 'frozen'
const only = flag('--only')?.split(',').map((s) => s.trim())
const warm = args.includes('--warm')
const access = flag('--access') === undefined ? undefined : JSON.parse(flag('--access'))
const recordFile = flag('--record')
const rejudgeDir = flag('--rejudge')
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'

const DATA_TYPES = new Set(['markdownIncludes', 'markdownMatches', 'markdownCountMin', 'minTables', 'listRecordsMin'])
const isData = (p) => DATA_TYPES.has(p.type) || (p.type === 'field' && /^(json|list|tables)\b/.test(p.path))

const taskText = await readFile(join(here, 'tasks.v1.json'), 'utf8')
const tasksSha256 = createHash('sha256').update(taskText).digest('hex')
const taskFile = JSON.parse(taskText)
const tasks = taskFile.tasks.filter((t) => (setFilter === 'all' || t.part === setFilter) && (only === undefined || only.includes(t.id)))
for (const t of tasks) {
  if (!t.predicates.some(isData)) throw new Error(`${t.id} has no data predicate; a status check alone cannot verify a task`)
}

const sh = (cmd) => execSync(cmd, { cwd: repo }).toString().trim()
const environment = {
  commit: sh('git rev-parse --short HEAD'),
  dirty: sh('git status --porcelain --untracked-files=no') !== '',
  proxied: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy),
  proxyEnv: { HTTPS_PROXY: process.env.HTTPS_PROXY ?? null, HTTP_PROXY: process.env.HTTP_PROXY ?? null, NO_PROXY: process.env.NO_PROXY ?? null },
  api,
  tasksSha256,
  startedAt: new Date().toISOString(),
}
const runDir = rejudgeDir === undefined ? join(repo, '.w2l/access/runs', environment.startedAt.replace(/[:.]/g, '-')) : join(repo, rejudgeDir)
await mkdir(join(runDir, 'pages'), { recursive: true })
const linesFile = join(runDir, 'attempts.jsonl')

const get = (obj, path) => path.split('.').reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), obj)
const gfmTableCount = (md) => (md.match(/^\|.*\|\s*\n\|\s*:?-{3,}/gm) ?? []).length

function judge(p, doc) {
  const md = typeof doc.markdown === 'string' ? doc.markdown : ''
  switch (p.type) {
    case 'markdownIncludes': return md.includes(p.text)
    case 'markdownMatches': return new RegExp(p.pattern, p.flags ?? 'm').test(md)
    case 'markdownCountMin': return (md.match(new RegExp(p.pattern, (p.flags ?? '').replace('g', '') + 'g')) ?? []).length >= p.min
    case 'minTables': return gfmTableCount(md) >= p.min
    case 'listRecordsMin': { const r = get(doc, p.path ?? 'list.records'); return Array.isArray(r) && r.length >= p.min }
    case 'field': {
      const v = get(doc, p.path)
      if ('equals' in p) return v === p.equals
      if ('in' in p) return p.in.includes(v)
      if ('present' in p) return (v !== undefined && v !== null && v !== '') === p.present
      if ('min' in p || 'max' in p) return typeof v === 'number' && v >= (p.min ?? -Infinity) && v <= (p.max ?? Infinity)
      throw new Error(`field predicate on ${p.path} names no comparison`)
    }
    default: throw new Error(`unknown predicate type ${p.type}`)
  }
}

async function attempt(task, temperature) {
  const body = { url: task.url, ...(task.request ?? {}), maxAge: 0, ...(access === undefined ? {} : { access }) }
  const started = Date.now()
  let doc = null, apiStatus = null, error = null
  try {
    const res = await fetch(`${api}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(task.timeoutMs ?? 180_000) })
    apiStatus = res.status
    doc = await res.json()
  } catch (e) { error = String(e) }
  const wallMs = Date.now() - started
  if (typeof doc?.markdown === 'string') await writeFile(join(runDir, 'pages', `${task.id}-${temperature}.md`), doc.markdown)
  const results = doc === null ? [] : task.predicates.map((p) => ({ p, pass: (() => { try { return judge(p, doc) } catch { return false } })() }))
  const answered = doc !== null && (doc.status === 'success' || doc.status === 'partial')
  const verified = answered && results.every((r) => r.pass)
  const dataFailed = results.some((r) => isData(r.p) && !r.pass)
  const events = doc === null ? [] : [...new Set([...(doc.trace ?? []).map((t) => t.event), ...(doc.ladderTrace ?? []).map((t) => t.event)])]
  return {
    taskId: task.id, part: task.part, temperature,
    observed: {
      apiStatus, httpStatus: doc?.evidence?.httpStatus ?? null, status: doc?.status ?? null,
      reason: doc?.failureReason ?? doc?.blockReason ?? doc?.budgetExceeded ?? doc?.error?.code ?? error,
      lane: doc?.lane ?? null, channelsTried: doc?.channelsTried ?? doc?.summary?.channelsTried ?? null,
      gateEvents: events.filter((e) => /gate|blocked|challenge|quality|client_rendered|identity|robots/.test(e)),
      markdownChars: typeof doc?.markdown === 'string' ? doc.markdown.length : null,
    },
    intervention: { access: access ?? null, lane: doc?.lane ?? null, egress: doc?.evidence?.envProxy ?? null },
    outcome: {
      verified, falseSuccess: doc?.status === 'success' && dataFailed,
      failedPredicates: results.filter((r) => !r.pass).map((r) => r.p.type + (r.p.path ? `:${r.p.path}` : '')),
      wallMs, externalCostUsd: doc?.usage?.externalCostUsd ?? null, egressCostUsd: null,
      completion: verified ? 'unattended_public' : null,
    },
    suspected: { cause: 'unknown', confidence: 'not_isolated' },
    environment: { commit: environment.commit, dirty: environment.dirty, proxied: environment.proxied, at: new Date(started).toISOString() },
  }
}

const rows = []
let rejudged = null
let priorRun = null
if (rejudgeDir !== undefined) {
  // Re-check saved Markdown against the current predicates. Status, reason and timings stay as
  // the run observed them; only the predicate verdicts are recomputed.
  const byId = new Map(taskFile.tasks.map((t) => [t.id, t]))
  const old = (await readFile(linesFile, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))
  for (const row of old) {
    const task = byId.get(row.taskId)
    let markdown = null
    try { markdown = await readFile(join(runDir, 'pages', `${row.taskId}-${row.temperature}.md`), 'utf8') } catch {}
    const doc = { markdown }
    const results = row.observed.status === null ? [] : task.predicates.map((p) => ({ p, pass: (() => { try { return judge(p, doc) } catch { return false } })() }))
    const answered = row.observed.status === 'success' || row.observed.status === 'partial'
    row.outcome.verified = answered && results.length > 0 && results.every((r) => r.pass)
    row.outcome.falseSuccess = row.observed.status === 'success' && results.some((r) => isData(r.p) && !r.pass)
    row.outcome.failedPredicates = results.filter((r) => !r.pass).map((r) => r.p.type + (r.p.path ? `:${r.p.path}` : ''))
    row.outcome.completion = row.outcome.verified ? 'unattended_public' : null
    row.rejudgedAt = environment.startedAt
    rows.push(row)
  }
  await writeFile(linesFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const prior = JSON.parse(await readFile(join(runDir, 'summary.json'), 'utf8'))
  rejudged = { at: environment.startedAt, command: `node research/access/run-set.mjs ${args.join(' ')}`, commit: environment.commit, tasksSha256 }
  Object.assign(environment, prior.environment)
  environment.tasksSha256 = prior.environment.tasksSha256
  priorRun = prior
}
for (const task of rejudgeDir === undefined ? tasks : []) {
  for (const temperature of warm ? ['cold', 'warm'] : ['cold']) {
    const row = await attempt(task, temperature)
    rows.push(row)
    await appendFile(linesFile, JSON.stringify(row) + '\n')
    console.log(`${task.id} ${temperature} ${row.outcome.verified ? 'verified' : 'not verified'} ${row.observed.status ?? '-'} ${row.observed.reason ?? ''}`)
  }
}

const pct = (xs, q) => { if (xs.length === 0) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) }
const summary = (temp) => {
  const r = rows.filter((x) => x.temperature === temp)
  const costs = r.map((x) => x.outcome.externalCostUsd)
  const verifiedN = r.filter((x) => x.outcome.verified).length
  return {
    attempts: r.length, verified: verifiedN, falseSuccess: r.filter((x) => x.outcome.falseSuccess).length,
    p50Ms: pct(r.map((x) => x.outcome.wallMs), 0.5), p95Ms: pct(r.map((x) => x.outcome.wallMs), 0.95),
    externalCostPer1000VerifiedUsd: costs.some((c) => c === null) || verifiedN === 0 ? null : (costs.reduce((a, b) => a + b, 0) / verifiedN) * 1000,
    egressCostPer1000VerifiedUsd: null,
  }
}
const finishedAt = priorRun?.finishedAt ?? new Date().toISOString()
const command = priorRun?.command ?? `node research/access/run-set.mjs ${args.join(' ')}`
const hasWarm = rows.some((r) => r.temperature === 'warm')
const totals = { cold: summary('cold'), ...(hasWarm ? { warm: summary('warm') } : {}) }
await writeFile(join(runDir, 'summary.json'), JSON.stringify({ command, environment, finishedAt, set: priorRun?.set ?? setFilter, access: priorRun?.access ?? access ?? null, totals, ...(rejudged === null ? {} : { rejudged }) }, null, 2))

if (recordFile !== undefined) {
  const fmt = (v) => (v === null ? 'unknown' : String(v))
  const md = [
    `# Access task set run: ${setFilter}, ${environment.startedAt.slice(0, 10)}`, '',
    `- Command: \`${command}\``,
    ...(rejudged === null ? [] : [`- Rejudged: ${rejudged.at} against tasks.v1.json with SHA-256 \`${rejudged.tasksSha256}\` (\`${rejudged.command}\`); statuses and timings are the run's own`]),
    `- Source commit: \`${environment.commit}\`${environment.dirty ? ' (working tree had uncommitted changes)' : ''}`,
    `- Network: ${environment.proxied ? `proxied (HTTPS_PROXY=${environment.proxyEnv.HTTPS_PROXY ?? ''}, HTTP_PROXY=${environment.proxyEnv.HTTP_PROXY ?? ''}, NO_PROXY=${environment.proxyEnv.NO_PROXY ?? ''})` : 'direct'}`,
    `- API: ${api}; access option: ${access === undefined ? 'none' : `\`${JSON.stringify(access)}\``}`,
    `- Run: ${environment.startedAt} → ${finishedAt}`,
    `- Tasks: ${rows.filter((r) => r.temperature === 'cold').length} (set \`${priorRun?.set ?? setFilter}\`${only ? `, only ${only.join(', ')}` : ''}); task file SHA-256 at fetch time: ${environment.tasksSha256 === undefined ? 'not recorded (run before the hash was added)' : `\`${environment.tasksSha256}\``}; method in the header of run-set.mjs`, '',
    '| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(totals).map(([temp, t]) => `| ${temp}: ${t.attempts} | ${t.verified} | ${t.falseSuccess} | ${fmt(t.p50Ms)} | ${fmt(t.p95Ms)} | ${fmt(t.externalCostPer1000VerifiedUsd)} | ${fmt(t.egressCostPer1000VerifiedUsd)} |`), '',
    '| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.taskId} | ${r.temperature} | ${r.outcome.verified ? 'yes' : 'no'}${r.outcome.falseSuccess ? ' (false success)' : ''} | ${r.observed.status ?? '-'} | ${r.observed.reason ?? ''} | ${r.observed.httpStatus ?? ''} | ${r.observed.lane ?? ''} | ${(r.observed.channelsTried ?? []).join(' → ')} | ${r.outcome.failedPredicates.join(', ')} | ${r.outcome.wallMs} |`),
    '', 'Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).', '',
  ].join('\n')
  await mkdir(dirname(join(repo, recordFile)), { recursive: true })
  await writeFile(join(repo, recordFile), md)
}
console.log(JSON.stringify(totals))
