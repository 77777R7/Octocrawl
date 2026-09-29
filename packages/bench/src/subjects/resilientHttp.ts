import {
  estimateTokens,
  QUALITY_ESCALATION_MAX_CONFIDENCE,
  QUALITY_ESCALATION_MAX_TOKENS,
  type CrawlMode,
  type ExecutionContext,
  type FetchOptions,
  type FetchResult,
  type NetworkPolicy,
  type TraceEvent,
} from '@w2l/contracts'
import { collectLinks, extractTf, htmlToMarkdown } from '@w2l/extract-tf'
import { resilientFetch, createExecutionScope, throwIfExecutionStopped, classifyGate, escalationForBlock, parseRetryAfterMs, sha256Utf8, type ResilientFetcher } from '@w2l/http-core'
import { ProxyAgent, request, type Dispatcher } from 'undici'
import { assertSafeUrl, BodyTooLargeError, defaultNetworkPolicy, EgressRoutes, isLocalPreviewProxyTarget, readCappedBody, validateLocalPreviewProxy } from '../egress.js'
import { prepareHttpIdentity, recordHttpIdentity } from '../httpIdentity.js'
import { RobotsOriginCache } from '../robotsLookup.js'
import type { SubjectAdapter } from '../subject.js'
import { OriginScheduler, type OriginPermit } from './originScheduler.js'
import { errorPageEvidence, isNoContentStatus, isSuccessStatus } from './errorPage.js'
import { captureRawHtml } from '../rawArtifact.js'

/**
 * Resilient HTTP subject: the resilient transport engine (redirect following
 * + 503 retry, http-core) composed with the extract-tf cascade. This is the
 * production-shaped arm — BareHttpSubject stays the untouched floor.
 *
   * Transport semantics come from resilientFetch; extraction and markdown
   * (htmlToMarkdown after extract-tf) are identical to ExtractTfSubject, so
   * any score delta against that arm is attributable to transport alone.
 */
export class ResilientHttpSubject implements SubjectAdapter {
  readonly meta = {
    id: 'resilient-http',
    displayName: 'Resilient HTTP (redirect+retry × extract-tf)',
    version: '0.1.0',
    hosting: 'self_hosted' as const,
  }

  private readonly prepared: ReturnType<typeof prepareHttpIdentity>
  private readonly fetcherFor: (initialUrl: string, validators: { etag?: string; lastModified?: string }, signal?: AbortSignal, onBodyRead?: (ms: number) => void, onRequestWait?: (intervalMs: number, cooldownMs: number) => void, onEnvProxy?: (url: string, proxy: string) => void) => ResilientFetcher
  private readonly robotsCache: RobotsOriginCache
  private readonly networkPolicy: NetworkPolicy
  private readonly scheduler: OriginScheduler
  private readonly egress: EgressRoutes
  private readonly localPreviewProxy: ProxyAgent | null
  private readonly localPreviewRobotsException: boolean
  private teardownPromise: Promise<void> | null = null

