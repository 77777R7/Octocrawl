// Types for combinedArms.mjs, so its tests (packages/runtime/test/combinedArms.test.ts) type-check against it.

export interface SteelRelease { released: boolean; by: 'call' | 'state' | 'unknown' | null; calls: number | null; state: string | null }
export interface SteelCall { created: boolean; createMs: number | null; createError: string | null; gated: boolean; refused: boolean; releases: SteelRelease[]; chargedUsd: number | null; basis: string | null }
export interface SteelTally {
  responses: number; unread: number; complete: boolean; calls: number; refused: number; traced: boolean; created: number | null
  createMs: { p50: number; max: number } | null; createFailed: number | null; createErrors: Record<string, number> | null; createdWithoutRelease: number | null
  releases: number | null; releasedBy: Record<string, number> | null; unconfirmed: number | null; unconfirmedStates: Record<string, number> | null
  basis: Record<string, number>; chargedUsd: number | null
}
export interface ArmFigures { planned: number; attempted: number; verified: number; fs: number }

export declare const REPORT_ARMS: string[]
export declare function reportArms(...armLists: readonly (readonly string[])[]): string[]
export declare const PAIRS: [string, string][]
export declare function pairsFor(arms: readonly string[]): [string, string][]
export declare function steelCalls(response: unknown): SteelCall[] | null
export declare function steelTally(perResponse: readonly (SteelCall[] | null)[]): SteelTally
export declare function exitOf(icCompat: ArmFigures, combined: ArmFigures, margin?: number): { needed: number; verified: boolean | null; falseSuccess: boolean | null; met: boolean | null }
