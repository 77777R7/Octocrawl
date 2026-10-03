import type {
  ActiveCrawlList,
  CrawlAccepted,
  DeliveryDestination,
  DeliveryDestinationInput,
  DeliveryDetail,
  DeliveryQuery,
  DeliveryPage,
  DeliveryPageQuery,
  WebhookDelivery,
  CrawlError,
  CrawlPage,
  CrawlPageList,
  CrawlPageQuery,
  CrawlReport,
  CrawlStartRequest,
  BatchAccepted,
  BatchErrorsQuery,
  BatchErrorsResponse,
  BatchStartRequest,
  BatchStatusResponse,
  BatchHandoffRequest,
  BatchHandoffResponse,
  CompactScrapeResponse,
  FetchResult,
  MapRecord,
  MapRequest,
  MapResponse,
  MonitorRevision,
  MonitorView,
  MonitorPreview,
  MonitorRun,
  MonitorRunDetail,
  ScrapeRecord,
  ScrapeRequest,
  ScrapeResponse,
} from '@w2l/contracts'
import { DEFAULT_MAP_TIMEOUT_MS, DEFAULT_SCRAPE_TIMEOUT_MS, isApiErrorCode, RATE_LIMITED_CODE, type ApiErrorCode } from '@w2l/contracts'
import { SDK_VERSION } from './version.js'
import { JobWatcher, type WatchOptions, type WatcherClient } from './watcher.js'

export interface W2LOptions {
  baseUrl: string
  /**
   * Bearer token for a server started with a token. Omitted, the
   * W2L_API_TOKEN environment variable is used where there is one; '' sends
   * no token.
   */
  token?: string
  fetch?: typeof fetch
}

/** W2L_API_TOKEN from the process environment, when the runtime has one (a browser has none). */
function environmentToken(): string | undefined {
  try {
    const token = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['W2L_API_TOKEN']
    return token === undefined || token.length === 0 ? undefined : token
  } catch {
    return undefined
  }
}

/** How long past a scrape's own deadline (its `timeout`, 300 000 ms by default) the SDK waits for the API's answer. */
const SCRAPE_ANSWER_MARGIN_MS = 30_000

/** How long past a map's own deadline (its `timeout`, 60 000 ms by default) the SDK waits for the API's answer: Firecrawl's timeout + 5000 convention. */
export const MAP_ANSWER_MARGIN_MS = 5_000

/**
 * Node's fetch (undici) stops waiting for response headers after 300 s, and
 * the API answers a scrape at its deadline, up to 300 s. On Node this
 * dispatcher hands a request to the process's global dispatcher (so a proxy
 * or agent set there still applies) with its own wait for headers.
 * Undefined elsewhere: a browser's fetch has no such wait.
 */
function headersWait(ms: number): { dispatch(options: object, handler: unknown): boolean } | undefined {
  if ((globalThis as { process?: { versions?: { undici?: string } } }).process?.versions?.undici === undefined) return undefined
  return {
    dispatch(options, handler) {
      // Read when fetch dispatches, by which time undici has set it.
      const global = globalThis as unknown as Record<symbol, { dispatch(options: object, handler: unknown): boolean } | undefined>
      const dispatcher = global[Symbol.for('undici.globalDispatcher.2')] ?? global[Symbol.for('undici.globalDispatcher.1')]
      if (dispatcher === undefined) throw new Error('no global fetch dispatcher')
      return dispatcher.dispatch({ ...options, headersTimeout: ms }, handler)
    },
  }
}

/**
 * Cancels the HTTP request and the current execution of synchronous scrape/runMonitor.
 * Use cancelCrawl for an already-created background crawl, or cancelMonitorRun for explicit persisted run control.
 */
export interface RequestOptions {
  signal?: AbortSignal
  /**
   * The `origin` a scrape, crawl or batch is recorded under when its options
   * set none: a host built on the SDK (the MCP server) names its own client
   * here. The default is `js-sdk@<SDK_VERSION>`.
   */
  origin?: string
}

/** What the SDK records as `origin` unless the caller or the host says otherwise. */
export const SDK_ORIGIN = `js-sdk@${SDK_VERSION}`

/**
 * Polling for waitBatch and waitCrawl. A status request that fails with a
 * network error, HTTP 408, 429 or 5xx is retried: after 1, 2, 4, 8, then
 * 10 s, or after the response's Retry-After when it asks for a minute or
 * less. Any other error ends the wait at once.
 */
export interface WaitOptions extends RequestOptions {
  /** Delay between status requests. Default 500 ms. */
  pollIntervalMs?: number
  /**
   * Stop waiting after this long, a status request in flight or a retry's
   * wait included, and throw a WaitTimeoutError. Default: no limit. The task
   * keeps running.
   */
  timeoutMs?: number
  /** Consecutive failed status requests retried before the last error is thrown. Default 5; 0 retries none. */
  maxRetries?: number
}

/**
 * The task was still unfinished when the wait's timeoutMs ran out. `last` is
 * the final status read, null when no status request answered in time;
 * `cause` is the error of the last status request that failed, when no
 * status was read after it.
 */
export class WaitTimeoutError<T extends { status: string } = { status: string }> extends Error {
  override readonly name = 'WaitTimeoutError'
  constructor(readonly taskId: string, readonly last: T | null, readonly timeoutMs: number, options?: { cause?: unknown }) {
    super(last === null ? `task ${taskId} status not read within ${timeoutMs} ms` : `task ${taskId} still ${last.status} after ${timeoutMs} ms`, options)
  }
}

