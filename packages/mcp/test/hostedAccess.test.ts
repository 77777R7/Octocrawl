import { describe, expect, it } from 'vitest'
import { firestoreHostedAccess, grantedCapabilities, HOSTED_ACCESS_OFF, MemoryHostedAccess } from '../src/hostedAccess.js'

// Hosted Octocrawl's per-request access (ROADMAP stage H item 2): the operator's switch for compatible_transport, off
// until it says otherwise, and who it grants the transport to.

describe('the compatible transport switch', () => {
  const PROJECT = 'octocrawl-test-1'
  const DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/hostedConfig/compatibleTransport`
  const token = async () => 'service-token'

  it('is off while hostedConfig/compatibleTransport is absent, and after a failed first read; on only for enabled: true', async () => {
    let answer: Response | Error = new Response('{}', { status: 404 })
    const asked: string[] = []
    let t = 0
    const access = firestoreHostedAccess(PROJECT, token, (async (input: RequestInfo | URL) => { asked.push(String(input)); if (answer instanceof Error) throw answer; return answer.clone() }) as typeof fetch, () => t)
    expect(await access.read()).toEqual(HOSTED_ACCESS_OFF)
    expect(asked).toEqual([DOC])
    answer = new Response(JSON.stringify({ name: DOC, fields: { enabled: { stringValue: 'true' } } }), { status: 200 })
    t += 31_000
    expect((await access.read()).compatibleTransport.enabled).toBe(false)
    answer = new Response(JSON.stringify({ name: DOC, fields: { enabled: { booleanValue: true } } }), { status: 200 })
    // Read at most every 30 s.
    expect((await access.read()).compatibleTransport.enabled).toBe(false)
    t += 31_000
    expect(await access.read()).toEqual({ compatibleTransport: { enabled: true, allowedUids: null } })
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
    const read = async (fields: unknown) => firestoreHostedAccess(PROJECT, token, (async () => new Response(JSON.stringify({ name: DOC, fields }), { status: 200 })) as typeof fetch).read()
    expect(await read({ enabled: { booleanValue: true }, allowedUids: { arrayValue: { values: [{ stringValue: 'account-1' }, { integerValue: '7' }] } } })).toEqual({ compatibleTransport: { enabled: true, allowedUids: ['account-1'] } })
    expect(await read({ enabled: { booleanValue: true }, allowedUids: { arrayValue: {} } })).toEqual({ compatibleTransport: { enabled: true, allowedUids: [] } })
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
