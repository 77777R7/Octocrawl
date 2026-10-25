import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { chromium, type Browser, type Page } from 'playwright'
import { createSpendLedger } from '@w2l/http-core'
import { localNetworkPolicy, type PaidCallLog, type PaidCallRecord } from '@w2l/contracts'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { solveChallenges, type CaptchaSolving, type SolveTraceDetail } from '../src/vendors/captchaSolver.js'
import { CapSolver } from '../src/vendors/capsolver.js'
import { startMockCapSolver, type MockBehaviour, type MockCapSolver } from './mockCapSolver.js'

// Playwright's Chromium, headless, reads loopback challenge pages; CapSolver is a loopback stand-in. No request leaves the machine.
const KEY = 'CAP-int-key-51ee'
const GOOD = 'ts-secret-good-0001'
const RC_GOOD = 'rc-secret-good-0002'
const EXIT = { url: 'http://203.0.113.9:80', endpoint: '203.0.113.9:80', username: 'user-us-1', password: 'exit-pass-9c1' }
const ARTICLE = `<!doctype html><title>Tide tables</title><main><h1>Tide tables</h1>${'<p>The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year.</p>'.repeat(6)}</main>`
const TURNSTILE = (action: string) => `<!doctype html><title>Verify</title><p>One moment.</p><form method="post" action="${action}"><div class="cf-turnstile" data-sitekey="0x4TESTKEY" data-action="read"></div></form>`
const RECAPTCHA = `<!doctype html><title>Verify</title><p>One moment.</p><div class="g-recaptcha" data-sitekey="6LTESTKEY" data-callback="onOk"></div><script>function onOk(t) { document.cookie = 'rc=' + (t === '${RC_GOOD}' ? 'ok' : 'bad') + '; path=/'; location.reload() }</script>`
const DATADOME = `<!doctype html><title>shop</title><p>Please enable JS and disable any ad blocker</p><iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=abc&cid=def&t=fe&referer=x" width="100%" height="100%"></iframe>`

let site: Server
let base = ''
beforeAll(async () => {
  site = createServer((req, res) => {
    const cookie = req.headers.cookie ?? ''
    const html = (status: number, body: string, headers: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'text/html', ...headers }); res.end(body) }
    const path = req.url ?? '/'
    if (path === '/robots.txt') { res.writeHead(404).end(); return }
    if (req.method === 'POST' && (path === '/turnstile' || path === '/holds')) {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        // /turnstile clears for the right token; /holds never clears, whatever is sent.
        const ok = path === '/turnstile' && new URLSearchParams(body).get('cf-turnstile-response') === GOOD
        res.writeHead(303, { location: path, ...(ok ? { 'set-cookie': 'ts=ok; path=/' } : {}) }).end()
      })
      return
    }
    if (path === '/turnstile' || path === '/holds') return cookie.includes('ts=ok') ? html(200, ARTICLE) : html(200, TURNSTILE(path))
    if (path === '/recaptcha') return cookie.includes('rc=ok') ? html(200, ARTICLE) : html(200, RECAPTCHA)
    if (path.startsWith('/callback-get')) return html(200, `<!doctype html><title>Verify</title><p>One moment.</p><div class="g-recaptcha" data-sitekey="6LTESTKEY" data-callback="go"></div><form id="f" method="get" action="/callback-get"><textarea name="g-recaptcha-response"></textarea></form><script>function go() { document.getElementById('f').submit() }</script>`)
    if (path.startsWith('/get-form')) return html(200, TURNSTILE('/get-form').replace('method="post"', 'method="get"'))
    if (path === '/hcaptcha') return html(200, '<!doctype html><title>Verify</title><p>One moment.</p><div class="h-captcha" data-sitekey="abc"></div>')
    if (path === '/datadome') return html(403, DATADOME, { 'x-datadome-cid': 'abc' })
    if (path === '/article-with-form') return html(200, ARTICLE.replace('</main>', '<form><div class="g-recaptcha" data-sitekey="6LTESTKEY"></div></form></main>'))
    html(200, ARTICLE)
  })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  const address = site.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
})
afterAll(async () => { await new Promise((resolve) => site.close(resolve)) })

