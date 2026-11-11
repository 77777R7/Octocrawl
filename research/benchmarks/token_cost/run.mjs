#!/usr/bin/env node
// What an agent receives for the same documentation page from four sources, saved as text for count.py:
//   raw_html       the body of a plain HTTP GET (curl), what a naive fetch tool hands over
//   rendered_html  document.documentElement.outerHTML after the page loaded in a browser (via Playwright MCP)
//   playwright_mcp every text block of Playwright MCP's browser_navigate result; this version writes the page snapshot
//                  to a file and names it, so the file is kept beside it as playwright_snapshot (what an agent reads next)
//   fetch_mcp      every text block of the reference Fetch MCP server's fetch answers (Markdown by default), first
//                  answer then start_index pages while it says the content was cut, as an agent reads the whole page
//   octocrawl_mcp  every text block of Octocrawl's local MCP scrape answers with default options: the first answer, then
//                  the same scrape with markdownOffset while the answer says it was cut, as an agent reads the whole page
// Usage: node research/benchmarks/token_cost/run.mjs --out <dir> [--proxy http://127.0.0.1:7890] [--playwright-mcp 0.0.83] [--fetch-mcp 2026.10.24] [--fetch-allow-private-ips]
// Octocrawl's MCP talks to the local API at W2L_API_URL (default http://127.0.0.1:8787): start it first (npm run api).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execFile } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback }
const out = arg('--out')
if (!out) { console.error('--out <dir> is required'); process.exit(2) }
const proxy = arg('--proxy')
const pwVersion = arg('--playwright-mcp', '0.0.83')
const fetchVersion = arg('--fetch-mcp', '2026.10.24')
const { urls } = JSON.parse(await readFile(join(here, 'urls.json'), 'utf8'))
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const text = (result) => (result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))])

async function connect(command, args, env) {
  const client = new Client({ name: 'octocrawl-token-cost', version: '1' })
  await client.connect(new StdioClientTransport({ command, args, env: { ...process.env, ...env }, stderr: 'ignore' }))
  return client
}

const pwDir = join(out, '_playwright')
await mkdir(pwDir, { recursive: true })
const pwArgs = ['-y', `@playwright/mcp@${pwVersion}`, '--headless', '--isolated', `--output-dir=${pwDir}`, ...(proxy ? [`--proxy-server=${proxy}`] : [])]
const playwright = await connect('npx', pwArgs, {})
const { copyFile, access } = await import('node:fs/promises')
const { resolve } = await import('node:path')
async function snapshotFile(t) {
  const m = t.match(/\[Snapshot\]\(([^)]+)\)/)
  if (!m) return null
  for (const base of [pwDir, process.cwd()]) { const p = resolve(base, m[1]); try { await access(p); return p } catch {} }
  try { const p = resolve(pwDir, m[1].split('/').pop()); await access(p); return p } catch { return null }
}
// --fetch-allow-private-ips: a proxy with fake-IP DNS (Clash) resolves every host to 198.18.0.0/15, which the Fetch MCP
// server refuses as a private address; the flag lets it fetch through such a proxy. Say in the record when it was used.
const fetchPrivate = process.argv.includes('--fetch-allow-private-ips')
const fetchMcp = await connect('uvx', [`mcp-server-fetch==${fetchVersion}`, ...(proxy ? [`--proxy-url=${proxy}`] : []), ...(fetchPrivate ? ['--allow-private-ips'] : [])], {})
const octocrawl = await connect(process.execPath, [join(here, '../../../packages/mcp/dist/stdio.js')], {})
const octoTools = (await octocrawl.listTools()).tools.map((t) => t.name)
if (!octoTools.includes('scrape')) throw new Error(`Octocrawl MCP has no scrape tool: ${octoTools.join(', ')}`)

