// The CAPTCHA and DataDome measurement's per-arm, per-challenge-type numbers (research/access/captcha-tasks.v1.json,
// research/access/captcha-window.mjs), pure so that packages/runtime/test/captchaReport.test.ts can test them.
//
// A solver's calls are read from the answer's Evidence Record, access.paidCalls[] (ADR 0005): every call whose provider
// is one of the solver providers (SOLVER_PROVIDERS, or the window's --solver-providers); `paidCalls: null` (no grant)
// is none. Per call:
//   attempted   its `solveAttempts` when it reports one, else 1: a call to the solver is one solve attempted.
//   succeeded   its `solves` (what the solver reported solved); null when it reports none: unknown, never 0.
//   reported $  its `reportedCostUsd`, else `costUsd`: the solver's own figure. null when neither: unknown. The spend
//               ledger's `chargedUsd` (the grant's tariff, an estimate) is kept apart and never stands in for it.
//   solve ms    its `solveMs`, else `durationMs`; null when neither.
// A sum is null when any part of it is null. An answer whose record says nothing of paid calls has solver null (unknown).

export const SOLVER_PROVIDERS = ['capsolver']

const firstNumber = (c, names) => { for (const n of names) if (typeof c?.[n] === 'number') return c[n]; return null }
const sumOrNull = (xs) => (xs.some((x) => x === null) ? null : xs.reduce((a, b) => a + b, 0))

/** The solver's part of one answer: its calls, solves attempted and succeeded, reported and charged USD, solve time; null when unknown. */
export function solverOf(doc, providers = SOLVER_PROVIDERS) {
  const access = doc?.evidenceRecord?.access
  // As run-set.mjs's paidCallsOf: a record that carries the key lists every paid call (null: none could be made, no grant).
  if (access === undefined || access === null || !('paidCalls' in access)) return null
  const calls = (access.paidCalls ?? []).filter((c) => providers.includes(c?.provider))
  // A paid call that names the solver capability under a provider not on the list: its figures are not known here, not 0.
  const unlisted = (access.paidCalls ?? []).some((c) => !providers.includes(c?.provider) && [c?.capability, ...(Array.isArray(c?.capabilities) ? c.capabilities : [])].includes('third_party_captcha_solver'))
  if (unlisted) return { calls: null, attempted: null, succeeded: null, reportedUsd: null, chargedUsd: null, solveMs: null }
  return {
    calls: calls.length,
    attempted: calls.reduce((a, c) => a + (firstNumber(c, ['solveAttempts']) ?? 1), 0),
    succeeded: sumOrNull(calls.map((c) => firstNumber(c, ['solves']))),
    reportedUsd: sumOrNull(calls.map((c) => firstNumber(c, ['reportedCostUsd', 'costUsd']))),
    chargedUsd: sumOrNull(calls.map((c) => firstNumber(c, ['chargedUsd']))),
    solveMs: sumOrNull(calls.map((c) => firstNumber(c, ['solveMs', 'durationMs']))),
  }
}

/** The arm a solver arm adds the solver to (`combined+solver` → `combined`), or null for an arm without one. */
export const baseArmOf = (arm) => (arm.endsWith('+solver') ? arm.slice(0, -'+solver'.length) : null)

const median = (xs) => { if (xs.length === 0) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }

/**
 * One arm's cells by challenge type, over the frozen tasks. `rows` are the arm's cold attempts (run-set.mjs rows, at most one
 * per task: the first); `baseRows` the same of its base arm, for the time a solve added. A task with no row is not run.
 * An arm that was never started passes rows null: every task is not run.
 */
