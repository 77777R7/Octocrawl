/**
 * The job watcher: a crawl's or batch's pages as they are recorded, from the
 * API's stream routes (WebSocket, then server-sent events) or, where neither
 * answers, from the status and listing routes polled. Every transport
 * delivers the same compact pages the items routes list; a document is
 * emitted once per step id whatever route, reconnection or transport switch
 * it arrived by. Purely client-side: the server records nothing about a
 * watcher, and `close()` stops watching without touching the job.
 */

import {
  WS_TOKEN_PROTOCOL_PREFIX,
  type BatchStatusResponse,
  type CrawlError,
  type CrawlPage,
  type CrawlPageList,
  type CrawlPageQuery,
  type CrawlReport,
  type JobStreamFrame,
  type JobStreamReport,
  type TaskStatus,
} from '@w2l/contracts'

export type WatchKind = 'crawl' | 'batch'
export type WatchTransport = 'websocket' | 'sse' | 'poll'

/** What the watcher reports as `error`: the API's code where it has one (`not_found`, `unauthorized`), else the watcher's own (`watcher_timeout`, `transport_unavailable`, `poll_failed`). */
export interface WatcherError {
  code: string
  message: string
}

/** The events a watcher dispatches (CustomEvent `detail`) and yields from its async iterator. */
export type WatcherEvent =
  | { type: 'document'; data: CrawlPage }
  | { type: 'snapshot'; data: JobStreamReport }
  | { type: 'done'; data: JobStreamReport }
  | { type: 'error'; error: WatcherError }

/** The part of a WebSocket the watcher uses; the platform's WebSocket satisfies it. */
export interface WatcherWebSocket {
  readonly readyState: number
  readonly protocol: string
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: { data?: unknown; code?: number; reason?: string }) => void): void
}
export type WatcherWebSocketConstructor = new (url: string, protocols?: string | string[]) => WatcherWebSocket

export interface WatchOptions {
  /** Which kind of job the id names. Default `crawl`. */
  kind?: WatchKind
  /**
   * `auto` (default) tries a WebSocket, then the server-sent events route, then
   * polling, switching once per level when a transport is unavailable or ends
   * before `done`; one of the three forces it (an error event when it cannot run).
   */
  transport?: 'auto' | WatchTransport
  /** Delay between polls on the poll transport, at least 250. Default 2000. */
  pollIntervalMs?: number
  /** After this long without `done`, an `error` of code `watcher_timeout` ends the watch; the job keeps running. Default: no limit. */
  timeoutMs?: number
  /** The step cursor (a document's `cursor` / SSE `id`) to resume after: documents up to it are not delivered again. */
  after?: string
  /** Aborting it closes the watcher, with no event. */
  signal?: AbortSignal
  /** The WebSocket constructor to use; omitted takes the platform's (Node 22+, browsers); `null` tries no WebSocket. */
  WebSocket?: WatcherWebSocketConstructor | null
}

/** What the watcher needs from the SDK client: the server, its token and fetch, and the status and listing routes it polls. */
export interface WatcherClient {
  readonly baseUrl: string
  readonly token: string | undefined
  readonly fetch: typeof fetch
  headers(extra?: Record<string, string>): Record<string, string>
  getCrawl(id: string, request?: { signal?: AbortSignal }): Promise<CrawlReport>
  getBatch(id: string, request?: { signal?: AbortSignal }): Promise<BatchStatusResponse>
  getCrawlPages(id: string, options?: CrawlPageQuery, request?: { signal?: AbortSignal }): Promise<CrawlPageList<CrawlPage>>
  getCrawlErrors(id: string, options?: CrawlPageQuery, request?: { signal?: AbortSignal }): Promise<CrawlPageList<CrawlError>>
  getBatchItems(id: string, options?: CrawlPageQuery, request?: { signal?: AbortSignal }): Promise<CrawlPageList<CrawlPage>>
}

export const DEFAULT_WATCH_POLL_INTERVAL_MS = 2_000
export const MIN_WATCH_POLL_INTERVAL_MS = 250
/** Consecutive failed poll rounds before the watcher gives up with `poll_failed`. */
const POLL_FAILURE_LIMIT = 5
const FINISHED: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled'])
const STREAM_FRAMES: ReadonlySet<string> = new Set(['catchup', 'document', 'snapshot', 'done', 'error'])

