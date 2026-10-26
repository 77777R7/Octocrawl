import { describe, expect, it } from 'vitest'
// The combined-grant windows' arms, Steel cap, Steel calls and the ic_compat exit (research/access/combinedArms.mjs).
import { exitOf, icCompatRefusal, pairsFor, reportArms, steelCalls, steelCapAllows, steelTally } from '../../../research/access/combinedArms.mjs'

const provider = (events: { event: string; detail?: Record<string, unknown> }[]) => ({ channel: 'provider', result: { trace: events.map((e) => ({ at: 0, lane: 'provider', ...e })) } })
const answer = (...attempts: unknown[]) => ({ summary: { attempts } })
const created = { event: 'session_created', detail: { ms: 1300, beforeLane: true } }
const gate = { event: 'provider_gate' }
const settled = (basis: string, chargedUsd: number) => ({ event: 'spend_settled', detail: { vendorId: 'steel', ceilingUsd: 0.0033, chargedUsd, basis, call: 1 } })

describe('combined-grant arms', () => {
  it('lists and compares the arms #716 ran exactly as before, and the ic_compat windows\' arms in one order whatever order they ran in', () => {
    const k716 = ['standard', 'installed_chrome', 'combined', 'firecrawl']
    expect(reportArms(k716, k716)).toEqual(k716)
    expect(pairsFor(reportArms(k716))).toEqual([['installed_chrome', 'standard'], ['combined', 'standard'], ['combined', 'installed_chrome']])
    const arms = reportArms(['installed_chrome', 'ic_compat', 'combined'], ['combined', 'ic_compat', 'installed_chrome'])
    expect(arms).toEqual(['installed_chrome', 'ic_compat', 'combined'])
    expect(pairsFor(arms)).toEqual([['combined', 'installed_chrome'], ['ic_compat', 'installed_chrome'], ['ic_compat', 'combined']])
    // An arm the report does not know is not listed.
    expect(reportArms(['installed_chrome_base', 'zenrows', 'installed_chrome'])).toEqual(['installed_chrome'])
  })

  it('takes a grant for the ic_compat arm only when it names installed_chrome and compatible_transport, nothing else', () => {
    expect(icCompatRefusal(['installed_chrome', 'compatible_transport'])).toBeNull()
    expect(icCompatRefusal(['compatible_transport', 'installed_chrome'])).toBeNull()
    expect(icCompatRefusal(['installed_chrome', 'compatible_transport', 'vendor_remote_browser', 'vendor_stealth'])).toMatch(/nothing else.*vendor_remote_browser/)
    expect(icCompatRefusal(['installed_chrome'])).toMatch(/it names installed_chrome\)/)
    expect(icCompatRefusal(['installed_chrome', 'installed_chrome', 'compatible_transport'])).not.toBeNull()
    expect(icCompatRefusal(null)).toMatch(/it names none/)
  })

  it('starts a Steel arm\'s run only when the window\'s charges, an unreported page at the ceiling, plus its pages at the ceiling stay within the cap', () => {
    const ok = steelCapAllows({ charged: [0.0033, 0.001, null], pages: 23, capUsd: 1, pageCeilingUsd: 0.0033 })
    expect(ok.ok).toBe(true)
    expect(ok.spentUsd).toBeCloseTo(0.0076, 10)
    expect(ok.worstUsd).toBeCloseTo(0.0076 + 23 * 0.0033, 10)
    expect(steelCapAllows({ charged: Array(290).fill(0.0033), pages: 23, capUsd: 1, pageCeilingUsd: 0.0033 }).ok).toBe(false)
    expect(steelCapAllows({ charged: [], pages: 1, capUsd: 1, pageCeilingUsd: null })).toEqual({ ok: false, spentUsd: null, worstUsd: null })
  })
})

