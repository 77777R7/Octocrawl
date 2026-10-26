/**
 * ADR 0005 `third_party_captcha_solver` (ROADMAP PA item 6, decided by Howard 2026-10-25): a third-party solver for the
 * challenge a local browser rung (browser_local, installed_chrome) is still stopped at, under a grant that names it.
 * Vendor-neutral: the challenge is read off the live page, handed to a CaptchaSolver (capsolver.ts), and its answer put
 * back into the same browser context, after which the page is judged again by the same gate as any page. A solve that
 * leaves the page gated is paid and still blocked: never a success.
 *
 * What goes to the solver is the minimum (ADR 0005): the page URL, the challenge's own URL or site key, the browser's
 * User-Agent, and for the challenges whose answer is bound to an exit (DataDome, Cloudflare's challenge) the proxy the
 * browser already uses. Never the page's content, other cookies or a login. What comes back (a token, a cookie) stays in
 * memory and in the browser that earned it: the trace, the record and every message carry the type, the vendor, the time,
 * the cost and the outcome only. A solved cookie is the browser context's like any cookie the site set (with
 * `egress_sessions`, the task's cookie session keeps it, as it keeps the others); a token is put only into a widget that
 * posts it or hands it to its own callback, never into a form sent by GET, whose URL the record would keep.
 */

import type { Page, Request } from 'playwright'
import type { CaptchaSolveLog, FetchOptions, PaidCallLog, PaidCallRecord, ProxyServer, SpendLedger } from '@w2l/contracts'
import type { GateVerdict } from '@w2l/http-core'

/** The challenges an adapter may solve. */
export const SOLVABLE_CHALLENGES = ['datadome', 'cloudflare_challenge', 'turnstile', 'recaptcha_v2'] as const
export type SolvableChallenge = (typeof SOLVABLE_CHALLENGES)[number]

/** A challenge as the live page shows it, with what a solver needs and nothing more. */
export type DetectedChallenge =
  | { type: 'datadome'; websiteUrl: string; captchaUrl: string }
  | { type: 'cloudflare_challenge'; websiteUrl: string }
  | { type: 'turnstile'; websiteUrl: string; websiteKey: string; action: string | null; cdata: string | null; callback: string | null; widget?: number }
  | { type: 'recaptcha_v2'; websiteUrl: string; websiteKey: string; invisible: boolean; callback: string | null; widget?: number }

/** A challenge no adapter here solves, or one whose parameters say a solve cannot work; named for the record. */
export interface UnsolvableChallenge { type: 'unsupported'; kind: string; reason: string }

/**
 * How a widget's form is sent: `post`; `get` (it says `method="get"` or names an `action`, so the browser would send it
 * by GET, the token in the URL); `script`: it names neither method nor action, as a form its page's own script sends
 * does (the 2captcha demos, 2026-10-25), and a native GET submission of it is stopped (injectAnswer); null: no form.
 */
export type WidgetForm = 'post' | 'get' | 'script' | null

/** What a widget's place on the page says about it, for the task-contract trigger (`gatingWidget`). */
interface WidgetPlace {
  form: WidgetForm
  /** Its place among the page's widgets of its kind (`.cf-turnstile`, `.g-recaptcha`), so the token goes to it and no other. */
  index?: number
  /** It takes room on the page: a widget hidden, or one its script never rendered, gates nothing the person sees. */
  visible?: boolean
  /** The fields of its form a person fills in (text, e-mail, choices; not hidden ones, buttons or the response fields). */
  inputs?: number
}

/** What the page showed, as read off its DOM by `probeChallenge`. Attribute values only; never the page's text. */
export interface ChallengeProbe {
  url: string
  iframes: readonly string[]
  turnstile: readonly ({ sitekey: string; action: string | null; cdata: string | null; callback: string | null } & WidgetPlace)[]
  recaptcha: readonly ({ sitekey: string; size: string | null; callback: string | null } & WidgetPlace)[]
  hcaptcha: boolean
  perimeterX: boolean
  /** A widget's response field (`cf-turnstile-response`, `g-recaptcha-response`) sits in a form sent by GET (`get`) somewhere on the page. */
  responseFieldInGetForm: boolean
  geetest: boolean
}

/**
 * The browser a solve is bought for, read off its User-Agent: a vendor whose answer is bound to the browser (DataDome's
 * cookie, Cloudflare's cf_clearance) lists the ones it solves for.
 */
export interface BrowserOf {
  family: 'chrome' | 'headless_chrome' | 'other'
  major: number | null
  platform: 'mac' | 'windows' | 'linux' | 'other'
}

export function browserOf(userAgent: string): BrowserOf {
  const headless = /\bHeadlessChrome\/(\d+)\./.exec(userAgent)
  const chrome = /\bChrome\/(\d+)\./.exec(userAgent)
  // Edge and Opera say Chrome too, and are not it.
  const family = headless !== null ? 'headless_chrome' : chrome !== null && !/\b(?:Edg|OPR)\//.test(userAgent) ? 'chrome' : 'other'
  const major = family === 'other' ? null : Number((headless ?? chrome)![1])
  const platform = /\bMacintosh\b|\bMac OS X\b/.test(userAgent) ? 'mac' : /\bWindows NT\b/.test(userAgent) ? 'windows' : /\bLinux\b|\bX11\b/.test(userAgent) ? 'linux' : 'other'
  return { family, major, platform }
}

