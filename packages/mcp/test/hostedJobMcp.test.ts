import { afterEach, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { createHostedApi, HOSTED_JOB_TOOLS, keyDigest, MemoryHostedKeys, MemoryHostedOAuthTokens, MemoryHostedQuota, type HostedKeyRecord } from '../src/hostedApi.js'
import { MemoryCreditsStore } from '../src/hostedCredits.js'
import { MemoryHostedJobStore, type HostedJob } from '../src/hostedJobs.js'
import type { JobFiles } from '../src/hostedJobRoutes.js'

// Hosted job tools over MCP (ROADMAP PH H2, docs/h2-hosted-jobs-tasks.md M1–M3, M5): an account's connection lists the
// crawl and batch tools, which call the job routes through the gate; no worker runs here, a test writes a slice's pages.

const HASH_KEY = 'h'.repeat(40)
const KEYS: Record<string, HostedKeyRecord> = {
  oc_account: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' },
  oc_http: { enabled: true, plan: 'account', dailyLimit: 0, browser: false, uid: 'account-2' },
  oc_plain: { enabled: true, plan: 'free', dailyLimit: 100, browser: true },
}

let close: (() => Promise<void>) | undefined
let root: string | undefined
const clients: Client[] = []
afterEach(async () => {
  while (clients.length) await clients.pop()!.close().catch(() => {})
  await close?.(); close = undefined
  if (root) await rm(root, { recursive: true, force: true }); root = undefined
})

async function start(options: { addressPerMinute?: number } = {}) {
  root = await mkdtemp(join(tmpdir(), 'octocrawl-job-mcp-'))
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  const store = new MemoryHostedJobStore()
  const segments = new Map<string, string[]>()
  const files: JobFiles = { segment: async (job, slice) => segments.get(`${job.id}/${slice}`) ?? null, exportUrl: async (job) => `https://storage.example/${job.id}` }
  const enqueued: HostedJob[] = []
  const keys = new MemoryHostedKeys(new Map(Object.entries(KEYS).map(([key, record]) => [keyDigest(HASH_KEY, key), record])))
  const service = createHostedApi({
    port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys, oauthTokens: new MemoryHostedOAuthTokens(new Map()), quota: new MemoryHostedQuota(),
    credits: new MemoryCreditsStore(1_000), networkPolicy: hostedNetworkPolicy(), log: () => {}, ...(options.addressPerMinute === undefined ? {} : { addressPerMinute: options.addressPerMinute }),
    jobs: { store, files, enqueueSlice: async (job) => { enqueued.push(job) } },
  })
  close = service.close
  if (!service.server.listening) await once(service.server, 'listening')
  const url = `http://127.0.0.1:${port}`
  const connect = async (key: string | null) => {
    const client = new Client({ name: 'octocrawl-job-mcp-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: key === null ? {} : { authorization: `Bearer ${key}` } } }))
    clients.push(client)
    return client
  }
  const sliceWrote = (id: string, items: Array<{ url: string; status: string } & Record<string, unknown>>) => {
    const job = store.jobs.get(id)!
    segments.set(`${id}/${job.counts.slices}`, items.map((item) => JSON.stringify(item)))
    store.jobs.set(id, { ...job, counts: { pages: job.counts.pages + items.length, errors: job.counts.errors, slices: job.counts.slices + 1 } })
  }
  return { connect, store, enqueued, sliceWrote }
}

const structured = (result: unknown) => (result as { structuredContent?: Record<string, unknown> }).structuredContent ?? {}
const text = (result: unknown) => ((result as { content?: Array<{ text?: string }> }).content ?? []).map((part) => part.text ?? '').join('\n')

describe('hosted job tools over MCP', () => {
  it('lists the job tools to an account\'s key only, with the options hosted takes and the waits it can serve', async () => {
    const { connect } = await start()
    const keyless = (await (await connect(null)).listTools()).tools.map((tool) => tool.name)
    const plain = (await (await connect('oc_plain')).listTools()).tools.map((tool) => tool.name)
    for (const name of HOSTED_JOB_TOOLS) { expect(keyless, name).not.toContain(name); expect(plain, name).not.toContain(name) }
    const tools = (await (await connect('oc_account')).listTools()).tools
    const names = tools.map((tool) => tool.name)
    for (const name of HOSTED_JOB_TOOLS) expect(names, name).toContain(name)
    const crawl = tools.find((tool) => tool.name === 'crawl')!
    const properties = (crawl.inputSchema as { properties: Record<string, { maximum?: number }> }).properties
    for (const refused of ['webhook', 'ignoreRobotsTxt', 'access', 'useCached']) expect(properties, refused).not.toHaveProperty(refused)
    // maxCredits is a REST option the MCP tool's parser does not take yet (H2 M6).
    expect(properties).not.toHaveProperty('maxCredits')
    expect(properties.maxPages?.maximum).toBe(500)
    const wait = tools.find((tool) => tool.name === 'wait_crawl')!
    expect((wait.inputSchema as unknown as { properties: { timeoutMs: { maximum: number } } }).properties.timeoutMs.maximum).toBe(90_000)
    // Its instructions say jobs run here, not only on the person's computer.
    const instructions = (await connect('oc_account')).getInstructions() ?? ''
    expect(instructions).toMatch(/Crawls and batches run here as jobs/)
    expect(instructions.length).toBeLessThan(2_000)
    expect((await connect(null)).getInstructions()).toMatch(/Crawls, batches, Monitors and saved logins run on a server on the person's computer/)
    // A connection without the browser lane is not offered what needs it.
    const http = (await (await connect('oc_http')).listTools()).tools.find((tool) => tool.name === 'batch_scrape')!
    expect((http.inputSchema as { properties: Record<string, unknown> }).properties).not.toHaveProperty('waitFor')
  })

  it('describes and offers only what hosted serves: the errors list\'s shape, no screenshot without the browser lane, no authed mode, appendToId or large files (H2 M7, M9)', async () => {
    const { connect } = await start()
    const props = (tool: { inputSchema: unknown }) => (tool.inputSchema as { properties: Record<string, Record<string, unknown>> }).properties
    for (const [key, browser] of [['oc_http', false], ['oc_account', true]] as const) {
      const tools = (await (await connect(key)).listTools()).tools
      const scrapeFormats = props(tools.find((tool) => tool.name === 'scrape')!).formats
      for (const name of ['crawl', 'batch_scrape']) {
        const tool = tools.find((candidate) => candidate.name === name)!
        const properties = props(tool)
        // The start tools' formats are hosted scrape's, so a connection without the browser lane is offered no screenshot.
        expect(properties.formats, `${key} ${name}`).toEqual(scrapeFormats)
        expect(JSON.stringify(properties.formats?.items).includes('screenshot'), `${key} ${name}`).toBe(browser)
        expect(properties.mode?.enum, `${key} ${name}`).toEqual(['standard', 'research'])
        expect(String(properties.mode?.description)).not.toMatch(/saved logins;/)
        expect(properties.maxFileBytes?.maximum, `${key} ${name}`).toBe(5 * 1024 * 1024)
        expect(tool.description).not.toMatch(/appendToId|actions|not stated/)
      }
      const errors = tools.find((tool) => tool.name === 'get_batch_errors')!
      expect(errors.description).not.toMatch(/robotsBlocked|\berrors \[/)
      expect(errors.description).toMatch(/\{ items, nextCursor, hasMore \}/)
    }
  })

  it('answers job items without usage and trace unless debug is true, the Evidence Record whole (H2 M8)', async () => {
    const { connect, sliceWrote } = await start()
    const client = await connect('oc_account')
    const evidenceRecord = { version: 'w2l.evidence/1', finalUrl: 'https://example.com/', fetchedAt: '2026-10-20T00:00:00.000Z', httpStatus: 200, contentSha256: 'a'.repeat(64) }
    const page = { url: 'https://example.com/', status: 'success', markdown: '# Example', evidenceRecord, usage: { credits: 1 }, trace: [{ step: 'fetch', ms: 12 }] }
    const failed = { url: 'https://example.com/gone', status: 'failed', failureReason: 'http_404', evidenceRecord, usage: { credits: 1 }, trace: [{ step: 'fetch', ms: 3 }] }
    const batch = structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/', 'https://example.com/gone'] } })).taskId as string
    sliceWrote(batch, [page, failed])
    const crawl = structured(await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/' } })).taskId as string
    sliceWrote(crawl, [page, failed])
    const calls = [
      ['get_batch_items', { id: batch }], ['get_batch_items', { id: batch, maxResults: 10 }], ['get_batch_errors', { id: batch }],
      ['get_crawl_pages', { id: crawl }], ['get_crawl_pages', { id: crawl, maxResults: 10 }], ['get_crawl_errors', { id: crawl }],
    ] as const
    for (const [name, args] of calls) {
      const result = await client.callTool({ name, arguments: args })
      expect(result.isError ?? false, `${name} ${text(result)}`).toBe(false)
      // The error lists have no output schema, so their answer is the text alone.
      const items = ((result as { structuredContent?: unknown }).structuredContent === undefined ? JSON.parse(text(result)) : structured(result)).items as Array<Record<string, unknown>>
      expect(items.length, name).toBeGreaterThan(0)
      for (const item of items) {
        expect(item, name).not.toHaveProperty('usage')
        expect(item, name).not.toHaveProperty('trace')
        expect(item.evidenceRecord, name).toEqual(evidenceRecord)
      }
      expect(text(result), name).not.toMatch(/"usage"|"trace"/)
    }
    // debug asks for the whole.
    for (const [name, id] of [['get_batch_items', batch], ['get_crawl_pages', crawl]] as const) {
      const items = structured(await client.callTool({ name, arguments: { id, debug: true } })).items as Array<Record<string, unknown>>
      expect(items[0], name).toMatchObject({ usage: { credits: 1 }, trace: [{ step: 'fetch', ms: 12 }], evidenceRecord })
    }
  })

  it('starts, reads, pages through and cancels a crawl over MCP, its answers valid against the tools\' output schemas', async () => {
    const { connect, enqueued, sliceWrote } = await start()
    const client = await connect('oc_account')
    const started = await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', maxPages: 5 } })
    expect(started.isError ?? false, text(started)).toBe(false)
    const taskId = structured(started).taskId as string
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/)
    expect(enqueued.map((job) => job.id)).toEqual([taskId])
    sliceWrote(taskId, [{ url: 'https://example.com/', status: 'success' }, { url: 'https://example.com/a', status: 'success' }])
    const status = await client.callTool({ name: 'get_crawl', arguments: { id: taskId } })
    expect(status.isError ?? false, text(status)).toBe(false)
    expect(structured(status)).toMatchObject({ taskId, status: 'running', pagesFetched: 2 })
    // A list follows cursors in pages hosted serves (at most 100), whatever maxResults asks for.
    const followed = await client.callTool({ name: 'get_crawl_pages', arguments: { id: taskId, maxResults: 200 } })
    expect(followed.isError ?? false, text(followed)).toBe(false)
    const pages = await client.callTool({ name: 'get_crawl_pages', arguments: { id: taskId } })
    expect(pages.isError ?? false, text(pages)).toBe(false)
    expect((structured(pages).items as unknown[]).length).toBe(2)
    const cancelled = await client.callTool({ name: 'cancel_crawl', arguments: { id: taskId } })
    expect(cancelled.isError ?? false, text(cancelled)).toBe(false)
    expect(structured(await client.callTool({ name: 'get_crawl', arguments: { id: taskId } }))).toMatchObject({ status: 'cancelled' })
  })

  it('answers a queued job\'s status within the status schema, and a wait that ends at its limit with the status so far', async () => {
    const { connect, store } = await start()
    const client = await connect('oc_account')
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: [`https://example.com/${i}`] } })).taskId as string)
    expect(store.jobs.get(ids[2]!)?.status).toBe('queued')
    const queued = await client.callTool({ name: 'get_batch', arguments: { id: ids[2] } })
    expect(queued.isError ?? false, text(queued)).toBe(false)
    expect(structured(queued)).toMatchObject({ status: 'queued' })
    const waited = await client.callTool({ name: 'wait_batch', arguments: { id: ids[0], timeoutMs: 1_000 } })
    expect(structured(waited)).toMatchObject({ status: 'running' })
  })

  it('counts a wait\'s polls inside the server against nobody\'s address: the caller\'s next call is not rate limited', async () => {
    const { connect } = await start({ addressPerMinute: 20 })
    const client = await connect('oc_account')
    const taskId = structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/'] } })).taskId as string
    // Twelve seconds of polling every half second: more requests than the address may make in a minute.
    const waited = await client.callTool({ name: 'wait_batch', arguments: { id: taskId, timeoutMs: 12_000 } })
    expect(waited.isError ?? false, text(waited)).toBe(false)
    const after = await client.callTool({ name: 'get_batch', arguments: { id: taskId } })
    expect(after.isError ?? false, text(after)).toBe(false)
  }, 30_000)

  it('refuses a webhook passed to a job tool anyway, so its secret never reaches the transcript', async () => {
    const { connect, enqueued } = await start()
    const client = await connect('oc_account')
    const refused = await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', webhook: 'https://hooks.example.com/' } }).then((result) => { expect(result.isError).toBe(true); return text(result) }, (error: Error) => error.message)
    expect(refused).toMatch(/no webhook over MCP/)
    expect(refused).not.toContain('whsec_')
    expect(enqueued).toEqual([])
  })

  it('tells a keyless caller that jobs need an account, by name, without starting anything', async () => {
    const { connect, enqueued } = await start()
    const client = await connect(null)
    // Refused as a tool this connection is not offered: a protocol error, or an error result, naming the account it needs.
    const refused = await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/' } }).then((result) => { expect(result.isError).toBe(true); return text(result) }, (error: Error) => error.message)
    expect(refused).toMatch(/account/)
    expect(enqueued).toEqual([])
  })
})
