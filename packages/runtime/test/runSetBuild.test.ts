import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, utimesSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// Whether the compiled dist/ the local API loads matches the checked-out source (research/access/run-set.mjs).
import { buildLine, buildState, staleProjects } from '../../../research/access/runSetBuild.mjs'

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
let root = ''
afterEach(() => { if (root !== '') rmSync(root, { recursive: true, force: true }) })

/** A checkout in miniature: a root tsconfig.json referencing packages/a, whose src/ compiles to dist/. */
function checkout(): string {
  root = mkdtempSync(join(tmpdir(), 'run-set-build-'))
  mkdirSync(join(root, 'packages/a/src'), { recursive: true })
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ files: [], references: [{ path: 'packages/a' }] }))
  writeFileSync(join(root, 'packages/a/tsconfig.json'), JSON.stringify({ compilerOptions: { composite: true, rootDir: './src', outDir: './dist', module: 'nodenext', target: 'es2022', types: [] }, include: ['src/**/*.ts'] }))
  writeFileSync(join(root, 'packages/a/src/index.ts'), 'export const ladder = 1\n')
  return root
}
const build = (dir: string) => execFileSync(process.execPath, [tsc, '--build', join(dir, 'tsconfig.json')], { cwd: dir })

describe('run-set engine build check', () => {
  it('finds a dist/ older than the source it was built from, as after a rebase without a rebuild', () => {
    const dir = checkout()
    expect(buildState(dir)).toMatchObject({ upToDate: false, stale: ['packages/a'] })
    build(dir)
    expect(buildState(dir)).toEqual({ check: 'tsc --build --dry', upToDate: true, stale: [] })
    appendFileSync(join(dir, 'packages/a/src/index.ts'), 'export const fix659 = 2\n')
    expect(buildState(dir)).toMatchObject({ upToDate: false, stale: ['packages/a'] })
    build(dir)
    expect(buildState(dir).upToDate).toBe(true)
  })

  it('does not call a file stale that was only touched', () => {
    const dir = checkout()
    build(dir)
    const later = new Date(Date.now() + 60_000)
    utimesSync(join(dir, 'packages/a/src/index.ts'), later, later)
    expect(buildState(dir).upToDate).toBe(true)
  })

  it('says unknown, not up to date, when tsc cannot answer', () => {
    root = mkdtempSync(join(tmpdir(), 'run-set-build-'))
    const state = buildState(root)
    expect(state.upToDate).toBeNull()
    expect(state.error).toBeTruthy()
    expect(buildLine(state)).toContain('unknown')
  })

  it('reads only the projects a build would compile, and writes the record line', () => {
    const out = [
      "7:19:43 PM - A non-dry build would build project '/r/packages/bench/tsconfig.json'",
      "7:19:43 PM - A non-dry build would update timestamps for output of project '/r/packages/api/tsconfig.json'",
      "7:19:43 PM - Project '/r/packages/cli/tsconfig.json' is up to date",
    ].join('\n')
    expect(staleProjects(out, '/r')).toEqual(['packages/bench'])
    expect(buildLine({ check: 'tsc --build --dry', upToDate: false, stale: ['packages/bench'] })).toContain('**stale**')
    expect(buildLine({ check: 'tsc --build --dry', upToDate: true, stale: [] })).toContain('up to date')
    expect(buildLine(undefined)).toContain('not checked')
  })
})
