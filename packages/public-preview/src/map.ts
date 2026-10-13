import { buildChannels, HttpSitemapSource, LadderRunner, OriginScheduler, prepareHttpIdentity, RobotsOriginCache } from '@w2l/bench'
import { isOctocrawlRobotsGroup, type MapResponse, type MapSources } from '@w2l/contracts'
import { collectLinkDetails } from '@w2l/extract-tf'
import { MapRunner } from '@w2l/runtime'
import { previewNetworkPolicy } from './preview.js'

/** The Link Extractor's whole-site read (/api/map): a site's URLs from its robots.txt sitemaps (else /sitemap.xml) and
 * its start page's links, as the hosted `map` finds them, with the preview's own rules. The start page is read over
 * HTTP only, under the preview's identity (OctoCrawl-Preview/1.0, as are robots.txt and every sitemap file), on the
 * preview's network policy (hosted SSRF rules, 3 redirects, 2 MiB). robots.txt is obeyed. Nothing is stored. */

/** URLs one free map returns at most; hosted `map` returns up to 5,000. */
export const PREVIEW_MAP_LIMIT = 500
/** Sitemap files one free map reads at most (the hosted default is 50). */
export const PREVIEW_MAP_SITEMAP_FILES = 50

/** The result a page shows: the map's own response, its identity included, without the id no record is kept under. */
export type PreviewMap = Omit<MapResponse, 'id' | 'agentHints'>

export type PreviewMapper = (url: string, signal: AbortSignal, deadlineAt: number) => Promise<PreviewMap>

const quality = new Set(['quality_low_yield', 'quality_client_rendered'])

export async function mapPreview(url: string, signal: AbortSignal, deadlineAt: number): Promise<PreviewMap> {
  const policy = previewNetworkPolicy()
  const scheduler = new OriginScheduler(policy)
  const robots = new RobotsOriginCache(policy)
  const channels = buildChannels('standard', { networkPolicy: policy, originScheduler: scheduler, previewProductToken: true, robotsCache: robots, keys: {} })
    .filter((channel) => channel.id === 'http')
  const runner = new LadderRunner(channels, { mode: 'standard' })
  const sitemap = new HttpSitemapSource({ mode: 'standard', networkPolicy: policy, scheduler, robots, previewProductToken: true })
  const userAgentFor = (target: string): string => prepareHttpIdentity('standard', policy.contact ?? null, new URL(target).hostname, 'desktop', undefined, true).identity.userAgent
  const lookups = new Map<string, ReturnType<RobotsOriginCache['lookup']>>()
  const sources: MapSources = {
    async readStartPage(start, scope) {
      const run = await runner.run(start, null, scope, { includeRawHtml: true })
      const result = run.result
      const links = typeof result.rawHtml === 'string' ? collectLinkDetails(result.rawHtml, result.evidence.finalUrl || start) : []
      const clientRendered = result.warnings?.some((warning) => warning.code === 'client_rendered_suspected') === true
        || result.escalations.some((hop) => hop.improved === null) || result.trace.some((event) => quality.has(event.event))
      return { result, links, clientRendered }
    },
    sitemap,
    async robotsVerdict(target, scope) {
      const userAgent = userAgentFor(target)
      const origin = new URL(target).origin
      let lookup = lookups.get(origin)
      if (lookup === undefined) {
        lookup = robots.lookup(target, userAgent, scope)
        lookup.catch(() => {})
        lookups.set(origin, lookup)
      }
      const decision = robots.decision(await lookup, target, userAgent)
      return decision.decision === 'disallowed'
        ? { disallowed: true, ...(decision.unreachable === undefined ? {} : { unreachable: decision.unreachable }), ...(isOctocrawlRobotsGroup(decision.matchedUserAgentGroup) ? { octocrawl: true as const } : {}) }
        : decision.decision
    },
    identity: { mode: 'standard', userAgent: userAgentFor(url) },
  }
  try {
    const { id: _id, agentHints: _hints, ...map } = await new MapRunner(sources).run({
      id: 'preview',
      url,
      limit: PREVIEW_MAP_LIMIT,
      timeoutMs: Math.max(1_000, deadlineAt - Date.now() - 1_500),
      maxSitemapFiles: PREVIEW_MAP_SITEMAP_FILES,
    }, { signal })
    return map
  } finally {
    // The http lane's connections, the sitemap reader's and the robots cache's, closed with the run.
    await Promise.allSettled([...channels.map((channel) => channel.close?.()), sitemap.close()])
    await robots.teardown()
  }
}
