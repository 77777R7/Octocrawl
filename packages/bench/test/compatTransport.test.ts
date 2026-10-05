import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createServer as createTlsServer, type Server as TlsServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identityBundleFrom, identityBundleIssues, localNetworkPolicy, withEnvironmentProxy } from '@w2l/contracts'
import { isTlsError } from '@w2l/http-core'
import { COMPAT_PROFILES, CompatTransport, compatHostListed, compatHostsChoice, compatIdentity, prepareCompatIdentity } from '../src/compatTransport.js'
import { BodyTooLargeError } from '../src/egress.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * The browser-compatible transport (ADR 0005 `compatible_transport`) against a local server: what
 * impit sends, pinned; how its answers reach the http lane; and the lane's record over it.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const ARTICLE = `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p></article></body></html>`
const requests: { url: string; headers: [string, string][] }[] = []
let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const headers: [string, string][] = []
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers.push([req.rawHeaders[i]!.toLowerCase(), req.rawHeaders[i + 1]!])
    requests.push({ url: req.url ?? '', headers })
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private\n'); return }
    if (req.url === '/article' || req.url === '/private') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE); return }
    if (req.url === '/gzip') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' }).end(gzipSync(ARTICLE)); return }
    // Codings impit leaves undecoded: the lane decodes them itself.
    if (req.url === '/xgzip') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'x-gzip' }).end(gzipSync(ARTICLE)); return }
    if (req.url === '/double') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip, gzip' }).end(gzipSync(gzipSync(ARTICLE))); return }
    if (req.url === '/corrupt') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' }).end('this is not a gzip stream at all'); return }
    if (req.url === '/not-modified') { res.writeHead(304, { 'content-encoding': 'gzip', etag: '"v1"' }).end(); return }
    if (req.url === '/big') { res.writeHead(200, { 'content-type': 'text/html', 'content-length': '5000' }).end('x'.repeat(5000)); return }
    if (req.url === '/image') { res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.alloc(2048)); return }
    if (req.url === '/redirect') { res.writeHead(302, { location: '/article' }).end(); return }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const options = { headersTimeoutMs: 5000, bodyTimeoutMs: 5000, capFor: () => 1_000_000 }

