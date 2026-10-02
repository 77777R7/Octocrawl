#!/usr/bin/env node
// Real-site parity checks: run every case in sites.v1.json against a running
// W2L REST API, save each raw response and report which checks passed.
//
// Usage: npm run api   (in another terminal, from the repo root)
//        node research/parity/run-sites.mjs [--batch 1] [--only S01,S04] [--record <file.md>]
// Env:   W2L_API_URL (default http://127.0.0.1:8787)
//
// Raw responses and results.json go to .w2l/parity/<timestamp>/ (git-ignored).
// --record also writes the Markdown summary to <file.md>, for a dated record
// under research/parity/runs/. Exit code 0 only when every selected check passed.
//
// Added for batch L (the audit's first live batch):
//   crawl       reads /pages through every cursor with limit=<case.pageSize, default 100>
//               (doc.pageRequests counts the calls); doc.report is the crawl status and
//               doc.errors the /errors list. case.robots: true reads <origin>/robots.txt
//               directly into doc.robots {crawlDelayMs, seedAllowed} ('*' group only).
//   pagination  scrapes url and compareUrl, batches the links matching case.pageLinks from
//               each, and sums the data rows of tables whose header matches case.tableHeader.
//   checks      itemCount, uniqueUrls, fieldType, field equalsPath (equals compares arrays by
//               value), markdownCount, tableShape (every GFM row as wide as its header),
//               table (header regexes, exact rows or minRows), traceEvent (an event in a
//               debug trace), fetchSpacing, eachItem path. fetchSpacing estimates each fetch
//               start (pages and errors) as createdAt minus the ladder's total time: the API has
//               no per-request start time on the http lane (trace times are relative there and
//               compliance is null). record: true prints a check's observed value in the record,
//               which also lists every failed check with its observed value.
//
// Added for the crawl lifecycle (P1 item 10):
//   crawl       reads /pages with debug=true: since then pages carry their trace and routing
//               audit only on request. It records doc.startMs (the start call's round trip),
//               doc.stepCount (pages plus errors) and doc.progress from the status polls while
//               the crawl runs: {polls, maxPagesFetchedWhileRunning, monotonic, midRunPages},
//               where midRunPages counts /pages items read once, at the first running poll that
//               reports a fetched page.
//   checks      field min / max (a number at least / at most the value); crawlDelay: every
//               fetched page (pages and errors, robots-denied ones excepted) has a crawl_delay
//               trace event, and per host its recorded starts are at least the robots.txt
//               Crawl-delay the runner read (doc.robots) apart, which each page after the
//               first also names as robotsCrawlDelayMs.
//
// Added for the Evidence Record:
//   checks      evidenceSchema: the value at path (default evidenceRecord) is valid against
//               packages/contracts/schemas/evidence-record.v1.json (ajv, draft 2020-12); inside
//               eachItem it checks each batch item or crawl page.
// Added for the core-29 scoring (2026-09-29), for the audit checks that need a client:
//   sdk         drives the built @w2l/sdk (packages/sdk; run `npm run typecheck` or `npm run api`
//               first) against the API. case.sdk.op 'crawlWait' / 'batchWait' starts the crawl
//               (case.url) or batch (case.urls), waits with case.sdk.pollIntervalMs / timeoutMs,
//               lists every page or item and, with case.sdk.timeoutProbeMs, starts the same task
//               again, waits that long, records the error into doc.timeoutProbe and cancels it
//               (doc.probeCancel). 'scrape' scrapes case.url with the token the SDK takes from
//               W2L_API_TOKEN, then again with no token and a wrong one (doc.withoutToken,
//               doc.wrongToken: {name, status, code}).
//   apiEnv      a case may name the environment variable that holds its API's URL (for example
//               W2L_HOSTED_API_URL for a hosted-mode API); the case fails when it is unset.
//   scrape      doc.elapsedMs is the call's round trip. case.egress: true reads the IPv4 address
//               case.url shows the runner directly and through the runner's environment proxy
//               (undici EnvHttpProxyAgent) into doc.egress {directIp, proxiedIp, reportedIp,
//               reportedIsDirect}, where reportedIp is the first IPv4 address in W2L's Markdown.
//   batch       records doc.startMs and doc.progress from status polls every case.pollMs (default
//               2000): {polls, maxCompletedWhileRunning, monotonic, midRunItems, midRunSubset},
//               where midRunItems counts the items read at the first running poll that reports a
//               completed URL and midRunSubset says each of them is in the final list.
//               case.debug: true reads items with debug=true (their trace).
//   checks      eachItem urlPattern (only items whose url matches); itemUrls path (default items);
//               hostSpacing: every fetched item has a crawl_delay trace event and, per host,
//               consecutive recorded starts are at least the delay W2L recorded as required
//               (requiredDelayMs) apart, on at least minHosts hosts.
// Added for the timeout, waiter and /fc crawl status gaps (2026-09-29):
//   sdk         case.sdk.op 'crawlAndWait' / 'batchAndWait' calls the SDK helper of that name
//               (case.url or case.urls, case.request, pollIntervalMs / timeoutMs); doc.items are
//               its pages or items, doc.errors a crawl's errors. case.sdk.pollFaults lists faults
//               answered, one each, to the wait's first status requests instead of the API: an
//               HTTP status (429 with Retry-After: 1) or 'network' (a thrown TypeError). The
//               injection happens in the runner's fetch, not on the network; doc.faults counts
//               {injected, remaining}.
//   fc-crawl    POST /fc/v1/crawl with case.request, polls GET /fc/v1/crawl/:id?limit=1 every 2 s
//               while it is scraping, recording doc.progress {polls, nullTotals,
//               totalAboveCompleted, totalBelowCompleted, nextWhileScraping}; with
//               case.cancelAfterCompleted it cancels the crawl (native POST /v1/crawl/:id/cancel,
//               the shim has no cancel) once completed reaches that many. Then it reads every data
//               page from GET /fc/v1/crawl/:id?limit=<case.pageLimit, default 100>, following
//               next: doc.items (all data), doc.pageRequests, doc.final {status, completed, total,
//               nextOnLastPage, dataLength, errorPages, pagesWithoutError}.
// Added for the Markdown and response-metadata gaps (2026-09-29):
//   scrape      case.compareRequest scrapes case.url a second time with that request, into
//               doc.compare (the audit's onlyMainContent check compares the two responses).
//   checks      field abovePath: a number greater than the number at that path (a string's
//               length is <path>.length).
// Added for file download and PDF text (P2, 2026-09-29):
//   checks      pdfPage: the text between the Markdown line <!-- page N --> (N = spec.page) and the
//               next page marker contains spec.text, every run of whitespace collapsed to one space
//               in both (the rule of research/pdf-corpus/manifest.v1.json); the Markdown is doc.markdown,
//               or the string at spec.path (data.markdown on /fc). When it fails, the observed value
//               says whether the text is on another page or absent.
// Added for SEC's declared User-Agent (2026-09-29):
//   requiresEnv a case may name an environment variable it needs (A36: W2L_CONTACT, which the API
//               must be started with too). Unset, the case is not run and is reported as skipped:
//               it stays in the case count, is never counted as passing, and the exit code is 1.
//               The Markdown summary shows such a variable's value as <NAME>, never the value.
//   checks      field equalsEnv: equals the string with each ${NAME} replaced by that variable.
// Added for MCP cancellation over Streamable HTTP (2026-09-29):
//   mcp-cancel  a raw MCP client (JSON-RPC POSTs) against a running local MCP service whose /mcp URL
//               is in the variable case.requiresEnv names. Two clients initialize (doc.sessions: the
//               Mcp-Session-Id each got). The scrape tool is called on case.url with case.request, and
//               case.cancelAfterMs later: another client sends notifications/cancelled for its id
//               (doc.foreign: the call must run on to its answer), then the calling client does for a
//               second call (doc.own: it must be answered at once), then two calls have their requests
//               closed (the client disconnects) and a probe call scrapes case.probeUrl, on the same host
//               (doc.probe: it must not wait behind the two dropped calls for the host's two slots).
//               Each call records elapsedMs, status and failureReason of its result, or its JSON-RPC error.
// Added for the table strategy and table-cell links (2026-09-30):
//   checks      tableTargets: the Markdown link and image targets inside GFM table rows (header
//               rows included) that match spec.pattern (default ^https?://), at least spec.min of them;
//               the observed value gives how many matched out of all targets in table rows.
// Added for the map endpoint (M3, 2026-10-03):
//   map         POST /v1/map with { url, ...case.request }; doc is the response with doc.items = its links
//               (so itemCount, uniqueUrls, itemUrls and eachItem read the links) and doc.roundTripMs, the
//               runner's own round trip beside the response's elapsedMs. case.probes lists further request
//               bodies sent to the same URL, each recorded in doc.probes as { httpStatus, error, code }.
//   checks      countWhere: the items at spec.path (default items) whose value at spec.field (the item
//               itself when absent) includes spec.includes (an array member or a substring), matches
//               spec.pattern, is present (spec.present) or equals spec.value; their number is at least
//               spec.min, at most spec.max and, with spec.count, exactly that.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const here = dirname(fileURLToPath(import.meta.url))
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'
const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const batchFilter = flag('--batch')
const onlyFilter = flag('--only')?.split(',').map((id) => id.trim())
const recordFile = flag('--record')
const outDir = join(here, '../../.w2l/parity', new Date().toISOString().replace(/[:.]/g, '-'))

