/**
 * The regular-expression checks of a task contract (`markdownMatches`, `markdownCountMin`) run with a time limit (ADR
 * 0006, amendment of 2026-10-29). The engine is V8's own (irregexp), the one these checks always ran on, so a pattern
 * that finishes gives the verdict and count it always gave. It runs in a vm script, the only place its time limit can
 * stop a match: a pattern the parse-time check (unsafeRegexReason) let through can still backtrack quadratically on a
 * page's whole Markdown, where 256 KiB once took 49 s and held the process.
 *
 * - Each scan stops at REGEX_SCAN_LIMIT_MS, and the scans of one pool together at its size (a verify() call gets
 *   REGEX_VERIFY_POOL_MS). A scan stopped there, one with no time left to start, and one the engine could not run
 *   (its backtrack stack overflows near 4.19M characters of `^(a)*$`) are not judged: the check says which limit it
 *   met, and is neither passed nor failed.
 * - A count iterates the matches (matchAll) and never holds them all: String.prototype.match with g built an array of
 *   every match, 2.3 GB at 96 MiB, and a heap abort past it. The count is the same, by the same AdvanceStringIndex.
 *
 * The context is made when this module loads, before anything in the process can switch on V8's experimental engine
 * (pathFilter.ts): on Node 26.8.1 a context made after that flag aborts the process.
 */

import { createContext, Script } from 'node:vm'

/** How long one regular-expression check may run on one text. */
export const REGEX_SCAN_LIMIT_MS = 250

/** How long the regular-expression checks of one verify() call may run together. */
export const REGEX_VERIFY_POOL_MS = 1_000

/** Why a check was not judged: its scan ran past its limit, its pool had no time left, or the engine could not run it. */
export type RegexLimit = 'time' | 'budget' | 'error'

export type RegexScan =
  | { done: true; value: number | boolean }
  | { done: false; limit: RegexLimit; limitMs: number; error?: string }

/** Time the scans drawn from it may still take, in milliseconds. */
export class RegexPool {
  constructor(private left: number) {}

  get remaining(): number {
    return this.left
  }

  charge(ms: number): void {
    this.left = Math.max(0, this.left - ms)
  }
}

const sandbox = createContext({ re: null as RegExp | null, s: '' })
const TEST = new Script('re.lastIndex = 0, re.test(s)')
// A block, so that `n` is declared afresh on every run in the same context.
const COUNT = new Script('{ re.lastIndex = 0; let n = 0; for (const _ of s.matchAll(re)) n++; n }')

/**
 * One check's scan of `subject`: whether `new RegExp(pattern, flags)` matches it (`test`), or how many matches it has
 * (`count`, flags with g), drawn from `pool`. The RegExp is built here too, so that an engine error at its compile is
 * caught like one at its run.
 */
export function scanRegex(kind: 'test' | 'count', pattern: string, flags: string, subject: string, pool: RegexPool): RegexScan {
  if (pool.remaining < 1) return { done: false, limit: 'budget', limitMs: 0 }
  const limitMs = Math.max(1, Math.min(REGEX_SCAN_LIMIT_MS, Math.floor(pool.remaining)))
  const started = performance.now()
  try {
    sandbox.re = new RegExp(pattern, flags)
    sandbox.s = subject
    const value = (kind === 'test' ? TEST : COUNT).runInContext(sandbox, { timeout: limitMs }) as number | boolean
    return { done: true, value }
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return { done: false, limit: 'time', limitMs }
    // The backtrack stack, or the native stack under a deep caller: neither says the text's size alone caused it.
    const name = (error as { name?: unknown }).name
    if (name === 'RangeError' || name === 'SyntaxError') return { done: false, limit: 'error', limitMs, error: name }
    throw error
  } finally {
    pool.charge(performance.now() - started)
    sandbox.re = null
    sandbox.s = ''
  }
}
