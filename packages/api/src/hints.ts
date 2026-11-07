/**
 * Agent hints: what a scrape response says about the request itself, in one
 * sentence each, so an agent reading the result knows the next honest step:
 * a recorded override, a session of its own, a wait, a request without
 * fastMode, a lighter screenshot. Not a status and not a warning about the page: a hint is about
 * the request. It never quotes page text, only a host name, a status code,
 * a rule or a time, and it never points around a refusal. Present on a
 * response (`agentHints`) only when there is one.
 */

import { DEFAULT_SCRAPE_TIMEOUT_MS, isOctocrawlRobotsGroup, MAX_WAIT_FOR_MS, type Evidence, type FetchResult, type LadderRunAudit, type MapResponse, type ScrapeRequest } from '@w2l/contracts'
import { HTTP_CHANNELS, INSTALLED_CHROME_INSTALL } from '@w2l/bench'
import { SHELL_TEXT_MAX } from '@w2l/runtime'

/** The hint a `fastMode` scrape carries when the http lane asked for the browser lane it was denied. */
export const FAST_MODE_DECLINED_HINT = 'the http lane asked for the browser lane; fastMode declined it; retry without fastMode'

/** The hint a `wait_for_unavailable` result carries: nothing was read, and the wait is what stopped it, not the site or its robots.txt. */
export const WAIT_FOR_UNAVAILABLE_HINT = 'waitFor needs the browser lane and no browser rung is open to this request for this URL, so nothing was read; send it without waitFor to read the page without the wait'

/** The clause that names page actions as the next step; a hosted server takes none, so its hints leave it out. */
const ACTIONS_CLAUSE = 'actions (a click, a scroll, a wait for a selector) when it appears after an interaction'

/** The hint a `low_content_yield` warning carries: what to change so the browser lane gets a better chance; `actions` false on a server that takes none. */
export function lowContentYieldHint(browserTried: boolean, actions = true): string {
  return `the http lane's content was thin and the browser lane ${browserTried ? 'did not improve it' : 'was not available'}; pass waitFor (up to ${MAX_WAIT_FOR_MS} ms) or a longer timeout with the browser lane available${actions ? ', or actions (a click, a scroll, a wait for a selector) when the data appears after an interaction' : ''}`
}

/** The hint a `low_content_yield` warning on a rendered answer carries: the page was rendered and still held little; `actions` false on a server that takes none. */
export function renderedLowYieldHint(actions = true): string {
  return `the rendered page's main content was thin and the extraction unsure of it; pass waitFor (up to ${MAX_WAIT_FOR_MS} ms) when its data loads late, ${actions ? `${ACTIONS_CLAUSE}, ` : ''}or onlyMainContent: false for the whole page`
}
export const RENDERED_LOW_YIELD_HINT = renderedLowYieldHint()

/**
 * The hint a rendered page with no main content carries when it was read before its content came (readiness not_loaded):
 * a longer wait, not the whole page, is the next step; with a waitFor already sent, a longer one. `actions` false on a
 * server that takes none.
 */
export function renderedNotLoadedHint(waitFor?: number, actions = true): string {
  const wait = waitFor !== undefined && waitFor > 0
    ? `it waited ${waitFor} ms (waitFor); raise waitFor (up to ${MAX_WAIT_FOR_MS} ms)`
    : `pass waitFor (up to ${MAX_WAIT_FOR_MS} ms)`
  return `the browser read the page before its main content came; ${wait} when its data loads late, ${actions ? `${ACTIONS_CLAUSE}, ` : ''}or onlyMainContent: false for the page as it stood`
}

/**
 * What hosted Octocrawl says of a page behind a login (ROADMAP, the decision of 2026-11-04): it holds no login state and
 * never takes the person's; the one route is a server on their own computer, with the login saved there.
 */
export const HOSTED_LOGIN_WALL_HINT = 'the page asks for a login; hosted Octocrawl holds no logins and never takes yours; on your computer Octocrawl reads the page as you: npx octocrawl serve, then octocrawl login import <host> (the login stays on your computer), then the scrape in mode authed'

