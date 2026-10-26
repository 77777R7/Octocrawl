// One window of the K1 competitor comparison (docs/pa-enhancement-tasks.md, Phase 4, K1): the 92 access tasks on six
// arms, interleaved on one UTC day, through run-set.mjs. The report is k1Report.mjs, from the manifest this writes.
//
// Arms (every Octocrawl arm through the shell's HTTPS_PROXY, with maxAge 0 and each task's contract, as run-set sends):
//   standard          this checkout's API, no grant, access "standard".
//   enhanced          this checkout's API, the Steel datacenter grant (never vendor_residential_proxy), W2L_VENDORS=steel,
//                     STEEL_API_KEY, access "enhanced".
//   installed_chrome  this checkout's API, the grant that names installed_chrome alone, access "enhanced".
//   control           the API of a checkout pinned to 2ffd7f25 (--control <dir>, built there), the Steel grant as
//                     `enhanced`, access "enhanced": the same-window main control of the done criteria.
//   combined          this checkout's API, one grant naming installed_chrome and the Steel grant's capabilities, budget and
//                     tariff (--combined-grant, default .w2l/access/combined-grant.json), W2L_VENDORS=steel, STEEL_API_KEY,
//                     access "enhanced": the combined-grant measurement after K1 (ROADMAP, PA bar, to measure next).
//   ic_compat         this checkout's API, a grant naming installed_chrome and compatible_transport (--ic-compat-grant,
//                     default .w2l/access/ic-compat-grant-k1.json), otherwise the K1 installed_chrome grant's settings, no
//                     Steel, access "enhanced": the local route without a paid vendor (Howard, 2026-10-27).
//   installed_chrome_base, combined_base, ic_compat_base
//                     installed_chrome, combined and ic_compat run by the API of another checkout (--base <dir>, built there), for an
//                     A/B of two engine commits on the same grants: the same window, the same blocks, an API process each.
//   firecrawl         run-set --target firecrawl (Firecrawl Cloud, its own strongest route).
//   zenrows           run-set --target zenrows (ZenRows mode=auto).
// Interleaving: the 92 tasks (tasks.v1.json order) are cut into --blocks blocks. In block b the four local arms run one
// after another, their order rotated by b (a Latin square, so no arm is always first or last), while the two competitor
// arms run the same block at the same time (they fetch from their own clouds, not this machine's exit). The next block
// starts when all six have finished. First calls only; then one retry pass: each arm sends again, once, every task it did
// not verify on its first call, in the same rotation; its result is reported apart, never in the first-call numbers.
// Each local arm has its own API process, port and W2L_TASK_ROOT, started before the first block and stopped at the end
// (also on a failure). A competitor's account usage is read before and after the window.
//
// Usage: node research/access/k1-window.mjs --window 1 --control <dir> [--date YYYY-MM-DD] [--blocks 4]
//          [--ports 8821,8822,8823,8824] [--steel-grant <file>] [--ic-grant <file>] [--no-retry] [--dry-run]
//          [--arms standard,installed_chrome,combined,firecrawl] [--combined-grant <file>] [--firecrawl-cap <credits>]
//          [--name k1] [--base <dir>] [--steel-cap <usd>] [--ic-compat-grant <file>]
//   --arms picks the arms (default the six above, without combined or the base arms); --control is needed only with the
//   control arm, --base only with a base arm. A base checkout's dist/ must match its source (runSetBuild.mjs), checked
//   at the start: run-set.mjs checks only this checkout's. List four arms as installed_chrome_base, combined_base,
//   installed_chrome, combined so each base arm runs before its new arm in half the blocks (k1Arms.mjs rotated).
//   --steel-cap stops a run of an arm with Steel from starting when the ledger's charges in this window so far, plus each
//   of its pages at the Steel tariff's price ceiling (one call a page, held to maxSessionMs), would pass the cap; the
//   manifest names each run it held back, and its tasks stay in the denominator as not run.
//   Ports are taken in the order the local arms are listed; 8787, 8791, 8799 and 8812–8814 are refused.
//   Grants and keys are found as weekly.mjs finds them (this checkout's .w2l/access, else the main checkout's); keys are
//   never written anywhere. Work files: .w2l/access/<name>/<date>-w<window>/ (git-ignored), with manifest.json.

