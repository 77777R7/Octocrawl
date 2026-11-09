import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { ChromeLoginError, type CdpConnection } from '../src/chromeLogin.js'
import { HandoffNotThrough, openUserChrome } from '../src/chromeHandoff.js'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import { parseScrapeRequest } from '@w2l/contracts'
import { forgetSites, rememberSites } from '../src/rememberedSites.js'

/**
 * The my-browser lane (ROADMAP PA item 8) without a browser: a Chrome that shows Octocrawl's page asking the person
 * to allow the sites (its answer and whether they clicked it), and the page asked for, read by state.
 */

const GATE = '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>'
const PAGE = `<html><head><title>Ledger</title></head><body><article><h1>Tide ledger</h1>${'<p>The harbour office records the tide for every hour of the day. </p>'.repeat(4)}</article></body></html>`

/** A Cloudflare block page, as crunchbase.com answered the person's Chrome on 2026-10-06 (HTTP 403). */
const CF_BLOCK = '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body><h1>Sorry, you have been blocked</h1><p>You are unable to access site.test</p><div id="cf-error-details">Cloudflare Ray ID: 0123456789abcdef</div></body></html>'

/** The scope page's answer on each poll: what its buttons set, and whether the person clicked on it (their activation, which only Chrome sets); 'closed': they closed it. */
type Answer = { answer: '' | 'allowed' | 'revoked'; active: boolean } | 'closed'

/**
 * `documentStatus`: the page's document answers with this status (heard as Chrome's response event); `refuseTabs`: Chrome
 * refuses to open the page's tab; `shown`: the page as it shows, without what it hides (the whole `html` without it), which
 * the first `shownFails` times the page has just moved on to another document, and the next `shownMoved` times was read on
 * another address.
 */
function fakeChrome(answers: Answer[], page: { href?: string; html: string; htmls?: Record<string, string>; documentStatus?: number; refuseTabs?: boolean; shown?: string; shownFails?: number; shownMoved?: number; hidden?: boolean; touched?: boolean }) {
  const listeners = new Map<string, (params: Record<string, unknown>) => void>()
  const written: string[] = []
  const created: string[] = []
  // The tabs brought to the front, and the tabs opened behind the one the person is on (Target.createTarget background: true).
  const activated: string[] = []
  const backgrounded: string[] = []
  // Page tabs open at once, at most.
  let open = 0
  let mostOpen = 0
  // Tabs not closed, and what was sent once the connection was closed (a tab left behind in the person's Chrome).
  const live = new Set<string>()
  const afterClose: string[] = []
  let connectionClosed = false
  // Where each tab was sent: a page without a fixed address shows the URL it was sent to.
  const navigated = new Map<string, string>()
  let polled = 0
  let targets = 0
  let shownTries = 0
  let regionReads = 0
  let shownMoves = 0
  const kinds = new Map<string, 'scope' | 'page'>()
  const answerNow = (): Answer => answers[Math.min(polled, answers.length - 1)]!
  const hrefOf = (target: string) => page.href ?? navigated.get(target) ?? 'about:blank'
  // Each connection is its own: one closed does not close the next (a server reads in the person's Chrome request after request).
  const connect = async (): Promise<CdpConnection> => { connectionClosed = false; return {
    async send(method, params, sessionId) {
      const p = (params ?? {}) as Record<string, unknown>
      if (connectionClosed) { afterClose.push(method); throw new ChromeLoginError('Chrome closed the connection') }
      if (method === 'Browser.getVersion') return { product: 'Chrome/144.0.7000.0' }
      if (method === 'Target.createTarget' && page.refuseTabs === true && targets >= 1) throw new ChromeLoginError('Chrome refused the request: Failed to open a new tab')
      // A tab is Octocrawl's page asking to allow sites once that page is written into it; any other is a page read.
      if (method === 'Target.createTarget') { const id = `tab${++targets}`; kinds.set(id, 'page'); created.push(id); live.add(id); if (p.background === true) backgrounded.push(id); return { targetId: id } }
      if (method === 'Target.attachToTarget') return { sessionId: `s:${String(p.targetId)}` }
      if (method === 'Page.navigate') {
        const target = String(sessionId).replace(/^s:/, '')
        if (!navigated.has(target) && live.has(target)) mostOpen = Math.max(mostOpen, ++open)
        navigated.set(target, String(p.url))
        if (page.documentStatus !== undefined) listeners.get(`Network.responseReceived@${String(sessionId)}`)?.({ type: 'Document', frameId: target, response: { url: hrefOf(target), status: page.documentStatus, headers: {} } })
        return {}
      }
      if (method === 'Target.closeTarget') { if (navigated.has(String(p.targetId)) && live.has(String(p.targetId))) open--; live.delete(String(p.targetId)); return {} }
      if (method === 'Target.activateTarget') { activated.push(String(p.targetId)); return {} }
      if (method === 'Network.enable' || method === 'Page.enable') return {}
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 }
      if (method === 'Runtime.evaluate' && String(p.expression).includes('document.write')) kinds.set(String(sessionId).replace(/^s:/, ''), 'scope')
      const kind = kinds.get(String(sessionId ?? p.targetId).replace(/^s:/, ''))
      if (method === 'Target.getTargetInfo') {
        if (kind === 'scope' && answerNow() === 'closed') throw new ChromeLoginError('Chrome refused the request: No target with given id found')
        return { targetInfo: { url: kind === 'scope' ? 'about:blank' : hrefOf(String(p.targetId)) } }
      }
      if (method === 'Runtime.evaluate') {
        const expression = String(p.expression)
        if (kind === 'scope') {
          if (expression.includes('document.write')) { written.push(expression); return {} }
          // The page's own script wired its buttons, in the page's own world: W2L's isolated world sees no handler, as in Chrome.
          if (expression.includes("getElementById('allow')")) return { result: { value: p.contextId === undefined } }
          const now = answerNow()
          if (now === 'closed') throw new ChromeLoginError('Chrome refused the request: Session with given id not found.')
          if (p.contextId === 7) { polled++; return { result: { value: now.active } } }
          return { result: { value: now.answer } }
        }
        // The page asked for: never clicked on, so the lane reads it without the person; `touched`: they acted on it.
        if (p.contextId === 7) return { result: { value: page.touched === true } }
        // The region view (ADR 0007): the page's text, which holds the ledger's rows.
        if (expression.includes('tableCount')) {
          regionReads++
          return { result: { value: JSON.stringify({ loading: false, text: 120, href: 'https://site.test/a', html: '<html><body><h1>Tide ledger</h1><p>06:00 07:00 08:00</p></body></html>', tableCount: 1 }) } }
        }
        if (expression.includes('importNode')) {
          if ((page.shownFails ?? 0) > shownTries++) throw new ChromeLoginError('Chrome refused the request: Inspected target navigated or closed')
          // The page as it shows, on the page's own address; `shownMoved` times another page, as one that moved on.
          if ((page.shownMoved ?? 0) > shownMoves++) return { result: { value: JSON.stringify({ href: 'https://site.test/moved', shown: PAGE.replace('Tide ledger', 'Another page') }) } }
          return { result: { value: JSON.stringify({ href: hrefOf(String(sessionId).replace(/^s:/, '')), shown: page.shown ?? page.htmls?.[hrefOf(String(sessionId).replace(/^s:/, ''))] ?? page.html }) } }
        }
        return { result: { value: JSON.stringify({ href: hrefOf(String(sessionId).replace(/^s:/, '')), ready: 'complete', status: 200, html: page.htmls?.[hrefOf(String(sessionId).replace(/^s:/, ''))] ?? page.html, secret: false, field: null, hidden: page.hidden === true }) } }
      }
      throw new Error(`unexpected ${method}`)
    },
    ...(page.documentStatus === undefined ? {} : { on: (method: string, sessionId: string | undefined, listener: (params: Record<string, unknown>) => void) => { listeners.set(`${method}@${String(sessionId)}`, listener); return () => { listeners.delete(`${method}@${String(sessionId)}`) } } }),
    close() { connectionClosed = true },
  } }
  return { connect, written, created, activated, backgrounded, navigated, mostOpen: () => mostOpen, live, afterClose, closed: () => connectionClosed, regionReads: () => regionReads }
}