/** What hosted Octocrawl says of a check it does not get past: the routes on the person's own computer, which it has none of. */
export function hostedGateHint(host: string, lanes: readonly string[]): string {
  return `${host} gates automated access on the lanes tried (${lanes.join(', ')}); hosted Octocrawl does not solve challenges or change its identity, and has no proxy, session or handoff of yours; on your computer Octocrawl can hand the page to you in your own Chrome (npx octocrawl serve, then the scrape with handoff: true) or read it with a login you saved there (octocrawl login import <host>, then mode authed)`
}

/** The deadlines a hint names as the most a timeout may be raised to: the engine's, or hosted Octocrawl's two (REST, and the MCP tool's). */
function timeoutCeiling(hosted: boolean): string {
  return hosted ? `up to ${DEFAULT_SCRAPE_TIMEOUT_MS} ms over REST, ${HOSTED_MCP_TIMEOUT_CEILING_MS} ms from an MCP tool` : `up to ${DEFAULT_SCRAPE_TIMEOUT_MS} ms`
}

/** The longest deadline hosted Octocrawl's MCP tools take (packages/mcp HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS), named here so a hosted hint does not ask for more. */
export const HOSTED_MCP_TIMEOUT_CEILING_MS = 180_000

/** The hint a `browser_not_installed` warning carries: the one command that lets the browser lane start, as the warning names it. */
export function browserNotInstalledHint(command = 'npx playwright install chromium'): string {
  return `Chromium is not installed where Octocrawl runs, so the browser lane could not start; run ${command} once, then scrape again`
}
export const BROWSER_NOT_INSTALLED_HINT = browserNotInstalledHint()

/** The hint the installed_chrome rung's `browser_not_installed` warning carries (ADR 0005): it needs Google Chrome itself. */
export const INSTALLED_CHROME_MISSING_HINT = `Google Chrome is not installed where Octocrawl runs, so the installed_chrome rung could not start; ${INSTALLED_CHROME_INSTALL}, then scrape again`

/**
 * The route Octocrawl recommends on the person's own machine for a check the bundled browser met too (ADR 0005, revisions
 * of 2026-10-23 and 2026-10-28: installed_chrome, with compatible_transport since the second), said by a server there
 * whose grant does not name installed_chrome. The person writes the grant, with their own
 * attestation; Octocrawl never does, and the route stays off until they do.
 */
export const INSTALLED_CHROME_RECOMMENDED_HINT = 'installed_chrome with compatible_transport is the enhanced route Octocrawl recommends on your own machine for a check like this, and this server\'s access grant does not name installed_chrome: it reads the page in this machine\'s Google Chrome, in a window it opens (at most 2 at once), and compatible_transport first reads some hosts\' pages over a browser-compatible HTTP transport; to use it, write an access grant of tier enhanced that names installed_chrome and compatible_transport, with your own attestation, start the server with it (octocrawl serve --access-grant <file>, or W2L_ACCESS_GRANT) and send the request again with access: "enhanced"; it was measured on one machine behind one exit, so what it gets past is unknown on yours (https://github.com/77777R7/Octocrawl/blob/main/docs/access.md#the-recommended-route-on-your-own-machine)'

/** The hint a `screenshot_unavailable` warning carries: the page stands, where the error is, and the lighter request. */
export const SCREENSHOT_UNAVAILABLE_HINT = "the screenshot could not be captured, so screenshot is null while the page result stands; the trace's screenshot_failed event names the error; a viewport capture (fullPage false) is the lighter request, and a longer timeout gives a slow page more time"

/** The hint an `empty_selection` warning carries: what a selection leaves out, and what reads it instead. */
export const EMPTY_SELECTION_HINT = 'includeTags selected nothing Markdown can show: scripts, styles, form controls and embedded media are left out of a selection, and so is the page\'s <head>; ask for rawHtml to read those as received, or name elements that hold text'

/** The hint a `redirected_off_page` warning carries: where the site sent the request, and what to do about the page asked for. */
export function offPageHint(result: Pick<HintedResult, 'requestedUrl' | 'evidence'>): string {
  return `${hostOf(result)} answered ${result.evidence.finalUrl} in place of ${result.requestedUrl}, and the content is that page's, not the requested page's; check that the link is still live (the site may have moved or removed the page, or sent an automated request to its home page), and scrape ${result.evidence.finalUrl} on purpose only when it is the page you want`
}

/** The hint a `sign_in_prompt` warning carries: the page came, without what a login shows, and how to get it. */
export const SIGN_IN_PROMPT_HINT = 'the page came without what your login shows: sign in to the site again in that browser, then read this page again'

