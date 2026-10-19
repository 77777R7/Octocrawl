// The weekly rerun of one set of tasks on three kinds of arm (docs/pa-enhancement-tasks.md P0.4; decision 7 of 2026-10-20).
//
// The set, for the week of the run date: the 25 healthy tasks, the 16 challenge tasks (research/access/subsets.v1.json,
// `challenge16`) and one rotation group of the other frozen tasks (36 in tasks.v1.json order, cut 10/10/10/6; the group is
// the ISO week number modulo 4, so nothing is stored between weeks). The arms:
//   free       Octocrawl's local API under a grant that names installed_chrome alone: the healthy and rotation tasks with
//              access "standard", the 16 challenge tasks with "enhanced" (the rung ADR 0005 accepted). No paid route.
//              When Chrome's major version differs from the previous weekly record's, the 16 tasks run a second time.
//   steel      the same API under the Steel datacenter grant (vendor_remote_browser, never vendor_residential_proxy),
//              W2L_VENDORS=steel and STEEL_API_KEY, every task with "enhanced".
//   firecrawl  Firecrawl Cloud through run-set.mjs --target firecrawl (its credits are checked first).
//   zenrows    ZenRows the same way (--target zenrows).
// Each arm is one or more run-set.mjs invocations (each sends the tasks' contracts; a competitor is never sent one); the
// runner's own record of each goes under .w2l/access/weekly/ (git-ignored) and is copied whole into the arm's committed
// record research/access/runs/<date>-weekly-<arm>-<commit>.md, under a header that names the week, the rotation group,
// the Chrome version and, for the free arm, the comparison with the installed_chrome acceptance baseline. One more record,
// <date>-weekly-summary-<commit>.md, puts the arms side by side: verified, false successes, p50, p95, cost, and the gap
// to the best competitor arm. An arm that could not run (a missing grant or key, too few credits, a runner failure) is
// written down as not_run with its reason, and the other arms still run; the summary keeps it.
//
// The API is started by this script on one fixed port (--port, default 8799; never 8787, 8791 or 8812–8814, which other
// things on this machine use), once for the free arm and once for the Steel arm, and stopped when the arm ends, also on a
// failure. Network: the shell's HTTPS_PROXY/HTTP_PROXY/NO_PROXY, which run-set.mjs records.
//
// Usage: node research/access/weekly.mjs [--arms free,steel,firecrawl,zenrows] [--date YYYY-MM-DD] [--port 8799]
//          [--ic-grant <file>] [--steel-grant <file>] [--min-credits <n>] [--dry-run]
//   --date       the run date the record names (default: today, local time); the ISO week of it picks the rotation group.
//   --ic-grant   the grant for the free arm (default .w2l/access/installed-chrome-grant.json of this checkout, else of the
//                main checkout). It must name installed_chrome alone. Never written by this script: the attestation is
//                Howard's.
//   --steel-grant the Steel grant (default .w2l/access/steel-grant.json, found the same way); vendor_residential_proxy
//                must not be in it.
//   --min-credits the fewest credits a competitor must have left before its arm runs (default: the number of tasks).
//   Keys: STEEL_API_KEY, FIRECRAWL_API_KEY, ZENROWS_API_KEY from the environment, else .w2l/access/competitors.env of this
//   checkout, else of the main checkout (as run-set.mjs reads them). Never written anywhere.
//
// Cost: the free arm pays nothing; the Steel arm's figure is what the spend ledger charged (its tariff estimate, not Steel's
// bill); a competitor's is the change in its account's usage between before and after its arm, as its own API reports it
// (Firecrawl: credits; ZenRows: credits and USD), beside the runner's inferred credits. Unknown stays unknown.

