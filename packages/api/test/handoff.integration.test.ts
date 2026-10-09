import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { buildChannels } from '@w2l/bench'
import { localNetworkPolicy, type CrawlPage } from '@w2l/contracts'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import { openUserChrome } from '../src/chromeHandoff.js'

/**
 * The handoff end to end: a batch stopped at a check, handed to "the person"
 * in a real Chromium that remote debugging is on in (as the person's Chrome
 * would be), who gets through it there; W2L reads the page and the item's
 * stopped result is replaced, and only then. The test plays the person, in
 * the tabs W2L opens.
 */

let server: Server
let base: string
let root: string
let chrome: BrowserContext

const ARTICLE = `<article><h1>The member page</h1>${'<p>What is behind the check: a page of prose, long enough to be read as an article and not as a stub. </p>'.repeat(4)}</article>`
/** A captcha its button passes, by setting `name` (one per page: the tests share one browser, and its cookies). */
const captcha = (name: string) => `<div class="g-recaptcha" data-sitekey="test-key"></div><button id="pass" onclick="document.cookie='${name}=1; path=/'; location.reload()">I am human</button>`

beforeAll(async () => {
  server = createServer((req, res) => {
    const cookie = req.headers.cookie ?? ''
    const html = (body: string, status = 200, headers: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(`<!doctype html><html><head><title>Members</title></head><body>${body}</body></html>`) }
    if (req.url === '/robots.txt') { res.writeHead(404); res.end(); return }
    if (req.url === '/open') return html(ARTICLE.replace('member page', 'open page'))
    // As a Lark sheet: its grid on a canvas, its shortcut list in a sidebar a class hides; a closed tab, a hidden box
    // with one thing shown in it, and the page's data. First, an element whose class adds a child to each copy made of it,
    // and a form named for a property of the document.
    if (req.url === '/sheet') {
      return html(`<x-grow></x-grow><form name="implementation"></form><style>.hotkeys { visibility: hidden } .shown { visibility: visible }</style><canvas width="600" height="300"></canvas>${ARTICLE}`
        + `<div class="hotkeys"><ul>${'<li>Insert new sheet Shift F11</li>'.repeat(40)}</ul><p class="shown">Shown inside the hidden box</p></div>`
        + '<div style="display:none">The closed tab</div><script type="application/ld+json">{"@type":"Thing","name":"The data"}</script>'
        + '<script>customElements.define("x-grow", class extends HTMLElement { constructor() { super(); this.appendChild(document.createElement("span")) } })</script>')
    }
    // A captcha until the person passes it: their browser then holds the cookie the page checks.
    if (req.url === '/gate') return cookie.includes('passed=1') ? html(ARTICLE) : html(captcha('passed'))
    // Through the captcha, a page with nothing on it: not the page asked for.
    if (req.url === '/thin') return cookie.includes('thin=1') ? html('<p>ok</p>') : html(captcha('thin'))
    // Behind the captcha, a page with a search box that takes the focus and a sign-in box it hides.
    if (req.url === '/search') return cookie.includes('search=1') ? html(`<input name="q" autofocus><div style="display:none"><input type="password"></div>${ARTICLE}`) : html(captcha('search'))
    // A challenge that runs its script for a moment, then reloads into the page by itself.
    if (req.url === '/jsc') return cookie.includes('js=1') ? html(ARTICLE) : html('<div class="g-recaptcha" data-sitekey="k"></div><script>setTimeout(() => { document.cookie = "js=1; path=/"; location.reload() }, 1500)</script>')
    // A login-walled page: signed out, it sends you to sign in, and signing in ends on the home page.
    if (req.url === '/orders') {
      if (cookie.includes('member=1')) return html(ARTICLE.replace('The member page', 'Your orders'))
      res.writeHead(302, { location: '/signin' }); res.end(); return
    }
    if (req.url === '/signin') return html('<h1>Sign in</h1><form><input name="user"><input type="password" name="pw"><button id="in" type="button" onclick="document.cookie=\'member=1; path=/\'; location.href=\'/\'">Sign in</button></form>')
    if (req.url === '/') return html(ARTICLE.replace('The member page', 'Welcome home'))
    // A page whose own data is not on it: the JSON format asks the model.
    if (req.url === '/slowpass') return cookie.includes('slowpass=1') ? html(ARTICLE) : html(captcha('slowpass'))
    // A scrape's page, behind its own captcha.
    if (req.url === '/single') return cookie.includes('single=1') ? html(ARTICLE.replace('The member page', 'The single page')) : html(captcha('single'))
    if (req.url === '/unpriced') return cookie.includes('unpriced=1') ? html(ARTICLE.replace('The member page', 'The unpriced page')) : html(captcha('unpriced'))
    // A page that keeps the widget's script once the person is through it (as a Turnstile page does).
    if (req.url === '/turnstile') return cookie.includes('turnstile=1') ? html(`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>${ARTICLE}`) : html(`<div class="cf-turnstile" data-sitekey="k"></div>${captcha('turnstile')}`)
    // Behind its captcha, a page that keeps the widget's script and has its prose in what blockAds takes for an ad.
    if (req.url === '/inad') return cookie.includes('inad=1') ? html(`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script><div class="ad">${ARTICLE.replace('The member page', 'The page in an ad box')}</div>`) : html(captcha('inad'))
    // A batch item behind its captcha, whose replacement the batch's webhook hears of.
    if (req.url === '/hooked') return cookie.includes('hooked=1') ? html(ARTICLE.replace('The member page', 'The hooked page')) : html(captcha('hooked'))
    // A scrape's page behind its captcha, asked for with a cache lookup; and one nobody gets through.
    if (req.url === '/cached') return cookie.includes('cached=1') ? html(ARTICLE.replace('The member page', 'The cached page')) : html(captcha('cached'))
    if (req.url === '/never') return html(captcha('never'))
    // Checks that pass by themselves in a browser, with nobody there: a script that reloads into the page, a meta refresh.
    if (req.url === '/auto') return cookie.includes('auto=1') ? html(ARTICLE) : html('<div class="g-recaptcha" data-sitekey="k"></div><script>document.cookie = "auto=1; path=/"; setTimeout(() => location.reload(), 300)</script>')
    if (req.url === '/meta') return cookie.includes('meta=1') ? html(ARTICLE) : html('<meta http-equiv="refresh" content="0; url=/meta2"><div class="g-recaptcha" data-sitekey="k"></div>')
    if (req.url === '/meta2') { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'meta=1; path=/' }); res.end(`<!doctype html><html><body>${ARTICLE}</body></html>`); return }
    // A three-page list whose second page is a captcha until the person passes it: the list's check at page 2.
    const list = /^\/list\/(\d)$/.exec(req.url ?? '')
    if (list !== null) {
      const n = Number(list[1])
      const cards = [1, 2, 3].map((i) => `<div class="card"><a class="name" href="/p/${n * 10 + i}">Item ${n * 10 + i}</a><span class="price">${n * 10 + i}.00</span></div>`).join('')
      if (n === 2 && !cookie.includes('list=1')) return html(captcha('list'))
      return html(`${cards}${n < 3 ? `<a class="next" href="/list/${n + 1}">Next</a>` : ''}`)
    }
    // The same list on a site that rewrites the address of the page it shows, as Indeed does (it drops its paging token and
    // names the job shown): page 2's address loses `pp` and gains `vjk` once it has come, with no new document.
    const rewritten = /^\/rlist\/(\d)(\?.*)?$/.exec(req.url ?? '')
    if (rewritten !== null) {
      const n = Number(rewritten[1])
      const cards = [1, 2, 3].map((i) => `<div class="card"><a class="name" href="/p/${n * 10 + i}">Item ${n * 10 + i}</a><span class="price">${n * 10 + i}.00</span></div>`).join('')
      if (n === 2 && !cookie.includes('rlist=1')) return html(captcha('rlist'))
      const next = n === 1 ? '<a class="next" href="/rlist/2?q=x&pp=tok">Next</a>' : n === 2 ? '<a class="next" href="/rlist/3?q=x">Next</a>' : ''
      const rewrite = n === 2 ? `<script>history.replaceState(null, '', '/rlist/2?q=x&vjk=21')</script>` : ''
      return html(`${cards}${next}${rewrite}`)
    }
    // A check that passes by itself, then a page whose "More" link moves it in place to its second page (pushState, new content):
    // the person's click, not the page's own rewrite.
    if ((req.url ?? '').startsWith('/spage')) {
      if (!cookie.includes('spage=1')) return html('<div class="g-recaptcha" data-sitekey="k"></div><script>document.cookie = "spage=1; path=/"; setTimeout(() => location.reload(), 300)</script>')
      return html(`${ARTICLE}<a id="more" href="#" onclick="event.preventDefault(); history.pushState(null, '', '/spage?page=2'); document.querySelector('article').innerHTML = '<h1>Page two</h1>' + '<p>The second page of the list, which the person moved to by a click in the page. </p>'.repeat(4)">More</a>`)
    }
    // A bot check that only its header says (a vendor's), never passed here.
    if (req.url === '/dd') return html('<p>Access denied.</p>', 403, { 'x-datadome': 'protected' })
    // A sign-in, then a one-time code, then the page.
    if (req.url === '/account') {
      if (cookie.includes('code=1')) return html(ARTICLE)
      if (cookie.includes('signed=1')) return html('<p>Check your phone</p><form><input id="code" autocomplete="one-time-code"><button id="go" type="button" onclick="document.cookie=\'code=1; path=/\'; location.reload()">Go</button></form>')
      return html('<h1>Sign in</h1><form><input name="user"><input type="password" name="pw"><button id="in" type="button" onclick="document.cookie=\'signed=1; path=/\'; location.reload()">Sign in</button></form>')
    }
    res.writeHead(404); res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'w2l-handoff-'))
  // "The person's Chrome": remote debugging on, so Chrome writes DevToolsActivePort in its user data directory.
  chrome = await chromium.launchPersistentContext(join(root, 'chrome'), { args: ['--remote-debugging-port=0'] })
}, 60_000)

