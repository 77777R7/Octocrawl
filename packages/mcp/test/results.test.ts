import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv from 'ajv'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { decodeStepCursor } from '@w2l/runtime'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'
import { RESULT_TEXT_MAX, withoutTelemetry } from '../src/results.js'
import { TOOLS } from '../src/tools.js'

/**
 * Typed results and an honest result budget (docs/mcp-client-ux-tasks.md W8): the read tools declare an outputSchema
 * and answer structuredContent equal to their text; scrape's verdict comes first; a result over RESULT_TEXT_MAX is cut
 * and says so; a page list stops at the budget with a cursor; a screenshot also comes as an image block.
 */
type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; structuredContent?: Record<string, unknown> }

async function connect(client: W2L) {
  const mcp = new Client({ name: 'results-test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([createMcpServer(client).connect(serverSide), mcp.connect(clientSide)])
  await mcp.listTools()
  return mcp
}

/** A client whose API answers each path with the body `answer` gives it. */
function apiAnswering(answer: (path: string, query: URLSearchParams) => unknown): W2L {
  return new W2L({ baseUrl: 'http://api.test', fetch: (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    return new Response(JSON.stringify(answer(url.pathname, url.searchParams)), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch })
}

// ajv's CommonJS default export, constructed as packages/api/src/structured.ts does.
const ajv = new (Ajv as unknown as new (options: { strict: boolean }) => { compile(schema: object): ((data: unknown) => boolean) & { errors?: unknown } })({ strict: false })
function expectTyped(name: string, result: ToolResult) {
  expect(result.isError, name).not.toBe(true)
  const text = result.content.find((block) => block.type === 'text')!.text!
  expect(result.structuredContent, name).toEqual(JSON.parse(text))
  const tool = TOOLS.find((t) => t.name === name) as { outputSchema?: object }
  expect(tool.outputSchema, name).toBeDefined()
  const validate = ajv.compile(tool.outputSchema!)
  expect([name, validate(result.structuredContent), validate.errors ?? null]).toEqual([name, true, null])
  return text
}

describe('MCP results against the fixture catalog', () => {
  let fixtures: FixtureServer
  let taskRoot: string
  let engine: ApiEngine
  let mcp: Client

  beforeAll(async () => {
    fixtures = await startFixtureServer()
    taskRoot = await mkdtemp(join(tmpdir(), 'w2l-mcp-results-'))
    engine = createApiEngine({
      taskRoot,
      channelsFor: (mode) => buildChannels(mode, { localSubjects: { browser_local: { fetch: async () => { throw new Error('the result fixtures stay on HTTP') } } } }),
    })
    const app = createApp(engine)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => app.request(new URL(String(input)).pathname + new URL(String(input)).search, init)) as typeof fetch })
    mcp = await connect(client)
  })

  afterAll(async () => {
    await engine.close()
    await fixtures.close()
    await rm(taskRoot, { recursive: true, force: true })
  })

  it('answers every scrape verdict as structuredContent that matches the outputSchema, with status first', async () => {
    const cases = [
      { path: '/static/article', status: 'success' },
      { path: '/block/challenge', status: 'blocked' },
      // On HTTP alone an empty page cannot be told from an unrendered one.
      { path: '/empty/legit', status: 'failed', failureReason: 'empty_unverified' },
      { path: '/error/500', status: 'failed' },
    ]
    for (const { path, status, failureReason } of cases as Array<{ path: string; status: string; failureReason?: string }>) {
      const result = (await mcp.callTool({ name: 'scrape', arguments: { url: `${fixtures.url}${path}`, fastMode: true } })) as ToolResult
      const text = expectTyped('scrape', result)
      expect([path, result.structuredContent?.status]).toEqual([path, status])
      if (failureReason !== undefined) expect([path, result.structuredContent?.failureReason]).toEqual([path, failureReason])
      expect(Object.keys(JSON.parse(text))[0], path).toBe('status')
    }
    const failedCheck = (await mcp.callTool({ name: 'scrape', arguments: { url: `${fixtures.url}/static/article`, fastMode: true, verify: { checks: [{ type: 'markdownIncludes', text: 'zzz-not-on-the-page' }] } } })) as ToolResult
    expectTyped('scrape', failedCheck)
    expect((failedCheck.structuredContent?.verification as { status: string }).status).toBe('failed')
    const keys = Object.keys(failedCheck.structuredContent!)
    expect(keys.indexOf('verification')).toBeLessThan(keys.indexOf('markdown'))
  })

  it('types the crawl and batch tools from start to pages', async () => {
    const crawl = (await mcp.callTool({ name: 'crawl', arguments: { url: `${fixtures.url}/crawl/listing`, crawlEntireDomain: true, sitemap: 'skip', maxPages: 10 } })) as ToolResult
    expectTyped('crawl', crawl)
    const id = crawl.structuredContent!.taskId as string
    for (let i = 0; i < 200; i++) {
      const status = (await mcp.callTool({ name: 'get_crawl', arguments: { id } })) as ToolResult
      expectTyped('get_crawl', status)
      if (status.structuredContent!.status === 'completed') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expectTyped('get_crawl_pages', (await mcp.callTool({ name: 'get_crawl_pages', arguments: { id } })) as ToolResult)

    const batch = (await mcp.callTool({ name: 'batch_scrape', arguments: { urls: [`${fixtures.url}/crawl/item/1`, `${fixtures.url}/crawl/item/2`] } })) as ToolResult
    expectTyped('batch_scrape', batch)
    const taskId = batch.structuredContent!.taskId as string
    expectTyped('wait_batch', (await mcp.callTool({ name: 'wait_batch', arguments: { id: taskId, timeoutMs: 20_000 } })) as ToolResult)
    expectTyped('get_batch', (await mcp.callTool({ name: 'get_batch', arguments: { id: taskId } })) as ToolResult)
    expectTyped('get_batch_items', (await mcp.callTool({ name: 'get_batch_items', arguments: { id: taskId } })) as ToolResult)
  })
})

describe('MCP result budget', () => {
  const page = (n: number, markdown: string) => ({ id: `step-${n}`, createdAt: `2026-10-17T00:00:0${n}.000Z`, url: `https://example.com/${n}`, status: 'success', markdown })

  it('cuts an oversized scrape to the budget and says where', async () => {
    const markdown = 'word '.repeat(40_000)
    const mcp = await connect(apiAnswering(() => ({ requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', status: 'success', failureReason: null, blockReason: null, markdown, verification: { status: 'not_requested' }, readiness: { state: 'ready', basis: [] }, truncated: false, truncatedAt: null })))
    const result = (await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/' } })) as ToolResult
    const text = expectTyped('scrape', result)
    expect(text.length).toBeLessThanOrEqual(RESULT_TEXT_MAX)
    expect(result.structuredContent).toMatchObject({ truncated: true })
    const at = result.structuredContent!.truncatedAt as number
    expect(Number.isInteger(at) && at > 0 && at < markdown.length).toBe(true)
    expect(result.structuredContent!.markdown).toBe(markdown.slice(0, at))
    expect((result.structuredContent!.agentHints as string[]).at(-1)).toMatch(new RegExp(`^the markdown was cut at character ${at} .*includeTags`))
  })

  it('stops a page list at the budget and hands back the cursor after the last page it kept', async () => {
    const pages = [1, 2, 3, 4, 5].map((n) => page(n, 'x'.repeat(20_000)))
    const mcp = await connect(apiAnswering(() => ({ items: pages, nextCursor: null, hasMore: false })))
    for (const name of ['get_crawl_pages', 'get_batch_items']) {
      const result = (await mcp.callTool({ name, arguments: { id: 'task-1' } })) as ToolResult
      const text = expectTyped(name, result)
      expect(text.length, name).toBeLessThanOrEqual(RESULT_TEXT_MAX)
      const list = result.structuredContent as { items: Array<{ id: string; createdAt: string }>; nextCursor: string; hasMore: boolean; stoppedBy: string }
      expect(list.items.length, name).toBeGreaterThan(0)
      expect(list.items.length, name).toBeLessThan(pages.length)
      expect({ hasMore: list.hasMore, stoppedBy: list.stoppedBy }, name).toEqual({ hasMore: true, stoppedBy: 'size' })
      const last = list.items.at(-1)!
      expect(decodeStepCursor(list.nextCursor), name).toEqual({ createdAt: last.createdAt, id: last.id })
    }
  })

  const scrapeAnswering = (fields: Record<string, unknown>) => apiAnswering(() => ({ requestedUrl: 'https://example.com/', status: 'success', failureReason: null, blockReason: null, verification: { status: 'not_requested' }, truncated: false, truncatedAt: null, ...fields }))

  it('cuts rawHtml before markdown, and keeps the markdown whole when that is enough', async () => {
    const markdown = 'word '.repeat(2_000)
    const mcp = await connect(scrapeAnswering({ markdown, rawHtml: '<p>x</p>'.repeat(15_000) }))
    const result = (await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/', formats: ['markdown', 'rawHtml'] } })) as ToolResult
    const text = expectTyped('scrape', result)
    expect(text.length).toBeLessThanOrEqual(RESULT_TEXT_MAX)
    expect(result.structuredContent!.markdown).toBe(markdown)
    const at = result.structuredContent!.truncatedAt as number
    expect(at).toBeGreaterThan(0)
    expect((result.structuredContent!.rawHtml as string).length).toBe(at)
    expect((result.structuredContent!.agentHints as string[]).at(-1)).toMatch(new RegExp(`^the rawHtml was cut at character ${at} `))
  })

  it('keeps as much of a heavily escaped body as fits', async () => {
    const markdown = '"\\\n'.repeat(30_000)
    const mcp = await connect(scrapeAnswering({ markdown }))
    const result = (await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/' } })) as ToolResult
    const text = expectTyped('scrape', result)
    expect(text.length).toBeLessThanOrEqual(RESULT_TEXT_MAX)
    expect(text.length).toBeGreaterThan(RESULT_TEXT_MAX - 10)
  })

  it('counts page screenshots in a list, which stops before a page rather than cutting a capture', async () => {
    const shot = { contentType: 'image/png', sha256: 'a'.repeat(64), base64: 'A'.repeat(30_000) }
    const pages = [1, 2, 3].map((n) => ({ ...page(n, 'hello'), screenshot: shot }))
    const mcp = await connect(apiAnswering(() => ({ items: pages, nextCursor: null, hasMore: false })))
    const result = (await mcp.callTool({ name: 'get_batch_items', arguments: { id: 'task-1' } })) as ToolResult
    const text = expectTyped('get_batch_items', result)
    expect(text.length).toBeLessThanOrEqual(RESULT_TEXT_MAX)
    expect((result.structuredContent!.items as unknown[]).length).toBe(1)
  })

  it('stays within the budget when the pages kept fill it exactly', async () => {
    // Two pages that alone come to the budget: the cursor the answer adds must not push it over.
    const empty = JSON.stringify({ items: [page(1, ''), page(2, '')], nextCursor: null, hasMore: false }).length
    const fill = Math.floor((RESULT_TEXT_MAX - empty) / 2)
    const pages = [page(1, 'x'.repeat(fill)), page(2, 'x'.repeat(fill)), page(3, 'x')]
    const mcp = await connect(apiAnswering(() => ({ items: pages, nextCursor: null, hasMore: false })))
    for (const name of ['get_crawl_pages', 'get_batch_items']) {
      const text = expectTyped(name, (await mcp.callTool({ name, arguments: { id: 'task-1' } })) as ToolResult)
      expect(text.length, name).toBeLessThanOrEqual(RESULT_TEXT_MAX)
    }
  })

  it('answers a screenshot as an image block beside the text', async () => {
    const base64 = Buffer.from('not really a png').toString('base64')
    const screenshot = { contentType: 'image/png', width: 10, height: 10, fullPage: false, viewport: { width: 10, height: 10 }, deviceScaleFactor: 1, quality: null, bytes: 16, sha256: 'a'.repeat(64), path: null, base64 }
    const mcp = await connect(apiAnswering(() => ({ requestedUrl: 'https://example.com/', status: 'success', failureReason: null, blockReason: null, markdown: 'hi', screenshot, verification: { status: 'not_requested' }, truncated: false, truncatedAt: null })))
    const result = (await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/', formats: ['markdown', 'screenshot'] } })) as ToolResult
    expectTyped('scrape', result)
    expect(result.content.filter((block) => block.type === 'image')).toEqual([{ type: 'image', data: base64, mimeType: 'image/png' }])
    // Deprecated for one release (D11): the JSON still carries the base64.
    expect((result.structuredContent!.screenshot as { base64: string; sha256: string }).sha256).toBe('a'.repeat(64))
  })
})

describe('withoutTelemetry: hosted results without telemetry, internal ids or campaign tags', () => {
  it('drops a scrape\'s usage, lanes tried and record id, keeps the page and its Evidence Record, and untags its hints', () => {
    const result = {
      status: 'success', markdown: '# Tides', channelsTried: ['http'], usage: { wallMs: 12, timings: { totalMs: 12 } },
      evidenceRecord: { finalUrl: 'https://example.com/', fetchedAt: '2026-10-18T00:00:00.000Z', rawSha256: 'ab' },
      metadata: { title: 'Tides', statusCode: 200, scrapeId: 'id-1', concurrencyLimited: false, concurrencyQueueDurationMs: 0 },
      agentHints: ['run Octocrawl on your computer (https://octocrawl.dev/docs/connect-mcp/?utm_source=hosted&utm_medium=hint)'],
    }
    expect(withoutTelemetry('scrape', result, {})).toEqual({
      status: 'success', markdown: '# Tides',
      evidenceRecord: { finalUrl: 'https://example.com/', fetchedAt: '2026-10-18T00:00:00.000Z', rawSha256: 'ab' },
      metadata: { title: 'Tides', statusCode: 200 },
      agentHints: ['run Octocrawl on your computer (https://octocrawl.dev/docs/connect-mcp/)'],
    })
    // debug is the caller asking for the full audit.
    expect(withoutTelemetry('scrape', result, { debug: true })).toBe(result)
  })

  it('drops a map\'s record id, and leaves other tools alone', () => {
    expect(withoutTelemetry('map', { id: 'map-1', status: 'completed', links: [] }, {})).toEqual({ status: 'completed', links: [] })
    const other = { taskId: 't1', status: 'running' }
    expect(withoutTelemetry('get_crawl', other, {})).toBe(other)
  })
})
