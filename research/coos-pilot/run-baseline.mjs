#!/usr/bin/env node
// Phase 0 baseline: submit every URL in urls.txt as one W2L batch through the
// local REST API, wait for it to finish, and save every item (failures included).
//
// Usage: npm run api   (in another terminal, from the repo root)
//        node research/coos-pilot/run-baseline.mjs [urls.txt] [outDir]
// Env:   W2L_API_URL (default http://127.0.0.1:8787)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const urlsFile = process.argv[2] ?? join(here, 'urls.txt')
const outDir = process.argv[3] ?? join(here, '../../.w2l/coos-pilot', new Date().toISOString().replace(/[:.]/g, '-'))
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'

async function call(method, path, body) {
  const res = await fetch(api + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

const urlsText = await readFile(urlsFile, 'utf8')
const urls = urlsText.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
let commit = null
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch {}

const startedAt = new Date().toISOString()
const { taskId } = await call('POST', '/v1/batches', { urls, formats: ['markdown'] })
console.log(`batch ${taskId}: ${urls.length} URLs submitted`)

let status
for (;;) {
  status = await call('GET', `/v1/batches/${taskId}`)
  console.log(`  ${status.status} completed=${status.completed}/${status.requested}`)
  if (!['pending', 'running'].includes(status.status)) break
  await new Promise((resolve) => setTimeout(resolve, 5000))
}

const items = []
let cursor
do {
  const query = new URLSearchParams({ limit: '50', debug: 'true', ...(cursor ? { cursor } : {}) })
  const page = await call('GET', `/v1/batches/${taskId}/items?${query}`)
  items.push(...page.items)
  cursor = page.hasMore ? page.nextCursor : undefined
} while (cursor)

await mkdir(outDir, { recursive: true })
const record = {
  taskId,
  startedAt,
  finishedAt: new Date().toISOString(),
  operatorCheckoutCommit: commit,
  urlsFileSha256: createHash('sha256').update(urlsText).digest('hex'),
  batch: status,
  items,
}
await writeFile(join(outDir, 'batch-items.json'), JSON.stringify(record, null, 2))

const counts = {}
for (const item of items) {
  const key = [item.status, item.failureReason ?? item.blockReason ?? ''].filter(Boolean).join(':')
  counts[key] = (counts[key] ?? 0) + 1
}
console.log(`\n${items.length}/${urls.length} items saved to ${join(outDir, 'batch-items.json')}`)
for (const [key, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${key}`)
