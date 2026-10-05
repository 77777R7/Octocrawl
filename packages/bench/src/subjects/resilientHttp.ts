import {
  estimateTokens,
  fileByteCap,
  QUALITY_ESCALATION_MAX_CONFIDENCE,
  QUALITY_ESCALATION_MAX_TOKENS,
  type CrawlMode,
  type ExecutionContext,
  type FetchOptions,
  type FetchResult,
  type FetchWarning,
  type FileDescription,
  type NetworkPolicy,
  type TraceEvent,
} from '@w2l/contracts'
import { classifyContentType, collectLinks, detectFile, extractTf, htmlToMarkdown, responseFileName } from '@w2l/extract-tf'
import { resilientFetch, createExecutionScope, raceWithSignal, throwIfExecutionStopped, classifyGate, escalationForBlock, parseRetryAfterMs, sha256Utf8, type ResilientFetcher } from '@w2l/http-core'
import { ProxyAgent, request, type Dispatcher } from 'undici'
import { ContentDecodingError, contentEncodingLabel, decodeContentEncoding, DecompressedTooLargeError, UnsupportedContentEncodingError } from '../contentEncoding.js'
import { BodyTooLargeError, defaultNetworkPolicy, DnsLookupError, EgressRoutes, isLocalPreviewProxyTarget, readCappedBody, SsrfDeniedError, validateLocalPreviewProxy } from '../egress.js'
import { EgressRoute } from '../egressRoute.js'
import { prepareHttpIdentity, recordHttpIdentity } from '../httpIdentity.js'
import { COMPAT_LIBRARY, prepareCompatIdentity, type CompatTransport } from '../compatTransport.js'
import { applicableOverride, overriddenDetail, RobotsOriginCache, robotsOverrideApplied, robotsOverrideWarning } from '../robotsLookup.js'
import { tlsUnverifiedWarning } from '../tlsWarning.js'
import type { SubjectAdapter } from '../subject.js'
import { OriginScheduler, type OriginPermit } from './originScheduler.js'
import { errorPageEvidence, extraFormats, htmlFormats, isNoContentStatus, isSuccessStatus, listRecordsFound, withListCaveat, markdownOptions, selectionAsked, tablesFormat, tagOptions, wholePageAsked, wholePageMarkdown } from './errorPage.js'
import { captureRawHtml } from '../rawArtifact.js'
import type { FileStore } from '../fileStore.js'
import { declaredLength, fileTooLarge, readFileResponse } from './fileResult.js'

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
  /**
   * One wire request. `headers` are the identity's own, sent on every hop;
   * `wire.headers` are the caller's custom headers, sent only to
   * `initialUrl`'s origin (a cross-origin hop gets the identity alone and
   * `wire.onWithheld` says so); `routes` are the request's own routes when it
   * relaxed certificate verification, else the subject's.
   */
  private readonly fetcherFor: (initialUrl: string, headers: Readonly<Record<string, string>>, validators: { etag?: string; lastModified?: string }, signal?: AbortSignal, onBodyRead?: (ms: number) => void, onRequestWait?: (intervalMs: number, cooldownMs: number) => void, onEnvProxy?: (url: string, proxy: string) => void, maxFileBytes?: number, wire?: { headers: Readonly<Record<string, string>>; onWithheld: (to: string, names: readonly string[]) => void }, routes?: EgressRoutes | null, onResponseCoding?: (decodedFrom: string | null) => void, deadlineAt?: number) => ResilientFetcher
  private readonly robotsCache: RobotsOriginCache
  private readonly networkPolicy: NetworkPolicy
  private readonly scheduler: OriginScheduler
  private readonly egress: EgressRoutes
  private readonly route: EgressRoute
  private readonly localPreviewProxy: ProxyAgent | null
  private readonly localPreviewRobotsException: boolean
  private teardownPromise: Promise<void> | null = null

  /**
   * `fileStore`: where files (PDF, CSV, ...) are saved as received; without one a file is read but not saved.
   * `previewProductToken`: the hosted public preview's standard User-Agent carries PREVIEW_PRODUCT_TOKEN (previewIdentity).
   * `robotsCache`: a robots.txt cache shared with the crawl's sitemap reader, so one robots.txt read serves both; without one the subject keeps its own.
   * `compat`: the browser-compatible transport (compatTransport.ts) in place of undici, with its profile's identity; standard mode on a local server only.
   */
  constructor(mode: CrawlMode = 'standard', networkPolicy?: NetworkPolicy, scheduler?: OriginScheduler, localPreviewProxyUrl?: string, localPreviewRobotsException = false, private readonly fileStore: FileStore | null = null, private readonly previewProductToken = false, robotsCache?: RobotsOriginCache, private readonly compat: CompatTransport | null = null) {
    this.networkPolicy = networkPolicy ?? defaultNetworkPolicy()
    if (compat !== null && (mode !== 'standard' || previewProductToken || localPreviewProxyUrl !== undefined)) throw new Error(`the compatible transport sends its profile's standard identity: not for ${mode !== 'standard' ? `mode ${mode}` : 'the hosted preview'}`)
    this.prepared = compat !== null ? prepareCompatIdentity(compat.profile) : prepareHttpIdentity(mode, this.networkPolicy.contact ?? null, null, 'desktop', undefined, previewProductToken)
    if (localPreviewRobotsException && !localPreviewProxyUrl) throw new Error('Local platform exception requires a loopback proxy')
    this.localPreviewRobotsException = localPreviewRobotsException
    if (localPreviewRobotsException) this.prepared.identity.respectsRobots = false
    this.scheduler = scheduler ?? new OriginScheduler(this.networkPolicy)
    this.egress = new EgressRoutes(this.networkPolicy)
    this.localPreviewProxy = localPreviewProxyUrl ? new ProxyAgent(validateLocalPreviewProxy(localPreviewProxyUrl)) : null
    this.route = new EgressRoute(this.networkPolicy, this.egress, this.localPreviewProxy)
    this.robotsCache = robotsCache ?? new RobotsOriginCache(this.networkPolicy, url => this.dispatcherFor(url))
    const maxBodyBytes = this.networkPolicy.maxBodyBytes
    this.fetcherFor = (initialUrl, headers, validators, signal, onBodyRead, onRequestWait, onEnvProxy, maxFileBytes = fileByteCap(this.networkPolicy), wire, routes = null, onResponseCoding, deadlineAt) => async (url, init) => {
      await this.scheduler.beforeRequest(new URL(url).origin, init.signal ?? signal, onRequestWait)
      const envProxy = this.envProxyFor(url)
      if (envProxy !== null) onEnvProxy?.(url, envProxy)
      if (this.compat !== null) {
        // impit sends the profile's headers itself (`headers` are those); only the validators go beside them.
        onResponseCoding?.(null)
        return this.compat.fetch(url, {
          signal: init.signal ?? signal,
          headersTimeoutMs: init.headersTimeoutMs,
          bodyTimeoutMs: init.bodyTimeoutMs,
          capFor: (contentType, decodedFrom) => {
            const kind = classifyContentType(contentType)
            // A decoded page is held to the decompressed cap, as the lane holds what it decodes itself.
            return kind === 'unsupported' ? null : kind === 'page' ? (decodedFrom === null ? maxBodyBytes : this.networkPolicy.maxDecompressedBytes) : maxFileBytes
          },
          extraHeaders: url === initialUrl ? validators.etag ? { 'if-none-match': validators.etag } : validators.lastModified ? { 'if-modified-since': validators.lastModified } : {} : {},
          ignoreTlsErrors: routes !== null,
          ...(deadlineAt === undefined ? {} : { deadlineAt }),
          onDecoded: coding => onResponseCoding?.(coding),
          ...(onBodyRead === undefined ? {} : { onBodyRead }),
        })
      }
      // The caller's headers go to the origin it named; a hop elsewhere gets the identity alone.
      const customNames = wire === undefined ? [] : Object.keys(wire.headers)
      const sameOrigin = new URL(url).origin === new URL(initialUrl).origin
      if (wire !== undefined && customNames.length > 0 && !sameOrigin) wire.onWithheld(url, customNames)
      const response = await request(url, {
        dispatcher: this.dispatcherFor(url, routes),
        method: 'GET',
        headersTimeout: init.headersTimeoutMs,
        bodyTimeout: init.bodyTimeoutMs,
        // The identity after the custom headers, so it is never overridden. Validators are bound to one representation; never forward on redirects.
        headers: { ...(wire !== undefined && sameOrigin ? wire.headers : {}), ...headers, ...(url === initialUrl ? validators.etag ? { 'if-none-match': validators.etag } : validators.lastModified ? { 'if-modified-since': validators.lastModified } : {} : {}) },
        signal: init.signal ?? signal,
      }).catch((error: unknown) => { throw proxyRefusal(error) ?? error })
      const responseHeaders = response.headers
      const header = (name: string) => {
        const v = responseHeaders[name.toLowerCase()]
        return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null
      }
      let bytes: Promise<Uint8Array> | undefined
      let body: string | undefined
      const bodyBytes = () => bytes ??= (async () => {
        const kind = classifyContentType(header('content-type'))
        // A type W2L does not read (an image, a video, ...) is not downloaded.
        if (kind === 'unsupported') { discard(response.body); return new Uint8Array() }
        // A file, or a response whose bytes decide, has the file cap; a web page keeps maxBodyBytes.
        const cap = kind === 'page' ? maxBodyBytes : maxFileBytes
        const declared = declaredLength(header('content-length'))
        if (declared !== null && declared > cap) { discard(response.body); throw new BodyTooLargeError(cap, declared) }
        const bodyStart = performance.now()
        const buf = await readCappedBody(response.body, cap)
        onBodyRead?.(Math.max(0, performance.now() - bodyStart))
        return buf
      })()
      return {
        status: response.statusCode,
        headers: { get: header },
        bodyBytes,
        bodyText: async () => (body ??= new TextDecoder().decode(await bodyBytes())),
      }
    }
  }

  /**
   * The identity for a page, used for its robots.txt and every request made
   * for it: research mode with a contact declares SEC's own format to SEC.gov
   * (see researchUserAgent), the subject's one identity everywhere else; the
   * mobile browser identity when the request asks for it (`mobile`), with the
   * request's custom headers (`headers`) before it.
   */
  private preparedFor(url: string, options: FetchOptions): ReturnType<typeof prepareHttpIdentity> {
    if (this.compat !== null) {
      // The engine routes neither here (channelsForUrl): the profile's header set cannot take them unchanged.
      if (options.mobile === true || Object.keys(options.headers ?? {}).length > 0) throw new Error('the compatible transport sends its profile\'s headers alone: no custom headers, no mobile identity')
      const prepared = prepareCompatIdentity(this.compat.profile)
      prepared.identity.respectsRobots = this.prepared.identity.respectsRobots
      return prepared
    }
    const prepared = prepareHttpIdentity(this.prepared.mode, this.networkPolicy.contact ?? null, new URL(url).hostname, options.mobile === true ? 'mobile' : 'desktop', options.headers, this.previewProductToken)
    prepared.identity.respectsRobots = this.prepared.identity.respectsRobots
    return prepared
  }

  /** The dispatcher for a URL: the local preview proxy for its fixed hosts, else `routes` (a request's relaxed-TLS routes) or the subject's own (EgressRoute). */
  private dispatcherFor(url: string, routes: EgressRoutes | null = null): Dispatcher {
    return this.route.dispatcherFor(url, routes)
  }

  /** `host:port` of the environment proxy a request to this URL goes through; null when it does not. */
  private envProxyFor(url: string): string | null {
    return this.route.viaOperatorProxy(url)
  }

  async fetch(url: string, deadlineMs?: number, signal?: AbortSignal, validators: { etag?: string; lastModified?: string } = {}, onRetryAfter?: ExecutionContext['onRetryAfter'], options: FetchOptions = {}, onRobotsOverride?: ExecutionContext['onRobotsOverride']): Promise<FetchResult> {
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
    // The request's own routes when it relaxed certificate verification: the
    // one place rejectUnauthorized is false, closed with the fetch. The
    // subject's shared routes, the robots cache's and the delivery worker's
    // keep verifying.
    const relaxed = options.skipTlsVerification === true ? new EgressRoutes(this.networkPolicy, undefined, { rejectUnauthorized: false }) : null
    try {
      permit = await this.scheduler.acquire(origin, scope.signal)
      throwIfExecutionStopped(scope)
      return markDeadline(await this.fetchWithinBudget(url, { ...scope, onRobotsOverride }, validators, monotonicStart, permit.queueMs, permit.cooldownWaitMs, options, relaxed, permit.limitedByConcurrency ? permit.concurrencyWaitMs : undefined))
    } catch (error) {
      if (!scope.signal.aborted && (deadlineMs === undefined || Date.now() < deadlineMs)) throw error
      const result = this.denied(url, start, [], 'timeout')
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      const retryAt = this.scheduler.retryAt(origin)
      const timed = { ...result, ...(retryAt === undefined ? {} : { retryAt }), ...(relaxed === null ? {} : { warnings: [tlsUnverifiedWarning(new URL(url).hostname)] }), usage: { ...result.usage, wallMs: totalMs, timings: { queueMs: permit?.queueMs ?? (retryAt === undefined ? totalMs : 0), robotsMs: 0, cooldownWaitMs: permit?.cooldownWaitMs ?? (retryAt === undefined ? 0 : totalMs), ...(permit?.limitedByConcurrency ? { concurrencyWaitMs: permit.concurrencyWaitMs } : {}), retryWaitMs: 0, requestMs: 0, bodyReadMs: 0, transportMs: 0, parseMs: 0, extractMs: 0, formatMs: 0, serializeMs: 0, modelMs: 0, totalMs } } }
      return markDeadline(timed)
    } finally {
      scope.dispose()
      permit?.release()
      await relaxed?.close()
    }
  }

  private async fetchWithinBudget(url: string, execution: ExecutionContext, validators: { etag?: string; lastModified?: string }, monotonicStart: number, initialQueueMs: number, initialCooldownWaitMs: number, options: FetchOptions, relaxed: EgressRoutes | null = null, concurrencyWaitMs?: number): Promise<FetchResult> {
    const { signal, deadlineAt, onRetryAfter, onRobotsOverride } = execution
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
      // Only when the origin's concurrency ceiling held this fetch's permit.
      ...(concurrencyWaitMs === undefined ? {} : { concurrencyWaitMs }),
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
    // Set when a robots disallow was set aside by the caller's recorded
    // decision; every result of this fetch then carries the warning. So does
    // every result of a fetch that relaxed certificate verification.
    let overrideWarning: FetchWarning | null = null
    const tlsWarning: FetchWarning | null = relaxed === null ? null : tlsUnverifiedWarning(new URL(url).hostname)
    const leadWarnings = (): FetchWarning[] => [...(overrideWarning === null ? [] : [overrideWarning]), ...(tlsWarning === null ? [] : [tlsWarning])]
    const timedDenied = (failureReason: FetchResult['failureReason'], retryAt?: number): FetchResult => {
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      const denied = this.denied(url, start, trace, failureReason)
      const warnings = leadWarnings()
      return {
        ...denied,
        ...(retryAt === undefined ? {} : { retryAt }),
        ...(warnings.length === 0 ? {} : { warnings }),
        usage: {
          ...denied.usage,
          wallMs: totalMs,
          timings: timings(totalMs),
        },
      }
    }
    const trace: TraceEvent[] = []
    const prepared = this.preparedFor(url, options)
    const honest = recordHttpIdentity(prepared, trace, 0)
    if (!honest) {
      return this.denied(url, start, trace, 'identity_compromised')
    }
    // Which client sent the request, when it is not the lane's own: what the record's identity was sent with.
    if (this.compat !== null) trace.push({ at: Date.now() - start, lane: 'http', event: 'transport', detail: { library: COMPAT_LIBRARY.name, version: COMPAT_LIBRARY.version, profile: this.compat.profile } })
    // What the caller added is on the record, values included.
    const customHeaders = Object.entries(prepared.customHeaders).map(([name, value]) => ({ name, value }))
    if (customHeaders.length > 0) trace.push({ at: Date.now() - start, lane: 'http', event: 'request_headers_added', detail: { headers: customHeaders } })
    if (relaxed !== null) trace.push({ at: Date.now() - start, lane: 'http', event: 'tls_verification_skipped', detail: { host: new URL(url).hostname } })
    if (this.localPreviewRobotsException) {
      trace.push({ at: Date.now() - start, lane: 'http', event: 'local_platform_robots_exception', detail: { host: new URL(url).hostname } })
    }

    // The page's own egress checks come before robots.txt: a name that does
    // not resolve, or an address the policy denies, is reported as itself,
    // never as the unreachable robots.txt it would also cause.
    try { await raceWithSignal(this.route.assertUrl(url), signal) }
    catch (error) {
      if (signal?.aborted) return timedDenied('timeout')
      if (!(error instanceof DnsLookupError) && !(error instanceof SsrfDeniedError)) throw error
      const dns = error instanceof DnsLookupError
      trace.push({ at: Date.now() - start, lane: 'http', event: dns ? 'dns_failed' : 'ssrf_denied', detail: { to: url, error: error.message } })
      return timedDenied(dns ? 'dns_error' : 'policy_denied')
    }

    if (prepared.identity.respectsRobots) {
      const robotsStart = performance.now()
      let cached: Awaited<ReturnType<RobotsOriginCache['lookup']>>
      // A relaxed fetch reads robots.txt through its own relaxed routes too, so the verdict is the publisher's rather than `unreachable`.
      try { cached = await this.robotsCache.lookup(url, prepared.identity.userAgent, execution, relaxed === null ? undefined : (target) => this.dispatcherFor(target, relaxed)) }
      catch (error) {
        robotsMs = performance.now() - robotsStart
        if (signal?.aborted) return timedDenied('timeout')
        throw error
      }
      const robotsDecision = this.robotsCache.decision(cached, url, prepared.identity.userAgent)
      trace.push({
        at: Date.now() - start,
        lane: 'http',
        event: 'robots_checked',
        detail: {
          decision: robotsDecision.decision,
          robotsUrl: robotsDecision.robotsUrl,
          // This lane mints no compliance record; the Evidence Record reads the decision here.
          robotsSha256: robotsDecision.robotsSha256,
          matchedGroup: robotsDecision.matchedUserAgentGroup,
          ruleCount: robotsDecision.appliedRules.length,
          // The crawl frontier spaces this host's pages by it (LadderScrapeAtom reads it here).
          crawlDelayMs: robotsDecision.crawlDelayMs,
          ...(robotsDecision.unreachable === undefined ? {} : { unreachable: robotsDecision.unreachable }),
        },
      })
      robotsMs = performance.now() - robotsStart
      // A disallow, or an unreachable robots.txt (RFC 9309 §2.3.1.4: a
      // complete disallow); the reason says which.
      if (robotsDecision.decision === 'disallowed') {
        trace.push({
          at: Date.now() - start,
          lane: 'http',
          event: 'robots_disallowed',
          detail: { url, appliedRules: robotsDecision.appliedRules, ...(robotsDecision.unreachable === undefined ? {} : { unreachable: robotsDecision.unreachable }) },
        })
        // An override sets the disallow aside for this one URL, a rule the
        // publisher wrote or the complete disallow an unreachable robots.txt
        // implies. The verdict stays in the trace above; this says on whose
        // word it was set aside and why, and the result's warnings repeat it.
        const override = applicableOverride(options.robotsOverride, robotsDecision)
        if (robotsDecision.unreachable !== undefined && cached?.error?.tls === true) {
          // robots.txt could not be read because the host's certificate does not
          // verify; the page would fail the same way. That is the fact to report.
          trace.push({ at: Date.now() - start, lane: 'http', event: 'request_failed', detail: { reason: 'tls_error', url: robotsDecision.robotsUrl, error: cached.error.name, ...(cached.error.code === null ? {} : { code: cached.error.code }) } })
          return timedDenied('tls_error')
        }
        if (override === undefined) return timedDenied('policy_denied')
        trace.push({
          at: Date.now() - start,
          lane: 'http',
          event: 'robots_overridden',
          detail: overriddenDetail(url, robotsDecision, override),
        })
        overrideWarning = robotsOverrideWarning(robotsDecision, override)
        // Said now, before the request goes out: the run's answer keeps the
        // override even when the deadline ends this fetch before it returns.
        onRobotsOverride?.(robotsOverrideApplied(trace, overrideWarning))
      }
    }

    if (signal?.aborted) return timedDenied('timeout')
    const host = new URL(url).origin
    if (cooldownWaitMs > 0) trace.push({ at: Date.now() - start, lane: 'http', event: 'host_cooldown_wait', detail: { host, waitMs: cooldownWaitMs } })
    const transportStart = performance.now()
    const maxFileBytes = fileByteCap(this.networkPolicy, options.maxFileBytes)
    // The coding the compatible transport decoded on the latest response; the lane never sees its header.
    const transportCoding: { decoded: string | null } = { decoded: null }
    const out = await resilientFetch(url, this.fetcherFor(url, prepared.identityHeaders, validators, signal, ms => { bodyReadMs += ms }, (intervalMs, cooldownMs) => {
      queueMs += intervalMs
      cooldownWaitMs += cooldownMs
      pacingWaitMs += intervalMs + cooldownMs
    }, (target, proxy) => {
      trace.push({ at: Date.now() - start, lane: 'http', event: 'egress_proxy', detail: { url: target, proxy, source: 'environment' } })
    }, maxFileBytes, {
      headers: prepared.customHeaders,
      onWithheld: (to, names) => trace.push({ at: Date.now() - start, lane: 'http', event: 'custom_headers_withheld', detail: { to, names: [...names] } }),
    }, relaxed, coding => { transportCoding.decoded = coding }, deadlineAt), {
      signal,
      deadlineAt,
      onRetryAfter: (target, retryAt) => {
        for (const origin of new Set([host, new URL(target).origin])) {
          this.scheduler.cooldown(origin, retryAt)
        }
        onRetryAfter?.(target, retryAt)
      },
      maxRedirects: this.networkPolicy.maxRedirects,
      // A caller's timeout is how long it will wait: headers and body may take until its deadline.
      capsFollowDeadline: options.timeout !== undefined,
      assertUrl: async (target) => {
        if (this.localPreviewRobotsException && !isLocalPreviewProxyTarget(target)) throw new Error('Local platform exception cannot follow an off-platform redirect')
        await this.route.assertUrl(target)
      },
    }).catch(error => {
      if (!signal?.aborted && (deadlineAt === undefined || Date.now() < deadlineAt)) throw error
      transportMs = Math.max(0, performance.now() - transportStart - pacingWaitMs)
      return null
    })
    if (out === null) return timedDenied('timeout', this.scheduler.retryAt(host))
    // resilientFetch returns once the final response's headers arrived.
    const fetchedAt = out.status === null ? null : new Date().toISOString()
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
    const contactHint = declaredContactHint(out.finalUrl, out.status, this.prepared.mode === 'research' && (this.networkPolicy.contact ?? null) !== null)
    if (contactHint !== null) trace.push({ at: wallMs, lane: 'http', event: 'declared_contact_hint', detail: contactHint })

    // Redirect evidence only when a redirect actually happened; a chain of
    // just the requested URL is "no redirect" and matches the other arms.
    const redirectChain = out.redirectChain.length > 1 ? out.redirectChain : []
    const contentType = out.headers?.get('content-type') ?? null
    // A 2xx answer with content may be a file (PDF, CSV, ...): see fileResult.ts.
    const contentful = out.kind === 'ok' && isSuccessStatus(out.status) && !isNoContentStatus(out.status)
    const bodyReadBeforeFinal = bodyReadMs
    // A response whose body was not read to the end: failed, nothing saved,
    // with the response's status and type kept as what the server answered.
    const unread = (reason: 'body_too_large' | 'timeout' | 'connection_error' | 'unsupported_content_encoding' | 'decompressed_too_large' | 'parse_error', file?: FileDescription, contentEncoding?: string): FetchResult => {
      const denied = timedDenied(reason)
      return {
        ...denied,
        evidence: { ...denied.evidence, finalUrl: out.finalUrl, httpStatus: out.status, redirectChain, contentType, ...(contentEncoding === undefined ? {} : { contentEncoding }), ...(fetchedAt === null ? {} : { fetchedAt }), ...(this.networkPolicy.egressProxy ? { envProxy: this.envProxyFor(out.finalUrl) } : {}) },
        usage: { ...denied.usage, requestCount: out.requestCount, attemptCount: out.attemptCount },
        ...(file === undefined ? {} : { file }),
      }
    }
    // The final body is read unless its type is one W2L does not download; it is
    // decoded by its Content-Encoding whether or not the coding was asked for
    // (W2L sends no Accept-Encoding), under the decompressed cap.
    const contentEncoding = out.kind === 'ok' && classifyContentType(contentType) !== 'unsupported' ? contentEncodingLabel(out.headers?.get('content-encoding') ?? transportCoding.decoded) : undefined
    // impit decoded the body before the lane saw it: the bytes on the wire were not counted.
    const transportDecoded = transportCoding.decoded
    if (transportDecoded !== null && out.kind === 'ok') trace.push({ at: Date.now() - start, lane: 'http', event: 'transport_decoded', detail: { contentEncoding: transportDecoded, by: COMPAT_LIBRARY.name } })
    let wire: Uint8Array
    let bytes: Uint8Array
    // Set when the body was read but did not decode: there is no body to hash.
    let undecoded = false
    try {
      wire = await out.bodyBytes()
      const decodeStart = performance.now()
      try {
        bytes = (await decodeContentEncoding(wire, out.headers?.get('content-encoding'), this.networkPolicy.maxDecompressedBytes)).bytes
      } catch (error) {
        // An answer without content keeps the status the server gave, without its body.
        const failure = decodeFailure(error)
        if (contentful || failure === null) throw error
        trace.push({ at: Date.now() - start, lane: 'http', event: failure.event, detail: failure.detail })
        bytes = new Uint8Array()
        undecoded = true
      } finally {
        bodyReadMs += Math.max(0, performance.now() - decodeStart)
      }
      // A file is held to its cap as decoded: that is what is saved.
      if (contentful && classifyContentType(contentType) !== 'page' && bytes.byteLength > maxFileBytes) throw new BodyTooLargeError(maxFileBytes)
    } catch (error) {
      if (signal?.aborted) return timedDenied('timeout', out.retryAt)
      if (error instanceof BodyTooLargeError) {
        const declared = classifyContentType(contentType)
        if (!contentful || declared === 'page') return timedDenied('body_too_large')
        // A file over the cap: failed with the size it declared, nothing saved, nothing truncated.
        const at = () => Date.now() - start
        const file = typeof declared === 'object' ? fileTooLarge({ contentType, declaredBytes: error.declaredBytes, maxBytes: error.maxBytes, decision: { kind: declared.kind, detectedBy: 'content_type' } }, { lane: 'http', trace, at }) : undefined
        if (file === undefined) trace.push({ at: at(), lane: 'http', event: 'file_too_large', detail: { kind: null, declaredBytes: error.declaredBytes, maxBytes: error.maxBytes } })
        return unread('body_too_large', file)
      }
      // A coding W2L does not decode, or bytes that do not decode, are never read as the page.
      const failure = decodeFailure(error)
      if (failure !== null) {
        trace.push({ at: Date.now() - start, lane: 'http', event: failure.event, detail: failure.detail })
        return unread(failure.reason, undefined, contentEncoding)
      }
      // A body that stalls or breaks off after the headers is a transport
      // failure like one before them, not an internal error.
      const reason = bodyReadFailure(error)
      if (reason === null) throw error
      trace.push({ at: Date.now() - start, lane: 'http', event: 'body_read_failed', detail: { reason, error: error instanceof Error ? error.name : String(error) } })
      return unread(reason)
    }
    transportMs += Math.max(0, bodyReadMs - bodyReadBeforeFinal)
    const file = contentful ? detectFile(contentType, bytes, responseFileName(out.finalUrl, out.headers?.get('content-disposition') ?? null)) : null
    // A web page is read as text and hashed as such; a file's hash is of its bytes (see below).
    const body = file === null ? new TextDecoder().decode(bytes) : ''
    // No response, no body: a connection that failed before one is not an empty page.
    const rawBodySha256 = file === null && !undecoded && out.status !== null ? sha256Utf8(body) : null
    const rawArtifacts = rawBodySha256 === null ? [] : await captureRawHtml(body, rawBodySha256)

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
        ...(fetchedAt === null ? {} : { fetchedAt }),
        etag: out.headers?.get('etag') ?? null,
        lastModified: out.headers?.get('last-modified') ?? null,
        cacheControl: out.headers?.get('cache-control') ?? null,
        vary: out.headers?.get('vary') ?? null,
        setsCookie: out.headers?.get('set-cookie') != null,
        ...(this.networkPolicy.egressProxy ? { envProxy: this.envProxyFor(out.finalUrl) } : {}),
        ...(contentEncoding === undefined ? {} : { contentEncoding }),
      },
      usage: {
        wallMs,
        bytesWire: transportDecoded === null ? wire.byteLength : null,
        bytesDecompressed: file === null ? Buffer.byteLength(body) : bytes.byteLength,
        requestCount: out.requestCount,
        attemptCount: out.attemptCount,
        contentTokens: null as number | null,
        browserMs: 0,
        externalCostUsd: 0,
      },
      trace,
    }
    const finish = <T extends FetchResult>(result: T): T => {
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      const lead = leadWarnings()
      // The lead warnings go before the list's, never in place of it.
      const done = withListCaveat(result)
      return {
        ...done,
        ...(lead.length === 0 ? {} : { warnings: [...lead, ...(done.warnings ?? [])] }),
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
        ...(out.deadlineExceeded ? { usage: { ...base.usage, deadlineExceeded: true } } : {}),
        status: 'failed',
        failureReason: out.failureReason,
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [],
        markdown: null,
      })
    }

    if (file === 'unsupported') {
      trace.push({ at: wallMs, lane: 'http', event: 'unsupported_content_type', detail: { contentType } })
      return finish({ ...base, status: 'failed', failureReason: 'unsupported_content_type', blockReason: null, budgetExceeded: null, lane: 'http', escalations: [], markdown: null })
    }
    // A file is answered here, whatever its outcome: no other lane reads it better.
    if (file !== null) {
      const content = await readFileResponse({ decision: file, contentType, declaredBytes: declaredLength(out.headers?.get('content-length') ?? null), maxBytes: maxFileBytes }, bytes, { lane: 'http', store: this.fileStore, deadlineAt, trace, at: () => Date.now() - start, ...(options.parsers === undefined ? {} : { parsers: options.parsers }) })
      formatMs = content.textMs
      return finish({
        ...base,
        status: content.status,
        failureReason: content.failureReason,
        blockReason: null,
        budgetExceeded: null,
        lane: 'http',
        escalations: [],
        markdown: content.markdown,
        links: [],
        file: content.file,
        ...(content.pages === undefined ? {} : { pages: content.pages }),
        evidence: { ...base.evidence, rawBodySha256: content.rawBodySha256, artifacts: content.artifacts },
        usage: { ...base.usage, contentTokens: content.contentTokens, ...(content.deadlineExceeded ? { deadlineExceeded: true } : {}) },
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
    // flag the browser lane, never a contentful success. The whole page stays
    // on that result as evidence, never content. onlyMainContent: false asks
    // for the whole page, not the main content, so there it is the answer,
    // still offered to the browser lane like a thin success. So is what
    // includeTags names, which is the answer on any page that is not
    // blocked; excludeTags is left out of all of these.
    const extractStart = performance.now()
    const extracted = extractTf.extract(body, { url: out.finalUrl, pruneSelectors: options.excludeTags, includeSelectors: options.includeTags, blockAds: options.blockAds })
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
        ...tagOptions(options),
      },
    })

    // Client-side rendering: the page as received looks like a shell for
    // data its scripts fill in (a table with no cells beside scripts, an
    // empty app root, an "enable JavaScript" fallback; extract-tf's
    // render.ts). The status stays what the content earned: a success, or
    // the failed result that keeps the page as evidence when the extractor
    // found no main region, which is how the plainest shells arrive here (a
    // page of site chrome around the script that writes its content). Either
    // result says so in a warning, and the ladder reads the event as it
    // reads quality_low_yield: an offer to the browser lane, which captures
    // the rendered page and never raises it. On the failed result the lane's
    // own extract_low_confidence ask already names that hop.
    const render = extracted.render
    const clientRenderedCaveat = (): FetchWarning[] => {
      if (render === undefined || !render.clientRendered) return []
      trace.push({
        at: wallMs,
        lane: 'http',
        event: 'quality_client_rendered',
        detail: {
          reason: render.reason,
          markers: render.markers,
          emptyTables: render.emptyTables,
          textChars: render.textChars,
          scriptChars: render.scriptChars,
        },
      })
      return [{
        code: 'client_rendered_suspected',
        message: `The page appears to fill in its data with JavaScript (${render.reason}); this HTTP capture may be a shell.`,
      }]
    }

    let wholePage: string | null = null
    // A page of the records a list format asked for is content, though no article was found in it.
    let listPage = false
    // A page whose content is only the extractor's last resort is checked for a wall as one with none found.
    if ((extracted.escalate || extracted.lastResort === true) && gate !== null) return blocked(gate)
    if (extracted.escalate && !selectionAsked(options)) {
      const formatStart = performance.now()
      wholePage = wholePageMarkdown(body, out.finalUrl, options)
      formatMs = performance.now() - formatStart
      listPage = listRecordsFound(body, out.finalUrl, options)
      if ((options.onlyMainContent !== false && !listPage) || wholePage === null) {
        const warnings = clientRenderedCaveat()
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
          markdown: wholePage,
          ...(wholePage === null ? {} : { links }),
          ...(warnings.length > 0 ? { warnings } : {}),
        })
      }
    }

    const decisive = classifyGate({
      status: out.status,
      header: (name) => out.headers?.get(name) ?? null,
      body,
      contentful: true,
    })
    if (decisive !== null) return blocked(decisive)

    const formatStart = performance.now()
    const mainMarkdown = htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl, ...markdownOptions(options) })
    // onlyMainContent: false emits the whole page (header, navigation and
    // footer kept) through the same converter and base URL. The quality
    // signal below still reads the main content, so the mode never changes
    // which lane answers.
    const markdown = wholePageAsked(options) || listPage ? wholePage ?? htmlToMarkdown(body, { baseUrl: out.finalUrl, exclude: options.excludeTags, ...markdownOptions(options) }) : mainMarkdown
    formatMs += performance.now() - formatStart
    const contentTokens = estimateTokens(markdown)
    const mainTokens = markdown === mainMarkdown ? contentTokens : estimateTokens(mainMarkdown)

    // Quality signal: a success whose content is thin AND low-confidence is
    // a success worth offering to a higher lane. So is a page whose tables
    // are empty shells, or that declares data its scripts will fetch: that
    // content arrives by script, so this HTML cannot hold it however
    // confident the extraction looks. The status stays
    // success — this is not a rewritten verdict — but the ladder reads this
    // event as "the HTTP answer is below the quality bar, try the browser".
    const emptyTableShells = extracted.emptyTableShells ?? 0
    const fetchPreloads = extracted.fetchPreloads ?? 0
    if (
      extracted.escalate ||
      (mainTokens <= QUALITY_ESCALATION_MAX_TOKENS &&
        extracted.confidence <= QUALITY_ESCALATION_MAX_CONFIDENCE) ||
      emptyTableShells > 0 ||
      fetchPreloads > 0
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
          fetchPreloads,
        },
      })
    }

    // The shell caveat follows quality_low_yield: when both fire, the first
    // quality event in the trace names the ladder's hop.
    const warnings = clientRenderedCaveat()
    // The images and attributes formats read the body as received, like links.
    const extra = extraFormats(body, out.finalUrl, options, trace, 'http', wallMs)
    // The tables format reads what the Markdown was written from, with the same options.
    const tables = tablesFormat(wholePageAsked(options)
      ? { html: body, options: { baseUrl: out.finalUrl, exclude: options.excludeTags, ...markdownOptions(options) } }
      : { html: extracted.mainHtml, options: { baseUrl: extracted.baseUrl, ...markdownOptions(options) } }, out.finalUrl, options, trace, 'http', wallMs)

    return finish({
      ...base,
      status: 'success',
      failureReason: null,
      blockReason: null,
      budgetExceeded: null,
      lane: 'http',
      escalations: [],
      markdown,
      ...(warnings.length > 0 ? { warnings } : {}),
      links,
      ...extra,
      ...tables,
      metadata: extracted.metadata,
      document: {
        title: extracted.title,
        pageType: extracted.pageType,
        strategy: extracted.strategy,
        confidence: extracted.confidence,
        product: extracted.product ?? null,
        adapter: extracted.adapter,
        entities: extracted.entities,
        adapterValidation: extracted.adapterValidation,
        labelledValues: extracted.labelledValues,
      },
      ...htmlFormats(body, body, extracted.mainHtml, options),
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
        externalCostUsd: 0,
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
 * SEC.gov answers 403 to automated clients that declare no contact in their
 * User-Agent. When a request that declared none gets that answer, the result
 * says how to declare one; the status stays what the server said.
 */
function declaredContactHint(finalUrl: string, status: number | null, declaredContact: boolean): { host: string; status: 403; hint: string } | null {
  if (status !== 403 || declaredContact) return null
  let host: string
  try { host = new URL(finalUrl).hostname.toLowerCase() } catch { return null }
  if (host !== 'sec.gov' && !host.endsWith('.sec.gov')) return null
  return { host, status, hint: 'SEC.gov asks automated clients to declare a contact in the User-Agent: use mode "research" with W2L_CONTACT set, for example W2L_CONTACT="Jane Doe jane@example.org".' }
}

/** The failure reason and trace event for a body that was not decoded; null for any other error. */
function decodeFailure(error: unknown): { reason: 'unsupported_content_encoding' | 'decompressed_too_large' | 'parse_error'; event: string; detail: Record<string, unknown> } | null {
  if (error instanceof UnsupportedContentEncodingError) return { reason: 'unsupported_content_encoding', event: 'unsupported_content_encoding', detail: { contentEncoding: error.contentEncoding, coding: error.coding } }
  if (error instanceof DecompressedTooLargeError) return { reason: 'decompressed_too_large', event: 'decompressed_too_large', detail: { contentEncoding: error.contentEncoding, maxBytes: error.maxBytes } }
  if (error instanceof ContentDecodingError) return { reason: 'parse_error', event: 'content_decoding_failed', detail: { contentEncoding: error.contentEncoding, coding: error.coding, code: error.code } }
  return null
}

/** How a body read that failed after the response headers is reported; null for anything else. */
function bodyReadFailure(error: unknown): 'timeout' | 'connection_error' | null {
  if (!(error instanceof Error)) return null
  const code = (error as { code?: unknown }).code
  if (error.name === 'BodyTimeoutError' || code === 'UND_ERR_BODY_TIMEOUT') return 'timeout'
  if (error.name === 'SocketError' || code === 'UND_ERR_SOCKET' || code === 'ECONNRESET' || code === 'EPIPE' || code === 'UND_ERR_CLOSED') return 'connection_error'
  return null
}

/** Closes a body that will not be read; the connection's own abort is not an error of the fetch. */
function discard(body: { on(event: 'error', listener: () => void): unknown; destroy(): unknown }): void {
  body.on('error', () => {})
  body.destroy()
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
