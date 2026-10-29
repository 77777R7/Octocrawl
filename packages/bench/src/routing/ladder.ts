/**
 * The escalation ladder: HTTP → local browser → cloud vendor(s) →
 * user-authorized session → human handoff.
 *
 * One fetch request, tried across channels in policy-permitted order, until a
 * channel returns contentful or the ladder runs out of escalation. The audit
 * trail is `LadderRunResult.channelsTried` — the ladder does not mutate the
 * subject's result objects; a result is the subject's record and stays that
 * subject's record.
 *
 * The ladder does NOT decide policy — governance (http-core/governance.ts)
 * decides which channels are permitted for a URL; the ladder only walks what
 * it is given, in the order it is given it. A challenge page is never
 * contentful: a channel that returns a block with an empty body classifies as
 * bot_gate/captcha_required/... and escalates; a block that somehow returned
 * content is caught by the false-success checks upstream.
 */

import type { CaptchaSolveLog, EvidenceAccessGrant, EvidencePaidCall, ExecutionContext, PaidCallRecord, PaidCallState, SpendLedger, Escalation, FetchOptions, FetchResult, FetchWarning, HandoffRequest, IdentityBundle, Lane, LadderAttempt, LadderExecutionSummary, Meter, ReadinessState, RobotsOverrideApplied, SpendReservation, TraceEvent, Verification, VerifyContract } from '@w2l/contracts'
import { carryPaidCalls, CONTENTFUL_STATUS, identityBundleIssues, QUALITY_ESCALATION_MAX_CONFIDENCE, RENDERED_LOW_YIELD_MAX_TOKENS, undecidedCheck } from '@w2l/contracts'
import {
  createExecutionScope,
  createSpendLedger,
  raceWithSignal,
  throwIfExecutionStopped,
  classifyFetchFailure,
  evaluateGovernance,
  LADDER_CONTINUES_FAILURE_CLASS,
  type CrawlPolicy,
  type RoutingFailureClass,
} from '@w2l/http-core'
import { contractSha256, readinessOf, ROUTE_VERIFIER_VERSION, verify } from '@w2l/runtime'
import { EXTRACTOR_VERSION } from '@w2l/extract-tf'
import { createHash } from 'node:crypto'
import { BROWSER_INSTALL_COMMAND } from '../browserInstall.js'
import { INSTALLED_CHROME_INSTALL } from '../subjects/installedChrome.js'
import type { DomainHistory, RouteContext, RouteEnvironment, RouteObservation, RoutingHistory, VendorOutcome } from './vendorRouter.js'
import { rankVendors, shadowRankVendors, startingVendor } from './vendorRouter.js'
import { identityCompromised } from './identity.js'
import { decideNext, ladderActionDecisionEvent, type ActionDecision, type LadderAction } from './decideNext.js'
import { loadSessionForHost, sessionCoversHost, type SessionSnapshot, type SessionStore } from './sessionStore.js'

/** One attempt of the run: the rung that answered, its place in the run, when it was asked and answered. */
function attemptOf(channel: Channel, id: string, result: FetchResult, ordinal: number, startedAt: string): LadderAttempt {
  return { channel: id, result, ordinal, startedAt, endedAt: new Date().toISOString(), ...(channel.vendorId === undefined ? {} : { vendorId: channel.vendorId }) }
}

/** The rungs of the http lane: undici's, and the browser-compatible transport's (ADR 0005 `compatible_transport`). */
export const HTTP_CHANNELS: ReadonlySet<string> = new Set(['http', 'http_compat'])

/** One channel: a lane implementation the ladder can try. */
export interface Channel {
  /** Lane id, e.g. 'http', 'browser_local', 'provider'. */
  id: string
  /** Vendor id for provider channels, so history can attribute outcomes. */
  vendorId?: string
  /**
   * Declared L0 identity for this rung. Product channels always set a
   * coherent bundle. Missing or contradictory → the ladder refuses to
   * fetch; it does not try a different fake identity.
   */
  readonly identity?: IdentityBundle
  /**
   * Whether this rung honours FetchOptions.waitFor: it runs scripts and
   * waits before capture. A request with waitFor skips rungs without it.
   */
  readonly waitsFor?: boolean
  /**
   * Whether this rung takes this URL; absent means every URL. A rung that does not is left out of
   * the run as if it were not configured (the API engine keeps `http` or `http_compat` per host).
   */
  serves?(url: string, options: FetchOptions): boolean
  /**
   * Why this rung does not take this URL with these options, or null when it does; preferred over `serves` when both
   * are set. The ladder records it (`ladder_channel_not_served`), so a run says why a rung never ran.
   */
  refusal?(url: string, options: FetchOptions): string | null
  /**
   * Run the channel against url, optionally with a user session attached. A
   * channel that sets a robots.txt rule aside (`options.robotsOverride`) says
   * so through `execution.onRobotsOverride` before its request goes out.
   */
  fetch(url: string, session?: SessionSnapshot | null, execution?: ExecutionContext, options?: FetchOptions): Promise<FetchResult>
  /**
   * A provider rung's price ceiling for one call, in US dollars (ROADMAP PA item 4): what the run's spend ledger reserves
   * before the call. Null: no ceiling is known (no tariff in the grant), and the rung is not called. Absent on the local rungs.
   */
  readonly priceCeilingUsd?: number | null
  /** The access grant a provider rung is called under, as its paid calls' record names it. */
  readonly grant?: EvidenceAccessGrant
  /** The ADR 0005 capabilities a provider rung's sessions are created with, for its paid calls' record. */
  readonly grantCapabilities?: readonly string[]
  /** Which tariff priced `priceCeilingUsd` (a hash of it), for the paid call's row; absent when not known. */
  readonly tariffVersion?: string
  /**
   * Asked each time the rung is about to run, before anything is reserved for it: an operator's own limits on the rung
   * (ADR 0005 hosted_chrome's D5 counter). A refusal leaves the rung out of this run as if it had not been reached: the
   * trace says why (`ladder_channel_skipped`), the result carries the refusal's warning, and the earlier rung's answer
   * stands. An admitted call is settled once, with what the rung read (null when it threw), and whether its call went
   * out. Absent: the rung runs whenever it is reached.
   */
  admit?(url: string, execution: ExecutionContext): Promise<ChannelAdmission>
  /** Release the channel's resources (browser processes, vendor sessions).
   *  The owner of the channel list calls this when the run is over. */
  close?(): Promise<void>
}

/** A rung's answer to `Channel.admit`. */
export type ChannelAdmission =
  | { ok: true; settle(result: FetchResult | null, called: boolean): Promise<void> }
  | { ok: false; reason: string; warning: FetchWarning; detail?: Readonly<Record<string, unknown>> }

/** The human in the loop. Called exactly when a result asks for takeover. */
export interface HumanHandoff {
  /**
   * Present the live view / instructions to a human and wait. Resolve with
   * the session they produced (saved and reused for the retry), or null to
   * abort the attempt.
   */
  takeOver(url: string, request: HandoffRequest, execution?: ExecutionContext): Promise<SessionSnapshot | null>
}

export interface LadderRunResult {
  /** The final result — from the winning channel or the last refusal. */
  result: FetchResult
  /** Channel ids tried, in order. The audit trail of this escalation. */
  channelsTried: readonly string[]
  /** Set when the ladder paused for a human. */
  handoffRequested: boolean
  /**
   * One event per ladder step: which channel ran, under which vendor, what
   * the result was, and (when it escalated) why. This is the ladder's OWN
   * audit — it is printed by the CLI and returned to the caller, but it is
   * NOT part of the signed compliance record: the signed record covers the
   * winning subject's own fetch facts, and the ladder cannot rewrite those.
   * The two are delivered side by side; nothing here claims they are one.
   */
  ladderTrace: readonly { at: number; event: string; channel: string; detail: Record<string, unknown> }[]
  summary: LadderExecutionSummary
}

/** What one run has done so far; the deadline path reads it when the run is cut short. */
interface LadderProgress {
  startedAt: number
  channelsTried: string[]
  ladderTrace: LadderRunResult['ladderTrace'][number][]
  attempts: LadderAttempt[]
  /** What each rung reported when it set a robots.txt rule aside under the run's recorded override. */
  robotsOverrides: RobotsOverrideApplied[]
  /** What the spend ledger charged this run's paid calls, a call that threw or was cut included; null: none was charged. */
  charged: number | null
  /** Each call the ledger settled, numbered in order (`call`, as its `spend_settled` event names it), for the answer's record. */
  paidCalls: (Omit<EvidencePaidCall, 'answer'> & { call: number })[]
  /** The grant the paid calls were made under; null until one is made. */
  grant: EvidenceAccessGrant | null
  /** The run's own ledger, with no cap, when the caller gave none: every provider call is still settled and recorded. */
  ledger: SpendLedger | null
  /** CAPTCHA solves attempted for this page, by every rung and retry: charged, or refused before a task (ADR 0005 third_party_captcha_solver). */
  solves: number
  /** The last page the ladder stepped past for a stronger rung (strongerRungMayAnswer), kept over a later failure with none. */
  steppedPast: { channel: string; result: FetchResult } | null
  /**
   * The shadow decision (decideNext, PA F4) on the last rung that answered, written as `ladder_action_decision` once
   * the ladder's own action is known: the next rung starting (`next_rung`, or `keep_591_fallback` for #591's fallback),
   * the run ending (`stop`) or a handoff (`handoff`). It drives nothing.
   */
  pendingDecision?: { channel: string; at: number; decision: ActionDecision } | null
  /** The warnings of the rungs whose own admission refused them (Channel.admit), for the answer. */
  notAdmitted: FetchWarning[]
}

/** A run's totals over its attempts: what every lane tried cost, each attempt kept as it was. */
export function summarize(channelsTried: readonly string[], attempts: readonly { channel: string; result: FetchResult }[]): LadderExecutionSummary {
  const cost: Meter = {
    knownSubtotal: attempts.reduce((sum, item) => sum + (item.result.usage.externalCostUsd ?? 0), 0),
    unknown: attempts.some(({ result }) => result.usage.externalCostUsd === null),
  }
  const tokens: Meter = {
    knownSubtotal: attempts.reduce((sum, item) => sum + (item.result.usage.contentTokens ?? 0), 0),
    unknown: attempts.some(({ result }) => result.usage.contentTokens === null),
  }
  const costKnown = attempts.every(({ result }) => result.usage.externalCostUsd !== null)
  return {
    channelsTried,
    attempts,
    wallMs: attempts.reduce((sum, item) => sum + item.result.usage.wallMs, 0),
    browserMs: attempts.reduce((sum, item) => sum + item.result.usage.browserMs, 0),
    bytesWire: attempts.every(({ result }) => result.usage.bytesWire !== null)
      ? attempts.reduce((sum, item) => sum + (item.result.usage.bytesWire ?? 0), 0)
      : null,
    bytesDecompressed: attempts.reduce((sum, item) => sum + item.result.usage.bytesDecompressed, 0),
    requestCount: attempts.reduce((sum, item) => sum + item.result.usage.requestCount, 0),
    attemptCount: attempts.reduce((sum, item) => sum + item.result.usage.attemptCount, 0),
    contentTokens: attempts.every(({ result }) => result.usage.contentTokens !== null)
      ? attempts.reduce((sum, item) => sum + (item.result.usage.contentTokens ?? 0), 0)
      : null,
    externalCostUsd: costKnown
      ? attempts.reduce((sum, item) => sum + (item.result.usage.externalCostUsd ?? 0), 0)
      : null,
    externalCost: cost,
    contentTokenMeter: tokens,
    artifacts: attempts.flatMap((item) => item.result.evidence.artifacts),
  }
}

/**
 * Whether a result is asking to escalate: the subject itself flagged the
 * escalation (escalations carries an unresolved hop) or — the quality case —
 * a successful HTTP extraction was thin and low-confidence, or read as a
 * client-rendered shell. The ladder honours the subject's own ask rather
 * than re-deriving it.
 */
/**
 * A failure with no routing class that a stronger rung may still answer (ROADMAP PA item 4): a 403 or 405 answered
 * without a gate Octocrawl recognises (a site's bot defence often answers so), a page a browser rendered with no main
 * content it could verify, and on an http rung a refused connection (a defence that drops a client by its TLS does so;
 * the browser is another client, and a paid provider is not asked for a network failure). On a browser rung a refused
 * connection goes on only to a free rung next, the installed Chrome: another client on the same exit, so neither egress
 * nor identity changes (ADR 0005), and a provider is still not asked (K3). Not a general timeout: the bounded
 * initial-header exception is separate. Nor a rate limit, which asks for fewer requests
 * rather than another client; nor an error status that is the page's own answer (404, 410, 5xx). Null when the failure
 * stands; else what the ladder steps up for.
 */
function strongerRungMayAnswer(result: FetchResult, channelId: string, next: Channel | null): string | null {
  if (result.status !== 'failed') return null
  const status = result.evidence.httpStatus
  if (result.failureReason === 'http_error' && (status === 403 || status === 405)) return `http_${status}`
  if (result.failureReason === 'empty_unverified' && !HTTP_CHANNELS.has(channelId)) return 'empty_unverified'
  if (result.failureReason === 'connection_error' && HTTP_CHANNELS.has(channelId)) return 'connection_error'
  if (result.failureReason === 'connection_error' && next?.id === 'installed_chrome' && next.vendorId === undefined) return 'connection_error'
  return null
}

