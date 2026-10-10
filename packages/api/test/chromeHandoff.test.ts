import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { ChromeLoginError, connectCdp, type CdpConnection } from '../src/chromeLogin.js'
import { HandoffNotThrough, openUserChrome, rewrittenInPlace } from '../src/chromeHandoff.js'

const GATE = '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>'
const PAGE = `<html><body><article><h1>Page</h1>${'<p>Prose long enough to be the page. </p>'.repeat(4)}</article></body></html>`

/** What the tab shows on one read; `active`: the person has clicked or typed on this document (its user activation, which only Chrome sets). */
type State = { href: string; ready?: string; status?: number | null; html: string; secret?: boolean; field?: string | null; active?: boolean; hidden?: boolean; loading?: boolean; text?: number }

/**
 * A Chrome that shows the tab W2L opens as `states`, one per read, the last
 * one from then on ('closed': the tab is gone). It has no events, as a
 * connection without them: the document's status is the page's own report.
 */
function fakeChrome(states: Array<State | 'closed' | 'moving'>, navigate: () => unknown = () => ({})) {
  const calls: string[] = []
  let read = 0
  let shown = ''
  const connect = async (): Promise<CdpConnection> => ({
    async send(method, params, sessionId) {
      calls.push(sessionId === undefined ? method : `${method}@${sessionId}`)
      if (method === 'Browser.getVersion') return { product: 'Chrome/144.0.7000.0' }
      if (method === 'Target.createTarget') return { targetId: `tab:${String((params as { url: string }).url)}` }
      if (method === 'Target.attachToTarget') return { sessionId: 's1' }
      if (method === 'Target.closeTarget') return {}
      if (method === 'Page.navigate') return navigate()
      if (method === 'Target.getTargetInfo') {
        // Chromium's own words for a closed tab.
        const next = states[Math.min(read, states.length - 1)]!
        if (next === 'closed') throw new ChromeLoginError('Chrome refused the request: No target with given id found')
        return { targetInfo: { url: next === 'moving' ? shown : next.href } }
      }
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 }
      if (method === 'Runtime.evaluate' && (params as { contextId?: number }).contextId === 7) {
        const state = states[Math.min(read - 1, states.length - 1)]!
        return { result: { value: typeof state === 'object' && state.active === true } }
      }
      if (method === 'Runtime.evaluate') {
        const state = states[Math.min(read++, states.length - 1)]!
        if (state === 'closed') throw new ChromeLoginError('Chrome refused the request: Session with given id not found.')
        if (state === 'moving') throw new ChromeLoginError('Chrome refused the request: Inspected target navigated or closed')
        shown = state.href
        // The page's script says it is elsewhere: Chrome's address is the one read.
        return { result: { value: JSON.stringify({ ready: 'complete', status: 200, secret: false, field: null, ...state, href: 'https://forged.test/' }) } }
      }
      throw new Error(`unexpected ${method}`)
    },
    close() { calls.push('close') },
  })
  return { calls, connect }
}

const at = (href: string, html: string, extra: Partial<State> = {}): State => ({ href, html, ...extra })

