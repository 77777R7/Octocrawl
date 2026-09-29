/**
 * The operator's forward proxy from the standard environment variables, for
 * local mode only. Hosted mode never reads them: its SSRF guarantees depend
 * on direct connections to DNS-pinned addresses.
 *
 * Semantics follow curl. HTTPS_PROXY serves https: URLs and HTTP_PROXY http:
 * URLs (the lower-case names win). A NO_PROXY entry matches its host and
 * every subdomain (a leading "." or "*." is ignored), `*` disables the proxy,
 * and `host:port` limits an entry to one port. IP and CIDR entries match IP
 * literal hosts only: nothing here resolves a name. Loopback always goes
 * direct. `W2L_PROXY=off` ignores the variables.
 *
 * The proxy resolves the hosts it is asked for, so local mode trusts the
 * operator's proxy for resolution: before a proxied request only the checks
 * that need no DNS run (scheme, credentials, IP literals, metadata names).
 * Direct requests keep the resolve-validate-pin checks.
 */
import type { EgressProxy, NetworkPolicy, ProxyServer } from './policy.js'
import { classifyIp, ipInCidr, isIpAddress } from './ssrf.js'

export const PROXY_ENV_NAMES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'] as const

type Env = Readonly<Record<string, string | undefined>>

export class ProxyConfigError extends Error {
  constructor(message: string) {
    super(`${message} Set W2L_PROXY=off to ignore the proxy variables.`)
    this.name = 'ProxyConfigError'
  }
}

/** The proxy the environment names, or null when none applies. Error messages never repeat a variable's value. */
export function environmentProxy(env: Env): EgressProxy | null {
  const setting = env['W2L_PROXY'] ?? ''
  if (setting === 'off') return null
  if (setting !== '') throw new ProxyConfigError('W2L_PROXY must be "off" when set.')
  const https = proxyServer('HTTPS_PROXY', env['https_proxy'] ?? env['HTTPS_PROXY'])
  const http = proxyServer('HTTP_PROXY', env['http_proxy'] ?? env['HTTP_PROXY'])
  if (https === null && http === null) return null
  if (https !== null && http !== null && (https.url !== http.url || https.username !== http.username || https.password !== http.password)) {
    throw new ProxyConfigError('HTTPS_PROXY and HTTP_PROXY name different proxies, and the browser lane can route through only one. Point both at the same proxy or unset one.')
  }
  const noProxy = (env['no_proxy'] ?? env['NO_PROXY'] ?? '').split(/[\s,]+/).map(entry => entry.toLowerCase()).filter(entry => entry !== '')
  return { source: 'environment', https, http, noProxy }
}

/** A local-mode policy that routes through the environment's proxy, when one is set. */
export function withEnvironmentProxy(policy: NetworkPolicy, env: Env): NetworkPolicy {
  const egressProxy = environmentProxy(env)
  return egressProxy === null ? policy : { ...policy, egressProxy }
}

/** The operator proxy a URL leaves through under this policy; null means a direct connection. */
export function proxyFor(url: string | URL, policy: Pick<NetworkPolicy, 'origin' | 'egressProxy'>): ProxyServer | null {
  const proxy = policy.origin === 'operator' ? policy.egressProxy ?? null : null
  if (proxy === null) return null
  let target: URL
  try { target = typeof url === 'string' ? new URL(url) : url } catch { return null }
  const server = target.protocol === 'https:' ? proxy.https : target.protocol === 'http:' ? proxy.http : null
  return server === null || bypassesProxy(target, proxy.noProxy) ? null : server
}

export type NoProxyEntry =
  | { kind: 'all' }
  | { kind: 'host'; host: string; port: number | null }
  | { kind: 'ip'; address: string; cidr: string; port: number | null }
  | { kind: 'cidr'; cidr: string }

