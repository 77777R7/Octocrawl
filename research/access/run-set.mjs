// PA access task set runner (G0 of the enhanced-access phase, ROADMAP.md "PA · Enhanced access").
//
// Runs the tasks in research/access/tasks.v1.json through a running local API (npm run api),
// judges each answer by the task's own predicates, writes one JSON line per attempt under
// .w2l/access/runs/<timestamp>/ and, with --record, a Markdown summary that is the committed record.
//
// Usage: node research/access/run-set.mjs [--set frozen|healthy|blind|candidate|all] [--only T01,T02] [--warm]
//          [--access '{"tier":"standard"}'] [--target octocrawl|firecrawl|zenrows] [--record research/access/runs/<date>-<label>-<commit>.md]
//        node research/access/run-set.mjs --rejudge .w2l/access/runs/<timestamp> [--record research/access/runs/<new file>.md]
//   --target     who fetches the pages (ROADMAP PA item 9, the competitor baseline). octocrawl (the default) is the local
//                API. firecrawl is Firecrawl Cloud's POST /v2/scrape with FIRECRAWL_API_KEY: the task's own formats,
//                maxAge 0 and storeInCache false (the same freshness as Octocrawl's maxAge 0; its default reuses pages up to
//                two days old), proxy auto (basic, then its enhanced proxy on a failure: its strongest route, at one
//                credit either way) and the task's timeout (at most 300 s). A key is read from the environment or from
//                .w2l/access/competitors.env (git-ignored), and never written anywhere. FIRECRAWL_API_URL replaces the
//                API's address (a stand-in for testing the driver, or a self-hosted Firecrawl, which the record must then say).
//                zenrows is ZenRows' Fetch API (GET /v1/) with ZENROWS_API_KEY: mode=auto (it escalates to JS rendering and
//                residential proxies itself and bills the configuration that worked) and response_type=markdown;
//                ZENROWS_API_URL replaces its address the same way. A plan's 429 is waited out (Retry-After, else 15 s),
//                five times at most, and the wait is left out of the page's time.
//   Env: W2L_API_URL (default http://127.0.0.1:8787). W2L_EGRESS_ECHO_URL, when set, is fetched
//   once through the environment proxy at the start, and the first IPv4 address in its answer is
//   recorded as the exit address (for example https://api.ipify.org).
//   --set frozen (the default) selects the frozen and the unstable tasks: PA's denominator. healthy,
//   blind and candidate select that part alone; all selects every task.
//   --rejudge re-evaluates a finished run's saved Markdown against the current predicates in
//   tasks.v1.json, without fetching. The run's own attempts.jsonl and summary.json are never
//   rewritten: the new verdicts go to attempts.rejudged-<time>.jsonl and summary.rejudged-<time>.json
//   beside them. A task removed from tasks.v1.json, or whose URL changed, after the run stays in
//   the denominator with the run's own verdict, marked as not rejudged.
//   --record never replaces a file that exists: a committed record is not rewritten.
//   Proxy settings are recorded as scheme, host and port only, never a user name, password, path or
//   query; every file the runner writes is also cleared of the raw proxy values and of credentials in
//   any URL (an error message that quotes one).
//
// Method:
//   verified       the API answered `success` or `partial` and every predicate passed. Each task
//                  carries at least one data predicate (markdownIncludes, markdownMatches,
//                  markdownCountMin, minTables, listRecordsMin, or field on a json./list. path); a status or lane check alone
//                  never makes a task verified.
//   falseSuccess   the API answered `success` and a data predicate failed: content was claimed
//                  that the task's target data does not support.
//   observed       HTTP status, status, reason, lane, channels tried, gate-related trace events.
//   intervention   what the run asked for (--access, cold or warm) and the lane and egress the
//                  answer recorded.
//   suspected      always { cause: 'unknown', confidence: 'not_isolated' } here. A run through the
//                  product changes several variables at once (headers, protocol stack, cookies,
//                  timing), so it cannot isolate why a site refused. Library-level probes may fill
//                  this in elsewhere, labelled library_probe.
//   cold / warm    --warm sends each task a second time right after the first, with maxAge 0 so it
//                  is not a cache hit; the two attempts are counted apart.
//   cost           externalCostUsd as the API reports it, null when unknown; egressCostUsd is null
//                  because nothing measures it yet. A table with any null is reported as unknown.
//   denominator    every task in the selected set, including ones the API could not answer.
//   paid calls     (octocrawl) the provider calls the page's Evidence Record lists (access.paidCalls, ROADMAP PA item 4):
//                  each one's provider, what Octocrawl made of the page it returned (never the provider's word), and
//                  whether it is the answer; chargedUsd is what the API's spend ledger charged the scrape
//                  (usage.externalCostChargedUsd): the provider's stated price, else its sessions' measured time under
//                  the grant's tariff, else its price ceiling; an estimate from the tariff, never below what it bills,
//                  and not the provider's bill. 0 when the record lists no paid call; null when the API's record says nothing of
//                  paid calls (a build before them, or no record).
//   competitors    the same tasks, the same Markdown predicates and the same counts. A competitor's own claim stands
//                  for `status`: Firecrawl's success with the target's 2xx (metadata.statusCode) is `success`; its
//                  success with another status, or no success, is `failed` with the reason it gave (an API that names the
//                  target's 4xx is not counted as claiming content). Credits are inferred from the provider's published
//                  billing (Firecrawl: one per document returned, none without one), since a scrape's answer does not
//                  report them; USD stays null (the price per credit depends on the plan). ZenRows: its 200 with a body
//                  is `success`, any other answer `failed` with its error code; a failure is not billed (0 credits), and a
//                  success's credits are unknown (mode=auto does not say which configuration it billed; its
//                  X-Request-Cost header is recorded as given, its unit unconfirmed).
//
// Each answer's Markdown is saved under .w2l/access/runs/<timestamp>/pages/ (git-ignored), so the
// predicates can be re-checked with --rejudge; the committed record holds only the fields above.

