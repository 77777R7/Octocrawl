/**
 * Multi-vendor routing: which provider serves which domain, decided from
 * the domain's own history — success rate, latency, cost, and failure type.
 *
 * Not a black box. The score is four explicit terms, and each is printed in
 * the trace:
 *
 *   success  : contentful share of attempts (0 when no data)
 *   latency  : TRUE MEDIAN wall time across stored samples, inverted and
 *              normalized (0 when no data). Samples are kept per attempt —
 *              an average of outliers is not a statistic a router may
 *              decide on.
 *   cost     : cumulative reported vendor cost, inverted (0 when no data)
 *   explore  : a small flat bonus when the vendor has no history here yet,
 *              so a new vendor gets ONE chance to prove itself per domain
 *              rather than riding an unearned reputation from elsewhere.
 *
 * Failure attribution, stated once and implemented the same way in both the
 * ranking and the rotation:
 *   - EVERY non-contentful attempt lowers the vendor's success rate,
 *     including site-level blocks (bot_gate etc.). The site refused the
 *     vendor's request; "the vendor did not break" does not make the fetch
 *     successful.
 *   - ROTATION (startingVendor) reacts only to vendor-level failures
 *     (provider_error / identity_mismatch): the vendor broke, so the next
 *     attempt starts elsewhere. A site-level bot_gate does not rotate —
 *     switching vendors does not answer the site's refusal.
 */

