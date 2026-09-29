import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_ERROR_CODES, API_ERROR_STATUS, CRAWL_MODES, DEFAULT_MAX_FILE_BYTES, defaultApiMode, fileByteCap, isApiCrawlMode, isApiErrorCode, maxFileBytesFromEnv, parseBatchStartRequest, parseCrawlStartRequest, parseScrapeRequest } from '../src/index.js'
import type { CrawlAccepted, CrawlStartRequest, ScrapeRequest, ScrapeResponse } from '../src/index.js'

const thrown = (fn: () => unknown): unknown => {
  try { fn() } catch (error) { return error }
  return undefined
}

describe('REST contract: scrape + crawl reuse existing result types', () => {
  it('accepts the CLI modes and not proxy', () => {
    expect([...CRAWL_MODES]).toEqual(['research', 'standard', 'authed'])
    expect(isApiCrawlMode('standard')).toBe(true)
    expect(isApiCrawlMode('proxy')).toBe(false)
    expect(defaultApiMode('proxy')).toBe('standard')
  })

  it('scrape request is url + optional mode/allowlist', () => {
    const req: ScrapeRequest = { url: 'https://example.com/' }
    expect(req.url).toBe('https://example.com/')
  })

  it('crawl start request matches CLI flags without inventing a second status enum', () => {
    const req: CrawlStartRequest = {
      url: 'https://example.com/',
      maxPages: 20,
      maxDepth: 2,
      useCached: false,
      allowlistedDomains: ['example.com'],
    }
    const accepted: CrawlAccepted = { taskId: 'task-1' }
    expect(accepted.taskId).toBe('task-1')
    expect(req.maxPages).toBe(20)
  })

  it('scrape response is a FetchResult, not a wrapper status', () => {
    const sample: Pick<ScrapeResponse, 'status' | 'markdown'> = { status: 'success', markdown: 'x' }
    expect(sample.status).toBe('success')
  })

  it('accepts explicit markdown, links, and one bounded JSON schema format', () => {
    const req = parseScrapeRequest({
      url: 'https://example.com/product', debug: false,
      formats: ['markdown', 'links', { type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }, modelFallback: true }],
    })
    expect(req.debug).toBe(false)
    expect(req.formats).toHaveLength(3)
  })

  it('rejects remote JSON schema references', () => {
    expect(() => parseScrapeRequest({
      url: 'https://example.com/product',
      formats: [{ type: 'json', schema: { $ref: 'https://schemas.example/product.json' } }],
    })).toThrow('only supports local $ref')
  })

  it('names unsupported formats instead of capping the count, and still rejects duplicates', () => {
    const url = 'https://example.com/'
    expect(() => parseScrapeRequest({ url, formats: ['markdown', 'links', 'html', 'rawHtml'] }))
      .toThrow('unsupported formats: html, rawHtml (supported: markdown, links, json)')
    expect(() => parseBatchStartRequest({ urls: [url], formats: ['markdown', { type: 'screenshot' }] })).toThrow('unsupported format: screenshot')
    expect(() => parseCrawlStartRequest({ url, formats: ['links', 'links'] })).toThrow('formats must not contain duplicates')
    expect(() => parseScrapeRequest({ url, formats: [] })).toThrow('formats must be a non-empty array')
  })

  it('rejects unknown request keys by name for scrape, batch and crawl', () => {
    const url = 'https://example.com/'
    expect(() => parseScrapeRequest({ url, actions: [], mobile: true })).toThrow('unsupported parameters: actions, mobile')
    expect(() => parseBatchStartRequest({ urls: [url], proxy: 'auto' })).toThrow('unsupported parameter: proxy')
    expect(() => parseCrawlStartRequest({ url, limit: 5 })).toThrow('unsupported parameter: limit')
  })

  it('accepts onlyMainContent, waitFor and timeout on scrape, batch and crawl within their bounds', () => {
    const url = 'https://example.com/'
    const options = { onlyMainContent: false, waitFor: 60_000, timeout: 1_000 }
    expect(parseScrapeRequest({ url, ...options })).toMatchObject(options)
    expect(parseBatchStartRequest({ urls: [url], ...options })).toMatchObject(options)
    expect(parseCrawlStartRequest({ url, ...options })).toMatchObject(options)
    expect(parseScrapeRequest({ url, waitFor: 0, timeout: 300_000 })).toMatchObject({ waitFor: 0, timeout: 300_000 })
    expect(() => parseScrapeRequest({ url, onlyMainContent: 'false' })).toThrow('onlyMainContent must be a boolean')
    for (const waitFor of [-1, 60_001, 1.5, '500']) expect(() => parseBatchStartRequest({ urls: [url], waitFor })).toThrow('waitFor must be an integer number of milliseconds from 0 to 60000')
    for (const timeout of [999, 300_001, null]) expect(() => parseCrawlStartRequest({ url, timeout })).toThrow('timeout must be an integer number of milliseconds from 1000 to 300000')
  })

  it('takes maxFileBytes on scrape, batch and crawl, and an operator cap from W2L_MAX_FILE_BYTES that a request only lowers', () => {
    const url = 'https://example.com/'
    expect(parseScrapeRequest({ url, maxFileBytes: 1 })).toMatchObject({ maxFileBytes: 1 })
    expect(parseBatchStartRequest({ urls: [url], maxFileBytes: 500 * 1024 * 1024 })).toMatchObject({ maxFileBytes: 500 * 1024 * 1024 })
    expect(parseCrawlStartRequest({ url })).not.toHaveProperty('maxFileBytes')
    for (const maxFileBytes of [0, 1.5, '100', 500 * 1024 * 1024 + 1]) expect(() => parseCrawlStartRequest({ url, maxFileBytes })).toThrow('maxFileBytes must be an integer number of bytes from 1 to 524288000')
    expect(maxFileBytesFromEnv({})).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(DEFAULT_MAX_FILE_BYTES).toBe(50 * 1024 * 1024)
    expect(maxFileBytesFromEnv({ W2L_MAX_FILE_BYTES: ' 104857600 ' })).toBe(104_857_600)
    for (const value of ['0', '10MB', '1e6', '524288001']) expect(() => maxFileBytesFromEnv({ W2L_MAX_FILE_BYTES: value })).toThrow('W2L_MAX_FILE_BYTES must be a whole number of bytes from 1 to 524288000')
    expect(fileByteCap({ maxFileBytes: 1000 }, 10)).toBe(10)
    expect(fileByteCap({ maxFileBytes: 1000 }, 5000)).toBe(1000)
    expect(fileByteCap({})).toBe(DEFAULT_MAX_FILE_BYTES)
  })

  it('accepts crawl formats and pathname filters, and rejects an invalid regex', () => {
    const url = 'https://example.com/'
    expect(parseCrawlStartRequest({ url, formats: ['markdown', 'links'], includeLinks: true, includePaths: ['^/catalogue/'], excludePaths: ['^/catalogue/category/'] }))
      .toMatchObject({ formats: ['markdown', 'links'], includeLinks: true, includePaths: ['^/catalogue/'], excludePaths: ['^/catalogue/category/'] })
    expect(() => parseCrawlStartRequest({ url, includePaths: ['('] })).toThrow('includePaths contains an invalid regular expression: (')
    expect(() => parseCrawlStartRequest({ url, excludePaths: '^/a' })).toThrow('excludePaths must be an array')
  })

  it('has one request-error code set, each code with its HTTP status', () => {
    expect([...API_ERROR_CODES]).toEqual(['invalid_json', 'invalid_request', 'unsupported_parameter', 'unsupported_format', 'unauthorized', 'not_found', 'conflict', 'internal_error'])
    expect(API_ERROR_CODES.map((code) => API_ERROR_STATUS[code])).toEqual([400, 400, 400, 400, 401, 404, 409, 500])
    expect(isApiErrorCode('not_found')).toBe(true)
    expect(isApiErrorCode('blocked')).toBe(false)
  })

  it('documents exactly these codes and statuses in the docs reference table', () => {
    const reference = readFileSync(new URL('../../../apps/public-web/content/reference.md', import.meta.url), 'utf8')
    const rows = [...reference.matchAll(/^\| `([a-z_]+)` \| (\d{3}) \|/gm)].map(([, code, status]) => [code, Number(status)])
    expect(rows).toEqual(API_ERROR_CODES.map((code) => [code, API_ERROR_STATUS[code]]))
  })

  it('gives each rejected request a code and names unsupported parameters and formats in details', () => {
    const url = 'https://example.com/'
    expect(thrown(() => parseScrapeRequest({ url, actions: [], proxy: 'stealth' }))).toMatchObject({ status: 400, code: 'unsupported_parameter', details: { parameters: ['actions', 'proxy'] } })
    expect(thrown(() => parseCrawlStartRequest({ url, limit: 5 }))).toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['limit'] } })
    expect(thrown(() => parseBatchStartRequest({ urls: [url], formats: ['markdown', 'html', { type: 'screenshot' }] }))).toMatchObject({ code: 'unsupported_format', details: { formats: ['html', 'screenshot'] } })
    const invalid = thrown(() => parseScrapeRequest({ url: 'ftp://example.com/' }))
    expect(invalid).toMatchObject({ status: 400, code: 'invalid_request', message: 'url must be http(s)' })
    expect((invalid as { details?: unknown }).details).toBeUndefined()
  })
})
