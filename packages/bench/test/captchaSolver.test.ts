import { afterEach, describe, expect, it } from 'vitest'
import { createServer, request, type IncomingMessage, type Server } from 'node:http'
import net from 'node:net'
import { classifyChallenge, parseSolvedCookie, type ChallengeProbe, type DetectedChallenge } from '../src/vendors/captchaSolver.js'
import { CapSolver, capSolverProxy } from '../src/vendors/capsolver.js'
import { startSolverForwarder } from '../src/solverEgress.js'
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

describe('CapSolver: createTask, then getTaskResult until ready (docs.capsolver.com, read 2026-10-25)', () => {
  let mock: MockCapSolver | null = null
  afterEach(async () => { await mock?.close(); mock = null })
  const solver = (url: string) => new CapSolver({ apiKey: KEY, baseUrl: url, pollMs: 20 })
  const soon = () => Date.now() + 10_000
  const start = async (behave: (task: Record<string, unknown>) => MockBehaviour) => (mock = await startMockCapSolver(behave))

  const challenges: [DetectedChallenge, Record<string, unknown>, Record<string, unknown>, 'token' | 'cookies'][] = [
    [{ type: 'datadome', websiteUrl: 'https://shop.example/item', captchaUrl: 'https://geo.captcha-delivery.com/captcha/?t=fe&cid=1' },
      { type: 'DatadomeSliderTask', websiteURL: 'https://shop.example/item', captchaUrl: 'https://geo.captcha-delivery.com/captcha/?t=fe&cid=1', userAgent: UA, proxy: '203.0.113.9:80:user-us-1:exit-pass-9c1' },
      { cookie: 'datadome=dd-secret-1; Max-Age=60; Domain=; Path=/; Secure; SameSite=Lax' }, 'cookies'],
    [{ type: 'cloudflare_challenge', websiteUrl: 'https://shop.example/item' },
      { type: 'AntiCloudflareTask', websiteURL: 'https://shop.example/item', userAgent: UA, proxy: '203.0.113.9:80:user-us-1:exit-pass-9c1' },
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

  it('says why it failed by code only, and whether a task was created (so may be billed)', async () => {
    const dd = challenges[0]![0]
    let m = await start(() => ({ createError: 'ERROR_ZERO_BALANCE' }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toEqual({ ok: false, error: 'zero_balance', code: 'ERROR_ZERO_BALANCE', taskCreated: false })
    await m.close()
    m = await start(() => ({ pollError: 'ERROR_CAPTCHA_UNSOLVABLE' }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toEqual({ ok: false, error: 'unsolvable', code: 'ERROR_CAPTCHA_UNSOLVABLE', taskCreated: true })
    await m.close()
    m = await start(() => ({ pollError: 'ERROR_PROXY_BANNED' }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toMatchObject({ ok: false, error: 'proxy_banned', taskCreated: true })
    await m.close()
    // createTask's answer lost (garbled here): a task may have been made, and may bill.
    m = await start(() => ({ createGarbled: true }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toMatchObject({ ok: false, error: 'transport', taskCreated: true })
    await m.close()
    // A solution without its cookie is no answer; the task was still made.
    m = await start(() => ({ solution: { cookie: '' } }))
    expect(await solver(m.url).solve({ challenge: dd, userAgent: UA, proxy: EXIT, deadlineAt: soon() })).toEqual({ ok: false, error: 'rejected', code: 'NO_SOLUTION', taskCreated: true })
  })

  it('gives up at its deadline, and when the caller aborts', async () => {
    const m = await start(() => ({ never: true }))
    const started = Date.now()
    expect(await solver(m.url).solve({ challenge: challenges[3]![0], userAgent: UA, proxy: null, deadlineAt: Date.now() + 300 })).toEqual({ ok: false, error: 'timeout', code: null, taskCreated: true })
    expect(Date.now() - started).toBeLessThan(3_000)
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    expect(await solver(m.url).solve({ challenge: challenges[3]![0], userAgent: UA, proxy: null, deadlineAt: soon(), signal: controller.signal })).toMatchObject({ ok: false, error: 'aborted', taskCreated: true })
  })

  it('creates no task for an exit-bound challenge without an exit, nor a type it does not solve', async () => {
    const m = await start(() => ({ solution: { cookie: 'datadome=x' } }))
    expect(await solver(m.url).solve({ challenge: challenges[0]![0], userAgent: UA, proxy: null, deadlineAt: soon() })).toMatchObject({ ok: false, taskCreated: false })
    expect(await solver(m.url).solve({ challenge: { type: 'hcaptcha' } as unknown as DetectedChallenge, userAgent: UA, proxy: null, deadlineAt: soon() })).toEqual({ ok: false, error: 'unsupported', code: null, taskCreated: false })
    expect(m.requests).toEqual([])
  })

  it('keeps no secret in what it returns: the vendor\'s free-text description, which echoes the request, never leaves', async () => {
    const m = await start(() => ({ createError: 'ERROR_INVALID_TASK_DATA' }))
    const answer = await solver(m.url).solve({ challenge: challenges[0]![0], userAgent: UA, proxy: EXIT, deadlineAt: soon() })
    expect(answer).toEqual({ ok: false, error: 'rejected', code: 'ERROR_INVALID_TASK_DATA', taskCreated: false })
    expect(JSON.stringify(answer)).not.toMatch(/exit-pass-9c1|CAP-unit-key/)
    expect(capSolverProxy({ url: 'http://198.51.100.2:3128', endpoint: '198.51.100.2:3128' })).toBe('198.51.100.2:3128')
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
