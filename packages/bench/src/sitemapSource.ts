/**
 * The crawl's sitemap reader: an auxiliary fetch path beside robots.txt, not a
 * page fetcher, so it never runs through the ladder or the extractor.
 *
 * Every file is requested exactly as the http lane requests a page: the crawl
 * mode's declared identity (its User-Agent and client hints, nothing else),
 * the SSRF check on the URL and on every redirect hop, the DNS-pinned direct
 * agent or the operator's environment proxy, the origin scheduler's permit and
 * pacing, the policy's redirect limit and its 10 MiB wire cap. The file's own
 * URL is judged by its host's robots.txt under the same identity before it is
 * requested, and an unreachable robots.txt refuses it as it would a page.
 * A gzip body (`.gz`, or the magic number) is inflated under the policy's
 * decompression cap. A `<sitemapindex>` is followed one level, its children in
 * listed order; at most `maxFiles` files are read and the load stops once
 * `maxUrls` entries are in hand. Every file read, refused or unreadable is on
 * the record the crawl keeps; none of these fetches has a compliance record.
 */

import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import type { CrawlMode, ExecutionContext, IdentityDevice, NetworkPolicy, SitemapEntry, SitemapFileRecord, SitemapLoadRequest, SitemapLoadResult, SitemapSource } from '@w2l/contracts'
import { createExecutionScope, isTlsError, looksGzipped, parseSitemapXml, raceWithSignal, throwIfExecutionStopped } from '@w2l/http-core'
import { request } from 'undici'
import { BodyTooLargeError, defaultNetworkPolicy, DnsLookupError, EgressRoutes, readCappedBody, SsrfDeniedError } from './egress.js'
import { EgressRoute } from './egressRoute.js'
import { prepareHttpIdentity } from './httpIdentity.js'
import { RobotsOriginCache } from './robotsLookup.js'
import { OriginScheduler } from './subjects/originScheduler.js'

export interface HttpSitemapSourceOptions {
  /** The crawl's mode: its declared identity is what the files are requested with. Default standard. */
  mode?: CrawlMode
  /** The declared browser identity the crawl's pages use (`mobile` on the request selects the mobile one). Default desktop. */
  device?: IdentityDevice
  networkPolicy?: NetworkPolicy
  /** The origin scheduler the lanes share, so sitemap requests take their turn behind pages on the same origin. */
  scheduler?: OriginScheduler
  /** The http lane's robots.txt cache, so the start URL's robots.txt is read once for the crawl; without it the source keeps its own. */
  robots?: RobotsOriginCache
}

/** Default waits for a sitemap response's headers and for each chunk of its body, as the http lane's without a caller's timeout. */
const HEADERS_TIMEOUT_MS = 10_000
const BODY_TIMEOUT_MS = 30_000

interface ReadFile {
  record: SitemapFileRecord
  /** The file's entries when it parsed as a sitemap: child files for an index, pages for a urlset. */
  locs: readonly string[] | null
}

export class HttpSitemapSource implements SitemapSource {
  private readonly mode: CrawlMode
  private readonly device: IdentityDevice
  private readonly policy: NetworkPolicy
  private readonly scheduler: OriginScheduler
  private readonly routes: EgressRoutes
  private readonly route: EgressRoute
  private readonly robots: RobotsOriginCache
  private readonly ownRobots: boolean
  private closing: Promise<void> | null = null

  constructor(options: HttpSitemapSourceOptions = {}) {
    this.mode = options.mode ?? 'standard'
    this.device = options.device ?? 'desktop'
    this.policy = options.networkPolicy ?? defaultNetworkPolicy()
    this.scheduler = options.scheduler ?? new OriginScheduler(this.policy)
    this.routes = new EgressRoutes(this.policy)
    this.route = new EgressRoute(this.policy, this.routes)
    this.ownRobots = options.robots === undefined
    this.robots = options.robots ?? new RobotsOriginCache(this.policy, (url) => this.route.dispatcherFor(url))
  }

