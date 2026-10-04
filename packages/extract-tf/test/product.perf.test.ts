import { describe, expect, it } from 'vitest'
import { looksLikePrice } from '../src/index.js'

describe('price shape', () => {
  it('terminates promptly on adversarial input', () => {
    // The matcher runs over attacker-supplied page text; an unbounded
    // quantifier here is the same class of bug as a ReDoS in the robots
    // matcher. Bounded quantifiers must keep this linear.
    const hostile = '$' + '1'.repeat(50_000) + ',' + '9'.repeat(50_000) + 'x'
    const start = process.hrtime.bigint()
    looksLikePrice(hostile)
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    expect(ms).toBeLessThan(200)
  })
})