/**
 * The longest origin cooldown the ladder waits for to climb past a challenge served with 429 or 503, and the time it
 * leaves the next rung after it. The challenges K1 met came with none (the 250 ms default); a site's longer Retry-After
 * is honoured by stopping.
 */
const CHALLENGE_COOLDOWN_MAX_MS = 5_000

/** A single local fallback gets a full, bounded navigation budget; never an unbounded timeout retry. */
const HEADERS_TIMEOUT_FALLBACK_MS = 30_000

/** Only undici's first header wait, with no response body or exhausted caller budget, qualifies. */
function initialHeadersTimeout(result: FetchResult, channel: Channel, tried: readonly string[]): boolean {
  const failed = result.trace.filter(event => event.event === 'request_failed').at(-1)
  return channel.id === 'http' && channel.vendorId === undefined && tried.length === 1
    && result.status === 'failed' && result.failureReason === 'timeout' && result.blockReason === null
    && result.retryAt === undefined && result.usage.deadlineExceeded !== true && result.usage.attemptCount === 1
    && result.evidence.httpStatus === null && result.evidence.rawBodySha256 === null && result.markdown === null
    && result.usage.bytesDecompressed === 0 && (result.usage.bytesWire === null || result.usage.bytesWire === 0)
    && failed?.detail?.error === 'HeadersTimeoutError' && failed.detail.code === 'UND_ERR_HEADERS_TIMEOUT'
}

function resultRequestsEscalation(result: FetchResult): boolean {
  return result.escalations.some((e) => e.improved === null) || qualityEscalationEvent(result) !== null
}

/**
 * Quality signals the http lane attaches to a contentful result: the content
 * is thin and low-confidence (`quality_low_yield`), or the page looks
 * client-rendered, so the HTTP capture may be a shell
 * (`quality_client_rendered`). Either is an offer to the next lane, not a
 * rewritten verdict; the first one in the trace names the hop.
 */
const QUALITY_ESCALATION_EVENTS: ReadonlySet<string> = new Set(['quality_low_yield', 'quality_client_rendered'])

function qualityEscalationEvent(result: FetchResult): string | null {
  return result.trace.find((t) => QUALITY_ESCALATION_EVENTS.has(t.event))?.event ?? null
}

/**
 * The caveat a thin http answer carries when it stays the run's answer: the
 * http lane raised a quality event on it (`quality_low_yield`, or
 * `quality_client_rendered`), and the browser lane either answered without
 * improving on it (or failed), or was not available to the request
 * (`fastMode`, an http-only policy, no browser rung). The count and the
 * confidence are the http lane's own, from its trace; a shell on which the
 * extractor found no main content says so instead of a count. Read by the
 * API's agent hints.
 */
function lowContentYieldWarning(result: FetchResult, browserTried: boolean): FetchWarning {
  const quality = result.trace.find((t) => t.event === 'quality_low_yield')?.detail
  const extract = result.trace.find((t) => t.event === 'extract')?.detail
  const confidence = typeof quality?.confidence === 'number' ? quality.confidence : typeof extract?.confidence === 'number' ? extract.confidence : null
  const tokens = typeof quality?.contentTokens === 'number' ? quality.contentTokens : result.usage.contentTokens
  const at = confidence === null ? '' : ` at confidence ${confidence}`
  const yield_ = CONTENTFUL_STATUS.has(result.status) && tokens !== null ? `extracted ${tokens} tokens${at}` : `found no main content${at}`
  return {
    code: 'low_content_yield',
    message: `The http lane ${yield_}; the browser lane ${browserTried ? 'did not improve it' : 'was not available to this request'}.`,
  }
}

/**
 * The run's answer with the `low_content_yield` warning after its own, when
 * it is the http lane's result that the http lane itself offered to the
 * browser lane: a contentful one, or the whole page it kept as evidence when
 * it found no main content. Any other answer is returned as it is.
 */
/**
 * The warning a run carries when its browser rung could not start because no browser is installed where Octocrawl runs
 * (`browser_unavailable` in that rung's trace): a new install that has not run the install command. The answer is
 * whatever another rung gave, often a thin http page, so the warning says what the browser lane needs.
 */
export function browserNotInstalledWarning(command: string = BROWSER_INSTALL_COMMAND): FetchWarning {
  // The installed_chrome rung (ADR 0005) needs Google Chrome itself, which no npx command installs.
  if (command === INSTALLED_CHROME_INSTALL) return { code: 'browser_not_installed', message: `the installed_chrome rung could not start: Google Chrome is not installed where Octocrawl runs; ${command}` }
  return { code: 'browser_not_installed', message: `the browser lane could not start: Chromium is not installed where Octocrawl runs; run ${command} once` }
}

/**
 * The warning a run carries when a rung's connection was refused by the egress proxy itself (`egress_proxy_refused` in
 * its trace) and no page was read: a spent plan, a bad login or a proxy that is down, not the site. HTTP rungs name the
 * proxy's status; a browser names only its tunnel error.
 */
export function egressProxyRefusedWarning(status: number | null): FetchWarning {
  return { code: 'egress_proxy_refused', message: `the egress proxy refused the connection${status === null ? '' : ` (HTTP ${status})`}, so no page was read: this failure is the proxy's, not the site's; check the proxy (its login, its plan or its bandwidth)` }
}

function withEgressProxyRefused(result: FetchResult, attempts: readonly { result: FetchResult }[]): FetchResult {
  if (result.status !== 'failed' || result.markdown !== null || result.warnings?.some((warning) => warning.code === 'egress_proxy_refused') === true) return result
  // Only when every rung that ran was refused by the proxy: a rung that failed on its own (a provider on its own
  // network, a site that timed out) is not the proxy's failure.
  if (attempts.length === 0 || !attempts.every((attempt) => attempt.result.trace.some((event) => event.event === 'egress_proxy_refused'))) return result
  const refused = attempts.flatMap((attempt) => attempt.result.trace).filter((event) => event.event === 'egress_proxy_refused')
  const status = refused.map((event) => event.detail?.status).find((value): value is number => typeof value === 'number') ?? null
  return { ...result, warnings: [...(result.warnings ?? []), egressProxyRefusedWarning(status)] }
}

function withBrowserNotInstalled(result: FetchResult, attempts: readonly { result: FetchResult }[]): FetchResult {
  // One warning per missing browser: the bundled Chromium and the installed_chrome rung's Google Chrome are told apart.
  const commands = [...new Set(attempts.flatMap((attempt) => attempt.result.trace).filter((event) => event.event === 'browser_unavailable')
    .map((event) => typeof event.detail?.install === 'string' ? event.detail.install : BROWSER_INSTALL_COMMAND))]
  const added = commands.map((command) => browserNotInstalledWarning(command))
    .filter((warning) => result.warnings?.some((held) => held.code === warning.code && held.message === warning.message) !== true)
  return added.length === 0 ? result : { ...result, warnings: [...(result.warnings ?? []), ...added] }
}

function withLowContentYield(result: FetchResult, channelsTried: readonly string[]): FetchResult {
  if (result.lane !== 'http') return withRenderedLowYield(result)
  if (qualityEscalationEvent(result) === null) return result
  const evidence = result.status === 'failed' && result.failureReason === 'empty_unverified' && result.markdown !== null
  if (!CONTENTFUL_STATUS.has(result.status) && !evidence) return result
  if (result.warnings?.some((warning) => warning.code === 'low_content_yield') === true) return result
  return { ...result, warnings: [...(result.warnings ?? []), lowContentYieldWarning(result, channelsTried.some((channel) => !HTTP_CHANNELS.has(channel)))] }
}

/**
 * A rendered answer (any lane but http) that its own extraction found thin
 * and low-confidence, with the `low_content_yield` warning: it is the run's
 * answer, so the caveat is what tells the reader that `success` holds little
 * (a page whose data its scripts draw, a listing of navigation links). The
 * status stands.
 */
function withRenderedLowYield(result: FetchResult): FetchResult {
  if (!CONTENTFUL_STATUS.has(result.status) || result.warnings?.some((warning) => warning.code === 'low_content_yield') === true) return result
  const extract = [...result.trace].reverse().find((t) => t.event === 'extract' && t.lane === result.lane)?.detail
  const confidence = typeof extract?.confidence === 'number' ? extract.confidence : null
  const tokens = result.usage.contentTokens
  if (confidence === null || tokens === null || confidence > QUALITY_ESCALATION_MAX_CONFIDENCE || tokens > RENDERED_LOW_YIELD_MAX_TOKENS) return result
  return {
    ...result,
    warnings: [...(result.warnings ?? []), { code: 'low_content_yield', message: `The ${result.lane} lane rendered the page and extracted ${tokens} tokens at confidence ${confidence}; that is the answer.` }],
  }
}

/** Content size as the ladder's improvement metric: main-content tokens,
 *  with markdown length as a tiebreaker. Deterministic, no magic. */
function contentSize(result: FetchResult): number {
  const tokens = result.usage.contentTokens ?? 0
  return tokens * 1_000 + (result.markdown?.length ?? 0)
}

/**
 * The boundary guard: whatever a channel hands back, a contentful result
 * whose identity was contradicted or unobserved is NEVER delivered as
 * success. ProviderSubject already converts such results to
 * failed/identity_compromised; this guard exists for any channel that does
 * not, so the rule holds even for the last rung and after a handoff retry.
 */
function sanitizeResult(result: FetchResult): FetchResult {
  if (CONTENTFUL_STATUS.has(result.status) && identityCompromised(result.trace)) {
    // The page goes with its Markdown, in every form the result carried it.
    const { html: _html, rawHtml: _rawHtml, screenshot: _screenshot, ...rest } = result
    return {
      ...rest,
      status: 'failed',
      failureReason: 'identity_compromised',
      blockReason: null,
      budgetExceeded: null,
      markdown: null,
      links: [],
      usage: { ...result.usage, contentTokens: null },
    }
  }
  return result
}

/**
 * Rungs the owner of a channel list left out before handing it to the ladder,
 * and why: a request's `fastMode` (the http rung alone), or an option the
 * local rungs alone honour (`headers`, `mobile`, `skipTlsVerification`), for
 * which the vendor rungs are dropped. Each run's audit opens with one
 * `ladder_channels_filtered` event per entry, so the audit says which rungs
 * the request never had.
 */
export interface ChannelsFiltered {
  reason: string
  dropped: readonly string[]
}

/**
 * Why a rung's page failed the task contract (ADR 0006, 0007): the region readiness classifier ROADMAP PA item 11
 * provides. `not_served` and `not_loaded` go on up the ladder; `not_extracted` goes on to the local rungs alone, since
 * a paid rung would read the same page; `ready` takes the page as the run would without a contract.
 */
export type ContractFailureClassifier = (result: FetchResult, verification: Verification) => ReadinessState

export interface LadderRunnerOptions {
  channelsFiltered?: readonly ChannelsFiltered[]
  /**
   * The request's task contract (`verify`, ADR 0006). A rung's page that passes every check is the answer, with no
   * quality hop after it; one that fails a check goes on up the ladder as the classifier says. A check this page
   * cannot be judged on yet (one on the JSON a format extracts after the run) decides nothing here.
   */
  verify?: VerifyContract
  /** Item 11's classifier; by default `readinessOf` (ADR 0007), on the page with the ladder's verification. */
  classifyContractFailure?: ContractFailureClassifier
}

/**
 * A contract's verdict on one rung's page, as far as the ladder can judge it: `passed` when every check was judged
 * and passed, `failed` when a judged check failed, else null (no contract, a page not read as content, or checks that
 * wait for the JSON extracted after the run).
 */
type JudgedVerification = Exclude<Verification, { status: 'not_requested' }>

function contractVerdict(contract: VerifyContract | undefined, result: FetchResult): { verification: JudgedVerification; verdict: 'passed' | 'failed' | null } | null {
  if (contract === undefined) return null
  // With a contract the verifier always judges: not_requested is for a request without one.
  const verification = verify(contract, result as unknown as Record<string, unknown>, { partial: true }) as JudgedVerification
  const checks = verification.checks
  const verdict = verification.reason !== 'checks_failed' && verification.reason !== null ? null
    : checks.some((check) => check.passed === false) ? 'failed'
      : checks.length > 0 && checks.every((check) => check.passed === true) ? 'passed'
        : null
  return { verification, verdict }
}

/**
 * Whether a vendor's page did the task, for its routing history (ADR 0006): null without a contract, or while a check
 * waits for the JSON extracted after the run; false for a page not read as content or an empty one the contract does
 * not allow.
 */
function verifiedOf(checked: ReturnType<typeof contractVerdict>): boolean | null {
  if (checked === null) return null
  if (checked.verdict !== null) return checked.verdict === 'passed'
  if (checked.verification.reason === 'page_not_read' || checked.verification.reason === 'empty_not_allowed') return false
  // empty_verified with emptyOk passes with no check run; a page with checks left unjudged is not known yet.
  return checked.verification.status === 'passed' && checked.verification.checks.length === 0 ? true : null
}

