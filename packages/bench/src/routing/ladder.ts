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

import type { ExecutionContext, Escalation, FetchOptions, FetchResult, HandoffRequest, IdentityBundle, Lane, LadderAttempt, LadderExecutionSummary, Meter, TraceEvent } from '@w2l/contracts'
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
  /** Run the channel against url, optionally with a user session attached. */
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
 * a successful HTTP extraction was thin and low-confidence. The ladder
 * honours the subject's own ask rather than re-deriving it.
 */
function resultRequestsEscalation(result: FetchResult): boolean {
  return (
    result.escalations.some((e) => e.improved === null) ||
    result.trace.some((t) => t.event === 'quality_low_yield')
  )
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
    return {
      ...result,
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
   *   3. `quality_low_yield` — a thin, low-confidence success from the http
   *      lane gets offered to a higher lane instead of being the answer.
   * All of it lands in `ladderTrace`. The signed compliance record remains
   * the winning subject's own; the ladder audit travels alongside it,
   * unrewritten and unsigned — that boundary is deliberate.
   *
   * The caller's deadline (a scrape's `timeout`) ends the run with a result,
   * never an error: the best content a rung produced so far as `partial`,
   * or `failed`/`timeout`. Cancellation and shutdown still reject.
   */
  async run(url: string, session?: SessionSnapshot | null, execution: ExecutionContext = {}, options: FetchOptions = {}): Promise<LadderRunResult> {
    const scope = createExecutionScope(execution)
    const progress: LadderProgress = { startedAt: performance.now(), channelsTried: [], ladderTrace: [], attempts: [] }
    try { return await this.runWithinBudget(url, session, scope, options, progress) }
    catch (error) {
      if (!deadlineReached(scope)) throw error
      return deadlineOutcome(url, progress, null)
    } finally { scope.dispose() }
  }

  private async runWithinBudget(url: string, session: SessionSnapshot | null | undefined, execution: ExecutionContext, options: FetchOptions, progress: LadderProgress): Promise<LadderRunResult> {
    const { startedAt, channelsTried, ladderTrace, attempts } = progress
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

        // Quality escalation: a thin, low-confidence http success is offered
        // to the next lane rather than accepted as the answer. The status is
        // NOT rewritten — the record keeps the real success and its real
        // token count; the ladder just isn't done yet.
        const thinHttp =
          channel.id === 'http' && result.trace.some((t) => t.event === 'quality_low_yield')

        // Worse-than-best: a later channel DID answer, but with less content
        // than an earlier one already produced. That is not an improvement —
        // the ladder keeps going, and if nothing better shows up the best
        // result is the answer.
        if (thinHttp || worseThanBest) {
          if (thinHttp && qualityEscalation === null) {
            // The ladder itself proposed this hop; remember it so the final
            // result can say whether it improved things or not.
            qualityEscalation = {
              from: 'http',
              to: 'browser_local',
              trigger: 'quality_low_yield',
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
              escalate: thinHttp ? 'quality_low_yield' : 'worse_than_best',
            },
          })
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
        // erase it. Otherwise stop and report honestly.
        if (best !== null) break
        return finish(result, false)
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
      return finish({ ...best, escalations: finalEscalations }, false)
    }

    const final = best ?? last ?? this.governanceRefusal(url, 'no permitted channel was configured')
    return finish(sanitizeResult(final), false)
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

/** The caller's deadline ended this execution. Cancellation and shutdown are not deadlines. */
function deadlineReached(execution: ExecutionContext): boolean {
  if (execution.signal?.aborted) return (execution.signal.reason as { name?: unknown } | null | undefined)?.name === 'TimeoutError'
  return execution.deadlineAt !== undefined && Date.now() >= execution.deadlineAt
}

/**
 * The run's answer when its deadline cut it short: the largest clean
 * contentful result any rung produced, as `partial`, or `failed`/`timeout`
 * when there is none (the rung's own timeout result when it returned one).
 * Either way the result says the deadline ended it, in its trace and usage.
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
    const base = returned?.status === 'failed' ? returned : deadlineFailure(url, laneOf(interrupted), at)
    const event: TraceEvent = { at, lane: base.lane, event: 'deadline_exceeded', detail }
    result = { ...base, status: 'failed', failureReason: 'timeout', blockReason: null, budgetExceeded: null, markdown: null, usage: { ...base.usage, contentTokens: null, deadlineExceeded: true }, trace: [...base.trace, event] }
  }
  return { result, channelsTried, handoffRequested: false, ladderTrace, summary: { ...summarize(channelsTried, attempts), totalMs: at } }
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