/** One NO_PROXY entry, or null for a form W2L does not match (such as an inner wildcard). */
export function parseNoProxyEntry(raw: string): NoProxyEntry | null {
  const entry = raw.trim().toLowerCase()
  if (entry === '') return null
  if (entry === '*') return { kind: 'all' }
  const block = /^\[?([0-9a-f:.]+)\]?\/(\d{1,3})$/.exec(entry)
  if (block !== null) return isIpAddress(block[1]!) ? { kind: 'cidr', cidr: `${block[1]}/${block[2]}` } : null
  const bracketed = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(entry)
  if (bracketed !== null) return isIpAddress(bracketed[1]!) ? ipEntry(bracketed[1]!, bracketed[2]) : null
  if (isIpAddress(entry)) return ipEntry(entry, undefined)
  const withPort = /^(.*):(\d{1,5})$/.exec(entry)
  const hostPart = withPort === null ? entry : withPort[1]!
  if (isIpAddress(hostPart)) return ipEntry(hostPart, withPort?.[2])
  const host = hostPart.replace(/^\*?\./, '').replace(/\.$/, '')
  if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/.test(host)) return null
  return { kind: 'host', host, port: withPort === null ? null : Number(withPort[2]) }
}

/** Startup line for local mode: which proxy outbound requests use and what goes direct. */
export function describeEgressProxy(proxy: EgressProxy): string {
  const server = proxy.https ?? proxy.http
  const schemes = proxy.https !== null && proxy.http !== null ? 'https: and http:' : proxy.https !== null ? 'https:' : 'http:'
  const direct = [
    ...(proxy.https === null ? ['https: requests'] : proxy.http === null ? ['http: requests'] : []),
    'loopback',
    ...(proxy.noProxy.length === 0 ? [] : [`NO_PROXY (${proxy.noProxy.join(', ')})`]),
  ]
  const directList = direct.length === 1 ? 'loopback goes' : `${direct.slice(0, -1).join(', ')} and ${direct.at(-1)} go`
  return `outbound ${schemes} requests use the environment proxy ${server?.endpoint}; ${directList} direct. W2L_PROXY=off ignores the proxy variables.`
}

/** Startup line for hosted mode when proxy variables are set: they are ignored. */
export function hostedProxyNotice(env: Env): string | null {
  const names = PROXY_ENV_NAMES.filter(name => (env[name] ?? '') !== '')
  return names.length === 0 ? null : `hosted mode ignores ${names.join(', ')}: outbound connections stay direct to validated addresses.`
}

function proxyServer(name: string, raw: string | undefined): ProxyServer | null {
  const value = (raw ?? '').trim()
  if (value === '') return null
  let url: URL
  let username: string
  let password: string
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`)
    username = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  } catch { throw new ProxyConfigError(`${name} is not a valid proxy URL.`) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyConfigError(`${name} names a ${url.protocol.slice(0, -1)} proxy; W2L supports http:// and https:// proxies.`)
  }
  const endpoint = `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`
  return {
    url: `${url.protocol}//${endpoint}`,
    endpoint,
    ...(username === '' ? {} : { username }),
    ...(password === '' ? {} : { password }),
  }
}

function ipEntry(address: string, port: string | undefined): NoProxyEntry {
  return { kind: 'ip', address, cidr: `${address}/${address.includes(':') ? 128 : 32}`, port: port === undefined ? null : Number(port) }
}

function bypassesProxy(target: URL, noProxy: readonly string[]): boolean {
  const host = target.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || classifyIp(host) === 'loopback_address') return true
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
  const literal = isIpAddress(host)
  for (const raw of noProxy) {
    const entry = parseNoProxyEntry(raw)
    if (entry === null) continue
    if (entry.kind === 'all') return true
    if (entry.kind === 'cidr') {
      if (literal && ipInCidr(host, entry.cidr)) return true
      continue
    }
    if (entry.port !== null && entry.port !== port) continue
    if (entry.kind === 'ip' ? literal && ipInCidr(host, entry.cidr) : !literal && (host === entry.host || host.endsWith(`.${entry.host}`))) return true
  }
  return false
}
