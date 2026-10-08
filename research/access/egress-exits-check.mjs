// Real-site check of the egress pool with several real exits (ROADMAP PA item 3: "failed egresses cool down; switching
// is bounded and happens on an explicit failure ... a 429 is never answered by switching egress ... every result
// records proxyUsed, the session and the location").
//
// The operator's exits are http proxies (`--exits 127.0.0.1:7893,127.0.0.1:7894,127.0.0.1:7895`). The driver puts a
// local TCP relay in front of each (`--relay-base 17893`: 17893 -> the first exit, and so on), and the API under test
// must run with W2L_EGRESS_PROXIES naming the relays, so the driver can make one egress fail mid-run by closing its relay
// while the exit behind it stays the same. Each page is httpbin's /get, whose body names the address the request came
// from, so a page's own address is compared with the exit the record states (`access.egress.exit`).
//
//   Phase A: one batch, maxConcurrency 1. After 3 pages (one a 429) the relay of the task's egress is closed, after 6 the
//            next one's, after 8 the third's: two switches to working exits, then the cap (no third switch).
//   Phase B: --cooldown-ms later (default 10.5 min, past EGRESS_COOLDOWN_MS) every relay is open again and a second
//            batch runs: a failed egress is used again once its cooldown ended.
//
// Usage: node research/access/egress-exits-check.mjs --exits <h:p,...> [--relay-base 17893] [--cooldown-ms 630000]
//          [--record research/access/runs/<date>-g3c-exits-<commit>.md]
//   Env: W2L_API_URL (default http://127.0.0.1:8787). The API must already run with the relays in W2L_EGRESS_PROXIES,
//   W2L_EGRESS_ECHO_URL set, a grant that names egress_sessions, and no HTTPS_PROXY/HTTP_PROXY.

import { execSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'
const exits = (flag('--exits') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (exits.length < 3) throw new Error('--exits needs three http proxies, host:port')
const relayBase = Number(flag('--relay-base') ?? 17893)
const cooldownMs = Number(flag('--cooldown-ms') ?? 630_000)
const record = flag('--record')
const log = (...line) => console.log(new Date().toISOString().slice(11, 19), ...line)

/** A relay: 127.0.0.1:<port> piped to one exit; closing it refuses new connections and ends open ones. */
function relay(port, target) {
  const [host, targetPort] = target.split(':')
  let server = null
  const sockets = new Set()
  const open = () => new Promise((resolve) => {
    server = createServer((socket) => {
      const upstream = connect(Number(targetPort), host)
      sockets.add(socket); sockets.add(upstream)
      socket.pipe(upstream); upstream.pipe(socket)
      const end = () => { socket.destroy(); upstream.destroy(); sockets.delete(socket); sockets.delete(upstream) }
      socket.on('error', end); upstream.on('error', end); socket.on('close', end); upstream.on('close', end)
    })
    server.listen(port, '127.0.0.1', resolve)
  })
  const close = () => new Promise((resolve) => { for (const s of sockets) s.destroy(); sockets.clear(); server.close(() => resolve()) })
  return { id: `127.0.0.1:${port}`, target, open, close }
}
const relays = exits.map((target, i) => relay(relayBase + i, target))
const relayById = new Map(relays.map((r) => [r.id, r]))

async function call(method, path, body) {
  const res = await fetch(`${api}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return res.json()
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function items(id) {
  const page = await call('GET', `/v1/batches/${id}/items?debug=true&limit=50`)
  return page.items ?? []
}

/** Runs one batch; `at` maps a completed count to an action taken once that many pages are done. */
async function runBatch(label, urls, at = new Map()) {
  const started = await call('POST', '/v1/batches', { urls, formats: ['markdown'], maxConcurrency: 1, maxAge: 0 })
  const id = started.taskId ?? started.id
  log(label, 'batch', id)
  const done = new Set()
  for (;;) {
    const report = await call('GET', `/v1/batches/${id}`)
    for (const [count, action] of at) if (report.completed >= count && !done.has(count)) { done.add(count); await action(await items(id)) }
    if (!['pending', 'running'].includes(report.status)) return { id, report, items: await items(id) }
    await sleep(300)
  }
}

/** The egress of the latest page read: what a task is on now. */
const currentEgress = (list) => [...list].reverse().find((it) => it.evidenceRecord?.access?.egress?.proxy)?.evidenceRecord.access.egress.proxy ?? null
const closeCurrent = (what) => async (list) => {
  const proxy = currentEgress(list)
  const r = relayById.get(proxy)
  if (r === undefined) { log(what, 'no current egress to close', proxy); return }
  await r.close()
  closedAt.push({ what, relay: r.id, exit: r.target, at: new Date().toISOString() })
  log(what, 'closed relay', r.id, '->', r.target)
}
const closedAt = []

/** One row per page: its own address (httpbin's `origin`), the exit its record states, and the switches. */
function rowsOf(list) {
  return list.map((it) => {
    const egress = it.evidenceRecord?.access?.egress ?? null
    const origin = /"origin"\s*:\s*"([^"]+)"/.exec(it.markdown ?? '')?.[1]?.split(',').at(-1)?.trim() ?? null
    const switches = (it.trace ?? []).filter((e) => e.event === 'egress_switched').map((e) => e.detail)
    return {
      url: it.url.replace('https://httpbin.org', ''),
      status: it.status,
      reason: it.blockReason ?? it.failureReason ?? null,
      proxy: egress?.proxy ?? null,
      exit: egress?.exit ?? null,
      origin,
      matches: origin !== null && egress?.exit?.ip !== undefined ? origin === egress.exit.ip : null,
      switches,
      session: it.evidenceRecord?.access?.session?.id ?? null,
      robots: it.evidenceRecord?.robotsDecision?.decision ?? null,
      fetchedAt: it.evidenceRecord?.fetchedAt ?? null,
    }
  })
}

for (const r of relays) await r.open()
log('relays', relays.map((r) => `${r.id}->${r.target}`).join(', '))

const urlsA = ['/get?a=1', '/get?a=2', '/status/429?a=3', '/get?a=4', '/get?a=5', '/get?a=6', '/get?a=7', '/get?a=8', '/get?a=9', '/get?a=10'].map((p) => `https://httpbin.org${p}`)
const phaseA = await runBatch('A', urlsA, new Map([[3, closeCurrent('first close')], [6, closeCurrent('second close')], [8, closeCurrent('third close')]]))
const rowsA = rowsOf(phaseA.items)
for (const row of rowsA) log('A', row.url, row.status, row.proxy, row.exit?.ip, row.exit?.country, 'origin', row.origin, row.switches.length ? JSON.stringify(row.switches) : '')

for (const r of relays) if (closedAt.some((c) => c.relay === r.id)) await r.open()
log(`relays open again; waiting ${cooldownMs} ms for the cooldown`)
await sleep(cooldownMs)
const urlsB = [1, 2, 3, 4].map((n) => `https://httpbin.org/get?b=${n}`)
const phaseB = await runBatch('B', urlsB)
const rowsB = rowsOf(phaseB.items)
for (const row of rowsB) log('B', row.url, row.status, row.proxy, row.exit?.ip, row.exit?.country, 'origin', row.origin)
for (const r of relays) await r.close()

if (record !== undefined) {
  const commit = execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim()
  const dirty = execSync('git status --porcelain -- packages', { cwd: repo }).toString().trim() !== ''
  const cell = (v) => (v === null || v === undefined ? '—' : String(v))
  const table = (rows) => ['| Page | Status | Egress (relay) | `exit` (ip, country) | Page\'s own address | Same | Switches | robots |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.url}\` | ${r.status}${r.reason ? ` (${r.reason})` : ''} | ${cell(r.proxy)} | ${r.exit === null ? 'null' : `${r.exit.ip}, ${cell(r.exit.country)}`} | ${cell(r.origin)} | ${r.matches === null ? '—' : r.matches ? 'yes' : 'no'} | ${r.switches.map((s) => `${s.from} → ${s.to} (${s.reason}, ${s.switches})`).join('; ') || '—'} | ${cell(r.robots)} |`)].join('\n')
  const text = `# Egress pool with several real exits (G3c), ${new Date().toISOString().slice(0, 10)}

ROADMAP PA item 3: switching between working exits, the two-switch cap, the cooldown's end, a 429 that never switches, and the location on every result.

- Command: \`node research/access/egress-exits-check.mjs ${args.join(' ')}\`
- Source commit: \`${commit}\`${dirty ? ' (packages had uncommitted changes)' : ''}
- API: ${api}, run with the relays in \`W2L_EGRESS_PROXIES\` and \`W2L_EGRESS_ECHO_URL\` (see the API's own notice), no proxy variables.
- Exits behind the relays: ${relays.map((r) => `${r.id} → ${r.target}`).join(', ')}.
- Relays closed: ${closedAt.map((c) => `${c.what} ${c.relay} (${c.exit}) at ${c.at}`).join('; ') || 'none'}. Reopened after phase A; phase B ${Math.round(cooldownMs / 1000)} s later.

## Phase A (\`${phaseA.id}\`, ${phaseA.report.status})

${table(rowsA)}

## Phase B (\`${phaseB.id}\`, ${phaseB.report.status})

${table(rowsB)}

\`exit\` is what the echo URL saw through that egress; "Page's own address" is httpbin's \`origin\` in the page itself. Raw items: \`GET /v1/batches/<id>/items?debug=true\` on the API's task root (not committed).
`
  await writeFile(join(repo, record), text)
  log('record', record)
}