let mock: MockCapSolver | null = null
afterEach(async () => { await mock?.close(); mock = null })

/** The mock's answers: the right token for each widget, unless a test says otherwise. */
const answers = (task: Record<string, unknown>): MockBehaviour => task.type === 'AntiTurnstileTaskProxyLess' ? { solution: { token: GOOD }, polls: 1 } : task.type === 'ReCaptchaV2TaskProxyLess' ? { solution: { gRecaptchaResponse: RC_GOOD } } : { solution: { cookie: 'datadome=dd-secret-3; Path=/' } }
const solvingWith = (m: MockCapSolver, over: Partial<CaptchaSolving> = {}): CaptchaSolving => ({ solver: new CapSolver({ apiKey: KEY, baseUrl: m.url, pollMs: 20 }), perSolveUsd: 0.003, maxSolvesPerCall: 2, egress: null, grantHash: 'f'.repeat(64), ...over })
/** The public browser rung, stock Playwright, with ad hosts naming DataDome's captcha host so blockAds keeps the test offline. */
const subjectWith = (solving: CaptchaSolving) => new BrowserLocalSubject('standard', null, false, localNetworkPolicy(), null, undefined, null, undefined, undefined, null, false, ['captcha-delivery.com'], 'playwright', 'actual', {}, solving)
const solves = (trace: readonly { event: string; detail?: Record<string, unknown> }[]) => trace.filter((event) => event.event === 'captcha_solve').map((event) => event.detail as unknown as SolveTraceDetail)
/** A task's paid-call journal in memory: every row as written. */
function journal(): PaidCallLog & { rows: PaidCallRecord[] } {
  let n = 0
  const rows: PaidCallRecord[] = []
  return {
    rows,
    open: (call) => ({ paidCallId: `t-a-${++n}`, taskId: 't', attemptId: 'a', url: call.url, vendorId: call.vendorId, ceilingUsd: call.ceilingUsd, state: 'reserved', chargedUsd: null, providerRequestId: null, providerSessionId: null, tariffVersion: null, grantHash: call.grantHash ?? null, deadline: call.deadline ?? null, createdAt: new Date().toISOString(), settledAt: null }),
    write: async (row) => { rows.push(row) },
  }
}

