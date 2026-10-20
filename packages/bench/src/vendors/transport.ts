import { createExecutionScope, throwIfExecutionStopped } from '@w2l/http-core'
/**
 * Shared CDP-vendor transport: one vendor session per run, the vendor's own
 * default context, and the vendor's own identity — measured, not asserted.
 *
 * Why measured. The provider gate evaluates robots.txt against the UA the
 * provider ACTUALLY SENDS. Browserbase offers no session-level UA field, and
 * Playwright over CDP is explicitly lower-fidelity than its own protocol, so
 * any UA we tried to impose would be a claim we could not prove reached the
 * wire. Reading `navigator.userAgent` off the live session and declaring THAT
 * is provable, and it is also the honest question to ask: a publisher's
 * robots.txt binds the identity their access log will show.
 *
 * If the measured UA changes across sessions, the transport refuses to fetch
 * rather than keep using a declaration the gate already cleared. A vendor that
 * silently upgraded its engine is not a vendor whose old permission still
 * holds.
 */

import type { PolicyDecision, VendorSessionUsage } from '@w2l/http-core'
import type { ProviderResponse, ProviderTransport } from '../subjects/provider.js'
import type { RegionSpec } from '../regionWait.js'
import { scrubSecret } from './api.js'
import {
  ByteMeter,
  measureUserAgent,
  navigateOnce,
  playwrightConnector,
  type CdpBrowser,
  type CdpConnector,
} from './cdp.js'

export interface VendorSession {
  sessionId: string
  /** CDP websocket endpoint. May embed a credential (Steel does). */
  connectUrl: string
  /**
   * A live view for a human to take over the session, when the policy
   * enabled live_view_handoff and the vendor could produce one. Null means
   * "no handoff door was opened", not "there is no door".
   */
  handoffUrl: string | null
  /**
   * What to pass to a future createSession to restore this session's state
   * (cookies, storage, profile). Null when the vendor cannot persist or the
   * policy did not authorize session_persistence.
   */
  resumeContext: VendorResumeContext | null
}

/**
 * Vendor-specific resume material. The session store persists this per domain;
 * the ops layer translates it to wire fields (Browserbase context.id,
 * Steel profileId / sessionContext).
 */
export interface VendorResumeContext {
  browserbaseContextId?: string
  steelProfileId?: string
  steelSessionContext?: SteelSessionContextLike
}

/**
 * Structural shape of Steel's sessionContext (cookies + storage), declared
 * here so the session store can hold it without importing vendor types.
 */
export interface SteelSessionContextLike {
  cookies?: readonly SteelCookieLike[]
  localStorage?: Record<string, Record<string, string>>
  sessionStorage?: Record<string, Record<string, string>>
}

export interface SteelCookieLike {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

/** What differs between vendors: how sessions start and stop, and which
 *  strings are secrets that must never leave in an error message. */
export interface VendorOps {
  vendorId: string
  secrets: readonly string[]
  /** The policy decision this ops instance obeys (three-layer split). */
  decision: PolicyDecision
  createSession(resume?: VendorResumeContext | null, deadlineMs?: number, signal?: AbortSignal): Promise<VendorSession>
  releaseSession(sessionId: string, deadlineMs?: number, signal?: AbortSignal): Promise<void>
  /**
   * What a released session used besides time, as the provider reports it (ROADMAP PA item 4): the bytes its proxy
   * moved and the CAPTCHAs it solved. Null, or absent, when the provider reports none; a field it does not report is
   * null, never zero. Asked once per session, after its release is confirmed.
   */
  sessionUsage?(sessionId: string, deadlineMs?: number, signal?: AbortSignal): Promise<VendorSessionUsage | null>
  /**
   * What a live session has used so far, for the figures the provider stops answering for once the session is released
   * (Steel's captchas status answers 404 some time after a release). Asked once, just before the release; a field it
   * gives here wins over `sessionUsage`'s.
   */
  liveUsage?(sessionId: string, deadlineMs?: number, signal?: AbortSignal): Promise<Partial<VendorSessionUsage> | null>
  /**
   * The bounds a tariff puts on one session (ROADMAP PA item 4): the most bytes its pages may receive before the
   * transport ends it (null: uncounted), and the country its residential proxy was asked for (null: none).
   */
  limits?: { maxBytesPerCall: number | null; proxyCountry: string | null }
  /**
   * Establish first-use persistence, when the policy authorized
   * session_persistence and no saved resume context exists yet: Browserbase
   * creates a persistent context and returns its id, Steel ensures the
   * profile is created so a later response can persist it. Returns resume
   * material, or null when the vendor has no such operation.
   */
  ensurePersistence?(deadlineMs?: number, signal?: AbortSignal): Promise<VendorResumeContext | null>
}

interface LiveSession {
  sessionId: string
  browser: CdpBrowser
  handoffUrl: string | null
  resumeContext: VendorResumeContext | null
  /** Just before the session was asked for (`performance.now()`): the provider bills from its creation. */
  openedAt: number
  /** Counts what the session's pages receive, under a tariff with maxBytesPerCall; null otherwise. */
  meter: ByteMeter | null
}

/**
 * A session this transport closed: how long it lasted, whether the provider confirmed its release, what it used as the
 * provider reports it, and what its pages received as this transport counted it (null when it did not count).
 */
export interface ClosedVendorSession {
  sessionMs: number
  released: boolean
  /** The provider's figures after release (`VendorOps.sessionUsage`); null when it gives none, or the release failed. */
  usage?: VendorSessionUsage | null
  /** Bytes the session's pages received, as CDP reported them here; null when the transport did not count. */
  bytesCounted?: number | null
  /** True when the transport ended the session at the tariff's maxBytesPerCall. */
  bytesCapped?: boolean
}

export class CdpVendorTransport implements ProviderTransport {
  private live: LiveSession | null = null
  private readonly closed: ClosedVendorSession[] = []
  private declaredUserAgent: string | null = null
  private resume: VendorResumeContext | null = null

