import { afterEach, describe, expect, it } from 'vitest'
import { createServer, request, type IncomingMessage, type Server } from 'node:http'
import net from 'node:net'
import { browserOf, classifyChallenge, parseSolvedCookie, TASK_CONTRACT_UNMET, type ChallengeProbe, type DetectedChallenge, type SolveVerdict } from '../src/vendors/captchaSolver.js'
import { CapSolver, capSolverHint, capSolverProxy } from '../src/vendors/capsolver.js'
import { startSolverForwarder } from '../src/solverEgress.js'
import { chromeMajorOf } from '../src/subjects/installedChrome.js'
import { startMockCapSolver, type MockBehaviour, type MockCapSolver } from './mockCapSolver.js'

const KEY = 'CAP-unit-key-7f3a'
const EXIT = { url: 'http://203.0.113.9:80', endpoint: '203.0.113.9:80', username: 'user-us-1', password: 'exit-pass-9c1' }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const probe = (over: Partial<ChallengeProbe> = {}): ChallengeProbe => ({ url: 'https://shop.example/item', iframes: [], turnstile: [], recaptcha: [], hcaptcha: false, perimeterX: false, geetest: false, responseFieldInGetForm: false, ...over })

describe('classifyChallenge: the challenge a page shows, from its DOM and the gate', () => {
  it('names each type a solver takes, with its parameters', () => {
    const dd = 'https://geo.captcha-delivery.com/captcha/?initialCid=abc&cid=def&t=fe&referer=x'
    expect(classifyChallenge(probe({ iframes: ['https://shop.example/ad', dd] }), { reason: 'captcha', signals: ['datadome_captcha'] })).toEqual({ type: 'datadome', websiteUrl: 'https://shop.example/item', captchaUrl: dd })
    expect(classifyChallenge(probe(), { reason: 'cloudflare_challenge', signals: ['header_cf_mitigated'] })).toEqual({ type: 'cloudflare_challenge', websiteUrl: 'https://shop.example/item' })
    expect(classifyChallenge(probe({ turnstile: [{ sitekey: '0x4AAA', action: 'login', cdata: null, callback: 'done', form: null }] }), { reason: 'captcha', signals: ['widget_turnstile'] }))
      .toEqual({ type: 'turnstile', websiteUrl: 'https://shop.example/item', websiteKey: '0x4AAA', action: 'login', cdata: null, callback: 'done' })
    expect(classifyChallenge(probe({ recaptcha: [{ sitekey: '6Lc', size: 'invisible', callback: null, form: 'post' }] }), { reason: 'captcha', signals: ['widget_recaptcha'] }))
      .toEqual({ type: 'recaptcha_v2', websiteUrl: 'https://shop.example/item', websiteKey: '6Lc', invisible: true, callback: null })
  })

  it('buys nothing for a DataDome exit already banned (t=bv), nor for what no adapter solves', () => {
    const banned = 'https://geo.captcha-delivery.com/captcha/?initialCid=abc&t=bv'
    expect(classifyChallenge(probe({ iframes: [banned] }), { reason: 'captcha', signals: ['datadome_captcha'] })).toEqual({ type: 'unsupported', kind: 'datadome', reason: 'datadome_exit_banned' })
    expect(classifyChallenge(probe({ perimeterX: true }), { reason: 'captcha', signals: ['px_captcha_script'] })).toMatchObject({ type: 'unsupported', kind: 'perimeterx' })
    expect(classifyChallenge(probe(), { reason: 'captcha', signals: ['header_x_kpsdk_ct', 'status_429'] })).toMatchObject({ type: 'unsupported', kind: 'kasada' })
    expect(classifyChallenge(probe({ hcaptcha: true }), { reason: 'captcha', signals: ['widget_hcaptcha'] })).toMatchObject({ type: 'unsupported', kind: 'hcaptcha' })
    expect(classifyChallenge(probe(), { reason: 'captcha', signals: ['amazon_validate_captcha_form'] })).toMatchObject({ type: 'unsupported', reason: 'no_challenge_parameters' })
  })

  it('buys no token for a widget whose form is sent by GET (the token would be in the URL on the record), or that has nowhere to send it', () => {
    const verdict = { reason: 'captcha' as const, signals: ['widget_turnstile'] }
    expect(classifyChallenge(probe({ turnstile: [{ sitekey: '0x4AAA', action: null, cdata: null, callback: 'done', form: 'get' }] }), verdict)).toEqual({ type: 'unsupported', kind: 'turnstile', reason: 'form_sent_by_get' })
    expect(classifyChallenge(probe({ recaptcha: [{ sitekey: '6Lc', size: null, callback: null, form: null }] }), verdict)).toEqual({ type: 'unsupported', kind: 'recaptcha_v2', reason: 'no_submit_target' })
    // A widget with a callback but its response field in another form sent by GET (Google's invisible reCAPTCHA example).
    expect(classifyChallenge(probe({ recaptcha: [{ sitekey: '6Lc', size: 'invisible', callback: 'go', form: null }], responseFieldInGetForm: true }), verdict)).toEqual({ type: 'unsupported', kind: 'recaptcha_v2', reason: 'form_sent_by_get' })
  })

  it("takes a widget in a form the page's own script sends (no method, no action), as the 2captcha demos are", () => {
    const verdict = { reason: 'captcha' as const, signals: ['widget_turnstile'] }
    expect(classifyChallenge(probe({ turnstile: [{ sitekey: '0x4AAA', action: null, cdata: null, callback: null, form: 'script' }] }), verdict)).toMatchObject({ type: 'turnstile', websiteKey: '0x4AAA' })
  })

  it('on a page that fails its task contract, takes only a visible widget that gates it, never a form that asks for more (smoke test 2026-10-25, C009)', () => {
    const unmet: SolveVerdict = { reason: TASK_CONTRACT_UNMET, signals: [] }
    const gating = { sitekey: '0x4AAA', action: null, cdata: null, callback: null, form: 'script' as const, visible: true, inputs: 0 }
    expect(classifyChallenge(probe({ turnstile: [gating] }), unmet)).toMatchObject({ type: 'turnstile', websiteKey: '0x4AAA' })
    expect(classifyChallenge(probe({ recaptcha: [{ sitekey: '6Lc', size: null, callback: 'go', form: null, visible: true, inputs: 0 }] }), unmet)).toMatchObject({ type: 'recaptcha_v2', invisible: false })
    // An invisible reCAPTCHA on a form, a contact form with fields of its own, a widget not shown: not what the task waits on.
    expect(classifyChallenge(probe({ recaptcha: [{ sitekey: '6Lc', size: 'invisible', callback: null, form: 'post', visible: true, inputs: 0 }] }), unmet)).toBeNull()
    expect(classifyChallenge(probe({ turnstile: [{ ...gating, form: 'post', inputs: 2 }] }), unmet)).toBeNull()
    expect(classifyChallenge(probe({ turnstile: [{ ...gating, visible: false }] }), unmet)).toBeNull()
    expect(classifyChallenge(probe({ turnstile: [{ ...gating, visible: undefined, inputs: undefined }] }), unmet)).toBeNull()
    // A vendor's check is the gate's to name, never the contract's.
    expect(classifyChallenge(probe({ iframes: ['https://geo.captcha-delivery.com/captcha/?t=fe&cid=1'] }), unmet)).toBeNull()
    expect(classifyChallenge(probe(), unmet)).toBeNull()
  })

  it('is nothing on a page the gate passed, or stopped for another reason', () => {
    expect(classifyChallenge(probe({ recaptcha: [{ sitekey: '6Lc', size: null, callback: null, form: 'post' }] }), null)).toBeNull()
    expect(classifyChallenge(probe(), { reason: 'login_wall', signals: ['status_401'] })).toBeNull()
    expect(classifyChallenge(probe(), { reason: 'rate_limit', signals: ['status_429'] })).toBeNull()
  })
})