const manifest = JSON.parse(await readFile(join(here, 'sites.v1.json'), 'utf8'))
const evidenceSchema = new Ajv2020({ allErrors: true, allowUnionTypes: true })
  .compile(JSON.parse(await readFile(join(here, '../../packages/contracts/schemas/evidence-record.v1.json'), 'utf8')))
const cases = manifest.cases.filter((c) =>
  (batchFilter === undefined || String(c.batch) === batchFilter) &&
  (onlyFilter === undefined || onlyFilter.includes(c.id)))

let commit = null
let dirty = null
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() !== ''
} catch {}

async function call(method, path, body) {
  const res = await fetch(api + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { httpStatus: res.status, json, text: json === null ? text : undefined }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Every item of a paged list, following nextCursor.
async function readAll(path, limit, query = '') {
  const items = []
  let cursor = null
  let calls = 0
  do {
    const page = await call('GET', `${path}?limit=${limit}${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    calls++
    items.push(...(page.json?.pages ?? page.json?.items ?? []))
    cursor = page.json?.hasMore ? page.json.nextCursor : null
  } while (cursor && calls < 100)
  return { items, calls }
}

// The '*' group of <origin>/robots.txt, read without W2L: Crawl-delay and whether the
// longest matching Allow/Disallow rule permits url. A robots.txt that is not 2xx allows everything.
async function readRobots(url) {
  const robotsUrl = new URL('/robots.txt', url).href
  try {
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(20000) })
    const rules = []
    let crawlDelayMs = null
    let star = false
    let agents = false
    for (const line of (res.ok ? await res.text() : '').split('\n')) {
      const [key, ...rest] = line.replace(/#.*/, '').split(':')
      const field = key.trim().toLowerCase()
      const value = rest.join(':').trim()
      if (field === 'user-agent') { star = (agents && star) || value === '*'; agents = true; continue }
      if (field === '') continue
      agents = false
      if (star && field === 'crawl-delay') crawlDelayMs = Number(value) * 1000
      if (star && (field === 'allow' || field === 'disallow') && value !== '') rules.push({ allow: field === 'allow', pattern: value })
    }
    const target = new URL(url)
    const matching = rules.filter((rule) => new RegExp(`^${rule.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`).test(target.pathname + target.search))
    const best = matching.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow))[0]
    return { url: robotsUrl, httpStatus: res.status, crawlDelayMs, seedAllowed: best === undefined || best.allow }
  } catch (error) {
    return { url: robotsUrl, error: String(error) }
  }
}

const ipv4 = (text) => text.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/)?.[0] ?? null

// The IPv4 address an IP echo URL shows the runner itself, directly and through the environment
// proxy (HTTPS_PROXY / HTTP_PROXY / NO_PROXY, as W2L's local mode reads them); null when unreachable.
async function egressIps(url) {
  const { fetch: undiciFetch, Agent, EnvHttpProxyAgent } = await import('undici')
  const read = async (dispatcher) => {
    try {
      return ipv4(await (await undiciFetch(url, { dispatcher, signal: AbortSignal.timeout(20000) })).text())
    } catch {
      return null
    }
  }
  return { directIp: await read(new Agent()), proxiedIp: await read(new EnvHttpProxyAgent()) }
}

// Data rows of every GFM table: a |-row, a --- separator row, then |-rows.
function gfmTables(markdown) {
  const lines = markdown.split('\n')
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim())
  const tables = []
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) continue
    const table = { headerLine: lines[i].trim(), header: cells(lines[i]), rows: [] }
    for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) table.rows.push(cells(lines[i]))
    tables.push(table)
    i--
  }
  return tables
}

// Each runner returns { response, doc } where doc is the one scraped document
// the checks look at (for batch/crawl cases: the items array under doc.items).
const runners = {
  async scrape(c) {
    const began = Date.now()
    const response = await call('POST', '/v1/scrape', { url: c.url, ...c.request })
    const doc = { ...(response.json ?? {}), elapsedMs: Date.now() - began }
    if (c.compareRequest) {
      const compare = await call('POST', '/v1/scrape', { url: c.url, ...c.compareRequest })
      doc.compare = compare.json ?? {}
      response.compare = compare
    }
    if (c.egress) {
      const ips = await egressIps(c.url)
      const reportedIp = ipv4(typeof doc.markdown === 'string' ? doc.markdown : '')
      doc.egress = { ...ips, reportedIp, reportedIsDirect: reportedIp !== null && reportedIp === ips.directIp }
      response.egress = doc.egress
    }
    return { response, doc }
  },
  async map(c) {
    const began = Date.now()
    const response = await call('POST', '/v1/map', { url: c.url, ...c.request })
    const doc = { ...(response.json ?? {}), roundTripMs: Date.now() - began }
    doc.items = Array.isArray(doc.links) ? doc.links : []
    if (Array.isArray(c.probes)) {
      doc.probes = []
      for (const body of c.probes) {
        const probe = await call('POST', '/v1/map', { url: c.url, ...body })
        doc.probes.push({ request: body, httpStatus: probe.httpStatus, error: probe.json?.error ?? null, code: probe.json?.code ?? null })
      }
      response.probes = doc.probes
    }
    return { response, doc }
  },
  async 'fc-scrape'(c) {
    const response = await call('POST', '/fc/v1/scrape', { url: c.url, ...c.request })
    return { response, doc: response.json ?? {} }
  },
  async batch(c) {
    const startedAt = Date.now()
    const start = await call('POST', '/v1/batches', { urls: c.urls, ...c.request })
    const startMs = Date.now() - startedAt
    const taskId = start.json?.taskId
    if (!taskId) return { response: start, doc: start.json ?? {} }
    let status
    const polls = []
    let midRunUrls = null
    for (let i = 0; i < 120; i++) {
      status = await call('GET', `/v1/batches/${taskId}`)
      if (!['pending', 'running'].includes(status.json?.status)) break
      polls.push({ status: status.json.status, completed: status.json.completed ?? null })
      if (midRunUrls === null && status.json.status === 'running' && status.json.completed > 0) {
        midRunUrls = (await readAll(`/v1/batches/${taskId}/items`, 50)).items.map((item) => item.url)
      }
      await sleep(c.pollMs ?? 2000)
    }
    const items = await readAll(`/v1/batches/${taskId}/items`, 50, c.debug ? '&debug=true' : '')
    const counts = polls.filter((poll) => poll.status === 'running').map((poll) => poll.completed).filter(Number.isFinite)
    const finalUrls = new Set(items.items.map((item) => item.url))
    const progress = { polls: polls.length, maxCompletedWhileRunning: counts.length === 0 ? null : Math.max(...counts), monotonic: counts.every((n, i) => i === 0 || n >= counts[i - 1]), midRunItems: midRunUrls?.length ?? null, midRunSubset: midRunUrls === null ? null : midRunUrls.every((url) => finalUrls.has(url)) }
    return { response: { start, startMs, progress, status, items }, doc: { status: status.json?.status, report: status.json, items: items.items, startMs, progress } }
  },
  // A client's view: the built @w2l/sdk against the case's API (see the header).
  async sdk(c) {
    const { W2L, WaitTimeoutError } = await import('@w2l/sdk')
    const baseUrl = c.apiEnv === undefined ? api : process.env[c.apiEnv]
    if (!baseUrl) throw new Error(`${c.apiEnv} is not set`)
    // No token option: the SDK sends W2L_API_TOKEN from the environment when it is set.
    // case.sdk.pollFaults answers the first status requests (GET /v1/crawl/:id or /v1/batches/:id) itself.
    const faults = [...(c.sdk?.pollFaults ?? [])]
    const statusPath = /^\/v1\/(crawl|batches)\/[^/]+$/
    const faultyFetch = async (input, init) => {
      if ((init?.method ?? 'GET') === 'GET' && statusPath.test(new URL(String(input)).pathname) && faults.length > 0) {
        const fault = faults.shift()
        if (fault === 'network') throw new TypeError('fetch failed (injected by the runner)')
        return new Response(`injected ${fault}`, { status: fault, headers: fault === 429 ? { 'retry-after': '1' } : {} })
      }
      return fetch(input, init)
    }
    const w2l = new W2L({ baseUrl, ...(c.sdk?.pollFaults === undefined ? {} : { fetch: faultyFetch }) })
    const faultCount = () => (c.sdk?.pollFaults === undefined ? undefined : { injected: c.sdk.pollFaults.length - faults.length, remaining: faults.length })
    const failure = async (promise) => {
      try { await promise; return null } catch (error) { return { name: error?.name ?? null, status: error?.status ?? null, code: error?.code ?? null } }
    }
    const op = c.sdk?.op
    if (op === 'scrape') {
      const began = Date.now()
      const scrape = await w2l.scrape(c.url, c.request ?? {})
      const elapsedMs = Date.now() - began
      const withoutToken = await failure(new W2L({ baseUrl, token: '' }).scrape(c.url, c.request ?? {}))
      const wrongToken = await failure(new W2L({ baseUrl, token: 'w2l-parity-wrong-token' }).scrape(c.url, c.request ?? {}))
      const tokenInEnvironment = Boolean(process.env.W2L_API_TOKEN)
      return { response: { baseUrl, tokenInEnvironment, scrape, withoutToken, wrongToken }, doc: { ...scrape, elapsedMs, tokenInEnvironment, withoutToken, wrongToken } }
    }
    if (op === 'crawlAndWait' || op === 'batchAndWait') {
      const began = Date.now()
      const wait = { pollIntervalMs: c.sdk.pollIntervalMs, timeoutMs: c.sdk.timeoutMs }
      const result = op === 'crawlAndWait' ? await w2l.crawlAndWait(c.url, c.request ?? {}, wait) : await w2l.batchAndWait(c.urls, c.request ?? {}, wait)
      const items = result.pages ?? result.items
      const errors = result.errors ?? []
      const doc = { status: result.report.status, report: result.report, items, errors, stepCount: items.length + errors.length, waitMs: Date.now() - began, faults: faultCount() }
      return { response: { taskId: result.taskId, ...doc }, doc }
    }
    if (op !== 'crawlWait' && op !== 'batchWait') throw new Error(`unknown sdk op ${op}`)
    const crawl = op === 'crawlWait'
    const start = () => (crawl ? w2l.crawl(c.url, c.request ?? {}) : w2l.batchScrape(c.urls, c.request ?? {}))
    const wait = (id, options) => (crawl ? w2l.waitCrawl(id, options) : w2l.waitBatch(id, options))
    const began = Date.now()
    const { taskId } = await start()
    const report = await wait(taskId, { pollIntervalMs: c.sdk.pollIntervalMs, timeoutMs: c.sdk.timeoutMs })
    const waitMs = Date.now() - began
    const items = []
    for await (const item of crawl ? w2l.listCrawlPages(taskId, { limit: 100 }) : w2l.listBatchItems(taskId, { limit: 50 })) items.push(item)
    const errors = []
    if (crawl) {
      let cursor
      do {
        const page = await w2l.getCrawlErrors(taskId, { limit: 100, cursor })
        errors.push(...page.items)
        cursor = page.hasMore ? page.nextCursor ?? undefined : undefined
      } while (cursor !== undefined)
    }
    let timeoutProbe = null
    let probeCancel = null
    if (c.sdk.timeoutProbeMs !== undefined) {
      const probe = await start()
      const probeBegan = Date.now()
      try {
        const last = await wait(probe.taskId, { pollIntervalMs: c.sdk.pollIntervalMs, timeoutMs: c.sdk.timeoutProbeMs })
        timeoutProbe = { thrown: false, lastStatus: last.status, elapsedMs: Date.now() - probeBegan }
      } catch (error) {
        timeoutProbe = { thrown: true, name: error?.name ?? null, isWaitTimeoutError: error instanceof WaitTimeoutError, taskId: error?.taskId ?? null, jobIdMatches: error?.taskId === probe.taskId, lastStatus: error?.last?.status ?? null, timeoutMs: error?.timeoutMs ?? null, elapsedMs: Date.now() - probeBegan }
      }
      const cancelled = crawl ? await w2l.cancelCrawl(probe.taskId) : await w2l.cancelBatch(probe.taskId)
      probeCancel = { taskId: probe.taskId, status: cancelled.status }
    }
    const doc = { status: report.status, report, items, errors, stepCount: items.length + errors.length, waitMs, timeoutProbe, probeCancel, faults: faultCount() }
    return { response: { taskId, ...doc }, doc }
  },
  async crawl(c) {
    const robots = c.robots ? await readRobots(c.url) : undefined
    const startedAt = Date.now()
    const start = await call('POST', '/v1/crawl', { url: c.url, ...c.request })
    const startMs = Date.now() - startedAt
    const taskId = start.json?.taskId
    if (!taskId) return { response: start, doc: start.json ?? {} }
    let status
    const polls = []
    let midRunPages = null
    for (let i = 0; i < 150; i++) {
      status = await call('GET', `/v1/crawl/${taskId}`)
      if (!['pending', 'running'].includes(status.json?.status)) break
      polls.push({ status: status.json.status, pagesFetched: status.json.pagesFetched ?? null })
      if (midRunPages === null && status.json.status === 'running' && status.json.pagesFetched > 0) {
        midRunPages = (await call('GET', `/v1/crawl/${taskId}/pages?limit=100`)).json?.items?.length ?? null
      }
      await sleep(2000)
    }
    const counts = polls.filter((poll) => poll.status === 'running').map((poll) => poll.pagesFetched).filter(Number.isFinite)
    const progress = { polls: polls.length, maxPagesFetchedWhileRunning: counts.length === 0 ? null : Math.max(...counts), monotonic: counts.every((n, i) => i === 0 || n >= counts[i - 1]), midRunPages }
    const pages = await readAll(`/v1/crawl/${taskId}/pages`, c.pageSize ?? 100, '&debug=true')
    const errors = await readAll(`/v1/crawl/${taskId}/errors`, 100)
    return {
      response: { robots, start, startMs, progress, status, pages, errors },
      doc: { status: status.json?.status, report: status.json, items: pages.items, pageRequests: pages.calls, errors: errors.items, stepCount: pages.items.length + errors.items.length, robots, startMs, progress },
    }
  },
  // The Firecrawl crawl status: counts while it scrapes, then every data page through next.
  async 'fc-crawl'(c) {
    const start = await call('POST', '/fc/v1/crawl', { url: c.url, ...c.request })
    const id = start.json?.id
    if (!id) return { response: start, doc: start.json ?? {} }
    const polls = []
    let cancel = null
    let status
    for (let i = 0; i < 150; i++) {
      status = await call('GET', `/fc/v1/crawl/${id}?limit=1`)
      if (status.json?.status !== 'scraping') break
      polls.push({ completed: status.json.completed, total: status.json.total, next: typeof status.json.next === 'string' })
      if (cancel === null && c.cancelAfterCompleted !== undefined && status.json.completed >= c.cancelAfterCompleted) {
        cancel = await call('POST', `/v1/crawl/${id}/cancel`)
      }
      await sleep(2000)
    }
    const items = []
    const pages = []
    let path = `/fc/v1/crawl/${id}?limit=${c.pageLimit ?? 100}`
    let last = null
    for (let i = 0; i < 100 && path !== null; i++) {
      last = await call('GET', path)
      pages.push({ httpStatus: last.httpStatus, dataLength: last.json?.data?.length ?? null, next: last.json?.next ?? null })
      items.push(...(last.json?.data ?? []))
      path = typeof last.json?.next === 'string' ? `${new URL(last.json.next).pathname}${new URL(last.json.next).search}` : null
    }
    const progress = {
      polls: polls.length,
      nullTotals: polls.filter((poll) => poll.total === null).length,
      totalAboveCompleted: polls.filter((poll) => poll.total !== null && poll.total > poll.completed).length,
      totalBelowCompleted: polls.filter((poll) => poll.total !== null && poll.total < poll.completed).length,
      nextWhileScraping: polls.every((poll) => poll.next),
    }
    const errorPages = items.filter((item) => item.metadata?.error !== undefined).length
    const final = { status: last?.json?.status ?? null, completed: last?.json?.completed ?? null, total: last?.json?.total ?? null, nextOnLastPage: last !== null && last.json !== null && 'next' in last.json, dataLength: items.length, errorPages, pagesWithoutError: items.length - errorPages }
    const doc = { status: final.status, items: items.map((item) => ({ ...item, url: item.metadata?.sourceURL })), pageRequests: pages.length, progress, final, cancel: cancel?.json?.status ?? null }
    return { response: { start, polls, cancel, pages, last }, doc }
  },
  // MCP cancellation over Streamable HTTP, against a local MCP service (see the header).
  async 'mcp-cancel'(c) {
    const url = process.env[c.requiresEnv]
    const post = (body, session, signal) => fetch(url, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}) },
      body: JSON.stringify(body),
    })
    const initialize = async () => {
      const res = await post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'w2l-parity-runner', version: '1.0.0' } } })
      await res.json()
      const session = res.headers.get('mcp-session-id')
      await (await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session)).body?.cancel()
      return session
    }
    const cancel = async (session, requestId) => (await post({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId, reason: 'parity runner' } }, session)).status
    const scrape = async (session, id, target, signal) => {
      const began = Date.now()
      try {
        const body = await (await post({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'scrape', arguments: { url: target, ...c.request } } }, session, signal)).json()
        const text = body.result?.content?.[0]?.text
        const result = typeof text === 'string' ? JSON.parse(text) : null
        return { elapsedMs: Date.now() - began, status: result?.status ?? null, failureReason: result?.failureReason ?? null, error: body.error ?? null }
      } catch (error) {
        return { elapsedMs: Date.now() - began, thrown: error?.name ?? String(error) }
      }
    }
    const mine = await initialize()
    const other = await initialize()
    const sessions = { mine, other, distinct: mine !== null && other !== null && mine !== other }
    const foreignCall = scrape(mine, 1, c.url)
    await sleep(c.cancelAfterMs)
    const foreignCancel = await cancel(other, 1)
    const foreign = { ...(await foreignCall), cancelStatus: foreignCancel }
    const ownCall = scrape(mine, 2, c.url)
    await sleep(c.cancelAfterMs)
    const cancelledAt = Date.now()
    const ownCancel = await cancel(mine, 2)
    const own = { ...(await ownCall), cancelStatus: ownCancel, answeredAfterCancelMs: Date.now() - cancelledAt }
    const disconnect = new AbortController()
    const dropping = [scrape(mine, 3, c.url, disconnect.signal), scrape(mine, 4, c.url, disconnect.signal)]
    await sleep(c.cancelAfterMs)
    disconnect.abort()
    const dropped = await Promise.all(dropping)
    const probe = await scrape(mine, 5, c.probeUrl)
    const doc = { sessions, foreign, own, dropped, probe }
    return { response: { mcpUrl: url, ...doc }, doc }
  },
  // L04: follow a listing's own pagination links with a batch and count table rows,
  // for c.url and again for c.compareUrl (the same listing at another page size).
  async pagination(c) {
    const run = async (url) => {
      const seed = await call('POST', '/v1/scrape', { url, ...c.request })
      const pageUrls = [...new Set((seed.json?.links ?? []).map((link) => new URL(link, url).href).filter((link) => new RegExp(c.pageLinks).test(link)))]
      const batch = pageUrls.length === 0 ? null : await runners.batch({ urls: pageUrls, request: c.request })
      const items = batch?.doc.items ?? []
      const rows = items.reduce((sum, item) => sum + gfmTables(item.markdown ?? '').filter((table) => new RegExp(c.tableHeader).test(table.headerLine)).reduce((n, table) => n + table.rows.length, 0), 0)
      return { response: { seed, batch: batch?.response ?? null }, doc: { status: seed.json?.status, pageLinks: pageUrls.length, batchStatus: batch?.doc.status ?? null, items, rows } }
    }
    const main = await run(c.url)
    const compare = await run(c.compareUrl)
    return { response: { main: main.response, compare: compare.response }, doc: { ...main.doc, compare: compare.doc } }
  },
}

// Markdown link and image targets: [text](target) and ![alt](target).
function markdownTargets(markdown) {
  const targets = []
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(match[1])
  return targets
}
const isAbsolute = (target) => /^(https?:|mailto:|tel:|data:)/i.test(target) || target.startsWith('#')

// The proxy endpoints a saved response records in evidence.envProxy: the API's own statement of its route.
function envProxies(value, found = new Set()) {
  if (Array.isArray(value)) for (const item of value) envProxies(item, found)
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'envProxy' && typeof inner === 'string') found.add(inner)
      else envProxies(inner, found)
    }
  }
  return found
}

function get(object, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object)
}

function check(doc, spec, response) {
  const markdown = typeof doc.markdown === 'string' ? doc.markdown : ''
  switch (spec.type) {
    case 'apiStatus':
      return { pass: response.httpStatus === spec.equals, actual: response.httpStatus }
    case 'field': {
      const actual = get(doc, spec.path)
      if ('in' in spec) return { pass: spec.in.includes(actual), actual }
      if ('notIn' in spec) return { pass: !spec.notIn.includes(actual), actual }
      if ('present' in spec) return { pass: (actual !== undefined && actual !== null && actual !== '') === spec.present, actual: actual === undefined ? 'undefined' : typeof actual }
      if ('includes' in spec) return { pass: typeof actual === 'string' && actual.includes(spec.includes), actual }
      if ('equalsEnv' in spec) return { pass: actual === spec.equalsEnv.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? ''), actual }
      if ('equalsPath' in spec) return { pass: actual !== undefined && actual === get(doc, spec.equalsPath), actual: `${actual} vs ${get(doc, spec.equalsPath)}` }
      if ('abovePath' in spec) return { pass: typeof actual === 'number' && typeof get(doc, spec.abovePath) === 'number' && actual > get(doc, spec.abovePath), actual: `${actual} vs ${get(doc, spec.abovePath)}` }
      if ('min' in spec || 'max' in spec) return { pass: typeof actual === 'number' && actual >= (spec.min ?? -Infinity) && actual <= (spec.max ?? Infinity), actual }
      if (typeof spec.equals === 'object' && spec.equals !== null) return { pass: JSON.stringify(actual) === JSON.stringify(spec.equals), actual: JSON.stringify(actual) }
      return { pass: actual === spec.equals, actual }
    }
    case 'fieldType': {
      const actual = get(doc, spec.path)
      return { pass: typeof actual === spec.equals, actual: typeof actual }
    }
    case 'itemCount':
      return { pass: (doc.items ?? []).length === spec.equals, actual: (doc.items ?? []).length }
    case 'uniqueUrls': {
      const urls = (doc.items ?? []).map((item) => item.url)
      const repeated = urls.filter((url, index) => urls.indexOf(url) !== index)
      return { pass: urls.length > 0 && repeated.length === 0, actual: `${urls.length} items, ${repeated.length} repeated${repeated[0] ? `: ${repeated[0]}` : ''}` }
    }
    case 'markdownCount': {
      const count = (markdown.match(new RegExp(spec.pattern, `${(spec.flags ?? 'm').replace('g', '')}g`)) ?? []).length
      return { pass: count === spec.equals, actual: count }
    }
    case 'tableShape': {
      // Every GFM table row has as many cells as its header; tables = exact count, minTables = at least.
      const tables = gfmTables(markdown)
      const ragged = tables.flatMap((table, t) => table.rows.map((row, r) => ({ t, r, cells: row.length, header: table.header.length }))).filter((row) => row.cells !== row.header)
      const count = spec.tables === undefined ? tables.length >= (spec.minTables ?? 1) : tables.length === spec.tables
      return { pass: count && ragged.length === 0, actual: `${tables.length} tables, ${ragged.length} rows unlike their header${ragged[0] ? ` (table ${ragged[0].t + 1} row ${ragged[0].r + 1}: ${ragged[0].cells} cells, header ${ragged[0].header})` : ''}` }
    }
    case 'table': {
      // A GFM table whose header cells match spec.header (one regex per cell), with every row as
      // wide as the header and its data rows equal to spec.rows, or at least spec.minRows of them.
      const tables = gfmTables(markdown).filter((table) => table.header.length === spec.header.length && spec.header.every((pattern, i) => new RegExp(pattern).test(table.header[i])))
      const good = tables.filter((table) => table.rows.every((row) => row.length === table.header.length) && (spec.rows === undefined || JSON.stringify(table.rows) === JSON.stringify(spec.rows)) && table.rows.length >= (spec.minRows ?? 1))
      return { pass: good.length > 0, actual: `${tables.length} tables with this header${tables.length ? `, data rows ${tables.map((table) => table.rows.length).join(', ')}` : ''}` }
    }
    case 'traceEvent': {
      // An event in the array at spec.path whose dotted keys equal spec.match and whose JSON
      // contains spec.contains; show prints that key of the first such event.
      const events = get(doc, spec.path ?? 'trace')
      const hits = (Array.isArray(events) ? events : []).filter((event) => Object.entries(spec.match ?? {}).every(([key, value]) => get(event, key) === value) && (spec.contains === undefined || JSON.stringify(event).includes(spec.contains)))
      return { pass: hits.length > 0, actual: !Array.isArray(events) ? 'no trace' : hits[0] && spec.show ? JSON.stringify(get(hits[0], spec.show)).slice(0, 400) : `${hits.length} of ${events.length} events match` }
    }
    case 'fetchSpacing': {
      // Smallest gap between fetch starts (createdAt minus the ladder's total time) of all pages and
      // errors, except robots-denied steps, must reach max(minMs, robots.txt Crawl-delay when
      // robotsCrawlDelay), less 50 ms of bookkeeping jitter. Fewer than two fetches passes: pair
      // this with a count check.
      const fetched = [...(doc.items ?? []), ...(doc.errors ?? [])].filter((step) => step.failureReason !== 'policy_denied')
      const starts = fetched.map((step) => Date.parse(step.createdAt) - (step.audit?.summary?.totalMs ?? step.usage?.wallMs ?? 0)).filter(Number.isFinite).sort((a, b) => a - b)
      const gaps = starts.slice(1).map((start, i) => start - starts[i])
      const required = Math.max(spec.minMs ?? 0, spec.robotsCrawlDelay ? doc.robots?.crawlDelayMs ?? 0 : 0)
      const smallest = gaps.length === 0 ? null : Math.min(...gaps)
      return { pass: smallest === null || smallest >= required - 50, actual: `${starts.length} fetches, smallest gap ${smallest === null ? 'n/a' : `${Math.round(smallest)} ms`}, required ${required} ms${spec.robotsCrawlDelay ? `; robots.txt ${doc.robots?.error ?? `HTTP ${doc.robots?.httpStatus}, Crawl-delay ${doc.robots?.crawlDelayMs ?? 'none'}, seed ${doc.robots?.seedAllowed ? 'allowed' : 'disallowed'}`}` : ''}` }
    }
    case 'crawlDelay': {
      // The politeness W2L records on each fetched page (debug trace event crawl_delay), checked
      // against the robots.txt Crawl-delay the runner read itself: per host, consecutive recorded
      // starts are at least that far apart, and every page after a host's first names it.
      const required = doc.robots?.crawlDelayMs ?? null
      const fetched = [...(doc.items ?? []), ...(doc.errors ?? [])].filter((step) => step.failureReason !== 'policy_denied')
      const events = fetched.map((step) => (step.trace ?? []).find((event) => event.event === 'crawl_delay')?.detail)
      const byHost = new Map()
      for (const event of events.filter(Boolean)) byHost.set(event.host, [...(byHost.get(event.host) ?? []), event])
      const gaps = []
      let unnamed = 0
      for (const hostEvents of byHost.values()) {
        hostEvents.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        for (let i = 1; i < hostEvents.length; i++) {
          gaps.push(Date.parse(hostEvents[i].startedAt) - Date.parse(hostEvents[i - 1].startedAt))
          if (hostEvents[i].robotsCrawlDelayMs !== required) unnamed++
        }
      }
      const missing = events.filter((event) => event === undefined).length
      const smallest = gaps.length === 0 ? null : Math.min(...gaps)
      return { pass: required !== null && missing === 0 && unnamed === 0 && smallest !== null && smallest >= required, actual: `${events.length} fetches, ${missing} without a crawl_delay event, smallest recorded gap ${smallest === null ? 'n/a' : `${smallest} ms`}, robots.txt Crawl-delay ${required ?? 'none'}, ${unnamed} later pages not naming it` }
    }
    case 'pdfPage': {
      const collapse = (text) => text.replace(/\s+/g, ' ').trim()
      const text = spec.path === undefined ? markdown : typeof get(doc, spec.path) === 'string' ? get(doc, spec.path) : ''
      const marker = new RegExp(`^<!-- page ${spec.page} -->$`, 'm').exec(text)
      if (marker === null) return { pass: false, actual: text === '' ? 'no markdown' : `no <!-- page ${spec.page} --> marker` }
      const rest = text.slice(marker.index + marker[0].length)
      const next = /^<!-- page \d+ -->$/m.exec(rest)
      const pass = collapse(next === null ? rest : rest.slice(0, next.index)).includes(collapse(spec.text))
      return { pass, actual: pass ? undefined : collapse(text).includes(collapse(spec.text)) ? 'on another page' : 'absent' }
    }
    case 'markdownIncludes':
      return { pass: markdown.includes(spec.text), actual: markdown.length === 0 ? 'no markdown' : undefined }
    case 'markdownExcludes':
      return { pass: markdown !== '' && !markdown.includes(spec.text), actual: markdown.length === 0 ? 'no markdown' : undefined }
    case 'markdownMatches':
      return { pass: new RegExp(spec.pattern, spec.flags ?? 'm').test(markdown), actual: markdown.length === 0 ? 'no markdown' : undefined }
    case 'markdownLinksAbsolute': {
      const relative = markdownTargets(markdown).filter((target) => !isAbsolute(target))
      return { pass: markdown !== '' && relative.length === 0, actual: markdown === '' ? 'no markdown' : `${relative.length} relative, e.g. ${relative.slice(0, 3).join(' ')}` }
    }
    case 'tableTargets': {
      const targets = gfmTables(markdown).flatMap((table) => [table.header, ...table.rows]).flatMap((cells) => cells.flatMap((cell) => markdownTargets(cell)))
      const matching = targets.filter((target) => new RegExp(spec.pattern ?? '^https?://').test(target))
      return { pass: matching.length >= spec.min, actual: markdown === '' ? 'no markdown' : `${matching.length} of ${targets.length} targets in table rows match` }
    }
    case 'linksAbsolute': {
      const links = Array.isArray(doc.links) ? doc.links : null
      const relative = (links ?? []).filter((link) => !/^https?:\/\//.test(typeof link === 'string' ? link : link?.url ?? ''))
      return { pass: links !== null && links.length > 0 && relative.length === 0, actual: links === null ? 'no links field' : `${links.length} links, ${relative.length} relative` }
    }
    case 'linksInclude': {
      const links = (Array.isArray(doc.links) ? doc.links : []).map((link) => (typeof link === 'string' ? link : link?.url))
      return { pass: links.includes(spec.url), actual: `${links.length} links` }
    }
    case 'jsonIssue': {
      const issues = get(doc, spec.path ?? 'json.issues') ?? []
      const found = issues.some((issue) => JSON.stringify(issue).includes(spec.includes))
      return { pass: found, actual: JSON.stringify(issues).slice(0, 200) }
    }
    case 'eachItem': {
      const items = (get(doc, spec.path ?? 'items') ?? []).filter((item) => spec.urlPattern === undefined || new RegExp(spec.urlPattern).test(item.url ?? ''))
      const failures = items.map((item) => check(item, spec.check, response)).filter((result) => !result.pass)
      return { pass: items.length >= (spec.minItems ?? 1) && failures.length === 0, actual: `${items.length} items, ${failures.length} failing${failures[0]?.actual ? `: ${failures[0].actual}` : ''}` }
    }
    case 'itemUrls': {
      const urls = (get(doc, spec.path ?? 'items') ?? []).map((item) => item.url ?? item.canonicalUrl ?? '')
      const bad = urls.filter((url) => !new RegExp(spec.pattern).test(url))
      return { pass: urls.length >= (spec.minItems ?? 1) && bad.length === 0, actual: `${urls.length} pages, ${bad.length} outside the pattern${bad[0] ? `: ${bad[0]}` : ''}` }
    }
    case 'evidenceSchema': {
      const record = get(doc, spec.path ?? 'evidenceRecord')
      if (record === undefined) return { pass: false, actual: `no ${spec.path ?? 'evidenceRecord'}` }
      const valid = evidenceSchema(record)
      return { pass: valid, actual: valid ? `valid (${record.lane}, ${record.status})` : evidenceSchema.errors.slice(0, 3).map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ') }
    }
    case 'hostSpacing': {
      // Per host, consecutive fetch starts W2L recorded (crawl_delay trace events) are at least the
      // delay it recorded as required apart. Needs items read with debug=true.
      const events = [...(doc.items ?? []), ...(doc.errors ?? [])].map((step) => (step.trace ?? []).find((event) => event.event === 'crawl_delay')?.detail)
      const missing = events.filter((event) => event === undefined).length
      const byHost = new Map()
      for (const event of events.filter(Boolean)) byHost.set(event.host, [...(byHost.get(event.host) ?? []), event])
      let smallest = null
      let short = 0
      for (const hostEvents of byHost.values()) {
        hostEvents.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        for (let i = 1; i < hostEvents.length; i++) {
          const gap = Date.parse(hostEvents[i].startedAt) - Date.parse(hostEvents[i - 1].startedAt)
          smallest = smallest === null ? gap : Math.min(smallest, gap)
          if (gap < hostEvents[i].requiredDelayMs) short++
        }
      }
      const required = [...new Set(events.filter(Boolean).map((event) => event.requiredDelayMs))].join('/')
      return { pass: events.length > 0 && missing === 0 && short === 0 && byHost.size >= (spec.minHosts ?? 1), actual: `${events.length} fetches on ${byHost.size} hosts, ${missing} without a crawl_delay event, smallest same-host gap ${smallest ?? 'n/a'} ms, required ${required || 'n/a'} ms, ${short} gaps shorter` }
    }
    case 'countWhere': {
      const items = get(doc, spec.path ?? 'items')
      const list = Array.isArray(items) ? items : []
      const matching = list.filter((item) => {
        const value = spec.field === undefined ? item : get(item, spec.field)
        if ('includes' in spec) return Array.isArray(value) ? value.includes(spec.includes) : typeof value === 'string' && value.includes(spec.includes)
        if ('pattern' in spec) return typeof value === 'string' && new RegExp(spec.pattern).test(value)
        if ('present' in spec) return (value !== undefined && value !== null && value !== '') === spec.present
        if ('value' in spec) return value === spec.value
        return true
      })
      const n = matching.length
      return { pass: Array.isArray(items) && n >= (spec.min ?? -Infinity) && n <= (spec.max ?? Infinity) && (spec.count === undefined || n === spec.count), actual: Array.isArray(items) ? `${n} of ${list.length}` : `no array at ${spec.path ?? 'items'}` }
    }
    case 'anyOf': {
      const results = spec.checks.map((group) => group.map((inner) => check(doc, inner, response)))
      const pass = results.some((group) => group.every((result) => result.pass))
      return { pass, actual: results.map((group) => group.map((result) => (result.pass ? 'ok' : 'x')).join('')).join(' | ') }
    }
    default:
      return { pass: false, actual: `unknown check type ${spec.type}` }
  }
}

await mkdir(outDir, { recursive: true })
const startedAt = new Date().toISOString()
const results = []
for (const c of cases) {
  if (c.requiresEnv !== undefined && !process.env[c.requiresEnv]) {
    results.push({ id: c.id, url: c.url ?? c.urls?.join(' '), endpoint: c.endpoint ?? 'scrape', skipped: `${c.requiresEnv} is not set`, seconds: 0, passed: 0, total: 0, envProxies: [], checks: [] })
    console.log(`${c.id} skipped (${c.requiresEnv} is not set) ${c.url ?? c.urls?.[0]}`)
    continue
  }
  const runner = runners[c.endpoint ?? 'scrape']
  const began = Date.now()
  let outcome
  try {
    outcome = await runner(c)
  } catch (error) {
    outcome = { response: { error: String(error) }, doc: {} }
  }
  await writeFile(join(outDir, `${c.id}.json`), JSON.stringify(outcome.response, null, 2))
  const checks = c.checks.map((spec) => ({ ...spec, ...check(outcome.doc, spec, outcome.response.start ?? outcome.response) }))
  const passed = checks.filter((result) => result.pass).length
  results.push({ id: c.id, url: c.url ?? c.urls?.join(' '), endpoint: c.endpoint ?? 'scrape', seconds: Math.round((Date.now() - began) / 100) / 10, passed, total: checks.length, envProxies: [...envProxies(outcome.response)], checks })
  console.log(`${c.id} ${passed}/${checks.length} ${c.url ?? c.urls?.[0]}`)
  for (const result of checks.filter((r) => !r.pass)) console.log(`   ✗ [${/^[1-8]$/.test(result.item) ? `P1-${result.item}` : result.item}] ${result.type} ${result.text ?? result.pattern ?? result.path ?? result.url ?? ''} ${result.actual ?? ''}`)
}

const command = ['node', 'research/parity/run-sites.mjs', ...args].join(' ')
const summary = {
  manifest: manifest.id,
  command,
  api,
  otherApis: Object.fromEntries([...new Set(cases.map((c) => c.apiEnv).filter(Boolean))].map((name) => [name, process.env[name] ?? null])),
  tokenInEnvironment: Boolean(process.env.W2L_API_TOKEN),
  sourceCommit: commit,
  workingTreeDirty: dirty,
  startedAt,
  finishedAt: new Date().toISOString(),
  casesPassed: results.filter((r) => !r.skipped && r.passed === r.total).length,
  cases: results.length,
  casesSkipped: results.filter((r) => r.skipped).length,
  checksPassed: results.reduce((sum, r) => sum + r.passed, 0),
  checks: results.reduce((sum, r) => sum + r.total, 0),
  results,
}
await writeFile(join(outDir, 'results.json'), JSON.stringify(summary, null, 2))

const proxyVars = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy', 'ALL_PROXY', 'all_proxy'].filter((name) => process.env[name])
const proxiedCases = results.filter((r) => r.envProxies.length > 0).length
const proxyEndpoints = [...new Set(results.flatMap((r) => r.envProxies))]
const lines = [
  `# Real-site run ${startedAt.slice(0, 10)}`,
  '',
  `Command: \`${command}\``,
  `Source commit: \`${commit ?? 'unknown'}\`${dirty ? ' (working tree had uncommitted changes)' : ''}`,
  `Run: ${startedAt} → ${summary.finishedAt} against ${api}${Object.keys(summary.otherApis).length === 0 ? '' : `; cases naming an apiEnv against ${Object.entries(summary.otherApis).map(([name, url]) => `${name}=${url ?? '(unset)'}`).join(', ')}`}`,
  ...(cases.some((c) => c.endpoint === 'sdk') ? [`SDK: the built @w2l/sdk; W2L_API_TOKEN ${summary.tokenInEnvironment ? 'set' : 'not set'} in the runner's environment (its value is not recorded).`] : []),
  `Network: ${proxyVars.length === 0 ? 'no proxy variables set in the runner' : `${proxyVars.join(', ')} set in the runner's environment`}; ${proxiedCases} of ${results.length} cases' responses record an environment proxy in evidence.envProxy${proxyEndpoints.length === 0 ? '' : ` (${proxyEndpoints.join(', ')})`}.`,
  '',
  `Cases fully passing: ${summary.casesPassed}/${summary.cases}${summary.casesSkipped === 0 ? '' : ` (${summary.casesSkipped} skipped, not run)`}; checks passing: ${summary.checksPassed}/${summary.checks}${summary.casesSkipped === 0 ? '' : ' (skipped cases\' checks not counted)'}.`,
  '',
  '| Case | URL | Checks | Failed checks (P1 item) |',
  '| --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.id} | ${r.url} | ${r.skipped ? 'skipped' : `${r.passed}/${r.total}`} | ${r.skipped ?? (r.checks.filter((x) => !x.pass).map((x) => `${x.type}${x.text ? ` "${x.text}"` : ''}${x.path ? ` ${x.path}` : ''} (${x.item})`).join('; ') || '—')} |`),
]
const recorded = results.flatMap((r) => r.checks.filter((x) => x.record).map((x) => `- ${r.id} ${x.type}${x.path ? ` ${x.path}` : ''}: ${x.actual}`))
if (recorded.length > 0) lines.push('', 'Recorded values:', '', ...recorded)
const target = (x) => x.text ?? x.url ?? x.pattern ?? x.path ?? x.header?.join(' ')
const failed = results.flatMap((r) => r.checks.filter((x) => !x.pass).map((x) => `- ${r.id} [${x.item}] ${x.type}${target(x) ? ` \`${target(x)}\`` : ''}: ${x.actual ?? (x.type === 'markdownExcludes' ? 'present' : 'absent')}`))
if (failed.length > 0) lines.push('', 'Failed checks with the observed value:', '', ...failed)
// A variable a case requires (W2L_CONTACT) never appears in the summary by value.
let text = lines.join('\n')
for (const name of new Set(cases.map((c) => c.requiresEnv).filter(Boolean))) if (process.env[name]) text = text.replaceAll(process.env[name], `<${name}>`)
console.log(`\n${text}\n\nRaw responses: ${outDir}`)
if (recordFile) await writeFile(recordFile, `${text}\n`)
process.exitCode = summary.casesPassed === summary.cases ? 0 : 1
