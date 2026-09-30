import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_ERROR_CODES, API_ERROR_STATUS, CRAWL_MODES, DEFAULT_MAX_FILE_BYTES, defaultApiMode, fileByteCap, isApiCrawlMode, isApiErrorCode, maxFileBytesFromEnv, parseBatchStartRequest, parseCrawlStartRequest, parseScrapeRequest, RequestError } from '../src/index.js'
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
    expect(() => parseScrapeRequest({ url, formats: ['markdown', 'links', 'screenshot', 'summary'] }))
      .toThrow('unsupported formats: screenshot, summary (supported: markdown, links, json, html, rawHtml)')
    expect(() => parseBatchStartRequest({ urls: [url], formats: ['markdown', { type: 'screenshot' }] })).toThrow('unsupported format: screenshot')
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

  it('rejects unknown request keys by name for scrape, batch and crawl', () => {
    const url = 'https://example.com/'
    expect(() => parseScrapeRequest({ url, actions: [], mobile: true })).toThrow('unsupported parameters: actions, mobile')
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
    expect(thrown(() => parseBatchStartRequest({ urls: [url], formats: ['markdown', 'summary', { type: 'screenshot' }] }))).toMatchObject({ code: 'unsupported_format', details: { formats: ['summary', 'screenshot'] } })
    const invalid = thrown(() => parseScrapeRequest({ url: 'ftp://example.com/' }))
    expect(invalid).toMatchObject({ status: 400, code: 'invalid_request', message: 'url must be http(s)' })
    expect((invalid as { details?: unknown }).details).toBeUndefined()
  })
})
