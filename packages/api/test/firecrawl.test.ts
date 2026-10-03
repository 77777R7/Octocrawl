import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { buildChannels } from '@w2l/bench'
import { SqliteTaskStore } from '@w2l/runtime'
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
    expect(await post('/fc/v1/scrape', { url, formats: ['markdown', 'summary'], proxy: 'auto' })).toEqual({
      status: 400,
      body: {
        success: false,
        error: 'unsupported parameter: proxy; unsupported format: summary (the /fc shim supports markdown, links, html, rawHtml, images, screenshot, screenshot@fullPage)',
        code: 'unsupported_parameter',
        details: { parameters: ['proxy'], formats: ['summary'] },
      },
    })
    expect(await post('/fc/v1/crawl', { url, scrapeOptions: { actions: [{ type: 'wait', milliseconds: 500 }] } })).toMatchObject({ status: 400, body: { success: false, error: expect.stringContaining('scrapeOptions.actions') } })
    // webhook is mapped onto the native option now; a key inside it W2L does not know is still refused by name.
    expect(await post('/fc/v1/crawl', { url, webhook: { url: 'https://example.com/hook', retries: 3 } })).toMatchObject({ status: 400, body: { success: false, error: 'unknown webhook option: retries', code: 'invalid_request' } })
  })

  it('POST /fc/v1/map answers the links as strings with the map\'s id, and refuses what it does not map in the /fc envelope', async () => {
    const app = createApp(engine)
    const post = async (body: unknown) => {
      const res = await app.request('/fc/v1/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    }
    const url = `${server.url}/crawl/listing`
    // The listing's item links lie outside /crawl/listing/, the start URL's subtree; its title matches the search.
    const { status, body } = await post({ url, search: 'Lantern catalog', ignoreSitemap: false })
    expect(status).toBe(200)
    expect(body).toEqual({ success: true, id: expect.stringMatching(/^[0-9a-f-]{36}$/), links: [url] })
    // The native record is kept under the same id.
    expect((await (await app.request(`/v1/maps/${body.id}`)).json()).response).toMatchObject({ status: 'completed', refused: { subtreeDenied: 3 }, sources: { sitemap: { mode: 'include' } } })
    expect(await post({ url, useIndex: true, threatProtection: true })).toEqual({
      status: 400,
      body: { success: false, error: 'unsupported parameters: useIndex, threatProtection', code: 'unsupported_parameter', details: { parameters: ['useIndex', 'threatProtection'] }, agent_hints: ['W2L keeps no URL index: a map reads the sitemaps the site declares and its start page, on the record; crawl reads further pages'] },
    })
    expect(await post({ url, ignoreSitemap: true, sitemapOnly: true })).toEqual({ status: 400, body: { success: false, error: 'ignoreSitemap and sitemapOnly cannot both be true', code: 'invalid_request' } })
    // A sitemap-only map of a site without a sitemap found nothing: success false, with why.
    const empty = await post({ url, sitemapOnly: true })
    expect(empty).toMatchObject({ status: 200, body: { success: false, links: [], error: expect.stringContaining('no sitemap was found') } })
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
        // The fixture's items are siblings of the listing: v1's name for following them.
        allowBackwardLinks: true,
        scrapeOptions: { formats: ['markdown'] },
      }),
    })
    expect(started.status).toBe(200)
    const accepted = (await started.json()) as { success: boolean; id: string; url: string }
    expect(accepted.success).toBe(true)
    expect(accepted.id.length).toBeGreaterThan(0)
    expect(accepted.url).toBe(`${server.url}/crawl/listing`)

    await engine.close()
    // v1's ignoreSitemap: true is the native sitemap mode skip, stored with the task.
    const store = SqliteTaskStore.openReadOnly(join(taskRoot, accepted.id))
    try {
      expect((await store.getTask(accepted.id))?.crawl).toMatchObject({ sitemap: 'skip' })
    } finally {
      await store.close()
    }
    const got = await app.request(`/fc/v1/crawl/${accepted.id}`)
    expect(got.status).toBe(200)
    const status = await got.json()
    expect(status.status).toBe('completed')
    expect(status.completed).toBeGreaterThanOrEqual(4)
    expect(status.creditsUsed).toBeNull()
    expect(status.expiresAt).toBeNull()
    expect(status.data.length).toBeGreaterThanOrEqual(4)
    expect(status.data.some((page: { markdown: string | null }) => page.markdown?.includes('Harbour lantern catalog'))).toBe(
      true,
    )
  })

  it('POST /fc/v1/crawl and /v1/crawl honour x-idempotency-key: a retry answers the first start\'s id and starts nothing', async () => {
    // An engine of this test's own: the shared one is closed between tests, and a key is looked up in the task root's index.
    const own = createApiEngine({ taskRoot, channelsFor: httpOnlyChannels })
    try {
      const app = createApp(own)
      const post = (path: string, body: unknown, headers: Record<string, string> = {}) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
      const url = `${server.url}/crawl/listing`
      const taskDirs = async () => (await readdir(taskRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
      const before = (await taskDirs()).length
      const first = await (await post('/fc/v1/crawl', { url, limit: 1, ignoreSitemap: true }, { 'x-idempotency-key': 'fc-retry' })).json() as { success: boolean; id: string; url: string }
      expect(first).toEqual({ success: true, id: expect.any(String), url })
      expect(await (await post('/fc/v1/crawl', { url, limit: 1, ignoreSitemap: true }, { 'x-idempotency-key': 'fc-retry' })).json()).toEqual(first)
      // Another body under the same key is a conflict, in Firecrawl's envelope.
      const conflict = await post('/fc/v1/crawl', { url, limit: 2, ignoreSitemap: true }, { 'x-idempotency-key': 'fc-retry' })
      expect(conflict.status).toBe(409)
      expect(await conflict.json()).toEqual({ success: false, error: 'idempotency key was used for a different request', code: 'conflict' })
      // The native route takes the key in the body or either header, says it replayed, and refuses a body key that differs from the header.
      const native = await (await post('/v1/crawl', { url, maxPages: 1, sitemap: 'skip', idempotencyKey: 'native-retry' })).json() as { taskId: string }
      expect(native).toEqual({ taskId: expect.any(String) })
      expect(await (await post('/v1/crawl', { url, maxPages: 1, sitemap: 'skip' }, { 'Idempotency-Key': 'native-retry' })).json()).toEqual({ taskId: native.taskId, replayed: true })
      const mismatch = await post('/v1/crawl', { url, maxPages: 1, sitemap: 'skip', idempotencyKey: 'native-retry' }, { 'x-idempotency-key': 'other' })
      expect(mismatch.status).toBe(400)
      expect(await mismatch.json()).toEqual({ error: 'idempotencyKey does not match the x-idempotency-key header', code: 'invalid_request' })
      await own.close()
      // Two crawls were started by five submissions: one task directory per key.
      const after = await taskDirs()
      expect(after.filter((name) => name === first.id || name === native.taskId)).toHaveLength(2)
      expect(after.length).toBe(before + 2)
    } finally {
      await own.close()
    }
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
        crawlEntireDomain: true,
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
