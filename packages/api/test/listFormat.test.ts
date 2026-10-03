import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import type { FetchOptions, ListExtraction } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/** The engine's handling of the list format: handed to the lanes, answered on scrapes and batch items, its selectors checked first. The lanes read it (packages/bench/test/listFormat.integration.test.ts). */

const LIST: ListExtraction = {
  itemSelector: 'li', fields: ['name'], records: [{ values: { name: 'One' }, missing: [], source: { url: 'https://example.test/', page: 1, index: 0 } }],
  pages: 1, incomplete: 0, csv: 'name,source_url,page,index\r\nOne,https://example.test/,1,0\r\n', csvSha256: 'b'.repeat(64),
}

describe('the list format in the API', () => {
  let server: FixtureServer
  let root: string
  let engine: ApiEngine | null = null
  const asked: (FetchOptions['list'])[] = []

  beforeAll(async () => { server = await startFixtureServer() })
  afterAll(async () => { await server.close() })
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
    asked.length = 0
  })

  async function setup() {
    root = await mkdtemp(join(tmpdir(), 'w2l-list-'))
    const http = buildChannels('standard', { localSubjects: { browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!
    engine = createApiEngine({
      taskRoot: root,
      channelsFor: (mode) => buildChannels(mode, {
        localSubjects: {
          http: { fetch: async (url, _d, _s, _e, options?: FetchOptions) => { asked.push(options?.list); const page = await http.fetch(url); return options?.list === undefined ? page : { ...page, list: LIST } } },
          browser_local: { fetch: async () => { throw new Error('unused') } },
        },
      }),
    })
    return createApp(engine)
  }
  const post = async (app: ReturnType<typeof createApp>, path: string, body: unknown) => {
    const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }
  const list = { type: 'list', itemSelector: 'li', fields: [{ name: 'name' }] }

  it('hands the list to the lane and answers its records, in the formats it names', async () => {
    const app = await setup()
    const res = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, formats: ['markdown', list] })
    expect(res.status).toBe(200)
    expect(asked).toEqual([{ type: 'list', itemSelector: 'li', fields: [{ name: 'name' }] }])
    expect(res.body.list).toEqual(LIST)
    const plain = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing` })
    expect(plain.body.list).toBeUndefined()
  })

  it('hands a list without itemSelector or fields to the lane to find', async () => {
    const app = await setup()
    expect((await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, formats: [{ type: 'list' }] })).status).toBe(200)
    expect((await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, formats: [{ type: 'list', itemSelector: 'li' }] })).status).toBe(200)
    expect(asked).toEqual([{ type: 'list' }, { type: 'list', itemSelector: 'li' }])
  })

  it('refuses a list selector W2L does not match before anything is fetched', async () => {
    const app = await setup()
    const sibling = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, formats: [{ ...list, fields: [{ name: 'n', selector: 'h3 + p' }] }] })
    expect(sibling).toMatchObject({ status: 400, body: { code: 'unsupported_parameter', details: { parameters: ['formats[0].fields[0].selector'] } } })
    const syntax = await post(app, '/v1/scrape', { url: `${server.url}/crawl/listing`, formats: [{ ...list, itemSelector: 'li[' }] })
    expect(syntax).toMatchObject({ status: 400, body: { error: 'list itemSelector is not a valid CSS selector: li[' } })
    expect(asked).toEqual([])
  })

  it('a batch keeps each page\'s records on its item', async () => {
    const app = await setup()
    const started = await post(app, '/v1/batches', { urls: [`${server.url}/crawl/listing`, `${server.url}/crawl/item/1`], formats: [list] })
    let status = ''
    for (let i = 0; i < 100 && !['completed', 'failed'].includes(status); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      status = ((await (await app.request(`/v1/batches/${started.body.taskId}`)).json()) as Record<string, any>).status
    }
    const items = (await (await app.request(`/v1/batches/${started.body.taskId}/items`)).json()) as { items: Array<Record<string, any>> }
    expect(items.items.map((item) => item.list?.records.length)).toEqual([1, 1])
  })
})