describe('the my-browser lane', () => {
  let root: string
  let engine: ApiEngine | null = null
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  /** `logins`: the server keeps saved logins (W2L_SESSIONS_FILE), and remembers the sites allowed beside them. */
  async function setup(chrome: ReturnType<typeof fakeChrome> | null, options: { hosted?: boolean; loginWaitMs?: number; hiddenWaitMs?: number; signInSettleMs?: number; logins?: boolean } = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-my-browser-'))
    const userDataDir = join(root, 'chrome')
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      ...(options.logins === true ? { sessionsFile: join(root, 'logins', 'sessions.json') } : {}),
      ...(options.hosted === true ? { hosted: true } : {}),
      ...(chrome === null ? {} : { userChrome: { userDataDir, connect: chrome.connect, ...(options.loginWaitMs === undefined ? {} : { loginWaitMs: options.loginWaitMs }), ...(options.hiddenWaitMs === undefined ? {} : { hiddenWaitMs: options.hiddenWaitMs }), ...(options.signInSettleMs === undefined ? {} : { signInSettleMs: options.signInSettleMs }) } }),
    })
    return createApp(engine)
  }
  const scrape = async (app: ReturnType<typeof createApp>, body: Record<string, unknown>) => {
    const res = await app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../contracts/schemas/evidence-record.v1.json', import.meta.url)), 'utf8'))
  const valid = (record: unknown) => {
    const check = new (Ajv2020 as unknown as new (options: object) => { compile(schema: object): ((data: unknown) => boolean) & { errors?: unknown } })({ strict: false }).compile(schema)
    expect(check(record), JSON.stringify(check.errors)).toBe(true)
    return record as Record<string, any>
  }

  it('reads the page in the person\'s Chrome once they allow its site, without a click on the page, as lane my_browser', async () => {
    const chrome = fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE })
    const app = await setup(chrome)
    const { status, body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'success', lane: 'my_browser', channelsTried: ['my_browser'] })
    expect(body.markdown).toContain('Tide ledger')
    // The page Octocrawl opened listed the site and the task.
    expect(chrome.written.join('')).toContain('site.test')
    expect(chrome.written.join('')).toContain('scrape https://site.test/a')
    const record = valid(body.evidenceRecord)
    expect(record).toMatchObject({ lane: 'my_browser', access: { route: 'user_browser', executor: 'Chrome/144.0.7000.0', completion: 'user_browser', externalCostUsd: 0 } })
    // Octocrawl fetched nothing: no robots decision, no request of its own.
    expect(record.robotsDecision).toBeNull()
    expect(body.trace.some((event: { event: string }) => event.event === 'handoff_from')).toBe(false)
  })

  it('brings the page\'s tab to the front for one scrape, and opens it behind the person\'s with backgroundTabs: true', async () => {
    const chrome = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE, hidden: true })
    const app = await setup(chrome, { hiddenWaitMs: 200 })
    // In front: the tab out of sight is waited for (the person is told to look at it), then read.
    const front = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(front).toMatchObject({ status: 200, body: { status: 'success' } })
    expect(front.body.trace.find((e: { event: string }) => e.event === 'user_browser_read').detail.hiddenWaitMs).toBeGreaterThanOrEqual(200)
    expect(chrome.activated).toEqual(['tab1', 'tab2'])
    expect(chrome.backgrounded).toEqual([])
    // Behind the person's tab: only the page that asks to allow the site comes to the front; the page is read whole at once.
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })
    const behindChrome = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE, hidden: true })
    const behindApp = await setup(behindChrome, { hiddenWaitMs: 200 })
    const behind = await scrape(behindApp, { url: 'https://site.test/a', lane: 'my-browser', backgroundTabs: true, debug: true })
    expect(behind).toMatchObject({ status: 200, body: { status: 'success' } })
    expect(behind.body.warnings.map((w: { code: string }) => w.code)).toContain('page_read_hidden')
    expect(behind.body.trace.find((e: { event: string }) => e.event === 'user_browser_read').detail).toMatchObject({ tabHidden: true, background: true })
    expect(behind.body.trace.find((e: { event: string }) => e.event === 'user_browser_read').detail.hiddenWaitMs).toBeLessThan(200)
    expect(behindChrome.activated).toEqual(['tab1'])
    expect(behindChrome.backgrounded).toEqual(['tab2'])
    expect(await scrape(behindApp, { url: 'https://site.test/a', backgroundTabs: true })).toMatchObject({ status: 400, body: { code: 'unsupported_parameter', details: { parameters: ['backgroundTabs'] } } })
  })

  it('gives a page that holds content back behind a sign-in time for the site to sign the person back in, then reads it with the line', async () => {
    const PROMPT = PAGE.replace('</article>', '<p><strong>Log in for contact details</strong></p></article>')
    const app = await setup(fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { html: PROMPT }), { signInSettleMs: 200 })
    const { body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(body).toMatchObject({ status: 'success', lane: 'my_browser' })
    expect(body.warnings.map((w: { code: string }) => w.code)).toContain('sign_in_prompt')
    const wait = body.trace.find((e: { event: string }) => e.event === 'user_browser_read').detail.signInWait
    expect(wait).toMatchObject({ cleared: false, returned: false })
    expect(wait.waitedMs).toBeGreaterThanOrEqual(200)
  })

  it('waits in the person\'s Chrome for the region the request\'s contract needs, and records it (ADR 0007)', async () => {
    const chrome = fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE })
    const app = await setup(chrome)
    const verify = { checks: [{ type: 'markdownIncludes', text: 'Tide ledger' }] }
    const { body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', verify, debug: true })
    expect(body).toMatchObject({ status: 'success', lane: 'my_browser', verification: { status: 'passed' }, readiness: { state: 'ready', basis: ['verified'] } })
    expect(chrome.regionReads()).toBe(2)
    expect(body.trace).toContainEqual(expect.objectContaining({ lane: 'my_browser', event: 'region_wait', detail: expect.objectContaining({ ready: true, reads: 2 }) }))
  })

  // On 2026-11-07 a read of a site the person was not signed in to held the agent for 10 minutes with nothing said to them.
  describe('a sign-in page in the person\'s Chrome', () => {
    const SIGN_IN = '<html><head><title>Sign in</title></head><body><h1>Sign in to continue</h1><form><input type="password"></form></body></html>'
    const allowed: Answer[] = [{ answer: 'allowed', active: true }]

    it('nobody acted on goes back to the agent, and its tab stays open for the person', async () => {
      const chrome = fakeChrome(allowed, { href: 'https://site.test/login', html: SIGN_IN })
      const app = await setup(chrome, { loginWaitMs: 300 })
      const { status, body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser' })
      expect(status).toBe(200)
      expect(body.status).toBe('blocked')
      expect(body.blockReason).toBe('login_wall')
      expect(body.warning).toContain('tab stays open')
      expect([...chrome.live]).toEqual(['tab2'])
      expect(body.agentHints.join(' ')).toContain('ask them to sign in to it there')
    })

    it('someone is acting on is waited for', async () => {
      const chrome = fakeChrome(allowed, { href: 'https://site.test/login', html: SIGN_IN, touched: true })
      await setup(chrome, { loginWaitMs: 100 })
      const opened = await openUserChrome({ userDataDir: join(root, 'chrome'), connect: chrome.connect })
      try {
        const sites = await opened.allow({ hosts: ['site.test'], task: 'scrape' })
        await expect(opened.read('https://site.test/a', { unattended: true, allowedHosts: sites.hosts, loginWaitMs: 100, waitMs: 900 })).rejects.toThrow(/was not through within/)
        await sites.close()
      } finally { opened.close() }
      expect([...chrome.live]).toEqual([])
    })

    it('keeps the wait a caller asked for', async () => {
      const chrome = fakeChrome(allowed, { href: 'https://site.test/login', html: SIGN_IN })
      const app = await setup(chrome, { loginWaitMs: 100 })
      const { body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', handoff: { waitMs: 10_000 } })
      expect(body.status).toBe('blocked')
      expect(body.warning).not.toContain('tab stays open')
      expect([...chrome.live]).toEqual([])
    }, 20_000)
  })

  it('does not take Allow set by a script: the person\'s own click on the page is what allows the site', async () => {
    // Allowed by the page's state alone, never clicked: the request waits, then is refused by name when the page is closed.
    const chrome = fakeChrome([{ answer: 'allowed', active: false }, { answer: 'allowed', active: false }, 'closed'], { href: 'https://site.test/a', html: PAGE })
    const app = await setup(chrome)
    const refused = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser' })
    expect(refused).toMatchObject({ status: 409, body: { code: 'conflict', error: expect.stringContaining('closed Octocrawl\'s page') } })
  })

  it('a site the person revokes, or never allows, is not read', async () => {
    const declined = fakeChrome([{ answer: 'revoked', active: true }], { href: 'https://site.test/a', html: PAGE })
    const app = await setup(declined)
    expect(await scrape(app, { url: 'https://site.test/a', lane: 'my-browser' })).toMatchObject({ status: 409, body: { error: expect.stringContaining('clicked Revoke') } })
  })

  it('revoked while the page waits on a check: the read ends as cancelled, and the result says why', async () => {
    // Allowed, then Revoke clicked while the page still shows its captcha.
    const answers: Answer[] = [{ answer: 'allowed', active: true }, ...Array(3).fill({ answer: 'allowed', active: true }), { answer: 'revoked', active: true }]
    const chrome = fakeChrome(answers, { href: 'https://site.test/a', html: GATE })
    const app = await setup(chrome)
    const { status, body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'cancelled', lane: 'my_browser' })
    expect(body.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'my_browser_not_read', message: expect.stringContaining('revoked') })]))
    expect(valid(body.evidenceRecord).access).toMatchObject({ route: null, completion: null })
  }, 20_000)

  it('says what kept a page from being read: the check it still showed is blocked, a Chrome that refused the tab is a connection error', async () => {
    // A Cloudflare block page whose document answered 403: the response alone names no check (http_403), the page does.
    const blocking = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: CF_BLOCK, documentStatus: 403 })
    let app = await setup(blocking)
    const blocked = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', handoff: { waitMs: 10_000 }, debug: true })
    expect(blocked.body).toMatchObject({ status: 'blocked', blockReason: 'cloudflare_challenge', lane: 'my_browser' })
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })
    // Chrome refuses to open the page's tab: not a wait that ran out.
    const refusing = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE, refuseTabs: true })
    app = await setup(refusing)
    const refused = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(refused.body).toMatchObject({ status: 'failed', failureReason: 'connection_error', lane: 'my_browser' })
  }, 30_000)

  it('reads the page as it shows in the person\'s Chrome, not a panel it keeps hidden', async () => {
    // As the Lark sheet of the 2026-10-09 acceptance run: its shortcut list, hidden, was taken for the page.
    const hidden = `<div class="hotkeys"><ul>${'<li>Insert new sheet Shift F11</li>'.repeat(40)}</ul></div>`
    const sheet = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE.replace('<body>', `<body>${hidden}`), shown: PAGE })
    const app = await setup(sheet)
    const { body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', formats: ['markdown', 'rawHtml'], debug: true })
    expect(body).toMatchObject({ status: 'success', lane: 'my_browser' })
    expect(body.markdown).not.toContain('Insert new sheet')
    // The raw body is the whole document Chrome rendered, as on every browser lane.
    expect(body.rawHtml).toContain('Insert new sheet')
    expect(body.evidenceRecord.rawSha256).toBe(createHash('sha256').update(PAGE.replace('<body>', `<body>${hidden}`)).digest('hex'))
  }, 30_000)

  it('judges whether a page read as it shows has a check on its whole document, as the wait did', async () => {
    // A FAQ whose answers it hides, with a site-wide reCAPTCHA v3 tag, is not blocked because what it shows is short.
    const v3 = '<script src="https://www.google.com/recaptcha/api.js?render=site-key"></script>'
    const questions = ['How long is a tide?', 'Who keeps the ledger?', 'Where is the office?'].map((q) => `<h3>${q}</h3>`).join('')
    const answers = ['How long is a tide?', 'Who keeps the ledger?', 'Where is the office?'].map((q) => `<h3>${q}</h3><p style="display:none">${'The harbour office answers this at length, with the tide tables of the year. '.repeat(4)}</p>`).join('')
    const faq = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: `<html><head><title>FAQ</title>${v3}</head><body><main>${answers}</main></body></html>`, shown: `<html><head><title>FAQ</title>${v3}</head><body><main>${questions}</main></body></html>` })
    const asked = await scrape(await setup(faq), { url: 'https://site.test/a', lane: 'my-browser' })
    expect(asked.body.status).not.toBe('blocked')
  }, 30_000)

  it('reads again a page that moved on just as it was read as it shows, and closes its tab', async () => {
    const moving = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE, shown: PAGE, shownFails: 1, shownMoved: 1 })
    const again = await scrape(await setup(moving), { url: 'https://site.test/a', lane: 'my-browser' })
    expect(again.body).toMatchObject({ status: 'success', lane: 'my_browser' })
    expect(again.body.markdown).toContain('Tide ledger')
    expect(again.body.markdown).not.toContain('Another page')
    expect(moving.live.size).toBe(0)
  }, 30_000)

  it('a page that keeps leading elsewhere on the site, after Octocrawl took the tab back, is a redirect limit, not a wait that ran out', async () => {
    // As www.linkedin.com/mynetwork/ always moved on to /mynetwork/grow in the 2026-10-09 acceptance run.
    const moving = fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/elsewhere', html: PAGE })
    const app = await setup(moving)
    const { body } = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(body).toMatchObject({ status: 'failed', failureReason: 'redirect_limit', lane: 'my_browser' })
    expect(body.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'my_browser_not_read', message: expect.stringContaining('not the page asked for') })]))
  }, 30_000)

  it('remembers a site the person allowed: its next read opens no page asking again, another site asks, and one revoked asks again', async () => {
    const chrome = fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { html: PAGE })
    const app = await setup(chrome, { logins: true })
    const first = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(first.body).toMatchObject({ status: 'success', lane: 'my_browser' })
    expect(chrome.written).toHaveLength(1)
    // The page says the sites are remembered, and how to revoke them.
    expect(chrome.written[0]).toContain('Octocrawl remembers them')
    expect(chrome.written[0]).toContain('octocrawl login revoke')
    const clicked = valid(first.body.evidenceRecord).access.allowance
    expect(clicked).toEqual({ basis: 'clicked', allowedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) })
    // Kept beside the saved logins, readable by the person alone: hosts and dates, nothing else.
    const file = join(root, 'logins', 'allowed-sites.json')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ sites: [{ host: 'site.test', allowedAt: clicked.allowedAt }] })
    // Another page of the same site: no page asking, read as before, said to be remembered.
    const second = await scrape(app, { url: 'https://site.test/b', lane: 'my-browser', debug: true })
    expect(second.body).toMatchObject({ status: 'success', lane: 'my_browser' })
    expect(chrome.written).toHaveLength(1)
    expect(valid(second.body.evidenceRecord).access).toMatchObject({ route: 'user_browser', completion: 'user_browser', allowance: { basis: 'remembered', allowedAt: clicked.allowedAt } })
    // The command line is told there is nothing to allow on Octocrawl's page, and why.
    const told: unknown[] = []
    await engine!.scrape(parseScrapeRequest({ url: 'https://site.test/z', lane: 'my-browser' }), {}, { onAllow: (...args) => { told.push(args) } })
    expect(told).toEqual([[[], ['site.test'], true]])
    expect(chrome.written).toHaveLength(1)
    // Another site, and another port of the same host, are other sites: each asks.
    expect((await scrape(app, { url: 'https://other.test/a', lane: 'my-browser' })).body).toMatchObject({ status: 'success' })
    expect(chrome.written).toHaveLength(2)
    expect(chrome.written[1]).toContain('other.test')
    expect(chrome.written[1]).not.toContain('<code>site.test</code>')
    expect((await scrape(app, { url: 'https://site.test:8443/a', lane: 'my-browser' })).body).toMatchObject({ status: 'success' })
    expect(chrome.written).toHaveLength(3)
    // Revoked (octocrawl login revoke): asked again.
    expect(await forgetSites(file, ['site.test'])).toEqual(['site.test'])
    expect((await scrape(app, { url: 'https://site.test/c', lane: 'my-browser' })).body).toMatchObject({ status: 'success' })
    expect(chrome.written).toHaveLength(4)
  }, 30_000)

  it('does not remember a site without saved logins: each read asks, and its record says the click', async () => {
    const chrome = fakeChrome([{ answer: 'allowed', active: true }], { html: PAGE })
    const app = await setup(chrome)
    const first = await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    expect(valid(first.body.evidenceRecord).access.allowance).toMatchObject({ basis: 'clicked' })
    expect(chrome.written[0]).toContain('only while this page stays open')
    await scrape(app, { url: 'https://site.test/b', lane: 'my-browser' })
    expect(chrome.written).toHaveLength(2)
  }, 30_000)

  it('stops a read of a remembered site the person revokes from another process while it waits, and says so', async () => {
    const chrome = fakeChrome([{ answer: 'allowed', active: true }], { html: GATE })
    const app = await setup(chrome, { logins: true })
    const file = join(root, 'logins', 'allowed-sites.json')
    await rememberSites(file, ['site.test'], '2026-11-08T00:00:00.000Z')
    const pending = scrape(app, { url: 'https://site.test/a', lane: 'my-browser', debug: true })
    for (let i = 0; i < 200 && chrome.created.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(await forgetSites(file, ['site.test'])).toEqual(['site.test'])
    const { body } = await pending
    expect(body).toMatchObject({ status: 'cancelled', lane: 'my_browser' })
    expect(body.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'my_browser_not_read', message: expect.stringContaining('you revoked site.test (octocrawl login revoke)') })]))
    // Never asked: the site was remembered.
    expect(chrome.written).toHaveLength(0)
    expect(chrome.live.size).toBe(0)
  }, 30_000)

  it('forgets the sites the person clicks Revoke on after allowing them; closing the page only ends the run', async () => {
    // Allowed, then Revoke clicked while the page still shows its captcha.
    const answers: Answer[] = [{ answer: 'allowed', active: true }, ...Array(3).fill({ answer: 'allowed', active: true }), { answer: 'revoked', active: true }]
    const chrome = fakeChrome(answers, { html: GATE })
    const app = await setup(chrome, { logins: true })
    expect((await scrape(app, { url: 'https://site.test/a', lane: 'my-browser' })).body).toMatchObject({ status: 'cancelled' })
    const file = join(root, 'logins', 'allowed-sites.json')
    for (let i = 0; i < 100 && JSON.parse(await readFile(file, 'utf8')).sites.length > 0; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ sites: [] })
    // Closed after Allow: still remembered.
    const closing = fakeChrome([{ answer: 'allowed', active: true }, ...Array(3).fill({ answer: 'allowed', active: true }), 'closed'], { html: GATE })
    const app2 = await setup(closing, { logins: true })
    expect((await scrape(app2, { url: 'https://site.test/a', lane: 'my-browser' })).body).toMatchObject({ status: 'cancelled' })
    expect(JSON.parse(await readFile(join(root, 'logins', 'allowed-sites.json'), 'utf8')).sites).toEqual([expect.objectContaining({ host: 'site.test' })])
  }, 30_000)

  it('is refused by name where it is not offered, and for what a page in the person\'s Chrome cannot give', async () => {
    const hosted = await setup(null, { hosted: true })
    expect(await scrape(hosted, { url: 'https://site.test/a', lane: 'my-browser' })).toMatchObject({ status: 400, body: { code: 'unsupported_parameter', error: expect.stringContaining('does not read pages in your Chrome'), details: { parameters: ['lane'] } } })
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })
    const app = await setup(fakeChrome([{ answer: 'allowed', active: true }], { href: 'https://site.test/a', html: PAGE }))
    expect(await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', actions: [{ type: 'wait', milliseconds: 10 }] })).toMatchObject({ status: 400, body: { error: expect.stringContaining('page actions') } })
    expect(await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', formats: ['screenshot'] })).toMatchObject({ status: 400, body: { error: expect.stringContaining('a screenshot') } })
    expect(await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', mode: 'research' })).toMatchObject({ status: 400, body: { error: expect.stringContaining('mode research does not apply') } })
    expect(await scrape(app, { url: 'https://site.test/a', lane: 'my-browser', lockdown: true })).toMatchObject({ status: 400, body: { details: { parameters: ['lane', 'lockdown'] } } })
    expect(await scrape(app, { url: 'https://site.test/a', lane: 'browser' })).toMatchObject({ status: 400, body: { error: 'lane must be one of: my-browser' } })
  })
})

