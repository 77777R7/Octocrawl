// Real-site check of a list that stops at a check and goes on in the person's own Chrome (ROADMAP PA item 3, the last
// clause: "a challenge at page N ... is handed to the person, is verified at page N, and continues").
//
// Runs each candidate of list-challenge-candidates.v1.json as a one-URL batch whose only step is `paginate` with an
// `itemSelector`, on a running local API, and reports where its list stopped. With --handoff, a list that stopped at a
// check at page 2 or later is handed to the person (POST /v1/batches/:id/handoff): the check's page opens in their
// Chrome, they get through it and click Next themselves, and Octocrawl only reads the tab. With --record, writes the
// committed Markdown record; every candidate stays in its denominator.
//
// Usage: node research/access/list-handoff-check.mjs [--only T033,T051] [--handoff] [--wait-ms 600000]
//          [--record research/access/runs/<date>-list-handoff-<commit>.md]
//   Env: W2L_API_URL (default http://127.0.0.1:8787). The API must run on this machine, on loopback, for the handoff.
//
// Verified (the handoff's acceptance) only when all hold, read from the batch item after the handoff:
//   the list stopped at a check at page N >= 2 before the handoff; afterwards `actions.lists[0].continued.from` is N and
//   `continued.pages` >= 1 with `by: "user_browser"`; the item is `success` or `partial`; at least one page of
//   `actions.scrapes` is the person's (`by: "user_browser"`); and `itemsRead` grew past what Octocrawl read before the check.
// A status alone never verifies.

import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'
const handoff = args.includes('--handoff')
const waitMs = Number(flag('--wait-ms') ?? 600_000)
const record = flag('--record')

const set = JSON.parse(await readFile(join(here, 'list-challenge-candidates.v1.json'), 'utf8'))
const only = flag('--only')?.split(',').map((id) => id.trim())
const candidates = only === undefined ? set.candidates : set.candidates.filter((c) => only.includes(c.id))

