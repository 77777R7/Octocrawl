import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { LookupFunction } from 'node:net'
import { Agent, Pool, ProxyAgent, request, type Dispatcher } from 'undici'
import {
  evaluateResolved,
  evaluateHostname,
  evaluateUrl,
  localNetworkPolicy,
  parseNoProxyEntry,
  proxyFor,
  type NetworkPolicy,
  type ProxyServer,
} from '@w2l/contracts'

export class SsrfDeniedError extends Error {
  override readonly name = 'SsrfDeniedError'
  constructor(
    readonly url: string,
    readonly detail: string,
  ) {
    super(`ssrf denied ${url}: ${detail}`)
  }
}

/** The target name did not resolve: a DNS fact, reported as dns_error, never as a policy denial. */
export class DnsLookupError extends Error {
  override readonly name = 'DnsLookupError'
  constructor(
    readonly hostname: string,
    cause: unknown,
  ) {
    super(`dns lookup failed for ${hostname}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  }
}

/**
 * Largest response header block the HTTP clients accept. Undici's default is
 * 16 KiB; some sites send about 20 KiB, which failed as a connection error.
 */
export const MAX_RESPONSE_HEADER_BYTES = 64 * 1024

export class BodyTooLargeError extends Error {
  override readonly name = 'BodyTooLargeError'
  /** `declaredBytes`: the Content-Length that was over the cap before anything was read; null when the body ran past it. */
  constructor(readonly maxBytes: number, readonly declaredBytes: number | null = null) {
    super(declaredBytes === null ? `body exceeded ${maxBytes} bytes` : `body of ${declaredBytes} bytes declared, over the cap of ${maxBytes}`)
  }
}

export function defaultNetworkPolicy(): NetworkPolicy {
  return localNetworkPolicy()
}

// Only these fixed, platform-owned hosts may use the local review proxy.
// Arbitrary visitor domains keep the DNS-pinned direct dispatcher.
const LOCAL_PREVIEW_PROXY_HOSTS = new Set([
  'reddit.com', 'www.reddit.com', 'old.reddit.com',
  'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com',
])

export function isLocalPreviewProxyTarget(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && url.port === '' && LOCAL_PREVIEW_PROXY_HOSTS.has(url.hostname.toLowerCase())
  } catch { return false }
}

/** A public visitor cannot choose egress. The local review process may use
 * its operator's existing loopback HTTP proxy for fixed platform hosts. */
export function validateLocalPreviewProxy(input: string): string {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('Local preview proxy URL is invalid') }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Local preview proxy must be an unauthenticated loopback HTTP URL with a port')
  }
  return url.origin
}

type ResolvedAddress = { address: string; family: number }
type Resolver = (hostname: string, options: { all: true }) => Promise<ResolvedAddress[]>

/**
 * How a route treats the target's certificate. The default verifies. A route
 * built with `rejectUnauthorized: false` (a request's `skipTlsVerification`)
 * is created for that one fetch and closed after it: it is never the shared
 * guarded dispatcher, the robots cache's own routes or the delivery worker.
 */
export interface EgressTlsOptions {
  rejectUnauthorized?: boolean
}

/**
 * Chromium does not use Undici's socket lookup. In the hosted browser mode,
 * resolve the finite operator allowlist once and force Chromium's resolver to
 * use only those validated IPs. Everything else must fail name resolution.
 */
export async function pinnedBrowserHostRules(hosts: readonly string[], policy: NetworkPolicy, resolve: Resolver = lookup): Promise<string> {
  if (hosts.length === 0) throw new SsrfDeniedError('browser', 'host allowlist is empty')
  const rules: string[] = []
  const seen = new Set<string>()
  for (const input of hosts) {
    let hostname: string
    try {
      const parsed = new URL(`https://${input}/`)
      hostname = parsed.hostname.toLowerCase()
      if (parsed.host !== hostname || !/^[a-z0-9.-]+$/.test(hostname) || input.toLowerCase() !== hostname) throw new Error('invalid host')
    } catch { throw new SsrfDeniedError('browser', 'invalid allowed host') }
    if (seen.has(hostname)) continue
    seen.add(hostname)
    const literal = evaluateHostname(hostname, policy)
    let pinned: string | null = null
    if (literal !== null) {
      if (!literal.allowed) throw new SsrfDeniedError(hostname, literal.detail ?? literal.violation ?? 'denied')
      pinned = literal.pinnedAddress
    } else {
      let records: ResolvedAddress[]
      try { records = await resolve(hostname, { all: true }) }
      catch (error) { throw new DnsLookupError(hostname, error) }
      if (records.length === 0) throw new DnsLookupError(hostname, 'no addresses')
      const decision = evaluateResolved(hostname, records.map(record => record.address), policy)
      if (!decision.allowed) throw new SsrfDeniedError(hostname, decision.detail ?? decision.violation ?? 'denied')
      pinned = records.find(record => isIP(record.address) === 4)?.address ?? decision.pinnedAddress
    }
    if (pinned === null) throw new SsrfDeniedError(hostname, 'no validated address')
    rules.push(`MAP ${hostname} ${isIP(pinned) === 6 ? `[${pinned}]` : pinned}`)
  }
  // Chromium's rule parser applies the first matching rule. This catch-all
  // prevents DNS prefetch and unanticipated network loads from escaping.
  return [...rules, 'MAP * ~NOTFOUND'].join(', ')
}

