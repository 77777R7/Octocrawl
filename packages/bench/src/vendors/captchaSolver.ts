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

import type { Page } from 'playwright'
import type { CaptchaSolveLog, PaidCallLog, PaidCallRecord, ProxyServer, SpendLedger } from '@w2l/contracts'
import type { GateVerdict } from '@w2l/http-core'

/** The challenges an adapter may solve. */
export const SOLVABLE_CHALLENGES = ['datadome', 'cloudflare_challenge', 'turnstile', 'recaptcha_v2'] as const
export type SolvableChallenge = (typeof SOLVABLE_CHALLENGES)[number]

/** A challenge as the live page shows it, with what a solver needs and nothing more. */
export type DetectedChallenge =
  | { type: 'datadome'; websiteUrl: string; captchaUrl: string }
  | { type: 'cloudflare_challenge'; websiteUrl: string }
  | { type: 'turnstile'; websiteUrl: string; websiteKey: string; action: string | null; cdata: string | null; callback: string | null }
  | { type: 'recaptcha_v2'; websiteUrl: string; websiteKey: string; invisible: boolean; callback: string | null }

/** A challenge no adapter here solves, or one whose parameters say a solve cannot work; named for the record. */
export interface UnsolvableChallenge { type: 'unsupported'; kind: string; reason: string }

/** What the page showed, as read off its DOM by `probeChallenge`. Attribute values only; never the page's text. */
export interface ChallengeProbe {
  url: string
  iframes: readonly string[]
  turnstile: readonly { sitekey: string; action: string | null; cdata: string | null; callback: string | null; form: 'post' | 'get' | null }[]
  recaptcha: readonly { sitekey: string; size: string | null; callback: string | null; form: 'post' | 'get' | null }[]
  hcaptcha: boolean
  perimeterX: boolean
  /** A widget's response field (`cf-turnstile-response`, `g-recaptcha-response`) sits in a form not sent by POST somewhere on the page. */
  responseFieldInGetForm: boolean
  geetest: boolean
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
    /** Whether a task was created with the vendor, so may be billed. */
    taskCreated: boolean
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
}

/** The outcome of one attempt to solve, as the trace and record say it. */
export type SolveOutcome =
  | 'cleared' | 'still_gated' | 'not_injected' | 'solver_failed'
  | 'unsupported' | 'limit_reached' | 'egress_mismatch'

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
  /** `reported`: the vendor's price; `tariff`: the grant's per-solve price, the vendor having stated none. */
  costBasis: 'reported' | 'tariff' | null
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
}

/** The gates a solve may answer: the ones a rung would otherwise return as blocked by a check. */
const SOLVE_GATES: ReadonlySet<string> = new Set(['captcha', 'cloudflare_challenge', 'bot_detected_generic'])

/**
 * The challenge on the page, from what `probeChallenge` read and the gate's verdict; null when the gate names none a
 * solve could answer. The vendor's own check comes first (DataDome, Cloudflare's challenge), then a widget the site
 * embedded.
 */
export function classifyChallenge(probe: ChallengeProbe, verdict: GateVerdict | null): DetectedChallenge | UnsolvableChallenge | null {
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
  if (turnstile !== undefined) return { type: 'turnstile', websiteUrl, websiteKey: turnstile.sitekey, action: turnstile.action, cdata: turnstile.cdata, callback: turnstile.callback }
  const recaptcha = probe.recaptcha[0]
  if (recaptcha !== undefined) return { type: 'recaptcha_v2', websiteUrl, websiteKey: recaptcha.sitekey, invisible: recaptcha.size === 'invisible', callback: recaptcha.callback }
  if (probe.hcaptcha) return { type: 'unsupported', kind: 'hcaptcha', reason: 'no_adapter' }
  if (probe.geetest) return { type: 'unsupported', kind: 'geetest', reason: 'no_adapter' }
  return { type: 'unsupported', kind: verdict.reason, reason: 'no_challenge_parameters' }
}

