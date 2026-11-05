/**
 * An https:// URL of a site with no working HTTPS. Sites that never took it up are still listed under https:// by the
 * people and agents who copy their addresses: of the 9 URLs hosted Octocrawl could not read on 2026-11-04, three failed
 * this way, and www.micromedica.it read at once over http://. So a page whose first request found no HTTPS at the site is
 * asked for once more over http, under the same deadline and that origin's robots.txt, and the result says so.
 *
 * It is a downgrade, so the rule is a list of what proves there is no HTTPS, not a list of what to leave out: the port
 * refused or reset the connection, or spoke something that is not TLS. Every other failure keeps its answer: a certificate
 * that did not verify (a site that does speak TLS, and the failure an attacker would stage), a timeout, a failure after a
 * redirect, anything from a site that answered. The engine turns it on only where no proxy stands between it and the site,
 * as a refusal then says nothing of the site. Nothing a caller meant for an encrypted connection goes out in the clear:
 * no headers of theirs, no cookies, no login, no page actions, nothing in a query string, no credentials in the URL.
 */
import type { ExecutionContext, FetchOptions, FetchResult, FetchWarning, TraceEvent } from '@w2l/contracts'
import type { LadderRunResult } from './ladder.js'

export const HTTPS_UNAVAILABLE = 'https_unavailable'
const READ_STATUSES: ReadonlySet<string> = new Set(['success', 'partial', 'empty_verified'])
/** What says the port has no HTTPS. `ERR_SSL_WRONG_VERSION_NUMBER`: a plain server answered the handshake. */
const NO_HTTPS_CODES: ReadonlySet<string> = new Set(['ECONNREFUSED', 'ECONNRESET', 'ERR_SSL_WRONG_VERSION_NUMBER'])

const provenNoHttps = (event: TraceEvent): boolean => typeof event.detail?.code === 'string' && NO_HTTPS_CODES.has(event.detail.code)

/** The code that proves it, from the run's first rung: its first request, the page's or robots.txt's, failed that way. */
function noHttpsCode(url: string, result: FetchResult): string | null {
  const firstRequest = result.evidence.finalUrl === url && result.evidence.redirectChain.length <= 1
  if (!firstRequest) return null
  const events = result.trace.filter((event) => (event.event === 'robots_disallowed' && event.detail?.unreachable === 'network_error')
    || (event.event === 'request_failed' && (event.detail?.reason === 'connection_error' || event.detail?.reason === 'tls_error')))
  // A result that failed for another reason (robots.txt set aside, then a timeout) has only that reason to give.
  if (result.failureReason !== 'connection_error' && result.failureReason !== 'tls_error' && result.failureReason !== 'policy_denied') return null
  return events.length > 0 && events.every(provenNoHttps) ? String(events[0]!.detail!.code) : null
}

/** Whether a rung saw the site's HTTPS work: an answer to the page or its robots.txt, or a TLS failure that is not on the list (a certificate's). */
function httpsAnswered(result: FetchResult): boolean {
  if (result.evidence.httpStatus != null) return true
  if (result.trace.some((event) => event.event === 'robots_checked' && event.detail?.unreachable !== 'network_error' && event.detail?.unreachable !== 'timeout')) return true
  return result.failureReason === 'tls_error' && !result.trace.some((event) => event.event === 'request_failed' && provenNoHttps(event))
}

export interface HttpFallback { url: string; reason: string }
export interface FallbackAccess { authed: boolean; session: unknown; execution: ExecutionContext; options: FetchOptions }

/** The URL's http twin, when nothing of this request may not go out in the clear; null otherwise. */
function plainTwin(url: string, access: FallbackAccess): URL | null {
  if (access.authed || (access.session ?? null) !== null || access.execution.cookieSession !== undefined) return null
  if (Object.keys(access.options.headers ?? {}).length > 0 || (access.options.actions?.length ?? 0) > 0) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.search !== '') return null
  parsed.protocol = 'http:'
  return parsed
}