import { readFile, writeFile as writeRaw, mkdir, appendFile as appendRaw } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Every file the runner writes goes through scrub() (defined below, before the first write), except a page's own Markdown.
const writeFile = (file, text) => writeRaw(file, scrub(text))
const appendFile = (file, text) => appendRaw(file, scrub(text))

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const setFilter = flag('--set') ?? 'frozen'
const only = flag('--only')?.split(',').map((s) => s.trim())
const warm = args.includes('--warm')
const access = flag('--access') === undefined ? undefined : JSON.parse(flag('--access'))
const recordFile = flag('--record')
const rejudgeDir = flag('--rejudge')
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'
const target = flag('--target') ?? 'octocrawl'
const TARGETS = { octocrawl: 'the local Octocrawl API', firecrawl: 'Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false)', zenrows: 'ZenRows Fetch API, GET /v1/ (mode=auto, response_type=markdown)' }
if (!(target in TARGETS)) throw new Error(`--target must be one of ${Object.keys(TARGETS).join(', ')}`)
if (target !== 'octocrawl' && flag('--access') !== undefined) throw new Error('--access is an Octocrawl option; a competitor runs with its own strongest route')

const DATA_TYPES = new Set(['markdownIncludes', 'markdownMatches', 'markdownCountMin', 'minTables', 'listRecordsMin'])
const isData = (p) => DATA_TYPES.has(p.type) || (p.type === 'field' && /^(json|list|tables)\b/.test(p.path))

const taskText = await readFile(join(here, 'tasks.v1.json'), 'utf8')
const tasksSha256 = createHash('sha256').update(taskText).digest('hex')
const taskFile = JSON.parse(taskText)
const inSet = (t) => setFilter === 'all' || t.part === setFilter || (setFilter === 'frozen' && t.part === 'unstable')
const tasks = taskFile.tasks.filter((t) => inSet(t) && (only === undefined || only.includes(t.id)))
for (const t of rejudgeDir === undefined ? tasks : taskFile.tasks) {
  if (!t.predicates.some(isData)) throw new Error(`${t.id} has no data predicate; a status check alone cannot verify a task`)
}

if (recordFile !== undefined && existsSync(join(repo, recordFile))) throw new Error(`--record ${recordFile} exists: a record is not rewritten; name a new file`)

/** A proxy setting as a record may show it: scheme, host and port, never a user name, password, path or query (a token). */
function proxyShown(value) {
  if (value === undefined || value === null || value === '') return { shown: null, credentials: false }
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`)
    return { shown: `${url.protocol}//${url.host}`, credentials: url.username !== '' || url.password !== '' || url.search !== '' }
  } catch { return { shown: 'set (not a URL, not shown)', credentials: true } }
}
const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']
/**
 * A credentialed proxy setting's secrets: the value, user:password, and a user name, password or query value of six
 * characters or more, raw and decoded, each also as JSON writes it (a quote or backslash escaped).
 */
