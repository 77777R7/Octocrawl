import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { ChromeLoginError, type CdpConnection } from '../src/chromeLogin.js'
import { HandoffNotThrough, openUserChrome } from '../src/chromeHandoff.js'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * The my-browser lane (ROADMAP PA item 8) without a browser: a Chrome that shows Octocrawl's page asking the person
 * to allow the sites (its answer and whether they clicked it), and the page asked for, read by state.
 */

const GATE = '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>'
const PAGE = `<html><head><title>Ledger</title></head><body><article><h1>Tide ledger</h1>${'<p>The harbour office records the tide for every hour of the day. </p>'.repeat(4)}</article></body></html>`

/** The scope page's answer on each poll: what its buttons set, and whether the person clicked on it (their activation, which only Chrome sets); 'closed': they closed it. */
type Answer = { answer: '' | 'allowed' | 'revoked'; active: boolean } | 'closed'

function fakeChrome(answers: Answer[], page: { href: string; html: string }) {
  const written: string[] = []
  let polled = 0
  let targets = 0
  const kinds = new Map<string, 'scope' | 'page'>()
  const answerNow = (): Answer => answers[Math.min(polled, answers.length - 1)]!
  const connect = async (): Promise<CdpConnection> => ({
    async send(method, params, sessionId) {
      const p = (params ?? {}) as Record<string, unknown>
      if (method === 'Browser.getVersion') return { product: 'Chrome/144.0.7000.0' }
      if (method === 'Target.createTarget') { const id = `tab${++targets}`; kinds.set(id, targets === 1 ? 'scope' : 'page'); return { targetId: id } }
      if (method === 'Target.attachToTarget') return { sessionId: `s:${String(p.targetId)}` }
      if (method === 'Target.activateTarget' || method === 'Target.closeTarget' || method === 'Network.enable' || method === 'Page.navigate') return {}
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 }
      const kind = kinds.get(String(sessionId ?? p.targetId).replace(/^s:/, ''))
      if (method === 'Target.getTargetInfo') {
        if (kind === 'scope' && answerNow() === 'closed') throw new ChromeLoginError('Chrome refused the request: No target with given id found')
        return { targetInfo: { url: kind === 'scope' ? 'about:blank' : page.href } }
      }
      if (method === 'Runtime.evaluate') {
        const expression = String(p.expression)
        if (kind === 'scope') {
          if (expression.includes('document.write')) { written.push(expression); return {} }
          const now = answerNow()
          if (now === 'closed') throw new ChromeLoginError('Chrome refused the request: Session with given id not found.')
          if (p.contextId === 7) { polled++; return { result: { value: now.active } } }
          return { result: { value: now.answer } }
        }
        // The page asked for: never clicked on, so the lane reads it without the person.
        if (p.contextId === 7) return { result: { value: false } }
        return { result: { value: JSON.stringify({ href: page.href, ready: 'complete', status: 200, html: page.html, secret: false, field: null, hidden: false }) } }
      }
      throw new Error(`unexpected ${method}`)
    },
    close() {},
  })
  return { connect, written }
}

describe('the my-browser lane', () => {
  let root: string
  let engine: ApiEngine | null = null
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  async function setup(chrome: ReturnType<typeof fakeChrome> | null, options: { hosted?: boolean } = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-my-browser-'))
    const userDataDir = join(root, 'chrome')
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      ...(options.hosted === true ? { hosted: true } : {}),
      ...(chrome === null ? {} : { userChrome: { userDataDir, connect: chrome.connect } }),
    })
    return createApp(engine)
  }
  const scrape = async (app: ReturnType<typeof createApp>, body: Record<string, unknown>) => {
    const res = await app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../contracts/schemas/evidence-record.v1.json', import.meta.url)), 'utf8'))
  const valid = (record: unknown) => {
    const check = new Ajv2020({ strict: false }).compile(schema)
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
    expect(late).toMatchObject({ kind: 'timeout' })
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
  }, 20_000)
})
