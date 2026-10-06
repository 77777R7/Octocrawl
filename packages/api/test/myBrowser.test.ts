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

function fakeChrome(answers: Answer[], page: { href?: string; html: string }) {
  const written: string[] = []
  const created: string[] = []
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
  const kinds = new Map<string, 'scope' | 'page'>()
  const answerNow = (): Answer => answers[Math.min(polled, answers.length - 1)]!
  const hrefOf = (target: string) => page.href ?? navigated.get(target) ?? 'about:blank'
  const connect = async (): Promise<CdpConnection> => ({
    async send(method, params, sessionId) {
      const p = (params ?? {}) as Record<string, unknown>
      if (connectionClosed) { afterClose.push(method); throw new ChromeLoginError('Chrome closed the connection') }
      if (method === 'Browser.getVersion') return { product: 'Chrome/144.0.7000.0' }
      if (method === 'Target.createTarget') { const id = `tab${++targets}`; kinds.set(id, targets === 1 ? 'scope' : 'page'); created.push(id); live.add(id); if (targets > 1) mostOpen = Math.max(mostOpen, ++open); return { targetId: id } }
      if (method === 'Target.attachToTarget') return { sessionId: `s:${String(p.targetId)}` }
      if (method === 'Page.navigate') { navigated.set(String(sessionId).replace(/^s:/, ''), String(p.url)); return {} }
      if (method === 'Target.closeTarget') { if (kinds.get(String(p.targetId)) === 'page' && live.has(String(p.targetId))) open--; live.delete(String(p.targetId)); return {} }
      if (method === 'Target.activateTarget' || method === 'Network.enable') return {}
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 }
      const kind = kinds.get(String(sessionId ?? p.targetId).replace(/^s:/, ''))
      if (method === 'Target.getTargetInfo') {
        if (kind === 'scope' && answerNow() === 'closed') throw new ChromeLoginError('Chrome refused the request: No target with given id found')
        return { targetInfo: { url: kind === 'scope' ? 'about:blank' : hrefOf(String(p.targetId)) } }
      }
      if (method === 'Runtime.evaluate') {
        const expression = String(p.expression)
        if (kind === 'scope') {
          if (expression.includes('document.write')) { written.push(expression); return {} }
          // The page's own script wired its buttons.
          if (expression.includes("getElementById('allow')")) return { result: { value: true } }
          const now = answerNow()
          if (now === 'closed') throw new ChromeLoginError('Chrome refused the request: Session with given id not found.')
          if (p.contextId === 7) { polled++; return { result: { value: now.active } } }
          return { result: { value: now.answer } }
        }
        // The page asked for: never clicked on, so the lane reads it without the person.
        if (p.contextId === 7) return { result: { value: false } }
        return { result: { value: JSON.stringify({ href: hrefOf(String(sessionId).replace(/^s:/, '')), ready: 'complete', status: 200, html: page.html, secret: false, field: null, hidden: false }) } }
      }
      throw new Error(`unexpected ${method}`)
    },
    close() { connectionClosed = true },
  })
  return { connect, written, created, navigated, mostOpen: () => mostOpen, live, afterClose, closed: () => connectionClosed }
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

describe('the my-browser lane in a batch', () => {
  let root: string
  let engine: ApiEngine | null = null
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  async function setup(chrome: ReturnType<typeof fakeChrome> | null, options: { hosted?: boolean } = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-my-browser-batch-'))
    const userDataDir = join(root, 'chrome')
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), ...(options.hosted === true ? { hosted: true } : {}), ...(chrome === null ? {} : { userChrome: { userDataDir, connect: chrome.connect } }) })
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
    return { report: await (await app.request(`/v1/batches/${id}`)).json() as Record<string, any>, items: Object.fromEntries(items.map((item) => [item.url, item])) }
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

  it('says it waits for the person while they have not allowed the sites, and no longer once they have', async () => {
    const answers: Answer[] = [...Array(6).fill({ answer: '', active: false }), { answer: 'allowed', active: true }]
    const chrome = fakeChrome(answers, { html: PAGE })
    const app = await setup(chrome)
    const started = await post(app, { urls: ['https://site.test/a'], lane: 'my-browser' })
    const id = String(started.body.id ?? started.body.taskId)
    let waiting = false
    for (let i = 0; i < 200 && !waiting; i++) {
      waiting = (await (await app.request(`/v1/batches/${id}`)).json() as { waitingForApproval?: boolean }).waitingForApproval === true
      if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(waiting).toBe(true)
    const { report } = await settled(app, id)
    expect(report).toMatchObject({ status: 'completed' })
    expect(report.waitingForApproval).toBeUndefined()
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