describe('the my-browser lane in a batch', () => {
  let root: string
  let engine: ApiEngine | null = null
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  async function setup(chrome: ReturnType<typeof fakeChrome> | null, options: { hosted?: boolean; hiddenWaitMs?: number; signInSettleMs?: number; logins?: boolean } = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-my-browser-batch-'))
    const userDataDir = join(root, 'chrome')
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), ...(options.logins === true ? { sessionsFile: join(root, 'logins', 'sessions.json') } : {}), ...(options.hosted === true ? { hosted: true } : {}), ...(chrome === null ? {} : { userChrome: { userDataDir, connect: chrome.connect, ...(options.hiddenWaitMs === undefined ? {} : { hiddenWaitMs: options.hiddenWaitMs }), ...(options.signInSettleMs === undefined ? {} : { signInSettleMs: options.signInSettleMs }) } }) })
    return createApp(engine)
  }
  const post = async (app: ReturnType<typeof createApp>, body: Record<string, unknown>) => {
    const res = await app.request('/v1/batches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }
  async function settled(app: ReturnType<typeof createApp>, id: string) {
    for (let i = 0; i < 600; i++) {
      const report = await (await app.request(`/v1/batches/${id}`)).json() as { status: string }
      if (!['pending', 'running'].includes(report.status)) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const items = (await (await app.request(`/v1/batches/${id}/items?debug=true`)).json() as { items: Array<Record<string, any>> }).items
    return { report: await (await app.request(`/v1/batches/${id}`)).json() as Record<string, any>, items: Object.fromEntries(items.map((item) => [String(item.url), item] as const)) }
  }

  it('asks the person once for every site of the batch, then reads each page in their Chrome, one at a time', async () => {
    const chrome = fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { html: PAGE })
    const app = await setup(chrome)
    const started = await post(app, { urls: ['https://site.test/a', 'https://other.test:8443/b'], lane: 'my-browser' })
    expect(started.status).toBe(202)
    const { report, items } = await settled(app, started.body.id ?? started.body.taskId)
    expect(report).toMatchObject({ status: 'completed', completed: 2 })
    for (const url of ['https://site.test/a', 'https://other.test:8443/b']) {
      expect(items[url]).toMatchObject({ status: 'success', lane: 'my_browser' })
      expect(items[url]!.evidenceRecord.access).toMatchObject({ route: 'user_browser', completion: 'user_browser' })
    }
    // One page asking for both sites, host and port, then one tab per page.
    expect(chrome.written).toHaveLength(1)
    expect(chrome.written[0]).toContain('site.test')
    expect(chrome.written[0]).toContain('other.test:8443')
    expect(chrome.created).toHaveLength(3)
    expect(chrome.mostOpen()).toBe(1)
    // A page read in the person's Chrome is never stored: a later cache-only request finds nothing.
    const later = await app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://site.test/a', lockdown: true }) })
    expect(await later.json()).toMatchObject({ status: 'failed', failureReason: 'cache_miss' })
  }, 30_000)

  it('with its tabs in front (backgroundTabs: false), waits once in a batch for a tab out of sight: the pages after the first are read whole at once', async () => {
    const chrome = fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { html: PAGE, hidden: true })
    const app = await setup(chrome, { hiddenWaitMs: 300 })
    const urls = ['https://site.test/a', 'https://site.test/b', 'https://site.test/c']
    const started = await post(app, { urls, lane: 'my-browser', backgroundTabs: false })
    const { items } = await settled(app, started.body.id ?? started.body.taskId)
    const waited = urls.map((url) => {
      expect(items[url]).toMatchObject({ status: 'success', lane: 'my_browser' })
      expect(items[url]!.warnings.map((w: { code: string }) => w.code)).toContain('page_read_hidden')
      return items[url]!.trace.find((e: { event: string }) => e.event === 'user_browser_read').detail
    })
    // One page waited the whole wait; the others, read after it, did not wait again. Each page's tab was brought to the front.
    for (const detail of waited) expect(detail).toMatchObject({ tabHidden: true })
    expect(waited.filter((detail) => detail.hiddenWaitMs >= 300)).toHaveLength(1)
    expect(chrome.activated).toEqual(['tab1', 'tab2', 'tab3', 'tab4'])
    expect(chrome.backgrounded).toEqual([])
  }, 30_000)

  it('opens each page in a tab behind the one the person is on and brings none to the front: the pages are read whole at once, without the wait for the tab', async () => {
    const chrome = fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { html: PAGE, hidden: true })
    const app = await setup(chrome, { hiddenWaitMs: 300 })
    const urls = ['https://site.test/a', 'https://site.test/b', 'https://site.test/c']
    const started = await post(app, { urls, lane: 'my-browser' })
    const { items } = await settled(app, started.body.id ?? started.body.taskId)
    for (const url of urls) {
      expect(items[url]).toMatchObject({ status: 'success', lane: 'my_browser' })
      expect(items[url]!.warnings.map((w: { code: string }) => w.code)).toContain('page_read_hidden')
      const detail = items[url]!.trace.find((e: { event: string }) => e.event === 'user_browser_read').detail
      expect(detail).toMatchObject({ tabHidden: true, background: true })
      expect(detail.hiddenWaitMs).toBeLessThan(300)
    }
    // Only the page that asks to allow the sites comes to the front; every page's tab opens behind the person's.
    expect(chrome.activated).toEqual(['tab1'])
    expect(chrome.backgrounded).toEqual(['tab2', 'tab3', 'tab4'])
  }, 30_000)

  it('gives a page read without the person\'s login time for the site to sign them back in, once in a batch: the pages after it are read at once until one comes with the login', async () => {
    const PROMPT = PAGE.replace('</article>', '<p><strong>Log in for contact details</strong></p></article>')
    // Page c comes with the login again: the page after it, d, is given the wait once more.
    const chrome = fakeChrome([{ answer: '', active: false }, { answer: 'allowed', active: true }], { html: PROMPT, htmls: { 'https://site.test/c': PAGE } })
    const app = await setup(chrome, { signInSettleMs: 200 })
    const urls = ['https://site.test/a', 'https://site.test/b', 'https://site.test/c', 'https://site.test/d']
    // Not read again for the line (retry.softBlocks 0): each page once, in order.
    const started = await post(app, { urls, lane: 'my-browser', retry: { softBlocks: 0 } })
    const { items } = await settled(app, started.body.id ?? started.body.taskId)
    const waits = urls.map((url) => {
      expect(items[url]).toMatchObject({ status: 'success', lane: 'my_browser' })
      expect((items[url]!.warnings ?? []).some((w: { code: string }) => w.code === 'sign_in_prompt')).toBe(url !== 'https://site.test/c')
      return items[url]!.trace.find((e: { event: string }) => e.event === 'user_browser_read').detail.signInWait
    })
    expect(waits[0]).toMatchObject({ cleared: false, returned: false })
    expect(waits[0].waitedMs).toBeGreaterThanOrEqual(200)
    expect(waits.slice(1, 3)).toEqual([undefined, undefined])
    expect(waits[3]).toMatchObject({ cleared: false })
  }, 30_000)

  it('says it waits for the person while they have not allowed the sites, and no longer once they have', async () => {
    // The person has not answered until the batch was seen waiting for them, however long it takes to get there.
    const answers: Answer[] = [{ answer: '', active: false }]
    const chrome = fakeChrome(answers, { html: PAGE })
    const app = await setup(chrome)
    const started = await post(app, { urls: ['https://site.test/a'], lane: 'my-browser' })
    const id = String(started.body.id ?? started.body.taskId)
    while ((await (await app.request(`/v1/batches/${id}`)).json() as { waitingForApproval?: boolean }).waitingForApproval !== true) await new Promise((resolve) => setTimeout(resolve, 10))
    answers.push({ answer: 'allowed', active: true })
    const { report } = await settled(app, id)
    expect(report).toMatchObject({ status: 'completed' })
    expect(report.waitingForApproval).toBeUndefined()
  }, 30_000)

  it('asks only for the sites of a batch not remembered, and reads every page', async () => {
    const chrome = fakeChrome([{ answer: 'allowed', active: true }], { html: PAGE })
    const app = await setup(chrome, { logins: true })
    await rememberSites(join(root, 'logins', 'allowed-sites.json'), ['site.test'], '2026-11-08T00:00:00.000Z')
    const started = await post(app, { urls: ['https://site.test/a', 'https://other.test/b'], lane: 'my-browser' })
    const { report, items } = await settled(app, started.body.id ?? started.body.taskId)
    expect(report).toMatchObject({ status: 'completed', completed: 2 })
    expect(chrome.written).toHaveLength(1)
    expect(chrome.written[0]).toContain('other.test')
    expect(chrome.written[0]).not.toContain('<code>site.test</code>')
    expect(items['https://site.test/a']!.evidenceRecord.access.allowance).toEqual({ basis: 'remembered', allowedAt: '2026-11-08T00:00:00.000Z' })
    expect(items['https://other.test/b']!.evidenceRecord.access.allowance).toMatchObject({ basis: 'clicked' })
    // A batch on remembered sites alone asks nothing.
    const again = await post(app, { urls: ['https://site.test/c', 'https://other.test/d'], lane: 'my-browser' })
    expect((await settled(app, again.body.id ?? again.body.taskId)).report).toMatchObject({ status: 'completed', completed: 2 })
    expect(chrome.written).toHaveLength(1)
  }, 30_000)

  it('reads none of its pages when the person does not allow the sites, and says why on each', async () => {
    const chrome = fakeChrome([{ answer: 'revoked', active: true }], { html: PAGE })
    const app = await setup(chrome)
    const started = await post(app, { urls: ['https://site.test/a', 'https://site.test/b'], lane: 'my-browser' })
    const { items } = await settled(app, started.body.id ?? started.body.taskId)
    for (const item of Object.values(items)) {
      expect(item).toMatchObject({ status: 'cancelled', lane: 'my_browser' })
      expect(item.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'my_browser_not_read', message: expect.stringContaining('clicked Revoke') })]))
    }
    // Asked once for the run, not once per page.
    expect(chrome.written).toHaveLength(1)
  }, 30_000)

  const until = async (done: () => boolean, ms = 10_000) => { for (const end = Date.now() + ms; !done() && Date.now() < end;) await new Promise((resolve) => setTimeout(resolve, 20)) }
  const idOf = (body: Record<string, any>) => String(body.id ?? body.taskId)

  it('opens no tab after the person revokes the sites: the pages left are not read, and say so', async () => {
    // Allowed; the first page shows a captcha; the person clicks Revoke while it waits.
    const answers: Answer[] = [...Array(4).fill({ answer: 'allowed', active: true }), { answer: 'revoked', active: true }]
    const chrome = fakeChrome(answers, { html: GATE })
    const app = await setup(chrome)
    const started = await post(app, { urls: ['https://site.test/a', 'https://site.test/b', 'https://site.test/c'], lane: 'my-browser' })
    const { items } = await settled(app, idOf(started.body))
    expect(Object.values(items).map((item) => item.status)).toEqual(['cancelled', 'cancelled', 'cancelled'])
    expect(items['https://site.test/c']!.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('revoked') })]))
    // Octocrawl's page and the first page's tab, no other.
    expect(chrome.created).toHaveLength(2)
  }, 30_000)

  it('opens no tab for a URL appended on a site the person did not allow for this run', async () => {
    const chrome = fakeChrome([{ answer: 'allowed', active: true }], { html: PAGE })
    const app = await setup(chrome)
    const started = await post(app, { urls: ['https://site.test/a', 'https://site.test/b'], lane: 'my-browser' })
    await until(() => chrome.created.length >= 2)
    expect(await post(app, { urls: ['https://elsewhere.test/x'], appendToId: idOf(started.body) })).toMatchObject({ status: 202 })
    const { items } = await settled(app, idOf(started.body))
    expect(items['https://elsewhere.test/x']).toMatchObject({ status: 'cancelled' })
    expect(items['https://elsewhere.test/x']!.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('elsewhere.test is not among the sites you allowed') })]))
    expect([...chrome.navigated.values()]).not.toContain('https://elsewhere.test/x')
  }, 30_000)

  it('leaves no tab open and sends nothing after closing the connection when the batch is cancelled, waiting or reading', async () => {
    // Cancelled while a page waits on its captcha.
    const reading = fakeChrome([{ answer: 'allowed', active: true }], { html: GATE })
    let app = await setup(reading)
    let started = await post(app, { urls: ['https://site.test/a'], lane: 'my-browser' })
    await until(() => reading.created.length >= 2)
    await app.request(`/v1/batches/${idOf(started.body)}/cancel`, { method: 'POST' })
    await until(() => reading.closed())
    expect(reading.closed()).toBe(true)
    expect([...reading.live]).toEqual([])
    expect(reading.afterClose).toEqual([])
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })
    // Cancelled while Octocrawl's page still waits for the person to allow the sites.
    const asking = fakeChrome([{ answer: '', active: false }], { html: PAGE })
    app = await setup(asking)
    started = await post(app, { urls: ['https://site.test/a'], lane: 'my-browser' })
    await until(() => asking.written.length >= 1)
    await app.request(`/v1/batches/${idOf(started.body)}/cancel`, { method: 'POST' })
    await until(() => asking.closed(), 5_000)
    expect(asking.closed()).toBe(true)
    expect([...asking.live]).toEqual([])
    expect(asking.afterClose).toEqual([])
  }, 30_000)

  it('is refused by name where it is not offered, and for what it does not give', async () => {
    const hosted = await setup(null, { hosted: true })
    expect(await post(hosted, { urls: ['https://site.test/a'], lane: 'my-browser' })).toMatchObject({ status: 400, body: { details: { parameters: ['lane'] } } })
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })
    const app = await setup(fakeChrome([{ answer: 'allowed', active: true }], { html: PAGE }))
    expect(await post(app, { urls: ['https://site.test/a'], lane: 'my-browser', maxConcurrency: 2 })).toMatchObject({ status: 400, body: { details: { parameters: ['lane', 'maxConcurrency'] } } })
    expect(await post(app, { urls: ['https://site.test/a'], lane: 'my-browser', webhook: 'https://hooks.example/x' })).toMatchObject({ status: 400, body: { details: { parameters: ['lane', 'webhook'] } } })
    expect(await post(app, { urls: ['https://site.test/a'], lane: 'my-browser', actions: [{ type: 'wait', milliseconds: 10 }] })).toMatchObject({ status: 400, body: { error: expect.stringContaining('page actions') } })
    expect(await post(app, { urls: ['https://site.test/a'], lane: 'my-browser', mode: 'authed' })).toMatchObject({ status: 400, body: { error: expect.stringContaining('mode authed does not apply') } })
    expect(await post(app, { urls: ['https://site.test/a'], backgroundTabs: true })).toMatchObject({ status: 400, body: { code: 'unsupported_parameter', details: { parameters: ['backgroundTabs'] } } })
    expect(await post(app, { urls: ['https://site.test/a'], lane: 'my-browser', backgroundTabs: 'yes' })).toMatchObject({ status: 400, body: { error: 'backgroundTabs must be a boolean' } })
  })
})

