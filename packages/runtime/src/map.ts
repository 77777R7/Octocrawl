/**
 * A map: the URLs of a site, discovered without fetching each page.
 *
 * Not a second crawler. Every candidate goes through one Frontier built from
 * the request's scope (the start host, its www twin and where the start URL
 * redirected; the start URL's path subtree; assets left out; similar URLs
 * folded), so the scope rules exist once. The map never dequeues: it reads
 * at most one page body, the start URL's, through its MapSources, and the
 * sitemaps the site declares. All of it runs inside one deadline, in this
 * order: the start host's robots.txt, the start page, the sitemap files, and
 * the robots.txt of each further host a candidate is on (at most
 * MAP_MAX_ROBOTS_HOSTS of them). A URL robots.txt disallows for the map's
 * identity, or whose robots.txt could not be read, is not returned, unless
 * the map was started with ignoreRobotsTxt: then it is, with that verdict,
 * and the start page is read past it.
 *
 * Titles are never invented: the start URL's comes from its own page, a
 * page link's from its anchor, a sitemap entry's from its `<news:title>`.
 * When the deadline passes the map answers with what it found, as partial
 * (failed when it found nothing), never as a complete list. The caller's own
 * cancellation throws and answers nothing.
 */

import {
  DEFAULT_MAP_LIMIT,
  DEFAULT_MAP_TIMEOUT_MS,
  MAP_MAX_ROBOTS_HOSTS,
  MAP_REFUSED_SAMPLES,
  MAP_SITEMAP_MAX_FILES,
  type ExecutionContext,
  type MapLink,
  type MapRefused,
  type MapRobotsVerdict,
  type MapResponse,
  type MapSitemapSource,
  type MapSources,
  type MapStartPage,
  type MapWarning,
  type ResultStatus,
  type SitemapEntry,
  type SitemapMode,
} from '@w2l/contracts'
import { createExecutionScope } from '@w2l/http-core'
import { canonicalizeUrl, visitKey } from './canonicalize.js'
import { Frontier, type FrontierEnqueueResult } from './frontier.js'

export interface MapSpec {
  /** The map run's id, the record key. */
  id: string
  url: string
  /** Links returned at most; default DEFAULT_MAP_LIMIT. */
  limit?: number
  /** One deadline for the whole map, from the moment run() starts; default DEFAULT_MAP_TIMEOUT_MS. */
  timeoutMs?: number
  /** How the map uses the site's sitemap; default include. */
  sitemap?: SitemapMode
  /** Admit every host under the start URL's apex (the frontier's allowSubdomains). Default false. */
  includeSubdomains?: boolean
  ignoreQueryParameters?: boolean
  /** Default true, as on a crawl. */
  deduplicateSimilarURLs?: boolean
  crawlEntireDomain?: boolean
  includePaths?: readonly string[]
  excludePaths?: readonly string[]
  regexOnFullURL?: boolean
  /**
   * Keep only candidates in which every whitespace-separated word appears,
   * case-insensitively, in the percent-decoded canonical URL or the title in
   * hand (an anchor's text, a sitemap's `<news:title>`, the start page's own
   * title). It filters before robots.txt and `limit`; the order is kept.
   */
  search?: string
  /** Sitemap files read at most; default MAP_SITEMAP_MAX_FILES. */
  maxSitemapFiles?: number
  /** Hosts beside the start host whose robots.txt is read at most; default MAP_MAX_ROBOTS_HOSTS. */
  maxRobotsHosts?: number
  /** Return the URLs robots.txt keeps out, with their verdict, and read the start page past it (the sources read it with the override). Default false. */
  ignoreRobotsTxt?: boolean
}

/** A start page read that gave the page as content; anything else is a source that failed. */
const READ_STATUSES: ReadonlySet<ResultStatus> = new Set<ResultStatus>(['success', 'empty_verified'])

type Found = { via: 'link'; url: string; text: string | null } | { via: 'sitemap'; entry: SitemapEntry }
/** `unreachable`: robots.txt could not be read (5xx, network error, its lookup's timeout, the egress policy), which counts as a complete disallow but is no rule the publisher wrote. */
type Verdict = 'allowed' | 'no_robots' | 'disallowed' | { unreachable: string } | 'unchecked'

export class MapRunner {
  constructor(private readonly sources: MapSources) {}

