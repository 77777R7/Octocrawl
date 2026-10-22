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

/** The hint a `fastMode` scrape carries when the http lane asked for the browser lane it was denied. */
export const FAST_MODE_DECLINED_HINT = 'the http lane asked for the browser lane; fastMode declined it; retry without fastMode'

/** The hint a `low_content_yield` warning carries: what to change so the browser lane gets a better chance. */
export function lowContentYieldHint(browserTried: boolean): string {
  return `the http lane's content was thin and the browser lane ${browserTried ? 'did not improve it' : 'was not available'}; pass waitFor (up to ${MAX_WAIT_FOR_MS} ms) or a longer timeout with the browser lane available, or actions (a click, a scroll, a wait for a selector) when the data appears after an interaction`
}

/** The hint a `low_content_yield` warning on a rendered answer carries: the page was rendered and still held little. */
export const RENDERED_LOW_YIELD_HINT = `the rendered page's main content was thin and the extraction unsure of it; pass waitFor (up to ${MAX_WAIT_FOR_MS} ms) when its data loads late, actions (a click, a scroll, a wait for a selector) when it appears after an interaction, or onlyMainContent: false for the whole page`

/** The hint a `browser_not_installed` warning carries: the one command that lets the browser lane start, as the warning names it. */
export function browserNotInstalledHint(command = 'npx playwright install chromium'): string {
  return `Chromium is not installed where Octocrawl runs, so the browser lane could not start; run ${command} once, then scrape again`
}
export const BROWSER_NOT_INSTALLED_HINT = browserNotInstalledHint()

/** The hint the installed_chrome rung's `browser_not_installed` warning carries (ADR 0005): it needs Google Chrome itself. */
export const INSTALLED_CHROME_MISSING_HINT = `Google Chrome is not installed where Octocrawl runs, so the installed_chrome rung could not start; ${INSTALLED_CHROME_INSTALL}, then scrape again`

/**
 * The route Octocrawl recommends on the person's own machine for a check the bundled browser met too (ADR 0005, revision
 * of 2026-10-23), said by a server there whose grant does not name it. The person writes the grant, with their own
 * attestation; Octocrawl never does, and the route stays off until they do.
 */
export const INSTALLED_CHROME_RECOMMENDED_HINT = 'installed_chrome is the enhanced route Octocrawl recommends on your own machine for a check like this, and this server\'s access grant does not name it: it reads the page in this machine\'s Google Chrome, in a window it opens (at most 2 at once); to use it, write an access grant of tier enhanced that names installed_chrome, with your own attestation, start the server with it (octocrawl serve --access-grant <file>, or W2L_ACCESS_GRANT) and send the request again with access: "enhanced"; it was measured on one machine behind one exit, so what it gets past is unknown on yours (https://github.com/77777R7/Octocrawl/blob/main/docs/access.md#the-recommended-route-on-your-own-machine)'

/** The hint a `screenshot_unavailable` warning carries: the page stands, where the error is, and the lighter request. */
export const SCREENSHOT_UNAVAILABLE_HINT = "the screenshot could not be captured, so screenshot is null while the page result stands; the trace's screenshot_failed event names the error; a viewport capture (fullPage false) is the lighter request, and a longer timeout gives a slow page more time"