/** A path segment kept as it is in a family: a short word of letters and hyphens (`products`, `en-us`). */
const KIND_SEGMENT = /^[a-z][a-z-]{0,23}$/

/**
 * The route a URL's vendor statistics belong to (PA G2b): with a contract, its task (the contract's hash); else the
 * path's family: its first segment when it is a short word of letters, else `*`, and `/*` when there is more. Never the
 * URL itself, its query, a second segment (an id, a slug, a name) or anything with digits, `@`, `.` or `%` in it.
 */
function routeContextOf(url: string, options: FetchOptions, contract: VerifyContract | undefined): RouteContext {
  let family: string
  if (contract !== undefined) family = `task:${contractSha256(contract).slice(0, 12)}`
  else {
    let segments: string[] = []
    try { segments = new URL(url).pathname.split('/').filter((segment) => segment !== '') } catch { /* not a URL: the root family */ }
    const first = segments[0]
    family = first === undefined ? 'path:/' : `path:/${KIND_SEGMENT.test(first.toLowerCase()) ? first.toLowerCase() : '*'}${segments.length > 1 ? '/*' : ''}`
  }
  const formats = ['markdown', ...(options.includeHtml ? ['html'] : []), ...(options.includeRawHtml ? ['rawHtml'] : []), ...(options.includeImages ? ['images'] : []), ...(options.includeTables ? ['tables'] : []), ...(options.attributes !== undefined && options.attributes.length > 0 ? ['attributes'] : []), ...(options.list !== undefined ? ['list'] : []), ...(options.screenshot !== undefined ? ['screenshot'] : [])].sort()
  return { family, formats: formats.join(','), versions: `${EXTRACTOR_VERSION}|${ROUTE_VERIFIER_VERSION}` }
}

