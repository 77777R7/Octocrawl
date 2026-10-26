/**
 * AccessGrant: what an operator or a user allows enhanced access to do for a
 * run (ADR 0005). This module validates a grant; it does not apply one.
 *
 * A server reads one at startup (`--access-grant` or `W2L_ACCESS_GRANT`, through
 * accessGrantFromText), as do the `octocrawl` commands and the ladder CLI; without
 * one every grant-gated capability stays off.
 *
 * The validation encodes three rules from ADR 0005:
 *  - a name from REFUSED_FOREVER or DEFERRED is a problem, reported with its
 *    reason (and, when deferred, the ROADMAP row that restarts it), never
 *    silently dropped;
 *  - `standard` and `my_browser` may name only the capabilities that add no
 *    third-party cost and no enhanced browser; `enhanced` may name any;
 *  - a capability that spends a third party's money needs a positive
 *    `perRunUsd`, and any `enhanced` capability needs an attestation saying
 *    who accepted it.
 *
 * Pure, zero dependencies, like the rest of http-core.
 */

import type { EvidenceAccessGrant } from '@w2l/contracts'
import type { AccessAttestationInput } from './access.js'
import { sha256Utf8 } from './hash.js'
import { AUTHORIZABLE, evaluateAccessCapability, type AuthorizableCapability } from './vendor.js'

export const ACCESS_TIERS = ['standard', 'enhanced', 'my_browser'] as const
export type AccessTier = (typeof ACCESS_TIERS)[number]

export interface AccessGrant {
  tier: AccessTier
  capabilities: readonly AuthorizableCapability[]
  /** Spend caps in US dollars; null is no cap. */
  budget: { perRequestUsd: number | null; perRunUsd: number | null }
  /** Hosts the grant covers; null covers every host the run may fetch. */
  scope: { hosts: readonly string[] | null }
  attestation: AccessAttestationInput | null
  /**
   * The prices the operator accepted for each provider (by vendor id), from which a call's price ceiling is computed
   * (ROADMAP PA item 4): a provider without one is not called. Empty: none.
   */
  tariffs: Readonly<Record<string, VendorTariff>>
  /**
   * ADR 0005 `third_party_captcha_solver` (revision of 2026-10-25): the solver's vendor, priced by `tariffs[vendor]`, and
   * the exit the run's rungs use. `egress: "proxy"`: every rung of every request the grant serves leaves through the
   * operator's sticky exit (W2L_SOLVER_PROXY) from its first request, and the challenges whose answer is bound to an exit
   * (DataDome, Cloudflare's challenge) are solved through that exit, which the solver is sent. `"none"`: the run's exit
   * stays as it is and only the challenges solved without an exit (Turnstile, reCAPTCHA v2) are. Null when the grant does
   * not name the capability (absent).
   */
  solver?: AccessGrantSolver | null
  /**
   * SHA-256 of the grant's text as it was read (accessGrantFromText), so a record names the grant its paid calls were
   * made under without copying it: `shasum -a 256 grant.json` gives the same digest. Absent on a grant built in code.
   */
  sha256?: string
}

export const SOLVER_VENDORS = ['capsolver'] as const
export const SOLVER_EGRESS = ['proxy', 'none'] as const
export interface AccessGrantSolver { vendor: (typeof SOLVER_VENDORS)[number]; egress: (typeof SOLVER_EGRESS)[number] }

/** What a record says of the grant a paid call was made under (ROADMAP PA item 4): its digest, tier and attestation time. */
export function accessGrantRef(grant: AccessGrant): EvidenceAccessGrant {
  return { sha256: grant.sha256 ?? null, tier: grant.tier, attestedAt: grant.attestation?.at ?? null }
}

