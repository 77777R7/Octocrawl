/**
 * Native REST contract for scrape + crawl.
 *
 * Request fields match the product CLI. Responses are FetchResult /
 * CrawlReport — no second result enum. Types only.
 */

import { BROWSER_FINGERPRINT, browserFingerprintFor, type CrawlMode, type RobotsOverride } from './compliance.js'
import type { CrawlError, CrawlPage, CrawlPageList, CrawlReport, SitemapMode } from './crawl.js'
import { SITEMAP_MODES } from './crawl.js'
import { MAX_PDF_PAGES, type FetchOptions, type PdfParser } from './execution.js'
import type { FetchResult, FetchWarning, LadderRunAudit, Readiness, TraceEvent } from './result.js'
import { unsafeRegexReason } from './regexSafety.js'
import type { DocumentExtraction, PageMetadata } from './extractor.js'
import type { EvidenceRecord } from './evidenceRecord.js'
import type { AttributeSelector, ListField, ListFormatRequest, ScrapeFormat, ScreenshotFormatRequest, ScreenshotViewport, StructuredExtractionResult } from './structured.js'
import { MAX_FILE_BYTES_CEILING } from './file.js'
import { LIST_WAIT_MS, MAX_ACTIONS, MAX_ACTION_SCRIPT_CHARS, MAX_ACTION_TEXT_CHARS, MAX_ACTION_WAIT_MS, MAX_LIST_PAGES, MAX_LIST_ROUNDS, PDF_PAPER_FORMATS, type PageAction, type PdfPaperFormat } from './actions.js'
import type { WebhookPayloadFormat } from './delivery.js'

export const CRAWL_MODES = ['research', 'standard', 'authed'] as const
export type ApiCrawlMode = (typeof CRAWL_MODES)[number]

/** A scrape's deadline when the request sets no `timeout`, and the largest one it may set. */
export const DEFAULT_SCRAPE_TIMEOUT_MS = 300_000
export const MIN_SCRAPE_TIMEOUT_MS = 1_000
export const MAX_WAIT_FOR_MS = 60_000

/**
 * Per-page capture options shared by scrape, batch and crawl (for batch and
 * crawl they apply to every page). A robots override is never one of them:
 * it names one URL (`ScrapeRequest.robotsOverride`, `BatchStartRequest.robotsOverrides`).
 * Nor are `includeHtml`, `includeRawHtml`, `includeImages`, `attributes` and
 * `screenshot`: the `html`, `rawHtml`, `images`, `attributes` and `screenshot`
 * formats ask for those.
 */
export interface PageOptions extends Omit<FetchOptions, 'robotsOverride' | 'includeHtml' | 'includeRawHtml' | 'includeImages' | 'attributes' | 'screenshot' | 'list'> {
  /**
   * The whole scrape's deadline in milliseconds, 1 000 to 300 000; default
   * 300 000. When it fires the result is `partial` with the best content a
   * rung produced so far, or `failed` with `timeout`, never an error.
   */
  timeout?: number
  /**
   * The http lane alone, no browser escalation: a page that needs script
   * execution returns the http lane's own verdict (a shell is
   * `failed`/`empty_unverified`, never rendered), the ladder audit records
   * the rungs it dropped (`ladder_channels_filtered`), and `agentHints` says
   * when the http lane asked for the browser lane. Not a lane option: the
   * engine selects channels by it. Default false. A URL the server binds to
   * the browser lane refuses it with HTTP 400.
   */
  fastMode?: boolean
  /**
   * Reuse a stored result of this page fetched at most this many
   * milliseconds ago, under the same options, instead of fetching it; 0 to
   * MAX_CACHE_AGE_MS. Default 0: nothing is looked up and the page is
   * fetched. A reused result says so (`cacheState: "hit"`, `cachedAt`) and
   * carries the original fetch's evidence; a looked-up page that had none
   * says `miss`. Not available in mode `authed`.
   */
  maxAge?: number
  /**
   * Reuse only a stored result at least this many milliseconds old; 0 to
   * MAX_CACHE_AGE_MS, at most `maxAge`. Without `maxAge` it looks up a
   * result of any age from this one on.
   */
  minAge?: number
  /**
   * Store this page's result for later reuse when it succeeds. Default true,
   * except for a request with custom `headers`, which stores only with
   * `true` (the stored trace keeps their values); mode `authed` never stores.
   */
  storeInCache?: boolean
  /**
   * Cache only: answer from a stored result and never fetch; a page with
   * none is `failed` with `cache_miss`. `maxAge` and `minAge` still bound
   * the age when given; `maxAge: 0` contradicts it. A crawl in this mode
   * reads no sitemap, so it needs `sitemap: "skip"`.
   */
  lockdown?: boolean
}

/** The largest `maxAge` or `minAge` a request may set: ten years in milliseconds. */
export const MAX_CACHE_AGE_MS = 315_360_000_000

/** The cache options of a request, as PageOptions names them. */
export type CacheOptions = Pick<PageOptions, 'maxAge' | 'minAge' | 'storeInCache' | 'lockdown'>

/**
 * Whether a request looks a page up in the cache: a `maxAge` above 0, a
 * `minAge` or `lockdown`, unless `maxAge` is 0. Otherwise nothing is looked
 * up, and the result carries no `cacheState`.
 */
export function cacheLookupRequested(options: CacheOptions): boolean {
  // `maxAge: 0` is the explicit bypass, whatever else is set.
  if (options.maxAge === 0) return false
  return options.maxAge !== undefined || options.minAge !== undefined || options.lockdown === true
}

/**
 * What the cache did for a result, read from its trace: `hit` with the
 * reused fetch's time after a `cache_hit` event, `miss` after a
 * `cache_miss` event, nothing when the cache was not asked. The last such
 * event decides.
 */
export function cacheStateOf(trace: readonly TraceEvent[]): Pick<ScrapeMetadata, 'cacheState' | 'cachedAt'> {
  const event = [...trace].reverse().find((item) => item.event === 'cache_hit' || item.event === 'cache_miss')
  if (event === undefined) return {}
  if (event.event === 'cache_miss') return { cacheState: 'miss' }
  const cachedAt = event.detail?.cachedAt
  return { cacheState: 'hit', ...(typeof cachedAt === 'string' ? { cachedAt } : {}) }
}

/** The caveats a scrape response may carry for an agent: what to change about the request, in one sentence each. */
export type AgentHints = readonly string[]

/**
 * Who a request is from, for W2L's own records only: the scrape record and
 * the task checkpoint carry both, the crawl and batch status reports them as
 * `attribution`, and nothing sent to the target changes. Each is 1 to 100
 * printable ASCII characters without spaces (`^[\x21-\x7e]+$`).
 */
export interface RequestAttribution {
  /** The client that made the request: the SDK sends `js-sdk@<version>`, the MCP server `mcp-<client name>@<client version>`. */
  origin?: string
  /** The caller's own label for the integration or workflow the request belongs to. */
  integration?: string
}

/**
 * The facts of one scrape call, under Firecrawl's names, on the full and
 * compact scrape responses (`metadata`, beside the page's own declarations)
 * and on `/fc`. Nothing here is guessed: `proxyUsed` is the route the
 * answering lane recorded, `timezone` the time zone the browser lane
 * declares (null on the HTTP lane, where none goes on the wire), and the
 * concurrency pair says whether the per-origin ceiling held an attempt back.
 */
export interface ScrapeMetadata {
  /** A UUID minted for this call; `GET /v1/scrapes/:id` returns its record. */
  scrapeId: string
  /** The URL as requested (`requestedUrl`). */
  sourceURL: string
  /** The final URL, after redirects (`evidence.finalUrl`). */
  url: string
  /** The status of the response that answered `url` (`evidence.httpStatus`); null when none did. */
  statusCode: number | null
  /** That response's `content-type` header (`evidence.contentType`); null when there was none. */
  contentType: string | null
  /** `operator` when the request went through the server's environment proxy, `user` when the compliance record names the caller's own egress, else null. */
  proxyUsed: 'operator' | 'user' | null
  /** The IANA time zone the browser lane declares; null for an HTTP-lane result. */
  timezone: string | null
  /** True when the per-origin concurrency ceiling (`W2L_PER_HOST_CONCURRENCY`) held an attempt of this scrape back. */
  concurrencyLimited: boolean
  /** Milliseconds the attempts of this scrape waited on that ceiling, cooldown and pacing excluded; 0 when none did. */
  concurrencyQueueDurationMs: number
  /**
   * Whether the cache answered: `hit` when a stored result was reused (the
   * rest of the response is that fetch's), `miss` when one was looked up
   * and none fit. Absent when nothing was looked up (no `maxAge` above 0,
   * no `minAge`, no `lockdown`): never a guessed `miss`.
   */
  cacheState?: 'hit' | 'miss'
  /** On a hit, when the reused result was fetched (its `evidenceRecord.fetchedAt`). Absent otherwise. */
  cachedAt?: string
}

/** A scrape response's `metadata`: the page's declarations (all null on a page that was not read as content) and the call's facts. */
export type ScrapeResponseMetadata = PageMetadata & ScrapeMetadata

export interface ScrapeRequest extends PageOptions, RequestAttribution {
  url: string
  mode?: ApiCrawlMode
  allowlistedDomains?: readonly string[]
  formats?: readonly ScrapeFormat[]
  /** Include outbound links. Kept separate from content formats. */
  includeLinks?: boolean
  /** Omitted preserves the legacy full REST/SDK response. MCP sends false by default. */
  debug?: boolean
  /**
   * A recorded decision to fetch this URL although its host's robots.txt
   * disallows it. The reason is required; robots.txt is still read, and the
   * override is reported in the trace, the warnings and, in the browser lane,
   * the compliance record. A hosted server refuses the field
   * (`unsupported_parameter`).
   */
  robotsOverride?: RobotsOverride
  /**
   * When W2L is stopped at a check it does not pass (a captcha, a challenge,
   * a login wall), hand the page to the person in their own Chrome and answer
   * with the page they get through to (`true`, or `{ waitMs }`: how long to
   * wait for them, 10 s to 30 min, default 10 min). Offered only by a server
   * on the person's own machine; refused elsewhere, and with `actions` or a
   * screenshot (`unsupported_parameter`).
   */
  handoff?: { waitMs?: number }
  /**
   * `my-browser`: read the page in the person's own Chrome, over remote
   * debugging, without W2L fetching it first. The person allows the
   * connection in Chrome, then the site in a page W2L opens there; the page
   * is read without a click of theirs only on a site they allowed, and a
   * check it shows waits for them (`handoff.waitMs`, default 10 min). Lane
   * `my_browser`; never cached. Offered only by a server on the person's
   * own machine; refused elsewhere, with `actions` or a screenshot, and with
   * a mode other than standard (`unsupported_parameter`).
   */
  lane?: 'my-browser'
  /** One of three plain choices of how the page is reached (ACCESS_CHOICES); omitted, the server's own configuration. */
  access?: AccessChoice
}

/**
 * How pages are reached, as three plain choices (ROADMAP PA item 7) beside the per-route options:
 * `standard` (Octocrawl's own lanes and none that costs a third party), `enhanced` (also what the server's
 * access grant of tier enhanced approves, within its budget; refused on a server without one), `my-browser`
 * (the person's own Chrome, as `lane: "my-browser"`; a scrape or a batch only).
 */
export const ACCESS_CHOICES = ['standard', 'enhanced', 'my-browser'] as const
export type AccessChoice = (typeof ACCESS_CHOICES)[number]

/** A request's `access`, and the lane it implies: `my-browser` is the my-browser lane, which `lane` may name too, but not a different choice. */
function readAccessChoice(rec: Record<string, unknown>, takesMyBrowser: boolean): { access?: AccessChoice; lane?: 'my-browser' } {
  if (rec.lane !== undefined && !(REQUEST_LANES as readonly unknown[]).includes(rec.lane)) throw new RequestError(`lane must be one of: ${REQUEST_LANES.join(', ')}`)
  if (rec.access === undefined) return rec.lane === undefined ? {} : { lane: rec.lane as 'my-browser' }
  if (!(ACCESS_CHOICES as readonly unknown[]).includes(rec.access)) throw new RequestError(`access must be one of: ${ACCESS_CHOICES.join(', ')}`)
  const access = rec.access as AccessChoice
  if (access === 'my-browser' && !takesMyBrowser) throw new RequestError('access my-browser reads pages in your own Chrome, one you name at a time: a crawl does not take it; list the pages and send them as a batch', 'unsupported_parameter', { parameters: ['access'] })
  if (rec.lane !== undefined && access !== 'my-browser') throw new RequestError(`lane my-browser and access ${access} ask for two different routes: send one`, 'unsupported_parameter', { parameters: ['lane', 'access'] })
  return access === 'my-browser' ? { access, lane: 'my-browser' } : { access }
}

/** A recorded robots override for one URL of a batch. */
export interface RobotsUrlOverride extends RobotsOverride {
  url: string
}

/** One scrape as the ladder ran it, before the API shapes the response: the result, its routing audit, the request's hints and, once shaped, the `warning` string. */
export type ScrapeRun = FetchResult & LadderRunAudit & { agentHints?: AgentHints; warning?: string }

/** The `warnings` as one string, their messages joined with a space (Firecrawl's `warning`); undefined when there are none. */
export function warningOf(warnings: readonly FetchWarning[] | undefined): string | undefined {
  return warnings === undefined || warnings.length === 0 ? undefined : warnings.map((warning) => warning.message).join(' ')
}

/**
 * The full scrape response: the run, its `scrapeId`, `metadata` carrying the
 * call's facts beside the page's declarations, and the snapshot and Evidence
 * Record set on every response the API sends (see evidenceRecord.ts).
 */
export type ScrapeResponse = ScrapeRun & { scrapeId: string; metadata: ScrapeResponseMetadata; snapshot?: CompactScrapeResponse['snapshot']; evidenceRecord?: EvidenceRecord; readiness: Readiness }

/**
 * What `GET /v1/scrapes/:id` returns: the record of one scrape call, written
 * beside the task root (`scrapes/<scrapeId>.json`) before the response was
 * sent. It holds no page body: the request (header values replaced by their
 * names), who made it, the verdict and the facts of the fetch.
 */
export interface ScrapeRecord extends RequestAttribution {
  scrapeId: string
  /** UTC ISO time the API took the request. */
  requestedAt: string
  /** The parsed request; each custom header's value is replaced by its name. */
  request: ScrapeRequest
  status: FetchResult['status']
  failureReason: FetchResult['failureReason']
  blockReason: FetchResult['blockReason']
  budgetExceeded: FetchResult['budgetExceeded']
  lane: FetchResult['lane']
  channelsTried: readonly string[]
  metadata: ScrapeResponseMetadata
  snapshot: CompactScrapeResponse['snapshot']
  usage: { wallMs: number; totalMs: number; requestCount: number; attemptCount: number; browserMs: number }
  warnings?: readonly FetchWarning[]
  agentHints?: AgentHints
}