export function armCells(tasks, rows, baseRows = null) {
  const byTask = new Map()
  for (const r of rows ?? []) if (r.temperature === 'cold' && !byTask.has(r.taskId)) byTask.set(r.taskId, r)
  const base = new Map()
  for (const r of baseRows ?? []) if (r.temperature === 'cold' && !base.has(r.taskId)) base.set(r.taskId, r)
  const types = [...new Set(tasks.map(typeOf))]
  const cell = (ts) => {
    const made = ts.map((t) => byTask.get(t.id)).filter((r) => r !== undefined)
    const solver = made.map((r) => r.observed?.solver ?? null)
    // An unknown solver (null, or a call it could not attribute) makes every solver figure of the cell unknown.
    const unknownSolver = solver.some((s) => s === null || s.attempted === null)
    const tried = unknownSolver ? [] : made.filter((r) => r.observed.solver.attempted > 0)
    const succeeded = unknownSolver ? null : sumOrNull(solver.filter((s) => s.attempted > 0).map((s) => s.succeeded))
    const reportedUsd = unknownSolver ? null : sumOrNull(solver.filter((s) => s.calls > 0).map((s) => s.reportedUsd))
    const paired = tried.filter((r) => base.has(r.taskId)).map((r) => r.outcome.wallMs - base.get(r.taskId).outcome.wallMs)
    return {
      planned: ts.length,
      attempted: made.length,
      notRun: ts.filter((t) => !byTask.has(t.id)).map((t) => t.id),
      verified: made.filter((r) => r.outcome.verified).length,
      falseSuccess: made.filter((r) => r.outcome.falseSuccess).length,
      // Unknown when any attempt's record says nothing of paid calls.
      solvesAttempted: unknownSolver ? null : solver.reduce((a, s) => a + s.attempted, 0),
      solvesSucceeded: unknownSolver ? null : succeeded,
      reportedUsd: unknownSolver ? null : reportedUsd,
      usdPerSolve: unknownSolver || reportedUsd === null || succeeded === null || succeeded === 0 ? null : reportedUsd / succeeded,
      chargedUsd: sumOrNull(made.map((r) => (typeof r.outcome.chargedUsd === 'number' ? r.outcome.chargedUsd : null))),
      solveMs: unknownSolver ? null : sumOrNull(tried.map((r) => r.observed.solver.solveMs)),
      pairedAddedMs: unknownSolver ? { n: null, median: null } : { n: paired.length, median: median(paired) },
    }
  }
  return { all: cell(tasks), byType: Object.fromEntries(types.map((ty) => [ty, cell(tasks.filter((t) => typeOf(t) === ty))])) }
}

/** A task's challenge type for the breakdown: its frozen primaryType, else unknown. */
export const typeOf = (t) => t.challenge?.primaryType ?? 'unknown'

const fmt = (v) => (v === null || v === undefined ? 'unknown' : String(v))
const usd = (v) => (v === null ? 'unknown' : `$${v.toFixed(4)}`)

/** The record's table: one line per arm and challenge type (plus each arm's total), unknown where a value was not measured. */
export function cellsTable(arms) {
  const head = ['| Arm | Challenge type | Planned | Attempted | Not run | Verified | False success | Solves attempted | Solves succeeded | Solver-reported USD | USD per solve | Charged by ledger | Solve ms (reported) | Added wall ms vs base arm (median, n) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
  // A cell with no attempt has no solves or cost to report: n/a, not 0.
  const line = (arm, type, c) => `| ${arm} | ${type} | ${c.planned} | ${c.attempted} | ${c.notRun.length} | ${c.verified} | ${c.falseSuccess} | ${c.attempted === 0 ? 'n/a | n/a | n/a | n/a | n/a | n/a' : `${fmt(c.solvesAttempted)} | ${fmt(c.solvesSucceeded)} | ${c.reportedUsd === null ? 'unknown' : usd(c.reportedUsd)} | ${c.usdPerSolve === null ? (c.solvesSucceeded === 0 ? 'n/a' : 'unknown') : usd(c.usdPerSolve)} | ${c.chargedUsd === null ? 'unknown' : usd(c.chargedUsd)} | ${fmt(c.solveMs)}`} | ${c.pairedAddedMs.n === null ? 'unknown' : c.pairedAddedMs.n === 0 ? 'n/a' : `${c.pairedAddedMs.median} (${c.pairedAddedMs.n})`} |`
  return [...head, ...arms.flatMap(({ arm, cells }) => [line(arm, '**all**', cells.all), ...Object.entries(cells.byType).map(([ty, c]) => line(arm, ty, c))])]
}

/** SHA-256 input of the frozen manifest: the tasks array as JSON.stringify writes it, in file order. */
export const manifestText = (taskFile) => JSON.stringify(taskFile.tasks)
