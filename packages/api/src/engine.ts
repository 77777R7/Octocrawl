/**
 * Product engine behind the REST surface. One scrape is LadderRunner.
 * One crawl is CrawlOrchestrator. No second fetcher.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { join } from 'node:path'
import {
  buildChannels,
  BrowserLocalSubject,
  FileStore,
  HttpSitemapSource,
  LadderRunner,
  LadderScrapeAtom,
  MemoryRoutingHistory,
  ResilientHttpSubject,
  OriginScheduler,
  prepareHttpIdentity,
  RobotsOriginCache,
  type Channel,
} from '@w2l/bench'
import { collectLinkDetails, invalidSelector, MAX_SELECTOR_PARTS, selectorParts, SUPPORTED_SELECTORS } from '@w2l/extract-tf'
import {
  DEFAULT_SCRAPE_TIMEOUT_MS,
  defaultApiMode,
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
} from '@w2l/contracts'
import { createExecutionScope, type CrawlPolicy } from '@w2l/http-core'
import { CrawlOrchestrator, MapRunner, canonicalizeUrl, crawlReportFromStore, decodeStepCursor, encodeStepCursor, IdempotencyStore, reportFromTaskAttempt, requestFingerprint, SqliteTaskStore, toEvidenceRecord, type StepPageQuery } from '@w2l/runtime'
import type { ChannelsFiltered } from '@w2l/bench'
import { agentHintsFor, httpLaneAskedForBrowser, mapAgentHints } from './hints.js'
import { JobEventHub, jobKindOf, type JobTerminalStatus } from './jobEvents.js'
import { JobWebhooks, webhookOf } from './jobWebhooks.js'
import { initializeFirecrawlMonitor, runFirecrawlMonitor as executeMonitor, runConfiguredMonitor } from '@w2l/runtime'
import { MonitorStore, DeliveryStore, assessConfiguredDocument, assessFirecrawlIntroduction } from '@w2l/runtime'
import { FileSessionBrokerStore, SessionBroker } from '@w2l/bench'
import { FIRECRAWL_INTRO_URL, FIRECRAWL_MONITOR_ID, type MonitorView, type MonitorRevision } from '@w2l/contracts'
import type { ManagedSessionRef, SessionAccessResult } from '@w2l/contracts'
import { attributesFormat, customJsonFormat, extractionInput, extractStructured, hasFormat, prepareScrapeResponse, scrapeSnapshot, screenshotFormat, structuredModelConfigFromEnv } from './structured.js'

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
  scrape(req: ScrapeRequest, context?: ExecutionContext): Promise<ScrapeResponse | CompactScrapeResponse>
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
   * Whether scrape and batch requests may carry a recorded robots override
   * (`robotsOverride`, `robotsOverrides`). Absent or true (local): the person
   * running the server decides that for their own fetches. False (hosted):
   * the field is refused by name with HTTP 400, so no token holder can make
   * the operator's service set a publisher's rule aside.
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
   * The receivers a job `webhook` may name beyond https: with
   * `allowHttpLoopback` (the default off a hosted engine) a plain-http
   * receiver on loopback is taken, for a local developer's receiver. A hosted
   * engine takes https to a public address only, whatever this says.
   */
  webhookPolicy?: { allowHttpLoopback: boolean }
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
}


/** A map with sitemap skip reads no sitemap: its runner never loads one, and this reader says so if it were asked. */
const NO_SITEMAP: MapSources['sitemap'] = {
  load: async () => { throw new Error('sitemap skip: no sitemap is read') },
  close: async () => {},
}

/** The orchestrator's own default, which the engine passes explicitly so a crawl's `maxConcurrency` can be checked against it. */
const DEFAULT_WORKER_COUNT = 4

