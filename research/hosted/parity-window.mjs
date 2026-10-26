// The hosted parity board's measurement window (ROADMAP current phase, stage H item 1): the weekly task set through three
// MCP endpoints, called the way an agent calls them, and judged alike (research/hosted/parityWindow.mjs).
//
//   hosted       https://mcp.octocrawl.dev/mcp with an account's key (Authorization: Bearer oc_…), read from --key-file
//                and never printed or written. It spends the account's credits: 5 a browser page, 1 an HTTP page or a
//                404, none for a page not read (hostedCredits.ts scrapeCharge, which this window's figures are inferred
//                by). --credit-cap stops its calls before the next one could pass the cap; those stay in the denominator.
//   local        this checkout's local MCP host (packages/mcp/dist/localHostCli.js) without an access grant.
//   local_grant  the same host under the local default grant (--grant; default the weekly free arm's
//                .w2l/access/installed-chrome-grant.json), every call with access "enhanced".
// Each task goes through the arms one after the other, in each of their orders in turn (armOrder), so every arm goes
// first, and comes before each other arm, as often as the others. Each call sends the task's url
// and request, and its predicates of a type the endpoint's scrape lists in tools/list as `verify`: hosted lists no
// regular-expression check (ADR 0006), so it gets fewer checks, as an agent there would send. No timeout is sent: hosted
// stops a scrape at 100 s, a local host at 120 s. Every answer is judged by all of its task's predicates on the result the
// agent receives (a result over 50,000 characters is cut, the same on every arm).
//
// Usage: node research/hosted/parity-window.mjs --key-file <file> [--arms hosted,local,local_grant] [--date YYYY-MM-DD]
//          [--ports 8871,8872] [--grant <file>] [--credit-cap 150] [--hosted-url <url>] [--only T001,T002]
//          [--record research/hosted/<date>-parity-window-<commit>.md] [--dry-run]
//   --dry-run   prints the set, the arms and the credit bound, and calls nothing.
// Before it starts: no other measurement runs (no captcha-window, k1-window, run-set or weekly process), the lock
// <main checkout>/.w2l/measure.lock is taken (mkdir; its owner.json names this window and its start, removed at the end),
// the Mac is on AC power with the lid open, the ports are free and none of them is reserved, and packages/*/dist matches
// the source (runSetBuild.mjs). Network: the shell's HTTPS_PROXY/HTTP_PROXY/NO_PROXY for the local hosts' pages and the
// hosted calls alike; the record says how it ran. Raw data under .w2l/hosted-parity/<start>/ (git-ignored).

