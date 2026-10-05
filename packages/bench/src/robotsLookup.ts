/**
 * Origin-cached robots.txt lookup shared by the HTTP and browser arms.
 *
 * A 4xx or a non-text/plain body is "no robots.txt" (RFC 9309 §2.3.1.3). A
 * 5xx, a network failure or the lookup's own deadline is unreachable
 * (§2.3.1.4): a complete disallow, in local and hosted mode alike, with the
 * reason kept so it never reads as a rule the publisher wrote. Unreachable
 * entries expire after `robotsUnreachableTtlMs`, so a transient failure is
 * retried; other entries are kept for the life of the process. Only the
 * caller's own cancellation or deadline aborts a lookup.
 */

import { isOctocrawlRobotsGroup, robotsAgent, type NetworkPolicy, type ExecutionContext, type FetchWarning, type AppliedRobotsOverride, type RobotsOverrideApplied, type RobotsUnreachable, type TraceEvent } from '@w2l/contracts'
import type { Dispatcher } from 'undici'
import {
  createExecutionScope,
  isTlsError,
  raceWithSignal,
  throwIfExecutionStopped,
  evaluateRobots,
  matchRobotsGroup,
  parseRobotsTxt,
  sha256Hex,
  type ComplianceRobotsDecision,
} from '@w2l/http-core'
import { assertSafeUrl, defaultNetworkPolicy, EgressRoutes } from './egress.js'

function isPlainText(contentType: string | null): boolean {
  if (contentType === null) return true
  return contentType.toLowerCase().trimStart().startsWith('text/plain')
}

export interface CachedRobots {
  robotsUrl: string
  robots: ReturnType<typeof parseRobotsTxt> | null
  sha256: string | null
  absent: boolean
  /** Why robots.txt was unreachable; set only when it was. */
  unreachable?: RobotsUnreachable
  /**
   * The network error that made it unreachable (`network_error`): its name,
   * its code up the cause chain, and whether it was the host's certificate
   * failing to verify. A lane reports that as `tls_error`, the fact about
   * the host, rather than as the complete disallow an unreadable robots.txt
   * otherwise is: the page would fail the same way.
   */
  error?: { name: string; code: string | null; tls: boolean }
}

/** The first `code` on an error or up its cause chain (Node's `fetch failed` wraps the socket's). */
function errorCode(error: unknown): string | null {
  let current = error
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && code.length > 0) return code
    current = 'cause' in current ? current.cause : null
  }
  return null
}

/**
 * The warning every result of an overridden fetch carries, so a reader who
 * never opens the trace still sees that a rule was set aside, which one, and
 * on whose word.
 */
export function robotsOverrideWarning(decision: ComplianceRobotsDecision, override: AppliedRobotsOverride): FetchWarning {
  const robotsUrl = decision.robotsUrl ?? 'robots.txt'
  const verdict = decision.unreachable === undefined
    ? `${robotsUrl} disallows this URL (rule ${decision.appliedRules.map((rule) => rule.pattern).join(', ')})`
    : `${robotsUrl} could not be read (${decision.unreachable}), which counts as a complete disallow`
  const who = override.recordedBy === undefined ? '' : ` by ${override.recordedBy}`
  const why = override.basis === 'user_named_url'
    ? 'it was fetched because the request named it: robots.txt binds the links a crawl or map discovers, not the URLs a person names'
    : override.basis === 'ignore_robots_txt'
      ? 'it was fetched because the crawl or map was started with ignoreRobotsTxt'
      : `it was fetched under an override recorded${who}: ${override.reason}`
  return { code: 'robots_overridden', message: `${verdict}; ${why}` }
}

/**
 * The override a lane applies to this verdict. A rule a robots.txt wrote for
 * Octocrawl itself (`User-agent: Octocrawl`) is the site owner's targeted
 * opt-out: a URL the request names and ignoreRobotsTxt do not set it aside,
 * only the caller's recorded robotsOverride for this URL does. A rule for
 * every crawler gives way to any override.
 */
