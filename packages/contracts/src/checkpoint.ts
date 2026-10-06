/**
 * Checkpoint contract: `task → attempt → step` at URL granularity.
 *
 * Persistence lives behind TaskStore (ADR 0003). This file is types only —
 * no I/O, no SQL. Callers generate UUIDs; the store never autoincrements.
 *
 * Granularity is the page. A partial parse inside a page is not a step; the
 * whole URL is retried. Block-level checkpoint is out of Phase 1.
 */

import type { PageOptions, RequestAttribution, RobotsUrlOverride, WebhookEvent } from './api.js'
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
  batch?: { urls: readonly string[]; formats: readonly ScrapeFormat[]; includeLinks: boolean; robotsOverrides?: readonly RobotsUrlOverride[]; maxConcurrency?: number; invalidURLs?: readonly string[]; webhook?: StoredJobWebhook; lane?: 'my-browser' } & PageOptions
  /**
   * Every crawl option but the page budget (`budget`), stored when the crawl
   * starts so a resumed crawl runs with the options it was started with.
   */
  crawl?: {
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
  createdAt: string
  updatedAt: string
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
