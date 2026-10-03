import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FetchResult, PageAction } from '@w2l/contracts'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

/**
 * The actions pipeline in real Chromium against local pages that show their
 * data only after an interaction: a "load more" button, a form, an infinite
 * list, a link robots.txt disallows.
 */

const PROSE = '<p>The harbour office keeps the tide table for every hour of the day, and this page lists the readings the office has published so far.</p>'
let server: Server
let base: string
/** Every path the server was asked for, to show what was never requested. */
const requested: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    requested.push(req.url ?? '')
    const html = (body: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html><head><title>Fixture</title></head><body><main>${body}</main></body></html>`) }
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('User-agent: *\nDisallow: /private\n'); return }
    if (req.url === '/more') return html(`<h1>Readings</h1>${PROSE}<ul id="list"><li class="row">Reading 1</li></ul><button id="more" onclick="setTimeout(() => { for (let i = 2; i <= 4; i++) { const li = document.createElement('li'); li.className = 'row'; li.textContent = 'Reading ' + i; document.getElementById('list').appendChild(li) } }, 300)">Load more</button>`)
    if (req.url === '/form') return html(`<h1>Search</h1>${PROSE}<input id="q"><p id="out"></p><script>document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('out').textContent = 'You searched for ' + e.target.value })</script>`)
    if (req.url === '/scroll') return html(`<h1>Feed</h1>${PROSE}<div id="feed"></div><div style="height:3000px"></div><script>let n = 0; const add = () => { for (let i = 0; i < 5; i++) { const p = document.createElement('p'); p.className = 'item'; p.textContent = 'Item ' + (++n); document.getElementById('feed').appendChild(p) } }; add(); window.addEventListener('scroll', () => { if (n < 15) add() })</script>`)
    if (req.url === '/links') return html(`<h1>Links</h1>${PROSE}<a id="secret" href="/private/page">Private</a><a id="open" href="/more">Open</a>`)
    if (req.url === '/go') { res.writeHead(302, { location: '/private/x' }); res.end(); return }
    if (req.url === '/hop') { res.writeHead(302, { location: '/private/hop' }); res.end(); return }
    if (req.url === '/redirecting') return html(`<h1>Redirecting</h1>${PROSE}<a id="go" href="/go">Go</a><a id="pop" target="_blank" href="/private/popup">Pop</a><a id="popok" target="_blank" href="/more">Pop ok</a>`)
    if (req.url === '/private/x') return html(`<h1>Private x</h1>${PROSE}<p>Not for crawlers.</p><a id="back" href="/more">Back</a>`)
    if (req.url === '/late') return html(`<h1>Late</h1>${PROSE}<button id="go" onclick="setTimeout(() => { location.href = '/private/late' }, 700)">Go</button>`)
    if (req.url === '/spa') return html(`<h1>Tabs</h1>${PROSE}<button id="tab" onclick="history.pushState({}, '', '/private/tab'); document.getElementById('panel').textContent = 'Second tab'">Tab</button><p id="panel">First tab</p><a id="real" href="/gotab">Real</a>`)
    if (req.url === '/gotab') { res.writeHead(302, { location: '/private/tab' }); res.end(); return }
    if (req.url === '/slowhop') { res.writeHead(302, { location: '/delayed' }); res.end(); return }
    if (req.url === '/delayed') return html(`<h1>Delayed</h1>${PROSE}<script>setTimeout(() => { location.href = '/go' }, 300)</script>`)
    if (req.url === '/echo-header') return html(`<h1>Header</h1>${PROSE}<p>X-Test: ${String(req.headers['x-test'] ?? 'none')}</p><button id="b" onclick="document.getElementById('out').textContent = 'The button was clicked.'">B</button><p id="out"></p>`)
    if (req.url === '/data.csv') { res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename=data.csv' }); res.end('a,b\n1,2\n'); return }
    if (req.url?.startsWith('/private')) return html(`<h1>Private page</h1>${PROSE}<p>Not for crawlers.</p>`)
    res.writeHead(404); res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function run(path: string, actions: PageAction[], timeout = 45_000): Promise<FetchResult> {
  const browser = new BrowserLocalSubject('standard')
  try {
    return await browser.fetch(`${base}${path}`, Date.now() + timeout, undefined, undefined, { actions })
  } finally {
    await browser.teardown()
  }
}

const steps = (result: FetchResult) => result.trace.filter((event) => event.event === 'action').map((event) => event.detail)

describe('actions, real browser', () => {
  it('clicks "load more", waits for the rows, and reads the page the steps left', async () => {
    const result = await run('/more', [
      { type: 'scrape' },
      { type: 'click', selector: '#more' },
      { type: 'wait', selector: 'li.row:nth-child(4)' },
      { type: 'executeJavascript', script: 'return document.querySelectorAll("li.row").length' },
      { type: 'screenshot' },
      { type: 'scrape' },
    ])
    expect(result.status).toBe('success')
    expect(result.markdown).toContain('Reading 4')
    expect(result.actions?.scrapes.map((scrape) => (scrape.html.match(/class="row"/g) ?? []).length)).toEqual([1, 4])
    expect(result.actions?.javascriptReturns).toEqual([{ type: 'number', value: 4 }])
    expect(result.actions?.screenshots).toHaveLength(1)
    expect(result.actions?.screenshots[0]?.contentType).toBe('image/png')
    expect(result.actions?.failed).toBeUndefined()
    expect(steps(result).map((detail) => [detail?.index, detail?.type, detail?.outcome])).toEqual([
      [0, 'scrape', 'ok'], [1, 'click', 'ok'], [2, 'wait', 'ok'], [3, 'executeJavascript', 'ok'], [4, 'screenshot', 'ok'], [5, 'scrape', 'ok'],
    ])
  }, 60_000)

  it('types into the focused field and presses a key', async () => {
    const result = await run('/form', [{ type: 'click', selector: '#q' }, { type: 'write', text: 'tide tables' }, { type: 'press', key: 'Enter' }])
    expect(result.status).toBe('success')
    expect(result.markdown).toContain('You searched for tide tables')
  }, 60_000)

  it('scrolls an infinite list until it has loaded more items', async () => {
    const result = await run('/scroll', [{ type: 'scroll', direction: 'down' }, { type: 'wait', milliseconds: 300 }, { type: 'scroll', direction: 'down' }, { type: 'wait', milliseconds: 300 }])
    expect(result.status).toBe('success')
    expect(result.markdown).toContain('Item 15')
  }, 60_000)

  it('prints the page as a PDF', async () => {
    const result = await run('/more', [{ type: 'pdf', format: 'A4', landscape: true, scale: 0.8 }])
    const pdf = result.actions?.pdfs[0]
    expect(pdf).toMatchObject({ contentType: 'application/pdf', format: 'A4', landscape: true, scale: 0.8 })
    expect(Buffer.from(pdf!.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF')
  }, 60_000)

  it('a step that fails ends the pipeline: action_failed, the step named, the page as it stood', async () => {
    const result = await run('/more', [{ type: 'click', selector: '#more' }, { type: 'click', selector: '#no-such-button' }, { type: 'scrape' }])
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('action_failed')
    expect(result.actions?.failed).toMatchObject({ index: 1, type: 'click', code: 'selector_not_found' })
    expect(result.actions?.scrapes).toEqual([])
    expect(result.markdown).toContain('Reading 1')
    expect(steps(result).map((detail) => detail?.outcome)).toEqual(['ok', 'failed'])
  }, 60_000)

  it('a step that leads to a page robots.txt disallows is stopped before the request goes out, and the page stays', async () => {
    requested.length = 0
    const result = await run('/links', [{ type: 'click', selector: '#secret' }, { type: 'scrape' }])
    expect(result.actions?.failed).toMatchObject({ index: 0, code: 'navigation_refused' })
    expect(result.actions?.failed?.message).toContain('/private/page')
    expect(requested).not.toContain('/private/page')
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('action_failed')
    expect(result.markdown).toContain('Links')
    expect(result.trace.some((event) => event.event === 'ssrf_denied')).toBe(false)
  }, 60_000)

  it('a navigation a script starts later, not the step itself, is stopped as well, before its request goes out', async () => {
    requested.length = 0
    // The click sets a 700 ms timer; the redirect fires during the wait that follows.
    const result = await run('/late', [{ type: 'click', selector: '#go' }, { type: 'wait', milliseconds: 1500 }])
    expect(requested).not.toContain('/private/late')
    expect(result.trace.filter((event) => event.event === 'navigation_refused').map((event) => event.detail?.url)).toEqual([`${base}/private/late`])
    expect(result.actions?.failed).toMatchObject({ index: 1, code: 'navigation_refused' })
    expect(result.evidence.finalUrl).toBe(`${base}/late`)
    expect(result.markdown).toContain('Late')
  }, 60_000)

  it('a step whose navigation a server redirects to a disallowed page fails there, and the steps after it never read that page', async () => {
    const result = await run('/redirecting', [{ type: 'click', selector: '#go' }, { type: 'scrape' }, { type: 'click', selector: '#back' }])
    expect(result.actions?.failed).toMatchObject({ index: 0, code: 'navigation_refused' })
    expect(result.actions?.failed?.message).toContain('/private/x')
    expect(result.actions?.scrapes).toEqual([])
    expect(result.markdown ?? '').not.toContain('Not for crawlers')
    expect(result.status).toBe('failed')
  }, 60_000)

  it('a document loaded at the URL pushState had already shown is still checked', async () => {
    const result = await run('/spa', [{ type: 'click', selector: '#tab' }, { type: 'click', selector: '#real' }, { type: 'scrape' }, { type: 'click', selector: '#back' }])
    expect(result.actions?.failed).toMatchObject({ index: 1, code: 'navigation_refused' })
    expect(JSON.stringify(result.actions?.scrapes)).not.toContain('Not for crawlers')
    expect(result.markdown ?? '').not.toContain('Not for crawlers')
  }, 60_000)

  it('a document a page loads between steps, after the guard let its navigation through, is checked before the next step reads it', async () => {
    // /delayed sends the page to /go 300 ms after load; /go redirects to /private/x, which the route never sees.
    const result = await run('/links', [{ type: 'executeJavascript', script: 'location.href = "/slowhop"' }, { type: 'wait', milliseconds: 1500 }, { type: 'scrape' }])
    expect(result.actions?.failed).toMatchObject({ code: 'navigation_refused' })
    expect(JSON.stringify(result.actions?.scrapes)).not.toContain('Not for crawlers')
    expect(result.markdown ?? '').not.toContain('Not for crawlers')
  }, 60_000)

  it('a redirect of the requested URL itself is the fetch\'s, not the steps\'', async () => {
    const result = await run('/hop', [{ type: 'wait', milliseconds: 10 }])
    expect(result.actions?.failed).toBeUndefined()
    expect(result.trace.some((event) => event.event === 'navigation_refused')).toBe(false)
  }, 60_000)

  it('a window a step opens is guarded too, and closed', async () => {
    requested.length = 0
    const result = await run('/redirecting', [{ type: 'click', selector: '#pop' }, { type: 'wait', milliseconds: 800 }])
    expect(requested).not.toContain('/private/popup')
    expect(result.actions?.failed).toMatchObject({ code: 'navigation_refused' })
    const allowed = await run('/redirecting', [{ type: 'click', selector: '#popok' }, { type: 'wait', milliseconds: 500 }])
    expect(allowed.actions?.failed).toBeUndefined()
    expect(allowed.trace.some((event) => event.event === 'popup_closed')).toBe(true)
    expect(allowed.markdown).toContain('Redirecting')
  }, 60_000)

  it('a same-document URL change requests nothing and is not a refused navigation', async () => {
    const result = await run('/spa', [{ type: 'click', selector: '#tab' }])
    expect(result.status).toBe('success')
    expect(result.actions?.failed).toBeUndefined()
    expect(result.markdown).toContain('Second tab')
  }, 60_000)

  it('a step that hangs fails as deadline_exceeded within the deadline, keeping what the steps before it produced and the page', async () => {
    const started = Date.now()
    const result = await run('/more', [{ type: 'screenshot' }, { type: 'executeJavascript', script: 'await new Promise(() => {})' }, { type: 'scrape' }], 8_000)
    expect(Date.now() - started).toBeLessThan(9_000)
    expect(result.actions?.failed).toMatchObject({ index: 1, code: 'deadline_exceeded' })
    expect(result.actions?.screenshots).toHaveLength(1)
    expect(result.failureReason).toBe('action_failed')
    expect(result.markdown).toContain('Reading 1')
  }, 60_000)

  it('a URL that answers a file runs no step, and says so', async () => {
    const result = await run('/data.csv', [{ type: 'executeJavascript', script: 'return 1' }])
    expect(result.actions?.failed).toMatchObject({ index: 0, code: 'action_error' })
    expect(result.actions?.failed?.message).toContain('answered a file')
    expect(result.failureReason).toBe('action_failed')
  }, 60_000)

  it('runs with custom headers, which reach the page as before', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const result = await browser.fetch(`${base}/echo-header`, Date.now() + 45_000, undefined, undefined, { headers: { 'x-test': 'on' }, actions: [{ type: 'click', selector: '#b' }] })
      expect(result.status).toBe('success')
      expect(result.markdown).toContain('X-Test: on')
      expect(result.markdown).toContain('The button was clicked.')
    } finally {
      await browser.teardown()
    }
  }, 60_000)

  it('a page a step moves to that W2L fetches is read, and the trace says where it went', async () => {
    const result = await run('/links', [{ type: 'click', selector: '#open' }, { type: 'wait', selector: '#more' }])
    expect(result.status).toBe('success')
    expect(result.markdown).toContain('Reading 1')
    expect(steps(result)[0]).toMatchObject({ navigatedTo: `${base}/more` })
  }, 60_000)

  it('a script that throws is a script_error', async () => {
    const result = await run('/more', [{ type: 'executeJavascript', script: 'throw new Error("boom")' }])
    expect(result.actions?.failed).toMatchObject({ index: 0, code: 'script_error' })
    expect(result.actions?.failed?.message).toContain('boom')
  }, 60_000)
})
