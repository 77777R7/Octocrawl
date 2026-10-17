import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { callTool } from '../src/tools.js'

/**
 * The size of a scrape that asks for a screenshot, which today carries the image as base64 inside the JSON text
 * (docs/mcp-client-ux-tasks.md W2; W8 moves it to an image block). It needs the real browser, so it runs in the
 * timed group. W2L_TOOL_SURFACE_REPORT=1 prints the size.
 */
describe('MCP scrape with a screenshot against the fixture catalog', () => {
  let fixtures: FixtureServer
  let taskRoot: string
  let engine: ApiEngine

  beforeAll(async () => {
    fixtures = await startFixtureServer()
    taskRoot = await mkdtemp(join(tmpdir(), 'w2l-mcp-shot-'))
    engine = createApiEngine({ taskRoot })
  })

  afterAll(async () => {
    await engine.close()
    await fixtures.close()
    await rm(taskRoot, { recursive: true, force: true })
  })

  it('measures a compact scrape result that holds a viewport screenshot', async () => {
    const app = createApp(engine)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => app.request(new URL(String(input)).pathname, init)) as typeof fetch })
    const result = (await callTool(client, 'scrape', { url: `${fixtures.url}/crawl/listing`, formats: ['markdown', 'screenshot'] })) as { status: string; screenshot?: { base64?: string | null } | null }
    expect(result.status).toBe('success')
    const base64 = result.screenshot?.base64 ?? ''
    expect(base64.length).toBeGreaterThan(0)
    const chars = JSON.stringify(result).length
    if (process.env.W2L_TOOL_SURFACE_REPORT === '1') console.info(`result size: scrape with screenshot (compact): ${chars} chars, of which base64 ${base64.length}`)
  }, 60_000)
})
