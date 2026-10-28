import { describe, expect, it } from 'vitest'
// Where an answer's time went, rung by rung (research/access/speedPhases.mjs), for the speed A/B records.
import { attemptsOf, headersOf, ROBOTS_FETCH_MS } from '../../../research/access/speedPhases.mjs'

const t0 = Date.parse('2026-10-26T12:00:00.000Z')
const iso = (ms: number) => new Date(t0 + ms).toISOString()
const ev = (at: number, event: string, detail?: Record<string, unknown>) => ({ at, lane: 'x', event, ...(detail === undefined ? {} : { detail }) })
const attempt = (channel: string, from: number, to: number, result: Record<string, unknown>) => ({ channel, startedAt: iso(from), endedAt: iso(to), result })

const http = attempt('http', 0, 1_000, { status: 'blocked', blockReason: 'bot_detected_generic', usage: { wallMs: 1_000, timings: { robotsMs: 300, requestMs: 500, bodyReadMs: 50, retryWaitMs: 0, cooldownWaitMs: 0, extractMs: 20 } }, trace: [] })
const chrome = attempt('installed_chrome', 1_000, 14_000, {
  status: 'blocked', blockReason: 'captcha', usage: { wallMs: 13_000 },
  trace: [ev(0, 'browser_start'), ev(400, 'identity_declared'), ev(410, 'robots_checked'), ev(420, 'navigate'), ev(11_420, 'challenge_wait', { blockReason: 'cloudflare_challenge', outcome: 'still_gated', ms: 10_000, capMs: 10_000 }), ev(12_500, 'rendered', { status: 403 })],
})
const provider = (o7: boolean) => attempt('provider', 14_000, 40_000, {
  status: 'success', usage: { wallMs: 20_000 },
  trace: [ev(0, 'provider_selected'),
    ...(o7 ? [ev(0, 'session_created', { ms: 2_000, beforeLane: true }), ev(0, 'cdp_connected', { ms: 2_500, beforeLane: true }), ev(0, 'ua_probed', { ms: 500, beforeLane: true })] : []),
    ev(450, 'provider_gate'), ev(450, 'robots_checked'),
    ...(o7 ? [ev(600, 'page_opened', { ms: 150 }), ev(5_000, 'navigate', { ms: 4_400, status: 200 }), ev(6_000, 'settled', { ms: 1_000 }), ev(7_000, 'region_read', { read: 1, ms: 900, judgeMs: 100 }), ev(19_000, 'page_read', { ms: 300 })] : []),
    ev(20_000, 'region_wait', { waitedMs: 8_000 }), ev(20_000, 'capture'),
    ...(o7 ? [ev(20_000, 'session_released', { sessionMs: 25_000, released: true, liveUsageMs: 200, releaseMs: 600, usageMs: 300 })] : [])],
})
const response = (o7: boolean) => ({ summary: { attempts: [http, chrome, provider(o7)] }, ladderTrace: [] })

describe('speed phases', () => {
  it('splits the http rung by its own timings and a browser rung by its events, with each check wait', () => {
    const [h, c] = attemptsOf(response(false))!
    expect(h).toMatchObject({ channel: 'http', clockMs: 1_000, robots: { ms: 300, fetched: true }, phases: { robots: 300, request: 550, retry_wait: 0, extract: 20 } })
    expect(c).toMatchObject({ channel: 'installed_chrome', clockMs: 13_000, phases: { launch: 400, robots: 10, challenge_wait: 10_000, navigation: 1_000, settle_other: 1_080, after_render: 500 } })
    // 10 ms between identity_declared and robots_checked: answered from the cache, not fetched.
    expect(c!.robots).toEqual({ ms: 10, fetched: 10 >= ROBOTS_FETCH_MS })
    expect(c!.challengeWaits).toEqual([{ rung: 'installed_chrome', blockReason: 'cloudflare_challenge', outcome: 'still_gated', ms: 10_000, capMs: 10_000 }])
  })

  it('reads a provider rung before O7 by its gaps, and after O7 by its timed steps', () => {
    const before = attemptsOf(response(false))![2]!
    expect(before.timedSteps).toBe(false)
    expect(before.phases).toEqual({ robots_gate: 450, loading_wait: 0, region_wait: 8_000, outside_lane: 6_000, in_page: 11_550 })
    const after = attemptsOf(response(true))![2]!
    expect(after.timedSteps).toBe(true)
    expect(after.phases).toMatchObject({ robots_gate: 450, session_created: 2_000, cdp_connected: 2_500, ua_probed: 500, page_opened: 150, navigate: 4_400, settled: 1_000, region_read: 1_000, page_read: 300, release: 1_100, outside_lane: 6_000 })
    expect(after.phases.in_page).toBeUndefined()
    expect(after.robots).toEqual({ ms: 450, fetched: true })
    // A session that was never created: its time is before the gate, not in a page, and it read no robots.txt.
    const failed = attemptsOf({ summary: { attempts: [attempt('provider', 0, 10_500, { status: 'failed', failureReason: 'provider_error', usage: { wallMs: 10_500 }, trace: [ev(0, 'provider_selected'), ev(10_500, 'provider_failed', { error: 'fetch failed' })] })] } })![0]!
    expect(failed.phases).toEqual({ robots_gate: 0, loading_wait: 0, region_wait: 0, outside_lane: 0, before_gate: 10_500 })
    expect(failed.robots).toBeNull()
  })

  it('reports the http request time and the header-timeout fallback, and null without a ladder summary', () => {
    const r = { summary: { attempts: [attempt('http', 0, 10_200, { status: 'failed', failureReason: 'timeout', usage: { wallMs: 10_200, timings: { requestMs: 10_050 } } }), attempt('browser_local', 10_200, 15_000, { status: 'blocked', usage: { wallMs: 4_800 } }), attempt('installed_chrome', 15_000, 20_000, { status: 'success', usage: { wallMs: 5_000 } })] }, ladderTrace: [{ at: 10_200, event: 'ladder_headers_timeout_fallback', channel: 'http', detail: { to: 'browser_local', remainingMs: 109_000, promised: true } }] }
    expect(headersOf(r)).toEqual({ requestMs: 10_050, httpStatus: 'failed', httpFailure: 'timeout', fallback: { remainingMs: 109_000, promised: true }, rungs: ['http', 'browser_local', 'installed_chrome'] })
    expect(headersOf({ summary: { attempts: [] } })).toMatchObject({ requestMs: null, fallback: null, rungs: [] })
    expect(attemptsOf({})).toBeNull()
    expect(attemptsOf(null)).toBeNull()
  })
})
