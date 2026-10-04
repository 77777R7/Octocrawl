/**
 * Agent hints: what a scrape response says about the request itself, in one
 * sentence each, so an agent reading the result knows the next honest step:
 * a recorded override, a session of its own, a wait, a request without
 * fastMode, a lighter screenshot. Not a status and not a warning about the page: a hint is about
 * the request. It never quotes page text, only a host name, a status code,
 * a rule or a time, and it never points around a refusal. Present on a
 * response (`agentHints`) only when there is one.
 */

import { DEFAULT_SCRAPE_TIMEOUT_MS, MAX_WAIT_FOR_MS, type Evidence, type FetchResult, type LadderRunAudit, type MapResponse, type ScrapeRequest } from '@w2l/contracts'

/** The hint a `fastMode` scrape carries when the http lane asked for the browser lane it was denied. */
export const FAST_MODE_DECLINED_HINT = 'the http lane asked for the browser lane; fastMode declined it; retry without fastMode'

/** The hint a `low_content_yield` warning carries: what to change so the browser lane gets a better chance. */
export function lowContentYieldHint(browserTried: boolean): string {
  return `the http lane's content was thin and the browser lane ${browserTried ? 'did not improve it' : 'was not available'}; pass waitFor (up to ${MAX_WAIT_FOR_MS} ms) or a longer timeout with the browser lane available, or actions (a click, a scroll, a wait for a selector) when the data appears after an interaction`
}

/** The hint a `low_content_yield` warning on a rendered answer carries: the page was rendered and still held little. */
export const RENDERED_LOW_YIELD_HINT = `the rendered page's main content was thin and the extraction unsure of it; pass waitFor (up to ${MAX_WAIT_FOR_MS} ms) when its data loads late, actions (a click, a scroll, a wait for a selector) when it appears after an interaction, or onlyMainContent: false for the whole page`

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

/** The lanes that render a page. */
const BROWSER_LANES: ReadonlySet<string> = new Set(['browser_local', 'browser_local_authed', 'browser_proxy'])

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
  return `the egress policy refused ${host}${typeof why === 'string' ? ` (${why})` : ''} and nothing was fetched; W2L reaches public addresses, and a local server the addresses its policy allowlists`
}

/**
 * What the http lane got before a browser lane served the page, when its
 * attempt was blocked or an HTTP error: the ladder's step record, not a
 * guess. Null when the http lane served the page itself, was not tried, or
 * merely found the page thin (the ladder's ordinary escalation).
 */
function laneEscalatedHint(run: HintedRun, host: string): string | null {
  const { result } = run
  if ((result.status !== 'success' && result.status !== 'partial') || !BROWSER_LANES.has(result.lane) || !run.channelsTried.includes('http')) return null
  const http = run.summary?.attempts.find((attempt) => attempt.channel === 'http')?.result
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
    return `robots.txt of ${host} could not be read (${detail.unreachable}), which counts as a complete disallow; W2L asks for it again after five minutes, and a robotsOverride does not set that aside`
  }
  const rules = (Array.isArray(detail.appliedRules) ? detail.appliedRules : [])
    .filter((rule): rule is { pattern: string; allow: boolean } => rule !== null && typeof rule === 'object' && typeof (rule as { pattern?: unknown }).pattern === 'string')
    .filter((rule) => rule.allow === false)
    .map((rule) => rule.pattern)
  return `robots.txt of ${host} disallows this URL for W2L's identity (rule ${rules.length === 0 ? 'unknown' : rules.join(', ')}); a robotsOverride with a recorded reason fetches it on the record`
}

/**
 * The hints of one scrape, in the order they apply; empty when there is
 * nothing to say. A pure function of the result and the request: the same
 * result gives the same hints on the full and compact responses, on batch
 * items and crawl pages, and in the scrape record.
 */
export function agentHintsFor(req: Pick<ScrapeRequest, 'fastMode'>, run: HintedRun): string[] {
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
      ? 'the page asks for a login; W2L does not create accounts; use mode authed with your own session'
      : `${host} refused your saved login for ${String(rejected.detail?.domain ?? host)} (expired or signed out); sign in to it again in Chrome and run w2l login import ${String(rejected.detail?.domain ?? host)}`)
  }
  if (result.status === 'blocked' && result.blockReason !== null && GATES.has(result.blockReason)) {
    hints.push(`${host} gates automated access on the lanes tried (${run.channelsTried.join(', ')}); W2L does not solve challenges or change its identity; a proxy or session you own is the supported route, or, on your own machine, getting through the check yourself in your own Chrome: handoff: true on a scrape (w2l scrape --handoff), or a batch handoff (w2l batch --handoff, POST /v1/batches/:id/handoff)`)
  }
  const escalated = laneEscalatedHint(run, host)
  if (escalated !== null) hints.push(escalated)
  if (result.status === 'failed' && result.failureReason === 'tls_error') {
    hints.push(`the certificate of ${host} did not verify and W2L keeps verification on; a local server takes skipTlsVerification for one request, recorded in the trace and a tls_unverified warning, and a hosted server refuses it`)
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
  const browserTried = run.channelsTried.some((channel) => channel !== 'http')
  if (!fastModeDeclined && result.warnings?.some((warning) => warning.code === 'client_rendered_suspected')) {
    hints.push(`the page fills its data with JavaScript; the browser lane ${browserTried ? 'was tried' : 'was not tried'}`)
  }
  // A thin http answer the browser lane did not improve on, or could not be offered to; or a thin rendered answer.
  if (!fastModeDeclined && result.warnings?.some((warning) => warning.code === 'low_content_yield')) hints.push(result.lane === 'http' ? lowContentYieldHint(browserTried) : RENDERED_LOW_YIELD_HINT)
  if (fastModeDeclined) hints.push(FAST_MODE_DECLINED_HINT)
  // The browser lane rendered the page but could not capture the screenshot asked for.
  if (result.warnings?.some((warning) => warning.code === 'screenshot_unavailable')) hints.push(SCREENSHOT_UNAVAILABLE_HINT)
  // A page with no main content, when no shell or thin-content caveat already says what it is.
  const shellHinted = result.warnings?.some((warning) => warning.code === 'client_rendered_suspected' || warning.code === 'low_content_yield') === true
  if (result.status === 'failed' && result.failureReason === 'empty_unverified' && !shellHinted && !fastModeDeclined) {
    if (result.file?.kind === 'pdf') hints.push('the PDF has no text layer, and W2L runs no OCR')
    else if (result.file === undefined) hints.push('W2L found no main content on the page; onlyMainContent: false returns the whole page\'s Markdown as content, and includeTags names the elements to read instead')
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
