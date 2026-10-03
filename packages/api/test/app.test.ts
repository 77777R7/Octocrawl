import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { identityForRoute, localNetworkPolicy, REFUSAL_HINTS, type FetchOptions, type ScreenshotEvidence } from '@w2l/contracts'
import { W2L } from '@w2l/sdk'
import { buildChannels } from '@w2l/bench'
import { SqliteTaskStore } from '@w2l/runtime'
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)

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

  it('serves the images and attributes formats when asked, on the full and compact responses, /fc and crawl pages, and refuses an attributes selector by name', async () => {
    const page = (n: number) => `<!doctype html><html><head><title>Gallery ${n}</title><meta property="og:image" content="/og/${n}.png"></head><body><main><h1>Gallery ${n}</h1><p>${PROSE}</p>` +
      `<figure><img src="/media/${n}.jpg" srcset="/media/${n}-2x.jpg 2x" alt="Plate ${n}"><img src="data:image/gif;base64,R0lGOD" alt="Spacer"></figure>${n === 1 ? '<p><a href="/gallery/2">Next</a></p>' : ''}</main></body></html>`
    const local = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(req.url === '/gallery/2' ? 2 : 1))
    })
    await new Promise<void>((resolve) => local.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(local.address() as AddressInfo).port}`
    const images = (n: number) => [`${origin}/og/${n}.png`, `${origin}/media/${n}.jpg`, `${origin}/media/${n}-2x.jpg`]
    try {
      const attributes = { type: 'attributes', selectors: [{ selector: 'main ul a', attribute: 'href' }, { selector: 'main h1', attribute: 'id' }] }
      const listing = `${server.url}/crawl/listing`
      // Values as written, in request then document order; a selector that matches nothing gives []; no json extraction runs.
      const compact = await postJson('/v1/scrape', { url: listing, formats: ['markdown', attributes], debug: false })
      expect(compact.body).toMatchObject({ status: 'success', formats: ['markdown', 'attributes'], attributes: [{ selector: 'main ul a', attribute: 'href', values: ['/crawl/item/1', '/crawl/item/2', '/crawl/item/3'] }, { selector: 'main h1', attribute: 'id', values: [] }] })
      expect(compact.body).not.toHaveProperty('json')
      expect(compact.body).not.toHaveProperty('images')
      const full = await postJson('/v1/scrape', { url: `${origin}/gallery`, formats: ['markdown', 'images'] })
      expect(full.body.images).toEqual(images(1))
      expect(full.body.trace).toContainEqual(expect.objectContaining({ event: 'images_collected', detail: { count: 3, srcsetCandidates: 1, lazy: 0, dataUrisDropped: 1 } }))
      expect(full.body.summary.attempts[0].result).not.toHaveProperty('images')
      // The default Markdown leaves the data: image out and keeps its alt text.
      expect(full.body.markdown).toContain('Spacer')
      expect(full.body.markdown).not.toContain('data:image')
      const kept = await postJson('/v1/scrape', { url: `${origin}/gallery`, formats: ['markdown'], removeBase64Images: false, debug: false })
      expect(kept.body.markdown).toContain('![Spacer](data:image/gif;base64,R0lGOD)')
      expect(kept.body.usage.contentTokens).toBeGreaterThan(full.body.usage.contentTokens)
      const shim = await postJson('/fc/v1/scrape', { url: `${origin}/gallery`, formats: ['markdown', 'images', attributes] })
      expect(shim.body.data).toMatchObject({ images: images(1), attributes: [{ selector: 'main ul a', attribute: 'href', values: [] }, { selector: 'main h1', attribute: 'id', values: [] }] })
      const plain = await postJson('/v1/scrape', { url: `${origin}/gallery`, formats: ['markdown'], debug: false })
      expect(plain.body.formats).toEqual(['markdown'])
      expect(plain.body).not.toHaveProperty('images')
      expect(await postJson('/v1/scrape', { url: listing, formats: ['markdown', { type: 'attributes', selectors: [{ selector: 'div[[', attribute: 'id' }] }] }))
        .toMatchObject({ status: 400, body: { error: 'attributes selectors[0].selector is not a valid CSS selector: div[[', code: 'invalid_request' } })
      expect(await postJson('/v1/scrape', { url: listing, formats: [{ type: 'attributes', selectors: [{ selector: 'li:nth-child(2)', attribute: 'id' }] }] }))
        .toMatchObject({ status: 400, body: { code: 'unsupported_parameter', details: { parameters: ['formats[0].selectors[0]'] } } })
      // A crawl carries images on each of its pages.
      const crawl = await postJson('/v1/crawl', { url: `${origin}/gallery`, formats: ['markdown', 'images'], maxPages: 2 })
      await engine.close()
      const pages = await (await createApp(engine).request(`/v1/crawl/${crawl.body.taskId}/pages`)).json()
      expect(pages.items.map((item: { url: string; images?: string[] }) => [new URL(item.url).pathname, item.images]).sort()).toEqual([['/gallery', images(1)], ['/gallery/2', images(2)]])
    } finally {
      local.closeAllConnections()
      await new Promise<void>((resolve) => local.close(() => resolve()))
    }
  })

  it('binds a screenshot request to the browser lane alone and serves the capture on the compact and full responses, /fc and batch items, never repeated in the audit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'w2l-shot-'))
    let httpCalls = 0
    const asked: unknown[] = []
    // The capture a browser lane would attach, shaped from what the engine asked it for.
    const shot = (options?: FetchOptions): ScreenshotEvidence => {
      const request = options?.screenshot ?? {}
      const viewport = request.viewport ?? { width: 1280, height: 800 }
      return { contentType: request.quality === undefined ? 'image/png' : 'image/jpeg', width: viewport.width, height: request.fullPage === true ? 3000 : viewport.height, fullPage: request.fullPage === true, viewport, deviceScaleFactor: 2, quality: request.quality ?? null, bytes: 3, sha256: 'a'.repeat(64), path: null, base64: 'iVBO' }
    }
    const browserOnly = createApiEngine({ taskRoot: root, channelsFor: (mode) => buildChannels(mode, {
      localSubjects: {
        http: { fetch: async (url) => { httpCalls++; return httpOnlyChannels('standard')[0]!.fetch(url) } },
        browser_local: { fetch: async (url, _deadline, _signal, _execution, options) => { asked.push(options?.screenshot); return { ...(await httpOnlyChannels('standard')[0]!.fetch(url)), lane: 'browser_local', screenshot: shot(options) } } },
      },
    }) })
    try {
      const app = createApp(browserOnly)
      const post = async (path: string, body: unknown) => {
        const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        return { status: res.status, body: await res.json() }
      }
      const url = `${server.url}/crawl/listing`
      const compact = await post('/v1/scrape', { url, formats: ['markdown', { type: 'screenshot', viewport: { width: 800, height: 600 } }], debug: false })
      expect(compact.body).toMatchObject({ status: 'success', lane: 'browser_local', channelsTried: ['browser_local'], formats: ['markdown', 'screenshot'], screenshot: { contentType: 'image/png', width: 800, height: 600, fullPage: false, viewport: { width: 800, height: 600 }, quality: null, base64: 'iVBO' } })
      expect(asked.at(-1)).toEqual({ viewport: { width: 800, height: 600 } })
      const full = await post('/v1/scrape', { url, formats: ['markdown', 'screenshot@fullPage'] })
      expect(full.body).toMatchObject({ channelsTried: ['browser_local'], screenshot: { fullPage: true, width: 1280, height: 3000 } })
      expect(full.body.ladderTrace[0]).toMatchObject({ event: 'ladder_channels_filtered', detail: { reason: 'screenshot', dropped: ['http'] } })
      expect(full.body.summary.attempts.map((attempt: { result: { screenshot?: unknown } }) => attempt.result.screenshot)).toEqual([null])
      expect(asked.at(-1)).toEqual({ fullPage: true })
      const shim = await post('/fc/v1/scrape', { url, formats: ['markdown', { type: 'screenshot', quality: 60 }] })
      expect(shim.body).toMatchObject({ success: true, data: { screenshot: 'data:image/jpeg;base64,iVBO' } })
      expect(httpCalls).toBe(0)
      // fastMode and a screenshot contradict each other; the refusal names both.
      expect(await post('/v1/scrape', { url, formats: ['screenshot'], fastMode: true })).toMatchObject({ status: 400, body: { error: 'screenshot requires the browser lane, which fastMode declines', code: 'invalid_request' } })
      // Without the format the ladder is the usual one, and the response has no screenshot key.
      const plain = await post('/v1/scrape', { url, formats: ['markdown'], debug: false })
      expect(plain.body).toMatchObject({ lane: 'http', channelsTried: ['http'] })
      expect(plain.body).not.toHaveProperty('screenshot')
      // A batch takes every URL on the browser lane and stores the capture once, on the item.
      const batch = await post('/v1/batches', { urls: [url], formats: ['markdown', 'screenshot'] })
      expect(batch.status).toBe(202)
      await browserOnly.close()
      const items = await (await createApp(browserOnly).request(`/v1/batches/${batch.body.taskId}/items?debug=true`)).json()
      expect(items.items).toHaveLength(1)
      expect(items.items[0]).toMatchObject({ status: 'success', lane: 'browser_local', screenshot: { contentType: 'image/png', width: 1280, height: 800, fullPage: false } })
      expect(items.items[0].audit.summary.attempts.map((attempt: { result: { screenshot?: unknown } }) => attempt.result.screenshot)).toEqual([null])
      expect(items.items[0].evidenceRecord.artifacts).toEqual([])
      expect(httpCalls).toBe(1)
    } finally {
      await browserOnly.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a screenshot by name on a server without a browser lane, before anything is fetched', async () => {
    const roots = await Promise.all([mkdtemp(join(tmpdir(), 'w2l-shot-')), mkdtemp(join(tmpdir(), 'w2l-shot-'))])
    const engines = [
      createApiEngine({ taskRoot: roots[0], httpOnly: true }),
      createApiEngine({ taskRoot: roots[1], channelsFor: httpOnlyChannels, channelPolicy: () => 'http_only' }),
    ]
    try {
      const url = `${server.url}/crawl/listing`
      for (const engine of engines) {
        const app = createApp(engine)
        const post = async (path: string, body: unknown) => {
          const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          return { status: res.status, body: await res.json() }
        }
        const refusal = { status: 400, body: { error: 'screenshot requires the browser lane, which this deployment does not offer', code: 'invalid_request' } }
        expect(await post('/v1/scrape', { url, formats: ['markdown', 'screenshot'] })).toMatchObject(refusal)
        expect(await post('/v1/batches', { urls: [url], formats: ['screenshot@fullPage'] })).toMatchObject(refusal)
        expect(await post('/v1/crawl', { url, formats: [{ type: 'screenshot' }] })).toMatchObject(refusal)
        expect(await post('/fc/v1/scrape', { url, formats: ['screenshot'] })).toMatchObject({ status: 400, body: { success: false, error: refusal.body.error } })
        // Nothing was stored for the refused batch and crawl.
        expect((await (await app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, formats: ['markdown'], debug: false }) })).json()).status).toBe('success')
      }
    } finally {
      await Promise.all(engines.map((engine) => engine.close()))
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    }
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
    // Scrape responses carry the page's declarations beside the call's facts; batch items and crawl pages the declarations alone.
    expect((await post('/v1/scrape', { url })).metadata).toMatchObject(declared)
    expect((await post('/v1/scrape', { url, formats: ['markdown'], debug: false })).metadata).toMatchObject(declared)
    expect((await post('/fc/v1/scrape', { url })).data.metadata).toEqual({
      title: 'Harbour lantern catalog',
      description: 'Synthetic fixture page for benchmark purposes.',
      language: 'en',
      sourceURL: url,
      url,
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      scrapeId: expect.stringMatching(UUID),
      proxyUsed: null,
      timezone: null,
      creditsUsed: null,
      concurrencyLimited: false,
      concurrencyQueueDurationMs: 0,
    })
    const batch = await post('/v1/batches', { urls: [url] })
    const crawl = await post('/v1/crawl', { url, maxPages: 1 })
    await engine.close()
    const items = await (await app.request(`/v1/batches/${batch.taskId}/items`)).json()
    const pages = await (await app.request(`/v1/crawl/${crawl.taskId}/pages`)).json()
    expect(items.items.map((item: { metadata?: unknown }) => item.metadata)).toEqual([declared])
    expect(pages.items.map((item: { metadata?: unknown }) => item.metadata)).toEqual([declared])
  })

  it('mints a scrapeId per call, carries the call\'s facts in metadata on the full and compact responses, and serves the record at GET /v1/scrapes/:id', async () => {
    const url = `${server.url}/crawl/listing`
    const full = (await postJson('/v1/scrape', { url, integration: 'app-test', origin: 'test-suite@1' })).body
    expect(full.scrapeId).toMatch(UUID)
    expect(full.metadata).toMatchObject({ scrapeId: full.scrapeId, sourceURL: url, url, statusCode: 200, contentType: 'text/html; charset=utf-8', proxyUsed: null, timezone: null, concurrencyLimited: false, concurrencyQueueDurationMs: 0, title: 'Harbour lantern catalog' })
    // The compact response names the call under metadata only, and each call has its own id.
    const compact = (await postJson('/v1/scrape', { url, debug: false })).body
    expect(compact).not.toHaveProperty('scrapeId')
    expect(compact.metadata.scrapeId).toMatch(UUID)
    expect(compact.metadata.scrapeId).not.toBe(full.scrapeId)
    const app = createApp(engine)
    const got = await app.request(`/v1/scrapes/${full.scrapeId}`)
    expect(got.status).toBe(200)
    const record = await got.json()
    expect(record).toMatchObject({
      scrapeId: full.scrapeId, status: 'success', lane: 'http', channelsTried: ['http'], origin: 'test-suite@1', integration: 'app-test',
      request: { url }, metadata: full.metadata, snapshot: { httpStatus: 200, contentType: 'text/html; charset=utf-8' },
      usage: { requestCount: 1, attemptCount: 1, browserMs: 0 },
    })
    expect(Date.parse(record.requestedAt)).toBeGreaterThan(Date.now() - 60_000)
    expect(record.usage.totalMs).toBeGreaterThanOrEqual(record.usage.wallMs)
    // No body, no trace, no audit: the attribution sits beside the request, not inside it.
    expect(record).not.toHaveProperty('markdown')
    expect(record).not.toHaveProperty('trace')
    expect(record.request).not.toHaveProperty('origin')
    expect(record.request).not.toHaveProperty('integration')
    // The page's declared title is metadata; its body (the catalogue items) is not in the record.
    expect(record.metadata.title).toBe('Harbour lantern catalog')
    expect(JSON.stringify(record)).not.toContain('teapot')
    // A page that was not read as content has the call's facts with its page fields null, and a record of its own.
    const failed = (await postJson('/v1/scrape', { url: `${server.url}/error/404`, debug: false })).body
    expect(failed.metadata).toMatchObject({ statusCode: 404, title: null, canonicalUrl: null, scrapeId: expect.stringMatching(UUID), url: `${server.url}/error/404` })
    expect((await (await app.request(`/v1/scrapes/${failed.metadata.scrapeId}`)).json())).toMatchObject({ status: 'failed', failureReason: 'http_error', agentHints: ['the server answered 404; the markdown is that error page, not the requested page; check the link'] })
    // Header values stay out of the record; each is replaced by its name.
    const headed = (await postJson('/v1/scrape', { url, headers: { 'X-Test': 'not-for-the-record' }, debug: false })).body
    expect((await (await app.request(`/v1/scrapes/${headed.metadata.scrapeId}`)).json()).request.headers).toEqual({ 'x-test': 'x-test' })
    for (const id of [crypto.randomUUID(), 'not-an-id']) {
      const missing = await app.request(`/v1/scrapes/${id}`)
      expect(missing.status, id).toBe(404)
      expect(await missing.json()).toEqual({ error: 'not found', code: 'not_found' })
    }
  })

  it('says when the per-origin ceiling held a scrape back, and for how long, on the native response and /fc', async () => {
    const slow = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Survey</title></head><body><main><article><h1>Hourly survey</h1><p>${PROSE}</p></article></main></body></html>`), 300)
    })
    await new Promise<void>(resolve => slow.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(slow.address() as AddressInfo).port}/survey`
    const root = await mkdtemp(join(tmpdir(), 'w2l-api-queue-'))
    // One slot per origin, as W2L_PER_HOST_CONCURRENCY=1 gives the API; the test channels take the same policy.
    const policy = { ...localNetworkPolicy(), perHostConcurrency: 1, perHostMinDelayMs: 1 }
    const single = createApiEngine({ taskRoot: root, perHostConcurrency: 1, perHostMinDelayMs: 1, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('browser arm was reached') } } } }) })
    try {
      const app = createApp(single)
      const post = async (path: string, body: unknown) => (await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
      const [a, b, c, shim] = await Promise.all([post('/v1/scrape', { url, debug: false }), post('/v1/scrape', { url, debug: false }), post('/v1/scrape', { url }), post('/fc/v1/scrape', { url })])
      const facts = [a.metadata, b.metadata, c.metadata, shim.data.metadata].sort((x, y) => x.concurrencyQueueDurationMs - y.concurrencyQueueDurationMs)
      expect([a, b, c].every((response) => response.status === 'success')).toBe(true)
      expect(shim.success).toBe(true)
      // Each fetch holds the one slot for at least 300 ms: the first waited for none, the others for the ones before them.
      expect(facts[0]).toMatchObject({ concurrencyLimited: false, concurrencyQueueDurationMs: 0 })
      expect(facts.slice(1).every((fact) => fact.concurrencyLimited === true)).toBe(true)
      expect(facts[1]!.concurrencyQueueDurationMs).toBeGreaterThanOrEqual(250)
      expect(facts[2]!.concurrencyQueueDurationMs).toBeGreaterThanOrEqual(500)
      expect(facts[3]!.concurrencyQueueDurationMs).toBeGreaterThanOrEqual(750)
      // The lane's own timings carry the hold, on the full response's attempt audit.
      expect(c.usage.timings.queueMs).toBeGreaterThanOrEqual(c.usage.timings.concurrencyWaitMs ?? 0)
      expect(c.summary.attempts.map((attempt: { result: { usage: { timings: { concurrencyWaitMs?: number } } } }) => attempt.result.usage.timings.concurrencyWaitMs !== undefined)).toEqual([c.metadata.concurrencyLimited])
    } finally {
      await single.close()
      slow.closeAllConnections()
      await new Promise<void>(resolve => slow.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stores origin and integration with a batch or crawl and reports them as attribution on its status, and nothing else echoes them', async () => {
    const url = `${server.url}/crawl/listing`
    const batch = await postJson('/v1/batches', { urls: [url], integration: 'nightly-prices', origin: 'suite@1' })
    const crawl = await postJson('/v1/crawl', { url, maxPages: 1 })
    expect(batch.status).toBe(202)
    await engine.close()
    const app = createApp(engine)
    const report = await (await app.request(`/v1/batches/${batch.body.taskId}`)).json()
    expect(report).toMatchObject({ status: 'completed', discovery: null, attribution: { origin: 'suite@1', integration: 'nightly-prices' } })
    expect(JSON.stringify((await (await app.request(`/v1/batches/${batch.body.taskId}/items`)).json()).items)).not.toContain('nightly-prices')
    expect(await (await app.request(`/v1/crawl/${crawl.body.taskId}`)).json()).not.toHaveProperty('attribution')
    expect(await postJson('/v1/batches', { urls: [url], integration: 'has space' })).toEqual({ status: 400, body: { error: 'integration must be a string of 1 to 100 printable characters without spaces', code: 'invalid_request' } })
  })

  it('carries agentHints for a login wall, a robots.txt rule and a refused stealth option, and none on a plain success', async () => {
    // A login wall is answered by the http rung; these channels have no browser rung to offer it to.
    const hintRoot = await mkdtemp(join(tmpdir(), 'w2l-api-hints-'))
    const httpOnly = createApiEngine({ taskRoot: hintRoot, channelsFor: (mode) => httpOnlyChannels(mode).filter((channel) => channel.id === 'http') })
    const local = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private/'); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><html><body><p>private</p></body></html>')
    })
    await new Promise<void>(resolve => local.listen(0, '127.0.0.1', resolve))
    try {
      const app = createApp(httpOnly)
      const post = async (path: string, body: unknown) => {
        const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        return { status: res.status, body: await res.json() }
      }
      const wall = `${server.url}/block/login-wall`
      const login = 'the page asks for a login; W2L does not create accounts; use mode authed with your own session'
      const full = (await post('/v1/scrape', { url: wall })).body
      expect(full).toMatchObject({ status: 'blocked', blockReason: 'login_wall', agentHints: [login] })
      expect((await post('/v1/scrape', { url: wall, debug: false })).body).toMatchObject({ status: 'blocked', agentHints: [login] })
      expect((await post('/fc/v1/scrape', { url: wall })).body).toMatchObject({ success: false, data: { agent_hints: [login] } })
      expect(await (await app.request(`/v1/scrapes/${full.scrapeId}`)).json()).toMatchObject({ blockReason: 'login_wall', agentHints: [login] })
      const denied = (await post('/v1/scrape', { url: `http://127.0.0.1:${(local.address() as AddressInfo).port}/private/report`, debug: false })).body
      expect(denied).toMatchObject({ status: 'failed', failureReason: 'policy_denied', agentHints: ["robots.txt of 127.0.0.1 disallows this URL for W2L's identity (rule /private/); a robotsOverride with a recorded reason fetches it on the record"] })
      // A refusal of what W2L does not offer names the supported route, natively and on /fc.
      expect(await post('/v1/scrape', { url: wall, stealth: true })).toMatchObject({ status: 400, body: { code: 'unsupported_parameter', details: { parameters: ['stealth'] }, agentHints: [REFUSAL_HINTS.stealth] } })
      expect(await post('/fc/v1/scrape', { url: wall, proxy: 'stealth' })).toMatchObject({ status: 400, body: { success: false, code: 'unsupported_parameter', agent_hints: [REFUSAL_HINTS.stealth] } })
      expect((await post('/fc/v1/scrape', { url: wall, proxy: 'stealth' })).body).not.toHaveProperty('agentHints')
      const plain = (await post('/v1/scrape', { url: `${server.url}/crawl/listing`, debug: false })).body
      expect(plain.status).toBe('success')
      expect(plain).not.toHaveProperty('agentHints')
    } finally {
      await httpOnly.close()
      local.closeAllConnections()
      await new Promise<void>(resolve => local.close(() => resolve()))
      await rm(hintRoot, { recursive: true, force: true })
    }
  })

  it('carries low_content_yield, the warning string and the hints for a shell on an http-only engine, through /fc too, and none on the listing fixture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'w2l-api-yield-'))
    const httpOnly = createApiEngine({ taskRoot: root, channelsFor: (mode) => httpOnlyChannels(mode).filter((channel) => channel.id === 'http') })
    try {
      const app = createApp(httpOnly)
      const post = async (path: string, body: unknown) => (await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
      const shell = await post('/v1/scrape', { url: `${server.url}/spa/shell`, debug: false })
      expect(shell).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http', channelsTried: ['http'] })
      expect(shell.warnings.map((warning: { code: string }) => warning.code)).toEqual(['client_rendered_suspected', 'low_content_yield'])
      expect(shell.warnings[1].message).toMatch(/^The http lane found no main content at confidence [0-9.]+; the browser lane was not available to this request\.$/)
      expect(shell.warning).toBe(shell.warnings.map((warning: { message: string }) => warning.message).join(' '))
      expect(shell.agentHints).toEqual(['the page fills its data with JavaScript; the browser lane was not tried', expect.stringContaining('pass waitFor (up to 60000 ms)')])
      const full = await post('/v1/scrape', { url: `${server.url}/spa/shell` })
      expect(full).toMatchObject({ warning: shell.warning, agentHints: shell.agentHints })
      const shim = await post('/fc/v1/scrape', { url: `${server.url}/spa/shell` })
      expect(shim).toMatchObject({ success: false, data: { warning: shell.warning, agent_hints: shell.agentHints } })
      const plain = await post('/v1/scrape', { url: `${server.url}/crawl/listing`, debug: false })
      expect(plain.status).toBe('success')
      for (const key of ['warning', 'warnings', 'agentHints']) expect(plain).not.toHaveProperty(key)
    } finally {
      await httpOnly.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('limits the requests that start work per bearer token, answers 429 with Retry-After and the wait, and leaves status reads free', async () => {
    const url = `${server.url}/crawl/listing`
    const app = createApp(engine, { tokens: ['alpha', 'beta'], rateLimit: { perMinute: 2 } })
    const post = (path: string, token: string, body: unknown = { url, debug: false }) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    expect((await post('/v1/scrape', 'alpha')).status).toBe(200)
    expect((await post('/v1/scrape', 'alpha')).status).toBe(200)
    const limited = await post('/v1/scrape', 'alpha')
    expect(limited.status).toBe(429)
    const retryAfter = Number(limited.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(60)
    expect(await limited.json()).toEqual({ error: 'rate limit exceeded: 2 requests per minute', code: 'rate_limited', retryAfterSeconds: retryAfter, agentHints: [`wait ${retryAfter} s before the next request`] })
    // Another token has its own budget; a status read is not counted; a wrong token is refused before it counts; /fc wears Firecrawl's envelope.
    expect((await post('/v1/scrape', 'beta')).status).toBe(200)
    expect((await app.request('/v1/crawl/none', { headers: { authorization: 'Bearer alpha' } })).status).toBe(404)
    expect((await post('/v1/scrape', 'nope')).status).toBe(401)
    const shim = await post('/fc/v1/crawl', 'alpha', { url })
    expect(shim.status).toBe(429)
    expect(shim.headers.get('retry-after')).toMatch(/^\d+$/)
    expect(await shim.json()).toEqual({ success: false, error: 'rate limit exceeded: 2 requests per minute', code: 'rate_limited', agent_hints: [expect.stringMatching(/^wait \d+ s before the next request$/)] })
    // Without tokens the one local caller has the budget.
    const local = createApp(engine, { rateLimit: { perMinute: 1 } })
    const plain = () => local.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, debug: false }) })
    expect((await plain()).status).toBe(200)
    expect((await plain()).status).toBe(429)
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
      expect(await blanket.json()).toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['ignoreRobotsTxt'] }, agentHints: [REFUSAL_HINTS.ignoreRobotsTxt] })
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
        // The fixture's items are siblings of the listing, outside the subtree a crawl keeps to by default.
        crawlEntireDomain: true,
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
      body: JSON.stringify({ url: `${server.url}/crawl/listing`, maxPages: 4, maxDepth: 2, crawlEntireDomain: true }),
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
    expect(await post('/v1/scrape', { url, formats: ['markdown', 'links', 'summary', 'changeTracking'] }))
      .toEqual({ status: 400, error: 'unsupported formats: summary, changeTracking (supported: markdown, links, json, html, rawHtml, images, tables, screenshot, attributes, list)' })
    expect(await post('/v1/scrape', { url, location: {} })).toMatchObject({ status: 400, error: expect.stringContaining('unsupported parameter: location') })
    expect(await post('/v1/crawl', { url, actions: [{ type: 'scrape' }] })).toMatchObject({ status: 400, error: expect.stringContaining('unsupported parameter: actions') })
    expect(await post('/v1/batches', { urls: [url], proxy: 'auto' })).toMatchObject({ status: 400, error: expect.stringContaining('unsupported parameter: proxy') })
    expect(await post('/v1/crawl', { url, limit: 2 })).toMatchObject({ status: 400, error: expect.stringContaining('unsupported parameter: limit') })
  })

  it('crawls with formats and pathname filters and returns absolute links on each page', async () => {
    const app = createApp(engine)
    const schema = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
    const started = await app.request('/v1/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `${server.url}/crawl/listing`, formats: ['markdown', 'links', { type: 'json', schema }], includePaths: ['^/crawl/item/'], excludePaths: ['^/crawl/item/2$'], crawlEntireDomain: true }),
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

  it('keeps a crawl seeded below the root in the seed\'s path subtree unless crawlEntireDomain is set, and reports the refused links', async () => {
    const app = createApp(engine)
    const start = async (body: Record<string, unknown>) => (await postJson('/v1/crawl', { url: `${server.url}/crawl/item/1`, maxPages: 5, ...body })).body.taskId as string
    const scoped = await start({})
    const whole = await start({ crawlEntireDomain: true })
    await engine.close()
    // The item's one link, the listing, lies outside /crawl/item/: refused and counted, not fetched.
    expect(await (await app.request(`/v1/crawl/${scoped}`)).json()).toMatchObject({ status: 'completed', pagesFetched: 1, budgetExceeded: null, discovery: { offered: 1, enqueued: 0, subtreeDenied: 1, duplicateContent: 0 } })
    const scopedPages = await (await app.request(`/v1/crawl/${scoped}/pages?debug=true`)).json()
    expect(scopedPages.items.map((item: { url: string }) => item.url)).toEqual([`${server.url}/crawl/item/1`])
    expect(scopedPages.items[0].trace).toContainEqual(expect.objectContaining({ event: 'discovered', detail: { via: 'seed', from: null } }))
    expect(scopedPages.items[0].trace).toContainEqual(expect.objectContaining({ event: 'links_offered', detail: expect.objectContaining({ offered: 1, subtreeDenied: 1, enqueued: 0 }) }))
    // With the whole host, the listing and its other items follow.
    expect((await (await app.request(`/v1/crawl/${whole}`)).json()).discovery).toMatchObject({ subtreeDenied: 0, enqueued: 3 })
    const wholePages = await (await app.request(`/v1/crawl/${whole}/pages?debug=true`)).json()
    expect(wholePages.items.map((item: { url: string }) => new URL(item.url).pathname).sort()).toEqual(['/crawl/item/1', '/crawl/item/2', '/crawl/item/3', '/crawl/listing'])
    expect(wholePages.items.find((item: { url: string }) => item.url.endsWith('/crawl/item/2'))).toMatchObject({ depth: 2 })
    expect(wholePages.items.find((item: { url: string }) => item.url.endsWith('/crawl/listing')).trace).toContainEqual(expect.objectContaining({ event: 'discovered', detail: { via: 'link', from: `${server.url}/crawl/item/1` } }))
  })

  it('fetches the seed when allowlistedDomains names other hosts, since the list adds to the seed host, and refuses it beside allowExternalLinks', async () => {
    const started = await postJson('/v1/crawl', { url: `${server.url}/crawl/listing`, maxPages: 1, allowlistedDomains: ['other.test'] })
    expect(started.status).toBe(202)
    await engine.close()
    const app = createApp(engine)
    const pages = await (await app.request(`/v1/crawl/${started.body.taskId}/pages?debug=true`)).json()
    expect(pages.items).toHaveLength(1)
    expect(pages.items[0]).toMatchObject({ status: 'success', url: `${server.url}/crawl/listing` })
    expect(pages.items[0].trace.some((event: { event: string }) => event.event === 'governance_refusal' || event.event === 'ladder_governance_refusal')).toBe(false)
    expect(await postJson('/v1/crawl', { url: `${server.url}/crawl/listing`, allowExternalLinks: true, allowlistedDomains: ['other.test'] }))
      .toEqual({ status: 400, body: { error: 'allowExternalLinks cannot be combined with allowlistedDomains', code: 'invalid_request' } })
  })

  it('follows a link to another host only with allowExternalLinks, reading that host\'s robots.txt, and counts it as hostDenied otherwise', async () => {
    const requests: string[] = []
    const html = (title: string, links: string[]) => `<!doctype html><html><head><title>${title}</title></head><body><main><article><h1>${title}</h1><p>${PROSE}</p><ul>${links.map((href) => `<li><a href="${href}">${href}</a></li>`).join('')}</ul></article></main></body></html>`
    let port = 0
    // Bound to every address, so the one server answers as 127.0.0.1 and as localhost: two hosts to the crawl, loopback to the network policy.
    const site = createServer((req, res) => {
      requests.push(`${(req.headers.host ?? '').replace(/:\d+$/, '')}${req.url}`)
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(req.url === '/ext' ? html('Elsewhere', []) : html('Home', [`http://localhost:${port}/ext`]))
    })
    await new Promise<void>(resolve => site.listen(0, '::', resolve))
    port = (site.address() as AddressInfo).port
    try {
      const followed = await postJson('/v1/crawl', { url: `http://127.0.0.1:${port}/`, maxDepth: 1, allowExternalLinks: true })
      const refused = await postJson('/v1/crawl', { url: `http://127.0.0.1:${port}/`, maxDepth: 1 })
      await engine.close()
      const app = createApp(engine)
      const followedPages = await (await app.request(`/v1/crawl/${followed.body.taskId}/pages?debug=true`)).json()
      expect(followedPages.items.map((item: { url: string; status: string }) => [item.url, item.status]).sort()).toEqual([[`http://127.0.0.1:${port}/`, 'success'], [`http://localhost:${port}/ext`, 'success']])
      const elsewhere = followedPages.items.find((item: { url: string }) => item.url.includes('localhost'))
      expect(elsewhere.trace).toContainEqual(expect.objectContaining({ event: 'discovered', detail: { via: 'link', from: `http://127.0.0.1:${port}/` } }))
      expect(elsewhere.trace.some((event: { event: string }) => event.event === 'robots_checked')).toBe(true)
      expect(requests).toContain('localhost/robots.txt')
      expect(await (await app.request(`/v1/crawl/${refused.body.taskId}`)).json()).toMatchObject({ status: 'completed', pagesFetched: 1, discovery: { offered: 1, enqueued: 0, hostDenied: 1 } })
      const refusedPages = await (await app.request(`/v1/crawl/${refused.body.taskId}/pages?debug=true`)).json()
      expect(refusedPages.items[0].trace).toContainEqual(expect.objectContaining({ event: 'links_offered', detail: expect.objectContaining({ hostDenied: 1, samples: { collapsed: [], hostDenied: [`http://localhost:${port}/ext`] } }) }))
    } finally {
      site.closeAllConnections()
      await new Promise<void>(resolve => site.close(() => resolve()))
    }
  })

  it('leaves a page whose body repeats an earlier one out of /pages unless includeDuplicates=true, and counts it in discovery', async () => {
    const html = (title: string, links: string[]) => `<!doctype html><html><head><title>${title}</title></head><body><main><article><h1>${title}</h1><p>${PROSE}</p><ul>${links.map((href) => `<li><a href="${href}">${href}</a></li>`).join('')}</ul></article></main></body></html>`
    const twins = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(req.url === '/' ? html('Hub', ['/a', '/b']) : html('Twin page', []))
    })
    await new Promise<void>(resolve => twins.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(twins.address() as AddressInfo).port}`
    try {
      const started = await postJson('/v1/crawl', { url: `${origin}/`, maxDepth: 1 })
      await engine.close()
      const app = createApp(engine)
      const taskId = started.body.taskId as string
      // /a and /b are distinct URLs with one body: the second fetched is a duplicate, counted but no page of its own.
      expect(await (await app.request(`/v1/crawl/${taskId}`)).json()).toMatchObject({ status: 'completed', pagesFetched: 3, discovery: { offered: 2, enqueued: 2, collapsed: 0, duplicateContent: 1 } })
      const pages = await (await app.request(`/v1/crawl/${taskId}/pages`)).json()
      expect(pages.items.map((item: { status: string }) => item.status)).toEqual(['success', 'success'])
      const all = await (await app.request(`/v1/crawl/${taskId}/pages?includeDuplicates=true`)).json()
      expect(all.items).toHaveLength(3)
      expect(all.items.filter((item: { status: string }) => item.status === 'duplicate')).toHaveLength(1)
      expect(all.items.find((item: { status: string }) => item.status === 'duplicate')).toMatchObject({ markdown: null, contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) })
      expect((await (await app.request(`/v1/crawl/${taskId}/errors`)).json()).items).toEqual([])
      expect(await (await app.request(`/v1/crawl/${taskId}/pages?includeDuplicates=maybe`)).json()).toEqual({ error: 'includeDuplicates must be true or false', code: 'invalid_request' })
    } finally {
      twins.closeAllConnections()
      await new Promise<void>(resolve => twins.close(() => resolve()))
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

  it('lists the crawls it is running at GET /v1/crawl/active, never a batch, and stays 200 when nothing runs', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    // Every page waits at the gate, so the crawl and the batch are observably running.
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
    const listActive = async () => {
      const res = await slowApp.request('/v1/crawl/active')
      return { status: res.status, body: await res.json() as { crawls: Array<Record<string, unknown>> } }
    }
    try {
      expect(await listActive()).toEqual({ status: 200, body: { crawls: [] } })
      const post = async (path: string, body: unknown) => (await slowApp.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<{ taskId: string }>
      const crawl = await post('/v1/crawl', { url: `${server.url}/crawl/listing`, maxPages: 4, crawlEntireDomain: true, sitemap: 'skip', maxConcurrency: 1 })
      await post('/v1/batches', { urls: [`${server.url}/crawl/item/1`] })
      const active = await listActive()
      expect(active.status).toBe(200)
      expect(active.body.crawls).toHaveLength(1)
      expect(active.body.crawls[0]).toMatchObject({ id: crawl.taskId, url: `${server.url}/crawl/listing`, status: expect.stringMatching(/^(pending|running)$/), startedAt: expect.any(String), pagesFetched: 0 })
      expect(active.body.crawls[0]!.options).toEqual({
        maxPages: 4, maxDepth: null, allowlistedDomains: [], includePaths: [], excludePaths: [], useCached: false, sitemap: 'skip',
        ignoreQueryParameters: false, deduplicateSimilarURLs: true, crawlEntireDomain: true, allowSubdomains: false, allowExternalLinks: false, regexOnFullURL: false, maxConcurrency: 1,
        scrapeOptions: { formats: ['markdown'], includeLinks: false },
      })
      // The static route is registered before the id routes: the report of a crawl is still served by its id.
      expect(await (await slowApp.request(`/v1/crawl/${crawl.taskId}`)).json()).toMatchObject({ taskId: crawl.taskId })
      expect((await slowApp.request('/v1/crawl/active/pages')).status).toBe(404)
      release()
      await slow.close()
      // Nothing runs after close: an empty list, not a 404 for an id named "active".
      expect(await listActive()).toEqual({ status: 200, body: { crawls: [] } })
    } finally {
      release()
      await slow.close()
    }
  })

  it('refuses a maxConcurrency above its worker count and a sitemap mode it does not know, before anything is stored', async () => {
    const app = createApp(engine)
    const postJson = async (path: string, body: unknown) => {
      const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    }
    const url = `${server.url}/crawl/listing`
    expect(await postJson('/v1/crawl', { url, maxConcurrency: 5 })).toEqual({ status: 400, body: { error: 'maxConcurrency must be at most 4 on this service', code: 'invalid_request' } })
    expect(await postJson('/v1/crawl', { url, maxConcurrency: 0 })).toEqual({ status: 400, body: { error: 'maxConcurrency must be an integer >= 1', code: 'invalid_request' } })
    expect(await postJson('/v1/crawl', { url, sitemap: 'maybe' })).toEqual({ status: 400, body: { error: 'sitemap must be include, skip, or only', code: 'invalid_request' } })
    const two = createApiEngine({ taskRoot, workerCount: 2, channelsFor: httpOnlyChannels })
    try {
      await expect(two.startCrawl({ url, maxConcurrency: 3 })).rejects.toMatchObject({ code: 'invalid_request', message: 'maxConcurrency must be at most 2 on this service' })
    } finally {
      await two.close()
    }
    // Within the count, the cap and the default sitemap mode are stored with the task.
    const started = await postJson('/v1/crawl', { url, maxPages: 1, maxConcurrency: 1 })
    expect(started.status).toBe(202)
    await engine.close()
    const store = SqliteTaskStore.openReadOnly(join(taskRoot, started.body.taskId as string))
    try {
      expect((await store.getTask(started.body.taskId as string))?.crawl).toMatchObject({ maxConcurrency: 1, sitemap: 'include' })
    } finally {
      await store.close()
    }
    // The fixture server has no sitemap: the conventional location answered a soft-404 page, read as not a sitemap and recorded.
    const report = await (await app.request(`/v1/crawl/${started.body.taskId as string}`)).json()
    expect(report.discovery.sitemap).toMatchObject({ mode: 'include', sources: ['guess'], listed: 0, enqueued: 0, truncated: null, error: null })
    expect(report.discovery.sitemap.files).toEqual([expect.objectContaining({ url: `${server.url}/sitemap.xml`, kind: 'not_sitemap', status: 200, robots: 'no_robots', proxyUsed: false })])
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
