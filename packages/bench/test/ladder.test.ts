import { describe, expect, it } from 'vitest'
import { createSpendLedger } from '@w2l/http-core'
import { contractSha256, VERIFIER_VERSION } from '@w2l/runtime'
import { EXTRACTOR_VERSION } from '@w2l/extract-tf'
import {
  CONTENTFUL_STATUS,
  identityBundleFrom,
  modeIdentity,
  paidCallsOfError,
  QUALITY_ESCALATION_MAX_CONFIDENCE,
  RENDERED_LOW_YIELD_MAX_TOKENS,
  type FetchOptions,
  type FetchResult,
  type HandoffRequest,
  type IdentityBundle,
  type PaidCallLog,
  type PaidCallRecord,
  type RobotsOverrideApplied,
} from '@w2l/contracts'
import { egressProxyRefusedWarning, LadderRunner, sessionRejection, type Channel, type HumanHandoff } from '../src/routing/ladder.js'
import { INSTALLED_CHROME_INSTALL } from '../src/subjects/installedChrome.js'
import { MemoryRoutingHistory, type RoutingHistory } from '../src/routing/vendorRouter.js'
import { loadSessionForHost, MemorySessionStore, sessionCoversHost, type SessionSnapshot } from '../src/routing/sessionStore.js'

const COHERENT = identityBundleFrom(modeIdentity('standard'))

function blockedResult(url: string, blockReason: FetchResult['blockReason']): FetchResult {
  return {
    requestedUrl: url,
    status: 'blocked',
    failureReason: null,
    blockReason,
    budgetExceeded: null,
    lane: 'http',
    escalations: [],
    handoff: null,
    markdown: null,
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: { finalUrl: url, httpStatus: 403, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 10, bytesWire: 0, bytesDecompressed: 0, requestCount: 1, attemptCount: 1, contentTokens: null, browserMs: 0, externalCostUsd: null },
    trace: [],
  }
}

function contentfulResult(url: string, lane: FetchResult['lane'], wallMs = 50): FetchResult {
  return {
    requestedUrl: url,
    status: 'success',
    failureReason: null,
    blockReason: null,
    budgetExceeded: null,
    lane,
    escalations: [],
    handoff: null,
    markdown: 'MAIN CONTENT',
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 12, browserMs: 0, externalCostUsd: null },
    trace: [],
  }
}

function failedResult(url: string, failureReason: FetchResult['failureReason']): FetchResult {
  return {
    ...blockedResult(url, null),
    status: 'failed',
    failureReason,
  }
}

function providerErrorResult(url: string, vendorId: string): FetchResult {
  return {
    ...failedResult(url, 'provider_error'),
    lane: 'provider',
    trace: [{ at: 0, lane: 'provider', event: 'provider_failed', detail: { vendor: vendorId } }],
  }
}

/** The ladder's decisions, without the `ladder_channel_started` event each rung's start adds, or the shadow decisions (F4). */
function decisions<T extends { event: string }>(trace: readonly T[]): T[] {
  return trace.filter((event) => event.event !== 'ladder_channel_started' && event.event !== 'ladder_action_decision')
}

function channel(
  id: string,
  responses: FetchResult[],
  vendorId?: string,
  identity: IdentityBundle | undefined = COHERENT,
): Channel & { calls: string[] } {
  const calls: string[] = []
  return {
    id,
    vendorId,
    // A provider fixture is free: a known ceiling of 0 (ROADMAP PA item 4 calls no provider without one).
    ...(vendorId === undefined ? {} : { priceCeilingUsd: 0 }),
    identity,
    calls,
    async fetch(url: string): Promise<FetchResult> {
      calls.push(url)
      const r = responses.shift()
      if (r === undefined) throw new Error(`channel ${id} exhausted`)
      return r
    },
  }
}

const ALLOWED_ALL: ConstructorParameters<typeof LadderRunner>[1] = { mode: 'authed', allowlistedDomains: ['example.com', '*.example.net'] }

describe('LadderRunner', () => {
  it('stops at http when http is contentful — no escalation is cheaper', async () => {
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    expect(run.result.lane).toBe('http')
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toEqual([])
  })

  it('escalates bot_gate from http to the next channel', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  it('records two-level end-to-end time separately from summed attempt wallMs', async () => {
    const http: Channel = { id: 'http', identity: COHERENT, fetch: async url => { await new Promise(resolve => setTimeout(resolve, 25)); return { ...blockedResult(url, 'cloudflare_challenge'), usage: { ...blockedResult(url, 'cloudflare_challenge').usage, wallMs: 100 } } } }
    const browser: Channel = { id: 'browser_local', identity: COHERENT, fetch: async url => { await new Promise(resolve => setTimeout(resolve, 25)); return { ...contentfulResult(url, 'browser_local'), usage: { ...contentfulResult(url, 'browser_local').usage, wallMs: 100 } } } }
    const run = await new LadderRunner([http, browser], { mode: 'authed' }).run('https://example.com/p')
    expect(run.summary.wallMs).toBe(200)
    expect(run.summary.totalMs).toBeGreaterThanOrEqual(45)
    expect(run.summary.totalMs).toBeLessThan(run.summary.wallMs)
  })

  it('does NOT escalate rate_limited — slowing down is the fix, not a stronger lane', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'rate_limit')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.blockReason).toBe('rate_limit')
    expect(run.channelsTried).toEqual(['http'])
    expect(browser.calls).toEqual([])
  })

  it.each(['bot_detected_generic', 'captcha'] as const)('climbs past a %s challenge served with 429, on the same exit only (ADR 0005)', async (reason) => {
    // K1 T007/T042/T037/T018: a vendor's challenge with 429 and no Retry-After stopped the run at http. The browser
    // rung shares the origin's cooldown, so it still waits the site's time; a vendor rung would leave through another exit.
    const url = 'https://example.com/p'
    const challenged: FetchResult = { ...blockedResult(url, reason), evidence: { ...blockedResult(url, reason).evidence, httpStatus: 429 }, retryAt: Date.now() + 250 }
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const vendor = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    const run = await new LadderRunner([channel('http', [challenged]), vendor, browser], { mode: 'research' }).run(url)
    expect(run.result.status).toBe('success')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(vendor.calls).toEqual([])
  })

  it('stops at a challenge served with 429 whose Retry-After the next rung would spend its time waiting out', async () => {
    const url = 'https://example.com/p'
    const challenged: FetchResult = { ...blockedResult(url, 'captcha'), evidence: { ...blockedResult(url, 'captcha').evidence, httpStatus: 429 }, retryAt: Date.now() + 60_000 }
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const run = await new LadderRunner([channel('http', [challenged]), browser], { mode: 'research' }).run(url)
    expect(run.result.blockReason).toBe('captcha')
    expect(run.result.retryAt).toBe(challenged.retryAt)
    expect(browser.calls).toEqual([])
  })

  it('still stops at a challenge served with 429 when only vendor rungs are left', async () => {
    const url = 'https://example.com/p'
    const challenged: FetchResult = { ...blockedResult(url, 'bot_detected_generic'), evidence: { ...blockedResult(url, 'bot_detected_generic').evidence, httpStatus: 429 }, retryAt: Date.now() + 250 }
    const vendor = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    const run = await new LadderRunner([channel('http', [challenged]), vendor], { mode: 'research' }).run(url)
    expect(run.result.blockReason).toBe('bot_detected_generic')
    expect(run.channelsTried).toEqual(['http'])
    expect(vendor.calls).toEqual([])
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', channel: 'provider', detail: { vendorId: 'steel', reason: expect.stringContaining('429') } }))
  })

  it('governance refuses a URL outside the allowlist before any channel runs', async () => {
    const http = channel('http', [contentfulResult('https://evil.test/p', 'http')])
    const runner = new LadderRunner([http], ALLOWED_ALL)

    const run = await runner.run('https://evil.test/p')
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('policy_denied')
    expect(run.channelsTried).toEqual([])
    expect(http.calls).toEqual([])
  })

  it('governance admits wildcarded hosts', async () => {
    const http = channel('http', [contentfulResult('https://shop.example.net/p', 'http')])
    const runner = new LadderRunner([http], ALLOWED_ALL)
    const run = await runner.run('https://shop.example.net/p')
    expect(run.result.status).toBe('success')
  })

  it('mode gates channels: standard mode never reaches a provider', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const vendor = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, vendor], { mode: 'standard' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('blocked')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(vendor.calls).toEqual([])
  })
})

describe('LadderRunner — multi-vendor routing', () => {
  it('tries vendors in declaration order with no history', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, bb, steel], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    expect(bb.calls).toHaveLength(1)
    expect(steel.calls).toHaveLength(0)
  })

  it('fails over to the second vendor on provider_error', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [providerErrorResult('https://example.com/p', 'browserbase')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, bb, steel], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    expect(bb.calls).toHaveLength(1)
    expect(steel.calls).toHaveLength(1)
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'provider', 'provider'])
  })

  it('history ranking promotes a vendor with better domain success', async () => {
    const history = new MemoryRoutingHistory()
    // Steel has 5/5 contentful on this domain, Browserbase 0/3.
    for (let i = 0; i < 5; i++) {
      await history.record('example.com', 'steel', { contentful: true, wallMs: 800, costUsd: 0.01, failureClass: null })
    }
    for (let i = 0; i < 3; i++) {
      await history.record('example.com', 'browserbase', { contentful: false, wallMs: 900, costUsd: 0.01, failureClass: 'provider_error' })
    }

    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([http, browser, bb, steel], { mode: 'authed' }, history)

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('success')
    // Steel went first and won; browserbase never ran.
    expect(steel.calls).toHaveLength(1)
    expect(bb.calls).toHaveLength(0)
  })

  it('records vendor outcomes against domain history', async () => {
    const history = new MemoryRoutingHistory()
    const http = channel('http', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'bot_detected_generic')])
    const bb = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'browserbase')
    const runner = new LadderRunner([http, browser, bb], { mode: 'authed' }, history)

    await runner.run('https://example.com/p')
    const recorded = await history.read('example.com')
    expect(recorded.vendors.browserbase).toMatchObject({ attempts: 1, contentful: 1 })
  })
})

describe('LadderRunner — human handoff', () => {
  const handoffRequest: HandoffRequest = {
    reason: 'captcha_required',
    liveViewUrl: 'https://live.example/session-1',
    rationale: 'The target demands human verification.',
  }

  it('pauses and returns the handoff request when a channel asks for it', async () => {
    const http = channel('http', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const browser = channel('browser_local', [blockedResult('https://example.com/p', 'cloudflare_challenge')])
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
    ], 'steel')
    const runner = new LadderRunner([http, browser, vendor], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.handoffRequested).toBe(true)
    expect(run.result.handoff?.liveViewUrl).toBe('https://live.example/session-1')
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'provider'])
  })

  it('invokes the human, saves nothing, and retries the same channel with the snapshot', async () => {
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'test',
      attestedAt: new Date().toISOString(),
      vendor: 'browser_local_authed',
      cookies: [{ name: 'sid', value: 'secret', domain: '.example.com', path: '/' }],
    }
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
      contentfulResult('https://example.com/p', 'provider'),
    ], 'steel')
    const received: { url: string; request: HandoffRequest }[] = []
    const handoff: HumanHandoff = {
      async takeOver(url, request) {
        received.push({ url, request })
        return session
      },
    }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(received).toHaveLength(1)
    expect(received[0]!.request.liveViewUrl).toBe('https://live.example/session-1')
    expect(run.result.status).toBe('success')
    expect(run.channelsTried).toEqual(['provider', 'provider(retry)'])
    // The human acted and the retry succeeded: the run is DONE, not still
    // asking. "Still needs a human" must never follow a completed takeover.
    expect(run.handoffRequested).toBe(false)
  })

  it('a failed retry after the human acts is reported as a failed retry, not as still needing a human', async () => {
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'human',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'steel',
    }
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
      blockedResult('https://example.com/p', 'captcha'),
    ], 'steel')
    const handoff: HumanHandoff = { async takeOver() { return session } }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider(retry)'])
    expect(run.result.status).toBe('blocked')
    expect(run.handoffRequested).toBe(false)
    expect(run.ladderTrace.some((t) => t.event === 'ladder_handoff_retry_failed')).toBe(true)
  })

  it('aborts when the human declines', async () => {
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
      contentfulResult('https://example.com/p', 'provider'),
    ], 'steel')
    const handoff: HumanHandoff = { async takeOver() { return null } }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('blocked')
    expect(run.channelsTried).toEqual(['provider'])
  })

  it('with no human configured, reports the pause point instead of looping', async () => {
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
    ], 'steel')
    const runner = new LadderRunner([vendor], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.handoffRequested).toBe(true)
    expect(run.channelsTried).toEqual(['provider'])
  })
})

