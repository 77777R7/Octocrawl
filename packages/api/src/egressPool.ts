/**
 * The operator's egress proxies (`W2L_EGRESS_PROXIES`, ADR 0005 `egress_sessions`, ROADMAP PA item 3).
 *
 * A batch or crawl takes one egress for its run and keeps it: its cookie session belongs to that
 * egress. An egress that has failed cools down for EGRESS_COOLDOWN_MS, and a task switches away from
 * it at most MAX_EGRESS_SWITCHES times. Failed means the proxy itself: after a page got no HTTP answer
 * from any rung, the proxy is probed (probeEgress), and only a proxy that does not answer, or refuses
 * its credentials (407), is one. Nothing switches on what a site did: a block, a challenge, a 429 or
 * a connection the site reset is the site's verdict on the request, and moving to another address to
 * get past it is identity rotation, which ADR 0005 never does. A switch starts a new cookie session,
 * as a session never changes egress.
 *
 * Results record an egress by its `host:port` endpoint, never its credentials. With an echo URL
 * (`W2L_EGRESS_ECHO_URL`), each egress is also asked once where it leaves from (exitOf): the address and
 * country the echo service saw, so a record can tell two exits apart and say where its page was read from.
 */

import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { isIP } from 'node:net'
import { withPoolProxy, type EvidenceAccessEgressExit, type FetchResult, type NetworkPolicy, type ProxyServer, type ScrapeOutcome } from '@w2l/contracts'
import { fetchThroughProxy } from '@w2l/bench'

export const EGRESS_COOLDOWN_MS = 10 * 60_000
export const MAX_EGRESS_SWITCHES = 2

export interface Egress {
  /** The proxy's `host:port`: what records and traces name. */
  readonly id: string
  /** The network policy whose every request leaves through this proxy. */
  readonly policy: NetworkPolicy
  /** The proxy, credentials included (in memory only), for its probe. */
  readonly server: ProxyServer
}

/** How one egress's exit is learned: the echo URL fetched through its proxy. A test seam replaces it. */
export type EgressEcho = (server: ProxyServer, echoUrl: string) => Promise<{ status: number; body: string }>

export class EgressPool {
  private readonly egresses: readonly Egress[]
  private readonly cooldownUntil = new Map<string, number>()
  private readonly exits = new Map<string, { at: number; exit: Promise<EvidenceAccessEgressExit | null> }>()
  private next = 0

  constructor(
    servers: readonly ProxyServer[],
    policy: NetworkPolicy,
    private readonly now: () => number = Date.now,
    private readonly echoUrl: string | null = null,
    private readonly echo: EgressEcho = (server, url) => fetchThroughProxy(server, url),
  ) {
    if (servers.length === 0) throw new Error('an egress pool needs at least one proxy')
    this.egresses = servers.map((server) => ({ id: server.endpoint, policy: withPoolProxy(policy, server), server }))
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

  /** The egress failed its probe: it cools down, and where it leaves from is asked again when it is next used. */
  fail(id: string): void {
    this.cooldownUntil.set(id, this.now() + EGRESS_COOLDOWN_MS)
    this.exits.delete(id)
  }

  /**
   * Where this egress leaves from, as the echo URL saw it: asked once and kept for EGRESS_COOLDOWN_MS, since a
   * provider's exit may change. Null without an echo URL, and when the echo did not answer or named no address:
   * unknown stays unknown.
   */
  exitOf(id: string): Promise<EvidenceAccessEgressExit | null> {
    const egress = this.byId(id)
    if (this.echoUrl === null || egress === undefined) return Promise.resolve(null)
    const known = this.exits.get(id)
    if (known !== undefined && this.now() - known.at < EGRESS_COOLDOWN_MS) return known.exit
    const echoUrl = this.echoUrl
    const exit = this.echo(egress.server, echoUrl)
      .then((answer) => (answer.status >= 200 && answer.status < 300 ? parseEchoExit(answer.body, new Date(this.now()).toISOString()) : null))
      .catch(() => null)
    this.exits.set(id, { at: this.now(), exit })
    return exit
  }
}

/**
 * The address and country in an echo service's answer: JSON with `ip`, `origin` or `query` and, when it gives
 * one, a two-letter `country`, `country_code` or `countryCode`; or a bare address as text. Null when it names no
 * address; a country it does not give is null.
 */
export function parseEchoExit(body: string, observedAt: string): EvidenceAccessEgressExit | null {
  const text = body.trim()
  let ip: string | null = null
  let country: string | null = null
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (parsed !== null && typeof parsed === 'object') {
      const address = [parsed.ip, parsed.origin, parsed.query].find((value) => typeof value === 'string')
      // httpbin's `origin` lists every address a request passed through; the last is the one that reached it.
      const last = typeof address === 'string' ? address.split(',').map((part) => part.trim()).at(-1) ?? '' : ''
      ip = isIP(last) === 0 ? null : last
      const code = [parsed.country_code, parsed.countryCode, parsed.country].find((value) => typeof value === 'string' && /^[A-Za-z]{2}$/.test(value))
      country = typeof code === 'string' ? code.toUpperCase() : null
    }
  } catch {
    ip = isIP(text) === 0 ? null : text
  }
  return ip === null ? null : { ip, country, observedAt }
}