export function applicableOverride(override: AppliedRobotsOverride | undefined, decision: ComplianceRobotsDecision): AppliedRobotsOverride | undefined {
  if (override?.basis !== undefined && isOctocrawlRobotsGroup(decision.matchedUserAgentGroup)) return undefined
  return override
}

/** The `robots_overridden` trace event's detail: the URL, the rules or unreachable reason set aside, and on whose word. */
export function overriddenDetail(url: string, decision: ComplianceRobotsDecision, override: AppliedRobotsOverride): Record<string, unknown> {
  return {
    url,
    appliedRules: decision.appliedRules,
    ...(decision.unreachable === undefined ? {} : { unreachable: decision.unreachable }),
    reason: override.reason,
    ...(override.recordedBy === undefined ? {} : { recordedBy: override.recordedBy }),
    basis: override.basis ?? 'robots_override',
  }
}

/**
 * What a lane tells its caller (`ExecutionContext.onRobotsOverride`) the
 * moment it applies an override: its robots events so far and the warning.
 */
export function robotsOverrideApplied(trace: readonly TraceEvent[], warning: FetchWarning): RobotsOverrideApplied {
  return { trace: trace.filter((event) => event.event === 'robots_checked' || event.event === 'robots_disallowed' || event.event === 'robots_overridden'), warning }
}

const ROBOTS_TIMEOUT_MS = 5_000
/** How long an unreachable robots.txt stays a complete disallow before it is fetched again. */
export const ROBOTS_UNREACHABLE_TTL_MS = 5 * 60_000

export class RobotsOriginCache {
  private readonly byOrigin = new Map<string, { entry: CachedRobots; expiresAt: number }>()
  private readonly pending = new Map<string, { promise: Promise<CachedRobots | null>; controller: AbortController; users: number }>()
  private readonly dispatcher: Dispatcher | ((url: string) => Dispatcher)
  /** Without a caller's dispatcher, robots.txt takes the policy's own routes (direct or environment proxy). */
  private readonly ownRoutes: EgressRoutes | null
  constructor(private readonly networkPolicy: NetworkPolicy = defaultNetworkPolicy(), dispatcher?: Dispatcher | ((url: string) => Dispatcher)) {
    const routes = dispatcher === undefined ? new EgressRoutes(networkPolicy) : null
    this.ownRoutes = routes
    this.dispatcher = dispatcher ?? (url => routes!.dispatcherFor(url))
  }

  async teardown(): Promise<void> {
    await this.ownRoutes?.close()
  }

