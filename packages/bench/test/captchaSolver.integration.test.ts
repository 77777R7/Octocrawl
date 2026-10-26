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
/** Google's reCAPTCHA demo's shape (C011, 2026-10-26): the widget in a POST form, its callback only clearing an error message. */
const RECAPTCHA_FORM = `<!doctype html><title>Verify</title><p>One moment.</p><form id="recaptcha-demo-form" method="POST" action="/recaptcha-form"><div class="g-recaptcha" data-sitekey="6LTESTKEY" data-callback="onSuccess"></div><p id="err">Please verify that you are not a robot.</p><button type="submit">Submit</button></form><script>function onSuccess() { document.getElementById('err').textContent = '' }</script>`
const MAC_151 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
const MAC_156 = MAC_151.replace('Chrome/151', 'Chrome/156')
/** The 2captcha demo's shape (2026-10-25): a 200 page whose form has no method or action, sent by its own script, which says when the token passed. */
const DEMO = (handled: boolean) => `<!doctype html><title>Turnstile demo</title><main><h1>Sample form</h1><p>${'Solve the widget and press Check to see the result of the check on this page. '.repeat(4)}</p><form id="f"><div class="cf-turnstile" data-sitekey="0x4DEMOKEY" style="width:300px;height:65px"></div><button type="submit">Check</button></form><p id="out"></p></main>${handled ? `<script>document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); const t = new FormData(e.target).get('cf-turnstile-response'); document.getElementById('out').textContent = t === '${GOOD}' ? 'Captcha is passed successfully!' : 'Captcha failed' })</script>` : ''}</main>`
/** A contact form with an invisible reCAPTCHA: a form that asks for more than the widget, never solved for a task. */
const CONTACT = `<!doctype html><title>Contact</title><main><h1>Contact us</h1><p>${'Write to the harbour office and we answer within two days. '.repeat(4)}</p><form method="post" action="/contact"><input name="email" type="email"><textarea name="message"></textarea><div class="g-recaptcha" data-sitekey="6LTESTKEY" data-size="invisible" style="width:300px;height:65px"></div><button>Send</button></form></main>`
const DATADOME = `<!doctype html><title>shop</title><p>Please enable JS and disable any ad blocker</p><iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=abc&cid=def&t=fe&referer=x" width="100%" height="100%"></iframe>`

