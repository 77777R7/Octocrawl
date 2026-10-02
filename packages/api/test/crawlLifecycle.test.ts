import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy, type CrawlReport, type Task } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { SqliteTaskStore } from '@w2l/runtime'
import { W2L } from '@w2l/sdk'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine, type ApiEngineOptions } from '../src/engine.js'

const LETTERS = ['/a', '/b', '/c', '/d']
const ASSETS = ['/logo.png', '/site.css', '/app.js']
const DOCUMENTS = ['/report.pdf', '/data.csv']

/** `/` links to four pages, three assets, two documents and another host; each page links on to `/deep/...` and back. */
function page(path: string): string {
  const links = path === '/' ? [...LETTERS, ...ASSETS, ...DOCUMENTS, 'http://elsewhere.invalid/away'] : path.startsWith('/deep/') ? [] : [`/deep${path}`, '/']
  return `<!doctype html><html><head><title>Page ${path}</title></head><body><main><article><h1>Page ${path}</h1><p>This is page ${path} of a small crawl fixture. It carries enough prose for the extraction cascade to take it as the main content of an article, so every page here is a contentful success.</p><ul>${links.map((href) => `<li><a href="${href}">${href}</a></li>`).join('')}</ul></article></main></body></html>`
}

async function waitFor(engine: ApiEngine, taskId: string, done: (report: CrawlReport) => boolean): Promise<CrawlReport> {
  for (let i = 0; i < 400; i++) {
    const report = await engine.getCrawl(taskId)
    if (report !== null && done(report)) return report
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`crawl ${taskId} never reached the expected state`)
}

