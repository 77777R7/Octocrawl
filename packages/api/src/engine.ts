/**
 * Product engine behind the REST surface. One scrape is LadderRunner.
 * One crawl is CrawlOrchestrator. No second fetcher.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  buildChannels,
  compatHostListed,
  HTTP_CHANNELS,
  BrowserLocalSubject,
  FileStore,
  HttpSitemapSource,
  LadderRunner,
  LadderScrapeAtom,
  MemoryRoutingHistory,
  ResilientHttpSubject,
  OriginScheduler,
  TaskCookieSession,
  prepareHttpIdentity,
  RobotsOriginCache,
  pageFromUserBrowser,
  summarize,
  type Channel,
} from '@w2l/bench'
import { collectLinkDetails, EXTRACTOR_VERSION, FILE_TEXT_VERSION, invalidSelector, MAX_SELECTOR_PARTS, PDF_TEXT_VERSION, selectorParts, SUPPORTED_SELECTORS } from '@w2l/extract-tf'
import {
  DEFAULT_SCRAPE_TIMEOUT_MS,
  defaultApiMode,
  isOctocrawlRobotsGroup,
  localNetworkPolicy,
  maxFileBytesFromEnv,
  type FetchOptions,
  type PageOptions,
  type ActiveCrawl,
  type ActiveCrawlList,
  type ActiveCrawlOptions,
  type SitemapMode,
  type CrawlAccepted,
  type CrawlError,
  type CrawlPage,
  type CrawlPageList,
  type CrawlReport,
  type CrawlStartRequest,
  type ParsedCrawlStartRequest,
  type BatchAccepted,
  type BatchErrorItem,
  type BatchErrorStatus,
  type BatchErrorsQuery,
  type BatchErrorsResponse,
  type BatchStatusResponse,
  type BatchHandoffRequest,
  type LoginImportRequest,
  type LoginImportResponse,
  type SavedLogin,
  type BatchHandoffResponse,
  HANDOFF_REASONS,
  CONTENTFUL_STATUS,
  stepStatusFromResult,
  type ParsedBatchStartRequest,
  BATCH_ERRORS_MAX_LIMIT,
  RequestError,
  type FetchResult,
  type NetworkPolicy,
  type ScrapeRequest,
  type StepRecord,
  type StepStatus,
  type Task,
  type TaskStatus,
  type CrawlPageQuery,
  type ExecutionContext,
  type AppliedRobotsOverride,
  type RobotsOverride,
  type RobotsUrlOverride,
  type ScrapeFormat,
  type CompactScrapeResponse,
  type RequestAttribution,
  type ScrapeRecord,
  type ScrapeResponse,
  type ScrapeRun,
  type ScrapeAtom,
  REFUSAL_HINTS,
  type DeliveryDestinationInput,
  type DeliveryDestination,
  type DeliveryQuery,
  type WebhookDelivery,
  type DeliveryDetail,
  type DeliveryPage,
  type DeliveryPageQuery,
  type MonitorPreview,
  type MonitorRun,
  type MonitorRunDetail,
  warningOf,
  HOSTED_MAP_MAX_LIMIT,
  HOSTED_MAP_MAX_TIMEOUT_MS,
  MAX_MAP_LIMIT,
  MAX_MAP_TIMEOUT_MS,
  type MapRecord,
  type MapRequest,
  type MapResponse,
  type MapSources,
  cacheLookupRequested,
  cacheStateOf,
  type ScrapeOutcome,
} from '@w2l/contracts'
import { createExecutionScope, evaluateGovernance, type AccessGrant, type CrawlPolicy } from '@w2l/http-core'
import { CrawlOrchestrator, MapRunner, canonicalizeUrl, crawlReportFromStore, decodeStepCursor, encodeStepCursor, IdempotencyStore, reportFromTaskAttempt, requestFingerprint, SqliteTaskStore, toEvidenceRecord, type StepPageQuery } from '@w2l/runtime'
import { PageCache, cacheHitResult, cacheMissResult, pageCacheKey, sourceCommitFromEnv, untriedAudit, withCacheMiss, withCacheStored, type PageCacheBounds } from '@w2l/runtime'
import type { BrowserEngineName, ChannelsFiltered } from '@w2l/bench'
import { agentHintsFor, httpLaneAskedForBrowser, mapAgentHints } from './hints.js'
import { HandoffNotThrough, openUserChrome, type UserChrome, type UserChromeOptions } from './chromeHandoff.js'
import { importChromeLogin, listSavedLogins, loginDomain, removeSavedLogin } from './chromeLogin.js'
import { JobEventHub, jobKindOf, type JobTerminalStatus } from './jobEvents.js'
import { JobWebhooks, webhookOf } from './jobWebhooks.js'
import { initializeFirecrawlMonitor, runFirecrawlMonitor as executeMonitor, runConfiguredMonitor } from '@w2l/runtime'
import { MonitorStore, DeliveryStore, assessConfiguredDocument, assessFirecrawlIntroduction } from '@w2l/runtime'
import { FileSessionBrokerStore, FileSessionStore, SessionBroker, type SessionStore } from '@w2l/bench'
import { FIRECRAWL_INTRO_URL, FIRECRAWL_MONITOR_ID, type MonitorView, type MonitorRevision } from '@w2l/contracts'
import type { ManagedSessionRef, SessionAccessResult } from '@w2l/contracts'
import { attributesFormat, customJsonFormat, listFormat, extractionInput, extractStructured, hasFormat, prepareScrapeResponse, scrapeSnapshot, screenshotFormat, structuredModelConfigFromEnv } from './structured.js'

export interface CrawlWithSteps {
  report: CrawlReport
  steps: readonly StepRecord[]
}

/** One page of a crawl's latest attempt and what is known about the rest, for its /fc status. */
export interface CrawlStatusPage {
  status: TaskStatus
  /** Up to `limit` of the latest attempt's steps, in the order they were recorded, after `cursor`. */
  steps: readonly StepRecord[]
  /** The cursor after the last of `steps`; the query's own when there are none. */
  cursor: string | null
  hasMore: boolean
  /** How many of the latest attempt's steps have each status. */
  counts: Partial<Record<StepStatus, number>>
  /** Pages the crawl will still record, when this process runs it; null when it does not. */
  ahead: number | null
}

/** Saved logins this engine does not manage: a hosted engine, or one without the person's sessions file or Chrome. */
export class LoginsUnavailableError extends Error {
  override readonly name = 'LoginsUnavailableError'
}

/** What a handoff tells its caller while it waits, and what ends it. */
export interface HandoffHooks {
  /** A page shows a check the person has to pass. */
  onWaiting?: (url: string, check: string) => void
  /** A page shows no check: it is read once the person clicks on it. */
  onConfirm?: (url: string) => void
  /** The tab W2L opened has stayed out of sight: the person is to switch to it. */
  onHidden?: (url: string) => void
  signal?: AbortSignal
}

/** A handoff this server does not offer (a hosted server, or one not serving its person's machine), or Chrome could not be reached: the message says why. */
export class HandoffUnavailableError extends Error {
  override readonly name = 'HandoffUnavailableError'
}

/** The crawl's state does not allow the request (HTTP 409 `conflict`). */
export class CrawlStateError extends Error {
  override readonly name = 'CrawlStateError'
}

/** The task a request names does not exist, or is not of the kind the request is about (HTTP 404 `not_found`). */
export class TaskNotFoundError extends Error {
  override readonly name = 'TaskNotFoundError'
}

/** The message of the 409 an idempotency key gets when it was first sent with another request. */
const IDEMPOTENCY_CONFLICT = 'idempotency key was used for a different request'

/** The idempotency verdict for one submission: a stored answer to replay, or a recorder for the answer this call gives. */
interface Submission<T extends CrawlAccepted> {
  replay?: T
  record: (taskId: string, response: T) => void
  forget: () => void
}

export interface ApiEngine {
  /** One page; with `handoff`, a page a check stopped is handed to the person in their Chrome (`hooks` tell the caller what they are to do). */
  scrape(req: ScrapeRequest, context?: ExecutionContext, hooks?: HandoffHooks): Promise<ScrapeResponse | CompactScrapeResponse>
  /** The record of one scrape call (`scrapes/<scrapeId>.json` under the task root); null for an id this server has no record of. */
  getScrape(scrapeId: string): Promise<ScrapeRecord | null>
  /**
   * One map: the start page on the http rung, the sitemaps the site declares
   * and robots.txt, inside the request's deadline (MapRunner). Recorded under
   * `maps/<id>.json` before it is answered; the caller's cancellation answers
   * nothing and records nothing.
   */
  map(req: MapRequest, context?: ExecutionContext): Promise<MapResponse>
  /** The record of one map (`maps/<id>.json` under the task root); null for an id this server has no record of. */
  getMap(id: string): Promise<MapRecord | null>
  /** Starts a crawl; with `idempotencyKey`, a retried start replays the first one's answer (`replayed: true`), and the key sent with another request is a CrawlStateError. */
  startCrawl(req: ParsedCrawlStartRequest): Promise<CrawlAccepted>
  /** The crawls this process is running, oldest start first: those it started and those it resumed at startup; never a batch. */
  listActiveCrawls(): Promise<ActiveCrawlList>
  /**
   * Starts a batch, or with `appendToId` adds the URLs to that batch (a
   * TaskNotFoundError for an id that is not a batch; a CrawlStateError when
   * it is cancelled or failed; the answer then carries `requested` and
   * `appended`). With `idempotencyKey`, a retried submission replays the first
   * one's answer with `replayed: true` and starts nothing.
   */
  startBatch(req: ParsedBatchStartRequest): Promise<BatchAccepted>
  getBatch(taskId: string): Promise<BatchStatusResponse | null>
  getBatchItems(taskId: string, query?: CrawlPageQuery): Promise<CrawlPageList<CrawlPage> | null>
  /**
   * The in-process hub a job's events pass through (`started`, one `page`
   * per persisted step, the `terminal`): what the stream routes subscribe
   * to. Deliveries do not go through it; the engine enqueues them itself.
   */
  readonly jobEvents: JobEventHub
  /**
   * Every persisted step of a crawl or batch, every attempt and every
   * outcome, as the compact pages the items routes and the job events carry
   * (no audit, an empty trace), in the order recorded, after `cursor`; null
   * for an unknown task. The stream routes replay from it.
   */
  listJobPages(taskId: string, query: { cursor?: string; limit: number }): Promise<CrawlPageList<CrawlPage> | null>
  /**
   * The batch's failed, blocked, cancelled and budget-cut items across every
   * attempt (an interrupted and resumed batch keeps its earlier failures), one
   * page at a time, with the URLs robots.txt refused; null for an id that is
   * not a batch.
   */
  getBatchErrors(taskId: string, query?: BatchErrorsQuery): Promise<BatchErrorsResponse | null>
  cancelBatch(taskId: string): Promise<BatchStatusResponse | null>
  getCrawl(taskId: string): Promise<CrawlReport | null>
  getCrawlWithSteps(taskId: string): Promise<CrawlWithSteps | null>
  /** Null when there is no such task; a RequestError for a cursor that does not parse. */
  getCrawlStatusPage(taskId: string, query: { cursor?: string; limit: number }): Promise<CrawlStatusPage | null>
  getCrawlPages(taskId: string, query?: CrawlPageQuery): Promise<CrawlPageList<CrawlPage> | null>
  getCrawlErrors(taskId: string, query?: CrawlPageQuery): Promise<CrawlPageList<CrawlError> | null>
  cancelCrawl(taskId: string): Promise<CrawlReport | null>
  /**
   * Restart a paused or failed crawl, or one no process is running, with the
   * options it was started with. Null when there is no such task; a
   * CrawlStateError when it is completed, cancelled, running or a batch.
   */
  resumeCrawl(taskId: string): Promise<CrawlAccepted | null>
  /**
   * Hand a finished batch's items that a check stopped (a captcha, a
   * challenge, a login wall) to the person, in their own Chrome: each is
   * opened there in turn, read once they are through, and its result
   * replaces the stopped one. Null when there is no such batch; a
   * CrawlStateError while it runs; a HandoffUnavailableError on a server
   * that does not offer it, or when Chrome cannot be reached.
   */
  handOffBatch(taskId: string, req: BatchHandoffRequest, hooks?: HandoffHooks): Promise<BatchHandoffResponse | null>
  /** End every handoff now, closing the tabs they have open, and wait until they have; close() does this first. No handoff starts after. */
  endHandoffs(): Promise<void>
  /**
   * The person's login to a site, saved from their running Chrome into the
   * sessions file (`octocrawl login import`), on an engine that serves them alone;
   * a LoginsUnavailableError elsewhere, a RequestError for a site that is not
   * one, a ChromeLoginError when Chrome cannot give it.
   */
  importLogin(req: LoginImportRequest): Promise<LoginImportResponse>
  /** The saved logins, without their cookies; an empty list on an engine without a sessions file. */
  listLogins(): Promise<SavedLogin[]>
  /** Forget a saved login: false when none was saved for the site. */
  removeLogin(site: string): Promise<boolean>
  runFirecrawlMonitor(triggerKey?: string, context?: ExecutionContext): Promise<MonitorView>
  getFirecrawlMonitor(): Promise<MonitorView>
  configureMonitor(revision: MonitorRevision, initialEnabled?: boolean): MonitorRevision
  previewMonitor(revision: MonitorRevision, context?: ExecutionContext): Promise<MonitorPreview>
  getMonitor(id: string): MonitorView | null
  getMonitorRun(id: string, runId: string): MonitorRunDetail | null
  listMonitors(): MonitorView[]
  enqueueMonitorRun(id: string, triggerKey?: string): MonitorRun
  runMonitor(id: string, triggerKey?: string, context?: ExecutionContext): Promise<MonitorView>
  cancelMonitorRun(id: string, runId: string): MonitorView
  setMonitorEnabled(id: string, enabled: boolean): MonitorView
  createDeliveryDestination(input: DeliveryDestinationInput): DeliveryDestination
  /** The destinations of a Monitor (`monitorId`) or of a job (`jobId`, whose destination is `job:<taskId>`); all when neither is given. */
  listDeliveryDestinations(query?: { monitorId?: string; jobId?: string }): DeliveryDestination[]
  setDeliveryDestinationEnabled(id: string, enabled: boolean): DeliveryDestination
  listDeliveries(query?: DeliveryQuery): WebhookDelivery[]
  getDeliveriesPage(query?: DeliveryPageQuery): DeliveryPage
  getDelivery(id: string): DeliveryDetail | null
  retryDelivery(id: string): WebhookDelivery
  createManagedSession(input: { workspaceId: string; accountRef: string; originScope: string; expiresAt?: string | null }): Promise<ManagedSessionRef>
  authorizeManagedSession(sessionRef: string, accountRef: string): Promise<ManagedSessionRef>
  revokeManagedSession(sessionRef: string): Promise<void>
  getManagedSession(sessionRef: string): Promise<ManagedSessionRef>
  renewManagedSession(sessionRef: string, expiresAt?: string | null): Promise<ManagedSessionRef>
  requestManagedHandoff(sessionRef: string, reason: string, expiresAt?: string | null): Promise<ManagedSessionRef>
  captureManagedSession(input: { sessionRef: string; workspaceId: string; accountRef: string; url: string }): Promise<FetchResult | SessionAccessResult>
  close(options?: {cancelActive?: boolean}): Promise<void>
}

