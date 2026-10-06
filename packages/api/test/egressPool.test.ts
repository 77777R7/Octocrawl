import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { connect, createServer as netServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { egressProxies, localNetworkPolicy, type FetchResult, type ProxyServer } from '@w2l/contracts'
import { accessGrantFromText } from '@w2l/http-core'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import { EGRESS_COOLDOWN_MS, EgressPool, egressInDoubt, probeEgress } from '../src/egressPool.js'

/**
 * Egress proxies (W2L_EGRESS_PROXIES, ADR 0005 egress_sessions): a task keeps one egress, switches only
 * when the proxy itself fails its probe (at most twice, with a new cookie session), and never on what a site did.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p></article></body></html>`
let origin: Server
let originPort: number
const proxies: Server[] = []
const proxyHits = new Map<string, number>()
let root: string
// The resumed page waits here, and every Cookie it is sent is kept.
let holdPage = false
let holdStarted: (() => void) | null = null
const holdCookies: string[] = []
let engine: ApiEngine | null = null

/** A forward proxy that sends every request, tunnel or plain, to an origin server (the shared one by default), and counts them. */
async function liveProxy(target = () => originPort): Promise<ProxyServer & { stop(): Promise<void> }> {
  const proxy = createServer((req, res) => {
    const endpoint = `127.0.0.1:${(proxy.address() as AddressInfo).port}`
    proxyHits.set(endpoint, (proxyHits.get(endpoint) ?? 0) + 1)
    const requested = new URL(req.url ?? '/')
    const forward = httpRequest({ host: '127.0.0.1', port: target(), path: requested.pathname, method: req.method, headers: req.headers }, (answer) => { res.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(res) })
    // A site that drops the connection reaches the client as a dropped connection, as through a real proxy.
    forward.on('error', () => res.destroy())
    req.pipe(forward)
  })
  proxy.on('connect', (req, socket) => {
    const endpoint = `127.0.0.1:${(proxy.address() as AddressInfo).port}`
    proxyHits.set(endpoint, (proxyHits.get(endpoint) ?? 0) + 1)
    const upstream = connect(target(), '127.0.0.1', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); upstream.pipe(socket); socket.pipe(upstream) })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  proxies.push(proxy)
  const server = egressProxies(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`)[0]!
  // Stopped: it accepts nothing more, and its open tunnels close.
  return { ...server, stop: () => new Promise<void>((resolve) => { proxy.close(() => resolve()); proxy.closeAllConnections() }) }
}

/** A proxy address nothing listens on: every connection is refused. */
async function deadProxy(): Promise<ProxyServer> {
  const probe = netServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return egressProxies(`http://127.0.0.1:${port}`)[0]!
}

beforeAll(async () => {
  origin = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    if (req.url === '/start') return void res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'token=t1; Path=/' }).end(PAGE)
    if (req.url === '/needs') {
      const ok = (req.headers.cookie ?? '').includes('token=t1')
      return void res.writeHead(ok ? 200 : 403, { 'content-type': 'text/html' }).end(ok ? PAGE : '<h1>Forbidden</h1>')
    }
    // A site that refuses by dropping the connection, as some bot defences do.
    if (req.url === '/reset') return void req.socket.destroy()
    if (req.url === '/hold') {
      holdCookies.push(req.headers.cookie ?? '')
      if (!holdPage) return void res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE)
      holdStarted?.()
      return
    }
    if (req.url === '/blocked') return void res.writeHead(403, { 'content-type': 'text/html' }).end('<h1>Access Denied</h1>')
    if (req.url === '/busy') return void res.writeHead(429, { 'content-type': 'text/html', 'retry-after': '1' }).end('<h1>Too many requests</h1>')
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve))
  originPort = (origin.address() as AddressInfo).port
})

