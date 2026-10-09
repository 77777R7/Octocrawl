/**
 * Crawl orchestrator: compose scrapes over a frontier and checkpoint.
 *
 * Never opens Playwright. A page is one ScrapeAtom.scrape(url).
 * Resume restores frontier membership from prior steps. Default is refetch;
 * --use-cached is the only skip-fetch path. A resumed task runs with the
 * options it stored, and its page budget counts every URL the task has, so
 * refetching one costs nothing new and a resume never exceeds maxPages.
 * Attempt counters are written after every page, so status reads are live.
 *
 * Same rawBodySha256 on two distinct canonical URLs is duplicate content,
 * not a crawl loop. The duplicate is recorded and skipped; the crawl
 * continues. DOM-fingerprint N / pagination stall is out of this slice.
 *
 * A crawl given a SitemapSource reads the site's sitemap once per attempt,
 * before its first page: the entries go to the frontier at depth 1, after the
 * seed and ahead of the seed's own links, under a link's rules. With sitemap
 * `only` a page's links stay on its record and are not followed. The load is
 * written to the attempt's discovery with every file it read or refused. A
 * crawl's maxConcurrency lowers the workers it runs; the per-host gate stays.
 *
 * A batch's URL list can grow while it runs (an append): the task row is
 * re-read every 100 ms and on every work-loop turn, and URLs past the ones
 * already seeded are seeded then, so the same attempt fetches them. The task
 * written at the end of a run is built from the row as it then is, never from
 * the object the run opened with, so a list that grew meanwhile is kept; URLs
 * that arrive after the workers have stopped are the engine's to relaunch.
 */

import {
  CONTENTFUL_STATUS,
  DEFAULT_CRAWL_SPEC,
  EMPTY_CRAWL_DISCOVERY,
  paidCallsOfError,
  stepStatusFromResult,
  type Attempt,
  type BudgetKind,
  type CrawlBudget,
  type CrawlDiscovery,
  type CrawlReport,
  type CrawlSpec,
  type ExecutionContext,
  type SpendLedger,
  type FetchResult,
  type ScrapeAtom,
  type ScrapeOutcome,
  type SitemapDiscovery,
  type SitemapLoadResult,
  type SitemapMode,
  type SitemapSource,
  type ListPageRead,
  type StepRecord,
  type Task,
} from '@w2l/contracts'
import { abortableSleep, createExecutionScope, createSpendLedger, raceWithSignal, throwIfExecutionStopped } from '@w2l/http-core'
import { reportFromTaskAttempt } from './crawlReport.js'
import { Frontier, type FrontierEnqueueResult, type FrontierItem } from './frontier.js'
import { canonicalizeUrl } from './canonicalize.js'
import type { TaskStore } from './taskStore.js'

/** The URL-scope options a run gives its frontier (CrawlStartRequest names them). */
type CrawlScopeOptions = Required<Pick<CrawlSpec, 'regexOnFullURL' | 'ignoreQueryParameters' | 'deduplicateSimilarURLs' | 'crawlEntireDomain' | 'allowSubdomains' | 'allowExternalLinks'>>

/** Up to this many collapsed and host-refused links are named in a page's `links_offered` trace event. */
const LINK_SAMPLE_LIMIT = 20
/** Sitemap files one load may read (an index and its children each count), and the entries it collects for a crawl without a page budget. */
const SITEMAP_MAX_FILES = 20
const SITEMAP_UNBOUNDED_URLS = 50_000

/** What became of one page's links at the frontier: the `links_offered` trace event's detail. */
type LinksOffered = Omit<CrawlDiscovery, 'duplicateContent' | 'sitemap'> & {
  samples: { collapsed: Array<{ url: string; into: string }>; hostDenied: string[] }
}

export interface CrawlClock {
  now(): number
  wait(ms: number, signal?: AbortSignal): Promise<void>
}

export const systemClock: CrawlClock = {
  now: () => Date.now(),
  wait: (ms, signal) => abortableSleep(ms, signal),
}

export interface OrchestratorOptions {
  store: TaskStore
  atom: ScrapeAtom
  clock?: CrawlClock
  newId?: () => string
  perHostConcurrency?: number
  perHostMinDelayMs?: number
  crawlDelayMsByHost?: ReadonlyMap<string, number>
  workerCount?: number
  signal?: AbortSignal
  /** Service shutdown interrupts work but leaves the task resumable. */
  shutdownSignal?: AbortSignal
  /**
   * The third-party cost of a page whose scrape threw: null (unknown, the default) when the scrape may have called a paid
   * service before it threw, 0 when the caller knows no paid route exists, so a run under a cost cap is not stopped by it.
   */
  scrapeErrorCostUsd?: number | null
  /** Reads the site's sitemap for a crawl whose mode is not `skip`; closed with the run. Without one every crawl runs as `skip`. */
  sitemapSource?: SitemapSource
  /**
   * Called once per step, after the step and the attempt's counters are
   * written, in the order the steps are written (a step's own worker waits
   * for it). An error it throws fails the run like a store error, so a
   * listener whose failure must not stop the crawl catches its own.
   */
  onStep?: (step: StepRecord) => void | Promise<void>
}

const EMPTY_USAGE = {
  wallMs: 0,
  bytesWire: 0,
  bytesDecompressed: 0,
  requestCount: 0,
  attemptCount: 0,
  contentTokens: null as number | null,
  browserMs: 0,
  externalCostUsd: null,
}

