/**
 * Crawl path filters (`includePaths` / `excludePaths`) are caller-supplied
 * regular expressions run against the paths of links a crawled page chose.
 * On V8's default backtracking engine a pattern such as `^/(a+)+$` takes time
 * exponential in the length of a crafted path and would stall the process.
 *
 * - A pattern V8's linear-time engine can run (the `l` flag) is matched in
 *   time linear in the path. That engine sits behind
 *   --enable-experimental-regexp-engine in every Node.js release W2L
 *   supports; switching the flag on only makes `l` available, and every other
 *   regular expression runs as before.
 * - The rest (a lookaround, a backreference, a counted repetition above 16)
 *   run on the backtracking engine with a time limit per link. A filter that
 *   exceeds it cannot say whether the link matches, and it is not run again:
 *   it leaves that link and every later one it is asked about undecided, so a
 *   crafted page costs at most one time limit per filter.
 */

import { setFlagsFromString } from 'node:v8'
import { createContext, Script } from 'node:vm'

/** How long a backtracking path filter may take on one link. */
export const PATH_FILTER_TIME_LIMIT_MS = 100

export interface PathFilter {
  /** Whether the path matches; null when the filter could not decide within its time limit. */
  test(path: string): boolean | null
}

let linearEngine: boolean | undefined

function linearRegExp(pattern: string): RegExp | null {
  if (linearEngine === undefined) {
    try { setFlagsFromString('--enable-experimental-regexp-engine') } catch { /* checked below */ }
    try {
      new RegExp('', 'l')
      linearEngine = true
    } catch {
      linearEngine = false
    }
  }
  if (!linearEngine) return null
  try { return new RegExp(pattern, 'l') } catch { return null }
}

// The time limit interrupts a match only inside a vm script.
const sandbox = createContext({ re: null as RegExp | null, path: '' })
const testInSandbox = new Script('re.test(path)')

/** A path filter for `pattern`. Throws for a pattern that is not a regular expression. */
export function compilePathFilter(pattern: string): PathFilter {
  const linear = linearRegExp(pattern)
  if (linear !== null) return { test: path => linear.test(path) }
  const backtracking = new RegExp(pattern)
  let timedOut = false
  return {
    test(path) {
      if (timedOut) return null
      sandbox.re = backtracking
      sandbox.path = path
      try {
        return testInSandbox.runInContext(sandbox, { timeout: PATH_FILTER_TIME_LIMIT_MS }) === true
      } catch (error) {
        if ((error as { code?: unknown }).code !== 'ERR_SCRIPT_EXECUTION_TIMEOUT') throw error
        timedOut = true
        return null
      } finally {
        sandbox.re = null
        sandbox.path = ''
      }
    },
  }
}
