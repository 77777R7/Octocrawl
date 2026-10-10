import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { BATCH_KEYS, CRAWL_KEYS, MAP_KEYS, SCRAPE_KEYS, type MapResponse } from '@w2l/contracts'
import { SDK_ORIGIN, W2L } from '@w2l/sdk'
import { callTool, TOOL_NAMES, TOOLS } from '../src/tools.js'
import { createMcpServer, mcpOrigin } from '../src/server.js'
import { parseBaseUrl, parseToken } from '../src/stdio.js'

describe('MCP tools', () => {
  it('exposes scrape, crawl, and persistent batch operations', () => {
    const expected = ['scrape_product', 'batch_products', 'scrape', 'get_scrape', 'map', 'crawl', 'get_crawl', 'get_crawl_pages', 'get_crawl_errors', 'cancel_crawl', 'resume_crawl', 'list_active_crawls', 'batch_scrape', 'get_batch', 'get_batch_items', 'wait_batch', 'cancel_batch', 'get_batch_errors', 'hand_off_batch', 'import_login', 'list_logins', 'remove_login',
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
    expect(calls[0]?.body).toEqual({ url: 'https://example.com/', mode: 'standard', debug: false, origin: SDK_ORIGIN })
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
    expect(body).toEqual({ ...request, origin: SDK_ORIGIN })
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      const formats = (TOOLS.find(tool => tool.name === name)?.inputSchema.properties as Record<string, { maxItems?: number }>).formats
      expect(formats).toBeDefined()
      expect(formats?.maxItems).toBeUndefined()
    }
  })

  it('declares and forwards the crawl URL-scope options, and includeDuplicates for get_crawl_pages', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      calls.push({ line: `${init?.method ?? 'GET'} ${String(input)}`, body: init?.body ? JSON.parse(String(init.body)) : null })
      return String(input).endsWith('/v1/crawl') ? json({ taskId: 'task-1' }, 202) : json({ items: [], nextCursor: null, hasMore: false })
    }) as typeof fetch })
    const scope = { regexOnFullURL: true, ignoreQueryParameters: true, deduplicateSimilarURLs: false, crawlEntireDomain: true, allowSubdomains: true, allowExternalLinks: true }
    await callTool(client, 'crawl', { url: 'https://example.com/docs/', ...scope })
    expect(calls[0]?.body).toEqual({ url: 'https://example.com/docs/', ...scope, origin: SDK_ORIGIN })
    await callTool(client, 'get_crawl_pages', { id: 'task-1', includeDuplicates: true })
    expect(calls[1]?.line).toBe('GET http://127.0.0.1:8787/v1/crawl/task-1/pages?includeDuplicates=true')
    const crawl = TOOLS.find((tool) => tool.name === 'crawl')?.inputSchema.properties as Record<string, unknown>
    for (const name of Object.keys(scope)) expect(crawl[name], name).toMatchObject({ type: 'boolean' })
    expect((TOOLS.find((tool) => tool.name === 'get_crawl_pages')?.inputSchema.properties as Record<string, unknown>).includeDuplicates).toMatchObject({ type: 'boolean' })
    // Refused by the shared parser before any API call.
    await expect(callTool(client, 'crawl', { url: 'https://example.com/', allowExternalLinks: true, allowlistedDomains: ['other.test'] })).rejects.toThrow('allowExternalLinks cannot be combined with allowlistedDomains')
    await expect(callTool(client, 'get_crawl_pages', { id: 'task-1', includeDuplicates: 'yes' })).rejects.toThrow('includeDuplicates must be a boolean')
    expect(calls).toHaveLength(2)
  })

  it('declares and forwards sitemap and maxConcurrency, lists active crawls, and follows cursors for maxResults', async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}` }))
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      const url = new URL(String(input))
      calls.push({ line: `${init?.method ?? 'GET'} ${url.pathname}${url.search}`, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.pathname === '/v1/crawl') return json({ taskId: 'task-1' }, 202)
      if (url.pathname === '/v1/crawl/active') return json({ crawls: [] })
      // Pages by cursor and limit (two items when the request names no limit), as the API serves them.
      const start = Number(url.searchParams.get('cursor') ?? '0')
      const end = Math.min(all.length, start + Number(url.searchParams.get('limit') ?? '2'))
      return json({ items: all.slice(start, end), nextCursor: end < all.length ? String(end) : null, hasMore: end < all.length })
    }) as typeof fetch })
    await callTool(client, 'crawl', { url: 'https://example.com/', sitemap: 'only', maxConcurrency: 2 })
    expect(calls[0]?.body).toEqual({ url: 'https://example.com/', sitemap: 'only', maxConcurrency: 2, origin: SDK_ORIGIN })
    expect(await callTool(client, 'list_active_crawls', {})).toEqual({ crawls: [] })
    expect(calls[1]?.line).toBe('GET /v1/crawl/active')
    // Pages of two, three wanted: two requests, the second no larger than the one item still wanted, and the cursor continues after it.
    const paged = await callTool(client, 'get_crawl_pages', { id: 'task-1', limit: 2, maxResults: 3, includeDuplicates: true }) as { items: Array<{ id: string }>; nextCursor: string | null; hasMore: boolean; stoppedBy: string }
    expect(paged.items.map((item) => item.id)).toEqual(['p1', 'p2', 'p3'])
    expect(paged).toMatchObject({ hasMore: true, nextCursor: '3', stoppedBy: 'maxResults' })
    expect(calls.slice(2).map((call) => call.line)).toEqual(['GET /v1/crawl/task-1/pages?limit=2&includeDuplicates=true', 'GET /v1/crawl/task-1/pages?cursor=2&limit=1&includeDuplicates=true'])
    expect(await callTool(client, 'get_batch_items', { id: 'batch-1', maxResults: 5 })).toMatchObject({ items: all, nextCursor: null, hasMore: false, stoppedBy: 'end' })
    // Without maxResults the tool answers one page, as before.
    expect(await callTool(client, 'get_crawl_pages', { id: 'task-1', limit: 2 })).toMatchObject({ items: all.slice(0, 2), hasMore: true })
    const crawl = TOOLS.find((tool) => tool.name === 'crawl')?.inputSchema.properties as Record<string, unknown>
    expect(crawl.sitemap).toMatchObject({ type: 'string', enum: ['include', 'skip', 'only'] })
    expect(crawl.maxConcurrency).toMatchObject({ type: 'integer', minimum: 1 })
    for (const name of ['get_crawl_pages', 'get_batch_items']) expect((TOOLS.find((tool) => tool.name === name)?.inputSchema.properties as Record<string, unknown>).maxResults).toMatchObject({ type: 'integer', minimum: 1, maximum: 200 })
    expect(TOOLS.find((tool) => tool.name === 'list_active_crawls')?.inputSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false })
    await expect(callTool(client, 'crawl', { url: 'https://example.com/', sitemap: 'later' })).rejects.toThrow('sitemap must be include, skip, or only')
    await expect(callTool(client, 'get_crawl_pages', { id: 'task-1', maxResults: 201 })).rejects.toThrow('maxResults must be an integer between 1 and 200')
    await expect(callTool(client, 'list_active_crawls', { teamId: 't1' })).rejects.toThrow('unsupported parameter: teamId')
  })

  it('declares allowExternalLinks and includeSubdomains on batch_scrape as false only, forwards false as sent, and refuses true by name', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return json({ taskId: 'task-1' }, 202) }) as typeof fetch })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], allowExternalLinks: false, includeSubdomains: false })
    expect(bodies).toEqual([{ urls: ['https://example.com/a'], allowExternalLinks: false, includeSubdomains: false, origin: SDK_ORIGIN }])
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], allowExternalLinks: true })).rejects.toThrow('allowExternalLinks: true is not offered on a batch')
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], includeSubdomains: true })).rejects.toThrow('a crawl takes allowSubdomains')
    expect(bodies).toHaveLength(1)
    const properties = TOOLS.find(tool => tool.name === 'batch_scrape')?.inputSchema.properties as Record<string, { type?: string; const?: unknown }>
    expect(properties.allowExternalLinks).toMatchObject({ type: 'boolean', const: false })
    expect(properties.includeSubdomains).toMatchObject({ type: 'boolean', const: false })
    // MCP streams nothing; the tool that waits says where the streams are.
    expect(TOOLS.find(tool => tool.name === 'wait_batch')?.description).toContain('MCP has no event stream')
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
      { url: 'https://example.com/', debug: false, ...options, origin: SDK_ORIGIN },
      { url: 'https://example.com/', ...options, origin: SDK_ORIGIN },
      { urls: ['https://example.com/a'], ...options, origin: SDK_ORIGIN },
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

  it('offers the html and rawHtml formats and forwards includeTags and excludeTags for scrape, crawl and batch_scrape', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return String(input).endsWith('/v1/scrape') ? json({ status: 'success' }) : json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const options = { formats: ['markdown', 'html', 'rawHtml'], includeTags: ['article'], excludeTags: ['.ad'] }
    await callTool(client, 'scrape', { url: 'https://example.com/', ...options })
    await callTool(client, 'crawl', { url: 'https://example.com/', ...options })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], ...options })
    expect(bodies).toEqual([
      { url: 'https://example.com/', debug: false, ...options, origin: SDK_ORIGIN },
      { url: 'https://example.com/', ...options, origin: SDK_ORIGIN },
      { urls: ['https://example.com/a'], ...options, origin: SDK_ORIGIN },
    ])
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      const properties = TOOLS.find(tool => tool.name === name)?.inputSchema.properties as Record<string, unknown>
      expect(JSON.stringify(properties.formats)).toContain('["markdown","links","json","html","rawHtml","images","tables","screenshot","screenshot@fullPage"]')
      expect(properties).toMatchObject({
        includeTags: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 200 } },
        excludeTags: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 200 } },
      })
    }
    // The list's shape is checked before any API call, as for every other option.
    await expect(callTool(client, 'scrape', { url: 'https://example.com/', includeTags: 'article' })).rejects.toThrow('includeTags must be an array of at most 100 CSS selectors')
    expect(bodies).toHaveLength(3)
  })

  it('offers the images format and an attributes entry, and forwards them with removeBase64Images for scrape, crawl and batch_scrape', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return String(input).endsWith('/v1/scrape') ? json({ status: 'success' }) : json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const options = { formats: ['markdown', 'images', { type: 'attributes', selectors: [{ selector: 'span.titleline > a', attribute: 'href' }] }], removeBase64Images: false }
    await callTool(client, 'scrape', { url: 'https://example.com/', ...options })
    await callTool(client, 'crawl', { url: 'https://example.com/', ...options })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], ...options })
    expect(bodies).toEqual([
      { url: 'https://example.com/', debug: false, ...options, origin: SDK_ORIGIN },
      { url: 'https://example.com/', ...options, origin: SDK_ORIGIN },
      { urls: ['https://example.com/a'], ...options, origin: SDK_ORIGIN },
    ])
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      const properties = TOOLS.find(tool => tool.name === name)?.inputSchema.properties as Record<string, unknown>
      expect(JSON.stringify(properties.formats)).toContain('"attributes"')
      expect(properties).toMatchObject({ removeBase64Images: { type: 'boolean' } })
    }
    // The entry's shape is checked before any API call, as for every other option.
    await expect(callTool(client, 'scrape', { url: 'https://example.com/', formats: ['attributes'] })).rejects.toThrow('attributes format requires selectors')
    expect(bodies).toHaveLength(3)
  })

  it('offers the cache options and forwards them for scrape, crawl and batch_scrape', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return String(input).endsWith('/v1/scrape') ? json({ status: 'success' }) : json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const options = { maxAge: 3_600_000, minAge: 0, storeInCache: false, lockdown: true }
    await callTool(client, 'scrape', { url: 'https://example.com/', ...options })
    await callTool(client, 'crawl', { url: 'https://example.com/', ...options, sitemap: 'skip' })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], ...options })
    expect(bodies).toEqual([
      { url: 'https://example.com/', debug: false, ...options, origin: SDK_ORIGIN },
      { url: 'https://example.com/', ...options, sitemap: 'skip', origin: SDK_ORIGIN },
      { urls: ['https://example.com/a'], ...options, origin: SDK_ORIGIN },
    ])
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      const properties = TOOLS.find(tool => tool.name === name)?.inputSchema.properties as Record<string, unknown>
      expect(properties).toMatchObject({ maxAge: { type: 'integer', minimum: 0 }, minAge: { type: 'integer' }, storeInCache: { type: 'boolean' }, lockdown: { type: 'boolean' } })
    }
    // A contradiction is refused before any API call.
    await expect(callTool(client, 'scrape', { url: 'https://example.com/', lockdown: true, maxAge: 0 })).rejects.toThrow(/lockdown answers from the cache alone/)
    expect(bodies).toHaveLength(3)
  })

  it('offers the screenshot format as a string, the full-page alias and an entry, and forwards it for scrape, crawl and batch_scrape', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return String(input).endsWith('/v1/scrape') ? json({ status: 'success' }) : json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const entry = { type: 'screenshot', fullPage: true, quality: 60, viewport: { width: 800, height: 600 } }
    await callTool(client, 'scrape', { url: 'https://example.com/', formats: ['markdown', 'screenshot'] })
    await callTool(client, 'crawl', { url: 'https://example.com/', formats: ['screenshot@fullPage'] })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], formats: ['markdown', entry] })
    expect(bodies).toEqual([
      { url: 'https://example.com/', debug: false, formats: ['markdown', 'screenshot'], origin: SDK_ORIGIN },
      { url: 'https://example.com/', formats: [{ type: 'screenshot', fullPage: true }], origin: SDK_ORIGIN },
      { urls: ['https://example.com/a'], formats: ['markdown', entry], origin: SDK_ORIGIN },
    ])
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      const properties = TOOLS.find(tool => tool.name === name)?.inputSchema.properties as Record<string, unknown>
      expect(JSON.stringify(properties.formats)).toContain('"screenshot@fullPage"')
      expect(JSON.stringify(properties.formats)).toContain('{"const":"screenshot"}')
    }
    // The entry's bounds are checked before any API call, as for every other option.
    await expect(callTool(client, 'scrape', { url: 'https://example.com/', formats: [{ type: 'screenshot', quality: 101 }] })).rejects.toThrow('screenshot quality must be an integer between 1 and 100')
    expect(bodies).toHaveLength(3)
  })

  it('declares and forwards a recorded robots override, takes ignoreRobotsTxt on crawl and map alone', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      bodies.push(init?.body ? JSON.parse(String(init.body)) : null)
      return String(input).endsWith('/v1/batches') || String(input).endsWith('/v1/crawl') ? json({ taskId: 'task-2' }, 202) : json({ status: 'success', markdown: 'ok', requestedUrl: 'https://example.com/r.pdf' })
    }) as typeof fetch })
    await callTool(client, 'scrape', { url: 'https://example.com/r.pdf', robotsOverride: { reason: 'publisher link' } })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/r.pdf'], robotsOverrides: [{ url: 'https://example.com/r.pdf', reason: 'publisher link', recordedBy: 'analyst' }] })
    expect(bodies[0]).toMatchObject({ robotsOverride: { reason: 'publisher link' } })
    expect(bodies[1]).toMatchObject({ robotsOverrides: [{ url: 'https://example.com/r.pdf', reason: 'publisher link', recordedBy: 'analyst' }] })
    expect((TOOLS.find(tool => tool.name === 'scrape')?.inputSchema.properties as Record<string, unknown>).robotsOverride).toMatchObject({ type: 'object', required: ['reason'] })
    expect((TOOLS.find(tool => tool.name === 'batch_scrape')?.inputSchema.properties as Record<string, unknown>).robotsOverrides).toMatchObject({ type: 'array' })
    expect(TOOLS.find(tool => tool.name === 'crawl')?.inputSchema.properties).not.toHaveProperty('robotsOverride')
    await expect(callTool(client, 'scrape', { url: 'https://example.com/', ignoreRobotsTxt: true })).rejects.toThrow('unsupported parameter: ignoreRobotsTxt')
    await callTool(client, 'crawl', { url: 'https://example.com/', ignoreRobotsTxt: true })
    expect(bodies[2]).toMatchObject({ url: 'https://example.com/', ignoreRobotsTxt: true })
    for (const name of ['crawl', 'map']) expect((TOOLS.find(tool => tool.name === name)?.inputSchema.properties as Record<string, unknown>).ignoreRobotsTxt, name).toMatchObject({ type: 'boolean' })
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/'], robotsOverrides: [{ url: 'https://other.example/', reason: 'r' }] })).rejects.toThrow('robotsOverrides[0].url is not one of the batch urls')
  })

  it('declares and forwards headers, mobile, skipTlsVerification, fastMode and blockAds for scrape, crawl and batch_scrape, and refuses by name before any call', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return String(input).endsWith('/v1/scrape') ? json({ status: 'success' }) : json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const options = { headers: { 'X-Test': 'w2l', 'Accept-Language': 'de' }, mobile: true, skipTlsVerification: true, fastMode: true, blockAds: false }
    const sent = { ...options, headers: { 'x-test': 'w2l', 'accept-language': 'de' }, origin: SDK_ORIGIN }
    await callTool(client, 'scrape', { url: 'https://example.com/', ...options })
    await callTool(client, 'crawl', { url: 'https://example.com/', ...options })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], ...options })
    expect(bodies).toEqual([
      { url: 'https://example.com/', debug: false, ...sent },
      { url: 'https://example.com/', ...sent },
      { urls: ['https://example.com/a'], ...sent },
    ])
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      expect(TOOLS.find(tool => tool.name === name)?.inputSchema.properties).toMatchObject({
        headers: { type: 'object', maxProperties: 32, additionalProperties: { type: 'string', maxLength: 4096 } },
        mobile: { type: 'boolean' },
        skipTlsVerification: { type: 'boolean' },
        fastMode: { type: 'boolean' },
        blockAds: { type: 'boolean' },
      })
    }
    await expect(callTool(client, 'scrape', { url: 'https://example.com/', headers: { 'User-Agent': 'curl/8' } })).rejects.toThrow("headers.user-agent is refused: the User-Agent and client hints are Octocrawl's declared identity")
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/'], headers: { Cookie: 'sid=1' } })).rejects.toThrow('headers.cookie is refused')
    await expect(callTool(client, 'crawl', { url: 'https://example.com/', mode: 'research', mobile: true })).rejects.toThrow('mobile is not available in research mode')
    expect(bodies).toHaveLength(3)
  })

  it('records a call under the client\'s name and version, forwards integration, refuses origin, and reads a scrape record', async () => {
    const calls: Array<{ line: string; body: Record<string, unknown> | null }> = []
    const record = { scrapeId: '7c1d4d2c-0f3e-4a7b-9b1a-2f0d4d1b5a6e', status: 'success', origin: 'mcp-parity-check@1', integration: 'parity-check' }
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      calls.push({ line: `${init?.method ?? 'GET'} ${String(input)}`, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (String(input).endsWith(`/v1/scrapes/${record.scrapeId}`)) return json(record)
      return String(input).endsWith('/v1/scrape') ? json({ status: 'success', metadata: { scrapeId: record.scrapeId } }) : json({ taskId: 'task-1' }, 202)
    }) as typeof fetch })
    const mcp = new Client({ name: 'parity-check', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([createMcpServer(client).connect(serverSide), mcp.connect(clientSide)])
    try {
      await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/', integration: 'parity-check' } })
      await mcp.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', maxPages: 1 } })
      await mcp.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/a'], integration: 'parity-check' } })
      await mcp.callTool({ name: 'scrape_product', arguments: { url: 'https://www.amazon.sg/dp/B000VW9PIK' } })
      expect(calls.map((call) => [call.body?.origin, call.body?.integration])).toEqual([['mcp-parity-check@1', 'parity-check'], ['mcp-parity-check@1', undefined], ['mcp-parity-check@1', 'parity-check'], ['mcp-parity-check@1', undefined]])
      expect(await mcp.callTool({ name: 'get_scrape', arguments: { id: record.scrapeId } })).toEqual({ content: [{ type: 'text', text: JSON.stringify(record) }] })
      expect(calls.at(-1)?.line).toBe(`GET http://127.0.0.1:8787/v1/scrapes/${record.scrapeId}`)
      // origin is the server's to record: a caller naming one is refused before any API call.
      await expect(mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/', origin: 'spoofed@1' } })).rejects.toThrow('unsupported_parameter: unsupported parameter: origin')
      await expect(mcp.callTool({ name: 'get_scrape', arguments: {} })).rejects.toThrow('id is required')
      expect(calls).toHaveLength(5)
    } finally {
      await mcp.close()
    }
    // The server's own version, as scripts/release-version.mjs sets it: a release must not have to edit this test.
    expect(mcpOrigin(undefined)).toBe(`mcp@${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`)
    expect(mcpOrigin({ name: 'Claude Desktop', version: '1.0 beta' })).toBe('mcp-Claude_Desktop@1.0_beta')
    expect(mcpOrigin({ name: 'x'.repeat(200), version: '1' })).toHaveLength(100)
    for (const name of ['scrape', 'crawl', 'batch_scrape']) {
      const properties = TOOLS.find((tool) => tool.name === name)?.inputSchema.properties as Record<string, unknown>
      expect(properties.integration).toMatchObject({ type: 'string', minLength: 1, maxLength: 100 })
      expect(properties).not.toHaveProperty('origin')
    }
  })

  it('turns the API\'s 429 into a plain error naming the wait', async () => {
    const body = { error: 'rate limit exceeded: 2 requests per minute', code: 'rate_limited', retryAfterSeconds: 7, agentHints: ['wait 7 s before the next request'] }
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async () => new Response(JSON.stringify(body), { status: 429, headers: { 'retry-after': '7' } })) as typeof fetch })
    await expect(callTool(client, 'scrape', { url: 'https://example.com/' })).rejects.toThrow('rate limited: retry after 7 s (rate_limited)')
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/'] })).rejects.toThrow('rate limited: retry after 7 s (rate_limited)')
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

  it('declares maxConcurrency and ignoreInvalidURLs on batch_scrape, forwards them with the urls as sent, and reads a batch\'s errors', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      const url = String(input)
      calls.push({ line: `${init?.method ?? 'GET'} ${url}`, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.endsWith('/v1/batches')) return json({ taskId: 'batch-1', invalidURLs: ['not a url'] }, 202)
      return json({ errors: [{ id: 's1', timestamp: 't', url: 'https://example.com/b', status: 'failed', code: 'http_error', error: 'failed: http_error (HTTP 404)', httpStatus: 404 }], robotsBlocked: [], nextCursor: null, hasMore: false })
    }) as typeof fetch })
    // The server's list is authoritative: the entries go as the caller sent them, the API reports the ones it skipped.
    expect(await callTool(client, 'batch_scrape', { urls: ['https://example.com/a', 'not a url'], ignoreInvalidURLs: true, maxConcurrency: 2 })).toEqual({ taskId: 'batch-1', invalidURLs: ['not a url'] })
    expect(calls[0]?.body).toEqual({ urls: ['https://example.com/a', 'not a url'], ignoreInvalidURLs: true, maxConcurrency: 2, origin: SDK_ORIGIN })
    expect((await callTool(client, 'get_batch_errors', { id: 'batch-1', limit: 5 }) as { errors: unknown[] }).errors).toHaveLength(1)
    expect(calls[1]?.line).toBe('GET http://127.0.0.1:8787/v1/batches/batch-1/errors?limit=5')
    const batch = TOOLS.find((tool) => tool.name === 'batch_scrape')?.inputSchema.properties as Record<string, unknown>
    expect(JSON.stringify(batch)).toContain('"maxConcurrency"')
    expect(batch.maxConcurrency).toMatchObject({ type: 'integer', minimum: 1, maximum: 4 })
    expect(batch.ignoreInvalidURLs).toMatchObject({ type: 'boolean' })
    expect(TOOLS.find((tool) => tool.name === 'get_batch_errors')?.inputSchema).toMatchObject({ properties: { id: { type: 'string' }, cursor: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, required: ['id'] })
    // Refused before any call, by the contract's own messages.
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/'], maxConcurrency: 5 })).rejects.toThrow('maxConcurrency must be an integer between 1 and 4')
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/', 'not a url'] })).rejects.toThrow('urls[1] must be http(s)')
    await expect(callTool(client, 'get_batch_errors', { id: 'batch-1', limit: 1001 })).rejects.toThrow('limit must be an integer between 1 and 1000')
    await expect(callTool(client, 'get_batch_errors', {})).rejects.toThrow('id is required')
    expect(calls).toHaveLength(2)
  })

  it('a scrape asks for its page to be handed to the person when the call does', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return json({ status: 'success' }) }) as typeof fetch })
    await callTool(client, 'scrape', { url: 'https://example.com/', handoff: true })
    await callTool(client, 'scrape', { url: 'https://example.com/', handoff: { waitMs: 60_000 } })
    expect(bodies.map((body) => (body as { handoff?: unknown }).handoff)).toEqual([{}, { waitMs: 60_000 }])
  })

  it('a scrape and a batch ask for the my-browser lane when the call does, and the tools name it', async () => {
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => { bodies.push(JSON.parse(String(init?.body))); return String(input).endsWith('/v1/batches') ? json({ taskId: 't1' }, 202) : json({ status: 'success' }) }) as typeof fetch })
    await callTool(client, 'scrape', { url: 'https://example.com/', lane: 'my-browser' })
    expect(bodies).toEqual([expect.objectContaining({ lane: 'my-browser' })])
    expect(TOOLS.find((tool) => tool.name === 'scrape')?.inputSchema.properties).toMatchObject({ lane: { type: 'string', enum: ['my-browser'] } })
    expect(TOOLS.find((tool) => tool.name === 'batch_scrape')?.inputSchema.properties).toMatchObject({ lane: { type: 'string', enum: ['my-browser'] } })
    for (const name of ['scrape', 'batch_scrape']) expect(TOOLS.find((tool) => tool.name === name)?.inputSchema.properties).toMatchObject({ access: { type: 'string', enum: ['standard', 'enhanced', 'my-browser'] } })
    expect(TOOLS.find((tool) => tool.name === 'crawl')?.inputSchema.properties).toMatchObject({ access: { type: 'string', enum: ['standard', 'enhanced'] } })
    await callTool(client, 'scrape', { url: 'https://example.com/', access: 'standard' })
    expect(bodies.at(-1)).toMatchObject({ access: 'standard' })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/'], lane: 'my-browser' })
    expect(bodies.at(-1)).toMatchObject({ lane: 'my-browser' })
    await expect(callTool(client, 'scrape', { url: 'https://example.com/', lane: 'browser' })).rejects.toThrow('lane must be one of: my-browser')
  })

  it('imports, lists and forgets the person\'s saved logins through the API, never a cookie', async () => {
    const calls: string[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)} ${init?.body ?? ''}`)
      if (String(input).endsWith('/v1/logins')) return json({ logins: [] })
      if (init?.method === 'DELETE') return json({ site: 'example.com', removed: true })
      return json({ domain: 'example.com', savedAt: '2026-10-04T00:00:00.000Z', cookieCount: 3, sessionSha256: 'a'.repeat(64) })
    }) as typeof fetch })
    expect(await callTool(client, 'import_login', { site: ' example.com ', approveTimeoutMs: 60_000 })).toMatchObject({ domain: 'example.com', cookieCount: 3 })
    expect(await callTool(client, 'list_logins', {})).toEqual({ logins: [] })
    expect(await callTool(client, 'remove_login', { site: 'example.com' })).toEqual({ site: 'example.com', removed: true })
    expect(calls).toEqual([
      'POST http://127.0.0.1:8787/v1/logins/import {"approveTimeoutMs":60000,"site":"example.com"}',
      'GET http://127.0.0.1:8787/v1/logins ',
      'DELETE http://127.0.0.1:8787/v1/logins/example.com ',
    ])
    await expect(callTool(client, 'import_login', {})).rejects.toThrow('site must be a domain or a page URL')
    await expect(callTool(client, 'remove_login', {})).rejects.toThrow('site is required')
  })

  it('hands a batch\'s stopped items to the person through the API, with how long to wait for them', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      calls.push({ line: `${init?.method ?? 'GET'} ${String(input)}`, body: init?.body ? JSON.parse(String(init.body)) : null })
      return json({ id: 'batch-1', handedOff: 1, through: 1, notThrough: 0, items: [{ id: 's1', url: 'https://example.com/a', through: true, status: 'success' }] })
    }) as typeof fetch })
    expect(await callTool(client, 'hand_off_batch', { id: 'batch-1', waitMs: 60_000 })).toMatchObject({ through: 1 })
    expect(calls).toEqual([{ line: 'POST http://127.0.0.1:8787/v1/batches/batch-1/handoff', body: { waitMs: 60_000 } }])
    await expect(callTool(client, 'hand_off_batch', { id: 'batch-1', waitMs: 5 })).rejects.toThrow('waitMs must be an integer from 10000 to 1800000')
    await expect(callTool(client, 'hand_off_batch', {})).rejects.toThrow('id is required')
    expect(calls).toHaveLength(1)
  })

  it('declares and forwards idempotencyKey on crawl and batch_scrape, and appendToId on batch_scrape', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      const url = String(input)
      calls.push({ line: `${init?.method ?? 'GET'} ${url}`, body: init?.body ? JSON.parse(String(init.body)) : null })
      return json(url.endsWith('/v1/crawl') ? { taskId: 'crawl-1', replayed: true } : { taskId: 'batch-1', requested: 7, appended: 2 }, 202)
    }) as typeof fetch })
    expect(await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], idempotencyKey: 'nightly-1' })).toEqual({ taskId: 'batch-1', requested: 7, appended: 2 })
    expect(calls[0]?.body).toEqual({ urls: ['https://example.com/a'], idempotencyKey: 'nightly-1', origin: SDK_ORIGIN })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/b'], appendToId: 'batch-1', ignoreInvalidURLs: true })
    expect(calls[1]?.body).toEqual({ urls: ['https://example.com/b'], appendToId: 'batch-1', ignoreInvalidURLs: true, origin: SDK_ORIGIN })
    expect(await callTool(client, 'crawl', { url: 'https://example.com/', idempotencyKey: 'nightly-2' })).toEqual({ taskId: 'crawl-1', replayed: true })
    expect(calls[2]?.body).toMatchObject({ url: 'https://example.com/', idempotencyKey: 'nightly-2', origin: SDK_ORIGIN })
    const key = { type: 'string', minLength: 1, maxLength: 200 }
    const batch = TOOLS.find((tool) => tool.name === 'batch_scrape')?.inputSchema.properties as Record<string, unknown>
    expect(batch.idempotencyKey).toMatchObject(key)
    expect(batch.appendToId).toMatchObject(key)
    expect((TOOLS.find((tool) => tool.name === 'crawl')?.inputSchema.properties as Record<string, unknown>).idempotencyKey).toMatchObject(key)
    const scrape = TOOLS.find((tool) => tool.name === 'scrape')?.inputSchema.properties as Record<string, unknown>
    expect(scrape).not.toHaveProperty('idempotencyKey')
    expect(scrape).not.toHaveProperty('appendToId')
    // Refused before any call, by the contract's own messages.
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/'], idempotencyKey: '' })).rejects.toThrow('idempotencyKey must be a string of 1 to 200 characters')
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/'], appendToId: 'batch-1', formats: ['markdown'] })).rejects.toThrow('appendToId keeps the job\'s options; formats cannot be changed')
    await expect(callTool(client, 'crawl', { url: 'https://example.com/', appendToId: 'batch-1' })).rejects.toThrow('unsupported parameter: appendToId')
    expect(calls).toHaveLength(3)
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

  it('declares webhook on crawl and batch_scrape, forwards it, refuses a bad one before any call, and lists deliveries and destinations by jobId', async () => {
    const calls: Array<{ line: string; body: unknown }> = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input, init) => {
      const url = String(input)
      calls.push({ line: `${init?.method ?? 'GET'} ${url}`, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.includes('/v1/deliveries/page')) return json({ items: [{ id: 'd1', eventId: 'crawl-1:started', state: 'delivered', payload: { secret: 'body' } }], nextCursor: null, hasMore: false })
      if (url.includes('/v1/delivery/destinations')) return json([{ id: 'job:crawl-1', kind: 'job', headerNames: ['authorization'] }])
      return json({ taskId: url.endsWith('/v1/crawl') ? 'crawl-1' : 'batch-1' }, 202)
    }) as typeof fetch })
    const webhook = { url: 'https://receiver.example/hook', headers: { Authorization: 'Bearer test' }, metadata: { run: 'mcp' }, events: ['page', 'completed'] }
    await callTool(client, 'crawl', { url: 'https://example.com/', webhook })
    expect(calls[0]?.body).toMatchObject({ url: 'https://example.com/', webhook: { url: webhook.url, headers: { authorization: 'Bearer test' }, metadata: { run: 'mcp' }, events: ['page', 'completed'] } })
    await callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], webhook: 'https://receiver.example/hook' })
    expect(calls[1]?.body).toMatchObject({ urls: ['https://example.com/a'], webhook: { url: 'https://receiver.example/hook' } })
    await expect(callTool(client, 'crawl', { url: 'https://example.com/', webhook: { url: 'https://receiver.example/hook', headers: { Host: 'x' } } })).rejects.toThrow('webhook.headers: host is reserved')
    await expect(callTool(client, 'batch_scrape', { urls: ['https://example.com/a'], webhook: { url: 'https://receiver.example/hook', events: [] } })).rejects.toThrow('webhook.events must be a non-empty array')
    expect(calls).toHaveLength(2)
    const compact = await callTool(client, 'list_deliveries', { jobId: 'crawl-1' }) as { items: Array<Record<string, unknown>> }
    expect(calls[2]?.line).toBe('GET http://127.0.0.1:8787/v1/deliveries/page?jobId=crawl-1')
    expect(compact.items[0]).toMatchObject({ eventId: 'crawl-1:started', state: 'delivered' })
    expect(compact.items[0]).not.toHaveProperty('payload')
    expect(await callTool(client, 'list_delivery_destinations', { jobId: 'crawl-1' })).toEqual([{ id: 'job:crawl-1', kind: 'job', headerNames: ['authorization'] }])
    expect(calls[3]?.line).toBe('GET http://127.0.0.1:8787/v1/delivery/destinations?jobId=crawl-1')
    for (const name of ['crawl', 'batch_scrape']) {
      const properties = TOOLS.find((tool) => tool.name === name)?.inputSchema.properties as Record<string, { anyOf?: unknown[] }>
      expect(properties.webhook?.anyOf, name).toHaveLength(2)
    }
  })

  it('takes on scrape, batch_scrape and crawl every key the request takes, verify among them, but origin and parsers', () => {
    // origin is the host's own; parsers (PDF options) are not offered over MCP.
    const notOffered = ['origin', 'parsers']
    for (const [name, keys] of [['scrape', SCRAPE_KEYS], ['batch_scrape', BATCH_KEYS], ['crawl', CRAWL_KEYS]] as const) {
      const tool = TOOLS.find((t) => t.name === name)!
      const properties = Object.keys(tool.inputSchema.properties)
      expect((keys as readonly string[]).filter((key) => !properties.includes(key) && !notOffered.includes(key)), name).toEqual([])
      expect(properties.filter((key) => !(keys as readonly string[]).includes(key) && key !== 'debug'), name).toEqual([])
      expect((tool.inputSchema.properties as Record<string, { required?: string[] }>).verify?.required, name).toEqual(['checks'])
    }
  })

  it('offers map as a read-only tool with the map request\'s keys and an output schema, compact by default and in full with debug', async () => {
    const tool = TOOLS.find((t) => t.name === 'map')!
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual([...MAP_KEYS.filter((key) => key !== 'origin'), 'debug'].sort())
    expect(tool.inputSchema.additionalProperties).toBe(false)
    expect('annotations' in tool && tool.annotations).toEqual({ title: 'Map a site', readOnlyHint: true, idempotentHint: true, openWorldHint: true })
    expect('outputSchema' in tool && tool.outputSchema.required).toEqual(['id', 'status', 'stoppedBy', 'links'])
    const native: MapResponse = {
      id: 'map-1', url: 'https://example.com/docs/', status: 'partial', stoppedBy: 'timeout',
      links: [{ url: 'https://example.com/docs/', title: 'Docs', description: 'All docs', titleSource: 'page', via: ['start'], robots: 'allowed' }, { url: 'https://example.com/docs/a', via: ['sitemap'], sitemapFile: 'https://example.com/sitemap.xml', lastmod: '2026-10-01', robots: 'no_robots' }, { url: 'https://example.com/docs/private', via: ['link'], robots: 'disallowed' }],
      sources: { startPage: null, sitemap: null },
      refused: { duplicate: 1, collapsed: 2, hostDenied: 3, subtreeDenied: 0, pathDenied: 0, assetDenied: 0, robots: 1, robotsUnchecked: 0, searchFiltered: 4, overLimit: 0, samples: { collapsed: [], hostDenied: [], robots: [] } },
      identity: { mode: 'standard', userAgent: 'W2L/1' },
      warnings: [{ code: 'map_timeout', message: 'the map stopped at its 1000 ms timeout.' }, { code: 'sitemap_unreadable', message: '1 sitemap file was not read.' }],
      agentHints: ['raise timeout'], elapsedMs: 1000,
    }
    const bodies: unknown[] = []
    const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return String(input).endsWith('/v1/map') ? json(native) : json({ error: 'no' }, 404)
    }) as typeof fetch })
    expect(await callTool(client, 'map', { url: 'https://example.com/docs/', search: 'docs', sitemap: 'include', limit: 10, integration: 'nightly' }, { origin: 'mcp-test@1' })).toEqual({
      id: 'map-1', status: 'partial', stoppedBy: 'timeout',
      // A link robots.txt keeps out (returned under ignoreRobotsTxt) keeps its verdict; the others carry none.
      links: [{ url: 'https://example.com/docs/', title: 'Docs', description: 'All docs' }, { url: 'https://example.com/docs/a' }, { url: 'https://example.com/docs/private', robots: 'disallowed' }],
      warning: 'the map stopped at its 1000 ms timeout. 1 sitemap file was not read.', agentHints: ['raise timeout'], counts: { returned: 3, refused: 11 },
    })
    expect(bodies[0]).toEqual({ url: 'https://example.com/docs/', search: 'docs', sitemap: 'include', limit: 10, integration: 'nightly', origin: 'mcp-test@1' })
    expect(await callTool(client, 'map', { url: 'https://example.com/docs/', debug: true })).toEqual(native)
    // Refused by the shared parser before any API call, with the API's code over MCP.
    const mcp = new Client({ name: 'w2l-test', version: '1.0.0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([createMcpServer(client).connect(serverSide), mcp.connect(clientSide)])
    try {
      await expect(mcp.callTool({ name: 'map', arguments: { url: 'https://example.com/', limit: 0 } })).rejects.toThrow('invalid_request: limit must be an integer from 1 to 100000')
      await expect(mcp.callTool({ name: 'map', arguments: { url: 'https://example.com/', origin: 'x' } })).rejects.toThrow('unsupported_parameter: unsupported parameter: origin')
      await expect(mcp.callTool({ name: 'map', arguments: { url: 'https://example.com/', debug: 'yes' } })).rejects.toThrow('invalid_request: debug must be a boolean')
    } finally {
      await mcp.close()
    }
    expect(bodies).toHaveLength(2)
  })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