/** The platform a Chrome on this machine says it is (its User-Agent's), for a browser read by its version alone. */
export function platformOf(platform: NodeJS.Platform = process.platform): BrowserOf['platform'] {
  return platform === 'darwin' ? 'mac' : platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : 'other'
}

/** `chrome/156 mac`: the browser as a record names it. */
export function browserLabel(browser: BrowserOf): string {
  return `${browser.family}${browser.major === null ? '' : `/${browser.major}`} ${browser.platform}`
}

/** A solver's answer, held in memory only. `secret` is the token or cookie values: never logged, traced or recorded. */
export type SolveAnswer =
  | {
    ok: true
    solution: { kind: 'token'; secret: string } | { kind: 'cookies'; cookies: readonly SolvedCookie[] }
    /** The User-Agent the solver says it solved with, when it says one. */
    userAgent: string | null
    /** The vendor's own price for this solve, when it states one; null when it does not (CapSolver states none). */
    reportedCostUsd: number | null
  }
  | {
    ok: false
    /** Why, as a fixed word; `code` is the vendor's error code, kept only when it is a plain code (no free text). */
    error: SolveError
    code: string | null
    /** Whether a task was created with the vendor. */
    taskCreated: boolean
    /**
     * Whether the vendor bills it: false for no task, or a task the vendor itself reported failed where its terms bill
     * none (CapSolver); true for a task it answered; null when not known (its answer lost, our deadline): charged at
     * the tariff.
     */
    billed: boolean | null
    /** What the vendor's description said, as a fixed vocabulary and numeric codes only (never its free text); null: nothing. */
    hint: string | null
  }

export type SolveError = 'unsupported' | 'unsolvable' | 'timeout' | 'rejected' | 'key_denied' | 'zero_balance' | 'proxy_banned' | 'transport' | 'aborted'

export interface SolvedCookie { name: string; secret: string; domain: string | null; path: string | null; secure: boolean; httpOnly: boolean; sameSite: 'Strict' | 'Lax' | 'None' | null; expires: number | null }

export interface SolveRequest {
  challenge: DetectedChallenge
  userAgent: string
  /** The exit the browser reads the page through, for a challenge bound to it; null for the others. */
  proxy: ProxyServer | null
  /** When the solve must have ended (epoch ms). */
  deadlineAt: number
  signal?: AbortSignal
}

/** One vendor's solver. */
export interface CaptchaSolver {
  /** The vendor's id, as the grant's tariffs name it. */
  readonly vendor: string
  supports(type: SolvableChallenge): boolean
  /** Whether the vendor needs the browser's exit for this challenge (its answer is only accepted from that exit). */
  needsProxy(type: SolvableChallenge): boolean
  /**
   * Why the vendor does not solve this challenge for this browser, as a fixed word; null when it does. A browser-bound
   * answer (a cookie the site ties to the User-Agent) bought for a browser the vendor does not list would be paid for and
   * refused (smoke test 2026-10-25, C008: cf_clearance solved for Chrome 156, the page still challenged).
   */
  browserSupport(type: SolvableChallenge, browser: BrowserOf): string | null
  solve(request: SolveRequest): Promise<SolveAnswer>
}

/**
 * The exit chosen for the run before any request (ADR 0005, revision of 2026-10-25): the browser rungs leave through a
 * local forwarder (`endpoint`) to `upstream`, the operator's sticky exit, and a solve bound to an exit gets `upstream`.
 * A page that did not leave through `endpoint` is never solved with it: the solver would answer for another exit.
 */
export interface SolverEgress { endpoint: string; upstream: ProxyServer }

/** What a rung needs to solve: the solver, its prices and limits from the grant, and the run's chosen exit. */
export interface CaptchaSolving {
  solver: CaptchaSolver
  /** The grant tariff's price per solve, charged when the vendor states none. */
  perSolveUsd: number
  /** The most solves one call (one page's fetch) may make. */
  maxSolvesPerCall: number
  /** The run's exit for exit-bound challenges; null: the grant chose none, and those challenges are not solved. */
  egress: SolverEgress | null
  /** The grant's SHA-256, for the paid-call rows; null when not read from text. */
  grantHash: string | null
  /**
   * The later rung of the same ladder that solves this page's browser-bound challenges (DataDome, Cloudflare's challenge)
   * in this rung's place: `carries` says whether it takes this request and the vendor lists its browser for the type.
   * Set by buildChannels on browser_local when the ladder has installed_chrome (ADR 0005, revision of 2026-10-26), so
   * the bundled Chromium never spends the page's allowance the installed Chrome needs. Absent: this rung solves.
   */
  defersTo?: { rung: string; carries: (type: SolvableChallenge, options: FetchOptions) => Promise<boolean> }
}

/** The outcome of one attempt to solve, as the trace and record say it. */
export type SolveOutcome =
  | 'cleared' | 'still_gated' | 'not_injected' | 'solver_failed'
  | 'unsupported' | 'limit_reached' | 'egress_mismatch' | 'deferred'