const meta = { startedAt: new Date().toISOString(), proxy: proxy ?? null, playwrightMcp: pwVersion, fetchMcp: fetchVersion, fetchAllowPrivateIps: fetchPrivate, node: process.version, urls: [] }
for (const [i, url] of urls.entries()) {
  const id = String(i + 1).padStart(2, '0')
  const dir = join(out, id)
  await mkdir(dir, { recursive: true })
  const row = { id, url, arms: {} }
  // raw HTML over plain HTTP
  try {
    const { stdout } = await run('curl', ['-sSL', '--compressed', '--max-time', '45', '-A', UA, ...(proxy ? ['-x', proxy] : []), '-o', join(dir, 'raw_html.txt'), '-w', '%{http_code} %{url_effective}', url], { maxBuffer: 1 << 20 })
    const [code, final] = stdout.split(' ')
    row.arms.raw_html = { ok: code.startsWith('2'), httpStatus: Number(code), finalUrl: final }
  } catch (e) { row.arms.raw_html = { ok: false, error: String(e.message).slice(0, 300) } }
  // Playwright MCP: navigate (its answer includes the page snapshot), then the rendered DOM
  try {
    const nav = await withTimeout(playwright.callTool({ name: 'browser_navigate', arguments: { url } }), 120_000, 'browser_navigate')
    await writeFile(join(dir, 'playwright_mcp.txt'), text(nav))
    const snap = await snapshotFile(text(nav))
    if (snap) await copyFile(snap, join(dir, 'playwright_snapshot.txt'))
    row.arms.playwright_mcp = { ok: !nav.isError, isError: Boolean(nav.isError), snapshotInline: !snap && /### Page state|```yaml/.test(text(nav)), snapshotFile: snap }
    const ev = await withTimeout(playwright.callTool({ name: 'browser_evaluate', arguments: { function: '() => document.documentElement.outerHTML' } }), 60_000, 'browser_evaluate')
    const t = text(ev)
    const m = t.match(/### Result\s*\n([\s\S]*?)(\n###|$)/)
    let html = t
    try { if (m) html = JSON.parse(m[1].trim()) } catch {}
    await writeFile(join(dir, 'rendered_html.txt'), html)
    row.arms.rendered_html = { ok: !ev.isError && html.length > 0, parsedFromResult: Boolean(m) }
  } catch (e) { row.arms.playwright_mcp ??= { ok: false, error: String(e.message).slice(0, 300) }; row.arms.rendered_html ??= { ok: false, error: String(e.message).slice(0, 300) } }
  // reference Fetch MCP, default options, paged with start_index
  try {
    const answers = []; let start
    for (let n = 0; n < 80; n++) {
      const res = await withTimeout(fetchMcp.callTool({ name: 'fetch', arguments: start === undefined ? { url } : { url, start_index: start } }), 120_000, 'fetch')
      const t = text(res); answers.push(t)
      if (res.isError) { row.arms.fetch_mcp = { ok: false, isError: true, answers: answers.length, error: t.slice(0, 300) }; break }
      const m = t.match(/start_index of (\d+)/)
      if (!m) { row.arms.fetch_mcp = { ok: true, answers: answers.length }; break }
      start = Number(m[1])
    }
    await writeFile(join(dir, 'fetch_mcp.txt'), answers.join('\n'))
  } catch (e) { row.arms.fetch_mcp = { ok: false, error: String(e.message).slice(0, 300) } }
  // Octocrawl local MCP scrape, default options
  try {
    const answers = []; let md = ''; let offset; let sc0 = null
    for (let n = 0; n < 20; n++) {
      const res = await withTimeout(octocrawl.callTool({ name: 'scrape', arguments: offset === undefined ? { url } : { url, markdownOffset: offset } }), 180_000, 'scrape')
      answers.push(text(res))
      const sc = res.structuredContent ?? null
      sc0 ??= sc
      if (res.isError || !sc) break
      if (typeof sc.markdown === 'string') md += sc.markdown
      if (!sc.truncated || typeof sc.truncatedAt !== 'number' || sc.truncatedAt <= (offset ?? 0)) break
      offset = sc.truncatedAt
    }
    await writeFile(join(dir, 'octocrawl_mcp_first.txt'), answers[0] ?? '')
    await writeFile(join(dir, 'octocrawl_mcp.txt'), answers.join('\n'))
    await writeFile(join(dir, 'octocrawl_markdown.txt'), md)
    if (sc0) await writeFile(join(dir, 'octocrawl_structured_first.json'), JSON.stringify(sc0))
    row.arms.octocrawl_mcp = { ok: sc0?.status === 'success', status: sc0?.status ?? null, answers: answers.length, truncatedFirst: Boolean(sc0?.truncated) }
  } catch (e) { row.arms.octocrawl_mcp = { ok: false, error: String(e.message).slice(0, 300) } }
  meta.urls.push(row)
  console.log(id, url, Object.entries(row.arms).map(([k, v]) => `${k}:${v.ok ? 'ok' : 'FAIL'}`).join(' '))
}
meta.endedAt = new Date().toISOString()
await writeFile(join(out, 'run.json'), JSON.stringify(meta, null, 2))
await playwright.close()
await octocrawl.close()
await fetchMcp.close()