describe('the person\'s Chrome', () => {
  let userDataDir: string
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'w2l-handoff-chrome-'))
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
  })
  afterEach(async () => { await rm(userDataDir, { recursive: true, force: true }) })

  it('opens a blank tab, goes to the page, says when it shows a check, reads it once through on three reads, and closes the tab', async () => {
    const chrome = fakeChrome([at('https://site.test/a', GATE), at('https://site.test/a', PAGE, { active: true })])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const waiting: string[] = []
    const read = await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000, onWaiting: (url, check) => waiting.push(`${url} ${check}`) })
    reader.close()
    expect(waiting).toEqual(['https://site.test/a captcha'])
    expect(read).toMatchObject({ requestedUrl: 'https://site.test/a', finalUrl: 'https://site.test/a', status: 200, contentType: null, html: PAGE, sawGate: 'captcha', act: 'user_activation', browser: 'Chrome/144.0.7000.0' })
    // Each read: the tab from the browser, the page, and, until the person has acted, their activation in W2L's own world (made once for the document).
    expect(chrome.calls).toEqual(['Browser.getVersion', 'Target.createTarget', 'Target.attachToTarget', 'Target.activateTarget', 'Page.navigate@s1',
      'Target.getTargetInfo', 'Runtime.evaluate@s1', 'Page.createIsolatedWorld@s1', 'Runtime.evaluate@s1',
      'Target.getTargetInfo', 'Runtime.evaluate@s1', 'Runtime.evaluate@s1',
      ...Array(2).fill(['Target.getTargetInfo', 'Runtime.evaluate@s1']).flat(), 'Target.closeTarget', 'close'])
  })

  it('reads a page that is through once it has settled: its text the same length on three reads and no loading indicator (ADR 0007)', async () => {
    // x.com's timeline filling in: through from the first read, its text growing for four reads.
    const growing = [100, 200, 300, 400, 400, 400].map((text, i) => at('https://site.test/a', `${PAGE}<!--${i}-->`, { active: true, text }))
    const chrome = fakeChrome(growing)
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const read = await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })
    reader.close()
    expect(read.html).toBe(`${PAGE}<!--5-->`)
    expect(read.settle).toMatchObject({ loadingSeen: false, stillLoading: false, steady: true })
    // A page that shows a loading indicator is waited for until it goes.
    const loading = [...Array(5).fill(at('https://site.test/a', `${PAGE}<!--loading-->`, { active: true, text: 50, loading: true })), at('https://site.test/a', PAGE, { active: true, text: 50 })]
    const shown = await (await openUserChrome({ userDataDir, connect: fakeChrome(loading).connect })).read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })
    expect(shown.html).toBe(PAGE)
    expect(shown.settle).toMatchObject({ loadingSeen: true, stillLoading: false, steady: true })
    // A page settled at its first clear reads is read then, with no wait.
    const still = await (await openUserChrome({ userDataDir, connect: fakeChrome([at('https://site.test/a', PAGE, { active: true, text: 80 })]).connect })).read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })
    expect(still.settle).toMatchObject({ waitedMs: 0, loadingSeen: false, steady: true })
  })

  it('reads a page still loading or changing when its settle wait ends as it is, and says so (ADR 0007)', async () => {
    const changing = Array.from({ length: 2_000 }, (_, i) => at('https://site.test/a', PAGE, { active: true, text: i, loading: i % 2 === 0 }))
    const read = await (await openUserChrome({ userDataDir, connect: fakeChrome(changing).connect })).read('https://site.test/a', { pollMs: 1, waitMs: 5_000, steadyWaitMs: 30 })
    expect(read.html).toBe(PAGE)
    expect(read.settle).toMatchObject({ loadingSeen: true, steady: false })
    expect(read.settle!.waitedMs).toBeGreaterThanOrEqual(30)
    // Still showing its loading indicator when the wait ends, it says so.
    const loading = await (await openUserChrome({ userDataDir, connect: fakeChrome([at('https://site.test/a', PAGE, { active: true, text: 9, loading: true })]).connect })).read('https://site.test/a', { pollMs: 1, waitMs: 5_000, steadyWaitMs: 30 })
    expect(loading.settle).toMatchObject({ loadingSeen: true, stillLoading: true, steady: true })
  })

  it('never lets the settle wait outlast the caller\'s: a page that is through near its end is read, not lost (ADR 0007)', async () => {
    // Through from the first read, its text growing on every read, with a wait shorter than the settle wait.
    const changing = Array.from({ length: 2_000 }, (_, i) => at('https://site.test/a', PAGE, { active: true, text: i }))
    const read = await (await openUserChrome({ userDataDir, connect: fakeChrome(changing).connect })).read('https://site.test/a', { pollMs: 20, waitMs: 1_000 })
    expect(read.html).toBe(PAGE)
    expect(read.settle).toMatchObject({ steady: false })
    expect(read.wallMs).toBeLessThan(1_000)
  })

  it('a tab that stays out of sight is pointed out once, while one hidden for a moment is not', async () => {
    // The tab behind another one (or Chrome's Allow dialog) all along: the person is told to switch to it, once.
    const behind = fakeChrome([at('https://site.test/a', GATE, { hidden: true })])
    const hidden: string[] = []
    await (await openUserChrome({ userDataDir, connect: behind.connect })).read('https://site.test/a', { pollMs: 1, waitMs: 2_000, hiddenNoticeMs: 100, onHidden: (url) => hidden.push(url) }).catch(() => undefined)
    expect(hidden).toEqual(['https://site.test/a'])
    // Hidden for the first reads only, then in front: no notice.
    const brief = fakeChrome([at('https://site.test/a', GATE, { hidden: true }), at('https://site.test/a', GATE), at('https://site.test/a', PAGE, { active: true })])
    const none: string[] = []
    await (await openUserChrome({ userDataDir, connect: brief.connect })).read('https://site.test/a', { pollMs: 1, waitMs: 5_000, hiddenNoticeMs: 100, onHidden: (url) => none.push(url) })
    expect(none).toEqual([])
  })

  it('a page that still shows its check when the wait ends is not read, and its tab is closed', async () => {
    const chrome = fakeChrome([at('https://site.test/a', GATE)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const failure = await reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HandoffNotThrough)
    expect(failure).toMatchObject({ check: 'captcha', message: expect.stringContaining('still showed a check (captcha: widget_recaptcha') })
    expect(chrome.calls).toContain('Target.closeTarget')
  })

  it('a page is through as the read of it judges it, with the request\'s tags and blockAds', async () => {
    // A page that keeps a check's script once passed is through only with content beside it, found as the read finds it.
    const script = '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'
    const article = `<html><body>${script}${PAGE.slice('<html><body>'.length)}`
    const inAd = `<html><body>${script}<div class="ad">${'<p>Prose long enough to be the page. </p>'.repeat(6)}</div></body></html>`
    const readOf = async (html: string, options: { excludeTags?: string[]; blockAds?: boolean }) => {
      const chrome = fakeChrome([at('https://site.test/a', html, { active: true })])
      const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
      try { return await reader.read('https://site.test/a', { pollMs: 1, waitMs: 200, ...options }) } catch (error) { return error } finally { reader.close() }
    }
    expect(await readOf(article, {})).toMatchObject({ html: article })
    // Its article left out (excludeTags), the page is the check's script alone: the read would call it blocked.
    expect(await readOf(article, { excludeTags: ['article'] })).toMatchObject({ message: expect.stringContaining('still showed a check') })
    // Its content in what blockAds takes for an ad: held by the check, unless the request keeps ads.
    expect(await readOf(inAd, {})).toMatchObject({ message: expect.stringContaining('still showed a check') })
    expect(await readOf(inAd, { blockAds: false })).toMatchObject({ html: inAd })
    // A check with a list beside it that the extractor takes only as a last resort: still the check, as the lanes judge it.
    const row = (text: string) => `<div class="r"><span>${text}</span></div>`
    const listed = `<html><body><h1>One more step</h1><div class="g-recaptcha" data-sitekey="k"></div><div class="why">${row('Requests from your network looked automated to our systems today')}${row('Complete the check above to continue to the page you asked for')}${row('If this keeps happening, contact the site owner with the reference')}</div></body></html>`
    expect(await readOf(listed, {})).toMatchObject({ message: expect.stringContaining('still showed a check (captcha') })
  })

  it('the person at a sign-in step of their own (a code field showing, a field whose value they change) is waited for', async () => {
    const chrome = fakeChrome([
      at('https://site.test/a', '<form><input autocomplete="one-time-code"></form>', { secret: true }),
      at('https://site.test/a', PAGE, { field: 'INPUT:4' }),
      at('https://site.test/a', PAGE, { field: 'INPUT:42' }),
      at('https://site.test/a', PAGE, { field: 'INPUT:421', active: true }),
      at('https://site.test/a', PAGE, { field: 'INPUT:421', active: true }),
    ])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })
    // A sign-in read, three of typing (the field's value changed since the read before), then three clear: a field focused and unchanged is no step.
    expect(chrome.calls.filter((call) => call === 'Target.getTargetInfo')).toHaveLength(7)
  })

  it('a page between two documents is waited for, not taken for a closed tab; a slow navigation is waited for in the reads', async () => {
    const chrome = fakeChrome([at('https://site.test/a', GATE), 'moving', 'moving', at('https://site.test/a', PAGE, { active: true })], () => { throw new ChromeLoginError('Chrome did not answer Page.navigate within 30 s') })
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    expect(await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).toMatchObject({ html: PAGE })
  })

  it('a page that does not answer 2xx, or sits on a login path, is not through', async () => {
    for (const state of [at('https://site.test/a', PAGE, { status: 403 }), at('https://site.test/login?next=/a', PAGE)]) {
      const reader = await openUserChrome({ userDataDir, connect: fakeChrome([state]).connect })
      await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 })).rejects.toThrow('it was not yet the page')
    }
  })

  it('a page that ends off the site asked for is not read as that site\'s', async () => {
    const chrome = fakeChrome([at('http://192.168.1.1/admin', PAGE)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 })).rejects.toThrow('it was on 192.168.1.1, not site.test')
  })

  it('the person\'s sign-in on another host of the site is waited for, and the page read once back on it', async () => {
    const chrome = fakeChrome([at('https://login.example.org/sso', PAGE, { secret: true }), at('https://www.site.test/a', PAGE, { active: true })])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    expect(await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).toMatchObject({ finalUrl: 'https://www.site.test/a', sawGate: null })
  })

  it('a sign-in that ends on the home page: the tab is taken back to the page asked for, and that page is read', async () => {
    const home = '<html><body><article><h1>Welcome home</h1>' + '<p>The site\'s home page, long enough to be read. </p>'.repeat(4) + '</article></body></html>'
    const chrome = fakeChrome([at('https://site.test/a', GATE), ...Array(3).fill(at('https://site.test/', home, { active: true })), at('https://site.test/a', PAGE)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    expect(await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).toMatchObject({ finalUrl: 'https://site.test/a', html: PAGE })
    expect(chrome.calls.filter((call) => call.startsWith('Page.navigate'))).toHaveLength(2)
  })

  it('a way through that stays elsewhere on the site after the returns is not read', async () => {
    const home = '<html><body><article><h1>Welcome home</h1>' + '<p>The site\'s home page, long enough to be read. </p>'.repeat(4) + '</article></body></html>'
    const chrome = fakeChrome([at('https://site.test/a', GATE), at('https://site.test/', home, { active: true })])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).rejects.toThrow('the tab stayed on /, not the page asked for')
    expect(chrome.calls.filter((call) => call.startsWith('Page.navigate'))).toHaveLength(3)
  })

  it('a page whose check cleared without the person, read unattended, does not say they got through when it stays elsewhere', async () => {
    const home = '<html><body><article><h1>Welcome home</h1>' + '<p>The site\'s home page, long enough to be read. </p>'.repeat(4) + '</article></body></html>'
    const chrome = fakeChrome([at('https://site.test/a', GATE), at('https://site.test/', home)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const failure = await reader.read('https://site.test/a', { unattended: true, pollMs: 1, waitMs: 5_000 }).catch((error: unknown) => error)
    expect(failure).toMatchObject({ kind: 'elsewhere', check: 'captcha', message: expect.stringContaining('the site led it on to /, not the page asked for') })
    expect((failure as Error).message).not.toContain('you got through')
  })

  it('a page the person has not clicked or typed on is not read, whatever it does by itself; it is asked for once, and read once they click on it', async () => {
    const confirms: string[] = []
    const untouched = await openUserChrome({ userDataDir, connect: fakeChrome([at('https://site.test/a', PAGE)]).connect })
    await expect(untouched.read('https://site.test/a', { pollMs: 1, waitMs: 50, onConfirm: (url) => confirms.push(url) })).rejects.toThrow('you did not click on it to have it read')
    expect(confirms).toEqual(['https://site.test/a'])
    const clicked = await openUserChrome({ userDataDir, connect: fakeChrome([...Array(4).fill(at('https://site.test/a', PAGE)), at('https://site.test/a', PAGE, { active: true })]).connect })
    expect(await clicked.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).toMatchObject({ html: PAGE, act: 'user_activation', sawGate: null })
  })

  it('a tab the person closed is not read', async () => {
    const chrome = fakeChrome([at('https://site.test/a', GATE), 'closed'])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).rejects.toThrow('was closed, or Chrome quit, before Octocrawl read it')
  })

  it('a Chrome that stops answering (quit, its socket not yet closed) ends the wait within a read\'s timeout', async () => {
    const asked: Array<number | undefined> = []
    const frozen = async (): Promise<CdpConnection> => ({
      async send(method, _params, _sessionId, timeoutMs) {
        if (method === 'Browser.getVersion') return { product: 'Chrome/144' }
        if (method === 'Target.createTarget') return { targetId: 't' }
        if (method === 'Target.attachToTarget') return { sessionId: 's1' }
        if (method === 'Page.navigate' || method === 'Target.closeTarget') return {}
        if (method === 'Target.getTargetInfo') {
          asked.push(timeoutMs)
          // connectCdp's own words when the time runs out.
          throw new ChromeLoginError(`Chrome did not answer Target.getTargetInfo within ${Math.round((timeoutMs ?? 30_000) / 1000)} s`)
        }
        throw new Error(`unexpected ${method}`)
      },
      close() {},
    })
    const reader = await openUserChrome({ userDataDir, connect: frozen })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 60_000 })).rejects.toThrow('was closed, or Chrome quit, before Octocrawl read it')
    expect(asked).toEqual([10_000])
  })

  it('a caller that went away ends the wait', async () => {
    const reader = await openUserChrome({ userDataDir, connect: fakeChrome([at('https://site.test/a', GATE)]).connect })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)
    await expect(reader.read('https://site.test/a', { pollMs: 5, waitMs: 60_000, signal: controller.signal })).rejects.toThrow('was cancelled before Octocrawl read it')
  })

  it('a cancel while Chrome waits for Allow drops the connection, and one Chrome opens after is not used', async () => {
    // A Chrome that holds the handshake: the socket opens, the upgrade never comes.
    const silent = createNetServer((socket) => { socket.on('error', () => undefined) })
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve))
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 100)
      const started = Date.now()
      await expect(connectCdp(`ws://127.0.0.1:${(silent.address() as AddressInfo).port}/devtools/browser/x`, 60_000, controller.signal)).rejects.toThrow('cancelled')
      expect(Date.now() - started).toBeLessThan(5_000)
    } finally {
      silent.close()
    }
    const late = fakeChrome([])
    const controller = new AbortController()
    const opening = openUserChrome({ userDataDir, connect: async (...args) => { controller.abort(); return late.connect(...(args as [])) } }, controller.signal)
    await expect(opening).rejects.toThrow('cancelled')
    expect(late.calls).toEqual(['close'])
  })

  it('without remote debugging on, says how to turn it on', async () => {
    await rm(join(userDataDir, 'DevToolsActivePort'))
    await expect(openUserChrome({ userDataDir, connect: fakeChrome([]).connect })).rejects.toThrow(/chrome:\/\/inspect\/#remote-debugging/)
  })
})

