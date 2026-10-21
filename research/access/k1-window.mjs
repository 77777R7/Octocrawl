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
//   Ports are taken in the order standard, enhanced, installed_chrome, control; 8787, 8791, 8799 and 8812–8814 are refused.
//   Grants and keys are found as weekly.mjs finds them (this checkout's .w2l/access, else the main checkout's); keys are
//   never written anywhere. Work files: .w2l/access/k1/<date>-w<window>/ (git-ignored), with manifest.json.

import { spawn, execSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grantOf } from './runSetReport.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const windowNo = flag('--window')
if (!/^\d$/.test(windowNo ?? '')) throw new Error('--window 1 or 2')
const control = flag('--control') && resolve(flag('--control'))
if (!control || !existsSync(join(control, 'packages/api/dist/index.js'))) throw new Error('--control <dir>: a built checkout of the control commit')
const blocks = Number(flag('--blocks') ?? 4)
const ports = (flag('--ports') ?? '8821,8822,8823,8824').split(',').map(Number)
for (const p of ports) if ([8787, 8791, 8799, 8812, 8813, 8814].includes(p)) throw new Error(`port ${p} is reserved on this machine`)
const dryRun = args.includes('--dry-run')
const today = () => new Date().toISOString().slice(0, 10)
const date = flag('--date') ?? today()
const sh = (cmd, cwd = repo) => execSync(cmd, { cwd }).toString().trim()
const commit = sh('git rev-parse --short HEAD')
const controlCommit = sh('git rev-parse HEAD', control)
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
const LOCAL = ['standard', 'enhanced', 'installed_chrome', 'control']
const COMPETITORS = ['firecrawl', 'zenrows']
const rotated = (b) => LOCAL.map((_, i) => LOCAL[(i + b) % LOCAL.length])

const steelGrant = flag('--steel-grant') ?? localFile('.w2l/access/steel-grant.json')
// Window 1 ran the 16-task grant (09fdeafe…) outside its declared scope; from window 2 the installed_chrome arm takes the
// K1 grant Howard decided on 2026-10-21 (same settings, a statement naming K1), and the run refuses to start without it.
const icGrant = flag('--ic-grant') ?? (windowNo === '1' ? localFile('.w2l/access/installed-chrome-grant.json') : localFile('.w2l/access/installed-chrome-grant-k1.json'))
if (icGrant === null) throw new Error('no installed_chrome grant: window 2 needs .w2l/access/installed-chrome-grant-k1.json (or --ic-grant)')
const steel = grantOf(await readFile(steelGrant, 'utf8'))
const ic = grantOf(await readFile(icGrant, 'utf8'))
if (!steel.capabilities?.includes('vendor_remote_browser') || steel.capabilities.includes('vendor_residential_proxy')) throw new Error(`${steelGrant}: the Steel datacenter grant (vendor_remote_browser, never vendor_residential_proxy)`)
if (ic.capabilities?.join() !== 'installed_chrome') throw new Error(`${icGrant}: must name installed_chrome alone`)
const keys = { STEEL_API_KEY: await secret('STEEL_API_KEY'), FIRECRAWL_API_KEY: await secret('FIRECRAWL_API_KEY'), ZENROWS_API_KEY: await secret('ZENROWS_API_KEY') }
for (const [k, v] of Object.entries(keys)) if (!v) throw new Error(`${k} not found (environment or .w2l/access/competitors.env)`)

const workRel = `.w2l/access/k1/${date}-w${windowNo}`
const work = join(repo, workRel)
const arm = {
  standard: { port: ports[0], cwd: repo, commit: sh('git rev-parse HEAD'), access: '"standard"', env: {}, grant: null },
  enhanced: { port: ports[1], cwd: repo, commit: sh('git rev-parse HEAD'), access: '"enhanced"', env: { W2L_ACCESS_GRANT: steelGrant, W2L_VENDORS: 'steel', STEEL_API_KEY: keys.STEEL_API_KEY }, grant: steel },
  installed_chrome: { port: ports[2], cwd: repo, commit: sh('git rev-parse HEAD'), access: '"enhanced"', env: { W2L_ACCESS_GRANT: icGrant }, grant: ic },
  control: { port: ports[3], cwd: control, commit: controlCommit, access: '"enhanced"', env: { W2L_ACCESS_GRANT: steelGrant, W2L_VENDORS: 'steel', STEEL_API_KEY: keys.STEEL_API_KEY }, grant: steel },
}
console.log(`K1 window ${windowNo}, ${date}, runner ${commit}, control ${controlCommit.slice(0, 8)}; ${tasks.length} tasks in ${blockIds.length} blocks of ${size}; ports ${ports.join(',')}`)
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

const manifest = { window: Number(windowNo), date, runner: commit, control: controlCommit, tasks: tasks.length, blocks: blockIds, ports, grants: { steel: { file: steelGrant, sha256: steel.sha256, capabilities: steel.capabilities }, installed_chrome: { file: icGrant, sha256: ic.sha256, capabilities: ic.capabilities } }, proxy: { HTTPS_PROXY: process.env.HTTPS_PROXY ?? null, HTTP_PROXY: process.env.HTTP_PROXY ?? null, NO_PROXY: process.env.NO_PROXY ?? null }, credits: { before: {}, after: {} }, runs: [], failures: [] }
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
    ...(local ? ['--access', arm[name].access, '--raw-html', '--grant', arm[name].grant ? (name === 'installed_chrome' ? icGrant : steelGrant) : ''] : ['--target', name])]
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
async function withinCap(c, pages, what) {
  if (c !== 'zenrows') return true
  const u = await usage('zenrows')
  const ok = typeof u.usage_credits === 'number' && u.usage_credits + 25 * pages <= zenrowsCap
  if (!ok) { manifest.failures.push(`zenrows not started for ${what}: ${u.usage_credits ?? 'unknown'} credits used, worst case +${25 * pages} would pass the cap ${zenrowsCap}`); await saveManifest() }
  return ok
}

try {
  for (const name of LOCAL) await startApi(name)
  for (const [b, ids] of blockIds.entries()) {
    const since = Date.now()
    const comp = []
    for (const c of COMPETITORS) if (await withinCap(c, ids.length, `block ${b}`)) comp.push(runSet(c, `${c}-first-b${b}`, ids))
    for (const name of rotated(b)) await runSet(name, `${name}-first-b${b}`, ids)
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
    for (const name of rotated(blockIds.length)) if (retry[name].length > 0) await runSet(name, `${name}-retry`, retry[name])
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
