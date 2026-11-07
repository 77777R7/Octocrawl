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
import { accessTokenDigest, createHostedApi, HOSTED_JOB_TOOLS, keyDigest, MCP_OAUTH_RESOURCE, MemoryHostedKeys, MemoryHostedOAuthTokens, MemoryHostedQuota, SITE_ACCOUNT_HEADER, siteAccountAssertion, type HostedKeyRecord, type HostedLeases } from '../src/hostedApi.js'
import { MemoryCreditsStore } from '../src/hostedCredits.js'
import { MemoryHostedJobStore, type HostedJob } from '../src/hostedJobs.js'
import { JOB_WORKER_COUNT, jobStatus, type JobFiles } from '../src/hostedJobRoutes.js'

// Hosted job tools over MCP (ROADMAP PH H2, docs/h2-hosted-jobs-tasks.md M1–M3, M5): an account's connection lists the
// crawl and batch tools, which call the job routes through the gate; no worker runs here, a test writes a slice's pages.

const HASH_KEY = 'h'.repeat(40)
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${'The harbour office records tide height every hour of the day. '.repeat(8)}</p></article></main></body></html>`
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

async function start(options: { addressPerMinute?: number; allowed?: readonly string[]; privateSites?: boolean; leases?: HostedLeases; allows?: (uid: string) => Promise<boolean>; enabled?: () => Promise<boolean> } = {}) {
  root = await mkdtemp(join(tmpdir(), 'octocrawl-job-mcp-'))
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  const store = new MemoryHostedJobStore()
  const segments = new Map<string, string[]>()
  const files: JobFiles = { segment: async (job, slice) => segments.get(`${job.id}/${slice}`) ?? null, exportUrl: async (job) => `https://storage.example/${job.id}` }
  const enqueued: HostedJob[] = []
  const keys = new MemoryHostedKeys(new Map([...Object.entries(KEYS).map(([key, record]) => [keyDigest(HASH_KEY, key), record] as const), ['oauth-connection', { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1', kind: 'oauth' }] as const]))
  const oauthTokens = new MemoryHostedOAuthTokens(new Map([[accessTokenDigest(HASH_KEY, 'oca_connection'), { keyId: 'oauth-connection', resource: MCP_OAUTH_RESOURCE, expiresAt: Date.now() + 3_600_000 }]]))
  const service = createHostedApi({
    port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys, oauthTokens, quota: new MemoryHostedQuota(),
    credits: new MemoryCreditsStore(1_000), networkPolicy: options.privateSites === true ? { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] } : hostedNetworkPolicy(), log: () => {}, ...(options.addressPerMinute === undefined ? {} : { addressPerMinute: options.addressPerMinute }),
    ...(options.leases === undefined ? {} : { leases: options.leases }),
    jobs: { store, files, enqueueSlice: async (job) => { enqueued.push(job) }, ...(options.enabled === undefined ? {} : { enabled: options.enabled }), ...(options.allows !== undefined ? { allows: options.allows } : options.allowed === undefined ? {} : { allows: async (uid: string) => options.allowed!.includes(uid) }) },
  })
  close = service.close
  if (!service.server.listening) await once(service.server, 'listening')
  const url = `http://127.0.0.1:${port}`
  const connect = async (key: string | null, path = '/mcp') => {
    const client = new Client({ name: 'octocrawl-job-mcp-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}${path}`), { requestInit: { headers: key === null ? {} : { authorization: `Bearer ${key}` } } }))
    clients.push(client)
    return client
  }
  const sliceWrote = (id: string, items: Array<{ url: string; status: string } & Record<string, unknown>>) => {
    const job = store.jobs.get(id)!
    segments.set(`${id}/${job.counts.slices}`, items.map((item) => JSON.stringify(item)))
    store.jobs.set(id, { ...job, counts: { pages: job.counts.pages + items.length, errors: job.counts.errors, slices: job.counts.slices + 1 } })
  }
  return { url, connect, store, enqueued, sliceWrote }
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
    // An account's connection also lists its active crawls and a scrape's record, and scrape names get_scrape to it (stage H W0).
    for (const name of ['list_active_crawls', 'get_scrape']) { expect(names, name).toContain(name); expect(keyless, name).not.toContain(name); expect(plain, name).not.toContain(name) }
    expect(tools.find((tool) => tool.name === 'scrape')!.description).toContain('get_scrape')
    const crawl = tools.find((tool) => tool.name === 'crawl')!
    const properties = (crawl.inputSchema as { properties: Record<string, { maximum?: number }> }).properties
    for (const refused of ['webhook', 'ignoreRobotsTxt', 'access', 'useCached']) expect(properties, refused).not.toHaveProperty(refused)
    // A job's credit cap is offered over MCP too (H2 M6).
    expect(properties.maxCredits).toMatchObject({ type: 'integer', minimum: 1 })
    expect(properties.maxPages?.maximum).toBe(500)
    // A slice reads JOB_WORKER_COUNT pages at once, and a crawl is offered no more (stage H W0).
    expect(properties.maxConcurrency?.maximum).toBe(JOB_WORKER_COUNT)
    // A batch is offered no more either (docs/launch/2026-11-05-batch-concurrency-plan.md D4): locally the schema has no ceiling.
    expect((tools.find((tool) => tool.name === 'batch_scrape')!.inputSchema as { properties: Record<string, { maximum?: number }> }).properties.maxConcurrency?.maximum).toBe(JOB_WORKER_COUNT)
    const wait = tools.find((tool) => tool.name === 'wait_crawl')!
    expect((wait.inputSchema as unknown as { properties: { timeoutMs: { maximum: number } } }).properties.timeoutMs.maximum).toBe(120_000)
    // Its instructions say jobs run here, not only on the person's computer.
    const instructions = (await connect('oc_account')).getInstructions() ?? ''
    expect(instructions).toMatch(/Crawls and batches run here as jobs/)
    expect(instructions.length).toBeLessThan(2_000)
    expect((await connect(null)).getInstructions()).toMatch(/Crawls, batches, Monitors and saved logins run on a server on the person's computer/)
    // A connection without the browser lane is not offered what needs it.
    const http = (await (await connect('oc_http')).listTools()).tools.find((tool) => tool.name === 'batch_scrape')!
    expect((http.inputSchema as { properties: Record<string, unknown> }).properties).not.toHaveProperty('waitFor')
  })

  it('says scrapes run one at a time where a lease can refuse one, and names batch_scrape only where it is listed', async () => {
    const { connect } = await start()
    const scrapeOf = async (key: string | null) => (await (await connect(key)).listTools()).tools.find((tool) => tool.name === 'scrape')!.description
    expect(await scrapeOf('oc_account')).toMatch(/one scrape at a time.*browser_busy.*batch_scrape/i)
    // No account: batch_scrape is not listed, so the description stays as the budget measures it. No browser lane: no lease.
    for (const key of ['oc_plain', 'oc_http', null]) expect(await scrapeOf(key), String(key)).not.toContain('browser_busy')
    const instructionsOf = async (key: string | null) => (await connect(key)).getInstructions() ?? ''
    const account = await instructionsOf('oc_account')
    expect(account).toMatch(/one scrape at a time.*browser_busy.*batch_scrape/i)
    expect(account.length).toBeLessThan(2_000)
    const plain = await instructionsOf('oc_plain')
    expect(plain).toMatch(/one scrape at a time.*browser_busy/i)
    expect(plain).not.toContain('batch_scrape')
    for (const key of ['oc_http', null]) expect(await instructionsOf(key), String(key)).not.toContain('browser_busy')
  })

  it('points a scrape refused by the lease at a batch job first, where the account can run one, with what needs no turn and the real wait after it', async () => {
    const leases: HostedLeases = { acquire: async () => ({ ok: false, retryAfterSeconds: 7 }) }
    const { connect } = await start({ leases })
    const refused = await (await connect('oc_account')).callTool({ name: 'scrape', arguments: { url: 'https://example.com/', waitFor: 500 } })
    expect(refused.isError).toBe(true)
    const next = text(refused).split('\n').filter((line) => line.startsWith('Next: '))
    expect(next).toHaveLength(3)
    expect(next[0]).toContain('batch_scrape')
    expect(next[0]).toContain('POST /v1/batches')
    expect(next[1]).toMatch(/^Next: without waitFor, a screenshot/)
    expect(next[2]).toContain('7 s')
    expect(next[2]).toContain('5 minutes')
    // A key without an account lists no batch_scrape, so it is not told to use one.
    expect(text(await (await connect('oc_plain')).callTool({ name: 'scrape', arguments: { url: 'https://example.com/', waitFor: 500 } }))).not.toMatch(/batch/i)
  })

  it('names no batch job to an account that is not invited to run one', async () => {
    const leases: HostedLeases = { acquire: async () => ({ ok: false, retryAfterSeconds: 7 }) }
    const { connect } = await start({ leases, allowed: [] })
    const refused = await (await connect('oc_account')).callTool({ name: 'scrape', arguments: { url: 'https://example.com/', waitFor: 500 } })
    expect(text(refused)).toContain('browser_busy')
    expect(text(refused)).not.toMatch(/batch/i)
  })

  it('names no batch job while jobs are paused', async () => {
    const leases: HostedLeases = { acquire: async () => ({ ok: false, retryAfterSeconds: 7 }) }
    const { connect } = await start({ leases, enabled: async () => false })
    const refused = await (await connect('oc_account')).callTool({ name: 'scrape', arguments: { url: 'https://example.com/', waitFor: 500 } })
    expect(text(refused)).toContain('browser_busy')
    expect(text(refused)).not.toMatch(/batch/i)
  })

  it('tells an OAuth connection only what it can do: batch_scrape, no REST route, and the longest MCP call', async () => {
    const leases: HostedLeases = { acquire: async () => ({ ok: false, retryAfterSeconds: 7 }) }
    const { connect } = await start({ leases })
    const refused = text(await (await connect('oca_connection', '/mcp-oauth')).callTool({ name: 'scrape', arguments: { url: 'https://example.com/', waitFor: 500 } }))
    expect(refused).toContain('batch_scrape')
    expect(refused).not.toContain('POST /v1/batches')
    expect(refused).toContain('up to 3 minutes')
  })

  it('gives a Playground run the wait alone: the dashboard shows the first hint and has neither a batch nor fastMode', async () => {
    const leases: HostedLeases = { acquire: async () => ({ ok: false, retryAfterSeconds: 7 }) }
    const { url } = await start({ leases })
    const refused = await fetch(`${url}/v1/scrape`, { method: 'POST', headers: { [SITE_ACCOUNT_HEADER]: siteAccountAssertion(HASH_KEY, 'account-1'), 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/', formats: ['screenshot'] }) })
    expect(refused.status).toBe(429)
    const { agentHints } = await refused.json() as { agentHints: string[] }
    expect(agentHints).toHaveLength(1)
    expect(agentHints[0]).toContain('7 s')
    expect(agentHints[0]).not.toMatch(/batch|without waitFor/i)
  })

  it('stays a 429 when reading whether the account can run a job fails, without the batch hint', async () => {
    const leases: HostedLeases = { acquire: async () => ({ ok: false, retryAfterSeconds: 7 }) }
    const { url } = await start({ leases, allows: async () => { throw new Error('config unreadable') } })
    const refused = await fetch(`${url}/v1/scrape`, { method: 'POST', headers: { authorization: 'Bearer oc_account', 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/', waitFor: 500 }) })
    expect(refused.status).toBe(429)
    const body = await refused.json() as { code: string; agentHints: string[] }
    expect(body.code).toBe('browser_busy')
    expect(body.agentHints.join(' ')).not.toMatch(/batch/i)
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
        // verify is scrape's, whose hosted copy names no regular-expression check (stage H W0).
        expect(properties.verify, `${key} ${name}`).toEqual({ type: 'object', description: 'Same as scrape.' })
        expect(String(props(tools.find((candidate) => candidate.name === 'scrape')!).verify?.description), key).not.toMatch(/markdownMatches|markdownCountMin/)
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
    for (const [name, id, ms] of [['get_batch_items', batch, 12], ['get_crawl_pages', crawl, 12], ['get_batch_errors', batch, 3], ['get_crawl_errors', crawl, 3]] as const) {
      const result = await client.callTool({ name, arguments: { id, debug: true } })
      expect(result.isError ?? false, `${name} ${text(result)}`).toBe(false)
      const items = ((result as { structuredContent?: unknown }).structuredContent === undefined ? JSON.parse(text(result)) : structured(result)).items as Array<Record<string, unknown>>
      expect(items[0], name).toMatchObject({ usage: { credits: 1 }, trace: [{ step: 'fetch', ms }], evidenceRecord })
    }
  })

  it('answers a hosted batch\'s start with the floor for reading every URL, none under maxCredits, and again on a replay', async () => {
    const { connect } = await start()
    const client = await connect('oc_account')
    const urls = [1, 2, 3, 4, 5, 6, 7].map((n) => `https://example.com/${n}`)
    const started = structured(await client.callTool({ name: 'batch_scrape', arguments: { urls, idempotencyKey: 'floor-1' } }))
    // Seven pages of one host, 250 ms apart: 1.5 s, said in whole seconds.
    expect(started.minimumSeconds).toBe(1)
    expect(structured(await client.callTool({ name: 'batch_scrape', arguments: { urls, idempotencyKey: 'floor-1' } }))).toMatchObject({ replayed: true, minimumSeconds: 1 })
    expect(structured(await client.callTool({ name: 'get_batch', arguments: { id: started.taskId as string } })).rate).toEqual({ pagesPerMinute: null, etaSeconds: null, measuredPages: 0 })
  })

  it('says through get_batch and wait_batch why a job waits for the next UTC day', async () => {
    const { connect, store } = await start()
    const client = await connect('oc_account')
    const started = structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/1', 'https://example.com/2'] } }))
    const id = started.taskId as string
    const until = new Date(Date.now() + 3_600_000).toISOString()
    store.jobs.set(id, { ...store.jobs.get(id)!, status: 'running', paused: { pool: 'account', limit: 2_000, until } })
    const paused = { reason: 'account_daily_pages', limit: 2_000, resumesAt: until, message: expect.stringContaining('need not be cancelled') }
    expect(structured(await client.callTool({ name: 'get_batch', arguments: { id } })).paused).toEqual(paused)
    expect(structured(await client.callTool({ name: 'wait_batch', arguments: { id, timeoutMs: 1 } })).paused).toEqual(paused)
  })

  it('hands a finished batch\'s download link to the agent through get_batch and wait_batch, with the hint that says what it is', async () => {
    const { connect, store } = await start()
    const client = await connect('oc_account')
    const started = structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/1', 'https://example.com/2'] } }))
    const id = started.taskId as string
    expect(structured(await client.callTool({ name: 'get_batch', arguments: { id } }))).not.toHaveProperty('export')
    store.jobs.set(id, { ...store.jobs.get(id)!, status: 'completed', finishedAt: new Date().toISOString() })
    for (const name of ['get_batch', 'wait_batch'] as const) {
      const result = await client.callTool({ name, arguments: { id } })
      expect(result.isError ?? false, text(result)).toBe(false)
      const status = structured(result)
      expect(status.export).toEqual({ url: `https://storage.example/${id}`, expiresInSeconds: 86_400 })
      const hints = status.agentHints as string[]
      expect(hints.some((hint) => hint.includes('export.url') && hint.includes('gzip') && hint.includes('24 hours') && hint.includes('get_batch_items'))).toBe(true)
    }
  })

  it('measures a hosted batch\'s rate from its first slice, not from its wait in the queue, and says none for a crawl or a job that ended', () => {
    const job = { id: 'j', kind: 'batch', status: 'running', failureReason: null, request: { urls: Array.from({ length: 1_000 }, (_, i) => `https://example.com/${i}`) }, counts: { pages: 10, errors: 0, slices: 1 }, credits: { used: 10, maxCredits: null }, createdAt: '2026-11-05T00:00:00.000Z', startedAt: '2026-11-05T00:40:00.000Z', finishedAt: null, expireAt: '2026-11-12T00:00:00.000Z' } as unknown as HostedJob
    // 40 minutes in the queue, then 10 pages in 20 s: 30 a minute, 33 minutes left, not 66 hours.
    expect(jobStatus(job, Date.parse('2026-11-05T00:40:20.000Z')).rate).toEqual({ pagesPerMinute: 30, etaSeconds: 1_980, measuredPages: 10 })
    expect(jobStatus({ ...job, startedAt: null, counts: { pages: 0, errors: 0, slices: 0 }, status: 'queued' }, Date.parse('2026-11-05T00:40:20.000Z')).rate).toEqual({ pagesPerMinute: null, etaSeconds: null, measuredPages: 0 })
    expect(jobStatus({ ...job, status: 'completed' })).not.toHaveProperty('rate')
    expect(jobStatus({ ...job, kind: 'crawl', request: { url: 'https://example.com/' } })).not.toHaveProperty('rate')
  })

  it('projects a hosted batch\'s items to the fields asked for, keeping url and status', async () => {
    const { connect, sliceWrote } = await start()
    const client = await connect('oc_account')
    const evidenceRecord = { version: 'w2l.evidence/1', finalUrl: 'https://example.com/', fetchedAt: '2026-10-20T00:00:00.000Z', httpStatus: 200, contentSha256: 'a'.repeat(64) }
    const page = { id: 's1', url: 'https://example.com/', status: 'success', markdown: '# Example', json: { status: 'complete', data: { title: 'Example' } }, evidenceRecord, usage: { credits: 1 }, trace: [], createdAt: '2026-10-20T00:00:01.000Z' }
    const batch = structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/'] } })).taskId as string
    sliceWrote(batch, [page])
    const result = await client.callTool({ name: 'get_batch_items', arguments: { id: batch, fields: ['json'] } })
    expect(result.isError ?? false, text(result)).toBe(false)
    const items = structured(result).items as Array<Record<string, unknown>>
    expect(items).toEqual([{ id: 's1', url: 'https://example.com/', status: 'success', json: { status: 'complete', data: { title: 'Example' } }, createdAt: '2026-10-20T00:00:01.000Z' }])
    const refused = await client.callTool({ name: 'get_batch_items', arguments: { id: batch, fields: ['finalUrl'] } })
    expect(refused.isError).toBe(true)
    expect(text(refused)).toContain('fields names no item field: finalUrl')
  })

  it('starts, reads, pages through and cancels a crawl over MCP, its answers valid against the tools\' output schemas', async () => {
    const { connect, enqueued, sliceWrote } = await start()
    const client = await connect('oc_account')
    const started = await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', maxPages: 5, maxCredits: 3 } })
    expect(started.isError ?? false, text(started)).toBe(false)
    const taskId = structured(started).taskId as string
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/)
    expect(enqueued.map((job) => job.id)).toEqual([taskId])
    expect(enqueued[0]!.credits.maxCredits).toBe(3)
    expect(structured(started)).toMatchObject({ credits: { maxCredits: 3 } })
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

  it('pages through a crawl whose pages fill an answer: the cursor of an answer cut for size reads on (H2 launch run)', async () => {
    const { connect, sliceWrote } = await start()
    const client = await connect('oc_account')
    const taskId = structured(await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', maxPages: 10 } })).taskId as string
    // Ten pages of 15,000 characters: an answer of 50,000 holds three at most.
    const page = (n: number) => ({ id: `step-${n}`, createdAt: `2026-10-21T18:20:${String(10 + n)}.000Z`, url: `https://example.com/p/${n}`, status: 'success', markdown: `# Page ${n}\n\n${'x'.repeat(15_000)}` })
    sliceWrote(taskId, Array.from({ length: 10 }, (_, n) => page(n)))
    const seen: string[] = []
    let cursor: string | undefined
    for (let round = 0; round < 10; round++) {
      const answer = await client.callTool({ name: 'get_crawl_pages', arguments: { id: taskId, ...(cursor === undefined ? {} : { cursor }) } })
      expect(answer.isError ?? false, text(answer)).toBe(false)
      const list = structured(answer) as { items: Array<{ url: string }>; nextCursor: string | null; hasMore: boolean }
      seen.push(...list.items.map((item) => item.url))
      if (!list.hasMore) break
      cursor = list.nextCursor!
    }
    expect(seen).toEqual(Array.from({ length: 10 }, (_, n) => `https://example.com/p/${n}`))
  })

  it('answers a queued job\'s status within the status schema, and a wait that ends at its limit with the status so far', async () => {
    const { connect, store } = await start()
    const client = await connect('oc_account')
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: [`https://example.com/${i}`] } })).taskId as string)
    expect(store.jobs.get(ids[2]!)?.status).toBe('queued')
    // A batch takes the credit cap over MCP as a crawl does.
    const capped = structured(await client.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/capped'], maxCredits: 2 } })).taskId as string | undefined
    expect(capped === undefined ? null : store.jobs.get(capped)?.credits.maxCredits).toBe(2)
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

  it('lists the account\'s active crawls, and reads a scrape\'s record back by the id its answer keeps (stage H W0)', async () => {
    const site = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
    })
    site.listen(0, '127.0.0.1'); await once(site, 'listening')
    try {
      const origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
      const { connect } = await start({ privateSites: true })
      const client = await connect('oc_account')
      // Listing first makes the client check each result against its tool's outputSchema.
      await client.listTools()
      const taskId = structured(await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/' } })).taskId as string
      const active = await client.callTool({ name: 'list_active_crawls', arguments: {} })
      expect(active.isError ?? false, text(active)).toBe(false)
      expect(JSON.parse(text(active))).toMatchObject({ crawls: [{ id: taskId, url: 'https://example.com/', status: 'running', pagesFetched: 0 }] })
      const scraped = JSON.parse(text(await client.callTool({ name: 'scrape', arguments: { url: `${origin}/page`, fastMode: true } }))) as { status: string; metadata: { scrapeId?: string } }
      expect(scraped.status).toBe('success')
      expect(scraped.metadata.scrapeId).toMatch(/^[0-9a-f-]{36}$/)
      const record = await client.callTool({ name: 'get_scrape', arguments: { id: scraped.metadata.scrapeId } })
      expect(record.isError ?? false, text(record)).toBe(false)
      expect(structured(record)).toMatchObject({ scrapeId: scraped.metadata.scrapeId, status: 'success', request: { url: `${origin}/page` } })
      // It is answered as a scrape's result is: without the call's telemetry or the client that made it.
      for (const key of ['usage', 'channelsTried', 'origin']) expect(structured(record), key).not.toHaveProperty(key)
    } finally { await new Promise<void>((resolve) => site.close(() => resolve())) }
  })

  it('names batch_scrape from a caller\'s third scrape of one host in ten minutes, counted per key, and tells a keyless caller where it runs', async () => {
    // docs/launch/2026-11-05-batch-concurrency-plan.md D13: the tracker is the service's, keyed by the caller (hostedApi.ts).
    const site = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
    })
    site.listen(0, '127.0.0.1'); await once(site, 'listening')
    try {
      const origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
      const { connect } = await start({ privateSites: true })
      const hints = async (client: Client, path: string) => (JSON.parse(text(await client.callTool({ name: 'scrape', arguments: { url: `${origin}/${path}`, fastMode: true } }))) as { agentHints?: string[] }).agentHints ?? []
      const account = await connect('oc_account')
      expect((await hints(account, 'a')).join()).not.toContain('batch_scrape')
      expect((await hints(account, 'b')).join()).not.toContain('batch_scrape')
      expect(await hints(account, 'c')).toContainEqual(expect.stringMatching(/^3 scrapes of 127\.0\.0\.1 in the last 10 minutes: a known list of URLs runs as one batch_scrape \(then wait_batch and get_batch_items\)/))
      // Another key starts its own count; a keyless caller, offered no job tools, is told where batch_scrape runs.
      expect((await hints(await connect('oc_http'), 'a')).join()).not.toContain('batch_scrape')
      const keyless = await connect(null)
      for (const path of ['a', 'b']) await hints(keyless, path)
      expect(await hints(keyless, 'c')).toContainEqual(expect.stringMatching(/^3 scrapes of 127\.0\.0\.1 in the last 10 minutes: with an account's connection a known list of URLs runs as one batch_scrape job/))
    } finally { await new Promise<void>((resolve) => site.close(() => resolve())) }
  })

  it('refuses the regular-expression checks at a job tool\'s start by name, and runs a crawl\'s larger maxConcurrency at two (stage H W0)', async () => {
    const { connect, enqueued } = await start()
    const client = await connect('oc_account')
    for (const [name, args] of [['crawl', { url: 'https://example.com/' }], ['batch_scrape', { urls: ['https://example.com/'] }]] as const) {
      const result = await client.callTool({ name, arguments: { ...args, verify: { checks: [{ type: 'markdownCountMin', pattern: 'Example', min: 1 }] } } })
      expect(result.isError, name).toBe(true)
      expect(text(result), name).toMatch(/^unsupported_parameter: verify: markdownCountMin checks are not available in hosted mode/)
    }
    expect(enqueued).toEqual([])
    const crawl = await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', maxConcurrency: JOB_WORKER_COUNT + 6 } })
    expect(crawl.isError ?? false, text(crawl)).toBe(false)
    expect(enqueued.map((job) => job.request)).toMatchObject([{ maxConcurrency: JOB_WORKER_COUNT }])
    // A batch's larger maxConcurrency is lowered at the start too, so the stored request says what the slices run (D4).
    const batch = await client.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/'], maxConcurrency: JOB_WORKER_COUNT + 6 } })
    expect(batch.isError ?? false, text(batch)).toBe(false)
    expect(enqueued.map((job) => job.request)).toMatchObject([{ maxConcurrency: JOB_WORKER_COUNT }, { maxConcurrency: JOB_WORKER_COUNT }])
  })

  it('refuses at a job tool\'s start, by name, a selector the worker\'s engine would refuse at the first slice (stage H W0)', async () => {
    const { connect, store, enqueued } = await start()
    const client = await connect('oc_account')
    for (const [name, args] of [['crawl', { url: 'https://example.com/' }], ['batch_scrape', { urls: ['https://example.com/'] }]] as const) {
      const result = await client.callTool({ name, arguments: { ...args, includeTags: ['div:has(p)'] } })
      expect(result.isError, name).toBe(true)
      expect(text(result), name).toMatch(/^unsupported_parameter: includeTags entry uses .*: div:has\(p\)/)
    }
    expect(store.jobs.size).toBe(0)
    expect(enqueued).toEqual([])
  })

  it('refuses a webhook passed to a job tool anyway, so its secret never reaches the transcript', async () => {
    const { connect, enqueued } = await start()
    const client = await connect('oc_account')
    const refused = await client.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', webhook: 'https://hooks.example.com/' } }).then((result) => { expect(result.isError).toBe(true); return text(result) }, (error: Error) => error.message)
    expect(refused).toMatch(/no webhook over MCP/)
    expect(refused).not.toContain('whsec_')
    expect(enqueued).toEqual([])
  })

  it('offers the job tools only to the accounts on the list while it exists, and tells another account they are invite only (H2 R2)', async () => {
    const { connect, enqueued } = await start({ allowed: ['account-1'] })
    const invited = (await (await connect('oc_account')).listTools()).tools.map((tool) => tool.name)
    for (const name of HOSTED_JOB_TOOLS) expect(invited, name).toContain(name)
    const other = await connect('oc_http')
    const names = (await other.listTools()).tools.map((tool) => tool.name)
    for (const name of HOSTED_JOB_TOOLS) expect(names, name).not.toContain(name)
    expect(names).toContain('scrape')
    const refused = await other.callTool({ name: 'batch_scrape', arguments: { urls: ['https://example.com/'] } }).then((result) => { expect(result.isError).toBe(true); return text(result) }, (error: Error) => error.message)
    expect(refused).toMatch(/not open to this account right now/)
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
