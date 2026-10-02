import { describe, expect, it } from 'vitest'
import type { CrawlReport, FetchResult, ScrapeResponse, StepRecord } from '../src/index.js'
import {
  FIRECRAWL_SHIM_DIFFS,
  FIRECRAWL_SHIM_SNAPSHOT,
  parseFirecrawlCrawlRequest,
  parseFirecrawlScrapeRequest,
  REFUSAL_HINTS,
  RequestError,
  wrapCrawlAccepted,
  wrapCrawlStatus,
  firecrawlCrawlCounts,
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

const SCRAPE_ID = '7c1d4d2c-0f3e-4a7b-9b1a-2f0d4d1b5a6e'
/** The facts of the call that `/fc` passes through, as the API shapes them on a scrape response. */
const CALL_FACTS = { scrapeId: SCRAPE_ID, proxyUsed: null, timezone: null, creditsUsed: null, concurrencyLimited: false, concurrencyQueueDurationMs: 0 } as const

/** A scrape response as the API shapes it from a result: the run's audit, the id and the merged `metadata`. */
function scrape(partial: Partial<FetchResult> & Pick<FetchResult, 'status' | 'requestedUrl'>, extra: Partial<Pick<ScrapeResponse, 'agentHints'>> = {}): ScrapeResponse {
  const result = page(partial)
  const { creditsUsed: _credits, ...facts } = CALL_FACTS
  return {
    ...result, ...extra, scrapeId: SCRAPE_ID, channelsTried: ['http'], ladderTrace: [],
    summary: { channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: null, externalCostUsd: null, externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 0, unknown: true }, artifacts: [] },
    metadata: {
      title: null, description: null, language: null, keywords: null, robots: null, favicon: null, canonicalUrl: null, ...result.metadata,
      ...facts, sourceURL: result.requestedUrl, url: result.evidence.finalUrl, statusCode: result.evidence.httpStatus, contentType: result.evidence.contentType,
    },
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
      origin: 'js-sdk@1.29.3',
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

  it('maps html, rawHtml, includeTags and excludeTags for scrape and for a crawl\'s scrapeOptions', () => {
    const url = 'https://example.com/'
    expect(parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'html', 'rawHtml'], includeTags: ['article'], excludeTags: ['.ad'] }))
      .toEqual({ url, formats: ['markdown', 'html', 'rawHtml'], includeTags: ['article'], excludeTags: ['.ad'] })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: { formats: ['html'], includeTags: ['main'], excludeTags: ['nav'] } }))
      .toMatchObject({ formats: ['html'], includeTags: ['main'], excludeTags: ['nav'] })
    expect(() => parseFirecrawlScrapeRequest({ url, excludeTags: 'nav' })).toThrow('excludeTags must be an array of at most 100 CSS selectors')
  })

  it('rejects unsupported Firecrawl parameters and formats by name instead of dropping them', () => {
    const url = 'https://example.com/'
    expect(() => parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'summary'] })).toThrow('unsupported format: summary (the /fc shim supports markdown, links, html, rawHtml, images, screenshot, screenshot@fullPage)')
    expect(() => parseFirecrawlScrapeRequest({ url, actions: [], proxy: 'stealth', waitFor: 500 })).toThrow('unsupported parameters: actions, proxy')
    expect(() => parseFirecrawlScrapeRequest({ url, waitFor: 60_001 })).toThrow('waitFor must be an integer number of milliseconds from 0 to 60000')
    expect(() => parseFirecrawlCrawlRequest({ url, useCached: true, proxy: 'stealth', scrapeOptions: { formats: ['summary'], location: {}, waitFor: 1 } }))
      .toThrow('unsupported parameters: useCached, proxy, scrapeOptions.location; unsupported format: summary')
    expect(() => parseFirecrawlCrawlRequest({ url, ignoreSitemap: false })).toThrow('ignoreSitemap: false is not supported')
    // W2L's own recorded robots override is not mapped, and the blanket switch is refused by name.
    expect(() => parseFirecrawlScrapeRequest({ url, robotsOverride: { reason: 'publisher link' } })).toThrow('unsupported parameter: robotsOverride')
    expect(() => parseFirecrawlCrawlRequest({ url, ignoreRobotsTxt: true })).toThrow('unsupported parameter: ignoreRobotsTxt')
    // removeBase64Images is mapped with its value: true is W2L's default, false keeps the data: images.
    expect(parseFirecrawlScrapeRequest({ url, removeBase64Images: true })).toEqual({ url, removeBase64Images: true })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: { removeBase64Images: false } })).toMatchObject({ url, removeBase64Images: false })
    expect(() => parseFirecrawlScrapeRequest({ url, removeBase64Images: 'no' })).toThrow('removeBase64Images must be a boolean')
  })

  it('maps the images format and an attributes entry for scrape and a crawl\'s scrapeOptions, and serves both on data when the result carries them', () => {
    const url = 'https://example.com/'
    const attributes = { type: 'attributes', selectors: [{ selector: 'span.titleline > a', attribute: 'href' }] }
    expect(parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'images', attributes] })).toEqual({ url, formats: ['markdown', 'images', attributes] })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: { formats: ['images', 'images'] } })).toMatchObject({ formats: ['images'] })
    expect(() => parseFirecrawlScrapeRequest({ url, formats: ['markdown', { type: 'json', schema: {} }] })).toThrow('unsupported format: json (the /fc shim supports markdown, links, html, rawHtml, images, screenshot, screenshot@fullPage)')
    expect(() => parseFirecrawlScrapeRequest({ url, formats: [{ type: 'attributes', selectors: [] }] })).toThrow('attributes format requires selectors')
    expect(() => parseFirecrawlScrapeRequest({ url, formats: [42] })).toThrow('formats must be an array of strings or { type } objects')
    const served = wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln', images: ['https://example.com/a.png'], attributes: [{ selector: 'a', attribute: 'href', values: ['/x', '/y'] }] })).data
    expect(served).toMatchObject({ images: ['https://example.com/a.png'], attributes: [{ selector: 'a', attribute: 'href', values: ['/x', '/y'] }] })
    const plain = wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln' })).data
    expect(plain).not.toHaveProperty('images')
    expect(plain).not.toHaveProperty('attributes')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /data\.images/.test(d) && /Base64-Image-Removed/.test(d))).toBe(true)
  })

  it('maps the screenshot format in its three spellings for scrape and a crawl\'s scrapeOptions, and serves data.screenshot as a data URI', () => {
    const url = 'https://example.com/'
    expect(parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'screenshot'] })).toEqual({ url, formats: ['markdown', 'screenshot'] })
    expect(parseFirecrawlScrapeRequest({ url, formats: ['screenshot@fullPage'] })).toEqual({ url, formats: [{ type: 'screenshot', fullPage: true }] })
    const entry = { type: 'screenshot', fullPage: true, quality: 60, viewport: { width: 800, height: 600 } }
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: { formats: ['markdown', entry] } })).toMatchObject({ formats: ['markdown', entry] })
    expect(() => parseFirecrawlScrapeRequest({ url, formats: [{ type: 'screenshot', quality: 0 }] })).toThrow('screenshot quality must be an integer between 1 and 100')
    expect(() => parseFirecrawlScrapeRequest({ url, formats: ['screenshot', 'screenshot@fullPage'] })).toThrow('formats must contain at most one screenshot entry')
    const screenshot = { contentType: 'image/png' as const, width: 1280, height: 800, fullPage: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, quality: null, bytes: 3, sha256: 'a'.repeat(64), path: null, base64: 'iVBO' }
    expect(wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln', screenshot })).data.screenshot).toBe('data:image/png;base64,iVBO')
    expect(wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln', screenshot: { ...screenshot, contentType: 'image/jpeg', quality: 60 } })).data.screenshot).toBe('data:image/jpeg;base64,iVBO')
    // Asked for, and the browser rung could not capture it: null, never a placeholder; not asked for: no key.
    expect(wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln', screenshot: null })).data).toMatchObject({ screenshot: null })
    expect(wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln' })).data).not.toHaveProperty('screenshot')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /data\.screenshot/.test(d) && /browser rung/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /No fire-engine/.test(d) && /screenshots/.test(d))).toBe(false)
  })

  it('gives shim rejections a code and names what was rejected in details', () => {
    const url = 'https://example.com/'
    const thrown = (fn: () => unknown): unknown => {
      try { fn() } catch (error) { return error }
      return undefined
    }
    expect(thrown(() => parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'json', 'summary'] })))
      .toMatchObject({ code: 'unsupported_format', details: { formats: ['json', 'summary'] } })
    // Parameters and formats together: the parameter code wins and details keep both lists.
    expect(thrown(() => parseFirecrawlCrawlRequest({ url, proxy: 'stealth', scrapeOptions: { formats: ['summary'], actions: [] } })))
      .toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['proxy', 'scrapeOptions.actions'], formats: ['summary'] } })
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
      scrape({
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
      scrape({
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
        metadata: { sourceURL: 'https://example.com/missing', url: 'https://example.com/missing', statusCode: 404, contentType: 'text/html', error: 'http_error', ...CALL_FACTS },
      },
    })
  })

  it('wraps a contentful scrape and a crawl start onto the Firecrawl envelope', () => {
    const wrapped = wrapScrape(
      scrape({
        requestedUrl: 'https://example.com/listing',
        status: 'success',
        markdown: 'Harbour lantern catalog',
        links: ['https://example.com/item/1'],
      }),
    )
    expect(wrapped).toEqual({
      success: true,
      data: {
        markdown: 'Harbour lantern catalog',
        links: ['https://example.com/item/1'],
        metadata: { sourceURL: 'https://example.com/listing', url: 'https://example.com/listing', statusCode: 200, contentType: 'text/html', ...CALL_FACTS },
      },
    })
    expect(wrapCrawlAccepted({ taskId: 'task-1' }, 'https://example.com/listing')).toEqual({
      success: true,
      id: 'task-1',
      url: 'https://example.com/listing',
    })
  })

  it('serves html and rawHtml when the result carries them, null included, and leaves them out otherwise', () => {
    const asked = wrapScrape(scrape({ requestedUrl: 'https://example.com/', status: 'success', markdown: 'Kiln', html: '<main><p>Kiln</p></main>', rawHtml: '<!doctype html><html><body><main><p>Kiln</p></main></body></html>' }))
    expect(asked.data).toMatchObject({ markdown: 'Kiln', html: '<main><p>Kiln</p></main>', rawHtml: '<!doctype html><html><body><main><p>Kiln</p></main></body></html>' })
    expect(wrapScrape(scrape({ requestedUrl: 'https://example.com/report.pdf', status: 'success', markdown: 'Report', html: null })).data).toMatchObject({ html: null })
    const plain = wrapScrape(scrape({ requestedUrl: 'https://example.com/', status: 'success', markdown: 'Kiln' })).data
    expect(plain).not.toHaveProperty('html')
    expect(plain).not.toHaveProperty('rawHtml')
  })

  it('maps the page metadata into data.metadata and leaves out what the page did not declare', () => {
    const wrapped = wrapScrape(
      scrape({
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
      ...CALL_FACTS,
    })
  })

  it('passes the Open Graph, Dublin Core and article fields the page states into data.metadata, and leaves absent ones out', () => {
    const wrapped = wrapScrape(scrape({
      requestedUrl: 'https://example.com/report',
      status: 'success',
      markdown: 'Report',
      metadata: {
        title: 'Report', description: null, language: null, keywords: null, robots: null, favicon: null, canonicalUrl: null,
        ogSiteName: 'Example', ogImage: 'https://example.com/og.png', ogLocaleAlternate: ['fr_FR', 'de_DE'],
        publishedTime: '2025-12-18T09:30:08+00:00', articleTag: ['energy', 'regions'], dcDate: '18 December 2025',
      },
    }))
    expect(wrapped.data.metadata).toEqual({
      title: 'Report', ogSiteName: 'Example', ogImage: 'https://example.com/og.png', ogLocaleAlternate: ['fr_FR', 'de_DE'],
      publishedTime: '2025-12-18T09:30:08+00:00', articleTag: 'energy, regions', dcDate: '18 December 2025',
      sourceURL: 'https://example.com/report', url: 'https://example.com/report', statusCode: 200, contentType: 'text/html', ...CALL_FACTS,
    })
    expect(wrapped.data.metadata).not.toHaveProperty('ogTitle')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /ogTitle/.test(d) && /publishedTime/.test(d) && /no date normalisation/.test(d))).toBe(true)
  })

  it('passes the warnings through as one warning string, on a scrape and on a crawl status page, and leaves it out when there are none', () => {
    const url = 'https://example.com/'
    const warnings = [{ code: 'client_rendered_suspected', message: 'This HTTP capture may be a shell.' }, { code: 'low_content_yield', message: 'The http lane extracted 20 tokens at confidence 0.1; the browser lane did not improve it.' }]
    const result = page({ requestedUrl: url, status: 'success', markdown: 'Thin', warnings })
    expect(wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Thin', warnings })).data.warning).toBe('This HTTP capture may be a shell. The http lane extracted 20 tokens at confidence 0.1; the browser lane did not improve it.')
    expect(wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln' })).data).not.toHaveProperty('warning')
    const step: StepRecord = { id: 'step-1', taskId: 'task-1', attemptId: 'attempt-1', url, canonicalUrl: url, depth: 0, status: 'success', lane: 'http', contentHash: 'abc', cached: false, result, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }
    expect(wrapCrawlStatus({ status: 'completed' }, [step], { completed: 1, total: 1 }).data[0]?.warning).toBe('This HTTP capture may be a shell. The http lane extracted 20 tokens at confidence 0.1; the browser lane did not improve it.')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /low_content_yield/.test(d) && /data\.warning/.test(d))).toBe(true)
  })

  it('names the final URL after a redirect and leaves an unknown content type out', () => {
    const moved = wrapScrape(scrape({
      requestedUrl: 'http://example.com/old',
      status: 'success',
      markdown: 'Moved page',
      evidence: { finalUrl: 'https://example.com/new', httpStatus: 200, redirectChain: ['http://example.com/old', 'https://example.com/new'], contentType: null, rawBodySha256: null, artifacts: [] },
    }))
    expect(moved.data.metadata).toEqual({ sourceURL: 'http://example.com/old', url: 'https://example.com/new', statusCode: 200, ...CALL_FACTS })
  })

  it('passes the call\'s facts and the hints through, maps origin and integration, and names the supported route for a stealth proxy', () => {
    const url = 'https://example.com/'
    const limited = wrapScrape({ ...scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln' }, { agentHints: ['the content was cut at character 10; ask for rawHtml or a narrower includeTags'] }), metadata: { ...scrape({ requestedUrl: url, status: 'success' }).metadata, proxyUsed: 'operator', timezone: 'America/Los_Angeles', concurrencyLimited: true, concurrencyQueueDurationMs: 2345.5 } })
    expect(limited.data.metadata).toMatchObject({ scrapeId: SCRAPE_ID, proxyUsed: 'operator', timezone: 'America/Los_Angeles', creditsUsed: null, concurrencyLimited: true, concurrencyQueueDurationMs: 2345.5 })
    expect(limited.data.agent_hints).toEqual(['the content was cut at character 10; ask for rawHtml or a narrower includeTags'])
    expect(limited.data).not.toHaveProperty('agentHints')
    expect(wrapScrape(scrape({ requestedUrl: url, status: 'success', markdown: 'Kiln' })).data).not.toHaveProperty('agent_hints')
    // No cache exists: no cacheState or cachedAt, not even an invented miss.
    expect(limited.data.metadata).not.toHaveProperty('cacheState')
    expect(parseFirecrawlScrapeRequest({ url, origin: 'js-sdk@1.29.3', integration: 'parity-check' })).toMatchObject({ origin: 'js-sdk@1.29.3', integration: 'parity-check' })
    expect(parseFirecrawlCrawlRequest({ url, origin: 'py-sdk@2', integration: 'nightly' })).toMatchObject({ origin: 'py-sdk@2', integration: 'nightly' })
    expect(() => parseFirecrawlScrapeRequest({ url, integration: 'with space' })).toThrow('integration must be a string of 1 to 100 printable characters without spaces')
    const thrown = (fn: () => unknown): unknown => { try { fn() } catch (error) { return error } return undefined }
    expect(thrown(() => parseFirecrawlScrapeRequest({ url, proxy: 'stealth' }))).toMatchObject({ code: 'unsupported_parameter', details: { parameters: ['proxy'] }, agentHints: [REFUSAL_HINTS.stealth] })
    expect(thrown(() => parseFirecrawlCrawlRequest({ url, ignoreRobotsTxt: true, scrapeOptions: { proxy: 'enhanced' } }))).toMatchObject({ agentHints: [REFUSAL_HINTS.ignoreRobotsTxt, REFUSAL_HINTS.stealth] })
    expect((thrown(() => parseFirecrawlScrapeRequest({ url, location: {} })) as RequestError).agentHints).toBeUndefined()
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /scrapeId/.test(d) && /creditsUsed/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /agent_hints/.test(d) && /rate_limited/.test(d))).toBe(true)
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
    const status = wrapCrawlStatus(report, steps, { completed: 1, total: 2 })
    expect(status.status).toBe('completed')
    expect(status.total).toBe(2)
    expect(status.completed).toBe(1)
    // No credits and no expiry exist in W2L: unknown is null, never an invented value.
    expect(status.creditsUsed).toBeNull()
    expect(status.expiresAt).toBeNull()
    // No further page: `next` is left out, as Firecrawl does; a v1 client follows it while the key is there.
    expect(status).not.toHaveProperty('next')
    expect(status.data[0]?.markdown).toBe('MAIN')
    const next = 'http://127.0.0.1:8787/fc/v1/crawl/task-1?cursor=abc'
    expect(wrapCrawlStatus(report, steps, { completed: 1, total: null, next })).toMatchObject({ total: null, next })
    const statuses = (['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const).map((taskStatus) => wrapCrawlStatus({ ...report, status: taskStatus }, [], { completed: 0, total: null }).status)
    expect(statuses).toEqual(['scraping', 'scraping', 'scraping', 'completed', 'failed', 'cancelled'])
    // completed: success and partial pages; total: every step, plus the pages ahead while the crawl runs here, else unknown.
    const counts = { success: 2, partial: 1, failed: 1, duplicate: 1 }
    expect(firecrawlCrawlCounts('running', counts, 3)).toEqual({ completed: 3, total: 8 })
    expect(firecrawlCrawlCounts('paused', counts, null)).toEqual({ completed: 3, total: null })
    expect(firecrawlCrawlCounts('cancelled', counts, 3)).toEqual({ completed: 3, total: 5 })
  })

  it('maps headers, mobile, skipTlsVerification, fastMode and blockAds for scrape and for a crawl\'s scrapeOptions, with the native refusals', () => {
    const url = 'https://example.com/'
    const options = { headers: { 'X-Test': 'w2l' }, mobile: true, skipTlsVerification: true, fastMode: true, blockAds: false }
    expect(parseFirecrawlScrapeRequest({ url, ...options })).toEqual({ url, ...options, headers: { 'x-test': 'w2l' } })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: options })).toMatchObject({ ...options, headers: { 'x-test': 'w2l' } })
    expect(() => parseFirecrawlScrapeRequest({ url, headers: { 'User-Agent': 'curl/8' } })).toThrow("headers.user-agent is refused: the User-Agent and client hints are W2L's declared identity")
    expect(() => parseFirecrawlCrawlRequest({ url, scrapeOptions: { headers: { Cookie: 'sid=1' } } })).toThrow('headers.cookie is refused')
    expect(() => parseFirecrawlScrapeRequest({ url, mobile: 'yes' })).toThrow('mobile must be a boolean')
    expect(() => parseFirecrawlScrapeRequest({ url, mode: 'research', mobile: true })).toThrow('unsupported parameter: mode')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /skipTlsVerification/.test(d) && /hosted/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /blockAds/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /headers never override/.test(d))).toBe(true)
  })
})
