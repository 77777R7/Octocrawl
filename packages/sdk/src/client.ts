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
  ScrapeRequest,
  ScrapeResponse,
} from '@w2l/contracts'
import { isApiErrorCode, type ApiErrorCode } from '@w2l/contracts'

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

/**
 * Cancels the HTTP request and the current execution of synchronous scrape/runMonitor.
 * Use cancelCrawl for an already-created background crawl, or cancelMonitorRun for explicit persisted run control.
 */
export interface RequestOptions {
  signal?: AbortSignal
}

/** Polling for waitBatch and waitCrawl. */
export interface WaitOptions extends RequestOptions {
  /** Delay between status requests. Default 500 ms. */
  pollIntervalMs?: number
  /** Stop waiting after this long and throw a WaitTimeoutError. Default: no limit. The task keeps running. */
  timeoutMs?: number
}

/** The task was still unfinished when the wait's timeoutMs ran out; `last` is the final status read. */
export class WaitTimeoutError<T extends { status: string } = { status: string }> extends Error {
  override readonly name = 'WaitTimeoutError'
  constructor(readonly taskId: string, readonly last: T, readonly timeoutMs: number) {
    super(`task ${taskId} still ${last.status} after ${timeoutMs} ms`)
  }
}

/**
 * The API answered with an error status. `code` is the API error code when the
 * body carried one; `body` is the parsed JSON body, or its text if it was not JSON.
 */
export class W2LError extends Error {
  override readonly name = 'W2LError'
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode | undefined,
    readonly method: 'GET' | 'POST',
    readonly path: string,
    readonly body: unknown,
  ) {
    super(message)
  }
}

/** Reads a failed response; the message defaults to `<METHOD> <path> failed: <status> <body>`. */
async function responseError(method: 'GET' | 'POST', path: string, res: Response, message?: string): Promise<W2LError> {
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch {}
  const code = body !== null && typeof body === 'object' && isApiErrorCode((body as { code?: unknown }).code) ? (body as { code: ApiErrorCode }).code : undefined
  return new W2LError(message ?? `${method} ${path} failed: ${res.status} ${text}`, res.status, code, method, path, body)
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

  constructor(options: W2LOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.token = options.token ?? environmentToken()
    this.fetchImpl = options.fetch ?? fetch
  }

  async scrape(url: string, opts: Omit<ScrapeRequest, 'url'> & { debug: false }, request?: RequestOptions): Promise<CompactScrapeResponse>
  async scrape(url: string, opts?: Omit<ScrapeRequest, 'url'>, request?: RequestOptions): Promise<ScrapeResponse>
  async scrape(url: string, opts: Omit<ScrapeRequest, 'url'> = {}, request: RequestOptions = {}): Promise<ScrapeResponse | CompactScrapeResponse> {
    return this.post<ScrapeResponse | CompactScrapeResponse>('/v1/scrape', { ...opts, url }, 200, request)
  }

  async crawl(url: string, opts: Omit<CrawlStartRequest, 'url'> = {}, request: RequestOptions = {}): Promise<CrawlAccepted> {
    return this.post<CrawlAccepted>('/v1/crawl', { ...opts, url }, 202, request)
  }

  async batchScrape(urls: readonly string[], opts: Omit<BatchStartRequest, 'urls'> = {}, request: RequestOptions = {}): Promise<CrawlAccepted> {
    return this.post<CrawlAccepted>('/v1/batches', { ...opts, urls }, 202, request)
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

  /** Polls a batch until it completes, fails or is cancelled. */
  async waitBatch(id: string, options: WaitOptions = {}): Promise<BatchStatusResponse> {
    return this.waitFor(id, () => this.getBatch(id, options), options)
  }

  async cancelBatch(id: string, request: RequestOptions = {}): Promise<BatchStatusResponse> {
    return this.post<BatchStatusResponse>(`/v1/batches/${encodeURIComponent(id)}/cancel`, undefined, 200, request)
  }

  async getCrawl(id: string, request: RequestOptions = {}): Promise<CrawlReport> {
    return this.get<CrawlReport>(`/v1/crawl/${encodeURIComponent(id)}`, request, `crawl not found: ${id}`)
  }

  /** Polls a crawl until it completes, fails or is cancelled. Pages come from listCrawlPages. */
  async waitCrawl(id: string, options: WaitOptions = {}): Promise<CrawlReport> {
    return this.waitFor(id, () => this.getCrawl(id, options), options)
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

  private async waitFor<T extends { status: string }>(id: string, poll: () => Promise<T>, options: WaitOptions): Promise<T> {
    const deadline = options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs
    for (;;) {
      options.signal?.throwIfAborted()
      const report = await poll()
      if (FINISHED.includes(report.status)) return report
      if (deadline !== undefined && Date.now() >= deadline) throw new WaitTimeoutError(id, report, options.timeoutMs!)
      const pause = Math.min(options.pollIntervalMs ?? 500, deadline === undefined ? Infinity : deadline - Date.now())
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve() }, Math.max(0, pause))
        const abort = () => { clearTimeout(timer); reject(options.signal?.reason) }
        options.signal?.addEventListener('abort', abort, { once: true })
      })
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.token === undefined || this.token.length === 0
      ? extra
      : { ...extra, authorization: `Bearer ${this.token}` }
  }

  private async post<T>(path: string, body: unknown, ok = 200, request: RequestOptions = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      signal: request.signal,
      headers: this.headers({ 'content-type': 'application/json' }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (res.status !== ok) throw await responseError('POST', path, res)
    return (await res.json()) as T
  }

  private async getPageList<T>(path: string, options: CrawlPageQuery, request: RequestOptions): Promise<CrawlPageList<T>> {
    const params = new URLSearchParams()
    if (options.cursor !== undefined) params.set('cursor', options.cursor)
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    if (options.attemptId !== undefined) params.set('attemptId', options.attemptId)
    if (options.debug !== undefined) params.set('debug', String(options.debug))
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
