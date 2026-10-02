import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { serve, type ServerType } from '@hono/node-server'
import { localNetworkPolicy, type CrawlPage, type JobStreamFrame, type JobStreamReport } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L, type WatcherEvent } from '@w2l/sdk'
import { createApp, injectJobWebSockets } from '../src/app.js'
import { createApiEngine, type ApiEngine, type ApiEngineOptions } from '../src/engine.js'

const ITEMS = [1, 2, 3, 4, 5]

/** `/` links to five items; each item links back to `/`. Every page is contentful on the http rung. */
function page(path: string): string {
  const links = path === '/' ? ITEMS.map((n) => `/item/${n}`) : ['/']
  const number = path.split('/').at(-1) || 'home'
  return `<!doctype html><html><head><title>Fixture item ${number}</title></head><body><main><article><h1>Fixture item ${number}</h1><p>This is a long and stable fixture page for item ${number}. It has enough independent body text for the extraction cascade to accept it as a real article, and it provides a deterministic title to map directly into the requested JSON schema.</p><ul>${links.map((href) => `<li><a href="${href}">${href}</a></li>`).join('')}</ul></article></main></body></html>`
}

interface SseEvent { event: string; id?: string; data: JobStreamReport & CrawlPage & { code?: string; message?: string } }

/** The complete event blocks of an SSE text, each with its event name, id and parsed data. */
function parseSse(text: string): SseEvent[] {
  return text.split(/\r?\n\r?\n/).map((block) => block.trim()).filter((block) => block.length > 0).map((block) => {
    const fields: Record<string, string[]> = {}
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(':')
      ;(fields[line.slice(0, colon)] ??= []).push(line.slice(colon + 1).replace(/^ /, ''))
    }
    return { event: fields.event![0]!, ...(fields.id === undefined ? {} : { id: fields.id[0]! }), data: JSON.parse(fields.data!.join('\n')) }
  })
}

/** Reads an SSE response as it arrives: `until` returns once the complete events satisfy the predicate, `rest` reads to the end. */
async function sseReader(res: Response) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let ended = false
  const complete = () => parseSse(text.slice(0, text.lastIndexOf('\n\n') + 2))
  const until = async (predicate: (events: SseEvent[]) => boolean): Promise<SseEvent[]> => {
    while (!predicate(complete()) && !ended) {
      const { value, done } = await reader.read()
      if (done) { ended = true; break }
      text += decoder.decode(value, { stream: true })
    }
    return complete()
  }
  return { until, rest: () => until(() => false), text: () => text }
}

const collect = async (watcher: AsyncIterable<WatcherEvent>): Promise<WatcherEvent[]> => { const events: WatcherEvent[] = []; for await (const event of watcher) events.push(event); return events }