export class CrawlOrchestrator {
  private readonly store: TaskStore
  private readonly atom: ScrapeAtom
  private readonly clock: CrawlClock
  private readonly newId: () => string
  private readonly frontierOptions: Pick<OrchestratorOptions, 'perHostConcurrency' | 'perHostMinDelayMs' | 'crawlDelayMsByHost'>
  private readonly workerCount: number
  private readonly signal?: AbortSignal
  private readonly scrapeErrorCostUsd: number | null
  private readonly shutdownSignal?: AbortSignal
  private readonly sitemapSource?: SitemapSource
  private readonly onStep?: (step: StepRecord) => void | Promise<void>
  private ahead: (() => number) | null = null

  constructor(options: OrchestratorOptions) {
    this.store = options.store
    this.atom = options.atom
    this.clock = options.clock ?? systemClock
    this.newId = options.newId ?? (() => crypto.randomUUID())
    this.frontierOptions = options
    this.workerCount = Math.max(1, options.workerCount ?? 4)
    this.signal = options.signal
    this.scrapeErrorCostUsd = options.scrapeErrorCostUsd === undefined ? null : options.scrapeErrorCostUsd
    this.shutdownSignal = options.shutdownSignal
    this.sitemapSource = options.sitemapSource
    this.onStep = options.onStep
  }

  /**
   * The pages this run will still record if it runs to its end: those in
   * flight and the queued ones its page budget admits. It grows as pages add
   * links. Null when no run is under way.
   */
  pagesAhead(): number | null {
    return this.ahead?.() ?? null
  }

