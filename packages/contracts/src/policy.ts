/**
 * Network egress policy.
 *
 * Contract: there is no per-request "allow private network" flag. Private-range
 * access requires an explicit host/CIDR allowlist that only a server operator can
 * set (config file or env at process start). API callers cannot widen it.
 */

export type PolicyOrigin =
  /** Set by the operator at process start. The only origin allowed to permit private ranges. */
  | 'operator'
  /** Derived from an API request. May narrow the effective policy, never widen it. */
  | 'request'

export interface NetworkPolicy {
  origin: PolicyOrigin
  /**
   * Hosts and CIDRs exempt from private-range blocking.
   * Entries are literal hostnames, IPs, or CIDR blocks (e.g. '127.0.0.1/32').
   * Ignored — and a violation — when origin is 'request'.
   */
  privateAllowlist: readonly string[]
  maxRedirects: number
  maxBodyBytes: number
  /** Cap on post-decompression size, to bound zip bombs. */
  maxDecompressedBytes: number
  /** Per-host concurrent request ceiling. */
  perHostConcurrency: number
  /** Minimum delay between requests to the same host. */
  perHostMinDelayMs: number
  respectRobotsTxt: boolean
  /** How long one robots.txt lookup may take before the file counts as unreachable. Default 5000. */
  robotsTimeoutMs?: number
  /**
   * How long an unreachable robots.txt (a 5xx, a network error or a lookup
   * timeout) stays a complete disallow for its origin before it is fetched
   * again. Other robots.txt results are kept for the life of the process.
   * Default 300000 (5 minutes).
   */
  robotsUnreachableTtlMs?: number
  /**
   * The operator's forward proxy, read from the standard environment
   * variables by local-mode entry points (`withEnvironmentProxy`). Hosted
   * policies never carry one. A proxied host is resolved by the proxy, so only
   * the literal host checks apply to it (`proxyFor`). Ignored unless origin
   * is 'operator'.
   */
  egressProxy?: EgressProxy | null
}

/**
 * Where outbound requests go when the operator's environment names a proxy:
 * one proxy per URL scheme, and NO_PROXY entries that go direct. Loopback
 * always goes direct. `https` and `http` are equal or one of them is null,
 * because the browser lane can route through only one proxy.
 */
export interface EgressProxy {
  source: 'environment'
  /** From HTTPS_PROXY / https_proxy. Null sends https: URLs direct. */
  https: ProxyServer | null
  /** From HTTP_PROXY / http_proxy. Null sends http: URLs direct. */
  http: ProxyServer | null
  /** NO_PROXY / no_proxy entries, lower-cased. */
  noProxy: readonly string[]
}

export interface ProxyServer {
  /** `http://host:port` or `https://host:port`, without credentials. */
  url: string
  /** `host:port`: the only form of the proxy that results record. */
  endpoint: string
  /** Credentials from the variable's userinfo. Held in memory for the proxy, never recorded or logged. */
  username?: string
  password?: string
}

export const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  origin: 'request',
  privateAllowlist: [],
  maxRedirects: 5,
  maxBodyBytes: 10 * 1024 * 1024,
  maxDecompressedBytes: 50 * 1024 * 1024,
  perHostConcurrency: 2,
  perHostMinDelayMs: 250,
  respectRobotsTxt: true,
}

export const POLICY_VIOLATION = [
  'private_address',
  'loopback_address',
  'link_local_address',
  'cloud_metadata_address',
  'unspecified_address',
  'unsupported_scheme',
  'malformed_url',
  /** A request-origin policy tried to grant private-range access. */
  'privilege_escalation',
] as const

export type PolicyViolation = (typeof POLICY_VIOLATION)[number]

export interface PolicyDecision {
  allowed: boolean
  violation: PolicyViolation | null
  /** The IP the hostname resolved to, pinned for the actual connection. */
  pinnedAddress: string | null
  detail: string | null
}
