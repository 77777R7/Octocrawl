/**
 * CapSolver (https://docs.capsolver.com/en/guide/api-createtask/), the solver Howard chose on 2026-10-25 for ADR 0005's
 * `third_party_captcha_solver`. createTask, then getTaskResult every few seconds until the task is ready or fails.
 *
 * Task types and fields, from CapSolver's guides as read on 2026-10-25:
 * - DataDome (captcha/datadome): `DatadomeSliderTask` with `captchaUrl` (its `t=fe` form), `userAgent` (the browser's)
 *   and `proxy` (required: the cookie is only accepted from that exit); the answer is `solution.cookie`, a Set-Cookie line.
 * - Cloudflare's challenge (captcha/cloudflare_challenge): `AntiCloudflareTask` with `websiteURL`, `proxy` (static or
 *   sticky) and `userAgent`; the answer is `solution.cookies` (cf_clearance) and the `userAgent` it was solved with.
 * - Turnstile (captcha/cloudflare_turnstile): `AntiTurnstileTaskProxyLess` with `websiteURL`, `websiteKey` and
 *   `metadata.action` / `metadata.cdata`; the answer is `solution.token`.
 * - reCAPTCHA v2 (captcha/ReCaptchaV2): `ReCaptchaV2TaskProxyLess` with `websiteURL`, `websiteKey`, `isInvisible`; the
 *   answer is `solution.gRecaptchaResponse`.
 *
 * CapSolver states no price on a task (its answers carry none), so a solve is charged at the grant tariff's per-solve
 * price (`reportedCostUsd: null`). A task CapSolver itself reports failed is not billed: "no charge for failed attempts"
 * (docs.capsolver.com/en/guide/ai/capsolver-for-ai-agents/, read 2026-10-26), and ERROR_CAPTCHA_UNSOLVABLE is "No
 * deduction" (its api-error guide); the 2026-10-25 smoke test's balance agreed (T045's ERROR_CAPTCHA_SOLVE_FAILED was not
 * billed, C008's solved cf_clearance was, $0.0012). Its errors are kept by code, and its `errorDescription`, free text
 * that may repeat what was sent, only as a fixed vocabulary and numeric codes (capSolverHint). The key and the proxy
 * login go only into the request body to CapSolver.
 *
 * Browsers (browserSupport): the DataDome guide lists the User-Agents it solves for, Windows Chrome 140-155 and Mac
 * Chrome 150-155 (read 2026-10-26), and asks for them by name. The AntiCloudflareTask guide says only that it takes
 * "Chrome's userAgent"; it is held to the same Chrome list, which the smoke test is consistent with (Chrome 156: solved,
 * the page still challenged) but which that guide does not state.
 */

import type { ProxyServer } from '@w2l/contracts'
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici'
import { parseSolvedCookie, type BrowserOf, type CaptchaSolver, type SolvableChallenge, type SolveAnswer, type SolveError, type SolveRequest, type SolvedCookie } from './captchaSolver.js'

export const CAPSOLVER_API = 'https://api.capsolver.com'

/** The types this adapter solves, and whether each needs the browser's exit. */
const TYPES: Readonly<Record<SolvableChallenge, { task: string; proxy: boolean }>> = {
  datadome: { task: 'DatadomeSliderTask', proxy: true },
  cloudflare_challenge: { task: 'AntiCloudflareTask', proxy: true },
  turnstile: { task: 'AntiTurnstileTaskProxyLess', proxy: false },
  recaptcha_v2: { task: 'ReCaptchaV2TaskProxyLess', proxy: false },
}

/** The Chrome majors CapSolver's guides list, by platform, for the answers bound to the browser (read 2026-10-26). */
const CHROME_LISTED: Readonly<Partial<Record<SolvableChallenge, Readonly<Partial<Record<BrowserOf['platform'], readonly [number, number]>>>>>> = {
  datadome: { windows: [140, 155], mac: [150, 155] },
  cloudflare_challenge: { windows: [140, 155], mac: [150, 155] },
}

