import { CONTENTFUL_STATUS, estimateTokens, type PageAction, fileByteCap, proxyFor, type ExecutionContext, type FetchOptions, type FetchResult, type FetchWarning, type NetworkPolicy, type RobotsOverrideApplied, type TraceEvent } from '@w2l/contracts'
import { classifyContentType, collectLinks, detectFile, extractTf, htmlToMarkdown, responseFileName } from '@w2l/extract-tf'
import {
  abortableSleep,
  createExecutionScope,
  raceWithSignal,
  remainingTimeout,
  throwIfExecutionStopped,
  classifyGate,
  escalationForBlock,
  isRetryableStatus,
  parseRetryAfterMs,
  ComplianceChain,
  normalizeAccessConfig,
  sha256Utf8,
  type AccessConfigInput,
  type AccessFactShape,
  type ComplianceRecord,
  type ComplianceSentHeader,
} from '@w2l/http-core'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Download, type Page, type Request, type Response, type Route } from 'playwright'
import { assertSafeUrl, BodyTooLargeError, browserProxySettings, chromiumProxyLaunchOptions, defaultNetworkPolicy, EgressRoutes, pinnedBrowserHostRules, readCappedBody } from '../egress.js'
import type { FileStore } from '../fileStore.js'
import { declaredLength, fileTooLarge, readFileResponse } from './fileResult.js'
import type { SubjectAdapter } from '../subject.js'
import { RobotsOriginCache, robotsOverrideApplied, robotsOverrideWarning } from '../robotsLookup.js'
import { runPageActions, type ActionRun } from './browserActions.js'
import { isNavigationError, waitForRenderedStability } from '../browserSettle.js'
import { captureLayout } from '../browserLayout.js'
import { OriginScheduler, type OriginPermit } from './originScheduler.js'
import { errorPageEvidence, extraFormats, htmlFormats, isNoContentStatus, isSuccessStatus, markdownOptions, selectionAsked, tablesFormat, tagOptions, wholePageAsked, wholePageMarkdown } from './errorPage.js'
import { captureRawHtml } from '../rawArtifact.js'
import { captureScreenshot, screenshotViewport } from './screenshot.js'
import { amazonVariantFollowupUrl } from './amazonVariantFollowup.js'
import { hostedBrowserRequestAllowed } from './browserRequestPolicy.js'
import { MainFrameDocuments, reported, type MainFrameEntry } from './browserDocuments.js'
import { AD_HOSTS, isAdHost } from './adHosts.js'
import { wireHeaders } from '../httpIdentity.js'
import { tlsUnverifiedWarning } from '../tlsWarning.js'
import {
  CHROME_MAJOR_FLOOR,
  assertIdentityBundle,
  browserFingerprintFor,
  browserUserAgentMetadata,
  checkIdentityHonesty,
  identityBundleFrom,
  identityForRoute,
  modeIdentity,
  previewIdentity,
  type CrawlMode,
  type HonestyVerdict,
  type IdentityDevice,
} from '@w2l/contracts'

/**
 * Headers that never go into the as-sent record or the trace: a credential
 * is recorded as a hash in the access fact (access.ts), never as its value.
 * Playwright reports them as sent once a route intercepts the context's
 * requests, which blockAds does by default.
 */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set(['cookie', 'authorization', 'proxy-authorization'])

/** The request headers Playwright reports, lower-cased and sorted, without credentials: what the honesty check reads and the record signs. */
function asSentHeaders(headers: Readonly<Record<string, string>>): ComplianceSentHeader[] {
  return Object.entries(headers)
    .map(([name, value]) => ({ name: name.toLowerCase(), value }))
    .filter(({ name }) => !CREDENTIAL_HEADERS.has(name))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The caller's custom headers on the browser lane, added through the page's
 * own CDP session (the Fetch domain, request stage) to every request whose
 * origin is the fetched URL's: the document, its same-origin redirect hops
 * and the files the page loads from that origin. They go after the request's
 * own headers; wireHeaders refused the identity's names, so the identity is
 * never overridden. A request to another origin is continued as Chromium
 * made it: a redirect of the document there gets the identity alone and the
 * trace says so (`custom_headers_withheld`, as on the HTTP lane), and so does
 * a navigation the page itself makes elsewhere. The Fetch domain's rule makes
 * the hop safe: a request-stage header override does not extend to a redirect
 * hop (Fetch.continueRequest), so every hop is judged by its own origin here.
 * A Playwright route cannot do this: Playwright gives a redirected request no
 * route and re-applies the first request's continue() overrides to every hop,
 * as a browser carries its own headers, so headers given that way reached the
 * origin a redirect led to.
 */
class CustomHeaderGate {
  private readonly names: ReadonlySet<string>
  private readonly entries: readonly ComplianceSentHeader[]
  /** The documents (the main frame's and frames') the headers were added to, by URL, for the record. */
  private readonly documents = new Set<string>()
  private mainFrameId: string | null = null

  constructor(
    private readonly session: CDPSession,
    private readonly origin: string,
    headers: Readonly<Record<string, string>>,
    private readonly onWithheld: (to: string, names: readonly string[]) => void,
  ) {
    this.entries = Object.entries(headers).map(([name, value]) => ({ name, value }))
    this.names = new Set(this.entries.map(({ name }) => name))
  }

  /** Installs the gate: from here until the session detaches, every request of the page pauses in it and `admit` continues it. */
  async enable(): Promise<void> {
    this.mainFrameId = (await this.session.send('Page.getFrameTree')).frameTree.frame.id
    this.session.on('Fetch.requestPaused', (event) => { void this.admit(event) })
    await this.session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  }

  private async admit(event: { requestId: string; frameId: string; resourceType: string; request: { url: string; headers: Record<string, string> } }): Promise<void> {
    const { url, headers } = event.request
    let origin: string | null = null
    try { origin = new URL(url).origin } catch { origin = null }
    const own = Object.entries(headers).filter(([name]) => !this.names.has(name.toLowerCase())).map(([name, value]) => ({ name, value }))
    const document = event.resourceType === 'Document'
    if (origin === this.origin) {
      if (document) this.documents.add(url)
      await this.session.send('Fetch.continueRequest', { requestId: event.requestId, headers: [...own, ...this.entries] }).catch(() => {})
      return
    }
    // The main frame's document from another origin: a redirect hop, or a navigation the page made.
    if (document && event.frameId === this.mainFrameId) this.onWithheld(url, [...this.names])
    // Chromium carries no override to a redirect hop; a custom header found here is stripped all the same.
    const carried = own.length !== Object.keys(headers).length
    await this.session.send('Fetch.continueRequest', carried ? { requestId: event.requestId, headers: own } : { requestId: event.requestId }).catch(() => {})
  }

  /**
   * The as-sent headers of the document at `url`: Playwright's view, with the
   * custom headers this gate added to that request when Playwright's own
   * interception ran before the gate's and did not see them.
   */
  sent(url: string, reported: readonly ComplianceSentHeader[]): ComplianceSentHeader[] {
    if (!this.documents.has(url)) return [...reported]
    // What went on the wire for a document the gate handled: its own values
    // for the names it set (Playwright reports the browser's pre-interception
    // value, en-US for a context's Accept-Language), the rest as reported.
    return [...reported.filter(({ name }) => !this.names.has(name)), ...this.entries].sort((a, b) => a.name.localeCompare(b.name))
  }
}

/** What went on the wire with `request`: as Playwright saw it, credentials excepted (asSentHeaders), with what the custom-header gate added to it. */
function sentHeadersOf(gate: CustomHeaderGate | null, request: Request | null): ComplianceSentHeader[] {
  const reported = asSentHeaders(request?.headers() ?? {})
  return gate === null || request === null ? reported : gate.sent(request.url(), reported)
}

/**
 * Time kept free before the caller's deadline when a waitFor wait would run
 * into it, so the page can still be captured and extracted.
 */
const CAPTURE_RESERVE_MS = 1_000

/**
 * Reads of a page that loads new documents while W2L reads it, before W2L
 * gives up pairing what it read with one of them: such a page (a client-side
 * redirect loop, a meta refresh to itself) fails with `redirect_loop`.
 */
const CAPTURE_ATTEMPTS = 3

/** Time a page's close may take before W2L closes its context instead. */
const PAGE_CLOSE_MS = 2_000

/**
 * Close a page, waiting `timeoutMs` at most: Chromium can leave the close of
 * a page that keeps navigating (a refresh loop) unanswered, and a fetch that
 * waited for it would never end, nor would the next one to its origin.
 * Closing the page's context, which follows, ends it. True when it closed in
 * time.
 */
export async function closePage(page: Pick<Page, 'close'>, timeoutMs = PAGE_CLOSE_MS): Promise<boolean> {
  return closeWithin(page.close(), timeoutMs)
}

/** Wait for a close at most `timeoutMs`; true when it ended in time. A close that never answers is left behind, never waited for. */
async function closeWithin(closing: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const settled = closing.then(() => true, () => true)
  let timer: ReturnType<typeof setTimeout> | undefined
  const closed = await Promise.race([settled, new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs) })])
  clearTimeout(timer)
  return closed
}