describe('an address a page\'s script rewrote in place', () => {
  it('is the page it came at when it keeps its origin, path and every parameter both name; another page of a list is not', () => {
    // Indeed, seen 2026-10-09: its paging token dropped, the job shown named.
    expect(rewrittenInPlace('https://www.indeed.com/jobs?q=data+analyst&l=Remote&start=10&pp=tok', 'https://www.indeed.com/jobs?q=data+analyst&l=Remote&start=10&vjk=76ded9')).toBe(true)
    expect(rewrittenInPlace('https://site.test/list/', 'https://site.test/list#top')).toBe(true)
    // A page parameter changed: another page of the list.
    expect(rewrittenInPlace('https://site.test/jobs?start=10', 'https://site.test/jobs?start=20')).toBe(false)
    expect(rewrittenInPlace('https://site.test/jobs?tag=a&tag=b', 'https://site.test/jobs?tag=a')).toBe(false)
    // A page or offset dropped: the page may be showing its first page. A token dropped (Indeed's pp) is not one.
    expect(rewrittenInPlace('https://site.test/jobs?q=x&start=10', 'https://site.test/jobs?q=x')).toBe(false)
    expect(rewrittenInPlace('https://site.test/jobs?q=x&page=2&pp=tok9', 'https://site.test/jobs?q=x&page=2')).toBe(true)
    // Another path or another origin is never the page.
    expect(rewrittenInPlace('https://site.test/jobs?start=10', 'https://site.test/job/1?start=10')).toBe(false)
    expect(rewrittenInPlace('https://site.test/jobs', 'https://other.test/jobs')).toBe(false)
    expect(rewrittenInPlace('not a url', 'https://site.test/')).toBe(false)
  })
})