/** The words of CapSolver's error descriptions a record may keep, in this order (capSolverHint). */
const HINT_WORDS: readonly [string, RegExp][] = [
  ['user_agent', /user.?agent/i], ['proxy', /proxy/i], ['ip', /\bip\b/i], ['banned', /\bbann?ed\b/i], ['blocked', /\bblock(?:ed)?\b/i],
  ['html', /\bhtml\b/i], ['timeout', /time.?out|timed out/i], ['cookie', /cookie/i],
]

/**
 * What an `errorDescription` says, as fixed words and its numeric codes (DataDome's "Failed to solve the captcha: 1013"),
 * joined with `+`; null when it says none of them. Never its text: it may repeat the key or the exit's login.
 */
export function capSolverHint(description: unknown): string | null {
  if (typeof description !== 'string' || description === '') return null
  const words = HINT_WORDS.filter(([, pattern]) => pattern.test(description)).map(([word]) => word)
  // A number that is not part of an address, a port or a login (no digit, dot, colon, letter or hyphen beside it).
  const codes = [...description.matchAll(/(?<![\w.:-])\d{3,5}(?![\w.:-])/g)].map((m) => m[0]).slice(0, 3)
  const hint = [...words, ...codes].join('+')
  return hint === '' ? null : hint
}

/**
 * The codes by which CapSolver fails the task itself, which it does not bill: ERROR_CAPTCHA_UNSOLVABLE ("No deduction"),
 * ERROR_CAPTCHA_SOLVE_FAILED (not billed in the 2026-10-25 smoke test), ERROR_TASK_TIMEOUT (its own 120 s). Any other
 * refusal of a poll (a rate limit, a busy service, a blocked key) refuses the poll, not the task: its bill is unknown.
 */
const UNBILLED_TASK_FAILURES: ReadonlySet<string> = new Set(['ERROR_CAPTCHA_UNSOLVABLE', 'ERROR_CAPTCHA_SOLVE_FAILED', 'ERROR_TASK_TIMEOUT'])

/** CapSolver's error codes (api-error guide), as the words a record uses. Any other code is `rejected`. */
const ERRORS: Readonly<Record<string, SolveError>> = {
  ERROR_KEY_DENIED_ACCESS: 'key_denied',
  ERROR_ZERO_BALANCE: 'zero_balance',
  ERROR_CAPTCHA_UNSOLVABLE: 'unsolvable',
  ERROR_TASK_TIMEOUT: 'timeout',
  ERROR_PROXY_BANNED: 'proxy_banned',
  ERROR_TASK_NOT_SUPPORTED: 'unsupported',
}

export interface CapSolverOptions {
  apiKey: string
  /** Test seam: a loopback stand-in for api.capsolver.com. */
  baseUrl?: string
  /** How long between getTaskResult calls; CapSolver asks for 3 s. */
  pollMs?: number
  /** The fetch the API calls go out with (the operator's proxy, a test's). */
  fetchImpl?: typeof fetch
}

/** `host:port:user:pass`, the proxy form CapSolver's guides show; an exit without a login is `host:port`. */
export function capSolverProxy(proxy: ProxyServer): string {
  const { hostname, port, protocol } = new URL(proxy.url)
  const where = `${hostname}:${port || (protocol === 'https:' ? '443' : '80')}`
  return proxy.username === undefined ? where : `${where}:${proxy.username}:${proxy.password ?? ''}`
}

/** A plain error code, or null: anything else (free text) is not kept. */
function plainCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : null
}

