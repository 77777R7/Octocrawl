// Types for judge.mjs, so the product's verifier tests (packages/runtime/test/verify.test.ts) type-check against it.
import type { VerifyCheck } from '@w2l/contracts'

export declare const DATA_TYPES: Set<string>
export declare const isData: (p: VerifyCheck) => boolean
export declare const get: (obj: unknown, path: string) => unknown
export declare const gfmTableCount: (md: string) => number
export declare function judge(p: VerifyCheck, doc: Record<string, unknown>): boolean