/** One `captcha_solve` trace event's detail. Never the token, the cookie, the key or the proxy's login. */
export interface SolveTraceDetail {
  vendor: string
  /** The challenge type, or `unsupported:<kind>`. */
  type: string
  /** The rung that made it. */
  rung: string
  /** The solve's paid call's number in the run, when the ladder keeps the run's paid calls. */
  call?: number
  outcome: SolveOutcome
  /** The solve's place in this call (1-based); null when none was attempted. */
  solve: number | null
  /** From the task's creation to the page being judged again; 0 when no task was created. */
  ms: number
  /** What the ledger charged; null when no task was created (nothing to charge). */
  chargedUsd: number | null
  /** What the ledger reserved before the task: the tariff's per-solve price; null when nothing was reserved. */
  ceilingUsd: number | null
  /**
   * `reported`: the vendor's price; `tariff`: the grant's per-solve price, the vendor having stated none;
   * `vendor_unbilled_failure`: 0, for a task the vendor reported failed, which its terms do not bill.
   */
  costBasis: 'reported' | 'tariff' | 'vendor_unbilled_failure' | null
  /** Why no solve, or why it failed: a fixed word. */
  reason: string | null
  /** The vendor's error code, when it gave a plain one. */
  code: string | null
  /** Whether the solve was sent the run's exit. */
  egress: 'solver_proxy' | 'none'
  /** The page's gate after the solve; null when it showed none. */
  blockReasonAfter: string | null
  /** The task's paid-call row id, inside a task. */
  paidCallId?: string
  /** What started the solve: a gate the page showed, or the task contract failing on a page with a widget that gates it. */
  trigger?: 'gate' | 'task_contract'
  /** The browser, as `browserLabel` names it, when the vendor does not solve for it. */
  browser?: string
  /** The later rung a deferred solve is left to. */
  deferredTo?: string
  /** For an answer that names the User-Agent it was solved with: whether it is the browser's own. */
  vendorUserAgent?: 'same' | 'other'
  /** The vendor's description of a failure, as its fixed vocabulary (SolveAnswer.hint). */
  hint?: string
}

/** The gates a solve may answer: the ones a rung would otherwise return as blocked by a check. */
const SOLVE_GATES: ReadonlySet<string> = new Set(['captcha', 'cloudflare_challenge', 'bot_detected_generic'])

/**
 * The verdict a rung passes for a page that answered as content but fails the request's task contract on the live page
 * (smoke test 2026-10-25, C009: the Turnstile demo is a 200 page, so no gate ever started a solve). Only a widget that
 * gates the page (`gatingWidget`) is solved under it, never a vendor's check, which the gate names.
 */
export const TASK_CONTRACT_UNMET = 'task_contract_unmet'

/** A page's verdict for solving: the gate's, or TASK_CONTRACT_UNMET. */
export type SolveVerdict = GateVerdict | { reason: typeof TASK_CONTRACT_UNMET; signals: readonly string[] }

/**
 * The token widget a page that fails its task contract waits on: one that takes room on the page, is not reCAPTCHA's
 * invisible kind (which sits on many sites' forms), and either hands its token to the page's callback or sits in a form
 * that asks for nothing else. A contact or sign-up form with fields of its own is never solved and sent for a task.
 */
function gatingWidget(probe: ChallengeProbe): DetectedChallenge | null {
  const gates = (w: WidgetPlace & { callback: string | null }) => w.visible === true && w.inputs !== undefined && w.form !== 'get' && !probe.responseFieldInGetForm &&
    (w.form === null ? w.callback !== null : w.inputs === 0)
  const turnstile = probe.turnstile.find(gates)
  if (turnstile !== undefined) return { type: 'turnstile', websiteUrl: probe.url, websiteKey: turnstile.sitekey, action: turnstile.action, cdata: turnstile.cdata, callback: turnstile.callback, ...widgetAt(turnstile) }
  const recaptcha = probe.recaptcha.find((w) => w.size !== 'invisible' && gates(w))
  if (recaptcha !== undefined) return { type: 'recaptcha_v2', websiteUrl: probe.url, websiteKey: recaptcha.sitekey, invisible: false, callback: recaptcha.callback, ...widgetAt(recaptcha) }
  return null
}

function widgetAt(w: WidgetPlace): { widget?: number } {
  return w.index === undefined ? {} : { widget: w.index }
}

/**
 * The challenge on the page, from what `probeChallenge` read and the gate's verdict; null when the gate names none a
 * solve could answer. The vendor's own check comes first (DataDome, Cloudflare's challenge), then a widget the site
 * embedded. Under TASK_CONTRACT_UNMET, only a widget that gates the page.
 */
