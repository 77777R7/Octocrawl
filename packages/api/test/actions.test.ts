import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import type { ActionsResult, FetchOptions, PageAction } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/** The engine's handling of `actions`: the browser rungs alone, never cached, refused where they cannot run; the browser runs them (packages/bench/test/browserActions.integration.test.ts). */

const SHOT = { contentType: 'image/png' as const, width: 1280, height: 800, fullPage: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, quality: null, bytes: 3, sha256: 'a'.repeat(64), path: null, base64: 'iVBO' }

function ranActions(actions: readonly PageAction[] | undefined, failAt?: number): ActionsResult {
  return {
    screenshots: (actions ?? []).filter((action) => action.type === 'screenshot').map(() => SHOT),
    scrapes: [{ url: 'https://example.test/after', html: '<p>after</p>' }],
    javascriptReturns: [{ type: 'number', value: 4 }],
    pdfs: [],
    lists: [],
    ...(failAt === undefined ? {} : { failed: { index: failAt, type: 'click', code: 'selector_not_found', message: 'no element matched #nope' } }),
  } as ActionsResult
}

describe('actions in the API', () => {
  let server: FixtureServer
  let root: string
  let engine: ApiEngine | null = null
  let httpCalls = 0
  const asked: (readonly PageAction[] | undefined)[] = []

  beforeAll(async () => {
    server = await startFixtureServer()
  })
  afterAll(async () => {
    await server.close()
  })
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
    httpCalls = 0
    asked.length = 0
  })

  async function setup(options: { hosted?: boolean; failAt?: number } = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-actions-'))
    const http = buildChannels('standard', { localSubjects: { browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!
    engine = createApiEngine({
      taskRoot: root,
      hosted: options.hosted,
      channelsFor: (mode) => buildChannels(mode, {
        localSubjects: {
          http: { fetch: async (url) => { httpCalls++; return http.fetch(url) } },
          browser_local: {
            fetch: async (url, _deadline, _signal, _execution, fetchOptions?: FetchOptions) => {
              asked.push(fetchOptions?.actions)
              const page = await http.fetch(url)
              const actions = fetchOptions?.actions === undefined ? undefined : ranActions(fetchOptions.actions, options.failAt)
              const steps = (fetchOptions?.actions ?? []).map((action, index) => ({ at: 0, lane: 'browser_local' as const, event: 'action', detail: { index, type: action.type, outcome: actions?.failed?.index === index ? 'failed' : 'ok' } }))
              return { ...page, lane: 'browser_local', trace: [...page.trace, ...steps], ...(actions === undefined ? {} : { actions }), ...(actions?.failed === undefined ? {} : { status: 'failed', failureReason: 'action_failed' }) }
            },
          },
        },
      }),
    })
    return createApp(engine)
  }

  const post = async (app: ReturnType<typeof createApp>, path: string, body: unknown) => {
    const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }

  it('a scrape with actions goes to the browser rung alone and answers with what the steps produced', async () => {
    const app = await setup()
    const actions = [{ type: 'click', selector: '#more' }, { type: 'screenshot' }, { type: 'scrape' }]
    const res = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, actions })
    expect(res.status).toBe(200)
    expect(httpCalls).toBe(0)
    expect(asked).toEqual([[{ type: 'click', selector: '#more' }, { type: 'screenshot' }, { type: 'scrape' }]])
    expect(res.body.channelsTried).toEqual(['browser_local'])
    expect(res.body.actions).toMatchObject({ screenshots: [{ sha256: 'a'.repeat(64) }], scrapes: [{ url: 'https://example.test/after' }], javascriptReturns: [{ type: 'number', value: 4 }] })
    // The record says the page is the one the steps left.
    expect(res.body.evidenceRecord.pageActions).toEqual({ steps: [{ type: 'click', outcome: 'ok' }, { type: 'screenshot', outcome: 'ok' }, { type: 'scrape', outcome: 'ok' }], scriptRan: false })
    const scripted = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, actions: [{ type: 'executeJavascript', script: 'document.body.innerHTML = "<p>Price $1</p>"' }] })
    expect(scripted.body.evidenceRecord.pageActions).toEqual({ steps: [{ type: 'executeJavascript', outcome: 'ok' }], scriptRan: true })
    const plain = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, formats: ['markdown'] })
    expect(plain.body.evidenceRecord.pageActions).toBeNull()
    const debug = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, actions, debug: true })
    // The screenshots travel once: the audit's attempt copies leave the actions out.
    expect(JSON.stringify(debug.body.summary)).not.toContain('example.test/after')
    expect(debug.body.ladderTrace[0]).toMatchObject({ event: 'ladder_channels_filtered', detail: { reason: 'actions', dropped: ['http'] } })
  })

  it('a failed step is failed with action_failed, the step named', async () => {
    const app = await setup({ failAt: 1 })
    const res = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, actions: [{ type: 'click', selector: '#more' }, { type: 'click', selector: '#nope' }] })
    expect(res.body).toMatchObject({ status: 'failed', failureReason: 'action_failed', actions: { failed: { index: 1, code: 'selector_not_found' } } })
  })

  it('refuses actions with fastMode, with the cache, on a crawl, and on a hosted server', async () => {
    const app = await setup()
    const url = `${server.url}/crawl/listing`
    expect((await post(app, '/v1/scrape', { url, fastMode: true, actions: [{ type: 'scrape' }] })).body.error).toBe('actions require the browser lane, which fastMode declines')
    expect((await post(app, '/v1/scrape', { url, maxAge: 1000, actions: [{ type: 'scrape' }] })).body.error).toContain('the cache is not available with actions')
    expect((await post(app, '/v1/crawl', { url, actions: [{ type: 'scrape' }] })).status).toBe(400)
    await engine!.close()
    await rm(root, { recursive: true, force: true })
    const hostedApp = await setup({ hosted: true })
    const hosted = await post(hostedApp, '/v1/scrape', { url, actions: [{ type: 'scrape' }] })
    expect(hosted).toMatchObject({ status: 400, body: { error: 'actions are not available in hosted mode: run W2L locally to use them' } })
    expect(asked).toEqual([])
  })

  it('a batch runs the same steps on every page and keeps what each produced', async () => {
    const app = await setup()
    const urls = [`${server.url}/crawl/listing`, `${server.url}/crawl/a`]
    const started = await post(app, '/v1/batches', { urls, actions: [{ type: 'scrape' }] })
    expect(started.status).toBe(202)
    let status: Record<string, any> = {}
    for (let i = 0; i < 100 && !['completed', 'failed'].includes(status.status); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      status = (await (await app.request(`/v1/batches/${started.body.taskId}`)).json()) as Record<string, any>
    }
    expect(asked).toEqual([[{ type: 'scrape' }], [{ type: 'scrape' }]])
    const items = (await (await app.request(`/v1/batches/${started.body.taskId}/items`)).json()) as { items: Array<Record<string, any>> }
    expect(items.items.map((item) => item.actions?.scrapes?.length)).toEqual([1, 1])
    // Stored once: the audit's attempt copies leave what the steps produced out.
    const debug = (await (await app.request(`/v1/batches/${started.body.taskId}/items?debug=true`)).json()) as { items: Array<Record<string, any>> }
    expect(debug.items[0]!.audit.summary.attempts).toHaveLength(1)
    expect(JSON.stringify(debug.items.map((item) => item.audit))).not.toContain('example.test/after')
  })

  it('/fc maps a scrape\'s actions and answers Firecrawl\'s shape, screenshots as data URIs', async () => {
    const app = await setup()
    const res = await post(app, '/fc/v1/scrape', { url: `${server.url}/crawl/listing`, actions: [{ type: 'screenshot' }, { type: 'scrape' }] })
    expect(res.status).toBe(200)
    expect(res.body.data.actions).toEqual({
      screenshots: ['data:image/png;base64,iVBO'],
      scrapes: [{ url: 'https://example.test/after', html: '<p>after</p>' }],
      javascriptReturns: [{ type: 'number', value: 4 }],
      pdfs: [],
    })
  })
})