/** What `appendToBatch` may send beside the URLs: what binds to them, and the attribution labels; the job's own options stay as they are. */
export type AppendToBatchOptions = Pick<BatchStartRequest, 'ignoreInvalidURLs' | 'idempotencyKey' | 'robotsOverrides' | 'origin' | 'integration'>

/** How `batchScrapeChunked` splits a list and waits for each job (Python's `process_large_batch`: `chunk_size`, `poll_interval`, `timeout` are `chunkSize`, `pollIntervalMs`, `timeoutMs`). */
export interface ChunkedBatchOptions extends WaitOptions {
  /** URLs per job, 1 to 1000. Default 100. */
  chunkSize?: number
  /** Items per request while a job's items are listed, 1 to 50. Default 50. */
  itemLimit?: number
}

/** One job `batchScrapeChunked` ran: its id, how many URLs it was given, its final status and the entries it skipped. */
export interface ChunkedBatchJob {
  taskId: string
  urls: number
  report: BatchStatusResponse
  invalidURLs?: string[]
}

/** `batchScrapeChunked`'s result: the jobs in submission order, every item of every job in the order the URLs were submitted, and every entry `ignoreInvalidURLs` skipped. */
export interface ChunkedBatchResult {
  jobs: ChunkedBatchJob[]
  items: CrawlPage[]
  invalidURLs: string[]
}

/** crawlAndWait's result: the final status, every page and every error of the crawl's latest attempt. */
export interface CrawlCollected {
  taskId: string
  report: CrawlReport
  pages: CrawlPage[]
  errors: CrawlError[]
}

/** batchAndWait's result: the final status and every item, failed ones included. */
export interface BatchCollected {
  taskId: string
  report: BatchStatusResponse
  items: CrawlPage[]
}

/**
 * Caps on a listing that follows cursors (listCrawlPages, listBatchItems,
 * getCrawlDocuments, getBatchDocuments). None by default: the listing reads to
 * the end. With `maxResults` each page is requested no larger than what is
 * still wanted, so the cursor the listing stops at continues exactly where it
 * left off.
 */
export interface PaginationLimits {
  /** Pages read after the first; 0 reads the first page alone. */
  maxPages?: number
  /** Items returned in all, at least 1. */
  maxResults?: number
  /** Once this many milliseconds have passed since the first page was requested, no further page is requested. */
  maxWaitMs?: number
}

/** Why a bounded listing stopped: the last page (`end`), or the limit that stopped it with pages still unread. */
export type PaginationStop = 'end' | 'maxPages' | 'maxResults' | 'maxWait'

/** Where a bounded listing stopped: the cursor of the first page it did not read (null at the end) and what stopped it. */
export interface PaginationEnd {
  nextCursor: string | null
  stoppedBy: PaginationStop
}

/** The items a bounded listing read, with where it stopped; `hasMore` is whether a page remains. */
export interface PageCollection<T> extends PaginationEnd {
  items: T[]
  hasMore: boolean
}

/** A crawl's status with its pages, as one answer: the latest attempt's pages unless `attemptId` is given. */
export interface CrawlDocuments extends PaginationEnd {
  report: CrawlReport
  pages: CrawlPage[]
}

/** A batch's status with its items, as one answer. */
export interface BatchDocuments extends PaginationEnd {
  report: BatchStatusResponse
  items: CrawlPage[]
}

/** A page listing's query (`limit`, `attemptId`, `debug`, `includeDuplicates`) with the caps on how far it follows cursors. */
export type PagedListOptions = Omit<CrawlPageQuery, 'cursor'> & PaginationLimits

/** The largest page the API serves: crawl pages up to 1 000, batch items up to 50. */
const CRAWL_PAGE_MAX_LIMIT = 1_000
const BATCH_ITEM_MAX_LIMIT = 50
/** The most URLs one batch takes; a longer list is split by chunkUrls. */
const BATCH_MAX_URLS = 1_000

/**
 * Split a URL list into lists of at most `chunkSize` (default 100), in order;
 * an empty list gives none. Firecrawl's JS helper of the same name, exported
 * here. `batchScrapeChunked` runs one batch per chunk.
 */
export function chunkUrls(urls: readonly string[], chunkSize = 100): string[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > BATCH_MAX_URLS) throw new RangeError(`chunkSize must be an integer between 1 and ${BATCH_MAX_URLS}`)
  const chunks: string[][] = []
  for (let start = 0; start < urls.length; start += chunkSize) chunks.push(urls.slice(start, start + chunkSize))
  return chunks
}

/** A URL as the API records an item's `url`: WHATWG-normalised; as given when it does not parse. */
function hrefOf(url: string): string {
  try { return new URL(url).href } catch { return url }
}

function checkPaginationLimits(options: PaginationLimits): void {
  if (options.maxPages !== undefined && !(Number.isInteger(options.maxPages) && options.maxPages >= 0)) throw new RangeError('maxPages must be an integer, 0 or more')
  if (options.maxResults !== undefined && !(Number.isInteger(options.maxResults) && options.maxResults >= 1)) throw new RangeError('maxResults must be an integer, 1 or more')
  if (options.maxWaitMs !== undefined && !(Number.isFinite(options.maxWaitMs) && options.maxWaitMs >= 0)) throw new RangeError('maxWaitMs must be a finite number of milliseconds, 0 or more')
}

/**
 * The API answered with an error status. `code` is the API error code when the
 * body carried one (`rate_limited` for HTTP 429); `body` is the parsed JSON
 * body, or its text if it was not JSON. The SDK retries no 429 itself: a
 * caller waits `retryAfterMs` and asks again.
 */