export interface CompactScrapeResponse {
  requestedUrl: string
  finalUrl: string
  /**
   * Small capture identity for field audits; the HTML body remains local.
   * `httpStatus` and `contentType` are the status and `content-type` header
   * of the response that answered `finalUrl` (`evidence.httpStatus`,
   * `evidence.contentType`): in the browser lane, of the document the page
   * shows after a script or a meta refresh moved it on.
   */
  snapshot: { rawBodySha256: string | null; artifacts: readonly string[]; httpStatus: number | null; contentType: string | null }
  /** The result's Evidence Record v1, the same as on the full response. */
  evidenceRecord: EvidenceRecord
  status: FetchResult['status']
  failureReason: FetchResult['failureReason']
  blockReason: FetchResult['blockReason']
  budgetExceeded: FetchResult['budgetExceeded']
  retryAt?: number
  lane: FetchResult['lane']
  formats: readonly ('markdown' | 'html' | 'rawHtml' | 'links' | 'json' | 'images' | 'tables' | 'attributes' | 'screenshot' | 'list')[]
  markdown?: string | null
  /** Present when `html` was asked for, as on the full response; null when the result carries none (a file, a page that was not read as content). */
  html?: string | null
  /** Present when `rawHtml` was asked for, as on the full response; null when the result carries none. */
  rawHtml?: string | null
  links?: readonly string[]
  /** Present when `images` was asked for and the page was read as content: every image URL of the whole document, as on the full response. */
  images?: readonly string[]
  /** Present when `tables` was asked for and the page was read as content: its data tables, as on the full response. */
  tables?: FetchResult['tables']
  /** Present when a `pdf` parser entry asked for `pages` and a PDF's text was read, as on the full response. */
  pages?: FetchResult['pages']
  /** Present when an `attributes` entry was asked for and the page was read as content, as on the full response. */
  attributes?: FetchResult['attributes']
  /** Present when a `list` entry was asked for and the page was read: its records. */
  list?: FetchResult['list']
  /** Present when a `screenshot` entry was asked for, as on the full response: the capture, or null when the browser lane rendered no page or could not capture it. */
  screenshot?: FetchResult['screenshot']
  /** Present when the request ran `actions`: what the steps produced, and the step that failed if one did. */
  actions?: FetchResult['actions']
  document?: Pick<DocumentExtraction, 'title' | 'pageType' | 'strategy' | 'confidence' | 'adapter' | 'adapterValidation'> | null
  /** The call's facts (`scrapeId`, `proxyUsed`, the concurrency pair, ...) and the page's own declarations, as on the full response. */
  metadata: ScrapeResponseMetadata
  json?: StructuredExtractionResult | null
  /** The file the response was, as on the full response; absent for a web page. */
  file?: FetchResult['file']
  /** The fetch's caveats (a recorded robots override, a suspected client-rendered shell, a thin http answer kept), as on the full response; absent when it had none. */
  warnings?: FetchResult['warnings']
  /** The warnings' messages joined with a space, present exactly when `warnings` is (Firecrawl's `warning`). */
  warning?: string
  /** Whether the page was ready for its task when it was read (Readiness, ADR 0007), as on the full response. */
  readiness: Readiness
  /** Present when the request itself left something on the table (`fastMode` declined a browser hop the http lane asked for), as on the full response. */
  agentHints?: AgentHints
  /** A page stopped at a check a person can get through, on a server that hands pages to them: why, and how (`handoff: true`), as on the full response. */
  handoff?: FetchResult['handoff']
  truncated: boolean
  truncatedAt: number | null
  usage: FetchResult['usage'] & { totalMs: number }
  channelsTried: readonly string[]
}

/** The events a job webhook can be sent: Firecrawl's four, plus `cancelled`, which W2L tells apart from `failed`. */
export const WEBHOOK_EVENTS = ['started', 'page', 'completed', 'failed', 'cancelled'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/** The bounds of a job webhook's configuration. */
export const MAX_WEBHOOK_URL_LENGTH = 2048
export const MAX_WEBHOOK_HEADERS = 32
export const MAX_WEBHOOK_HEADERS_BYTES = 8192
export const MAX_WEBHOOK_METADATA_ENTRIES = 32
export const MAX_WEBHOOK_METADATA_VALUE_LENGTH = 1000
export const MAX_WEBHOOK_METADATA_BYTES = 8192

/**
 * Where a crawl or batch posts its events (`webhook` on `POST /v1/crawl` and
 * `POST /v1/batches`; a plain string is `{ url }`). Each event is one durable
 * delivery with retries, signed when `secretEnv` names an operator secret;
 * `GET /v1/deliveries?jobId=<taskId>` lists them. The receiver must be https;
 * a local server also takes plain http to a loopback receiver.
 */
export interface WebhookConfig {
  /** The receiver: an http(s) URL of at most 2048 characters, without credentials or a fragment. */
  url: string
  /**
   * Headers sent with every delivery, retries included: at most 32, 8 KiB in
   * all, RFC 7230 token names (lower-cased), values without line breaks.
   * `content-type`, `content-length`, `host`, `connection`,
   * `transfer-encoding` and every `x-w2l-*` name are W2L's and refused by
   * name. Stored in the control database alone, never on the task or in any
   * response, which show their names only; `secretEnv` is the signing path.
   */
  headers?: Readonly<Record<string, string>>
  /** Strings echoed as `metadata` in every payload: at most 32, each of at most 1000 characters, 8 KiB in all. */
  metadata?: Readonly<Record<string, string>>
  /** The events to deliver; default all five. A filtered event is never enqueued. */
  events?: readonly WebhookEvent[]
  /** An operator `W2L_WEBHOOK_SECRET_*` variable whose value signs each delivery (`x-w2l-timestamp`, `x-w2l-signature`); never a literal. */
  secretEnv?: string
}

/** The `webhook` field as a request may write it: a URL string, a configuration object, or null for none. */
export type WebhookOption = string | WebhookConfig | null

/**
 * What a crawl or batch status says about its webhook: the destination
 * (`GET /v1/deliveries?jobId=`), the receiver as origin and path (no query),
 * the events taken, and how its deliveries stand. `pending` counts the
 * deliveries not yet acknowledged, those in flight included.
 */
export interface JobWebhookStatus {
  destinationId: string
  url: string
  events: readonly WebhookEvent[]
  pending: number
  delivered: number
  deadLetter: number
}

export interface CrawlStartRequest extends PageOptions, RequestAttribution {
  url: string
  mode?: ApiCrawlMode
  /** `standard` or `enhanced` (ACCESS_CHOICES); a crawl does not take `my-browser`. */
  access?: Exclude<AccessChoice, 'my-browser'>
  maxPages?: number | null
  maxDepth?: number | null
  /**
   * A resume (`POST /v1/crawl/:id/resume`, or a restart) reuses the pages
   * this crawl already fetched instead of fetching them again. It reaches no
   * other request's pages: `maxAge` reuses a stored result of any request.
   */
  useCached?: boolean
  allowlistedDomains?: readonly string[]
  /** Formats for every page, validated as for scrape. Omitted selects Markdown. */
  formats?: readonly ScrapeFormat[]
  /** Include each page's outbound links, like a `links` format. */
  includeLinks?: boolean
  /** Pathname regexes a discovered link must match. The seed URL is always fetched. */
  includePaths?: readonly string[]
  /** Pathname regexes that skip a discovered link; they win over includePaths. */
  excludePaths?: readonly string[]
  /**
   * Match includePaths / excludePaths against a discovered link's canonical
   * URL (scheme, host, path and query) instead of its pathname. Default false.
   */
  regexOnFullURL?: boolean
  /**
   * URLs that differ only in their query string are one page: the first
   * variant seen is fetched, later ones are reported as collapsed. Default false.
   */
  ignoreQueryParameters?: boolean
  /**
   * `/a` and `/a/`, `/` and `/index.html`, `www.` and the apex, http and https
   * name one page: the first variant seen is fetched, later ones are reported
   * as collapsed. Default true.
   */
  deduplicateSimilarURLs?: boolean
  /**
   * Follow links anywhere on the start URL's host. Default false: links on
   * that host are followed only inside the start URL's path subtree.
   */
  crawlEntireDomain?: boolean
  /** Follow links to subdomains of the start URL's host (`*.apex`, with one leading `www.` removed). Default false. */
  allowSubdomains?: boolean
  /** Follow links to any host; cannot be combined with allowlistedDomains. Default false. */
  allowExternalLinks?: boolean
  /**
   * How the crawl uses the site's sitemap: `include` (default) reads the
   * sitemaps the start URL's robots.txt names, or `/sitemap.xml`, and queues
   * their URLs ahead of the start page's links; `skip` reads none; `only`
   * follows no page link, so the pages are the start URL and the sitemap's
   * entries. Entries pass the same host, subtree, path and depth rules as
   * links. The files read are listed in the report's `discovery.sitemap`.
   */
  sitemap?: SitemapMode
  /**
   * Pages this crawl fetches at once, at most: an integer >= 1, refused above
   * the service's worker count. It can only lower the crawl's parallelism; the
   * per-host ceiling and minimum interval still apply. Null or omitted takes
   * the worker count.
   */
  maxConcurrency?: number | null
  /**
   * A client-chosen key, 1 to 200 characters without control characters,
   * that makes a retried start return the first start's answer instead of a
   * second job (also the `x-idempotency-key` header on REST). The same key
   * with a different request is HTTP 409 `conflict`. Keys live 24 hours.
   */
  idempotencyKey?: string
  /** A receiver for the crawl's events (`started`, one `page` per page recorded, then `completed`, `failed` or `cancelled`); see WebhookConfig. */
  webhook?: WebhookOption
  /**
   * Fetch the pages and sitemap files robots.txt disallows, or whose
   * robots.txt could not be read (Firecrawl v2's name). robots.txt is still
   * read for every host and its verdict recorded on each page, Crawl-delay
   * applied, with a `robots_overridden` warning and `overrideBasis:
   * "ignore_robots_txt"` where a rule was set aside. A local server only: a
   * hosted one refuses it by name. Default false: a crawl's links obey
   * robots.txt.
   */
  ignoreRobotsTxt?: boolean
}

/** What the parser hands the engine: the request plus, from the `/fc` shim, the payload shape its receiver expects. */
export type ParsedCrawlStartRequest = CrawlStartRequest & { webhookPayloadFormat?: WebhookPayloadFormat }

/** A map's `limit` when the request names none, and the largest it may name: Firecrawl's documented default and maximum (read 2026-10-03). */
export const DEFAULT_MAP_LIMIT = 5_000
export const MAX_MAP_LIMIT = 100_000
/** One deadline for the whole map when the request names no `timeout`; a map answers synchronously. */
export const DEFAULT_MAP_TIMEOUT_MS = 60_000
export const MAX_MAP_TIMEOUT_MS = 300_000
/** A hosted server's map caps: Firecrawl's default limit, and the default deadline, since a map answers synchronously. */
export const HOSTED_MAP_MAX_LIMIT = 5_000
export const HOSTED_MAP_MAX_TIMEOUT_MS = 60_000

/** POST /v1/map: the URLs of a site from its sitemaps and its start page's links, without fetching each page. */
export interface MapRequest extends RequestAttribution {
  url: string
  /** standard (default) or research; authed is refused: a map reads public sitemaps and one public page. */
  mode?: 'standard' | 'research'
  /** Links returned at most, 1 to MAX_MAP_LIMIT; default DEFAULT_MAP_LIMIT. */
  limit?: number
  /** Milliseconds for the whole map, 1000 to MAX_MAP_TIMEOUT_MS; default DEFAULT_MAP_TIMEOUT_MS. At the deadline the map answers with what it found. */
  timeout?: number
  /**
   * Keep only the URLs in which every word (1 to MAP_SEARCH_MAX_WORDS words,
   * 1 to MAP_SEARCH_MAX_CHARS characters, trimmed) appears, case-insensitively,
   * in the percent-decoded URL or the link's title. A filter, not a ranking:
   * discovery order is kept, and it runs before `limit` is counted.
   */
  search?: string
  /** How the map uses the site's sitemap: include (default), skip (the start page alone), only (no page body read). */
  sitemap?: SitemapMode
  /** Admit every host under the start URL's apex (the crawl's allowSubdomains). Default false. */
  includeSubdomains?: boolean
  /** Fold URLs that differ only in their query string into the first one seen; the returned URL has no query. Default false. */
  ignoreQueryParameters?: boolean
  /** The crawl's scope options, under their crawl names and rules. */
  includePaths?: readonly string[]
  excludePaths?: readonly string[]
  regexOnFullURL?: boolean
  crawlEntireDomain?: boolean
  /** Default true, as on a crawl; a returned http link gives way to its https variant when that comes too, on an origin whose robots.txt the map read anyway and which allows it. */
  deduplicateSimilarURLs?: boolean
  /**
   * Return the URLs robots.txt disallows, or whose robots.txt could not be
   * read, with that verdict on each link (`robots: "disallowed"` or
   * `"unreachable"`), and read the start page and sitemap files past it.
   * robots.txt is still read, within MAP_MAX_ROBOTS_HOSTS. A local server
   * only: a hosted one refuses it by name. Default false.
   */
  ignoreRobotsTxt?: boolean
}

/** A map's `search`: at most this many characters after trimming, and this many whitespace-separated words. */
export const MAP_SEARCH_MAX_CHARS = 200
export const MAP_SEARCH_MAX_WORDS = 10

export interface CrawlAccepted {
  taskId: string
  /** Present and true when `idempotencyKey` matched an earlier start and this is its stored answer; nothing was started. */
  replayed?: boolean
}

/** The request headers REST reads an idempotency key from, merged into the body as `idempotencyKey` before parsing. */
export const IDEMPOTENCY_KEY_HEADERS = ['x-idempotency-key', 'idempotency-key'] as const
export const MAX_IDEMPOTENCY_KEY_LENGTH = 200

/** The options a running crawl was started with, as `GET /v1/crawl/active` reports them: its task's stored options plus its page budget. */
export interface ActiveCrawlOptions {
  maxPages: number | null
  maxDepth: number | null
  allowlistedDomains: readonly string[]
  includePaths: readonly string[]
  excludePaths: readonly string[]
  useCached: boolean
  sitemap: SitemapMode
  ignoreQueryParameters: boolean
  deduplicateSimilarURLs: boolean
  crawlEntireDomain: boolean
  allowSubdomains: boolean
  allowExternalLinks: boolean
  regexOnFullURL: boolean
  maxConcurrency: number | null
  ignoreRobotsTxt: boolean
  /** The per-page options every page of the crawl gets: its formats, `includeLinks` and the page options. */
  scrapeOptions: PageOptions & { formats: readonly ScrapeFormat[]; includeLinks: boolean }
}

/** One crawl this API process is running (a crawl it resumed at startup included); batches are not listed. */
export interface ActiveCrawl {
  id: string
  /** The start URL. */
  url: string
  status: 'pending' | 'running' | 'paused'
  /** When the latest attempt started; the task's creation time while no attempt has opened yet. */
  startedAt: string
  /** The latest attempt's pages so far. */
  pagesFetched: number
  options: ActiveCrawlOptions
}

/** `GET /v1/crawl/active`: always 200, with an empty list when nothing runs. */
export interface ActiveCrawlList {
  crawls: readonly ActiveCrawl[]
}

export interface BatchStartRequest extends PageOptions, RequestAttribution {
  urls: readonly string[]
  mode?: ApiCrawlMode
  /** One of three plain choices of how pages are reached (ACCESS_CHOICES); `my-browser` is `lane: "my-browser"`. */
  access?: AccessChoice
  /**
   * `my-browser`: read every page in the person's own Chrome, one at a time, as a scrape's `lane` does. The person
   * allows the connection in Chrome, then all the batch's sites (host and port) in the page W2L opens there, once for
   * the run; a site not among them is not read. A resumed run asks again. Offered only by a server on the person's own
   * machine; refused elsewhere, with `actions`, a screenshot, lockdown, a mode other than standard, `maxConcurrency`
   * above 1 or a webhook (`unsupported_parameter`).
   */
  lane?: 'my-browser'
  formats?: readonly ScrapeFormat[]
  includeLinks?: boolean
  /** Recorded robots overrides, each for one URL of `urls`. A hosted server refuses the field (`unsupported_parameter`). */
  robotsOverrides?: readonly RobotsUrlOverride[]
  /**
   * Pages of this batch in flight at once, at most: an integer from 1 to 4.
   * It only lowers the service's worker count (4 locally, 2 on the hosted
   * MCP host); the per-host ceiling and minimum interval still apply.
   * Omitted takes the worker count. Stored with the task, so a resumed batch
   * runs under the same cap.
   */
  maxConcurrency?: number
  /**
   * Start the batch with the entries of `urls` that are http(s) URLs and
   * report the rest as `invalidURLs` instead of refusing the request. A
   * non-string entry is still refused (`urls[i] must be a string`), and so
   * is a duplicate: neither is an invalid URL. Default false.
   */
  ignoreInvalidURLs?: boolean
  /**
   * Firecrawl's extract scope flags, accepted in their no-op form only: a
   * batch fetches exactly the URLs given and follows no link, which is what
   * `false` says. `true` is refused with HTTP 400 naming the alternative (a
   * crawl's `allowExternalLinks` / `allowSubdomains`; extraction across
   * links is the M5 multi-URL extract).
   */
  allowExternalLinks?: false
  includeSubdomains?: false
  /**
   * A client-chosen key, 1 to 200 characters without control characters,
   * that makes a retried submission return the first one's answer (with
   * `replayed: true`) instead of a second job; also the `x-idempotency-key`
   * header on REST. The same key with a different request is HTTP 409
   * `conflict`. Keys live 24 hours, per task root.
   */
  idempotencyKey?: string
  /**
   * The id of an existing batch to add `urls` to instead of starting a new
   * job. The body may then carry only `urls`, `ignoreInvalidURLs`,
   * `idempotencyKey`, `robotsOverrides` and the attribution labels: the job's
   * `mode`, `formats`, `includeLinks`, `maxConcurrency` and page options
   * stay as they were (`appendToId keeps the job's options; <key> cannot be
   * changed`). The appended URLs go to the end of the job's list, in order.
   */
  appendToId?: string
  /** A receiver for the batch's events (`started`, one `page` per item recorded, then `completed`, `failed` or `cancelled`); see WebhookConfig. */
  webhook?: WebhookOption
}

/** What the parser hands the engine: the request plus, when `ignoreInvalidURLs` was on, the entries it skipped (possibly none), and from a shim the payload shape its receiver expects. */
export type ParsedBatchStartRequest = BatchStartRequest & { invalidURLs?: readonly string[]; webhookPayloadFormat?: WebhookPayloadFormat }

/**
 * `POST /v1/batches` 202: the task id and, when `ignoreInvalidURLs` was on,
 * the entries skipped, possibly none. An append answers with the job's id,
 * `requested` (the job's URLs after the append) and `appended` (the URLs this
 * request added); a replayed submission carries `replayed: true`.
 */
export interface BatchAccepted extends CrawlAccepted {
  invalidURLs?: string[]
  requested?: number
  appended?: number
}

export interface BatchStatusResponse extends CrawlReport {
  requested: number
  completed: number
  remaining: number
  /** Items recorded `success`, `partial` or `empty_verified` (a page read, with or without content), every attempt counted. */
  succeeded: number
  /** Items the errors report lists: `failed`, `blocked`, `cancelled` or `budget_exceeded`, every attempt counted. With one step per URL, `completed` is `succeeded + failed`. */
  failed: number
  /** The cap in force: the request's `maxConcurrency` or the service's worker count, whichever is lower. */
  maxConcurrency: number
  /** The entries `ignoreInvalidURLs` skipped at submission; present exactly when the option was on. */
  invalidURLs?: readonly string[]
  /** Items stopped at a check a person can get through in their own Chrome (`POST /v1/batches/:id/handoff`); present on a server that offers the handoff. */
  waitingForPerson?: number
  /** A batch on the my-browser lane waiting for the person to allow its sites in the page Octocrawl opened in their Chrome; present only while it waits. */
  waitingForApproval?: true
}

/**
 * The checks a batch item can be handed to a person for, and the routing
 * reason each is handed over as: a captcha, a bot check or challenge, a
 * login wall. A rate limit or a region block is not something a person gets
 * through in a browser.
 */
export const HANDOFF_REASONS: Readonly<Record<string, 'captcha_required' | 'bot_gate' | 'login_required'>> = {
  captcha: 'captcha_required',
  cloudflare_challenge: 'bot_gate',
  bot_detected_generic: 'bot_gate',
  login_wall: 'login_required',
}

/**
 * `POST /v1/logins/import`: save the person's login to `site` (a domain or a
 * page URL) from the Chrome they use, as `octocrawl login import` does, on a server
 * on their machine. `approveTimeoutMs`: how long to wait for them to click
 * Allow in Chrome, 10 s to 10 min; default 2 min.
 */
export interface LoginImportRequest {
  site: string
  approveTimeoutMs?: number
}

export function parseLoginImportRequest(body: unknown): LoginImportRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('body must be a JSON object')
  const rec = body as Record<string, unknown>
  for (const key of Object.keys(rec)) if (key !== 'site' && key !== 'approveTimeoutMs') throw new RequestError(`unsupported login import option: ${key}`)
  if (typeof rec.site !== 'string' || rec.site.trim() === '' || rec.site.length > 2048) throw new RequestError('site must be a domain or a page URL')
  if (rec.approveTimeoutMs !== undefined && (typeof rec.approveTimeoutMs !== 'number' || !Number.isInteger(rec.approveTimeoutMs) || rec.approveTimeoutMs < 10_000 || rec.approveTimeoutMs > 600_000)) throw new RequestError('approveTimeoutMs must be an integer from 10000 to 600000')
  return { site: rec.site.trim(), ...(rec.approveTimeoutMs === undefined ? {} : { approveTimeoutMs: rec.approveTimeoutMs }) }
}

