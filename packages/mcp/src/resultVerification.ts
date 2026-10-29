import { createHash } from 'node:crypto'
import { undecidedCheck, type EvidenceVerification, type Readiness, type Verification, type VerifyContract } from '@w2l/contracts'
import { RegexLedger, RegexPool, verify } from '@w2l/runtime'

type Json = Record<string, unknown>
const object = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Verdicts cannot serve as evidence for themselves, including a previous API/cache verdict. */
function dataOf(value: Json): Json {
  const { verification: _verification, readiness: _readiness, evidenceRecord: _record, ...data } = value
  return data
}

function evidence(verification: Verification): EvidenceVerification {
  return verification.status === 'not_requested'
    ? { status: 'not_requested', verifier: null, contractSha256: null, reason: null, failed: [], undecided: [] }
    : { status: verification.status, verifier: verification.verifier, contractSha256: verification.contractSha256, reason: verification.reason, failed: verification.checks.filter(check => check.passed === false).map(check => check.type), undecided: verification.checks.filter(undecidedCheck).map(check => check.type) }
}

/** How long the regular-expression checks of one result's shortened versions may run together (ADR 0006, amendment of 2026-10-29). */
export const REGEX_PROJECTION_POOL_MS = 1_000

/** A result's projection: `deliver` judges the version that goes out, on a regular-expression pool of its own. */
export type ResultProjection = ((projection: Json) => Json) & { deliver: (projection: Json) => Json }

/**
 * Recheck a minimized result or each candidate prefix inside the budget calculation. The checks of every candidate (and
 * of the result before any cut) share one ledger and REGEX_PROJECTION_POOL_MS; the version delivered is judged again
 * by `deliver`, on a pool of its own, replaying what the ledger's scans found at their cost, so its verdict does not
 * depend on how many candidates the search tried. The one exception is the budget's (results.ts withinBudget): a
 * version whose fresh sentences no longer fit the budget its cut fitted keeps the verdict it was cut with.
 */
export function resultProjection(original: Json, contract?: VerifyContract, basis = 'mcp_result_truncated'): ResultProjection {
  let before: Verification | undefined
  const previous = original.verification as Verification | undefined
  const priorReadiness = object(original.readiness) ? original.readiness as unknown as Readiness : undefined
  const ledger = new RegexLedger()
  const probes = new RegexPool(REGEX_PROJECTION_POOL_MS, `this result's ${REGEX_PROJECTION_POOL_MS} ms for regular expressions on its shortened versions was spent`)
  const build = (projection: Json, pool: RegexPool | undefined): Json => {
    if (contract !== undefined) before ??= verify(contract, dataOf(original), { regex: ledger, regexPool: probes })
    let verification = previous
    if (contract !== undefined) verification = verify(contract, dataOf(projection), { regex: ledger, ...(pool === undefined ? {} : { regexPool: pool }) })
    else if (previous !== undefined && previous.status !== 'not_requested' && (previous.reason === null || previous.reason === 'checks_failed')) {
      // A stored crawl/batch page does not carry the original contract. Do not invent it from check summaries.
      verification = { ...previous, status: 'failed', reason: 'checks_failed', checks: previous.checks.map(({ observedCount: _count, limit: _limit, limitMs: _limitMs, ...check }) => ({ ...check, passed: null, observed: 'not rechecked after MCP shortened this page: the original contract is unavailable' })) }
    }
    let readiness = priorReadiness
    if (verification?.status === 'passed') readiness = { ...priorReadiness, state: 'ready', basis: ['verified'] }
    else if (verification?.status === 'failed') {
      // Preserve an existing access/loading/source failure. A previously passing check lost delivery here.
      if (before?.status === 'passed' || priorReadiness?.state === 'ready' || priorReadiness === undefined) {
        // A check stopped at its limit with none failed decided nothing (ADR 0006, amendment of 2026-10-29).
        const undecided = verification.checks.some(undecidedCheck) && !verification.checks.some(check => check.passed === false)
        readiness = { ...priorReadiness, state: 'not_extracted', basis: [undecided ? 'checks_undecided' : 'checks_failed', basis] }
      }
    }
    const record = original.evidenceRecord
    return {
      ...projection,
      ...(verification === undefined ? {} : { verification }),
      ...(readiness === undefined ? {} : { readiness }),
      ...(object(record) ? { evidenceRecord: {
        ...record,
        ...(object(record.outputSha256) ? { outputSha256: { ...record.outputSha256, markdown: typeof projection.markdown === 'string' ? createHash('sha256').update(projection.markdown).digest('hex') : null } } : {}),
        ...(verification === undefined ? {} : { verification: evidence(verification) }),
        ...(readiness === undefined ? {} : { readiness: { state: readiness.state, basis: readiness.basis } }),
      } } : {}),
    }
  }
  const project = ((projection: Json) => build(projection, probes)) as ResultProjection
  project.deliver = (projection: Json) => build(projection, undefined)
  return project
}
