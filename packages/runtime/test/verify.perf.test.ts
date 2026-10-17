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
