import { describe, expect, it } from 'vitest'
import { verify } from '@w2l/runtime'
import { RESULT_TEXT_MAX, shapeResult } from '../src/results.js'

describe('the pattern checks of a shortened MCP result (ADR 0006, amendment of 2026-10-29)', () => {
  it('spends one pool on the versions the search tries, and judges the one delivered on a pool of its own', () => {
    // Quadratic on text with no x: each scan of a long prefix stops at its 250 ms limit.
    const contract = { checks: [{ type: 'markdownMatches' as const, pattern: '(?:\\s|\\S)*x' }] }
    const result = { status: 'success', url: 'https://example.com/long', markdown: 'ab '.repeat(310_000) }
    const started = performance.now()
    const { value } = shapeResult('scrape', result, contract) as { value: Record<string, any> }
    // About 20 versions tried: with a pool of their own each, their scans alone took over 5 s, on any machine (each stops at
    // 250 ms of wall time); now at most 2.25 s of scans, and the rest is cutting and measuring.
    expect(performance.now() - started).toBeLessThan(4_000)
    expect(JSON.stringify(value).length).toBeLessThanOrEqual(RESULT_TEXT_MAX)
    expect(value.truncated).toBe(true)
    const { verification: _verification, readiness: _readiness, evidenceRecord: _record, ...data } = value
    // Judged as a fresh judgement of the delivered result judges it, whatever the search spent.
    expect(value.verification).toEqual(verify(contract, data))
    expect(value.verification.checks[0]).toMatchObject({ passed: null, limit: 'time', limitMs: 250 })
  })
})