  async run(spec: MapSpec, context: ExecutionContext = {}): Promise<MapResponse> {
    const began = Date.now()
    const limit = spec.limit ?? DEFAULT_MAP_LIMIT
    const timeoutMs = spec.timeoutMs ?? DEFAULT_MAP_TIMEOUT_MS
    const deadlineAt = Math.min(began + timeoutMs, context.deadlineAt ?? Infinity)
    const sitemapMode = spec.sitemap ?? 'include'
    const maxRobotsHosts = spec.maxRobotsHosts ?? MAP_MAX_ROBOTS_HOSTS
    const caller = context.signal
    const cancelled = (): boolean => caller?.aborted === true
    const scope = createExecutionScope({ ...(caller === undefined ? {} : { signal: caller }), deadlineAt })
    try {
      const dedupe = spec.deduplicateSimilarURLs !== false
      const frontier = new Frontier({
        seedUrl: spec.url,
        maxDepth: null,
        deduplicateSimilarURLs: dedupe,
        ignoreQueryParameters: spec.ignoreQueryParameters === true,
        allowSubdomains: spec.includeSubdomains === true,
        crawlEntireDomain: spec.crawlEntireDomain === true,
        regexOnFullURL: spec.regexOnFullURL === true,
        ...(spec.includePaths === undefined ? {} : { includePaths: spec.includePaths }),
        ...(spec.excludePaths === undefined ? {} : { excludePaths: spec.excludePaths }),
      })
      // With sitemap only the start URL is not a link of its own: it is returned only when a sitemap lists it, so it is not seeded.
      const startCanonical = sitemapMode === 'only' ? frontier.seedCanonicalUrl : frontier.seed(spec.url).canonicalUrl ?? frontier.seedCanonicalUrl
      const links: MapLink[] = []
      const byKey = new Map<string, MapLink>()
      const keyOf = (canonicalUrl: string): string => visitKey(canonicalUrl, { deduplicateSimilarURLs: dedupe })
      const refused: MapRefused = {
        duplicate: 0, collapsed: 0, hostDenied: 0, subtreeDenied: 0, pathDenied: 0, assetDenied: 0,
        robots: 0, robotsUnchecked: 0, searchFiltered: 0, overLimit: 0,
        samples: { collapsed: [], hostDenied: [], robots: [] },
      }
      const sample = <T>(list: T[], value: T): void => { if (list.length < MAP_REFUSED_SAMPLES) list.push(value) }
      const words = spec.search === undefined ? null : spec.search.toLowerCase().split(/\s+/).filter((word) => word.length > 0)
      /** Whether every search word is in the decoded URL or the title; true without a search. */
      const matches = (canonicalUrl: string, title: string | null | undefined): boolean => {
        if (words === null) return true
        const haystack = `${decodedUrl(canonicalUrl)}\n${title ?? ''}`.toLowerCase()
        return words.every((word) => haystack.includes(word))
      }
      /** Candidates the search left out, by visit key, with their canonical URL: a later repeat whose title matches is taken after all. */
      const searchFiltered = new Map<string, string>()
      const filterOut = (canonicalUrl: string): void => { refused.searchFiltered++; searchFiltered.set(keyOf(canonicalUrl), canonicalUrl) }
      let timedOut = false
      let limitReached = false
      let hostCapped = 0
      const origins = new Set<string>()
      /** Origins whose robots.txt could not be read: the reason, and how many candidates on them were left out. */
      const unreachableOrigins = new Map<string, { reason: string; refused: number }>()

      /** The robots.txt verdict for a candidate: its origin's file is read once, for at most the start host and maxRobotsHosts others. */
      const verdictFor = async (canonicalUrl: string): Promise<Verdict> => {
        const origin = new URL(canonicalUrl).origin
        if (!origins.has(origin)) {
          if (origins.size >= 1 + maxRobotsHosts) { hostCapped++; return 'unchecked' }
          origins.add(origin)
        }
        try {
          const verdict = await this.sources.robotsVerdict(canonicalUrl, scope)
          if (typeof verdict === 'string') return verdict
          return verdict.unreachable === undefined ? 'disallowed' : { unreachable: verdict.unreachable }
        } catch (error) {
          if (cancelled()) throw error
          if (Date.now() >= deadlineAt) { timedOut = true; return 'unchecked' }
          throw error
        }
      }

      const add = (canonicalUrl: string, found: Found, robots: MapLink['robots']): void => {
        const title = found.via === 'link' ? found.text ?? undefined : found.entry.title
        const link: MapLink = {
          url: canonicalUrl,
          ...(title === undefined || title.length === 0 ? {} : { title, titleSource: found.via === 'link' ? 'anchor' : 'sitemap' }),
          via: [found.via],
          ...(found.via === 'sitemap' ? { sitemapFile: found.entry.file } : {}),
          ...(found.via === 'sitemap' && found.entry.lastmod !== undefined ? { lastmod: found.entry.lastmod } : {}),
          robots,
        }
        links.push(link)
        byKey.set(keyOf(canonicalUrl), link)
      }

      /** A repeat of a returned link: what it adds (how it was found, a title the link lacks; the start URL's title is its page's alone). */
      const merge = (link: MapLink, found: Found): void => {
        const start = link.via.includes('start')
        if (found.via === 'link') {
          if (!start && !link.via.includes('link')) link.via.push('link')
          if (!start && link.title === undefined && found.text !== null && found.text.length > 0) Object.assign(link, { title: found.text, titleSource: 'anchor' })
          return
        }
        if (!link.via.includes('sitemap')) {
          link.via.push('sitemap')
          link.sitemapFile = found.entry.file
          if (found.entry.lastmod !== undefined) link.lastmod = found.entry.lastmod
        }
        if (!start && link.title === undefined && found.entry.title !== undefined && found.entry.title.length > 0) Object.assign(link, { title: found.entry.title, titleSource: 'sitemap' })
      }

      /** Returned http links whose https variant was offered too, by the link: the https URL. See preferHttps. */
      const httpsVariants = new Map<MapLink, string>()
      const noteHttpsVariant = (link: MapLink, variant: string): void => {
        if (!link.via.includes('start') && link.url.startsWith('http:') && variant === `https:${link.url.slice('http:'.length)}`) httpsVariants.set(link, variant)
      }
      /**
       * After discovery, each returned http link whose https variant was offered too
       * takes that URL: the same page on the secure scheme, whichever was seen first.
       * robots.txt is per scheme, so the https origin's own verdict must allow it, and
       * only an origin the map read robots.txt for anyway counts: the switch reads no
       * further file, takes no slot of the host cap and cannot time the map out. The
       * start URL stays as given. Collapsed samples are renamed to the URL returned.
       */
      const preferHttps = async (): Promise<void> => {
        const renamed = new Map<string, string>()
        for (const [link, variant] of httpsVariants) {
          // A search read the http URL; the https one must match it too.
          if (!origins.has(new URL(variant).origin) || !matches(variant, link.title) || cancelled() || Date.now() >= deadlineAt) continue
          let verdict: MapRobotsVerdict
          try { verdict = await this.sources.robotsVerdict(variant, scope) } catch (error) { if (cancelled()) throw error; continue }
          if (verdict !== 'allowed' && verdict !== 'no_robots') continue
          renamed.set(link.url, variant)
          link.url = variant
          link.robots = verdict
        }
        for (const entry of refused.samples.collapsed) {
          const into = renamed.get(entry.into)
          if (into === undefined) continue
          // The https variant folded into the http link it now replaces: the http URL is the one folded.
          if (entry.url === into) entry.url = entry.into
          entry.into = into
        }
      }

      /** A URL robots.txt keeps out: disallowed by a rule, or on a host whose robots.txt could not be read, which is counted apart for the warning. */
      const refuseRobots = (canonicalUrl: string, verdict: 'disallowed' | { unreachable: string }): void => {
        refused.robots++
        sample(refused.samples.robots, canonicalUrl)
        if (typeof verdict === 'object') {
          const origin = new URL(canonicalUrl).origin
          const seen = unreachableOrigins.get(origin)
          if (seen === undefined) unreachableOrigins.set(origin, { reason: verdict.unreachable, refused: 1 })
          else seen.refused++
        }
      }

      const ignoreRobots = spec.ignoreRobotsTxt === true
      /** A link's verdict as the response states it. */
      const linkVerdict = (verdict: Exclude<Verdict, 'unchecked'>): MapLink['robots'] => typeof verdict === 'object' ? 'unreachable' : verdict

      const titleOf = (found: Found): string | null | undefined => (found.via === 'link' ? found.text : found.entry.title)

      /** One candidate's verdict, counted; true when it is taken (or would be, past the limit), which a sitemap load reads as its accept. */
      const offer = async (result: FrontierEnqueueResult, found: Found): Promise<boolean> => {
        if (!result.accepted) {
          const url = result.canonicalUrl
          switch (result.reason) {
            case 'duplicate': {
              const key = url === null ? null : keyOf(url)
              const existing = key === null ? undefined : byKey.get(key)
              // A URL the search left out comes again with a title that matches: it is taken now, in this place.
              const filtered = key === null ? undefined : searchFiltered.get(key)
              if (existing === undefined && filtered !== undefined && matches(filtered, titleOf(found))) {
                searchFiltered.delete(key!)
                refused.searchFiltered--
                return admit(filtered, found)
              }
              if (existing !== undefined) merge(existing, found)
              if (result.collapsedInto === undefined) refused.duplicate++
              else {
                refused.collapsed++
                // The variant as it was offered (its query kept), so the sample names what was folded.
                const variant = canonicalizeUrl(found.via === 'link' ? found.url : found.entry.url) ?? url
                if (existing !== undefined && variant !== null) noteHttpsVariant(existing, variant)
                // Folded into the URL the map returns for it (the frontier keeps the first one seen).
                if (variant !== null) sample(refused.samples.collapsed, { url: variant, into: existing?.url ?? result.collapsedInto })
              }
              return false
            }
            case 'host_denied': refused.hostDenied++; if (url !== null) sample(refused.samples.hostDenied, url); return false
            case 'subtree_denied': refused.subtreeDenied++; return false
            case 'path_denied': case 'path_undecided': refused.pathDenied++; return false
            case 'asset_denied': refused.assetDenied++; return false
            default: return false
          }
        }
        const canonicalUrl = result.canonicalUrl!
        if (!matches(canonicalUrl, titleOf(found))) { filterOut(canonicalUrl); return false }
        return admit(canonicalUrl, found)
      }

      /** A candidate in scope that matches the search: its robots.txt verdict, then the limit. */
      const admit = async (canonicalUrl: string, found: Found): Promise<boolean> => {
        const verdict = await verdictFor(canonicalUrl)
        if (verdict === 'unchecked') { refused.robotsUnchecked++; return false }
        if ((verdict === 'disallowed' || typeof verdict === 'object') && !ignoreRobots) { refuseRobots(canonicalUrl, verdict); return false }
        if (links.length >= limit) { refused.overLimit++; limitReached = true; return true }
        add(canonicalUrl, found, linkVerdict(verdict))
        return true
      }

      // 1-2. The start host's robots.txt, then the start page (not with sitemap only).
      let startPage: MapStartPage | null = null
      let clientRendered = false
      if (sitemapMode !== 'only') {
        const startVerdict = await verdictFor(startCanonical)
        const blank = { url: spec.url, finalUrl: null, httpStatus: null, lane: 'http' as const, rawBodySha256: null, linksFound: 0, title: null, description: null }
        if ((startVerdict === 'disallowed' || typeof startVerdict === 'object') && !ignoreRobots) {
          refuseRobots(startCanonical, startVerdict)
          startPage = typeof startVerdict === 'object'
            ? { ...blank, status: 'failed', failureReason: 'policy_denied', robots: 'unreachable', robotsUnreachable: startVerdict.unreachable }
            : { ...blank, status: 'failed', failureReason: 'policy_denied', robots: 'disallowed' }
        } else if (startVerdict === 'unchecked') {
          refused.robotsUnchecked++
          startPage = { ...blank, status: 'failed', failureReason: 'timeout', robots: null }
        } else {
          const startLink: MapLink = { url: startCanonical, via: ['start'], robots: linkVerdict(startVerdict) }
          const startRobots = { robots: linkVerdict(startVerdict), ...(typeof startVerdict === 'object' ? { robotsUnreachable: startVerdict.unreachable } : {}) }
          links.push(startLink)
          byKey.set(keyOf(startCanonical), startLink)
          /** The start URL is kept only when it matches the search, by its URL and its page's own title; its page's links are offered either way. */
          const keepStartIfMatching = (): void => {
            if (matches(startCanonical, startLink.title)) return
            links.splice(links.indexOf(startLink), 1)
            byKey.delete(keyOf(startCanonical))
            filterOut(startCanonical)
          }
          let read: Awaited<ReturnType<MapSources['readStartPage']>> | null = null
          try {
            read = await this.sources.readStartPage(spec.url, scope)
          } catch (error) {
            if (cancelled() || Date.now() < deadlineAt) throw error
            timedOut = true
            startPage = { ...blank, status: 'failed', failureReason: 'timeout', ...startRobots }
            keepStartIfMatching()
          }
          if (read !== null) {
            const { result } = read
            const title = nonEmpty(result.metadata?.title)
            const description = nonEmpty(result.metadata?.description)
            startPage = {
              url: spec.url,
              finalUrl: result.evidence.finalUrl,
              httpStatus: result.evidence.httpStatus,
              status: result.status,
              failureReason: result.failureReason,
              lane: 'http',
              ...startRobots,
              rawBodySha256: result.evidence.rawBodySha256,
              linksFound: read.links.length,
              title: title ?? null,
              description: description ?? null,
            }
            if ((result.status === 'failed' && result.failureReason === 'timeout') || (result.status === 'partial' && Date.now() >= deadlineAt)) timedOut = true
            clientRendered = read.clientRendered === true
            // Only the page's own metadata titles the start URL.
            if (title !== undefined) Object.assign(startLink, { title, ...(description === undefined ? {} : { description }), titleSource: 'page' })
            else if (description !== undefined) startLink.description = description
            keepStartIfMatching()
            if (result.evidence.finalUrl) frontier.followSeedRedirect(result.evidence.finalUrl)
            for (const link of read.links) await offer(frontier.enqueue(link.url, 1, startCanonical), { via: 'link', url: link.url, text: link.text })
          }
        }
      }

      // 3. The sitemaps, with what is left of the limit and the deadline; not started once the deadline has passed.
      let sitemap: MapSitemapSource | null = null
      let sitemapStarted = false
      let unreadFiles: number | undefined
      if (sitemapMode !== 'skip') {
        const record: MapSitemapSource = { mode: sitemapMode, sources: [], files: [], listed: 0, accepted: 0, truncated: null, error: null }
        sitemap = record
        if (timedOut || Date.now() >= deadlineAt) {
          timedOut = true
          record.truncated = 'time'
        } else if (links.length >= limit) {
          // The start page's links already fill limit: the map answers at once and reads no sitemap, rather than
          // downloading a sitemap file only to count its entries over the limit.
          limitReached = true
          record.truncated = 'urls'
        } else {
          sitemapStarted = true
          const before = links.length
          try {
            const loaded = await this.sources.sitemap.load({
              seedUrl: spec.url,
              maxUrls: Math.max(0, limit - links.length),
              maxFiles: spec.maxSitemapFiles ?? MAP_SITEMAP_MAX_FILES,
              softDeadlineAt: deadlineAt,
              accept: (entry) => {
                record.listed++
                return offer(frontier.enqueueFromSitemap(entry.url, 1, entry.file), { via: 'sitemap', entry })
              },
            }, caller === undefined ? {} : { signal: caller })
            record.sources = loaded.sources
            record.files = loaded.files
            record.truncated = loaded.truncated
            unreadFiles = loaded.unreadFiles
            if (loaded.truncated === 'time') timedOut = true
          } catch (error) {
            if (cancelled()) throw error
            record.error = error instanceof Error ? error.message : String(error)
          }
          record.accepted = links.length - before
        }
      }

      await preferHttps()

      // Status: a source that failed or a deadline that cut the run makes it partial, or failed with nothing found.
      const startFailed = startPage !== null && !READ_STATUSES.has(startPage.status)
      const unreadable = sitemap?.files.filter((file) => file.kind === 'unreadable' || file.kind === 'refused') ?? []
      // With sitemap only the sitemaps are the one source: none read (every file absent or not a sitemap) is a source that failed.
      const noneListed = sitemapMode === 'only' && sitemapStarted && sitemap!.error === null && unreadable.length === 0 && !sitemap!.files.some((file) => file.kind === 'urlset' || file.kind === 'index')
      const sitemapFailed = sitemap !== null && (sitemap.error !== null || sitemap.truncated === 'files' || unreadable.length > 0 || noneListed)
      const sourceFailed = startFailed || sitemapFailed || hostCapped > 0
      const elapsedMs = Date.now() - began
      // The limit stopped the map when a candidate was left over, or when the sitemap load stopped with entries or files unread.
      if (sitemap?.truncated === 'urls') limitReached = true
      const status = sourceFailed || timedOut ? (links.length === 0 ? 'failed' : 'partial') : 'completed'
      const warnings: MapWarning[] = []
      if (timedOut) {
        const unread = sitemap === null ? 'no sitemap was asked for' : !sitemapStarted ? 'the sitemaps were not read' : unreadFiles === undefined ? 'how many sitemap files were not read is unknown' : `${unreadFiles} sitemap files were not read`
        warnings.push({ code: 'map_timeout', message: `the map stopped at its ${timeoutMs} ms timeout after ${elapsedMs} ms with ${links.length} links; ${unread}` })
      }
      if (startPage !== null && startFailed) {
        const why = startPage.failureReason !== 'policy_denied' ? ''
          : startPage.robots === 'unreachable' ? `; its robots.txt could not be read (${startPage.robotsUnreachable ?? 'unknown'}), which counts as a complete disallow, so it was not requested`
            : startPage.robots === 'disallowed' ? '; robots.txt disallows it for the map\'s identity, so it was not requested' : ''
        warnings.push({ code: 'start_page_unreadable', message: `the start page was not read as content (${startPage.status}${startPage.failureReason === null ? '' : `/${startPage.failureReason}`}${startPage.httpStatus === null ? '' : `, HTTP ${startPage.httpStatus}`})${why}; its links are not in this map` })
      }
      if (clientRendered) warnings.push({ code: 'start_page_client_rendered', message: 'the start page looks filled by script on the http lane, so the links read from it may be incomplete' })
      if (sitemap?.error != null) warnings.push({ code: 'sitemap_unreadable', message: `the sitemap load failed: ${sitemap.error}` })
      if (unreadable.length > 0) {
        const named = unreadable.slice(0, 3).map((file) => `${file.url} (${file.kind}${file.error === null ? '' : `: ${file.error}`})`).join(', ')
        warnings.push({ code: 'sitemap_unreadable', message: `${unreadable.length} sitemap ${unreadable.length === 1 ? 'file was' : 'files were'} not read: ${named}${unreadable.length > 3 ? ', ...' : ''}; their URLs are not in this map` })
      }
      if (noneListed) {
        const named = sitemap!.files.slice(0, 3).map((file) => `${file.url} (${file.kind}${file.status === null ? '' : `, HTTP ${file.status}`})`).join(', ')
        warnings.push({ code: 'sitemap_unreadable', message: `no sitemap was found${named === '' ? '' : `: ${named}`}; with sitemap only the map lists sitemap entries alone, so it has none` })
      }
      if (sitemap?.truncated === 'files') warnings.push({ code: 'sitemap_files_capped', message: `the map reads at most ${spec.maxSitemapFiles ?? MAP_SITEMAP_MAX_FILES} sitemap files and the site lists more; URLs in the files not read are not in this map` })
      if (unreachableOrigins.size > 0) {
        const named = [...unreachableOrigins].slice(0, 3).map(([origin, seen]) => `${origin}/robots.txt (${seen.reason}, ${seen.refused} ${seen.refused === 1 ? 'URL' : 'URLs'})`).join(', ')
        warnings.push({ code: 'robots_unreachable', message: `robots.txt could not be read for ${unreachableOrigins.size} ${unreachableOrigins.size === 1 ? 'host' : 'hosts'}: ${named}${unreachableOrigins.size > 3 ? ', ...' : ''}; an unreadable robots.txt counts as a complete disallow, so the URLs on those hosts were left out, although no rule was read from it` })
      }
      if (hostCapped > 0) warnings.push({ code: 'robots_host_cap', message: `robots.txt is read for at most ${maxRobotsHosts} hosts beside the start host; ${hostCapped} URLs on further hosts were left out unchecked` })

      return {
        id: spec.id,
        url: spec.url,
        status,
        stoppedBy: limitReached ? 'limit' : timedOut ? 'timeout' : null,
        links,
        sources: { startPage, sitemap },
        refused,
        identity: this.sources.identity,
        warnings,
        elapsedMs,
      }
    } finally {
      scope.dispose()
    }
  }
}

/** The URL percent-decoded for a search to read; one that does not decode is read as it is. */
function decodedUrl(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

