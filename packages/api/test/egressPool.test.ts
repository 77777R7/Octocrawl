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
import { EGRESS_COOLDOWN_MS, EgressPool, egressFailed } from '../src/egressPool.js'

/**
 * Egress proxies (W2L_EGRESS_PROXIES, ADR 0005 egress_sessions): a task keeps one egress, switches only
 * when it fails at the connection (at most twice, with a new cookie session), and never on a site's answer.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p></article></body></html>`
let origin: Server
let originPort: number
const proxies: Server[] = []
const proxyHits = new Map<string, number>()
let root: string
let engine: ApiEngine | null = null

/** A forward proxy that sends every request, tunnel or plain, to the origin server, and counts them. */
async function liveProxy(): Promise<ProxyServer> {
  const proxy = createServer((req, res) => {
    const endpoint = `127.0.0.1:${(proxy.address() as AddressInfo).port}`
    proxyHits.set(endpoint, (proxyHits.get(endpoint) ?? 0) + 1)
    const target = new URL(req.url ?? '/')
    const forward = httpRequest({ host: '127.0.0.1', port: originPort, path: target.pathname, method: req.method, headers: req.headers }, (answer) => { res.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(res) })
    req.pipe(forward)
  })
  proxy.on('connect', (req, socket) => {
    const endpoint = `127.0.0.1:${(proxy.address() as AddressInfo).port}`
    proxyHits.set(endpoint, (proxyHits.get(endpoint) ?? 0) + 1)
    const upstream = connect(originPort, '127.0.0.1', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); upstream.pipe(socket); socket.pipe(upstream) })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  proxies.push(proxy)
  return egressProxies(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`)[0]!
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

async function batch(pool: ProxyServer[], paths: string[]): Promise<{ status: string | undefined; items: Record<string, Item> }> {
  root = await mkdtemp(join(tmpdir(), 'w2l-egress-pool-'))
  const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
  engine = createApiEngine({
    taskRoot: join(root, 'tasks'),
    networkPolicy: policy,
    accessGrant: accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities: ['egress_sessions'] })),
    egressProxies: pool,
    channelsFor: (mode, egress) => buildChannels(mode, { networkPolicy: egress?.policy ?? policy }).filter((channel) => channel.id === 'http'),
  })
  // A name only the proxies resolve: a request that skipped its egress could not reach the site.
  const site = `http://site.test:${originPort}`
  const { taskId } = await engine.startBatch({ urls: paths.map((path) => `${site}${path}`), maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
  let report = await engine.getBatch(taskId)
  for (let i = 0; i < 300 && (report === null || ['pending', 'running'].includes(report.status)); i++) {
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
    expect(switched(items['/start']!)).toEqual([{ from: dead.endpoint, to: live.endpoint, reason: 'connection_error', switches: 1 }])
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

  it('switches at most twice a run, then lets the page fail', async () => {
    const pool = [await deadProxy(), await deadProxy(), await deadProxy()]
    const { items } = await batch(pool, ['/start'])
    expect(items['/start']).toMatchObject({ status: 'failed', failureReason: 'connection_error' })
    expect(switched(items['/start']!)).toEqual([
      { from: pool[0]!.endpoint, to: pool[1]!.endpoint, reason: 'connection_error', switches: 1 },
      { from: pool[1]!.endpoint, to: pool[2]!.endpoint, reason: 'connection_error', switches: 2 },
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

  it('reads a failure at the connection as the egress\'s, and any HTTP answer as the site\'s', () => {
    const failed = (over: Partial<FetchResult>) => egressFailed({ status: 'failed', failureReason: 'connection_error', evidence: { httpStatus: null }, ...over } as FetchResult)
    expect(failed({})).toBe(true)
    expect(failed({ evidence: { httpStatus: 502 } } as Partial<FetchResult>)).toBe(false)
    expect(failed({ failureReason: 'timeout' })).toBe(false)
    expect(failed({ status: 'blocked', failureReason: null })).toBe(false)
  })
})