function proxySecrets(v) {
  if (typeof v !== 'string' || v === '' || !proxyShown(v).credentials) return []
  let url
  try { url = new URL(v.includes('://') ? v : `http://${v}`) } catch { return [v] }
  const decode = (x) => { try { return decodeURIComponent(x) } catch { return x } }
  const secrets = [url.username, url.password, ...url.searchParams.values()].flatMap((x) => [x, decode(x)]).filter((x) => x.length >= 6)
  const pairs = url.username === '' ? [] : [`${url.username}:${url.password}`, `${decode(url.username)}:${decode(url.password)}`]
  return [v, url.href, url.search, ...pairs, ...secrets].filter((x) => x !== '').flatMap((x) => [x, JSON.stringify(x).slice(1, -1)])
}
// No file the runner writes may hold one of these, longest first (a rejudge adds the run's own).
let RAW_PROXY = []
const keepOut = (values) => { RAW_PROXY = [...new Set([...RAW_PROXY, ...values.flatMap(proxySecrets)])].sort((a, b) => b.length - a.length) }
keepOut(PROXY_VARS.map((name) => process.env[name]))
/** Text the runner writes, without a raw proxy value or the credentials of any URL in it. */
function scrub(text) {
  let out = text
  for (const raw of RAW_PROXY) out = out.split(raw).join('[proxy]')
  return out.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@"'`]+@/gi, '$1***@')
}
const shownEnv = (env) => {
  const named = Object.fromEntries(['HTTPS_PROXY', 'HTTP_PROXY'].map((name) => [name, proxyShown(env[name])]))
  return {
    proxyEnv: { HTTPS_PROXY: named.HTTPS_PROXY.shown, HTTP_PROXY: named.HTTP_PROXY.shown, NO_PROXY: env.NO_PROXY ?? null },
    proxyCredentialsRemoved: Object.entries(named).filter(([, v]) => v.credentials).map(([name]) => name),
  }
}

const sh = (cmd) => execSync(cmd, { cwd: repo }).toString().trim()
const environment = {
  commit: sh('git rev-parse --short HEAD'),
  // Tracked changes anywhere, or any change under research/access (new files included): the
  // runner and the task file must be in the commit the record names.
  dirty: sh('git status --porcelain --untracked-files=no') !== '' || sh('git status --porcelain --untracked-files=all -- research/access') !== '',
  proxied: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy),
  ...shownEnv(process.env),
  api,
  exitIp: null,
  tasksSha256,
  startedAt: new Date().toISOString(),
}
if (rejudgeDir === undefined && process.env.W2L_EGRESS_ECHO_URL) {
  try {
    const { fetch: proxiedFetch, EnvHttpProxyAgent } = await import('undici')
    const res = await proxiedFetch(process.env.W2L_EGRESS_ECHO_URL, { dispatcher: new EnvHttpProxyAgent(), signal: AbortSignal.timeout(15_000) })
    environment.exitIp = (await res.text()).match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0] ?? null
  } catch { environment.exitIp = null }
}
// A competitor's key: the environment first, then the git-ignored .w2l/access/competitors.env (KEY=value lines) of this
// checkout, then of the main checkout when this one is a worktree.
async function competitorKey(name) {
  if (process.env[name]) return process.env[name]
  const main = dirname(sh('git rev-parse --path-format=absolute --git-common-dir'))
  for (const root of [...new Set([repo, main])]) {
    try {
      const line = (await readFile(join(root, '.w2l/access/competitors.env'), 'utf8')).split('\n').find((l) => l.trim().replace(/^export\s+/, '').startsWith(`${name}=`))
      const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
      if (value) return value
    } catch {}
  }
  throw new Error(`${name} is not set: put it in the environment or in .w2l/access/competitors.env`)
}
const keys = rejudgeDir !== undefined || target === 'octocrawl' ? {} : target === 'firecrawl' ? { firecrawl: await competitorKey('FIRECRAWL_API_KEY') } : { zenrows: await competitorKey('ZENROWS_API_KEY') }