/**
 * A provider's prices, as its pricing page states them, and the limits that make a call's cost bounded: a per-hour price
 * needs the longest session a call may hold (the vendor lane ends the call and its session there, and asks the provider
 * to end the session then too); `minBilledMs` is the shortest time the provider bills a session for. A per-GB price (a
 * provider's own residential proxy, under the `vendor_residential_proxy` grant) needs `maxBytesPerCall`, the most the
 * call's session may move: the vendor lane counts the bytes its page receives and ends the session there. A per-solve
 * price (the provider's built-in CAPTCHA solving) needs `maxSolvesPerCall`, the most solves the ceiling allows for;
 * the provider solves what appears, so a call that solved more is charged what it solved, above the ceiling, and the
 * record says so.
 */
export interface VendorTariff {
  perCallUsd: number
  perHourUsd: number
  maxSessionMs: number | null
  minBilledMs: number
  /** The step the provider bills time in (a minute, rounded up); 1: exact. */
  billingIncrementMs: number
  /** The provider's residential proxy price per gigabyte (1e9 bytes), as its pricing page states it; 0: none. */
  perGbUsd: number
  /** The most bytes one call's session may move through the provider's proxy; null with no per-GB price. */
  maxBytesPerCall: number | null
  /** The provider's price per CAPTCHA solve; 0: none. */
  perSolveUsd: number
  /** The solves one call's ceiling allows for; null with no per-solve price. */
  maxSolvesPerCall: number | null
}

/** What a call's provider sessions used besides time, when the provider reports it: null is unknown, never zero. */
export interface VendorSessionUsage {
  /** Bytes moved through the provider's proxy, as the provider counts them. */
  proxyBytes: number | null
  /** CAPTCHA solves the provider made in the session. */
  solves: number | null
}

/**
 * The most one call can cost under this tariff, in US dollars: its per-call price, its longest session (at least the
 * billed minimum and `floorMs`, the shortest session the provider can be told to end at) rounded up to the billing step,
 * the most bytes it may move at the per-GB price, and the solves allowed for at the per-solve price.
 */
export function tariffCeilingUsd(tariff: VendorTariff, floorMs = 0): number {
  return tariffCostUsd(tariff, Math.max(tariff.maxSessionMs ?? 0, tariff.maxSessionMs === null ? 0 : floorMs), { proxyBytes: null, solves: null })
}

/**
 * What one call whose session lasted `sessionMs` costs under this tariff, in US dollars: its per-call price, the
 * session's time (at least the billed minimum) rounded up to the billing step, and what the session used at the per-GB
 * and per-solve prices. A usage the provider did not report (null) is priced at the ceiling's allowance for it.
 */
export function tariffCostUsd(tariff: VendorTariff, sessionMs: number, usage: VendorSessionUsage = { proxyBytes: null, solves: null }): number {
  const step = tariff.billingIncrementMs > 0 ? tariff.billingIncrementMs : 1
  const billedMs = Math.ceil(Math.max(sessionMs, tariff.minBilledMs, 0) / step) * step
  // A tariff read before the per-GB and per-solve prices existed (a saved one, a test's literal) has neither: 0, not NaN.
  const bytes = usage.proxyBytes ?? tariff.maxBytesPerCall ?? 0
  const solves = usage.solves ?? tariff.maxSolvesPerCall ?? 0
  return tariff.perCallUsd + (tariff.perHourUsd * billedMs) / 3_600_000 + ((tariff.perGbUsd ?? 0) * Math.max(bytes, 0)) / 1e9 + (tariff.perSolveUsd ?? 0) * Math.max(solves, 0)
}

const TARIFF_PRICES = ['perCallUsd', 'perHourUsd', 'perGbUsd', 'perSolveUsd'] as const
const TARIFF_LIMITS = ['maxSessionMs', 'minBilledMs', 'billingIncrementMs', 'maxBytesPerCall', 'maxSolvesPerCall'] as const

