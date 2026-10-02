/**
 * Firecrawl v1 scrape/crawl snapshot, frozen 2026-09-18.
 *
 * A one-shot migration shim: map the two main paths onto the native
 * contract. Not a compatibility layer. A parameter or format the shim cannot
 * honour is rejected by name (HTTP 400, success: false), never ignored.
 */

import type { AgentHints, CrawlAccepted, CrawlStartRequest, ScrapeMetadata, ScrapeRequest, ScrapeResponse } from './api.js'
import { parseCrawlStartRequest, parseScrapeRequest, refusalHint, RequestError, warningOf } from './api.js'
import type { CrawlReport } from './crawl.js'
import type { FetchResult } from './result.js'
import type { StepRecord, StepStatus, TaskStatus } from './checkpoint.js'

export const FIRECRAWL_SHIM_SNAPSHOT = {
  capturedAt: '2026-09-18',
  apiVersion: 'v1' as const,
  docs: {
    scrape: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/scrape',
    crawl: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-post',
    crawlStatus: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-get',
  },
  paths: ['/scrape', '/crawl', '/crawl/:id'] as const,
  notCovered: ['search', 'interact', 'agent', 'monitor', 'map', 'extract'] as const,
}

export const FIRECRAWL_SHIM_DIFFS = [
  'Challenge / block pages are success: false (Firecrawl often returns them as success markdown).',
  'A page with no main content is success: false (failed: empty_unverified) with the whole page in data.markdown as evidence; with onlyMainContent: false it is success: true.',
  'A page whose server HTML is a shell for data its scripts fill in is fetched again on the browser rung, and the rendered page is the answer when it holds more; otherwise the HTTP page is returned with client_rendered_suspected and low_content_yield warnings on the native response, whose messages /fc passes through as data.warning (one string, joined with a space), as it does every native warning. Firecrawl renders every page in a browser.',
  'No fire-engine, proxy pools, actions or JSON extract.',
  'Resume / cache defaults to refetch (useCached is never set from a Firecrawl body).',
  'Omitted limit / maxDepth stay unbounded on a local server; a hosted server takes its crawl limit for an omitted or null limit and refuses a larger one. Firecrawl defaults are 10000 / 10.',
  'maxDepth counts link hops from the start URL (Firecrawl calls that maxDiscoveryDepth); Firecrawl maxDepth counts URL path depth.',
  'Crawl start is mapped onto native POST /v1/crawl; the shim itself returns 200 {success,id,url}.',
  'creditsUsed and expiresAt are null: W2L counts no credits and keeps crawl results until their task directory is deleted.',
  'Crawl status describes the latest attempt: completed counts its successful pages, total adds its failed, blocked and duplicate pages and, while this API process runs the crawl, the pages in flight and queued (null for a paused crawl), and data lists those pages too, up to 100 per response (limit 1 to 1000) with next carrying a W2L cursor; skip is rejected.',
  'Scrape maps url, formats, onlyMainContent, includeTags, excludeTags, waitFor, timeout, headers, mobile, skipTlsVerification, fastMode, blockAds, removeBase64Images, origin and integration; crawl maps url, limit (as maxPages), maxDepth, includePaths, excludePaths, origin, integration and the same scrapeOptions (applied to every page). The formats are markdown, links, html, rawHtml, images, screenshot (also screenshot@fullPage, and { type: "screenshot", fullPage, quality, viewport }) and an { type: "attributes", selectors } entry; other formats and parameters the shim does not map (proxy, location, actions, json, ...) are rejected by name with HTTP 400 and success: false; a refusal of stealth, proxy: stealth or enhanced, or ignoreRobotsTxt names the supported route in agent_hints.',
  'screenshot (data.screenshot, a data:image/png;base64 string, or image/jpeg with quality 1 to 100) is captured on the local browser rung alone, which such a request selects (no http attempt; a server without a browser rung refuses the format with HTTP 400): after load, stability and waitFor, before the DOM is read, CSS-pixel sized at the declared 1280x800 viewport (device scale factor 2 is declared, not baked into the image) or at the viewport asked for (integers 320..1920 by 240..1080, within the declared screen; a window size, not a change of identity); fullPage captures the document\'s whole height at that width without scrolling first, so sections a page loads on scroll may show unloaded. A capture the browser could not make leaves data.screenshot null with a screenshot_unavailable warning while the page stands; a file or a page that was not rendered has null too. Firecrawl captures at its own viewport and may return a URL instead of the image.',
  'images (data.images) lists every image URL of the whole document as received: img src and srcset candidates, picture sources, lazy data-src/data-srcset/data-lazy-src/data-original, video posters, image_src links, og:image and twitter:image, absolute http(s) with the fragment stripped, each once, in document order, data: URIs left out; includeTags, excludeTags and onlyMainContent do not narrow it. attributes (data.attributes) gives, per selector, the named attribute\'s values as written, elements without it skipped; a selector W2L does not match is HTTP 400 by name, as for includeTags. Both are absent for a file and for a page that is success: false. removeBase64Images (default true) keeps an image\'s alt text where Firecrawl writes a (<Base64-Image-Removed>) placeholder; false keeps the data: URI in the Markdown.',
  'origin (the Firecrawl SDKs\' client label) and integration are stored, not echoed: the scrape record (GET /v1/scrapes/:id) and the crawl task carry them, and nothing sent to the target changes.',
  'data.metadata carries scrapeId (a UUID per call, which GET /v1/scrapes/:id looks up), proxyUsed (operator for the server\'s environment proxy, user for the caller\'s own egress, else null), timezone (the browser rung\'s declared zone, null on the HTTP rung), creditsUsed: null (W2L counts no credits), concurrencyLimited and concurrencyQueueDurationMs (whether and how long the per-origin ceiling held the fetch back). cacheState and cachedAt are left out until W2L has a cache.',
  'A page whose result W2L has advice about (a login wall, a robots.txt rule, a gate, a cut, a script-filled shell) carries data.agent_hints, one sentence each; the native response calls them agentHints. A request refused for an option W2L does not offer carries agent_hints in the error envelope, and a caller over the server\'s per-minute rate limit gets HTTP 429 { success: false, error, code: rate_limited, agent_hints } with Retry-After.',
  'headers never override the User-Agent, the client hints, a credential (authorization, cookie) or a transport header: such a header is HTTP 400 naming it, where Firecrawl sends it. The headers go to the requested origin after the declared identity and are on the record (the trace, the browser lane\'s signed sentHeaders); both rungs withhold them from a redirect hop to another origin and say so (custom_headers_withheld).',
  'mobile selects a declared Android Chrome identity (User-Agent, client hints, 412x915 viewport, touch) that robots.txt is evaluated against and the record carries; the page is whatever the site serves to it, with no DOM rewriting. It is refused with mode research.',
  'skipTlsVerification relaxes certificate verification for one local request and its robots.txt lookup, recorded in the trace (tls_verification_skipped) and a tls_unverified warning the native response carries; a hosted W2L refuses it with HTTP 400. Without it a bad certificate is success: false with failed: tls_error. Firecrawl\'s Python SDK sends true by default; W2L verifies by default.',
  'fastMode keeps the http rung alone: a page that needs scripts is success: false with failed: empty_unverified, never rendered; waitFor has no effect under it. Firecrawl\'s fast mode still renders.',
  'blockAds (default true) aborts requests to a bundled list of about 50 ad-serving hosts on the local browser rung and removes ad and cookie-banner elements before extraction; false keeps them. The list is curated, not EasyList: ads from hosts outside it are not blocked.',
  'html is the cleaned HTML the markdown is written from: the main content, the whole page without scripts, styles, form controls and embedded media when onlyMainContent is false, or a <body> holding the includeTags elements. rawHtml is the page as the answering rung received it: the response body on the HTTP rung, the rendered DOM on a browser rung. Both are null for a file and for a page that is success: false.',
  'includeTags keeps only the named elements, in document order, whatever onlyMainContent says; excludeTags removes elements from the main content, the whole page and an includeTags selection. A selector that does not parse, or that uses a sibling combinator, a positional pseudo-class, :has() or another pseudo-class W2L does not match, is rejected with HTTP 400.',
  'An omitted timeout stays 300000 ms (Firecrawl: 30000). A timeout is answered with HTTP 200: success: true with the content fetched so far (native status partial), or success: false with failed: timeout; Firecrawl answers it with an error.',
  'waitFor skips the HTTP rung, which cannot run scripts, and starts at the browser rung; the wait counts toward timeout.',
  'metadata has title, description, language, keywords, robots and favicon only when the page declares them, and the Open Graph (ogTitle, ogDescription, ogUrl, ogImage, ogAudio, ogVideo, ogDeterminer, ogLocale, ogLocaleAlternate, ogSiteName), Dublin Core (dcTermsCreated, dcDateCreated, dcDate, dcTermsType, dcType, dcTermsAudience, dcTermsSubject, dcSubject, dcDescription, dcTermsKeywords) and article (publishedTime, modifiedTime, articleTag, articleSection) tags under Firecrawl\'s names, each only when the page states it, as written (no date normalisation, no fallback from another tag); twitter:* and other meta tags are not passed through, and a failed or blocked page has none.',
  'A PDF answers success: true with its text layer as markdown, a <!-- page N --> line before each page, and no metadata.numPages; a PDF without a text layer is success: false with failed: empty_unverified (no OCR). CSV, JSON and text files give their text as received; XLSX, XLS and ZIP files are success: true with markdown null. A file over W2L_MAX_FILE_BYTES is success: false with failed: body_too_large.',
] as const