  async run(partial: Pick<CrawlSpec, 'seedUrl' | 'taskDir'> & Partial<CrawlSpec>): Promise<CrawlReport> {
    const spec: CrawlSpec = { ...DEFAULT_CRAWL_SPEC, ...partial }
    const startedAtMs = this.clock.now()
    // Injected clocks drive frontier tests; the transport contract is always epoch ms.
    const deadlineAt = spec.budget.maxWallMs === null ? undefined : Date.now() + spec.budget.maxWallMs
    const stopController = new AbortController()
    const scope = createExecutionScope({
      signal: AbortSignal.any([stopController.signal, ...(this.signal ? [this.signal] : []), ...(this.shutdownSignal ? [this.shutdownSignal] : [])]),
      deadlineAt,
    })
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let pollingStopped = false
    let persistedCancellation = false
    let wakeWorkers = (): void => {}
    const startedAt = new Date(startedAtMs).toISOString()

    const seenHash = new Map<string, string>()
    let pagesFetched = 0
    let cachedPages = 0
    let costUsd = 0
    let costUnknown = false
    // The run's spend ledger (ROADMAP PA item 4): every page's paid calls reserve their price ceiling here before they are
    // made, so concurrent pages cannot pass the run's cap; each page has a child capped at its own share, when one is set.
    // Opened once the task is known, with what its earlier attempts were charged: the cap is the task's, not each run's.
    let spend: SpendLedger | undefined
    let priorChargedUsd = 0
    // What the run's attempts were charged: each at its ledger charge (a reported price, or its ceiling), else its reported
    // cost; and whether one cost is unknown with no ceiling either, which no cap can bound.
    let chargedUsd = 0
    let unboundedCost = false
    let contentTokens = 0
    let contentTokensUnknown = false
    let budgetExceeded: BudgetKind | null = null
    let failed: unknown = null
    let task: Task | undefined
    let attempt: Attempt | undefined
    // A crawl's link discovery counters, written with the attempt after every page; a batch discovers nothing.
    let discovery: CrawlDiscovery | null = null
    const meters = () => ({
      pagesFetched: pagesFetched + cachedPages,
      wallMs: this.clock.now() - startedAtMs,
      costUsd: costUnknown ? null : costUsd,
      costUnknown,
      // What the ledger settled and holds reserved in this run, calls of pages never written (interrupted, cut) and
      // reservations in flight included, so a crash between steps leaves the next run no room it did not have; at least
      // what the written pages were charged, costs reported outside the ledger included.
      ...(spend === undefined ? {} : { chargedUsd: Math.max(chargedUsd, spend.settledUsd + spend.reservedUsd - priorChargedUsd) }),
      contentTokens,
      contentTokensUnknown,
      budgetExceeded,
      ...(discovery === null ? {} : { discovery }),
    })

    const markTimeBudget = (): void => {
      budgetExceeded = 'time'
      stopController.abort(new DOMException('Crawl wall-time budget exhausted', 'TimeoutError'))
    }
    const stopped = (): boolean => {
      if (scope.signal.aborted && !this.signal?.aborted && !this.shutdownSignal?.aborted && !persistedCancellation && failed === null) budgetExceeded = 'time'
      return scope.signal.aborted
    }
    const onStop = (): void => { wakeWorkers() }
    scope.signal.addEventListener('abort', onStop)
    try {
      const opened = await this.openRun(spec, startedAt)
      task = opened.task
      attempt = opened.attempt
      if (spec.budget.maxCostUsd !== null || (spec.budget.maxCostPerPageUsd ?? null) !== null) {
        const openedId = attempt.id
        priorChargedUsd = (await this.store.listAttempts(task.id)).filter((earlier) => earlier.id !== openedId).reduce((sum, earlier) => sum + (earlier.chargedUsd ?? 0), 0)
        spend = createSpendLedger(spec.budget.maxCostUsd, priorChargedUsd)
      }
      // A crawl runs with the options it stored; a batch, and a crawl stored
      // before its depth and hosts were kept, with the caller's.
      const stored = task.batch === undefined ? task.crawl : undefined
      if (task.batch === undefined) discovery = { ...EMPTY_CRAWL_DISCOVERY }
      // The sitemap mode and the concurrency cap the task was started with: a batch has neither, a run without a
      // source reads no sitemap, and a crawl stored before the options were kept resumes as `skip` with the worker count.
      const sitemapMode: SitemapMode = task.batch !== undefined || this.sitemapSource === undefined ? 'skip' : stored?.sitemap ?? 'skip'
      const concurrencyCap = task.batch !== undefined ? spec.maxConcurrency ?? null : stored?.maxConcurrency ?? null
      const workerCount = Math.max(1, Math.min(this.workerCount, concurrencyCap ?? this.workerCount))
      const frontier = new Frontier({
        seedUrl: task.seedUrl,
        maxDepth: stored?.maxDepth !== undefined ? stored.maxDepth : spec.maxDepth,
        allowlistedDomains: stored?.allowlistedDomains ?? spec.allowlistedDomains,
        includePaths: stored?.includePaths ?? spec.includePaths,
        excludePaths: stored?.excludePaths ?? spec.excludePaths,
        ...scopeOptions(spec, stored),
        ...this.frontierOptions,
      })
      const priorSteps = await this.store.listSteps(task.id)
      const restoredLinks = await this.restoreFrontier(frontier, task, spec, priorSteps)
      // How many of a batch's URLs the frontier has been given; an append pushes to the end of the list, so the tail past this index is new.
      let seededCount = task.batch?.urls.length ?? 0
      if (sitemapMode !== 'skip' && this.sitemapSource !== undefined && discovery !== null) {
        discovery.sitemap = await this.loadSitemap(this.sitemapSource, sitemapMode, task.seedUrl, task.budget.maxPages, frontier, discovery, scope)
      }
      // A resumed crawl's known links follow the sitemap's entries, as a fresh crawl's do; `only` follows none.
      if (sitemapMode !== 'only') for (const step of restoredLinks) for (const href of linksOf(step.result!)) frontier.enqueue(href, step.depth + 1, step.canonicalUrl)
      const runningTask = task
      const runningAttempt = attempt
      // The page budget is the task's: every URL it already has counts once,
      // and a page it has fetched before may be fetched again for free.
      const maxPages = task.budget.maxPages
      const taskUrls = new Set(priorSteps.map((step) => step.canonicalUrl))
      let newPagesReserved = 0
      const admit = (item: FrontierItem): boolean => maxPages === null || taskUrls.has(item.canonicalUrl) || taskUrls.size + newPagesReserved < maxPages
      // Dequeued pages whose step is not written yet.
      let pagesInFlight = 0
      this.ahead = () => {
        const queued = frontier.pendingCount()
        if (maxPages === null) return pagesInFlight + queued
        // A page the task already has is fetched again for free; a new one needs budget.
        const known = frontier.pendingCount((item) => taskUrls.has(item.canonicalUrl))
        return pagesInFlight + known + Math.min(queued - known, Math.max(0, maxPages - taskUrls.size - newPagesReserved))
      }
      let activePages = 0
      let stopping = false
      const wakeResolvers: Array<() => void> = []
      wakeWorkers = (): void => {
        while (wakeResolvers.length > 0) wakeResolvers.shift()!()
      }
      // URLs appended to a batch since the frontier was last fed: seeded (a URL this task already fetched is marked visited instead) and the idle workers woken.
      const seedAppended = (current: Task | null): void => {
        if (current?.batch === undefined || current.batch.urls.length <= seededCount) return
        seedBatchUrls(frontier, current.batch.urls.slice(seededCount), taskUrls)
        seededCount = current.batch.urls.length
        wakeWorkers()
      }

      // Cancellation written by another engine/process must reach an in-flight
      // request, rather than wait for that request to complete before polling.
      // The same read picks up URLs appended to a batch.
      const pollCancellation = async (): Promise<void> => {
        try {
          const current = await this.store.getTask(runningTask.id)
          if (pollingStopped) return
          if (current?.status === 'cancelled') {
            persistedCancellation = true
            stopController.abort(new DOMException('Crawl cancelled', 'AbortError'))
          } else if (!scope.signal.aborted) seedAppended(current)
        } catch (error) {
          if (pollingStopped) return
          failed = error
          stopController.abort(error)
        }
        if (!pollingStopped && !scope.signal.aborted) pollTimer = setTimeout(() => { void pollCancellation() }, 100)
      }
      pollTimer = setTimeout(() => { void pollCancellation() }, 100)

      const work = async (): Promise<void> => {
        for (;;) {
          const now = this.clock.now()
          if (stopping || stopped()) break
          const persistedTask = await this.store.getTask(runningTask.id)
          if (persistedTask?.status === 'cancelled') {
            persistedCancellation = true
            stopController.abort(new DOMException('Crawl cancelled', 'AbortError'))
          } else seedAppended(persistedTask)
          if (stopped()) { stopping = true; break }
          const spent: CrawlBudgetSpent = { wallMs: now - startedAtMs, costUsd, costUnknown, chargedUsd: priorChargedUsd + chargedUsd, unboundedCost, tokens: contentTokens, tokensUnknown: contentTokensUnknown }
          const hit = budgetHit(spec.budget, spent, spend)
          if (hit !== null) { budgetExceeded = hit; if (hit === 'time') markTimeBudget(); break }
          const next = frontier.dequeue(now, admit)
          if (next.refused > 0) budgetExceeded = 'pages'
          if (next.item === null) {
            if (next.nextReadyAtMs === null) {
              if (activePages === 0) break
              await new Promise<void>((resolve) => wakeResolvers.push(resolve))
              continue
            }
            const remainingWait = Math.max(0, next.nextReadyAtMs - now)
            if (spec.budget.maxWallMs !== null && spent.wallMs + remainingWait >= spec.budget.maxWallMs) { markTimeBudget(); break }
            try { await raceWithSignal(this.clock.wait(remainingWait, scope.signal), scope.signal) } catch (error) { if (!stopped()) throw error }
            continue
          }
          const item = next.item
          let reserved = !taskUrls.has(item.canonicalUrl)
          if (reserved) newPagesReserved++
          const delay = crawlDelayDetail(item.host, now, next.previousStartAtMs, frontier.hostDelayMs(item.host), frontier.crawlDelayMs(item.host))
          activePages++
          pagesInFlight++
          let inFlight = true
          try {
            const cached = spec.useCached ? await this.store.getStepByCanonicalUrl(runningTask.id, item.canonicalUrl) : null
            const reusable = cached !== null && cached.result !== null && CONTENTFUL_STATUS.has(cached.result.status)
            let result: FetchResult
            let links: readonly string[]
            let audit: import('@w2l/contracts').LadderRunAudit | undefined
            let cachedPage = false
            let pageLedger: SpendLedger | undefined
            if (reusable && cached.result !== null) {
              result = cached.result; links = linksOf(cached.result); audit = cached.audit; cachedPage = true
            } else {
              const scrapeStartedAt = Date.now()
              let outcome: ScrapeOutcome
              // A batch with a paginate step keeps each page the step reads in the checkpoint (ROADMAP PA item 3): a run cut
              // at page N resumes from them. The whole URL is still the step; the pages are its progress until it is stored.
              const pagesRead = listsPages(runningTask) ? await this.store.listPagesRead(runningTask.id, item.canonicalUrl) : []
              pageLedger = spend?.child(spec.budget.maxCostPerPageUsd ?? null)
              const pageSpend = pageLedger === undefined ? {} : { spend: pageLedger }
              const pageScope = !listsPages(runningTask) ? { ...scope, ...pageSpend } : {
                ...scope,
                ...pageSpend,
                onListPage: (page: ListPageRead) => { void this.store.putPageRead(runningTask.id, item.canonicalUrl, page).catch(() => {}) },
                ...(pagesRead.length === 0 ? {} : { listResume: { pages: pagesRead } }),
              }
              try { outcome = await raceWithSignal(this.atom.scrape(item.url, pageScope), scope.signal) }
              catch (error) {
                // Cancellation, shutdown and the crawl's own budget stop the run.
                // Any other exception belongs to this URL: it becomes the URL's
                // failed item, and one page never fails a whole batch or crawl.
                if (stopped()) throw error
                outcome = { result: scrapeErrorResult(item.url, error, Date.now() - scrapeStartedAt, this.scrapeErrorCostUsd), links: [] }
                // The paid calls the run made before it threw stay on the page's record (ROADMAP PA item 4).
                const paid = paidCallsOfError(error)
                if (paid !== null) outcome = { ...outcome, result: { ...outcome.result, trace: [...outcome.result.trace, paid] } }
                // Every paid call of this page reserved through its ledger before it was made: what that ledger settled is the
                // page's whole paid spend, though the scrape threw before reporting a cost.
                if (pageLedger !== undefined) outcome = { ...outcome, result: { ...outcome.result, usage: { ...outcome.result.usage, externalCostChargedUsd: pageLedger.settledUsd } } }
              }
              result = outcome.result; links = outcome.links.length > 0 ? outcome.links : linksOf(outcome.result); audit = outcome.audit
              if (outcome.cached === true) {
                // A stored result the cache answered with: nothing was requested, so the host's Crawl-delay stays as it was and no delay is on the record.
                cachedPage = true
              } else {
                frontier.setCrawlDelay(item.host, outcome.crawlDelayMs ?? null)
                // The politeness delay this request waited for is part of its record.
                result = { ...result, trace: [{ at: 0, lane: result.lane, event: 'crawl_delay', detail: delay }, ...result.trace] }
              }
            }
            if (item.depth === 0 && CONTENTFUL_STATUS.has(result.status)) frontier.followSeedRedirect(result.evidence.finalUrl)
            const latestTask = await this.store.getTask(runningTask.id)
            if (latestTask?.status === 'cancelled') {
              persistedCancellation = true
              stopController.abort(new DOMException('Crawl cancelled', 'AbortError'))
            }
            if (spec.budget.maxWallMs !== null && this.clock.now() - startedAtMs >= spec.budget.maxWallMs) markTimeBudget()
            throwIfExecutionStopped(scope)
            const hash = result.evidence.rawBodySha256
            if (task?.batch === undefined && hash !== null && CONTENTFUL_STATUS.has(result.status)) {
              const prior = seenHash.get(hash)
              if (prior !== undefined && prior !== item.canonicalUrl) {
                result = duplicateResult(item.url, result, prior); links = []
                if (discovery !== null) discovery.duplicateContent++
              }
              else seenHash.set(hash, item.canonicalUrl)
            }
            // A contentful page's links go to the frontier before its step is
            // written, so a crawl page's trace says what became of each of them.
            // A batch page's links are offered too (its depth limit refuses
            // them) and leave no record: a batch discovers nothing.
            const contentful = CONTENTFUL_STATUS.has(result.status)
            // With sitemap `only` a page's links stay on its record and are not offered: the sitemap is the crawl's discovery.
            if (contentful && sitemapMode !== 'only') {
              const offered = offerLinks(frontier, links, item)
              if (discovery !== null) {
                addDiscovery(discovery, offered)
                result = { ...result, trace: [...result.trace, { at: result.usage.wallMs, lane: result.lane, event: 'links_offered', detail: offered }] }
              }
            }
            if (discovery !== null) result = { ...result, trace: [{ at: 0, lane: result.lane, event: 'discovered', detail: { via: item.via, from: item.from ?? null } }, ...result.trace] }
            const at = new Date(this.clock.now()).toISOString()
            // Written from here on, no longer in flight (the write itself is synchronous).
            inFlight = false
            pagesInFlight--
            const step: StepRecord = { id: this.newId(), taskId: runningTask.id, attemptId: runningAttempt.id, url: item.url, canonicalUrl: item.canonicalUrl, depth: item.depth, status: stepStatusFromResult(result.status), lane: result.lane, contentHash: result.evidence.rawBodySha256, cached: cachedPage, result, audit, createdAt: at, updatedAt: at }
            await this.store.putStep(step)
            // The pages read before a check the site put up stay for a later run to go on from; any other result ends them.
            if (listsPages(runningTask) && !stoppedAtCheck(result)) await this.store.clearPagesRead(runningTask.id, item.canonicalUrl)
            taskUrls.add(item.canonicalUrl)
            if (reserved) { newPagesReserved--; reserved = false }
            if (cachedPage) cachedPages += 1; else pagesFetched += 1
            if (!cachedPage) {
              // The page's charge: what its answer or attempts report, and no less than what its ledger settled, which holds
              // every paid call the page made (a re-read's, a call that threw or was cut). An unknown cost no ceiling bounds
              // stops a capped run.
              const tried = audit?.summary.attempts ?? [{ result }]
              const reported = result.usage.externalCostChargedUsd ?? tried.reduce((sum, { result: attempt }) => sum + (attempt.usage.externalCostUsd ?? 0), 0)
              chargedUsd += Math.max(reported, pageLedger?.settledUsd ?? 0)
              unboundedCost ||= tried.some(({ result: attempt }) => attempt.usage.externalCostUsd === null && attempt.usage.externalCostChargedUsd === undefined)
              const meter = audit?.summary
              if (meter !== undefined) {
                costUsd += meter.externalCost.knownSubtotal
                costUnknown ||= meter.externalCost.unknown
                contentTokens += meter.contentTokenMeter.knownSubtotal
                contentTokensUnknown ||= meter.contentTokenMeter.unknown
              } else {
                costUsd += result.usage.externalCostUsd ?? 0
                costUnknown ||= result.usage.externalCostUsd === null
                contentTokens += result.usage.contentTokens ?? 0
                contentTokensUnknown ||= result.usage.contentTokens === null
              }
            }
            // A status read while the crawl runs sees its progress.
            await this.store.putAttempt({ ...runningAttempt, ...meters() })
            if (this.onStep !== undefined) await this.onStep(step)
            if (contentful) wakeWorkers()
          } catch (err) {
            stopping = true
            wakeWorkers()
            if (stopped()) return
            failed = err
            stopController.abort(err)
            throw err
          } finally {
            if (inFlight) pagesInFlight--
            if (reserved) newPagesReserved--
            frontier.release(item.canonicalUrl)
            activePages--
            wakeWorkers()
          }
        }
      }
      const workers = Array.from({ length: workerCount }, () => work())
      const settled = await Promise.allSettled(workers)
      const firstFailure = settled.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected')
      if (firstFailure !== undefined) throw firstFailure.reason
    } catch (err) {
      if (!stopped()) failed = err
    } finally {
      this.ahead = null
      pollingStopped = true
      if (pollTimer !== undefined) clearTimeout(pollTimer)
      scope.signal.removeEventListener('abort', onStop)
      scope.dispose()
      wakeWorkers()
      await this.atom.close().catch(() => {})
      await this.sitemapSource?.close().catch(() => {})
    }

    if (task === undefined || attempt === undefined) {
      if (failed !== null) throw failed
      throw new Error('crawl did not open a task')
    }

    const endedAt = new Date(this.clock.now()).toISOString()
    const persistedTask = await this.store.getTask(task.id)
    const cancelled = this.signal?.aborted === true || persistedCancellation || persistedTask?.status === 'cancelled'
    const interrupted = !cancelled && this.shutdownSignal?.aborted === true
    const status = cancelled ? 'cancelled' : interrupted ? 'paused' : failed !== null ? 'failed' : 'completed'
    const finishedAttempt: Attempt = {
      ...attempt,
      status: interrupted ? 'interrupted' : status === 'paused' ? 'interrupted' : status,
      endedAt,
      ...meters(),
    }
    try {
      await this.store.putAttempt(finishedAttempt)
    } catch (err) {
      if (failed === null) failed = err
    }
    // The row as it is now, not the object the run opened with: a batch's URL list may have grown meanwhile, and the final write keeps it.
    let finished: Task = { ...(persistedTask ?? task), status, updatedAt: endedAt }
    try {
      finished = { ...((await this.store.getTask(task.id)) ?? persistedTask ?? task), status, updatedAt: endedAt }
      await this.store.putTask(finished)
    } catch (err) {
      if (failed === null) failed = err
    }
    if (failed !== null && !cancelled && !interrupted) throw failed

    return reportFromTaskAttempt(finished, finishedAttempt, cachedPages)
  }

