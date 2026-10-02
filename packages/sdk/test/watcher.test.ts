import { describe, expect, it } from 'vitest'
import type { CrawlPage, JobStreamFrame } from '@w2l/contracts'
import { JobWatcher, pageCursor, parseSseBlock, W2L, type WatcherEvent, type WatcherWebSocket } from '../src/index.js'

const BASE = 'http://127.0.0.1:8787'

/** A compact page as the items routes list it, as far as the watcher reads it. */
function page(id: string, url = `https://example.com/${id}`): CrawlPage {
  return { id, url, canonicalUrl: url, depth: 0, status: 'success', lane: 'http', markdown: `# ${id}`, failureReason: null, blockReason: null, budgetExceeded: null, evidence: null, evidenceRecord: null, trace: [], cached: false, contentHash: null, createdAt: `2026-10-02T00:00:0${id.length}.000Z`, updatedAt: '2026-10-02T00:00:00.000Z' }
}

function report(status: string, extra: Record<string, unknown> = {}) {
  return { taskId: 'task-1', attemptId: 'a', status, pagesFetched: 0, cachedPages: 0, budgetExceeded: null, loopDetected: false, wallMs: 0, costUsd: null, contentTokens: null, discovery: null, ...extra }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const list = (items: CrawlPage[], nextCursor: string | null = null) => json({ items, nextCursor, hasMore: nextCursor !== null })

/** An SSE body of the given frames, as the API writes them. */
function sse(frames: JobStreamFrame[]): Response {
  const text = frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame.type === 'error' ? frame.error : frame.data)}\n${frame.type === 'document' ? `id: ${frame.cursor}\n` : ''}\n`).join('')
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** A fetch answering by path; every call is recorded. */
function fakeFetch(answer: (url: URL, init: RequestInit | undefined) => Response | undefined) {
  const calls: Array<{ url: URL; init: RequestInit | undefined }> = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    return answer(url, init) ?? json({ error: `no fake for ${url.pathname}`, code: 'not_found' }, 404)
  }) as typeof fetch
  return { fetch, calls, paths: () => calls.map((call) => `${call.url.pathname}${call.url.search}`) }
}

/** A WebSocket the test scripts: the watcher attaches its listeners on construction, the script runs on the next microtask. */
class FakeSocket implements WatcherWebSocket {
  static script: ((socket: FakeSocket) => void) | null = null
  static instances: FakeSocket[] = []
  readyState = 0
  protocol = ''
  closedWith: { code?: number; reason?: string } | null = null
  private readonly listeners = new Map<string, Array<(event: { data?: unknown; code?: number; reason?: string }) => void>>()
  constructor(readonly url: string, readonly protocols?: string | string[]) {
    FakeSocket.instances.push(this)
    queueMicrotask(() => FakeSocket.script?.(this))
  }
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: { data?: unknown; code?: number; reason?: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  close(code?: number, reason?: string): void { this.closedWith = { code, reason }; this.readyState = 3 }
  fire(type: string, event: { data?: unknown; code?: number; reason?: string } = {}): void { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  open(): void { this.readyState = 1; this.protocol = Array.isArray(this.protocols) ? this.protocols[0] ?? '' : this.protocols ?? ''; this.fire('open') }
  message(frame: JobStreamFrame): void { this.fire('message', { data: JSON.stringify(frame) }) }
  end(code: number, reason = ''): void { this.readyState = 3; this.fire('close', { code, reason }) }
}

const collect = async (watcher: AsyncIterable<WatcherEvent>): Promise<WatcherEvent[]> => { const events: WatcherEvent[] = []; for await (const event of watcher) events.push(event); return events }
const types = (events: WatcherEvent[]) => events.map((event) => event.type)
const documentIds = (events: WatcherEvent[]) => events.flatMap((event) => event.type === 'document' ? [event.data.id] : [])

describe('JobWatcher', () => {
  it('streams documents and done over server-sent events when no WebSocket is available, dispatching the same events', async () => {
    const frames: JobStreamFrame[] = [
      { type: 'catchup', data: report('running') as never },
      { type: 'document', data: page('a'), cursor: 'cur-a' },
      { type: 'document', data: page('b'), cursor: 'cur-b' },
      { type: 'snapshot', data: report('running', { pagesFetched: 2 }) as never },
      { type: 'done', data: report('completed', { pagesFetched: 2 }) as never },
    ]
    const f = fakeFetch((url) => url.pathname === '/v1/crawl/task-1/events' ? sse(frames) : undefined)
    const client = new W2L({ baseUrl: BASE, fetch: f.fetch })
    const watcher = client.watcher('task-1', { WebSocket: null })
    const dispatched: string[] = []
    for (const type of ['document', 'snapshot', 'done', 'error'] as const) watcher.addEventListener(type, (event) => dispatched.push(`${type}:${JSON.stringify((event as CustomEvent).detail).length > 0}`))
    const events = await collect(watcher)
    expect(types(events)).toEqual(['snapshot', 'document', 'document', 'snapshot', 'done'])
    expect(documentIds(events)).toEqual(['a', 'b'])
    expect(dispatched).toEqual(['snapshot:true', 'document:true', 'document:true', 'snapshot:true', 'done:true'])
    expect(watcher).toMatchObject({ jobId: 'task-1', kind: 'crawl', transport: 'sse', status: 'completed' })
    expect(watcher.data.map((item) => item.id)).toEqual(['a', 'b'])
    expect(f.paths()).toEqual(['/v1/crawl/task-1/events'])
    expect(new Headers(f.calls[0]!.init?.headers).get('accept')).toBe('text/event-stream')
    // A second iteration replays the log from the start.
    expect(types(await collect(watcher))).toEqual(types(events))
  })

  it('uses the WebSocket route first, presents the token as the w2l.token subprotocol, and emits a document seen twice once', async () => {
    FakeSocket.instances = []
    FakeSocket.script = (socket) => {
      socket.open()
      socket.message({ type: 'catchup', data: report('running') as never })
      socket.message({ type: 'document', data: page('a'), cursor: 'cur-a' })
      socket.message({ type: 'document', data: page('a'), cursor: 'cur-a' })
      socket.message({ type: 'document', data: page('b'), cursor: 'cur-b' })
      socket.message({ type: 'done', data: report('completed') as never })
      socket.end(1000, 'done')
    }
    const f = fakeFetch(() => undefined)
    const client = new W2L({ baseUrl: 'https://w2l.example', token: 'secret', fetch: f.fetch })
    const watcher = client.watcher('task-1', { kind: 'batch', WebSocket: FakeSocket })
    const events = await collect(watcher)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(FakeSocket.instances[0]).toMatchObject({ url: 'wss://w2l.example/v1/batches/task-1/ws', protocols: ['w2l.token.secret'] })
    expect(types(events)).toEqual(['snapshot', 'document', 'document', 'done'])
    expect(documentIds(events)).toEqual(['a', 'b'])
    expect(watcher.transport).toBe('websocket')
    expect(f.calls).toEqual([])
  })

  it('falls back to polling the status and listing routes when the stream routes answer 404 and no WebSocket exists', async () => {
    let statusCalls = 0
    const a = page('a'), b = page('bb'), c = page('ccc')
    const f = fakeFetch((url) => {
      if (url.pathname.endsWith('/events')) return json({ error: 'no route', code: 'not_found' }, 404)
      if (url.pathname === '/v1/batches/task-1') return json(report(++statusCalls === 1 ? 'running' : 'completed', { requested: 3, completed: statusCalls === 1 ? 2 : 3 }))
      if (url.pathname === '/v1/batches/task-1/items') {
        const cursor = url.searchParams.get('cursor')
        if (cursor === null) return list([a, b], 'c1')
        if (cursor === 'c1') return list([c])
        return list([])
      }
      return undefined
    })
    const client = new W2L({ baseUrl: BASE, fetch: f.fetch })
    const watcher = client.watcher('task-1', { kind: 'batch', pollIntervalMs: 250, WebSocket: null })
    const events = await collect(watcher)
    expect(watcher.transport).toBe('poll')
    expect(documentIds(events)).toEqual(['a', 'bb', 'ccc'])
    expect(types(events).filter((type) => type === 'snapshot')).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { status: 'completed', requested: 3 } })
    // The listing was followed through its cursor, then continued after the last item on the next round.
    expect(f.paths()).toEqual([
      '/v1/batches/task-1/events',
      '/v1/batches/task-1',
      '/v1/batches/task-1/items?limit=50',
      '/v1/batches/task-1/items?cursor=c1&limit=50',
      '/v1/batches/task-1',
      `/v1/batches/task-1/items?cursor=${pageCursor(c)}&limit=50`,
    ])
  })

  it('continues from the last cursor when a stream dies before done, without re-emitting the documents it had', async () => {
    FakeSocket.script = (socket) => socket.end(1006)
    const frames: JobStreamFrame[] = [
      { type: 'catchup', data: report('running') as never },
      { type: 'document', data: page('a'), cursor: 'cur-a' },
      { type: 'document', data: page('bb'), cursor: 'cur-bb' },
    ]
    const f = fakeFetch((url) => {
      if (url.pathname === '/v1/crawl/task-1/events') return sse(frames)
      if (url.pathname === '/v1/crawl/task-1') return json(report('completed', { pagesFetched: 3 }))
      // The server would not repeat what sits before the cursor; the watcher deduplicates anyway.
      if (url.pathname === '/v1/crawl/task-1/pages') return list([page('bb'), page('ccc')])
      if (url.pathname === '/v1/crawl/task-1/errors') return list([])
      return undefined
    })
    const client = new W2L({ baseUrl: BASE, fetch: f.fetch })
    const watcher = client.watcher('task-1', { pollIntervalMs: 250, WebSocket: FakeSocket })
    const events = await collect(watcher)
    expect(documentIds(events)).toEqual(['a', 'bb', 'ccc'])
    expect(watcher.transport).toBe('poll')
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { status: 'completed' } })
    const pages = f.calls.find((call) => call.url.pathname === '/v1/crawl/task-1/pages')!.url.searchParams
    expect(pages.get('cursor')).toBe('cur-bb')
    expect(pages.get('includeDuplicates')).toBe('true')
    expect(f.calls.find((call) => call.url.pathname === '/v1/crawl/task-1/errors')!.url.searchParams.get('cursor')).toBe('cur-bb')
  })

  it('ends with watcher_timeout when the job does not finish in time, dispatches nothing after, and refuses a poll interval under 250', async () => {
    const f = fakeFetch((url) => {
      if (url.pathname === '/v1/crawl/task-1') return json(report('running'))
      if (url.pathname.endsWith('/pages') || url.pathname.endsWith('/errors')) return list([])
      return undefined
    })
    const client = new W2L({ baseUrl: BASE, fetch: f.fetch })
    const watcher = client.watcher('task-1', { transport: 'poll', pollIntervalMs: 250, timeoutMs: 20 })
    const events = await collect(watcher)
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'watcher_timeout', message: expect.stringMatching(/^job task-1 did not finish within 20 ms \(last status: (running|unknown)\)$/) } })
    const seen = events.length
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await collect(watcher)).toHaveLength(seen)
    expect(() => client.watcher('task-1', { pollIntervalMs: 100 })).toThrow(new TypeError('pollIntervalMs must be at least 250'))
    expect(() => client.watcher('task-1', { kind: 'extract' as 'crawl' })).toThrow(TypeError)
    expect(() => new JobWatcher({} as never, '')).toThrow(TypeError)
  })

  it('treats a 401 on the events route and a 4404 socket close as final, and a failed handshake as the next transport\'s turn', async () => {
    const denied = fakeFetch((url) => url.pathname.endsWith('/events') ? json({ error: 'unauthorized', code: 'unauthorized' }, 401) : undefined)
    const unauthorized = await collect(new W2L({ baseUrl: BASE, fetch: denied.fetch }).watcher('task-1', { WebSocket: null }))
    expect(unauthorized).toEqual([{ type: 'error', error: { code: 'unauthorized', message: 'GET /v1/crawl/task-1/events answered 401' } }])
    expect(denied.paths()).toEqual(['/v1/crawl/task-1/events'])
    FakeSocket.script = (socket) => { socket.open(); socket.end(4404, 'not found') }
    const missing = fakeFetch(() => undefined)
    expect(await collect(new W2L({ baseUrl: BASE, fetch: missing.fetch }).watcher('task-9', { WebSocket: FakeSocket }))).toEqual([{ type: 'error', error: { code: 'not_found', message: 'crawl task-9 not found' } }])
    expect(missing.calls).toEqual([])
    FakeSocket.script = (socket) => { socket.fire('error'); socket.end(1006) }
    const fell = fakeFetch((url) => url.pathname === '/v1/crawl/task-1/events' ? sse([{ type: 'done', data: report('completed') as never }]) : undefined)
    const watcher = new W2L({ baseUrl: BASE, fetch: fell.fetch }).watcher('task-1', { WebSocket: FakeSocket })
    expect(types(await collect(watcher))).toEqual(['done'])
    expect(watcher.transport).toBe('sse')
    // close() ends a watch quietly: no event, the iterator done.
    FakeSocket.script = (socket) => socket.open()
    const closed = new W2L({ baseUrl: BASE, fetch: fell.fetch }).watcher('task-1', { WebSocket: FakeSocket })
    closed.close()
    expect(await collect(closed)).toEqual([])
    expect(closed.transport).toBeNull()
  })

  it('crawlAndWatch and batchScrapeAndWatch start the job and watch the returned task id under its kind', async () => {
    const f = fakeFetch((url, init) => {
      if (init?.method === 'POST' && url.pathname === '/v1/crawl') return json({ taskId: 'task-9' }, 202)
      if (init?.method === 'POST' && url.pathname === '/v1/batches') return json({ taskId: 'batch-9' }, 202)
      if (url.pathname === '/v1/crawl/task-9/events') return sse([{ type: 'catchup', data: report('running') as never }, { type: 'done', data: report('completed') as never }])
      if (url.pathname === '/v1/batches/batch-9/events') return sse([{ type: 'done', data: report('completed', { requested: 1 }) as never }])
      return undefined
    })
    const client = new W2L({ baseUrl: BASE, fetch: f.fetch })
    const crawl = await client.crawlAndWatch('https://example.com/', { maxPages: 5 }, { WebSocket: null })
    expect(crawl).toMatchObject({ jobId: 'task-9', kind: 'crawl' })
    expect(types(await collect(crawl))).toEqual(['snapshot', 'done'])
    const batch = await client.batchScrapeAndWatch(['https://example.com/a'], {}, { WebSocket: null })
    expect(batch).toMatchObject({ jobId: 'batch-9', kind: 'batch' })
    expect(types(await collect(batch))).toEqual(['done'])
    expect(f.paths()).toEqual(['/v1/crawl', '/v1/crawl/task-9/events', '/v1/batches', '/v1/batches/batch-9/events'])
    expect(JSON.parse(String(f.calls[0]!.init?.body))).toMatchObject({ url: 'https://example.com/', maxPages: 5 })
  })

  it('parses an SSE block as the API writes it, and encodes a page cursor the listing routes decode', () => {
    expect(parseSseBlock('event: document\ndata: {"id":"a"}\nid: cur-a')).toEqual({ type: 'document', data: { id: 'a' }, cursor: 'cur-a' })
    expect(parseSseBlock('event: error\ndata: {"code":"x","message":"y"}')).toEqual({ type: 'error', error: { code: 'x', message: 'y' } })
    expect(parseSseBlock(': comment\nevent: progress\ndata: {}')).toBeNull()
    expect(parseSseBlock('event: document\ndata: {"id":"a"}')).toBeNull()
    expect(JSON.parse(Buffer.from(pageCursor({ createdAt: '2026-10-02T00:00:00.000Z', id: 'step-1' }), 'base64url').toString('utf8'))).toEqual({ createdAt: '2026-10-02T00:00:00.000Z', id: 'step-1' })
  })
})
