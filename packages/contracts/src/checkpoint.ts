/**
 * Checkpoint contract: `task → attempt → step` at URL granularity.
 *
 * Persistence lives behind TaskStore (ADR 0003). This file is types only —
 * no I/O, no SQL. Callers generate UUIDs; the store never autoincrements.
 *
 * Granularity is the page. A partial parse inside a page is not a step; the
 * whole URL is retried. Block-level checkpoint is out of Phase 1.
 */

import type { AccessChoice, BatchRetry, PageOptions, RequestAttribution, RobotsUrlOverride, WebhookEvent } from './api.js'
import type { CrawlMode } from './compliance.js'
import type { WebhookPayloadFormat } from './delivery.js'
import type { CrawlDiscovery, SitemapMode } from './crawl.js'
import type { FetchResult, LadderRunAudit } from './result.js'
import type { ScrapeFormat } from './structured.js'
import type { BudgetKind, Lane, ResultStatus } from './status.js'

export const TASK_STATUS = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUS)[number]

export const ATTEMPT_STATUS = ['running', 'completed', 'failed', 'cancelled', 'interrupted'] as const
export type AttemptStatus = (typeof ATTEMPT_STATUS)[number]

export const STEP_STATUS = [
  'pending',
  'running',
  'success',
  'partial',
  'empty_verified',
  'blocked',
  'failed',
  'cancelled',
  'budget_exceeded',
  'duplicate',
] as const
export type StepStatus = (typeof STEP_STATUS)[number]

/**
 * Hard caps for one crawl task. Null means "this dimension is not bounded".
 * Spent meters live on Attempt, not here — the spec is the ceiling.
 */
export interface CrawlBudget {
  maxPages: number | null
  maxWallMs: number | null
  maxCostUsd: number | null
  maxTokens: number | null
  /**
   * What one page may spend on third parties (an access grant's `perRequestUsd`, ROADMAP PA item 4): its own cap
   * within the run's, held by the run's spend ledger. Absent or null: none of its own.
   */
  maxCostPerPageUsd?: number | null
}

export const DEFAULT_CRAWL_BUDGET: CrawlBudget = {
  maxPages: null,
  maxWallMs: null,
  maxCostUsd: null,
  maxTokens: null,
}

/**
 * A job's webhook as its task stores it: the receiver, the events taken,
 * the metadata echoed in every payload, the signing secret's name and the
 * destination (`job:<taskId>`) in the control database. Custom headers live
 * in that database alone, never here.
 */
export interface StoredJobWebhook {
  url: string
  events: readonly WebhookEvent[]
  metadata: Readonly<Record<string, string>>
  secretEnv?: string
  destinationId: string
  /** `firecrawl` for a job started through the `/fc` shim, whose receiver gets Firecrawl's payload shape; absent means W2L's envelope. */
  payloadFormat?: WebhookPayloadFormat
}

/** One crawl job. The SQLite file sits next to `taskDir`. */
export interface Task {
  id: string
  seedUrl: string
  taskDir: string
  mode: CrawlMode
  status: TaskStatus
  budget: CrawlBudget
  /**
   * Present only for an explicit URL-array batch. Stored with the checkpoint,
   * page options and recorded robots overrides included, plus the batch's own
   * cap on pages in flight (`maxConcurrency`, absent when the request set
   * none) and the entries `ignoreInvalidURLs` skipped at submission
   * (`invalidURLs`, present exactly when that option was on). An append
   * (`appendToId`) extends `urls`, `robotsOverrides` and `invalidURLs` in
   * place, pushing to the end in order: the orchestrator seeds the tail past
   * what it has seeded, by index, and never a URL twice.
   */
  batch?: { urls: readonly string[]; formats: readonly ScrapeFormat[]; includeLinks: boolean; robotsOverrides?: readonly RobotsUrlOverride[]; maxConcurrency?: number; invalidURLs?: readonly string[]; webhook?: StoredJobWebhook; lane?: 'my-browser'; access?: AccessChoice; retry?: BatchRetry } & PageOptions
  /**
   * Every crawl option but the page budget (`budget`), stored when the crawl
   * starts so a resumed crawl runs with the options it was started with.
   */
  crawl?: {
    /** The plain access choice the crawl was started with (`standard` or `enhanced`); absent: the server's configuration. */
    access?: 'standard' | 'enhanced'
    formats?: readonly ScrapeFormat[]
    includeLinks?: boolean
    includePaths?: readonly string[]
    excludePaths?: readonly string[]
    /** Link hops from the seed; null is unbounded. Absent on a task stored before depth was kept. */
    maxDepth?: number | null
    /** Hosts links may lead to, beside the seed's host, its apex/www twin and where the seed redirected. */
    allowlistedDomains?: readonly string[]
    /** A resume reuses the pages this task already fetched instead of fetching them again. */
    useCached?: boolean
    /**
     * The URL-scope options the crawl was started with (see CrawlStartRequest).
     * Absent on a task stored before they were kept: such a task resumes with
     * the rule it was started under, whole host (`crawlEntireDomain` true) and
     * exact canonical URLs (`deduplicateSimilarURLs` false), the rest false.
     */
    regexOnFullURL?: boolean
    ignoreQueryParameters?: boolean
    deduplicateSimilarURLs?: boolean
    crawlEntireDomain?: boolean
    allowSubdomains?: boolean
    allowExternalLinks?: boolean
    /** How the crawl uses the site's sitemap. Absent on a task stored before it was kept: such a task resumes as `skip`. */
    sitemap?: SitemapMode
    /** The crawl's own cap on pages fetched at once; null takes the service's worker count. */
    maxConcurrency?: number | null
    /** The crawl's webhook, when the request set one. */
    webhook?: StoredJobWebhook
    /** The crawl fetches what robots.txt disallows, on the record (CrawlStartRequest.ignoreRobotsTxt); absent: it obeys. A server that takes no override resumes it obeying. */
    ignoreRobotsTxt?: boolean
  } & PageOptions
  /** Who started the task (`origin`, `integration`), stored with it and reported as `attribution` on its status; absent when the request named neither. */
  attribution?: RequestAttribution
  /**
   * Per host, when its last page started (epoch ms) and the robots.txt Crawl-delay in force, as the task's last run left
   * them: a resumed run, here or on another instance (hosted job slices, ROADMAP PH H1), keeps the host's pace. Absent
   * until a run has ended.
   */
  pacing?: Readonly<Record<string, HostPacing>>
  createdAt: string
  updatedAt: string
}

