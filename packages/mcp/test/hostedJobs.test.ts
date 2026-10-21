import { describe, expect, it } from 'vitest'
import { FirestoreHostedJobStore, MemoryHostedJobStore, newHostedJob, type HostedJobStore } from '../src/hostedJobs.js'

const NOW = new Date('2026-10-19T08:00:00Z')
const LIMITS = { maxRunning: 2, maxQueued: 1 }
const job = (id: string, workspaceId = 'ws_account-1') => newHostedJob({ id, workspaceId, uid: 'account-1', keyId: 'key-1', kind: 'batch', request: { urls: ['https://example.com/'] }, maxCredits: null }, NOW)

/** A Firestore REST stand-in: documents with update times; a commit is checked against every precondition before any write applies. */
function fakeFirestore() {
  const resource = 'projects/octocrawl-test/databases/(default)/documents'
  const docs = new Map<string, { fields: Record<string, unknown>; updateTime: string }>()
  const commits: Array<{ writes: unknown[] }> = []
  let clock = 0
  let conflicts = 0
  let loseAnswer = false
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith(':commit') && loseAnswer) {
      // The commit applies, then its answer never arrives.
      loseAnswer = false
      await fetcher(input, init)
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }
    if (url.endsWith(':commit')) {
      const body = JSON.parse(String(init?.body)) as { writes: Array<{ update?: { name: string; fields: Record<string, unknown> }; delete?: string; currentDocument?: { exists?: boolean; updateTime?: string } }> }
      commits.push(body)
      if (conflicts > 0) { conflicts--; return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 }) }
      for (const write of body.writes) {
        const existing = docs.get(write.update?.name ?? write.delete!)
        const pre = write.currentDocument
        if (pre?.exists === false && existing) return new Response('{}', { status: 409 })
        if (pre?.exists === true && !existing) return new Response('{}', { status: 404 })
        if (pre?.updateTime !== undefined && existing?.updateTime !== pre.updateTime) return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 })
      }
      for (const write of body.writes) {
        if (write.delete) docs.delete(write.delete)
        else docs.set(write.update!.name, { fields: write.update!.fields, updateTime: `2026-10-19T08:00:00.${String(++clock).padStart(6, '0')}Z` })
      }
      return new Response(JSON.stringify({ writeResults: body.writes.map(() => ({})) }), { status: 200 })
    }
    if (url.endsWith(':batchGet')) {
      const names = (JSON.parse(String(init?.body)) as { documents: string[] }).documents
      // Firestore answers a batchGet in any order; reversed here so a store that relies on it fails.
      return new Response(JSON.stringify(names.map((name) => docs.has(name) ? { found: { name, ...docs.get(name)! } } : { missing: name }).reverse()), { status: 200 })
    }
    const name = decodeURIComponent(url.replace('https://firestore.googleapis.com/v1/', ''))
    const doc = docs.get(name)
    if (!doc) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 })
    return new Response(JSON.stringify({ name, ...doc }), { status: 200 })
  }) as typeof fetch
  return { resource, docs, commits, fetcher, conflictOnce: () => { conflicts = 1 }, loseNextAnswer: () => { loseAnswer = true } }
}

const stores: Array<[string, () => HostedJobStore]> = [
  ['memory', () => new MemoryHostedJobStore()],
  ['firestore', () => {
    const firestore = fakeFirestore()
    return Object.assign(new FirestoreHostedJobStore('octocrawl-test', async () => 'token', firestore.fetcher), { removeForTest: async (id: string) => { firestore.docs.delete(`${firestore.resource}/hostedJobs/${id}`) } })
  }],
]

