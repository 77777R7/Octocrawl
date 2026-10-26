// The hosted parity board's measurement (ROADMAP current phase, stage H item 1): the pure parts of
// research/hosted/parity-window.mjs, kept apart so they can be tested (packages/mcp/test/hostedParityWindow.test.ts).
//
// Every arm is an MCP endpoint called the way an agent calls it: `scrape` with the task's own request and its contract
// cut to the check types the endpoint's tools/list offers (hosted lists no regular-expression check, ADR 0006). Every
// answer is judged by all of the task's predicates on the result the agent receives (research/access/judge.mjs), so a
// contract an endpoint cannot take changes what it is asked, never how it is judged.

import { isData, judge } from '../access/judge.mjs'

/** Hosted's MCP scrape deadline (packages/mcp/src/hostedApi.ts HOSTED_MCP_SCRAPE_TIMEOUT_MS). */
export const HOSTED_CAP_MS = 100_000
/** Ports this machine's other services and measurements use (CLAUDE.local.md and the coordinator's list). */
export const RESERVED_PORTS = new Set([8787, 8791, 8799, 8812, 8813, 8814, 8841, 8842, 8843, 8844, 8861, 8862, 8863, 8864, 8865, 8866])

/** The verify check types an endpoint's scrape tool lists in its tools/list answer; none when it lists no verify. */
export function listedCheckTypes(tools) {
  const scrape = (tools ?? []).find((tool) => tool?.name === 'scrape')
  const types = scrape?.inputSchema?.properties?.verify?.properties?.checks?.items?.properties?.type?.enum
  return Array.isArray(types) ? types.filter((type) => typeof type === 'string') : []
}

/** A task's contract as an agent on an endpoint can send it: its predicates of a listed type; undefined when none is left. */
export function contractFor(predicates, listed) {
  const checks = predicates.filter((p) => listed.includes(p.type))
  return checks.length === 0 ? undefined : { checks }
}

/** Every order of the arms, the given one first. */
function orders(arms) {
  if (arms.length <= 1) return [[...arms]]
  return arms.flatMap((arm, i) => orders([...arms.slice(0, i), ...arms.slice(i + 1)]).map((rest) => [arm, ...rest]))
}
/**
 * The arms in the order the task at `index` calls them: each of their orders in turn, so every arm goes first, and comes
 * before each other arm, as often as the others. Two local arms leave from the same address seconds apart, so the one
 * that comes second meets a site that has just seen it; no arm may always be that one.
 */
export function armOrder(arms, index) {
  const all = orders(arms)
  return all[index % all.length]
}

/** A tools/call answer as judge() reads it: the result's JSON, or the tool error's code and first line. */
export function documentOf(result) {
  const text = (result?.content ?? []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n')
  if (result?.isError === true) {
    const code = result?._meta?.['octocrawl/error']?.code ?? /^([a-z_]+):/.exec(text)?.[1] ?? 'error'
    return { doc: null, toolError: { code, message: text.split('\n')[0].slice(0, 300) } }
  }
  if (result?.structuredContent !== null && typeof result?.structuredContent === 'object') return { doc: result.structuredContent, toolError: null }
  try { return { doc: JSON.parse(text), toolError: null } } catch { return { doc: null, toolError: { code: 'unreadable_result', message: text.slice(0, 300) } } }
}

/**
 * What robots.txt did to the requested URL, from the Evidence Record: `refused` (a disallow the server obeyed, as hosted
 * always does), `overridden` (a disallow set aside, as a local server does for a URL the request names), else null.
 */
export function robotsOf(doc) {
  const robots = doc?.evidenceRecord?.robotsDecision
  if (robots?.decision !== 'disallowed') return null
  if (robots.userOverride === true || typeof robots.overrideBasis === 'string') return 'overridden'
  return doc.status === 'success' || doc.status === 'partial' ? null : 'refused'
}

/** One answer judged by every predicate of its task, as run-set.mjs judges one. */
export function verdictOf(task, doc) {
  const results = doc === null ? [] : task.predicates.map((p) => ({ p, pass: (() => { try { return judge(p, doc) } catch { return false } })() }))
  const answered = doc !== null && (doc.status === 'success' || doc.status === 'partial')
  return {
    verified: answered && results.length > 0 && results.every((r) => r.pass),
    falseSuccess: doc?.status === 'success' && results.some((r) => isData(r.p) && !r.pass),
    failedPredicates: results.filter((r) => !r.pass).map((r) => r.p.type),
  }
}

/** run-set.mjs's percentile: the value at floor(q × n) of the sorted values, rounded; null for none. */
export const pct = (xs, q) => { if (xs.length === 0) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) }

const tally = (values) => Object.fromEntries([...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())].sort(([a], [b]) => String(a).localeCompare(String(b))))

/**
 * An arm's figures. Every planned attempt counts in the denominator, an attempt not run (a credit cap, an early stop)
 * as not verified. Credits are the hosted arm's, inferred per answer; null when any answer's are unknown. `overCap`
 * counts the answers that took at least hosted's 100 s, or failed with a timeout.
 */
