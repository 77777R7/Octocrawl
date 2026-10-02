import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { prepareHttpIdentity } from '../src/httpIdentity.js'
import { RobotsOriginCache } from '../src/robotsLookup.js'
import { HttpSitemapSource } from '../src/sitemapSource.js'

const urlset = (locs: string[]) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join('')}</urlset>`
const index = (locs: string[]) => `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((loc) => `<sitemap><loc>${loc}</loc></sitemap>`).join('')}</sitemapindex>`

/** One site: robots.txt names an index whose children are a plain file, a gzip file, a disallowed one, an oversized one, a metadata-address one and a 404. */
let server: Server
let origin: string
let requests: Array<{ path: string; headers: IncomingMessage['headers'] }> = []
/** Body size cap for the test, so the oversized child stays small. */
const policy: NetworkPolicy = { ...localNetworkPolicy(), maxBodyBytes: 4096, perHostMinDelayMs: 0 }

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/'
    requests.push({ path, headers: req.headers })
    if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end(`User-agent: *\nDisallow: /private/\nSitemap: ${origin}/sitemap-index.xml\n`); return }
    if (path === '/sitemap-index.xml') { res.writeHead(200, { 'content-type': 'application/xml' }).end(index([`${origin}/pages.xml`, `${origin}/more.xml.gz`, `${origin}/private/hidden.xml`, `${origin}/huge.xml`, 'http://169.254.169.254/latest/sitemap.xml', `${origin}/gone.xml`, `${origin}/nested.xml`])); return }
    if (path === '/pages.xml') { res.writeHead(200, { 'content-type': 'application/xml' }).end(urlset([`${origin}/`, `${origin}/a`, `${origin}/a`, 'javascript:alert(1)'])); return }
    if (path === '/more.xml.gz') { res.writeHead(200, { 'content-type': 'application/gzip' }).end(gzipSync(Buffer.from(urlset([`${origin}/b`, `${origin}/c`])))); return }
    if (path === '/private/hidden.xml') { res.writeHead(200, { 'content-type': 'application/xml' }).end(urlset([`${origin}/secret`])); return }
    if (path === '/huge.xml') { res.writeHead(200, { 'content-type': 'application/xml', 'content-length': '5000' }).end(urlset(Array.from({ length: 60 }, (_, i) => `${origin}/big/${i}`)).padEnd(5000, ' ')); return }
    if (path === '/nested.xml') { res.writeHead(200, { 'content-type': 'application/xml' }).end(index([`${origin}/deeper.xml`])); return }
    if (path === '/sitemap.xml') { res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><body><h1>Not found</h1></body></html>'); return }
    res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>404</h1>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(() => { requests = [] })

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('HttpSitemapSource', () => {
  it('follows the robots.txt sitemap index one level, inflates gzip, refuses, skips and records each file, and never fetches a disallowed or denied one', async () => {
    const source = new HttpSitemapSource({ networkPolicy: policy })
    try {
      const loaded = await source.load({ seedUrl: `${origin}/`, maxUrls: 50, maxFiles: 20 })
      expect(loaded.identity).toEqual({ mode: 'standard', userAgent: prepareHttpIdentity('standard').identity.userAgent })
      expect(loaded.sources).toEqual(['robots'])
      expect(loaded.files.map((file) => [file.url.replace(origin, ''), file.kind, file.entries, file.robots, file.error])).toEqual([
        ['/sitemap-index.xml', 'index', 7, 'allowed', null],
        // pages.xml lists /a twice: three entries in the file, two in the load.
        ['/pages.xml', 'urlset', 3, 'allowed', null],
        ['/more.xml.gz', 'urlset', 2, 'allowed', null],
        ['/private/hidden.xml', 'refused', null, 'disallowed', null],
        ['/huge.xml', 'unreadable', null, 'allowed', 'body_too_large'],
        // Denied by the egress policy before robots.txt is consulted, so no verdict is claimed for it.
        ['http://169.254.169.254/latest/sitemap.xml', 'unreadable', null, null, 'ssrf_denied'],
        ['/gone.xml', 'absent', null, 'allowed', null],
        ['/nested.xml', 'index', 1, 'allowed', null],
      ])
      const pages = loaded.files[1]!
      expect(pages).toMatchObject({ finalUrl: `${origin}/pages.xml`, status: 200, contentType: 'application/xml', proxyUsed: false, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
      expect(pages.bytes).toBe(Buffer.byteLength(urlset([`${origin}/`, `${origin}/a`, `${origin}/a`, 'javascript:alert(1)'])))
      // The repeated loc and the non-http one are not entries; the gzip child's are; the nested index's child is not followed.
      expect(loaded.urls).toEqual([{ url: `${origin}/`, file: `${origin}/pages.xml` }, { url: `${origin}/a`, file: `${origin}/pages.xml` }, { url: `${origin}/b`, file: `${origin}/more.xml.gz` }, { url: `${origin}/c`, file: `${origin}/more.xml.gz` }])
      expect(loaded.truncated).toBeNull()
      const paths = requests.map((request) => request.path)
      expect(paths.filter((path) => path.startsWith('/private'))).toEqual([])
      expect(paths).not.toContain('/deeper.xml')
      expect(paths.filter((path) => path === '/robots.txt')).toHaveLength(1)
      // Every sitemap request carries the http lane's identity headers and nothing of a caller's.
      const identity = prepareHttpIdentity('standard', null, '127.0.0.1').identityHeaders
      for (const request of requests.filter((r) => r.path !== '/robots.txt')) {
        for (const [name, value] of Object.entries(identity)) expect(request.headers[name], `${request.path} ${name}`).toBe(value)
      }
    } finally {
      await source.close()
    }
  })

  it('stops at maxUrls and maxFiles, guesses /sitemap.xml when robots.txt names none, and shares a robots cache without closing it', async () => {
    const bounded = new HttpSitemapSource({ networkPolicy: policy })
    try {
      const byUrls = await bounded.load({ seedUrl: `${origin}/`, maxUrls: 3, maxFiles: 20 })
      expect(byUrls.urls.map((entry) => entry.url.replace(origin, ''))).toEqual(['/', '/a', '/b'])
      expect(byUrls.truncated).toBe('urls')
      expect(byUrls.files).toHaveLength(3)
      const byFiles = await bounded.load({ seedUrl: `${origin}/`, maxUrls: 50, maxFiles: 2 })
      expect(byFiles.files.map((file) => file.url.replace(origin, ''))).toEqual(['/sitemap-index.xml', '/pages.xml'])
      expect(byFiles.truncated).toBe('files')
    } finally {
      await bounded.close()
    }
    // A host without Sitemap lines: the conventional location is tried once, and an HTML answer is not a sitemap.
    const robots = new RobotsOriginCache(policy)
    const guessing = new HttpSitemapSource({ networkPolicy: policy, robots })
    const plain = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><body><p>home</p></body></html>')
    })
    await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve))
    const plainOrigin = `http://127.0.0.1:${(plain.address() as AddressInfo).port}`
    try {
      const loaded = await guessing.load({ seedUrl: `${plainOrigin}/docs/`, maxUrls: 10, maxFiles: 20 })
      expect(loaded.sources).toEqual(['guess'])
      expect(loaded.files).toEqual([expect.objectContaining({ url: `${plainOrigin}/sitemap.xml`, kind: 'not_sitemap', status: 200, entries: null, robots: 'allowed' })])
      expect(loaded.urls).toEqual([])
      await guessing.close()
      // The shared cache still answers after the source closed.
      expect((await robots.lookup(`${plainOrigin}/x`, 'w2l-test'))?.robots).not.toBeNull()
    } finally {
      await robots.teardown()
      plain.closeAllConnections()
      await new Promise<void>((resolve) => plain.close(() => resolve()))
    }
  })
})