/** A number the last such trace event's detail holds, else null. */
function detailMs(trace: readonly TraceEvent[], event: string, key: string): number | null {
  const value = [...trace].reverse().find((t) => t.event === event)?.detail?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** What a vendor's rung runs on: its declared Chrome major version and its grant's egress configuration. */
function rungEnvironment(channel: Channel): RouteEnvironment {
  const major = channel.identity === undefined ? null : /(?:Chrome|Chromium)\/(\d+)/.exec(channel.identity.userAgent)?.[1]
  const capabilities = channel.grantCapabilities === undefined ? null : [...channel.grantCapabilities].sort()
  // The configuration alone: the proxy country a paid call reports depends on how it was billed, so it is not hashed here.
  const egress = capabilities === null ? null : { capabilities }
  return {
    browserMajor: major == null ? null : Number(major),
    egressClass: capabilities === null ? null : capabilities.includes('vendor_residential_proxy') ? 'vendor_residential' : 'vendor_default',
    egressConfigVersion: egress === null ? null : createHash('sha256').update(JSON.stringify(egress)).digest('hex').slice(0, 12),
  }
}

/**
 * What a vendor rung's attempt showed, for its routing history (PA G2a): each layer, the stage it stopped at, its times,
 * what it ran on and what the run's ledger charged it (the settled paid call its `spend_settled` names, not the vendor's
 * price, which a measured or ceiling charge leaves null). Codes and numbers only.
 */
function routeObservation(channel: Channel, result: FetchResult, verified: boolean | null, checked: ReturnType<typeof contractVerdict>, failedReadiness: ReadinessState | null, progress: LadderProgress): RouteObservation {
  const accessDelivered = CONTENTFUL_STATUS.has(result.status)
  const readiness = checked?.verdict === 'passed' ? 'ready' : checked?.verdict === 'failed' ? failedReadiness : null
  const regionLoaded = readiness === null ? null : readiness === 'ready' || readiness === 'not_extracted'
  const failureStage = !accessDelivered ? 'access' : regionLoaded === false ? 'region' : readiness === 'not_extracted' ? 'extraction' : verified === false ? 'task' : null
  const reason = result.failureReason ?? result.blockReason ?? result.budgetExceeded ?? (checked?.verdict === 'failed' ? checked.verification.reason : null)
  // The rung's own settlement is the last one: paidFetch appends it after the vendor's trace.
  const settled = [...result.trace].reverse().find((t) => t.event === 'spend_settled')?.detail
  const paid = typeof settled?.call === 'number' ? progress.paidCalls.find((c) => c.call === settled.call) ?? null : null
  const basis = settled?.basis
  const timings = result.usage.timings
  return {
    accessDelivered,
    regionLoaded,
    taskVerified: verified,
    failureStage,
    readiness,
    reason,
    timings: {
      coldStartMs: null,
      navigationMs: null,
      challengeWaitMs: detailMs(result.trace, 'challenge_wait', 'ms'),
      regionWaitMs: detailMs(result.trace, 'region_wait', 'waitedMs'),
      captureMs: null,
      extractMs: timings?.extractMs ?? null,
      serializeMs: timings?.serializeMs ?? null,
      cleanupMs: null,
      sessionMs: paid?.sessionMs ?? null,
      totalMs: result.usage.wallMs,
    },
    environment: rungEnvironment(channel),
    chargedUsd: paid?.chargedUsd ?? null,
    chargeBasis: paid === null ? null : basis === 'reported' || basis === 'measured' || basis === 'ceiling' ? basis : null,
  }
}

/**
 * Region readiness (ROADMAP PA item 11, ADR 0007) of a rung's page that failed its contract: never `ready`. A page read
 * without its scripts, or one still loading, is `not_loaded`; one whose region held on the live page but whose checks
 * failed on what was extracted is `not_extracted`; one whose region never came, or came empty, is `not_served`. A page
 * whose region no live read judged (`region_unjudged`: a check the browser's wait could not judge, a page too large for
 * it) is not known to have held, and goes on up as `not_served` rather than closing the paid rungs.
 */
const contractReadiness: ContractFailureClassifier = (result, verification) => {
  const readiness = readinessOf({ ...result, verification })
  return readiness.state === 'not_extracted' && readiness.basis.includes('region_unjudged') ? 'not_served' : readiness.state
}

/** The `verification_checked` event for one rung's page: codes and counts, never the page's text. */
function verificationCheckedEvent(channel: Channel, result: FetchResult, checked: { verification: JudgedVerification; verdict: 'passed' | 'failed' | null }): LadderRunResult['ladderTrace'][number] {
  const checks = checked.verification.checks
  return {
    at: result.usage.wallMs,
    event: 'verification_checked',
    channel: channel.id,
    detail: {
      vendorId: channel.vendorId ?? null,
      status: checked.verification.status,
      reason: checked.verification.reason,
      verdict: checked.verdict,
      failed: checks.filter((check) => check.passed === false).map((check) => check.type),
      notJudged: checks.filter((check) => check.passed === null).length,
      // Of those, the regular-expression checks stopped at a limit (ADR 0006, amendment of 2026-10-29).
      limited: checks.filter(undecidedCheck).length,
    },
  }
}

export class LadderRunner {
  constructor(
    /** Channels in escalation order. Providers go after browser_local. */
    private readonly channels: readonly Channel[],
    private readonly policy: CrawlPolicy,
    private readonly history: RoutingHistory | null = null,
    private readonly handoff: HumanHandoff | null = null,
    /**
     * Authorized-session persistence. When set, the ladder loads a saved
     * snapshot for the target domain (unless the caller passed one) and saves
     * the snapshot a human produced — so the next run resumes, not restarts.
     */
    private readonly sessionStore: SessionStore | null = null,
    private readonly options: LadderRunnerOptions = {},
  ) {}

  /**
   * Walk the ladder for one URL. Governance first (allowlist + mode), then
   * channels in order. Vendor channels are attempted in history-ranked
   * order, not declaration order, when a history is attached.
   *
   * Escalation sources, in the order the subject's own record is consulted:
   *   1. block/failure classes (bot_gate → next lane, provider_error → next
   *      vendor, ...) — LADDER_CONTINUES_FAILURE_CLASS;
   *   2. the result's own `escalations` array — empty_unverified /
   *      extract_low_confidence requests from the subject are honoured as
   *      asks, not re-derived;
   *   3. `quality_low_yield` / `quality_client_rendered` — a thin,
   *      low-confidence success from the http lane, or one whose page reads
   *      as a shell its scripts fill in, gets offered to a higher lane
   *      instead of being the answer.
   * All of it lands in `ladderTrace`. The signed compliance record remains
   * the winning subject's own; the ladder audit travels alongside it,
   * unrewritten and unsigned — that boundary is deliberate.
   *
   * An answer without content is kept only for want of a better one: the
   * HTTP rung's `success` with empty Markdown, when `includeTags` named
   * nothing on a page it offers to the next rung. A later rung that finds
   * the page blocked replaces it (`ladder_empty_answer_dropped`), and one
   * that repeats it confirms it and ends the run.
   *
   * The caller's deadline (a scrape's `timeout`) ends the run with a result,
   * never an error: the best content a rung produced so far as `partial`,
   * or `failed`/`timeout`. Cancellation and shutdown still reject.
   *
   * A recorded robots override (`options.robotsOverride`) is for the local
   * rungs. Whatever result the run ends with says when one of them set a
   * rule aside (carryRobotsOverride), and such a run never goes on to a
   * vendor rung.
   */
  async run(url: string, session?: SessionSnapshot | null, execution: ExecutionContext = {}, options: FetchOptions = {}): Promise<LadderRunResult> {
    const scope = createExecutionScope(execution)
    const progress: LadderProgress = { startedAt: performance.now(), channelsTried: [], ladderTrace: [], attempts: [], robotsOverrides: [], charged: null, paidCalls: [], grant: null, ledger: null, solves: 0, steppedPast: null, notAdmitted: [] }
    for (const filtered of this.options.channelsFiltered ?? []) {
      progress.ladderTrace.push({ at: 0, event: 'ladder_channels_filtered', channel: '—', detail: { reason: filtered.reason, dropped: [...filtered.dropped] } })
    }
    // A rung says so the moment it sets a rule aside, so the run knows even when that rung never returns.
    const rungs: ExecutionContext = { ...scope, onRobotsOverride: (applied) => { progress.robotsOverrides.push(applied); execution.onRobotsOverride?.(applied) } }
    try { return withNotAdmitted(withRunCost(carryRobotsOverride(await this.runWithinBudget(url, session, rungs, options, progress), progress.robotsOverrides), progress), progress) }
    catch (error) {
      // A run that throws keeps its paid calls on the error, for the record of whatever result the error becomes.
      if (!deadlineReached(scope)) throw progress.paidCalls.length === 0 ? error : carryPaidCalls(error, paidCallsEvent(progress, new Set(), Math.max(0, performance.now() - progress.startedAt), 'provider'))
      return withNotAdmitted(withRunCost(carryRobotsOverride(deadlineOutcome(url, progress, null), progress.robotsOverrides), progress), progress)
    } finally { scope.dispose() }
  }

  private async runWithinBudget(url: string, session: SessionSnapshot | null | undefined, execution: ExecutionContext, options: FetchOptions, progress: LadderProgress): Promise<LadderRunResult> {
    const { startedAt, channelsTried, ladderTrace, attempts, robotsOverrides } = progress
    throwIfExecutionStopped(execution)
    const decision = evaluateGovernance(url, this.policy)
    const finish = (answer: FetchResult, handoffRequested: boolean): LadderRunResult => {
      writeDecision(progress, 'stop')
      const result = withEgressProxyRefused(withBrowserNotInstalled(answer, attempts), attempts)
      const summary = summarize(channelsTried, attempts)
      return {
        result,
        channelsTried,
        handoffRequested,
        ladderTrace,
        summary: { ...summary, totalMs: Math.max(0, performance.now() - startedAt) },
      }
    }
    // A later rung that failed without a page does not erase the page an
    // earlier rung kept as evidence when it found no main content: that
    // result is the answer, its hop marked not improved. The later failure
    // stays in the audit.
    const failedAnswer = (result: FetchResult): FetchResult => {
      if (result.status !== 'failed' || result.markdown !== null) return result
      const notImproved = (kept: FetchResult) => ({ ...kept, escalations: kept.escalations.map((e) => (e.improved === null ? { ...e, improved: false } : e)) })
      const kept = classifyFetchFailure(result) === null ? noMainContentEvidence(attempts) : null
      if (kept !== null && kept.result !== result) {
        ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_evidence_kept', channel: kept.channel, detail: { kept: kept.channel, failed: channelsTried.at(-1) ?? null, reason: result.failureReason } })
        return notImproved(kept.result)
      }
      // A page the ladder stepped past for a stronger rung (a 403 the site answered, a page rendered with no main content)
      // says more than a later rung's failure with no page at all: a network error, a provider's own error, a timeout.
      const stepped = progress.steppedPast
      if (stepped === null || stepped.result === result || (result.evidence.httpStatus != null && result.failureReason !== 'provider_error')) return result
      ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_evidence_kept', channel: stepped.channel, detail: { kept: stepped.channel, failed: channelsTried.at(-1) ?? null, reason: result.failureReason ?? result.blockReason } })
      return notImproved(stepped.result)
    }

    // Sessions exist for authed mode ONLY. standard/research never load or
    // use login state — a session in a public run is a leak of the user's
    // account into a lane they did not authorize.
    const sessionsPermitted = this.policy.mode === 'authed'
    let effectiveSession: SessionSnapshot | null = null
    if (sessionsPermitted) {
      effectiveSession =
        session !== undefined && session !== null
          ? session
          : this.sessionStore !== null
            ? await raceWithSignal(loadSessionForHost(this.sessionStore, safeHost(url)), execution.signal)
            : null
    }
    if (effectiveSession !== null) {
      ladderTrace.push({
        at: 0,
        event: 'ladder_session_loaded',
        channel: '—',
        detail: { domain: effectiveSession.domain, vendor: effectiveSession.vendor },
      })
    }

    if (!decision.allowed) {
      ladderTrace.push({
        at: 0,
        event: 'ladder_governance_refusal',
        channel: '—',
        detail: { reason: decision.reason ?? 'governance refused this url' },
      })
      return finish(this.governanceRefusal(url, decision.reason ?? 'governance refused this url'), false)
    }

    const permitted = new Set(decision.permittedChannels)
    // Local lanes first, in declaration order, then providers (history-ranked).
    // A rung that does not take this URL with these options is left out. One that says why (`refusal`) is named
    // in the trace; the http/http_compat pair, which split every host between them (`serves`), is not.
    const served = (c: Channel): boolean => {
      if (c.refusal === undefined) return c.serves?.(url, options) ?? true
      const refused = c.refusal(url, options)
      if (refused !== null) ladderTrace.push({ at: 0, event: 'ladder_channel_not_served', channel: c.id, detail: { reason: refused } })
      return refused === null
    }
    const local = this.channels.filter((c) => c.vendorId === undefined && permitted.has(c.id) && served(c))
    const providers = this.channels.filter((c) => c.vendorId !== undefined && permitted.has(c.id) && served(c))

    let ordered = [...local, ...(await raceWithSignal(this.orderProviders(url, providers, routeContextOf(url, options, this.options.verify), ladderTrace), execution.signal))]

    // A saved login for this host goes first: many sites answer a logged-out
    // visitor with a 200 (a login form, a public variant of the page), which
    // the public rungs would take as the answer and the session would never
    // be used. Only a local session moves its rung; a vendor's resume
    // material stays with its provider rung.
    const sessionFirst = effectiveSession !== null && effectiveSession.vendor === 'browser_local_authed' && sessionCoversHost(effectiveSession.domain, safeHost(url))
      ? ordered.find((c) => c.id === 'authed_session') ?? null
      : null
    if (sessionFirst !== null) {
      ordered = [sessionFirst, ...ordered.filter((c) => c !== sessionFirst)]
      ladderTrace.push({ at: 0, event: 'ladder_session_first', channel: sessionFirst.id, detail: { domain: effectiveSession!.domain } })
    }

    // waitFor needs a rung that runs scripts and waits before capture; the
    // HTTP rung cannot. Such rungs are skipped, and when none is left the
    // result says so instead of answering without the wait.
    const waitFor = options.waitFor ?? 0
    if (waitFor > 0 && ordered.length > 0) {
      const skipped = ordered.filter((c) => c.waitsFor !== true)
      for (const c of skipped) {
        ladderTrace.push({ at: 0, event: 'ladder_channel_skipped', channel: c.id, detail: { vendorId: c.vendorId ?? null, reason: 'waitFor needs a rung that runs scripts and waits before capture', waitFor } })
      }
      ordered = ordered.filter((c) => c.waitsFor === true)
      if (ordered.length === 0) return finish(this.waitForUnavailable(url, waitFor, skipped.map((c) => c.id)), false)
    }

    let last: FetchResult | null = null
    let best: FetchResult | null = null
    let bestSize = -1
    let bestChannel: Channel | null = null
    /** The quality hop the ladder itself proposed (http → next lane), so the
     *  final result can stamp whether that hop actually improved things. */
    let qualityEscalation: Escalation | null = null
    /** A rung's page failed the task contract with its content there but not extracted: a paid rung would read the same page. */
    let contractNotExtracted = false
    let headersTimeoutFallback: Channel | null = null
    /** The local browser after a rung that a header timeout on that rung may fall back to (ADR 0007). */
    const fallbackBrowserAfter = (channel: Channel): Channel | null => ordered.slice(ordered.indexOf(channel) + 1).find((candidate) => candidate.id === 'browser_local'
      && candidate.vendorId === undefined && refuseChannelIdentity(url, candidate) === null) ?? null
    /** A rung's challenge came with a 429 or 503: the run stays on its own exit (ADR 0005), so no vendor rung. */
    let challengedWithRetryAt = false
      for (const channel of ordered) {
        throwIfExecutionStopped(execution)
        // A header timeout asks for a browser, not another HTTP client: the rungs before the qualified local browser
        // (compat) are skipped. From that browser on, the ladder goes on by its ordinary rules (ADR 0007, 2026-10-26).
        if (headersTimeoutFallback !== null && channel !== headersTimeoutFallback) continue
        if (channel.vendorId !== undefined && challengedWithRetryAt) {
          ladderTrace.push({ at: 0, event: 'ladder_channel_skipped', channel: channel.id, detail: { vendorId: channel.vendorId, reason: 'a rung met a challenge served with 429 or 503; after a 429 the run keeps its own exit (ADR 0005), and a vendor rung leaves through another' } })
          continue
        }
        if (channel.vendorId !== undefined && contractNotExtracted) {
          ladderTrace.push({ at: 0, event: 'ladder_channel_skipped', channel: channel.id, detail: { vendorId: channel.vendorId, reason: 'the task contract failed on a page that came but was not extracted (not_extracted); a paid rung would read the same page' } })
          continue
        }
        // A recorded robots override is the caller's decision for a fetch
        // from this machine, and the provider rung takes none. A run that set
        // a rule aside ends at its local rungs: no vendor session is opened
        // for that URL, and no vendor refusal replaces the local answer. One
        // that set aside only a robots.txt that could not be read goes on: the
        // provider reads robots.txt itself before it opens a session, and
        // refuses if it still cannot read it or it disallows: charged, as any
        // call, the session its connect opened.
        if (channel.vendorId !== undefined && robotsOverrides.some(setAsideARule)) {
          ladderTrace.push({ at: 0, event: 'ladder_channel_skipped', channel: channel.id, detail: { vendorId: channel.vendorId, reason: 'a local rung set a robots.txt rule aside under a recorded robots override; a vendor rung takes no override' } })
          continue
        }
        const identityBlock = refuseChannelIdentity(url, channel)
        if (identityBlock !== null) {
          channelsTried.push(channel.id)
          ladderTrace.push({
            at: 0,
            event: 'ladder_identity_refused',
            channel: channel.id,
            detail: {
              vendorId: channel.vendorId ?? null,
              reason: identityBlock.trace[0]?.detail?.reason ?? 'identity refused',
              issues: identityBlock.trace[0]?.detail?.issues ?? [],
            },
          })
          return finish(identityBlock, false)
        }
        const startedAt = new Date().toISOString()
        // When each rung was called and how much of the run's time it had left: a rung reached late fails for want of time.
        // Said as the call goes out, so a provider rung passed over for its price or budget is not counted as started.
        const fallback = headersTimeoutFallback === channel
        if (fallback) headersTimeoutFallback = null
        // The first http rung whose header timeout could go on to the local browser says so: under a caller's timeout its
        // header cap then holds while that browser would still have its time (ADR 0007, 2026-10-26).
        const callOptions = channel.id === 'http' && channel.vendorId === undefined && channelsTried.length === 0 && effectiveSession === null
          && fallbackBrowserAfter(channel) !== null ? { ...options, headersTimeoutFallback: true } : options
        const callStarted = performance.now()
        // The fallback's own 30 s ends before the caller's deadline, unless a promised fallback had less left (ADR 0007, 2026-10-26).
        const ownDeadline = fallback && Date.now() + HEADERS_TIMEOUT_FALLBACK_MS < execution.deadlineAt!
        const localScope = fallback ? createExecutionScope({ ...execution, deadlineAt: Math.min(execution.deadlineAt!, Date.now() + HEADERS_TIMEOUT_FALLBACK_MS) }) : null
        const callExecution = localScope ?? execution
        let fetched: FetchResult | null
        try {
          fetched = await this.paidFetch(channel, channel.id, url, effectiveSession, callExecution, callOptions, progress, () => {
            channelsTried.push(channel.id)
            writeDecision(progress, fallback ? 'keep_591_fallback' : 'next_rung')
            ladderTrace.push({ at: Math.round(performance.now() - progress.startedAt), event: 'ladder_channel_started', channel: channel.id, detail: { vendorId: channel.vendorId ?? null, remainingMs: callExecution.deadlineAt === undefined ? null : Math.max(0, callExecution.deadlineAt - Date.now()) } })
          })
        } catch (error) {
          // Only the fallback's own cap becomes a local timeout. Caller cancellation and the run deadline keep their semantics.
          if (localScope === null || !deadlineReached(localScope) || deadlineReached(execution) || execution.signal?.aborted) throw error
          const timedOut = deadlineFailure(url, 'browser_local', Math.max(0, performance.now() - callStarted))
          fetched = { ...timedOut, usage: { ...timedOut.usage, deadlineExceeded: true } }
          ladderTrace.push({ at: fetched.usage.wallMs, event: 'ladder_headers_timeout_fallback_expired', channel: channel.id, detail: { maxMs: HEADERS_TIMEOUT_FALLBACK_MS } })
        } finally { localScope?.dispose() }
        if (fetched === null) continue
        const result = fetched
        attempts.push(attemptOf(channel, channel.id, result, attempts.length + 1, startedAt))
        // A vendor rung the run reached after setting aside only an unreadable robots.txt read it itself, and refused the
        // URL under it before opening a session: that refusal is not the answer, the earlier rung's stands.
        if (channel.vendorId !== undefined && last !== null && robotsOverrides.length > 0 && refusedUnderRobots(result)) {
          ladderTrace.push({ at: 0, event: 'ladder_vendor_refused', channel: channel.id, detail: { vendorId: channel.vendorId, reason: 'the vendor rung refused the URL under robots.txt before it opened a session; the earlier answer stands' } })
          continue
        }
        // Every rung's page is judged against the task contract, the answer's and the others' alike (ADR 0006).
        const checked = contractVerdict(this.options.verify, result)
        if (checked !== null) ladderTrace.push(verificationCheckedEvent(channel, result, checked))
        // Why a page failed its contract, asked once: it steers the ladder, and a vendor's history does not count a page
        // whose content came but was not extracted as that vendor failing (ADR 0007).
        const failedReadiness = checked?.verdict === 'failed' ? (this.options.classifyContractFailure ?? contractReadiness)(result, checked.verification) : null
        // What decideNext would do with this page, beside what the ladder does (PA F4, shadow): written when the ladder acts.
        const next = ordered.slice(ordered.indexOf(channel) + 1)[0] ?? null
        progress.pendingDecision = {
          channel: channel.id,
          at: result.usage.wallMs,
          decision: decideNext({
            result,
            failureClass: classifyFetchFailure(result),
            readiness: failedReadiness,
            verdict: checked?.verdict ?? null,
            remainingMs: execution.deadlineAt === undefined ? null : execution.deadlineAt - Date.now(),
            channel,
            next,
            ...(checked?.verdict === 'failed' ? { waitedMs: readinessOf({ ...result, verification: checked.verification }).waitedMs } : {}),
            headersTimeout: initialHeadersTimeout(result, channel, channelsTried),
            // Who can take a login wall, by the ladder's own rule (a handoff in authed mode); a saved login the site refused is not one.
            handoff: result.handoff && sessionsPermitted ? 'person' : null,
            reextracted: result.trace.some((event) => event.event === 'extraction_candidates'),
          }),
        }
      // A rung the deadline cut short ends the run: nothing after it has time.
      if ((!ownDeadline && result.usage.deadlineExceeded === true) || ((fallback || result.failureReason === 'timeout') && deadlineReached(execution))) {
        return deadlineOutcome(url, progress, result)
      }
      last = result
      if (ownDeadline && result.usage.deadlineExceeded === true) {
        // The fallback ran out its own 30 s: that ends the run, as a timeout ends any rung. The attempt keeps its
        // original local deadline flag; the answer must not call that the caller's deadline.
        const { deadlineExceeded: _localDeadline, ...usage } = result.usage
        const answer: FetchResult = { ...result, usage, trace: [...result.trace, { at: result.usage.wallMs, lane: result.lane, event: 'local_fallback_deadline', detail: { trigger: 'http_headers_timeout', maxMs: HEADERS_TIMEOUT_FALLBACK_MS } }] }
        ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_step', channel: channel.id, detail: { status: result.status, escalate: null, fallback: 'http_headers_timeout', verification: checked?.verdict ?? null, localDeadlineExceeded: true } })
        return finish(sanitizeResult(answer), false)
      }
      if (execution.signal?.aborted) return finish(result, false)
      if (result.retryAt !== undefined) {
        // A 429 or 503 the gate named a challenge (Vercel, Kasada, PerimeterX: K1, 2026-10-25) is no rate limit:
        // the next local rung runs it, after the origin's shared cooldown. A rate limit, or a deferred retry, ends here, and
        // so does a challenge whose cooldown the next rung would spend its time waiting out: its block is the answer.
        if (result.status !== 'blocked' || result.blockReason === null || result.blockReason === 'rate_limit') return finish(result, false)
        if (result.retryAt - Date.now() > CHALLENGE_COOLDOWN_MAX_MS || (execution.deadlineAt !== undefined && result.retryAt + CHALLENGE_COOLDOWN_MAX_MS > execution.deadlineAt)) return finish(result, false)
        challengedWithRetryAt = true
      }
      // The site refused the saved login (expired, signed out): that is the
      // answer. A public rung after it would return the logged-out page as
      // if it were the page the caller asked for.
      const rejected = channel === sessionFirst ? sessionRejection(url, result) : null
      if (rejected !== null) {
        // How the site refused it: a block, a redirect to its login page, or a sign-in asked for in place.
        const how = rejected === result ? {} : redirectedToLogin(url, result) ? { redirectedTo: rejected.evidence.finalUrl } : { signInPrompt: signInPrompt(result.markdown, result.metadata?.title) }
        ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_session_rejected', channel: channel.id, detail: { domain: effectiveSession!.domain, blockReason: 'login_wall', ...how } })
        return finish(rejected, false)
      }

      // Vendor attribution happens for every attempt, successful or not —
      // a vendor's win IS its history. The outcome is judged on the
      // SANITIZED result: an identity-compromised fetch counts as
      // contentful=0 with failureClass=identity_mismatch, exactly the
      // semantics every other layer uses.
      if (channel.vendorId !== undefined && this.history !== null) {
        const judged = sanitizeResult(result)
        const cls = classifyFetchFailure(judged)
        const judgedCheck = contractVerdict(this.options.verify, judged)
        const verified = verifiedOf(judgedCheck)
        // A page there but not extracted is not the vendor failing the task either (ADR 0007): unknown, on both counts.
        const counted = verified === false && judged === result && failedReadiness === 'not_extracted' ? null : verified
        const observation = routeObservation(channel, judged, counted, judgedCheck, judged === result ? failedReadiness : null, progress)
        await this.recordVendorOutcome(url, channel.vendorId, judged, cls, counted, observation, routeContextOf(url, options, this.options.verify))
      }

      if (CONTENTFUL_STATUS.has(result.status)) {
        // An identity-compromised contentful result is NOT an acceptable
        // success: the wire carried an identity the gate never cleared (or
        // one we could not observe). Keep it as best-so-far only if it is
        // genuinely the best content we have, but never return it as the
        // answer — the ladder continues to the next vendor.
        const compromised = identityCompromised(result.trace)
        const size = contentSize(result)
        // Worse-than-best is decided against the PREVIOUS best, before this
        // result can become it — comparing against itself would make every
        // first success "worse" and send every run down the whole ladder.
        const worseThanBest = !compromised && best !== null && size <= bestSize
        if (!compromised && size > bestSize) {
          best = result
          bestSize = size
          bestChannel = channel
        }

        // A contentful vendor fetch may carry resume material (Browserbase
        // contextId / Steel profileId). Persisting it now is what lets the
        // NEXT independent process resume this session instead of starting
        // one from zero.
        if (
          !compromised &&
          channel.vendorId !== undefined &&
          this.sessionStore !== null &&
          result.resumeContext !== undefined &&
          result.resumeContext !== null
        ) {
          const snapshot: SessionSnapshot = {
            domain: safeHost(url),
            attestedBy: 'operator',
            attestedAt: new Date().toISOString(),
            vendor: channel.vendorId,
            resume: result.resumeContext as SessionSnapshot['resume'],
          }
          await this.sessionStore.save(snapshot)
          ladderTrace.push({
            at: result.usage.wallMs,
            event: 'ladder_session_saved',
            channel: channel.id,
            detail: { domain: snapshot.domain, vendor: channel.vendorId },
          })
        }

        // Quality escalation: a thin, low-confidence http success, or one
        // whose page reads as a client-rendered shell, is offered to the next
        // lane rather than accepted as the answer. The status is NOT
        // rewritten — the record keeps the real success and its real token
        // count; the ladder just isn't done yet.
        // The task contract speaks before the quality hop and the size comparison: a page that does the task is the
        // answer, and one that fails it goes on up the ladder as item 11's classifier says (ADR 0006, 0007). The saved
        // login's page is not stepped past for it: the rungs after it would read the logged-out page.
        if (checked !== null && !compromised && checked.verdict === 'passed') {
          ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_step', channel: channel.id, detail: { vendorId: channel.vendorId ?? null, status: result.status, escalate: null, verification: 'passed' } })
          const withImprovement = qualityEscalation === null ? result.escalations : [...result.escalations, { ...qualityEscalation, improved: true }]
          return finish(withLowContentYield({ ...result, escalations: withImprovement }, channelsTried), false)
        }
        if (checked !== null && !compromised && checked.verdict === 'failed' && channel !== sessionFirst && channel.id !== 'authed_session') {
          const readiness = failedReadiness!
          if (readiness !== 'ready') {
            if (readiness === 'not_extracted') contractNotExtracted = true
            ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_step', channel: channel.id, detail: { vendorId: channel.vendorId ?? null, status: result.status, escalate: 'verification_failed', readiness } })
            continue
          }
        }

        const qualityEvent = HTTP_CHANNELS.has(channel.id) ? qualityEscalationEvent(result) : null
        const thinHttp = qualityEvent !== null

        // Worse-than-best: a later channel DID answer, but with less content
        // than an earlier one already produced. That is not an improvement —
        // the ladder keeps going, and if nothing better shows up the best
        // result is the answer. One case ends the run instead: an answer
        // without content (an `includeTags` selection that named nothing)
        // that a second rung repeats is confirmed, and no later rung, a
        // vendor's least of all, is asked for it a third time.
        const emptyConfirmed = !thinHttp && worseThanBest && bestSize === 0
        if (thinHttp || worseThanBest) {
          if (thinHttp && qualityEscalation === null) {
            // The ladder itself proposed this hop; remember it so the final
            // result can say whether it improved things or not.
            qualityEscalation = {
              from: 'http',
              to: 'browser_local',
              trigger: qualityEvent,
              improved: null,
            }
          }
          ladderTrace.push({
            at: result.usage.wallMs,
            event: 'ladder_step',
            channel: channel.id,
            detail: {
              vendorId: channel.vendorId ?? null,
              status: result.status,
              escalate: thinHttp ? qualityEvent : emptyConfirmed ? null : 'worse_than_best',
              ...(emptyConfirmed ? { confirmsEmpty: bestChannel?.id ?? null } : {}),
            },
          })
          if (emptyConfirmed) break
          continue
        }

        ladderTrace.push({
          at: result.usage.wallMs,
          event: 'ladder_step',
          channel: channel.id,
          detail: {
            vendorId: channel.vendorId ?? null,
            status: result.status,
            escalate: compromised ? 'identity_rejected' : null,
          },
        })
        if (compromised) {
          // The next provider is the fallback; this content was not
          // trustworthy enough to be the answer.
          continue
        }
        // A clean contentful win. If it followed a quality hop the ladder
        // proposed, the hop is stamped improved on the way out.
        const withImprovement = qualityEscalation === null
          ? result.escalations
          : [...result.escalations, { ...qualityEscalation, improved: true }]
        return finish(withLowContentYield({ ...result, escalations: withImprovement }, channelsTried), false)
      }

      // A rung that found the page blocked says more about it than an
      // answer without content from an earlier rung (an `includeTags`
      // selection that named nothing, read before the page's scripts ran):
      // that answer is given up, and the run goes on as if the earlier rung
      // had found no content.
      if (result.status === 'blocked' && best !== null && bestSize === 0) {
        ladderTrace.push({
          at: result.usage.wallMs,
          event: 'ladder_empty_answer_dropped',
          channel: bestChannel?.id ?? '—',
          detail: { dropped: bestChannel?.id ?? null, blockedAt: channel.id, blockReason: result.blockReason },
        })
        best = null
        bestSize = -1
        bestChannel = null
      }

      if (result.handoff) {
        if (!sessionsPermitted) {
          // handoff exists only in authed mode; a handoff request under a
          // public policy is misconfiguration, reported, not executed.
          ladderTrace.push({
            at: result.usage.wallMs,
            event: 'ladder_step',
            channel: channel.id,
            detail: { status: result.status, handoff: 'denied: mode is not authed' },
          })
          continue
        }
        writeDecision(progress, 'handoff')
        return await this.attemptHandoff(url, result, channelsTried, channel, effectiveSession, ladderTrace, best, attempts, execution, options, progress)
      }

      const cls = classifyFetchFailure(result)
      const subjectAsked = resultRequestsEscalation(result)
      // Content an earlier rung found stays the answer: a later rung's failure is not stepped past. Nor is the saved login's:
      // the rungs after it do not carry the login, and would answer with the logged-out page.
      // Under a caller's timeout, a header cap the http rung held because this fallback was there was decided by the
      // fallback's own rule when the request went out (HTTP_CAP_RESERVE_MS): the connect time after that decision does not
      // take the fallback away, and the browser has what is left, at most its 30 s (ADR 0007, 2026-10-26). Without one the
      // caps hold by default, and the fallback still needs its full 30 s.
      const promised = callOptions.headersTimeoutFallback === true && options.timeout !== undefined
      if (cls === null && !subjectAsked && best === null && effectiveSession === null && initialHeadersTimeout(result, channel, channelsTried)
        && Number.isFinite(execution.deadlineAt) && (promised || execution.deadlineAt! - Date.now() >= HEADERS_TIMEOUT_FALLBACK_MS)) {
        headersTimeoutFallback = fallbackBrowserAfter(channel)
        if (headersTimeoutFallback !== null) ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_headers_timeout_fallback', channel: channel.id, detail: { to: 'browser_local', remainingMs: execution.deadlineAt! - Date.now(), maxMs: HEADERS_TIMEOUT_FALLBACK_MS, ...(promised ? { promised: true } : {}) } })
      }
      const stronger = headersTimeoutFallback !== null ? 'http_headers_timeout'
        : cls === null && !subjectAsked && best === null && channel !== sessionFirst && channel.id !== 'authed_session' ? strongerRungMayAnswer(result, channel.id, next) : null
      if (stronger !== null && (result.evidence.httpStatus != null || result.markdown !== null)) progress.steppedPast = { channel: channel.id, result }

      ladderTrace.push({
        at: result.usage.wallMs,
        event: 'ladder_step',
        channel: channel.id,
        detail: {
          vendorId: channel.vendorId ?? null,
          status: result.status,
          failureClass: cls,
          escalate: subjectAsked ? 'subject_escalations' : stronger,
        },
      })

      if (cls === null && !subjectAsked && stronger === null) {
        // Infrastructure failure or a terminal refusal, and the subject did
        // not ask for anything higher. If an earlier channel produced real
        // content, that content is still the answer — the failure does not
        // erase it. Otherwise stop and report honestly; the http evidence
        // kept here says the browser lane did not improve on it.
        if (best !== null) break
        return finish(withLowContentYield(failedAnswer(result), channelsTried), false)
      }

      if (cls !== null && !LADDER_CONTINUES_FAILURE_CLASS.has(cls) && !subjectAsked) {
        // rate_limited — a class that deliberately stops the ladder even
        // though it is "classified". Nothing higher answers a rate limit.
        if (best !== null) break
        return finish(result, false)
      }

      // cls is bot_gate / captcha_required / login_required / geo_blocked
      // (escalate to the next rung) or provider_error / identity_mismatch
      // (the other vendor is next), or the subject's own escalations array
      // asked for a higher lane. Either way the loop continues.
    }

    if (best !== null && bestChannel !== null && best !== last) {
      // The later rungs failed or came back worse: the best-so-far content is
      // the answer. Mark the improvement verdict on the escalations so the
      // record says which hops paid off and which did not.
      const finalEscalations = best.escalations.map((e) =>
        e.improved === null ? { ...e, improved: false } : e,
      )
      // The quality hop the ladder proposed (http → next lane) did not pay
      // off — the best result is still the http one. Record that verdict.
      if (
        qualityEscalation !== null &&
        !finalEscalations.some(
          (e) => e.from === qualityEscalation!.from && e.to === qualityEscalation!.to,
        )
      ) {
        finalEscalations.push({ ...qualityEscalation, improved: false })
      }
      ladderTrace.push({
        at: best.usage.wallMs,
        event: 'ladder_best_kept',
        channel: bestChannel.id,
        detail: { channel: bestChannel.id, vendorId: bestChannel.vendorId ?? null, size: bestSize },
      })
      // A thin http answer kept over the later rungs says so in its warnings.
      return finish(withLowContentYield({ ...best, escalations: finalEscalations }, channelsTried), false)
    }

    // A thin http answer with no further rung to offer it to says so too.
    const final = best ?? (last === null ? null : failedAnswer(last)) ?? this.governanceRefusal(url, 'no permitted channel was configured')
    return finish(withLowContentYield(sanitizeResult(final), channelsTried), false)
  }

  // -------------------------------------------------------------------------

  private async orderProviders(url: string, providers: readonly Channel[], route: RouteContext, ladderTrace: LadderProgress['ladderTrace']): Promise<readonly Channel[]> {
    if (providers.length === 0 || this.history === null) return providers
    const declared = providers.map((p) => p.vendorId!)
    const host = safeHost(url)
    let domainHistory: DomainHistory
    try {
      domainHistory = await this.history.read(host, route)
    } catch (error) {
      // One provider needs no history to be ordered: a read made only for the shadow does not stop the run.
      if (providers.length > 1) throw error
      ladderTrace.push({ at: 0, event: 'vendor_rank_shadow', channel: '—', detail: { family: route.family, declared, actual: declared, shadow: null, differs: null, fallbackReasons: [], candidates: [], error: 'history_unreadable' } })
      return providers
    }
    // What the store says of its read (the route history's): taken at once, before anything else reads it.
    const told = this.history as { lastBases?: Record<string, string>; lastThin?: Record<string, number>; lastExpired?: Record<string, string> }
    const readBases = told.lastBases === undefined ? null : { ...told.lastBases }
    const thin = told.lastThin === undefined ? undefined : { ...told.lastThin }
    const expired = told.lastExpired === undefined ? undefined : { ...told.lastExpired }
    const ordered = this.rankedProviders(providers, domainHistory)
    // The unit-cost ranking (PA G3) is a shadow: written beside the order taken, never taking it.
    const shadow = shadowRankVendors(domainHistory, declared, {
      environments: Object.fromEntries(providers.map((p) => [p.vendorId!, rungEnvironment(p)])),
      ...(thin === undefined ? {} : { thin }),
      ...(expired === undefined ? {} : { expired }),
    })
    const actual = ordered.map((p) => p.vendorId!)
    ladderTrace.push({
      at: 0,
      event: 'vendor_rank_shadow',
      channel: '—',
      detail: {
        family: route.family,
        declared,
        actual,
        shadow: shadow.order,
        // A fallback ranked nothing, so there is nothing to compare: null, not a disagreement.
        differs: shadow.fallbackReasons.length > 0 ? null : shadow.order.some((id, i) => id !== actual[i]),
        fallbackReasons: shadow.fallbackReasons,
        candidates: shadow.candidates,
        readBases,
      },
    })
    return ordered
  }

  /** The order the ladder takes: rankVendors' ranking with startingVendor's rotation. */
  private rankedProviders(providers: readonly Channel[], domainHistory: DomainHistory): readonly Channel[] {
    if (providers.length <= 1) return providers
    const ranked = rankVendors(
      domainHistory,
      providers.map((p) => p.vendorId!),
    )
    const first = startingVendor(ranked, domainHistory)
    if (first === null) return providers
    return [
      ...providers.filter((p) => p.vendorId === first),
      ...providers.filter((p) => p.vendorId !== first),
    ]
  }

  private async recordVendorOutcome(
    url: string,
    vendorId: string,
    result: FetchResult,
    cls: RoutingFailureClass | null,
    verified: boolean | null,
    observation: RouteObservation,
    route: RouteContext,
  ): Promise<void> {
    const outcome: VendorOutcome = {
      contentful: CONTENTFUL_STATUS.has(result.status),
      verified,
      wallMs: result.usage.wallMs,
      costUsd: result.usage.externalCostUsd,
      failureClass: cls,
      observation,
    }
    await this.history?.record(safeHost(url), vendorId, outcome, route)
  }

  /**
   * One rung's fetch. A provider is called only at a known price ceiling, reserved from the run's ledger first and settled
   * after it, at the price it reported or at the ceiling, a call that threw or was cut included (ROADMAP PA item 4). Null
   * when it was not called, with the reason in the trace; `onCall` hears of the call just before it goes out.
   */
  /**
   * One call of a rung, asked of its own admission first (Channel.admit): refused, it is skipped (null) and says why;
   * admitted, it is settled once with what the call read, also when the call threw.
   */
  private async paidFetch(channel: Channel, label: string, url: string, session: SessionSnapshot | null | undefined, execution: ExecutionContext, options: FetchOptions, progress: LadderProgress, onCall: () => void): Promise<FetchResult | null> {
    if (channel.admit === undefined) return await this.meteredFetch(channel, label, url, session, execution, options, progress, onCall)
    const asked = channel.admit(url, execution)
    let admission: ChannelAdmission
    try { admission = await raceWithSignal(asked, execution.signal) } catch (error) {
      // Cut while the admission was answering: one that admits the call late is settled as a call that never went out.
      void asked.then((late) => late.ok ? late.settle(null, false) : undefined).catch(() => {})
      throw error
    }
    if (!admission.ok) {
      progress.ladderTrace.push({ at: Math.round(performance.now() - progress.startedAt), event: 'ladder_channel_skipped', channel: label, detail: { reason: admission.reason, ...admission.detail } })
      if (!progress.notAdmitted.some((held) => held.code === admission.warning.code && held.message === admission.warning.message)) progress.notAdmitted.push(admission.warning)
      return null
    }
    let called = false
    let result: FetchResult | null = null
    try {
      result = await this.meteredFetch(channel, label, url, session, execution, options, progress, () => { called = true; onCall() })
      return result
    } finally {
      // The admission's own failure to settle is its to report: the page it paid for is still the answer.
      await admission.settle(result, called).catch(() => {})
    }
  }

  private async meteredFetch(channel: Channel, label: string, url: string, session: SessionSnapshot | null | undefined, execution: ExecutionContext, options: FetchOptions, progress: LadderProgress, onCall: () => void): Promise<FetchResult | null> {
    const { ladderTrace } = progress
    let reservation: SpendReservation | null = null
    const ceiling = channel.vendorId === undefined ? undefined : channel.priceCeilingUsd ?? null
    if (ceiling === null) {
      ladderTrace.push({ at: 0, event: 'ladder_channel_skipped', channel: label, detail: { vendorId: channel.vendorId ?? null, reason: 'no price ceiling: the access grant names no tariff for this provider, and a provider whose cost has no upper bound is not called' } })
      return null
    }
    // The call's row in the task's paid_calls (PA E3), its id fixed before the reservation; none outside a task.
    const log = ceiling === undefined ? undefined : execution.paidCalls
    let row: PaidCallRecord | null = log === undefined || ceiling === undefined ? null : log.open({
      url, vendorId: channel.vendorId ?? channel.id, ceilingUsd: ceiling, tariffVersion: channel.tariffVersion ?? null,
      grantHash: channel.grant?.sha256 ?? null, deadline: execution.deadlineAt === undefined ? null : new Date(execution.deadlineAt).toISOString(),
    })
    // The row's writes in order: a session named mid-call is written without holding the call up, and the outcome after it.
    // A write that fails does not stop the ones after it.
    let writing: Promise<void> = Promise.resolve()
    const save = (next: PaidCallRecord): Promise<void> => {
      row = next
      writing = writing.catch(() => {}).then(() => log!.write(next))
      return writing
    }
    if (ceiling !== undefined) {
      // A caller with no budget gave no ledger: the run keeps one of its own, uncapped, so the call is still settled and on the record.
      const ledger = execution.spend ?? (progress.ledger ??= createSpendLedger(null))
      reservation = ledger.reserve(ceiling)
      if (reservation === null) {
        ladderTrace.push({ at: 0, event: 'ladder_channel_skipped', channel: label, detail: { vendorId: channel.vendorId ?? null, reason: 'budget: its price ceiling does not fit what the run (or this request) has left', ceilingUsd: ceiling, settledUsd: ledger.settledUsd, reservedUsd: ledger.reservedUsd, capUsd: ledger.capUsd } })
        return null
      }
      if (row !== null) {
        // Written before the call goes out: a crash after it leaves the reservation on the record (PA E3).
        try { await save(row) } catch (error) { reservation.release(); throw error }
        if (execution.signal?.aborted === true) {
          // Cut before the call went out: the reservation comes back, and the row says so.
          reservation.release()
          await save({ ...row, state: 'released', settledAt: new Date().toISOString() }).catch(() => {})
          throw execution.signal.reason
        }
      }
    }
    onCall()
    // A local rung's CAPTCHA solves are counted for the page and put on its paid calls as the ledger settles each.
    const named = ceiling === undefined ? { ...execution, captchaSolves: solveLog(progress, channel) } : row === null ? execution : {
      ...execution,
      paidCallId: row.paidCallId,
      onPaidSession: ({ providerSessionId, providerRequestId }: { providerSessionId: string; providerRequestId?: string }) => {
        if (row === null) return
        void save({ ...row, state: row.state === 'reserved' ? 'submitted' : row.state, providerSessionId, providerRequestId: row.providerRequestId ?? providerRequestId ?? null }).catch(() => {})
      },
    }
    // The row as the call ended: settled when its charge is known, usage_pending when the provider can still be asked (a
    // session is named), else unknown, its charge never written as known.
    const settleRow = async (state: PaidCallState, chargedUsd: number): Promise<void> => {
      if (row === null) return
      const pending = state === 'settled' ? 'settled' : row.providerSessionId !== null || row.providerRequestId !== null ? 'usage_pending' : 'unknown'
      await save({ ...row, state: pending, chargedUsd: pending === 'unknown' ? null : chargedUsd, settledAt: pending === 'usage_pending' ? null : new Date().toISOString() })
    }
    let result: FetchResult
    try {
      result = await raceWithSignal(channel.fetch(url, session, named, options), execution.signal)
    } catch (error) {
      // A call that threw, or that the deadline cut, may have opened a session that bills: it is charged at its ceiling.
      if (reservation !== null && ceiling !== undefined) {
        const charged = reservation.settle(null)
        await settleRow('unknown', charged).catch(() => {})
        const call = paidCall(progress, channel, label, ceiling, charged, null, null, null, {}, row?.paidCallId)
        ladderTrace.push({ at: Math.max(0, performance.now() - progress.startedAt), event: 'spend_settled', channel: label, detail: { vendorId: channel.vendorId ?? null, ceilingUsd: ceiling, chargedUsd: charged, basis: 'ceiling', ended: 'without_an_answer', call } })
      }
      throw error
    }
    if (reservation === null || ceiling === undefined) return withSolverCalls(progress, result)
    // The provider's stated price, else what its sessions' measured time costs under the tariff, else the ceiling.
    const reported = result.usage.externalCostUsd
    const measured = reported === null && typeof result.usage.measuredCostUsd === 'number' ? result.usage.measuredCostUsd : null
    const charged = reservation.settle(reported ?? measured)
    // Known: the provider's price, or a measure with every figure the provider was asked for. A figure it did not give was
    // charged at the ceiling's allowance, and the row waits for the provider's word.
    const known = reported !== null || (measured !== null && result.usage.vendorProxyBytes !== null && result.usage.vendorSolves !== null)
    // A settled row that cannot be written leaves the row open, for the next run to settle with the provider: the page
    // it paid for is still the answer.
    await settleRow(known ? 'settled' : 'usage_pending', charged).catch(() => {})
    const sessionMs = measured === null ? null : result.usage.vendorSessionMs ?? null
    // What the provider reported the sessions used, when the charge is measured: bytes through its proxy, solves.
    // What the transport's own meter counted the pages receiving goes on the call whatever the charge's basis (PA G1).
    const used = {
      ...(measured === null ? {} : { ...(result.usage.vendorProxyBytes === undefined ? {} : { proxyBytes: result.usage.vendorProxyBytes }), ...(result.usage.vendorSolves === undefined ? {} : { solves: result.usage.vendorSolves }), ...(result.usage.vendorProxyCountry === undefined ? {} : { proxyCountry: result.usage.vendorProxyCountry }) }),
      ...(result.usage.vendorBytesCounted === undefined ? {} : { bytesCounted: result.usage.vendorBytesCounted, bytesCapped: result.usage.vendorBytesCapped ?? null }),
    }
    const call = paidCall(progress, channel, label, ceiling, charged, reported, result, sessionMs, used, row?.paidCallId)
    // A measured charge above the ceiling: the provider's proxy moved more than the page's count, or it solved more than allowed for.
    const overCeiling = charged > ceiling + 1e-9
    return {
      ...result,
      usage: { ...result.usage, externalCostChargedUsd: (result.usage.externalCostChargedUsd ?? 0) + charged },
      trace: [...result.trace, { at: result.usage.wallMs, lane: result.lane, event: 'spend_settled', detail: { vendorId: channel.vendorId ?? null, ceilingUsd: ceiling, chargedUsd: charged, basis: reported !== null ? 'reported' : measured !== null ? 'measured' : 'ceiling', ...(sessionMs === null ? {} : { sessionMs }), ...used, ...(overCeiling ? { overCeiling: true } : {}), call, ...(row === null ? {} : { paidCallId: row.paidCallId }) } }],
    }
  }

  private async attemptHandoff(
    url: string,
    result: FetchResult,
    channelsTried: string[],
    channel: Channel,
    session: SessionSnapshot | null,
    ladderTrace: LadderRunResult['ladderTrace'][number][],
    best: FetchResult | null,
    attempts: { channel: string; result: FetchResult }[],
    execution: ExecutionContext,
    options: FetchOptions,
    progress: LadderProgress,
  ): Promise<LadderRunResult> {
    ladderTrace.push({
      at: result.usage.wallMs,
      event: 'ladder_step',
      channel: channel.id,
      detail: {
        vendorId: channel.vendorId ?? null,
        status: result.status,
        handoff: result.handoff?.reason ?? 'handoff_requested',
        liveViewUrl: result.handoff?.liveViewUrl ?? null,
      },
    })

    // The blocked fetch may already carry vendor resume material (the
    // session the human is about to take over). Save it BEFORE prompting:
    // if the human acts in the live view, the very session they unblocked
    // is the one the retry must resume.
    if (
      this.sessionStore !== null &&
      result.resumeContext !== undefined &&
      result.resumeContext !== null
    ) {
      const blockedSnapshot: SessionSnapshot = {
        domain: safeHost(url),
        attestedBy: 'operator',
        attestedAt: new Date().toISOString(),
        vendor: channel.vendorId ?? 'browser_local_authed',
        resume: result.resumeContext as SessionSnapshot['resume'],
      }
      await this.sessionStore.save(blockedSnapshot)
      ladderTrace.push({
        at: result.usage.wallMs,
        event: 'ladder_session_saved',
        channel: channel.id,
        detail: { domain: blockedSnapshot.domain, vendor: blockedSnapshot.vendor, phase: 'before_handoff' },
      })
    }

    if (this.handoff === null) {
      // No human configured: report the pause point rather than loop forever.
      return { result: sanitizeResult(best ?? result), channelsTried, handoffRequested: true, ladderTrace, summary: summarize(channelsTried, attempts) }
    }
    const snapshot = await raceWithSignal(this.handoff.takeOver(url, result.handoff!, execution), execution.signal)
    if (snapshot === null) {
      return { result: sanitizeResult(best ?? result), channelsTried, handoffRequested: true, ladderTrace, summary: summarize(channelsTried, attempts) }
    }
    // Persist the human's session so the NEXT run — including an independent
    // process — resumes with it instead of asking again.
    if (this.sessionStore !== null) {
      await this.sessionStore.save(snapshot)
      ladderTrace.push({
        at: result.usage.wallMs,
        event: 'ladder_session_saved',
        channel: channel.id,
        detail: { domain: snapshot.domain, vendor: snapshot.vendor },
      })
    }
    // Retry on the same channel with the fresh session — the SAME still-live
    // vendor session the human unblocked, not a new one. One retry only:
    // a human who cannot clear it on the second pass cannot clear it.
    const retryIdentityBlock = refuseChannelIdentity(url, channel)
    if (retryIdentityBlock !== null) {
      ladderTrace.push({
        at: result.usage.wallMs,
        event: 'ladder_identity_refused',
        channel: `${channel.id}(retry)`,
        detail: {
          vendorId: channel.vendorId ?? null,
          reason: retryIdentityBlock.trace[0]?.detail?.reason ?? 'identity refused',
        },
      })
      return {
        result: retryIdentityBlock,
        channelsTried: [...channelsTried, `${channel.id}(retry)`],
        handoffRequested: false,
        ladderTrace,
        summary: summarize([...channelsTried, `${channel.id}(retry)`], attempts),
      }
    }
    const retryStartedAt = new Date().toISOString()
    // The retry is a paid call like the first: reserved and settled, or not made when its ceiling does not fit.
    const paid = await this.paidFetch(channel, `${channel.id}(retry)`, url, snapshot, execution, options, progress, () => {})
    if (paid === null) {
      const tried = [...channelsTried, `${channel.id}(retry)`]
      ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_handoff_retry_failed', channel: `${channel.id}(retry)`, detail: { status: null, reason: 'not called: no price ceiling, or one the budget cannot hold' } })
      return { result: sanitizeResult(best ?? result), channelsTried: tried, handoffRequested: false, ladderTrace, summary: summarize(tried, attempts) }
    }
    const retry = paid
    attempts.push(attemptOf(channel, `${channel.id}(retry)`, retry, attempts.length + 1, retryStartedAt))
    ladderTrace.push({
      at: retry.usage.wallMs,
      event: 'ladder_step',
      channel: `${channel.id}(retry)`,
      detail: { vendorId: channel.vendorId ?? null, status: retry.status, afterHandoff: true },
    })
    if (!CONTENTFUL_STATUS.has(retry.status) || identityCompromised(retry.trace)) {
      // The human's pass did not yield acceptable content. Keep the best we
      // had and say plainly that the handoff did not clear it — never
      // "still needs a human" after the human already acted.
      ladderTrace.push({
        at: retry.usage.wallMs,
        event: 'ladder_handoff_retry_failed',
        channel: `${channel.id}(retry)`,
        detail: { status: retry.status },
      })
      const tried = [...channelsTried, `${channel.id}(retry)`]
      return { result: sanitizeResult(best ?? retry), channelsTried: tried, handoffRequested: false, ladderTrace, summary: summarize(tried, attempts) }
    }
    const tried = [...channelsTried, `${channel.id}(retry)`]
    return { result: sanitizeResult(retry), channelsTried: tried, handoffRequested: false, ladderTrace, summary: summarize(tried, attempts) }
  }

  private governanceRefusal(url: string, reason: string): FetchResult {
    return {
      requestedUrl: url,
      status: 'failed',
      failureReason: 'policy_denied',
      blockReason: null,
      budgetExceeded: null,
      lane: 'http',
      escalations: [],
      handoff: null,
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
        wallMs: 0,
        bytesWire: 0,
        bytesDecompressed: 0,
        requestCount: 0,
        attemptCount: 0,
        contentTokens: null,
        browserMs: 0,
        externalCostUsd: 0,
      },
      trace: [{ at: 0, lane: 'http', event: 'governance_refusal', detail: { reason } }],
    }
  }

  /** waitFor was asked for, and no configured rung can wait: say so rather than answer without it. */
  private waitForUnavailable(url: string, waitFor: number, skipped: readonly string[]): FetchResult {
    const reason = 'waitFor needs a browser rung that runs scripts and waits before capture; none is configured for this URL'
    return {
      ...this.governanceRefusal(url, reason),
      trace: [{ at: 0, lane: 'http', event: 'wait_for_unavailable', detail: { reason, waitFor, skipped } }],
    }
  }
}

