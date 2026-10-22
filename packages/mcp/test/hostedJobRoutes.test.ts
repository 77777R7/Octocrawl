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

async function start(options: { credits?: MemoryCreditsStore; enabled?: boolean; allowed?: readonly string[]; failEnqueue?: boolean | ((job: HostedJob) => boolean); finish?: boolean; failFinish?: boolean } = {}) {
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
  const finished: HostedJob[] = []
  const credits = options.credits ?? new MemoryCreditsStore(1_000)
  const keys = new MemoryHostedKeys(new Map(Object.entries(KEYS).map(([key, record]) => [keyDigest(HASH_KEY, key), record])))
  const service = createHostedApi({
    port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys, oauthTokens: new MemoryHostedOAuthTokens(new Map()), quota: new MemoryHostedQuota(), credits,
    networkPolicy: hostedNetworkPolicy(), log: () => {},
    jobs: {
      store, files,
      enqueueSlice: async (job) => { if (options.failEnqueue === true || (typeof options.failEnqueue === 'function' && options.failEnqueue(job))) throw new Error('queue down'); enqueued.push(job) },
      enabled: async () => options.enabled ?? true,
      ...(options.finish ? { enqueueFinish: async (job: HostedJob) => { if (options.failFinish) throw new Error('queue down'); finished.push(job) } } : {}),
      ...(options.allowed === undefined ? {} : { allows: async (uid: string) => options.allowed!.includes(uid) }),
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
  return { call, store, enqueued, finished, credits, sliceWrote }
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
      const refused = await response.json() as { code: string; agentHints: string[] }
      expect(refused.code).toBe('jobs_need_account')
      expect(refused.agentHints[0]).toContain('sign in free for 1,000 credits a month')
      expect(refused.agentHints[0]).toContain('https://octocrawl.dev/signin/')
    }
    // Another route is refused with what hosted Octocrawl does serve, the jobs included.
    const monitors = await call('GET', '/v1/monitors', 'oc_one')
    expect(monitors.status).toBe(403)
    const unavailable = await monitors.json() as { code: string; error: string; agentHints: string[] }
    expect(unavailable).toMatchObject({ code: 'hosted_unavailable' })
    expect(unavailable.error).toContain('is not served by hosted Octocrawl: scrape and map, and with an account crawl and batch jobs')
    expect(unavailable.agentHints.join(' ')).not.toContain('later phase')
    expect((await call('POST', '/v1/batches', 'oc_nobody', { urls: urls(1) })).status).toBe(401)
    // Resume, handoff and the event streams are not hosted.
    for (const [method, path] of [['POST', '/v1/crawl/6f1c2a4e-1b2c-4d3e-8f90-0123456789ab/resume'], ['GET', '/v1/crawl/6f1c2a4e-1b2c-4d3e-8f90-0123456789ab/events']]) expect((await call(method!, path!, 'oc_one')).status, path).toBe(403)
  })

  it('refuses an option hosted jobs do not take by name, an authed mode, and a key without the browser lane asking for it', async () => {
    const { call } = await start()
    const options = await call('POST', '/v1/batches', 'oc_one', { urls: urls(1), robotsOverrides: [], useCached: true })
    expect(options.status).toBe(400)
    expect(((await options.json()) as { error: string }).error).toBe('hosted batch jobs do not take robotsOverrides, useCached')
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

  it('starts jobs only for the accounts on the list while it exists, and still lets an account read and cancel its jobs (H2 R2)', async () => {
    const { call, store, enqueued } = await start({ allowed: ['account-1'] })
    const started = await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })
    expect(started.status).toBe(202)
    const taskId = ((await started.json()) as { taskId: string }).taskId
    const refused = await call('POST', '/v1/crawl', 'oc_two', { url: 'https://example.com/' })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'jobs_invite_only', error: 'hosted batch and crawl jobs are open to invited accounts for now' })
    expect(enqueued.map((job) => job.id)).toEqual([taskId])
    // Taken off the list later, an account still reads, lists and cancels what it started.
    store.jobs.set(taskId, { ...store.jobs.get(taskId)!, uid: 'account-3', workspaceId: 'ws_account-3' })
    expect((await call('GET', `/v1/batches/${taskId}`, 'oc_two')).status).toBe(200)
    expect((await call('GET', '/v1/jobs', 'oc_two')).status).toBe(200)
    expect((await call('POST', `/v1/batches/${taskId}/cancel`, 'oc_two')).status).toBe(200)
  })

  it('takes a webhook for the job\'s end, returns its secret on the start alone, and no read shows it (H2 W1, W2)', async () => {
    const { call, store, enqueued } = await start()
    const webhook = { url: 'https://hooks.example.com/octocrawl', metadata: { run: 'r1' } }
    const started = await call('POST', '/v1/batches', 'oc_one', { urls: urls(1), webhook, idempotencyKey: 'hook-1' })
    expect(started.status).toBe(202)
    const body = await started.json() as { taskId: string; webhook: { url: string; events: string[]; secret: string; delivery: null } }
    expect(body.webhook).toMatchObject({ url: webhook.url, events: ['completed', 'failed', 'cancelled'], delivery: null })
    expect(body.webhook.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    // The secret is kept to sign with; the request the engine runs has no webhook.
    expect(store.jobs.get(body.taskId)?.webhook?.secret).toBe(body.webhook.secret)
    expect(enqueued[0]?.request).not.toHaveProperty('webhook')
    // A retried start, whose first answer may have been lost, gets the same secret again.
    expect(await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1), webhook, idempotencyKey: 'hook-1' })).json()).toMatchObject({ taskId: body.taskId, replayed: true, webhook: { secret: body.webhook.secret } })
    for (const read of [
      await (await call('GET', `/v1/batches/${body.taskId}`, 'oc_one')).text(),
      await (await call('GET', '/v1/jobs', 'oc_one')).text(),
    ]) {
      expect(read).toContain(webhook.url)
      expect(read).not.toContain('whsec_')
    }
    // A string is the url alone; the events can be narrowed to the job's end.
    expect((await call('POST', '/v1/crawl', 'oc_one', { url: 'https://example.com/', webhook: { url: webhook.url, events: ['failed'] } })).status).toBe(202)
  })

  it('refuses a webhook hosted cannot send: not https, not public, with headers or secretEnv, or for events other than the end', async () => {
    const { call, enqueued } = await start()
    for (const [webhook, message] of [
      ['http://hooks.example.com/', /https/],
      ['https://127.0.0.1/hook', /public/],
      ['https://10.0.0.8/hook', /public/],
      [{ url: 'https://hooks.example.com/', headers: { authorization: 'x' } }, /headers/],
      [{ url: 'https://hooks.example.com/', secretEnv: 'W2L_WEBHOOK_SECRET_A' }, /secretEnv/],
      [{ url: 'https://hooks.example.com/', events: ['page'] }, /only their end/],
      [{ url: 'https://hooks.example.com/', retries: 3 }, /unknown webhook option/],
    ] as const) {
      const refused = await call('POST', '/v1/batches', 'oc_one', { urls: urls(1), webhook })
      expect(refused.status, JSON.stringify(webhook)).toBe(400)
      expect(((await refused.json()) as { error: string }).error).toMatch(message)
    }
    expect(enqueued).toEqual([])
  })

  it('reads on from the cursor an MCP answer cut for size gives, after the page it names, across slices', async () => {
    const { call, sliceWrote } = await start()
    const taskId = ((await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(5) })).json()) as { taskId: string }).taskId
    const page = (n: number) => ({ id: `step-${n}`, createdAt: `2026-10-21T18:20:4${n}.000Z`, url: `https://example.com/p/${n}`, status: 'success' })
    await sliceWrote(taskId, [page(0), page(1), page(2)])
    await sliceWrote(taskId, [page(3), page(4)])
    // The MCP layer cuts an answer at its size budget and names the last page it kept, as the local API's cursors do.
    const after = (n: number) => Buffer.from(JSON.stringify({ createdAt: page(n).createdAt, id: page(n).id }), 'utf8').toString('base64url')
    const rest = await (await call('GET', `/v1/batches/${taskId}/items?limit=100&cursor=${after(1)}`, 'oc_one')).json() as { items: Array<{ url: string }>; hasMore: boolean; nextCursor: string | null }
    expect(rest.items.map((item) => item.url)).toEqual([2, 3, 4].map((n) => `https://example.com/p/${n}`))
    expect(rest).toMatchObject({ hasMore: false, nextCursor: null })
    const limited = await (await call('GET', `/v1/batches/${taskId}/items?limit=1&cursor=${after(2)}`, 'oc_one')).json() as { items: Array<{ url: string }>; nextCursor: string }
    expect(limited.items.map((item) => item.url)).toEqual(['https://example.com/p/3'])
    // The cursor it answers is its own again, and reads on from there.
    expect((await (await call('GET', `/v1/batches/${taskId}/items?limit=100&cursor=${limited.nextCursor}`, 'oc_one')).json() as { items: Array<{ url: string }> }).items.map((item) => item.url)).toEqual(['https://example.com/p/4'])
    // A page the job does not hold, or a cursor of neither kind, is refused.
    const gone = Buffer.from(JSON.stringify({ createdAt: '2026-10-21T00:00:00.000Z', id: 'step-9' }), 'utf8').toString('base64url')
    expect((await call('GET', `/v1/batches/${taskId}/items?cursor=${gone}`, 'oc_one')).status).toBe(400)
    expect((await call('GET', `/v1/batches/${taskId}/items?cursor=nonsense`, 'oc_one')).status).toBe(400)
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

  it('finishes a cancelled job at once by its own delivery, unless a slice holding the lease will (H2 webhook gaps)', async () => {
    const { call, store, enqueued, finished } = await start({ credits: new MemoryCreditsStore(100_000), finish: true })
    const ids: string[] = []
    for (let i = 0; i < 2; i++) ids.push(((await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1) })).json()) as { taskId: string }).taskId)
    // Waiting for a delayed slice (no lease): its last delivery goes at once, by the finish route, not the slice's name.
    await call('POST', `/v1/batches/${ids[0]}/cancel`, 'oc_one')
    expect(finished.map((job) => [job.id, job.status])).toEqual([[ids[0], 'cancelled']])
    // A slice holds the lease: it finishes the job when it commits, so nothing more is queued.
    store.jobs.set(ids[1]!, { ...store.jobs.get(ids[1]!)!, lease: { holder: 'h1', expireAt: new Date(Date.now() + 60_000).toISOString() } })
    await call('POST', `/v1/batches/${ids[1]}/cancel`, 'oc_one')
    expect(finished.map((job) => job.id)).toEqual([ids[0]])
    expect(enqueued.map((job) => job.id)).toEqual([ids[0], ids[1]])
  })

  it('posts nothing for a job its start answered 503, and says why; finishes a promoted job the queue then refused (H2 webhook gaps)', async () => {
    const webhook = { url: 'https://hooks.example.com/octocrawl' }
    const atStart = await start({ failEnqueue: true, finish: true })
    expect((await atStart.call('POST', '/v1/batches', 'oc_one', { urls: urls(1), webhook })).status).toBe(503)
    const [failedAtStart] = [...atStart.store.jobs.values()]
    expect(failedAtStart).toMatchObject({ status: 'failed', failureReason: 'not_queued', webhook: { delivery: { state: 'failed', attempts: 0, error: expect.stringMatching(/never queued.*503/) } } })
    expect(atStart.finished).toEqual([])
    // Two run and a third waits with a webhook; the queue refuses the third when it is promoted, so its end is delivered.
    let calls = 0
    const promotedLater = await start({ credits: new MemoryCreditsStore(100_000), finish: true, failEnqueue: () => ++calls === 3 })
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(((await (await promotedLater.call('POST', '/v1/batches', 'oc_one', { urls: urls(1), ...(i === 2 ? { webhook } : {}) })).json()) as { taskId: string }).taskId)
    await promotedLater.call('POST', `/v1/batches/${ids[0]}/cancel`, 'oc_one')
    expect(promotedLater.store.jobs.get(ids[2]!)).toMatchObject({ status: 'failed', failureReason: 'not_queued' })
    // The promoted job is handled before the cancelled one's own last delivery.
    expect(promotedLater.finished.map((job) => job.id)).toEqual([ids[2], ids[0]])
    // When the finish delivery is refused as well, the webhook records that it was not sent.
    let more = 0
    const queueGone = await start({ credits: new MemoryCreditsStore(100_000), finish: true, failFinish: true, failEnqueue: () => ++more === 3 })
    const others: string[] = []
    for (let i = 0; i < 3; i++) others.push(((await (await queueGone.call('POST', '/v1/batches', 'oc_one', { urls: urls(1), ...(i === 2 ? { webhook } : {}) })).json()) as { taskId: string }).taskId)
    await queueGone.call('POST', `/v1/batches/${others[0]}/cancel`, 'oc_one')
    expect(queueGone.store.jobs.get(others[2]!)?.webhook?.delivery).toMatchObject({ state: 'failed', error: expect.stringMatching(/could not be queued/) })
  })

  it('never records a webhook as not sent over one delivered, nor when a queued slice can still post it', async () => {
    const webhook = { url: 'https://hooks.example.com/octocrawl' }
    const { call, store } = await start({ credits: new MemoryCreditsStore(100_000), finish: true, failFinish: true })
    const ids: string[] = []
    for (let i = 0; i < 2; i++) ids.push(((await (await call('POST', '/v1/batches', 'oc_one', { urls: urls(1), webhook })).json()) as { taskId: string }).taskId)
    // A job already finished and posted: a cancel's refused delivery leaves "delivered" as it was.
    const done = store.jobs.get(ids[0]!)!
    store.jobs.set(ids[0]!, { ...done, status: 'completed', finishedAt: new Date().toISOString(), webhook: { ...done.webhook!, delivery: { state: 'delivered', attempts: 1, httpStatus: 200, error: null, at: new Date().toISOString() } } })
    await call('POST', `/v1/batches/${ids[0]}/cancel`, 'oc_one')
    expect(store.jobs.get(ids[0]!)?.webhook?.delivery).toMatchObject({ state: 'delivered' })
    // A running job cancelled while its slice waits in the queue: a refused delivery records nothing, the slice posts it later.
    await call('POST', `/v1/batches/${ids[1]}/cancel`, 'oc_one')
    expect(store.jobs.get(ids[1]!)).toMatchObject({ status: 'cancelled', webhook: { delivery: null } })
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