export class W2LError extends Error {
  override readonly name = 'W2LError'
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode | typeof RATE_LIMITED_CODE | undefined,
    readonly method: 'GET' | 'POST',
    readonly path: string,
    readonly body: unknown,
    /** The response's Retry-After in milliseconds; null when it sent none or one that does not parse. */
    readonly retryAfterMs: number | null = null,
    /** The body's `agentHints` (the next honest step for a refused option, the wait for a rate limit); empty when it carried none. */
    readonly agentHints: readonly string[] = [],
  ) {
    super(message)
  }
}

/** Reads a failed response; the message defaults to `<METHOD> <path> failed: <status> <body>`. */
async function responseError(method: 'GET' | 'POST', path: string, res: Response, message?: string): Promise<W2LError> {
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch {}
  const fields = body !== null && typeof body === 'object' ? (body as { code?: unknown; agentHints?: unknown }) : {}
  const code = isApiErrorCode(fields.code) || fields.code === RATE_LIMITED_CODE ? fields.code : undefined
  const agentHints = Array.isArray(fields.agentHints) ? fields.agentHints.filter((hint): hint is string => typeof hint === 'string') : []
  return new W2LError(message ?? `${method} ${path} failed: ${res.status} ${text}`, res.status, code, method, path, body, retryAfterMs(res.headers.get('retry-after')), agentHints)
}

/** Retry-After as delay-seconds or an HTTP-date, in milliseconds from now. */
function retryAfterMs(value: string | null): number | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const at = /^[+-]?[\d.]+$/.test(trimmed) ? Number.NaN : Date.parse(trimmed)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

/** The longest Retry-After a wait follows; a longer one ends the wait with its error. */
const MAX_RETRY_AFTER_MS = 60_000

/**
 * How long to wait before retrying a failed status request, or null when the
 * error is not transient: a network error (fetch's TypeError), or HTTP 408,
 * 429 or 5xx, after 1, 2, 4, 8, then 10 s or the server's Retry-After.
 */
function retryDelayMs(error: unknown, failures: number): number | null {
  if (error instanceof W2LError) {
    if (error.status !== 408 && error.status !== 429 && error.status < 500) return null
    if (error.retryAfterMs !== null) return error.retryAfterMs <= MAX_RETRY_AFTER_MS ? error.retryAfterMs : null
  } else if (!(error instanceof TypeError)) return null
  return Math.min(10_000, 1_000 * 2 ** (failures - 1))
}

function checkWaitOptions(options: WaitOptions): void {
  for (const name of ['pollIntervalMs', 'timeoutMs'] as const) {
    const value = options[name]
    if (value !== undefined && !(Number.isFinite(value) && value >= 0)) throw new RangeError(`${name} must be a finite number of milliseconds, 0 or more`)
  }
  if (options.maxRetries !== undefined && !(Number.isInteger(options.maxRetries) && options.maxRetries >= 0)) throw new RangeError('maxRetries must be an integer, 0 or more')
}

const FINISHED = ['completed', 'failed', 'cancelled']

export type CreateMonitorRequest = (Omit<MonitorRevision, 'createdAt'> & {enabled?:boolean}) | {preset:'firecrawl-introduction';enabled?:boolean}
export type ReviseMonitorRequest = Omit<MonitorRevision, 'monitorId' | 'createdAt'>
export interface RunMonitorRequest {
  /** Reusing a key replays the same logical run within this monitor. */
  triggerKey?: string
}

export class W2L {
  private readonly baseUrl: string
  private readonly token: string | undefined
  private readonly fetchImpl: typeof fetch
  /** The platform's fetch, not one passed in options, whose own limits are the caller's. */
  private readonly platformFetch: boolean

  constructor(options: W2LOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.token = options.token ?? environmentToken()
    this.fetchImpl = options.fetch ?? fetch
    this.platformFetch = options.fetch === undefined
  }

  async scrape(url: string, opts: Omit<ScrapeRequest, 'url'> & { debug: false }, request?: RequestOptions): Promise<CompactScrapeResponse>
  async scrape(url: string, opts?: Omit<ScrapeRequest, 'url'>, request?: RequestOptions): Promise<ScrapeResponse>
  async scrape(url: string, opts: Omit<ScrapeRequest, 'url'> = {}, request: RequestOptions = {}): Promise<ScrapeResponse | CompactScrapeResponse> {
    // The API answers by the scrape's deadline (a timeout it does not accept, at once with HTTP 400):
    // wait that long plus a margin, and no longer.
    const deadlineMs = Number.isInteger(opts.timeout) ? Math.min(Math.max(opts.timeout!, 0), DEFAULT_SCRAPE_TIMEOUT_MS) : DEFAULT_SCRAPE_TIMEOUT_MS
    return this.post<ScrapeResponse | CompactScrapeResponse>('/v1/scrape', { ...opts, url, origin: originOf(opts, request) }, 200, request, deadlineMs + SCRAPE_ANSWER_MARGIN_MS)
  }

  /** The record of one scrape call, by the `scrapeId` its response carried (`metadata.scrapeId`); a W2LError with code `not_found` for an id the server has no record of. */
  async getScrape(id: string, request: RequestOptions = {}): Promise<ScrapeRecord> {
    return this.get<ScrapeRecord>(`/v1/scrapes/${encodeURIComponent(id)}`, request, `scrape not found: ${id}`)
  }

  /**
   * The URLs of a site from its sitemaps and its start page's links, without
   * fetching each page (POST /v1/map). The API answers by the map's deadline
   * with what it found; the SDK waits that long plus MAP_ANSWER_MARGIN_MS.
   */
  async map(url: string, opts: Omit<MapRequest, 'url'> = {}, request: RequestOptions = {}): Promise<MapResponse> {
    const deadlineMs = Number.isInteger(opts.timeout) ? Math.max(opts.timeout!, 0) : DEFAULT_MAP_TIMEOUT_MS
    return this.post<MapResponse>('/v1/map', { ...opts, url, origin: originOf(opts, request) }, 200, request, deadlineMs + MAP_ANSWER_MARGIN_MS)
  }

