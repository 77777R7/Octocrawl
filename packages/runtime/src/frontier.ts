/**
 * In-memory crawl frontier: canonicalize, visited, depth, host politeness.
 *
 * No fetch. The orchestrator (Phase 4/5) calls seed/enqueue/dequeue/release.
 * Host delay is max(perHostMinDelayMs, robots crawlDelayMs for that host).
 * Until a page on a host has reported that host's robots.txt answer
 * (setCrawlDelay), the host starts one page at a time, so a Crawl-delay holds
 * from its second request on.
 * Default host filter is the seed host, its apex/www twin and the host the
 * seed redirected to (followSeedRedirect); a non-empty allowlist replaces it
 * with the same exact / `*.domain` match as governance. includePaths /
 * excludePaths are regexes on an enqueued link's pathname (Firecrawl
 * semantics, exclude wins), and links to assets (images, fonts, styles,
 * scripts, audio, video, programs) are not enqueued. Seeds bypass the path
 * and asset filters, so the seed URL is always fetched.
 */

import { isIP } from 'node:net'
import { DEFAULT_NETWORK_POLICY } from '@w2l/contracts'
import { hostMatchesAllowlist } from '@w2l/http-core'
import { canonicalizeUrl, hostOf } from './canonicalize.js'

export interface FrontierItem {
  url: string
  canonicalUrl: string
  depth: number
  host: string
}

export interface FrontierEnqueueResult {
  accepted: boolean
  canonicalUrl: string | null
  reason:
    | 'enqueued'
    | 'seeded'
    | 'duplicate'
    | 'malformed'
    | 'depth'
    | 'host_denied'
    | 'path_denied'
    | 'asset_denied'
    | 'scheme_denied'
}

export interface FrontierDequeue {
  item: FrontierItem | null
  /** When `item` is null and the queue is not empty, the next host delay expiry. */
  nextReadyAtMs: number | null
  /** Pending pages the admit test refused and dropped during this call. */
  refused: number
  /** When the previous page on `item`'s host started; null for its first page. */
  previousStartAtMs: number | null
}

export interface FrontierOptions {
  seedUrl: string
  maxDepth?: number | null
  allowlistedDomains?: readonly string[]
  perHostConcurrency?: number
  perHostMinDelayMs?: number
  /** robots.txt Crawl-delay per host, already parsed to milliseconds. */
  crawlDelayMsByHost?: ReadonlyMap<string, number>
  includePaths?: readonly string[]
  excludePaths?: readonly string[]
}

export class Frontier {
  readonly seedCanonicalUrl: string
  private readonly seedHosts = new Set<string>()
  private readonly maxDepth: number | null
  private readonly allowlistedDomains: readonly string[]
  private readonly includePaths: readonly RegExp[]
  private readonly excludePaths: readonly RegExp[]
  private readonly perHostConcurrency: number
  private readonly perHostMinDelayMs: number
  private crawlDelayMsByHost: ReadonlyMap<string, number>
  private readonly pending: FrontierItem[] = []
  private readonly visited = new Set<string>()
  private readonly inFlight = new Map<string, number>()
  private readonly lastStartedAtMs = new Map<string, number>()
  /** Hosts a page has reported robots.txt for, with or without a Crawl-delay. */
  private readonly robotsKnown = new Set<string>()

  constructor(options: FrontierOptions) {
    const seed = canonicalizeUrl(options.seedUrl)
    if (seed === null) throw new Error(`Frontier seed is not an http(s) URL: ${options.seedUrl}`)
    this.seedCanonicalUrl = seed
    this.addSeedHost(hostOf(seed))
    this.maxDepth = options.maxDepth === undefined ? null : options.maxDepth
    this.allowlistedDomains = options.allowlistedDomains ?? []
    this.includePaths = (options.includePaths ?? []).map((pattern) => new RegExp(pattern))
    this.excludePaths = (options.excludePaths ?? []).map((pattern) => new RegExp(pattern))
    this.perHostConcurrency = options.perHostConcurrency ?? DEFAULT_NETWORK_POLICY.perHostConcurrency
    this.perHostMinDelayMs = options.perHostMinDelayMs ?? DEFAULT_NETWORK_POLICY.perHostMinDelayMs
    this.crawlDelayMsByHost = options.crawlDelayMsByHost ?? new Map()
  }