describe.each(stores)('%s job store', (_name, make) => {
  it('runs at most maxRunning jobs a workspace, queues up to maxQueued more, and refuses past that', async () => {
    const store = make()
    expect(await store.create(job('job-1'), LIMITS, null, NOW)).toMatchObject({ ok: true, replayed: false, job: { status: 'running' } })
    expect(await store.create(job('job-2'), LIMITS, null, NOW)).toMatchObject({ ok: true, job: { status: 'running' } })
    expect(await store.create(job('job-3'), LIMITS, null, NOW)).toMatchObject({ ok: true, job: { status: 'queued' } })
    expect(await store.create(job('job-4'), LIMITS, null, NOW)).toEqual({ ok: false, reason: 'busy', running: 2, queued: 1 })
    // Another workspace has its own slots.
    expect(await store.create(job('job-5', 'ws_account-2'), LIMITS, null, NOW)).toMatchObject({ ok: true, job: { status: 'running' } })
    expect(await store.get('job-4')).toBeNull()
  })

  it('answers the same job for a replayed idempotency key, and a conflict for the key with another request', async () => {
    const store = make()
    const key = { id: 'ws_account-1-abc123', fingerprint: 'f1', expireAt: '2026-10-20T08:00:00.000Z' }
    expect(await store.create(job('job-1'), LIMITS, key, NOW)).toMatchObject({ ok: true, replayed: false })
    expect(await store.create(job('job-2'), LIMITS, key, NOW)).toMatchObject({ ok: true, replayed: true, job: { id: 'job-1' } })
    expect(await store.create(job('job-3'), LIMITS, { ...key, fingerprint: 'f2' }, NOW)).toEqual({ ok: false, reason: 'conflict' })
    expect(await store.get('job-2')).toBeNull()
    // Past its expiry the key starts a new job.
    expect(await store.create(job('job-4'), LIMITS, key, new Date('2026-10-20T08:00:01Z'))).toMatchObject({ ok: true, replayed: false, job: { id: 'job-4' } })
  })

  it('leases a slice only for the job\'s current generation, and only while no other holder\'s lease stands', async () => {
    const store = make()
    await store.create(job('job-1'), LIMITS, null, NOW)
    expect(await store.acquireLease('job-1', { generation: 1, holder: 'h1', ttlMs: 60_000 }, NOW)).toEqual({ ok: false, reason: 'stale' })
    expect(await store.acquireLease('job-1', { generation: 0, holder: 'h1', ttlMs: 60_000 }, NOW)).toMatchObject({ ok: true, job: { lease: { holder: 'h1' } } })
    expect(await store.acquireLease('job-1', { generation: 0, holder: 'h2', ttlMs: 60_000 }, NOW)).toEqual({ ok: false, reason: 'busy' })
    // Once the lease has expired another holder takes the same generation over (an instance that died mid-slice).
    const later = new Date(NOW.getTime() + 60_001)
    expect(await store.acquireLease('job-1', { generation: 0, holder: 'h2', ttlMs: 60_000 }, later)).toMatchObject({ ok: true, job: { lease: { holder: 'h2' } } })
    // The old holder can no longer write.
    expect(await store.commitSlice('job-1', 'h1', (j) => j, later)).toEqual({ ok: false, reason: 'lost' })
    expect(await store.acquireLease('job-0', { generation: 0, holder: 'h1', ttlMs: 60_000 }, NOW)).toEqual({ ok: false, reason: 'missing' })
  })

  it('leases nothing to a queued job, so no more than maxRunning run at once', async () => {
    const store = make()
    await store.create(job('job-1'), { maxRunning: 1, maxQueued: 1 }, null, NOW)
    await store.create(job('job-2'), { maxRunning: 1, maxQueued: 1 }, null, NOW)
    expect(await store.acquireLease('job-2', { generation: 0, holder: 'h1', ttlMs: 60_000 }, NOW)).toEqual({ ok: false, reason: 'queued' })
    expect(await store.get('job-2')).toMatchObject({ status: 'queued', lease: null })
  })

  it('binds an idempotency key to its workspace', async () => {
    const store = make()
    await expect(store.create(job('job-1'), LIMITS, { id: 'ws_account-2-abc', fingerprint: 'f', expireAt: '2026-10-20T08:00:00.000Z' }, NOW)).rejects.toThrow(/workspace/)
  })

  it('commits a slice: clears the lease and moves to the next generation, or finishes the job and starts the next queued one', async () => {
    const store = make()
    await store.create(job('job-1'), { maxRunning: 1, maxQueued: 1 }, null, NOW)
    await store.create(job('job-2'), { maxRunning: 1, maxQueued: 1 }, null, NOW)
    await store.acquireLease('job-1', { generation: 0, holder: 'h1', ttlMs: 60_000 }, NOW)
    const next = await store.commitSlice('job-1', 'h1', (j) => ({ ...j, counts: { ...j.counts, pages: 100, slices: 1 } }), NOW)
    expect(next).toMatchObject({ ok: true, promoted: null, job: { generation: 1, lease: null, status: 'running', counts: { pages: 100 } } })
    await store.acquireLease('job-1', { generation: 1, holder: 'h2', ttlMs: 60_000 }, NOW)
    const done = await store.commitSlice('job-1', 'h2', (j) => ({ ...j, status: 'completed' }), NOW)
    expect(done).toMatchObject({ ok: true, promoted: 'job-2', job: { status: 'completed', finishedAt: NOW.toISOString(), expireAt: '2026-10-26T08:00:00.000Z', deleteAt: '2026-11-25T08:00:00.000Z' } })
    expect(await store.get('job-2')).toMatchObject({ status: 'running' })
    // A finished job leases nothing more.
    expect(await store.acquireLease('job-1', { generation: 1, holder: 'h3', ttlMs: 60_000 }, NOW)).toEqual({ ok: false, reason: 'finished' })
  })

  it('cancels a running or queued job in its workspace, frees its slot, and keeps the cancel when a slice commits after it', async () => {
    const store = make()
    await store.create(job('job-1'), { maxRunning: 1, maxQueued: 2 }, null, NOW)
    await store.create(job('job-2'), { maxRunning: 1, maxQueued: 2 }, null, NOW)
    await store.create(job('job-3'), { maxRunning: 1, maxQueued: 2 }, null, NOW)
    expect(await store.cancel('job-1', 'ws_account-2', NOW)).toEqual({ ok: false, reason: 'missing' })
    await store.acquireLease('job-1', { generation: 0, holder: 'h1', ttlMs: 60_000 }, NOW)
    expect(await store.cancel('job-1', 'ws_account-1', NOW)).toMatchObject({ ok: true, promoted: 'job-2', job: { status: 'cancelled' } })
    expect(await store.cancel('job-3', 'ws_account-1', NOW)).toMatchObject({ ok: true, promoted: null, job: { status: 'cancelled' } })
    expect(await store.cancel('job-3', 'ws_account-1', NOW)).toMatchObject({ ok: true, promoted: null, job: { status: 'cancelled' } })
    // While that slice still holds its lease, a delivery for the cancelled job is busy, not finished.
    expect(await store.acquireLease('job-1', { generation: 0, holder: 'h2', ttlMs: 60_000 }, NOW)).toEqual({ ok: false, reason: 'busy' })
    // The slice that was running when the cancel came in writes its pages, but the job stays cancelled and nothing is promoted twice.
    expect(await store.commitSlice('job-1', 'h1', (j) => ({ ...j, status: 'completed', counts: { ...j.counts, pages: 7 } }), NOW)).toMatchObject({ ok: true, promoted: null, job: { status: 'cancelled', counts: { pages: 7 }, lease: null } })
    expect(await store.acquireLease('job-1', { generation: 0, holder: 'h2', ttlMs: 60_000 }, NOW)).toEqual({ ok: false, reason: 'finished' })
    // job-2 got the slot; a new job queues behind it.
    expect(await store.create(job('job-4'), { maxRunning: 1, maxQueued: 2 }, null, NOW)).toMatchObject({ ok: true, job: { status: 'queued' } })
  })

  it('fails a job with a reason and frees its slot for the next queued one, leaving a finished job as it was', async () => {
    const store = make()
    await store.create(job('job-1'), { maxRunning: 1, maxQueued: 1 }, null, NOW)
    await store.create(job('job-2'), { maxRunning: 1, maxQueued: 1 }, null, NOW)
    expect(await store.fail('job-1', 'not_queued', NOW)).toMatchObject({ ok: true, promoted: 'job-2', job: { status: 'failed', failureReason: 'not_queued' } })
    expect(await store.get('job-2')).toMatchObject({ status: 'running' })
    expect(await store.fail('job-1', 'other', NOW)).toMatchObject({ ok: true, promoted: null, job: { failureReason: 'not_queued' } })
    expect(await store.fail('job-9', 'x', NOW)).toEqual({ ok: false, reason: 'missing' })
  })

  it('updates a held job without moving its generation or lease, and refuses another holder', async () => {
    const store = make()
    await store.create(job('job-1'), LIMITS, null, NOW)
    await store.acquireLease('job-1', { generation: 0, holder: 'h1', ttlMs: 60_000 }, NOW)
    expect(await store.updateHeld('job-1', 'h1', (j) => ({ ...j, reservation: { reservation: { uid: 'account-1', fromGrant: 5 }, used: null }, generation: 9, status: 'completed' }))).toMatchObject({ ok: true, job: { generation: 0, status: 'running', lease: { holder: 'h1' }, reservation: { reservation: { fromGrant: 5 } } } })
    expect(await store.updateHeld('job-1', 'h2', (j) => j)).toEqual({ ok: false, reason: 'lost' })
    expect(await store.updateHeld('job-9', 'h1', (j) => j)).toEqual({ ok: false, reason: 'missing' })
  })

  it('counts failed slices: an expired lease taken over and a lease given back count, a commit starts the count again (H1 D7)', async () => {
    const store = make()
    await store.create(job('job-1'), LIMITS, null, NOW)
    await store.acquireLease('job-1', { generation: 0, holder: 'h1', ttlMs: 60_000 }, NOW)
    // h1 dies: h2 takes the expired lease over.
    const later = new Date(NOW.getTime() + 60_001)
    expect(await store.acquireLease('job-1', { generation: 0, holder: 'h2', ttlMs: 60_000 }, later)).toMatchObject({ ok: true, job: { failedAttempts: 1 } })
    // h2 fails and gives the lease back: the next delivery takes it at once.
    expect(await store.abandon('job-1', 'h2')).toMatchObject({ ok: true, job: { failedAttempts: 2, lease: null } })
    expect(await store.abandon('job-1', 'h2')).toEqual({ ok: false, reason: 'lost' })
    expect(await store.acquireLease('job-1', { generation: 0, holder: 'h3', ttlMs: 60_000 }, later)).toMatchObject({ ok: true, job: { failedAttempts: 2 } })
    expect(await store.commitSlice('job-1', 'h3', (j) => j, later)).toMatchObject({ ok: true, job: { failedAttempts: 0 } })
  })

  it('records a webhook\'s outcome, and a "not sent" only while nothing is recorded', async () => {
    const store = make()
    const webhook = { url: 'https://hooks.example.com/', events: ['completed', 'failed', 'cancelled'] as Array<'completed' | 'failed' | 'cancelled'>, metadata: {}, secret: 'whsec_x', delivery: null }
    await store.create({ ...job('job-1'), webhook }, LIMITS, null, NOW)
    const at = NOW.toISOString()
    const notSent = { state: 'failed' as const, attempts: 0, httpStatus: null, error: 'not sent', at }
    expect(await store.recordWebhook('job-1', { state: 'delivered', attempts: 1, httpStatus: 200, error: null, at })).toMatchObject({ ok: true })
    expect(await store.recordWebhook('job-1', notSent, { onlyIfUnset: true })).toEqual({ ok: false, reason: 'already_set' })
    expect((await store.get('job-1'))?.webhook?.delivery).toMatchObject({ state: 'delivered' })
    await store.create({ ...job('job-2'), webhook }, LIMITS, null, NOW)
    expect(await store.recordWebhook('job-2', notSent, { onlyIfUnset: true })).toMatchObject({ ok: true, job: { webhook: { delivery: { state: 'failed', error: 'not sent' } } } })
    expect(await store.recordWebhook('job-9', notSent)).toEqual({ ok: false, reason: 'missing' })
  })

  it('lists a workspace\'s jobs, newest first, and no other workspace\'s (H2 P1)', async () => {
    const store = make()
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
    await store.create(job('job-1'), LIMITS, null, at(0))
    await store.create({ ...job('job-2'), createdAt: at(2).toISOString() }, LIMITS, null, at(2))
    await store.create({ ...job('job-3', 'ws_account-2'), createdAt: at(1).toISOString() }, LIMITS, null, at(1))
    expect((await store.list('ws_account-1')).map((j) => j.id)).toEqual(['job-2', 'job-1'])
    expect((await store.list('ws_account-2')).map((j) => j.id)).toEqual(['job-3'])
    expect(await store.list('ws_account-9')).toEqual([])
    // A finished job stays listed while its record lasts; one a TTL deleted is left out.
    await store.cancel('job-2', 'ws_account-1', at(3))
    expect((await store.list('ws_account-1')).map((j) => [j.id, j.status])).toEqual([['job-2', 'cancelled'], ['job-1', 'running']])
    if (store instanceof MemoryHostedJobStore) store.jobs.delete('job-1')
    else await (store as unknown as { removeForTest(id: string): Promise<void> }).removeForTest('job-1')
    expect((await store.list('ws_account-1')).map((j) => j.id)).toEqual(['job-2'])
  })

  it('marks a finished job expired, and nothing else', async () => {
    const store = make()
    await store.create(job('job-1'), LIMITS, null, NOW)
    expect(await store.expire('job-1', NOW)).toEqual({ ok: false, reason: 'not_finished' })
    await store.cancel('job-1', 'ws_account-1', NOW)
    expect(await store.expire('job-1', NOW)).toMatchObject({ ok: true, job: { status: 'expired' } })
  })
})