export interface FirecrawlPage {
  markdown: string | null
  /** Present when the `html` format was asked for; null when the page has none (a file, a page that did not succeed). */
  html?: string | null
  /** Present when the `rawHtml` format was asked for; null when the page has none. */
  rawHtml?: string | null
  links?: string[]
  /** Present when the `images` format was asked for and the page was read as content: every image URL of the whole document. */
  images?: string[]
  /** Present when an `attributes` entry was asked for and the page was read as content: per selector, the attribute's values as written. */
  attributes?: Array<{ selector: string; attribute: string; values: string[] }>
  /** Present when a `screenshot` entry was asked for: the capture as a `data:image/png;base64,…` (or `image/jpeg`) string, as Firecrawl v1 clients read it; null when the browser rung rendered no page or could not capture it. */
  screenshot?: string | null
  /** The native `warnings` as one string, their messages joined with a space; present when the result has any. */
  warning?: string
  /** What to change about the request next time, one sentence each (the native `agentHints`); present when W2L has any. */
  agent_hints?: string[]
  /** Page fields appear only when the page declares them (W2L's `metadata`, null values left out). */
  metadata: {
    title?: string
    description?: string
    language?: string
    keywords?: string
    robots?: string
    favicon?: string
    /** Open Graph, Dublin Core and article tags under Firecrawl's names, each only when the page states it (see PageMetadata). */
    ogTitle?: string
    ogDescription?: string
    ogUrl?: string
    ogImage?: string
    ogAudio?: string
    ogVideo?: string
    ogDeterminer?: string
    ogLocale?: string
    ogLocaleAlternate?: string[]
    ogSiteName?: string
    dcTermsCreated?: string
    dcDateCreated?: string
    dcDate?: string
    dcTermsType?: string
    dcType?: string
    dcTermsAudience?: string
    dcTermsSubject?: string
    dcSubject?: string
    dcDescription?: string
    dcTermsKeywords?: string
    publishedTime?: string
    modifiedTime?: string
    /** Every `article:tag`, joined with `, ` as Firecrawl writes it. */
    articleTag?: string
    articleSection?: string
    sourceURL: string
    /** The final URL, after redirects (`evidence.finalUrl`). */
    url: string
    /** The status of the response that answered `url` (`evidence.httpStatus`); null when none did. */
    statusCode: number | null
    /** That response's `content-type` header; left out when there was none. */
    contentType?: string
    /** On a page that did not succeed: W2L's failure, block or budget reason code (`http_error`, `cloudflare_challenge`, ...), or its status when it has none (`empty_verified`). */
    error?: string
    /** The facts of the scrape call (native `metadata`), on a scrape response; a crawl status page has no call of its own and leaves them out. */
    scrapeId?: string
    proxyUsed?: ScrapeMetadata['proxyUsed']
    timezone?: string | null
    /** Null: W2L counts no credits. */
    creditsUsed?: null
    concurrencyLimited?: boolean
    concurrencyQueueDurationMs?: number
  }
}