import { spawn, spawnSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grantOf } from './runSetReport.mjs'
import { IC16_BASELINE, baselineLine, chromeMajor, chromeOfRecord, summaryRows, weeklyHeaderLines, weeklySet } from './weeklyPlan.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const ARMS = ['free', 'steel', 'firecrawl', 'zenrows']
const arms = (flag('--arms') ?? ARMS.join(',')).split(',').map((s) => s.trim()).filter(Boolean)
for (const a of arms) if (!ARMS.includes(a)) throw new Error(`--arms: unknown arm ${a}; the arms are ${ARMS.join(', ')}`)
const port = Number(flag('--port') ?? 8799)
if ([8787, 8791, 8812, 8813, 8814].includes(port)) throw new Error(`--port ${port} is reserved on this machine`)
const dryRun = args.includes('--dry-run')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const date = flag('--date') ?? today()
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must be YYYY-MM-DD')
const sh = (cmd) => execSync(cmd, { cwd: repo }).toString().trim()
const commit = sh('git rev-parse --short HEAD')
const dirty = sh('git status --porcelain -- research packages docs') !== ''
const mainCheckout = dirname(sh('git rev-parse --path-format=absolute --git-common-dir'))
const checkouts = [...new Set([repo, mainCheckout])]
/** A git-ignored file of this checkout, else of the main checkout: a grant or the competitors' env file. */
const localFile = (rel) => checkouts.map((root) => join(root, rel)).find((p) => existsSync(p)) ?? null
async function secret(name) {
  if (process.env[name]) return process.env[name]
  for (const root of checkouts) {
    try {
      const line = (await readFile(join(root, '.w2l/access/competitors.env'), 'utf8')).split('\n').find((l) => l.trim().replace(/^export\s+/, '').startsWith(`${name}=`))
      const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
      if (value) return value
    } catch {}
  }
  return null
}

const taskFile = JSON.parse(await readFile(join(here, 'tasks.v1.json'), 'utf8'))
const subsets = JSON.parse(await readFile(join(here, 'subsets.v1.json'), 'utf8'))
const set = weeklySet(taskFile, subsets, new Date(`${date}T12:00:00Z`))
const minCredits = Number(flag('--min-credits') ?? set.all.length)
const recordPath = (arm) => `research/access/runs/${date}-weekly-${arm}-${commit}.md`
const workDir = join(repo, '.w2l/access/weekly', `${date}-${commit}`)
for (const arm of [...arms, 'summary']) if (existsSync(join(repo, recordPath(arm)))) throw new Error(`${recordPath(arm)} exists: a record is not rewritten; use --date for another run of the day or run from another commit`)
const scratchLabels = { free: ['free-standard', 'free-ic16', 'free-ic16-rerun'], steel: ['steel-all'], firecrawl: ['firecrawl-all'], zenrows: ['zenrows-all'] }
for (const arm of arms) for (const label of scratchLabels[arm]) if (existsSync(join(workDir, `${label}.md`))) throw new Error(`${join(workDir, `${label}.md`)} is left from an earlier run of this date and commit (run-set.mjs would refuse to rewrite it); move the directory away or use --date`)

const chromeVersion = (() => {
  for (const bin of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'google-chrome', 'google-chrome-stable']) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  return null
})()
/** The Chrome line of the latest earlier weekly free-arm record; before the first one, the P0.1 baseline's Chrome. */
async function previousChrome() {
  const dir = join(repo, 'research/access/runs')
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}-weekly-free-/.test(f) && f !== `${date}-weekly-free-${commit}.md`).sort()
  for (const f of files.reverse()) {
    const v = chromeOfRecord(await readFile(join(dir, f), 'utf8'))
    if (v !== null) return v
  }
  return 'Google Chrome 155.0.8059.80 (the P0.1 baseline, research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md)'
}
const prevChrome = await previousChrome()
const chromeRerun = chromeMajor(chromeVersion) !== null && chromeMajor(prevChrome) !== null && chromeMajor(chromeVersion) !== chromeMajor(prevChrome)

console.log(`weekly ${date} at ${commit}: week ${set.isoYear}-W${set.isoWeek}, rotation group ${set.group}; ${set.all.length} tasks (healthy ${set.healthy.length}, challenge ${set.challenge.length}, rotation ${set.rotation.length}: ${set.rotation.join(' ')}); Chrome ${chromeVersion ?? 'unknown'} (previous ${prevChrome}${chromeRerun ? '; major changed, 16 tasks twice' : ''}); arms ${arms.join(', ')}`)
if (dryRun) process.exit(0)
await mkdir(workDir, { recursive: true })

// ---- the local API on one port, started per arm with its own grant and stopped when the arm ends
const portFree = () => new Promise((res) => { const s = connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(false) }); s.once('error', () => res(true)) })
let api = null
async function startApi(label, env) {
  if (!(await portFree())) throw new Error(`port ${port} is in use; pick another with --port`)
  const log = join(workDir, `api-${label}.log`)
  const { createWriteStream } = await import('node:fs')
  const out = createWriteStream(log)
  await new Promise((r) => out.once('open', r))
  api = spawn('node', ['--import', 'tsx', 'packages/api/src/cli.ts', '--port', String(port)], { cwd: repo, env: { ...process.env, ...env }, stdio: ['ignore', out, out] })
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    if (api.exitCode !== null) throw new Error(`the API exited with ${api.exitCode} before listening; see ${log}`)
    if ((await readFile(log, 'utf8')).includes('listening')) return log
  }
  throw new Error(`the API did not listen within 180 s; see ${log}`)
}
async function stopApi() {
  if (api === null) return
  const p = api
  api = null
  if (p.exitCode === null) { p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { p.kill('SIGKILL'); r() }, 10_000); p.once('exit', () => { clearTimeout(t); r() }) }) }
}
process.on('exit', () => { if (api !== null && api.exitCode === null) api.kill('SIGKILL') })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (api !== null && api.exitCode === null) api.kill('SIGKILL'); process.exit(130) })

