import { describe, expect, it } from 'vitest'
import { hostedRegexChecksFromEnv } from '../src/hostedRegex.js'

// The operator's switch for the regular-expression checks on hosted Octocrawl (ADR 0006, amendment of 2026-10-29): on
// only with W2L_HOSTED_REGEX_CHECKS=1 and a self-test that passed. A stand-in self-test here; the real one is
// packages/runtime/test/regexSelfTest.perf.test.ts's.
describe('W2L_HOSTED_REGEX_CHECKS', () => {
  const passing = () => { runs++; return { ok: true, failures: [] } }
  let runs = 0

  it('leaves the checks off, without the self-test, when unset, empty or 0', () => {
    runs = 0
    for (const env of [{}, { W2L_HOSTED_REGEX_CHECKS: '' }, { W2L_HOSTED_REGEX_CHECKS: '0' }, { W2L_HOSTED_REGEX_CHECKS: ' 0 ' }]) {
      expect(hostedRegexChecksFromEnv(env, passing), JSON.stringify(env)).toEqual({ enabled: false, failures: [] })
    }
    expect(runs).toBe(0)
  })

  it('switches them on at 1 when the self-test passes, and leaves them off with its failures when it does not', () => {
    runs = 0
    expect(hostedRegexChecksFromEnv({ W2L_HOSTED_REGEX_CHECKS: '1' }, passing)).toEqual({ enabled: true, failures: [] })
    expect(hostedRegexChecksFromEnv({ W2L_HOSTED_REGEX_CHECKS: ' 1\n' }, passing)).toEqual({ enabled: true, failures: [] })
    expect(runs).toBe(2)
    const failing = () => ({ ok: false, failures: ['a quadratic scan stopped 900 ms after its 50 ms limit'] })
    expect(hostedRegexChecksFromEnv({ W2L_HOSTED_REGEX_CHECKS: '1' }, failing)).toEqual({ enabled: false, failures: ['a quadratic scan stopped 900 ms after its 50 ms limit'] })
  })

  it('stops the start at any other value, naming the variable', () => {
    for (const value of ['true', 'yes', 'on', '2', '1,0']) {
      expect(() => hostedRegexChecksFromEnv({ W2L_HOSTED_REGEX_CHECKS: value }, passing), value).toThrow(/^W2L_HOSTED_REGEX_CHECKS must be 1 \(on\), or 0 or unset \(off\)$/)
    }
  })
})