export interface FirecrawlScrapeResponse {
  success: boolean
  data: FirecrawlPage
  error?: string
}

export interface FirecrawlCrawlStarted {
  success: true
  id: string
  url: string
}

export type FirecrawlCrawlJobStatus = 'scraping' | 'completed' | 'failed' | 'cancelled'

export interface FirecrawlCrawlStatus {
  status: FirecrawlCrawlJobStatus
  /**
   * The latest attempt's pages and errors, plus, while this API process runs
   * the crawl, the pages in flight and those queued within its page limit.
   * Null while the crawl is unfinished and no process here runs it (paused).
   */
  total: number | null
  /** The latest attempt's pages that succeeded (status success or partial): the data entries without metadata.error. */
  completed: number
  /** Null: W2L counts no credits, and an unknown count is not zero. */
  creditsUsed: number | null
  /** Null: crawl results stay until their task directory is deleted. */
  expiresAt: string | null
  /** The URL of the next page of `data`: there while more pages are stored or the crawl is running, left out after the last. */
  next?: string
  /** One page of the latest attempt's steps in the order they were recorded, errors included (with `metadata.error`). */
  data: FirecrawlPage[]
}

/** What the API knows about a crawl beyond its steps, for its Firecrawl status. */
export interface FirecrawlCrawlCounts {
  completed: number
  total: number | null
  next?: string
}

