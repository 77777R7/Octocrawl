import type { NetworkPolicy } from '@w2l/contracts'
import type { Dispatcher, ProxyAgent } from 'undici'
import { assertSafeUrl, EgressRoutes, isLocalPreviewProxyTarget } from './egress.js'

/**
 * The outbound route of one lane or auxiliary fetcher under one network
 * policy: which dispatcher a URL takes (the operator's environment proxy or
 * the DNS-pinned direct agent, or the public preview's loopback proxy for its
 * fixed hosts), whether a request leaves through the operator's proxy, and
 * the SSRF check every URL and every redirect hop passes before a request
 * goes out. Extracted from ResilientHttpSubject, unchanged, so the sitemap
 * fetcher takes the same route as the http lane it serves.
 */
export class EgressRoute {
  constructor(
    private readonly policy: NetworkPolicy,
    private readonly routes: EgressRoutes,
    private readonly localPreviewProxy: ProxyAgent | null = null,
  ) {}

  /** The dispatcher for a URL: the local preview proxy for its fixed hosts, else `routes` (a request's relaxed-TLS routes) or the shared ones. */
  dispatcherFor(url: string, routes: EgressRoutes | null = null): Dispatcher {
    return this.localPreviewProxy !== null && isLocalPreviewProxyTarget(url) ? this.localPreviewProxy : (routes ?? this.routes).dispatcherFor(url)
  }

  /** `host:port` of the operator's environment proxy a request to this URL goes through; null when it goes direct. */
  viaOperatorProxy(url: string): string | null {
    return this.localPreviewProxy !== null && isLocalPreviewProxyTarget(url) ? null : this.routes.proxyFor(url)?.endpoint ?? null
  }

  /** The checks before a request leaves, for the requested URL and each redirect hop (assertSafeUrl under this policy). */
  assertUrl(url: string): Promise<void> {
    return assertSafeUrl(url, this.policy)
  }
}
