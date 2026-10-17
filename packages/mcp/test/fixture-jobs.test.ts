import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { callTool } from '../src/tools.js'

/**
 * The size of what the job tools hand a client for a small crawl and a small batch, on the HTTP lane of an in-process
 * engine against the fixture catalog (docs/mcp-client-ux-tasks.md W2): measured, not yet budgeted (W8 sets the budget).
 * W2L_TOOL_SURFACE_REPORT=1 prints the sizes.
 */
describe('MCP crawl and batch results against the fixture catalog', () => {
  let fixtures: FixtureServer
  let taskRoot: string
  let engine: ApiEngine
  let client: W2L

  beforeAll(async () => {
    fixtures = await startFixtureServer()
    taskRoot = await mkdtemp(join(tmpdir(), 'w2l-mcp-jobs-'))
    engine = createApiEngine({
      taskRoot,
      channelsFor: (mode) => buildChannels(mode, { localSubjects: { browser_local: { fetch: async () => { throw new Error('the job fixtures stay on HTTP') } } } }),
    })
    const app = createApp(engine)
    client = new W2L({ baseUrl: 'http://w2l.test', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => app.request(new URL(String(input)).pathname + new URL(String(input)).search, init)) as typeof fetch })
  })

  afterAll(async () => {
    await engine.close()
    await fixtures.close()
    await rm(taskRoot, { recursive: true, force: true })
  })

  const report = (label: string, chars: number) => {
    expect(chars).toBeGreaterThan(0)
    if (process.env.W2L_TOOL_SURFACE_REPORT === '1') console.info(`result size: ${label}: ${chars} chars`)
  }

  it('crawls the four-page listing and measures get_crawl and get_crawl_pages', async () => {
    const started = (await callTool(client, 'crawl', { url: `${fixtures.url}/crawl/listing`, crawlEntireDomain: true, sitemap: 'skip', maxPages: 10 })) as { taskId: string }
    await client.waitCrawl(started.taskId, { timeoutMs: 20_000 })
    const status = await callTool(client, 'get_crawl', { id: started.taskId })
    const pages = (await callTool(client, 'get_crawl_pages', { id: started.taskId })) as { items: unknown[] }
    expect(pages.items).toHaveLength(4)
    report('get_crawl (4-page crawl)', JSON.stringify(status).length)
    report('get_crawl_pages (4 pages)', JSON.stringify(pages).length)
  })

  it('batches three item pages and measures wait_batch and get_batch_items', async () => {
    const urls = [1, 2, 3].map((n) => `${fixtures.url}/crawl/item/${n}`)
    const started = (await callTool(client, 'batch_scrape', { urls })) as { taskId: string }
    const waited = (await callTool(client, 'wait_batch', { id: started.taskId, timeoutMs: 20_000 })) as { status: string }
    expect(waited.status).toBe('completed')
    const items = (await callTool(client, 'get_batch_items', { id: started.taskId })) as { items: unknown[] }
    expect(items.items).toHaveLength(3)
    report('wait_batch (3 URLs)', JSON.stringify(waited).length)
    report('get_batch_items (3 items)', JSON.stringify(items).length)
  })
})