export function createApiEngine(options: ApiEngineOptions = {}): ApiEngine {
  const taskRoot = options.taskRoot ?? '.w2l/api'
  const monitorStore = MonitorStore.open(join(taskRoot, 'section-b-control.sqlite'), {leaseMs: options.monitorLeaseMs, attemptTimeoutMs: options.monitorAttemptTimeoutMs})
  const deliveryStore = DeliveryStore.open(join(taskRoot, 'section-b-control.sqlite'))
  const shutdownController = new AbortController()
  const monitorControllers = new Map<string, Set<AbortController>>()
  const sessionBroker = new SessionBroker(new FileSessionBrokerStore(join(taskRoot, 'b3-sessions.json')))
  const headed = options.headed === true
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
        throw new RequestError(`${name} entry uses ${refusal.reason}, which W2L does not match: ${selector} (supported: ${SUPPORTED_SELECTORS})`, 'unsupported_parameter', { parameters: [`${name}[${index}]`] })
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
      throw new RequestError(`attributes selectors[${index}].selector uses ${refusal.reason}, which W2L does not match: ${selector} (supported: ${SUPPORTED_SELECTORS})`, 'unsupported_parameter', { parameters: [`formats[${at}].selectors[${index}]`] })
    }
    if (parts > MAX_SELECTOR_PARTS) {
      throw new RequestError(`attributes selectors must hold at most ${MAX_SELECTOR_PARTS} selector parts in all, and hold ${parts} (a tag name, *, a class, an id, an attribute test and a pseudo-class each count as one)`)
    }
  }
  /** A server that takes no recorded robots override refuses the field by name, before anything is fetched or stored. */
  const checkRobotsOverride = (parameter: 'robotsOverride' | 'robotsOverrides', value: unknown): void => {
    if (options.allowRobotsOverride === false && value !== undefined) {
      throw new RequestError(`unsupported parameter: ${parameter} (this server takes no robots override; a recorded override is for a local W2L server)`, 'unsupported_parameter', { parameters: [parameter] })
    }
  }
  const hosted = options.hosted === true
  /** A hosted engine never relaxes certificate verification for a caller; refused before anything is fetched or stored, naming the supported route. */
  const checkHostedOptions = (req: PageOptions): void => {
    if (hosted && req.skipTlsVerification === true) throw new RequestError('skipTlsVerification is not available in hosted mode', 'invalid_request', undefined, [REFUSAL_HINTS.hostedSkipTlsVerification])
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
      const channels = buildChannels(mode, { headed, networkPolicy, originScheduler, publicPreferenceState:options.publicPreferenceState, browserAllowedHosts:options.browserAllowedHosts, fileStore, robotsCache: robotsCacheFor(mode) })
      return options.httpOnly ? channels.filter(channel => channel.id === 'http') : channels
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
   */
  const channelsForUrl = (mode: 'standard' | 'research' | 'authed', url: string, page: PageOptions = {}, formats: readonly ScrapeFormat[] = []): { channels: Channel[]; filtered: ChannelsFiltered[] } => {
    const channels = channelsFor(mode)
    const policy = options.channelPolicy?.(url) ?? 'ladder'
    let selected = policy === 'ladder' ? channels : channels.filter(channel => channel.id === (policy === 'http_only' ? 'http' : 'browser_local'))
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
    if (page.fastMode === true) {
      if (policy === 'browser_only') throw new RequestError('fastMode is not available for this URL: it is served by the browser lane only')
      const kept = selected.filter(channel => channel.id === 'http')
      if (kept.length === 0) throw new RequestError('fastMode is not available for this URL: no http rung is configured for it')
      const dropped = selected.filter(channel => channel.id !== 'http').map(name)
      if (dropped.length > 0) filtered.push({ reason: 'fastMode', dropped })
      selected = kept
    }
    const wire = (['headers', 'mobile', 'skipTlsVerification'] as const).filter(option => option === 'headers' ? page.headers !== undefined && Object.keys(page.headers).length > 0 : page[option] === true)
    if (wire.length > 0) {
      const dropped = selected.filter(channel => channel.vendorId !== undefined).map(name)
      if (dropped.length > 0) filtered.push({ reason: wire.join(', '), dropped })
      selected = selected.filter(channel => channel.vendorId === undefined)
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
      return {
        ...report, requested: task.batch.urls.length, completed, remaining: Math.max(0, task.batch.urls.length - completed),
        // A page read, with or without content, succeeded; what the errors report lists failed.
        succeeded: (counts.success ?? 0) + (counts.partial ?? 0) + (counts.empty_verified ?? 0),
        failed: (counts.failed ?? 0) + (counts.blocked ?? 0) + (counts.cancelled ?? 0) + (counts.budget_exceeded ?? 0),
        // The cap in force: the batch's own, never above this service's worker count.
        maxConcurrency: Math.min(task.batch.maxConcurrency ?? workerCount, workerCount),
        ...(task.batch.invalidURLs === undefined ? {} : { invalidURLs: task.batch.invalidURLs }),
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
        items: page.steps.map((step) => toCrawlPage(step, includeLinks, task)),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
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
    const rungs = channelsForUrl(mode, task.seedUrl, selection ?? {}, selection?.formats ?? [])
    // Governance sees the hosts the frontier may lead to (policyAllowlist); every page still gets its own robots.txt, SSRF and identity checks.
    const runner = new LadderRunner(rungs.channels, { mode, ...(req.policyAllowlist.length ? { allowlistedDomains: req.policyAllowlist } : {}) }, historyFor(mode), null, null, { channelsFiltered: rungs.filtered })
    // A batch's recorded robots overrides are per URL: only the URL an
    // override names is fetched past a disallow, never its neighbours. A
    // server that takes none applies none, also to a task stored with them.
    const robotsOverrideFor = options.allowRobotsOverride === false || task.batch?.robotsOverrides === undefined ? null : robotsOverrideLookup(task.batch.robotsOverrides)
    const ladder = new LadderScrapeAtom(runner, robotsOverrideFor === null ? fetchOptions(selection, selection?.formats) : (url) => {
      const robotsOverride = robotsOverrideFor(url)
      return { ...fetchOptions(selection, selection?.formats), ...(robotsOverride === undefined ? {} : { robotsOverride }) }
    })
    const atom: ScrapeAtom = selection === undefined ? ladder : {
      async scrape(url, context) {
        // `timeout` is each page's own deadline, inside the task's.
        const page = createExecutionScope({ ...context, deadlineAt: Math.min(context?.deadlineAt ?? Infinity, Date.now() + (selection.timeout ?? DEFAULT_SCRAPE_TIMEOUT_MS)) })
        const formats = selection.formats ?? ['markdown']
        const wants = (name: 'markdown' | 'links' | 'json') => hasFormat(formats, name)
        const custom = customJsonFormat(formats)
        // JSON extraction, its model fallback included, runs within the page's deadline too.
        const { outcome, json } = await (async () => {
          const outcome = await ladder.scrape(url, page)
          const json = wants('json') ? await extractStructured(extractionInput(outcome.result), custom, page, structuredModelConfigFromEnv()) : undefined
          return { outcome, json }
        })().finally(() => page.dispose())
        // The stored audit repeats no page body; a screenshot's base64 is stored once, on the result, and its attempt copy says null.
        const audit = outcome.audit === undefined ? undefined : {
          ...outcome.audit,
          summary: {
            ...outcome.audit.summary,
            attempts: outcome.audit.summary.attempts.map(({ result: { html: _html, rawHtml: _rawHtml, images: _images, attributes: _attributes, screenshot, ...result }, ...attempt }) => ({
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
    const sitemapSource = req.sitemap === 'skip' ? undefined : new HttpSitemapSource({ mode, device: selection?.mobile === true ? 'mobile' : 'desktop', networkPolicy, scheduler: originScheduler, robots: robotsCacheFor(mode) })
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
        budget: task.budget,
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
      await store.close()
    }).catch(async (error: unknown) => {
      inflight.delete(task.id); crawlControllers.delete(task.id); runningCrawls.delete(task.id)
      await markCrawlFailed(store, task.id)
      await finishJob(task, store, error instanceof Error ? error.message : String(error))
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
  for (const name of existsSync(taskRoot) ? readdirSync(taskRoot) : []) {
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
  async function runScrape(req: ScrapeRequest, context: ExecutionContext, record: boolean): Promise<ScrapeResponse | CompactScrapeResponse> {
    checkFileCap(req)
    checkSelectors(req)
    checkAttributeSelectors(req.formats)
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
    const runner = new LadderRunner(rungs.channels, policy, historyFor(mode), null, null, { channelsFiltered: rungs.filtered })
    const operation = (async () => {
      const run = await runner.run(req.url, undefined, scope, { ...fetchOptions(req, req.formats), ...(req.robotsOverride === undefined ? {} : { robotsOverride: req.robotsOverride }) })
      const agentHints = agentHintsFor(req, run)
      const full: ScrapeRun = {
        ...run.result,
        channelsTried: run.channelsTried,
        ladderTrace: run.ladderTrace,
        summary: run.summary,
        ...(agentHints.length === 0 ? {} : { agentHints }),
      }
      const response = await prepareScrapeResponse(full, req, scope, null, overallStart, scrapeId)
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
    if (req.limit !== undefined && req.limit > mapMaxLimit) throw new RequestError(`limit must be at most ${mapMaxLimit} on this server`)
    if (req.timeout !== undefined && req.timeout > mapMaxTimeoutMs) throw new RequestError(`timeout must be at most ${mapMaxTimeoutMs} on this server`)
    const readsPage = req.sitemap !== 'only'
    if (readsPage && options.channelPolicy?.(req.url) === 'browser_only') throw new RequestError('map is not available for this URL: this server reads it with the browser lane only')
    const mode = req.mode ?? 'standard'
    const rungs = readsPage ? channelsForUrl(mode, req.url, { fastMode: true }, ['rawHtml']) : null
    const requestedAt = new Date().toISOString()
    const id = crypto.randomUUID()
    const signal = context.signal ? AbortSignal.any([context.signal, shutdownController.signal]) : shutdownController.signal
    const userAgentFor = (url: string): string => prepareHttpIdentity(mode, networkPolicy.contact ?? null, new URL(url).hostname).identity.userAgent
    const robots = robotsCacheFor(mode)
    const lookups = new Map<string, ReturnType<RobotsOriginCache['lookup']>>()
    const runner = rungs === null ? null : new LadderRunner(rungs.channels, { mode }, historyFor(mode), null, null, { channelsFiltered: rungs.filtered })
    const sitemap = req.sitemap === 'skip' ? null : new HttpSitemapSource({ mode, networkPolicy, scheduler: originScheduler, robots })
    const sources: MapSources = {
      async readStartPage(url, scope) {
        if (runner === null) throw new Error('a sitemap-only map reads no page')
        const run = await runner.run(url, undefined, scope, fetchOptions(undefined, ['rawHtml']))
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
        return decision.decision === 'disallowed' ? { disallowed: true, ...(decision.unreachable === undefined ? {} : { unreachable: decision.unreachable }) } : decision.decision
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
    scrape: (req, context = {}) => runScrape(req, context, true),

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
      checkFileCap(req)
      checkSelectors(req)
      checkAttributeSelectors(req.formats)
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
          maxCostUsd: null,
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
        budget: { maxPages: null, maxWallMs: options.batchMaxWallMs ?? null, maxCostUsd: null, maxTokens: null },
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
          if (!inflight.has(taskId)) await finishJob(task, store)
        }
      } finally {
        await store.close()
      }
      return (await loadCrawlWithSteps(taskId))?.report ?? null
    },

    async resumeCrawl(taskId) {
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
    if (!existsSync(join(taskRoot, id, 'checkpoint.sqlite'))) throw new TaskNotFoundError(`batch not found: ${id}`)
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
 * `images`, an `attributes` entry and a `screenshot` entry among its formats
 * ask the lanes to carry them on the result.
 */
function fetchOptions(options: PageOptions | undefined, formats: readonly ScrapeFormat[] = []): FetchOptions {
  const attributes = attributesFormat(formats)
  const screenshot = screenshotFormat(formats)
  return {
    ...(options?.onlyMainContent === undefined ? {} : { onlyMainContent: options.onlyMainContent }),
    ...(options?.waitFor === undefined ? {} : { waitFor: options.waitFor }),
    ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options?.maxFileBytes === undefined ? {} : { maxFileBytes: options.maxFileBytes }),
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
    ...(attributes === undefined ? {} : { attributes: attributes.selectors }),
    ...(screenshot === undefined ? {} : { screenshot }),
  }
}

/** The page options a batch or crawl request set, stored on its task so a resumed task keeps them (`fastMode` among them: it selects rungs, not a lane option). */
function pageOptions(req: PageOptions): PageOptions {
  return { ...fetchOptions(req), ...(req.timeout === undefined ? {} : { timeout: req.timeout }), ...(req.fastMode === undefined ? {} : { fastMode: req.fastMode }) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const { formats, includeLinks, includePaths, excludePaths, maxDepth, allowlistedDomains, useCached, regexOnFullURL, ignoreQueryParameters, deduplicateSimilarURLs, crawlEntireDomain, allowSubdomains, allowExternalLinks, sitemap, maxConcurrency, webhook: _webhook, ...page } = task.crawl ?? {}
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
 * carries none (a file, a page that was not read as content); `images` and
 * `attributes` likewise, present when asked for and the page carries them;
 * `screenshot` when asked for and the page has a result (null when the
 * browser lane rendered no page or could not capture it).
 */
function askedHtmlFormats(task: Task, result: FetchResult | null): Pick<CrawlPage, 'html' | 'rawHtml' | 'images' | 'attributes' | 'screenshot'> {
  const formats = (task.batch ?? task.crawl)?.formats ?? []
  return {
    ...(formats.includes('html') ? { html: result?.html ?? null } : {}),
    ...(formats.includes('rawHtml') ? { rawHtml: result?.rawHtml ?? null } : {}),
    ...(formats.includes('images') && result?.images !== undefined ? { images: result.images } : {}),
    ...(hasFormat(formats, 'attributes') && result?.attributes !== undefined ? { attributes: result.attributes } : {}),
    ...(hasFormat(formats, 'screenshot') && result !== null ? { screenshot: result.screenshot ?? null } : {}),
  }
}

/** A step as the items routes list it by default and as a job event carries it: no routing audit, an empty trace. */
function compactPage(step: StepRecord, task: Task): CrawlPage {
  const { audit: _audit, ...page } = toCrawlPage(step, linksRequested(task), task)
  return { ...page, trace: [] }
}

function toCrawlPage(step: StepRecord, includeLinks: boolean, task: Task): CrawlPage {
  const result = step.result
  const mode = task.mode
  // The same hints a scrape of this page would carry, from its stored result and routing audit.
  const agentHints = result === null ? [] : agentHintsFor({ fastMode: (task.batch ?? task.crawl)?.fastMode }, { channelsTried: step.audit?.channelsTried ?? [result.lane], result, ...(step.audit === undefined ? {} : { summary: step.audit.summary }) })
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
    ...(includeLinks ? { links: result?.links ?? [] } : {}),
    ...(result?.metadata === undefined ? {} : { metadata: result.metadata }),
    ...(result?.json === undefined ? {} : { json: result.json }),
    ...(result?.file === undefined ? {} : { file: result.file }),
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
