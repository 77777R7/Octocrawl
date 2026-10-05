import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import type { MapLink, MapRecord, MapResponse } from '@w2l/contracts'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngineOptions } from '../src/engine.js'

/**
 * POST /v1/map end to end against a loopback site: robots.txt names a sitemap
 * index (a gzip child, a news child) and disallows a path; the start page has
 * a title, a description and anchors. One page body is requested, the rest is
 * robots.txt and sitemaps.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const urlset = (entries: string) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${entries}</urlset>`
const index = (locs: string[]) => `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((loc) => `<sitemap><loc>${loc}</loc></sitemap>`).join('')}</sitemapindex>`

describe('POST /v1/map', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function setup(options: { stall?: boolean; engine?: Partial<ApiEngineOptions> } = {}) {
    const requests: string[] = []
    const stalled: ServerResponse[] = []
    const server = createServer((req, res) => {
      const path = req.url ?? '/'
      requests.push(path)
      if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end(`User-agent: *\nDisallow: /docs/private\nSitemap: ${origin}/sitemap-index.xml\n`); return }
      if (path === '/sitemap-index.xml') { res.writeHead(200, { 'content-type': 'application/xml' }).end(index([...(options.stall ? [`${origin}/stall.xml`] : []), `${origin}/pages.xml.gz`, `${origin}/news.xml`])); return }
      if (path === '/pages.xml.gz') {
        res.writeHead(200, { 'content-type': 'application/gzip' }).end(gzipSync(Buffer.from(urlset(
          `<url><loc>${origin}/docs/</loc><lastmod>2026-10-01</lastmod></url><url><loc>${origin}/docs/guide</loc><lastmod>2026-09-30T08:00:00Z</lastmod></url>` +
          `<url><loc>${origin}/docs/private/x</loc></url><url><loc>${origin}/docs/only-sitemap</loc><lastmod>2026-09-01</lastmod></url><url><loc>${origin}/outside</loc></url>`))))
        return
      }
      if (path === '/news.xml') { res.writeHead(200, { 'content-type': 'application/xml' }).end(urlset(`<url><loc>${origin}/docs/news-1</loc><news:news><news:title>Harbour &amp; tide news</news:title></news:news></url>`)); return }
      if (path === '/stall.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); res.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'); stalled.push(res); return }
      if (path === '/docs/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Fixture docs</title><meta name="description" content="Docs for the fixture harbour"></head><body>
<nav><a href="/docs/index.html">Home</a> <a href="guide">Kiln <b>guide</b></a> <a href="tables" aria-label="Glaze tables"><svg></svg></a> <a href="/docs/private/y">Secret</a> <a href="https://other.test/">Other</a> <a href="/elsewhere">Elsewhere</a></nav>
<main><article><h1>Fixture docs</h1><p>${PROSE}</p></article></main></body></html>`)
        return
      }
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>404</h1>')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-map-'))
    const engine = createApiEngine({ taskRoot, perHostMinDelayMs: 1, ...options.engine })
    cleanup.push(async () => {
      for (const res of stalled) res.destroy()
      await engine.close({ cancelActive: true })
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(taskRoot, { recursive: true, force: true })
    })
    const app = createApp(engine)
    const post = async (body: unknown) => {
      const res = await app.request('/v1/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    }
    return { origin, app, engine, post, requests }
  }

  it('with ignoreRobotsTxt returns the URLs robots.txt disallows, each with its verdict; a server that obeys robots.txt refuses the option by name', async () => {
    const { origin, post, requests } = await setup()
    const { status, body: map } = await post({ url: `${origin}/docs/`, ignoreRobotsTxt: true })
    expect(status).toBe(200)
    const robots = new Map((map.links as MapLink[]).map((link) => [link.url, link.robots]))
    expect(robots.get(`${origin}/docs/private/y`)).toBe('disallowed')
    expect(robots.get(`${origin}/docs/private/x`)).toBe('disallowed')
    expect(robots.get(`${origin}/docs/guide`)).toBe('allowed')
    expect(map.refused.robots).toBe(0)
    // Still one page body, and robots.txt still read once: the verdicts are on the record, not skipped.
    expect(requests.filter((path) => !path.endsWith('.xml') && !path.endsWith('.xml.gz') && path !== '/robots.txt')).toEqual(['/docs/'])
    expect(requests.filter((path) => path === '/robots.txt')).toHaveLength(1)
    const obeying = await setup({ engine: { allowRobotsOverride: false } })
    const refused = await obeying.post({ url: `${obeying.origin}/docs/`, ignoreRobotsTxt: true })
    expect(refused).toMatchObject({ status: 400, body: { code: 'unsupported_parameter', details: { parameters: ['ignoreRobotsTxt'] } } })
    expect(obeying.requests).toEqual([])
  })

  it('returns the start URL, its page links and the sitemap entries with their evidence, reads one page body and keeps the record', async () => {
    const { origin, app, post, requests } = await setup()
    const { status, body } = await post({ url: `${origin}/docs/`, origin: 'test-suite' })
    expect(status).toBe(200)
    const map = body as MapResponse
    const pages = `${origin}/pages.xml.gz`
    expect(map.links).toEqual([
      { url: `${origin}/docs/`, title: 'Fixture docs', description: 'Docs for the fixture harbour', titleSource: 'page', via: ['start', 'sitemap'], sitemapFile: pages, lastmod: '2026-10-01', robots: 'allowed' },
      { url: `${origin}/docs/guide`, title: 'Kiln guide', titleSource: 'anchor', via: ['link', 'sitemap'], sitemapFile: pages, lastmod: '2026-09-30T08:00:00Z', robots: 'allowed' },
      { url: `${origin}/docs/tables`, title: 'Glaze tables', titleSource: 'anchor', via: ['link'], robots: 'allowed' },
      { url: `${origin}/docs/only-sitemap`, via: ['sitemap'], sitemapFile: pages, lastmod: '2026-09-01', robots: 'allowed' },
      { url: `${origin}/docs/news-1`, title: 'Harbour & tide news', titleSource: 'sitemap', via: ['sitemap'], sitemapFile: `${origin}/news.xml`, robots: 'allowed' },
    ])
    expect(map).toMatchObject({ url: `${origin}/docs/`, status: 'completed', stoppedBy: null, warnings: [], identity: { mode: 'standard' } })
    expect(map).not.toHaveProperty('agentHints')
    expect(map.refused).toMatchObject({ robots: 2, hostDenied: 1, subtreeDenied: 2, collapsed: 1, samples: { robots: [`${origin}/docs/private/y`, `${origin}/docs/private/x`], hostDenied: ['https://other.test/'] } })
    expect(map.sources.startPage).toMatchObject({ httpStatus: 200, status: 'success', lane: 'http', robots: 'allowed', linksFound: 6, title: 'Fixture docs', rawBodySha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(map.sources.sitemap).toMatchObject({ mode: 'include', sources: ['robots'], listed: 6, accepted: 2, truncated: null, error: null })
    expect(map.sources.sitemap!.files.map((file) => [file.url.replace(origin, ''), file.kind, file.entries, file.robots])).toEqual([['/sitemap-index.xml', 'index', 2, 'allowed'], ['/pages.xml.gz', 'urlset', 5, 'allowed'], ['/news.xml', 'urlset', 1, 'allowed']])
    // Exactly one page body was requested: the start URL. The rest is robots.txt, once, and the sitemaps.
    expect(requests.filter((path) => !path.endsWith('.xml') && !path.endsWith('.xml.gz') && path !== '/robots.txt')).toEqual(['/docs/'])
    expect(requests.filter((path) => path === '/robots.txt')).toHaveLength(1)
    const record = await app.request(`/v1/maps/${map.id}`)
    expect(record.status).toBe(200)
    const stored = await record.json() as MapRecord
    expect(stored).toEqual({ requestedAt: expect.any(String), request: { url: `${origin}/docs/`, origin: 'test-suite' }, response: map })
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const missing = await app.request(`/v1/maps/${id}`)
      expect(missing.status).toBe(404)
      expect(await missing.json()).toEqual({ error: 'not found', code: 'not_found' })
    }
  })

  it('answers at its timeout with what it found, partial, with the warning and a hint', async () => {
    const { origin, post } = await setup({ stall: true })
    const began = Date.now()
    const { status, body } = await post({ url: `${origin}/docs/`, timeout: 1_500 })
    expect(Date.now() - began).toBeLessThan(2_500)
    expect(status).toBe(200)
    const map = body as MapResponse
    expect(map).toMatchObject({ status: 'partial', stoppedBy: 'timeout' })
    expect(map.links.map((link) => link.url.replace(origin, ''))).toEqual(['/docs/', '/docs/guide', '/docs/tables'])
    expect(map.sources.sitemap).toMatchObject({ truncated: 'time' })
    expect(map.sources.sitemap!.files.map((file) => [file.url.replace(origin, ''), file.kind, file.error])).toEqual([['/sitemap-index.xml', 'index', null], ['/stall.xml', 'unreadable', 'timeout']])
    expect(map.warnings.find((warning) => warning.code === 'map_timeout')?.message).toMatch(/^the map stopped at its 1500 ms timeout after \d+ ms with 3 links; 2 sitemap files were not read$/)
    expect(map.agentHints).toEqual(["the map's deadline cut it before every source was read; raise timeout (up to 300000 ms on this server) or lower limit for a complete list"])
  })

  it('refuses what the server does not take before anything is fetched, and counts maps in the rate limit', async () => {
    const { origin, post, requests, engine } = await setup()
    const hostedRoot = await mkdtemp(join(tmpdir(), 'w2l-map-hosted-'))
    const hosted = createApiEngine({ taskRoot: hostedRoot, hosted: true })
    cleanup.push(async () => { await hosted.close(); await rm(hostedRoot, { recursive: true, force: true }) })
    const hostedApp = createApp(hosted)
    const hostedPost = async (body: unknown) => {
      const res = await hostedApp.request('/v1/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    }
    const url = `${origin}/docs/`
    expect(await hostedPost({ url, limit: 5_001 })).toEqual({ status: 400, body: { error: 'limit must be at most 5000 on this server', code: 'invalid_request' } })
    expect(await hostedPost({ url, timeout: 60_001 })).toEqual({ status: 400, body: { error: 'timeout must be at most 60000 on this server', code: 'invalid_request' } })
    expect(await post({ url, limit: 0 })).toEqual({ status: 400, body: { error: 'limit must be an integer from 1 to 100000', code: 'invalid_request' } })
    expect(await post({ url, mode: 'authed' })).toMatchObject({ status: 400, body: { error: 'mode authed is not available for map: a map reads public sitemaps and one public page' } })
    expect((await post({ url, useIndex: true })).body).toMatchObject({ code: 'unsupported_parameter', agentHints: ['Octocrawl keeps no URL index: a map reads the sitemaps the site declares and its start page, on the record; crawl reads further pages'] })
    expect(requests).toEqual([])
    // The local engine takes the largest limit.
    expect((await post({ url, limit: 100_000 })).body).toMatchObject({ status: 'completed', stoppedBy: null })
    // A browser-only URL is refused by the operator's channel policy.
    const policyRoot = await mkdtemp(join(tmpdir(), 'w2l-map-policy-'))
    const browserOnly = createApiEngine({ taskRoot: policyRoot, channelPolicy: () => 'browser_only' })
    cleanup.push(async () => { await browserOnly.close(); await rm(policyRoot, { recursive: true, force: true }) })
    expect(await (await createApp(browserOnly).request('/v1/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })).json()).toEqual({ error: 'map is not available for this URL: this server reads it with the browser lane only', code: 'invalid_request' })
    // A map is work the rate limit counts.
    const limited = createApp(engine, { rateLimit: { perMinute: 1 } })
    const send = () => limited.request('/v1/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, limit: 0 }) })
    expect((await send()).status).toBe(400)
    const second = await send()
    expect(second.status).toBe(429)
    expect(await second.json()).toMatchObject({ code: 'rate_limited' })
  })

  it('passes the sitemap mode, search and scope options to the map: only reads no page (and is offered for a browser-only URL), skip requests no sitemap', async () => {
    const { origin, post, requests } = await setup({ engine: { channelPolicy: (url) => (new URL(url).pathname === '/docs/' ? 'browser_only' : 'ladder') } })
    const url = `${origin}/docs/`
    const only = (await post({ url, sitemap: 'only', search: 'news' })).body as MapResponse
    expect(only.links.map((link) => [link.url.replace(origin, ''), link.title])).toEqual([['/docs/news-1', 'Harbour & tide news']])
    expect(only).toMatchObject({ status: 'completed', sources: { startPage: null, sitemap: { mode: 'only' } } })
    // /docs/, guide, private/x and only-sitemap are in scope and do not match; /outside is not in scope.
    expect(only.refused).toMatchObject({ searchFiltered: 4, subtreeDenied: 1, robots: 0 })
    expect(requests.filter((path) => path.startsWith('/docs'))).toEqual([])
    // Reading the page is refused for that URL, before anything is fetched.
    expect(await post({ url, sitemap: 'skip' })).toMatchObject({ status: 400, body: { error: 'map is not available for this URL: this server reads it with the browser lane only' } })

    const plain = await setup()
    const skip = (await plain.post({ url: `${plain.origin}/docs/`, sitemap: 'skip', includePaths: ['^/docs/(guide|tables)$'] })).body as MapResponse
    expect(skip.links.map((link) => link.url.replace(plain.origin, ''))).toEqual(['/docs/', '/docs/guide', '/docs/tables'])
    expect(skip.sources.sitemap).toBeNull()
    expect(plain.requests.filter((path) => path.includes('sitemap') || path.endsWith('.xml') || path.endsWith('.gz'))).toEqual([])
  })
})

