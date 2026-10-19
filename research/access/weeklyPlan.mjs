// The weekly rerun's plan and record header (research/access/weekly.mjs), pure so that
// packages/runtime/test/weeklyPlan.test.ts can test them: the ISO week, the rotation of the frozen tasks that are not in
// the challenge subset, the 51-task set, the Chrome major comparison, the installed_chrome acceptance baseline and the
// summary's gap figures.

/** ISO-8601 week of a date: the week with that year's first Thursday is week 1, Monday first. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7) }
}

/** The rotation groups: the ids in file order, cut into groups of `size` (the last one takes the rest: 36 → 10/10/10/6). */
export function rotationGroups(ids, size = 10, count = 4) {
  const groups = []
  for (let i = 0; i < count; i++) groups.push(i === count - 1 ? ids.slice(i * size) : ids.slice(i * size, (i + 1) * size))
  return groups
}

/** The group a date falls in: its ISO week number modulo the group count; nothing is stored between weeks. */
export const rotationGroupOf = (date, count = 4) => isoWeek(date).week % count

/**
 * The weekly set for a date: the healthy part, the challenge subset (file order) and the week's rotation group of the
 * frozen tasks that are not in the subset (file order). `all` is the union, in that order; the healthy and rotation
 * parts are run with `standard`, the challenge part with `enhanced`.
 */
export function weeklySet(taskFile, subsets, date) {
  const challengeIds = subsets.subsets.challenge16.tasks
  const known = new Set(taskFile.tasks.map((t) => t.id))
  const missing = challengeIds.filter((id) => !known.has(id))
  if (missing.length > 0) throw new Error(`subsets.v1.json names tasks not in tasks.v1.json: ${missing.join(', ')}`)
  const inSubset = new Set(challengeIds)
  const healthy = taskFile.tasks.filter((t) => t.part === 'healthy').map((t) => t.id)
  const challenge = taskFile.tasks.filter((t) => inSubset.has(t.id)).map((t) => t.id)
  const rotationPool = taskFile.tasks.filter((t) => t.part === 'frozen' && !inSubset.has(t.id)).map((t) => t.id)
  const groups = rotationGroups(rotationPool)
  const group = rotationGroupOf(date)
  const rotation = groups[group]
  const { year, week } = isoWeek(date)
  return { isoYear: year, isoWeek: week, group, groupCount: groups.length, rotationPool: rotationPool.length, healthy, challenge, rotation, all: [...healthy, ...challenge, ...rotation] }
}

/** The major version of a Chrome version string ("Google Chrome 155.0.8059.80" → 155); null when none is in it. */
export function chromeMajor(version) {
  const m = /\b(\d+)\.\d+\.\d+\.\d+\b/.exec(version ?? '')
  return m === null ? null : Number(m[1])
}

/** The Chrome line of an earlier weekly record, as the header writes it; null when the text has none. */
export function chromeOfRecord(text) {
  const m = /^- Chrome: (.+?)(?: \(|$)/m.exec(text ?? '')
  return m === null ? null : m[1].trim()
}

/**
 * ADR 0005's installed_chrome acceptance on the 16 tasks (research/access/runs/2026-10-14-installed-chrome-acceptance-7b56397b.md):
 * the final commit's two runs verified 11 and 7, the Playwright-over-CDP probe's two runs 12 and 12. A week below the
 * lower accepted run is marked for a retest before the rung is recommended by default.
 */
export const IC16_BASELINE = Object.freeze({ final: [11, 7], probe: [12, 12], total: 16, floor: 7 })

/** The baseline line of the free arm's record for the 16 tasks: the comparison, and the mark when the week is below it. */
export function baselineLine(verified, baseline = IC16_BASELINE) {
  const against = `against the acceptance baseline (ADR 0005, 7b56397b: final runs ${baseline.final.join(' and ')} of ${baseline.total}, probe runs ${baseline.probe.join(' and ')})`
  if (verified === null) return `- installed_chrome on the 16 tasks: not run; ${against}: no comparison`
  const below = verified < baseline.floor
  return `- installed_chrome on the 16 tasks: ${verified} of ${baseline.total} verified ${against}: ${below ? `**below the lower accepted run (${baseline.floor}); stop the default recommendation, retest pending**` : verified < Math.max(...baseline.final) ? `at or above the lower accepted run (${baseline.floor}), below the higher (${Math.max(...baseline.final)})` : 'at or above both accepted runs'}`
}

/** The lines every weekly record starts with, after its title. */
export function weeklyHeaderLines({ date, commit, arm, set, chrome, previousChrome, chromeRerun }) {
  return [
    `- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm \`${arm}\`, week ${set.isoYear}-W${String(set.isoWeek).padStart(2, '0')}, run on ${date}`,
    `- Source commit: \`${commit}\``,
    `- Set: ${set.all.length} tasks = healthy ${set.healthy.length} + challenge16 ${set.challenge.length} (research/access/subsets.v1.json) + rotation ${set.rotation.length} (group ${set.group} of 0–${set.groupCount - 1}, ISO week ${set.isoWeek} mod ${set.groupCount}, of the ${set.rotationPool} frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)`,
    `- Rotation tasks this week: ${set.rotation.join(', ')}`,
    `- Chrome: ${chrome ?? 'unknown'}${previousChrome === undefined ? '' : ` (previous weekly record: ${previousChrome ?? 'none'}${chromeRerun ? '; major version changed, the 16 tasks were run twice' : ''})`}`,
  ]
}

/** The arms' figures as the summary record shows them; `gap` is the best competitor's verified count minus the arm's. */
export function summaryRows(arms) {
  const competitorBest = (part) => {
    const c = arms.filter((a) => a.competitor && a.totals !== null).map((a) => a.parts[part].verified)
    return c.length === 0 ? null : Math.max(...c)
  }
  return arms.map((a) => ({
    arm: a.arm,
    status: a.totals === null ? `not_run${a.reason ? ` (${a.reason})` : ''}` : 'run',
    verified: a.totals?.verified ?? null,
    falseSuccess: a.totals?.falseSuccess ?? null,
    p50Ms: a.totals?.p50Ms ?? null,
    p95Ms: a.totals?.p95Ms ?? null,
    cost: a.cost,
    parts: a.parts,
    gap: a.competitor || a.totals === null ? null : Object.fromEntries(['all', 'healthy', 'challenge', 'rotation'].map((p) => { const best = competitorBest(p); return [p, best === null ? null : best - a.parts[p].verified] })),
  }))
}