  private async openRun(spec: CrawlSpec, startedAt: string): Promise<{ task: Task; attempt: Attempt }> {
    if (spec.resumeFrom !== null) {
      const existing = await this.store.getTask(spec.resumeFrom)
      if (existing === null) throw new Error(`resume: unknown task ${spec.resumeFrom}`)
      if (existing.status === 'cancelled') throw new Error(`resume: task ${spec.resumeFrom} is cancelled`)
      const interruptedId = await this.interruptOpenAttempts(existing.id, startedAt)
      const task: Task = { ...existing, status: 'running', updatedAt: startedAt }
      await this.store.putTask(task)
      const attempt = newAttempt(this.newId(), task.id, startedAt, interruptedId)
      await this.store.putAttempt(attempt)
      return { task, attempt }
    }

    if (spec.taskId !== undefined) {
      const existing = await this.store.getTask(spec.taskId)
      if (existing === null) throw new Error(`unknown task ${spec.taskId}`)
      if (existing.status === 'cancelled') throw new Error(`task ${spec.taskId} is cancelled`)
      const interruptedId = await this.interruptOpenAttempts(existing.id, startedAt)
      const task: Task = { ...existing, status: 'running', updatedAt: startedAt }
      await this.store.putTask(task)
      const attempt = newAttempt(this.newId(), task.id, startedAt, interruptedId)
      await this.store.putAttempt(attempt)
      return { task, attempt }
    }

    const task: Task = {
      id: this.newId(),
      seedUrl: spec.seedUrl,
      taskDir: spec.taskDir,
      mode: spec.mode,
      status: 'running',
      budget: spec.budget,
      crawl: {
        maxDepth: spec.maxDepth, allowlistedDomains: spec.allowlistedDomains, includePaths: spec.includePaths ?? [], excludePaths: spec.excludePaths ?? [], ...scopeOptions(spec, undefined),
        // What this run can do: without a source the crawl reads no sitemap, and the task says so.
        sitemap: this.sitemapSource === undefined ? 'skip' : spec.sitemap ?? DEFAULT_CRAWL_SPEC.sitemap ?? 'include',
        maxConcurrency: spec.maxConcurrency ?? null,
      },
      createdAt: startedAt,
      updatedAt: startedAt,
    }
    await this.store.putTask(task)
    const attempt = newAttempt(this.newId(), task.id, startedAt)
    await this.store.putAttempt(attempt)
    return { task, attempt }
  }