export function classifyChallenge(probe: ChallengeProbe, verdict: SolveVerdict | null): DetectedChallenge | UnsolvableChallenge | null {
  if (verdict !== null && verdict.reason === TASK_CONTRACT_UNMET) return gatingWidget(probe)
  if (verdict === null || !SOLVE_GATES.has(verdict.reason)) return null
  const websiteUrl = probe.url
  const datadome = probe.iframes.find((src) => /^https?:\/\/(?:[a-z0-9-]+\.)*captcha-delivery\.com\/(?:captcha|interstitial)\//i.test(src))
  if (datadome !== undefined) {
    let t: string | null = null
    try { t = new URL(datadome).searchParams.get('t') } catch {}
    // `t=bv`: DataDome has banned the exit; no solve gets through, so none is bought (CapSolver's DataDome guide).
    if (t === 'bv') return { type: 'unsupported', kind: 'datadome', reason: 'datadome_exit_banned' }
    if (t !== 'fe') return { type: 'unsupported', kind: 'datadome', reason: 'datadome_challenge_unrecognised' }
    return { type: 'datadome', websiteUrl, captchaUrl: datadome }
  }
  if (probe.perimeterX || verdict.signals.some((s) => s.startsWith('px_'))) return { type: 'unsupported', kind: 'perimeterx', reason: 'no_adapter' }
  if (verdict.signals.includes('header_x_kpsdk_ct') || verdict.signals.includes('header_x_kasada')) return { type: 'unsupported', kind: 'kasada', reason: 'no_adapter' }
  if (verdict.reason === 'cloudflare_challenge') return { type: 'cloudflare_challenge', websiteUrl }
  // A token goes only where it is posted or handed to the widget's callback: a form sent by GET would put it in the URL the
  // record keeps (secrets_in_records), and a widget with neither has nowhere to send it. Neither is bought.
  const widget = probe.turnstile[0] ?? probe.recaptcha[0]
  if (widget !== undefined && (widget.form === 'get' || probe.responseFieldInGetForm)) return { type: 'unsupported', kind: probe.turnstile[0] !== undefined ? 'turnstile' : 'recaptcha_v2', reason: 'form_sent_by_get' }
  if (widget !== undefined && widget.callback === null && widget.form === null) return { type: 'unsupported', kind: probe.turnstile[0] !== undefined ? 'turnstile' : 'recaptcha_v2', reason: 'no_submit_target' }
  const turnstile = probe.turnstile[0]
  if (turnstile !== undefined) return { type: 'turnstile', websiteUrl, websiteKey: turnstile.sitekey, action: turnstile.action, cdata: turnstile.cdata, callback: turnstile.callback, ...widgetAt(turnstile) }
  const recaptcha = probe.recaptcha[0]
  if (recaptcha !== undefined) return { type: 'recaptcha_v2', websiteUrl, websiteKey: recaptcha.sitekey, invisible: recaptcha.size === 'invisible', callback: recaptcha.callback, ...widgetAt(recaptcha) }
  if (probe.hcaptcha) return { type: 'unsupported', kind: 'hcaptcha', reason: 'no_adapter' }
  if (probe.geetest) return { type: 'unsupported', kind: 'geetest', reason: 'no_adapter' }
  return { type: 'unsupported', kind: verdict.reason, reason: 'no_challenge_parameters' }
}

/** Read the challenge's parameters off the live page: iframe sources and the widgets' attributes, in every frame's main document. */
export async function probeChallenge(page: Page): Promise<ChallengeProbe> {
  const read = await page.evaluate(() => {
    const attr = (el: Element, name: string): string | null => { const v = el.getAttribute(name); return v === null || v.trim() === '' ? null : v.trim() }
    const sentAs = (f: HTMLFormElement): 'post' | 'get' | 'script' => f.method.toLowerCase() === 'post' ? 'post' : f.hasAttribute('method') || f.hasAttribute('action') ? 'get' : 'script'
    const form = (el: Element): 'post' | 'get' | 'script' | null => { const f = el.closest('form'); return f === null ? null : sentAs(f) }
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    // The fields a person fills in: not hidden ones, buttons, or a widget's own response field.
    const inputs = (el: Element): number => {
      const f = el.closest('form')
      if (f === null) return 0
      return Array.from(f.querySelectorAll('input, textarea, select')).filter((field) => {
        const name = field.getAttribute('name') ?? ''
        if (/^(?:cf-turnstile-response|g-recaptcha-response|h-captcha-response)$/.test(name)) return false
        const type = (field.getAttribute('type') ?? '').toLowerCase()
        return !(field.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(type))
      }).length
    }
    const place = (el: Element, index: number) => ({ form: form(el), visible: box(el), inputs: inputs(el), index })
    const iframes = Array.from(document.querySelectorAll('iframe[src]')).map((el) => (el as HTMLIFrameElement).src).filter((s) => s !== '')
    const turnstile = Array.from(document.querySelectorAll('.cf-turnstile[data-sitekey]')).map((el, i) => ({ sitekey: attr(el, 'data-sitekey') ?? '', action: attr(el, 'data-action'), cdata: attr(el, 'data-cdata'), callback: attr(el, 'data-callback'), ...place(el, i) })).filter((w) => w.sitekey !== '')
    const recaptcha = Array.from(document.querySelectorAll('.g-recaptcha[data-sitekey]')).map((el, i) => ({ sitekey: attr(el, 'data-sitekey') ?? '', size: attr(el, 'data-size'), callback: attr(el, 'data-callback'), ...place(el, i) })).filter((w) => w.sitekey !== '')
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((el) => (el as HTMLScriptElement).src)
    return {
      url: location.href, iframes, turnstile, recaptcha,
      hcaptcha: document.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]') !== null,
      responseFieldInGetForm: Array.from(document.querySelectorAll('[name="cf-turnstile-response"], [name="g-recaptcha-response"]')).some((el) => { const f = el.closest('form'); return f !== null && sentAs(f) === 'get' }),
      perimeterX: document.querySelector('#px-captcha') !== null || typeof (window as unknown as Record<string, unknown>)['_pxAppId'] === 'string',
      geetest: scripts.some((s) => /geetest/i.test(s)),
    }
  })
  return read
}