describe('LadderRunner — consuming FetchResult.escalations', () => {
  function thinHttpSuccess(url: string): FetchResult {
    const r = contentfulResult(url, 'http')
    return {
      ...r,
      usage: { ...r.usage, contentTokens: 60 },
      trace: [
        ...r.trace,
        { at: 10, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 60, confidence: 0.2 } },
      ],
    }
  }

  function emptyUnverified(url: string): FetchResult {
    return {
      ...failedResult(url, 'empty_unverified'),
      escalations: [{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }],
    }
  }

  it('honours an empty_unverified subject escalation and tries the next rung', async () => {
    const http = channel('http', [emptyUnverified('https://example.com/p')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  it('escalates a thin, low-confidence http success to the browser (quality signal)', async () => {
    const http = channel('http', [thinHttpSuccess('https://example.com/p')])
    // The browser genuinely improves on the thin http answer.
    const browser = channel('browser_local', [
      {
        ...contentfulResult('https://example.com/p', 'browser_local'),
        usage: { ...contentfulResult('https://example.com/p', 'browser_local').usage, contentTokens: 800 },
      },
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  it('numbers each attempt and says when its rung was asked and answered, and which vendor a provider rung was', async () => {
    const url = 'https://example.com/p'
    const browser = channel('browser_local', [{ ...contentfulResult(url, 'browser_local'), usage: { ...contentfulResult(url, 'browser_local').usage, contentTokens: 800 } }])
    const vendor = { ...channel('provider', [contentfulResult(url, 'browser_local')]), vendorId: 'steel', priceCeilingUsd: 0 }
    const run = await new LadderRunner([channel('http', [thinHttpSuccess(url)]), browser, vendor], { mode: 'research' }).run(url)
    const attempts = run.summary.attempts
    expect(attempts.map((a) => [a.channel, a.ordinal, a.vendorId])).toEqual([['http', 1, undefined], ['browser_local', 2, undefined]])
    for (const a of attempts) expect(Date.parse(a.endedAt!)).toBeGreaterThanOrEqual(Date.parse(a.startedAt!))
    expect(Date.parse(attempts[1]!.startedAt!)).toBeGreaterThanOrEqual(Date.parse(attempts[0]!.endedAt!))
    const failing = channel('browser_local', [{ ...contentfulResult(url, 'browser_local'), status: 'blocked', blockReason: 'bot_detected_generic', markdown: null }])
    const viaVendor = await new LadderRunner([failing, vendor], { mode: 'research' }).run(url)
    expect(viaVendor.summary.attempts.at(-1)).toMatchObject({ channel: 'provider', ordinal: 2, vendorId: 'steel' })
  })

  it('offers a thin answer of the compatible http rung to the browser too, and leaves out a rung that does not serve the URL', async () => {
    const url = 'https://example.com/p'
    const compat = channel('http_compat', [thinHttpSuccess(url)])
    const plain = { ...channel('http', [contentfulResult(url, 'http')]), serves: () => false }
    const browser = channel('browser_local', [{ ...contentfulResult(url, 'browser_local'), usage: { ...contentfulResult(url, 'browser_local').usage, contentTokens: 800 } }])
    const run = await new LadderRunner([plain, compat, browser], { mode: 'standard' }).run(url)
    expect(run.channelsTried).toEqual(['http_compat', 'browser_local'])
    expect(run.result.lane).toBe('browser_local')
  })

  function clientRenderedHttpSuccess(url: string): FetchResult {
    const r = contentfulResult(url, 'http')
    return {
      ...r,
      warnings: [{ code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (empty_table_with_scripts); this HTTP capture may be a shell.' }],
      trace: [...r.trace, { at: 10, lane: 'http', event: 'quality_client_rendered', detail: { reason: 'empty_table_with_scripts', markers: [], emptyTables: 1, textChars: 180, scriptChars: 1_500 } }],
    }
  }

  it('says when the browser rung could not start because no browser is installed, and not for any other failure', async () => {
    const url = 'https://example.com/p'
    const noBrowser: FetchResult = { ...failedResult(url, 'connection_error'), lane: 'browser_local', trace: [{ at: 1, lane: 'browser_local', event: 'browser_unavailable', detail: { install: 'npx playwright install chromium' } }] }
    // A thin client-rendered http page stays the answer, with the warning that names the install.
    const thin = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [noBrowser])], { mode: 'authed' }).run(url)
    expect(thin.result).toMatchObject({ status: 'success', lane: 'http' })
    expect(thin.result.warnings).toContainEqual({ code: 'browser_not_installed', message: 'the browser lane could not start: Chromium is not installed where Octocrawl runs; run npx playwright install chromium once' })
    // An http page with no main content kept as evidence carries it too.
    const evidence = { ...emptyUnverified(url), markdown: 'NAV ONLY', evidence: { ...emptyUnverified(url).evidence, httpStatus: 200 } }
    const kept = await new LadderRunner([channel('http', [evidence]), channel('browser_local', [noBrowser])], { mode: 'authed' }).run(url)
    expect(kept.result).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http' })
    expect(kept.result.warnings?.filter((warning) => warning.code === 'browser_not_installed')).toHaveLength(1)
    // A browser that started and failed to connect is not a missing browser.
    const offline = { ...noBrowser, trace: [] }
    const other = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [offline])], { mode: 'authed' }).run(url)
    expect(other.result.warnings?.some((warning) => warning.code === 'browser_not_installed') ?? false).toBe(false)
    // Patchright's browser is its own build: the warning names Patchright's command, as the rung's trace did.
    const noPatchright = { ...noBrowser, trace: [{ at: 1, lane: 'browser_local' as const, event: 'browser_unavailable', detail: { engine: 'patchright', install: 'npx patchright install chromium' } }] }
    const patched = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [noPatchright])], { mode: 'authed' }).run(url)
    expect(patched.result.warnings).toContainEqual({ code: 'browser_not_installed', message: 'the browser lane could not start: Chromium is not installed where Octocrawl runs; run npx patchright install chromium once' })
    // The installed_chrome rung, after a browser lane the page blocked, needs Google Chrome itself: its warning says so.
    const noChrome = { ...noBrowser, trace: [{ at: 1, lane: 'browser_local' as const, event: 'browser_unavailable', detail: { engine: 'installed_chrome', install: INSTALLED_CHROME_INSTALL } }] }
    const gated = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'browser_local' as const }
    const chromeRun = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [gated]), channel('installed_chrome', [noChrome])], { mode: 'standard', enhanced: true }).run(url)
    expect(chromeRun.channelsTried).toEqual(['http', 'browser_local', 'installed_chrome'])
    expect(chromeRun.result.warnings?.filter((warning) => warning.code === 'browser_not_installed')).toEqual([
      { code: 'browser_not_installed', message: `the installed_chrome rung could not start: Google Chrome is not installed where Octocrawl runs; ${INSTALLED_CHROME_INSTALL}` },
    ])
  })

  it('records when each rung started with the run\'s time left, and why a rung that says so was left out', async () => {
    const url = 'https://example.com/p'
    const gated = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'browser_local' as const }
    const chrome = { ...channel('installed_chrome', [contentfulResult(url, 'browser_local')]), refusal: (_u: string, options: FetchOptions) => options.mobile === true ? 'takes no mobile' : null }
    const deadlineAt = Date.now() + 60_000
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [gated]), chrome], { mode: 'standard', enhanced: true }).run(url, null, { deadlineAt })
    const started = run.ladderTrace.filter((event) => event.event === 'ladder_channel_started')
    expect(started.map((event) => event.channel)).toEqual(['http', 'browser_local', 'installed_chrome'])
    for (const event of started) expect(event.detail?.remainingMs).toBeGreaterThan(50_000)
    expect(run.ladderTrace.some((event) => event.event === 'ladder_channel_not_served')).toBe(false)
    const mobile = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), { ...chrome, calls: [] }], { mode: 'standard', enhanced: true }).run(url, null, {}, { mobile: true })
    expect(mobile.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_not_served', channel: 'installed_chrome', detail: { reason: 'takes no mobile' } }))
    expect(mobile.channelsTried).toEqual(['http'])
    // A provider rung passed over for want of a price ceiling was never called, so it is not counted as started.
    const unpriced = { ...channel('provider', [contentfulResult(url, 'provider')], 'acme'), priceCeilingUsd: undefined }
    const passed = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), unpriced], { mode: 'research' }).run(url)
    expect(passed.ladderTrace.filter((event) => event.event === 'ladder_channel_started').map((event) => event.channel)).toEqual(['http'])
    // Without a deadline the time left is not known.
    expect(mobile.ladderTrace.find((event) => event.event === 'ladder_channel_started')?.detail?.remainingMs).toBeNull()
  })

  it('asks a rung with its own admission before it runs: a refusal skips it, the earlier answer stands, and the result and trace say why', async () => {
    const url = 'https://example.com/p'
    const gated = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'browser_local' as const }
    const settled: [string | null, boolean][] = []
    const warning = { code: 'hosted_chrome_not_admitted', message: 'not today' }
    const refusing = { ...channel('hosted_chrome', [contentfulResult(url, 'browser_local')]), admit: async () => ({ ok: false as const, reason: 'daily_attempts', warning, detail: { limit: 2 } }) }
    const refused = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [gated]), refusing], { mode: 'standard', enhanced: true }).run(url)
    expect(refusing.calls).toEqual([])
    expect(refused.channelsTried).toEqual(['http', 'browser_local'])
    expect(refused.result).toMatchObject({ status: 'blocked', lane: 'browser_local' })
    expect(refused.result.warnings).toContainEqual(warning)
    expect(refused.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', channel: 'hosted_chrome', detail: { reason: 'daily_attempts', limit: 2 } }))
    // Admitted: the rung runs, and its admission is settled once with what it read; a read that threw is settled with none.
    const admitted = { ...channel('hosted_chrome', [contentfulResult(url, 'browser_local')]), admit: async () => ({ ok: true as const, settle: async (result: FetchResult | null, called: boolean) => { settled.push([result?.status ?? null, called]) } }) }
    const read = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [gated]), admitted], { mode: 'standard', enhanced: true }).run(url)
    expect(read.channelsTried).toEqual(['http', 'browser_local', 'hosted_chrome'])
    expect(read.result.warnings?.some((held) => held.code === 'hosted_chrome_not_admitted') ?? false).toBe(false)
    expect(settled).toEqual([['success', true]])
    settled.length = 0
    const throwing = { ...admitted, fetch: async () => { throw new Error('the service went away') } }
    await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [gated]), throwing], { mode: 'standard', enhanced: true }).run(url).catch(() => null)
    expect(settled).toEqual([[null, true]])
    // A run cut while the admission is still answering: the late admission is settled as a call that never went out.
    settled.length = 0
    const controller = new AbortController()
    const slow = { ...admitted, admit: async () => { controller.abort(new Error('the caller left')); await new Promise((resolve) => setTimeout(resolve, 5)); return { ok: true as const, settle: async (result: FetchResult | null, called: boolean) => { settled.push([result?.status ?? null, called]) } } } }
    await expect(new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [gated]), slow], { mode: 'standard', enhanced: true }).run(url, null, { signal: controller.signal })).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(settled).toEqual([[null, false]])
  })

  it('leaves out a provider rung that refuses the request, and says why (PA B4)', async () => {
    const url = 'https://example.com/p'
    const provider = { ...channel('provider', [contentfulResult(url, 'provider')], 'acme'), refusal: (_url: string, options: FetchOptions) => options.screenshot !== undefined ? 'provider takes no screenshot' : null }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), provider], { mode: 'research' }).run(url, null, {}, { screenshot: {} })
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_not_served', channel: 'provider', detail: { reason: 'provider takes no screenshot' } }))
    expect(run.channelsTried).toEqual(['http'])
    expect(provider.calls).toEqual([])
    // Without the option it asks for, the rung runs.
    const served = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), { ...provider, calls: [] }], { mode: 'research' }).run(url)
    expect(served.channelsTried).toEqual(['http', 'provider'])
  })

  it('says the egress proxy refused the connection when no page was read, and not when one was', async () => {
    const url = 'https://example.com/p'
    const refused = (lane: 'http' | 'browser_local', status: number | null): FetchResult => ({ ...failedResult(url, 'connection_error'), lane, trace: [{ at: 1, lane, event: 'egress_proxy_refused', detail: { status } }] })
    const both = await new LadderRunner([channel('http', [refused('http', 402)]), channel('browser_local', [refused('browser_local', null)])], { mode: 'standard' }).run(url)
    expect(both.result.status).toBe('failed')
    expect(both.result.warnings).toContainEqual(egressProxyRefusedWarning(402))
    expect(egressProxyRefusedWarning(402).message).toContain('(HTTP 402)')
    // A rung that failed on its own (a provider on its own network that timed out) is not the proxy's failure.
    const own = await new LadderRunner([channel('http', [refused('http', 402)]), channel('browser_local', [{ ...failedResult(url, 'timeout'), lane: 'browser_local' }])], { mode: 'standard' }).run(url)
    expect(own.result.warnings?.some((warning) => warning.code === 'egress_proxy_refused') ?? false).toBe(false)
    // A page read by another rung stands, without the warning.
    const read = await new LadderRunner([channel('http', [refused('http', 407)]), channel('browser_local', [contentfulResult(url, 'browser_local')])], { mode: 'standard' }).run(url)
    expect(read.result.status).toBe('success')
    expect(read.result.warnings?.some((warning) => warning.code === 'egress_proxy_refused') ?? false).toBe(false)
  })

  it('offers a client-rendered http success to the browser and keeps whichever answer holds more', async () => {
    const url = 'https://example.com/p'
    const rendered = { ...contentfulResult(url, 'browser_local'), usage: { ...contentfulResult(url, 'browser_local').usage, contentTokens: 800 } }
    const better = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [rendered])], { mode: 'authed' }).run(url)
    expect(better.channelsTried).toEqual(['http', 'browser_local'])
    expect(better.result).toMatchObject({ status: 'success', lane: 'browser_local' })
    expect(better.result.warnings).toBeUndefined()
    expect(better.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'quality_client_rendered', improved: true }])
    expect(decisions(better.ladderTrace)[0]).toMatchObject({ event: 'ladder_step', channel: 'http', detail: { status: 'success', escalate: 'quality_client_rendered' } })

    // The browser found less: the http page stays the answer, warning and all, and the hop did not pay off.
    const thinner = { ...contentfulResult(url, 'browser_local'), markdown: 'LESS', usage: { ...contentfulResult(url, 'browser_local').usage, contentTokens: 3 } }
    const kept = await new LadderRunner([channel('http', [clientRenderedHttpSuccess(url)]), channel('browser_local', [thinner])], { mode: 'authed' }).run(url)
    // The kept page says that the browser lane did not improve on it, after its own caveat; the count and confidence are the http lane's extract figures.
    expect(kept.result).toMatchObject({ status: 'success', lane: 'http', markdown: 'MAIN CONTENT', warnings: [{ code: 'client_rendered_suspected' }, { code: 'low_content_yield', message: 'The http lane extracted 12 tokens; the browser lane did not improve it.' }] })
    expect(kept.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'quality_client_rendered', improved: false }])
    expect(decisions(kept.ladderTrace).at(-1)).toMatchObject({ event: 'ladder_best_kept', channel: 'http' })
  })

  it('accepts the browser result even when it is also thin — one quality pass, not a loop', async () => {
    const http = channel('http', [thinHttpSuccess('https://example.com/p')])
    const browser = channel('browser_local', [thinHttpSuccess('https://example.com/p')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('http') // the browser's thin success IS the answer
    expect(run.result.trace.some((t) => t.event === 'quality_low_yield')).toBe(true)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
  })

  it('audits every step with channel, vendor and escalation reason', async () => {
    const http = channel('http', [emptyUnverified('https://example.com/p')])
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    const steps = run.ladderTrace.filter((t) => t.event === 'ladder_step')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({
      channel: 'http',
      detail: { status: 'failed', escalate: 'subject_escalations' },
    })
    expect(steps[1]).toMatchObject({ channel: 'browser_local', detail: { escalate: null } })
  })
})

describe('LadderRunner — session store wiring', () => {
  it('loads a saved session for the domain when the caller passes none', async () => {
    const snapshot: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 't',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browser_local_authed',
      cookies: [{ name: 'sid', value: 'v', domain: '.example.com', path: '/' }],
    }
    const store = new MemorySessionStore()
    await store.save(snapshot)

    const received: (SessionSnapshot | null | undefined)[] = []
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')])
    const orig = http.fetch
    http.fetch = async (url, session) => {
      received.push(session)
      return orig(url, session)
    }

    const runner = new LadderRunner([http], { mode: 'authed' }, null, null, store)
    await runner.run('https://example.com/p')

    expect(received).toHaveLength(1)
    expect(received[0]?.domain).toBe('example.com')
    expect(received[0]?.cookies?.[0]?.name).toBe('sid')
  })

  it('saves the handoff snapshot so the next run resumes', async () => {
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'human',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'steel',
      resume: { steelProfileId: 'prof-1' },
    }
    const store = new MemorySessionStore()
    const request: HandoffRequest = {
      reason: 'captcha_required',
      liveViewUrl: 'https://live.example/session-1',
      rationale: 'The target demands human verification.',
    }
    const vendor = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: request },
      contentfulResult('https://example.com/p', 'provider'),
    ], 'steel')
    const handoff: HumanHandoff = { async takeOver() { return session } }
    const runner = new LadderRunner([vendor], { mode: 'authed' }, null, handoff, store)

    await runner.run('https://example.com/p')
    const saved = await store.load('example.com')
    expect(saved?.vendor).toBe('steel')
    expect(saved?.resume).toEqual({ steelProfileId: 'prof-1' })
  })
})

describe('LadderRunner — best-so-far content', () => {
  function thinHttp(url: string): FetchResult {
    return {
      ...contentfulResult(url, 'http'),
      usage: { ...contentfulResult(url, 'http').usage, contentTokens: 20 },
      trace: [
        { at: 0, lane: 'http', event: 'extract', detail: {} },
        { at: 5, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 20, confidence: 0.1 } },
      ],
    }
  }

  it('HTTP success then browser timeout returns the HTTP content, not the failure', async () => {
    const http = channel('http', [thinHttp('https://example.com/p')])
    const browser = channel('browser_local', [
      failedResult('https://example.com/p', 'timeout'),
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result.lane).toBe('http')
    expect(run.result.status).toBe('success')
    expect(run.result.markdown).toBe('MAIN CONTENT')
  })

  it('browser content that is WORSE than the thin http result is discarded in favour of the http result', async () => {
    const http = channel('http', [thinHttp('https://example.com/p')])
    // The browser answered, but with less content than the http result that
    // triggered the escalation in the first place.
    const browser = channel('browser_local', [
      {
        ...contentfulResult('https://example.com/p', 'browser_local'),
        usage: { ...contentfulResult('https://example.com/p', 'browser_local').usage, contentTokens: 8 },
      },
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('http')
    expect(run.result.usage.contentTokens).toBe(20)
    // The quality hop did not improve things — the record says so, in the escalations and in a warning the reader sees without the trace.
    expect(run.result.escalations).toContainEqual(
      expect.objectContaining({ from: 'http', to: 'browser_local', improved: false }),
    )
    expect(run.result.warnings).toEqual([{ code: 'low_content_yield', message: 'The http lane extracted 20 tokens at confidence 0.1; the browser lane did not improve it.' }])
  })

  it('a thin http result with no further rung to offer it to says the browser lane was not available', async () => {
    const run = await new LadderRunner([channel('http', [thinHttp('https://example.com/p')])], { mode: 'authed' }).run('https://example.com/p')
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result).toMatchObject({ status: 'success', lane: 'http', markdown: 'MAIN CONTENT', escalations: [] })
    expect(run.result.warnings).toEqual([{ code: 'low_content_yield', message: 'The http lane extracted 20 tokens at confidence 0.1; the browser lane was not available to this request.' }])
    // A plain http success carries no such warning: the http lane raised no quality event on it.
    const plain = await new LadderRunner([channel('http', [contentfulResult('https://example.com/p', 'http')])], { mode: 'authed' }).run('https://example.com/p')
    expect(plain.result.warnings).toBeUndefined()
  })

  it('better browser content replaces the http result and the escalation is marked improved', async () => {
    const http = channel('http', [thinHttp('https://example.com/p')])
    const browser = channel('browser_local', [
      {
        ...contentfulResult('https://example.com/p', 'browser_local'),
        usage: { ...contentfulResult('https://example.com/p', 'browser_local').usage, contentTokens: 800 },
      },
    ])
    const runner = new LadderRunner([http, browser], { mode: 'authed' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.lane).toBe('browser_local')
    expect(run.result.usage.contentTokens).toBe(800)
    expect(run.result.escalations.some((e) => e.improved === true)).toBe(true)
    // The rendered page is the answer: nothing was kept thin, so no low_content_yield.
    expect(run.result.warnings).toBeUndefined()
  })
})

describe('LadderRunner — a thin rendered answer', () => {
  const url = 'https://example.com/p'
  /** The browser lane's answer, with its own extraction's confidence and the main content's tokens. */
  function rendered(contentTokens: number, confidence: number): FetchResult {
    const base = contentfulResult(url, 'browser_local')
    return { ...base, usage: { ...base.usage, contentTokens }, trace: [{ at: 1, lane: 'browser_local', event: 'extract', detail: { pageType: 'listing', strategy: 'list', confidence } }] }
  }
  const run = (result: FetchResult) => new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), channel('browser_local', [result])], { mode: 'authed' }).run(url)

  it('carries low_content_yield when its own extraction found it thin and unsure, and stays success', async () => {
    const thin = await run(rendered(RENDERED_LOW_YIELD_MAX_TOKENS, 0))
    expect(thin.result).toMatchObject({ status: 'success', lane: 'browser_local' })
    expect(thin.result.warnings).toEqual([{ code: 'low_content_yield', message: `The browser_local lane rendered the page and extracted ${RENDERED_LOW_YIELD_MAX_TOKENS} tokens at confidence 0; that is the answer.` }])
  })

  it('carries none when it holds more, or its extraction is sure of it', async () => {
    expect((await run(rendered(RENDERED_LOW_YIELD_MAX_TOKENS + 1, 0))).result.warnings).toBeUndefined()
    expect((await run(rendered(20, QUALITY_ESCALATION_MAX_CONFIDENCE + 0.1))).result.warnings).toBeUndefined()
  })
})