/** What hosted Octocrawl says of a file it gave no text for: it keeps none, so the file is had on the person's own computer. */
export function hostedFileNotKeptHint(kind: string): string {
  return `the response was a ${kind} file; it has no markdown, and hosted Octocrawl keeps no files; on your computer Octocrawl saves it as received: npx octocrawl scrape <url>`
}

/** The hint a file result carries: what its markdown is, and on a server that keeps files, where the file is. */
export function fileHint(file: NonNullable<FetchResult['file']>, noFiles = false): string {
  const markdown = file.markdownFrom === 'pdf_text' ? 'markdown is its text layer' : file.markdownFrom === 'text' ? 'markdown is its text as received' : 'it has no markdown'
  if (noFiles) return file.markdownFrom === null && file.bytes !== 0 ? hostedFileNotKeptHint(file.kind) : `the response was a ${file.kind} file; ${markdown}`
  const kept = file.path === null ? 'not saved' : `kept at ${file.path}`
  return `the response was a ${file.kind} file ${kept}; ${markdown}`
}

/** Quality events the http lane raises as an offer to the browser lane (see the ladder's QUALITY_ESCALATION_EVENTS). */
const QUALITY_EVENTS: ReadonlySet<string> = new Set(['quality_low_yield', 'quality_client_rendered'])

/** The block reasons that are a gate on automated access, which W2L does not get past. */
const GATES: ReadonlySet<string> = new Set(['cloudflare_challenge', 'captcha', 'bot_detected_generic'])

/** What a hint is read from: the result's verdict, caveats, trace and json issues, and the lanes the run tried. */
export type HintedResult = Pick<FetchResult, 'status' | 'failureReason' | 'blockReason' | 'retryAt' | 'truncated' | 'truncatedAt' | 'warnings' | 'markdown' | 'escalations' | 'trace' | 'lane' | 'requestedUrl' | 'file' | 'json'> & {
  evidence: Pick<Evidence, 'finalUrl' | 'httpStatus'>
}

/** One rung's attempt as the ladder summary records it: enough to say what the http lane got before another lane served the page. */
export interface HintedAttempt {
  channel: string
  result: Pick<FetchResult, 'status' | 'failureReason' | 'blockReason'> & { evidence: Pick<Evidence, 'httpStatus'> }
}

/** The run a hint is read from: the lanes tried, the result, and the summary's attempts when the run has them (a stored step's audit, a scrape's ladder run). */
export type HintedRun = Pick<LadderRunAudit, 'channelsTried'> & Partial<Pick<LadderRunAudit, 'ladderTrace'>> & { result: HintedResult; summary?: { attempts: readonly HintedAttempt[] } }

/** The most hints one result carries; the table's order decides which stay. */
export const MAX_AGENT_HINTS = 5

/**
 * What the answering server can still offer the request beyond the lanes the run tried; the engine decides each. A hint
 * names only a step the server it appears on can take: a hosted one holds no logins, hands no page to the person,
 * takes no actions, reads no access grant and has no proxy or session of theirs, so its hints point to a server on the
 * person's own computer for those.
 */
export interface HintOffers {
  /**
   * The installed_chrome route (ADR 0005, revision of 2026-10-23): true on a server on the person's machine whose grant
   * does not name it, for a request its rung would take. Never on a hosted server.
   */
  installedChrome?: boolean
  /** True on hosted Octocrawl: the hints above the lanes name the routes a server on the person's computer has. */
  hosted?: boolean
  /** True on hosted Octocrawl's own service, which saves no file; a self-hosted hosted server keeps its files. */
  noFiles?: boolean
  /** True where this request can be read in the person's Chrome: a server on their machine, and nothing asked that a page read there cannot give. */
  personChrome?: boolean
  /** True on a server that reads the person's saved logins, which a request personChrome is false for can often still use. */
  savedLogins?: boolean
  /** True when the request has an executeJavascript action: mode authed refuses it, so it goes before a saved login can read the page. */
  scriptAction?: boolean
}

/** A fastMode the scrape's caller pinned, not the person asking (the hosted gate, for a caller without the browser lane). */
export interface FastModePin {
  /** Why the browser lane was closed: said in place of "retry without fastMode", since a retry is pinned the same way. */
  reason: string
  /** The person sent fastMode: false, so the reason is said even when the http lane did not ask for the browser lane. */
  askedOff: boolean
}