import type { RoutingFailureClass } from '@w2l/http-core'
import { VENDOR_LEVEL_FAILURE_CLASS } from '@w2l/http-core'
import { readFile, writeFile, mkdir, chmod, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface VendorHistoryEntry {
  attempts: number
  contentful: number
  latencyTotalMs: number
  /** One sample per attempt, so the ranker can take a true median. */
  latencySamplesMs: number[]
  /** Sum over the attempts whose cost the vendor stated. */
  costTotalUsd: number
  /** Attempts whose cost the vendor did not state: unknown, never counted as free. */
  costUnknownAttempts: number
  lastFailureClass: RoutingFailureClass | null
  /** Each layer of the attempts' outcomes (PA G2a): an attempt with no observation is unknown on all three, never a no. */
  layers: Record<RouteLayer, LayerCount>
  /** Sum of what the spend ledger charged the attempts whose charge is known. */
  chargedTotalUsd: number
  /** Attempts with no settled charge on record: unknown, never counted as free. */
  chargedUnknownAttempts: number
  /** The most recent attempts' observations, oldest first, at most MAX_OBSERVATIONS. */
  observations: StoredRouteObservation[]
}

export type RouteLayer = 'accessDelivered' | 'regionLoaded' | 'taskVerified'

export interface LayerCount {
  yes: number
  no: number
  unknown: number
}

/**
 * Where an attempt stopped, the first layer that failed: the page was not delivered (`access`), its region never
 * loaded (`region`), it loaded but what was extracted failed the contract (`extraction`, ADR 0007 `not_extracted`, not
 * the vendor failing), or the page did not do the task (`task`). Null when nothing failed.
 */
export type RouteFailureStage = 'access' | 'region' | 'extraction' | 'task'

/** One attempt's time by stage, the stage names G4 measures. Null: not measured on this attempt, never zero. */
export interface RouteTimings {
  coldStartMs: number | null
  navigationMs: number | null
  challengeWaitMs: number | null
  regionWaitMs: number | null
  captureMs: number | null
  extractMs: number | null
  serializeMs: number | null
  cleanupMs: number | null
  /** The vendor's own session time, as its measured charge counted it. */
  sessionMs: number | null
  totalMs: number
}

/** What the attempt ran on, so a change of browser or egress can be told apart from a change of the site. */
export interface RouteEnvironment {
  /** Chrome major version of the rung's declared identity; null when it declares none. */
  browserMajor: number | null
  /** `vendor_residential` under a vendor_residential_proxy grant, else `vendor_default`; null when the grant is not known. */
  egressClass: string | null
  /** Short hash of the egress configuration (the grant's capabilities); null when the grant is not known. */
  egressConfigVersion: string | null
}

/** What one vendor attempt showed, layer by layer (PA G2a). Codes, counts and times only: no URL, cookie or credential. */
export interface RouteObservation {
  accessDelivered: boolean
  /** Null without a task contract, or when no live read judged the region. */
  regionLoaded: boolean | null
  /** Whether the page did the task: null without a contract, while unjudged, or when it was there but not extracted. */
  taskVerified: boolean | null
  failureStage: RouteFailureStage | null
  /** ADR 0007 readiness: `ready` for a page that passed its contract, the failure's state otherwise; null without a contract. */
  readiness: string | null
  /** The result's failure, block or budget code, else the contract's reason. */
  reason: string | null
  timings: RouteTimings
  environment: RouteEnvironment
  /** What the run's spend ledger charged this attempt's paid call; null when no charge was settled for it. */
  chargedUsd: number | null
  /** How the ledger priced it: the vendor's word, its measured session, or the ceiling. */
  chargeBasis: 'reported' | 'measured' | 'ceiling' | null
}

export interface StoredRouteObservation extends RouteObservation {
  observedAt: string
  wallMs: number
  /** The vendor's stated price; null when it stated none. */
  costUsd: number | null
  failureClass: RoutingFailureClass | null
}

export interface DomainHistory {
  vendors: Record<string, VendorHistoryEntry>
  /** Vendor last used for this domain, so the next attempt can start there. */
  lastVendor: string | null
}

/**
 * The route within a host a run's statistics belong to (PA G2b): the path or task family, the formats asked for, and the
 * extractor and verifier versions. Codes and templates only, never a URL. A store that keys by host alone ignores it.
 */
export interface RouteContext {
  /** `path:/<first segment if a short word, else *>` with `/*` for a deeper path, or `task:<contract hash>` for a request with a contract. */
  family: string
  /** The formats asked for, sorted, comma-joined. */
  formats: string
  /** `<extractor version>|<verifier version>`. */
  versions: string
  /** The site's template, when something identified it; a change expires the family's rows. */
  siteTemplate?: string | null
}

export interface RoutingHistory {
  read(domain: string, route?: RouteContext): Promise<DomainHistory>
  record(domain: string, vendorId: string, outcome: VendorOutcome, route?: RouteContext): Promise<void>
}

export interface VendorOutcome {
  contentful: boolean
  /**
   * Whether the page did the request's task (ADR 0006): null or absent without a task contract, or when it could not
   * be judged yet. When known it, not `contentful`, is what the vendor's success rate counts.
   */
  verified?: boolean | null
  wallMs: number
  /** Null when the vendor did not state the cost. */
  costUsd: number | null
  failureClass: RoutingFailureClass | null
  /** The attempt's layers, times, environment and charge; absent from callers that observed none. */
  observation?: RouteObservation
}

const ROUTE_LAYERS: readonly RouteLayer[] = ['accessDelivered', 'regionLoaded', 'taskVerified']

function freshLayers(unknown = 0): Record<RouteLayer, LayerCount> {
  return { accessDelivered: { yes: 0, no: 0, unknown }, regionLoaded: { yes: 0, no: 0, unknown }, taskVerified: { yes: 0, no: 0, unknown } }
}

/** Fresh history entry for a vendor a domain has never used. */
export function freshEntry(): VendorHistoryEntry {
  return {
    attempts: 0,
    contentful: 0,
    latencyTotalMs: 0,
    latencySamplesMs: [],
    costTotalUsd: 0,
    costUnknownAttempts: 0,
    lastFailureClass: null,
    layers: freshLayers(),
    chargedTotalUsd: 0,
    chargedUnknownAttempts: 0,
    observations: [],
  }
}

/** Upper bound on retained latency samples per vendor per domain. Older
 *  samples are dropped, not averaged — the ranking window is the most recent
 *  MAX_LATENCY_SAMPLES attempts. */
const MAX_LATENCY_SAMPLES = 200

/** Upper bound on retained observations per vendor per domain; the layer counts keep every attempt. */
const MAX_OBSERVATIONS = 50

/** Apply one outcome to an entry. Shared by both stores so their arithmetic
 *  cannot drift apart. */
export function applyOutcome(entry: VendorHistoryEntry, outcome: VendorOutcome): void {
  entry.attempts += 1
  if (outcome.verified ?? outcome.contentful) entry.contentful += 1
  entry.latencyTotalMs += outcome.wallMs
  entry.latencySamplesMs.push(outcome.wallMs)
  if (entry.latencySamplesMs.length > MAX_LATENCY_SAMPLES) {
    entry.latencySamplesMs = entry.latencySamplesMs.slice(-MAX_LATENCY_SAMPLES)
  }
  if (outcome.costUsd === null) entry.costUnknownAttempts += 1
  else entry.costTotalUsd += outcome.costUsd
  entry.lastFailureClass = outcome.failureClass
  const observed = outcome.observation
  for (const layer of ROUTE_LAYERS) {
    const value = observed?.[layer] ?? null
    entry.layers[layer][value === null ? 'unknown' : value ? 'yes' : 'no'] += 1
  }
  if (observed?.chargedUsd == null) entry.chargedUnknownAttempts += 1
  else entry.chargedTotalUsd += observed.chargedUsd
  if (observed !== undefined) {
    entry.observations.push({ ...observed, observedAt: new Date().toISOString(), wallMs: outcome.wallMs, costUsd: outcome.costUsd, failureClass: outcome.failureClass })
    if (entry.observations.length > MAX_OBSERVATIONS) entry.observations = entry.observations.slice(-MAX_OBSERVATIONS)
  }
}

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null)