describe('LadderRunner — a page with no main content', () => {
  const url = 'https://example.com/p'
  const PAGE = '[Home](https://example.com/)\n\n- [Docs](https://example.com/docs)'
  /** HTTP found no main content: failed, the whole page kept as evidence, the browser asked for. */
  function noMainContent(): FetchResult {
    return {
      ...failedResult(url, 'empty_unverified'),
      evidence: { ...failedResult(url, 'empty_unverified').evidence, httpStatus: 200 },
      markdown: PAGE,
      escalations: [{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }],
    }
  }
  const browserFailure = (reason: FetchResult['failureReason']): FetchResult => ({ ...failedResult(url, reason), lane: 'browser_local' })

  it('keeps the HTTP page as evidence when the browser rung fails without a page', async () => {
    const run = await new LadderRunner([channel('http', [noMainContent()]), channel('browser_local', [browserFailure('connection_error')])], { mode: 'standard' }).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http', markdown: PAGE })
    expect(run.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: false }])
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_evidence_kept', channel: 'http', detail: { kept: 'http', failed: 'browser_local', reason: 'connection_error' } }))
    expect(run.summary.attempts.map((attempt) => attempt.result.failureReason)).toEqual(['empty_unverified', 'connection_error'])
  })

  it('keeps a client-rendered shell\'s caveat on the evidence it keeps, and the rung\'s own ask names the hop once', async () => {
    // The HTTP rung found no main region on a shell: its failed result carries the warning and the event beside its ask.
    const shell: FetchResult = {
      ...noMainContent(),
      warnings: [{ code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (script_shell); this HTTP capture may be a shell.' }],
      trace: [{ at: 10, lane: 'http', event: 'quality_client_rendered', detail: { reason: 'script_shell', markers: [], emptyTables: 0, textChars: 14, scriptChars: 2_258 } }],
    }
    const kept = await new LadderRunner([channel('http', [shell]), channel('browser_local', [browserFailure('connection_error')])], { mode: 'standard' }).run(url)
    // The evidence kept says that the browser lane did not improve on it; a shell with no main content gives no token count.
    expect(kept.result).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http', markdown: PAGE, warnings: [{ code: 'client_rendered_suspected' }, { code: 'low_content_yield', message: 'The http lane found no main content; the browser lane did not improve it.' }] })
    expect(kept.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: false }])
    expect(kept.ladderTrace.filter((t) => t.event === 'ladder_step')[0]).toMatchObject({ channel: 'http', detail: { status: 'failed', escalate: 'subject_escalations' } })
    // The rendered page replaces it without the caveat, and no second hop is stamped on it.
    const rendered = await new LadderRunner([channel('http', [shell]), channel('browser_local', [contentfulResult(url, 'browser_local')])], { mode: 'standard' }).run(url)
    expect(rendered.result).toMatchObject({ status: 'success', lane: 'browser_local', markdown: 'MAIN CONTENT', escalations: [] })
    expect(rendered.result.warnings).toBeUndefined()
  })

  it('answers with the browser rung\'s own page or block instead', async () => {
    const rendered: FetchResult = { ...noMainContent(), lane: 'browser_local', escalations: [], markdown: 'Rendered whole page' }
    const renderedRun = await new LadderRunner([channel('http', [noMainContent()]), channel('browser_local', [rendered])], { mode: 'standard' }).run(url)
    expect(renderedRun.result).toMatchObject({ lane: 'browser_local', markdown: 'Rendered whole page' })
    const blocked = { ...blockedResult(url, 'captcha'), lane: 'browser_local' as const }
    const blockedRun = await new LadderRunner([channel('http', [noMainContent()]), channel('browser_local', [blocked])], { mode: 'standard' }).run(url)
    expect(blockedRun.result).toMatchObject({ status: 'blocked', lane: 'browser_local' })
  })

  it('keeps the HTTP page as evidence on the timeout when the deadline ends the browser rung', async () => {
    const hanging: Channel = {
      id: 'browser_local',
      identity: COHERENT,
      fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })),
    }
    const run = await new LadderRunner([channel('http', [noMainContent()]), hanging], { mode: 'standard' }).run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', lane: 'http', markdown: PAGE, usage: { deadlineExceeded: true } })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'deadline_exceeded', detail: { channel: 'browser_local', kept: null, evidence: 'http' } }))
  })
})

describe('LadderRunner — an answer without content', () => {
  const url = 'https://example.com/p'
  /** `includeTags` named nothing: success with empty Markdown, which the HTTP rung offers to the browser when the page itself reads as thin. */
  function emptyAnswer(lane: FetchResult['lane']): FetchResult {
    const result = contentfulResult(url, lane)
    return {
      ...result,
      markdown: '',
      usage: { ...result.usage, contentTokens: 0 },
      trace: lane === 'http' ? [{ at: 5, lane, event: 'quality_low_yield', detail: { contentTokens: 0, confidence: 0 } }] : [],
    }
  }
  const vendors = () => [channel('provider', [emptyAnswer('provider')], 'browserbase'), channel('provider', [emptyAnswer('provider')], 'steel')] as const

  it('gives way to a later rung that finds the page blocked', async () => {
    for (const reason of ['login_wall', 'cloudflare_challenge'] as const) {
      const blocked = { ...blockedResult(url, reason), lane: 'browser_local' as const }
      const run = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [blocked])], { mode: 'standard' }).run(url)
      expect(run.result).toMatchObject({ status: 'blocked', blockReason: reason, lane: 'browser_local', markdown: null })
      expect(decisions(run.ladderTrace).map((event) => [event.event, event.channel])).toEqual([['ladder_step', 'http'], ['ladder_empty_answer_dropped', 'http'], ['ladder_step', 'browser_local']])
      expect(decisions(run.ladderTrace)[1]!.detail).toEqual({ dropped: 'http', blockedAt: 'browser_local', blockReason: reason })
    }
    // A vendor rung that then reads the page answers, as after any block; content the HTTP rung did produce stays the answer.
    const blocked = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'browser_local' as const }
    const [browserbase, steel] = vendors()
    const viaVendor = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [blocked]), browserbase, steel], { mode: 'authed' }).run(url)
    expect(viaVendor.result).toMatchObject({ status: 'success', lane: 'provider', markdown: '' })
    expect(viaVendor.channelsTried).toEqual(['http', 'browser_local', 'provider'])
    const thin: FetchResult = { ...emptyAnswer('http'), markdown: 'MAIN CONTENT', usage: { ...emptyAnswer('http').usage, contentTokens: 12 } }
    const kept = await new LadderRunner([channel('http', [thin]), channel('browser_local', [blocked])], { mode: 'standard' }).run(url)
    expect(kept.result).toMatchObject({ status: 'success', lane: 'http', markdown: 'MAIN CONTENT' })
  })

  it('is confirmed by the next rung that repeats it, and no vendor rung is asked', async () => {
    const [browserbase, steel] = vendors()
    const run = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [emptyAnswer('browser_local')]), browserbase, steel], { mode: 'authed' }).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result).toMatchObject({ status: 'success', lane: 'http', markdown: '' })
    expect(run.result.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'quality_low_yield', improved: false }])
    expect(decisions(run.ladderTrace)[1]).toMatchObject({ event: 'ladder_step', channel: 'browser_local', detail: { status: 'success', escalate: null, confirmsEmpty: 'http' } })
    expect([...browserbase.calls, ...steel.calls]).toEqual([])
  })

  it('stays the answer when the next rung fails without a page, and is not the partial answer of a run that met a block', async () => {
    const unreachable = { ...failedResult(url, 'connection_error'), lane: 'browser_local' as const }
    const run = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [unreachable])], { mode: 'standard' }).run(url)
    expect(run.result).toMatchObject({ status: 'success', lane: 'http', markdown: '' })
    // The deadline ends a vendor rung after the browser rung found the page blocked.
    const hanging: Channel = {
      id: 'provider',
      vendorId: 'steel',
      priceCeilingUsd: 0,
      identity: COHERENT,
      fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })),
    }
    const blocked = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'browser_local' as const }
    const cut = await new LadderRunner([channel('http', [emptyAnswer('http')]), channel('browser_local', [blocked]), hanging], { mode: 'authed' }).run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(cut.result).toMatchObject({ status: 'failed', failureReason: 'timeout', markdown: null, usage: { deadlineExceeded: true } })
  })
})

describe('LadderRunner — identity on contentful results', () => {
  function mismatchedContentful(url: string): FetchResult {
    return {
      ...contentfulResult(url, 'provider'),
      trace: [
        {
          at: 1,
          lane: 'provider',
          event: 'identity_mismatch',
          detail: { declared: 'A', sent: 'B' },
        },
      ],
    }
  }

  it('an identity_mismatch on a contentful 200 is NOT the answer — the next channel runs', async () => {
    const bb = channel('provider', [mismatchedContentful('https://example.com/p')], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([bb, steel], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider'])
    expect(run.result.status).toBe('success')
    expect(run.result.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    expect(run.ladderTrace.some((t) => t.detail.escalate === 'identity_rejected')).toBe(true)
  })

  it('identity_unobserved on a contentful 200 is also rejected — unobserved is not agreement', async () => {
    const bb = channel('provider', [
      {
        ...contentfulResult('https://example.com/p', 'provider'),
        trace: [{ at: 1, lane: 'provider', event: 'identity_unobserved', detail: { declared: 'A' } }],
      },
    ], 'browserbase')
    const steel = channel('provider', [contentfulResult('https://example.com/p', 'provider')], 'steel')
    const runner = new LadderRunner([bb, steel], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider'])
    expect(run.result.status).toBe('success')
    expect(run.result.trace.some((t) => t.event === 'identity_unobserved')).toBe(false)
  })

  it('ONLY vendor + mismatch = a clear non-contentful failure, never a success', async () => {
    // The page came with its html formats: they go with the Markdown.
    const bb = channel('provider', [{ ...mismatchedContentful('https://example.com/p'), html: '<main>MAIN CONTENT</main>', rawHtml: '<html><body><main>MAIN CONTENT</main></body></html>' }], 'browserbase')
    const runner = new LadderRunner([bb], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(run.result.markdown).toBeNull()
    expect(run.result).not.toHaveProperty('html')
    expect(run.result).not.toHaveProperty('rawHtml')
    expect(CONTENTFUL_STATUS.has(run.result.status)).toBe(false)
  })

  it('LAST vendor + unobserved = a clear non-contentful failure too', async () => {
    const bb = channel('provider', [blockedResult('https://example.com/p', 'bot_detected_generic')], 'browserbase')
    const steel = channel('provider', [
      {
        ...contentfulResult('https://example.com/p', 'provider'),
        trace: [{ at: 1, lane: 'provider', event: 'identity_unobserved', detail: { declared: 'A' } }],
      },
    ], 'steel')
    const runner = new LadderRunner([bb, steel], { mode: 'research' })

    const run = await runner.run('https://example.com/p')
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(CONTENTFUL_STATUS.has(run.result.status)).toBe(false)
  })

  it('a handoff retry with an identity anomaly cannot slip through as success', async () => {
    const request: HandoffRequest = {
      reason: 'captcha_required',
      liveViewUrl: 'https://live.example/session-1',
      rationale: 'The target demands human verification.',
    }
    const session: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'human',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browserbase',
    }
    const bb = channel('provider', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: request },
      mismatchedContentful('https://example.com/p'),
    ], 'browserbase')
    const handoff: HumanHandoff = { async takeOver() { return session } }
    const runner = new LadderRunner([bb], { mode: 'authed' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(run.channelsTried).toEqual(['provider', 'provider(retry)'])
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(CONTENTFUL_STATUS.has(run.result.status)).toBe(false)
    expect(run.handoffRequested).toBe(false)
  })

  it('history records contentful=0 with failureClass=identity_mismatch for a mismatched fetch', async () => {
    const history = new MemoryRoutingHistory()
    const bb = channel('provider', [mismatchedContentful('https://example.com/p')], 'browserbase')
    const runner = new LadderRunner([bb], { mode: 'research' }, history)

    await runner.run('https://example.com/p')
    const domain = await history.read('example.com')
    expect(domain.vendors.browserbase).toMatchObject({
      attempts: 1,
      contentful: 0,
      lastFailureClass: 'identity_mismatch',
    })
  })
})

describe('LadderRunner — session gating by mode', () => {
  const handoffRequest: HandoffRequest = {
    reason: 'captcha_required',
    liveViewUrl: 'https://live.example/session-1',
    rationale: 'The target demands human verification.',
  }

  it('standard mode never loads a saved session, even when the store has one', async () => {
    const store = new MemorySessionStore()
    await store.save({
      domain: 'example.com',
      attestedBy: 't',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browser_local_authed',
      cookies: [{ name: 'sid', value: 'v', domain: '.example.com', path: '/' }],
    })
    const seen: (SessionSnapshot | null | undefined)[] = []
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')])
    const orig = http.fetch
    http.fetch = async (url, session) => {
      seen.push(session)
      return orig(url, session)
    }
    const runner = new LadderRunner([http], { mode: 'standard' }, null, null, store)

    await runner.run('https://example.com/p')
    expect(seen).toEqual([null])
  })

  it('a handoff request in standard mode is denied, not executed', async () => {
    const http = channel('http', [
      { ...blockedResult('https://example.com/p', 'captcha'), handoff: handoffRequest },
    ])
    const calls: string[] = []
    const handoff: HumanHandoff = {
      async takeOver(url) {
        calls.push(url)
        return null
      },
    }
    const runner = new LadderRunner([http], { mode: 'standard' }, null, handoff)

    const run = await runner.run('https://example.com/p')
    expect(calls).toEqual([])
    expect(run.handoffRequested).toBe(false)
    expect(run.ladderTrace.some((t) => t.detail.handoff === 'denied: mode is not authed')).toBe(true)
  })
})

describe('LadderRunner — declared identity is mandatory', () => {
  it('a channel with no identity bundle never reaches fetch', async () => {
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')], undefined, undefined)
    delete (http as { identity?: IdentityBundle }).identity
    const runner = new LadderRunner([http], { mode: 'standard' })

    const run = await runner.run('https://example.com/p')
    expect(http.calls).toEqual([])
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result.status).toBe('failed')
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(run.result.trace.some((t) => t.event === 'identity_unobserved')).toBe(true)
    expect(run.ladderTrace.some((t) => t.event === 'ladder_identity_refused')).toBe(true)
  })

  it('a contradictory bundle stops the ladder instead of trying another fake identity', async () => {
    const broken: IdentityBundle = {
      ...COHERENT,
      clientHints: { ...COHERENT.clientHints, 'sec-ch-ua-platform': '"Windows"' },
    }
    const http = channel('http', [contentfulResult('https://example.com/p', 'http')], undefined, broken)
    const browser = channel('browser_local', [contentfulResult('https://example.com/p', 'browser_local')])
    const runner = new LadderRunner([http, browser], { mode: 'standard' })

    const run = await runner.run('https://example.com/p')
    expect(http.calls).toEqual([])
    expect(browser.calls).toEqual([])
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result.failureReason).toBe('identity_compromised')
    expect(run.result.trace.some((t) => t.event === 'identity_mismatch')).toBe(true)
  })
})

describe('LadderRunner — deadline and fetch options', () => {
  const url = 'https://example.com/p'
  function thinHttp(): FetchResult {
    return { ...contentfulResult(url, 'http'), trace: [{ at: 5, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 12, confidence: 0.1 } }] }
  }
  /** A rung that only ends when its execution stops, like a page load that never settles. */
  function hanging(id: string): Channel {
    return {
      id,
      identity: COHERENT,
      fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })),
    }
  }

  it('a deadline while the browser rung runs returns the HTTP content as partial, not an error', async () => {
    const run = await new LadderRunner([channel('http', [thinHttp()]), hanging('browser_local')], { mode: 'standard' })
      .run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result).toMatchObject({ status: 'partial', lane: 'http', markdown: 'MAIN CONTENT', failureReason: null, budgetExceeded: null, usage: { deadlineExceeded: true } })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'deadline_exceeded', detail: { channel: 'browser_local', kept: 'http' } }))
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_deadline_exceeded', channel: 'browser_local' }))
  })

  it('with nothing usable the deadline is failed/timeout, while cancellation still rejects', async () => {
    const runner = new LadderRunner([hanging('http')], { mode: 'standard' })
    const run = await runner.run(url, undefined, { deadlineAt: Date.now() + 100 })
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', budgetExceeded: null, lane: 'http', markdown: null, usage: { deadlineExceeded: true } })
    const controller = new AbortController()
    const cancelled = runner.run(url, undefined, { signal: controller.signal, deadlineAt: Date.now() + 5_000 })
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('a rung that reports the deadline itself ends the ladder without trying the next rung', async () => {
    const timedOut = failedResult(url, 'timeout')
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const run = await new LadderRunner([channel('http', [{ ...timedOut, usage: { ...timedOut.usage, deadlineExceeded: true } }]), browser], { mode: 'standard' })
      .run(url, undefined, { deadlineAt: Date.now() + 5_000 })
    expect(browser.calls).toEqual([])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', usage: { deadlineExceeded: true } })
  })

  it('waitFor starts at a rung that can wait and hands it the fetch options', async () => {
    const http = channel('http', [contentfulResult(url, 'http')])
    const seen: unknown[] = []
    const browser: Channel = {
      id: 'browser_local',
      identity: COHERENT,
      waitsFor: true,
      fetch: async (target, _session, _execution, options) => { seen.push(options); return contentfulResult(target, 'browser_local') },
    }
    const run = await new LadderRunner([http, browser], { mode: 'standard' }).run(url, undefined, {}, { waitFor: 1_000, onlyMainContent: false })
    expect(http.calls).toEqual([])
    expect(seen).toEqual([{ waitFor: 1_000, onlyMainContent: false }])
    expect(run.channelsTried).toEqual(['browser_local'])
    expect(run.ladderTrace[0]).toMatchObject({ event: 'ladder_channel_skipped', channel: 'http', detail: { reason: expect.stringContaining('waitFor') } })
  })

  it('waitFor with no rung that can wait is an honest failure, not an HTTP answer that ignored it', async () => {
    const http = channel('http', [contentfulResult(url, 'http')])
    const run = await new LadderRunner([http], { mode: 'standard' }).run(url, undefined, {}, { waitFor: 1_000 })
    expect(http.calls).toEqual([])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'policy_denied', markdown: null })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'wait_for_unavailable' }))
  })
})