export interface ApiEngineOptions {
  taskRoot?: string
  monitorLeaseMs?: number
  monitorAttemptTimeoutMs?: number
  headed?: boolean
  networkPolicy?: NetworkPolicy
  /**
   * Hosted crawl limit: an omitted or null maxPages takes it and a larger one
   * is refused. Null (local) leaves crawls unbounded.
   */
  defaultMaxPages?: number | null
  /**
   * Whether robots.txt may be set aside for a caller. Absent or true
   * (local): the person running the server decides that for their own
   * fetches: a URL a scrape or batch names is fetched whatever robots.txt
   * says, on the record, and a request may carry a recorded override
   * (`robotsOverride`, `robotsOverrides`). False (hosted): robots.txt is
   * obeyed for every URL, and the field is refused by name with HTTP 400, so
   * no token holder can make the operator's service set a publisher's rule
   * aside. A hosted engine (`hosted`) obeys it whatever this says.
   */
  allowRobotsOverride?: boolean
  /**
   * Whether this engine serves a hosted API (`--hosted`, the hosted MCP
   * host). A hosted engine never loosens security for a caller: a
   * `skipTlsVerification` on scrape, crawl or batch is refused with HTTP 400
   * before anything is fetched, and a stored task that carries it runs
   * without it. Absent or false is a local engine, the person's own.
   */
  hosted?: boolean
  /**
   * The file of the user's saved logins (`octocrawl login import`), read by mode
   * `authed` to fetch a page with the session saved for its domain. The
   * engine only reads it; a run never writes a session there. Absent or
   * null: no saved logins, and mode `authed` has no session to use. A
   * hosted engine never reads one, whatever is passed: a token holder must
   * not browse with the operator's accounts.
   */
  sessionsFile?: string | null
  /**
   * The person's own Chrome, where a batch item a check stopped can be
   * handed to them (`handOffBatch`): present on an engine that runs on their
   * machine and answers them alone. Absent: no handoff is offered. A hosted
   * engine never offers one, whatever is passed.
   */
  userChrome?: UserChromeOptions | null
  /**
   * The receivers a job `webhook` may name beyond https: with
   * `allowHttpLoopback` (the default off a hosted engine) a plain-http
   * receiver on loopback is taken, for a local developer's receiver. A hosted
   * engine takes https to a public address only, whatever this says.
   */
  webhookPolicy?: { allowHttpLoopback: boolean }
  /**
   * The server's access grant (ADR 0005), validated at startup. Its capabilities are the vendor
   * policy every vendor rung is built with, its run budget caps each batch's and crawl's
   * third-party spend, and it enters the page cache key so a page fetched under one grant is not
   * reused under another. Null or absent: no grant, so every grant-gated capability stays off.
   */
  accessGrant?: AccessGrant | null
  /** The engine the public browser rung launches, as the server chose it (browserEngineChoice). Default stock Playwright. */
  browserEngine?: BrowserEngineName
  /**
   * The hosts (and their subdomains) whose standard-mode pages go over the browser-compatible
   * transport, as the server chose them (compatHostsChoice; ADR 0005 `compatible_transport`): their
   * `http` rung is `http_compat`. Absent or empty: none. Needs the grant; refused on a hosted engine.
   */
  compatHosts?: readonly string[]
  /** Test seam: override local ladder channels without changing fetch. */
  channelsFor?: (mode: 'standard' | 'research' | 'authed') => Channel[]
  /** Restrict a hosted public-document pilot to the HTTP rung. */
  httpOnly?: boolean
  /** Server-owned acquisition rule; callers cannot disable it per request. */
  channelPolicy?: (url: string) => 'ladder' | 'http_only' | 'browser_only'
  /** Operator-created anonymous marketplace state, scoped by BrowserLocalSubject. */
  publicPreferenceState?: string | null
  browserAllowedHosts?: readonly string[]
  /** Hosted single-owner resource ceiling; absent locally for compatibility. */
  maxActiveBatches?: number
  batchMaxWallMs?: number | null
  /** Pages the orchestrator fetches at once per crawl, and the most a crawl's `maxConcurrency` may ask for. Default 4. */
  workerCount?: number
  perHostConcurrency?: number
  perHostMinDelayMs?: number
  crawlDelayMsByHost?: ReadonlyMap<string, number>
  /** The largest map `limit` this engine takes. Default MAX_MAP_LIMIT (100 000) locally, HOSTED_MAP_MAX_LIMIT (5000) on a hosted engine. */
  mapMaxLimit?: number
  /** The largest map `timeout` this engine takes. Default MAX_MAP_TIMEOUT_MS (300 000) locally, HOSTED_MAP_MAX_TIMEOUT_MS (60 000) on a hosted engine. */
  mapMaxTimeoutMs?: number
  /**
   * Whether the engine, as it opens, resumes the batches and crawls of its
   * task root that no process finished, and re-offers finished jobs'
   * webhooks. Default true: the API server. A one-off command (`octocrawl scrape`)
   * passes false, so it neither runs nor waits for earlier jobs.
   */
  resumeOnStart?: boolean
}


/** A map with sitemap skip reads no sitemap: its runner never loads one, and this reader says so if it were asked. */
const NO_SITEMAP: MapSources['sitemap'] = {
  load: async () => { throw new Error('sitemap skip: no sitemap is read') },
  close: async () => {},
}

/** The orchestrator's own default, which the engine passes explicitly so a crawl's `maxConcurrency` can be checked against it. */
/** A task's cookie session file, in its own directory (egress_sessions). */
const COOKIE_SESSION_FILE = 'cookie-session.json'
const DEFAULT_WORKER_COUNT = 4

/**
 * How the cache takes part in one page's fetch: the key of the page under
 * the options that shape its result, the age bounds of a lookup (null: none
 * is made), whether a miss ends the page (`lockdown`) and whether a
 * successful fetch is stored.
 */
interface CachePlan {
  key: string
  bounds: PageCacheBounds | null
  lockdown: boolean
  store: boolean
  /** Whether this request sets robots.txt aside for the URL (a named URL on a local server, ignoreRobotsTxt, a robotsOverride): only then may it reuse a page that was fetched past robots.txt. */
  robotsSetAside: boolean
}

/** Whether a stored result was fetched past robots.txt: a disallow, or an unreachable robots.txt, set aside on someone's word. */
function fetchedPastRobots(result: FetchResult): boolean {
  return result.compliance?.robots.override !== undefined || result.trace.some((event) => event.event === 'robots_overridden')
}

/** What the cache says before a page is fetched: a stored result to answer with, a lockdown miss that ends the page, or fetch it (after a lookup that missed, or none). */
type CacheAnswer =
  | { kind: 'hit'; result: FetchResult }
  | { kind: 'lockdown_miss'; result: FetchResult }
  | { kind: 'fetch'; missed: boolean }