/**
 * Layer counts read from disk; an entry written before G2a has every attempt unknown. A layer whose counts do not add up
 * to the attempts keeps its yes and no when they fit, the rest unknown; else all unknown.
 */
function normalizeLayers(raw: unknown, attempts: number): Record<RouteLayer, LayerCount> {
  const layers = freshLayers(attempts)
  if (typeof raw !== 'object' || raw === null) return layers
  for (const layer of ROUTE_LAYERS) {
    const stored = (raw as Record<string, Partial<LayerCount> | undefined>)[layer]
    const yes = count(stored?.yes) ?? 0
    const no = count(stored?.no) ?? 0
    if (yes + no <= attempts) layers[layer] = { yes, no, unknown: attempts - yes - no }
  }
  return layers
}

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const boolOrNull = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)
const codeOrNull = (value: unknown): string | null => (typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value) ? value : null)
const TIMING_KEYS = ['coldStartMs', 'navigationMs', 'challengeWaitMs', 'regionWaitMs', 'captureMs', 'extractMs', 'serializeMs', 'cleanupMs', 'sessionMs'] as const
const STAGES: readonly RouteFailureStage[] = ['access', 'region', 'extraction', 'task']
const BASES = ['reported', 'measured', 'ceiling'] as const

/** One observation read from disk, rebuilt from its known fields alone (nothing else a file holds is kept); null when it has no times. */
function normalizeObservation(raw: unknown): StoredRouteObservation | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const t = (typeof o.timings === 'object' && o.timings !== null ? o.timings : {}) as Record<string, unknown>
  const e = (typeof o.environment === 'object' && o.environment !== null ? o.environment : {}) as Record<string, unknown>
  const totalMs = finiteOrNull(t.totalMs)
  const wallMs = finiteOrNull(o.wallMs)
  const observedAt = typeof o.observedAt === 'string' && !Number.isNaN(Date.parse(o.observedAt)) ? new Date(o.observedAt).toISOString() : null
  if (totalMs === null || wallMs === null || observedAt === null || typeof o.accessDelivered !== 'boolean') return null
  const timings = { totalMs } as RouteTimings
  for (const key of TIMING_KEYS) timings[key] = finiteOrNull(t[key])
  const browserMajor = finiteOrNull(e.browserMajor)
  const egressConfigVersion = typeof e.egressConfigVersion === 'string' && /^[0-9a-f]{1,64}$/.test(e.egressConfigVersion) ? e.egressConfigVersion : null
  return {
    accessDelivered: o.accessDelivered,
    regionLoaded: boolOrNull(o.regionLoaded),
    taskVerified: boolOrNull(o.taskVerified),
    failureStage: STAGES.find((stage) => stage === o.failureStage) ?? null,
    readiness: codeOrNull(o.readiness),
    reason: codeOrNull(o.reason),
    timings,
    environment: { browserMajor: browserMajor === null ? null : Math.floor(browserMajor), egressClass: codeOrNull(e.egressClass), egressConfigVersion },
    chargedUsd: finiteOrNull(o.chargedUsd),
    chargeBasis: BASES.find((basis) => basis === o.chargeBasis) ?? null,
    observedAt,
    wallMs,
    costUsd: finiteOrNull(o.costUsd),
    failureClass: (codeOrNull(o.failureClass) as RoutingFailureClass | null),
  }
}

