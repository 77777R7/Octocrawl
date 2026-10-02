import type {
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
  BatchStartRequest,
  BatchStatusResponse,
  CompactScrapeResponse,
  FetchResult,
  MonitorRevision,
  MonitorView,
  MonitorPreview,
  MonitorRun,
  MonitorRunDetail,
  ScrapeRecord,
  ScrapeRequest,
  ScrapeResponse,
} from '@w2l/contracts'
import { DEFAULT_SCRAPE_TIMEOUT_MS, isApiErrorCode, RATE_LIMITED_CODE, type ApiErrorCode } from '@w2l/contracts'
import { SDK_VERSION } from './version.js'

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

  async crawl(url: string, opts: Omit<CrawlStartRequest, 'url'> = {}, request: RequestOptions = {}): Promise<CrawlAccepted> {
    return this.post<CrawlAccepted>('/v1/crawl', { ...opts, url, origin: originOf(opts, request) }, 202, request)
  }

  async batchScrape(urls: readonly string[], opts: Omit<BatchStartRequest, 'urls'> = {}, request: RequestOptions = {}): Promise<CrawlAccepted> {
    return this.post<CrawlAccepted>('/v1/batches', { ...opts, urls, origin: originOf(opts, request) }, 202, request)
  }

  async getBatch(id: string, request: RequestOptions = {}): Promise<BatchStatusResponse> {
    return this.get<BatchStatusResponse>(`/v1/batches/${encodeURIComponent(id)}`, request, `batch not found: ${id}`)
  }

  async getBatchItems(id: string, options: CrawlPageQuery = {}, request: RequestOptions = {}): Promise<CrawlPageList<CrawlPage>> {
    return this.getPageList<CrawlPage>(`/v1/batches/${encodeURIComponent(id)}/items`, options, request)
  }

  async *listBatchItems(id: string, options: Omit<CrawlPageQuery, 'cursor'> = {}, request: RequestOptions = {}): AsyncGenerator<CrawlPage> {
    let cursor: string | undefined
    do {
      const page = await this.getBatchItems(id, { ...options, cursor }, request)
      for (const item of page.items) { request.signal?.throwIfAborted(); yield item }
      cursor = page.hasMore ? page.nextCursor ?? undefined : undefined
      if (page.hasMore && cursor === undefined) throw new Error('batch items response omitted nextCursor')
    } while (cursor !== undefined)
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

  async cancelBatch(id: string, request: RequestOptions = {}): Promise<BatchStatusResponse> {
    return this.post<BatchStatusResponse>(`/v1/batches/${encodeURIComponent(id)}/cancel`, undefined, 200, request)
  }

  async getCrawl(id: string, request: RequestOptions = {}): Promise<CrawlReport> {
    return this.get<CrawlReport>(`/v1/crawl/${encodeURIComponent(id)}`, request, `crawl not found: ${id}`)
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

  async *listCrawlPages(id: string, options: Omit<CrawlPageQuery, 'cursor'> = {}, request: RequestOptions = {}): AsyncGenerator<CrawlPage> {
    let cursor: string | undefined
    do {
      const page = await this.getCrawlPages(id, { ...options, cursor }, request)
      for (const item of page.items) {
        request.signal?.throwIfAborted()
        yield item
      }
      cursor = page.hasMore ? page.nextCursor ?? undefined : undefined
      if (page.hasMore && cursor === undefined) throw new Error('crawl pages response omitted nextCursor')
    } while (cursor !== undefined)
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

  async listDeliveryDestinations(options: { monitorId?: string } = {}, request: RequestOptions = {}): Promise<DeliveryDestination[]> {
    const query = options.monitorId === undefined ? '' : `?${new URLSearchParams({ monitorId: options.monitorId })}`
    return this.get<DeliveryDestination[]>(`/v1/delivery/destinations${query}`, request)
  }

  async pauseDeliveryDestination(id: string, request: RequestOptions = {}): Promise<DeliveryDestination> {
    return this.post<DeliveryDestination>(`/v1/delivery/destinations/${encodeURIComponent(id)}/pause`, undefined, 200, request)
  }

  async resumeDeliveryDestination(id: string, request: RequestOptions = {}): Promise<DeliveryDestination> {
    return this.post<DeliveryDestination>(`/v1/delivery/destinations/${encodeURIComponent(id)}/resume`, undefined, 200, request)
  }

  async listDeliveries(options: DeliveryQuery = {}, request: RequestOptions = {}): Promise<WebhookDelivery[]> {
    const params = new URLSearchParams()
    if (options.monitorId !== undefined) params.set('monitorId', options.monitorId)
    if (options.destinationId !== undefined) params.set('destinationId', options.destinationId)
    if (options.state !== undefined) params.set('state', options.state)
    return this.get<WebhookDelivery[]>(`/v1/deliveries${params.size === 0 ? '' : `?${params}`}`, request)
  }

  async getDeliveriesPage(options: DeliveryPageQuery = {}, request: RequestOptions = {}): Promise<DeliveryPage> {
    const params = new URLSearchParams()
    if (options.monitorId !== undefined) params.set('monitorId',options.monitorId)
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
