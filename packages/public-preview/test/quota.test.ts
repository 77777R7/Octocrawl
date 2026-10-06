import { describe, expect, it } from 'vitest'
import { FirestorePreviewQuota, quotaExpiry, quotaStatus } from '../src/quota.js'

interface Saved { count: number; updateTime: string }
const restPrefix = 'https://firestore.googleapis.com/v1/'
const resourceFromUrl = (url: string): string => {
  if (!url.startsWith(restPrefix)) throw new Error(`unexpected Firestore URL: ${url}`)
  return url.slice(restPrefix.length)
}

function fakeFirestore() {
  const docs = new Map<string, Saved>()
  const names: string[] = []
  let version = 0
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('http://metadata.google.internal/')) return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 })
    if (init?.method === 'POST') {
      if (url !== `${restPrefix}projects/sample-project/databases/(default)/documents:commit`) throw new Error(`invalid commit URL: ${url}`)
      const body = JSON.parse(String(init.body)) as { writes: { update: { name: string; fields: { count: { integerValue: string } } }; currentDocument: { exists?: boolean; updateTime?: string } }[] }
      if (body.writes.some(write => !/^projects\/sample-project\/databases\/\(default\)\/documents\/publicPreviewQuotas\//.test(write.update.name))) {
        throw new Error('Firestore write used a URL instead of a document resource name')
      }
      const valid = body.writes.every(write => {
        const prior = docs.get(write.update.name)
        return write.currentDocument.exists === false ? prior === undefined : prior?.updateTime === write.currentDocument.updateTime
      })
      if (!valid) return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 })
      for (const write of body.writes) docs.set(write.update.name, { count: Number(write.update.fields.count.integerValue), updateTime: `t${++version}` })
      return new Response('{}', { status: 200 })
    }
    names.push(url)
    const name = resourceFromUrl(url)
    const doc = docs.get(name)
    return doc === undefined ? new Response('{}', { status: 404 })
      : new Response(JSON.stringify({ name, updateTime: doc.updateTime, fields: { count: { integerValue: String(doc.count) } } }), { status: 200 })
  }) as typeof fetch
  return { fetcher, docs, names }
}