/**
 * Normalize one entry read from disk. Legacy JSON predates `latencySamplesMs`;
 * such files must keep working — the samples are reconstructed as the mean of
 * the stored totals, and the ranker gets the same shape it always expects.
 */
export function normalizeEntry(raw: Partial<VendorHistoryEntry> | undefined): VendorHistoryEntry | undefined {
  if (raw === undefined) return undefined
  const entry = freshEntry()
  entry.attempts =
    typeof raw.attempts === 'number' && Number.isFinite(raw.attempts) && raw.attempts >= 0
      ? Math.floor(raw.attempts)
      : 0
  entry.contentful =
    typeof raw.contentful === 'number' && Number.isFinite(raw.contentful) && raw.contentful >= 0
      ? Math.floor(raw.contentful)
      : 0
  entry.latencyTotalMs =
    typeof raw.latencyTotalMs === 'number' && Number.isFinite(raw.latencyTotalMs)
      ? raw.latencyTotalMs
      : 0
  entry.costTotalUsd =
    typeof raw.costTotalUsd === 'number' && Number.isFinite(raw.costTotalUsd)
      ? raw.costTotalUsd
      : 0
  entry.costUnknownAttempts =
    typeof raw.costUnknownAttempts === 'number' && Number.isFinite(raw.costUnknownAttempts) && raw.costUnknownAttempts >= 0
      ? Math.floor(raw.costUnknownAttempts)
      : 0
  entry.lastFailureClass = raw.lastFailureClass ?? null
  entry.layers = normalizeLayers(raw.layers, entry.attempts)
  // Before G2a no charge was recorded: every attempt's is unknown.
  const charged = typeof raw.chargedTotalUsd === 'number' && Number.isFinite(raw.chargedTotalUsd) ? raw.chargedTotalUsd : null
  entry.chargedTotalUsd = charged ?? 0
  const unknownCharges = count(raw.chargedUnknownAttempts)
  entry.chargedUnknownAttempts = charged === null || unknownCharges === null || unknownCharges > entry.attempts ? entry.attempts : unknownCharges
  entry.observations = Array.isArray(raw.observations)
    ? raw.observations.map(normalizeObservation).filter((o): o is StoredRouteObservation => o !== null).slice(-MAX_OBSERVATIONS)
    : []
  if (Array.isArray(raw.latencySamplesMs)) {
    entry.latencySamplesMs = raw.latencySamplesMs
      .filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s >= 0)
      .slice(-MAX_LATENCY_SAMPLES)
  } else if (entry.attempts > 0 && entry.latencyTotalMs > 0) {
    // Legacy: one mean per attempt is the only honest reconstruction. The
    // SAME cap as live recording applies — a reconstructed array must not
    // outgrow what applyOutcome would have kept.
    const mean = Math.round(entry.latencyTotalMs / entry.attempts)
    entry.latencySamplesMs = Array.from(
      { length: Math.min(entry.attempts, MAX_LATENCY_SAMPLES) },
      () => mean,
    )
  }
  return entry
}

/**
 * One entry over several (a host's routes read together, PA G2b), oldest first: counts and totals add up, samples and
 * observations keep the most recent ones, the last failure is the newest entry's.
 */
export function mergeEntries(entries: readonly VendorHistoryEntry[]): VendorHistoryEntry {
  const merged = freshEntry()
  for (const entry of entries) {
    merged.attempts += entry.attempts
    merged.contentful += entry.contentful
    merged.latencyTotalMs += entry.latencyTotalMs
    merged.latencySamplesMs.push(...entry.latencySamplesMs)
    merged.costTotalUsd += entry.costTotalUsd
    merged.costUnknownAttempts += entry.costUnknownAttempts
    merged.lastFailureClass = entry.lastFailureClass
    for (const layer of ROUTE_LAYERS) {
      for (const key of ['yes', 'no', 'unknown'] as const) merged.layers[layer][key] += entry.layers[layer][key]
    }
    merged.chargedTotalUsd += entry.chargedTotalUsd
    merged.chargedUnknownAttempts += entry.chargedUnknownAttempts
    merged.observations.push(...entry.observations)
  }
  merged.latencySamplesMs = merged.latencySamplesMs.slice(-MAX_LATENCY_SAMPLES)
  merged.observations = merged.observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt)).slice(-MAX_OBSERVATIONS)
  return merged
}

