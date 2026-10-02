/**
 * In-memory crawl frontier: canonicalize, visited, depth, host politeness.
 *
 * No fetch. The orchestrator (Phase 4/5) calls seed/enqueue/dequeue/release.
 * Host delay is max(perHostMinDelayMs, robots crawlDelayMs for that host).
 * Until a page on a host has reported that host's robots.txt answer
 * (setCrawlDelay), the host starts one page at a time, so a Crawl-delay holds
 * from its second request on.
 *
 * A link is admitted in this order: canonicalize, depth, host scope, the
 * seed's path subtree, the asset and path filters, visited. The host scope is
 * the seed host, its apex/www twin and the host the seed redirected to
 * (followSeedRedirect), plus an allowlist's hosts (exact / `*.domain`, as
 * governance matches them), every host under the seed's apex when
 * allowSubdomains is set, and every host when allowExternalLinks is set.
 * Unless crawlEntireDomain is set, a link on a seed host must lie in the
 * seed's path subtree: its directory, or the directory of the file it names
 * (`/3/tutorial/index.html` -> `/3/tutorial/`), or itself plus `/`; a
 * redirect of the seed adds the final URL's subtree. includePaths /
 * excludePaths are regexes on an enqueued link's pathname (Firecrawl
 * semantics, exclude wins; a link a filter cannot decide in its time limit is
 * skipped, see pathFilter.ts), or on its canonical URL with regexOnFullURL,
 * and links to assets (images, fonts, styles, scripts, audio, video,
 * programs) are not enqueued. Seeds bypass the subtree, path and asset
 * filters, so the seed URL is always fetched.
 *
 * A sitemap entry (enqueueFromSitemap) is admitted exactly as a link is, at
 * the depth the orchestrator gives it, and recorded as discovered via the
 * sitemap file that listed it.
 *
 * Visited is keyed by visitKey (canonicalize.ts): the canonical URL, without
 * its query when ignoreQueryParameters is set, and folded over scheme, `www.`,
 * trailing slash and index file when deduplicateSimilarURLs is set. A link
 * whose key was seen under a different URL is refused as a duplicate with
 * `collapsedInto`, the first-seen page's canonical URL; the first-seen href
 * is what gets fetched.
 */

import { isIP } from 'node:net'
import { DEFAULT_NETWORK_POLICY } from '@w2l/contracts'
import { hostMatchesAllowlist } from '@w2l/http-core'
import { canonicalizeUrl, hostOf, visitKey } from './canonicalize.js'
import { compilePathFilter, type PathFilter } from './pathFilter.js'

export interface FrontierItem {
  url: string
  canonicalUrl: string
  depth: number
  host: string
  /** How the URL entered the crawl: the seed, a link on a page, or a sitemap entry. */
  via: 'seed' | 'link' | 'sitemap'
  /** The canonical URL of the page that linked it, when a link; the URL of the sitemap file that listed it, when a sitemap entry. */
  from?: string
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
    | 'subtree_denied'
    | 'path_denied'
    | 'path_undecided'
    | 'asset_denied'
    | 'scheme_denied'
  /** On a duplicate that is a variant of an earlier URL (not the same URL again): the canonical URL it was folded into. */
  collapsedInto?: string
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
  /** Match includePaths / excludePaths against the canonical URL instead of the pathname. */
  regexOnFullURL?: boolean
  /** Drop the query string from every canonical URL. */
  ignoreQueryParameters?: boolean
  /** Fold scheme, `www.`, trailing slash and index file in the visited key. */
  deduplicateSimilarURLs?: boolean
  /** Follow links anywhere on a seed host, not only in the seed's path subtree. */
  crawlEntireDomain?: boolean
  /** Admit every host under the seed's apex. */
  allowSubdomains?: boolean
  /** Admit every host. */
  allowExternalLinks?: boolean
}

/** A path subtree links on a seed host may lie in: the exact path, or anything under `dir`. */
interface Subtree {
  pathname: string
  dir: string
}