  /** The record of one map, by the `id` its response carried; a W2LError with code `not_found` for an id the server has no record of. */
  async getMap(id: string, request: RequestOptions = {}): Promise<MapRecord> {
    return this.get<MapRecord>(`/v1/maps/${encodeURIComponent(id)}`, request, `map not found: ${id}`)
  }

  async crawl(url: string, opts: Omit<CrawlStartRequest, 'url'> = {}, request: RequestOptions = {}): Promise<CrawlAccepted> {
    return this.post<CrawlAccepted>('/v1/crawl', { ...opts, url, origin: originOf(opts, request) }, 202, request)
  }

  /**
   * Starts a batch: `{ taskId }`, plus `invalidURLs` (the entries skipped)
   * when `ignoreInvalidURLs` was on; with `idempotencyKey` a retried start
   * returns the first one's answer with `replayed: true`; with `appendToId`
   * the URLs join that batch (see appendToBatch) and the answer carries
   * `requested` and `appended`.
   */
  async batchScrape(urls: readonly string[], opts: Omit<BatchStartRequest, 'urls'> = {}, request: RequestOptions = {}): Promise<BatchAccepted> {
    return this.post<BatchAccepted>('/v1/batches', { ...opts, urls, origin: originOf(opts, request) }, 202, request)
  }

  /**
   * Adds URLs to an existing batch (`appendToId`): the job keeps its mode,
   * formats, includeLinks, maxConcurrency and page options, and its run picks
   * the URLs up (a completed batch runs again for them). The answer carries
   * `requested`, the job's URLs now, and `appended`. A cancelled or failed
   * batch, a total over 1000 or a URL already in the batch is a W2LError.
   */
  async appendToBatch(id: string, urls: readonly string[], opts: AppendToBatchOptions = {}, request: RequestOptions = {}): Promise<BatchAccepted> {
    return this.batchScrape(urls, { ...opts, appendToId: id }, request)
  }

