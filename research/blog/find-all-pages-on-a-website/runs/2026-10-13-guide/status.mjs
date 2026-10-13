import { readFileSync, writeFileSync } from 'node:fs'
const D = process.argv[2]
const c = JSON.parse(readFileSync(`${D}/compare-mcp.json`, 'utf8'))
const urls = c.archivesNotInMap.filter(u => !new URL(u).pathname.startsWith('/_next/'))
const rows = []; let i = 0
async function worker() { while (i < urls.length) { const u = urls[i++]; let s, loc = null
  try { const r = await fetch(u, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'w2l-research/0.1' }, signal: AbortSignal.timeout(20000) }); s = r.status; loc = r.headers.get('location'); await r.body?.cancel() } catch (e) { s = 'error' }
  rows.push({ url: u, status: s, location: loc }); await new Promise(r => setTimeout(r, 250)) } }
await Promise.all([1, 2, 3].map(worker))
rows.sort((a, b) => a.url.localeCompare(b.url))
const by = {}; for (const r of rows) { const k = String(r.status)[0] === '3' ? '3xx' : String(r.status); by[k] = (by[k] || 0) + 1 }
writeFileSync(`${D}/status-archive-only-mcp.json`, JSON.stringify({ checkedAt: new Date().toISOString(), skippedNextData: c.archivesNotInMap.length - urls.length, byStatus: by, rows }, null, 1))
console.log(urls.length, c.archivesNotInMap.length - urls.length, by)
console.log(rows.filter(r => r.status === 200).map(r => r.url))
