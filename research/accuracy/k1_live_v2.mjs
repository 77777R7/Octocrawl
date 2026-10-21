// K1's live run of reserved set v2 (docs/pa-enhancement-tasks.md, Phase 4, K1): each case's json/verify request (a plan
// json_plans.py wrote, optionally with list_selectors.v1.json's list format) sent to the real page by six arms, saved in
// run_dev.mjs's output shape so holdout_score.py scores every arm against the sealed 2026-10-20 gold. A live page is not
// the sealed source: a value that changed since the capture scores as wrong for every arm alike (not isolated).
//
// Arms: the four local Octocrawl arms of k1-window.mjs (standard, enhanced, installed_chrome, control at its pinned
// checkout), each its own API on its own port; firecrawl, Firecrawl Cloud /v2/scrape with formats markdown plus its own
// json format (its LLM extraction) with the case's schema: competitor extraction, not Octocrawl's F2; zenrows, ZenRows
// mode=auto, response_type=markdown (no json: ZenRows has no schema extraction of the same kind), for access only.
// Interleaving is per case: the four local arms one after another in a rotated order, the two competitors at the same
// time. The Octocrawl request is the plan's with fastMode removed (the replay kept the HTTP lane; live, the arm's ladder
// runs), the arm's access, maxAge 0 and --timeout (default 120 s, also Firecrawl's timeout). First calls only.
//
// Usage: node research/accuracy/k1_live_v2.mjs <output dir> --control <dir> [--plan <plan.json>] [--ports 8831,8832,8833,8834]
//          [--timeout 120000] [--steel-grant <file>] [--ic-grant <file>]
//   Each answer goes to <output dir>/<arm>/<case>.json ({caseId, arm, request, startedAt, finishedAt, response, error});
//   a case already saved for an arm is not sent again. Keys and grants are found as k1-window.mjs finds them, and keys are
//   never written. Firecrawl's answer is saved as {status, markdown, json: {data}, firecrawl: {metadata, creditsUsed}}.
import { spawn, execSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const out = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null
if (!out) throw new Error('usage: k1_live_v2.mjs <output dir> --control <dir>')
const control = flag('--control') && resolve(flag('--control'))
if (!control || !existsSync(join(control, 'packages/api/dist/index.js'))) throw new Error('--control <dir>: a built checkout of the control commit')
const plan = JSON.parse(await readFile(flag('--plan') ?? join(here, 'reserved-plan-json.v2.json'), 'utf8'))
const ports = (flag('--ports') ?? '8831,8832,8833,8834').split(',').map(Number)
for (const p of ports) if ([8787, 8791, 8799, 8812, 8813, 8814].includes(p)) throw new Error(`port ${p} is reserved on this machine`)
const timeout = Number(flag('--timeout') ?? 120_000)
const sh = (cmd, cwd = repo) => execSync(cmd, { cwd }).toString().trim()
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
const keys = { steel: await secret('STEEL_API_KEY'), firecrawl: await secret('FIRECRAWL_API_KEY'), zenrows: await secret('ZENROWS_API_KEY') }
for (const [k, v] of Object.entries(keys)) if (!v) throw new Error(`${k} key not found`)
const steelGrant = flag('--steel-grant') ?? localFile('.w2l/access/steel-grant.json')
// After window 1 (which ran the 16-task grant outside its declared scope) the K1 grant is required; --ic-grant overrides.
const icGrant = flag('--ic-grant') ?? localFile('.w2l/access/installed-chrome-grant-k1.json')
if (icGrant === null) throw new Error('no installed_chrome grant: K1 needs .w2l/access/installed-chrome-grant-k1.json (or --ic-grant)')
const head = sh('git rev-parse HEAD')
const LOCAL = {
  standard: { port: ports[0], cwd: repo, commit: head, access: 'standard', env: {} },
  enhanced: { port: ports[1], cwd: repo, commit: head, access: 'enhanced', env: { W2L_ACCESS_GRANT: steelGrant, W2L_VENDORS: 'steel', STEEL_API_KEY: keys.steel } },
  installed_chrome: { port: ports[2], cwd: repo, commit: head, access: 'enhanced', env: { W2L_ACCESS_GRANT: icGrant } },
  control: { port: ports[3], cwd: control, commit: sh('git rev-parse HEAD', control), access: 'enhanced', env: { W2L_ACCESS_GRANT: steelGrant, W2L_VENDORS: 'steel', STEEL_API_KEY: keys.steel } },
}
const names = Object.keys(LOCAL)
await mkdir(out, { recursive: true })
for (const a of [...names, 'firecrawl', 'zenrows']) await mkdir(join(out, a), { recursive: true })

const procs = []
async function startApi(name) {
  const a = LOCAL[name]
  const log = join(out, `api-${name}.log`)
  const o = createWriteStream(log)
  await new Promise((r) => o.once('open', r))
  const p = spawn('node', ['--import', 'tsx', 'packages/api/src/cli.ts', '--port', String(a.port)], { cwd: a.cwd, env: { ...process.env, ...a.env, W2L_TASK_ROOT: join(out, `api-${name}`), W2L_SOURCE_COMMIT: a.commit }, stdio: ['ignore', o, o] })
  procs.push(p)
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    if (p.exitCode !== null) throw new Error(`the ${name} API exited with ${p.exitCode}; see ${log}`)
    if ((await readFile(log, 'utf8')).includes('listening')) return
  }
  throw new Error(`the ${name} API did not listen within 180 s`)
}
const killAll = () => { for (const p of procs) if (p.exitCode === null) p.kill('SIGKILL') }
process.on('exit', killAll)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killAll(); process.exit(130) })