  constructor(mode: CrawlMode = 'standard', networkPolicy?: NetworkPolicy, scheduler?: OriginScheduler, robotsFailClosed = false, localPreviewProxyUrl?: string, localPreviewRobotsException = false) {
    this.prepared = prepareHttpIdentity(mode)
    if (localPreviewRobotsException && !localPreviewProxyUrl) throw new Error('Local platform exception requires a loopback proxy')
    this.localPreviewRobotsException = localPreviewRobotsException
    if (localPreviewRobotsException) this.prepared.identity.respectsRobots = false
    this.networkPolicy = networkPolicy ?? defaultNetworkPolicy()
    this.scheduler = scheduler ?? new OriginScheduler(this.networkPolicy)
    this.egress = new EgressRoutes(this.networkPolicy)
    this.localPreviewProxy = localPreviewProxyUrl ? new ProxyAgent(validateLocalPreviewProxy(localPreviewProxyUrl)) : null
    this.robotsCache = new RobotsOriginCache(this.networkPolicy, url => this.dispatcherFor(url), robotsFailClosed)
    const headers = this.prepared.headers
    const maxBodyBytes = this.networkPolicy.maxBodyBytes
    this.fetcherFor = (initialUrl, validators, signal, onBodyRead, onRequestWait, onEnvProxy) => async (url, init) => {
      await this.scheduler.beforeRequest(new URL(url).origin, init.signal ?? signal, onRequestWait)
      const envProxy = this.envProxyFor(url)
      if (envProxy !== null) onEnvProxy?.(url, envProxy)
      const response = await request(url, {
        dispatcher: this.dispatcherFor(url),
        method: 'GET',
        headersTimeout: init.headersTimeoutMs,
        bodyTimeout: init.bodyTimeoutMs,
        // Validators are bound to one representation; never forward on redirects.
        headers: { ...headers, ...(url === initialUrl ? validators.etag ? { 'if-none-match': validators.etag } : validators.lastModified ? { 'if-modified-since': validators.lastModified } : {} : {}) },
        signal: init.signal ?? signal,
      }).catch((error: unknown) => { throw proxyRefusal(error) ?? error })
      const responseHeaders = response.headers
      let body: string | undefined
      return {
        status: response.statusCode,
        headers: {
          get: (name: string) => {
            const v = responseHeaders[name.toLowerCase()]
            return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null
          },
        },
        bodyText: async () => {
          if (body !== undefined) return body
          const bodyStart = performance.now()
          const buf = await readCappedBody(response.body, maxBodyBytes)
          body = new TextDecoder().decode(buf)
          onBodyRead?.(Math.max(0, performance.now() - bodyStart))
          return body
        },
      }
    }
  }

  private dispatcherFor(url: string): Dispatcher {
    return this.localPreviewProxy !== null && isLocalPreviewProxyTarget(url) ? this.localPreviewProxy : this.egress.dispatcherFor(url)
  }

  /** `host:port` of the environment proxy a request to this URL goes through; null when it does not. */
  private envProxyFor(url: string): string | null {
    return this.localPreviewProxy !== null && isLocalPreviewProxyTarget(url) ? null : this.egress.proxyFor(url)?.endpoint ?? null
  }

  async fetch(url: string, deadlineMs?: number, signal?: AbortSignal, validators: { etag?: string; lastModified?: string } = {}, onRetryAfter?: ExecutionContext['onRetryAfter'], options: FetchOptions = {}): Promise<FetchResult> {
    if (this.localPreviewRobotsException && !isLocalPreviewProxyTarget(url)) throw new Error('Local platform exception is limited to fixed platform hosts')
    const scope = createExecutionScope({ signal, deadlineAt: deadlineMs, onRetryAfter })
    const start = Date.now()
    const monotonicStart = performance.now()
    const origin = new URL(url).origin
    const deadlinePassed = () => scope.signal.reason?.name === 'TimeoutError' || deadlineMs !== undefined && Date.now() >= deadlineMs
    // A timeout the deadline caused says so in usage. budgetExceeded stays
    // null: the contract reserves it for status budget_exceeded.
    const markDeadline = (result: FetchResult): FetchResult =>
      result.failureReason === 'timeout' && deadlinePassed() ? { ...result, usage: { ...result.usage, deadlineExceeded: true } } : result
    let permit: OriginPermit | undefined
    try {
      permit = await this.scheduler.acquire(origin, scope.signal)
      throwIfExecutionStopped(scope)
      return markDeadline(await this.fetchWithinBudget(url, scope, validators, monotonicStart, permit.queueMs, permit.cooldownWaitMs, options))
    } catch (error) {
      if (!scope.signal.aborted && (deadlineMs === undefined || Date.now() < deadlineMs)) throw error
      const result = this.denied(url, start, [], 'timeout')
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      const retryAt = this.scheduler.retryAt(origin)
      const timed = { ...result, ...(retryAt === undefined ? {} : { retryAt }), usage: { ...result.usage, wallMs: totalMs, timings: { queueMs: permit?.queueMs ?? (retryAt === undefined ? totalMs : 0), robotsMs: 0, cooldownWaitMs: permit?.cooldownWaitMs ?? (retryAt === undefined ? 0 : totalMs), retryWaitMs: 0, requestMs: 0, bodyReadMs: 0, transportMs: 0, parseMs: 0, extractMs: 0, formatMs: 0, serializeMs: 0, modelMs: 0, totalMs } } }
      return markDeadline(timed)
    } finally {
      scope.dispose()
      permit?.release()
    }
  }

