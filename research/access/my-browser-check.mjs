// Real-page acceptance of the my-browser lane (ROADMAP PA item 8): pages read in the person's own Chrome.
//
// Sends one batch with `lane: "my-browser"` to a running local API on the person's machine, so the person allows
// Chrome's remote debugging once and the batch's sites once, then judges each page by its task's own predicates
// (research/access/tasks.v1.json) and, with --record, writes the committed Markdown record.
//
// Usage: node research/access/my-browser-check.mjs [--tasks T001,T048,...] [--login .w2l/access/my-browser-login.json]
//          [--scrape-one] [--via lane|access] [--contract] [--record research/access/runs/<date>-my-browser-<commit>.md]
//   Env: W2L_API_URL (default http://127.0.0.1:8787).
//   --tasks      public tasks from tasks.v1.json (default PUBLIC below, the set of runs 1 to 4); `none` reads none.
//   --login      a git-ignored JSON file, [{ "url": "...", "signedInText": "..." }, ...]: pages that need the person's
//                login or their own address (ROADMAP PA item 8's acceptance set since 2026-10-07), each verified by a
//                text only that page shows to them (their name, a local listing). The record names only each page's
//                host, never its URL, the text or the page.
//   --scrape-one also reads the first public page as a single scrape (POST /v1/scrape), which asks the person again.
//   --via        how the request asks for the lane: `lane` (default, `"lane": "my-browser"`) or `access` (the one
//                plain choice of ROADMAP PA item 7, `"access": "my-browser"`).
//   --contract   each page goes as its own scrape carrying its task's predicates as the task contract (`verify`, ROADMAP
//                PA item 10, ADR 0006), since a batch takes one contract for all its pages; Chrome asks for each. The
//                record says, page by page, whether the product's verification agreed with this script's verdict.
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
import { Agent, fetch } from 'undici'

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
const via = flag('--via') ?? 'lane'
if (!['lane', 'access'].includes(via)) throw new Error('--via must be lane or access')
// The request's way of asking for the person's Chrome.
const asked = via === 'access' ? { access: 'my-browser' } : { lane: 'my-browser' }
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

// A page in the person's Chrome may take the read's whole wait (ten minutes by default): no client timeout cuts it first.
const patient = new Agent({ headersTimeout: 0, bodyTimeout: 0 })

