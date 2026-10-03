/**
 * Crawl composition contract: one scrape atom plus a crawl-level report.
 *
 * The orchestrator never opens Playwright. A page is one `scrape(url)`.
 * Types only — no I/O.
 */

import type { AgentHints, JobWebhookStatus, RequestAttribution } from './api.js'
import type { CrawlBudget, StepStatus, TaskStatus } from './checkpoint.js'
import type { CrawlMode } from './compliance.js'
import type { Evidence, FetchResult, FetchWarning, LadderRunAudit, TraceEvent } from './result.js'
import type { EvidenceRecord } from './evidenceRecord.js'
import type { Lane } from './status.js'
import type { BudgetKind } from './status.js'
import type { ExecutionContext } from './execution.js'

/**
 * How a crawl uses the site's sitemap: beside the links it finds (`include`,
 * the default), not at all (`skip`), or as its only source of URLs beside the
 * start URL (`only`: page links are returned when asked for, never followed).
 */
export const SITEMAP_MODES = ['include', 'skip', 'only'] as const
export type SitemapMode = (typeof SITEMAP_MODES)[number]

export interface ScrapeOutcome {
  result: FetchResult
  links: readonly string[]
  audit?: LadderRunAudit
  crawlDelayMs?: number | null
  /**
   * True when the result is a stored one the cache answered with: nothing
   * was fetched, so the page costs no fetch and says nothing new about its
   * host's robots.txt (its Crawl-delay is left as it was).
   */
  cached?: boolean
}

/**
 * One URL in, one page outcome out. The ladder is the production
 * implementation; Phase 4 tests inject a fake.
 */
export interface ScrapeAtom {
  scrape(url: string, context?: ExecutionContext): Promise<ScrapeOutcome>
  close(): Promise<void>
}

export interface SitemapLoadRequest {
  seedUrl: string
  /** Stop collecting entries once this many are in hand: the crawl's maxPages, or 50 000 when it is unbounded. */
  maxUrls: number
  /** At most this many sitemap files are fetched for one load, an index and its children each counting as one. */
  maxFiles: number
  /**
   * Opt-in (a map passes it, a crawl does not): judges each entry before it is
   * collected. An entry it refuses is not collected and does not count toward
   * `maxUrls`. Once `maxUrls` entries are in hand, the rest of the file in
   * flight is still offered, and those it accepts are counted as left over
   * (`truncated: 'urls'`), never collected.
   */
  accept?: (entry: SitemapEntry) => boolean | Promise<boolean>
  /**
   * Opt-in (a map passes it, a crawl does not): an absolute UTC time after
   * which the load stops and returns what it has, `truncated: 'time'`. The
   * file in flight is aborted and recorded as `unreadable`, error `timeout`.
   * The caller's own cancellation still throws.
   */
  softDeadlineAt?: number
}

/** Where a load looked for sitemaps: the `Sitemap:` lines of the start URL's robots.txt, or the conventional `/sitemap.xml` when it lists none. */
export type SitemapSourceKind = 'robots' | 'guess'

/**
 * What one sitemap file turned out to be: a `<sitemapindex>`, a `<urlset>`, a
 * 4xx (`absent`), a 2xx body that is neither (`not_sitemap`), a file that
 * could not be read (`unreadable`: too large, over the decompression cap, a
 * Content-Encoding W2L does not decode or bytes that do not decode as theirs,
 * a 5xx, a transport failure; `error` says which) or one its host's robots.txt
 * disallows for the crawl's identity (`refused`, never requested).
 */
export type SitemapFileKind = 'index' | 'urlset' | 'absent' | 'not_sitemap' | 'unreadable' | 'refused'

/** One sitemap file a load fetched or refused, on the record of the crawl that used it. These fetches carry no signed compliance record. */
export interface SitemapFileRecord {
  url: string
  /** Where the file was read from after redirects; null when no response answered. */
  finalUrl: string | null
  status: number | null
  contentType: string | null
  /** Bytes on the wire, before any gzip inflation; null when no body was read. */
  bytes: number | null
  /** SHA-256 of the bytes as received; null when no body was read. */
  sha256: string | null
  kind: SitemapFileKind
  /** `<loc>` entries the file holds (child sitemaps for an index), http(s) ones only; null when the file was not parsed. */
  entries: number | null
  /** The robots.txt verdict for the file's own URL under the crawl's identity (an unreachable robots.txt is `disallowed`, as for a page); null when the URL failed its egress check before robots.txt was consulted. */
  robots: 'allowed' | 'disallowed' | 'no_robots' | null
  /** Whether the request left through the operator's environment proxy (local mode); a hosted server never has one. */
  proxyUsed: boolean
  error: string | null
}