describe('crawl lifecycle', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  /** One site on 127.0.0.1 and ::1 (so `localhost` reaches it); `/start` redirects to `http://localhost:<port>/`. */
  async function site(options: { robots?: string; gate?: string; missing?: string; twin?: string } = {}) {
    const root = await mkdtemp(join(tmpdir(), 'w2l-crawl-life-'))
    const seen: Array<{ host: string; path: string; at: number }> = []
    let open = false
    let release!: () => void
    const released = new Promise<void>((resolve) => { release = () => { open = true; resolve() } })
    let reached!: () => void
    const reachedGate = new Promise<void>((resolve) => { reached = resolve })
    let port = 0
    const handler = async (req: IncomingMessage, res: ServerResponse) => {
      const path = req.url ?? '/'
      if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end(options.robots ?? 'User-agent: *\nAllow: /\n'); return }
      seen.push({ host: (req.headers.host ?? '').replace(/:\d+$/, ''), path, at: Date.now() })
      if (path === '/start') { res.writeHead(301, { location: `http://localhost:${port}/` }).end(); return }
      if (path === options.missing) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<h1>Not found</h1>'); return }
      if (path === options.twin) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('/')); return }
      if (path === options.gate && !open) { reached(); await released }
      if (res.destroyed) return
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(path))
    }
    const v4 = createServer(handler)
    await new Promise<void>((resolve) => v4.listen(0, '127.0.0.1', resolve))
    port = (v4.address() as AddressInfo).port
    const v6 = createServer(handler)
    await new Promise<void>((resolve) => { v6.once('error', () => resolve()); v6.listen(port, '::1', resolve) })
    cleanup.push(async () => {
      release()
      for (const server of [v4, v6].filter((s) => s.listening)) {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
      await rm(root, { recursive: true, force: true })
    })
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const engine = (extra: Partial<ApiEngineOptions> = {}): ApiEngine => {
      const created = createApiEngine({
        taskRoot: root,
        networkPolicy: policy,
        workerCount: 2,
        channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('crawl lifecycle tests stay on HTTP') } } } }),
        ...extra,
      })
      cleanup.push(async () => { release(); await created.close({ cancelActive: true }) })
      return created
    }
    return { origin: `http://127.0.0.1:${port}`, root, seen, engine, reachedGate, release: () => release() }
  }

  /** A crawl task written as a crashed, failed or older process left it, with no pages yet. */
  async function storedCrawl(root: string, origin: string, status: Task['status'], legacy = false): Promise<string> {
    const id = crypto.randomUUID()
    const at = new Date().toISOString()
    const store = SqliteTaskStore.open(join(root, id))
    try {
      const options = { formats: ['markdown' as const], includeLinks: false, includePaths: [], excludePaths: [] }
      await store.putTask({
        id, seedUrl: `${origin}/`, taskDir: join(root, id), mode: 'standard', status,
        budget: { maxPages: 2, maxWallMs: null, maxCostUsd: null, maxTokens: null },
        crawl: legacy ? options : { ...options, maxDepth: 1, allowlistedDomains: [], useCached: false },
        createdAt: at, updatedAt: at,
      })
      await store.putAttempt({
        id: crypto.randomUUID(), taskId: id, status: status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'interrupted',
        startedAt: at, endedAt: status === 'running' ? null : at, pagesFetched: 0, wallMs: 0, costUsd: null, costUnknown: true, contentTokens: 0, budgetExceeded: null,
      })
    } finally {
      await store.close()
    }
    return id
  }

  it('follows links on the host the seed redirected to, never fetches asset links or other hosts, keeps documents', async () => {
    const s = await site()
    const engine = s.engine()
    const { taskId } = await engine.startCrawl({ url: `${s.origin}/start`, maxDepth: 1 })
    const report = await waitFor(engine, taskId, (r) => r.status === 'completed')
    const fetched = s.seen.map((request) => `${request.host}${request.path}`)
    expect(fetched).toEqual(expect.arrayContaining(['127.0.0.1/start', 'localhost/', ...[...LETTERS, ...DOCUMENTS].map((path) => `localhost${path}`)]))
    expect(fetched.filter((path) => ASSETS.some((asset) => path.endsWith(asset)))).toEqual([])
    expect(report.pagesFetched).toBe(1 + LETTERS.length + DOCUMENTS.length)
  })

  it('holds a hosted crawl to the server limit: an omitted or null maxPages takes it, a larger one is refused', async () => {
    const s = await site()
    const hosted = s.engine({ defaultMaxPages: 2 })
    for (const maxPages of [undefined, null, 2]) {
      const { taskId } = await hosted.startCrawl({ url: `${s.origin}/`, maxDepth: 1, maxPages })
      expect(await waitFor(hosted, taskId, (r) => r.status === 'completed'), String(maxPages)).toMatchObject({ budgetExceeded: 'pages', pagesFetched: 2 })
    }
    await expect(hosted.startCrawl({ url: `${s.origin}/`, maxPages: 3 })).rejects.toMatchObject({ code: 'invalid_request', message: 'maxPages must be at most 2 on this server' })
    // A local server has no limit: null stays unbounded.
    const local = s.engine()
    const { taskId } = await local.startCrawl({ url: `${s.origin}/`, maxDepth: 1, maxPages: null })
    expect((await waitFor(local, taskId, (r) => r.status === 'completed')).pagesFetched).toBe(1 + LETTERS.length + DOCUMENTS.length)
  })

  it('counts pages while the crawl runs; pages carry audit and trace only with debug=true', async () => {
    const s = await site({ gate: '/b' })
    const engine = s.engine({ workerCount: 1 })
    const app = createApp(engine)
    const { taskId } = await engine.startCrawl({ url: `${s.origin}/`, maxDepth: 1 })
    await s.reachedGate
    expect(await (await app.request(`/v1/crawl/${taskId}`)).json()).toMatchObject({ status: 'running', pagesFetched: 2 })
    const plain = await (await app.request(`/v1/crawl/${taskId}/pages`)).json() as { items: Array<{ url: string; audit?: unknown; trace: unknown[] }> }
    expect(plain.items.map((item) => new URL(item.url).pathname)).toEqual(['/', '/a'])
    expect(plain.items.every((item) => item.audit === undefined && item.trace.length === 0)).toBe(true)
    const debug = await (await app.request(`/v1/crawl/${taskId}/pages?debug=true`)).json() as { items: Array<{ audit?: unknown; trace: Array<{ event: string }> }> }
    expect(debug.items.every((item) => item.audit !== undefined && item.trace.some((event) => event.event === 'robots_checked'))).toBe(true)
    s.release()
    await waitFor(engine, taskId, (r) => r.status === 'completed')
  })

  it('resumes a crawl paused by shutdown on the next start, with its budget, depth, path filters and formats', async () => {
    const s = await site({ gate: '/a' })
    const first = s.engine({ workerCount: 1 })
    const { taskId } = await first.startCrawl({ url: `${s.origin}/`, maxPages: 3, maxDepth: 1, excludePaths: ['^/b$'], formats: ['markdown', 'links'] })
    await s.reachedGate
    await first.close({ cancelActive: true })
    expect((await first.getCrawl(taskId))?.status).toBe('paused')
    s.release()

    const second = s.engine({ workerCount: 1 })
    expect(await waitFor(second, taskId, (r) => r.status === 'completed')).toMatchObject({ budgetExceeded: 'pages', pagesFetched: 3 })
    expect(s.seen.map((request) => request.path).filter((path) => path === '/b' || path.startsWith('/deep/'))).toEqual([])
    const store = SqliteTaskStore.openReadOnly(join(s.root, taskId))
    try {
      expect(new Set((await store.listSteps(taskId)).map((step) => new URL(step.canonicalUrl).pathname))).toEqual(new Set(['/', '/a', '/c']))
    } finally {
      await store.close()
    }
    expect((await second.getCrawlPages(taskId, { limit: 10 }))?.items.every((item) => (item.links?.length ?? 0) > 0)).toBe(true)
  })

  it('resumes on start a crawl a crash left running; POST /v1/crawl/:id/resume restarts a failed one and refuses the rest', async () => {
    const s = await site()
    const crashed = await storedCrawl(s.root, s.origin, 'running')
    const failed = await storedCrawl(s.root, s.origin, 'failed')
    const older = await storedCrawl(s.root, s.origin, 'paused', true)
    const app = createApp(s.engine())
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    expect(await client.waitCrawl(crashed, { pollIntervalMs: 25, timeoutMs: 10_000 })).toMatchObject({ status: 'completed', pagesFetched: 2 })
    expect((await client.getCrawl(failed)).status).toBe('failed')
    // A task stored before its options were kept is never resumed with guessed limits.
    expect((await client.getCrawl(older)).status).toBe('paused')

    expect(await client.resumeCrawl(failed)).toEqual({ taskId: failed })
    expect(await client.waitCrawl(failed, { pollIntervalMs: 25, timeoutMs: 10_000 })).toMatchObject({ status: 'completed', pagesFetched: 2 })
    const again = await app.request(`/v1/crawl/${failed}/resume`, { method: 'POST' })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'conflict', error: expect.stringContaining('completed') })
    expect(await (await app.request(`/v1/crawl/${older}/resume`, { method: 'POST' })).json()).toMatchObject({ code: 'conflict' })
    expect((await app.request('/v1/crawl/no-such-task/resume', { method: 'POST' })).status).toBe(404)
  })

  it('crawlAndWait keeps waiting through a 503 and a dropped connection while it polls, then lists every page', async () => {
    const s = await site()
    const app = createApp(s.engine())
    const faults = ['503', 'network']
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST' && /^\/v1\/crawl\/[^/]+$/.test(new URL(String(input)).pathname)) {
        const fault = faults.shift()
        if (fault === '503') return new Response('restarting', { status: 503 })
        if (fault === 'network') throw new TypeError('fetch failed')
      }
      return app.request(String(input), init)
    }) as typeof fetch })
    const result = await client.crawlAndWait(`${s.origin}/`, { maxPages: 3 }, { pollIntervalMs: 25, timeoutMs: 20_000 })
    expect(faults).toEqual([])
    expect(result.report).toMatchObject({ status: 'completed', pagesFetched: 3 })
    expect(result.pages.map((page) => new URL(page.url).pathname)).toHaveLength(3)
    expect(result.errors).toEqual([])
  })

  it('/fc crawl status counts done and queued pages while the crawl runs, pages its data with next, and says cancelled', async () => {
    const s = await site({ gate: '/b' })
    const engine = s.engine({ workerCount: 1 })
    const app = createApp(engine)
    const read = async (path: string) => {
      const res = await app.request(path)
      return { status: res.status, body: await res.json() as { status: string; completed: number; total: number | null; next?: string; data: Array<{ metadata: { sourceURL: string } }> } }
    }
    const paths = (data: Array<{ metadata: { sourceURL: string } }>) => data.map((page) => new URL(page.metadata.sourceURL).pathname)
    const { taskId } = await engine.startCrawl({ url: `${s.origin}/`, maxDepth: 1 })
    await s.reachedGate
    // `/` and `/a` are done, `/b` is in flight, `/c`, `/d` and the two documents are queued.
    const first = await read(`/fc/v1/crawl/${taskId}?limit=1`)
    expect(first).toMatchObject({ status: 200, body: { status: 'scraping', completed: 2, total: 7, creditsUsed: null, expiresAt: null } })
    expect(paths(first.body.data)).toEqual(['/'])
    const next = new URL(first.body.next!)
    expect(next.pathname).toBe(`/fc/v1/crawl/${taskId}`)
    expect(next.searchParams.get('limit')).toBe('1')
    const second = await read(`${next.pathname}${next.search}`)
    expect(paths(second.body.data)).toEqual(['/a'])
    // While the crawl runs there is always a next page; it stays put until a page arrives.
    const third = await read(new URL(second.body.next!).pathname + new URL(second.body.next!).search)
    expect(third.body).toMatchObject({ status: 'scraping', data: [], next: second.body.next })

    expect(await read(`/fc/v1/crawl/${taskId}?skip=1`)).toMatchObject({ status: 400, body: { success: false, code: 'unsupported_parameter', details: { parameters: ['skip'] } } })
    for (const query of ['limit=0', 'limit=1001', 'cursor=nope']) expect(await read(`/fc/v1/crawl/${taskId}?${query}`)).toMatchObject({ status: 400, body: { success: false, code: 'invalid_request' } })

    await engine.cancelCrawl(taskId)
    s.release()
    await waitFor(engine, taskId, (r) => r.status === 'cancelled')
    const cancelled = await read(`/fc/v1/crawl/${taskId}`)
    expect(cancelled.body).toMatchObject({ status: 'cancelled', completed: 2, total: 2 })
    expect(paths(cancelled.body.data)).toEqual(['/', '/a'])
    expect(cancelled.body).not.toHaveProperty('next')
  })

  it('/fc crawl status: failed and duplicate pages count in total, not completed; total is unknown while a crawl is paused', async () => {
    const s = await site({ gate: '/a', missing: '/c', twin: '/d' })
    const first = s.engine({ workerCount: 1 })
    const { taskId } = await first.startCrawl({ url: `${s.origin}/`, maxDepth: 1 })
    await s.reachedGate
    await first.close({ cancelActive: true })
    expect(await (await createApp(first).request(`/fc/v1/crawl/${taskId}`)).json()).toMatchObject({ status: 'scraping', completed: 1, total: null })
    s.release()

    const second = s.engine({ workerCount: 1 })
    await waitFor(second, taskId, (r) => r.status === 'completed')
    const app = createApp(second)
    const page1 = await (await app.request(`/fc/v1/crawl/${taskId}?limit=4`)).json() as { status: string; completed: number; total: number; next?: string; data: Array<{ metadata: { sourceURL: string; statusCode: number | null; error?: string } }> }
    // `/c` is a 404: a data entry with metadata.error, not completed. `/d` repeats `/`: counted in total and in the
    // native discovery, left out of data (its content is the entry for `/`).
    expect(page1).toMatchObject({ status: 'completed', completed: 5, total: 7 })
    const next = new URL(page1.next!)
    const page2 = await (await app.request(`${next.pathname}${next.search}`)).json() as typeof page1
    expect(page2).not.toHaveProperty('next')
    const data = [...page1.data, ...page2.data]
    expect(data).toHaveLength(6)
    expect(new Set(data.map((page) => new URL(page.metadata.sourceURL).pathname))).toEqual(new Set(['/', '/a', '/b', '/c', ...DOCUMENTS]))
    expect(data.find((page) => page.metadata.sourceURL.endsWith('/c'))?.metadata).toMatchObject({ statusCode: 404, error: 'http_error' })
    expect(data.filter((page) => page.metadata.error === undefined)).toHaveLength(page1.completed)
    expect((await second.getCrawl(taskId))?.discovery).toMatchObject({ duplicateContent: 1 })
    // The native page list leaves it out too, unless asked for.
    const pathsOf = (items: Array<{ url: string }>) => items.map((item) => new URL(item.url).pathname).sort()
    expect(pathsOf((await second.getCrawlPages(taskId, { limit: 10 }))!.items)).toEqual(['/', '/a', '/b', ...DOCUMENTS].sort())
    expect(pathsOf((await second.getCrawlPages(taskId, { limit: 10, includeDuplicates: true }))!.items)).toEqual(['/', ...LETTERS.filter((path) => path !== '/c'), ...DOCUMENTS].sort())
  })

  it('waits the robots.txt Crawl-delay between page starts and records the delay it applied', async () => {
    const s = await site({ robots: 'User-agent: *\nCrawl-delay: 0.5\n' })
    const engine = s.engine()
    const { taskId } = await engine.startCrawl({ url: `${s.origin}/`, maxPages: 3 })
    await waitFor(engine, taskId, (r) => r.status === 'completed')
    const pages = (await engine.getCrawlPages(taskId, { limit: 10, debug: true }))!.items
    const delays = pages
      .map((item) => item.trace.find((event) => event.event === 'crawl_delay')?.detail as { startedAt: string; observedDelayMs: number | null; requiredDelayMs: number; robotsCrawlDelayMs: number | null })
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    expect(delays).toHaveLength(3)
    expect(delays[0]).toMatchObject({ previousStartedAt: null, robotsCrawlDelayMs: null })
    expect(delays.slice(1).every((delay) => delay.robotsCrawlDelayMs === 500 && delay.requiredDelayMs === 500 && delay.observedDelayMs! >= 500)).toBe(true)
    // The site sees the spacing too (less the first page's own robots.txt lookup).
    const arrivals = s.seen.map((request) => request.at)
    expect(arrivals.slice(1).map((at, i) => at - arrivals[i]!).every((gap) => gap >= 450)).toBe(true)
  })
})
