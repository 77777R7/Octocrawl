import {
  estimateTokens,
  QUALITY_ESCALATION_MAX_CONFIDENCE,
  QUALITY_ESCALATION_MAX_TOKENS,
  type CrawlMode,
  type ExecutionContext,
  type FetchResult,
  type FetchWarning,
  type FileEvidence,
  type NetworkPolicy,
  type PageOptions,
  type TraceEvent,
} from '@w2l/contracts'
import { collectLinks, extractPdfText, extractTf, htmlToMarkdown, pdfMarkdown, PdfParseError } from '@w2l/extract-tf'
import { resilientFetch, createExecutionScope, throwIfExecutionStopped, classifyGate, escalationForBlock, parseRetryAfterMs, sha256Hex, sha256Utf8, type ResilientFetcher } from '@w2l/http-core'
import { Agent, ProxyAgent, request, type Dispatcher } from 'undici'
import { assertSafeUrl, BodyTooLargeError, createGuardedDispatcher, defaultNetworkPolicy, isLocalPreviewProxyTarget, MAX_RESPONSE_HEADER_BYTES, readCappedBody, validateLocalPreviewProxy } from '../egress.js'
import { describeProxy, proxyAgentFor, proxyBypasses, type OperatorProxy } from '../egressProxy.js'
import { decodeText, filenameOf, responseShape, saveFileBytes, sniffShape, type ResponseShape } from '../files.js'
import { prepareHttpIdentity, recordHttpIdentity } from '../httpIdentity.js'
import { RobotsOriginCache, robotsOverrideWarning } from '../robotsLookup.js'
import type { SubjectAdapter } from '../subject.js'
import { OriginScheduler, type OriginPermit } from './originScheduler.js'
import { captureRawHtml } from '../rawArtifact.js'
import { extractionVerdict } from './extractionVerdict.js'
import { documentOf, errorPageContent } from './pageContent.js'

/**
 * Resilient HTTP subject: the resilient transport engine (redirect following
 * + 503 retry, http-core) composed with the extract-tf cascade. This is the
 * production-shaped arm — BareHttpSubject stays the untouched floor.
 *
   * Transport semantics come from resilientFetch; extraction and markdown
   * (htmlToMarkdown after extract-tf) are identical to ExtractTfSubject, so
   * any score delta against that arm is attributable to transport alone.
 */
/** How much of a CSV or JSON file is returned inline as markdown; the file itself is kept whole. */
const MAX_INLINE_TEXT_CHARS = 1024 * 1024

export class ResilientHttpSubject implements SubjectAdapter {
  readonly meta = {
    id: 'resilient-http',
    displayName: 'Resilient HTTP (redirect+retry × extract-tf)',
    version: '0.1.0',
    hosting: 'self_hosted' as const,
  }

  private readonly prepared: ReturnType<typeof prepareHttpIdentity>
  private readonly fetcherFor: (initialUrl: string, validators: { etag?: string; lastModified?: string }, signal?: AbortSignal, onBodyRead?: (ms: number) => void, onRequestWait?: (intervalMs: number, cooldownMs: number) => void) => ResilientFetcher
  private readonly robotsCache: RobotsOriginCache
  private readonly networkPolicy: NetworkPolicy
  private readonly scheduler: OriginScheduler
  private readonly dispatcher: Agent
  private readonly localPreviewProxy: ProxyAgent | null
  private readonly localPreviewRobotsException: boolean
  /** The operator's own egress proxy (local entry points only); see egressProxy.ts. */
  private readonly operatorProxy: OperatorProxy | null
  private readonly operatorProxyAgent: ProxyAgent | null
  private teardownPromise: Promise<void> | null = null