  private async interruptOpenAttempts(taskId: string, endedAt: string): Promise<string | null> {
    const prior = await this.store.listAttempts(taskId)
    let recoveredFrom: string | null = prior.filter(attempt => attempt.status === 'interrupted').at(-1)?.id ?? null
    for (const attempt of prior) {
      if (attempt.status !== 'running') continue
      const steps = await this.store.listSteps(taskId, attempt.id)
      await this.store.putAttempt({
        ...attempt,
        status: 'interrupted',
        endedAt,
        pagesFetched: steps.length,
        costUsd: attempt.costUnknown === true ? null : attempt.costUsd,
      })
      recoveredFrom = attempt.id
    }
    return recoveredFrom
  }

  /**
   * Seed the frontier: a batch's URLs, a fresh crawl's seed, or a resumed
   * crawl's contentful pages. Returns the resumed pages whose links the caller
   * enqueues after the sitemap's entries (none for a batch or a fresh crawl).
   */
  private async restoreFrontier(frontier: Frontier, task: Task, spec: CrawlSpec, prior: readonly StepRecord[]): Promise<readonly StepRecord[]> {
    if (task.batch !== undefined) {
      seedBatchUrls(frontier, task.batch.urls, new Set(prior.filter(step => step.result !== null).map(step => step.canonicalUrl)))
      return []
    }
    if (spec.resumeFrom === null) {
      frontier.seed(task.seedUrl)
      return []
    }
    const contentful = prior.filter((step) => step.result !== null && CONTENTFUL_STATUS.has(step.result.status))
    if (contentful.length === 0) {
      frontier.seed(task.seedUrl)
      return []
    }
    // Pages on the host the seed redirected to belong to the crawl, as before.
    for (const step of contentful) if (step.depth === 0) frontier.followSeedRedirect(step.result!.evidence.finalUrl)
    for (const step of contentful) frontier.seed(step.url, step.depth)
    return contentful
  }