import { spawn, execSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grantOf } from './runSetReport.mjs'
import { buildState } from './runSetBuild.mjs'
import { BASE_ARMS, baseOf, rotated as rotatedBy, steelCapAllows, withBaseArms } from './k1Arms.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const windowNo = flag('--window')
if (!/^\d$/.test(windowNo ?? '')) throw new Error('--window 1 or 2')
const ALL_LOCAL = ['standard', 'enhanced', 'installed_chrome', 'control', 'combined', 'ic_compat', ...BASE_ARMS]
const ALL_COMPETITORS = ['firecrawl', 'zenrows']
const chosen = (flag('--arms') ?? 'standard,enhanced,installed_chrome,control,firecrawl,zenrows').split(',')
for (const a of chosen) if (![...ALL_LOCAL, ...ALL_COMPETITORS].includes(a)) throw new Error(`--arms: unknown arm ${a}`)
const control = flag('--control') && resolve(flag('--control'))
if (chosen.includes('control') && (!control || !existsSync(join(control, 'packages/api/dist/index.js')))) throw new Error('--control <dir>: a built checkout of the control commit')
const baseDir = flag('--base') && resolve(flag('--base'))
if (chosen.some((a) => baseOf(a) !== null) && (!baseDir || !existsSync(join(baseDir, 'packages/api/dist/index.js')))) throw new Error('--base <dir>: a built checkout of the base commit')
const blocks = Number(flag('--blocks') ?? 4)
const ports = (flag('--ports') ?? '8821,8822,8823,8824').split(',').map(Number)
for (const p of ports) if ([8787, 8791, 8799, 8812, 8813, 8814].includes(p)) throw new Error(`port ${p} is reserved on this machine`)
const dryRun = args.includes('--dry-run')
const today = () => new Date().toISOString().slice(0, 10)
const date = flag('--date') ?? today()
const sh = (cmd, cwd = repo) => execSync(cmd, { cwd }).toString().trim()
const commit = sh('git rev-parse --short HEAD')
const controlCommit = control ? sh('git rev-parse HEAD', control) : null
const baseCommit = baseDir ? sh('git rev-parse HEAD', baseDir) : null
const mainCheckout = dirname(sh('git rev-parse --path-format=absolute --git-common-dir'))
const checkouts = [...new Set([repo, mainCheckout])]
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

const tasks = JSON.parse(await readFile(join(here, 'tasks.v1.json'), 'utf8')).tasks.map((t) => t.id)
const size = Math.ceil(tasks.length / blocks)
const blockIds = Array.from({ length: blocks }, (_, b) => tasks.slice(b * size, (b + 1) * size)).filter((ids) => ids.length > 0)
const LOCAL = chosen.filter((a) => ALL_LOCAL.includes(a))
const COMPETITORS = chosen.filter((a) => ALL_COMPETITORS.includes(a))
const rotated = (b) => rotatedBy(LOCAL, b)
const family = (a) => baseOf(a) ?? a