describe.each(stores)('%s job store, records gone missing', (_name, make) => {
  it('frees the slots of jobs whose records are gone (a TTL), and promotes past a queued job that is gone', async () => {
    const store = make()
    const gone = async (id: string) => {
      if (store instanceof MemoryHostedJobStore) store.jobs.delete(id)
      else await (store as unknown as { removeForTest(id: string): Promise<void> }).removeForTest(id)
    }
    await store.create(job('job-1'), { maxRunning: 1, maxQueued: 2 }, null, NOW)
    await store.create(job('job-2'), { maxRunning: 1, maxQueued: 2 }, null, NOW)
    await store.create(job('job-3'), { maxRunning: 1, maxQueued: 2 }, null, NOW)
    await gone('job-2')
    // job-1 ends: job-2 is gone, so job-3 takes the slot.
    expect(await store.cancel('job-1', 'ws_account-1', NOW)).toMatchObject({ ok: true, promoted: 'job-3' })
    expect(await store.get('job-3')).toMatchObject({ status: 'running' })
    // job-3's record goes too: a full workspace drops it and has room again.
    await gone('job-3')
    expect(await store.create(job('job-4'), { maxRunning: 1, maxQueued: 0 }, null, NOW)).toMatchObject({ ok: true, job: { status: 'running' } })
  })
})