/**
 * completed and total from how many of the latest attempt's steps have each
 * status: completed is its success and partial pages, total every step it
 * recorded plus, while the crawl is unfinished, `ahead`, the pages it will
 * still record, null when no process here runs it.
 */
export function firecrawlCrawlCounts(status: TaskStatus, steps: Partial<Record<StepStatus, number>>, ahead: number | null): { completed: number; total: number | null } {
  const recorded = Object.values(steps).reduce((sum, count) => sum + count, 0)
  const finished = status === 'completed' || status === 'failed' || status === 'cancelled'
  return { completed: (steps.success ?? 0) + (steps.partial ?? 0), total: finished ? recorded : ahead === null ? null : recorded + ahead }
}

/** Default and largest number of steps one `GET /fc/v1/crawl/:id` returns in `data`. */
export const FIRECRAWL_STATUS_PAGE_SIZE = { default: 100, max: 1000 } as const

/** The formats the shim passes through as strings (`screenshot@fullPage` is Firecrawl v1's full-page screenshot); an `{ type: 'attributes', selectors }` or `{ type: 'screenshot', ... }` entry is passed as it is. */
const SHIM_FORMATS: readonly string[] = ['markdown', 'links', 'html', 'rawHtml', 'images', 'screenshot', 'screenshot@fullPage']
/** W2L page metadata fields that Firecrawl's `metadata` also has. */
const SHIM_PAGE_FIELDS = ['title', 'description', 'language', 'keywords', 'robots', 'favicon'] as const
/** The optional page fields (present on W2L's `metadata` only when the page states them), under the same names in Firecrawl's `metadata`. */
const SHIM_OPTIONAL_PAGE_FIELDS = [
  'ogTitle', 'ogDescription', 'ogUrl', 'ogImage', 'ogAudio', 'ogVideo', 'ogDeterminer', 'ogLocale', 'ogLocaleAlternate', 'ogSiteName',
  'dcTermsCreated', 'dcDateCreated', 'dcDate', 'dcTermsType', 'dcType', 'dcTermsAudience', 'dcTermsSubject', 'dcSubject', 'dcDescription', 'dcTermsKeywords',
  'publishedTime', 'modifiedTime', 'articleTag', 'articleSection',
] as const
/** Scrape options passed to the native request as they are; the native parser validates them. */
const SHIM_PAGE_OPTIONS = ['onlyMainContent', 'waitFor', 'timeout', 'includeTags', 'excludeTags', 'headers', 'mobile', 'skipTlsVerification', 'fastMode', 'blockAds', 'removeBase64Images'] as const