describe('the compatible transport', () => {
  it("sends the pinned profile's headers in order, a validator before them, and nothing else", async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    requests.length = 0
    const res = await transport.fetch(`${origin}/article`, { ...options, extraHeaders: { 'if-none-match': '"v1"' } })
    expect(res.status).toBe(200)
    expect(await res.bodyText()).toBe(ARTICLE)
    // An impit upgrade that changes what the profile sends fails here, before a record states the old set.
    expect(requests[0]!.headers.filter(([name]) => name !== 'host')).toEqual([['if-none-match', '"v1"'], ...COMPAT_PROFILES.chrome142.headers])
  })

  it('declares the identity it sends, coherent by the same checks as every identity', () => {
    const prepared = prepareCompatIdentity()
    expect(prepared.identity).toEqual(compatIdentity())
    expect(prepared.sentHeaders.headers).toHaveLength(COMPAT_PROFILES.chrome142.headers.length)
    expect(prepared.sentHeaders.headers).toContainEqual({ name: 'user-agent', value: compatIdentity().userAgent })
    expect(identityBundleIssues(identityBundleFrom(compatIdentity()))).toEqual([])
  })

  it('hides a coding it decoded, says which, and holds the decoded bytes to the cap', async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    const decoded: string[] = []
    const res = await transport.fetch(`${origin}/gzip`, { ...options, onDecoded: (coding) => decoded.push(coding) })
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(decoded).toEqual(['gzip'])
    expect(await res.bodyText()).toBe(ARTICLE)
    // The compressed body is far under 200 bytes; the page it decodes to is not.
    const small = await transport.fetch(`${origin}/gzip`, { ...options, capFor: () => 200 })
    await expect(small.bodyBytes()).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('leaves a coding impit does not decode, and a response without a body, to the lane with their header', async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    const decoded: string[] = []
    for (const [path, coding] of [['/xgzip', 'x-gzip'], ['/double', 'gzip, gzip'], ['/not-modified', 'gzip']] as const) {
      const res = await transport.fetch(`${origin}${path}`, { ...options, onDecoded: (value) => decoded.push(value) })
      expect(res.headers.get('content-encoding')).toBe(coding)
    }
    expect(decoded).toEqual([])
    const corrupt = await transport.fetch(`${origin}/corrupt`, options)
    await expect(corrupt.bodyBytes()).rejects.toMatchObject({ name: 'ContentDecodingError', contentEncoding: 'gzip' })
  })

  it('refuses a declared length over the cap unread, and does not download a type the lane does not read', async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    const big = await transport.fetch(`${origin}/big`, { ...options, capFor: () => 1000 })
    await expect(big.bodyBytes()).rejects.toMatchObject({ name: 'BodyTooLargeError', maxBytes: 1000, declaredBytes: 5000 })
    const image = await transport.fetch(`${origin}/image`, { ...options, capFor: (type) => (type === 'image/png' ? null : 1000) })
    expect((await image.bodyBytes()).byteLength).toBe(0)
  })

  it('hands a redirect to the lane, which follows it itself', async () => {
    const res = await new CompatTransport(localNetworkPolicy()).fetch(`${origin}/redirect`, options)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/article')
  })

  it('reports a refused connection and a certificate that does not verify by the names the resilient loop reads', async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((resolve) => closed.close(() => resolve()))
    await expect(transport.fetch(`http://127.0.0.1:${port}/`, options)).rejects.toMatchObject({ name: 'ConnectError' })

    const dir = mkdtempSync(join(tmpdir(), 'w2l-compat-tls-'))
    let tls: TlsServer | undefined
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' })
      tls = createTlsServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (_req, res) => res.end('ok'))
      await new Promise<void>((resolve) => tls!.listen(0, '127.0.0.1', resolve))
      const url = `https://127.0.0.1:${(tls.address() as AddressInfo).port}/`
      const failure = await transport.fetch(url, options).then(() => null, (error: unknown) => error)
      expect(isTlsError(failure)).toBe(true)
      // skipTlsVerification: that request alone.
      expect((await transport.fetch(url, { ...options, ignoreTlsErrors: true })).status).toBe(200)
    } finally {
      tls?.closeAllConnections()
      if (tls !== undefined) await new Promise<void>((resolve) => tls!.close(() => resolve()))
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("goes through the policy's proxy alone, never one the environment names behind its back", async () => {
    const hits: string[] = []
    const proxy = createServer((req, res) => { hits.push(req.url ?? ''); res.writeHead(200, { 'content-type': 'text/plain' }).end('via proxy') })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    // Only HTTP_PROXY is set, and nothing exempts the origin from it.
    const names = ['HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'] as const
    const saved = names.map((name) => [name, process.env[name]] as const)
    for (const name of names) delete process.env[name]
    process.env.HTTP_PROXY = proxyUrl
    try {
      // impit alone would send this through HTTP_PROXY, or without it through the system's proxy (macOS); the policy says direct.
      requests.length = 0
      expect(await (await new CompatTransport(localNetworkPolicy()).fetch(`${origin}/article`, options)).bodyText()).toBe(ARTICLE)
      expect(hits).toEqual([])
      // A proxy in between rewrites the header order (a system proxy such as Clash puts user-agent first); direct, it arrives as sent.
      expect(requests[0]!.headers.filter(([name]) => name !== 'host')).toEqual([...COMPAT_PROFILES.chrome142.headers])
      expect(process.env.HTTP_PROXY).toBe(proxyUrl)
      // The policy's own proxy, from the same variable read once at startup, is used.
      const viaPolicy = new CompatTransport(withEnvironmentProxy(localNetworkPolicy(), { HTTP_PROXY: proxyUrl }))
      expect(await (await viaPolicy.fetch('http://compat.test/page', options)).bodyText()).toBe('via proxy')
      expect(hits).toEqual(['http://compat.test/page'])
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      proxy.closeAllConnections()
      await new Promise<void>((resolve) => proxy.close(() => resolve()))
    }
  })
})

