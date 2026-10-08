import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FetchOptions, FetchResult, ListFormatRequest, ListPageRead } from '@w2l/contracts'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * The list format in real Chromium and on the HTTP lane: a page that is a
 * list of short records (no article in it) is read as its records, and a
 * paginate step's pages are read as one list, each record knowing its page.
 */

let server: Server
let base: string
let loads = 0
// /generic drops its fourth row once this is set, so every page after the first shifts by one.
let dropRow4 = false

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
    if (url === '/article') return html(`<article><h1>A note</h1>${'<p>One long paragraph of prose about nothing in particular, written to be read as an article. </p>'.repeat(4)}</article>`)
    // Three pages whose second has Next under an overlay: the click on it never lands.
    const covered = /^\/covered\/(\d)$/.exec(url)
    if (covered !== null) { const n = Number(covered[1]); return html(`${[1, 2, 3].map((i) => card(n * 10 + i)).join('')}${n < 3 ? `<a class="next" href="/covered/${n + 1}">Next</a>` : ''}${n === 2 ? '<div id="cover" style="position:fixed;inset:0;background:rgba(255,255,255,.5)">cover</div>' : ''}`) }
    // One URL whose Next swaps three pages of cards in place and hides itself on the last: pages with no address of their own.
    if (url === '/inplace') return html(`<div id="list">${[1, 2, 3].map((i) => card(10 + i)).join('')}</div><a class="next" href="#" onclick="event.preventDefault(); const p = Number(this.dataset.p || 1) + 1; this.dataset.p = p; document.getElementById('list').innerHTML = [1, 2, 3].map((i) => '<div class=card><a class=name href=/p/' + (p * 10 + i) + '>Item ' + (p * 10 + i) + '</a><span class=price>' + (p * 10 + i) + '.00</span></div>').join(''); if (p === 3) this.style.display = 'none'">Next</a>`)
    // One URL, five pages of rows without links swapped in place; the first page's prices change on every load (/text), or every page's (/text-all).
    const text = /^\/text(-all)?$/.exec(url)
    if (text !== null) { loads++; const all = text[1] !== undefined; return html(`<div id="list"></div><a class="next" href="#">Next</a><script>let p = 0; const loads = ${loads}; const show = () => { p++; document.getElementById('list').innerHTML = [1, 2, 3].map((i) => '<div class=card><span class=name>Item ' + (p * 10 + i) + '</span><span class=price>' + (p * 10 + i) + '.' + ((p === 1 || ${all}) ? loads : 0) + '</span></div>').join(''); if (p === 5) document.querySelector('a.next').style.display = 'none' }; show(); document.querySelector('a.next').addEventListener('click', (event) => { event.preventDefault(); show() })</script>`) }
    // One URL, five pages of rows swapped in place whose links all point to the same place: nothing tells the pages apart by their links.
    if (url === '/generic') { const rows = Array.from({ length: 15 }, (_, i) => i + 1).filter((n) => !(dropRow4 && n === 4)); return html(`<div id="list"></div><a class="next" href="#">Next</a><script>const rows = ${JSON.stringify(rows)}; let p = 0; const show = () => { const slice = rows.slice(p * 3, p * 3 + 3); p++; document.getElementById('list').innerHTML = slice.map((n) => '<div class=card><a class=name href=#>Item ' + n + '</a><span class=price>' + n + '.00</span></div>').join(''); if (p * 3 >= rows.length) document.querySelector('a.next').style.display = 'none' }; show(); document.querySelector('a.next').addEventListener('click', (event) => { event.preventDefault(); show() })</script>`) }
    // Each page under two addresses in turn: /dual/1 and /dual/2 show page 1, /dual/3 and /dual/4 page 2, /dual/5 and /dual/6 page 3.
    const dual = /^\/dual\/(\d)$/.exec(url)
    if (dual !== null) { const k = Number(dual[1]); const n = Math.ceil(k / 2); return html(`${[1, 2, 3].map((i) => card(n * 10 + i)).join('')}${k < 6 ? `<a class="next" href="/dual/${k + 1}">Next</a>` : ''}`) }
    // Three pages whose prices change on every load: the names and links are what stays.
    const fresh = /^\/fresh\/(\d)$/.exec(url)
    if (fresh !== null) { const n = Number(fresh[1]); loads++; return html(`${[1, 2, 3].map((i) => `<div class="card"><a class="name" href="/p/${n * 10 + i}">Item ${n * 10 + i}</a><span class="price">${n * 10 + i}.${loads}</span></div>`).join('')}${n < 3 ? `<a class="next" href="/fresh/${n + 1}">Next</a>` : ''}`) }
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

  it('a paginate step that fails at page N keeps the records of the pages it read, and says where it failed', async () => {
    const result = await browser('/covered/1', { list: LIST, actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200 }] })
    expect([result.status, result.failureReason]).toEqual(['failed', 'action_failed'])
    expect(result.actions?.failed).toMatchObject({ index: 0, type: 'paginate', code: 'action_error' })
    expect(result.list).toMatchObject({ pages: 2 })
    expect(result.list?.records.map((record) => record.values.name)).toEqual(['Item 11', 'Item 12', 'Item 13', 'Item 21', 'Item 22', 'Item 23'])
  }, 60_000)

  it('a paginate step cut at page N tells each page as it reads it, and a later fetch resumes from them, reading the rest once and no record twice', async () => {
    const PAGINATE: FetchOptions = { list: LIST, actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200 }] }
    const told: ListPageRead[] = []
    const cut = new AbortController()
    const first = new BrowserLocalSubject('standard')
    let interrupted: FetchResult
    try {
      interrupted = await first.fetch(`${base}/pages/1`, Date.now() + 45_000, cut.signal, undefined, PAGINATE, undefined, undefined, {
        onListPage: (read) => { told.push(read); if (read.page === 2) cut.abort(new DOMException('service shutdown', 'ShutdownError')) },
      })
    } finally {
      await first.teardown()
    }
    // The cut run has no result for the URL; the pages it told are what survives it.
    expect(interrupted.status).toBe('failed')
    expect(told.map((read) => [read.step, read.page, read.url])).toEqual([[0, 1, `${base}/pages/1`], [0, 2, `${base}/pages/2`]])
    expect(told[0]!.html).toContain('Item 11')
    expect(told[1]!.html).toContain('Item 21')
    expect(told.map((read) => read.count)).toEqual([3, 3])

    const again: ListPageRead[] = []
    const second = new BrowserLocalSubject('standard')
    let result: FetchResult
    try {
      result = await second.fetch(`${base}/pages/1`, Date.now() + 45_000, undefined, undefined, PAGINATE, undefined, undefined, { onListPage: (read) => again.push(read), listResume: { pages: told } })
    } finally {
      await second.teardown()
    }
    expect(result.status).toBe('success')
    // Pages 1 and 2 come from the checkpoint and are passed over on the way to page 3, which is read and told.
    expect(result.actions?.lists[0]).toMatchObject({ type: 'paginate', stoppedBy: 'end', rounds: 3, itemsRead: 9, resumed: 2 })
    expect(again.map((read) => read.page)).toEqual([3])
    expect(result.trace.find((event) => event.event === 'list_resumed')?.detail).toMatchObject({ step: 0, pages: 2, replayed: 2 })
    expect(result.list).toMatchObject({ pages: 3 })
    expect(result.list?.records.map((record) => record.values.name)).toEqual([11, 12, 13, 21, 22, 23, 31, 32, 33].map((n) => `Item ${n}`))
    expect(result.list?.records.map((record) => record.source.page)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3])
  }, 120_000)

  describe('a paginate step resumed from its checkpoint', () => {
    const PAGINATE = (over: Record<string, unknown> = {}): FetchOptions => ({ list: LIST, actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200, ...over }] })
    const fetchTelling = async (path: string, options: FetchOptions, resume?: ListPageRead[]) => {
      const told: ListPageRead[] = []
      const subject = new BrowserLocalSubject('standard')
      try {
        const result = await subject.fetch(`${base}${path}`, Date.now() + 45_000, undefined, undefined, options, undefined, undefined, { onListPage: (read) => told.push(read), ...(resume === undefined ? {} : { listResume: { pages: resume } }) })
        return { result, told, trace: result.trace }
      } finally {
        await subject.teardown()
      }
    }
    const names = (result: FetchResult) => result.list?.records.map((record) => record.values.name)

    it('still ends as repeat when the pages past the checkpoint only show its last page again', async () => {
      const whole = await fetchTelling('/clamp/1', PAGINATE())
      expect(whole.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'repeat', rounds: 2 })
      expect(whole.told.map((read) => read.page)).toEqual([1, 2])
      const again = await fetchTelling('/clamp/1', PAGINATE(), whole.told)
      expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'repeat', rounds: 2, resumed: 2 })
      expect(again.result.warnings?.map((warning) => warning.code) ?? []).not.toContain('list_not_exhausted')
      expect(again.told).toEqual([])
      expect(names(again.result)).toEqual(names(whole.result))
    }, 90_000)

    it('reads the pages after a single checkpointed one when the pages share one address', async () => {
      const whole = await fetchTelling('/inplace', PAGINATE())
      expect(whole.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 3 })
      expect(whole.told.map((read) => read.url)).toEqual([`${base}/inplace`, `${base}/inplace`, `${base}/inplace`])
      const again = await fetchTelling('/inplace', PAGINATE(), whole.told.slice(0, 1))
      expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, resumed: 1 })
      expect(again.told.map((read) => read.page)).toEqual([2, 3])
      expect(names(again.result)).toEqual([11, 12, 13, 21, 22, 23, 31, 32, 33].map((n) => `Item ${n}`))
    }, 90_000)

    it('knows a checkpointed page again by its items\' links when their prices changed since', async () => {
      const whole = await fetchTelling('/fresh/1', PAGINATE())
      expect(whole.told.map((read) => read.page)).toEqual([1, 2, 3])
      const again = await fetchTelling('/fresh/1', PAGINATE(), whole.told.slice(0, 2))
      expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, resumed: 2 })
      expect(again.told.map((read) => read.page)).toEqual([3])
      expect(names(again.result)).toEqual([11, 12, 13, 21, 22, 23, 31, 32, 33].map((n) => `Item ${n}`))
    }, 90_000)

    it('reads every page after a kept page it no longer knows (rows without links whose text changed), reading that one again', async () => {
      const TEXT = { type: 'list', itemSelector: 'div.card', fields: [{ name: 'name', selector: '.name' }, { name: 'price', selector: '.price' }] } as ListFormatRequest
      const whole = await fetchTelling('/text', { ...PAGINATE(), list: TEXT })
      expect(whole.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 5 })
      const again = await fetchTelling('/text', { ...PAGINATE(), list: TEXT }, whole.told.slice(0, 3))
      // Page 1 changed and has no links to be known by, so it is read anew and its records repeat; pages 2 and 3 are passed over; 4 and 5 are read.
      expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 6, resumed: 3 })
      expect(again.trace.find((event) => event.event === 'list_resumed')?.detail).toMatchObject({ replayed: 2 })
      expect(again.told.map((read) => read.page)).toEqual([4, 5, 6])
      const got = names(again.result)!
      for (const n of [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43, 51, 52, 53]) expect(got).toContain(`Item ${n}`)
      expect(got.filter((name) => name === 'Item 11')).toHaveLength(2)
      expect(got.filter((name) => name === 'Item 21')).toHaveLength(1)
    }, 90_000)

    it('keeps the page limit when no kept page is known again', async () => {
      const TEXT = { type: 'list', itemSelector: 'div.card', fields: [{ name: 'name', selector: '.name' }, { name: 'price', selector: '.price' }] } as ListFormatRequest
      const whole = await fetchTelling('/text-all', { ...PAGINATE(), list: TEXT })
      expect(whole.told).toHaveLength(5)
      const again = await fetchTelling('/text-all', { ...PAGINATE({ maxPages: 3 }), list: TEXT }, whole.told.slice(0, 2))
      // Two kept pages count toward the limit of three; the first page read anew is the third, and the step stops there.
      expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'max', rounds: 3, resumed: 2 })
      expect(again.told.map((read) => read.page)).toEqual([3])
    }, 90_000)

    it('does not take a page for a kept one by links every page shares: a site that lost a row since the cut is read to its end', async () => {
      dropRow4 = false
      const whole = await fetchTelling('/generic', PAGINATE())
      expect(whole.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 5 })
      dropRow4 = true
      try {
        const again = await fetchTelling('/generic', PAGINATE(), whole.told.slice(0, 3))
        // Page 1 is known by its items; the pages after it changed and share their links with every page, so they are read anew.
        expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', resumed: 3 })
        expect(again.trace.find((event) => event.event === 'list_resumed')?.detail).toMatchObject({ replayed: 1, knownBy: { content: 1, links: 0, address: 0 } })
        const got = names(again.result)!
        for (const n of [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) expect(got).toContain(`Item ${n}`)
      } finally {
        dropRow4 = false
      }
    }, 90_000)

    it('still passes a kept page\'s second address as the alias it is, not as the list\'s end', async () => {
      const whole = await fetchTelling('/dual/1', PAGINATE())
      expect(whole.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 3 })
      expect(whole.told.map((read) => read.url)).toEqual([`${base}/dual/1`, `${base}/dual/3`, `${base}/dual/5`])
      const again = await fetchTelling('/dual/1', PAGINATE(), whole.told)
      expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, resumed: 3 })
      expect(again.told).toEqual([])
      expect(names(again.result)).toEqual(names(whole.result))
    }, 90_000)

    it('with the checkpoint at its page limit, walks to the last page before stopping at max', async () => {
      const whole = await fetchTelling('/pages/1', PAGINATE({ maxPages: 2 }))
      expect(whole.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'max', rounds: 2 })
      const again = await fetchTelling('/pages/1', PAGINATE({ maxPages: 2 }), whole.told)
      expect(again.result.actions?.lists[0]).toMatchObject({ stoppedBy: 'max', rounds: 2, resumed: 2 })
      expect(again.told).toEqual([])
      // The page the browser stands on, which the Markdown is of, is the last page read, not the first.
      expect(again.result.markdown).toContain('Item 21')
      expect(names(again.result)).toEqual(names(whole.result))
    }, 90_000)
  })

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

  it('without itemSelector, finds the list and its fields, and says what it chose', async () => {
    const result = await browser('/cards', { list: { type: 'list' } })
    expect(result.status).toBe('success')
    expect(result.list).toMatchObject({ itemSelector: 'main > div.card', fields: ['name', 'link', 'price'], detected: { fields: [{ name: 'name', selector: 'a.name' }, { name: 'link', selector: 'a.name', attribute: 'href' }, { name: 'price', selector: 'span.price' }] } })
    expect(result.list?.records[0]?.values).toEqual({ name: 'Item 1', link: `${base}/p/1`, price: '1.00' })
    expect(result.list?.records).toHaveLength(12)
  }, 60_000)

  it('over a paginate step, finds the list on the first page and reads every page the same way', async () => {
    const result = await browser('/pages/1', { list: { type: 'list' }, actions: [{ type: 'paginate', nextSelector: 'a.next', waitMs: 200 }] })
    expect(result.list).toMatchObject({ itemSelector: 'main > div.card', pages: 3, incomplete: 0 })
    expect(result.list?.records.map((record) => record.values.name)).toEqual(['Item 11', 'Item 12', 'Item 13', 'Item 21', 'Item 22', 'Item 23', 'Item 31', 'Item 32', 'Item 33'])
  }, 60_000)

  it('a page with no list says so, with no records, and is read as it would be without the format', async () => {
    const http = new ResilientHttpSubject('standard')
    try {
      const result = await http.fetch(`${base}/article`, Date.now() + 30_000, undefined, {}, undefined, { list: { type: 'list' } })
      expect(result.status).toBe('success')
      expect(result.list).toMatchObject({ itemSelector: null, fields: [], records: [], detected: { fields: [], alternatives: [] } })
      expect(result.warnings?.map((warning) => warning.code)).toEqual(['list_not_detected'])
      // The cards page has its list, found on the HTTP lane the same way.
      const cards = await http.fetch(`${base}/cards`, Date.now() + 30_000, undefined, {}, undefined, { list: { type: 'list', itemSelector: 'div.card' } })
      expect(cards.list).toMatchObject({ itemSelector: 'div.card', fields: ['name', 'link', 'price'] })
      expect(cards.status).toBe('success')
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
