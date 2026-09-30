import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { BatchStatusResponse, ExecutionContext, ScrapeRequest, ScrapeResponse } from '@w2l/contracts'
import { createHostedService } from '../src/host.js'
import { createLocalService } from '../src/localHost.js'
import { clientScope, InFlightCalls } from '../src/inFlight.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

async function freePort(): Promise<number> {
  const probe = createServer()
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>(done => probe.close(() => done()))
  return port
}

/** Raw Streamable HTTP, so each test chooses the request ids, sessions and tokens a real client would send. */
function mcpClient(url: string, headers: Record<string, string> = {}) {
  const post = (body: unknown, session: string | null, signal?: AbortSignal) => fetch(url, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers, ...(session === null ? {} : { 'mcp-session-id': session }) },
    body: JSON.stringify(body),
  })
  return {
    /** Initializes like an MCP client and returns the session id the service assigned (null when none). */
    async initialize(): Promise<string | null> {
      const res = await post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'w2l-test', version: '1.0.0' } } }, null)
      expect(res.status).toBe(200)
      await res.json()
      const session = res.headers.get('mcp-session-id')
      expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session)).status).toBe(202)
      return session
    },
    call: (session: string | null, id: number, name: string, args: unknown, signal?: AbortSignal) =>
      post({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, session, signal),
    async cancel(session: string | null, requestId: number): Promise<void> {
      expect((await post({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId, reason: 'test cancel' } }, session)).status).toBe(202)
    },
  }
}

const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** A site whose pages never answer: a scrape of one waits for it until its timeout. */
async function silentSite(): Promise<{ origin: string; opened: string[]; closed: string[] }> {
  const opened: string[] = []
  const closed: string[] = []
  const site: Server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
    opened.push(req.url ?? '')
    res.once('close', () => closed.push(req.url ?? ''))
  })
  site.listen(0, '127.0.0.1'); await once(site, 'listening')
  cleanup.push(async () => { site.closeAllConnections(); await new Promise<void>(done => site.close(() => done())) })
  return { origin: `http://127.0.0.1:${(site.address() as AddressInfo).port}`, opened, closed }
}

async function localService() {
  const port = await freePort()
  const root = await mkdtemp(join(tmpdir(), 'w2l-local-cancel-'))
  const service = createLocalService({ taskRoot: root, port })
  cleanup.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }) })
  if (!service.server.listening) await once(service.server, 'listening')
  return mcpClient(`http://127.0.0.1:${port}/mcp`)
}

it('stops a local scrape when its own client cancels the call, and not on another client\'s cancel of the same id', async () => {
  const site = await silentSite()
  const local = await localService()
  const mine = await local.initialize()
  const other = await local.initialize()
  const calling = local.call(mine, 7, 'scrape', { url: `${site.origin}/page`, timeout: 120_000 })
  await vi.waitFor(() => expect(site.opened).toEqual(['/page']), { timeout: 10_000 })
  // Request ids are the client's own: another client, or one with no session, names the same id.
  await local.cancel(other, 7)
  await local.cancel(null, 7)
  await settle(1_000)
  expect(site.closed).toEqual([])
  await local.cancel(mine, 7)
  await vi.waitFor(() => expect(site.closed).toEqual(['/page']), { timeout: 5_000 })
  // The call's own POST is answered, as the Python SDK answers a cancelled request.
  expect(await (await calling).json()).toMatchObject({ jsonrpc: '2.0', id: 7, error: { code: 0, message: 'Request cancelled' } })
  // No later rung fetched the page again.
  await settle(500)
  expect(site.opened).toEqual(['/page'])
  // Each client got its own session id at initialize.
  expect(mine).toMatch(/^[0-9a-f-]{36}$/)
  expect(other).toMatch(/^[0-9a-f-]{36}$/)
  expect(other).not.toBe(mine)
})