  constructor(mode: CrawlMode = 'standard', networkPolicy?: NetworkPolicy, scheduler?: OriginScheduler, robotsFailClosed = false, localPreviewProxyUrl?: string, localPreviewRobotsException = false, operatorProxy: OperatorProxy | null = null) {
    this.prepared = prepareHttpIdentity(mode)
    if (localPreviewRobotsException && !localPreviewProxyUrl) throw new Error('Local platform exception requires a loopback proxy')
    this.localPreviewRobotsException = localPreviewRobotsException
    if (localPreviewRobotsException) this.prepared.identity.respectsRobots = false
    this.networkPolicy = networkPolicy ?? defaultNetworkPolicy()
    this.scheduler = scheduler ?? new OriginScheduler(this.networkPolicy)
    this.dispatcher = createGuardedDispatcher(this.networkPolicy)
    this.localPreviewProxy = localPreviewProxyUrl ? new ProxyAgent({ uri: validateLocalPreviewProxy(localPreviewProxyUrl), maxHeaderSize: MAX_RESPONSE_HEADER_BYTES }) : null
    this.operatorProxy = operatorProxy
    this.operatorProxyAgent = operatorProxy === null ? null : proxyAgentFor(operatorProxy)
    this.robotsCache = new RobotsOriginCache(this.networkPolicy, url => this.dispatcherFor(url), robotsFailClosed, { assertUrl: url => this.assertUrl(url) })
    const headers = this.prepared.headers
    const maxBodyBytes = this.networkPolicy.maxBodyBytes
    this.fetcherFor = (initialUrl, validators, signal, onBodyRead, onRequestWait) => async (url, init) => {
      await this.scheduler.beforeRequest(new URL(url).origin, init.signal ?? signal, onRequestWait)
      const response = await request(url, {
        dispatcher: this.dispatcherFor(url),
        method: 'GET',
        headersTimeout: init.headersTimeoutMs,
        bodyTimeout: init.bodyTimeoutMs,
        // Validators are bound to one representation; never forward on redirects.
        headers: { ...headers, ...(url === initialUrl ? validators.etag ? { 'if-none-match': validators.etag } : validators.lastModified ? { 'if-modified-since': validators.lastModified } : {} : {}) },
        signal: init.signal ?? signal,
      })
      const responseHeaders = response.headers
      let bytes: Uint8Array | undefined
      let body: string | undefined
      const readBytes = async (maxBytes: number): Promise<Uint8Array> => {
        if (bytes !== undefined) return bytes
        const bodyStart = performance.now()
        bytes = await readCappedBody(response.body, maxBytes)
        onBodyRead?.(Math.max(0, performance.now() - bodyStart))
        return bytes
      }
      return {
        status: response.statusCode,
        headers: {
          get: (name: string) => {
            const v = responseHeaders[name.toLowerCase()]
            return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null
          },
        },
        bodyText: async () => {
          body ??= new TextDecoder().decode(await readBytes(maxBodyBytes))
          return body
        },
        bodyBytes: (maxBytes = maxBodyBytes) => readBytes(maxBytes),
        discardBody: () => {
          if (bytes !== undefined) return
          // Destroying an unread undici body raises an abort on the stream; nobody is reading it.
          response.body.once('error', () => {})
          response.body.destroy()
        },
      }
    }
  }

  private dispatcherFor(url: string): Dispatcher {
    if (this.localPreviewProxy !== null && isLocalPreviewProxyTarget(url)) return this.localPreviewProxy
    if (this.operatorProxyAgent !== null && this.viaOperatorProxy(url)) return this.operatorProxyAgent
    return this.dispatcher
  }

  /** Whether this URL leaves through the operator's proxy rather than direct, pinned egress. */
  private viaOperatorProxy(url: string): boolean {
    return this.operatorProxy !== null && !(this.localPreviewProxy !== null && isLocalPreviewProxyTarget(url)) && !proxyBypasses(this.operatorProxy, url)
  }

  private assertUrl(url: string): Promise<void> {
    return assertSafeUrl(url, this.networkPolicy, { viaProxy: this.viaOperatorProxy(url) })
  }

  async fetch(url: string, deadlineMs?: number, signal?: AbortSignal, validators: { etag?: string; lastModified?: string } = {}, onRetryAfter?: ExecutionContext['onRetryAfter'], page: PageOptions = {}): Promise<FetchResult> {
    if (this.localPreviewRobotsException && !isLocalPreviewProxyTarget(url)) throw new Error('Local platform exception is limited to fixed platform hosts')
    const scope = createExecutionScope({ signal, deadlineAt: deadlineMs, onRetryAfter })
    const start = Date.now()
    const monotonicStart = performance.now()
    const origin = new URL(url).origin
    let permit: OriginPermit | undefined
    try {
      permit = await this.scheduler.acquire(origin, scope.signal)
      throwIfExecutionStopped(scope)
      const result = await this.fetchWithinBudget(url, scope, validators, monotonicStart, permit.queueMs, permit.cooldownWaitMs, page)
      return scope.signal.reason?.name === 'TimeoutError' || deadlineMs !== undefined && Date.now() >= deadlineMs
        ? { ...result, budgetExceeded: 'time' }
        : result
    } catch (error) {
      if (!scope.signal.aborted && (deadlineMs === undefined || Date.now() < deadlineMs)) throw error
      const result = this.denied(url, start, [], 'timeout')
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      const retryAt = this.scheduler.retryAt(origin)
      const timed = { ...result, ...(retryAt === undefined ? {} : { retryAt }), usage: { ...result.usage, wallMs: totalMs, timings: { queueMs: permit?.queueMs ?? (retryAt === undefined ? totalMs : 0), robotsMs: 0, cooldownWaitMs: permit?.cooldownWaitMs ?? (retryAt === undefined ? 0 : totalMs), retryWaitMs: 0, requestMs: 0, bodyReadMs: 0, transportMs: 0, parseMs: 0, extractMs: 0, formatMs: 0, serializeMs: 0, modelMs: 0, totalMs } } }
      return scope.signal.reason?.name === 'TimeoutError' || deadlineMs !== undefined && Date.now() >= deadlineMs ? { ...timed, budgetExceeded: 'time' } : timed
    } finally {
      scope.dispose()
      permit?.release()
    }
  }

