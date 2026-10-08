// Real-page acceptance of the my-browser lane (ROADMAP PA item 8): pages read in the person's own Chrome.
//
// Sends one batch with `lane: "my-browser"` to a running local API on the person's machine, so the person allows
// Chrome's remote debugging once and the batch's sites once, then judges each page by its task's own predicates
// (research/access/tasks.v1.json) and, with --record, writes the committed Markdown record.
//
// Usage: node research/access/my-browser-check.mjs [--tasks T001,T048,...] [--login .w2l/access/my-browser-login.json]
//          [--scrape-one] [--record research/access/runs/<date>-my-browser-<commit>.md]
//   Env: W2L_API_URL (default http://127.0.0.1:8787).
//   --tasks      public tasks from tasks.v1.json (default PUBLIC below, the set of runs 1 to 4); `none` reads none.
//   --login      a git-ignored JSON file, [{ "url": "...", "signedInText": "..." }, ...]: pages that need the person's
//                login or their own address (ROADMAP PA item 8's acceptance set since 2026-10-07), each verified by a
//                text only that page shows to them (their name, a local listing). The record names only each page's
//                host, never its URL, the text or the page.
//   --scrape-one also reads the first public page as a single scrape (POST /v1/scrape), which asks the person again.
//
// Method:
//   verified       the API answered `success` or `partial` and every predicate passed; a status alone never does.
//   completion     the Evidence Record's access.completion: user_browser (read without a step of the person's) or
//                  handed_to_person (the page showed a check they got through); null when no page was read.
//   denominator    every page asked for, including ones not read (cancelled, blocked, failed).
// Each answer's Markdown is saved under .w2l/access/runs/my-browser-<timestamp>/ (git-ignored).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform, release } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'

/** Six pages Octocrawl's own lanes were stopped at in G0 (a challenge, a bot check, an error), and two healthy controls. */
const PUBLIC = ['T001', 'T048', 'T076', 'T053', 'T049', 'T057', 'T059', 'T062']

const set = JSON.parse(await readFile(join(here, 'tasks.v1.json'), 'utf8'))
const ids = flag('--tasks') === 'none' ? [] : flag('--tasks')?.split(',').map((id) => id.trim()) ?? PUBLIC
const publicTasks = ids.map((id) => {
  const task = set.tasks.find((t) => t.id === id)
  if (task === undefined) throw new Error(`no task ${id} in tasks.v1.json`)
  return { id, url: task.url, kind: task.kind, part: task.part, baseline: task.baseline?.windowA?.verified ?? null, predicates: task.predicates, login: false }
})
const loginFile = flag('--login')
const loginTasks = loginFile === undefined ? [] : JSON.parse(await readFile(loginFile, 'utf8')).map((entry, i) => ({
  id: `L${i + 1}`, url: entry.url, kind: 'login', part: 'login', baseline: null, login: true,
  predicates: [{ type: 'markdownIncludes', text: entry.signedInText }],
}))
const tasks = [...publicTasks, ...loginTasks]

function judge(p, md) {
  switch (p.type) {
    case 'markdownIncludes': return md.includes(p.text)
    case 'markdownMatches': return new RegExp(p.pattern, p.flags ?? 'm').test(md)
    case 'markdownCountMin': return (md.match(new RegExp(p.pattern, (p.flags ?? '').replace('g', '') + 'g')) ?? []).length >= p.min
    default: throw new Error(`predicate ${p.type} is not judged here: choose tasks whose predicates are markdownIncludes, markdownMatches or markdownCountMin`)
  }
}

