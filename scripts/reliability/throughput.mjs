#!/usr/bin/env node
// P2 throughput benchmark: pages per minute and per-page time of the HTTP lane
// and the browser lane, through the API process, against a controlled site.
//
//   HTTP lane     W2L_WORKER_COUNT=32: a batch of 1,000 URLs over 20 hosts.
//                 Target: >= 500 pages/min and p50 < 800 ms.
//   browser lane  W2L_WORKER_COUNT=8 (8 pages, so 8 browser contexts, at once):
//                 a batch of 200 URLs over 20 hosts with waitFor 1, which starts
//                 each page at the browser rung. Target: >= 60 pages/min and p95 < 8 s.
//
// The site is on loopback (h01..h20.localhost, one dual-stack server), so the
// network is not measured: every response waits 80 to 300 ms first (spread
// evenly by page number), and every page is about 32 KB of HTML with
// paragraphs, a table and links. Per-host politeness is the API's default
// (2 at once per host, 250 ms between starts). Pages per minute is the batch's
// URLs over the time from its submission to its completed status; per-page
// time is each item's usage.wallMs (the fetch from the worker taking the URL,
// waits for the host's turn included).
// Usage: node scripts/reliability/throughput.mjs [--record <file.json>]   (npx tsc -b first)

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as netServer } from 'node:net'
import { cpus, totalmem, tmpdir, platform, release, arch } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const recordFile = process.argv.includes('--record') ? process.argv[process.argv.indexOf('--record') + 1] : null
const hostName = (h) => `h${String(h).padStart(2, '0')}.localhost`

const PARAGRAPH = 'The harbour office records tide height, wind speed and visibility for every hour of the day, checks each reading against the station log and publishes the figures each morning for the pilots who bring ships into the estuary. '
const page = (host, n) => {
  const rows = Array.from({ length: 40 }, (_, i) => `<tr><td>2026-10-${String((i % 28) + 1).padStart(2, '0')}</td><td>${(3 + (i % 9) / 10).toFixed(1)}</td><td>${10 + (i % 17)} kn</td><td><a href="/p/${(n + i) % 50 + 1}">day ${i + 1}</a></td></tr>`).join('')
  const sections = Array.from({ length: 24 }, (_, i) => `<h2>Section ${i + 1}</h2><p>${PARAGRAPH.repeat(4)}</p><ul>${Array.from({ length: 5 }, (_, j) => `<li><a href="/p/${(n + i + j) % 50 + 1}">Related reading ${j + 1}</a></li>`).join('')}</ul>`).join('')
  return `<!doctype html><html lang="en"><head><title>Tides ${n} on ${host}</title><meta name="description" content="Hourly tide readings"></head><body><nav><a href="/">Home</a> <a href="/p/1">Archive</a></nav><main><article><h1>Tides ${n} on ${host}</h1>${sections}<table><thead><tr><th>Date</th><th>Height (m)</th><th>Wind</th><th>Link</th></tr></thead><tbody>${rows}</tbody></table></article></main><footer><p>Harbour office</p></footer></body></html>`
}
const site = createServer((req, res) => {
  const host = (req.headers.host ?? '').split(':')[0]
  if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
  const n = Number(/\d+/.exec(req.url ?? '')?.[0] ?? 1)
  setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(host, n)), 80 + ((n * 37) % 221))
})
await new Promise((done) => site.listen(0, done))
const sitePort = site.address().port
const pageBytes = Buffer.byteLength(page('h01.localhost', 1))

