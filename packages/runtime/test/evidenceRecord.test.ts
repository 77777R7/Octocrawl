import { afterEach, describe, expect, it } from 'vitest'
import { EXTRACTOR_VERSION, FILE_TEXT_VERSION, PDF_TEXT_VERSION } from '@w2l/extract-tf'
import { sha256Utf8 } from '@w2l/http-core'
import { researchUserAgent, type ComplianceRecord, type FetchResult, type TraceEvent } from '@w2l/contracts'
import { toEvidenceRecord } from '../src/evidenceRecord.js'

const url = 'https://source.example/start'
const final = 'https://source.example/page'
const RAW = 'a'.repeat(64)
const ROBOTS = 'b'.repeat(64)

function result(over: Partial<FetchResult> = {}, trace: TraceEvent[] = []): FetchResult {
  return {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [],
    markdown: '# Page', truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: final, httpStatus: 200, redirectChain: [url, final], contentType: 'text/html', rawBodySha256: RAW, artifacts: [], fetchedAt: '2026-09-29T10:00:00.000Z' },
    usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 2, attemptCount: 1, contentTokens: 1, browserMs: 0, externalCostUsd: null },
    trace,
    ...over,
  }
}

const httpTrace = (userAgent: string): TraceEvent[] => [
  { at: 0, lane: 'http', event: 'identity_sent', detail: { mode: 'research', headers: [{ name: 'accept', value: 'text/html' }, { name: 'user-agent', value: userAgent }] } },
  { at: 1, lane: 'http', event: 'robots_checked', detail: { decision: 'allowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, matchedGroup: '*', ruleCount: 1, crawlDelayMs: 2000 } },
]

function compliance(over: Partial<ComplianceRecord> = {}): ComplianceRecord {
  return {
    schemaVersion: 2, recordId: 'r1', mode: 'standard', requestedUrl: url, finalUrl: final, requestedAt: '2026-09-29T09:59:59.000Z',
    robots: { robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, matchedUserAgentGroup: null, appliedRules: [], decision: 'allowed', skippedFetch: false, crawlDelayMs: null },
    sentHeaders: { headers: [{ name: 'user-agent', value: 'Mozilla/5.0 Chrome/140' }] },
    rateLimit: { previousRequestAtMs: null, observedDelayMs: null, requiredDelayMs: 0, compliant: true, recentSameHostCount: 1 },
    access: {} as ComplianceRecord['access'], prevRecordHash: null, contentHash: 'c', signature: null,
    ...over,
  }
}

describe('toEvidenceRecord', () => {
  const saved = process.env.W2L_SOURCE_COMMIT
  afterEach(() => { if (saved === undefined) delete process.env.W2L_SOURCE_COMMIT; else process.env.W2L_SOURCE_COMMIT = saved })

  it('reads an HTTP-lane result: every hop, the robots decision and identity from its trace', () => {
    const ua = researchUserAgent('Jane Doe jane@example.org')
    const record = toEvidenceRecord(result({ evidence: { ...result().evidence, contentEncoding: 'gzip' } }, httpTrace(ua)), { mode: 'research' }, { markdown: '# Page' }, { sourceCommit: null })
    expect(record).toEqual({
      schemaVersion: 'w2l.evidence/1',
      requestedUrl: url,
      finalUrl: final,
      redirectChain: { urls: [url, final], complete: true },
      fetchedAt: '2026-09-29T10:00:00.000Z',
      httpStatus: 200,
      status: 'success',
      reason: null,
      lane: 'http',
      robotsDecision: { decision: 'allowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, unreachable: null, crawlDelayMs: 2000, userOverride: false, overrideBasis: null },
      rawSha256: RAW,
      contentEncoding: 'gzip',
      outputSha256: { markdown: sha256Utf8('# Page'), json: null },
      extractor: { name: 'extract-tf', version: EXTRACTOR_VERSION, commit: null },
      fieldEvidence: null,
      artifacts: [],
      proxy: null,
      identity: { userAgent: ua, mode: 'research', contact: 'Jane Doe jane@example.org', device: null, requestHeaders: [] },
      pageActions: null,
      // The run's third-party cost is unknown here (null in usage), so it stays unknown.
      access: { route: 'http', executor: 'undici', executorVersion: null, profile: null, externalCostUsd: null, completion: 'unattended', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null, paidCalls: null, grant: null },
      verification: { status: 'not_requested', verifier: null, contractSha256: null, reason: null, failed: [] },
    })
  })

  it('states the route and the client from the lane and the events it recorded, unknown as null', () => {
    // Every lane records the identity it went out with before its request; the tests below add that event.
    const ran = (lane: string): TraceEvent => lane === 'provider' ? { at: 0, lane: 'provider', event: 'provider_selected', detail: { provider: 'browserbase' } } : { at: 0, lane: lane as TraceEvent['lane'], event: lane === 'http' ? 'identity_sent' : 'identity_declared', detail: {} }
    const access = (over: Partial<FetchResult>, trace: TraceEvent[] = []) => toEvidenceRecord(result(over, [ran(over.lane ?? 'http'), ...trace]), { mode: 'standard' }, {}, { sourceCommit: null }).access
    const zero = { usage: { ...result().usage, externalCostUsd: 0 } }
    expect(access(zero)).toEqual({ route: 'http', executor: 'undici', executorVersion: null, profile: null, externalCostUsd: 0, completion: 'unattended', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null, paidCalls: null, grant: null })
    expect(access(zero, [{ at: 0, lane: 'http', event: 'transport', detail: { library: 'impit', version: '0.14.5', profile: 'chrome142' } }]))
      .toEqual({ route: 'http_compat', executor: 'impit', executorVersion: '0.14.5', profile: 'chrome142', externalCostUsd: 0, completion: 'unattended', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null, paidCalls: null, grant: null })
    expect(access({ ...zero, lane: 'browser_local' })).toEqual({ route: 'browser', executor: 'playwright', executorVersion: null, profile: null, externalCostUsd: 0, completion: 'unattended', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null, paidCalls: null, grant: null })
    expect(access({ ...zero, lane: 'browser_local' }, [{ at: 0, lane: 'browser_local', event: 'browser_engine', detail: { engine: 'patchright', version: '1.63.0' } }]))
      .toEqual({ route: 'enhanced_browser', executor: 'patchright', executorVersion: '1.63.0', profile: null, externalCostUsd: 0, completion: 'unattended', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null, paidCalls: null, grant: null })
    expect(access({ ...zero, lane: 'browser_local_authed' })).toMatchObject({ route: 'authed_browser', executor: 'playwright', completion: 'authorized_session' })
    expect(access({ ...zero, lane: 'browser_local_authed' }, [{ at: 9, lane: 'browser_local_authed', event: 'user_browser_read', detail: { browser: 'Google Chrome' } }]))
      .toMatchObject({ route: 'user_browser', executor: 'Google Chrome', completion: 'handed_to_person' })
    // The my-browser lane: the person's Chrome on a site they allowed; handed to them when the page showed a check.
    expect(access({ ...zero, lane: 'my_browser' }, [{ at: 9, lane: 'my_browser', event: 'user_browser_read', detail: { browser: 'Google Chrome', sawGate: null, act: null } }]))
      .toEqual({ route: 'user_browser', executor: 'Google Chrome', executorVersion: null, profile: null, externalCostUsd: 0, completion: 'user_browser', egress: null, session: null, paidCalls: null, grant: null })
    expect(access({ ...zero, lane: 'my_browser' }, [{ at: 9, lane: 'my_browser', event: 'user_browser_read', detail: { browser: 'Google Chrome', sawGate: 'captcha', act: 'user_activation' } }]))
      .toMatchObject({ route: 'user_browser', completion: 'handed_to_person' })
    // A check that cleared without a step of the person's (no act): the page was still read in their Chrome alone.
    expect(access({ ...zero, lane: 'my_browser' }, [{ at: 9, lane: 'my_browser', event: 'user_browser_read', detail: { browser: 'Google Chrome', sawGate: 'cloudflare_challenge', act: null } }]))
      .toMatchObject({ route: 'user_browser', completion: 'user_browser' })
    // A page not read counts no completion, whichever lane tried it.
    expect(access({ ...zero, status: 'blocked', blockReason: 'captcha' })).toMatchObject({ route: 'http', completion: null })
    // A provider states its vendor; a run whose provider stated no price has an unknown cost.
    expect(access({ lane: 'provider' }, [{ at: 0, lane: 'provider', event: 'provider_selected', detail: { provider: 'browserbase' } }]))
      .toEqual({ route: 'vendor', executor: 'browserbase', executorVersion: null, profile: null, externalCostUsd: null, completion: 'unattended', egress: null, session: null, paidCalls: null, grant: null })
    expect(access({ ...zero, lane: 'provider' }, [])).toMatchObject({ route: 'vendor', executor: 'browserbase' })
    // The saved-login rung is the browser lane with a session attached.
    expect(access({ ...zero, lane: 'browser_local' }, [{ at: 1, lane: 'browser_local', event: 'session_attached', detail: { domain: 'source.example' } }]))
      .toEqual({ route: 'authed_browser', executor: 'playwright', executorVersion: null, profile: null, externalCostUsd: 0, completion: 'authorized_session', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null, paidCalls: null, grant: null })
  })

  it('names the egress the page left through and the task session it was read with, unknown as null', () => {
    const ran = (lane: TraceEvent['lane']): TraceEvent => ({ at: 0, lane, event: lane === 'http' ? 'identity_sent' : 'identity_declared', detail: {} })
    const access = (lane: FetchResult['lane'], trace: TraceEvent[]) => toEvidenceRecord(result({ lane }, [ran(lane === 'browser_local' ? 'browser_local' : 'http'), ...trace]), { mode: 'standard' }, {}, { sourceCommit: null }).access
    const pool = { at: 1, lane: 'http', event: 'egress_proxy', detail: { url: 'https://source.example/a', proxy: '127.0.0.1:7890', source: 'pool' } } as TraceEvent
    const cookies = { at: 2, lane: 'http', event: 'session_cookies', detail: { session: '0ae53299-a2bc-4a0d-8cb4-d35e8f443789', requestsWithCookies: 1, kept: 0 } } as TraceEvent
    // A pool egress and a task session: the record names both, and never the cookies.
    expect(access('http', [pool, cookies])).toMatchObject({ egress: { proxy: '127.0.0.1:7890', source: 'pool', switchedFrom: null, exit: null }, session: { id: '0ae53299-a2bc-4a0d-8cb4-d35e8f443789' } })
    expect(JSON.stringify(access('http', [pool, cookies]))).not.toContain('requestsWithCookies')
    // A page read again after its task moved off a dead egress names where it came from.
    const moved = { at: 0, lane: 'http', event: 'egress_switched', detail: { from: '127.0.0.1:9', to: '127.0.0.1:7890', reason: 'unreachable', switches: 1 } } as TraceEvent
    expect(access('http', [pool, cookies, moved]).egress).toEqual({ proxy: '127.0.0.1:7890', source: 'pool', switchedFrom: '127.0.0.1:9', exit: null })
    // The environment proxy, and a browser lane's events.
    // Where the pool egress leaves from, when the engine asked its echo for this very proxy; another proxy's answer, or the environment's proxy, names none.
    const exit = { at: 0, lane: 'http', event: 'egress_exit', detail: { proxy: '127.0.0.1:7890', ip: '203.0.113.7', country: 'JP', observedAt: '2026-10-08T00:00:00.000Z' } } as TraceEvent
    expect(access('http', [pool, exit]).egress).toEqual({ proxy: '127.0.0.1:7890', source: 'pool', switchedFrom: null, exit: { ip: '203.0.113.7', country: 'JP', observedAt: '2026-10-08T00:00:00.000Z' } })
    expect(access('http', [pool, { ...exit, detail: { ...exit.detail, country: null } }]).egress?.exit).toEqual({ ip: '203.0.113.7', country: null, observedAt: '2026-10-08T00:00:00.000Z' })
    expect(access('http', [pool, { ...exit, detail: { ...exit.detail, proxy: '127.0.0.1:9' } }]).egress?.exit).toBeNull()
    expect(access('http', [{ ...pool, detail: { ...pool.detail, source: 'environment' } }, exit]).egress?.exit).toBeNull()
    expect(access('http', [{ ...pool, detail: { ...pool.detail, source: 'environment' } }]).egress).toEqual({ proxy: '127.0.0.1:7890', source: 'environment', switchedFrom: null, exit: null })
    expect(access('browser_local', [{ ...pool, lane: 'browser_local' }, { ...cookies, lane: 'browser_local' }])).toMatchObject({ egress: { proxy: '127.0.0.1:7890', source: 'pool' }, session: { id: '0ae53299-a2bc-4a0d-8cb4-d35e8f443789' } })
    // Two moves before the page was read here: the last one names where it came from.
    const movedAgain = { ...moved, detail: { from: '127.0.0.1:7890', to: '127.0.0.1:7891', reason: 'unreachable', switches: 2 } } as TraceEvent
    expect(access('http', [{ ...pool, detail: { ...pool.detail, proxy: '127.0.0.1:7891' } }, moved, movedAgain]).egress).toEqual({ proxy: '127.0.0.1:7891', source: 'pool', switchedFrom: '127.0.0.1:7890', exit: null })
    // No proxy event on W2L's own lane, and a page answer: the request went direct, with no session.
    expect(access('http', [])).toMatchObject({ egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null, paidCalls: null, grant: null })
    // Another lane's events do not answer for this one.
    expect(access('http', [{ ...pool, lane: 'browser_local' }]).egress).toEqual({ proxy: null, source: 'direct', switchedFrom: null, exit: null })
    // A lane that stopped before any page request (robots, an address check) says nothing about the egress: unknown, not direct.
    const stopped = (lane: FetchResult['lane'], trace: TraceEvent[]) => toEvidenceRecord(result({ lane, status: 'blocked', blockReason: 'robots_disallowed', evidence: { ...result().evidence, httpStatus: null } }, [ran('http'), ...trace]), { mode: 'standard' }, {}, { sourceCommit: null }).access
    expect(stopped('http', [])).toMatchObject({ route: 'http', egress: null, session: null, paidCalls: null, grant: null })
  })

  it('names no route or client for a result no lane produced, and a cache hit\'s cost as the stored fetch\'s', () => {
    const record = (r: FetchResult) => toEvidenceRecord(r, { mode: 'standard' }, {}, { sourceCommit: null }).access
    // The ladder's own answer for a rung the deadline cut, that threw or whose identity was refused: no lane identity in its trace.
    expect(record(result({ status: 'failed', failureReason: 'timeout', usage: { ...result().usage, externalCostUsd: 0 } }, [])))
      .toEqual({ route: null, executor: null, executorVersion: null, profile: null, externalCostUsd: 0, completion: null, egress: null, session: null, paidCalls: null, grant: null })
    expect(record(result({ status: 'failed', failureReason: 'identity_compromised' }, [{ at: 0, lane: 'http', event: 'identity_unobserved', detail: {} }])).route).toBeNull()
    // A cache hit: this call paid nothing (usage 0), the record states what the stored fetch cost, unknown included.
    const hit = (stored: number | null) => result({ lane: 'provider', usage: { ...result().usage, externalCostUsd: 0 } }, [
      { at: 0, lane: 'provider', event: 'provider_selected', detail: { provider: 'steel' } },
      { at: 0, lane: 'provider', event: 'cache_hit', detail: { cachedAt: '2026-10-06T00:00:00.000Z', ageMs: 5, externalCostUsd: stored } },
    ])
    expect(record(hit(null))).toMatchObject({ route: 'vendor', executor: 'steel', externalCostUsd: null })
    expect(record(hit(0.012))).toMatchObject({ externalCostUsd: 0.012 })
  })

  it('lists the paid provider calls the page was read with, a given-up read\'s first, and the grant they were made under (ROADMAP PA item 4)', () => {
    const grant = { sha256: 'd'.repeat(64), tier: 'enhanced', attestedAt: '2026-10-09T00:00:00Z' }
    const call = { provider: 'steel', rung: 'provider', capabilities: ['vendor_remote_browser'], ceilingUsd: 0.3, chargedUsd: 0.3, reportedCostUsd: null, outcome: 'success', reason: null, answer: true }
    const givenUp = { at: 0, lane: 'provider', event: 'paid_calls', detail: { grant, calls: [{ ...call, outcome: null, answer: false }] } } as TraceEvent
    // A call recorded in another shape is left out, never guessed at.
    const own = { at: 0, lane: 'provider', event: 'paid_calls', detail: { grant, calls: [call, { ...call, chargedUsd: -1 }, { ...call, outcome: 'fine' }, { provider: 'steel' }] } } as TraceEvent
    const access = (trace: TraceEvent[]) => toEvidenceRecord(result({ lane: 'provider' }, [{ at: 0, lane: 'provider', event: 'provider_selected', detail: { provider: 'steel' } }, ...trace]), { mode: 'standard' }, {}, { sourceCommit: null }).access
    expect(access([givenUp, own])).toMatchObject({ route: 'vendor', paidCalls: [{ ...call, outcome: null, answer: false }, call], grant })
    // No paid call, no grant: the grant is named only for the calls made under it.
    expect(access([{ ...own, detail: { grant, calls: [{ provider: 'steel' }] } }])).toMatchObject({ paidCalls: null, grant: null })
    // A call charged by its session's measured time keeps that time; a call from before it was kept, or with a time that
    // is not whole milliseconds, has none.
    const measured = { ...call, chargedUsd: 0.0006, sessionMs: 17_250 }
    const timed = (calls: unknown[]) => access([{ ...own, detail: { grant, calls } }])?.paidCalls
    expect(timed([measured])).toEqual([measured])
    expect(timed([call])).toEqual([{ ...call, sessionMs: null }])
    expect(timed([{ ...measured, sessionMs: 17.5 }, { ...measured, sessionMs: -1 }, { ...measured, sessionMs: '17250' }])).toEqual([0, 1, 2].map(() => ({ ...measured, sessionMs: null })))
  })

  it('records the device the answering lane declared and the custom headers it sent, sorted by name', () => {
    const mobileUa = 'Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile'
    const httpMobile = result({}, [
      { at: 0, lane: 'http', event: 'identity_sent', detail: { mode: 'standard', device: 'mobile', headers: [{ name: 'user-agent', value: mobileUa }] } },
      { at: 0, lane: 'http', event: 'request_headers_added', detail: { headers: [{ name: 'x-trace', value: 't1' }, { name: 'accept-language', value: 'de' }] } },
    ])
    expect(toEvidenceRecord(httpMobile, { mode: 'standard' }, {}).identity).toEqual({
      userAgent: mobileUa, mode: 'standard', contact: null, device: 'mobile',
      requestHeaders: [{ name: 'accept-language', valueSha256: sha256Utf8('de') }, { name: 'x-trace', valueSha256: sha256Utf8('t1') }],
    })
    // An http attempt escalated to the browser: the browser lane answered, so its declaration and headers are the record's.
    const escalated = result({ lane: 'browser_local', compliance: compliance() }, [
      { at: 0, lane: 'http', event: 'identity_sent', detail: { mode: 'standard', device: 'desktop', headers: [] } },
      { at: 0, lane: 'http', event: 'request_headers_added', detail: { headers: [{ name: 'x-trace', value: 'http' }] } },
      { at: 5, lane: 'browser_local', event: 'identity_declared', detail: { mode: 'standard', device: 'mobile' } },
    ])
    expect(toEvidenceRecord(escalated, { mode: 'standard' }, {}).identity).toMatchObject({ device: 'mobile', requestHeaders: [] })
  })

  it('prefers the signed compliance record, and says a browser lane lists only the endpoints', () => {
    const record = toEvidenceRecord(result({ lane: 'browser_local', compliance: compliance() }), { mode: 'standard' }, {})
    expect(record.redirectChain).toEqual({ urls: [url, final], complete: false })
    expect(record.robotsDecision).toMatchObject({ decision: 'allowed', robotsSha256: ROBOTS, crawlDelayMs: null })
    expect(record.identity).toEqual({ userAgent: 'Mozilla/5.0 Chrome/140', mode: 'standard', contact: null, device: null, requestHeaders: [] })
    expect(record.outputSha256).toEqual({ markdown: null, json: null })
    // The browser lane does not report the coding Chromium decoded: unknown.
    expect(record.contentEncoding).toBeNull()
  })

  it('says a browser chain is complete when the lane observed every hop', () => {
    const middle = 'https://source.example/middle'
    const observed = result({ lane: 'browser_local', evidence: { ...result().evidence, redirectChain: [url, middle, final], redirectChainComplete: true } })
    expect(toEvidenceRecord(observed, { mode: 'standard' }, {}).redirectChain).toEqual({ urls: [url, middle, final], complete: true })
    const unobserved = result({ lane: 'browser_local', evidence: { ...result().evidence, redirectChainComplete: false } })
    expect(toEvidenceRecord(unobserved, { mode: 'standard' }, {}).redirectChain.complete).toBe(false)
  })

  it('lists the requested URL alone when nothing redirected', () => {
    const plain = result({ evidence: { ...result().evidence, finalUrl: url, redirectChain: [] } })
    expect(toEvidenceRecord(plain, { mode: 'standard' }, {}).redirectChain).toEqual({ urls: [url], complete: true })
  })

  it('has no final URL, chain, response or User-Agent when no request for the page was sent', () => {
    const denied = result({
      status: 'failed', failureReason: 'policy_denied', markdown: null,
      evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
      usage: { ...result().usage, requestCount: 0 },
    }, [httpTrace(researchUserAgent())[0]!, { at: 1, lane: 'http', event: 'robots_checked', detail: { decision: 'disallowed', robotsUrl: 'https://source.example/robots.txt', matchedGroup: '*', ruleCount: 1, crawlDelayMs: null } }])
    const record = toEvidenceRecord(denied, { mode: 'research' }, { markdown: null })
    expect(record).toMatchObject({
      finalUrl: null, redirectChain: { urls: [], complete: true }, fetchedAt: null, httpStatus: null, reason: 'policy_denied', rawSha256: null,
      identity: { userAgent: null, mode: 'research', contact: null, device: null, requestHeaders: null },
    })
    // Recorded before W2L kept the robots.txt hash in the trace: unknown, not invented.
    expect(record.robotsDecision).toEqual({ decision: 'disallowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: null, unreachable: null, crawlDelayMs: null, userOverride: false, overrideBasis: null })
  })

  it('reports a robots override and its basis from the signed record or the trace', () => {
    const robots = { robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, matchedUserAgentGroup: '*', appliedRules: [{ pattern: '/', allow: false }], decision: 'disallowed' as const, skippedFetch: false, crawlDelayMs: null }
    const overridden = compliance({ robots: { ...robots, override: { reason: 'publisher link', recordedBy: 'analyst' } } })
    expect(toEvidenceRecord(result({ lane: 'browser_local', compliance: overridden }), { mode: 'standard' }, {}).robotsDecision).toMatchObject({ decision: 'disallowed', unreachable: null, userOverride: true, overrideBasis: 'robots_override' })
    const named = compliance({ robots: { ...robots, override: { reason: 'the request named this URL', basis: 'user_named_url' } } })
    expect(toEvidenceRecord(result({ lane: 'browser_local', compliance: named }), { mode: 'standard' }, {}).robotsDecision).toMatchObject({ userOverride: true, overrideBasis: 'user_named_url' })
    const trace = [
      { at: 1, lane: 'http' as const, event: 'robots_checked', detail: { decision: 'disallowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, matchedGroup: '*', ruleCount: 1, crawlDelayMs: null } },
      { at: 2, lane: 'http' as const, event: 'robots_disallowed', detail: { url, appliedRules: [{ pattern: '/', allow: false }] } },
      { at: 3, lane: 'http' as const, event: 'robots_overridden', detail: { url, appliedRules: [{ pattern: '/', allow: false }], reason: 'publisher link' } },
    ]
    // An event written before bases existed was the caller's recorded override.
    expect(toEvidenceRecord(result({ trace }), { mode: 'standard' }, {}).robotsDecision).toMatchObject({ decision: 'disallowed', robotsSha256: ROBOTS, userOverride: true, overrideBasis: 'robots_override' })
    const unreachable = [
      { at: 1, lane: 'http' as const, event: 'robots_checked', detail: { decision: 'disallowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: null, matchedGroup: null, ruleCount: 0, crawlDelayMs: null, unreachable: 'timeout' } },
      { at: 2, lane: 'http' as const, event: 'robots_disallowed', detail: { url, appliedRules: [], unreachable: 'timeout' } },
      { at: 3, lane: 'http' as const, event: 'robots_overridden', detail: { url, appliedRules: [], unreachable: 'timeout', reason: 'the request named this URL', basis: 'user_named_url' } },
    ]
    expect(toEvidenceRecord(result({ trace: unreachable }), { mode: 'standard' }, {}).robotsDecision).toEqual({ decision: 'disallowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: null, unreachable: 'timeout', crawlDelayMs: null, userOverride: true, overrideBasis: 'user_named_url' })
  })

  it('keeps an unreachable robots.txt and treats an unconsulted one as no decision', () => {
    const unreachable = compliance({ finalUrl: null, robots: { robotsUrl: 'https://source.example/robots.txt', robotsSha256: null, matchedUserAgentGroup: null, appliedRules: [], decision: 'disallowed', skippedFetch: true, crawlDelayMs: null, unreachable: 'timeout' } })
    expect(toEvidenceRecord(result({ lane: 'provider', compliance: unreachable }), { mode: 'standard' }, {}).robotsDecision).toMatchObject({ decision: 'disallowed', unreachable: 'timeout' })
    const skipped = compliance({ robots: { robotsUrl: null, robotsSha256: null, matchedUserAgentGroup: null, appliedRules: [], decision: 'no_robots', skippedFetch: true } })
    expect(toEvidenceRecord(result({ lane: 'provider', compliance: skipped }), { mode: 'standard' }, {}).robotsDecision).toBeNull()
    expect(toEvidenceRecord(result(), { mode: 'standard' }, {}).robotsDecision).toBeNull()
  })

  it('does not claim a User-Agent the provider lane did not observe', () => {
    const unobserved = result({ lane: 'provider', compliance: compliance() }, [{ at: 1, lane: 'provider', event: 'identity_unobserved', detail: { declared: 'Mozilla/5.0 Chrome/140' } }])
    expect(toEvidenceRecord(unobserved, { mode: 'standard' }, {}).identity.userAgent).toBeNull()
  })

  it('writes an HTTP status of 0 as unknown', () => {
    const zero = result({ lane: 'browser_local', evidence: { ...result().evidence, httpStatus: 0 } })
    expect(toEvidenceRecord(zero, { mode: 'standard' }, {}).httpStatus).toBeNull()
  })

  it('hashes JSON data as canonical JSON and maps field evidence by pointer', () => {
    const json = {
      status: 'complete' as const,
      data: { price: 51.77, title: 'A Light in the Attic', stock: { count: 22, label: 'In stock' } },
      evidence: [
        { path: '/price', source: 'jsonld' as const, evidencePath: '/offers/price' },
        { path: '/title', source: 'dom' as const, evidencePath: 'table[0] tr[0] "Title"' },
        { path: '/stock', source: 'model' as const },
      ],
      issues: [],
    }
    const record = toEvidenceRecord(result(), { mode: 'standard' }, { markdown: null, json })
    expect(record.outputSha256.json).toBe(sha256Utf8('{"price":51.77,"stock":{"count":22,"label":"In stock"},"title":"A Light in the Attic"}'))
    const reordered = toEvidenceRecord(result(), { mode: 'standard' }, { json: { ...json, data: { title: 'A Light in the Attic', stock: { label: 'In stock', count: 22 }, price: 51.77 } } })
    expect(reordered.outputSha256.json).toBe(record.outputSha256.json)
    expect(record.fieldEvidence).toEqual({
      '/price': { source: 'jsonld', locator: '/offers/price' },
      '/title': { source: 'dom', locator: 'table[0] tr[0] "Title"' },
      '/stock': { source: 'model', locator: null },
    })
    expect(toEvidenceRecord(result(), { mode: 'standard' }, { json: { ...json, data: null, evidence: [] } })).toMatchObject({ outputSha256: { json: null }, fieldEvidence: {} })
  })

  it('names a raw snapshot by its content hash, a screenshot by the result\'s own description, and leaves an unknown file unknown', () => {
    const SHOT = 'c'.repeat(64)
    const screenshot = { contentType: 'image/png' as const, width: 1280, height: 800, fullPage: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, quality: null, bytes: 13456, sha256: SHOT, path: `/tmp/raw/${SHOT}.png`, base64: 'iVBO' }
    const withFiles = result({ screenshot, evidence: { ...result().evidence, artifacts: [`/tmp/raw/${RAW}.html`, `/tmp/raw/${SHOT}.png`, '/tmp/other/page.png'] } })
    expect(toEvidenceRecord(withFiles, { mode: 'standard' }, {}).artifacts).toEqual([
      { kind: 'snapshot', path: `/tmp/raw/${RAW}.html`, sha256: RAW, bytes: null, contentType: null },
      { kind: 'screenshot', path: `/tmp/raw/${SHOT}.png`, sha256: SHOT, bytes: 13456, contentType: 'image/png' },
      { kind: null, path: '/tmp/other/page.png', sha256: null, bytes: null, contentType: null },
    ])
  })

  it('lists a file saved as received with its size and type, and names the PDF or file text extractor', () => {
    const path = `/tasks/files/${RAW}.pdf`
    const file = { kind: 'pdf' as const, detectedBy: 'content_type' as const, contentType: 'application/pdf', declaredBytes: 2048, maxBytes: 4096, bytes: 2048, sha256: RAW, path, markdownFrom: 'pdf_text' as const, encoding: null, warnings: [], pdf: null }
    const pdf = toEvidenceRecord(result({ file, evidence: { ...result().evidence, artifacts: [path] } }), { mode: 'standard' }, { markdown: '<!-- page 1 -->\n' }, { sourceCommit: null })
    expect(pdf.artifacts).toEqual([{ kind: 'file', path, sha256: RAW, bytes: 2048, contentType: 'application/pdf' }])
    expect(pdf.extractor).toEqual({ name: 'pdf-text', version: PDF_TEXT_VERSION, commit: null })
    const csv = toEvidenceRecord(result({ file: { ...file, kind: 'csv', contentType: 'text/csv', path: null } }), { mode: 'standard' }, {}, { sourceCommit: null })
    expect(csv).toMatchObject({ artifacts: [], extractor: { name: 'file-text', version: FILE_TEXT_VERSION } })
  })

  it('records the environment proxy and the declared source commit', () => {
    const proxied = result({ evidence: { ...result().evidence, envProxy: '127.0.0.1:7890' } })
    process.env.W2L_SOURCE_COMMIT = '7E2A7B3'
    expect(toEvidenceRecord(proxied, { mode: 'standard' }, {})).toMatchObject({ proxy: '127.0.0.1:7890', extractor: { commit: '7e2a7b3' } })
    process.env.W2L_SOURCE_COMMIT = 'not a commit'
    expect(toEvidenceRecord(proxied, { mode: 'standard' }, {}).extractor.commit).toBeNull()
  })

  it('pageActions lists the steps that ran, the result\'s failed step winning over its trace event', () => {
    const base = { requestedUrl: 'https://example.com/', status: 'failed' as const, failureReason: 'action_failed' as const, blockReason: null, budgetExceeded: null, lane: 'browser_local' as const, escalations: [], markdown: 'x', truncated: false, truncatedAt: null, compliance: null, evidence: { finalUrl: 'https://example.com/', httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] }, usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 1, browserMs: 1, externalCostUsd: null } }
    const trace = [
      { at: 0, lane: 'browser_local' as const, event: 'action', detail: { index: 0, type: 'executeJavascript', outcome: 'ok' } },
      { at: 0, lane: 'browser_local' as const, event: 'action', detail: { index: 1, type: 'click', outcome: 'ok' } },
    ]
    const actions = { screenshots: [], scrapes: [], javascriptReturns: [], pdfs: [], lists: [], failed: { index: 1, type: 'click' as const, code: 'navigation_refused' as const, message: 'm' } }
    expect(toEvidenceRecord({ ...base, trace, actions }, { mode: 'standard' }, {}).pageActions).toEqual({ steps: [{ type: 'executeJavascript', outcome: 'ok' }, { type: 'click', outcome: 'failed' }], scriptRan: true })
    expect(toEvidenceRecord({ ...base, trace }, { mode: 'standard' }, {}).pageActions).toBeNull()
  })
})