/** Whether a provider refused the URL under robots.txt (a rule, or a robots.txt it could not read) before it called the provider. */
function refusedUnderRobots(result: FetchResult): boolean {
  return result.status === 'failed' && result.failureReason === 'policy_denied'
    && result.trace.some((event) => event.event === 'provider_refused' && (event.detail?.refusal === 'robots_disallowed' || event.detail?.refusal === 'robots_unreachable'))
}

/** Whether an applied override set aside a rule the publisher wrote, not only a robots.txt that could not be read (its `unreachable`). */
function setAsideARule(applied: RobotsOverrideApplied): boolean {
  return applied.trace.some((event) => event.event === 'robots_overridden' && event.detail?.unreachable === undefined)
}

/**
 * A rung that set a robots.txt rule aside went on to fetch, whatever answer
 * the run ends with. When that answer is not such a rung's own result (a
 * later rung's refusal or skip, a timeout built for a rung the deadline cut
 * before it returned), it still says so: the rungs' robots events open its
 * trace, each with its lane, and the `robots_overridden` warning leads its
 * warnings. A result that already carries them is left as it is.
 */
function carryRobotsOverride(run: LadderRunResult, applied: readonly RobotsOverrideApplied[]): LadderRunResult {
  const last = applied.at(-1)
  if (last === undefined) return run
  const { result } = run
  const traced = result.trace.some((event) => event.event === 'robots_overridden')
  const warned = result.warnings?.some((warning) => warning.code === 'robots_overridden') === true
  if (traced && warned) return run
  return {
    ...run,
    result: {
      ...result,
      ...(warned ? {} : { warnings: [last.warning, ...(result.warnings ?? [])] }),
      ...(traced ? {} : { trace: [...applied.flatMap((rung) => rung.trace), ...result.trace] }),
    },
  }
}

