import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Agent, getGlobalDispatcher, setGlobalDispatcher, type Dispatcher } from 'undici'
import { chunkUrls, SDK_ORIGIN, SDK_VERSION, W2L, W2LError, WaitTimeoutError, type CreateMonitorRequest } from '../src/index.js'

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
    expect((await client.getCrawlPages('task-1', { includeDuplicates: true })).items).toHaveLength(1)
    expect((await client.getCrawlErrors('task-1')).items).toEqual([])
    expect((await client.cancelCrawl('task-1')).status).toBe('cancelled')
    expect(await client.resumeCrawl('task-1')).toEqual({ taskId: 'task-1' })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://127.0.0.1:8787/v1/scrape',
      'POST http://127.0.0.1:8787/v1/crawl',
      'GET http://127.0.0.1:8787/v1/crawl/task-1',
      'GET http://127.0.0.1:8787/v1/crawl/task-1/pages?limit=1',
      'GET http://127.0.0.1:8787/v1/crawl/task-1/pages?includeDuplicates=true',
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

  it('takes the token from W2L_API_TOKEN when none is passed; a passed one, even empty, wins', async () => {
    const sent = async (options: { token?: string }): Promise<string | null> => {
      let authorization: string | null = null
      const client = new W2L({
        baseUrl: 'http://127.0.0.1:8787',
        ...options,
        fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
          authorization = new Headers(init?.headers).get('authorization')
          return new Response(JSON.stringify({ status: 'success' }), { status: 200 })
        }) as typeof fetch,
      })
      await client.scrape('https://example.com/')
      return authorization
    }
    try {
      vi.stubEnv('W2L_API_TOKEN', 'from-env')
      expect(await sent({})).toBe('Bearer from-env')
      expect(await sent({ token: 'passed' })).toBe('Bearer passed')
      expect(await sent({ token: '' })).toBeNull()
      vi.stubEnv('W2L_API_TOKEN', '')
      expect(await sent({})).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
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

  it('waits for a scrape\'s answer until its timeout plus 30 s, past the fetch dispatcher\'s own wait for headers', async () => {
    // The API answers 1.5 s after each request. The process's dispatcher stops waiting for headers after 1 s,
    // as Node's own stops after 300 s, which a scrape with the default or largest timeout (300 000 ms) needs.
    const api = createServer((req, res) => { req.resume(); setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"failed","failureReason":"timeout"}'), 1_500) })
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
    const original = getGlobalDispatcher()
    const agent = new Agent({ headersTimeout: 1_000 })
    const waits: Array<number | null | undefined> = []
    setGlobalDispatcher({ dispatch: (options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) => { waits.push(options.headersTimeout); return agent.dispatch(options, handler) } } as unknown as Dispatcher)
    try {
      const client = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}`, token: '' })
      expect(await client.scrape('https://example.com/', { timeout: 1_000 })).toMatchObject({ status: 'failed', failureReason: 'timeout' })
      await client.scrape('https://example.com/')
      expect(waits).toEqual([31_000, 330_000])
      // Other requests keep the dispatcher's own wait.
      await expect(client.getBatch('task-1')).rejects.toThrow(TypeError)
    } finally {
      setGlobalDispatcher(original)
      await agent.close()
      api.closeAllConnections()
      await new Promise<void>((resolve) => api.close(() => resolve()))
    }
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

  it('retries a network error, 408, 429 and 5xx while waiting, backing off or following Retry-After', async () => {
    vi.useFakeTimers()
    try {
      const answers: Array<() => Response> = [
        () => { throw new TypeError('fetch failed') },
        () => new Response('Bad Gateway', { status: 502 }),
        () => new Response('{"error":"slow down"}', { status: 429, headers: { 'retry-after': '3' } }),
        () => new Response('', { status: 408 }),
        () => new Response(JSON.stringify({ taskId: 'crawl-1', status: 'running' })),
        () => new Response('', { status: 503 }),
        () => new Response(JSON.stringify({ taskId: 'crawl-1', status: 'completed' })),
      ]
      const at: number[] = []
      const client = new W2L({ baseUrl: 'http://localhost', fetch: (async () => { at.push(Date.now()); return answers.shift()!() }) as typeof fetch })
      const waiting = client.waitCrawl('crawl-1', { pollIntervalMs: 100 })
      await vi.runAllTimersAsync()
      await expect(waiting).resolves.toMatchObject({ status: 'completed' })
      // 1, 2, (4) and 8 s after consecutive failures, the third one's Retry-After instead of 4 s; the poll interval after a status; 1 s again.
      expect(at.slice(1).map((time, i) => time - at[i]!)).toEqual([1_000, 2_000, 3_000, 8_000, 100, 1_000])
    } finally {
      vi.useRealTimers()
    }
  })

  it('rethrows other 4xx at once, and a transient error once its retries or the timeout run out', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const answering = (response: () => Response) => new W2L({ baseUrl: 'http://localhost', fetch: (async () => { calls++; return response() }) as typeof fetch })
      const failure = (promise: Promise<unknown>) => { const caught = promise.catch((error: unknown) => error); void vi.runAllTimersAsync(); return caught }

      expect(await failure(answering(() => new Response('{"error":"not found","code":"not_found"}', { status: 404 })).waitBatch('gone'))).toMatchObject({ name: 'W2LError', status: 404, code: 'not_found' })
      expect(calls).toBe(1)
      calls = 0
      expect(await failure(answering(() => new Response('{"error":"no","code":"unauthorized"}', { status: 401 })).waitCrawl('crawl-1'))).toMatchObject({ status: 401 })
      expect(calls).toBe(1)

      calls = 0
      expect(await failure(answering(() => new Response('', { status: 503 })).waitCrawl('crawl-1'))).toMatchObject({ name: 'W2LError', status: 503 })
      expect(calls).toBe(6)
      calls = 0
      expect(await failure(answering(() => new Response('', { status: 503 })).waitCrawl('crawl-1', { maxRetries: 1 }))).toMatchObject({ status: 503 })
      expect(calls).toBe(2)
      // A Retry-After beyond a minute is not waited out inside the wait.
      calls = 0
      expect(await failure(answering(() => new Response('', { status: 429, headers: { 'retry-after': '120' } })).waitCrawl('crawl-1'))).toMatchObject({ status: 429 })
      expect(calls).toBe(1)

      // The timeout still applies: it ends the backoff with the last status read, or none.
      let statuses = [JSON.stringify({ taskId: 'crawl-1', status: 'running' })]
      const flaky = answering(() => { const body = statuses.shift(); return body === undefined ? new Response('', { status: 503 }) : new Response(body) })
      const timedOut = await failure(flaky.waitCrawl('crawl-1', { timeoutMs: 2_500 }))
      expect(timedOut).toBeInstanceOf(WaitTimeoutError)
      expect(timedOut).toMatchObject({ taskId: 'crawl-1', last: { status: 'running' }, timeoutMs: 2_500, cause: { status: 503 } })
      statuses = []
      expect(await failure(flaky.waitCrawl('crawl-1', { timeoutMs: 2_500 }))).toMatchObject({ name: 'WaitTimeoutError', taskId: 'crawl-1', last: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends a status request still in flight when timeoutMs runs out, and checks its options', async () => {
    const hanging = new W2L({ baseUrl: 'http://localhost', fetch: ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    })) as typeof fetch })
    const started = Date.now()
    const error = await hanging.waitBatch('batch-1', { timeoutMs: 50 }).catch((reason: unknown) => reason)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(error).toBeInstanceOf(WaitTimeoutError)
    expect(error).toMatchObject({ taskId: 'batch-1', last: null, timeoutMs: 50 })
    for (const options of [{ pollIntervalMs: -1 }, { timeoutMs: Number.NaN }, { maxRetries: 1.5 }]) {
      await expect(hanging.waitCrawl('crawl-1', options)).rejects.toBeInstanceOf(RangeError)
    }
  })

  it('returns what a batch start skipped and reads a batch\'s errors by cursor and limit', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const errors = { errors: [{ id: 's1', timestamp: '2026-10-02T00:00:00.000Z', url: 'https://example.com/b', status: 'failed', code: 'policy_denied', error: 'failed: policy_denied — robots.txt rule /b', httpStatus: null }], robotsBlocked: ['https://example.com/b'], nextCursor: null, hasMore: false }
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      calls.push({ line: `${init?.method ?? 'GET'} ${url.pathname}${url.search}`, body: init?.body === undefined ? null : JSON.parse(String(init.body)) })
      if (init?.method === 'POST') return new Response(JSON.stringify({ taskId: 'batch-1', invalidURLs: ['not a url'] }), { status: 202 })
      if (url.pathname.endsWith('/nothing/errors')) return new Response('{"error":"not found","code":"not_found"}', { status: 404 })
      return new Response(JSON.stringify(errors), { status: 200 })
    }) as typeof fetch })
    expect(await client.batchScrape(['https://example.com/a', 'not a url'], { ignoreInvalidURLs: true, maxConcurrency: 2 })).toEqual({ taskId: 'batch-1', invalidURLs: ['not a url'] })
    expect(calls[0]?.body).toEqual({ urls: ['https://example.com/a', 'not a url'], ignoreInvalidURLs: true, maxConcurrency: 2, origin: SDK_ORIGIN })
    expect(await client.getBatchErrors('batch-1')).toEqual(errors)
    expect(await client.getBatchErrors('batch-1', { cursor: 'c1', limit: 5 })).toEqual(errors)
    await expect(client.getBatchErrors('nothing')).rejects.toMatchObject({ name: 'W2LError', status: 404, code: 'not_found', message: 'batch not found: nothing' })
    expect(calls.map((call) => call.line)).toEqual(['POST /v1/batches', 'GET /v1/batches/batch-1/errors', 'GET /v1/batches/batch-1/errors?cursor=c1&limit=5', 'GET /v1/batches/nothing/errors'])
  })

  it('sends idempotencyKey and appendToId with a batch start, and appendToBatch posts to /v1/batches', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const body = JSON.parse(String(init?.body)) as { appendToId?: string }
      calls.push({ line: `${init?.method ?? 'GET'} ${url.pathname}`, body })
      return new Response(JSON.stringify(body.appendToId === undefined ? { taskId: 'batch-1', replayed: true } : { taskId: body.appendToId, requested: 7, appended: 2 }), { status: 202 })
    }) as typeof fetch })
    expect(await client.batchScrape(['https://example.com/a'], { idempotencyKey: 'nightly-1' })).toEqual({ taskId: 'batch-1', replayed: true })
    expect(await client.appendToBatch('batch-1', ['https://example.com/b', 'https://example.com/c'], { idempotencyKey: 'nightly-1:append', ignoreInvalidURLs: true })).toEqual({ taskId: 'batch-1', requested: 7, appended: 2 })
    expect(calls).toEqual([
      { line: 'POST /v1/batches', body: { urls: ['https://example.com/a'], idempotencyKey: 'nightly-1', origin: SDK_ORIGIN } },
      { line: 'POST /v1/batches', body: { urls: ['https://example.com/b', 'https://example.com/c'], appendToId: 'batch-1', idempotencyKey: 'nightly-1:append', ignoreInvalidURLs: true, origin: SDK_ORIGIN } },
    ])
  })

  it('splits a long list with chunkUrls and runs it as batches in sequence with batchScrapeChunked, merging the items in submission order', async () => {
    const urls = Array.from({ length: 2500 }, (_, n) => `https://example.com/p/${n}`)
    expect(chunkUrls(urls, 1000).map((chunk) => chunk.length)).toEqual([1000, 1000, 500])
    expect(chunkUrls(urls).length).toBe(25)
    expect(chunkUrls([])).toEqual([])
    for (const chunkSize of [0, 1001, 2.5]) expect(() => chunkUrls(urls, chunkSize)).toThrow('chunkSize must be an integer between 1 and 1000')
    // A fake API: each POST is a new job whose items are listed, paged by limit and cursor, in the reverse of their submission order.
    const calls: Array<{ line: string; body: unknown }> = []
    const jobs = new Map<string, string[]>()
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const body = init?.body === undefined ? null : JSON.parse(String(init.body)) as { urls: string[] }
      calls.push({ line: `${init?.method ?? 'GET'} ${url.pathname}${url.search}`, body })
      if (init?.method === 'POST') { const taskId = `batch-${jobs.size}`; jobs.set(taskId, body!.urls); return new Response(JSON.stringify({ taskId }), { status: 202 }) }
      const [, , , id, tail] = url.pathname.split('/')
      const all = jobs.get(id!)!
      if (tail === 'items') {
        const limit = Number(url.searchParams.get('limit') ?? 10)
        const start = Number(url.searchParams.get('cursor') ?? 0)
        const page = [...all].reverse().slice(start, start + limit).map((item, i) => ({ id: `step-${start + i}`, url: item, status: 'success' }))
        return new Response(JSON.stringify({ items: page, nextCursor: start + limit < all.length ? String(start + limit) : null, hasMore: start + limit < all.length }))
      }
      return new Response(JSON.stringify({ taskId: id, status: 'completed', requested: all.length, completed: all.length, remaining: 0 }))
    }) as typeof fetch })
    const result = await client.batchScrapeChunked(urls, { formats: ['markdown'], idempotencyKey: 'nightly-1' }, { chunkSize: 1000, pollIntervalMs: 1 })
    expect(result.jobs.map((job) => [job.taskId, job.urls, job.report.status])).toEqual([['batch-0', 1000, 'completed'], ['batch-1', 1000, 'completed'], ['batch-2', 500, 'completed']])
    expect(result.items).toHaveLength(2500)
    expect(result.items.map((item) => item.url)).toEqual(urls)
    expect(result.invalidURLs).toEqual([])
    // Three jobs, strictly in sequence, each waited for and listed in pages of 50 before the next starts; the caller's key per chunk.
    const posts = calls.filter((call) => call.line.startsWith('POST'))
    expect(posts.map((call) => (call.body as { idempotencyKey: string; urls: string[] }).idempotencyKey)).toEqual(['nightly-1:0', 'nightly-1:1', 'nightly-1:2'])
    expect(posts.map((call) => (call.body as { urls: string[] }).urls.length)).toEqual([1000, 1000, 500])
    expect(posts[0]?.body).toMatchObject({ formats: ['markdown'], origin: SDK_ORIGIN })
    expect(calls.slice(0, 3).map((call) => call.line)).toEqual(['POST /v1/batches', 'GET /v1/batches/batch-0', 'GET /v1/batches/batch-0/items?limit=50'])
    expect(calls.findIndex((call) => call.line === 'GET /v1/batches/batch-1')).toBeGreaterThan(calls.findLastIndex((call) => call.line.startsWith('GET /v1/batches/batch-0/items')))
    expect(calls.filter((call) => call.line.startsWith('GET /v1/batches/batch-0/items'))).toHaveLength(20)
    // An append is a different call; a job that never completes surfaces the wait's error, naming the job.
    await expect(client.batchScrapeChunked(urls, { appendToId: 'batch-1' } as unknown as Record<string, never>)).rejects.toThrow('batchScrapeChunked cannot append; use appendToBatch')
    await expect(client.batchScrapeChunked(urls, {}, { itemLimit: 51 })).rejects.toThrow('itemLimit must be an integer between 1 and 50')
    const stuck = new W2L({ baseUrl: 'http://localhost', fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'POST' ? { taskId: 'batch-9' } : { taskId: 'batch-9', status: 'running' }), { status: init?.method === 'POST' ? 202 : 200 })) as typeof fetch })
    const error = await stuck.batchScrapeChunked(urls.slice(0, 3), {}, { chunkSize: 2, pollIntervalMs: 1, timeoutMs: 20 }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(WaitTimeoutError)
    expect(error).toMatchObject({ taskId: 'batch-9', timeoutMs: 20 })
  })

  it('crawlAndWait and batchAndWait return the final status with every page, error and item', async () => {
    const calls: string[] = []
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
      if (init?.method === 'POST') return new Response(JSON.stringify({ taskId: 'task-1' }), { status: 202 })
      const cursor = url.searchParams.get('cursor')
      if (url.pathname.endsWith('/pages') || url.pathname.endsWith('/items')) {
        return new Response(JSON.stringify(cursor === null ? { items: [{ id: 'one' }], hasMore: true, nextCursor: 'c1' } : { items: [{ id: 'two' }], hasMore: false, nextCursor: null }))
      }
      if (url.pathname.endsWith('/errors')) return new Response(JSON.stringify({ items: [{ id: 'bad' }], hasMore: false, nextCursor: null }))
      return new Response(JSON.stringify({ taskId: 'task-1', status: 'completed' }))
    }) as typeof fetch })
    expect(await client.crawlAndWait('https://example.com/', { maxPages: 3 }, { pollIntervalMs: 1 })).toEqual({
      taskId: 'task-1', report: { taskId: 'task-1', status: 'completed' }, pages: [{ id: 'one' }, { id: 'two' }], errors: [{ id: 'bad' }],
    })
    expect(await client.batchAndWait(['https://example.com/a', 'https://example.com/b'])).toEqual({
      taskId: 'task-1', report: { taskId: 'task-1', status: 'completed' }, items: [{ id: 'one' }, { id: 'two' }],
    })
    expect(calls).toEqual([
      'POST /v1/crawl', 'GET /v1/crawl/task-1', 'GET /v1/crawl/task-1/pages?limit=100', 'GET /v1/crawl/task-1/pages?cursor=c1&limit=100', 'GET /v1/crawl/task-1/errors?limit=100',
      'POST /v1/batches', 'GET /v1/batches/task-1', 'GET /v1/batches/task-1/items?limit=50', 'GET /v1/batches/task-1/items?cursor=c1&limit=50',
    ])
  })

  it('follows cursors within pagination limits, merges status with documents, and lists active crawls', async () => {
    // Eight pages served by cursor and limit (two per page when the request names no limit), the status alongside.
    const all = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, url: `https://example.com/${i + 1}` }))
    const calls: string[] = []
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      calls.push(`${url.pathname}${url.search}`)
      if (url.pathname === '/v1/crawl/active') return new Response(JSON.stringify({ crawls: [{ id: 'c1', url: 'https://example.com/', status: 'running' }] }))
      if (url.pathname.endsWith('/pages') || url.pathname.endsWith('/items')) {
        const start = Number(url.searchParams.get('cursor') ?? '0')
        const limit = Number(url.searchParams.get('limit') ?? '2')
        const items = all.slice(start, start + limit)
        const end = start + items.length
        return new Response(JSON.stringify({ items, hasMore: end < all.length, nextCursor: end < all.length ? String(end) : null }))
      }
      return new Response(JSON.stringify({ taskId: 'task-1', status: 'completed', pagesFetched: 8 }))
    }) as typeof fetch })
    const capped = await client.getCrawlDocuments('task-1', { limit: 2, maxResults: 5 })
    expect(capped.report).toMatchObject({ status: 'completed', pagesFetched: 8 })
    expect(capped.pages.map((page) => page.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(capped).toMatchObject({ stoppedBy: 'maxResults', nextCursor: '5' })
    // The last page was requested no larger than what was still wanted, so the cursor continues after p5.
    expect(calls).toEqual(['/v1/crawl/task-1', '/v1/crawl/task-1/pages?limit=2', '/v1/crawl/task-1/pages?cursor=2&limit=2', '/v1/crawl/task-1/pages?cursor=4&limit=1'])
    calls.length = 0
    const onePageMore: string[] = []
    const listing = client.listCrawlPages('task-1', { limit: 2, maxPages: 1 })
    for (let next = await listing.next(); !next.done; next = await listing.next()) onePageMore.push(next.value.id)
    expect(onePageMore).toEqual(['p1', 'p2', 'p3', 'p4'])
    const impatient = await client.getCrawlDocuments('task-1', { limit: 2, maxWaitMs: 0 })
    expect(impatient.pages).toHaveLength(2)
    expect(impatient).toMatchObject({ stoppedBy: 'maxWait', nextCursor: '2' })
    const items: string[] = []
    for await (const item of client.listBatchItems('batch-1', { maxResults: 3 })) items.push(item.id)
    expect(items).toEqual(['p1', 'p2', 'p3'])
    expect(calls.at(-1)).toBe('/v1/batches/batch-1/items?limit=3')
    // No caps: everything, and the end is the end.
    expect(await client.collectBatchItems('batch-1', { limit: 5 })).toMatchObject({ items: all.slice(0, 8), nextCursor: null, hasMore: false, stoppedBy: 'end' })
    const whole = await client.getBatchDocuments('batch-1', { limit: 50 })
    expect(whole.items).toHaveLength(8)
    expect(whole.stoppedBy).toBe('end')
    expect(await client.getActiveCrawls()).toEqual({ crawls: [{ id: 'c1', url: 'https://example.com/', status: 'running' }] })
    expect(calls.at(-1)).toBe('/v1/crawl/active')
    for (const options of [{ maxPages: -1 }, { maxResults: 0 }, { maxWaitMs: Number.NaN }]) {
      await expect(client.collectCrawlPages('task-1', options)).rejects.toBeInstanceOf(RangeError)
    }
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

  it('records every scrape, crawl and batch under origin js-sdk@<version>, keeps a caller\'s or a host\'s origin, and pins the version to package.json', async () => {
    const bodies: Record<string, unknown>[] = []
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      const scrape = String(input).endsWith('/v1/scrape')
      return new Response(scrape ? '{"status":"success"}' : '{"taskId":"task-1"}', { status: scrape ? 200 : 202 })
    }) as typeof fetch })
    await client.scrape('https://example.com/', { debug: false })
    await client.crawl('https://example.com/', { maxPages: 1 })
    await client.batchScrape(['https://example.com/a'], { integration: 'nightly-prices' })
    await client.scrape('https://example.com/', { origin: 'my-app@2' })
    await client.scrape('https://example.com/', {}, { origin: 'mcp-host@1' })
    expect(bodies.map((body) => body.origin)).toEqual([SDK_ORIGIN, SDK_ORIGIN, SDK_ORIGIN, 'my-app@2', 'mcp-host@1'])
    expect(bodies[2]).toMatchObject({ urls: ['https://example.com/a'], integration: 'nightly-prices' })
    expect(SDK_ORIGIN).toBe(`js-sdk@${SDK_VERSION}`)
    expect(SDK_VERSION).toBe((JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version)
  })

  it('reads a scrape record by its id, and a missing one is a W2LError not_found', async () => {
    const record = { scrapeId: '7c1d4d2c-0f3e-4a7b-9b1a-2f0d4d1b5a6e', status: 'success', lane: 'http', origin: SDK_ORIGIN }
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async (input) => String(input).endsWith(`/v1/scrapes/${record.scrapeId}`)
      ? new Response(JSON.stringify(record))
      : new Response('{"error":"not found","code":"not_found"}', { status: 404 })) as typeof fetch })
    expect(await client.getScrape(record.scrapeId)).toEqual(record)
    await expect(client.getScrape('gone')).rejects.toMatchObject({ name: 'W2LError', message: 'scrape not found: gone', status: 404, code: 'not_found', method: 'GET', path: '/v1/scrapes/gone' })
  })

  it('throws W2LError for a 429 with its code, the Retry-After as milliseconds (delta-seconds or an HTTP-date) and the hints, and retries nothing', async () => {
    const body = { error: 'rate limit exceeded: 2 requests per minute', code: 'rate_limited', retryAfterSeconds: 7, agentHints: ['wait 7 s before the next request'] }
    let calls = 0
    const answering = (headers: Record<string, string>) => new W2L({ baseUrl: 'http://localhost', fetch: (async () => { calls++; return new Response(JSON.stringify(body), { status: 429, headers }) }) as typeof fetch })
    const delta = await answering({ 'retry-after': '7' }).scrape('https://example.com/').catch((reason: unknown) => reason)
    expect(delta).toBeInstanceOf(W2LError)
    expect(delta).toMatchObject({ status: 429, code: 'rate_limited', retryAfterMs: 7_000, agentHints: ['wait 7 s before the next request'], body, method: 'POST', path: '/v1/scrape' })
    const dated = await answering({ 'retry-after': new Date(Date.now() + 30_000).toUTCString() }).scrape('https://example.com/').catch((reason: unknown) => reason) as W2LError
    expect(dated.retryAfterMs).toBeGreaterThan(20_000)
    expect(dated.retryAfterMs).toBeLessThanOrEqual(30_000)
    expect(calls).toBe(2)
    // A body without hints and a response without the header: empty and null, never invented.
    const bare = await new W2L({ baseUrl: 'http://localhost', fetch: (async () => new Response('{"error":"conflict","code":"conflict"}', { status: 409 })) as typeof fetch }).runMonitor('catalog').catch((reason: unknown) => reason)
    expect(bare).toMatchObject({ status: 409, code: 'conflict', retryAfterMs: null, agentHints: [] })
  })

  it('leaves the code undefined when the error body carries none', async () => {
    const client = new W2L({ baseUrl: 'http://localhost', fetch: (async () => new Response('Bad Gateway', { status: 502 })) as typeof fetch })
    const error = await client.listMonitors().catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(W2LError)
    expect(error).toMatchObject({ status: 502, method: 'GET', path: '/v1/monitors', body: 'Bad Gateway', message: 'GET /v1/monitors failed: 502 Bad Gateway' })
    expect((error as W2LError).code).toBeUndefined()
  })
})