  /**
   * Read the site's sitemap and offer its entries at depth 1 under a link's
   * rules, counting what became of each in the attempt's discovery. A load
   * that throws is this crawl's own record, not its failure: the crawl goes on
   * with the links it finds. Cancellation, shutdown and the time budget still
   * stop the run.
   */
  private async loadSitemap(source: SitemapSource, mode: SitemapMode, seedUrl: string, maxPages: number | null, frontier: Frontier, discovery: CrawlDiscovery, scope: ExecutionContext & { signal: AbortSignal }): Promise<SitemapDiscovery> {
    const record: SitemapDiscovery = { mode, sources: [], files: [], listed: 0, enqueued: 0, truncated: null, error: null }
    let loaded: SitemapLoadResult
    try {
      loaded = await raceWithSignal(source.load({ seedUrl, maxUrls: maxPages ?? SITEMAP_UNBOUNDED_URLS, maxFiles: SITEMAP_MAX_FILES }, scope), scope.signal)
    } catch (error) {
      if (scope.signal.aborted) throw error
      return { ...record, error: (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500) }
    }
    const offered = emptyLinksOffered()
    for (const entry of loaded.urls) countVerdict(offered, frontier.enqueueFromSitemap(entry.url, 1, entry.file), entry.url, entry.file)
    addDiscovery(discovery, offered)
    return { ...record, sources: loaded.sources, files: loaded.files, listed: loaded.urls.length, enqueued: offered.enqueued, truncated: loaded.truncated }
  }
}

