import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { MemoryHostedAccess, type HostedChromeSwitch } from '../src/hostedAccess.js'
import { MemoryHostedQuota } from '../src/hostedApi.js'
import { FirestoreHostedChromeSpend, HOSTED_CHROME_REFUSALS, HostedChromeCounter, MemoryHostedChromeSpend } from '../src/hostedChromeMeter.js'

/**
 * D5 counting for hosted_chrome (ADR 0005, revision of 2026-10-27): the switch's monthlyCapUsd against the operator's
 * month of hosted_chrome spend, its fixed rents settled first, and dailyAttemptsPerAccount per account and UTC day.
 */

const ON: HostedChromeSwitch = { enabled: true, allowedUids: ['account-1', 'account-2'], monthlyCapUsd: 20.02, dailyAttemptsPerAccount: 2 }
/** A datacenter plan: 10 IPs at $2 a month, and $0.50 a GB with at most 20 MB a call, so a call's ceiling is $0.01. */
const DATACENTER = { vendor: 'datacenter', tariff: { perIpMonthUsd: 2, rentedIps: 10, perGbUsd: 0.5, maxBytesPerCall: 20_000_000 } }
const NOW = new Date('2026-10-29T12:00:00Z')

function read(status: FetchResult['status'] = 'success', vendorProxyBytes?: number | null): FetchResult {
  return {
    requestedUrl: 'https://shop.test/item', status, failureReason: null, blockReason: null, budgetExceeded: null, lane: 'browser_local',
    escalations: [], handoff: null, markdown: '# Item', truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: 'https://shop.test/item', httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 4_000, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, browserMs: 4_000, externalCostUsd: null, ...(vendorProxyBytes === undefined ? {} : { vendorProxyBytes }) },
    trace: [],
  }
}

function counter(hostedChrome: HostedChromeSwitch = ON, options: { egress?: typeof DATACENTER | null; spend?: MemoryHostedChromeSpend; quota?: MemoryHostedQuota; now?: () => Date } = {}) {
  const lines: string[] = []
  const spend = options.spend ?? new MemoryHostedChromeSpend()
  const quota = options.quota ?? new MemoryHostedQuota()
  const meter = new HostedChromeCounter({
    settings: new MemoryHostedAccess({ compatibleTransport: { enabled: false, allowedUids: null }, hostedChrome }),
    spend, quota, egress: options.egress === undefined ? DATACENTER : options.egress, log: (line) => lines.push(line), now: options.now ?? (() => NOW),
  })
  return { meter, spend, quota, lines }
}

