// Types for weeklyPlan.mjs, so its tests (packages/runtime/test/weeklyPlan.test.ts) type-check against it.

export interface TaskFile { tasks: readonly { id: string; part: string }[] }
export interface Subsets { subsets: { challenge16: { tasks: readonly string[] } } }
export interface WeeklySet {
  isoYear: number
  isoWeek: number
  group: number
  groupCount: number
  rotationPool: number
  healthy: string[]
  challenge: string[]
  rotation: string[]
  all: string[]
}
export interface Baseline { final: readonly number[]; probe: readonly number[]; total: number; floor: number }
export interface PartTotals { planned: number; attempted: number; verified: number; falseSuccess: number }
export interface ArmResult {
  arm: string
  competitor: boolean
  totals: { verified: number; falseSuccess: number; p50Ms: number | null; p95Ms: number | null } | null
  reason?: string | null
  cost: string
  parts: Record<'all' | 'healthy' | 'challenge' | 'rotation', PartTotals>
}
export interface SummaryRow {
  arm: string
  status: string
  verified: number | null
  falseSuccess: number | null
  p50Ms: number | null
  p95Ms: number | null
  cost: string
  parts: ArmResult['parts']
  gap: Record<'all' | 'healthy' | 'challenge' | 'rotation', number | null> | null
}

export declare function isoWeek(date: Date): { year: number; week: number }
export declare function rotationGroups(ids: readonly string[], size?: number, count?: number): string[][]
export declare function rotationGroupOf(date: Date, count?: number): number
export declare function weeklySet(taskFile: TaskFile, subsets: Subsets, date: Date): WeeklySet
export declare function chromeMajor(version: string | null | undefined): number | null
export declare function chromeOfRecord(text: string | null | undefined): string | null
export declare const IC16_BASELINE: Baseline
export declare function baselineLine(verified: number | null, baseline?: Baseline): string
export declare function weeklyHeaderLines(opts: { date: string; commit: string; arm: string; set: WeeklySet; chrome: string | null; previousChrome?: string | null; chromeRerun?: boolean }): string[]
export declare function summaryRows(arms: readonly ArmResult[]): SummaryRow[]

/** One vendor attempt's RouteObservation (packages/bench/src/routing/vendorRouter.ts), as the routing history stores it. */
export interface StoredObservation {
  observedAt: string
  accessDelivered: boolean | null
  regionLoaded: boolean | null
  taskVerified: boolean | null
  failureStage: string | null
  chargedUsd: number | null
  chargeBasis: string | null
  [key: string]: unknown
}
export interface RouteEntry { vendor: string; entry: { observations?: readonly StoredObservation[] } & Record<string, unknown> }
export declare function readRouteEntries(file: string): Promise<RouteEntry[]>
export declare function observationsBetween(entries: readonly RouteEntry[], from: string, to: string): Array<StoredObservation & { vendor: string }>
export declare function steelLayerLines(opts: {
  observations: readonly StoredObservation[] | null
  historyError?: string | null
  paidCalls: number | null | undefined
  chargedUsd: number | null | undefined
  verified: number | null | undefined
  verifiedFromPaidCall: number | null | undefined
}): string[]