afterAll(async () => {
  await chrome?.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

function engineFor(taskRoot: string, userDataDir = join(root, 'chrome')): ApiEngine {
  const http = buildChannels('standard', { localSubjects: { browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!
  return createApiEngine({ taskRoot, channelsFor: () => [http], userChrome: { userDataDir } })
}

async function batchOf(engine: ApiEngine, paths: string[]): Promise<string> {
  const { taskId } = await engine.startBatch({ urls: paths.map((path) => `${base}${path}`), formats: ['markdown'] } as never)
  for (let i = 0; i < 300; i++) {
    const report = await engine.getBatch(taskId)
    if (report !== null && ['completed', 'failed', 'cancelled'].includes(report.status)) return taskId
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('batch did not finish')
}

async function itemsOf(engine: ApiEngine, taskId: string): Promise<CrawlPage[]> {
  return (await engine.getBatchItems(taskId, { limit: 50, debug: true }))!.items
}

/** The person: what they do in each tab W2L opens, by its path. */
function person(context: BrowserContext, acts: Record<string, (page: Page) => Promise<void>>): () => void {
  const listener = (page: Page) => {
    void (async () => {
      await page.waitForURL((url) => url.href.startsWith(base), { timeout: 20_000 })
      await acts[new URL(page.url()).pathname]?.(page)
    })().catch(() => undefined)
  }
  context.on('page', listener)
  return () => context.off('page', listener)
}

describe('reading a page in the person\'s own Chrome', () => {
  it('shownOnly reads the page as it shows: not a panel or a tab it hides, but what is shown inside a hidden box, and its scripts', async () => {
    const reader = await openUserChrome({ userDataDir: join(root, 'chrome') })
    try {
      const shown = await reader.read(`${base}/sheet`, { unattended: true, shownOnly: true, pollMs: 50, waitMs: 20_000 })
      expect(shown.html).toContain('The member page')
      expect(shown.html).toContain('Shown inside the hidden box')
      expect(shown.html).toContain('"name":"The data"')
      expect(shown.html).toContain('<canvas')
      expect(shown.html).not.toContain('Insert new sheet')
      expect(shown.html).not.toContain('The closed tab')
      // The whole document beside it, read at the same moment.
      expect(shown.document).toContain('Insert new sheet')
      // Without it, the whole document, as before.
      const whole = await reader.read(`${base}/sheet`, { unattended: true, pollMs: 50, waitMs: 20_000 })
      expect(whole.html).toContain('Insert new sheet')
      expect(whole.html).toContain('The closed tab')
    } finally {
      reader.close()
    }
  }, 60_000)
})

describe('handing a page a check stopped to the person, in their own Chrome', () => {
  it('the stopped item waits for the person; once they are through, W2L reads the page there and the item is the page', async () => {
    const engine = engineFor(join(root, 'tasks-1'))
    const opened: string[] = []
    const seen = (page: Page) => { opened.push(page.url()) }
    chrome.on('page', seen)
    const stop = person(chrome, { '/gate': async (page) => { await page.click('#pass') } })
    try {
      const taskId = await batchOf(engine, ['/gate', '/open'])
      expect(await engine.getBatch(taskId)).toMatchObject({ status: 'completed', waitingForPerson: 1 })
      const stopped = (await itemsOf(engine, taskId)).find((item) => item.url.endsWith('/gate'))!
      expect(stopped).toMatchObject({ status: 'blocked', blockReason: 'captcha', handoff: { reason: 'captcha_required', liveViewUrl: null } })
      expect((await itemsOf(engine, taskId)).find((item) => item.url.endsWith('/open'))!.handoff).toBeUndefined()

      const done = await engine.handOffBatch(taskId, {})
      expect(done).toMatchObject({ id: taskId, handedOff: 1, through: 1, notThrough: 0, items: [{ id: stopped.id, url: `${base}/gate`, through: true, status: 'success' }] })
      // W2L opened one tab, blank first, for the stopped page alone, and closed it when it had read it.
      expect(opened).toEqual(['about:blank'])
      for (let i = 0; i < 40 && chrome.pages().some((page) => page.url().startsWith(base)); i++) await new Promise((resolve) => setTimeout(resolve, 50))
      expect(chrome.pages().some((page) => page.url().startsWith(base))).toBe(false)

      const item = (await itemsOf(engine, taskId)).find((entry) => entry.url.endsWith('/gate'))!
      expect(item).toMatchObject({ id: stopped.id, status: 'success', lane: 'browser_local_authed', blockReason: null, evidence: { contentType: 'text/html; charset=utf-8', httpStatus: 200 } })
      expect(item.handoff).toBeUndefined()
      expect(item.markdown).toContain('What is behind the check')
      // W2L sent nothing for it: the person's browser did, as them; no hint speaks of W2L's own lanes, whose run it replaced.
      expect(item.evidenceRecord).toMatchObject({ lane: 'browser_local_authed', status: 'success', identity: { mode: 'authed', userAgent: null }, robotsDecision: { decision: 'no_robots' } })
      expect(item.trace.map((event) => event.event)).toContain('user_browser_read')
      expect(item.audit).toBeUndefined()
      expect(JSON.stringify(item.agentHints ?? [])).not.toContain('lane served')
      expect(await engine.getBatch(taskId)).toMatchObject({ waitingForPerson: 0, succeeded: 2, failed: 0 })
      expect(await engine.handOffBatch(taskId, {})).toMatchObject({ handedOff: 0, items: [] })
    } finally {
      stop()
      chrome.off('page', seen)
      await engine.close()
    }
  }, 120_000)

  it('a sign-in with a code is waited for while the person is at it, and the page read after', async () => {
    const engine = engineFor(join(root, 'tasks-2'))
    const stop = person(chrome, {
      '/account': async (page) => {
        await page.click('#in')
        await page.waitForSelector('#code')
        // The person takes their time with the code: W2L does not read the code page.
        await page.click('#code')
        await page.waitForTimeout(4_000)
        await page.click('#go')
      },
    })
    try {
      const taskId = await batchOf(engine, ['/account'])
      expect((await itemsOf(engine, taskId))[0]).toMatchObject({ status: 'blocked', blockReason: 'login_wall', handoff: { reason: 'login_required' } })
      expect(await engine.handOffBatch(taskId, {})).toMatchObject({ through: 1 })
      expect((await itemsOf(engine, taskId))[0]!.markdown).toContain('What is behind the check')
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a list stopped at a check: the person gets through it and pages on in their Chrome, Octocrawl reads each page and the item is the whole list', async () => {
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const engine = createApiEngine({ taskRoot: join(root, 'tasks-list'), networkPolicy: policy, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'browser_local'), userChrome: { userDataDir: join(root, 'chrome') } })
    const stop = person(chrome, { '/list/2': async (page) => { await page.click('#pass'); await page.waitForSelector('a.next'); await page.waitForTimeout(4_000); await page.click('a.next') } })
    try {
      const LIST = { type: 'list', itemSelector: 'div.card', fields: [{ name: 'name', selector: 'a.name' }, { name: 'price', selector: '.price' }] }
      const { taskId } = await engine.startBatch({ urls: [`${base}/list/1`], formats: ['markdown', LIST], actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200 }] } as never)
      for (let i = 0; i < 600; i++) { const report = await engine.getBatch(taskId); if (report !== null && ['completed', 'failed', 'cancelled'].includes(report.status)) break; await new Promise((resolve) => setTimeout(resolve, 50)) }
      // Octocrawl's own browser read page 1, met the captcha where page 2 should be, and stopped there with page 1 kept.
      expect(await engine.getBatch(taskId)).toMatchObject({ status: 'completed', waitingForPerson: 1 })
      const stopped = (await itemsOf(engine, taskId))[0]!
      expect(stopped).toMatchObject({ status: 'blocked', blockReason: 'captcha', handoff: { reason: 'captcha_required' } })
      expect(stopped.actions?.lists[0]).toMatchObject({ stoppedBy: 'challenge', rounds: 1, challenge: { page: 2, reason: 'captcha' } })

      const done = await engine.handOffBatch(taskId, {})
      expect(done).toMatchObject({ handedOff: 1, through: 1, notThrough: 0, items: [{ id: stopped.id, through: true, status: 'success' }] })
      const item = (await itemsOf(engine, taskId))[0]!
      expect(item).toMatchObject({ id: stopped.id, status: 'success', lane: 'browser_local_authed', blockReason: null })
      // Page 1 from Octocrawl's own read, pages 2 and 3 as the person showed them: every record once, each page its own.
      expect(item.list?.records.map((record) => record.values.name)).toEqual([11, 12, 13, 21, 22, 23, 31, 32, 33].map((n) => `Item ${n}`))
      expect(item.list?.records.map((record) => record.source.page)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3])
      // The items as counted on each page: 3 on the last, 9 over the three (page 1's from Octocrawl's own read).
      expect(item.actions?.lists[0]).toMatchObject({ type: 'paginate', stoppedBy: 'end', rounds: 3, items: 3, itemsRead: 9, continued: { from: 2, pages: 2, by: 'user_browser' } })
      // The pages' counts stay inside: a scrape is its address, its HTML, its step and who read it.
      expect(item.actions?.scrapes.map((scrape) => Object.keys(scrape).sort().join())).toEqual(['html,step,url', 'by,html,step,url', 'by,html,step,url'])
      expect(item.trace.map((event) => event.event)).toEqual(expect.arrayContaining(['handoff_from', 'user_browser_read', 'list_continued', 'list_extracted']))
      expect(item.handoff).toBeUndefined()
      expect(await engine.getBatch(taskId)).toMatchObject({ waitingForPerson: 0, succeeded: 1, failed: 0 })
      expect(await engine.handOffBatch(taskId, {})).toMatchObject({ handedOff: 0 })
    } finally {
      stop()
      await engine.close()
    }
  }, 180_000)

  it('a list page whose script rewrites its address once it has come (a token dropped, the item shown named) is still the page asked for', async () => {
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const engine = createApiEngine({ taskRoot: join(root, 'tasks-rlist'), networkPolicy: policy, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'browser_local'), userChrome: { userDataDir: join(root, 'chrome') } })
    const stop = person(chrome, { '/rlist/2': async (page) => { await page.click('#pass'); await page.waitForSelector('a.next'); await page.waitForTimeout(4_000); await page.click('a.next') } })
    try {
      const LIST = { type: 'list', itemSelector: 'div.card', fields: [{ name: 'name', selector: 'a.name' }, { name: 'price', selector: '.price' }] }
      const { taskId } = await engine.startBatch({ urls: [`${base}/rlist/1`], formats: ['markdown', LIST], actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200 }] } as never)
      for (let i = 0; i < 600; i++) { const report = await engine.getBatch(taskId); if (report !== null && ['completed', 'failed', 'cancelled'].includes(report.status)) break; await new Promise((resolve) => setTimeout(resolve, 50)) }
      const stopped = (await itemsOf(engine, taskId))[0]!
      expect(stopped.actions?.lists[0]).toMatchObject({ stoppedBy: 'challenge', rounds: 1, challenge: { page: 2, url: `${base}/rlist/2?q=x&pp=tok` } })

      // Through the check, the tab shows page 2 at the address its script set, not the one asked for: still that page.
      expect(await engine.handOffBatch(taskId, {})).toMatchObject({ handedOff: 1, through: 1, notThrough: 0 })
      const item = (await itemsOf(engine, taskId))[0]!
      expect(item.list?.records.map((record) => record.values.name)).toEqual([11, 12, 13, 21, 22, 23, 31, 32, 33].map((n) => `Item ${n}`))
      expect(item.actions?.lists[0]).toMatchObject({ stoppedBy: 'end', rounds: 3, items: 3, itemsRead: 9, continued: { from: 2, pages: 2, by: 'user_browser' } })
      // Each page the person showed is recorded at the address the tab had.
      expect(item.actions?.scrapes.filter((page) => page.by === 'user_browser').map((page) => page.url.replace(base, ''))).toEqual(['/rlist/2?q=x&vjk=21', '/rlist/3?q=x'])
    } finally {
      stop()
      await engine.close()
    }
  }, 180_000)

  it('an address the person\'s own click moved in place (to the list\'s second page) is not the page asked for: the tab is taken back, and the page read', async () => {
    const engine = engineFor(join(root, 'tasks-spage'))
    const stop = person(chrome, { '/spage': async (page) => { await page.waitForSelector('#more'); await page.click('#more') } })
    try {
      const taskId = await batchOf(engine, ['/spage'])
      expect((await itemsOf(engine, taskId))[0]).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
      expect(await engine.handOffBatch(taskId, {})).toMatchObject({ through: 1 })
      const item = (await itemsOf(engine, taskId))[0]!
      expect(item.markdown).toContain('What is behind the check')
      expect(item.markdown).not.toContain('Page two')
      expect(item.evidence?.finalUrl).toBe(`${base}/spage`)
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a page not got through (a check its header alone says, or nothing on the page after) keeps its stopped result, and still waits', async () => {
    const engine = engineFor(join(root, 'tasks-3'))
    const stop = person(chrome, { '/thin': async (page) => { await page.click('#pass') } })
    try {
      const taskId = await batchOf(engine, ['/dd', '/thin'])
      const before = await itemsOf(engine, taskId)
      expect(before.map((item) => [new URL(item.url).pathname, item.status, item.blockReason])).toEqual([['/dd', 'blocked', 'bot_detected_generic'], ['/thin', 'blocked', 'captcha']])
      const done = await engine.handOffBatch(taskId, { waitMs: 6_000 })
      expect(done).toMatchObject({ handedOff: 2, through: 0, notThrough: 2 })
      expect(done!.items.map((item) => item.reason)).toEqual([expect.stringContaining('still showed a check (bot_detected_generic: header_x_datadome'), expect.stringContaining('was failed (empty_unverified), not the page')])
      const after = await itemsOf(engine, taskId)
      expect(after.map((item) => [item.id, item.status, item.blockReason, item.lane])).toEqual(before.map((item) => [item.id, item.status, item.blockReason, item.lane]))
      expect(await engine.getBatch(taskId)).toMatchObject({ waitingForPerson: 2 })
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a search box with the focus, a hidden sign-in box, a challenge reloading by itself, or a widget script left on the page does not stop a page from being through', async () => {
    const engine = engineFor(join(root, 'tasks-5'))
    // The challenge reloads into the page by itself; the person then clicks on the page to have it read.
    const stop = person(chrome, { '/search': async (page) => { await page.click('#pass') }, '/turnstile': async (page) => { await page.click('#pass') }, '/jsc': async (page) => { await page.waitForSelector('article', { timeout: 20_000 }); await page.mouse.click(10, 10) } })
    try {
      const taskId = await batchOf(engine, ['/search', '/jsc', '/turnstile'])
      const done = await engine.handOffBatch(taskId, { waitMs: 20_000 })
      expect(done).toMatchObject({ handedOff: 3, through: 3 })
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a sign-in that ends on the home page is followed back to the page asked for; once signed in, a page with nothing to do is not read', async () => {
    const engine = engineFor(join(root, 'tasks-8'))
    const stop = person(chrome, { '/signin': async (page) => { await page.click('#in') } })
    try {
      const first = await batchOf(engine, ['/orders'])
      expect((await itemsOf(engine, first))[0]).toMatchObject({ status: 'blocked', blockReason: 'login_wall' })
      expect(await engine.handOffBatch(first, {})).toMatchObject({ through: 1 })
      const item = (await itemsOf(engine, first))[0]!
      expect(item.markdown).toContain('Your orders')
      expect(item.evidence?.finalUrl).toBe(`${base}/orders`)
      // The person is signed in now: a page their Chrome shows them clear, that they do not click on, is their session's, and not read.
      const second = await batchOf(engine, ['/orders'])
      const done = await engine.handOffBatch(second, { waitMs: 6_000 })
      expect(done).toMatchObject({ through: 0, items: [{ reason: expect.stringContaining('you did not click on it to have it read') }] })
      expect((await itemsOf(engine, second))[0]).toMatchObject({ status: 'blocked' })
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a check that passes by itself in the browser, with nobody at it, is not read', async () => {
    const engine = engineFor(join(root, 'tasks-9'))
    try {
      const taskId = await batchOf(engine, ['/auto', '/meta'])
      expect((await itemsOf(engine, taskId)).map((item) => item.status)).toEqual(['blocked', 'blocked'])
      const done = await engine.handOffBatch(taskId, { waitMs: 6_000 })
      expect(done).toMatchObject({ through: 0, notThrough: 2 })
      expect(done!.items.every((item) => item.reason?.includes('you did not click on it to have it read'))).toBe(true)
    } finally {
      await engine.close()
    }
  }, 120_000)

  it('a batch with a webhook is not handed over: a page read in the person\'s Chrome is read signed in as them, and the webhook gets nothing more', async () => {
    const engine = engineFor(join(root, 'tasks-13'))
    const stop = person(chrome, { '/hooked': async (page) => { await page.click('#pass') } })
    try {
      const { taskId } = await engine.startBatch({ urls: [`${base}/hooked`, `${base}/open`], formats: ['markdown'], webhook: 'http://127.0.0.1:8829/hook' } as never)
      for (let i = 0; i < 300 && !['completed', 'failed', 'cancelled'].includes((await engine.getBatch(taskId))?.status ?? ''); i++) await new Promise((resolve) => setTimeout(resolve, 50))
      const stopped = (await itemsOf(engine, taskId)).find((item) => item.url.endsWith('/hooked'))!
      expect(stopped).toMatchObject({ status: 'blocked' })
      expect(stopped.handoff).toBeUndefined()
      expect((await engine.getBatch(taskId))?.waitingForPerson).toBeUndefined()
      for (let i = 0; i < 100 && engine.listDeliveries({ jobId: taskId }).length < 4; i++) await new Promise((resolve) => setTimeout(resolve, 25))
      const before = engine.listDeliveries({ jobId: taskId }).map((delivery) => [delivery.eventId, delivery.eventVersion])
      expect(before).toHaveLength(4)
      await expect(engine.handOffBatch(taskId, {})).rejects.toThrow('has a webhook')
      // The events are as they were: started, the two items, completed; no page read in the person's Chrome among them.
      expect(engine.listDeliveries({ jobId: taskId }).map((delivery) => [delivery.eventId, delivery.eventVersion])).toEqual(before)
      expect((await itemsOf(engine, taskId)).find((item) => item.url.endsWith('/hooked'))).toMatchObject({ status: 'blocked' })
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a scrape handed to the person answers with the page they got through to', async () => {
    const engine = engineFor(join(root, 'tasks-10'))
    // The person reads the check before passing it, as a person does.
    const stop = person(chrome, { '/single': async (page) => { await page.waitForTimeout(1_500); await page.click('#pass') } })
    const told: string[] = []
    try {
      const response = await engine.scrape({ url: `${base}/single`, handoff: { waitMs: 20_000 } } as never, {}, { onWaiting: (url, check) => told.push(`${new URL(url).pathname} ${check}`) }) as Record<string, any>
      expect(told).toEqual(['/single captcha'])
      expect(response).toMatchObject({ status: 'success', lane: 'browser_local_authed', blockReason: null })
      expect(response.markdown).toContain('The single page')
      expect(response.handoff).toBeUndefined()
      expect(response.evidenceRecord).toMatchObject({ lane: 'browser_local_authed', identity: { mode: 'authed', userAgent: null } })
      // The person's Chrome's time zone is not W2L's to state.
      expect(response.metadata.timezone).toBeNull()
      // The stopped run is still the response's routing audit; its hints speak of the read, not of W2L's lanes.
      expect(response.channelsTried).toEqual(['http'])
      // The call's totals count the read too, as one more attempt: never less than the read alone.
      expect(response.summary.attempts.map((attempt: { channel: string }) => attempt.channel)).toEqual(['http', 'browser_local_authed'])
      expect(response.summary).toMatchObject({ requestCount: 1, attemptCount: 1 })
      expect(response.summary.browserMs).toBe(response.usage.browserMs)
      expect(response.summary.bytesDecompressed).toBeGreaterThan(response.usage.bytesDecompressed)
      expect(JSON.stringify(response.agentHints ?? [])).not.toContain('lane served')
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it("a scrape handed to the person after a rung that did not state its cost answers with the call's unknown cost, not the read's 0", async () => {
    // The http rung with its cost made unknown stands in for a provider tried before the person.
    const http = buildChannels('standard', { localSubjects: { browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!
    const unpriced = { ...http, fetch: async (...args: Parameters<typeof http.fetch>) => { const r = await http.fetch(...args); return { ...r, usage: { ...r.usage, externalCostUsd: null } } } }
    const engine = createApiEngine({ taskRoot: join(root, 'tasks-unpriced'), channelsFor: () => [unpriced], userChrome: { userDataDir: join(root, 'chrome') } })
    const stop = person(chrome, { '/unpriced': async (page) => { await page.waitForTimeout(1_500); await page.click('#pass') } })
    try {
      const response = await engine.scrape({ url: `${base}/unpriced`, handoff: { waitMs: 20_000 } } as never) as Record<string, any>
      expect(response).toMatchObject({ status: 'success', lane: 'browser_local_authed' })
      expect(response.summary.externalCostUsd).toBeNull()
      expect(response.usage.externalCostUsd).toBeNull()
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a scrape handed to the person is through as its own options read the page: blockAds false keeps what an ad box holds', async () => {
    const engine = engineFor(join(root, 'tasks-12'))
    const stop = person(chrome, { '/inad': async (page) => { await page.click('#pass') } })
    try {
      const response = await engine.scrape({ url: `${base}/inad`, blockAds: false, handoff: { waitMs: 15_000 } } as never, {}, {}) as Record<string, any>
      expect(response).toMatchObject({ status: 'success', lane: 'browser_local_authed' })
      expect(response.markdown).toContain('The page in an ad box')
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a scrape handed over keeps what the cache said of the call, and one not read there is told it can be handed over again', async () => {
    const engine = engineFor(join(root, 'tasks-14'))
    const stop = person(chrome, { '/cached': async (page) => { await page.click('#pass') } })
    try {
      const read = await engine.scrape({ url: `${base}/cached`, maxAge: 60_000, handoff: { waitMs: 20_000 } } as never, {}, {}) as Record<string, any>
      expect(read).toMatchObject({ status: 'success', lane: 'browser_local_authed', metadata: { cacheState: 'miss' } })
      const notRead = await engine.scrape({ url: `${base}/never`, handoff: { waitMs: 1_000 } } as never, {}, {}) as Record<string, any>
      expect(notRead.warnings.map((warning: { code: string }) => warning.code)).toContain('handoff_not_through')
      expect(notRead.handoff.rationale).toContain('it was not read there')
      expect(notRead.handoff.rationale).not.toContain('handoff: true (octocrawl scrape --handoff)')
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('a scrape the person takes longer than its timeout over still gets its JSON from the model', async () => {
    let calls = 0
    const model = createServer((req, res) => {
      calls++
      req.resume()
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: '{"secret":"from-model"}' } }] }))
    })
    await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve))
    vi.stubEnv('W2L_EXTRACT_BASE_URL', `http://127.0.0.1:${(model.address() as AddressInfo).port}`)
    vi.stubEnv('W2L_EXTRACT_MODEL', 'stub-model')
    const engine = engineFor(join(root, 'tasks-11'))
    // The person passes the check after the scrape's 3 s timeout.
    const stop = person(chrome, { '/slowpass': async (page) => { await page.waitForTimeout(5_000); await page.click('#pass') } })
    try {
      const formats = [{ type: 'json', schema: { type: 'object', properties: { secret: { type: 'string' } }, required: ['secret'] }, modelFallback: true }]
      const response = await engine.scrape({ url: `${base}/slowpass`, timeout: 3_000, formats, handoff: { waitMs: 30_000 } } as never) as Record<string, any>
      expect(response).toMatchObject({ status: 'success', lane: 'browser_local_authed', json: { status: 'complete', data: { secret: 'from-model' } } })
      expect(calls).toBe(1)
    } finally {
      stop()
      vi.unstubAllEnvs()
      await engine.close()
      await new Promise<void>((resolve) => model.close(() => resolve()))
    }
  }, 120_000)

  it('the person closing the tab ends the wait for that page at once', async () => {
    const engine = engineFor(join(root, 'tasks-7'))
    const stop = person(chrome, { '/dd': async (page) => { await page.waitForTimeout(1_500); await page.close() } })
    try {
      const taskId = await batchOf(engine, ['/dd'])
      const started = Date.now()
      const done = await engine.handOffBatch(taskId, { waitMs: 60_000 })
      expect(Date.now() - started).toBeLessThan(10_000)
      expect(done).toMatchObject({ through: 0, items: [{ reason: expect.stringContaining('was closed, or Chrome quit') }] })
    } finally {
      stop()
      await engine.close()
    }
  }, 120_000)

  it('W2L shutting down ends a handoff waiting for the person, closes its tab and stores nothing', async () => {
    const engine = engineFor(join(root, 'tasks-6'))
    const taskId = await batchOf(engine, ['/dd'])
    const started = Date.now()
    const handing = engine.handOffBatch(taskId, { waitMs: 60_000 })
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    await engine.close()
    const done = await handing
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(done).toMatchObject({ through: 0, notThrough: 1, items: [{ reason: expect.stringContaining('cancelled') }] })
    for (let i = 0; i < 40 && chrome.pages().some((page) => page.url().startsWith(base)); i++) await new Promise((resolve) => setTimeout(resolve, 50))
    expect(chrome.pages().some((page) => page.url().startsWith(base))).toBe(false)
  }, 120_000)

  it('a Chrome that quits during the wait ends the handoff, and the batch can be handed over again', async () => {
    const quitting = await chromium.launchPersistentContext(join(root, 'chrome-quits'), { args: ['--remote-debugging-port=0'] })
    const engine = engineFor(join(root, 'tasks-4'), join(root, 'chrome-quits'))
    try {
      const taskId = await batchOf(engine, ['/gate', '/dd'])
      setTimeout(() => { void quitting.close() }, 2_000)
      const started = Date.now()
      const done = await engine.handOffBatch(taskId, {})
      expect(Date.now() - started).toBeLessThan(20_000)
      expect(done).toMatchObject({ handedOff: 2, through: 0, notThrough: 2 })
      expect(done!.items[0]!.reason).toContain('Chrome quit')
      // Not left "being handed over": a second handoff runs, and finds Chrome gone.
      await expect(engine.handOffBatch(taskId, {})).rejects.toThrow(/DevToolsActivePort|did not accept|closed the connection|connect/i)
    } finally {
      await engine.close()
    }
  }, 120_000)
})