afterAll(async () => {
  for (const server of [origin, ...proxies]) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

afterEach(async () => {
  await engine?.close()
  engine = null
  proxyHits.clear()
  await rm(root, { recursive: true, force: true })
})

type Item = { url: string; status: string; failureReason?: string | null; evidenceRecord?: { proxy: string | null } | null; trace?: { event: string; detail?: Record<string, unknown> }[] }

type Channels = NonNullable<Parameters<typeof createApiEngine>[0]['channelsFor']>
const httpOnly = (policy: ReturnType<typeof localNetworkPolicy>): Channels => (mode, egress) => buildChannels(mode, { networkPolicy: egress?.policy ?? policy }).filter((channel) => channel.id === 'http')

async function batch(pool: ProxyServer[], paths: string[], options: { channels?: Channels; maxConcurrency?: number; during?: () => Promise<void> } = {}): Promise<{ status: string | undefined; items: Record<string, Item> }> {
  root = await mkdtemp(join(tmpdir(), 'w2l-egress-pool-'))
  const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
  engine = createApiEngine({
    taskRoot: join(root, 'tasks'),
    networkPolicy: policy,
    accessGrant: accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities: ['egress_sessions'] })),
    egressProxies: pool,
    channelsFor: options.channels ?? httpOnly(policy),
  })
  // A name only the proxies resolve: a request that skipped its egress could not reach the site.
  const site = `http://site.test:${originPort}`
  const { taskId } = await engine.startBatch({ urls: paths.map((path) => `${site}${path}`), maxConcurrency: options.maxConcurrency ?? 1 } as Parameters<ApiEngine['startBatch']>[0])
  await options.during?.()
  let report = await engine.getBatch(taskId)
  for (let i = 0; i < 1000 && (report === null || ['pending', 'running'].includes(report.status)); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    report = await engine.getBatch(taskId)
  }
  const items = (await engine.getBatchItems(taskId, { limit: 10, debug: true }))!.items as unknown as Item[]
  return { status: report?.status, items: Object.fromEntries(items.map((item) => [new URL(item.url).pathname, item])) }
}

const switched = (item: Item) => item.trace?.filter((event) => event.event === 'egress_switched').map((event) => event.detail)