/**
 * Browser-local subject: the escalation target the http lane flags into.
 * Direct Playwright (ADR 0001) — one Chromium per run (headless unless
 * `--headed`), one fresh
 * page per case, real script execution, real fingerprint.
 *
 * Identity is honest by construction: the mode's declared identity is derived
 * from the *actual* Chromium version (`browser.version()`), and the client
 * hints are aligned to it. The declared-vs-sent check (checkIdentityHonesty)
 * runs on every fetch and is recorded into the trace — a UA that Playwright
 * mutates on the wire is surfaced as a mismatch, never papered over.
 *
 * robots.txt is fetched per origin and evaluated against the mode's declared
 * UA before navigation; a disallow ends the fetch as `policy_denied` and still
 * mints a record. Every record joins one per-run hash chain, so the ledger a
 * publisher receives is missing-record-evident, not just tamper-evident.
 *
 * A caller may supply their own proxy or session (`AccessConfigInput`). Doing
 * so changes the route and the credentials, never the identity: the UA,
 * locale, timezone and viewport stay exactly what they were. Who owns that
 * access is normalized into a credential-free fact and signed inside every
 * record, so the responsibility transfer is provable rather than asserted.
 * robots is still evaluated, and a disallow still stops the fetch — bringing
 * your own network does not buy an exemption from the publisher's rules.
 *
 * The rendered DOM goes through the SAME extract-tf cascade as the http
 * arms, so any score delta against resilient-http is attributable to
 * render-and-execute alone.
 */
export class BrowserLocalSubject implements SubjectAdapter {
  readonly meta = {
    id: 'browser-local',
    displayName: 'browser-local (playwright chromium × extract-tf)',
    version: '0.1.0',
    hosting: 'self_hosted' as const,
  }

  private activeExecutions = 0
  private readonly scheduler: OriginScheduler
  private browser: Browser | null = null
  private browserPromise: Promise<Browser> | null = null
  private managedContext: BrowserContext | null = null
  private managedContextPromise: Promise<BrowserContext> | null = null
  /** Per-host last-request timestamp, for honest rate-limit facts. */
  private readonly lastRequestAtMsByHost = new Map<string, number>()
  /**
   * Per-host robots.txt, fetched once and reused. Caching is itself a
   * politeness property — re-fetching robots.txt before every page would be
   * the opposite of what the file is for.
   */
  private readonly robotsCache: RobotsOriginCache
  private readonly networkPolicy: NetworkPolicy
  /** The run's hash chain. Every record this subject mints links into it. */
  private readonly chain: ComplianceChain
  /**
   * Who owns the network and session for this run, resolved once at
   * construction. Normalizing here means a config that cannot be honestly
   * recorded — a proxy with no attestation, a password in the URL — fails
   * before a single fetch, rather than half a run in.
   */
  private readonly access: AccessFactShape
  /**
   * The raw config, kept in memory only, because actually routing through the
   * user's proxy needs the password the fact deliberately reduced to a hash.
   * It is never written to a record, a trace, or a log line.
   */
  private readonly accessConfig: AccessConfigInput | null
  /** The operator's environment proxy for every context this subject opens (local mode). */
  private readonly envProxy: ReturnType<typeof browserProxySettings>

  constructor(
    private readonly mode: CrawlMode = 'standard',
    access?: AccessConfigInput | null,
    private readonly headed = false,
    networkPolicy?: NetworkPolicy,
    private readonly managedProfileDir: string | null = null,
    scheduler?: OriginScheduler,
    private readonly publicPreferenceState: string | null = null,
    private readonly browserAllowedHosts?: readonly string[],
    /** In-memory witness for an explicitly authorized evaluation. Never a persistence path. */
    private readonly onRenderedHtml?: (html: string, sha256: string) => void,
    /** Where files (PDF, CSV, ...) the browser downloads or displays are saved as received; without one they are read but not saved. */
    private readonly fileStore: FileStore | null = null,
    /** The hosted public preview's standard User-Agent carries PREVIEW_PRODUCT_TOKEN (previewIdentity). */
    private readonly previewProductToken = false,
    /** The ad-serving hosts `blockAds` aborts requests to (adHosts.ts); a test seam. */
    private readonly adHosts: readonly string[] = AD_HOSTS,
  ) {
    if (publicPreferenceState !== null && (mode !== 'standard' || access != null || managedProfileDir !== null)) {
      throw new Error('anonymous public preference state is only available to the standard public browser')
    }
    if (previewProductToken && (mode !== 'standard' || access != null || managedProfileDir !== null)) {
      throw new Error('the preview product token is only available to the standard public browser')
    }
    if (browserAllowedHosts !== undefined && (access != null || managedProfileDir !== null)) {
      throw new Error('host-pinned browser requires an unmanaged direct connection')
    }
    if (browserAllowedHosts !== undefined) this.browserAllowedHosts = browserAllowedHosts.map(host => host.toLowerCase())
    this.chain = new ComplianceChain(crypto.randomUUID(), mode)
    this.access = normalizeAccessConfig(access)
    this.accessConfig = access ?? null
    const policy = networkPolicy ?? defaultNetworkPolicy()
    // A user's own proxy and hosted host pinning each fix the route already;
    // everywhere else the browser follows the operator's environment proxy.
    this.networkPolicy = access?.proxy || browserAllowedHosts !== undefined ? { ...policy, egressProxy: null } : policy
    this.envProxy = browserProxySettings(this.networkPolicy)
    this.scheduler = scheduler ?? new OriginScheduler(this.networkPolicy)
    this.robotsCache = new RobotsOriginCache(this.networkPolicy)
  }

  /** Managed profile is a distinct lifecycle path; it is never implied by an anonymous subject. */
  profileDir(): string | null { return this.managedProfileDir }

  /** Snapshot of the run's ledger, for callers that persist or verify it. */
  ledger(): ReturnType<ComplianceChain['toLedger']> {
    return this.chain.toLedger()
  }

  async fetch(url: string, deadlineMs?: number, signal?: AbortSignal, onRetryAfter?: ExecutionContext['onRetryAfter'], options: FetchOptions = {}, onRobotsOverride?: ExecutionContext['onRobotsOverride']): Promise<FetchResult> {
    const scope = createExecutionScope({ signal, deadlineAt: deadlineMs, onRetryAfter })
    const start = Date.now()
    const monotonicStart = performance.now()
    let queueMs = 0
    let cooldownWaitMs = 0
    // Set when the origin's concurrency ceiling held this fetch's permit: how long.
    let concurrencyWaitMs: number | undefined
    // Set when a robots disallow was set aside by the caller's recorded
    // decision; every result of this fetch then carries the warning first,
    // and every result of a fetch that relaxed certificate verification the
    // tls_unverified warning.
    const robots: { overrideWarning: FetchWarning | null } = { overrideWarning: null }
    const tlsWarning: FetchWarning | null = options.skipTlsVerification === true ? tlsUnverifiedWarning(new URL(url).hostname) : null
    // Set when the request's actions ran on the page: every result of this fetch then carries what they produced.
    const ran: { actions?: ActionRun } = {}
    const finish = (result: FetchResult): FetchResult => {
      const totalMs = Math.max(0, performance.now() - monotonicStart)
      const lead = [...(robots.overrideWarning === null ? [] : [robots.overrideWarning]), ...(tlsWarning === null ? [] : [tlsWarning])]
      return {
        ...withActions(result, ran.actions),
        ...(lead.length === 0 ? {} : { warnings: [...lead, ...(result.warnings ?? [])] }),
        usage: {
          ...result.usage,
          wallMs: totalMs,
          timings: {
            ...(result.usage.timings ?? {}),
            queueMs,
            cooldownWaitMs,
            ...(concurrencyWaitMs === undefined ? {} : { concurrencyWaitMs }),
            totalMs,
          },
        },
      }
    }
    const origin = new URL(url).origin
    this.activeExecutions++
    let permit: OriginPermit | undefined
    try {
      permit = await this.scheduler.acquire(origin, scope.signal)
      queueMs = permit.queueMs
      cooldownWaitMs = permit.cooldownWaitMs
      if (permit.limitedByConcurrency) concurrencyWaitMs = permit.concurrencyWaitMs
      throwIfExecutionStopped(scope)
      const result = await this.fetchWithinBudget(url, scope, (intervalMs, cooldownMs) => { queueMs += intervalMs; cooldownWaitMs += cooldownMs }, options, (applied) => { robots.overrideWarning = applied.warning; onRobotsOverride?.(applied) }, ran)
      if (result.retryAt !== undefined) this.scheduler.cooldown(origin, result.retryAt)
      return finish(result)
    } catch (error) {
      if (!scope.signal.aborted && (deadlineMs === undefined || Date.now() < deadlineMs)) throw error
      const retryAt = this.scheduler.retryAt(origin)
      if (!permit) {
        const waited = Math.max(0, performance.now() - monotonicStart)
        queueMs = retryAt === undefined ? waited : 0
        cooldownWaitMs = retryAt === undefined ? 0 : waited
      }
      return finish({ ...this.denied(url, start, [], new Error('aborted')), ...(retryAt === undefined ? {} : { retryAt }) })
    } finally {
      this.activeExecutions--
      scope.dispose()
      permit?.release()
    }
  }