export class Frontier {
  readonly seedCanonicalUrl: string
  private readonly seedHosts = new Set<string>()
  /** The seed host with one leading `www.` removed; `*.apex` is what allowSubdomains admits. */
  private readonly seedApex: string
  private readonly subtrees: Subtree[] = []
  private readonly maxDepth: number | null
  private readonly allowlistedDomains: readonly string[]
  private readonly includePaths: readonly PathFilter[]
  private readonly excludePaths: readonly PathFilter[]
  private readonly regexOnFullURL: boolean
  private readonly ignoreQueryParameters: boolean
  private readonly deduplicateSimilarURLs: boolean
  private readonly crawlEntireDomain: boolean
  private readonly allowSubdomains: boolean
  private readonly allowExternalLinks: boolean
  private readonly perHostConcurrency: number
  private readonly perHostMinDelayMs: number
  private crawlDelayMsByHost: ReadonlyMap<string, number>
  private readonly pending: FrontierItem[] = []
  /** Visit key -> the first URL seen under it (its canonical URL) and every variant offered since, by canonical URL with query: a repeat of one of them is a duplicate, a new one is collapsed. */
  private readonly visited = new Map<string, { canonicalUrl: string; variants: Set<string> }>()
  private readonly inFlight = new Map<string, number>()
  private readonly lastStartedAtMs = new Map<string, number>()
  /** Hosts a page has reported robots.txt for, with or without a Crawl-delay. */
  private readonly robotsKnown = new Set<string>()