  seed(url: string = this.seedCanonicalUrl, depth = 0): FrontierEnqueueResult {
    return this.offer(url, depth, 'seeded')
  }

  enqueue(url: string, depth: number, base?: string): FrontierEnqueueResult {
    return this.offer(url, depth, 'enqueued', base)
  }

  /**
   * The next page whose host has a free slot and whose delay has passed.
   * Pages `admit` refuses (the orchestrator's page budget) leave the queue
   * without starting, so they neither take a slot nor delay their host.
   */
  dequeue(nowMs: number, admit?: (item: FrontierItem) => boolean): FrontierDequeue {
    let nextReadyAtMs: number | null = null
    let refused = 0
    for (let i = 0; i < this.pending.length; i++) {
      const item = this.pending[i]!
      if (admit !== undefined && !admit(item)) {
        this.pending.splice(i--, 1)
        refused++
        continue
      }
      const inFlight = this.inFlight.get(item.host) ?? 0
      if (inFlight >= (this.robotsKnown.has(item.host) ? this.perHostConcurrency : 1)) continue
      const delay = this.hostDelayMs(item.host)
      const last = this.lastStartedAtMs.get(item.host)
      if (last !== undefined) {
        const readyAt = last + delay
        if (nowMs < readyAt) {
          nextReadyAtMs = nextReadyAtMs === null ? readyAt : Math.min(nextReadyAtMs, readyAt)
          continue
        }
      }
      this.pending.splice(i, 1)
      this.inFlight.set(item.host, inFlight + 1)
      this.lastStartedAtMs.set(item.host, nowMs)
      return { item, nextReadyAtMs: null, refused, previousStartAtMs: last ?? null }
    }
    return {
      item: null,
      nextReadyAtMs: this.pending.length === 0 ? null : nextReadyAtMs,
      refused,
      previousStartAtMs: null,
    }
  }

  /**
   * Caller finished the page (success, failure, or skip). Frees a host slot.
   * The canonical URL stays in `visited` so it is not crawled again.
   */
  release(canonicalUrl: string): void {
    const host = hostOf(canonicalUrl)
    const inFlight = this.inFlight.get(host) ?? 0
    if (inFlight <= 1) this.inFlight.delete(host)
    else this.inFlight.set(host, inFlight - 1)
  }

  has(canonicalUrl: string): boolean {
    return this.visited.has(canonicalUrl)
  }

  /**
   * Remember a URL without enqueueing it. Resume uses this so a completed
   * page is not crawled again, while unfinished URLs can still be seeded.
   */
  markVisited(canonicalUrl: string): void {
    this.visited.add(canonicalUrl)
  }

  /** Queued pages, or those of them `where` accepts. */
  pendingCount(where?: (item: FrontierItem) => boolean): number {
    return where === undefined ? this.pending.length : this.pending.filter(where).length
  }

  inFlightCount(host?: string): number {
    if (host !== undefined) return this.inFlight.get(host) ?? 0
    let total = 0
    for (const n of this.inFlight.values()) total += n
    return total
  }

  hostDelayMs(host: string): number {
    const robotsDelay = this.crawlDelayMsByHost.get(host) ?? 0
    return Math.max(this.perHostMinDelayMs, robotsDelay)
  }

  /** A page on `host` reported its robots.txt Crawl-delay (null: none). The strictest one seen holds. */
  setCrawlDelay(host: string, delayMs: number | null): void {
    this.robotsKnown.add(host)
    if (delayMs === null) return
    const next = Math.max(0, delayMs)
    const current = this.crawlDelayMsByHost.get(host) ?? 0
    if (next <= current) return
    this.crawlDelayMsByHost = new Map(this.crawlDelayMsByHost).set(host, next)
  }

