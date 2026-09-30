/**
 * Origin-cached robots.txt lookup shared by the HTTP and browser arms.
 *
 * A 4xx or a non-text/plain body is "no robots.txt". A 5xx or network
 * failure is recorded as unreachable (`absent: false`, with `failure`
 * saying why), so hosted public callers can fail closed without changing
 * the local product's legacy policy. The lookup's own deadline is one of
 * those failures, never an exception: a slow robots.txt must not turn a
 * page fetch into a crash.
 */

import { type NetworkPolicy, type ExecutionContext } from '@w2l/contracts'
import type { Dispatcher } from 'undici'
import {
  createExecutionScope,
  raceWithSignal,
  throwIfExecutionStopped,
  evaluateRobots,
  parseRobotsTxt,
  sha256Hex,
  type ComplianceRobotsDecision,
} from '@w2l/http-core'
import { assertSafeUrl, createGuardedDispatcher, defaultNetworkPolicy, isErrorNamed } from './egress.js'

function isPlainText(contentType: string | null): boolean {
  if (contentType === null) return true
  return contentType.toLowerCase().trimStart().startsWith('text/plain')
}

export type RobotsLookupFailureReason =
  | 'timeout'
  | 'dns_error'
  | 'connection_error'
  | 'policy_denied'
  | 'redirect_error'
  | 'body_too_large'
  | 'http_error'

export interface RobotsLookupFailure {
  reason: RobotsLookupFailureReason
  message: string
}

export interface CachedRobots {
  robotsUrl: string
  robots: ReturnType<typeof parseRobotsTxt> | null
  sha256: string | null
  absent: boolean
  /** Why robots.txt was unreachable; null when it was read or is absent. */
  failure: RobotsLookupFailure | null
}

export interface RobotsLookupOptions {
  /** Wall-clock budget for one robots.txt lookup. */
  lookupTimeoutMs?: number
  /** URL guard before each request; defaults to the direct-egress policy check. */
  assertUrl?: (url: string) => Promise<void>
  /** How long an unreachable verdict is reused before robots.txt is tried again. */
  failureTtlMs?: number
}

const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000
const DEFAULT_FAILURE_TTL_MS = 60_000

function lookupFailure(error: unknown, ownDeadlineHit: boolean): RobotsLookupFailure {
  const message = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)
  if (ownDeadlineHit || isErrorNamed(error, 'TimeoutError')) return { reason: 'timeout', message }
  if (isErrorNamed(error, 'DnsLookupError')) return { reason: 'dns_error', message }
  if (isErrorNamed(error, 'SsrfDeniedError')) return { reason: 'policy_denied', message }
  if (message.startsWith('robots redirect')) return { reason: 'redirect_error', message }
  if (message === 'robots body too large') return { reason: 'body_too_large', message }
  return { reason: 'connection_error', message }
}

export class RobotsOriginCache {
  private readonly byOrigin = new Map<string, CachedRobots>()
  private readonly failedUntil = new Map<string, number>()
  private readonly pending = new Map<string, { promise: Promise<CachedRobots | null>; controller: AbortController; users: number }>()
  private readonly dispatcher: Dispatcher | ((url: string) => Dispatcher)
  private readonly ownsDispatcher: boolean
  private readonly lookupTimeoutMs: number
  private readonly failureTtlMs: number
  private readonly assertUrl: (url: string) => Promise<void>
  private teardownPromise: Promise<void> | null = null
  constructor(private readonly networkPolicy: NetworkPolicy = defaultNetworkPolicy(), dispatcher?: Dispatcher | ((url: string) => Dispatcher), private readonly failClosedOnUnreachable = false, options: RobotsLookupOptions = {}) {
    this.ownsDispatcher = dispatcher === undefined
    this.dispatcher = dispatcher ?? createGuardedDispatcher(networkPolicy)
    this.lookupTimeoutMs = options.lookupTimeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS
    this.failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS
    this.assertUrl = options.assertUrl ?? ((url) => assertSafeUrl(url, networkPolicy))
  }

  async teardown(): Promise<void> {
    if (this.ownsDispatcher) {
      this.teardownPromise ??= (this.dispatcher as Dispatcher).close()
      await this.teardownPromise
    }
  }