/** A pinned scrape's hints: the pin's reason in place of the fastMode hint, kept within the cap in place of the last line when full. */
export function pinnedFastModeHints(hints: readonly string[], pin: FastModePin): readonly string[] {
  if (!pin.askedOff && !hints.includes(FAST_MODE_DECLINED_HINT)) return hints
  const others = hints.filter((line) => line !== FAST_MODE_DECLINED_HINT).slice(0, MAX_AGENT_HINTS - 1)
  return [...others, pin.askedOff ? `fastMode: false was not honoured: ${pin.reason}` : pin.reason]
}

/** The lanes that render a page. */
const BROWSER_LANES: ReadonlySet<string> = new Set(['browser_local', 'browser_local_authed', 'browser_proxy', 'my_browser'])

/**
 * Whether the http lane's result asked for a higher lane: an unresolved hop
 * in `escalations`, or a quality event in its trace.
 */
export function httpLaneAskedForBrowser(result: Pick<FetchResult, 'escalations' | 'trace'>): boolean {
  return result.escalations.some((hop) => hop.improved === null) || result.trace.some((event) => QUALITY_EVENTS.has(event.event))
}

/**
 * The hint of a page behind a login. It says what happened and the routes this server has for this request, each one a
 * step taken as the person, so it asks them first. The site named is the one asked for: a page that sent the browser to
 * a sign-in host stays behind the login of the site it belongs to.
 */
function loginWallHint(run: HintedRun, offers: HintOffers): string {
  const { result } = run
  // A saved login was used and the site refused it: it expired or was signed out.
  const rejected = run.ladderTrace?.find((event) => event.event === 'ladder_session_rejected')
  const site = requestedHost(result)
  if (rejected !== undefined) {
    const domain = String(rejected.detail?.domain ?? site)
    const again = `${site} no longer accepts the saved login for ${domain} (expired or signed out); ask the person to sign in to it again in Chrome, then save it again (import_login ${domain}, or octocrawl login import ${domain}): a running server uses the new one at once`
    return offers.personChrome === true ? `${again}; or, with their yes, read this page in their Chrome now (lane my-browser in mode standard)` : again
  }
  if (offers.hosted === true) return HOSTED_LOGIN_WALL_HINT
  if (result.lane === 'my_browser') return `${site} asks for a login in the person's own Chrome too: ask them to sign in to it there, then read it again`
  const routes = [
    ...(offers.personChrome === true ? ['in the Chrome they are signed in to (lane my-browser in mode standard on a scrape or batch, octocrawl scrape --lane my-browser; they turn on remote debugging at chrome://inspect/#remote-debugging, click Allow there, then Allow reading these sites)'] : []),
    ...(offers.savedLogins === true ? [`with a login they save once (import_login ${site}, or octocrawl login import ${site}, then mode authed on a scrape or batch: no click per page after that)`] : []),
  ]
  if (routes.length === 0) return `the page asks for a login; this server reads no saved login and no Chrome of the person's; on their own computer Octocrawl reads it as them, after asking them (npx octocrawl serve, then lane my-browser, or octocrawl login import ${site} and mode authed)`
  const ask = offers.scriptAction === true ? 'send the request without its executeJavascript action, which mode authed refuses, and ask the person first' : 'ask the person first'
  return `the page asks for a login; Octocrawl does not sign in or create accounts for anyone; ${ask}, naming ${site}, whether to read it ${routes.join(' or ')}`
}

/** The host the request named; the host answered when that cannot be read. */
function requestedHost(result: Pick<HintedResult, 'requestedUrl' | 'evidence'>): string {
  try {
    const host = new URL(result.requestedUrl).hostname
    if (host.length > 0) return host
  } catch {}
  return hostOf(result)
}

/** The host the result is about: the final URL's, else the requested URL's. */
function hostOf(result: Pick<HintedResult, 'requestedUrl' | 'evidence'>): string {
  for (const url of [result.evidence.finalUrl, result.requestedUrl]) {
    try {
      const host = new URL(url).hostname
      if (host.length > 0) return host
    } catch {}
  }
  return 'the host'
}

/**
 * Why the egress policy refused the address, from the http lane's `ssrf_denied`
 * event or the ladder's `governance_refusal`; null for a `policy_denied` that
 * was robots.txt's (robotsHint says that) or carries no such event.
 */
