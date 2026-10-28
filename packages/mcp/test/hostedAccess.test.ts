import { describe, expect, it } from 'vitest'
import { firestoreHostedAccess, grantedCapabilities, HOSTED_ACCESS_OFF, HOSTED_CHROME_OFF, MemoryHostedAccess } from '../src/hostedAccess.js'

// Hosted Octocrawl's per-request access (ROADMAP stage H item 2): the operator's switch for compatible_transport, off
// until it says otherwise, and who it grants the transport to.

describe('the compatible transport switch', () => {
  const PROJECT = 'octocrawl-test-1'
  const DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/hostedConfig/compatibleTransport`
  const CHROME_DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/hostedConfig/hostedChrome`
  const token = async () => 'service-token'

  it('is off while hostedConfig/compatibleTransport is absent, and after a failed first read; on only for enabled: true', async () => {
    let answer: Response | Error = new Response('{}', { status: 404 })
    const asked: string[] = []
    let t = 0
    // hostedConfig/hostedChrome is absent throughout: this test is about the other switch.
    const access = firestoreHostedAccess(PROJECT, token, (async (input: RequestInfo | URL) => { asked.push(String(input)); if (String(input) === CHROME_DOC) return new Response('{}', { status: 404 }); if (answer instanceof Error) throw answer; return answer.clone() }) as typeof fetch, () => t)
    expect(await access.read()).toEqual(HOSTED_ACCESS_OFF)
    expect(asked).toEqual([DOC, CHROME_DOC])
    answer = new Response(JSON.stringify({ name: DOC, fields: { enabled: { stringValue: 'true' } } }), { status: 200 })
    t += 31_000
    expect((await access.read()).compatibleTransport.enabled).toBe(false)
    answer = new Response(JSON.stringify({ name: DOC, fields: { enabled: { booleanValue: true } } }), { status: 200 })
    // Read at most every 30 s.
    expect((await access.read()).compatibleTransport.enabled).toBe(false)
    t += 31_000
    expect(await access.read()).toEqual({ compatibleTransport: { enabled: true, allowedUids: null }, hostedChrome: HOSTED_CHROME_OFF })
    // A failed read keeps what was read last; so does an answer that is not 200 or 404.
    answer = new Error('network down')
    t += 31_000
    expect((await access.read()).compatibleTransport.enabled).toBe(true)
    answer = new Response('{}', { status: 503 })
    t += 31_000
    expect((await access.read()).compatibleTransport.enabled).toBe(true)
    const unread = firestoreHostedAccess(PROJECT, token, (async () => { throw new Error('network down') }) as typeof fetch)
    expect(await unread.read()).toEqual(HOSTED_ACCESS_OFF)
    expect(() => firestoreHostedAccess('Not A Project', token)).toThrow(/W2L_FIRESTORE_PROJECT_ID/)
  })

  it('reads allowedUids as the accounts it is granted to: an empty list grants it to no one', async () => {
    const read = async (fields: unknown) => (await firestoreHostedAccess(PROJECT, token, (async () => new Response(JSON.stringify({ name: DOC, fields }), { status: 200 })) as typeof fetch).read()).compatibleTransport
    expect(await read({ enabled: { booleanValue: true }, allowedUids: { arrayValue: { values: [{ stringValue: 'account-1' }, { integerValue: '7' }] } } })).toEqual({ enabled: true, allowedUids: ['account-1'] })
    expect(await read({ enabled: { booleanValue: true }, allowedUids: { arrayValue: {} } })).toEqual({ enabled: true, allowedUids: [] })
  })

  it('grants compatible_transport to every caller, or to the accounts listed, and nothing while it is off or absent', async () => {
    expect(await grantedCapabilities(undefined, { uid: 'account-1' })).toEqual([])
    expect(await grantedCapabilities(new MemoryHostedAccess(), { uid: 'account-1' })).toEqual([])
    const everyone = new MemoryHostedAccess({ compatibleTransport: { enabled: true, allowedUids: null } })
    expect(await grantedCapabilities(everyone, {})).toEqual(['compatible_transport'])
    expect(await grantedCapabilities(everyone, { uid: 'account-2' })).toEqual(['compatible_transport'])
    const listed = new MemoryHostedAccess({ compatibleTransport: { enabled: true, allowedUids: ['account-1'] } })
    expect(await grantedCapabilities(listed, { uid: 'account-1' })).toEqual(['compatible_transport'])
    expect(await grantedCapabilities(listed, { uid: 'account-2' })).toEqual([])
    expect(await grantedCapabilities(listed, {})).toEqual([])
    expect(await grantedCapabilities(new MemoryHostedAccess({ compatibleTransport: { enabled: false, allowedUids: ['account-1'] } }), { uid: 'account-1' })).toEqual([])
  })
})