export function createApiEngine(options: ApiEngineOptions = {}): ApiEngine {
  const taskRoot = options.taskRoot ?? '.w2l/api'
  prepareTaskRoot(taskRoot)
  const monitorStore = MonitorStore.open(join(taskRoot, 'section-b-control.sqlite'), {leaseMs: options.monitorLeaseMs, attemptTimeoutMs: options.monitorAttemptTimeoutMs})
  const deliveryStore = DeliveryStore.open(join(taskRoot, 'section-b-control.sqlite'))
  const shutdownController = new AbortController()
  const monitorControllers = new Map<string, Set<AbortController>>()
  const sessionBroker = new SessionBroker(new FileSessionBrokerStore(join(taskRoot, 'b3-sessions.json')))
  const userChrome: UserChromeOptions | null = options.hosted === true ? null : options.userChrome ?? null
  /** The batches being handed to the person now: one handoff of a batch at a time. */
  const handoffs = new Set<string>()
  /** Ends every handoff when the engine closes, gracefully or not: a handoff waits on a person, not on work that will finish. */
  const handoffClosing = new AbortController()
  const handoffRuns = new Set<Promise<unknown>>()
  const savedLogins: SessionStore | null = options.hosted === true || (options.sessionsFile ?? null) === null ? null : readOnlySessions(new FileSessionStore(options.sessionsFile!))
  /** The saved logins a run of `mode` may use: mode `authed` alone. */
  const sessionsFor = (mode: 'standard' | 'research' | 'authed'): SessionStore | null => mode === 'authed' ? savedLogins : null
  const headed = options.headed === true
  const accessGrant = options.accessGrant ?? null
  const compatHosts = options.compatHosts ?? []
  /** ADR 0005 `egress_sessions`: each batch or crawl keeps the cookies its pages set and sends them again to their site. */
  const egressSessions = (accessGrant?.capabilities ?? []).includes('egress_sessions')
  if (compatHosts.length > 0 && options.hosted === true) throw new Error('the compatible transport is refused on a hosted engine (ADR 0005)')
  if (compatHosts.length > 0 && !(accessGrant?.capabilities ?? []).includes('compatible_transport')) throw new Error('the compatible transport needs an access grant that names compatible_transport (ADR 0005)')
  /** Why a request's options keep it off the compatible transport, which sends its profile's headers alone; null when they do not. */
  const compatOptionsRefusal = (page: { headers?: Readonly<Record<string, string>>; mobile?: boolean }): string | null => {
    const wire = [...(page.headers !== undefined && Object.keys(page.headers).length > 0 ? ['headers'] : []), ...(page.mobile === true ? ['mobile'] : [])]
    return wire.length === 0 ? null : wire.join(', ')
  }
  /** Whether a page goes over the compatible transport: a listed host, and options its profile can send. */
  const compatTakes = (url: string, page: { headers?: Readonly<Record<string, string>>; mobile?: boolean }): boolean => compatHostListed(compatHosts, url) && compatOptionsRefusal(page) === null
  /**
   * A run's budget under the server's grant: the stricter of the task's own cost cap and the grant's run budget, applied every time
   * a task runs, so a task created before the grant, resumed, or appended to is capped as one created under it.
   */
  const grantedBudget = (budget: Task['budget']): Task['budget'] => {
    const cap = accessGrant?.budget.perRunUsd ?? null
    if (cap === null) return budget
    return { ...budget, maxCostUsd: budget.maxCostUsd === null ? cap : Math.min(budget.maxCostUsd, cap) }
  }
  const basePolicy = options.networkPolicy ?? localNetworkPolicy()
  const networkPolicy: NetworkPolicy = {
    ...basePolicy,
    ...(options.perHostConcurrency === undefined ? {} : { perHostConcurrency: options.perHostConcurrency }),
    ...(options.perHostMinDelayMs === undefined ? {} : { perHostMinDelayMs: options.perHostMinDelayMs }),
    // The operator's file cap: the policy's own, else W2L_MAX_FILE_BYTES, else the default.
    maxFileBytes: basePolicy.maxFileBytes ?? maxFileBytesFromEnv(process.env),
  }
  // Files (PDF, CSV, ...) are saved as received under the task root: files/<sha256>.<ext>.
  const fileStore = new FileStore(join(taskRoot, 'files'))
  // Successful page results stored for reuse (`maxAge`, `storeInCache`, `lockdown`): <taskRoot>/page-cache.sqlite.
  const pageCache = PageCache.open(taskRoot)
  /**
   * The cache's part in fetching `url` with these options through `channels`,
   * or null when it has none: mode `authed` never looks up or stores (a page
   * read with the user's session stays theirs), nor does a request that
   * neither looks up nor stores. A request with custom `headers` stores only
   * when it says `storeInCache: true`: their values stay off disk unless the
   * caller asks. The key holds every option the lanes receive except the
   * deadline, which bounds a fetch but does not shape a successful result,
   * plus the mode, the rungs the request may use (so a server's channel
   * policy is never crossed), `fastMode`, a recorded robots override and the
   * build that extracts (extractor versions and the declared source commit),
   * so a reused result's Evidence Record names the build that produced it.
   */
  const cachePlanFor = (url: string, mode: 'standard' | 'research' | 'authed', page: PageOptions, formats: readonly ScrapeFormat[] | undefined, channels: readonly Channel[], robotsOverride: RobotsOverride | undefined, robotsSetAside: boolean): CachePlan | null => {
    if (mode === 'authed') return null
    // A page after actions is that run's page alone (the parser refuses the cache options with them).
    if (page.actions !== undefined) return null
    const lookup = cacheLookupRequested(page)
    const customHeaders = page.headers !== undefined && Object.keys(page.headers).length > 0
    const store = customHeaders ? page.storeInCache === true : page.storeInCache !== false
    if (!lookup && !store) return null
    const { timeout: _timeout, ...shape } = fetchOptions(page, formats)
    const rungs = channels.map((channel) => channel.vendorId === undefined ? channel.id : `${channel.id}(${channel.vendorId})`)
    const build = { extractor: EXTRACTOR_VERSION, pdf: PDF_TEXT_VERSION, file: FILE_TEXT_VERSION, commit: sourceCommitFromEnv() }
    // Absent without a grant, so a server without one keeps every key it had.
    const access = accessGrant === null ? undefined : { tier: accessGrant.tier, capabilities: [...accessGrant.capabilities].sort() }
    const key = pageCacheKey(url, { mode, fetch: shape, rungs, fastMode: page.fastMode === true, robotsOverride: robotsOverride ?? null, build, ...(access === undefined ? {} : { access }) })
    return { key, bounds: lookup ? { minAgeMs: page.minAge ?? 0, maxAgeMs: page.maxAge ?? null } : null, lockdown: page.lockdown === true, store, robotsSetAside }
  }
  /**
   * The cache's answer before a fetch. A URL governance refuses is never
   * looked up: the ladder refuses it before any request, as it would
   * without the cache, lockdown or not.
   */
  const consultCache = (plan: CachePlan | null, url: string, policy: CrawlPolicy): CacheAnswer => {
    if (plan === null || plan.bounds === null || !evaluateGovernance(url, policy).allowed) return { kind: 'fetch', missed: false }
    // The key holds a recorded override, not the one a named URL or ignoreRobotsTxt applies, so a page robots.txt
    // refuses can sit under the key an obeying request looks up (a crawl's link, a hosted engine on the same task root):
    // such a request never gets it.
    const hit = pageCache.lookup(plan.key, plan.bounds)
    if (hit !== null && (plan.robotsSetAside || !fetchedPastRobots(hit.result))) return { kind: 'hit', result: cacheHitResult(hit) }
    if (plan.lockdown) return { kind: 'lockdown_miss', result: cacheMissResult(url, plan.bounds) }
    return { kind: 'fetch', missed: true }
  }
  /** A fetched result after the cache: `cache_miss` when a lookup found nothing, stored when the plan stores and it succeeded (`cache_stored`). A failed write is logged and the result stands. */
  const afterFetch = (plan: CachePlan | null, answer: CacheAnswer, result: FetchResult): FetchResult => {
    let next = answer.kind === 'fetch' && answer.missed && plan?.bounds != null ? withCacheMiss(result, plan.bounds) : result
    if (plan?.store !== true) return next
    try {
      if (pageCache.store(plan.key, result)) next = withCacheStored(next)
    } catch (error) {
      console.error(JSON.stringify({ component: 'api', event: 'page_cache_unwritten', url: result.requestedUrl, error: error instanceof Error ? error.message : String(error) }))
    }
    return next
  }
  /** A request may lower the file cap, never raise it past the operator's. */
  const checkFileCap = (req: PageOptions): void => {
    if (req.maxFileBytes !== undefined && req.maxFileBytes > networkPolicy.maxFileBytes!) {
      throw new RequestError(`maxFileBytes must be at most ${networkPolicy.maxFileBytes}, this server's file cap (W2L_MAX_FILE_BYTES)`)
    }
  }
  /**
   * A selector that does not parse, or that uses what W2L does not match, is
   * refused by name before anything is fetched or stored, never read as
   * "matched nothing". So is a list that holds more parts than the extractor
   * matches for one list: what a list costs a page grows with its parts.
   */
  const checkSelectors = (req: PageOptions): void => {
    for (const name of ['includeTags', 'excludeTags'] as const) {
      let parts = 0
      for (const [index, selector] of (req[name] ?? []).entries()) {
        const refusal = invalidSelector(selector)
        if (refusal === null) {
          parts += selectorParts(selector)
          continue
        }
        if (refusal.kind === 'syntax') throw new RequestError(`${name} entry is not a valid CSS selector: ${selector}`)
        throw new RequestError(`${name} entry uses ${refusal.reason}, which Octocrawl does not match: ${selector} (supported: ${SUPPORTED_SELECTORS})`, 'unsupported_parameter', { parameters: [`${name}[${index}]`] })
      }
      if (parts > MAX_SELECTOR_PARTS) {
        throw new RequestError(`${name} must hold at most ${MAX_SELECTOR_PARTS} selector parts in all, and holds ${parts} (a tag name, *, a class, an id, an attribute test and a pseudo-class each count as one)`)
      }
    }
  }
  /** The selectors of an attributes format, checked like includeTags: refused by name before anything is fetched or stored. */
  const checkAttributeSelectors = (formats: readonly ScrapeFormat[] | undefined): void => {
    const format = attributesFormat(formats ?? [])
    if (format === undefined) return
    const at = (formats ?? []).indexOf(format)
    let parts = 0
    for (const [index, { selector }] of format.selectors.entries()) {
      const refusal = invalidSelector(selector)
      if (refusal === null) {
        parts += selectorParts(selector)
        continue
      }
      if (refusal.kind === 'syntax') throw new RequestError(`attributes selectors[${index}].selector is not a valid CSS selector: ${selector}`)
      throw new RequestError(`attributes selectors[${index}].selector uses ${refusal.reason}, which Octocrawl does not match: ${selector} (supported: ${SUPPORTED_SELECTORS})`, 'unsupported_parameter', { parameters: [`formats[${at}].selectors[${index}]`] })
    }
    if (parts > MAX_SELECTOR_PARTS) {
      throw new RequestError(`attributes selectors must hold at most ${MAX_SELECTOR_PARTS} selector parts in all, and hold ${parts} (a tag name, *, a class, an id, an attribute test and a pseudo-class each count as one)`)
    }
  }
  /** The selectors of a list format, checked like includeTags: refused by name before anything is fetched or stored. */
  const checkListSelectors = (formats: readonly ScrapeFormat[] | undefined): void => {
    const format = listFormat(formats ?? [])
    if (format === undefined) return
    const at = (formats ?? []).indexOf(format)
    const named = [...(format.itemSelector === undefined ? [] : [{ path: 'itemSelector', selector: format.itemSelector }]), ...(format.fields ?? []).flatMap((field, i) => field.selector === undefined ? [] : [{ path: `fields[${i}].selector`, selector: field.selector }])]
    let parts = 0
    for (const { path, selector } of named) {
      const refusal = invalidSelector(selector)
      if (refusal === null) {
        parts += selectorParts(selector)
        continue
      }
      if (refusal.kind === 'syntax') throw new RequestError(`list ${path} is not a valid CSS selector: ${selector}`)
      throw new RequestError(`list ${path} uses ${refusal.reason}, which Octocrawl does not match: ${selector} (supported: ${SUPPORTED_SELECTORS})`, 'unsupported_parameter', { parameters: [`formats[${at}].${path}`] })
    }
    if (parts > MAX_SELECTOR_PARTS) throw new RequestError(`list selectors must hold at most ${MAX_SELECTOR_PARTS} selector parts in all, and hold ${parts}`)
  }
  const hosted = options.hosted === true
  /** Whether this server sets robots.txt aside for a caller at all: a local one does, a hosted one, fetching from the operator's addresses, never. */
  const robotsSetAside = !hosted && options.allowRobotsOverride !== false
  /** A server that sets robots.txt aside for no caller refuses the fields that ask it to by name, before anything is fetched or stored. */
  const checkRobotsOverride = (parameter: 'robotsOverride' | 'robotsOverrides' | 'ignoreRobotsTxt', value: unknown): void => {
    if (!robotsSetAside && value !== undefined && value !== false) {
      throw new RequestError(`unsupported parameter: ${parameter} (this server obeys robots.txt for every URL; setting it aside is for a local Octocrawl server)`, 'unsupported_parameter', { parameters: [parameter] })
    }
  }
  /**
   * robots.txt addresses crawlers that discover links. On a local server a
   * URL the request names (a scrape, a batch entry) is fetched whatever it
   * says: the verdict is still read and recorded, Crawl-delay included, with
   * this override and a warning on the result. The links a crawl or map
   * discovers (unless it was started with ignoreRobotsTxt), a Monitor's
   * scheduled re-reads and every fetch of a hosted server obey it.
   */
  const namedUrlOverride: AppliedRobotsOverride | undefined = robotsSetAside ? { reason: 'the request named this URL', basis: 'user_named_url' } : undefined
  /** What a crawl or map started with ignoreRobotsTxt sets aside, on a server that sets robots.txt aside. */
  const ignoreRobotsOverride = (ignore: boolean | undefined): AppliedRobotsOverride | undefined =>
    ignore === true && robotsSetAside ? { reason: 'the crawl or map was started with ignoreRobotsTxt', basis: 'ignore_robots_txt' } : undefined
  /** A hosted engine never relaxes certificate verification for a caller; refused before anything is fetched or stored, naming the supported route. */
  const checkHostedOptions = (req: PageOptions): void => {
    if (hosted && req.skipTlsVerification === true) throw new RequestError('skipTlsVerification is not available in hosted mode', 'invalid_request', undefined, [REFUSAL_HINTS.hostedSkipTlsVerification])
    // A step runs the caller's clicks and scripts in the operator's browser; a hosted engine takes none until that isolation is reviewed.
    if (hosted && req.actions !== undefined) throw new RequestError('actions are not available in hosted mode: run Octocrawl locally to use them')
  }
  // A job's events: durable webhook deliveries (the control database, the worker of the API process or the MCP runtime), and the in-process hub streaming consumers subscribe to.
  const jobEvents = new JobEventHub()
  const jobWebhooks = new JobWebhooks(deliveryStore, { hosted, allowHttpLoopback: options.webhookPolicy?.allowHttpLoopback ?? !hosted })
  const logWebhookFailure = (taskId: string, stage: string, error: unknown): void => {
    console.error(JSON.stringify({ component: 'api', event: 'job_webhook_failed', taskId, stage, error: error instanceof Error ? error.message : String(error) }))
  }
  // One record per scrape call, written before the response is sent and read
  // back by GET /v1/scrapes/:id. No page body; no retention in M2.
  const scrapesDir = join(taskRoot, 'scrapes')
  let scrapesDirReady: Promise<void> | null = null
  const writeScrapeRecord = async (record: ScrapeRecord): Promise<void> => {
    scrapesDirReady ??= mkdir(scrapesDir, { recursive: true }).then(() => undefined, (error: unknown) => { scrapesDirReady = null; throw error })
    await scrapesDirReady
    await writeFile(join(scrapesDir, `${record.scrapeId}.json`), JSON.stringify(record, null, 2))
  }
  // One record per map call, written before the response is sent and read back by GET /v1/maps/:id. No retention, like scrape records.
  const mapsDir = join(taskRoot, 'maps')
  let mapsDirReady: Promise<void> | null = null
  const writeMapRecord = async (record: MapRecord): Promise<void> => {
    mapsDirReady ??= mkdir(mapsDir, { recursive: true }).then(() => undefined, (error: unknown) => { mapsDirReady = null; throw error })
    await mapsDirReady
    await writeFile(join(mapsDir, `${record.response.id}.json`), JSON.stringify(record))
  }
  const mapMaxLimit = options.mapMaxLimit ?? (hosted ? HOSTED_MAP_MAX_LIMIT : MAX_MAP_LIMIT)
  const mapMaxTimeoutMs = options.mapMaxTimeoutMs ?? (hosted ? HOSTED_MAP_MAX_TIMEOUT_MS : MAX_MAP_TIMEOUT_MS)
  const originScheduler = new OriginScheduler(networkPolicy)
  const conditionalHttp = new ResilientHttpSubject('standard', networkPolicy, originScheduler, undefined, false, fileStore)
  const defaultMaxPages = options.defaultMaxPages ?? null
  const workerCount = Math.max(1, options.workerCount ?? DEFAULT_WORKER_COUNT)
  // One robots.txt cache per mode, shared by the http rung and a crawl's sitemap reader, so a host's robots.txt is read once for both.
  const robotsCaches = new Map<string, RobotsOriginCache>()
  const robotsCacheFor = (mode: 'standard' | 'research' | 'authed'): RobotsOriginCache => {
    const existing = robotsCaches.get(mode)
    if (existing !== undefined) return existing
    const cache = new RobotsOriginCache(networkPolicy)
    robotsCaches.set(mode, cache)
    return cache
  }
  const inflight = new Map<string, Promise<void>>()
  let batchStartInProgress = false
  // The keys of the submissions this task root has answered (`<taskRoot>/idempotency.sqlite`): a retried start replays its answer instead of starting a second job.
  const idempotency = IdempotencyStore.open(taskRoot, { taskExists: (taskId) => existsSync(join(taskRoot, taskId, 'checkpoint.sqlite')) })
  /**
   * The idempotency verdict for a start or an append: the stored answer to
   * replay (nothing is started), or a recorder for the answer this call will
   * give; a key first sent with a different request is a 409 conflict. The
   * answer is recorded before the task is created, with no await between the
   * claim and the record, and forgotten when the creation fails.
   */
  function claimSubmission<T extends CrawlAccepted>(req: { idempotencyKey?: string }): Submission<T> {
    const key = req.idempotencyKey
    if (key === undefined) return { record: () => {}, forget: () => {} }
    const fingerprint = requestFingerprint(req)
    const claim = idempotency.claim<T>(key, fingerprint)
    if (claim.kind === 'conflict') throw new CrawlStateError(IDEMPOTENCY_CONFLICT)
    if (claim.kind === 'replay') return { replay: { ...claim.response, replayed: true }, record: () => {}, forget: () => {} }
    return { record: (taskId, response) => idempotency.record(key, fingerprint, taskId, response), forget: () => idempotency.forget(key) }
  }
  const activeScrapes = new Set<Promise<unknown>>()
  const crawlControllers = new Map<string, AbortController>()
  const runningCrawls = new Map<string, CrawlOrchestrator>()
  const createChannels =
    options.channelsFor ??
    ((mode: 'standard' | 'research' | 'authed') => {
      const channels = buildChannels(mode, { headed, networkPolicy, originScheduler, publicPreferenceState:options.publicPreferenceState, browserAllowedHosts:options.browserAllowedHosts, fileStore, robotsCache: robotsCacheFor(mode), vendorPolicy: { authorized: accessGrant?.capabilities ?? [] }, browserEngine: options.browserEngine ?? 'playwright', compatTransport: compatHosts.length > 0 })
      return options.httpOnly ? channels.filter(channel => HTTP_CHANNELS.has(channel.id)) : channels
    })
  const channelsByMode = new Map<string, Channel[]>()
  const historiesByMode = new Map<string, MemoryRoutingHistory>()
  const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => {
    const existing = channelsByMode.get(mode)
    if (existing !== undefined) return existing
    const channels = createChannels(mode)
    channelsByMode.set(mode, channels)
    return channels
  }
  /**
   * The rungs a request gets, and the ones it does not, with why: the
   * server's own channel policy first (never a caller's to change), then a
   * `screenshot` format (the local browser rungs alone, which capture it;
   * refused by name when none is permitted or `fastMode` declines them),
   * then the request's `fastMode` (the http rung alone; refused by name for
   * a URL the policy binds to the browser lane), then the options the local
   * lanes alone honour (`headers`, `mobile`, `skipTlsVerification`), for
   * which the vendor rungs are dropped. Each drop opens the run's ladder
   * audit as a `ladder_channels_filtered` event.
   *
   * With the compatible transport configured, the rungs of one URL (`oneUrl`)
   * keep one http rung: `http_compat` for a listed host, which drops `http`
   * and says so, else `http`. A batch's or crawl's rungs serve many URLs and
   * keep both; each page takes one (Channel.serves). Options the transport
   * cannot send (`headers`, `mobile`) drop `http_compat` either way.
   * `compat` false leaves it out altogether: a map reads its start page with
   * the identity its response names, the one it reads robots.txt with.
   */
  const channelsForUrl = (mode: 'standard' | 'research' | 'authed', url: string, page: PageOptions = {}, formats: readonly ScrapeFormat[] = [], oneUrl = true, compat = true): { channels: Channel[]; filtered: ChannelsFiltered[] } => {
    const channels = channelsFor(mode)
    const policy = options.channelPolicy?.(url) ?? 'ladder'
    let selected = policy === 'ladder' ? channels : channels.filter(channel => policy === 'http_only' ? HTTP_CHANNELS.has(channel.id) : channel.id === 'browser_local')
    // A host the server did not list never sees the compatible rung, in the audit either.
    if (!compat || (oneUrl && !compatHostListed(compatHosts, url))) selected = selected.filter(channel => channel.id !== 'http_compat')
    if (selected.length === 0) throw new RequestError(`capture channel unavailable for ${policy}`)
    const filtered: ChannelsFiltered[] = []
    const name = (channel: Channel) => channel.vendorId === undefined ? channel.id : `${channel.id}(${channel.vendorId})`
    if (hasFormat(formats, 'screenshot')) {
      if (page.fastMode === true) throw new RequestError('screenshot requires the browser lane, which fastMode declines')
      const kept = selected.filter(channel => BROWSER_RUNGS.has(channel.id))
      if (kept.length === 0) throw new RequestError('screenshot requires the browser lane, which this deployment does not offer')
      const dropped = selected.filter(channel => !BROWSER_RUNGS.has(channel.id)).map(name)
      if (dropped.length > 0) filtered.push({ reason: 'screenshot', dropped })
      selected = kept
    }
    // Steps run in a browser: the local browser rungs alone take them.
    if (page.actions !== undefined && page.actions.length > 0) {
      if (page.fastMode === true) throw new RequestError('actions require the browser lane, which fastMode declines')
      const kept = selected.filter(channel => BROWSER_RUNGS.has(channel.id))
      if (kept.length === 0) throw new RequestError('actions require the browser lane, which this deployment does not offer')
      const dropped = selected.filter(channel => !BROWSER_RUNGS.has(channel.id)).map(name)
      if (dropped.length > 0) filtered.push({ reason: 'actions', dropped })
      selected = kept
    }
    if (page.fastMode === true) {
      if (policy === 'browser_only') throw new RequestError('fastMode is not available for this URL: it is served by the browser lane only')
      const kept = selected.filter(channel => HTTP_CHANNELS.has(channel.id))
      if (kept.length === 0) throw new RequestError('fastMode is not available for this URL: no http rung is configured for it')
      const dropped = selected.filter(channel => !HTTP_CHANNELS.has(channel.id)).map(name)
      if (dropped.length > 0) filtered.push({ reason: 'fastMode', dropped })
      selected = kept
    }
    const wire = (['headers', 'mobile', 'skipTlsVerification'] as const).filter(option => option === 'headers' ? page.headers !== undefined && Object.keys(page.headers).length > 0 : page[option] === true)
    if (wire.length > 0) {
      const dropped = selected.filter(channel => channel.vendorId !== undefined).map(name)
      if (dropped.length > 0) filtered.push({ reason: wire.join(', '), dropped })
      selected = selected.filter(channel => channel.vendorId === undefined)
    }
    if (selected.some(channel => channel.id === 'http_compat')) {
      const refusal = compatOptionsRefusal(page)
      if (refusal !== null) {
        filtered.push({ reason: refusal, dropped: ['http_compat'] })
        selected = selected.filter(channel => channel.id !== 'http_compat')
      } else if (oneUrl && selected.some(channel => channel.id === 'http')) {
        filtered.push({ reason: 'compatible_transport', dropped: ['http'] })
        selected = selected.filter(channel => channel.id !== 'http')
      }
    }
    // A batch's or crawl's rungs that keep both http rungs: each page takes one, the compatible one for a listed host.
    if (selected.some(channel => channel.id === 'http_compat') && selected.some(channel => channel.id === 'http')) {
      selected = selected.map((channel): Channel =>
        channel.id === 'http' ? { ...channel, serves: (target, fetch) => !compatTakes(target, fetch) }
          : channel.id === 'http_compat' ? { ...channel, serves: (target, fetch) => compatTakes(target, fetch) }
            : channel)
    }
    return { channels: selected, filtered }
  }
  const historyFor = (mode: string): MemoryRoutingHistory => {
    const existing = historiesByMode.get(mode)
    if (existing !== undefined) return existing
    const history = new MemoryRoutingHistory()
    historiesByMode.set(mode, history)
    return history
  }

  async function loadCrawlWithSteps(taskId: string): Promise<CrawlWithSteps | null> {
    // A job id names a directory under the task root: anything but an id this server issues names none.
    if (!UUID.test(taskId)) return null
    if (!existsSync(join(taskRoot, taskId))) return null
    const store = SqliteTaskStore.openReadOnly(join(taskRoot, taskId))
    try {
      const report = await crawlReportFromStore(store, taskId)
      if (report === null) return null
      const steps =
        report.attemptId.length === 0 ? [] : await store.listSteps(taskId, report.attemptId)
      const task = await store.getTask(taskId)
      const webhook = task === null ? undefined : jobWebhooks.status(task)
      return { report: webhook === undefined ? report : { ...report, webhook }, steps }
    } finally {
      await store.close()
    }
  }

  /** A batch's status: the latest attempt's report with the batch's totals, the cap in force, the skipped entries and its webhook's standing. */
  async function loadBatch(taskId: string): Promise<BatchStatusResponse | null> {
    // A job id names a directory under the task root: anything but an id this server issues names none.
    if (!UUID.test(taskId)) return null
    if (!existsSync(join(taskRoot, taskId, 'checkpoint.sqlite'))) return null
    const store = SqliteTaskStore.openReadOnly(join(taskRoot, taskId))
    try {
      const task = await store.getTask(taskId)
      if (!task?.batch) return null
      const attempts = await store.listAttempts(taskId)
      const latest = attempts.at(-1)
      const report = latest
        ? reportFromTaskAttempt(task, latest, 0)
        : await crawlReportFromStore(store, taskId)
      if (!report) return null
      const completed = await store.countCompletedSteps(taskId)
      const counts = await store.countSteps(taskId)
      const webhook = jobWebhooks.status(task)
      const waitingForPerson = userChrome === null || !offersHandoff(task) ? undefined : Object.entries(await store.countBlockReasons(taskId)).reduce((sum, [reason, count]) => sum + (HANDOFF_REASONS[reason] === undefined ? 0 : count), 0)
      return {
        ...report, requested: task.batch.urls.length, completed, remaining: Math.max(0, task.batch.urls.length - completed),
        // A page read, with or without content, succeeded; what the errors report lists failed.
        succeeded: (counts.success ?? 0) + (counts.partial ?? 0) + (counts.empty_verified ?? 0),
        failed: (counts.failed ?? 0) + (counts.blocked ?? 0) + (counts.cancelled ?? 0) + (counts.budget_exceeded ?? 0),
        // The cap in force: the batch's own, never above this service's worker count.
        maxConcurrency: Math.min(task.batch.maxConcurrency ?? workerCount, workerCount),
        ...(task.batch.invalidURLs === undefined ? {} : { invalidURLs: task.batch.invalidURLs }),
        ...(waitingForPerson === undefined ? {} : { waitingForPerson }),
        ...(webhook === undefined ? {} : { webhook }),
      }
    } finally { await store.close() }
  }

  /**
   * A task that has ended: its terminal webhook event and hub event, from the
   * row as it is now. Nothing for a job still in flight or paused by shutdown
   * (it ends later, in this process or the next). Idempotent: the terminal
   * event's id is deterministic, so a second call for the same attempt adds
   * nothing.
   */
  async function finishJob(task: Task, store: SqliteTaskStore, error?: string): Promise<void> {
    const current = await store.getTask(task.id)
    if (current === null || !isTerminalStatus(current.status)) return
    const kind = jobKindOf(current)
    const report = kind === 'batch' ? await loadBatch(current.id) : (await loadCrawlWithSteps(current.id))?.report ?? null
    if (report === null) return
    if (webhookOf(current) !== undefined) {
      try { await jobWebhooks.terminal(current, report, store, error) }
      catch (failure) { logWebhookFailure(current.id, 'terminal', failure) }
    }
    await jobEvents.emit({ type: 'terminal', taskId: current.id, jobKind: kind, status: current.status, report })
  }

  /** At startup, a finished job with a webhook: every step and the terminal event offered again, so a crash between a write and its enqueue loses no delivery. */
  async function reconcileFinished(task: Task, store: SqliteTaskStore): Promise<void> {
    try {
      await jobWebhooks.reconcile(task, store, (step) => compactPage(step, task))
      if (webhookOf(task) !== undefined) {
        const report = task.batch === undefined ? (await loadCrawlWithSteps(task.id))?.report ?? null : await loadBatch(task.id)
        if (report !== null) await jobWebhooks.terminal(task, report, store)
      }
    } catch (error) { logWebhookFailure(task.id, 'reconcile', error) }
  }

  async function activeBatchCount(): Promise<number> {
    let count = 0
    for (const name of existsSync(taskRoot) ? readdirSync(taskRoot) : []) {
      if (!existsSync(join(taskRoot, name, 'checkpoint.sqlite'))) continue
      const store = SqliteTaskStore.openReadOnly(join(taskRoot, name))
      try {
        const task = await store.getTask(name)
        if (task?.batch && ['pending', 'running', 'paused'].includes(task.status)) count++
      } finally { await store.close() }
    }
    return count
  }

  async function loadCrawlPageList(taskId: string, query: CrawlPageQuery | undefined, kind: StepPageQuery['kind'], allAttempts = false): Promise<CrawlPageList<CrawlPage> | null> {
    // A job id names a directory under the task root: anything but an id this server issues names none.
    if (!UUID.test(taskId)) return null
    if (!existsSync(join(taskRoot, taskId))) return null
    const store = SqliteTaskStore.openReadOnly(join(taskRoot, taskId))
    try {
      const report = allAttempts ? null : await crawlReportFromStore(store, taskId)
      if (!allAttempts && report === null) return null
      const task = await store.getTask(taskId)
      if (task === null) return null
      const page = await store.listStepsPage(taskId, {
        attemptId: query?.attemptId ?? (!allAttempts && report !== null && report.attemptId.length > 0 ? report.attemptId : undefined),
        cursor: query?.cursor,
        limit: query?.limit ?? 50,
        kind,
        ...(query?.includeDuplicates === undefined ? {} : { includeDuplicates: query.includeDuplicates }),
      })
      const includeLinks = linksRequested(task)
      return {
        items: page.steps.map((step) => toCrawlPage(step, includeLinks, task, userChrome !== null && task.batch !== undefined && offersHandoff(task))),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      }
    } finally {
      await store.close()
    }
  }

  /**
   * One page handed to the person in their open Chrome: the result read
   * there once they are through, or why it is not read. Only a page (a
   * contentful read) is a result; a check still showing, an error or no
   * content leaves the stopped result standing.
   */
  async function readThrough(chrome: UserChrome, url: string, prior: FetchResult, fetchOpts: FetchOptions, waitMs: number | undefined, hooks: HandoffHooks, signal: AbortSignal): Promise<{ result: FetchResult } | { reason: string }> {
    try {
      // The page is through as the read below judges it: with the request's tags and blockAds.
      const judged = { ...(fetchOpts.includeTags === undefined ? {} : { includeTags: fetchOpts.includeTags }), ...(fetchOpts.excludeTags === undefined ? {} : { excludeTags: fetchOpts.excludeTags }), ...(fetchOpts.blockAds === undefined ? {} : { blockAds: fetchOpts.blockAds }) }
      const read = await chrome.read(url, { ...(waitMs === undefined ? {} : { waitMs }), ...(hooks.onWaiting === undefined ? {} : { onWaiting: hooks.onWaiting }), ...(hooks.onConfirm === undefined ? {} : { onConfirm: hooks.onConfirm }), ...(hooks.onHidden === undefined ? {} : { onHidden: hooks.onHidden }), signal, ...judged })
      const result = pageFromUserBrowser(read, prior, fetchOpts)
      if (!CONTENTFUL_STATUS.has(result.status)) return { reason: `the page Octocrawl read in Chrome was ${result.status} (${result.blockReason ?? result.failureReason ?? 'no reason'}), not the page` }
      return { result }
    } catch (error) {
      if (!(error instanceof HandoffNotThrough)) throw error
      return { reason: error.message }
    }
  }

  /** A scrape's `handoff` is offered here, and asks for what a page read in the person's Chrome can give. */
  function checkHandoff(req: ScrapeRequest): void {
    if (req.handoff === undefined) return
    if (userChrome === null) throw new RequestError('handoff: this server does not hand pages to a person; run Octocrawl on your own machine (octocrawl serve, the local MCP host, or the octocrawl CLI)', 'unsupported_parameter', { parameters: ['handoff'] })
    const unread = unreadByPerson(fetchOptions(req, req.formats))
    if (unread !== null) throw new RequestError(`handoff: the request asks for ${unread}, which a page read in your own Chrome cannot give`, 'unsupported_parameter', { parameters: ['handoff'] })
  }

  /** The scrape's stopped page handed to the person, with its own Chrome connection: the page read, or why not. */
  async function handOffScrape(req: ScrapeRequest, prior: FetchResult, context: ExecutionContext, hooks: HandoffHooks): Promise<{ result: FetchResult } | { reason: string }> {
    if (handoffClosing.signal.aborted) return { reason: 'Octocrawl is shutting down' }
    // The caller going away, or this engine shutting down, ends it; the scrape's own timeout does not: the person's time is theirs.
    const signal = AbortSignal.any([...(context.signal === undefined ? [] : [context.signal]), ...(hooks.signal === undefined ? [] : [hooks.signal]), shutdownController.signal, handoffClosing.signal])
    let chrome: UserChrome
    try { chrome = await openUserChrome(userChrome!, signal) }
    catch (error) { return { reason: error instanceof Error ? error.message : String(error) } }
    try {
      return await readThrough(chrome, req.url, prior, fetchOptions(req, req.formats), req.handoff?.waitMs, hooks, signal)
    } finally {
      chrome.close()
    }
  }

  /**
   * A result as a server that hands pages to the person answers it: one a check stopped says so, and how (`handoff: true`);
   * one already handed over and not read there (`tried`), that the request may hand it over again.
   */
  function withHandoffHint(result: FetchResult, req: ScrapeRequest, tried = false): FetchResult {
    if (userChrome === null || !handoffResult(result) || unreadByPerson(fetchOptions(req, req.formats)) !== null) return result
    const blockReason = result.blockReason!
    const stopped = `${result.requestedUrl} stopped at a ${blockReason.replace(/_/g, ' ')} Octocrawl does not pass`
    const rationale = tried
      ? `${stopped}, and handed to you in your own Chrome it was not read there (the handoff_not_through warning says why): send the request again with handoff to try once more, with a longer handoff.waitMs if you needed more time`
      : `${stopped}: send the request again with handoff: true (octocrawl scrape --handoff) to get through it yourself in your own Chrome, and Octocrawl reads the page there`
    return { ...result, handoff: { reason: HANDOFF_REASONS[blockReason]!, liveViewUrl: null, rationale } }
  }

  /** handOffBatch's work: see ApiEngine.handOffBatch. */
  async function handOff(taskId: string, req: BatchHandoffRequest, hooks: HandoffHooks): Promise<BatchHandoffResponse | null> {
    // A job id names a directory under the task root: anything but an id this server issues names none.
    if (!UUID.test(taskId)) return null
    if (userChrome === null) throw new HandoffUnavailableError('this server does not hand pages to a person: run Octocrawl on your own machine (octocrawl serve, the local MCP host, or the octocrawl CLI) to open them in your Chrome')
    if (handoffClosing.signal.aborted) throw new HandoffUnavailableError('Octocrawl is shutting down')
    if (!existsSync(join(taskRoot, taskId, 'checkpoint.sqlite'))) return null
    const store = SqliteTaskStore.open(join(taskRoot, taskId))
    try {
      const task = await store.getTask(taskId)
      if (task === null || task.batch === undefined) return null
      if (inflight.has(taskId) || task.status === 'pending' || task.status === 'running' || task.status === 'paused') throw new CrawlStateError(`batch ${taskId} is ${task.status}: hand its items over when it has finished`)
      if (handoffs.has(taskId)) throw new CrawlStateError(`batch ${taskId} is already being handed over`)
      const unread = handoffUnread(task)
      if (unread !== null) throw new CrawlStateError(`batch ${taskId} asked for ${unread}, which a page read in your own Chrome cannot give: its stopped items are not handed over`)
      if (webhookOf(task) !== undefined) throw new CrawlStateError(`batch ${taskId} has a webhook: a page read in your own Chrome is read signed in as you, and is not sent to another address; its stopped items are not handed over`)
      handoffs.add(taskId)
      try {
        const waiting = (await stepsOf(store, taskId, 'errors')).filter(handoffNeeded)
        const items: BatchHandoffResponse['items'] = []
        if (waiting.length > 0) {
          const selection = task.batch
          const formats = selection.formats ?? ['markdown']
          const fetchOpts = fetchOptions(selection, selection.formats)
          // The caller going away, or this engine shutting down, ends the handoff.
          const signal = AbortSignal.any([...(hooks.signal === undefined ? [] : [hooks.signal]), shutdownController.signal, handoffClosing.signal])
          let chrome
          try { chrome = await openUserChrome(userChrome, signal) }
          catch (error) { throw new HandoffUnavailableError(error instanceof Error ? error.message : String(error)) }
          try {
            for (const step of waiting) {
              {
                // A caller that went away hands nothing more over: each item left keeps its stopped result.
                if (signal.aborted) { items.push({ id: step.id, url: step.url, through: false, status: step.status, reason: 'the handoff was cancelled before this page' }); continue }
                const read = await readThrough(chrome, step.url, step.result!, fetchOpts, req.waitMs, hooks, signal)
                if ('reason' in read) { items.push({ id: step.id, url: step.url, through: false, status: step.status, reason: read.reason }); continue }
                const result = read.result
                const json = hasFormat(formats, 'json') ? await extractStructured(extractionInput(result), customJsonFormat(formats), createExecutionScope({}), structuredModelConfigFromEnv()) : undefined
                const stored: FetchResult = {
                  ...result,
                  markdown: hasFormat(formats, 'markdown') ? result.markdown : null,
                  links: hasFormat(formats, 'links') || selection.includeLinks === true ? result.links : [],
                  ...(json === undefined ? {} : { json }),
                }
                // An engine shutting down writes nothing more.
                if (shutdownController.signal.aborted || handoffClosing.signal.aborted) {
                  items.push({ id: step.id, url: step.url, through: false, status: step.status, reason: 'Octocrawl shut down before the page was stored' })
                  continue
                }
                // The stopped run's routing audit described that run, not this read: the trace's handoff_from says what was replaced.
                const { audit: _stoppedAudit, ...kept } = step
                const replaced: StepRecord = { ...kept, status: stepStatusFromResult(stored.status), lane: stored.lane, contentHash: stored.evidence.rawBodySha256, cached: false, result: stored, updatedAt: new Date().toISOString() }
                await store.putStep(replaced)
                items.push({ id: step.id, url: step.url, through: true, status: stored.status })
                // The item replaced is a job event of its own: a webhook delivery when the batch has a receiver, then the hub's.
                const page = compactPage(replaced, task)
                if (webhookOf(task) !== undefined) {
                  try { await jobWebhooks.replaced(task, replaced, page, store) }
                  catch (error) { logWebhookFailure(task.id, 'handoff', error) }
                }
                await jobEvents.emit({ type: 'page', taskId: task.id, jobKind: jobKindOf(task), page })
              }
            }
          } finally {
            chrome.close()
          }
        }
        const through = items.filter((item) => item.through).length
        return { id: taskId, handedOff: items.length, through, notThrough: items.length - through, items }
      } finally {
        handoffs.delete(taskId)
      }
    } finally {
      await store.close()
    }
  }

  function launchTask(task: Task, store: SqliteTaskStore, req: TaskRunOptions): void {
    const mode = defaultApiMode(task.mode)
    // Batch and crawl tasks apply their stored formats and page options to
    // every page. A task stored before crawl formats existed has neither and
    // keeps the full result. A hosted engine runs a stored task without the
    // relaxation it refuses at submission.
    const stored = task.batch ?? task.crawl
    const selection = stored === undefined || !hosted ? stored : { ...stored, skipTlsVerification: false }
    // One set of rungs for every URL of the task: a screenshot format binds them all to the browser lane.
    const rungs = channelsForUrl(mode, task.seedUrl, selection ?? {}, selection?.formats ?? [], false)
    // The task's cookie session (egress_sessions), kept in its directory so a resumed task goes on with it, and
    // removed when the task ends. A saved login is mode authed's own session; pages read with a session are never cached.
    const cookieSessionFile = join(task.taskDir, COOKIE_SESSION_FILE)
    const cookieSession = egressSessions && mode !== 'authed' ? new TaskCookieSession(cookieSessionFile) : undefined
    /**
     * The session file goes once the task has ended, also when this run has no session (a server restarted
     * without the grant resumed a task that had one); a run paused by shutdown keeps it for its resume.
     */
    const endCookieSession = async (ended: boolean): Promise<void> => {
      if (!ended) return
      await cookieSession?.close()
      await TaskCookieSession.remove(cookieSessionFile).catch(() => {})
    }
    // Saved logins go to a batch alone: a crawl follows every link, a sign-out link included, so a crawl stored in mode
    // authed (before crawl refused it) and resumed runs without the user's session.
    // Governance sees the hosts the frontier may lead to (policyAllowlist); every page still gets its own robots.txt, SSRF and identity checks.
    const runner = new LadderRunner(rungs.channels, { mode, ...(req.policyAllowlist.length ? { allowlistedDomains: req.policyAllowlist } : {}) }, historyFor(mode), null, task.batch === undefined ? null : sessionsFor(mode), { channelsFiltered: rungs.filtered })
    // A batch's recorded robots overrides are per URL: only the URL an
    // override names is fetched past a disallow, never its neighbours. A
    // server that takes none applies none, also to a task stored with them.
    const recordedOverrideFor = !robotsSetAside || task.batch?.robotsOverrides === undefined ? null : robotsOverrideLookup(task.batch.robotsOverrides)
    // Every other URL a batch names is fetched as a scrape's is; a crawl's pages are links it discovered, and obey robots.txt unless it was started with ignoreRobotsTxt.
    const namedOverride = task.batch === undefined ? ignoreRobotsOverride(task.crawl?.ignoreRobotsTxt) : namedUrlOverride
    const robotsOverrideFor = recordedOverrideFor === null && namedOverride === undefined ? null : (url: string) => recordedOverrideFor?.(url) ?? namedOverride
    const ladder = new LadderScrapeAtom(runner, robotsOverrideFor === null ? fetchOptions(selection, selection?.formats) : (url) => {
      const robotsOverride = robotsOverrideFor(url)
      return { ...fetchOptions(selection, selection?.formats), ...(robotsOverride === undefined ? {} : { robotsOverride }) }
    })
    const atom: ScrapeAtom = selection === undefined ? (cookieSession === undefined ? ladder : { scrape: (url, context) => ladder.scrape(url, { ...context, cookieSession }), close: () => ladder.close() }) : {
      async scrape(url, context) {
        // `timeout` is each page's own deadline, inside the task's.
        const page = createExecutionScope({ ...context, deadlineAt: Math.min(context?.deadlineAt ?? Infinity, Date.now() + (selection.timeout ?? DEFAULT_SCRAPE_TIMEOUT_MS)), ...(cookieSession === undefined ? {} : { cookieSession }) })
        const formats = selection.formats ?? ['markdown']
        const wants = (name: 'markdown' | 'links' | 'json') => hasFormat(formats, name)
        const custom = customJsonFormat(formats)
        const cachePlan = cachePlanFor(url, mode, selection, selection.formats, rungs.channels, recordedOverrideFor?.(url), robotsOverrideFor?.(url) !== undefined)
        // A page fetched with the session's cookies neither reuses an anonymous one nor is stored; a lockdown request fetches nothing, so its cache-only answer stands.
        const plan = cookieSession === undefined || cachePlan?.lockdown === true ? cachePlan : null
        const answer = consultCache(plan, url, { mode, ...(req.policyAllowlist.length ? { allowlistedDomains: req.policyAllowlist } : {}) })
        // JSON extraction, its model fallback included, runs within the page's deadline too.
        const { outcome, json } = await (async () => {
          const outcome: ScrapeOutcome = answer.kind === 'fetch'
            ? await ladder.scrape(url, page).then((fetched) => ({ ...fetched, result: afterFetch(plan, answer, fetched.result) }))
            : { result: answer.result, links: answer.result.links ?? [], cached: answer.kind === 'hit' }
          const json = wants('json') ? await extractStructured(extractionInput(outcome.result), custom, page, structuredModelConfigFromEnv()) : undefined
          return { outcome, json }
        })().finally(() => page.dispose())
        // The stored audit repeats no page body; a screenshot's base64 is stored once, on the result, and its attempt copy says null; what actions produced is stored once, on the result.
        const audit = outcome.audit === undefined ? undefined : {
          ...outcome.audit,
          summary: {
            ...outcome.audit.summary,
            attempts: outcome.audit.summary.attempts.map(({ result: { html: _html, rawHtml: _rawHtml, images: _images, tables: _tables, pages: _pages, attributes: _attributes, screenshot, actions: _actions, list: _list, ...result }, ...attempt }) => ({
              ...attempt,
              result: { ...result, markdown: null, links: [], ...(screenshot === undefined ? {} : { screenshot: null }) },
            })),
          },
        }
        return { ...outcome, ...(audit === undefined ? {} : { audit }), result: {
          ...outcome.result,
          markdown: wants('markdown') ? outcome.result.markdown : null,
          // A crawl stores every page's links: its frontier and resume follow them. Output filters them.
          links: task.batch === undefined || wants('links') || selection.includeLinks === true ? outcome.result.links : [],
          ...(json === undefined ? {} : { json }),
        } }
      },
      close: () => ladder.close(),
    }
    const controller = new AbortController()
    crawlControllers.set(task.id, controller)
    // A crawl that reads a sitemap gets its own reader: the crawl mode's http identity (the mobile one when its
    // pages declare it), the engine's network policy, origin scheduler and this mode's robots.txt cache; a hosted
    // engine's policy has no proxy and no private ranges. A batch never reads one.
    const sitemapSource = req.sitemap === 'skip' ? undefined : new HttpSitemapSource({ mode, device: selection?.mobile === true ? 'mobile' : 'desktop', networkPolicy, scheduler: originScheduler, robots: robotsCacheFor(mode), ignoreRobotsTxt: ignoreRobotsOverride(task.crawl?.ignoreRobotsTxt) !== undefined })
    // Each persisted step is one job event: a webhook delivery when the task has a receiver (a delivery error is logged, never the page's), then the hub's.
    const webhook = webhookOf(task)
    const kind = jobKindOf(task)
    const onStep = async (step: StepRecord): Promise<void> => {
      const page = compactPage(step, task)
      if (webhook !== undefined) {
        try { await jobWebhooks.page(task, step, page, store) }
        catch (error) { logWebhookFailure(task.id, 'page', error) }
      }
      await jobEvents.emit({ type: 'page', taskId: task.id, jobKind: kind, page })
    }
    const orchestrator = new CrawlOrchestrator({
      store, atom,
      // A page whose scrape threw called a provider only if this mode has one: otherwise its third-party cost is a known 0.
      scrapeErrorCostUsd: channelsFor(mode).some((channel) => channel.vendorId !== undefined) ? null : 0,
      workerCount,
      perHostConcurrency: Math.min(4, networkPolicy.perHostConcurrency),
      perHostMinDelayMs: networkPolicy.perHostMinDelayMs,
      crawlDelayMsByHost: options.crawlDelayMsByHost,
      shutdownSignal: shutdownController.signal,
      signal: controller.signal,
      ...(sitemapSource === undefined ? {} : { sitemapSource }),
      onStep,
    })
    const job = (async () => {
      // A resumed or restarted job offers its persisted steps to the webhook again before fetching more; those already enqueued are ignored.
      if (webhook !== undefined && req.resume) {
        try { await jobWebhooks.reconcile(task, store, (step) => compactPage(step, task)) }
        catch (error) { logWebhookFailure(task.id, 'reconcile', error) }
      }
      return orchestrator.run({
        seedUrl: task.seedUrl,
        ...(task.batch ? { seedUrls: task.batch.urls } : {}),
        taskDir: task.taskDir,
        mode,
        budget: grantedBudget(task.budget),
        maxDepth: req.maxDepth,
        allowlistedDomains: req.allowlistedDomains,
        resumeFrom: req.resume ? task.id : null,
        useCached: req.useCached,
        taskId: task.id,
        ...req.scope,
        sitemap: req.sitemap,
        maxConcurrency: req.maxConcurrency,
      })
    })().then(async () => {
      crawlControllers.delete(task.id); runningCrawls.delete(task.id)
      // URLs appended to a batch after its workers had stopped have no step yet: a new attempt fetches them, and the task stays in flight meanwhile.
      const pending = task.batch === undefined ? null : await appendedWithoutStep(task.id, store)
      if (pending !== null) { launchTask(pending, store, batchRunOptions(pending.batch, true)); return }
      // The terminal event follows the terminal task row the run wrote; a run paused by shutdown has none.
      await finishJob(task, store)
      inflight.delete(task.id)
      // After the run is out of the in-flight set, as before: removing the session file does not hold the task as running.
      const after = await store.getTask(task.id)
      await endCookieSession(after !== null && isTerminalStatus(after.status))
      await store.close()
    }).catch(async (error: unknown) => {
      inflight.delete(task.id); crawlControllers.delete(task.id); runningCrawls.delete(task.id)
      await markCrawlFailed(store, task.id)
      await finishJob(task, store, error instanceof Error ? error.message : String(error))
      await endCookieSession(true)
      await store.close()
    })
    runningCrawls.set(task.id, orchestrator)
    inflight.set(task.id, job)
  }

  // A running batch has a durable URL list and per-URL checkpoints. Reopen it
  // after a process crash; completed steps are skipped by restoreFrontier.
  // A crawl paused by shutdown or left running by a crash resumes the same
  // way, with the options stored at its start; one stored before they were
  // kept stays as it is rather than run with guessed limits.
  for (const name of options.resumeOnStart !== false && existsSync(taskRoot) ? readdirSync(taskRoot) : []) {
    const taskDir = join(taskRoot, name)
    if (!existsSync(join(taskDir, 'checkpoint.sqlite'))) continue
    const store = SqliteTaskStore.open(taskDir)
    void store.getTask(name).then(async task => {
      const unfinished = task !== null && !inflight.has(task.id) && ['pending', 'running', 'paused'].includes(task.status)
      if (unfinished && task.batch) {
        launchTask(task, store, batchRunOptions(task.batch, true))
      } else if (unfinished && crawlOptionsStored(task)) {
        launchTask(task, store, crawlRunOptions(task, true))
      } else {
        // A finished job with a receiver: anything a crash cut off between a write and its enqueue is offered again, nothing twice.
        if (task !== null && webhookOf(task) !== undefined && isTerminalStatus(task.status)) await reconcileFinished(task, store)
        // A cookie session a crash left behind a finished task goes now.
        if (task !== null && isTerminalStatus(task.status)) await TaskCookieSession.remove(join(taskDir, COOKIE_SESSION_FILE)).catch(() => {})
        void store.close()
      }
    }).catch(() => { void store.close() })
  }

  /**
   * One scrape: the ladder run, the shaped response and, for an API call
   * (`record`), the scrape record under the id the response carries. A
   * Monitor's capture mints an id for its response but leaves no record: a
   * preview persists nothing, and a run's observation is the Monitor's own.
   */
  async function runScrape(req: ScrapeRequest, context: ExecutionContext, record: boolean, hooks: HandoffHooks = {}): Promise<ScrapeResponse | CompactScrapeResponse> {
    checkHandoff(req)
    checkFileCap(req)
    checkSelectors(req)
    checkAttributeSelectors(req.formats)
    checkListSelectors(req.formats)
    checkRobotsOverride('robotsOverride', req.robotsOverride)
    checkHostedOptions(req)
    const overallStart = performance.now()
    const requestedAt = new Date().toISOString()
    const scrapeId = crypto.randomUUID()
    // `timeout` is the whole scrape's deadline; a caller's own deadline (a Monitor run) still bounds it.
    const deadlineAt = req.timeout === undefined
      ? context.deadlineAt ?? Date.now() + DEFAULT_SCRAPE_TIMEOUT_MS
      : Math.min(context.deadlineAt ?? Infinity, Date.now() + req.timeout)
    const scope = createExecutionScope({...context, signal: context.signal ? AbortSignal.any([context.signal, shutdownController.signal]) : shutdownController.signal, deadlineAt})
    const mode = defaultApiMode(req.mode)
    const rungs = channelsForUrl(mode, req.url, req, req.formats ?? [])
    const policy: CrawlPolicy = {
      mode,
      ...(req.allowlistedDomains !== undefined && req.allowlistedDomains.length > 0
        ? { allowlistedDomains: req.allowlistedDomains }
        : {}),
    }
    const runner = new LadderRunner(rungs.channels, policy, historyFor(mode), null, sessionsFor(mode), { channelsFiltered: rungs.filtered })
    // A Monitor's capture (no record) neither reads nor fills the cache: a preview persists nothing.
    // The URL a scrape names; a Monitor's capture (no record) re-reads its URL on a schedule, as a crawler does.
    const robotsOverride = req.robotsOverride ?? (record ? namedUrlOverride : undefined)
    const plan = record ? cachePlanFor(req.url, mode, req, req.formats, rungs.channels, req.robotsOverride, robotsOverride !== undefined) : null
    const operation = (async () => {
      const answer = consultCache(plan, req.url, policy)
      const run = answer.kind === 'fetch'
        ? await runner.run(req.url, undefined, scope, { ...fetchOptions(req, req.formats), ...(robotsOverride === undefined ? {} : { robotsOverride }) })
          .then((fetched) => ({ ...fetched, result: afterFetch(plan, answer, fetched.result) }))
        : { result: answer.result, ...untriedAudit(Math.round(performance.now() - overallStart)) }
      // A page a check stopped: handed to the person when the request asks, else told how it could be.
      const handed = req.handoff !== undefined && answer.kind === 'fetch' && handoffResult(run.result) ? await handOffScrape(req, run.result, context, hooks) : null
      const read = handed !== null && 'result' in handed ? handed.result : null
      // A page read in the person's Chrome keeps what the cache said of this call (a lookup that missed); it is never stored.
      const result: FetchResult = handed === null
        ? withHandoffHint(run.result, req)
        : 'reason' in handed ? withHandoffHint({ ...run.result, warnings: [...(run.result.warnings ?? []), { code: 'handoff_not_through', message: `Handed to you in your Chrome, the page was not read: ${handed.reason}.` }] }, req, true)
          : answer.kind === 'fetch' && answer.missed && plan?.bounds != null ? withCacheMiss(handed.result, plan.bounds) : handed.result
      // The hints of a page read in the person's Chrome speak of that read, not of the stopped run's lanes.
      const agentHints = read !== null ? agentHintsFor(req, { channelsTried: [result.lane], result }) : agentHintsFor(req, { ...run, result })
      // The call's totals count the read in the person's Chrome as one more attempt, after the stopped run's.
      const summary = read === null ? run.summary : { ...run.summary, ...summarize(run.channelsTried, [...run.summary.attempts, { channel: read.lane, result: read, ordinal: run.summary.attempts.length + 1 }]) }
      const full: ScrapeRun = {
        ...result,
        // The answer's third-party spend is the whole call's: a page read in the person's Chrome after a provider tried it still cost what the provider charged.
        usage: { ...result.usage, externalCostUsd: summary.externalCostUsd },
        channelsTried: run.channelsTried,
        ladderTrace: run.ladderTrace,
        summary,
        ...(agentHints.length === 0 ? {} : { agentHints }),
      }
      // A page read in the person's Chrome came after the scrape's deadline may have passed (the person's time is theirs): its
      // JSON is extracted within the caller's and the engine's own signals, not the fetch's deadline.
      const shapeScope = handed !== null && 'result' in handed ? createExecutionScope({ signal: AbortSignal.any([...(context.signal === undefined ? [] : [context.signal]), shutdownController.signal]) }) : scope
      const shaped = await prepareScrapeResponse(full, req, shapeScope, null, overallStart, scrapeId).finally(() => { if (shapeScope !== scope) shapeScope.dispose() })
      // An answer the cache gave fetched nothing: its usage is this call's, its evidence the original fetch's.
      const response = answer.kind === 'fetch' ? shaped : withoutFetchUsage(shaped)
      if (!record) return response
      // Written before the response is sent; a write failure is logged, the response keeps its id, and the full response's trace says so.
      try {
        await writeScrapeRecord(scrapeRecordOf(scrapeId, requestedAt, req, full, response))
        return response
      } catch (error) {
        console.error(JSON.stringify({ component: 'api', event: 'scrape_record_unwritten', scrapeId, error: error instanceof Error ? error.message : String(error) }))
        if (!('trace' in response)) return response
        return { ...response, trace: [...response.trace, { at: Math.round(performance.now() - overallStart), lane: response.lane, event: 'scrape_record_unwritten', detail: { scrapeId } }] }
      }
    })()
    activeScrapes.add(operation)
    try { return await operation } finally { activeScrapes.delete(operation); scope.dispose() }
  }

  /**
   * One map. The start page is read on the http rung alone (fastMode) with
   * its raw HTML, so its anchors' text is at hand; robots.txt through this
   * mode's shared cache under the mode's declared identity, each origin
   * looked up once per map; the sitemaps by a reader of their own on the
   * engine's policy, scheduler and robots cache. A hosted engine's caps and
   * the operator's channel policy are checked before anything is fetched.
   * With sitemap skip no sitemap reader is made; with sitemap only no page
   * is read, so no lane is chosen and a browser-only URL is not refused.
   */
  async function runMap(req: MapRequest, context: ExecutionContext): Promise<MapResponse> {
    checkRobotsOverride('ignoreRobotsTxt', req.ignoreRobotsTxt)
    const robotsOverride = ignoreRobotsOverride(req.ignoreRobotsTxt)
    if (req.limit !== undefined && req.limit > mapMaxLimit) throw new RequestError(`limit must be at most ${mapMaxLimit} on this server`)
    if (req.timeout !== undefined && req.timeout > mapMaxTimeoutMs) throw new RequestError(`timeout must be at most ${mapMaxTimeoutMs} on this server`)
    const readsPage = req.sitemap !== 'only'
    if (readsPage && options.channelPolicy?.(req.url) === 'browser_only') throw new RequestError('map is not available for this URL: this server reads it with the browser lane only')
    const mode = req.mode ?? 'standard'
    // The start page under the standard identity the response reports (identity below), not the compatible transport's.
    const rungs = readsPage ? channelsForUrl(mode, req.url, { fastMode: true }, ['rawHtml'], true, false) : null
    const requestedAt = new Date().toISOString()
    const id = crypto.randomUUID()
    const signal = context.signal ? AbortSignal.any([context.signal, shutdownController.signal]) : shutdownController.signal
    const userAgentFor = (url: string): string => prepareHttpIdentity(mode, networkPolicy.contact ?? null, new URL(url).hostname).identity.userAgent
    const robots = robotsCacheFor(mode)
    const lookups = new Map<string, ReturnType<RobotsOriginCache['lookup']>>()
    const runner = rungs === null ? null : new LadderRunner(rungs.channels, { mode }, historyFor(mode), null, null, { channelsFiltered: rungs.filtered })
    const sitemap = req.sitemap === 'skip' ? null : new HttpSitemapSource({ mode, networkPolicy, scheduler: originScheduler, robots, ignoreRobotsTxt: robotsOverride !== undefined })
    const sources: MapSources = {
      async readStartPage(url, scope) {
        if (runner === null) throw new Error('a sitemap-only map reads no page')
        const run = await runner.run(url, undefined, scope, { ...fetchOptions(undefined, ['rawHtml']), ...(robotsOverride === undefined ? {} : { robotsOverride }) })
        const result = run.result
        const links = typeof result.rawHtml === 'string' ? collectLinkDetails(result.rawHtml, result.evidence.finalUrl || url) : []
        const clientRendered = result.warnings?.some((warning) => warning.code === 'client_rendered_suspected') === true || httpLaneAskedForBrowser(result)
        return { result, links, clientRendered }
      },
      sitemap: sitemap ?? NO_SITEMAP,
      async robotsVerdict(url, scope) {
        const userAgent = userAgentFor(url)
        const origin = new URL(url).origin
        let lookup = lookups.get(origin)
        if (lookup === undefined) {
          lookup = robots.lookup(url, userAgent, scope)
          lookup.catch(() => {})
          lookups.set(origin, lookup)
        }
        const decision = robots.decision(await lookup, url, userAgent)
        return decision.decision === 'disallowed'
          ? { disallowed: true, ...(decision.unreachable === undefined ? {} : { unreachable: decision.unreachable }), ...(isOctocrawlRobotsGroup(decision.matchedUserAgentGroup) ? { octocrawl: true as const } : {}) }
          : decision.decision
      },
      identity: { mode, userAgent: userAgentFor(req.url) },
    }
    const operation = (async () => {
      try {
        // The runner takes an absent option as its default.
        const run = await new MapRunner(sources).run({
          id,
          url: req.url,
          limit: req.limit,
          timeoutMs: req.timeout,
          search: req.search,
          sitemap: req.sitemap,
          includeSubdomains: req.includeSubdomains,
          ignoreQueryParameters: req.ignoreQueryParameters,
          includePaths: req.includePaths,
          excludePaths: req.excludePaths,
          regexOnFullURL: req.regexOnFullURL,
          crawlEntireDomain: req.crawlEntireDomain,
          deduplicateSimilarURLs: req.deduplicateSimilarURLs,
          ignoreRobotsTxt: robotsOverride !== undefined,
        }, { signal })
        const agentHints = mapAgentHints(run, mapMaxTimeoutMs)
        const { elapsedMs, ...rest } = run
        const response: MapResponse = { ...rest, ...(agentHints.length === 0 ? {} : { agentHints }), elapsedMs }
        // Written before the response is sent; a write failure is logged and the response says so.
        try {
          await writeMapRecord({ requestedAt, request: req, response })
          return response
        } catch (error) {
          console.error(JSON.stringify({ component: 'api', event: 'map_record_unwritten', id, error: error instanceof Error ? error.message : String(error) }))
          return { ...response, warnings: [...response.warnings, { code: 'map_record_unwritten' as const, message: `the map record could not be written, so GET /v1/maps/${id} will not find it` }] }
        }
      } finally {
        await sitemap?.close()
      }
    })()
    activeScrapes.add(operation)
    try { return await operation } finally { activeScrapes.delete(operation) }
  }

  return {
    scrape: (req, context = {}, hooks = {}) => runScrape(req, context, true, hooks),

    map: (req, context = {}) => runMap(req, context),

    async getMap(id) {
      if (!UUID.test(id)) return null
      try {
        return JSON.parse(await readFile(join(mapsDir, `${id}.json`), 'utf8')) as MapRecord
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },

    async getScrape(scrapeId) {
      if (!UUID.test(scrapeId)) return null
      try {
        return JSON.parse(await readFile(join(scrapesDir, `${scrapeId}.json`), 'utf8')) as ScrapeRecord
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },

    async startCrawl(req) {
      checkRobotsOverride('ignoreRobotsTxt', req.ignoreRobotsTxt)
      checkFileCap(req)
      checkSelectors(req)
      checkAttributeSelectors(req.formats)
      checkListSelectors(req.formats)
      checkHostedOptions(req)
      const webhookConfig = jobWebhooks.check(req.webhook)
      if (defaultMaxPages !== null && req.maxPages != null && req.maxPages > defaultMaxPages) {
        throw new RequestError(`maxPages must be at most ${defaultMaxPages} on this server`)
      }
      // A crawl may lower its parallelism below the service's workers, never raise it.
      if (req.maxConcurrency != null && req.maxConcurrency > workerCount) {
        throw new RequestError(`maxConcurrency must be at most ${workerCount} on this service`)
      }
      // A retried start is answered from the record before anything is created or fetched.
      const submission = claimSubmission<CrawlAccepted>(req)
      if (submission.replay !== undefined) return submission.replay
      const mode = defaultApiMode(req.mode)
      const taskId = crypto.randomUUID()
      const accepted: CrawlAccepted = { taskId }
      submission.record(taskId, accepted)
      try {
      const taskDir = join(taskRoot, taskId)
      mkdirSync(taskDir, { recursive: true })
      const store = SqliteTaskStore.open(taskDir)
      const now = new Date().toISOString()
      const task: Task = {
        id: taskId,
        seedUrl: req.url,
        taskDir,
        mode,
        status: 'pending',
        budget: {
          maxPages: req.maxPages ?? defaultMaxPages,
          maxWallMs: null,
          maxCostUsd: accessGrant?.budget.perRunUsd ?? null,
          maxTokens: null,
        },
        crawl: {
          formats: req.formats ?? ['markdown'],
          includeLinks: req.includeLinks === true,
          includePaths: req.includePaths ?? [],
          excludePaths: req.excludePaths ?? [],
          maxDepth: req.maxDepth ?? null,
          allowlistedDomains: req.allowlistedDomains ?? [],
          useCached: req.useCached === true,
          regexOnFullURL: req.regexOnFullURL === true,
          ignoreQueryParameters: req.ignoreQueryParameters === true,
          deduplicateSimilarURLs: req.deduplicateSimilarURLs !== false,
          crawlEntireDomain: req.crawlEntireDomain === true,
          allowSubdomains: req.allowSubdomains === true,
          allowExternalLinks: req.allowExternalLinks === true,
          sitemap: req.sitemap ?? 'include',
          maxConcurrency: req.maxConcurrency ?? null,
          ...(req.ignoreRobotsTxt === true ? { ignoreRobotsTxt: true } : {}),
          ...pageOptions(req),
          // The destination is registered first (`job:<taskId>`); the task stores everything but the header values.
          ...(webhookConfig === undefined ? {} : { webhook: jobWebhooks.register(taskId, webhookConfig, req.webhookPayloadFormat) }),
        },
        ...attributionOf(req),
        createdAt: now,
        updatedAt: now,
      }
      await store.putTask(task)
      jobWebhooks.started(task)
      void jobEvents.emit({ type: 'started', taskId, jobKind: 'crawl' })
      launchTask(task, store, crawlRunOptions(task, false))
      } catch (error) { submission.forget(); throw error }
      return accepted
    },

    async listActiveCrawls() {
      const crawls: ActiveCrawl[] = []
      // The crawls this process runs are the ids in flight: O(active) read-only opens, never a scan of the task root.
      for (const id of inflight.keys()) {
        if (!existsSync(join(taskRoot, id, 'checkpoint.sqlite'))) continue
        const store = SqliteTaskStore.openReadOnly(join(taskRoot, id))
        try {
          const task = await store.getTask(id)
          if (task === null || task.batch !== undefined || (task.status !== 'pending' && task.status !== 'running' && task.status !== 'paused')) continue
          const latest = (await store.listAttempts(id)).at(-1)
          crawls.push({ id, url: task.seedUrl, status: task.status, startedAt: latest?.startedAt ?? task.createdAt, pagesFetched: latest?.pagesFetched ?? 0, options: activeCrawlOptions(task) })
        } finally {
          await store.close()
        }
      }
      return { crawls: crawls.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)) }
    },

    async startBatch(req) {
      if (batchStartInProgress) throw new RequestError('another batch submission is in progress')
      checkFileCap(req)
      checkSelectors(req)
      checkAttributeSelectors(req.formats)
      checkListSelectors(req.formats)
      checkRobotsOverride('robotsOverrides', req.robotsOverrides)
      checkHostedOptions(req)
      const webhookConfig = jobWebhooks.check(req.webhook)
      batchStartInProgress = true
      try {
      const canonical = req.urls.map(url => canonicalizeUrl(url))
      if (canonical.some(url => url === null) || new Set(canonical).size !== canonical.length) throw new RequestError('urls must be unique after canonicalization')
      // A retried submission is answered from the record before anything is counted, created or fetched; an append creates no task, and appendToBatch counts it against the batch limit only when it runs a completed batch again.
      const submission = claimSubmission<BatchAccepted>(req)
      if (submission.replay !== undefined) return submission.replay
      if (req.appendToId !== undefined) return await appendToBatch(req, canonical as string[], submission)
      if (options.maxActiveBatches !== undefined && await activeBatchCount() >= options.maxActiveBatches) {
        throw new RequestError('active batch limit reached')
      }
      const taskId = crypto.randomUUID()
      const taskDir = join(taskRoot, taskId)
      const now = new Date().toISOString()
      const urls = [...req.urls]
      // The skipped entries stay on the record with the task and on the 202, so the refusal is visible later too.
      const invalidURLs = req.invalidURLs === undefined ? undefined : [...req.invalidURLs]
      const batch: NonNullable<Task['batch']> = {
        urls, formats: req.formats ?? ['markdown'], includeLinks: req.includeLinks === true, ...pageOptions(req),
        ...(req.robotsOverrides === undefined ? {} : { robotsOverrides: req.robotsOverrides }),
        ...(req.maxConcurrency === undefined ? {} : { maxConcurrency: req.maxConcurrency }),
        ...(invalidURLs === undefined ? {} : { invalidURLs }),
        ...(webhookConfig === undefined ? {} : { webhook: jobWebhooks.register(taskId, webhookConfig, req.webhookPayloadFormat) }),
      }
      const task: Task = {
        id: taskId, seedUrl: urls[0]!, taskDir, mode: defaultApiMode(req.mode), status: 'pending',
        budget: { maxPages: null, maxWallMs: options.batchMaxWallMs ?? null, maxCostUsd: accessGrant?.budget.perRunUsd ?? null, maxTokens: null },
        batch,
        ...attributionOf(req),
        createdAt: now, updatedAt: now,
      }
      const accepted: BatchAccepted = { taskId, ...(invalidURLs === undefined ? {} : { invalidURLs }) }
      submission.record(taskId, accepted)
      try {
        const store = SqliteTaskStore.open(taskDir)
        await store.putTask(task)
        jobWebhooks.started(task)
        void jobEvents.emit({ type: 'started', taskId, jobKind: 'batch' })
        launchTask(task, store, batchRunOptions(batch, false))
      } catch (error) { submission.forget(); throw error }
      return accepted
      } finally { batchStartInProgress = false }
    },

    getBatch: loadBatch,

    jobEvents,

    async listJobPages(taskId, query) {
      const page = await loadCrawlPageList(taskId, { cursor: query.cursor, limit: query.limit }, 'all', true)
      if (page === null) return null
      return { ...page, items: page.items.map(({ audit: _audit, ...item }) => ({ ...item, trace: [] })) }
    },

    async getBatchItems(taskId, query) {
      if (await this.getBatch(taskId) === null) return null
      const page = await loadCrawlPageList(taskId, { ...query, limit: Math.min(50, query?.limit ?? 10) }, 'all', true)
      if (page === null || query?.debug === true) return page
      return { ...page, items: page.items.map(({ audit: _audit, ...item }) => ({ ...item, trace: [] })) }
    },

    async getBatchErrors(taskId, query = {}) {
      // A job id names a directory under the task root: anything but an id this server issues names none.
      if (!UUID.test(taskId)) return null
      if (!existsSync(join(taskRoot, taskId, 'checkpoint.sqlite'))) return null
      const store = SqliteTaskStore.openReadOnly(join(taskRoot, taskId))
      try {
        const task = await store.getTask(taskId)
        if (!task?.batch) return null
        // Every attempt's error steps, no attempt filter: a batch interrupted and resumed keeps its earlier failures on the record.
        const page = await store.listStepsPage(taskId, { cursor: query.cursor, limit: query.limit ?? BATCH_ERRORS_MAX_LIMIT, kind: 'errors' })
        // The robots.txt refusals are a projection of the same error steps, over the whole batch rather than the page asked for.
        const robotsBlocked: string[] = []
        for (let cursor: string | undefined; ;) {
          const all = await store.listStepsPage(taskId, { cursor, limit: BATCH_ERRORS_MAX_LIMIT, kind: 'errors' })
          for (const step of all.steps) if (step.result !== null && robotsRefusal(step.result) !== null) robotsBlocked.push(step.url)
          if (!all.hasMore || all.nextCursor === null) break
          cursor = all.nextCursor
        }
        return { errors: page.steps.map(batchErrorItem), robotsBlocked, nextCursor: page.nextCursor, hasMore: page.hasMore }
      } finally { await store.close() }
    },

    async cancelBatch(taskId) {
      if (await this.getBatch(taskId) === null) return null
      await this.cancelCrawl(taskId)
      return this.getBatch(taskId)
    },

    async getCrawl(taskId) {
      const detail = await loadCrawlWithSteps(taskId)
      return detail?.report ?? null
    },

    getCrawlWithSteps: loadCrawlWithSteps,

    async getCrawlStatusPage(taskId, query) {
      // A job id names a directory under the task root: anything but an id this server issues names none.
      if (!UUID.test(taskId)) return null
      if (!existsSync(join(taskRoot, taskId, 'checkpoint.sqlite'))) return null
      if (query.cursor !== undefined) {
        try { decodeStepCursor(query.cursor) } catch { throw new RequestError('cursor is not one this API issued') }
      }
      const store = SqliteTaskStore.openReadOnly(join(taskRoot, taskId))
      try {
        const task = await store.getTask(taskId)
        if (task === null) return null
        // Status, counts and one page of steps: no step body beyond that page is read.
        const attemptId = (await store.listAttempts(taskId)).at(-1)?.id
        const page = attemptId === undefined ? { steps: [], hasMore: false } : await store.listStepsPage(taskId, { attemptId, cursor: query.cursor, limit: query.limit, kind: 'all' })
        const counts = attemptId === undefined ? {} : await store.countSteps(taskId, attemptId)
        const last = page.steps.at(-1)
        return {
          status: task.status,
          steps: page.steps.map((step) => step.result === null ? step : { ...step, result: { ...step.result, ...askedHtmlFormats(task, step.result) } }),
          cursor: last === undefined ? query.cursor ?? null : encodeStepCursor(last.createdAt, last.id),
          hasMore: page.hasMore,
          counts,
          ahead: runningCrawls.get(taskId)?.pagesAhead() ?? null,
        }
      } finally {
        await store.close()
      }
    },

    async getCrawlPages(taskId, query) {
      const page = await loadCrawlPageList(taskId, query, 'pages')
      // Like batch items: the routing audit and trace only with debug=true.
      if (page === null || query?.debug === true) return page
      return { ...page, items: page.items.map(({ audit: _audit, ...item }) => ({ ...item, trace: [] })) }
    },

    getCrawlErrors: async (taskId, query) => {
      const page = await loadCrawlPageList(taskId, query, 'errors')
      if (page === null) return null
      return page
    },

    async cancelCrawl(taskId) {
      // A job id names a directory under the task root: anything but an id this server issues names none.
      if (!UUID.test(taskId)) return null
      if (!existsSync(join(taskRoot, taskId))) return null
      const store = SqliteTaskStore.open(join(taskRoot, taskId))
      try {
        const task = await store.getTask(taskId)
        if (task === null) return null
        if (task.status === 'pending' || task.status === 'running' || task.status === 'paused') {
          const now = new Date().toISOString()
          await store.putTask({ ...task, status: 'cancelled', updatedAt: now })
          const attempts = await store.listAttempts(taskId)
          const latest = attempts[attempts.length - 1]
          if (latest?.status === 'running') await store.putAttempt({ ...latest, status: 'cancelled', endedAt: now })
          crawlControllers.get(taskId)?.abort()
          // A run in this process ends with the cancellation and sends the terminal event itself; a task no run is working on gets it here.
          if (!inflight.has(taskId)) {
            await finishJob(task, store)
            // Its cookie session too, which only a run would otherwise remove.
            await TaskCookieSession.remove(join(taskRoot, taskId, COOKIE_SESSION_FILE)).catch(() => {})
          }
        }
      } finally {
        await store.close()
      }
      return (await loadCrawlWithSteps(taskId))?.report ?? null
    },

    async resumeCrawl(taskId) {
      // A job id names a directory under the task root: anything but an id this server issues names none.
      if (!UUID.test(taskId)) return null
      if (!existsSync(join(taskRoot, taskId, 'checkpoint.sqlite'))) return null
      const store = SqliteTaskStore.open(join(taskRoot, taskId))
      let launched = false
      try {
        const task = await store.getTask(taskId)
        if (task === null) return null
        const refusal = resumeRefusal(task, inflight.has(taskId))
        if (refusal !== null) throw new CrawlStateError(refusal)
        // Pending until the orchestrator opens its new attempt, never still "paused".
        const pending: Task = { ...task, status: 'pending', updatedAt: new Date().toISOString() }
        await store.putTask(pending)
        try { launchTask(pending, store, crawlRunOptions(pending, true)) }
        catch (error) { await store.putTask(task); throw error }
        launched = true
        return { taskId }
      } finally {
        if (!launched) await store.close()
      }
    },

    async importLogin(req) {
      if (options.hosted === true || (options.sessionsFile ?? null) === null || userChrome === null) throw new LoginsUnavailableError('this server does not save logins: run Octocrawl on your own machine (octocrawl serve, the local MCP host, or octocrawl login import)')
      try { loginDomain(req.site) }
      catch (error) { throw new RequestError(error instanceof Error ? error.message : String(error)) }
      const imported = await importChromeLogin({
        site: req.site,
        sessionsFile: options.sessionsFile!,
        ...(userChrome.userDataDir === undefined ? {} : { userDataDir: userChrome.userDataDir }),
        ...(userChrome.connect === undefined ? {} : { connect: userChrome.connect }),
        ...(req.approveTimeoutMs === undefined ? {} : { timeoutMs: req.approveTimeoutMs }),
      })
      const saved = (await listSavedLogins(options.sessionsFile!)).find((login) => login.domain === imported.domain)
      if (saved === undefined) throw new Error(`the login to ${imported.domain} was not found in the sessions file after it was saved`)
      return { ...saved, localStorageRead: imported.localStorageRead, localStorageUnread: imported.localStorageUnread, localStorageUnreadReasons: imported.localStorageUnreadReasons }
    },

    async listLogins() {
      if (options.hosted === true || (options.sessionsFile ?? null) === null) return []
      return listSavedLogins(options.sessionsFile!)
    },

    async removeLogin(site) {
      if (options.hosted === true || (options.sessionsFile ?? null) === null) throw new LoginsUnavailableError('this server keeps no saved logins')
      try { loginDomain(site) }
      catch (error) { throw new RequestError(error instanceof Error ? error.message : String(error)) }
      return removeSavedLogin(options.sessionsFile!, site)
    },

    async endHandoffs() {
      handoffClosing.abort(new DOMException('service shutdown', 'ShutdownError'))
      await Promise.all([...handoffRuns].map((run) => run.catch(() => {})))
    },

    handOffBatch(taskId, req, hooks = {}) {
      const run = handOff(taskId, req, hooks)
      handoffRuns.add(run)
      void run.catch(() => {}).finally(() => handoffRuns.delete(run))
      return run
    },

    async runFirecrawlMonitor(triggerKey, context) {
      initializeFirecrawlMonitor(monitorStore)
      return this.runMonitor(FIRECRAWL_MONITOR_ID, triggerKey, context)
    },
    async getFirecrawlMonitor() {
      initializeFirecrawlMonitor(monitorStore)
      return monitorStore.view(FIRECRAWL_MONITOR_ID, Date.now())
    },
    configureMonitor(revision, initialEnabled = true) { return monitorStore.createOrGetRevision(revision, initialEnabled) },
    async previewMonitor(revision, context = {}) {
      // Assessment and capture are identical to a run, but no monitor or event is persisted.
      const result = revision.config?.captureMode === 'http'
        ? await conditionalHttp.fetch(revision.url, context.deadlineAt ?? Date.now() + 300_000, context.signal)
        : await runScrape({url:revision.url,debug:true}, context, false) as ScrapeResponse
      const assessment = revision.config ? assessConfiguredDocument(result, revision) : assessFirecrawlIntroduction(result)
      return {url:revision.url,finalUrl:result.evidence.finalUrl ?? null,status:result.status,assessment,sampleMarkdown:result.markdown?.slice(0, 3000) ?? null,capturedAt:Date.now()}
    },
    getMonitor(id) { return monitorStore.hasMonitor(id) ? monitorStore.view(id, Date.now()) : null },
    getMonitorRun(id, runId) { return monitorStore.runDetail(id, runId) },
    listMonitors() { return monitorStore.listMonitorIds().map((id) => monitorStore.view(id, Date.now())) },
    enqueueMonitorRun(id, triggerKey) { return monitorStore.enqueueRun(id, triggerKey) },
    async runMonitor(id, triggerKey, context = {}) {
      const revision = monitorStore.getRevision(id)
      const controller = new AbortController()
      const controllers = monitorControllers.get(id) ?? new Set<AbortController>()
      controllers.add(controller); monitorControllers.set(id, controllers)
      const signal = AbortSignal.any([controller.signal, shutdownController.signal, ...(context.signal ? [context.signal] : [])])
      const operation = runConfiguredMonitor(monitorStore, revision, async (capture) => {
        if (capture.captureMode === 'http') {
          const result = await conditionalHttp.fetch(revision.url, capture.deadlineAt, capture.signal, capture, capture.onRetryAfter)
          return {result, links: result.links ?? []}
        }
        const result = await runScrape({url: revision.url, debug: true}, capture, false) as ScrapeResponse
        return {result, links: result.links ?? [], audit: {channelsTried: result.channelsTried, ladderTrace: result.ladderTrace, summary: result.summary}}
      }, triggerKey, {...context, signal})
      activeScrapes.add(operation)
      try { return await operation } finally {
        activeScrapes.delete(operation); controllers.delete(controller)
        if (!controllers.size) monitorControllers.delete(id)
      }
    },
    cancelMonitorRun(id, runId) {
      const view = monitorStore.cancel(id, runId)
      // Only abort live work when the cancelled run is the currently active one.
      if (!view.runs.some(run => run.state === 'running')) for (const controller of monitorControllers.get(id) ?? []) controller.abort()
      return view
    },
    setMonitorEnabled(id, enabled) {
      const view = monitorStore.setEnabled(id, enabled)
      if (!enabled) for (const controller of monitorControllers.get(id) ?? []) controller.abort()
      return view
    },
    createDeliveryDestination(input) {
      return monitorStore.registerDestination(input)
    },
    listDeliveryDestinations: (query = {}) => deliveryStore.listDestinations(deliverySubject(query)),
    setDeliveryDestinationEnabled: (id, enabled) => deliveryStore.setDestinationEnabled(id, enabled),
    listDeliveries: (query = {}) => deliveryStore.listDeliveries(deliveryQuery(query)),
    getDeliveriesPage: (query = {}) => deliveryStore.listDeliveriesPage(deliveryQuery(query)),
    getDelivery(id) { const delivery = deliveryStore.getDelivery(id); return delivery ? {delivery, attempts: deliveryStore.attempts(id)} : null },
    retryDelivery: (id) => deliveryStore.replayDeadLetter(id),

    async createManagedSession(input) {
      const profileDir = join(taskRoot, 'profiles', crypto.randomUUID())
      return sessionBroker.createManagedSession({ ...input, profileDir })
    },

    async authorizeManagedSession(sessionRef, accountRef) {
      return sessionBroker.markAuthorized(sessionRef, accountRef)
    },

    async revokeManagedSession(sessionRef) {
      await sessionBroker.revoke(sessionRef)
    },

    async getManagedSession(sessionRef) { return sessionBroker.getSession(sessionRef) },

    async renewManagedSession(sessionRef, expiresAt) { return sessionBroker.renewExpired(sessionRef, expiresAt) },

    async requestManagedHandoff(sessionRef, reason, expiresAt) { return sessionBroker.requestHandoff(sessionRef, reason, expiresAt) },

    async captureManagedSession(input) {
      const access = await sessionBroker.grant({ ...input, origin: input.url })
      if (access.kind !== 'granted') return access
      const session = await sessionBrokerStoreGet(sessionBroker, input.sessionRef)
      const subject = new BrowserLocalSubject('standard', null, false, networkPolicy, session.profileDir)
      try { return await subject.fetch(input.url) } finally { await subject.teardown() }
    },

    async close(options = {}) {
      if (options.cancelActive) {
        shutdownController.abort(new DOMException('service shutdown', 'ShutdownError'))
      }
      // A handoff ends now and closes the tab it had open in the person's Chrome before the engine is gone.
      await this.endHandoffs()
      // A relaunch an append scheduled while a run was finishing is a new entry: wait until nothing is in flight.
      while (inflight.size > 0) await Promise.all([...inflight.values()].map((job) => job.catch(() => {})))
      await Promise.all([...activeScrapes].map((job) => job.catch(() => {})))
      await Promise.all([...channelsByMode.values()].flatMap((channels) => channels.map((channel) => channel.close?.().catch(() => {}))))
      channelsByMode.clear()
      await Promise.all([...robotsCaches.values()].map((cache) => cache.teardown().catch(() => {})))
      robotsCaches.clear()
      crawlControllers.clear()
      monitorStore.close()
      deliveryStore.close()
      idempotency.close()
      pageCache.close()
    },
  }

  /**
   * `appendToId`: the URLs go to the end of the batch's stored list, the
   * job's options stay, and no new task is created. A running orchestrator
   * seeds the tail itself from the row it re-reads, so an append to a
   * pending, running or paused batch adds no run and is not counted against
   * the active-batch limit; a batch no run is working on (completed, or left
   * by a crash) is relaunched as a resume, which seeds only the URLs without
   * a step, and a completed batch, active again from that relaunch, counts
   * against the limit as a new batch does. The record is the longer list in
   * the checkpoint and the steps of the appended URLs in whichever attempt
   * fetched them.
   */
  async function appendToBatch(req: ParsedBatchStartRequest, canonical: readonly string[], submission: Submission<BatchAccepted>): Promise<BatchAccepted> {
    const id = req.appendToId!
    if (!UUID.test(id) || !existsSync(join(taskRoot, id, 'checkpoint.sqlite'))) throw new TaskNotFoundError(`batch not found: ${id}`)
    const store = SqliteTaskStore.open(join(taskRoot, id))
    let launched = false
    try {
      const task = await store.getTask(id)
      if (task === null || task.batch === undefined) throw new TaskNotFoundError(`batch not found: ${id}`)
      const total = task.batch.urls.length + req.urls.length
      if (total > 1000) throw new RequestError('batch would exceed 1000 URLs')
      const present = new Set(task.batch.urls.map((url) => canonicalizeUrl(url) ?? url))
      const repeated = canonical.findIndex((url) => present.has(url))
      if (repeated !== -1) throw new RequestError(`appended url is already in the batch: ${req.urls[repeated]}`)
      if (task.status === 'cancelled' || task.status === 'failed') throw new CrawlStateError(`batch is ${task.status}`)
      // A completed batch runs again for the new URLs and so is active again: under an active-batch limit that is refused as a new
      // batch is while the limit is reached, before anything is written or recorded. Its own row is `completed`, so it is not among
      // those counted; a pending, running or paused batch is counted already, and its append adds no run.
      if (task.status === 'completed' && options.maxActiveBatches !== undefined && await activeBatchCount() >= options.maxActiveBatches) {
        throw new RequestError('active batch limit reached')
      }
      const now = new Date().toISOString()
      const invalidURLs = req.invalidURLs === undefined ? undefined : [...req.invalidURLs]
      // Pushed to the end, in order: the orchestrator seeds the tail past what it has seeded, by index.
      const batch: NonNullable<Task['batch']> = {
        ...task.batch,
        urls: [...task.batch.urls, ...req.urls],
        ...(req.robotsOverrides === undefined ? {} : { robotsOverrides: [...(task.batch.robotsOverrides ?? []), ...req.robotsOverrides] }),
        ...(invalidURLs === undefined && task.batch.invalidURLs === undefined ? {} : { invalidURLs: [...(task.batch.invalidURLs ?? []), ...(invalidURLs ?? [])] }),
      }
      // A completed batch has work again; a pending, running or paused one keeps its status.
      const updated: Task = { ...task, batch, status: task.status === 'completed' ? 'pending' : task.status, updatedAt: now }
      await store.putTask(updated)
      const accepted: BatchAccepted = { taskId: id, requested: total, appended: req.urls.length, ...(invalidURLs === undefined ? {} : { invalidURLs }) }
      submission.record(id, accepted)
      if (!inflight.has(id)) {
        launchTask(updated, store, batchRunOptions(batch, true))
        launched = true
      }
      return accepted
    } finally {
      if (!launched) await store.close()
    }
  }
}

