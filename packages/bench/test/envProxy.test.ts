import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localNetworkPolicy, withEnvironmentProxy, type NetworkPolicy } from '@w2l/contracts'
import { EgressRoutes } from '../src/egress.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { robotsFetcherVia } from '../src/subjects/provider.js'

/**
 * Local mode behind the operator's forward proxy (HTTPS_PROXY / HTTP_PROXY /
 * NO_PROXY). The recording proxy answers absolute-form requests itself and
 * refuses CONNECT tunnels, so every test also proves that local DNS was not
 * needed: `.invalid` names never resolve.
 */

const PAGE = '<!doctype html><html><head><title>Proxied page</title></head><body><article><h1>Reached through the proxy</h1>' +
  '<p>This page came back through the operator\'s forward proxy for a host name that the local resolver cannot resolve, ' +
  'which is exactly the situation the environment proxy variables exist for.</p><p><a href="/next">Next page</a></p></article></body></html>'

let proxy: Server
let proxyEndpoint: string
let seen: string[] = []
let policy: NetworkPolicy

beforeAll(async () => {
  proxy = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`)
    const path = new URL(req.url ?? '/', 'http://absolute-form.invalid').pathname
    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
      return
    }
    if (path === '/to-https') {
      res.writeHead(301, { location: 'https://w2l-proxy-only.invalid/page' }).end()
      return
    }
    // ~20 KiB of response headers, above undici's 16 KiB default.
    const padding = path === '/big-headers' ? Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`x-padding-${i}`, 'x'.repeat(1024)])) : {}
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...padding }).end(PAGE)
  })
  proxy.on('connect', (req, socket) => {
    seen.push(`CONNECT ${req.url}`)
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  proxyEndpoint = `127.0.0.1:${(proxy.address() as AddressInfo).port}`
  const url = `http://${proxyEndpoint}`
  policy = withEnvironmentProxy(localNetworkPolicy(), { HTTPS_PROXY: url, HTTP_PROXY: url, NO_PROXY: 'w2l-direct.invalid' })
})

afterAll(async () => {
  proxy.closeAllConnections()
  await new Promise<void>(resolve => proxy.close(() => resolve()))
})

beforeEach(() => { seen = [] })

describe('HTTP lane behind the environment proxy', () => {
  it('sends the page and its robots.txt through the proxy without local DNS and records it', async () => {
    const http = new ResilientHttpSubject('standard', policy)
    try {
      const out = await http.fetch('http://w2l-proxy-only.invalid/page')
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Reached through the proxy')
      expect(seen).toEqual(['GET http://w2l-proxy-only.invalid/robots.txt', 'GET http://w2l-proxy-only.invalid/page'])
      expect(out.evidence.envProxy).toBe(proxyEndpoint)
      expect(out.trace.filter(event => event.event === 'egress_proxy').map(event => event.detail))
        .toEqual([{ url: 'http://w2l-proxy-only.invalid/page', proxy: proxyEndpoint, source: 'environment' }])
      const big = await http.fetch('http://w2l-proxy-only.invalid/big-headers')
      expect(big.status).toBe('success')
    } finally { await http.teardown() }
  })

  it('tunnels https with CONNECT and reports a refused tunnel as connection_error', async () => {
    const http = new ResilientHttpSubject('standard', policy)
    try {
      // robots.txt for the http origin allows the page, which redirects to https.
      const out = await http.fetch('http://w2l-proxy-only.invalid/to-https')
      expect(out).toMatchObject({ status: 'failed', failureReason: 'connection_error' })
      expect(seen).toContain('CONNECT w2l-proxy-only.invalid:443')
      expect(out.evidence.envProxy).toBe(proxyEndpoint)
    } finally { await http.teardown() }
  })

  it('does not fetch an https page whose robots.txt tunnel is refused, and says robots.txt was unreachable', async () => {
    const http = new ResilientHttpSubject('standard', policy)
    try {
      const out = await http.fetch('https://w2l-proxy-only.invalid/page')
      expect(out).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_checked', detail: expect.objectContaining({ decision: 'disallowed', unreachable: 'network_error' }) }))
      // One tunnel, for robots.txt: the page request never left.
      expect(seen).toEqual(['CONNECT w2l-proxy-only.invalid:443'])
    } finally { await http.teardown() }
  })

  it('keeps NO_PROXY hosts and loopback direct', async () => {
    const origin = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE) })
    origin.listen(0, '127.0.0.1')
    await once(origin, 'listening')
    const http = new ResilientHttpSubject('standard', policy)
    try {
      const direct = await http.fetch('http://w2l-direct.invalid/page')
      expect(direct).toMatchObject({ status: 'failed', failureReason: 'dns_error' })
      const local = await http.fetch(`http://127.0.0.1:${(origin.address() as AddressInfo).port}/page`)
      expect(local.status).toBe('success')
      expect(local.evidence.envProxy).toBeNull()
      expect(local.trace.some(event => event.event === 'egress_proxy')).toBe(false)
      expect(seen).toEqual([])
    } finally {
      await http.teardown()
      origin.closeAllConnections()
      await new Promise<void>(resolve => origin.close(() => resolve()))
    }
  })
})

describe('browser lane behind the environment proxy', () => {
  it('routes navigation and robots.txt through the same proxy', async () => {
    const browser = new BrowserLocalSubject('standard', null, false, policy)
    try {
      const out = await browser.fetch('http://w2l-proxy-only.invalid/page')
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Reached through the proxy')
      expect(seen).toEqual(expect.arrayContaining(['GET http://w2l-proxy-only.invalid/robots.txt', 'GET http://w2l-proxy-only.invalid/page']))
      expect(out.evidence.envProxy).toBe(proxyEndpoint)
      expect(out.trace.some(event => event.event === 'egress_proxy')).toBe(true)
    } finally { await browser.teardown() }
  })
})

describe('provider lane behind the environment proxy', () => {
  it('sends the one request the lane makes from this machine, robots.txt, through the proxy', async () => {
    const routes = new EgressRoutes(policy)
    try {
      const robots = await robotsFetcherVia(url => routes.dispatcherFor(url))('http://w2l-proxy-only.invalid/robots.txt', 'ProviderBot/1.0')
      expect(robots).toMatchObject({ status: 200, text: 'User-agent: *\nAllow: /\n' })
      expect(seen).toEqual(['GET http://w2l-proxy-only.invalid/robots.txt'])
    } finally { await routes.close() }
  })
})