export interface HostPacing {
  lastStartedAtMs: number | null
  crawlDelayMs: number | null
  /** Until when the host is left alone (a 429's Retry-After, or the wait a slowdown set; epoch ms); absent when nothing holds it. */
  cooldownUntilMs?: number | null
  /** The pace the task set for the host after soft blocks (adaptive pacing); absent while the host runs at its baseline. */
  adaptive?: AdaptivePacing | null
  /**
   * Signals that stopped counting on this host: slowed by that signal as far as SETTLE_DELAY_MS, a page read again still
   * answered the same, so the pace is not why. They no longer slow the host, and a page that shows one is not read again.
   * Absent: none.
   */
  settled?: readonly string[]
}

/**
 * How a task paces a host that pushed back (AIMD): two soft-block signals in a row (a 429 or 503, a challenge page, a page
 * delivered in place of the one asked for, a failed task contract) hold the host to one page at a time and double the
 * wait between page starts (2 s the first time, at most 120 s); every ten normal pages in a row halve the wait, and at the
 * baseline the host's ceiling comes back. Signals come from the pages' results alone, never from a guess about the site.
 */
export interface AdaptivePacing {
  /** Pages in flight at once on the host while slowed: 1. */
  ceiling: number
  /** The wait between two page starts on the host, ms. */
  delayMs: number
  /** Soft-block signals in a row since the last normal page. */
  signals: number
  /** Normal pages in a row since the last signal or halving. */
  okStreak: number
  /** How many times the task slowed the host. */
  slowdowns: number
  /** The signal behind every slowdown of this pace; absent when two signals share it, or on a pace stored before it was kept. */
  cause?: string
}

/**
 * One execution of a task. A resume after crash opens a new attempt against
 * the same task so history is not overwritten (PHASE1 / PRODUCT_PLAN_V2 §4.3).
 */
export interface Attempt {
  id: string
  taskId: string
  status: AttemptStatus
  startedAt: string
  endedAt: string | null
  pagesFetched: number
  wallMs: number
  costUsd: number | null
  costUnknown?: boolean
  contentTokens: number
  contentTokensUnknown?: boolean
  /** Which budget dimension stopped this attempt, if any. */
  budgetExceeded: BudgetKind | null
  /** Set when this attempt resumes a previously interrupted attempt. */
  recoveredFromAttemptId?: string | null
  /** What this attempt's pages offered the frontier and what became of it, written after every page of a crawl; absent for a batch and for an attempt stored before it was kept. */
  discovery?: CrawlDiscovery | null
  /**
   * What the spend ledger charged this attempt's paid calls (ROADMAP PA item 4): a resumed or appended run of the task
   * opens its ledger with every earlier attempt's charge, so its cap is the task's, not each run's. Absent: none.
   */
  chargedUsd?: number | null
}

/**
 * One URL inside one attempt. The atomic checkpoint unit.
 *
 * `canonicalUrl` is the dedupe key the frontier will use later; this slice
 * stores whatever the caller supplies and does not normalize.
 * `contentHash` is the body hash used on resume to decide refetch vs cache.
 * `result` is the page FetchResult when one exists; null while pending/running.
 */
export interface StepRecord {
  id: string
  taskId: string
  attemptId: string
  url: string
  canonicalUrl: string
  depth: number
  status: StepStatus
  lane: Lane | null
  contentHash: string | null
  cached: boolean
  result: FetchResult | null
  audit?: LadderRunAudit
  createdAt: string
  updatedAt: string
}

/** ResultStatus and StepStatus share the terminal page outcomes. */
export function stepStatusFromResult(status: ResultStatus): StepStatus {
  return status
}
