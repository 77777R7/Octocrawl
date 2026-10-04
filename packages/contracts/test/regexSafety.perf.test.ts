import { describe, expect, it } from 'vitest'
import { REGEX_SUBJECT_MAX_LENGTH, unsafeRegexReason } from '../src/index.js'

describe('unsafeRegexReason', () => {
  it('stays fast on its largest inputs', () => {
    const started = performance.now()
    for (const pattern of ['('.repeat(999) + 'a' + ')'.repeat(999), '[^/]*'.repeat(400), `(?:${Array.from({ length: 660 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|')})+`]) unsafeRegexReason(pattern)
    expect(performance.now() - started).toBeLessThan(500)
    expect(REGEX_SUBJECT_MAX_LENGTH).toBe(2048)
  })
})