describe('LadderRunner — a recorded robots override', () => {
  const url = 'https://example.com/report'
  const robotsOverride = { reason: 'The publisher links this report itself.', recordedBy: 'analyst' }
  const rules = [{ pattern: '/', allow: false }]
  /** What the HTTP lane reports the moment it sets a rule aside (ExecutionContext.onRobotsOverride). */
  function applied(): RobotsOverrideApplied {
    return {
      trace: [
        { at: 1, lane: 'http', event: 'robots_checked', detail: { decision: 'disallowed', robotsUrl: 'https://example.com/robots.txt', robotsSha256: 'a'.repeat(64), crawlDelayMs: null } },
        { at: 1, lane: 'http', event: 'robots_disallowed', detail: { url, appliedRules: rules } },
        { at: 1, lane: 'http', event: 'robots_overridden', detail: { url, appliedRules: rules, ...robotsOverride } },
      ],
      warning: { code: 'robots_overridden', message: 'https://example.com/robots.txt disallows this URL (rule /); it was fetched under an override recorded by analyst: The publisher links this report itself.' },
    }
  }
  /** A rung's own result after it set the rule aside: its trace and warnings say so. */
  const overridden = (result: FetchResult): FetchResult => ({ ...result, trace: [...applied().trace, ...result.trace], warnings: [applied().warning] })
  /** A rung that sets the rule aside, says so, and answers with `result`; with null it only ends when its execution stops. */
  function overriding(id: string, result: FetchResult | null): Channel {
    return {
      id,
      identity: COHERENT,
      fetch: (_url, _session, execution) => {
        execution?.onRobotsOverride?.(applied())
        if (result !== null) return Promise.resolve(result)
        return new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true }))
      },
    }
  }
  const events = (result: FetchResult) => result.trace.map((event) => event.event)

  it('keeps the override on the timeout it builds for a rung the deadline cut before it answered', async () => {
    const heard: RobotsOverrideApplied[] = []
    const run = await new LadderRunner([overriding('http', null)], { mode: 'standard' })
      .run(url, undefined, { deadlineAt: Date.now() + 100, onRobotsOverride: (report) => heard.push(report) }, { robotsOverride })
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'timeout', lane: 'http', warnings: [applied().warning], usage: { deadlineExceeded: true } })
    expect(events(run.result)).toEqual(['robots_checked', 'robots_disallowed', 'robots_overridden', 'deadline_exceeded'])
    // The rung returned nothing: what it reported is all the run has, and the run's own caller hears it too.
    expect(run.summary.attempts).toEqual([])
    expect(heard).toEqual([applied()])
  })

  it('keeps it on a later rung\'s answer, once, and leaves the result of the rung that applied it as it is', async () => {
    const skipped: FetchResult = { ...failedResult(url, 'policy_denied'), lane: 'browser_local_authed', trace: [{ at: 0, lane: 'browser_local_authed', event: 'authed_session_skipped', detail: { reason: 'no_local_session' } }] }
    const run = await new LadderRunner([overriding('http', overridden(blockedResult(url, 'cloudflare_challenge'))), channel('authed_session', [skipped])], { mode: 'authed' })
      .run(url, undefined, {}, { robotsOverride })
    expect(run.channelsTried).toEqual(['http', 'authed_session'])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'policy_denied', lane: 'browser_local_authed', warnings: [applied().warning] })
    expect(events(run.result)).toEqual(['robots_checked', 'robots_disallowed', 'robots_overridden', 'authed_session_skipped'])
    expect(run.result.trace.slice(0, 3).every((event) => event.lane === 'http')).toBe(true)

    const own = overridden(contentfulResult(url, 'http'))
    const answered = await new LadderRunner([overriding('http', own)], { mode: 'standard' }).run(url, undefined, {}, { robotsOverride })
    expect(answered.result).toEqual(own)
  })

  it('goes on to a vendor rung when what was set aside was only a robots.txt that could not be read', async () => {
    // T076 on 2026-10-11: stackoverflow.com's robots.txt was unreadable for one lookup (a complete disallow), and the
    // vendor rung, which reads robots.txt itself before it opens a session, was skipped as if the publisher had written a rule.
    const unreadable: RobotsOverrideApplied = {
      trace: [
        { at: 1, lane: 'http', event: 'robots_checked', detail: { decision: 'disallowed', robotsUrl: 'https://example.com/robots.txt', robotsSha256: null, crawlDelayMs: null, unreachable: 'timeout' } },
        { at: 1, lane: 'http', event: 'robots_disallowed', detail: { url, appliedRules: [], unreachable: 'timeout' } },
        { at: 1, lane: 'http', event: 'robots_overridden', detail: { url, appliedRules: [], unreachable: 'timeout', ...robotsOverride } },
      ],
      warning: { code: 'robots_overridden', message: 'https://example.com/robots.txt could not be read (timeout), which counts as a complete disallow; it was fetched under an override recorded by analyst: The publisher links this report itself.' },
    }
    const local: Channel = { id: 'http', identity: COHERENT, fetch: (_url, _session, execution) => { execution?.onRobotsOverride?.(unreadable); return Promise.resolve({ ...blockedResult(url, 'cloudflare_challenge'), trace: unreadable.trace, warnings: [unreadable.warning] }) } }
    const provider = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    const run = await new LadderRunner([local, provider], { mode: 'research' }).run(url, undefined, {}, { robotsOverride })
    expect(provider.calls).toHaveLength(1)
    expect(run.channelsTried).toEqual(['http', 'provider'])
    expect(run.result).toMatchObject({ status: 'success', lane: 'provider' })
    expect(run.ladderTrace).not.toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', channel: 'provider' }))

    // Still unreadable to the provider: it refuses, and the local answer stands.
    const refusal: FetchResult = { ...failedResult(url, 'policy_denied'), lane: 'provider', trace: [{ at: 1, lane: 'provider', event: 'provider_refused', detail: { refusal: 'robots_unreachable' } }] }
    const refusing = channel('provider', [refusal], 'steel')
    const refused = await new LadderRunner([local, refusing], { mode: 'research' }).run(url, undefined, {}, { robotsOverride })
    expect(refused.channelsTried).toEqual(['http', 'provider'])
    expect(refused.result).toMatchObject({ status: 'blocked', blockReason: 'cloudflare_challenge', lane: 'http' })
    expect(refused.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_vendor_refused', channel: 'provider' }))
  })

  it('ends at the local rungs once a rule was set aside: no vendor rung runs, and the answer says why', async () => {
    const provider = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    const run = await new LadderRunner([overriding('http', overridden(blockedResult(url, 'cloudflare_challenge'))), provider], { mode: 'research' })
      .run(url, undefined, {}, { robotsOverride })
    expect(provider.calls).toEqual([])
    expect(run.channelsTried).toEqual(['http'])
    expect(run.result).toMatchObject({ status: 'blocked', lane: 'http', warnings: [applied().warning] })
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', channel: 'provider', detail: { vendorId: 'steel', reason: expect.stringContaining('robots override') } }))

    // An override no rung had to apply (robots.txt allowed the URL) changes nothing: the block escalates to the vendor as before.
    const reached = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    const escalated = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), reached], { mode: 'research' })
      .run(url, undefined, {}, { robotsOverride })
    expect(escalated.channelsTried).toEqual(['http', 'provider'])
    expect(escalated.result).toMatchObject({ status: 'success', lane: 'provider' })
    expect(escalated.result.warnings).toBeUndefined()
  })
})