  private async fetchWithinBudget(url: string, execution: ExecutionContext, validators: { etag?: string; lastModified?: string }, monotonicStart: number, initialQueueMs: number, initialCooldownWaitMs: number, options: FetchOptions): Promise<FetchResult> {
    const { signal, deadlineAt, onRetryAfter } = execution
    const start = Date.now()
    let robotsMs = 0
    let queueMs = initialQueueMs
    let cooldownWaitMs = initialCooldownWaitMs
    let pacingWaitMs = 0
    let transportMs = 0
    let retryWaitMs = 0
    let bodyReadMs = 0
    let parseMs = 0
    let extractMs = 0
    let formatMs = 0
    const timings = (totalMs: number) => ({
      queueMs,
      robotsMs,
      cooldownWaitMs,
      retryWaitMs,
      requestMs: Math.max(0, transportMs - bodyReadMs),
      bodyReadMs,
      transportMs,
      parseMs,
      extractMs,
      formatMs,
      serializeMs: 0,
      modelMs: 0,
      totalMs,
    })
    const timedDenied = (failureReason: FetchResult['failureReason'], retryAt?: number): FetchResult => {
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      const denied = this.denied(url, start, trace, failureReason)
      return {
        ...denied,
        ...(retryAt === undefined ? {} : { retryAt }),
        usage: {
          ...denied.usage,
          wallMs: totalMs,
          timings: timings(totalMs),
        },
      }
    }
    const trace: TraceEvent[] = []
    const honest = recordHttpIdentity(this.prepared, trace, 0)
    if (!honest) {
      return this.denied(url, start, trace, 'identity_compromised')
    }
    if (this.localPreviewRobotsException) {
      trace.push({ at: Date.now() - start, lane: 'http', event: 'local_platform_robots_exception', detail: { host: new URL(url).hostname } })
    }

    if (this.prepared.identity.respectsRobots) {
      const robotsStart = performance.now()
      let cached: Awaited<ReturnType<RobotsOriginCache['lookup']>>
      try { cached = await this.robotsCache.lookup(url, this.prepared.identity.userAgent, execution) }
      catch (error) {
        robotsMs = performance.now() - robotsStart
        if (signal?.aborted) return timedDenied('timeout')
        throw error
      }
      const robotsDecision = this.robotsCache.decision(cached, url, this.prepared.identity.userAgent)
      trace.push({
        at: Date.now() - start,
        lane: 'http',
        event: 'robots_checked',
        detail: {
          decision: robotsDecision.decision,
          robotsUrl: robotsDecision.robotsUrl,
          matchedGroup: robotsDecision.matchedUserAgentGroup,
          ruleCount: robotsDecision.appliedRules.length,
          // The crawl frontier spaces this host's pages by it (LadderScrapeAtom reads it here).
          crawlDelayMs: robotsDecision.crawlDelayMs,
          ...(cached?.unreachable === undefined ? {} : { unreachable: cached.unreachable }),
        },
      })
      robotsMs = performance.now() - robotsStart
      if (robotsDecision.decision === 'disallowed') {
        trace.push({
          at: Date.now() - start,
          lane: 'http',
          event: 'robots_disallowed',
          detail: { url, appliedRules: robotsDecision.appliedRules },
        })
        return timedDenied('policy_denied')
      }
    }

    if (signal?.aborted) return timedDenied('timeout')
    const host = new URL(url).origin
    if (cooldownWaitMs > 0) trace.push({ at: Date.now() - start, lane: 'http', event: 'host_cooldown_wait', detail: { host, waitMs: cooldownWaitMs } })
    const transportStart = performance.now()
    const out = await resilientFetch(url, this.fetcherFor(url, validators, signal, ms => { bodyReadMs += ms }, (intervalMs, cooldownMs) => {
      queueMs += intervalMs
      cooldownWaitMs += cooldownMs
      pacingWaitMs += intervalMs + cooldownMs
    }, (target, proxy) => {
      trace.push({ at: Date.now() - start, lane: 'http', event: 'egress_proxy', detail: { url: target, proxy, source: 'environment' } })
    }), {
      signal,
      deadlineAt,
      onRetryAfter: (target, retryAt) => {
        for (const origin of new Set([host, new URL(target).origin])) {
          this.scheduler.cooldown(origin, retryAt)
        }
        onRetryAfter?.(target, retryAt)
      },
      maxRedirects: this.networkPolicy.maxRedirects,
      assertUrl: async (target) => {
        if (this.localPreviewRobotsException && !isLocalPreviewProxyTarget(target)) throw new Error('Local platform exception cannot follow an off-platform redirect')
        await assertSafeUrl(target, this.networkPolicy)
      },
    }).catch(error => {
      if (!signal?.aborted && (deadlineAt === undefined || Date.now() < deadlineAt)) throw error
      transportMs = Math.max(0, performance.now() - transportStart - pacingWaitMs)
      return null
    })
    if (out === null) return timedDenied('timeout', this.scheduler.retryAt(host))
    const transportTotalMs = performance.now() - transportStart
    retryWaitMs = out.trace
      .filter(event => event.event === 'retry')
      .reduce((sum, event) => sum + (typeof event.detail?.waitedMs === 'number' ? event.detail.waitedMs : typeof event.detail?.delayMs === 'number' ? event.detail.delayMs : 0), 0)
    transportMs = Math.max(0, transportTotalMs - retryWaitMs - pacingWaitMs)
    const wallMs = Date.now() - start
    let retryAt = out.retryAt
    if (out.status === 429 || out.status === 503) {
      const retryAfter = parseRetryAfterMs(out.headers?.get('retry-after') ?? null) ?? 250
      const next = out.retryAt ?? Date.now() + Math.max(retryAfter, 250)
      retryAt = next
      this.scheduler.cooldown(host, next)
      trace.push({ at: wallMs, lane: 'http', event: 'host_cooldown_set', detail: { host, status: out.status, cooldownMs: next - Date.now() } })
    }
    for (const t of out.trace) {
      trace.push({
        at: t.at,
        lane: 'http',
        event: t.event,
        ...(t.detail !== undefined ? { detail: t.detail } : {}),
      })
    }

    // Redirect evidence only when a redirect actually happened; a chain of
    // just the requested URL is "no redirect" and matches the other arms.
    const redirectChain = out.redirectChain.length > 1 ? out.redirectChain : []
    const bodyReadBeforeFinal = bodyReadMs
    let body: string
    try { body = await out.bodyText() }
    catch (error) {
      if (signal?.aborted) return timedDenied('timeout', out.retryAt)
      if (error instanceof BodyTooLargeError) return timedDenied('body_too_large')
      throw error
    }
    transportMs += Math.max(0, bodyReadMs - bodyReadBeforeFinal)
    const rawBodySha256 = sha256Utf8(body)
    const rawArtifacts = await captureRawHtml(body, rawBodySha256)

    const base = {
      requestedUrl: url,
      ...(retryAt === undefined ? {} : { retryAt }),
      truncated: false,
      truncatedAt: null,
      compliance: null,
      evidence: {
        finalUrl: out.finalUrl,
        httpStatus: out.status,
        redirectChain,
        contentType: out.headers?.get('content-type') ?? null,
        rawBodySha256,
        artifacts: rawArtifacts,
        etag: out.headers?.get('etag') ?? null,
        lastModified: out.headers?.get('last-modified') ?? null,
        cacheControl: out.headers?.get('cache-control') ?? null,
        vary: out.headers?.get('vary') ?? null,
        setsCookie: out.headers?.get('set-cookie') != null,
        ...(this.networkPolicy.egressProxy ? { envProxy: this.envProxyFor(out.finalUrl) } : {}),
      },
      usage: {
        wallMs,
        bytesWire: Buffer.byteLength(body),
        bytesDecompressed: Buffer.byteLength(body),
        requestCount: out.requestCount,
        attemptCount: out.attemptCount,
        contentTokens: null as number | null,
        browserMs: 0,
        externalCostUsd: null,
      },
      trace,
    }
    const finish = <T extends FetchResult>(result: T): T => {
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      return {
        ...result,
        usage: {
          ...result.usage,
          wallMs: totalMs,
          timings: timings(totalMs),
        },
      }
    }

    // Transport-level failure (timeout, connection error, redirect loop/limit,
    // non-http(s) redirect target).
    if (out.kind === 'failure') {
      return finish({
        ...base,
        status: 'failed',
        failureReason: out.failureReason,
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [],
        markdown: null,
      })
    }

    // Gate classification on the raw body. Non-contentful paths use the full
    // classifier. A 200 that extracted a main body still consults decisive
    // challenge evidence (vendor header / CF plumbing / interstitial pair).
    const gate = classifyGate({
      status: out.status,
      header: (name) => out.headers?.get(name) ?? null,
      body,
    })
    // An error status is never content, but its page is what the server
    // said: the failed or blocked result keeps it as evidence.
    const errorPage = errorPageEvidence(out.status, base.evidence.contentType, body, out.finalUrl, options)
    const errorPageFields = { markdown: errorPage?.markdown ?? null, ...(errorPage === null ? {} : { links: errorPage.links }) }
    const blocked = (verdict: NonNullable<typeof gate>): FetchResult => {
      const next = escalationForBlock(verdict.reason, 'http')
      trace.push({
        at: wallMs,
        lane: 'http',
        event: 'gate_detected',
        detail: { blockReason: verdict.reason, signals: verdict.signals, status: out.status },
      })
      return finish({
        ...base,
        status: 'blocked',
        failureReason: null,
        blockReason: verdict.reason,
        budgetExceeded: null,
        lane: 'http',
        escalations: next === null ? [] : [{ ...next, improved: null }],
        ...errorPageFields,
      })
    }

    // A gate that answers with a non-200 is a block, not a transient failure.
    // Note the retry policy never retries 429 — the job here is to not hammer.
    if (out.status !== 200 && gate !== null) {
      return blocked(gate)
    }

    if (!isSuccessStatus(out.status)) {
      return finish({
        ...base,
        status: 'failed',
        failureReason: 'http_error',
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [],
        ...errorPageFields,
      })
    }

    // A 204 or 205 says there is no content: proven emptiness, not a failure.
    if (isNoContentStatus(out.status)) {
      return finish({
        ...base,
        status: 'empty_verified',
        failureReason: null,
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [],
        markdown: null,
      })
    }

    // Same extraction convention as ExtractTfSubject: escalate means the
    // extractor found no main content — report failed/empty_unverified and
    // flag the browser lane, never a contentful success.
    const extractStart = performance.now()
    const extracted = extractTf.extract(body, { url: out.finalUrl })
    const extractionTotalMs = performance.now() - extractStart
    parseMs = extracted.timings.parseMs
    extractMs = Math.max(extracted.timings.extractMs, extractionTotalMs - parseMs)
    const links = collectLinks(body, out.finalUrl)
    trace.push({
      at: wallMs,
      lane: 'http',
      event: 'extract',
      detail: {
        pageType: extracted.pageType,
        strategy: extracted.strategy,
        confidence: extracted.confidence,
        escalate: extracted.escalate,
        linkCount: links.length,
        ...(options.onlyMainContent === false ? { onlyMainContent: false } : {}),
      },
    })

    if (extracted.escalate) {
      if (gate !== null) return blocked(gate)
      return finish({
        ...base,
        status: 'failed',
        failureReason: 'empty_unverified',
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [
          { from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null },
        ],
        markdown: null,
      })
    }

    const decisive = classifyGate({
      status: out.status,
      header: (name) => out.headers?.get(name) ?? null,
      body,
      contentful: true,
    })
    if (decisive !== null) return blocked(decisive)

    const formatStart = performance.now()
    const mainMarkdown = htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl })
    // onlyMainContent: false emits the whole page (header, navigation and
    // footer kept) through the same converter and base URL. The quality
    // signal below still reads the main content, so the mode never changes
    // which lane answers.
    const markdown = options.onlyMainContent === false ? htmlToMarkdown(body, { baseUrl: out.finalUrl }) : mainMarkdown
    formatMs = performance.now() - formatStart
    const contentTokens = estimateTokens(markdown)
    const mainTokens = markdown === mainMarkdown ? contentTokens : estimateTokens(mainMarkdown)

    // Quality signal: a success whose content is thin AND low-confidence is
    // a success worth offering to a higher lane. So is a page whose tables
    // are empty shells: their rows arrive by script, so this HTML cannot hold
    // the data however confident the extraction looks. The status stays
    // success — this is not a rewritten verdict — but the ladder reads this
    // event as "the HTTP answer is below the quality bar, try the browser".
    const emptyTableShells = extracted.emptyTableShells ?? 0
    if (
      (mainTokens <= QUALITY_ESCALATION_MAX_TOKENS &&
        extracted.confidence <= QUALITY_ESCALATION_MAX_CONFIDENCE) ||
      emptyTableShells > 0
    ) {
      trace.push({
        at: wallMs,
        lane: 'http',
        event: 'quality_low_yield',
        detail: {
          contentTokens: mainTokens,
          confidence: extracted.confidence,
          pageType: extracted.pageType,
          strategy: extracted.strategy,
          emptyTableShells,
        },
      })
    }

    return finish({
      ...base,
      status: 'success',
      failureReason: null,
      blockReason: null,
      budgetExceeded: null,
      lane: 'http',
      escalations: [],
      markdown,
      links,
      document: {
        title: extracted.title,
        pageType: extracted.pageType,
        strategy: extracted.strategy,
        confidence: extracted.confidence,
        product: extracted.product ?? null,
        adapter: extracted.adapter,
        entities: extracted.entities,
        adapterValidation: extracted.adapterValidation,
      },
      usage: { ...base.usage, contentTokens },
    })
  }

  private denied(url: string, start: number, trace: TraceEvent[], failureReason: FetchResult['failureReason']): FetchResult {
    const wallMs = Date.now() - start
    return {
      requestedUrl: url,
      status: 'failed',
      failureReason,
      blockReason: null,
      budgetExceeded: null,
      lane: 'http',
      escalations: [],
      markdown: null,
      truncated: false,
      truncatedAt: null,
      compliance: null,
      evidence: {
        finalUrl: url,
        httpStatus: null,
        redirectChain: [],
        contentType: null,
        rawBodySha256: null,
        artifacts: [],
      },
      usage: {
        wallMs,
        bytesWire: 0,
        bytesDecompressed: 0,
        requestCount: 0,
        attemptCount: 0,
        contentTokens: null,
        browserMs: 0,
        externalCostUsd: null,
      },
      trace,
    }
  }

  async teardown(): Promise<void> {
    this.teardownPromise ??= Promise.all([this.egress.close(), this.localPreviewProxy?.close()]).then(() => {})
    await this.teardownPromise
  }
}

/**
 * Undici reports a proxy that refuses the CONNECT tunnel as an AbortError,
 * which would read as our own timeout. It is a connection failure.
 */
function proxyRefusal(error: unknown): Error | null {
  if (!(error instanceof Error) || (error as { code?: unknown }).code !== 'UND_ERR_ABORTED' || !error.message.startsWith('Proxy response (')) return null
  const refusal = new Error(error.message, { cause: error })
  refusal.name = 'ProxyConnectError'
  return refusal
}