  constructor(options: FrontierOptions) {
    this.ignoreQueryParameters = options.ignoreQueryParameters === true
    const seed = canonicalizeUrl(options.seedUrl, undefined, { ignoreQuery: this.ignoreQueryParameters })
    if (seed === null) throw new Error(`Frontier seed is not an http(s) URL: ${options.seedUrl}`)
    this.seedCanonicalUrl = seed
    const seedHost = hostOf(seed)
    this.seedApex = seedHost.startsWith('www.') ? seedHost.slice(4) : seedHost
    this.addSeedHost(seedHost)
    this.addSubtree(new URL(seed).pathname)
    this.maxDepth = options.maxDepth === undefined ? null : options.maxDepth
    this.allowlistedDomains = options.allowlistedDomains ?? []
    this.includePaths = (options.includePaths ?? []).map((pattern) => compilePathFilter(pattern))
    this.excludePaths = (options.excludePaths ?? []).map((pattern) => compilePathFilter(pattern))
    this.regexOnFullURL = options.regexOnFullURL === true
    this.deduplicateSimilarURLs = options.deduplicateSimilarURLs === true
    this.crawlEntireDomain = options.crawlEntireDomain === true
    this.allowSubdomains = options.allowSubdomains === true
    this.allowExternalLinks = options.allowExternalLinks === true
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

  /** An absolute URL a sitemap file listed, offered under a link's rules (host scope, subtree, path filters, depth, visited) and recorded as found via that file. */
  enqueueFromSitemap(url: string, depth: number, fileUrl: string): FrontierEnqueueResult {
    return this.offer(url, depth, 'enqueued', undefined, { via: 'sitemap', from: fileUrl })
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
    return this.visited.has(this.keyOf(canonicalUrl))
  }

  /**
   * Remember a URL without enqueueing it. Resume uses this so a completed
   * page is not crawled again, while unfinished URLs can still be seeded.
   */
  markVisited(canonicalUrl: string): void {
    const key = this.keyOf(canonicalUrl)
    if (!this.visited.has(key)) this.visited.set(key, { canonicalUrl, variants: new Set([canonicalUrl]) })
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
   * its host and that host's apex/www twin count as the seed host from now
   * on, and its path subtree is in scope beside the seed's own.
   */
  followSeedRedirect(finalUrl: string): void {
    const canonical = canonicalizeUrl(finalUrl, undefined, { ignoreQuery: this.ignoreQueryParameters })
    if (canonical === null) return
    this.addSeedHost(hostOf(canonical))
    this.addSubtree(new URL(canonical).pathname)
  }

  private offer(
    url: string,
    depth: number,
    acceptedReason: 'enqueued' | 'seeded',
    base?: string,
    origin?: Pick<FrontierItem, 'via' | 'from'>,
  ): FrontierEnqueueResult {
    // The canonical URL with its query tells a repeat of the same URL from a variant folded into it.
    const fullCanonicalUrl = canonicalizeUrl(url, base)
    if (fullCanonicalUrl === null) {
      return { accepted: false, canonicalUrl: null, reason: urlLooksLikeNonHttp(url, base) ? 'scheme_denied' : 'malformed' }
    }
    const canonicalUrl = this.ignoreQueryParameters ? canonicalizeUrl(fullCanonicalUrl, undefined, { ignoreQuery: true })! : fullCanonicalUrl
    if (this.maxDepth !== null && depth > this.maxDepth) {
      return { accepted: false, canonicalUrl, reason: 'depth' }
    }
    const host = hostOf(canonicalUrl)
    if (!this.hostAllowed(host)) {
      return { accepted: false, canonicalUrl, reason: 'host_denied' }
    }
    if (acceptedReason === 'enqueued') {
      const pathname = new URL(canonicalUrl).pathname
      if (!this.crawlEntireDomain && this.seedHosts.has(host) && !this.inSeedSubtree(pathname)) {
        return { accepted: false, canonicalUrl, reason: 'subtree_denied' }
      }
      if (isAssetPath(pathname)) return { accepted: false, canonicalUrl, reason: 'asset_denied' }
      const allowed = this.pathAllowed(this.regexOnFullURL ? canonicalUrl : pathname)
      if (allowed !== true) return { accepted: false, canonicalUrl, reason: allowed === false ? 'path_denied' : 'path_undecided' }
    }
    const key = this.keyOf(canonicalUrl)
    const seen = this.visited.get(key)
    if (seen !== undefined) {
      if (seen.variants.has(fullCanonicalUrl)) return { accepted: false, canonicalUrl, reason: 'duplicate' }
      seen.variants.add(fullCanonicalUrl)
      return { accepted: false, canonicalUrl, reason: 'duplicate', collapsedInto: seen.canonicalUrl }
    }
    this.visited.set(key, { canonicalUrl, variants: new Set([fullCanonicalUrl]) })
    const from = origin?.from ?? base
    this.pending.push({
      url: resolvedHref(url, base) ?? canonicalUrl,
      canonicalUrl,
      depth,
      host,
      via: origin?.via ?? (acceptedReason === 'seeded' ? 'seed' : 'link'),
      ...(from === undefined ? {} : { from }),
    })
    return { accepted: true, canonicalUrl, reason: acceptedReason }
  }

  private keyOf(canonicalUrl: string): string {
    return visitKey(canonicalUrl, { deduplicateSimilarURLs: this.deduplicateSimilarURLs })
  }

  private hostAllowed(host: string): boolean {
    if (this.seedHosts.has(host) || this.allowExternalLinks) return true
    if (this.allowSubdomains && host.endsWith(`.${this.seedApex}`)) return true
    return this.allowlistedDomains.some((entry) => hostMatchesAllowlist(host, entry))
  }

  private addSeedHost(host: string): void {
    this.seedHosts.add(host)
    const twin = wwwTwin(host)
    if (twin !== null) this.seedHosts.add(twin)
  }

  private addSubtree(pathname: string): void {
    const dir = subtreeDir(pathname)
    if (!this.subtrees.some((subtree) => subtree.pathname === pathname && subtree.dir === dir)) this.subtrees.push({ pathname, dir })
  }

  private inSeedSubtree(pathname: string): boolean {
    return this.subtrees.some((subtree) => pathname === subtree.pathname || pathname.startsWith(subtree.dir))
  }

  /** Exclude wins; null when a filter that could change the answer did not decide in its time limit. */
  private pathAllowed(subject: string): boolean | null {
    let undecided = false
    for (const pattern of this.excludePaths) {
      const match = pattern.test(subject)
      if (match === true) return false
      if (match === null) undecided = true
    }
    if (undecided) return null
    if (this.includePaths.length === 0) return true
    for (const pattern of this.includePaths) {
      const match = pattern.test(subject)
      if (match === true) return true
      if (match === null) undecided = true
    }
    return undecided ? null : false
  }
}

/**
 * The directory a seed's links must lie under: the path itself when it names
 * a directory, the directory of the file it names when its last segment has
 * a dot, else the path as a directory (`/search` covers `/search/x`; the exact
 * `/search` passes as the seed's own path).
 */
function subtreeDir(pathname: string): string {
  if (pathname.endsWith('/')) return pathname
  const cut = pathname.lastIndexOf('/')
  const last = pathname.slice(cut + 1)
  return last.includes('.') ? pathname.slice(0, cut + 1) : `${pathname}/`
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