describe('LadderRunner — a saved login goes first', () => {
  const saved = (domain: string): SessionSnapshot => ({
    domain,
    attestedBy: 'test',
    attestedAt: '2026-10-03T00:00:00.000Z',
    vendor: 'browser_local_authed',
    cookies: [{ name: 'sid', value: 'secret', domain: `.${domain}`, path: '/' }],
  })

  it('tries the authed rung before the public rungs, which would take a logged-out 200 as the answer', async () => {
    const url = 'https://www.example.com/account'
    const http = channel('http', [contentfulResult(url, 'http')])
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const authed = channel('authed_session', [contentfulResult(url, 'browser_local_authed')])
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const run = await new LadderRunner([http, browser, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.channelsTried).toEqual(['authed_session'])
    expect(run.result.lane).toBe('browser_local_authed')
    expect(run.ladderTrace.some((t) => t.event === 'ladder_session_first' && t.detail?.domain === 'example.com')).toBe(true)
  })

  it('ends at the authed rung when the site refuses the saved login, instead of answering with the logged-out page', async () => {
    const url = 'https://example.com/account'
    const http = channel('http', [contentfulResult(url, 'http')])
    const authed = channel('authed_session', [{ ...blockedResult(url, 'login_wall'), lane: 'browser_local_authed' }])
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const run = await new LadderRunner([http, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.channelsTried).toEqual(['authed_session'])
    expect(run.result.status).toBe('blocked')
    expect(run.result.blockReason).toBe('login_wall')
    expect(http.calls).toEqual([])
    expect(run.ladderTrace.some((t) => t.event === 'ladder_session_rejected')).toBe(true)
    // The refused login is nobody to hand the wall to: the shadow decision stops, as the ladder does.
    expect(run.ladderTrace.filter((t) => t.event === 'ladder_action_decision').map((t) => t.detail)).toEqual([{ shadow: 'stop', reason: 'login_wall:no_authorization', actual: 'stop', differs: false }])
  })

  it('a redirect to the site\'s login page under the saved login is login_wall, never the page\'s content', async () => {
    const url = 'https://example.com/secure'
    const landedOnLogin: FetchResult = { ...contentfulResult(url, 'browser_local_authed'), markdown: 'Login Page', evidence: { ...contentfulResult(url, 'browser_local_authed').evidence, finalUrl: 'https://example.com/login', redirectChain: [url, 'https://example.com/login'] } }
    const http = channel('http', [contentfulResult(url, 'http')])
    const authed = channel('authed_session', [landedOnLogin])
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const run = await new LadderRunner([http, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.result.status).toBe('blocked')
    expect(run.result.blockReason).toBe('login_wall')
    expect(http.calls).toEqual([])
    expect(run.ladderTrace.find((t) => t.event === 'ladder_session_rejected')?.detail).toMatchObject({ redirectedTo: 'https://example.com/login' })
  })

  it('reads a login page as a redirect to one only when the page asked for was not a login page', () => {
    const at = (finalUrl: string): FetchResult => ({ ...contentfulResult('https://example.com/x', 'browser_local'), evidence: { ...contentfulResult('https://example.com/x', 'browser_local').evidence, finalUrl } })
    expect(sessionRejection('https://example.com/account', at('https://example.com/users/sign_in?next=%2Faccount'))).not.toBeNull()
    expect(sessionRejection('https://example.com/account', at('https://example.com/account'))).toBeNull()
    expect(sessionRejection('https://example.com/account', at('https://example.com/authors/jane'))).toBeNull()
    expect(sessionRejection('https://example.com/login', at('https://example.com/login?x=1'))).toBeNull()
    // A slug that mentions a login word is a page, not a login endpoint.
    expect(sessionRejection('https://github.com/acme/old-name', at('https://github.com/acme/auth-service'))).toBeNull()
    expect(sessionRejection('https://example.com/q/123', at('https://example.com/questions/123/jwt-auth-in-express'))).toBeNull()
    expect(sessionRejection('https://example.com/settings', at('https://example.com/settings/auth'))).toBeNull()
    expect(sessionRejection('https://example.com/p/1', at('https://example.com/blog/how-to-login'))).toBeNull()
    expect(sessionRejection('https://example.com/docs/single-sign-on', at('https://example.com/docs/sso'))).toBeNull()
    expect(sessionRejection('https://www.amazon.com/gp/css/order-history', at('https://www.amazon.com/ap/signin?openid=x'))).not.toBeNull()
    expect(sessionRejection('https://www.linkedin.com/in/x', at('https://www.linkedin.com/authwall?trk=x'))).not.toBeNull()
    expect(sessionRejection('https://example.com/admin', at('https://example.com/login.php'))).not.toBeNull()
  })

  it('a page that asks for a sign-in in place, at the URL asked for, under the saved login is login_wall too', async () => {
    const url = 'https://example.com/wishlists'
    const asksToSignIn: FetchResult = { ...contentfulResult(url, 'browser_local_authed'), markdown: '# Wishlists\n\n## Log in to view your wishlists\n\nYou can create, view, or edit wishlists once you have logged in.\n\n## Support\n\n- [Help Centre](https://example.com/help)' }
    const http = channel('http', [contentfulResult(url, 'http')])
    const authed = channel('authed_session', [asksToSignIn])
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const run = await new LadderRunner([http, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.result).toMatchObject({ status: 'blocked', blockReason: 'login_wall' })
    expect(http.calls).toEqual([])
    expect(run.ladderTrace.find((t) => t.event === 'ladder_session_rejected')?.detail).toMatchObject({ domain: 'example.com', signInPrompt: 'Log in to view your wishlists' })
  })

  it('reads a sign-in prompt only where a page asks for one, not a link or a sentence that mentions signing in', () => {
    const page = (markdown: string): FetchResult => ({ ...contentfulResult('https://example.com/x', 'browser_local_authed'), markdown })
    const asks = (markdown: string) => sessionRejection('https://example.com/x', page(markdown)) !== null
    expect(asks('## Please sign in to continue')).toBe(true)
    expect(asks('You must be logged in to see this page.')).toBe(true)
    expect(asks('# Orders\n\nSign in to view your orders')).toBe(true)
    expect(asks('Login required')).toBe(true)
    // A signed-in page: a header link, a bare heading, prose that mentions signing in, a sign-out link.
    expect(asks('[Sign in](https://example.com/login) · [Help](https://example.com/help)\n\n# Your orders\n\n- Order 1')).toBe(false)
    expect(asks('# Sign in\n\nWelcome back, Jane.')).toBe(false)
    expect(asks('Our guide explains how admins sign in to view the audit log, and why the log in to view step needs two-factor codes on every device you own.')).toBe(false)
    expect(asks('[Log out](https://example.com/logout)')).toBe(false)
    // Signed-in pages whose own items, rows or titles mention a sign-in: an issue list, an inbox, an error table, a tutorial,
    // a forum post, another area's offer; and a prompt far down the page, below its own content.
    expect(asks('# Issues\n\n- [Login required error after upgrading to v2](https://github.com/acme/app/issues/412)')).toBe(false)
    expect(asks('# Inbox\n\n| From | Subject | Date |\n| --- | --- | --- |\n| Acme Security | Please sign in to confirm your new device | Oct 3 |')).toBe(false)
    expect(asks('# Errors\n\n| Code | Meaning |\n| --- | --- |\n| 401 | Login required |')).toBe(false)
    expect(asks('# Getting started\n\n## Step 2: Sign in to continue')).toBe(false)
    expect(asks('# Help forum\n\n### Chrome keeps saying "please log in" on every site')).toBe(false)
    expect(asks('# Account\n\n- Wholesale catalogue: Log in to view prices with a trade account')).toBe(false)
    expect(asks(['# Orders', ...Array.from({ length: 10 }, (_, i) => `Order ${i + 1} shipped.`), 'Sign in to view older orders'].join('\n\n'))).toBe(false)
    // A code block's line, and a list item's indented continuation: the page's content.
    expect(asks('# Issue body\n\n```\nLogin required\n```')).toBe(false)
    expect(asks('# Account\n\n- ### Wholesale\n  Log in to view prices with a trade account')).toBe(false)
    // A page whose own subject begins with the words, named so in its title: an issue, a ticket, a question.
    const titled = (title: string, markdown: string) => sessionRejection('https://example.com/x', { ...page(markdown), metadata: { ...page(markdown).metadata!, title } }) !== null
    expect(titled('Login required to access main menu · Issue #77 · Markusmph/FinanceAdmin', '[Skip to content](#start-of-content)\n\n# Login required to access main menu #77\n\nOpen')).toBe(false)
    expect(titled('Please log in again · Issue #1411 · sinProject-Inc/talk', '# Please log in again #1411\n\nOpen')).toBe(false)
    expect(titled('django - You must be logged in to view this page error - Stack Overflow', '# You must be logged in to view this page error in Django')).toBe(false)
    expect(titled('Wishlists - Airbnb', '# Wishlists\n\n## Log in to view your wishlists')).toBe(true)
    // The page's own prompt near its top, after a skip link (onlyMainContent: false).
    expect(asks('[Skip to content](#site-content) [https://www.airbnb.com.sg/](https://www.airbnb.com.sg/)\n\n# Wishlists\n\n## Log in to view your wishlists')).toBe(true)
  })

  it('keeps the public order when no login is saved for the host, or the mode is not authed', async () => {
    const url = 'https://other.org/p'
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    const http = channel('http', [contentfulResult(url, 'http')])
    const authed = channel('authed_session', [])
    const run = await new LadderRunner([http, authed], { mode: 'authed' }, null, null, store).run(url)
    expect(run.channelsTried).toEqual(['http'])

    const standardUrl = 'https://example.com/p'
    const http2 = channel('http', [contentfulResult(standardUrl, 'http')])
    const run2 = await new LadderRunner([http2, channel('authed_session', [])], { mode: 'standard' }, null, null, store).run(standardUrl)
    expect(run2.channelsTried).toEqual(['http'])
    expect(run2.ladderTrace.some((t) => t.event === 'ladder_session_loaded')).toBe(false)
  })

  it('a session saved for a parent domain covers its subdomains, not a lookalike host', async () => {
    const store = new MemorySessionStore()
    await store.save(saved('example.com'))
    expect((await loadSessionForHost(store, 'shop.www.example.com'))?.domain).toBe('example.com')
    expect(await loadSessionForHost(store, 'notexample.com')).toBeNull()
    expect(sessionCoversHost('example.com', 'www.example.com')).toBe(true)
    expect(sessionCoversHost('.example.com', 'example.com')).toBe(true)
    expect(sessionCoversHost('example.com', 'badexample.com')).toBe(false)
  })
})

describe('LadderRunner — third-party cost of a run', () => {
  const url = 'https://example.com/p'
  const free = (r: FetchResult): FetchResult => ({ ...r, usage: { ...r.usage, externalCostUsd: 0 } })
  const unpriced = (r: FetchResult): FetchResult => ({ ...r, usage: { ...r.usage, externalCostUsd: null } })
  /** An http success the extractor found thin, which the ladder offers to the next rung. */
  const thin = (): FetchResult => {
    const r = contentfulResult(url, 'http')
    return { ...r, markdown: 'tiny', usage: { ...r.usage, contentTokens: 3 }, trace: [{ at: 5, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 3, confidence: 0.1 } }] }
  }
  const hanging = (id: string, vendorId?: string): Channel => ({
    id,
    vendorId,
    ...(vendorId === undefined ? {} : { priceCeilingUsd: 0 }),
    identity: COHERENT,
    fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })),
  })

  it('counts a provider rung the deadline cut before it returned as unknown, not as the 0 of the rungs that returned', async () => {
    const cut = await new LadderRunner([channel('http', [free(blockedResult(url, 'cloudflare_challenge'))]), hanging('provider', 'steel')], { mode: 'authed' }).run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(cut.summary).toMatchObject({ externalCostUsd: null, externalCost: { knownSubtotal: 0, unknown: true } })
    expect(cut.result.usage.externalCostUsd).toBeNull()
    // A local rung cut the same way called no third party: still a known 0.
    const local = await new LadderRunner([channel('http', [free(blockedResult(url, 'cloudflare_challenge'))]), hanging('browser_local')], { mode: 'authed' }).run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(local.summary).toMatchObject({ externalCostUsd: 0, externalCost: { unknown: false } })
    expect(local.result.usage.externalCostUsd).toBe(0)
  })

  it("reports the whole run's cost on the answer, so a local page kept after a provider attempt is not called free", async () => {
    const run = await new LadderRunner([channel('http', [free(blockedResult(url, 'cloudflare_challenge'))]), channel('provider', [unpriced(contentfulResult(url, 'provider'))], 'steel')], { mode: 'authed' }).run(url)
    expect(run.result).toMatchObject({ lane: 'provider', usage: { externalCostUsd: null } })
    const priced = await new LadderRunner([channel('http', [free(blockedResult(url, 'cloudflare_challenge'))]), channel('provider', [{ ...contentfulResult(url, 'provider'), usage: { ...contentfulResult(url, 'provider').usage, externalCostUsd: 0.02 } }], 'steel')], { mode: 'authed' }).run(url)
    expect(priced.result.usage.externalCostUsd).toBe(0.02)
    const kept = await new LadderRunner([channel('http', [free(thin())]), channel('provider', [unpriced(providerErrorResult(url, 'steel'))], 'steel')], { mode: 'authed' }).run(url)
    expect(kept.result.lane).toBe('http')
    expect(kept.result.usage.externalCostUsd).toBeNull()
  })
})

describe('a failure a stronger rung may still answer (ROADMAP PA item 4)', () => {
  const url = 'https://example.com/p'
  const failed = (failureReason: FetchResult['failureReason'], httpStatus: number | null, lane: FetchResult['lane'] = 'http'): FetchResult => {
    const base = failedResult(url, failureReason)
    return { ...base, lane, evidence: { ...base.evidence, httpStatus } }
  }

  it('goes on past a 403 or 405 answered without a gate it recognises, and says why', async () => {
    for (const status of [403, 405]) {
      const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
      const run = await new LadderRunner([channel('http', [failed('http_error', status)]), browser], { mode: 'standard' }).run(url)
      expect(run.channelsTried).toEqual(['http', 'browser_local'])
      expect(run.result).toMatchObject({ status: 'success', lane: 'browser_local' })
      expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_step', channel: 'http', detail: expect.objectContaining({ escalate: `http_${status}` }) }))
    }
  })

  it('stops at an error status that is the page\'s own answer, and at a rate limit', async () => {
    for (const first of [failed('http_error', 404), failed('http_error', 410), failed('http_error', 500), { ...blockedResult(url, 'rate_limit'), evidence: { ...blockedResult(url, 'rate_limit').evidence, httpStatus: 429 } }]) {
      const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
      const run = await new LadderRunner([channel('http', [first]), browser], { mode: 'standard' }).run(url)
      expect(run.channelsTried).toEqual(['http'])
      expect(browser.calls).toEqual([])
    }
  })

  it('offers a page a browser rendered with no main content it could verify to the provider', async () => {
    const provider = { ...channel('provider', [contentfulResult(url, 'provider')], 'steel'), priceCeilingUsd: 0.01 }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [failed('empty_unverified', 200, 'browser_local')]), provider], ALLOWED_ALL).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'provider'])
    expect(run.result).toMatchObject({ status: 'success', lane: 'provider' })
  })

  it('offers an http rung\'s refused connection to the browser, never a provider, and keeps a timeout as the answer', async () => {
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const run = await new LadderRunner([channel('http', [failed('connection_error', null)]), browser], { mode: 'standard' }).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result.lane).toBe('browser_local')
    // The browser's own network failure is not offered on to a paid provider.
    const provider = { ...channel('provider', [contentfulResult(url, 'provider')], 'steel'), priceCeilingUsd: 0.01 }
    const down = await new LadderRunner([channel('http', [failed('connection_error', null)]), channel('browser_local', [failed('connection_error', null, 'browser_local')]), provider], ALLOWED_ALL).run(url)
    expect(down.channelsTried).toEqual(['http', 'browser_local'])
    expect(provider.calls).toEqual([])
    // A timeout on a slow or dead site would hold the scrape for the browser's wait too: it stays the answer.
    const slow = channel('browser_local', [contentfulResult(url, 'browser_local')])
    expect((await new LadderRunner([channel('http', [failed('timeout', null)]), slow], { mode: 'standard' }).run(url)).channelsTried).toEqual(['http'])
  })

  it('offers the bundled browser\'s refused connection to the installed Chrome, never a provider (K3)', async () => {
    // K3 on Webshare: browser_local ended on net::ERR_EMPTY_RESPONSE and the run stopped before installed_chrome.
    const chrome = channel('installed_chrome', [contentfulResult(url, 'browser_local')])
    const provider = { ...channel('provider', [contentfulResult(url, 'provider')], 'steel'), priceCeilingUsd: 0.01 }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [failed('connection_error', null, 'browser_local')]), chrome, provider], { mode: 'standard', enhanced: true }).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local', 'installed_chrome'])
    expect(run.result.status).toBe('success')
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_step', channel: 'browser_local', detail: expect.objectContaining({ escalate: 'connection_error' }) }))
    expect(provider.calls).toEqual([])
    // The installed Chrome shares the exit: its own refused connection is not offered on to a paid provider either.
    const down = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [failed('connection_error', null, 'browser_local')]), channel('installed_chrome', [failed('connection_error', null, 'browser_local')]), { ...provider, calls: [] }], { mode: 'standard', enhanced: true }).run(url)
    expect(down.channelsTried).toEqual(['http', 'browser_local', 'installed_chrome'])
    expect(down.result).toMatchObject({ status: 'failed', failureReason: 'connection_error' })
  })

  it('stops on Octocrawl\'s own crash after the browser captured the page: no other rung, free or paid (K1 T016)', async () => {
    // Every rung runs the same extraction: another rung would read the page again only to throw the same way.
    const chrome = channel('installed_chrome', [contentfulResult(url, 'browser_local')])
    const provider = { ...channel('provider', [contentfulResult(url, 'provider')], 'steel'), priceCeilingUsd: 0.01 }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [failed('internal_error', null, 'browser_local')]), chrome, provider], { mode: 'standard', enhanced: true }).run(url)
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'internal_error', lane: 'browser_local' })
    expect(chrome.calls).toEqual([])
    expect(provider.calls).toEqual([])
  })

  it('leaves an http rung\'s own empty page to that rung, which asks for the browser itself when it should', async () => {
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const run = await new LadderRunner([channel('http', [failed('empty_unverified', 200)]), browser], { mode: 'standard' }).run(url)
    expect(run.channelsTried).toEqual(['http'])
  })

  it('answers with the page it stepped past when the stronger rungs fail with none, and says so', async () => {
    const forbidden = { ...failed('http_error', 403), markdown: '# Forbidden' }
    // The browser cannot connect: the site's own 403 is the answer, not the browser's network error.
    const unreachable = await new LadderRunner([channel('http', [forbidden]), channel('browser_local', [failed('connection_error', null, 'browser_local')])], { mode: 'standard' }).run(url)
    expect(unreachable.result).toMatchObject({ status: 'failed', failureReason: 'http_error', lane: 'http', markdown: '# Forbidden', evidence: { httpStatus: 403 } })
    expect(unreachable.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_evidence_kept', detail: { kept: 'http', failed: 'browser_local', reason: 'connection_error' } }))
    // A provider's error after a page the browser rendered with no main content keeps that page.
    const rendered = { ...failed('empty_unverified', 200, 'browser_local'), markdown: 'WHOLE PAGE' }
    const provider = { ...channel('provider', [providerErrorResult(url, 'steel')], 'steel'), priceCeilingUsd: 0.01 }
    const vendorDown = await new LadderRunner([channel('http', [blockedResult(url, 'cloudflare_challenge')]), channel('browser_local', [rendered]), provider], ALLOWED_ALL).run(url)
    expect(vendorDown.channelsTried).toEqual(['http', 'browser_local', 'provider'])
    expect(vendorDown.result).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'browser_local', markdown: 'WHOLE PAGE' })
    // The deadline cuts the browser: the run ends on time, with the 403 as its evidence.
    const hanging: Channel = { id: 'browser_local', identity: COHERENT, fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })) }
    const cut = await new LadderRunner([channel('http', [forbidden]), hanging], { mode: 'standard' }).run(url, undefined, { deadlineAt: Date.now() + 150 })
    expect(cut.result).toMatchObject({ status: 'failed', failureReason: 'timeout', lane: 'http', markdown: '# Forbidden', evidence: { httpStatus: 403 }, usage: { deadlineExceeded: true } })
  })

  it('never steps past the saved login: the rungs after it do not carry it', async () => {
    const store = new MemorySessionStore()
    await store.save({ domain: 'example.com', attestedBy: 'test', attestedAt: '2026-10-09T00:00:00.000Z', vendor: 'browser_local_authed', cookies: [{ name: 'sid', value: 'secret', domain: '.example.com', path: '/' }] })
    for (const refused of [{ ...failed('empty_unverified', 200, 'browser_local_authed'), markdown: 'LOGGED-IN DASHBOARD' }, failed('http_error', 403, 'browser_local_authed')]) {
      const http = channel('http', [{ ...contentfulResult(url, 'http'), markdown: 'PUBLIC LOGGED-OUT VARIANT' }])
      const run = await new LadderRunner([http, channel('browser_local', [contentfulResult(url, 'browser_local')]), channel('authed_session', [refused])], { mode: 'authed' }, null, null, store).run(url)
      expect(run.channelsTried).toEqual(['authed_session'])
      expect(run.result).toMatchObject({ status: 'failed', lane: 'browser_local_authed' })
      expect(http.calls).toEqual([])
    }
  })

  it('keeps content an earlier rung found rather than going on past a later rung\'s 403', async () => {
    const thin: FetchResult = { ...contentfulResult(url, 'http'), trace: [{ at: 5, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 20, confidence: 0.1 } }] }
    const provider = { ...channel('provider', [contentfulResult(url, 'provider')], 'steel'), priceCeilingUsd: 0.01 }
    const run = await new LadderRunner([channel('http', [thin]), channel('browser_local', [failed('http_error', 403, 'browser_local')]), provider], ALLOWED_ALL).run(url)
    expect(run.result.lane).toBe('http')
    expect(provider.calls).toEqual([])
  })
})