function egressHint(result: HintedResult, host: string): string | null {
  if (result.trace.some((event) => event.event === 'robots_disallowed')) return null
  const denied = result.trace.find((event) => event.event === 'ssrf_denied' || event.event === 'governance_refusal')
  if (denied === undefined) return null
  const why = denied.detail?.error ?? denied.detail?.reason
  return `the egress policy refused ${host}${typeof why === 'string' ? ` (${why})` : ''} and nothing was fetched; Octocrawl reaches public addresses, and a local server the addresses its policy allowlists`
}

/**
 * What the http lane got before a browser lane served the page, when its
 * attempt was blocked or an HTTP error: the ladder's step record, not a
 * guess. Null when the http lane served the page itself, was not tried, or
 * merely found the page thin (the ladder's ordinary escalation).
 */
function laneEscalatedHint(run: HintedRun, host: string): string | null {
  const { result } = run
  if ((result.status !== 'success' && result.status !== 'partial') || !BROWSER_LANES.has(result.lane) || !run.channelsTried.some((channel) => HTTP_CHANNELS.has(channel))) return null
  const http = run.summary?.attempts.find((attempt) => HTTP_CHANNELS.has(attempt.channel))?.result
  if (http === undefined) return null
  const reason = http.status === 'blocked' ? http.blockReason : http.status === 'failed' && http.failureReason === 'http_error' ? 'http_error' : null
  if (reason === null) return null
  const status = http.evidence.httpStatus === null ? '' : ` (HTTP ${http.evidence.httpStatus})`
  return `the http lane got ${http.status}/${reason}${status} from ${host} and the local browser lane served the page; expect other pages of ${host} to need the browser lane too`
}

/** The required fields the json extraction found no source for, and a model fallback that was asked for and did not run; nothing for a complete result. */
function jsonHints(result: HintedResult, hosted: boolean): string[] {
  const json = result.json
  if (json === undefined || json === null || json.status === 'complete') return []
  const hints: string[] = []
  const missing = json.issues.filter((issue) => issue.code === 'missing_required').map((issue) => issue.path ?? 'a field')
  // The model is the operator's on a local server (its env), and hosted Octocrawl's own on hosted (an account, 2 credits more a page).
  const fallback = hosted ? 'modelFallback: true asks hosted Octocrawl\'s model to fill what the page does not state, for an account at 2 credits more a page, when the model is switched on' : 'modelFallback fills what the page does not state when the server has W2L_EXTRACT_BASE_URL and W2L_EXTRACT_MODEL'
  if (missing.length > 0) hints.push(`json is incomplete: the required ${missing.length === 1 ? 'field' : 'fields'} ${missing.join(', ')} ${missing.length === 1 ? 'was' : 'were'} not found on the page; ${fallback}`)
  const unavailable = json.issues.find((issue) => issue.code === 'model_unavailable')
  if (unavailable !== undefined) hints.push(`the json model fallback did not run: ${unavailable.message}`)
  return hints
}

/** The robots.txt rule the lane applied, from its `robots_disallowed` event, or why it could not read the file. */
function robotsHint(result: HintedResult, host: string): string | null {
  const disallowed = result.trace.find((event) => event.event === 'robots_disallowed')
  if (disallowed === undefined) return null
  const detail = disallowed.detail ?? {}
  if (typeof detail.unreachable === 'string') {
    return `robots.txt of ${host} could not be read (${detail.unreachable}), which counts as a complete disallow; Octocrawl asks for it again after ${detail.unreachable === 'server_error' ? 'five minutes' : 'half a minute'}. ${ROBOTS_ROUTE}`
  }
  const rules = (Array.isArray(detail.appliedRules) ? detail.appliedRules : [])
    .filter((rule): rule is { pattern: string; allow: boolean } => rule !== null && typeof rule === 'object' && typeof (rule as { pattern?: unknown }).pattern === 'string')
    .filter((rule) => rule.allow === false)
    .map((rule) => rule.pattern)
  const group = result.trace.find((event) => event.event === 'robots_checked')?.detail?.matchedGroup
  if (typeof group === 'string' && isOctocrawlRobotsGroup(group)) {
    return `robots.txt of ${host} disallows this URL for Octocrawl by name (User-agent: ${group}; rule ${rules.length === 0 ? 'unknown' : rules.join(', ')}): the site owner's opt-out, which a named URL and ignoreRobotsTxt do not set aside; only a robotsOverride with your recorded reason does, on a local server`
  }
  return `robots.txt of ${host} disallows this URL for Octocrawl's identity (rule ${rules.length === 0 ? 'unknown' : rules.join(', ')}). ${ROBOTS_ROUTE}`
}