describe('durable preview quota', () => {
  it('atomically permits only five concurrent requests per visitor and never stores raw address', async () => {
    const store = fakeFirestore()
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), store.fetcher)
    const now = new Date('2026-09-24T02:00:00Z')
    const decisions = await Promise.all(Array.from({ length: 6 }, () => quota.consume('203.0.113.10', now)))
    expect(decisions.filter(value => value === 'ok')).toHaveLength(5)
    expect(decisions.filter(value => value === 'visitor_limited')).toHaveLength(1)
    expect([...store.docs.values()].map(value => value.count).sort((a, b) => a - b)).toEqual([5, 5])
    expect([...store.docs.keys()].every(name => name.startsWith('projects/sample-project/databases/(default)/documents/'))).toBe(true)
    expect(store.names.join(' ')).not.toContain('203.0.113.10')
  })

  it('stamps both counters with an expiry one day after the day they count', async () => {
    const bodies: string[] = []
    const store = fakeFirestore()
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') bodies.push(String(init.body))
      return store.fetcher(input, init)
    }) as typeof fetch
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), fetcher)
    await quota.consume('visitor-a', new Date('2026-09-24T23:59:00Z'))
    const writes = (JSON.parse(bodies[0]!) as { writes: { update: { fields: { expireAt?: { timestampValue: string } } } }[] }).writes
    expect(writes.map(write => write.update.fields.expireAt?.timestampValue)).toEqual(['2026-09-26T00:00:00.000Z', '2026-09-26T00:00:00.000Z'])
    expect(quotaExpiry(new Date('2026-09-24T00:00:00Z')).toISOString()).toBe('2026-09-26T00:00:00.000Z')
  })

  it('reads what a visitor has left without writing, capped by what the site has left', async () => {
    const store = fakeFirestore()
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), store.fetcher)
    const now = new Date('2026-09-24T02:00:00Z')
    expect(await quota.status('visitor-a', now)).toEqual({ decision: 'ok', limit: 5, remaining: 5 })
    expect(store.docs.size).toBe(0)
    await quota.consume('visitor-a', now)
    await quota.consume('visitor-a', now)
    expect(await quota.status('visitor-a', now)).toEqual({ decision: 'ok', limit: 5, remaining: 3 })
    for (let i = 0; i < 3; i++) await quota.consume('visitor-a', now)
    expect(await quota.status('visitor-a', now)).toEqual({ decision: 'visitor_limited', limit: 5, remaining: 0 })
    expect(await quota.status('visitor-b', now)).toEqual({ decision: 'ok', limit: 5, remaining: 5 })
    expect(quotaStatus(148, 0)).toEqual({ decision: 'ok', limit: 5, remaining: 2 })
    expect(quotaStatus(150, 0)).toEqual({ decision: 'global_limited', limit: 5, remaining: 0 })
  })

  it('checks both limits without writing and leaves consume as the atomic gate', async () => {
    const store = fakeFirestore()
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), store.fetcher)
    const now = new Date('2026-09-24T02:00:00Z')
    expect(await quota.check('visitor-a', now)).toBe('ok')
    expect(store.docs.size).toBe(0)
    for (let i = 0; i < 5; i++) expect(await quota.consume('visitor-a', now)).toBe('ok')
    expect(await quota.check('visitor-a', now)).toBe('visitor_limited')
    expect(await quota.check('visitor-b', now)).toBe('ok')
    expect(store.docs.size).toBe(2)
  })

  it('applies the global cap across visitors', async () => {
    const store = fakeFirestore()
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), store.fetcher)
    const now = new Date('2026-09-24T02:00:00Z')
    const decisions = []
    for (let i = 0; i < 151; i++) decisions.push(await quota.consume(`visitor-${i}`, now))
    expect(decisions.filter(value => value === 'ok')).toHaveLength(150)
    expect(decisions.filter(value => value === 'global_limited')).toHaveLength(1)
    expect(await quota.check('new-visitor', now)).toBe('global_limited')
  })

  it('does not silently permit access when Firestore cannot be reached', async () => {
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), (async () => { throw new Error('offline') }) as typeof fetch)
    await expect(quota.consume('visitor')).rejects.toThrow('offline')
    await expect(quota.check('visitor')).rejects.toThrow('offline')
  })

  it('fails closed when an existing counter document has no count', async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      if (String(input).startsWith('http://metadata.google.internal/')) {
        return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 })
      }
      return new Response(JSON.stringify({ name: resourceFromUrl(String(input)), updateTime: 't1', fields: {} }), { status: 200 })
    }) as typeof fetch
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), fetcher)
    await expect(quota.consume('visitor')).rejects.toThrow('Firestore quota document is malformed')
  })

  it('does not commit a quota write after cancellation between reads and CAS', async () => {
    const store = fakeFirestore()
    let allowVisitorRead: (() => void) | undefined
    const visitorRead = new Promise<void>(resolve => { allowVisitorRead = resolve })
    let commitCalls = 0
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith(':commit')) commitCalls++
      if (url.includes('/publicPreviewQuotas/') && !url.endsWith('-global')) await visitorRead
      return store.fetcher(input, init)
    }) as typeof fetch
    const quota = new FirestorePreviewQuota('sample-project', 'x'.repeat(32), fetcher)
    const abort = new AbortController()
    const pending = quota.consume('visitor', new Date('2026-09-24T02:00:00Z'), { signal: abort.signal, deadlineAt: Date.now() + 1_000 })
    await new Promise(resolve => setTimeout(resolve, 0))
    abort.abort(new DOMException('client disconnected', 'AbortError'))
    allowVisitorRead!()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(commitCalls).toBe(0)
    expect(store.docs.size).toBe(0)
  })
})