/** How one transport attempt ended: the job finished, an error ended the watch, the watcher was closed, or the next transport should take over from the last cursor. */
type Outcome = 'done' | 'fatal' | 'closed' | 'fallback'

/**
 * A page's step cursor as the API issues it (the `(createdAt, id)` position
 * the listing routes take): what polling continues from after the last
 * page of a listing, which carries no `nextCursor`.
 */
export function pageCursor(page: Pick<CrawlPage, 'createdAt' | 'id'>): string {
  const json = JSON.stringify({ createdAt: page.createdAt, id: page.id })
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** One server-sent event block as a stream frame; null for a comment, an event W2L does not send or data that is not JSON. */
export function parseSseBlock(block: string): JobStreamFrame | null {
  let event: string | undefined
  let id: string | undefined
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    else if (field === 'id') id = value
  }
  if (event === undefined || data.length === 0) return null
  return frameOf(event, data.join('\n'), id)
}

/** A stream frame from its wire parts: the event name, its JSON text and, for a document, its cursor. */
function frameOf(type: string, json: string, cursor: string | undefined): JobStreamFrame | null {
  if (!STREAM_FRAMES.has(type)) return null
  let payload: unknown
  try { payload = JSON.parse(json) } catch { return null }
  if (payload === null || typeof payload !== 'object') return null
  if (type === 'error') return { type, error: payload as WatcherError }
  if (type === 'document') return cursor === undefined ? null : { type, data: payload as CrawlPage, cursor }
  return { type: type as 'catchup' | 'snapshot' | 'done', data: payload as JobStreamReport }
}

/** A WebSocket message as a stream frame; null for anything but a JSON text frame of the known shape. */
function parseSocketFrame(data: unknown): JobStreamFrame | null {
  const text = typeof data === 'string' ? data : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : null
  if (text === null) return null
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return null }
  if (parsed === null || typeof parsed !== 'object') return null
  const frame = parsed as { type?: unknown; data?: unknown; error?: unknown; cursor?: unknown }
  if (typeof frame.type !== 'string' || !STREAM_FRAMES.has(frame.type)) return null
  if (frame.type === 'error') return frame.error !== null && typeof frame.error === 'object' ? { type: 'error', error: frame.error as WatcherError } : null
  if (frame.data === null || typeof frame.data !== 'object') return null
  if (frame.type === 'document') return typeof frame.cursor === 'string' ? { type: 'document', data: frame.data as CrawlPage, cursor: frame.cursor } : null
  return { type: frame.type as 'catchup' | 'snapshot' | 'done', data: frame.data as JobStreamReport }
}