describe('a provider rung under the run\'s spend ledger (ROADMAP PA item 4)', () => {
  const url = 'https://example.com/p'
  const blockedHttp = () => channel('http', [blockedResult(url, 'cloudflare_challenge')])
  const priced = (ceiling: number | null, responses: FetchResult[]) => ({ ...channel('provider', responses, 'steel'), priceCeilingUsd: ceiling })

  it('reserves the ceiling before the call and settles at it when the provider reported no price, and the result says so', async () => {
    const ledger = createSpendLedger(1)
    const run = await new LadderRunner([blockedHttp(), priced(0.3, [contentfulResult(url, 'provider')])], ALLOWED_ALL).run(url, undefined, { spend: ledger })
    expect(run.result).toMatchObject({ status: 'success', lane: 'provider', usage: { externalCostUsd: null, externalCostChargedUsd: 0.3 } })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'spend_settled', detail: { vendorId: 'steel', ceilingUsd: 0.3, chargedUsd: 0.3, basis: 'ceiling', call: 1 } }))
    expect(ledger.settledUsd).toBeCloseTo(0.3)
    expect(ledger.reservedUsd).toBe(0)
  })

  it('settles at the price the provider reported', async () => {
    const ledger = createSpendLedger(1)
    const reported = { ...contentfulResult(url, 'provider'), usage: { ...contentfulResult(url, 'provider').usage, externalCostUsd: 0.12 } }
    const run = await new LadderRunner([blockedHttp(), priced(0.3, [reported])], ALLOWED_ALL).run(url, undefined, { spend: ledger })
    expect(run.summary.attempts.at(-1)!.result.usage).toMatchObject({ externalCostUsd: 0.12, externalCostChargedUsd: 0.12 })
    expect(run.result.trace).toContainEqual(expect.objectContaining({ event: 'spend_settled', detail: expect.objectContaining({ chargedUsd: 0.12, basis: 'reported' }) }))
    expect(ledger.settledUsd).toBeCloseTo(0.12)
  })

  it('does not call a provider whose ceiling does not fit what is left, nor one with no ceiling, and says why', async () => {
    const dear = priced(0.3, [contentfulResult(url, 'provider')])
    const tight = await new LadderRunner([blockedHttp(), dear], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(0.2) })
    expect(dear.calls).toEqual([])
    expect(tight.result.lane).toBe('http')
    expect(tight.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', detail: expect.objectContaining({ vendorId: 'steel', reason: expect.stringContaining('budget'), ceilingUsd: 0.3, capUsd: 0.2 }) }))
    const unpriced = priced(null, [contentfulResult(url, 'provider')])
    const none = await new LadderRunner([blockedHttp(), unpriced], ALLOWED_ALL).run(url)
    expect(unpriced.calls).toEqual([])
    expect(none.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', detail: expect.objectContaining({ vendorId: 'steel', reason: expect.stringContaining('no price ceiling') }) }))
  })

  it('puts on the answer what the ledger charged the whole run, a provider that failed before it included', async () => {
    const ledger = createSpendLedger(1)
    const failing = { ...channel('provider', [providerErrorResult(url, 'browserbase')], 'browserbase'), priceCeilingUsd: 0.05 }
    const winning = priced(0.03, [contentfulResult(url, 'provider')])
    const run = await new LadderRunner([blockedHttp(), failing, winning], ALLOWED_ALL).run(url, undefined, { spend: ledger })
    expect(run.result.lane).toBe('provider')
    expect(run.result.usage.externalCostChargedUsd).toBeCloseTo(0.08)
    expect(ledger.settledUsd).toBeCloseTo(0.08)
  })

  it('charges a provider\'s stated price first, else its sessions\' measured cost, else the ceiling (ROADMAP PA item 4)', async () => {
    const answer = (usage: Partial<FetchResult['usage']>) => {
      const page = contentfulResult(url, 'provider')
      return { ...page, usage: { ...page.usage, ...usage } }
    }
    const charge = async (usage: Partial<FetchResult['usage']>) => {
      const run = await new LadderRunner([blockedHttp(), priced(0.03, [answer(usage)])], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1) })
      const call = (run.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }).calls[0]!
      const basis = run.result.trace.find((event) => event.event === 'spend_settled')?.detail?.basis
      return { charged: call.chargedUsd, sessionMs: call.sessionMs, basis }
    }
    expect(await charge({ externalCostUsd: null, measuredCostUsd: 0.001, vendorSessionMs: 5_000 })).toEqual({ charged: 0.001, sessionMs: 5_000, basis: 'measured' })
    // A stated price wins over a measured one, and the record then holds no session time for the charge.
    expect(await charge({ externalCostUsd: 0.002, measuredCostUsd: 0.001, vendorSessionMs: 5_000 })).toEqual({ charged: 0.002, sessionMs: null, basis: 'reported' })
    expect(await charge({ externalCostUsd: null })).toEqual({ charged: 0.03, sessionMs: null, basis: 'ceiling' })
    // What the provider reported its sessions used goes on the call and the settlement; a measured charge above the
    // ceiling (its proxy moved more than the page's count, or it solved more than allowed for) is charged and marked.
    const over = await new LadderRunner([blockedHttp(), priced(0.03, [answer({ externalCostUsd: null, measuredCostUsd: 0.05, vendorSessionMs: 5_000, vendorProxyBytes: 4_000_000, vendorSolves: 1, vendorProxyCountry: 'US' })])], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1) })
    expect(over.result.trace.find((event) => event.event === 'spend_settled')?.detail).toMatchObject({ chargedUsd: 0.05, basis: 'measured', proxyBytes: 4_000_000, solves: 1, proxyCountry: 'US', overCeiling: true })
    expect((over.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }).calls[0]).toMatchObject({ chargedUsd: 0.05, sessionMs: 5_000, proxyBytes: 4_000_000, solves: 1, proxyCountry: 'US' })
    // What the transport's meter counted goes on the call too, measured charge or not; a call without a meter has none (PA G1).
    const counted = await new LadderRunner([blockedHttp(), priced(0.03, [answer({ externalCostUsd: null, measuredCostUsd: 0.002, vendorSessionMs: 5_000, vendorBytesCounted: 3_900_000, vendorBytesCapped: true })])], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1) })
    expect((counted.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }).calls[0]).toMatchObject({ bytesCounted: 3_900_000, bytesCapped: true })
    const uncounted = await new LadderRunner([blockedHttp(), priced(0.03, [answer({ externalCostUsd: null, vendorBytesCounted: null, vendorBytesCapped: false })])], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1) })
    expect((uncounted.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }).calls[0]).toMatchObject({ bytesCounted: null, bytesCapped: false })
    expect((over.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }).calls[0]).not.toHaveProperty('bytesCounted')
  })

  it('puts every paid call of the run on the answer: the provider, its charge, what Octocrawl made of its page, and which is the answer', async () => {
    const grant = { sha256: 'a'.repeat(64), tier: 'enhanced', attestedAt: '2026-10-09T00:00:00Z' }
    const failing = { ...channel('provider', [providerErrorResult(url, 'browserbase')], 'browserbase'), priceCeilingUsd: 0.05, grant, grantCapabilities: ['vendor_remote_browser'] }
    const winning = { ...priced(0.03, [contentfulResult(url, 'provider')]), grant, grantCapabilities: ['vendor_remote_browser', 'vendor_captcha_solving'] }
    const run = await new LadderRunner([blockedHttp(), failing, winning], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1) })
    expect(run.result.trace.filter((event) => event.event === 'paid_calls').map((event) => event.detail)).toEqual([{ grant, calls: [
      { provider: 'browserbase', rung: 'provider', capabilities: ['vendor_remote_browser'], ceilingUsd: 0.05, chargedUsd: 0.05, reportedCostUsd: null, sessionMs: null, outcome: 'failed', reason: 'provider_error', answer: false },
      { provider: 'steel', rung: 'provider', capabilities: ['vendor_remote_browser', 'vendor_captcha_solving'], ceilingUsd: 0.03, chargedUsd: 0.03, reportedCostUsd: null, sessionMs: null, outcome: 'success', reason: null, answer: true },
    ] }])
    // A run that called no provider has none.
    const local = await new LadderRunner([channel('http', [contentfulResult(url, 'http')])], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1) })
    expect(local.result.trace.some((event) => event.event === 'paid_calls')).toBe(false)
  })

  it('charges a call the deadline cut at its ceiling, and says so on the answer', async () => {
    const ledger = createSpendLedger(1)
    const hangingProvider: Channel = { id: 'provider', vendorId: 'steel', priceCeilingUsd: 0.3, identity: COHERENT, fetch: (_url, _session, execution) => new Promise<FetchResult>((_, reject) => execution?.signal?.addEventListener('abort', () => reject(execution.signal!.reason), { once: true })) }
    const cut = await new LadderRunner([blockedHttp(), hangingProvider], ALLOWED_ALL).run(url, undefined, { spend: ledger, deadlineAt: Date.now() + 150 })
    expect(cut.result.usage).toMatchObject({ deadlineExceeded: true, externalCostChargedUsd: 0.3 })
    expect(cut.ladderTrace).toContainEqual(expect.objectContaining({ event: 'spend_settled', detail: expect.objectContaining({ vendorId: 'steel', chargedUsd: 0.3, basis: 'ceiling', ended: 'without_an_answer' }) }))
    expect(ledger.settledUsd).toBeCloseTo(0.3)
    // The record keeps the call: it returned no page, so nothing was made of one, and it is not the answer.
    expect(cut.result.trace.find((event) => event.event === 'paid_calls')?.detail?.calls).toEqual([expect.objectContaining({ provider: 'steel', chargedUsd: 0.3, outcome: null, reason: null, answer: false })])
  })

  it('does not retry after a handoff when the retry\'s ceiling does not fit the budget', async () => {
    const ledger = createSpendLedger(0.5)
    const handoffRequest: HandoffRequest = { reason: 'captcha_required', liveViewUrl: 'https://live.example/session', rationale: 'a captcha the provider could not clear' }
    const vendor = priced(0.3, [{ ...blockedResult(url, 'captcha'), handoff: handoffRequest }, contentfulResult(url, 'provider')])
    const handoff: HumanHandoff = { async takeOver() { return { domain: 'example.com', attestedBy: 'test', attestedAt: new Date().toISOString(), vendor: 'steel', cookies: [] } } }
    const run = await new LadderRunner([vendor], ALLOWED_ALL, null, handoff).run(url, undefined, { spend: ledger })
    // The first call took 0.3 of 0.5: the retry's 0.3 does not fit, so it is not made.
    expect(vendor.calls).toHaveLength(1)
    expect(run.result.status).not.toBe('success')
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_handoff_retry_failed', detail: expect.objectContaining({ reason: expect.stringContaining('not called') }) }))
    expect(ledger.settledUsd).toBeCloseTo(0.3)
  })

    it('charges a call that threw at its ceiling: its session may have billed', async () => {
    const ledger = createSpendLedger(1)
    const throwing: Channel = { id: 'provider', vendorId: 'steel', priceCeilingUsd: 0.3, identity: COHERENT, fetch: async () => { throw new Error('session dropped') } }
    await expect(new LadderRunner([blockedHttp(), throwing], ALLOWED_ALL).run(url, undefined, { spend: ledger })).rejects.toThrow('session dropped')
    expect(ledger.settledUsd).toBeCloseTo(0.3)
    expect(ledger.reservedUsd).toBe(0)
  })
})

describe('a provider call\'s row in the task\'s paid_calls (PA E3)', () => {
  const url = 'https://example.com/p'
  const blockedHttp = () => channel('http', [blockedResult(url, 'cloudflare_challenge')])
  /** A journal that keeps every write, in order, as the task store would. */
  const journal = () => {
    const writes: PaidCallRecord[] = []
    let ordinal = 0
    const log: PaidCallLog = {
      open: (call) => ({ paidCallId: `task-attempt-${++ordinal}`, taskId: 'task', attemptId: 'attempt', url: call.url, vendorId: call.vendorId, ceilingUsd: call.ceilingUsd, state: 'reserved', chargedUsd: null, providerRequestId: null, providerSessionId: null, tariffVersion: call.tariffVersion ?? null, grantHash: call.grantHash ?? null, deadline: call.deadline ?? null, createdAt: '2026-10-20T00:00:00.000Z', settledAt: null }),
      write: async (call) => { writes.push(call) },
    }
    return { log, writes }
  }
  /** A provider that answers once, naming its session first; what the journal held when it was called is kept. */
  const provider = (answer: FetchResult | Error, session: string | null, seen: PaidCallRecord[][], writes: PaidCallRecord[]): Channel => ({
    id: 'provider', vendorId: 'steel', priceCeilingUsd: 0.3, identity: COHERENT, tariffVersion: 'tariff-1', grant: { sha256: 'b'.repeat(64), tier: 'enhanced', attestedAt: null },
    fetch: async (_url, _session, execution) => {
      seen.push([...writes])
      expect(execution?.paidCallId).toBe('task-attempt-1')
      if (session !== null) execution?.onPaidSession?.({ providerSessionId: session, providerRequestId: session })
      if (answer instanceof Error) throw answer
      return answer
    },
  })

  it('writes the reserved row before the call goes out, submitted once the session is named, and settled with the charge', async () => {
    const { log, writes } = journal()
    const seen: PaidCallRecord[][] = []
    const reported = { ...contentfulResult(url, 'provider'), usage: { ...contentfulResult(url, 'provider').usage, externalCostUsd: 0.12 } }
    const ledger = createSpendLedger(1)
    const run = await new LadderRunner([blockedHttp(), provider(reported, 'sess-1', seen, writes)], ALLOWED_ALL).run(url, undefined, { spend: ledger, paidCalls: log })
    // When the provider was called, its reserved row was already written.
    expect(seen).toEqual([[expect.objectContaining({ paidCallId: 'task-attempt-1', state: 'reserved', ceilingUsd: 0.3, vendorId: 'steel', tariffVersion: 'tariff-1', grantHash: 'b'.repeat(64) })]])
    expect(writes.map((row) => row.state)).toEqual(['reserved', 'submitted', 'settled'])
    expect(writes.at(-1)).toMatchObject({ state: 'settled', chargedUsd: 0.12, providerSessionId: 'sess-1', providerRequestId: 'sess-1' })
    expect(ledger.settledUsd).toBeCloseTo(0.12)
    // The settled snapshot on the record names the row.
    expect((run.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }).calls[0]).toMatchObject({ paidCallId: 'task-attempt-1', chargedUsd: 0.12 })
  })

  it('leaves a charge it could only bound as usage_pending when the session can be asked, and unknown when none was named, never as zero', async () => {
    const ceilingOnly = contentfulResult(url, 'provider')
    const named = journal()
    await new LadderRunner([blockedHttp(), provider(ceilingOnly, 'sess-2', [], named.writes)], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1), paidCalls: named.log })
    expect(named.writes.at(-1)).toMatchObject({ state: 'usage_pending', chargedUsd: 0.3, settledAt: null })
    // A measure missing the provider's byte count is a bound too.
    const partial = journal()
    const unmeasured = { ...ceilingOnly, usage: { ...ceilingOnly.usage, measuredCostUsd: 0.01, vendorSessionMs: 4_000, vendorProxyBytes: null } }
    await new LadderRunner([blockedHttp(), provider(unmeasured, 'sess-3', [], partial.writes)], ALLOWED_ALL).run(url, undefined, { spend: createSpendLedger(1), paidCalls: partial.log })
    expect(partial.writes.at(-1)).toMatchObject({ state: 'usage_pending', chargedUsd: 0.01 })
    // A call that threw before any session was named: what it cost is unknown, and the ledger holds its ceiling.
    const thrown = journal()
    const ledger = createSpendLedger(1)
    await expect(new LadderRunner([blockedHttp(), provider(new Error('session dropped'), null, [], thrown.writes)], ALLOWED_ALL).run(url, undefined, { spend: ledger, paidCalls: thrown.log })).rejects.toThrow('session dropped')
    expect(thrown.writes.map((row) => [row.state, row.chargedUsd])).toEqual([['reserved', null], ['unknown', null]])
    expect(ledger.settledUsd).toBeCloseTo(0.3)
  })

  it('makes no call when its reserved row cannot be written, and gives the reservation back', async () => {
    const ledger = createSpendLedger(1)
    const calls: string[] = []
    const failingLog: PaidCallLog = { ...journal().log, write: async () => { throw new Error('disk full') } }
    const paid: Channel = { id: 'provider', vendorId: 'steel', priceCeilingUsd: 0.3, identity: COHERENT, fetch: async (target) => { calls.push(target); return contentfulResult(url, 'provider') } }
    await expect(new LadderRunner([blockedHttp(), paid], ALLOWED_ALL).run(url, undefined, { spend: ledger, paidCalls: failingLog })).rejects.toThrow('disk full')
    expect(calls).toEqual([])
    expect(ledger.reservedUsd).toBe(0)
    expect(ledger.settledUsd).toBe(0)
  })

  it('keeps the page a paid call returned when a later write of its row fails, and still writes the ones after it', async () => {
    const { log, writes } = journal()
    let attempt = 0
    // The `submitted` write (the second) fails once, as a busy database would.
    const flaky: PaidCallLog = { ...log, write: async (call) => { if (++attempt === 2) throw new Error('SQLITE_BUSY'); await log.write(call) } }
    const reported = { ...contentfulResult(url, 'provider'), usage: { ...contentfulResult(url, 'provider').usage, externalCostUsd: 0.12 } }
    const ledger = createSpendLedger(1)
    const run = await new LadderRunner([blockedHttp(), provider(reported, 'sess-1', [], writes)], ALLOWED_ALL).run(url, undefined, { spend: ledger, paidCalls: flaky })
    expect(run.result).toMatchObject({ status: 'success', lane: 'provider' })
    expect(writes.map((row) => row.state)).toEqual(['reserved', 'settled'])
    // And a settled write that fails leaves the page as the answer, its row open for the next run to settle.
    const stuck = journal()
    let count = 0
    const failingSettle: PaidCallLog = { ...stuck.log, write: async (call) => { if (++count === 3) throw new Error('SQLITE_BUSY'); await stuck.log.write(call) } }
    const second = createSpendLedger(1)
    const again = await new LadderRunner([blockedHttp(), provider(reported, 'sess-2', [], stuck.writes)], ALLOWED_ALL).run(url, undefined, { spend: second, paidCalls: failingSettle })
    expect(again.result.status).toBe('success')
    expect(stuck.writes.map((row) => row.state)).toEqual(['reserved', 'submitted'])
    expect(second.settledUsd).toBeCloseTo(0.12)
    expect(ledger.settledUsd).toBeCloseTo(0.12)
  })

  it('keeps the in-memory ledger alone for a scrape with no task store', async () => {
    const ledger = createSpendLedger(1)
    const run = await new LadderRunner([blockedHttp(), { ...channel('provider', [contentfulResult(url, 'provider')], 'steel'), priceCeilingUsd: 0.3 }], ALLOWED_ALL).run(url, undefined, { spend: ledger })
    expect(ledger.settledUsd).toBeCloseTo(0.3)
    expect((run.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }).calls[0]).not.toHaveProperty('paidCallId')
  })
})