let site: Server
let contactPosts = 0
let recaptchaFormPosts = 0
let recaptchaChecks = 0
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
    if (req.method === 'POST' && path === '/recaptcha-form') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        recaptchaFormPosts++
        const ok = new URLSearchParams(body).get('g-recaptcha-response') === RC_GOOD
        res.writeHead(303, { location: path, ...(ok ? { 'set-cookie': 'rf=ok; path=/' } : {}) }).end()
      })
      return
    }
    if (path === '/recaptcha-form') return cookie.includes('rf=ok') ? html(200, ARTICLE) : html(200, RECAPTCHA_FORM)
    // Google's demo itself (C011, 2026-10-26): the form's POST is answered with a page of 31 characters and no main block.
    if (req.method === 'POST' && path === '/recaptcha-demo') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        recaptchaFormPosts++
        if (new URLSearchParams(body).get('g-recaptcha-response') === RC_GOOD) html(200, '<!doctype html><title>ReCAPTCHA demo</title><div class="recaptcha-success">Verification Success... Hooray!</div>')
        else html(200, RECAPTCHA_FORM.replace('action="/recaptcha-form"', 'action="/recaptcha-demo"'))
      })
      return
    }
    if (path === '/recaptcha-demo') return html(200, RECAPTCHA_FORM.replace('action="/recaptcha-form"', 'action="/recaptcha-demo"'))
    // The callback clears the page in place and leaves its form and widget there: only the page's gate says not to post.
    if (path === '/recaptcha-in-place') return html(200, RECAPTCHA_FORM.replace(`document.getElementById('err').textContent = ''`, `document.querySelector('p').remove(); document.body.insertAdjacentHTML('afterbegin', ${JSON.stringify(ARTICLE.replace(/<!doctype html><title>Tide tables<\/title>/i, ''))})`).replace('<title>Verify</title>', '<title>Tide tables</title>'))
    // Google's documented shape: the callback posts the form itself, and the site answers after 3 s.
    if (path === '/recaptcha-self-submit') return html(200, RECAPTCHA_FORM.replace(`document.getElementById('err').textContent = ''`, `document.getElementById('recaptcha-demo-form').submit()`).replace('action="/recaptcha-form"', 'action="/recaptcha-slow"'))
    if (req.method === 'POST' && path === '/recaptcha-slow') { recaptchaFormPosts++; setTimeout(() => res.writeHead(303, { location: '/recaptcha-slow', 'set-cookie': 'rs=ok; path=/' }).end(), 3_000); return }
    // A callback that checks the token by fetch (the site answers after 3 s), then clears the page in place.
    if (path === '/recaptcha-fetch') return html(200, RECAPTCHA_FORM.replace(`document.getElementById('err').textContent = ''`, `fetch('/recaptcha-check', { method: 'POST', body: arguments[0] }).then((r) => r.text()).then((t) => { if (t === 'ok') document.body.innerHTML = ${JSON.stringify(ARTICLE.replace(/<!doctype html><title>Tide tables<\/title>/i, ''))}; document.title = 'Tide tables' })`))
    if (req.method === 'POST' && path === '/recaptcha-check') { recaptchaChecks++; setTimeout(() => res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'), 3_000); return }
    if (path === '/recaptcha-slow') return cookie.includes('rs=ok') ? html(200, ARTICLE) : html(200, RECAPTCHA_FORM)
    if (path.startsWith('/callback-get')) return html(200, `<!doctype html><title>Verify</title><p>One moment.</p><div class="g-recaptcha" data-sitekey="6LTESTKEY" data-callback="go"></div><form id="f" method="get" action="/callback-get"><textarea name="g-recaptcha-response"></textarea></form><script>function go() { document.getElementById('f').submit() }</script>`)
    if (path.startsWith('/get-form')) return html(200, TURNSTILE('/get-form').replace('method="post"', 'method="get"'))
    if (path === '/demo') return html(200, DEMO(true))
    if (path === '/demo-native?stop') return html(200, DEMO(false).replace('</main>', `<script>document.getElementById('f').addEventListener('submit', (e) => e.stopPropagation())</script></main>`))
    if (path.startsWith('/demo-native')) return html(200, DEMO(false))
    if (req.method === 'POST' && path === '/contact') { contactPosts++; res.writeHead(303, { location: '/contact' }).end(); return }
    if (path === '/two-widgets') return html(200, CONTACT.replace('</main>', `<div class="g-recaptcha" data-sitekey="6LTESTKEY" data-callback="onGate" style="width:300px;height:78px"></div><p id="out"></p><script>function onGate(t) { document.getElementById('out').textContent = t === '${RC_GOOD}' ? 'Captcha is passed successfully!' : 'Captcha failed' }</script></main>`))
    if (path === '/contact') return html(200, CONTACT)
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
const answers = (task: Record<string, unknown>): MockBehaviour => task.type === 'AntiTurnstileTaskProxyLess' ? { solution: { token: GOOD }, polls: 1 } : task.type === 'ReCaptchaV2TaskProxyLess' ? { solution: { gRecaptchaResponse: RC_GOOD } } : task.type === 'AntiCloudflareTask' ? { solution: { cookies: { cf_clearance: 'cf-secret-6' } } } : { solution: { cookie: 'datadome=dd-secret-3; Path=/' } }
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

  it('posts the widget\'s own form when its callback leaves the page gated, and not when the callback cleared it (C011, 2026-10-26)', async () => {
    const m = mock = await startMockCapSolver(answers)
    const subject = subjectWith(solvingWith(m))
    try {
      recaptchaFormPosts = 0
      const posted = await subject.fetch(`${base}/recaptcha-form`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: createSpendLedger(1) })
      expect(solves(posted.trace)).toEqual([expect.objectContaining({ type: 'recaptcha_v2', outcome: 'cleared', blockReasonAfter: null })])
      expect(posted.status).toBe('success')
      expect(posted.markdown).toContain('Tide tables')
      expect(recaptchaFormPosts).toBe(1)
      expect(JSON.stringify(posted)).not.toContain(RC_GOOD)
      // A callback that clears the page in place: the form is never sent.
      recaptchaFormPosts = 0
      const inPlace = await subject.fetch(`${base}/recaptcha-in-place`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: createSpendLedger(1) })
      expect(solves(inPlace.trace)).toEqual([expect.objectContaining({ type: 'recaptcha_v2', outcome: 'cleared' })])
      expect(recaptchaFormPosts).toBe(0)
      // A callback that posts the form itself, its answer slower than the wait: the token is posted once, never twice.
      recaptchaFormPosts = 0
      const self = await subject.fetch(`${base}/recaptcha-self-submit`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: createSpendLedger(1) })
      expect(solves(self.trace)).toEqual([expect.objectContaining({ type: 'recaptcha_v2', outcome: 'cleared' })])
      expect(self.markdown).toContain('Tide tables')
      expect(recaptchaFormPosts).toBe(1)
      // A callback whose check by fetch outlasts the wait: its token, which a site takes once, is not posted again.
      recaptchaFormPosts = 0
      recaptchaChecks = 0
      const checked = await subject.fetch(`${base}/recaptcha-fetch`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: createSpendLedger(1) })
      expect(solves(checked.trace)).toEqual([expect.objectContaining({ type: 'recaptcha_v2', outcome: 'cleared' })])
      expect([recaptchaChecks, recaptchaFormPosts]).toEqual([1, 0])
    } finally { await subject.teardown() }
  }, 90_000)

  it("delivers the short page a solve cleared when the task's contract holds on it, not escalated as empty (C011, 2026-10-26)", async () => {
    const m = mock = await startMockCapSolver(answers)
    const subject = subjectWith(solvingWith(m))
    try {
      recaptchaFormPosts = 0
      const verify = { checks: [{ type: 'markdownMatches' as const, pattern: 'Verification Success' }] }
      const page = await subject.fetch(`${base}/recaptcha-demo`, Date.now() + 40_000, undefined, undefined, { verify }, undefined, undefined, { spend: createSpendLedger(1) })
      expect(solves(page.trace)).toEqual([expect.objectContaining({ type: 'recaptcha_v2', outcome: 'cleared', blockReasonAfter: null })])
      expect(page).toMatchObject({ status: 'success', failureReason: null, markdown: 'Verification Success... Hooray!' })
      expect(recaptchaFormPosts).toBe(1)
      expect(JSON.stringify(page)).not.toContain(RC_GOOD)
    } finally { await subject.teardown() }
  }, 60_000)

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
      const counted = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger, captchaSolves: { used: () => 2, charged: () => 1, refused: () => {} } })
      expect(solves(counted.trace)).toEqual([expect.objectContaining({ outcome: 'limit_reached', reason: 'max_solves_per_call' })])
      // An article that carries a reCAPTCHA for its form is content: nothing to solve, nothing bought.
      const article = await subject.fetch(`${base}/article-with-form`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(article.status).toBe('success')
      expect(solves(article.trace)).toEqual([])
      expect(m.requests).toEqual([])
      expect(ledger.settledUsd).toBe(0)
    } finally { await subject.teardown() }
  }, 90_000)

  it('ends a failed or timed-out solve blocked, charging a task whose bill is unknown and nothing for one the vendor did not bill', async () => {
    let behaviour: MockBehaviour = { pollError: 'ERROR_CAPTCHA_UNSOLVABLE' }
    const m = mock = await startMockCapSolver(() => behaviour)
    const subject = subjectWith(solvingWith(m))
    try {
      const ledger = createSpendLedger(1)
      const failed = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(failed).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
      // CapSolver bills no task it reports failed: attempted, charged 0, on the record as such (smoke test 2026-10-25, T045).
      expect(solves(failed.trace)).toEqual([expect.objectContaining({ outcome: 'solver_failed', reason: 'unsolvable', code: 'ERROR_CAPTCHA_UNSOLVABLE', chargedUsd: 0, costBasis: 'vendor_unbilled_failure', solve: 1 })])
      behaviour = { createError: 'ERROR_KEY_DENIED_ACCESS' }
      // A refused createTask charges nothing but counts against the page's solves, for the rungs after this one.
      const log = { refusedCalls: 0, used: () => log.refusedCalls, charged: () => 1, refused: () => { log.refusedCalls++ } }
      const denied = await subject.fetch(`${base}/turnstile`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger, captchaSolves: log })
      expect(solves(denied.trace)).toEqual([expect.objectContaining({ outcome: 'solver_failed', reason: 'key_denied', chargedUsd: null })])
      expect(log.refusedCalls).toBe(1)
      behaviour = { never: true }
      const slow = await subject.fetch(`${base}/turnstile`, Date.now() + 12_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(slow.status).toBe('blocked')
      expect(solves(slow.trace)).toEqual([expect.objectContaining({ outcome: 'solver_failed', reason: 'timeout', chargedUsd: 0.003 })])
      expect(ledger.settledUsd).toBeCloseTo(0.003)
      expect(ledger.reservedUsd).toBe(0)
      // The vendor's free-text description repeated the request (the key); it is never on the result.
      for (const result of [failed, denied, slow]) expect(JSON.stringify(result)).not.toContain(KEY)
    } finally { await subject.teardown() }
  }, 90_000)

  it('solves a widget that gates what the task needs on a page that answered 200, and only then (smoke test 2026-10-25, C009)', async () => {
    const m = mock = await startMockCapSolver(answers)
    const subject = subjectWith(solvingWith(m))
    const verify = { checks: [{ type: 'markdownMatches' as const, pattern: 'passed successfully', flags: 'i' }] }
    try {
      const ledger = createSpendLedger(1)
      const paid = journal()
      const demo = await subject.fetch(`${base}/demo`, Date.now() + 40_000, undefined, undefined, { verify }, undefined, undefined, { spend: ledger, paidCalls: paid })
      expect(demo.status).toBe('success')
      expect(demo.markdown).toContain('Captcha is passed successfully!')
      expect(solves(demo.trace)).toEqual([expect.objectContaining({ type: 'turnstile', trigger: 'task_contract', outcome: 'cleared', solve: 1, chargedUsd: 0.003, blockReasonAfter: null })])
      expect(m.tasks).toEqual([{ type: 'AntiTurnstileTaskProxyLess', websiteURL: `${base}/demo`, websiteKey: '0x4DEMOKEY' }])
      // Without a task contract nothing says the widget gates anything: no solve.
      const asIs = await subject.fetch(`${base}/demo`, Date.now() + 40_000, undefined, undefined, {}, undefined, undefined, { spend: ledger })
      expect(asIs.status).toBe('success')
      expect(solves(asIs.trace)).toEqual([])
      // A contact form's invisible reCAPTCHA is not what a failing task waits on.
      const contact = await subject.fetch(`${base}/contact`, Date.now() + 40_000, undefined, undefined, { verify }, undefined, undefined, { spend: ledger })
      expect(solves(contact.trace)).toEqual([])
      expect(m.tasks).toHaveLength(1)
      expect(JSON.stringify([demo, paid.rows])).not.toContain(GOOD)
    } finally { await subject.teardown() }
  }, 90_000)

  it("never lets a form with no script of its own send the token by GET, nor fills or sends a form other than the solved widget's", async () => {
    const m = mock = await startMockCapSolver(answers)
    const subject = subjectWith(solvingWith(m))
    try {
      const page = await subject.fetch(`${base}/demo-native`, Date.now() + 40_000, undefined, undefined, { verify: { checks: [{ type: 'markdownMatches', pattern: 'passed successfully', flags: 'i' }] } }, undefined, undefined, { spend: createSpendLedger(1) })
      expect(solves(page.trace)).toEqual([expect.objectContaining({ type: 'turnstile', trigger: 'task_contract', outcome: 'not_injected', reason: 'script_did_not_take_submit' })])
      expect(page.evidence.finalUrl).toBe(`${base}/demo-native`)
      expect(JSON.stringify(page)).not.toContain(GOOD)
      // A handler that stops the event without cancelling it still sends nothing by GET.
      const stopped = await subject.fetch(`${base}/demo-native?stop`, Date.now() + 40_000, undefined, undefined, { verify: { checks: [{ type: 'markdownMatches', pattern: 'passed successfully', flags: 'i' }] } }, undefined, undefined, { spend: createSpendLedger(1) })
      expect(stopped.evidence.finalUrl).toBe(`${base}/demo-native?stop`)
      expect(JSON.stringify(stopped)).not.toContain(GOOD)
      // A contact form's invisible widget comes first on the page, with the same site key; the gating one after it, with a
      // callback, is solved, and only its callback gets the token: the contact form is never filled or sent.
      contactPosts = 0
      const two = await subject.fetch(`${base}/two-widgets`, Date.now() + 40_000, undefined, undefined, { verify: { checks: [{ type: 'markdownMatches', pattern: 'passed successfully', flags: 'i' }] } }, undefined, undefined, { spend: createSpendLedger(1) })
      expect(solves(two.trace)).toEqual([expect.objectContaining({ type: 'recaptcha_v2', outcome: 'cleared' })])
      expect(two.markdown).toContain('Captcha is passed successfully!')
      expect(contactPosts).toBe(0)
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
      const ua = MAC_151
      const events = await solveChallenges({
        page, solving: solvingWith(m, { egress }), userAgent: ua, pageEgress: '127.0.0.1:65001',
        gateNow: gate(page, () => cleared ? 200 : 403, (): Record<string, string> => cleared ? {} : { 'x-datadome-cid': 'abc' }), settle: () => page.waitForLoadState('domcontentloaded'),
        spend: createSpendLedger(1), paidCalls: undefined, log: undefined, rung: 'installed_chrome', onEvent: () => {}, url: 'https://shop.example/item', deadlineAt: Date.now() + 30_000, signal: undefined, reserveMs: 1_000,
      })
      expect(events).toEqual([expect.objectContaining({ type: 'datadome', outcome: 'cleared', egress: 'solver_proxy', chargedUsd: 0.003 })])
      expect(m.tasks).toEqual([{ type: 'DatadomeSliderTask', websiteURL: 'https://shop.example/item', captchaUrl: 'https://geo.captcha-delivery.com/captcha/?initialCid=abc&cid=def&t=fe&referer=x', userAgent: ua, proxy: 'http://user-us-1:exit-pass-9c1@203.0.113.9:80' }])
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
        page, solving: solvingWith(m, { egress: { endpoint: '127.0.0.1:65001', upstream: EXIT } }), userAgent: MAC_151, pageEgress: '127.0.0.1:65001',
        gateNow: gate(page, () => cleared ? 200 : 403, (): Record<string, string> => cleared ? {} : { 'cf-mitigated': 'challenge' }), settle: () => page.waitForLoadState('domcontentloaded'),
        spend: createSpendLedger(1), paidCalls: undefined, log: undefined, rung: 'installed_chrome', onEvent: () => {}, url: 'https://shop.example/item', deadlineAt: Date.now() + 30_000, signal: undefined, reserveMs: 1_000,
      })
      // CapSolver says it solved with another User-Agent than the browser's: the record says so.
      expect(events).toEqual([expect.objectContaining({ type: 'cloudflare_challenge', outcome: 'cleared', egress: 'solver_proxy', vendorUserAgent: 'other' })])
      expect(m.tasks).toEqual([{ type: 'AntiCloudflareTask', websiteURL: 'https://shop.example/item', userAgent: MAC_151, proxy: 'http://user-us-1:exit-pass-9c1@203.0.113.9:80' }])
    } finally { await page.close() }
  }, 60_000)

  /** A Cloudflare challenge page, read through the run's exit, the solve step's arguments but the solving and the browser's User-Agent. */
  async function challenged(m: MockCapSolver, over: Partial<CaptchaSolving>, userAgent: string): Promise<SolveTraceDetail[]> {
    const page = await routed(() => ({ status: 403, body: '<!doctype html><title>Just a moment...</title>', headers: { 'cf-mitigated': 'challenge' } }))
    try {
      await page.goto('https://shop.example/item')
      return await solveChallenges({
        page, solving: solvingWith(m, { egress: { endpoint: '127.0.0.1:65001', upstream: EXIT }, ...over }), userAgent, pageEgress: '127.0.0.1:65001',
        gateNow: gate(page, () => 403, () => ({ 'cf-mitigated': 'challenge' })), settle: () => page.waitForLoadState('domcontentloaded'),
        spend: createSpendLedger(1), paidCalls: undefined, log: undefined, rung: 'installed_chrome', onEvent: () => {}, url: 'https://shop.example/item', deadlineAt: Date.now() + 30_000, signal: undefined, reserveMs: 1_000,
      })
    } finally { await page.close() }
  }

  it('buys no exit-bound solve for a browser the vendor does not list: Chrome 156, a headless Chrome (smoke test 2026-10-25, C008)', async () => {
    const m = mock = await startMockCapSolver(answers)
    expect(await challenged(m, {}, MAC_156)).toEqual([expect.objectContaining({ type: 'cloudflare_challenge', outcome: 'unsupported', reason: 'browser_version_unsupported', browser: 'chrome/156 mac', chargedUsd: null })])
    expect(await challenged(m, {}, MAC_151.replace('Chrome/', 'HeadlessChrome/'))).toEqual([expect.objectContaining({ outcome: 'unsupported', reason: 'browser_not_supported', browser: 'headless_chrome/151 mac' })])
    expect(m.requests).toEqual([])
  }, 60_000)

  it("leaves an exit-bound solve to a later rung that carries it, spending none of the page's allowance (smoke test 2026-10-25, T045)", async () => {
    const m = mock = await startMockCapSolver(answers)
    const asked: string[] = []
    const later = (carries: boolean): Partial<CaptchaSolving> => ({ maxSolvesPerCall: 1, defersTo: { rung: 'installed_chrome', carries: async (type) => { asked.push(type); return carries } } })
    expect(await challenged(m, later(true), MAC_151)).toEqual([expect.objectContaining({ type: 'cloudflare_challenge', outcome: 'deferred', reason: 'later_rung_solves', deferredTo: 'installed_chrome', solve: null, chargedUsd: null })])
    expect(m.requests).toEqual([])
    // The later rung does not carry it (its Chrome is not on the vendor's list): this rung solves.
    expect(await challenged(m, later(false), MAC_151)).toEqual([expect.objectContaining({ outcome: 'still_gated', solve: 1, chargedUsd: 0.003 }), expect.objectContaining({ outcome: 'limit_reached' })])
    expect(asked).toEqual(['cloudflare_challenge', 'cloudflare_challenge'])
  }, 60_000)
})
