/**
 * Agent hints: what a scrape response says about the request itself, in one
 * sentence each, so an agent reading the result knows the next honest step:
 * a recorded override, a session of its own, a wait, a request without
 * fastMode. Not a status and not a warning about the page: a hint is about
 * the request. It never quotes page text, only a host name, a status code,
 * a rule or a time, and it never points around a refusal. Present on a
 * response (`agentHints`) only when there is one.
 */

import type { Evidence, FetchResult, LadderRunAudit, ScrapeRequest } from '@w2l/contracts'

/** The hint a `fastMode` scrape carries when the http lane asked for the browser lane it was denied. */
export const FAST_MODE_DECLINED_HINT = 'the http lane asked for the browser lane; fastMode declined it; retry without fastMode'

/** Quality events the http lane raises as an offer to the browser lane (see the ladder's QUALITY_ESCALATION_EVENTS). */
const QUALITY_EVENTS: ReadonlySet<string> = new Set(['quality_low_yield', 'quality_client_rendered'])

/** The block reasons that are a gate on automated access, which W2L does not get past. */
const GATES: ReadonlySet<string> = new Set(['cloudflare_challenge', 'captcha', 'bot_detected_generic'])

/** What a hint is read from: the result's verdict, caveats and trace, and the lanes the run tried. */
export type HintedResult = Pick<FetchResult, 'status' | 'failureReason' | 'blockReason' | 'retryAt' | 'truncated' | 'truncatedAt' | 'warnings' | 'markdown' | 'escalations' | 'trace' | 'lane' | 'requestedUrl'> & {
  evidence: Pick<Evidence, 'finalUrl' | 'httpStatus'>
}

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
export function agentHintsFor(req: Pick<ScrapeRequest, 'fastMode'>, run: Pick<LadderRunAudit, 'channelsTried'> & { result: HintedResult }): string[] {
  const { result } = run
  const hints: string[] = []
  const host = hostOf(result)
  if (result.status === 'failed' && result.failureReason === 'policy_denied') {
    const hint = robotsHint(result, host)
    if (hint !== null) hints.push(hint)
  }
  if (result.status === 'blocked' && result.blockReason === 'login_wall') {
    hints.push('the page asks for a login; W2L does not create accounts; use mode authed with your own session')
  }
  if (result.status === 'blocked' && result.blockReason !== null && GATES.has(result.blockReason)) {
    hints.push(`${host} gates automated access on the lanes tried (${run.channelsTried.join(', ')}); W2L does not solve challenges or change its identity; a proxy or session you own is the supported route`)
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
  if (!fastModeDeclined && result.warnings?.some((warning) => warning.code === 'client_rendered_suspected')) {
    const browserTried = run.channelsTried.some((channel) => channel !== 'http')
    hints.push(`the page fills its data with JavaScript; the browser lane ${browserTried ? 'was tried' : 'was not tried'}`)
  }
  if (fastModeDeclined) hints.push(FAST_MODE_DECLINED_HINT)
  if (result.status === 'failed' && result.failureReason === 'http_error' && result.markdown !== null) {
    hints.push(`the server answered ${result.evidence.httpStatus ?? 'an error status'}; the markdown is that error page, not the requested page`)
  }
  return hints
}