  async load(request: SitemapLoadRequest, context: ExecutionContext = {}): Promise<SitemapLoadResult> {
    const scope = createExecutionScope(context)
    try {
      const seed = new URL(request.seedUrl)
      const identity = this.identityFor(seed.hostname)
      const result: SitemapLoadResult = { identity: { mode: this.mode, userAgent: identity.userAgent }, sources: [], files: [], urls: [], truncated: null }
      // Where to look: the Sitemap lines of the start URL's robots.txt (one read, shared with the http lane), else the conventional location.
      const robots = await this.robots.lookup(seed.href, identity.userAgent, scope)
      const declared = dedupe((robots?.robots?.sitemaps ?? []).map((line) => httpHref(line, robots?.robotsUrl)).filter((url): url is string => url !== null))
      result.sources.push(declared.length > 0 ? 'robots' : 'guess')
      const queue: Array<{ url: string; depth: number }> = (declared.length > 0 ? declared : [`${seed.origin}/sitemap.xml`]).map((url) => ({ url, depth: 0 }))
      const seen = new Set<string>()
      while (queue.length > 0) {
        if (result.files.length >= request.maxFiles) { result.truncated = 'files'; break }
        const next = queue.shift()!
        const file = await this.readFile(next.url, scope)
        result.files.push(file.record)
        if (file.locs === null) continue
        if (file.record.kind === 'index') {
          // One level: a child that is itself an index is recorded, not followed.
          if (next.depth === 0) queue.push(...file.locs.map((url) => ({ url, depth: 1 })))
          continue
        }
        let left = 0
        for (const url of file.locs) {
          if (seen.has(url)) continue
          if (result.urls.length >= request.maxUrls) { left++; continue }
          seen.add(url)
          result.urls.push({ url, file: next.url } satisfies SitemapEntry)
        }
        if (result.urls.length >= request.maxUrls && (left > 0 || queue.length > 0)) { result.truncated = 'urls'; break }
      }
      return result
    } finally {
      scope.dispose()
    }
  }

  async close(): Promise<void> {
    this.closing ??= Promise.all([this.routes.close(), this.ownRobots ? this.robots.teardown() : Promise.resolve()]).then(() => {})
    await this.closing
  }

  /** The crawl mode's declared identity for a host (research mode declares SEC's own format to SEC.gov, as the http lane does). */
  private identityFor(hostname: string): { userAgent: string; headers: Record<string, string> } {
    const prepared = prepareHttpIdentity(this.mode, this.policy.contact ?? null, hostname, this.device)
    return { userAgent: prepared.identity.userAgent, headers: prepared.identityHeaders }
  }

  /** One sitemap file: its robots.txt verdict, then its fetch, inflation and parse, each outcome a record and never a thrown error unless the load was cancelled. */
  private async readFile(url: string, scope: ExecutionContext): Promise<ReadFile> {
    const identity = this.identityFor(new URL(url).hostname)
    const record: SitemapFileRecord = { url, finalUrl: null, status: null, contentType: null, bytes: null, sha256: null, kind: 'unreadable', entries: null, robots: null, proxyUsed: this.route.viaOperatorProxy(url) !== null, error: null }
    const unreadable = (error: string): ReadFile => ({ record: { ...record, kind: 'unreadable', error }, locs: null })
    try {
      // The file's own egress check comes before robots.txt, as a page's does: an address the policy denies is reported as itself, never as the unreachable robots.txt it would also cause.
      await raceWithSignal(this.route.assertUrl(url), scope.signal)
      const cached = await this.robots.lookup(url, identity.userAgent, scope)
      const decision = this.robots.decision(cached, url, identity.userAgent)
      record.robots = decision.decision === 'allowed' ? 'allowed' : decision.decision === 'no_robots' ? 'no_robots' : 'disallowed'
      if (decision.decision === 'disallowed') {
        return { record: { ...record, kind: 'refused', error: decision.unreachable === undefined ? null : `robots_unreachable_${decision.unreachable}` }, locs: null }
      }
      const response = await this.fetch(url, identity.headers, scope)
      record.finalUrl = response.finalUrl
      record.status = response.status
      record.contentType = response.contentType
      if (response.kind === 'redirect_limit') return unreadable('redirect_limit')
      if (response.status >= 500) return unreadable(`http_${response.status}`)
      if (response.status >= 400) return { record: { ...record, kind: 'absent' }, locs: null }
      if (response.status < 200 || response.status >= 300) return unreadable(`http_${response.status}`)
      const bytes = response.bytes!
      record.bytes = bytes.byteLength
      record.sha256 = createHash('sha256').update(bytes).digest('hex')
      let text: string
      try {
        text = new TextDecoder().decode(looksGzipped(response.finalUrl, bytes) ? gunzipSync(bytes, { maxOutputLength: this.policy.maxDecompressedBytes }) : bytes)
      } catch (error) {
        return unreadable((error as { code?: unknown }).code === 'ERR_BUFFER_TOO_LARGE' ? 'decompressed_too_large' : 'gzip_error')
      }
      const parsed = parseSitemapXml(text)
      if (parsed.kind === 'not_sitemap') return { record: { ...record, kind: 'not_sitemap' }, locs: null }
      return {
        record: { ...record, kind: parsed.kind, entries: parsed.locs.length, error: parsed.truncated ? 'entries_over_50000' : null },
        locs: parsed.locs,
      }
    } catch (error) {
      // Cancellation and the deadline stop the load; anything else is this file's own fault.
      throwIfExecutionStopped(scope)
      if (scope.signal?.aborted) throw error
      if (error instanceof BodyTooLargeError) return unreadable('body_too_large')
      if (error instanceof SsrfDeniedError) return unreadable('ssrf_denied')
      if (error instanceof DnsLookupError) return unreadable('dns_error')
      const name = error instanceof Error ? error.name : ''
      if (name === 'HeadersTimeoutError' || name === 'BodyTimeoutError') return unreadable('timeout')
      if (isTlsError(error)) return unreadable('tls_error')
      return unreadable('connection_error')
    }
  }

