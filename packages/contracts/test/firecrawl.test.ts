import { describe, expect, it } from 'vitest'
import type { CrawlReport, FetchResult, JobWebhookEnvelope, MapResponse, ScrapeResponse, StepRecord } from '../src/index.js'
import {
  FIRECRAWL_SHIM_DIFFS,
  FIRECRAWL_SHIM_SNAPSHOT,
  parseFirecrawlCrawlRequest,
  parseFirecrawlMapRequest,
  parseFirecrawlScrapeRequest,
  REFUSAL_HINTS,
  RequestError,
  wrapCrawlAccepted,
  wrapCrawlStatus,
  firecrawlCrawlCounts,
  wrapJobWebhook,
  wrapMap,
  wrapScrape,
} from '../src/index.js'

/** What /fc adds to every scrape: a PDF's text without page markers unless asked, as on Firecrawl. */
const FC_PDF = { parsers: [{ type: 'pdf', pageMarkers: false }] }

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
  it('freezes scrape, crawl and map and lists the known diffs', () => {
    expect(FIRECRAWL_SHIM_SNAPSHOT.capturedAt).toBe('2026-09-18')
    expect(FIRECRAWL_SHIM_SNAPSHOT.apiVersion).toBe('v1')
    expect([...FIRECRAWL_SHIM_SNAPSHOT.paths]).toEqual(['/scrape', '/crawl', '/crawl/:id', '/map'])
    expect(FIRECRAWL_SHIM_SNAPSHOT.docs.map).toBe('https://docs.firecrawl.dev/api-reference/v1-endpoint/map')
    expect([...FIRECRAWL_SHIM_SNAPSHOT.notCovered]).toEqual([
      'search',
      'interact',
      'agent',
      'monitor',
      'extract',
    ])
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /challenge/i.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /fire-engine/i.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /omitted maxAge reuses nothing/i.test(d))).toBe(true)
  })

  it('maps the supported Firecrawl fields onto the native request', () => {
    expect(parseFirecrawlScrapeRequest({ url: 'https://example.com/', formats: ['markdown', 'links'], onlyMainContent: true, origin: 'js-sdk@1.29.3' })).toEqual({
      url: 'https://example.com/',
      ...FC_PDF,
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
      .toEqual({ url, ...FC_PDF, formats: ['markdown', 'html', 'rawHtml'], includeTags: ['article'], excludeTags: ['.ad'] })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: { formats: ['html'], includeTags: ['main'], excludeTags: ['nav'] } }))
      .toMatchObject({ formats: ['html'], includeTags: ['main'], excludeTags: ['nav'] })
    expect(() => parseFirecrawlScrapeRequest({ url, excludeTags: 'nav' })).toThrow('excludeTags must be an array of at most 100 CSS selectors')
  })

  it('rejects unsupported Firecrawl parameters and formats by name instead of dropping them', () => {
    const url = 'https://example.com/'
    expect(() => parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'summary'] })).toThrow('unsupported format: summary (the /fc shim supports markdown, links, html, rawHtml, images, screenshot, screenshot@fullPage)')
    expect(() => parseFirecrawlScrapeRequest({ url, location: {}, proxy: 'stealth', waitFor: 500 })).toThrow('unsupported parameters: location, proxy')
    // A scrape maps actions to the native option, which checks them; a crawl's scrapeOptions.actions is refused by name (below).
    expect(parseFirecrawlScrapeRequest({ url, actions: [{ type: 'click', selector: '#more' }, { type: 'scrape' }] }).actions).toEqual([{ type: 'click', selector: '#more' }, { type: 'scrape' }])
    expect(() => parseFirecrawlScrapeRequest({ url, actions: [{ type: 'hover' }] })).toThrow('actions[0].type must be one of')
    expect(() => parseFirecrawlScrapeRequest({ url, waitFor: 60_001 })).toThrow('waitFor must be an integer number of milliseconds from 0 to 60000')
    expect(() => parseFirecrawlCrawlRequest({ url, useCached: true, proxy: 'stealth', scrapeOptions: { formats: ['summary'], location: {}, waitFor: 1 } }))
      .toThrow('unsupported parameters: useCached, proxy, scrapeOptions.location; unsupported format: summary')
    expect(() => parseFirecrawlCrawlRequest({ url, ignoreSitemap: 'yes' })).toThrow('ignoreSitemap must be a boolean')
    // W2L's own recorded robots override is not mapped; Firecrawl v2's ignoreRobotsTxt is a crawl's alone, refused by name on a scrape or map.
    expect(() => parseFirecrawlScrapeRequest({ url, robotsOverride: { reason: 'publisher link' } })).toThrow('unsupported parameter: robotsOverride')
    expect(parseFirecrawlCrawlRequest({ url, ignoreRobotsTxt: true })).toMatchObject({ url, ignoreRobotsTxt: true })
    expect(() => parseFirecrawlScrapeRequest({ url, ignoreRobotsTxt: true })).toThrow('unsupported parameter: ignoreRobotsTxt')
    expect(() => parseFirecrawlMapRequest({ url, ignoreRobotsTxt: true })).toThrow('unsupported parameter: ignoreRobotsTxt')
    // removeBase64Images is mapped with its value: true is W2L's default, false keeps the data: images.
    expect(parseFirecrawlScrapeRequest({ url, removeBase64Images: true })).toEqual({ url, ...FC_PDF, removeBase64Images: true })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: { removeBase64Images: false } })).toMatchObject({ url, removeBase64Images: false })
    expect(() => parseFirecrawlScrapeRequest({ url, removeBase64Images: 'no' })).toThrow('removeBase64Images must be a boolean')
    // The cache options keep their Firecrawl names and the native rules.
    expect(parseFirecrawlScrapeRequest({ url, maxAge: 3_600_000, minAge: 60_000, storeInCache: false, lockdown: true })).toEqual({ url, ...FC_PDF, maxAge: 3_600_000, minAge: 60_000, storeInCache: false, lockdown: true })
    expect(parseFirecrawlCrawlRequest({ url, sitemap: 'skip', scrapeOptions: { maxAge: 1000, lockdown: true } })).toMatchObject({ url, maxAge: 1000, lockdown: true })
    expect(() => parseFirecrawlCrawlRequest({ url, scrapeOptions: { lockdown: true } })).toThrow(/set sitemap to "skip"/)
  })

  it('maps the images format and an attributes entry for scrape and a crawl\'s scrapeOptions, and serves both on data when the result carries them', () => {
    const url = 'https://example.com/'
    const attributes = { type: 'attributes', selectors: [{ selector: 'span.titleline > a', attribute: 'href' }] }
    expect(parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'images', attributes] })).toEqual({ url, ...FC_PDF, formats: ['markdown', 'images', attributes] })
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
    expect(parseFirecrawlScrapeRequest({ url, formats: ['markdown', 'screenshot'] })).toEqual({ url, ...FC_PDF, formats: ['markdown', 'screenshot'] })
    expect(parseFirecrawlScrapeRequest({ url, formats: ['screenshot@fullPage'] })).toEqual({ url, ...FC_PDF, formats: [{ type: 'screenshot', fullPage: true }] })
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
    expect(thrown(() => parseFirecrawlCrawlRequest({ url, scrapeOptions: { proxy: 'enhanced', ignoreRobotsTxt: true } }))).toMatchObject({ agentHints: [REFUSAL_HINTS.stealth, REFUSAL_HINTS.ignoreRobotsTxt] })
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
      discovery: null,
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

  it('maps the crawl URL-scope options, allowBackwardLinks as crawlEntireDomain, and leaves duplicate pages out of status data', () => {
    const url = 'https://example.com/docs/'
    const scope = { regexOnFullURL: true, ignoreQueryParameters: true, deduplicateSimilarURLs: false, allowSubdomains: true, allowExternalLinks: true }
    expect(parseFirecrawlCrawlRequest({ url, ...scope, crawlEntireDomain: true })).toMatchObject({ ...scope, crawlEntireDomain: true })
    expect(parseFirecrawlCrawlRequest({ url, allowBackwardLinks: true })).toMatchObject({ crawlEntireDomain: true })
    // The v2 name wins when both are sent.
    expect(parseFirecrawlCrawlRequest({ url, allowBackwardLinks: true, crawlEntireDomain: false })).toMatchObject({ crawlEntireDomain: false })
    expect(parseFirecrawlCrawlRequest({ url })).not.toHaveProperty('crawlEntireDomain')
    expect(() => parseFirecrawlCrawlRequest({ url, allowBackwardLinks: 'yes' })).toThrow('allowBackwardLinks must be a boolean')
    expect(() => parseFirecrawlCrawlRequest({ url, allowSubdomains: 1 })).toThrow('allowSubdomains must be a boolean')
    expect(() => parseFirecrawlCrawlRequest({ url, allowExternalLinks: true, scrapeOptions: { allowSubdomains: true } })).toThrow('unsupported parameter: scrapeOptions.allowSubdomains')
    const step = (path: string, status: 'success' | 'duplicate'): StepRecord => ({
      id: path, taskId: 'task-1', attemptId: 'attempt-1', url: `https://example.com${path}`, canonicalUrl: `https://example.com${path}`, depth: 1, status, lane: 'http', contentHash: 'abc', cached: false,
      result: page({ requestedUrl: `https://example.com${path}`, status, markdown: status === 'success' ? 'MAIN' : null }),
      createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
    })
    const status = wrapCrawlStatus({ status: 'completed' }, [step('/', 'success'), step('/copy', 'duplicate')], { completed: 1, total: 2 })
    expect(status.data.map((entry) => entry.metadata.sourceURL)).toEqual(['https://example.com/'])
    expect(status.total).toBe(2)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /crawlEntireDomain/.test(d) && /allowBackwardLinks/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /not the duplicates/.test(d))).toBe(true)
  })

  it('maps sitemap (v1 ignoreSitemap and sitemapOnly, v2 sitemap) and maxConcurrency onto the native crawl request', () => {
    const url = 'https://example.com/'
    expect(parseFirecrawlCrawlRequest({ url, ignoreSitemap: true })).toMatchObject({ sitemap: 'skip' })
    expect(parseFirecrawlCrawlRequest({ url, ignoreSitemap: false })).toMatchObject({ sitemap: 'include' })
    expect(parseFirecrawlCrawlRequest({ url, sitemapOnly: true })).toMatchObject({ sitemap: 'only' })
    expect(parseFirecrawlCrawlRequest({ url, ignoreSitemap: false, sitemapOnly: true })).toMatchObject({ sitemap: 'only' })
    expect(parseFirecrawlCrawlRequest({ url, sitemapOnly: false })).not.toHaveProperty('sitemap')
    // The v2 string passes through and the native parser validates it; it wins over the v1 flags.
    expect(parseFirecrawlCrawlRequest({ url, ignoreSitemap: true, sitemap: 'include' })).toMatchObject({ sitemap: 'include' })
    expect(() => parseFirecrawlCrawlRequest({ url, sitemap: 'never' })).toThrow('sitemap must be include, skip, or only')
    expect(() => parseFirecrawlCrawlRequest({ url, sitemapOnly: 1 })).toThrow('sitemapOnly must be a boolean')
    expect(parseFirecrawlCrawlRequest({ url, maxConcurrency: 2 })).toMatchObject({ maxConcurrency: 2 })
    expect(parseFirecrawlCrawlRequest({ url })).not.toHaveProperty('maxConcurrency')
    expect(() => parseFirecrawlCrawlRequest({ url, maxConcurrency: 0 })).toThrow('maxConcurrency must be an integer >= 1')
    expect(() => parseFirecrawlCrawlRequest({ url, scrapeOptions: { sitemap: 'skip' } })).toThrow('unsupported parameter: scrapeOptions.sitemap')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /ignoreSitemap true is skip/.test(d) && /maxConcurrency/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /discovery\.sitemap/.test(d) && /no signed compliance record/.test(d))).toBe(true)
  })

  it('maps headers, mobile, skipTlsVerification, fastMode and blockAds for scrape and for a crawl\'s scrapeOptions, with the native refusals', () => {
    const url = 'https://example.com/'
    const options = { headers: { 'X-Test': 'w2l' }, mobile: true, skipTlsVerification: true, fastMode: true, blockAds: false }
    expect(parseFirecrawlScrapeRequest({ url, ...options })).toEqual({ url, ...FC_PDF, ...options, headers: { 'x-test': 'w2l' } })
    expect(parseFirecrawlCrawlRequest({ url, scrapeOptions: options })).toMatchObject({ ...options, headers: { 'x-test': 'w2l' } })
    expect(() => parseFirecrawlScrapeRequest({ url, headers: { 'User-Agent': 'curl/8' } })).toThrow("headers.user-agent is refused: the User-Agent and client hints are Octocrawl's declared identity")
    expect(() => parseFirecrawlCrawlRequest({ url, scrapeOptions: { headers: { Cookie: 'sid=1' } } })).toThrow('headers.cookie is refused')
    expect(() => parseFirecrawlScrapeRequest({ url, mobile: 'yes' })).toThrow('mobile must be a boolean')
    expect(() => parseFirecrawlScrapeRequest({ url, mode: 'research', mobile: true })).toThrow('unsupported parameter: mode')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /skipTlsVerification/.test(d) && /hosted/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /blockAds/.test(d))).toBe(true)
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /headers never override/.test(d))).toBe(true)
  })

  it('maps a crawl webhook (a string or { url, headers, metadata, events }) onto the native option with Firecrawl\'s payload shape, and wraps job events into it', () => {
    const url = 'https://example.com/'
    expect(parseFirecrawlCrawlRequest({ url, webhook: 'https://receiver.example/hook' })).toMatchObject({ webhook: { url: 'https://receiver.example/hook' }, webhookPayloadFormat: 'firecrawl' })
    const config = { url: 'https://receiver.example/hook', headers: { Authorization: 'Bearer test' }, metadata: { run: 'fc1' }, events: ['completed', 'failed'] }
    expect(parseFirecrawlCrawlRequest({ url, webhook: config })).toMatchObject({ webhook: { url: config.url, headers: { authorization: 'Bearer test' }, metadata: { run: 'fc1' }, events: ['completed', 'failed'] }, webhookPayloadFormat: 'firecrawl' })
    expect(parseFirecrawlCrawlRequest({ url })).not.toHaveProperty('webhookPayloadFormat')
    expect(() => parseFirecrawlCrawlRequest({ url, webhook: { url: 'https://receiver.example/hook', retries: 2 } })).toThrow('unknown webhook option: retries')
    expect(() => parseFirecrawlCrawlRequest({ url, webhook: { url: 'https://receiver.example/hook', headers: { 'Content-Type': 'text/plain' } } })).toThrow('webhook.headers: content-type is reserved')
    const envelope = (event: JobWebhookEnvelope['event'], extra: Partial<JobWebhookEnvelope> = {}): JobWebhookEnvelope => ({ schemaVersion: 'w2l.job-event/v1', eventId: `job-1:${event}`, sequence: 1, jobId: 'job-1', jobKind: 'crawl', event, at: '2026-10-02T00:00:00.000Z', metadata: { run: 'fc1' }, ...extra })
    expect(wrapJobWebhook(envelope('started'), null)).toEqual({ success: true, type: 'crawl.started', id: 'job-1', data: [], metadata: { run: 'fc1' } })
    const result = page({ requestedUrl: 'https://example.com/a', status: 'success', markdown: '# A' })
    const wrapped = wrapJobWebhook(envelope('page'), result)
    expect(wrapped).toMatchObject({ success: true, type: 'crawl.page', id: 'job-1', metadata: { run: 'fc1' } })
    expect(wrapped.data).toHaveLength(1)
    expect(wrapped.data[0]).toMatchObject({ markdown: '# A', metadata: { sourceURL: 'https://example.com/a', url: 'https://example.com/a', statusCode: 200 } })
    expect(wrapJobWebhook(envelope('completed'), null).type).toBe('crawl.completed')
    expect(wrapJobWebhook(envelope('failed', { error: 'boom' }), null)).toMatchObject({ type: 'crawl.failed', error: 'boom', data: [] })
    expect(wrapJobWebhook(envelope('cancelled'), null)).toMatchObject({ type: 'crawl.failed', error: 'cancelled' })
    expect(wrapJobWebhook({ ...envelope('page'), jobKind: 'batch' }, result).type).toBe('batch_scrape.page')
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /webhook/.test(d) && /crawl\.page/.test(d))).toBe(true)
  })

  it('maps a map request: v1 ignoreSitemap and sitemapOnly, the v2 sitemap winning, both v1 flags refused, W2L\'s defaults for what is omitted', () => {
    const url = 'https://www.sitemaps.org/'
    expect(parseFirecrawlMapRequest({ url })).toEqual({ url })
    expect(parseFirecrawlMapRequest({ url, ignoreSitemap: true })).toEqual({ url, sitemap: 'skip' })
    expect(parseFirecrawlMapRequest({ url, ignoreSitemap: false })).toEqual({ url, sitemap: 'include' })
    expect(parseFirecrawlMapRequest({ url, sitemapOnly: true })).toEqual({ url, sitemap: 'only' })
    expect(parseFirecrawlMapRequest({ url, sitemapOnly: false })).toEqual({ url })
    expect(parseFirecrawlMapRequest({ url, ignoreSitemap: false, sitemapOnly: true })).toEqual({ url, sitemap: 'only' })
    expect(parseFirecrawlMapRequest({ url, sitemapOnly: true, sitemap: 'include' })).toEqual({ url, sitemap: 'include' })
    expect(() => parseFirecrawlMapRequest({ url, ignoreSitemap: true, sitemapOnly: true })).toThrow(/^ignoreSitemap and sitemapOnly cannot both be true$/)
    expect(() => parseFirecrawlMapRequest({ url, ignoreSitemap: 'yes' })).toThrow('ignoreSitemap must be a boolean')
    expect(() => parseFirecrawlMapRequest({ url, sitemapOnly: 1 })).toThrow('sitemapOnly must be a boolean')
    expect(() => parseFirecrawlMapRequest({ url, sitemap: 'never' })).toThrow('sitemap must be include, skip, or only')
    const full = { url, search: 'protocol', includeSubdomains: true, ignoreQueryParameters: true, limit: 50, timeout: 10_000, origin: 'js-sdk@4.42.0', integration: 'nightly' }
    expect(parseFirecrawlMapRequest(full)).toEqual(full)
    expect(() => parseFirecrawlMapRequest({ url, limit: 0 })).toThrow('limit must be an integer from 1 to 100000')
    expect(() => parseFirecrawlMapRequest({ url, search: '' })).toThrow('search must be a string of 1 to 200 characters with at most 10 words')
    // What the shim does not map is refused by name, useIndex with the hint; the native scope keys are not Firecrawl map options.
    for (const key of ['useIndex', 'location', 'ignoreCache', 'threatProtection', 'auditMetadata', 'includePaths']) {
      let error: unknown
      try { parseFirecrawlMapRequest({ url, [key]: true }) } catch (thrown) { error = thrown }
      expect(error, key).toBeInstanceOf(RequestError)
      expect(error, key).toMatchObject({ code: 'unsupported_parameter', message: `unsupported parameter: ${key}`, details: { parameters: [key] } })
      expect((error as RequestError).agentHints, key).toEqual(key === 'useIndex' ? [REFUSAL_HINTS.useIndex] : undefined)
    }
    expect(FIRECRAWL_SHIM_DIFFS.some((d) => /POST \/fc\/v1\/map/.test(d) && /orders by relevance/.test(d) && /includeSubdomains and ignoreQueryParameters are false/.test(d))).toBe(true)
  })

  it('wraps a map as Firecrawl answers one: URL strings, the warnings joined, success false for a failed map', () => {
    const base: MapResponse = {
      id: '2b7e1f0c-5d1a-4c3e-9f0a-1b2c3d4e5f60', url: 'https://www.sitemaps.org/', status: 'completed', stoppedBy: null,
      links: [{ url: 'https://www.sitemaps.org/', title: 'Home', titleSource: 'page', via: ['start'], robots: 'allowed' }, { url: 'https://www.sitemaps.org/faq.php', via: ['link', 'sitemap'], robots: 'allowed' }],
      sources: { startPage: null, sitemap: null },
      refused: { duplicate: 0, collapsed: 0, hostDenied: 0, subtreeDenied: 0, pathDenied: 0, assetDenied: 0, robots: 0, robotsUnchecked: 0, searchFiltered: 0, overLimit: 0, samples: { collapsed: [], hostDenied: [], robots: [] } },
      identity: { mode: 'standard', userAgent: 'W2L/1' }, warnings: [], elapsedMs: 12,
    }
    expect(wrapMap(base)).toEqual({ success: true, id: base.id, links: ['https://www.sitemaps.org/', 'https://www.sitemaps.org/faq.php'] })
    const partial: MapResponse = { ...base, status: 'partial', stoppedBy: 'timeout', warnings: [{ code: 'map_timeout', message: 'the map stopped at its 1000 ms timeout.' }, { code: 'sitemap_unreadable', message: '1 sitemap file was not read.' }], agentHints: ['raise timeout'] }
    expect(wrapMap(partial)).toEqual({ success: true, id: base.id, links: ['https://www.sitemaps.org/', 'https://www.sitemaps.org/faq.php'], warning: 'the map stopped at its 1000 ms timeout. 1 sitemap file was not read.', agent_hints: ['raise timeout'] })
    const failed: MapResponse = { ...base, status: 'failed', links: [], warnings: [{ code: 'sitemap_unreadable', message: 'no sitemap was found.' }] }
    expect(wrapMap(failed)).toEqual({ success: false, id: base.id, error: 'no sitemap was found.', links: [] })
  })
})