/** A URL a sitemap listed and the file that listed it. */
export interface SitemapEntry {
  url: string
  file: string
  /** The entry's `<lastmod>`, as written (trimmed, entities decoded, not normalised); absent when it has none. A crawl ignores it. */
  lastmod?: string
  /** The entry's `<news:title>`, entity-decoded and trimmed; absent when it has none. A crawl ignores it. */
  title?: string
}

export interface SitemapLoadResult {
  /** The declared identity the files were requested with: the crawl mode's http identity. */
  identity: { mode: CrawlMode; userAgent: string }
  sources: SitemapSourceKind[]
  files: SitemapFileRecord[]
  /** The entries collected, in listed order, each once, up to `maxUrls`. */
  urls: SitemapEntry[]
  /** Set when the load stopped before reading everything: at `maxFiles` with files unread, at `maxUrls` with entries uncollected, or at `softDeadlineAt` (`time`, never on a crawl). */
  truncated: 'files' | 'urls' | 'time' | null
  /** Only with `truncated: 'time'`: the files located (declared, or children of an index read) and not requested, the aborted one excluded; absent when the deadline came before any was located. */
  unreadFiles?: number
}

/**
 * Reads a site's sitemaps for a crawl: an auxiliary fetch path beside
 * robots.txt, never a page fetcher. The bench's HttpSitemapSource is the
 * production implementation; tests inject a fake. One source serves one crawl
 * and is closed with it.
 */
export interface SitemapSource {
  load(request: SitemapLoadRequest, context?: ExecutionContext): Promise<SitemapLoadResult>
  close(): Promise<void>
}

/** What a crawl attempt's sitemap load found and what the frontier made of it. Null when the crawl read no sitemap. */
export interface SitemapDiscovery {
  mode: SitemapMode
  sources: SitemapSourceKind[]
  files: SitemapFileRecord[]
  /** Entries the load returned and offered to the frontier. */
  listed: number
  /** Entries the frontier accepted as pages to fetch. */
  enqueued: number
  /** As SitemapLoadResult says; a crawl never produces `time`. */
  truncated: 'files' | 'urls' | 'time' | null
  /** Why the load itself failed, when it threw before returning; `files` then holds what it had read. Null otherwise. */
  error: string | null
}

/**
 * What one run of the orchestrator crawls. A new task stores its budget,
 * maxDepth, allowlistedDomains, includePaths, excludePaths, URL-scope options,
 * sitemap mode and concurrency cap; a resumed (`resumeFrom`) or existing
 * (`taskId`) task runs with the ones it stored, so a resume never widens the
 * crawl it continues.
 */
export interface CrawlSpec {
  seedUrl: string
  seedUrls?: readonly string[]
  taskDir: string
  mode: CrawlMode
  budget: CrawlBudget
  maxDepth: number | null
  /** Hosts links may lead to beside the seed's host, its www twin and where the seed redirected. */
  allowlistedDomains: readonly string[]
  resumeFrom: string | null
  useCached: boolean
  /** When set, openRun updates this existing task instead of inserting a new id. */
  taskId?: string
  /**
   * Pathname regexes for discovered links (the seed is always fetched); a
   * match in excludePaths wins.
   */
  includePaths?: readonly string[]
  excludePaths?: readonly string[]
  /** The URL-scope options, as CrawlStartRequest names them; DEFAULT_CRAWL_SPEC has their defaults. */
  regexOnFullURL?: boolean
  ignoreQueryParameters?: boolean
  deduplicateSimilarURLs?: boolean
  crawlEntireDomain?: boolean
  allowSubdomains?: boolean
  allowExternalLinks?: boolean
  /** How the crawl uses the site's sitemap; `skip` when the run has no SitemapSource. */
  sitemap?: SitemapMode
  /** Pages this crawl fetches at once, at most; null takes the service's worker count. Never raises the per-host ceiling. */
  maxConcurrency?: number | null
}

/**
 * What a crawl attempt's pages offered the frontier and what became of each
 * link: enqueued, an exact repeat (`duplicate`), a variant folded into a
 * first-seen page (`collapsed`: a query the crawl ignores, `/a/` after `/a`,
 * `/index.html` after `/`, the www twin), or refused by the host scope, the
 * start URL's path subtree, includePaths / excludePaths or maxDepth. The
 * `offered` total also counts links no counter names (assets, non-http
 * schemes, a path a filter could not decide). Sitemap entries the crawl
 * offered count here too, and `sitemap` says what the load read. `duplicateContent`
 * counts pages fetched and then found to repeat an earlier page's body. Null
 * on a batch, which discovers nothing.
 */
export interface CrawlDiscovery {
  offered: number
  enqueued: number
  duplicate: number
  collapsed: number
  hostDenied: number
  subtreeDenied: number
  pathDenied: number
  depthDenied: number
  duplicateContent: number
  /** The attempt's sitemap load; null when the crawl read no sitemap (`sitemap: skip`, or a task stored before the option). */
  sitemap: SitemapDiscovery | null
}

