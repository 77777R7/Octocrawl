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
    expect(grant.tariffs.browserbase).toEqual({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 120_000, minBilledMs: 60_000, billingIncrementMs: 1, perGbUsd: 0, maxBytesPerCall: null, perSolveUsd: 0, maxSolvesPerCall: null })
    // Two minutes at $0.12 an hour.
    expect(tariffCeilingUsd(grant.tariffs.browserbase!)).toBeCloseTo(0.004)
    expect(tariffCeilingUsd(grant.tariffs.flat!)).toBeCloseTo(0.01)
    // A session billed for at least a minute: the floor counts when it is above the longest session.
    expect(tariffCeilingUsd({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 10_000, minBilledMs: 60_000, billingIncrementMs: 1, perGbUsd: 0, maxBytesPerCall: null, perSolveUsd: 0, maxSolvesPerCall: null })).toBeCloseTo(0.002)
    // Billed by the minute, rounded up: 90 s bills two minutes.
    expect(tariffCeilingUsd({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 90_000, minBilledMs: 0, billingIncrementMs: 60_000, perGbUsd: 0, maxBytesPerCall: null, perSolveUsd: 0, maxSolvesPerCall: null })).toBeCloseTo(0.004)
    // A provider that cannot be told to end a session before 60 s bills up to then when a release fails.
    expect(tariffCeilingUsd({ perCallUsd: 0, perHourUsd: 0.12, maxSessionMs: 20_000, minBilledMs: 0, billingIncrementMs: 1, perGbUsd: 0, maxBytesPerCall: null, perSolveUsd: 0, maxSolvesPerCall: null }, 60_000)).toBeCloseTo(0.002)
  })

  it('prices a session by its measured time under the tariff (ROADMAP PA item 4)', () => {
    const steel = { perCallUsd: 0, perHourUsd: 0.1, maxSessionMs: 120_000, minBilledMs: 60_000, billingIncrementMs: 60_000, perGbUsd: 0, maxBytesPerCall: null, perSolveUsd: 0, maxSolvesPerCall: null }
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
    const result = normalizeAccessGrant({ tariffs: { a: { perHourUsd: 0.1 }, b: { perCallUsd: 0.01, perGbUsd: 5 }, c: { maxSessionMs: 1000 }, d: { perCallUsd: -1 }, e: { perCallUsd: 1, surge: 2 }, f: 'cheap', g: { perSolveUsd: 0.003 } } })
    expect(result.ok).toBe(false)
    const problems = (result as { problems: readonly { field: string; reason: string }[] }).problems
    expect(problems.map((p) => p.field)).toEqual(expect.arrayContaining(['tariffs.a.maxSessionMs', 'tariffs.b.maxBytesPerCall', 'tariffs.c', 'tariffs.d.perCallUsd', 'tariffs.e.surge', 'tariffs.f', 'tariffs.g.maxSolvesPerCall']))
    // A per-GB price needs the most bytes a call may move: the vendor lane ends the session there.
    expect(problems.find((p) => p.field === 'tariffs.b.maxBytesPerCall')?.reason).toMatch(/most bytes one call may move/)
  })

  it('prices the provider\'s proxy bandwidth and solves under the tariff, and allows for the most of each in the ceiling (ROADMAP PA item 4)', () => {
    // Steel's Launch plan on 2026-10-11: $0.10 an hour by the minute, $10 a GB of residential proxy, $3 a thousand solves.
    const result = normalizeAccessGrant({ tariffs: { steel: { perHourUsd: 0.1, maxSessionMs: 120_000, minBilledMs: 60_000, billingIncrementMs: 60_000, perGbUsd: 10, maxBytesPerCall: 20_000_000, perSolveUsd: 0.003, maxSolvesPerCall: 3 } } })
    expect(result.ok).toBe(true)
    const steel = (result as { grant: import('../src/accessGrant.js').AccessGrant }).grant.tariffs.steel!
    // Two minutes, 20 MB and three solves.
    expect(tariffCeilingUsd(steel)).toBeCloseTo(0.2 / 60 + 0.2 + 0.009, 9)
    // A 17 s session that moved 5 MB and solved once.
    expect(tariffCostUsd(steel, 17_000, { proxyBytes: 5_000_000, solves: 1 })).toBeCloseTo(0.1 / 60 + 0.05 + 0.003, 9)
    // A figure the provider did not report is priced at the ceiling's allowance for it, never at zero.
    expect(tariffCostUsd(steel, 17_000, { proxyBytes: null, solves: 0 })).toBeCloseTo(0.1 / 60 + 0.2, 9)
    expect(tariffCostUsd(steel, 17_000)).toBeCloseTo(0.1 / 60 + 0.2 + 0.009, 9)
    // More than allowed for costs what it did: the provider's proxy counts what the page's own count does not.
    expect(tariffCostUsd(steel, 17_000, { proxyBytes: 30_000_000, solves: 0 })).toBeCloseTo(0.1 / 60 + 0.3, 9)
    // A grant that buys the residential proxy or solving states their prices on every tariff it names (0 when the plan
    // includes them): a tariff without them would buy bandwidth with no ceiling and no record.
    const buying = (capabilities: string[], tariffs: Record<string, unknown>) => normalizeAccessGrant({ tier: 'enhanced', capabilities, budget: { perRunUsd: 1 }, attestation: ATTESTATION, tariffs })
    const timeOnly = { perHourUsd: 0.1, maxSessionMs: 120_000 }
    expect(buying(['vendor_remote_browser', 'vendor_residential_proxy'], { steel: timeOnly, browserbase: timeOnly })).toEqual({ ok: false, problems: [
      expect.objectContaining({ field: 'tariffs.steel.perGbUsd', reason: expect.stringContaining('vendor_residential_proxy') }),
      expect.objectContaining({ field: 'tariffs.browserbase.perGbUsd' }),
    ] })
    expect(buying(['vendor_remote_browser', 'vendor_captcha_solving'], { steel: timeOnly })).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'tariffs.steel.perSolveUsd' })] })
    expect(buying(['vendor_remote_browser', 'vendor_residential_proxy', 'vendor_captcha_solving'], { browserbase: { ...timeOnly, perGbUsd: 0, perSolveUsd: 0 } }).ok).toBe(true)
    expect(buying(['vendor_remote_browser'], { steel: timeOnly }).ok).toBe(true)
    // A tariff from before these prices (a saved one) prices as it did.
    expect(tariffCostUsd({ perCallUsd: 0.01, perHourUsd: 0, maxSessionMs: null, minBilledMs: 0, billingIncrementMs: 1 } as import('../src/accessGrant.js').VendorTariff, 5_000, { proxyBytes: 9, solves: 9 })).toBeCloseTo(0.01, 9)
  })

  it('takes a third-party CAPTCHA solver only with its vendor, its exit, and a per-solve price with a bound (ADR 0005, 2026-10-25)', () => {
    const solverGrant = (extra: Record<string, unknown>) => normalizeAccessGrant({ tier: 'enhanced', capabilities: ['installed_chrome', 'third_party_captcha_solver'], budget: { perRunUsd: 20 }, attestation: ATTESTATION, ...extra })
    const ok = solverGrant({ solver: { vendor: 'capsolver', egress: 'proxy' }, tariffs: { capsolver: { perSolveUsd: 0.003, maxSolvesPerCall: 2 } } })
    expect(ok.ok && ok.grant.solver).toEqual({ vendor: 'capsolver', egress: 'proxy' })
    expect(ok.ok && ok.grant.tariffs.capsolver).toMatchObject({ perSolveUsd: 0.003, maxSolvesPerCall: 2 })
    // Named without the solver, the run would not know its vendor or its exit.
    expect(solverGrant({ tariffs: { capsolver: { perSolveUsd: 0.003, maxSolvesPerCall: 2 } } })).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'solver' })] })
    // An unknown vendor or exit, or a field more.
    for (const solver of [{ vendor: 'other', egress: 'proxy' }, { vendor: 'capsolver', egress: 'rotate' }, { vendor: 'capsolver', egress: 'none', key: 'x' }]) {
      expect(solverGrant({ solver, tariffs: { capsolver: { perSolveUsd: 0.003, maxSolvesPerCall: 2 } } })).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'solver', kind: 'invalid' })] })
    }
    // No tariff, a zero price or no bound: the solver is never called with no price and no ceiling.
    expect(solverGrant({ solver: { vendor: 'capsolver', egress: 'none' } })).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'tariffs.capsolver' })] })
    expect(solverGrant({ solver: { vendor: 'capsolver', egress: 'none' }, tariffs: { capsolver: { perSolveUsd: 0, maxSolvesPerCall: 2 } } })).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'tariffs.capsolver' })] })
    expect(solverGrant({ solver: { vendor: 'capsolver', egress: 'none' }, tariffs: { capsolver: { perSolveUsd: 0.003 } } }).ok).toBe(false)
    // A solver on a grant that does not name the capability is a mistake, said so.
    const stray = normalizeAccessGrant({ tier: 'enhanced', capabilities: ['installed_chrome'], attestation: ATTESTATION, solver: { vendor: 'capsolver', egress: 'none' } })
    expect(stray).toEqual({ ok: false, problems: [expect.objectContaining({ field: 'solver', reason: expect.stringContaining('third_party_captcha_solver') })] })
    // Without a run budget it is refused like every capability that spends a third party's money.
    expect(normalizeAccessGrant({ tier: 'enhanced', capabilities: ['third_party_captcha_solver'], attestation: ATTESTATION, solver: { vendor: 'capsolver', egress: 'none' }, tariffs: { capsolver: { perSolveUsd: 0.003, maxSolvesPerCall: 1 } } }))
      .toEqual({ ok: false, problems: [expect.objectContaining({ field: 'budget.perRunUsd', kind: 'budget_required' })] })
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

  it('takes installed_chrome as an enhanced, attested capability with no budget (ADR 0005, 2026-10-13)', () => {
    expect(normalizeAccessGrant({ tier: 'standard', capabilities: ['installed_chrome'], attestation: ATTESTATION }))
      .toEqual({ ok: false, problems: [expect.objectContaining({ field: 'capabilities.installed_chrome', kind: 'tier_too_low' })] })
    expect(normalizeAccessGrant({ tier: 'enhanced', capabilities: ['installed_chrome'] }))
      .toEqual({ ok: false, problems: [expect.objectContaining({ field: 'attestation', kind: 'attestation_required' })] })
    const ok = normalizeAccessGrant({ tier: 'enhanced', capabilities: ['installed_chrome'], attestation: ATTESTATION })
    expect(ok.ok && ok.grant.capabilities).toEqual(['installed_chrome'])
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