/** The HTTP status an SDK request error carries (W2LError.status), or null for any other error. */
function statusOf(error: unknown): number | null {
  return error !== null && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null
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

/**
 * Watches one job. Events: `document` (CustomEvent<CrawlPage>), `snapshot`
 * (CustomEvent<CrawlReport | BatchStatusResponse>, the report as the stream
 * opens and after each page), `done` (the terminal report) and `error`
 * (CustomEvent<WatcherError>); `for await (const event of watcher)` yields
 * the same events from the start. `data` accumulates every document, each
 * once; `status` is the last status seen; `transport` the one in use.
 */
export class JobWatcher extends EventTarget {
  readonly jobId: string
  readonly kind: WatchKind
  /** Every document delivered so far, each step once, in arrival order. */
  readonly data: CrawlPage[] = []
  /** The job's status as last reported; null before the first report. */
  status: TaskStatus | null = null
  /** The transport delivering events; null before one is open and after the watch ends. */
  transport: WatchTransport | null = null
  private readonly client: WatcherClient
  private readonly transportOption: 'auto' | WatchTransport
  private readonly pollIntervalMs: number
  private readonly socketConstructor: WatcherWebSocketConstructor | undefined
  private readonly controller = new AbortController()
  private readonly seen = new Set<string>()
  private readonly log: WatcherEvent[] = []
  private readonly waiters: Array<() => void> = []
  /** The cursor of the last document delivered: where the next transport, or a poll, continues from. */
  private cursor: string | undefined
  private lastSnapshot = ''
  private finished = false
  private closed = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(client: WatcherClient, jobId: string, options: WatchOptions = {}) {
    super()
    if (typeof jobId !== 'string' || jobId.length === 0) throw new TypeError('jobId must be a non-empty string')
    const kind = options.kind ?? 'crawl'
    if (kind !== 'crawl' && kind !== 'batch') throw new TypeError("kind must be 'crawl' or 'batch'")
    const transport = options.transport ?? 'auto'
    if (!['auto', 'websocket', 'sse', 'poll'].includes(transport)) throw new TypeError("transport must be 'auto', 'websocket', 'sse' or 'poll'")
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_WATCH_POLL_INTERVAL_MS
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < MIN_WATCH_POLL_INTERVAL_MS) throw new TypeError(`pollIntervalMs must be at least ${MIN_WATCH_POLL_INTERVAL_MS}`)
    if (options.timeoutMs !== undefined && !(Number.isFinite(options.timeoutMs) && options.timeoutMs >= 0)) throw new TypeError('timeoutMs must be a finite number of milliseconds, 0 or more')
    if (options.after !== undefined && (typeof options.after !== 'string' || options.after.length === 0)) throw new TypeError('after must be a non-empty cursor')
    this.client = client
    this.jobId = jobId
    this.kind = kind
    this.transportOption = transport
    this.pollIntervalMs = pollIntervalMs
    this.socketConstructor = options.WebSocket === null ? undefined : options.WebSocket ?? (globalThis as { WebSocket?: WatcherWebSocketConstructor }).WebSocket
    this.cursor = options.after
    if (options.signal !== undefined) {
      if (options.signal.aborted) this.close()
      else options.signal.addEventListener('abort', () => this.close(), { once: true })
    }
    if (options.timeoutMs !== undefined) {
      const timeoutMs = options.timeoutMs
      this.timer = setTimeout(() => this.fail({ code: 'watcher_timeout', message: `job ${jobId} did not finish within ${timeoutMs} ms (last status: ${this.status ?? 'unknown'})` }), timeoutMs)
    }
    void this.run()
  }

  /** Stops watching: no further event, the job untouched. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.stop()
  }

  /** The events from the start, then as they arrive, until done, error or close. */
  [Symbol.asyncIterator](): AsyncIterator<WatcherEvent> {
    let index = 0
    return {
      next: async (): Promise<IteratorResult<WatcherEvent>> => {
        for (;;) {
          if (index < this.log.length) return { value: this.log[index++]!, done: false }
          if (this.finished || this.closed) return { value: undefined, done: true }
          await new Promise<void>((resolve) => this.waiters.push(resolve))
        }
      },
      return: async (): Promise<IteratorResult<WatcherEvent>> => ({ value: undefined, done: true }),
    }
  }

  private get stopped(): boolean {
    return this.finished || this.closed
  }

  private async run(): Promise<void> {
    const order: WatchTransport[] = this.transportOption === 'auto' ? ['websocket', 'sse', 'poll'] : [this.transportOption]
    for (const transport of order) {
      if (this.stopped) return
      const outcome = transport === 'websocket' ? await this.watchSocket() : transport === 'sse' ? await this.watchEvents() : await this.poll()
      if (outcome !== 'fallback') return
    }
    this.transport = null
    if (!this.stopped) this.fail({ code: 'transport_unavailable', message: `no transport could watch ${this.kind} ${this.jobId} (tried ${order.join(', ')})` })
  }

  /** The stream route of this job, with the cursor to resume after when one is known. */
  private streamUrl(suffix: 'events' | 'ws'): string {
    const url = new URL(`${this.client.baseUrl}/v1/${this.kind === 'crawl' ? 'crawl' : 'batches'}/${encodeURIComponent(this.jobId)}/${suffix}`)
    if (this.cursor !== undefined) url.searchParams.set('after', this.cursor)
    if (suffix === 'ws') url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.href
  }

  /** The WebSocket route; the token, when there is one, as the `w2l.token.<token>` subprotocol, since the WebSocket API sets no header. */
  private watchSocket(): Promise<Outcome> {
    const Socket = this.socketConstructor
    if (Socket === undefined) return Promise.resolve('fallback')
    let socket: WatcherWebSocket
    // A constructor that refuses the URL or the token's characters as a subprotocol leaves the SSE route, which carries the header.
    try { socket = new Socket(this.streamUrl('ws'), this.client.token === undefined || this.client.token.length === 0 ? undefined : [`${WS_TOKEN_PROTOCOL_PREFIX}${this.client.token}`]) }
    catch { return Promise.resolve('fallback') }
    return new Promise<Outcome>((resolve) => {
      let settled = false
      const settle = (outcome: Outcome): void => {
        if (settled) return
        settled = true
        this.controller.signal.removeEventListener('abort', onAbort)
        resolve(outcome)
      }
      const onAbort = (): void => { try { socket.close(1000, 'closed') } catch {} ; settle('closed') }
      this.controller.signal.addEventListener('abort', onAbort, { once: true })
      let opened = false
      socket.addEventListener('open', () => { opened = true; if (!this.stopped) this.transport = 'websocket' })
      socket.addEventListener('message', (event) => {
        const frame = parseSocketFrame(event.data)
        if (frame !== null) this.handle(frame)
        if (this.stopped) { try { socket.close(1000, 'done') } catch {} ; settle(this.finished ? 'done' : 'closed') }
      })
      socket.addEventListener('close', (event) => {
        if (this.finished) { settle('done'); return }
        if (this.closed) { settle('closed'); return }
        // The server's own verdicts: no such job, a cursor it did not issue. Anything else (a failed handshake, a dropped socket) is the next transport's turn.
        if (event.code === 4404) { this.fail({ code: 'not_found', message: `${this.kind} ${this.jobId} not found` }); settle('fatal'); return }
        if (event.code === 4400) { this.fail({ code: 'invalid_request', message: event.reason ?? 'cursor is not one this API issued' }); settle('fatal'); return }
        settle('fallback')
      })
      // A failed handshake is the next transport's turn. Node 22's WebSocket reports a refused handshake with an error
      // and no close event, so an error before open settles here; after open, the close event that follows decides.
      socket.addEventListener('error', () => { if (opened) return; try { socket.close() } catch {} ; settle(this.closed ? 'closed' : 'fallback') })
    })
  }

  /** The server-sent events route: 404 leaves it to polling, 401/403 ends the watch, a stream that ends before done hands over from the last cursor. */
  private async watchEvents(): Promise<Outcome> {
    const url = this.streamUrl('events')
    let res: Response
    try { res = await this.client.fetch(url, { headers: this.client.headers({ accept: 'text/event-stream' }), signal: this.controller.signal }) }
    catch { return this.stopped ? 'closed' : 'fallback' }
    if (res.status === 404) return 'fallback'
    if (res.status === 401 || res.status === 403) { this.fail({ code: 'unauthorized', message: `GET ${new URL(url).pathname} answered ${res.status}` }); return 'fatal' }
    if (!res.ok || res.body === null) return 'fallback'
    if (this.stopped) return 'closed'
    this.transport = 'sse'
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const dispatch = (block: string): void => {
      const frame = parseSseBlock(block)
      if (frame !== null) this.handle(frame)
    }
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        for (let boundary = buffer.search(/\r?\n\r?\n/); boundary !== -1; boundary = buffer.search(/\r?\n\r?\n/)) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
          dispatch(block)
          if (this.stopped) { try { await reader.cancel() } catch {} ; return this.finished ? 'done' : 'closed' }
        }
      }
      if (buffer.trim().length > 0) dispatch(buffer)
    } catch {
      if (this.stopped) return this.finished ? 'done' : 'closed'
    }
    if (this.finished) return 'done'
    return this.closed ? 'closed' : 'fallback'
  }

  /** The status and listing routes every pollIntervalMs: the documents since the last cursor, a snapshot, and done once the status is terminal and the last pages are read. */
  private async poll(): Promise<Outcome> {
    this.transport = 'poll'
    const signal = this.controller.signal
    const cursors: Record<'pages' | 'errors' | 'items', string | undefined> = { pages: this.cursor, errors: this.cursor, items: this.cursor }
    const drain = async (key: keyof typeof cursors, list: (cursor: string | undefined) => Promise<CrawlPageList<CrawlPage>>): Promise<void> => {
      for (;;) {
        const page = await list(cursors[key])
        for (const item of page.items) this.document(item, pageCursor(item))
        const last = page.items[page.items.length - 1]
        cursors[key] = page.nextCursor ?? (last === undefined ? cursors[key] : pageCursor(last))
        if (!page.hasMore) return
      }
    }
    let failures = 0
    for (;;) {
      if (this.stopped) return 'closed'
      try {
        const report = this.kind === 'crawl' ? await this.client.getCrawl(this.jobId, { signal }) : await this.client.getBatch(this.jobId, { signal })
        if (this.kind === 'batch') {
          await drain('items', (cursor) => this.client.getBatchItems(this.jobId, { limit: 50, ...(cursor === undefined ? {} : { cursor }) }, { signal }))
        } else {
          await drain('pages', (cursor) => this.client.getCrawlPages(this.jobId, { limit: 100, includeDuplicates: true, ...(cursor === undefined ? {} : { cursor }) }, { signal }))
          await drain('errors', (cursor) => this.client.getCrawlErrors(this.jobId, { limit: 100, ...(cursor === undefined ? {} : { cursor }) }, { signal }))
        }
        if (this.stopped) return 'closed'
        if (FINISHED.has(report.status)) { this.done(report); return 'done' }
        this.snapshot(report)
        failures = 0
      } catch (error) {
        if (this.stopped) return 'closed'
        const status = statusOf(error)
        if (status === 404) { this.fail({ code: 'not_found', message: `${this.kind} ${this.jobId} not found` }); return 'fatal' }
        if (status === 401 || status === 403) { this.fail({ code: 'unauthorized', message: `polling ${this.kind} ${this.jobId} answered ${status}` }); return 'fatal' }
        if (++failures >= POLL_FAILURE_LIMIT) { this.fail({ code: 'poll_failed', message: `polling ${this.kind} ${this.jobId} failed ${failures} times in a row: ${error instanceof Error ? error.message : String(error)}` }); return 'fatal' }
      }
      try { await sleep(this.pollIntervalMs, signal) } catch { return 'closed' }
    }
  }

  private handle(frame: JobStreamFrame): void {
    if (this.stopped) return
    if (frame.type === 'document') this.document(frame.data, frame.cursor)
    else if (frame.type === 'done') this.done(frame.data)
    else if (frame.type === 'error') this.fail(frame.error)
    else this.snapshot(frame.data)
  }

  private document(page: CrawlPage, cursor: string): void {
    if (this.stopped || this.seen.has(page.id)) return
    this.seen.add(page.id)
    this.data.push(page)
    this.cursor = cursor
    this.emit({ type: 'document', data: page })
  }

  private snapshot(report: JobStreamReport): void {
    if (this.stopped) return
    this.status = report.status
    const encoded = JSON.stringify(report)
    if (encoded === this.lastSnapshot) return
    this.lastSnapshot = encoded
    this.emit({ type: 'snapshot', data: report })
  }

  private done(report: JobStreamReport): void {
    if (this.stopped) return
    this.status = report.status
    this.finished = true
    this.emit({ type: 'done', data: report })
    this.stop()
  }

  private fail(error: WatcherError): void {
    if (this.stopped) return
    this.finished = true
    this.emit({ type: 'error', error })
    this.stop()
  }

  private emit(event: WatcherEvent): void {
    this.log.push(event)
    this.dispatchEvent(new CustomEvent(event.type, { detail: event.type === 'error' ? event.error : event.data }))
    this.wake()
  }

  private stop(): void {
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined }
    this.transport = this.finished ? this.transport : null
    this.controller.abort()
    this.wake()
  }

  private wake(): void {
    const waiting = this.waiters.splice(0)
    for (const resume of waiting) resume()
  }
}
