// Follow-up 2026-10-13: the archive-only redirects whose target the map did not list, and the address that failed,
// requested again with redirects followed. Same user agent as status.mjs.
import { readFileSync, writeFileSync } from 'node:fs'
const D = process.argv[2]
const map = new Set(JSON.parse(readFileSync(`${D}/hosted-map-mcp-root.json`, 'utf8')).links.map(l => l.url.replace(/\/$/, '')))
const rows = JSON.parse(readFileSync(`${D}/status-archive-only-mcp.json`, 'utf8')).rows
const todo = rows.filter(r => r.status === 'error' || (String(r.status)[0] === '3' && !map.has(new URL(r.location, r.url).href.replace(/\/$/, ''))))
const out = []
for (const r of todo) {
  let res
  try { const x = await fetch(r.url, { redirect: 'follow', headers: { 'user-agent': 'w2l-research/0.1' }, signal: AbortSignal.timeout(30000) }); res = { status: x.status, finalUrl: x.url, finalInMap: map.has(x.url.replace(/[?#].*$/, '').replace(/\/$/, '')) }; await x.body?.cancel() }
  catch (e) { res = { status: 'error', error: String(e.cause?.code ?? e.message) } }
  out.push({ url: r.url, firstStatus: r.status, location: r.location, ...res }); await new Promise(z => setTimeout(z, 300))
}
writeFileSync(`${D}/followup-redirects-mcp.json`, JSON.stringify({ checkedAt: new Date().toISOString(), rows: out }, null, 1))
for (const o of out) console.log(o.firstStatus, o.status, o.finalInMap, o.url, '->', o.finalUrl ?? o.error)
