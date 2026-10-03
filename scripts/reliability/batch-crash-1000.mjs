#!/usr/bin/env node
// P2 batch reliability: 1,000 URLs over 20 hosts as one batch, the API process
// killed with SIGKILL mid-run, then started again on the same task root, which
// resumes the batch. Passes when nothing is lost and nothing is duplicated:
//
//   - the batch completes with requested = completed = 1000, succeeded +
//     failed = completed, and one item per URL, each URL once;
//   - a URL whose step was on disk when the process died was fetched exactly
//     once; any other URL at most twice (a fetch in flight at the kill is made
//     again), and the extra fetches are at most the engine's worker count;
//   - the kill came mid-run (some, not all, steps on disk), and the attempt it
//     cut is marked interrupted.
//
// The 20 hosts are h01.localhost .. h20.localhost on one loopback server
// (dual-stack, since *.localhost resolves to ::1 first); W2L schedules by host
// name, so each is its own host. Runs the compiled API (npx tsc -b first).
// Usage: node scripts/reliability/batch-crash-1000.mjs [--record <file.json>]

import { spawn } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HOSTS = 20
const PER_HOST = 50
const WORKERS = 8
const KILL_AT = 400
const recordFile = process.argv.includes('--record') ? process.argv[process.argv.indexOf('--record') + 1] : null
const startedAt = new Date().toISOString()

const hostName = (h) => `h${String(h).padStart(2, '0')}.localhost`
const addresses = await lookup(hostName(1), { all: true }).catch((error) => { throw new Error(`${hostName(1)} does not resolve here (${error.code}): this test needs *.localhost to resolve to loopback`) })
if (!addresses.some(({ address }) => address === '127.0.0.1' || address === '::1')) throw new Error(`${hostName(1)} resolves to ${JSON.stringify(addresses)}, not loopback`)

// The fixture: every page fetch counted by host and path, robots.txt apart; a few tens of milliseconds per page.
const hits = new Map()
const robots = new Map()
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning for the pilots. '.repeat(3)
const site = createServer((req, res) => {
  const host = (req.headers.host ?? '').split(':')[0]
  if (req.url === '/robots.txt') {
    robots.set(host, (robots.get(host) ?? 0) + 1)
    return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
  }
  const key = `${host}${req.url}`
  hits.set(key, (hits.get(key) ?? 0) + 1)
  const n = Number(/\d+/.exec(req.url ?? '')?.[0] ?? 0)
  setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    .end(`<!doctype html><html lang="en"><head><title>${key}</title></head><body><main><article><h1>Page ${n} on ${host}</h1><p>${PROSE}</p></article></main></body></html>`), 20 + (n % 5) * 10)
})
await new Promise((done) => site.listen(0, done))
const sitePort = site.address().port
const urls = []
for (let h = 1; h <= HOSTS; h++) for (let p = 1; p <= PER_HOST; p++) urls.push(`http://${hostName(h)}:${sitePort}/p/${p}`)
const keyOf = (url) => { const u = new URL(url); return `${u.hostname}${u.pathname}` }

