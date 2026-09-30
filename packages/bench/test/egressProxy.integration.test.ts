import { createServer, request as httpRequest, type Server } from 'node:http'
import { connect as netConnect, type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseOperatorProxy } from '../src/egressProxy.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

/**
 * The operator's egress proxy and structured lookup failures, against real
 * sockets: a minimal forward proxy (CONNECT tunnels for undici, absolute-URI
 * GETs for Chromium), an origin that answers, and an origin whose robots.txt
 * never does.
 */

interface Proxy {
  url: string
  seen: string[]
  authorizations: (string | undefined)[]
  close(): Promise<void>
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

async function startProxy(): Promise<Proxy> {
  const seen: string[] = []
  const authorizations: (string | undefined)[] = []
  const server = createServer((req, res) => {
    let target: URL
    try { target = new URL(req.url ?? '') } catch { res.writeHead(400).end(); return }
    seen.push(`${req.method} ${target.href}`)
    authorizations.push(req.headers['proxy-authorization'])
    const upstream = httpRequest(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
    req.pipe(upstream)
  })
  server.on('connect', (req, socket, head) => {
    seen.push(`CONNECT ${req.url}`)
    authorizations.push(req.headers['proxy-authorization'])
    const [host = '', port = '80'] = (req.url ?? '').split(':')
    const upstream = netConnect(Number(port), host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
  const url = await listen(server)
  return { url, seen, authorizations, close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()) }) }
}

const PAGE =
  '<!doctype html><html><head><title>Through the proxy</title></head><body><article><h1>Through the proxy</h1>' +
  '<p>This page is served by a loopback origin and reached through a loopback forward proxy so the test can see every hop.</p>' +
  '<p>Nothing about the identity changes on the way: the same user agent, the same headers, only the route differs.</p></article></body></html>'

let origin: Server
let originUrl: string
let hangingOrigin: Server
let hangingUrl: string
let proxy: Proxy

beforeAll(async () => {
  origin = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('User-agent: *\nDisallow:\n'); return }
    if (req.url === '/page') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return }
    res.writeHead(404).end()
  })
  originUrl = await listen(origin)
  hangingOrigin = createServer((req, res) => {
    if (req.url === '/robots.txt') return // never answers
    if (req.url === '/page') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return }
    res.writeHead(404).end()
  })
  hangingUrl = await listen(hangingOrigin)
  proxy = await startProxy()
})

afterAll(async () => {
  await proxy.close()
  origin.closeAllConnections()
  hangingOrigin.closeAllConnections()
  await new Promise<void>((resolve) => origin.close(() => resolve()))
  await new Promise<void>((resolve) => hangingOrigin.close(() => resolve()))
})

describe('operator proxy on the http lane', () => {
  it('tunnels the page and robots.txt through the proxy and records the route without credentials', async () => {
    proxy.seen.length = 0
    proxy.authorizations.length = 0
    const configured = parseOperatorProxy(proxy.url.replace('http://', 'http://alice:s3cret@'), 'W2L_PROXY_URL')
    const subject = new ResilientHttpSubject('standard', undefined, undefined, false, undefined, false, configured)
    try {
      const out = await subject.fetch(`${originUrl}/page`)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Through the proxy')
      const originHost = originUrl.replace('http://', '')
      expect(proxy.seen.filter((line) => line === `CONNECT ${originHost}`).length).toBeGreaterThanOrEqual(1)
      expect(proxy.authorizations.every((value) => value === `Basic ${Buffer.from('alice:s3cret').toString('base64')}`)).toBe(true)
      const used = out.trace.find((event) => event.event === 'proxy_used')
      expect(used?.detail).toEqual({ server: proxy.url, source: 'W2L_PROXY_URL' })
      expect(JSON.stringify(out)).not.toContain('s3cret')
      expect(JSON.stringify(out)).not.toContain('alice')
    } finally {
      await subject.teardown()
    }
  })

  it('sends NO_PROXY hosts direct and says nothing about a proxy', async () => {
    proxy.seen.length = 0
    const configured = parseOperatorProxy(proxy.url, 'HTTPS_PROXY', 'localhost,127.0.0.1')
    const subject = new ResilientHttpSubject('standard', undefined, undefined, false, undefined, false, configured)
    try {
      const out = await subject.fetch(`${originUrl}/page`)
      expect(out.status).toBe('success')
      expect(proxy.seen).toEqual([])
      expect(out.trace.some((event) => event.event === 'proxy_used')).toBe(false)
    } finally {
      await subject.teardown()
    }
  })
})

describe('operator proxy on the browser lane', () => {
  it('launches Chromium behind the proxy and fetches robots.txt through it too', async () => {
    proxy.seen.length = 0
    const configured = parseOperatorProxy(proxy.url, 'W2L_PROXY_URL')
    const subject = new BrowserLocalSubject('standard', null, false, undefined, null, undefined, null, undefined, undefined, false, configured)
    try {
      const out = await subject.fetch(`${originUrl}/page`)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Through the proxy')
      expect(proxy.seen).toContain(`GET ${originUrl}/page`)
      expect(proxy.seen).toContain(`CONNECT ${originUrl.replace('http://', '')}`)
      expect(out.trace.find((event) => event.event === 'proxy_used')?.detail).toEqual({ server: proxy.url, source: 'W2L_PROXY_URL' })
    } finally {
      await subject.teardown()
    }
  }, 60_000)
})

describe('structured lookup failures', () => {
  it('a robots.txt that never answers ends the lookup on its own deadline and the page still comes back', async () => {
    const subject = new ResilientHttpSubject()
    try {
      const out = await subject.fetch(`${hangingUrl}/page`)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Through the proxy')
      const robots = out.trace.find((event) => event.event === 'robots_checked')
      expect(robots?.detail).toMatchObject({ decision: 'no_robots', unreachable: 'timeout' })
      expect(out.usage.timings?.robotsMs).toBeGreaterThanOrEqual(4_000)
    } finally {
      await subject.teardown()
    }
  }, 30_000)

  it('the http lane names an unresolvable host dns_error', async () => {
    const subject = new ResilientHttpSubject()
    try {
      const out = await subject.fetch('http://nonexistent.invalid/page')
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('dns_error')
      expect(out.trace.find((event) => event.event === 'robots_checked')?.detail).toMatchObject({ unreachable: 'dns_error' })
    } finally {
      await subject.teardown()
    }
  }, 30_000)

  it('the browser lane names an unresolvable host dns_error', async () => {
    const subject = new BrowserLocalSubject('standard')
    try {
      const out = await subject.fetch('http://nonexistent.invalid/page')
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('dns_error')
    } finally {
      await subject.teardown()
    }
  }, 60_000)
})