/**
 * Parse a Set-Cookie-style string (`name=value; Max-Age=…; Domain=; Path=/; Secure; SameSite=Lax`) as a solver returns
 * a cookie in; null when it names no cookie.
 */
export function parseSolvedCookie(text: string): SolvedCookie | null {
  const [pair, ...attributes] = text.split(';')
  const eq = pair?.indexOf('=') ?? -1
  if (pair === undefined || eq <= 0) return null
  const name = pair.slice(0, eq).trim()
  const secret = pair.slice(eq + 1).trim()
  if (name === '' || secret === '') return null
  const cookie: SolvedCookie = { name, secret, domain: null, path: null, secure: false, httpOnly: false, sameSite: null, expires: null }
  for (const raw of attributes) {
    const at = raw.indexOf('=')
    const key = (at < 0 ? raw : raw.slice(0, at)).trim().toLowerCase()
    const value = at < 0 ? '' : raw.slice(at + 1).trim()
    if (key === 'domain') cookie.domain = value === '' ? null : value
    else if (key === 'path') cookie.path = value === '' ? null : value
    else if (key === 'secure') cookie.secure = true
    else if (key === 'httponly') cookie.httpOnly = true
    else if (key === 'samesite') {
      const v = value.toLowerCase()
      cookie.sameSite = v === 'strict' ? 'Strict' : v === 'none' ? 'None' : v === 'lax' ? 'Lax' : null
    } else if (key === 'max-age' && /^\d+$/.test(value)) cookie.expires = Math.floor(Date.now() / 1000) + Number(value)
  }
  return cookie
}

/** How an answer went into the page: `injected`, or why not, as the trace's reason says it. */
export type Injection = 'injected' | 'no_submit_target' | 'script_did_not_take_submit'

/** How long a token handed to a callback or a script's form may take to change the page, it not navigating. */
const SCRIPT_SUBMIT_WAIT_MS = 5_000

/**
 * How long a callback whose widget sits in a POST form may take to navigate, clear the page or send anything, before
 * that form is sent.
 */
const CALLBACK_WAIT_MS = 2_000

/** Where injectAnswer keeps the solved widget's form between its two steps: on the page's window, not in its DOM. */
const SOLVED_FORM = 'octocrawl.solvedForm'

/**
 * Put the answer into the page: cookies into the page's own browser context, then reload; a token into the widget's
 * response field, then the widget's callback or its form. The widget is the one solved (its site key), never another on
 * the page. A form its page's script sends (`script`) gets a dispatched `submit` event, which the page's handlers take
 * and the browser never submits itself: the token never goes into a URL the record keeps, whatever the script does.
 * A widget with a callback inside a POST form gets both: the callback first, then, when within CALLBACK_WAIT_MS the page
 * has not navigated, sent no request of its own (a navigation not yet answered, a fetch that may have spent the token)
 * and does not pass (`cleared`), the same form element. Google's reCAPTCHA demo's callback only clears an error
 * message, and its token reaches the site only with the form (C011, 2026-10-26).
 */