/** The local rungs that render a page and so can capture the `screenshot` format. */
const BROWSER_RUNGS: ReadonlySet<string> = new Set(['browser_local', 'authed_session'])

function isTerminalStatus(status: TaskStatus): status is JobTerminalStatus {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

/** The subject a delivery listing is about: a Monitor by its id, or a job by `jobId` (its destination's monitor id is `job:<taskId>`); not both at once. */
function deliverySubject(query: { monitorId?: string; jobId?: string }): string | undefined {
  if (query.jobId !== undefined && query.monitorId !== undefined) throw new RequestError('jobId and monitorId cannot be combined')
  return query.jobId === undefined ? query.monitorId : `job:${query.jobId}`
}

/** A delivery query for the store: `jobId` folded into `monitorId`. */
function deliveryQuery<T extends DeliveryQuery>(query: T): Omit<T, 'jobId'> {
  const { jobId: _jobId, ...rest } = query
  const monitorId = deliverySubject(query)
  return { ...rest, ...(monitorId === undefined ? {} : { monitorId }) }
}

/**
 * What a request or stored task asks each lane to capture. Its timeout is the
 * deadline; passed on, it lets the lanes' waits run to it. `html`, `rawHtml`,
 * `images`, `tables`, an `attributes` entry and a `screenshot` entry among its formats
 * ask the lanes to carry them on the result.
 */
function fetchOptions(options: PageOptions | undefined, formats: readonly ScrapeFormat[] = []): FetchOptions {
  const attributes = attributesFormat(formats)
  const screenshot = screenshotFormat(formats)
  const list = listFormat(formats)
  return {
    ...(options?.onlyMainContent === undefined ? {} : { onlyMainContent: options.onlyMainContent }),
    ...(options?.waitFor === undefined ? {} : { waitFor: options.waitFor }),
    ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options?.maxFileBytes === undefined ? {} : { maxFileBytes: options.maxFileBytes }),
    ...(options?.parsers === undefined ? {} : { parsers: options.parsers }),
    ...(options?.includeTags === undefined ? {} : { includeTags: options.includeTags }),
    ...(options?.excludeTags === undefined ? {} : { excludeTags: options.excludeTags }),
    ...(options?.headers === undefined ? {} : { headers: options.headers }),
    ...(options?.mobile === undefined ? {} : { mobile: options.mobile }),
    ...(options?.skipTlsVerification === undefined ? {} : { skipTlsVerification: options.skipTlsVerification }),
    ...(options?.blockAds === undefined ? {} : { blockAds: options.blockAds }),
    ...(options?.removeBase64Images === undefined ? {} : { removeBase64Images: options.removeBase64Images }),
    ...(formats.includes('html') ? { includeHtml: true } : {}),
    ...(formats.includes('rawHtml') ? { includeRawHtml: true } : {}),
    ...(formats.includes('images') ? { includeImages: true } : {}),
    ...(formats.includes('tables') ? { includeTables: true } : {}),
    ...(attributes === undefined ? {} : { attributes: attributes.selectors }),
    ...(screenshot === undefined ? {} : { screenshot }),
    ...(options?.actions === undefined ? {} : { actions: options.actions }),
    ...(list === undefined ? {} : { list }),
  }
}