const steelGrant = flag('--steel-grant') ?? localFile('.w2l/access/steel-grant.json')
// Window 1 ran the 16-task grant (09fdeafe…) outside its declared scope; from window 2 the installed_chrome arm takes the
// K1 grant Howard decided on 2026-10-21 (same settings, a statement naming K1), and the run refuses to start without it.
const icGrant = flag('--ic-grant') ?? (windowNo === '1' ? localFile('.w2l/access/installed-chrome-grant.json') : localFile('.w2l/access/installed-chrome-grant-k1.json'))
if (icGrant === null) throw new Error('no installed_chrome grant: window 2 needs .w2l/access/installed-chrome-grant-k1.json (or --ic-grant)')
const steel = grantOf(await readFile(steelGrant, 'utf8'))
const ic = grantOf(await readFile(icGrant, 'utf8'))
if (!steel.capabilities?.includes('vendor_remote_browser') || steel.capabilities.includes('vendor_residential_proxy')) throw new Error(`${steelGrant}: the Steel datacenter grant (vendor_remote_browser, never vendor_residential_proxy)`)
if (ic.capabilities?.join() !== 'installed_chrome') throw new Error(`${icGrant}: must name installed_chrome alone`)
// The combined grant holds installed_chrome and exactly the Steel grant's capabilities; its budget and tariff are checked
// against the Steel grant's by the engine's own parser below, so a typo cannot give the arm more or less than the two.
const combinedGrant = flag('--combined-grant') ?? localFile('.w2l/access/combined-grant.json')
let combined = null
if (LOCAL.some((a) => family(a) === 'combined')) {
  if (combinedGrant === null) throw new Error('no combined grant: .w2l/access/combined-grant.json (or --combined-grant)')
  combined = grantOf(await readFile(combinedGrant, 'utf8'))
  if ([...(combined.capabilities ?? [])].sort().join() !== ['installed_chrome', ...steel.capabilities].sort().join()) throw new Error(`${combinedGrant}: must name installed_chrome and the Steel grant's capabilities, nothing else`)
  const { accessGrantFromText } = await import('../../packages/http-core/dist/accessGrant.js')
  const settings = async (f) => { const { attestation, sha256, capabilities, ...rest } = accessGrantFromText(await readFile(f, 'utf8')); return JSON.stringify(rest) }
  if (await settings(combinedGrant) !== await settings(steelGrant)) throw new Error(`${combinedGrant}: its tier, budget, scope or tariffs differ from ${steelGrant}`)
}
// The ic_compat grant holds installed_chrome and compatible_transport; the rest of it is checked against the K1
// installed_chrome grant's by the engine's own parser, as the combined grant is against the Steel grant's.
const icCompatGrant = flag('--ic-compat-grant') ?? localFile('.w2l/access/ic-compat-grant-k1.json')
let icCompat = null
if (LOCAL.some((a) => family(a) === 'ic_compat')) {
  if (icCompatGrant === null) throw new Error('no ic_compat grant: .w2l/access/ic-compat-grant-k1.json (or --ic-compat-grant)')
  icCompat = grantOf(await readFile(icCompatGrant, 'utf8'))
  if ([...(icCompat.capabilities ?? [])].sort().join() !== 'compatible_transport,installed_chrome') throw new Error(`${icCompatGrant}: must name installed_chrome and compatible_transport, nothing else`)
  const { accessGrantFromText } = await import('../../packages/http-core/dist/accessGrant.js')
  const settings = async (f) => { const { attestation, sha256, capabilities, ...rest } = accessGrantFromText(await readFile(f, 'utf8')); return JSON.stringify(rest) }
  if (await settings(icCompatGrant) !== await settings(icGrant)) throw new Error(`${icCompatGrant}: its tier, budget, scope or tariffs differ from ${icGrant}`)
}
const needs = { STEEL_API_KEY: LOCAL.some((a) => ['enhanced', 'control', 'combined'].includes(family(a))), FIRECRAWL_API_KEY: COMPETITORS.includes('firecrawl'), ZENROWS_API_KEY: COMPETITORS.includes('zenrows') }
const keys = {}
for (const k of Object.keys(needs)) keys[k] = await secret(k)
for (const [k, v] of Object.entries(keys)) if (needs[k] && !v) throw new Error(`${k} not found (environment or .w2l/access/competitors.env)`)