describe('a task on egress proxies', () => {
  it('moves off an egress that refuses connections, reads the page again there, and keeps one session per egress', async () => {
    const dead = await deadProxy()
    const live = await liveProxy()
    const { status, items } = await batch([dead, live], ['/start', '/needs'])
    expect(status).toBe('completed')
    expect(items['/start']).toMatchObject({ status: 'success' })
    expect(switched(items['/start']!)).toEqual([{ from: dead.endpoint, to: live.endpoint, reason: 'unreachable', switches: 1 }])
    // The cookie the page set on the new egress reached the next page there.
    expect(items['/needs']).toMatchObject({ status: 'success' })
    expect(switched(items['/needs']!)).toEqual([])
    expect(items['/needs']!.evidenceRecord?.proxy).toBe(live.endpoint)
    expect(proxyHits.get(live.endpoint)).toBeGreaterThan(0)
  })

  it('never moves on a site\'s own answer: a 429 stays on its egress', async () => {
    const first = await liveProxy()
    const second = await liveProxy()
    const { items } = await batch([first, second], ['/busy', '/start'])
    expect(items['/busy']!.status).not.toBe('success')
    expect(switched(items['/busy']!)).toEqual([])
    expect(items['/start']!.evidenceRecord?.proxy).toBe(items['/busy']!.evidenceRecord?.proxy ?? first.endpoint)
    expect(proxyHits.get(second.endpoint) ?? 0).toBe(0)
  })

  it('never moves when the site drops the connection: its proxy answers its probe', async () => {
    const first = await liveProxy()
    const second = await liveProxy()
    const { items } = await batch([first, second], ['/reset'])
    expect(items['/reset']).toMatchObject({ status: 'failed' })
    expect(switched(items['/reset']!)).toEqual([])
    expect(proxyHits.get(second.endpoint) ?? 0).toBe(0)
  })

  it('never moves after a rung got an answer: a 403, then another rung\'s dropped connection', async () => {
    const first = await liveProxy()
    const second = await liveProxy()
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    // A stand-in browser rung that ends as a dropped connection, after the http rung's 403.
    const channels: Channels = (mode, egress) => [...httpOnly(policy)(mode, egress), { id: 'browser_local', waitsFor: true, identity: buildChannels(mode, { networkPolicy: policy })[0]!.identity, fetch: async (url: string) => ({ requestedUrl: url, status: 'failed', failureReason: 'connection_error', blockReason: null, budgetExceeded: null, lane: 'browser_local', escalations: [], markdown: null, truncated: false, truncatedAt: null, compliance: null, evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] }, usage: { wallMs: 1, bytesWire: 0, bytesDecompressed: 0, requestCount: 1, attemptCount: 1, contentTokens: null, browserMs: 1, externalCostUsd: 0 }, trace: [{ at: 1, lane: 'browser_local', event: 'navigate_failed', detail: { error: 'net::ERR_CONNECTION_RESET' } }] } as FetchResult) }]
    const { items } = await batch([first, second], ['/blocked'], { channels })
    expect(items['/blocked']!.status).not.toBe('success')
    expect(switched(items['/blocked']!)).toEqual([])
    expect(proxyHits.get(second.endpoint) ?? 0).toBe(0)
  })

  it('never sends one egress\'s cookies through another, with pages in flight when it fails', async () => {
    // Each proxy reaches a site of its own; the second records every Cookie it is sent.
    const second = createServer((req, res) => { cookiesAtSecond.push(req.headers.cookie ?? ''); res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE) })
    const cookiesAtSecond: string[] = []
    await new Promise<void>((resolve) => second.listen(0, '127.0.0.1', resolve))
    proxies.push(second)
    const holding: (() => void)[] = []
    const first = createServer((req, res) => {
      if (req.url === '/start') return void res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'token=first; Path=/' }).end(PAGE)
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
      // The other pages wait, so they are in flight through the first proxy when it stops.
      holding.push(() => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE))
    })
    await new Promise<void>((resolve) => first.listen(0, '127.0.0.1', resolve))
    proxies.push(first)
    const one = await liveProxy(() => (first.address() as AddressInfo).port)
    const two = await liveProxy(() => (second.address() as AddressInfo).port)
    const { items } = await batch([one, two], ['/start', '/a', '/b', '/c', '/d', '/e'], {
      maxConcurrency: 4,
      during: async () => {
        for (let i = 0; i < 200 && holding.length < 3; i++) await new Promise((resolve) => setTimeout(resolve, 20))
        await one.stop()
      },
    })
    expect(Object.values(items).filter((item) => item.evidenceRecord?.proxy === two.endpoint).length).toBeGreaterThan(0)
    expect(cookiesAtSecond.length).toBeGreaterThan(0)
    expect(cookiesAtSecond.filter((cookie) => cookie.includes('token=first'))).toEqual([])
  })

  it('switches at most twice a run, then lets the page fail', async () => {
    const pool = [await deadProxy(), await deadProxy(), await deadProxy()]
    const { items } = await batch(pool, ['/start'])
    expect(items['/start']).toMatchObject({ status: 'failed', failureReason: 'connection_error' })
    expect(switched(items['/start']!)).toEqual([
      { from: pool[0]!.endpoint, to: pool[1]!.endpoint, reason: 'unreachable', switches: 1 },
      { from: pool[1]!.endpoint, to: pool[2]!.endpoint, reason: 'unreachable', switches: 2 },
    ])
  })
})

