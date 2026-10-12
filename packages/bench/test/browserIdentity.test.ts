import { describe, expect, it } from 'vitest'
import { browserIdentityChoice } from '../src/subjects/browserIdentity.js'

describe('browserIdentityChoice (W2L_BROWSER_IDENTITY)', () => {
  it('is the declared identity unless the environment asks for the browser\'s own', () => {
    expect(browserIdentityChoice({})).toBe('declared')
    expect(browserIdentityChoice({ W2L_BROWSER_IDENTITY: '' })).toBe('declared')
    expect(browserIdentityChoice({ W2L_BROWSER_IDENTITY: ' Declared ' })).toBe('declared')
    expect(browserIdentityChoice({ W2L_BROWSER_IDENTITY: 'actual' })).toBe('actual')
  })

  it('refuses another value, and the actual identity on a hosted server', () => {
    expect(() => browserIdentityChoice({ W2L_BROWSER_IDENTITY: 'honest' })).toThrow('W2L_BROWSER_IDENTITY is declared or actual, not honest')
    expect(() => browserIdentityChoice({ W2L_BROWSER_IDENTITY: 'actual' }, true)).toThrow('refused on a hosted server')
    expect(browserIdentityChoice({ W2L_BROWSER_IDENTITY: 'declared' }, true)).toBe('declared')
  })
})