/** The caller's deadline ended this execution. Cancellation and shutdown are not deadlines. */
function deadlineReached(execution: ExecutionContext): boolean {
  if (execution.signal?.aborted) return (execution.signal.reason as { name?: unknown } | null | undefined)?.name === 'TimeoutError'
  return execution.deadlineAt !== undefined && Date.now() >= execution.deadlineAt
}

/**
 * The run's answer when its deadline cut it short: the largest clean
 * contentful result any rung produced, as `partial`, or `failed`/`timeout`
 * when there is none (the rung's own timeout result when it returned one, or
 * the result that kept a page as evidence when its rung found no main
 * content, with that page). Either way the result says the deadline ended
 * it, in its trace and usage.
 */
/** The pending shadow decision, written beside the action the ladder took, once. */
function writeDecision(progress: LadderProgress, actual: LadderAction): void {
  const pending = progress.pendingDecision
  if (pending === null || pending === undefined) return
  progress.pendingDecision = null
  progress.ladderTrace.push(ladderActionDecisionEvent(pending.at, pending.channel, pending.decision, actual))
}

function deadlineOutcome(url: string, progress: LadderProgress, returned: FetchResult | null): LadderRunResult {
  writeDecision(progress, 'stop')
  const { startedAt, channelsTried, ladderTrace, attempts } = progress
  const at = Math.max(0, performance.now() - startedAt)
  // The rung the deadline cut: the one that returned its timeout, or the one
  // still running (tried, with no attempt yet). Null between rungs.
  const interrupted = returned !== null || attempts.length < channelsTried.length ? channelsTried.at(-1) ?? null : null
  let best: LadderAttempt | null = null
  for (const attempt of attempts) {
    const { result } = attempt
    // As in the run: a rung that found the page blocked gives up an earlier answer without content.
    if (result.status === 'blocked' && best !== null && contentSize(best.result) === 0) best = null
    if (!CONTENTFUL_STATUS.has(result.status) || identityCompromised(result.trace)) continue
    if (best === null || contentSize(result) > contentSize(best.result)) best = attempt
  }
  const detail = { channel: interrupted, kept: best?.channel ?? null }
  ladderTrace.push({ at, event: 'ladder_deadline_exceeded', channel: interrupted ?? '—', detail })
  let result: FetchResult
  if (best !== null) {
    const event: TraceEvent = { at, lane: best.result.lane, event: 'deadline_exceeded', detail }
    result = { ...best.result, status: 'partial', failureReason: null, blockReason: null, budgetExceeded: null, usage: { ...best.result.usage, deadlineExceeded: true }, trace: [...best.result.trace, event] }
  } else {
    // A page a rung kept as evidence when it found no main content stays on
    // the timeout, as evidence.
    const evidence = noMainContentEvidence(attempts)
    // Else the page a rung was stepped past for (a 403 the site answered), over a cut rung that returned no page.
    const stepped = evidence === null && (returned === null || returned.evidence.httpStatus == null) ? progress.steppedPast : null
    const base = evidence?.result ?? stepped?.result ?? (returned?.status === 'failed' ? returned : deadlineFailure(url, laneOf(interrupted), at))
    const kept = evidence?.channel ?? stepped?.channel ?? null
    const event: TraceEvent = { at, lane: base.lane, event: 'deadline_exceeded', detail: kept === null ? detail : { ...detail, evidence: kept } }
    result = { ...base, status: 'failed', failureReason: 'timeout', blockReason: null, budgetExceeded: null, markdown: evidence?.result.markdown ?? stepped?.result.markdown ?? null, usage: { ...base.usage, contentTokens: null, deadlineExceeded: true }, trace: [...base.trace, event] }
  }
  const summary = summarize(channelsTried, attempts)
  // A provider rung the deadline cut before it returned may have billed: its cost is unknown, not the 0 of the rungs that did return.
  const providerUnmeasured = interrupted !== null && attempts.length < channelsTried.length && laneOf(interrupted) === 'provider'
  const costed = providerUnmeasured ? { ...summary, externalCostUsd: null, externalCost: { ...summary.externalCost, unknown: true } } : summary
  return { result, channelsTried, handoffRequested: false, ladderTrace, summary: { ...costed, totalMs: at } }
}

