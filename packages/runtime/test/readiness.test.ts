import { describe, expect, it } from 'vitest'
import type { FetchResult, TraceEvent } from '@w2l/contracts'
import { readinessOf, SHELL_TEXT_MAX } from '../src/readiness.js'

function result(over: Partial<FetchResult> = {}, trace: TraceEvent[] = []): FetchResult {
  return {
    requestedUrl: 'https://source.example/page', status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'browser_local', escalations: [],
    markdown: '# Page', truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: 'https://source.example/page', httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [], fetchedAt: '2026-10-10T10:00:00.000Z' },
    usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 1, browserMs: 0, externalCostUsd: null },
    trace,
    ...over,
  }
}

const failed = (failureReason: FetchResult['failureReason'], over: Partial<FetchResult> = {}, trace: TraceEvent[] = []) => result({ status: 'failed', failureReason, markdown: null, ...over }, trace)
const warned = (...codes: string[]) => codes.map((code) => ({ code, message: code }))
const loadingWait = (cleared: boolean, waitedMs = 8_000): TraceEvent => ({ at: 1, lane: 'browser_local', event: 'loading_wait', detail: { waitedMs, cleared } })

describe('readinessOf (ADR 0007, ROADMAP PA item 11)', () => {
  it('reads a page with content and no sign of loading as ready', () => {
    expect(readinessOf(result())).toEqual({ state: 'ready', basis: [] })
    expect(readinessOf(result({ status: 'partial' }))).toEqual({ state: 'ready', basis: [] })
    // A loading indicator that went before the page was read leaves the page ready, with the wait.
    expect(readinessOf(result({}, [loadingWait(true, 2_400)]))).toEqual({ state: 'ready', basis: [], waitedMs: 2_400 })
  })

  it('reads a page with content that was read before it had come as not loaded, saying by which signals', () => {
    // WSJ's market data over HTTP: a "Loading…" shell its scripts fill in.
    expect(readinessOf(result({ lane: 'http', warnings: warned('robots_overridden', 'client_rendered_suspected', 'low_content_yield') }))).toEqual({ state: 'not_loaded', basis: ['client_rendered_suspected'] })
    expect(readinessOf(result({ warnings: warned('page_still_loading') }, [loadingWait(false)]))).toEqual({ state: 'not_loaded', basis: ['page_still_loading'], waitedMs: 8_000 })
    // The my-browser lane: x.com read while its timeline was still filling in.
    const changing: TraceEvent = { at: 1, lane: 'my_browser', event: 'steady_wait', detail: { waitedMs: 8_000, steady: false } }
    expect(readinessOf(result({ lane: 'my_browser', warnings: warned('page_still_changing') }, [changing]))).toEqual({ state: 'not_loaded', basis: ['page_still_changing'], waitedMs: 8_000 })
    // A wait the deadline cut short, a deadline the run ran into, a list step the deadline stopped.
    const cutShort: TraceEvent = { at: 1, lane: 'browser_local', event: 'wait_for', detail: { requestedMs: 9_000, waitedMs: 4_000, cutShortBy: 'timeout' } }
    expect(readinessOf(result({ status: 'partial', usage: { ...result().usage, deadlineExceeded: true } }, [cutShort]))).toEqual({ state: 'not_loaded', basis: ['wait_cut_short', 'deadline_exceeded'] })
    const list = { index: 0, type: 'scrollToEnd' as const, stoppedBy: 'deadline' as const, rounds: 3, items: 40 }
    expect(readinessOf(result({ actions: { steps: [], lists: [list] } as unknown as FetchResult['actions'] }))).toEqual({ state: 'not_loaded', basis: ['list_not_exhausted'] })
    // A list the caller's cap stopped is the caller's choice, and one that reached its end or stopped growing is whole.
    for (const stoppedBy of ['max', 'end', 'no_growth', 'repeat'] as const) {
      expect(readinessOf(result({ actions: { steps: [], lists: [{ ...list, stoppedBy }] } as unknown as FetchResult['actions'] })).state, stoppedBy).toBe('ready')
    }
    // The wait reported is the lane's last.
    expect(readinessOf(result({}, [loadingWait(true, 1_000), changing])).waitedMs).toBe(8_000)
  })

  it('tells a rendered page with no main content apart by its visible text: not loaded when a shell, not extracted when its text was there', () => {
    const extract = (textChars?: number): TraceEvent => ({ at: 1, lane: 'browser_local', event: 'extract', detail: { pageType: 'unknown', escalate: true, ...(textChars === undefined ? {} : { textChars }) } })
    // OECD's Data Explorer read in 1.5 s: the page's text had not come.
    expect(readinessOf(failed('empty_unverified', { markdown: 'x'.repeat(1_028) }, [extract(235)]))).toEqual({ state: 'not_loaded', basis: ['empty_unverified', 'little_text'] })
    expect(readinessOf(failed('empty_unverified', {}, [extract(SHELL_TEXT_MAX)])).state).toBe('not_loaded')
    // A signed-in GitHub home whose server-rendered <main> is hidden: the page's text is there, the extractor took none of it.
    // It is the text that counts, not the Markdown, whose link targets a page of links fills, and not whether markdown was asked for.
    expect(readinessOf(failed('empty_unverified', { markdown: null }, [extract(SHELL_TEXT_MAX + 1)]))).toEqual({ state: 'not_extracted', basis: ['empty_unverified'] })
    expect(readinessOf(failed('empty_unverified', { markdown: 'x'.repeat(6_705) }, [extract(2_031)])).state).toBe('not_loaded')
    // A lane that did not count the page's text: unknown, not little.
    expect(readinessOf(failed('empty_unverified', { markdown: 'x'.repeat(20_000) }, [extract()]))).toEqual({ state: 'not_loaded', basis: ['empty_unverified', 'text_unknown'] })
    // Read without its scripts, whatever its text: a browser reads it.
    expect(readinessOf(failed('empty_unverified', { lane: 'http' }, [{ ...extract(9_000), lane: 'http' }]))).toEqual({ state: 'not_loaded', basis: ['empty_unverified', 'not_rendered'] })
    // A file with no text to read (a PDF without a text layer) came, and no route reads more of it.
    expect(readinessOf(failed('empty_unverified', { lane: 'http', file: { kind: 'pdf' } as unknown as FetchResult['file'] }))).toEqual({ state: 'not_extracted', basis: ['empty_unverified'] })
    // A page read while it still showed a loading indicator, or still changing, is not loaded, whatever its text.
    expect(readinessOf(failed('empty_unverified', {}, [extract(20_000), loadingWait(false)]))).toEqual({ state: 'not_loaded', basis: ['page_still_loading', 'empty_unverified'], waitedMs: 8_000 })
    const changing: TraceEvent = { at: 1, lane: 'my_browser', event: 'steady_wait', detail: { waitedMs: 8_000, steady: false } }
    expect(readinessOf(failed('empty_unverified', { lane: 'my_browser' }, [extract(20_000), changing]))).toEqual({ state: 'not_loaded', basis: ['page_still_changing', 'empty_unverified'], waitedMs: 8_000 })
  })

  it('reads a timeout as not loaded when a wait was cut short or the page had answered, and as not served when the site never answered', () => {
    const cutShort: TraceEvent = { at: 1, lane: 'browser_local', event: 'wait_for', detail: { requestedMs: 9_000, waitedMs: 4_000, cutShortBy: 'timeout' } }
    const deadline = { usage: { ...result().usage, deadlineExceeded: true } }
    expect(readinessOf(failed('timeout', deadline, [cutShort]))).toEqual({ state: 'not_loaded', basis: ['wait_cut_short', 'deadline_exceeded', 'timeout'] })
    // The ladder marks every timeout its deadline ended: a server that accepted and never answered did not serve the page.
    expect(readinessOf(failed('timeout', { ...deadline, evidence: { ...result().evidence, httpStatus: null } }))).toEqual({ state: 'not_served', basis: ['deadline_exceeded', 'timeout'] })
    expect(readinessOf(failed('timeout', { evidence: { ...result().evidence, httpStatus: null } }))).toEqual({ state: 'not_served', basis: ['timeout'] })
    // One that had answered was still being read when the deadline ended.
    expect(readinessOf(failed('timeout', deadline))).toEqual({ state: 'not_loaded', basis: ['deadline_exceeded', 'timeout'] })
    expect(readinessOf(failed('action_failed'))).toEqual({ state: 'not_loaded', basis: ['action_failed'] })
  })

  it('reads a page the route, the access or the region did not serve as not served', () => {
    expect(readinessOf(result({ status: 'blocked', blockReason: 'cloudflare_challenge', markdown: null }))).toEqual({ state: 'not_served', basis: ['cloudflare_challenge'] })
    expect(readinessOf(result({ status: 'blocked', blockReason: 'geo_restricted', markdown: null }))).toEqual({ state: 'not_served', basis: ['geo_restricted'] })
    expect(readinessOf(result({ status: 'budget_exceeded', budgetExceeded: 'cost', markdown: null }))).toEqual({ state: 'not_served', basis: ['cost'] })
    // internal_error: the scrape threw, and nothing of the page arrived.
    for (const reason of ['http_error', 'policy_denied', 'dns_error', 'connection_error', 'tls_error', 'redirect_limit', 'redirect_loop', 'loop_detected', 'provider_error', 'identity_compromised', 'cache_miss', 'internal_error'] as const) {
      expect(readinessOf(failed(reason)), reason).toEqual({ state: 'not_served', basis: [reason] })
    }
  })

  it('reads a page that came but could not be read as not extracted', () => {
    for (const reason of ['body_too_large', 'decompressed_too_large', 'unsupported_content_type', 'unsupported_content_encoding', 'parse_error'] as const) {
      expect(readinessOf(failed(reason)), reason).toEqual({ state: 'not_extracted', basis: [reason] })
    }
  })

  it('reads a proven empty page and a crawl duplicate as ready, and a cancelled read as not loaded', () => {
    expect(readinessOf(result({ status: 'empty_verified', markdown: null }))).toEqual({ state: 'ready', basis: ['empty_verified'] })
    expect(readinessOf(result({ status: 'duplicate' }))).toEqual({ state: 'ready', basis: ['duplicate'] })
    expect(readinessOf(result({ status: 'cancelled', markdown: null }))).toEqual({ state: 'not_loaded', basis: ['cancelled'] })
  })

  it('with a task contract, tells the three apart by the verification and the region wait on the live page (ADR 0007 §3)', () => {
    const verified = (status: 'passed' | 'failed', reason: 'checks_failed' | 'page_not_read' | 'empty_not_allowed' | null = status === 'passed' ? null : 'checks_failed') =>
      ({ verification: { status, verifier: 'verify/1', contractSha256: 'c'.repeat(64), reason, checks: [] } }) as Partial<FetchResult>
    const region = (detail: Record<string, unknown>): TraceEvent => ({ at: 1, lane: 'browser_local', event: 'region_wait', detail: { ready: false, empty: false, waitedMs: 3_000, reads: 7, loading: false, steady: true, checks: [], ...detail } })
    // The task's data was there: ready, whatever page-wide signal there was.
    expect(readinessOf(result({ ...verified('passed'), warnings: warned('page_still_loading') }))).toEqual({ state: 'ready', basis: ['verified'] })
    // WSJ through the browser: its checks held on the live page, not in what was extracted.
    expect(readinessOf(result(verified('failed'), [region({ ready: true })]))).toEqual({ state: 'not_extracted', basis: ['checks_failed', 'region_ready'], waitedMs: 3_000 })
    // They never held, the page still loading or still changing: not loaded.
    expect(readinessOf(result(verified('failed'), [region({ loading: true })]))).toEqual({ state: 'not_loaded', basis: ['checks_failed', 'region_not_ready', 'page_still_loading'], waitedMs: 3_000 })
    expect(readinessOf(result(verified('failed'), [region({ steady: false })]))).toEqual({ state: 'not_loaded', basis: ['checks_failed', 'region_not_ready', 'page_still_changing'], waitedMs: 3_000 })
    // They never held on a settled page: not served (Tesla's empty inventory, OECD's view without its table).
    expect(readinessOf(result(verified('failed'), [region({})]))).toEqual({ state: 'not_served', basis: ['checks_failed', 'region_absent'], waitedMs: 3_000 })
    // An empty list on a settled page, which the contract accepts: an explicit empty state.
    expect(readinessOf(result(verified('failed'), [region({ ready: true, empty: true })]))).toEqual({ state: 'ready', basis: ['region_empty'], waitedMs: 3_000 })
    // No region wait: the http lane did not run the page's scripts; a rendered lane goes by its own signals.
    expect(readinessOf(result({ ...verified('failed'), lane: 'http' }))).toEqual({ state: 'not_loaded', basis: ['checks_failed', 'not_rendered'] })
    expect(readinessOf(result({ ...verified('failed'), warnings: warned('page_still_loading') }))).toEqual({ state: 'not_loaded', basis: ['checks_failed', 'page_still_loading'] })
    expect(readinessOf(result(verified('failed')))).toEqual({ state: 'not_served', basis: ['checks_failed'] })
    // A page proven empty the contract does not accept, and a page not read, which its own status tells.
    expect(readinessOf(result({ ...verified('failed', 'empty_not_allowed'), status: 'empty_verified', markdown: null }))).toEqual({ state: 'not_served', basis: ['empty_not_allowed'] })
    expect(readinessOf(result({ ...verified('failed', 'page_not_read'), status: 'blocked', blockReason: 'captcha', markdown: null }))).toEqual({ state: 'not_served', basis: ['captcha'] })
    // Without a contract, the verification is not_requested and the signals speak as before.
    expect(readinessOf(result({ verification: { status: 'not_requested' } }))).toEqual({ state: 'ready', basis: [] })
  })
})
