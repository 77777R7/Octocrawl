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
})