/** The localStorage a saved login holds: the origins, and how many items in all; never a value. */
export interface LoginStorage {
  origins: string[]
  itemCount: number
}

/** A login saved for a domain: never its cookies or storage values, only how many and the hash a record names it by. */
export interface SavedLogin {
  domain: string
  savedAt: string
  cookieCount: number
  /** The localStorage saved with it, read from the site's tabs open in Chrome when it was imported; null for none. */
  localStorage: LoginStorage | null
  sessionSha256: string
}

/** What an import saved, and whether the site's localStorage was read: false when no tab of the site was open in Chrome. */
export interface LoginImportResponse extends SavedLogin {
  localStorageRead: boolean
  /** The origins of the site's open tabs whose localStorage Chrome did not give (a tab that crashed or was discarded): saved without it. */
  localStorageUnread: string[]
  /** Why each of localStorageUnread was not read, a tab at a time: the request to Chrome that failed (`Target.attachToTarget`, `Page.getFrameTree` or `DOMStorage.getDOMStorageItems`) and Chrome's answer, or the wait that ran out. */
  localStorageUnreadReasons: { origin: string; step: string; error: string }[]
}

/** `POST /v1/batches/:id/handoff`: how long to wait for the person on each page, 10 s to 30 min; default 10 min. */
export interface BatchHandoffRequest {
  waitMs?: number
}

export const MAX_HANDOFF_WAIT_MS = 1_800_000

export function parseBatchHandoffRequest(body: unknown): BatchHandoffRequest {
  if (body === undefined || body === null) return {}
  if (typeof body !== 'object' || Array.isArray(body)) throw new RequestError('body must be a JSON object')
  const rec = body as Record<string, unknown>
  for (const key of Object.keys(rec)) if (key !== 'waitMs') throw new RequestError(`unsupported handoff option: ${key}`)
  if (rec.waitMs === undefined) return {}
  if (typeof rec.waitMs !== 'number' || !Number.isInteger(rec.waitMs) || rec.waitMs < 10_000 || rec.waitMs > MAX_HANDOFF_WAIT_MS) throw new RequestError(`waitMs must be an integer from 10000 to ${MAX_HANDOFF_WAIT_MS}`)
  return { waitMs: rec.waitMs }
}

/**
 * What a handoff did: each item it handed over, in order, and whether the
 * person got it through. An item that was through is read in their browser
 * and its result replaces the stopped one (`status`, the item's new one); an
 * item that was not (they did not get through in time, closed its tab, or it
 * ended off its site) keeps its stopped result, with `reason` saying why.
 */
export interface BatchHandoffResponse {
  id: string
  handedOff: number
  through: number
  notThrough: number
  items: Array<{ id: string; url: string; through: boolean; status: string; reason?: string }>
}

/** The step statuses `GET /v1/batches/:id/errors` lists: the same ones `/v1/crawl/:id/errors` does. */
export const BATCH_ERROR_STATUSES = ['failed', 'blocked', 'cancelled', 'budget_exceeded'] as const
export type BatchErrorStatus = (typeof BATCH_ERROR_STATUSES)[number]

/**
 * One item of a batch that did not succeed, under Firecrawl's names (`id`,
 * `timestamp`, `url`, `code`, `error`) with W2L's status vocabulary beside
 * them: `status` and `code` (the `failureReason`, `blockReason` or
 * `budgetExceeded` the status carries, else the status itself) are the same
 * values the item on `/items` carries.
 */
export interface BatchErrorItem {
  /** The item's step id, as on `GET /v1/batches/:id/items`. */
  id: string
  /** When the item was recorded (its `createdAt`). */
  timestamp: string
  url: string
  status: BatchErrorStatus
  code: string
  /**
   * A sentence for a reader: the result's first warning when it has one,
   * else `<status>: <code>`, with ` (HTTP <n>)` when the status is known and,
   * for a robots.txt refusal, the rule that applied.
   */
  error: string
  httpStatus: number | null
}

/** `GET /v1/batches/:id/errors`: the batch's errors across every attempt, one page at a time, and the URLs robots.txt refused (every attempt, not paginated). */
export interface BatchErrorsResponse {
  errors: BatchErrorItem[]
  /**
   * URLs of the batch whose result is `policy_denied` by a `robots_disallowed`
   * trace event that no recorded override set aside. A governance or SSRF
   * refusal is `policy_denied` too but is not robots.txt, and stays out of
   * this list (it is still in `errors`).
   */
  robotsBlocked: string[]
  nextCursor: string | null
  hasMore: boolean
}

/** The page of errors asked for: `limit` 1 to 1000 (default 1000: a batch has at most 1000 URLs and errors carry no bodies). */
export interface BatchErrorsQuery {
  cursor?: string
  limit?: number
}

export const BATCH_ERRORS_MAX_LIMIT = 1000

export type CrawlStatusResponse = CrawlReport
export interface CrawlPageQuery {
  attemptId?: string
  cursor?: string
  limit?: number
  debug?: boolean
  /** List the pages whose content repeated an earlier page's (status `duplicate`) too; left out by default. */
  includeDuplicates?: boolean
}
export type CrawlPagesResponse = CrawlPageList<CrawlPage>
export type CrawlErrorsResponse = CrawlPageList<CrawlError>

/**
 * The events a job stream sends (`GET /v1/crawl/:id/events`,
 * `GET /v1/batches/:id/events` as server-sent events, and the same routes'
 * `/ws` as WebSocket frames): `catchup` with the job's report as the stream
 * opens, one `document` per page recorded (the compact page the items routes
 * list, with the step cursor the listing routes take, so `after=<cursor>` or
 * `Last-Event-ID` resumes a stream), `snapshot` with the report after each
 * page, `done` with the terminal report, `error` with `{ code, message }`.
 * A document is sent once per step id on one stream; a client that resumes
 * or switches transports deduplicates by it.
 */
export const JOB_STREAM_EVENTS = ['catchup', 'document', 'snapshot', 'done', 'error'] as const
export type JobStreamEventType = (typeof JOB_STREAM_EVENTS)[number]
export type JobStreamReport = CrawlReport | BatchStatusResponse
export type JobStreamFrame =
  | { type: 'catchup'; data: JobStreamReport }
  | { type: 'document'; data: CrawlPage; cursor: string }
  | { type: 'snapshot'; data: JobStreamReport }
  | { type: 'done'; data: JobStreamReport }
  | { type: 'error'; error: { code: string; message: string } }

/**
 * The WebSocket subprotocol a client presents its bearer token in, since the
 * WebSocket API sets no headers: `w2l.token.<token>`, echoed back as the
 * selected protocol. A token must then be made of the characters a
 * subprotocol name allows (RFC 6455 token characters); the SDK falls back to
 * the SSE route, which carries the Authorization header, for any other token.
 */
export const WS_TOKEN_PROTOCOL_PREFIX = 'w2l.token.'

export function isApiCrawlMode(value: string): value is ApiCrawlMode {
  return (CRAWL_MODES as readonly string[]).includes(value)
}

export function defaultApiMode(mode: CrawlMode | undefined): ApiCrawlMode {
  return mode === 'research' || mode === 'authed' ? mode : 'standard'
}

/**
 * The one set of request-error codes, shared by the REST API, /fc, the SDK and
 * MCP. A request error means W2L refused or failed the request itself; what
 * happened to a fetched page is its result status (blocked, failed, ...), not
 * one of these.
 */
export const API_ERROR_CODES = ['invalid_json', 'invalid_request', 'unsupported_parameter', 'unsupported_format', 'unauthorized', 'not_found', 'conflict', 'internal_error'] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** The HTTP status each code is returned with. */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, 400 | 401 | 404 | 409 | 500>> = {
  invalid_json: 400,
  invalid_request: 400,
  unsupported_parameter: 400,
  unsupported_format: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  internal_error: 500,
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (API_ERROR_CODES as readonly unknown[]).includes(value)
}