describe('job streams', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'w2l-streams-'))
    let slow = false
    let release = () => {}
    let slowStarted = () => {}
    const seen: string[] = []
    const server = createServer(async (req, res) => {
      const path = req.url ?? '/'
      if (path === '/robots.txt') { res.writeHead(200).end('User-agent: *\nAllow: /'); return }
      seen.push(path)
      if (path.endsWith('/item/2') && slow) { slowStarted(); await new Promise<void>((resolve) => { release = resolve }) }
      if (res.destroyed) return
      res.writeHead(200, { 'content-type': 'text/html' }).end(page(path))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const engine = (extra: Partial<ApiEngineOptions> = {}): ApiEngine => {
      const created = createApiEngine({ taskRoot: root, networkPolicy: policy, workerCount: 2, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('stream tests stay on HTTP') } } } }), ...extra })
      cleanup.push(() => created.close({ cancelActive: true }))
      return created
    }
    cleanup.push(async () => { release(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) })
    return { origin, seen, engine, setSlow: (value: boolean) => { slow = value }, started: () => new Promise<void>((resolve) => { slowStarted = resolve }), release: () => release() }
  }

  const client = (app: ReturnType<typeof createApp>) => new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })

  /** A real listener for the WebSocket cases, with the app's upgrades attached. */
  async function listen(app: ReturnType<typeof createApp>): Promise<string> {
    let server!: ServerType
    await new Promise<void>((resolve) => { server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, () => resolve()) })
    injectJobWebSockets(app, server)
    cleanup.push(async () => { (server as import('node:http').Server).closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) })
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  it('streams catchup, one document per page as it is recorded and done over SSE, resumable after a document', async () => {
    const f = await fixture()
    f.setSlow(true)
    const held = f.started()
    const engine = f.engine()
    const app = createApp(engine)
    const w2l = client(app)
    const { taskId } = await w2l.crawl(`${f.origin}/`, { maxPages: 4, sitemap: 'skip' })
    await held
    // Connected while the crawl runs: the pages so far are replayed, the rest arrive live.
    const res = await app.request(`/v1/crawl/${taskId}/events`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const stream = await sseReader(res)
    const early = await stream.until((events) => events.length >= 2)
    expect(early[0]).toMatchObject({ event: 'catchup', data: { taskId, status: 'running' } })
    expect(early[1]).toMatchObject({ event: 'document', data: { url: `${f.origin}/`, status: 'success' } })
    expect(early.some((event) => event.event === 'done')).toBe(false)
    f.release()
    const events = await stream.rest()
    const documents = events.filter((event) => event.event === 'document')
    expect(documents).toHaveLength(4)
    expect(new Set(documents.map((event) => event.data.id)).size).toBe(4)
    expect(new Set(documents.map((event) => event.id)).size).toBe(4)
    expect(documents.every((event) => event.data.trace.length === 0 && event.data.audit === undefined && typeof event.data.markdown === 'string')).toBe(true)
    // Pages recorded after the catchup are followed by the report they changed.
    expect(events.filter((event) => event.event === 'snapshot').length).toBeGreaterThanOrEqual(1)
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { taskId, status: 'completed', pagesFetched: 4, budgetExceeded: 'pages' } })
    expect(events.indexOf(events.find((event) => event.event === 'done')!)).toBe(events.length - 1)
    // Resuming after the second document, by header or query, replays the later two and done, nothing twice.
    const second = documents[1]!.id!
    for (const init of [{ headers: { 'last-event-id': second } }, { path: `?after=${encodeURIComponent(second)}` }] as const) {
      const resumed = parseSse(await (await app.request(`/v1/crawl/${taskId}/events${'path' in init ? init.path : ''}`, 'headers' in init ? { headers: init.headers } : {})).text())
      expect(resumed.map((event) => event.event)).toEqual(['catchup', 'document', 'document', 'done'])
      expect(resumed.filter((event) => event.event === 'document').map((event) => event.id)).toEqual(documents.slice(2).map((event) => event.id))
    }
    const bad = await app.request(`/v1/crawl/${taskId}/events?after=not-a-cursor`)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'cursor is not one this API issued', code: 'invalid_request' })
    expect((await app.request('/v1/crawl/nothing/events')).status).toBe(404)
  })

  it('streams a batch as one document per URL and done; a crawl id is not a batch there', async () => {
    const f = await fixture()
    const engine = f.engine()
    const app = createApp(engine)
    const w2l = client(app)
    const urls = [1, 2, 3].map((n) => `${f.origin}/item/${n}`)
    const { taskId } = await w2l.batchScrape(urls, { formats: [{ type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }] })
    expect(await w2l.waitBatch(taskId, { pollIntervalMs: 25 })).toMatchObject({ status: 'completed', completed: 3 })
    const events = parseSse(await (await app.request(`/v1/batches/${taskId}/events`)).text())
    expect(events.map((event) => event.event)).toEqual(['catchup', 'document', 'document', 'document', 'done'])
    expect(new Set(events.filter((event) => event.event === 'document').map((event) => event.data.url))).toEqual(new Set(urls))
    expect(events.filter((event) => event.event === 'document').every((event) => event.data.json?.status === 'complete')).toBe(true)
    expect(events.at(-1)!.data).toMatchObject({ status: 'completed', requested: 3, completed: 3, succeeded: 3, failed: 0 })
    const crawl = await w2l.crawl(`${f.origin}/item/1`, { maxPages: 1, sitemap: 'skip' })
    await w2l.waitCrawl(crawl.taskId, { pollIntervalMs: 25 })
    expect((await app.request(`/v1/batches/${crawl.taskId}/events`)).status).toBe(404)
  })

  it('answers 404 on every stream route with jobStreams off, and the SDK watcher then polls', async () => {
    const f = await fixture()
    const engine = f.engine()
    const app = createApp(engine, { jobStreams: false })
    const w2l = client(app)
    const { taskId } = await w2l.crawl(`${f.origin}/`, { maxPages: 3, sitemap: 'skip' })
    for (const path of [`/v1/crawl/${taskId}/events`, `/v1/crawl/${taskId}/ws`, `/v1/batches/${taskId}/events`, `/v1/batches/${taskId}/ws`]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(404)
      expect(await res.json()).toEqual({ error: `no route for GET ${path}`, code: 'not_found' })
    }
    const watcher = w2l.watcher(taskId, { kind: 'crawl', pollIntervalMs: 250, WebSocket: null })
    const events = await collect(watcher)
    expect(watcher.transport).toBe('poll')
    const documents = events.filter((event): event is WatcherEvent & { type: 'document' } => event.type === 'document')
    expect(documents).toHaveLength(3)
    expect(new Set(documents.map((event) => event.data.id)).size).toBe(3)
    expect(watcher.data.map((page) => page.id)).toEqual(documents.map((event) => event.data.id))
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { status: 'completed', pagesFetched: 3 } })
    expect(watcher.status).toBe('completed')
  })

  it('serves the frames over a WebSocket, closes after done, closes 4404 for a missing job, and takes the token as a subprotocol', async () => {
    const f = await fixture()
    const engine = f.engine()
    const open = createApp(engine)
    const openUrl = await listen(open)
    const w2l = new W2L({ baseUrl: openUrl })
    const { taskId } = await w2l.crawl(`${f.origin}/`, { maxPages: 3, sitemap: 'skip' })
    expect(await w2l.waitCrawl(taskId, { pollIntervalMs: 25 })).toMatchObject({ status: 'completed', pagesFetched: 3 })
    const socket = (url: string, protocols?: string[]) => new Promise<{ frames: JobStreamFrame[]; code: number; protocol: string }>((resolve) => {
      const ws = new WebSocket(url, protocols)
      const frames: JobStreamFrame[] = []
      let protocol = ''
      let opened = false
      ws.addEventListener('open', () => { opened = true; protocol = ws.protocol })
      ws.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data)) as JobStreamFrame))
      // Node 22's WebSocket reports a refused handshake with an error and no close event; Node 24+ closes with 1006 after it.
      ws.addEventListener('error', () => { if (!opened) resolve({ frames, code: 1006, protocol }) })
      ws.addEventListener('close', (event) => resolve({ frames, code: event.code, protocol }))
    })
    const wsUrl = `${openUrl.replace('http', 'ws')}/v1/crawl/${taskId}/ws`
    const streamed = await socket(wsUrl)
    expect(streamed.frames.map((frame) => frame.type)).toEqual(['catchup', 'document', 'document', 'document', 'done'])
    expect(streamed.frames.filter((frame): frame is JobStreamFrame & { type: 'document' } => frame.type === 'document').every((frame) => typeof frame.cursor === 'string' && frame.cursor.length > 0)).toBe(true)
    expect(streamed.frames.at(-1)).toMatchObject({ type: 'done', data: { status: 'completed', pagesFetched: 3 } })
    expect(streamed.code).toBe(1000)
    // The SDK's default transport is this route.
    const watcher = w2l.watcher(taskId, { kind: 'crawl' })
    const events = await collect(watcher)
    expect(watcher.transport).toBe('websocket')
    expect(events.filter((event) => event.type === 'document')).toHaveLength(3)
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { status: 'completed' } })
    expect((await socket(`${openUrl.replace('http', 'ws')}/v1/crawl/nothing/ws`)).code).toBe(4404)
    expect((await socket(`${wsUrl}?after=not-a-cursor`))).toMatchObject({ code: 4400, frames: [{ type: 'error', error: { code: 'invalid_request' } }] })
    // A server with tokens: the upgrade carries the token as the w2l.token.<token> subprotocol, echoed back; without it the handshake is refused.
    const guarded = createApp(engine, { tokens: ['secret'] })
    const guardedUrl = (await listen(guarded)).replace('http', 'ws')
    const refused = await socket(`${guardedUrl}/v1/crawl/${taskId}/ws`)
    expect(refused).toMatchObject({ frames: [], code: 1006 })
    const admitted = await socket(`${guardedUrl}/v1/crawl/${taskId}/ws`, ['w2l.token.secret'])
    expect(admitted.protocol).toBe('w2l.token.secret')
    expect(admitted.frames.map((frame) => frame.type)).toEqual(['catchup', 'document', 'document', 'document', 'done'])
    expect(admitted.code).toBe(1000)
  })
})