/** Normalize a whole domain history read from disk. */
function normalizeHistory(raw: unknown): DomainHistory {
  const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as {
    vendors?: Record<string, Partial<VendorHistoryEntry>>
    lastVendor?: string | null
  }
  const vendors: Record<string, VendorHistoryEntry> = {}
  for (const [id, entry] of Object.entries(parsed.vendors ?? {})) {
    const normalized = normalizeEntry(entry)
    if (normalized !== undefined) vendors[id] = normalized
  }
  return { vendors, lastVendor: typeof parsed.lastVendor === 'string' ? parsed.lastVendor : null }
}

export class MemoryRoutingHistory implements RoutingHistory {
  private readonly domains = new Map<string, DomainHistory>()

  async read(domain: string): Promise<DomainHistory> {
    return this.domains.get(domain) ?? { vendors: {}, lastVendor: null }
  }

  async record(domain: string, vendorId: string, outcome: VendorOutcome): Promise<void> {
    const history = this.domains.get(domain) ?? { vendors: {}, lastVendor: null }
    const entry = history.vendors[vendorId] ?? freshEntry()
    applyOutcome(entry, outcome)
    history.vendors[vendorId] = entry
    history.lastVendor = vendorId
    this.domains.set(domain, history)
  }
}

/** File-backed history. Statistics only — no credentials, no URLs beyond the
 *  domain key. 0600 because it is still operational data. */
export class FileRoutingHistory implements RoutingHistory {
  constructor(private readonly file: string) {}

  private async all(): Promise<Record<string, DomainHistory>> {
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const out: Record<string, DomainHistory> = {}
      for (const [domain, history] of Object.entries(parsed)) {
        out[domain] = normalizeHistory(history)
      }
      return out
    } catch {
      return {}
    }
  }

  private async persist(all: Record<string, DomainHistory>): Promise<void> {
    const tmp = `${this.file}.tmp`
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(tmp, JSON.stringify(all, null, 2), { mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, this.file)
  }

  async read(domain: string): Promise<DomainHistory> {
    const all = await this.all()
    return all[domain] ?? { vendors: {}, lastVendor: null }
  }

  async record(domain: string, vendorId: string, outcome: VendorOutcome): Promise<void> {
    const all = await this.all()
    const history = all[domain] ?? { vendors: {}, lastVendor: null }
    const entry = history.vendors[vendorId] ?? freshEntry()
    applyOutcome(entry, outcome)
    history.vendors[vendorId] = entry
    history.lastVendor = vendorId
    all[domain] = history
    await this.persist(all)
  }
}

export interface VendorScore {
  vendorId: string
  /** Higher is better. Deterministic; every term visible in the trace. */
  score: number
  successRate: number
  medianLatencyMs: number | null
  /** Over the attempts whose cost is known. */
  totalCostUsd: number
  /** Whether any attempt's cost is unknown; such a vendor earns no cost bonus. */
  costUnknown: boolean
}

const EXPLORE_BONUS = 0.05

/** Rank vendors for a domain. Ties in success break on latency, then cost. */
export function rankVendors(
  domainHistory: DomainHistory,
  vendorIds: readonly string[],
): readonly VendorScore[] {
  const scores: VendorScore[] = []
  for (const id of vendorIds) {
    const entry = domainHistory.vendors[id]
    if (entry === undefined || entry.attempts === 0) {
      scores.push({
        vendorId: id,
        score: EXPLORE_BONUS,
        successRate: 0,
        medianLatencyMs: null,
        totalCostUsd: 0,
        costUnknown: false,
      })
      continue
    }
    const successRate = entry.contentful / entry.attempts
    // True median over stored samples. `latencyTotalMs` remains for display
    // and volume; the ranker must not be moved by one pathological outlier.
    // Even sample counts take the mean of the two middle values — that IS
    // the median of an even-length sample.
    const samples = [...entry.latencySamplesMs].sort((a, b) => a - b)
    let mid = 0
    if (samples.length > 0) {
      const half = Math.floor(samples.length / 2)
      mid =
        samples.length % 2 === 0
          ? (samples[half - 1]! + samples[half]!) / 2
          : samples[half]!
    }
    const cost = entry.costTotalUsd
    // Cheapness earns a bonus only when every attempt's cost is known: an
    // unknown cost scored as zero would rank the vendor that hides its price first.
    const costUnknown = entry.costUnknownAttempts > 0
    const score = successRate + 0.3 / (1 + mid / 1_000) + (costUnknown ? 0 : 0.1 / (1 + cost / 0.1))
    scores.push({
      vendorId: id,
      score,
      successRate,
      medianLatencyMs: mid,
      totalCostUsd: cost,
      costUnknown,
    })
  }
  return scores.sort((a, b) => b.score - a.score)
}

