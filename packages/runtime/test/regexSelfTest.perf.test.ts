import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { regexBoundSelfTest, regexChecksIn, regexCorpusSelfTest } from '../src/regexSelfTest.js'

// The self-test hosted Octocrawl runs at its start and its images at their build (ADR 0006, amendment of 2026-10-29). A
// perf file: it bounds how long a stopped scan overruns its limit. The corpus runs first: the tests after it stop scans,
// and on Node 26.8.1 a stopped scan leaves every later global match in the process about 3.7 times slower.
const TASK_FILES = ['research/access/tasks.v1.json', 'research/access/captcha-tasks.v1.json', 'research/parity/sites.v1.json']
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'))

describe('the regular-expression checks\' self-test (ADR 0006, amendment of 2026-10-29)', () => {
  it('judges every pattern of the task files as RegExp does, on the build\'s synthetic Markdown', () => {
    const checks = regexChecksIn(TASK_FILES.map(read))
    // 164 on 2026-10-29: a task file that loses its patterns would empty the build's check without failing it.
    expect(checks.length).toBeGreaterThanOrEqual(164)
    expect(regexCorpusSelfTest(checks)).toEqual({ ok: true, failures: [] })
  })

  it('reads each check of a document once, regular-expression checks alone, wherever they sit', () => {
    const count = { type: 'markdownCountMin', pattern: 'tide', flags: 'i', min: 2 }
    const document = { tasks: [{ predicates: [count, { type: 'markdownIncludes', text: 'tide' }] }, { verify: { checks: [count, { type: 'markdownMatches', pattern: '^#' }] } }], other: [{ type: 'markdownMatches', pattern: 7 }] }
    expect(regexChecksIn(document)).toEqual([count, { type: 'markdownMatches', pattern: '^#' }])
  })

  it('names a pattern it cannot judge and a count that differs, and passes nothing it did not judge', () => {
    const unrunnable = regexCorpusSelfTest([{ type: 'markdownCountMin', pattern: '(', min: 1 }], ['text'])
    expect(unrunnable).toEqual({ ok: false, failures: [expect.stringMatching(/^markdownCountMin \/\(\/ on subject 0 was not judged .*"limit":"error"/)] })
    // A check judged true at a minimum of 0 without a count is still not judged.
    const slow = regexCorpusSelfTest([{ type: 'markdownCountMin', pattern: '(?:\\s|\\S)*x$', min: 0 }], ['ab'.repeat(100_000)])
    expect(slow).toEqual({ ok: false, failures: [expect.stringMatching(/was not judged .*"limit":"time"/)] })
  })

  it('finds this Node bounds the checks as promised', () => {
    expect(regexBoundSelfTest()).toEqual({ ok: true, failures: [] })
  })
})