/** The page options a batch or crawl request set, stored on its task so a resumed task keeps them (`fastMode` among them: it selects rungs, not a lane option). */
function pageOptions(req: PageOptions): PageOptions {
  return {
    ...fetchOptions(req),
    ...(req.timeout === undefined ? {} : { timeout: req.timeout }),
    ...(req.fastMode === undefined ? {} : { fastMode: req.fastMode }),
    ...(req.maxAge === undefined ? {} : { maxAge: req.maxAge }),
    ...(req.minAge === undefined ? {} : { minAge: req.minAge }),
    ...(req.storeInCache === undefined ? {} : { storeInCache: req.storeInCache }),
    ...(req.lockdown === undefined ? {} : { lockdown: req.lockdown }),
  }
}

/**
 * A response the cache answered: its usage is this call's, which requested
 * nothing (no request, attempt, byte or browser time, and none of the
 * original fetch's network timings), with the call's own wall time and its
 * serialize, model and total times; the result's evidence stays the
 * original fetch's.
 */
function withoutFetchUsage<T extends ScrapeResponse | CompactScrapeResponse>(response: T): T {
  const { timings, ...usage } = response.usage as T['usage'] & { timings?: { serializeMs?: number; modelMs?: number; totalMs?: number } }
  const own = timings === undefined ? undefined : {
    ...(timings.serializeMs === undefined ? {} : { serializeMs: timings.serializeMs }),
    ...(timings.modelMs === undefined ? {} : { modelMs: timings.modelMs }),
    ...(timings.totalMs === undefined ? {} : { totalMs: timings.totalMs }),
  }
  return { ...response, usage: { ...usage, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, browserMs: 0, externalCostUsd: 0, ...(own === undefined ? {} : { timings: own }) } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A task root holds pages read with the person's session, saved files and
 * job databases: one this engine creates is readable by them alone, with a
 * .gitignore so a repository it sits in does not take it in. A root that
 * exists is theirs, and is left as it is.
 */
function prepareTaskRoot(taskRoot: string): void {
  if (existsSync(taskRoot)) return
  mkdirSync(taskRoot, { recursive: true, mode: 0o700 })
  writeFileSync(join(taskRoot, '.gitignore'), '*\n')
}

/** `origin` and `integration` as the request said them, for the task's `attribution`; nothing when it named neither. */
function attributionOf(req: RequestAttribution): Pick<Task, 'attribution'> {
  const attribution: RequestAttribution = { ...(req.origin === undefined ? {} : { origin: req.origin }), ...(req.integration === undefined ? {} : { integration: req.integration }) }
  return Object.keys(attribution).length === 0 ? {} : { attribution }
}

/**
 * The record of one scrape call: the request with each header's value
 * replaced by its name, who made it, the verdict and the call's facts. No
 * page body, no trace, no audit: the response carries those.
 */
function scrapeRecordOf(scrapeId: string, requestedAt: string, req: ScrapeRequest, run: ScrapeRun, response: ScrapeResponse | CompactScrapeResponse): ScrapeRecord {
  const { origin: _origin, integration: _integration, ...request } = req
  return {
    scrapeId,
    requestedAt,
    request: { ...request, ...(req.headers === undefined ? {} : { headers: Object.fromEntries(Object.keys(req.headers).map((name) => [name, name])) }) },
    ...attributionOf(req).attribution,
    status: response.status,
    failureReason: response.failureReason,
    blockReason: response.blockReason,
    budgetExceeded: response.budgetExceeded,
    lane: response.lane,
    channelsTried: response.channelsTried,
    metadata: response.metadata,
    snapshot: scrapeSnapshot(run),
    usage: {
      wallMs: response.usage.wallMs,
      totalMs: 'summary' in response ? response.summary.totalMs ?? response.usage.wallMs : response.usage.totalMs,
      requestCount: response.usage.requestCount,
      attemptCount: response.usage.attemptCount,
      browserMs: response.usage.browserMs,
    },
    ...(response.warnings === undefined || response.warnings.length === 0 ? {} : { warnings: response.warnings }),
    ...(response.agentHints === undefined || response.agentHints.length === 0 ? {} : { agentHints: response.agentHints }),
  }
}

/** A batch's recorded robots overrides by URL, as sent and in canonical form; every other URL has none. */
function robotsOverrideLookup(overrides: readonly RobotsUrlOverride[]): (url: string) => RobotsOverride | undefined {
  const byUrl = new Map<string, RobotsOverride>()
  for (const { url, reason, recordedBy } of overrides) {
    const override: RobotsOverride = { reason, ...(recordedBy === undefined ? {} : { recordedBy }) }
    byUrl.set(url, override)
    const canonical = canonicalizeUrl(url)
    if (canonical !== null) byUrl.set(canonical, override)
  }
  return (url) => byUrl.get(url) ?? byUrl.get(canonicalizeUrl(url) ?? url)
}

/** A crawl stored with every option it needs to resume (older tasks lack maxDepth and hosts). */
function crawlOptionsStored(task: Task): boolean {
  return task.batch === undefined && task.crawl?.maxDepth !== undefined
}

/** The URL-scope options of a run, as CrawlStartRequest names them. */
type CrawlScopeOptions = Required<Pick<CrawlStartRequest, 'regexOnFullURL' | 'ignoreQueryParameters' | 'deduplicateSimilarURLs' | 'crawlEntireDomain' | 'allowSubdomains' | 'allowExternalLinks'>>

/** What launchTask runs a task with: its stored limits and scope, its sitemap mode and concurrency cap, and the hosts governance lets its ladder fetch (empty: no restriction). */
interface TaskRunOptions {
  maxDepth: number | null
  allowlistedDomains: readonly string[]
  useCached: boolean
  resume: boolean
  scope: CrawlScopeOptions
  sitemap: SitemapMode
  maxConcurrency: number | null
  policyAllowlist: readonly string[]
}

/** A batch never discovers: its frontier takes the whole host and exact canonical URLs. */
const BATCH_SCOPE: CrawlScopeOptions = { regexOnFullURL: false, ignoreQueryParameters: false, deduplicateSimilarURLs: false, crawlEntireDomain: true, allowSubdomains: false, allowExternalLinks: false }

/**
 * A batch runs under the cap stored with it (`maxConcurrency`, null for the
 * service's worker count), on a restart too. It fetches exactly the URLs it
 * was given, at depth 0, so it names no hosts: a frontier seed passes the host
 * scope, and governance lists no domains (a list of the batch's own hosts
 * added nothing and would refuse a URL appended on a new host); every page
 * still gets its own robots.txt, SSRF and identity checks, and the mode's
 * channel set is unchanged.
 */
function batchRunOptions(batch: Pick<NonNullable<Task['batch']>, 'urls' | 'maxConcurrency'>, resume: boolean): TaskRunOptions {
  return { maxDepth: 0, allowlistedDomains: [], useCached: false, resume, scope: BATCH_SCOPE, sitemap: 'skip', maxConcurrency: batch.maxConcurrency ?? null, policyAllowlist: [] }
}

/**
 * A completed batch whose URL list grew after its run had stopped seeding
 * (an append that landed as the workers were finishing): URLs without a step
 * remain, and a relaunch as a resume fetches them. Null when every URL has
 * its step, when the batch did not complete (cancelled, paused and failed
 * stay as they are) or when a budget cut the run short (a time-cut batch does
 * not run again by itself), so a relaunch always has URLs to fetch and the
 * sequence ends.
 */
async function appendedWithoutStep(taskId: string, store: SqliteTaskStore): Promise<(Task & { batch: NonNullable<Task['batch']> }) | null> {
  const task = await store.getTask(taskId)
  if (task === null || task.batch === undefined || task.status !== 'completed') return null
  const batch = task.batch
  if ((await store.listAttempts(taskId)).at(-1)?.budgetExceeded !== null) return null
  return await store.countCompletedSteps(taskId) < batch.urls.length ? { ...task, batch } : null
}

/** The options a running crawl reports: its task's stored options, with the defaults a task stored before an option existed runs under, plus its page budget. */
function activeCrawlOptions(task: Task): ActiveCrawlOptions {
  const { formats, includeLinks, includePaths, excludePaths, maxDepth, allowlistedDomains, useCached, regexOnFullURL, ignoreQueryParameters, deduplicateSimilarURLs, crawlEntireDomain, allowSubdomains, allowExternalLinks, sitemap, maxConcurrency, ignoreRobotsTxt, webhook: _webhook, ...page } = task.crawl ?? {}
  return {
    maxPages: task.budget.maxPages,
    maxDepth: maxDepth ?? null,
    allowlistedDomains: allowlistedDomains ?? [],
    includePaths: includePaths ?? [],
    excludePaths: excludePaths ?? [],
    useCached: useCached === true,
    sitemap: sitemap ?? 'skip',
    ignoreQueryParameters: ignoreQueryParameters ?? false,
    deduplicateSimilarURLs: deduplicateSimilarURLs ?? false,
    crawlEntireDomain: crawlEntireDomain ?? true,
    allowSubdomains: allowSubdomains ?? false,
    allowExternalLinks: allowExternalLinks ?? false,
    regexOnFullURL: regexOnFullURL ?? false,
    maxConcurrency: maxConcurrency ?? null,
    ignoreRobotsTxt: ignoreRobotsTxt === true,
    scrapeOptions: { formats: formats ?? ['markdown'], includeLinks: includeLinks === true, ...page },
  }
}

/**
 * The run options a crawl task was stored with. A task stored before the
 * URL-scope options were kept runs under the rule it was started with: the
 * whole host (`crawlEntireDomain`) and exact canonical URLs (no
 * `deduplicateSimilarURLs`).
 */
function crawlRunOptions(task: Task, resume: boolean): TaskRunOptions {
  const stored = task.crawl
  const allowlistedDomains = stored?.allowlistedDomains ?? []
  const scope: CrawlScopeOptions = {
    regexOnFullURL: stored?.regexOnFullURL ?? false,
    ignoreQueryParameters: stored?.ignoreQueryParameters ?? false,
    deduplicateSimilarURLs: stored?.deduplicateSimilarURLs ?? false,
    crawlEntireDomain: stored?.crawlEntireDomain ?? true,
    allowSubdomains: stored?.allowSubdomains ?? false,
    allowExternalLinks: stored?.allowExternalLinks ?? false,
  }
  // A task stored before the sitemap mode was kept read no sitemap, and resumes that way.
  return { maxDepth: stored?.maxDepth ?? null, allowlistedDomains, useCached: stored?.useCached === true, resume, scope, sitemap: stored?.sitemap ?? 'skip', maxConcurrency: stored?.maxConcurrency ?? null, policyAllowlist: crawlPolicyAllowlist(task.seedUrl, allowlistedDomains, scope) }
}

/**
 * The hosts governance lets a crawl's ladder fetch, from the frontier's host
 * rule. With `allowExternalLinks`, or when the request names no hosts, there
 * is no list: the frontier alone scopes the crawl, as before, so a seed that
 * redirects to another host keeps working. When hosts are named, the seed's
 * host and its www twin are always on the list too (the seed must be
 * fetched), and `*.apex` when `allowSubdomains` admits the apex's subdomains.
 */
function crawlPolicyAllowlist(seedUrl: string, allowlistedDomains: readonly string[], scope: Pick<CrawlScopeOptions, 'allowSubdomains' | 'allowExternalLinks'>): readonly string[] {
  if (scope.allowExternalLinks || allowlistedDomains.length === 0) return []
  const host = new URL(seedUrl).hostname.toLowerCase()
  const apex = host.startsWith('www.') ? host.slice(4) : host
  const twin = host.startsWith('www.') ? apex : host.includes('.') && isIP(host) === 0 ? `www.${host}` : null
  return [...new Set([host, ...(twin === null ? [] : [twin]), ...allowlistedDomains, ...(scope.allowSubdomains ? [`*.${apex}`] : [])])]
}

/**
 * What a batch asked for that a page read in the person's Chrome cannot give,
 * or null: steps on the page (`actions`) and a screenshot are W2L's browser's
 * to take, so such a batch's stopped items are not handed over.
 */
function handoffUnread(task: Task): string | null {
  return task.batch === undefined ? null : unreadByPerson(fetchOptions(task.batch, task.batch.formats))
}

/** Whether a batch's stopped items can be handed to the person: not when it asked for what their Chrome cannot give, nor when it has a webhook, which would send pages read signed in as them to another address. */
function offersHandoff(task: Task): boolean {
  return handoffUnread(task) === null && webhookOf(task) === undefined
}

/** What a request asks for that a page read in the person's Chrome cannot give: page actions or a screenshot, W2L's browser's to take; null when nothing. */
function unreadByPerson(options: FetchOptions): string | null {
  if (options.actions !== undefined && options.actions.length > 0) return 'page actions'
  if (options.screenshot !== undefined) return 'a screenshot'
  return null
}

/** Whether a result was stopped at a check a person can get through in their own browser: a captcha, a challenge, a login wall. */
function handoffResult(result: FetchResult): boolean {
  return result.status === 'blocked' && result.blockReason !== null && HANDOFF_REASONS[result.blockReason] !== undefined
}

/** Whether a step was stopped at a check a person can get through in their own browser: a captcha, a challenge, a login wall. */
function handoffNeeded(step: StepRecord): boolean {
  return step.status === 'blocked' && step.result !== null && step.result.blockReason !== null && HANDOFF_REASONS[step.result.blockReason] !== undefined
}

/** How a step a check stopped is handed to the person. */
function handoffRequestOf(step: StepRecord): { reason: string; liveViewUrl: null; rationale: string } {
  const blockReason = step.result!.blockReason!
  return {
    reason: HANDOFF_REASONS[blockReason]!,
    liveViewUrl: null,
    rationale: `${step.url} stopped at a ${blockReason.replace(/_/g, ' ')} Octocrawl does not pass: POST /v1/batches/${step.taskId}/handoff (MCP hand_off_batch, or octocrawl batch --handoff) opens it in your own Chrome, where you get through it, and Octocrawl reads the page there`,
  }
}

/** Every step of a task, or its error steps, in the order recorded. */
async function stepsOf(store: SqliteTaskStore, taskId: string, kind: StepPageQuery['kind']): Promise<StepRecord[]> {
  const steps: StepRecord[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await store.listStepsPage(taskId, { cursor, limit: BATCH_ERRORS_MAX_LIMIT, kind })
    steps.push(...page.steps)
    if (!page.hasMore || page.nextCursor === null) return steps
    cursor = page.nextCursor
  }
}

/** Why a crawl cannot be resumed now, or null when it can. */
function resumeRefusal(task: Task, running: boolean): string | null {
  if (task.batch !== undefined) return `task ${task.id} is a batch; a batch resumes when the service starts`
  if (task.status === 'completed' || task.status === 'cancelled') return `crawl ${task.id} is ${task.status}; start a new crawl instead`
  if (running) return `crawl ${task.id} is already running`
  if (!crawlOptionsStored(task)) return `crawl ${task.id} was started before its options were stored; start a new crawl instead`
  return null
}

/** Batch and crawl tasks return links when their formats or includeLinks asked for them. */
function linksRequested(task: Task): boolean {
  const options = task.batch ?? task.crawl
  return options?.includeLinks === true || (options?.formats ?? []).includes('links')
}

/**
 * `html` and `rawHtml` of a batch item or crawl page, each present when the
 * task's formats asked for it: what the stored result carries, null when it
 * carries none (a file, a page that was not read as content); `images`,
 * `tables` and `attributes` likewise, present when asked for and the page carries them;
 * `screenshot` when asked for and the page has a result (null when the
 * browser lane rendered no page or could not capture it).
 */
function askedHtmlFormats(task: Task, result: FetchResult | null): Pick<CrawlPage, 'html' | 'rawHtml' | 'images' | 'tables' | 'pages' | 'attributes' | 'screenshot'> {
  const formats = (task.batch ?? task.crawl)?.formats ?? []
  return {
    ...(formats.includes('html') ? { html: result?.html ?? null } : {}),
    ...(formats.includes('rawHtml') ? { rawHtml: result?.rawHtml ?? null } : {}),
    ...(formats.includes('images') && result?.images !== undefined ? { images: result.images } : {}),
    ...(formats.includes('tables') && result?.tables !== undefined ? { tables: result.tables } : {}),
    // A PDF's pages are on the result only when the task's pdf parser asked for them.
    ...(result?.pages === undefined ? {} : { pages: result.pages }),
    ...(hasFormat(formats, 'attributes') && result?.attributes !== undefined ? { attributes: result.attributes } : {}),
    ...(hasFormat(formats, 'screenshot') && result !== null ? { screenshot: result.screenshot ?? null } : {}),
  }
}

/** A step as the items routes list it by default and as a job event carries it: no routing audit, an empty trace. */
function compactPage(step: StepRecord, task: Task): CrawlPage {
  const { audit: _audit, ...page } = toCrawlPage(step, linksRequested(task), task)
  return { ...page, trace: [] }
}

function toCrawlPage(step: StepRecord, includeLinks: boolean, task: Task, handoffOffered = false): CrawlPage {
  const result = step.result
  const handoff = handoffOffered && handoffNeeded(step) ? handoffRequestOf(step) : null
  const mode = task.mode
  // The same hints a scrape of this page would carry, from its stored result and routing audit.
  const agentHints = result === null ? [] : agentHintsFor({ fastMode: (task.batch ?? task.crawl)?.fastMode }, { channelsTried: step.audit?.channelsTried ?? [result.lane], result, ...(step.audit === undefined ? {} : { summary: step.audit.summary, ladderTrace: step.audit.ladderTrace }) })
  return {
    id: step.id,
    url: step.url,
    canonicalUrl: step.canonicalUrl,
    depth: step.depth,
    status: step.status,
    lane: step.lane,
    markdown: result?.markdown ?? null,
    ...askedHtmlFormats(task, result),
    ...(result?.warnings === undefined || result.warnings.length === 0 ? {} : { warnings: result.warnings, warning: warningOf(result.warnings) }),
    ...(agentHints.length === 0 ? {} : { agentHints }),
    ...(handoff === null ? {} : { handoff }),
    ...(includeLinks ? { links: result?.links ?? [] } : {}),
    ...(result?.metadata === undefined ? {} : { metadata: result.metadata }),
    ...(result?.json === undefined ? {} : { json: result.json }),
    ...(result?.file === undefined ? {} : { file: result.file }),
    ...(result?.actions === undefined ? {} : { actions: result.actions }),
    ...(result?.list === undefined ? {} : { list: result.list }),
    failureReason: result?.failureReason ?? null,
    blockReason: result?.blockReason ?? null,
    budgetExceeded: result?.budgetExceeded ?? null,
    evidence: result?.evidence ?? null,
    // The stored result is the full one, trace included, with only the formats the task asked for.
    evidenceRecord: result === null ? null : toEvidenceRecord(result, { mode }, { markdown: result.markdown, ...(result.json === undefined ? {} : { json: result.json }) }),
    usage: result?.usage ?? null,
    trace: result?.trace ?? [],
    audit: step.audit,
    cached: step.cached,
    ...(result === null ? {} : cacheStateOf(result.trace)),
    contentHash: step.contentHash,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
  }
}

/**
 * What robots.txt said about a result that it refused: the rule that applied
 * (the first disallow among the applied rules), or why the file could not be
 * read. Null when the result was not refused by robots.txt: a success, a
 * failure of another kind, a `policy_denied` from governance or the SSRF
 * check (no `robots_disallowed` event), or a refusal a recorded override set
 * aside (`robots_overridden`). The events are the lanes' own records; nothing
 * is inferred here.
 */
function robotsRefusal(result: FetchResult): { pattern: string | null; unreachable: string | null } | null {
  if (result.failureReason !== 'policy_denied') return null
  const disallowed = result.trace.find((event) => event.event === 'robots_disallowed')
  if (disallowed === undefined || result.trace.some((event) => event.event === 'robots_overridden')) return null
  const applied = disallowed.detail?.appliedRules
  const rules = Array.isArray(applied) ? applied as ReadonlyArray<{ pattern?: unknown; allow?: unknown }> : []
  const rule = rules.find((entry) => entry.allow === false) ?? rules[0]
  const unreachable = disallowed.detail?.unreachable
  return { pattern: typeof rule?.pattern === 'string' ? rule.pattern : null, unreachable: typeof unreachable === 'string' ? unreachable : null }
}

/** One error of a batch, projected from its stored step: Firecrawl's names beside W2L's status and the HTTP status; nothing the step does not already carry. */
function batchErrorItem(step: StepRecord): BatchErrorItem {
  const result = step.result
  const code = result?.failureReason ?? result?.blockReason ?? result?.budgetExceeded ?? step.status
  const httpStatus = result?.evidence.httpStatus ?? null
  const refusal = result === null ? null : robotsRefusal(result)
  const robots = refusal === null ? '' : refusal.unreachable !== null ? ` — robots.txt unreachable (${refusal.unreachable})` : refusal.pattern === null ? ' — robots.txt rule' : ` — robots.txt rule ${refusal.pattern}`
  const error = (result?.warnings?.[0]?.message ?? `${step.status}: ${code}${httpStatus === null ? '' : ` (HTTP ${httpStatus})`}`) + robots
  // The store's `errors` kind lists only these four statuses.
  return { id: step.id, timestamp: step.createdAt, url: step.url, status: step.status as BatchErrorStatus, code, error, httpStatus }
}

async function sessionBrokerStoreGet(broker: SessionBroker, sessionRef: string): Promise<ManagedSessionRef> {
  return broker.getSession(sessionRef)
}

async function markCrawlFailed(store: SqliteTaskStore, taskId: string): Promise<void> {
  const now = new Date().toISOString()
  try {
    const existing = await store.getTask(taskId)
    if (existing !== null && (existing.status === 'pending' || existing.status === 'running' || existing.status === 'paused')) {
      await store.putTask({ ...existing, status: 'failed', updatedAt: now })
    }
    const attempts = await store.listAttempts(taskId)
    const latest = attempts[attempts.length - 1]
    if (latest !== undefined && latest.status === 'running') {
      await store.putAttempt({ ...latest, status: 'failed', endedAt: now })
    }
  } catch {}
}

/**
 * Where a local W2L keeps the user's saved logins: `W2L_SESSIONS_FILE`, else
 * `~/.w2l/sessions.json`. One file for the API server, the command line and
 * the local MCP service, so a login imported once is seen by all three.
 */
export function defaultSessionsFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.W2L_SESSIONS_FILE ?? join(homedir(), '.w2l', 'sessions.json')
}

/** A session store the engine reads but never writes: saved logins come from `octocrawl login import` alone. */
function readOnlySessions(store: SessionStore): SessionStore {
  return { load: (domain) => store.load(domain), save: async () => {} }
}
