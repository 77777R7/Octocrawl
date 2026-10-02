import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { identityForRoute } from '@w2l/contracts'
import { W2L } from '@w2l/sdk'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import { parseListen } from '../src/listen.js'

function httpOnlyChannels(mode: 'standard' | 'research' | 'authed') {
  return buildChannels(mode, {
    localSubjects: {
      browser_local: {
        fetch: async () => {
          throw new Error('API tests stay on HTTP; browser arm was reached')
        },
      },
    },
  })
}

describe('REST /v1/scrape and /v1/crawl', () => {
  let server: FixtureServer
  let engine: ApiEngine
  let taskRoot: string

  beforeAll(async () => {
    server = await startFixtureServer()
    taskRoot = await mkdtemp(join(tmpdir(), 'w2l-api-'))
    engine = createApiEngine({ taskRoot, channelsFor: httpOnlyChannels })
  })

  afterEach(async () => {
    await engine.close()
  })

  afterAll(async () => {
    await engine.close()
    await server.close()
    await rm(taskRoot, { recursive: true, force: true })
  })

  it('POST /v1/scrape returns a FetchResult for the listing fixture', async () => {
    const app = createApp(engine)
    const res = await app.request('/v1/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing` }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('success')
    expect(body.channelsTried).toEqual(['http'])
    expect(body.ladderTrace).toEqual(expect.any(Array))
    expect(body.summary.wallMs).toBeGreaterThanOrEqual(0)
    expect(body.markdown).toContain('Harbour lantern catalog')
    expect(body.links).toEqual(
      expect.arrayContaining([
        `${server.url}/crawl/item/1`,
        `${server.url}/crawl/listing`,
      ]),
    )
    expect(body).not.toHaveProperty('html')
  })

  it('returns a compact response before serialization and keeps debug opt-in', async () => {
    const app = createApp(engine)
    const request = async (debug: boolean) => app.request('/v1/scrape', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing`, formats: ['markdown'], debug }),
    })
    const compactText = await (await request(false)).text()
    const debugText = await (await request(true)).text()
    const compact = JSON.parse(compactText)
    expect(compact.markdown).toContain('Harbour lantern catalog')
    expect(compact).not.toHaveProperty('trace')
    expect(compact).not.toHaveProperty('ladderTrace')
    expect(compact).not.toHaveProperty('summary')
    expect(compact.usage.totalMs).toBeGreaterThanOrEqual(0)
    expect(JSON.parse(debugText).summary.attempts[0].result.markdown).toContain('Harbour lantern catalog')
    expect(Buffer.byteLength(compactText)).toBeLessThanOrEqual(Buffer.byteLength(debugText) * 0.6)
  })

  // POST a JSON body to the app and return the status with the parsed answer.
  const postJson = async (path: string, body: unknown) => {
    const res = await createApp(engine).request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() }
  }

  it('serves html and rawHtml when asked, without what excludeTags names, and repeats neither in the attempt audit', async () => {
    const url = `${server.url}/crawl/listing`
    const excluded = await postJson('/v1/scrape', { url, formats: ['markdown', 'html', 'rawHtml'], excludeTags: ['ul'], debug: false })
    expect(excluded.status).toBe(200)
    expect(excluded.body.formats).toEqual(['markdown', 'html', 'rawHtml'])
    expect(excluded.body.markdown).toContain('Harbour lantern catalog')
    expect(excluded.body.markdown).not.toContain('Harbour lantern teapot 01')
    // html is what the Markdown was written from; rawHtml is the body as received, the one the evidence hashes.
    expect(excluded.body.html).toContain('<h1>Harbour lantern catalog</h1>')
    expect(excluded.body.html).not.toContain('<ul>')
    expect(excluded.body.rawHtml).toMatch(/^<!doctype html>/)
    expect(excluded.body.rawHtml).toContain('<ul>')
    expect(createHash('sha256').update(excluded.body.rawHtml).digest('hex')).toBe(excluded.body.snapshot.rawBodySha256)
    // The full response carries them once: the attempt audit repeats neither.
    const full = await postJson('/v1/scrape', { url, formats: ['markdown', 'html', 'rawHtml'], excludeTags: ['ul'] })
    expect(full.body).toMatchObject({ status: 'success', html: excluded.body.html, rawHtml: excluded.body.rawHtml })
    expect(full.body.summary.attempts[0].result).not.toHaveProperty('html')
    expect(full.body.summary.attempts[0].result).not.toHaveProperty('rawHtml')
    expect(full.body.trace).toContainEqual(expect.objectContaining({ event: 'extract', detail: expect.objectContaining({ excludeTags: ['ul'] }) }))
  })

  it('keeps only what includeTags names, on a page, on an error page and through /fc', async () => {
    const url = `${server.url}/crawl/listing`
    const included = await postJson('/v1/scrape', { url, formats: ['markdown', 'html'], includeTags: ['main ul'], debug: false })
    expect(included.body.markdown).toBe([1, 2, 3].map((n) => `- [Harbour lantern teapot 0${n}](${server.url}/crawl/item/${n})`).join('\n'))
    expect(included.body.html).toMatch(/^<body><ul><li><a href="\/crawl\/item\/1">/)
    expect(included.body).toMatchObject({ status: 'success', lane: 'http', document: { confidence: 1 } })
    expect(included.body).not.toHaveProperty('rawHtml')
    // Nothing named on the page is an empty answer from the rung that read it, not a failure.
    const none = await postJson('/v1/scrape', { url, formats: ['markdown', 'html'], includeTags: ['table'], debug: false })
    expect(none.body).toMatchObject({ status: 'success', lane: 'http', markdown: '', html: '', channelsTried: ['http'] })
    // The page an error status carried is evidence, shaped the same way, and gives no html.
    const missing = `${server.url}/error/404`
    expect((await postJson('/v1/scrape', { url: missing, formats: ['markdown', 'html'], includeTags: ['h1'], debug: false })).body).toMatchObject({ status: 'failed', failureReason: 'http_error', markdown: '# Not Found', html: null })
    expect((await postJson('/v1/scrape', { url: missing, formats: ['markdown'], excludeTags: ['h1'], debug: false })).body).toMatchObject({ status: 'failed', failureReason: 'http_error', markdown: null })
    const shim = await postJson('/fc/v1/scrape', { url, formats: ['html', 'rawHtml'], includeTags: ['h1'] })
    expect(shim.body).toMatchObject({ success: true, data: { markdown: null, html: '<body><h1>Harbour lantern catalog</h1></body>' } })
    expect(shim.body.data.rawHtml).toMatch(/^<!doctype html>/)
  })

  it('refuses by name a selector that does not parse, and one whose matching the page does not bound', async () => {
    const url = `${server.url}/crawl/listing`
    const broken = { error: 'includeTags entry is not a valid CSS selector: div[[', code: 'invalid_request' }
    expect(await postJson('/v1/scrape', { url, includeTags: ['div[['] })).toEqual({ status: 400, body: broken })
    expect(await postJson('/v1/batches', { urls: [url], includeTags: ['div[['] })).toEqual({ status: 400, body: broken })
    expect(await postJson('/fc/v1/scrape', { url, includeTags: ['div[['] })).toEqual({ status: 400, body: { success: false, ...broken } })
    expect(await postJson('/v1/crawl', { url, excludeTags: ['nav', 'p::before'] })).toEqual({ status: 400, body: { error: 'excludeTags entry is not a valid CSS selector: p::before', code: 'invalid_request' } })
    // What the selector uses, and its place in the request.
    expect(await postJson('/v1/scrape', { url, excludeTags: ['nav', 'li:nth-child(2)'] })).toEqual({ status: 400, body: {
      error: 'excludeTags entry uses :nth-child, which W2L does not match: li:nth-child(2) (supported: tag, class, id and attribute selectors, the descendant and child combinators, :root, :empty, and :not(), :is() and :where() around selectors without combinators)',
      code: 'unsupported_parameter',
      details: { parameters: ['excludeTags[1]'] },
    } })
    expect(await postJson('/v1/batches', { urls: [url], includeTags: ['h2 ~ p'] })).toMatchObject({ status: 400, body: { error: expect.stringContaining('includeTags entry uses the sibling combinator ~'), code: 'unsupported_parameter', details: { parameters: ['includeTags[0]'] } } })
    // A list is bounded by its parts in all, since each costs the page a test of every element: 34 x 3 is over, 50 x 2 is at the limit.
    const wide = Array.from({ length: 34 }, () => 'main > article p')
    const tooMany = { error: 'includeTags must hold at most 100 selector parts in all, and holds 102 (a tag name, *, a class, an id, an attribute test and a pseudo-class each count as one)', code: 'invalid_request' }
    expect(await postJson('/v1/scrape', { url, includeTags: wide })).toEqual({ status: 400, body: tooMany })
    expect(await postJson('/fc/v1/scrape', { url, includeTags: wide })).toEqual({ status: 400, body: { success: false, ...tooMany } })
    expect(await postJson('/v1/crawl', { url, excludeTags: [...wide, ':is(h1, h2)'] })).toEqual({ status: 400, body: { ...tooMany, error: tooMany.error.replace('includeTags', 'excludeTags').replace('102', '105') } })
    expect(await postJson('/v1/scrape', { url, includeTags: Array.from({ length: 50 }, () => 'ul li'), debug: false })).toMatchObject({ status: 200, body: { status: 'success', lane: 'http' } })
  })

  it('returns a 404 page and its status as evidence in every response shape, never as success', async () => {
    const app = createApp(engine)
    const post = async (path: string, body: Record<string, unknown>) => (await app.request(path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/error/404`, ...body }),
    })).json()
    const snapshot = { httpStatus: 404, contentType: 'text/html; charset=utf-8', rawBodySha256: expect.stringMatching(/^[0-9a-f]{64}$/) }
    const full = await post('/v1/scrape', { formats: ['markdown'] })
    expect(full).toMatchObject({ status: 'failed', failureReason: 'http_error', evidence: { httpStatus: 404 }, snapshot })
    expect(full.markdown).toContain('Not Found')
    const compact = await post('/v1/scrape', { formats: ['markdown'], debug: false })
    expect(compact).toMatchObject({ status: 'failed', failureReason: 'http_error', snapshot })
    expect(compact.markdown).toContain('Not Found')
    const shim = await post('/fc/v1/scrape', {})
    expect(shim).toMatchObject({ success: false, error: 'failed: http_error', data: { metadata: { url: `${server.url}/error/404`, statusCode: 404, contentType: 'text/html; charset=utf-8', error: 'http_error' } } })
    expect(shim.data.markdown).toContain('Not Found')
  })

  it('returns the page metadata on full and compact scrapes, /fc, batch items and crawl pages', async () => {
    const app = createApp(engine)
    const url = `${server.url}/crawl/listing`
    const post = async (path: string, body: Record<string, unknown>) => (await app.request(path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })).json()
    const declared = {
      title: 'Harbour lantern catalog',
      description: 'Synthetic fixture page for benchmark purposes.',
      language: 'en',
      keywords: null,
      robots: null,
      favicon: null,
      canonicalUrl: null,
    }
    expect((await post('/v1/scrape', { url })).metadata).toEqual(declared)
    expect((await post('/v1/scrape', { url, formats: ['markdown'], debug: false })).metadata).toEqual(declared)
    expect((await post('/fc/v1/scrape', { url })).data.metadata).toEqual({
      title: 'Harbour lantern catalog',
      description: 'Synthetic fixture page for benchmark purposes.',
      language: 'en',
      sourceURL: url,
      url,
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
    })
    const batch = await post('/v1/batches', { urls: [url] })
    const crawl = await post('/v1/crawl', { url, maxPages: 1 })
    await engine.close()
    const items = await (await app.request(`/v1/batches/${batch.taskId}/items`)).json()
    const pages = await (await app.request(`/v1/crawl/${crawl.taskId}/pages`)).json()
    expect(items.items.map((item: { metadata?: unknown }) => item.metadata)).toEqual([declared])
    expect(pages.items.map((item: { metadata?: unknown }) => item.metadata)).toEqual([declared])
  })

  it('supports JSON-only and Markdown plus JSON without changing legacy defaults', async () => {
    const app = createApp(engine)
    const schema = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
    const scrape = async (formats: unknown[]) => (await app.request('/v1/scrape', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing`, formats, debug: false }),
    })).json()
    const only = await scrape([{ type: 'json', schema }])
    expect(only).not.toHaveProperty('markdown')
    expect(only.json.status).toBe('complete')
    expect(only.json.data.title).toBe('Harbour lantern catalog')
    const both = await scrape(['markdown', { type: 'json', schema }])
    expect(both.markdown).toContain('Harbour lantern catalog')
    expect(both.json.data.title).toBe('Harbour lantern catalog')
  })

  it('reads JSON numbers as the page writes them, and leaves one it cannot settle unfilled with the text quoted', async () => {
    const shop = (price: string) => `<!doctype html><html lang="de"><head><title>Messinglampe | Shop</title></head><body><main><h1>Messinglampe</h1><p class="price">${price}</p>` +
      '<p>Eine Messinglampe mit mattiertem Glasschirm, passend für Schreibtisch oder Nachttisch und für eine Standardfassung verdrahtet.</p></main></body></html>'
    const pages: Record<string, string> = { '/a': shop('12,99 €'), '/b': shop('1.299,00 €'), '/c': shop('1 299,00 €'), '/d': shop('1.299 €') }
    const local = createServer((req, res) => {
      const body = pages[req.url ?? '']
      if (body === undefined) res.writeHead(404).end()
      else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body)
    })
    await new Promise<void>(resolve => local.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(local.address() as AddressInfo).port}`
    try {
      const app = createApp(engine)
      const schema = { type: 'object', properties: { title: { type: 'string' }, price: { type: 'number' } }, required: ['title', 'price'] }
      const scrape = async (path: string) => (await app.request('/v1/scrape', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: origin + path, formats: [{ type: 'json', schema }], debug: false }),
      })).json()
      for (const [path, price, text] of [['/a', 12.99, '12,99 €'], ['/b', 1299, '1.299,00 €'], ['/c', 1299, '1 299,00 €']] as const) {
        const out = await scrape(path)
        expect(out.json, path).toMatchObject({ status: 'complete', data: { title: 'Messinglampe', price } })
        expect(out.json.evidence, path).toContainEqual({ path: '/price', source: 'text', evidencePath: 'p.price', text })
        expect(out.evidenceRecord.fieldEvidence['/price'], path).toEqual({ source: 'text', locator: 'p.price' })
      }
      const unsettled = await scrape('/d')
      expect(unsettled.json).toMatchObject({ status: 'incomplete', data: { title: 'Messinglampe' } })
      expect(unsettled.json.data).not.toHaveProperty('price')
      expect(unsettled.json.issues[0]).toMatchObject({ code: 'field_unavailable', path: '/price', message: expect.stringContaining('the page states "1.299 €"') })
      expect(unsettled.evidenceRecord.fieldEvidence).not.toHaveProperty('/price')
    } finally {
      await new Promise<void>(resolve => local.close(() => resolve()))
    }
  })

  it('scrapes a robots-disallowed URL under a recorded override, keeps the warning on the full and compact responses, and refuses a blanket ignoreRobotsTxt', async () => {
    let reportHits = 0
    const local = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /'); return }
      reportHits++
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><head><title>Annual report</title></head><body><main><article><h1>Annual report</h1><p>The publisher links this report from its own pages, while the host that serves it tells every crawler to stay out; a researcher fetches it once, under a recorded decision, to cite its figures.</p><p>The report itself is ordinary prose, long enough for the extraction cascade to accept it as the main content of the page.</p></article></main></body></html>')
    })
    await new Promise<void>(resolve => local.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(local.address() as AddressInfo).port}/report`
    try {
      const app = createApp(engine)
      const post = (body: unknown) => app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const robotsOverride = { reason: 'The publisher links this report itself; the host rule addresses crawlers.', recordedBy: 'analyst' }
      const full = await (await post({ url, robotsOverride })).json()
      expect(full).toMatchObject({ status: 'success', channelsTried: ['http'], warnings: [{ code: 'robots_overridden', message: expect.stringContaining('(rule /); it was fetched under an override recorded by analyst') }] })
      expect(full.trace.map((event: { event: string }) => event.event)).toEqual(expect.arrayContaining(['robots_checked', 'robots_disallowed', 'robots_overridden']))
      const compact = await (await post({ url, robotsOverride, debug: false })).json()
      expect(compact).toMatchObject({ status: 'success', warnings: [{ code: 'robots_overridden' }], evidenceRecord: { robotsDecision: { decision: 'disallowed', userOverride: true } } })
      expect(reportHits).toBe(2)
      const blanket = await post({ url, ignoreRobotsTxt: true })
      expect(blanket.status).toBe(400)
      expect(await blanket.json()).toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['ignoreRobotsTxt'] } })
      expect(reportHits).toBe(2)
    } finally {
      await new Promise<void>(resolve => local.close(() => resolve()))
    }
  })

  it('a hosted server takes no robots override: scrape and batch refuse the field by name, and nothing is fetched', async () => {
    const requests: string[] = []
    const local = createServer((req, res) => {
      requests.push(req.url ?? '')
      res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /')
    })
    await new Promise<void>(resolve => local.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(local.address() as AddressInfo).port}/report`
    const hostedRoot = await mkdtemp(join(tmpdir(), 'w2l-api-hosted-'))
    // The setting `npm run api -- --hosted` gives its engine; the fixture is on loopback, so the network policy stays local.
    const hosted = createApiEngine({ taskRoot: hostedRoot, channelsFor: httpOnlyChannels, allowRobotsOverride: parseListen(['--hosted', '--token', 'secret'], {}).allowRobotsOverride })
    try {
      const app = createApp(hosted)
      const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const reason = 'The publisher links this report itself.'
      const scrape = await post('/v1/scrape', { url, robotsOverride: { reason } })
      expect(scrape.status).toBe(400)
      expect(await scrape.json()).toMatchObject({ error: expect.stringContaining('unsupported parameter: robotsOverride '), code: 'unsupported_parameter', details: { parameters: ['robotsOverride'] } })
      const batch = await post('/v1/batches', { urls: [url], robotsOverrides: [{ url, reason }] })
      expect(batch.status).toBe(400)
      expect(await batch.json()).toMatchObject({ error: expect.stringContaining('unsupported parameter: robotsOverrides '), code: 'unsupported_parameter', details: { parameters: ['robotsOverrides'] } })
      expect(requests).toEqual([])
      // Without the field the same URL is a scrape like any other, and its rule holds.
      const plain = await post('/v1/scrape', { url })
      expect(plain.status).toBe(200)
      expect(await plain.json()).toMatchObject({ status: 'failed', failureReason: 'policy_denied', evidenceRecord: { robotsDecision: { decision: 'disallowed', userOverride: false } } })
      expect(requests).toEqual(['/robots.txt'])
    } finally {
      await hosted.close()
      await new Promise<void>(resolve => local.close(() => resolve()))
      await rm(hostedRoot, { recursive: true, force: true })
    }
  })

  it('POST /v1/crawl is 202 and GET /v1/crawl/:id returns CrawlReport', async () => {
    const app = createApp(engine)
    const started = await app.request('/v1/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${server.url}/crawl/listing`,
        maxPages: 4,
        maxDepth: 2,
      }),
    })
    expect(started.status).toBe(202)
    const { taskId } = (await started.json()) as { taskId: string }
    expect(taskId.length).toBeGreaterThan(0)

    await engine.close()
    const got = await app.request(`/v1/crawl/${taskId}`)
    expect(got.status).toBe(200)
    const report = await got.json()
    expect(report.taskId).toBe(taskId)
    expect(report.pagesFetched).toBeGreaterThanOrEqual(4)
    expect(report.status).toBe('completed')
  })

  it('SDK scrape / crawl / getCrawl talk to the same contract', async () => {
    const app = createApp(engine)
    const client = new W2L({
      baseUrl: 'http://w2l.test',
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const path = new URL(url).pathname
        return app.request(path, init)
      }) as typeof fetch,
    })
    const page = await client.scrape(`${server.url}/crawl/listing`)
    expect(page.status).toBe('success')
    const accepted = await client.crawl(`${server.url}/crawl/listing`, { maxPages: 1 })
    await engine.close()
    const report = await client.getCrawl(accepted.taskId)
    expect(report.taskId).toBe(accepted.taskId)
    expect(report.pagesFetched).toBe(1)
  })

  it('returns paginated pages and errors after the engine is restarted', async () => {
    const app = createApp(engine)
    const started = await app.request('/v1/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing`, maxPages: 4, maxDepth: 2 }),
    })
    const { taskId } = (await started.json()) as { taskId: string }
    await engine.close()

    const restarted = createApiEngine({ taskRoot, channelsFor: httpOnlyChannels })
    const restartedApp = createApp(restarted)
    try {
      const first = await restartedApp.request(`/v1/crawl/${taskId}/pages?limit=2`)
      expect(first.status).toBe(200)
      const firstPage = await first.json() as { items: Array<{ markdown: string | null; links?: string[] }>; nextCursor: string | null; hasMore: boolean }
      expect(firstPage.items).toHaveLength(2)
      expect(firstPage.items.every((item) => item.markdown !== null && item.links === undefined)).toBe(true)
      expect(firstPage.hasMore).toBe(true)

      const second = await restartedApp.request(`/v1/crawl/${taskId}/pages?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`)
      const secondPage = await second.json() as { items: unknown[]; hasMore: boolean }
      expect(secondPage.items).toHaveLength(2)
      expect(secondPage.hasMore).toBe(false)

      const errors = await restartedApp.request(`/v1/crawl/${taskId}/errors?limit=10`)
      expect(errors.status).toBe(200)
      expect((await errors.json()).items).toEqual([])
    } finally {
      await restarted.close()
    }
  })

  it('returns failed pages through the dedicated errors endpoint', async () => {
    const app = createApp(engine)
    const started = await app.request('/v1/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/error/404`, maxPages: 1 }),
    })
    const { taskId } = (await started.json()) as { taskId: string }
    await engine.close()

    const errors = await app.request(`/v1/crawl/${taskId}/errors?limit=10`)
    expect(errors.status).toBe(200)
    const body = await errors.json() as { items: Array<{ url: string; status: string; failureReason: string | null; trace: unknown[] }> }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      url: `${server.url}/error/404`,
      status: 'failed',
      failureReason: 'http_error',
    })
    expect(body.items[0]?.trace).toEqual(expect.any(Array))
  })

  it('rejects unknown keys and unsupported formats by name', async () => {
    const app = createApp(engine)
    const post = async (path: string, body: unknown) => {
      const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, error: ((await res.json()) as { error?: string }).error }
    }
    const url = `${server.url}/crawl/listing`
    expect(await post('/v1/scrape', { url, formats: ['markdown', 'links', 'screenshot', 'summary'] }))
      .toEqual({ status: 400, error: 'unsupported formats: screenshot, summary (supported: markdown, links, json, html, rawHtml)' })
    expect(await post('/v1/scrape', { url, actions: [] })).toMatchObject({ status: 400, error: expect.stringContaining('unsupported parameter: actions') })
    expect(await post('/v1/batches', { urls: [url], mobile: true })).toMatchObject({ status: 400, error: expect.stringContaining('unsupported parameter: mobile') })
    expect(await post('/v1/crawl', { url, limit: 2 })).toMatchObject({ status: 400, error: expect.stringContaining('unsupported parameter: limit') })
  })

  it('crawls with formats and pathname filters and returns absolute links on each page', async () => {
    const app = createApp(engine)
    const schema = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
    const started = await app.request('/v1/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing`, formats: ['markdown', 'links', { type: 'json', schema }], includePaths: ['^/crawl/item/'], excludePaths: ['^/crawl/item/2$'] }),
    })
    const { taskId } = (await started.json()) as { taskId: string }
    await engine.close()

    const restarted = createApiEngine({ taskRoot, channelsFor: httpOnlyChannels })
    try {
      const pages = await restarted.getCrawlPages(taskId, { limit: 10 })
      expect(pages?.items.map((item) => new URL(item.url).pathname).sort()).toEqual(['/crawl/item/1', '/crawl/item/3', '/crawl/listing'])
      expect(pages?.items.every((item) => item.markdown !== null && (item.links?.length ?? 0) > 0 && item.links!.every((link) => link.startsWith(`${server.url}/`)))).toBe(true)
      expect(pages?.items.every((item) => item.json?.status === 'complete' && typeof (item.json.data as { title?: unknown }).title === 'string')).toBe(true)
    } finally {
      await restarted.close()
    }
  })

  it('cancels a running crawl persistently and preserves completed pages', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const slow = createApiEngine({
      taskRoot,
      workerCount: 1,
      channelsFor: () => [{
        id: 'http',
        identity: identityForRoute('standard'),
        fetch: async () => {
          await gate
          return (await httpOnlyChannels('standard')[0]!.fetch(`${server.url}/crawl/listing`))
        },
      }],
    })
    const slowApp = createApp(slow)
    try {
      const started = await slowApp.request('/v1/crawl', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: `${server.url}/crawl/listing`, maxPages: 4 }),
      })
      const { taskId } = (await started.json()) as { taskId: string }
      const cancelled = await slowApp.request(`/v1/crawl/${taskId}/cancel`, { method: 'POST' })
      expect(cancelled.status).toBe(200)
      expect((await cancelled.json()).status).toBe('cancelled')
      release()
      await slow.close()

      const restarted = createApiEngine({ taskRoot, channelsFor: httpOnlyChannels })
      try {
        const report = await restarted.getCrawl(taskId)
        expect(report?.status).toBe('cancelled')
        const pages = await restarted.getCrawlPages(taskId, { limit: 10 })
        expect(pages?.items.length).toBeGreaterThanOrEqual(0)
      } finally {
        await restarted.close()
      }
    } finally {
      release()
      await slow.close()
    }
  })

  it('records a page whose scrape throws as a failed item, not a failed or running crawl', async () => {
    const throwingRoot = await mkdtemp(join(tmpdir(), 'w2l-api-fail-'))
    const throwing = createApiEngine({
      taskRoot: throwingRoot,
      channelsFor: () => [
        {
          id: 'http',
          identity: identityForRoute('standard'),
          fetch: async () => {
            throw new Error('scrape exploded')
          },
        },
      ],
    })
    try {
      const app = createApp(throwing)
      const started = await app.request('/v1/crawl', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: `${server.url}/crawl/listing`, maxPages: 1 }),
      })
      expect(started.status).toBe(202)
      const { taskId } = (await started.json()) as { taskId: string }
      await throwing.close()
      const got = await app.request(`/v1/crawl/${taskId}`)
      expect(got.status).toBe(200)
      const report = await got.json()
      expect(report.taskId).toBe(taskId)
      expect(report.status).toBe('completed')
      expect(report.pagesFetched).toBe(1)
      expect(report.loopDetected).toBe(false)
      const errors = await (await app.request(`/v1/crawl/${taskId}/errors?limit=10`)).json()
      expect(errors.items).toHaveLength(1)
      expect(errors.items[0]).toMatchObject({ status: 'failed', failureReason: 'internal_error' })
      expect(JSON.stringify(errors.items[0].trace)).toContain('scrape exploded')
    } finally {
      await throwing.close()
      await rm(throwingRoot, { recursive: true, force: true })
    }
  })

  it('hosted token rejects missing or wrong bearer, accepts the matching one', async () => {
    const app = createApp(engine, { token: 'secret' })
    const missing = await app.request('/v1/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing` }),
    })
    expect(missing.status).toBe(401)
    const wrong = await app.request('/v1/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer nope' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing` }),
    })
    expect(wrong.status).toBe(401)
    const ok = await app.request('/v1/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing` }),
    })
    expect(ok.status).toBe(200)
  })

  it('engine close waits for an active standalone scrape before closing channels', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    let closed = false
    const slow = createApiEngine({
      channelsFor: () => [{
        id: 'http',
        identity: identityForRoute('standard'),
        fetch: async (url) => {
          await pending
          return (await (async () => {
            const result = await httpOnlyChannels('standard')[0]!.fetch(url)
            return result
          })())
        },
        close: async () => { closed = true },
      }],
    })
    const scrape = slow.scrape({ url: `${server.url}/crawl/listing` })
    let drained = false
    const closing = slow.close().then(() => { drained = true })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(drained).toBe(false)
    expect(closed).toBe(false)
    release()
    await scrape
    await closing
    expect(drained).toBe(true)
    expect(closed).toBe(true)
  })
})
