import { describe, expect, it } from 'vitest'
import { verify } from '../src/verify.js'

// A file of its own, so that no scan stopped earlier in the process runs before it: on Node 26.8.1 a regular expression
// stopped at its time limit leaves every later global match in the process about 3.7 times slower.
describe('the count of a regular-expression check (ADR 0006, amendment of 2026-10-29)', () => {
  it('counts matches without holding them all', () => {
    // 2 Mi matches: String.prototype.match grew the heap by 63-69 MiB here, the count by 4-11 MiB, in about 35 ms of the
    // 250 ms scan limit, so a slower machine still finishes it.
    const markdown = 'a'.repeat(2 * 1024 * 1024)
    globalThis.gc?.()
    const before = process.memoryUsage().heapUsed
    const verification = verify({ checks: [{ type: 'markdownCountMin', pattern: '.', min: 1 }] }, { status: 'success', markdown })
    const grown = process.memoryUsage().heapUsed - before
    expect(verification).toMatchObject({ status: 'passed', checks: [{ observedCount: markdown.length }] })
    expect(grown).toBeLessThan(32 * 1024 * 1024)
  })
})
