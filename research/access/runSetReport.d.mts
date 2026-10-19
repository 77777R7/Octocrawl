// Types for runSetReport.mjs, so its tests (packages/runtime/test/runSetReport.test.ts) type-check against it.

export interface PlannedAttempt { taskId: string; temperature: string }
export interface ReportRow {
  taskId: string
  temperature: string
  observed: { proxyRefused?: unknown; channelsTried?: readonly string[] | null; ladderSkips?: readonly { channel: string | null; vendorId: string | null; rule: string }[] | null }
  outcome: { verified: boolean }
}
export interface Denominator { planned: number | null; attempted: number; notRun: PlannedAttempt[] | null }
export interface Grant { sha256: string; capabilities: string[] | null }

export declare const PROXY_REFUSED_STOP: number
export declare function plannedAttempts(tasks: readonly { id: string }[], temperatures: readonly string[]): PlannedAttempt[]
export declare function proxyRefusedInARow(rows: readonly ReportRow[]): number
export declare function stopReason(rows: readonly ReportRow[], plannedCount: number, limit?: number): string | null
export declare function denominator(planned: readonly PlannedAttempt[], rows: readonly ReportRow[]): Denominator
export declare function denominatorLines(den: Denominator, stoppedEarly: string | null | undefined): string[]
export declare function grantOf(text: string | null | undefined): Grant | null
export declare function grantLine(grant: Grant | null | undefined): string
export declare function channelsCell(row: ReportRow): string
