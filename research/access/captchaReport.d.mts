// Types for captchaReport.mjs, so its tests (packages/runtime/test/captchaReport.test.ts) type-check against it.

export interface Solver { calls: number; attempted: number; succeeded: number | null; reportedUsd: number | null; chargedUsd: number | null; solveMs: number | null }
export interface Row {
  taskId: string
  temperature: string
  observed: { solver?: Solver | null }
  outcome: { verified: boolean; falseSuccess: boolean; wallMs: number; chargedUsd?: number | null }
}
export interface Task { id: string; challenge?: { primaryType?: string } }
export interface Cell {
  planned: number; attempted: number; notRun: string[]; verified: number; falseSuccess: number
  solvesAttempted: number | null; solvesSucceeded: number | null; reportedUsd: number | null; usdPerSolve: number | null
  chargedUsd: number | null; solveMs: number | null; pairedAddedMs: { n: number; median: number | null }
}
export interface Cells { all: Cell; byType: Record<string, Cell> }

export declare const SOLVER_PROVIDERS: string[]
export declare function solverOf(doc: unknown, providers?: readonly string[]): Solver | null
export declare function baseArmOf(arm: string): string | null
export declare function armCells(tasks: readonly Task[], rows: readonly Row[] | null, baseRows?: readonly Row[] | null): Cells
export declare function typeOf(t: Task): string
export declare function cellsTable(arms: readonly { arm: string; cells: Cells }[]): string[]
export declare function manifestText(taskFile: { tasks: readonly unknown[] }): string