it('stops a local scrape when its client disconnects before the result', async () => {
  const site = await silentSite()
  const local = await localService()
  const session = await local.initialize()
  const disconnect = new AbortController()
  const calling = local.call(session, 1, 'scrape', { url: `${site.origin}/page`, timeout: 120_000 }, disconnect.signal)
  await vi.waitFor(() => expect(site.opened).toEqual(['/page']), { timeout: 10_000 })
  disconnect.abort()
  await expect(calling).rejects.toThrow()
  await vi.waitFor(() => expect(site.closed).toEqual(['/page']), { timeout: 5_000 })
})

async function hostedService() {
  const port = await freePort()
  const root = await mkdtemp(join(tmpdir(), 'w2l-hosted-cancel-'))
  const amazonPublicState = JSON.stringify({ cookies: [{ name: 'i18n-prefs', value: 'SGD', domain: '.amazon.sg', path: '/', expires: -1, httpOnly: false, secure: true, sameSite: 'Lax' }], origins: [] })
  // Every token belongs to the owner: two clients of one owner, each with its own access token.
  const service = createHostedService({ mcpUrl: `https://127.0.0.1:${port}/mcp`, issuer: 'https://auth.example', ownerSubject: 'user-howard', receiverUrl: 'https://receiver.example/webhook', amazonPublicState, taskRoot: root, port, host: '127.0.0.1', verifyToken: async () => ({ sub: 'user-howard', scope: 'openid' }) })
  cleanup.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }) })
  if (!service.server.listening) await once(service.server, 'listening')
  const url = `http://127.0.0.1:${port}/mcp`
  return { engine: service.engine, a: mcpClient(url, { authorization: 'Bearer token-a' }), b: mcpClient(url, { authorization: 'Bearer token-b' }) }
}

it('stops a hosted call on its own bearer token\'s cancel or disconnect, never on another token\'s', async () => {
  const { engine, a, b } = await hostedService()
  // The API request of each scrape runs until its signal aborts, then answers as a stopped scrape.
  const started: string[] = []
  const aborted: string[] = []
  vi.spyOn(engine, 'scrape').mockImplementation((req: ScrapeRequest, context?: ExecutionContext) => new Promise(resolve => {
    started.push(req.url)
    context?.signal?.addEventListener('abort', () => { aborted.push(req.url); resolve({ requestedUrl: req.url, status: 'failed', failureReason: 'timeout' } as unknown as ScrapeResponse) }, { once: true })
  }))
  const sessionA = await a.initialize()
  const sessionB = await b.initialize()
  const product = (n: number) => `https://www.amazon.sg/dp/B00000000${n}`

  const first = a.call(sessionA, 1, 'scrape', { url: product(1) })
  await vi.waitFor(() => expect(started).toEqual([product(1)]))
  await b.cancel(sessionA, 1) // another token that learned the session id
  await a.cancel(sessionB, 1) // the right token in another session
  await a.cancel(null, 1)
  await settle(500)
  expect(aborted).toEqual([])
  await a.cancel(sessionA, 1)
  await vi.waitFor(() => expect(aborted).toEqual([product(1)]))
  expect(await (await first).json()).toMatchObject({ id: 1, error: { code: 0, message: 'Request cancelled' } })

  // A client that sends no session id is scoped by its token alone.
  const second = a.call(null, 2, 'scrape', { url: product(2) })
  await vi.waitFor(() => expect(started).toHaveLength(2))
  await b.cancel(null, 2)
  await settle(500)
  expect(aborted).toEqual([product(1)])
  await a.cancel(null, 2)
  await vi.waitFor(() => expect(aborted).toEqual([product(1), product(2)]))
  expect(await (await second).json()).toMatchObject({ id: 2, error: { code: 0, message: 'Request cancelled' } })

  const disconnect = new AbortController()
  const third = a.call(sessionA, 3, 'scrape', { url: product(3) }, disconnect.signal)
  await vi.waitFor(() => expect(started).toHaveLength(3))
  disconnect.abort()
  await expect(third).rejects.toThrow()
  await vi.waitFor(() => expect(aborted).toEqual([product(1), product(2), product(3)]))
  expect(sessionA).toMatch(/^[0-9a-f-]{36}$/)
  expect(sessionB).not.toBe(sessionA)
})