/** Read the challenge's parameters off the live page: iframe sources and the widgets' attributes, in every frame's main document. */
export async function probeChallenge(page: Page): Promise<ChallengeProbe> {
  const read = await page.evaluate(() => {
    const attr = (el: Element, name: string): string | null => { const v = el.getAttribute(name); return v === null || v.trim() === '' ? null : v.trim() }
    const form = (el: Element): 'post' | 'get' | null => { const f = el.closest('form'); return f === null ? null : f.method.toLowerCase() === 'post' ? 'post' : 'get' }
    const iframes = Array.from(document.querySelectorAll('iframe[src]')).map((el) => (el as HTMLIFrameElement).src).filter((s) => s !== '')
    const turnstile = Array.from(document.querySelectorAll('.cf-turnstile[data-sitekey]')).map((el) => ({ sitekey: attr(el, 'data-sitekey') ?? '', action: attr(el, 'data-action'), cdata: attr(el, 'data-cdata'), callback: attr(el, 'data-callback'), form: form(el) })).filter((w) => w.sitekey !== '')
    const recaptcha = Array.from(document.querySelectorAll('.g-recaptcha[data-sitekey]')).map((el) => ({ sitekey: attr(el, 'data-sitekey') ?? '', size: attr(el, 'data-size'), callback: attr(el, 'data-callback'), form: form(el) })).filter((w) => w.sitekey !== '')
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((el) => (el as HTMLScriptElement).src)
    return {
      url: location.href, iframes, turnstile, recaptcha,
      hcaptcha: document.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]') !== null,
      responseFieldInGetForm: Array.from(document.querySelectorAll('[name="cf-turnstile-response"], [name="g-recaptcha-response"]')).some((el) => { const f = el.closest('form'); return f !== null && f.method.toLowerCase() !== 'post' }),
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

/**
 * Put the answer into the page: cookies into the page's own browser context, then reload; a token into the widget's
 * response field, then the widget's callback or its form. False when the page offers nowhere to submit a token.
 */
export async function injectAnswer(page: Page, challenge: DetectedChallenge, solution: Extract<SolveAnswer, { ok: true }>['solution'], timeoutMs: number): Promise<boolean> {
  if (solution.kind === 'cookies') {
    const pageUrl = new URL(page.url())
    await page.context().addCookies(solution.cookies.map((c) => ({
      name: c.name, value: c.secret,
      // A cookie with no Domain is the page's host's own, as a browser takes a Set-Cookie without one.
      ...(c.domain === null ? { url: pageUrl.origin } : { domain: c.domain, path: c.path ?? '/' }),
      secure: c.secure || pageUrl.protocol === 'https:',
      httpOnly: c.httpOnly,
      ...(c.sameSite === null ? {} : { sameSite: c.sameSite }),
      ...(c.expires === null ? {} : { expires: c.expires }),
    })))
    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs })
    return true
  }
  if (challenge.type !== 'turnstile' && challenge.type !== 'recaptcha_v2') return false
  const field = challenge.type === 'turnstile' ? { selector: '.cf-turnstile', name: 'cf-turnstile-response', tag: 'input' } : { selector: '.g-recaptcha', name: 'g-recaptcha-response', tag: 'textarea' }
  const navigation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame(), timeout: timeoutMs }).then(() => true, () => false)
  const submitted = await page.evaluate(({ token, selector, name, tag, callback }) => {
    const widget = document.querySelector(selector)
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
    if (form !== null && form.method.toLowerCase() !== 'post') return false
    const fn = callback === null ? undefined : (window as unknown as Record<string, unknown>)[callback]
    if (typeof fn === 'function') { (fn as (t: string) => void)(token); return true }
    if (form !== null) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit(); return true }
    return false
  }, { token: solution.secret, selector: field.selector, name: field.name, tag: field.tag, callback: challenge.callback })
  if (submitted) await navigation
  return submitted
}

