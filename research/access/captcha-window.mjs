// One window of the CAPTCHA and DataDome measurement: the frozen tasks of research/access/captcha-tasks.v1.json on each
// arm, through run-set.mjs (--tasks, --arm). The report is captcha-report.mjs, from the manifest this writes.
//
// Arms (every one through the shell's HTTPS_PROXY, maxAge 0 and each task's contract, as run-set sends):
//   standard          this checkout's API, no grant, access "standard".
//   installed_chrome  this checkout's API, the grant naming installed_chrome alone (--ic-grant, default
//                     .w2l/access/installed-chrome-grant-k1.json), access "enhanced".
//   combined          this checkout's API, the combined installed_chrome + Steel grant written for the combined-grant
//                     measurement (--combined-grant, default .w2l/access/combined-grant.json), W2L_VENDORS=steel and
//                     STEEL_API_KEY, access "enhanced".
//   <arm>+solver      (always access "enhanced": standard+solver is the standard arm's rungs with a grant adding the solver)      the same arm with the third-party solver: its grant from --solver-grants <arm>=<file>[,…], which must
//                     list third_party_captcha_solver (ADR 0005), and --solver-env NAME[,NAME…], the environment variables
//                     the solver needs (read like the other keys, never written anywhere). An arm whose grant or key is
//                     missing is not started: the manifest names it and why, and the report counts all its tasks not run.
//                     `<arm>+solver-<label>` (e.g. installed_chrome+solver-proxy, installed_chrome+solver-none) runs two
//                     solver arms on one base. A grant whose solver.egress is "proxy" gets its run's exit in
//                     W2L_SOLVER_PROXY from the environment variable --solver-exits <arm>=NAME names (default
//                     W2L_SOLVER_PROXY; one sticky session per arm, so two arms never share an exit), never written
//                     anywhere; every other arm's API is started without W2L_SOLVER_PROXY. With a solver arm and
//                     CAPSOLVER_API_KEY, CapSolver's getBalance is read through the shell's proxy before the first block
//                     and after the last, into the manifest (the balance only).
// Interleaving: the tasks (file order) are cut into --blocks blocks; in block b the arms run one after another, their
// order rotated by b, so no arm is always first. First calls only. Each arm has its own API process, port and
// W2L_TASK_ROOT, started before the first block and stopped at the end (also on a failure).
//
// Usage: node research/access/captcha-window.mjs --window 1 [--arms standard,installed_chrome,combined] [--date YYYY-MM-DD]
//          [--blocks 3] [--ports 8841,8842,…] [--ic-grant <file>] [--combined-grant <file>]
//          [--solver-grants standard+solver=<file>,…] [--solver-env CAPSOLVER_API_KEY] [--solver-providers capsolver]
//          [--solver-exits installed_chrome+solver-proxy=W2L_SOLVER_PROXY_IC,…]
//          [--only C001,T045] [--dry-run]
//   Ports are taken in --arms order; 8787, 8791, 8799 and 8812–8814 are refused. Work files:
//   .w2l/access/captcha/<date>-w<window>/ (git-ignored), with manifest.json. --dry-run prints the plan and which arms
//   would not start, and starts nothing.

import { spawn, execSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grantOf } from './runSetReport.mjs'
import { baseArmOf } from './captchaReport.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const list = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const windowNo = flag('--window')
if (!/^\d$/.test(windowNo ?? '')) throw new Error('--window 1 or 2')
const armNames = list(flag('--arms') ?? 'standard,installed_chrome,combined')
const BASES = ['standard', 'installed_chrome', 'combined']
for (const a of armNames) if (!BASES.includes(baseArmOf(a) ?? a)) throw new Error(`unknown arm ${a}: ${BASES.join(', ')}, each optionally +solver`)
const blocks = Number(flag('--blocks') ?? 3)
const ports = list(flag('--ports') ?? armNames.map((_, i) => 8841 + i).join(',')).map(Number)
if (ports.length < armNames.length) throw new Error('--ports needs one port per arm')
for (const p of ports) if ([8787, 8791, 8799, 8812, 8813, 8814].includes(p)) throw new Error(`port ${p} is reserved on this machine`)
const dryRun = args.includes('--dry-run')
const date = flag('--date') ?? new Date().toISOString().slice(0, 10)
const sh = (cmd) => execSync(cmd, { cwd: repo }).toString().trim()
const commit = sh('git rev-parse --short HEAD')
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