/** Accepted only with the value W2L already implements; any other value is rejected. */
const SHIM_FIXED_VALUES: Readonly<Record<string, { value: boolean; reason: string }>> = {
  ignoreSitemap: { value: true, reason: 'W2L does not read sitemaps' },
}

interface ShimProblems {
  parameters: string[]
  values: string[]
  formats: Set<string>
  /** The supported route for a refused option W2L does not offer (a stealth proxy, ignoreRobotsTxt). */
  hints: string[]
}

const noProblems = (): ShimProblems => ({ parameters: [], values: [], formats: new Set(), hints: [] })

/** `origin` (the Firecrawl SDKs' client label) and `integration`: stored on W2L's own records, validated by the native parser. */
const SHIM_ATTRIBUTION = ['origin', 'integration'] as const

function readShimAttribution(rec: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const key of SHIM_ATTRIBUTION) if (rec[key] !== undefined) mapped[key] = rec[key]
  return mapped
}

export function parseFirecrawlScrapeRequest(body: unknown): ScrapeRequest {
  const rec = asRecord(body)
  const problems = noProblems()
  const options = readShimScrapeOptions(rec, '', ['url', ...SHIM_ATTRIBUTION], problems)
  throwShimProblems(problems)
  return parseScrapeRequest({ url: rec.url, ...options, ...readShimAttribution(rec) })
}

export function parseFirecrawlCrawlRequest(body: unknown): CrawlStartRequest {
  const rec = asRecord(body)
  const problems = noProblems()
  checkShimKeys(rec, '', ['url', ...SHIM_ATTRIBUTION, 'limit', 'maxDepth', 'includePaths', 'excludePaths', 'ignoreSitemap', 'scrapeOptions'], problems)
  checkShimFixedValue(rec, '', 'ignoreSitemap', problems)
  let pageOptions: Record<string, unknown> = {}
  if (rec.scrapeOptions !== undefined) {
    const options = rec.scrapeOptions
    if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new RequestError('scrapeOptions must be an object')
    pageOptions = readShimScrapeOptions(options as Record<string, unknown>, 'scrapeOptions.', [], problems)
  }
  throwShimProblems(problems)
  const native: Record<string, unknown> = { url: rec.url, ...pageOptions, ...readShimAttribution(rec) }
  if (rec.limit !== undefined) native.maxPages = rec.limit
  if (rec.maxDepth !== undefined) native.maxDepth = rec.maxDepth
  if (rec.includePaths !== undefined) native.includePaths = rec.includePaths
  if (rec.excludePaths !== undefined) native.excludePaths = rec.excludePaths
  return parseCrawlStartRequest(native)
}

/** The scrape options the shim maps: formats (markdown, links, html, rawHtml, images, screenshot, screenshot@fullPage, an attributes entry and a screenshot entry), onlyMainContent, waitFor, timeout, includeTags, excludeTags, headers, mobile, skipTlsVerification, fastMode, blockAds and removeBase64Images; the native parser validates them. */
function readShimScrapeOptions(rec: Record<string, unknown>, prefix: string, keys: readonly string[], problems: ShimProblems): Record<string, unknown> {
  checkShimKeys(rec, prefix, [...keys, 'formats', ...SHIM_PAGE_OPTIONS], problems)
  const mapped: Record<string, unknown> = {}
  for (const key of SHIM_PAGE_OPTIONS) if (rec[key] !== undefined) mapped[key] = rec[key]
  if (rec.formats === undefined) return mapped
  const isTyped = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).type === 'string'
  if (!Array.isArray(rec.formats) || rec.formats.some((item) => typeof item !== 'string' && !isTyped(item))) throw new RequestError(`${prefix}formats must be an array of strings or { type } objects`)
  // Repeated names are one format, as on Firecrawl; an attributes or screenshot entry passes as it is, and the native parser checks it.
  const formats: unknown[] = []
  const seen = new Set<string>()
  for (const item of rec.formats as unknown[]) {
    if (typeof item === 'string') {
      if (seen.has(item)) continue
      seen.add(item)
      if (!SHIM_FORMATS.includes(item)) problems.formats.add(item)
      formats.push(item)
    } else if (isTyped(item)) {
      if (item.type !== 'attributes' && item.type !== 'screenshot') problems.formats.add(item.type as string)
      formats.push(item)
    }
  }
  return { ...mapped, formats }
}

