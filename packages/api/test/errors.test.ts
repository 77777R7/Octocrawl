import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import type { ApiEngine } from '../src/engine.js'

// Request errors are decided before any site is fetched, so a stub engine is enough.
const engine = {
  scrape: async () => { throw new Error('SQLITE_IOERR: disk I/O error in /Users/someone/.w2l/api/checkpoint.sqlite') },
  getCrawl: async () => null,
  getCrawlWithSteps: async () => null,
  getCrawlStatusPage: async () => null,
  retryDelivery: () => { throw new Error('delivery not found or not dead-lettered') },
} as unknown as ApiEngine

const url = 'https://example.com/'
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})
async function call(app: ReturnType<typeof createApp>, path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await app.request(path, init)
  return { status: res.status, body: await res.json() }
}

describe('REST error codes', () => {
  it('returns every request error as { error, code } with the message unchanged', async () => {
    const app = createApp(engine)
    expect(await call(app, '/v1/scrape', post('{"url":'))).toEqual({ status: 400, body: { error: 'body must be JSON', code: 'invalid_json' } })
    expect(await call(app, '/v1/scrape', post({ url: 'ftp://example.com/' }))).toEqual({ status: 400, body: { error: 'url must be http(s)', code: 'invalid_request' } })
    expect(await call(app, '/v1/scrape', post({ url, proxy: 'stealth' }))).toMatchObject({
      status: 400, body: { error: expect.stringContaining('unsupported parameter: proxy'), code: 'unsupported_parameter', details: { parameters: ['proxy'] } },
    })
    expect(await call(app, '/v1/batches', post({ urls: [url], formats: ['markdown', 'rawHtml'] }))).toMatchObject({
      status: 400, body: { error: expect.stringContaining('unsupported format: rawHtml'), code: 'unsupported_format', details: { formats: ['rawHtml'] } },
    })
    expect(await call(app, '/v1/crawl/missing')).toEqual({ status: 404, body: { error: 'not found', code: 'not_found' } })
    expect(await call(app, '/v1/nothing-here')).toEqual({ status: 404, body: { error: 'no route for GET /v1/nothing-here', code: 'not_found' } })
    expect(await call(app, '/v1/deliveries/d1/retry', { method: 'POST' })).toEqual({ status: 409, body: { error: 'delivery not found or not dead-lettered', code: 'conflict' } })
    expect(await call(createApp(engine, { token: 'secret' }), '/v1/crawl/missing')).toEqual({ status: 401, body: { error: 'unauthorized', code: 'unauthorized' } })
  })

  it('keeps the cause of a 500 out of the response unless the server is local', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await call(createApp(engine), '/v1/scrape', post({ url }))).toEqual({ status: 500, body: { error: 'internal error', code: 'internal_error' } })
      expect(log).toHaveBeenCalledOnce()
      expect(String(log.mock.calls[0]?.[0])).toContain('SQLITE_IOERR')
    } finally {
      log.mockRestore()
    }
    expect(await call(createApp(engine, { exposeInternalErrors: true }), '/v1/scrape', post({ url }))).toEqual({
      status: 500, body: { error: 'SQLITE_IOERR: disk I/O error in /Users/someone/.w2l/api/checkpoint.sqlite', code: 'internal_error' },
    })
  })

  it('puts the same codes in the Firecrawl envelope under /fc', async () => {
    const app = createApp(engine)
    expect(await call(app, '/fc/v1/scrape', post('not json'))).toEqual({ status: 400, body: { success: false, error: 'body must be JSON', code: 'invalid_json' } })
    expect(await call(app, '/fc/v1/scrape', post({ url, formats: ['markdown', 'html'] }))).toEqual({
      status: 400, body: { success: false, error: 'unsupported format: html (the /fc shim supports markdown, links)', code: 'unsupported_format', details: { formats: ['html'] } },
    })
    expect(await call(app, '/fc/v1/crawl/missing')).toEqual({ status: 404, body: { success: false, error: 'not found', code: 'not_found' } })
    expect(await call(app, '/fc/v2/scrape', post({ url }))).toEqual({ status: 404, body: { success: false, error: 'no route for POST /fc/v2/scrape', code: 'not_found' } })
    expect(await call(createApp(engine, { token: 'secret' }), '/fc/v1/crawl/missing')).toEqual({ status: 401, body: { success: false, error: 'unauthorized', code: 'unauthorized' } })
  })
})
