#!/usr/bin/env node
// `w2l serve` on any OS (the CI runs it on windows-latest): the compiled CLI
// serves the API; a page and a PDF are scraped; a batch of 100 URLs is started,
// the server is killed mid-run (on Windows every kill is forced, so this is the
// crash path), started again on the same task root, and the batch resumes and
// completes with one item per URL. Runs the compiled packages (npx tsc -b first).
// Usage: node scripts/reliability/serve-smoke.mjs

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { textPdf } from '@w2l/fixtures'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const checks = []
const check = (name, pass, detail) => { checks.push(pass); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`) }

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning for the pilots. '.repeat(3)
const PDF = Buffer.from(textPdf([['Annual data summary', 'Capacity reached 120 MW.'], ['Portfolio PUE: 1.32']]))
const site = createServer((req, res) => {
  if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
  if (req.url === '/report.pdf') return void res.writeHead(200, { 'content-type': 'application/pdf' }).end(PDF)
  setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    .end(`<!doctype html><html lang="en"><head><title>${req.url}</title></head><body><main><article><h1>Page ${req.url}</h1><p>${PROSE}</p></article></main></body></html>`), 30)
})
await new Promise((done) => site.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${site.address().port}`
const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-serve-smoke-'))
const freePort = () => new Promise((done) => { const probe = netServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)) }) })

async function serve() {
  const port = await freePort()
  const child = spawn(process.execPath, [join(root, 'packages', 'cli', 'dist', 'cli.js'), 'serve', '--port', String(port), '--task-root', taskRoot], {
    cwd: root, env: { ...process.env, W2L_PER_HOST_MIN_DELAY_MS: '1', W2L_PER_HOST_CONCURRENCY: '2' }, stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 300; i++) {
    if (await fetch(`${base}/v1/crawl/active`).then((res) => res.ok, () => false)) return { child, base }
    if (child.exitCode !== null) break
    await new Promise((done) => setTimeout(done, 100))
  }
  child.kill()
  throw new Error(`w2l serve did not start: ${stderr.slice(0, 2000)}`)
}
const stop = async (server) => { const exited = new Promise((done) => server.child.once('exit', done)); server.child.kill(); await exited }
const post = async (base, path, body) => (await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
const get = async (base, path) => (await fetch(`${base}${path}`)).json()

let server = null
try {
  server = await serve()
  check('serve', true, `${process.platform} ${process.arch}, node ${process.version}, ${server.base}`)
  const page = await post(server.base, '/v1/scrape', { url: `${origin}/a`, debug: false })
  check('scrape a page', page.status === 'success' && page.evidenceRecord?.status === 'success', page.status)
  const pdf = await post(server.base, '/v1/scrape', { url: `${origin}/report.pdf`, debug: false, parsers: [{ type: 'pdf', pages: true }] })
  check('scrape a PDF', pdf.status === 'success' && pdf.pages?.length === 2, `${pdf.status}, ${pdf.pages?.length} pages`)

  const urls = Array.from({ length: 100 }, (_, i) => `${origin}/b/${i + 1}`)
  const { taskId } = await post(server.base, '/v1/batches', { urls })
  let before
  for (;;) {
    before = await get(server.base, `/v1/batches/${taskId}`)
    if (before.completed >= 30 || before.status === 'completed') break
    await new Promise((done) => setTimeout(done, 20))
  }
  await stop(server)
  check('killed mid-batch', before.completed < urls.length, `${before.completed} of ${urls.length} completed when the server was stopped`)

  server = await serve()
  let after
  const deadline = Date.now() + 120_000
  for (;;) {
    after = await get(server.base, `/v1/batches/${taskId}`)
    if (['completed', 'failed', 'cancelled'].includes(after.status) || Date.now() > deadline) break
    await new Promise((done) => setTimeout(done, 100))
  }
  const items = []
  for (let cursor = null; ;) {
    const listing = await get(server.base, `/v1/batches/${taskId}/items?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    items.push(...listing.items)
    if (!listing.hasMore) break
    cursor = listing.nextCursor
  }
  const distinct = new Set(items.map((item) => item.url))
  check('the batch resumed after the restart and completed', after.status === 'completed' && after.completed === urls.length && after.succeeded + after.failed === urls.length, { status: after.status, completed: after.completed, succeeded: after.succeeded, failed: after.failed })
  check('one item per URL', items.length === urls.length && distinct.size === urls.length, `${items.length} items, ${distinct.size} URLs`)
  await stop(server)
  server = null
  check('stopped', true, 'exited')
} catch (error) {
  check('run', false, error instanceof Error ? error.message : String(error))
} finally {
  if (server !== null) server.child.kill()
  await new Promise((done) => site.close(done))
  // SQLite files on Windows can stay locked for a moment after the process exits.
  for (let i = 0; i < 10; i++) { try { await rm(taskRoot, { recursive: true, force: true }); break } catch { await new Promise((done) => setTimeout(done, 500)) } }
}
console.log(`${checks.filter(Boolean).length} of ${checks.length} checks passed`)
process.exitCode = checks.every(Boolean) ? 0 : 1
