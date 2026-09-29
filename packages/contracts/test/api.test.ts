import { describe, expect, it } from 'vitest'
import { CRAWL_MODES, defaultApiMode, isApiCrawlMode, parseBatchStartRequest, parseCrawlStartRequest, parseScrapeRequest } from '../src/index.js'
import type { CrawlAccepted, CrawlStartRequest, ScrapeRequest, ScrapeResponse } from '../src/index.js'

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
    expect(() => parseScrapeRequest({ url, waitFor: 1000, onlyMainContent: true })).toThrow('unsupported parameters: waitFor, onlyMainContent')
    expect(() => parseBatchStartRequest({ urls: [url], timeout: 5000 })).toThrow('unsupported parameter: timeout')
    expect(() => parseCrawlStartRequest({ url, limit: 5 })).toThrow('unsupported parameter: limit')
  })

  it('accepts crawl formats and pathname filters, and rejects an invalid regex', () => {
    const url = 'https://example.com/'
    expect(parseCrawlStartRequest({ url, formats: ['markdown', 'links'], includeLinks: true, includePaths: ['^/catalogue/'], excludePaths: ['^/catalogue/category/'] }))
      .toMatchObject({ formats: ['markdown', 'links'], includeLinks: true, includePaths: ['^/catalogue/'], excludePaths: ['^/catalogue/category/'] })
    expect(() => parseCrawlStartRequest({ url, includePaths: ['('] })).toThrow('includePaths contains an invalid regular expression: (')
    expect(() => parseCrawlStartRequest({ url, excludePaths: '^/a' })).toThrow('excludePaths must be an array')
  })
})