it('stops a hosted wait_batch when its client cancels the call; the batch goes on', async () => {
  const { engine, a } = await hostedService()
  let polls = 0
  vi.spyOn(engine, 'getBatch').mockImplementation(async taskId => { polls++; return { taskId, status: 'running', requested: 2, completed: 0, remaining: 2 } as unknown as BatchStatusResponse })
  const cancelBatch = vi.spyOn(engine, 'cancelBatch')
  const session = await a.initialize()
  const waiting = a.call(session, 1, 'wait_batch', { id: 'batch-1', timeoutMs: 30_000 })
  await vi.waitFor(() => expect(polls).toBeGreaterThanOrEqual(2), { timeout: 5_000 })
  const cancelledAt = Date.now()
  await a.cancel(session, 1)
  expect(await (await waiting).json()).toMatchObject({ id: 1, error: { code: 0, message: 'Request cancelled' } })
  expect(Date.now() - cancelledAt).toBeLessThan(2_000)
  const seen = polls
  await settle(1_200)
  expect(polls).toBe(seen)
  expect(cancelBatch).not.toHaveBeenCalled()
})

it('stops a scrape over HTTP when the MCP SDK client cancels its call', async () => {
  const site = await silentSite()
  const port = await freePort()
  const root = await mkdtemp(join(tmpdir(), 'w2l-local-cancel-'))
  const service = createLocalService({ taskRoot: root, port })
  cleanup.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }) })
  if (!service.server.listening) await once(service.server, 'listening')
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  const client = new Client({ name: 'w2l-test', version: '1.0.0' })
  await client.connect(transport)
  cleanup.push(() => client.close())
  const stop = new AbortController()
  const calling = client.callTool({ name: 'scrape', arguments: { url: `${site.origin}/page`, timeout: 120_000 } }, undefined, { signal: stop.signal })
  await vi.waitFor(() => expect(site.opened).toEqual(['/page']), { timeout: 10_000 })
  stop.abort()
  await expect(calling).rejects.toThrow()
  await vi.waitFor(() => expect(site.closed).toEqual(['/page']), { timeout: 5_000 })
  // The client kept the session id it was given and sent it with the cancellation.
  expect(transport.sessionId).toMatch(/^[0-9a-f-]{36}$/)
})

describe('InFlightCalls', () => {
  it('keeps a call only while it runs, reaches it only from its own scope, and holds at most its limit', () => {
    const calls = new InFlightCalls(2)
    const first = calls.open('scope-a').begin(1)
    const second = calls.open('scope-a').begin('1')
    expect(calls.size).toBe(2)
    // Past the limit a call is not registered: only its own POST can stop it.
    const post = calls.open('scope-a')
    const third = post.begin(2)
    expect(calls.size).toBe(2)
    calls.open('scope-b').cancel(1)
    expect(first.signal.aborted).toBe(false)
    calls.open('scope-a').cancel(1)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false) // the string id "1" is another request
    calls.open('scope-a').cancel(2)
    expect(third.signal.aborted).toBe(false)
    post.abortAll(new Error('disconnected'))
    expect(third.signal.aborted).toBe(true)
    first.end(); second.end(); third.end()
    expect(calls.size).toBe(0)
  })

  it('without a scope, reaches a call only from its own POST', () => {
    const calls = new InFlightCalls()
    const post = calls.open(null)
    const call = post.begin(5)
    expect(calls.size).toBe(0)
    calls.open(null).cancel(5)
    expect(call.signal.aborted).toBe(false)
    post.cancel(5)
    expect(call.signal.aborted).toBe(true)
    call.end()
  })

  it('scopes a client by its identity and session, and has none with neither', () => {
    expect(clientScope([], null)).toBeNull()
    const scopes = [clientScope([], 's1'), clientScope([], 's2'), clientScope(['token-a'], null), clientScope(['token-a'], 's1'), clientScope(['token-b'], 's1')]
    expect(new Set(scopes).size).toBe(5)
    expect(scopes.join()).not.toContain('token')
  })
})