/**
 * Validate the addresses at the socket lookup, then hand Node only the
 * validated address. A separate URL preflight cannot prevent DNS rebinding
 * between validation and connect.
 */
export function createGuardedDispatcher(policy: NetworkPolicy, resolve: Resolver = lookup, tls: EgressTlsOptions = {}): Agent {
  const safeLookup: LookupFunction = (hostname, options, callback) => {
    const wantedFamily = options.family === 4 || options.family === 'IPv4' ? 4
      : options.family === 6 || options.family === 'IPv6' ? 6 : 0
    const decision = evaluateHostname(hostname, policy)
    if (decision !== null) {
      if (!decision.allowed || decision.pinnedAddress === null) {
        callback(new SsrfDeniedError(hostname, decision.detail ?? decision.violation ?? 'denied'), '')
        return
      }
      const selected = { address: decision.pinnedAddress, family: isIP(decision.pinnedAddress) }
      if (wantedFamily !== 0 && selected.family !== wantedFamily) {
        callback(new SsrfDeniedError(hostname, 'no allowed address for requested IP family'), '')
        return
      }
      callback(null, options.all ? [selected] : selected.address, selected.family)
      return
    }
    const normalizedHostname = hostname.replace(/^\[|\]$/g, '').toLowerCase()
    void resolve(normalizedHostname, { all: true }).then((records) => {
      if (records.length === 0) {
        callback(new DnsLookupError(normalizedHostname, 'no addresses'), '')
        return
      }
      const verdict = evaluateResolved(normalizedHostname, records.map(record => record.address), policy)
      if (!verdict.allowed || verdict.pinnedAddress === null) {
        callback(new SsrfDeniedError(hostname, verdict.detail ?? verdict.violation ?? 'denied'), '')
        return
      }
      const selected = records.find(record => wantedFamily === 0 || isIP(record.address) === wantedFamily)
      if (selected === undefined) {
        callback(new SsrfDeniedError(hostname, 'no allowed address for requested IP family'), '')
        return
      }
      const pinned = { address: selected.address, family: isIP(selected.address) }
      callback(null, options.all ? [pinned] : pinned.address, pinned.family)
    }, (error: unknown) => {
      callback(new DnsLookupError(normalizedHostname, error), '')
    })
  }
  return new Agent({
    connect: { lookup: safeLookup, ...(tls.rejectUnauthorized === false ? { rejectUnauthorized: false } : {}) },
    keepAliveTimeout: 1_000,
    keepAliveMaxTimeout: 1_000,
    maxHeaderSize: MAX_RESPONSE_HEADER_BYTES,
  })
}

