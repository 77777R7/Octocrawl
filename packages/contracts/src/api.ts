/**
 * Native REST contract for scrape + crawl.
 *
 * Request fields match the product CLI. Responses are FetchResult /
 * CrawlReport — no second result enum. Types only.
 */

import { BROWSER_FINGERPRINT, browserFingerprintFor, type CrawlMode, type RobotsOverride } from './compliance.js'
import type { CrawlError, CrawlPage, CrawlPageList, CrawlReport, SitemapMode } from './crawl.js'
import { SITEMAP_MODES } from './crawl.js'
import type { FetchOptions } from './execution.js'
import type { FetchResult, FetchWarning, LadderRunAudit } from './result.js'
import { unsafeRegexReason } from './regexSafety.js'
import type { DocumentExtraction, PageMetadata } from './extractor.js'
import type { EvidenceRecord } from './evidenceRecord.js'
import type { AttributeSelector, ScrapeFormat, ScreenshotFormatRequest, ScreenshotViewport, StructuredExtractionResult } from './structured.js'
import { MAX_FILE_BYTES_CEILING } from './file.js'

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
export interface PageOptions extends Omit<FetchOptions, 'robotsOverride' | 'includeHtml' | 'includeRawHtml' | 'includeImages' | 'attributes' | 'screenshot'> {
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
export type ScrapeResponse = ScrapeRun & { scrapeId: string; metadata: ScrapeResponseMetadata; snapshot?: CompactScrapeResponse['snapshot']; evidenceRecord?: EvidenceRecord }

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
  formats: readonly ('markdown' | 'html' | 'rawHtml' | 'links' | 'json' | 'images' | 'attributes' | 'screenshot')[]
  markdown?: string | null
  /** Present when `html` was asked for, as on the full response; null when the result carries none (a file, a page that was not read as content). */
  html?: string | null
  /** Present when `rawHtml` was asked for, as on the full response; null when the result carries none. */
  rawHtml?: string | null
  links?: readonly string[]
  /** Present when `images` was asked for and the page was read as content: every image URL of the whole document, as on the full response. */
  images?: readonly string[]
  /** Present when an `attributes` entry was asked for and the page was read as content, as on the full response. */
  attributes?: FetchResult['attributes']
  /** Present when a `screenshot` entry was asked for, as on the full response: the capture, or null when the browser lane rendered no page or could not capture it. */
  screenshot?: FetchResult['screenshot']
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
  /** Present when the request itself left something on the table (`fastMode` declined a browser hop the http lane asked for), as on the full response. */
  agentHints?: AgentHints
  truncated: boolean
  truncatedAt: number | null
  usage: FetchResult['usage'] & { totalMs: number }
  channelsTried: readonly string[]
}

export interface CrawlStartRequest extends PageOptions, RequestAttribution {
  url: string
  mode?: ApiCrawlMode
  maxPages?: number | null
  maxDepth?: number | null
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
}

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
}

/** What the parser hands the engine: the request plus, when `ignoreInvalidURLs` was on, the entries it skipped (possibly none). */
export type ParsedBatchStartRequest = BatchStartRequest & { invalidURLs?: readonly string[] }

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
  /** The cap in force: the request's `maxConcurrency` or the service's worker count, whichever is lower. */
  maxConcurrency: number
  /** The entries `ignoreInvalidURLs` skipped at submission; present exactly when the option was on. */
  invalidURLs?: readonly string[]
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
  stealth: "W2L does not offer a stealth mode or stealth proxies: every fetch declares W2L's identity; a proxy or session you own (mode authed) is the supported route",
  ignoreRobotsTxt: 'robots.txt is always read; a robotsOverride with a recorded reason fetches one URL past its rule, on the record',
  hostedSkipTlsVerification: 'a hosted server verifies every certificate; run W2L locally to use skipTlsVerification, which is recorded in the trace and a tls_unverified warning',
} as const

/** The hint for a refused request key, or null when the key has none (an option W2L simply does not know). */
export function refusalHint(key: string, value: unknown): string | null {
  const name = key.slice(key.lastIndexOf('.') + 1)
  if (name === 'stealth' || (name === 'proxy' && (value === 'stealth' || value === 'enhanced'))) return REFUSAL_HINTS.stealth
  if (name === 'ignoreRobotsTxt') return REFUSAL_HINTS.ignoreRobotsTxt
  return null
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError('body must be a JSON object')
  }
  return body as Record<string, unknown>
}

