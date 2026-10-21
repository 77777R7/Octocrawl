/**
 * The hosted job worker (ROADMAP PH stage H1, docs/h1-hosted-jobs-tasks.md PR ④): one Cloud Tasks delivery runs one slice
 * of one job. It takes the job's lease for the delivery's generation, restores the job's checkpoint from GCS, runs the
 * engine a slice (packages/api runSlice) under the job's credits and the day's job pools, writes the slice's pages and the
 * checkpoint back, commits the job and settles the credits, then queues what comes next: the job's next slice, or, when
 * it has finished, its export, its expiry, its webhook and the first slice of the job promoted into its slot.
 * The webhook is a delivery of its own (`/internal/jobs/:id/webhook`), so a receiver that is down is retried without
 * running anything else again.
 *
 * A delivery is answered 200 when it was handled, whatever became of the job (Cloud Tasks would otherwise retry it), and
 * 503 only when the lease is held by a slice that may still be running: Cloud Tasks retries it until the lease expires.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createApiEngine, type ApiEngineOptions, type SliceCharge } from '@w2l/api'
import { hostedNetworkPolicy, type ParsedBatchStartRequest, type ParsedCrawlStartRequest } from '@w2l/contracts'
import { canonicalizeUrl, CHECKPOINT_FILENAME, foldCheckpoint, hostOf, SqliteTaskStore, webhookSignature, type WebhookTransport } from '@w2l/runtime'
import { hostedPolicy, type HostedLeases } from './hostedApi.js'
import { CREDITS, scrapeCharge, type CreditsStore, type Reservation, type UsageKind } from './hostedCredits.js'
import type { UploadResult } from './hostedCloud.js'
import type { HostedJob, HostedJobStore, HostedWebhookDelivery } from './hostedJobs.js'
import { exportName, jobPrefix, jobStatus } from './hostedJobRoutes.js'

/** The bucket operations a slice needs; GcsBucket has them. */
export interface WorkerFiles {
  upload(name: string, body: Uint8Array, options: { contentType: string; ifGenerationMatch?: number }): Promise<UploadResult>
  download(name: string): Promise<{ body: Uint8Array; generation: number } | null>
  deletePrefix(prefix: string): Promise<number>
}

export interface WorkerLimits {
  /** New pages a slice stores at most (the plan's N). */
  slicePages: number
  /** New pages a job's first slice stores at most: small, so the first pages and the progress show early. */
  firstSlicePages: number
  /** How long a slice reads before it drains (T). */
  sliceMs: number
  graceMs: number
  /** Job pages a UTC day for every account together, and for one account (W2L_JOBS_DAILY, W2L_JOBS_ACCOUNT_DAILY). */
  jobsDaily: number
  jobsAccountDaily: number
  /** Hosts a batch slice takes at most. */
  maxHostsPerSlice: number
  /** Slices in a row that store nothing before the job fails (`no_progress`). */
  idleSlicesToFail: number
  /** Slices in a row that fail (an error, or a slice that died) before the job fails (`delivery_failed`). */
  failedAttemptsToFail: number
}
export const WORKER_LIMITS: WorkerLimits = { slicePages: 100, firstSlicePages: 10, sliceMs: 8 * 60_000, graceMs: 60_000, jobsDaily: 10_000, jobsAccountDaily: 2_000, maxHostsPerSlice: 20, idleSlicesToFail: 2, failedAttemptsToFail: 5 }

export interface JobWorkerDeps {
  store: HostedJobStore
  credits: CreditsStore
  files: WorkerFiles
  /** Queues the job's slice for its current generation, after `delaySeconds` when given. */
  enqueueSlice: (job: HostedJob, delaySeconds?: number) => Promise<void>
  /** Queues the job's expiry at its `expireAt`. */
  enqueueExpiry: (job: HostedJob) => Promise<void>
  /** Queues the post of the job's end to its webhook, once by its name (`{jobId}-webhook`). */
  enqueueWebhook?: (job: HostedJob) => Promise<void>
  /** Sends a webhook: https to a public address, its DNS pinned, no redirects (createHttpsWebhookTransport). */
  webhookTransport?: WebhookTransport
  /** Leases on hosts, so that two slices never read one site at once (`host-{host}`). */
  hostLeases: HostedLeases
  enabled?: () => Promise<boolean>
  /** The engine's network and lanes; a test passes a local policy and HTTP-only channels. Default: the hosted policy. */
  engineOptions?: () => Partial<ApiEngineOptions>
  /** A directory the worker may write task directories in. */
  workRoot: string
  limits?: Partial<WorkerLimits>
  log?: (line: string) => void
  now?: () => Date
  /** How often a running slice reads its job for a cancel or the switch; default 5 s. */
  pollMs?: number
}

