import { describe, expect, it } from 'vitest'
import type { ExecutionContext, MapPageLink, MapRobotsVerdict, MapSources, MapStartPageRead, SitemapEntry, SitemapFileRecord, SitemapLoadRequest, SitemapLoadResult } from '@w2l/contracts'
import { MapRunner } from '../src/map.js'

const SITE = 'https://site.test'
const START = `${SITE}/docs/`
const IDENTITY = { mode: 'standard' as const, userAgent: 'W2L-test/1' }
const FILE = `${SITE}/sitemap.xml`

const fileRecord = (url: string, kind: SitemapFileRecord['kind'] = 'urlset', entries: number | null = null, error: string | null = null): SitemapFileRecord => ({
  url, finalUrl: url, status: kind === 'unreadable' ? null : 200, contentType: 'application/xml', bytes: 1, sha256: null, kind, entries, robots: 'allowed', proxyUsed: false, error,
})

/** A sitemap reader with HttpSitemapSource's collection rules: accept judges each entry; past maxUrls the rest of the file is offered and left over. */
function fakeSitemap(entries: readonly Omit<SitemapEntry, 'file'>[], options: { before?: (request: SitemapLoadRequest) => Promise<Partial<SitemapLoadResult> | void> } = {}) {
  const requests: SitemapLoadRequest[] = []
  return {
    requests,
    source: {
      async load(request: SitemapLoadRequest): Promise<SitemapLoadResult> {
        requests.push(request)
        const early = await options.before?.(request)
        if (early) return { identity: IDENTITY, sources: ['robots'], files: [], urls: [], truncated: null, ...early }
        const urls: SitemapEntry[] = []
        let left = 0
        for (const listed of entries) {
          const entry = { ...listed, file: FILE }
          if (urls.length >= request.maxUrls) { if (await request.accept!(entry)) left++; continue }
          if (await request.accept!(entry)) urls.push(entry)
        }
        return { identity: IDENTITY, sources: ['robots'], files: [fileRecord(FILE, 'urlset', entries.length)], urls, truncated: left > 0 ? 'urls' : null }
      },
      async close() {},
    },
  }
}

function startPage(links: readonly MapPageLink[], metadata: { title: string | null; description: string | null } = { title: 'Docs home', description: 'All the docs' }): MapStartPageRead {
  return {
    result: { status: 'success', failureReason: null, metadata: { ...metadata, language: null, keywords: null, robots: null, favicon: null, canonicalUrl: null }, evidence: { finalUrl: START, httpStatus: 200, rawBodySha256: 'abc' } },
    links,
  }
}

function sources(read: MapStartPageRead | ((context: ExecutionContext) => Promise<MapStartPageRead>), sitemap: MapSources['sitemap'], robots: (url: string, context: ExecutionContext) => Promise<MapRobotsVerdict> = async (url) => (url.includes('private') ? { disallowed: true } : 'allowed')) {
  const reads: string[] = []
  const robotsAsked: string[] = []
  const wired: MapSources = {
    async readStartPage(url, context) { reads.push(url); return typeof read === 'function' ? read(context) : read },
    sitemap,
    async robotsVerdict(url, context) { robotsAsked.push(url); return robots(url, context) },
    identity: IDENTITY,
  }
  return { wired, reads, robotsAsked }
}

const link = (path: string, text: string | null = null): MapPageLink => ({ url: path.startsWith('http') ? path : `${SITE}${path}`, text })

