// E2 harness, as run 2026-10-18 for research/hosted/2026-10-18-mcp-e2-w7-w10.md (docs/mcp-client-ux-tasks.md E2): fixed tasks in Claude Code (claude -p) and Codex (codex exec),
// @octocrawl/mcp 0.6.0 vs 0.7.0 locally and hosted h20v060 vs h23v070. Kept so the round can be run again; results land next to it.
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = new URL('.', import.meta.url).pathname
const OUT = join(DIR, 'runs')
mkdirSync(OUT, { recursive: true })
const API = 'http://127.0.0.1:8787'
const FIX = 'http://127.0.0.1:8796'
const DEAD = 'http://127.0.0.1:8799'
const HOSTED = { v060: 'https://h20v060---octocrawl-api-c7fpmz73tq-as.a.run.app/mcp', v070: 'https://h23v070---octocrawl-api-c7fpmz73tq-as.a.run.app/mcp' }
const BIN = (v) => join(DIR, v, 'node_modules/@octocrawl/mcp/dist/stdio.js')
const CODEX_HOME = join(DIR, 'codexhome')

// A page far over any result budget: 300 sections.
const WORDS = ['Amber', 'Basalt', 'Cobalt', 'Dune', 'Ember', 'Fjord', 'Garnet', 'Harbor', 'Iris', 'Jade']
const BIG = `<!doctype html><html><head><title>Field notes</title></head><body><main><h1>Field notes</h1>${Array.from({ length: 300 }, (_, i) => `<section><h2>Section ${i + 1}: ${WORDS[i % 10]}</h2><p>${`Observation ${i + 1} describes the tide, the light and the stones along the shore in plain words. `.repeat(8)}</p></section>`).join('')}</main></body></html>`

/** A proxy in front of the local API that injects one fault, and serves the big page. */
function faultProxy(mode) {
  const state = { mode, crawlPosts: 0, crawlTasks: new Set(), replayed: 0, injected: 0 }
  const server = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    if (req.url === '/big.html') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(BIG)
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (state.mode === 'ratelimit-once' && req.url.startsWith('/v1/scrape') && state.injected === 0) {
        state.injected++
        return void res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3' }).end(JSON.stringify({ error: 'rate limited: too many requests', code: 'rate_limited' }))
      }
      const up = httpRequest(API + req.url, { method: req.method, headers: { ...req.headers, host: '127.0.0.1:8787' } }, (r) => {
        const out = []
        r.on('data', (c) => out.push(c))
        r.on('end', () => {
          const text = Buffer.concat(out)
          if (req.method === 'POST' && req.url === '/v1/crawl') {
            state.crawlPosts++
            try { const j = JSON.parse(text); if (j.taskId) state.crawlTasks.add(j.taskId); if (j.replayed) state.replayed++ } catch {}
            if (state.mode === 'crawl-504-once' && state.injected === 0) {
              state.injected++
              return void res.writeHead(504, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'gateway timeout while starting the crawl' }))
            }
          }
          res.writeHead(r.statusCode, r.headers).end(text)
        })
      })
      up.on('error', (e) => res.writeHead(502).end(String(e)))
      up.end(body)
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((d) => { server.closeAllConnections(); server.close(() => d()) }) })))
}

/** Crawl starts with different options (a corrected scope is a new crawl); the same options twice is a duplicate. */
const distinctCrawls = (calls) => Math.max(1, new Set(calls.filter((c) => c.tool === 'crawl').map((c) => { const { idempotencyKey, ...rest } = c.args ?? {}; return JSON.stringify(Object.entries(rest).sort()) })).size)
const has = (text, ...needles) => needles.every((n) => (n instanceof RegExp ? n.test(text) : text.toLowerCase().includes(n.toLowerCase())))
const QUOTES = Array.from({ length: 10 }, (_, i) => `https://quotes.toscrape.com/page/${i + 1}/`)
const BOOKS = Array.from({ length: 10 }, (_, i) => `https://books.toscrape.com/catalogue/page-${i + 1}.html`)