  private async fetchWithinBudget(url: string, execution: ExecutionContext, validators: { etag?: string; lastModified?: string }, monotonicStart: number, initialQueueMs: number, initialCooldownWaitMs: number, page: PageOptions = {}): Promise<FetchResult> {
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
    // Set when a robots disallow was set aside by the caller's recorded
    // decision; every result of this fetch then carries the warning.
    let overrideWarning: FetchWarning | null = null
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
          crawlDelayMs: robotsDecision.crawlDelayMs,
          ...(cached?.failure ? { unreachable: cached.failure.reason } : {}),
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
        if (page.robotsOverride === undefined) return timedDenied('policy_denied')
        // The caller's recorded decision sets the rule aside for this one
        // URL. The verdict stays in the trace above; this says who set it
        // aside and why, and the result's warnings repeat it.
        const override = page.robotsOverride
        trace.push({
          at: Date.now() - start,
          lane: 'http',
          event: 'robots_overridden',
          detail: { url, appliedRules: robotsDecision.appliedRules, reason: override.reason, ...(override.recordedBy === undefined ? {} : { recordedBy: override.recordedBy }) },
        })
        overrideWarning = robotsOverrideWarning(robotsDecision, override)
      }
    }

    if (signal?.aborted) return timedDenied('timeout')
    const host = new URL(url).origin
    if (cooldownWaitMs > 0) trace.push({ at: Date.now() - start, lane: 'http', event: 'host_cooldown_wait', detail: { host, waitMs: cooldownWaitMs } })
    if (this.operatorProxy !== null && this.viaOperatorProxy(url)) {
      trace.push({ at: Date.now() - start, lane: 'http', event: 'proxy_used', detail: describeProxy(this.operatorProxy) })
    }
    const transportStart = performance.now()
    const out = await resilientFetch(url, this.fetcherFor(url, validators, signal, ms => { bodyReadMs += ms }, (intervalMs, cooldownMs) => {
      queueMs += intervalMs
      cooldownWaitMs += cooldownMs
      pacingWaitMs += intervalMs + cooldownMs
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
        await this.assertUrl(target)
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
    const contentType = out.headers?.get('content-type') ?? null
    // What the answer is decides how its body is read: a page as text, a
    // file as the bytes it is. An error answer is read as a page whatever
    // its type, so the refusal can be shown.
    const served = out.kind === 'ok' && out.status !== null && out.status >= 200 && out.status < 300
    let shape: ResponseShape = served ? responseShape(contentType, out.finalUrl, out.headers?.get('content-disposition') ?? null) : { kind: 'page' }
    let body = ''
    let fileBytes: Uint8Array | null = null
    if (shape.kind === 'unsupported') {
      out.discardBody()
      trace.push({ at: Date.now() - start, lane: 'http', event: 'unsupported_content_type', detail: { contentType } })
    } else if (shape.kind === 'page') {
      try { body = await out.bodyText() }
      catch (error) {
        if (signal?.aborted) return timedDenied('timeout', out.retryAt)
        if (error instanceof BodyTooLargeError) return timedDenied('body_too_large')
        throw error
      }
    } else {
      const declaredLength = Number(out.headers?.get('content-length') ?? Number.NaN)
      if (Number.isFinite(declaredLength) && declaredLength > this.networkPolicy.maxFileBytes) {
        out.discardBody()
        trace.push({ at: Date.now() - start, lane: 'http', event: 'file_too_large', detail: { declaredLength, maxFileBytes: this.networkPolicy.maxFileBytes } })
        return timedDenied('body_too_large')
      }
      try { fileBytes = await out.bodyBytes(this.networkPolicy.maxFileBytes) }
      catch (error) {
        if (signal?.aborted) return timedDenied('timeout', out.retryAt)
        if (error instanceof BodyTooLargeError) {
          trace.push({ at: Date.now() - start, lane: 'http', event: 'file_too_large', detail: { maxFileBytes: this.networkPolicy.maxFileBytes } })
          return timedDenied('body_too_large')
        }
        throw error
      }
      if (shape.kind === 'sniff') {
        const sniffed = sniffShape(fileBytes, shape.hint)
        trace.push({ at: Date.now() - start, lane: 'http', event: 'content_sniffed', detail: { contentType, shape: sniffed.kind === 'file' ? sniffed.file : sniffed.kind } })
        shape = sniffed
        if (sniffed.kind === 'page') { body = decodeText(fileBytes); fileBytes = null }
      }
    }
    transportMs += Math.max(0, bodyReadMs - bodyReadBeforeFinal)
    const rawBodySha256 = fileBytes !== null ? sha256Hex(fileBytes) : shape.kind === 'unsupported' ? null : sha256Utf8(body)
    const rawArtifacts = fileBytes !== null && shape.kind === 'file'
      ? await saveFileBytes(fileBytes, rawBodySha256!, shape.file).then((path) => path === null ? [] : [path])
      : shape.kind === 'unsupported' ? [] : await captureRawHtml(body, rawBodySha256!)

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
        contentType,
        rawBodySha256,
        artifacts: rawArtifacts,
        etag: out.headers?.get('etag') ?? null,
        lastModified: out.headers?.get('last-modified') ?? null,
        cacheControl: out.headers?.get('cache-control') ?? null,
        vary: out.headers?.get('vary') ?? null,
        setsCookie: out.headers?.get('set-cookie') != null,
      },
      usage: {
        wallMs,
        // An unread body has no measured wire size; nothing of it was decoded.
        bytesWire: shape.kind === 'unsupported' ? null : fileBytes?.byteLength ?? Buffer.byteLength(body),
        bytesDecompressed: fileBytes?.byteLength ?? Buffer.byteLength(body),
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
        ...(overrideWarning === null ? {} : { warnings: [overrideWarning, ...(result.warnings ?? [])] }),
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

    if (shape.kind === 'unsupported') {
      return finish({
        ...base,
        status: 'failed',
        failureReason: 'unsupported_content_type',
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [],
        markdown: null,
      })
    }

    if (shape.kind === 'file' && fileBytes !== null) {
      return finish(await this.fileResult(base, shape.file, fileBytes, out.headers?.get('content-disposition') ?? null, trace, start))
    }

    // Gate classification on the raw body. Non-contentful paths use the full
    // classifier. A 200 that extracted a main body still consults decisive
    // challenge evidence (vendor header / CF plumbing / interstitial pair).
    const gate = classifyGate({
      status: out.status,
      header: (name) => out.headers?.get(name) ?? null,
      body,
    })
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
        markdown: null,
      })
    }

    // A gate that answers with a non-200 is a block, not a transient failure.
    // Note the retry policy never retries 429 — the job here is to not hammer.
    if (out.status !== 200 && gate !== null) {
      return blocked(gate)
    }

    if (out.status === null || out.status < 200 || out.status >= 300) {
      // An error page is still evidence: keep what the server said beside
      // the status, so a consumer sees the page and not only the refusal.
      const errorPage = errorPageContent(body, out.finalUrl, page)
      return finish({
        ...base,
        status: 'failed',
        failureReason: 'http_error',
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [],
        markdown: errorPage?.markdown ?? null,
        ...(errorPage === null ? {} : {
          warnings: [{ code: 'http_error', message: `The server answered ${out.status}; the content is that response, not the requested page.` }],
          links: errorPage.links,
          document: errorPage.document,
        }),
      })
    }

    // Same extraction convention as ExtractTfSubject: escalate means the
    // extractor found no main content — report failed/empty_unverified and
    // flag the browser lane, never a contentful success.
    const extractStart = performance.now()
    const extracted = extractTf.extract(body, { url: out.finalUrl, onlyMainContent: page.onlyMainContent ?? true })
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

    // A recovered region is not a confident main-content read, so the full
    // gate (weak markers included) applies to it; confident content only
    // consults decisive challenge evidence.
    if (extracted.recovery && gate !== null) return blocked(gate)
    const decisive = classifyGate({
      status: out.status,
      header: (name) => out.headers?.get(name) ?? null,
      body,
      contentful: true,
    })
    if (decisive !== null) return blocked(decisive)

    const verdict = extractionVerdict(extracted, 'http', wallMs, { rendered: false })
    trace.push(...verdict.events)

    const formatStart = performance.now()
    const markdown = htmlToMarkdown(extracted.mainHtml, { baseUrl: out.finalUrl })
    formatMs = performance.now() - formatStart
    const contentTokens = estimateTokens(markdown)

    // Quality signal: a success whose content is thin AND low-confidence is
    // a success worth offering to a higher lane. The status stays success —
    // this is not a rewritten verdict — but the ladder reads this event as
    // "the HTTP answer is below the quality bar, try the browser".
    if (
      contentTokens <= QUALITY_ESCALATION_MAX_TOKENS &&
      extracted.confidence <= QUALITY_ESCALATION_MAX_CONFIDENCE
    ) {
      trace.push({
        at: wallMs,
        lane: 'http',
        event: 'quality_low_yield',
        detail: {
          contentTokens,
          confidence: extracted.confidence,
          pageType: extracted.pageType,
          strategy: extracted.strategy,
        },
      })
    }

    return finish({
      ...base,
      status: verdict.status,
      failureReason: null,
      blockReason: null,
      budgetExceeded: null,
      lane: 'http',
      escalations: [],
      markdown,
      ...(verdict.warnings.length > 0 ? { warnings: verdict.warnings } : {}),
      links,
      document: documentOf(extracted),
      usage: { ...base.usage, contentTokens },
    })
  }

  /**
   * A file kept as received. Its text, when the file has one, is the
   * markdown: a PDF's text layer page by page, a CSV or JSON as itself. A
   * PDF without a text layer is `ocr_required`, never an empty success.
   */
  private async fileResult(
    base: Omit<FetchResult, 'status' | 'failureReason' | 'blockReason' | 'budgetExceeded' | 'lane' | 'escalations' | 'markdown'>,
    kind: FileEvidence['kind'],
    bytes: Uint8Array,
    contentDisposition: string | null,
    trace: TraceEvent[],
    start: number,
  ): Promise<FetchResult> {
    const file: FileEvidence = {
      kind,
      contentType: base.evidence.contentType,
      bytes: bytes.byteLength,
      sha256: base.evidence.rawBodySha256!,
      path: base.evidence.artifacts[0] ?? null,
      filename: filenameOf(contentDisposition, base.evidence.finalUrl),
    }
    trace.push({ at: Date.now() - start, lane: 'http', event: 'file_received', detail: { kind, bytes: file.bytes, sha256: file.sha256, path: file.path, filename: file.filename } })
    let status: FetchResult['status'] = 'success'
    let failureReason: FetchResult['failureReason'] = null
    let markdown: string | null = null
    let truncated = false
    let truncatedAt: number | null = null
    const warnings: FetchWarning[] = []
    if (kind === 'pdf') {
      try {
        const text = await extractPdfText(bytes)
        file.pdf = { pages: text.pages, textPages: text.textPages, textChars: text.textChars }
        if (text.textPages === 0) {
          status = 'failed'
          failureReason = 'ocr_required'
          trace.push({ at: Date.now() - start, lane: 'http', event: 'pdf_no_text_layer', detail: { pages: text.pages } })
        } else {
          markdown = pdfMarkdown(text)
          if (text.textPages < text.pages) {
            warnings.push({ code: 'pdf_pages_without_text', message: `${text.pages - text.textPages} of ${text.pages} pages carry no text layer; their content would need OCR.` })
          }
        }
      } catch (error) {
        if (!(error instanceof PdfParseError)) throw error
        status = 'failed'
        failureReason = 'parse_error'
        trace.push({ at: Date.now() - start, lane: 'http', event: 'pdf_unreadable', detail: { code: error.code, error: error.message } })
      }
    } else if (kind === 'csv' || kind === 'json') {
      const text = decodeText(bytes)
      const shown = text.length > MAX_INLINE_TEXT_CHARS ? text.slice(0, MAX_INLINE_TEXT_CHARS) : text
      truncated = text.length > MAX_INLINE_TEXT_CHARS
      truncatedAt = truncated ? MAX_INLINE_TEXT_CHARS : null
      markdown = `\`\`\`${kind}\n${shown}${shown.endsWith('\n') ? '' : '\n'}\`\`\``
    }
    return {
      ...base,
      status,
      failureReason,
      blockReason: null,
      budgetExceeded: null,
      lane: 'http',
      escalations: [],
      markdown,
      ...(warnings.length > 0 ? { warnings } : {}),
      links: [],
      file,
      truncated,
      truncatedAt,
      usage: { ...base.usage, contentTokens: markdown === null ? null : estimateTokens(markdown) },
    }
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
    this.teardownPromise ??= Promise.all([this.dispatcher.close(), this.localPreviewProxy?.close(), this.operatorProxyAgent?.close()]).then(() => {})
    await this.teardownPromise
  }
}