const PAGE_KEYS = ['onlyMainContent', 'waitFor', 'timeout', 'maxFileBytes', 'includeTags', 'excludeTags', 'headers', 'mobile', 'skipTlsVerification', 'fastMode', 'blockAds', 'removeBase64Images'] as const
const ATTRIBUTION_KEYS = ['origin', 'integration'] as const
const SCRAPE_KEYS = ['url', 'mode', 'allowlistedDomains', 'formats', 'includeLinks', 'debug', 'robotsOverride', ...PAGE_KEYS, ...ATTRIBUTION_KEYS] as const
const CRAWL_SCOPE_KEYS = ['regexOnFullURL', 'ignoreQueryParameters', 'deduplicateSimilarURLs', 'crawlEntireDomain', 'allowSubdomains', 'allowExternalLinks'] as const
const CRAWL_KEYS = ['url', 'mode', 'maxPages', 'maxDepth', 'useCached', 'allowlistedDomains', 'formats', 'includeLinks', 'includePaths', 'excludePaths', ...CRAWL_SCOPE_KEYS, 'sitemap', 'maxConcurrency', 'idempotencyKey', ...PAGE_KEYS, ...ATTRIBUTION_KEYS] as const
const BATCH_KEYS = ['urls', 'mode', 'formats', 'includeLinks', 'robotsOverrides', 'maxConcurrency', 'ignoreInvalidURLs', 'idempotencyKey', 'appendToId', ...PAGE_KEYS, ...ATTRIBUTION_KEYS] as const
/** What a batch body may carry beside `appendToId`: the job's own options are not among them. */
const BATCH_APPEND_KEYS = ['urls', 'appendToId', 'ignoreInvalidURLs', 'idempotencyKey', 'robotsOverrides', ...ATTRIBUTION_KEYS] as const
const ROBOTS_OVERRIDE_KEYS = ['reason', 'recordedBy'] as const

/**
 * An option W2L does not know is an error, never silently dropped; `at`
 * names a nested object's place in the request. A refused option W2L does
 * not offer (`stealth`, a stealth `proxy`, `ignoreRobotsTxt`) names the
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
        unsupported(where, key, 'W2L extraction does not support it')
      }
    }
    if (rec.$schema !== undefined && (typeof rec.$schema !== 'string' || !SCHEMA_DIALECTS.test(rec.$schema))) {
      unsupported(where, '$schema', `W2L follows JSON Schema draft-07, 2019-09 and 2020-12, not ${JSON.stringify(rec.$schema)}`)
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
      if (!nullable && !union.every(isPrimitiveSchema)) unsupported(where, key, 'W2L maps a schema-or-null union or a union of primitive types, not a union of objects, arrays or references')
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
const STRING_FORMATS: readonly string[] = ['markdown', 'links', 'json', 'html', 'rawHtml', 'images', 'screenshot']
const FORMAT_NAMES: readonly string[] = [...STRING_FORMATS, 'attributes']
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
const FORMAT_ENTRY_MESSAGE = 'formats entries must be markdown, links, json, html, rawHtml, images, screenshot, a json schema request, an attributes request or a screenshot request'

/**
 * The selectors of an attributes format: 1 to 50 `{ selector, attribute }`
 * entries, each selector a non-empty string of at most 200 characters
 * (whether it parses, and is one the extractor matches, is checked in the
 * API engine as for `includeTags`) and each attribute an HTML attribute name
 * of at most 100 characters.
 */
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
function checkScreenshotViewport(mobile: boolean | undefined, formats: readonly ScrapeFormat[] | undefined): void {
  if (mobile !== true) return
  const screen = browserFingerprintFor('mobile').screen
  for (const format of formats ?? []) {
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
  if (name === 'user-agent' || name.startsWith('sec-ch-') || name.startsWith('sec-fetch-')) return `headers.${name} is refused: the User-Agent and client hints are W2L's declared identity`
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

/** onlyMainContent, waitFor, timeout, maxFileBytes, includeTags, excludeTags, headers, mobile, skipTlsVerification, fastMode, blockAds and removeBase64Images, shared by scrape, batch and crawl. */
function readPageOptions(rec: Record<string, unknown>): PageOptions {
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
  }
}

export function parseScrapeRequest(body: unknown): ScrapeRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, SCRAPE_KEYS)
  if (rec.debug !== undefined && typeof rec.debug !== 'boolean') throw new RequestError('debug must be a boolean')
  if (rec.includeLinks !== undefined && typeof rec.includeLinks !== 'boolean') throw new RequestError('includeLinks must be a boolean')
  const robotsOverride = rec.robotsOverride === undefined ? undefined : readRobotsOverride(rec.robotsOverride, 'robotsOverride')
  const mode = readMode(rec.mode)
  const page = readPageOptions(rec)
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
    ...readAttribution(rec),
  }
  checkScreenshotViewport(req.mobile, req.formats)
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
  const page = readPageOptions(rec)
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
  const maxConcurrency = readConcurrency(rec.maxConcurrency)
  const idempotencyKey = readIdempotencyKey(rec.idempotencyKey)
  const req: CrawlStartRequest = {
    url: readUrl(rec.url),
    mode,
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
    ...page,
    ...readAttribution(rec),
  }
  checkScreenshotViewport(req.mobile, req.formats)
  return req
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
  const mode = readMode(rec.mode)
  const page = readPageOptions(rec)
  checkMobileMode(mode, page.mobile)
  const req: ParsedBatchStartRequest = {
    urls, mode, formats: readFormats(rec.formats), includeLinks: rec.includeLinks as boolean | undefined,
    ...page,
    ...(robotsOverrides === undefined ? {} : { robotsOverrides }),
    ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
    ...(ignoreInvalidURLs === undefined ? {} : { ignoreInvalidURLs }),
    ...(ignoreInvalidURLs === true ? { invalidURLs } : {}),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(appendToId === undefined ? {} : { appendToId }),
    ...readAttribution(rec),
  }
  checkScreenshotViewport(req.mobile, req.formats)
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