export interface SliceOutcome { status: 200 | 500 | 503; outcome: string }

/** Attempts at a job's webhook before it is recorded failed: about 20 minutes of the queue's backoff (10 s doubling to 10 min). */
export const WEBHOOK_MAX_ATTEMPTS = 8
const WEBHOOK_TIMEOUT_MS = 30_000
const WEBHOOK_RETRYABLE = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500

/** Pages a slice may store past its limit: the engine's workers less one (workerCount 2 below). */
const SLICE_HEADROOM = 1
/** A crawl's page limit on hosted Octocrawl (hostedJobRoutes.ts JOB_MAX_CRAWL_PAGES), for a request stored without one. */
const JOB_MAX_PAGES = 500
/** A slice's lease outlasts a delivery's dispatch deadline (900 s). */
const LEASE_FLOOR_MS = 16 * 60_000
const ERROR_STATUSES = new Set(['failed', 'blocked', 'cancelled', 'budget_exceeded'])
const secondsToUtcMidnight = (now: Date) => Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000))

export async function runJobSlice(deps: JobWorkerDeps, jobId: string, generation: number): Promise<SliceOutcome> {
  const limits = { ...WORKER_LIMITS, ...deps.limits }
  const log = deps.log ?? ((line: string) => console.log(line))
  const now = deps.now ?? (() => new Date())
  const holder = randomUUID()
  // Longer than a delivery's 15-minute deadline: a delivery Cloud Tasks retries finds the lease held while the first runs.
  const leaseMs = Math.max(limits.sliceMs + limits.graceMs + 120_000, LEASE_FLOOR_MS)
  const leased = await deps.store.acquireLease(jobId, { generation, holder, ttlMs: leaseMs }, now())
  if (!leased.ok) {
    if (leased.reason === 'busy') return { status: 503, outcome: 'busy' }
    const job = leased.reason === 'missing' ? null : await deps.store.get(jobId)
    // A finished job's later delivery (a cancel queues one, Cloud Tasks retries one) settles what is left, writes its export,
    // schedules its expiry and makes sure the job promoted into its slot got its first slice. One that comes while a slice
    // still holds the lease is busy above: the slice settles and finishes the job when it commits. One that comes after the
    // lease expired has cleared it, so that slice, if it is still running, can no longer commit what this gives back.
    if (leased.reason === 'finished' && job !== null) await finish(deps, job, log)
    // A delivery for a generation already committed: the job's next slice may not have been queued (a queue error after the
    // commit), so it is queued again; the same task already queued is the same name, and nothing changes.
    if (leased.reason === 'stale' && job !== null && job.status === 'running' && job.generation > generation && (job.lease === null || Date.parse(job.lease.expireAt) <= now().getTime())) {
      await deps.enqueueSlice(job)
      return { status: 200, outcome: 'stale_requeued' }
    }
    return { status: 200, outcome: leased.reason }
  }
  let job = leased.job
  const line = (event: string, extra: Record<string, unknown> = {}) => log(JSON.stringify({ severity: 'INFO', event, workspaceId: job.workspaceId, jobId: job.id, generation, ...extra }))
  /** Commits the slice; `next` then queues what follows (the job's next slice, or its end and the promoted job's start). */
  type Committed = { outcome: SliceOutcome; committed: HostedJob; next: () => Promise<void> } | { outcome: SliceOutcome; committed: null; next: null }
  const commit = async (patch: (job: HostedJob) => HostedJob, delaySeconds = 0): Promise<Committed> => {
    const result = await deps.store.commitSlice(jobId, holder, patch, now())
    if (!result.ok) { line('hosted_job_slice_lost', { reason: result.reason }); return { outcome: { status: 200, outcome: result.reason }, committed: null, next: null } }
    const next = async () => {
      if (FINISHED.has(result.job.status)) await finish(deps, result.job, log)
      else await deps.enqueueSlice(result.job, delaySeconds)
    }
    return { outcome: { status: 200, outcome: result.job.status }, committed: result.job, next }
  }
  /** Commits a slice that read nothing, and queues what follows. */
  const pass = async (patch: (job: HostedJob) => HostedJob, delaySeconds = 0): Promise<SliceOutcome> => {
    const done = await commit(patch, delaySeconds)
    await done.next?.()
    return done.outcome
  }
  const unchanged = (j: HostedJob) => ({ ...j, counts: { ...j.counts } })

  // The last slice's reservation, if it is not settled yet: a slice that died gives back everything, one that committed
  // is charged what it used. Settling twice changes nothing, so this is safe whatever the last slice got to.
  if (job.reservation !== undefined && job.reservation !== null) {
    await settlePending(deps, job, now(), log)
    const cleared = await deps.store.updateHeld(jobId, holder, (j) => ({ ...j, reservation: null }))
    if (!cleared.ok) return { status: 200, outcome: cleared.reason }
    job = cleared.job
  }
  // A slice that keeps failing (the same error each time, or a crash) would be retried for as long as the job lives.
  if ((job.failedAttempts ?? 0) >= limits.failedAttemptsToFail) { line('hosted_job_delivery_failed', { failedAttempts: job.failedAttempts }); return pass((j) => ({ ...j, status: 'failed', failureReason: 'delivery_failed' })) }
  if (deps.enabled !== undefined && !(await deps.enabled())) { line('hosted_job_switched_off'); return pass(unchanged, 300) }

  const request = job.request as (ParsedBatchStartRequest | ParsedCrawlStartRequest) & { fastMode?: boolean }
  const price = request.fastMode === true ? CREDITS.httpPage : CREDITS.browserPage
  const allowed = job.credits.maxCredits === null ? limits.slicePages : Math.floor((job.credits.maxCredits - job.credits.used) / price)
  if (allowed <= 0) return pass((j) => ({ ...j, status: 'completed', failureReason: 'max_credits' }))
  // Under maxCredits the headroom page must fit too.
  const slicePages = job.counts.slices === 0 ? Math.min(limits.firstSlicePages, limits.slicePages) : limits.slicePages
  let pages = Math.min(slicePages, job.credits.maxCredits === null ? allowed : Math.max(1, allowed - SLICE_HEADROOM))
  // No more than the job has left: a batch's URLs not yet read, a crawl's pages under its maxPages. A slice that asks for
  // all of them gets no headroom, as there is no page past them; the day's pool and the credits are taken for what is left.
  const left = Math.max(1, (job.kind === 'batch' ? (request as ParsedBatchStartRequest).urls.length : ((request as ParsedCrawlStartRequest).maxPages ?? JOB_MAX_PAGES)) - job.counts.pages - job.counts.errors)
  const headroom = left > pages ? SLICE_HEADROOM : 0
  pages = Math.min(pages, left)

  const tag = holder.slice(0, 8)
  const taskRoot = join(deps.workRoot, `${jobId}-${holder}`)
  const taskDir = join(taskRoot, jobId)
  const releases: Array<() => Promise<void>> = []
  let reservation: Reservation | null = null
  /** Whether this slice's commit may have applied: from the call until it answers that it did not. */
  let commitMayHaveApplied = false
  try {
    mkdirSync(taskDir, { recursive: true })
    // The committed checkpoint only: a slice that died after its upload wrote one nobody reads.
    const checkpoint = job.checkpoint ? await deps.files.download(job.checkpoint) : null
    // Its committed checkpoint gone (deleted by hand, or by a lifecycle rule) the job cannot go on: retrying would not help.
    if (job.checkpoint && checkpoint === null) return await pass((j) => ({ ...j, status: 'failed', failureReason: 'checkpoint_missing' }))
    if (checkpoint !== null) writeFileSync(join(taskDir, CHECKPOINT_FILENAME), checkpoint.body)

    // The hosts this slice reads, each under a lease no other slice holds: a crawl's seed host, a batch's next hosts.
    const wanted = await hostsOf(job, checkpoint === null || job.kind === 'crawl' ? null : taskDir)
    const hosts: string[] = []
    for (const host of wanted) {
      if (hosts.length >= limits.maxHostsPerSlice) break
      const lease = await deps.hostLeases.acquire(`host-${host}`, leaseMs, now())
      if (lease.ok) { hosts.push(host); releases.push(lease.release) }
    }
    if (wanted.length > 0 && hosts.length === 0) { line('hosted_job_hosts_busy'); return await pass(unchanged, 30) }

    // The slice's credits and its pages on the day's job pools, taken before any page is read. A drain lets the pages in
    // flight finish, so a slice can store one page more than it asked for (two workers): that page is reserved too.
    const day = now().toISOString().slice(0, 10)
    const pools = (n: number) => [{ id: `${day}-jobs`, limit: limits.jobsDaily, amount: n }, { id: `${day}-jobs-account-${job.uid}`, limit: limits.jobsAccountDaily, amount: n }]
    const reservationId = `${jobId}-${generation}-${holder}`
    // Under maxCredits the reservation stays within what is left of it; a page a drain stores past it is not charged.
    let reservedPages = Math.min(pages + headroom, job.credits.maxCredits === null ? Number.POSITIVE_INFINITY : allowed)
    let reserved = await deps.credits.reserve(job.uid, reservedPages * price, pools(reservedPages), now(), reservationId)
    if (!reserved.ok && reserved.limited === 'credits' && reserved.remaining >= price) {
      reservedPages = Math.floor(reserved.remaining / price)
      // What is left of the job fits: no headroom needed. Otherwise a page of the reservation is the headroom.
      pages = left <= reservedPages ? left : Math.max(1, reservedPages - SLICE_HEADROOM)
      reserved = await deps.credits.reserve(job.uid, reservedPages * price, pools(reservedPages), now(), reservationId)
    }
    if (!reserved.ok) {
      if (reserved.limited === 'quota') { line('hosted_job_daily_pool', { pool: reserved.id }); return await pass(unchanged, secondsToUtcMidnight(now())) }
      const reason = reserved.limited === 'account' ? 'account_deleted' : 'credits_exhausted'
      return await pass((j) => ({ ...j, status: 'failed', failureReason: reason }))
    }
    reservation = reserved.reservation
    const held = await deps.store.updateHeld(jobId, holder, (j) => ({ ...j, reservation: { reservation, used: null } }))
    if (!held.ok) return { status: 200, outcome: held.reason }

    // The slice: a new engine over the restored task, stopped by the job's cancel or the switch meanwhile.
    // The policy a hosted scrape reads under (its 5 MiB file cap and the operator's contact), on whatever network a test gives.
    const extra = deps.engineOptions?.() ?? {}
    const engine = createApiEngine({
      taskRoot, hosted: true, defaultMaxPages: 500, allowRobotsOverride: false, sessionsFile: null, userChrome: null,
      workerCount: SLICE_HEADROOM + 1, resumeOnStart: false, deferLaunch: true, taskIds: () => jobId, ...extra,
      networkPolicy: hostedPolicy(extra.networkPolicy ?? hostedNetworkPolicy()),
    })
    const off = new AbortController()
    let result: Awaited<ReturnType<typeof engine.runSlice>>
    const poller = setInterval(() => {
      void (async () => {
        const current = await deps.store.get(jobId)
        if (current === null || current.status === 'cancelled') await engine.cancelCrawl(jobId).catch(() => {})
        else if (deps.enabled !== undefined && !(await deps.enabled())) off.abort()
      })().catch(() => {})
    }, deps.pollMs ?? 5_000)
    try {
      if (checkpoint === null) {
        if (job.kind === 'batch') await engine.startBatch(job.request as ParsedBatchStartRequest)
        else await engine.startCrawl(job.request as ParsedCrawlStartRequest)
      }
      result = await engine.runSlice(jobId, { maxNewPages: pages, maxMs: limits.sliceMs, graceMs: limits.graceMs, signal: off.signal, ...(job.kind === 'batch' ? { batchHosts: hosts } : {}) })
    } finally {
      clearInterval(poller)
      await engine.close({ cancelActive: true })
    }
    if (result === null) throw new Error('the job\'s task is missing from its checkpoint')

    // Still this slice's job? A slice that outlived its lease writes nothing: the one that took over reads the pages again.
    const current = await deps.store.get(jobId)
    if (current === null || current.lease?.holder !== holder) {
      line('hosted_job_slice_lost', { reason: current === null ? 'missing' : 'lease_taken' })
      return { status: 200, outcome: current === null ? 'missing' : 'lost' }
    }
    // What the slice stored, under names of its own: its pages as a segment, the checkpoint as one file; then the job.
    const slice = job.counts.slices
    const segment = `${jobPrefix(job)}pages/${String(slice).padStart(5, '0')}-${tag}.jsonl.gz`
    const nextCheckpoint = `${jobPrefix(job)}checkpoints/${String(slice).padStart(5, '0')}-${tag}.sqlite`
    await deps.files.upload(segment, new Uint8Array(gzipSync(result.items.map((item) => JSON.stringify(item)).join('\n'))), { contentType: 'application/gzip' })
    foldCheckpoint(taskDir)
    await deps.files.upload(nextCheckpoint, new Uint8Array(readFileSync(join(taskDir, CHECKPOINT_FILENAME))), { contentType: 'application/vnd.sqlite3' })
    // Charged what its pages cost, never more than it reserved (the headroom page past a maxCredits cap is free).
    const priced = priceOf(result.charges)
    const used = Math.min(priced.used, reservedPages * price)
    const perKind = priced.perKind
    const errors = result.charges.filter((charge) => ERROR_STATUSES.has(charge.status)).length
    const idle = result.items.length === 0 && result.status === 'paused'
    const idleSlices = idle ? (job.idleSlices ?? 0) + 1 : 0
    const status = result.status === 'completed' || result.status === 'failed' || result.status === 'cancelled' ? result.status : idleSlices >= limits.idleSlicesToFail ? 'failed' : 'running'
    const settled = reservation
    commitMayHaveApplied = true
    const done: Committed = await commit((j) => ({
      ...j, status, failureReason: status === 'failed' ? (idleSlices >= limits.idleSlicesToFail ? 'no_progress' : 'task_failed') : j.failureReason,
      counts: { pages: j.counts.pages + result!.items.length - errors, errors: j.counts.errors + errors, slices: j.counts.slices + 1 },
      credits: { ...j.credits, used: j.credits.used + used }, idleSlices, budgetExceeded: result!.budgetExceeded ?? j.budgetExceeded ?? null,
      segments: [...(j.segments ?? []), segment], checkpoint: nextCheckpoint,
      // Kept until settled: if the settle below fails, the next delivery settles it.
      reservation: { reservation: settled, used, perKind },
    }))
    if (done.committed === null) {
      commitMayHaveApplied = false
      // The account was erased meanwhile: what this slice wrote goes too.
      if (done.outcome.outcome === 'missing') await deps.files.deletePrefix(jobPrefix(job)).catch(() => {})
      return done.outcome
    }
    // Charged what it used; a settle that fails here is settled by the next delivery, from the reservation on the job.
    await deps.credits.settle(settled, used, 'http', now(), undefined, perKind).catch((error: unknown) => log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_settle_failed', jobId, message: String(error) })))
    line('hosted_job_slice', { slice, pages: result.items.length, errors, used, status: done.outcome.outcome })
    await done.next()
    return done.outcome
  } catch (error) {
    log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_slice_failed', jobId, generation, message: error instanceof Error ? error.message : String(error) }))
    // The lease goes back at once, the failure counted; one whose commit may have applied keeps it, so nothing is undone.
    if (!commitMayHaveApplied) await deps.store.abandon(jobId, holder).catch(() => {})
    throw error
  } finally {
    // A slice that ends without committing gives its credits back. One whose commit may have applied (it threw) leaves its
    // reservation to the next delivery, which settles it from the job: used, if the commit applied; nothing, if it did not.
    if (reservation !== null && !commitMayHaveApplied) await deps.credits.settle(reservation, 0, 'unread', now()).catch(() => {})
    for (const release of releases) await release().catch(() => {})
    rmSync(taskRoot, { recursive: true, force: true })
  }
}

/** Settles the reservation the job holds: what its slice used, or nothing when the slice did not commit. */
async function settlePending(deps: JobWorkerDeps, job: HostedJob, at: Date, log: (line: string) => void): Promise<void> {
  const pending = job.reservation
  if (pending === undefined || pending === null) return
  // A failure throws: the delivery answers 500 and Cloud Tasks retries it, with the reservation still on the job.
  try { await deps.credits.settle(pending.reservation as Reservation, pending.used ?? 0, pending.used === null ? 'unread' : 'http', at, undefined, pending.used === null ? undefined : pending.perKind as Partial<Record<UsageKind, number>>) }
  catch (error) { log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_settle_failed', jobId: job.id, message: String(error) })); throw error }
}

/** Deletes an expired job's files and marks it expired; a job not yet finished keeps everything. */
export async function runJobExpiry(deps: Pick<JobWorkerDeps, 'store' | 'files' | 'now'>, jobId: string): Promise<SliceOutcome> {
  const job = await deps.store.get(jobId)
  if (job === null) return { status: 200, outcome: 'missing' }
  if (!FINISHED.has(job.status)) return { status: 200, outcome: 'not_finished' }
  await deps.files.deletePrefix(jobPrefix(job))
  await deps.store.expire(jobId, (deps.now ?? (() => new Date()))())
  return { status: 200, outcome: 'expired' }
}

const FINISHED = new Set(['completed', 'failed', 'cancelled', 'expired'])

/**
 * Posts a finished job's end to its webhook (H2 W3), signed as a local job's deliveries are: `x-w2l-signature` is
 * `sha256=` and the hex HMAC-SHA256, under the job's secret, of `{x-w2l-timestamp}.{body}`, the timestamp in ms. A 2xx is
 * delivered; 408, 425, 429, a 5xx or no answer answers 500 so that Cloud Tasks retries it, up to WEBHOOK_MAX_ATTEMPTS;
 * any other answer is failed at once. Each outcome is recorded on the job. `attempt` counts from 0 (Cloud Tasks'
 * X-CloudTasks-TaskRetryCount).
 */
export async function runJobWebhook(deps: Pick<JobWorkerDeps, 'store' | 'webhookTransport' | 'log' | 'now'>, jobId: string, attempt: number): Promise<SliceOutcome> {
  const log = deps.log ?? ((line: string) => console.log(line))
  const now = deps.now ?? (() => new Date())
  const job = await deps.store.get(jobId)
  if (job === null) return { status: 200, outcome: 'missing' }
  const webhook = job.webhook
  if (!webhook || !(webhook.events as string[]).includes(job.status)) return { status: 200, outcome: 'not_requested' }
  if (webhook.delivery?.state === 'delivered' || webhook.delivery?.state === 'failed') return { status: 200, outcome: webhook.delivery.state }
  if (!deps.webhookTransport) throw new Error('the worker has no webhook transport')
  const body = JSON.stringify({
    schemaVersion: 'w2l.job-event/v1', eventId: `${job.id}:${job.status}`,
    // A local job numbers its started event 0 and each page after it; hosted posts its end alone, numbered as a local one is.
    sequence: job.counts.pages + job.counts.errors + 1,
    jobId: job.id, jobKind: job.kind, event: job.status, at: job.finishedAt ?? now().toISOString(), metadata: webhook.metadata,
    report: jobStatus({ ...job, webhook: null }), ...(job.status === 'failed' && job.failureReason !== null ? { error: job.failureReason } : {}),
  })
  const timestamp = String(now().getTime())
  const headers = {
    'x-w2l-event-id': `${job.id}:${job.status}`, 'x-w2l-event-version': String(job.counts.pages + job.counts.errors + 1),
    'x-w2l-delivery-id': `${job.id}-webhook-${attempt}`, 'x-w2l-timestamp': timestamp, 'x-w2l-signature': webhookSignature(webhook.secret, timestamp, body),
  }
  let httpStatus: number | null = null
  let error: string | null = null
  try { httpStatus = (await deps.webhookTransport({ url: webhook.url, body, headers, signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) })).status }
  catch (caught) { error = caught instanceof Error ? caught.message : String(caught) }
  const attempts = attempt + 1
  const ok = httpStatus !== null && httpStatus >= 200 && httpStatus < 300
  const retry = !ok && (httpStatus === null || WEBHOOK_RETRYABLE(httpStatus)) && attempts < WEBHOOK_MAX_ATTEMPTS
  // An address the policy refuses never becomes reachable by waiting.
  const denied = error !== null && error.startsWith('webhook egress denied')
  const state: HostedWebhookDelivery['state'] = ok ? 'delivered' : retry && !denied ? 'pending' : 'failed'
  await deps.store.recordWebhook(job.id, { state, attempts, httpStatus, error: ok ? null : error ?? `HTTP ${httpStatus}`, at: now().toISOString() })
  log(JSON.stringify({ severity: ok ? 'INFO' : 'WARNING', event: 'hosted_job_webhook', workspaceId: job.workspaceId, jobId: job.id, state, attempts, httpStatus, error }))
  return state === 'pending' ? { status: 500, outcome: 'retry' } : { status: 200, outcome: state }
}

/** A finished job's export (every segment, in order, as one file) and its expiry; done again harmlessly on a retry. */
async function finish(deps: JobWorkerDeps, job: HostedJob, log: (line: string) => void): Promise<void> {
  if (job.status === 'expired') return
  await settlePending(deps, job, (deps.now ?? (() => new Date()))(), log)
  const lines: string[] = []
  for (const name of job.segments ?? []) {
    const segment = await deps.files.download(name)
    if (segment !== null) lines.push(...gunzipSync(segment.body).toString('utf8').split('\n').filter((entry) => entry.length > 0))
  }
  await deps.files.upload(exportName(job), new Uint8Array(gzipSync(lines.join('\n'))), { contentType: 'application/gzip' })
  await deps.enqueueExpiry(job)
  if (job.webhook && deps.enqueueWebhook && (job.webhook.events as string[]).includes(job.status) && job.webhook.delivery?.state !== 'delivered' && job.webhook.delivery?.state !== 'failed') await deps.enqueueWebhook(job)
  // The job promoted into this one's slot, if it has not started: its first slice, by its name, so queueing it twice is once.
  if (job.promoted) {
    const promoted = await deps.store.get(job.promoted)
    if (promoted !== null && promoted.status === 'running' && promoted.startedAt === null) await deps.enqueueSlice(promoted)
  }
  log(JSON.stringify({ severity: 'INFO', event: 'hosted_job_finished', workspaceId: job.workspaceId, jobId: job.id, status: job.status, failureReason: job.failureReason, pages: job.counts.pages, errors: job.counts.errors, credits: job.credits.used }))
}

/** The hosts a slice should read, in the order their URLs come: a crawl's seed host; a batch's hosts with URLs not yet read. */
export async function hostsOf(job: HostedJob, taskDir: string | null): Promise<string[]> {
  const request = job.request as { url?: string; urls?: readonly string[] }
  const urls = job.kind === 'crawl' ? [request.url!] : [...(request.urls ?? [])]
  let done = new Set<string>()
  if (taskDir !== null && existsSync(join(taskDir, CHECKPOINT_FILENAME))) {
    const store = SqliteTaskStore.openReadOnly(taskDir)
    try { done = new Set((await store.listSteps(job.id)).filter((step) => step.result !== null).map((step) => step.canonicalUrl)) } finally { await store.close() }
  }
  const hosts: string[] = []
  for (const url of urls) {
    const canonical = canonicalizeUrl(url)
    if (canonical === null || done.has(canonical)) continue
    const host = hostOf(canonical)
    if (!hosts.includes(host)) hosts.push(host)
  }
  return hosts
}

/** What a slice's pages cost, as a scrape of each would (hostedCredits.ts scrapeCharge), and how many of each kind. */
export function priceOf(charges: readonly SliceCharge[]): { used: number; perKind: Partial<Record<UsageKind, number>> } {
  let used = 0
  const perKind: Partial<Record<UsageKind, number>> = {}
  for (const charge of charges) {
    const priced = scrapeCharge({ status: charge.status, lane: charge.lane, failureReason: charge.failureReason, evidenceRecord: { httpStatus: charge.httpStatus } } as Parameters<typeof scrapeCharge>[0])
    used += priced.credits
    perKind[priced.kind] = (perKind[priced.kind] ?? 0) + 1
  }
  return { used, perKind }
}

// ---- The worker service: Cloud Tasks deliveries, each with an OIDC token Google signed for the queue's account ----

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

/**
 * Checks a Google-signed OIDC ID token (RS256, Google's published keys): its audience, the account it was issued to,
 * its issuer and its expiry. A Cloud Tasks delivery carries one for the queue's service account; anything else is refused.
 */
export function googleOidcVerifier(expected: { audience: string; email: string }, fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
  let keys: { at: number; byKid: Map<string, Jwk> } | null = null
  const keyFor = async (kid: string): Promise<Jwk | null> => {
    if (keys === null || clock() - keys.at > 3_600_000 || !keys.byKid.has(kid)) {
      const response = await fetcher(GOOGLE_CERTS, { signal: AbortSignal.timeout(5_000) })
      if (!response.ok) throw new Error(`Google's signing keys are unavailable (${response.status})`)
      keys = { at: clock(), byKid: new Map(((await response.json() as { keys?: Jwk[] }).keys ?? []).map((key) => [key.kid, key])) }
    }
    return keys.byKid.get(kid) ?? null
  }
  return async (authorization: string | null): Promise<boolean> => {
    if (authorization === null || !authorization.startsWith('Bearer ')) return false
    const parts = authorization.slice(7).trim().split('.')
    if (parts.length !== 3) return false
    try {
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as { alg?: string; kid?: string }
      const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { aud?: string; email?: string; email_verified?: boolean; iss?: string; exp?: number }
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false
      const jwk = await keyFor(header.kid)
      if (jwk === null) return false
      const { createPublicKey, verify } = await import('node:crypto')
      const key = createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' })
      if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2]!, 'base64url'))) return false
      return claims.aud === expected.audience && claims.email === expected.email && claims.email_verified === true
        && GOOGLE_ISSUERS.has(claims.iss ?? '') && typeof claims.exp === 'number' && claims.exp * 1000 > clock()
    } catch { return false }
  }
}

