import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FetchResult } from '@w2l/contracts'
import { PageCache, cacheHitResult, cacheMissResult, pageCacheKey, withCacheMiss } from '../src/pageCache.js'

const URL_A = 'https://source.example/a'
const FETCHED = '2026-10-03T08:00:00.000Z'
const T0 = Date.parse(FETCHED)

function result(over: Partial<FetchResult> = {}): FetchResult {
  return {
    requestedUrl: URL_A, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [],
    markdown: '# A', links: [], truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: URL_A, httpStatus: 200, redirectChain: [URL_A], contentType: 'text/html', rawBodySha256: 'a'.repeat(64), artifacts: [], fetchedAt: FETCHED },
    usage: { wallMs: 5, bytesWire: 10, bytesDecompressed: 10, requestCount: 1, attemptCount: 1, contentTokens: 2, browserMs: 0, externalCostUsd: null },
    trace: [{ at: 0, lane: 'http', event: 'identity_sent', detail: { mode: 'standard' } }],
    ...over,
  }
}

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function cacheAt(clock: { now: number }): PageCache {
  const dir = mkdtempSync(join(tmpdir(), 'w2l-page-cache-'))
  dirs.push(dir)
  return PageCache.open(dir, { now: () => clock.now })
}

describe('PageCache', () => {
  it('finds a stored result while its age, measured from the fetch, is within the bounds', () => {
    const clock = { now: T0 + 10_000 }
    const cache = cacheAt(clock)
    expect(cache.store('k', result())).toBe(true)
    expect(cache.lookup('k', { minAgeMs: 0, maxAgeMs: 10_000 })).toMatchObject({ fetchedAt: FETCHED, ageMs: 10_000 })
    expect(cache.lookup('k', { minAgeMs: 0, maxAgeMs: 9_999 })).toBeNull()
    expect(cache.lookup('k', { minAgeMs: 10_001, maxAgeMs: null })).toBeNull()
    expect(cache.lookup('k', { minAgeMs: 5_000, maxAgeMs: null })).not.toBeNull()
    clock.now = T0 + 3_600_000
    expect(cache.lookup('k', { minAgeMs: 0, maxAgeMs: null })?.ageMs).toBe(3_600_000)
    expect(cache.lookup('other', { minAgeMs: 0, maxAgeMs: null })).toBeNull()
    // A fetch time ahead of the clock is age 0, never negative.
    clock.now = T0 - 1_000
    expect(cache.lookup('k', { minAgeMs: 0, maxAgeMs: 0 })?.ageMs).toBe(0)
    cache.close()
  })

  it('stores only a success with a fetch time, keeps the latest per key and leaves its own events out', () => {
    const clock = { now: T0 }
    const cache = cacheAt(clock)
    expect(cache.store('k', result({ status: 'partial' }))).toBe(false)
    expect(cache.store('k', result({ status: 'failed', failureReason: 'http_error' }))).toBe(false)
    expect(cache.store('k', result({ evidence: { ...result().evidence, fetchedAt: null } }))).toBe(false)
    expect(cache.lookup('k', { minAgeMs: 0, maxAgeMs: null })).toBeNull()

    const looked = withCacheMiss(result(), { minAgeMs: 0, maxAgeMs: 1000 })
    expect(cache.store('k', looked)).toBe(true)
    const later = '2026-10-03T09:00:00.000Z'
    expect(cache.store('k', result({ markdown: '# A again', evidence: { ...result().evidence, fetchedAt: later } }))).toBe(true)
    clock.now = Date.parse(later)
    const hit = cache.lookup('k', { minAgeMs: 0, maxAgeMs: null })!
    expect(hit.result.markdown).toBe('# A again')
    expect(hit.result.trace.map(event => event.event)).toEqual(['identity_sent'])
    cache.close()
  })

  it('answers a hit with the stored result unchanged and a cache_hit event at the end of its trace', () => {
    const answered = cacheHitResult({ result: result(), fetchedAt: FETCHED, ageMs: 42 })
    expect(answered).toEqual({ ...result(), trace: [...result().trace, { at: 0, lane: 'http', event: 'cache_hit', detail: { cachedAt: FETCHED, ageMs: 42 } }] })
  })

  it('answers a lockdown miss with a failed result that requested nothing', () => {
    const miss = cacheMissResult(URL_A, { minAgeMs: 0, maxAgeMs: null })
    expect(miss).toMatchObject({ status: 'failed', failureReason: 'cache_miss', markdown: null, evidence: { httpStatus: null }, usage: { requestCount: 0, attemptCount: 0 } })
    expect(miss.trace).toEqual([{ at: 0, lane: 'http', event: 'cache_miss', detail: { lockdown: true, minAgeMs: 0, maxAgeMs: null } }])
  })
})

describe('pageCacheKey', () => {
  it('ignores the fragment and the order of the parts, and tells every other difference apart', () => {
    const key = pageCacheKey(URL_A, { mode: 'standard', fetch: { onlyMainContent: true, includeTags: ['main'] } })
    expect(pageCacheKey(`${URL_A}#top`, { fetch: { includeTags: ['main'], onlyMainContent: true }, mode: 'standard' })).toBe(key)
    expect(pageCacheKey('https://SOURCE.example:443/a', { mode: 'standard', fetch: { onlyMainContent: true, includeTags: ['main'] } })).toBe(key)
    expect(pageCacheKey(URL_A, { mode: 'research', fetch: { onlyMainContent: true, includeTags: ['main'] } })).not.toBe(key)
    expect(pageCacheKey(URL_A, { mode: 'standard', fetch: { onlyMainContent: false, includeTags: ['main'] } })).not.toBe(key)
    expect(pageCacheKey(`${URL_A}?b=1`, { mode: 'standard', fetch: { onlyMainContent: true, includeTags: ['main'] } })).not.toBe(key)
  })
})
