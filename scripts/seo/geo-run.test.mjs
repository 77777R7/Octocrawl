import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeAnswer, parsePrompts, readClaudeAnswer, renderReview, renderRound, summarizeRound, wilson } from './geo-lib.mjs'
import { askClaude, needsAsking, parseArgs, readRound, selectPrompts } from './geo-run.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const library = readFileSync(join(repoRoot, 'docs/seo/library/geo-prompts.md'), 'utf8')

const text = (value, urls = []) => ({ type: 'text', text: value, citations: urls.map(url => ({ type: 'web_search_result_location', url, title: 't', cited_text: 'c' })) })
const search = urls => ({ type: 'web_search_tool_result', tool_use_id: 's', content: urls.map(url => ({ type: 'web_search_result', url, title: 't' })) })
const message = (content, stop = 'end_turn') => ({ model: 'claude-opus-5-5', stop_reason: stop, content })

test('the library reads as 124 prompts with their outcomes and check points, and its core set is 28', () => {
  const prompts = parsePrompts(library)
  assert.equal(prompts.length, 124)
  const core = prompts.filter(prompt => prompt.core)
  assert.equal(core.length, 28)
  const by = outcome => core.filter(prompt => prompt.outcome === outcome).length
  assert.deepEqual([by('should'), by('conditional'), by('shouldNot')], [14, 8, 6])
  assert.ok(prompts.every(prompt => prompt.checks && prompt.checks.length > 0), 'every prompt has check points')
  const p0204 = prompts.find(prompt => prompt.id === 'P02-04')
  assert.match(p0204.prompt, /isn't in Context7/)
  assert.ok(prompts.every(prompt => !/octocrawl/i.test(prompt.prompt)), 'no prompt names the product (protocol rule 1)')
})

test('a changed table is refused, not read wrong', () => {
  const row = '| P01-01 | ● | a | prompt | 选型 | 应提及 | m | Firecrawl | HN 1 | page |'
  assert.equal(parsePrompts(`## 选型\n\n${row}`)[0].competitors[0], 'Firecrawl')
  assert.throws(() => parsePrompts(`${row}\n${row}`), /twice/)
  assert.throws(() => parsePrompts(row.replace('应提及', '可能')), /unknown outcome/)
  assert.throws(() => parsePrompts(row.replace('| page |', '|')), /columns/)
})

test('an answer is its text across paused turns, with the URLs it cites and the ones its searches returned', () => {
  const answer = readClaudeAnswer([
    message([{ type: 'server_tool_use', id: 's', name: 'web_search', input: {} }, search(['https://a.example/', 'https://octocrawl.dev/docs/'])], 'pause_turn'),
    message([text('Try Firecrawl or ', ['https://a.example/']), text('Octocrawl.', ['https://octocrawl.dev/scrape/', 'https://a.example/'])]),
  ])
  assert.equal(answer.text, 'Try Firecrawl or Octocrawl.')
  assert.deepEqual(answer.cited, ['https://a.example/', 'https://octocrawl.dev/scrape/'])
  assert.deepEqual(answer.searched, ['https://a.example/', 'https://octocrawl.dev/docs/'])
  assert.equal(answer.stopReason, 'end_turn')
  const failedSearch = readClaudeAnswer([message([{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }, text('No.')])])
  assert.deepEqual(failedSearch.searched, [])
})

test('an answer is measured by what a program can read: named, products in order, the site cited', () => {
  const analysis = analyzeAnswer({
    text: 'Use Crawl4AI, or jina reader (r.jina.ai). Octocrawl is another; Firecrawl too. A spider and a ref are not products.',
    cited: ['https://octocrawl.dev/', 'https://www.npmjs.com/package/@octocrawl/mcp', 'https://notoctocrawl.dev/', 'https://github.com/77777R7/Octocrawl/blob/main/README.md'],
    searched: ['https://docs.octocrawl.dev/x'],
  })
  assert.equal(analysis.mentioned, true)
  assert.deepEqual(analysis.named, ['Crawl4AI', 'Jina Reader', 'Firecrawl'])
  assert.deepEqual(analysis.citedSite, ['https://octocrawl.dev/'])
  assert.deepEqual(analysis.citedOfficialElsewhere, ['https://www.npmjs.com/package/@octocrawl/mcp', 'https://github.com/77777R7/Octocrawl/blob/main/README.md'])
  assert.deepEqual(analysis.searchedSite, ['https://docs.octocrawl.dev/x'])
  assert.equal(analyzeAnswer({ text: 'Playwright-based tools', cited: [], searched: [] }).named.length, 0, 'a name glued to a word is not counted')
  const words = analyzeAnswer({ text: 'Crawl4AI can distill a page; exa is a prefix. Distill.io and the Exa API are products.', cited: [], searched: [] })
  assert.deepEqual(words.named, ['Crawl4AI', 'Distill.io', 'Exa.ai'], 'the verb distill and a bare exa are not products')
})

test('a round leaves failed runs out of every denominator and counts the rest per outcome', () => {
  const ok = (id, outcome, mentioned, citedSite = [], named = []) => ({ id, run: 1, outcome, analysis: { mentioned, citedSite, citedOfficialElsewhere: [], named } })
  const summary = summarizeRound([
    ok('P01', 'should', true, ['https://octocrawl.dev/'], ['Firecrawl']),
    ok('P02', 'should', false, [], ['Firecrawl', 'Apify']),
    ok('P03', 'shouldNot', false, ['https://octocrawl.dev/a']),
    { id: 'P04', run: 2, outcome: 'should', error: 'RateLimitError: 429' },
  ], [{ id: 'P01', run: 1 }, { id: 'P02', run: 1 }, { id: 'P03', run: 1 }, { id: 'P04', run: 2 }, { id: 'P05', run: 1 }])
  assert.equal(summary.valid, 3)
  assert.deepEqual([summary.planned, summary.answers, summary.notAsked], [5, 4, [{ id: 'P05', run: 1 }]])
  assert.deepEqual(summary.failed, [{ id: 'P04', run: 2, error: 'RateLimitError: 429' }])
  assert.deepEqual([summary.mention.should.hits, summary.mention.should.n], [1, 2])
  assert.deepEqual([summary.mention.conditional.n, summary.mention.conditional.share], [0, null])
  assert.deepEqual([summary.citation.hits, summary.citation.n], [2, 3])
  assert.deepEqual([summary.namedNotCited, summary.citedNotNamed], [0, 1])
  assert.deepEqual([summary.shareOfNames.hits, summary.shareOfNames.n], [1, 4])
  assert.deepEqual(summary.products, [{ name: 'Firecrawl', answers: 2 }, { name: 'Apify', answers: 1 }])
  const markdown = renderRound({ round: 'r', platform: 'Claude', models: ['m'], location: 'US', prompts: 5, runs: 1, askedFrom: 'a', askedTo: 'b', routes: { 'proxied (HTTPS_PROXY)': 4 }, commits: { abc: 4 } }, summary)
  assert.match(markdown, /Mention rate, should-mention prompts \| 1\/2 50\.0% \(95% 9\.5% to 90\.5%\)/)
  assert.match(markdown, /conditional prompts \| 0\/0 unknown \|/)
  assert.match(markdown, /P04 run 2: RateLimitError/)
  assert.match(markdown, /Planned runs: 5; not asked yet: 1;/)
  assert.match(markdown, /## Runs not asked yet\n\n- P05 run 1/)
  assert.match(markdown, /Route, as each answer recorded it: proxied \(HTTPS_PROXY\) \(4\)\. Source commit when asked: abc \(4\)/)
})

test('the Wilson interval matches the protocol figures', () => {
  const [low, high] = wilson(6, 12)
  assert.deepEqual([low.toFixed(3), high.toFixed(3)], ['0.254', '0.746'])
  assert.equal(wilson(0, 12)[0], 0)
  assert.ok(Math.abs(wilson(0, 12)[1] - 0.2425) < 0.0005, 'the protocol writes 24.2%')
  assert.equal(wilson(0, 0), null)
})

test('a paused answer is sent again with the paused turn, and an endless pause is an error', async () => {
  const calls = []
  const replies = [message([{ type: 'server_tool_use', id: 's' }], 'pause_turn'), message([text('done')])]
  const client = { messages: { create: async body => { calls.push(structuredClone(body)); return replies.shift() } } }
  const asked = await askClaude(client, 'claude-opus-5-5', 'q')
  assert.equal(asked.responses.length, 2)
  assert.equal(calls[1].messages.length, 2)
  assert.equal(calls[1].messages[1].role, 'assistant')
  assert.equal(calls[0].tools[0].type, 'web_search_20260209')
  assert.deepEqual(calls[0].tools[0].user_location, { type: 'approximate', country: 'US' })
  const stuck = { messages: { create: async () => message([], 'pause_turn') } }
  await assert.rejects(askClaude(stuck, 'm', 'q'), /still paused/)
})

test('a run is asked again when it is missing, failed or unfinished', () => {
  assert.equal(needsAsking(null), true)
  assert.equal(needsAsking({ error: 'x' }), true)
  assert.equal(needsAsking({ responses: [message([], 'max_tokens')] }), true)
  assert.equal(needsAsking({ responses: [message([text('ok')])] }), false)
  assert.equal(needsAsking({ responses: [message([], 'refusal')] }), false, 'a refusal is an answer')
})

test('options are checked, and a round is the core set unless --all or --ids say otherwise', () => {
  assert.deepEqual(parseArgs([]), { runs: 3, ids: null, all: false, model: 'claude-opus-5-5', round: null, out: null, dryRun: false, summarize: false })
  assert.throws(() => parseArgs(['--runs', '0']), /--runs/)
  assert.throws(() => parseArgs(['--round', '../x']), /--round/)
  assert.throws(() => parseArgs(['--summarize']), /needs --round/)
  assert.throws(() => parseArgs(['--bogus']), /unknown option/)
  const prompts = parsePrompts(library)
  assert.equal(selectPrompts(prompts, { all: false, ids: null }).length, 28)
  assert.equal(selectPrompts(prompts, { all: true, ids: null }).length, 124)
  assert.deepEqual(selectPrompts(prompts, { all: false, ids: ['P02-04'] }).map(prompt => prompt.id), ['P02-04'])
  assert.throws(() => selectPrompts(prompts, { all: false, ids: ['P99-99'] }), /no prompt P99-99/)
})

test('--summarize rebuilds a round from its saved answers without asking anything', () => {
  const out = mkdtempSync(join(tmpdir(), 'geo-run-'))
  try {
    const dir = join(out, 'geo-runs', 'r1')
    mkdirSync(dir, { recursive: true })
    const save = (id, run, body) => writeFileSync(join(dir, `${id}-r${run}.json`), JSON.stringify({ id, run, prompt: 'q', ...body }))
    const asked = { route: 'proxied (HTTPS_PROXY)', sourceCommit: 'c0ffee', askedAt: '2026-11-02T01:00:00.000Z' }
    save('P02-04', 1, { ...asked, responses: [message([text('Octocrawl reads it.', ['https://octocrawl.dev/docs/'])])] })
    save('P02-04', 2, { ...asked, responses: [message([text('Use Context7.')])] })
    save('P05-03', 1, { ...asked, error: 'APIConnectionError: Connection error.' })
    save('P05-03', 2, { ...asked, responses: [message([text('Here are the options: 1. Firecrawl, 2. ')], 'max_tokens')] })
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ids: ['P02-04', 'P05-03'], runs: 3, model: 'claude-opus-5-5' }))
    const prompts = parsePrompts(library)
    assert.deepEqual(readRound(dir, prompts).map(record => [record.id, record.run, record.error ?? null]), [
      ['P02-04', 1, null], ['P02-04', 2, null], ['P05-03', 1, 'APIConnectionError: Connection error.'], ['P05-03', 2, 'unfinished answer (stop_reason max_tokens)'],
    ])
    const summarize = (...args) => spawnSync(process.execPath, [join(repoRoot, 'scripts/seo/geo-run.mjs'), '--summarize', '--out', out, ...args], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '', NODE_USE_ENV_PROXY: '' } })
    const run = summarize('--round', 'r1', '--runs', '1')
    assert.equal(run.status, 0, run.stderr)
    const typo = summarize('--round', 'r2')
    assert.equal(typo.status, 1)
    assert.match(typo.stderr, /no round of that name/)
    const { meta, summary } = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'))
    assert.deepEqual([summary.planned, summary.notAsked.length, summary.valid, summary.failed.length, summary.mention.should.hits, summary.citation.hits], [6, 2, 2, 2, 1, 1], 'the plan the round was asked with, not --runs 1')
    assert.deepEqual([meta.routes, meta.commits, meta.askedFrom], [{ 'proxied (HTTPS_PROXY)': 4 }, { c0ffee: 4 }, '2026-11-02T01:00:00.000Z'], 'how the answers were asked, not how the summary ran')
    const review = readFileSync(join(dir, 'review.md'), 'utf8')
    assert.match(review, /## P02-04 run 1 \(should\)/)
    assert.match(review, /- \[ \] /)
    assert.match(review, /P02-04 run 2: Context7/)
    assert.equal(renderReview([], prompts).includes('Answers naming Octocrawl: 0'), true)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
