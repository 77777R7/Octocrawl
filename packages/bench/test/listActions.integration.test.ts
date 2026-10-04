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
    // A first page served at /alias and at /alias?page=1, whose Next from /alias goes to ?page=1 (the hockey site's case).
    if (url === '/alias' || url === '/alias?page=1') return html(`<h1>Alias 1</h1>${PROSE}<ul>${rows(1, 2)}</ul><a class="next" href="/alias?page=${url === '/alias' ? '1' : '2'}">Next</a>`)
    if (url === '/alias?page=2') return html(`<h1>Alias 2</h1>${PROSE}<ul>${rows(3, 4)}</ul>`)
    // A second page that takes 2.5 s to answer, and arrives in pieces.
    if (url === '/slow/1') return html(`<h1>Slow 1</h1>${PROSE}<ul>${rows(1, 2)}</ul><a class="next" href="/slow/2">Next</a>`)
    if (url === '/slow/2') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.write(`<!doctype html><html><head><title>Fixture</title></head><body><main><h1>Slow 2</h1>${PROSE}`)
        setTimeout(() => res.end(`<ul>${rows(3, 4)}</ul></main></body></html>`), 800)
      }, 2500)
      return
    }
    // Pages past the last answer the last (a clamping paginator); Next always offers the next number.
    const clamp = /^\/clamp\?page=(\d+)$/.exec(url)
    if (clamp !== null) { const n = Number(clamp[1]); const shown = Math.min(n, 3); return html(`<h1>Clamp ${shown}</h1>${PROSE}<ul>${rows(shown * 10 + 1, shown * 10 + 4)}</ul><a class="next" href="/clamp?page=${n + 1}">Next</a>`) }
    // Pages with a ticking clock; the last one's Next links to itself.
    const clock = /^\/clock\/(\d)$/.exec(url)
    if (clock !== null) { const n = Number(clock[1]); return html(`<h1>Clock ${n}</h1>${PROSE}<p>Now <span id="t"></span></p><ul>${rows(n * 10 + 1, n * 10 + 4)}</ul><a class="next" href="/clock/${Math.min(n + 1, 3)}">Next</a><script>setInterval(() => { document.getElementById('t').textContent = String(Date.now()) }, 50)</script>`) }
    // A last page whose Next goes nowhere.
    if (url === '/noop/1') return html(`<h1>Noop 1</h1>${PROSE}<ul>${rows(1, 2)}</ul><a class="next" href="/noop/2">Next</a>`)
    if (url === '/noop/2') return html(`<h1>Noop 2</h1>${PROSE}<ul>${rows(3, 4)}</ul><a class="next" href="#">Next</a>`)
    // A button the page's script shows 1.5 s after load (as NPR's is), then as /hiding; and one it never shows.
    if (url === '/shown') return html(`<h1>Shown</h1>${PROSE}<ul id="list">${rows(1, 3)}</ul><div id="opts" style="display:none"><button id="more" onclick="const l = document.getElementById('list'); for (let i = 0; i < 3; i++) { const li = document.createElement('li'); li.className = 'row'; li.textContent = 'Reading ' + (l.children.length + 1); l.appendChild(li) } if (l.children.length >= 9) this.disabled = true">Load more</button></div><script>setTimeout(() => { document.getElementById('opts').style.display = '' }, 1500)</script>`)
    if (url === '/never-shown') return html(`<h1>Never shown</h1>${PROSE}<ul id="list">${rows(1, 3)}</ul><div style="display:none"><button id="more">Load more</button></div>`)
    // A button hidden for 2.5 s while it loads 3 more rows, until 9.
    if (url === '/hiding') return html(`<h1>Hiding</h1>${PROSE}<ul id="list">${rows(1, 3)}</ul><button id="more" onclick="const b = this; b.style.display = 'none'; setTimeout(() => { const l = document.getElementById('list'); for (let i = 0; i < 3; i++) { const li = document.createElement('li'); li.className = 'row'; li.textContent = 'Reading ' + (l.children.length + 1); l.appendChild(li) } if (l.children.length < 9) b.style.display = '' }, 2500)">Load more</button>`)
    // An image grid: items with no text; and a list of the same names on every page, at different prices.
    const grid = /^\/grid\/(\d)$/.exec(url)
    if (grid !== null) { const n = Number(grid[1]); return html(`<h1>Grid ${n}</h1>${PROSE}${Array.from({ length: 4 }, (_, i) => `<a class="tile" href="/item/${n}-${i}"><img src="/img/${n}-${i}.png" alt=""></a>`).join('')}${n < 3 ? `<a class="next" href="/grid/${n + 1}">Next</a>` : ''}`) }
    const prices = /^\/prices\/(\d)$/.exec(url)
    if (prices !== null) { const n = Number(prices[1]); return html(`<h1>Prices on day ${n}</h1>${PROSE}<ul>${['Apples', 'Pears'].map((name, i) => `<li><span class="name">${name}</span> ${n * 10 + i} cents</li>`).join('')}</ul>${n < 3 ? `<a class="next" href="/prices/${n + 1}">Next</a>` : ''}`) }
    // Rows whose prices tick every 50 ms.
    const ticker = /^\/ticker\/(\d)$/.exec(url)
    if (ticker !== null) { const n = Number(ticker[1]); return html(`<h1>Quotes</h1>${PROSE}<ul>${[1, 2, 3, 4].map((i) => `<li class="q">SYM${n}${i} <span class="px"></span></li>`).join('')}</ul>${n < 4 ? `<a class="next" href="/ticker/${n + 1}">Next</a>` : ''}<script>setInterval(() => { for (const px of document.querySelectorAll('.px')) px.textContent = String(Math.random()) }, 50)</script>`) }
    // The alias pages with a footer that differs on every load.
    const footer = `<p>Page generated in ${Math.random().toFixed(6)} s</p>`
    if (url === '/falias' || url === '/falias?page=1') return html(`<h1>Alias 1</h1>${PROSE}<ul>${rows(1, 2)}</ul><a class="next" href="/falias?page=${url === '/falias' ? '1' : '2'}">Next</a>${footer}`)
    if (url === '/falias?page=2') return html(`<h1>Alias 2</h1>${PROSE}<ul>${rows(3, 4)}</ul>${footer}`)
    // A gallery whose pages share every line of text; and one paginated in place, the URL unchanged.
    const gallery = /^\/gallery\/(\d)$/.exec(url)
    if (gallery !== null) { const n = Number(gallery[1]); return html(`<h1>Gallery</h1>${PROSE}${[0, 1, 2, 3].map((i) => `<a class="tile" href="/photo/${n}-${i}"><img src="/img/${n}-${i}.png" alt=""></a>`).join('')}${n < 3 ? `<a class="next" href="/gallery/${n + 1}">Next</a>` : ''}`) }
    if (url === '/inplace') return html(`<h1>Gallery</h1>${PROSE}<div id="g">${[0, 1, 2, 3].map((i) => `<img class="tile" src="/img/1-${i}.png" alt="">`).join('')}</div><button id="next" onclick="const p = (window.p = (window.p || 1) + 1); document.querySelectorAll('img.tile').forEach((img, i) => { img.src = '/img/' + p + '-' + i + '.png' }); if (p >= 3) this.disabled = true">Next</button>`)
    // An app that pushes ?page=N at once and fetches its rows 2.4 s later, keeping the old rows meanwhile; Next goes on page 3.
    if (url === '/spa' || url.startsWith('/spa?')) return html(`<h1>App</h1>${PROSE}<ul id="l">${rows(1, 4)}</ul><button id="next">Next</button><script>let p = 1; document.getElementById('next').onclick = () => { p++; history.pushState({}, '', '/spa?page=' + p); const asked = p; fetch('/api?page=' + p).then((r) => r.json()).then((list) => { if (asked !== p) return; document.getElementById('l').innerHTML = list.map((t) => '<li class="row">' + t + '</li>').join(''); if (p >= 3) document.getElementById('next').remove() }) }</script>`)
    // An app like /spa whose second page's rows arrive just after W2L's first look at them (between two reads of one look), and
    // whose third page's rows arrive 1.5 s after the URL changes.
    if (url === '/spaswap' || url.startsWith('/spaswap?')) return html(`<h1>App</h1>${PROSE}<ul id="l">${rows(1, 4)}</ul><button id="next">Next</button><script>let p = 1; let armed = false; const show = (n) => { document.getElementById('l').innerHTML = [1, 2, 3, 4].map((i) => '<li class="row">Reading ' + (n * 10 + i) + '</li>').join(''); if (n >= 3) document.getElementById('next').remove() }; const all = document.querySelectorAll.bind(document); document.querySelectorAll = (selector) => { const found = all(selector); if (armed && selector === 'li.row') { armed = false; setTimeout(() => show(2), 50) } return found }; document.getElementById('next').onclick = () => { p++; history.pushState({}, '', '/spaswap?page=' + p); if (p === 2) armed = true; else { const asked = p; setTimeout(() => show(asked), 1500) } }</script>`)
    // Two pages of 20,000 links each, built in the browser.
    const many = /^\/many\/(\d)$/.exec(url)
    if (many !== null) { const n = Number(many[1]); return html(`<h1>Many ${n}</h1>${PROSE}<div id="all"></div>${n < 2 ? `<a class="next" href="/many/${n + 1}">Next</a>` : ''}<script>document.getElementById('all').innerHTML = Array.from({ length: 20000 }, (_, i) => '<a href="/wiki/Page_${n}_' + i + '">Page ' + i + '</a>').join(' ')</script>`) }
    const api = /^\/api\?page=(\d)$/.exec(url)
    if (api !== null) { const n = Number(api[1]); setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify([1, 2, 3, 4].map((i) => `Reading ${n * 10 + i}`))) }, 2400); return }
    // The same app drawing each page's 8 rows one by one, 100 ms apart, over the old ones: a page read while it draws is half one page and half the next.
    if (url === '/draw' || url.startsWith('/draw?')) return html(`<h1>App</h1>${PROSE}<ul id="l">${rows(1, 8)}</ul><button id="next">Next</button><script>let p = 1; document.getElementById('next').onclick = () => { p++; history.pushState({}, '', '/draw?page=' + p); const asked = p; fetch('/api8?page=' + p).then((r) => r.json()).then((list) => { const rows = document.querySelectorAll('#l > li'); list.forEach((t, i) => setTimeout(() => { if (asked === p) rows[i].textContent = t }, i * 100)); setTimeout(() => { if (asked === p && p >= 3) document.getElementById('next').remove() }, list.length * 100) }) }</script>`)
    const api8 = /^\/api8\?page=(\d)$/.exec(url)
    if (api8 !== null) { const n = Number(api8[1]); setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Reading ${n * 10 + i}`))) }, 1500); return }
    // Item links whose query changes on every load (a search id), on an alias first page and a clamping paginator.
    const qrows = (from: number) => [0, 1].map((i) => `<li class="row"><a href="/item/${from + i}?qid=${Date.now()}${Math.random()}">Reading ${from + i}</a></li>`).join('')
    if (url === '/qalias' || url === '/qalias?page=1') return html(`<h1>Q 1</h1>${PROSE}<ul>${qrows(1)}</ul><a class="next" href="/qalias?page=${url === '/qalias' ? '1' : '2'}">Next</a>`)
    if (url === '/qalias?page=2') return html(`<h1>Q 2</h1>${PROSE}<ul>${qrows(3)}</ul>`)
    const qclamp = /^\/qclamp\?page=(\d+)$/.exec(url)
    if (qclamp !== null) { const n = Number(qclamp[1]); const shown = Math.min(n, 3); return html(`<h1>Q clamp ${shown}</h1>${PROSE}<ul>${qrows(shown * 10)}</ul><a class="next" href="/qclamp?page=${n + 1}">Next</a>`) }
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

  it('paginate reads a page once though the site serves it under two URLs, and goes on past the second', async () => {
    const result = await run('/alias', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul > li', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 2, itemsRead: 4 })
    expect(result.actions?.scrapes.map((scrape) => scrape.url)).toEqual([`${base}/alias`, `${base}/alias?page=2`])
  }, 60_000)

  it('paginate waits for a slow next page, and reads it whole', async () => {
    const result = await run('/slow/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul > li', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 2, itemsRead: 4 })
    expect(result.actions?.scrapes[1]?.html).toContain('Reading 4')
  }, 60_000)

  it('paginate stops on a site that answers every page past the last with the last one, without waiting for the deadline', async () => {
    const started = Date.now()
    const result = await run('/clamp?page=1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul > li', maxPages: 10, waitMs: 200 }])
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'repeat', rounds: 3, itemsRead: 12 })
    expect(result.warnings?.some((warning) => warning.code === 'list_not_exhausted') ?? false).toBe(false)
  }, 60_000)

  it('paginate tells pages apart by their items, so a ticking clock does not make a page read twice look new', async () => {
    const result = await run('/clock/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul > li', maxPages: 8, waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'repeat', rounds: 3, itemsRead: 12 })
    expect(result.actions?.scrapes).toHaveLength(3)
  }, 60_000)

  it('a list that meets the deadline stops as deadline, keeping what it read, and the scrape does not fail', async () => {
    const result = await run('/noop/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul > li', waitMs: 200 }], 9_000)
    expect(result.actions?.failed).toBeUndefined()
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: expect.stringMatching(/^(deadline|repeat)$/), rounds: 2 })
    expect(result.status).toBe('success')
  }, 60_000)

  it('loadMore waits for a control hidden while it loads, and reads the whole list', async () => {
    const result = await run('/hiding', [{ type: 'loadMore', selector: '#more', itemSelector: 'li.row' }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 2, items: 9 })
  }, 60_000)

  it('loadMore waits for a control the page shows only after load before the first click, and one never shown ends the list unclicked', async () => {
    const shown = await run('/shown', [{ type: 'loadMore', selector: '#more', itemSelector: 'li.row', waitMs: 200 }])
    expect(shown.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 2, items: 9 })
    const never = await run('/never-shown', [{ type: 'loadMore', selector: '#more', itemSelector: 'li.row', waitMs: 200 }])
    expect(never.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 0, items: 3 })
  }, 90_000)

  it('paginate reads pages whose items have no text, or the same text, when the pages differ', async () => {
    const grid = await run('/grid/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'a.tile', waitMs: 200 }])
    expect(grid.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, itemsRead: 12 })
    const prices = await run('/prices/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul > li', waitMs: 200 }])
    expect(prices.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3 })
  }, 60_000)

  it('paginate without itemSelector is not fooled by a ticking clock either', async () => {
    const result = await run('/clock/1', [{ type: 'paginate', nextSelector: 'a.next', maxPages: 8, waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'repeat', rounds: 3 })
    expect(result.warnings?.some((warning) => warning.code === 'list_not_exhausted') ?? false).toBe(false)
  }, 60_000)

  it('paginate reads every page when the prices in its rows tick, with or without itemSelector', async () => {
    const withItems = await run('/ticker/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'li.q', waitMs: 200 }])
    expect(withItems.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 4, itemsRead: 16 })
    const without = await run('/ticker/1', [{ type: 'paginate', nextSelector: 'a.next', waitMs: 200 }])
    expect(without.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 4 })
  }, 60_000)

  it('with itemSelector, a page read before under another URL is skipped though a footer differs on every load', async () => {
    const result = await run('/falias', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'ul > li', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 2, itemsRead: 4 })
  }, 60_000)

  it('paginate reads a gallery whose pages share their text, by URL or in place', async () => {
    const byUrl = await run('/gallery/1', [{ type: 'paginate', nextSelector: 'a.next', waitMs: 200 }])
    expect(byUrl.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3 })
    const tiles = await run('/gallery/1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'a.tile', waitMs: 200 }])
    expect(tiles.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, itemsRead: 12 })
    const inPlace = await run('/inplace', [{ type: 'paginate', nextSelector: '#next', waitMs: 200 }])
    expect(inPlace.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3 })
  }, 90_000)

  it('paginate waits for an app that changes the URL first and loads its rows after, and reads each page once', async () => {
    const result = await run('/spa', [{ type: 'paginate', nextSelector: '#next', itemSelector: 'li.row', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, itemsRead: 12 })
    expect(result.actions?.scrapes[1]?.html).toContain('Reading 21')
  }, 90_000)

  it('paginate reads a page whose rows changed between its two reads once, as the rows it settled on', async () => {
    const result = await run('/spaswap', [{ type: 'paginate', nextSelector: '#next', itemSelector: 'li.row', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, itemsRead: 12 })
    expect(result.actions?.scrapes.map((scrape) => /Reading (\d+)/.exec(scrape.html)?.[1])).toEqual(['1', '21', '31'])
  }, 90_000)

  it('paginate without itemSelector reads pages of tens of thousands of links in time linear in them', async () => {
    const started = Date.now()
    const result = await run('/many/1', [{ type: 'paginate', nextSelector: 'a.next', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 2 })
    // Comparing each link with the ones read before, link by link, took seconds a read on these pages.
    expect(Date.now() - started).toBeLessThan(15_000)
  }, 90_000)

  it('paginate reads a page the app is still drawing only once it has drawn it', async () => {
    const result = await run('/draw', [{ type: 'paginate', nextSelector: '#next', itemSelector: 'li.row', waitMs: 200 }])
    expect(result.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, itemsRead: 24 })
    expect(result.actions?.scrapes.map((scrape) => /Reading (\d+)<\/li><\/ul>/.exec(scrape.html)?.[1])).toEqual(['8', '28', '38'])
    expect(result.actions?.scrapes[1]?.html).not.toMatch(/Reading [1-8]</)
  }, 90_000)

  it('item links whose query changes on every load do not make a page read before look new', async () => {
    const alias = await run('/qalias', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'li.row', waitMs: 200 }])
    expect(alias.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'end', rounds: 2, itemsRead: 4 })
    const clamp = await run('/qclamp?page=1', [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'li.row', maxPages: 6, waitMs: 200 }])
    expect(clamp.actions?.lists?.[0]).toMatchObject({ stoppedBy: 'repeat', rounds: 3, itemsRead: 6 })
  }, 120_000)

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