/**
 * One call the ledger settled, added to the run's charge and to its paid calls: Octocrawl's verdict on the page the call
 * returned (null when it returned none), never the provider's word. Returns the call's number in the run.
 */
function paidCall(progress: LadderProgress, channel: Channel, rung: string, ceilingUsd: number, chargedUsd: number, reportedCostUsd: number | null, result: FetchResult | null, sessionMs: number | null = null, used: { proxyBytes?: number | null; solves?: number | null; proxyCountry?: string; bytesCounted?: number | null; bytesCapped?: boolean | null } = {}, paidCallId?: string): number {
  progress.charged = (progress.charged ?? 0) + chargedUsd
  progress.grant ??= channel.grant ?? null
  const call = progress.paidCalls.length + 1
  progress.paidCalls.push({
    provider: channel.vendorId ?? channel.id, rung, capabilities: [...(channel.grantCapabilities ?? [])], ceilingUsd, chargedUsd, reportedCostUsd, sessionMs,
    ...(used.proxyBytes === undefined ? {} : { proxyBytes: used.proxyBytes }), ...(used.solves === undefined ? {} : { solves: used.solves }), ...(used.proxyCountry === undefined ? {} : { proxyCountry: used.proxyCountry }),
    outcome: result?.status ?? null, reason: result === null ? null : result.failureReason ?? result.blockReason ?? result.budgetExceeded ?? null, call,
    ...(paidCallId === undefined ? {} : { paidCallId }),
    ...(used.bytesCounted === undefined ? {} : { bytesCounted: used.bytesCounted, bytesCapped: used.bytesCapped ?? null }),
  })
  return call
}

