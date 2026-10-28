// Types for speedPhases.mjs, so its tests (packages/runtime/test/speedPhases.test.ts) type-check against it.

export interface ChallengeWaitRow { rung: string; blockReason: string | null; outcome: string | null; ms: number | null; capMs: number | null }
export interface RungTime {
  channel: string
  status: string | null
  blockReason: string | null
  failureReason: string | null
  clockMs: number
  wallMs: number | null
  phases: Record<string, number>
  robots: { ms: number; fetched: boolean } | null
  challengeWaits: ChallengeWaitRow[]
  timedSteps: boolean
}
export interface HeadersView { requestMs: number | null; httpStatus: string | null; httpFailure: string | null; fallback: { remainingMs: number | null; promised: boolean } | null; rungs: string[] }

export declare const ROBOTS_FETCH_MS: number
export declare function attemptsOf(response: unknown): RungTime[] | null
export declare function attemptOf(attempt: unknown): RungTime
export declare function headersOf(response: unknown): HeadersView
