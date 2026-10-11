import { describe, expect, it } from 'vitest'
import { FirestoreCreditsStore, mapCharge, MemoryCreditsStore, scrapeCharge, secondsToNextGrant } from '../src/hostedCredits.js'

const SITE = { id: '2026-10-11-site', limit: 100 }
const OCT = new Date('2026-10-11T08:00:00Z')

describe('what a result costs', () => {
  it('charges a page by the lane that read it, a page that does not exist one credit, and anything unread nothing', () => {
    expect(scrapeCharge({ status: 'success', lane: 'http' })).toEqual({ credits: 1, kind: 'http' })
    expect(scrapeCharge({ status: 'partial', lane: 'http' })).toEqual({ credits: 1, kind: 'http' })
    expect(scrapeCharge({ status: 'empty_verified', lane: 'http' })).toEqual({ credits: 1, kind: 'http' })
    expect(scrapeCharge({ status: 'success', lane: 'browser_local' })).toEqual({ credits: 5, kind: 'browser' })
    expect(scrapeCharge({ status: 'failed', failureReason: 'http_error', lane: 'http', evidenceRecord: { httpStatus: 404 } })).toEqual({ credits: 1, kind: 'not_found' })
    expect(scrapeCharge({ status: 'failed', failureReason: 'http_error', lane: 'http', snapshot: { httpStatus: 410 } })).toEqual({ credits: 1, kind: 'not_found' })
    // Stopped by a check, a challenge or robots.txt, or nothing read at all: free.
    for (const result of [
      { status: 'blocked', lane: 'http', evidenceRecord: { httpStatus: 403 } },
      { status: 'failed', failureReason: 'policy_denied', lane: 'http', evidenceRecord: { httpStatus: null } },
      { status: 'failed', failureReason: 'http_error', lane: 'http', evidenceRecord: { httpStatus: 500 } },
      { status: 'failed', failureReason: 'dns_error', lane: 'http' },
      { status: 'failed', failureReason: 'timeout', lane: 'browser_local' },
      { status: 'cancelled', lane: 'http' },
      {},
    ]) expect(scrapeCharge(result), JSON.stringify(result)).toEqual({ credits: 0, kind: 'unread' })
    expect(mapCharge({ status: 'completed' })).toEqual({ credits: 1, kind: 'map' })
    expect(mapCharge({ status: 'partial' })).toEqual({ credits: 1, kind: 'map' })
    expect(mapCharge({ status: 'failed' })).toEqual({ credits: 0, kind: 'unread' })
  })

  it('counts the time to the next grant to 00:00 UTC on the 1st', () => {
    expect(secondsToNextGrant(new Date('2026-10-31T23:59:30Z'))).toBe(30)
    expect(secondsToNextGrant(new Date('2026-12-31T23:00:00Z'))).toBe(3600)
  })
})

describe('the in-memory ledger', () => {
  it('spends the monthly grant, gives back what a call did not cost, and refuses past the balance', async () => {
    const store = new MemoryCreditsStore(10)
    const first = await store.reserve('account-1', 5, SITE, OCT)
    expect(first).toMatchObject({ ok: true, reservation: { fromGrant: 5, fromPurchased: 0, remaining: 5 } })
    if (!first.ok) throw new Error('unreachable')
    expect(await store.settle(first.reservation, 1, 'http', OCT)).toEqual({ remaining: 9 })
    for (let i = 0; i < 9; i++) expect((await store.reserve('account-1', 1, SITE, OCT)).ok).toBe(true)
    expect(await store.reserve('account-1', 1, SITE, OCT)).toEqual({ ok: false, limited: 'credits', remaining: 0 })
    expect(store.usage.get('account-1-2026-10-11')).toEqual({ http: 1, browser: 0, not_found: 0, map: 0, unread: 0, credits: 1 })
  })

  it('renews the grant in a new month without rolling the old one over, and spends it before bought credits', async () => {
    const store = new MemoryCreditsStore(10)
    store.balances.set('account-1', { month: '2026-09', grant: 3, purchased: 4 })
    const reserved = await store.reserve('account-1', 12, SITE, OCT)
    expect(reserved).toMatchObject({ ok: true, reservation: { month: '2026-10', fromGrant: 10, fromPurchased: 2, remaining: 2 } })
    if (!reserved.ok) throw new Error('unreachable')
    // A refund goes to the bought credits first, and never lifts the grant past what was taken from it.
    expect(await store.settle(reserved.reservation, 9, 'browser', OCT)).toEqual({ remaining: 5 })
    expect(store.balances.get('account-1')).toEqual({ month: '2026-10', grant: 1, purchased: 4 })
  })

  it('refuses when the site has served its day, taking nothing from the account', async () => {
    const store = new MemoryCreditsStore(10)
    store.site.set(SITE.id, SITE.limit)
    expect(await store.reserve('account-1', 1, SITE, OCT)).toEqual({ ok: false, limited: 'site', limit: 100 })
    expect(store.balances.has('account-1')).toBe(false)
  })
})