const workRel = `.w2l/access/${flag('--name') ?? 'k1'}/${date}-w${windowNo}`
const work = join(repo, workRel)
if (ports.length < LOCAL.length) throw new Error(`--ports: ${LOCAL.length} local arms need ${LOCAL.length} ports`)
const portOf = (name) => ports[LOCAL.indexOf(name)]
const arm = withBaseArms({
  standard: { port: portOf('standard'), cwd: repo, commit: sh('git rev-parse HEAD'), access: '"standard"', env: {}, grant: null, grantFile: null },
  enhanced: { port: portOf('enhanced'), cwd: repo, commit: sh('git rev-parse HEAD'), access: '"enhanced"', env: { W2L_ACCESS_GRANT: steelGrant, W2L_VENDORS: 'steel', STEEL_API_KEY: keys.STEEL_API_KEY }, grant: steel, grantFile: steelGrant },
  installed_chrome: { port: portOf('installed_chrome'), cwd: repo, commit: sh('git rev-parse HEAD'), access: '"enhanced"', env: { W2L_ACCESS_GRANT: icGrant }, grant: ic, grantFile: icGrant },
  control: { port: portOf('control'), cwd: control, commit: controlCommit, access: '"enhanced"', env: { W2L_ACCESS_GRANT: steelGrant, W2L_VENDORS: 'steel', STEEL_API_KEY: keys.STEEL_API_KEY }, grant: steel, grantFile: steelGrant },
  combined: { port: portOf('combined'), cwd: repo, commit: sh('git rev-parse HEAD'), access: '"enhanced"', env: { W2L_ACCESS_GRANT: combinedGrant, W2L_VENDORS: 'steel', STEEL_API_KEY: keys.STEEL_API_KEY }, grant: combined, grantFile: combinedGrant },
  ic_compat: { port: portOf('ic_compat'), cwd: repo, commit: sh('git rev-parse HEAD'), access: '"enhanced"', env: { W2L_ACCESS_GRANT: icCompatGrant }, grant: icCompat, grantFile: icCompatGrant },
}, baseDir ? { dir: baseDir, commit: baseCommit } : null, portOf)
// The base checkout's dist/ against its source: run-set.mjs sees only this checkout's build, not the API's of another.
const baseBuild = baseDir && LOCAL.some((a) => baseOf(a) !== null) ? buildState(baseDir) : null
if (baseBuild !== null && baseBuild.upToDate !== true) throw new Error(`--base ${baseDir}: its packages/*/dist does not match its source (${baseBuild.stale?.join(', ') ?? baseBuild.error}); run npx tsc --build there`)
const steelCap = flag('--steel-cap') === undefined ? null : Number(flag('--steel-cap'))
if (steelCap !== null && !(steelCap >= 0)) throw new Error('--steel-cap <usd>: a number of US dollars')
// A page makes one Steel call (the ladder's one Steel rung), and the ledger charges a call at most the tariff's price
// ceiling (the engine's own tariffCeilingUsd, Steel's shortest session as the floor) unless it prices bytes or solves.
let steelCeiling = null
if (steelCap !== null) {
  const { accessGrantFromText, tariffCeilingUsd } = await import('../../packages/http-core/dist/accessGrant.js')
  const { STEEL_MIN_SESSION_MS } = await import('../../packages/bench/dist/vendors/steel.js')
  const tariff = accessGrantFromText(await readFile(steelGrant, 'utf8')).tariffs?.steel
  if (!tariff || tariff.maxSessionMs === null || tariff.perGbUsd > 0 || tariff.perSolveUsd > 0) throw new Error(`--steel-cap: the Steel grant's tariff does not bound a page's charge (${steelGrant})`)
  steelCeiling = tariffCeilingUsd(tariff, STEEL_MIN_SESSION_MS)
}
console.log(`window ${windowNo}, ${date}, runner ${commit}, control ${controlCommit?.slice(0, 8) ?? 'none'}, base ${baseCommit?.slice(0, 8) ?? 'none'}; arms ${chosen.join(',')}; ${tasks.length} tasks in ${blockIds.length} blocks of ${size}; ports ${LOCAL.map((a) => `${a}=${portOf(a)}`).join(',')}`)
for (const [b, ids] of blockIds.entries()) console.log(`block ${b}: ${ids[0]}…${ids.at(-1)} (${ids.length}); local order ${rotated(b).join(' → ')}`)
if (dryRun) process.exit(0)
if (existsSync(join(work, 'manifest.json'))) throw new Error(`${workRel}/manifest.json exists: this window was run; use another --date or --window`)
await mkdir(work, { recursive: true })