export async function injectAnswer(page: Page, challenge: DetectedChallenge, solution: Extract<SolveAnswer, { ok: true }>['solution'], timeoutMs: number, cleared?: () => Promise<boolean>): Promise<Injection> {
  if (solution.kind === 'cookies') {
    const pageUrl = new URL(page.url())
    // The site's own cookies of those names on a parent domain, which the solved ones replace: two of one name would
    // both be sent, the older first (T045, 2026-10-26: idealista's DataDome set `datadome` on `.idealista.com`, and the
    // solved one, which names no Domain, went beside it on www.idealista.com; the page stayed gated).
    const held = (await page.context().cookies(pageUrl.href)).filter((cookie) => cookie.domain.startsWith('.'))
    await page.context().addCookies(solution.cookies.map((c) => {
      const own = c.domain === null ? held.find((cookie) => cookie.name === c.name) : undefined
      return {
        name: c.name, value: c.secret,
        // A cookie with no Domain is the page's host's own, as a browser takes a Set-Cookie without one, unless the site
        // keeps one of that name on a parent domain: it then takes that cookie's place.
        ...(own !== undefined ? { domain: own.domain, path: own.path } : c.domain === null ? { url: pageUrl.origin } : { domain: c.domain, path: c.path ?? '/' }),
        secure: c.secure || pageUrl.protocol === 'https:',
        httpOnly: c.httpOnly,
        ...(c.sameSite === null ? {} : { sameSite: c.sameSite }),
        ...(c.expires === null ? {} : { expires: c.expires }),
      }
    }))
    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs })
    return 'injected'
  }
  if (challenge.type !== 'turnstile' && challenge.type !== 'recaptcha_v2') return 'no_submit_target'
  // The probe's selectors, so `widget` indexes the same list.
  const field = challenge.type === 'turnstile' ? { selector: '.cf-turnstile[data-sitekey]', name: 'cf-turnstile-response', tag: 'input' } : { selector: '.g-recaptcha[data-sitekey]', name: 'g-recaptcha-response', tag: 'textarea' }
  const navigation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame(), timeout: timeoutMs }).then(() => true, () => false)
  // What the main frame sends once the callback has the token: a navigation or a fetch means the callback acted on it.
  let sentByPage = false
  const onRequest = (request: Request) => {
    if (!['document', 'fetch', 'xhr'].includes(request.resourceType())) return
    // A navigation request may come before its frame exists, when frame() throws: not the main frame's own request.
    try { if (request.frame() === page.mainFrame()) sentByPage = true } catch {}
  }
  page.on('request', onRequest)
  const submitted = await page.evaluate(({ token, selector, sitekey, index, name, tag, callback, key }) => {
    // The widget the probe chose, by its place, and only while it still carries the key that was solved.
    const all = Array.from(document.querySelectorAll(selector))
    const widget = (index === null ? all.find((el) => el.getAttribute('data-sitekey')?.trim() === sitekey) : all[index]) ?? null
    if (widget === null || widget.getAttribute('data-sitekey')?.trim() !== sitekey) return 'no_submit_target'
    const form = widget?.closest('form') ?? null
    // Only the widget's own field, or its form's: never one elsewhere on the page, which another form might send by GET.
    const scope: ParentNode | null = form ?? widget
    let fields = (scope === null ? [] : Array.from(scope.querySelectorAll(`[name="${name}"]`))) as (HTMLInputElement | HTMLTextAreaElement)[]
    if (fields.length === 0) {
      const created = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement
      created.name = name
      if (tag === 'input') (created as HTMLInputElement).type = 'hidden'
      else created.style.display = 'none'
      ;(form ?? widget ?? document.body).appendChild(created)
      fields = [created]
    }
    for (const f of fields) f.value = token
    // Never a form sent by GET: its URL, with the token in it, would be the page's address on the record.
    const scripted = form !== null && form.method.toLowerCase() !== 'post' && !form.hasAttribute('method') && !form.hasAttribute('action')
    if (form !== null && form.method.toLowerCase() !== 'post' && !scripted) return 'no_submit_target'
    const fn = callback === null ? undefined : (window as unknown as Record<string, unknown>)[callback]
    if (typeof fn === 'function') {
      const then = form !== null && !scripted
      if (then) (window as unknown as Record<symbol, unknown>)[Symbol.for(key)] = form
      ;(fn as (t: string) => void)(token)
      return then ? 'callback_then_form' : 'by_script'
    }
    if (form === null) return 'no_submit_target'
    if (!scripted) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit(); return 'navigates' }
    // A dispatched submit event reaches the page's handlers (React's too) but never makes the browser submit the form, so
    // it cannot go by GET; a script that takes it cancels it.
    const event = typeof SubmitEvent === 'function' ? new SubmitEvent('submit', { bubbles: true, cancelable: true }) : new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    return event.defaultPrevented ? 'by_script' : 'script_did_not_take_submit'
  }, { token: solution.secret, selector: field.selector, sitekey: challenge.websiteKey, index: challenge.widget ?? null, name: field.name, tag: field.tag, callback: challenge.callback, key: SOLVED_FORM }).catch((error: unknown) => { page.off('request', onRequest); throw error })
  if (submitted === 'callback_then_form') {
    const moved = await Promise.race([navigation, new Promise<false>((resolve) => setTimeout(() => resolve(false), Math.min(CALLBACK_WAIT_MS, timeoutMs)))])
    page.off('request', onRequest)
    // The solved form's reference is dropped from the page on every way out of this step.
    const forget = () => page.evaluate((key) => { delete (window as unknown as Record<symbol, unknown>)[Symbol.for(key)] }, SOLVED_FORM).catch(() => {})
    if (moved) return 'injected'
    // The callback sent something (its own form, not yet answered; a check by fetch): it is waited for as before, and
    // the token, which a site takes once, is never sent again.
    if (sentByPage) { await forget(); await Promise.race([navigation, new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(SCRIPT_SUBMIT_WAIT_MS - CALLBACK_WAIT_MS, timeoutMs - CALLBACK_WAIT_MS))))]); return 'injected' }
    if (cleared !== undefined && await cleared().catch(() => false)) { await forget(); return 'injected' }
    // Only the form element the solved widget was in, still on the page and still sent by POST: never another form.
    const sent = await page.evaluate((key) => {
      const form = (window as unknown as Record<symbol, unknown>)[Symbol.for(key)]
      delete (window as unknown as Record<symbol, unknown>)[Symbol.for(key)]
      if (!(form instanceof HTMLFormElement) || !form.isConnected || form.method.toLowerCase() !== 'post') return false
      if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit()
      return true
    }, SOLVED_FORM).catch(() => false)
    if (sent) await navigation
    return 'injected'
  }
  page.off('request', onRequest)
  if (submitted === 'navigates') await navigation
  // A callback or a script may navigate, or only change the page in place: what it does is waited for a few seconds.
  else if (submitted === 'by_script') await Promise.race([navigation, new Promise((resolve) => setTimeout(resolve, Math.min(SCRIPT_SUBMIT_WAIT_MS, timeoutMs)))])
  return submitted === 'navigates' || submitted === 'by_script' ? 'injected' : submitted
}

