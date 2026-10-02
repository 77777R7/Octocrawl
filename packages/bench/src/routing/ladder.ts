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

import type { ExecutionContext, Escalation, FetchOptions, FetchResult, FetchWarning, HandoffRequest, IdentityBundle, Lane, LadderAttempt, LadderExecutionSummary, Meter, RobotsOverrideApplied, TraceEvent } from '@w2l/contracts'
import { CONTENTFUL_STATUS, identityBundleIssues } from '@w2l/contracts'
import {
  createExecutionScope,
  raceWithSignal,
  throwIfExecutionStopped,
  classifyFetchFailure,
  evaluateGovernance,
  LADDER_CONTINUES_FAILURE_CLASS,
  type CrawlPolicy,
  type RoutingFailureClass,
} from '@w2l/http-core'
import type { RoutingHistory, VendorOutcome } from './vendorRouter.js'
import { rankVendors, startingVendor } from './vendorRouter.js'
import { identityCompromised } from './identity.js'
import type { SessionSnapshot, SessionStore } from './sessionStore.js'

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
   * Run the channel against url, optionally with a user session attached. A
   * channel that sets a robots.txt rule aside (`options.robotsOverride`) says
   * so through `execution.onRobotsOverride` before its request goes out.
   */
  fetch(url: string, session?: SessionSnapshot | null, execution?: ExecutionContext, options?: FetchOptions): Promise<FetchResult>
  /** Release the channel's resources (browser processes, vendor sessions).
   *  The owner of the channel list calls this when the run is over. */
  close?(): Promise<void>
}

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
}

