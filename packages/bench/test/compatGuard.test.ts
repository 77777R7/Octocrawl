import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createSecureServer, type Http2SecureServer } from 'node:http2'
import { connect, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostedNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { CompatAddressGuard, type GuardResolver } from '../src/compatGuard.js'
import { CompatTransport, DEFAULT_COMPAT_PROFILE } from '../src/compatTransport.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * The compatible transport's address guard on a hosted engine (ADR 0005 `compatible_transport`, stage H item 2). impit
 * resolves names itself, so a hosted transport hands every name and address to the guard, which resolves it, checks it
 * as the undici lane's pinned lookup does, and connects only to the address it checked. Each transport test reads a
 * name the system cannot resolve or an address the policy refuses: without the guard, impit would fail to resolve the
 * first and connect to the second.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const ARTICLE = `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p></article></body></html>`

let site: Server
let port: number
const seen: { url: string; host: string }[] = []
let connections = 0

beforeAll(async () => {
  site = createServer((req, res) => {
    seen.push({ url: req.url ?? '', host: req.headers.host ?? '' })
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    if (req.url === '/hop') return void res.writeHead(302, { location: `http://private.test:${port}/secret` }).end()
    if (req.url === '/hop-literal') return void res.writeHead(302, { location: `http://127.0.0.2:${port}/secret` }).end()
    // A new connection for every request, so each is checked again.
    if (req.url === '/close') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' }).end(ARTICLE)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE)
  })
  site.on('connection', () => { connections += 1 })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  port = (site.address() as AddressInfo).port
})

afterAll(async () => {
  site.closeAllConnections()
  await new Promise<void>((resolve) => site.close(() => resolve()))
})

/** The hosted policy, letting through to the loopback site the names a test gives: names, never an address range. */
function hosted(...names: string[]): NetworkPolicy {
  return { ...hostedNetworkPolicy(), origin: 'operator', privateAllowlist: names }
}

/** A resolver that knows the names given, each with its addresses, and nothing else; it keeps the names it was asked. */
function resolver(names: Record<string, readonly string[]>): GuardResolver & { calls: string[] } {
  const calls: string[] = []
  const resolve: GuardResolver = async (hostname) => {
    calls.push(hostname)
    const addresses = names[hostname]
    if (addresses === undefined) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' })
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  }
  return Object.assign(resolve, { calls })
}

const options = { headersTimeoutMs: 5000, bodyTimeoutMs: 5000, capFor: () => 1_000_000 }

/** A SOCKS5 client's messages to the guard at `proxy`: the login it was given (RFC 1929), and a CONNECT to a name. */
const login = (proxy: URL, password = decodeURIComponent(proxy.password)) => { const user = decodeURIComponent(proxy.username); return [1, user.length, ...Buffer.from(user), password.length, ...Buffer.from(password)] }
const connectTo = (name: string, to: number) => [5, 1, 0, 3, name.length, ...Buffer.from(name), to >> 8, to & 0xff]
/** Writes the messages at once and answers the first `want` bytes the guard sends back (fewer if it closes first). */
const exchange = (proxy: URL, messages: number[][], want: number) => new Promise<number[]>((resolve, reject) => {
  const socket = connect(Number(proxy.port), '127.0.0.1')
  let got: number[] = []
  socket.on('data', (chunk) => { got = [...got, ...chunk]; if (got.length >= want) { socket.destroy(); resolve(got.slice(0, want)) } })
  socket.on('error', reject)
  socket.on('close', () => resolve(got))
  for (const message of messages) socket.write(Buffer.from(message))
})

describe('the address guard of the hosted compatible transport', () => {
  it('reads a name only at the address its resolver checked: the system cannot resolve pinned.test, the guard can', async () => {
    const transport = new CompatTransport(hosted('pinned.test'), DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(hosted('pinned.test'), resolver({ 'pinned.test': ['127.0.0.1'] })))
    try {
      const response = await transport.fetch(`http://pinned.test:${port}/article`, options)
      expect(response.status).toBe(200)
      expect(new TextDecoder().decode(await response.bodyBytes!())).toContain('Tide ledger')
      // impit sent the name, not an address: the site sees the Host it was asked for.
      expect(seen.at(-1)).toEqual({ url: '/article', host: `pinned.test:${port}` })
    } finally { await transport.close() }
  })

  it('refuses a loopback address at connect, named or literal: not one byte reaches the site', async () => {
    const before = connections
    const transport = new CompatTransport(hostedNetworkPolicy(), DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(hostedNetworkPolicy(), resolver({ localhost: ['127.0.0.1'] })))
    try {
      await expect(transport.fetch(`http://127.0.0.1:${port}/article`, options)).rejects.toMatchObject({ name: 'SsrfDeniedError' })
      await expect(transport.fetch(`http://localhost:${port}/article`, options)).rejects.toMatchObject({ name: 'SsrfDeniedError' })
      expect(connections).toBe(before)
    } finally { await transport.close() }
  })

  it('refuses a name that resolves to a private, shared, link-local, metadata or loopback address, or to one among public ones', async () => {
    const names = { 'a.test': ['10.0.0.7'], 'b.test': ['100.64.0.1'], 'c.test': ['169.254.169.254'], 'd.test': ['127.0.0.1'], 'e.test': ['::1'], 'f.test': ['fd00::1'], 'g.test': ['93.184.216.34', '192.168.1.1'] }
    const resolve = resolver(names)
    const before = connections
    const transport = new CompatTransport(hostedNetworkPolicy(), DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(hostedNetworkPolicy(), resolve))
    try {
      for (const name of Object.keys(names)) await expect(transport.fetch(`http://${name}:${port}/article`, options), name).rejects.toMatchObject({ name: 'SsrfDeniedError' })
      await expect(transport.fetch(`http://metadata.google.internal:${port}/`, options)).rejects.toMatchObject({ name: 'SsrfDeniedError' })
      // Each name was resolved by the guard once; metadata.google.internal was refused by its name alone.
      expect(resolve.calls).toEqual(Object.keys(names))
      expect(connections).toBe(before)
    } finally { await transport.close() }
  })

  it('checks every new connection: a name that resolved to an allowed address, then to the metadata address, is refused the second time', async () => {
    const answers = ['127.0.0.1', '169.254.169.254']
    const calls: string[] = []
    const rebinding: GuardResolver = async (hostname) => { calls.push(hostname); const address = answers[Math.min(calls.length, answers.length) - 1]!; return [{ address, family: 4 }] }
    const transport = new CompatTransport(hosted('site.test'), DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(hosted('site.test'), rebinding))
    try {
      expect((await transport.fetch(`http://site.test:${port}/close`, options)).status).toBe(200)
      await expect(transport.fetch(`http://site.test:${port}/close`, options)).rejects.toMatchObject({ name: 'SsrfDeniedError' })
      expect(calls).toEqual(['site.test', 'site.test'])
    } finally { await transport.close() }
  })

  it('follows no redirect itself, and a hop to a private address is refused at connect', async () => {
    const transport = new CompatTransport(hosted('public.test'), DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(hosted('public.test'), resolver({ 'public.test': ['127.0.0.1'], 'private.test': ['127.0.0.1'] })))
    try {
      const hop = await transport.fetch(`http://public.test:${port}/hop`, options)
      expect(hop.status).toBe(302)
      const location = hop.headers.get('location')!
      expect(location).toBe(`http://private.test:${port}/secret`)
      await expect(transport.fetch(location, options)).rejects.toMatchObject({ name: 'SsrfDeniedError' })
      await expect(transport.fetch(`http://127.0.0.2:${port}/secret`, options)).rejects.toMatchObject({ name: 'SsrfDeniedError' })
      expect(seen.map((request) => request.url)).not.toContain('/secret')
    } finally { await transport.close() }
  })

  it('reports a name that does not resolve as a DNS failure, not a refusal', async () => {
    const transport = new CompatTransport(hostedNetworkPolicy(), DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(hostedNetworkPolicy(), resolver({})))
    try {
      await expect(transport.fetch(`http://nowhere.test:${port}/`, options)).rejects.toMatchObject({ name: 'DnsLookupError' })
    } finally { await transport.close() }
  })

  it('keeps TLS end to end: impit makes its own handshake (HTTP/2) through the guard and checks the certificate itself', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'w2l-guard-tls-'))
    let tls: Http2SecureServer | undefined
    const transport = new CompatTransport(hosted('tls.test'), DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(hosted('tls.test'), resolver({ 'tls.test': ['127.0.0.1'] })))
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=tls.test', '-addext', 'subjectAltName=DNS:tls.test'], { stdio: 'ignore' })
      const versions: string[] = []
      tls = createSecureServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')), allowHTTP1: true }, (req, res) => { versions.push(req.httpVersion); res.end('ok') })
      await new Promise<void>((resolve) => tls!.listen(0, '127.0.0.1', resolve))
      const url = `https://tls.test:${(tls.address() as AddressInfo).port}/`
      // A self-signed certificate fails impit's own check: the guard passes bytes, it does not end TLS.
      await expect(transport.fetch(url, options)).rejects.toMatchObject({ name: 'CompatTlsError' })
      expect((await transport.fetch(url, { ...options, ignoreTlsErrors: true })).status).toBe(200)
      expect(versions).toEqual(['2.0'])
    } finally {
      await transport.close()
      if (tls !== undefined) await new Promise<void>((resolve) => tls!.close(() => resolve()))
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('answers only the transport that holds its login, takes CONNECT alone, and stops listening when the transport closes', async () => {
    const guard = new CompatAddressGuard(hosted('pinned.test'), resolver({ 'pinned.test': ['127.0.0.1'] }))
    const proxy = new URL(await guard.proxyUrl())
    expect(proxy.protocol).toBe('socks5h:')
    expect(proxy.hostname).toBe('127.0.0.1')
    // No login offered: no acceptable method.
    expect(await exchange(proxy, [[5, 1, 0]], 2)).toEqual([5, 0xff])
    // A wrong password: refused.
    expect(await exchange(proxy, [[5, 1, 2], login(proxy, 'not-the-password')], 4)).toEqual([5, 2, 1, 1])
    // The right login, then a BIND: command not supported.
    expect(await exchange(proxy, [[5, 1, 2], login(proxy), [5, 2, 0, 1, 127, 0, 0, 1, port >> 8, port & 0xff]], 6)).toEqual([5, 2, 1, 0, 5, 7])
    await new CompatTransport(hosted('pinned.test'), DEFAULT_COMPAT_PROFILE, guard).close()
    await expect(new Promise((resolve, reject) => { const socket = connect(Number(proxy.port), '127.0.0.1', () => { socket.destroy(); resolve('connected') }); socket.on('error', reject) })).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('connects to a literal only as Node reads it: 012.0.0.1, which a system resolver may read as octal (10.0.0.1), is refused', async () => {
    // impit reads such a URL itself and sends the address; any other client with the login is held to the same checks.
    const guard = new CompatAddressGuard(hostedNetworkPolicy(), resolver({}))
    try {
      const proxy = new URL(await guard.proxyUrl())
      expect(await exchange(proxy, [[5, 1, 2], login(proxy), connectTo('012.0.0.1', port)], 6)).toEqual([5, 2, 1, 0, 5, 2])
    } finally { await guard.close() }
  })

  it('opens no connection for a client that left, or for a guard that closed, while it resolved the name', async () => {
    for (const leaves of ['the client', 'the guard'] as const) {
      let asked!: () => void
      const resolving = new Promise<void>((resolve) => { asked = resolve })
      let answer!: () => void
      const answered = new Promise<void>((resolve) => { answer = resolve })
      const slow: GuardResolver = async () => { asked(); await answered; return [{ address: '127.0.0.1', family: 4 }] }
      const guard = new CompatAddressGuard(hosted('slow.test'), slow)
      const proxy = new URL(await guard.proxyUrl())
      const before = connections
      const client = connect(Number(proxy.port), '127.0.0.1')
      client.on('error', () => {})
      for (const message of [[5, 1, 2], login(proxy), connectTo('slow.test', port)]) client.write(Buffer.from(message))
      await resolving
      if (leaves === 'the client') {
        client.destroy()
        // The guard hears of it before the name resolves, as it would during a slow lookup.
        await new Promise((resolve) => setTimeout(resolve, 100))
      } else await guard.close()
      answer()
      // A connection to the site would follow the lookup at once.
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(connections, leaves).toBe(before)
      client.destroy()
      await guard.close()
    }
  })
})

describe('a hosted http lane over the guarded transport', () => {
  it('reads a page through the guard and reports a redirect to a private address as policy_denied', async () => {
    // The operator's list lets the site's own address through; 127.0.0.2 is not on it.
    const policy: NetworkPolicy = { ...hostedNetworkPolicy(), origin: 'operator', privateAllowlist: ['127.0.0.1'], perHostMinDelayMs: 0 }
    const lane = new ResilientHttpSubject('standard', policy, undefined, undefined, false, null, false, undefined, new CompatTransport(policy, DEFAULT_COMPAT_PROFILE, new CompatAddressGuard(policy, resolver({}))))
    try {
      const page = await lane.fetch(`http://127.0.0.1:${port}/article`)
      expect(page.status).toBe('success')
      expect(page.trace.find((event) => event.event === 'transport')?.detail).toMatchObject({ library: 'impit' })
      // The lane's own check of the hop refuses it before any connection is made (the guard would refuse it too).
      const hop = await lane.fetch(`http://127.0.0.1:${port}/hop-literal`)
      expect(hop).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
      expect(hop.trace.map((event) => event.event)).toContain('ssrf_denied')
      expect(seen.map((request) => request.url)).not.toContain('/secret')
    } finally { await lane.teardown() }
  })
})