/** Sends a competitor's request again while its plan answers 429 (Retry-After, else 15 s; five times at most), and says how long it waited. */
async function paced(send) {
  let res = await send()
  let waitedMs = 0
  for (let tries = 0; res.status === 429 && tries < 5; tries++) {
    const after = Number(res.headers.get('retry-after'))
    const before = Date.now()
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(after) && after > 0 ? after : 15) * 1000))
    res = await send()
    waitedMs += Date.now() - before
  }
  return { res, waitedMs }
}
// A competitor's API is on the internet: reached through the shell's proxy when one is set (Node's fetch ignores it).
const outbound = target === 'octocrawl' || !environment.proxied ? undefined : new (await import('undici')).EnvHttpProxyAgent()
environment.target = target
const runDir = rejudgeDir === undefined ? join(repo, '.w2l/access/runs', environment.startedAt.replace(/[:.]/g, '-')) : join(repo, rejudgeDir)
await mkdir(join(runDir, 'pages'), { recursive: true })
const linesFile = join(runDir, 'attempts.jsonl')

const get = (obj, path) => path.split('.').reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), obj)
const gfmTableCount = (md) => (md.match(/^\|.*\|\s*\n\|\s*:?-{3,}/gm) ?? []).length

function judge(p, doc) {
  const md = typeof doc.markdown === 'string' ? doc.markdown : ''
  switch (p.type) {
    case 'markdownIncludes': return md.includes(p.text)
    case 'markdownMatches': return new RegExp(p.pattern, p.flags ?? 'm').test(md)
    case 'markdownCountMin': return (md.match(new RegExp(p.pattern, (p.flags ?? '').replace('g', '') + 'g')) ?? []).length >= p.min
    case 'minTables': return gfmTableCount(md) >= p.min
    case 'listRecordsMin': { const r = get(doc, p.path ?? 'list.records'); return Array.isArray(r) && r.length >= p.min }
    case 'field': {
      const v = get(doc, p.path)
      if ('equals' in p) return v === p.equals
      if ('in' in p) return p.in.includes(v)
      if ('present' in p) return (v !== undefined && v !== null && v !== '') === p.present
      if ('min' in p || 'max' in p) return typeof v === 'number' && v >= (p.min ?? -Infinity) && v <= (p.max ?? Infinity)
      throw new Error(`field predicate on ${p.path} names no comparison`)
    }
    default: throw new Error(`unknown predicate type ${p.type}`)
  }
}

/**
 * Firecrawl Cloud's scrape of one task, as the document the predicates read: its success with the target's 2xx is
 * `success`, anything else `failed` with its reason; `credits` from its published billing (one per document returned).
 */
async function firecrawlScrape(task) {
  const timeout = Math.min(task.timeoutMs ?? 180_000, 300_000)
  const send = () => fetch(`${process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev'}/v2/scrape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${keys.firecrawl}` },
    body: JSON.stringify({ url: task.url, formats: task.request?.formats ?? ['markdown'], maxAge: 0, storeInCache: false, proxy: 'auto', timeout }),
    signal: AbortSignal.timeout(timeout + 30_000),
    ...(outbound === undefined ? {} : { dispatcher: outbound }),
  })
  // The plan's own rate limit (429) is the driver's pace, not the page's answer.
  const { res, waitedMs } = await paced(send)
  let body = null
  try { body = await res.json() } catch {}
  const data = body?.data ?? null
  const meta = data?.metadata ?? {}
  const code = typeof meta.statusCode === 'number' ? meta.statusCode : null
  const claimed = body?.success === true && data !== null && (code === null || (code >= 200 && code < 300))
  return {
    apiStatus: res.status,
    waitedMs,
    doc: {
      status: claimed ? 'success' : 'failed',
      markdown: typeof data?.markdown === 'string' ? data.markdown : null,
      evidence: { httpStatus: code },
      failureReason: claimed ? null : (meta.error ?? body?.error ?? body?.code ?? (code !== null ? `http_${code}` : `api_${res.status}`)),
      lane: meta.proxyUsed ? `firecrawl:${meta.proxyUsed}` : 'firecrawl',
      credits: data !== null ? 1 : 0,
    },
  }
}

