import { describe, expect, it } from 'vitest'
import { W2L, W2LError, WaitTimeoutError, type CreateMonitorRequest } from '../src/index.js'

describe('W2L SDK', () => {
  it('posts scrape and crawl to the native paths', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    const client = new W2L({
      baseUrl: 'http://127.0.0.1:8787/',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const body = init?.body === undefined ? null : JSON.parse(String(init.body))
        calls.push({ method: init?.method ?? 'GET', url, body })
        if (url.endsWith('/v1/scrape')) {
          return new Response(JSON.stringify({ status: 'success', markdown: 'ok', requestedUrl: body.url }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.endsWith('/v1/crawl')) {
          return new Response(JSON.stringify({ taskId: 'task-1' }), {
            status: 202,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.includes('/pages')) {
          return new Response(JSON.stringify({ items: [{ id: 'step-1' }], nextCursor: null, hasMore: false }), { status: 200 })
        }
        if (url.includes('/errors')) {
          return new Response(JSON.stringify({ items: [], nextCursor: null, hasMore: false }), { status: 200 })
        }
        if (url.includes('/cancel')) {
          return new Response(JSON.stringify({ taskId: 'task-1', status: 'cancelled' }), { status: 200 })
        }
        if (url.endsWith('/resume')) {
          return new Response(JSON.stringify({ taskId: 'task-1' }), { status: 202 })
        }
        return new Response(JSON.stringify({ taskId: 'task-1', status: 'completed', pagesFetched: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }) as typeof fetch,
    })

    const scraped = await client.scrape('https://example.com/')
    expect(scraped.status).toBe('success')
    const accepted = await client.crawl('https://example.com/', { maxPages: 20 })
    expect(accepted.taskId).toBe('task-1')
    const report = await client.getCrawl('task-1')
    expect(report.pagesFetched).toBe(1)
    expect((await client.getCrawlPages('task-1', { limit: 1 })).items).toHaveLength(1)
    expect((await client.getCrawlErrors('task-1')).items).toEqual([])
    expect((await client.cancelCrawl('task-1')).status).toBe('cancelled')
    expect(await client.resumeCrawl('task-1')).toEqual({ taskId: 'task-1' })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://127.0.0.1:8787/v1/scrape',
      'POST http://127.0.0.1:8787/v1/crawl',
      'GET http://127.0.0.1:8787/v1/crawl/task-1',
      'GET http://127.0.0.1:8787/v1/crawl/task-1/pages?limit=1',
      'GET http://127.0.0.1:8787/v1/crawl/task-1/errors',
      'POST http://127.0.0.1:8787/v1/crawl/task-1/cancel',
      'POST http://127.0.0.1:8787/v1/crawl/task-1/resume',
    ])
  })

  it('sends Authorization when a token is configured', async () => {
    const headers: string[] = []
    const client = new W2L({
      baseUrl: 'http://127.0.0.1:8787',
      token: 'secret',
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers)
        headers.push(h.get('authorization') ?? '')
        return new Response(JSON.stringify({ status: 'success', markdown: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }) as typeof fetch,
    })
    await client.scrape('https://example.com/')
    expect(headers).toEqual(['Bearer secret'])
  })

  it('uses the Monitor and Delivery routes, payloads, filters and control actions', async () => {
    const calls: { method: string; path: string; body: unknown }[] = []
    const client = new W2L({ baseUrl: 'http://localhost:8787', fetch: (async (input, init) => {
      const url = new URL(String(input))
      const path = `${url.pathname}${url.search}`
      calls.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : null })
      const created = init?.method === 'POST' && ['/v1/monitors', '/v1/monitors/catalog/revisions', '/v1/delivery/destinations'].includes(path)
      return new Response('{}', { status: created ? 201 : 200 })
    }) as typeof fetch })
    const monitor: CreateMonitorRequest = {
      monitorId: 'catalog', revision: 1, url: 'https://example.com/catalog', ruleVersion: 'catalog/v1',
      intervalMs: 60_000, staleAfterMs: 120_000,
      config: { adapter: 'markdown-sections/v1', workspaceId: 'demo', entityKey: 'catalog', viewKey: 'public',
        expectedTitle: 'Catalog', schemaVersion: 'v1', captureMode: 'http', conditionalRequests: true,
        fields: [{ name: 'price', heading: 'Price', type: 'decimal', required: true }] },
    }
    await client.createMonitor(monitor)
    const { monitorId: _monitorId, ...revision } = monitor
    await client.reviseMonitor('catalog', { ...revision, revision: 2 })
    await client.listMonitors()
    await client.getMonitor('catalog')
    await client.runMonitor('catalog', { triggerKey: 'manual:one' })
    await client.pauseMonitor('catalog')
    await client.resumeMonitor('catalog')
    await client.cancelMonitorRun('catalog', 'run/one')
    await client.createDeliveryDestination({ id: 'inbox', monitorId: 'catalog', url: 'https://example.com/webhook' })
    await client.listDeliveryDestinations({ monitorId: 'catalog' })
    await client.pauseDeliveryDestination('inbox')
    await client.resumeDeliveryDestination('inbox')
    await client.listDeliveries({ monitorId: 'catalog', destinationId: 'inbox', state: 'pending' })
    await client.getDelivery('delivery/one')
    await client.retryDelivery('delivery/one')
    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /v1/monitors', 'POST /v1/monitors/catalog/revisions', 'GET /v1/monitors',
      'GET /v1/monitors/catalog', 'POST /v1/monitors/catalog/run', 'POST /v1/monitors/catalog/pause',
      'POST /v1/monitors/catalog/resume', 'POST /v1/monitors/catalog/runs/run%2Fone/cancel',
      'POST /v1/delivery/destinations', 'GET /v1/delivery/destinations?monitorId=catalog',
      'POST /v1/delivery/destinations/inbox/pause', 'POST /v1/delivery/destinations/inbox/resume',
      'GET /v1/deliveries?monitorId=catalog&destinationId=inbox&state=pending',
      'GET /v1/deliveries/delivery%2Fone', 'POST /v1/deliveries/delivery%2Fone/retry',
    ])
    expect(calls[0]?.body).toEqual(monitor)
    expect(calls[4]?.body).toEqual({ triggerKey: 'manual:one' })
  })

  it('forwards cancellation signals for GET, POST and every crawl page request', async () => {
    const controller = new AbortController()
    const signals: (AbortSignal | null | undefined)[] = []
    let page = 0
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input, init) => {
      signals.push(init?.signal)
      if (String(input).includes('/pages')) {
        page++
        return new Response(JSON.stringify({ items: [{ id: `page-${page}` }], hasMore: page === 1, nextCursor: page === 1 ? 'next' : null }))
      }
      return new Response('{}')
    }) as typeof fetch })
    const request = { signal: controller.signal }
    await client.getMonitor('catalog', request)
    await client.runMonitor('catalog', {}, request)
    const ids: string[] = []
    for await (const item of client.listCrawlPages('crawl', { limit: 1 }, request)) ids.push(item.id)
    expect(ids).toEqual(['page-1', 'page-2'])
    expect(signals).toHaveLength(4)
    expect(signals.every((signal) => signal === controller.signal)).toBe(true)
  })

  it('stops a crawl iterator when cancelled between items', async () => {
    const controller = new AbortController()
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async () => new Response(JSON.stringify({
      items: [{ id: 'one' }, { id: 'two' }], hasMore: false, nextCursor: null,
    }))) as typeof fetch })
    const iterator = client.listCrawlPages('crawl', {}, { signal: controller.signal })
    expect((await iterator.next()).value).toEqual({ id: 'one' })
    controller.abort()
    await expect(iterator.next()).rejects.toThrow()
  })

  it('waits for a crawl to finish, and stops waiting after timeoutMs', async () => {
    const statuses = ['pending', 'running', 'completed']
    const urls: string[] = []
    const client = new W2L({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: (async (input: RequestInfo | URL) => {
        urls.push(String(input))
        return new Response(JSON.stringify({ taskId: 'crawl-1', status: statuses[Math.min(urls.length - 1, 2)] }), { status: 200 })
      }) as typeof fetch,
    })
    await expect(client.waitCrawl('crawl-1', { pollIntervalMs: 1 })).resolves.toMatchObject({ status: 'completed' })
    expect(urls).toEqual(Array(3).fill('http://127.0.0.1:8787/v1/crawl/crawl-1'))

    const stuck = new W2L({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: (async () => new Response(JSON.stringify({ taskId: 'batch-1', status: 'running' }), { status: 200 })) as typeof fetch,
    })
    const error = await stuck.waitBatch('batch-1', { pollIntervalMs: 5, timeoutMs: 30 }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(WaitTimeoutError)
    expect(error).toMatchObject({ taskId: 'batch-1', last: { status: 'running' }, timeoutMs: 30 })
  })

  it('preserves API error status and body for read and mutation failures', async () => {
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async () => new Response('{"error":"monitor paused"}', { status: 409 })) as typeof fetch })
    await expect(client.getMonitor('catalog')).rejects.toThrow('GET /v1/monitors/catalog failed: 409 {"error":"monitor paused"}')
    await expect(client.runMonitor('catalog')).rejects.toThrow('POST /v1/monitors/catalog/run failed: 409 {"error":"monitor paused"}')
  })

  it('throws W2LError with status, code, route and parsed body, keeping the message', async () => {
    const body = { error: 'unsupported format: html (supported: markdown, links, json)', code: 'unsupported_format', details: { formats: ['html'] } }
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input) => String(input).endsWith('/v1/crawl/gone')
      ? new Response('{"error":"not found","code":"not_found"}', { status: 404 })
      : new Response(JSON.stringify(body), { status: 400 })) as typeof fetch })
    const error = await client.scrape('https://example.com/').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(W2LError)
    expect(error).toMatchObject({ name: 'W2LError', status: 400, code: 'unsupported_format', method: 'POST', path: '/v1/scrape', body,
      message: `POST /v1/scrape failed: 400 ${JSON.stringify(body)}` })
    await expect(client.getCrawl('gone')).rejects.toMatchObject({ message: 'crawl not found: gone', status: 404, code: 'not_found', method: 'GET', path: '/v1/crawl/gone' })
  })

  it('leaves the code undefined when the error body carries none', async () => {
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async () => new Response('Bad Gateway', { status: 502 })) as typeof fetch })
    const error = await client.listMonitors().catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(W2LError)
    expect(error).toMatchObject({ status: 502, method: 'GET', path: '/v1/monitors', body: 'Bad Gateway', message: 'GET /v1/monitors failed: 502 Bad Gateway' })
    expect((error as W2LError).code).toBeUndefined()
  })
})
