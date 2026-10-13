import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { PREVIEW_PRODUCT_TOKEN } from '@w2l/contracts'
import { createPreviewServer } from '../src/server.js'
import { mapPreview, PREVIEW_MAP_LIMIT, type PreviewMap } from '../src/map.js'
import type { PreviewQuota } from '../src/quota.js'

// /api/map: the Link Extractor's whole-site read, with a preview's origin check, allowance and logging.
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

const found: PreviewMap = {
  url: 'https://docs.example/', status: 'completed', stoppedBy: null,
  links: [
    { url: 'https://docs.example/', via: ['start'], robots: 'allowed', title: 'Docs', titleSource: 'page' },
    { url: 'https://docs.example/guide', via: ['link', 'sitemap'], robots: 'allowed', sitemapFile: 'https://docs.example/sitemap.xml' },
  ],
  sources: { startPage: null, sitemap: null },
  refused: { duplicate: 3, collapsed: 0, hostDenied: 2, subtreeDenied: 0, pathDenied: 0, assetDenied: 0, robots: 1, robotsUnchecked: 0, searchFiltered: 0, overLimit: 0, samples: { collapsed: [], hostDenied: [], robots: [] } },
  identity: { mode: 'standard', userAgent: `Chrome ${PREVIEW_PRODUCT_TOKEN}` },
  warnings: [],
  elapsedMs: 12,
} as unknown as PreviewMap

async function endpoint(quota: PreviewQuota, mapper: (url: string) => Promise<PreviewMap>, logs: unknown[] = []) {
  const server = createPreviewServer({ quota, mapper, staticDir: '/missing-static-test', amazonState: null, log: (entry) => { logs.push(entry) } })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
const post = (base: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/map`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

describe('/api/map', () => {
  it('spends one of the visitor’s runs, returns the map, and logs the host only', async () => {
    let spent = 0
    const asked: string[] = []
    const logs: Array<Record<string, unknown>> = []
    const base = await endpoint({ consume: async () => { spent++; return 'ok' } }, async (url) => { asked.push(url); return found }, logs)
    const response = await post(base, { url: 'https://docs.example/start?x=1' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ status: 'success', requestedUrl: 'https://docs.example/start?x=1', reason: null, map: { links: found.links, refused: { duplicate: 3, hostDenied: 2, robots: 1 } } })
    expect([spent, asked]).toEqual([1, ['https://docs.example/start?x=1']])
    expect(logs).toEqual([expect.objectContaining({ event: 'w2l_map', status: 'success', http: 200, host: 'docs.example', links: 2, stoppedBy: null })])
    expect(JSON.stringify(logs)).not.toContain('/start')
  })

  it('refuses another site, a bad body and a private address before spending anything, and says when the runs are used', async () => {
    let spent = 0
    let maps = 0
    const base = await endpoint({ consume: async () => { spent++; return spent > 1 ? 'visitor_limited' : 'ok' } }, async () => { maps++; return found })
    expect((await post(base, { url: 'https://docs.example/' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post(base, { url: 'https://docs.example/', limit: 10 })).status).toBe(400)
    expect(await (await post(base, { url: 'http://169.254.169.254/latest/' })).json()).toMatchObject({ status: 'blocked' })
    expect([spent, maps]).toEqual([0, 0])
    expect((await post(base, { url: 'https://docs.example/' })).status).toBe(200)
    const used = await post(base, { url: 'https://docs.example/' })
    expect(used.status).toBe(429)
    expect(used.headers.get('retry-after')).not.toBeNull()
    expect(await used.json()).toMatchObject({ status: 'quota_exceeded' })
    expect(maps).toBe(1)
  })

  it('names a site whose robots.txt keeps every page out as blocked', async () => {
    const refused = { ...found, status: 'failed', links: [], refused: { ...found.refused, robots: 4 } } as unknown as PreviewMap
    const base = await endpoint({ consume: async () => 'ok' }, async () => refused)
    expect(await (await post(base, { url: 'https://docs.example/' })).json()).toMatchObject({ status: 'blocked', reason: expect.stringContaining('robots.txt') })
  })
})

describe('mapPreview', () => {
  it('reads nothing on a private address, under the preview’s identity and limit', async () => {
    let requests = 0
    const site = createServer((_req, res) => { requests++; res.end('<a href="/a">a</a>') })
    servers.push(site)
    await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve))
    const map = await mapPreview(`http://127.0.0.1:${(site.address() as AddressInfo).port}/`, new AbortController().signal, Date.now() + 20_000)
    expect(map.status).toBe('failed')
    expect(map.links.filter(link => !link.via.includes('start'))).toEqual([])
    expect(map.identity.userAgent).toContain(PREVIEW_PRODUCT_TOKEN)
    expect(requests).toBe(0)
    expect(PREVIEW_MAP_LIMIT).toBe(500)
  })
})