/** Everything one rung call's solving step needs from the rung. */
export interface SolveStep {
  page: Page
  solving: CaptchaSolving
  /** The browser's own User-Agent, the one the page was read with. */
  userAgent: string
  /** The `host:port` the page left through, by the rung's egress policy; null: direct. */
  pageEgress: string | null
  /** The page's gate now, judged as the rung judges the page it returns; undefined while a document is loading. */
  gateNow: () => Promise<GateVerdict | null | undefined>
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
  const events: SolveTraceDetail[] = []
  const emit = (detail: SolveTraceDetail): void => { events.push(detail); step.onEvent(detail) }
  const none = (type: string, outcome: SolveOutcome, reason: string, blockReasonAfter: string | null): SolveTraceDetail =>
    ({ vendor, type, rung, outcome, solve: null, ms: 0, chargedUsd: null, ceilingUsd: null, costBasis: null, reason, code: null, egress: 'none', blockReasonAfter })
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
      if (bought() >= solving.maxSolvesPerCall) { emit(none(found.type, 'limit_reached', 'max_solves_per_call', verdict.reason)); return events }
      // An exit-bound answer is bought only for the exit the page already left through (ADR 0005: never another exit
      // after a block): the run's chosen exit, through its local forwarder.
      const bound = solving.solver.needsProxy(found.type)
      if (bound && (solving.egress === null || step.pageEgress !== solving.egress.endpoint)) {
        emit(none(found.type, 'egress_mismatch', solving.egress === null ? 'grant_chose_no_solver_exit' : 'page_not_on_solver_exit', verdict.reason))
        return events
      }
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
        answer = { ok: false, error: 'transport', code: null, taskCreated: true }
      }
      const created = answer.ok || answer.taskCreated
      const reportedCostUsd = answer.ok ? answer.reportedCostUsd : null
      const charged = created ? reservation.settle(reportedCostUsd) : (reservation.release(), null)
      const costBasis = !created ? null : reportedCostUsd !== null ? 'reported' as const : 'tariff' as const
      // On the run's paid calls the moment it is charged, before anything else can fail.
      const call = charged === null ? undefined : step.log?.charged({ vendor, rung, ceilingUsd: solving.perSolveUsd, chargedUsd: charged, reportedCostUsd, ...(row === null ? {} : { paidCallId: row.paidCallId }) })
      if (row !== null) {
        row = { ...row, state: created ? 'settled' : 'released', chargedUsd: charged, settledAt: new Date().toISOString() }
        await step.paidCalls!.write(row).catch(() => {})
      }
      const base = { vendor, type: found.type, rung, solve: attempts, ceilingUsd: solving.perSolveUsd, egress: bound ? 'solver_proxy' as const : 'none' as const, chargedUsd: charged, costBasis, ...(call === undefined ? {} : { call }), ...(row === null ? {} : { paidCallId: row.paidCallId }) }
      if (!answer.ok) {
        emit({ ...base, outcome: 'solver_failed', ms: Date.now() - started, reason: answer.error, code: answer.code, blockReasonAfter: verdict.reason })
        return events
      }
      let injected = false
      try {
        injected = await injectAnswer(step.page, found, answer.solution, Math.max(1_000, Math.min(15_000, until - Date.now())))
        if (injected) await step.settle()
      } catch {
        injected = false
      }
      const after = injected ? await step.gateNow().catch(() => undefined) : verdict
      const blockReasonAfter = after === undefined ? verdict.reason : after?.reason ?? null
      emit({ ...base, outcome: !injected ? 'not_injected' : blockReasonAfter === null ? 'cleared' : 'still_gated', ms: Date.now() - started, reason: injected ? null : 'no_submit_target', code: null, blockReasonAfter })
      if (!injected || blockReasonAfter === null) return events
    }
  } catch {
    // The page failed under the step (it navigated away, the browser closed): what was bought is already told.
    return events
  }
}