async function call(method, path, body) {
  const res = await fetch(`${api}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, json, text }
}

async function finished(id) {
  for (;;) {
    const { json } = await call('GET', `/v1/batches/${id}`)
    if (json !== null && !['pending', 'running'].includes(json.status)) return json
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

async function item(id) {
  const { json } = await call('GET', `/v1/batches/${id}/items?debug=true&limit=5`)
  return json?.items?.[0] ?? json?.data?.[0] ?? null
}

/** What the item says of its list: where it stopped, at which page, and what was read. */
function listOf(it) {
  const list = it?.actions?.lists?.[0] ?? null
  return {
    status: it?.status ?? null,
    reason: it?.blockReason ?? it?.failureReason ?? null,
    stoppedBy: list?.stoppedBy ?? null,
    rounds: list?.rounds ?? null,
    itemsRead: list?.itemsRead ?? null,
    challenge: list?.challenge ?? null,
    continued: list?.continued ?? null,
    personPages: (it?.actions?.scrapes ?? []).filter((page) => page.by === 'user_browser').length,
    completion: it?.evidenceRecord?.access?.completion ?? null,
    egress: it?.evidenceRecord?.access?.egress ?? null,
  }
}

const rows = []
for (const c of candidates) {
  const request = {
    urls: [c.url],
    formats: ['markdown'],
    onlyMainContent: false,
    timeout: 180_000,
    maxConcurrency: 1,
    actions: [{ type: 'paginate', nextSelector: c.nextSelector, itemSelector: c.itemSelector, maxPages: set.maxPages }],
  }
  const started = await call('POST', '/v1/batches', request)
  const id = started.json?.id ?? started.json?.taskId
  if (id === undefined) { rows.push({ c, error: `batch refused: ${started.status} ${started.text.slice(0, 200)}` }); console.log(`${c.id} refused ${started.status}`); continue }
  await finished(id)
  const before = listOf(await item(id))
  const qualifies = before.stoppedBy === 'challenge' && (before.challenge?.page ?? 0) >= 2
  console.log(`${c.id} ${new URL(c.url).hostname} ${id}: ${before.status}${before.reason ? ` (${before.reason})` : ''} stoppedBy=${before.stoppedBy} page=${before.challenge?.page ?? '-'} rounds=${before.rounds} itemsRead=${before.itemsRead}`)
  const row = { c, id, before, qualifies, after: null, handed: null, verified: null }
  if (handoff && qualifies) {
    console.log(`  Handing over: the page of the check opens in your Chrome. Get through it, wait for the terminal to say the page was read, then click Next until the list ends. Do not close the tab.`)
    const done = await call('POST', `/v1/batches/${id}/handoff`, { waitMs })
    row.handed = done.json ?? { status: done.status, text: done.text.slice(0, 200) }
    row.after = listOf(await item(id))
    const a = row.after
    row.verified = a.continued?.from === before.challenge.page && (a.continued?.pages ?? 0) >= 1 && a.continued?.by === 'user_browser'
      && ['success', 'partial'].includes(a.status) && a.personPages >= 1 && (a.itemsRead ?? 0) > (before.itemsRead ?? 0)
    console.log(`  after: ${a.status} continued=${JSON.stringify(a.continued)} itemsRead=${a.itemsRead} personPages=${a.personPages} verified=${row.verified}`)
  }
  rows.push(row)
}

if (record !== undefined) {
  const commit = execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim()
  const dirty = execSync('git status --porcelain -- packages', { cwd: repo }).toString().trim() !== ''
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null
  const cell = (v) => (v === null || v === undefined ? '—' : String(v))
  const lines = rows.map((r) => r.error !== undefined
    ? `| ${r.c.id} | ${new URL(r.c.url).hostname} | ${r.error} | — | — | — | — |`
    : `| ${r.c.id} | ${new URL(r.c.url).hostname} | ${cell(r.before.status)}${r.before.reason ? ` (${r.before.reason})` : ''} / ${cell(r.before.stoppedBy)}${r.before.challenge ? ` at page ${r.before.challenge.page} (${r.before.challenge.reason})` : ''} | ${cell(r.before.rounds)} / ${cell(r.before.itemsRead)} | ${r.qualifies ? 'yes' : 'no'} | ${r.after === null ? '—' : `${cell(r.after.status)}, continued ${JSON.stringify(r.after.continued)}, items ${cell(r.after.itemsRead)}, person's pages ${r.after.personPages}`} | ${r.verified === null ? '—' : r.verified ? 'verified' : 'not verified'} |`)
  const text = `# List handoff check, ${new Date().toISOString().slice(0, 10)}

ROADMAP PA item 3, the last clause: a list stopped at a check at page N is handed to the person, verified at page N, and continues.

- Command: \`node research/access/list-handoff-check.mjs ${args.join(' ')}\`
- Source commit: \`${commit}\`${dirty ? ' (packages had uncommitted changes)' : ''}
- API: ${api}. Network: the API process's own route, as each item's \`access.egress\` states (the driver's shell had ${proxy === null ? 'no proxy variable' : `HTTPS_PROXY=${new URL(proxy.includes('://') ? proxy : `http://${proxy}`).host}`}).
- Candidates: \`research/access/list-challenge-candidates.v1.json\`, ${set.candidates.length} frozen before the run, ${candidates.length} run; \`maxPages\` ${set.maxPages}.
- Handoff: ${handoff ? `asked for every list stopped at a check at page 2 or later, \`waitMs\` ${waitMs}` : 'not asked (probe only)'}.

| Task | Host | Before: status / stop | Pages / items read | Check at page >= 2 | After the handoff | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
${lines.join('\n')}

Verified only as the driver's header states; a status alone never verifies. Raw items: \`GET /v1/batches/<id>/items?debug=true\` on the API's task root (not committed): ${rows.filter((r) => r.id).map((r) => `${r.c.id} \`${r.id}\``).join(', ')}.
`
  await writeFile(join(repo, record), text)
  console.log(`record: ${record}`)
}
