/**
 * Firecrawl v1 scrape/crawl snapshot, frozen 2026-09-18, and its map path (added 2026-10-03).
 *
 * A one-shot migration shim: map the main paths onto the native
 * contract. Not a compatibility layer. A parameter or format the shim cannot
 * honour is rejected by name (HTTP 400, success: false), never ignored.
 */

import type { AgentHints, CrawlAccepted, MapRequest, ParsedCrawlStartRequest, ScrapeMetadata, ScrapeRequest, ScrapeResponse } from './api.js'
import { cacheStateOf, parseCrawlStartRequest, parseMapRequest, parseScrapeRequest, refusalHint, RequestError, warningOf } from './api.js'
import type { MapResponse } from './map.js'
import type { CrawlReport } from './crawl.js'
import type { JobWebhookEnvelope } from './delivery.js'
import type { FetchResult } from './result.js'
import type { StepRecord, StepStatus, TaskStatus } from './checkpoint.js'

export const FIRECRAWL_SHIM_SNAPSHOT = {
  capturedAt: '2026-09-18',
  apiVersion: 'v1' as const,
  docs: {
    scrape: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/scrape',
    crawl: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-post',
    crawlStatus: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-get',
    map: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/map',
  },
  paths: ['/scrape', '/crawl', '/crawl/:id', '/map'] as const,
  notCovered: ['search', 'interact', 'agent', 'monitor', 'extract'] as const,
}