/**
 * The worker's HTTP service: `POST /internal/jobs/:id/slice` with `{ generation }` runs a slice, `POST /internal/jobs/:id/expire`
 * expires a finished job, `POST /internal/jobs/:id/webhook` posts its end, `GET /health` answers. Every other request, and any without a valid token, is refused.
 */
export async function startJobWorker(options: { deps: JobWorkerDeps; verify: (authorization: string | null) => Promise<boolean>; port: number; host?: string }) {
  const { createServer } = await import('node:http')
  const log = options.deps.log ?? ((line: string) => console.log(line))
  const server = createServer((req, res) => {
    void (async () => {
      const send = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, service: 'octocrawl-jobs' })
      const match = req.method === 'POST' ? /^\/internal\/jobs\/([0-9a-f-]{36})\/(slice|expire|webhook)$/.exec(req.url ?? '') : null
      if (match === null) return send(404, { error: 'not found' })
      if (!(await options.verify(req.headers.authorization ?? null))) return send(401, { error: 'unauthorized' })
      let body = ''
      for await (const chunk of req) { body += String(chunk); if (body.length > 10_000) return send(413, { error: 'body too large' }) }
      try {
        if (match[2] === 'expire') { const result = await runJobExpiry(options.deps, match[1]!); return send(result.status, { outcome: result.outcome }) }
        if (match[2] === 'webhook') {
          const retries = Number(req.headers['x-cloudtasks-taskretrycount'] ?? 0)
          const result = await runJobWebhook(options.deps, match[1]!, Number.isSafeInteger(retries) && retries >= 0 ? retries : 0)
          return send(result.status, { outcome: result.outcome })
        }
        const generation = (JSON.parse(body || '{}') as { generation?: unknown }).generation
        if (!Number.isSafeInteger(generation) || (generation as number) < 0) return send(400, { error: 'generation must be a nonnegative integer' })
        const result = await runJobSlice(options.deps, match[1]!, generation as number)
        return send(result.status, { outcome: result.outcome })
      } catch (error) {
        // Cloud Tasks retries a 500: the slice runs again from the job's last checkpoint.
        log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_delivery_failed', jobId: match[1], message: error instanceof Error ? error.message : String(error) }))
        return send(500, { error: 'slice failed' })
      }
    })()
  })
  // A slice may take its time limit and the grace; Cloud Run's request timeout bounds it.
  server.requestTimeout = 0
  await new Promise<void>((resolve) => server.listen(options.port, options.host ?? '0.0.0.0', resolve))
  return { server, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