  /**
   * The cached robots.txt of `url`'s origin, fetched with `userAgent` when it
   * is not cached yet. `dispatcher` routes that one fetch instead of the
   * cache's own routes (a request's relaxed-TLS routes, `skipTlsVerification`):
   * what it reads is cached apart from what the default routes read, so a
   * verdict read without certificate verification never answers a verified
   * fetch, and a default fetch's `unreachable` never answers a relaxed one.
   */
  async lookup(url: string, userAgent: string, execution: ExecutionContext = {}, dispatcher?: Dispatcher | ((url: string) => Dispatcher)): Promise<CachedRobots | null> {
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
    const route = dispatcher ?? this.dispatcher
    const key = dispatcher === undefined ? origin : `${origin} tls-unverified`

    const cached = this.byOrigin.get(key)
    if (cached !== undefined && Date.now() < cached.expiresAt) return cached.entry
    let pending = this.pending.get(key)
    if (pending === undefined) {
      const controller = new AbortController()
      const request = (async (): Promise<CachedRobots | null> => {
      const scope = createExecutionScope({ signal: controller.signal, deadlineAt: Date.now() + (this.networkPolicy.robotsTimeoutMs ?? ROBOTS_TIMEOUT_MS) })
      let entry: CachedRobots = { robotsUrl, robots: null, sha256: null, absent: false }
      try {
      await raceWithSignal(assertSafeUrl(robotsUrl, this.networkPolicy), scope.signal)
      let currentUrl = robotsUrl
      for (let hop = 0; hop <= this.networkPolicy.maxRedirects; hop++) {
        await raceWithSignal(assertSafeUrl(currentUrl, this.networkPolicy), scope.signal)
        const res = await fetch(currentUrl, {
        headers: { 'user-agent': userAgent },
        signal: scope.signal,
        redirect: 'manual',
        // Node's fetch accepts the Undici dispatcher; the socket lookup
        // validates the address again and pins the validated result.
        dispatcher: typeof route === 'function' ? route(currentUrl) : route,
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
        entry = { robotsUrl, robots: null, sha256: null, absent: false, unreachable: 'server_error' }
      } else if (res.status >= 400) {
        await res.body?.cancel()
        entry = { robotsUrl, robots: null, sha256: null, absent: true }
      } else if (!isPlainText(res.headers.get('content-type'))) {
        await res.body?.cancel()
        entry = { robotsUrl, robots: null, sha256: null, absent: true }
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
        }
      }
      break
      }
    } catch (error) {
      // Only the waiters leaving cancels the lookup. Its own deadline is an
      // unreachable robots.txt like any network error, never a thrown timeout
      // that would fail the fetch this lookup guards.
      controller.signal.throwIfAborted()
      entry = scope.signal.aborted
        ? { robotsUrl, robots: null, sha256: null, absent: false, unreachable: 'timeout' }
        : { robotsUrl, robots: null, sha256: null, absent: false, unreachable: 'network_error', error: { name: error instanceof Error ? error.name : String(error), code: errorCode(error), tls: isTlsError(error) } }
    } finally { scope.dispose() }

      controller.signal.throwIfAborted()
      const expiresAt = entry.unreachable === undefined ? Infinity : Date.now() + (this.networkPolicy.robotsUnreachableTtlMs ?? ROBOTS_UNREACHABLE_TTL_MS)
      this.byOrigin.set(key, { entry, expiresAt })
      return entry
    })()
      pending = { promise: request, controller, users: 0 }
      this.pending.set(key, pending)
      const current = pending
      void request.finally(() => { if (this.pending.get(key) === current) this.pending.delete(key) }).catch(() => {})
    }
    pending.users++
    const caller = createExecutionScope(execution)
    try { return await raceWithSignal(pending.promise, caller.signal) }
    finally {
      caller.dispose()
      pending.users--
      if (pending.users === 0 && this.pending.get(key) === pending) {
        this.pending.delete(key)
        pending.controller.abort(new DOMException('No robots lookup waiters remain', 'AbortError'))
      }
    }
  }

  decision(cached: CachedRobots | null, url: string, userAgent: string): ComplianceRobotsDecision {
    if (cached === null || cached.robots === null) {
      // RFC 9309: a 4xx means no robots.txt, and anything may be accessed
      // (§2.3.1.3). A 5xx, a network error or a timeout means unreachable,
      // which must be treated as a complete disallow (§2.3.1.4); so is a URL
      // whose robots.txt could not even be located.
      return {
        robotsUrl: cached?.robotsUrl ?? null,
        robotsSha256: null,
        matchedUserAgentGroup: null,
        appliedRules: [],
        decision: cached?.absent === true ? 'no_robots' : 'disallowed',
        skippedFetch: false,
        crawlDelayMs: null,
        ...(cached?.unreachable === undefined ? {} : { unreachable: cached.unreachable }),
      }
    }

    let path = '/'
    try {
      const parsed = new URL(url)
      path = parsed.pathname + parsed.search
    } catch {
      /* keep '/' */
    }

    // The research product token governs SEC's format too (robotsAgent).
    const agent = robotsAgent(userAgent)
    const match = evaluateRobots(cached.robots, agent, path)
    // A deciding group that names Octocrawl is Octocrawl's, whichever of its tokens is longest: that is what makes a rule
    // written for Octocrawl hold for a named URL and ignoreRobotsTxt (applicableOverride).
    const own = matchRobotsGroup(cached.robots, agent)?.agents.find((token) => isOctocrawlRobotsGroup(token))
    return {
      robotsUrl: cached.robotsUrl,
      robotsSha256: cached.sha256,
      matchedUserAgentGroup: own ?? match.matchedAgent,
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
