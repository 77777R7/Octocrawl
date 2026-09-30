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
  CrawlResumeRequest,
  ScrapeResponse,
} from '@w2l/contracts'

export interface W2LOptions {
  baseUrl: string
  /** Bearer token; when omitted, `W2L_API_TOKEN` from the process environment is used. */
  token?: string
  fetch?: typeof fetch
}

/**
 * Cancels the HTTP request and the current execution of synchronous scrape/runMonitor.
 * Use cancelCrawl for an already-created background crawl, or cancelMonitorRun for explicit persisted run control.
 */
export interface RequestOptions {
  signal?: AbortSignal
}

/** How a waiter polls a background job. */
export interface WaitOptions extends RequestOptions {
  /** Time between status reads; default 500 ms. */
  pollIntervalMs?: number
  /** Give up after this long with a JobTimeoutError; unbounded when omitted. */
  timeoutMs?: number
}

/** A response the API refused: the status, the body as sent and the machine code when the body carried one. */
export class W2LError extends Error {
  override readonly name = 'W2LError'
  constructor(
    readonly method: 'GET' | 'POST',
    readonly path: string,
    readonly status: number,
    readonly body: string,
    readonly code: string | null,
    message = `${method} ${path} failed: ${status} ${body}`,
  ) {
    super(message)
  }
}

/** A waiter gave up: the job is still running, its id says which one to check on. */
export class JobTimeoutError extends Error {
  override readonly name = 'JobTimeoutError'
  constructor(readonly jobId: string, readonly timeoutMs: number, readonly lastStatus: string | null) {
    super(`job ${jobId} did not finish within ${timeoutMs} ms (last status: ${lastStatus ?? 'unknown'})`)
  }
}

// A paused job is one the service resumes after a restart, so a waiter keeps
// waiting through it; only a bounded wait (timeoutMs) ends earlier.
const TERMINAL_JOB_STATUS: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled'])

function errorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { code?: unknown }
    return typeof parsed.code === 'string' ? parsed.code : null
  } catch {
    return null
  }
}

function tokenFromEnv(): string | undefined {
  const env = typeof process === 'undefined' ? undefined : process.env
  const value = env?.W2L_API_TOKEN
  return value === undefined || value.length === 0 ? undefined : value
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    const abort = () => { clearTimeout(timer); reject(signal?.reason) }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

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
    this.token = options.token ?? tokenFromEnv()
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

  async waitBatch(id: string, options: WaitOptions = {}): Promise<BatchStatusResponse> {
    return this.waitForJob(id, (request) => this.getBatch(id, request), options)
  }

  /** Poll a crawl until it is completed, failed or cancelled. */
  async waitCrawl(id: string, options: WaitOptions = {}): Promise<CrawlReport> {
    return this.waitForJob(id, (request) => this.getCrawl(id, request), options)
  }

  private async waitForJob<T extends { status: string }>(id: string, read: (request: RequestOptions) => Promise<T>, options: WaitOptions): Promise<T> {
    const pollIntervalMs = options.pollIntervalMs ?? 500
    const startedAt = Date.now()
    let consecutiveFailures = 0
    let lastStatus: string | null = null
    for (;;) {
      options.signal?.throwIfAborted()
      let report: T | null = null
      try {
        report = await read({ signal: options.signal })
        consecutiveFailures = 0
      } catch (error) {
        // A refused request is final; a server error or a dropped connection
        // while polling is retried a few times before it is reported.
        if (options.signal?.aborted || (error instanceof W2LError && error.status < 500)) throw error
        if (++consecutiveFailures >= 3) throw error
      }
      if (report !== null) {
        lastStatus = report.status
        if (TERMINAL_JOB_STATUS.has(report.status)) return report
      }
      if (options.timeoutMs !== undefined && Date.now() - startedAt + pollIntervalMs > options.timeoutMs) {
        throw new JobTimeoutError(id, options.timeoutMs, lastStatus)
      }
      await sleep(pollIntervalMs, options.signal)
    }
  }

  async cancelBatch(id: string, request: RequestOptions = {}): Promise<BatchStatusResponse> {
    return this.post<BatchStatusResponse>(`/v1/batches/${encodeURIComponent(id)}/cancel`, undefined, 200, request)
  }

  async getCrawl(id: string, request: RequestOptions = {}): Promise<CrawlReport> {
    return this.get<CrawlReport>(`/v1/crawl/${encodeURIComponent(id)}`, request, `crawl not found: ${id}`)
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

  /** Continue a paused, interrupted or failed crawl from its checkpoint. */
  async resumeCrawl(id: string, opts: CrawlResumeRequest = {}, request: RequestOptions = {}): Promise<CrawlAccepted> {
    return this.post<CrawlAccepted>(`/v1/crawl/${encodeURIComponent(id)}/resume`, opts, 202, request)
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
    if (res.status !== ok) {
      const text = await res.text()
      throw new W2LError('POST', path, res.status, text, errorCode(text))
    }
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
    if (res.status === 404 && notFound !== undefined) throw new W2LError('GET', path, 404, await res.text(), 'not_found', notFound)
    if (!res.ok) {
      const text = await res.text()
      throw new W2LError('GET', path, res.status, text, errorCode(text))
    }
    return (await res.json()) as T
  }
}