const TASKS_FILE = 'research/access/captcha-tasks.v1.json'
const only = flag('--only') === undefined ? null : list(flag('--only'))
const tasks = JSON.parse(await readFile(join(repo, TASKS_FILE), 'utf8')).tasks.map((t) => t.id).filter((id) => only === null || only.includes(id))
const size = Math.ceil(tasks.length / blocks)
const blockIds = Array.from({ length: blocks }, (_, b) => tasks.slice(b * size, (b + 1) * size)).filter((ids) => ids.length > 0)

// Each arm's grant, environment and access, or why it cannot start.
const grantFiles = { installed_chrome: flag('--ic-grant') ?? localFile('.w2l/access/installed-chrome-grant-k1.json'), combined: flag('--combined-grant') ?? localFile('.w2l/access/combined-grant.json') }
const solverGrants = Object.fromEntries(list(flag('--solver-grants')).map((kv) => [kv.slice(0, kv.indexOf('=')), resolve(kv.slice(kv.indexOf('=') + 1))]))
const solverEnv = list(flag('--solver-env'))
const solverExits = Object.fromEntries(list(flag('--solver-exits')).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]))
const steelKey = armNames.some((a) => (baseArmOf(a) ?? a) === 'combined') ? await secret('STEEL_API_KEY') : null
const arms = {}
const notStarted = []
// Each arm's exit, as a phrase for the record (never the proxy's address or login).
const exits = {}
for (const [i, name] of armNames.entries()) {
  const base = baseArmOf(name) ?? name
  const why = []
  let file = base === 'standard' ? null : grantFiles[base]
  if (baseArmOf(name) !== null) file = solverGrants[name] ?? null
  let grant = null
  if (base !== 'standard' || baseArmOf(name) !== null) {
    if (file === null || !existsSync(file)) why.push(`no grant file${file ? ` at ${file}` : ''}${baseArmOf(name) !== null ? ' (--solver-grants)' : ''}`)
    else grant = grantOf(await readFile(file, 'utf8'))
  }
  const caps = grant?.capabilities ?? []
  if (grant !== null) {
    if (base === 'installed_chrome' && !caps.includes('installed_chrome')) why.push(`${file} does not list installed_chrome`)
    if (base === 'installed_chrome' && baseArmOf(name) === null && caps.join() !== 'installed_chrome') why.push(`${file} must name installed_chrome alone`)
    if (base === 'combined' && !(caps.includes('installed_chrome') && caps.includes('vendor_remote_browser'))) why.push(`${file} is not the combined grant (installed_chrome + vendor_remote_browser)`)
    if (baseArmOf(name) !== null && !caps.includes('third_party_captcha_solver')) why.push(`${file} does not list third_party_captcha_solver`)
  }
  const env = {}
  if (base === 'combined') { if (steelKey) Object.assign(env, { W2L_VENDORS: 'steel', STEEL_API_KEY: steelKey }); else why.push('STEEL_API_KEY not found') }
  if (baseArmOf(name) !== null) {
    if (solverEnv.length === 0) why.push('no --solver-env named')
    for (const k of solverEnv) { const v = await secret(k); if (v) env[k] = v; else why.push(`${k} not found`) }
    let egress = null
    try { egress = file === null ? null : JSON.parse(await readFile(file, 'utf8'))?.solver?.egress ?? null } catch {}
    if (egress === 'proxy') {
      const exitVar = solverExits[name] ?? 'W2L_SOLVER_PROXY'
      if (process.env[exitVar]) { env.W2L_SOLVER_PROXY = process.env[exitVar]; exits[name] = `solver exit from ${exitVar}` } else why.push(`${exitVar} not set (the grant's solver exit is "proxy")`)
    } else if (egress === 'none') exits[name] = 'shell proxy (solver egress none)'
    else why.push(`${file} names no solver.egress`)
  }
  if (file !== null && grant !== null) env.W2L_ACCESS_GRANT = file
  if (why.length > 0) notStarted.push({ arm: name, why })
  // A solver arm is always "enhanced": the solver is an enhanced capability, and a standard request drops every paid rung.
  // standard+solver is the standard arm's local rungs with a grant that adds the solver alone.
  else arms[name] = { port: ports[i], access: base === 'standard' && baseArmOf(name) === null ? '"standard"' : '"enhanced"', env, grant, grantFile: grant === null ? null : file }
}
// Two proxy-exit arms on one variable would share one sticky exit: the second is not started.
const exitOwner = {}
for (const name of armNames.filter((a) => a in arms && 'W2L_SOLVER_PROXY' in arms[a].env)) {
  const v = arms[name].env.W2L_SOLVER_PROXY
  if (exitOwner[v] !== undefined) { notStarted.push({ arm: name, why: [`its solver exit is ${exitOwner[v]}'s (--solver-exits names one variable per arm)`] }); delete arms[name] } else exitOwner[v] = name
}
const runArms = armNames.filter((a) => a in arms)
const rotated = (b) => runArms.map((_, i) => runArms[(i + b) % runArms.length])

