/**
 * Operator egress proxy: the proxy the person running W2L already uses on
 * their machine, applied to the HTTP lane, the browser lane and robots.txt
 * fetches. It is configured by the operator's environment, never by a
 * request, and only local entry points read it — a hosted service keeps
 * direct, DNS-pinned egress.
 *
 * `W2L_PROXY_URL` wins (the value `off` disables proxying even when the
 * conventional variables are set); otherwise `HTTPS_PROXY` / `HTTP_PROXY`
 * apply, with `NO_PROXY` listing hosts that go direct. Credentials in the
 * URL are used on the wire and never recorded: traces carry
 * `scheme://host:port` only.
 */

import { isIP } from 'node:net'
import { ProxyAgent } from 'undici'

export interface OperatorProxy {
  /** `scheme://host:port`, credentials stripped. */
  server: string
  username?: string
  password?: string
  /** `NO_PROXY` entries: hostnames, `.suffix` domains, IPv4 CIDR ranges, optional `:port`, or `*`. */
  bypass: readonly string[]
  source: 'W2L_PROXY_URL' | 'HTTPS_PROXY' | 'HTTP_PROXY'
}

const DISABLED_VALUES = new Set(['off', 'none', 'direct', '0', 'false'])

function firstEnv(env: NodeJS.ProcessEnv, names: readonly string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = env[name]
    if (value !== undefined && value.trim().length > 0) return { name, value: value.trim() }
  }
  return null
}

export function parseOperatorProxy(value: string, source: OperatorProxy['source'], noProxy = ''): OperatorProxy {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${source} is not a valid URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${source} must be an http or https proxy URL; ${url.protocol.replace(/:$/, '')} proxies are not supported`)
  }
  if (url.hostname.length === 0) throw new Error(`${source} has no host`)
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  const proxy: OperatorProxy = {
    server: `${url.protocol}//${url.hostname}:${port}`,
    bypass: noProxy
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
    source,
  }
  if (url.username) proxy.username = decodeURIComponent(url.username)
  if (url.password) proxy.password = decodeURIComponent(url.password)
  return proxy
}

/** The operator's proxy from the environment, or null when none is set. */
export function operatorProxyFromEnv(env: NodeJS.ProcessEnv = process.env): OperatorProxy | null {
  const explicit = firstEnv(env, ['W2L_PROXY_URL'])
  if (explicit !== null && DISABLED_VALUES.has(explicit.value.toLowerCase())) return null
  const chosen = explicit ?? firstEnv(env, ['HTTPS_PROXY', 'https_proxy']) ?? firstEnv(env, ['HTTP_PROXY', 'http_proxy'])
  if (chosen === null) return null
  const source: OperatorProxy['source'] =
    chosen.name === 'W2L_PROXY_URL' ? 'W2L_PROXY_URL' : chosen.name.toUpperCase() === 'HTTPS_PROXY' ? 'HTTPS_PROXY' : 'HTTP_PROXY'
  return parseOperatorProxy(chosen.value, source, firstEnv(env, ['NO_PROXY', 'no_proxy'])?.value ?? '')
}

function splitHostPort(entry: string): { host: string; port: string | undefined } {
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']')
    if (close === -1) return { host: entry, port: undefined }
    const rest = entry.slice(close + 1)
    return { host: entry.slice(1, close), port: rest.startsWith(':') ? rest.slice(1) : undefined }
  }
  // A bare IPv6 literal has several colons and never carries a port.
  if (entry.split(':').length > 2) return { host: entry, port: undefined }
  const [host = '', port] = entry.split(':')
  return { host, port }
}

function ipv4ToInt(address: string): number | null {
  if (isIP(address) !== 4) return null
  return address.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0)
}

function inCidr(host: string, cidr: string): boolean {
  const [network = '', bitsText] = cidr.split('/')
  const bits = Number(bitsText)
  const hostInt = ipv4ToInt(host)
  const networkInt = ipv4ToInt(network)
  if (hostInt === null || networkInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((hostInt & mask) >>> 0) === ((networkInt & mask) >>> 0)
}

/** Whether `NO_PROXY` sends this URL direct. */
export function proxyBypasses(proxy: OperatorProxy, url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  for (const raw of proxy.bypass) {
    if (raw === '*') return true
    const entry = splitHostPort(raw)
    if (entry.port !== undefined && entry.port !== port) continue
    if (entry.host.includes('/')) {
      if (inCidr(host, entry.host)) return true
      continue
    }
    const pattern = entry.host.replace(/^\*?\./, '.')
    if (pattern.startsWith('.')) {
      if (host === pattern.slice(1) || host.endsWith(pattern)) return true
    } else if (host === pattern) {
      return true
    }
  }
  return false
}

/** An undici dispatcher that tunnels through the operator's proxy. */
export function proxyAgentFor(proxy: OperatorProxy): ProxyAgent {
  const token =
    proxy.username === undefined
      ? undefined
      : `Basic ${Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64')}`
  return new ProxyAgent({ uri: proxy.server, ...(token === undefined ? {} : { token }) })
}

/** Playwright's launch option for the same proxy. */
export function playwrightProxyFor(proxy: OperatorProxy): { server: string; bypass?: string; username?: string; password?: string } {
  return {
    server: proxy.server,
    ...(proxy.bypass.length === 0 ? {} : { bypass: proxy.bypass.join(',') }),
    ...(proxy.username === undefined ? {} : { username: proxy.username }),
    ...(proxy.password === undefined ? {} : { password: proxy.password }),
  }
}

/** What a trace may say about the proxy: never the credentials. */
export function describeProxy(proxy: OperatorProxy): { server: string; source: OperatorProxy['source'] } {
  return { server: proxy.server, source: proxy.source }
}