/** What a request named that W2L cannot honour, as sent (for example `scrapeOptions.actions`). */
export interface ApiErrorDetails {
  parameters?: readonly string[]
  formats?: readonly string[]
}

/** Native error body. /fc sends the same fields after `success: false`, with the hints as `agent_hints`. */
export interface ApiErrorBody {
  error: string
  code: ApiErrorCode
  details?: ApiErrorDetails
  /** For a refused option W2L does not offer: the supported route, one sentence each. */
  agentHints?: AgentHints
}

/**
 * The code of the one answer that is not a request error: the request was
 * well formed, and the caller is over the server's per-minute budget
 * (HTTP 429, `Retry-After`). It is not one of API_ERROR_CODES, which name
 * what was wrong with a request.
 */
export const RATE_LIMITED_CODE = 'rate_limited' as const
export const RATE_LIMITED_STATUS = 429

/** The native 429 body; /fc sends `{ success: false, error, code, agent_hints }` with the same header. */
export interface RateLimitedBody {
  error: string
  code: typeof RATE_LIMITED_CODE
  /** Seconds until the window admits a request again, at least 1; also the `Retry-After` header. */
  retryAfterSeconds: number
  agentHints: AgentHints
}

export function rateLimitedBody(perMinute: number, retryAfterSeconds: number): RateLimitedBody {
  return { error: `rate limit exceeded: ${perMinute} requests per minute`, code: RATE_LIMITED_CODE, retryAfterSeconds, agentHints: [`wait ${retryAfterSeconds} s before the next request`] }
}

export class RequestError extends Error {
  readonly status = 400
  constructor(
    message: string,
    readonly code: 'invalid_request' | 'unsupported_parameter' | 'unsupported_format' = 'invalid_request',
    readonly details?: ApiErrorDetails,
    /** The supported route, when the refused option is one W2L does not offer. */
    readonly agentHints?: AgentHints,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

/** The hints a refusal carries for the options W2L does not offer: the next honest step, never a way around the refusal. */
export const REFUSAL_HINTS = {
  stealth: "Octocrawl has no stealth option on a request: a provider's stealth or challenge solving runs only on a server started with an access grant that names it (--access-grant, ADR 0005); a proxy or session you own (mode authed) is the other route",
  ignoreRobotsTxt: 'robots.txt is always read and recorded; on a local server a URL a scrape or batch names is fetched whatever it says, and ignoreRobotsTxt on a crawl or map fetches the links it disallows, on the record',
  hostedSkipTlsVerification: 'a hosted server verifies every certificate; run Octocrawl locally to use skipTlsVerification, which is recorded in the trace and a tls_unverified warning',
  useIndex: 'Octocrawl keeps no URL index: a map reads the sitemaps the site declares and its start page, on the record; crawl reads further pages',
  actions: 'actions run on scrape and batch, where each page named gets the same steps; a crawl or a map does not take them',
} as const

/** The hint for a refused request key, or null when the key has none (an option W2L simply does not know). */
export function refusalHint(key: string, value: unknown): string | null {
  const name = key.slice(key.lastIndexOf('.') + 1)
  if (name === 'stealth' || (name === 'proxy' && (value === 'stealth' || value === 'enhanced'))) return REFUSAL_HINTS.stealth
  if (name === 'ignoreRobotsTxt') return REFUSAL_HINTS.ignoreRobotsTxt
  if (name === 'useIndex') return REFUSAL_HINTS.useIndex
  if (name === 'actions') return REFUSAL_HINTS.actions
  return null
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError('body must be a JSON object')
  }
  return body as Record<string, unknown>
}

export const PAGE_KEYS = ['onlyMainContent', 'waitFor', 'timeout', 'maxFileBytes', 'includeTags', 'excludeTags', 'headers', 'mobile', 'skipTlsVerification', 'fastMode', 'blockAds', 'removeBase64Images', 'parsers', 'maxAge', 'minAge', 'storeInCache', 'lockdown'] as const
export const ATTRIBUTION_KEYS = ['origin', 'integration'] as const
export const SCRAPE_KEYS = ['url', 'mode', 'allowlistedDomains', 'formats', 'includeLinks', 'debug', 'robotsOverride', 'actions', 'handoff', 'lane', 'access', ...PAGE_KEYS, ...ATTRIBUTION_KEYS] as const
/** The lanes a request may ask for by name. */
export const REQUEST_LANES = ['my-browser'] as const
export const CRAWL_SCOPE_KEYS = ['regexOnFullURL', 'ignoreQueryParameters', 'deduplicateSimilarURLs', 'crawlEntireDomain', 'allowSubdomains', 'allowExternalLinks'] as const
export const CRAWL_KEYS = ['url', 'mode', 'access', 'maxPages', 'maxDepth', 'useCached', 'allowlistedDomains', 'formats', 'includeLinks', 'includePaths', 'excludePaths', ...CRAWL_SCOPE_KEYS, 'sitemap', 'maxConcurrency', 'idempotencyKey', 'webhook', 'ignoreRobotsTxt', ...PAGE_KEYS, ...ATTRIBUTION_KEYS] as const
/** Firecrawl's extract scope flags a batch takes in their no-op form (`false`), each with the crawl option that does what `true` would ask for. */
const BATCH_SCOPE_NOOP_KEYS = { allowExternalLinks: 'allowExternalLinks', includeSubdomains: 'allowSubdomains' } as const
export const BATCH_KEYS = ['urls', 'mode', 'lane', 'access', 'formats', 'includeLinks', 'robotsOverrides', 'maxConcurrency', 'ignoreInvalidURLs', 'allowExternalLinks', 'includeSubdomains', 'idempotencyKey', 'appendToId', 'webhook', 'actions', ...PAGE_KEYS, ...ATTRIBUTION_KEYS] as const
/** What a batch body may carry beside `appendToId`: the job's own options are not among them (the scope no-ops change nothing, so they may come along). */
export const BATCH_APPEND_KEYS = ['urls', 'appendToId', 'ignoreInvalidURLs', 'allowExternalLinks', 'includeSubdomains', 'idempotencyKey', 'robotsOverrides', ...ATTRIBUTION_KEYS] as const
const ROBOTS_OVERRIDE_KEYS = ['reason', 'recordedBy'] as const
/** The scope options a map takes under their crawl names; allowSubdomains is includeSubdomains on a map, and allowExternalLinks is not offered. */
export const MAP_SCOPE_KEYS = ['includeSubdomains', 'ignoreQueryParameters', 'regexOnFullURL', 'crawlEntireDomain', 'deduplicateSimilarURLs'] as const
/** What a map takes. No page option (headers, mobile, skipTlsVerification, formats, ...): a map has nothing to loosen. */
export const MAP_KEYS = ['url', 'mode', 'limit', 'timeout', 'search', 'sitemap', ...MAP_SCOPE_KEYS, 'includePaths', 'excludePaths', 'ignoreRobotsTxt', ...ATTRIBUTION_KEYS] as const

/**
 * An option W2L does not know is an error, never silently dropped; `at`
 * names a nested object's place in the request. A refused option W2L does
 * not offer (`stealth`, a stealth `proxy`, `ignoreRobotsTxt` beside a scrape or batch) names the
 * supported route in `agentHints`.
 */
function rejectUnknownKeys(rec: Record<string, unknown>, known: readonly string[], at = ''): void {
  const prefix = at === '' ? '' : `${at}.`
  const unknownKeys = Object.keys(rec).filter((key) => rec[key] !== undefined && !known.includes(key))
  if (unknownKeys.length > 0) {
    const unknown = unknownKeys.map((key) => prefix + key)
    const hints = [...new Set(unknownKeys.map((key) => refusalHint(key, rec[key])).filter((hint): hint is string => hint !== null))]
    throw new RequestError(`unsupported ${unknown.length === 1 ? 'parameter' : 'parameters'}: ${unknown.join(', ')} (supported: ${known.map((key) => prefix + key).join(', ')})`, 'unsupported_parameter', { parameters: unknown }, hints.length === 0 ? undefined : hints)
  }
}

/** A recorded robots override must say why; a bare flag is the blanket switch W2L does not offer. */
function readRobotsOverride(value: unknown, name: string, extraKeys: readonly string[] = []): RobotsOverride {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(`${name} must be an object with a reason`)
  const rec = value as Record<string, unknown>
  rejectUnknownKeys(rec, [...ROBOTS_OVERRIDE_KEYS, ...extraKeys], name)
  if (typeof rec.reason !== 'string' || rec.reason.trim().length === 0 || rec.reason.length > 500) {
    throw new RequestError(`${name}.reason must be a non-empty string of at most 500 characters`)
  }
  if (rec.recordedBy !== undefined && (typeof rec.recordedBy !== 'string' || rec.recordedBy.trim().length === 0 || rec.recordedBy.length > 200)) {
    throw new RequestError(`${name}.recordedBy must be a non-empty string of at most 200 characters`)
  }
  return { reason: rec.reason, ...(rec.recordedBy === undefined ? {} : { recordedBy: rec.recordedBy }) }
}

/** Each override names one of the batch's own URLs, once. */
function readRobotsOverrides(value: unknown, urls: readonly string[]): readonly RobotsUrlOverride[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new RequestError('robotsOverrides must be an array')
  const batchUrls = new Set(urls.map((url) => new URL(url).href))
  const seen = new Set<string>()
  return value.map((item, index) => {
    const name = `robotsOverrides[${index}]`
    const override = readRobotsOverride(item, name, ['url'])
    const url = (item as Record<string, unknown>).url
    if (typeof url !== 'string' || url.length === 0) throw new RequestError(`${name}.url is required`)
    let href: string
    try { href = new URL(url).href } catch { throw new RequestError(`${name}.url must be http(s)`) }
    if (!batchUrls.has(href)) throw new RequestError(`${name}.url is not one of the batch urls`)
    if (seen.has(href)) throw new RequestError(`${name}.url is overridden twice`)
    seen.add(href)
    return { url, ...override }
  })
}

/** An http(s) URL; `name` says which field the refusal is about (`url`, or a batch entry such as `urls[2]`). */
function readUrl(value: unknown, name = 'url'): string {
  if (typeof value !== 'string' || value.length === 0) throw new RequestError(`${name} is required`)
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new RequestError(`${name} must be http(s)`)
    }
  } catch (err) {
    if (err instanceof RequestError) throw err
    throw new RequestError(`${name} must be http(s)`)
  }
  return value
}

/** An idempotency key: 1 to 200 characters, none of them a control character (it is stored and compared, never sent to a site). */
function readIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined) return undefined
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_IDEMPOTENCY_KEY_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RequestError(`idempotencyKey must be a string of 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`)
  }
  return value
}

/** The id of the batch to append to: a non-empty string of at most 200 characters (the engine decides whether such a batch exists). */
function readAppendToId(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new RequestError('appendToId must be a non-empty string')
  return value
}

const WEBHOOK_KEYS = ['url', 'headers', 'metadata', 'events', 'secretEnv'] as const
/** Header names a delivery sets itself: the transport's and W2L's own `x-w2l-*` family. */
const WEBHOOK_RESERVED_HEADERS: ReadonlySet<string> = new Set(['content-type', 'content-length', 'host', 'connection', 'transfer-encoding'])
const WEBHOOK_SECRET_ENV = /^W2L_WEBHOOK_SECRET_[A-Z0-9_]+$/
const WEBHOOK_HEADERS_MESSAGE = `webhook.headers must be an object of at most ${MAX_WEBHOOK_HEADERS} string values`
const WEBHOOK_METADATA_MESSAGE = `webhook.metadata must be an object of at most ${MAX_WEBHOOK_METADATA_ENTRIES} string values of at most ${MAX_WEBHOOK_METADATA_VALUE_LENGTH} characters`
const WEBHOOK_EVENTS_MESSAGE = `webhook.events must be a non-empty array of ${WEBHOOK_EVENTS.join(', ')} without duplicates`

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).byteLength

/** Why a webhook header (lower-cased name) cannot be sent, or null when it can: W2L's own and the transport's names are reserved. */
export function webhookHeaderRefusal(name: string): string | null {
  return WEBHOOK_RESERVED_HEADERS.has(name) || name.startsWith('x-w2l-') ? `webhook.headers: ${name} is reserved` : null
}

/** `webhook.headers`: at most 32 entries of 8 KiB in all, token names given once and lower-cased, values without line breaks, none reserved. */
function readWebhookHeaders(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some((item) => typeof item !== 'string')) throw new RequestError(WEBHOOK_HEADERS_MESSAGE)
  const entries = Object.entries(value as Record<string, string>)
  if (entries.length > MAX_WEBHOOK_HEADERS) throw new RequestError(WEBHOOK_HEADERS_MESSAGE)
  const headers: Record<string, string> = {}
  let bytes = 0
  for (const [given, item] of entries) {
    if (!HEADER_NAME.test(given)) throw new RequestError(`webhook.headers: ${given} is not a valid HTTP header name`)
    const name = given.toLowerCase()
    const refusal = webhookHeaderRefusal(name)
    if (refusal !== null) throw new RequestError(refusal)
    if (name in headers) throw new RequestError(`webhook.headers: ${name} is given twice`)
    if (/[\r\n]/.test(item)) throw new RequestError('webhook.headers value must not contain line breaks')
    bytes += utf8Bytes(name) + utf8Bytes(item)
    headers[name] = item
  }
  if (bytes > MAX_WEBHOOK_HEADERS_BYTES) throw new RequestError(`webhook.headers must be at most ${MAX_WEBHOOK_HEADERS_BYTES} bytes`)
  return headers
}

/** `webhook.metadata`: at most 32 string values of at most 1000 characters, 8 KiB in all, echoed as they are. */
function readWebhookMetadata(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(WEBHOOK_METADATA_MESSAGE)
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MAX_WEBHOOK_METADATA_ENTRIES) throw new RequestError(WEBHOOK_METADATA_MESSAGE)
  let bytes = 0
  for (const [key, item] of entries) {
    if (typeof item !== 'string' || item.length > MAX_WEBHOOK_METADATA_VALUE_LENGTH) throw new RequestError(WEBHOOK_METADATA_MESSAGE)
    bytes += utf8Bytes(key) + utf8Bytes(item)
  }
  if (bytes > MAX_WEBHOOK_METADATA_BYTES) throw new RequestError(WEBHOOK_METADATA_MESSAGE)
  return { ...(value as Record<string, string>) }
}

/** `webhook.events`: a non-empty list of the five names, each once, in the order given. */
function readWebhookEvents(value: unknown): readonly WebhookEvent[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !(WEBHOOK_EVENTS as readonly string[]).includes(item)) || new Set(value).size !== value.length) {
    throw new RequestError(WEBHOOK_EVENTS_MESSAGE)
  }
  return [...(value as WebhookEvent[])]
}

/**
 * The `webhook` of a crawl or batch request: a URL string is `{ url }`, null
 * or undefined is none, an object takes url, headers, metadata, events and
 * secretEnv and nothing else (`unknown webhook option: <key>`). The URL must
 * be http(s) of at most 2048 characters without credentials or a fragment;
 * whether http is admitted (a loopback receiver of a local service) and
 * whether a hosted server takes the address is the engine's, mode-aware check.
 */