/** Whether a result is a list step stopped at a check the site put up (ListStop `challenge`), its pages kept for a later run. */
function stoppedAtCheck(result: FetchResult): boolean {
  return result.status === 'blocked' && (result.actions?.lists ?? []).some((list) => list.stoppedBy === 'challenge')
}

/** Whether the task's pages run a paginate step, whose pages are kept as they are read. */
function listsPages(task: Task): boolean {
  return (task.batch?.actions ?? []).some((action) => action.type === 'paginate')
}

/** Seed a batch's URLs; one the task has already fetched (by canonical URL) is marked visited instead, so a resume or a relaunch never fetches it again. */
function seedBatchUrls(frontier: Frontier, urls: readonly string[], completed: ReadonlySet<string>): void {
  for (const url of urls) {
    const canonical = canonicalizeUrl(url)
    if (canonical !== null && completed.has(canonical)) frontier.markVisited(canonical)
    else frontier.seed(url)
  }
}

/**
 * The URL-scope options a run gives its frontier: the task's stored ones. A
 * crawl stored before they were kept runs under the rule it was started
 * with, the whole host and exact canonical URLs; a batch (nothing stored)
 * takes the spec's, which the engine sets to the same rule.
 */
function scopeOptions(spec: CrawlSpec, stored: Task['crawl'] | undefined): CrawlScopeOptions {
  if (stored === undefined) {
    return {
      regexOnFullURL: spec.regexOnFullURL ?? DEFAULT_CRAWL_SPEC.regexOnFullURL ?? false,
      ignoreQueryParameters: spec.ignoreQueryParameters ?? DEFAULT_CRAWL_SPEC.ignoreQueryParameters ?? false,
      deduplicateSimilarURLs: spec.deduplicateSimilarURLs ?? DEFAULT_CRAWL_SPEC.deduplicateSimilarURLs ?? true,
      crawlEntireDomain: spec.crawlEntireDomain ?? DEFAULT_CRAWL_SPEC.crawlEntireDomain ?? false,
      allowSubdomains: spec.allowSubdomains ?? DEFAULT_CRAWL_SPEC.allowSubdomains ?? false,
      allowExternalLinks: spec.allowExternalLinks ?? DEFAULT_CRAWL_SPEC.allowExternalLinks ?? false,
    }
  }
  return {
    regexOnFullURL: stored.regexOnFullURL ?? false,
    ignoreQueryParameters: stored.ignoreQueryParameters ?? false,
    deduplicateSimilarURLs: stored.deduplicateSimilarURLs ?? false,
    crawlEntireDomain: stored.crawlEntireDomain ?? true,
    allowSubdomains: stored.allowSubdomains ?? false,
    allowExternalLinks: stored.allowExternalLinks ?? false,
  }
}

/**
 * Offer a page's links to the frontier and count what became of each: the
 * `links_offered` trace event. A link folded into an earlier page (a query
 * the crawl ignores, `/a/` after `/a`, the www twin) is `collapsed`, with up
 * to LINK_SAMPLE_LIMIT named; so is a host the scope refused.
 */
function offerLinks(frontier: Frontier, links: readonly string[], page: FrontierItem): LinksOffered {
  const offered = emptyLinksOffered()
  for (const href of links) countVerdict(offered, frontier.enqueue(href, page.depth + 1, page.canonicalUrl), href, page.canonicalUrl)
  return offered
}

function emptyLinksOffered(): LinksOffered {
  return { offered: 0, enqueued: 0, duplicate: 0, collapsed: 0, hostDenied: 0, subtreeDenied: 0, pathDenied: 0, depthDenied: 0, samples: { collapsed: [], hostDenied: [] } }
}

/** Count one frontier verdict for a link (`href` as the page gave it, resolved against `base`) or a sitemap entry. */
function countVerdict(offered: LinksOffered, verdict: FrontierEnqueueResult, href: string, base: string): void {
  offered.offered++
  if (verdict.accepted) { offered.enqueued++; return }
  switch (verdict.reason) {
    case 'duplicate':
      if (verdict.collapsedInto === undefined) { offered.duplicate++; break }
      offered.collapsed++
      if (offered.samples.collapsed.length < LINK_SAMPLE_LIMIT) offered.samples.collapsed.push({ url: absoluteHref(href, base), into: verdict.collapsedInto })
      break
    case 'host_denied':
      offered.hostDenied++
      if (offered.samples.hostDenied.length < LINK_SAMPLE_LIMIT) offered.samples.hostDenied.push(absoluteHref(href, base))
      break
    case 'subtree_denied': offered.subtreeDenied++; break
    case 'path_denied': offered.pathDenied++; break
    case 'depth': offered.depthDenied++; break
    default: break
  }
}

function addDiscovery(discovery: CrawlDiscovery, offered: LinksOffered): void {
  discovery.offered += offered.offered
  discovery.enqueued += offered.enqueued
  discovery.duplicate += offered.duplicate
  discovery.collapsed += offered.collapsed
  discovery.hostDenied += offered.hostDenied
  discovery.subtreeDenied += offered.subtreeDenied
  discovery.pathDenied += offered.pathDenied
  discovery.depthDenied += offered.depthDenied
}

/** The link as the page gave it, made absolute against the page; as given when it does not parse. */
function absoluteHref(href: string, base: string): string {
  try { return new URL(href, base).href } catch { return href }
}

/** What an attempt has spent. Pages are the task's, counted by the frontier's admit test. */
interface CrawlBudgetSpent {
  wallMs: number
  costUsd: number
  costUnknown: boolean
  /** What the spend ledger charged the attempts (a reported price, or a ceiling), else what they reported. */
  chargedUsd: number
  /** An attempt's cost is unknown and no ledger charged it a ceiling. */
  unboundedCost: boolean
  tokens: number
  tokensUnknown: boolean
}