  async lookup(url: string, userAgent: string, execution: ExecutionContext = {}): Promise<CachedRobots | null> {
    throwIfExecutionStopped(execution)
    let origin: string
    let robotsUrl: string
    try {
      const parsed = new URL(url)
      origin = parsed.origin
      robotsUrl = `${parsed.origin}/robots.txt`
    } catch {
      return null
    }

    const cached = this.byOrigin.get(origin)
    if (cached && (cached.failure === null || (this.failedUntil.get(origin) ?? 0) > Date.now())) return cached
    let pending = this.pending.get(origin)
    if (pending === undefined) {
      const controller = new AbortController()
      const request = (async (): Promise<CachedRobots | null> => {
      const deadlineAt = Date.now() + this.lookupTimeoutMs
      const scope = createExecutionScope({ signal: controller.signal, deadlineAt })
      let entry: CachedRobots = { robotsUrl, robots: null, sha256: null, absent: false, failure: null }
      try {
      let currentUrl = robotsUrl
      for (let hop = 0; hop <= this.networkPolicy.maxRedirects; hop++) {
        await raceWithSignal(this.assertUrl(currentUrl), scope.signal)
        const res = await fetch(currentUrl, {
        headers: { 'user-agent': userAgent },
        signal: scope.signal,
        redirect: 'manual',
        // Node's fetch accepts the Undici dispatcher; the socket lookup
        // validates the address again and pins the validated result.
        dispatcher: typeof this.dispatcher === 'function' ? this.dispatcher(currentUrl) : this.dispatcher,
      } as RequestInit & { dispatcher: Dispatcher })
        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel()
          const location = res.headers.get('location')
          if (location === null) throw new Error('robots redirect missing location')
          if (hop === this.networkPolicy.maxRedirects) throw new Error('robots redirect limit exceeded')
          currentUrl = new URL(location, currentUrl).href
          continue
        }
      if (res.status >= 500) {
        await res.body?.cancel()
        entry = { robotsUrl, robots: null, sha256: null, absent: false, failure: { reason: 'http_error', message: `robots.txt answered ${res.status}` } }
      } else if (res.status >= 400) {
        await res.body?.cancel()
        entry = { robotsUrl, robots: null, sha256: null, absent: true, failure: null }
      } else if (!isPlainText(res.headers.get('content-type'))) {
        await res.body?.cancel()
        entry = { robotsUrl, robots: null, sha256: null, absent: true, failure: null }
      } else {
        const reader = res.body?.getReader()
        if (reader === undefined) throw new Error('robots response has no body')
        const chunks: Uint8Array[] = []
        let size = 0
        for (;;) {
          const next = await reader.read()
          if (next.done) break
          size += next.value.byteLength
          if (size > Math.min(this.networkPolicy.maxBodyBytes, 1024 * 1024)) { await reader.cancel(); throw new Error('robots body too large') }
          chunks.push(next.value)
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        const text = new TextDecoder().decode(bytes)
        entry = {
          robotsUrl,
          robots: parseRobotsTxt(text),
          sha256: sha256Hex(new TextEncoder().encode(text)),
          absent: false,
          failure: null,
        }
      }
      break
      }
    } catch (error) {
      // Every waiter left: nobody needs a verdict, and caching one made
      // under a cancelled budget would be guesswork.
      if (controller.signal.aborted) throw error
      // The lookup's own deadline, or the network: robots.txt is unreachable
      // for now. That is a recorded fact about the origin, not a crash.
      entry = { robotsUrl, robots: null, sha256: null, absent: false, failure: lookupFailure(error, Date.now() >= deadlineAt) }
    } finally { scope.dispose() }

      this.byOrigin.set(origin, entry)
      if (entry.failure !== null) this.failedUntil.set(origin, Date.now() + this.failureTtlMs)
      else this.failedUntil.delete(origin)
      return entry
    })()
      pending = { promise: request, controller, users: 0 }
      this.pending.set(origin, pending)
      const current = pending
      void request.finally(() => { if (this.pending.get(origin) === current) this.pending.delete(origin) }).catch(() => {})
    }
    pending.users++
    const caller = createExecutionScope(execution)
    try { return await raceWithSignal(pending.promise, caller.signal) }
    finally {
      caller.dispose()
      pending.users--
      if (pending.users === 0 && this.pending.get(origin) === pending) {
        this.pending.delete(origin)
        pending.controller.abort(new DOMException('No robots lookup waiters remain', 'AbortError'))
      }
    }
  }

  decision(cached: CachedRobots | null, url: string, userAgent: string): ComplianceRobotsDecision {
    if (cached === null || cached.robots === null) {
      // RFC 9309: 4xx means unavailable and may be accessed; 5xx and network
      // errors mean unreachable and must be treated as a complete disallow.
      const unreachable = cached === null || !cached.absent
      return {
        robotsUrl: cached?.robotsUrl ?? null,
        robotsSha256: null,
        matchedUserAgentGroup: null,
        appliedRules: [],
        decision: this.failClosedOnUnreachable && unreachable ? 'disallowed' : 'no_robots',
        skippedFetch: false,
        crawlDelayMs: null,
      }
    }

    let path = '/'
    try {
      const parsed = new URL(url)
      path = parsed.pathname + parsed.search
    } catch {
      /* keep '/' */
    }

    const match = evaluateRobots(cached.robots, userAgent, path)
    return {
      robotsUrl: cached.robotsUrl,
      robotsSha256: cached.sha256,
      matchedUserAgentGroup: match.matchedAgent,
      appliedRules: match.appliedRules.map((r) => ({ pattern: r.pattern, allow: r.allow })),
      decision: match.allowed ? 'allowed' : 'disallowed',
      skippedFetch: false,
      crawlDelayMs: match.crawlDelayMs,
    }
  }

  crawlDelayMs(cached: CachedRobots | null, userAgent: string): number | null {
    if (cached?.robots === null || cached?.robots === undefined) return null
    const group = cached.robots.groups.find((candidate) => candidate.agents.some((agent) => agent === '*' || userAgent.toLowerCase().includes(agent)))
    return group?.crawlDelayMs ?? null
  }
}