  constructor(
    private readonly ops: VendorOps,
    private readonly connector: CdpConnector = playwrightConnector,
  ) {}

  /**
   * Route this transport's sessions through a previously saved vendor
   * context (cookies, profile, storage) — the mechanism by which an
   * authorized persistent session survives across runs. Only the ops layer
   * knows how to encode the context on the wire.
   */
  useResumedSession(resume: VendorResumeContext | null): void {
    this.resume = resume
  }

  /**
   * Open the session if needed and report the UA it actually runs. Costs one
   * session create and one CDP connect against the VENDOR — no origin is
   * touched, because the page never leaves about:blank. The session stays open
   * for reuse: paying for a throwaway probe session would double the price of
   * being honest.
   */
  async resolveUserAgent(deadlineMs?: number, signal?: AbortSignal): Promise<string> {
    const scope = createExecutionScope({ signal, deadlineAt: deadlineMs })
    try { return await this.resolveWithinBudget(deadlineMs, scope.signal) } finally { scope.dispose() }
  }

  private async resolveWithinBudget(deadlineMs?: number, signal?: AbortSignal): Promise<string> {
    throwIfExecutionStopped({ signal, deadlineAt: deadlineMs })
    if (this.declaredUserAgent !== null) return this.declaredUserAgent
    const { browser } = await this.ensureSession(deadlineMs, signal)
    try {
      const ua = await measureUserAgent(browser, deadlineMs, signal)
      this.declaredUserAgent = ua
      return ua
    } catch (err) {
      await this.dropSession(deadlineMs)
      throw new Error(this.scrub(err instanceof Error ? err.message : String(err)))
    }
  }

  async fetch(url: string, deadlineMs?: number, signal?: AbortSignal, region?: RegionSpec): Promise<ProviderResponse> {
    const scope = createExecutionScope({ signal, deadlineAt: deadlineMs })
    try { return await this.fetchWithinBudget(url, deadlineMs, scope.signal, region) } finally { scope.dispose() }
  }

  private async fetchWithinBudget(url: string, deadlineMs?: number, signal?: AbortSignal, region?: RegionSpec): Promise<ProviderResponse> {
    const declared = await this.resolveUserAgent(deadlineMs, signal)
    const { browser, meter } = await this.ensureSession(deadlineMs, signal)
    try {
      const res = await navigateOnce(browser, url, deadlineMs, signal, region, meter ?? undefined)
      return {
        status: res.status,
        body: res.body,
        finalUrl: res.finalUrl,
        headers: res.headers,
        // Null when the CDP attachment did not surface request headers. The
        // subject treats that as unobserved, never as agreement.
        sentUserAgent: res.sentUserAgent,
        sentClientHints: res.sentClientHints,
        ...(res.settle === undefined ? {} : { settle: res.settle }),
        ...(res.region === undefined ? {} : { region: res.region }),
        documentGeneration: res.documentGeneration,
        responseMatch: res.responseMatch,
        declaredUserAgent: declared,
        // Neither vendor states a per-request price in its API response, and
        // an estimate in this field would read as a measurement.
        costUsd: null,
        // The live-view door and the resume context come from the session the
        // fetch actually ran in — they are facts about that session, not
        // about the transport's wishes.
        handoffUrl: this.live?.handoffUrl ?? null,
        resumeContext: this.live?.resumeContext ?? null,
      }
    } catch (err) {
      // The session is the likely casualty; drop it so the next fetch starts
      // clean rather than replaying against a dead browser.
      await this.dropSession(deadlineMs)
      throw new Error(this.scrub(err instanceof Error ? err.message : String(err)))
    }
  }

