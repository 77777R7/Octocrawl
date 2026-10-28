// Types for k1Arms.mjs, so its tests (packages/runtime/test/k1Arms.test.ts) type-check against it.

export interface LocalArm { port: number; cwd: string; commit: string; access: string; env: Record<string, string | undefined>; grant: unknown; grantFile: string | null }

export declare const BASE_ARMS: string[]
export declare function baseOf(name: string): string | null
export declare function rotated<T>(local: T[], b: number): T[]
export declare function withBaseArms(arms: Record<string, LocalArm>, base: { dir: string; commit: string } | null, portOf: (name: string) => number): Record<string, LocalArm>
export declare function steelCapAllows(input: { charged: (number | null | undefined)[]; pages: number; capUsd: number; pageCeilingUsd: number | null }): { ok: boolean; spentUsd: number | null; worstUsd: number | null }
