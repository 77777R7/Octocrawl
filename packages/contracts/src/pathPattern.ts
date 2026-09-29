/**
 * Crawl path filters (`includePaths` / `excludePaths`) are caller-supplied
 * regular expressions run against the paths of links a crawled page chose.
 * JavaScript's default engine backtracks, so a pattern such as `^/(a+)+$`
 * takes time exponential in the length of a crafted path and stalls the
 * process. Path filters are compiled for V8's linear-time engine instead (the
 * `l` flag), whose matching time grows linearly with the path; a pattern it
 * cannot run (backreferences, lookaround, large counted repetitions) is
 * refused when the crawl is requested.
 *
 * That engine sits behind a V8 flag in every Node.js release W2L supports.
 * Switching it on here only makes the `l` flag available; every other regular
 * expression runs as before. Where it cannot be switched on (outside Node.js,
 * or before Node.js 20.16), path filters are refused, never run on the
 * backtracking engine.
 */

/** Why a path filter cannot be used: not a regular expression, not linear-time, or no linear-time engine here. */
export type PathPatternIssue = 'invalid' | 'not_linear' | 'no_linear_engine'

let linearEngine: boolean | undefined

function linearEngineAvailable(): boolean {
  if (linearEngine !== undefined) return linearEngine
  const v8 = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule?.('node:v8') as { setFlagsFromString?: (flags: string) => void } | undefined
  try { v8?.setFlagsFromString?.('--enable-experimental-regexp-engine') } catch { /* checked below */ }
  try {
    new RegExp('', 'l')
    linearEngine = true
  } catch {
    linearEngine = false
  }
  return linearEngine
}

/** Why `pattern` cannot be a path filter, or null when it can. */
export function pathPatternIssue(pattern: string): PathPatternIssue | null {
  try { new RegExp(pattern) } catch { return 'invalid' }
  if (!linearEngineAvailable()) return 'no_linear_engine'
  try { new RegExp(pattern, 'l') } catch { return 'not_linear' }
  return null
}

/** A path filter compiled for linear-time matching. Throws for a pattern pathPatternIssue refuses. */
export function compilePathPattern(pattern: string): RegExp {
  const issue = pathPatternIssue(pattern)
  if (issue !== null) throw new Error(`path filter refused (${issue}): ${pattern}`)
  return new RegExp(pattern, 'l')
}