export const EMPTY_CRAWL_DISCOVERY: CrawlDiscovery = {
  offered: 0,
  enqueued: 0,
  duplicate: 0,
  collapsed: 0,
  hostDenied: 0,
  subtreeDenied: 0,
  pathDenied: 0,
  depthDenied: 0,
  duplicateContent: 0,
  sitemap: null,
}

export interface CrawlReport {
  taskId: string
  attemptId: string
  status: TaskStatus
  pagesFetched: number
  cachedPages: number
  budgetExceeded: BudgetKind | null
  loopDetected: boolean
  wallMs: number
  costUsd: number | null
  costUnknown?: boolean
  contentTokens: number | null
  contentTokensUnknown?: boolean
  /** The latest attempt's link discovery counters; null for a batch and for a crawl stored before they were kept. */
  discovery: CrawlDiscovery | null
  /** Who started the task, as the request said (`origin`, `integration`); absent when it named neither. */
  attribution?: RequestAttribution
  /** The task's webhook and how its deliveries stand; absent when the request set none. */
  webhook?: JobWebhookStatus
}

export interface CrawlPage {
  id: string
  url: string
  canonicalUrl: string
  depth: number
  status: StepStatus
  lane: Lane | null
  markdown: string | null
  /** The fetch's caveats (a recorded robots override), as on a scrape result; absent when it had none. */
  warnings?: readonly FetchWarning[]
  /** The warnings' messages joined with a space, present exactly when `warnings` is, as on a scrape response. */
  warning?: string
  /** What to change about the request next time (a login wall, a robots.txt rule, a cut), as on a scrape response; absent when nothing applies. */
  agentHints?: AgentHints
  /** Present when the task asked for the `html` format, as on a scrape result; null when the page has none. */
  html?: string | null
  /** Present when the task asked for the `rawHtml` format, as on a scrape result; null when the page has none. */
  rawHtml?: string | null
  /** Present when the task asked for the `images` format and the page was read as content, as on a scrape result. */
  images?: readonly string[]
  /** Present when the task asked for the `tables` format and the page was read as content, as on a scrape result. */
  tables?: FetchResult['tables']
  /** Present when the task's `pdf` parser asked for `pages` and the page is a PDF whose text was read, as on a scrape result. */
  pages?: FetchResult['pages']
  /** Present when the task asked for an `attributes` format and the page was read as content, as on a scrape result. */
  attributes?: FetchResult['attributes']
  /** Present when the task asked for the `screenshot` format and the page rendered, as on a scrape result: the capture, or null when the browser lane could not capture it. */
  screenshot?: FetchResult['screenshot']
  /** Absolute outbound links; present when the task requested links. */
  links?: readonly string[]
  /** The page's own title, description, language, ... as on a scrape result; absent when no page was extracted. */
  metadata?: FetchResult['metadata']
  json?: import('./structured.js').StructuredExtractionResult | null
  /** The file the page was (PDF, CSV, ...), as on a scrape result; absent for a web page. */
  file?: FetchResult['file']
  failureReason: string | null
  blockReason: string | null
  budgetExceeded: BudgetKind | null
  evidence: Evidence | null
  /** The page's Evidence Record v1; null while the page has no result yet. */
  evidenceRecord: EvidenceRecord | null
  /** Per-URL latency, attempts and metering without loading the full audit. */
  usage?: import('./result.js').ResourceUsage | null
  trace: readonly TraceEvent[]
  audit?: LadderRunAudit
  /** True when the page was not fetched in this attempt: a stored result was reused (the cache, or a resume's own pages). */
  cached: boolean
  /** Whether the cache answered, as on a scrape response's `metadata`: present when the task looked pages up (`maxAge`, `minAge`, `lockdown`). */
  cacheState?: 'hit' | 'miss'
  /** On a hit, when the reused result was fetched (its `evidenceRecord.fetchedAt`). */
  cachedAt?: string
  contentHash: string | null
  createdAt: string
  updatedAt: string
}

export interface CrawlError extends CrawlPage {
  trace: readonly TraceEvent[]
}

export interface CrawlPageList<T> {
  items: readonly T[]
  nextCursor: string | null
  hasMore: boolean
}


export const DEFAULT_CRAWL_SPEC: Omit<CrawlSpec, 'seedUrl' | 'taskDir'> = {
  mode: 'standard',
  budget: { maxPages: null, maxWallMs: null, maxCostUsd: null, maxTokens: null },
  maxDepth: null,
  allowlistedDomains: [],
  resumeFrom: null,
  useCached: false,
  regexOnFullURL: false,
  ignoreQueryParameters: false,
  deduplicateSimilarURLs: true,
  crawlEntireDomain: false,
  allowSubdomains: false,
  allowExternalLinks: false,
  sitemap: 'include',
  maxConcurrency: null,
}