describe('Steel calls', () => {
  it('reads each provider rung: its session, a create that failed, how each release was confirmed, and the charge', () => {
    const responses = [
      answer({ channel: 'http', result: { trace: [] } },
        provider([created, gate, { event: 'session_released', detail: { sessionMs: 9000, released: true, releaseAttempts: [{ ms: 400, confirmed: true }] } }, settled('measured', 0.0012)]),
        provider([{ event: 'provider_selected' }, { event: 'provider_failed', detail: { error: 'fetch failed' } }, settled('ceiling', 0.0033)])),
      // No release call was confirmed, and Steel's own state said released; then one it says is still live.
      answer(provider([{ event: 'session_created', detail: { ms: 2500 } }, gate, { event: 'session_released', detail: { released: true, releaseAttempts: [{ ms: 5000, confirmed: false, error: 'timeout' }], releaseState: { ms: 300, status: 'released' } } }, settled('measured', 0.0015)])),
      answer(provider([{ event: 'session_created', detail: { ms: 20300 } }, gate, { event: 'session_released', detail: { released: false, releaseAttempts: [{ ms: 5000, confirmed: false }], releaseState: { ms: 3000, status: 'live' } } }, settled('ceiling', 0.0033)])),
      { evidenceRecord: {} },
    ]
    const calls = responses.map((r) => steelCalls(r))
    expect(calls[0]).toHaveLength(2)
    expect(calls[0]![1]).toMatchObject({ created: false, createError: 'fetch failed', gated: false, releases: [], chargedUsd: 0.0033, basis: 'ceiling' })
    expect(calls[1]![0]!.releases).toEqual([{ released: true, by: 'state', calls: 1, state: 'released' }])
    expect(calls[3]).toBeNull()
    expect(steelCalls(answer({ channel: 'http', result: { trace: [] } }))).toEqual([])
    const s = steelTally(calls)
    expect(s).toMatchObject({ responses: 4, unread: 1, complete: false, chargedUsd: null, calls: 4, refused: 0, traced: true, created: 3, createMs: { p50: 2500, max: 20300 }, createFailed: 1, createErrors: { 'fetch failed': 1 }, createdWithoutRelease: 0, releases: 3, releasedBy: { call: 1, state: 1 }, unconfirmed: 1, unconfirmedStates: { live: 1 }, basis: { measured: 2, ceiling: 2 } })
    // The three answers read: their ledger total is known.
    expect(steelTally(calls.slice(0, 3)).chargedUsd).toBeCloseTo(0.0093, 10)
  })

  it('calls the sessions and releases unknown when the engine did not trace them, and the charge unknown when one was not reported', () => {
    // Before the provider's step events (#723): a call that reached the gate with no session_created event.
    const s = steelTally([steelCalls(answer(provider([gate, { event: 'provider_failed', detail: { error: 'navigation failed' } }]))), steelCalls(answer(provider([{ event: 'provider_failed', detail: { error: 'fetch failed' } }])))])
    expect(s).toMatchObject({ calls: 2, traced: false, created: null, createFailed: null, createErrors: null, releases: null, releasedBy: null, unconfirmed: null, basis: { unknown: 2 }, chargedUsd: null })
  })

  it('marks the tally incomplete, and the ledger total unknown, when an answer was not read', () => {
    const read = steelCalls(answer(provider([created, gate, { event: 'session_released', detail: { released: true, releaseAttempts: [{ ms: 300, confirmed: true }] } }, settled('measured', 0.002)])))
    expect(steelTally([read, null])).toMatchObject({ responses: 2, unread: 1, complete: false, calls: 1, created: 1, chargedUsd: null })
    expect(steelTally([null, null])).toMatchObject({ complete: false, calls: 0, chargedUsd: null })
    expect(steelTally([read])).toMatchObject({ complete: true, chargedUsd: 0.002 })
  })
})

describe('ic_compat exit', () => {
  const arm = (verified: number, fs: number, attempted = 92) => ({ planned: 92, attempted, verified, fs })
  it('holds when ic_compat verifies at least the combined count minus 2 with no more false successes', () => {
    expect(exitOf(arm(71, 1), arm(73, 2))).toEqual({ needed: 71, verified: true, falseSuccess: true, met: true })
    expect(exitOf(arm(70, 1), arm(73, 2))).toMatchObject({ verified: false, met: false })
    expect(exitOf(arm(73, 3), arm(73, 2))).toMatchObject({ verified: true, falseSuccess: false, met: false })
  })

  it('leaves the false-success side unknown when tasks an arm did not run could decide it', () => {
    expect(exitOf(arm(72, 1, 90), arm(73, 2))).toEqual({ needed: 71, verified: true, falseSuccess: null, met: null })
    // Decided even so: the tasks not run cannot raise ic_compat past combined, or ic_compat is past combined's most.
    expect(exitOf(arm(72, 0, 90), arm(73, 2))).toMatchObject({ falseSuccess: true, met: true })
    expect(exitOf(arm(72, 5), arm(73, 2, 90))).toMatchObject({ falseSuccess: false, met: false })
    expect(exitOf(arm(60, 1, 90), arm(73, 2))).toMatchObject({ verified: false, falseSuccess: null, met: false })
  })

  it('leaves the verified side unknown when tasks not run could decide it, as when the Steel cap held back a combined block', () => {
    expect(exitOf(arm(50, 10), arm(52, 12, 69))).toEqual({ needed: 50, verified: null, falseSuccess: true, met: null })
    expect(exitOf(arm(70, 1, 91), arm(73, 2))).toMatchObject({ verified: null, met: null })
    expect(exitOf(arm(75, 1), arm(52, 1, 69))).toMatchObject({ verified: true, met: true })
  })
})