export function readWebhook(value: unknown): WebhookConfig | undefined {
  if (value === undefined || value === null) return undefined
  const rec: Record<string, unknown> = typeof value === 'string' ? { url: value } : value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  if (typeof rec.url !== 'string' || rec.url.length === 0) throw new RequestError('webhook must be a URL string or an object with url')
  for (const key of Object.keys(rec)) if (rec[key] !== undefined && !(WEBHOOK_KEYS as readonly string[]).includes(key)) throw new RequestError(`unknown webhook option: ${key}`)
  if (rec.url.length > MAX_WEBHOOK_URL_LENGTH) throw new RequestError(`webhook.url must be at most ${MAX_WEBHOOK_URL_LENGTH} characters`)
  let url: URL
  try {
    url = new URL(rec.url)
  } catch {
    throw new RequestError('webhook.url must be http(s)')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new RequestError('webhook.url must be http(s)')
  if (url.username || url.password || url.hash) throw new RequestError('webhook.url must not carry credentials or a fragment')
  if (rec.secretEnv !== undefined && (typeof rec.secretEnv !== 'string' || !WEBHOOK_SECRET_ENV.test(rec.secretEnv))) throw new RequestError('webhook.secretEnv must name an operator W2L_WEBHOOK_SECRET_* variable')
  const headers = readWebhookHeaders(rec.headers)
  const metadata = readWebhookMetadata(rec.metadata)
  const events = readWebhookEvents(rec.events)
  return {
    url: rec.url,
    ...(headers === undefined ? {} : { headers }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(events === undefined ? {} : { events }),
    ...(rec.secretEnv === undefined ? {} : { secretEnv: rec.secretEnv as string }),
  }
}

/**
 * A batch's `allowExternalLinks` / `includeSubdomains`: `false` is accepted
 * as what already holds (a batch fetches only the URLs given and follows no
 * link); `true` is refused by name, pointing at the crawl option that does it
 * and at the M5 multi-URL extract, never silently honoured or dropped.
 */
function readBatchScopeNoOp(value: unknown, key: keyof typeof BATCH_SCOPE_NOOP_KEYS): false | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new RequestError(`${key} must be a boolean`)
  if (value) throw new RequestError(`${key}: true is not offered on a batch: a batch fetches only the URLs given; a crawl takes ${BATCH_SCOPE_NOOP_KEYS[key]}, and extraction across links is the M5 multi-URL extract`)
  return false
}

/** A batch's `maxConcurrency`: an integer from 1 to 4; the engine lowers it to its worker count, never raises it. */
function readMaxConcurrency(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 4) throw new RequestError(`${name} must be an integer between 1 and 4`)
  return value
}

function readMode(value: unknown): ApiCrawlMode | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !isApiCrawlMode(value)) {
    throw new RequestError('mode must be standard, research, or authed')
  }
  return value
}

function readAllowlist(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new RequestError('allowlistedDomains must be an array of strings')
  }
  return value.filter((item) => item.length > 0)
}

/** What extraction maps values by. */
const SCHEMA_STRUCTURE = ['type', 'properties', 'required', 'items', 'additionalProperties', 'enum', 'const', '$ref', '$defs', 'definitions', 'anyOf', 'oneOf']
/** Assertions checked on the result, never used to fill a value in. */
const SCHEMA_NUMBERS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']
const SCHEMA_COUNTS = ['minLength', 'maxLength', 'minItems', 'maxItems']
/** Accepted and not acted on: `default` is never filled in and `format` is not checked. */
const SCHEMA_ANNOTATIONS = ['title', 'description', '$comment', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'format']
/** Accepted at the root only. */
const SCHEMA_ROOT = ['$schema', '$id']
const SCHEMA_KEYS = new Set([...SCHEMA_STRUCTURE, ...SCHEMA_NUMBERS, ...SCHEMA_COUNTS, 'pattern', 'uniqueItems', ...SCHEMA_ANNOTATIONS])
const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const PRIMITIVE_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])
/** The dialects whose meaning of these keywords W2L follows. */
const SCHEMA_DIALECTS = /^https?:\/\/json-schema\.org\/(?:draft-07\/schema|draft\/2019-09\/schema|draft\/2020-12\/schema)#?$/

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function schemaTypeList(value: unknown): readonly unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

/** The keys of a node other than annotations, root keywords and definitions: what it asserts. */
function assertingKeys(rec: Record<string, unknown>): string[] {
  return Object.keys(rec).filter(key => !SCHEMA_ANNOTATIONS.includes(key) && !SCHEMA_ROOT.includes(key) && key !== '$defs' && key !== 'definitions')
}

/** `{ type: 'null' }`, with annotations at most. */
function isNullSchema(value: unknown): boolean {
  if (!isSchemaObject(value)) return false
  const types = schemaTypeList(value.type)
  return types.length === 1 && types[0] === 'null' && assertingKeys(value).every(key => key === 'type')
}

/** A schema for one or more primitive types or constants: no object, array, reference or union. */
function isPrimitiveSchema(value: unknown): boolean {
  if (!isSchemaObject(value)) return false
  if (['$ref', 'anyOf', 'oneOf', 'properties', 'items', 'additionalProperties', 'required'].some(key => value[key] !== undefined)) return false
  const types = schemaTypeList(value.type)
  return types.length > 0 ? types.every(type => typeof type === 'string' && PRIMITIVE_TYPES.has(type)) : value.const !== undefined || value.enum !== undefined
}

/** The node a local `$ref` names, or undefined. */
function localTarget(root: unknown, ref: string): unknown {
  let value = root
  for (const part of ref === '#' ? [] : ref.slice(2).split('/')) {
    if (!isSchemaObject(value)) return undefined
    let key: string
    try {
      key = decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')
    } catch {
      return undefined
    }
    value = value[key]
  }
  return value
}

/**
 * The JSON Schema subset W2L extraction honours (JsonSchema in structured.ts),
 * bounded to 64 KiB, 8 levels and 100 properties. A keyword outside it is
 * refused as unsupported_parameter, named with its place in the request
 * (`at`, such as `formats[1].schema`); a malformed value as invalid_request.
 */
function readSchema(value: unknown, at = 'schema'): import('./structured.js').JsonSchema {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength
  if (bytes > 64 * 1024) throw new RequestError('json schema must be at most 64 KiB')
  let properties = 0
  const refs: Array<[string, string]> = []
  const unsupported = (where: string, key: string, why: string): never => {
    throw new RequestError(`unsupported json schema keyword: ${key} at ${where} (${why})`, 'unsupported_parameter', { parameters: [`${where}.${key}`] })
  }
  const invalid = (where: string, message: string): never => {
    throw new RequestError(`json schema ${message} (at ${where})`)
  }
  const visit = (node: unknown, depth: number, where: string): void => {
    if (depth > 8) invalid(where, 'must be at most 8 levels deep')
    if (!isSchemaObject(node)) return invalid(where, 'nodes must be objects')
    const rec = node
    for (const key of Object.keys(rec)) {
      if (SCHEMA_ROOT.includes(key)) {
        if (depth > 0) unsupported(where, key, 'only the root may declare it')
      } else if (!SCHEMA_KEYS.has(key)) {
        unsupported(where, key, 'Octocrawl extraction does not support it')
      }
    }
    if (rec.$schema !== undefined && (typeof rec.$schema !== 'string' || !SCHEMA_DIALECTS.test(rec.$schema))) {
      unsupported(where, '$schema', `Octocrawl follows JSON Schema draft-07, 2019-09 and 2020-12, not ${JSON.stringify(rec.$schema)}`)
    }
    if (rec.$id !== undefined && typeof rec.$id !== 'string') invalid(where, '$id must be a string')
    if (rec.$ref !== undefined) {
      if (typeof rec.$ref !== 'string' || (rec.$ref !== '#' && !rec.$ref.startsWith('#/'))) invalid(where, 'only supports local $ref')
      const beside = assertingKeys(rec).find(key => key !== '$ref')
      if (beside !== undefined) unsupported(where, beside, 'beside $ref, which may carry only annotations')
      refs.push([rec.$ref as string, where])
    }
    if (rec.type !== undefined) {
      const types = schemaTypeList(rec.type)
      if (types.length === 0 || types.some(type => typeof type !== 'string' || !SCHEMA_TYPES.has(type))) invalid(where, 'contains an unsupported type')
    }
    if (rec.required !== undefined && (!Array.isArray(rec.required) || rec.required.some(item => typeof item !== 'string'))) invalid(where, 'required must be an array of strings')
    if (rec.enum !== undefined && !Array.isArray(rec.enum)) invalid(where, 'enum must be an array')
    for (const key of SCHEMA_NUMBERS) {
      const number = rec[key]
      if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || (key === 'multipleOf' && number <= 0))) invalid(where, `${key} must be a ${key === 'multipleOf' ? 'positive ' : ''}number`)
    }
    for (const key of SCHEMA_COUNTS) {
      const count = rec[key]
      if (count !== undefined && (typeof count !== 'number' || !Number.isInteger(count) || count < 0)) invalid(where, `${key} must be a non-negative integer`)
    }
    if (rec.pattern !== undefined) {
      if (typeof rec.pattern !== 'string' || rec.pattern.length > 2000) invalid(where, 'pattern must be a regular expression of at most 2000 characters')
      try {
        new RegExp(rec.pattern as string, 'u')
      } catch {
        invalid(where, `pattern is not a valid regular expression: ${rec.pattern as string}`)
      }
      const unsafe = unsafeRegexReason(rec.pattern as string)
      if (unsafe !== null) invalid(where, `pattern can take too long to match (${unsafe}): ${rec.pattern as string}`)
    }
    for (const key of ['title', 'description', '$comment', 'format']) if (rec[key] !== undefined && typeof rec[key] !== 'string') invalid(where, `${key} must be a string`)
    for (const key of ['uniqueItems', 'deprecated', 'readOnly', 'writeOnly']) if (rec[key] !== undefined && typeof rec[key] !== 'boolean') invalid(where, `${key} must be a boolean`)
    if (rec.examples !== undefined && !Array.isArray(rec.examples)) invalid(where, 'examples must be an array')
    if (rec.properties !== undefined) {
      if (!isSchemaObject(rec.properties)) invalid(where, 'properties must be an object')
      for (const [name, child] of Object.entries(rec.properties as Record<string, unknown>)) { properties++; visit(child, depth + 1, `${where}.properties.${name}`) }
    }
    if (properties > 100) throw new RequestError('json schema must contain at most 100 properties')
    if (rec.items !== undefined) {
      if (!isSchemaObject(rec.items)) invalid(where, 'items must be one schema')
      visit(rec.items, depth + 1, `${where}.items`)
    }
    if (rec.additionalProperties !== undefined && typeof rec.additionalProperties !== 'boolean') visit(rec.additionalProperties, depth + 1, `${where}.additionalProperties`)
    for (const key of ['$defs', 'definitions']) {
      if (rec[key] === undefined) continue
      if (!isSchemaObject(rec[key])) invalid(where, `${key} must be an object`)
      for (const [name, child] of Object.entries(rec[key] as Record<string, unknown>)) visit(child, depth + 1, `${where}.${key}.${name}`)
    }
    for (const key of ['anyOf', 'oneOf']) {
      const branches = rec[key]
      if (branches === undefined) continue
      if (!Array.isArray(branches) || branches.length === 0) invalid(where, `${key} must be a non-empty array of schemas`)
      const beside = assertingKeys(rec).find(other => other !== key)
      if (beside !== undefined) unsupported(where, beside, `beside ${key}, which may carry only annotations`)
      // Extraction maps a value by one schema: a schema or null, or primitive types.
      const union = branches as unknown[]
      const nullable = union.length === 2 && union.some(isNullSchema)
      if (!nullable && !union.every(isPrimitiveSchema)) unsupported(where, key, 'Octocrawl maps a schema-or-null union or a union of primitive types, not a union of objects, arrays or references')
      union.forEach((branch, index) => visit(branch, depth + 1, `${where}.${key}[${index}]`))
    }
  }
  visit(value, 0, at)
  for (const [ref, where] of refs) {
    // A reference may name another reference, but must end at a schema.
    let target = localTarget(value, ref)
    const seen = new Set<unknown>()
    while (isSchemaObject(target) && typeof target.$ref === 'string') {
      if (seen.has(target)) invalid(where, `$ref ${ref} leads only to itself`)
      seen.add(target)
      target = localTarget(value, target.$ref)
    }
    if (!isSchemaObject(target)) invalid(where, `$ref does not resolve: ${ref}`)
  }
  return value as import('./structured.js').JsonSchema
}

/** The formats a request names as strings; `attributes` carries its selectors and is named as an object. */
const STRING_FORMATS: readonly string[] = ['markdown', 'links', 'json', 'html', 'rawHtml', 'images', 'tables', 'screenshot']
const FORMAT_NAMES: readonly string[] = [...STRING_FORMATS, 'attributes', 'list']
/** Firecrawl v1's spelling of a full-page screenshot: `{ type: 'screenshot', fullPage: true }`. */
const SCREENSHOT_FULL_PAGE_ALIAS = 'screenshot@fullPage'
const JSON_FORMAT_KEYS: readonly string[] = ['type', 'schema', 'prompt', 'modelFallback']
const ATTRIBUTES_FORMAT_KEYS: readonly string[] = ['type', 'selectors']
const ATTRIBUTE_SELECTOR_KEYS: readonly string[] = ['selector', 'attribute']
const SCREENSHOT_FORMAT_KEYS: readonly string[] = ['type', 'fullPage', 'quality', 'viewport']
const SCREENSHOT_VIEWPORT_KEYS: readonly string[] = ['width', 'height']
/** The smallest window a screenshot may ask for; the largest is the declared screen (`BROWSER_FINGERPRINT.screen`, 1920x1080). */
export const MIN_SCREENSHOT_VIEWPORT = { width: 320, height: 240 } as const
/** An HTML attribute name, as the attributes format reads it. */
const ATTRIBUTE_NAME = /^[A-Za-z_][A-Za-z0-9_:.-]*$/
const ATTRIBUTES_SELECTORS_MESSAGE = 'attributes format requires selectors: an array of 1 to 50 {selector, attribute} entries'
const SCREENSHOT_VIEWPORT_MESSAGE = `screenshot viewport must be {width, height} with integers within ${MIN_SCREENSHOT_VIEWPORT.width}..${BROWSER_FINGERPRINT.screen.width} by ${MIN_SCREENSHOT_VIEWPORT.height}..${BROWSER_FINGERPRINT.screen.height}`
const SCREENSHOT_ENTRIES_MESSAGE = 'formats must contain at most one screenshot entry'
const FORMAT_ENTRY_MESSAGE = 'formats entries must be markdown, links, json, html, rawHtml, images, tables, screenshot, a json schema request, an attributes request or a screenshot request'