/** A competitor's account usage as its API reports it (weekly.mjs's reading), through the shell's proxy. */
async function usage(name) {
  const { EnvHttpProxyAgent, fetch: f } = await import('undici')
  const opts = { dispatcher: new EnvHttpProxyAgent(), signal: AbortSignal.timeout(30_000) }
  try {
    if (name === 'firecrawl') {
      const res = await f('https://api.firecrawl.dev/v2/team/credit-usage', { ...opts, headers: { authorization: `Bearer ${keys.FIRECRAWL_API_KEY}` } })
      return { at: new Date().toISOString(), status: res.status, ...(res.ok ? (await res.json()).data : {}) }
    }
    const res = await f('https://api.zenrows.com/v1/subscriptions/self/details', { ...opts, headers: { 'x-api-key': keys.ZENROWS_API_KEY } })
    const d = res.ok ? await res.json() : {}
    return { at: new Date().toISOString(), status: res.status, credit_limit: d.credit_limit, usage_credits: d.usage_credits, usage: d.usage, period_ends_at: d.period_ends_at, plan: d.plan?.name, accountStatus: d.status }
  } catch (e) { return { at: new Date().toISOString(), error: e.message } }
}

const manifest = { window: Number(windowNo), date, runner: commit, control: controlCommit, ...(baseCommit ? { base: { dir: baseDir, commit: baseCommit, build: baseBuild } } : {}), ...(steelCap === null ? {} : { steelCap: { usd: steelCap, pageCeilingUsd: steelCeiling } }), arms: chosen, tasks: tasks.length, blocks: blockIds, ports, grants: { steel: { file: steelGrant, sha256: steel.sha256, capabilities: steel.capabilities }, installed_chrome: { file: icGrant, sha256: ic.sha256, capabilities: ic.capabilities }, ...(combined ? { combined: { file: combinedGrant, sha256: combined.sha256, capabilities: combined.capabilities } } : {}), ...(icCompat ? { ic_compat: { file: icCompatGrant, sha256: icCompat.sha256, capabilities: icCompat.capabilities } } : {}) }, proxy: { HTTPS_PROXY: process.env.HTTPS_PROXY ?? null, HTTP_PROXY: process.env.HTTP_PROXY ?? null, NO_PROXY: process.env.NO_PROXY ?? null }, credits: { before: {}, after: {} }, runs: [], failures: [] }
const saveManifest = () => writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
for (const c of COMPETITORS) manifest.credits.before[c] = await usage(c)
await saveManifest()

// ---- the four local APIs
const procs = {}
const portFree = (port) => new Promise((res) => { const s = connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(false) }); s.once('error', () => res(true)) })
async function startApi(name) {
  const a = arm[name]
  if (!(await portFree(a.port))) throw new Error(`port ${a.port} is in use`)
  const log = join(work, `api-${name}.log`)
  const out = createWriteStream(log)
  await new Promise((r) => out.once('open', r))
  const env = { ...process.env, ...a.env, W2L_TASK_ROOT: join(work, `api-${name}`), W2L_SOURCE_COMMIT: a.commit }
  procs[name] = spawn('node', ['--import', 'tsx', 'packages/api/src/cli.ts', '--port', String(a.port)], { cwd: a.cwd, env, stdio: ['ignore', out, out] })
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    if (procs[name].exitCode !== null) throw new Error(`the ${name} API exited with ${procs[name].exitCode}; see ${log}`)
    if ((await readFile(log, 'utf8')).includes('listening')) return
  }
  throw new Error(`the ${name} API did not listen within 180 s`)
}
const stopAll = async () => {
  for (const p of Object.values(procs)) if (p.exitCode === null) { p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { p.kill('SIGKILL'); r() }, 10_000); p.once('exit', () => { clearTimeout(t); r() }) }) }
}
process.on('exit', () => { for (const p of Object.values(procs)) if (p.exitCode === null) p.kill('SIGKILL') })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const p of Object.values(procs)) if (p.exitCode === null) p.kill('SIGKILL'); process.exit(130) })