describe('hosted_chrome D5 counting', () => {
  it('admits a call within both limits, takes one of the account\'s attempts for the UTC day, and counts what it settled', async () => {
    const { meter, spend, quota } = counter()
    const admission = await meter.admit({ account: 'account-1' })
    expect(admission.ok).toBe(true)
    expect(quota.counts.get('2026-10-29-hostedChrome-account-1')).toBe(1)
    // Reserved, not settled: the month counts nothing until the call settles.
    expect(spend.months.get('2026-10')).toBeUndefined()
    if (admission.ok) await admission.settle(read('success', 4_000_000), true)
    // 4 MB at $0.50 a GB.
    expect(spend.months.get('2026-10')).toEqual({ settledMicroUsd: 2_000, calls: 1 })
  })

  it('charges a read whose bytes it was not told at the ceiling\'s allowance, a read that threw at the ceiling, and a call that never went out nothing', async () => {
    const { meter, spend } = counter({ ...ON, monthlyCapUsd: 30, dailyAttemptsPerAccount: 5 })
    const unmeasured = await meter.admit({ account: 'account-1' })
    if (unmeasured.ok) await unmeasured.settle(read('success', null), true)
    const threw = await meter.admit({ account: 'account-1' })
    if (threw.ok) await threw.settle(null, true)
    expect(spend.months.get('2026-10')).toEqual({ settledMicroUsd: 20_000, calls: 2 })
    const never = await meter.admit({ account: 'account-1' })
    expect(never.ok).toBe(true)
    if (never.ok) await never.settle(null, false)
    expect(spend.months.get('2026-10')).toEqual({ settledMicroUsd: 20_000, calls: 2 })
  })

  it('refuses a call past the account\'s attempts for the UTC day, and admits it again the next day', async () => {
    let now = NOW
    const { meter, lines } = counter({ ...ON, monthlyCapUsd: 30 }, { now: () => now })
    expect((await meter.admit({ account: 'account-1' })).ok).toBe(true)
    expect((await meter.admit({ account: 'account-1' })).ok).toBe(true)
    expect(await meter.admit({ account: 'account-1' })).toEqual({ ok: false, reason: 'daily_attempts', message: HOSTED_CHROME_REFUSALS.dailyAttempts(2), detail: { limit: 2, day: '2026-10-29' } })
    // Another account has its own attempts.
    expect((await meter.admit({ account: 'account-2' })).ok).toBe(true)
    now = new Date('2026-10-30T00:00:01Z')
    expect((await meter.admit({ account: 'account-1' })).ok).toBe(true)
    expect(lines.some((line) => line.includes('"event":"hosted_chrome_attempts_reached"'))).toBe(true)
  })

  it('refuses a call whose ceiling does not fit what the monthly cap leaves after the month\'s rents and settled calls, taking no attempt', async () => {
    const spend = new MemoryHostedChromeSpend()
    // $20 of rent and $0.01 settled leave $0.01 of a $20.02 cap: one more call's ceiling fits, not two.
    spend.months.set('2026-10', { settledMicroUsd: 10_000, calls: 1 })
    const { meter, quota } = counter({ ...ON, dailyAttemptsPerAccount: 10 }, { spend })
    const first = await meter.admit({ account: 'account-1' })
    expect(first.ok).toBe(true)
    // In flight on this instance: its ceiling is held until it settles.
    expect(await meter.admit({ account: 'account-1' })).toEqual({ ok: false, reason: 'monthly_cap', message: HOSTED_CHROME_REFUSALS.monthlyCap(20.02), detail: { capUsd: 20.02, fixedMonthlyUsd: 20, settledUsd: 0.01, inFlightUsd: 0.01, ceilingUsd: 0.01, month: '2026-10' } })
    expect(quota.counts.get('2026-10-29-hostedChrome-account-1')).toBe(1)
    if (first.ok) await first.settle(null, false)
    expect((await meter.admit({ account: 'account-1' })).ok).toBe(true)
    // A cap below the rents alone admits nothing.
    const { meter: under } = counter({ ...ON, monthlyCapUsd: 19 })
    expect(await under.admit({ account: 'account-1' })).toMatchObject({ ok: false, reason: 'monthly_cap' })
  })

  it('a new month starts from its rents again', async () => {
    const spend = new MemoryHostedChromeSpend()
    spend.months.set('2026-10', { settledMicroUsd: 20_000, calls: 2 })
    let now = NOW
    const { meter } = counter(ON, { spend, now: () => now })
    expect(await meter.admit({ account: 'account-1' })).toMatchObject({ ok: false, reason: 'monthly_cap' })
    now = new Date('2026-11-01T00:00:00Z')
    expect((await meter.admit({ account: 'account-1' })).ok).toBe(true)
  })

  it('refuses every call while the switch does not grant the account, a D5 number is unset, or there is no account, taking nothing', async () => {
    for (const [hostedChrome, account] of [[{ ...ON, enabled: false }, 'account-1'], [ON, 'account-3'], [{ ...ON, monthlyCapUsd: null }, 'account-1'], [{ ...ON, dailyAttemptsPerAccount: null }, 'account-1'], [ON, undefined]] as const) {
      const { meter, quota } = counter(hostedChrome)
      expect(await meter.admit({ account }), JSON.stringify([hostedChrome, account])).toEqual({ ok: false, reason: 'switched_off', message: HOSTED_CHROME_REFUSALS.switchedOff })
      expect(quota.counts.size).toBe(0)
    }
  })

  it('refuses a call when it cannot read the month\'s spend or take an attempt: unread is not zero', async () => {
    const spend = new MemoryHostedChromeSpend()
    spend.settledMicro = async () => { throw new Error('firestore is down') }
    const { meter, lines } = counter(ON, { spend })
    expect(await meter.admit({ account: 'account-1' })).toEqual({ ok: false, reason: 'budget_unread', message: HOSTED_CHROME_REFUSALS.budgetUnread })
    const quota = new MemoryHostedQuota()
    quota.consume = async () => { throw new Error('firestore is down') }
    const { meter: noQuota } = counter(ON, { quota })
    expect(await noQuota.admit({ account: 'account-1' })).toEqual({ ok: false, reason: 'budget_unread', message: HOSTED_CHROME_REFUSALS.budgetUnread })
    expect(lines.some((line) => line.includes('"event":"hosted_chrome_budget_failed"'))).toBe(true)
  })

  it('with Cloud Run\'s own egress (no tariff), a call costs no third party: settled at 0, still counted', async () => {
    const { meter, spend } = counter(ON, { egress: null })
    const admission = await meter.admit({ account: 'account-1' })
    if (admission.ok) await admission.settle(read(), true)
    expect(spend.months.get('2026-10')).toEqual({ settledMicroUsd: 0, calls: 1 })
  })

  it('refuses an egress tariff whose ceiling is unbounded or malformed, before any call', () => {
    const settings = new MemoryHostedAccess()
    const base = { settings, spend: new MemoryHostedChromeSpend(), quota: new MemoryHostedQuota() }
    expect(() => new HostedChromeCounter({ ...base, egress: { vendor: 'datacenter', tariff: { perGbUsd: 0.5 } } })).toThrow(/maxBytesPerCall/)
    expect(() => new HostedChromeCounter({ ...base, egress: { vendor: 'datacenter', tariff: { perIpMonthUsd: 2 } } })).toThrow(/rentedIps/)
    expect(() => new HostedChromeCounter({ ...base, egress: undefined as never })).toThrow(/egress/)
  })
})

