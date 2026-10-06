/**
 * The operator's egress proxies (`W2L_EGRESS_PROXIES`, ADR 0005 `egress_sessions`, ROADMAP PA item 3).
 *
 * A batch or crawl takes one egress for its run and keeps it: its cookie session belongs to that
 * egress. An egress that fails at the connection (no HTTP answer at all) cools down for
 * EGRESS_COOLDOWN_MS, and a task switches away from it at most MAX_EGRESS_SWITCHES times. Nothing
 * switches on what a site answered: a block, a challenge or a 429 is the site's verdict on the
 * request, and moving to another address to get past it is identity rotation, which ADR 0005 never
 * does. A switch starts a new cookie session, as a session never changes egress.
 *
 * Results record an egress by its `host:port` endpoint, never its credentials.
 */

import { withPoolProxy, type FetchResult, type NetworkPolicy, type ProxyServer } from '@w2l/contracts'

export const EGRESS_COOLDOWN_MS = 10 * 60_000
export const MAX_EGRESS_SWITCHES = 2

export interface Egress {
  /** The proxy's `host:port`: what records and traces name. */
  readonly id: string
  /** The network policy whose every request leaves through this proxy. */
  readonly policy: NetworkPolicy
}

export class EgressPool {
  private readonly egresses: readonly Egress[]
  private readonly cooldownUntil = new Map<string, number>()
  private next = 0

  constructor(servers: readonly ProxyServer[], policy: NetworkPolicy, private readonly now: () => number = Date.now) {
    if (servers.length === 0) throw new Error('an egress pool needs at least one proxy')
    this.egresses = servers.map((server) => ({ id: server.endpoint, policy: withPoolProxy(policy, server) }))
  }

  get size(): number {
    return this.egresses.length
  }

  /** The egress with this id, when it is in the pool. */
  byId(id: string): Egress | undefined {
    return this.egresses.find((egress) => egress.id === id)
  }

  /** Whether this egress is cooling down after a failure. */
  cooling(id: string): boolean {
    return (this.cooldownUntil.get(id) ?? 0) > this.now()
  }

  /**
   * The next egress in turn that is not cooling down and is not `except`; when every other one is
   * cooling, the one whose cooldown ends first, so a task always has an egress.
   */
  pick(except?: string): Egress {
    const candidates = this.egresses.filter((egress) => egress.id !== except)
    const pool = candidates.length === 0 ? this.egresses : candidates
    for (let i = 0; i < this.egresses.length; i++) {
      const egress = this.egresses[(this.next + i) % this.egresses.length]!
      if (!pool.includes(egress) || this.cooling(egress.id)) continue
      this.next = (this.next + i + 1) % this.egresses.length
      return egress
    }
    return [...pool].sort((a, b) => (this.cooldownUntil.get(a.id) ?? 0) - (this.cooldownUntil.get(b.id) ?? 0))[0]!
  }

  /** The egress failed at the connection: it cools down. */
  fail(id: string): void {
    this.cooldownUntil.set(id, this.now() + EGRESS_COOLDOWN_MS)
  }
}

/**
 * Whether a page's result says its egress failed, not the site: a failure at the connection with no
 * HTTP answer. A block, a challenge, a 429 or any other status is the site's answer and never one.
 */
export function egressFailed(result: FetchResult): boolean {
  return result.status === 'failed' && result.failureReason === 'connection_error' && (result.evidence.httpStatus ?? null) === null
}