describe('LadderRunner — a task contract (ADR 0006)', () => {
  const url = 'https://example.com/p'
  const page = (lane: FetchResult['lane'], markdown: string): FetchResult => ({ ...contentfulResult(url, lane), markdown })
  const wants = { checks: [{ type: 'markdownIncludes' as const, text: 'Price' }] }
  const steps = (run: Awaited<ReturnType<LadderRunner['run']>>, event: string) => run.ladderTrace.filter((t) => t.event === event)

  it('takes a page that passes the contract and goes on up the ladder from one that fails it, judging every rung', async () => {
    const http = channel('http', [page('http', 'A longer page without the figure the task needs.')])
    const browser = channel('browser_local', [page('browser_local', 'Price 12')])
    const run = await new LadderRunner([http, browser], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(run.result.lane).toBe('browser_local')
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(steps(run, 'verification_checked').map((t) => t.detail)).toEqual([
      { vendorId: null, status: 'failed', reason: 'checks_failed', verdict: 'failed', failed: ['markdownIncludes'], notJudged: 0 },
      { vendorId: null, status: 'passed', reason: null, verdict: 'passed', failed: [], notJudged: 0 },
    ])
    // Read without its scripts, the page may hold the data once a browser runs them (region readiness, ADR 0007).
    expect(steps(run, 'ladder_step')[0]?.detail).toMatchObject({ escalate: 'verification_failed', readiness: 'not_loaded' })

    // Without a contract the first page is the answer, as before.
    const plain = await new LadderRunner([channel('http', [page('http', 'No figure here.')]), channel('browser_local', [page('browser_local', 'Price 12')])], { mode: 'authed' }).run(url)
    expect(plain.result.lane).toBe('http')
    expect(steps(plain, 'verification_checked')).toEqual([])
  })

  it('answers with the page that passed, with no quality hop after it', async () => {
    const thin: FetchResult = { ...page('http', 'Price 12'), trace: [{ at: 1, lane: 'http', event: 'quality_low_yield', detail: { confidence: 0.1, contentTokens: 3 } }] }
    const browser = channel('browser_local', [page('browser_local', 'Price 12 and much more of the page.')])
    const run = await new LadderRunner([channel('http', [thin]), browser], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(run.result.lane).toBe('http')
    expect(browser.calls).toEqual([])
  })

  it('keeps the page with most content when no rung passes', async () => {
    const http = channel('http', [page('http', 'A longer page without the figure the task needs.')])
    const browser = channel('browser_local', [page('browser_local', 'Short.')])
    const run = await new LadderRunner([http, browser], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(run.result.lane).toBe('http')
    expect(steps(run, 'ladder_best_kept')).toHaveLength(1)
  })

  it('opens no paid rung after a page the classifier reads as not extracted, and stops where it reads the page as ready', async () => {
    const vendor = channel('provider', [page('provider', 'Price 12')], 'steel')
    const run = await new LadderRunner([channel('http', [page('http', 'No figure.')]), channel('browser_local', [page('browser_local', 'Still no figure.')]), vendor], { mode: 'authed' }, null, null, null, { verify: wants, classifyContractFailure: () => 'not_extracted' }).run(url)
    expect(vendor.calls).toEqual([])
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(steps(run, 'ladder_channel_skipped')[0]?.detail.reason).toContain('not_extracted')

    const browser = channel('browser_local', [page('browser_local', 'Price 12')])
    const ready = await new LadderRunner([channel('http', [page('http', 'No figure.')]), browser], { mode: 'authed' }, null, null, null, { verify: wants, classifyContractFailure: () => 'ready' }).run(url)
    expect(ready.result.lane).toBe('http')
    expect(browser.calls).toEqual([])
  })

  it('reads a browser page that failed its contract by its region wait: a region that never came goes on to a paid rung, one that held does not', async () => {
    const waited = (ready: boolean): FetchResult => ({ ...page('browser_local', 'No figure.'), trace: [{ at: 1, lane: 'browser_local', event: 'region_wait', detail: { ready, empty: false, loading: false, steady: true, judged: 3, reads: 3, waitedMs: 2_000, contractSha256: contractSha256(wants), checks: [] } }] })
    const absent = channel('provider', [page('provider', 'Price 12')], 'steel')
    const served = await new LadderRunner([channel('http', [page('http', 'No figure.')]), channel('browser_local', [waited(false)]), absent], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(served.result.lane).toBe('provider')
    expect(steps(served, 'ladder_step').map((t) => t.detail.readiness)).toEqual(['not_loaded', 'not_served', undefined])

    const held = channel('provider', [page('provider', 'Price 12')], 'steel')
    const extracted = await new LadderRunner([channel('http', [page('http', 'No figure.')]), channel('browser_local', [waited(true)]), held], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(held.calls).toEqual([])
    expect(steps(extracted, 'ladder_step').map((t) => t.detail.readiness)).toEqual(['not_loaded', 'not_extracted'])
  })

  it('goes on to a paid rung from a browser page whose region no live read judged, and keeps a vendor whose region held off its failures', async () => {
    const vendor = channel('provider', [page('provider', 'Price 12')], 'steel')
    const unjudged = await new LadderRunner([channel('http', [page('http', 'No figure.')]), channel('browser_local', [page('browser_local', 'Still no figure.')]), vendor], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(unjudged.result.lane).toBe('provider')
    expect(steps(unjudged, 'ladder_step').map((t) => t.detail.readiness)).toEqual(['not_loaded', 'not_served', undefined])

    const history = new MemoryRoutingHistory()
    const held: FetchResult = { ...page('provider', 'No figure.'), trace: [{ at: 1, lane: 'provider', event: 'region_wait', detail: { ready: true, empty: false, loading: false, steady: true, judged: 3, reads: 3, waitedMs: 2_000, contractSha256: contractSha256(wants), checks: [] } }] }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), channel('provider', [held], 'steel')], { mode: 'authed' }, history, null, null, { verify: wants }).run(url)
    expect(steps(run, 'ladder_step').at(-1)?.detail.readiness).toBe('not_extracted')
    // Written into the history, not counted as the vendor failing (ADR 0007).
    expect((await history.read('example.com')).vendors.steel).toMatchObject({ attempts: 1, contentful: 1 })
  })

  it('goes on to a paid rung from a page whose row checks no table reader judged (PA C2, decision 12)', async () => {
    const titleOnly: FetchResult = { ...page('browser_local', 'No figure.'), trace: [{ at: 1, lane: 'browser_local', event: 'region_wait', detail: { ready: false, empty: false, loading: false, steady: true, judged: 2, reads: 2, waitedMs: 500, contractSha256: contractSha256(wants), tablesUnjudged: true, checks: [{ index: 0, type: 'tableRowsMin', passed: null }] } }] }
    const vendor = channel('provider', [page('provider', 'Price 12')], 'steel')
    const run = await new LadderRunner([channel('http', [page('http', 'No figure.')]), channel('browser_local', [titleOnly]), vendor], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(run.result.lane).toBe('provider')
    expect(steps(run, 'ladder_step').map((t) => t.detail.readiness)).toEqual(['not_loaded', 'not_served', undefined])
  })

  it('decides nothing on a check the ladder cannot judge yet (one on the JSON a format extracts after the run)', async () => {
    const browser = channel('browser_local', [page('browser_local', 'Price 12')])
    const run = await new LadderRunner([channel('http', [page('http', 'No figure.')]), browser], { mode: 'authed' }, null, null, null, { verify: { checks: [{ type: 'field', path: 'json.data.price', present: true }] } }).run(url)
    expect(run.result.lane).toBe('http')
    expect(browser.calls).toEqual([])
    expect(steps(run, 'verification_checked')[0]?.detail).toMatchObject({ verdict: null, notJudged: 1 })
  })

  it('counts a vendor\'s success by the contract when it has one', async () => {
    const history = new MemoryRoutingHistory()
    const blocked = () => channel('http', [blockedResult(url, 'bot_detected_generic')])
    const steel = channel('provider', [page('provider', 'A page without the figure.')], 'steel')
    await new LadderRunner([blocked(), steel], { mode: 'authed' }, history, null, null, { verify: wants }).run(url)
    expect((await history.read('example.com')).vendors.steel).toMatchObject({ attempts: 1, contentful: 0 })

    const bb = channel('provider', [page('provider', 'A page without the figure.')], 'browserbase')
    await new LadderRunner([blocked(), bb], { mode: 'authed' }, history).run(url)
    expect((await history.read('example.com')).vendors.browserbase).toMatchObject({ attempts: 1, contentful: 1 })
  })
})

describe('LadderRunner — the shadow action decision (PA F4)', () => {
  const url = 'https://example.com/p'
  const page = (lane: FetchResult['lane'], markdown: string): FetchResult => ({ ...contentfulResult(url, lane), markdown })
  const wants = { checks: [{ type: 'markdownIncludes' as const, text: 'Price' }] }
  const shadow = (run: Awaited<ReturnType<LadderRunner['run']>>) => run.ladderTrace.filter((t) => t.event === 'ladder_action_decision').map((t) => ({ channel: t.channel, ...t.detail }))

  it('records, for each rung that answered, decideNext\'s action beside the one the ladder took, and drives nothing', async () => {
    const http = channel('http', [blockedResult(url, 'cloudflare_challenge')])
    const browser = channel('browser_local', [contentfulResult(url, 'browser_local')])
    const run = await new LadderRunner([http, browser], { mode: 'authed' }).run(url)
    expect(run.result.lane).toBe('browser_local')
    expect(shadow(run)).toEqual([
      { channel: 'http', shadow: 'next_rung', reason: 'bot_gate', actual: 'next_rung', differs: false },
      { channel: 'browser_local', shadow: 'stop', reason: 'delivered', actual: 'stop', differs: false },
    ])
  })

  it('names the cases where the shadow decision and the ladder differ: a page there but not extracted is read again, not stepped past', async () => {
    const vendor = channel('provider', [page('provider', 'Price 12')], 'steel')
    const run = await new LadderRunner([channel('http', [page('http', 'No figure.')]), channel('browser_local', [page('browser_local', 'Still no figure.')]), vendor], { mode: 'authed' }, null, null, null, { verify: wants, classifyContractFailure: () => 'not_extracted' }).run(url)
    expect(vendor.calls).toEqual([])
    expect(shadow(run)).toEqual([
      { channel: 'http', shadow: 'reextract', reason: 'not_extracted', actual: 'next_rung', differs: true },
      { channel: 'browser_local', shadow: 'reextract', reason: 'not_extracted', actual: 'stop', differs: true },
    ])
  })

  it('a rate limit: decideNext waits for Retry-After, the ladder stops', async () => {
    const limited: FetchResult = { ...blockedResult(url, 'rate_limit'), evidence: { ...blockedResult(url, 'rate_limit').evidence, httpStatus: 429 }, retryAt: Date.now() + 5_000 }
    const run = await new LadderRunner([channel('http', [limited]), channel('browser_local', [])], { mode: 'authed' }).run(url)
    expect(shadow(run)).toEqual([{ channel: 'http', shadow: 'wait_retry_after', reason: 'retry_after', actual: 'stop', differs: true }])
  })
})

describe('LadderRunner — route observations in the vendor\'s history (PA G2a)', () => {
  const url = 'https://example.com/p'
  const wants = { checks: [{ type: 'markdownIncludes' as const, text: 'Price' }] }
  const chromeMajor = Number(/Chrome\/(\d+)/.exec(COHERENT.userAgent)![1])

  it('writes the layers, the timings, the environment and the ledger\'s charge of a paid call, not the provider\'s null price', async () => {
    const history = new MemoryRoutingHistory()
    const held: FetchResult = {
      ...contentfulResult(url, 'provider', 3_500),
      markdown: 'No figure.',
      usage: { ...contentfulResult(url, 'provider', 3_500).usage, externalCostUsd: null, measuredCostUsd: 0.004, vendorSessionMs: 3_100, vendorProxyBytes: null, vendorSolves: null, timings: { extractMs: 40, totalMs: 3_500 } },
      trace: [{ at: 1, lane: 'provider', event: 'region_wait', detail: { ready: true, empty: false, loading: false, steady: true, judged: 3, reads: 3, waitedMs: 2_000, contractSha256: contractSha256(wants), checks: [] } }],
    }
    const steel = { ...channel('provider', [held], 'steel'), priceCeilingUsd: 0.01, grantCapabilities: ['vendor_remote_browser'] }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), steel], { mode: 'authed' }, history, null, null, { verify: wants }).run(url)
    expect(run.channelsTried).toEqual(['http', 'provider'])
    const entry = (await history.read('example.com')).vendors.steel!
    // A page that came but was not extracted is not the vendor failing (ADR 0007): counted as contentful, as before.
    expect(entry).toMatchObject({ attempts: 1, contentful: 1, costUnknownAttempts: 1, chargedTotalUsd: 0.004, chargedUnknownAttempts: 0 })
    expect(entry.observations).toHaveLength(1)
    expect(entry.observations[0]).toMatchObject({
      accessDelivered: true,
      regionLoaded: true,
      // There but not extracted: the vendor did not fail the task either (ADR 0007), so it is unknown, not a no.
      taskVerified: null,
      failureStage: 'extraction',
      readiness: 'not_extracted',
      reason: 'checks_failed',
      chargedUsd: 0.004,
      chargeBasis: 'measured',
      costUsd: null,
      timings: { regionWaitMs: 2_000, extractMs: 40, sessionMs: 3_100, totalMs: 3_500, navigationMs: null, coldStartMs: null },
      environment: { browserMajor: chromeMajor, egressClass: 'vendor_default' },
    })
    expect(entry.observations[0]!.environment.egressConfigVersion).toMatch(/^[0-9a-f]{12}$/)
    expect(entry.layers.taskVerified).toEqual({ yes: 0, no: 0, unknown: 1 })
  })

  it('names the stage a vendor\'s attempt failed at: access for a block, the task for a page that did not do it', async () => {
    const history = new MemoryRoutingHistory()
    const blocked = { ...blockedResult(url, 'cloudflare_challenge'), lane: 'provider' as const }
    await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), channel('provider', [blocked], 'steel')], { mode: 'authed' }, history).run(url)
    expect((await history.read('example.com')).vendors.steel!.observations[0]).toMatchObject({ accessDelivered: false, regionLoaded: null, taskVerified: null, failureStage: 'access', readiness: null, reason: 'cloudflare_challenge', chargedUsd: 0, chargeBasis: 'ceiling' })

    const wrong = { ...contentfulResult(url, 'provider'), markdown: 'A page without the figure.' }
    await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), channel('provider', [wrong], 'bb')], { mode: 'authed' }, history, null, null, { verify: wants, classifyContractFailure: () => 'not_served' }).run(url)
    expect((await history.read('example.com')).vendors.bb!.observations[0]).toMatchObject({ accessDelivered: true, regionLoaded: false, taskVerified: false, failureStage: 'region', readiness: 'not_served' })
    expect((await history.read('example.com')).vendors.bb).toMatchObject({ attempts: 1, contentful: 0 })
  })
})