describe('a list the person pages on through, in the tab W2L kept', () => {
  let userDataDir: string
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'w2l-handoff-list-'))
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
  })
  afterEach(async () => { await rm(userDataDir, { recursive: true, force: true }) })

  const LIST = (n: number) => `<html><body>${[1, 2, 3].map((i) => `<div class="card"><a class="name" href="/p/${n * 10 + i}">Item ${n * 10 + i}</a></div>`).join('')}<a class="next" href="/list/${n + 1}">Next</a></body></html>`
  const page = (n: number, extra: Partial<State> & { key?: string; next?: string } = {}) => at(`https://site.test/list/${n}`, LIST(n), { active: true, key: `k${n}`, next: 'usable', ...extra })
  const follow = { nextSelector: 'a.next', itemSelector: 'div.card', endGraceMs: 20 }

  it('reads the page the check was on, then each page the person shows by paging on, and ends when Next is gone on the last one', async () => {
    // Through the check at page 2 on three reads, then the follow: page 2 again (known), page 3 twice, page 4 (no Next) twice and once more.
    const chrome = fakeChrome([page(2, { html: GATE, active: false }), page(2), page(2), page(2), page(2), page(3), page(3), page(4, { next: 'gone' }), page(4, { next: 'gone' }), page(4, { next: 'gone' })])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const seen: string[] = []
    const read = await reader.readList('https://site.test/list/2', { pollMs: 1, waitMs: 5_000, follow: { ...follow, onStart: (url) => seen.push(`start ${url}`), onPage: (url, pages) => seen.push(`${pages} ${url}`) } })
    reader.close()
    expect(read.first).toMatchObject({ finalUrl: 'https://site.test/list/2', act: 'user_activation' })
    expect(read.pages.map((item) => item.url)).toEqual(['https://site.test/list/2', 'https://site.test/list/3', 'https://site.test/list/4'])
    expect(read.stoppedBy).toBe('end')
    expect(seen).toEqual(['start https://site.test/list/2', '2 https://site.test/list/3', '3 https://site.test/list/4'])
    // The tab W2L opened is closed once, at the end.
    expect(chrome.calls.filter((call) => call === 'Target.closeTarget')).toHaveLength(1)
  })

  it('reads no page off the site, on a login path, with a password field or not answered 2xx, and no check met on the way until the person is through it', async () => {
    const chrome = fakeChrome([page(2), page(2), page(2), page(2),
      at('https://other.test/list/3', LIST(3), { key: 'k3', next: 'usable' }), at('https://other.test/list/3', LIST(3), { key: 'k3', next: 'usable' }),
      at('https://site.test/login', LIST(3), { key: 'k3', next: 'usable' }), at('https://site.test/login', LIST(3), { key: 'k3', next: 'usable' }),
      page(3, { secret: true }), page(3, { secret: true }),
      page(3, { status: 500 }), page(3, { status: 500 }),
      page(3, { html: GATE, key: 'gate' }), page(3, { html: GATE, key: 'gate' }),
      page(3), page(3), page(3, { next: 'gone' }), page(3, { next: 'gone' })])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const waiting: string[] = []
    const read = await reader.readList('https://site.test/list/2', { pollMs: 1, waitMs: 5_000, onWaiting: (url, check) => waiting.push(`${url} ${check}`), follow })
    reader.close()
    expect(read.pages.map((item) => item.url)).toEqual(['https://site.test/list/2', 'https://site.test/list/3'])
    expect(read.stoppedBy).toBe('end')
    expect(waiting).toEqual(['https://site.test/list/3 captcha'])
  })

  it('does not take a pager that disables Next while it loads the next page for the list\'s end', async () => {
    // Next disabled for about 60 ms (many reads) while page 3 loads, then page 3; its Next stays disabled past the grace: the end.
    const chrome = fakeChrome([page(2), page(2), page(2), page(2), ...Array<State>(30).fill(page(2, { next: 'disabled' })), page(3), page(3), page(3, { next: 'disabled' })])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const read = await reader.readList('https://site.test/list/2', { pollMs: 1, waitMs: 5_000, follow: { ...follow, endGraceMs: 100 } })
    reader.close()
    expect(read.pages.map((item) => item.url)).toEqual(['https://site.test/list/2', 'https://site.test/list/3'])
    expect(read.stoppedBy).toBe('end')
  })

  it('ends as deadline when no new page shows for idleMs, as max at the page limit, and throws when cancelled or the tab is gone', async () => {
    const idle = await openUserChrome({ userDataDir, connect: fakeChrome([page(2), page(2), page(2), page(2)]).connect })
    const stayed = await idle.readList('https://site.test/list/2', { pollMs: 1, waitMs: 5_000, follow: { ...follow, idleMs: 30 } })
    idle.close()
    expect(stayed).toMatchObject({ stoppedBy: 'deadline' })
    expect(stayed.pages).toHaveLength(1)

    const limited = await openUserChrome({ userDataDir, connect: fakeChrome([page(2), page(2), page(2), page(2), page(3), page(3)]).connect })
    expect(await limited.readList('https://site.test/list/2', { pollMs: 1, waitMs: 5_000, follow: { ...follow, maxPages: 2 } })).toMatchObject({ stoppedBy: 'max', pages: [{ url: 'https://site.test/list/2' }, { url: 'https://site.test/list/3' }] })
    limited.close()

    const gone = fakeChrome([page(2), page(2), page(2), page(2), page(3), 'closed'])
    const left = await openUserChrome({ userDataDir, connect: gone.connect })
    await expect(left.readList('https://site.test/list/2', { pollMs: 1, waitMs: 5_000, follow })).rejects.toMatchObject({ kind: 'gone' })
    left.close()
    expect(gone.calls.filter((call) => call === 'Target.closeTarget')).toHaveLength(1)

    const controller = new AbortController()
    const cancelled = await openUserChrome({ userDataDir, connect: fakeChrome([page(2), page(2), page(2), page(2)]).connect })
    const reading = cancelled.readList('https://site.test/list/2', { pollMs: 1, waitMs: 5_000, signal: controller.signal, follow })
    setTimeout(() => controller.abort(), 20)
    await expect(reading).rejects.toMatchObject({ kind: 'cancelled' })
    cancelled.close()
  })
})