/**
 * What the http lane learned about a name that did not resolve, from its `dns_twin_checked` event: whether the www/apex
 * twin resolves, and then the URL to send; null for a dns_error whose lane checked no twin.
 */
function dnsHint(result: HintedResult, host: string): string | null {
  const checked = result.trace.find((event) => event.event === 'dns_twin_checked')
  if (checked === undefined) return null
  const detail = checked.detail ?? {}
  const failed = typeof detail.host === 'string' ? detail.host : host
  const twin = typeof detail.twin === 'string' ? detail.twin : 'its www/apex twin'
  switch (detail.outcome) {
    case 'resolves': return `${failed} does not resolve; ${twin} does; send ${typeof detail.to === 'string' ? detail.to : 'the URL on that host'} instead (this result stays the record of the URL asked for, which was not fetched)`
    // ENOTFOUND is the name's own answer; any other resolver failure (EAI_AGAIN, SERVFAIL) may be the resolver's.
    case 'unresolved': return typeof detail.error === 'string' && !detail.error.includes('ENOTFOUND')
      ? `${failed} does not resolve, and neither does ${twin} (${detail.error}); check the domain, or the resolver where Octocrawl runs`
      : `${failed} does not resolve, and neither does ${twin}; check the domain`
    case 'denied': return `${failed} does not resolve; ${twin} resolves to an address the egress policy refuses${typeof detail.error === 'string' ? ` (${detail.error})` : ''}`
    case 'timeout': return `${failed} does not resolve; whether ${twin} does was not learned within ${typeof detail.timeoutMs === 'number' ? detail.timeoutMs : 'the check\'s'} ms`
    default: return null
  }
}

/** Where robots.txt is set aside, on the record: a robots refusal now comes from a crawl's or map's link, a Monitor, or a hosted server. */
const ROBOTS_ROUTE = 'A local Octocrawl server fetches a URL a scrape or batch names whatever robots.txt says, and a crawl or map started there with ignoreRobotsTxt fetches the links it disallows, each on the record; a hosted server obeys robots.txt for every URL'

/**
 * The hints of one scrape, in the order they apply; empty when there is
 * nothing to say. A pure function of the result, the request and what the
 * server offers it: the same result gives the same hints on the full and
 * compact responses, on batch items and crawl pages, and in the scrape record.
 */