// run-set names its run directory by its start time in ms: starts are spaced so two never share one.
let nextStart = 0
async function spaced() { const at = Math.max(Date.now(), nextStart); nextStart = at + 1500; if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now())) }
/** One run-set invocation; resolves to its manifest entry (the run directory found by its record path). */
async function runSet(name, label, ids) {
  await spaced()
  const record = `${workRel}/${label}.md`
  const local = LOCAL.includes(name)
  const argv = ['research/access/run-set.mjs', '--set', 'all', '--only', ids.join(','), '--save-responses', '--record', record,
    ...(local ? ['--access', arm[name].access, '--raw-html', '--grant', arm[name].grantFile ?? ''] : ['--target', name])]
  if (local && arm[name].grant === null) argv.splice(argv.indexOf('--grant'), 2)
  const env = { ...process.env, ...(local ? { W2L_API_URL: `http://127.0.0.1:${arm[name].port}` } : { [name === 'firecrawl' ? 'FIRECRAWL_API_KEY' : 'ZENROWS_API_KEY']: keys[name === 'firecrawl' ? 'FIRECRAWL_API_KEY' : 'ZENROWS_API_KEY'] }), ...(local ? { W2L_EGRESS_ECHO_URL: 'https://api.ipify.org' } : {}) }
  const startedAt = new Date().toISOString()
  const out = createWriteStream(join(work, `${label}.log`))
  await new Promise((r) => out.once('open', r))
  return new Promise((res) => {
    const p = spawn('node', argv, { cwd: repo, env, stdio: ['ignore', out, out] })
    p.once('exit', async (code) => {
      const entry = { arm: name, label, ids, startedAt, finishedAt: new Date().toISOString(), exitCode: code, record, runDir: null }
      const runsDir = join(repo, '.w2l/access/runs')
      for (const d of (await readdir(runsDir)).sort().reverse()) {
        const f = join(runsDir, d, 'summary.json')
        // the same record path recurs when an aborted window is moved aside and rerun: take only a run this invocation started
        if (!existsSync(f)) continue
        const sm = JSON.parse(await readFile(f, 'utf8'))
        if (sm.command.includes(record) && Date.parse(sm.environment.startedAt) >= Date.parse(startedAt) - 5000) { entry.runDir = `.w2l/access/runs/${d}`; break }
      }
      if (code !== 0) manifest.failures.push(`${label}: run-set exited with ${code}; see ${workRel}/${label}.log`)
      manifest.runs.push(entry)
      await saveManifest()
      console.log(`${label}: exit ${code}, ${entry.runDir ?? 'no run directory'}`)
      res(entry)
    })
  })
}

const notVerified = async (name, ids, phase) => {
  const done = manifest.runs.filter((r) => r.arm === name && r.label.includes(phase) && r.runDir)
  const ok = new Set()
  for (const r of done) for (const l of (await readFile(join(repo, r.runDir, 'attempts.jsonl'), 'utf8')).split('\n').filter(Boolean)) { const a = JSON.parse(l); if (a.temperature === 'cold' && a.outcome.verified) ok.add(a.taskId) }
  return ids.filter((id) => !ok.has(id))
}