export const FIRECRAWL_SHIM_DIFFS = [
  'Challenge / block pages are success: false (Firecrawl often returns them as success markdown).',
  'A page with no main content is success: false (failed: empty_unverified) with the whole page in data.markdown as evidence; with onlyMainContent: false it is success: true.',
  'A page whose server HTML is a shell for data its scripts fill in is fetched again on the browser rung, and the rendered page is the answer when it holds more; otherwise the HTTP page is returned with client_rendered_suspected and low_content_yield warnings on the native response, whose messages /fc passes through as data.warning (one string, joined with a space), as it does every native warning. Firecrawl renders every page in a browser.',
  'No fire-engine, proxy pools or JSON extract.',
  'actions (scrape only; a crawl\'s scrapeOptions.actions is refused) run on the local browser rung alone, which such a request selects, after load, stability and waitFor and before the formats are read: wait (milliseconds up to 60000, or a selector, waited for up to 60 s within the scrape\'s timeout), click (all: true clicks every match), write (into the focused element), press, scroll (one screen up or down, of the page or the element a selector names), screenshot, scrape, executeJavascript (a function body; return gives the value) and pdf; at most 50 steps. data.actions holds screenshots and pdfs as data: URIs (Firecrawl returns URLs), scrapes as { url, html } and javascriptReturns as { type, value }. A step that fails stops the steps after it: success is false with data.actions.failed naming the step, its code and message, and data.markdown is the page as it stood. A step that leads the page to a URL robots.txt or the egress policy refuses fails with navigation_refused and that page is not read. A hosted server refuses actions, and the cache is not used with them.',
  'An omitted maxAge reuses nothing: every page is fetched live unless the request sets maxAge above 0, minAge or lockdown (Firecrawl reuses its own index by default; its Python SDK sends maxAge 4 hours). A reused page is one Octocrawl itself stored, under the same options, on this server (its task root), never a shared index; only a success is stored, and data.metadata says cacheState hit with cachedAt (its fetch time) or miss when one was looked up. lockdown with no stored result is HTTP 404 SCRAPE_LOCKDOWN_CACHE_MISS on scrape, and nothing is fetched; a crawl in lockdown needs sitemap skip, and each page with no stored result is failed with cache_miss. Mode authed neither stores nor reuses. A Firecrawl body never sets useCached, Octocrawl\'s reuse of a crawl\'s own pages on resume.',
  'Omitted limit / maxDepth stay unbounded on a local server; a hosted server takes its crawl limit for an omitted or null limit and refuses a larger one. Firecrawl defaults are 10000 / 10.',
  'maxDepth counts link hops from the start URL (Firecrawl calls that maxDiscoveryDepth); Firecrawl maxDepth counts URL path depth.',
  'Crawl start is mapped onto native POST /v1/crawl; the shim itself returns 200 {success,id,url}.',
  'creditsUsed and expiresAt are null: Octocrawl counts no credits and keeps crawl results until their task directory is deleted.',
  'Crawl status describes the latest attempt: completed counts its successful pages, total adds its failed, blocked and duplicate pages and, while this API process runs the crawl, the pages in flight and queued (null for a paused crawl); data lists the failed and blocked pages too (with metadata.error) but not the duplicates, whose content is an earlier entry\'s, up to 100 per response (limit 1 to 1000) with next carrying a Octocrawl cursor; skip is rejected.',
  'Scrape maps url, formats, onlyMainContent, includeTags, excludeTags, waitFor, timeout, headers, mobile, skipTlsVerification, fastMode, blockAds, removeBase64Images, maxAge, minAge, storeInCache, lockdown, actions, origin and integration; crawl maps url, limit (as maxPages), maxDepth, includePaths, excludePaths, regexOnFullURL, ignoreQueryParameters, deduplicateSimilarURLs, crawlEntireDomain (and its v1 name allowBackwardLinks), allowSubdomains, allowExternalLinks, sitemap (v2; v1 ignoreSitemap true is skip and false include, sitemapOnly true is only), maxConcurrency, ignoreRobotsTxt (v2; a local server only), origin, integration and the same scrapeOptions (applied to every page). The formats are markdown, links, html, rawHtml, images, screenshot (also screenshot@fullPage, and { type: "screenshot", fullPage, quality, viewport }) and an { type: "attributes", selectors } entry; other formats and parameters the shim does not map (proxy, location, json, ...) are rejected by name with HTTP 400 and success: false; a refusal of stealth, proxy: stealth or enhanced, or ignoreRobotsTxt on a scrape or map names the supported route in agent_hints.',
  'A crawl follows links inside the start URL\'s path subtree on its host and www twin by default (crawlEntireDomain false), folds /a and /a/, / and /index.html, www and apex, http and https into one page (deduplicateSimilarURLs true) and reports every collapsed or refused link in the native crawl status (discovery) and each page\'s trace (links_offered); allowSubdomains takes every host under the start URL\'s apex (no public-suffix list), allowExternalLinks every host, each page with its own robots.txt read.',
  'sitemap (default include, as in Firecrawl) reads the sitemaps the start URL\'s robots.txt names, or /sitemap.xml, with the crawl\'s own http identity, robots.txt verdict, SSRF checks and proxy, and queues their URLs ahead of the start page\'s links under the same host, subtree, path and depth rules; only follows no page link; skip reads none. The native crawl status lists every sitemap file read, refused or unreadable in discovery.sitemap; the shim\'s status carries nothing of it, and sitemap fetches have no signed compliance record. maxConcurrency caps the pages one crawl fetches at once, at most the service\'s worker count (HTTP 400 above it), and never raises the per-host ceiling.',
  'screenshot (data.screenshot, a data:image/png;base64 string, or image/jpeg with quality 1 to 100) is captured on the local browser rung alone, which such a request selects (no http attempt; a server without a browser rung refuses the format with HTTP 400): after load, stability and waitFor, before the DOM is read, CSS-pixel sized at the declared 1280x800 viewport (device scale factor 2 is declared, not baked into the image) or at the viewport asked for (integers 320..1920 by 240..1080, within the declared screen; a window size, not a change of identity); fullPage captures the document\'s whole height at that width without scrolling first, so sections a page loads on scroll may show unloaded. A capture the browser could not make leaves data.screenshot null with a screenshot_unavailable warning while the page stands; a file or a page that was not rendered has null too. Firecrawl captures at its own viewport and may return a URL instead of the image.',
  'images (data.images) lists every image URL of the whole document as received: img src and srcset candidates, picture sources, lazy data-src/data-srcset/data-lazy-src/data-original, video posters, image_src links, og:image and twitter:image, absolute http(s) with the fragment stripped, each once, in document order, data: URIs left out; includeTags, excludeTags and onlyMainContent do not narrow it. attributes (data.attributes) gives, per selector, the named attribute\'s values as written, elements without it skipped; a selector Octocrawl does not match is HTTP 400 by name, as for includeTags. Both are absent for a file and for a page that is success: false. removeBase64Images (default true) keeps an image\'s alt text where Firecrawl writes a (<Base64-Image-Removed>) placeholder; false keeps the data: URI in the Markdown.',
  'origin (the Firecrawl SDKs\' client label) and integration are stored, not echoed: the scrape record (GET /v1/scrapes/:id) and the crawl task carry them, and nothing sent to the target changes.',
  'data.metadata carries scrapeId (a UUID per call, which GET /v1/scrapes/:id looks up), proxyUsed (operator for the server\'s environment proxy, user for the caller\'s own egress, else null), timezone (the browser rung\'s declared zone, null on the HTTP rung), creditsUsed: null (Octocrawl counts no credits), concurrencyLimited and concurrencyQueueDurationMs (whether and how long the per-origin ceiling held the fetch back), and cacheState and cachedAt when the cache was asked (never a guessed miss).',
  'A page whose result Octocrawl has advice about (a login wall, a robots.txt rule, a gate, a cut, a script-filled shell) carries data.agent_hints, one sentence each; the native response calls them agentHints. A request refused for an option Octocrawl does not offer carries agent_hints in the error envelope, and a caller over the server\'s per-minute rate limit gets HTTP 429 { success: false, error, code: rate_limited, agent_hints } with Retry-After.',
  'headers never override the User-Agent, the client hints, a credential (authorization, cookie) or a transport header: such a header is HTTP 400 naming it, where Firecrawl sends it. The headers go to the requested origin after the declared identity and are on the record (the trace, the browser lane\'s signed sentHeaders); both rungs withhold them from a redirect hop to another origin and say so (custom_headers_withheld).',
  'mobile selects a declared Android Chrome identity (User-Agent, client hints, 412x915 viewport, touch) that robots.txt is evaluated against and the record carries; the page is whatever the site serves to it, with no DOM rewriting. It is refused with mode research.',
  'skipTlsVerification relaxes certificate verification for one local request and its robots.txt lookup, recorded in the trace (tls_verification_skipped) and a tls_unverified warning the native response carries; a hosted Octocrawl refuses it with HTTP 400. Without it a bad certificate is success: false with failed: tls_error. Firecrawl\'s Python SDK sends true by default; Octocrawl verifies by default.',
  'fastMode keeps the http rung alone: a page that needs scripts is success: false with failed: empty_unverified, never rendered; waitFor has no effect under it. Firecrawl\'s fast mode still renders.',
  'blockAds (default true) aborts requests to a bundled list of about 50 ad-serving hosts on the local browser rung and removes ad and cookie-banner elements before extraction; false keeps them. The list is curated, not EasyList: ads from hosts outside it are not blocked.',
  'html is the cleaned HTML the markdown is written from: the main content, the whole page without scripts, styles, form controls and embedded media when onlyMainContent is false, or a <body> holding the includeTags elements. rawHtml is the page as the answering rung received it: the response body on the HTTP rung, the rendered DOM on a browser rung. Both are null for a file and for a page that is success: false.',
  'includeTags keeps only the named elements, in document order, whatever onlyMainContent says; excludeTags removes elements from the main content, the whole page and an includeTags selection. A selector that does not parse, or that uses a sibling combinator, a positional pseudo-class, :has() or another pseudo-class Octocrawl does not match, is rejected with HTTP 400.',
  'An omitted timeout stays 300000 ms (Firecrawl: 30000). A timeout is answered with HTTP 200: success: true with the content fetched so far (native status partial), or success: false with failed: timeout; Firecrawl answers it with an error.',
  'waitFor skips the HTTP rung, which cannot run scripts, and starts at the browser rung; the wait counts toward timeout.',
  'metadata has title, description, language, keywords, robots and favicon only when the page declares them, and the Open Graph (ogTitle, ogDescription, ogUrl, ogImage, ogAudio, ogVideo, ogDeterminer, ogLocale, ogLocaleAlternate, ogSiteName), Dublin Core (dcTermsCreated, dcDateCreated, dcDate, dcTermsType, dcType, dcTermsAudience, dcTermsSubject, dcSubject, dcDescription, dcTermsKeywords) and article (publishedTime, modifiedTime, articleTag, articleSection) tags under Firecrawl\'s names, each only when the page states it, as written (no date normalisation, no fallback from another tag); twitter:* and other meta tags are not passed through, and a failed or blocked page has none.',
  'A PDF answers success: true with its text layer as markdown and metadata.numPages (the document\'s page count). parsers maps Firecrawl\'s pdf entry (the string or { type: "pdf", mode, maxPages, pages, pageMarkers }); mode fast and auto both read the text layer, and mode ocr and the image parser are refused by name. pageMarkers is false unless asked, as on Firecrawl; with true Octocrawl writes a <!-- page N --> line before each page (Firecrawl writes --- and the marker between pages). pages: true adds data.pages, [{ pageNumber, markdown }]. maxPages (1 to 10000) reads the first pages, and a cut it asked for stays success: true. parsers [] or v1 parsePDF false reads no PDF: success: true with markdown null and the file saved as received. A PDF without a text layer is success: false with failed: empty_unverified (no OCR). CSV, JSON and text files give their text as received; XLSX, XLS and ZIP files are success: true with markdown null. A file over W2L_MAX_FILE_BYTES is success: false with failed: body_too_large.',
  'Map (POST /fc/v1/map) maps url, search, sitemap (v2; v1 ignoreSitemap true is skip and false include, sitemapOnly true is only; both v1 flags true is HTTP 400), includeSubdomains, ignoreQueryParameters, limit (1 to 100000, default 5000), timeout (1000 to 300000 ms for the whole map, default 60000; Firecrawl documents no default), origin and integration onto native POST /v1/map, and answers 200 { success: true, id, links: [url strings], warning?, agent_hints? }, or 200 { success: false, id, error, links: [] } when the map found nothing because a source failed or its deadline passed; useIndex, location, ignoreCache, threatProtection and auditMetadata are refused by name (useIndex with the hint that Octocrawl keeps no URL index). Omitted options take Octocrawl\'s defaults: includeSubdomains and ignoreQueryParameters are false, where Firecrawl v2 documents true for both. search keeps the URLs in which every word appears in the decoded URL or the title in hand, in discovery order; Firecrawl orders by relevance. A map reads the sitemaps the site declares and one page body (the start URL, http rung only), so a site without a sitemap maps only its start page\'s links; a title is the start page\'s own, an anchor\'s text or a sitemap\'s <news:title>, never fetched from the target; robots-disallowed URLs are left out and counted on the native response (GET /v1/maps/:id), which also records every sitemap file read.',
  'A crawl\'s webhook (a URL string or { url, headers, metadata, events }) is mapped onto the native webhook and its receiver gets Firecrawl\'s payload shape: { success, type: crawl.started | crawl.page | crawl.completed | crawl.failed, id, data: [page], metadata, error? }, one durable delivery per event with retries, every request carrying x-w2l-event-id, x-w2l-event-version and x-w2l-delivery-id (and the signature pair with secretEnv, a native option). A cancelled crawl is crawl.failed with error "cancelled". The native rules apply: https (plain http for a loopback receiver of a local server only), no content-type, host or x-w2l-* header, at most 32 headers and 32 metadata strings; a hosted server takes public https receivers only. GET /v1/deliveries?jobId=<id> on the native API lists the deliveries.',
] as const

