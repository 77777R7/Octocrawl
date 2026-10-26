// The CAPTCHA and DataDome measurement's per-arm, per-challenge-type numbers (research/access/captcha-tasks.v1.json,
// research/access/captcha-window.mjs), pure so that packages/runtime/test/captchaReport.test.ts can test them.
//
// A solver's work is read from the answer: its charged calls from the Evidence Record, access.paidCalls[] (ADR 0005),
// every call whose provider is one of the solver providers (SOLVER_PROVIDERS, or the window's --solver-providers;
// `paidCalls: null`, no grant, is none); its attempts from the `captcha_solve` trace events of every rung the ladder ran
// (the answer's trace and summary.attempts[].result.trace: the answer's own trace carries its last rung's alone). Per answer:
//   attempted   events with a solve number: a task asked of the solver, also one it refused before creating it (no paid
//               call is written for that one). Without any trace, the paid calls (each one's `solveAttempts`, else 1).
//   succeeded   events whose solver gave an answer (outcome cleared, still_gated or not_injected). Without a trace, the
//               paid calls' `solves` only when every call states `solveAttempts` too (#718: `solves` is then the answered
//               ones; before it, `solves` was 1 for a failed solve as well): else unknown.
//   cleared     events after which the page showed no gate (outcome cleared). Unknown without a trace.
//   reported $  each paid call's `reportedCostUsd`, else `costUsd`: the solver's own figure. null when neither: unknown. The
//               spend ledger's `chargedUsd` (the grant's tariff, an estimate) is kept apart and never stands in for it.
//   solve ms    the attempted events' `ms`; without a trace, each call's `solveMs`, else `durationMs`.
//   A listed paid call with no charged event (its rung was cut by its deadline and returned no trace) counts as attempted,
//   and makes succeeded, cleared and solve ms unknown.
//   skipped     the events without a solve, by `<type>:<reason>` (no adapter, no solver exit, the per-page limit).
// A sum is null when any part of it is null. An answer whose record says nothing of paid calls has solver null (unknown).

export const SOLVER_PROVIDERS = ['capsolver']

const firstNumber = (c, names) => { for (const n of names) if (typeof c?.[n] === 'number') return c[n]; return null }
const sumOrNull = (xs) => (xs.some((x) => x === null) ? null : xs.reduce((a, b) => a + b, 0))

const ANSWERED = ['cleared', 'still_gated', 'not_injected']

/** The answer's `captcha_solve` events of the listed vendors, over every rung's trace, each once; null when it carries no trace. */
function solveEventsOf(doc, providers) {
  const traces = [doc?.trace, ...(Array.isArray(doc?.summary?.attempts) ? doc.summary.attempts.map((a) => a?.result?.trace) : [])].filter(Array.isArray)
  if (traces.length === 0) return null
  const seen = new Map()
  for (const e of traces.flat()) {
    const d = e?.event === 'captcha_solve' ? e.detail : undefined
    if (d === undefined || !providers.includes(d?.vendor)) continue
    seen.set(JSON.stringify([d.rung, d.type, d.solve, d.outcome, d.ms, d.reason, d.call ?? null]), d)
  }
  return [...seen.values()]
}

