/**
 * Product engine behind the REST surface. One scrape is LadderRunner.
 * One crawl is CrawlOrchestrator. No second fetcher.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
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
  type CompactScrapeResponse,
  type ScrapeResponse,
  type ScrapeAtom,
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
} from '@w2l/contracts'
import { createExecutionScope, type CrawlPolicy } from '@w2l/http-core'
import { CrawlOrchestrator, canonicalizeUrl, crawlReportFromStore, decodeStepCursor, encodeStepCursor, reportFromTaskAttempt, SqliteTaskStore, toEvidenceRecord, type StepPageQuery } from '@w2l/runtime'
import { initializeFirecrawlMonitor, runFirecrawlMonitor as executeMonitor, runConfiguredMonitor } from '@w2l/runtime'
import { MonitorStore, DeliveryStore, assessConfiguredDocument, assessFirecrawlIntroduction } from '@w2l/runtime'
import { FileSessionBrokerStore, SessionBroker } from '@w2l/bench'
import { FIRECRAWL_INTRO_URL, FIRECRAWL_MONITOR_ID, type MonitorView, type MonitorRevision } from '@w2l/contracts'
import type { ManagedSessionRef, SessionAccessResult } from '@w2l/contracts'
import { extractionInput, extractStructured, prepareScrapeResponse, structuredModelConfigFromEnv } from './structured.js'

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
  const channelsForUrl = (mode: 'standard' | 'research' | 'authed', url: string): Channel[] => {
    const channels = channelsFor(mode)
    const policy = options.channelPolicy?.(url) ?? 'ladder'
    const selected = policy === 'ladder' ? channels : channels.filter(channel => channel.id === (policy === 'http_only' ? 'http' : 'browser_local'))
    if (selected.length === 0) throw new RequestError(`capture channel unavailable for ${policy}`)
    return selected
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
        items: page.steps.map((step) => toCrawlPage(step, includeLinks, task.mode)),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      }
    } finally {
      await store.close()
    }
  }

  function launchTask(task: Task, store: SqliteTaskStore, req: { maxDepth: number | null; allowlistedDomains: readonly string[]; useCached: boolean; resume: boolean }): void {
    const mode = defaultApiMode(task.mode)
    const runner = new LadderRunner(channelsForUrl(mode, task.seedUrl), { mode, ...(req.allowlistedDomains.length ? { allowlistedDomains: req.allowlistedDomains } : {}) }, historyFor(mode))
    // Batch and crawl tasks apply their stored formats and page options to
    // every page. A task stored before crawl formats existed has neither and
    // keeps the full result.
    const selection = task.batch ?? task.crawl
    const ladder = new LadderScrapeAtom(runner, fetchOptions(selection))
    const atom: ScrapeAtom = selection === undefined ? ladder : {
      async scrape(url, context) {
        // `timeout` is each page's own deadline, inside the task's.
        const page = createExecutionScope({ ...context, deadlineAt: Math.min(context?.deadlineAt ?? Infinity, Date.now() + (selection.timeout ?? DEFAULT_SCRAPE_TIMEOUT_MS)) })
        const formats = selection.formats ?? ['markdown']
        const wants = (name: 'markdown' | 'links' | 'json') => formats.some(format => typeof format === 'string' ? format === name : name === 'json')
        const custom = formats.find(format => typeof format === 'object')
        // JSON extraction, its model fallback included, runs within the page's deadline too.
        const { outcome, json } = await (async () => {
          const outcome = await ladder.scrape(url, page)
          const json = wants('json') ? await extractStructured(extractionInput(outcome.result), custom, page, structuredModelConfigFromEnv()) : undefined
          return { outcome, json }
        })().finally(() => page.dispose())
        const audit = outcome.audit === undefined ? undefined : {
          ...outcome.audit,
          summary: {
            ...outcome.audit.summary,
            attempts: outcome.audit.summary.attempts.map(attempt => ({
              ...attempt,
              result: { ...attempt.result, markdown: null, links: [] },
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

  return {
    async scrape(req, context = {}) {
      checkFileCap(req)
      const overallStart = performance.now()
      // `timeout` is the whole scrape's deadline; a caller's own deadline (a Monitor run) still bounds it.
      const deadlineAt = req.timeout === undefined
        ? context.deadlineAt ?? Date.now() + DEFAULT_SCRAPE_TIMEOUT_MS
        : Math.min(context.deadlineAt ?? Infinity, Date.now() + req.timeout)
      const scope = createExecutionScope({...context, signal: context.signal ? AbortSignal.any([context.signal, shutdownController.signal]) : shutdownController.signal, deadlineAt})
      const mode = defaultApiMode(req.mode)
      const channels = channelsForUrl(mode, req.url)
      const policy: CrawlPolicy = {
        mode,
        ...(req.allowlistedDomains !== undefined && req.allowlistedDomains.length > 0
          ? { allowlistedDomains: req.allowlistedDomains }
          : {}),
      }
      const runner = new LadderRunner(channels, policy, historyFor(mode))
      const operation = (async () => {
        const run = await runner.run(req.url, undefined, scope, fetchOptions(req))
        const full: ScrapeResponse = {
          ...run.result,
          channelsTried: run.channelsTried,
          ladderTrace: run.ladderTrace,
          summary: run.summary,
        }
        return prepareScrapeResponse(full, req, scope, null, overallStart)
      })()
      activeScrapes.add(operation)
      try { return await operation } finally { activeScrapes.delete(operation); scope.dispose() }
    },

    async startCrawl(req) {
      checkFileCap(req)
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
        batch: { urls, formats: req.formats ?? ['markdown'], includeLinks: req.includeLinks === true, ...pageOptions(req) },
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
          steps: page.steps,
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
        : await this.scrape({url:revision.url,debug:true}, context) as ScrapeResponse
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
        const result = await this.scrape({url: revision.url, debug: true}, capture) as ScrapeResponse
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

/** What a request or stored task asks each lane to capture. Its timeout is the deadline; passed on, it lets the lanes' waits run to it. */
function fetchOptions(options: PageOptions | undefined): FetchOptions {
  return {
    ...(options?.onlyMainContent === undefined ? {} : { onlyMainContent: options.onlyMainContent }),
    ...(options?.waitFor === undefined ? {} : { waitFor: options.waitFor }),
    ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options?.maxFileBytes === undefined ? {} : { maxFileBytes: options.maxFileBytes }),
  }
}

/** The page options a batch or crawl request set, stored on its task so a resumed task keeps them. */
function pageOptions(req: PageOptions): PageOptions {
  return { ...fetchOptions(req), ...(req.timeout === undefined ? {} : { timeout: req.timeout }) }
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

function toCrawlPage(step: StepRecord, includeLinks: boolean, mode: Task['mode']): CrawlPage {
  const result = step.result
  return {
    id: step.id,
    url: step.url,
    canonicalUrl: step.canonicalUrl,
    depth: step.depth,
    status: step.status,
    lane: step.lane,
    markdown: result?.markdown ?? null,
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