// A Mac that sleeps (a closed lid on battery: the first attempt of window 1 on 2026-10-21) stalls every arm at once and
// is not the sites' failure. pmset's log is read after each block; a sleep inside it stops the window, and the manifest
// names it, so no number is taken from a run the machine slept through.
function sleepsSince(fromMs) {
  let log = ''
  try { log = execSync('pmset -g log', { maxBuffer: 256 * 1024 * 1024 }).toString() } catch { return null }
  return log.split('\n').flatMap((l) => {
    const m = l.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) Sleep\s+(Entering Sleep state due to '[^']*')/)
    const at = m && Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`)
    return m && at >= fromMs ? [`${new Date(at).toISOString()} ${m[5]}`] : []
  })
}
const checkAwake = async (since, what) => {
  const s = sleepsSince(since)
  manifest.sleepChecks = [...(manifest.sleepChecks ?? []), { what, since: new Date(since).toISOString(), sleeps: s }]
  await saveManifest()
  if (s !== null && s.length > 0) throw new Error(`the machine slept during ${what}: ${s.slice(0, 3).join('; ')}`)
}

// ZenRows' trial is shared with window 2 (Howard, 2026-10-21): an arm whose worst case (25 credits a page, its JS and
// premium-proxy price) would take the account past --zenrows-cap used credits (default 4700) is not started, and the
// manifest says so.
const zenrowsCap = Number(flag('--zenrows-cap') ?? 4700)
// --firecrawl-cap caps the credits this window may spend at Firecrawl: a run is not started when the credits spent since
// the window's first reading plus 1.5 a page (K1's first calls averaged 110 and 112 credits for 92 pages) would pass it.
const firecrawlCap = flag('--firecrawl-cap') === undefined ? null : Number(flag('--firecrawl-cap'))
async function withinCap(c, pages, what) {
  if (c === 'firecrawl' && firecrawlCap !== null) {
    const u = await usage('firecrawl'), b = manifest.credits.before.firecrawl
    const spent = typeof u.remainingCredits === 'number' && typeof b?.remainingCredits === 'number' ? b.remainingCredits - u.remainingCredits : null
    const ok = spent !== null && spent + 1.5 * pages <= firecrawlCap
    if (!ok) { manifest.failures.push(`firecrawl not started for ${what}: ${spent ?? 'unknown'} credits spent in this window, +${1.5 * pages} expected would pass the cap ${firecrawlCap}`); await saveManifest() }
    return ok
  }
  if (c !== 'zenrows') return true
  const u = await usage('zenrows')
  const ok = typeof u.usage_credits === 'number' && u.usage_credits + 25 * pages <= zenrowsCap
  if (!ok) { manifest.failures.push(`zenrows not started for ${what}: ${u.usage_credits ?? 'unknown'} credits used, worst case +${25 * pages} would pass the cap ${zenrowsCap}`); await saveManifest() }
  return ok
}

/** Whether an arm's run may start under --steel-cap: an arm without Steel always may. */
async function withinSteelCap(name, pages, what) {
  if (steelCap === null || !arm[name].env.STEEL_API_KEY) return true
  const charged = []
  for (const r of manifest.runs.filter((x) => x.runDir && arm[x.arm]?.env.STEEL_API_KEY)) {
    for (const l of (await readFile(join(repo, r.runDir, 'attempts.jsonl'), 'utf8')).split('\n').filter(Boolean)) charged.push(JSON.parse(l).outcome?.chargedUsd)
  }
  const check = steelCapAllows({ charged, pages, capUsd: steelCap, pageCeilingUsd: steelCeiling })
  if (!check.ok) { manifest.failures.push(`${name} not started for ${what}: $${check.spentUsd?.toFixed(4)} charged in this window, +${pages} pages at $${steelCeiling.toFixed(4)} would pass the Steel cap $${steelCap}`); await saveManifest() }
  return check.ok
}

try {
  for (const name of LOCAL) await startApi(name)
  for (const [b, ids] of blockIds.entries()) {
    const since = Date.now()
    const comp = []
    for (const c of COMPETITORS) if (await withinCap(c, ids.length, `block ${b}`)) comp.push(runSet(c, `${c}-first-b${b}`, ids))
    for (const name of rotated(b)) if (await withinSteelCap(name, ids.length, `block ${b}`)) await runSet(name, `${name}-first-b${b}`, ids)
    await Promise.all(comp)
    await checkAwake(since, `block ${b}`)
  }
  for (const c of COMPETITORS) manifest.credits.afterFirst = { ...manifest.credits.afterFirst, [c]: await usage(c) }
  await saveManifest()
  if (!args.includes('--no-retry')) {
    const retry = {}
    for (const name of [...LOCAL, ...COMPETITORS]) retry[name] = await notVerified(name, tasks, 'first')
    manifest.retryPlanned = retry
    await saveManifest()
    const comp = []
    for (const c of COMPETITORS) if (retry[c].length > 0 && await withinCap(c, retry[c].length, 'the retry pass')) comp.push(runSet(c, `${c}-retry`, retry[c]))
    const since = Date.now()
    for (const name of rotated(blockIds.length)) if (retry[name].length > 0 && await withinSteelCap(name, retry[name].length, 'the retry pass')) await runSet(name, `${name}-retry`, retry[name])
    await Promise.all(comp)
    await checkAwake(since, 'the retry pass')
  }
} catch (e) {
  manifest.failures.push(`window stopped: ${e.message}`)
  console.error(e.message)
} finally {
  await stopAll()
  for (const c of COMPETITORS) manifest.credits.after[c] = await usage(c)
  manifest.finishedAt = new Date().toISOString()
  await saveManifest()
}
