import { afterEach, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { createHostedApi, keyDigest, MemoryHostedKeys, MemoryHostedOAuthTokens, MemoryHostedQuota, type HostedKeyRecord } from '../src/hostedApi.js'
import { MemoryCreditsStore } from '../src/hostedCredits.js'
import { MemoryHostedJobStore, type HostedJob } from '../src/hostedJobs.js'
import { gcsJobFiles, isJobRoute, type JobFiles } from '../src/hostedJobRoutes.js'
import type { GcsBucket } from '../src/hostedCloud.js'
import { gzipSync } from 'node:zlib'

// Hosted batch and crawl jobs at the gate (ROADMAP PH H1, docs/h1-hosted-jobs-tasks.md PR ③). No worker runs here: a
// test plays the worker's part by writing the job's counts and slice files.

const HASH_KEY = 'h'.repeat(40)
const KEYS: Record<string, HostedKeyRecord> = {
  oc_one: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' },
  oc_http: { enabled: true, plan: 'account', dailyLimit: 0, browser: false, uid: 'account-2' },
  oc_two: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-3' },
  oc_plain: { enabled: true, plan: 'free', dailyLimit: 100, browser: true },
}

let close: (() => Promise<void>) | undefined
let root: string | undefined
afterEach(async () => { await close?.(); close = undefined; if (root) await rm(root, { recursive: true, force: true }); root = undefined })

async function start(options: { credits?: MemoryCreditsStore; enabled?: boolean; failEnqueue?: boolean | ((job: HostedJob) => boolean) } = {}) {
  root = await mkdtemp(join(tmpdir(), 'octocrawl-job-routes-'))
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  const store = new MemoryHostedJobStore()
  const segments = new Map<string, string[]>()
  const files: JobFiles = {
    segment: async (job, slice) => segments.get(`${job.id}/${slice}`) ?? null,
    exportUrl: async (job) => `https://storage.example/${job.id}/export.jsonl.gz?signed`,
  }
  const enqueued: HostedJob[] = []
  const credits = options.credits ?? new MemoryCreditsStore(1_000)
  const keys = new MemoryHostedKeys(new Map(Object.entries(KEYS).map(([key, record]) => [keyDigest(HASH_KEY, key), record])))
  const service = createHostedApi({
    port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys, oauthTokens: new MemoryHostedOAuthTokens(new Map()), quota: new MemoryHostedQuota(), credits,
    networkPolicy: hostedNetworkPolicy(), log: () => {},
    jobs: {
      store, files,
      enqueueSlice: async (job) => { if (options.failEnqueue === true || (typeof options.failEnqueue === 'function' && options.failEnqueue(job))) throw new Error('queue down'); enqueued.push(job) },
      enabled: async () => options.enabled ?? true,
    },
  })
  close = service.close
  if (!service.server.listening) await once(service.server, 'listening')
  const url = `http://127.0.0.1:${port}`
  const call = (method: string, path: string, key: string | null, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${url}${path}`, { method, headers: { 'content-type': 'application/json', ...(key === null ? {} : { authorization: `Bearer ${key}` }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  /** The worker's part: a slice stored these items, and the job's counts say so. */
  const sliceWrote = async (id: string, items: Array<{ url: string; status: string }>) => {
    const job = store.jobs.get(id)!
    segments.set(`${id}/${job.counts.slices}`, items.map((item) => JSON.stringify(item)))
    const errors = items.filter((item) => ['failed', 'blocked'].includes(item.status)).length
    store.jobs.set(id, { ...job, counts: { pages: job.counts.pages + items.length - errors, errors: job.counts.errors + errors, slices: job.counts.slices + 1 } })
  }
  return { call, store, enqueued, credits, sliceWrote }
}

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/p/${i}`)

describe('job files in GCS', () => {
  it('reads a slice\'s segment by its padded name under the job\'s workspace, gunzipped a line an item, and signs the export', async () => {
    const asked: string[] = []
    const bucket = {
      download: async (name: string) => { asked.push(name); return name.endsWith('00001.jsonl.gz') ? { body: new Uint8Array(gzipSync('{"url":"a"}\n{"url":"b"}\n')), generation: 1 } : null },
      signedUrl: async (name: string, seconds: number) => `signed:${name}:${seconds}`,
    } as unknown as GcsBucket
    const files = gcsJobFiles(bucket)
    const job = { id: 'job-1', workspaceId: 'ws_account-1' } as HostedJob
    expect(await files.segment(job, 1)).toEqual(['{"url":"a"}', '{"url":"b"}'])
    expect(await files.segment(job, 2)).toBeNull()
    expect(asked).toEqual(['w/ws_account-1/jobs/job-1/pages/00001.jsonl.gz', 'w/ws_account-1/jobs/job-1/pages/00002.jsonl.gz'])
    expect(await files.exportUrl(job)).toBe('signed:w/ws_account-1/jobs/job-1/export.jsonl.gz:900')
  })
})

describe('hosted job routes', () => {
  it('names the job routes, and only them', () => {
    for (const [method, path] of [['POST', '/v1/batches'], ['POST', '/v1/crawl'], ['GET', '/v1/batches/x'], ['GET', '/v1/batches/x/items'], ['GET', '/v1/crawl/x/pages'], ['GET', '/v1/crawl/x/errors'], ['POST', '/v1/crawl/x/cancel'], ['GET', '/v1/jobs/x/export']]) expect(isJobRoute(method!, path!), `${method} ${path}`).toBe(true)
    for (const [method, path] of [['POST', '/v1/crawl/x/resume'], ['DELETE', '/v1/batches/x'], ['POST', '/v1/batches/x/handoff'], ['GET', '/v1/crawl/x/events']]) expect(isJobRoute(method!, path!), `${method} ${path}`).toBe(false)
  })

  it('starts a batch for an account\'s key: 202 with the estimate, the job running and its first slice queued', async () => {
    const { call, enqueued, store } = await start()
    const response = await call('POST', '/v1/batches', 'oc_one', { urls: urls(3), formats: ['markdown'] })
    expect(response.status).toBe(202)
    const body = await response.json() as { taskId: string; status: string; requested: number; estimatedCredits: number }
    expect(body).toMatchObject({ kind: 'batch', status: 'running', requested: 3, remaining: 3, estimatedCredits: 15 })
    expect(enqueued.map((job) => job.id)).toEqual([body.taskId])
    expect(store.jobs.get(body.taskId)).toMatchObject({ workspaceId: 'ws_account-1', uid: 'account-1', generation: 0 })
  })

  it('refuses jobs to keyless callers and keys without an account, and keeps the rest of the hosted refusals', async () => {
    const { call } = await start()
    for (const key of [null, 'oc_plain']) {
      const response = await call('POST', '/v1/batches', key, { urls: urls(1) })
      expect(response.status, String(key)).toBe(403)
      expect(((await response.json()) as { code: string }).code).toBe('jobs_need_account')
    }
    expect((await call('POST', '/v1/batches', 'oc_nobody', { urls: urls(1) })).status).toBe(401)
    // Resume, handoff and the event streams are not hosted.
    for (const [method, path] of [['POST', '/v1/crawl/6f1c2a4e-1b2c-4d3e-8f90-0123456789ab/resume'], ['GET', '/v1/crawl/6f1c2a4e-1b2c-4d3e-8f90-0123456789ab/events']]) expect((await call(method!, path!, 'oc_one')).status, path).toBe(403)
  })

  it('refuses an option hosted jobs do not take by name, an authed mode, and a key without the browser lane asking for it', async () => {
    const { call } = await start()
    const options = await call('POST', '/v1/batches', 'oc_one', { urls: urls(1), webhook: { url: 'https://hooks.example/' }, robotsOverrides: [] })
    expect(options.status).toBe(400)
    expect(((await options.json()) as { error: string }).error).toBe('hosted batch jobs do not take webhook, robotsOverrides')
    expect((await call('POST', '/v1/crawl', 'oc_one', { url: 'https://example.com/', ignoreRobotsTxt: true })).status).toBe(400)
    expect((await call('POST', '/v1/crawl', 'oc_one', { url: 'https://example.com/', mode: 'authed' })).status).toBe(400)
    expect((await call('POST', '/v1/batches', 'oc_http', { urls: urls(1), waitFor: 500 })).status).toBe(400)
    expect((await call('POST', '/v1/batches', 'oc_http', { urls: urls(1), formats: ['screenshot'] })).status).toBe(400)
    expect((await call('POST', '/v1/crawl', 'oc_one', { url: 'https://example.com/', maxPages: 501 })).status).toBe(400)
    expect((await call('POST', '/v1/batches', 'oc_one', { urls: urls(1_001) })).status).toBe(400)
    expect((await call('POST', '/v1/batches', 'oc_one', { urls: urls(1), maxCredits: 0 })).status).toBe(400)
  })

  it('takes maxPages null as the default, never as no limit', async () => {
    const { call, store } = await start()
    const body = await (await call('POST', '/v1/crawl', 'oc_one', { url: 'https://example.com/', maxPages: null })).json() as { taskId: string }
    expect(store.jobs.get(body.taskId)?.request).toMatchObject({ maxPages: 100 })
  })

  it('fails a promoted job whose first slice could not be queued, freeing its slot for the next', async () => {
    let calls = 0
    // The two running jobs' slices queue; the third enqueue, the promoted job's, fails.
    const { call, store } = await start({ credits: new MemoryCreditsStore(100_000), failEnqueue: () => ++calls === 3 })
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(((await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })).json()) as { taskId: string }).taskId)
    expect(store.jobs.get(ids[2]!)?.status).toBe('queued')
    expect((await call('POST', `/v1/batches/${ids[0]}/cancel`, 'oc_one')).status).toBe(200)
    expect(store.jobs.get(ids[2]!)).toMatchObject({ status: 'failed', failureReason: 'not_queued' })
    // Its slot is free: the next job runs.
    expect(await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })).json()).toMatchObject({ status: 'running' })
  })

  it('pins a key without the browser lane to HTTP: its estimate is a credit a page, and its stored request says fastMode', async () => {
    const { call, store } = await start()
    const body = await (await call('POST', '/v1/crawl', 'oc_http', { url: 'https://example.com/' })).json() as { taskId: string; estimatedCredits: number }
    expect(body.estimatedCredits).toBe(100)
    expect(store.jobs.get(body.taskId)?.request).toMatchObject({ url: 'https://example.com/', maxPages: 100, fastMode: true })
  })

  it('refuses a start the account\'s credits cannot carry one slice of, and caps the estimate at maxCredits', async () => {
    const credits = new MemoryCreditsStore(50)
    const { call } = await start({ credits })
    const refused = await call('POST', '/v1/batches', 'oc_one', { urls: urls(20) })
    expect(refused.status).toBe(429)
    expect(((await refused.json()) as { error: string }).error).toBe('this account has 50 credits; the job\'s first slice needs 100')
    // Over HTTP alone, twenty pages are twenty credits.
    expect((await call('POST', '/v1/batches', 'oc_one', { urls: urls(20), fastMode: true })).status).toBe(202)
    expect(await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(20), maxCredits: 40 })).json()).toMatchObject({ estimatedCredits: 40 })
  })

  it('runs two jobs at once an account, queues ten, refuses the next with 429, and queues no slice for a waiting job', async () => {
    const { call, enqueued } = await start({ credits: new MemoryCreditsStore(100_000) })
    const statuses: string[] = []
    for (let i = 0; i < 12; i++) statuses.push(((await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })).json()) as { status: string }).status)
    expect(statuses.filter((s) => s === 'running')).toHaveLength(2)
    expect(statuses.filter((s) => s === 'queued')).toHaveLength(10)
    expect(enqueued).toHaveLength(2)
    const busy = await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })
    expect(busy.status).toBe(429)
    expect(busy.headers.get('retry-after')).toBe('60')
    // Another account has its own slots.
    expect((await call('POST', '/v1/batches', 'oc_two', { urls: urls(1) })).status).toBe(202)
  })

  it('answers a replayed Idempotency-Key with the same job and queues nothing again; the key with another request is 409', async () => {
    const { call, enqueued } = await start()
    const first = await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(2) }, { 'idempotency-key': 'k-1' })).json() as { taskId: string }
    const again = await call('POST', '/v1/batches', 'oc_one', { urls: urls(2) }, { 'idempotency-key': 'k-1' })
    expect(again.status).toBe(202)
    expect(await again.json()).toMatchObject({ taskId: first.taskId, replayed: true })
    expect(enqueued).toHaveLength(1)
    expect((await call('POST', '/v1/batches', 'oc_one', { urls: urls(3) }, { 'idempotency-key': 'k-1' })).status).toBe(409)
    // The same key from another account is another account's key.
    expect(await (await call('POST', '/v1/batches', 'oc_two', { urls: urls(2) }, { 'idempotency-key': 'k-1' })).json()).not.toMatchObject({ taskId: first.taskId })
  })

  it('reads a job only for its own account, of its own kind, and answers 410 once its results have expired', async () => {
    const { call, store } = await start()
    const { taskId } = await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(2) })).json() as { taskId: string }
    expect(await (await call('GET', `/v1/batches/${taskId}`, 'oc_one')).json()).toMatchObject({ taskId, status: 'running', requested: 2, completed: 0 })
    expect((await call('GET', `/v1/batches/${taskId}`, 'oc_two')).status).toBe(404)
    expect((await call('GET', `/v1/crawl/${taskId}`, 'oc_one')).status).toBe(404)
    expect((await call('GET', '/v1/batches/not-a-job', 'oc_one')).status).toBe(404)
    store.jobs.set(taskId, { ...store.jobs.get(taskId)!, status: 'completed', finishedAt: '2026-10-01T00:00:00.000Z', expireAt: '2026-10-08T00:00:00.000Z' })
    const gone = await call('GET', `/v1/batches/${taskId}/items`, 'oc_one')
    expect(gone.status).toBe(410)
    expect(((await gone.json()) as { code: string }).code).toBe('job_expired')
  })

  it('pages a job\'s items across its slice files with a cursor, and lists a crawl\'s pages and errors apart', async () => {
    const { call, sliceWrote } = await start()
    const { taskId } = await (await call('POST', '/v1/crawl', 'oc_one', { url: 'https://example.com/' })).json() as { taskId: string }
    await sliceWrote(taskId, [{ url: 'a', status: 'success' }, { url: 'b', status: 'blocked' }, { url: 'c', status: 'success' }])
    await sliceWrote(taskId, [{ url: 'd', status: 'duplicate' }, { url: 'e', status: 'success' }])
    const first = await (await call('GET', `/v1/crawl/${taskId}/pages?limit=2`, 'oc_one')).json() as { items: Array<{ url: string }>; nextCursor: string; hasMore: boolean }
    expect(first.items.map((item) => item.url)).toEqual(['a', 'c'])
    expect(first.hasMore).toBe(true)
    const second = await (await call('GET', `/v1/crawl/${taskId}/pages?limit=2&cursor=${first.nextCursor}`, 'oc_one')).json() as { items: Array<{ url: string }>; hasMore: boolean; nextCursor: string | null }
    expect(second.items.map((item) => item.url)).toEqual(['e'])
    expect(second).toMatchObject({ hasMore: false, nextCursor: null })
    expect(((await (await call('GET', `/v1/crawl/${taskId}/errors`, 'oc_one')).json()) as { items: Array<{ url: string }> }).items.map((item) => item.url)).toEqual(['b'])
    expect(await (await call('GET', `/v1/crawl/${taskId}`, 'oc_one')).json()).toMatchObject({ pagesFetched: 5, succeeded: 4, failed: 1, errors: 1, completed: 5 })
    expect(await (await call('GET', `/v1/crawl/${taskId}`, 'oc_one')).json()).toMatchObject({ budgetExceeded: null })
    expect((await call('GET', `/v1/crawl/${taskId}/pages?limit=101`, 'oc_one')).status).toBe(400)
    expect((await call('GET', `/v1/crawl/${taskId}/pages?cursor=x`, 'oc_one')).status).toBe(400)
  })

  it('keeps a page of items under its byte budget, so a response never grows past what Cloud Run serves, and goes on from the cursor', async () => {
    const { call, sliceWrote } = await start()
    const { taskId } = await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(3) })).json() as { taskId: string }
    const big = 'x'.repeat(9_000_000)
    await sliceWrote(taskId, [{ url: 'a', status: 'success', markdown: big }, { url: 'b', status: 'success', markdown: big }, { url: 'c', status: 'success', markdown: 'small' }] as unknown as Array<{ url: string; status: string }>)
    const first = await (await call('GET', `/v1/batches/${taskId}/items?limit=100`, 'oc_one')).json() as { items: Array<{ url: string }>; nextCursor: string; hasMore: boolean }
    expect(first.items.map((item) => item.url)).toEqual(['a'])
    expect(first.hasMore).toBe(true)
    const second = await (await call('GET', `/v1/batches/${taskId}/items?limit=100&cursor=${first.nextCursor}`, 'oc_one')).json() as { items: Array<{ url: string }>; hasMore: boolean }
    expect(second.items.map((item) => item.url)).toEqual(['b', 'c'])
    expect(second.hasMore).toBe(false)
  })

  it('lists the account\'s own jobs, newest first, a page at a time (H2 P1)', async () => {
    const { call } = await start({ credits: new MemoryCreditsStore(100_000) })
    const ids: string[] = []
    for (let i = 0; i < 3; i++) { ids.push(((await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })).json()) as { taskId: string }).taskId); await new Promise((resolve) => setTimeout(resolve, 5)) }
    await call('POST', '/v1/batches', 'oc_two', { urls: urls(1) })
    const first = await (await call('GET', '/v1/jobs?limit=2', 'oc_one')).json() as { items: Array<{ taskId: string; kind: string; status: string }>; nextBefore: string | null; hasMore: boolean }
    expect(first.items.map((item) => item.taskId)).toEqual([ids[2], ids[1]])
    // Two run at a time, so the newest waits its turn and is listed as such.
    expect(first.items[0]).toMatchObject({ kind: 'batch', status: 'queued' })
    expect(first.items[1]).toMatchObject({ kind: 'batch', status: 'running' })
    expect(first.hasMore).toBe(true)
    const second = await (await call('GET', `/v1/jobs?limit=2&before=${encodeURIComponent(first.nextBefore!)}`, 'oc_one')).json() as { items: Array<{ taskId: string }>; hasMore: boolean }
    expect(second.items.map((item) => item.taskId)).toEqual([ids[0]])
    expect(second.hasMore).toBe(false)
    expect((await call('GET', '/v1/jobs', null)).status).toBe(403)
    expect((await call('GET', '/v1/jobs?limit=0', 'oc_one')).status).toBe(400)
  })

  it('cancels a job of the account, frees its slot and queues the first slice of the job that takes it', async () => {
    const { call, enqueued } = await start({ credits: new MemoryCreditsStore(100_000) })
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(((await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })).json()) as { taskId: string }).taskId)
    expect((await call('POST', `/v1/batches/${ids[0]}/cancel`, 'oc_two')).status).toBe(404)
    expect(await (await call('POST', `/v1/batches/${ids[0]}/cancel`, 'oc_one')).json()).toMatchObject({ taskId: ids[0], status: 'cancelled' })
    // The two running jobs, the promoted one, and the cancelled one's last delivery.
    expect(enqueued.map((job) => job.id)).toEqual([ids[0], ids[1], ids[2], ids[0]])
    expect(await (await call('GET', `/v1/batches/${ids[2]}`, 'oc_one')).json()).toMatchObject({ status: 'running' })
  })

  it('exports a finished job by a signed link, and not one still running', async () => {
    const { call, store } = await start()
    const { taskId } = await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })).json() as { taskId: string }
    expect((await call('GET', `/v1/jobs/${taskId}/export`, 'oc_one')).status).toBe(409)
    store.jobs.set(taskId, { ...store.jobs.get(taskId)!, status: 'completed', finishedAt: new Date().toISOString(), expireAt: new Date(Date.now() + 86_400_000).toISOString() })
    expect(await (await call('GET', `/v1/jobs/${taskId}/export`, 'oc_one')).json()).toEqual({ url: `https://storage.example/${taskId}/export.jsonl.gz?signed`, expiresInSeconds: 900 })
    expect((await call('GET', `/v1/jobs/${taskId}/export`, 'oc_two')).status).toBe(404)
  })

  it('refuses starts while jobs are switched off, and cancels a job whose first slice could not be queued', async () => {
    const off = await start({ enabled: false })
    const paused = await off.call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })
    expect(paused.status).toBe(503)
    expect(((await paused.json()) as { code: string }).code).toBe('jobs_paused')
    await close?.(); close = undefined
    const down = await start({ failEnqueue: true })
    const failed = await down.call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })
    expect(failed.status).toBe(503)
    expect([...down.store.jobs.values()].map((job) => [job.status, job.failureReason])).toEqual([['failed', 'not_queued']])
    // Its slot is free again.
    expect([...down.store.slots.values()]).toMatchObject([{ running: [], queued: [] }])
  })
})