/** The failures a proxy that does not answer produces: the connection, the name, the handshake or the time it took. */
const NETWORK_FAILURES: ReadonlySet<string> = new Set(['timeout', 'dns_error', 'connection_error', 'tls_error'])

/**
 * Whether a page's outcome leaves its egress in doubt, so that the egress is worth probing: the page
 * failed on the network and no rung got any HTTP answer. A page any rung got a status for went through
 * its proxy, so the proxy works, whatever the site said; a page whose request never went out (robots.txt
 * or a policy refused it, a lockdown found no cached copy) says nothing about the proxy either way.
 */
export function egressInDoubt(outcome: Pick<ScrapeOutcome, 'result' | 'audit'>): boolean {
  const results: FetchResult[] = [outcome.result, ...(outcome.audit?.summary.attempts ?? []).map((attempt) => attempt.result)]
  return outcome.result.status === 'failed' && NETWORK_FAILURES.has(outcome.result.failureReason ?? '') && results.every((result) => (result.evidence.httpStatus ?? null) === null)
}

/**
 * Whether the proxy itself fails: it does not accept a connection in time, or refuses its credentials
 * (407) for a CONNECT. The CONNECT names a host that does not exist, so the probe reaches no site; any
 * other answer, a 403 or a 502 for that name included, is a proxy at work.
 */
export async function probeEgress(server: ProxyServer, timeoutMs = 5_000): Promise<'works' | 'unreachable' | 'credentials_refused'> {
  const url = new URL(server.url)
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  return new Promise((resolve) => {
    let settled = false
    let socket: Socket | undefined
    const done = (verdict: 'works' | 'unreachable' | 'credentials_refused') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket?.destroy()
      resolve(verdict)
    }
    const timer = setTimeout(() => done('unreachable'), timeoutMs)
    const auth = server.username === undefined ? '' : `Proxy-Authorization: Basic ${Buffer.from(`${server.username}:${server.password ?? ''}`).toString('base64')}\r\n`
    const onConnect = () => socket!.write(`CONNECT octocrawl-egress-probe.invalid:443 HTTP/1.1\r\nHost: octocrawl-egress-probe.invalid:443\r\n${auth}\r\n`)
    socket = url.protocol === 'https:' ? tlsConnect({ host: url.hostname, port, servername: url.hostname }, onConnect) : netConnect({ host: url.hostname, port }, onConnect)
    let head = ''
    socket.on('data', (chunk: Buffer) => {
      head += chunk.toString('latin1')
      const status = /^HTTP\/\d(?:\.\d)? (\d{3})/.exec(head)
      if (status !== null) done(status[1] === '407' ? 'credentials_refused' : 'works')
      else if (head.length > 4096) done('works')
    })
    socket.on('error', () => done('unreachable'))
    socket.on('close', () => done(head === '' ? 'unreachable' : 'works'))
  })
}
