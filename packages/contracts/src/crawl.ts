/**
 * Crawl composition contract: one scrape atom plus a crawl-level report.
 *
 * The orchestrator never opens Playwright. A page is one `scrape(url)`.
 * Types only — no I/O.
 */

import type { AgentHints, RequestAttribution } from './api.js'
import type { CrawlBudget, StepStatus, TaskStatus } from './checkpoint.js'
import type { CrawlMode } from './compliance.js'
import type { Evidence, FetchResult, FetchWarning, LadderRunAudit, TraceEvent } from './result.js'
import type { EvidenceRecord } from './evidenceRecord.js'
import type { Lane } from './status.js'
import type { BudgetKind } from './status.js'
import type { ExecutionContext } from './execution.js'

export interface ScrapeOutcome {
  result: FetchResult
  links: readonly string[]
  audit?: LadderRunAudit
  crawlDelayMs?: number | null
}

/**
 * One URL in, one page outcome out. The ladder is the production
 * implementation; Phase 4 tests inject a fake.
 */
export interface ScrapeAtom {
  scrape(url: string, context?: ExecutionContext): Promise<ScrapeOutcome>
  close(): Promise<void>
}

/**
 * What one run of the orchestrator crawls. A new task stores its budget,
 * maxDepth, allowlistedDomains, includePaths, excludePaths and URL-scope
 * options; a resumed (`resumeFrom`) or existing (`taskId`) task runs with the
 * ones it stored, so a resume never widens the crawl it continues.
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
}

/**
 * What a crawl attempt's pages offered the frontier and what became of each
 * link: enqueued, an exact repeat (`duplicate`), a variant folded into a
 * first-seen page (`collapsed`: a query the crawl ignores, `/a/` after `/a`,
 * `/index.html` after `/`, the www twin), or refused by the host scope, the
 * start URL's path subtree, includePaths / excludePaths or maxDepth. The
 * `offered` total also counts links no counter names (assets, non-http
 * schemes, a path a filter could not decide). `duplicateContent` counts pages
 * fetched and then found to repeat an earlier page's body. Null on a batch,
 * which discovers nothing.
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
  /** What to change about the request next time (a login wall, a robots.txt rule, a cut), as on a scrape response; absent when nothing applies. */
  agentHints?: AgentHints
  /** Present when the task asked for the `html` format, as on a scrape result; null when the page has none. */
  html?: string | null
  /** Present when the task asked for the `rawHtml` format, as on a scrape result; null when the page has none. */
  rawHtml?: string | null
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
  cached: boolean
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
}
