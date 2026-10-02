/**
 * Product engine behind the REST surface. One scrape is LadderRunner.
 * One crawl is CrawlOrchestrator. No second fetcher.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildChannels,
  BrowserLocalSubject,
  FileStore,
  LadderRunner,
  LadderScrapeAtom,
  MemoryRoutingHistory,
  ResilientHttpSubject,
  OriginScheduler,
  type Channel,
} from '@w2l/bench'
import { invalidSelector, MAX_SELECTOR_PARTS, selectorParts, SUPPORTED_SELECTORS } from '@w2l/extract-tf'
import {
  DEFAULT_SCRAPE_TIMEOUT_MS,
  defaultApiMode,
  localNetworkPolicy,
  maxFileBytesFromEnv,
  type FetchOptions,
  type PageOptions,
  type CrawlAccepted,
  type CrawlError,
  type CrawlPage,
  type CrawlPageList,
  type CrawlReport,
  type CrawlStartRequest,
  type BatchStartRequest,
  type BatchStatusResponse,
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
} from '@w2l/contracts'
import { createExecutionScope, type CrawlPolicy } from '@w2l/http-core'
import { CrawlOrchestrator, canonicalizeUrl, crawlReportFromStore, decodeStepCursor, encodeStepCursor, reportFromTaskAttempt, SqliteTaskStore, toEvidenceRecord, type StepPageQuery } from '@w2l/runtime'
import type { ChannelsFiltered } from '@w2l/bench'
import { agentHintsFor } from './hints.js'
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

export interface ApiEngine {
  scrape(req: ScrapeRequest, context?: ExecutionContext): Promise<ScrapeResponse | CompactScrapeResponse>
  /** The record of one scrape call (`scrapes/<scrapeId>.json` under the task root); null for an id this server has no record of. */
  getScrape(scrapeId: string): Promise<ScrapeRecord | null>
  startCrawl(req: CrawlStartRequest): Promise<CrawlAccepted>
  startBatch(req: BatchStartRequest): Promise<CrawlAccepted>
  getBatch(taskId: string): Promise<BatchStatusResponse | null>
  getBatchItems(taskId: string, query?: CrawlPageQuery): Promise<CrawlPageList<CrawlPage> | null>
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
  listDeliveryDestinations(monitorId?: string): DeliveryDestination[]
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
  workerCount?: number
  perHostConcurrency?: number
  perHostMinDelayMs?: number
  crawlDelayMsByHost?: ReadonlyMap<string, number>
}

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
  // One record per scrape call, written before the response is sent and read
  // back by GET /v1/scrapes/:id. No page body; no retention in M2.
  const scrapesDir = join(taskRoot, 'scrapes')
  let scrapesDirReady: Promise<void> | null = null
  const writeScrapeRecord = async (record: ScrapeRecord): Promise<void> => {
    scrapesDirReady ??= mkdir(scrapesDir, { recursive: true }).then(() => undefined, (error: unknown) => { scrapesDirReady = null; throw error })
    await scrapesDirReady
    await writeFile(join(scrapesDir, `${record.scrapeId}.json`), JSON.stringify(record, null, 2))
  }
  const originScheduler = new OriginScheduler(networkPolicy)
  const conditionalHttp = new ResilientHttpSubject('standard', networkPolicy, originScheduler, undefined, false, fileStore)
  const defaultMaxPages = options.defaultMaxPages ?? null
  const inflight = new Map<string, Promise<void>>()
  let batchStartInProgress = false
  const activeScrapes = new Set<Promise<unknown>>()
  const crawlControllers = new Map<string, AbortController>()
  const runningCrawls = new Map<string, CrawlOrchestrator>()
  const createChannels =
    options.channelsFor ??
    ((mode: 'standard' | 'research' | 'authed') => {
      const channels = buildChannels(mode, { headed, networkPolicy, originScheduler, publicPreferenceState:options.publicPreferenceState, browserAllowedHosts:options.browserAllowedHosts, fileStore })
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
      return { report, steps }
    } finally {
      await store.close()
    }
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

  function launchTask(task: Task, store: SqliteTaskStore, req: { maxDepth: number | null; allowlistedDomains: readonly string[]; useCached: boolean; resume: boolean }): void {
    const mode = defaultApiMode(task.mode)
    // Batch and crawl tasks apply their stored formats and page options to
    // every page. A task stored before crawl formats existed has neither and
    // keeps the full result. A hosted engine runs a stored task without the
    // relaxation it refuses at submission.
    const stored = task.batch ?? task.crawl
    const selection = stored === undefined || !hosted ? stored : { ...stored, skipTlsVerification: false }
    // One set of rungs for every URL of the task: a screenshot format binds them all to the browser lane.
    const rungs = channelsForUrl(mode, task.seedUrl, selection ?? {}, selection?.formats ?? [])
    const runner = new LadderRunner(rungs.channels, { mode, ...(req.allowlistedDomains.length ? { allowlistedDomains: req.allowlistedDomains } : {}) }, historyFor(mode), null, null, { channelsFiltered: rungs.filtered })
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
    const orchestrator = new CrawlOrchestrator({
      store, atom,
      workerCount: options.workerCount,
      perHostConcurrency: Math.min(4, networkPolicy.perHostConcurrency),
      perHostMinDelayMs: networkPolicy.perHostMinDelayMs,
      crawlDelayMsByHost: options.crawlDelayMsByHost,
      shutdownSignal: shutdownController.signal,
      signal: controller.signal,
    })
    const job = orchestrator.run({
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
    }).then(async () => {
      inflight.delete(task.id); crawlControllers.delete(task.id); runningCrawls.delete(task.id)
      await store.close()
    }).catch(async () => {
      inflight.delete(task.id); crawlControllers.delete(task.id); runningCrawls.delete(task.id)
      await markCrawlFailed(store, task.id)
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
    void store.getTask(name).then(task => {
      const unfinished = task !== null && !inflight.has(task.id) && ['pending', 'running', 'paused'].includes(task.status)
      if (unfinished && task.batch) {
        launchTask(task, store, { maxDepth: 0, allowlistedDomains: [...new Set(task.batch.urls.map(url => new URL(url).hostname))], useCached: false, resume: true })
      } else if (unfinished && crawlOptionsStored(task)) {
        launchTask(task, store, crawlRunOptions(task, true))
      } else void store.close()
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

  return {
    scrape: (req, context = {}) => runScrape(req, context, true),

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
      if (defaultMaxPages !== null && req.maxPages != null && req.maxPages > defaultMaxPages) {
        throw new RequestError(`maxPages must be at most ${defaultMaxPages} on this server`)
      }
      const mode = defaultApiMode(req.mode)
      const taskId = crypto.randomUUID()
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
          ...pageOptions(req),
        },
        ...attributionOf(req),
        createdAt: now,
        updatedAt: now,
      }
      await store.putTask(task)
      launchTask(task, store, crawlRunOptions(task, false))
      return { taskId }
    },

    async startBatch(req) {
      if (batchStartInProgress) throw new RequestError('another batch submission is in progress')
      checkFileCap(req)
      checkSelectors(req)
      checkAttributeSelectors(req.formats)
      checkRobotsOverride('robotsOverrides', req.robotsOverrides)
      checkHostedOptions(req)
      batchStartInProgress = true
      try {
      if (options.maxActiveBatches !== undefined && await activeBatchCount() >= options.maxActiveBatches) {
        throw new RequestError('active batch limit reached')
      }
      const canonical = req.urls.map(url => canonicalizeUrl(url))
      if (canonical.some(url => url === null) || new Set(canonical).size !== canonical.length) throw new RequestError('urls must be unique after canonicalization')
      const taskId = crypto.randomUUID()
      const taskDir = join(taskRoot, taskId)
      const store = SqliteTaskStore.open(taskDir)
      const now = new Date().toISOString()
      const urls = [...req.urls]
      const task: Task = {
        id: taskId, seedUrl: urls[0]!, taskDir, mode: defaultApiMode(req.mode), status: 'pending',
        budget: { maxPages: null, maxWallMs: options.batchMaxWallMs ?? null, maxCostUsd: null, maxTokens: null },
        batch: {
          urls, formats: req.formats ?? ['markdown'], includeLinks: req.includeLinks === true, ...pageOptions(req),
          ...(req.robotsOverrides === undefined ? {} : { robotsOverrides: req.robotsOverrides }),
        },
        ...attributionOf(req),
        createdAt: now, updatedAt: now,
      }
      await store.putTask(task)
      launchTask(task, store, { maxDepth: 0, allowlistedDomains: [...new Set(urls.map(url => new URL(url).hostname))], useCached: false, resume: false })
      return { taskId }
      } finally { batchStartInProgress = false }
    },

    async getBatch(taskId) {
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
        return { ...report, requested: task.batch.urls.length, completed, remaining: Math.max(0, task.batch.urls.length - completed) }
      } finally { await store.close() }
    },

    async getBatchItems(taskId, query) {
      if (await this.getBatch(taskId) === null) return null
      const page = await loadCrawlPageList(taskId, { ...query, limit: Math.min(50, query?.limit ?? 10) }, 'all', true)
      if (page === null || query?.debug === true) return page
      return { ...page, items: page.items.map(({ audit: _audit, ...item }) => ({ ...item, trace: [] })) }
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
    listDeliveryDestinations: (id) => deliveryStore.listDestinations(id),
    setDeliveryDestinationEnabled: (id, enabled) => deliveryStore.setDestinationEnabled(id, enabled),
    listDeliveries: (query) => deliveryStore.listDeliveries(query),
    getDeliveriesPage: (query) => deliveryStore.listDeliveriesPage(query),
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
      await Promise.all([...inflight.values()].map((job) => job.catch(() => {})))
      await Promise.all([...activeScrapes].map((job) => job.catch(() => {})))
      await Promise.all([...channelsByMode.values()].flatMap((channels) => channels.map((channel) => channel.close?.().catch(() => {}))))
      channelsByMode.clear()
      crawlControllers.clear()
      monitorStore.close()
      deliveryStore.close()
    },
  }
}

/** The local rungs that render a page and so can capture the `screenshot` format. */
const BROWSER_RUNGS: ReadonlySet<string> = new Set(['browser_local', 'authed_session'])

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

/** The run options a crawl task was stored with. */
function crawlRunOptions(task: Task, resume: boolean): { maxDepth: number | null; allowlistedDomains: readonly string[]; useCached: boolean; resume: boolean } {
  return { maxDepth: task.crawl?.maxDepth ?? null, allowlistedDomains: task.crawl?.allowlistedDomains ?? [], useCached: task.crawl?.useCached === true, resume }
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

function toCrawlPage(step: StepRecord, includeLinks: boolean, task: Task): CrawlPage {
  const result = step.result
  const mode = task.mode
  // The same hints a scrape of this page would carry, from its stored result and routing audit.
  const agentHints = result === null ? [] : agentHintsFor({ fastMode: (task.batch ?? task.crawl)?.fastMode }, { channelsTried: step.audit?.channelsTried ?? [result.lane], result })
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