/** ZenRows' Fetch API for one task: its 200 with a body is `success`, anything else `failed` with its code; a failure is not billed. */
async function zenrowsScrape(task) {
  const query = new URLSearchParams({ apikey: keys.zenrows, url: task.url, mode: 'auto', response_type: 'markdown' })
  const send = () => fetch(`${process.env.ZENROWS_API_URL ?? 'https://api.zenrows.com'}/v1/?${query}`, {
    signal: AbortSignal.timeout(200_000),
    ...(outbound === undefined ? {} : { dispatcher: outbound }),
  })
  const { res, waitedMs } = await paced(send)
  const text = await res.text()
  let code = null
  if (res.status !== 200) { try { const j = JSON.parse(text); code = j.code ?? j.title ?? null } catch {} }
  const claimed = res.status === 200 && text.length > 0
  return {
    apiStatus: res.status,
    waitedMs,
    doc: {
      status: claimed ? 'success' : 'failed',
      markdown: claimed ? text : null,
      evidence: { httpStatus: null },
      failureReason: claimed ? null : (code ?? `api_${res.status}`),
      lane: 'zenrows:auto',
      credits: claimed ? null : 0,
      requestCost: res.headers.get('x-request-cost'),
    },
  }
}

/** The paid provider calls the answer's Evidence Record lists, each as its provider, verdict and role; null when the record says nothing of them. */
function paidCallsOf(doc) {
  const access = doc?.evidenceRecord?.access
  if (access === undefined || access === null || !('paidCalls' in access)) return null
  return (access.paidCalls ?? []).map((c) => ({ provider: c.provider, outcome: c.outcome, reason: c.reason, answer: c.answer, chargedUsd: c.chargedUsd }))
}

/** What the API's spend ledger charged the scrape: 0 when its record lists no paid call, null when that is not known. */
function chargedOf(doc) {
  if (typeof doc?.usage?.externalCostChargedUsd === 'number') return doc.usage.externalCostChargedUsd
  const calls = paidCallsOf(doc)
  return calls !== null && calls.length === 0 ? 0 : null
}

