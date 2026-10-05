import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeAccessGrant } from '../src/accessGrant.js'
import {
  AUTHORIZABLE,
  AUTHORIZABLE_POLICY_KEYS,
  DEFAULT_VENDOR_POLICY,
  DEFERRED,
  evaluateAccessCapability,
  evaluateVendorPolicy,
  OPERATIONAL_POLICY_KEYS,
  REFUSED_FOREVER,
  VENDOR_CAPABILITY_ACCESS,
  type CapabilityOffer,
} from '../src/vendor.js'

const FOREVER_NAMES = REFUSED_FOREVER.map((e) => e.capability)
const DEFERRED_NAMES = DEFERRED.map((e) => e.capability)
const AUTHORIZABLE_NAMES = AUTHORIZABLE.map((e) => e.capability)
const EVERY_NAME: readonly string[] = [...FOREVER_NAMES, ...DEFERRED_NAMES, ...AUTHORIZABLE_NAMES]

/** An enhanced grant that names everything, with the budget and attestation it would need. */
function grantNaming(capabilities: readonly string[]): unknown {
  return {
    tier: 'enhanced',
    capabilities,
    budget: { perRequestUsd: 0.05, perRunUsd: 5 },
    attestation: { principal: 'tester', at: '2026-10-05T00:00:00Z', statement: 'I accept these routes.' },
  }
}

/** ROADMAP.md's Paused table, as [first cell, last cell] per row. */
function pausedRows(): Map<string, string> {
  const text = readFileSync(new URL('../../../ROADMAP.md', import.meta.url), 'utf8')
  const section = text.split('\n## Paused\n')[1]!.split('\n## ')[0]!
  const rows = new Map<string, string>()
  for (const line of section.split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| ---') || line.startsWith('| Paused |')) continue
    const cells = line.slice(2, -2).split(' | ')
    rows.set(cells[0]!, cells[cells.length - 1]!)
  }
  return rows
}

describe('ADR 0005: the three capability classes', () => {
  it('names exactly the capabilities ADR 0005 lists, in three disjoint classes', () => {
    expect(FOREVER_NAMES).toEqual(['identity_rotation', 'patch_user_chrome', 'in_session_route_switch', 'secrets_in_records'])
    expect(DEFERRED_NAMES).toEqual([
      'own_browser_engine', 'own_fingerprint_patches', 'own_captcha_model', 'own_residential_network', 'camoufox', 'hosted_browser_cluster',
    ])
    expect(AUTHORIZABLE_NAMES).toEqual([
      'compatible_transport', 'egress_sessions', 'enhanced_browser',
      'vendor_remote_browser', 'vendor_unlock_html', 'vendor_captcha_solving', 'vendor_stealth',
      'third_party_captcha_solver',
    ])
    expect(new Set(EVERY_NAME).size).toBe(EVERY_NAME.length)
  })

  it.each(FOREVER_NAMES)('never enables %s, under any input', (name) => {
    for (const granted of [[], [name], EVERY_NAME]) {
      expect(evaluateAccessCapability(name, granted).decision).toBe('refused')
    }
    const decision = evaluateVendorPolicy(OFFERS, { authorized: [...EVERY_NAME, ...OPERATIONAL_POLICY_KEYS] })
    expect(decision.declined).toContainEqual(expect.objectContaining({ capability: name, decision: 'refused' }))
    const grant = normalizeAccessGrant(grantNaming([name]))
    expect(grant).toEqual({ ok: false, problems: [expect.objectContaining({ field: `capabilities.${name}`, kind: 'refused' })] })
  })

  it.each(DEFERRED_NAMES)('returns %s as deferred, with the ROADMAP row that restarts it', (name) => {
    const entry = DEFERRED.find((e) => e.capability === name)!
    for (const granted of [[], [name], EVERY_NAME]) {
      const verdict = evaluateAccessCapability(name, granted)
      expect(verdict).toMatchObject({ decision: 'deferred', source: entry.source, restartWhen: entry.restartWhen })
      expect(verdict.decision).not.toBe('refused')
    }
    expect(entry.source).toMatch(/^ROADMAP\.md:\d+$/)
    // The restart condition is ROADMAP's own words: if the Paused row is
    // renamed or its condition changes, this entry must follow it.
    expect(pausedRows().get(entry.row)).toBe(entry.restartWhen)
    const grant = normalizeAccessGrant(grantNaming([name]))
    expect(grant).toEqual({
      ok: false,
      problems: [expect.objectContaining({ kind: 'deferred', source: entry.source, restartWhen: entry.restartWhen })],
    })
  })

  it.each(AUTHORIZABLE_NAMES)('enables %s only when a grant names it', (name) => {
    expect(evaluateAccessCapability(name, []).decision).toBe('not_granted')
    expect(evaluateAccessCapability(name, EVERY_NAME.filter((n) => n !== name)).decision).toBe('not_granted')
    expect(evaluateAccessCapability(name, [name]).decision).toBe('granted')
    const grant = normalizeAccessGrant(grantNaming([name]))
    expect(grant.ok && grant.grant.capabilities).toEqual([name])
  })

  it('maps every grant-gated vendor capability into a class', () => {
    for (const access of Object.values(VENDOR_CAPABILITY_ACCESS)) {
      expect(EVERY_NAME).toContain(access)
    }
    expect(evaluateAccessCapability('captcha_solving').decision).toBe('unknown')
  })
})