/** The hint a file result carries: what its markdown is. */
export function fileHint(file: NonNullable<FetchResult['file']>): string {
  const kept = file.path === null ? 'not saved' : `kept at ${file.path}`
  const markdown = file.markdownFrom === 'pdf_text' ? 'markdown is its text layer' : file.markdownFrom === 'text' ? 'markdown is its text as received' : 'it has no markdown'
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

/** What the answering server can still offer the request beyond the lanes the run tried; the engine decides each. */
export interface HintOffers {
  /**
   * The installed_chrome route (ADR 0005, revision of 2026-10-23): true on a server on the person's machine whose grant
   * does not name it, for a request its rung would take. Never on a hosted server.
   */
  installedChrome?: boolean
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

/** The host the result is about: the final URL's, else the requested URL's. */
function hostOf(result: HintedResult): string {
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
function jsonHints(result: HintedResult): string[] {
  const json = result.json
  if (json === undefined || json === null || json.status === 'complete') return []
  const hints: string[] = []
  const missing = json.issues.filter((issue) => issue.code === 'missing_required').map((issue) => issue.path ?? 'a field')
  if (missing.length > 0) hints.push(`json is incomplete: the required ${missing.length === 1 ? 'field' : 'fields'} ${missing.join(', ')} ${missing.length === 1 ? 'was' : 'were'} not found on the page; modelFallback fills what the page does not state when the server has W2L_EXTRACT_BASE_URL and W2L_EXTRACT_MODEL`)
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
    return `robots.txt of ${host} could not be read (${detail.unreachable}), which counts as a complete disallow; Octocrawl asks for it again after five minutes. ${ROBOTS_ROUTE}`
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

/** Where robots.txt is set aside, on the record: a robots refusal now comes from a crawl's or map's link, a Monitor, or a hosted server. */
const ROBOTS_ROUTE = 'A local Octocrawl server fetches a URL a scrape or batch names whatever robots.txt says, and a crawl or map started there with ignoreRobotsTxt fetches the links it disallows, each on the record; a hosted server obeys robots.txt for every URL'

/**
 * The hints of one scrape, in the order they apply; empty when there is
 * nothing to say. A pure function of the result, the request and what the
 * server offers it: the same result gives the same hints on the full and
 * compact responses, on batch items and crawl pages, and in the scrape record.
 */
export function agentHintsFor(req: Pick<ScrapeRequest, 'fastMode'>, run: HintedRun, offers: HintOffers = {}): string[] {
  const { result } = run
  const hints: string[] = []
  const host = hostOf(result)
  if (result.status === 'failed' && result.failureReason === 'policy_denied') {
    const hint = robotsHint(result, host) ?? egressHint(result, host)
    if (hint !== null) hints.push(hint)
  }
  if (result.status === 'failed' && result.failureReason === 'cache_miss') {
    hints.push('lockdown answers from stored results only and none of this page fits the request (same options, within maxAge and minAge); send it without lockdown to fetch the page')
  }
  if (result.status === 'blocked' && result.blockReason === 'login_wall') {
    // A saved login was used and the site refused it: it expired or was signed out.
    const rejected = run.ladderTrace?.find((event) => event.event === 'ladder_session_rejected')
    hints.push(rejected === undefined
      ? 'the page asks for a login; Octocrawl does not create accounts; use mode authed with your own session'
      : `${host} refused your saved login for ${String(rejected.detail?.domain ?? host)} (expired or signed out); sign in to it again in Chrome and run octocrawl login import ${String(rejected.detail?.domain ?? host)}`)
  }
  if (result.status === 'blocked' && result.blockReason !== null && GATES.has(result.blockReason)) {
    hints.push(`${host} gates automated access on the lanes tried (${run.channelsTried.join(', ')}); Octocrawl does not solve challenges or change its identity unless this server's access grant names a provider that does (--access-grant, ADR 0005); a proxy or session you own is the supported route, or, on your own machine, getting through the check yourself in your own Chrome: handoff: true on a scrape (octocrawl scrape --handoff), or a batch handoff (octocrawl batch --handoff, POST /v1/batches/:id/handoff)`)
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
    hints.push(`no lane answered within the request's deadline; raise timeout (up to ${DEFAULT_SCRAPE_TIMEOUT_MS} ms)`)
  }
  if (result.status === 'partial') {
    hints.push(`the result is partial: the deadline passed with this much of the page read; raise timeout (up to ${DEFAULT_SCRAPE_TIMEOUT_MS} ms) for the rest`)
  }
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
  if (!fastModeDeclined && result.warnings?.some((warning) => warning.code === 'low_content_yield')) hints.push(result.lane === 'http' ? lowContentYieldHint(browserTried) : RENDERED_LOW_YIELD_HINT)
  if (fastModeDeclined) hints.push(FAST_MODE_DECLINED_HINT)
  // The browser lane rendered the page but could not capture the screenshot asked for.
  if (result.warnings?.some((warning) => warning.code === 'screenshot_unavailable')) hints.push(SCREENSHOT_UNAVAILABLE_HINT)
  // A page with no main content, when no shell or thin-content caveat already says what it is.
  const shellHinted = result.warnings?.some((warning) => warning.code === 'client_rendered_suspected' || warning.code === 'low_content_yield') === true
  if (result.status === 'failed' && result.failureReason === 'empty_unverified' && !shellHinted && !fastModeDeclined) {
    if (result.file?.kind === 'pdf') hints.push('the PDF has no text layer, and Octocrawl runs no OCR')
    else if (result.file === undefined) hints.push('Octocrawl found no main content on the page; onlyMainContent: false returns the whole page\'s Markdown as content, and includeTags names the elements to read instead')
  }
  if (result.status === 'failed' && result.failureReason === 'http_error') {
    const status = result.evidence.httpStatus
    if (result.markdown !== null) hints.push(`the server answered ${status ?? 'an error status'}; the markdown is that error page, not the requested page${status === 404 ? '; check the link' : ''}`)
    else if (status === 404) hints.push('the server answered 404; check the link')
  }
  hints.push(...jsonHints(result))
  if (result.file !== undefined) hints.push(fileHint(result.file))
  return hints.slice(0, MAX_AGENT_HINTS)
}

/**
 * The hints of one map, from its warnings: a deadline that cut it (a larger
 * timeout, up to this server's cap, or a lower limit), and a start page the
 * http lane found filled by script (a scrape of it with the links format,
 * which the browser lane renders). Empty when neither applies.
 */
export function mapAgentHints(response: Pick<MapResponse, 'url' | 'warnings'>, maxTimeoutMs: number): string[] {
  const hints: string[] = []
  if (response.warnings.some((warning) => warning.code === 'map_timeout')) {
    hints.push(`the map's deadline cut it before every source was read; raise timeout (up to ${maxTimeoutMs} ms on this server) or lower limit for a complete list`)
  }
  if (response.warnings.some((warning) => warning.code === 'start_page_client_rendered')) {
    hints.push(`the start page fills its links with script; scrape ${response.url} with formats ['links'] (the browser lane renders it) for the rendered page's links`)
  }
  return hints
}