const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-batch-crash-1000-'))
const freePort = () => new Promise((done) => { const probe = netServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)) }) })
let api = null
async function startApi() {
  const port = await freePort()
  const child = spawn(process.execPath, [join(root, 'packages', 'api', 'dist', 'cli.js')], {
    cwd: root,
    env: { ...process.env, W2L_TASK_ROOT: taskRoot, W2L_API_PORT: String(port), W2L_WORKER_COUNT: String(WORKERS), W2L_PER_HOST_CONCURRENCY: '2', W2L_PER_HOST_MIN_DELAY_MS: '1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 200; i++) {
    if (await fetch(`${base}/v1/crawl/active`).then((res) => res.ok, () => false)) return { child, base, stderr: () => stderr }
    if (child.exitCode !== null) break
    await new Promise((done) => setTimeout(done, 50))
  }
  child.kill('SIGKILL')
  throw new Error(`the API did not start: ${stderr.slice(0, 2000)}`)
}
const call = async (base, path, body) => {
  const res = await fetch(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

const checks = []
const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`) }
let summary = {}
try {
  api = await startApi()
  const { taskId } = await call(api.base, '/v1/batches', { urls })
  // Wait until the run is well under way, then kill the process outright.
  let before
  for (;;) {
    before = await call(api.base, `/v1/batches/${taskId}`)
    if (before.completed >= KILL_AT || before.status === 'completed') break
    await new Promise((done) => setTimeout(done, 20))
  }
  const exited = new Promise((done) => api.child.once('exit', done))
  api.child.kill('SIGKILL')
  await exited
  const hitsAtKill = new Map(hits)

  // What the dead process left on disk: the URLs with a recorded result.
  const db = new Database(join(taskRoot, taskId, 'checkpoint.sqlite'), { readonly: true })
  const onDisk = new Set(db.prepare('SELECT url FROM steps WHERE task_id = ? AND result_json IS NOT NULL').all(taskId).map((row) => keyOf(row.url)))
  const attemptsAtKill = db.prepare('SELECT id, status FROM attempts WHERE task_id = ? ORDER BY started_at').all(taskId)
  db.close()
  check('killed mid-run', onDisk.size > 0 && onDisk.size < urls.length, `${onDisk.size} of ${urls.length} steps on disk at the kill (status read just before: ${before.completed} completed)`)

  api = await startApi()
  let after
  const deadline = Date.now() + 180_000
  for (;;) {
    after = await call(api.base, `/v1/batches/${taskId}`)
    if (['completed', 'failed', 'cancelled'].includes(after.status) || Date.now() > deadline) break
    await new Promise((done) => setTimeout(done, 100))
  }
  const items = []
  for (let cursor = null; ;) {
    const page = await call(api.base, `/v1/batches/${taskId}/items?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    items.push(...page.items)
    if (!page.hasMore) break
    cursor = page.nextCursor
  }
  const exitedAgain = new Promise((done) => api.child.once('exit', done))
  api.child.kill('SIGKILL')
  await exitedAgain
  api = null
  const db2 = new Database(join(taskRoot, taskId, 'checkpoint.sqlite'), { readonly: true })
  const attempts = db2.prepare('SELECT id, status, pages_fetched FROM attempts WHERE task_id = ? ORDER BY started_at').all(taskId)
  db2.close()

  check('batch completed', after.status === 'completed' && after.requested === urls.length && after.completed === urls.length && after.remaining === 0, { status: after.status, requested: after.requested, completed: after.completed, remaining: after.remaining })
  check('succeeded + failed = completed', after.succeeded + after.failed === after.completed && after.failed === 0, { succeeded: after.succeeded, failed: after.failed })
  const itemKeys = items.map((item) => keyOf(item.url))
  const unique = new Set(itemKeys)
  check('one item per URL', items.length === urls.length && unique.size === urls.length && urls.every((url) => unique.has(keyOf(url))), `${items.length} items, ${unique.size} distinct URLs`)
  check('every item succeeded', items.every((item) => item.status === 'success'), `${items.filter((item) => item.status !== 'success').length} not success`)
  const counts = urls.map((url) => hits.get(keyOf(url)) ?? 0)
  const onDiskOnce = [...onDisk].every((key) => hits.get(key) === 1)
  check('a URL on disk at the kill was fetched once', onDiskOnce, `${[...onDisk].filter((key) => hits.get(key) !== 1).length} of ${onDisk.size} fetched again`)
  const extra = counts.reduce((sum, n) => sum + n, 0) - urls.length
  check('every URL fetched once or twice; extra fetches at most the worker count', counts.every((n) => n === 1 || n === 2) && extra <= WORKERS, { neverFetched: counts.filter((n) => n === 0).length, moreThanTwice: counts.filter((n) => n > 2).length, extraFetches: extra, workers: WORKERS })
  check('the cut attempt is marked interrupted', attempts.length >= 2 && attempts[0].status === 'interrupted' && attempts.at(-1).status === 'completed', attempts.map((a) => `${a.status}/${a.pages_fetched}`).join(', '))
  summary = {
    urls: urls.length, hosts: HOSTS, workers: WORKERS, killedAtCompleted: before.completed, stepsOnDiskAtKill: onDisk.size,
    fetchesBeforeKill: [...hitsAtKill.values()].reduce((sum, n) => sum + n, 0), extraFetches: extra,
    robotsFetches: [...robots.values()].reduce((sum, n) => sum + n, 0), attemptsAtKill: attemptsAtKill.map((a) => a.status), attempts: attempts.map((a) => ({ status: a.status, pagesFetched: a.pages_fetched })),
    report: { status: after.status, requested: after.requested, completed: after.completed, succeeded: after.succeeded, failed: after.failed },
  }
} catch (error) {
  check('run', false, error instanceof Error ? error.message : String(error))
} finally {
  if (api !== null) api.child.kill('SIGKILL')
  await new Promise((done) => site.close(done))
  await rm(taskRoot, { recursive: true, force: true }).catch(() => {})
}
const passed = checks.every((c) => c.pass)
const record = { name: 'batch-crash-1000', startedAt, endedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, passed, checks, summary }
if (recordFile !== null) await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`)
console.log(`${checks.filter((c) => c.pass).length} of ${checks.length} checks passed`)
process.exitCode = passed ? 0 : 1