/** The solver's part of one answer: its calls, solves attempted, answered and clearing, reported and charged USD, solve time; null when unknown. */
export function solverOf(doc, providers = SOLVER_PROVIDERS) {
  const access = doc?.evidenceRecord?.access
  // As run-set.mjs's paidCallsOf: a record that carries the key lists every paid call (null: none could be made, no grant).
  if (access === undefined || access === null || !('paidCalls' in access)) return null
  const calls = (access.paidCalls ?? []).filter((c) => providers.includes(c?.provider))
  // A paid call that names the solver capability under a provider not on the list: its figures are not known here, not 0.
  const unlisted = (access.paidCalls ?? []).some((c) => !providers.includes(c?.provider) && [c?.capability, ...(Array.isArray(c?.capabilities) ? c.capabilities : [])].includes('third_party_captcha_solver'))
  if (unlisted) return { calls: null, attempted: null, succeeded: null, cleared: null, reportedUsd: null, chargedUsd: null, solveMs: null, skipped: null }
  const events = solveEventsOf(doc, providers)
  const tried = events?.filter((d) => d.solve !== null && d.solve !== undefined) ?? null
  const skipped = {}
  for (const d of events ?? []) if (d.solve === null || d.solve === undefined) skipped[`${d.type}:${d.reason ?? d.outcome}`] = (skipped[`${d.type}:${d.reason ?? d.outcome}`] ?? 0) + 1
  const noTrace = calls.length === 0 ? 0 : null
  const answeredNoTrace = calls.length > 0 && calls.every((c) => typeof c?.solveAttempts === 'number') ? sumOrNull(calls.map((c) => firstNumber(c, ['solves']))) : noTrace
  // A charged solve whose event was lost (a rung cut by its deadline returns an empty trace, its solve still charged): it
  // was attempted, and what it got is unknown, never 0.
  const lost = tried === null ? 0 : Math.max(0, calls.length - tried.filter((d) => typeof d.chargedUsd === 'number').length)
  const known = (n) => (lost > 0 ? null : n)
  return {
    calls: calls.length,
    attempted: tried === null ? calls.reduce((a, c) => a + (firstNumber(c, ['solveAttempts']) ?? 1), 0) : tried.length + lost,
    succeeded: tried === null ? answeredNoTrace : known(tried.filter((d) => ANSWERED.includes(d.outcome)).length),
    cleared: tried === null ? noTrace : known(tried.filter((d) => d.outcome === 'cleared').length),
    reportedUsd: sumOrNull(calls.map((c) => firstNumber(c, ['reportedCostUsd', 'costUsd']))),
    chargedUsd: sumOrNull(calls.map((c) => firstNumber(c, ['chargedUsd']))),
    solveMs: tried === null ? sumOrNull(calls.map((c) => firstNumber(c, ['solveMs', 'durationMs']))) : known(tried.reduce((a, d) => a + (typeof d.ms === 'number' ? d.ms : 0), 0)),
    skipped: events === null ? null : skipped,
  }
}

/** The arm a solver arm adds the solver to (`combined+solver`, `installed_chrome+solver-none` → its base), or null for an arm without one. */
export const baseArmOf = (arm) => /^(.+)\+solver(?:-[a-z0-9]+)?$/.exec(arm)?.[1] ?? null

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
    const cleared = unknownSolver ? null : sumOrNull(solver.filter((s) => s.attempted > 0).map((s) => s.cleared ?? null))
    const skipped = {}
    for (const s of solver) for (const [k, n] of Object.entries(s?.skipped ?? {})) skipped[k] = (skipped[k] ?? 0) + n
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
      solvesCleared: cleared,
      // Tasks verified on a page a solve cleared: what solving itself gained (null when a clear is unknown).
      verifiedAfterClear: cleared === null ? null : made.filter((r) => r.outcome.verified && r.observed.solver.cleared > 0).length,
      skipped,
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
  const head = ['| Arm | Challenge type | Planned | Attempted | Not run | Verified | False success | Solves attempted | Solves the solver answered | Solves that cleared the page | Verified after a clear | Solver-reported USD | USD per solve | Charged by ledger | Solve ms (captcha_solve events) | Added wall ms vs base arm (median, n) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
  // A cell with no attempt has no solves or cost to report: n/a, not 0.
  const line = (arm, type, c) => `| ${arm} | ${type} | ${c.planned} | ${c.attempted} | ${c.notRun.length} | ${c.verified} | ${c.falseSuccess} | ${c.attempted === 0 ? 'n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a' : `${fmt(c.solvesAttempted)} | ${fmt(c.solvesSucceeded)} | ${fmt(c.solvesCleared)} | ${fmt(c.verifiedAfterClear)} | ${c.reportedUsd === null ? 'unknown' : usd(c.reportedUsd)} | ${c.usdPerSolve === null ? (c.solvesSucceeded === 0 ? 'n/a' : 'unknown') : usd(c.usdPerSolve)} | ${c.chargedUsd === null ? 'unknown' : usd(c.chargedUsd)} | ${fmt(c.solveMs)}`} | ${c.pairedAddedMs.n === null ? 'unknown' : c.pairedAddedMs.n === 0 ? 'n/a' : `${c.pairedAddedMs.median} (${c.pairedAddedMs.n})`} |`
  return [...head, ...arms.flatMap(({ arm, cells }) => [line(arm, '**all**', cells.all), ...Object.entries(cells.byType).map(([ty, c]) => line(arm, ty, c))])]
}

/** SHA-256 input of the frozen manifest: the tasks array as JSON.stringify writes it, in file order. */
export const manifestText = (taskFile) => JSON.stringify(taskFile.tasks)