/**
 * The selectors of an attributes format: 1 to 50 `{ selector, attribute }`
 * entries, each selector a non-empty string of at most 200 characters
 * (whether it parses, and is one the extractor matches, is checked in the
 * API engine as for `includeTags`) and each attribute an HTML attribute name
 * of at most 100 characters.
 */
const LIST_FORMAT_KEYS: readonly string[] = ['type', 'itemSelector', 'fields']
const LIST_FIELD_KEYS: readonly string[] = ['name', 'selector', 'attribute']
const LIST_ATTRIBUTE = /^[A-Za-z_][A-Za-z0-9_:.-]{0,99}$/

/** `{ type: 'list', itemSelector, fields }`: the selectors' syntax is checked by the engine (invalidSelector), like includeTags. */
function readListFormat(rec: Record<string, unknown>, name: string): ListFormatRequest {
  for (const key of Object.keys(rec)) if (!LIST_FORMAT_KEYS.includes(key)) throw new RequestError(`unsupported list format option: ${key}`)
  const selectorOf = (value: unknown, at: string): string => {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) throw new RequestError(`${at} must be a CSS selector of 1 to 200 characters`)
    return value.trim()
  }
  // Without itemSelector the list is found on the page, and its fields with it: fields alone would name nothing to read them from.
  if (rec.itemSelector === undefined) {
    if (rec.fields !== undefined) throw new RequestError(`${name}.fields needs an itemSelector: without one, Octocrawl finds the list and its fields itself`)
    return { type: 'list' }
  }
  const itemSelector = selectorOf(rec.itemSelector, `${name}.itemSelector`)
  if (rec.fields === undefined) return { type: 'list', itemSelector }
  if (!Array.isArray(rec.fields) || rec.fields.length === 0 || rec.fields.length > 50) throw new RequestError(`${name}.fields must be an array of 1 to 50 {name, selector?, attribute?} entries`)
  const names = new Set<string>()
  const fields = rec.fields.map((value: unknown, i: number): ListField => {
    const at = `${name}.fields[${i}]`
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(`${at} must be {name, selector?, attribute?}`)
    const field = value as Record<string, unknown>
    for (const key of Object.keys(field)) if (!LIST_FIELD_KEYS.includes(key)) throw new RequestError(`${at}: unsupported list field option: ${key}`)
    if (typeof field.name !== 'string' || field.name.trim().length === 0 || field.name.length > 64) throw new RequestError(`${at}.name must be a name of 1 to 64 characters`)
    const fieldName = field.name.trim()
    if (names.has(fieldName)) throw new RequestError(`${at}.name repeats ${fieldName}: field names must be unique`)
    // The CSV adds these columns after the fields: a field of the same name would be shadowed by one of them.
    if (['source_url', 'page', 'index'].includes(fieldName)) throw new RequestError(`${at}.name ${fieldName} is the name of a column the list adds (source_url, page, index): choose another`)
    names.add(fieldName)
    if (field.attribute !== undefined && (typeof field.attribute !== 'string' || !LIST_ATTRIBUTE.test(field.attribute))) throw new RequestError(`${at}.attribute must be an HTML attribute name`)
    return {
      name: fieldName,
      ...(field.selector === undefined ? {} : { selector: selectorOf(field.selector, `${at}.selector`) }),
      ...(field.attribute === undefined ? {} : { attribute: field.attribute as string }),
    }
  })
  return { type: 'list', itemSelector, fields }
}

function readAttributeSelectors(value: unknown): readonly AttributeSelector[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new RequestError(ATTRIBUTES_SELECTORS_MESSAGE)
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new RequestError(ATTRIBUTES_SELECTORS_MESSAGE)
    const rec = entry as Record<string, unknown>
    for (const key of Object.keys(rec)) if (!ATTRIBUTE_SELECTOR_KEYS.includes(key)) throw new RequestError(`unsupported attributes selector option: ${key}`)
    if (typeof rec.selector !== 'string' || rec.selector.trim().length === 0 || rec.selector.length > 200) throw new RequestError(`attributes selectors[${index}].selector must be a non-empty string of at most 200 characters`)
    if (typeof rec.attribute !== 'string' || rec.attribute.length > 100 || !ATTRIBUTE_NAME.test(rec.attribute)) throw new RequestError(`attributes selectors[${index}].attribute must be an HTML attribute name`)
    return { selector: rec.selector.trim(), attribute: rec.attribute }
  })
}

/**
 * A screenshot entry's options: `fullPage` a boolean, `quality` an integer
 * 1 to 100 (a JPEG; unset is a PNG) and `viewport` a `{ width, height }`
 * within the declared screen. A key W2L does not know is refused by name,
 * never dropped. Only the options the entry set are kept.
 */
function readScreenshotFormat(rec: Record<string, unknown>): ScreenshotFormatRequest {
  for (const key of Object.keys(rec)) if (!SCREENSHOT_FORMAT_KEYS.includes(key)) throw new RequestError(`unsupported screenshot format option: ${key}`)
  if (rec.fullPage !== undefined && typeof rec.fullPage !== 'boolean') throw new RequestError('screenshot fullPage must be a boolean')
  if (rec.quality !== undefined && (typeof rec.quality !== 'number' || !Number.isInteger(rec.quality) || rec.quality < 1 || rec.quality > 100)) throw new RequestError('screenshot quality must be an integer between 1 and 100')
  const viewport = readScreenshotViewport(rec.viewport)
  return {
    type: 'screenshot',
    ...(rec.fullPage === undefined ? {} : { fullPage: rec.fullPage }),
    ...(rec.quality === undefined ? {} : { quality: rec.quality }),
    ...(viewport === undefined ? {} : { viewport }),
  }
}

/** `{ width, height }`, integers within the smallest window and the declared desktop screen (with `mobile`, checkScreenshotViewport tightens it to the mobile screen). */
function readScreenshotViewport(value: unknown): ScreenshotViewport | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(SCREENSHOT_VIEWPORT_MESSAGE)
  const rec = value as Record<string, unknown>
  for (const key of Object.keys(rec)) if (!SCREENSHOT_VIEWPORT_KEYS.includes(key)) throw new RequestError(`unsupported screenshot viewport option: ${key}`)
  const { width, height } = rec
  const within = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max
  if (!within(width, MIN_SCREENSHOT_VIEWPORT.width, BROWSER_FINGERPRINT.screen.width) || !within(height, MIN_SCREENSHOT_VIEWPORT.height, BROWSER_FINGERPRINT.screen.height)) throw new RequestError(SCREENSHOT_VIEWPORT_MESSAGE)
  return { width, height }
}

/**
 * A screenshot viewport is a window within the declared screen: the desktop
 * identity's 1920x1080 (readFormats checks it) or, with `mobile`, the mobile
 * identity's 412x915. A window larger than the screen would contradict the
 * identity (identityBundleIssues), so it is refused before anything is fetched.
 */
function checkScreenshotViewport(mobile: boolean | undefined, formats: readonly ScrapeFormat[] | undefined, actions?: readonly PageAction[]): void {
  if (mobile !== true) return
  const screen = browserFingerprintFor('mobile').screen
  // A screenshot step takes a viewport as the screenshot format does.
  for (const format of [...(formats ?? []), ...(actions ?? [])]) {
    if (typeof format !== 'object' || format.type !== 'screenshot' || format.viewport === undefined) continue
    if (format.viewport.width > screen.width || format.viewport.height > screen.height) {
      throw new RequestError(`screenshot viewport ${format.viewport.width}x${format.viewport.height} is not within the declared mobile screen ${screen.width}x${screen.height}`)
    }
  }
}

function readFormats(value: unknown): readonly ScrapeFormat[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) throw new RequestError('formats must be a non-empty array')
  // Name every unsupported format (string or {type}) before any other check.
  const unsupported = new Set<string>()
  for (const item of value) {
    if (item === SCREENSHOT_FULL_PAGE_ALIAS) continue
    const type: unknown = item !== null && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>).type : item
    if (typeof type === 'string' && !FORMAT_NAMES.includes(type)) unsupported.add(type)
  }
  if (unsupported.size > 0) {
    throw new RequestError(`unsupported ${unsupported.size === 1 ? 'format' : 'formats'}: ${[...unsupported].join(', ')} (supported: ${FORMAT_NAMES.join(', ')})`, 'unsupported_format', { formats: [...unsupported] })
  }
  const formats: ScrapeFormat[] = []
  const logical = new Set<string>()
  for (const [index, item] of value.entries()) {
    if (typeof item === 'string') {
      // The attributes format carries its selectors, so it is named as an object.
      if (item === 'attributes') throw new RequestError(ATTRIBUTES_SELECTORS_MESSAGE)
      // One screenshot per request, however it is spelled: the string, Firecrawl v1's full-page alias or an object.
      if (item === 'screenshot' || item === SCREENSHOT_FULL_PAGE_ALIAS) {
        if (logical.has('screenshot')) throw new RequestError(SCREENSHOT_ENTRIES_MESSAGE)
        logical.add('screenshot')
        formats.push(item === 'screenshot' ? 'screenshot' : { type: 'screenshot', fullPage: true })
        continue
      }
      if (!STRING_FORMATS.includes(item)) throw new RequestError(FORMAT_ENTRY_MESSAGE)
      if (logical.has(item)) throw new RequestError('formats must not contain duplicates')
      logical.add(item)
      formats.push(item as ScrapeFormat)
      continue
    }
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new RequestError(FORMAT_ENTRY_MESSAGE)
    const rec = item as Record<string, unknown>
    if (rec.type === 'attributes') {
      for (const key of Object.keys(rec)) if (!ATTRIBUTES_FORMAT_KEYS.includes(key)) throw new RequestError(`unsupported attributes format option: ${key}`)
      if (logical.has('attributes')) throw new RequestError('formats must contain at most one attributes entry')
      logical.add('attributes')
      formats.push({ type: 'attributes', selectors: readAttributeSelectors(rec.selectors) })
      continue
    }
    if (rec.type === 'list') {
      if (logical.has('list')) throw new RequestError('formats must contain at most one list entry')
      logical.add('list')
      formats.push(readListFormat(rec, `formats[${index}]`))
      continue
    }
    if (rec.type === 'screenshot') {
      const screenshot = readScreenshotFormat(rec)
      if (logical.has('screenshot')) throw new RequestError(SCREENSHOT_ENTRIES_MESSAGE)
      logical.add('screenshot')
      formats.push(screenshot)
      continue
    }
    if (rec.type !== 'json') throw new RequestError(FORMAT_ENTRY_MESSAGE)
    for (const key of Object.keys(rec)) if (!JSON_FORMAT_KEYS.includes(key)) throw new RequestError(`unsupported json format option: ${key}`)
    if (rec.schema === undefined) throw new RequestError('json format requires type=json and schema')
    if (logical.has('json')) throw new RequestError('formats must contain at most one json entry')
    if (rec.prompt !== undefined && (typeof rec.prompt !== 'string' || rec.prompt.length > 4000)) throw new RequestError('json prompt must be a string of at most 4000 characters')
    if (rec.modelFallback !== undefined && typeof rec.modelFallback !== 'boolean') throw new RequestError('json modelFallback must be a boolean')
    logical.add('json')
    formats.push({
      type: 'json' as const,
      schema: readSchema(rec.schema, `formats[${index}].schema`),
      ...(rec.prompt === undefined ? {} : { prompt: rec.prompt }),
      ...(rec.modelFallback === undefined ? {} : { modelFallback: rec.modelFallback }),
    })
  }
  return formats
}

function readBound(value: unknown, name: string, min: number): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new RequestError(`${name} must be a number >= ${min}`)
  }
  return value
}

/** `sitemap`: one of include, skip, only. */
function readSitemapMode(value: unknown): SitemapMode | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !(SITEMAP_MODES as readonly string[]).includes(value)) throw new RequestError('sitemap must be include, skip, or only')
  return value as SitemapMode
}

/** `maxConcurrency`: an integer >= 1, or null for the service's worker count; the engine refuses one above that count. */
function readConcurrency(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new RequestError('maxConcurrency must be an integer >= 1')
  return value
}

/**
 * Pathname regexes with Firecrawl's documented bounds: at most 1000 patterns
 * of at most 2000 characters, none that can backtrack catastrophically
 * (unsafeRegexReason).
 */
function readPathPatterns(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 1000 || value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 2000)) {
    throw new RequestError(`${name} must be an array of at most 1000 regular expressions of 1 to 2000 characters`)
  }
  const patterns = value as string[]
  for (const pattern of patterns) {
    try {
      new RegExp(pattern)
    } catch {
      throw new RequestError(`${name} contains an invalid regular expression: ${pattern}`)
    }
    const unsafe = unsafeRegexReason(pattern)
    if (unsafe !== null) throw new RequestError(`${name} contains a regular expression that can take too long to match (${unsafe}): ${pattern}`)
  }
  return patterns
}

function readMilliseconds(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RequestError(`${name} must be an integer number of milliseconds from ${min} to ${max}`)
  }
  return value
}

/**
 * A list of CSS selectors (`includeTags`, `excludeTags`), each trimmed.
 * Whether a selector can be used (it parses, and is one the extractor
 * matches) is checked where a DOM is at hand, in the API engine, which
 * refuses by name one that cannot.
 */
function readSelectors(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || item.trim().length === 0 || item.length > 200)) {
    throw new RequestError(`${name} must be an array of at most 100 CSS selectors of 1 to 200 characters`)
  }
  return (value as string[]).map((item) => item.trim())
}

/** Largest number of custom request headers, and the longest value, a request may carry. */
export const MAX_REQUEST_HEADERS = 32
export const MAX_REQUEST_HEADER_VALUE_LENGTH = 4096
/** An RFC 7230 token: the characters a header name may hold. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/
/** Headers that are the lane's own: the declared identity, credentials and the transport. */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set(['authorization', 'proxy-authorization', 'cookie'])
const TRANSPORT_HEADERS: ReadonlySet<string> = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'keep-alive', 'proxy-connection', 'expect', 'accept-encoding'])

/**
 * Why a request header (lower-cased name) cannot be sent on a caller's
 * behalf, or null when it can. The User-Agent and the client hints are
 * W2L's declared identity, which no option overrides; credentials belong to
 * the authed session path, which the record names; transport headers are
 * the lane's. The lanes apply the same rule to what reaches them.
 */
export function headerRefusal(name: string): string | null {
  if (name === 'user-agent' || name.startsWith('sec-ch-') || name.startsWith('sec-fetch-')) return `headers.${name} is refused: the User-Agent and client hints are Octocrawl's declared identity`
  if (CREDENTIAL_HEADERS.has(name)) return `headers.${name} is refused: credentials are not sent as headers; mode 'authed' carries your own session on the record`
  if (TRANSPORT_HEADERS.has(name)) return `headers.${name} is refused: transport headers are set by the lane`
  return null
}