  private async fetchWithinBudget(url: string, execution: ExecutionContext, onRequestWait?: (intervalMs: number, cooldownMs: number) => void, options: FetchOptions = {}, onRobotsOverride?: (applied: RobotsOverrideApplied) => void, ran: { actions?: ActionRun } = {}): Promise<FetchResult> {
    const signal = execution.signal
    const start = Date.now()
    const trace: TraceEvent[] = [{ at: 0, lane: 'browser_local', event: 'browser_start' }]
    let context: BrowserContext | undefined
    let page: Page | undefined
    /** The page's own CDP session, open for the page's lifetime: the user-agent metadata override and the custom-header gate live as long as it. */
    let session: CDPSession | undefined
    let headerGate: CustomHeaderGate | null = null
    const onAbort = () => {
      void page?.close().catch(() => {})
      if (context !== this.managedContext) void context?.close().catch(() => {})
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    // The robots.txt lookup of a fetch that relaxed certificate verification
    // goes through routes of its own that relax it too, closed with the fetch;
    // the cache's own routes keep verifying (see EgressTlsOptions).
    const relaxedRoutes = options.skipTlsVerification === true ? new EgressRoutes(this.networkPolicy, undefined, { rejectUnauthorized: false }) : null
    // The request route of this fetch (host allowlist, ad hosts) and what it
    // matches, removed before the context closes.
    let requestRoute: ((route: Route) => Promise<void>) | null = null
    const routeMatch = '**/*'
    try {
      throwIfExecutionStopped(execution)
      await raceWithSignal(assertSafeUrl(url, this.networkPolicy), signal)
      const managedContext = this.managedProfileDir === null ? null : await raceWithSignal(this.getManagedContext(execution), signal)
      const browser = managedContext?.browser() ?? await raceWithSignal(this.getBrowser(execution), signal)
      throwIfExecutionStopped(execution)
      // Real Chromium major, not the floor constant: declaring a Chrome
      // version we are not running is an inconsistency, not a feature.
      const version = browser.version()
      const major = Number(version.split('.')[0] ?? CHROME_MAJOR_FLOOR)
      // The mobile identity needs a context of its own; a managed profile's
      // context already exists with the desktop one, and no API path asks it
      // for the mobile identity.
      const device: IdentityDevice = options.mobile === true && managedContext === null ? 'mobile' : 'desktop'
      // Research mode declares its contact in the format the page's host asks
      // for (researchUserAgent); the hosted preview adds its product token.
      const declared = modeIdentity(this.mode, Number.isFinite(major) ? major : CHROME_MAJOR_FLOOR, this.networkPolicy.contact ?? null, new URL(url).hostname, device)
      const identity = this.previewProductToken ? previewIdentity(declared) : declared
      assertIdentityBundle(
        identityForRoute(this.mode, this.accessConfig, Number.isFinite(major) ? major : CHROME_MAJOR_FLOOR, undefined, device),
      )
      trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'identity_declared', detail: { mode: this.mode, ...(identity.device === undefined ? {} : { device: identity.device }) } })
      const customHeaders = wireHeaders(options.headers)
      if (Object.keys(customHeaders).length > 0) trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'request_headers_added', detail: { headers: Object.entries(customHeaders).map(([name, value]) => ({ name, value })) } })
      if (options.skipTlsVerification === true) trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'tls_verification_skipped', detail: { host: new URL(url).hostname } })

      // Robots is consulted BEFORE the browser context is opened. Every mode
      // declares respectsRobots: true, and the only way that claim means
      // anything is if a disallow actually stops the fetch — a record that
      // says "disallowed" next to a page we fetched anyway would be a
      // self-documenting violation.
      const cachedRobots = await this.robotsCache.lookup(url, identity.userAgent, execution, relaxedRoutes === null ? undefined : (target) => relaxedRoutes.dispatcherFor(target))
      const robotsDecision = this.robotsCache.decision(cachedRobots, url, identity.userAgent)
      trace.push({
        at: Date.now() - start,
        lane: 'browser_local',
        event: 'robots_checked',
        detail: {
          decision: robotsDecision.decision,
          robotsUrl: robotsDecision.robotsUrl,
          robotsSha256: robotsDecision.robotsSha256,
          matchedGroup: robotsDecision.matchedUserAgentGroup,
          ruleCount: robotsDecision.appliedRules.length,
          crawlDelayMs: robotsDecision.crawlDelayMs,
          ...(robotsDecision.unreachable === undefined ? {} : { unreachable: robotsDecision.unreachable }),
        },
      })

      const host = this.hostOf(url)

      // A recorded override sets a disallow the publisher wrote aside for this
      // one URL (never an unreachable robots.txt): the verdict, the override
      // and its reason go into the trace, the warnings and the compliance
      // record, and the fetch goes ahead.
      const override = options.robotsOverride
      const overridden = identity.respectsRobots && robotsDecision.decision === 'disallowed' && robotsDecision.unreachable === undefined && override !== undefined
      if (override !== undefined && overridden) {
        trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'robots_disallowed', detail: { url, appliedRules: robotsDecision.appliedRules } })
        trace.push({
          at: Date.now() - start,
          lane: 'browser_local',
          event: 'robots_overridden',
          detail: { url, appliedRules: robotsDecision.appliedRules, reason: override.reason, ...(override.recordedBy === undefined ? {} : { recordedBy: override.recordedBy }) },
        })
        // Said now, before the page is opened: the run's answer keeps the
        // override even when the deadline ends this fetch before it returns.
        onRobotsOverride?.(robotsOverrideApplied(trace, robotsOverrideWarning(robotsDecision, override)))
      }
      const robotsForRecord = override !== undefined && overridden ? { ...robotsDecision, skippedFetch: false, override } : robotsDecision

      if (identity.respectsRobots && robotsDecision.decision === 'disallowed' && !overridden) {
        const wallMs = Date.now() - start
        const record = this.chain.append({
          recordId: crypto.randomUUID(),
          mode: this.mode,
          requestedUrl: url,
          finalUrl: null,
          requestedAt: new Date(start).toISOString(),
          robots: { ...robotsDecision, skippedFetch: true },
          sentHeaders: { headers: [] },
          rateLimit: {
            previousRequestAtMs: this.lastRequestAtMsByHost.get(host) ?? null,
            observedDelayMs: null,
            requiredDelayMs: this.networkPolicy.perHostMinDelayMs,
            compliant: true,
            recentSameHostCount: 0,
          },
          access: this.access,
        })
        trace.push({
          at: wallMs,
          lane: 'browser_local',
          event: 'robots_disallowed',
          detail: { url, appliedRules: robotsDecision.appliedRules, ...(robotsDecision.unreachable === undefined ? {} : { unreachable: robotsDecision.unreachable }) },
        })
        // robots.txt unreadable because the host's certificate does not verify: the page would fail the same way, and that is the fact to report.
        const tlsFailed = robotsDecision.unreachable !== undefined && cachedRobots?.error?.tls === true
        if (tlsFailed) trace.push({ at: wallMs, lane: 'browser_local', event: 'request_failed', detail: { reason: 'tls_error', url: robotsDecision.robotsUrl, error: cachedRobots!.error!.name, ...(cachedRobots!.error!.code === null ? {} : { code: cachedRobots!.error!.code }) } })
        return {
          requestedUrl: url,
          status: 'failed',
          failureReason: tlsFailed ? 'tls_error' : 'policy_denied',
          blockReason: null,
          budgetExceeded: null,
          lane: 'browser_local',
          escalations: [],
          markdown: null,
          truncated: false,
          truncatedAt: null,
          compliance: record,
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

      const amazonPublicState = this.publicPreferenceState !== null && /(^|\.)amazon\.(com|sg)$/i.test(host)
        ? this.publicPreferenceState : null
      // The fingerprint of the declared identity: the desktop one, or the
      // mobile one (a phone viewport, touch) for the mobile identity.
      const fingerprint = browserFingerprintFor(identity.device)
      // The screenshot format's window: the viewport asked for when it fits
      // the declared identity (identityBundleIssues: the screen is at least
      // the viewport), else the declared one and the capture says why. The
      // screen, the scale factor and everything else stay as declared; a
      // managed profile's context already exists and keeps its own window.
      const window = managedContext === null
        ? screenshotViewport(options.screenshot, identity, fingerprint)
        : { viewport: fingerprint.viewport, issues: options.screenshot?.viewport === undefined ? [] : ['a managed profile keeps the window of its own context'] }
      if (options.screenshot?.viewport !== undefined) {
        trace.push({
          at: Date.now() - start,
          lane: 'browser_local',
          event: 'screenshot_viewport',
          detail: { requested: options.screenshot.viewport, viewport: window.viewport, declared: fingerprint.viewport, screen: fingerprint.screen, deviceScaleFactor: fingerprint.deviceScaleFactor, ...(window.issues.length === 0 ? {} : { refused: [...window.issues] }) },
        })
      }
      const pendingContext = managedContext ? Promise.resolve(managedContext) : browser.newContext({
        userAgent: identity.userAgent,
        locale: fingerprint.locale,
        timezoneId: fingerprint.timezoneId,
        viewport: window.viewport,
        screen: fingerprint.screen,
        deviceScaleFactor: fingerprint.deviceScaleFactor,
        isMobile: fingerprint.isMobile,
        hasTouch: fingerprint.hasTouch,
        extraHTTPHeaders: identity.clientHints,
        // Local only (the engine refuses it in hosted mode), recorded above and in the result's warnings.
        ...(options.skipTlsVerification === true ? { ignoreHTTPSErrors: true } : {}),
        ...(this.browserAllowedHosts === undefined ? {} : { serviceWorkers: 'block' as const }),
        // Restore the user's full session state (cookies, localStorage,
        // sessionStorage) when they inherited a storageState blob — the
        // serialized JSON IS the Playwright shape, passed through verbatim.
        ...(this.accessConfig?.session?.storageState ?? amazonPublicState
          ? { storageState: JSON.parse((this.accessConfig?.session?.storageState ?? amazonPublicState)!) }
          : {}),
        // The user's egress, if they supplied one. Note what does NOT change
        // alongside it: the UA, the locale, the timezone, the viewport. A
        // different address is a different route, not a different identity —
        // spoofing the rest is the line this product does not cross.
        ...(this.accessConfig?.proxy
          ? {
              proxy: {
                server: this.access.proxyEndpoint!,
                ...(this.accessConfig.proxy.username === undefined
                  ? {}
                  : { username: this.accessConfig.proxy.username }),
                ...(this.accessConfig.proxy.password === undefined
                  ? {}
                  : { password: this.accessConfig.proxy.password }),
              },
            }
          : this.envProxy === null ? {} : { proxy: this.envProxy.proxy }),
      })
      void pendingContext.then(created => { if (signal?.aborted && created !== this.managedContext) void created.close().catch(() => {}) }, () => {})
      context = await raceWithSignal(pendingContext, signal)
      let deniedResources = 0
      // Requests to ad-serving hosts aborted under blockAds (default true), and the distinct hosts (first 20) for the trace.
      let adsBlocked = 0
      const adHostsBlocked = new Set<string>()
      const allowedHosts = this.browserAllowedHosts === undefined ? null : new Set(this.browserAllowedHosts)
      const blockAds = options.blockAds !== false
      const pageOrigin = new URL(url).origin
      const hasCustomHeaders = Object.keys(customHeaders).length > 0
      // The hosted host allowlist is a route over every request, installed
      // before creating a page so the first navigation of a popup or worker
      // cannot bypass it; an ad host is never on it, and blockAds: false
      // cannot widen it. The handler is kept so the fetch can remove it again:
      // a route left on a context that keeps navigating holds the context's
      // close. The ad hosts are not a route's business: a route pauses every
      // request of the page, and on Linux a page that reloads itself without
      // end then outlived its deadline; they are blocked in Chromium's network
      // layer instead (Network.setBlockedURLs, below), which pauses nothing.
      if (allowedHosts !== null) {
        requestRoute = async route => {
          const request = route.request()
          const target = request.url()
          let allowed = false
          try {
            allowed = hostedBrowserRequestAllowed(target, request.resourceType(), allowedHosts)
            if (allowed) await assertSafeUrl(target, this.networkPolicy)
          } catch { allowed = false }
          if (!allowed) {
            deniedResources++
            await route.abort('blockedbyclient').catch(() => {})
            return
          }
          await route.continue().catch(() => {})
        }
        await context.route(routeMatch, requestRoute)
      }
      if (allowedHosts !== null) {
        // HTTP routes do not intercept WebSocket handshakes. The public
        // preview does not need sockets, so block them before any page runs.
        await context.routeWebSocket('**/*', async ws => { await ws.close({ code: 1008, reason: 'network policy' }) })
      }
      if (amazonPublicState !== null) trace.push({
        at: Date.now() - start, lane: 'browser_local', event: 'anonymous_public_preference_attached',
        detail: { host, stateSha256: sha256Utf8(amazonPublicState) },
      })
      throwIfExecutionStopped(execution)
      // The user's session, if they inherited one to us. Cookies go in through
      // the context API rather than a header so the browser scopes them the
      // way the origin expects.
      const userCookies = this.accessConfig?.session?.cookies ?? []
      if (userCookies.length > 0) {
        // The cookie's own attributes go with it: Chromium refuses a
        // `__Secure-` or `__Host-` cookie without `secure`, and many logins
        // are carried by one.
        await context.addCookies(
          userCookies.map((c) => ({
            name: c.name, value: c.value, domain: c.domain, path: c.path,
            ...(c.expires === undefined || c.expires < 0 ? {} : { expires: c.expires }),
            ...(c.httpOnly === undefined ? {} : { httpOnly: c.httpOnly }),
            ...(c.secure === undefined ? {} : { secure: c.secure }),
            ...(c.sameSite === undefined ? {} : { sameSite: c.sameSite }),
          })),
        )
        trace.push({
          at: Date.now() - start,
          lane: 'browser_local',
          event: 'session_attached',
          // Count and scope only. A trace that printed cookie values would
          // leak the user's account into every bench artifact.
          detail: { cookieCount: userCookies.length, sessionSha256: this.access.sessionSha256 },
        })
      }
      throwIfExecutionStopped(execution)
      const pendingPage = context.newPage()
      void pendingPage.then(created => { if (signal?.aborted) void created.close().catch(() => {}) }, () => {})
      page = await raceWithSignal(pendingPage, signal)
      throwIfExecutionStopped(execution)
      // A context's extra headers reach the requests Playwright makes, not the
      // client hints Chromium generates itself on a redirect hop or for the
      // page's own requests; those come from the browser's user-agent
      // metadata, which the headless shell fills with its own brands. The
      // declared identity's metadata (browserUserAgentMetadata) makes every
      // request carry the declared hints, and navigator.userAgentData agree.
      // The override lives as long as the session that set it (Chromium drops
      // a session's emulation when it detaches), so the session stays open
      // until the page is closed.
      if (identity.device !== undefined || hasCustomHeaders || blockAds) session = await raceWithSignal(context.newCDPSession(page), signal)
      if (blockAds && session !== undefined) {
        // Chromium drops a request to a listed host before any connection
        // (net::ERR_BLOCKED_BY_CLIENT); the page's other requests are not
        // touched. The block lives as long as the session, which stays open
        // until the page is closed. Counted from the page's failed requests.
        await raceWithSignal(session.send('Network.enable'), signal)
        await raceWithSignal(session.send('Network.setBlockedURLs', { urls: this.adHosts.flatMap((host) => [`*://${host}/*`, `*://${host}:*/*`, `*://*.${host}/*`, `*://*.${host}:*/*`]) }), signal)
        const requestUrls = new Map<string, string>()
        session.on('Network.requestWillBeSent', (event: { requestId: string; request: { url: string } }) => { requestUrls.set(event.requestId, event.request.url) })
        session.on('Network.loadingFailed', (event: { requestId: string; blockedReason?: string }) => {
          if (event.blockedReason !== 'inspector') return
          let hostname: string | null = null
          try { hostname = new URL(requestUrls.get(event.requestId) ?? '').hostname } catch { hostname = null }
          if (hostname === null || !isAdHost(hostname, this.adHosts)) return
          adsBlocked++
          if (adHostsBlocked.size < 20) adHostsBlocked.add(hostname.toLowerCase())
        })
      }
      if (identity.device !== undefined && session !== undefined) {
        const chromeMajor = Number.isFinite(major) ? major : CHROME_MAJOR_FLOOR
        const metadata = browserUserAgentMetadata(chromeMajor, identity.device)
        await raceWithSignal(session.send('Emulation.setUserAgentOverride', {
          userAgent: identity.userAgent,
          acceptLanguage: fingerprint.locale,
          platform: identity.device === 'mobile' ? 'Linux armv8l' : 'MacIntel',
          userAgentMetadata: { ...metadata, brands: [...metadata.brands], fullVersionList: [...metadata.fullVersionList] },
        }), signal)
      }
      // The caller's headers, per request and by origin (CustomHeaderGate),
      // installed before the first navigation; the trace names every
      // document of another origin they were kept from.
      if (hasCustomHeaders && session !== undefined) {
        headerGate = new CustomHeaderGate(session, pageOrigin, customHeaders, (to, names) => trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'custom_headers_withheld', detail: { to, names: [...names] } }))
        await raceWithSignal(headerGate.enable(), signal)
      }
      // A file (PDF, CSV, ZIP, ...) starts a download instead of a page: the
      // navigation fails with "Download is starting". Keep the download and
      // the navigation responses, whose headers and request say what came.
      const seen: { download: Download | null; navigations: Response[] } = { download: null, navigations: [] }
      page.on('download', download => { seen.download ??= download })
      page.on('response', navigation => { if (navigation.request().isNavigationRequest()) seen.navigations.push(navigation) })
      // The document the main frame shows, which a script, a meta refresh or
      // the history API can change after the navigation W2L started answered.
      const documents = new MainFrameDocuments(page)
      const shownPage = page
      // Documents loaded when the last wait for stability began: one loaded since has not settled.
      let settledLoads = 0
      const settle = async (maxMs: number) => {
        settledLoads = documents.loads
        await raceWithSignal(waitForRenderedStability(shownPage, { maxMs }), signal)
      }

      // Rate-limit facts are captured at actual navigation, after setup.
      let previousRequestAtMs: number | null = null
      let observedDelayMs: number | null = null
      const requiredDelayMs = this.networkPolicy.perHostMinDelayMs
      let compliant = true

      // Browser-tier retry: the same transport-independent policy the
      // http engine shares (503 only, once, authoritative Retry-After). The
      // runner resets fixture state per subject, so the browser arm
      // genuinely sees flaky attempt 1 and must retry to survive it.
      const MAX_STATUS_RETRIES = 1
      let statusRetries = 0
      let variantFollowups = 0
      let retryWaitMs = 0
      let attemptCount = 0
      let navigationUrl = url
      const requestedAmazonAsin = new URL(url).hostname === 'www.amazon.sg'
        ? /^\/dp\/([A-Z0-9]{10})\/?$/i.exec(new URL(url).pathname)?.[1]?.toUpperCase() ?? null
        : null
      let response: Response | null = null
      for (;;) {
        await this.scheduler.beforeRequest(new URL(navigationUrl).origin, signal, onRequestWait)
        previousRequestAtMs = this.lastRequestAtMsByHost.get(host) ?? null
        const navigationAt = Date.now()
        observedDelayMs = previousRequestAtMs === null ? null : navigationAt - previousRequestAtMs
        compliant &&= observedDelayMs === null || observedDelayMs >= requiredDelayMs
        this.lastRequestAtMsByHost.set(host, navigationAt)
        attemptCount++
        // Navigation waits 20 s at most, or until the deadline when the caller chose it (its timeout).
        const navigationTimeoutMs = remainingTimeout(execution, options.timeout !== undefined && execution.deadlineAt !== undefined ? Number.POSITIVE_INFINITY : 20_000)
        trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'navigate', detail: { url: navigationUrl, attempt: attemptCount, timeoutMs: navigationTimeoutMs } })
        const envProxy = proxyFor(navigationUrl, this.networkPolicy)
        if (envProxy !== null) trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'egress_proxy', detail: { url: navigationUrl, proxy: envProxy.endpoint, source: 'environment' } })
        try {
          documents.restart()
          response = await page.goto(navigationUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs })
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('Download is starting')) throw error
          seen.download ??= await raceWithSignal(page.waitForEvent('download', { timeout: remainingTimeout(execution, 5_000) }), signal)
          trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'download', detail: { url: seen.download.url(), suggestedFilename: seen.download.suggestedFilename() } })
          break
        }
        const status = response?.status() ?? 0
        if (status === 429 || status === 503) {
          const delay = parseRetryAfterMs(response?.headers()['retry-after'] ?? null)
          if (delay !== null) {
            const target = response?.url() ?? url
            const retryAt = Date.now() + delay
            for (const origin of new Set([new URL(navigationUrl).origin, new URL(target).origin])) this.scheduler.cooldown(origin, retryAt)
            execution.onRetryAfter?.(target, retryAt)
          }
        }
        if (isRetryableStatus(status) && statusRetries < MAX_STATUS_RETRIES) {
          const retryAfter = response?.headers()['retry-after'] ?? null
          const delayMs = parseRetryAfterMs(retryAfter) ?? 250
          const retryAt = Date.now() + delayMs
          if (execution.deadlineAt !== undefined && retryAt >= execution.deadlineAt) {
            trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'retry_deferred', detail: { retryAt, delayMs, status } })
            const deferred = this.denied(url, start, trace, new Error('aborted'))
            return { ...deferred, retryAt, evidence: { ...deferred.evidence, httpStatus: status, finalUrl: response?.url() ?? page.url() } }
          }
          trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'retry', detail: { attempt: attemptCount, status, delayMs } })
          statusRetries++
          if (delayMs > 0) {
            const waitStarted = performance.now()
            try { await abortableSleep(delayMs, signal) }
            finally { retryWaitMs += Math.max(0, performance.now() - waitStarted) }
          }
          continue
        }
        await settle(remainingTimeout(execution, 1_500))
        throwIfExecutionStopped(execution)
        if (status === 200 && variantFollowups === 0 && requestedAmazonAsin !== null) {
          const variant = await raceWithSignal(page.evaluate((asin) => ({
            selectedAsin: document.querySelector('input[name="ASIN"]')?.getAttribute('value') ?? null,
            requestedVariantAvailable: Array.from(document.querySelectorAll('li[data-asin]')).some(element =>
              element.getAttribute('data-asin')?.toUpperCase() === asin
              && /swatchAvailable/i.test(element.getAttribute('data-csa-c-content-id') ?? '')),
          }), requestedAmazonAsin), signal)
          const followupUrl = amazonVariantFollowupUrl(url, page.url(), variant.selectedAsin, variant.requestedVariantAvailable)
          if (followupUrl !== null) {
            const followupRobots = this.robotsCache.decision(cachedRobots, followupUrl, identity.userAgent)
            if (followupRobots.decision === 'disallowed') {
              trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'amazon_variant_followup_denied', detail: { url: followupUrl } })
            } else {
              await raceWithSignal(assertSafeUrl(followupUrl, this.networkPolicy), signal)
              variantFollowups++
              navigationUrl = followupUrl
              trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'amazon_variant_followup', detail: { selectedAsin: variant.selectedAsin, requestedAsin: requestedAmazonAsin, url: followupUrl } })
              continue
            }
          }
        }
        break
      }
      throwIfExecutionStopped(execution)
      // A file the page displays is the document it shows now, not necessarily the one W2L navigated to.
      const shownFirst = documents.shown()
      const file = await this.fileAnswer(url, start, trace, execution, options, seen, shownFirst === null ? response : shownFirst.response, documents, attemptCount, (finalUrl, sentHeaders) => this.chain.append({
        recordId: crypto.randomUUID(),
        mode: this.mode,
        requestedUrl: url,
        finalUrl,
        requestedAt: new Date(start).toISOString(),
        robots: robotsForRecord,
        sentHeaders: { headers: sentHeaders },
        rateLimit: { previousRequestAtMs, observedDelayMs, requiredDelayMs, compliant, recentSameHostCount: attemptCount },
        access: this.access,
      }), identity, headerGate)
      if (file !== null) {
        // A file has no page to run steps on: they are reported as not run, never skipped silently.
        if (options.actions !== undefined && options.actions.length > 0) ran.actions = stepsNotRun(options.actions, `the URL answered a file (${file.evidence.contentType ?? 'unknown type'}), which has no page to run steps on`)
        return file
      }
      // waitFor: the caller's extra wait after load and stability. It counts
      // toward the scrape's deadline; when the deadline would end it, the
      // wait stops early enough to capture the page as it is then, and that
      // capture is partial, never success.
      const waitFor = options.waitFor ?? 0
      let waitCutShort = false
      if (waitFor > 0) {
        const waitMs = execution.deadlineAt === undefined ? waitFor : Math.min(waitFor, Math.max(0, execution.deadlineAt - CAPTURE_RESERVE_MS - Date.now()))
        waitCutShort = waitMs < waitFor
        const waitStarted = performance.now()
        if (waitMs > 0) await abortableSleep(waitMs, signal)
        trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'wait_for', detail: { requestedMs: waitFor, waitedMs: Math.round(performance.now() - waitStarted), ...(waitCutShort ? { cutShortBy: 'timeout' } : {}) } })
        throwIfExecutionStopped(execution)
      }
      if (deniedResources > 0) trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'browser_resources_denied', detail: { count: deniedResources } })
      if (adsBlocked > 0) trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'ads_blocked', detail: { count: adsBlocked, hosts: [...adHostsBlocked] } })
      // The request's actions: after load, stability and waitFor, before the
      // screenshot format and the DOM are read, so both show the page the
      // steps left. While they run and until the page is read, a navigation
      // of the main frame goes through robots.txt and the egress policy as
      // the requested URL did, before its request is sent: one W2L does not
      // fetch is stopped there, and the page stays where it was.
      const refusedNavigations: { url: string; reason: string }[] = []
      if (options.actions !== undefined && options.actions.length > 0) {
        const mainFrame = page.mainFrame()
        await page.route('**/*', async (route) => {
          const request = route.request()
          if (!request.isNavigationRequest() || request.frame() !== mainFrame) return route.fallback()
          const reason = await this.refuseNavigation(request.url(), identity, execution, relaxedRoutes).catch((error: unknown) => `it could not be checked (${error instanceof Error ? error.message.slice(0, 120) : String(error)})`)
          if (reason === null) return route.fallback()
          refusedNavigations.push({ url: request.url(), reason })
          trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'navigation_refused', detail: { url: request.url(), reason } })
          // 204 No Content: the browser stays on the page it has (an aborted navigation would show its own error page instead).
          return route.fulfill({ status: 204, body: '' })
        })
        ran.actions = await runPageActions(options.actions, {
          page,
          execution,
          trace,
          at: () => Date.now() - start,
          settle: async (maxMs) => { if (maxMs > 0) await settle(maxMs) },
          reserveMs: CAPTURE_RESERVE_MS,
          deviceScaleFactor: fingerprint.deviceScaleFactor,
          viewport: page.viewportSize() ?? window.viewport,
          takeRefusedNavigation: () => refusedNavigations.shift() ?? null,
        })
        throwIfExecutionStopped(execution)
      }
      // The screenshot format: the page as it stands after load, stability
      // and waitFor, before the DOM is read below, so the image and the
      // capture show the same page. It goes on whatever the rendered page
      // turns out to be (a success, an error page, a gate) as evidence; a
      // capture Chromium cannot make leaves null and a warning, the page kept.
      const capture = options.screenshot === undefined ? null : await captureScreenshot(
        page,
        options.screenshot,
        page.viewportSize() ?? window.viewport,
        fingerprint.deviceScaleFactor,
        execution,
        trace,
        () => Date.now() - start,
        window.issues.length === 0 ? null : `the requested viewport ${options.screenshot.viewport!.width}x${options.screenshot.viewport!.height} does not fit the declared identity: ${window.issues.join('; ')}`,
      )
      throwIfExecutionStopped(execution)
      // The page as it is now, read while no new document loads, so that what
      // is read and the document's response belong together. A document
      // loaded since the last wait for stability (a script or a meta refresh
      // moved the page on) settles first, within the capture reserve.
      let body: string | null = null
      let shown: MainFrameEntry | null = null
      let pageUrl = page.url()
      let steady = false
      for (let attempt = 1; attempt <= CAPTURE_ATTEMPTS && !steady; attempt++) {
        if (documents.loads !== settledLoads) {
          const settleMs = execution.deadlineAt === undefined ? 1_500 : Math.min(1_500, execution.deadlineAt - CAPTURE_RESERVE_MS - Date.now())
          if (settleMs > 0) await settle(settleMs)
          throwIfExecutionStopped(execution)
        }
        const loads = documents.loads
        try {
          body = await raceWithSignal(page.content(), signal)
        } catch (error) {
          if (!isNavigationError(error)) throw error
          continue
        }
        shown = documents.shown()
        pageUrl = page.url()
        steady = documents.loads === loads
      }
      // The document's own response, and the URL it answered (see reported);
      // with nothing committed since the navigation, the navigation's answer.
      const { finalUrl, response: documentResponse } = reported(shown ?? { url: pageUrl, response, kind: 'document' })
      if (finalUrl !== url) {
        try {
          await assertSafeUrl(finalUrl, this.networkPolicy)
        } catch (err) {
          return this.denied(url, start, trace, err)
        }
      }
      if (ran.actions !== undefined) {
        // A navigation stopped after the last step (a late script redirect) is the steps' too.
        const late = refusedNavigations.shift()
        const last = options.actions!.length - 1
        if (late !== undefined && ran.actions.result.failed === undefined) ran.actions.result.failed = { index: last, type: options.actions![last]!.type, code: 'navigation_refused', message: `after the steps, the page tried to go to ${late.url}, which W2L does not fetch (${late.reason}); the page stayed where it was` }
        // The page the steps left, reached through a redirect the guard does not see, is checked as a navigation to it would be.
        const landed = finalUrl === url ? null : await this.refuseNavigation(finalUrl, identity, execution, relaxedRoutes)
        if (landed !== null) {
          trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'navigation_refused', detail: { url: finalUrl, reason: landed } })
          if (ran.actions.result.failed === undefined) ran.actions.result.failed = { index: last, type: options.actions![last]!.type, code: 'navigation_refused', message: `the steps left the page at ${finalUrl}, which W2L does not fetch (${landed}); it is not read` }
          return this.notRead(url, start, trace, finalUrl)
        }
      }
      if (!steady || body === null) return this.keptNavigating(url, start, trace, documents, finalUrl, attemptCount)
      // Status, headers and verdict are the document's own. A document that
      // came without a response (status 0 here) is judged by its content.
      const status = documentResponse?.status() ?? 0
      const documentHeaders = documentResponse?.headers() ?? {}
      // Links and Markdown resolve against the page's URL, the document's base.
      if (pageUrl !== finalUrl && documentResponse !== null) trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'same_document_navigation', detail: { from: finalUrl, to: pageUrl } })
      const fetchedAt = new Date().toISOString()
      if (Buffer.byteLength(body) > this.networkPolicy.maxDecompressedBytes) {
        return this.denied(url, start, trace, new BodyTooLargeError(this.networkPolicy.maxDecompressedBytes))
      }
      const rawBodySha256 = sha256Utf8(body)
      this.onRenderedHtml?.(body, rawBodySha256)
      const rawArtifacts = await captureRawHtml(body, rawBodySha256)
      // The layout the page's CSS gives, as markers on a copy of the body that
      // only extraction and Markdown see; the hash, the raw artifact and the
      // rendered-HTML witness above keep the page as rendered. Without a copy
      // (see the trace's layout event), the body converts by its tags.
      const layout = await captureLayout(page, body, execution.deadlineAt === undefined ? {} : { deadlineAt: execution.deadlineAt - CAPTURE_RESERVE_MS })
      trace.push({ at: Date.now() - start, lane: 'browser_local', event: 'layout', detail: layout.detail })
      const converted = layout.html ?? body
      const wallMs = Date.now() - start
      const browserMs = wallMs
      trace.push({ at: wallMs, lane: 'browser_local', event: 'rendered', detail: { status, attemptCount } })

      // What actually went on the wire, as Playwright saw it, credentials
      // excepted, with the custom headers the gate added (sentHeadersOf): the
      // fact the honesty check compares against, and the record signs.
      const sentHeaders: ComplianceSentHeader[] = sentHeadersOf(headerGate, (documentResponse ?? response)?.request() ?? null)
      const honesty: HonestyVerdict = checkIdentityHonesty(identity, { headers: sentHeaders })
      if (!honesty.honest) {
        trace.push({
          at: wallMs,
          lane: 'browser_local',
          event: 'identity_mismatch',
          detail: { mismatches: honesty.mismatches },
        })
      }

      // The per-fetch compliance record, appended to the run's hash chain so
      // this fetch commits to every fetch before it. The robots facts are the
      // ones actually evaluated above, not a placeholder.
      const record: ComplianceRecord = this.chain.append({
        recordId: crypto.randomUUID(),
        mode: this.mode,
        requestedUrl: url,
        finalUrl,
        requestedAt: new Date(start).toISOString(),
        robots: robotsForRecord,
        sentHeaders: { headers: sentHeaders },
        rateLimit: {
          previousRequestAtMs,
          observedDelayMs,
          requiredDelayMs,
          compliant,
          recentSameHostCount: attemptCount,
        },
        access: this.access,
      })

      const navigation = documents.chain(url, finalUrl)
      const base = {
        requestedUrl: url,
        ...([429, 503].includes(status) ? { retryAt: Date.now() + (parseRetryAfterMs(documentHeaders['retry-after'] ?? null) ?? 250) } : {}),
        truncated: false,
        truncatedAt: null,
        compliance: record,
        // The screenshot asked for, on every result built from this page; its caveat when the capture failed.
        ...(capture === null ? {} : { screenshot: capture.screenshot, ...(capture.warning === undefined ? {} : { warnings: [capture.warning] }) }),
        evidence: {
          finalUrl,
          httpStatus: documentResponse?.status() ?? null,
          redirectChain: navigation.chain,
          redirectChainComplete: navigation.complete,
          contentType: documentHeaders['content-type'] ?? null,
          rawBodySha256,
          artifacts: [...rawArtifacts, ...(capture?.artifacts ?? [])],
          fetchedAt,
          ...(this.networkPolicy.egressProxy ? { envProxy: proxyFor(finalUrl, this.networkPolicy)?.endpoint ?? null } : {}),
        },
        usage: {
          wallMs,
          // This is rendered DOM content, not measured network traffic.
          bytesWire: null,
          bytesDecompressed: Buffer.byteLength(body),
          requestCount: attemptCount,
          attemptCount,
          statusRetryCount: statusRetries,
          navigationFollowupCount: variantFollowups,
          contentTokens: null as number | null,
          browserMs,
          externalCostUsd: null,
          timings: {retryWaitMs,totalMs:wallMs},
        },
        trace,
      }

      // Gate classification on the rendered DOM. Non-contentful paths use the
      // full classifier; a contentful 200 still consults decisive challenge
      // evidence so a 200 interstitial with extractable prose is not success.
      const gate = classifyGate({
        status,
        header: (name) => documentHeaders[name.toLowerCase()] ?? null,
        body,
      })
      // An error status is never content, but its page is what the server
      // said: the failed or blocked result keeps it as evidence.
      const errorPage = errorPageEvidence(status, documentHeaders['content-type'] ?? null, converted, pageUrl, options)
      const errorPageFields = { markdown: errorPage?.markdown ?? null, ...(errorPage === null ? {} : { links: errorPage.links }) }
      const blocked = (verdict: NonNullable<typeof gate>): FetchResult => {
        const next = escalationForBlock(verdict.reason, 'browser_local')
        trace.push({
          at: wallMs,
          lane: 'browser_local',
          event: 'gate_detected',
          detail: { blockReason: verdict.reason, signals: verdict.signals, status },
        })
        return {
          ...base,
          status: 'blocked',
          failureReason: null,
          blockReason: verdict.reason,
          budgetExceeded: null,
          lane: 'browser_local',
          escalations: next === null ? [] : [{ ...next, improved: null }],
          ...errorPageFields,
        }
      }

      const nonOk = status !== 200 && status !== 0
      if (nonOk && gate !== null) {
        return blocked(gate)
      }
      if (nonOk && !isSuccessStatus(status)) {
        return {
          ...base,
          status: 'failed',
          failureReason: 'http_error',
          blockReason: null,
          budgetExceeded: null,
          lane: 'browser_local',
          escalations: [],
          ...errorPageFields,
        }
      }
      if (isNoContentStatus(status)) {
        return {
          ...base,
          status: 'empty_verified',
          failureReason: null,
          blockReason: null,
          budgetExceeded: null,
          lane: 'browser_local',
          escalations: [],
          markdown: null,
        }
      }

      const extracted = extractTf.extract(converted, { url: pageUrl, pruneSelectors: options.excludeTags, includeSelectors: options.includeTags, blockAds: options.blockAds })
      const links = collectLinks(body, pageUrl)
      trace.push({
        at: wallMs,
        lane: 'browser_local',
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

      // No main content: the whole rendered page stays on the failed result
      // as evidence, never content. onlyMainContent: false asks for the whole
      // page, not the main content, so there it is the answer; so is what
      // includeTags names, on any page that is not blocked.
      let wholePage: string | null = null
      if (extracted.escalate && gate !== null) return blocked(gate)
      if (extracted.escalate && !selectionAsked(options)) {
        wholePage = wholePageMarkdown(converted, pageUrl, options)
        // A page captured before its wait ended is not proven empty: the
        // deadline, not the page, is the reason there is no content.
        if (options.onlyMainContent !== false || wholePage === null) return {
          ...base,
          status: 'failed',
          failureReason: waitCutShort ? 'timeout' : 'empty_unverified',
          blockReason: null,
          budgetExceeded: null,
          lane: 'browser_local',
          escalations: [],
          markdown: wholePage,
          ...(wholePage === null ? {} : { links }),
          ...(waitCutShort ? { usage: { ...base.usage, deadlineExceeded: true } } : {}),
        }
      }

      const decisive = classifyGate({
        status,
        header: (name) => documentHeaders[name.toLowerCase()] ?? null,
        body,
        contentful: true,
      })
      if (decisive !== null) return blocked(decisive)

      // onlyMainContent: false emits the whole rendered page (header,
      // navigation and footer kept) through the same converter and base URL.
      const markdown = wholePageAsked(options)
        ? wholePage ?? htmlToMarkdown(converted, { baseUrl: pageUrl, exclude: options.excludeTags, ...markdownOptions(options) })
        : htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl, ...markdownOptions(options) })
      // The images and attributes formats read the rendered DOM as received, like links.
      const extra = extraFormats(body, pageUrl, options, trace, 'browser_local', wallMs)
      // The tables format reads what the Markdown was written from, with the same options.
      const tables = tablesFormat(wholePageAsked(options)
        ? { html: converted, options: { baseUrl: pageUrl, exclude: options.excludeTags, ...markdownOptions(options) } }
        : { html: extracted.mainHtml, options: { baseUrl: extracted.baseUrl, ...markdownOptions(options) } }, pageUrl, options, trace, 'browser_local', wallMs)
      return {
        ...base,
        status: waitCutShort ? 'partial' : 'success',
        failureReason: null,
        blockReason: null,
        budgetExceeded: null,
        lane: 'browser_local',
        escalations: [],
        markdown,
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
        // rawHtml is the page as rendered; html comes from the copy extraction read, without its layout markers.
        ...htmlFormats(body, converted, extracted.mainHtml, options),
        usage: { ...base.usage, contentTokens: estimateTokens(markdown), ...(waitCutShort ? { deadlineExceeded: true } : {}) },
      }
    } catch (err) {
      const wallMs = Date.now() - start
      // Playwright surfaces deadline misses as TimeoutError; map them to the
      // contract's timeout reason so the timeout fixtures match. Chromium
      // stops following redirects after 20, a loop included, and reports a
      // certificate or handshake failure as net::ERR_CERT_* / net::ERR_SSL_*,
      // a fact about the host (tls_error). Every other navigation failure is
      // a connection_error.
      const reason = signal?.aborted || err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timeout'
        : err instanceof Error && err.name === 'SsrfDeniedError' ? 'policy_denied'
          : err instanceof Error && (err.name === 'DnsLookupError' || err.message.includes('net::ERR_NAME_NOT_RESOLVED')) ? 'dns_error'
            : err instanceof Error && err.message.includes('net::ERR_TOO_MANY_REDIRECTS') ? 'redirect_limit'
              : err instanceof Error && (err.message.includes('net::ERR_CERT_') || err.message.includes('net::ERR_SSL_')) ? 'tls_error'
                : 'connection_error'
      trace.push({
        at: wallMs,
        lane: 'browser_local',
        event: 'navigate_failed',
        detail: { error: err instanceof Error ? err.message.slice(0, 200) : String(err) },
      })
      return {
        requestedUrl: url,
        status: 'failed',
        failureReason: reason,
        blockReason: null,
        budgetExceeded: null,
        lane: 'browser_local',
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
          requestCount: 1,
          attemptCount: 1,
          contentTokens: null,
          browserMs: wallMs,
          externalCostUsd: null,
        },
        trace,
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
      if (page !== undefined) await closePage(page)
      await session?.detach().catch(() => {})
      // The route goes before the context does: Chromium can leave a request
      // of a page that keeps navigating paused in the handler, and a close
      // that waited for it would not end (the refresh-loop case).
      if (context !== undefined && requestRoute !== null) await context.unroute(routeMatch, requestRoute).catch(() => {})
      if (context !== this.managedContext && context !== undefined) await closeWithin(context.close(), PAGE_CLOSE_MS)
      await relaxedRoutes?.close()
    }
  }

  /**
   * The answer for a file (see fileResult.ts) the navigation downloaded, or
   * displays in place of a page (JSON, plain text, a PDF in a headed
   * browser): the bytes the browser received, saved as received. Null when
   * the navigation is a web page after all. `response` answered the document
   * the page shows.
   */
  private async fileAnswer(
    url: string,
    start: number,
    trace: TraceEvent[],
    execution: ExecutionContext,
    options: FetchOptions,
    seen: { download: Download | null; navigations: readonly Response[] },
    response: Response | null,
    documents: MainFrameDocuments,
    attemptCount: number,
    mint: (finalUrl: string, sentHeaders: ComplianceSentHeader[]) => ComplianceRecord,
    identity: Parameters<typeof checkIdentityHonesty>[0],
    headerGate: CustomHeaderGate | null,
  ): Promise<FetchResult | null> {
    const { download } = seen
    const navigation = download === null ? response : [...seen.navigations].reverse().find(item => item.url() === download.url()) ?? null
    const status = navigation?.status() ?? null
    const headers = navigation?.headers() ?? {}
    const contentType = headers['content-type'] ?? null
    const declared = classifyContentType(contentType)
    // Displayed rather than downloaded: only a response whose type names a file (or a type W2L does not read) is one.
    if (download === null && (navigation === null || !isSuccessStatus(status) || isNoContentStatus(status) || typeof declared !== 'object' && declared !== 'unsupported')) return null
    const finalUrl = download?.url() ?? navigation!.url()
    if (finalUrl !== url) await raceWithSignal(assertSafeUrl(finalUrl, this.networkPolicy), execution.signal)
    // A download commits no document: its navigation's hops end the chain.
    const hops = documents.chain(url, finalUrl, download === null ? null : navigation)
    const at = () => Date.now() - start
    const maxBytes = fileByteCap(this.networkPolicy, options.maxFileBytes)
    const declaredBytes = declaredLength(headers['content-length'])
    const base = (): Omit<FetchResult, 'status' | 'failureReason'> => {
      // What went on the wire, as Playwright saw it, credentials excepted, with what the gate added, checked and signed as for a page.
      const sentHeaders: ComplianceSentHeader[] = sentHeadersOf(headerGate, navigation?.request() ?? null)
      const honesty: HonestyVerdict = checkIdentityHonesty(identity, { headers: sentHeaders })
      if (!honesty.honest) trace.push({ at: at(), lane: 'browser_local', event: 'identity_mismatch', detail: { mismatches: honesty.mismatches } })
      return {
        requestedUrl: url,
        blockReason: null,
        budgetExceeded: null,
        lane: 'browser_local',
        escalations: [],
        markdown: null,
        links: [],
        truncated: false,
        truncatedAt: null,
        compliance: mint(finalUrl, sentHeaders),
        evidence: {
          finalUrl,
          httpStatus: status,
          redirectChain: hops.chain,
          redirectChainComplete: hops.complete,
          contentType,
          rawBodySha256: null,
          artifacts: [],
          fetchedAt: new Date().toISOString(),
          ...(this.networkPolicy.egressProxy ? { envProxy: proxyFor(finalUrl, this.networkPolicy)?.endpoint ?? null } : {}),
        },
        // The file's bytes are counted; what crossed the wire (compressed) is not measured.
        usage: { wallMs: at(), bytesWire: null, bytesDecompressed: 0, requestCount: attemptCount, attemptCount, contentTokens: null, browserMs: at(), externalCostUsd: null },
        trace,
      }
    }
    const unsupported = (): FetchResult => {
      trace.push({ at: at(), lane: 'browser_local', event: 'unsupported_content_type', detail: { contentType, download: download !== null } })
      return { ...base(), status: 'failed', failureReason: 'unsupported_content_type' }
    }
    const tooLarge = (error: BodyTooLargeError): FetchResult => {
      const file = typeof declared === 'object' ? fileTooLarge({ decision: { kind: declared.kind, detectedBy: 'content_type' }, contentType, declaredBytes: error.declaredBytes, maxBytes }, { lane: 'browser_local', trace, at }) : undefined
      if (file === undefined) trace.push({ at: at(), lane: 'browser_local', event: 'file_too_large', detail: { kind: null, declaredBytes: error.declaredBytes, maxBytes } })
      return { ...base(), status: 'failed', failureReason: 'body_too_large', ...(file === undefined ? {} : { file }) }
    }
    if (declared === 'unsupported') {
      await download?.cancel().catch(() => {})
      return unsupported()
    }
    let bytes: Uint8Array
    try {
      if (declaredBytes !== null && declaredBytes > maxBytes) throw new BodyTooLargeError(maxBytes, declaredBytes)
      if (download !== null) {
        bytes = await raceWithSignal(download.createReadStream().then(stream => readCappedBody(stream, maxBytes)), execution.signal)
      } else {
        bytes = new Uint8Array(await raceWithSignal(navigation!.body(), execution.signal))
        if (bytes.byteLength > maxBytes) throw new BodyTooLargeError(maxBytes)
      }
    } catch (error) {
      if (!(error instanceof BodyTooLargeError)) throw error
      await download?.cancel().catch(() => {})
      return tooLarge(error)
    }
    const decision = detectFile(contentType, bytes, responseFileName(finalUrl, headers['content-disposition'] ?? null))
    if (decision === null && download === null) return null
    if (decision === null || decision === 'unsupported') return unsupported()
    const content = await readFileResponse({ decision, contentType, declaredBytes, maxBytes }, bytes, { lane: 'browser_local', store: this.fileStore, ...(execution.deadlineAt === undefined ? {} : { deadlineAt: execution.deadlineAt }), trace, at, ...(options.parsers === undefined ? {} : { parsers: options.parsers }) })
    const answered = base()
    return {
      ...answered,
      status: content.status,
      failureReason: content.failureReason,
      markdown: content.markdown,
      file: content.file,
      ...(content.pages === undefined ? {} : { pages: content.pages }),
      evidence: { ...answered.evidence, rawBodySha256: content.rawBodySha256, artifacts: content.artifacts },
      usage: { ...answered.usage, bytesDecompressed: bytes.byteLength, contentTokens: content.contentTokens, ...(content.deadlineExceeded ? { deadlineExceeded: true } : {}) },
    }
  }

  /**
   * A page that loaded a new document during every read (a client-side
   * redirect loop, a meta refresh to itself): what was read cannot be paired
   * with a response, so nothing is delivered and no status is claimed. The
   * chain shows where it went.
   */
  private keptNavigating(url: string, start: number, trace: TraceEvent[], documents: MainFrameDocuments, finalUrl: string, attemptCount: number): FetchResult {
    const wallMs = Date.now() - start
    const navigation = documents.chain(url, finalUrl)
    trace.push({ at: wallMs, lane: 'browser_local', event: 'page_kept_navigating', detail: { reads: CAPTURE_ATTEMPTS, documentsLoaded: documents.loads, finalUrl } })
    return {
      requestedUrl: url,
      status: 'failed',
      failureReason: 'redirect_loop',
      blockReason: null,
      budgetExceeded: null,
      lane: 'browser_local',
      escalations: [],
      markdown: null,
      truncated: false,
      truncatedAt: null,
      compliance: null,
      evidence: {
        finalUrl,
        httpStatus: null,
        redirectChain: navigation.chain,
        redirectChainComplete: navigation.complete,
        contentType: null,
        rawBodySha256: null,
        artifacts: [],
        ...(this.networkPolicy.egressProxy ? { envProxy: proxyFor(finalUrl, this.networkPolicy)?.endpoint ?? null } : {}),
      },
      usage: { wallMs, bytesWire: null, bytesDecompressed: 0, requestCount: attemptCount, attemptCount, contentTokens: null, browserMs: wallMs, externalCostUsd: null },
      trace,
    }
  }

  /** Why W2L would not fetch this URL as a navigation of the page (the egress policy, robots.txt under the page's identity), or null when it would. */
  private async refuseNavigation(target: string, identity: { respectsRobots: boolean; userAgent: string }, execution: ExecutionContext, relaxedRoutes: EgressRoutes | null): Promise<string | null> {
    if (!/^https?:/i.test(target)) return null
    try {
      await assertSafeUrl(target, this.networkPolicy)
    } catch (error) {
      return `the egress policy refuses it: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`
    }
    if (!identity.respectsRobots) return null
    const lookup = await this.robotsCache.lookup(target, identity.userAgent, execution, relaxedRoutes === null ? undefined : (to) => relaxedRoutes.dispatcherFor(to))
    const verdict = this.robotsCache.decision(lookup, target, identity.userAgent)
    if (verdict.decision !== 'disallowed') return null
    return verdict.unreachable === undefined ? `robots.txt (${verdict.robotsUrl}) disallows it` : `its robots.txt could not be read (${verdict.unreachable})`
  }

  /** A page the steps left at a URL W2L does not fetch: nothing of it is read, and the actions say why. */
  private notRead(url: string, start: number, trace: TraceEvent[], finalUrl: string): FetchResult {
    return {
      requestedUrl: url,
      status: 'failed',
      failureReason: 'action_failed',
      blockReason: null,
      budgetExceeded: null,
      lane: 'browser_local',
      escalations: [],
      markdown: null,
      truncated: false,
      truncatedAt: null,
      compliance: null,
      evidence: { finalUrl, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
      usage: { wallMs: Date.now() - start, bytesWire: 0, bytesDecompressed: 0, requestCount: 1, attemptCount: 1, contentTokens: null, browserMs: Date.now() - start, externalCostUsd: null },
      trace,
    }
  }

  private denied(
    url: string,
    start: number,
    trace: TraceEvent[],
    err: unknown,
    failureReason: FetchResult['failureReason'] = 'policy_denied',
  ): FetchResult {
    const wallMs = Date.now() - start
    const reason = err instanceof Error && err.message === 'aborted'
      ? 'timeout'
      : err instanceof Error && err.name === 'BodyTooLargeError'
        ? 'body_too_large'
        : err instanceof Error && err.name === 'DnsLookupError'
          ? 'dns_error'
          : failureReason
    trace.push({
      at: wallMs,
      lane: 'browser_local',
      event: reason === 'body_too_large' ? 'body_too_large' : reason === 'timeout' ? 'cancelled' : reason === 'dns_error' ? 'dns_failed' : 'ssrf_denied',
      detail: { error: err instanceof Error ? err.message.slice(0, 200) : String(err) },
    })
    return {
      requestedUrl: url,
      status: 'failed',
      failureReason: reason,
      blockReason: null,
      budgetExceeded: null,
      lane: 'browser_local',
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
        browserMs: wallMs,
        externalCostUsd: null,
      },
      trace,
    }
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  }

  private async getBrowser(execution: ExecutionContext): Promise<Browser> {
    throwIfExecutionStopped(execution)
    if (this.browser !== null) return this.browser
    if (this.browserPromise === null) {
      // Startup belongs to the shared subject. Each caller has its own budget;
      // one short caller must not set the launch deadline for another monitor.
      const launch = async (): Promise<Browser> => {
        const args = this.browserAllowedHosts === undefined ? [] : [
          // Direct connections keep resolution inside Chromium, where the
          // validated host rules apply. A proxy would resolve hosts itself.
          '--proxy-server=direct://',
          `--host-resolver-rules=${await pinnedBrowserHostRules(this.browserAllowedHosts, this.networkPolicy)}`,
        ]
        if (this.activeExecutions === 0) throw new DOMException('Browser startup abandoned', 'AbortError')
        // Never the operating system's proxy: the environment proxy when W2L
        // uses one, otherwise direct (a user's proxy is set per context).
        return chromium.launch({ headless: !this.headed, timeout: 30_000, ...(args.length === 0 ? chromiumProxyLaunchOptions(this.envProxy) : { args }) })
      }
      const pending = launch().then(async browser => {
        if (this.activeExecutions === 0) {
          if (this.browserPromise === pending) this.browserPromise = null
          await browser.close().catch(() => {})
          throw new DOMException('Browser startup abandoned', 'AbortError')
        }
        this.browser = browser
        return browser
      }).catch(error => {
        if (this.browserPromise === pending) this.browserPromise = null
        throw error
      })
      this.browserPromise = pending
    }
    return this.browserPromise
  }

  private async getManagedContext(execution: ExecutionContext): Promise<BrowserContext> {
    throwIfExecutionStopped(execution)
    if (this.managedContext !== null) return this.managedContext
    if (this.managedContextPromise === null) {
      const pending = chromium.launchPersistentContext(this.managedProfileDir!, { headless: !this.headed, timeout: 30_000, ...chromiumProxyLaunchOptions(this.envProxy) })
        .then(async context => {
          if (this.activeExecutions === 0) {
            if (this.managedContextPromise === pending) this.managedContextPromise = null
            await context.close().catch(() => {})
            throw new DOMException('Managed browser startup abandoned', 'AbortError')
          }
          this.managedContext = context
          return context
        })
        .catch(error => { if (this.managedContextPromise === pending) this.managedContextPromise = null; throw error })
      this.managedContextPromise = pending
    }
    return this.managedContextPromise
  }

  async teardown(): Promise<void> {
    if (this.managedContextPromise !== null && this.managedContext === null) await this.managedContextPromise.catch(() => {})
    await this.managedContext?.close().catch(() => {})
    this.managedContext = null
    this.managedContextPromise = null
    const pending = this.browserPromise
    if (pending !== null && this.browser === null) await pending.catch(() => {})
    await this.browser?.close().catch(() => {})
    this.browser = null
    this.browserPromise = null
    await this.robotsCache.teardown()
  }
}

/**
 * A result of a fetch that ran the request's actions: what they produced,
 * and their files among the evidence's artifacts. When a step failed, a page
 * read as content is `failed` with `action_failed`, its content kept as the
 * page stood: it is not the page the steps were to reach. A page that was
 * not content anyway (blocked, failed) keeps its own verdict.
 */
function withActions(result: FetchResult, ran: ActionRun | undefined): FetchResult {
  if (ran === undefined) return result
  const failed = ran.result.failed !== undefined && CONTENTFUL_STATUS.has(result.status)
  return {
    ...result,
    actions: ran.result,
    ...(failed ? { status: 'failed' as const, failureReason: 'action_failed' as const, blockReason: null } : {}),
    evidence: { ...result.evidence, artifacts: [...result.evidence.artifacts, ...ran.artifacts] },
  }
}

/** Steps that could not run on the page at all, reported as the first one failing. */
function stepsNotRun(actions: readonly PageAction[], why: string): ActionRun {
  return { result: { screenshots: [], scrapes: [], javascriptReturns: [], pdfs: [], failed: { index: 0, type: actions[0]!.type, code: 'action_error', message: why } }, artifacts: [] }
}
