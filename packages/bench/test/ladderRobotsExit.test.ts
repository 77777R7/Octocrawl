import { describe, expect, it } from 'vitest'
import { identityBundleFrom, modeIdentity, type FetchResult, type TraceEvent } from '@w2l/contracts'
import { LadderRunner, type Channel } from '../src/routing/ladder.js'

// A site whose robots.txt the hosted network cannot reach (www.plandent.de, 2026-11-05) may still be read by a call that
// chose access enhanced and holds hosted_chrome: that rung reads robots.txt, and obeys it, from its own exit.

const URL_ = 'https://www.example.com/page'
const IDENTITY = identityBundleFrom(modeIdentity('standard'))
const POLICY: ConstructorParameters<typeof LadderRunner>[1] = { mode: 'standard', enhanced: true, allowlistedDomains: ['www.example.com'] }

function result(fields: Partial<FetchResult> & { httpStatus?: number | null }): FetchResult {
  const { httpStatus = null, ...rest } = fields
  return {
    requestedUrl: URL_, status: 'failed', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [], handoff: null, markdown: null, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: URL_, httpStatus, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 10, bytesWire: 1, bytesDecompressed: 1, requestCount: 0, attemptCount: 1, contentTokens: 12, browserMs: 0, externalCostUsd: 0 } as FetchResult['usage'], trace: [], ...rest,
  }
}
const refusedByRobots = (detail: Record<string, unknown>) => result({ failureReason: 'policy_denied', trace: [{ at: 1, lane: 'http', event: 'robots_disallowed', detail: { url: URL_, appliedRules: [], ...detail } } as TraceEvent] })
const read = () => result({ status: 'success', markdown: 'MAIN CONTENT', httpStatus: 200, lane: 'browser_local' })

function channel(id: string, answers: FetchResult[]): Channel & { calls: number } {
  const lane = { id, identity: IDENTITY, calls: 0, async fetch() { lane.calls += 1; const next = answers.shift(); if (next === undefined) throw new Error(`no answer on ${id}`); return next } }
  return lane as unknown as Channel & { calls: number }
}