const OFFERS: readonly CapabilityOffer[] = [
  { capability: 'headless_browser', vendorDefaultOn: true, enableKey: null },
  { capability: 'datacenter_proxy', vendorDefaultOn: true, enableKey: null },
  { capability: 'session_persistence', vendorDefaultOn: false, enableKey: 'session_persistence' },
  { capability: 'live_view_handoff', vendorDefaultOn: true, enableKey: 'live_view_handoff' },
  { capability: 'captcha_solving', vendorDefaultOn: true, enableKey: 'captcha_solving' },
  { capability: 'fingerprint_spoofing', vendorDefaultOn: true, enableKey: 'fingerprint_spoofing' },
]

describe('evaluateVendorPolicy — capability vs policy split', () => {
  it('default policy enables route capabilities only, withholds the grant-gated ones', () => {
    const d = evaluateVendorPolicy(OFFERS, DEFAULT_VENDOR_POLICY)
    expect(d.enabled.map((c) => c.capability)).toEqual(['headless_browser', 'datacenter_proxy'])
    expect(d.withheld).toEqual(['captcha_solving', 'fingerprint_spoofing'])
    // The permanent refusals are reported even though nothing asked for them:
    // the audit trail must be able to say what the product declines.
    expect(d.refused).toEqual(FOREVER_NAMES)
  })

  it('carries the vendor-default flag through so adapters can opt out explicitly', () => {
    const d = evaluateVendorPolicy(OFFERS, DEFAULT_VENDOR_POLICY)
    const headless = d.enabled.find((c) => c.capability === 'headless_browser')!
    // Browserbase/Steel run a real browser by default; nothing to opt out of,
    // so no wire-side switch is needed. The optOutRequired flag only matters
    // for capabilities where the vendor default is ON and we decline (see the
    // refused list — those never reach `enabled` at all).
    expect(headless.capability).toBe('headless_browser')
    expect(headless.enableKey).toBeNull()
  })

  it('enables authorizable capabilities only when authorized', () => {
    const d = evaluateVendorPolicy(OFFERS, {
      authorized: ['session_persistence', 'live_view_handoff'],
    })
    expect(d.enabled.map((c) => c.capability)).toEqual([
      'headless_browser',
      'datacenter_proxy',
      'session_persistence',
      'live_view_handoff',
    ])
    const live = d.enabled.find((c) => c.capability === 'live_view_handoff')!
    // Steel/Browserbase both default live-view doors on; enabling it means
    // the adapter may leave the door open, but the manifest still says so.
    expect(live.optOutRequired).toBe(true)
  })

  it('turns a grant-gated capability on only with its access capability, whatever the adapter declared', () => {
    // The old key is not a grant: it names no ADR 0005 capability.
    const old = evaluateVendorPolicy(OFFERS, { authorized: ['captcha_solving'] })
    expect(old.enabled.map((c) => c.capability)).not.toContain('captcha_solving')
    expect(old.declined).toEqual([expect.objectContaining({ capability: 'captcha_solving', decision: 'unknown' })])

    // An adapter declaring no switch at all cannot make it always-on.
    const sneaky: CapabilityOffer[] = [{ capability: 'captcha_solving', vendorDefaultOn: true, enableKey: null }]
    expect(evaluateVendorPolicy(sneaky).withheld).toEqual(['captcha_solving'])

    const d = evaluateVendorPolicy(OFFERS, { authorized: ['vendor_captcha_solving', 'vendor_stealth'] })
    expect(d.enabled.filter((c) => c.enableKey !== null && c.enableKey.startsWith('vendor_'))).toEqual([
      { capability: 'captcha_solving', enableKey: 'vendor_captcha_solving', optOutRequired: true },
      { capability: 'fingerprint_spoofing', enableKey: 'vendor_stealth', optOutRequired: true },
    ])
    expect(d.withheld).toEqual([])
  })

  it('withholds identity rotation from a vendor under any grant', () => {
    const offers: CapabilityOffer[] = [{ capability: 'identity_rotation', vendorDefaultOn: true, enableKey: 'identity_rotation' }]
    const d = evaluateVendorPolicy(offers, { authorized: [...EVERY_NAME] })
    expect(d.enabled).toEqual([])
    expect(d.withheld).toEqual(['identity_rotation'])
  })

  it('reports authorized keys the vendor does not offer', () => {
    const d = evaluateVendorPolicy(
      OFFERS.filter((o) => o.capability !== 'live_view_handoff'),
      { authorized: ['live_view_handoff'] },
    )
    expect(d.unauthorized).toEqual(['live_view_handoff'])
  })

  it('the authorizable surface is the four operational keys plus ADR 0005 class 3', () => {
    expect([...AUTHORIZABLE_POLICY_KEYS]).toEqual([
      'session_persistence',
      'live_view_handoff',
      'residential_proxy',
      'retry_orchestration',
      ...AUTHORIZABLE_NAMES,
    ])
  })

  it('is a pure function of its inputs', () => {
    const a = evaluateVendorPolicy(OFFERS, { authorized: ['session_persistence'] })
    const b = evaluateVendorPolicy(OFFERS, { authorized: ['session_persistence'] })
    expect(a).toEqual(b)
  })
})
