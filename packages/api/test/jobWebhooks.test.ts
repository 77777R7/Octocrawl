import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy, type BatchStartRequest, type CrawlPage, type FirecrawlWebhookPayload, type JobWebhookEnvelope, type StepRecord, type Task, type WebhookDelivery } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { DeliveryStore, DeliveryWorker, SqliteTaskStore, verifyWebhookSignature, type TaskStore } from '@w2l/runtime'
import { W2L } from '@w2l/sdk'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine, type ApiEngineOptions } from '../src/engine.js'
import { JobEventHub } from '../src/jobEvents.js'
import { JobWebhooks } from '../src/jobWebhooks.js'

const ITEMS = [1, 2, 3, 4, 5]
const HOOK = 'http://127.0.0.1:8828/hook'

/** `/` links to five items; each item links back to `/`. Every page is contentful on the http rung. */
function page(path: string): string {
  const links = path === '/' ? ITEMS.map((n) => `/item/${n}`) : ['/']
  const number = path.split('/').at(-1) || 'home'
  return `<!doctype html><html><head><title>Fixture item ${number}</title></head><body><main><article><h1>Fixture item ${number}</h1><p>This is a long and stable fixture page for item ${number}. It has enough independent body text for the extraction cascade to accept it as a real article, and it provides a deterministic title to map directly into the requested JSON schema.</p><ul>${links.map((href) => `<li><a href="${href}">${href}</a></li>`).join('')}</ul></article></main></body></html>`
}

type Delivered = { url: string; headers: Record<string, string>; body: JobWebhookEnvelope }