describe('the person\'s Chrome, asked to allow sites', () => {
  let userDataDir: string
  afterEach(async () => { await rm(userDataDir, { recursive: true, force: true }) })

  it('shows the sites and the task escaped, and a revoke after Allow aborts its signal', async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'w2l-my-browser-chrome-'))
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    const chrome = fakeChrome([{ answer: 'allowed', active: true }, { answer: 'allowed', active: true }, { answer: 'revoked', active: true }], { href: 'https://site.test/a', html: PAGE })
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const allowed = await reader.allow({ hosts: ['site.test'], task: 'scrape <script>alert(1)</script>' }, { pollMs: 1 })
    expect(chrome.written[0]).not.toContain('<script>alert(1)')
    expect(chrome.written[0]).toContain('&#60;script&#62;alert(1)')
    expect(allowed.hosts).toEqual(['site.test'])
    for (let i = 0; i < 100 && !allowed.signal.aborted; i++) await new Promise((resolve) => setTimeout(resolve, 50))
    expect(allowed.signal.aborted).toBe(true)
    await allowed.close()
    // Not answered in time: refused, the page closed.
    const silent = fakeChrome([{ answer: '', active: false }], { href: 'https://site.test/a', html: PAGE })
    const reader2 = await openUserChrome({ userDataDir, connect: silent.connect })
    const late = await reader2.allow({ hosts: ['site.test'], task: 't' }, { pollMs: 1, waitMs: 30 }).catch((error: unknown) => error)
    expect(late).toBeInstanceOf(HandoffNotThrough)
    expect(late).toMatchObject({ kind: 'timeout', message: expect.stringContaining('the page was not clicked') })
    // Allowed on the page but no click Chrome counts: the refusal says so, and each step is told to the log.
    const steps: Array<[string, Record<string, unknown>]> = []
    const scripted = fakeChrome([{ answer: 'allowed', active: false }], { href: 'https://site.test/a', html: PAGE })
    const reader3 = await openUserChrome({ userDataDir, connect: scripted.connect })
    const unclicked = await reader3.allow({ hosts: ['site.test'], task: 't' }, { pollMs: 1, waitMs: 30, log: (step, detail) => steps.push([step, detail]) }).catch((error: unknown) => error)
    expect(unclicked).toMatchObject({ kind: 'timeout', message: expect.stringContaining('the page answered allowed, but no click of yours on it was seen') })
    expect(steps.map(([step]) => step)).toEqual(['shown', 'ready', 'answer', 'refused'])
    expect(steps[1]![1]).toEqual({ buttons: true })
    expect(steps[3]![1]).toMatchObject({ reason: 'timeout', answer: 'allowed', active: false })
  }, 20_000)

  it('reads without the person only on the host they allowed, exactly: not a subdomain or a parent it leads to', async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'w2l-my-browser-chrome-'))
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    // The page asked for leads to `landsOn`: read only when that is the host allowed.
    const readOn = async (allowedHost: string, asked: string, landsOn: string) => {
      const chrome = fakeChrome([{ answer: 'allowed', active: true }], { href: landsOn, html: PAGE })
      const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
      const allowed = await reader.allow({ hosts: [allowedHost], task: 't' }, { pollMs: 1 })
      try { return await reader.read(asked, { unattended: true, allowedHosts: allowed.hosts, pollMs: 1, waitMs: 300 }) }
      catch (error) { return error }
      finally { await allowed.close(); reader.close() }
    }
    expect(await readOn('site.test', 'https://site.test/a', 'https://site.test/a')).toMatchObject({ finalUrl: 'https://site.test/a', act: null })
    // A subdomain the allowed host leads to (an apex to its mail host), and the parent a subdomain leads to.
    expect(await readOn('site.test', 'https://site.test/mail', 'https://mail.site.test/mail')).toMatchObject({ message: expect.stringContaining('mail.site.test, which you did not allow') })
    expect(await readOn('docs.site.test', 'https://docs.site.test/x', 'https://site.test/settings')).toMatchObject({ message: expect.stringContaining('site.test, which you did not allow') })
    // Another port of the host allowed is another site.
    expect(await readOn('site.test', 'https://site.test/a', 'https://site.test:8443/a')).toMatchObject({ message: expect.stringContaining('site.test:8443, which you did not allow') })
  }, 20_000)
})