async function call(method, path, body) {
  const res = await fetch(`${api}${path}`, { method, dispatcher: patient, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
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
const contract = args.includes('--contract')
let batchId = null
let report = null
// The product's verification of a page, as this script compares it with its own verdict: passed, failed, or null when none came.
const productOf = (answer) => typeof answer?.verification?.status === 'string' && answer.verification.status !== 'not_requested' ? answer.verification.status : null
if (contract) {
  for (const task of tasks) {
    console.log(`${task.id}: its own scrape with its contract; Chrome asks for this site.`)
    const answer = await call('POST', '/v1/scrape', { url: task.url, ...asked, formats: ['markdown'], verify: { checks: task.predicates }, debug: true })
    const md = typeof answer.json?.markdown === 'string' ? answer.json.markdown : ''
    await writeFile(join(outDir, `${task.id}.md`), md)
    // How the read waited (its settle, loading and region waits), beside the page in the git-ignored run directory.
    const waits = (answer.json?.trace ?? []).filter((event) => ['steady_wait', 'loading_wait', 'region_wait'].includes(event.event))
    await writeFile(join(outDir, `${task.id}.waits.json`), JSON.stringify({ waits, readiness: answer.json?.readiness ?? null, verification: answer.json?.verification ?? null }, null, 2))
    const passed = task.predicates.map((p) => judge(p, md))
    results.push({
      task, route: 'scrape', status: answer.json?.status ?? `HTTP ${answer.status}`, reason: answer.json?.failureReason ?? answer.json?.blockReason ?? answer.json?.error ?? null, lane: answer.json?.lane ?? null,
      verified: answer.status === 200 && ['success', 'partial'].includes(answer.json?.status) && passed.every(Boolean),
      product: productOf(answer.json),
      completion: answer.json?.evidenceRecord?.access?.completion ?? null, executor: answer.json?.evidenceRecord?.access?.executor ?? null,
      wallMs: answer.json?.usage?.wallMs ?? null, note: (answer.json?.warnings ?? []).map((w) => w.code).join(', '),
    })
  }
}
const started = contract ? null : await call('POST', '/v1/batches', { urls: tasks.map((t) => t.url), ...asked, formats: ['markdown'] })
if (started !== null && started.status !== 202) throw new Error(`the batch was refused: HTTP ${started.status} ${JSON.stringify(started.json)}`)
if (started !== null) batchId = started.json.taskId ?? started.json.id
for (let last = ''; batchId !== null;) {
  report = (await call('GET', `/v1/batches/${batchId}`)).json
  const line = `${report.status}: ${report.completed}/${report.requested}${report.waitingForApproval === true ? ' (waiting for you to click Allow reading these sites in Chrome)' : ''}`
  if (line !== last) { console.log(line); last = line }
  if (!['pending', 'running'].includes(report.status)) break
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}
const items = []
for (let cursor; batchId !== null;) {
  const page = (await call('GET', `/v1/batches/${batchId}/items?debug=true&limit=50${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`)).json
  items.push(...page.items)
  if (!page.hasMore || page.nextCursor == null) break
  cursor = page.nextCursor
}
for (const task of batchId === null ? [] : tasks) {
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
  const answer = await call('POST', '/v1/scrape', { url: task.url, ...asked, formats: ['markdown'], debug: true })
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
const read = results.filter((r) => r.route === (contract ? 'scrape' : 'batch'))
const verified = read.filter((r) => r.verified).length
const browser = results.find((r) => r.executor !== null)?.executor ?? 'unknown'
console.log(`verified ${verified}/${read.length} pages ${contract ? 'read one scrape each' : 'of the batch'}; Markdown under ${outDir}`)
// With --contract: on how many pages the product's verification agreed with this script's verdict (a page without one stays in the denominator).
const judged = read.filter((r) => r.product !== null && r.product !== undefined)
const agreed = judged.filter((r) => (r.product === 'passed') === r.verified)
const agreement = contract ? `The product's verification agreed with this script's verdict on ${agreed.length} of ${read.length} pages (${judged.length} carried one)${judged.length === agreed.length ? '' : `; disagreed on ${judged.filter((r) => (r.product === 'passed') !== r.verified).map((r) => `${r.task.id} (product ${r.product}, script ${r.verified ? 'verified' : 'not verified'})`).join(', ')}`}${read.length === judged.length ? '' : `; none came for ${read.filter((r) => !judged.includes(r)).map((r) => r.task.id).join(', ')}`}.` : null
if (agreement !== null) console.log(agreement)

const recordFile = flag('--record')
if (recordFile !== undefined) {
  const where = (r) => r.task.login ? `${new URL(r.task.url).host} (behind your login)` : r.task.url
  const rows = results.map((r) => `| ${r.task.id} | ${r.route} | ${where(r)} | ${r.task.part} | ${r.task.baseline === null ? '—' : r.task.baseline ? 'verified' : 'not verified'} | ${r.status ?? '—'} | ${r.reason ?? ''} | ${r.lane ?? '—'} | ${r.completion ?? '—'} | ${r.verified ? 'yes' : 'no'} |${contract ? ` ${r.product ?? '—'} |` : ''} ${r.wallMs ?? '—'} | ${r.note} |`)
  const text = `# my-browser lane: real-page acceptance, ${startedAt.slice(0, 10)}

${via === 'access' ? 'ROADMAP PA item 7 (the one plain access choice) and item 8' : 'ROADMAP PA item 8'}${contract ? ', with each task sent as its contract (item 10)' : ''}. Pages read in the person's own Chrome through ${contract ? 'one scrape each' : 'one batch'} on \`${via === 'access' ? 'access' : 'lane'}: "my-browser"\`${contract ? ', each carrying its task\'s predicates as `verify`' : ''}.

- Command: \`node research/access/my-browser-check.mjs ${args.join(' ')}\`
- Source commit: \`${commit}\`${dirty ? ' (working tree had uncommitted changes)' : ''}
- API: ${api}, a local server on loopback (\`npm run api\`). Started ${startedAt}.
- Machine: ${platform()} ${release()}; browser as Chrome reported it: ${browser}.
- Network: the pages went out through Chrome's own network settings, not Octocrawl's; Octocrawl fetched nothing for them.
- Windows and Linux: not checked.
${batchId === null ? '' : `- Batch \`${batchId}\`: ${report.status}, ${report.completed}/${report.requested} pages.
`}
Verified ${verified} of ${read.length} ${contract ? 'pages' : 'batch pages'} (a page is verified only when it was read and every predicate of its task passed). The G0 baseline column is Octocrawl's own lanes in window A.${agreement === null ? '' : ` ${agreement} The Product column is the answer's \`verification.status\`.`}

| Task | Route | Page | Part | G0 baseline | Status | Reason | Lane | Completion | Verified |${contract ? ' Product |' : ''} Wall ms | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |${contract ? ' --- |' : ''} --- | --- |
${rows.join('\n')}
`
  await mkdir(dirname(join(repo, recordFile)), { recursive: true })
  await writeFile(join(repo, recordFile), text)
  console.log(`record written: ${recordFile}`)
}
