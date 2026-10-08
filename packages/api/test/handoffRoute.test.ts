import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FetchResult } from '@w2l/contracts'
import { parseBatchHandoffRequest } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { continuedItemsRead, createApiEngine, listPagesRepeat, type ApiEngine } from '../src/engine.js'

/** POST /v1/batches/:id/handoff and what a batch says of its stopped items, without a browser: the lane answers a captcha for /gate, a rate limit for /slow, content otherwise. */

function laneResult(url: string): FetchResult {
  const blockReason = url.endsWith('/gate') ? 'captcha' : url.endsWith('/slow') ? 'rate_limit' : null
  return {
    requestedUrl: url, status: blockReason === null ? 'success' : 'blocked', failureReason: null, blockReason, budgetExceeded: null, lane: 'http',
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: 'a'.repeat(64), artifacts: [], fetchedAt: new Date().toISOString() },
    compliance: null, trace: [], escalations: [], markdown: blockReason === null ? '# Page' : null, links: [], truncated: false, truncatedAt: null,
    usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, contentTokens: 1, browserMs: null, externalCostUsd: null },
  } as unknown as FetchResult
}

describe('the handoff route', () => {
  let server: FixtureServer
  beforeAll(async () => { server = await startFixtureServer() })
  afterAll(async () => { await server.close() })
  let root: string
  let engine: ApiEngine | null = null
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  async function setup(userChrome: boolean) {
    root = await mkdtemp(join(tmpdir(), 'w2l-handoff-route-'))
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      channelsFor: (mode) => [buildChannels(mode, { localSubjects: { http: { fetch: async (url: string) => laneResult(url) }, browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!],
      ...(userChrome ? { userChrome: { userDataDir: join(root, 'no-chrome') } } : {}),
    })
    const app = createApp(engine)
    const { taskId } = await engine.startBatch({ urls: [`${server.url}/gate`, `${server.url}/slow`, `${server.url}/ok`] } as never)
    for (let i = 0; i < 200; i++) {
      const report = await engine.getBatch(taskId)
      if (report?.status === 'completed') break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return { app, taskId }
  }
  const post = async (app: ReturnType<typeof createApp>, path: string, body?: string) => {
    const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body }) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }

  it('a server that hands pages to the person says which items wait for them, and the check is one a person gets through', async () => {
    const { app, taskId } = await setup(true)
    expect(await (await app.request(`/v1/batches/${taskId}`)).json()).toMatchObject({ status: 'completed', waitingForPerson: 1 })
    const items = (await (await app.request(`/v1/batches/${taskId}/items`)).json() as { items: Array<Record<string, any>> }).items
    expect(Object.fromEntries(items.map((item) => [new URL(item.url).pathname, item.handoff?.reason ?? null]))).toEqual({ '/gate': 'captcha_required', '/slow': null, '/ok': null })
    expect(items.find((item) => item.url.endsWith('/gate'))!.handoff.rationale).toContain(`POST /v1/batches/${taskId}/handoff`)
    // Chrome is not reachable here: the answer says how to turn remote debugging on.
    const refused = await post(app, `/v1/batches/${taskId}/handoff`)
    expect(refused).toMatchObject({ status: 409, body: { code: 'conflict', error: expect.stringContaining('chrome://inspect/#remote-debugging') } })
  })

  it('a server that does not says so, and its items carry no handoff', async () => {
    const { app, taskId } = await setup(false)
    const report = await (await app.request(`/v1/batches/${taskId}`)).json() as Record<string, unknown>
    expect(report.waitingForPerson).toBeUndefined()
    const items = (await (await app.request(`/v1/batches/${taskId}/items`)).json() as { items: Array<Record<string, unknown>> }).items
    expect(items.every((item) => item.handoff === undefined)).toBe(true)
    expect(await post(app, `/v1/batches/${taskId}/handoff`)).toMatchObject({ status: 409, body: { error: expect.stringContaining('does not hand pages to a person') } })
  })

  it('a batch that asked for page actions offers no handoff: a page read in the person\'s Chrome cannot run them', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-handoff-route-'))
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      channelsFor: (mode) => [buildChannels(mode, { localSubjects: { http: { fetch: async (url: string) => laneResult(url) }, browser_local: { fetch: async (url: string) => laneResult(url) } } })[1]!],
      userChrome: { userDataDir: join(root, 'no-chrome') },
    })
    const { taskId } = await engine.startBatch({ urls: [`${server.url}/gate`], actions: [{ type: 'wait', milliseconds: 1 }] } as never)
    for (let i = 0; i < 200 && (await engine.getBatch(taskId))?.status !== 'completed'; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await engine.getBatch(taskId))?.waitingForPerson).toBeUndefined()
    expect((await engine.getBatchItems(taskId, { limit: 50 }))!.items[0]).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
    expect((await engine.getBatchItems(taskId, { limit: 50 }))!.items[0]!.handoff).toBeUndefined()
    await expect(engine.handOffBatch(taskId, {})).rejects.toThrow('asked for page actions, which a page read in your own Chrome cannot give')
  })

  it('a batch whose only step is paginate offers the handoff for a list stopped at a check alone; a page stopped before its list, a scrape, or the my-browser lane with that step stay refused', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-handoff-route-'))
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      channelsFor: (mode) => [buildChannels(mode, { localSubjects: { http: { fetch: async (url: string) => laneResult(url) }, browser_local: { fetch: async (url: string) => laneResult(url) } } })[1]!],
      userChrome: { userDataDir: join(root, 'no-chrome') },
    })
    const paginate = [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card' }]
    // Without an itemSelector no page of the list is told from another page the person opens: such a batch is not handed over.
    const { taskId: untold } = await engine.startBatch({ urls: [`${server.url}/gate`], actions: [{ type: 'paginate', nextSelector: 'a.next' }] } as never)
    for (let i = 0; i < 200 && (await engine.getBatch(untold))?.status !== 'completed'; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await engine.getBatch(untold))?.waitingForPerson).toBeUndefined()
    await expect(engine.handOffBatch(untold, {})).rejects.toThrow('page actions')
    // The stub lane stops /gate at a captcha before any list page: nothing for the person to page on from, so it is not handed over, and the count says so.
    const { taskId } = await engine.startBatch({ urls: [`${server.url}/gate`], actions: paginate } as never)
    for (let i = 0; i < 200 && (await engine.getBatch(taskId))?.status !== 'completed'; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await engine.getBatch(taskId))?.waitingForPerson).toBe(0)
    expect((await engine.getBatchItems(taskId, { limit: 50 }))!.items[0]).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
    expect((await engine.getBatchItems(taskId, { limit: 50 }))!.items[0]!.handoff).toBeUndefined()
    // Nothing to hand over: Chrome is not even asked for.
    expect(await engine.handOffBatch(taskId, {})).toMatchObject({ handedOff: 0, items: [] })
    // A single page's handoff and the my-browser lane run no steps, a paginate step included.
    const app = createApp(engine)
    expect(await post(app, '/v1/scrape', JSON.stringify({ url: `${server.url}/gate`, handoff: true, actions: paginate }))).toMatchObject({ status: 400, body: { error: expect.stringContaining('page actions') } })
    expect(await post(app, '/v1/scrape', JSON.stringify({ url: `${server.url}/gate`, lane: 'my-browser', actions: paginate }))).toMatchObject({ status: 400, body: { error: expect.stringContaining('page actions') } })
    expect(await post(app, '/v1/batches', JSON.stringify({ urls: [`${server.url}/gate`], lane: 'my-browser', actions: paginate }))).toMatchObject({ status: 400, body: { error: expect.stringContaining('page actions') } })
  })

  it('a batch with a webhook offers no handoff: a page read in the person\'s Chrome is read signed in as them, and is not sent to another address', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-handoff-route-'))
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      channelsFor: (mode) => [buildChannels(mode, { localSubjects: { http: { fetch: async (url: string) => laneResult(url) }, browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!],
      userChrome: { userDataDir: join(root, 'no-chrome') },
      webhookPolicy: { allowHttpLoopback: true },
    })
    const { taskId } = await engine.startBatch({ urls: [`${server.url}/gate`], webhook: { url: 'https://hooks.example/w' } } as never)
    for (let i = 0; i < 200 && (await engine.getBatch(taskId))?.status !== 'completed'; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await engine.getBatchItems(taskId, { limit: 50 }))!.items[0]).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
    expect((await engine.getBatch(taskId))?.waitingForPerson).toBeUndefined()
    expect((await engine.getBatchItems(taskId, { limit: 50 }))!.items[0]!.handoff).toBeUndefined()
    await expect(engine.handOffBatch(taskId, {})).rejects.toThrow('has a webhook: a page read in your own Chrome is read signed in as you')
  })

  it('W2L closing while Chrome asks the person to Allow drops the connection at once', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-handoff-route-'))
    const chromeDir = join(root, 'chrome')
    await mkdir(chromeDir, { recursive: true })
    await writeFile(join(chromeDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    let cancelled = false
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      channelsFor: (mode) => [buildChannels(mode, { localSubjects: { http: { fetch: async (url: string) => laneResult(url) }, browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!],
      // Chrome holding the handshake until the person clicks Allow, which they never do.
      userChrome: { userDataDir: chromeDir, connect: (_endpoint, _timeout, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => { cancelled = true; reject(new Error('cancelled')) })) },
    })
    const { taskId } = await engine.startBatch({ urls: [`${server.url}/gate`] } as never)
    for (let i = 0; i < 200 && (await engine.getBatch(taskId))?.status !== 'completed'; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    const handing = engine.handOffBatch(taskId, {}).catch((error: unknown) => error)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const started = Date.now()
    await engine.close()
    engine = null
    expect(Date.now() - started).toBeLessThan(3_000)
    expect(cancelled).toBe(true)
    expect(await handing).toBeInstanceOf(Error)
  })

  it('refuses a malformed request, and answers 404 for a batch it has not', async () => {
    const { app, taskId } = await setup(true)
    expect(await post(app, `/v1/batches/${taskId}/handoff`, JSON.stringify({ waitMs: 5 }))).toMatchObject({ status: 400 })
    expect(await post(app, `/v1/batches/${taskId}/handoff`, JSON.stringify({ urls: [] }))).toMatchObject({ status: 400, body: { error: 'unsupported handoff option: urls' } })
    expect(await post(app, '/v1/batches/nope/handoff')).toMatchObject({ status: 404 })
  })
})