describe('job webhooks', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'w2l-webhooks-'))
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
      const created = createApiEngine({ taskRoot: root, networkPolicy: policy, workerCount: 2, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('webhook tests stay on HTTP') } } } }), ...extra })
      // Tests close an engine themselves to end its jobs; the cleanup's second close is a no-op.
      const close = created.close.bind(created)
      let closed: Promise<void> | null = null
      created.close = (options) => { closed ??= close(options); return closed }
      cleanup.push(() => created.close({ cancelActive: true }))
      return created
    }
    // The worker an API process runs, on a transport that records each request instead of connecting; `answer` decides the status.
    const requests: Delivered[] = []
    let answer: (request: Delivered) => number = () => 200
    const deliveryStore = DeliveryStore.open(join(root, 'section-b-control.sqlite'))
    const worker = new DeliveryWorker(deliveryStore, { retryBaseMs: 1, secrets: { W2L_WEBHOOK_SECRET_TEST: 'local-test-secret' }, transport: async (request) => {
      const delivered = { url: request.url, headers: request.headers, body: JSON.parse(request.body) as JobWebhookEnvelope }
      requests.push(delivered)
      return { status: answer(delivered), retryAfter: null }
    } })
    const drain = async (): Promise<void> => { while (await worker.processOne()) { /* until nothing is due */ } }
    cleanup.push(async () => { release(); deliveryStore.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) })
    return { root, origin, seen, engine, deliveryStore, requests, drain, setAnswer: (fn: (request: Delivered) => number) => { answer = fn }, setSlow: (value: boolean) => { slow = value }, started: () => new Promise<void>((resolve) => { slowStarted = resolve }), release: () => release() }
  }

  const client = (engine: ApiEngine) => {
    const app = createApp(engine)
    return { app, w2l: new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch }) }
  }

  /** Polls until the job has `count` deliveries: the terminal event is enqueued after the task row is written terminal, so a status read can run ahead of it. */
  async function deliveries(engine: ApiEngine, taskId: string, count: number): Promise<WebhookDelivery[]> {
    for (let i = 0; i < 400; i++) {
      const listed = engine.listDeliveries({ jobId: taskId })
      if (listed.length >= count) return listed
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`job ${taskId} never reached ${count} deliveries`)
  }

  /** Polls until no crawl is in flight (a crawl leaves the list after its terminal bookkeeping). */
  async function idle(engine: ApiEngine): Promise<void> {
    for (let i = 0; i < 400; i++) {
      if ((await engine.listActiveCrawls()).crawls.length === 0) return
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error('a crawl stayed active')
  }

  const bySequence = (requests: Delivered[]) => [...requests].sort((a, b) => a.body.sequence - b.body.sequence)
  const byEvent = (requests: Delivered[], event: string) => bySequence(requests).filter((request) => request.body.event === event)
  const taskDirs = async (root: string) => (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !['scrapes', 'files', 'profiles'].includes(entry.name)).map((entry) => entry.name)

  it('delivers started, one page per page and completed for a crawl, numbered in order, with W2L\'s headers and no signature', async () => {
    const f = await fixture()
    const engine = f.engine()
    const { app, w2l } = client(engine)
    const { taskId } = await w2l.crawl(`${f.origin}/`, { maxPages: 4, sitemap: 'skip', webhook: HOOK })
    expect(await w2l.waitCrawl(taskId, { pollIntervalMs: 25 })).toMatchObject({ status: 'completed', pagesFetched: 4, budgetExceeded: 'pages' })
    const queued = await deliveries(engine, taskId, 6)
    expect(queued.map((delivery) => delivery.state)).toEqual(Array(6).fill('pending'))
    await f.drain()
    expect(f.requests).toHaveLength(6)
    expect(f.requests.every((request) => request.url === HOOK)).toBe(true)
    const bodies = bySequence(f.requests).map((request) => request.body)
    expect(bodies.map((body) => body.event)).toEqual(['started', 'page', 'page', 'page', 'page', 'completed'])
    expect(bodies.map((body) => body.sequence)).toEqual([0, 1, 2, 3, 4, 5])
    expect(bodies.every((body) => body.schemaVersion === 'w2l.job-event/v1' && body.jobId === taskId && body.jobKind === 'crawl' && JSON.stringify(body.metadata) === '{}' && !Number.isNaN(Date.parse(body.at)))).toBe(true)
    expect(bodies[0]).toEqual({ schemaVersion: 'w2l.job-event/v1', eventId: `${taskId}:started`, sequence: 0, jobId: taskId, jobKind: 'crawl', event: 'started', at: expect.any(String), metadata: {} })
    const pages = byEvent(f.requests, 'page').map((request) => request.body.page!)
    expect(new Set(pages.map((p) => p.url))).toEqual(new Set(f.seen.map((path) => `${f.origin}${path}`)))
    expect(pages.every((p) => p.status === 'success' && p.lane === 'http' && typeof p.markdown === 'string' && p.markdown.length > 0 && p.trace.length === 0 && p.audit === undefined && p.evidenceRecord !== null)).toBe(true)
    expect(byEvent(f.requests, 'page').map((request) => request.body.eventId)).toEqual(pages.map((p) => `${taskId}:page:${p.id}`))
    const completed = bodies[5]!
    expect(completed.eventId).toBe(`${taskId}:completed`)
    expect(completed.report).toMatchObject({ taskId, status: 'completed', pagesFetched: 4, budgetExceeded: 'pages' })
    expect(completed).not.toHaveProperty('page')
    for (const request of f.requests) {
      expect(request.headers).toEqual({ 'x-w2l-event-id': request.body.eventId, 'x-w2l-event-version': String(request.body.sequence), 'x-w2l-delivery-id': expect.any(String) })
    }
    // The status and the deliveries routes report the same standing; the destination shows no header values (there were none).
    expect((await w2l.getCrawl(taskId)).webhook).toEqual({ destinationId: `job:${taskId}`, url: HOOK, events: ['started', 'page', 'completed', 'failed', 'cancelled'], pending: 0, delivered: 6, deadLetter: 0 })
    const listed = await (await app.request(`/v1/deliveries/page?jobId=${taskId}`)).json() as { items: WebhookDelivery[]; hasMore: boolean }
    expect(listed.hasMore).toBe(false)
    expect(listed.items.map((item) => [item.state, item.lastStatus, item.attemptCount, item.monitorId])).toEqual(Array(6).fill(['delivered', 200, 1, `job:${taskId}`]))
    expect(await w2l.listDeliveryDestinations({ jobId: taskId })).toMatchObject([{ id: `job:${taskId}`, kind: 'job', jobId: taskId, url: HOOK, headerNames: [] }])
    const both = await app.request(`/v1/deliveries?jobId=${taskId}&monitorId=catalog`)
    expect(both.status).toBe(400)
    expect(await both.json()).toEqual({ error: 'jobId and monitorId cannot be combined', code: 'invalid_request' })
  })

  it('delivers a batch\'s events with its headers on every attempt and its metadata in every payload, signed when secretEnv is set; a job without metadata sends {}', async () => {
    const f = await fixture()
    const engine = f.engine()
    const { app, w2l } = client(engine)
    const urls = [1, 2, 3].map((n) => `${f.origin}/item/${n}`)
    const { taskId } = await w2l.batchScrape(urls, { webhook: { url: HOOK, headers: { Authorization: 'Bearer test', 'X-Run': 'wh3' }, metadata: { run: 'wh4', team: 'parity' }, secretEnv: 'W2L_WEBHOOK_SECRET_TEST' } })
    expect(await w2l.waitBatch(taskId, { pollIntervalMs: 25 })).toMatchObject({ status: 'completed', requested: 3, completed: 3, succeeded: 3, failed: 0 })
    await deliveries(engine, taskId, 5)
    // The first delivery is answered 503 once, so the receiver sees that event twice, with the same headers and body each time.
    let first = true
    f.setAnswer(() => { if (first) { first = false; return 503 } return 200 })
    await f.drain()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await f.drain()
    expect(f.requests).toHaveLength(6)
    for (const request of f.requests) {
      expect(request.headers).toMatchObject({ authorization: 'Bearer test', 'x-run': 'wh3', 'x-w2l-event-id': request.body.eventId, 'x-w2l-event-version': String(request.body.sequence) })
      expect(verifyWebhookSignature('local-test-secret', request.headers['x-w2l-timestamp'], request.headers['x-w2l-signature'], JSON.stringify(request.body), Number(request.headers['x-w2l-timestamp']))).toBe(true)
      expect(request.body.metadata).toEqual({ run: 'wh4', team: 'parity' })
      expect(request.body.jobKind).toBe('batch')
      expect(Object.keys(request.headers).filter((name) => name === 'run' || name === 'team')).toEqual([])
    }
    const retried = f.requests.filter((request) => request.headers['x-w2l-delivery-id'] === f.requests[0]!.headers['x-w2l-delivery-id'])
    expect(retried).toHaveLength(2)
    expect(JSON.stringify(retried[0]!.body)).toBe(JSON.stringify(retried[1]!.body))
    expect(new Set(f.requests.map((request) => request.body.eventId)).size).toBe(5)
    const completed = f.requests.find((request) => request.body.event === 'completed')!.body
    expect(completed.sequence).toBe(4)
    expect(completed.report).toMatchObject({ taskId, status: 'completed', requested: 3, completed: 3, succeeded: 3, failed: 0 })
    expect(byEvent(f.requests, 'page').map((request) => request.body.page!.url).sort()).toEqual([...urls].sort())
    // Header values live in the control database alone: the destination lists their names, and no response carries them.
    const destinations = await (await app.request(`/v1/delivery/destinations?jobId=${taskId}`)).text()
    expect(JSON.parse(destinations)).toMatchObject([{ id: `job:${taskId}`, headerNames: ['authorization', 'x-run'], metadata: { run: 'wh4', team: 'parity' }, secretEnv: 'W2L_WEBHOOK_SECRET_TEST' }])
    expect(destinations).not.toContain('Bearer test')
    expect(JSON.stringify(await (await app.request(`/v1/deliveries?jobId=${taskId}`)).json())).not.toContain('Bearer test')
    expect(JSON.stringify(await w2l.getBatch(taskId))).not.toContain('Bearer test')
    expect((await w2l.getBatch(taskId)).webhook).toMatchObject({ url: HOOK, delivered: 5, pending: 0, deadLetter: 0 })
    // A job without metadata sends {} and no header beyond W2L's own.
    f.requests.length = 0
    f.setAnswer(() => 200)
    const plain = await w2l.batchScrape([urls[0]!], { webhook: HOOK })
    await w2l.waitBatch(plain.taskId, { pollIntervalMs: 25 })
    await deliveries(engine, plain.taskId, 3)
    await f.drain()
    expect(f.requests.map((request) => request.body.metadata)).toEqual([{}, {}, {}])
    expect(f.requests.every((request) => !('authorization' in request.headers) && !('x-w2l-signature' in request.headers))).toBe(true)
  })

  it('sends only the events asked for: completed alone arrives after the task row is terminal, page alone sends no terminal', async () => {
    const f = await fixture()
    const engine = f.engine()
    const { w2l } = client(engine)
    const only = await w2l.crawl(`${f.origin}/`, { maxPages: 3, sitemap: 'skip', webhook: { url: HOOK, events: ['completed'] } })
    await w2l.waitCrawl(only.taskId, { pollIntervalMs: 25 })
    const [delivery] = await deliveries(engine, only.taskId, 1)
    // The row read as completed was written before the event was enqueued.
    const store = SqliteTaskStore.openReadOnly(join(f.root, only.taskId))
    const task = await store.getTask(only.taskId)
    await store.close()
    expect(task?.status).toBe('completed')
    expect(delivery!.createdAt).toBeGreaterThanOrEqual(Date.parse(task!.updatedAt))
    await idle(engine)
    expect(engine.listDeliveries({ jobId: only.taskId })).toHaveLength(1)
    await f.drain()
    expect(f.requests.map((request) => request.body.event)).toEqual(['completed'])
    expect(f.requests[0]!.body.sequence).toBe(4)
    expect(f.requests[0]!.body.report).toMatchObject({ status: 'completed', pagesFetched: 3 })
    expect((await w2l.getCrawl(only.taskId)).webhook).toMatchObject({ events: ['completed'], delivered: 1, pending: 0, deadLetter: 0 })
    f.requests.length = 0
    const pagesOnly = await w2l.crawl(`${f.origin}/`, { maxPages: 2, sitemap: 'skip', webhook: { url: HOOK, events: ['page'] } })
    await w2l.waitCrawl(pagesOnly.taskId, { pollIntervalMs: 25 })
    await idle(engine)
    await f.drain()
    expect(bySequence(f.requests).map((request) => [request.body.event, request.body.sequence])).toEqual([['page', 1], ['page', 2]])
  })

  it('sends cancelled, not failed, for a cancelled batch, and nothing when the events leave cancelled out', async () => {
    const f = await fixture()
    const engine = f.engine({ workerCount: 1 })
    const { w2l } = client(engine)
    const urls = [1, 2, 3].map((n) => `${f.origin}/item/${n}`)
    const cancelled: string[] = []
    for (const webhook of [HOOK, { url: HOOK, events: ['failed' as const] }, { url: HOOK, events: ['cancelled' as const] }] satisfies BatchStartRequest['webhook'][]) {
      f.setSlow(true)
      const started = f.started()
      const { taskId } = await w2l.batchScrape(urls, { webhook })
      await started
      expect(await w2l.cancelBatch(taskId)).toMatchObject({ status: 'cancelled' })
      f.setSlow(false)
      f.release()
      cancelled.push(taskId)
    }
    // Closing waits for the three runs to end, with their terminal bookkeeping.
    await engine.close({ cancelActive: true })
    await f.drain()
    const events = (taskId: string) => f.requests.filter((request) => request.body.jobId === taskId).map((request) => [request.body.event, request.body.sequence])
    expect(events(cancelled[0]!)).toEqual([['started', 0], ['page', 1], ['cancelled', 2]])
    expect(f.requests.find((request) => request.body.jobId === cancelled[0] && request.body.event === 'cancelled')!.body).toMatchObject({ eventId: `${cancelled[0]}:cancelled`, report: { status: 'cancelled', requested: 3, completed: 1 } })
    expect(events(cancelled[1]!)).toEqual([])
    expect(f.deliveryStore.countDeliveries(`job:${cancelled[1]}`)).toEqual({ pending: 0, delivering: 0, delivered: 0, dead_letter: 0 })
    expect(events(cancelled[2]!)).toEqual([['cancelled', 2]])
    expect(f.requests.some((request) => request.body.event === 'failed')).toBe(false)
  })

  it('resumes an interrupted batch in a new process, sending the remaining pages exactly once and one completed', async () => {
    const f = await fixture()
    f.setSlow(true)
    const started = f.started()
    const first = f.engine({ workerCount: 1 })
    const urls = [1, 2, 3].map((n) => `${f.origin}/item/${n}`)
    const { taskId } = await first.startBatch({ urls, webhook: HOOK })
    await started
    await first.close({ cancelActive: true })
    await f.drain()
    expect(f.requests.map((request) => [request.body.event, request.body.sequence])).toEqual([['started', 0], ['page', 1]])
    f.setSlow(false)
    f.release()
    const second = f.engine({ workerCount: 1 })
    const { w2l } = client(second)
    expect(await w2l.getBatch(taskId)).toMatchObject({ status: expect.stringMatching(/^(paused|pending|running|completed)$/) })
    expect(await w2l.waitBatch(taskId, { pollIntervalMs: 25 })).toMatchObject({ status: 'completed', requested: 3, completed: 3 })
    await deliveries(second, taskId, 5)
    await f.drain()
    expect(f.requests).toHaveLength(5)
    expect(bySequence(f.requests).map((request) => [request.body.event, request.body.sequence])).toEqual([['started', 0], ['page', 1], ['page', 2], ['page', 3], ['completed', 4]])
    expect(byEvent(f.requests, 'page').map((request) => request.body.page!.url)).toEqual(urls)
    // The second attempt's terminal event carries the attempt id, so a job that ends twice has two distinct events.
    const completed = f.requests.find((request) => request.body.event === 'completed')!.body
    expect(completed.eventId).toBe(`${taskId}:completed:${completed.report!.attemptId}`)
    expect(f.seen.filter((path) => path === '/item/1')).toHaveLength(1)
    expect(f.seen.filter((path) => path === '/item/2')).toHaveLength(2)
    expect((await w2l.getBatch(taskId)).webhook).toMatchObject({ delivered: 5, pending: 0 })
  })

  it('offers a finished job\'s missing deliveries again when the API starts, and never a delivered one', async () => {
    const f = await fixture()
    const first = f.engine()
    const { w2l } = client(first)
    const { taskId } = await w2l.batchScrape([`${f.origin}/item/1`, `${f.origin}/item/2`], { webhook: HOOK })
    await w2l.waitBatch(taskId, { pollIntervalMs: 25 })
    await deliveries(first, taskId, 4)
    await f.drain()
    expect(f.requests).toHaveLength(4)
    await first.close()
    // As if the process had died between writing a step and enqueueing its event, and again before the terminal event.
    const db = new Database(join(f.root, 'section-b-control.sqlite'))
    const pageEvent = (db.prepare("SELECT event_id FROM webhook_deliveries WHERE destination_id=? AND event_id LIKE '%:page:%' ORDER BY event_id LIMIT 1").get(`job:${taskId}`) as { event_id: string }).event_id
    expect(db.prepare('DELETE FROM webhook_deliveries WHERE destination_id=? AND event_id IN (?, ?)').run(`job:${taskId}`, pageEvent, `${taskId}:completed`).changes).toBe(2)
    db.close()
    const second = f.engine()
    const restored = await deliveries(second, taskId, 4)
    expect(restored.filter((delivery) => delivery.state === 'pending').map((delivery) => delivery.eventId).sort()).toEqual([pageEvent, `${taskId}:completed`].sort())
    await f.drain()
    expect(f.requests).toHaveLength(6)
    expect(f.requests.slice(4).map((request) => request.body.event).sort()).toEqual(['completed', 'page'])
    expect(f.requests.slice(4).find((request) => request.body.event === 'completed')!.body).toMatchObject({ eventId: `${taskId}:completed`, sequence: 3, report: { status: 'completed', completed: 2 } })
    expect((await client(second).w2l.getBatch(taskId)).webhook).toMatchObject({ delivered: 4, pending: 0, deadLetter: 0 })
    // Started again, the engine finds everything delivered and adds nothing.
    await second.close()
    const third = f.engine()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(third.listDeliveries({ jobId: taskId })).toHaveLength(4)
  })

  it('refuses a plain-http receiver off loopback locally, and on a hosted engine any http receiver and a private https address, before anything is stored', async () => {
    const f = await fixture()
    const local = f.engine()
    const hosted = f.engine({ hosted: true, webhookPolicy: { allowHttpLoopback: false } })
    const https = 'webhook.url must be https (http is accepted only for a loopback receiver of a local service)'
    await expect(local.startCrawl({ url: `${f.origin}/`, webhook: 'http://10.0.0.5/hook' })).rejects.toMatchObject({ status: 400, code: 'invalid_request', message: https })
    await expect(local.startBatch({ urls: [`${f.origin}/item/1`], webhook: 'http://receiver.example/hook' })).rejects.toMatchObject({ status: 400, message: https })
    await expect(hosted.startCrawl({ url: `${f.origin}/`, webhook: HOOK })).rejects.toMatchObject({ status: 400, message: https })
    await expect(hosted.startBatch({ urls: [`${f.origin}/item/1`], webhook: 'https://127.0.0.1:8828/hook' })).rejects.toMatchObject({ status: 400, message: 'webhook.url must be a public address' })
    await expect(hosted.startCrawl({ url: `${f.origin}/`, webhook: 'https://169.254.169.254/hook' })).rejects.toMatchObject({ status: 400, message: 'webhook.url must be a public address' })
    const { app } = client(local)
    const refused = await app.request('/v1/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${f.origin}/`, webhook: { url: HOOK, headers: { 'content-length': '1' } } }) })
    expect(refused.status).toBe(400)
    expect(await refused.json()).toEqual({ error: 'webhook.headers: content-length is reserved', code: 'invalid_request' })
    expect(f.seen).toEqual([])
    expect(await taskDirs(f.root)).toEqual([])
    expect(local.listDeliveryDestinations()).toEqual([])
  })

  it('sends a json-format batch\'s items with their extraction in each page event, and the batch counts on completed', async () => {
    const f = await fixture()
    const engine = f.engine()
    const { w2l } = client(engine)
    const urls = [1, 2, 3].map((n) => `${f.origin}/item/${n}`)
    const { taskId } = await w2l.batchScrape(urls, { formats: [{ type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }], webhook: { url: HOOK, headers: { Authorization: 'Bearer test' }, metadata: { run: 'ex1' } } })
    expect(await w2l.waitBatch(taskId, { pollIntervalMs: 25 })).toMatchObject({ status: 'completed', requested: 3, completed: 3, succeeded: 3, failed: 0 })
    await deliveries(engine, taskId, 5)
    await f.drain()
    const ordered = bySequence(f.requests)
    expect(ordered.map((request) => [request.body.event, request.body.sequence])).toEqual([['started', 0], ['page', 1], ['page', 2], ['page', 3], ['completed', 4]])
    const pages = byEvent(f.requests, 'page').map((request) => request.body.page!)
    expect(pages.every((p) => p.json?.status === 'complete' && p.markdown === null && p.trace.length === 0)).toBe(true)
    expect(pages.map((p) => (p.json?.data as { title: string }).title).sort()).toEqual(['Fixture item 1', 'Fixture item 2', 'Fixture item 3'])
    expect(f.requests.every((request) => request.headers.authorization === 'Bearer test' && request.body.jobKind === 'batch' && request.body.metadata.run === 'ex1')).toBe(true)
    expect(ordered[4]!.body.report).toMatchObject({ status: 'completed', requested: 3, succeeded: 3, failed: 0 })
  })

  it('/fc/v1/crawl maps webhook onto the native option and its receiver gets Firecrawl\'s payload shape', async () => {
    const f = await fixture()
    const engine = f.engine()
    const { app, w2l } = client(engine)
    const res = await app.request('/fc/v1/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${f.origin}/`, limit: 2, ignoreSitemap: true, webhook: { url: HOOK, metadata: { run: 'fc1' }, headers: { 'X-Run': 'fc' } } }) })
    expect(res.status).toBe(200)
    const { id } = await res.json() as { id: string }
    await w2l.waitCrawl(id, { pollIntervalMs: 25 })
    await deliveries(engine, id, 4)
    await f.drain()
    const payloads = f.requests as unknown as Array<{ headers: Record<string, string>; body: FirecrawlWebhookPayload }>
    expect(payloads.map((p) => p.body.type).sort()).toEqual(['crawl.completed', 'crawl.page', 'crawl.page', 'crawl.started'])
    expect(payloads.every((p) => p.body.success === true && p.body.id === id && p.body.metadata.run === 'fc1' && p.headers['x-run'] === 'fc')).toBe(true)
    const pages = payloads.filter((p) => p.body.type === 'crawl.page')
    expect(pages.every((p) => p.body.data.length === 1 && typeof p.body.data[0]!.markdown === 'string' && p.body.data[0]!.metadata.sourceURL.startsWith(f.origin) && p.body.data[0]!.metadata.statusCode === 200)).toBe(true)
    expect(payloads.find((p) => p.body.type === 'crawl.started')!.body.data).toEqual([])
    // The W2L event identity still rides on the headers.
    expect(payloads.map((p) => Number(p.headers['x-w2l-event-version'])).sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
    expect(await w2l.listDeliveryDestinations({ jobId: id })).toMatchObject([{ payloadFormat: 'firecrawl', headerNames: ['x-run'] }])
    expect(JSON.stringify(payloads.map((p) => p.body))).not.toContain('w2l.job-event')
  })

  it('numbers a job\'s events the same after a restart, a terminal event its events leave out included: a later handoff takes no number already sent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'w2l-webhooks-numbering-'))
    const store = DeliveryStore.open(join(root, 'section-b-control.sqlite'))
    try {
      const hooks = () => new JobWebhooks(store, { hosted: false, allowHttpLoopback: true })
      const first = hooks()
      const webhook = first.register('t1', { url: HOOK, events: ['page'] })
      const task = { id: 't1', batch: { urls: ['https://a.test/1', 'https://a.test/2'], formats: ['markdown'], includeLinks: false, webhook } } as unknown as Task
      const steps = [{ id: 's1', result: null }, { id: 's2', result: null }] as unknown as StepRecord[]
      const taskStore = { countSteps: async () => ({ success: 2 }), listAttempts: async () => [], listSteps: async () => steps } as unknown as TaskStore
      const page = (id: string) => ({ id }) as unknown as CrawlPage
      for (const step of steps) await first.page(task, step, page(step.id), taskStore)
      await first.terminal(task, { status: 'completed', attemptId: '' } as never, taskStore)
      await first.replaced(task, steps[0]!, page('s1'), taskStore)
      // The API restarts: a new instance numbers from what the control database holds.
      await hooks().replaced(task, steps[1]!, page('s2'), taskStore)
      const sent = store.listDeliveries({ destinationId: 'job:t1' }).map((delivery) => [delivery.eventId, delivery.eventVersion]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      expect(sent).toEqual([['t1:handoff:s1', 3], ['t1:handoff:s2', 4], ['t1:page:s1', 1], ['t1:page:s2', 2]])
    } finally {
      store.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fans a job event out to every hub listener and isolates a listener that throws', async () => {
    const hub = new JobEventHub()
    const seen: string[] = []
    const off = hub.on((event) => { seen.push(`a:${event.type}`) })
    hub.on(() => { throw new Error('boom') })
    hub.on(async (event) => { seen.push(`c:${event.type}`) })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await hub.emit({ type: 'started', taskId: 't', jobKind: 'crawl' })
      off()
      await hub.emit({ type: 'started', taskId: 't', jobKind: 'batch' })
      expect(seen).toEqual(['a:started', 'c:started', 'c:started'])
      expect(errors).toHaveBeenCalledTimes(2)
      expect(hub.listenerCount).toBe(2)
    } finally { errors.mockRestore() }
  })
})
