// Candidate harvest for the PA access task set (G0). Sends every URL from the repository's own
// sources (research/parity/sites.v1.json, research/coos-pilot/urls.txt, packages/canary/src/sites.ts,
// research/parity/real-site-test-set.md, research/parity/runs/2026-10-03-p2-guides.md), or every
// URL in a list file, once through a running local API in standard mode, and keeps status, reason,
// lane, HTTP status and Markdown length per URL. Bot-detection test pages are excluded, not sent.
//
// Usage: node research/access/harvest.mjs <repo> <outDir> [urls.txt]
//   The API is http://127.0.0.1:8787 (npm run api). Hosts run one URL at a time, four hosts at once.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
const startedAt = new Date().toISOString()
const repo = process.argv[2]
const out = process.argv[3]
const api = 'http://127.0.0.1:8787'
const sources = new Map()
const add = (url, src) => {
  url = url.replace(/[.,;:]+$/, '')
  if (!/^https?:\/\//.test(url) || url.includes('…') || /\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(url)) return
  if (!sources.has(url)) sources.set(url, new Set())
  sources.get(url).add(src)
}
const listFile = process.argv[4]
if (listFile) { for (const line of (await readFile(listFile, 'utf8')).split('\n')) if (line.startsWith('http')) add(line.trim(), 'expansion') }
const sites = listFile ? { cases: [] } : JSON.parse(await readFile(`${repo}/research/parity/sites.v1.json`, 'utf8'))
for (const c of sites.cases ?? sites) if (typeof c.url === 'string') add(c.url, `parity:${c.id}`)
if (!listFile) for (const line of (await readFile(`${repo}/research/coos-pilot/urls.txt`, 'utf8')).split('\n')) if (line.trim() && !line.startsWith('#')) add(line.trim(), 'coos')
const urlRe = /https?:\/\/[^\s)|>`"'\]]+/g
for (const [file, tag] of listFile ? [] : [['packages/canary/src/sites.ts', 'canary'], ['research/parity/real-site-test-set.md', 'realset'], ['research/parity/runs/2026-10-03-p2-guides.md', 'guides']]) {
  for (const m of (await readFile(`${repo}/${file}`, 'utf8')).matchAll(urlRe)) add(m[0], tag)
}
const BOT_TEST = /(^|\.)(nowsecure\.nl|scrapingcourse\.com|sannysoft\.com|bot\.incolumitas\.com|browserscan\.net|pixelscan\.net|creepjs|fingerprint\.com)$/
const all = [...sources.entries()].map(([url, s]) => ({ url, sources: [...s], host: new URL(url).hostname }))
const byHost = new Map()
for (const item of all) {
  if (BOT_TEST.test(item.host)) { item.excluded = 'bot_detection_test_page'; continue }
  if (!byHost.has(item.host)) byHost.set(item.host, [])
  byHost.get(item.host).push(item)
}
const commit = execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim()
await mkdir(out, { recursive: true })
const results = []
const hosts = [...byHost.keys()]
let next = 0
async function scrape(item) {
  const started = Date.now()
  try {
    const res = await fetch(`${api}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: item.url, formats: ['markdown'] }), signal: AbortSignal.timeout(150_000) })
    const j = await res.json()
    const events = new Set([...(j.trace ?? []).map((t) => t.event), ...(j.ladderTrace ?? []).map((t) => t.event)])
    return {
      ...item, apiStatus: res.status, status: j.status ?? null, failureReason: j.failureReason ?? null, blockReason: j.blockReason ?? null,
      budgetExceeded: j.budgetExceeded ?? null, lane: j.lane ?? null, channelsTried: j.channelsTried ?? j.summary?.channelsTried ?? null,
      httpStatus: j.evidence?.httpStatus ?? null, finalUrl: j.evidence?.finalUrl ?? null, contentType: j.evidence?.contentType ?? null,
      warnings: (j.warnings ?? []).map((w) => (typeof w === 'string' ? w : w.code)), markdownChars: typeof j.markdown === 'string' ? j.markdown.length : null,
      signals: [...events].filter((e) => /quality|client_rendered|gate|blocked|challenge|robots|handoff|identity/.test(e)),
      error: j.error ?? null, wallMs: Date.now() - started,
    }
  } catch (e) {
    return { ...item, error: String(e), wallMs: Date.now() - started }
  }
}
async function worker() {
  while (next < hosts.length) {
    const host = hosts[next++]
    for (const item of byHost.get(host)) {
      const r = await scrape(item)
      results.push(r)
      process.stdout.write(`${results.length}/${all.length - all.filter((a) => a.excluded).length} ${r.status ?? r.error?.slice(0, 40)} ${r.failureReason ?? ''}${r.blockReason ?? ''} ${r.url}\n`)
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
const meta = { command: `node research/access/harvest.mjs ${process.argv.slice(2).join(" ")}`, commit, startedAt, finishedAt: new Date().toISOString(), api, proxied: process.env.HTTPS_PROXY ?? null, mode: 'standard', excluded: all.filter((a) => a.excluded) }
await writeFile(`${out}/harvest.json`, JSON.stringify({ meta, results }, null, 2))
console.log('done', results.length)
