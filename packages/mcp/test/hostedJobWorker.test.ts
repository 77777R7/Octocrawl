import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { localNetworkPolicy, parseBatchStartRequest, parseCrawlStartRequest } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { MemoryHostedLeases } from '../src/hostedApi.js'
import { MemoryCreditsStore } from '../src/hostedCredits.js'
import { MemoryHostedJobStore, newHostedJob, type HostedJob, type HostedJobWebhook } from '../src/hostedJobs.js'
import { exportName } from '../src/hostedJobRoutes.js'
import { HostedModel, MemoryModelSettings, MemoryModelSpend, MODEL_REFUSALS } from '../src/hostedModel.js'
import { MemoryHostedAccess } from '../src/hostedAccess.js'
import { googleOidcVerifier, runJobExpiry, runJobSlice, runJobWebhook, startJobWorker, WEBHOOK_MAX_ATTEMPTS, type JobWorkerDeps, type WorkerFiles } from '../src/hostedJobWorker.js'
import { createHmac, generateKeyPairSync, sign } from 'node:crypto'
import type { WebhookTransportRequest } from '@w2l/runtime'

// The hosted job worker (ROADMAP PH H1, docs/h1-hosted-jobs-tasks.md PR ④): deliveries run a job a slice at a time on a
// real engine against a local site; the job store, the bucket and the queue are in memory.

const NOW = new Date('2026-10-19T08:00:00Z')

function page(path: string): string {
  const links = path === '/' ? ['/a', '/b', '/c', '/d'] : []
  return `<!doctype html><html><head><title>Page ${path}</title></head><body><main><article><h1>Page ${path}</h1><p>This is page ${path} of a small worker fixture. It carries enough prose for the extraction cascade to take it as the main content of an article, so every page here is a contentful success.</p><ul>${links.map((href) => `<li><a href="${href}">${href}</a></li>`).join('')}</ul></article></main></body></html>`
}

/** An in-memory bucket with generations and ifGenerationMatch, as GcsBucket answers. */
class MemoryFiles implements WorkerFiles {
  readonly objects = new Map<string, { body: Uint8Array; generation: number }>()
  private generation = 0
  onUpload?: (name: string) => void
  async upload(name: string, body: Uint8Array, options: { contentType: string; ifGenerationMatch?: number }) {
    this.onUpload?.(name)
    if (options.ifGenerationMatch !== undefined && options.ifGenerationMatch !== (this.objects.get(name)?.generation ?? 0)) return { ok: false as const, reason: 'precondition' as const }
    this.objects.set(name, { body, generation: ++this.generation })
    return { ok: true as const, generation: this.generation }
  }
  async download(name: string) { return this.objects.get(name) ?? null }
  async deletePrefix(prefix: string) { let n = 0; for (const name of [...this.objects.keys()]) if (name.startsWith(prefix)) { this.objects.delete(name); n++ } return n }
}