/** The frozen task set. Each check sees the final answer and the octocrawl calls; proxy is the run's fault proxy state. */
const TASKS = {
  a: { first: ['scrape'], prompt: () => `Read ${FIX}/static/article as Markdown and tell me its main heading and its first sentence.`,
    check: ({ answer }) => ({ pass: has(answer, 'Kiln temperatures and glaze vitrification', '1240') }) },
  b: { first: ['map'], prompt: () => 'List the URLs of the documentation site https://docs.python.org/3/ (up to 50 of them), without reading each page.',
    check: ({ answer }) => { const n = new Set(answer.match(/https:\/\/docs\.python\.org\/3\/[^\s)\]>"'`]*/g) ?? []).size; return { pass: n >= 10, note: `${n} urls` } } },
  c: { first: ['batch_scrape'], prompt: () => `Here are 20 pages:\n${[...QUOTES, ...BOOKS].join('\n')}\nRead all of them and tell me the total number of items (quotes on the quotes pages plus books on the book pages) across the 20 pages.`,
    check: ({ answer }) => ({ pass: /\b300\b/.test(answer) }) },
  d: { first: ['crawl'], fault: 'crawl-504-once', prompt: () => `Crawl the catalog at ${FIX}/crawl/listing and the item pages it links to (at most 10 pages), then summarise each page in one line.`,
    check: ({ answer, proxy, calls }) => ({ pass: proxy.crawlTasks.size <= distinctCrawls(calls) && has(answer, /teapot 1/i, /teapot 2/i, /teapot 3/i), recovered: proxy.crawlTasks.size >= 1 && has(answer, /teapot 1/i), note: `crawl POSTs ${proxy.crawlPosts}, tasks ${proxy.crawlTasks.size}, replayed ${proxy.replayed}` }) },
  e: { first: ['scrape'], prompt: () => 'Check that https://quotes.toscrape.com/ shows at least 10 quotes. Have the server verify it with a check rather than counting yourself, and tell me whether the check passed.',
    check: ({ answer, calls }) => { const verified = calls.some((c) => c.args?.verify && /"status"\s*:\s*"passed"/.test(c.text ?? '') && /"verification"/.test(c.text ?? '')); return { pass: verified && has(answer, /pass/i) } } },
  f: { first: ['scrape'], prompt: () => 'From https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html extract the title, price and availability as JSON.',
    check: ({ answer }) => ({ pass: has(answer, 'A Light in the Attic', '51.77') }) },
  g: { first: ['scrape'], hosted: true, prompt: () => 'Open https://example.com/ , click the "More information" link on it first, then give me the text of the page you land on.',
    check: ({ answer }) => { const said = /(not (available|supported|offered|possible)|can(no|')t|unable|doesn.t (support|offer|allow)|no (page )?actions|local server|npx octocrawl serve|refus|isn.t (available|supported))/i.test(answer); const claimed = /\bI (clicked|followed)\b/i.test(answer) && !said; return { pass: said && !claimed, falseSuccess: claimed } } },
  h: { first: ['scrape'], base: DEAD, prompt: () => `Read ${FIX}/static/article and give me its main heading.`,
    check: ({ answer }) => ({ pass: has(answer, 'npx octocrawl serve'), falseSuccess: has(answer, 'Kiln temperatures') }) },
  i: { first: ['get_crawl', 'wait_crawl'], prompt: () => 'What is the status of the crawl with id 3f9e1c2a-0000-4000-8000-000000000000? Use the crawl tools.',
    check: ({ answer }) => { const unknown = /(not found|not_found|unknown|doesn.t exist|does not exist|no (such )?crawl|isn.t known|not known|no record|recogni[sz]e)/i.test(answer); const claimed = /\b(status (is|was)|it is|it's) (completed|running|failed|pending|cancelled)\b/i.test(answer) && !unknown; return { pass: unknown, falseSuccess: claimed } } },
  j: { first: ['scrape'], fault: 'ratelimit-once', prompt: () => `Read ${FIX}/static/article and give me its main heading.`,
    check: ({ answer, proxy }) => ({ pass: has(answer, 'Kiln temperatures and glaze vitrification') && proxy.injected === 1, recovered: has(answer, 'Kiln temperatures') }) },
  k: { first: ['scrape'], fault: 'pass', prompt: (proxyUrl) => `On ${proxyUrl}/big.html, how many sections are there, and what is the title of the last one?`,
    check: ({ answer }) => { const ok = /\b300\b/.test(answer) && /Section 300:\s*Jade/i.test(answer); const honest = /(truncat|cut|budget|partial|too (large|long|big))/i.test(answer); return { pass: ok, falseSuccess: !ok && !honest } } },
  l: { first: ['scrape'], prompt: () => `Read ${FIX}/block/challenge and give me the page's main text.`,
    check: ({ answer, calls }) => { const blocked = /(block|challenge|captcha|bot check|cloudflare|verification (screen|page|check)|just a moment)/i.test(answer); const same = calls.filter((c) => c.tool === 'scrape' && String(c.args?.url ?? '').includes('/block/challenge')).length; return { pass: blocked && same <= 3, note: `${same} scrapes of the URL` } } },
}

function mcpFor(version, task, base) {
  if (task.hosted) return { http: HOSTED[version] }
  return { command: 'node', args: [BIN(version), '--base-url', base] }
}

function claudeRun(prompt, mcp, cwd) {
  const config = join(cwd, 'mcp.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { octocrawl: mcp.http ? { type: 'http', url: mcp.http } : { command: mcp.command, args: mcp.args } } }))
  return ['claude', ['-p', prompt, '--mcp-config', config, '--strict-mcp-config', '--allowedTools', 'mcp__octocrawl,Read', '--disallowedTools', 'WebFetch,WebSearch,Bash', '--output-format', 'stream-json', '--verbose'], {}]
}

function codexRun(prompt, mcp) {
  const server = mcp.http ? [`mcp_servers.octocrawl.url=${JSON.stringify(mcp.http)}`] : [`mcp_servers.octocrawl.command=${JSON.stringify(mcp.command)}`, `mcp_servers.octocrawl.args=${JSON.stringify(mcp.args)}`]
  const c = [...server, 'mcp_servers.octocrawl.default_tools_approval_mode="approve"', 'mcp_servers.octocrawl.tool_timeout_sec=300']
  return ['codex', ['exec', '--json', '--ephemeral', '--skip-git-repo-check', ...c.flatMap((x) => ['-c', x]), prompt], { CODEX_HOME }]
}

function parseClaude(lines) {
  const calls = []; const byId = new Map(); let answer = ''; let meta = {}
  for (const line of lines) {
    let e; try { e = JSON.parse(line) } catch { continue }
    if (e.type === 'system' && e.subtype === 'init') meta.model = e.model
    if (e.type === 'assistant') for (const c of e.message.content) if (c.type === 'tool_use') { const call = { tool: c.name.replace(/^mcp__octocrawl__/, ''), mcp: c.name.startsWith('mcp__octocrawl__'), args: c.input }; calls.push(call); byId.set(c.id, call) }
    if (e.type === 'user') for (const c of e.message.content ?? []) if (c.type === 'tool_result') { const call = byId.get(c.tool_use_id); if (call) { call.text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join(''); call.isError = c.is_error === true } }
    if (e.type === 'result') { answer = e.result ?? ''; meta = { ...meta, turns: e.num_turns, costUsd: e.total_cost_usd, subtype: e.subtype } }
  }
  return { calls, answer, meta }
}

function parseCodex(lines) {
  const calls = []; let answer = ''; const meta = {}
  for (const line of lines) {
    let e; try { e = JSON.parse(line) } catch { continue }
    const it = e.item ?? {}
    if (e.type === 'item.completed' && it.type === 'mcp_tool_call') calls.push({ tool: it.tool, mcp: it.server === 'octocrawl', args: it.arguments, text: it.result ? (it.result.content ?? []).map((x) => x.text ?? '').join('') : String(it.error?.message ?? ''), isError: it.status === 'failed' || it.result?.isError === true })
    if (e.type === 'item.completed' && it.type === 'command_execution') calls.push({ tool: 'shell', mcp: false, args: { command: it.command }, text: it.aggregated_output ?? '' })
    if (e.type === 'item.completed' && it.type === 'agent_message') answer = it.text
    if (e.type === 'turn.completed') meta.usage = e.usage
  }
  return { calls, answer, meta }
}

async function runOne({ client, version, key, rep }) {
  const task = TASKS[key]
  const id = `${client}-${version}-${key}-${rep}`
  const cwd = join(OUT, id); mkdirSync(cwd, { recursive: true })
  const proxy = task.fault ? await faultProxy(task.fault) : null
  const base = task.base ?? proxy?.url ?? API
  const prompt = task.prompt(proxy?.url)
  const mcp = mcpFor(version, task, base)
  const [cmd, args, env] = client === 'claude' ? claudeRun(prompt, mcp, cwd) : codexRun(prompt, mcp)
  const started = Date.now()
  const out = await new Promise((resolve) => {
    const env2 = { ...process.env, ...env }
    for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) delete env2[k]
    const child = spawn(cmd, args, { cwd, env: env2, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    const kill = setTimeout(() => child.kill('SIGTERM'), 15 * 60_000)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (code) => { clearTimeout(kill); resolve({ stdout, stderr, code }) })
  })
  const durationMs = Date.now() - started
  writeFileSync(join(cwd, 'stdout.jsonl'), out.stdout); writeFileSync(join(cwd, 'stderr.txt'), out.stderr)
  const parsed = (client === 'claude' ? parseClaude : parseCodex)(out.stdout.split('\n'))
  await proxy?.close()
  const mcpCalls = parsed.calls.filter((c) => c.mcp)
  const result = task.check({ answer: parsed.answer, calls: mcpCalls, proxy: proxy?.state ?? {} })
  const paramErrors = mcpCalls.filter((c) => c.isError && /(invalid_request|unsupported_parameter|unsupported_format|Invalid arguments|must be|is required|validation)/i.test(c.text ?? '')).length
  const record = {
    id, client, version, task: key, rep, exit: out.code, durationMs, pass: result.pass === true, falseSuccess: result.falseSuccess === true,
    recovered: result.recovered ?? (task.fault || task.base ? result.pass === true : null),
    firstTool: mcpCalls[0]?.tool ?? null, firstToolOk: mcpCalls[0] ? task.first.includes(mcpCalls[0].tool) : false,
    mcpCalls: mcpCalls.length, otherCalls: parsed.calls.length - mcpCalls.length, paramErrors,
    resultChars: mcpCalls.reduce((n, c) => n + (c.text ?? '').length, 0),
    citesEvidence: /(finalUrl|final URL|Evidence Record|sha256|content hash)/i.test(parsed.answer),
    note: result.note ?? null, meta: parsed.meta, answer: parsed.answer.slice(0, 4000),
  }
  writeFileSync(join(cwd, 'record.json'), JSON.stringify(record, null, 2))
  appendFileSync(join(DIR, 'results.jsonl'), JSON.stringify(record) + '\n')
  console.log(`${id} pass=${record.pass} first=${record.firstTool} calls=${record.mcpCalls} ${Math.round(durationMs / 1000)}s ${record.note ?? ''}`)
  return record
}

const READS = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'j', 'k', 'l'])
/** Scores a stored run again from its stdout (the checks changed after the run); proxy state comes from the first record. */
function rescore(old) {
  const task = TASKS[old.task]
  const lines = readFileSync(join(OUT, old.id, 'stdout.jsonl'), 'utf8').split('\n')
  const parsed = (old.client === 'claude' ? parseClaude : parseCodex)(lines)
  const mcpCalls = parsed.calls.filter((c) => c.mcp)
  const m = /crawl POSTs (\d+), tasks (\d+), replayed (\d+)/.exec(old.note ?? '')
  const proxy = { crawlPosts: m ? +m[1] : 0, crawlTasks: new Set(Array.from({ length: m ? +m[2] : 0 }, (_, i) => i)), replayed: m ? +m[3] : 0, injected: task.fault && task.fault !== 'pass' ? 1 : 0 }
  const result = task.check({ answer: parsed.answer, calls: mcpCalls, proxy })
  const read = mcpCalls.some((c) => !c.isError)
  const stdout = lines.join('\n')
  const invalid = old.task === 'g' && (/quota_exhausted/.test(stdout) || /"server":"codex_apps"/.test(stdout)) ? (/quota_exhausted/.test(stdout) ? 'hosted keyless quota exhausted' : 'Codex called its own octocrawl app connector, blocked by approval') : null
  let pass = result.pass === true; let falseSuccess = result.falseSuccess === true
  if (READS.has(old.task) && !read) { if (pass) falseSuccess = true; pass = false }
  return { ...old, pass: invalid ? false : pass, falseSuccess, invalid, read, recovered: result.recovered ?? (task.fault || task.base ? pass : null), note: result.note ?? old.note }
}
if (process.argv[2] === 'rescore') {
  const rows = readFileSync(join(DIR, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => rescore(JSON.parse(l)))
  writeFileSync(join(DIR, 'scored.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  console.log(`${rows.length} rescored`)
  process.exit(0)
}

// Usage: node harness.mjs <clients> <versions> <tasks> <reps> <concurrency>
const [clients = 'claude,codex', versions = 'v060,v070', tasks = Object.keys(TASKS).join(','), reps = '3', conc = '4'] = process.argv.slice(2)
const done = new Set(existsSync(join(DIR, 'results.jsonl')) ? readFileSync(join(DIR, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : [])
const queue = []
for (let rep = 1; rep <= Number(reps); rep++) for (const key of tasks.split(',')) for (const version of versions.split(',')) for (const client of clients.split(',')) {
  const id = `${client}-${version}-${key}-${rep}`
  if (!done.has(id)) queue.push({ client, version, key, rep })
}
console.log(`${queue.length} runs`)
await Promise.all(Array.from({ length: Number(conc) }, async () => { while (queue.length) { const job = queue.shift(); try { await runOne(job) } catch (e) { console.log('ERR', job, e) } } }))