function budgetHit(budget: CrawlBudget, spent: CrawlBudgetSpent, spend?: SpendLedger): BudgetKind | null {
  if (budget.maxWallMs !== null && spent.wallMs >= budget.maxWallMs) return 'time'
  // With a spend ledger every paid call was reserved at its price ceiling before it was made and settled at its reported
  // price or that ceiling: the run's spend is bounded though a provider stated no price, so it stops at its cap, not on an unknown.
  if (budget.maxCostUsd !== null && spend !== undefined) {
    if (spent.unboundedCost) return 'cost_unknown'
    // Calls in flight count at their reserved ceilings; a call settled before its page finished counts once.
    if (Math.max(spent.chargedUsd, spend.settledUsd) + spend.reservedUsd >= budget.maxCostUsd) return 'cost'
  } else {
    if (budget.maxCostUsd !== null && spent.costUnknown) return 'cost_unknown'
    if (budget.maxCostUsd !== null && spent.costUsd >= budget.maxCostUsd) return 'cost'
  }
  if (budget.maxTokens !== null && spent.tokensUnknown) return 'tokens_unknown'
  if (budget.maxTokens !== null && spent.tokens >= budget.maxTokens) return 'tokens'
  return null
}

/**
 * The politeness a page's request waited for: when it started, when the
 * previous page on its host started, and the spacing required between them,
 * max(perHostMinDelayMs, robots.txt Crawl-delay).
 */
function crawlDelayDetail(host: string, startedAtMs: number, previousStartAtMs: number | null, requiredDelayMs: number, robotsCrawlDelayMs: number | null): Record<string, unknown> {
  return {
    host,
    startedAt: new Date(startedAtMs).toISOString(),
    previousStartedAt: previousStartAtMs === null ? null : new Date(previousStartAtMs).toISOString(),
    observedDelayMs: previousStartAtMs === null ? null : startedAtMs - previousStartAtMs,
    requiredDelayMs,
    robotsCrawlDelayMs,
  }
}

function linksOf(result: FetchResult): readonly string[] {
  return result.links ?? []
}

function newAttempt(id: string, taskId: string, startedAt: string, recoveredFromAttemptId: string | null = null): Attempt {
  return {
    id,
    taskId,
    status: 'running',
    startedAt,
    endedAt: null,
    pagesFetched: 0,
    wallMs: 0,
    costUsd: null,
    costUnknown: true,
    contentTokens: 0,
    contentTokensUnknown: false,
    budgetExceeded: null,
    recoveredFromAttemptId,
  }
}

/**
 * The item for a URL whose scrape threw instead of returning a result. No
 * response fact is known, so the evidence stays null and the usage meters
 * stay unknown; the lane is the ladder's first rung, as in its own refusals.
 */
function scrapeErrorResult(url: string, error: unknown, wallMs: number, externalCostUsd: number | null): FetchResult {
  const name = error instanceof Error ? error.name : typeof error
  const message = error instanceof Error ? error.message : String(error)
  return {
    requestedUrl: url,
    status: 'failed',
    failureReason: name === 'TimeoutError' ? 'timeout' : 'internal_error',
    blockReason: null,
    budgetExceeded: null,
    lane: 'http',
    escalations: [],
    markdown: null,
    links: [],
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
    usage: { ...EMPTY_USAGE, wallMs, bytesWire: null, externalCostUsd },
    trace: [{ at: wallMs, lane: 'http', event: 'scrape_error', detail: { name, error: message.slice(0, 500) } }],
  }
}

// The page keeps its own links (an empty list would claim it has none); the
// caller does not follow them because a duplicate is not contentful. Its
// content repeats an earlier page's, so it goes in every form: the Markdown,
// the `html`, `rawHtml`, `images`, `tables` and `attributes` formats and the
// `screenshot`, which a page carries only when it was read as content (a
// crawl with the format answers `screenshot: null` for a duplicate).
function duplicateResult(url: string, { html: _html, rawHtml: _rawHtml, images: _images, tables: _tables, pages: _pages, attributes: _attributes, screenshot: _screenshot, list: _list, warnings: priorWarnings, ...prior }: FetchResult, firstCanonicalUrl: string): FetchResult {
  // The records went with the page's other formats; the warnings about them go too.
  const warnings = priorWarnings?.filter((warning) => warning.code !== 'list_truncated' && warning.code !== 'list_not_detected')
  return {
    ...prior,
    requestedUrl: url,
    status: 'duplicate',
    failureReason: null,
    blockReason: null,
    budgetExceeded: null,
    markdown: null,
    ...(warnings === undefined || warnings.length === 0 ? {} : { warnings }),
    usage: {
      ...EMPTY_USAGE,
      wallMs: prior.usage.wallMs,
      bytesWire: prior.usage.bytesWire,
      bytesDecompressed: prior.usage.bytesDecompressed,
      requestCount: prior.usage.requestCount,
      attemptCount: prior.usage.attemptCount,
      browserMs: prior.usage.browserMs,
      externalCostUsd: prior.usage.externalCostUsd,
      ...(prior.usage.externalCostChargedUsd === undefined ? {} : { externalCostChargedUsd: prior.usage.externalCostChargedUsd }),
    },
    trace: [
      ...prior.trace,
      {
        at: prior.usage.wallMs,
        lane: prior.lane,
        event: 'duplicate_content',
        detail: { firstCanonicalUrl, rawBodySha256: prior.evidence.rawBodySha256 },
      },
    ],
  }
}
