import { describe, expect, it } from 'vitest'
import { sourceDataWarnings, SOURCE_DATA_MAX_CHARS } from '../src/subjects/sourceData.js'

describe('publisher data scan bounds', () => {
  it('bounds a near-limit malformed declaration and skips larger input', () => {
    const prefix = '<script id="__NEXT_DATA__" type="application/json">'
    const html = prefix + ' '.repeat(SOURCE_DATA_MAX_CHARS - prefix.length - 9) + '</script>'
    sourceDataWarnings(html, 'https://www.walmart.com/browse/a/b')
    const start = performance.now()
    for (let i = 0; i < 5; i++) expect(sourceDataWarnings(html, 'https://www.walmart.com/browse/a/b')).toEqual([])
    expect(performance.now() - start).toBeLessThan(500)
    expect(sourceDataWarnings(html + 'x', 'https://www.walmart.com/browse/a/b')).toEqual([])
  })
})
