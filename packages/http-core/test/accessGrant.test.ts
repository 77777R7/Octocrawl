import { describe, expect, it } from 'vitest'
import { normalizeAccessGrant, tariffCeilingUsd, tariffCostUsd } from '../src/accessGrant.js'

const ATTESTATION = { principal: 'tester', at: '2026-10-05T00:00:00Z', statement: 'I accept these routes.' }

describe('normalizeAccessGrant', () => {
  it('defaults to a standard grant that names nothing', () => {
    expect(normalizeAccessGrant({})).toEqual({
      ok: true,
      grant: { tier: 'standard', capabilities: [], budget: { perRequestUsd: null, perRunUsd: null }, scope: { hosts: null }, attestation: null, tariffs: {} },
    })
  })

  it('takes a provider tariff and computes the most one call can cost (ROADMAP PA item 4)', () => {
    const result = normalizeAccessGrant({ tariffs: { browserbase: { perHourUsd: 0.12, maxSessionMs: 120_000, minBilledMs: 60_000 }, flat: { perCallUsd: 0.01 } } })
    expect(result.ok).toBe(true)
    const grant = (result as { grant: import('../src/accessGrant.js').AccessGrant }).grant
    expect(grant.tariffs.browserbase).toEqual({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 120_000, minBilledMs: 60_000, billingIncrementMs: 1 })
    // Two minutes at $0.12 an hour.
    expect(tariffCeilingUsd(grant.tariffs.browserbase!)).toBeCloseTo(0.004)
    expect(tariffCeilingUsd(grant.tariffs.flat!)).toBeCloseTo(0.01)
    // A session billed for at least a minute: the floor counts when it is above the longest session.
    expect(tariffCeilingUsd({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 10_000, minBilledMs: 60_000, billingIncrementMs: 1 })).toBeCloseTo(0.002)
    // Billed by the minute, rounded up: 90 s bills two minutes.
    expect(tariffCeilingUsd({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 90_000, minBilledMs: 0, billingIncrementMs: 60_000 })).toBeCloseTo(0.004)
    // A provider that cannot be told to end a session before 60 s bills up to then when a release fails.
    expect(tariffCeilingUsd({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 20_000, minBilledMs: 0, billingIncrementMs: 1 }, 60_000)).toBeCloseTo(0.002)
  })

  it('prices a session by its measured time under the tariff (ROADMAP PA item 4)', () => {
    const steel = { perCallUsd: 0, perHourUsd: 0.1, maxSessionMs: 120_000, minBilledMs: 60_000, billingIncrementMs: 60_000 }
    // A 17 s session billed by the minute, at least one, is a minute; 61 s is two.
    expect(tariffCostUsd(steel, 17_000)).toBeCloseTo(0.1 / 60, 9)
    expect(tariffCostUsd(steel, 61_000)).toBeCloseTo(0.2 / 60, 9)
    // Billed by the millisecond with no minimum, it is its own time, and a per-call price comes on top.
    expect(tariffCostUsd({ ...steel, minBilledMs: 0, billingIncrementMs: 1 }, 17_000)).toBeCloseTo((0.1 * 17) / 3600, 9)
    expect(tariffCostUsd({ ...steel, perCallUsd: 0.01, minBilledMs: 0, billingIncrementMs: 1 }, 0)).toBeCloseTo(0.01, 9)
    // A minimum above the step: a 17 s session billed at least a minute, by the millisecond, is a minute.
    expect(tariffCostUsd({ ...steel, billingIncrementMs: 1 }, 17_000)).toBeCloseTo(0.1 / 60, 9)
    // The ceiling is what the longest session costs.
    expect(tariffCeilingUsd(steel)).toBeCloseTo(tariffCostUsd(steel, 120_000), 9)
  })

  it('refuses a tariff whose cost has no ceiling, or that names no price', () => {
    const result = normalizeAccessGrant({ tariffs: { a: { perHourUsd: 0.1 }, b: { perCallUsd: 0.01, perGbUsd: 5, maxBytes: 1000 }, c: { maxSessionMs: 1000 }, d: { perCallUsd: -1 }, e: { perCallUsd: 1, surge: 2 }, f: 'cheap' } })
    expect(result.ok).toBe(false)
    const problems = (result as { problems: readonly { field: string; reason: string }[] }).problems
    expect(problems.map((p) => p.field)).toEqual(expect.arrayContaining(['tariffs.a.maxSessionMs', 'tariffs.b.perGbUsd', 'tariffs.c', 'tariffs.d.perCallUsd', 'tariffs.e.surge', 'tariffs.f']))
    // Bandwidth pricing is refused by name, with what to do instead.
    expect(problems.find((p) => p.field === 'tariffs.b.perGbUsd')?.reason).toMatch(/proxies off/)
  })

  it('lets standard name the routes with no third-party cost, without a budget', () => {
    const r = normalizeAccessGrant({ tier: 'standard', capabilities: ['compatible_transport', 'egress_sessions'] })
    expect(r.ok && r.grant.capabilities).toEqual(['compatible_transport', 'egress_sessions'])
  })

  it.each(['standard', 'my_browser'])('refuses an enhanced-only capability under tier %s', (tier) => {
    const r = normalizeAccessGrant({ tier, capabilities: ['enhanced_browser'], attestation: ATTESTATION })
    expect(r).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'capabilities.enhanced_browser', kind: 'tier_too_low' })] })
  })

  it('needs a positive run budget before a third party can be paid', () => {
    for (const budget of [undefined, { perRunUsd: null }]) {
      const r = normalizeAccessGrant({ tier: 'enhanced', capabilities: ['vendor_remote_browser'], budget, attestation: ATTESTATION })
      expect(r).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'budget.perRunUsd', kind: 'budget_required' })] })
    }
    // Zero is not a budget: a cap reached before anything is spent would stop every run at once.
    for (const budget of [{ perRunUsd: 0 }, { perRequestUsd: 0 }]) {
      const field = Object.keys(budget)[0]
      expect(normalizeAccessGrant({ tier: 'standard', budget })).toEqual({ ok: false, problems: [expect.objectContaining({ field: `budget.${field}`, kind: 'invalid' })] })
    }
    const ok = normalizeAccessGrant({ tier: 'enhanced', capabilities: ['vendor_remote_browser'], budget: { perRunUsd: 2 }, attestation: ATTESTATION })
    expect(ok.ok && ok.grant.budget).toEqual({ perRequestUsd: null, perRunUsd: 2 })
  })

  it('needs an attestation for an enhanced capability, even one without third-party cost', () => {
    const r = normalizeAccessGrant({ tier: 'enhanced', capabilities: ['enhanced_browser'] })
    expect(r).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'attestation', kind: 'attestation_required' })] })
  })

  it('reports every problem, not just the first', () => {
    const r = normalizeAccessGrant({
      tier: 'premium',
      capabilities: ['camoufox', 'identity_rotation', 'no_such_thing'],
      budget: { perRequestUsd: -1 },
      scope: { hosts: [''] },
    })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.problems.map((p) => [p.field, p.kind])).toEqual([
      ['tier', 'invalid'],
      ['capabilities.camoufox', 'deferred'],
      ['capabilities.identity_rotation', 'refused'],
      ['capabilities.no_such_thing', 'unknown_capability'],
      ['budget.perRequestUsd', 'invalid'],
      ['scope.hosts', 'invalid'],
    ])
  })

  it('refuses a grant that is not an object', () => {
    expect(normalizeAccessGrant(['enhanced'])).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'grant', kind: 'invalid' })] })
  })
})
