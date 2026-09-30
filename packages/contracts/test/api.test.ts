import { describe, expect, it } from 'vitest'
import { CRAWL_MODES, defaultApiMode, isApiCrawlMode, parseBatchStartRequest, parseCrawlStartRequest, parseFirecrawlScrapeRequest, parseScrapeRequest } from '../src/index.js'
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

  it('names an unknown option instead of ignoring it', () => {
    expect(() => parseScrapeRequest({ url: 'https://example.com/', onlyMainContnet: false })).toThrow('unknown scrape option: onlyMainContnet')
    expect(() => parseCrawlStartRequest({ url: 'https://example.com/', limit: 5 })).toThrow('unknown crawl option: limit')
    expect(() => parseBatchStartRequest({ urls: ['https://example.com/'], format: ['markdown'] })).toThrow('unknown batch option: format')
  })

  it('accepts the html and rawHtml formats and CSS selector lists', () => {
    const req = parseScrapeRequest({ url: 'https://example.com/', formats: ['markdown', 'html', 'rawHtml'], includeTags: ['main', ' table.wikitable '], excludeTags: ['.mw-editsection'] })
    expect(req.formats).toEqual(['markdown', 'html', 'rawHtml'])
    expect(req.includeTags).toEqual(['main', 'table.wikitable'])
    expect(req.excludeTags).toEqual(['.mw-editsection'])
    expect(() => parseScrapeRequest({ url: 'https://example.com/', formats: ['html', 'html'] })).toThrow('formats must not contain duplicates')
    expect(() => parseScrapeRequest({ url: 'https://example.com/', includeTags: 'main' })).toThrow('includeTags must be an array of at most 100 non-empty CSS selectors')
    expect(() => parseScrapeRequest({ url: 'https://example.com/', excludeTags: [' '] })).toThrow('excludeTags must be an array of at most 100 non-empty CSS selectors')
    const crawl = parseCrawlStartRequest({ url: 'https://example.com/', scrapeOptions: { formats: ['rawHtml'], excludeTags: ['nav'] } })
    expect(crawl.scrapeOptions).toEqual({ formats: ['rawHtml'], excludeTags: ['nav'] })
    const fc = parseFirecrawlScrapeRequest({ url: 'https://example.com/', formats: ['markdown', 'html', 'rawHtml', 'screenshot'], includeTags: ['article'], excludeTags: ['.ad'] })
    expect(fc.formats).toEqual(['markdown', 'html', 'rawHtml'])
    expect(fc.includeTags).toEqual(['article'])
    expect(fc.excludeTags).toEqual(['.ad'])
  })

  it('parses a recorded robots override and insists on its reason', () => {
    const parsed = parseScrapeRequest({ url: 'https://example.test/report.pdf', robotsOverride: { reason: 'linked publicly by the publisher', recordedBy: 'analyst' } })
    expect(parsed.robotsOverride).toEqual({ reason: 'linked publicly by the publisher', recordedBy: 'analyst' })
    expect(() => parseScrapeRequest({ url: 'https://example.test/', robotsOverride: true })).toThrow('robotsOverride must be an object with a reason')
    expect(() => parseScrapeRequest({ url: 'https://example.test/', robotsOverride: { reason: ' ' } })).toThrow('robotsOverride.reason must be a non-empty string')
    expect(() => parseScrapeRequest({ url: 'https://example.test/', robotsOverride: { reason: 'x', ignoreRobotsTxt: true } })).toThrow('unknown robotsOverride option: ignoreRobotsTxt')
    expect(() => parseScrapeRequest({ url: 'https://example.test/', ignoreRobotsTxt: true })).toThrow('unknown scrape option: ignoreRobotsTxt')
  })

  it('binds each batch robots override to one of the batch urls', () => {
    const urls = ['https://a.test/one.pdf', 'https://b.test/two.pdf']
    const parsed = parseBatchStartRequest({ urls, robotsOverrides: [{ url: 'https://b.test/two.pdf', reason: 'publisher link' }] })
    expect(parsed.robotsOverrides).toEqual([{ url: 'https://b.test/two.pdf', reason: 'publisher link' }])
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: [{ url: 'https://c.test/', reason: 'r' }] })).toThrow('robotsOverrides[0].url is not one of the batch urls')
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: [{ url: urls[0], reason: 'r' }, { url: urls[0], reason: 'again' }] })).toThrow('robotsOverrides[1].url is overridden twice')
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: [{ url: urls[0] }] })).toThrow('robotsOverrides[0].reason must be a non-empty string')
  })

  it('parses onlyMainContent, timeout and waitFor within their bounds', () => {
    const req = parseScrapeRequest({ url: 'https://example.com/', onlyMainContent: false, timeout: 15000.4, waitFor: 500 })
    expect(req).toMatchObject({ onlyMainContent: false, timeout: 15000, waitFor: 500 })
    expect(parseScrapeRequest({ url: 'https://example.com/' })).not.toHaveProperty('timeout')
    expect(() => parseScrapeRequest({ url: 'https://example.com/', timeout: 500 })).toThrow('timeout must be a number of milliseconds between 1000 and 300000')
    expect(() => parseScrapeRequest({ url: 'https://example.com/', waitFor: 60000 })).toThrow('waitFor must be a number of milliseconds between 0 and 30000')
    expect(() => parseScrapeRequest({ url: 'https://example.com/', onlyMainContent: 'no' })).toThrow('onlyMainContent must be a boolean')
  })

  it('has no fixed cap on the formats array beyond one entry per format', () => {
    const schema = { type: 'object', properties: { title: { type: 'string' } } }
    expect(parseScrapeRequest({ url: 'https://example.com/', formats: ['markdown', 'links', { type: 'json', schema }] }).formats).toHaveLength(3)
    expect(() => parseScrapeRequest({ url: 'https://example.com/', formats: ['markdown', 'links', 'markdown'] })).toThrow('formats must not contain duplicates')
    expect(() => parseScrapeRequest({ url: 'https://example.com/', formats: [] })).toThrow('formats must be a non-empty array')
  })

  it('maps a Firecrawl scrape body onto the served formats and page options', () => {
    const req = parseFirecrawlScrapeRequest({ url: 'https://example.com/', formats: ['html', 'links', { type: 'markdown' }], onlyMainContent: false, waitFor: 250, timeout: 20000 })
    expect(req).toMatchObject({ url: 'https://example.com/', formats: ['markdown', 'links', 'html'], onlyMainContent: false, waitFor: 250, timeout: 20000 })
    expect(parseFirecrawlScrapeRequest({ url: 'https://example.com/', formats: ['screenshot'] }).formats).toBeUndefined()
  })

  it('parses crawl path patterns and per-page scrape options, and wants integer bounds', () => {
    const req = parseCrawlStartRequest({
      url: 'https://example.com/',
      maxPages: 5,
      includePaths: ['^/docs/', '^/blog/\\d{4}/'],
      excludePaths: ['\\.pdf$'],
      scrapeOptions: { formats: ['markdown', 'links'], onlyMainContent: false, waitFor: 250 },
    })
    expect(req).toMatchObject({
      includePaths: ['^/docs/', '^/blog/\\d{4}/'],
      excludePaths: ['\\.pdf$'],
      scrapeOptions: { formats: ['markdown', 'links'], onlyMainContent: false, waitFor: 250 },
    })
    expect(parseCrawlStartRequest({ url: 'https://example.com/' })).not.toHaveProperty('scrapeOptions')
    expect(() => parseCrawlStartRequest({ url: 'https://example.com/', includePaths: ['('] })).toThrow('includePaths entry is not a valid regular expression: (')
    expect(() => parseCrawlStartRequest({ url: 'https://example.com/', excludePaths: 'nope' })).toThrow('excludePaths must be an array of at most 100 non-empty strings')
    expect(() => parseCrawlStartRequest({ url: 'https://example.com/', scrapeOptions: { url: 'https://other.example/' } })).toThrow('unknown scrapeOptions option: url')
    expect(() => parseCrawlStartRequest({ url: 'https://example.com/', maxPages: 2.5 })).toThrow('maxPages must be an integer >= 1')
    expect(() => parseCrawlStartRequest({ url: 'https://example.com/', maxDepth: -1 })).toThrow('maxDepth must be an integer >= 0')
  })

  it('accepts schema annotations and nullable alternatives written for other tools', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Offer',
      type: 'object',
      properties: {
        price: { type: 'number', minimum: 0, default: 0, description: 'Price as shown' },
        sku: { type: 'string', pattern: '^[A-Z0-9]+$', format: 'sku', minLength: 1, maxLength: 20 },
        colour: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        kind: { const: 'physical' },
        tags: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 20, uniqueItems: true, examples: [['audio']] },
      },
      required: ['price'],
    }
    expect(parseScrapeRequest({ url: 'https://example.com/', formats: [{ type: 'json', schema }] }).formats).toHaveLength(1)
    expect(() => parseScrapeRequest({ url: 'https://example.com/', formats: [{ type: 'json', schema: { oneOf: [] } }] })).toThrow('json schema oneOf must be a non-empty array')
    expect(() => parseScrapeRequest({ url: 'https://example.com/', formats: [{ type: 'json', schema: { type: 'object', properties: { a: { readOnly: true } } } }] })).toThrow('unsupported json schema keyword: readOnly')
  })

  it('rejects remote JSON schema references', () => {
    expect(() => parseScrapeRequest({
      url: 'https://example.com/product',
      formats: [{ type: 'json', schema: { $ref: 'https://schemas.example/product.json' } }],
    })).toThrow('only supports local $ref')
  })
})
