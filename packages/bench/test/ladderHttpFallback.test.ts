import { describe, expect, it } from 'vitest'
import { identityBundleFrom, modeIdentity, type FetchOptions, type FetchResult, type TraceEvent } from '@w2l/contracts'
import { LadderRunner, type Channel } from '../src/routing/ladder.js'
import { HTTPS_UNAVAILABLE } from '../src/routing/httpFallback.js'

// A site with no working HTTPS (www.micromedica.it, 2026-11-05): https:// fails at the connection and http:// answers.

const SECURE = 'https://www.example.com/page'
const PLAIN = 'http://www.example.com/page'
const IDENTITY = identityBundleFrom(modeIdentity('standard'))
const POLICY: ConstructorParameters<typeof LadderRunner>[1] = { mode: 'standard', allowlistedDomains: ['www.example.com'] }

function result(url: string, fields: Partial<FetchResult> & { httpStatus?: number | null }): FetchResult {
  const { httpStatus = null, ...rest } = fields
  return {
    requestedUrl: url, status: 'failed', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [], handoff: null, markdown: null, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 10, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 12, browserMs: 0, externalCostUsd: 0 } as FetchResult['usage'], trace: [], ...rest,
  }
}
const refused = (url: string, code = 'ECONNREFUSED') => result(url, { failureReason: 'connection_error', trace: [{ at: 1, lane: 'http', event: 'request_failed', detail: { reason: 'connection_error', code } } as TraceEvent], usage: { wallMs: 10, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 1, contentTokens: null, browserMs: 0, externalCostUsd: 0 } as FetchResult['usage'] })
const read = (url: string) => result(url, { status: 'success', markdown: 'MAIN CONTENT', httpStatus: 200 })
const robotsUnreachable = (url: string, unreachable: string, code?: string) => result(url, { failureReason: 'policy_denied', trace: [{ at: 1, lane: 'http', event: 'robots_disallowed', detail: { url, appliedRules: [], unreachable, ...(code === undefined ? {} : { code }) } } as TraceEvent] })
const tlsFailed = (url: string, code: string) => result(url, { failureReason: 'tls_error', trace: [{ at: 1, lane: 'http', event: 'request_failed', detail: { reason: 'tls_error', code } } as TraceEvent] })

function channel(responses: Record<string, FetchResult[]>): Channel & { calls: string[] } {
  const calls: string[] = []
  return { id: 'http', identity: IDENTITY, calls, async fetch(url: string) { calls.push(url); const next = responses[url]?.shift(); if (next === undefined) throw new Error(`no answer for ${url}`); return next } } as Channel & { calls: string[] }
}
const ON = { httpFallback: true }
const run = (lane: Channel, url = SECURE, options: FetchOptions = {}, policy = POLICY, session: Parameters<LadderRunner['run']>[1] = null, execution = {}) => new LadderRunner([lane], policy, null, null, null, ON).run(url, session, execution, options)

