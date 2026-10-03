/**
 * Map contract: the URLs of a site, discovered without fetching each page.
 *
 * A map reads robots.txt, at most one page body (the start URL, on the http
 * rung) and the sitemaps the site declares, inside one deadline, and returns
 * what it found as links with the evidence for each: how it was found, the
 * sitemap file that listed it, the robots.txt verdict, and a title only where
 * one was already in hand (the start page's own metadata, an anchor's text, a
 * sitemap's `<news:title>`). Deeper discovery is a crawl. Types only, no I/O:
 * the runtime's MapRunner composes the sources, the API engine wires the real
 * ones.
 */

import type { AgentHints, MapRequest } from './api.js'
import type { CrawlMode } from './compliance.js'
import type { SitemapFileRecord, SitemapMode, SitemapSource, SitemapSourceKind } from './crawl.js'
import type { ExecutionContext } from './execution.js'
import type { Evidence, FetchResult } from './result.js'
import type { FailureReason, ResultStatus } from './status.js'

/** Sitemap files one map reads at most, an index and its children each counting as one (gov.uk's index lists 35 children). A crawl keeps its own 20. */
export const MAP_SITEMAP_MAX_FILES = 50
/** Hosts beside the start host whose robots.txt one map reads at most; URLs on further hosts are refused unchecked. */
export const MAP_MAX_ROBOTS_HOSTS = 20
/** Samples each refused counter keeps at most. */
export const MAP_REFUSED_SAMPLES = 20
/** The longest anchor-text title a map link carries, in characters. */
export const MAP_TITLE_MAX_CHARS = 300

/** How a map link was found: it is the start URL, a link on the start page, or a sitemap entry. */
export type MapLinkVia = 'start' | 'link' | 'sitemap'

export interface MapLink {
  /** The canonical URL: fragment and tracking parameters dropped (the whole query with ignoreQueryParameters). */
  url: string
  /** Present only when a title was in hand: the start page's own, an anchor's text, or a sitemap's `<news:title>`. Never generated, never empty. */
  title?: string
  /** The start page's own meta description; no other link has one. */
  description?: string
  /** Where `title` came from; present exactly when `title` is. */
  titleSource?: 'page' | 'anchor' | 'sitemap'
  via: MapLinkVia[]
  /** The first sitemap file that listed the URL. */
  sitemapFile?: string
  /** The `<lastmod>` the sitemap gave, as written. */
  lastmod?: string
  /** The robots.txt verdict for the URL under the map's declared identity; a disallowed URL is never a link. */
  robots: 'allowed' | 'no_robots'
}

export type MapStatus = 'completed' | 'partial' | 'failed'

/** What the start page read gave, or why it was not read (`failed/policy_denied` when robots.txt disallows the start URL or could not be read). */
export interface MapStartPage {
  url: string
  finalUrl: string | null
  httpStatus: number | null
  status: ResultStatus
  failureReason: FailureReason | null
  lane: 'http'
  /**
   * The start URL's robots.txt verdict; `unreachable` when its robots.txt
   * could not be read (a 5xx, a network error, its lookup's timeout or the
   * egress policy), which counts as a complete disallow but is no rule the
   * publisher wrote; null when it was not read before the deadline.
   */
  robots: 'allowed' | 'no_robots' | 'disallowed' | 'unreachable' | null
  /** Why robots.txt could not be read (`server_error`, `network_error`, `timeout`, ...); present only with robots `unreachable`. */
  robotsUnreachable?: string
  rawBodySha256: string | null
  /** http(s) links the page holds, each once, before scope, robots and limit. */
  linksFound: number
  title: string | null
  description: string | null
}

export interface MapSitemapSource {
  mode: SitemapMode
  sources: SitemapSourceKind[]
  files: SitemapFileRecord[]
  /** Entries the reader offered the map. */
  listed: number
  /** Entries the map returned as new links (a URL already found on the page is merged, not counted). */
  accepted: number
  truncated: 'files' | 'urls' | 'time' | null
  /** Why the load itself failed, when it threw; null otherwise. */
  error: string | null
}