/**
 * Pick the starting vendor for a domain.
 *   - normal request: the actual top of the ranking, `ranked[0]`;
 *   - provider failure: when the last attempt on this domain failed at the
 *     VENDOR level (provider_error / identity_mismatch), start from the next
 *     vendor down so one broken vendor does not eat every attempt.
 * A site-level block (bot_gate etc.) does NOT rotate — the site refused the
 * vendor; switching vendors does not answer the refusal.
 */
export function startingVendor(ranked: readonly VendorScore[], history: DomainHistory): string | null {
  if (ranked.length === 0) return null
  const last = history.lastVendor
  if (last !== null) {
    const lastEntry = history.vendors[last]
    if (
      lastEntry !== undefined &&
      lastEntry.lastFailureClass !== null &&
      VENDOR_LEVEL_FAILURE_CLASS.has(lastEntry.lastFailureClass)
    ) {
      const idx = ranked.findIndex((r) => r.vendorId === last)
      return ranked[(idx + 1) % ranked.length]!.vendorId
    }
  }
  return ranked[0]!.vendorId
}

/**
 * What one verified delivery cost a vendor on a route (PA G3): everything the run's ledger charged its attempts, failed
 * ones included, over the attempts whose page did the task. Unknown (null) when none did, never zero or infinite, and
 * unknown when any attempt has no settled charge: such an attempt is unknown exposure, not a free one.
 */
export interface UnitDeliveryCost {
  unitCostUsd: number | null
  /** What the ledger charged the attempts whose charge is known. */
  knownChargedUsd: number
  /** Attempts with no settled charge. */
  unknownExposureAttempts: number
  /** Attempts whose page did the task. */
  verified: number
  /** Attempts whose task was judged, passed or not. */
  judged: number
}

/** Dollars to the nanodollar, so that sums of the same price compare equal. */
const usd = (value: number): number => Math.round(value * 1e9) / 1e9

export function unitDeliveryCost(entry: VendorHistoryEntry): UnitDeliveryCost {
  const { yes, no } = entry.layers.taskVerified
  const unknownExposureAttempts = entry.chargedUnknownAttempts
  return {
    unitCostUsd: yes === 0 || unknownExposureAttempts > 0 ? null : usd(entry.chargedTotalUsd / yes),
    knownChargedUsd: usd(entry.chargedTotalUsd),
    unknownExposureAttempts,
    verified: yes,
    judged: yes + no,
  }
}

/**
 * Why the shadow ranking kept the declared order: no vendor has history on this host (`new_host`), a vendor has none
 * on it (`no_history`; a store that expires rows on a version change reads that way too), a vendor has fewer than the
 * minimum attempts (`insufficient_samples`), or the vendor's latest attempt ran on another browser or egress
 * configuration than its rung declares now (`version_changed`).
 */
export type ShadowFallbackReason = 'new_host' | 'no_history' | 'insufficient_samples' | 'version_changed'

export interface ShadowCandidate extends UnitDeliveryCost {
  vendorId: string
  /** Verified over judged attempts; null when none was judged. */
  passRate: number | null
  /** Attempts on record. */
  samples: number
  medianLatencyMs: number | null
  fallbackReason: ShadowFallbackReason | null
}

export interface ShadowRanking {
  /** Vendor ids, best first; the declared order when `fallbackReasons` is not empty. */
  order: string[]
  /** In the declared order. */
  candidates: ShadowCandidate[]
  /** Each distinct reason the ranking fell back, in the order the candidates first gave it; empty when it ranked. */
  fallbackReasons: ShadowFallbackReason[]
}

/** The attempts a vendor needs on record before the shadow ranks it; the same minimum the route history reads with. */
export const SHADOW_MIN_SAMPLES = 3