function checkShimKeys(rec: Record<string, unknown>, prefix: string, known: readonly string[], problems: ShimProblems): void {
  for (const key of Object.keys(rec)) {
    if (rec[key] === undefined || known.includes(key)) continue
    problems.parameters.push(`${prefix}${key}`)
    const hint = refusalHint(key, rec[key])
    if (hint !== null && !problems.hints.includes(hint)) problems.hints.push(hint)
  }
}

function checkShimFixedValue(rec: Record<string, unknown>, prefix: string, key: string, problems: ShimProblems): void {
  const value = rec[key]
  const fixed = SHIM_FIXED_VALUES[key]!
  if (value === undefined) return
  if (typeof value !== 'boolean') throw new RequestError(`${prefix}${key} must be a boolean`)
  if (value !== fixed.value) problems.values.push(`${prefix}${key}: ${String(value)} is not supported (${fixed.reason})`)
}

function throwShimProblems(problems: ShimProblems): void {
  const parts: string[] = []
  if (problems.parameters.length > 0) {
    parts.push(`unsupported ${problems.parameters.length === 1 ? 'parameter' : 'parameters'}: ${problems.parameters.join(', ')}`)
  }
  parts.push(...problems.values)
  if (problems.formats.size > 0) {
    parts.push(`unsupported ${problems.formats.size === 1 ? 'format' : 'formats'}: ${[...problems.formats].join(', ')} (the /fc shim supports ${SHIM_FORMATS.join(', ')})`)
  }
  if (parts.length === 0) return
  // A value problem reads "<name>: <value> is not supported (...)"; its parameter is listed too.
  const parameters = [...problems.parameters, ...problems.values.map((value) => value.split(':', 1)[0] ?? value)]
  const formats = [...problems.formats]
  throw new RequestError(parts.join('; '), parameters.length > 0 ? 'unsupported_parameter' : 'unsupported_format', {
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(formats.length > 0 ? { formats } : {}),
  }, problems.hints.length === 0 ? undefined : problems.hints)
}

/** The native scrape response as Firecrawl's envelope: the page with the call's facts in `data.metadata` and its hints as `data.agent_hints`. */
export function wrapScrape(response: ScrapeResponse): FirecrawlScrapeResponse {
  const data = firecrawlPage(response, response.metadata, response.agentHints)
  if (response.status === 'success' || response.status === 'partial') {
    return { success: true, data }
  }
  return { success: false, error: scrapeError(response), data }
}

export function wrapCrawlAccepted(native: CrawlAccepted, seedUrl: string): FirecrawlCrawlStarted {
  return { success: true, id: native.taskId, url: seedUrl }
}

/**
 * The query of `GET /fc/v1/crawl/:id`: `cursor` (from a `next` URL) and
 * `limit` (1 to 1000, default 100). Anything else, Firecrawl's `skip`
 * included, is rejected by name: pages follow `next`.
 */
export function parseFirecrawlCrawlStatusQuery(query: Record<string, string | undefined>): { cursor?: string; limit: number } {
  const unknown = Object.keys(query).filter((key) => key !== 'cursor' && key !== 'limit')
  if (unknown.length > 0) {
    throw new RequestError(`unsupported ${unknown.length === 1 ? 'parameter' : 'parameters'}: ${unknown.join(', ')} (follow next for further pages)`, 'unsupported_parameter', { parameters: unknown })
  }
  const limit = query.limit === undefined ? FIRECRAWL_STATUS_PAGE_SIZE.default : Number(query.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > FIRECRAWL_STATUS_PAGE_SIZE.max) throw new RequestError(`limit must be an integer between 1 and ${FIRECRAWL_STATUS_PAGE_SIZE.max}`)
  if (query.cursor !== undefined && query.cursor.length === 0) throw new RequestError('cursor must not be empty')
  return { ...(query.cursor === undefined ? {} : { cursor: query.cursor }), limit }
}