describe('EgressPool', () => {
  it('hands out egresses in turn, skips one cooling down, and falls back to the one whose cooldown ends first', () => {
    let now = 1_000
    const [a, b, c] = egressProxies('http://a.test:1, http://b.test:2 http://c.test:3,http://a.test:1')
    const pool = new EgressPool([a!, b!, c!], localNetworkPolicy(), () => now)
    expect(pool.size).toBe(3)
    expect([pool.pick().id, pool.pick().id, pool.pick().id, pool.pick().id]).toEqual(['a.test:1', 'b.test:2', 'c.test:3', 'a.test:1'])
    pool.fail('b.test:2')
    expect([pool.pick().id, pool.pick().id]).toEqual(['c.test:3', 'a.test:1'])
    expect(pool.pick('a.test:1').id).toBe('c.test:3')
    now += 1; pool.fail('a.test:1'); now += 1; pool.fail('c.test:3')
    // Every egress cooling: the earliest to come back.
    expect(pool.pick().id).toBe('b.test:2')
    now += EGRESS_COOLDOWN_MS
    expect(pool.cooling('b.test:2')).toBe(false)
  })

  it('doubts the egress only when no rung got an answer, and probes the proxy itself', async () => {
    const failed = (httpStatus: number | null, attempts: (number | null)[] = []) => egressInDoubt({
      result: { status: 'failed', failureReason: 'connection_error', evidence: { httpStatus } } as FetchResult,
      audit: { channelsTried: [], ladderTrace: [], summary: { attempts: attempts.map((status) => ({ channel: 'http', result: { evidence: { httpStatus: status } } as FetchResult })) } } as never,
    })
    expect(failed(null)).toBe(true)
    expect(failed(null, [403, null])).toBe(false)
    expect(failed(502)).toBe(false)
    expect(egressInDoubt({ result: { status: 'blocked', evidence: { httpStatus: null } } as FetchResult })).toBe(false)
    const live = await liveProxy()
    expect(await probeEgress(live)).toBe('works')
    expect(await probeEgress(await deadProxy())).toBe('unreachable')
    const needsAuth = createServer()
    needsAuth.on('connect', (_req, socket) => socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'))
    await new Promise<void>((resolve) => needsAuth.listen(0, '127.0.0.1', resolve))
    proxies.push(needsAuth)
    expect(await probeEgress(egressProxies(`http://u:p@127.0.0.1:${(needsAuth.address() as AddressInfo).port}`)[0]!)).toBe('credentials_refused')
  })
})

describe('egress proxies and saved logins', () => {
  it('never sends mode authed through the pool: a saved login keeps its own route', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-egress-pool-'))
    const live = await liveProxy()
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const asked: (string | undefined)[] = []
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      networkPolicy: policy,
      accessGrant: accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities: ['egress_sessions'] })),
      egressProxies: [live],
      channelsFor: (mode, egress) => { asked.push(`${mode}:${egress?.id ?? 'none'}`); return httpOnly(policy)(mode, egress) },
    })
    await engine.scrape({ url: `http://127.0.0.1:${originPort}/start`, mode: 'authed' } as Parameters<ApiEngine['scrape']>[0])
    await engine.scrape({ url: `http://site.test:${originPort}/start` } as Parameters<ApiEngine['scrape']>[0])
    const { taskId } = await engine.startBatch({ urls: [`http://127.0.0.1:${originPort}/start`], mode: 'authed' } as Parameters<ApiEngine['startBatch']>[0])
    let report = await engine.getBatch(taskId)
    for (let i = 0; i < 500 && (report === null || ['pending', 'running'].includes(report.status)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      report = await engine.getBatch(taskId)
    }
    expect(report?.status).toBe('completed')
    // The batch reuses the scrape's authed rungs: none was ever built on the pool's egress.
    expect(asked).toEqual(['authed:none', `standard:${live.endpoint}`])
  })
})

describe('a task resumed on another route', () => {
  it('sends none of the cookies its old egress got when the server comes back on the environment proxy instead', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-egress-pool-'))
    const live = await liveProxy()
    const environment = await liveProxy()
    const base = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const make = (pool: ProxyServer[], policy = base) => createApiEngine({
      taskRoot: join(root, 'tasks'),
      networkPolicy: policy,
      accessGrant: accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities: ['egress_sessions'] })),
      egressProxies: pool,
      channelsFor: httpOnly(policy),
    })
    holdPage = true
    holdCookies.length = 0
    const started = new Promise<void>((resolve) => { holdStarted = resolve })
    const first = make([live])
    const site = `http://site.test:${originPort}`
    const { taskId } = await first.startBatch({ urls: [`${site}/start`, `${site}/hold`], maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
    await started
    expect(holdCookies.at(-1)).toContain('token=t1')
    expect(proxyHits.get(live.endpoint)).toBeGreaterThan(0)
    await first.close({ cancelActive: true })
    holdPage = false
    engine = make([], { ...base, egressProxy: { source: 'environment', https: environment, http: environment, noProxy: [] } })
    let report = await engine.getBatch(taskId)
    for (let i = 0; i < 500 && (report === null || ['pending', 'running', 'paused'].includes(report.status)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      report = await engine.getBatch(taskId)
    }
    expect(report?.status).toBe('completed')
    // The resumed request went out on the policy's own route, without the pool's cookies.
    expect(proxyHits.get(environment.endpoint)).toBeGreaterThan(0)
    expect(holdCookies.at(-1)).toBe('')
  })
})