describe('the public browser rung with a CAPTCHA solver (ADR 0005 third_party_captcha_solver)', () => {
  it('solves a Turnstile and a reCAPTCHA v2 widget, puts the token into the page, and reads the page it then shows', async () => {
    const m = mock = await startMockCapSolver(answers)
    const subject = subjectWith(solvingWith(m))
    try {
      const ledger = createSpendLedger(1)
      const paid = journal()
      const turnstile = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger, paidCalls: paid })
      expect(turnstile.status).toBe('success')
      expect(turnstile.markdown).toContain('Tide tables')
      expect(solves(turnstile.trace)).toEqual([expect.objectContaining({ vendor: 'capsolver', type: 'turnstile', outcome: 'cleared', solve: 1, chargedUsd: 0.003, ceilingUsd: 0.003, costBasis: 'tariff', egress: 'none', blockReasonAfter: null, paidCallId: 't-a-1' })])
      expect(m.tasks).toEqual([{ type: 'AntiTurnstileTaskProxyLess', websiteURL: `${base}/turnstile`, websiteKey: '0x4TESTKEY', metadata: { action: 'read' } }])
      expect(ledger.settledUsd).toBeCloseTo(0.003)
      // The row is written before the task goes out, and settled after it.
      expect(paid.rows.map((row) => row.state)).toEqual(['reserved', 'settled'])

      const recaptcha = await subject.fetch(`${base}/recaptcha`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(recaptcha.status).toBe('success')
      expect(solves(recaptcha.trace)).toEqual([expect.objectContaining({ type: 'recaptcha_v2', outcome: 'cleared', chargedUsd: 0.003 })])
      expect(m.tasks[1]).toEqual({ type: 'ReCaptchaV2TaskProxyLess', websiteURL: `${base}/recaptcha`, websiteKey: '6LTESTKEY', isInvisible: false })
      expect(ledger.settledUsd).toBeCloseTo(0.006)

      // No token, cookie, key or exit login in the result, its trace or anything it records.
      for (const result of [turnstile, recaptcha]) expect(JSON.stringify(result)).not.toMatch(new RegExp([GOOD, RC_GOOD, KEY, EXIT.password].join('|')))
      expect(JSON.stringify(paid.rows)).not.toMatch(new RegExp([GOOD, KEY].join('|')))
    } finally { await subject.teardown() }
  }, 90_000)

  it('keeps a page still gated after a "successful" solve blocked, the solve paid; and stops at maxSolvesPerCall', async () => {
    const m = mock = await startMockCapSolver(answers)
    const subject = subjectWith(solvingWith(m, { maxSolvesPerCall: 1 }))
    try {
      const ledger = createSpendLedger(1)
      const held = await subject.fetch(`${base}/holds`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(held).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
      expect(solves(held.trace)).toEqual([
        expect.objectContaining({ outcome: 'still_gated', solve: 1, chargedUsd: 0.003, blockReasonAfter: 'captcha' }),
        expect.objectContaining({ outcome: 'limit_reached', reason: 'max_solves_per_call', solve: null, chargedUsd: null }),
      ])
      expect(m.tasks).toHaveLength(1)
      expect(ledger.settledUsd).toBeCloseTo(0.003)
    } finally { await subject.teardown() }
  }, 90_000)

  it('buys no solve past the budget, without a ledger, for a check no adapter solves, or on a page read as content', async () => {
    const m = mock = await startMockCapSolver(answers)
    const subject = subjectWith(solvingWith(m))
    try {
      const tight = createSpendLedger(0.002)
      const over = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: tight })
      expect(over.status).toBe('blocked')
      expect(solves(over.trace)).toEqual([expect.objectContaining({ outcome: 'limit_reached', reason: 'budget', chargedUsd: null })])
      expect(tight.settledUsd).toBe(0)
      const unbudgeted = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000)
      expect(solves(unbudgeted.trace)).toEqual([expect.objectContaining({ outcome: 'limit_reached', reason: 'no_budget' })])
      const ledger = createSpendLedger(1)
      const hcaptcha = await subject.fetch(`${base}/hcaptcha`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(hcaptcha.status).toBe('blocked')
      expect(solves(hcaptcha.trace)).toEqual([expect.objectContaining({ type: 'unsupported:hcaptcha', outcome: 'unsupported' })])
      // A widget whose form is sent by GET would put the token in the page's URL, which the record keeps: not bought.
      const byGet = await subject.fetch(`${base}/get-form`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(byGet.status).toBe('blocked')
      expect(solves(byGet.trace)).toEqual([expect.objectContaining({ type: 'unsupported:turnstile', outcome: 'unsupported', reason: 'form_sent_by_get' })])
      const otherForm = await subject.fetch(`${base}/callback-get`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(solves(otherForm.trace)).toEqual([expect.objectContaining({ type: 'unsupported:recaptcha_v2', reason: 'form_sent_by_get' })])
      // The page's solves are counted across its rungs: one the ladder says it already bought leaves none for this rung.
      const counted = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger, captchaSolves: { used: () => 2, charged: () => 1 } })
      expect(solves(counted.trace)).toEqual([expect.objectContaining({ outcome: 'limit_reached', reason: 'max_solves_per_call' })])
      // An article that carries a reCAPTCHA for its form is content: nothing to solve, nothing bought.
      const article = await subject.fetch(`${base}/article-with-form`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(article.status).toBe('success')
      expect(solves(article.trace)).toEqual([])
      expect(m.requests).toEqual([])
      expect(ledger.settledUsd).toBe(0)
    } finally { await subject.teardown() }
  }, 90_000)

  it('ends a failed or timed-out solve blocked, charging a task that was made and nothing for one that was not', async () => {
    let behaviour: MockBehaviour = { pollError: 'ERROR_CAPTCHA_UNSOLVABLE' }
    const m = mock = await startMockCapSolver(() => behaviour)
    const subject = subjectWith(solvingWith(m))
    try {
      const ledger = createSpendLedger(1)
      const failed = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(failed).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
      expect(solves(failed.trace)).toEqual([expect.objectContaining({ outcome: 'solver_failed', reason: 'unsolvable', code: 'ERROR_CAPTCHA_UNSOLVABLE', chargedUsd: 0.003 })])
      behaviour = { createError: 'ERROR_KEY_DENIED_ACCESS' }
      const denied = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(solves(denied.trace)).toEqual([expect.objectContaining({ outcome: 'solver_failed', reason: 'key_denied', chargedUsd: null })])
      behaviour = { never: true }
      const slow = await subject.fetch(`${base}/turnstile`, Date.now() + 12_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(slow.status).toBe('blocked')
      expect(solves(slow.trace)).toEqual([expect.objectContaining({ outcome: 'solver_failed', reason: 'timeout', chargedUsd: 0.003 })])
      expect(ledger.settledUsd).toBeCloseTo(0.006)
      expect(ledger.reservedUsd).toBe(0)
      // The vendor's free-text description repeated the request (the key); it is never on the result.
      for (const result of [failed, denied, slow]) expect(JSON.stringify(result)).not.toContain(KEY)
    } finally { await subject.teardown() }
  }, 90_000)

  it('never solves DataDome on another exit: a page that did not leave through the run\'s solver exit is not solved, nothing sent', async () => {
    const m = mock = await startMockCapSolver(answers)
    // The grant chose no solver exit, and then one the page did not take (loopback goes direct).
    for (const egress of [null, { endpoint: '127.0.0.1:1', upstream: EXIT }]) {
      const subject = subjectWith(solvingWith(m, { egress }))
      try {
        const page = await subject.fetch(`${base}/datadome`, Date.now() + 40_000, undefined, undefined, { blockAds: true }, undefined, undefined, { spend: createSpendLedger(1) })
        expect(page).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
        expect(solves(page.trace)).toEqual([expect.objectContaining({ type: 'datadome', outcome: 'egress_mismatch', reason: egress === null ? 'grant_chose_no_solver_exit' : 'page_not_on_solver_exit', chargedUsd: null })])
        expect(JSON.stringify(page)).not.toContain(EXIT.password)
      } finally { await subject.teardown() }
    }
    expect(m.requests).toEqual([])
  }, 90_000)
})