/** One provider's tariff from its JSON, or the problems with it. */
function readTariff(vendor: string, input: unknown, problems: AccessGrantProblem[]): VendorTariff | null {
  const field = `tariffs.${vendor}`
  if (!isRecord(input)) { problems.push({ field, kind: 'invalid', reason: 'a tariff is an object of prices and limits' }); return null }
  const known = new Set<string>([...TARIFF_PRICES, ...TARIFF_LIMITS])
  for (const key of Object.keys(input)) if (!known.has(key)) problems.push({ field: `${field}.${key}`, kind: 'invalid', reason: `unknown tariff field; one of ${[...known].join(', ')}` })
  const price = (key: (typeof TARIFF_PRICES)[number]): number => {
    const v = input[key]
    if (v === undefined || v === null) return 0
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) { problems.push({ field: `${field}.${key}`, kind: 'invalid', reason: 'a non-negative number of US dollars' }); return 0 }
    return v
  }
  const limit = (key: (typeof TARIFF_LIMITS)[number]): number | null => {
    const v = input[key]
    if (v === undefined || v === null) return null
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) { problems.push({ field: `${field}.${key}`, kind: 'invalid', reason: 'a positive whole number' }); return null }
    return v
  }
  const tariff: VendorTariff = {
    perCallUsd: price('perCallUsd'), perHourUsd: price('perHourUsd'), maxSessionMs: limit('maxSessionMs'), minBilledMs: limit('minBilledMs') ?? 0, billingIncrementMs: limit('billingIncrementMs') ?? 1,
    perGbUsd: price('perGbUsd'), maxBytesPerCall: limit('maxBytesPerCall'), perSolveUsd: price('perSolveUsd'), maxSolvesPerCall: limit('maxSolvesPerCall'),
  }
  if (TARIFF_PRICES.every((key) => input[key] === undefined || input[key] === null)) problems.push({ field, kind: 'invalid', reason: 'a tariff names at least one price: perCallUsd, perHourUsd, perGbUsd or perSolveUsd' })
  if (tariff.perHourUsd > 0 && tariff.maxSessionMs === null) problems.push({ field: `${field}.maxSessionMs`, kind: 'invalid', reason: 'a per-hour price needs the longest session a call may hold, or its cost has no ceiling' })
  if (tariff.perGbUsd > 0 && tariff.maxBytesPerCall === null) problems.push({ field: `${field}.maxBytesPerCall`, kind: 'invalid', reason: 'a per-GB price (the provider\'s proxy bandwidth) needs the most bytes one call may move, or its cost has no ceiling; the vendor lane ends the session there' })
  if (tariff.perSolveUsd > 0 && tariff.maxSolvesPerCall === null) problems.push({ field: `${field}.maxSolvesPerCall`, kind: 'invalid', reason: 'a per-solve price needs the solves one call\'s ceiling allows for' })
  return tariff
}

export type AccessGrantProblemKind =
  | 'invalid'
  | 'refused'
  | 'deferred'
  | 'unknown_capability'
  | 'tier_too_low'
  | 'budget_required'
  | 'attestation_required'

export interface AccessGrantProblem {
  field: string
  kind: AccessGrantProblemKind
  reason: string
  /** For `deferred`: the ROADMAP row the restart condition comes from. */
  source?: string
  restartWhen?: string
}