describe('a robots.txt the hosted network could not reach, on a call that holds hosted_chrome', () => {
  it('goes straight to hosted_chrome after a timeout or a failed connection: the rungs between share the network that failed', async () => {
    for (const detail of [{ unreachable: 'timeout' }, { unreachable: 'network_error', code: 'ETIMEDOUT' }]) {
      const http = channel('http', [refusedByRobots(detail)])
      const browser = channel('browser_local', [read()])
      const chrome = channel('hosted_chrome', [read()])
      const answer = await new LadderRunner([http, browser, chrome], POLICY, null, null, null).run(URL_)
      expect(answer.result.status).toBe('success')
      expect(answer.channelsTried).toEqual(['http', 'hosted_chrome'])
      expect(browser.calls).toBe(0)
      expect(answer.ladderTrace.find((step) => step.event === 'ladder_step')?.detail).toMatchObject({ escalate: 'robots_unreachable' })
    }
  })

  it('stops at what the site did answer: a redirect loop or a body too large fails the lookup with no connection code', async () => {
    const http = channel('http', [refusedByRobots({ unreachable: 'network_error' })])
    const chrome = channel('hosted_chrome', [read()])
    const answer = await new LadderRunner([http, chrome], POLICY, null, null, null).run(URL_)
    expect(answer.result.failureReason).toBe('policy_denied')
    expect(chrome.calls).toBe(0)
  })

  it('keeps the robots.txt answer when hosted_chrome throws or says nothing of the page', async () => {
    const first = refusedByRobots({ unreachable: 'timeout' })
    const thrown = { ...channel('hosted_chrome', []), throwIsFailure: true, async fetch() { throw new Error('the octocrawl-chrome service answered 503') } } as unknown as Channel
    const answer = await new LadderRunner([channel('http', [first]), thrown], POLICY, null, null, null).run(URL_)
    expect(answer.result).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
    expect(answer.result.trace.some((event) => event.event === 'robots_disallowed')).toBe(true)
    expect(answer.channelsTried).toEqual(['http', 'hosted_chrome'])
  })

  it('reads a site with no HTTPS over http before it spends a paid rung on it', async () => {
    const plain = URL_.replace('https:', 'http:')
    const http = channel('http', [refusedByRobots({ unreachable: 'network_error', code: 'ECONNREFUSED' }), { ...read(), requestedUrl: plain, lane: 'http', evidence: { ...read().evidence, finalUrl: plain } }])
    const chrome = channel('hosted_chrome', [read()])
    const answer = await new LadderRunner([http, chrome], POLICY, null, null, null, { httpFallback: true }).run(URL_)
    expect(answer.result.status).toBe('success')
    expect(chrome.calls).toBe(0)
    expect(answer.result.warnings?.map((warning) => warning.code)).toContain('https_unavailable')
  })

  it('takes the https URL to the exit, never the http one, when a refusal from this network turns out to prove nothing', async () => {
    const plain = URL_.replace('https:', 'http:')
    const asked: string[] = []
    const refused = { ...refusedByRobots({ unreachable: 'network_error', code: 'ECONNRESET' }) }
    const http = channel('http', [refused, { ...refused, requestedUrl: plain, evidence: { ...refused.evidence, finalUrl: plain } }, refused])
    const chrome = { ...channel('hosted_chrome', []), async fetch(url: string) { asked.push(url); return read() } } as unknown as Channel
    const answer = await new LadderRunner([http, chrome], POLICY, null, null, null, { httpFallback: true }).run(URL_)
    expect(asked).toEqual([URL_])
    expect(answer.result.status).toBe('success')
    expect(answer.result.warnings?.map((warning) => warning.code) ?? []).not.toContain('https_unavailable')
  })

  it('reports what happened at the exit: a page that failed there is not a robots.txt out of reach', async () => {
    for (const failureReason of ['connection_error', 'tls_error', 'timeout', 'dns_error'] as const) {
      const failed = result({ failureReason, lane: 'browser_local', trace: [{ at: 1, lane: 'browser_local', event: 'robots_checked', detail: { decision: 'allowed' } } as TraceEvent] })
      const answer = await new LadderRunner([channel('http', [refusedByRobots({ unreachable: 'timeout' })]), channel('hosted_chrome', [failed])], POLICY, null, null, null).run(URL_)
      expect(answer.result.failureReason).toBe(failureReason)
    }
  })

  it('keeps the 403 the site gave an earlier rung when a later rung climbs and nothing better comes', async () => {
    const forbidden = result({ failureReason: 'http_error', httpStatus: 403 })
    const http = channel('http', [forbidden])
    const browser = channel('browser_local', [{ ...refusedByRobots({ unreachable: 'timeout' }), lane: 'browser_local' }])
    const thrown = { ...channel('hosted_chrome', []), throwIsFailure: true, async fetch() { throw new Error('the octocrawl-chrome service answered 503') } } as unknown as Channel
    const answer = await new LadderRunner([http, browser, thrown], POLICY, null, null, null).run(URL_)
    expect(answer.result).toMatchObject({ failureReason: 'http_error', evidence: { httpStatus: 403 } })
  })

  it('still goes on to hosted_chrome for a refusal the http fallback would not act on', async () => {
    const query = `${URL_}?a=1`
    const http = channel('http', [{ ...refusedByRobots({ unreachable: 'network_error', code: 'ECONNREFUSED' }), requestedUrl: query, evidence: { ...read().evidence, finalUrl: query, httpStatus: null } }])
    const chrome = channel('hosted_chrome', [read()])
    await new LadderRunner([http, chrome], POLICY, null, null, null, { httpFallback: true }).run(query)
    expect(chrome.calls).toBe(1)
  })

  it('stops at a rule the site wrote, and at a robots.txt the site answered with a 5xx', async () => {
    for (const detail of [{}, { unreachable: 'server_error' }]) {
      const http = channel('http', [refusedByRobots(detail)])
      const chrome = channel('hosted_chrome', [read()])
      const answer = await new LadderRunner([http, chrome], POLICY, null, null, null).run(URL_)
      expect(answer.result.failureReason).toBe('policy_denied')
      expect(chrome.calls).toBe(0)
    }
  })

  it('stops as before on a call without hosted_chrome: the rung is not in its ladder', async () => {
    const http = channel('http', [refusedByRobots({ unreachable: 'timeout' })])
    const browser = channel('browser_local', [read()])
    const answer = await new LadderRunner([http, browser], POLICY, null, null, null).run(URL_)
    expect(answer.result.failureReason).toBe('policy_denied')
    expect(browser.calls).toBe(0)
  })

  it('does not reach hosted_chrome on a call that did not choose access enhanced, even with the rung in the list', async () => {
    const chrome = channel('hosted_chrome', [read()])
    const answer = await new LadderRunner([channel('http', [refusedByRobots({ unreachable: 'timeout' })]), chrome], { mode: 'standard', allowlistedDomains: ['www.example.com'] }, null, null, null).run(URL_)
    expect(answer.result.failureReason).toBe('policy_denied')
    expect(chrome.calls).toBe(0)
  })

  it('keeps hosted_chrome\'s refusal when its exit finds a rule, or cannot reach robots.txt either', async () => {
    const rule = refusedByRobots({})
    const answer = await new LadderRunner([channel('http', [refusedByRobots({ unreachable: 'timeout' })]), channel('hosted_chrome', [{ ...rule, lane: 'browser_local' }])], POLICY, null, null, null).run(URL_)
    expect(answer.result.failureReason).toBe('policy_denied')
    expect(answer.result.trace[0]!.detail).not.toHaveProperty('unreachable')
    const neither = await new LadderRunner([channel('http', [refusedByRobots({ unreachable: 'timeout' })]), channel('hosted_chrome', [{ ...refusedByRobots({ unreachable: 'timeout' }), lane: 'browser_local' }])], POLICY, null, null, null).run(URL_)
    expect(neither.result.failureReason).toBe('policy_denied')
  })
})