export class CapSolver implements CaptchaSolver {
  readonly vendor = 'capsolver'
  private readonly baseUrl: string
  private readonly pollMs: number
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: CapSolverOptions) {
    if (options.apiKey.trim() === '') throw new Error('CapSolver needs an API key (CAPSOLVER_API_KEY)')
    this.baseUrl = (options.baseUrl ?? CAPSOLVER_API).replace(/\/+$/, '')
    this.pollMs = options.pollMs ?? 3_000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  supports(type: SolvableChallenge): boolean { return type in TYPES }
  needsProxy(type: SolvableChallenge): boolean { return TYPES[type].proxy }

  /** A browser-bound answer only for a Chrome on its guides' list; a token for any browser (proxyless, not bound to it). */
  browserSupport(type: SolvableChallenge, browser: BrowserOf): string | null {
    const listed = CHROME_LISTED[type]
    if (listed === undefined) return null
    const range = listed[browser.platform]
    if (browser.family !== 'chrome' || range === undefined) return 'browser_not_supported'
    return browser.major !== null && browser.major >= range[0] && browser.major <= range[1] ? null : 'browser_version_unsupported'
  }

  /** The task body for a challenge; the proxy only for the types bound to an exit. */
  task(request: SolveRequest): Record<string, unknown> {
    const { challenge } = request
    const kind = TYPES[challenge.type]
    const proxy = kind.proxy ? request.proxy : null
    if (kind.proxy && proxy === null) throw new Error(`${challenge.type} needs the browser's exit`)
    switch (challenge.type) {
      case 'datadome':
        return { type: kind.task, websiteURL: challenge.websiteUrl, captchaUrl: challenge.captchaUrl, userAgent: request.userAgent, proxy: capSolverProxy(proxy!) }
      case 'cloudflare_challenge':
        return { type: kind.task, websiteURL: challenge.websiteUrl, userAgent: request.userAgent, proxy: capSolverProxy(proxy!) }
      case 'turnstile': {
        const metadata = { ...(challenge.action === null ? {} : { action: challenge.action }), ...(challenge.cdata === null ? {} : { cdata: challenge.cdata }) }
        return { type: kind.task, websiteURL: challenge.websiteUrl, websiteKey: challenge.websiteKey, ...(Object.keys(metadata).length === 0 ? {} : { metadata }) }
      }
      case 'recaptcha_v2':
        return { type: kind.task, websiteURL: challenge.websiteUrl, websiteKey: challenge.websiteKey, isInvisible: challenge.invisible }
    }
  }

  async solve(request: SolveRequest): Promise<SolveAnswer> {
    const refused = (error: SolveError, code: string | null): SolveAnswer => ({ ok: false, error, code, taskCreated: false, billed: false, hint: null })
    if (!this.supports(request.challenge.type)) return refused('unsupported', null)
    let task: Record<string, unknown>
    try { task = this.task(request) } catch { return refused('rejected', 'NO_EXIT') }
    const created = await this.call('createTask', { clientKey: this.options.apiKey, task }, request)
    // Only CapSolver's own refusal says no task was made: a request whose answer was lost may have made one, which may bill.
    if ('failed' in created) return created.refused ? { ...created.failed, taskCreated: false, billed: false } : { ...created.failed, taskCreated: true, billed: null }
    const taskId = typeof created.body.taskId === 'string' && created.body.taskId !== '' ? created.body.taskId : null
    if (created.body.status === 'ready' && created.body.solution !== undefined) return this.answer(request, created.body.solution)
    // An answer with neither a task nor a solution: whether a task was made is not known, so it may bill.
    if (taskId === null) return { ok: false, error: 'rejected', code: null, taskCreated: true, billed: null, hint: null }
    const unknown = (error: SolveError): SolveAnswer => ({ ok: false, error, code: null, taskCreated: true, billed: null, hint: null })
    for (;;) {
      if (Date.now() + this.pollMs > request.deadlineAt) return unknown('timeout')
      try { await sleep(this.pollMs, request.signal) } catch { return unknown('aborted') }
      const polled = await this.call('getTaskResult', { clientKey: this.options.apiKey, taskId }, request)
      // CapSolver's own failure of the task bills nothing; any other refused or lost poll leaves the bill unknown.
      if ('failed' in polled) return { ...polled.failed, taskCreated: true, billed: polled.refused && polled.failed.code !== null && UNBILLED_TASK_FAILURES.has(polled.failed.code) ? false : null }
      if (polled.body.status === 'ready') return this.answer(request, polled.body.solution)
      if (polled.body.status === 'failed') return { ok: false, error: 'unsolvable', code: null, taskCreated: true, billed: false, hint: null }
    }
  }

  /** One API call: the body when errorId is 0, else the failure by its code. Never throws with what was sent. */
  private async call(path: 'createTask' | 'getTaskResult', body: Record<string, unknown>, request: SolveRequest): Promise<{ body: Record<string, unknown> } | { failed: { ok: false; error: SolveError; code: string | null; hint: string | null }; refused: boolean }> {
    let response: Response
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(Math.max(1_000, Math.min(30_000, request.deadlineAt - Date.now()))), ...(request.signal === undefined ? [] : [request.signal])])
      response = await this.fetchImpl(`${this.baseUrl}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
    } catch {
      return { failed: { ok: false, error: request.signal?.aborted === true ? 'aborted' : 'transport', code: null, hint: null }, refused: false }
    }
    let parsed: unknown
    try { parsed = await response.json() } catch { return { failed: { ok: false, error: 'transport', code: `HTTP_${response.status}`, hint: null }, refused: false } }
    if (typeof parsed !== 'object' || parsed === null) return { failed: { ok: false, error: 'transport', code: `HTTP_${response.status}`, hint: null }, refused: false }
    const answer = parsed as Record<string, unknown>
    if (answer.errorId !== 0 && answer.errorId !== undefined) {
      const code = plainCode(answer.errorCode)
      // A server error's answer is not CapSolver's word on the request: whether a task was made is not known.
      return { failed: { ok: false, error: (code === null ? undefined : ERRORS[code]) ?? 'rejected', code, hint: capSolverHint(answer.errorDescription) }, refused: response.status < 500 }
    }
    if (!response.ok) return { failed: { ok: false, error: 'transport', code: `HTTP_${response.status}`, hint: null }, refused: false }
    return { body: answer }
  }

  /** The solution as this adapter injects it; a solution missing its token or cookie is `rejected`, the task still billed. */
  private answer(request: SolveRequest, solution: unknown): SolveAnswer {
    const s = typeof solution === 'object' && solution !== null ? solution as Record<string, unknown> : {}
    const userAgent = typeof s.userAgent === 'string' && s.userAgent !== '' ? s.userAgent : null
    // CapSolver answered `ready`: the task is billed, whatever its solution holds.
    const failed: SolveAnswer = { ok: false, error: 'rejected', code: 'NO_SOLUTION', taskCreated: true, billed: true, hint: null }
    switch (request.challenge.type) {
      case 'datadome': {
        const cookie = typeof s.cookie === 'string' ? parseSolvedCookie(s.cookie) : null
        return cookie === null ? failed : { ok: true, solution: { kind: 'cookies', cookies: [cookie] }, userAgent, reportedCostUsd: null }
      }
      case 'cloudflare_challenge': {
        const jar = typeof s.cookies === 'object' && s.cookies !== null ? s.cookies as Record<string, unknown> : {}
        const cookies: SolvedCookie[] = Object.entries(jar).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
          .map(([name, secret]) => ({ name, secret, domain: null, path: '/', secure: true, httpOnly: false, sameSite: null, expires: null }))
        return cookies.length === 0 ? failed : { ok: true, solution: { kind: 'cookies', cookies }, userAgent, reportedCostUsd: null }
      }
      case 'turnstile':
        return typeof s.token === 'string' && s.token !== '' ? { ok: true, solution: { kind: 'token', secret: s.token }, userAgent, reportedCostUsd: null } : failed
      case 'recaptcha_v2':
        return typeof s.gRecaptchaResponse === 'string' && s.gRecaptchaResponse !== '' ? { ok: true, solution: { kind: 'token', secret: s.gRecaptchaResponse }, userAgent, reportedCostUsd: null } : failed
    }
  }
}

/**
 * The fetch CapSolver's API is called with: through the operator's environment proxy (HTTPS_PROXY, NO_PROXY) when one is
 * set, as a local server's other calls go, else Node's own. Never the solver exit: that is the browser's route to sites.
 */
export function capSolverFetch(proxied: boolean): { fetch: typeof fetch; close: () => Promise<void> } {
  if (!proxied) return { fetch, close: async () => {} }
  const dispatcher = new EnvHttpProxyAgent()
  const viaProxy = ((input: string | URL, init?: RequestInit) => undiciFetch(input, { ...(init as object), dispatcher } as Parameters<typeof undiciFetch>[1])) as unknown as typeof fetch
  return { fetch: viaProxy, close: () => dispatcher.close() }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve() }, ms)
    const stop = () => { clearTimeout(timer); reject(new Error('aborted')) }
    signal?.addEventListener('abort', stop, { once: true })
  })
}