describe('an https page whose site has no working HTTPS', () => {
  it('reads it over http, keeps the URL asked for, and says so', async () => {
    const lane = channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [read(PLAIN)] })
    const answer = await run(lane)
    expect(lane.calls).toEqual([SECURE, PLAIN])
    expect(answer.result).toMatchObject({ status: 'success', requestedUrl: SECURE, evidence: { finalUrl: PLAIN, httpStatus: 200 } })
    const warning = answer.result.warnings?.find((held) => held.code === HTTPS_UNAVAILABLE)
    expect(warning?.message).toContain(SECURE)
    expect(warning?.message).toContain(PLAIN)
    expect(answer.result.trace.at(-1)).toMatchObject({ event: 'https_fallback', detail: { from: SECURE, to: PLAIN, reason: 'ECONNREFUSED', reached: true } })
    expect(answer.channelsTried).toEqual(['http', 'http'])
    expect(answer.summary.attempts).toHaveLength(2)
    expect(answer.ladderTrace.some((step) => step.event === 'https_fallback')).toBe(true)
  })

  it('tries http when robots.txt was refused or reset, and reads that origin\'s robots.txt', async () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET']) {
      const lane = channel({ [SECURE]: [robotsUnreachable(SECURE, 'network_error', code)], [PLAIN]: [read(PLAIN)] })
      expect((await run(lane)).result.status).toBe('success')
      expect(lane.calls).toEqual([SECURE, PLAIN])
    }
  })

  it('tries http after a plain server answered the handshake, and after no other TLS failure', async () => {
    const lane = channel({ [SECURE]: [tlsFailed(SECURE, 'ERR_SSL_WRONG_VERSION_NUMBER')], [PLAIN]: [read(PLAIN)] })
    expect((await run(lane)).result.status).toBe('success')
    for (const code of ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_COMPAT_TRANSPORT', 'EPROTO']) {
      const held = channel({ [SECURE]: [tlsFailed(SECURE, code)] })
      expect((await run(held)).result.failureReason).toBe('tls_error')
      expect(held.calls).toEqual([SECURE])
    }
  })

  it('never reads around a certificate through robots.txt: its failure comes as a network error first', async () => {
    const first = result(SECURE, { failureReason: 'tls_error', trace: [
      { at: 1, lane: 'http', event: 'robots_disallowed', detail: { url: SECURE, appliedRules: [], unreachable: 'network_error', code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } } as TraceEvent,
      { at: 2, lane: 'http', event: 'request_failed', detail: { reason: 'tls_error', code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } } as TraceEvent,
    ] })
    const lane = channel({ [SECURE]: [first] })
    await run(lane)
    expect(lane.calls).toEqual([SECURE])
  })

  it('takes a certificate error the client files as a connection error for what it is', async () => {
    const lane = channel({ [SECURE]: [refused(SECURE, 'INVALID_PURPOSE')] })
    await run(lane)
    expect(lane.calls).toEqual([SECURE])
  })

  it('does not fall back when a later rung saw a certificate fail', async () => {
    const browserFailed = { ...tlsFailed(SECURE, 'net::ERR_CERT_DATE_INVALID'), lane: 'browser_local' as const }
    const http = channel({ [SECURE]: [refused(SECURE, 'ECONNRESET')] })
    const browser = { ...channel({ [SECURE]: [browserFailed] }), id: 'browser_local' } as Channel & { calls: string[] }
    await new LadderRunner([http, browser], POLICY, null, null, null, ON).run(SECURE)
    expect(http.calls).toEqual([SECURE])
  })

  it('stays on the answer it had for a timeout, a 5xx, a robots.txt that timed out or failed otherwise, and a failed redirect', async () => {
    const moved = 'https://www.example.com/moved'
    for (const first of [
      result(SECURE, { failureReason: 'timeout' }), result(SECURE, { failureReason: 'http_error', httpStatus: 503 }), robotsUnreachable(SECURE, 'timeout'), robotsUnreachable(SECURE, 'server_error'), robotsUnreachable(SECURE, 'network_error'),
      robotsUnreachable(SECURE, 'network_error', 'UND_ERR_SOCKET'), result(SECURE, { failureReason: 'dns_error' }), refused(SECURE, 'EHOSTUNREACH'),
      { ...refused(SECURE), evidence: { ...refused(SECURE).evidence, finalUrl: moved, redirectChain: [SECURE, moved] } },
      // robots.txt set aside by an override, and then a timeout: the page's own failure says nothing of HTTPS.
      { ...robotsUnreachable(SECURE, 'network_error', 'ECONNRESET'), failureReason: 'timeout' as const },
    ]) {
      const lane = channel({ [SECURE]: [first] })
      await run(lane)
      expect(lane.calls).toEqual([SECURE])
    }
  })

  it('takes a robots.txt the site served over https as HTTPS working, whatever happened to the page', async () => {
    for (const detail of [{ decision: 'allowed' }, { decision: 'no_robots' }, { decision: 'disallowed', unreachable: 'server_error' }]) {
      const first = refused(SECURE, 'ECONNRESET')
      const lane = channel({ [SECURE]: [{ ...first, trace: [{ at: 0, lane: 'http', event: 'robots_checked', detail } as TraceEvent, ...first.trace] }] })
      await run(lane)
      expect(lane.calls).toEqual([SECURE])
    }
    // A lookup that failed like the page did proves nothing against it.
    const first = refused(SECURE, 'ECONNRESET')
    const lane = channel({ [SECURE]: [{ ...first, trace: [{ at: 0, lane: 'http', event: 'robots_checked', detail: { decision: 'disallowed', unreachable: 'network_error' } } as TraceEvent, ...first.trace] }], [PLAIN]: [read(PLAIN)] })
    expect((await run(lane)).result.status).toBe('success')
  })

  it('is off unless the runner was told: a proxy\'s refusal says nothing of the site', async () => {
    const lane = channel({ [SECURE]: [refused(SECURE)] })
    await new LadderRunner([lane], POLICY, null, null, null).run(SECURE)
    expect(lane.calls).toEqual([SECURE])
  })

  it('sends nothing a caller meant for https over plain http', async () => {
    const cookieSession = { id: 'c', cookieHeader: async () => '', store: async () => {} }
    const lanes: Array<Channel & { calls: string[] }> = []
    const lane = (url = SECURE) => { const made = channel({ [url]: [refused(url)] }); lanes.push(made); return made }
    await run(lane(), SECURE, { headers: { 'x-token': 'abc' } })
    await run(lane(), SECURE, { actions: [{ type: 'write', text: 'hunter2' }] } as unknown as FetchOptions)
    await run(lane('https://user:secret@www.example.com/page'), 'https://user:secret@www.example.com/page')
    await run(lane(`${SECURE}?token=abc`), `${SECURE}?token=abc`)
    await run(lane(), SECURE, {}, POLICY, null, { cookieSession })
    for (const made of lanes) expect(made.calls).toHaveLength(1)
    const authed = channel({ [SECURE]: [refused(SECURE)] })
    await new LadderRunner([authed], { mode: 'authed', allowlistedDomains: ['www.example.com'] }, null, null, null, ON).run(SECURE)
    expect(authed.calls).toEqual([SECURE])
  })

  it('does not carry a robots override to an address nobody named', async () => {
    const seen: boolean[] = []
    const lane = channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [read(PLAIN)] })
    const fetch = lane.fetch.bind(lane) as (url: string) => Promise<FetchResult>
    lane.fetch = (async (url: string, ...rest: unknown[]) => { seen.push(rest.some((arg) => typeof arg === 'object' && arg !== null && 'robotsOverride' in arg)); return fetch(url) }) as Channel['fetch'] & typeof lane.fetch
    await run(lane, SECURE, { robotsOverride: { reason: 'named', basis: 'named_url' } as unknown as FetchOptions['robotsOverride'] })
    expect(seen).toEqual([true, false])
  })

  it('records no redirect that did not happen, and says what came of the try', async () => {
    const answer = await run(channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [read(PLAIN)] }))
    expect(answer.result.evidence.redirectChain).toEqual([PLAIN])
    const warning = (fields: FetchResult) => fields.warnings?.find((held) => held.code === HTTPS_UNAVAILABLE)?.message
    expect(warning(answer.result)).toContain('unencrypted')
    const forbidden = await run(channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [result(PLAIN, { status: 'blocked', httpStatus: 403 })] }))
    expect(warning(forbidden.result)).toContain('was asked for instead')
    expect(warning(forbidden.result)).not.toContain('read from')
    const upgraded = read('https://example.com/page')
    const sent = await run(channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [{ ...upgraded, requestedUrl: PLAIN, evidence: { ...upgraded.evidence, redirectChain: [PLAIN, 'https://example.com/page'] } }] }))
    expect(warning(sent.result)).toContain('sent the request on to https://example.com/page')
    expect(warning(sent.result)).not.toContain('unencrypted')
  })

  it('keeps the https failure when http reaches nothing either, and says http was tried', async () => {
    const lane = channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [result(PLAIN, { failureReason: 'timeout' })] })
    const answer = await run(lane)
    expect(lane.calls).toEqual([SECURE, PLAIN])
    expect(answer.result).toMatchObject({ failureReason: 'connection_error', requestedUrl: SECURE })
    expect(answer.result.warnings?.some((held) => held.code === HTTPS_UNAVAILABLE)).not.toBe(true)
    expect(answer.ladderTrace.find((step) => step.event === 'https_fallback')?.detail).toMatchObject({ to: PLAIN, reached: false })
  })

  it('gives what http answered when the site did answer: a refusal, or a rule in its robots.txt', async () => {
    const forbidden = channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [result(PLAIN, { status: 'blocked', httpStatus: 403 })] })
    expect((await run(forbidden)).result).toMatchObject({ status: 'blocked', requestedUrl: SECURE, evidence: { httpStatus: 403 } })
    const rule = result(PLAIN, { failureReason: 'policy_denied', trace: [{ at: 1, lane: 'http', event: 'robots_disallowed', detail: { url: PLAIN, appliedRules: [{ pattern: '/', allow: false }] } } as TraceEvent] })
    const kept = channel({ [SECURE]: [refused(SECURE)], [PLAIN]: [rule] })
    expect((await run(kept)).result.failureReason).toBe('policy_denied')
  })

  it('leaves an http URL, and a page https read, alone', async () => {
    const plain = channel({ [PLAIN]: [refused(PLAIN)] })
    await run(plain, PLAIN)
    expect(plain.calls).toEqual([PLAIN])
    const secure = channel({ [SECURE]: [read(SECURE)] })
    expect((await run(secure)).result.warnings ?? []).toEqual([])
    expect(secure.calls).toEqual([SECURE])
  })
})