describe('parseSolvedCookie', () => {
  it("reads DataDome's Set-Cookie line, an empty Domain left to the page's host", () => {
    const cookie = parseSolvedCookie('datadome=yzj_BKabc~S0; Max-Age=31536000; Domain=; Path=/; Secure; SameSite=Lax')
    expect(cookie).toMatchObject({ name: 'datadome', secret: 'yzj_BKabc~S0', domain: null, path: '/', secure: true, sameSite: 'Lax' })
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000)
    expect(parseSolvedCookie('datadome=v; Domain=.shop.example')).toMatchObject({ domain: '.shop.example' })
    expect(parseSolvedCookie('')).toBeNull()
    expect(parseSolvedCookie('=v')).toBeNull()
  })
})

describe('the browser a solve is bought for, against the vendor\'s list (smoke test 2026-10-25, C008 and T045)', () => {
  const mac = (major: number) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  const windows = (major: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  const capsolver = new CapSolver({ apiKey: KEY })

  it('reads the family, major and platform off a User-Agent', () => {
    expect(browserOf(mac(156))).toEqual({ family: 'chrome', major: 156, platform: 'mac' })
    expect(browserOf(windows(141))).toEqual({ family: 'chrome', major: 141, platform: 'windows' })
    expect(browserOf(mac(151).replace('Chrome/', 'HeadlessChrome/'))).toEqual({ family: 'headless_chrome', major: 151, platform: 'mac' })
    expect(browserOf('Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0')).toEqual({ family: 'other', major: null, platform: 'linux' })
  })

  it("takes DataDome and Cloudflare's challenge only for a Chrome its guides list (Mac 150-155, Windows 140-155), tokens for any browser", () => {
    for (const type of ['datadome', 'cloudflare_challenge'] as const) {
      expect(capsolver.browserSupport(type, browserOf(mac(151)))).toBeNull()
      expect(capsolver.browserSupport(type, browserOf(windows(141)))).toBeNull()
      expect(capsolver.browserSupport(type, browserOf(mac(156)))).toBe('browser_version_unsupported')
      expect(capsolver.browserSupport(type, browserOf(mac(141)))).toBe('browser_version_unsupported')
      expect(capsolver.browserSupport(type, browserOf(mac(151).replace('Chrome/', 'HeadlessChrome/')))).toBe('browser_not_supported')
      expect(capsolver.browserSupport(type, browserOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'))).toBe('browser_not_supported')
    }
    expect(capsolver.browserSupport('turnstile', browserOf(mac(156)))).toBeNull()
    expect(capsolver.browserSupport('recaptcha_v2', browserOf('HeadlessChrome/151'))).toBeNull()
  })

  it("reads the installed Chrome's major from its --version line", () => {
    expect(chromeMajorOf('Google Chrome 156.0.8078.47\n')).toBe(156)
    expect(chromeMajorOf('Google Chrome for Testing 151.0.7922.34 ')).toBe(151)
    expect(chromeMajorOf('')).toBeNull()
  })
})

describe('CapSolver: createTask, then getTaskResult until ready (docs.capsolver.com, read 2026-10-25)', () => {
  let mock: MockCapSolver | null = null
  afterEach(async () => { await mock?.close(); mock = null })
  const solver = (url: string) => new CapSolver({ apiKey: KEY, baseUrl: url, pollMs: 20 })
  const soon = () => Date.now() + 10_000
  const start = async (behave: (task: Record<string, unknown>) => MockBehaviour) => (mock = await startMockCapSolver(behave))

  const challenges: [DetectedChallenge, Record<string, unknown>, Record<string, unknown>, 'token' | 'cookies'][] = [
    [{ type: 'datadome', websiteUrl: 'https://shop.example/item', captchaUrl: 'https://geo.captcha-delivery.com/captcha/?t=fe&cid=1' },
      { type: 'DatadomeSliderTask', websiteURL: 'https://shop.example/item', captchaUrl: 'https://geo.captcha-delivery.com/captcha/?t=fe&cid=1', userAgent: UA, proxy: 'http://user-us-1:exit-pass-9c1@203.0.113.9:80' },
      { cookie: 'datadome=dd-secret-1; Max-Age=60; Domain=; Path=/; Secure; SameSite=Lax' }, 'cookies'],
    [{ type: 'cloudflare_challenge', websiteUrl: 'https://shop.example/item' },
      { type: 'AntiCloudflareTask', websiteURL: 'https://shop.example/item', userAgent: UA, proxy: 'http://user-us-1:exit-pass-9c1@203.0.113.9:80' },
      { cookies: { cf_clearance: 'cf-secret-1' }, token: 'cf-secret-1', userAgent: UA }, 'cookies'],
    [{ type: 'turnstile', websiteUrl: 'https://shop.example/item', websiteKey: '0x4AAA', action: 'login', cdata: 'c1', callback: null },
      { type: 'AntiTurnstileTaskProxyLess', websiteURL: 'https://shop.example/item', websiteKey: '0x4AAA', metadata: { action: 'login', cdata: 'c1' } },
      { token: 'ts-secret-1', type: 'turnstile', userAgent: UA }, 'token'],
    [{ type: 'recaptcha_v2', websiteUrl: 'https://shop.example/item', websiteKey: '6Lc', invisible: false, callback: null },
      { type: 'ReCaptchaV2TaskProxyLess', websiteURL: 'https://shop.example/item', websiteKey: '6Lc', isInvisible: false },
      { gRecaptchaResponse: 'rc-secret-1', userAgent: UA }, 'token'],
  ]

  it.each(challenges)('solves %o with the task its guide names, the exit only where the answer is bound to it', async (challenge, task, solution, kind) => {
    const m = await start(() => ({ solution, polls: 2 }))
    const bound = challenge.type === 'datadome' || challenge.type === 'cloudflare_challenge'
    const answer = await solver(m.url).solve({ challenge, userAgent: UA, proxy: bound ? EXIT : null, deadlineAt: soon() })
    expect(m.tasks).toEqual([task])
    expect(m.requests[0]!.body.clientKey).toBe(KEY)
    expect(m.requests.filter((r) => r.path === '/getTaskResult')).toHaveLength(3)
    expect(answer).toMatchObject({ ok: true, solution: { kind }, reportedCostUsd: null })
    // A proxyless task is never sent the exit, whatever the caller passed.
    if (!bound) {
      const again = await start(() => ({ solution, readyAtCreate: true }))
      await solver(again.url).solve({ challenge, userAgent: UA, proxy: EXIT, deadlineAt: soon() })
      expect(JSON.stringify(again.requests)).not.toContain('exit-pass-9c1')
    }
  })

  it('takes an answer given at creation, without polling', async () => {
    const m = await start(() => ({ solution: { token: 'ts-now' }, readyAtCreate: true }))
    const answer = await solver(m.url).solve({ challenge: challenges[2]![0], userAgent: UA, proxy: null, deadlineAt: soon() })
    expect(answer).toMatchObject({ ok: true, solution: { kind: 'token', secret: 'ts-now' } })
    expect(m.requests.map((r) => r.path)).toEqual(['/createTask'])
  })

  it('says why it failed by code only, whether a task was created, and whether CapSolver bills it (no charge for a task it failed)', async () => {
    const dd = challenges[0]![0]
    let m = await start(() => ({ createError: 'ERROR_ZERO_BALANCE' }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toMatchObject({ ok: false, error: 'zero_balance', code: 'ERROR_ZERO_BALANCE', taskCreated: false, billed: false })
    await m.close()
    // A task CapSolver itself reports failed is not billed (its docs: "no charge for failed attempts"; ERROR_CAPTCHA_UNSOLVABLE
    // "No deduction"), as the smoke test's balance showed for T045's ERROR_CAPTCHA_SOLVE_FAILED.
    m = await start(() => ({ pollError: 'ERROR_CAPTCHA_UNSOLVABLE' }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toMatchObject({ ok: false, error: 'unsolvable', code: 'ERROR_CAPTCHA_UNSOLVABLE', taskCreated: true, billed: false })
    await m.close()
    m = await start(() => ({ pollError: 'ERROR_CAPTCHA_SOLVE_FAILED', description: 'Failed to solve the captcha: 1013' }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toEqual({ ok: false, error: 'rejected', code: 'ERROR_CAPTCHA_SOLVE_FAILED', taskCreated: true, billed: false, hint: '1013' })
    await m.close()
    // A poll refused for another reason (a rate limit, a blocked key, the proxy) says nothing of the task's bill.
    for (const code of ['ERROR_PROXY_BANNED', 'ERROR_RATE_LIMIT', 'ERROR_KEY_TEMP_BLOCKED']) {
      m = await start(() => ({ pollError: code }))
      expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toMatchObject({ ok: false, code, taskCreated: true, billed: null })
      await m.close()
    }
    // createTask's answer lost (garbled here): a task may have been made, and may bill.
    m = await start(() => ({ createGarbled: true }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toMatchObject({ ok: false, error: 'transport', taskCreated: true, billed: null })
    await m.close()
    // A solution without its cookie is no answer; the task was made and answered "ready", so billed.
    m = await start(() => ({ solution: { cookie: '' } }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toEqual({ ok: false, error: 'rejected', code: 'NO_SOLUTION', taskCreated: true, billed: true, hint: null })
  })

  it('keeps of the free-text description only a fixed vocabulary and numeric codes, never what it echoes', () => {
    expect(capSolverHint('Failed to solve the captcha: 1013')).toBe('1013')
    expect(capSolverHint('userAgent does not match or your proxy IP has been blocked')).toBe('user_agent+proxy+ip+blocked')
    expect(capSolverHint(`proxy 203.0.113.9:8080:user-us-1:exit-pass-9c1 refused, key ${KEY}`)).toBe('proxy')
    // The refusals the 2026-10-26 probe and the proxyless test met, which said nothing in the vocabulary before.
    expect(capSolverHint('custom proxy connect failed.')).toBe('proxy+connect_failed')
    expect(capSolverHint('invalid websiteKey (3x00000000000000000000FF)')).toBe('website_key+invalid')
    expect(capSolverHint('the sitekey is not supported')).toBe('website_key+not_supported')
    expect(capSolverHint('')).toBeNull()
    expect(capSolverHint(undefined)).toBeNull()
  })

  it('gives up at its deadline, and when the caller aborts', async () => {
    const m = await start(() => ({ never: true }))
    const started = Date.now()
    expect(await solver(m.url).solve({ challenge: challenges[3]![0], userAgent: UA, proxy: null, deadlineAt: Date.now() + 300 })).toEqual({ ok: false, error: 'timeout', code: null, taskCreated: true, billed: null, hint: null })
    expect(Date.now() - started).toBeLessThan(3_000)
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    expect(await solver(m.url).solve({ challenge: challenges[3]![0], userAgent: UA, proxy: null, deadlineAt: soon(), signal: controller.signal })).toMatchObject({ ok: false, error: 'aborted', taskCreated: true })
  })

  it('creates no task for an exit-bound challenge without an exit, nor a type it does not solve', async () => {
    const m = await start(() => ({ solution: { cookie: 'datadome=x' } }))
    expect(await solver(m.url).solve({ challenge: challenges[0]![0], userAgent: UA, proxy: null, deadlineAt: soon() })).toMatchObject({ ok: false, taskCreated: false })
    expect(await solver(m.url).solve({ challenge: { type: 'hcaptcha' } as unknown as DetectedChallenge, userAgent: UA, proxy: null, deadlineAt: soon() })).toEqual({ ok: false, error: 'unsupported', code: null, taskCreated: false, billed: false, hint: null })
    expect(m.requests).toEqual([])
  })

  it('keeps no secret in what it returns: the vendor\'s free-text description, which echoes the request, never leaves', async () => {
    const m = await start(() => ({ createError: 'ERROR_INVALID_TASK_DATA' }))
    const answer = await solver(m.url).solve({ challenge: challenges[0]![0], userAgent: UA, proxy: EXIT, deadlineAt: soon() })
    // The stand-in's description echoes the whole request: only the words it shares with the vocabulary are kept.
    expect(answer).toEqual({ ok: false, error: 'rejected', code: 'ERROR_INVALID_TASK_DATA', taskCreated: false, billed: false, hint: 'user_agent+proxy' })
    expect(JSON.stringify(answer)).not.toMatch(/exit-pass-9c1|CAP-unit-key/)
  })

  it('sends the exit as a URL with its scheme and login (CapSolver refused the colon form for the Webshare exit, 2026-10-26)', () => {
    expect(capSolverProxy(EXIT)).toBe('http://user-us-1:exit-pass-9c1@203.0.113.9:80')
    // The host as the operator named it (the browser's forwarder dials the same one), and its default port when unnamed.
    expect(capSolverProxy({ url: 'http://p.proxy.test', endpoint: 'p.proxy.test:80', username: 'user-us-1', password: 'exit-pass-9c1' })).toBe('http://user-us-1:exit-pass-9c1@p.proxy.test:80')
    expect(capSolverProxy({ url: 'socks5://198.51.100.2:1080', endpoint: '198.51.100.2:1080', username: 'u', password: 'p' })).toBe('socks5://u:p@198.51.100.2:1080')
    // A login with URL delimiters is percent-encoded, so CapSolver cannot read part of it as the host.
    expect(capSolverProxy({ ...EXIT, username: 'user:us@1', password: 'p/a#s s%' })).toBe('http://user%3Aus%401:p%2Fa%23s%20s%25@203.0.113.9:80')
    expect(capSolverProxy({ url: 'http://198.51.100.2:3128', endpoint: '198.51.100.2:3128' })).toBe('http://198.51.100.2:3128')
  })

  it('refuses to start without a key', () => {
    expect(() => new CapSolver({ apiKey: ' ' })).toThrow(/CAPSOLVER_API_KEY/)
  })
})

describe('startSolverForwarder: the run\'s solver exit, its login added on the way out', () => {
  let upstream: Server | null = null
  afterEach(async () => { await new Promise((resolve) => upstream === null ? resolve(null) : upstream.close(resolve)); upstream = null })

  it('tunnels CONNECT and forwards plain HTTP to the upstream with its login, which the client never sends', async () => {
    const seen: { method: string; url: string; auth: string | undefined }[] = []
    upstream = createServer((req: IncomingMessage, res) => { seen.push({ method: req.method!, url: req.url!, auth: req.headers['proxy-authorization'] }); res.end('plain ok') })
    upstream.on('connect', (req: IncomingMessage, socket: net.Socket) => {
      seen.push({ method: 'CONNECT', url: req.url!, auth: req.headers['proxy-authorization'] })
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      socket.end('tunnelled')
    })
    await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve))
    const port = (upstream.address() as net.AddressInfo).port
    const forwarder = await startSolverForwarder({ url: `http://127.0.0.1:${port}`, endpoint: `127.0.0.1:${port}`, username: 'user-us-1', password: 'exit-pass-9c1' })
    try {
      expect(forwarder.server.url).toBe(`http://${forwarder.egress.endpoint}`)
      expect(forwarder.server).not.toHaveProperty('password')
      const [host, localPort] = forwarder.egress.endpoint.split(':')
      const tunnelled = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(Number(localPort), host!, () => socket.write('CONNECT shop.example:443 HTTP/1.1\r\nHost: shop.example:443\r\n\r\n'))
        let data = ''
        socket.on('data', (chunk) => { data += chunk })
        socket.on('end', () => resolve(data))
        socket.on('error', reject)
      })
      expect(tunnelled).toContain('200 Connection Established')
      expect(tunnelled).toContain('tunnelled')
      const plain = await new Promise<string>((resolve, reject) => {
        request({ host, port: Number(localPort), path: 'http://shop.example/p', method: 'GET' }, (res) => { let body = ''; res.on('data', (c) => { body += c }); res.on('end', () => resolve(body)) }).on('error', reject).end()
      })
      expect(plain).toBe('plain ok')
      // A request that is not a proxy request (what a page's script on loopback would send) is never passed on with the login.
      const local = await new Promise<number>((resolve, reject) => { request({ host, port: Number(localPort), path: '/x', method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode ?? 0) }).on('error', reject).end() })
      expect(local).toBe(400)
      const login = `Basic ${Buffer.from('user-us-1:exit-pass-9c1').toString('base64')}`
      expect(seen).toEqual([{ method: 'CONNECT', url: 'shop.example:443', auth: login }, { method: 'GET', url: 'http://shop.example/p', auth: login }])
    } finally { await forwarder.close() }
  })

  it('takes only an http:// upstream', async () => {
    await expect(startSolverForwarder({ url: 'https://203.0.113.9:443', endpoint: '203.0.113.9:443' })).rejects.toThrow(/http:\/\//)
  })
})
