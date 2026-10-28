import { describe, expect, it } from 'vitest'
// k1-window.mjs's A/B arms on an older engine, its block order and its window cap on Steel spend (research/access/k1Arms.mjs).
import { BASE_ARMS, baseOf, rotated, steelCapAllows, withBaseArms } from '../../../research/access/k1Arms.mjs'
import type { LocalArm } from '../../../research/access/k1Arms.mjs'

const local = (port: number, env: Record<string, string>, grantFile: string | null): LocalArm => ({ port, cwd: '/repo', commit: 'new', access: '"enhanced"', env, grant: null, grantFile })
const arms = {
  standard: { ...local(8821, {}, null), access: '"standard"' },
  installed_chrome: local(8822, { W2L_ACCESS_GRANT: 'ic.json' }, 'ic.json'),
  combined: local(8823, { W2L_ACCESS_GRANT: 'combined.json', W2L_VENDORS: 'steel', STEEL_API_KEY: 'k' }, 'combined.json'),
  ic_compat: local(8824, { W2L_ACCESS_GRANT: 'ic-compat.json' }, 'ic-compat.json'),
}

describe('k1-window arms', () => {
  it('names the arm each base arm copies, and no other', () => {
    expect(BASE_ARMS.map(baseOf)).toEqual(['installed_chrome', 'combined', 'ic_compat'])
    for (const name of ['standard', 'installed_chrome', 'combined', 'control', 'enhanced_base', 'firecrawl']) expect(baseOf(name)).toBeNull()
  })

  it('runs a base arm with its arm\'s grant, environment and access, from the base checkout on its own port', () => {
    const ports: Record<string, number> = { installed_chrome_base: 8841, combined_base: 8842, ic_compat_base: 8843 }
    const table = withBaseArms(arms, { dir: '/base', commit: 'old' }, (name) => ports[name]!)
    expect(table.installed_chrome_base).toEqual({ ...arms.installed_chrome, port: 8841, cwd: '/base', commit: 'old' })
    expect(table.combined_base).toEqual({ ...arms.combined, port: 8842, cwd: '/base', commit: 'old' })
    expect(table.ic_compat_base).toEqual({ ...arms.ic_compat, port: 8843, cwd: '/base', commit: 'old' })
    // The arms of this checkout are unchanged, and without --base the table is the same object.
    expect(table.combined).toBe(arms.combined)
    expect(withBaseArms(arms, null, () => 0)).toBe(arms)
  })

  it('puts each base arm before its new arm in half the blocks when the four are listed base, base, new, new', () => {
    const list = ['installed_chrome_base', 'combined_base', 'installed_chrome', 'combined']
    // Listed new, new, base, base, block b runs each pair in the other order than the base-first list does.
    const reversed = ['installed_chrome', 'combined', 'installed_chrome_base', 'combined_base']
    for (const b of [0, 1, 2, 3]) for (const name of ['installed_chrome', 'combined']) {
      const ahead = (order: string[]) => order.indexOf(`${name}_base`) < order.indexOf(name)
      expect(ahead(rotated(reversed, b))).toBe(!ahead(rotated(list, b)))
    }
    const orders = [0, 1, 2, 3].map((b) => rotated(list, b))
    expect(orders[0]).toEqual(list)
    expect(orders[1]).toEqual(['combined_base', 'installed_chrome', 'combined', 'installed_chrome_base'])
    // Each arm takes each place once.
    for (const name of list) expect(new Set(orders.map((o) => o.indexOf(name))).size).toBe(4)
    for (const name of ['installed_chrome', 'combined']) {
      const baseFirst = orders.filter((o) => o.indexOf(`${name}_base`) < o.indexOf(name)).length
      expect(baseFirst).toBe(2)
    }
  })

  it('holds a Steel run back when the window\'s charges and its pages at the ceiling would pass the cap', () => {
    const ceiling = 0.1 * 120_000 / 3_600_000
    expect(steelCapAllows({ charged: [], pages: 23, capUsd: 1, pageCeilingUsd: ceiling })).toMatchObject({ ok: true, spentUsd: 0 })
    // A page the ledger did not report counts at the ceiling, not at 0.
    const unknown = steelCapAllows({ charged: [0.001, null, undefined], pages: 1, capUsd: 1, pageCeilingUsd: ceiling })
    expect(unknown.spentUsd).toBeCloseTo(0.001 + 2 * ceiling, 10)
    expect(unknown.worstUsd).toBeCloseTo(0.001 + 3 * ceiling, 10)
    expect(steelCapAllows({ charged: [0.95], pages: 23, capUsd: 1, pageCeilingUsd: ceiling }).ok).toBe(false)
    expect(steelCapAllows({ charged: [0.9], pages: 29, capUsd: 1, pageCeilingUsd: ceiling }).ok).toBe(true)
    expect(steelCapAllows({ charged: [0.9], pages: 31, capUsd: 1, pageCeilingUsd: ceiling }).ok).toBe(false)
    // With no ceiling the charge of a page is unbounded: nothing starts.
    expect(steelCapAllows({ charged: [], pages: 1, capUsd: 1, pageCeilingUsd: null })).toEqual({ ok: false, spentUsd: null, worstUsd: null })
  })
})