export function agentHintsFor(req: Pick<ScrapeRequest, 'fastMode' | 'waitFor'>, run: HintedRun, offers: HintOffers = {}): string[] {
  const { result } = run
  const hints: string[] = []
  const host = hostOf(result)
  if (result.status === 'failed' && result.failureReason === 'policy_denied') {
    const hint = result.trace.some((event) => event.event === 'wait_for_unavailable') ? WAIT_FOR_UNAVAILABLE_HINT : robotsHint(result, host) ?? egressHint(result, host)
    if (hint !== null) hints.push(hint)
  }
  if (result.status === 'failed' && result.failureReason === 'dns_error') {
    const hint = dnsHint(result, host)
    if (hint !== null) hints.push(hint)
  }
  if (result.status === 'failed' && result.failureReason === 'cache_miss') {
    hints.push('lockdown answers from stored results only and none of this page fits the request (same options, within maxAge and minAge); send it without lockdown to fetch the page')
  }
  const hosted = offers.hosted === true
  if (result.status === 'blocked' && result.blockReason === 'login_wall') hints.push(loginWallHint(run, offers))
  if (result.status === 'blocked' && result.blockReason !== null && GATES.has(result.blockReason)) {
    hints.push(hosted ? hostedGateHint(host, run.channelsTried) : `${host} gates automated access on the lanes tried (${run.channelsTried.join(', ')}); Octocrawl does not solve challenges or change its identity unless this server's access grant names a provider that does (--access-grant, ADR 0005); a proxy or session you own is the supported route, or, on your own machine, getting through the check yourself in your own Chrome: handoff: true on a scrape (octocrawl scrape --handoff), or a batch handoff (octocrawl batch --handoff, POST /v1/batches/:id/handoff)`)
    // The bundled browser met the check too: the rung after it, on the person's machine, is their installed Chrome; a run
    // that already tried it (a stored page read before the server's grant changed) is not told to try it.
    if (offers.installedChrome === true && run.channelsTried.includes('browser_local') && !run.channelsTried.includes('installed_chrome')) hints.push(INSTALLED_CHROME_RECOMMENDED_HINT)
  }
  const escalated = laneEscalatedHint(run, host)
  if (escalated !== null) hints.push(escalated)
  if (result.status === 'failed' && result.failureReason === 'tls_error') {
    hints.push(`the certificate of ${host} did not verify and Octocrawl keeps verification on; a local server takes skipTlsVerification for one request, recorded in the trace and a tls_unverified warning, and a hosted server refuses it`)
  }
  if (result.status === 'failed' && result.failureReason === 'timeout') {
    hints.push(`no lane answered within the request's deadline; raise timeout (${timeoutCeiling(hosted)})`)
  }
  if (result.status === 'partial') {
    hints.push(`the result is partial: the deadline passed with this much of the page read; raise timeout (${timeoutCeiling(hosted)}) for the rest`)
  }
  // The site answered another page in place of the one asked for: the content is real, and it is not the requested page's.
  if (result.warnings?.some((warning) => warning.code === 'redirected_off_page')) hints.push(offPageHint(result))
  if (result.warnings?.some((warning) => warning.code === 'sign_in_prompt')) hints.push(SIGN_IN_PROMPT_HINT)
  // The selection holds nothing to read: the answer stays a success, and what was left out of it is named.
  if (result.warnings?.some((warning) => warning.code === 'empty_selection')) hints.push(EMPTY_SELECTION_HINT)
  if (result.retryAt !== undefined) {
    hints.push(`wait until ${new Date(result.retryAt).toISOString()} before asking ${host} again`)
  } else if (result.status === 'blocked' && result.blockReason === 'rate_limit') {
    hints.push(`${host} answered with a rate limit and named no Retry-After; wait before asking it again`)
  }
  if (result.truncated) {
    hints.push(`the content was cut at character ${result.truncatedAt ?? 'unknown'}; ask for rawHtml or a narrower includeTags`)
  }
  // Under fastMode the one hint below says what was declined; otherwise the page's caveat says whether the browser lane had its turn.
  const fastModeDeclined = req.fastMode === true && result.lane === 'http' && httpLaneAskedForBrowser(result)
  // A browser lane that could not start (no browser installed) was not tried in any sense that matters to the caller.
  const missingWarnings = result.warnings?.filter((warning) => warning.code === 'browser_not_installed') ?? []
  // The installed_chrome rung's (ADR 0005) is its own: the browser lane before it may well have run.
  const chromeMissing = missingWarnings.some((warning) => warning.message.startsWith('the installed_chrome rung'))
  const missingWarning = missingWarnings.find((warning) => !warning.message.startsWith('the installed_chrome rung'))
  const browserMissing = missingWarning !== undefined
  if (missingWarning !== undefined) hints.push(browserNotInstalledHint(/run (npx [\w@.-]+ install chromium)/.exec(missingWarning.message)?.[1]))
  if (chromeMissing) hints.push(INSTALLED_CHROME_MISSING_HINT)
  const browserTried = !browserMissing && run.channelsTried.some((channel) => !HTTP_CHANNELS.has(channel))
  if (!fastModeDeclined && result.warnings?.some((warning) => warning.code === 'client_rendered_suspected')) {
    hints.push(`the page fills its data with JavaScript; the browser lane ${browserTried ? 'was tried' : browserMissing ? 'could not start' : 'was not tried'}`)
  }
  // A thin http answer the browser lane did not improve on, or could not be offered to; or a thin rendered answer.
  if (!fastModeDeclined && result.warnings?.some((warning) => warning.code === 'low_content_yield')) hints.push(result.lane === 'http' ? lowContentYieldHint(browserTried, !hosted) : renderedLowYieldHint(!hosted))
  if (fastModeDeclined) hints.push(FAST_MODE_DECLINED_HINT)
  // The browser lane rendered the page but could not capture the screenshot asked for.
  if (result.warnings?.some((warning) => warning.code === 'screenshot_unavailable')) hints.push(SCREENSHOT_UNAVAILABLE_HINT)
  // A page with no main content, when no shell or thin-content caveat already says what it is.
  const shellHinted = result.warnings?.some((warning) => warning.code === 'client_rendered_suspected' || warning.code === 'low_content_yield') === true
  if (result.status === 'failed' && result.failureReason === 'empty_unverified' && !shellHinted && !fastModeDeclined) {
    if (result.file?.kind === 'pdf') hints.push('the PDF has no text layer, and Octocrawl runs no OCR')
    else if (result.file === undefined && renderedBeforeContent(result)) hints.push(renderedNotLoadedHint(req.waitFor, !hosted))
    else if (result.file === undefined) hints.push('Octocrawl found no main content on the page; onlyMainContent: false returns the whole page\'s Markdown as content, and includeTags names the elements to read instead')
  }
  if (result.status === 'failed' && result.failureReason === 'http_error') {
    const status = result.evidence.httpStatus
    if (result.markdown !== null) hints.push(`the server answered ${status ?? 'an error status'}; the markdown is that error page, not the requested page${status === 404 ? '; check the link' : ''}`)
    else if (status === 404) hints.push('the server answered 404; check the link')
  }
  hints.push(...jsonHints(result, hosted))
  if (result.file !== undefined) hints.push(fileHint(result.file, offers.noFiles === true))
  return hints.slice(0, MAX_AGENT_HINTS)
}