describe('solveChallenges on a page read through the solver exit', () => {
  let browser: Browser
  beforeAll(async () => { browser = await chromium.launch() })
  afterAll(async () => { await browser.close() })

  /** A page whose every request is answered by `serve`, as if read through the exit (nothing leaves the machine). */
  async function routed(serve: (url: URL, cookie: string) => { status: number; body: string; headers?: Record<string, string> }): Promise<Page> {
    const page = await browser.newPage()
    await page.route('**/*', async (route) => {
      const answer = serve(new URL(route.request().url()), (await route.request().allHeaders()).cookie ?? '')
      await route.fulfill({ status: answer.status, body: answer.body, headers: { 'content-type': 'text/html', ...(answer.headers ?? {}) } })
    })
    return page
  }
  const gate = (page: Page, status: () => number, headers: () => Record<string, string>) => async () => {
    const { classifyGate } = await import('@w2l/http-core')
    return classifyGate({ status: status(), header: (name) => headers()[name] ?? null, body: await page.content(), finalUrl: page.url() })
  }

  it('sends DataDome its captcha URL, the browser\'s User-Agent and the run\'s exit, sets its cookie in the same context and reloads', async () => {
    const m = mock = await startMockCapSolver(() => ({ solution: { cookie: 'datadome=dd-secret-4; Max-Age=3600; Domain=; Path=/; Secure; SameSite=Lax' } }))
    let cleared = false
    const page = await routed((url, cookie) => {
      if (url.hostname.endsWith('captcha-delivery.com')) return { status: 200, body: '<p>slider</p>' }
      cleared = cookie.includes('datadome=dd-secret-4')
      return cleared ? { status: 200, body: ARTICLE } : { status: 403, body: DATADOME, headers: { 'x-datadome-cid': 'abc' } }
    })
    try {
      await page.goto('https://shop.example/item')
      const egress = { endpoint: '127.0.0.1:65001', upstream: EXIT }
      const ua = await page.evaluate(() => navigator.userAgent)
      const events = await solveChallenges({
        page, solving: solvingWith(m, { egress }), userAgent: ua, pageEgress: '127.0.0.1:65001',
        gateNow: gate(page, () => cleared ? 200 : 403, (): Record<string, string> => cleared ? {} : { 'x-datadome-cid': 'abc' }), settle: () => page.waitForLoadState('domcontentloaded'),
        spend: createSpendLedger(1), paidCalls: undefined, log: undefined, rung: 'installed_chrome', onEvent: () => {}, url: 'https://shop.example/item', deadlineAt: Date.now() + 30_000, signal: undefined, reserveMs: 1_000,
      })
      expect(events).toEqual([expect.objectContaining({ type: 'datadome', outcome: 'cleared', egress: 'solver_proxy', chargedUsd: 0.003 })])
      expect(m.tasks).toEqual([{ type: 'DatadomeSliderTask', websiteURL: 'https://shop.example/item', captchaUrl: 'https://geo.captcha-delivery.com/captcha/?initialCid=abc&cid=def&t=fe&referer=x', userAgent: ua, proxy: '203.0.113.9:80:user-us-1:exit-pass-9c1' }])
      expect(await page.content()).toContain('Tide tables')
      expect(JSON.stringify(events)).not.toMatch(/dd-secret-4|exit-pass-9c1|CAP-int-key/)
    } finally { await page.close() }
  }, 60_000)

  it("sends Cloudflare's challenge the exit and the User-Agent, and sets cf_clearance", async () => {
    const m = mock = await startMockCapSolver(() => ({ solution: { cookies: { cf_clearance: 'cf-secret-5' }, token: 'cf-secret-5', userAgent: 'UA' } }))
    let cleared = false
    const page = await routed((_url, cookie) => {
      cleared = cookie.includes('cf_clearance=cf-secret-5')
      return cleared ? { status: 200, body: ARTICLE } : { status: 403, body: '<!doctype html><title>Just a moment...</title>', headers: { 'cf-mitigated': 'challenge' } }
    })
    try {
      await page.goto('https://shop.example/item')
      const events = await solveChallenges({
        page, solving: solvingWith(m, { egress: { endpoint: '127.0.0.1:65001', upstream: EXIT } }), userAgent: 'UA-of-browser', pageEgress: '127.0.0.1:65001',
        gateNow: gate(page, () => cleared ? 200 : 403, (): Record<string, string> => cleared ? {} : { 'cf-mitigated': 'challenge' }), settle: () => page.waitForLoadState('domcontentloaded'),
        spend: createSpendLedger(1), paidCalls: undefined, log: undefined, rung: 'installed_chrome', onEvent: () => {}, url: 'https://shop.example/item', deadlineAt: Date.now() + 30_000, signal: undefined, reserveMs: 1_000,
      })
      expect(events).toEqual([expect.objectContaining({ type: 'cloudflare_challenge', outcome: 'cleared', egress: 'solver_proxy' })])
      expect(m.tasks).toEqual([{ type: 'AntiCloudflareTask', websiteURL: 'https://shop.example/item', userAgent: 'UA-of-browser', proxy: '203.0.113.9:80:user-us-1:exit-pass-9c1' }])
    } finally { await page.close() }
  }, 60_000)
})