describe('MapRunner', () => {
  it('returns the start URL, then the page links in document order, then sitemap-only entries, merging a URL found both ways, with titles only from evidence', async () => {
    const sitemap = fakeSitemap([
      { url: `${SITE}/docs/`, lastmod: '2026-10-01' },
      { url: `${SITE}/docs/a`, title: 'Sitemap A', lastmod: '2026-09-01' },
      { url: `${SITE}/docs/c`, lastmod: '2026-08-01' },
      { url: `${SITE}/docs/d`, title: 'News D' },
      { url: `${SITE}/docs/private/2` },
      { url: `${SITE}/root` },
    ])
    const { wired, reads } = sources(startPage([
      link('/docs/a', 'Alpha'), link('/docs/b'), link('/docs/index.html', 'Home again'), link('/docs/a/', 'Alpha again'), link('/other/x', 'Other'),
      link('https://elsewhere.test/', 'Elsewhere'), link('/docs/logo.png'), link('/docs/private/1', 'Secret'), link('/docs/b', 'Bravo'),
    ]), sitemap.source)
    const map = await new MapRunner(wired).run({ id: 'm1', url: START })
    expect(map.links).toEqual([
      { url: START, title: 'Docs home', description: 'All the docs', titleSource: 'page', via: ['start', 'sitemap'], sitemapFile: FILE, lastmod: '2026-10-01', robots: 'allowed' },
      { url: `${SITE}/docs/a`, title: 'Alpha', titleSource: 'anchor', via: ['link', 'sitemap'], sitemapFile: FILE, lastmod: '2026-09-01', robots: 'allowed' },
      // An anchor without text, then one with text: the first non-empty text wins.
      { url: `${SITE}/docs/b`, title: 'Bravo', titleSource: 'anchor', via: ['link'], robots: 'allowed' },
      { url: `${SITE}/docs/c`, via: ['sitemap'], sitemapFile: FILE, lastmod: '2026-08-01', robots: 'allowed' },
      { url: `${SITE}/docs/d`, title: 'News D', titleSource: 'sitemap', via: ['sitemap'], sitemapFile: FILE, robots: 'allowed' },
    ])
    expect(map.links[3]).not.toHaveProperty('title')
    expect(reads).toEqual([START])
    expect(map.refused).toEqual({
      duplicate: 3, collapsed: 2, hostDenied: 1, subtreeDenied: 2, pathDenied: 0, assetDenied: 1, robots: 2, robotsUnchecked: 0, searchFiltered: 0, overLimit: 0,
      samples: { collapsed: [{ url: `${SITE}/docs/index.html`, into: START }, { url: `${SITE}/docs/a/`, into: `${SITE}/docs/a` }], hostDenied: ['https://elsewhere.test/'], robots: [`${SITE}/docs/private/1`, `${SITE}/docs/private/2`] },
    })
    expect(map).toMatchObject({ id: 'm1', url: START, status: 'completed', stoppedBy: null, identity: IDENTITY, warnings: [] })
    expect(map.sources.startPage).toEqual({ url: START, finalUrl: START, httpStatus: 200, status: 'success', failureReason: null, lane: 'http', robots: 'allowed', rawBodySha256: 'abc', linksFound: 9, title: 'Docs home', description: 'All the docs' })
    expect(map.sources.sitemap).toMatchObject({ mode: 'include', sources: ['robots'], listed: 6, accepted: 2, truncated: null, error: null })
    expect(sitemap.requests[0]).toMatchObject({ seedUrl: START, maxUrls: 5000 - 3, maxFiles: 50 })
  })

  it('does not read a start page robots.txt disallows, and still reads the sitemap under its own verdicts', async () => {
    const sitemap = fakeSitemap([{ url: `${SITE}/docs/open` }])
    const { wired, reads } = sources(startPage([link('/docs/x')]), sitemap.source, async (url) => (url === START ? { disallowed: true } : 'no_robots'))
    const map = await new MapRunner(wired).run({ id: 'm2', url: START })
    expect(reads).toEqual([])
    expect(map.sources.startPage).toMatchObject({ status: 'failed', failureReason: 'policy_denied', robots: 'disallowed', linksFound: 0 })
    expect(map.links).toEqual([{ url: `${SITE}/docs/open`, via: ['sitemap'], sitemapFile: FILE, robots: 'no_robots' }])
    expect(map.refused.robots).toBe(1)
    expect(map.status).toBe('partial')
    expect(map.warnings.map((warning) => warning.code)).toEqual(['start_page_unreadable'])
  })

  it('reports an unreachable robots.txt as unreachable with its reason, never as a rule the publisher wrote', async () => {
    const sitemap = fakeSitemap([{ url: `${SITE}/docs/open` }])
    const { wired, reads } = sources(startPage([]), sitemap.source, async (url) => (url.startsWith(SITE) ? { disallowed: true, unreachable: 'server_error' } : 'allowed'))
    const map = await new MapRunner(wired).run({ id: 'm-unreachable', url: START })
    expect(reads).toEqual([])
    expect(map.sources.startPage).toMatchObject({ status: 'failed', failureReason: 'policy_denied', robots: 'unreachable', robotsUnreachable: 'server_error' })
    expect(map.links).toEqual([])
    expect(map.refused).toMatchObject({ robots: 2, samples: { robots: [START, `${SITE}/docs/open`] } })
    expect(map.status).toBe('failed')
    expect(map.warnings.map((warning) => warning.code)).toEqual(['start_page_unreadable', 'robots_unreachable'])
    const [unreadable, unreachable] = map.warnings
    expect(unreadable!.message).toContain('its robots.txt could not be read (server_error), which counts as a complete disallow')
    expect(unreadable!.message).not.toContain('disallows it')
    expect(unreachable!.message).toContain(`${SITE}/robots.txt (server_error, 2 URLs)`)
    // A rule the publisher wrote keeps its own wording and no robots_unreachable warning.
    const ruled = await new MapRunner(sources(startPage([]), fakeSitemap([]).source, async () => ({ disallowed: true })).wired).run({ id: 'm-ruled', url: START })
    expect(ruled.sources.startPage).toMatchObject({ robots: 'disallowed' })
    expect(ruled.sources.startPage).not.toHaveProperty('robotsUnreachable')
    expect(ruled.warnings.map((warning) => warning.code)).toEqual(['start_page_unreadable'])
    expect(ruled.warnings[0]!.message).toContain('robots.txt disallows it for the map\'s identity')
  })

  it('with ignoreRobotsTxt reads the start page past robots.txt and returns disallowed and unreachable URLs with their verdict', async () => {
    const sitemap = fakeSitemap([{ url: `${SITE}/docs/private/listed` }, { url: `${SITE}/docs/open` }])
    const verdicts = async (url: string): Promise<MapRobotsVerdict> => (url === START || url.includes('private') ? { disallowed: true } : url.includes('down') ? { disallowed: true, unreachable: 'timeout' } : 'allowed')
    const { wired, reads } = sources(startPage([link('/docs/private/a', 'Private A'), link('/docs/down')]), sitemap.source, verdicts)
    const map = await new MapRunner(wired).run({ id: 'm-ignore', url: START, ignoreRobotsTxt: true })
    expect(reads).toEqual([START])
    expect(map.sources.startPage).toMatchObject({ status: 'success', robots: 'disallowed' })
    expect(map.links.map((l) => [l.url, l.robots])).toEqual([
      [START, 'disallowed'],
      [`${SITE}/docs/private/a`, 'disallowed'],
      [`${SITE}/docs/down`, 'unreachable'],
      [`${SITE}/docs/private/listed`, 'disallowed'],
      [`${SITE}/docs/open`, 'allowed'],
    ])
    expect(map.refused.robots).toBe(0)
    expect(map.warnings.map((warning) => warning.code)).toEqual([])
    // A rule robots.txt writes for Octocrawl by name holds under ignoreRobotsTxt: the URL is refused, the start page not read.
    const named = sources(startPage([link('/docs/x')]), fakeSitemap([{ url: `${SITE}/docs/owner-out` }]).source, async (url) => (url === START || url.includes('owner-out') ? { disallowed: true, octocrawl: true } : 'allowed'))
    const targeted = await new MapRunner(named.wired).run({ id: 'm-octocrawl', url: START, ignoreRobotsTxt: true })
    expect(named.reads).toEqual([])
    expect(targeted.sources.startPage).toMatchObject({ status: 'failed', failureReason: 'policy_denied', robots: 'disallowed' })
    expect(targeted.links.map((l) => l.url)).toEqual([])
    expect(targeted.refused.robots).toBe(2)
    // Without it the same site keeps them out, as before.
    const obeying = await new MapRunner(sources(startPage([link('/docs/private/a'), link('/docs/down')]), fakeSitemap([{ url: `${SITE}/docs/open` }]).source, verdicts).wired).run({ id: 'm-obey', url: START })
    expect(obeying.sources.startPage).toMatchObject({ status: 'failed', failureReason: 'policy_denied', robots: 'disallowed' })
    expect(obeying.links.map((l) => l.url)).toEqual([`${SITE}/docs/open`])
  })

  it('stops at limit: exactly limit links, the rest counted over the limit, the sitemap given what is left, robots refusals not counted', async () => {
    const sitemap = fakeSitemap(Array.from({ length: 10 }, (_, i) => ({ url: `${SITE}/docs/s${i}` })))
    const { wired } = sources(startPage([link('/docs/private/p'), link('/docs/1'), link('/docs/2'), link('/docs/3'), link('/docs/4'), link('/docs/5')]), sitemap.source)
    const map = await new MapRunner(wired).run({ id: 'm3', url: START, limit: 3 })
    expect(map.links.map((l) => l.url)).toEqual([START, `${SITE}/docs/1`, `${SITE}/docs/2`])
    expect(map).toMatchObject({ status: 'completed', stoppedBy: 'limit', sources: { sitemap: { truncated: 'urls', files: [], listed: 0 } } })
    // The page links filled limit: no sitemap is read, so overLimit counts only the candidates seen before the map stopped.
    expect(map.refused).toMatchObject({ robots: 1, overLimit: 3 })
    expect(sitemap.requests).toHaveLength(0)
    // A sitemap that would stall past the deadline is not waited for once limit is reached: completed, not partial, no map_timeout.
    const stalled = fakeSitemap([], { before: () => new Promise<void>(() => {}) })
    const quick = await new MapRunner(sources(startPage([link('/docs/1'), link('/docs/2')]), stalled.source).wired).run({ id: 'm3b', url: START, limit: 2, timeoutMs: 1000 })
    expect(quick).toMatchObject({ status: 'completed', stoppedBy: 'limit' })
    expect(quick.warnings.map((w) => w.code)).not.toContain('map_timeout')
    expect(stalled.requests).toHaveLength(0)
    // Room left after the page links: the sitemap fills it and stops.
    const roomy = fakeSitemap(Array.from({ length: 10 }, (_, i) => ({ url: `${SITE}/docs/s${i}` })))
    const filled = await new MapRunner(sources(startPage([link('/docs/1')]), roomy.source).wired).run({ id: 'm4', url: START, limit: 5 })
    expect(roomy.requests[0]!.maxUrls).toBe(3)
    expect(filled.links.map((l) => l.url.replace(SITE, ''))).toEqual(['/docs/', '/docs/1', '/docs/s0', '/docs/s1', '/docs/s2'])
    expect(filled).toMatchObject({ status: 'completed', stoppedBy: 'limit', refused: { overLimit: 7 } })
    // Fewer than limit found: completed, not stopped.
    expect(await new MapRunner(sources(startPage([]), fakeSitemap([]).source).wired).run({ id: 'm5', url: START, limit: 5 })).toMatchObject({ status: 'completed', stoppedBy: null })
  })

  it('answers at its deadline with what it found as partial, or failed when it found nothing, never as complete', async () => {
    // The sitemap load runs to its soft deadline and stops with one file unread.
    const slow = fakeSitemap([], {
      before: async (request) => {
        await request.accept!({ url: `${SITE}/docs/early`, file: FILE })
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, request.softDeadlineAt! - Date.now())))
        return { files: [fileRecord(FILE, 'index', 2), fileRecord(`${SITE}/one.xml`, 'unreadable', null, 'timeout')], urls: [{ url: `${SITE}/docs/early`, file: FILE }], truncated: 'time', unreadFiles: 1 }
      },
    })
    const began = Date.now()
    const cut = await new MapRunner(sources(startPage([link('/docs/1')]), slow.source).wired).run({ id: 'm6', url: START, timeoutMs: 300 })
    expect(Date.now() - began).toBeLessThan(1_000)
    expect(slow.requests[0]!.softDeadlineAt).toBeGreaterThanOrEqual(began + 300)
    expect(cut).toMatchObject({ status: 'partial', stoppedBy: 'timeout' })
    expect(cut.links.map((l) => l.url.replace(SITE, ''))).toEqual(['/docs/', '/docs/1', '/docs/early'])
    expect(cut.warnings.find((warning) => warning.code === 'map_timeout')?.message).toMatch(/^the map stopped at its 300 ms timeout after \d+ ms with 3 links; 1 sitemap files were not read$/)
    // robots.txt of the start host never answers: no link, no page read, the sitemap not started.
    const never = fakeSitemap([{ url: `${SITE}/docs/late` }])
    const hung = sources(startPage([]), never.source, (_url, context) => new Promise((_resolve, reject) => context.signal!.addEventListener('abort', () => reject(context.signal!.reason))))
    const empty = await new MapRunner(hung.wired).run({ id: 'm7', url: START, timeoutMs: 200 })
    expect(empty).toMatchObject({ status: 'failed', stoppedBy: 'timeout', links: [], refused: { robotsUnchecked: 1 } })
    expect(empty.sources.startPage).toMatchObject({ status: 'failed', failureReason: 'timeout', robots: null })
    expect(empty.sources.sitemap).toMatchObject({ truncated: 'time', files: [] })
    expect(hung.reads).toEqual([])
    expect(never.requests).toEqual([])
    expect(empty.warnings.map((warning) => warning.code)).toEqual(['map_timeout', 'start_page_unreadable'])
  })

  it('throws on the caller\'s own cancellation, and reads robots.txt for at most maxRobotsHosts further hosts', async () => {
    const controller = new AbortController()
    const pending = sources((context) => new Promise((_resolve, reject) => context.signal!.addEventListener('abort', () => reject(context.signal!.reason))), fakeSitemap([]).source)
    setTimeout(() => controller.abort(new Error('client left')), 50)
    await expect(new MapRunner(pending.wired).run({ id: 'm8', url: START }, { signal: controller.signal })).rejects.toThrow('client left')

    const { wired, robotsAsked } = sources(startPage([link('https://a.site.test/docs/1'), link('https://b.site.test/docs/2'), link('https://b.site.test/docs/3')]), fakeSitemap([]).source)
    const capped = await new MapRunner(wired).run({ id: 'm9', url: START, includeSubdomains: true, maxRobotsHosts: 1 })
    expect(capped.links.map((l) => l.url)).toEqual([START, 'https://a.site.test/docs/1'])
    expect(capped.refused.robotsUnchecked).toBe(2)
    expect(robotsAsked).toEqual([START, 'https://a.site.test/docs/1'])
    expect(capped.status).toBe('partial')
    expect(capped.warnings.map((warning) => warning.code)).toEqual(['robots_host_cap'])
  })

  it('with sitemap only reads no page and returns the start URL only when a sitemap lists it; with skip asks the sitemap nothing', async () => {
    const unlisted = fakeSitemap([{ url: `${SITE}/docs/a` }, { url: `${SITE}/docs/b`, lastmod: '2026-10-01' }])
    const only = sources(startPage([link('/docs/x')]), unlisted.source)
    const map = await new MapRunner(only.wired).run({ id: 'm-only', url: START, sitemap: 'only' })
    expect(only.reads).toEqual([])
    expect(map.links.map((l) => [l.url, l.via])).toEqual([[`${SITE}/docs/a`, ['sitemap']], [`${SITE}/docs/b`, ['sitemap']]])
    expect(map.sources).toMatchObject({ startPage: null, sitemap: { mode: 'only', listed: 2, accepted: 2 } })
    expect(map).toMatchObject({ status: 'completed', stoppedBy: null })
    const listed = await new MapRunner(sources(startPage([]), fakeSitemap([{ url: `${SITE}/docs/a` }, { url: START }]).source).wired).run({ id: 'm-only-2', url: START, sitemap: 'only' })
    expect(listed.links.map((l) => [l.url.replace(SITE, ''), l.via])).toEqual([['/docs/a', ['sitemap']], ['/docs/', ['sitemap']]])
    // With only, the sitemap is the one source: absent or unreadable, the map found nothing and is failed with sitemap_unreadable.
    for (const kind of ['absent', 'unreadable'] as const) {
      const missing = fakeSitemap([], { before: async () => ({ files: [{ ...fileRecord(FILE, kind, null, kind === 'absent' ? null : 'network_error'), status: kind === 'absent' ? 404 : null }] }) })
      const failed = await new MapRunner(sources(startPage([]), missing.source).wired).run({ id: `m-only-${kind}`, url: START, sitemap: 'only' })
      expect(failed, kind).toMatchObject({ status: 'failed', stoppedBy: null, links: [] })
      expect(failed.warnings.map((warning) => warning.code), kind).toEqual(['sitemap_unreadable'])
    }
    // With include, an absent sitemap is a source definitively absent: completed.
    const absent = fakeSitemap([], { before: async () => ({ files: [{ ...fileRecord(FILE, 'absent'), status: 404 }] }) })
    expect(await new MapRunner(sources(startPage([]), absent.source).wired).run({ id: 'm-include-absent', url: START })).toMatchObject({ status: 'completed', warnings: [] })

    const skipped = fakeSitemap([{ url: `${SITE}/docs/a` }])
    const skip = await new MapRunner(sources(startPage([link('/docs/x', 'X')]), skipped.source).wired).run({ id: 'm-skip', url: START, sitemap: 'skip' })
    expect(skipped.requests).toEqual([])
    expect(skip.links.map((l) => l.url.replace(SITE, ''))).toEqual(['/docs/', '/docs/x'])
    expect(skip.sources.sitemap).toBeNull()
    expect(skip.status).toBe('completed')
  })

  it('filters by search on the decoded URL or the title in hand, every word, any case, in discovery order, before limit', async () => {
    const page = startPage([
      link('/docs/webhooks/setup', 'Setup'), link('/docs/billing', 'Webhook-free billing'), link('/docs/events', 'Listening to WEBHOOKS events'),
      link('/docs/my%20webhooks%20guide'), link('/docs/other', 'Other'), link('/docs/webhooks/testing', 'Testing'),
    ], { title: 'Docs home', description: null })
    const entries = [{ url: `${SITE}/docs/news-9`, title: 'Webhooks retired' }, { url: `${SITE}/docs/webhooks/old` }, { url: `${SITE}/docs/plain` }]
    const all = await new MapRunner(sources(page, fakeSitemap(entries).source).wired).run({ id: 'm-all', url: START })
    const found = await new MapRunner(sources(page, fakeSitemap(entries).source).wired).run({ id: 'm-search', url: START, search: 'WebHooks' })
    const urls = found.links.map((l) => l.url.replace(SITE, ''))
    // The start URL does not match its own URL or title, so it is left out; its page's links are still offered.
    expect(urls).toEqual(['/docs/webhooks/setup', '/docs/events', '/docs/my%20webhooks%20guide', '/docs/webhooks/testing', '/docs/news-9', '/docs/webhooks/old'])
    expect(found.links.find((l) => l.url.endsWith('/docs/events'))).toMatchObject({ title: 'Listening to WEBHOOKS events', titleSource: 'anchor' })
    // A subset of the unfiltered map, in the same order.
    const order = all.links.map((l) => l.url)
    expect(found.links.map((l) => order.indexOf(l.url))).toEqual([...found.links.map((l) => order.indexOf(l.url))].sort((a, b) => a - b))
    expect(found.links.every((l) => order.includes(l.url))).toBe(true)
    expect(found.refused.searchFiltered).toBe(all.links.length - found.links.length)
    expect(found.refused.searchFiltered).toBe(4)
    // Every word must appear, in the URL or the title.
    const both = await new MapRunner(sources(page, fakeSitemap(entries).source).wired).run({ id: 'm-and', url: START, search: 'webhooks testing' })
    expect(both.links.map((l) => l.url.replace(SITE, ''))).toEqual(['/docs/webhooks/testing'])
    // limit counts the matches only; the sitemap load reads past the entries that do not match.
    const limited = fakeSitemap([{ url: `${SITE}/docs/plain-1` }, { url: `${SITE}/docs/webhooks/a` }, { url: `${SITE}/docs/plain-2` }, { url: `${SITE}/docs/webhooks/b` }])
    const capped = await new MapRunner(sources(startPage([link('/docs/webhooks/p')]), limited.source).wired).run({ id: 'm-search-limit', url: START, search: 'webhooks', limit: 2 })
    expect(capped.links.map((l) => l.url.replace(SITE, ''))).toEqual(['/docs/webhooks/p', '/docs/webhooks/a'])
    expect(capped).toMatchObject({ stoppedBy: 'limit', refused: { searchFiltered: 3, overLimit: 1 } })
    expect(limited.requests[0]!.maxUrls).toBe(1)
  })

  it('takes subdomains only with includeSubdomains, always the www twin, the path filters with exclude winning, and the whole host with crawlEntireDomain', async () => {
    const page = startPage([link('https://docs.site.test/docs/1'), link('https://www.site.test/docs/2'), link('/docs/keep/3'), link('/docs/keep/old/4'), link('/other/5')])
    const run = (spec: Record<string, unknown>) => new MapRunner(sources(page, fakeSitemap([]).source).wired).run({ id: 'm-scope', url: START, ...spec })
    const plain = await run({})
    expect(plain.links.map((l) => l.url)).toEqual([START, 'https://www.site.test/docs/2', `${SITE}/docs/keep/3`, `${SITE}/docs/keep/old/4`])
    expect(plain.refused).toMatchObject({ hostDenied: 1, subtreeDenied: 1, samples: { hostDenied: ['https://docs.site.test/docs/1'] } })
    expect((await run({ includeSubdomains: true })).links.map((l) => l.url)).toContain('https://docs.site.test/docs/1')
    const paths = await run({ includePaths: ['^/docs/keep/'], excludePaths: ['/old/'] })
    expect(paths.links.map((l) => l.url)).toEqual([START, `${SITE}/docs/keep/3`])
    expect(paths.refused.pathDenied).toBe(2)
    expect((await run({ crawlEntireDomain: true })).links.map((l) => l.url)).toContain(`${SITE}/other/5`)
  })

  it('reads robots.txt once per host for the start host and 20 others; the 21st host\'s URLs are left out unchecked with the warning', async () => {
    const hosts = Array.from({ length: 21 }, (_, i) => `https://h${i}.site.test`)
    const { wired, robotsAsked } = sources(startPage(hosts.flatMap((host) => [link(`${host}/docs/a`), link(`${host}/docs/b`)])), fakeSitemap([]).source)
    const map = await new MapRunner(wired).run({ id: 'm-hosts', url: START, includeSubdomains: true })
    expect(new Set(robotsAsked.map((url) => new URL(url).origin)).size).toBe(21)
    expect(robotsAsked.some((url) => url.startsWith(hosts[20]!))).toBe(false)
    expect(map.links).toHaveLength(1 + 40)
    expect(map.refused.robotsUnchecked).toBe(2)
    expect(map).toMatchObject({ status: 'partial', stoppedBy: null })
    expect(map.warnings.map((warning) => warning.code)).toEqual(['robots_host_cap'])
  })

  it('keeps the https variant of a link seen first over http, when the https origin\'s robots.txt allows it', async () => {
    const HTTP = 'http://site.test'
    const sitemap = fakeSitemap([{ url: `${SITE}/docs/b` }])
    // robots.txt is per scheme: the https origin locks a path the http one allows.
    const { wired, robotsAsked } = sources(startPage([
      link(`${HTTP}/docs/a`, 'Alpha'), link(`${HTTP}/docs/b`), link(`${HTTP}/docs/locked`), link(`${SITE}/docs/a`), link(`${SITE}/docs/locked`),
    ]), sitemap.source, async (url) => (url.startsWith('https:') && url.includes('locked') ? { disallowed: true } : 'allowed'))
    const map = await new MapRunner(wired).run({ id: 'm-https', url: START })
    expect(map.links).toEqual([
      { url: START, title: 'Docs home', description: 'All the docs', titleSource: 'page', via: ['start'], robots: 'allowed' },
      { url: `${SITE}/docs/a`, title: 'Alpha', titleSource: 'anchor', via: ['link'], robots: 'allowed' },
      // Upgraded by the sitemap's https entry, which it also merges.
      { url: `${SITE}/docs/b`, via: ['link', 'sitemap'], sitemapFile: FILE, robots: 'allowed' },
      // The https origin disallows it: the http link stays, under its own origin's verdict.
      { url: `${HTTP}/docs/locked`, via: ['link'], robots: 'allowed' },
    ])
    expect(map.refused).toMatchObject({ collapsed: 3, robots: 0, samples: { collapsed: [
      { url: `${HTTP}/docs/a`, into: `${SITE}/docs/a` },
      { url: `${SITE}/docs/locked`, into: `${HTTP}/docs/locked` },
      { url: `${HTTP}/docs/b`, into: `${SITE}/docs/b` },
    ], robots: [] } })
    expect(robotsAsked).toEqual(expect.arrayContaining([`${SITE}/docs/a`, `${SITE}/docs/b`, `${SITE}/docs/locked`]))
    expect(map).toMatchObject({ status: 'completed', warnings: [] })
    // A search the http URL matches and the https one does not keeps the http link.
    const searched = await new MapRunner(sources(startPage([link(`${HTTP}/docs/a`), link(`${SITE}/docs/a`)]), fakeSitemap([]).source).wired).run({ id: 'm-https-search', url: START, search: 'http://site.test/docs/a' })
    expect(searched.links.map((l) => l.url)).toEqual([`${HTTP}/docs/a`])
    // Without folding, both variants are links of their own.
    const apart = await new MapRunner(sources(startPage([link(`${HTTP}/docs/a`), link(`${SITE}/docs/a`)]), fakeSitemap([]).source).wired).run({ id: 'm-https-apart', url: START, deduplicateSimilarURLs: false })
    expect(apart.links.map((l) => l.url)).toEqual([START, `${HTTP}/docs/a`, `${SITE}/docs/a`])
  })

  it('switches to https only on an origin whose robots.txt the map read anyway, so a later host keeps its slot under the cap', async () => {
    const HTTP_START = 'http://site.test/docs/'
    const { wired, robotsAsked } = sources(startPage([link('http://site.test/docs/a'), link('https://site.test/docs/a'), link('http://docs.site.test/x')]), fakeSitemap([]).source)
    const map = await new MapRunner(wired).run({ id: 'm-https-slot', url: HTTP_START, includeSubdomains: true, maxRobotsHosts: 1 })
    expect(map.links.map((l) => l.url)).toEqual([HTTP_START, 'http://site.test/docs/a', 'http://docs.site.test/x'])
    expect(robotsAsked.some((url) => url.startsWith('https://'))).toBe(false)
    expect(map).toMatchObject({ status: 'completed', warnings: [], refused: { robotsUnchecked: 0, collapsed: 1, samples: { collapsed: [{ url: 'https://site.test/docs/a', into: 'http://site.test/docs/a' }] } } })
  })

  it('does not spend a robots.txt read past the host cap on an https variant, and keeps the http link without a warning', async () => {
    const { wired, robotsAsked } = sources(startPage([link('http://docs.site.test/docs/x'), link('https://docs.site.test/docs/x')]), fakeSitemap([]).source)
    const map = await new MapRunner(wired).run({ id: 'm-https-cap', url: START, includeSubdomains: true, maxRobotsHosts: 1 })
    expect(map.links.map((l) => l.url)).toEqual([START, 'http://docs.site.test/docs/x'])
    expect(robotsAsked.some((url) => url.startsWith('https://docs.site.test'))).toBe(false)
    expect(map).toMatchObject({ status: 'completed', warnings: [], refused: { robotsUnchecked: 0, collapsed: 1 } })
  })

  it('folds query variants with ignoreQueryParameters and reports each merge; without it they stay apart, tracking parameters dropped either way', async () => {
    const page = startPage([link('/docs/list?page=1'), link('/docs/list?page=2'), link('/docs/list?page=3'), link('/docs/item?utm_source=x'), link('/docs/item?utm_campaign=y')])
    const run = (spec: Record<string, unknown>) => new MapRunner(sources(page, fakeSitemap([]).source).wired).run({ id: 'm-query', url: START, ...spec })
    const folded = await run({ ignoreQueryParameters: true })
    expect(folded.links.map((l) => l.url.replace(SITE, ''))).toEqual(['/docs/', '/docs/list', '/docs/item'])
    expect(folded.refused).toMatchObject({ collapsed: 2, samples: { collapsed: [{ url: `${SITE}/docs/list?page=2`, into: `${SITE}/docs/list` }, { url: `${SITE}/docs/list?page=3`, into: `${SITE}/docs/list` }] } })
    const paths = folded.links.map((l) => { const u = new URL(l.url); return `${u.protocol}//${u.host}${u.pathname}` })
    expect(new Set(paths).size).toBe(paths.length)
    expect(folded.links.every((l) => !l.url.includes('?'))).toBe(true)
    const apart = await run({})
    expect(apart.links.map((l) => l.url.replace(SITE, ''))).toEqual(['/docs/', '/docs/list?page=1', '/docs/list?page=2', '/docs/list?page=3', '/docs/item'])
    expect(apart.refused.duplicate).toBe(1)
  })
})
