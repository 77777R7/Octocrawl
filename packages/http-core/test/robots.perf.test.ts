import { describe, it, expect } from 'vitest'
import { compileRule, globMatches } from '../src/robots.js'

describe('globMatches — ReDoS resistance', () => {
  it('adversarial many-star non-matching input completes quickly', () => {
    // 20 stars followed by a literal that cannot match the target's tail
    const pattern = '*'.repeat(20) + 'NOMATCH'
    const target = 'a'.repeat(100)
    const { tokens } = compileRule(pattern, true)
    const start = Date.now()
    const result = globMatches(tokens, target)
    const elapsed = Date.now() - start
    expect(result).toBe(false)
    // Must finish in well under 1 second even on a slow CI machine
    expect(elapsed).toBeLessThan(500)
  })

  it('adversarial many-star matching input returns correct result quickly', () => {
    const pattern = '*'.repeat(20) + 'END'
    const target = 'x'.repeat(50) + 'END'
    const { tokens } = compileRule(pattern, true)
    const start = Date.now()
    const result = globMatches(tokens, target)
    const elapsed = Date.now() - start
    expect(result).toBe(true)
    expect(elapsed).toBeLessThan(500)
  })

  it('1000-star pattern against 10KB non-matching path stays sub-second', () => {
    const pattern = '*'.repeat(1000) + 'NOMATCH'
    const target = 'a'.repeat(10_000)
    const { tokens } = compileRule(pattern, true)
    const start = Date.now()
    const result = globMatches(tokens, target)
    const elapsed = Date.now() - start
    expect(result).toBe(false)
    expect(elapsed).toBeLessThan(1000)
  })
})
