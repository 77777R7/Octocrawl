// Whether the compiled packages/*/dist/ the local API loads matches the source checked out (research/access/run-set.mjs).
//
// `node --import tsx packages/api/src/cli.ts` loads the workspace packages (@w2l/bench, @w2l/http-core …) from their
// dist/, which git ignores: after a rebase or merge without `npx tsc --build`, a run executes older engine code while
// the record names the new commit with dirty: false (G4, 2026-10-21). TypeScript's own `tsc --build --dry` answers the
// question: it names each project a build would compile again, by file contents, so a file only touched is not stale.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'

export const BUILD_CHECK = 'tsc --build --dry'

/** The projects a `tsc --build --dry` output says a build would compile again (not the ones whose timestamps it would only update). */
export function staleProjects(output, root) {
  return [...output.matchAll(/A non-dry build would build project '([^']+)'/g)].map((m) => relative(root, m[1]).replace(/\/tsconfig\.json$/, ''))
}

/**
 * The build state of the checkout at `root`, by its root tsconfig.json: { check, upToDate, stale } with upToDate null and
 * an error when tsc could not answer (unknown, not up to date).
 */
export function buildState(root) {
  try {
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
    const output = execFileSync(process.execPath, [tsc, '--build', '--dry', join(root, 'tsconfig.json')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const stale = staleProjects(output, root)
    return { check: BUILD_CHECK, upToDate: stale.length === 0, stale }
  } catch (err) {
    return { check: BUILD_CHECK, upToDate: null, stale: null, error: String(err?.stderr || err?.stdout || err?.message || err).trim().split('\n')[0] }
  }
}

/** The record's line for a build state; a run from before the check has none. */
export function buildLine(build) {
  if (build === undefined || build === null) return '- Engine build: not checked (run before the check was added)'
  const what = `this checkout's packages/*/dist against its source, \`${build.check}\` at the start`
  if (build.upToDate === true) return `- Engine build: up to date (${what})`
  if (build.upToDate === false) return `- Engine build: **stale**, the dist/ of ${build.stale.join(', ')} did not match the source checked out, so the run used older compiled code than the commit names (${what}; started with --stale-build)`
  return `- Engine build: unknown, the check did not answer (${what}: ${build.error ?? 'no error recorded'})`
}