describe('Firestore job store', () => {
  it('writes the job, its workspace slots and its idempotency key in one commit with preconditions, and retries a conflict', async () => {
    const firestore = fakeFirestore()
    const store = new FirestoreHostedJobStore('octocrawl-test', async () => 'token', firestore.fetcher)
    firestore.conflictOnce()
    expect(await store.create(job('job-1'), LIMITS, { id: 'ws_account-1-abc', fingerprint: 'f', expireAt: '2026-10-20T08:00:00.000Z' }, NOW)).toMatchObject({ ok: true })
    expect(firestore.commits).toHaveLength(2)
    const writes = firestore.commits[1]!.writes as Array<{ update: { name: string; fields: Record<string, { stringValue?: string; timestampValue?: string }> }; currentDocument: unknown }>
    expect(writes.map((w) => w.update.name.split('/documents/')[1])).toEqual(['hostedJobs/job-1', 'hostedJobWorkspaces/ws_account-1', 'hostedJobIdempotency/ws_account-1-abc'])
    for (const write of writes) expect(write.currentDocument).toEqual({ exists: false })
    // The TTL fields are timestamps; the owner is a field of its own, apart from the job's JSON.
    expect(writes[0]!.update.fields.workspaceId).toEqual({ stringValue: 'ws_account-1' })
    expect(writes[0]!.update.fields.deleteAt).toEqual({ timestampValue: '2026-11-18T08:00:00.000Z' })
    expect(writes[2]!.update.fields.expireAt).toEqual({ timestampValue: '2026-10-20T08:00:00.000Z' })
  })

  it('counts a create whose commit applied but whose answer was lost as created', async () => {
    const firestore = fakeFirestore()
    const store = new FirestoreHostedJobStore('octocrawl-test', async () => 'token', firestore.fetcher)
    firestore.loseNextAnswer()
    expect(await store.create(job('job-1'), LIMITS, null, NOW)).toMatchObject({ ok: true, replayed: false, job: { id: 'job-1', status: 'running' } })
    expect(firestore.commits).toHaveLength(1)
  })

  it('refuses a malformed job, workspace or key id before any request', async () => {
    const firestore = fakeFirestore()
    const store = new FirestoreHostedJobStore('octocrawl-test', async () => 'token', firestore.fetcher)
    await expect(store.get('../x')).rejects.toThrow(/malformed/)
    await expect(store.create(job('job-1', 'ws/../x'), LIMITS, null, NOW)).rejects.toThrow(/malformed/)
    await expect(store.create(job('job-1'), LIMITS, { id: 'ws_account-1-a/b', fingerprint: 'f', expireAt: NOW.toISOString() }, NOW)).rejects.toThrow(/malformed/)
    expect(firestore.commits).toHaveLength(0)
  })
})