  /** The robots.txt Crawl-delay in force for `host`, or null when none is known. */
  crawlDelayMs(host: string): number | null {
    return this.crawlDelayMsByHost.get(host) ?? null
  }

  /**
   * The seed answered from `finalUrl`, and its links resolve against that URL:
   * its host and that host's apex/www twin count as the seed host from now on.
   * An explicit allowlist is never widened.
   */
  followSeedRedirect(finalUrl: string): void {
    const canonical = canonicalizeUrl(finalUrl)
    if (canonical !== null) this.addSeedHost(hostOf(canonical))
  }

  private offer(
    url: string,
    depth: number,
    acceptedReason: 'enqueued' | 'seeded',
    base?: string,
  ): FrontierEnqueueResult {
    const canonicalUrl = canonicalizeUrl(url, base)
    if (canonicalUrl === null) {
      return { accepted: false, canonicalUrl: null, reason: urlLooksLikeNonHttp(url, base) ? 'scheme_denied' : 'malformed' }
    }
    if (this.maxDepth !== null && depth > this.maxDepth) {
      return { accepted: false, canonicalUrl, reason: 'depth' }
    }
    const host = hostOf(canonicalUrl)
    if (!this.hostAllowed(host)) {
      return { accepted: false, canonicalUrl, reason: 'host_denied' }
    }
    if (acceptedReason === 'enqueued') {
      const pathname = new URL(canonicalUrl).pathname
      if (isAssetPath(pathname)) return { accepted: false, canonicalUrl, reason: 'asset_denied' }
      if (!this.pathAllowed(pathname)) return { accepted: false, canonicalUrl, reason: 'path_denied' }
    }
    if (this.visited.has(canonicalUrl)) {
      return { accepted: false, canonicalUrl, reason: 'duplicate' }
    }
    this.visited.add(canonicalUrl)
    this.pending.push({ url: resolvedHref(url, base) ?? canonicalUrl, canonicalUrl, depth, host })
    return { accepted: true, canonicalUrl, reason: acceptedReason }
  }

  private hostAllowed(host: string): boolean {
    if (this.allowlistedDomains.length > 0) {
      return this.allowlistedDomains.some((entry) => hostMatchesAllowlist(host, entry))
    }
    return this.seedHosts.has(host)
  }

  private addSeedHost(host: string): void {
    this.seedHosts.add(host)
    const twin = wwwTwin(host)
    if (twin !== null) this.seedHosts.add(twin)
  }

  private pathAllowed(pathname: string): boolean {
    if (this.excludePaths.some((pattern) => pattern.test(pathname))) return false
    return this.includePaths.length === 0 || this.includePaths.some((pattern) => pattern.test(pathname))
  }
}

/** `www.example.com` and `example.com` name one site; an IP address or a one-label host has no twin. */
function wwwTwin(host: string): string | null {
  if (host.startsWith('www.')) return host.slice(4)
  if (!host.includes('.') || isIP(host.replace(/^\[|\]$/g, '')) !== 0) return null
  return `www.${host}`
}

/**
 * Links a crawl does not follow: images, fonts, stylesheets, scripts, audio,
 * video and programs. Documents and data files (PDF, CSV, XLSX, JSON, XML,
 * ZIP) stay: P2's file download starts with them.
 */
const ASSET_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'tif', 'tiff', 'heic',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'css', 'js', 'mjs', 'map',
  'mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'mp4', 'm4v', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'mpg', 'mpeg',
  'exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'iso', 'bin',
])

function isAssetPath(pathname: string): boolean {
  const name = pathname.slice(pathname.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 && ASSET_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

function resolvedHref(url: string, base?: string): string | null {
  try {
    return (base === undefined ? new URL(url) : new URL(url, base)).href
  } catch {
    return null
  }
}

function urlLooksLikeNonHttp(url: string, base?: string): boolean {
  try {
    const parsed = base === undefined ? new URL(url) : new URL(url, base)
    return parsed.protocol !== 'http:' && parsed.protocol !== 'https:'
  } catch {
    return false
  }
}
