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

import type { PolicyDecision } from '@w2l/http-core'
import type { ProviderResponse, ProviderTransport } from '../subjects/provider.js'
import { scrubSecret } from './api.js'
import {
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
}

/** A session this transport closed: how long it lasted, and whether the provider confirmed its release. */
export interface ClosedVendorSession {
  sessionMs: number
  released: boolean
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

  async fetch(url: string, deadlineMs?: number, signal?: AbortSignal): Promise<ProviderResponse> {
    const scope = createExecutionScope({ signal, deadlineAt: deadlineMs })
    try { return await this.fetchWithinBudget(url, deadlineMs, scope.signal) } finally { scope.dispose() }
  }

  private async fetchWithinBudget(url: string, deadlineMs?: number, signal?: AbortSignal): Promise<ProviderResponse> {
    const declared = await this.resolveUserAgent(deadlineMs, signal)
    const { browser } = await this.ensureSession(deadlineMs, signal)
    try {
      const res = await navigateOnce(browser, url, deadlineMs, signal)
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

    this.live = {
      sessionId: session.sessionId,
      browser,
      handoffUrl: session.handoffUrl,
      resumeContext: session.resumeContext,
      openedAt,
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
    await this.release(live.sessionId, live.openedAt)
  }

  /** Release a session and record how long it lasted; a release that fails is recorded unconfirmed, never thrown. */
  private async release(sessionId: string, openedAt: number): Promise<void> {
    let released = true
    try {
      await this.ops.releaseSession(sessionId, Date.now() + 5_000)
    } catch {
      released = false
    }
    this.closed.push({ sessionMs: Math.ceil(performance.now() - openedAt), released })
  }

  private scrub(message: string): string {
    return this.ops.secrets.reduce((m, s) => scrubSecret(m, s), message)
  }
}
