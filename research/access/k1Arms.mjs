// The parts of k1-window.mjs's local arms that need no machine to decide, kept apart so they can be tested
// (packages/runtime/test/k1Arms.test.ts): the arms that run an older engine for an A/B (--base), the order a block runs
// the arms in, and the window's cap on Steel spend (--steel-cap).

/** An `<arm>_base` arm is `<arm>` run by the API of the --base checkout: the same grant, environment and access, its engine. */
export const BASE_ARMS = ['installed_chrome_base', 'combined_base', 'ic_compat_base']
const SUFFIX = '_base'

/** The arm an `<arm>_base` arm copies; null for any other name. */
export function baseOf(name) {
  return BASE_ARMS.includes(name) ? name.slice(0, -SUFFIX.length) : null
}

/**
 * The local arms in the order block `b` runs them: the list rotated by b (a Latin square). Two arms d places apart in
 * the list swap order in d of every n blocks, so with four arms listed `a_base, b_base, a, b` each base arm runs before
 * its new arm in two blocks of four and after it in the other two.
 */
export function rotated(local, b) {
  return local.map((_, i) => local[(i + b) % local.length])
}

/** The arm table with each `<arm>_base` arm added: its `<arm>`'s settings, on its own port, from `base.dir` at `base.commit`. */
export function withBaseArms(arms, base, portOf) {
  if (base === null) return arms
  return { ...arms, ...Object.fromEntries(BASE_ARMS.map((name) => [name, { ...arms[baseOf(name)], port: portOf(name), cwd: base.dir, commit: base.commit }])) }
}

/**
 * Whether a run of `pages` may start under the window's Steel cap: what the ledger charged the window's earlier pages,
 * each page it did not report counted at the ceiling, plus `pages` at the ceiling, stays within `capUsd`. The ceiling
 * is the most one page can be charged (k1-window.mjs: one Steel call a page at the tariff's price ceiling); null refuses.
 */
export function steelCapAllows({ charged, pages, capUsd, pageCeilingUsd }) {
  if (pageCeilingUsd === null) return { ok: false, spentUsd: null, worstUsd: null }
  const spentUsd = charged.reduce((sum, usd) => sum + (typeof usd === 'number' ? usd : pageCeilingUsd), 0)
  const worstUsd = spentUsd + pages * pageCeilingUsd
  return { ok: worstUsd <= capUsd, spentUsd, worstUsd }
}