describe('the hosted_chrome account switch (ADR 0005, revision of 2026-10-27; hostedConfig/hostedChrome)', () => {
  const PROJECT = 'octocrawl-test-1'
  const CHROME_DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/hostedConfig/hostedChrome`
  const token = async () => 'service-token'
  /** The switch on for account-1, with both D5 numbers set (test values, not D5's). */
  const ON = { enabled: true, allowedUids: ['account-1'], monthlyCapUsd: 30, dailyAttemptsPerAccount: 50 }
  const compatOff = HOSTED_ACCESS_OFF.compatibleTransport

  it('grants hosted_chrome to a listed account only, while on, with both D5 numbers set; never to a caller without an account', async () => {
    const granted = (hostedChrome: typeof ON | undefined, uid?: string) => grantedCapabilities(new MemoryHostedAccess({ compatibleTransport: compatOff, ...(hostedChrome === undefined ? {} : { hostedChrome }) }), uid === undefined ? {} : { uid })
    expect(await granted(ON, 'account-1')).toEqual(['hosted_chrome'])
    // Keyless callers and keys issued by hand have no account.
    expect(await granted(ON)).toEqual([])
    expect(await granted(ON, '')).toEqual([])
    expect(await granted(ON, 'account-2')).toEqual([])
    // Off, absent, or an allowlist that lists no one.
    expect(await granted(undefined, 'account-1')).toEqual([])
    expect(await granted({ ...ON, enabled: false }, 'account-1')).toEqual([])
    expect(await granted({ ...ON, allowedUids: [] }, 'account-1')).toEqual([])
    // D5's numbers have no default that enables anything: unset, zero or not a number grants it to no one.
    for (const unset of [{ monthlyCapUsd: null }, { monthlyCapUsd: 0 }, { monthlyCapUsd: Number.NaN }, { dailyAttemptsPerAccount: null }, { dailyAttemptsPerAccount: 0 }, { dailyAttemptsPerAccount: 2.5 }]) {
      expect(await granted({ ...ON, ...unset } as typeof ON, 'account-1'), JSON.stringify(unset)).toEqual([])
    }
    // Beside the other switch, each by its own rule.
    expect(await grantedCapabilities(new MemoryHostedAccess({ compatibleTransport: { enabled: true, allowedUids: null }, hostedChrome: ON }), { uid: 'account-1' })).toEqual(['compatible_transport', 'hosted_chrome'])
  })

  it('reads hostedConfig/hostedChrome: off while absent, after a failed first read, or for enabled other than true; at most every 30 s', async () => {
    let answer: Response | Error = new Response('{}', { status: 404 })
    let t = 0
    const access = firestoreHostedAccess(PROJECT, token, (async (input: RequestInfo | URL) => {
      if (String(input) !== CHROME_DOC) return new Response('{}', { status: 404 })
      if (answer instanceof Error) throw answer
      return answer.clone()
    }) as typeof fetch, () => t)
    expect((await access.read()).hostedChrome).toEqual(HOSTED_CHROME_OFF)
    const fields = { enabled: { booleanValue: true }, allowedUids: { arrayValue: { values: [{ stringValue: 'account-1' }] } }, monthlyCapUsd: { doubleValue: 30 }, dailyAttemptsPerAccount: { integerValue: '50' } }
    answer = new Response(JSON.stringify({ name: CHROME_DOC, fields }), { status: 200 })
    expect((await access.read()).hostedChrome).toEqual(HOSTED_CHROME_OFF)
    t += 31_000
    expect((await access.read()).hostedChrome).toEqual(ON)
    // A failed read keeps what was read last.
    answer = new Error('network down')
    t += 31_000
    expect((await access.read()).hostedChrome).toEqual(ON)
    // Anything but enabled: true is off; an absent allowlist lists no one; a number in another shape is unset.
    answer = new Response(JSON.stringify({ name: CHROME_DOC, fields: { enabled: { stringValue: 'true' }, monthlyCapUsd: { stringValue: '30' }, dailyAttemptsPerAccount: { integerValue: 'fifty' } } }), { status: 200 })
    t += 31_000
    expect((await access.read()).hostedChrome).toEqual(HOSTED_CHROME_OFF)
    const unread = firestoreHostedAccess(PROJECT, token, (async () => { throw new Error('network down') }) as typeof fetch)
    expect((await unread.read()).hostedChrome).toEqual(HOSTED_CHROME_OFF)
  })
})