/**
 * The outbound routes for one policy: the guarded direct connection and, in
 * local mode, the operator's environment proxy for the URLs it covers
 * (`proxyFor`). `assertSafeUrl` reads the same policy, so its checks always
 * match the route a request takes.
 */
export class EgressRoutes {
  private readonly direct: Agent
  private readonly proxies = new Map<string, ProxyAgent>()
  private closing: Promise<void> | null = null

  /** `tls` relaxes certificate verification on every route of this instance: only for routes a single fetch owns and closes (see EgressTlsOptions). */
  constructor(private readonly policy: NetworkPolicy, resolve: Resolver = lookup, tls: EgressTlsOptions = {}) {
    this.direct = createGuardedDispatcher(policy, resolve, tls)
    for (const server of [policy.egressProxy?.https, policy.egressProxy?.http]) {
      if (server != null && !this.proxies.has(server.url)) this.proxies.set(server.url, createProxyDispatcher(server, tls))
    }
  }

  /** The environment proxy this URL leaves through, or null when it connects directly. */
  proxyFor(url: string): ProxyServer | null {
    return proxyFor(url, this.policy)
  }

  dispatcherFor(url: string): Dispatcher {
    const server = this.proxyFor(url)
    if (server === null) return this.direct
    const proxy = this.proxies.get(server.url)
    if (proxy === undefined) throw new Error('no dispatcher for the configured proxy')
    return proxy
  }

  close(): Promise<void> {
    this.closing ??= Promise.all([this.direct.close(), ...[...this.proxies.values()].map(proxy => proxy.close())]).then(() => {})
    return this.closing
  }
}

/**
 * One GET of `url` through `server` alone, for an operator's own check of a proxy (the egress pool's exit echo):
 * no robots.txt, no identity, no address check, since the operator names both the proxy and the URL. The body is
 * capped at `maxBytes`; the dispatcher is closed afterwards.
 */