export function armSummary(rows, arm) {
  const mine = rows.filter((r) => r.arm === arm)
  const ran = mine.filter((r) => r.notRun === undefined)
  const walls = ran.map((r) => r.wallMs)
  const verified = ran.filter((r) => r.verified)
  const credits = ran.map((r) => r.credits)
  return {
    arm,
    planned: mine.length,
    attempted: ran.length,
    notRun: mine.length - ran.length,
    verified: verified.length,
    falseSuccess: ran.filter((r) => r.falseSuccess).length,
    p50Ms: pct(walls, 0.5),
    p95Ms: pct(walls, 0.95),
    verifiedP50Ms: pct(verified.map((r) => r.wallMs), 0.5),
    credits: credits.some((c) => c === null || c === undefined) ? null : credits.reduce((a, b) => a + b, 0),
    toolErrors: tally(ran.flatMap((r) => (r.toolError === null ? [] : [r.toolError.code]))),
    reasons: tally(ran.flatMap((r) => (r.toolError === null && r.status !== 'success' && r.status !== 'partial' ? [r.reason ?? r.status ?? 'none'] : []))),
    robotsRefused: ran.filter((r) => r.robots === 'refused').map((r) => r.taskId),
    robotsOverridden: ran.filter((r) => r.robots === 'overridden').map((r) => r.taskId),
    overCap: ran.filter((r) => r.wallMs >= HOSTED_CAP_MS || r.reason === 'timeout').length,
    truncated: ran.filter((r) => r.truncated === true).length,
  }
}

/** The figures as the record's table shows them; unknown stays unknown. */
export function summaryTable(summaries) {
  const cell = (v) => (v === null || v === undefined ? 'unknown' : String(v))
  const counts = (o) => (Object.keys(o).length === 0 ? 'none' : Object.entries(o).map(([k, n]) => `${k} ${n}`).join(', '))
  return [
    '| Arm | Verified | False successes | Not run | p50 ms | p95 ms | p50 verified ms | Credits (inferred) | ≥ 100 s or timeout | Tool errors | Other non-answers | robots.txt refused | robots.txt set aside |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map((s) => `| ${s.arm} | ${s.verified} / ${s.planned} | ${s.falseSuccess} | ${s.notRun} | ${cell(s.p50Ms)} | ${cell(s.p95Ms)} | ${cell(s.verifiedP50Ms)} | ${s.arm === 'hosted' ? cell(s.credits) : 'n/a'} | ${s.overCap} | ${counts(s.toolErrors)} | ${counts(s.reasons)} | ${s.robotsRefused.length === 0 ? 'none' : s.robotsRefused.join(', ')} | ${s.robotsOverridden.length === 0 ? 'none' : s.robotsOverridden.join(', ')} |`),
  ]
}

/** Whether the machine may run a window: on AC power with the lid open (pmset -g batt; ioreg's AppleClamshellState). */
export function powerState(pmsetText, ioregText) {
  const ac = /'AC Power'/.test(pmsetText)
  const lid = /"AppleClamshellState"\s*=\s*(Yes|No)/.exec(ioregText ?? '')?.[1]
  return { ac, lidOpen: lid === undefined ? null : lid === 'No' }
}

/**
 * Runs the window: each task through every arm in armOrder's order, one call at a time. `call(arm, task)` returns
 * { result, wallMs } or { error, wallMs }; `canRun(arm, rows)` may hold an arm back (the hosted credit cap), which leaves
 * the attempt in the denominator as not run. `charge(arm, doc)` is the credits an answer cost, null when unknown.
 */
export async function runWindow({ tasks, arms, call, canRun = () => null, charge = () => null, onRow = () => {} }) {
  const rows = []
  for (const [index, task] of tasks.entries()) {
    for (const arm of armOrder(arms, index)) {
      const held = canRun(arm, rows)
      if (held !== null) { const row = { taskId: task.id, arm, notRun: held, verified: false, falseSuccess: false }; rows.push(row); await onRow(row, null); continue }
      const answer = await call(arm, task)
      const { doc, toolError } = answer.error === undefined ? documentOf(answer.result) : { doc: null, toolError: { code: 'call_failed', message: String(answer.error).slice(0, 300) } }
      const verdict = verdictOf(task, doc)
      const row = {
        taskId: task.id, arm, wallMs: answer.wallMs,
        status: doc?.status ?? null, reason: doc?.failureReason ?? doc?.blockReason ?? null, lane: doc?.lane ?? null,
        verification: typeof doc?.verification?.status === 'string' ? doc.verification.status : null,
        readiness: typeof doc?.readiness?.state === 'string' ? doc.readiness.state : null,
        truncated: doc?.truncated === true, robots: robotsOf(doc), toolError,
        // A call that failed on the way, or an answer that could not be read, may still have been charged; a refusal was not.
        credits: toolError === null ? charge(arm, doc) : toolError.code === 'call_failed' || toolError.code === 'unreadable_result' ? null : 0,
        ...verdict,
      }
      rows.push(row)
      await onRow(row, doc)
    }
  }
  return rows
}