export type AccessGrantResult =
  | { ok: true; grant: AccessGrant }
  | { ok: false; problems: readonly AccessGrantProblem[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A budget in US dollars: positive, or absent. Zero is refused: a cap reached before anything is spent would stop every run at once. */
function usd(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}

/** Validate a grant. Every problem is reported, not just the first. */
export function normalizeAccessGrant(input: unknown): AccessGrantResult {
  if (!isRecord(input)) {
    return { ok: false, problems: [{ field: 'grant', kind: 'invalid', reason: 'a grant is a JSON object' }] }
  }
  const problems: AccessGrantProblem[] = []

  const tier = input.tier ?? 'standard'
  if (!(ACCESS_TIERS as readonly unknown[]).includes(tier)) {
    problems.push({ field: 'tier', kind: 'invalid', reason: `tier is one of ${ACCESS_TIERS.join(', ')}` })
  }

  const names = input.capabilities ?? []
  const capabilities: AuthorizableCapability[] = []
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) {
    problems.push({ field: 'capabilities', kind: 'invalid', reason: 'capabilities is a list of capability names' })
  } else {
    for (const name of new Set(names as string[])) {
      const field = `capabilities.${name}`
      const verdict = evaluateAccessCapability(name, [name])
      if (verdict.decision === 'refused') {
        problems.push({ field, kind: 'refused', reason: verdict.reason })
      } else if (verdict.decision === 'deferred') {
        problems.push({ field, kind: 'deferred', reason: verdict.reason, source: verdict.source, restartWhen: verdict.restartWhen })
      } else if (verdict.decision === 'unknown') {
        problems.push({ field, kind: 'unknown_capability', reason: verdict.reason })
      } else {
        const entry = AUTHORIZABLE.find((e) => e.capability === name)!
        if (entry.tier === 'enhanced' && tier !== 'enhanced') {
          problems.push({ field, kind: 'tier_too_low', reason: `${name} needs tier enhanced; ${String(tier)} adds no third-party cost and no enhanced browser` })
        }
        capabilities.push(entry.capability)
      }
    }
  }

  const budgetIn = input.budget ?? {}
  let perRequestUsd: number | null = null
  let perRunUsd: number | null = null
  if (!isRecord(budgetIn)) {
    problems.push({ field: 'budget', kind: 'invalid', reason: 'budget is an object with perRequestUsd and perRunUsd' })
  } else {
    const req = usd(budgetIn.perRequestUsd)
    const run = usd(budgetIn.perRunUsd)
    if (req === undefined) problems.push({ field: 'budget.perRequestUsd', kind: 'invalid', reason: 'a positive number of US dollars, or null' })
    if (run === undefined) problems.push({ field: 'budget.perRunUsd', kind: 'invalid', reason: 'a positive number of US dollars, or null' })
    perRequestUsd = req ?? null
    perRunUsd = run ?? null
  }
  const costed = capabilities.filter((c) => AUTHORIZABLE.find((e) => e.capability === c)!.thirdPartyCost)
  if (costed.length > 0 && perRunUsd === null && !problems.some((p) => p.field === 'budget.perRunUsd')) {
    problems.push({
      field: 'budget.perRunUsd',
      kind: 'budget_required',
      reason: `${costed.join(', ')} can spend a third party's money; a grant naming them needs a positive perRunUsd`,
    })
  }

  const scopeIn = input.scope ?? {}
  let hosts: readonly string[] | null = null
  if (!isRecord(scopeIn) || (scopeIn.hosts !== undefined && scopeIn.hosts !== null
    && (!Array.isArray(scopeIn.hosts) || scopeIn.hosts.some((h) => typeof h !== 'string' || h.length === 0)))) {
    problems.push({ field: 'scope.hosts', kind: 'invalid', reason: 'scope.hosts is a list of host names, or null' })
  } else if (Array.isArray(scopeIn.hosts)) {
    hosts = scopeIn.hosts as string[]
  }

  const att = input.attestation
  let attestation: AccessAttestationInput | null = null
  if (att !== undefined && att !== null) {
    if (!isRecord(att) || [att.principal, att.at, att.statement].some((v) => typeof v !== 'string' || v.trim().length === 0)) {
      problems.push({ field: 'attestation', kind: 'invalid', reason: 'attestation needs principal, at and statement' })
    } else {
      attestation = { principal: att.principal as string, at: att.at as string, statement: att.statement as string }
    }
  }
  const enhancedOnly = capabilities.filter((c) => AUTHORIZABLE.find((e) => e.capability === c)!.tier === 'enhanced')
  if (enhancedOnly.length > 0 && attestation === null && !problems.some((p) => p.field === 'attestation')) {
    problems.push({
      field: 'attestation',
      kind: 'attestation_required',
      reason: `${enhancedOnly.join(', ')} needs an attestation: who accepted it, when, and the statement they accepted`,
    })
  }

  const tariffsIn = input.tariffs ?? {}
  const tariffs: Record<string, VendorTariff> = {}
  if (!isRecord(tariffsIn)) {
    problems.push({ field: 'tariffs', kind: 'invalid', reason: 'tariffs is an object of provider ids to their prices' })
  } else {
    for (const [vendor, value] of Object.entries(tariffsIn)) {
      const tariff = readTariff(vendor, value, problems)
      if (tariff !== null) tariffs[vendor] = tariff
      // A capability the provider bills apart needs its price stated on every tariff the grant names: 0 when the plan
      // includes it, else the price and its bound. Left out, the session would buy it with no ceiling and no record.
      if (!isRecord(value)) continue
      for (const [capability, price] of [['vendor_residential_proxy', 'perGbUsd'], ['vendor_captcha_solving', 'perSolveUsd']] as const) {
        if (capabilities.includes(capability) && (value[price] === undefined || value[price] === null)) {
          problems.push({ field: `tariffs.${vendor}.${price}`, kind: 'invalid', reason: `a grant naming ${capability} states ${price} on every tariff: 0 when the plan includes it, else the provider's price and its bound` })
        }
      }
    }
  }

  // The solver (ADR 0005, revision of 2026-10-25): named with its capability, priced per solve with a bound on solves.
  let solver: AccessGrantSolver | null = null
  const solverIn = input.solver
  const solverNamed = capabilities.includes('third_party_captcha_solver')
  if (solverIn !== undefined && solverIn !== null) {
    if (!isRecord(solverIn) || !(SOLVER_VENDORS as readonly unknown[]).includes(solverIn.vendor) || !(SOLVER_EGRESS as readonly unknown[]).includes(solverIn.egress) || Object.keys(solverIn).some((key) => key !== 'vendor' && key !== 'egress')) {
      problems.push({ field: 'solver', kind: 'invalid', reason: `solver is { vendor: ${SOLVER_VENDORS.join(' | ')}, egress: ${SOLVER_EGRESS.join(' | ')} }` })
    } else if (!solverNamed) {
      problems.push({ field: 'solver', kind: 'invalid', reason: 'solver is only for a grant that names third_party_captcha_solver' })
    } else {
      solver = { vendor: solverIn.vendor as AccessGrantSolver['vendor'], egress: solverIn.egress as AccessGrantSolver['egress'] }
    }
  } else if (solverNamed) {
    problems.push({ field: 'solver', kind: 'invalid', reason: 'a grant naming third_party_captcha_solver names its solver: { vendor, egress }' })
  }
  if (solver !== null) {
    const tariff = tariffs[solver.vendor]
    if (tariff === undefined && !problems.some((p) => p.field.startsWith(`tariffs.${solver!.vendor}`))) {
      problems.push({ field: `tariffs.${solver.vendor}`, kind: 'invalid', reason: 'the solver is called only at a price: its tariff states perSolveUsd and maxSolvesPerCall' })
    } else if (tariff !== undefined && (tariff.perSolveUsd <= 0 || tariff.maxSolvesPerCall === null)) {
      problems.push({ field: `tariffs.${solver.vendor}`, kind: 'invalid', reason: 'the solver\'s tariff states a positive perSolveUsd and maxSolvesPerCall, the most solves one page may buy' })
    }
  }

  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, grant: { tier: tier as AccessTier, capabilities, budget: { perRequestUsd, perRunUsd }, scope: { hosts }, attestation, tariffs, ...(solver === null ? {} : { solver }) } }
}

/**
 * A grant from its JSON text, for a server or a CLI that reads one from a file or an environment
 * variable. Throws with every problem listed: a caller that silently dropped a refused or deferred
 * capability would run with less than the operator thinks.
 */
export function accessGrantFromText(text: string): AccessGrant {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('access grant: not valid JSON')
  }
  const result = normalizeAccessGrant(input)
  if (!result.ok) {
    throw new Error(`access grant refused (ADR 0005):\n${result.problems.map((p) => `  - ${p.field}: ${p.reason}`).join('\n')}`)
  }
  // Nothing limits the routes to these hosts yet; taking the list would grant more than it says.
  if (result.grant.scope.hosts !== null) {
    throw new Error('access grant refused: scope.hosts is not enforced yet, so a grant that names hosts would reach every host; leave scope out')
  }
  return { ...result.grant, sha256: sha256Utf8(text) }
}