  /**
   * Runs a list of any length as batches of `chunkSize` URLs (default 100),
   * one after another: each job is started, waited for (as waitBatch, with
   * the WaitOptions) and listed before the next starts. The items are merged
   * in the order the URLs were submitted; the jobs stay on the server as
   * ordinary batches, each with its own task directory. A caller's
   * `idempotencyKey` becomes `<key>:<chunkIndex>` per job, so a retry of the
   * whole call replays the jobs that went through. A WaitTimeoutError or
   * W2LError from any job ends the call, naming that job; the earlier jobs
   * are complete and the later chunks were never sent.
   */
  async batchScrapeChunked(urls: readonly string[], opts: Omit<BatchStartRequest, 'urls' | 'appendToId'> = {}, options: ChunkedBatchOptions = {}): Promise<ChunkedBatchResult> {
    if ((opts as { appendToId?: unknown }).appendToId !== undefined) throw new TypeError('batchScrapeChunked cannot append; use appendToBatch')
    const { chunkSize = 100, itemLimit = BATCH_ITEM_MAX_LIMIT, ...wait } = options
    checkWaitOptions(wait)
    if (!Number.isInteger(itemLimit) || itemLimit < 1 || itemLimit > BATCH_ITEM_MAX_LIMIT) throw new RangeError(`itemLimit must be an integer between 1 and ${BATCH_ITEM_MAX_LIMIT}`)
    const chunks = chunkUrls(urls, chunkSize)
    const jobs: ChunkedBatchJob[] = []
    const items: CrawlPage[] = []
    const invalidURLs: string[] = []
    for (const [index, chunk] of chunks.entries()) {
      const accepted = await this.batchScrape(chunk, { ...opts, ...(opts.idempotencyKey === undefined ? {} : { idempotencyKey: `${opts.idempotencyKey}:${index}` }) }, wait)
      const report = await this.waitBatch(accepted.taskId, wait)
      // The server lists items as they were recorded; the submission order is restored from the chunk (an item whose URL is not found keeps its place after the rest).
      const order = new Map(chunk.map((url, position) => [hrefOf(url), position]))
      const listed: CrawlPage[] = []
      for await (const item of this.listBatchItems(accepted.taskId, { limit: itemLimit }, wait)) listed.push(item)
      items.push(...listed.sort((a, b) => (order.get(a.url) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.url) ?? Number.MAX_SAFE_INTEGER)))
      jobs.push({ taskId: accepted.taskId, urls: chunk.length, report, ...(accepted.invalidURLs === undefined ? {} : { invalidURLs: accepted.invalidURLs }) })
      if (accepted.invalidURLs !== undefined) invalidURLs.push(...accepted.invalidURLs)
    }
    return { jobs, items, invalidURLs }
  }

  async getBatch(id: string, request: RequestOptions = {}): Promise<BatchStatusResponse> {
    return this.get<BatchStatusResponse>(`/v1/batches/${encodeURIComponent(id)}`, request, `batch not found: ${id}`)
  }

  /** The batch's failed, blocked, cancelled and budget-cut items across every attempt, in pages of up to 1000 (`limit`, `cursor`), with `robotsBlocked`, the URLs robots.txt refused. */
  async getBatchErrors(id: string, options: BatchErrorsQuery = {}, request: RequestOptions = {}): Promise<BatchErrorsResponse> {
    const params = new URLSearchParams()
    if (options.cursor !== undefined) params.set('cursor', options.cursor)
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    const suffix = params.size === 0 ? '' : `?${params.toString()}`
    return this.get<BatchErrorsResponse>(`/v1/batches/${encodeURIComponent(id)}/errors${suffix}`, request, `batch not found: ${id}`)
  }

  async getBatchItems(id: string, options: CrawlPageQuery = {}, request: RequestOptions = {}): Promise<CrawlPageList<CrawlPage>> {
    return this.getPageList<CrawlPage>(`/v1/batches/${encodeURIComponent(id)}/items`, options, request)
  }

  /** Every item of a batch, page by page (at most 50 per request), or as many as the PaginationLimits allow; the generator's return value says where it stopped. */
  listBatchItems(id: string, options: PagedListOptions = {}, request: RequestOptions = {}): AsyncGenerator<CrawlPage, PaginationEnd> {
    return this.paginate((query) => this.getBatchItems(id, query, request), options, request, BATCH_ITEM_MAX_LIMIT, 'batch items')
  }

  /** The items listBatchItems would yield under the same options, collected, with where the listing stopped. */
  async collectBatchItems(id: string, options: PagedListOptions = {}, request: RequestOptions = {}): Promise<PageCollection<CrawlPage>> {
    return collect(this.listBatchItems(id, options, request))
  }

  /** A batch's status and its items in one answer, every item unless the PaginationLimits stop the listing. */
  async getBatchDocuments(id: string, options: PagedListOptions = {}, request: RequestOptions = {}): Promise<BatchDocuments> {
    const report = await this.getBatch(id, request)
    const { items, nextCursor, stoppedBy } = await this.collectBatchItems(id, options, request)
    return { report, items, nextCursor, stoppedBy }
  }

  /** Polls a batch until it completes, fails or is cancelled. Items come from listBatchItems. */
  async waitBatch(id: string, options: WaitOptions = {}): Promise<BatchStatusResponse> {
    return this.waitFor(id, (request) => this.getBatch(id, request), options)
  }

  /** Starts a batch, waits for it (as waitBatch) and lists every item, failed ones included. */
  async batchAndWait(urls: readonly string[], opts: Omit<BatchStartRequest, 'urls'> = {}, wait: WaitOptions = {}): Promise<BatchCollected> {
    checkWaitOptions(wait)
    const { taskId } = await this.batchScrape(urls, opts, wait)
    const report = await this.waitBatch(taskId, wait)
    const items: CrawlPage[] = []
    for await (const item of this.listBatchItems(taskId, { limit: 50 }, wait)) items.push(item)
    return { taskId, report, items }
  }

  /**
   * Hands a finished batch's items that a check stopped (a captcha, a
   * challenge, a login wall) to the person in their own Chrome, on a local
   * server: each opens in a new tab, they get through it, and W2L reads the
   * page there. Answers when every item is read or given up, so it waits for
   * the person: `waitMs` is how long, per page (default 10 minutes). On
   * Node the SDK waits for the answer as long as that takes (no 300 s limit
   * on the response headers); `request.signal` ends the wait.
   */
  async handOffBatch(id: string, body: BatchHandoffRequest = {}, request: RequestOptions = {}): Promise<BatchHandoffResponse> {
    // undici reads a headers timeout of 0 as none: the answer comes when the person is done with every page.
    return this.post<BatchHandoffResponse>(`/v1/batches/${encodeURIComponent(id)}/handoff`, body, 200, request, 0)
  }

  async cancelBatch(id: string, request: RequestOptions = {}): Promise<BatchStatusResponse> {
    return this.post<BatchStatusResponse>(`/v1/batches/${encodeURIComponent(id)}/cancel`, undefined, 200, request)
  }

  /**
   * Watches a crawl (`kind: 'crawl'`, the default) or a batch (`kind: 'batch'`)
   * as it runs: `document` events with each page as it is recorded, `snapshot`
   * events with the report, one `done` with the terminal report, or `error`.
   * `transport: 'auto'` (default) tries the WebSocket route, then server-sent
   * events, then polling (`pollIntervalMs`, default 2000, at least 250), each
   * taking over from the last document seen; `timeoutMs` ends the watch with a
   * `watcher_timeout` error while the job keeps running. `close()` stops
   * watching only; cancelCrawl / cancelBatch stay explicit.
   */
  watcher(jobId: string, options: WatchOptions = {}): JobWatcher {
    return new JobWatcher(this.watcherClient(), jobId, options)
  }

  /** Starts a crawl and returns its watcher (as `crawl()` then `watcher(taskId, { kind: 'crawl' })`). */
  async crawlAndWatch(url: string, opts: Omit<CrawlStartRequest, 'url'> = {}, watch: Omit<WatchOptions, 'kind'> = {}, request: RequestOptions = {}): Promise<JobWatcher> {
    const { taskId } = await this.crawl(url, opts, request)
    return this.watcher(taskId, { ...watch, kind: 'crawl' })
  }

  /** Starts a batch and returns its watcher (as `batchScrape()` then `watcher(taskId, { kind: 'batch' })`). */
  async batchScrapeAndWatch(urls: readonly string[], opts: Omit<BatchStartRequest, 'urls'> = {}, watch: Omit<WatchOptions, 'kind'> = {}, request: RequestOptions = {}): Promise<JobWatcher> {
    const { taskId } = await this.batchScrape(urls, opts, request)
    return this.watcher(taskId, { ...watch, kind: 'batch' })
  }

  /** What a watcher needs of this client: the server, the token and fetch it was given, and the routes it polls, each carrying the bearer header. */
  private watcherClient(): WatcherClient {
    return {
      baseUrl: this.baseUrl,
      token: this.token,
      fetch: this.fetchImpl,
      headers: (extra) => this.headers(extra),
      getCrawl: (id, request) => this.getCrawl(id, request),
      getBatch: (id, request) => this.getBatch(id, request),
      getCrawlPages: (id, options, request) => this.getCrawlPages(id, options, request),
      getCrawlErrors: (id, options, request) => this.getCrawlErrors(id, options, request),
      getBatchItems: (id, options, request) => this.getBatchItems(id, options, request),
    }
  }

  async getCrawl(id: string, request: RequestOptions = {}): Promise<CrawlReport> {
    return this.get<CrawlReport>(`/v1/crawl/${encodeURIComponent(id)}`, request, `crawl not found: ${id}`)
  }

  /** The crawls the API process is running, with each one's start URL, status, pages so far and options; empty when nothing runs. */
  async getActiveCrawls(request: RequestOptions = {}): Promise<ActiveCrawlList> {
    return this.get<ActiveCrawlList>('/v1/crawl/active', request)
  }

  /** Polls a crawl until it completes, fails or is cancelled. Pages come from listCrawlPages. */
  async waitCrawl(id: string, options: WaitOptions = {}): Promise<CrawlReport> {
    return this.waitFor(id, (request) => this.getCrawl(id, request), options)
  }

  /** Starts a crawl, waits for it (as waitCrawl) and lists every page and every error of its latest attempt. */
  async crawlAndWait(url: string, opts: Omit<CrawlStartRequest, 'url'> = {}, wait: WaitOptions = {}): Promise<CrawlCollected> {
    checkWaitOptions(wait)
    const { taskId } = await this.crawl(url, opts, wait)
    const report = await this.waitCrawl(taskId, wait)
    const pages: CrawlPage[] = []
    for await (const page of this.listCrawlPages(taskId, { limit: 100 }, wait)) pages.push(page)
    const errors: CrawlError[] = []
    let cursor: string | undefined
    do {
      const page = await this.getCrawlErrors(taskId, { limit: 100, cursor }, wait)
      errors.push(...page.items)
      cursor = page.hasMore ? page.nextCursor ?? undefined : undefined
      if (page.hasMore && cursor === undefined) throw new Error('crawl errors response omitted nextCursor')
    } while (cursor !== undefined)
    return { taskId, report, pages, errors }
  }

  async getCrawlPages(id: string, options: CrawlPageQuery = {}, request: RequestOptions = {}): Promise<CrawlPageList<CrawlPage>> {
    return this.getPageList<CrawlPage>(`/v1/crawl/${encodeURIComponent(id)}/pages`, options, request)
  }

  /**
   * A crawl's pages, page by page, or as many as the PaginationLimits allow;
   * the generator's return value says where it stopped. The latest attempt's
   * pages unless `attemptId` names another; a resume with `useCached` records
   * the pages it reuses in its new attempt, so that attempt normally holds
   * every page.
   */
  listCrawlPages(id: string, options: PagedListOptions = {}, request: RequestOptions = {}): AsyncGenerator<CrawlPage, PaginationEnd> {
    return this.paginate((query) => this.getCrawlPages(id, query, request), options, request, CRAWL_PAGE_MAX_LIMIT, 'crawl pages')
  }

  /** The pages listCrawlPages would yield under the same options, collected, with where the listing stopped. */
  async collectCrawlPages(id: string, options: PagedListOptions = {}, request: RequestOptions = {}): Promise<PageCollection<CrawlPage>> {
    return collect(this.listCrawlPages(id, options, request))
  }

  /** A crawl's status and its pages in one answer, every page unless the PaginationLimits stop the listing. */
  async getCrawlDocuments(id: string, options: PagedListOptions = {}, request: RequestOptions = {}): Promise<CrawlDocuments> {
    const report = await this.getCrawl(id, request)
    const { items, nextCursor, stoppedBy } = await this.collectCrawlPages(id, options, request)
    return { report, pages: items, nextCursor, stoppedBy }
  }

  /**
   * Follow a listing's cursors within its limits. Each page is requested no
   * larger than the items still wanted, so a stop at `maxResults` leaves a
   * cursor that continues exactly after the last item returned. A page's
   * `hasMore` without a cursor is the API breaking its contract and throws.
   */
  private async *paginate<T>(fetchPage: (query: CrawlPageQuery) => Promise<CrawlPageList<T>>, options: PagedListOptions, request: RequestOptions, maxLimit: number, what: string): AsyncGenerator<T, PaginationEnd> {
    checkPaginationLimits(options)
    const { maxPages, maxResults, maxWaitMs, ...query } = options
    const startedAt = Date.now()
    let cursor: string | undefined
    let pagesAfterFirst = 0
    let returned = 0
    for (;;) {
      const remaining = maxResults === undefined ? undefined : maxResults - returned
      const limit = remaining === undefined ? query.limit : Math.min(remaining, query.limit ?? maxLimit)
      const page = await fetchPage({ ...query, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }) })
      for (const item of page.items) {
        if (remaining !== undefined && returned >= maxResults!) break
        request.signal?.throwIfAborted()
        returned++
        yield item
      }
      const next = page.hasMore ? page.nextCursor ?? undefined : undefined
      if (page.hasMore && next === undefined) throw new Error(`${what} response omitted nextCursor`)
      if (next === undefined) return { nextCursor: null, stoppedBy: 'end' }
      if (maxResults !== undefined && returned >= maxResults) return { nextCursor: next, stoppedBy: 'maxResults' }
      if (maxPages !== undefined && pagesAfterFirst >= maxPages) return { nextCursor: next, stoppedBy: 'maxPages' }
      if (maxWaitMs !== undefined && Date.now() - startedAt >= maxWaitMs) return { nextCursor: next, stoppedBy: 'maxWait' }
      cursor = next
      pagesAfterFirst++
    }
  }

  async getCrawlErrors(id: string, options: CrawlPageQuery = {}, request: RequestOptions = {}): Promise<CrawlPageList<CrawlError>> {
    return this.getPageList<CrawlError>(`/v1/crawl/${encodeURIComponent(id)}/errors`, options, request)
  }

  async cancelCrawl(id: string, request: RequestOptions = {}): Promise<CrawlReport> {
    return this.post<CrawlReport>(`/v1/crawl/${encodeURIComponent(id)}/cancel`, undefined, 200, request)
  }

  /** Restarts a paused or failed crawl with the options it was started with; follow it with waitCrawl. */
  async resumeCrawl(id: string, request: RequestOptions = {}): Promise<CrawlAccepted> {
    return this.post<CrawlAccepted>(`/v1/crawl/${encodeURIComponent(id)}/resume`, undefined, 202, request)
  }

  async createMonitor(input: CreateMonitorRequest, request: RequestOptions = {}): Promise<MonitorRevision> {
    return this.post<MonitorRevision>('/v1/monitors', input, 201, request)
  }

  async previewMonitor(input: CreateMonitorRequest, request: RequestOptions = {}): Promise<MonitorPreview> {
    return this.post<MonitorPreview>('/v1/monitors/preview',input,200,request)
  }

  async reviseMonitor(id: string, input: ReviseMonitorRequest, request: RequestOptions = {}): Promise<MonitorRevision> {
    return this.post<MonitorRevision>(`/v1/monitors/${encodeURIComponent(id)}/revisions`, input, 201, request)
  }

  async listMonitors(request: RequestOptions = {}): Promise<MonitorView[]> {
    return this.get<MonitorView[]>('/v1/monitors', request)
  }

  async getMonitor(id: string, request: RequestOptions = {}): Promise<MonitorView> {
    return this.get<MonitorView>(`/v1/monitors/${encodeURIComponent(id)}`, request)
  }

  async getMonitorRun(id: string, runId: string, request: RequestOptions = {}): Promise<MonitorRunDetail> {
    return this.get<MonitorRunDetail>(`/v1/monitors/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`,request)
  }

  /** Durable run: returns after enqueue; client disconnect does not cancel it. */
  async enqueueMonitorRun(id: string, input: RunMonitorRequest = {}, request: RequestOptions = {}): Promise<MonitorRun> {
    return this.post<MonitorRun>(`/v1/monitors/${encodeURIComponent(id)}/runs`,input,202,request)
  }

  /** Waits for capture and assessment; baseline/events are included in the returned view. */
  async runMonitor(id: string, input: RunMonitorRequest = {}, request: RequestOptions = {}): Promise<MonitorView> {
    return this.post<MonitorView>(`/v1/monitors/${encodeURIComponent(id)}/run`, input, 200, request)
  }

  async pauseMonitor(id: string, request: RequestOptions = {}): Promise<MonitorView> {
    return this.post<MonitorView>(`/v1/monitors/${encodeURIComponent(id)}/pause`, undefined, 200, request)
  }

  async resumeMonitor(id: string, request: RequestOptions = {}): Promise<MonitorView> {
    return this.post<MonitorView>(`/v1/monitors/${encodeURIComponent(id)}/resume`, undefined, 200, request)
  }

  async cancelMonitorRun(id: string, runId: string, request: RequestOptions = {}): Promise<MonitorView> {
    return this.post<MonitorView>(`/v1/monitors/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/cancel`, undefined, 200, request)
  }

  async createDeliveryDestination(input: DeliveryDestinationInput, request: RequestOptions = {}): Promise<DeliveryDestination> {
    return this.post<DeliveryDestination>('/v1/delivery/destinations', input, 201, request)
  }

  /** The destinations of a Monitor (`monitorId`) or of a crawl or batch (`jobId`); every destination when neither is given. Header names only, never their values. */
  async listDeliveryDestinations(options: { monitorId?: string; jobId?: string } = {}, request: RequestOptions = {}): Promise<DeliveryDestination[]> {
    const params = new URLSearchParams()
    if (options.monitorId !== undefined) params.set('monitorId', options.monitorId)
    if (options.jobId !== undefined) params.set('jobId', options.jobId)
    return this.get<DeliveryDestination[]>(`/v1/delivery/destinations${params.size === 0 ? '' : `?${params}`}`, request)
  }

  async pauseDeliveryDestination(id: string, request: RequestOptions = {}): Promise<DeliveryDestination> {
    return this.post<DeliveryDestination>(`/v1/delivery/destinations/${encodeURIComponent(id)}/pause`, undefined, 200, request)
  }

  async resumeDeliveryDestination(id: string, request: RequestOptions = {}): Promise<DeliveryDestination> {
    return this.post<DeliveryDestination>(`/v1/delivery/destinations/${encodeURIComponent(id)}/resume`, undefined, 200, request)
  }

  /** The deliveries of a Monitor (`monitorId`) or of a crawl or batch (`jobId`, the task id), each with its payload. */
  async listDeliveries(options: DeliveryQuery = {}, request: RequestOptions = {}): Promise<WebhookDelivery[]> {
    const params = new URLSearchParams()
    if (options.monitorId !== undefined) params.set('monitorId', options.monitorId)
    if (options.jobId !== undefined) params.set('jobId', options.jobId)
    if (options.destinationId !== undefined) params.set('destinationId', options.destinationId)
    if (options.state !== undefined) params.set('state', options.state)
    return this.get<WebhookDelivery[]>(`/v1/deliveries${params.size === 0 ? '' : `?${params}`}`, request)
  }

  async getDeliveriesPage(options: DeliveryPageQuery = {}, request: RequestOptions = {}): Promise<DeliveryPage> {
    const params = new URLSearchParams()
    if (options.monitorId !== undefined) params.set('monitorId',options.monitorId)
    if (options.jobId !== undefined) params.set('jobId',options.jobId)
    if (options.destinationId !== undefined) params.set('destinationId',options.destinationId)
    if (options.state !== undefined) params.set('state',options.state)
    if (options.cursor !== undefined) params.set('cursor',options.cursor)
    if (options.limit !== undefined) params.set('limit',String(options.limit))
    return this.get<DeliveryPage>(`/v1/deliveries/page${params.size ? `?${params}` : ''}`,request)
  }

  async getDelivery(id: string, request: RequestOptions = {}): Promise<DeliveryDetail> {
    return this.get<DeliveryDetail>(`/v1/deliveries/${encodeURIComponent(id)}`, request)
  }

  async retryDelivery(id: string, request: RequestOptions = {}): Promise<WebhookDelivery> {
    return this.post<WebhookDelivery>(`/v1/deliveries/${encodeURIComponent(id)}/retry`, undefined, 200, request)
  }

  private async waitFor<T extends { status: string }>(id: string, poll: (request: RequestOptions) => Promise<T>, options: WaitOptions): Promise<T> {
    checkWaitOptions(options)
    const deadline = options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs
    // The timeout also ends a status request in flight (re-armed past setTimeout's 24.8-day limit).
    const expiry = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = (): void => {
      timer = setTimeout(() => { if (Date.now() >= deadline!) expiry.abort(new DOMException('wait timed out', 'TimeoutError')); else arm() }, Math.min(Math.max(0, deadline! - Date.now()), 2_147_483_647))
    }
    if (deadline !== undefined) arm()
    const signal = options.signal === undefined ? expiry.signal : AbortSignal.any([options.signal, expiry.signal])
    let last: T | null = null
    let failure: unknown = undefined
    let failures = 0
    const timedOut = () => new WaitTimeoutError(id, last, options.timeoutMs!, failure === undefined ? undefined : { cause: failure })
    try {
      for (;;) {
        options.signal?.throwIfAborted()
        let pause = options.pollIntervalMs ?? 500
        try {
          const report = await poll({ signal })
          if (FINISHED.includes(report.status)) return report
          last = report
          failure = undefined
          failures = 0
        } catch (error) {
          options.signal?.throwIfAborted()
          if (expiry.signal.aborted) throw timedOut()
          const delay = failures < (options.maxRetries ?? 5) ? retryDelayMs(error, failures + 1) : null
          if (delay === null) throw error
          failure = error
          failures++
          pause = delay
        }
        if (deadline !== undefined && Date.now() >= deadline) throw timedOut()
        try { await sleep(Math.min(pause, deadline === undefined ? Infinity : deadline - Date.now()), signal) }
        catch (error) { options.signal?.throwIfAborted(); if (expiry.signal.aborted) throw timedOut(); throw error }
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.token === undefined || this.token.length === 0
      ? extra
      : { ...extra, authorization: `Bearer ${this.token}` }
  }

  /** `answerWithinMs`: how long the platform's fetch waits for the response headers, on Node instead of undici's 300 s. */
  private async post<T>(path: string, body: unknown, ok = 200, request: RequestOptions = {}, answerWithinMs?: number): Promise<T> {
    const dispatcher = answerWithinMs === undefined || !this.platformFetch ? undefined : headersWait(answerWithinMs)
    const init: RequestInit & { dispatcher?: unknown } = {
      method: 'POST',
      signal: request.signal,
      headers: this.headers({ 'content-type': 'application/json' }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(dispatcher === undefined ? {} : { dispatcher }),
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init)
    if (res.status !== ok) throw await responseError('POST', path, res)
    return (await res.json()) as T
  }

  private async getPageList<T>(path: string, options: CrawlPageQuery, request: RequestOptions): Promise<CrawlPageList<T>> {
    const params = new URLSearchParams()
    if (options.cursor !== undefined) params.set('cursor', options.cursor)
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    if (options.attemptId !== undefined) params.set('attemptId', options.attemptId)
    if (options.debug !== undefined) params.set('debug', String(options.debug))
    if (options.includeDuplicates !== undefined) params.set('includeDuplicates', String(options.includeDuplicates))
    const suffix = params.size === 0 ? '' : `?${params.toString()}`
    return this.get<CrawlPageList<T>>(`${path}${suffix}`, request, `crawl not found: ${path}`)
  }

  private async get<T>(path: string, request: RequestOptions, notFound?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { headers: this.headers(), signal: request.signal })
    if (res.status === 404 && notFound !== undefined) throw await responseError('GET', path, res, notFound)
    if (!res.ok) throw await responseError('GET', path, res)
    return (await res.json()) as T
  }
}

/** Drain a bounded listing into its items and where it stopped. */
async function collect<T>(listing: AsyncGenerator<T, PaginationEnd>): Promise<PageCollection<T>> {
  const items: T[] = []
  for (;;) {
    const next = await listing.next()
    if (next.done) return { items, nextCursor: next.value.nextCursor, hasMore: next.value.nextCursor !== null, stoppedBy: next.value.stoppedBy }
    items.push(next.value)
  }
}

/** The `origin` a request is recorded under: the caller's, else the host's (RequestOptions), else the SDK's own. */
function originOf(opts: { origin?: string }, request: RequestOptions): string {
  return opts.origin ?? request.origin ?? SDK_ORIGIN
}

/** Resolves after ms, or rejects with the signal's reason when it aborts first. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, Math.max(0, ms))
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
  })
}