describe('a scrape handed to the person', () => {
  let server: FixtureServer
  let root: string
  let engine: ApiEngine | null = null
  beforeAll(async () => { server = await startFixtureServer() })
  afterAll(async () => { await server.close() })
  afterEach(async () => { await engine?.close(); engine = null; await rm(root, { recursive: true, force: true }) })

  async function setup(userChrome: boolean) {
    root = await mkdtemp(join(tmpdir(), 'w2l-scrape-handoff-'))
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      channelsFor: (mode) => [buildChannels(mode, { localSubjects: { http: { fetch: async (url: string) => laneResult(url) }, browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!],
      ...(userChrome ? { userChrome: { userDataDir: join(root, 'no-chrome') } } : {}),
    })
    return createApp(engine)
  }
  const scrape = async (app: ReturnType<typeof createApp>, body: Record<string, unknown>) => {
    const res = await app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }

  it('a stopped page says how it can be handed over, on a server that offers it, and only for a check a person gets through', async () => {
    const app = await setup(true)
    const stopped = await scrape(app, { url: `${server.url}/gate` })
    expect(stopped.body).toMatchObject({ status: 'blocked', blockReason: 'captcha', handoff: { reason: 'captcha_required', liveViewUrl: null, rationale: expect.stringContaining('handoff: true') } })
    expect((await scrape(app, { url: `${server.url}/gate`, debug: true })).body.handoff).toMatchObject({ reason: 'captcha_required' })
    expect((await scrape(app, { url: `${server.url}/slow` })).body.handoff).toBeUndefined()
    expect((await scrape(app, { url: `${server.url}/ok` })).body.handoff).toBeUndefined()
  })

  it('a server that does not hand pages over refuses the option by name, and gives no hint', async () => {
    const app = await setup(false)
    expect(await scrape(app, { url: `${server.url}/gate`, handoff: true })).toMatchObject({ status: 400, body: { code: 'unsupported_parameter', details: { parameters: ['handoff'] } } })
    expect((await scrape(app, { url: `${server.url}/gate` })).body.handoff).toBeUndefined()
  })

  it('refuses it beside actions or a screenshot, and in a malformed shape', async () => {
    const app = await setup(true)
    expect(await scrape(app, { url: `${server.url}/gate`, handoff: true, actions: [{ type: 'wait', milliseconds: 1 }] })).toMatchObject({ status: 400, body: { error: expect.stringContaining('page actions') } })
    expect(await scrape(app, { url: `${server.url}/gate`, handoff: true, formats: ['screenshot'] })).toMatchObject({ status: 400, body: { error: expect.stringContaining('a screenshot') } })
    expect(await scrape(app, { url: `${server.url}/gate`, handoff: 'yes' })).toMatchObject({ status: 400, body: { error: 'handoff must be true or { waitMs }' } })
    expect(await scrape(app, { url: `${server.url}/gate`, handoff: { waitMs: 5 } })).toMatchObject({ status: 400 })
  })

  it('a handoff that cannot reach Chrome answers the stopped page, with why and the hint', async () => {
    const app = await setup(true)
    const res = await scrape(app, { url: `${server.url}/gate`, handoff: true })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'blocked', handoff: { reason: 'captcha_required' } })
    expect(res.body.warnings.map((warning: { code: string }) => warning.code)).toContain('handoff_not_through')
    expect(res.body.warning).toContain('chrome://inspect/#remote-debugging')
  })
})

