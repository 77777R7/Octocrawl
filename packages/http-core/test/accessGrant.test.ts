import { describe, expect, it } from 'vitest'
import { normalizeAccessGrant } from '../src/accessGrant.js'

const ATTESTATION = { principal: 'tester', at: '2026-10-05T00:00:00Z', statement: 'I accept these routes.' }

describe('normalizeAccessGrant', () => {
  it('defaults to a standard grant that names nothing', () => {
    expect(normalizeAccessGrant({})).toEqual({
      ok: true,
      grant: { tier: 'standard', capabilities: [], budget: { perRequestUsd: null, perRunUsd: null }, scope: { hosts: null }, attestation: null },
    })
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
