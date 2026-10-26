import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { localNetworkPolicy } from '@w2l/contracts'
import { createGuardedDispatcher } from '../src/egress.js'
import { RobotsOriginCache, robotsFetcherOf } from '../src/robotsLookup.js'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function response(body: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/plain' }): Response {
  return new Response(body, { status, headers })
}

describe('RobotsOriginCache reliability boundaries', () => {
  const origin = 'http://127.0.0.1:8787'
  it('coalesces concurrent origin lookups', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 5))
      return response('User-agent: *\nCrawl-delay: 2\n')
    })
    const cache = new RobotsOriginCache()
    const results = await Promise.all([
      cache.lookup(`${origin}/a`, '*'),
      cache.lookup(`${origin}/b`, '*'),
      cache.lookup(`${origin}/c`, '*'),
    ])
    expect(calls).toBe(1)
    expect(results.every((entry) => entry?.robots !== null)).toBe(true)
    await cache.teardown()
    await cache.teardown()
  })

  it('keeps one robots.txt per origin and User-Agent: the same identity reads it once, another reads its own (T005)', async () => {
    // A site that answers each client its own file, as etsy did for the http, browser_local and installed_chrome rungs.
    const asked: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const agent = (init.headers as Record<string, string>)['user-agent']!
      asked.push(agent)
      return response(`User-agent: *\nDisallow: /${agent === 'Chrome/128' ? 'cart' : 'search'}\n`)
    })
    const cache = new RobotsOriginCache()
    try {
      const http = await cache.lookup(`${origin}/a`, 'Chrome/128')
      expect(await cache.lookup(`${origin}/b`, 'Chrome/128')).toBe(http)
      const browser = await cache.lookup(`${origin}/a`, 'Chrome/151')
      expect(asked).toEqual(['Chrome/128', 'Chrome/151'])
      expect(browser?.sha256).not.toBe(http?.sha256)
      expect(cache.decision(http, `${origin}/cart`, 'Chrome/128').decision).toBe('disallowed')
      expect(cache.decision(browser, `${origin}/cart`, 'Chrome/151').decision).toBe('allowed')
    } finally { await cache.teardown() }
  })

  it("answers the provider rung's robots.txt fetcher from the cache, each outcome as the provider reads it", async () => {
    let calls = 0
    vi.stubGlobal('fetch', async () => { calls++; return response('User-agent: *\nDisallow: /x\n') })
    const cache = new RobotsOriginCache()
    const fetcher = robotsFetcherOf(cache)
    const file = { text: 'User-agent: *\nDisallow: /x\n', status: 200, contentType: 'text/plain' }
    expect(await fetcher(`${origin}/robots.txt`, 'TestUA/1.0')).toEqual(file)
    expect(await fetcher(`${origin}/robots.txt`, 'TestUA/1.0')).toEqual(file)
    expect(calls).toBe(1)
    const read = async (answer: () => Promise<Response>) => {
      vi.stubGlobal('fetch', answer)
      return robotsFetcherOf(new RobotsOriginCache())(`${origin}/robots.txt`, 'TestUA/1.0')
    }
    expect(await read(async () => response('down', 503))).toEqual({ text: '', status: 503, contentType: null })
    expect(await read(async () => response('none', 404))).toEqual({ text: '', status: 404, contentType: null })
    expect(await read(async () => response('<html></html>', 200, { 'content-type': 'text/html' }))).toEqual({ text: '', status: 404, contentType: null })
    expect(await read(async () => { throw new TypeError('fetch failed') })).toBeNull()
  })

  it('follows robots redirects manually and caps oversized bodies', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/robots-2.txt' } }))
      .mockResolvedValueOnce(response('User-agent: *\nDisallow: /private\n'))
    vi.stubGlobal('fetch', fetcher)
    const cache = new RobotsOriginCache()
    const entry = await cache.lookup(`${origin}/a`, '*')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(entry?.robots?.groups).toHaveLength(1)

    const oversized = new RobotsOriginCache()
    vi.stubGlobal('fetch', async () => response('x'.repeat(1024 * 1024 + 1)))
    const bounded = await oversized.lookup(`${origin}/large`, '*')
    expect(bounded?.robots).toBeNull()
    expect(bounded?.absent).toBe(false)
  })

  it('assumes a complete disallow when robots.txt answers 5xx or fails on the network, while 4xx means no restrictions', async () => {
    // RFC 9309 §2.3.1.3 and §2.3.1.4, in local and hosted mode alike.
    const url = `${origin}/page`
    const decision = async (fetcher: () => Promise<Response>) => {
      vi.stubGlobal('fetch', fetcher)
      const cache = new RobotsOriginCache()
      try {
        const entry = await cache.lookup(url, 'w2l-test')
        return { entry, result: cache.decision(entry, url, 'w2l-test') }
      } finally { await cache.teardown() }
    }
    const serverError = await decision(async () => response('temporarily unavailable', 503))
    expect(serverError.result).toMatchObject({ decision: 'disallowed', unreachable: 'server_error', robotsUrl: `${origin}/robots.txt`, robotsSha256: null, appliedRules: [] })
    const unreachable = await decision(async () => { throw new Error('connection refused') })
    expect(unreachable.entry?.absent).toBe(false)
    expect(unreachable.result).toMatchObject({ decision: 'disallowed', unreachable: 'network_error' })
    const absent = await decision(async () => response('not found', 404))
    expect(absent.entry?.absent).toBe(true)
    expect(absent.result.decision).toBe('no_robots')
    expect(absent.result).not.toHaveProperty('unreachable')
  })

  it('fetches an unreachable robots.txt again after its TTL, and keeps other entries', async () => {
    const url = `${origin}/page`
    let calls = 0
    vi.stubGlobal('fetch', async () => ++calls === 1 ? response('temporarily unavailable', 503) : response('User-agent: *\nDisallow: /private\n'))
    const cache = new RobotsOriginCache({ ...localNetworkPolicy(), robotsUnreachableTtlMs: 50 })
    try {
      expect(cache.decision(await cache.lookup(url, 'w2l-test'), url, 'w2l-test')).toMatchObject({ decision: 'disallowed', unreachable: 'server_error' })
      expect(cache.decision(await cache.lookup(url, 'w2l-test'), url, 'w2l-test').unreachable).toBe('server_error')
      expect(calls).toBe(1)
      await new Promise(resolve => setTimeout(resolve, 80))
      const retried = cache.decision(await cache.lookup(url, 'w2l-test'), url, 'w2l-test')
      expect(retried.decision).toBe('allowed')
      expect(retried).not.toHaveProperty('unreachable')
      expect(calls).toBe(2)
      await new Promise(resolve => setTimeout(resolve, 80))
      await cache.lookup(url, 'w2l-test')
      expect(calls).toBe(2)
    } finally { await cache.teardown() }
  })

  it('treats a redirected robots 404 as unavailable, not as a redirect failure', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/different-robots.txt' } }))
      .mockResolvedValueOnce(response('not found', 404))
    vi.stubGlobal('fetch', fetcher)
    const cache = new RobotsOriginCache()
    try {
      const entry = await cache.lookup(`${origin}/page`, 'w2l-test')
      expect(entry?.absent).toBe(true)
      expect(cache.decision(entry, `${origin}/page`, 'w2l-test').decision).toBe('no_robots')
    } finally { await cache.teardown() }
  })

  it('treats its own deadline as an unreachable robots.txt; only the caller can cancel', async () => {
    // A robots.txt that never answers must not throw out of the fetch it
    // guards: the lookup's own deadline is a network error like any other.
    const server = createServer(() => { /* never answers */ })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing fixture port')
    const url = `http://127.0.0.1:${address.port}/page`
    const policy = { ...localNetworkPolicy(), robotsTimeoutMs: 50 }
    try {
      const cache = new RobotsOriginCache(policy)
      const entry = await cache.lookup(url, 'w2l-test')
      expect(entry).toMatchObject({ robots: null, absent: false, unreachable: 'timeout' })
      expect(cache.decision(entry, url, 'w2l-test')).toMatchObject({ decision: 'disallowed', unreachable: 'timeout' })
      // The provider rung reads the same deadline as its own fetcher's timeout.
      expect(await robotsFetcherOf(cache)(url, 'w2l-test')).toEqual({ unreachable: 'timeout' })
      await cache.teardown()

      const slow = new RobotsOriginCache({ ...policy, robotsTimeoutMs: 10_000 })
      const controller = new AbortController()
      const cancelled = slow.lookup(url, 'w2l-test', { signal: controller.signal })
      controller.abort(new DOMException('caller left', 'AbortError'))
      await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
      await expect(slow.lookup(url, 'w2l-test', { deadlineAt: Date.now() + 50 })).rejects.toMatchObject({ name: 'TimeoutError' })
      await slow.teardown()
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('uses the guarded connector for a real robots request', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nDisallow: /private\n')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing fixture port')
    const resolver = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }])
    const policy = localNetworkPolicy()
    const dispatcher = createGuardedDispatcher(policy, resolver)
    try {
      const cache = new RobotsOriginCache(policy, dispatcher)
      const entry = await cache.lookup(`http://localhost:${address.port}/page`, 'w2l-test')
      expect(entry?.robots?.groups).toHaveLength(1)
      expect(resolver).toHaveBeenCalled()
    } finally {
      await dispatcher.close()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
