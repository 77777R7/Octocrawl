// The access task runner's denominator and record header (research/access/run-set.mjs), pure so that
// packages/runtime/test/runSetReport.test.ts can test them: the early stop, planned / attempted / not run, the Grant line
// and each attempt's channels.

import { createHash } from 'node:crypto'

// Three attempts in a row that the egress proxy itself refused stop the run: a spent plan or a dead proxy would
// otherwise write every later task down as the site's failure (2026-10-14, Webshare's 402 bandwidthlimit).
export const PROXY_REFUSED_STOP = 3

/** Every attempt the run means to make, in order: each task at each temperature. */
export const plannedAttempts = (tasks, temperatures) => tasks.flatMap((t) => temperatures.map((temperature) => ({ taskId: t.id, temperature })))

/** How many of the last attempts in a row the egress proxy refused and did not verify. */
export function proxyRefusedInARow(rows) {
  let n = 0
  for (let i = rows.length - 1; i >= 0 && rows[i].observed.proxyRefused && !rows[i].outcome.verified; i--) n++
  return n
}

/** Why the run stops after these attempts, or null while it goes on. */
export function stopReason(rows, plannedCount, limit = PROXY_REFUSED_STOP) {
  if (proxyRefusedInARow(rows) < limit) return null
  return `the egress proxy refused ${limit} attempts in a row (last ${rows.at(-1).taskId}); the run stopped after ${rows.length} of ${plannedCount} attempts`
}

/** The run's denominator: the attempts planned, those made, and each one not made by its task and temperature. */
export function denominator(planned, rows) {
  const made = new Set(rows.map((r) => `${r.taskId}\u0000${r.temperature}`))
  return { planned: planned.length, attempted: rows.length, notRun: planned.filter((p) => !made.has(`${p.taskId}\u0000${p.temperature}`)) }
}

const notRunName = (p) => (p.temperature === 'cold' ? p.taskId : `${p.taskId} ${p.temperature}`)

/** The record's denominator line and, when the run stopped early, why; a count the run did not record is unknown. */
export function denominatorLines(den, stoppedEarly) {
  const n = (v) => (v === null ? 'unknown' : String(v))
  const notRun = den.notRun === null ? 'unknown' : `${den.notRun.length}${den.notRun.length === 0 ? '' : ` (${den.notRun.map(notRunName).join(', ')})`}`
  return [
    `- Denominator: planned ${n(den.planned)}, attempted ${den.attempted}, not run ${notRun}; an attempt not run counts as not verified`,
    ...(stoppedEarly ? [`- **Stopped early:** ${stoppedEarly}. The attempts not run stay in the denominator${den.notRun === null ? '; this run did not record which they were' : ', named on the line above'}.`] : []),
  ]
}

/** A grant's SHA-256 and capability names (null when it is not JSON with a capabilities list); null when no grant was given. */
export function grantOf(text) {
  if (text === undefined || text === null || text.trim() === '') return null
  let capabilities = null
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed?.capabilities) && parsed.capabilities.every((c) => typeof c === 'string')) capabilities = parsed.capabilities
  } catch {}
  return { sha256: createHash('sha256').update(text).digest('hex'), capabilities }
}

/** The record's Grant line: the grant's SHA-256 and capability names, nothing else of it (no budget, tariff or attestation). */
export function grantLine(grant) {
  if (grant === undefined) return '- Grant: not recorded (a run from before the grant line)'
  if (grant === null) return '- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)'
  return `- Grant: SHA-256 \`${grant.sha256}\`; capabilities: ${grant.capabilities === null ? 'unreadable' : grant.capabilities.length === 0 ? 'none' : grant.capabilities.join(', ')} (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)`
}

/** An attempt's channels: the rungs it tried, then those the ladder passed over with the rule; unknown when the answer named none. */
export function channelsCell(row) {
  const tried = row.observed.channelsTried
  const skips = Array.isArray(row.observed.ladderSkips) ? row.observed.ladderSkips : []
  const passed = skips.map((s) => `${s.channel ?? 'unknown'}${s.vendorId ? ` (${s.vendorId}, ${s.rule})` : ` (${s.rule})`}`)
  return `${Array.isArray(tried) ? tried.join(' → ') : 'unknown'}${passed.length === 0 ? '' : `; passed over: ${passed.join(', ')}`}`
}