describe('the http lane over the compatible transport', () => {
  const subject = () => new ResilientHttpSubject('standard', localNetworkPolicy(), undefined, undefined, false, null, false, undefined, new CompatTransport(localNetworkPolicy()))

  it('reads the page with the profile identity, robots.txt and the transport on the record', async () => {
    const http = subject()
    try {
      const out = await http.fetch(`${origin}/article`)
      expect(out).toMatchObject({ status: 'success', lane: 'http' })
      expect(out.markdown).toContain('Tide ledger')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'transport', detail: { library: 'impit', version: '0.14.5', profile: 'chrome142' } }))
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'identity_sent', detail: expect.objectContaining({ mode: 'standard', headers: prepareCompatIdentity().sentHeaders.headers }) }))
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_checked', detail: expect.objectContaining({ decision: 'allowed' }) }))
    } finally { await http.teardown() }
  })

  it('keeps the coding impit decoded and the hash the plain lane gives, with the wire bytes unknown', async () => {
    const http = subject()
    const plain = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      const out = await http.fetch(`${origin}/gzip`)
      const reference = await plain.fetch(`${origin}/gzip`)
      expect(out).toMatchObject({ status: 'success', evidence: { contentEncoding: 'gzip', rawBodySha256: reference.evidence.rawBodySha256 } })
      expect(out.usage.bytesWire).toBeNull()
      expect(out.usage.bytesDecompressed).toBe(reference.usage.bytesDecompressed)
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'transport_decoded', detail: { contentEncoding: 'gzip', by: 'impit' } }))
      expect((await http.fetch(`${origin}/article`)).usage.bytesWire).toBe(Buffer.byteLength(ARTICLE))
    } finally { await http.teardown(); await plain.teardown() }
  })

  it('decodes what impit passes through as the plain lane does, and fails a body that does not decode as it does', async () => {
    const http = subject()
    const plain = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      for (const path of ['/xgzip', '/double']) {
        const out = await http.fetch(`${origin}${path}`)
        const reference = await plain.fetch(`${origin}${path}`)
        expect(out).toMatchObject({ status: 'success', evidence: { contentEncoding: reference.evidence.contentEncoding, rawBodySha256: reference.evidence.rawBodySha256 } })
        expect(reference.status).toBe('success')
        // The lane decoded, so it counted the bytes on the wire.
        expect(out.usage.bytesWire).toBe(reference.usage.bytesWire)
        expect(out.trace.map((event) => event.event)).not.toContain('transport_decoded')
      }
      const corrupt = await http.fetch(`${origin}/corrupt`)
      expect(corrupt).toMatchObject({ status: 'failed', failureReason: (await plain.fetch(`${origin}/corrupt`)).failureReason })
      expect(corrupt.failureReason).toBe('parse_error')
      expect(corrupt.trace).toContainEqual(expect.objectContaining({ event: 'content_decoding_failed' }))
    } finally { await http.teardown(); await plain.teardown() }
  })

  it('obeys robots.txt before any request for the page goes out', async () => {
    const http = subject()
    try {
      requests.length = 0
      const out = await http.fetch(`${origin}/private`)
      expect(out).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
      expect(requests.map((r) => r.url)).not.toContain('/private')
    } finally { await http.teardown() }
  })

  it('is refused for an identity it cannot send unchanged', async () => {
    expect(() => new ResilientHttpSubject('research', localNetworkPolicy(), undefined, undefined, false, null, false, undefined, new CompatTransport(localNetworkPolicy()))).toThrow(/standard identity/)
    const http = subject()
    try {
      await expect(http.fetch(`${origin}/article`, undefined, undefined, {}, undefined, { headers: { authorization: 'Bearer x' } })).rejects.toThrow(/no custom headers/)
      await expect(http.fetch(`${origin}/article`, undefined, undefined, {}, undefined, { mobile: true })).rejects.toThrow(/no mobile identity/)
    } finally { await http.teardown() }
  })
})

describe('W2L_COMPAT_HOSTS', () => {
  const grant = { capabilities: ['compatible_transport'] }

  it('takes host names under a grant that names compatible_transport, on a local server only', () => {
    expect(compatHostsChoice({}, null, false)).toEqual([])
    expect(compatHostsChoice({ W2L_COMPAT_HOSTS: ' Example.com., shop.test ,example.com' }, grant, false)).toEqual(['example.com', 'shop.test'])
    expect(() => compatHostsChoice({ W2L_COMPAT_HOSTS: 'example.com' }, null, false)).toThrow(/needs an access grant that names compatible_transport/)
    expect(() => compatHostsChoice({ W2L_COMPAT_HOSTS: 'example.com' }, { capabilities: ['enhanced_browser'] }, false)).toThrow(/compatible_transport/)
    expect(() => compatHostsChoice({ W2L_COMPAT_HOSTS: 'example.com' }, grant, true)).toThrow(/refused on a hosted server/)
    expect(() => compatHostsChoice({ W2L_COMPAT_HOSTS: 'https://example.com/a,*.shop.test' }, grant, false)).toThrow(/not https:\/\/example.com\/a, \*.shop.test/)
  })

  it('matches a listed host and its subdomains, nothing else', () => {
    expect(compatHostListed(['example.com'], 'https://example.com/a')).toBe(true)
    expect(compatHostListed(['example.com'], 'https://www.example.com/a')).toBe(true)
    expect(compatHostListed(['example.com'], 'https://notexample.com/a')).toBe(false)
    expect(compatHostListed(['example.com'], 'https://example.com.evil.test/a')).toBe(false)
    expect(compatHostListed([], 'https://example.com/a')).toBe(false)
  })
})
