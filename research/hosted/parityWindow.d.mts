// Types for parityWindow.mjs, so its tests (packages/mcp/test/hostedParityWindow.test.ts) type-check against it.
import type { VerifyCheck } from '@w2l/contracts'

export interface Task { id: string; url: string; request?: Record<string, unknown>; predicates: VerifyCheck[] }
export interface ToolError { code: string; message: string }
export interface Row {
  taskId: string
  arm: string
  notRun?: string
  wallMs?: number
  status?: string | null
  reason?: string | null
  lane?: string | null
  verification?: string | null
  readiness?: string | null
  truncated?: boolean
  robots?: 'refused' | 'overridden' | null
  toolError?: ToolError | null
  credits?: number | null
  verified: boolean
  falseSuccess: boolean
  failedPredicates?: string[]
}
export interface ArmSummary {
  arm: string
  planned: number
  attempted: number
  notRun: number
  verified: number
  falseSuccess: number
  robotsAllowed: { planned: number; verified: number; falseSuccess: number } | null
  p50Ms: number | null
  p95Ms: number | null
  verifiedP50Ms: number | null
  credits: number | null
  toolErrors: Record<string, number>
  reasons: Record<string, number>
  robotsRefused: string[]
  robotsOverridden: string[]
  overCap: number
  truncated: number
}
export type CallAnswer = { result: unknown; wallMs: number; error?: undefined } | { error: unknown; wallMs: number }

export declare const HOSTED_CAP_MS: number
export declare const RESERVED_PORTS: Set<number>
export declare function listedCheckTypes(tools: readonly { name: string; inputSchema?: unknown }[] | undefined): string[]
export declare function contractFor(predicates: readonly VerifyCheck[], listed: readonly string[]): { checks: VerifyCheck[] } | undefined
export declare function armOrder<T>(arms: readonly T[], index: number): T[]
export declare function documentOf(result: unknown): { doc: Record<string, unknown> | null; toolError: ToolError | null }
export declare function robotsOf(doc: Record<string, unknown> | null): 'refused' | 'overridden' | null
export declare function verdictOf(task: Task, doc: Record<string, unknown> | null): { verified: boolean; falseSuccess: boolean; failedPredicates: string[] }
export declare const pct: (xs: readonly number[], q: number) => number | null
export declare function armSummary(rows: readonly Row[], arm: string): ArmSummary
export declare function robotsRefusedTasks(rows: readonly Row[]): string[] | null
export declare function robotsUnknownTasks(rows: readonly Row[]): string[] | null
export declare function robotsLine(rows: readonly Row[], arms: readonly string[]): string
export declare function summaryTable(summaries: readonly ArmSummary[]): string[]
export declare function powerState(pmsetText: string, ioregText: string | undefined): { ac: boolean; lidOpen: boolean | null }
export declare function runWindow(options: {
  tasks: readonly Task[]
  arms: readonly string[]
  call: (arm: string, task: Task) => Promise<CallAnswer>
  canRun?: (arm: string, rows: readonly Row[]) => string | null
  charge?: (arm: string, doc: Record<string, unknown>) => number | null
  onRow?: (row: Row, doc: Record<string, unknown> | null) => void | Promise<void>
}): Promise<Row[]>
