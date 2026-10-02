import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_ERROR_CODES, API_ERROR_STATUS, CRAWL_MODES, DEFAULT_CRAWL_SPEC, DEFAULT_MAX_FILE_BYTES, defaultApiMode, fileByteCap, headerRefusal, isApiCrawlMode, isApiErrorCode, maxFileBytesFromEnv, parseBatchErrorsQuery, parseBatchStartRequest, parseCrawlPageQuery, parseCrawlStartRequest, parseScrapeRequest, RATE_LIMITED_CODE, rateLimitedBody, REFUSAL_HINTS, refusalHint, RequestError, WEBHOOK_EVENTS } from '../src/index.js'
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

  it('accepts Pydantic and zod-to-json-schema output: annotations, assertions, nullable anyOf and definitions', () => {
    const url = 'https://example.com/product'
    const pydantic = {
      $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Book', description: 'A catalogue page.', type: 'object',
      properties: {
        title: { title: 'Title', type: 'string', minLength: 1, maxLength: 300 },
        price: { title: 'Price', anyOf: [{ type: 'number', minimum: 0, exclusiveMaximum: 1e6 }, { type: 'null' }], default: null, examples: [51.77] },
        upc: { title: 'Upc', type: 'string', pattern: '^[0-9a-f]{16}$' },
        format: { title: 'Format', const: 'paperback' },
        url: { title: 'Url', type: 'string', format: 'uri', readOnly: true },
        rating: { title: 'Rating', oneOf: [{ type: 'integer', maximum: 5 }, { type: 'string', enum: ['One', 'Two'] }] },
        tags: { title: 'Tags', type: 'array', items: { type: 'string' }, maxItems: 10, uniqueItems: true },
        author: { anyOf: [{ $ref: '#/$defs/Author' }, { type: 'null' }], default: null },
      },
      required: ['title', 'price'],
      $defs: { Author: { title: 'Author', type: 'object', properties: { name: { type: 'string', description: 'Full name' }, parent: { $ref: '#/$defs/Author', description: 'Recursive' } }, required: ['name'] } },
    }
    const zod = {
      $ref: '#/definitions/Book', $schema: 'http://json-schema.org/draft-07/schema#',
      definitions: { Book: { type: 'object', properties: { title: { type: 'string' }, subtitle: { type: ['string', 'null'] }, related: { $ref: '#' } }, required: ['title'], additionalProperties: false } },
    }
    for (const schema of [pydantic, zod]) {
      const req = parseScrapeRequest({ url, formats: ['markdown', { type: 'json', schema }] })
      expect(req.formats?.[1]).toEqual({ type: 'json', schema })
    }
  })

  it('refuses JSON Schema keywords W2L cannot honour by name and location, and malformed ones as invalid', () => {
    const url = 'https://example.com/product'
    const refused = (schema: unknown) => thrown(() => parseScrapeRequest({ url, formats: ['links', { type: 'json', schema }] }))
    const object = (properties: Record<string, unknown>) => ({ type: 'object', properties })
    const unsupported: Array<[unknown, string]> = [
      [object({ author: { allOf: [{ type: 'object' }] } }), 'formats[1].schema.properties.author.allOf'],
      [object({ price: { not: { type: 'null' } } }), 'formats[1].schema.properties.price.not'],
      [{ ...object({}), patternProperties: { '^x': { type: 'string' } } }, 'formats[1].schema.patternProperties'],
      [object({ price: { type: 'number', nullable: true } }), 'formats[1].schema.properties.price.nullable'],
      [object({ pet: { anyOf: [object({ bark: { type: 'string' } }), object({ purr: { type: 'string' } })] } }), 'formats[1].schema.properties.pet.anyOf'],
      [object({ author: { $ref: '#/$defs/A', type: 'object' } }), 'formats[1].schema.properties.author.type'],
      [object({ author: { $id: 'https://example.com/author', type: 'object' } }), 'formats[1].schema.properties.author.$id'],
      [{ $schema: 'http://json-schema.org/draft-04/schema#', ...object({}) }, 'formats[1].schema.$schema'],
    ]
    for (const [schema, parameter] of unsupported) {
      const error = refused(schema)
      expect(error, parameter).toMatchObject({ status: 400, code: 'unsupported_parameter', details: { parameters: [parameter] } })
      expect((error as Error).message).toContain(parameter.split('.').pop())
    }
    const invalid: Array<[unknown, string]> = [
      [object({ upc: { type: 'string', pattern: '(' } }), 'pattern'],
      [object({ upc: { type: 'string', pattern: '^(a+)+$' } }), 'pattern can take too long to match'],
      [object({ upc: { type: 'string', pattern: 'a'.repeat(2001) } }), 'pattern must be a regular expression of at most 2000 characters'],
      [object({ price: { type: 'number', minimum: '0' } }), 'minimum'],
      [object({ tags: { type: 'array', items: [{ type: 'string' }] } }), 'items'],
      [object({ author: { $ref: '#/$defs/Missing' } }), '#/$defs/Missing'],
      [{ ...object({ author: { $ref: '#/$defs/A' } }), $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } } }, 'leads only to itself'],
    ]
    for (const [schema, keyword] of invalid) {
      const error = refused(schema)
      expect(error, keyword).toMatchObject({ status: 400, code: 'invalid_request' })
      expect((error as Error).message).toContain(keyword)
    }
    let deep: Record<string, unknown> = { type: 'string' }
    for (let level = 0; level < 5; level++) deep = object({ child: { anyOf: [deep, { type: 'null' }] } })
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'json', schema: deep }] })).toThrow('json schema must be at most 8 levels deep')
  })

  it('names unsupported formats instead of capping the count, and still rejects duplicates', () => {
    const url = 'https://example.com/'
    expect(() => parseScrapeRequest({ url, formats: ['markdown', 'links', 'summary', 'changeTracking'] }))
      .toThrow('unsupported formats: summary, changeTracking (supported: markdown, links, json, html, rawHtml, images, screenshot, attributes)')
    expect(() => parseBatchStartRequest({ urls: [url], formats: ['markdown', { type: 'summary' }] })).toThrow('unsupported format: summary')
    expect(() => parseCrawlStartRequest({ url, formats: ['links', 'links'] })).toThrow('formats must not contain duplicates')
    expect(() => parseScrapeRequest({ url, formats: [] })).toThrow('formats must be a non-empty array')
  })

  it('accepts the html and rawHtml formats and CSS selector lists on scrape, batch and crawl', () => {
    const url = 'https://example.com/'
    const req = parseScrapeRequest({ url, formats: ['markdown', 'html', 'rawHtml'], includeTags: ['main', ' table.wikitable '], excludeTags: ['.mw-editsection'] })
    expect(req.formats).toEqual(['markdown', 'html', 'rawHtml'])
    expect(req.includeTags).toEqual(['main', 'table.wikitable'])
    expect(req.excludeTags).toEqual(['.mw-editsection'])
    expect(parseBatchStartRequest({ urls: [url], formats: ['html'], includeTags: ['article'] })).toMatchObject({ formats: ['html'], includeTags: ['article'] })
    expect(parseCrawlStartRequest({ url, formats: ['rawHtml'], excludeTags: ['nav'] })).toMatchObject({ formats: ['rawHtml'], excludeTags: ['nav'] })
    expect(parseScrapeRequest({ url })).not.toHaveProperty('includeTags')
    expect(() => parseScrapeRequest({ url, formats: ['html', 'html'] })).toThrow('formats must not contain duplicates')
    expect(() => parseScrapeRequest({ url, includeTags: 'main' })).toThrow('includeTags must be an array of at most 100 CSS selectors of 1 to 200 characters')
    expect(() => parseBatchStartRequest({ urls: [url], excludeTags: [' '] })).toThrow('excludeTags must be an array of at most 100 CSS selectors of 1 to 200 characters')
    expect(() => parseCrawlStartRequest({ url, excludeTags: ['a'.repeat(201)] })).toThrow('excludeTags must be an array of at most 100 CSS selectors')
    expect(() => parseScrapeRequest({ url, includeTags: Array.from({ length: 101 }, () => 'p') })).toThrow('includeTags must be an array of at most 100 CSS selectors')
    // The lanes' own switches are not request fields: the formats ask for the HTML.
    expect(() => parseScrapeRequest({ url, includeHtml: true })).toThrow('unsupported parameter: includeHtml')
  })

  it('takes a crawl\'s sitemap mode and concurrency cap, and refuses them on scrape and batch', () => {
    const url = 'https://example.com/'
    expect(parseCrawlStartRequest({ url, sitemap: 'only', maxConcurrency: 2 })).toMatchObject({ sitemap: 'only', maxConcurrency: 2 })
    expect(parseCrawlStartRequest({ url, sitemap: 'skip' })).toMatchObject({ sitemap: 'skip' })
    expect(parseCrawlStartRequest({ url, maxConcurrency: null })).toMatchObject({ maxConcurrency: null })
    const plain = parseCrawlStartRequest({ url })
    expect(plain).not.toHaveProperty('sitemap')
    expect(plain).not.toHaveProperty('maxConcurrency')
    for (const sitemap of ['all', 'INCLUDE', true, null]) expect(() => parseCrawlStartRequest({ url, sitemap })).toThrow('sitemap must be include, skip, or only')
    for (const maxConcurrency of [0, -1, 1.5, '2', true]) expect(() => parseCrawlStartRequest({ url, maxConcurrency })).toThrow('maxConcurrency must be an integer >= 1')
    expect(() => parseScrapeRequest({ url, sitemap: 'include' })).toThrow('unsupported parameter: sitemap')
    expect(() => parseBatchStartRequest({ urls: [url], sitemap: 'skip' })).toThrow('unsupported parameter: sitemap')
    // A batch has a cap of its own, read by its own rule (below): the crawl's null is not one of its values.
    expect(() => parseBatchStartRequest({ urls: [url], maxConcurrency: null })).toThrow('maxConcurrency must be an integer between 1 and 4')
    expect(DEFAULT_CRAWL_SPEC).toMatchObject({ sitemap: 'include', maxConcurrency: null })
  })

  it('takes a batch\'s maxConcurrency from 1 to 4 and ignoreInvalidURLs, and names the entry a refused URL sits at', () => {
    const url = 'https://example.com/'
    for (const maxConcurrency of [1, 2, 3, 4]) expect(parseBatchStartRequest({ urls: [url], maxConcurrency })).toMatchObject({ maxConcurrency })
    expect(parseBatchStartRequest({ urls: [url] })).not.toHaveProperty('maxConcurrency')
    for (const maxConcurrency of [0, 5, 2.5, '2', true]) expect(() => parseBatchStartRequest({ urls: [url], maxConcurrency })).toThrow('maxConcurrency must be an integer between 1 and 4')
    expect(() => parseCrawlStartRequest({ url, appendToId: 'b1' })).toThrow('unsupported parameter: appendToId')
    const mixed = ['https://example.com', 'not a url', 'ftp://x']
    expect(parseBatchStartRequest({ urls: mixed, ignoreInvalidURLs: true })).toMatchObject({ urls: ['https://example.com'], ignoreInvalidURLs: true, invalidURLs: ['not a url', 'ftp://x'] })
    expect(parseBatchStartRequest({ urls: [url], ignoreInvalidURLs: true })).toMatchObject({ invalidURLs: [] })
    expect(parseBatchStartRequest({ urls: [url], ignoreInvalidURLs: false })).not.toHaveProperty('invalidURLs')
    expect(parseBatchStartRequest({ urls: [url] })).not.toHaveProperty('invalidURLs')
    expect(() => parseBatchStartRequest({ urls: mixed })).toThrow('urls[1] must be http(s)')
    expect(() => parseBatchStartRequest({ urls: [url, ''] })).toThrow('urls[1] is required')
    expect(() => parseBatchStartRequest({ urls: ['not a url', 'ftp://x'], ignoreInvalidURLs: true })).toThrow('urls must contain at least one valid URL')
    expect(() => parseBatchStartRequest({ urls: [url], ignoreInvalidURLs: 'yes' })).toThrow('ignoreInvalidURLs must be a boolean')
    // The option skips invalid URLs, not invalid JSON; a duplicate is not an invalid URL; the wire type has no invalidURLs.
    expect(() => parseBatchStartRequest({ urls: [42], ignoreInvalidURLs: true })).toThrow('urls[0] must be a string')
    expect(() => parseBatchStartRequest({ urls: [url, url, 'ftp://x'], ignoreInvalidURLs: true })).toThrow('urls must be unique')
    expect(() => parseBatchStartRequest({ urls: [url], invalidURLs: [] })).toThrow('unsupported parameter: invalidURLs')
    // An override binds to the valid list.
    expect(() => parseBatchStartRequest({ urls: mixed, ignoreInvalidURLs: true, robotsOverrides: [{ url: 'ftp://x', reason: 'r' }] })).toThrow('robotsOverrides[0].url is not one of the batch urls')
    // Firecrawl's extract scope flags: false says what already holds and is kept as sent; true is refused by name, pointing at the crawl option; neither is a crawl option here.
    expect(parseBatchStartRequest({ urls: [url], allowExternalLinks: false, includeSubdomains: false })).toMatchObject({ allowExternalLinks: false, includeSubdomains: false })
    expect(parseBatchStartRequest({ urls: [url] })).not.toHaveProperty('allowExternalLinks')
    expect(() => parseBatchStartRequest({ urls: [url], allowExternalLinks: true })).toThrow('allowExternalLinks: true is not offered on a batch: a batch fetches only the URLs given; a crawl takes allowExternalLinks, and extraction across links is the M5 multi-URL extract')
    expect(() => parseBatchStartRequest({ urls: [url], includeSubdomains: true })).toThrow('includeSubdomains: true is not offered on a batch: a batch fetches only the URLs given; a crawl takes allowSubdomains, and extraction across links is the M5 multi-URL extract')
    expect(() => parseBatchStartRequest({ urls: [url], includeSubdomains: 'yes' })).toThrow('includeSubdomains must be a boolean')
    expect(() => parseCrawlStartRequest({ url, includeSubdomains: false })).toThrow('unsupported parameter: includeSubdomains')
    expect(parseBatchStartRequest({ appendToId: 'batch-1', urls: [url], allowExternalLinks: false })).toMatchObject({ appendToId: 'batch-1', allowExternalLinks: false })
    // The scrape and crawl messages keep their field name.
    expect(() => parseScrapeRequest({ url: 'ftp://example.com/' })).toThrow('url must be http(s)')
    expect(() => parseCrawlStartRequest({ url: '' })).toThrow('url is required')
    // The errors route's query: a cursor and a limit of 1 to 1000.
    expect(parseBatchErrorsQuery({})).toEqual({})
    expect(parseBatchErrorsQuery({ cursor: 'c1', limit: '1000' })).toEqual({ cursor: 'c1', limit: 1000 })
    for (const limit of ['0', '1001', '2.5', 'ten']) expect(() => parseBatchErrorsQuery({ limit })).toThrow('limit must be an integer between 1 and 1000')
    expect(() => parseBatchErrorsQuery({ cursor: '' })).toThrow('cursor must not be empty')
  })

  it('takes an idempotency key on batch and crawl, and appendToId with only the entries and what binds to them', () => {
    const url = 'https://example.com/'
    expect(parseBatchStartRequest({ urls: [url], idempotencyKey: 'nightly-2026-10-02' })).toMatchObject({ idempotencyKey: 'nightly-2026-10-02' })
    expect(parseCrawlStartRequest({ url, idempotencyKey: 'k'.repeat(200) })).toMatchObject({ idempotencyKey: 'k'.repeat(200) })
    expect(parseBatchStartRequest({ urls: [url] })).not.toHaveProperty('idempotencyKey')
    expect(parseCrawlStartRequest({ url })).not.toHaveProperty('idempotencyKey')
    for (const idempotencyKey of ['', 'k'.repeat(201), 'a\nb', 'a\u0000b', 'a\u007f', 7, null, true]) {
      expect(() => parseBatchStartRequest({ urls: [url], idempotencyKey }), JSON.stringify(idempotencyKey)).toThrow('idempotencyKey must be a string of 1 to 200 characters')
      expect(() => parseCrawlStartRequest({ url, idempotencyKey }), JSON.stringify(idempotencyKey)).toThrow('idempotencyKey must be a string of 1 to 200 characters')
    }
    // A scrape is answered in the same call: it takes no key.
    expect(() => parseScrapeRequest({ url, idempotencyKey: 'k' })).toThrow('unsupported parameter: idempotencyKey')
    // An append carries the entries, what binds to them (an override, the skip, a key) and the labels.
    const append = parseBatchStartRequest({ appendToId: 'batch-1', urls: [url, 'not a url'], ignoreInvalidURLs: true, idempotencyKey: 'k', robotsOverrides: [{ url, reason: 'r' }], integration: 'nightly' })
    expect(append).toMatchObject({ appendToId: 'batch-1', urls: [url], invalidURLs: ['not a url'], idempotencyKey: 'k', robotsOverrides: [{ url, reason: 'r' }], integration: 'nightly' })
    expect(parseBatchStartRequest({ urls: [url] })).not.toHaveProperty('appendToId')
    // The job's options stay as they were: each is refused by name, the page options included.
    for (const option of [{ formats: ['markdown'] }, { mode: 'standard' }, { includeLinks: true }, { maxConcurrency: 2 }, { onlyMainContent: false }, { timeout: 5_000 }, { headers: { Referer: 'https://example.com/' } }]) {
      const [key] = Object.keys(option)
      expect(() => parseBatchStartRequest({ appendToId: 'batch-1', urls: [url], ...option })).toThrow(`appendToId keeps the job's options; ${key} cannot be changed`)
    }
    for (const appendToId of ['', 7, null, 'x'.repeat(201)]) expect(() => parseBatchStartRequest({ appendToId, urls: [url] }), JSON.stringify(appendToId)).toThrow('appendToId must be a non-empty string')
    // The entries of an append are checked as a new batch's are.
    expect(() => parseBatchStartRequest({ appendToId: 'batch-1', urls: [] })).toThrow('urls must contain 1 to 1000 URLs')
    expect(() => parseBatchStartRequest({ appendToId: 'batch-1', urls: [url, 'ftp://x'] })).toThrow('urls[1] must be http(s)')
    expect(() => parseBatchStartRequest({ appendToId: 'batch-1', urls: [url, url] })).toThrow('urls must be unique')
  })

  it('accepts the images format, one attributes entry within its bounds and removeBase64Images on scrape, batch and crawl, each refusal by name', () => {
    const url = 'https://example.com/'
    const attributes = { type: 'attributes', selectors: [{ selector: ' span.titleline > a ', attribute: 'href' }, { selector: 'tr.athing', attribute: 'id' }] }
    const req = parseScrapeRequest({ url, formats: ['markdown', 'images', attributes, { type: 'json', schema: { type: 'object' } }], removeBase64Images: false })
    expect(req.formats).toEqual(['markdown', 'images', { type: 'attributes', selectors: [{ selector: 'span.titleline > a', attribute: 'href' }, { selector: 'tr.athing', attribute: 'id' }] }, { type: 'json', schema: { type: 'object' } }])
    expect(req.removeBase64Images).toBe(false)
    expect(parseBatchStartRequest({ urls: [url], formats: ['images'], removeBase64Images: true })).toMatchObject({ formats: ['images'], removeBase64Images: true })
    expect(parseCrawlStartRequest({ url, formats: [attributes] }).formats).toHaveLength(1)
    expect(parseScrapeRequest({ url })).not.toHaveProperty('removeBase64Images')
    expect(() => parseScrapeRequest({ url, removeBase64Images: 'yes' })).toThrow('removeBase64Images must be a boolean')
    expect(() => parseCrawlStartRequest({ url, removeBase64Images: 1 })).toThrow('removeBase64Images must be a boolean')
    expect(() => parseScrapeRequest({ url, formats: ['images', 'images'] })).toThrow('formats must not contain duplicates')
    const selectors = 'attributes format requires selectors: an array of 1 to 50 {selector, attribute} entries'
    expect(() => parseScrapeRequest({ url, formats: ['attributes'] })).toThrow(selectors)
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes' }] })).toThrow(selectors)
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [] }] })).toThrow(selectors)
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: ['a'] }] })).toThrow(selectors)
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: Array.from({ length: 51 }, () => ({ selector: 'a', attribute: 'href' })) }] })).toThrow(selectors)
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [{ selector: ' ', attribute: 'href' }] }] })).toThrow('attributes selectors[0].selector must be a non-empty string of at most 200 characters')
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [{ selector: 'a'.repeat(201), attribute: 'href' }] }] })).toThrow('attributes selectors[0].selector must be a non-empty string of at most 200 characters')
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [{ selector: 'a', attribute: 'href' }, { selector: 'a', attribute: '1x' }] }] })).toThrow('attributes selectors[1].attribute must be an HTML attribute name')
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [{ selector: 'a', attribute: 'x'.repeat(101) }] }] })).toThrow('attributes selectors[0].attribute must be an HTML attribute name')
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [{ selector: 'a', attribute: 'href' }], prompt: 'x' }] })).toThrow('unsupported attributes format option: prompt')
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [{ selector: 'a', attribute: 'href', all: true }] }] })).toThrow('unsupported attributes selector option: all')
    expect(() => parseScrapeRequest({ url, formats: [attributes, attributes] })).toThrow('formats must contain at most one attributes entry')
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'images' }] })).toThrow('formats entries must be markdown, links, json, html, rawHtml, images, screenshot, a json schema request, an attributes request or a screenshot request')
    // The lanes' own switches are not request fields: the formats ask for the images and attributes.
    expect(() => parseScrapeRequest({ url, includeImages: true })).toThrow('unsupported parameter: includeImages')
    expect(() => parseScrapeRequest({ url, attributes: [] })).toThrow('unsupported parameter: attributes')
  })

  it('accepts a screenshot entry as a string, Firecrawl v1\'s full-page alias or an object within its bounds, one per request, each refusal by name', () => {
    const url = 'https://example.com/'
    expect(parseScrapeRequest({ url, formats: ['markdown', 'screenshot'] }).formats).toEqual(['markdown', 'screenshot'])
    expect(parseScrapeRequest({ url, formats: ['screenshot@fullPage'] }).formats).toEqual([{ type: 'screenshot', fullPage: true }])
    expect(parseBatchStartRequest({ urls: [url], formats: [{ type: 'screenshot', fullPage: true, quality: 60, viewport: { width: 800, height: 600 } }] }).formats).toEqual([{ type: 'screenshot', fullPage: true, quality: 60, viewport: { width: 800, height: 600 } }])
    expect(parseCrawlStartRequest({ url, formats: [{ type: 'screenshot' }] }).formats).toEqual([{ type: 'screenshot' }])
    // A window within the declared mobile screen is fine with the mobile identity.
    expect(parseScrapeRequest({ url, mobile: true, formats: [{ type: 'screenshot', viewport: { width: 400, height: 900 } }] }).formats).toHaveLength(1)
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'screenshot', fullPage: 'yes' }] })).toThrow('screenshot fullPage must be a boolean')
    for (const quality of [0, 101, 60.5, '60']) expect(() => parseScrapeRequest({ url, formats: [{ type: 'screenshot', quality }] })).toThrow('screenshot quality must be an integer between 1 and 100')
    const viewportMessage = 'screenshot viewport must be {width, height} with integers within 320..1920 by 240..1080'
    for (const viewport of [[1280, 800], null, { width: 319, height: 800 }, { width: 1921, height: 800 }, { width: 1280, height: 239 }, { width: 1280, height: 1081 }, { width: 1280.5, height: 800 }, { height: 800 }]) {
      expect(() => parseScrapeRequest({ url, formats: [{ type: 'screenshot', viewport }] })).toThrow(viewportMessage)
    }
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'screenshot', clip: {} }] })).toThrow('unsupported screenshot format option: clip')
    expect(() => parseScrapeRequest({ url, formats: [{ type: 'screenshot', viewport: { width: 800, height: 600, scale: 2 } }] })).toThrow('unsupported screenshot viewport option: scale')
    for (const formats of [['screenshot', 'screenshot'], ['screenshot', 'screenshot@fullPage'], ['screenshot', { type: 'screenshot' }], [{ type: 'screenshot' }, { type: 'screenshot', fullPage: true }]]) {
      expect(() => parseScrapeRequest({ url, formats })).toThrow('formats must contain at most one screenshot entry')
    }
    // A window larger than the declared screen would contradict the identity; the desktop bounds are the desktop screen, the mobile identity's is 412x915.
    expect(() => parseScrapeRequest({ url, mobile: true, formats: [{ type: 'screenshot', viewport: { width: 1280, height: 800 } }] })).toThrow('screenshot viewport 1280x800 is not within the declared mobile screen 412x915')
    expect(() => parseCrawlStartRequest({ url, mobile: true, formats: ['markdown', { type: 'screenshot', viewport: { width: 412, height: 1000 } }] })).toThrow('is not within the declared mobile screen 412x915')
    // The lane's own switch is not a request field: the format asks for the capture.
    expect(() => parseScrapeRequest({ url, screenshot: {} })).toThrow('unsupported parameter: screenshot')
  })

  it('rejects unknown request keys by name for scrape, batch and crawl', () => {
    const url = 'https://example.com/'
    expect(() => parseScrapeRequest({ url, actions: [], location: {} })).toThrow('unsupported parameters: actions, location')
    expect(() => parseBatchStartRequest({ urls: [url], proxy: 'auto' })).toThrow('unsupported parameter: proxy')
    expect(() => parseCrawlStartRequest({ url, limit: 5 })).toThrow('unsupported parameter: limit')
  })

  it('parses a recorded robots override, insists on its reason, and names an unknown key inside it', () => {
    const url = 'https://example.test/report.pdf'
    expect(parseScrapeRequest({ url, robotsOverride: { reason: 'linked publicly by the publisher', recordedBy: 'analyst' } }).robotsOverride).toEqual({ reason: 'linked publicly by the publisher', recordedBy: 'analyst' })
    expect(parseScrapeRequest({ url, robotsOverride: { reason: 'r' } }).robotsOverride).toEqual({ reason: 'r' })
    expect(() => parseScrapeRequest({ url, robotsOverride: true })).toThrow('robotsOverride must be an object with a reason')
    expect(() => parseScrapeRequest({ url, robotsOverride: {} })).toThrow('robotsOverride.reason must be a non-empty string of at most 500 characters')
    expect(() => parseScrapeRequest({ url, robotsOverride: { reason: ' ' } })).toThrow('robotsOverride.reason must be a non-empty string')
    expect(() => parseScrapeRequest({ url, robotsOverride: { reason: 'r', recordedBy: 'x'.repeat(201) } })).toThrow('robotsOverride.recordedBy must be a non-empty string of at most 200 characters')
    expect(thrown(() => parseScrapeRequest({ url, robotsOverride: { reason: 'x', ignoreRobotsTxt: true } })))
      .toMatchObject({ status: 400, code: 'unsupported_parameter', message: 'unsupported parameter: robotsOverride.ignoreRobotsTxt (supported: robotsOverride.reason, robotsOverride.recordedBy)', details: { parameters: ['robotsOverride.ignoreRobotsTxt'] } })
    // The blanket switch stays refused by name, on scrape as on batch and crawl.
    expect(() => parseScrapeRequest({ url, ignoreRobotsTxt: true })).toThrow('unsupported parameter: ignoreRobotsTxt')
    expect(() => parseBatchStartRequest({ urls: [url], robotsOverride: { reason: 'r' } })).toThrow('unsupported parameter: robotsOverride')
    expect(() => parseCrawlStartRequest({ url, robotsOverrides: [] })).toThrow('unsupported parameter: robotsOverrides')
  })

  it('binds each batch robots override to one of the batch urls, once', () => {
    const urls = ['https://a.test/one.pdf', 'https://b.test/two.pdf']
    expect(parseBatchStartRequest({ urls, robotsOverrides: [{ url: 'https://b.test/two.pdf', reason: 'publisher link' }] }).robotsOverrides).toEqual([{ url: 'https://b.test/two.pdf', reason: 'publisher link' }])
    expect(parseBatchStartRequest({ urls })).not.toHaveProperty('robotsOverrides')
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: { url: urls[0], reason: 'r' } })).toThrow('robotsOverrides must be an array')
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: [{ url: 'https://c.test/', reason: 'r' }] })).toThrow('robotsOverrides[0].url is not one of the batch urls')
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: [{ url: urls[0], reason: 'r' }, { url: urls[0], reason: 'again' }] })).toThrow('robotsOverrides[1].url is overridden twice')
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: [{ url: urls[0] }] })).toThrow('robotsOverrides[0].reason must be a non-empty string')
    expect(() => parseBatchStartRequest({ urls, robotsOverrides: [{ reason: 'r' }] })).toThrow('robotsOverrides[0].url is required')
    expect(thrown(() => parseBatchStartRequest({ urls, robotsOverrides: [{ url: urls[0], reason: 'r', ignoreRobotsTxt: true }] })))
      .toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['robotsOverrides[0].ignoreRobotsTxt'] } })
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

  it('accepts the crawl URL-scope booleans, refuses other types by name, and refuses allowExternalLinks beside an allowlist', () => {
    const url = 'https://example.com/docs/'
    const scope = { regexOnFullURL: true, ignoreQueryParameters: true, deduplicateSimilarURLs: false, crawlEntireDomain: true, allowSubdomains: true, allowExternalLinks: true }
    expect(parseCrawlStartRequest({ url, ...scope })).toMatchObject(scope)
    for (const name of Object.keys(scope)) {
      expect(parseCrawlStartRequest({ url })).not.toHaveProperty(name)
      expect(() => parseCrawlStartRequest({ url, [name]: 'yes' })).toThrow(`${name} must be a boolean`)
      // A crawl's scope is not a scrape or batch option (a batch takes Firecrawl's allowExternalLinks in its no-op form alone, below).
      expect(() => parseScrapeRequest({ url, [name]: true })).toThrow(`unsupported parameter: ${name}`)
      expect(() => parseBatchStartRequest({ urls: [url], [name]: true })).toThrow(name === 'allowExternalLinks' ? 'allowExternalLinks: true is not offered on a batch' : `unsupported parameter: ${name}`)
    }
    expect(() => parseCrawlStartRequest({ url, allowExternalLinks: true, allowlistedDomains: ['other.test'] })).toThrow('allowExternalLinks cannot be combined with allowlistedDomains')
    expect(parseCrawlStartRequest({ url, allowExternalLinks: true, allowlistedDomains: [] })).toMatchObject({ allowExternalLinks: true })
    expect(parseCrawlStartRequest({ url, allowExternalLinks: false, allowlistedDomains: ['other.test'] })).toMatchObject({ allowlistedDomains: ['other.test'] })
    expect(parseCrawlPageQuery({ includeDuplicates: 'true' })).toMatchObject({ includeDuplicates: true })
    expect(parseCrawlPageQuery({ includeDuplicates: 'false' })).toMatchObject({ includeDuplicates: false })
    expect(parseCrawlPageQuery({})).not.toHaveProperty('includeDuplicates')
    expect(() => parseCrawlPageQuery({ includeDuplicates: '1' })).toThrow('includeDuplicates must be true or false')
  })

  it('refuses a path filter that can backtrack catastrophically, with invalid_request, and keeps lookaround', () => {
    const url = 'https://example.com/'
    expect(parseCrawlStartRequest({ url, includePaths: ['^/catalogue/(?!category/)[^/]+/index\\.html$'] }).includePaths).toEqual(['^/catalogue/(?!category/)[^/]+/index\\.html$'])
    let error: unknown
    try { parseCrawlStartRequest({ url, excludePaths: ['^/(a+)+$'] }) } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ code: 'invalid_request', message: 'excludePaths contains a regular expression that can take too long to match (a repeated group has a repeated or optional part inside and no separator that part cannot match): ^/(a+)+$' })
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
    expect(thrown(() => parseBatchStartRequest({ urls: [url], formats: ['markdown', 'summary', { type: 'changeTracking' }] }))).toMatchObject({ code: 'unsupported_format', details: { formats: ['summary', 'changeTracking'] } })
    const invalid = thrown(() => parseScrapeRequest({ url: 'ftp://example.com/' }))
    expect(invalid).toMatchObject({ status: 400, code: 'invalid_request', message: 'url must be http(s)' })
    expect((invalid as { details?: unknown }).details).toBeUndefined()
  })

  it('accepts custom headers, lower-cases their names, and refuses by name what the lanes never send on a caller\'s behalf', () => {
    const url = 'https://example.com/'
    expect(parseScrapeRequest({ url, headers: { 'X-Test': 'w2l', 'Accept-Language': 'de' } }).headers).toEqual({ 'x-test': 'w2l', 'accept-language': 'de' })
    expect(parseBatchStartRequest({ urls: [url], headers: { Referer: 'https://example.com/' } }).headers).toEqual({ referer: 'https://example.com/' })
    expect(parseCrawlStartRequest({ url, headers: { 'If-None-Match': '"v1"', 'Cache-Control': 'no-cache' } }).headers).toEqual({ 'if-none-match': '"v1"', 'cache-control': 'no-cache' })
    expect(parseScrapeRequest({ url })).not.toHaveProperty('headers')
    for (const headers of [['x-test'], 'x-test: w2l', { 'x-test': 1 }, null]) expect(() => parseScrapeRequest({ url, headers })).toThrow('headers must be an object of string values')
    expect(() => parseScrapeRequest({ url, headers: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`x-${i}`, 'v'])) })).toThrow('headers must contain at most 32 entries')
    expect(parseScrapeRequest({ url, headers: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`x-${i}`, 'v'])) }).headers).toHaveProperty('x-31')
    expect(() => parseScrapeRequest({ url, headers: { 'x test': 'v' } })).toThrow('headers.x test is not a valid header name')
    expect(() => parseScrapeRequest({ url, headers: { '': 'v' } })).toThrow('headers. is not a valid header name')
    expect(() => parseBatchStartRequest({ urls: [url], headers: { 'X-Test': 'a', 'x-test': 'b' } })).toThrow('headers.x-test is given twice')
    expect(() => parseScrapeRequest({ url, headers: { 'x-test': 'a\r\nx-other: b' } })).toThrow('headers.x-test must be a string of at most 4096 characters without control characters')
    expect(() => parseCrawlStartRequest({ url, headers: { 'x-test': 'a'.repeat(4097) } })).toThrow('headers.x-test must be a string of at most 4096 characters without control characters')
    expect(parseScrapeRequest({ url, headers: { 'x-test': 'a'.repeat(4096) } }).headers?.['x-test']).toHaveLength(4096)
    const refused: Array<[string, string]> = [
      ['User-Agent', "headers.user-agent is refused: the User-Agent and client hints are W2L's declared identity"],
      ['Sec-CH-UA-Mobile', "headers.sec-ch-ua-mobile is refused: the User-Agent and client hints are W2L's declared identity"],
      ['Sec-Fetch-Site', "headers.sec-fetch-site is refused: the User-Agent and client hints are W2L's declared identity"],
      ['Cookie', "headers.cookie is refused: credentials are not sent as headers; mode 'authed' carries your own session on the record"],
      ['Authorization', "headers.authorization is refused: credentials are not sent as headers; mode 'authed' carries your own session on the record"],
      ['Accept-Encoding', 'headers.accept-encoding is refused: transport headers are set by the lane'],
      ['Host', 'headers.host is refused: transport headers are set by the lane'],
    ]
    for (const [name, message] of refused) {
      expect(thrown(() => parseScrapeRequest({ url, headers: { [name]: 'x' } })), name).toMatchObject({ status: 400, code: 'invalid_request', message })
      expect(() => parseBatchStartRequest({ urls: [url], headers: { [name]: 'x' } }), name).toThrow(message)
    }
    expect(headerRefusal('accept-language')).toBeNull()
    expect(headerRefusal('x-test')).toBeNull()
  })

  it('accepts mobile, skipTlsVerification, fastMode and blockAds as booleans on scrape, batch and crawl, and refuses mobile with research mode', () => {
    const url = 'https://example.com/'
    const options = { mobile: true, skipTlsVerification: true, fastMode: true, blockAds: false }
    expect(parseScrapeRequest({ url, ...options })).toMatchObject(options)
    expect(parseBatchStartRequest({ urls: [url], ...options })).toMatchObject(options)
    expect(parseCrawlStartRequest({ url, ...options })).toMatchObject(options)
    for (const name of ['mobile', 'skipTlsVerification', 'fastMode', 'blockAds'] as const) {
      expect(parseScrapeRequest({ url })).not.toHaveProperty(name)
      expect(() => parseScrapeRequest({ url, [name]: 'true' })).toThrow(`${name} must be a boolean`)
      expect(() => parseCrawlStartRequest({ url, [name]: 1 })).toThrow(`${name} must be a boolean`)
    }
    const research = 'mobile is not available in research mode: the research identity declares a bot, not a device'
    expect(() => parseScrapeRequest({ url, mode: 'research', mobile: true })).toThrow(research)
    expect(() => parseBatchStartRequest({ urls: [url], mode: 'research', mobile: true })).toThrow(research)
    expect(() => parseCrawlStartRequest({ url, mode: 'research', mobile: true })).toThrow(research)
    expect(parseScrapeRequest({ url, mode: 'research', mobile: false })).toMatchObject({ mode: 'research', mobile: false })
  })

  it('takes origin and integration as printable labels on scrape, batch and crawl, and refuses anything else by name', () => {
    const url = 'https://example.com/'
    expect(parseScrapeRequest({ url, origin: 'js-sdk@0.3.0', integration: 'nightly-prices' })).toMatchObject({ origin: 'js-sdk@0.3.0', integration: 'nightly-prices' })
    expect(parseBatchStartRequest({ urls: [url], integration: 'x'.repeat(100) }).integration).toHaveLength(100)
    expect(parseCrawlStartRequest({ url, origin: 'mcp-claude-desktop@1.2' })).toMatchObject({ origin: 'mcp-claude-desktop@1.2' })
    expect(parseScrapeRequest({ url })).not.toHaveProperty('origin')
    expect(parseScrapeRequest({ url })).not.toHaveProperty('integration')
    for (const value of ['', 'x'.repeat(101), 'with space', 'tab\there', 'ünïcode', 1, null, ['a']]) {
      expect(() => parseScrapeRequest({ url, integration: value }), JSON.stringify(value)).toThrow('integration must be a string of 1 to 100 printable characters without spaces')
      expect(() => parseCrawlStartRequest({ url, origin: value }), JSON.stringify(value)).toThrow('origin must be a string of 1 to 100 printable characters without spaces')
    }
  })

  it('names the supported route in agentHints when refusing stealth, a stealth proxy or ignoreRobotsTxt, and gives other unknown keys none', () => {
    const url = 'https://example.com/'
    expect(thrown(() => parseScrapeRequest({ url, stealth: true }))).toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['stealth'] }, agentHints: [REFUSAL_HINTS.stealth] })
    expect(thrown(() => parseBatchStartRequest({ urls: [url], proxy: 'stealth' }))).toMatchObject({ agentHints: [REFUSAL_HINTS.stealth] })
    expect(thrown(() => parseCrawlStartRequest({ url, proxy: 'enhanced', ignoreRobotsTxt: true }))).toMatchObject({ details: { parameters: ['proxy', 'ignoreRobotsTxt'] }, agentHints: [REFUSAL_HINTS.stealth, REFUSAL_HINTS.ignoreRobotsTxt] })
    expect((thrown(() => parseScrapeRequest({ url, proxy: 'basic' })) as RequestError).agentHints).toBeUndefined()
    expect((thrown(() => parseScrapeRequest({ url, actions: [] })) as RequestError).agentHints).toBeUndefined()
    expect(refusalHint('scrapeOptions.proxy', 'stealth')).toBe(REFUSAL_HINTS.stealth)
    expect(refusalHint('scrapeOptions.location', {})).toBeNull()
    // The 429 answer is not a request error: its code stays outside the set, and its body names the wait.
    expect(isApiErrorCode(RATE_LIMITED_CODE)).toBe(false)
    expect(rateLimitedBody(2, 7)).toEqual({ error: 'rate limit exceeded: 2 requests per minute', code: 'rate_limited', retryAfterSeconds: 7, agentHints: ['wait 7 s before the next request'] })
  })

  it('takes a webhook on crawl and batch as a URL string or an object, and refuses a bad URL, an unknown key and a bad secret name', () => {
    const url = 'https://example.com/'
    const hook = 'https://receiver.example/hook'
    expect(parseCrawlStartRequest({ url, webhook: hook }).webhook).toEqual({ url: hook })
    expect(parseBatchStartRequest({ urls: [url], webhook: { url: 'http://127.0.0.1:8828/hook', secretEnv: 'W2L_WEBHOOK_SECRET_TEST' } }).webhook).toEqual({ url: 'http://127.0.0.1:8828/hook', secretEnv: 'W2L_WEBHOOK_SECRET_TEST' })
    expect(parseCrawlStartRequest({ url, webhook: null })).not.toHaveProperty('webhook')
    expect(parseCrawlStartRequest({ url })).not.toHaveProperty('webhook')
    for (const value of [1, true, [], {}, { url: '' }, { headers: {} }]) expect(() => parseCrawlStartRequest({ url, webhook: value }), JSON.stringify(value)).toThrow('webhook must be a URL string or an object with url')
    expect(() => parseCrawlStartRequest({ url, webhook: 'ftp://receiver.example/hook' })).toThrow('webhook.url must be http(s)')
    expect(() => parseBatchStartRequest({ urls: [url], webhook: 'not a url' })).toThrow('webhook.url must be http(s)')
    expect(() => parseCrawlStartRequest({ url, webhook: 'https://user:pw@receiver.example/hook' })).toThrow('webhook.url must not carry credentials or a fragment')
    expect(() => parseCrawlStartRequest({ url, webhook: `${hook}#frag` })).toThrow('webhook.url must not carry credentials or a fragment')
    expect(() => parseCrawlStartRequest({ url, webhook: `https://receiver.example/${'a'.repeat(2048)}` })).toThrow('webhook.url must be at most 2048 characters')
    expect(() => parseCrawlStartRequest({ url, webhook: { url: hook, timeout: 5 } })).toThrow('unknown webhook option: timeout')
    expect(() => parseBatchStartRequest({ urls: [url], webhook: { url: hook, secretEnv: 'HOME' } })).toThrow('webhook.secretEnv must name an operator W2L_WEBHOOK_SECRET_* variable')
    // An append keeps the job's webhook as it keeps its other options.
    expect(() => parseBatchStartRequest({ urls: [url], appendToId: 'batch-1', webhook: hook })).toThrow("appendToId keeps the job's options; webhook cannot be changed")
  })

  it('takes webhook.events as the five names without duplicates, and refuses an empty list or an unknown name', () => {
    const url = 'https://example.com/'
    const hook = 'https://receiver.example/hook'
    expect(parseCrawlStartRequest({ url, webhook: { url: hook, events: ['completed', 'failed'] } }).webhook).toEqual({ url: hook, events: ['completed', 'failed'] })
    expect(parseBatchStartRequest({ urls: [url], webhook: { url: hook, events: [...WEBHOOK_EVENTS] } }).webhook).toMatchObject({ events: ['started', 'page', 'completed', 'failed', 'cancelled'] })
    const message = 'webhook.events must be a non-empty array of started, page, completed, failed, cancelled without duplicates'
    for (const events of [[], ['page', 'page'], ['done'], 'completed', [1], null]) expect(() => parseCrawlStartRequest({ url, webhook: { url: hook, events } }), JSON.stringify(events)).toThrow(message)
  })

  it('takes webhook.headers within their bounds, lower-cases their names, and refuses reserved and malformed ones by name', () => {
    const url = 'https://example.com/'
    const hook = 'https://receiver.example/hook'
    const parse = (headers: unknown) => parseCrawlStartRequest({ url, webhook: { url: hook, headers } }).webhook?.headers
    expect(parse({ Authorization: 'Bearer test', 'X-Run': 'wh3' })).toEqual({ authorization: 'Bearer test', 'x-run': 'wh3' })
    for (const name of ['Content-Type', 'content-length', 'Host', 'connection', 'transfer-encoding', 'x-w2l-event-id', 'X-W2L-Anything']) expect(() => parse({ [name]: 'v' }), name).toThrow(`webhook.headers: ${name.toLowerCase()} is reserved`)
    expect(() => parse({ 'x test': 'v' })).toThrow('webhook.headers: x test is not a valid HTTP header name')
    expect(() => parse({ 'x-run': 'a\r\nb' })).toThrow('webhook.headers value must not contain line breaks')
    expect(() => parse({ 'X-Run': 'a', 'x-run': 'b' })).toThrow('webhook.headers: x-run is given twice')
    for (const headers of [[], 'x', null, { 'x-run': 1 }, Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`x-${i}`, 'v']))]) expect(() => parse(headers), JSON.stringify(headers)).toThrow('webhook.headers must be an object of at most 32 string values')
    expect(() => parse({ 'x-big': 'a'.repeat(8192) })).toThrow('webhook.headers must be at most 8192 bytes')
    expect(parse({ 'x-big': 'a'.repeat(8192 - 'x-big'.length) })?.['x-big']).toHaveLength(8187)
    expect(parseBatchStartRequest({ urls: [url], webhook: { url: hook, headers: { 'X-Run': 'b' } } }).webhook?.headers).toEqual({ 'x-run': 'b' })
  })

  it('takes webhook.metadata as at most 32 strings of at most 1000 characters within 8 KiB, and refuses the rest', () => {
    const url = 'https://example.com/'
    const hook = 'https://receiver.example/hook'
    const parse = (metadata: unknown) => parseBatchStartRequest({ urls: [url], webhook: { url: hook, metadata } }).webhook?.metadata
    expect(parse({ run: 'wh4', team: 'parity' })).toEqual({ run: 'wh4', team: 'parity' })
    expect(parseCrawlStartRequest({ url, webhook: { url: hook, metadata: { long: 'a'.repeat(1000) } } }).webhook?.metadata?.long).toHaveLength(1000)
    expect(parse(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`k${i}`, 'a'.repeat(1000)])))).toHaveProperty('k7')
    const message = 'webhook.metadata must be an object of at most 32 string values of at most 1000 characters'
    const tooMany = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, 'v']))
    const tooLarge = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, 'a'.repeat(1000)]))
    for (const metadata of [[], 'x', null, { n: 1 }, { nested: {} }, { long: 'a'.repeat(1001) }, tooMany, tooLarge]) expect(() => parse(metadata), JSON.stringify(metadata).slice(0, 40)).toThrow(message)
  })
})