describe('hosted_chrome spend in Firestore', () => {
  const token = async () => 'token'
  const DOC = 'projects/octo-test-1/databases/(default)/documents/hostedChromeSpend/2026-10'

  it('reads the month\'s settled spend, zero while the month has none', async () => {
    const calls: string[] = []
    const store = new FirestoreHostedChromeSpend('octo-test-1', token, async (url) => {
      calls.push(String(url))
      return calls.length === 1 ? new Response('{}', { status: 404 }) : Response.json({ name: DOC, updateTime: '2026-10-29T00:00:00Z', fields: { settledMicroUsd: { integerValue: '12345' } } })
    })
    expect(await store.settledMicro('2026-10')).toBe(0)
    expect(await store.settledMicro('2026-10')).toBe(12_345)
    expect(calls[0]).toBe(`https://firestore.googleapis.com/v1/${DOC}`)
    await expect(new FirestoreHostedChromeSpend('octo-test-1', token, async () => new Response('{}', { status: 500 })).settledMicro('2026-10')).rejects.toThrow(/read failed/)
    await expect(store.settledMicro('2026-1')).rejects.toThrow(/month/)
  })

  it('adds a settled call as server-side increments, with the month\'s expiry for TTL', async () => {
    let body: { writes: unknown[] } | null = null
    const store = new FirestoreHostedChromeSpend('octo-test-1', token, async (url, init) => {
      expect(String(url)).toBe('https://firestore.googleapis.com/v1/projects/octo-test-1/databases/(default)/documents:commit')
      body = JSON.parse(String(init?.body)) as { writes: unknown[] }
      return Response.json({ writeResults: [{}] })
    })
    await store.settle('2026-10', 2_000)
    expect(body).toEqual({ writes: [{
      update: { name: DOC, fields: { month: { stringValue: '2026-10' }, expireAt: { timestampValue: '2027-01-30T00:00:00.000Z' } } },
      updateMask: { fieldPaths: ['month', 'expireAt'] },
      updateTransforms: [{ fieldPath: 'settledMicroUsd', increment: { integerValue: '2000' } }, { fieldPath: 'calls', increment: { integerValue: '1' } }],
    }] })
    await expect(store.settle('2026-10', 1.5)).rejects.toThrow(/malformed/)
  })
})
