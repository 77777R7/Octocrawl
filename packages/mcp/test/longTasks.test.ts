import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { createMcpServer, type McpServerOptions } from '../src/server.js'
import { callTool } from '../src/tools.js'

/**
 * Long tasks over MCP (docs/mcp-client-ux-tasks.md W9): a crawl has a page cap unless the caller sets one, a scrape
 * that does not wait for the person stops in 120 s, wait_crawl waits on its own timer, and a wait reports progress.
 */
type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown> }
type Progress = { progress: number; total?: number; message?: string }

async function connect(client: W2L, options: McpServerOptions = {}) {
  const mcp = new Client({ name: 'long-tasks-test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([createMcpServer(client, options).connect(serverSide), mcp.connect(clientSide)])
  return mcp
}

/** A client whose API answers from `answer`, recording each request's path and body. */
function apiAnswering(answer: (path: string, body: unknown) => unknown | Promise<unknown>, calls: Array<{ path: string; body: unknown }> = []): W2L {
  return new W2L({ baseUrl: 'http://api.test', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))
    calls.push({ path, body })
    return new Response(JSON.stringify(await answer(path, body)), { status: path.endsWith('/v1/crawl') ? 202 : 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch })
}

describe('a local crawl over MCP', () => {
  let site: Server
  let origin: string
  let taskRoot: string
  let engine: ApiEngine
  let client: W2L
  const PAGES = 130

  beforeAll(async () => {
    // A start page linking to more pages than the default cap.
    site = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
      const links = req.url === '/' ? Array.from({ length: PAGES }, (_, n) => `<li><a href="/p/${n + 1}">Page ${n + 1}</a></li>`).join('') : ''
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>${req.url}</title></head><body><main><h1>Page ${req.url}</h1><p>${'Some words about this page. '.repeat(20)}</p><ul>${links}</ul></main></body></html>`)
    })
    site.listen(0, '127.0.0.1'); await once(site, 'listening')
    origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
    taskRoot = await mkdtemp(join(tmpdir(), 'w2l-mcp-long-'))
    engine = createApiEngine({
      taskRoot,
      channelsFor: (mode) => buildChannels(mode, { localSubjects: { browser_local: { fetch: async () => { throw new Error('the crawl stays on HTTP') } } } }),
    })
    const app = createApp(engine)
    client = new W2L({ baseUrl: 'http://w2l.test', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => app.request(new URL(String(input)).pathname + new URL(String(input)).search, init)) as typeof fetch })
  })

  afterAll(async () => {
    await engine.close()
    site.closeAllConnections()
    await new Promise<void>((done) => site.close(() => done()))
    await rm(taskRoot, { recursive: true, force: true })
  })

  const crawl = async (args: Record<string, unknown>) => {
    const started = (await callTool(client, 'crawl', { url: `${origin}/`, sitemap: 'skip', fastMode: true, ...args })) as { taskId: string; maxPages?: number }
    const report = (await callTool(client, 'wait_crawl', { id: started.taskId, timeoutMs: 60_000 })) as { status: string; pagesFetched: number }
    return { started, report }
  }

  it('fetches at most 100 pages when the call leaves maxPages out, and says so', async () => {
    const { started, report } = await crawl({})
    expect(started.maxPages).toBe(100)
    expect(report.status).toBe('completed')
    expect(report.pagesFetched).toBe(100)
  }, 90_000)

  it('keeps an explicit null as the server\'s default, which on a local server is no cap', async () => {
    const { started, report } = await crawl({ maxPages: null })
    expect(started).not.toHaveProperty('maxPages')
    expect(report.status).toBe('completed')
    expect(report.pagesFetched).toBe(PAGES + 1)
  }, 90_000)
})

describe('MCP defaults for a scrape', () => {
  it('stops a scrape in 120 s unless the call sets timeout or waits for the person', async () => {
    const calls: Array<{ path: string; body: unknown }> = []
    const client = apiAnswering(() => ({ status: 'success' }), calls)
    await callTool(client, 'scrape', { url: 'https://example.com/' })
    await callTool(client, 'scrape', { url: 'https://example.com/', timeout: 200_000 })
    await callTool(client, 'scrape', { url: 'https://example.com/', lane: 'my-browser' })
    await callTool(client, 'scrape', { url: 'https://example.com/', handoff: true })
    // A read that waits for the person sends no timeout: the server's default, 300 s, applies.
    expect(calls.map((call) => (call.body as { timeout?: number }).timeout)).toEqual([120_000, 200_000, undefined, undefined])
  })
})

describe('wait_crawl', () => {
  const running = (pagesFetched: number) => ({ taskId: 'crawl-1', status: 'running', pagesFetched })

  it('answers the finished report', async () => {
    let polls = 0
    const client = apiAnswering(() => (++polls < 3 ? running(polls) : { taskId: 'crawl-1', status: 'completed', pagesFetched: 3 }))
    expect(await callTool(client, 'wait_crawl', { id: 'crawl-1' })).toMatchObject({ status: 'completed', pagesFetched: 3 })
  })

  it('answers the report so far at its timeout, with the next step', async () => {
    const client = apiAnswering(() => running(2))
    const report = (await callTool(client, 'wait_crawl', { id: 'crawl-1', timeoutMs: 50 })) as { status: string; agentHints: string[] }
    expect(report.status).toBe('running')
    expect(report.agentHints.at(-1)).toMatch(/wait_crawl again, or read get_crawl_pages/)
  })

  it('stops polling when the call is cancelled', async () => {
    let polls = 0
    const client = apiAnswering(() => { polls++; return running(1) })
    const cancel = new AbortController()
    const waiting = callTool(client, 'wait_crawl', { id: 'crawl-1', timeoutMs: 60_000 }, { signal: cancel.signal })
    await vi.waitFor(() => expect(polls).toBeGreaterThanOrEqual(2))
    cancel.abort()
    await expect(waiting).rejects.toThrow()
    const seen = polls
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(polls).toBe(seen)
  })

  it('refuses a timeoutMs over 120000, as wait_batch does', async () => {
    const client = apiAnswering(() => running(1))
    for (const name of ['wait_crawl', 'wait_batch']) await expect(callTool(client, name, { id: 'x', timeoutMs: 120_001 }), name).rejects.toThrow('timeoutMs must be an integer between 1 and 120000')
  })
})

describe('progress notifications', () => {
  /** A batch that finishes one more page at each status read, of `requested`. */
  function growingBatch(requested: number) {
    let completed = 0
    return apiAnswering(() => {
      completed = Math.min(requested, completed + 1)
      return { taskId: 'batch-1', status: completed === requested ? 'completed' : 'running', requested, completed, remaining: requested - completed }
    })
  }

  it('reports a wait\'s progress, growing, at most every interval, and nothing after the answer', async () => {
    const mcp = await connect(growingBatch(30), { progress: { everyMs: 100, heartbeatMs: 1_000 } })
    const updates: Array<Progress & { at: number }> = []
    let answeredAt = Infinity
    const result = (await mcp.callTool({ name: 'wait_batch', arguments: { id: 'batch-1', timeoutMs: 60_000 } }, undefined, { onprogress: (update) => updates.push({ ...update, at: Date.now() }) })) as ToolResult
    answeredAt = Date.now()
    expect(result.structuredContent).toMatchObject({ status: 'completed' })
    expect(updates.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i]!.progress).toBeGreaterThan(updates[i - 1]!.progress)
      expect(updates[i]!.at - updates[i - 1]!.at).toBeGreaterThanOrEqual(90)
    }
    expect(updates[0]).toMatchObject({ total: 30, message: expect.stringMatching(/^\d+\/30 pages done$/) })
    const count = updates.length
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(updates).toHaveLength(count)
    expect(updates.every((update) => update.at <= answeredAt)).toBe(true)
    await mcp.close()
  })

  it('sends a heartbeat that says what the person should do while a call waits for them', async () => {
    const client = apiAnswering(() => new Promise((resolve) => setTimeout(() => resolve({ domain: 'example.com', savedAt: 'now', cookieCount: 1 }), 400)))
    const mcp = await connect(client, { progress: { everyMs: 100, heartbeatMs: 100 } })
    const updates: Progress[] = []
    await mcp.callTool({ name: 'import_login', arguments: { site: 'example.com' } }, undefined, { onprogress: (update) => updates.push(update) })
    expect(updates.length).toBeGreaterThanOrEqual(2)
    expect(updates[0]!.message).toMatch(/^waiting for the person to allow Octocrawl in their Chrome/)
    for (let i = 1; i < updates.length; i++) expect(updates[i]!.progress).toBeGreaterThan(updates[i - 1]!.progress)
    await mcp.close()
  })

  it('sends nothing when the server is not set to, as on the 2025-era JSON path', async () => {
    const mcp = await connect(growingBatch(5))
    const updates: Progress[] = []
    await mcp.callTool({ name: 'wait_batch', arguments: { id: 'batch-1' } }, undefined, { onprogress: (update) => updates.push(update) })
    expect(updates).toEqual([])
    await mcp.close()
  })
})
