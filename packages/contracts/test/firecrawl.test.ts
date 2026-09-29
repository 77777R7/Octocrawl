import { describe, expect, it } from 'vitest'
import type { CrawlReport, FetchResult, StepRecord } from '../src/index.js'
import {
  FIRECRAWL_SHIM_DIFFS,
  FIRECRAWL_SHIM_SNAPSHOT,
  parseFirecrawlCrawlRequest,
  parseFirecrawlScrapeRequest,
  RequestError,
  wrapCrawlAccepted,
  wrapCrawlStatus,
  wrapScrape,
} from '../src/index.js'

function page(partial: Partial<FetchResult> & Pick<FetchResult, 'status' | 'requestedUrl'>): FetchResult {
  return {
    failureReason: null,
    blockReason: null,
    budgetExceeded: null,
    lane: 'http',
    escalations: [],
    handoff: null,
    markdown: null,
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: {
      finalUrl: partial.requestedUrl,
      httpStatus: 200,
      redirectChain: [],
      contentType: 'text/html',
      rawBodySha256: null,
      artifacts: [],
    },
    usage: {
      wallMs: 10,
      bytesWire: 1,
      bytesDecompressed: 1,
      requestCount: 1,
      attemptCount: 1,
      contentTokens: null,
      browserMs: 0,
      externalCostUsd: null,
    },
    trace: [],
    ...partial,
  }
}

