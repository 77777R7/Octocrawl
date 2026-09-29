import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

function httpOnlyChannels(mode: 'standard' | 'research' | 'authed') {
  return buildChannels(mode, {
    localSubjects: {
      browser_local: {
        fetch: async () => {
          throw new Error('API tests stay on HTTP; browser arm was reached')
        },
      },
    },
  })
}

describe('Firecrawl /scrape /crawl shim', () => {
  let server: FixtureServer
  let engine: ApiEngine
  let taskRoot: string

  beforeAll(async () => {
    server = await startFixtureServer()
    taskRoot = await mkdtemp(join(tmpdir(), 'w2l-fc-'))
    engine = createApiEngine({ taskRoot, channelsFor: httpOnlyChannels })
  })

  afterEach(async () => {
    await engine.close()
  })

  afterAll(async () => {
    await engine.close()
    await server.close()
    await rm(taskRoot, { recursive: true, force: true })
  })

  it('POST /fc/v1/scrape wraps a fixture listing as Firecrawl success', async () => {
    const app = createApp(engine)
    const res = await app.request('/fc/v1/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${server.url}/crawl/listing`,
        formats: ['markdown', 'links'],
        onlyMainContent: true,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.markdown).toContain('Harbour lantern catalog')
    expect(body.data.links).toContain(`${server.url}/crawl/item/1`)
    expect(body.data.metadata.sourceURL).toBe(`${server.url}/crawl/listing`)
    expect(body).not.toHaveProperty('status')
  })

  it('POST /fc/v1/scrape and /fc/v1/crawl reject unsupported formats and parameters by name', async () => {
    const app = createApp(engine)
    const post = async (path: string, body: unknown) => {
      const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    }
    const url = `${server.url}/crawl/listing`
    expect(await post('/fc/v1/scrape', { url, formats: ['markdown', 'html'], proxy: 'auto' })).toEqual({
      status: 400,
      body: {
        success: false,
        error: 'unsupported parameter: proxy; unsupported format: html (the /fc shim supports markdown, links)',
        code: 'unsupported_parameter',
        details: { parameters: ['proxy'], formats: ['html'] },
      },
    })
    expect(await post('/fc/v1/scrape', { url, actions: [{ type: 'wait', milliseconds: 500 }] })).toMatchObject({ status: 400, body: { success: false, error: expect.stringContaining('actions') } })
    expect(await post('/fc/v1/crawl', { url, webhook: 'https://example.com/hook' })).toMatchObject({ status: 400, body: { success: false, error: expect.stringContaining('webhook') } })
  })

  it('POST /fc/v1/crawl starts native crawl and GET returns Firecrawl status pages', async () => {
    const app = createApp(engine)
    const started = await app.request('/fc/v1/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${server.url}/crawl/listing`,
        limit: 4,
        maxDepth: 2,
        ignoreSitemap: true,
        scrapeOptions: { formats: ['markdown'] },
      }),
    })
    expect(started.status).toBe(200)
    const accepted = (await started.json()) as { success: boolean; id: string; url: string }
    expect(accepted.success).toBe(true)
    expect(accepted.id.length).toBeGreaterThan(0)
    expect(accepted.url).toBe(`${server.url}/crawl/listing`)

    await engine.close()
    const got = await app.request(`/fc/v1/crawl/${accepted.id}`)
    expect(got.status).toBe(200)
    const status = await got.json()
    expect(status.status).toBe('completed')
    expect(status.completed).toBeGreaterThanOrEqual(4)
    expect(status.creditsUsed).toBe(0)
    expect(status.data.length).toBeGreaterThanOrEqual(4)
    expect(status.data.some((page: { markdown: string | null }) => page.markdown?.includes('Harbour lantern catalog'))).toBe(
      true,
    )
  })

  it('POST /fc/v1/crawl maps includePaths / excludePaths and scrapeOptions.formats', async () => {
    const app = createApp(engine)
    const started = await app.request('/fc/v1/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${server.url}/crawl/listing`,
        includePaths: ['^/crawl/item/'],
        excludePaths: ['^/crawl/item/[12]$'],
        scrapeOptions: { formats: ['links'] },
      }),
    })
    expect(started.status).toBe(200)
    const { id } = (await started.json()) as { id: string }
    await engine.close()
    const status = await (await app.request(`/fc/v1/crawl/${id}`)).json()
    expect(status.data.map((page: { metadata: { sourceURL: string } }) => page.metadata.sourceURL).sort()).toEqual([
      `${server.url}/crawl/item/3`,
      `${server.url}/crawl/listing`,
    ])
    expect(status.data.every((page: { markdown: string | null; links?: string[] }) => page.markdown === null && (page.links?.length ?? 0) > 0)).toBe(true)
  })
})
