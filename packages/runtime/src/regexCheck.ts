/**
 * The regular-expression checks of a task contract (`markdownMatches`, `markdownCountMin`) run with a time limit (ADR
 * 0006, amendment of 2026-10-29). The engine is V8's own (irregexp), the one these checks always ran on, so a pattern
 * that finishes gives the verdict and count it always gave. It runs in a vm script, the only place its time limit can
 * stop a match: a pattern the parse-time check (unsafeRegexReason) let through can still backtrack quadratically on a
 * page's whole Markdown, where 256 KiB once took 49 s and held the process.
 *
 * - Each scan stops at REGEX_SCAN_LIMIT_MS, and the scans of one pool together at its size. A scan stopped there, one
 *   with no time left to start, and one the engine could not run (its backtrack stack overflows near 4.19M characters
 *   of `^(a)*$`) are not judged: the check says which limit it met, and is neither passed nor failed.
 * - The pools: every final judgement (a verify() call that is not partial) gets REGEX_VERIFY_POOL_MS of its own, so a
 *   result's verdict depends on the contract and the result alone. The partial judgements that steer one request (each
 *   rung's verdict, the region wait's reads, the extraction candidates) share REGEX_STEERING_POOL_MS through the
 *   request's ledger (withRegexLedger, an AsyncLocalStorage), so a page whose text changes on every read costs at most
 *   that much. A partial judgement outside any ledger gets a pool of its own.
 * - The ledger remembers each check's last scan by its text: steering takes a remembered scan free, and a final
 *   judgement replays it at the time it took, as a fresh run on its own pool would end. A scan the engine could not
 *   run is not remembered: the native stack near a deep caller can stop any scan.
 * - A count iterates the matches (matchAll) and never holds them all: String.prototype.match with g built an array of
 *   every match, 2.3 GB at 96 MiB, and a heap abort past it. The count is the same, by the same AdvanceStringIndex.
 *
 * The context is made when this module loads, before anything in the process can switch on V8's experimental engine
 * (pathFilter.ts): on Node 26.8.1 a context made after that flag aborts the process.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { createContext, Script } from 'node:vm'

/** How long one regular-expression check may run on one text. */
export const REGEX_SCAN_LIMIT_MS = 250

/** How long the regular-expression checks of one final judgement (a verify() call that is not partial) may run together. */
export const REGEX_VERIFY_POOL_MS = 1_000

/** How long the partial judgements that steer one request may run their regular-expression checks together. */
export const REGEX_STEERING_POOL_MS = 1_000

/** Why a check was not judged: its scan ran past its limit, its pool had no time left, or the engine could not run it. */
export type RegexLimit = 'time' | 'budget' | 'error'

export type RegexScan =
  | { done: true; value: number | boolean }
  | { done: false; limit: RegexLimit; limitMs: number; error?: string }

/** Time the scans drawn from it may still take, in milliseconds, and what a check it had no time for says. */
export class RegexPool {
  constructor(private left: number, readonly spent = `this verification's ${REGEX_VERIFY_POOL_MS} ms for regular expressions was spent by the checks before it`) {}

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

/** What a ledger's scans cost: for a request's log line (ApiEngineOptions.onRegexChecks). */
export interface RegexStats {
  /** Scans run, and remembered scans reused instead. */
  scans: number
  memoHits: number
  /** Time spent in scans, the longest one, and the longest any one verify() call held the process for its checks. */
  totalMs: number
  maxMs: number
  maxCallMs: number
  /** Checks left undecided at a limit, over all the judgements. */
  limited: number
}

type Remembered = { subject: string; scan: RegexScan; ms: number }

/** One request's regular-expression checks: its steering pool, what its scans found, and what they cost. */
export class RegexLedger {
  readonly steering = new RegexPool(REGEX_STEERING_POOL_MS, `this request's ${REGEX_STEERING_POOL_MS} ms for regular expressions on partial views was spent`)
  readonly stats: RegexStats = { scans: 0, memoHits: 0, totalMs: 0, maxMs: 0, maxCallMs: 0, limited: 0 }
  private readonly memo = new Map<string, Remembered>()

  /**
   * One check's scan of `subject`, drawn from `pool`. A scan remembered for the same text is taken free when steering
   * and replayed at its cost when `final`; a new one is run and remembered unless it stopped short of the full limit.
   */
  scan(kind: 'test' | 'count', pattern: string, flags: string, subject: string, pool: RegexPool, final: boolean): { scan: RegexScan; ms: number } {
    const key = `${kind}|${flags}|${pattern}`
    const seen = this.memo.get(key)
    if (seen !== undefined && seen.subject === subject) {
      this.stats.memoHits++
      return { scan: final ? replay(seen, pool) : seen.scan, ms: 0 }
    }
    const started = performance.now()
    const scan = scanRegex(kind, pattern, flags, subject, pool)
    const ms = performance.now() - started
    // A check its pool had no time for did not run.
    if (!scan.done && scan.limit === 'budget') return { scan, ms: 0 }
    this.stats.scans++
    this.stats.totalMs += ms
    this.stats.maxMs = Math.max(this.stats.maxMs, ms)
    if (scan.done || (scan.limit === 'time' && scan.limitMs === REGEX_SCAN_LIMIT_MS)) this.memo.set(key, { subject, scan, ms })
    return { scan, ms }
  }

  /** One verify() call's checks: how long it held the process for them, and how many it left undecided. */
  noteCall(ms: number, limited: number): void {
    this.stats.maxCallMs = Math.max(this.stats.maxCallMs, ms)
    this.stats.limited += limited
  }
}

/** A remembered scan as a fresh run on `pool` would end: finished within what the pool allows, else stopped there. */
function replay(seen: Remembered, pool: RegexPool): RegexScan {
  if (pool.remaining < 1) return { done: false, limit: 'budget', limitMs: 0 }
  const allowance = Math.max(1, Math.min(REGEX_SCAN_LIMIT_MS, Math.floor(pool.remaining)))
  if (seen.scan.done && seen.ms <= allowance) {
    pool.charge(seen.ms)
    return seen.scan
  }
  pool.charge(allowance)
  return { done: false, limit: 'time', limitMs: allowance }
}

const ledgers = new AsyncLocalStorage<RegexLedger>()

/**
 * Run `fn` as one request's regular-expression checks: the partial judgements it makes share a steering pool, and its
 * judgements share what their scans found. `onClose` gets what they cost when it ends. The ledger follows `fn`'s
 * awaits; it is never read from an event listener or a callback queue, which run in the store of whoever made them.
 */
export async function withRegexLedger<T>(fn: () => Promise<T>, onClose?: (stats: RegexStats) => void): Promise<T> {
  const ledger = new RegexLedger()
  return ledgers.run(ledger, async () => {
    try {
      return await fn()
    } finally {
      if (onClose !== undefined && (ledger.stats.scans > 0 || ledger.stats.memoHits > 0)) {
        try { onClose(ledger.stats) } catch { /* the observer's own fault */ }
      }
    }
  })
}

/** The ledger of the request this code runs for, if any. */
export function currentRegexLedger(): RegexLedger | undefined {
  return ledgers.getStore()
}