async function call(method, path, body) {
  const res = await fetch(`${api}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = join(repo, '.w2l/access/runs', `my-browser-${stamp}`)
await mkdir(outDir, { recursive: true })
const commit = execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim()
const dirty = execSync('git status --porcelain --untracked-files=no', { cwd: repo }).toString().trim() !== ''
const startedAt = new Date().toISOString()

console.log(`octocrawl my-browser check: ${tasks.length} pages (${publicTasks.length} public, ${loginTasks.length} behind your login) through ${api}`)
console.log('In Chrome: click Allow on "Allow remote debugging?", then "Allow reading these sites" in the page Octocrawl opens. A page that shows a check waits for you.')

const results = []
const started = await call('POST', '/v1/batches', { urls: tasks.map((t) => t.url), lane: 'my-browser', formats: ['markdown'] })
if (started.status !== 202) throw new Error(`the batch was refused: HTTP ${started.status} ${JSON.stringify(started.json)}`)
const batchId = started.json.taskId ?? started.json.id
let report
for (let last = ''; ;) {
  report = (await call('GET', `/v1/batches/${batchId}`)).json
  const line = `${report.status}: ${report.completed}/${report.requested}${report.waitingForApproval === true ? ' (waiting for you to click Allow reading these sites in Chrome)' : ''}`
  if (line !== last) { console.log(line); last = line }
  if (!['pending', 'running'].includes(report.status)) break
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}
const items = []
for (let cursor; ;) {
  const page = (await call('GET', `/v1/batches/${batchId}/items?debug=true&limit=50${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`)).json
  items.push(...page.items)
  if (!page.hasMore || page.nextCursor == null) break
  cursor = page.nextCursor
}
for (const task of tasks) {
  const item = items.find((candidate) => candidate.url === task.url) ?? null
  const md = typeof item?.markdown === 'string' ? item.markdown : ''
  await writeFile(join(outDir, `${task.id}.md`), md)
  const passed = task.predicates.map((p) => judge(p, md))
  results.push({
    task, route: 'batch', status: item?.status ?? null, reason: item?.failureReason ?? item?.blockReason ?? null, lane: item?.lane ?? null,
    verified: item !== null && ['success', 'partial'].includes(item.status) && passed.every(Boolean),
    completion: item?.evidenceRecord?.access?.completion ?? null, executor: item?.evidenceRecord?.access?.executor ?? null,
    wallMs: item?.usage?.wallMs ?? null, note: (item?.warnings ?? []).map((w) => w.code).join(', '),
  })
}

if (args.includes('--scrape-one')) {
  const task = publicTasks[0]
  console.log(`Single scrape of ${task.id}: Chrome asks again.`)
  const answer = await call('POST', '/v1/scrape', { url: task.url, lane: 'my-browser', formats: ['markdown'], debug: true })
  const md = typeof answer.json?.markdown === 'string' ? answer.json.markdown : ''
  await writeFile(join(outDir, `${task.id}-scrape.md`), md)
  const passed = task.predicates.map((p) => judge(p, md))
  results.push({
    task, route: 'scrape', status: answer.json?.status ?? `HTTP ${answer.status}`, reason: answer.json?.failureReason ?? answer.json?.blockReason ?? answer.json?.error ?? null, lane: answer.json?.lane ?? null,
    verified: answer.status === 200 && ['success', 'partial'].includes(answer.json?.status) && passed.every(Boolean),
    completion: answer.json?.evidenceRecord?.access?.completion ?? null, executor: answer.json?.evidenceRecord?.access?.executor ?? null,
    wallMs: answer.json?.usage?.wallMs ?? null, note: (answer.json?.warnings ?? []).map((w) => w.code).join(', '),
  })
}

await writeFile(join(outDir, 'results.json'), JSON.stringify({ batchId, report, results: results.map((r) => ({ ...r, task: { ...r.task, url: r.task.login ? new URL(r.task.url).host : r.task.url } })) }, null, 2))
const read = results.filter((r) => r.route === 'batch')
const verified = read.filter((r) => r.verified).length
const browser = results.find((r) => r.executor !== null)?.executor ?? 'unknown'
console.log(`verified ${verified}/${read.length} pages of the batch; Markdown under ${outDir}`)

const recordFile = flag('--record')
if (recordFile !== undefined) {
  const where = (r) => r.task.login ? `${new URL(r.task.url).host} (behind your login)` : r.task.url
  const rows = results.map((r) => `| ${r.task.id} | ${r.route} | ${where(r)} | ${r.task.part} | ${r.task.baseline === null ? '—' : r.task.baseline ? 'verified' : 'not verified'} | ${r.status ?? '—'} | ${r.reason ?? ''} | ${r.lane ?? '—'} | ${r.completion ?? '—'} | ${r.verified ? 'yes' : 'no'} | ${r.wallMs ?? '—'} | ${r.note} |`)
  const text = `# my-browser lane: real-page acceptance, ${startedAt.slice(0, 10)}

ROADMAP PA item 8. Pages read in the person's own Chrome through one batch on \`lane: "my-browser"\`.

- Command: \`node research/access/my-browser-check.mjs ${args.join(' ')}\`
- Source commit: \`${commit}\`${dirty ? ' (working tree had uncommitted changes)' : ''}
- API: ${api}, a local server on loopback (\`npm run api\`). Started ${startedAt}.
- Machine: ${platform()} ${release()}; browser as Chrome reported it: ${browser}.
- Network: the pages went out through Chrome's own network settings, not Octocrawl's; Octocrawl fetched nothing for them.
- Windows and Linux: not checked.
- Batch \`${batchId}\`: ${report.status}, ${report.completed}/${report.requested} pages.

Verified ${verified} of ${read.length} batch pages (a page is verified only when it was read and every predicate of its task passed). The G0 baseline column is Octocrawl's own lanes in window A.

| Task | Route | Page | Part | G0 baseline | Status | Reason | Lane | Completion | Verified | Wall ms | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`
  await mkdir(dirname(join(repo, recordFile)), { recursive: true })
  await writeFile(join(repo, recordFile), text)
  console.log(`record written: ${recordFile}`)
}