/** Everything one rung call's solving step needs from the rung. */
export interface SolveStep {
  page: Page
  solving: CaptchaSolving
  /** The browser's own User-Agent, the one the page was read with. */
  userAgent: string
  /** The `host:port` the page left through, by the rung's egress policy; null: direct. */
  pageEgress: string | null
  /**
   * The page's gate now, judged as the rung judges the page it returns; undefined while a document is loading. Under the
   * `task_contract` trigger, TASK_CONTRACT_UNMET while the contract fails on the live page and null once it holds.
   */
  gateNow: () => Promise<SolveVerdict | null | undefined>
  /** What starts the solve: the gate (the default), or the task contract failing on a page that answered as content. */
  trigger?: 'gate' | 'task_contract'
  /** The request, for a later rung's `carries` (CaptchaSolving.defersTo). */
  options?: FetchOptions
  /** Let the page settle after the answer went in. */
  settle: () => Promise<void>
  /** The run's (or page's) ledger; without one, no solve is bought: its cost would have no cap and no record. */
  spend: SpendLedger | undefined
  /** The task's paid-call journal, when the call runs inside a task. */
  paidCalls: PaidCallLog | undefined
  /** The page's solves across its rungs, kept by the ladder; absent: this call counts its own. */
  log: CaptchaSolveLog | undefined
  /** The rung solving, for the record. */
  rung: string
  /** Each attempt's detail as it is made, so a rung that throws after a paid solve still has it on its trace. */
  onEvent: (detail: SolveTraceDetail) => void
  url: string
  deadlineAt: number | undefined
  signal: AbortSignal | undefined
  /** The time a capture after the solves still needs, kept off the solver's deadline. */
  reserveMs: number
}

/** How long a solve may take at most, the vendor's own task timeout being 120 s (CapSolver ERROR_TASK_TIMEOUT). */
export const SOLVE_MAX_MS = 120_000

/**
 * Solve what the page shows, up to `maxSolvesPerCall` times for the page (across its rungs, when the ladder keeps its
 * log) while it stays gated: each solve reserved from the ledger at the tariff's per-solve price before its task is
 * created, settled at the vendor's price or that price after it, and given back when no task was created. Each attempt's
 * detail goes to `onEvent` as it is made (one for a check it did not attempt too), and the list is returned. Never
 * throws: a page that fails under it ends the step, what was paid already told.
 */