/** Candidates the map did not return, by reason, with samples. */
export interface MapRefused {
  /** The same URL again (merged into the link it repeats when that link was returned). */
  duplicate: number
  /** A variant folded into a URL seen first (`/a/` after `/a`, the www twin, ...), or an http link replaced by its https variant; `samples.collapsed` names both, `into` being the URL returned. */
  collapsed: number
  hostDenied: number
  subtreeDenied: number
  pathDenied: number
  assetDenied: number
  /** Disallowed by robots.txt, or on a host whose robots.txt was unreachable or denied by the egress policy. */
  robots: number
  /** On a host whose robots.txt was not read: past MAP_MAX_ROBOTS_HOSTS, or after the deadline. */
  robotsUnchecked: number
  /** In scope but left out by `search`: not every word is in the URL or the title in hand. Counted before robots.txt and `limit`. */
  searchFiltered: number
  /** Accepted candidates offered after `limit` links were in hand. */
  overLimit: number
  samples: {
    collapsed: Array<{ url: string; into: string }>
    hostDenied: string[]
    robots: string[]
  }
}

export const MAP_WARNING_CODES = ['map_timeout', 'start_page_unreadable', 'start_page_client_rendered', 'sitemap_unreadable', 'sitemap_files_capped', 'robots_host_cap', 'robots_unreachable', 'map_record_unwritten'] as const
export type MapWarningCode = (typeof MAP_WARNING_CODES)[number]

export interface MapWarning {
  code: MapWarningCode
  message: string
}

export interface MapResponse {
  /** The map run's id: its record key (GET /v1/maps/:id). */
  id: string
  url: string
  /**
   * `completed`: every source asked for was read or is definitively absent,
   * and the deadline did not cut the run (reaching `limit` is completed).
   * `partial`: links came back, but the deadline cut the run or a source
   * failed. `failed`: no links, and a source failed or the deadline fired.
   */
  status: MapStatus
  stoppedBy: 'limit' | 'timeout' | null
  /** The start URL, then the start page's links in document order, then sitemap entries not already present, in listed order. */
  links: MapLink[]
  sources: {
    startPage: MapStartPage | null
    sitemap: MapSitemapSource | null
  }
  refused: MapRefused
  /** The declared identity robots.txt, the start page and the sitemaps were read under. */
  identity: { mode: CrawlMode; userAgent: string }
  warnings: MapWarning[]
  agentHints?: AgentHints
  elapsedMs: number
}

/** One map call as stored under `<taskRoot>/maps/<id>.json` and read back by GET /v1/maps/:id. */
export interface MapRecord {
  requestedAt: string
  /** The request as parsed, `origin` and `integration` included. */
  request: MapRequest
  response: MapResponse
}

/** One link of the start page: its absolute URL (fragment stripped) and the first non-empty text an anchor gave it, or null. */
export interface MapPageLink {
  url: string
  text: string | null
}

/** What the start page read gave a map. */
export interface MapStartPageRead {
  result: Pick<FetchResult, 'status' | 'failureReason' | 'metadata'> & { evidence: Pick<Evidence, 'finalUrl' | 'httpStatus' | 'rawBodySha256'> }
  links: readonly MapPageLink[]
  /** The http lane found the page filled by script, so its links may be incomplete. */
  clientRendered?: boolean
}

/** A robots.txt verdict for one URL under the map's declared identity. */
export type MapRobotsVerdict = 'allowed' | 'no_robots' | { disallowed: true; unreachable?: string }

/** The fetch paths a map uses; the API engine wires the real ones, tests inject fakes. */
export interface MapSources {
  /** The start URL on the http rung alone; never a browser. */
  readStartPage(url: string, context: ExecutionContext): Promise<MapStartPageRead>
  sitemap: SitemapSource
  robotsVerdict(url: string, context: ExecutionContext): Promise<MapRobotsVerdict>
  identity: { mode: CrawlMode; userAgent: string }
}