export function wrapCrawlStatus(report: Pick<CrawlReport, 'status'>, steps: readonly StepRecord[], counts: FirecrawlCrawlCounts): FirecrawlCrawlStatus {
  const data: FirecrawlPage[] = []
  for (const step of steps) {
    if (step.result !== null) data.push(firecrawlPage(step.result))
  }
  return {
    status: firecrawlCrawlStatus(report.status),
    total: counts.total,
    completed: counts.completed,
    creditsUsed: null,
    expiresAt: null,
    // Left out after the last page, as Firecrawl does: its v1 client follows `next` while the key is there.
    ...(counts.next === undefined ? {} : { next: counts.next }),
    data,
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError('body must be a JSON object')
  }
  return body as Record<string, unknown>
}

function firecrawlPage(result: FetchResult, scrape?: ScrapeMetadata, agentHints?: AgentHints): FirecrawlPage {
  const error =
    result.status === 'blocked'
      ? (result.blockReason ?? 'blocked')
      : result.status === 'failed'
        ? (result.failureReason ?? 'failed')
        : result.status === 'budget_exceeded'
          ? (result.budgetExceeded ?? 'budget_exceeded')
          : result.status === 'success' || result.status === 'partial'
            ? undefined
            : result.status
  const warning = warningOf(result.warnings)
  // Firecrawl's page fields, only those the page declares.
  const declared: Record<string, string | string[]> = {}
  for (const key of SHIM_PAGE_FIELDS) {
    const value = result.metadata?.[key]
    if (value !== undefined && value !== null) declared[key] = value
  }
  for (const key of SHIM_OPTIONAL_PAGE_FIELDS) {
    const value = result.metadata?.[key]
    if (value === undefined) continue
    // Firecrawl writes the article tags as one string and keeps the alternate locales as a list.
    declared[key] = typeof value === 'string' ? value : key === 'articleTag' ? value.join(', ') : [...value]
  }
  return {
    markdown: result.markdown,
    // On the result only when the request asked for the format.
    ...(result.html === undefined ? {} : { html: result.html }),
    ...(result.rawHtml === undefined ? {} : { rawHtml: result.rawHtml }),
    ...(result.links !== undefined ? { links: [...result.links] } : {}),
    ...(result.images === undefined ? {} : { images: [...result.images] }),
    ...(result.attributes === undefined ? {} : { attributes: result.attributes.map((entry) => ({ selector: entry.selector, attribute: entry.attribute, values: [...entry.values] })) }),
    // The image as a data URI, which Firecrawl v1 clients read; null when it was asked for and there is none.
    ...(result.screenshot === undefined ? {} : { screenshot: result.screenshot === null ? null : `data:${result.screenshot.contentType};base64,${result.screenshot.base64}` }),
    ...(warning === undefined ? {} : { warning }),
    ...(agentHints === undefined || agentHints.length === 0 ? {} : { agent_hints: [...agentHints] }),
    metadata: {
      ...(declared as Partial<FirecrawlPage['metadata']>),
      sourceURL: result.requestedUrl,
      url: result.evidence.finalUrl,
      statusCode: result.evidence.httpStatus,
      ...(result.evidence.contentType === null ? {} : { contentType: result.evidence.contentType }),
      ...(error !== undefined ? { error } : {}),
      // The call's facts, on a scrape response; a crawl status page has no call of its own.
      ...(scrape === undefined ? {} : {
        scrapeId: scrape.scrapeId,
        proxyUsed: scrape.proxyUsed,
        timezone: scrape.timezone,
        creditsUsed: null,
        concurrencyLimited: scrape.concurrencyLimited,
        concurrencyQueueDurationMs: scrape.concurrencyQueueDurationMs,
      }),
    },
  }
}

function scrapeError(result: FetchResult): string {
  if (result.status === 'blocked') return `blocked: ${result.blockReason ?? 'unknown'}`
  if (result.status === 'failed') return `failed: ${result.failureReason ?? 'unknown'}`
  if (result.status === 'budget_exceeded') return `budget_exceeded: ${result.budgetExceeded ?? 'unknown'}`
  return result.status
}

/** pending, running and paused are all `scraping`: a paused crawl resumes when the API starts again. */
function firecrawlCrawlStatus(status: TaskStatus): FirecrawlCrawlJobStatus {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return status
  return 'scraping'
}