// ---- one run-set invocation: its record under workDir, its run directory's summary and attempts
async function runSet(label, argv, env) {
  const record = `.w2l/access/weekly/${date}-${commit}/${label}.md`
  const before = Date.now()
  const r = spawnSync('node', ['research/access/run-set.mjs', ...argv, '--record', record], { cwd: repo, env: { ...process.env, ...env }, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`run-set.mjs (${label}) exited with ${r.status}`)
  const runsDir = join(repo, '.w2l/access/runs')
  const dirs = (await readdir(runsDir)).filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort().reverse()
  for (const d of dirs) {
    const summaryFile = join(runsDir, d, 'summary.json')
    if (!existsSync(summaryFile)) continue
    const summary = JSON.parse(await readFile(summaryFile, 'utf8'))
    if (!summary.command.includes(record) || Date.parse(summary.environment.startedAt) < before - 60_000) continue
    const attempts = (await readFile(join(runsDir, d, 'attempts.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))
    const only = argv[argv.indexOf('--only') + 1].split(',')
    return { label, only, record: await readFile(join(repo, record), 'utf8'), summary, attempts, runDir: `.w2l/access/runs/${d}` }
  }
  throw new Error(`no run directory found for ${label}`)
}
const idsArg = (ids) => ids.join(',')
/** Verified / false-success / planned / attempted counts for the ids of one part, over the runs an arm made (a rerun of the 16 tasks is left out: it is reported on the baseline line). */
function partTotals(runs, ids) {
  const counted = runs.filter((r) => !r.label.endsWith('-rerun'))
  const want = new Set(ids)
  const rows = counted.flatMap((r) => r.attempts.filter((a) => a.temperature === 'cold' && want.has(a.taskId)))
  return { planned: ids.length, attempted: rows.length, verified: rows.filter((a) => a.outcome.verified).length, falseSuccess: rows.filter((a) => a.outcome.falseSuccess).length }
}
const parts = (runs) => ({ all: partTotals(runs, set.all), healthy: partTotals(runs, set.healthy), challenge: partTotals(runs, set.challenge), rotation: partTotals(runs, set.rotation) })
const combinedTotals = (runs) => {
  const rows = runs.filter((r) => !r.label.endsWith('-rerun')).flatMap((r) => r.attempts.filter((a) => a.temperature === 'cold'))
  const walls = rows.map((a) => a.outcome.wallMs).filter((v) => typeof v === 'number').sort((a, b) => a - b)
  const q = (p) => (walls.length === 0 ? null : Math.round(walls[Math.min(walls.length - 1, Math.floor(p * walls.length))])) // as run-set.mjs's pct
  return { attempts: rows.length, verified: rows.filter((a) => a.outcome.verified).length, falseSuccess: rows.filter((a) => a.outcome.falseSuccess).length, p50Ms: q(0.5), p95Ms: q(0.95) }
}
const notRunLine = (runs) => { const nr = runs.flatMap((r) => r.summary.denominator?.notRun ?? []); return `- Not run by the runner (its early stop): ${nr.length === 0 ? 'none' : nr.map((p) => p.taskId).join(', ')}` }
const partsLines = (p) => ['| Part | Planned | Attempted | Verified | False success |', '| --- | --- | --- | --- | --- |', ...['all', 'healthy', 'challenge', 'rotation'].map((k) => `| ${k} | ${p[k].planned} | ${p[k].attempted} | ${p[k].verified} | ${p[k].falseSuccess} |`)]
const runSection = (r) => ['', `## Run: ${r.label}`, '', `Raw run: \`${r.runDir}\` (git-ignored). The runner's own record of it follows.`, '', r.record.replace(/^# .*\n/, '').replace(/^#{1,2} /gm, '### ').trim()]

async function writeArmRecord(arm, title, headerExtra, runs, cost) {
  const p = parts(runs)
  const lines = [`# Weekly rerun: ${title}, ${date}`, '', ...weeklyHeaderLines({ date, commit: dirty ? `${commit} (working tree had uncommitted changes under research/, packages/ or docs/)` : commit, arm, set, chrome: chromeVersion, previousChrome: prevChrome, chromeRerun }), ...headerExtra, `- Cost: ${cost}`, notRunLine(runs), '', ...partsLines(p), ...runs.flatMap(runSection), '']
  await writeFile(join(repo, recordPath(arm)), lines.join('\n'))
  return p
}
async function writeNotRun(arm, title, reason, extra = []) {
  const lines = [`# Weekly rerun: ${title}, ${date}`, '', ...weeklyHeaderLines({ date, commit: dirty ? `${commit} (working tree had uncommitted changes under research/, packages/ or docs/)` : commit, arm, set, chrome: chromeVersion, previousChrome: prevChrome, chromeRerun }), ...extra, `- Not run: ${reason}`, '- Cost: $0 (nothing was fetched)', '', `Planned ${set.all.length}, attempted 0, not run ${set.all.length}: every task counts as not verified.`, '']
  await writeFile(join(repo, recordPath(arm)), lines.join('\n'))
  const zero = { planned: set.all.length, attempted: 0, verified: 0, falseSuccess: 0 }
  return { arm, competitor: arm === 'firecrawl' || arm === 'zenrows', totals: null, reason, cost: '$0', parts: { all: zero, healthy: { ...zero, planned: set.healthy.length }, challenge: { ...zero, planned: set.challenge.length }, rotation: { ...zero, planned: set.rotation.length } } }
}
const fail = (arm, title, e, extra) => { console.error(`${arm}: ${e.message}`); return writeNotRun(arm, title, e.message.replace(/\n/g, ' '), extra) }

// ---- the arms
async function freeArm() {
  const title = 'Octocrawl free arm'
  const grantFile = flag('--ic-grant') ?? localFile('.w2l/access/installed-chrome-grant.json')
  if (grantFile === null || !existsSync(grantFile)) return writeNotRun('free', title, 'no installed_chrome grant found (--ic-grant, or .w2l/access/installed-chrome-grant.json of this or the main checkout); the attestation is not written by this script')
  const grant = grantOf(await readFile(grantFile, 'utf8'))
  if (grant.capabilities === null || grant.capabilities.join() !== 'installed_chrome') return writeNotRun('free', title, `the grant ${grantFile} must name installed_chrome alone; it names ${grant.capabilities?.join(', ') ?? 'nothing readable'}`)
  const env = { W2L_ACCESS_GRANT: grantFile, W2L_API_URL: `http://127.0.0.1:${port}` }
  const runs = []
  const failures = []
  try {
    await startApi('free', env)
    runs.push(await runSet('free-standard', ['--set', 'all', '--only', idsArg([...set.healthy, ...set.rotation]), '--access', '"standard"'], env))
    runs.push(await runSet('free-ic16', ['--set', 'all', '--only', idsArg(set.challenge), '--access', '"enhanced"', '--save-responses'], env))
    if (chromeRerun) runs.push(await runSet('free-ic16-rerun', ['--set', 'all', '--only', idsArg(set.challenge), '--access', '"enhanced"', '--save-responses'], env))
  } catch (e) {
    await stopApi()
    if (runs.length === 0) return fail('free', title, e)
    failures.push(`- Not run (the arm stopped after ${runs.map((r) => r.label).join(', ')}): ${e.message.replace(/\n/g, ' ')}; the tasks of the runs not made stay in the denominator as not verified`)
    console.error(`free: ${e.message}; the record carries the runs that finished`)
  } finally { await stopApi() }
  const ic = runs.filter((r) => r.label.startsWith('free-ic16'))
  const extra = [
    `- API: http://127.0.0.1:${port}, started by this script with W2L_ACCESS_GRANT=${grantFile} (SHA-256 \`${grant.sha256}\`, capabilities: ${grant.capabilities.join(', ')}); the healthy and rotation tasks with access "standard", the 16 challenge tasks with "enhanced"; stopped after the arm`,
    ...ic.map((r) => `${baselineLine(r.summary.totals.cold?.verified ?? null)}${ic.length > 1 ? ` (run ${r.label})` : ''}`),
    ...(ic.length === 0 ? [baselineLine(null)] : []),
    ...failures,
  ]
  const p = await writeArmRecord('free', title, extra, runs, '$0 (no paid route; the Clash exit\'s bandwidth is not metered: unknown)')
  return { arm: 'free', competitor: false, totals: combinedTotals(runs), cost: '$0', parts: p, baseline: ic.map((r) => r.summary.totals.cold?.verified ?? null) }
}

async function steelArm() {
  const title = 'Steel enhanced arm'
  const grantFile = flag('--steel-grant') ?? localFile('.w2l/access/steel-grant.json')
  if (grantFile === null || !existsSync(grantFile)) return writeNotRun('steel', title, 'no Steel grant found (--steel-grant, or .w2l/access/steel-grant.json of this or the main checkout)')
  const grant = grantOf(await readFile(grantFile, 'utf8'))
  if (!grant.capabilities?.includes('vendor_remote_browser')) return writeNotRun('steel', title, `the grant ${grantFile} does not name vendor_remote_browser`)
  if (grant.capabilities.includes('vendor_residential_proxy')) return writeNotRun('steel', title, `the grant ${grantFile} names vendor_residential_proxy; the weekly Steel arm is the datacenter grant`)
  const key = await secret('STEEL_API_KEY')
  if (key === null) return writeNotRun('steel', title, 'STEEL_API_KEY is not set (environment or .w2l/access/competitors.env)')
  const env = { W2L_ACCESS_GRANT: grantFile, W2L_VENDORS: 'steel', STEEL_API_KEY: key, W2L_API_URL: `http://127.0.0.1:${port}` }
  let run
  try {
    await startApi('steel', env)
    run = await runSet('steel-all', ['--set', 'all', '--only', idsArg(set.all), '--access', '"enhanced"', '--save-responses'], env)
  } catch (e) { return fail('steel', title, e) } finally { await stopApi() }
  const t = run.summary.totals.cold
  const cost = t.chargedUsd === null || t.chargedUsd === undefined ? 'unknown' : `$${t.chargedUsd.toFixed(4)} charged by the spend ledger (${t.paidCalls} paid calls; the grant's tariff estimate, not Steel's bill)`
  const extra = [`- API: http://127.0.0.1:${port}, started by this script with W2L_ACCESS_GRANT=${grantFile} (SHA-256 \`${grant.sha256}\`, capabilities: ${grant.capabilities.join(', ')}), W2L_VENDORS=steel; every task with access "enhanced"; stopped after the arm`]
  const p = await writeArmRecord('steel', title, extra, [run], cost)
  return { arm: 'steel', competitor: false, totals: combinedTotals([run]), cost: t.chargedUsd === null || t.chargedUsd === undefined ? 'unknown' : `$${t.chargedUsd.toFixed(4)}`, parts: p }
}

/** A competitor's account usage as its API reports it, through the shell's proxy when one is set. */
async function usage(arm, key) {
  const { fetch: f, EnvHttpProxyAgent } = await import('undici')
  const opts = { dispatcher: new EnvHttpProxyAgent(), signal: AbortSignal.timeout(20_000) }
  if (arm === 'firecrawl') {
    const res = await f('https://api.firecrawl.dev/v2/team/credit-usage', { ...opts, headers: { authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(`Firecrawl credit-usage answered ${res.status}`)
    const d = (await res.json()).data
    return { remaining: d.remainingCredits, usedCredits: null, usedUsd: null, shown: `remaining ${d.remainingCredits} of plan ${d.planCredits}${d.billingPeriodEnd ? ` (period ends ${d.billingPeriodEnd})` : ''}` }
  }
  const res = await f('https://api.zenrows.com/v1/subscriptions/self/details', { ...opts, headers: { 'x-api-key': key } })
  if (!res.ok) throw new Error(`ZenRows subscription details answered ${res.status}`)
  const d = await res.json()
  const remaining = typeof d.credit_limit === 'number' && typeof d.usage_credits === 'number' ? d.credit_limit - d.usage_credits : null
  return { remaining, usedCredits: d.usage_credits ?? null, usedUsd: typeof d.usage === 'number' ? d.usage : null, shown: `used ${d.usage_credits ?? 'unknown'} of ${d.credit_limit ?? 'unknown'} credits this period (${d.status ?? 'status unknown'}, plan ${d.plan?.name ?? 'unknown'}${d.period_ends_at ? `, period ends ${d.period_ends_at}` : ''})` }
}
async function competitorArm(arm) {
  const title = arm === 'firecrawl' ? 'Firecrawl Cloud arm' : 'ZenRows arm'
  const keyName = arm === 'firecrawl' ? 'FIRECRAWL_API_KEY' : 'ZENROWS_API_KEY'
  const key = await secret(keyName)
  if (key === null) return writeNotRun(arm, title, `${keyName} is not set (environment or .w2l/access/competitors.env)`)
  let before
  try { before = await usage(arm, key) } catch (e) { return fail(arm, title, new Error(`the key could not be checked: ${e.message}`)) }
  const extra = [`- Account before the arm, as ${arm}'s API reports it: ${before.shown}`]
  if (before.remaining !== null && before.remaining < minCredits) return writeNotRun(arm, title, `${before.remaining} credits left, fewer than the ${minCredits} the arm needs (--min-credits); not started`, extra)
  let run
  try { run = await runSet(`${arm}-all`, ['--target', arm, '--set', 'all', '--only', idsArg(set.all), '--save-responses']) } catch (e) { return fail(arm, title, e, extra) }
  let after = null
  try { after = await usage(arm, key) } catch (e) { extra.push(`- Account after the arm: not read (${e.message})`) }
  const t = run.summary.totals.cold
  const inferred = t.credits === null || t.credits === undefined ? 'unknown' : String(t.credits)
  let cost = `credits by the runner's inference ${inferred}`
  if (after !== null) {
    extra.push(`- Account after the arm: ${after.shown}`)
    const used = arm === 'firecrawl' ? (before.remaining !== null && after.remaining !== null ? before.remaining - after.remaining : null) : (before.usedCredits !== null && after.usedCredits !== null ? after.usedCredits - before.usedCredits : null)
    const usd = arm === 'zenrows' && before.usedUsd !== null && after.usedUsd !== null ? after.usedUsd - before.usedUsd : null
    cost = `${used === null ? 'credits unknown' : `${used} credits`} by the account's usage before and after the arm${usd === null ? '' : ` ($${usd.toFixed(4)} as ZenRows prices them)`}; ${cost}`
  } else cost = `credits unknown (account not read after the arm); ${cost}`
  const p = await writeArmRecord(arm, title, extra, [run], cost)
  return { arm, competitor: true, totals: combinedTotals([run]), cost: cost.split(';')[0], parts: p }
}

const results = []
for (const arm of arms) results.push(await (arm === 'free' ? freeArm() : arm === 'steel' ? steelArm() : competitorArm(arm)))

// ---- the summary
const rows = summaryRows(results)
const fmt = (v) => (v === null || v === undefined ? 'unknown' : String(v))
const gapCell = (r, part) => (r.gap === null ? '-' : r.gap[part] === null ? 'unknown (no competitor arm ran)' : String(r.gap[part]))
const free = results.find((r) => r.arm === 'free')
const summary = [
  `# Weekly rerun: summary, ${date}`, '',
  ...weeklyHeaderLines({ date, commit: dirty ? `${commit} (working tree had uncommitted changes under research/, packages/ or docs/)` : commit, arm: 'summary', set, chrome: chromeVersion, previousChrome: prevChrome, chromeRerun }),
  `- Arms: ${results.map((r) => `${r.arm} (${r.totals === null ? 'not_run' : 'run'}, [record](${date}-weekly-${r.arm}-${commit}.md))`).join('; ')}; arms not asked for: ${ARMS.filter((a) => !arms.includes(a)).join(', ') || 'none'}`,
  `- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.`,
  ...(free && free.baseline ? [free.baseline.map((v) => baselineLine(v)).join('\n')] : []),
  '',
  '| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.arm} | ${r.status} | ${fmt(r.verified)} of ${r.parts.all.planned} | ${fmt(r.falseSuccess)} | ${fmt(r.p50Ms)} | ${fmt(r.p95Ms)} | ${r.cost} | ${gapCell(r, 'all')} |`),
  '',
  '| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.arm} | ${r.parts.healthy.verified} of ${r.parts.healthy.planned} | ${r.parts.challenge.verified} of ${r.parts.challenge.planned} | ${r.parts.rotation.verified} of ${r.parts.rotation.planned} | ${gapCell(r, 'healthy')} | ${gapCell(r, 'challenge')} | ${gapCell(r, 'rotation')} |`),
  '',
  'An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner\'s (research/access/run-set.mjs, cold attempts); each arm\'s record has the per-task table.', '',
]
await writeFile(join(repo, recordPath('summary')), summary.join('\n'))
console.log(summary.slice(summary.indexOf('') + 1).join('\n'))
console.log(`records: ${[...arms, 'summary'].map(recordPath).join(' ')}`)