console.log(`captcha window ${windowNo}, ${date}, runner ${commit}; ${tasks.length} tasks in ${blockIds.length} blocks of ${size}; arms ${armNames.join(', ')}`)
for (const n of notStarted) console.log(`not started: ${n.arm} (${n.why.join('; ')})`)
for (const a of runArms) console.log(`exit of ${a}: ${exits[a] ?? 'shell proxy'}`)
for (const [b, ids] of blockIds.entries()) console.log(`block ${b}: ${ids[0]}…${ids.at(-1)} (${ids.length}); order ${rotated(b).join(' → ') || 'none'}`)
if (dryRun) process.exit(0)

const workRel = `.w2l/access/captcha/${date}-w${windowNo}`
const work = join(repo, workRel)
if (existsSync(join(work, 'manifest.json'))) throw new Error(`${workRel}/manifest.json exists: this window was run; use another --date or --window`)
await mkdir(work, { recursive: true })
const manifest = {
  window: Number(windowNo), date, runner: commit, tasksFile: TASKS_FILE, tasks, arms: armNames, notStarted, blocks: blockIds,
  grants: Object.fromEntries(Object.entries(arms).map(([n, a]) => [n, a.grant === null ? null : { file: a.grantFile, sha256: a.grant.sha256, capabilities: a.grant.capabilities }])),
  solverProviders: flag('--solver-providers') ?? null,
  proxy: { HTTPS_PROXY: process.env.HTTPS_PROXY ? 'set' : null, HTTP_PROXY: process.env.HTTP_PROXY ? 'set' : null, NO_PROXY: process.env.NO_PROXY ?? null },
  exits: Object.fromEntries(runArms.map((a) => [a, exits[a] ?? 'shell proxy'])),
  capsolverBalance: { before: null, after: null },
  runs: [], failures: [],
}
const saveManifest = () => writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await saveManifest()