/**
 * Custom request headers: an object of at most 32 string values, each name
 * an RFC 7230 token given once (lower-cased here), each value at most 4096
 * characters without CR, LF or NUL. A name the lane cannot send on the
 * caller's behalf (headerRefusal) is refused by name.
 */
export function readHeaders(value: unknown, name = 'headers'): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some((item) => typeof item !== 'string')) {
    throw new RequestError(`${name} must be an object of string values`)
  }
  const entries = Object.entries(value as Record<string, string>)
  if (entries.length > MAX_REQUEST_HEADERS) throw new RequestError(`${name} must contain at most ${MAX_REQUEST_HEADERS} entries`)
  const headers: Record<string, string> = {}
  for (const [given, item] of entries) {
    if (!HEADER_NAME.test(given)) throw new RequestError(`${name}.${given} is not a valid header name`)
    const lower = given.toLowerCase()
    const refusal = headerRefusal(lower)
    if (refusal !== null) throw new RequestError(name === 'headers' ? refusal : refusal.replace(/^headers\./, `${name}.`))
    if (lower in headers) throw new RequestError(`${name}.${lower} is given twice`)
    if (item.length > MAX_REQUEST_HEADER_VALUE_LENGTH || /[\r\n\0]/.test(item)) {
      throw new RequestError(`${name}.${lower} must be a string of at most ${MAX_REQUEST_HEADER_VALUE_LENGTH} characters without control characters`)
    }
    headers[lower] = item
  }
  return headers
}

function readBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new RequestError(`${name} must be a boolean`)
  return value
}

/** The characters an attribution label may hold: printable ASCII without spaces, 1 to 100 of them. */
const ATTRIBUTION_LABEL = /^[\x21-\x7e]{1,100}$/

function readLabel(value: unknown, name: 'origin' | 'integration'): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !ATTRIBUTION_LABEL.test(value)) throw new RequestError(`${name} must be a string of 1 to 100 printable characters without spaces`)
  return value
}

/** `origin` and `integration`, those that were set. */
function readAttribution(rec: Record<string, unknown>): RequestAttribution {
  const origin = readLabel(rec.origin, 'origin')
  const integration = readLabel(rec.integration, 'integration')
  return { ...(origin === undefined ? {} : { origin }), ...(integration === undefined ? {} : { integration }) }
}

/** The mobile identity is a browser's; the research identity declares a bot and has no device to emulate. */
function checkMobileMode(mode: ApiCrawlMode | undefined, mobile: boolean | undefined): void {
  if (mode === 'research' && mobile === true) throw new RequestError('mobile is not available in research mode: the research identity declares a bot, not a device')
}

const PDF_PARSER_KEYS = ['type', 'mode', 'maxPages', 'pages', 'pageMarkers'] as const

/**
 * `parsers` (Firecrawl's): an array of at most one `pdf` entry, the string
 * `pdf` or `{ type: "pdf", mode, maxPages, pages, pageMarkers }`; `[]` reads
 * no PDF. W2L reads a PDF's text layer: `mode` is `fast` or `auto`, and
 * `ocr` and the `image` parser are refused by name, as nothing would run them.
 */
function readParsers(value: unknown): readonly PdfParser[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new RequestError('parsers must be an array of "pdf" or { type: "pdf", ... } entries')
  const parsers: PdfParser[] = []
  value.forEach((entry: unknown, index) => {
    const name = `parsers[${index}]`
    const type = typeof entry === 'string' ? entry : entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>).type : undefined
    if (type === 'image') throw new RequestError(`${name} is refused: Octocrawl reads no image as a document (no OCR)`, 'unsupported_parameter', { parameters: [name] })
    if (type !== 'pdf') throw new RequestError(`${name} must be "pdf" or { type: "pdf", mode, maxPages, pages, pageMarkers }`)
    if (parsers.length > 0) throw new RequestError('parsers must contain at most one pdf entry')
    if (typeof entry === 'string') { parsers.push({ type: 'pdf' }); return }
    const rec = entry as Record<string, unknown>
    rejectUnknownKeys(rec, PDF_PARSER_KEYS, name)
    if (rec.mode === 'ocr') throw new RequestError(`${name}.mode "ocr" is refused: Octocrawl reads a PDF's text layer and runs no OCR`, 'unsupported_parameter', { parameters: [`${name}.mode`] })
    if (rec.mode !== undefined && rec.mode !== 'fast' && rec.mode !== 'auto') throw new RequestError(`${name}.mode must be "fast" or "auto"`)
    const maxPages = rec.maxPages
    if (maxPages !== undefined && (typeof maxPages !== 'number' || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PDF_PAGES)) {
      throw new RequestError(`${name}.maxPages must be an integer from 1 to ${MAX_PDF_PAGES}`)
    }
    const pages = readBoolean(rec.pages, `${name}.pages`)
    const pageMarkers = readBoolean(rec.pageMarkers, `${name}.pageMarkers`)
    parsers.push({
      type: 'pdf',
      ...(rec.mode === undefined ? {} : { mode: rec.mode as 'fast' | 'auto' }),
      ...(maxPages === undefined ? {} : { maxPages: maxPages as number }),
      ...(pages === undefined ? {} : { pages }),
      ...(pageMarkers === undefined ? {} : { pageMarkers }),
    })
  })
  return parsers
}

/**
 * The cache options: `maxAge` and `minAge` from 0 to MAX_CACHE_AGE_MS with
 * `minAge` at most `maxAge`, `storeInCache` and `lockdown`; a `lockdown`
 * with `maxAge: 0` asks for a stored result it forbids, and mode `authed`
 * neither looks up nor stores, so it refuses a lookup by name.
 */
function readCacheOptions(rec: Record<string, unknown>, mode: ApiCrawlMode | undefined): CacheOptions {
  const maxAge = readMilliseconds(rec.maxAge, 'maxAge', 0, MAX_CACHE_AGE_MS)
  const minAge = readMilliseconds(rec.minAge, 'minAge', 0, MAX_CACHE_AGE_MS)
  const storeInCache = readBoolean(rec.storeInCache, 'storeInCache')
  const lockdown = readBoolean(rec.lockdown, 'lockdown')
  if (maxAge !== undefined && minAge !== undefined && minAge > maxAge) throw new RequestError('minAge must be at most maxAge')
  if (lockdown === true && maxAge === 0) throw new RequestError('lockdown answers from the cache alone, which maxAge 0 forbids: leave maxAge out or set it above 0')
  const options: CacheOptions = {
    ...(maxAge === undefined ? {} : { maxAge }),
    ...(minAge === undefined ? {} : { minAge }),
    ...(storeInCache === undefined ? {} : { storeInCache }),
    ...(lockdown === undefined ? {} : { lockdown }),
  }
  if (mode === 'authed' && cacheLookupRequested(options)) throw new RequestError("the cache is not available in mode 'authed': a page read with your session is never stored or reused")
  return options
}

/** onlyMainContent, waitFor, timeout, maxFileBytes, includeTags, excludeTags, headers, mobile, skipTlsVerification, fastMode, blockAds, removeBase64Images and the cache options, shared by scrape, batch and crawl. */
function readPageOptions(rec: Record<string, unknown>, mode: ApiCrawlMode | undefined): PageOptions {
  if (rec.onlyMainContent !== undefined && typeof rec.onlyMainContent !== 'boolean') throw new RequestError('onlyMainContent must be a boolean')
  const maxFileBytes = rec.maxFileBytes
  if (maxFileBytes !== undefined && (typeof maxFileBytes !== 'number' || !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > MAX_FILE_BYTES_CEILING)) {
    throw new RequestError(`maxFileBytes must be an integer number of bytes from 1 to ${MAX_FILE_BYTES_CEILING}`)
  }
  const includeTags = readSelectors(rec.includeTags, 'includeTags')
  const excludeTags = readSelectors(rec.excludeTags, 'excludeTags')
  const headers = readHeaders(rec.headers)
  const mobile = readBoolean(rec.mobile, 'mobile')
  const skipTlsVerification = readBoolean(rec.skipTlsVerification, 'skipTlsVerification')
  const fastMode = readBoolean(rec.fastMode, 'fastMode')
  const blockAds = readBoolean(rec.blockAds, 'blockAds')
  const removeBase64Images = readBoolean(rec.removeBase64Images, 'removeBase64Images')
  const parsers = readParsers(rec.parsers)
  const actions = readActions(rec.actions)
  const cache = readCacheOptions(rec, mode)
  // A page after actions is that run's page: it is never stored, and never answered from a page stored without them.
  if (actions !== undefined && (cacheLookupRequested(cache) || cache.storeInCache === true)) throw new RequestError('the cache is not available with actions: a page after actions is never stored or reused')
  // A script in a page read with the person's session could read that session's cookies and storage; clicks, typing and scrolling stay available.
  if (mode === 'authed' && actions?.some((action) => action.type === 'executeJavascript')) throw new RequestError("executeJavascript is not available in mode 'authed': a script could read your session's cookies and storage; click, write, press, scroll and the list steps are")
  return {
    onlyMainContent: rec.onlyMainContent as boolean | undefined,
    waitFor: readMilliseconds(rec.waitFor, 'waitFor', 0, MAX_WAIT_FOR_MS),
    timeout: readMilliseconds(rec.timeout, 'timeout', MIN_SCRAPE_TIMEOUT_MS, DEFAULT_SCRAPE_TIMEOUT_MS),
    ...(maxFileBytes === undefined ? {} : { maxFileBytes: maxFileBytes as number }),
    ...(includeTags === undefined ? {} : { includeTags }),
    ...(excludeTags === undefined ? {} : { excludeTags }),
    ...(headers === undefined ? {} : { headers }),
    ...(mobile === undefined ? {} : { mobile }),
    ...(skipTlsVerification === undefined ? {} : { skipTlsVerification }),
    ...(fastMode === undefined ? {} : { fastMode }),
    ...(blockAds === undefined ? {} : { blockAds }),
    ...(removeBase64Images === undefined ? {} : { removeBase64Images }),
    ...(parsers === undefined ? {} : { parsers }),
    ...(actions === undefined ? {} : { actions }),
    ...cache,
  }
}

const ACTION_KEYS: Readonly<Record<PageAction['type'], readonly string[]>> = {
  wait: ['milliseconds', 'selector'],
  click: ['selector', 'all'],
  write: ['text'],
  press: ['key'],
  scroll: ['direction', 'selector'],
  screenshot: ['fullPage', 'quality', 'viewport'],
  scrape: [],
  executeJavascript: ['script'],
  pdf: ['format', 'landscape', 'scale'],
  scrollToEnd: ['selector', 'itemSelector', 'maxScrolls', 'waitMs'],
  loadMore: ['selector', 'itemSelector', 'maxClicks', 'waitMs'],
  paginate: ['nextSelector', 'itemSelector', 'maxPages', 'waitMs'],
}

/** `actions`: 1 to MAX_ACTIONS steps, each Firecrawl's shape, checked before anything is fetched. */
function readActions(value: unknown): readonly PageAction[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ACTIONS) throw new RequestError(`actions must be an array of 1 to ${MAX_ACTIONS} steps`)
  return value.map((item, index) => readAction(item, `actions[${index}]`))
}

function readAction(value: unknown, name: string): PageAction {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(`${name} must be an object with a type`)
  const rec = value as Record<string, unknown>
  const type = rec.type
  if (typeof type !== 'string' || !Object.hasOwn(ACTION_KEYS, type)) throw new RequestError(`${name}.type must be one of ${Object.keys(ACTION_KEYS).join(', ')}`)
  const allowed = ACTION_KEYS[type as PageAction['type']]
  for (const key of Object.keys(rec)) if (key !== 'type' && !allowed.includes(key)) throw new RequestError(`${name}: ${type} takes no ${key}`)
  const selector = (key: string, required: boolean): string | undefined => {
    const raw = rec[key]
    if (raw === undefined && !required) return undefined
    if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > 200) throw new RequestError(`${name}.${key} must be a CSS selector of 1 to 200 characters`)
    return raw.trim()
  }
  switch (type) {
    case 'wait': {
      if ((rec.milliseconds === undefined) === (rec.selector === undefined)) throw new RequestError(`${name}: wait takes milliseconds or a selector, one of them`)
      if (rec.selector !== undefined) return { type, selector: selector('selector', true)! }
      return { type, milliseconds: readMilliseconds(rec.milliseconds, `${name}.milliseconds`, 1, MAX_ACTION_WAIT_MS)! }
    }
    case 'click': {
      const all = readBoolean(rec.all, `${name}.all`)
      return { type, selector: selector('selector', true)!, ...(all === undefined ? {} : { all }) }
    }
    case 'write':
      if (typeof rec.text !== 'string' || rec.text.length === 0 || rec.text.length > MAX_ACTION_TEXT_CHARS) throw new RequestError(`${name}.text must be a string of 1 to ${MAX_ACTION_TEXT_CHARS} characters`)
      return { type, text: rec.text }
    case 'press':
      if (typeof rec.key !== 'string' || rec.key.trim().length === 0 || rec.key.length > 64) throw new RequestError(`${name}.key must be a key name of 1 to 64 characters (Enter, Tab, ArrowDown, a, ...)`)
      return { type, key: rec.key.trim() }
    case 'scroll': {
      // Firecrawl v1 left the direction out for down; v2 requires it.
      const direction = rec.direction ?? 'down'
      if (direction !== 'up' && direction !== 'down') throw new RequestError(`${name}.direction must be up or down`)
      const within = selector('selector', false)
      return { type, direction, ...(within === undefined ? {} : { selector: within }) }
    }
    case 'screenshot': {
      const shot = readScreenshotFormat({ ...rec, type: 'screenshot' })
      const { type: _type, ...options } = shot
      return { type: 'screenshot', ...options }
    }
    case 'scrape':
      return { type }
    case 'executeJavascript':
      if (typeof rec.script !== 'string' || rec.script.trim().length === 0 || rec.script.length > MAX_ACTION_SCRIPT_CHARS) throw new RequestError(`${name}.script must be a script of 1 to ${MAX_ACTION_SCRIPT_CHARS} characters`)
      return { type, script: rec.script }
    case 'scrollToEnd':
    case 'loadMore':
    case 'paginate': {
      const count = (key: string, max: number): number | undefined => {
        const value = rec[key]
        if (value === undefined) return undefined
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) throw new RequestError(`${name}.${key} must be an integer from 1 to ${max}`)
        return value
      }
      const waitMs = readMilliseconds(rec.waitMs, `${name}.waitMs`, LIST_WAIT_MS.min, LIST_WAIT_MS.max)
      const itemSelector = selector('itemSelector', false)
      const common = { ...(itemSelector === undefined ? {} : { itemSelector }), ...(waitMs === undefined ? {} : { waitMs }) }
      if (type === 'scrollToEnd') {
        const within = selector('selector', false)
        const maxScrolls = count('maxScrolls', MAX_LIST_ROUNDS)
        return { type, ...(within === undefined ? {} : { selector: within }), ...common, ...(maxScrolls === undefined ? {} : { maxScrolls }) }
      }
      if (type === 'loadMore') {
        const maxClicks = count('maxClicks', MAX_LIST_ROUNDS)
        return { type, selector: selector('selector', true)!, ...common, ...(maxClicks === undefined ? {} : { maxClicks }) }
      }
      const maxPages = count('maxPages', MAX_LIST_PAGES)
      return { type: 'paginate', nextSelector: selector('nextSelector', true)!, ...common, ...(maxPages === undefined ? {} : { maxPages }) }
    }
    default: {
      // pdf
      if (rec.format !== undefined && !(PDF_PAPER_FORMATS as readonly unknown[]).includes(rec.format)) throw new RequestError(`${name}.format must be one of ${PDF_PAPER_FORMATS.join(', ')}`)
      const landscape = readBoolean(rec.landscape, `${name}.landscape`)
      if (rec.scale !== undefined && (typeof rec.scale !== 'number' || !Number.isFinite(rec.scale) || rec.scale < 0.1 || rec.scale > 2)) throw new RequestError(`${name}.scale must be a number from 0.1 to 2`)
      return { type: 'pdf', ...(rec.format === undefined ? {} : { format: rec.format as PdfPaperFormat }), ...(landscape === undefined ? {} : { landscape }), ...(rec.scale === undefined ? {} : { scale: rec.scale as number }) }
    }
  }
}

