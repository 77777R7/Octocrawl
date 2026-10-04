import { describe, expect, it } from 'vitest'
import { unsafeRegexReason } from '../src/index.js'

describe('unsafeRegexReason', () => {
  it('refuses nested quantifiers, overlapping repeated alternatives and long overlapping runs', () => {
    const nested = 'a repeated group has a repeated or optional part inside and no separator that part cannot match'
    const alternatives = 'a repeated group has alternatives that can start with the same character'
    const run = 'three or more parts in a row can take the same characters, so a failing match retries them against each other'
    for (const pattern of ['^/(a+)+$', '(a*)*', '(\\w+\\s?)+', '(.*,)*', '((ab)*)+', '(a+){10}', '^/(?!x)(a+)+$']) expect(unsafeRegexReason(pattern), pattern).toBe(nested)
    for (const pattern of ['(a|a)*', '(a|ab)+', '(\\d|\\w)+']) expect(unsafeRegexReason(pattern), pattern).toBe(alternatives)
    for (const pattern of ['.*a.*b', '^.*a.*a.*b', '^\\d+\\d+\\d+x', `^${'a?'.repeat(30)}${'a'.repeat(30)}$`, '^(?:.*a)(?:.*a)(?:.*b)']) expect(unsafeRegexReason(pattern), pattern).toBe(run)
  })

  it('accepts separated repetition, distinct alternatives, anchored runs and lookaround', () => {
    for (const pattern of [
      '^[a-z0-9]+(?:-[a-z0-9]+)*$', '^(\\d+)(?:\\.\\d+)*$', '(?:ab|cd)+', '(?:[a-z]|-)+', '(?:\\d{3}-){2}\\d{4}',
      '^.*a.*b', '.*\\.pdf$', '.*blog.*', '^/docs/v[0-9]+/.*', '^/catalogue/(?!category/)[^/]+/index\\.html$', '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
    ]) expect(unsafeRegexReason(pattern), pattern).toBeNull()
  })
})
