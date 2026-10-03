import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FetchOptions, FetchResult, ListFormatRequest } from '@w2l/contracts'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * The list format in real Chromium and on the HTTP lane: a page that is a
 * list of short records (no article in it) is read as its records, and a
 * paginate step's pages are read as one list, each record knowing its page.
 */

let server: Server
let base: string

const card = (n: number) => `<div class="card"><a class="name" href="/p/${n}">Item ${n}</a><span class="price">${n}.00</span></div>`
const LIST = { type: 'list', itemSelector: 'div.card', fields: [{ name: 'name', selector: 'a.name' }, { name: 'url', selector: 'a.name', attribute: 'href' }, { name: 'price', selector: '.price' }] } as const satisfies ListFormatRequest

beforeAll(async () => {
  server = createServer((req, res) => {
    const html = (body: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html><head><title>Catalogue</title></head><body><nav><a href="/">Home</a></nav><main>${body}</main></body></html>`) }
    const url = req.url ?? ''
    if (url === '/robots.txt') { res.writeHead(404); res.end(); return }
    if (url === '/cards') return html(Array.from({ length: 12 }, (_, i) => card(i + 1)).join(''))
    // A loading page: three empty card placeholders and nothing else.
    if (url === '/skeleton') return html('<div class="card skeleton"></div>'.repeat(3) + '<div id="app"></div>')
    // A paginator that answers every page past the last with the last one.
    const clamp = /^\/clamp\/(\d+)$/.exec(url)
    if (clamp !== null) { const n = Number(clamp[1]); const shown = Math.min(n, 2); return html(`${[1, 2].map((i) => card(shown * 10 + i)).join('')}<a class="next" href="/clamp/${n + 1}">Next</a>`) }
    // One post per page, every post "In stock": the pages differ in all but the field asked for.
    const one = /^\/one\/(\d)$/.exec(url)
    if (one !== null) { const n = Number(one[1]); return html(`<article class="post"><h2>Post ${n}</h2><span class="stock">In stock</span></article>${n < 3 ? `<a class="next" href="/one/${n + 1}">Next</a>` : ''}`) }
    if (url === '/many') return html(Array.from({ length: 10_005 }, (_, i) => `<div class="card"><a class="name" href="/p/${i}">I${i}</a></div>`).join(''))
    const page = /^\/pages\/(\d)$/.exec(url)
    if (page !== null) { const n = Number(page[1]); return html(`${[1, 2, 3].map((i) => card(n * 10 + i)).join('')}${n < 3 ? `<a class="next" href="/pages/${n + 1}">Next</a>` : ''}`) }
    res.writeHead(404); res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function browser(path: string, options: FetchOptions): Promise<FetchResult> {
  const subject = new BrowserLocalSubject('standard')
  try {
    return await subject.fetch(`${base}${path}`, Date.now() + 45_000, undefined, undefined, options)
  } finally {
    await subject.teardown()
  }
}

describe('list format', () => {
  it('a page of records is read as its records, not failed as having no main content', async () => {
    const plain = await browser('/cards', {})
    const listed = await browser('/cards', { list: LIST })
    expect(listed.status).toBe('success')
    expect(listed.list?.records).toHaveLength(12)
    expect(listed.list?.records[0]).toEqual({ values: { name: 'Item 1', url: `${base}/p/1`, price: '1.00' }, missing: [], source: { url: `${base}/cards`, page: 1, index: 0 } })
    expect(listed.markdown).toContain('Item 12')
    // Without the list format the same page has no main content to the extractor.
    expect([plain.status, plain.failureReason]).toEqual(['failed', 'empty_unverified'])
  }, 60_000)

  it('elements that match but hold no value (a loading skeleton) do not make the page content', async () => {
    const result = await browser('/skeleton', { list: LIST })
    expect([result.status, result.failureReason]).toEqual(['failed', 'empty_unverified'])
  }, 60_000)

  it('the pages a paginate step read keep their records when a later step fails', async () => {
    const result = await browser('/pages/1', { list: LIST, actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200 }, { type: 'click', selector: '#nope' }] })
    expect(result.failureReason).toBe('action_failed')
    expect(result.list).toMatchObject({ pages: 3 })
    expect(result.list?.records.map((record) => record.source.page)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3])
  }, 60_000)

  it('pages whose records repeat a page already merged are not counted twice', async () => {
    // Without itemSelector, paginate skips no page: the clamped pages reach the merge, which reads each list once.
    const result = await browser('/clamp/1', { list: LIST, actions: [{ type: 'paginate', nextSelector: 'a.next', maxPages: 5, waitMs: 200 }] })
    expect(result.list).toMatchObject({ pages: 2 })
    expect(result.list?.records.map((record) => record.values.name)).toEqual(['Item 11', 'Item 12', 'Item 21', 'Item 22'])
  }, 60_000)

  it('pages that agree only on the fields asked for are still different pages', async () => {
    const result = await browser('/one/1', { list: { type: 'list', itemSelector: 'article.post', fields: [{ name: 'stock', selector: '.stock' }] }, actions: [{ type: 'paginate', nextSelector: 'a.next', waitMs: 200 }] })
    expect(result.list).toMatchObject({ pages: 3 })
    expect(result.list?.records).toHaveLength(3)
  }, 60_000)

  it('a list cut by its limits says so, beside the warnings a fetch leads with', async () => {
    const http = new ResilientHttpSubject('standard')
    try {
      const result = await http.fetch(`${base}/many`, Date.now() + 30_000, undefined, {}, undefined, { list: LIST, skipTlsVerification: true })
      expect(result.list).toMatchObject({ truncated: true })
      expect(result.list?.records).toHaveLength(10_000)
      expect(result.warnings?.map((warning) => warning.code)).toEqual(['tls_unverified', 'list_truncated'])
    } finally {
      await http.teardown()
    }
    const shown = await browser('/many', { list: LIST, skipTlsVerification: true })
    expect(shown.warnings?.map((warning) => warning.code)).toEqual(['tls_unverified', 'list_truncated'])
  }, 90_000)

  it('the HTTP lane reads a list the same way', async () => {
    const http = new ResilientHttpSubject('standard')
    try {
      const result = await http.fetch(`${base}/cards`, Date.now() + 30_000, undefined, {}, undefined, { list: LIST })
      expect(result.list?.records).toHaveLength(12)
      expect(result.status).toBe('success')
    } finally {
      await http.teardown()
    }
  }, 60_000)

  it('over a paginate step, the records of every page it read, each knowing its page', async () => {
    const result = await browser('/pages/1', { list: LIST, actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200 }] })
    expect(result.status).toBe('success')
    expect(result.list).toMatchObject({ pages: 3, incomplete: 0 })
    expect(result.list?.records.map((record) => [record.values.name, record.source.page, record.source.index])).toEqual([
      ['Item 11', 1, 0], ['Item 12', 1, 1], ['Item 13', 1, 2],
      ['Item 21', 2, 0], ['Item 22', 2, 1], ['Item 23', 2, 2],
      ['Item 31', 3, 0], ['Item 32', 3, 1], ['Item 33', 3, 2],
    ])
    expect(result.list?.csv.split('\r\n')[4]).toBe(`Item 21,${base}/p/21,21.00,${base}/pages/2,2,0`)
  }, 60_000)
})