export function parseScrapeRequest(body: unknown): ScrapeRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, SCRAPE_KEYS)
  if (rec.debug !== undefined && typeof rec.debug !== 'boolean') throw new RequestError('debug must be a boolean')
  if (rec.includeLinks !== undefined && typeof rec.includeLinks !== 'boolean') throw new RequestError('includeLinks must be a boolean')
  const robotsOverride = rec.robotsOverride === undefined ? undefined : readRobotsOverride(rec.robotsOverride, 'robotsOverride')
  if (rec.handoff !== undefined && typeof rec.handoff !== 'boolean' && (rec.handoff === null || typeof rec.handoff !== 'object' || Array.isArray(rec.handoff))) throw new RequestError('handoff must be true or { waitMs }')
  const handoff = rec.handoff === undefined || rec.handoff === false ? undefined : rec.handoff === true ? {} : parseBatchHandoffRequest(rec.handoff)
  const choice = readAccessChoice(rec, true)
  const mode = readMode(rec.mode)
  const page = readPageOptions(rec, mode)
  checkMobileMode(mode, page.mobile)
  const req: ScrapeRequest = {
    url: readUrl(rec.url),
    mode,
    allowlistedDomains: readAllowlist(rec.allowlistedDomains),
    formats: readFormats(rec.formats),
    includeLinks: rec.includeLinks as boolean | undefined,
    debug: rec.debug as boolean | undefined,
    ...page,
    ...(robotsOverride === undefined ? {} : { robotsOverride }),
    ...(handoff === undefined ? {} : { handoff }),
    ...choice,
    ...readAttribution(rec),
  }
  checkScreenshotViewport(req.mobile, req.formats, req.actions)
  return req
}

export function parseCrawlStartRequest(body: unknown): CrawlStartRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, CRAWL_KEYS)
  const useCached = rec.useCached
  if (useCached !== undefined && typeof useCached !== 'boolean') {
    throw new RequestError('useCached must be a boolean')
  }
  if (rec.includeLinks !== undefined && typeof rec.includeLinks !== 'boolean') throw new RequestError('includeLinks must be a boolean')
  const mode = readMode(rec.mode)
  // A crawl follows every link it finds, a sign-out link included, and the
  // saved login is the user's live Chrome session: one such fetch would
  // sign them out there too. A batch fetches only the pages it names.
  if (mode === 'authed') throw new RequestError('mode authed is not available for crawl: a crawl follows every link, and a sign-out link would end your session in Chrome too; list the pages and send them as a batch in mode authed')
  const page = readPageOptions(rec, mode)
  checkMobileMode(mode, page.mobile)
  const allowlistedDomains = readAllowlist(rec.allowlistedDomains)
  const scope: Partial<Record<(typeof CRAWL_SCOPE_KEYS)[number], boolean>> = {}
  for (const key of CRAWL_SCOPE_KEYS) {
    const value = readBoolean(rec[key], key)
    if (value !== undefined) scope[key] = value
  }
  // Either the hosts to follow are listed, or every host is followed; both at once contradict each other.
  if (scope.allowExternalLinks === true && allowlistedDomains !== undefined && allowlistedDomains.length > 0) {
    throw new RequestError('allowExternalLinks cannot be combined with allowlistedDomains')
  }
  const sitemap = readSitemapMode(rec.sitemap)
  // A sitemap is fetched, never cached: a crawl that may fetch nothing reads none, and says so.
  if (page.lockdown === true && sitemap !== 'skip') throw new RequestError('lockdown fetches nothing, so a crawl in it reads no sitemap: set sitemap to "skip"')
  const maxConcurrency = readConcurrency(rec.maxConcurrency)
  const idempotencyKey = readIdempotencyKey(rec.idempotencyKey)
  const webhook = readWebhook(rec.webhook)
  const ignoreRobotsTxt = readBoolean(rec.ignoreRobotsTxt, 'ignoreRobotsTxt')
  const { access } = readAccessChoice(rec, false)
  const req: CrawlStartRequest = {
    url: readUrl(rec.url),
    mode,
    ...(access === undefined ? {} : { access: access as Exclude<AccessChoice, 'my-browser'> }),
    maxPages: readBound(rec.maxPages, 'maxPages', 1),
    maxDepth: readBound(rec.maxDepth, 'maxDepth', 0),
    useCached,
    allowlistedDomains,
    formats: readFormats(rec.formats),
    includeLinks: rec.includeLinks as boolean | undefined,
    includePaths: readPathPatterns(rec.includePaths, 'includePaths'),
    excludePaths: readPathPatterns(rec.excludePaths, 'excludePaths'),
    ...scope,
    ...(sitemap === undefined ? {} : { sitemap }),
    ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(webhook === undefined ? {} : { webhook }),
    ...(ignoreRobotsTxt === undefined ? {} : { ignoreRobotsTxt }),
    ...page,
    ...readAttribution(rec),
  }
  checkScreenshotViewport(req.mobile, req.formats)
  return req
}

/** `search`: a string of 1 to MAP_SEARCH_MAX_CHARS characters after trimming, with at most MAP_SEARCH_MAX_WORDS words; returned trimmed. */
function readMapSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length === 0 || trimmed.length > MAP_SEARCH_MAX_CHARS || trimmed.split(/\s+/).length > MAP_SEARCH_MAX_WORDS) {
    throw new RequestError(`search must be a string of 1 to ${MAP_SEARCH_MAX_CHARS} characters with at most ${MAP_SEARCH_MAX_WORDS} words`)
  }
  return trimmed
}

/**
 * A map request: url, mode (standard or research), limit, timeout, search,
 * sitemap, includeSubdomains, the crawl's scope options under their crawl
 * names (ignoreQueryParameters, includePaths, excludePaths, regexOnFullURL,
 * crawlEntireDomain, deduplicateSimilarURLs), ignoreRobotsTxt, origin and
 * integration. Anything else is refused by name, `useIndex` with the supported route;
 * nothing is silently ignored.
 */
export function parseMapRequest(body: unknown): MapRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, MAP_KEYS)
  if (rec.mode === 'authed') throw new RequestError('mode authed is not available for map: a map reads public sitemaps and one public page')
  if (rec.mode !== undefined && rec.mode !== 'standard' && rec.mode !== 'research') throw new RequestError('mode must be standard or research')
  const limit = rec.limit
  if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_MAP_LIMIT)) {
    throw new RequestError(`limit must be an integer from 1 to ${MAX_MAP_LIMIT}`)
  }
  const timeout = readMilliseconds(rec.timeout, 'timeout', MIN_SCRAPE_TIMEOUT_MS, MAX_MAP_TIMEOUT_MS)
  const search = readMapSearch(rec.search)
  const sitemap = readSitemapMode(rec.sitemap)
  const scope: Partial<Record<(typeof MAP_SCOPE_KEYS)[number], boolean>> = {}
  for (const key of MAP_SCOPE_KEYS) {
    const value = readBoolean(rec[key], key)
    if (value !== undefined) scope[key] = value
  }
  const includePaths = readPathPatterns(rec.includePaths, 'includePaths')
  const excludePaths = readPathPatterns(rec.excludePaths, 'excludePaths')
  const ignoreRobotsTxt = readBoolean(rec.ignoreRobotsTxt, 'ignoreRobotsTxt')
  return {
    url: readUrl(rec.url),
    ...(rec.mode === undefined ? {} : { mode: rec.mode }),
    ...(limit === undefined ? {} : { limit: limit as number }),
    ...(timeout === undefined ? {} : { timeout }),
    ...(search === undefined ? {} : { search }),
    ...(sitemap === undefined ? {} : { sitemap }),
    ...scope,
    ...(includePaths === undefined ? {} : { includePaths }),
    ...(excludePaths === undefined ? {} : { excludePaths }),
    ...(ignoreRobotsTxt === undefined ? {} : { ignoreRobotsTxt }),
    ...readAttribution(rec),
  }
}

/**
 * A batch entry that is not an http(s) URL is refused by its index
 * (`urls[2] must be http(s)`), or with `ignoreInvalidURLs` collected into
 * `invalidURLs` instead; an entry that is not a string is refused either
 * way. The 1..1000 cap counts the submitted entries; `requested` later
 * counts the valid ones. With `appendToId` the body may carry only the
 * entries to add and what binds to them: an option of the job itself is
 * refused by name (`appendToId keeps the job's options; formats cannot be
 * changed`).
 */
export function parseBatchStartRequest(body: unknown): ParsedBatchStartRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, BATCH_KEYS)
  const appendToId = readAppendToId(rec.appendToId)
  if (appendToId !== undefined) {
    const changed = BATCH_KEYS.find((key) => rec[key] !== undefined && !(BATCH_APPEND_KEYS as readonly string[]).includes(key))
    if (changed !== undefined) throw new RequestError(`appendToId keeps the job's options; ${changed} cannot be changed`)
  }
  const idempotencyKey = readIdempotencyKey(rec.idempotencyKey)
  if (!Array.isArray(rec.urls) || rec.urls.length < 1 || rec.urls.length > 1000) {
    throw new RequestError('urls must contain 1 to 1000 URLs')
  }
  const ignoreInvalidURLs = readBoolean(rec.ignoreInvalidURLs, 'ignoreInvalidURLs')
  const urls: string[] = []
  const invalidURLs: string[] = []
  rec.urls.forEach((entry: unknown, index: number) => {
    const name = `urls[${index}]`
    if (typeof entry !== 'string') throw new RequestError(`${name} must be a string`)
    try {
      urls.push(readUrl(entry, name))
    } catch (error) {
      if (ignoreInvalidURLs !== true || !(error instanceof RequestError)) throw error
      invalidURLs.push(entry)
    }
  })
  if (urls.length === 0) throw new RequestError('urls must contain at least one valid URL')
  if (new Set(urls.map(url => new URL(url).href)).size !== urls.length) throw new RequestError('urls must be unique')
  if (rec.includeLinks !== undefined && typeof rec.includeLinks !== 'boolean') throw new RequestError('includeLinks must be a boolean')
  const robotsOverrides = readRobotsOverrides(rec.robotsOverrides, urls)
  const maxConcurrency = readMaxConcurrency(rec.maxConcurrency, 'maxConcurrency')
  const allowExternalLinks = readBatchScopeNoOp(rec.allowExternalLinks, 'allowExternalLinks')
  const includeSubdomains = readBatchScopeNoOp(rec.includeSubdomains, 'includeSubdomains')
  const webhook = readWebhook(rec.webhook)
  const mode = readMode(rec.mode)
  // Pages read with the person's session stay with the caller: a webhook would send them to another address.
  if (mode === 'authed' && webhook !== undefined) throw new RequestError("webhook is not available in mode 'authed': pages read with your session are not sent to another address; read them from the batch")
  const choice = readAccessChoice(rec, true)
  if (choice.lane !== undefined && webhook !== undefined) throw new RequestError('webhook is not available on lane my-browser: pages read in your own Chrome are not sent to another address; read them from the batch', 'unsupported_parameter', { parameters: ['lane', 'webhook'] })
  const page = readPageOptions(rec, mode)
  checkMobileMode(mode, page.mobile)
  const req: ParsedBatchStartRequest = {
    urls, mode, formats: readFormats(rec.formats), includeLinks: rec.includeLinks as boolean | undefined,
    ...page,
    ...(robotsOverrides === undefined ? {} : { robotsOverrides }),
    ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
    ...(ignoreInvalidURLs === undefined ? {} : { ignoreInvalidURLs }),
    ...(ignoreInvalidURLs === true ? { invalidURLs } : {}),
    ...(allowExternalLinks === undefined ? {} : { allowExternalLinks }),
    ...(includeSubdomains === undefined ? {} : { includeSubdomains }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(appendToId === undefined ? {} : { appendToId }),
    ...(webhook === undefined ? {} : { webhook }),
    ...choice,
    ...readAttribution(rec),
  }
  checkScreenshotViewport(req.mobile, req.formats, req.actions)
  return req
}

/** `GET /v1/batches/:id/errors`: `cursor` and `limit` (1 to 1000) from the query string. */
export function parseBatchErrorsQuery(query: Record<string, string | undefined>): BatchErrorsQuery {
  const limit = query.limit === undefined ? undefined : Number(query.limit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > BATCH_ERRORS_MAX_LIMIT)) {
    throw new RequestError(`limit must be an integer between 1 and ${BATCH_ERRORS_MAX_LIMIT}`)
  }
  if (query.cursor !== undefined && query.cursor.length === 0) throw new RequestError('cursor must not be empty')
  return { ...(query.cursor === undefined ? {} : { cursor: query.cursor }), ...(limit === undefined ? {} : { limit }) }
}

export function parseCrawlPageQuery(query: Record<string, string | undefined>): CrawlPageQuery {
  const limitValue = query.limit
  const limit = limitValue === undefined ? undefined : Number(limitValue)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) {
    throw new RequestError('limit must be an integer between 1 and 1000')
  }
  if (query.cursor !== undefined && query.cursor.length === 0) throw new RequestError('cursor must not be empty')
  if (query.attemptId !== undefined && query.attemptId.length === 0) throw new RequestError('attemptId must not be empty')
  if (query.debug !== undefined && query.debug !== 'true' && query.debug !== 'false') throw new RequestError('debug must be true or false')
  if (query.includeDuplicates !== undefined && query.includeDuplicates !== 'true' && query.includeDuplicates !== 'false') throw new RequestError('includeDuplicates must be true or false')
  return {
    cursor: query.cursor,
    limit,
    attemptId: query.attemptId,
    debug: query.debug === undefined ? undefined : query.debug === 'true',
    ...(query.includeDuplicates === undefined ? {} : { includeDuplicates: query.includeDuplicates === 'true' }),
  }
}
