/** Real, installed Firecrawl SDK -> HTTP relay -> running local Octocrawl API.
 * No SDK/engine response mocks. The target web pages are explicitly synthetic.
 * Install the frozen SDK outside the repository; see docs/seo/firecrawl-client-verification.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1]
if (!args.includes('--sdk') || !args.includes('--out')) throw new Error('Required: --sdk /absolute/path/to/dist/index.js --out .w2l/.../run.json [--api http://127.0.0.1:8787]')
const sdkPath = resolve(option('--sdk'))
const api = new URL(args.includes('--api') ? option('--api') : 'http://127.0.0.1:8787')
if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname)) throw new Error('This check accepts a loopback HTTP API only')
const output = resolve(option('--out'))
const pkg = JSON.parse(await readFile(resolve(dirname(sdkPath), '../package.json'), 'utf8'))
assert.equal(pkg.name, '@mendable/firecrawl-js')
assert.equal(pkg.version, '4.42.0', 'Repository comparison is frozen at 4.42.0')
const { default: Firecrawl } = await import(pathToFileURL(sdkPath).href)
const wire = [], cases = []
let active = ''
const report = { observedAt: new Date().toISOString(), harnessSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), client: `${pkg.name}@${pkg.version}`, node: process.version, targetKind: 'synthetic HTTP fixture on loopback; API and SDK are real', wire, cases }
await mkdir(dirname(output), { recursive: true })
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n')
const listen = (server) => new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok) })
const close = (server) => new Promise((ok) => server.close(ok))
const fixture = http.createServer((req, res) => {
  if (req.url === '/robots.txt') { res.end('User-agent: *\nAllow: /\n'); return }
  if (req.url === '/missing') { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html><body><h1>Missing fixture</h1><p>This controlled URL does not exist.</p></body></html>'); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end('<!doctype html><html lang="en"><head><title>Migration fixture</title></head><body><nav>Outside navigation</nav><main><h1>Migration fixture</h1><p>Alpha is the expected content of this controlled migration example. It documents a reproducible request to a local server with an installed client library. The acceptance check compares exact content markers and link addresses rather than treating a nonempty response as proof of correctness.</p><a href="/child">Child evidence</a><p class="omit">DROP_THIS_MARKER</p></main><footer>Outside footer</footer></body></html>')
})
const relay = http.createServer(async (req, res) => {
  try {
    let body = ''; for await (const chunk of req) body += chunk
    const startedAt = new Date().toISOString()
    const response = await fetch(new URL(req.url, api), { method: req.method, headers: { 'content-type': 'application/json' }, ...(body ? { body } : {}) })
    const raw = await response.text()
    wire.push({ case: active, startedAt, method: req.method, path: req.url, body: body ? JSON.parse(body) : null, status: response.status, response: JSON.parse(raw) })
    res.writeHead(response.status, { 'content-type': 'application/json' }); res.end(raw)
  } catch (error) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })) }
})
async function check(id, invoke, accept) {
  active = id
  const first = wire.length
  let result
  try { result = { returned: await invoke() } } catch (error) { result = { thrown: { name: error.name, message: error.message, status: error.status ?? null, statusCode: error.statusCode ?? null } } }
  const record = { id, ...result, assertionsPassed: false }
  cases.push(record)
  try { accept(result, wire.slice(first)); record.assertionsPassed = true } catch (error) { record.assertionError = error.message }
  await save()
  console.log(`${id}: ${record.assertionsPassed ? 'PASS' : 'FAIL'}`)
}
try {
  await listen(fixture); await listen(relay)
  const target = `http://127.0.0.1:${fixture.address().port}`
  const sdk = new Firecrawl({ apiKey: 'local-test-only', apiUrl: `http://127.0.0.1:${relay.address().port}/fc` })
  const scrapeOptions = { formats: ['markdown', 'html', 'rawHtml', 'links'], onlyMainContent: false, includeTags: ['main'], excludeTags: ['.omit'], fastMode: true, timeout: 15000 }
  const refused = (status, code) => (result, requests) => { assert.ok(result.thrown); assert.equal(requests.at(-1).status, status); if (code) assert.equal(requests.at(-1).response.code, code) }
  await check('default-v2', () => sdk.scrape(target, { formats: ['markdown'], timeout: 15000 }), (r, w) => { refused(404, 'not_found')(r, w); assert.equal(w[0].path, '/fc/v2/scrape') })
  await check('v1-success-options', () => sdk.v1.scrapeUrl(target, scrapeOptions), (r, w) => {
    assert.equal(w[0].path, '/fc/v1/scrape'); assert.equal(r.returned.success, true)
    assert.match(r.returned.markdown, /# Migration fixture/); assert.match(r.returned.markdown, /Alpha is the expected/)
    assert.match(r.returned.markdown, new RegExp(`\\[Child evidence\\]\\(${target}/child\\)`))
    assert.doesNotMatch(r.returned.markdown, /DROP_THIS_MARKER|Outside navigation|Outside footer/)
    assert.doesNotMatch(r.returned.html, /DROP_THIS_MARKER/); assert.match(r.returned.rawHtml, /DROP_THIS_MARKER/)
    assert.ok(r.returned.links.includes(target + '/child')); assert.equal(r.returned.metadata.statusCode, 200)
    assert.equal('evidenceRecord' in r.returned, false)
  })
  await check('v1-target-404', () => sdk.v1.scrapeUrl(target + '/missing', { formats: ['markdown'], fastMode: true, timeout: 15000 }), (r, w) => {
    assert.equal(w[0].status, 200); assert.equal(w[0].response.success, false); assert.equal(w[0].response.data.metadata.statusCode, 404)
    assert.equal(w[0].response.data.metadata.error, 'http_error'); assert.ok(r.thrown)
    assert.match(r.thrown.message, /No response received/); assert.equal(r.thrown.statusCode, 0)
  })
  await check('v1-unsupported-json', () => sdk.v1.scrapeUrl(target, { formats: ['json'], timeout: 15000 }), refused(400, 'unsupported_format'))
  await check('v1-unsupported-key', () => sdk.v1.scrapeUrl(target, { formats: ['markdown'], unsupportedSeoOption: true, timeout: 15000 }), refused(400, 'unsupported_parameter'))
  await check('v1-map-options', () => sdk.v1.mapUrl(target, { ignoreSitemap: true, search: 'child', limit: 5, timeout: 15000 }), (r, w) => { assert.equal(w[0].path, '/fc/v1/map'); assert.equal(r.returned.success, true); assert.deepEqual(r.returned.links, [target + '/child']) })
  await check('v1-map-unsupported-useIndex', () => sdk.v1.mapUrl(target, { useIndex: true, timeout: 15000 }), refused(400, 'unsupported_parameter'))
  let job
  await check('v1-crawl-start', async () => { job = await sdk.v1.asyncCrawlUrl(target, { limit: 1, sitemap: 'skip', scrapeOptions: { formats: ['markdown'], fastMode: true, timeout: 15000 } }); return job }, (r, w) => { assert.equal(w[0].path, '/fc/v1/crawl'); assert.equal(r.returned.success, true); assert.ok(r.returned.id) })
  if (job?.id) {
    await check('v1-crawl-status', async () => {
      const deadline = Date.now() + 30000
      let state
      do { state = await sdk.v1.checkCrawlStatus(job.id); if (['completed', 'failed', 'cancelled'].includes(state.status)) return state; await new Promise((r) => setTimeout(r, 200)) } while (Date.now() < deadline)
      return state
    }, (r, w) => { assert.equal(r.returned.status, 'completed'); assert.equal(r.returned.completed, 1); assert.equal(r.returned.data.length, 1); assert.match(r.returned.data[0].markdown, /Alpha is the expected/); assert.equal(w.at(-1).response.expiresAt, null); assert.equal(r.returned.expiresAt.toISOString(), '1970-01-01T00:00:00.000Z') })
    await check('v1-crawl-unsupported-skip', () => sdk.v1.checkCrawlStatus(job.id, false, undefined, 0), (r, w) => { refused(400, 'unsupported_parameter')(r, w); assert.equal(r.thrown.statusCode, 500) })
  }
} finally { await close(relay); await close(fixture); await save() }
assert.equal(cases.length, 10, 'Keep failed/missing cases in the denominator')
assert.equal(cases.filter((x) => !x.assertionsPassed).length, 0, 'Inspect retained wire and SDK outcomes')