/** A Firestore REST stand-in: documents with update times, commits checked against their preconditions. */
function fakeFirestore() {
  const resource = 'projects/octocrawl-test/databases/(default)/documents'
  const docs = new Map<string, { fields: Record<string, Record<string, string>>; updateTime: string }>()
  const commits: unknown[] = []
  let clock = 0
  let conflicts = 0
  const tick = () => `2026-10-11T00:00:${String(++clock).padStart(2, '0')}Z`
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith(':commit')) {
      const body = JSON.parse(String(init?.body)) as { writes: Array<{ update: { name: string; fields: Record<string, Record<string, string>> }; updateMask?: { fieldPaths: string[] }; updateTransforms?: Array<{ fieldPath: string; increment: { integerValue: string } }>; currentDocument?: { exists?: boolean; updateTime?: string } }> }
      commits.push(body)
      if (conflicts > 0) { conflicts--; return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 }) }
      for (const write of body.writes) {
        const existing = docs.get(write.update.name)
        const pre = write.currentDocument
        if (pre?.exists === false && existing) return new Response('{}', { status: 409 })
        if (pre?.exists === true && !existing) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 })
        if (pre?.updateTime !== undefined && existing?.updateTime !== pre.updateTime) return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 })
      }
      const writeResults = body.writes.map((write) => {
        const doc = docs.get(write.update.name) ?? { fields: {}, updateTime: '' }
        const fields = write.updateMask === undefined ? { ...write.update.fields } : { ...doc.fields, ...Object.fromEntries(write.updateMask.fieldPaths.map((path) => [path, write.update.fields[path]!])) }
        const transformResults = (write.updateTransforms ?? []).map((transform) => {
          const value = String(Number(fields[transform.fieldPath]?.integerValue ?? 0) + Number(transform.increment.integerValue))
          fields[transform.fieldPath] = { integerValue: value }
          return { integerValue: value }
        })
        docs.set(write.update.name, { fields, updateTime: tick() })
        return { transformResults }
      })
      return new Response(JSON.stringify({ writeResults }), { status: 200 })
    }
    const name = decodeURI(url.replace('https://firestore.googleapis.com/v1/', ''))
    const doc = docs.get(name)
    if (!doc) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify({ name, fields: doc.fields, updateTime: doc.updateTime }), { status: 200 })
  }) as typeof fetch
  return { resource, docs, commits, fetcher, conflictOnce: () => { conflicts = 1 } }
}

describe('the Firestore ledger', () => {
  it('creates a balance on first use, spends with preconditions, retries a conflict and settles with server-side increments', async () => {
    const firestore = fakeFirestore()
    const store = new FirestoreCreditsStore('octocrawl-test', async () => 'token', 1_000, firestore.fetcher)
    const first = await store.reserve('account-1', 5, SITE, OCT)
    expect(first).toMatchObject({ ok: true, reservation: { fromGrant: 5, remaining: 995 } })
    const [created] = firestore.commits as Array<{ writes: Array<{ currentDocument: unknown }> }>
    expect(created!.writes.map((write) => write.currentDocument)).toEqual([{ exists: false }, { exists: false }])
    if (!first.ok) throw new Error('unreachable')
    expect(await store.settle(first.reservation, 1, 'http', OCT)).toEqual({ remaining: 999 })
    expect(firestore.docs.get(`${firestore.resource}/credits/account-1`)!.fields).toMatchObject({ month: { stringValue: '2026-10' }, grant: { integerValue: '999' }, purchased: { integerValue: '0' } })
    expect(firestore.docs.get(`${firestore.resource}/creditUsage/account-1-2026-10-11`)!.fields).toMatchObject({ uid: { stringValue: 'account-1' }, http: { integerValue: '1' }, credits: { integerValue: '1' } })
    expect(firestore.docs.get(`${firestore.resource}/hostedQuotas/${SITE.id}`)!.fields.count).toEqual({ integerValue: '1' })
    // A concurrent spender moved the balance: the commit is refused once and the reservation retried against what is there now.
    firestore.conflictOnce()
    expect(await store.reserve('account-1', 1, SITE, OCT)).toMatchObject({ ok: true, reservation: { remaining: 998 } })
    expect(firestore.docs.get(`${firestore.resource}/hostedQuotas/${SITE.id}`)!.fields.count).toEqual({ integerValue: '2' })
  })

  it('refuses past the balance or the site\'s day without writing, and rejects a malformed account id', async () => {
    const firestore = fakeFirestore()
    const store = new FirestoreCreditsStore('octocrawl-test', async () => 'token', 2, firestore.fetcher)
    expect((await store.reserve('account-1', 2, SITE, OCT)).ok).toBe(true)
    expect(await store.reserve('account-1', 1, SITE, OCT)).toEqual({ ok: false, limited: 'credits', remaining: 0 })
    expect(await store.reserve('account-2', 1, { id: SITE.id, limit: 1 }, OCT)).toEqual({ ok: false, limited: 'site', limit: 1 })
    expect(firestore.commits).toHaveLength(1)
    await expect(store.reserve('../other', 1, SITE, OCT)).rejects.toThrow(/malformed/)
  })
})