const { fetch: pfetch, EnvHttpProxyAgent } = await import('undici')
const agent = new EnvHttpProxyAgent()
const save = async (arm, item, request, startedAt, response, error) => {
  const strip = JSON.parse(JSON.stringify(request).replaceAll(keys.firecrawl, '[key]').replaceAll(keys.zenrows, '[key]'))
  await writeFile(join(out, arm, `${item.id}.json`), JSON.stringify({ caseId: item.id, arm, request: strip, startedAt, finishedAt: new Date().toISOString(), response, error }, null, 2) + '\n', { flag: 'wx' })
}
const done = (arm, item) => existsSync(join(out, arm, `${item.id}.json`))
/** A plan's 429 is waited out (Retry-After, else 15 s), five times at most, as run-set.mjs does. */
async function paced(send) { for (let i = 0; ; i++) { const res = await send(); if (res.status !== 429 || i >= 5) return res; const s = Number(res.headers.get('retry-after')); await new Promise((r) => setTimeout(r, (Number.isFinite(s) && s > 0 ? s : 15) * 1000)) } }

async function octocrawl(name, item) {
  if (done(name, item)) return
  const { fastMode, ...base } = plan.request
  const { url: _u, ...own } = item.request ?? {}
  const request = { ...base, ...own, url: item.url, maxAge: 0, timeout, access: LOCAL[name].access }
  const startedAt = new Date().toISOString()
  let response = null, error = null
  try {
    const res = await fetch(`http://127.0.0.1:${LOCAL[name].port}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(timeout + 60_000) })
    const body = await res.json()
    if (res.ok) response = body.data ?? body
    else error = { name: 'api', message: JSON.stringify(body).slice(0, 2000), code: res.status }
  } catch (e) { error = { name: e.name, message: e.message, code: e.code ?? null } }
  await save(name, item, request, startedAt, response, error)
  console.log(name, item.id, response?.status ?? error?.code ?? 'error', response?.verification?.status ?? '')
}

async function firecrawl(item) {
  if (done('firecrawl', item)) return
  const js = (item.request?.formats ?? []).find((f) => typeof f === 'object' && f.type === 'json')
  const request = { url: item.url, formats: ['markdown', { type: 'json', schema: js.schema }], maxAge: 0, storeInCache: false, proxy: 'auto', timeout }
  const startedAt = new Date().toISOString()
  let response = null, error = null
  try {
    const res = await paced(() => pfetch('https://api.firecrawl.dev/v2/scrape', { method: 'POST', dispatcher: agent, headers: { 'content-type': 'application/json', authorization: `Bearer ${keys.firecrawl}` }, body: JSON.stringify(request), signal: AbortSignal.timeout(timeout + 60_000) }))
    const body = await res.json().catch(() => null)
    const data = body?.data ?? null, meta = data?.metadata ?? {}
    const code = typeof meta.statusCode === 'number' ? meta.statusCode : null
    const claimed = body?.success === true && data !== null && (code === null || (code >= 200 && code < 300))
    response = { status: claimed ? 'success' : 'failed', failureReason: claimed ? null : (meta.error ?? body?.error ?? (code !== null ? `http_${code}` : `api_${res.status}`)), markdown: typeof data?.markdown === 'string' ? data.markdown : null, json: data?.json === undefined ? null : { data: data.json }, evidence: { httpStatus: code, finalUrl: meta.url ?? meta.sourceURL ?? null }, firecrawl: { apiStatus: res.status, creditsUsed: meta.creditsUsed ?? null, proxyUsed: meta.proxyUsed ?? null, cacheState: meta.cacheState ?? null, scrapeId: meta.scrapeId ?? null } }
  } catch (e) { error = { name: e.name, message: e.message, code: e.code ?? null } }
  await save('firecrawl', item, request, startedAt, response, error)
  console.log('firecrawl', item.id, response?.status ?? error?.code ?? 'error', response?.firecrawl?.creditsUsed ?? '')
}

async function zenrows(item) {
  if (done('zenrows', item)) return
  const request = { url: item.url, mode: 'auto', response_type: 'markdown' }
  const startedAt = new Date().toISOString()
  let response = null, error = null
  try {
    const q = new URLSearchParams({ apikey: keys.zenrows, ...request })
    const res = await paced(() => pfetch(`https://api.zenrows.com/v1/?${q}`, { dispatcher: agent, signal: AbortSignal.timeout(200_000) }))
    const text = await res.text()
    let code = null
    if (res.status !== 200) { try { const j = JSON.parse(text); code = j.code ?? j.title ?? null } catch {} }
    const claimed = res.status === 200 && text.length > 0
    response = { status: claimed ? 'success' : 'failed', failureReason: claimed ? null : (code ?? `api_${res.status}`), markdown: claimed ? text : null, json: null, zenrows: { apiStatus: res.status, requestCost: res.headers.get('x-request-cost') } }
  } catch (e) { error = { name: e.name, message: e.message, code: e.code ?? null } }
  await save('zenrows', item, request, startedAt, response, error)
  console.log('zenrows', item.id, response?.status ?? error?.code ?? 'error', response?.zenrows?.requestCost ?? '')
}

/** Sleeps in pmset's log since a time (a machine that slept stalls every arm: not the sites' failure). */
function sleepsSince(fromMs) {
  let log = ''
  try { log = execSync('pmset -g log', { maxBuffer: 256 * 1024 * 1024 }).toString() } catch { return null }
  return log.split('\n').flatMap((l) => {
    const m = l.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) Sleep\s+(Entering Sleep state due to '[^']*')/)
    const at = m && Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`)
    return m && at >= fromMs ? [`${new Date(at).toISOString()} ${m[5]}`] : []
  })
}
const runStart = Date.now()
try {
  for (const name of names) await startApi(name)
  for (const [i, item] of plan.cases.entries()) {
    const comp = Promise.all([firecrawl(item), zenrows(item)])
    for (let k = 0; k < names.length; k++) await octocrawl(names[(i + k) % names.length], item)
    await comp
    const slept = sleepsSince(runStart)
    if (slept !== null && slept.length > 0) throw new Error(`the machine slept: ${slept.slice(0, 3).join('; ')}`)
  }
} finally {
  killAll()
  await writeFile(join(out, 'run.json'), JSON.stringify({ plan: flag('--plan') ?? 'research/accuracy/reserved-plan-json.v2.json', timeout, ports, commits: Object.fromEntries(names.map((n) => [n, LOCAL[n].commit])), startedAt: new Date(runStart).toISOString(), finishedAt: new Date().toISOString(), sleeps: sleepsSince(runStart), proxy: { HTTPS_PROXY: process.env.HTTPS_PROXY ?? null } }, null, 2) + '\n')
}
