import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localNetworkPolicy } from '@w2l/contracts'
import { accessGrantFromText } from '@w2l/http-core'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * ADR 0005 `egress_sessions` in the engine: a batch under a grant that names it keeps the cookies its
 * pages set and sends them to their site on its later pages; without the grant nothing changes. The
 * cookie values reach no stored step, and no page read with them is cached.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p></article></body></html>`
const TOKEN = 'batch-token-5d1e'
let server: Server
let origin: string
let root: string
let engine: ApiEngine | null = null

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    if (req.url === '/start') return void res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': `token=${TOKEN}; Path=/` }).end(PAGE)
    if (req.url === '/needs') {
      const ok = (req.headers.cookie ?? '').includes(`token=${TOKEN}`)
      return void res.writeHead(ok ? 200 : 403, { 'content-type': 'text/html' }).end(ok ? PAGE : '<h1>Forbidden</h1>')
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(async () => {
  await engine?.close()
  engine = null
  await rm(root, { recursive: true, force: true })
})

async function batch(capabilities: string[]) {
  root = await mkdtemp(join(tmpdir(), 'w2l-egress-'))
  const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
  engine = createApiEngine({
    taskRoot: join(root, 'tasks'),
    networkPolicy: policy,
    accessGrant: accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities })),
    channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'http'),
  })
  // maxAge asks the cache to keep pages: a page read with the session's cookies must not be kept.
  const { taskId } = await engine.startBatch({ urls: [`${origin}/start`, `${origin}/needs`], maxConcurrency: 1, maxAge: 3_600_000 } as Parameters<ApiEngine['startBatch']>[0])
  let report = await engine.getBatch(taskId)
  for (let i = 0; i < 200 && (report === null || ['pending', 'running'].includes(report.status)); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    report = await engine.getBatch(taskId)
  }
  const items = (await engine.getBatchItems(taskId, { limit: 10, debug: true }))!.items
  return { report, items: Object.fromEntries(items.map((item) => [new URL(item.url).pathname, item])) as Record<string, Record<string, unknown> & { status: string; trace?: { event: string; detail?: Record<string, unknown> }[] }> }
}

describe('egress_sessions: a batch keeps its cookies for its site', () => {
  it('sends the cookie the first page set to the second, only under a grant that names egress_sessions', async () => {
    const without = await batch([])
    expect(without.items['/needs']).toMatchObject({ status: 'failed' })
    // Without a session the first page is cached, as maxAge asks.
    expect(JSON.stringify(without.items['/start'])).toContain('cache_stored')
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })

    const { report, items } = await batch(['egress_sessions'])
    expect(report).toMatchObject({ status: 'completed', completed: 2 })
    expect(items['/needs']).toMatchObject({ status: 'success' })
    const counts = items['/needs']!.trace?.find((event) => event.event === 'session_cookies')?.detail
    expect(counts).toMatchObject({ requestsWithCookies: 1 })
    // The same session served both pages of the task.
    expect(items['/start']!.trace?.find((event) => event.event === 'session_cookies')?.detail?.session).toBe(counts?.session)
    expect(JSON.stringify(items)).not.toContain(TOKEN)
    // No page read with the session was cached.
    expect(JSON.stringify(items)).not.toContain('cache_stored')
  })
})