export interface FirecrawlPage {
  markdown: string | null
  /** Present when the `html` format was asked for; null when the page has none (a file, a page that did not succeed). */
  html?: string | null
  /** Present when the `rawHtml` format was asked for; null when the page has none. */
  rawHtml?: string | null
  links?: string[]
  /** A PDF's pages, when the request's pdf parser asked for them (`pages: true`). */
  pages?: { pageNumber: number; markdown: string }[]
  /** Present when the `images` format was asked for and the page was read as content: every image URL of the whole document. */
  images?: string[]
  /** Present when an `attributes` entry was asked for and the page was read as content: per selector, the attribute's values as written. */
  attributes?: Array<{ selector: string; attribute: string; values: string[] }>
  /** Present when a `screenshot` entry was asked for: the capture as a `data:image/png;base64,…` (or `image/jpeg`) string, as Firecrawl v1 clients read it; null when the browser rung rendered no page or could not capture it. */
  screenshot?: string | null
  /**
   * Present when the request ran `actions`: screenshots and PDFs as data: URIs, the HTML of each scrape step, each
   * script's return, and the step that failed if one did.
   */
  actions?: {
    screenshots: string[]
    scrapes: Array<{ url: string; html: string }>
    javascriptReturns: Array<{ type: string; value: unknown }>
    pdfs: string[]
    /** W2L's own list steps (scrollToEnd, loadMore, paginate): what each did and why it stopped; present when the request had one. */
    lists?: Array<{ index: number; type: string; stoppedBy: string; rounds: number; items: number | null; itemsRead?: number | null }>
    failed?: { index: number; type: string; code: string; message: string }
  }
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
    /** A PDF's page count, read or not; left out for anything else. */
    numPages?: number
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
    /** `hit` when a stored result answered (`maxAge`, `minAge`, `lockdown`), `miss` when one was looked up and none fit; absent when the cache was not asked. */
    cacheState?: 'hit' | 'miss'
    /** On a hit, when the reused result was fetched. */
    cachedAt?: string
  }
}

