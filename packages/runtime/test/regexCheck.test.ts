import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import type { VerifyCheck } from '@w2l/contracts'
import { currentRegexLedger, REGEX_SCAN_LIMIT_MS, RegexPool, scanRegex, withRegexLedger, type RegexLedger, type RegexStats } from '../src/regexCheck.js'
import { verify } from '../src/verify.js'

// Quadratic on text without the letter they end with, so every scan stops at its 250 ms limit; distinct, so none is reused.
const slowFor = (letter: string): VerifyCheck => ({ type: 'markdownMatches', pattern: `(?:\\s|\\S)*${letter}` })
const slow = slowFor('x')
const slowPage = { status: 'success', markdown: 'ab'.repeat(200_000) }
const limits = (verification: ReturnType<typeof verify>): unknown[] => verification.status === 'not_requested' ? [] : verification.checks.map((check) => check.limit ?? null)

describe("a request's regular-expression ledger (ADR 0006, amendment of 2026-10-29)", () => {
  it('shares one steering pool among the partial judgements of a request, and gives each final judgement its own', async () => {
    let stats: RegexStats | undefined
    await withRegexLedger(async () => {
      expect(limits(verify({ checks: ['x', 'y', 'z', 'w', 'v'].map(slowFor) }, slowPage, { partial: true }))).toEqual(['time', 'time', 'time', 'time', 'budget'])
      // The steering pool is spent: a later read of the same request is not judged at all, and says why.
      const later = verify({ checks: [slowFor('u')] }, slowPage, { partial: true })
      expect(later).toMatchObject({ status: 'failed', checks: [{ passed: null, limit: 'budget', limitMs: 0, observed: "not judged: this request's 1000 ms for regular expressions on partial views was spent" }] })
      // The final judgement has a pool of its own: it replays the remembered scan, stopped at the same limit.
      expect(limits(verify({ checks: [slow] }, slowPage))).toEqual(['time'])
    }, (closed) => { stats = closed })
    // Four scans ran for the steering judgements (the fifth found no time), none for the later read or the final one.
    expect(stats).toMatchObject({ scans: 4, memoHits: 1, limited: 7 })
    // Outside any request, a partial judgement gets a pool of its own, as before.
    expect(limits(verify({ checks: [slow] }, slowPage, { partial: true }))).toEqual(['time'])
  })

  it('reuses a scan of the same text, and gives a final judgement the verdict a fresh one gives', async () => {
    const contract = { checks: [{ type: 'markdownCountMin' as const, pattern: '\\d\\d:\\d\\d', min: 2 }] }
    const page = { status: 'success', markdown: 'High water at 06:12, low water at 12:30.' }
    let stats: RegexStats | undefined
    const final = await withRegexLedger(async () => {
      verify(contract, page, { partial: true })
      return verify(contract, page)
    }, (closed) => { stats = closed })
    expect(stats).toMatchObject({ scans: 1, memoHits: 1, limited: 0 })
    expect(final).toEqual(verify(contract, page))
  })

  it('never reuses a scan the engine could not run', async () => {
    const overflowing = { status: 'success', markdown: 'a'.repeat(4_300_000) }
    let stats: RegexStats | undefined
    await withRegexLedger(async () => {
      verify({ checks: [{ type: 'markdownMatches', pattern: '^(a)*$' }] }, overflowing, { partial: true })
      expect(limits(verify({ checks: [{ type: 'markdownMatches', pattern: '^(a)*$' }] }, overflowing))).toEqual(['error'])
    }, (closed) => { stats = closed })
    expect(stats).toMatchObject({ scans: 2, memoHits: 0 })
  })

  it('follows a request through its awaits and timers, and keeps two requests apart', async () => {
    const seen: RegexStats[] = []
    const request = (checks: number) => withRegexLedger(async () => {
      const ledger = currentRegexLedger()
      for (let i = 0; i < checks; i++) {
        await sleep(1)
        await new Promise((resolve) => setImmediate(resolve))
        expect(currentRegexLedger()).toBe(ledger)
        verify({ checks: [{ type: 'markdownIncludes', text: 'x' }, { type: 'markdownMatches', pattern: `read ${i}` }] }, { status: 'success', markdown: `read ${i}` }, { partial: true })
      }
    }, (stats) => { seen.push(stats) })
    await Promise.all([request(3), request(5)])
    expect(seen.map((stats) => stats.scans).sort()).toEqual([3, 5])
    expect(currentRegexLedger()).toBeUndefined()
  })

  it('tells nothing to a request that ran no regular-expression check', async () => {
    let closed = 0
    await withRegexLedger(async () => { verify({ checks: [{ type: 'markdownIncludes', text: 'a' }] }, { status: 'success', markdown: 'a' }) }, () => { closed++ })
    expect(closed).toBe(0)
  })
})

describe('a pool (ADR 0006, amendment of 2026-10-29)', () => {
  it('is charged the whole limit of a scan the engine stopped there, though this process measured it shorter', () => {
    // vm's watchdog keeps whole milliseconds of a clock of its own, and can stop a scan up to a millisecond before
    // performance.now() says its limit has passed: four stops at 250 ms once measured under 999 ms on CI, and the fifth
    // check of the verification ran on the 1 ms that seemed left, stopped at it, instead of finding the pool spent.
    const pool = new RegexPool(REGEX_SCAN_LIMIT_MS)
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(REGEX_SCAN_LIMIT_MS - 2)
    try {
      expect(scanRegex('test', '(?:\\s|\\S)*x', 'm', slowPage.markdown, pool)).toEqual({ done: false, limit: 'time', limitMs: REGEX_SCAN_LIMIT_MS })
    } finally { clock.mockRestore() }
    expect(scanRegex('test', '(?:\\s|\\S)*y', 'm', slowPage.markdown, pool)).toEqual({ done: false, limit: 'budget', limitMs: 0 })
  })
})

describe('a closed ledger', () => {
  it('lets go of the texts its scans remembered once the request ends', async () => {
    let ledger: RegexLedger | undefined
    const text = 'ab'.repeat(1_000)
    await withRegexLedger(async () => {
      ledger = currentRegexLedger()
      verify({ checks: [{ type: 'markdownMatches', pattern: 'b' }] }, { status: 'success', markdown: text }, { partial: true })
    })
    // Something the request made (a pooled socket, a timer) can keep its store, and so its ledger, reachable: the texts
    // its scans remembered are gone, so the same scan runs again rather than being reused.
    ledger!.scan('test', 'b', 'm', text, new RegexPool(1_000), false)
    expect(ledger!.stats).toMatchObject({ scans: 2, memoHits: 0 })
  })
})
