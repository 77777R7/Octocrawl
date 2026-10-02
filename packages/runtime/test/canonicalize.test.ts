import { describe, expect, it } from 'vitest'
import { canonicalizeUrl, hostOf, visitKey } from '../src/canonicalize.js'

describe('canonicalizeUrl', () => {
  it('collapses tracking params so duplicate-c?utm_source=x matches /duplicate/c', () => {
    expect(canonicalizeUrl('https://fixture.test/duplicate/c?utm_source=x')).toBe(
      'https://fixture.test/duplicate/c',
    )
    expect(canonicalizeUrl('https://fixture.test/duplicate/c?utm_source=x')).toBe(
      canonicalizeUrl('https://fixture.test/duplicate/c'),
    )
  })

  it('does not treat /duplicate/a and /duplicate/c as the same page', () => {
    const a = canonicalizeUrl('https://fixture.test/duplicate/a')
    const c = canonicalizeUrl('https://fixture.test/duplicate/c?utm_source=x')
    expect(a).toBe('https://fixture.test/duplicate/a')
    expect(c).toBe('https://fixture.test/duplicate/c')
    expect(a).not.toBe(c)
  })

  it('lowercases host, drops default ports, fragments, and userinfo', () => {
    expect(canonicalizeUrl('HTTPS://Example.COM:443/Path#frag')).toBe('https://example.com/Path')
    expect(canonicalizeUrl('http://user:pass@example.com:80/x')).toBe('http://example.com/x')
  })

  it('sorts remaining query params and keeps non-tracking ones', () => {
    expect(canonicalizeUrl('https://example.com/x?b=2&a=1&utm_campaign=ad')).toBe(
      'https://example.com/x?a=1&b=2',
    )
  })

  it('drops the whole query with ignoreQuery and keeps the path; without it the sorted query stays', () => {
    expect(canonicalizeUrl('https://example.com/list?page=2&sort=x', undefined, { ignoreQuery: true })).toBe('https://example.com/list')
    expect(canonicalizeUrl('https://example.com/list?page=2&sort=x')).toBe('https://example.com/list?page=2&sort=x')
    expect(canonicalizeUrl('/list?b=1&a=2', 'https://example.com/x', { ignoreQuery: true })).toBe('https://example.com/list')
  })

  it('resolves relative URLs against a base', () => {
    expect(canonicalizeUrl('/duplicate/a', 'https://fixture.test/listing')).toBe(
      'https://fixture.test/duplicate/a',
    )
  })

  it('refuses non-http schemes', () => {
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull()
    expect(canonicalizeUrl('mailto:a@b.test')).toBeNull()
    expect(canonicalizeUrl('file:///etc/passwd')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(canonicalizeUrl('not a url')).toBeNull()
  })
})

describe('hostOf', () => {
  it('reads the host from a canonical URL', () => {
    expect(hostOf('https://shop.example.com/p')).toBe('shop.example.com')
  })
})

describe('visitKey', () => {
  it('folds scheme, www, trailing slash and index file into one key with deduplicateSimilarURLs, and keeps /x/y apart', () => {
    const on = { deduplicateSimilarURLs: true }
    const keys = ['https://www.a.test/x/index.html', 'http://a.test/x/', 'https://a.test/x'].map((url) => visitKey(url, on))
    expect(new Set(keys).size).toBe(1)
    expect(visitKey('https://a.test/x/y', on)).not.toBe(keys[0])
    expect(visitKey('https://www.a.test/', on)).toBe(visitKey('https://a.test/index.php', on))
    // A port, a query and the path's case stay part of the key.
    expect(visitKey('https://a.test:8443/x/', on)).not.toBe(visitKey('https://a.test/x', on))
    expect(visitKey('https://a.test/x?b=1', on)).not.toBe(visitKey('https://a.test/x', on))
    expect(visitKey('https://a.test/X', on)).not.toBe(visitKey('https://a.test/x', on))
  })

  it('is the canonical URL itself when the option is off', () => {
    expect(visitKey('https://www.a.test/x/')).toBe('https://www.a.test/x/')
    expect(visitKey('https://www.a.test/x/', {})).toBe('https://www.a.test/x/')
  })
})