const procs = {}
const portFree = (port) => new Promise((res) => { const s = connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(false) }); s.once('error', () => res(true)) })
async function startApi(name) {
  const a = arms[name]
  if (!(await portFree(a.port))) throw new Error(`port ${a.port} is in use`)
  const log = join(work, `api-${name}.log`)
  const out = createWriteStream(log)
  await new Promise((r) => out.once('open', r))
  const env = { ...process.env, ...a.env, W2L_TASK_ROOT: join(work, `api-${name}`), W2L_SOURCE_COMMIT: sh('git rev-parse HEAD') }
  if (!('W2L_ACCESS_GRANT' in a.env)) delete env.W2L_ACCESS_GRANT
  // Only an arm whose grant chose the solver exit gets one: the API refuses W2L_SOLVER_PROXY under any other grant.
  if (!('W2L_SOLVER_PROXY' in a.env)) delete env.W2L_SOLVER_PROXY
  procs[name] = spawn('node', ['--import', 'tsx', 'packages/api/src/cli.ts', '--port', String(a.port)], { cwd: repo, env, stdio: ['ignore', out, out] })
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
async function runSet(name, label, ids) {
  await spaced()
  const a = arms[name]
  const record = `${workRel}/${label}.md`
  const argv = ['research/access/run-set.mjs', '--tasks', TASKS_FILE, '--arm', name, '--set', 'all', '--only', ids.join(','), '--save-responses', '--raw-html', '--access', a.access, '--record', record,
    ...(a.grantFile === null ? [] : ['--grant', a.grantFile]), ...(flag('--solver-providers') ? ['--solver-providers', flag('--solver-providers')] : [])]
  const env = { ...process.env, W2L_API_URL: `http://127.0.0.1:${a.port}`, W2L_EGRESS_ECHO_URL: 'https://api.ipify.org' }
  // run-set falls back to the shell's W2L_ACCESS_GRANT: an arm without a grant must not record one its API never had.
  if (a.grantFile === null) delete env.W2L_ACCESS_GRANT
  const startedAt = new Date().toISOString()
  const out = createWriteStream(join(work, `${label}.log`))
  await new Promise((r) => out.once('open', r))
  return new Promise((res) => {
    const p = spawn('node', argv, { cwd: repo, env, stdio: ['ignore', out, out] })
    p.once('exit', async (code) => {
      const entry = { arm: name, label, ids, startedAt, finishedAt: new Date().toISOString(), exitCode: code, record, runDir: null }
      const runsDir = join(repo, '.w2l/access/runs')
      for (const d of existsSync(runsDir) ? (await readdir(runsDir)).sort().reverse() : []) {
        const f = join(runsDir, d, 'summary.json')
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

// CapSolver's balance (getBalance, through the shell's proxy, the key on curl's stdin): the window's real bill is its delta.
const capsolverKey = runArms.some((a) => baseArmOf(a) !== null) ? await secret('CAPSOLVER_API_KEY') : null
function balance() {
  if (capsolverKey === null) return null
  try {
    const out = execSync(`curl -s -m 30 ${process.env.HTTPS_PROXY ? '-x "$HTTPS_PROXY"' : ''} -H 'content-type: application/json' --data-binary @- https://api.capsolver.com/getBalance`, { input: JSON.stringify({ clientKey: capsolverKey }) }).toString()
    const j = JSON.parse(out)
    return { at: new Date().toISOString(), balanceUsd: j.errorId === 0 && typeof j.balance === 'number' ? j.balance : null, errorCode: j.errorCode ?? null }
  } catch { return { at: new Date().toISOString(), balanceUsd: null, errorCode: 'unreadable' } }
}

try {
  manifest.capsolverBalance.before = balance()
  await saveManifest()
  for (const name of runArms) await startApi(name)
  for (const [b, ids] of blockIds.entries()) for (const name of rotated(b)) await runSet(name, `${name}-b${b}`, ids)
} catch (e) {
  manifest.failures.push(`window stopped: ${e.message}`)
  console.error(e.message)
} finally {
  await stopAll()
  manifest.capsolverBalance.after = balance()
  manifest.finishedAt = new Date().toISOString()
  await saveManifest()
}
