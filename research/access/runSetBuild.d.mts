// Types for runSetBuild.mjs, so its tests (packages/runtime/test/runSetBuild.test.ts) type-check against it.

export interface BuildState { check: string; upToDate: boolean | null; stale: string[] | null; error?: string }

export declare const BUILD_CHECK: string
export declare function staleProjects(output: string, root: string): string[]
export declare function buildState(root: string): BuildState
export declare function buildLine(build: BuildState | null | undefined): string
