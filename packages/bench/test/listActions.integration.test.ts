import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FetchResult, PageAction } from '@w2l/contracts'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

/**
 * The list steps (scrollToEnd, loadMore, paginate) in real Chromium against
 * local lists that end in each of the ways a real one does: a control that
 * goes away or turns disabled, a click that adds nothing, a page that leads
 * back to one already read, and a list longer than the limit asked for.
 */

const PROSE = '<p>The harbour office keeps the tide table for every hour of the day, and this page lists the readings the office has published so far.</p>'
let server: Server
let base: string
const requested: string[] = []

const rows = (from: number, to: number, cls = 'row') => Array.from({ length: to - from + 1 }, (_, i) => `<li class="${cls}">Reading ${from + i}</li>`).join('')

beforeAll(async () => {
  server = createServer((req, res) => {
    requested.push(req.url ?? '')
    const html = (body: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html><head><title>Fixture</title></head><body><main>${body}</main></body></html>`) }
    const url = req.url ?? ''
    if (url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('User-agent: *\nDisallow: /private\n'); return }
    // 5 items, 5 more whenever the page is scrolled near its end, until 25.
    if (url === '/feed') return html(`<h1>Feed</h1>${PROSE}<ul id="feed">${rows(1, 5, 'item')}</ul><div style="height:1200px"></div><script>let n = 5; window.addEventListener('scroll', () => { if (n >= 25 || window.innerHeight + window.scrollY < document.body.scrollHeight - 50) return; setTimeout(() => { for (let i = 0; i < 5; i++) { const li = document.createElement('li'); li.className = 'item'; li.textContent = 'Reading ' + (++n); document.getElementById('feed').appendChild(li) } }, 200) })</script>`)
    // 3 rows, 3 more per click; the button turns disabled at 9.
    if (url === '/more') return html(`<h1>More</h1>${PROSE}<ul id="list">${rows(1, 3)}</ul><button id="more" onclick="const l = document.getElementById('list'); setTimeout(() => { for (let i = 0; i < 3; i++) { const li = document.createElement('li'); li.className = 'row'; li.textContent = 'Reading ' + (l.children.length + 1); l.appendChild(li) } if (l.children.length >= 9) this.disabled = true }, 200)">Load more</button>`)
    // A button that stays but adds nothing.
    if (url === '/stuck') return html(`<h1>Stuck</h1>${PROSE}<ul>${rows(1, 3)}</ul><button id="more" onclick="void 0">Load more</button>`)
    // Three pages; the last one's Next is inside a disabled list item.
    const page = /^\/pages\/(\d)$/.exec(url)
    if (page !== null) {
      const n = Number(page[1])
      return html(`<h1>Page ${n}</h1>${PROSE}<ul>${rows(n * 10 + 1, n * 10 + 4)}</ul><ul class="pager"><li class="${n === 3 ? 'disabled' : ''}"><a class="next" href="/pages/${n + 1}">Next</a></li></ul>`)
    }
    // Two pages that lead to each other.
    const cycle = /^\/cycle\/(\d)$/.exec(url)
    if (cycle !== null) return html(`<h1>Cycle ${cycle[1]}</h1>${PROSE}<a class="next" href="/cycle/${cycle[1] === '1' ? '2' : '1'}">Next</a>`)
    // A list whose second page robots.txt disallows.
    if (url === '/open/1') return html(`<h1>Open 1</h1>${PROSE}<a class="next" href="/private/2">Next</a>`)
    if (url.startsWith('/private')) return html(`<h1>Private</h1>${PROSE}<p>Not for crawlers.</p>`)
    res.writeHead(404); res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function run(path: string, actions: PageAction[], timeout = 50_000): Promise<FetchResult> {
  const browser = new BrowserLocalSubject('standard')
  try {
    return await browser.fetch(`${base}${path}`, Date.now() + timeout, undefined, undefined, { actions })
  } finally {
    await browser.teardown()
  }
}

describe('list steps, real browser', () => {
  it('scrollToEnd scrolls until two rounds add nothing, and counts the items', async () => {
    const result = await run('/feed', [{ type: 'scrollToEnd', itemSelector: 'li.item', waitMs: 400 }])
    expect(result.status).toBe('success')
    expect(result.actions?.lists).toEqual([{ index: 0, type: 'scrollToEnd', stoppedBy: 'end', rounds: expect.any(Number), items: 25 }])
    expect(result.markdown).toContain('Reading 25')
    expect(result.warnings?.some((warning) => warning.code === 'list_not_exhausted') ?? false).toBe(false)
  }, 60_000)

  it('loadMore clicks until the control turns disabled', async () => {
    const result = await run('/more', [{ type: 'loadMore', selector: '#more', itemSelector: 'li.row', waitMs: 400 }])
    expect(result.actions?.lists).toEqual([{ index: 0, type: 'loadMore', stoppedBy: 'end', rounds: 2, items: 9 }])
    expect(result.markdown).toContain('Reading 9')
  }, 60_000)

  it('loadMore stops when clicks add nothing, never looping on a control that stays', async () => {
    const result = await run('/stuck', [{ type: 'loadMore', selector: '#more', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'no_growth', rounds: 2, items: null })
    expect(result.status).toBe('success')
  }, 60_000)

  it('a limit reached before the list ends says so: list_not_exhausted', async () => {
    const result = await run('/more', [{ type: 'loadMore', selector: '#more', itemSelector: 'li.row', maxClicks: 1, waitMs: 400 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'max', rounds: 1, items: 6 })
    expect(result.warnings?.find((warning) => warning.code === 'list_not_exhausted')?.message).toContain('step 0 (loadMore)')
  }, 60_000)

  it('paginate reads every page until Next is disabled, each page\'s HTML kept', async () => {
    const result = await run('/pages/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul:not(.pager) > li', waitMs: 200 }])
    expect(result.status).toBe('success')
    expect(result.actions?.lists).toEqual([{ index: 0, type: 'paginate', stoppedBy: 'end', rounds: 3, items: 4, itemsRead: 12 }])
    expect(result.actions?.scrapes.map((scrape) => scrape.url)).toEqual([`${base}/pages/1`, `${base}/pages/2`, `${base}/pages/3`])
    expect(result.actions?.scrapes[2]?.html).toContain('Reading 34')
    expect(result.markdown).toContain('Page 3')
  }, 60_000)

  it('paginate stops at a page it already read', async () => {
    const result = await run('/cycle/1', [{ type: 'paginate', nextSelector: 'a.next', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'repeat', rounds: 2 })
    expect(result.actions?.scrapes).toHaveLength(2)
  }, 60_000)

  it('paginate with maxPages stops there and warns', async () => {
    const result = await run('/pages/1', [{ type: 'paginate', nextSelector: 'a.next', maxPages: 2, waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'max', rounds: 2 })
    expect(result.warnings?.some((warning) => warning.code === 'list_not_exhausted')).toBe(true)
  }, 60_000)

  it('paginate into a page robots.txt disallows fails there, its request never sent, keeping no page it read', async () => {
    requested.length = 0
    const result = await run('/open/1', [{ type: 'paginate', nextSelector: 'a.next', waitMs: 200 }])
    expect(requested).not.toContain('/private/2')
    expect(result.actions?.failed).toMatchObject({ index: 0, type: 'paginate', code: 'navigation_refused' })
    expect(result.actions?.scrapes).toEqual([])
    expect(result.actions?.lists).toEqual([])
  }, 60_000)

  it('loadMore on a control that is not there is selector_not_found', async () => {
    const result = await run('/stuck', [{ type: 'loadMore', selector: '#nope' }])
    expect(result.actions?.failed).toMatchObject({ code: 'selector_not_found' })
  }, 60_000)
})