  /** One file's request, redirects followed within the policy's limit, each hop checked and paced; the body read within the wire cap. */
  private async fetch(url: string, headers: Record<string, string>, scope: ExecutionContext): Promise<{ kind: 'ok' | 'redirect_limit'; finalUrl: string; status: number; contentType: string | null; bytes: Uint8Array | null }> {
    let current = url
    for (let hop = 0; ; hop++) {
      await raceWithSignal(this.route.assertUrl(current), scope.signal)
      const origin = new URL(current).origin
      const permit = await this.scheduler.acquire(origin, scope.signal)
      try {
        await this.scheduler.beforeRequest(origin, scope.signal)
        const response = await request(current, {
          dispatcher: this.route.dispatcherFor(current),
          method: 'GET',
          headers,
          headersTimeout: HEADERS_TIMEOUT_MS,
          bodyTimeout: BODY_TIMEOUT_MS,
          signal: scope.signal,
        })
        const header = (name: string): string | null => {
          const value = response.headers[name]
          return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
        }
        const location = header('location')
        if (response.statusCode >= 300 && response.statusCode < 400 && location !== null) {
          discard(response.body)
          if (hop >= this.policy.maxRedirects) return { kind: 'redirect_limit', finalUrl: current, status: response.statusCode, contentType: header('content-type'), bytes: null }
          current = new URL(location, current).href
          continue
        }
        const contentType = header('content-type')
        if (response.statusCode < 200 || response.statusCode >= 300) {
          discard(response.body)
          return { kind: 'ok', finalUrl: current, status: response.statusCode, contentType, bytes: null }
        }
        const declared = Number(header('content-length'))
        if (Number.isFinite(declared) && declared > this.policy.maxBodyBytes) { discard(response.body); throw new BodyTooLargeError(this.policy.maxBodyBytes, declared) }
        const bytes = await readCappedBody(response.body, this.policy.maxBodyBytes)
        return { kind: 'ok', finalUrl: current, status: response.statusCode, contentType, bytes }
      } finally {
        permit.release()
      }
    }
  }
}

/** The absolute http(s) form of a `Sitemap:` line or a `<loc>`, resolved against `base`; null for anything else. */
function httpHref(value: string, base?: string): string | null {
  try {
    const parsed = base === undefined ? new URL(value) : new URL(value, base)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function dedupe(urls: readonly string[]): string[] {
  return [...new Set(urls)]
}

/** Closes a body that will not be read; the connection's own abort is not an error of the load. */
function discard(body: { on(event: 'error', listener: () => void): unknown; destroy(): unknown }): void {
  body.on('error', () => {})
  body.destroy()
}