/**
 * One page's CAPTCHA solves across its rungs (ADR 0005 `third_party_captcha_solver`): the count `maxSolvesPerCall` bounds,
 * and each solve on the run's charge and paid calls the moment the rung's ledger settles it (at 0 for a task the vendor
 * failed and does not bill), its outcome unknown (null) until the rung returns a page (withSolverCalls), and left null
 * when it never does.
 */
function solveLog(progress: LadderProgress, channel: Channel): CaptchaSolveLog {
  return {
    used: () => progress.solves,
    charged: (solve) => {
      progress.solves++
      progress.charged = (progress.charged ?? 0) + solve.chargedUsd
      progress.grant ??= channel.grant ?? null
      const call = progress.paidCalls.length + 1
      progress.paidCalls.push({
        provider: solve.vendor, rung: solve.rung, capabilities: ['third_party_captcha_solver'], ceilingUsd: solve.ceilingUsd, chargedUsd: solve.chargedUsd,
        // Attempted and answered apart: a task the vendor failed is an attempt with no solve (smoke test 2026-10-25, T045).
        reportedCostUsd: solve.reportedCostUsd, sessionMs: null, solves: solve.solved ? 1 : 0, solveAttempts: 1, outcome: null, reason: null, call,
        ...(solve.paidCallId === undefined ? {} : { paidCallId: solve.paidCallId }),
      })
      return call
    },
    refused: () => { progress.solves++ },
  }
}

/**
 * A local rung's page after its solves: each solve's paid call gets Octocrawl's verdict on the page, and the page what
 * the ledger charged for them. The vendor states no price, so the page's own third-party cost is unknown (null), never 0.
 */
function withSolverCalls(progress: LadderProgress, result: FetchResult): FetchResult {
  let charged = 0
  let reportedAll = true
  let any = false
  for (const event of result.trace) {
    const call = event.event === 'captcha_solve' ? event.detail?.call : undefined
    const paid = typeof call === 'number' ? progress.paidCalls.find((entry) => entry.call === call) : undefined
    if (paid === undefined) continue
    any = true
    charged += paid.chargedUsd
    reportedAll &&= paid.reportedCostUsd !== null
    paid.outcome = result.status
    paid.reason = result.failureReason ?? result.blockReason ?? result.budgetExceeded ?? null
  }
  if (!any) return result
  const external = result.usage.externalCostUsd
  return { ...result, usage: { ...result.usage, externalCostUsd: reportedAll && external !== null ? external + charged : null, externalCostChargedUsd: (result.usage.externalCostChargedUsd ?? 0) + charged } }
}

/**
 * The answer's third-party spend is the whole run's, not the kept rung's: a local answer kept after a provider attempt still
 * cost what the provider charged, and an unknown charge anywhere in the run makes it unknown.
 */
/**
 * The run's cost on its answer: the exact total over its attempts (null when one is unknown), and what the ledger charged
 * them all; with every paid call of the run (`paid_calls`), the one whose page is the answer marked, for its record.
 */
/** The run's answer with the warnings of the rungs their own admission refused (Channel.admit), after its own. */
function withNotAdmitted(run: LadderRunResult, progress: LadderProgress): LadderRunResult {
  const added = progress.notAdmitted.filter((warning) => run.result.warnings?.some((held) => held.code === warning.code && held.message === warning.message) !== true)
  return added.length === 0 ? run : { ...run, result: { ...run.result, warnings: [...(run.result.warnings ?? []), ...added] } }
}

function withRunCost(run: LadderRunResult, progress: LadderProgress): LadderRunResult {
  const { externalCostChargedUsd: _attempt, ...usage } = run.result.usage
  const result: FetchResult = { ...run.result, usage: { ...usage, externalCostUsd: run.summary.externalCostUsd, ...(progress.charged === null ? {} : { externalCostChargedUsd: progress.charged }) } }
  if (progress.paidCalls.length === 0) return { ...run, result }
  // The answer is a paid call's page when its own trace holds that call's settlement, or the call of a solve made on it.
  const own = new Set(result.trace.filter((event) => event.event === 'spend_settled' || event.event === 'captcha_solve').map((event) => event.detail?.call).filter((call) => call !== undefined))
  return { ...run, result: { ...result, trace: [...result.trace, paidCallsEvent(progress, own, result.usage.wallMs, result.lane)] } }
}

/** The run's paid calls as one `paid_calls` event, the calls numbered in `answer` marked as the answer's. */
function paidCallsEvent(progress: LadderProgress, answer: ReadonlySet<unknown>, at: number, lane: Lane): TraceEvent {
  const calls: EvidencePaidCall[] = progress.paidCalls.map(({ call, ...paid }) => ({ ...paid, answer: answer.has(call) }))
  return { at, lane, event: 'paid_calls', detail: { calls, grant: progress.grant } }
}

/**
 * The latest attempt whose extractor found no main content and kept the whole
 * page as evidence (failed/empty_unverified with Markdown).
 */
function noMainContentEvidence(attempts: readonly LadderAttempt[]): LadderAttempt | null {
  for (let i = attempts.length - 1; i >= 0; i--) {
    const { result } = attempts[i]!
    if (result.status === 'failed' && result.failureReason === 'empty_unverified' && result.markdown !== null) return attempts[i]!
  }
  return null
}

/** A timeout for a rung the deadline interrupted before it returned anything. */
function deadlineFailure(url: string, lane: Lane, wallMs: number): FetchResult {
  return {
    requestedUrl: url,
    status: 'failed',
    failureReason: 'timeout',
    blockReason: null,
    budgetExceeded: null,
    lane,
    escalations: [],
    handoff: null,
    markdown: null,
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
    // The interrupted rung's traffic was not measured; the ladder summary holds what was.
    // A vendor rung may have billed before the deadline; a local one calls no third party.
    usage: { wallMs, bytesWire: null, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, contentTokens: null, browserMs: 0, externalCostUsd: lane === 'provider' ? null : 0 },
    trace: [],
  }
}

function laneOf(channelId: string | null): Lane {
  return channelId === 'provider' ? 'provider' : channelId === 'authed_session' ? 'browser_local_authed' : channelId === 'browser_local' || channelId === 'installed_chrome' || channelId === 'hosted_chrome' ? 'browser_local' : 'http'
}

/**
 * Scheduler-level L0: a product channel without a coherent declared identity
 * never reaches fetch. Skip rungs (no session / no vendor key) still declare
 * a bundle — skip is "this rung has nothing to offer", not "this rung has
 * no face". Missing or contradictory bundles stop the ladder; they do not
 * escalate into another invented identity.
 */
export function refuseChannelIdentity(url: string, channel: Channel): FetchResult | null {
  if (channel.identity === undefined) {
    return identityRefusedResult(url, channel, 'identity_unobserved', ['channel declared no identity bundle'])
  }
  const issues = identityBundleIssues(channel.identity)
  if (issues.length === 0) return null
  return identityRefusedResult(url, channel, 'identity_mismatch', issues)
}

function identityRefusedResult(
  url: string,
  channel: Channel,
  event: 'identity_mismatch' | 'identity_unobserved',
  issues: readonly string[],
): FetchResult {
  const lane = laneOf(channel.id)
  return {
    requestedUrl: url,
    status: 'failed',
    failureReason: 'identity_compromised',
    blockReason: null,
    budgetExceeded: null,
    lane,
    escalations: [],
    handoff: null,
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
      wallMs: 0,
      bytesWire: 0,
      bytesDecompressed: 0,
      requestCount: 0,
      attemptCount: 0,
      contentTokens: null,
      browserMs: 0,
      externalCostUsd: 0,
    },
    trace: [
      {
        at: 0,
        lane,
        event,
        detail: { reason: event === 'identity_unobserved' ? 'missing identity bundle' : 'contradictory identity bundle', issues },
      },
    ],
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return url
  }
}

/** A path segment that is a login endpoint (`/login`, `/users/sign_in`, `/ap/signin`, `/login.php`, `/authwall`), not a slug that mentions one. */
const LOGIN_SEGMENT = /^(?:log[-_]?in|sign[-_]?in|sign[-_]?on|authwall|servicelogin)(?:\.(?:php|aspx?|html?|jsp))?$/i
export const isLoginPath = (pathname: string): boolean => pathname.split('/').some((segment) => LOGIN_SEGMENT.test(segment))

/**
 * A page's own request to sign in, as a line begins: to see it, to go on, or
 * because it requires one. A line that only names signing in ("Sign in", a
 * header link), or mentions it after other words ("Step 2: Sign in to
 * continue"), is not one.
 */
const SIGN_IN_PROMPT = /^(?:(?:log|sign)\s?in\s+to\s+(?:view|see|continue|access|read|use)\b|you\s+(?:must|need\s+to)\s+(?:be\s+)?(?:logged|signed)\s+in\b|please\s+(?:log|sign)\s?in\b|(?:log|sign)\s?in\s+(?:is\s+)?required\b)/i

/** How far down a page its own sign-in prompt stands: within its first lines, before the content a signed-in page shows. */
const SIGN_IN_PROMPT_LINES = 8

/** Lines longer than this are prose that may mention signing in, not a page asking for it. */
const SIGN_IN_PROMPT_MAX_LINE = 120

/**
 * The line near the top of a page's Markdown that asks the reader to sign in
 * ("Log in to view your wishlists", "You must be logged in to see this
 * page"), or null. Only a heading or a plain line among the first
 * SIGN_IN_PROMPT_LINES counts, and it must begin with the request: a table
 * row, a list item, a quote or a line with a link is the page's content (an
 * issue titled "Login required error", an email asking to sign in, an offer
 * for another area), never its request to the reader; so is a line its
 * `title` names (the heading of one issue, ticket or question whose subject
 * begins with the words, "Please log in again #1411").
 */
export function signInPrompt(markdown: string | null | undefined, title?: string | null): string | null {
  const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const named = ` ${words(title ?? '')} `
  // The page's own lines: not those of a code block, nor a list item's indented continuation.
  let fenced = false
  const own = (markdown ?? '').split('\n').filter((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; return false }
    return !fenced && !/^(?: {2,}|\t)/.test(line)
  })
  const lines = own.map((line) => line.trim()).filter((line) => line.length > 0).slice(0, SIGN_IN_PROMPT_LINES)
  for (const raw of lines) {
    if (/^(?:\||[-*+]\s|\d+[.)]\s|>)/.test(raw) || raw.includes('](')) continue
    const line = raw.replace(/^#{1,6}\s+/, '')
    // The page's subject, as its title names it (its first words, an issue's number dropped, in the title in order): not a request to the reader.
    if (named.trim() !== '' && named.includes(` ${words(line.replace(/\s+#\d+$/, '')).split(' ').slice(0, 6).join(' ')} `)) continue
    if (line.length <= SIGN_IN_PROMPT_MAX_LINE && SIGN_IN_PROMPT.test(line)) return line
  }
  return null
}

/** A page that redirected from the one asked for to a login page: a path segment that is a login endpoint, which the requested path did not have. */
function redirectedToLogin(url: string, result: FetchResult): boolean {
  try {
    const requested = new URL(url)
    const landed = new URL(result.evidence.finalUrl)
    return landed.href !== requested.href && !isLoginPath(requested.pathname) && isLoginPath(landed.pathname)
  } catch {
    return false
  }
}

/**
 * The result of a fetch with the user's saved login when the site refused
 * that login, else null: a `login_wall` block, a page that redirected from
 * the one asked for to a login page, or a page that asks for a sign-in in
 * place (signInPrompt), as a site does for a login that expired or was
 * signed out without redirecting. The site's login page is not the page
 * asked for, so it is never answered as its content.
 */
export function sessionRejection(url: string, result: FetchResult): FetchResult | null {
  if (result.status === 'blocked' && result.blockReason === 'login_wall') return result
  if (!CONTENTFUL_STATUS.has(result.status)) return null
  if (!redirectedToLogin(url, result) && signInPrompt(result.markdown, result.metadata?.title) === null) return null
  return { ...result, status: 'blocked', blockReason: 'login_wall', failureReason: null }
}