export async function solveChallenges(step: SolveStep): Promise<SolveTraceDetail[]> {
  const { solving, rung } = step
  const vendor = solving.solver.vendor
  const trigger = step.trigger ?? 'gate'
  const events: SolveTraceDetail[] = []
  const emit = (detail: SolveTraceDetail): void => { events.push(detail); step.onEvent(detail) }
  const none = (type: string, outcome: SolveOutcome, reason: string, blockReasonAfter: string | null, extra: Partial<SolveTraceDetail> = {}): SolveTraceDetail =>
    ({ vendor, type, rung, outcome, solve: null, ms: 0, chargedUsd: null, ceilingUsd: null, costBasis: null, reason, code: null, egress: 'none', blockReasonAfter, trigger, ...extra })
  const browser = browserOf(step.userAgent)
  const carried = new Map<SolvableChallenge, boolean>()
  let attempts = 0
  const bought = (): number => step.log?.used() ?? attempts
  try {
    for (;;) {
      const verdict = await step.gateNow()
      if (verdict === undefined || verdict === null) return events
      const found = classifyChallenge(await probeChallenge(step.page), verdict)
      if (found === null) return events
      if (found.type === 'unsupported') { emit(none(`unsupported:${found.kind}`, 'unsupported', found.reason, verdict.reason)); return events }
      if (!solving.solver.supports(found.type)) { emit(none(found.type, 'unsupported', 'vendor_does_not_solve_it', verdict.reason)); return events }
      const bound = solving.solver.needsProxy(found.type)
      // A browser-bound answer belongs to the ladder's last local rung that carries it (ADR 0005, revision of
      // 2026-10-26): this rung leaves it, and the page's allowance, to a later one whose browser the vendor lists.
      if (bound && solving.defersTo !== undefined) {
        if (!carried.has(found.type)) carried.set(found.type, await solving.defersTo.carries(found.type, step.options ?? {}))
        if (carried.get(found.type) === true) { emit(none(found.type, 'deferred', 'later_rung_solves', verdict.reason, { deferredTo: solving.defersTo.rung })); return events }
      }
      // An exit-bound answer is bought only for the exit the page already left through (ADR 0005: never another exit
      // after a block): the run's chosen exit, through its local forwarder.
      if (bound && (solving.egress === null || step.pageEgress !== solving.egress.endpoint)) {
        emit(none(found.type, 'egress_mismatch', solving.egress === null ? 'grant_chose_no_solver_exit' : 'page_not_on_solver_exit', verdict.reason))
        return events
      }
      const unlisted = solving.solver.browserSupport(found.type, browser)
      if (unlisted !== null) { emit(none(found.type, 'unsupported', unlisted, verdict.reason, { browser: browserLabel(browser) })); return events }
      if (bought() >= solving.maxSolvesPerCall) { emit(none(found.type, 'limit_reached', 'max_solves_per_call', verdict.reason)); return events }
      const until = Math.min(Date.now() + SOLVE_MAX_MS, (step.deadlineAt ?? Number.POSITIVE_INFINITY) - step.reserveMs)
      if (until - Date.now() < 5_000) { emit(none(found.type, 'limit_reached', 'deadline', verdict.reason)); return events }
      if (step.spend === undefined) { emit(none(found.type, 'limit_reached', 'no_budget', verdict.reason)); return events }
      const reservation = step.spend.reserve(solving.perSolveUsd)
      if (reservation === null) { emit(none(found.type, 'limit_reached', 'budget', verdict.reason)); return events }
      attempts++
      let row: PaidCallRecord | null
      try { row = step.paidCalls?.open({ url: step.url, vendorId: vendor, ceilingUsd: solving.perSolveUsd, grantHash: solving.grantHash, deadline: new Date(until).toISOString() }) ?? null } catch { reservation.release(); return events }
      if (row !== null) {
        try { await step.paidCalls!.write(row) } catch { reservation.release(); return events }
      }
      const started = Date.now()
      let answer: SolveAnswer
      try {
        answer = await solving.solver.solve({ challenge: found, userAgent: step.userAgent, proxy: bound ? solving.egress!.upstream : null, deadlineAt: until, ...(step.signal === undefined ? {} : { signal: step.signal }) })
      } catch {
        // A solver that threw may have created a task: it is charged at the tariff.
        answer = { ok: false, error: 'transport', code: null, taskCreated: true, billed: null, hint: null }
      }
      const created = answer.ok || answer.taskCreated
      // A task the vendor reported failed, which its terms do not bill (CapSolver: "no charge for failed attempts"), is
      // settled at 0 and kept as an attempt; one whose bill is not known is charged at the tariff.
      const unbilled = !answer.ok && answer.billed === false
      const reportedCostUsd = answer.ok ? answer.reportedCostUsd : null
      const charged = !created ? (reservation.release(), null) : reservation.settle(unbilled ? 0 : reportedCostUsd)
      // A task the vendor refused costs nothing, but still uses one of the page's solves for every rung.
      if (!created) step.log?.refused()
      const costBasis = !created ? null : unbilled ? 'vendor_unbilled_failure' as const : reportedCostUsd !== null ? 'reported' as const : 'tariff' as const
      // On the run's paid calls the moment it is charged, before anything else can fail.
      const call = charged === null ? undefined : step.log?.charged({ vendor, rung, ceilingUsd: solving.perSolveUsd, chargedUsd: charged, reportedCostUsd, solved: answer.ok, ...(row === null ? {} : { paidCallId: row.paidCallId }) })
      if (row !== null) {
        row = { ...row, state: created ? 'settled' : 'released', chargedUsd: charged, settledAt: new Date().toISOString() }
        await step.paidCalls!.write(row).catch(() => {})
      }
      const base = { vendor, type: found.type, rung, solve: attempts, ceilingUsd: solving.perSolveUsd, egress: bound ? 'solver_proxy' as const : 'none' as const, chargedUsd: charged, costBasis, trigger, ...(call === undefined ? {} : { call }), ...(row === null ? {} : { paidCallId: row.paidCallId }) }
      if (!answer.ok) {
        emit({ ...base, outcome: 'solver_failed', ms: Date.now() - started, reason: answer.error, code: answer.code, blockReasonAfter: verdict.reason, ...(answer.hint === null ? {} : { hint: answer.hint }) })
        return events
      }
      const vendorUserAgent = answer.userAgent === null ? {} : { vendorUserAgent: answer.userAgent === step.userAgent ? 'same' as const : 'other' as const }
      let injection: Injection = 'no_submit_target'
      try {
        injection = await injectAnswer(step.page, found, answer.solution, Math.max(1_000, Math.min(15_000, until - Date.now())), async () => (await step.gateNow()) === null)
        if (injection === 'injected') await step.settle()
      } catch {
        injection = 'no_submit_target'
      }
      const injected = injection === 'injected'
      const after = injected ? await step.gateNow().catch(() => undefined) : verdict
      const blockReasonAfter = after === undefined ? verdict.reason : after?.reason ?? null
      emit({ ...base, outcome: !injected ? 'not_injected' : blockReasonAfter === null ? 'cleared' : 'still_gated', ms: Date.now() - started, reason: injected ? null : injection, code: null, blockReasonAfter, ...vendorUserAgent })
      if (!injected || blockReasonAfter === null) return events
    }
  } catch {
    // The page failed under the step (it navigated away, the browser closed): what was bought is already told.
    return events
  }
}