import { spawn, spawnSync, execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { buildLine, buildState } from '../access/runSetBuild.mjs'
import { grantLine, grantOf } from '../access/runSetReport.mjs'
import { weeklySet } from '../access/weeklyPlan.mjs'
import { armSummary, contractFor, listedCheckTypes, powerState, RESERVED_PORTS, runWindow, summaryTable } from './parityWindow.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const ARMS = ['hosted', 'local', 'local_grant']
const arms = (flag('--arms') ?? ARMS.join(',')).split(',').map((s) => s.trim()).filter(Boolean)
for (const arm of arms) if (!ARMS.includes(arm)) throw new Error(`--arms: unknown arm ${arm}; the arms are ${ARMS.join(', ')}`)
const localArms = arms.filter((arm) => arm !== 'hosted')
const ports = (flag('--ports') ?? '8871,8872').split(',').map(Number)
if (ports.length < localArms.length || ports.some((p) => !Number.isSafeInteger(p) || p < 1024 || p > 65535)) throw new Error('--ports names one free port for each local arm')
for (const p of ports) if (RESERVED_PORTS.has(p)) throw new Error(`--ports ${p} is used by another service or measurement on this machine`)
const hostedUrl = flag('--hosted-url') ?? 'https://mcp.octocrawl.dev/mcp'
const creditCap = Number(flag('--credit-cap') ?? 150)
if (!Number.isSafeInteger(creditCap) || creditCap < 0) throw new Error('--credit-cap is a whole number of credits, 0 or more')
const only = flag('--only')?.split(',').map((s) => s.trim())
const dryRun = args.includes('--dry-run')
const recordFile = flag('--record')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const date = flag('--date') ?? today()
const sh = (cmd) => execSync(cmd, { cwd: repo }).toString().trim()
const mainCheckout = dirname(sh('git rev-parse --path-format=absolute --git-common-dir'))
const localFile = (rel) => [...new Set([repo, mainCheckout])].map((root) => join(root, rel)).find((p) => existsSync(p)) ?? null
const grantFile = arms.includes('local_grant') ? resolve(repo, flag('--grant') ?? localFile('.w2l/access/installed-chrome-grant.json') ?? '.w2l/access/installed-chrome-grant.json') : null
if (recordFile !== undefined && existsSync(resolve(repo, recordFile))) throw new Error(`--record ${recordFile} exists: a record is not rewritten; name a new file`)

const taskFile = JSON.parse(await readFile(join(repo, 'research/access/tasks.v1.json'), 'utf8'))
const subsets = JSON.parse(await readFile(join(repo, 'research/access/subsets.v1.json'), 'utf8'))
const set = weeklySet(taskFile, subsets, new Date(`${date}T12:00:00Z`))
const byId = new Map(taskFile.tasks.map((t) => [t.id, t]))
const tasks = set.all.filter((id) => only === undefined || only.includes(id)).map((id) => byId.get(id))
const partOf = (id) => (set.healthy.includes(id) ? 'healthy' : set.challenge.includes(id) ? 'challenge' : 'rotation')

if (dryRun) {
  console.log(JSON.stringify({ date, isoWeek: set.isoWeek, rotationGroup: set.group, tasks: tasks.length, arms, ports: ports.slice(0, localArms.length), hostedUrl, grantFile, creditBound: arms.includes('hosted') ? tasks.length * 5 : 0, creditCap }, null, 2))
  process.exit(0)
}
if (arms.includes('hosted') && flag('--key-file') === undefined) throw new Error('the hosted arm needs --key-file, a file holding an account key (oc_…)')

// One measurement at a time on this Mac.
const running = spawnSync('pgrep', ['-f', 'node.*(captcha-window|k1-window|run-set|weekly)\\.m?js'], { encoding: 'utf8' }).stdout.trim()
if (running !== '') throw new Error(`another measurement is running (pids ${running.split('\n').join(', ')}); wait for it`)
const power = powerState(spawnSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).stdout, spawnSync('ioreg', ['-r', '-k', 'AppleClamshellState', '-d', '4'], { encoding: 'utf8' }).stdout)
if (!power.ac || power.lidOpen === false) throw new Error(`the Mac must be on AC power with its lid open (AC ${power.ac}, lid open ${power.lidOpen})`)
const build = buildState(repo)
if (build.upToDate !== true) throw new Error(`packages/*/dist does not match the source: ${buildLine(build)}; run npx tsc --build`)
for (const port of ports.slice(0, localArms.length)) {
  const taken = await new Promise((done) => { const socket = connect(port, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); done(true) }); socket.once('error', () => done(false)) })
  if (taken) throw new Error(`port ${port} is taken`)
}
// Everything that can fail before the run is read and made before the lock is taken, so a failure leaves no lock behind.
const key = arms.includes('hosted') ? (await readFile(resolve(flag('--key-file')), 'utf8')).trim() : null
if (key !== null && !/^oc_[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('--key-file does not hold an account key (oc_…)')
/** Text the window writes, without the key or a proxy's credentials. */
const scrub = (text) => (key === null ? text : text.split(key).join('[key]')).replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@"'`]+@/gi, '$1***@')
const proxied = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy)
const shownProxy = (() => { const v = process.env.HTTPS_PROXY ?? process.env.https_proxy; if (!v) return null; try { const u = new URL(v.includes('://') ? v : `http://${v}`); return `${u.protocol}//${u.host}` } catch { return 'set' } })()
const startedAt = new Date().toISOString()
const runDir = join(repo, '.w2l/hosted-parity', startedAt.replace(/[:.]/g, '-'))
await mkdir(join(runDir, 'pages'), { recursive: true })
const lock = join(mainCheckout, '.w2l/measure.lock')
await mkdir(dirname(lock), { recursive: true })
try { await mkdir(lock) } catch { throw new Error(`${lock} exists: another measurement holds the Mac; wait for it`) }

const children = []
const clients = []
const cleanup = () => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  rmSync(lock, { recursive: true, force: true })
}
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })
try {
  await writeFile(join(lock, 'owner.json'), JSON.stringify({ name: 'hosted-parity-window', pid: process.pid, startedAt, worktree: repo }, null, 2) + '\n')
  // The local hosts: this checkout's build, each with its own task root, no saved secrets, and only its own grant.
  const endpoints = {}
  for (const [i, arm] of localArms.entries()) {
    const port = ports[i]
    const env = { ...process.env, W2L_LOCAL_MCP_PORT: String(port), W2L_TASK_ROOT: join(runDir, arm), W2L_LOCAL_SECRETS_FILE: join(runDir, 'no-secrets.env') }
    delete env.W2L_ACCESS_GRANT; delete env.W2L_VENDORS; delete env.STEEL_API_KEY
    if (arm === 'local_grant') env.W2L_ACCESS_GRANT = grantFile
    const child = spawn(process.execPath, ['packages/mcp/dist/localHostCli.js'], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    child.stdout.on('data', (chunk) => { void appendFile(join(runDir, `${arm}.log`), scrub(String(chunk))) })
    child.stderr.on('data', (chunk) => { void appendFile(join(runDir, `${arm}.log`), scrub(String(chunk))) })
    const url = `http://127.0.0.1:${port}`
    for (let tries = 0; ; tries++) {
      const ok = await fetch(`${url}/healthz`).then((res) => res.ok, () => false)
      if (ok) break
      if (tries >= 120 || child.exitCode !== null) throw new Error(`the ${arm} host did not start on ${port}; see ${join(runDir, `${arm}.log`)}`)
      await new Promise((done) => setTimeout(done, 500))
    }
    endpoints[arm] = { url: `${url}/mcp`, headers: {} }
  }
  if (key !== null) endpoints.hosted = { url: hostedUrl, headers: { authorization: `Bearer ${key}` } }
  // Hosted is reached through the shell's proxy when one is set (Node's fetch ignores it); the local hosts are on loopback.
  const outbound = proxied ? await import('undici').then(({ fetch: proxiedFetch, EnvHttpProxyAgent }) => { const agent = new EnvHttpProxyAgent(); return (input, init) => proxiedFetch(input, { ...init, dispatcher: agent }) }) : undefined
  const endpointInfo = {}
  for (const arm of arms) {
    const client = new Client({ name: 'octocrawl-parity-window', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoints[arm].url), { requestInit: { headers: endpoints[arm].headers }, ...(arm === 'hosted' && outbound !== undefined ? { fetch: outbound } : {}) }))
    clients.push(client)
    const listed = listedCheckTypes((await client.listTools()).tools)
    endpointInfo[arm] = { client, listed, version: client.getServerVersion()?.version ?? null }
  }

  const { scrapeCharge } = await import('../../packages/mcp/dist/hostedCredits.js')
  const linesFile = join(runDir, 'attempts.jsonl')
  const rows = await runWindow({
    tasks, arms,
    canRun: (arm, sofar) => {
      if (arm !== 'hosted') return null
      // An answer whose credits are unknown is counted at a browser page's 5.
      const used = sofar.filter((r) => r.arm === 'hosted' && r.notRun === undefined).reduce((sum, r) => sum + (r.credits ?? 5), 0)
      return used + 5 > creditCap ? `credit cap ${creditCap}` : null
    },
    call: async (arm, task) => {
      const contract = contractFor(task.predicates, endpointInfo[arm].listed)
      const started = Date.now()
      try {
        const result = await endpointInfo[arm].client.callTool({ name: 'scrape', arguments: { url: task.url, ...(task.request ?? {}), ...(contract === undefined ? {} : { verify: contract }), ...(arm === 'local_grant' ? { access: 'enhanced' } : {}) } }, undefined, { timeout: arm === 'hosted' ? 160_000 : 200_000 })
        return { result, wallMs: Date.now() - started }
      } catch (error) { return { error, wallMs: Date.now() - started } }
    },
    charge: (arm, doc) => (arm === 'hosted' && doc !== null ? scrapeCharge(doc).credits : null),
    onRow: async (row, doc) => {
      const line = { ...row, part: partOf(row.taskId), at: new Date().toISOString() }
      await appendFile(linesFile, scrub(JSON.stringify(line)) + '\n')
      if (typeof doc?.markdown === 'string') await writeFile(join(runDir, 'pages', `${row.taskId}-${row.arm}.md`), doc.markdown)
      console.log(`${row.taskId} ${row.arm}: ${row.notRun ?? (row.toolError?.code ?? `${row.status}${row.reason ? `/${row.reason}` : ''}`)} ${row.verified ? 'verified' : ''} ${row.wallMs ?? ''}`)
    },
  })
  const finishedAt = new Date().toISOString()
  const summaries = arms.map((arm) => armSummary(rows, arm))
  const byPart = Object.fromEntries(['healthy', 'challenge', 'rotation'].map((part) => [part, Object.fromEntries(arms.map((arm) => [arm, rows.filter((r) => r.arm === arm && partOf(r.taskId) === part && r.verified).length]))]))
  const grant = grantFile === null ? null : grantOf(await readFile(grantFile, 'utf8'))
  const environment = {
    command: `node research/hosted/parity-window.mjs ${args.map((a) => (a === flag('--key-file') ? '<key file>' : a)).join(' ')}`,
    commit: sh('git rev-parse --short HEAD'), dirty: sh('git status --porcelain --untracked-files=no') !== '', build: buildLine(build),
    proxied, proxy: shownProxy, startedAt, finishedAt, date, isoWeek: set.isoWeek, rotationGroup: set.group,
    hosted: arms.includes('hosted') ? { url: hostedUrl, version: endpointInfo.hosted.version, checks: endpointInfo.hosted.listed } : null,
    local: localArms.length === 0 ? null : { version: endpointInfo[localArms[0]].version, checks: endpointInfo[localArms[0]].listed },
    grant: grant === null ? null : { file: grantFile, sha256: grant.sha256, capabilities: grant.capabilities },
    tasksSha256: createHash('sha256').update(await readFile(join(repo, 'research/access/tasks.v1.json'))).digest('hex'),
    creditCap,
  }
  await writeFile(join(runDir, 'summary.json'), scrub(JSON.stringify({ environment, summaries, byPart }, null, 2)) + '\n')
  const record = [
    `# Hosted parity window, ${date}`,
    '',
    `- Command: \`${environment.command}\``,
    `- Commit: ${environment.commit}${environment.dirty ? ' (tracked files changed)' : ''}; ${environment.build.replace(/^- /, '')}`,
    `- Ran ${startedAt} to ${finishedAt} UTC, ${proxied ? `proxied through ${shownProxy ?? 'the shell\'s proxy'}` : 'direct'}: the local hosts' pages and the hosted calls alike.`,
    `- Set: the weekly set of ISO week ${set.isoWeek} (rotation group ${set.group}), ${tasks.length} task${tasks.length === 1 ? '' : 's'}${only === undefined ? '' : ` (--only, of ${set.all.length})`}, tasks.v1.json ${environment.tasksSha256.slice(0, 12)}…; every task in the denominator.`,
    ...(environment.hosted === null ? [] : [`- hosted: ${hostedUrl}, server ${environment.hosted.version ?? 'unknown'}, an account's key; checks sent: ${environment.hosted.checks.join(', ') || 'none'}; credits inferred by hostedCredits.ts scrapeCharge, cap ${creditCap}.`]),
    ...(environment.local === null ? [] : [`- local hosts: this commit's localHostCli, server ${environment.local.version ?? 'unknown'}; checks sent: ${environment.local.checks.join(', ')}.`]),
    ...(arms.includes('local_grant') ? [`- local_grant: ${grantLine(grant)}, access "enhanced" on every call.`] : []),
    '- No timeout is sent: hosted stops a scrape at 100 s, a local host at 120 s. Each task\'s predicates judge every arm\'s result as the agent received it. The exits differ: hosted fetches from Cloud Run (asia-southeast1), the local hosts from this Mac.',
    '',
    ...summaryTable(summaries),
    '',
    '| Part | ' + arms.join(' | ') + ' |',
    '| --- | ' + arms.map(() => '---').join(' | ') + ' |',
    ...Object.entries(byPart).map(([part, counts]) => `| ${part} (${tasks.filter((t) => partOf(t.id) === part).length}) | ${arms.map((arm) => counts[arm]).join(' | ')} |`),
    '',
    '| Task | Part | ' + arms.join(' | ') + ' |',
    '| --- | --- | ' + arms.map(() => '---').join(' | ') + ' |',
    ...tasks.map((t) => `| ${t.id} | ${partOf(t.id)} | ${arms.map((arm) => { const r = rows.find((x) => x.taskId === t.id && x.arm === arm); return r === undefined ? 'missing' : r.notRun !== undefined ? `not run (${r.notRun})` : `${r.verified ? 'verified' : r.falseSuccess ? 'false success' : 'not verified'}: ${r.toolError?.code ?? `${r.status}${r.reason ? `/${r.reason}` : ''}`}${r.robots ? `, robots ${r.robots}` : ''}, ${r.wallMs} ms${r.credits ? `, ${r.credits} cr` : ''}` }).join(' | ')} |`),
    '',
  ].join('\n')
  if (recordFile !== undefined) await writeFile(resolve(repo, recordFile), scrub(record))
  console.log(scrub(record))
} finally {
  for (const client of clients) await client.close().catch(() => {})
  cleanup()
}