describe('hosted job worker', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function setup(options: { balance?: number; limits?: Partial<NonNullable<JobWorkerDeps['limits']>>; gate?: string; clock?: { t: Date }; model?: HostedModel } = {}) {
    const seen: string[] = []
    const handler = async (req: IncomingMessage, res: ServerResponse) => {
      const path = req.url ?? '/'
      if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      if (path === '/sitemap.xml') { res.writeHead(404).end(); return }
      seen.push(path)
      if (path === options.gate) return
      if (path === '/archive.tar.bz2') { res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(Buffer.alloc(6 * 1024 * 1024, 7)); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(path))
    }
    const server = createServer(handler)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const workRoot = await mkdtemp(join(tmpdir(), 'octocrawl-worker-'))
    cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(workRoot, { recursive: true, force: true }) })
    const store = new MemoryHostedJobStore()
    const credits = new MemoryCreditsStore(options.balance ?? 1_000)
    const files = new MemoryFiles()
    const queue: Array<{ jobId: string; generation: number; delaySeconds: number }> = []
    const expiries: string[] = []
    const webhooks: string[] = []
    const posts: WebhookTransportRequest[] = []
    const receiver = { answer: (): number | Error => 204 }
    const hostLeases = new MemoryHostedLeases()
    const clock = options.clock ?? { t: NOW }
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const deps: JobWorkerDeps = {
      store, credits, files, hostLeases, workRoot, pollMs: 20, log: () => {}, now: () => clock.t,
      enqueueSlice: async (job, delaySeconds = 0) => { queue.push({ jobId: job.id, generation: job.generation, delaySeconds }) },
      enqueueExpiry: async (job) => { expiries.push(job.id) },
      enqueueWebhook: async (job) => { if (!webhooks.includes(job.id)) webhooks.push(job.id) },
      webhookTransport: async (request) => { posts.push(request); const answer = receiver.answer(); if (answer instanceof Error) throw answer; return { status: answer, retryAfter: null } },
      engineOptions: () => ({ networkPolicy: policy, hosted: false, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('worker tests stay on HTTP') } } } }) }),
      limits: { slicePages: 2, sliceMs: 30_000, graceMs: 2_000, ...options.limits },
      ...(options.model === undefined ? {} : { model: options.model }),
    }
    let n = 0
    const create = async (request: unknown, kind: 'batch' | 'crawl' = 'batch', maxCredits: number | null = null, webhook: HostedJobWebhook | null = null) => {
      const id = `6f1c2a4e-1b2c-4d3e-8f90-${String(++n).padStart(12, '0')}`
      const created = await store.create(newHostedJob({ id, workspaceId: 'ws_account-1', uid: 'account-1', keyId: 'key-1', kind, request, maxCredits, webhook }, clock.t), { maxRunning: 2, maxQueued: 10 }, null, clock.t)
      if (!created.ok) throw new Error('not created')
      queue.push({ jobId: id, generation: 0, delaySeconds: 0 })
      return id
    }
    /** Runs the queued deliveries for a job, in order, until none is left or `max` ran. */
    const drain = async (id: string, max = 20) => {
      const outcomes: string[] = []
      for (let i = 0; i < max; i++) {
        const at = queue.findIndex((task) => task.jobId === id)
        if (at < 0) break
        const [task] = queue.splice(at, 1)
        outcomes.push((await runJobSlice(deps, task!.jobId, task!.generation)).outcome)
      }
      return outcomes
    }
    const exportLines = (job: HostedJob) => { const object = files.objects.get(exportName(job)); return object === undefined ? null : gunzipSync(object.body).toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { url: string; status: string }) }
    return { origin, seen, store, credits, files, queue, expiries, webhooks, posts, receiver, hostLeases, deps, create, drain, exportLines, clock }
  }

  it('runs a batch a slice at a time to the end: each URL read once, pages and credits counted, segments, export and expiry written', async () => {
    const { origin, seen, store, credits, files, expiries, create, drain, exportLines } = await setup()
    const urls = ['/a', '/b', '/c', '/d', '/'].map((path) => `${origin}${path}`)
    const id = await create(parseBatchStartRequest({ urls, fastMode: true }))
    const outcomes = await drain(id)
    expect(outcomes.at(-1)).toBe('completed')
    // Slices of two pages; a drain lets the page in flight finish, so a slice may store three.
    expect(outcomes.length).toBeGreaterThanOrEqual(2)
    expect([...seen].sort()).toEqual(['/', '/a', '/b', '/c', '/d'])
    const job = (await store.get(id))!
    expect(job).toMatchObject({ status: 'completed', counts: { pages: 5, errors: 0 }, credits: { used: 5 } })
    expect(await credits.balance('account-1', NOW)).toBe(995)
    expect(credits.usage.get('account-1-2026-10-19')).toMatchObject({ http: 5, credits: 5 })
    expect(job.segments).toHaveLength(job.counts.slices)
    for (const name of job.segments!) expect(files.objects.has(name)).toBe(true)
    expect(exportLines(job)?.map((item) => new URL(item.url).pathname).sort()).toEqual(['/', '/a', '/b', '/c', '/d'])
    expect(expiries).toEqual([id])
    // The day's job pools counted the pages each slice reserved.
    expect(credits.site.get('2026-10-19-jobs-account-account-1')).toBeGreaterThanOrEqual(5)
  })

  it('gives a slice\'s pages the compatible transport while the switch grants it to the job\'s account, at an HTTP page\'s price', async () => {
    const { origin, deps, credits, create, drain } = await setup()
    const compat: string[] = []
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    deps.engineOptions = () => ({ networkPolicy: policy, hosted: false, compatHosts: ['127.0.0.1'], channelsFor: (mode) => {
      const channels = buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('worker tests stay on HTTP') } } } })
      const http = channels.find((channel) => channel.id === 'http')!
      // The http rung's own fetch, counted, stands in for the transport: the worker's part is which pages hold it.
      return [...channels, { ...http, id: 'http_compat', fetch: (url, session, execution, options) => { compat.push(new URL(url).pathname); return http.fetch(url, session, execution, options) } }]
    } })
    deps.access = new MemoryHostedAccess({ compatibleTransport: { enabled: true, allowedUids: ['account-1'] } })
    const granted = await create(parseBatchStartRequest({ urls: ['/a', '/b'].map((path) => `${origin}${path}`), fastMode: true }))
    expect((await drain(granted)).at(-1)).toBe('completed')
    expect(compat.sort()).toEqual(['/a', '/b'])
    expect(await credits.balance('account-1', NOW)).toBe(998)
    // Granted to another account now: the next job's slices hold nothing.
    compat.length = 0
    deps.access = new MemoryHostedAccess({ compatibleTransport: { enabled: true, allowedUids: ['account-2'] } })
    const other = await create(parseBatchStartRequest({ urls: ['/c', '/d'].map((path) => `${origin}${path}`), fastMode: true }))
    expect((await drain(other)).at(-1)).toBe('completed')
    expect(compat).toEqual([])
  })

  it('takes the day\'s job pool and credits for the pages a job has left, not a whole slice (no headroom on its last slice)', async () => {
    const { origin, credits, create, drain } = await setup({ limits: { slicePages: 100 } })
    const id = await create(parseBatchStartRequest({ urls: ['/a', '/b', '/c'].map((path) => `${origin}${path}`), fastMode: true }))
    expect((await drain(id)).at(-1)).toBe('completed')
    expect(credits.site.get('2026-10-19-jobs-account-account-1')).toBe(3)
    const crawl = await create(parseCrawlStartRequest({ url: `${origin}/`, maxPages: 2, fastMode: true }), 'crawl')
    await drain(crawl)
    expect(credits.site.get('2026-10-19-jobs-account-account-1')).toBe(5)
  })

  it('logs once when the day\'s job pool for every account reaches 70%, and never for one account\'s pool', async () => {
    const { origin, deps, create, drain } = await setup({ limits: { jobsDaily: 10 } })
    const lines: string[] = []
    deps.log = (line) => lines.push(line)
    const id = await create(parseBatchStartRequest({ urls: ['/a', '/b', '/c', '/d', '/e', '/f', '/g', '/h'].map((path) => `${origin}${path}`), fastMode: true }))
    await drain(id)
    const alerts = lines.map((line) => JSON.parse(line) as { event?: string; pool?: string; limit?: number; count?: number }).filter((line) => line.event === 'hosted_quota_threshold')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ pool: 'jobs', day: '2026-10-19', limit: 10 })
    expect(alerts[0]!.count).toBeGreaterThanOrEqual(7)
  })

  it('reads under hosted Octocrawl\'s 5 MiB file cap, as a scrape does', async () => {
    const { origin, store, files, deps, create, drain } = await setup()
    // The engine's own channels, as in production: the test's channels are built on a policy of their own.
    const base = deps.engineOptions!()
    deps.engineOptions = () => ({ ...base, channelsFor: undefined })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/archive.tar.bz2`, `${origin}/a`], fastMode: true }))
    expect((await drain(id)).at(-1)).toBe('completed')
    const job = (await store.get(id))!
    const items = gunzipSync(files.objects.get(job.segments![0]!)!.body).toString('utf8').split('\n').map((line) => JSON.parse(line) as { url: string; status: string; failureReason: string | null; markdown: string | null })
    const archive = items.find((item) => item.url.endsWith('.tar.bz2'))!
    expect(archive).toMatchObject({ status: 'failed', failureReason: 'body_too_large' })
    expect(archive.markdown ?? '').toHaveLength(0)
  })

  it('records where a crawl stopped for its page budget, and reads a small first slice so progress shows early (H1 V4, V5)', async () => {
    const { origin, store, create, drain } = await setup({ limits: { slicePages: 100, firstSlicePages: 2 } })
    const crawl = await create(parseCrawlStartRequest({ url: `${origin}/`, maxPages: 3, fastMode: true }), 'crawl')
    await drain(crawl, 1)
    // The first slice stops after two pages (one more may finish in flight), and its pages are committed for reading.
    expect((await store.get(crawl))?.counts.pages).toBeGreaterThanOrEqual(2)
    expect((await store.get(crawl))?.counts.slices).toBe(1)
    await drain(crawl)
    expect(await store.get(crawl)).toMatchObject({ status: 'completed', budgetExceeded: 'pages' })
  })

  it('runs a crawl in slices under its maxPages', async () => {
    const { origin, seen, store, create, drain } = await setup()
    const id = await create(parseCrawlStartRequest({ url: `${origin}/`, maxPages: 3, fastMode: true }), 'crawl')
    expect((await drain(id)).at(-1)).toBe('completed')
    expect(seen.filter((path) => path !== '/sitemap.xml')).toHaveLength(3)
    expect(await store.get(id)).toMatchObject({ counts: { pages: 3 } })
  })

  it('drops a stale delivery, answers 503 while another slice holds the lease, and takes over a dead slice\'s lease once it expires without charging twice', async () => {
    const clock = { t: NOW }
    const { origin, store, credits, files, deps, create, drain } = await setup({ clock })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`, `${origin}/b`], fastMode: true }))
    expect(await runJobSlice(deps, id, 7)).toEqual({ status: 200, outcome: 'stale' })
    // The first slice dies while writing its pages: its reservation stays on the job, its lease stays held.
    files.onUpload = (name) => { if (name.includes('/pages/')) { files.onUpload = undefined; throw new Error('instance died') } }
    await expect(runJobSlice(deps, id, 0)).rejects.toThrow(/died/)
    // Its reservation stays on the job for the next delivery, its credits came back as it ended, and it gave the lease back.
    expect((await store.get(id))?.reservation).toMatchObject({ used: null })
    expect(await store.get(id)).toMatchObject({ lease: null, failedAttempts: 1 })
    expect(await credits.balance('account-1', clock.t)).toBe(1_000)
    // A slice that died without giving its lease back (a crash) holds it until it expires: deliveries meanwhile are 503.
    await store.acquireLease(id, { generation: 0, holder: 'crashed', ttlMs: 30 * 60_000 }, clock.t)
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 503, outcome: 'busy' })
    clock.t = new Date(NOW.getTime() + 60 * 60_000)
    expect((await drain(id)).at(-1)).toBe('completed')
    expect(await runJobSlice(deps, id, 0)).toMatchObject({ status: 200 })
    expect(await store.get(id)).toMatchObject({ status: 'completed', credits: { used: 2 }, counts: { pages: 2 } })
    expect(await credits.balance('account-1', clock.t)).toBe(998)
  })

  it('does not stick when a commit fails after the slice wrote its files: the next delivery reads again from the committed checkpoint, and charges once', async () => {
    const clock = { t: NOW }
    const { origin, store, credits, deps, create, drain } = await setup({ clock })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`, `${origin}/b`], fastMode: true }))
    const commitSlice = store.commitSlice.bind(store)
    let fail = true
    store.commitSlice = async (...args) => { if (fail && (await store.get(id))?.reservation) { fail = false; throw new Error('commit timed out') } return commitSlice(...args) }
    await expect(runJobSlice(deps, id, 0)).rejects.toThrow(/timed out/)
    clock.t = new Date(NOW.getTime() + 60 * 60_000)
    expect((await drain(id)).at(-1)).toBe('completed')
    const job = (await store.get(id))!
    expect(job).toMatchObject({ status: 'completed', counts: { pages: 2 }, credits: { used: 2 } })
    expect(await credits.balance('account-1', clock.t)).toBe(998)
  })

  it('charges the pages of a commit that applied before its answer was lost, once, from the reservation left on the job', async () => {
    const clock = { t: NOW }
    const { origin, store, credits, deps, create, drain } = await setup({ clock })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`, `${origin}/b`], fastMode: true }))
    const commitSlice = store.commitSlice.bind(store)
    let lose = true
    store.commitSlice = async (...args) => { const result = await commitSlice(...args); if (lose && result.ok && result.job.counts.slices > 0) { lose = false; throw new Error('answer lost') } return result }
    await expect(runJobSlice(deps, id, 0)).rejects.toThrow(/answer lost/)
    await drain(id)
    const job = (await store.get(id))!
    expect(job.credits.used).toBeGreaterThan(0)
    expect(await credits.balance('account-1', clock.t)).toBe(1_000 - job.credits.used)
  })

  it('keeps a reservation it could not settle on the job, and settles it on the retried delivery', async () => {
    const clock = { t: NOW }
    const { origin, store, credits, deps, create, drain } = await setup({ clock })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`, `${origin}/b`], fastMode: true }))
    // A slice dies, leaving its reservation; its own refund in finally fails too.
    const settle = credits.settle.bind(credits)
    let failures = 2
    credits.settle = async (...args) => { if (failures-- > 0) throw new Error('settle down'); return settle(...args) }
    const files = deps.files
    deps.files = { ...files, upload: async () => { throw new Error('instance died') }, download: files.download.bind(files), deletePrefix: files.deletePrefix.bind(files) }
    await expect(runJobSlice(deps, id, 0)).rejects.toThrow(/died/)
    deps.files = files
    clock.t = new Date(NOW.getTime() + 60 * 60_000)
    // The next delivery's settle fails: it answers with an error and the reservation stays.
    await expect(runJobSlice(deps, id, 0)).rejects.toThrow(/settle down/)
    expect((await store.get(id))?.reservation).toMatchObject({ used: null })
    clock.t = new Date(NOW.getTime() + 120 * 60_000)
    expect((await drain(id)).at(-1)).toBe('completed')
    const job = (await store.get(id))!
    expect(await credits.balance('account-1', clock.t)).toBe(1_000 - job.credits.used)
  })

  it('queues the first slice of the job promoted into a finished job\'s slot on the finished job\'s next delivery, if no one did', async () => {
    const { origin, store, deps, queue, drain } = await setup()
    const limits = { maxRunning: 1, maxQueued: 1 }
    const first = '6f1c2a4e-1b2c-4d3e-8f90-0000000000a1'
    const second = '6f1c2a4e-1b2c-4d3e-8f90-0000000000a2'
    for (const id of [first, second]) await store.create(newHostedJob({ id, workspaceId: 'ws_account-1', uid: 'account-1', keyId: 'k', kind: 'batch', request: parseBatchStartRequest({ urls: [`${origin}/a`], fastMode: true }), maxCredits: null }, NOW), limits, null, NOW)
    queue.push({ jobId: first, generation: 0, delaySeconds: 0 })
    const enqueue = deps.enqueueSlice
    let failed = false
    deps.enqueueSlice = async (job, delay) => { if (job.id === second && !failed) { failed = true; throw new Error('queue down') } return enqueue(job, delay) }
    await expect(drain(first)).rejects.toThrow(/queue down/)
    expect(await store.get(second)).toMatchObject({ status: 'running', startedAt: null })
    // Cloud Tasks retries the finished job's delivery: it queues the promoted job's first slice.
    expect(await runJobSlice(deps, first, 0)).toMatchObject({ outcome: 'finished' })
    expect(queue.filter((task) => task.jobId === second)).toEqual([{ jobId: second, generation: 0, delaySeconds: 0 }])
  })

  it('queues the next slice again when a queue error followed the commit: the retried delivery is stale and heals it', async () => {
    const { origin, store, credits, deps, queue, create, drain } = await setup({ limits: { slicePages: 1 } })
    const id = await create(parseBatchStartRequest({ urls: ['/a', '/b', '/c', '/d'].map((path) => `${origin}${path}`), fastMode: true }))
    const enqueue = deps.enqueueSlice
    let failed = false
    deps.enqueueSlice = async (job, delay) => { if (!failed) { failed = true; throw new Error('queue down') } return enqueue(job, delay) }
    queue.splice(0)
    await expect(runJobSlice(deps, id, 0)).rejects.toThrow(/queue down/)
    // Cloud Tasks retries the same delivery: it is stale now, and queues the job's current slice.
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'stale_requeued' })
    expect((await drain(id)).at(-1)).toBe('completed')
    const job = (await store.get(id))!
    expect(job.credits.used).toBe(job.counts.pages)
    expect(await credits.balance('account-1', NOW)).toBe(1_000 - job.counts.pages)
  })

  it('writes nothing and keeps no credits when its lease was taken over while it ran', async () => {
    const { origin, store, credits, files, deps, create } = await setup()
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`], fastMode: true }))
    const updateHeld = store.updateHeld.bind(store)
    store.updateHeld = async (...args) => {
      const result = await updateHeld(...args)
      const job = store.jobs.get(id)!
      if (job.reservation) store.jobs.set(id, { ...job, lease: { holder: 'another', expireAt: new Date(NOW.getTime() + 60_000).toISOString() } })
      return result
    }
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'lost' })
    expect([...files.objects.keys()].filter((name) => name.includes(id))).toEqual([])
    expect(await credits.balance('account-1', NOW)).toBe(1_000)
  })

  it('fails a job whose slice fails five times in a row, gives its slot back and writes its export (H1 D7)', async () => {
    const { origin, store, files, expiries, deps, create } = await setup()
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`], fastMode: true }))
    files.onUpload = (name) => { if (name.includes('/pages/')) throw new Error('bucket down') }
    for (let i = 0; i < 5; i++) await expect(runJobSlice(deps, id, 0)).rejects.toThrow(/bucket down/)
    expect(await store.get(id)).toMatchObject({ status: 'running', failedAttempts: 5, lease: null })
    files.onUpload = undefined
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'failed' })
    expect(await store.get(id)).toMatchObject({ status: 'failed', failureReason: 'delivery_failed' })
    expect(expiries).toEqual([id])
  })

  it('reads what the credits allow, then fails the job for credits; and stops at the job\'s maxCredits', async () => {
    const short = await setup({ balance: 3, limits: { slicePages: 5 } })
    const id = await short.create(parseBatchStartRequest({ urls: ['/a', '/b', '/c', '/d', '/'].map((path) => `${short.origin}${path}`), fastMode: true }))
    await short.drain(id)
    const shortJob = (await short.store.get(id))!
    expect(shortJob).toMatchObject({ status: 'failed', failureReason: 'credits_exhausted' })
    // Every page it stored was paid for, and no more than the balance was spent.
    expect(shortJob.credits.used).toBe(shortJob.counts.pages)
    expect(shortJob.credits.used).toBeLessThanOrEqual(3)
    expect(await short.credits.balance('account-1', NOW)).toBe(3 - shortJob.credits.used)
    const capped = await setup()
    const capId = await capped.create(parseBatchStartRequest({ urls: ['/a', '/b', '/c', '/d', '/'].map((path) => `${capped.origin}${path}`), fastMode: true }), 'batch', 3)
    await capped.drain(capId)
    const cappedJob = (await capped.store.get(capId))!
    expect(cappedJob).toMatchObject({ status: 'completed', failureReason: 'max_credits' })
    expect(cappedJob.credits.used).toBeLessThanOrEqual(3)
  })

  describe('the json model fallback on the job\'s credits (decided 2026-10-24)', () => {
    // A fake Anthropic Messages API on loopback stands in for Claude Haiku 5.5: no paid call is made.
    let messages: ReturnType<typeof createServer>
    let calls = 0
    beforeAll(async () => {
      messages = createServer((req, res) => {
        let raw = ''
        req.on('data', (chunk) => { raw += chunk })
        req.on('end', () => {
          calls++
          const body = JSON.parse(raw)
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: `msg_${calls}`, type: 'message', role: 'assistant', model: body.model, stop_sequence: null, stop_details: null, content: [{ type: 'text', text: JSON.stringify({ title: 'Page', office: 'the worker fixture' }), citations: null }], stop_reason: 'end_turn', usage: { input_tokens: 1_000, output_tokens: 40 } }))
        })
      })
      await new Promise<void>((resolve) => messages.listen(0, '127.0.0.1', resolve))
    })
    afterAll(async () => { await new Promise<void>((resolve) => messages.close(() => resolve())) })
    afterEach(() => { vi.unstubAllEnvs() })
    const configure = (enabled: boolean) => {
      calls = 0
      vi.stubEnv('W2L_EXTRACT_PROVIDER', 'anthropic')
      vi.stubEnv('W2L_EXTRACT_MODEL', 'claude-haiku-5-5')
      vi.stubEnv('W2L_EXTRACT_API_KEY', 'sk-ant-worker-test')
      vi.stubEnv('W2L_EXTRACT_BASE_URL', `http://127.0.0.1:${(messages.address() as AddressInfo).port}`)
      const spend = new MemoryModelSpend()
      return { spend, model: new HostedModel({ model: { provider: 'anthropic', model: 'claude-haiku-5-5' }, settings: new MemoryModelSettings({ enabled, dailyCapUsd: 5 }), spend, now: () => NOW, log: () => {} }) }
    }
    const formats = ['markdown', { type: 'json', modelFallback: true, schema: { type: 'object', properties: { title: { type: 'string' }, office: { type: 'string' } }, required: ['title', 'office'], additionalProperties: false } }]
    type Item = { url: string; status: string; json?: { issues: Array<{ code: string; message: string }>; modelUsage: { attempts: number } | null } }

    it('charges each page its read and two more where its json called the model, and settles the day\'s spend', async () => {
      const { model, spend } = configure(true)
      const { origin, store, credits, create, drain, exportLines } = await setup({ model })
      const id = await create(parseBatchStartRequest({ urls: ['/a', '/b', '/c'].map((path) => `${origin}${path}`), fastMode: true, formats }))
      expect((await drain(id)).at(-1)).toBe('completed')
      const job = (await store.get(id))!
      expect(calls).toBe(3)
      expect(job).toMatchObject({ counts: { pages: 3 }, credits: { used: 9 } })
      expect(await credits.balance('account-1', NOW)).toBe(991)
      expect(credits.usage.get('account-1-2026-10-19')).toMatchObject({ http: 3, model: 3, credits: 9 })
      expect((exportLines(job) as Item[]).every((item) => item.json?.modelUsage?.attempts === 1)).toBe(true)
      // Three calls of 1,000 input and 40 output tokens at $0.10 and $0.50 a million: 120 micro-USD each.
      expect(spend.spent.get('2026-10-19')).toBe(360)
    })

    it('reads a job\'s pages without the model, and charges nothing more, while the switch is off or the credits fall short', async () => {
      const off = configure(false)
      const first = await setup({ model: off.model })
      const id = await first.create(parseBatchStartRequest({ urls: ['/a', '/b'].map((path) => `${first.origin}${path}`), fastMode: true, formats }))
      await first.drain(id)
      const job = (await first.store.get(id))!
      expect(job).toMatchObject({ status: 'completed', credits: { used: 2 } })
      expect((first.exportLines(job) as Item[]).map((item) => item.json?.issues.find((issue) => issue.code === 'model_unavailable')?.message)).toEqual([MODEL_REFUSALS.switchedOff, MODEL_REFUSALS.switchedOff])
      // Two credits: a page (one) and the model (two) do not fit together, so the page is read without the model.
      const on = configure(true)
      const short = await setup({ balance: 2, model: on.model })
      const shortId = await short.create(parseBatchStartRequest({ urls: [`${short.origin}/a`], fastMode: true, formats }))
      await short.drain(shortId)
      const shortJob = (await short.store.get(shortId))!
      expect(shortJob).toMatchObject({ status: 'completed', credits: { used: 1 } })
      expect((short.exportLines(shortJob) as Item[])[0]!.json?.issues).toContainEqual({ code: 'model_unavailable', message: MODEL_REFUSALS.credits })
      expect(calls).toBe(0)
      expect(on.spend.spent.size).toBe(0)
    })

    it('calls no model for a job on a worker that does not offer it', async () => {
      configure(true)
      const { origin, store, create, drain, exportLines } = await setup()
      const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`], fastMode: true, formats }))
      await drain(id)
      const job = (await store.get(id))!
      expect(job.credits.used).toBe(1)
      expect(calls).toBe(0)
      expect((exportLines(job) as Item[])[0]!.json?.issues).toContainEqual(expect.objectContaining({ code: 'model_unavailable' }))
    })
  })

  it('waits for the next UTC day at the day\'s job pool, and for a busy host', async () => {
    const pool = await setup({ limits: { jobsAccountDaily: 3 } })
    const id = await pool.create(parseBatchStartRequest({ urls: ['/a', '/b', '/c', '/d'].map((path) => `${pool.origin}${path}`), fastMode: true }))
    await pool.drain(id, 2)
    expect(pool.queue).toEqual([{ jobId: id, generation: 2, delaySeconds: 16 * 3_600 }])
    const busy = await setup()
    const busyId = await busy.create(parseBatchStartRequest({ urls: [`${busy.origin}/a`], fastMode: true }))
    await busy.hostLeases.acquire('host-127.0.0.1', 60_000, NOW)
    expect(await busy.drain(busyId, 1)).toEqual(['running'])
    expect(busy.queue).toEqual([{ jobId: busyId, generation: 1, delaySeconds: 30 }])
    expect(busy.seen).toEqual([])
  })

  it('fails a job whose slices store nothing twice in a row', async () => {
    const { origin, store, create, drain } = await setup({ gate: '/a', limits: { sliceMs: 200, graceMs: 100 } })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`], fastMode: true }))
    await drain(id)
    expect(await store.get(id)).toMatchObject({ status: 'failed', failureReason: 'no_progress', idleSlices: 2 })
  })

  it('writes the export of a job cancelled between slices on its last delivery, and expires it later', async () => {
    const { origin, store, files, expiries, deps, create, drain, exportLines } = await setup()
    const id = await create(parseBatchStartRequest({ urls: ['/a', '/b', '/c', '/d', '/'].map((path) => `${origin}${path}`), fastMode: true }))
    await drain(id, 1)
    expect((await store.get(id))?.status).toBe('running')
    await store.cancel(id, 'ws_account-1', NOW)
    expect(await runJobSlice(deps, id, 1)).toEqual({ status: 200, outcome: 'finished' })
    const job = (await store.get(id))!
    expect(exportLines(job)).toHaveLength(job.counts.pages + job.counts.errors)
    expect(expiries).toEqual([id])
    expect(await runJobExpiry(deps, id)).toEqual({ status: 200, outcome: 'expired' })
    expect([...files.objects.keys()].filter((name) => name.includes(id))).toEqual([])
    expect(await store.get(id)).toMatchObject({ status: 'expired' })
  })

  it('answers 503 to a cancelled job\'s delivery while its slice still holds the lease, so the slice\'s pages are charged once', async () => {
    const clock = { t: NOW }
    const { origin, store, credits, files, deps, create, exportLines } = await setup({ clock })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`, `${origin}/b`], fastMode: true }))
    // The job is cancelled after the slice read its pages and before it committed; another delivery arrives meanwhile.
    const upload = files.upload.bind(files)
    let during: Awaited<ReturnType<typeof runJobSlice>> | null = null
    deps.files = { ...files, download: files.download.bind(files), deletePrefix: files.deletePrefix.bind(files), upload: async (name, body, options) => {
      if (during === null && name.includes('/pages/')) {
        await store.cancel(id, 'ws_account-1', clock.t)
        during = await runJobSlice(deps, id, 0)
      }
      return upload(name, body, options)
    } }
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'cancelled' })
    const job = (await store.get(id))!
    expect(job).toMatchObject({ status: 'cancelled', lease: null, counts: { pages: 2 }, credits: { used: 2 } })
    expect(await credits.balance('account-1', clock.t)).toBe(998)
    expect(exportLines(job)).toHaveLength(2)
    expect(during).toEqual({ status: 503, outcome: 'busy' })
    // Cloud Tasks retries the delivery: the slice committed, so it finishes the job again and charges nothing more.
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'finished' })
    expect(await credits.balance('account-1', clock.t)).toBe(998)
  })

  it('keeps a slice that outlived its lease on a cancelled job from committing pages the job\'s finish already gave back', async () => {
    const clock = { t: NOW }
    const { origin, store, credits, files, deps, create, exportLines } = await setup({ clock })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`, `${origin}/b`], fastMode: true }))
    // The job is cancelled while its slice runs; the slice is still alive past its lease when another delivery arrives.
    const upload = files.upload.bind(files)
    let during: Awaited<ReturnType<typeof runJobSlice>> | null = null
    deps.files = { ...files, download: files.download.bind(files), deletePrefix: files.deletePrefix.bind(files), upload: async (name, body, options) => {
      if (during === null && name.includes('/pages/')) {
        await store.cancel(id, 'ws_account-1', clock.t)
        clock.t = new Date(NOW.getTime() + 20 * 60_000)
        during = await runJobSlice(deps, id, 0)
      }
      return upload(name, body, options)
    } }
    // That delivery finished the job and gave the slice's reservation back: the slice commits nothing, so nothing it read
    // is counted or exported without being charged.
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'lost' })
    expect(during).toEqual({ status: 200, outcome: 'finished' })
    const job = (await store.get(id))!
    expect(job).toMatchObject({ status: 'cancelled', lease: null, counts: { pages: 0 }, credits: { used: 0 } })
    expect(await credits.balance('account-1', clock.t)).toBe(1_000)
    expect(exportLines(job)).toEqual([])
  })

  it('finishes a cancelled job whose slice died holding the lease once the lease expires, giving the slice\'s credits back', async () => {
    const clock = { t: NOW }
    const { origin, store, credits, expiries, deps, create } = await setup({ clock })
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`], fastMode: true }))
    // A slice reserved its credits and died (a crash): its lease and its reservation stay on the job; then the job is cancelled.
    const leased = await store.acquireLease(id, { generation: 0, holder: 'crashed', ttlMs: 30 * 60_000 }, clock.t)
    if (!leased.ok) throw new Error('not leased')
    const reserved = await credits.reserve('account-1', 5, [], clock.t, `${id}-0-crashed`)
    if (!reserved.ok) throw new Error('not reserved')
    await store.updateHeld(id, 'crashed', (j) => ({ ...j, reservation: { reservation: reserved.reservation, used: null } }))
    await store.cancel(id, 'ws_account-1', clock.t)
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 503, outcome: 'busy' })
    expect(expiries).toEqual([])
    clock.t = new Date(NOW.getTime() + 60 * 60_000)
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'finished' })
    expect(expiries).toEqual([id])
    expect(await credits.balance('account-1', clock.t)).toBe(1_000)
  })

  const WEBHOOK: HostedJobWebhook = { url: 'https://hooks.example.com/octocrawl', events: ['completed', 'failed', 'cancelled'], metadata: { run: 'r1' }, secret: 'whsec_test', delivery: null }

  it('posts a finished job\'s end to its webhook once, signed with the job\'s secret, and records it delivered (H2 W3)', async () => {
    const { origin, store, webhooks, posts, deps, create, drain } = await setup()
    const id = await create(parseBatchStartRequest({ urls: ['/a', '/b'].map((path) => `${origin}${path}`), fastMode: true }), 'batch', null, WEBHOOK)
    expect((await drain(id)).at(-1)).toBe('completed')
    // A later delivery of the finished job runs its end again; the webhook is queued by one name.
    expect(await runJobSlice(deps, id, 0)).toMatchObject({ outcome: 'finished' })
    expect(webhooks).toEqual([id])
    expect(await runJobWebhook(deps, id, 0)).toEqual({ status: 200, outcome: 'delivered' })
    expect(posts).toHaveLength(1)
    const post = posts[0]!
    expect(post.url).toBe(WEBHOOK.url)
    const expected = `sha256=${createHmac('sha256', 'whsec_test').update(`${post.headers['x-w2l-timestamp']}.${post.body}`).digest('hex')}`
    expect(post.headers['x-w2l-signature']).toBe(expected)
    expect(post.headers['x-w2l-event-id']).toBe(`${id}:completed`)
    const body = JSON.parse(post.body) as Record<string, unknown>
    expect(body).toMatchObject({ schemaVersion: 'w2l.job-event/v1', eventId: `${id}:completed`, sequence: 3, jobId: id, jobKind: 'batch', event: 'completed', metadata: { run: 'r1' }, report: { taskId: id, status: 'completed', succeeded: 2 } })
    expect(post.body).not.toContain('whsec_')
    expect((await store.get(id))?.webhook?.delivery).toMatchObject({ state: 'delivered', attempts: 1, httpStatus: 204, error: null })
    // A delivery Cloud Tasks repeats sends nothing more.
    expect(await runJobWebhook(deps, id, 1)).toEqual({ status: 200, outcome: 'delivered' })
    expect(posts).toHaveLength(1)
  })

  it('retries a receiver that is down up to its limit, fails a refusal at once, and posts only the events asked for', async () => {
    const { origin, store, webhooks, posts, receiver, deps, create, drain } = await setup()
    const urls = (path: string) => [`${origin}${path}`]
    const down = await create(parseBatchStartRequest({ urls: urls('/a'), fastMode: true }), 'batch', null, WEBHOOK)
    await drain(down)
    receiver.answer = () => 503
    expect(await runJobWebhook(deps, down, 0)).toEqual({ status: 500, outcome: 'retry' })
    expect((await store.get(down))?.webhook?.delivery).toMatchObject({ state: 'pending', attempts: 1, httpStatus: 503 })
    receiver.answer = () => new Error('connect ECONNREFUSED')
    expect(await runJobWebhook(deps, down, 1)).toEqual({ status: 500, outcome: 'retry' })
    expect(await runJobWebhook(deps, down, WEBHOOK_MAX_ATTEMPTS - 1)).toEqual({ status: 200, outcome: 'failed' })
    expect((await store.get(down))?.webhook?.delivery).toMatchObject({ state: 'failed', attempts: WEBHOOK_MAX_ATTEMPTS, error: 'connect ECONNREFUSED' })

    const refused = await create(parseBatchStartRequest({ urls: urls('/b'), fastMode: true }), 'batch', null, WEBHOOK)
    await drain(refused)
    receiver.answer = () => 404
    expect(await runJobWebhook(deps, refused, 0)).toEqual({ status: 200, outcome: 'failed' })
    const denied = await create(parseBatchStartRequest({ urls: urls('/c'), fastMode: true }), 'batch', null, WEBHOOK)
    await drain(denied)
    receiver.answer = () => new Error('webhook egress denied: private address')
    expect(await runJobWebhook(deps, denied, 0)).toEqual({ status: 200, outcome: 'failed' })

    // A job that asked for its failure only is not posted when it completes.
    const quiet = await create(parseBatchStartRequest({ urls: urls('/d'), fastMode: true }), 'batch', null, { ...WEBHOOK, events: ['failed'] })
    const sent = posts.length
    await drain(quiet)
    expect(webhooks).not.toContain(quiet)
    expect(await runJobWebhook(deps, quiet, 0)).toEqual({ status: 200, outcome: 'not_requested' })
    expect(posts).toHaveLength(sent)
  })

  it('posts a cancelled job\'s end on its last delivery', async () => {
    const { origin, store, webhooks, posts, deps, create, drain } = await setup()
    const id = await create(parseBatchStartRequest({ urls: ['/a', '/b', '/c', '/d', '/'].map((path) => `${origin}${path}`), fastMode: true }), 'batch', null, WEBHOOK)
    await drain(id, 1)
    await store.cancel(id, 'ws_account-1', NOW)
    await runJobSlice(deps, id, 1)
    expect(webhooks).toEqual([id])
    expect(await runJobWebhook(deps, id, 0)).toEqual({ status: 200, outcome: 'delivered' })
    expect(JSON.parse(posts[0]!.body)).toMatchObject({ event: 'cancelled', report: { status: 'cancelled' } })
  })

  it('deletes what a slice wrote when the account was erased while it ran', async () => {
    const { origin, store, files, deps, create } = await setup()
    const id = await create(parseBatchStartRequest({ urls: [`${origin}/a`], fastMode: true }))
    files.onUpload = (name) => { if (name.includes('/checkpoints/')) store.jobs.delete(id) }
    expect(await runJobSlice(deps, id, 0)).toEqual({ status: 200, outcome: 'missing' })
    expect([...files.objects.keys()].filter((name) => name.includes(id))).toEqual([])
  })
})

describe('job worker service', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
  const certs = (async () => Response.json({ keys: [jwk] })) as unknown as typeof fetch
  const CLOCK = 1_790_000_000_000
  const token = (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const input = `${encode(header)}.${encode(claims)}`
    return `Bearer ${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
  }
  const good = { aud: 'https://jobs.example', email: 'tasks@octocrawl-test.iam.gserviceaccount.com', email_verified: true, iss: 'https://accounts.google.com', exp: CLOCK / 1000 + 60 }

  it('accepts Google\'s token for the queue\'s account and the worker\'s audience, and nothing else', async () => {
    const verify = googleOidcVerifier({ audience: good.aud, email: good.email }, certs, () => CLOCK)
    expect(await verify(token(good))).toBe(true)
    for (const [name, claims] of Object.entries({ audience: { ...good, aud: 'https://other.example' }, account: { ...good, email: 'someone@example.com' }, unverified: { ...good, email_verified: false }, issuer: { ...good, iss: 'https://evil.example' }, expired: { ...good, exp: CLOCK / 1000 - 1 } })) {
      expect(await verify(token(claims)), name).toBe(false)
    }
    expect(await verify(token(good, { alg: 'none', kid: 'k1' }))).toBe(false)
    expect(await verify(token(good, { alg: 'RS256', kid: 'other' }))).toBe(false)
    const tampered = token(good).replace(/\.([^.]+)\./, `.${Buffer.from(JSON.stringify({ ...good, email: 'x@y.z' })).toString('base64url')}.`)
    expect(await verify(tampered)).toBe(false)
    expect(await verify(null)).toBe(false)
    expect(await verify('Bearer nonsense')).toBe(false)
  })

  it('answers a delivery only with a valid token, on its routes, and runs the slice it names', async () => {
    const store = new MemoryHostedJobStore()
    const deps = { store, credits: new MemoryCreditsStore(), files: new MemoryFiles(), hostLeases: new MemoryHostedLeases(), workRoot: tmpdir(), enqueueSlice: async () => {}, enqueueExpiry: async () => {}, log: () => {} } as JobWorkerDeps
    const worker = await startJobWorker({ deps, verify: async (authorization) => authorization === 'Bearer ok', port: 0, host: '127.0.0.1' })
    try {
      const url = `http://127.0.0.1:${(worker.server.address() as AddressInfo).port}`
      const post = (path: string, body: unknown, authorization?: string) => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) })
      const job = '6f1c2a4e-1b2c-4d3e-8f90-000000000001'
      expect((await fetch(`${url}/health`)).status).toBe(200)
      expect((await post(`/internal/jobs/${job}/slice`, { generation: 0 })).status).toBe(401)
      expect((await post(`/internal/jobs/${job}/slice`, { generation: -1 }, 'Bearer ok')).status).toBe(400)
      expect((await post('/internal/jobs/not-a-job/slice', { generation: 0 }, 'Bearer ok')).status).toBe(404)
      expect(await (await post(`/internal/jobs/${job}/slice`, { generation: 0 }, 'Bearer ok')).json()).toEqual({ outcome: 'missing' })
      expect(await (await post(`/internal/jobs/${job}/expire`, {}, 'Bearer ok')).json()).toEqual({ outcome: 'missing' })
      expect((await post(`/internal/jobs/${job}/webhook`, {})).status).toBe(401)
      expect(await (await post(`/internal/jobs/${job}/webhook`, {}, 'Bearer ok')).json()).toEqual({ outcome: 'missing' })
    } finally { await worker.close() }
  })
})
