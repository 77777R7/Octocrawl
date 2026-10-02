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

  it('stops at limit: exactly limit links, the rest counted over the limit, the sitemap given what is left, robots refusals not counted', async () => {
    const sitemap = fakeSitemap(Array.from({ length: 10 }, (_, i) => ({ url: `${SITE}/docs/s${i}` })))
    const { wired } = sources(startPage([link('/docs/private/p'), link('/docs/1'), link('/docs/2'), link('/docs/3'), link('/docs/4'), link('/docs/5')]), sitemap.source)
    const map = await new MapRunner(wired).run({ id: 'm3', url: START, limit: 3 })
    expect(map.links.map((l) => l.url)).toEqual([START, `${SITE}/docs/1`, `${SITE}/docs/2`])
    expect(map).toMatchObject({ status: 'completed', stoppedBy: 'limit' })
    expect(map.refused).toMatchObject({ robots: 1, overLimit: 3 + 10 })
    expect(sitemap.requests[0]!.maxUrls).toBe(0)
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
})
