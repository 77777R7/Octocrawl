import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from 'node:zlib'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { decodeContentEncoding, DecompressedTooLargeError, UnsupportedContentEncodingError } from '../src/contentEncoding.js'
import { FileStore } from '../src/fileStore.js'
import { HttpSitemapSource } from '../src/sitemapSource.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * A server may answer with a Content-Encoding W2L never asked for (www.python.org
 * sends gzip to a request without Accept-Encoding). The http lane decodes gzip,
 * deflate and br by the header, under the decompressed-size cap, and says on the
 * evidence what it decoded; any other coding is a named failure, never bytes
 * read as if they were the page.
 */
const PAGE = `<!doctype html><html><head><title>Welcome to Python.org</title></head><body><main><h1>Python is a programming language</h1><p>${'Python lets you work quickly and integrate systems more effectively. '.repeat(20)}</p><a href="/downloads/">Downloads</a> <a href="/doc/">Documentation</a></main></body></html>`
const CSV = 'year,pue\n2023,1.35\n2024,1.32\n'
// Long enough that br compresses it: a short body can come out as a stored block with its text intact.
const SITEMAP_PATHS = Array.from({ length: 40 }, (_, i) => `/news/2026/10/article-${i}`)
const SITEMAP = (origin: string) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${SITEMAP_PATHS.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

const BODIES: Record<string, { status?: number; type: string; encoding?: string; location?: string; body: (origin: string) => Buffer }> = {
  '/gzip': { type: 'text/html; charset=utf-8', encoding: 'gzip', body: () => gzipSync(PAGE) },
  '/x-gzip': { type: 'text/html; charset=utf-8', encoding: 'X-Gzip', body: () => gzipSync(PAGE) },
  '/deflate': { type: 'text/html; charset=utf-8', encoding: 'deflate', body: () => deflateSync(PAGE) },
  '/raw-deflate': { type: 'text/html; charset=utf-8', encoding: 'deflate', body: () => deflateRawSync(PAGE) },
  '/br': { type: 'text/html; charset=utf-8', encoding: 'br', body: () => brotliCompressSync(PAGE) },
  // Applied gzip first, then br: decoded in the reverse order.
  '/gzip-br': { type: 'text/html; charset=utf-8', encoding: 'gzip, br', body: () => brotliCompressSync(gzipSync(PAGE)) },
  '/identity': { type: 'text/html; charset=utf-8', body: () => Buffer.from(PAGE) },
  '/zstd': { type: 'text/html; charset=utf-8', encoding: 'zstd', body: () => Buffer.from(PAGE) },
  '/corrupt': { type: 'text/html; charset=utf-8', encoding: 'gzip', body: () => Buffer.concat([gzipSync(PAGE).subarray(0, 40), Buffer.alloc(40, 0x41)]) },
  '/bomb': { type: 'text/html; charset=utf-8', encoding: 'gzip', body: () => gzipSync(Buffer.alloc(512 * 1024, 0x41)) },
  '/data.csv': { type: 'text/csv; charset=utf-8', encoding: 'gzip', body: () => gzipSync(CSV) },
  '/sitemap.xml': { type: 'application/xml', encoding: 'br', body: origin => brotliCompressSync(SITEMAP(origin)) },
  // A gzip file served with Content-Encoding: gzip arrives as the XML itself.
  '/more.xml.gz': { type: 'application/x-gzip', encoding: 'gzip', body: origin => gzipSync(SITEMAP(`${origin}/more`)) },
  // Answers without content: nothing to decode, whatever the header says.
  '/empty': { type: 'text/html; charset=utf-8', encoding: 'gzip', body: () => Buffer.alloc(0) },
  '/not-modified': { status: 304, type: 'text/html; charset=utf-8', encoding: 'gzip', body: () => Buffer.alloc(0) },
  // A redirect's body is drained, never decoded: neither its coding nor its size is the page's.
  '/moved-empty': { status: 301, type: 'text/html', encoding: 'gzip', location: '/gzip', body: () => Buffer.alloc(0) },
  '/moved-zstd': { status: 301, type: 'text/html', encoding: 'zstd', location: '/gzip', body: () => Buffer.from('moved') },
  '/moved-to-image': { status: 301, type: 'text/html', encoding: 'gzip', location: '/photo.png', body: () => gzipSync('<a href="/photo.png">moved</a>') },
  '/photo.png': { type: 'image/png', body: () => Buffer.from('89504e470d0a1a0a', 'hex') },
  '/missing': { status: 404, type: 'text/html; charset=utf-8', encoding: 'zstd', body: () => Buffer.from('not found') },
}

let server: Server
let origin: string
let root: string
let requests: Array<{ path: string | undefined; headers: IncomingHttpHeaders }> = []
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 1, maxDecompressedBytes: 256 * 1024 }

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push({ path: req.url, headers: req.headers })
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/more.xml.gz\n`); return }
    const entry = BODIES[req.url ?? '']
    if (entry === undefined) { res.writeHead(404).end(); return }
    // Encoded whatever the request asked for, as www.python.org does.
    const body = entry.body(origin)
    res.writeHead(entry.status ?? 200, { 'content-type': entry.type, 'content-length': String(body.length), ...(entry.encoding === undefined ? {} : { 'content-encoding': entry.encoding }), ...(entry.location === undefined ? {} : { location: entry.location }) }).end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'w2l-encoding-'))
})

beforeEach(() => { requests = [] })

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

describe('decodeContentEncoding', () => {
  it('decodes each known coding, treats identity and no header as unencoded, and names an unknown one', async () => {
    for (const [header, bytes] of [['gzip', gzipSync(PAGE)], ['deflate', deflateSync(PAGE)], ['deflate', deflateRawSync(PAGE)], ['br', brotliCompressSync(PAGE)], ['identity', Buffer.from(PAGE)], [null, Buffer.from(PAGE)]] as const) {
      const decoded = await decodeContentEncoding(bytes, header, 1024 * 1024)
      expect(Buffer.from(decoded.bytes).toString(), String(header)).toBe(PAGE)
    }
    expect((await decodeContentEncoding(Buffer.from(PAGE), null, 10)).codings).toEqual([])
    await expect(decodeContentEncoding(Buffer.from(PAGE), 'gzip, zstd', 1024)).rejects.toBeInstanceOf(UnsupportedContentEncodingError)
    await expect(decodeContentEncoding(gzipSync(Buffer.alloc(4096)), 'gzip', 1024)).rejects.toBeInstanceOf(DecompressedTooLargeError)
  })
})

describe('content codings on the HTTP lane', () => {
  let http: ResilientHttpSubject
  beforeAll(() => { http = new ResilientHttpSubject('standard', policy, undefined, undefined, false, new FileStore(join(root, 'files'))) })
  afterAll(async () => { await http.teardown() })

  it('decodes a gzip body it did not ask for, keeps its identity headers, and records the coding and both sizes', async () => {
    const out = await http.fetch(`${origin}/gzip`)
    expect(requests.find(request => request.path === '/gzip')!.headers['accept-encoding']).toBeUndefined()
    expect(out).toMatchObject({ status: 'success', failureReason: null, lane: 'http' })
    expect(out.markdown).toContain('Python is a programming language')
    expect(out.links).toEqual(expect.arrayContaining([`${origin}/downloads/`, `${origin}/doc/`]))
    expect(out.evidence.contentEncoding).toBe('gzip')
    expect(out.evidence.rawBodySha256).toBe(sha(PAGE))
    expect(out.usage.bytesWire).toBe(gzipSync(PAGE).length)
    expect(out.usage.bytesDecompressed).toBe(Buffer.byteLength(PAGE))
  })

  it('decodes deflate (zlib or raw), br, a chain of codings and the x-gzip alias the same way', async () => {
    for (const [path, coding] of [['/x-gzip', 'gzip'], ['/deflate', 'deflate'], ['/raw-deflate', 'deflate'], ['/br', 'br'], ['/gzip-br', 'gzip, br']] as const) {
      const out = await http.fetch(`${origin}${path}`)
      expect(out.status, path).toBe('success')
      expect(out.markdown, path).toContain('Python is a programming language')
      expect(out.evidence.contentEncoding, path).toBe(coding)
      expect(out.evidence.rawBodySha256, path).toBe(sha(PAGE))
    }
  })

  it('records an unencoded body as identity', async () => {
    const out = await http.fetch(`${origin}/identity`)
    expect(out.status).toBe('success')
    expect(out.evidence.contentEncoding).toBe('identity')
    expect(out.usage.bytesWire).toBe(Buffer.byteLength(PAGE))
  })

  it('fails an unknown coding with a named reason, never reading the bytes as the page', async () => {
    const out = await http.fetch(`${origin}/zstd`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'unsupported_content_encoding', markdown: null, escalations: [] })
    expect(out.evidence).toMatchObject({ httpStatus: 200, contentEncoding: 'zstd', rawBodySha256: null })
    expect(out.trace.find(event => event.event === 'unsupported_content_encoding')?.detail).toEqual({ contentEncoding: 'zstd', coding: 'zstd' })
  })

  it('fails a body that does not decode as parse_error, and one over the decompressed cap as decompressed_too_large', async () => {
    const corrupt = await http.fetch(`${origin}/corrupt`)
    expect(corrupt).toMatchObject({ status: 'failed', failureReason: 'parse_error', markdown: null })
    expect(corrupt.evidence.contentEncoding).toBe('gzip')
    expect(corrupt.trace.find(event => event.event === 'content_decoding_failed')?.detail).toMatchObject({ contentEncoding: 'gzip' })
    const bomb = await http.fetch(`${origin}/bomb`)
    expect(bomb).toMatchObject({ status: 'failed', failureReason: 'decompressed_too_large', markdown: null })
    expect(bomb.trace.find(event => event.event === 'decompressed_too_large')?.detail).toEqual({ contentEncoding: 'gzip', maxBytes: 256 * 1024 })
  })

  it('reads an empty body under a coding header as empty, and a 304 as unchanged', async () => {
    const empty = await http.fetch(`${origin}/empty`)
    expect(empty.failureReason).not.toBe('parse_error')
    expect(empty.evidence).toMatchObject({ httpStatus: 200, contentEncoding: 'gzip' })
    expect(empty.usage.bytesWire).toBe(0)
    const unchanged = await http.fetch(`${origin}/not-modified`, undefined, undefined, { etag: '"v1"' })
    expect(unchanged.failureReason).not.toBe('parse_error')
    expect(unchanged.evidence.httpStatus).toBe(304)
  })

  it('follows a redirect whatever its body\'s coding, and records only the final response\'s', async () => {
    for (const path of ['/moved-empty', '/moved-zstd']) {
      const out = await http.fetch(`${origin}${path}`)
      expect(out.status, path).toBe('success')
      expect(out.evidence, path).toMatchObject({ finalUrl: `${origin}/gzip`, contentEncoding: 'gzip' })
    }
    const image = await http.fetch(`${origin}/moved-to-image`)
    expect(image).toMatchObject({ status: 'failed', failureReason: 'unsupported_content_type' })
    expect(image.evidence.finalUrl).toBe(`${origin}/photo.png`)
    expect(image.evidence.contentEncoding).toBeUndefined()
    expect(image.usage.bytesWire).toBe(0)
  })

  it('keeps the status of an error page whose body does not decode', async () => {
    const out = await http.fetch(`${origin}/missing`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'http_error' })
    expect(out.evidence).toMatchObject({ httpStatus: 404, contentEncoding: 'zstd' })
    expect(out.trace.find(event => event.event === 'unsupported_content_encoding')?.detail).toEqual({ contentEncoding: 'zstd', coding: 'zstd' })
  })

  it('saves a gzip-encoded file as its decoded bytes', async () => {
    const out = await http.fetch(`${origin}/data.csv`)
    expect(out).toMatchObject({ status: 'success', markdown: CSV })
    expect(out.file).toMatchObject({ kind: 'csv', sha256: sha(CSV), bytes: Buffer.byteLength(CSV) })
    expect(await readFile(out.file!.path!, 'utf8')).toBe(CSV)
    expect(out.evidence.contentEncoding).toBe('gzip')
    expect(out.usage.bytesWire).toBe(gzipSync(CSV).length)
  })
})

describe('content codings on the sitemap reader', () => {
  it('decodes a br sitemap it did not ask for, and a .gz file whose gzip the coding already undid', async () => {
    const source = new HttpSitemapSource({ networkPolicy: policy })
    try {
      const loaded = await source.load({ seedUrl: `${origin}/`, maxUrls: 100, maxFiles: 5 })
      expect(loaded.files.map(file => [file.url.replace(origin, ''), file.kind, file.entries, file.error])).toEqual([['/sitemap.xml', 'urlset', 40, null], ['/more.xml.gz', 'urlset', 40, null]])
      expect(loaded.urls.map(entry => entry.url)).toEqual([...SITEMAP_PATHS.map(path => `${origin}${path}`), ...SITEMAP_PATHS.map(path => `${origin}/more${path}`)])
    } finally {
      await source.close()
    }
  })
})
