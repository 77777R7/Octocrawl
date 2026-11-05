/**
 * Scrapes of one host by one caller in the last ten minutes, counted so that the third one and each one after it carry
 * an agentHint naming batch_scrape, crawl and map (docs/launch/2026-11-05-batch-concurrency-plan.md D13). On 2026-11-04
 * a list of 272 known URLs was read with one scrape call per page while the tools that read them as one job were listed,
 * and nothing in a scrape's answer pointed at them. The scrape itself is not changed: the MCP server appends the hint
 * (server.ts), since it knows the caller and the tools it lists.
 *
 * A caller is the local server's one client (`local`), or on hosted Octocrawl a key or a keyless address (hostedApi.ts).
 * Memory is bounded: at most REPEATED_SCRAPES_LIMITS.callers callers and .hosts hosts each, the least recently seen
 * forgotten first; a forgotten host counts from one again.
 */
export const REPEATED_SCRAPES_WINDOW_MS = 10 * 60_000
/** The scrape of a host within the window from which the hint is added. */
export const REPEATED_SCRAPES_FROM = 3
export const REPEATED_SCRAPES_LIMITS = { callers: 10_000, hosts: 1_000 } as const

export class RepeatedScrapes {
  private readonly callers = new Map<string, Map<string, number[]>>()
  constructor(private readonly now: () => number = Date.now) {}

  /** Counts one scrape of `url` by `caller` and answers the scrapes of its host in the window, this one included; 0 for no http(s) URL. */
  note(caller: string, url: unknown): number {
    const host = hostOf(url)
    if (host === null) return 0
    const at = this.now()
    const hosts = this.callers.get(caller) ?? new Map<string, number[]>()
    // Re-inserted so that each map runs from the least recently seen to the latest, the order eviction takes.
    this.callers.delete(caller)
    this.callers.set(caller, hosts)
    forgetOldest(this.callers, REPEATED_SCRAPES_LIMITS.callers)
    const kept = (hosts.get(host) ?? []).filter((t) => at - t < REPEATED_SCRAPES_WINDOW_MS)
    kept.push(at)
    hosts.delete(host)
    hosts.set(host, kept)
    forgetOldest(hosts, REPEATED_SCRAPES_LIMITS.hosts)
    return kept.length
  }
}

/**
 * The hint for `count` scrapes of `host` in the window, from the third; null before it. `jobs` says whether this
 * deployment lists batch_scrape to the caller; where it does not, `local` says whether this is a server on the person's
 * computer started without the batch toolset (the flag lists it) or hosted Octocrawl to a caller without an account.
 */
export function repeatedScrapesHint(count: number, host: string, jobs: boolean, local = false): string | null {
  if (count < REPEATED_SCRAPES_FROM) return null
  const seen = `${count} scrapes of ${host} in the last 10 minutes`
  if (jobs) return `${seen}: a known list of URLs runs as one batch_scrape (then wait_batch and get_batch_items), a section of a site as one crawl, and map lists a site's URLs without reading each page`
  if (local) return `${seen}: this server was started without the batch and crawl toolsets; started with --toolsets=all (or batch,crawl beside core), a known list of URLs runs as one batch_scrape and a section of a site as one crawl`
  return `${seen}: with an account's connection a known list of URLs runs as one batch_scrape job (then wait_batch and get_batch_items); or run Octocrawl on your computer (npx octocrawl serve) for batch_scrape and crawl`
}

/** A URL's host as a site is counted: lower-cased, one leading `www.` removed (www and the apex are one site, as map and crawl count them); null for no http(s) URL. */
export function hostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase()
  return host.startsWith('www.') && host.length > 4 ? host.slice(4) : host
}

/** The most hints a scrape's answer carries (the API's own cap, packages/api/src/hints.ts, and docs/scrape-options.md): a page that already has them keeps its own. */
const MAX_AGENT_HINTS = 5

/** A scrape's result with the hint for `count` scrapes of its URL's host appended to its agentHints; the result as it was when there is none, or when the page's own hints already fill the five. */
export function withRepeatedScrapesHint(result: unknown, url: unknown, count: number, jobs: boolean, local = false): unknown {
  const host = hostOf(url)
  if (host === null || result === null || typeof result !== 'object' || Array.isArray(result)) return result
  const hint = repeatedScrapesHint(count, host, jobs, local)
  if (hint === null) return result
  const existing = (result as { agentHints?: unknown }).agentHints
  const hints = Array.isArray(existing) ? existing : []
  if (hints.length >= MAX_AGENT_HINTS) return result
  return { ...result, agentHints: [...hints, hint] }
}

function forgetOldest(map: Map<string, unknown>, limit: number): void {
  while (map.size > limit) {
    const oldest = map.keys().next().value
    if (oldest === undefined) return
    map.delete(oldest)
  }
}