const freePort = () => new Promise((done) => { const probe = netServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)) }) })
async function withApi(workers, run) {
  const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-throughput-'))
  const port = await freePort()
  const child = spawn(process.execPath, [join(root, 'packages', 'api', 'dist', 'cli.js')], {
    cwd: root, env: { ...process.env, W2L_TASK_ROOT: taskRoot, W2L_API_PORT: String(port), W2L_WORKER_COUNT: String(workers) }, stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const base = `http://127.0.0.1:${port}`
  try {
    for (let i = 0; i < 200 && !(await fetch(`${base}/v1/crawl/active`).then((res) => res.ok, () => false)); i++) await new Promise((done) => setTimeout(done, 50))
    return await run(base)
  } catch (error) {
    throw new Error(`${error.message}\n${stderr.slice(0, 1000)}`)
  } finally {
    const exited = new Promise((done) => child.once('exit', done))
    child.kill('SIGINT')
    await Promise.race([exited, new Promise((done) => setTimeout(done, 10_000))])
    child.kill('SIGKILL')
    await rm(taskRoot, { recursive: true, force: true }).catch(() => {})
  }
}

const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] }

async function measure(label, workers, perHost, extra, target) {
  return withApi(workers, async (base) => {
    const urls = []
    for (let h = 1; h <= 20; h++) for (let p = 1; p <= perHost; p++) urls.push(`http://${hostName(h)}:${sitePort}/p/${p}`)
    const started = performance.now()
    const accepted = await (await fetch(`${base}/v1/batches`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls, formats: ['markdown'], ...extra }) })).json()
    let report
    for (;;) {
      report = await (await fetch(`${base}/v1/batches/${accepted.taskId}`)).json()
      if (['completed', 'failed', 'cancelled'].includes(report.status)) break
      await new Promise((done) => setTimeout(done, 50))
    }
    const elapsedMs = performance.now() - started
    const items = []
    for (let cursor = null; ;) {
      const listing = await (await fetch(`${base}/v1/batches/${accepted.taskId}/items?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json()
      items.push(...listing.items)
      if (!listing.hasMore) break
      cursor = listing.nextCursor
    }
    const walls = items.map((item) => item.usage?.wallMs).filter((value) => typeof value === 'number')
    const lanes = {}
    for (const item of items) lanes[item.lane ?? 'none'] = (lanes[item.lane ?? 'none'] ?? 0) + 1
    const pagesPerMinute = (report.completed / elapsedMs) * 60_000
    const result = {
      label, workers, urls: urls.length, hosts: 20, status: report.status, completed: report.completed, succeeded: report.succeeded, failed: report.failed, lanes,
      elapsedMs: Math.round(elapsedMs), pagesPerMinute: Math.round(pagesPerMinute), wallMs: { p50: percentile(walls, 50), p95: percentile(walls, 95), max: percentile(walls, 100), measured: walls.length },
      target, meetsTarget: pagesPerMinute >= target.pagesPerMinute && (target.p50Ms === undefined || percentile(walls, 50) < target.p50Ms) && (target.p95Ms === undefined || percentile(walls, 95) < target.p95Ms),
    }
    console.log(JSON.stringify(result))
    return result
  })
}

let commit = null
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() } catch {}
const startedAt = new Date().toISOString()
const http = await measure('http lane', 32, 50, {}, { pagesPerMinute: 500, p50Ms: 800 })
const browser = await measure('browser lane', 8, 10, { waitFor: 1 }, { pagesPerMinute: 60, p95Ms: 8000 })
await new Promise((done) => site.close(done))
const record = {
  name: 'throughput', startedAt, commit, node: process.version, machine: { platform: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model ?? null, cores: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30) },
  site: { hosts: 20, responseDelayMs: '80..300', pageBytes, politeness: 'API defaults: 2 at once per host, 250 ms between starts' }, results: [http, browser],
}
if (recordFile !== null) await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`)
console.log(`http lane ${http.pagesPerMinute} pages/min, p50 ${http.wallMs.p50} ms (${http.meetsTarget ? 'meets' : 'misses'} >= 500, < 800); browser lane ${browser.pagesPerMinute} pages/min, p95 ${browser.wallMs.p95} ms (${browser.meetsTarget ? 'meets' : 'misses'} >= 60, < 8000)`)