export interface FirecrawlScrapeResponse {
  success: boolean
  data: FirecrawlPage
  error?: string
}

/** POST /fc/v1/map: the URLs as strings; a map that found nothing because a source failed or its deadline passed is `success: false`. */
export type FirecrawlMapResponse =
  | { success: true; id: string; links: string[]; warning?: string; agent_hints?: AgentHints }
  | { success: false; id: string; error: string; links: []; agent_hints?: AgentHints }

export interface FirecrawlCrawlStarted {
  success: true
  id: string
  url: string
}

/** The type of one Firecrawl-shaped webhook payload: the job kind and the event (`cancelled` is sent as `failed` with `error: 'cancelled'`). */
export type FirecrawlWebhookType = `${'crawl' | 'batch_scrape'}.${'started' | 'page' | 'completed' | 'failed'}`

/**
 * A job event as Firecrawl's webhook receivers read it: `data` holds the page
 * of a `page` event (as `/fc` crawl status lists it) and is empty otherwise;
 * `metadata` is the request's `webhook.metadata`. The W2L envelope's fields
 * are on the delivery's headers (`x-w2l-event-id`, `x-w2l-event-version`).
 */
export interface FirecrawlWebhookPayload {
  success: true
  type: FirecrawlWebhookType
  id: string
  data: FirecrawlPage[]
  metadata: Readonly<Record<string, string>>
  error?: string
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
const SHIM_PAGE_OPTIONS = ['onlyMainContent', 'waitFor', 'timeout', 'includeTags', 'excludeTags', 'headers', 'mobile', 'skipTlsVerification', 'fastMode', 'blockAds', 'removeBase64Images', 'maxAge', 'minAge', 'storeInCache', 'lockdown'] as const
/** Crawl options that keep their Firecrawl name on the native request; the native parser validates them. */
const SHIM_CRAWL_SCOPE_OPTIONS = ['regexOnFullURL', 'ignoreQueryParameters', 'deduplicateSimilarURLs', 'allowSubdomains', 'allowExternalLinks', 'sitemap', 'maxConcurrency'] as const

interface ShimProblems {
  parameters: string[]
  formats: Set<string>
  /** The supported route for a refused option W2L does not offer (a stealth proxy, ignoreRobotsTxt). */
  hints: string[]
}

const noProblems = (): ShimProblems => ({ parameters: [], formats: new Set(), hints: [] })

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

export function parseFirecrawlCrawlRequest(body: unknown): ParsedCrawlStartRequest {
  const rec = asRecord(body)
  const problems = noProblems()
  // `idempotencyKey` is the native name of the `x-idempotency-key` header the v1 SDK sends, which the API merges into the body before parsing.
  checkShimKeys(rec, '', ['url', ...SHIM_ATTRIBUTION, 'limit', 'maxDepth', 'includePaths', 'excludePaths', 'ignoreSitemap', 'sitemapOnly', 'scrapeOptions', ...SHIM_CRAWL_SCOPE_OPTIONS, 'allowBackwardLinks', 'crawlEntireDomain', 'idempotencyKey', 'webhook', 'ignoreRobotsTxt'], problems)
  // A crawl's PDFs follow /fc's rule too: no page markers unless asked.
  let pageOptions: Record<string, unknown> = { parsers: shimParsers(undefined, undefined, 'scrapeOptions.') }
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
  // v1 ignoreSitemap and sitemapOnly are v2 sitemap: skip / include and only; the v2 name wins when both are sent.
  if (rec.ignoreSitemap !== undefined) {
    if (typeof rec.ignoreSitemap !== 'boolean') throw new RequestError('ignoreSitemap must be a boolean')
    native.sitemap = rec.ignoreSitemap ? 'skip' : 'include'
  }
  if (rec.sitemapOnly !== undefined) {
    if (typeof rec.sitemapOnly !== 'boolean') throw new RequestError('sitemapOnly must be a boolean')
    if (rec.sitemapOnly) native.sitemap = 'only'
  }
  for (const key of SHIM_CRAWL_SCOPE_OPTIONS) if (rec[key] !== undefined) native[key] = rec[key]
  // v1 allowBackwardLinks is v2 crawlEntireDomain; the v2 name wins when both are sent.
  if (rec.allowBackwardLinks !== undefined) {
    if (typeof rec.allowBackwardLinks !== 'boolean') throw new RequestError('allowBackwardLinks must be a boolean')
    native.crawlEntireDomain = rec.allowBackwardLinks
  }
  if (rec.crawlEntireDomain !== undefined) native.crawlEntireDomain = rec.crawlEntireDomain
  if (rec.idempotencyKey !== undefined) native.idempotencyKey = rec.idempotencyKey
  // Firecrawl v2's ignoreRobotsTxt is the native option: a local server takes it, a hosted one refuses it by name.
  if (rec.ignoreRobotsTxt !== undefined) native.ignoreRobotsTxt = rec.ignoreRobotsTxt
  // Firecrawl's webhook (a string, or { url, headers, metadata, events }) is the native option; the native parser checks it, and the receiver gets Firecrawl's payload shape.
  if (rec.webhook !== undefined) native.webhook = rec.webhook
  const parsed = parseCrawlStartRequest(native)
  return parsed.webhook === undefined || parsed.webhook === null ? parsed : { ...parsed, webhookPayloadFormat: 'firecrawl' }
}

/** What `/fc/v1/map` takes: Firecrawl's v1 MapParams and the v2 names it maps; anything else is refused by name (useIndex, location, ignoreCache, threatProtection, auditMetadata, ...). */
const SHIM_MAP_KEYS = ['url', 'search', 'sitemap', 'ignoreSitemap', 'sitemapOnly', 'includeSubdomains', 'ignoreQueryParameters', 'limit', 'timeout', ...SHIM_ATTRIBUTION] as const

/**
 * A Firecrawl map request as the native one. v1 ignoreSitemap true is
 * sitemap skip and false include, sitemapOnly true is only, both true is
 * refused; the v2 `sitemap` wins over the v1 flags, as on the crawl shim.
 * The native parser validates the rest; an omitted option takes W2L's
 * default (includeSubdomains and ignoreQueryParameters false).
 */
export function parseFirecrawlMapRequest(body: unknown): MapRequest {
  const rec = asRecord(body)
  const problems = noProblems()
  checkShimKeys(rec, '', SHIM_MAP_KEYS, problems)
  throwShimProblems(problems)
  const native: Record<string, unknown> = {}
  for (const key of SHIM_MAP_KEYS) if (key !== 'ignoreSitemap' && key !== 'sitemapOnly' && rec[key] !== undefined) native[key] = rec[key]
  if (rec.ignoreSitemap !== undefined && typeof rec.ignoreSitemap !== 'boolean') throw new RequestError('ignoreSitemap must be a boolean')
  if (rec.sitemapOnly !== undefined && typeof rec.sitemapOnly !== 'boolean') throw new RequestError('sitemapOnly must be a boolean')
  if (rec.ignoreSitemap === true && rec.sitemapOnly === true) throw new RequestError('ignoreSitemap and sitemapOnly cannot both be true')
  if (rec.sitemap === undefined) {
    if (rec.sitemapOnly === true) native.sitemap = 'only'
    else if (rec.ignoreSitemap !== undefined) native.sitemap = rec.ignoreSitemap ? 'skip' : 'include'
  }
  return parseMapRequest(native)
}

/** The native map response as Firecrawl's: the links as URL strings, the warnings' messages joined, the hints as `agent_hints`. */
export function wrapMap(response: MapResponse): FirecrawlMapResponse {
  const warning = response.warnings.length === 0 ? undefined : response.warnings.map((item) => item.message).join(' ')
  const hints = response.agentHints === undefined || response.agentHints.length === 0 ? {} : { agent_hints: response.agentHints }
  if (response.status === 'failed') {
    return { success: false, id: response.id, error: warning ?? 'the map found no links', links: [], ...hints }
  }
  return { success: true, id: response.id, links: response.links.map((link) => link.url), ...(warning === undefined ? {} : { warning }), ...hints }
}

/**
 * A job event in Firecrawl's webhook shape: the type from the job kind and
 * the event (`cancelled` becomes `failed` with `error: 'cancelled'`), the
 * page of a `page` event as `/fc` crawl status would list it, `metadata` as
 * the request gave it.
 */
export function wrapJobWebhook(envelope: JobWebhookEnvelope, result: FetchResult | null): FirecrawlWebhookPayload {
  const kind = envelope.jobKind === 'crawl' ? 'crawl' : 'batch_scrape'
  const event = envelope.event === 'cancelled' ? 'failed' : envelope.event
  return {
    success: true,
    type: `${kind}.${event}`,
    id: envelope.jobId,
    data: envelope.event === 'page' && result !== null ? [firecrawlPage(result)] : [],
    metadata: { ...envelope.metadata },
    ...(envelope.event === 'cancelled' ? { error: 'cancelled' } : envelope.error === undefined ? {} : { error: envelope.error }),
  }
}

/** The scrape options the shim maps: formats (markdown, links, html, rawHtml, images, screenshot, screenshot@fullPage, an attributes entry and a screenshot entry), onlyMainContent, waitFor, timeout, includeTags, excludeTags, headers, mobile, skipTlsVerification, fastMode, blockAds, removeBase64Images, maxAge, minAge, storeInCache, lockdown and, on a scrape, actions; the native parser validates them. */
function readShimScrapeOptions(rec: Record<string, unknown>, prefix: string, keys: readonly string[], problems: ShimProblems): Record<string, unknown> {
  // actions are a scrape's: a crawl's scrapeOptions.actions is refused by name.
  const takesActions = prefix === ''
  checkShimKeys(rec, prefix, [...keys, 'formats', 'parsers', 'parsePDF', ...SHIM_PAGE_OPTIONS, ...(takesActions ? ['actions'] : [])], problems)
  const mapped: Record<string, unknown> = {}
  for (const key of SHIM_PAGE_OPTIONS) if (rec[key] !== undefined) mapped[key] = rec[key]
  if (takesActions && rec.actions !== undefined) mapped.actions = rec.actions
  mapped.parsers = shimParsers(rec.parsers, rec.parsePDF, prefix)
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

/**
 * A PDF on /fc as on Firecrawl: no page markers unless the request asks
 * (`pageMarkers: true` in its pdf entry); v1 `parsePDF: false` is
 * `parsers: []`, no PDF text. Any other shape passes as it is, and the
 * native parser checks it.
 */
function shimParsers(parsers: unknown, parsePDF: unknown, prefix: string): unknown {
  if (parsePDF !== undefined && typeof parsePDF !== 'boolean') throw new RequestError(`${prefix}parsePDF must be a boolean`)
  if (parsers === undefined) return parsePDF === false ? [] : [{ type: 'pdf', pageMarkers: false }]
  if (!Array.isArray(parsers)) return parsers
  return parsers.map((entry: unknown) => {
    if (entry === 'pdf') return { type: 'pdf', pageMarkers: false }
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry) && (entry as Record<string, unknown>).type === 'pdf' && (entry as Record<string, unknown>).pageMarkers === undefined) return { ...entry, pageMarkers: false }
    return entry
  })
}