describe('a continued list\'s itemsRead', () => {
  const page = (url: string, items: number | null = 3) => ({ url: `https://site.test${url}`, items })
  it('sums the kept pages and the person\'s only when the pages have addresses of their own and every count is known', () => {
    // Indeed, seen 2026-10-09: one kept page, the check at page 2, each page the person showed at its own offset.
    expect(continuedItemsRead({ stepUrl: 'https://site.test/jobs?q=x', checkUrl: 'https://site.test/jobs?q=x&start=10&pp=t', kept: ['https://site.test/jobs?q=x&vjk=1'], keptItems: 16, shown: [page('/jobs?q=x&start=10&vjk=2', 16), page('/jobs?q=x&start=20&vjk=3', 16)] })).toBe(48)
  })

  it('is unknown when a sum could count a page twice', () => {
    // A pager that reloads its items in place, at a list address the site redirected (the review's case): the kept pages share one address.
    expect(continuedItemsRead({ stepUrl: 'https://site.test/a?q=x', checkUrl: 'https://site.test/a?q=x&s=1', kept: ['https://site.test/a?q=x&s=1', 'https://site.test/a?q=x&s=1'], keptItems: 6, shown: [page('/a?q=x&s=1'), page('/a?q=x&s=1'), page('/a?q=x&s=1')] })).toBeNull()
    // One kept page, the check at its address: the pager has none of its own.
    expect(continuedItemsRead({ stepUrl: 'https://site.test/l', checkUrl: 'https://site.test/l?v=2', kept: ['https://site.test/l?v=2'], keptItems: 3, shown: [page('/l?v=2')] })).toBeNull()
    // The check at the list's own address: the kept pages are shown again on the way.
    expect(continuedItemsRead({ stepUrl: 'https://site.test/l', checkUrl: 'https://site.test/l', kept: ['https://site.test/l?p=1'], keptItems: 3, shown: [page('/l?p=2')] })).toBeNull()
    // The person paged back to a kept page.
    expect(continuedItemsRead({ stepUrl: 'https://site.test/l', checkUrl: 'https://site.test/l?p=2', kept: ['https://site.test/l?p=1'], keptItems: 3, shown: [page('/l?p=2'), page('/l?p=1')] })).toBeNull()
  })

  it('tells a page shown again at an address of its own by its items: a result set tied to the session that made it', () => {
    const cards = (n: number) => `<html><body><main>${[1, 2, 3].map((i) => `<div class="card"><a href="/item/${n * 10 + i}">Item ${n * 10 + i}</a><span class="price">${n * 10 + i}.00</span></div>`).join('')}</main></body></html>`
    const at = (url: string, n: number) => ({ url: `https://site.test${url}`, html: cards(n) })
    expect(listPagesRepeat([at('/s?rs=A&p=1', 1), at('/s?rs=A&p=2', 2), at('/s?rs=A&p=3', 3)], 'div.card')).toBe(false)
    // Kept pages 1 and 2 under rs=A; the person's session starts a new set, rs=C, and pages through 1 and 2 again.
    expect(listPagesRepeat([at('/s?rs=A&p=1', 1), at('/s?rs=A&p=2', 2), at('/s?rs=C&p=1', 1), at('/s?rs=C&p=2', 2), at('/s?rs=C&p=3', 3)], 'div.card')).toBe(true)
    // Pages with no item: each adds none to a sum, so none can be counted twice.
    expect(listPagesRepeat([at('/s?p=1', 1), at('/s?p=2', 2)], 'div.none')).toBe(false)
  })

  it('is unknown when a count is', () => {
    expect(continuedItemsRead({ stepUrl: 'https://site.test/l', checkUrl: 'https://site.test/l?p=2', kept: ['https://site.test/l?p=1'], keptItems: 3, shown: [page('/l?p=2', null)] })).toBeNull()
    expect(continuedItemsRead({ stepUrl: 'https://site.test/l', checkUrl: 'https://site.test/l?p=2', kept: ['https://site.test/l?p=1'], keptItems: null, shown: [page('/l?p=2')] })).toBeNull()
  })
})

describe('parseBatchHandoffRequest', () => {
  it('takes a wait of 10 s to 30 min, or none', () => {
    expect(parseBatchHandoffRequest(undefined)).toEqual({})
    expect(parseBatchHandoffRequest({ waitMs: 60_000 })).toEqual({ waitMs: 60_000 })
    expect(() => parseBatchHandoffRequest({ waitMs: 1_800_001 })).toThrow('waitMs must be an integer from 10000 to 1800000')
    expect(() => parseBatchHandoffRequest([])).toThrow('body must be a JSON object')
  })
})
