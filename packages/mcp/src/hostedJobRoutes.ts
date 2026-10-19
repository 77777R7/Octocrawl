/**
 * Hosted batch and crawl jobs at the gate (ROADMAP PH stage H1, docs/h1-hosted-jobs-tasks.md PR ③): starting, reading,
 * paging and cancelling a job, for an account's keys only. A start writes the job (hostedJobs.ts) and queues its first
 * slice; the worker (PR ④) reads it, a slice at a time, and writes each slice's pages to a segment file in GCS, which the
 * reads here page through. Nothing runs here but the bookkeeping.
 */

import { createHash, randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { CRAWL_SCOPE_KEYS, parseBatchStartRequest, parseCrawlStartRequest, RequestError, type ParsedBatchStartRequest, type ParsedCrawlStartRequest } from '@w2l/contracts'
import type { CreditsStore } from './hostedCredits.js'
import { CREDITS } from './hostedCredits.js'
import type { GcsBucket } from './hostedCloud.js'
import { newHostedJob, type HostedJob, type HostedJobStore, type JobLimits } from './hostedJobs.js'

/** The options of a page in a job, as hosted serves them on a scrape (HOSTED_SCRAPE_KEYS), less the scrape's own. */
const JOB_PAGE_KEYS = ['onlyMainContent', 'waitFor', 'timeout', 'maxFileBytes', 'includeTags', 'excludeTags', 'headers', 'mobile', 'fastMode', 'blockAds', 'removeBase64Images', 'verify', 'origin', 'integration'] as const
export const HOSTED_BATCH_KEYS: ReadonlySet<string> = new Set(['urls', 'mode', 'formats', 'includeLinks', 'maxConcurrency', 'ignoreInvalidURLs', 'idempotencyKey', 'maxCredits', ...JOB_PAGE_KEYS])
export const HOSTED_CRAWL_KEYS: ReadonlySet<string> = new Set(['url', 'mode', 'maxPages', 'maxDepth', 'allowlistedDomains', 'formats', 'includeLinks', 'includePaths', 'excludePaths', ...CRAWL_SCOPE_KEYS, 'sitemap', 'maxConcurrency', 'idempotencyKey', 'maxCredits', ...JOB_PAGE_KEYS])

export const JOB_DEFAULT_CRAWL_PAGES = 100
export const JOB_MAX_CRAWL_PAGES = 500
/** New pages a slice stores at most (docs/launch/2026-10-19-h1-hosted-jobs-plan.md §5): a start needs the credits for one. */
export const JOB_SLICE_PAGES = 100
export const JOB_LIMITS: JobLimits = { maxRunning: 2, maxQueued: 10 }
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000
const PAGE_LIST_DEFAULT = 50
const PAGE_LIST_MAX = 100
const EXPORT_LINK_SECONDS = 900
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A job's files in GCS: `w/{workspaceId}/jobs/{jobId}/`. */
export function jobPrefix(job: Pick<HostedJob, 'workspaceId' | 'id'>): string { return `w/${job.workspaceId}/jobs/${job.id}/` }
export function segmentName(job: Pick<HostedJob, 'workspaceId' | 'id'>, slice: number): string { return `${jobPrefix(job)}pages/${String(slice).padStart(5, '0')}.jsonl.gz` }
export function exportName(job: Pick<HostedJob, 'workspaceId' | 'id'>): string { return `${jobPrefix(job)}export.jsonl.gz` }
/** The workspace an account's jobs belong to: its personal one until teams (ROADMAP PH H4). */
export function personalWorkspace(uid: string): string { return `ws_${uid}` }

/** Where a job's pages and export are read from. */
export interface JobFiles {
  /** One slice's pages, a JSON object a line; null when the slice wrote none (yet). */
  segment(job: HostedJob, slice: number): Promise<string[] | null>
  exportUrl(job: HostedJob): Promise<string>
}

export function gcsJobFiles(bucket: GcsBucket): JobFiles {
  return {
    async segment(job, slice) {
      // A committed slice's file is named on the job; a slice that did not commit wrote one nobody reads.
      const object = await bucket.download(job.segments?.[slice] ?? segmentName(job, slice))
      if (object === null) return null
      return gunzipSync(object.body).toString('utf8').split('\n').filter((line) => line.length > 0)
    },
    exportUrl: (job) => bucket.signedUrl(exportName(job), EXPORT_LINK_SECONDS),
  }
}

export interface HostedJobsConfig {
  store: HostedJobStore
  files: JobFiles
  /** Queues a running job's next slice (its current generation) for the worker. */
  enqueueSlice: (job: HostedJob) => Promise<void>
  /** The global switch (`hostedConfig/jobs.enabled`); absent: on. */
  enabled?: () => Promise<boolean>
  limits?: JobLimits
}

/** The account a job request acts for, as the gate identified it. */
export interface JobCaller { uid: string; keyId: string; browser: boolean }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const refusal = (status: number, code: string, error: string, agentHints: readonly string[] = [], headers: Record<string, string> = {}) => json({ error, code, agentHints }, status, headers)

/** Whether a method and path are a job route; the gate hands those to handleJob. */
export function isJobRoute(method: string, path: string): boolean {
  if (method === 'POST' && (path === '/v1/batches' || path === '/v1/crawl')) return true
  return /^\/v1\/(batches|crawl|jobs)\/[^/]+(\/(items|pages|errors|cancel|export))?$/.test(path) && (method === 'GET' || method === 'POST')
}

export function createJobRoutes(config: HostedJobsConfig, credits: CreditsStore, log: (line: string) => void, now: () => Date = () => new Date()) {
  const limits = config.limits ?? JOB_LIMITS

  /**
   * Queues a running job's slice. A running job with no slice queued would hold its slot forever, so one that cannot be
   * queued fails (`not_queued`, nothing charged), and the job promoted into its slot is queued in turn.
   */
  async function queueOrFail(job: HostedJob): Promise<boolean> {
    try { await config.enqueueSlice(job); return true }
    catch (error) {
      log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_enqueue_failed', workspaceId: job.workspaceId, jobId: job.id, message: error instanceof Error ? error.message : String(error) }))
      const failed = await config.store.fail(job.id, 'not_queued', now()).catch(() => null)
      await queuePromoted(failed?.ok === true ? failed.promoted : null)
      return false
    }
  }
  async function queuePromoted(id: string | null): Promise<void> {
    const promoted = id === null ? null : await config.store.get(id)
    if (promoted !== null && promoted.status === 'running') await queueOrFail(promoted)
  }

  /** The job a read names, when it is this account's and still served; otherwise the refusal to answer. */
  async function owned(id: string, caller: JobCaller, kind: 'batch' | 'crawl' | null): Promise<HostedJob | Response> {
    const job = JOB_ID.test(id) ? await config.store.get(id) : null
    // Another account's job, or one of the other kind, is not found: whether it exists is not told.
    if (job === null || job.workspaceId !== personalWorkspace(caller.uid) || (kind !== null && job.kind !== kind)) return refusal(404, 'not_found', `no ${kind ?? 'job'} ${id} for this account`)
    if (job.status === 'expired' || (job.expireAt !== null && Date.parse(job.expireAt) <= now().getTime())) {
      return refusal(410, 'job_expired', `job ${id} finished on ${job.finishedAt} and its results were kept 7 days`, ['start it again to read the pages again'])
    }
    return job
  }

  function status(job: HostedJob): Record<string, unknown> {
    const requested = job.kind === 'batch' ? (job.request as { urls: readonly string[] }).urls.length : null
    const completed = job.counts.pages + job.counts.errors
    return {
      taskId: job.id, kind: job.kind, status: job.status, failureReason: job.failureReason,
      pagesFetched: job.counts.pages, errors: job.counts.errors, completed,
      ...(requested === null ? {} : { requested, remaining: Math.max(0, requested - completed) }),
      credits: { used: job.credits.used, maxCredits: job.credits.maxCredits },
      createdAt: job.createdAt, finishedAt: job.finishedAt, expiresAt: job.expireAt,
    }
  }

  async function start(kind: 'batch' | 'crawl', request: Request, caller: JobCaller): Promise<Response> {
    if (config.enabled !== undefined && !(await config.enabled())) return refusal(503, 'jobs_paused', 'hosted batch and crawl jobs are paused for now', ['run it on your computer meanwhile: npx octocrawl serve'], { 'Retry-After': '300' })
    let body: Record<string, unknown>
    try {
      const parsed = await request.json() as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      body = { ...(parsed as Record<string, unknown>) }
    } catch { return refusal(400, 'invalid_json', 'the request body must be a JSON object') }
    const allowed = kind === 'batch' ? HOSTED_BATCH_KEYS : HOSTED_CRAWL_KEYS
    const unsupported = Object.keys(body).filter((key) => !allowed.has(key))
    if (unsupported.length > 0) return refusal(400, 'invalid_request', `hosted ${kind} jobs do not take ${unsupported.join(', ')}`, ['run it on your computer for every option: npx octocrawl serve'])
    const headerKey = request.headers.get('idempotency-key') ?? request.headers.get('x-idempotency-key')
    if (headerKey !== null && body.idempotencyKey === undefined) body.idempotencyKey = headerKey
    const maxCredits = body.maxCredits
    delete body.maxCredits
    if (maxCredits !== undefined && (!Number.isSafeInteger(maxCredits) || (maxCredits as number) < 1)) return refusal(400, 'invalid_request', 'maxCredits must be a positive integer')
    if (body.mode === 'authed') return refusal(400, 'invalid_request', 'hosted Octocrawl holds no saved logins, so it has no authed mode')
    // A key without the browser lane reads every page over HTTP alone, as its scrapes do.
    if (!caller.browser) {
      if (typeof body.waitFor === 'number' && body.waitFor > 0) return refusal(400, 'invalid_request', 'waitFor needs the browser lane, which this key does not have')
      if (Array.isArray(body.formats) && body.formats.some((format) => String(typeof format === 'object' && format !== null ? (format as { type?: unknown }).type : format).startsWith('screenshot'))) return refusal(400, 'invalid_request', 'a screenshot needs the browser lane, which this key does not have')
      body.fastMode = true
    }
    if (kind === 'crawl') {
      // null is no limit to the parser; a hosted crawl always has one.
      if (body.maxPages === undefined || body.maxPages === null) body.maxPages = JOB_DEFAULT_CRAWL_PAGES
      if (typeof body.maxPages === 'number' && body.maxPages > JOB_MAX_CRAWL_PAGES) return refusal(400, 'invalid_request', `maxPages must be at most ${JOB_MAX_CRAWL_PAGES} on hosted Octocrawl`, ['run larger crawls on your computer: npx octocrawl serve'])
    }
    let parsed: ParsedBatchStartRequest | ParsedCrawlStartRequest
    try { parsed = kind === 'batch' ? parseBatchStartRequest(body) : parseCrawlStartRequest(body) }
    catch (error) { return refusal(400, 'invalid_request', error instanceof RequestError || error instanceof Error ? error.message : String(error)) }
    if (kind === 'crawl' && !((parsed as ParsedCrawlStartRequest).maxPages! >= 1 && (parsed as ParsedCrawlStartRequest).maxPages! <= JOB_MAX_CRAWL_PAGES)) return refusal(400, 'invalid_request', `maxPages must be 1 to ${JOB_MAX_CRAWL_PAGES} on hosted Octocrawl`)

    const pages = kind === 'batch' ? (parsed as ParsedBatchStartRequest).urls.length : (parsed as ParsedCrawlStartRequest).maxPages ?? JOB_DEFAULT_CRAWL_PAGES
    const price = body.fastMode === true ? CREDITS.httpPage : CREDITS.browserPage
    const estimatedCredits = Math.min(pages * price, (maxCredits as number | undefined) ?? Number.POSITIVE_INFINITY)
    const firstSlice = Math.min(pages, JOB_SLICE_PAGES) * price
    const at = now()
    const balance = await credits.balance(caller.uid, at)
    if (balance < Math.min(firstSlice, estimatedCredits)) {
      return refusal(429, 'quota_exhausted', `this account has ${balance} credits; the job's first slice needs ${Math.min(firstSlice, estimatedCredits)}`, ['send fastMode: true to read over HTTP alone at 1 credit a page, or fewer URLs'])
    }

    const workspaceId = personalWorkspace(caller.uid)
    const idempotencyKey = (parsed as { idempotencyKey?: string }).idempotencyKey
    const { idempotencyKey: _key, ...stored } = parsed as typeof parsed & { idempotencyKey?: string }
    const claim = idempotencyKey === undefined ? null : {
      id: `${workspaceId}-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}`,
      fingerprint: createHash('sha256').update(JSON.stringify({ kind, stored, maxCredits })).digest('hex'),
      expireAt: new Date(at.getTime() + IDEMPOTENCY_TTL_MS).toISOString(),
    }
    const job = newHostedJob({ id: randomUUID(), workspaceId, uid: caller.uid, keyId: caller.keyId.slice(0, 16), kind, request: stored, maxCredits: (maxCredits as number | undefined) ?? null }, at)
    const created = await config.store.create(job, limits, claim, at)
    if (!created.ok && created.reason === 'conflict') return refusal(409, 'idempotency_conflict', 'this idempotency key started a different job in the last 24 hours')
    if (!created.ok) return refusal(429, 'jobs_busy', `this account has ${created.running} jobs running and ${created.queued} waiting, the most it may`, ['wait for one to finish, or cancel one'], { 'Retry-After': '60' })
    if (created.replayed) return json({ taskId: created.job.id, replayed: true, ...status(created.job) }, 202)
    if (created.job.status === 'running' && !(await queueOrFail(created.job))) {
      return refusal(503, 'jobs_unavailable', 'the job could not be queued; nothing was charged', ['retry in a minute'], { 'Retry-After': '60' })
    }
    log(JSON.stringify({ severity: 'INFO', event: 'hosted_job_started', workspaceId, jobId: job.id, kind, pages, status: created.job.status }))
    return json({ ...status(created.job), estimatedCredits, ...(kind === 'batch' && (parsed as ParsedBatchStartRequest).invalidURLs !== undefined ? { invalidURLs: (parsed as ParsedBatchStartRequest).invalidURLs } : {}) }, 202)
  }

  /** A page of a job's items from its slice files, from a cursor `slice:line`. */
  async function list(job: HostedJob, filter: 'all' | 'pages' | 'errors', url: URL): Promise<Response> {
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam === null ? PAGE_LIST_DEFAULT : Number(limitParam)
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIST_MAX) return refusal(400, 'invalid_request', `limit must be 1 to ${PAGE_LIST_MAX}`)
    const cursor = url.searchParams.get('cursor')
    const from = cursor === null ? [0, 0] : cursor.split(':').map(Number)
    if (from.length !== 2 || !from.every((n) => Number.isSafeInteger(n) && n >= 0)) return refusal(400, 'invalid_request', 'cursor is not one this API issued')
    const items: unknown[] = []
    let [slice, line] = from as [number, number]
    for (; slice < job.counts.slices && items.length < limit; slice++, line = 0) {
      const lines = await config.files.segment(job, slice) ?? []
      for (; line < lines.length; line++) {
        const item = JSON.parse(lines[line]!) as { status?: string }
        const isError = ['failed', 'blocked', 'cancelled', 'budget_exceeded'].includes(item.status ?? '')
        if (filter === 'pages' && (isError || item.status === 'duplicate')) continue
        if (filter === 'errors' && !isError) continue
        if (items.length === limit) break
        items.push(item)
      }
      if (items.length === limit && line < lines.length) break
    }
    const hasMore = slice < job.counts.slices
    return json({ items, nextCursor: hasMore ? `${slice}:${line}` : null, hasMore })
  }

  return {
    async handle(request: Request, caller: JobCaller): Promise<Response> {
      const url = new URL(request.url)
      const method = request.method
      if (method === 'POST' && url.pathname === '/v1/batches') return start('batch', request, caller)
      if (method === 'POST' && url.pathname === '/v1/crawl') return start('crawl', request, caller)
      const [, , collection, id, action] = url.pathname.split('/') as [string, string, 'batches' | 'crawl' | 'jobs', string, string | undefined]
      const kind = collection === 'batches' ? 'batch' : collection === 'crawl' ? 'crawl' : null
      if (method === 'POST' && action === 'cancel' && kind !== null) {
        const found = await owned(id, caller, kind)
        if (found instanceof Response) return found
        const cancelled = await config.store.cancel(id, found.workspaceId, now())
        if (!cancelled.ok) return refusal(404, 'not_found', `no ${kind} ${id} for this account`)
        await queuePromoted(cancelled.promoted)
        // One more delivery for the cancelled job: the worker writes its export and schedules its expiry (a slice queued or
        // running for this generation already is the same task, and does it).
        await config.enqueueSlice(cancelled.job).catch((error: unknown) => log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_enqueue_failed', workspaceId: cancelled.job.workspaceId, jobId: id, message: String(error) })))
        return json(status(cancelled.job))
      }
      if (method !== 'GET') return refusal(404, 'not_found', `${method} ${url.pathname} is not a job route`)
      const found = await owned(id, caller, kind)
      if (found instanceof Response) return found
      if (action === undefined && kind !== null) return json(status(found))
      if (action === 'export' && kind === null) {
        if (found.finishedAt === null) return refusal(409, 'job_running', `job ${id} has not finished; its export is written when it does`)
        return json({ url: await config.files.exportUrl(found), expiresInSeconds: EXPORT_LINK_SECONDS })
      }
      if (kind === 'batch' && action === 'items') return list(found, 'all', url)
      if (kind === 'crawl' && action === 'pages') return list(found, 'pages', url)
      if (kind !== null && action === 'errors') return list(found, 'errors', url)
      return refusal(404, 'not_found', `${method} ${url.pathname} is not a job route`)
    },
  }
}
