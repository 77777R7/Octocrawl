import { describe, expect, it } from 'vitest'
import { verify } from '../src/verify.js'

describe('distinct task record verification bounds', () => {
  it('counts a full bounded list without parsing HTML or changing source records', () => {
    const records = Array.from({ length: 10_000 }, (_, i) => ({ values: { id: String(i % 5_000), name: `Record ${i}`, price: '0' }, missing: [] }))
    const check = { type: 'recordFields' as const, fields: ['name', 'price'], uniqueBy: ['id'], min: 5_001 }
    verify({ checks: [check] }, { status: 'success', list: { records } })
    const start = performance.now()
    expect(verify({ checks: [check] }, { status: 'success', list: { records } })).toMatchObject({ status: 'failed', checks: [{ observedCount: 5_000 }] })
    expect(performance.now() - start).toBeLessThan(1_000)
    expect(records).toHaveLength(10_000)
  })
})

describe('the time limits of the regular-expression checks (ADR 0006, amendment of 2026-10-29)', () => {
  // Quadratic on text with no x, and accepted by unsafeRegexReason: 256 KiB of it took 49 s unbounded.
  const slow = { type: 'markdownMatches' as const, pattern: '(?:\\s|\\S)*x' }
  const page = { status: 'success', markdown: 'ab'.repeat(200_000) }

  it('stops a pattern at its 250 ms limit, and judges it not decided', () => {
    const start = performance.now()
    const verification = verify({ checks: [slow] }, page)
    expect(performance.now() - start).toBeLessThan(600)
    expect(verification).toMatchObject({ status: 'failed', reason: 'checks_failed', checks: [{ passed: null, limit: 'time', limitMs: 250 }] })
  })

  it('spends at most a second of one verification on its patterns, and runs none past it', () => {
    const start = performance.now()
    const verification = verify({ checks: Array.from({ length: 6 }, () => slow) }, page)
    expect(performance.now() - start).toBeLessThan(1_400)
    if (verification.status === 'not_requested') throw new Error('unreachable')
    expect(verification.checks.slice(0, 4).map((check) => check.limit)).toEqual(['time', 'time', 'time', 'time'])
    expect(verification.checks.slice(4).map((check) => [check.limit, check.limitMs])).toEqual([['budget', 0], ['budget', 0]])
  })
})