describe('LadderRunner — the route a vendor\'s history is kept under (PA G2b)', () => {
  it('reads and records under the path or task family, the formats asked for and the extractor and verifier versions', async () => {
    const seen: { op: string; domain: string; route: unknown }[] = []
    const history: RoutingHistory = {
      async read(domain, route) { seen.push({ op: 'read', domain, route }); return { vendors: {}, lastVendor: null } },
      async record(domain, _vendor, _outcome, route) { seen.push({ op: 'record', domain, route }) },
    }
    const url = 'https://example.com/products/12345?ref=x'
    const providers = () => [channel('provider', [contentfulResult(url, 'provider')], 'steel'), channel('provider', [contentfulResult(url, 'provider')], 'bb')]
    await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), ...providers()], { mode: 'authed' }, history).run(url, null, {}, { includeTables: true, includeHtml: true })
    const versions = `${EXTRACTOR_VERSION}|${VERIFIER_VERSION}`
    expect(seen).toEqual([
      { op: 'read', domain: 'example.com', route: { family: 'path:/products/*', formats: 'html,markdown,tables', versions } },
      { op: 'record', domain: 'example.com', route: { family: 'path:/products/*', formats: 'html,markdown,tables', versions } },
    ])
    seen.length = 0
    const wants = { checks: [{ type: 'markdownIncludes' as const, text: 'MAIN' }] }
    await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), ...providers()], { mode: 'authed' }, history, null, null, { verify: wants }).run(url)
    expect(seen.map((s) => s.route)).toEqual([0, 1].map(() => ({ family: `task:${contractSha256(wants).slice(0, 12)}`, formats: 'markdown', versions })))
  })

  it('keeps no name, address, token or id of a path in its family', async () => {
    const families: string[] = []
    const history: RoutingHistory = {
      async read(_domain, route) { families.push(route!.family); return { vendors: {}, lastVendor: null } },
      async record() {},
    }
    for (const path of ['/users/jane.doe@example.com', '/u/jane%40example.com', '/@janedoe/posts', '/reset/eyJhbGciOiJIUzI1NiJ9.eyJzdWIi', '/share/AbCdEfGhIjKlMnOp', '/token=abcDEFghiJKLmno', '/jane.doe@example.com', '/12345', '/', '/Blog']) {
      const url = `https://example.com${path}`
      const providers = [channel('provider', [contentfulResult(url, 'provider')], 'steel'), channel('provider', [contentfulResult(url, 'provider')], 'bb')]
      await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), ...providers], { mode: 'authed' }, history).run(url)
    }
    expect(families).toEqual(['path:/users/*', 'path:/u/*', 'path:/*/*', 'path:/reset/*', 'path:/share/*', 'path:/*', 'path:/*', 'path:/*', 'path:/', 'path:/blog'])
  })
})

describe('LadderRunner — the shadow vendor ranking (PA G3)', () => {
  const url = 'https://example.com/p'
  const chromeMajor = Number(/Chrome\/(\d+)/.exec(COHERENT.userAgent)![1])
  async function route(history: RoutingHistory, vendor: string, passed: number, failed: number, each: number): Promise<void> {
    for (const verified of [...Array<boolean>(passed).fill(true), ...Array<boolean>(failed).fill(false)]) {
      await history.record('example.com', vendor, {
        contentful: true, verified, wallMs: 1_000, costUsd: null, failureClass: null,
        observation: {
          accessDelivered: true, regionLoaded: true, taskVerified: verified, failureStage: verified ? null : 'task', readiness: verified ? 'ready' : 'not_served', reason: null,
          timings: { coldStartMs: null, navigationMs: null, challengeWaitMs: null, regionWaitMs: null, captureMs: null, extractMs: null, serializeMs: null, cleanupMs: null, sessionMs: null, totalMs: 1_000 },
          environment: { browserMajor: chromeMajor, egressClass: null, egressConfigVersion: null },
          chargedUsd: each, chargeBasis: 'measured',
        },
      })
    }
  }
  const providers = () => {
    const bb = channel('provider', [contentfulResult(url, 'provider')], 'browserbase')
    const steel = channel('provider', [contentfulResult(url, 'provider')], 'steel')
    return { bb, steel }
  }

  it('writes the unit-cost ranking beside the order the ladder took, and does not change that order', async () => {
    const history = new MemoryRoutingHistory()
    // Steel passes every time at $0.05 a call; Browserbase passes 4 in 5 at $0.01: $0.0125 a delivery.
    await route(history, 'steel', 5, 0, 0.05)
    await route(history, 'browserbase', 4, 1, 0.01)
    const { bb, steel } = providers()
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), bb, steel], { mode: 'authed' }, history).run(url)
    // The order main takes: today's formula puts the higher success rate first.
    expect(steel.calls).toHaveLength(1)
    expect(bb.calls).toHaveLength(0)
    const shadow = run.ladderTrace.filter((t) => t.event === 'vendor_rank_shadow')
    expect(shadow).toHaveLength(1)
    expect(shadow[0]!.detail).toMatchObject({
      declared: ['browserbase', 'steel'],
      actual: ['steel', 'browserbase'],
      shadow: ['browserbase', 'steel'],
      differs: true,
      fallbackReasons: [],
    })
    expect(shadow[0]!.detail!.candidates).toEqual([
      expect.objectContaining({ vendorId: 'browserbase', unitCostUsd: 0.0125, passRate: 0.8, samples: 5, unknownExposureAttempts: 0, fallbackReason: null }),
      expect.objectContaining({ vendorId: 'steel', unitCostUsd: 0.05, passRate: 1, samples: 5, unknownExposureAttempts: 0, fallbackReason: null }),
    ])
  })

  it('ranks in the shadow for a single provider too, falling back to the declared order on a new host', async () => {
    const history = new MemoryRoutingHistory()
    const { steel } = providers()
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), steel], { mode: 'authed' }, history).run(url)
    expect(run.channelsTried).toEqual(['http', 'provider'])
    expect(run.ladderTrace.find((t) => t.event === 'vendor_rank_shadow')?.detail).toMatchObject({
      declared: ['steel'], actual: ['steel'], shadow: ['steel'], differs: null, fallbackReasons: ['new_host'],
    })
  })

  it('compares nothing when it fell back: differs is null, not a disagreement', async () => {
    const history = new MemoryRoutingHistory()
    await route(history, 'steel', 3, 0, 0.01)
    await route(history, 'browserbase', 0, 1, 0.01)
    const { bb, steel } = providers()
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), bb, steel], { mode: 'authed' }, history).run(url)
    expect(steel.calls).toHaveLength(1)
    expect(run.ladderTrace.find((t) => t.event === 'vendor_rank_shadow')?.detail).toMatchObject({
      actual: ['steel', 'browserbase'], shadow: ['browserbase', 'steel'], differs: null, fallbackReasons: ['insufficient_samples'],
    })
  })

  it('goes on without the shadow when a single provider\'s history cannot be read', async () => {
    const history: RoutingHistory = { async read() { throw new Error('database is locked') }, async record() {} }
    const { steel } = providers()
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), steel], { mode: 'authed' }, history).run(url)
    expect(run.result.status).toBe('success')
    expect(run.ladderTrace.find((t) => t.event === 'vendor_rank_shadow')?.detail).toMatchObject({ declared: ['steel'], actual: ['steel'], shadow: null, differs: null, error: 'history_unreadable' })
  })

  it('writes nothing without a routing history', async () => {
    const { bb, steel } = providers()
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'bot_detected_generic')]), bb, steel], { mode: 'authed' }).run(url)
    expect(run.ladderTrace.some((t) => t.event === 'vendor_rank_shadow')).toBe(false)
    expect(bb.calls).toHaveLength(1)
  })
})

describe('LadderRunner — a local rung\'s CAPTCHA solves (ADR 0005 third_party_captcha_solver)', () => {
  const url = 'https://example.com/p'
  const solve = (outcome: string, chargedUsd: number | null, extra: Record<string, unknown> = {}) => ({ at: 5, lane: 'browser_local' as const, event: 'captcha_solve', detail: { vendor: 'capsolver', type: 'turnstile', outcome, solve: 1, ms: 900, chargedUsd, ceilingUsd: chargedUsd === null ? null : 0.003, costBasis: chargedUsd === null ? null : 'tariff', reason: null, code: null, egress: 'none', blockReasonAfter: outcome === 'cleared' ? null : 'captcha', ...extra } })
  const grant = { sha256: 'a'.repeat(64), tier: 'enhanced' as const, attestedAt: '2026-10-25T00:00:00Z' }

  it('puts each solve whose task was made on the run\'s paid calls, its cost unknown from the vendor (never 0)', async () => {
    const solved: FetchResult = { ...contentfulResult(url, 'browser_local'), usage: { ...contentfulResult(url, 'browser_local').usage, externalCostUsd: 0 }, trace: [] }
    const browser: Channel = { id: 'browser_local', identity: COHERENT, grant, async fetch(_url, _session, execution) {
      const call = execution!.captchaSolves!.charged({ vendor: 'capsolver', rung: 'browser_local', ceilingUsd: 0.003, chargedUsd: 0.003, reportedCostUsd: null, solved: true })
      return { ...solved, trace: [solve('cleared', 0.003, { call })] }
    } }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'captcha')]), browser], { mode: 'authed' }).run(url)
    expect(run.result.lane).toBe('browser_local')
    expect(run.result.usage.externalCostUsd).toBeNull()
    expect(run.result.usage.externalCostChargedUsd).toBeCloseTo(0.003)
    const paid = run.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[]; grant: unknown }
    expect(paid.calls).toEqual([expect.objectContaining({ provider: 'capsolver', rung: 'browser_local', capabilities: ['third_party_captcha_solver'], ceilingUsd: 0.003, chargedUsd: 0.003, reportedCostUsd: null, solves: 1, solveAttempts: 1, outcome: 'success', answer: true })])
    expect(paid.grant).toEqual(grant)
    // A solve that bought nothing (no task: a limit, an unsupported check, another exit) is on the trace alone.
    const none: FetchResult = { ...blockedResult(url, 'captcha'), lane: 'browser_local', trace: [solve('limit_reached', null)] }
    const quiet = await new LadderRunner([channel('browser_local', [none])], { mode: 'authed' }).run(url)
    expect(quiet.result.trace.some((event) => event.event === 'paid_calls')).toBe(false)
  })

  it('keeps a solve the ledger charged on the paid calls when the rung throws after it, and counts solves for the page across rungs', async () => {
    const seen: number[] = []
    const solving = (id: string, then: 'throw' | FetchResult): Channel => ({
      id, identity: COHERENT, grant,
      async fetch(_url, _session, execution) {
        seen.push(execution!.captchaSolves!.used())
        const call = execution!.captchaSolves!.charged({ vendor: 'capsolver', rung: id, ceilingUsd: 0.003, chargedUsd: 0.003, reportedCostUsd: null, solved: true })
        if (then === 'throw') throw new Error('page closed')
        return { ...then, trace: [solve('still_gated', 0.003, { call, rung: id })] }
      },
    })
    const gated = { ...blockedResult(url, 'captcha'), lane: 'browser_local' as const }
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'captcha')]), solving('browser_local', gated), solving('installed_chrome', gated)], { mode: 'standard', enhanced: true }).run(url)
    // The second rung saw the first rung's solve: maxSolvesPerCall bounds the page, not each rung.
    expect(seen).toEqual([0, 1])
    const paid = run.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }
    expect(paid.calls).toEqual([
      expect.objectContaining({ provider: 'capsolver', rung: 'browser_local', chargedUsd: 0.003, outcome: 'blocked', reason: 'captcha' }),
      expect.objectContaining({ provider: 'capsolver', rung: 'installed_chrome', chargedUsd: 0.003, outcome: 'blocked', reason: 'captcha' }),
    ])
    expect(run.result.usage.externalCostChargedUsd).toBeCloseTo(0.006)
    // A rung that throws after a charged solve: the run's error still carries the solve, its page unknown (null).
    const thrown = await new LadderRunner([solving('browser_local', 'throw')], { mode: 'authed' }).run(url).then(() => null, (error: unknown) => error)
    expect((paidCallsOfError(thrown)?.detail as { calls: Record<string, unknown>[] }).calls).toEqual([expect.objectContaining({ provider: 'capsolver', chargedUsd: 0.003, outcome: null })])
  })

  it('counts a task the vendor refused to create against the page\'s solves, charging nothing (proxyless test 2026-10-25: 4 calls for 2 pages)', async () => {
    const seen: number[] = []
    const refusing = (id: string): Channel => ({
      id, identity: COHERENT, grant,
      async fetch(_url, _session, execution) {
        seen.push(execution!.captchaSolves!.used())
        execution!.captchaSolves!.refused()
        return { ...blockedResult(url, 'captcha'), lane: 'browser_local', trace: [solve('solver_failed', null, { rung: id, reason: 'rejected', code: 'ERROR_INVALID_TASK_DATA' })] }
      },
    })
    const run = await new LadderRunner([channel('http', [blockedResult(url, 'captcha')]), refusing('browser_local'), refusing('installed_chrome')], { mode: 'standard', enhanced: true }).run(url)
    expect(seen).toEqual([0, 1])
    // No task, so no paid call and no charge.
    expect(run.result.trace.some((event) => event.event === 'paid_calls')).toBe(false)
    expect(run.result.usage.externalCostChargedUsd ?? 0).toBe(0)
  })

  it('counts a solve the vendor reported failed as attempted, not solved, at the 0 its terms bill (smoke test 2026-10-25, T045)', async () => {
    const browser: Channel = { id: 'browser_local', identity: COHERENT, grant, async fetch(_url, _session, execution) {
      const call = execution!.captchaSolves!.charged({ vendor: 'capsolver', rung: 'browser_local', ceilingUsd: 0.003, chargedUsd: 0, reportedCostUsd: null, solved: false })
      return { ...blockedResult(url, 'captcha'), lane: 'browser_local', trace: [solve('solver_failed', 0, { call, costBasis: 'vendor_unbilled_failure' })] }
    } }
    const run = await new LadderRunner([browser], { mode: 'authed' }).run(url)
    const paid = run.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: Record<string, unknown>[] }
    expect(paid.calls).toEqual([expect.objectContaining({ provider: 'capsolver', chargedUsd: 0, solveAttempts: 1, solves: 0, outcome: 'blocked', reason: 'captcha' })])
    expect(run.result.usage.externalCostChargedUsd).toBe(0)
  })

  it('judges the page after a solve by the task contract: a cleared check is not a verified task', async () => {
    const cleared: FetchResult = { ...contentfulResult(url, 'browser_local'), markdown: 'Welcome back. Nothing the task needs.', trace: [] }
    const wants = { checks: [{ type: 'markdownIncludes' as const, text: 'Price' }] }
    const browser: Channel = { id: 'browser_local', identity: COHERENT, async fetch(_url, _session, execution) {
      const call = execution!.captchaSolves!.charged({ vendor: 'capsolver', rung: 'browser_local', ceilingUsd: 0.003, chargedUsd: 0.003, reportedCostUsd: null, solved: true })
      return { ...cleared, trace: [solve('cleared', 0.003, { call })] }
    } }
    const run = await new LadderRunner([browser], { mode: 'authed' }, null, null, null, { verify: wants }).run(url)
    expect(run.ladderTrace.filter((t) => t.event === 'verification_checked').map((t) => t.detail.status)).toEqual(['failed'])
    expect((run.result.trace.find((event) => event.event === 'paid_calls')?.detail as { calls: unknown[] }).calls).toHaveLength(1)
  })
})