async function attempt(task, temperature) {
  const body = { url: task.url, ...(task.request ?? {}), maxAge: 0, ...(access === undefined ? {} : { access }) }
  const started = Date.now()
  let doc = null, apiStatus = null, error = null, waitedMs = 0
  try {
    if (target === 'firecrawl' || target === 'zenrows') {
      ({ apiStatus, doc, waitedMs } = await (target === 'firecrawl' ? firecrawlScrape(task) : zenrowsScrape(task)))
    } else {
      const res = await fetch(`${api}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(task.timeoutMs ?? 180_000) })
      apiStatus = res.status
      doc = await res.json()
    }
  } catch (e) { error = String(e) }
  // The time a plan's rate limit held the request back is the driver's pace, not the page's.
  const wallMs = Date.now() - started - waitedMs
  // The page's own Markdown, as the API gave it (a rejudge reads it back): not scrubbed, which would change the site's text.
  if (typeof doc?.markdown === 'string') await writeRaw(join(runDir, 'pages', `${task.id}-${temperature}.md`), doc.markdown)
  const results = doc === null ? [] : task.predicates.map((p) => ({ p, pass: (() => { try { return judge(p, doc) } catch { return false } })() }))
  const answered = doc !== null && (doc.status === 'success' || doc.status === 'partial')
  const verified = answered && results.every((r) => r.pass)
  const dataFailed = results.some((r) => isData(r.p) && !r.pass)
  const events = doc === null ? [] : [...new Set([...(doc.trace ?? []).map((t) => t.event), ...(doc.ladderTrace ?? []).map((t) => t.event)])]
  return {
    taskId: task.id, url: task.url, part: task.part, temperature,
    observed: {
      apiStatus, httpStatus: doc?.evidence?.httpStatus ?? null, status: doc?.status ?? null,
      reason: doc?.failureReason ?? doc?.blockReason ?? doc?.budgetExceeded ?? doc?.error?.code ?? (typeof doc?.code === 'string' ? doc.code : null) ?? error,
      // An error answer's message, in the git-ignored attempts file only: a local server's 500 says what threw, and its
      // log may be gone by the time anyone reads the run (the PA 4 Steel runs' 500s at about 32 s).
      ...(apiStatus !== null && apiStatus >= 400 && typeof doc?.error === 'string' ? { apiError: doc.error.slice(0, 500) } : {}),
      lane: doc?.lane ?? null, channelsTried: doc?.channelsTried ?? doc?.summary?.channelsTried ?? null,
      gateEvents: events.filter((e) => /gate|blocked|challenge|quality|client_rendered|identity|robots/.test(e)),
      markdownChars: typeof doc?.markdown === 'string' ? doc.markdown.length : null,
      ...(doc?.requestCost === undefined ? {} : { requestCost: doc.requestCost }),
      ...(target === 'octocrawl' ? { paidCalls: paidCallsOf(doc) } : {}),
    },
    intervention: { access: access ?? null, lane: doc?.lane ?? null, egress: doc?.evidence?.envProxy ?? null },
    outcome: {
      verified, falseSuccess: doc?.status === 'success' && dataFailed,
      failedPredicates: results.filter((r) => !r.pass).map((r) => r.p.type + (r.p.path ? `:${r.p.path}` : '')),
      wallMs, externalCostUsd: doc?.usage?.externalCostUsd ?? null, egressCostUsd: null,
      ...(target === 'octocrawl' ? { chargedUsd: chargedOf(doc) } : { credits: doc?.credits ?? (error === null ? null : 0) }),
      completion: verified ? 'unattended_public' : null,
    },
    suspected: { cause: 'unknown', confidence: 'not_isolated' },
    environment: { commit: environment.commit, dirty: environment.dirty, proxied: environment.proxied, at: new Date(started).toISOString() },
  }
}

const rows = []
let rejudged = null
let priorRun = null
const droppedRows = []
// A rejudge's own files, beside the run's, which it never rewrites.
const rejudgeStamp = environment.startedAt.replace(/[:.]/g, '-')
if (rejudgeDir !== undefined) {
  // Re-check saved Markdown against the current predicates. Status, reason and timings stay as
  // the run observed them; only the predicate verdicts are recomputed, into new files.
  const byId = new Map(taskFile.tasks.map((t) => [t.id, t]))
  // The run's own proxy settings are kept out of every file this rejudge writes, as the shell's are.
  const prior = JSON.parse(await readFile(join(runDir, 'summary.json'), 'utf8'))
  keepOut(Object.values(prior.environment.proxyEnv ?? {}))
  const old = (await readFile(linesFile, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => { delete r.droppedAfterRun; return r })
  for (const row of old) {
    const task = byId.get(row.taskId)
    if (task === undefined || (row.url !== undefined && row.url !== task.url)) {
      // The task was removed from the file (or its id now names another URL) after this run: it
      // stays in the denominator with the run's own verdict, which the current predicates cannot redo.
      row.notRejudged = task === undefined ? 'removed from tasks.v1.json after the run' : 'its URL in tasks.v1.json changed after the run'
      droppedRows.push(row)
      rows.push(row)
      continue
    }
    row.original = { verified: row.outcome.verified, falseSuccess: row.outcome.falseSuccess, failedPredicates: row.outcome.failedPredicates }
    row.url = task.url
    row.part = task.part
    let markdown = null
    try { markdown = await readFile(join(runDir, 'pages', `${row.taskId}-${row.temperature}.md`), 'utf8') } catch {}
    const doc = { markdown }
    const results = row.observed.status === null ? [] : task.predicates.map((p) => ({ p, pass: (() => { try { return judge(p, doc) } catch { return false } })() }))
    const answered = row.observed.status === 'success' || row.observed.status === 'partial'
    row.outcome.verified = answered && results.length > 0 && results.every((r) => r.pass)
    row.outcome.falseSuccess = row.observed.status === 'success' && results.some((r) => isData(r.p) && !r.pass)
    row.outcome.failedPredicates = results.filter((r) => !r.pass).map((r) => r.p.type + (r.p.path ? `:${r.p.path}` : ''))
    row.outcome.completion = row.outcome.verified ? 'unattended_public' : null
    row.rejudgedAt = environment.startedAt
    rows.push(row)
  }
  await writeFile(join(runDir, `attempts.rejudged-${rejudgeStamp}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  rejudged = { at: environment.startedAt, command: `node research/access/run-set.mjs ${args.join(' ')}`, commit: environment.commit, tasksSha256 }
  Object.assign(environment, prior.environment)
  // A run recorded before proxy settings were shown this way keeps no more of them than a new one.
  const shown = shownEnv(prior.environment.proxyEnv ?? {})
  Object.assign(environment, shown, { proxyCredentialsRemoved: [...new Set([...(prior.environment.proxyCredentialsRemoved ?? []), ...shown.proxyCredentialsRemoved])] })
  environment.tasksSha256 = prior.environment.tasksSha256
  priorRun = prior
}
for (const task of rejudgeDir === undefined ? tasks : []) {
  for (const temperature of warm ? ['cold', 'warm'] : ['cold']) {
    const row = await attempt(task, temperature)
    rows.push(row)
    await appendFile(linesFile, JSON.stringify(row) + '\n')
    console.log(scrub(`${task.id} ${temperature} ${row.outcome.verified ? 'verified' : 'not verified'} ${row.observed.status ?? '-'} ${row.observed.reason ?? ''}`))
  }
}

const pct = (xs, q) => { if (xs.length === 0) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) }
const summary = (temp) => {
  const r = rows.filter((x) => x.temperature === temp)
  const costs = r.map((x) => x.outcome.externalCostUsd)
  const verifiedN = r.filter((x) => x.outcome.verified).length
  return {
    attempts: r.length, verified: verifiedN, falseSuccess: r.filter((x) => x.outcome.falseSuccess).length,
    p50Ms: pct(r.map((x) => x.outcome.wallMs), 0.5), p95Ms: pct(r.map((x) => x.outcome.wallMs), 0.95),
    externalCostPer1000VerifiedUsd: costs.some((c) => c === null) || verifiedN === 0 ? null : (costs.reduce((a, b) => a + b, 0) / verifiedN) * 1000,
    egressCostPer1000VerifiedUsd: null,
    ...((environment.target ?? 'octocrawl') === 'octocrawl' ? (() => {
      // Rows from a run before paid calls were recorded carry neither field: unknown, not none.
      const charged = r.map((x) => x.outcome.chargedUsd ?? null)
      const calls = r.map((x) => x.observed.paidCalls ?? null)
      return {
        chargedUsd: charged.some((c) => c === null) ? null : charged.reduce((a, b) => a + b, 0),
        paidCalls: calls.some((c) => c === null) ? null : calls.reduce((a, b) => a + b.length, 0),
        verifiedFromPaidCall: calls.some((c) => c === null) ? null : r.filter((x) => x.outcome.verified && x.observed.paidCalls.some((c) => c.answer)).length,
      }
    })() : (() => { const c = r.map((x) => x.outcome.credits); return { credits: c.some((v) => v === null || v === undefined) ? null : c.reduce((a, b) => a + b, 0), creditsPer1000Verified: c.some((v) => v === null || v === undefined) || verifiedN === 0 ? null : (c.reduce((a, b) => a + b, 0) / verifiedN) * 1000 } })()),
  }
}
const finishedAt = priorRun?.finishedAt ?? new Date().toISOString()
const command = priorRun?.command ?? `node research/access/run-set.mjs ${args.join(' ')}`
const hasWarm = rows.some((r) => r.temperature === 'warm')
const totals = { cold: summary('cold'), ...(hasWarm ? { warm: summary('warm') } : {}) }
await writeFile(join(runDir, rejudgeDir === undefined ? 'summary.json' : `summary.rejudged-${rejudgeStamp}.json`), JSON.stringify({ command, environment, finishedAt, set: priorRun?.set ?? setFilter, access: priorRun?.access ?? access ?? null, totals, ...(rejudged === null ? {} : { rejudged }) }, null, 2))

if (recordFile !== undefined) {
  const fmt = (v) => (v === null ? 'unknown' : String(v))
  // A provider call's provider, what Octocrawl made of its page and whether it is the answer, for runs that recorded them.
  const paidColumn = rows.some((r) => Array.isArray(r.observed.paidCalls) && r.observed.paidCalls.length > 0)
  const paidCell = (calls) => calls === null || calls === undefined ? 'unknown' : calls.map((c) => `${c.provider}: ${c.outcome ?? 'no page'}${c.reason ? `/${c.reason}` : ''}${c.answer ? ' (answer)' : ''}`).join('; ')
  const md = [
    `# Access task set run: ${priorRun?.set ?? setFilter}, ${environment.startedAt.slice(0, 10)}`, '',
    `- Command: \`${command}\``,
    ...(rejudged === null ? [] : [`- Rejudged: ${rejudged.at} against tasks.v1.json with SHA-256 \`${rejudged.tasksSha256}\` (\`${rejudged.command}\`); statuses and timings are the run's own`]),
    `- Source commit: \`${environment.commit}\`${environment.dirty ? ' (working tree had uncommitted changes)' : ''}`,
    `- Network: ${environment.proxied ? `proxied (HTTPS_PROXY=${environment.proxyEnv.HTTPS_PROXY ?? ''}, HTTP_PROXY=${environment.proxyEnv.HTTP_PROXY ?? ''}, NO_PROXY=${environment.proxyEnv.NO_PROXY ?? ''}${environment.proxyCredentialsRemoved.length === 0 ? '' : `; credentials and query of ${environment.proxyCredentialsRemoved.join(', ')} not recorded`})` : 'direct'}`,
    `- Target: ${TARGETS[environment.target ?? 'octocrawl']}${(environment.target ?? 'octocrawl') === 'octocrawl' ? '' : ' (the network line is the driver\'s way to its API; the provider fetches from its own cloud)'}`,
    `- API: ${(environment.target ?? 'octocrawl') === 'octocrawl' ? environment.api : 'the provider\'s'}; access option: ${(priorRun === null ? access ?? null : priorRun.access) === null ? 'none' : `\`${JSON.stringify(priorRun === null ? access : priorRun.access)}\``}`,
    `- Exit address: ${environment.exitIp ?? 'not recorded'}`,
    `- Run: ${environment.startedAt} → ${finishedAt}`,
    `- Tasks: ${rows.filter((r) => r.temperature === 'cold').length} (set \`${priorRun?.set ?? setFilter}\`${only ? `, only ${only.join(', ')}` : ''}); task file SHA-256 at fetch time: ${environment.tasksSha256 === undefined ? 'not recorded (run before the hash was added)' : `\`${environment.tasksSha256}\``}; method in the header of run-set.mjs`, '',
    `| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |${'credits' in totals.cold ? ' Credits (inferred) | Credits per 1,000 verified |' : ''}`,
    `| --- | --- | --- | --- | --- | --- | --- |${'credits' in totals.cold ? ' --- | --- |' : ''}`,
    ...Object.entries(totals).map(([temp, t]) => `| ${temp}: ${t.attempts} | ${t.verified} | ${t.falseSuccess} | ${fmt(t.p50Ms)} | ${fmt(t.p95Ms)} | ${fmt(t.externalCostPer1000VerifiedUsd)} | ${fmt(t.egressCostPer1000VerifiedUsd)} |${'credits' in t ? ` ${fmt(t.credits)} | ${fmt(t.creditsPer1000Verified === null ? null : Math.round(t.creditsPer1000Verified))} |` : ''}`), '',
    ...Object.entries(totals).filter(([, t]) => 'paidCalls' in t).map(([temp, t]) => `- Paid provider calls (${temp}): ${fmt(t.paidCalls)}; tasks verified with a paid call's page as the answer: ${fmt(t.verifiedFromPaidCall)}; charged by the spend ledger: ${t.chargedUsd === null ? 'unknown' : `$${t.chargedUsd.toFixed(4)}`} (a provider that states no price is charged its sessions' measured time under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)`),
    ...(Object.values(totals).some((t) => 'paidCalls' in t) ? [''] : []),
    `| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |${paidColumn ? ' Paid calls |' : ''}`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |${paidColumn ? ' --- |' : ''}`,
    ...rows.map((r) => `| ${r.taskId} | ${r.temperature} | ${r.outcome.verified ? 'yes' : 'no'}${r.outcome.falseSuccess ? ' (false success)' : ''} | ${r.observed.status ?? '-'} | ${r.observed.reason ?? ''} | ${r.observed.httpStatus ?? ''} | ${r.observed.lane ?? ''} | ${(r.observed.channelsTried ?? []).join(' → ')} | ${r.outcome.failedPredicates.join(', ')} | ${r.outcome.wallMs} |${paidColumn ? ` ${paidCell(r.observed.paidCalls)} |` : ''}`),
    '', 'Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).', '',
    ...(droppedRows.length === 0 ? [] : [`Not rejudged, counted above with the run's own verdict (removed from the task file, or its URL changed, after this run; a reason, where given, is in tasks.v1.json \`excluded\`): ${[...new Set(droppedRows.map((r) => r.taskId))].join(', ')}.`, '']),
  ].join('\n')
  await mkdir(dirname(join(repo, recordFile)), { recursive: true })
  await writeFile(join(repo, recordFile), md)
}
console.log(JSON.stringify(totals))