/** Whether this rung's failure is one the fallback will act on: the ladder then spends no paid rung on the page first. */
export function fallsBackToHttp(url: string, result: FetchResult, access: FallbackAccess): boolean {
  return plainTwin(url, access) !== null && noHttpsCode(url, result) !== null
}

/** The URL to ask for again and why, when the run proved the site has no HTTPS; null otherwise. */
export function httpFallbackFor(url: string, run: LadderRunResult, access: FallbackAccess): HttpFallback | null {
  if (READ_STATUSES.has(run.result.status) || run.handoffRequested) return null
  // A paid call's record belongs to its run: a second run would lose it.
  if (run.result.trace.some((event) => event.event === 'paid_calls')) return null
  const twin = plainTwin(url, access)
  if (twin === null) return null
  const results = run.summary.attempts.length > 0 ? run.summary.attempts.map((attempt) => attempt.result) : [run.result]
  if (results.some(httpsAnswered)) return null
  const reason = noHttpsCode(url, results[0]!)
  return reason === null ? null : { url: twin.href, reason }
}

/** Whether the site answered over http: a status, or a rule of its robots.txt. Anything else says no more than https did. */
function reached(result: FetchResult): boolean {
  if (result.evidence.httpStatus != null) return true
  return result.trace.some((event) => event.event === 'robots_disallowed' && event.detail?.unreachable === undefined)
}

function fallbackWarning(url: string, fallback: HttpFallback, result: FetchResult): FetchWarning {
  const start = `${url} has no working HTTPS (${fallback.reason})`
  const read = READ_STATUSES.has(result.status)
  const final = result.evidence.finalUrl
  const message = !read ? `${start}, so ${fallback.url} was asked for instead.`
    : final.startsWith('https:') ? `${start}, so ${fallback.url} was asked for, and it sent the request on to ${final}.`
      : `${start}, so this was read from ${final}, unencrypted: anyone on the path could have changed it.`
  return { code: HTTPS_UNAVAILABLE, message }
}

/**
 * The answer for `url`: the http run's when the site answered it, the https failure, noting the try, when not. An http run
 * that paid for a rung is the answer either way, as its call's record goes with it.
 */
export function withHttpFallback(url: string, fallback: HttpFallback, first: LadderRunResult, second: LadderRunResult): LadderRunResult {
  const answered = reached(second.result) || second.result.trace.some((event) => event.event === 'paid_calls')
  const detail = { from: url, to: fallback.url, reason: fallback.reason, reached: answered }
  const totalMs = (run: LadderRunResult) => run.summary.totalMs ?? run.summary.wallMs
  const step = { at: totalMs(first), event: 'https_fallback', channel: '—', detail }
  if (!answered) return { ...first, ladderTrace: [...first.ladderTrace, step, ...second.ladderTrace] }
  const event = { at: second.result.usage.wallMs, lane: second.result.lane, event: 'https_fallback', detail } as TraceEvent
  const channelsTried = [...first.channelsTried, ...second.channelsTried]
  const { evidence } = second.result
  return {
    ...second,
    channelsTried,
    ladderTrace: [...first.ladderTrace, step, ...second.ladderTrace],
    summary: { ...second.summary, channelsTried, attempts: [...first.summary.attempts, ...second.summary.attempts], wallMs: first.summary.wallMs + second.summary.wallMs, totalMs: totalMs(first) + totalMs(second) },
    result: {
      ...second.result, requestedUrl: url, warnings: [...(second.result.warnings ?? []), fallbackWarning(url, fallback, second.result)], trace: [...second.result.trace, event],
      // The chain starts where the http request did: https to http was no redirect, and the Evidence Record must not say so.
      evidence: evidence.redirectChain.length > 0 ? evidence : { ...evidence, redirectChain: [evidence.finalUrl] },
    },
  }
}