/**
 * Whether a page the local browser rendered with no main content was read before its content came, as its readiness reads it (ADR 0007):
 * a wait that ended with the page still loading, or little visible text (the lane's `extract` event); unless the browser's
 * wait for main content saw the page done, nothing on the way and the page still (`content_wait` settled).
 */
function renderedBeforeContent(result: HintedResult): boolean {
  // Only the local browser lane's rungs (browser_local, installed_chrome, hosted_chrome) take waitFor; the person's own
  // Chrome (my-browser, a handoff) and a provider do not, and the whole-page sentence below holds for them.
  if (result.lane !== 'browser_local') return false
  if (result.trace.some((event) => event.event === 'content_wait' && event.detail?.ended === 'settled')) return false
  if (result.trace.some((event) => (event.event === 'loading_wait' && event.detail?.cleared === false) || (event.event === 'wait_for' && event.detail?.cutShortBy !== undefined))) return true
  const extract = [...result.trace].reverse().find((event) => event.event === 'extract')
  const text = extract?.detail?.textChars
  return typeof text === 'number' && text <= SHELL_TEXT_MAX
}

/**
 * The hints of one map: from its warnings, a deadline that cut it (a larger
 * timeout, up to this server's cap, or a lower limit), and a start page the
 * http lane found filled by script (a scrape of it with the links format,
 * which the browser lane renders); from its refusals, the URLs the start
 * path's subtree kept out (the site root, or crawlEntireDomain), a scope rule
 * a caller may not expect. Other refusals (other hosts, the caller's own
 * filters, robots.txt) are counted in the answer and not hinted. Empty when
 * none applies.
 */
export function mapAgentHints(response: Pick<MapResponse, 'url' | 'warnings' | 'refused'>, maxTimeoutMs: number): string[] {
  const hints: string[] = []
  if (response.warnings.some((warning) => warning.code === 'map_timeout')) {
    hints.push(`the map's deadline cut it before every source was read; raise timeout (up to ${maxTimeoutMs} ms on this server) or lower limit for a complete list`)
  }
  if (response.warnings.some((warning) => warning.code === 'start_page_client_rendered')) {
    hints.push(`the start page fills its links with script; scrape ${response.url} with formats ['links'] (the browser lane renders it) for the rendered page's links`)
  }
  const subtreeDenied = response.refused.subtreeDenied
  if (subtreeDenied > 0) {
    let start: URL | null = null
    try { start = new URL(response.url) } catch {}
    const where = start === null ? '' : ` (${start.pathname})`
    const root = start === null ? 'the site root' : `${start.origin}/`
    hints.push(`${subtreeDenied} ${subtreeDenied === 1 ? 'URL found was' : 'URLs found were'} outside the start URL's path subtree${where} and ${subtreeDenied === 1 ? 'is' : 'are'} not listed; map ${root} or pass crawlEntireDomain: true for the whole host`)
  }
  return hints
}