  async close(): Promise<void> {
    await this.dropSession()
  }

  private async ensureSession(deadlineMs?: number, signal?: AbortSignal): Promise<LiveSession> {
    throwIfExecutionStopped({ signal, deadlineAt: deadlineMs })
    if (this.live !== null) return this.live

    // A monotonic clock: a wall clock stepped back mid-session (a time sync, a laptop waking) would shorten the time charged.
    const openedAt = performance.now()
    let session: VendorSession
    try {
      session = await this.ops.createSession(this.resume, deadlineMs, signal)
    } catch (err) {
      throw new Error(this.scrub(err instanceof Error ? err.message : String(err)))
    }

    let browser: CdpBrowser
    try {
      browser = await this.connector(session.connectUrl, deadlineMs, signal)
    } catch (err) {
      await this.release(session.sessionId, openedAt)
      throw new Error(this.scrub(err instanceof Error ? err.message : String(err)))
    }

    if (this.declaredUserAgent !== null) {
      // A reconnect must still be the identity the gate cleared.
      let current: string
      try {
        current = await measureUserAgent(browser, deadlineMs, signal)
      } catch (err) {
        await browser.close().catch(() => {})
        await this.release(session.sessionId, openedAt)
        throw new Error(this.scrub(err instanceof Error ? err.message : String(err)))
      }
      if (current !== this.declaredUserAgent) {
        await browser.close().catch(() => {})
        await this.release(session.sessionId, openedAt)
        throw new Error(
          `${this.ops.vendorId}: session user agent changed from "${this.declaredUserAgent}" to ` +
            `"${current}". The identity the robots gate evaluated is not the identity on offer; ` +
            're-resolve the provider declaration and re-run the gate.',
        )
      }
    }

    const cap = this.ops.limits?.maxBytesPerCall ?? null
    this.live = {
      sessionId: session.sessionId,
      browser,
      handoffUrl: session.handoffUrl,
      resumeContext: session.resumeContext,
      openedAt,
      meter: cap === null ? null : new ByteMeter(cap),
    }
    return this.live
  }

  /** The sessions this transport has closed, in order: what a call under a tariff is charged by (ladderCli). */
  closedSessions(): readonly ClosedVendorSession[] {
    return this.closed
  }

  private async dropSession(_deadlineMs?: number): Promise<void> {
    const live = this.live
    this.live = null
    if (live === null) return
    await live.browser.close().catch(() => {})
    await this.release(live.sessionId, live.openedAt, live.meter)
  }

  /**
   * Release a session and record how long it lasted; a release that fails is recorded unconfirmed, never thrown. After a
   * confirmed release the provider is asked what the session used (bytes through its proxy, solves), when it can say.
   */
  private async release(sessionId: string, openedAt: number, meter: ByteMeter | null = null): Promise<void> {
    // The figures a provider only answers for while the session lives (Steel's solves), read before the release.
    let live: Partial<VendorSessionUsage> | null = null
    if (typeof this.ops.liveUsage === 'function') {
      try { live = await this.ops.liveUsage(sessionId, Date.now() + 3_000) } catch { live = null }
    }
    let released = true
    try {
      await this.ops.releaseSession(sessionId, Date.now() + 5_000)
    } catch {
      released = false
    }
    const sessionMs = Math.ceil(performance.now() - openedAt)
    let usage: VendorSessionUsage | null = null
    if (released && typeof this.ops.sessionUsage === 'function') {
      // Up to six seconds: a provider's figure can come some time after the release (Steel's proxyBytesUsed).
      try { usage = await this.ops.sessionUsage(sessionId, Date.now() + 6_000) } catch { usage = null }
    }
    if (usage !== null && live !== null) usage = { proxyBytes: live.proxyBytes ?? usage.proxyBytes, solves: live.solves ?? usage.solves }
    this.closed.push({
      sessionMs, released,
      ...(typeof this.ops.sessionUsage === 'function' ? { usage } : {}),
      ...(meter === null ? {} : { bytesCounted: meter.bytes, bytesCapped: meter.capped !== null }),
    })
  }

  private scrub(message: string): string {
    return this.ops.secrets.reduce((m, s) => scrubSecret(m, s), message)
  }
}