/** What a vendor's rung runs on now. */
export type RungEnvironment = Pick<RouteEnvironment, 'browserMajor' | 'egressConfigVersion'>

export interface ShadowRankOptions {
  minSamples?: number
  /** Each vendor's rung now; a known value that differs from its latest attempt's is a version change. */
  environments?: Record<string, RungEnvironment>
  /** Vendors the store held attempts of but left out of the read for too few, with how many (the route history's `lastThin`). */
  thin?: Record<string, number>
  /** Vendors whose rows the read expired, with the reason (the route history's `lastExpired`). */
  expired?: Record<string, string>
}

/** Expiry reasons that mean the vendor, the extractor, the verifier or the policy moved on: a new version, not a new host. */
const VERSION_EXPIRIES = new Set(['browser_version', 'egress_config', 'site_template', 'extractor_version', 'policy_version'])

function medianOf(samples: readonly number[]): number | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[half - 1]! + sorted[half]!) / 2 : sorted[half]!
}

function versionChanged(entry: VendorHistoryEntry, now: RungEnvironment | undefined): boolean {
  const last = entry.observations.at(-1)?.environment
  if (now === undefined || last === undefined) return false
  const differs = (a: string | number | null, b: string | number | null): boolean => a !== null && b !== null && a !== b
  return differs(last.browserMajor, now.browserMajor) || differs(last.egressConfigVersion, now.egressConfigVersion)
}

/**
 * The shadow ranking (PA G3): by unit delivery cost, lowest first, a vendor whose unit cost is unknown after those whose
 * is known; ties on pass rate, then median latency, then the declared order. It falls back to the declared order when
 * any candidate cannot be judged on its record (see ShadowFallbackReason). It decides nothing: the ladder writes it to
 * its trace beside the order rankVendors gave, until two windows show the same gain.
 */
export function shadowRankVendors(domainHistory: DomainHistory, vendorIds: readonly string[], options: ShadowRankOptions = {}): ShadowRanking {
  const minSamples = Math.max(1, options.minSamples ?? SHADOW_MIN_SAMPLES)
  const thin = options.thin ?? {}
  const expired = options.expired ?? {}
  const held = (id: string): number => domainHistory.vendors[id]?.attempts ?? thin[id] ?? 0
  const newHost = [...Object.keys(domainHistory.vendors), ...Object.keys(thin)].every((id) => held(id) === 0)
    && !Object.values(expired).some((reason) => VERSION_EXPIRIES.has(reason))
  const candidates = vendorIds.map((vendorId): ShadowCandidate => {
    const entry = domainHistory.vendors[vendorId] ?? freshEntry()
    const cost = unitDeliveryCost(entry)
    const samples = held(vendorId)
    const fallbackReason: ShadowFallbackReason | null = newHost
      ? 'new_host'
      : entry.attempts === 0 && VERSION_EXPIRIES.has(expired[vendorId] ?? '')
        ? 'version_changed'
        : samples === 0
          ? 'no_history'
          : entry.attempts > 0 && versionChanged(entry, options.environments?.[vendorId])
            ? 'version_changed'
            : samples < minSamples
              ? 'insufficient_samples'
              : null
    return {
      vendorId,
      ...cost,
      passRate: cost.judged === 0 ? null : cost.verified / cost.judged,
      samples,
      medianLatencyMs: medianOf(entry.latencySamplesMs),
      fallbackReason,
    }
  })
  const fallbackReasons = [...new Set(candidates.flatMap((c) => (c.fallbackReason === null ? [] : [c.fallbackReason])))]
  if (fallbackReasons.length > 0) return { order: [...vendorIds], candidates, fallbackReasons }
  // Nulls last on every key: an unknown is never read as the best value.
  const ascending = (a: number | null, b: number | null): number => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b)
  const order = candidates
    .map((c, index) => ({ c, index }))
    .sort((x, y) =>
      ascending(x.c.unitCostUsd, y.c.unitCostUsd)
      || ascending(x.c.passRate === null ? null : -x.c.passRate, y.c.passRate === null ? null : -y.c.passRate)
      || ascending(x.c.medianLatencyMs, y.c.medianLatencyMs)
      || x.index - y.index)
    .map(({ c }) => c.vendorId)
  return { order, candidates, fallbackReasons }
}
