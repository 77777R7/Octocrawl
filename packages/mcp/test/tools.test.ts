import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { W2L } from '@w2l/sdk'
import { callTool, TOOL_NAMES, TOOLS } from '../src/tools.js'
import { createMcpServer } from '../src/server.js'
import { parseBaseUrl, parseToken } from '../src/stdio.js'

describe('MCP tools', () => {
  it('exposes scrape, crawl, and persistent batch operations', () => {
    const expected = ['scrape_product', 'batch_products', 'scrape', 'crawl', 'get_crawl', 'get_crawl_pages', 'get_crawl_errors', 'cancel_crawl', 'resume_crawl', 'batch_scrape', 'get_batch', 'get_batch_items', 'wait_batch', 'cancel_batch',
      'preview_monitor','create_monitor','list_monitors','get_monitor','run_monitor','get_monitor_run','pause_monitor','resume_monitor','cancel_monitor_run',
      'create_delivery_destination','list_delivery_destinations','pause_delivery_destination','resume_delivery_destination','list_deliveries','get_delivery','retry_dead_letter']
    expect([...TOOL_NAMES]).toEqual(expected)
    expect(TOOLS.map((t) => t.name)).toEqual(expected)
  })

  it('dispatches to the REST SDK with A1 fields', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({
      baseUrl: 'http://127.0.0.1:8787',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ line: `${init?.method ?? 'GET'} ${url}`, body: init?.body ? JSON.parse(String(init.body)) : null })
        if (url.endsWith('/v1/scrape')) {
          return json({ status: 'success', markdown: 'ok', requestedUrl: 'https://example.com/' })
        }
        if (url.endsWith('/v1/crawl')) {
          return json({ taskId: 'task-1' }, 202)
        }
        if (url.includes('/pages')) return json({ items: [{ id: 'step-1' }], nextCursor: null, hasMore: false })
        if (url.includes('/errors')) return json({ items: [], nextCursor: null, hasMore: false })
        if (url.includes('/cancel')) return json({ taskId: 'task-1', status: 'cancelled' })
        if (url.endsWith('/resume')) return json({ taskId: 'task-1' }, 202)
        return json({ taskId: 'task-1', status: 'completed', pagesFetched: 1, cachedPages: 0, attemptId: 'a', budgetExceeded: null, loopDetected: false })
      }) as typeof fetch,
    })

    const scraped = (await callTool(client, 'scrape', { url: 'https://example.com/', mode: 'standard' })) as { status: string }
    expect(scraped.status).toBe('success')
    const accepted = (await callTool(client, 'crawl', { url: 'https://example.com/', maxPages: 20 })) as { taskId: string }
    expect(accepted.taskId).toBe('task-1')
    const report = (await callTool(client, 'get_crawl', { id: 'task-1' })) as { pagesFetched: number }
    expect(report.pagesFetched).toBe(1)
    expect((await callTool(client, 'get_crawl_pages', { id: 'task-1', limit: 1 }) as { items: unknown[] }).items).toHaveLength(1)
    expect((await callTool(client, 'get_crawl_errors', { id: 'task-1' }) as { items: unknown[] }).items).toEqual([])
    expect((await callTool(client, 'cancel_crawl', { id: 'task-1' }) as { status: string }).status).toBe('cancelled')
    expect(await callTool(client, 'resume_crawl', { id: 'task-1' })).toEqual({ taskId: 'task-1' })
    expect(calls.map(call => call.line)).toEqual([
      'POST http://127.0.0.1:8787/v1/scrape',
      'POST http://127.0.0.1:8787/v1/crawl',
      'GET http://127.0.0.1:8787/v1/crawl/task-1',
      'GET http://127.0.0.1:8787/v1/crawl/task-1/pages?limit=1',
      'GET http://127.0.0.1:8787/v1/crawl/task-1/errors',
      'POST http://127.0.0.1:8787/v1/crawl/task-1/cancel',
      'POST http://127.0.0.1:8787/v1/crawl/task-1/resume',
    ])
    expect(calls[0]?.body).toEqual({ url: 'https://example.com/', mode: 'standard', debug: false })
  })

  it('forwards custom formats and debug to REST', async () => {
    let body: Record<string, unknown> | null = null
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (_input, init) => {
      body = JSON.parse(String(init?.body))
      return json({ status: 'success' })
    }) as typeof fetch })
    await callTool(client, 'scrape', { url: 'https://example.com/', formats: [{ type: 'json', schema: { type: 'object' } }], debug: true })
    expect(body).toMatchObject({ formats: [{ type: 'json', schema: { type: 'object' } }], debug: true })
  })

  it('offers one-argument Amazon product tools with a fixed schema and no model', async () => {
    const bodies:Record<string,unknown>[]=[]
    const client=new W2L({baseUrl:'http://127.0.0.1:8787',fetch:(async (input,init)=>{
      bodies.push(JSON.parse(String(init?.body)))
      return json(String(input).endsWith('/v1/batches')?{taskId:'batch-1'}:{status:'success'},String(input).endsWith('/v1/batches')?202:200)
    }) as typeof fetch})
    await callTool(client,'scrape_product',{url:'https://www.amazon.sg/dp/B000VW9PIK?tag=ref'})
    await callTool(client,'batch_products',{urls:['https://www.amazon.sg/dp/B000VW9PIK']})
    expect(bodies.map(body=>body.formats)).toEqual([
      [{type:'json',schema:expect.any(Object),modelFallback:false}],
      [{type:'json',schema:expect.any(Object),modelFallback:false}],
    ])
    expect(bodies[0]?.url).toBe('https://www.amazon.sg/dp/B000VW9PIK')
    expect(bodies[1]?.urls).toEqual(['https://www.amazon.sg/dp/B000VW9PIK'])
    await expect(callTool(client,'scrape_product',{url:'https://127.0.0.1/dp/B000VW9PIK'})).rejects.toThrow('Amazon.sg')
  })

  it('keeps the legacy links format and caller schema on the public tool schema', () => {
    const scrape = TOOLS.find(tool => tool.name === 'scrape')
    const batch = TOOLS.find(tool => tool.name === 'batch_scrape')
    expect(JSON.stringify(scrape?.inputSchema)).toContain('"links"')
    expect(JSON.stringify(scrape?.inputSchema)).toContain('"schema"')
    expect(JSON.stringify(batch?.inputSchema)).toContain('"schema"')
  })

  it('forwards crawl formats and path filters, with no count cap on formats', async () => {
    let body: unknown = null
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (_input, init) => {
      body = JSON.parse(String(init?.body))
      return json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const request = { url: 'https://example.com/', formats: ['markdown', 'links'], includeLinks: true, includePaths: ['^/docs/'], excludePaths: ['^/docs/old/'] }
    await callTool(client, 'crawl', request)
    expect(body).toEqual(request)
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      const formats = (TOOLS.find(tool => tool.name === name)?.inputSchema.properties as Record<string, { maxItems?: number }>).formats
      expect(formats).toBeDefined()
      expect(formats?.maxItems).toBeUndefined()
    }
  })

  it('declares and forwards onlyMainContent, waitFor, timeout and maxFileBytes for scrape, crawl and batch_scrape', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return String(input).endsWith('/v1/scrape') ? json({ status: 'partial' }) : json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const options = { onlyMainContent: false, waitFor: 1_000, timeout: 15_000, maxFileBytes: 1_000_000 }
    await callTool(client, 'scrape', { url: 'https://example.com/', ...options })
    await callTool(client, 'crawl', { url: 'https://example.com/', ...options })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], ...options })
    expect(bodies).toEqual([
      { url: 'https://example.com/', debug: false, ...options },
      { url: 'https://example.com/', ...options },
      { urls: ['https://example.com/a'], ...options },
    ])
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      expect(TOOLS.find(tool => tool.name === name)?.inputSchema.properties).toMatchObject({
        onlyMainContent: { type: 'boolean' },
        waitFor: { type: 'integer', minimum: 0, maximum: 60_000 },
        timeout: { type: 'integer', minimum: 1_000, maximum: 300_000 },
        maxFileBytes: { type: 'integer', minimum: 1, maximum: 500 * 1024 * 1024 },
      })
    }
  })

  it('dispatches URL arrays and paginated batch results through the SDK', async () => {
    const calls: string[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/v1/batches')) return json({ taskId: 'batch-1' }, 202)
      if (url.includes('/items')) return json({ items: [{ id: 'item-1' }], nextCursor: null, hasMore: false })
      return json({ taskId: 'batch-1', status: 'completed', completed: 1, requested: 1, remaining: 0 })
    }) as typeof fetch })
    expect(await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'] })).toEqual({ taskId: 'batch-1' })
    expect((await callTool(client, 'get_batch_items', { id: 'batch-1', limit: 1 }) as { items: unknown[] }).items).toHaveLength(1)
    expect((await callTool(client, 'wait_batch', { id: 'batch-1' }) as { status: string }).status).toBe('completed')
    expect(calls).toEqual([
      'POST http://127.0.0.1:8787/v1/batches',
      'GET http://127.0.0.1:8787/v1/batches/batch-1/items?limit=1',
      'GET http://127.0.0.1:8787/v1/batches/batch-1',
    ])
  })

  it('bounds wait_batch and returns current state when its wait expires', async () => {
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async () => json({ taskId: 'batch-1', status: 'running', completed: 0, requested: 2, remaining: 2 })) as typeof fetch })
    const state = await callTool(client, 'wait_batch', { id: 'batch-1', timeoutMs: 10 }) as { status: string }
    expect(state.status).toBe('running')
  })

  it('stops a scrape and a wait_batch when the MCP client cancels the call', async () => {
    const signals: AbortSignal[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? undefined
      if (signal) signals.push(signal)
      // The scrape answers only when it is cancelled; the batch stays running.
      if (String(input).endsWith('/v1/scrape')) return new Promise<Response>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }))
      return json({ taskId: 'batch-1', status: 'running', completed: 0, requested: 2, remaining: 2 })
    }) as typeof fetch })
    const mcp = new Client({ name: 'w2l-test', version: '1.0.0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([createMcpServer(client).connect(serverSide), mcp.connect(clientSide)])
    try {
      const scrape = new AbortController()
      const scraping = mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/' } }, undefined, { signal: scrape.signal })
      await vi.waitFor(() => expect(signals).toHaveLength(1))
      scrape.abort()
      await expect(scraping).rejects.toThrow()
      await vi.waitFor(() => expect(signals[0]!.aborted).toBe(true))

      const wait = new AbortController()
      const waiting = mcp.callTool({ name: 'wait_batch', arguments: { id: 'batch-1', timeoutMs: 300_000 } }, undefined, { signal: wait.signal })
      await vi.waitFor(() => expect(signals.length).toBeGreaterThan(1))
      wait.abort()
      await expect(waiting).rejects.toThrow()
      await vi.waitFor(() => expect(signals.at(-1)!.aborted).toBe(true))
      const polls = signals.length
      await new Promise((resolve) => setTimeout(resolve, 1_200))
      expect(signals).toHaveLength(polls)
    } finally {
      await mcp.close()
    }
  })

  it('starts a failed tool call with its error code and leaves results unchanged', async () => {
    const rejected = { error: 'unsupported format: html (supported: markdown, links, json)', code: 'unsupported_format', details: { formats: ['html'] } }
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input: RequestInfo | URL) =>
      String(input).endsWith('/v1/batches/batch-1') ? json({ taskId: 'batch-1', status: 'completed' }) : json(rejected, 400)) as typeof fetch })
    const mcp = new Client({ name: 'w2l-test', version: '1.0.0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([createMcpServer(client).connect(serverSide), mcp.connect(clientSide)])
    try {
      await expect(mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/' } })).rejects.toMatchObject({
        message: expect.stringContaining(`unsupported_format: POST /v1/scrape failed: 400 ${JSON.stringify(rejected)}`),
        data: { code: 'unsupported_format', status: 400 },
      })
      // Rejected by the shared request parser before any API call, with the same code.
      await expect(mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/', proxy: 'stealth' } })).rejects.toThrow('unsupported_parameter: unsupported parameter: proxy')
      await expect(mcp.callTool({ name: 'get_batch', arguments: {} })).rejects.toThrow('invalid_request: id is required')
      expect(await mcp.callTool({ name: 'get_batch', arguments: { id: 'batch-1' } })).toEqual({ content: [{ type: 'text', text: '{"taskId":"batch-1","status":"completed"}' }] })
    } finally {
      await mcp.close()
    }
  })

  it('has no resource or oauth surface', async () => {
    const runtime = await import('../src/index.js')
    expect(Object.keys(runtime).sort()).toEqual([
      'TOOLS',
      'TOOL_NAMES',
      'callTool',
      'createMcpServer',
      'parseBaseUrl',
      'parseToken',
    ])
    expect(JSON.stringify(runtime)).not.toMatch(/oauth|subscribe|resource/i)
  })

  it('reads W2L_API_URL / --base-url for the REST origin', () => {
    expect(parseBaseUrl([], {})).toBe('http://127.0.0.1:8787')
    expect(parseBaseUrl([], { W2L_API_URL: 'http://127.0.0.1:9000' })).toBe('http://127.0.0.1:9000')
    expect(parseBaseUrl(['--base-url', 'http://127.0.0.1:9'], {})).toBe('http://127.0.0.1:9')
  })

  it('reads W2L_API_TOKEN / --token for hosted API auth', () => {
    expect(parseToken([], {})).toBeUndefined()
    expect(parseToken([], { W2L_API_TOKEN: 'secret' })).toBe('secret')
    expect(parseToken(['--token', 'cli'], {})).toBe('cli')
  })

  it('creates paused first-use Monitors and queues durable runs through REST', async () => {
    const calls: Array<{url:string;body:Record<string,unknown>}> = []
    const client = new W2L({baseUrl:'http://w2l.local',fetch:(async(input,init)=>{
      calls.push({url:String(input),body:init?.body ? JSON.parse(String(init.body)) : {}})
      return json(String(input).endsWith('/runs') ? {id:'run-1',monitorId:'firecrawl-introduction',state:'queued',triggerKey:'manual'} : {monitorId:'firecrawl-introduction',revision:1},String(input).endsWith('/runs') ? 202 : 201)
    }) as typeof fetch})
    await callTool(client,'create_monitor',{preset:'firecrawl-introduction'})
    expect(calls[0]?.body).toEqual({preset:'firecrawl-introduction',enabled:false})
    expect(await callTool(client,'run_monitor',{id:'firecrawl-introduction'})).toMatchObject({runId:'run-1',state:'queued'})
    expect(calls[1]?.url).toMatch(/\/v1\/monitors\/firecrawl-introduction\/runs$/)
  })

  it('explains a dead-letter and retries the same event without exposing its payload by default', async () => {
    const calls: string[] = []
    const delivery = {id:'delivery-1',eventId:'event-1',state:'dead_letter',lastError:'HTTP 503',attemptCount:2,payload:{privateBody:'fixture'}}
    const client = new W2L({baseUrl:'http://w2l.local',fetch:(async(input,init)=>{
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`)
      return json(String(input).endsWith('/retry') ? {...delivery,state:'pending'} : {delivery,attempts:[{status:503,error:'HTTP 503'}]})
    }) as typeof fetch})
    const compact = await callTool(client,'get_delivery',{id:'delivery-1'}) as {delivery:Record<string,unknown>;attempts:unknown[]}
    expect(compact.delivery).toMatchObject({eventId:'event-1',state:'dead_letter',lastError:'HTTP 503'})
    expect(compact.delivery).not.toHaveProperty('payload')
    expect(compact.attempts).toHaveLength(1)
    const debug = await callTool(client,'get_delivery',{id:'delivery-1',debug:true}) as {delivery:Record<string,unknown>}
    expect(debug.delivery).toHaveProperty('payload')
    const retried = await callTool(client,'retry_dead_letter',{id:'delivery-1'}) as Record<string,unknown>
    expect(retried).toMatchObject({eventId:'event-1',state:'pending'})
    expect(retried).not.toHaveProperty('payload')
    expect(calls).toEqual([
      'GET http://w2l.local/v1/deliveries/delivery-1',
      'GET http://w2l.local/v1/deliveries/delivery-1',
      'POST http://w2l.local/v1/deliveries/delivery-1/retry',
    ])
  })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
