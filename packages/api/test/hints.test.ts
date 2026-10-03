import { describe, expect, it } from 'vitest'
import { agentHintsFor, FAST_MODE_DECLINED_HINT, lowContentYieldHint, SCREENSHOT_UNAVAILABLE_HINT, type HintedAttempt, type HintedResult } from '../src/hints.js'

const URL_ = 'https://example.test/report'

/** A result to read hints from: a plain http success unless the test says otherwise. */
function result(partial: Partial<HintedResult> = {}): HintedResult {
  return {
    requestedUrl: URL_, status: 'success', failureReason: null, blockReason: null, lane: 'http', escalations: [], trace: [],
    markdown: 'Report', truncated: false, truncatedAt: null,
    evidence: { finalUrl: URL_, httpStatus: 200 },
    ...partial,
  }
}

const hints = (res: HintedResult, channelsTried: readonly string[] = ['http'], req: { fastMode?: boolean } = {}) => agentHintsFor(req, { channelsTried, result: res })

describe('agent hints', () => {
  it('says nothing about a plain success, a verified empty page or a TLS caveat', () => {
    expect(hints(result())).toEqual([])
    expect(hints(result({ status: 'empty_verified', markdown: null }))).toEqual([])
    expect(hints(result({ warnings: [{ code: 'tls_unverified', message: 'not verified' }] }))).toEqual([])
    expect(hints(result({ status: 'failed', failureReason: 'dns_error', markdown: null }))).toEqual([])
  })

  it('names the robots.txt rule and the recorded override for a policy denial, and an unreachable robots.txt for what it is', () => {
    const disallowed = (detail: Record<string, unknown>) => result({ status: 'failed', failureReason: 'policy_denied', markdown: null, evidence: { finalUrl: URL_, httpStatus: null }, trace: [{ at: 1, lane: 'http', event: 'robots_disallowed', detail: { url: URL_, ...detail } }] })
    expect(hints(disallowed({ appliedRules: [{ pattern: '/report', allow: false }, { pattern: '/public', allow: true }] }))).toEqual([
      "robots.txt of example.test disallows this URL for W2L's identity (rule /report); a robotsOverride with a recorded reason fetches it on the record",
    ])
    expect(hints(disallowed({ appliedRules: [] }))[0]).toContain('(rule unknown)')
    expect(hints(disallowed({ appliedRules: [], unreachable: 'server_error' }))).toEqual([
      'robots.txt of example.test could not be read (server_error), which counts as a complete disallow; W2L asks for it again after five minutes, and a robotsOverride does not set that aside',
    ])
    // A denial that was not robots.txt's (an address the policy refuses) names the egress policy and the recorded reason instead of a rule.
    expect(hints(result({ status: 'failed', failureReason: 'policy_denied', markdown: null, trace: [{ at: 1, lane: 'http', event: 'ssrf_denied', detail: { to: URL_, error: 'private address 10.0.0.1' } }] }))).toEqual([
      'the egress policy refused example.test (private address 10.0.0.1) and nothing was fetched; W2L reaches public addresses, and a local server the addresses its policy allowlists',
    ])
    expect(hints(result({ status: 'failed', failureReason: 'policy_denied', markdown: null, trace: [{ at: 0, lane: 'http', event: 'governance_refusal', detail: { reason: 'host outside allowlist' } }] }))[0]).toContain('(host outside allowlist)')
    // A policy_denied with neither event (a lane that recorded nothing) has nothing to name.
    expect(hints(result({ status: 'failed', failureReason: 'policy_denied', markdown: null }))).toEqual([])
  })

  it('points a login wall to mode authed and a gate to a proxy or session of your own, naming the lanes tried', () => {
    const wall = result({ status: 'blocked', blockReason: 'login_wall', markdown: null })
    expect(hints(wall)).toEqual(['the page asks for a login; W2L does not create accounts; use mode authed with your own session'])
    // The saved login was used and refused: the fix is a fresh import, not mode authed.
    const refused = agentHintsFor({}, { channelsTried: ['authed_session'], result: wall, ladderTrace: [{ at: 0, event: 'ladder_session_rejected', channel: 'authed_session', detail: { domain: 'example.test', blockReason: 'login_wall' } }] })
    expect(refused).toEqual(['example.test refused your saved login for example.test (expired or signed out); sign in to it again in Chrome and run w2l login import example.test'])
    for (const blockReason of ['cloudflare_challenge', 'captcha', 'bot_detected_generic'] as const) {
      expect(hints(result({ status: 'blocked', blockReason, markdown: null, evidence: { finalUrl: URL_, httpStatus: 403 } }), ['http', 'browser_local']), blockReason).toEqual([
        'example.test gates automated access on the lanes tried (http, browser_local); W2L does not solve challenges or change its identity; a proxy or session you own is the supported route',
      ])
    }
    expect(hints(result({ status: 'blocked', blockReason: 'geo_restricted', markdown: null }))).toEqual([])
  })

  it('gives the Retry-After time for a rate limit, the cut for a truncated page, and the error page for an HTTP error', () => {
    const retryAt = Date.UTC(2026, 9, 2, 12, 0, 0)
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null, retryAt }))).toEqual(['wait until 2026-10-02T12:00:00.000Z before asking example.test again'])
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null }))).toEqual(['example.test answered with a rate limit and named no Retry-After; wait before asking it again'])
    // A deferred Retry-After on any result is a wait, whatever the status.
    expect(hints(result({ retryAt }))).toEqual(['wait until 2026-10-02T12:00:00.000Z before asking example.test again'])
    expect(hints(result({ truncated: true, truncatedAt: 120000 }))).toEqual(['the content was cut at character 120000; ask for rawHtml or a narrower includeTags'])
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: '# Not Found', evidence: { finalUrl: URL_, httpStatus: 404 } }))).toEqual(['the server answered 404; the markdown is that error page, not the requested page; check the link'])
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: '# Gone', evidence: { finalUrl: URL_, httpStatus: 500 } }))).toEqual(['the server answered 500; the markdown is that error page, not the requested page'])
    // An error status that kept no page says nothing: there is no markdown to mistake for the page; a 404 still says to check the link.
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: null, evidence: { finalUrl: URL_, httpStatus: 500 } }))).toEqual([])
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: null, evidence: { finalUrl: URL_, httpStatus: 404 } }))).toEqual(['the server answered 404; check the link'])
    // The host is the final URL's, after a redirect.
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null, evidence: { finalUrl: 'https://www.example.test/x', httpStatus: 429 } }))[0]).toContain('www.example.test')
  })

  it('describes a client-rendered page by whether the browser lane had its turn, and under fastMode names what was declined once', () => {
    const shell = result({ status: 'failed', failureReason: 'empty_unverified', warnings: [{ code: 'client_rendered_suspected', message: 'shell' }], escalations: [{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }], trace: [{ at: 1, lane: 'http', event: 'quality_client_rendered' }] })
    expect(hints(shell, ['http', 'browser_local'])).toEqual(['the page fills its data with JavaScript; the browser lane was tried'])
    expect(hints(shell, ['http'])).toEqual(['the page fills its data with JavaScript; the browser lane was not tried'])
    expect(hints(shell, ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    // A success the http lane offered to the browser lane carries the fastMode hint too; a rendered page carries none.
    expect(hints(result({ trace: [{ at: 1, lane: 'http', event: 'quality_low_yield' }] }), ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    expect(hints(result({ lane: 'browser_local' }), ['http', 'browser_local'], { fastMode: true })).toEqual([])
    // Several hints keep the table's order: the block before the wait, the wait before the cut.
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null, retryAt: Date.UTC(2026, 0, 1), truncated: true, truncatedAt: 10 })).map((hint) => hint.split(' ')[0])).toEqual(['wait', 'the'])
  })

  it('suggests waitFor or a longer timeout for a thin http answer the browser lane did not improve or could not be offered to, and says what a file\'s markdown is', () => {
    const thin = (message: string) => result({ warnings: [{ code: 'low_content_yield', message }], trace: [{ at: 1, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 20, confidence: 0.1 } }] })
    expect(hints(thin('The http lane extracted 20 tokens at confidence 0.1; the browser lane did not improve it.'), ['http', 'browser_local'])).toEqual([lowContentYieldHint(true)])
    expect(hints(thin('The http lane extracted 20 tokens at confidence 0.1; the browser lane was not available to this request.'), ['http'])).toEqual([lowContentYieldHint(false)])
    expect(lowContentYieldHint(false)).toBe("the http lane's content was thin and the browser lane was not available; pass waitFor (up to 60000 ms) or a longer timeout with the browser lane available, or actions (a click, a scroll, a wait for a selector) when the data appears after an interaction")
    // Under fastMode the one fastMode sentence says what was declined; the warning's own hint is left out.
    expect(hints(thin('…'), ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    // A shell carries the client-rendered sentence first, then the thin-content one.
    const shell = result({ status: 'failed', failureReason: 'empty_unverified', warnings: [{ code: 'client_rendered_suspected', message: 'shell' }, { code: 'low_content_yield', message: 'thin' }], trace: [{ at: 1, lane: 'http', event: 'quality_client_rendered' }] })
    expect(hints(shell, ['http'])).toEqual(['the page fills its data with JavaScript; the browser lane was not tried', lowContentYieldHint(false)])
    const file = (kind: 'pdf' | 'csv' | 'xlsx', markdownFrom: 'pdf_text' | 'text' | null, path: string | null) => result({ file: { kind, detectedBy: 'content_type', contentType: null, declaredBytes: null, maxBytes: 10, bytes: 10, sha256: 'a'.repeat(64), path, markdownFrom, encoding: null, warnings: [], pdf: null } as unknown as NonNullable<HintedResult['file']> })
    expect(hints(file('pdf', 'pdf_text', 'files/aaa.pdf'))).toEqual(['the response was a pdf file kept at files/aaa.pdf; markdown is its text layer'])
    expect(hints(file('csv', 'text', 'files/aaa.csv'))).toEqual(['the response was a csv file kept at files/aaa.csv; markdown is its text as received'])
    expect(hints(file('xlsx', null, null))).toEqual(['the response was a xlsx file not saved; it has no markdown'])
  })

  it('names what the http lane got when a browser lane served the page after it, and nothing for the ladder\'s ordinary thin-page hop', () => {
    const served = (http: Partial<HintedAttempt['result']> & Pick<HintedAttempt['result'], 'status'>, httpStatus: number | null = 403) => agentHintsFor({}, {
      channelsTried: ['http', 'browser_local'],
      result: result({ lane: 'browser_local' }),
      summary: { attempts: [{ channel: 'http', result: { failureReason: null, blockReason: null, ...http, evidence: { httpStatus } } }, { channel: 'browser_local', result: { status: 'success', failureReason: null, blockReason: null, evidence: { httpStatus: 200 } } }] },
    })
    expect(served({ status: 'blocked', blockReason: 'bot_detected_generic' })).toEqual(['the http lane got blocked/bot_detected_generic (HTTP 403) from example.test and the local browser lane served the page; expect other pages of example.test to need the browser lane too'])
    expect(served({ status: 'failed', failureReason: 'http_error' }, 503)).toEqual(['the http lane got failed/http_error (HTTP 503) from example.test and the local browser lane served the page; expect other pages of example.test to need the browser lane too'])
    // A thin or empty http answer the browser lane improved on is the ladder's ordinary hop, not a hint; so is a page the http lane served itself, and a run without its summary.
    expect(served({ status: 'failed', failureReason: 'empty_unverified' }, 200)).toEqual([])
    expect(served({ status: 'success' }, 200)).toEqual([])
    expect(hints(result({ lane: 'browser_local' }), ['http', 'browser_local'])).toEqual([])
    expect(hints(result(), ['http'])).toEqual([])
  })

  it('names a certificate that did not verify, a deadline that passed, and a page without main content, each with its honest option', () => {
    expect(hints(result({ status: 'failed', failureReason: 'tls_error', markdown: null }))).toEqual(['the certificate of example.test did not verify and W2L keeps verification on; a local server takes skipTlsVerification for one request, recorded in the trace and a tls_unverified warning, and a hosted server refuses it'])
    expect(hints(result({ status: 'failed', failureReason: 'timeout', markdown: null }))).toEqual(["no lane answered within the request's deadline; raise timeout (up to 300000 ms)"])
    expect(hints(result({ status: 'partial' }))).toEqual(['the result is partial: the deadline passed with this much of the page read; raise timeout (up to 300000 ms) for the rest'])
    const empty = result({ status: 'failed', failureReason: 'empty_unverified', markdown: '# Chrome only' })
    expect(hints(empty)).toEqual(["W2L found no main content on the page; onlyMainContent: false returns the whole page's Markdown as content, and includeTags names the elements to read instead"])
    // A shell or thin answer already carries its own sentence; under fastMode that option's sentence stands alone.
    expect(hints({ ...empty, warnings: [{ code: 'client_rendered_suspected', message: 'shell' }] })).toEqual(['the page fills its data with JavaScript; the browser lane was not tried'])
    expect(hints({ ...empty, trace: [{ at: 1, lane: 'http', event: 'quality_low_yield' }] }, ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    // A PDF with no text layer is the one empty page W2L cannot read differently.
    const pdf = { kind: 'pdf', detectedBy: 'content_type', contentType: 'application/pdf', declaredBytes: null, maxBytes: 10, bytes: 10, sha256: 'a'.repeat(64), path: 'files/aaa.pdf', markdownFrom: null, encoding: null, warnings: [], pdf: null } as unknown as NonNullable<HintedResult['file']>
    expect(hints(result({ status: 'failed', failureReason: 'empty_unverified', markdown: null, file: pdf }))).toEqual(['the PDF has no text layer, and W2L runs no OCR', 'the response was a pdf file kept at files/aaa.pdf; it has no markdown'])
  })

  it('names the required json fields the page did not state and a model fallback that did not run, and keeps at most five hints', () => {
    const json = (issues: NonNullable<HintedResult['json']>['issues']): HintedResult => result({ json: { status: 'incomplete', data: { title: 'Report' }, evidence: [], issues } })
    expect(hints(json([{ code: 'missing_required', message: 'no source', path: '/price' }]))).toEqual(['json is incomplete: the required field /price was not found on the page; modelFallback fills what the page does not state when the server has W2L_EXTRACT_BASE_URL and W2L_EXTRACT_MODEL'])
    expect(hints(json([{ code: 'missing_required', message: 'no source', path: '/price' }, { code: 'missing_required', message: 'no source', path: '/sku' }, { code: 'model_unavailable', message: 'model fallback requested but W2L extraction model is not configured' }]))).toEqual([
      'json is incomplete: the required fields /price, /sku were not found on the page; modelFallback fills what the page does not state when the server has W2L_EXTRACT_BASE_URL and W2L_EXTRACT_MODEL',
      'the json model fallback did not run: model fallback requested but W2L extraction model is not configured',
    ])
    expect(hints(result({ json: { status: 'complete', data: { title: 'Report' }, evidence: [], issues: [] } }))).toEqual([])
    expect(hints(json([{ code: 'field_unavailable', message: 'nullable field not found', path: '/isbn' }]))).toEqual([])
    // The table's order decides which five stay.
    const many = hints({ ...json([{ code: 'missing_required', message: 'no source', path: '/price' }, { code: 'model_unavailable', message: 'no model' }]), status: 'partial', retryAt: Date.UTC(2026, 0, 1), truncated: true, truncatedAt: 10, warnings: [{ code: 'screenshot_unavailable', message: 'no capture' }] })
    expect(many).toHaveLength(5)
    expect(many.map((hint) => hint.split(' ')[0])).toEqual(['the', 'wait', 'the', 'the', 'json'])
  })

  it('says the page stands when the browser lane could not capture the screenshot asked for, and names the lighter request', () => {
    const unavailable = result({ lane: 'browser_local', warnings: [{ code: 'screenshot_unavailable', message: 'The browser lane rendered the page but could not capture the requested screenshot (Timeout 30000ms exceeded); the page result stands without it.' }] })
    expect(hints(unavailable, ['browser_local'])).toEqual([SCREENSHOT_UNAVAILABLE_HINT])
    expect(SCREENSHOT_UNAVAILABLE_HINT).toContain('screenshot_failed')
    expect(SCREENSHOT_UNAVAILABLE_HINT).toContain('fullPage false')
  })
})