describe('Firecrawl v1 shim snapshot 2026-09-18', () => {
  it('freezes scrape/crawl only and lists the known diffs', () => {
    expect(FIRECRAWL_SHIM_SNAPSHOT.capturedAt).toBe('2026-09-18')
    expect(FIRECRAWL_SHIM_SNAPSHOT.apiVersion).toBe('v1')
    expect([...FIRECRAWL_SHIM_SNAPSHOT.paths]).toEqual(['/scrape', '/crawl', '/crawl/:id'])
    expect([...FIRECRAWL_SHIM_SNAPSHOT.notCovered]).toEqual([
      'search',
      'interact',
      'agent',
      'monitor',
      'map',
      'extract',
    ])
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /challenge/i.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /fire-engine/i.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /refetch|useCached/i.test(d))).toBe(true)
  })

  it('maps the supported Firecrawl fields onto the native request', () => {
    expect(parseFirecrawlScrapeRequest({ url: 'https://example.com/', formats: ['markdown', 'links'], onlyMainContent: true, origin: 'js-sdk@1.29.3' })).toEqual({
      url: 'https://example.com/',
      formats: ['markdown', 'links'],
      onlyMainContent: true,
    })
    expect(parseFirecrawlScrapeRequest({ url: 'https://example.com/', onlyMainContent: false, waitFor: 2000, timeout: 15000 })).toMatchObject({
      onlyMainContent: false,
      waitFor: 2000,
      timeout: 15000,
    })
    expect(parseFirecrawlCrawlRequest({ url: 'https://example.com/', scrapeOptions: { onlyMainContent: false, waitFor: 500, timeout: 8000 } })).toMatchObject({
      onlyMainContent: false,
      waitFor: 500,
      timeout: 8000,
    })
    expect(
      parseFirecrawlCrawlRequest({
        url: 'https://example.com/listing',
        limit: 4,
        maxDepth: 2,
        includePaths: ['^/item/'],
        excludePaths: ['^/item/2$'],
        ignoreSitemap: true,
        origin: 'js-sdk@1.29.3',
        scrapeOptions: { formats: ['links'], onlyMainContent: true },
      }),
    ).toMatchObject({
      url: 'https://example.com/listing',
      maxPages: 4,
      maxDepth: 2,
      includePaths: ['^/item/'],
      excludePaths: ['^/item/2$'],
      formats: ['links'],
    })
  })

  it('rejects unsupported Firecrawl parameters and formats by name instead of dropping them', () => {
    const url = 'https://example.com/'
    expect(() => parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'html'] })).toThrow('unsupported format: html (the /fc shim supports markdown, links)')
    expect(() => parseFirecrawlScrapeRequest({ url, actions: [], mobile: true, waitFor: 500 })).toThrow('unsupported parameters: actions, mobile')
    expect(() => parseFirecrawlScrapeRequest({ url, waitFor: 60_001 })).toThrow('waitFor must be an integer number of milliseconds from 0 to 60000')
    expect(() => parseFirecrawlCrawlRequest({ url, useCached: true, proxy: 'stealth', scrapeOptions: { formats: ['html'], headers: {}, waitFor: 1 } }))
      .toThrow('unsupported parameters: useCached, proxy, scrapeOptions.headers; unsupported format: html')
    expect(() => parseFirecrawlCrawlRequest({ url, ignoreSitemap: false })).toThrow('ignoreSitemap: false is not supported')
    // W2L always drops data: image URIs, which is Firecrawl's removeBase64Images default.
    expect(parseFirecrawlScrapeRequest({ url, removeBase64Images: true })).toEqual({ url })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: { removeBase64Images: true } })).toMatchObject({ url })
    expect(() => parseFirecrawlScrapeRequest({ url, removeBase64Images: false })).toThrow('removeBase64Images: false is not supported')
    expect(() => parseFirecrawlCrawlRequest({ url, scrapeOptions: { removeBase64Images: false } })).toThrow('scrapeOptions.removeBase64Images: false is not supported')
  })

  it('gives shim rejections a code and names what was rejected in details', () => {
    const url = 'https://example.com/'
    const thrown = (fn: () => unknown): unknown => {
      try { fn() } catch (error) { return error }
      return undefined
    }
    expect(thrown(() => parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'html', 'screenshot'] })))
      .toMatchObject({ code: 'unsupported_format', details: { formats: ['html', 'screenshot'] } })
    // Parameters and formats together: the parameter code wins and details keep both lists.
    expect(thrown(() => parseFirecrawlCrawlRequest({ url, proxy: 'stealth', scrapeOptions: { formats: ['html'], actions: [] } })))
      .toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['proxy', 'scrapeOptions.actions'], formats: ['html'] } })
    expect(thrown(() => parseFirecrawlCrawlRequest({ url, ignoreSitemap: false })))
      .toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['ignoreSitemap'] } })
    expect(thrown(() => parseFirecrawlScrapeRequest({ url: 'ftp://example.com/' }))).toMatchObject({ code: 'invalid_request' })
  })

  it('rejects a missing url the same way the native parser does', () => {
    expect(() => parseFirecrawlScrapeRequest({})).toThrow(RequestError)
    expect(() => parseFirecrawlCrawlRequest({ limit: 3 })).toThrow(/url/)
  })

  it('does not wrap a challenge page as success', () => {
    const wrapped = wrapScrape(
      page({
        requestedUrl: 'https://example.com/challenge',
        status: 'blocked',
        blockReason: 'cloudflare_challenge',
        evidence: {
          finalUrl: 'https://example.com/challenge',
          httpStatus: 403,
          redirectChain: [],
          contentType: 'text/html',
          rawBodySha256: null,
          artifacts: [],
        },
      }),
    )
    expect(wrapped.success).toBe(false)
    expect(wrapped.error).toMatch(/cloudflare_challenge/)
    expect(wrapped.data.metadata.error).toBe('cloudflare_challenge')
  })

  it('keeps an error-status page success: false while returning its markdown and status code', () => {
    const wrapped = wrapScrape(
      page({
        requestedUrl: 'https://example.com/missing',
        status: 'failed',
        failureReason: 'http_error',
        markdown: '# 404 Not Found',
        links: [],
        evidence: {
          finalUrl: 'https://example.com/missing',
          httpStatus: 404,
          redirectChain: [],
          contentType: 'text/html',
          rawBodySha256: 'a'.repeat(64),
          artifacts: [],
        },
      }),
    )
    expect(wrapped).toEqual({
      success: false,
      error: 'failed: http_error',
      data: {
        markdown: '# 404 Not Found',
        links: [],
        metadata: { sourceURL: 'https://example.com/missing', url: 'https://example.com/missing', statusCode: 404, contentType: 'text/html', error: 'http_error' },
      },
    })
  })

  it('wraps a contentful scrape and a crawl start onto the Firecrawl envelope', () => {
    const scrape = wrapScrape(
      page({
        requestedUrl: 'https://example.com/listing',
        status: 'success',
        markdown: 'Harbour lantern catalog',
        links: ['https://example.com/item/1'],
      }),
    )
    expect(scrape).toEqual({
      success: true,
      data: {
        markdown: 'Harbour lantern catalog',
        links: ['https://example.com/item/1'],
        metadata: { sourceURL: 'https://example.com/listing', url: 'https://example.com/listing', statusCode: 200, contentType: 'text/html' },
      },
    })
    expect(wrapCrawlAccepted({ taskId: 'task-1' }, 'https://example.com/listing')).toEqual({
      success: true,
      id: 'task-1',
      url: 'https://example.com/listing',
    })
  })

  it('maps the page metadata into data.metadata and leaves out what the page did not declare', () => {
    const wrapped = wrapScrape(
      page({
        requestedUrl: 'https://example.com/',
        status: 'success',
        markdown: 'Example Domain',
        metadata: {
          title: 'Example Domain',
          description: null,
          language: 'en',
          keywords: 'example, domain',
          robots: 'noindex',
          favicon: 'https://example.com/favicon.ico',
          canonicalUrl: 'https://example.com/',
        },
      }),
    )
    expect(wrapped.data.metadata).toEqual({
      title: 'Example Domain',
      language: 'en',
      keywords: 'example, domain',
      robots: 'noindex',
      favicon: 'https://example.com/favicon.ico',
      sourceURL: 'https://example.com/',
      url: 'https://example.com/',
      statusCode: 200,
      contentType: 'text/html',
    })
  })

  it('names the final URL after a redirect and leaves an unknown content type out', () => {
    const moved = wrapScrape(page({
      requestedUrl: 'http://example.com/old',
      status: 'success',
      markdown: 'Moved page',
      evidence: { finalUrl: 'https://example.com/new', httpStatus: 200, redirectChain: ['http://example.com/old', 'https://example.com/new'], contentType: null, rawBodySha256: null, artifacts: [] },
    }))
    expect(moved.data.metadata).toEqual({ sourceURL: 'http://example.com/old', url: 'https://example.com/new', statusCode: 200 })
  })

  it('projects crawl steps into Firecrawl status data without inventing credits', () => {
    const report: CrawlReport = {
      taskId: 'task-1',
      attemptId: 'attempt-1',
      status: 'completed',
      pagesFetched: 1,
      cachedPages: 0,
      budgetExceeded: null,
      loopDetected: false,
    }
    const steps: StepRecord[] = [
      {
        id: 'step-1',
        taskId: 'task-1',
        attemptId: 'attempt-1',
        url: 'https://example.com/listing',
        canonicalUrl: 'https://example.com/listing',
        depth: 0,
        status: 'success',
        lane: 'http',
        contentHash: 'abc',
        cached: false,
        result: page({
          requestedUrl: 'https://example.com/listing',
          status: 'success',
          markdown: 'MAIN',
        }),
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      },
    ]
    const status = wrapCrawlStatus(report, steps)
    expect(status.status).toBe('completed')
    expect(status.total).toBe(1)
    expect(status.completed).toBe(1)
    // No credits and no expiry exist in W2L: unknown is null, never an invented value.
    expect(status.creditsUsed).toBeNull()
    expect(status.expiresAt).toBeNull()
    expect(status.next).toBeNull()
    expect(status.data[0]?.markdown).toBe('MAIN')
  })
})