function checkShimKeys(rec: Record<string, unknown>, prefix: string, known: readonly string[], problems: ShimProblems): void {
  for (const key of Object.keys(rec)) {
    if (rec[key] === undefined || known.includes(key)) continue
    problems.parameters.push(`${prefix}${key}`)
    const hint = refusalHint(key, rec[key])
    if (hint !== null && !problems.hints.includes(hint)) problems.hints.push(hint)
  }
}

function throwShimProblems(problems: ShimProblems): void {
  const parts: string[] = []
  if (problems.parameters.length > 0) {
    parts.push(`unsupported ${problems.parameters.length === 1 ? 'parameter' : 'parameters'}: ${problems.parameters.join(', ')}`)
  }
  if (problems.formats.size > 0) {
    parts.push(`unsupported ${problems.formats.size === 1 ? 'format' : 'formats'}: ${[...problems.formats].join(', ')} (the /fc shim supports ${SHIM_FORMATS.join(', ')})`)
  }
  if (parts.length === 0) return
  const parameters = problems.parameters
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
    // A page whose body repeated an earlier page's is not a document of its own; `total` still counts it.
    if (step.result !== null && step.status !== 'duplicate') data.push(firecrawlPage(step.result))
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
    ...(result.pages === undefined ? {} : { pages: result.pages.map((page) => ({ pageNumber: page.pageNumber, markdown: page.markdown })) }),
    ...(result.images === undefined ? {} : { images: [...result.images] }),
    ...(result.attributes === undefined ? {} : { attributes: result.attributes.map((entry) => ({ selector: entry.selector, attribute: entry.attribute, values: [...entry.values] })) }),
    // The image as a data URI, which Firecrawl v1 clients read; null when it was asked for and there is none.
    ...(result.screenshot === undefined ? {} : { screenshot: result.screenshot === null ? null : `data:${result.screenshot.contentType};base64,${result.screenshot.base64}` }),
    ...(result.actions === undefined ? {} : { actions: {
      screenshots: result.actions.screenshots.map((shot) => `data:${shot.contentType};base64,${shot.base64}`),
      scrapes: result.actions.scrapes.map((scrape) => ({ url: scrape.url, html: scrape.html })),
      javascriptReturns: result.actions.javascriptReturns.map((value) => ({ type: value.type, value: value.value })),
      pdfs: result.actions.pdfs.map((pdf) => `data:${pdf.contentType};base64,${pdf.base64}`),
      ...(result.actions.lists.length === 0 ? {} : { lists: result.actions.lists.map((list) => ({ ...list })) }),
      ...(result.actions.failed === undefined ? {} : { failed: { ...result.actions.failed } }),
    } }),
    ...(warning === undefined ? {} : { warning }),
    ...(agentHints === undefined || agentHints.length === 0 ? {} : { agent_hints: [...agentHints] }),
    metadata: {
      ...(declared as Partial<FirecrawlPage['metadata']>),
      sourceURL: result.requestedUrl,
      url: result.evidence.finalUrl,
      statusCode: result.evidence.httpStatus,
      ...(result.evidence.contentType === null ? {} : { contentType: result.evidence.contentType }),
      ...(typeof result.file?.pdf?.pageCount === 'number' ? { numPages: result.file.pdf.pageCount } : {}),
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
      // On a scrape and on a crawl page alike: what the cache did, from the result's own trace.
      ...cacheStateOf(result.trace),
    },
  }
}

/** A scrape a cache-only request (`lockdown`) could not answer: nothing was fetched, and Firecrawl answers it with HTTP 404 `SCRAPE_LOCKDOWN_CACHE_MISS`. */
export function isLockdownCacheMiss(response: Pick<FetchResult, 'status' | 'failureReason'>): boolean {
  return response.status === 'failed' && response.failureReason === 'cache_miss'
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