function summarize(channelsTried: readonly string[], attempts: readonly { channel: string; result: FetchResult }[]): LadderExecutionSummary {
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
function withLowContentYield(result: FetchResult, channelsTried: readonly string[]): FetchResult {
  if (result.lane !== 'http' || qualityEscalationEvent(result) === null) return result
  const evidence = result.status === 'failed' && result.failureReason === 'empty_unverified' && result.markdown !== null
  if (!CONTENTFUL_STATUS.has(result.status) && !evidence) return result
  if (result.warnings?.some((warning) => warning.code === 'low_content_yield') === true) return result
  return { ...result, warnings: [...(result.warnings ?? []), lowContentYieldWarning(result, channelsTried.some((channel) => channel !== 'http'))] }
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

export interface LadderRunnerOptions {
  channelsFiltered?: readonly ChannelsFiltered[]
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
    const progress: LadderProgress = { startedAt: performance.now(), channelsTried: [], ladderTrace: [], attempts: [], robotsOverrides: [] }
    for (const filtered of this.options.channelsFiltered ?? []) {
      progress.ladderTrace.push({ at: 0, event: 'ladder_channels_filtered', channel: '—', detail: { reason: filtered.reason, dropped: [...filtered.dropped] } })
    }
    // A rung says so the moment it sets a rule aside, so the run knows even when that rung never returns.
    const rungs: ExecutionContext = { ...scope, onRobotsOverride: (applied) => { progress.robotsOverrides.push(applied); execution.onRobotsOverride?.(applied) } }
    try { return carryRobotsOverride(await this.runWithinBudget(url, session, rungs, options, progress), progress.robotsOverrides) }
    catch (error) {
      if (!deadlineReached(scope)) throw error
      return carryRobotsOverride(deadlineOutcome(url, progress, null), progress.robotsOverrides)
    } finally { scope.dispose() }
  }

  private async runWithinBudget(url: string, session: SessionSnapshot | null | undefined, execution: ExecutionContext, options: FetchOptions, progress: LadderProgress): Promise<LadderRunResult> {
    const { startedAt, channelsTried, ladderTrace, attempts, robotsOverrides } = progress
    throwIfExecutionStopped(execution)
    const decision = evaluateGovernance(url, this.policy)
    const finish = (result: FetchResult, handoffRequested: boolean): LadderRunResult => {
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
      if (result.status !== 'failed' || result.markdown !== null || classifyFetchFailure(result) !== null) return result
      const kept = noMainContentEvidence(attempts)
      if (kept === null || kept.result === result) return result
      ladderTrace.push({ at: result.usage.wallMs, event: 'ladder_evidence_kept', channel: kept.channel, detail: { kept: kept.channel, failed: channelsTried.at(-1) ?? null, reason: result.failureReason } })
      return { ...kept.result, escalations: kept.result.escalations.map((e) => (e.improved === null ? { ...e, improved: false } : e)) }
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
            ? await raceWithSignal(this.sessionStore.load(safeHost(url)), execution.signal)
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
    const local = this.channels.filter((c) => c.vendorId === undefined && permitted.has(c.id))
    const providers = this.channels.filter((c) => c.vendorId !== undefined && permitted.has(c.id))

    let ordered = [...local, ...(await raceWithSignal(this.orderProviders(url, providers), execution.signal))]

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
      for (const channel of ordered) {
        throwIfExecutionStopped(execution)
        // A recorded robots override is the caller's decision for a fetch
        // from this machine, and the provider rung takes none. A run that set
        // a rule aside ends at its local rungs: no vendor session is opened
        // for that URL, and no vendor refusal replaces the local answer.
        if (channel.vendorId !== undefined && robotsOverrides.length > 0) {
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
        channelsTried.push(channel.id)
        const result = await raceWithSignal(channel.fetch(url, effectiveSession, execution, options), execution.signal)
        attempts.push({ channel: channel.id, result })
      // A rung the deadline cut short ends the run: nothing after it has time.
      if (result.usage.deadlineExceeded === true || (result.failureReason === 'timeout' && deadlineReached(execution))) {
        return deadlineOutcome(url, progress, result)
      }
      last = result
      if (result.retryAt !== undefined || execution.signal?.aborted) return finish(result, false)

      // Vendor attribution happens for every attempt, successful or not —
      // a vendor's win IS its history. The outcome is judged on the
      // SANITIZED result: an identity-compromised fetch counts as
      // contentful=0 with failureClass=identity_mismatch, exactly the
      // semantics every other layer uses.
      if (channel.vendorId !== undefined && this.history !== null) {
        const judged = sanitizeResult(result)
        const cls = classifyFetchFailure(judged)
        await this.recordVendorOutcome(url, channel.vendorId, judged, cls)
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
        const qualityEvent = channel.id === 'http' ? qualityEscalationEvent(result) : null
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
        return finish({ ...result, escalations: withImprovement }, false)
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
        return await this.attemptHandoff(url, result, channelsTried, channel, effectiveSession, ladderTrace, best, attempts, execution, options)
      }

      const cls = classifyFetchFailure(result)
      const subjectAsked = resultRequestsEscalation(result)

      ladderTrace.push({
        at: result.usage.wallMs,
        event: 'ladder_step',
        channel: channel.id,
        detail: {
          vendorId: channel.vendorId ?? null,
          status: result.status,
          failureClass: cls,
          escalate: subjectAsked ? 'subject_escalations' : null,
        },
      })

      if (cls === null && !subjectAsked) {
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

  private async orderProviders(url: string, providers: readonly Channel[]): Promise<readonly Channel[]> {
    if (providers.length <= 1 || this.history === null) return providers
    const host = safeHost(url)
    const domainHistory = await this.history.read(host)
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
  ): Promise<void> {
    const outcome: VendorOutcome = {
      contentful: CONTENTFUL_STATUS.has(result.status),
      wallMs: result.usage.wallMs,
      costUsd: result.usage.externalCostUsd ?? 0,
      failureClass: cls,
    }
    await this.history?.record(safeHost(url), vendorId, outcome)
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
    const retry = await raceWithSignal(channel.fetch(url, snapshot, execution, options), execution.signal)
    attempts.push({ channel: `${channel.id}(retry)`, result: retry })
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
        externalCostUsd: null,
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
function deadlineOutcome(url: string, progress: LadderProgress, returned: FetchResult | null): LadderRunResult {
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
    const base = evidence?.result ?? (returned?.status === 'failed' ? returned : deadlineFailure(url, laneOf(interrupted), at))
    const event: TraceEvent = { at, lane: base.lane, event: 'deadline_exceeded', detail: evidence === null ? detail : { ...detail, evidence: evidence.channel } }
    result = { ...base, status: 'failed', failureReason: 'timeout', blockReason: null, budgetExceeded: null, markdown: evidence?.result.markdown ?? null, usage: { ...base.usage, contentTokens: null, deadlineExceeded: true }, trace: [...base.trace, event] }
  }
  return { result, channelsTried, handoffRequested: false, ladderTrace, summary: { ...summarize(channelsTried, attempts), totalMs: at } }
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
    usage: { wallMs, bytesWire: null, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, contentTokens: null, browserMs: 0, externalCostUsd: null },
    trace: [],
  }
}

function laneOf(channelId: string | null): Lane {
  return channelId === 'provider' ? 'provider' : channelId === 'authed_session' ? 'browser_local_authed' : channelId === 'browser_local' ? 'browser_local' : 'http'
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
      externalCostUsd: null,
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