export async function fetchThroughProxy(server: ProxyServer, url: string, timeoutMs = 10_000, maxBytes = 64 * 1024): Promise<{ status: number; body: string }> {
  const dispatcher = createProxyDispatcher(server)
  try {
    const answer = await request(url, { method: 'GET', dispatcher, signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json, text/plain;q=0.9' } })
    const body = await readCappedBody(answer.body, maxBytes)
    return { status: answer.statusCode, body: Buffer.from(body).toString('utf8') }
  } finally {
    await dispatcher.close()
  }
}

function createProxyDispatcher(server: ProxyServer, tls: EgressTlsOptions = {}): ProxyAgent {
  return new ProxyAgent({
    uri: server.url,
    ...(server.username === undefined ? {} : { token: `Basic ${Buffer.from(`${server.username}:${server.password ?? ''}`).toString('base64')}` }),
    // The TLS to the target through the CONNECT tunnel; the proxy itself is reached over plain HTTP.
    ...(tls.rejectUnauthorized === false ? { requestTls: { rejectUnauthorized: false } } : {}),
    // Like curl: http: targets are sent in absolute form, https: targets are tunnelled with CONNECT.
    proxyTunnel: false,
    keepAliveTimeout: 1_000,
    keepAliveMaxTimeout: 1_000,
    maxHeaderSize: MAX_RESPONSE_HEADER_BYTES,
    // The absolute-form client is built by this factory and does not receive the options above.
    factory: (origin, options) => new Pool(origin, { keepAliveTimeout: 1_000, keepAliveMaxTimeout: 1_000, ...options, maxHeaderSize: MAX_RESPONSE_HEADER_BYTES }),
  })
}

/**
 * The environment proxy as a Playwright context proxy. Chromium routes a
 * context through one server, so the bypass list reproduces `proxyFor`: each
 * NO_PROXY host with its subdomains, IP and CIDR entries, loopback, and the
 * scheme that has no proxy. Null when the policy sends everything direct.
 */
export function browserProxySettings(policy: NetworkPolicy): { proxy: { server: string; bypass: string; username?: string; password?: string }; endpoint: string } | null {
  const proxy = policy.origin === 'operator' ? policy.egressProxy ?? null : null
  const server = proxy?.https ?? proxy?.http ?? null
  if (proxy === null || server === null) return null
  if (proxy.https !== null && proxy.http !== null && proxy.https.url !== proxy.http.url) throw new Error('the browser lane routes through one proxy; HTTPS_PROXY and HTTP_PROXY differ')
  // Naming loopback here also stops Playwright from forcing loopback through the proxy.
  const bypass = ['localhost', '*.localhost', '127.0.0.1', '[::1]']
  for (const raw of proxy.noProxy) {
    const entry = parseNoProxyEntry(raw)
    if (entry === null) continue
    if (entry.kind === 'all') return null
    if (entry.kind === 'cidr') { bypass.push(entry.cidr); continue }
    const port = entry.port === null ? '' : `:${entry.port}`
    if (entry.kind === 'ip') bypass.push(`${entry.address.includes(':') ? `[${entry.address}]` : entry.address}${port}`)
    else bypass.push(`${entry.host}${port}`, `.${entry.host}${port}`)
  }
  if (proxy.https === null) bypass.push('https://*')
  if (proxy.http === null) bypass.push('http://*')
  return {
    proxy: {
      server: server.url,
      bypass: bypass.join(','),
      ...(server.username === undefined ? {} : { username: server.username }),
      ...(server.password === undefined ? {} : { password: server.password }),
    },
    endpoint: server.endpoint,
  }
}

/**
 * Chromium's proxy at launch, for a launched browser or a managed profile.
 * Without one, Chromium falls back to the operating system's proxy settings:
 * a route the HTTP lane does not take and no result records. So the launch
 * names the environment proxy when W2L uses one, and otherwise keeps Chromium
 * direct like the HTTP lane with `--proxy-server=direct://`. (The headless
 * shell Playwright runs for `headless: true` ignores `--no-proxy-server`.)
 * A context's own proxy (the environment proxy, or a user's) still applies.
 */
export function chromiumProxyLaunchOptions(settings: ReturnType<typeof browserProxySettings>): { proxy: NonNullable<typeof settings>['proxy'] } | { args: string[] } {
  return settings === null ? { args: ['--proxy-server=direct://'] } : { proxy: settings.proxy }
}

/**
 * The checks before a request leaves. A URL the policy sends through the
 * operator's proxy is resolved by that proxy, so local mode trusts the proxy
 * for resolution: only the checks that need no DNS run (scheme, credentials,
 * IP literals, metadata names). A direct URL is resolved here and every
 * address validated; the guarded dispatcher validates again and pins.
 */
export async function assertSafeUrl(url: string, policy: NetworkPolicy, resolve: Resolver = lookup): Promise<void> {
  const first = evaluateUrl(url, policy)
  if ('allowed' in first) {
    if (!first.allowed) throw new SsrfDeniedError(url, first.detail ?? first.violation ?? 'denied')
    return
  }
  if (proxyFor(url, policy) !== null) return
  let records: readonly { address: string }[]
  try {
    records = await resolve(first.hostname, { all: true })
  } catch (err) {
    throw new DnsLookupError(first.hostname, err)
  }
  if (records.length === 0) throw new DnsLookupError(first.hostname, 'no addresses')
  const decision = evaluateResolved(
    first.hostname,
    records.map((record) => record.address),
    policy,
  )
  if (!decision.allowed) throw new SsrfDeniedError(url, decision.detail ?? decision.violation ?? 'denied')
}

export async function readCappedBody(body: AsyncIterable<unknown>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let n = 0
  for await (const chunk of body) {
    const buf = chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk))
    n += buf.byteLength
    if (n > maxBytes) throw new BodyTooLargeError(maxBytes)
    chunks.push(buf)
  }
  const out = new Uint8Array(n)
  let off = 0
  for (const chunk of chunks) {
    out.set(chunk, off)
    off += chunk.byteLength
  }
  return out
}
