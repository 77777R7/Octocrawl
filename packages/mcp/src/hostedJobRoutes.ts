/**
 * Hosted batch and crawl jobs at the gate (ROADMAP PH stage H1, docs/h1-hosted-jobs-tasks.md PR ③): starting, reading,
 * paging and cancelling a job, for an account's keys only. A start writes the job (hostedJobs.ts) and queues its first
 * slice; the worker (PR ④) reads it, a slice at a time, and writes each slice's pages to a segment file in GCS, which the
 * reads here page through. Nothing runs here but the bookkeeping.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { CRAWL_SCOPE_KEYS, evaluateHostname, hostedNetworkPolicy, hostedVerifyRefusal, parseBatchStartRequest, parseCrawlStartRequest, readWebhook, RequestError, type ParsedBatchStartRequest, type ParsedCrawlStartRequest } from '@w2l/contracts'
import type { CreditsStore } from './hostedCredits.js'
import { CREDITS } from './hostedCredits.js'
import { asksModelFallback } from './hostedModel.js'
import type { GcsBucket } from './hostedCloud.js'
import { newHostedJob, type HostedJob, type HostedJobStore, type HostedJobWebhook, type HostedWebhookEvent, type JobLimits } from './hostedJobs.js'

/** The options of a page in a job, as hosted serves them on a scrape (HOSTED_SCRAPE_KEYS), less the scrape's own. */
const JOB_PAGE_KEYS = ['onlyMainContent', 'waitFor', 'timeout', 'maxFileBytes', 'includeTags', 'excludeTags', 'headers', 'mobile', 'fastMode', 'blockAds', 'removeBase64Images', 'verify', 'origin', 'integration'] as const
export const HOSTED_BATCH_KEYS: ReadonlySet<string> = new Set(['urls', 'mode', 'formats', 'includeLinks', 'maxConcurrency', 'ignoreInvalidURLs', 'idempotencyKey', 'maxCredits', 'webhook', ...JOB_PAGE_KEYS])
export const HOSTED_CRAWL_KEYS: ReadonlySet<string> = new Set(['url', 'mode', 'maxPages', 'maxDepth', 'allowlistedDomains', 'formats', 'includeLinks', 'includePaths', 'excludePaths', ...CRAWL_SCOPE_KEYS, 'sitemap', 'maxConcurrency', 'idempotencyKey', 'maxCredits', 'webhook', ...JOB_PAGE_KEYS])
const WEBHOOK_EVENTS: readonly HostedWebhookEvent[] = ['completed', 'failed', 'cancelled']

/**
 * A start's `webhook` as hosted takes it (H2 W1): the local shape (readWebhook), to a public https address, for the job's
 * end only, without headers or secretEnv (the job signs with a secret of its own). A string is the url alone.
 */
export function readHostedWebhook(value: unknown): Omit<HostedJobWebhook, 'secret' | 'delivery'> | undefined {
  const config = readWebhook(value)
  if (config === undefined) return undefined
  if (config.headers !== undefined) throw new RequestError('hosted jobs do not send webhook.headers; verify a delivery by its x-w2l-signature, made with the secret the start returns')
  if (config.secretEnv !== undefined) throw new RequestError('hosted jobs do not take webhook.secretEnv; each job signs with a secret the start returns')
  const url = new URL(config.url)
  if (url.protocol !== 'https:') throw new RequestError('webhook.url must be https')
  const decision = evaluateHostname(url.hostname, hostedNetworkPolicy())
  if (decision !== null && !decision.allowed) throw new RequestError('webhook.url must be a public address')
  const events = config.events ?? WEBHOOK_EVENTS
  const other = events.filter((event) => !(WEBHOOK_EVENTS as readonly string[]).includes(event))
  if (other.length > 0) throw new RequestError(`hosted jobs post only their end (completed, failed, cancelled), not ${other.join(', ')}`)
  return { url: config.url, events: [...events] as HostedWebhookEvent[], metadata: { ...(config.metadata ?? {}) } }
}

/** A job's status as its routes, its list and its webhook report it; the webhook's secret is never in it. */
export function jobStatus(job: HostedJob): Record<string, unknown> {
  const requested = job.kind === 'batch' ? (job.request as { urls: readonly string[] }).urls.length : null
  const completed = job.counts.pages + job.counts.errors
  return {
    taskId: job.id, kind: job.kind, status: job.status, failureReason: job.failureReason, budgetExceeded: job.budgetExceeded ?? null,
    // As a local crawl counts them: pagesFetched is every page read, failed ones included; succeeded and failed split them.
    pagesFetched: completed, succeeded: job.counts.pages, failed: job.counts.errors, errors: job.counts.errors, completed,
    ...(requested === null ? {} : { requested, remaining: Math.max(0, requested - completed) }),
    credits: { used: job.credits.used, maxCredits: job.credits.maxCredits },
    ...(job.webhook ? { webhook: { url: job.webhook.url, events: job.webhook.events, delivery: job.webhook.delivery } } : {}),
    createdAt: job.createdAt, finishedAt: job.finishedAt, expiresAt: job.expireAt,
  }
}

export const JOBS_INVITE_ONLY = 'hosted batch and crawl jobs are open to invited accounts for now'
export const JOB_DEFAULT_CRAWL_PAGES = 100
export const JOB_MAX_CRAWL_PAGES = 500
/** New pages a slice stores at most (docs/launch/2026-10-19-h1-hosted-jobs-plan.md §5): a start needs the credits for one. */
export const JOB_SLICE_PAGES = 100
/** Pages a job's slice reads at once, its engine's workers (hostedJobWorker.ts): the most a crawl's or a batch's maxConcurrency gets. */
export const JOB_WORKER_COUNT = 2
export const JOB_LIMITS: JobLimits = { maxRunning: 2, maxQueued: 10 }
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000
const PAGE_LIST_DEFAULT = 50
const PAGE_LIST_MAX = 100
/** A page of items stays under this many bytes of JSON, well under Cloud Run's 32 MiB response limit; one larger item is a page alone. */
const PAGE_LIST_MAX_BYTES = 16_000_000
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
  /**
   * Queues a finished job's last delivery at once, by a name of its own (`{jobId}-finish`), so that a slice waiting in
   * the queue with a delay does not hold back its export and its webhook. Absent: the slice's own name is used.
   */
  enqueueFinish?: (job: HostedJob) => Promise<void>
  /** The global switch (`hostedConfig/jobs.enabled`); absent: on. */
  enabled?: () => Promise<boolean>
  /** Whether an account may start jobs (`hostedConfig/jobs.allowedUids`); absent: every account. Reads and cancels are not gated. */
  allows?: (uid: string) => Promise<boolean>
  /**
   * Throws the RequestError the worker's engine would refuse the stored request with when the job's first slice starts it
   * (ApiEngine checkCrawlStart, checkBatchStart): the start answers it 400 instead of a job that fails later. createHostedApi
   * fills it with an engine configured as the worker's; absent: no such check.
   */
  checkStart?: { batch: (request: ParsedBatchStartRequest) => void; crawl: (request: ParsedCrawlStartRequest) => void }
  limits?: JobLimits
}

/** The account a job request acts for, as the gate identified it. */
export interface JobCaller { uid: string; keyId: string; browser: boolean }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const refusal = (status: number, code: string, error: string, agentHints: readonly string[] = [], headers: Record<string, string> = {}) => json({ error, code, agentHints }, status, headers)

/** Whether a method and path are a job route; the gate hands those to handleJob. */
export function isJobRoute(method: string, path: string): boolean {
  if (method === 'POST' && (path === '/v1/batches' || path === '/v1/crawl')) return true
  if (method === 'GET' && (path === '/v1/jobs' || path === '/v1/crawl/active')) return true
  return /^\/v1\/(batches|crawl|jobs)\/[^/]+(\/(items|pages|errors|cancel|export))?$/.test(path) && (method === 'GET' || method === 'POST')
}

export function createJobRoutes(config: HostedJobsConfig, credits: CreditsStore, log: (line: string) => void, now: () => Date = () => new Date()) {
  const limits = config.limits ?? JOB_LIMITS

  /**
   * Queues a running job's slice. A running job with no slice queued would hold its slot forever, so one that cannot be
   * queued fails (`not_queued`, nothing charged), and the job promoted into its slot is queued in turn.
   */
  /**
   * Queues a running job's first slice, or fails it (`not_queued`). A job failed at its own start is answered 503, so its
   * caller never had its id or its webhook's secret: nothing is posted, and its webhook says why. A job promoted from the
   * queue was answered 202 long ago: its end is delivered as any job's is, so that its webhook is posted.
   */
  async function queueOrFail(job: HostedJob, from: 'start' | 'promoted'): Promise<boolean> {
    try { await config.enqueueSlice(job); return true }
    catch (error) {
      log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_enqueue_failed', workspaceId: job.workspaceId, jobId: job.id, message: error instanceof Error ? error.message : String(error) }))
      const failed = await config.store.fail(job.id, 'not_queued', now()).catch(() => null)
      if (failed?.ok === true && failed.job.webhook) {
        if (from === 'start') await notPosted(failed.job, 'not sent: the job was never queued, and its start was answered 503')
        else await finishNow(failed.job, true)
      }
      await queuePromoted(failed?.ok === true ? failed.promoted : null)
      return false
    }
  }
  /**
   * A finished job's last delivery, at once. When the queue refuses it and no other delivery of the job can come
   * (`onlyDelivery`), its webhook records that it was not sent; a timeout is not a refusal, as the task may exist.
   */
  async function finishNow(job: HostedJob, onlyDelivery: boolean): Promise<void> {
    try { await (config.enqueueFinish ?? config.enqueueSlice)(job) }
    catch (error) {
      log(JSON.stringify({ severity: 'ERROR', event: 'hosted_job_enqueue_failed', workspaceId: job.workspaceId, jobId: job.id, message: error instanceof Error ? error.message : String(error) }))
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      if (onlyDelivery && !timedOut && job.webhook) await notPosted(job, 'not sent: the job\'s last delivery could not be queued')
    }
  }
  /** Records that a job's webhook was not sent, only while nothing is recorded: never over a delivery under way or done. */
  async function notPosted(job: HostedJob, error: string): Promise<void> {
    await config.store.recordWebhook(job.id, { state: 'failed', attempts: 0, httpStatus: null, error, at: now().toISOString() }, { onlyIfUnset: true }).catch(() => null)
  }
  async function queuePromoted(id: string | null): Promise<void> {
    const promoted = id === null ? null : await config.store.get(id)
    if (promoted !== null && promoted.status === 'running') await queueOrFail(promoted, 'promoted')
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

  const status = jobStatus
  /** A start's answer: the job's status, with its webhook's secret, the only place any route shows it. */
  const withSecret = (job: HostedJob) => job.webhook ? { ...status(job), webhook: { ...(status(job).webhook as object), secret: job.webhook.secret } } : status(job)

  async function start(kind: 'batch' | 'crawl', request: Request, caller: JobCaller): Promise<Response> {
    if (config.enabled !== undefined && !(await config.enabled())) return refusal(503, 'jobs_paused', 'hosted batch and crawl jobs are paused for now', ['run it on your computer meanwhile: npx octocrawl serve'], { 'Retry-After': '300' })
    if (config.allows !== undefined && !(await config.allows(caller.uid))) return refusal(403, 'jobs_invite_only', JOBS_INVITE_ONLY, ['run it on your computer meanwhile: npx octocrawl serve'])
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
    // The webhook stays out of the request the engine runs: the worker posts the job's end, not the engine.
    let webhook: ReturnType<typeof readHostedWebhook>
    try { webhook = readHostedWebhook(body.webhook) }
    catch (error) { return refusal(400, 'invalid_request', error instanceof Error ? error.message : String(error)) }
    delete body.webhook
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
    // The worker's hosted engine refuses these at the job's first slice, which fails and is retried until the job ends
    // failed (delivery_failed) without naming why: the start refuses them by name instead.
    const regexRefusal = hostedVerifyRefusal(parsed.verify)
    if (regexRefusal !== null) return refusal(400, 'unsupported_parameter', regexRefusal)
    // A batch's maxConcurrency is lowered to the slice's workers when it runs (engine.ts); a crawl's engine refuses one above
    // them, so a crawl's is lowered here.
    const crawl = kind === 'crawl' ? parsed as ParsedCrawlStartRequest : null
    if (crawl !== null && crawl.maxConcurrency != null && crawl.maxConcurrency > JOB_WORKER_COUNT) parsed = { ...crawl, maxConcurrency: JOB_WORKER_COUNT }
    // And every other check the engine makes when it starts the request the job stores: its file cap, its selectors, the
    // formats a check needs.
    try {
      if (kind === 'batch') config.checkStart?.batch(parsed as ParsedBatchStartRequest)
      else config.checkStart?.crawl(parsed as ParsedCrawlStartRequest)
    } catch (error) {
      if (!(error instanceof RequestError)) throw error
      return refusal(400, error.code, error.message, error.agentHints ?? [])
    }

    const pages = kind === 'batch' ? (parsed as ParsedBatchStartRequest).urls.length : (parsed as ParsedCrawlStartRequest).maxPages ?? JOB_DEFAULT_CRAWL_PAGES
    const price = body.fastMode === true ? CREDITS.httpPage : CREDITS.browserPage
    const cap = (maxCredits as number | undefined) ?? Number.POSITIVE_INFINITY
    // The estimate counts the json model fallback's two a page where it is asked for; the start needs only what a slice
    // without the model needs, since a slice short of the two reads without it.
    const estimatedCredits = Math.min(pages * (price + (asksModelFallback(body.formats) ? CREDITS.model : 0)), cap)
    const firstSlice = Math.min(Math.min(pages, JOB_SLICE_PAGES) * price, cap)
    const at = now()
    const balance = await credits.balance(caller.uid, at)
    if (balance < firstSlice) {
      return refusal(429, 'quota_exhausted', `this account has ${balance} credits; the job's first slice needs ${firstSlice}`, ['send fastMode: true to read over HTTP alone at 1 credit a page, or fewer URLs'])
    }

    const workspaceId = personalWorkspace(caller.uid)
    const idempotencyKey = (parsed as { idempotencyKey?: string }).idempotencyKey
    const { idempotencyKey: _key, ...stored } = parsed as typeof parsed & { idempotencyKey?: string }
    const claim = idempotencyKey === undefined ? null : {
      id: `${workspaceId}-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}`,
      fingerprint: createHash('sha256').update(JSON.stringify({ kind, stored, maxCredits, ...(webhook === undefined ? {} : { webhook }) })).digest('hex'),
      expireAt: new Date(at.getTime() + IDEMPOTENCY_TTL_MS).toISOString(),
    }
    const secret = webhook === undefined ? null : `whsec_${randomBytes(32).toString('base64url')}`
    const job = newHostedJob({ id: randomUUID(), workspaceId, uid: caller.uid, keyId: caller.keyId.slice(0, 16), kind, request: stored, maxCredits: (maxCredits as number | undefined) ?? null, webhook: webhook === undefined ? null : { ...webhook, secret: secret!, delivery: null } }, at)
    const created = await config.store.create(job, limits, claim, at)
    if (!created.ok && created.reason === 'conflict') return refusal(409, 'idempotency_conflict', 'this idempotency key started a different job in the last 24 hours')
    if (!created.ok) return refusal(429, 'jobs_busy', `this account has ${created.running} jobs running and ${created.queued} waiting, the most it may`, ['wait for one to finish, or cancel one'], { 'Retry-After': '60' })
    // A replay is the same account retrying a start whose answer it may never have read: it gets the job's secret again.
    if (created.replayed) return json({ taskId: created.job.id, replayed: true, ...withSecret(created.job) }, 202)
    if (created.job.status === 'running' && !(await queueOrFail(created.job, 'start'))) {
      return refusal(503, 'jobs_unavailable', 'the job could not be queued; nothing was charged', ['retry in a minute'], { 'Retry-After': '60' })
    }
    log(JSON.stringify({ severity: 'INFO', event: 'hosted_job_started', workspaceId, jobId: job.id, kind, pages, status: created.job.status }))
    return json({ ...withSecret(created.job), estimatedCredits, ...(kind === 'batch' && (parsed as ParsedBatchStartRequest).invalidURLs !== undefined ? { invalidURLs: (parsed as ParsedBatchStartRequest).invalidURLs } : {}) }, 202)
  }

  /** A page of a job's items from its slice files, from a cursor `slice:line`. */
  /**
   * The position after a page named by the local API's cursor (base64url of its createdAt and id): the cursor an MCP
   * answer cut for size gives (results.ts pageListWithinBudget), which names the last page it kept. Null when the job
   * holds no such page.
   */
  async function afterStep(job: HostedJob, cursor: string): Promise<[number, number] | null> {
    let id: unknown
    try { id = (JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { id?: unknown }).id } catch { return null }
    if (typeof id !== 'string' || id.length === 0) return null
    for (let slice = 0; slice < job.counts.slices; slice++) {
      const lines = await config.files.segment(job, slice) ?? []
      for (let line = 0; line < lines.length; line++) {
        if ((JSON.parse(lines[line]!) as { id?: unknown }).id === id) return line + 1 < lines.length ? [slice, line + 1] : [slice + 1, 0]
      }
    }
    return null
  }

  async function list(job: HostedJob, filter: 'all' | 'pages' | 'errors', url: URL): Promise<Response> {
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam === null ? PAGE_LIST_DEFAULT : Number(limitParam)
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIST_MAX) return refusal(400, 'invalid_request', `limit must be 1 to ${PAGE_LIST_MAX}`)
    const cursor = url.searchParams.get('cursor')
    const from = cursor === null ? [0, 0] : /^\d+:\d+$/.test(cursor) ? cursor.split(':').map(Number) : await afterStep(job, cursor)
    if (from === null || from.length !== 2 || !from.every((n) => Number.isSafeInteger(n) && n >= 0)) return refusal(400, 'invalid_request', 'cursor is not one this API issued')
    const items: unknown[] = []
    let bytes = 0
    let full = false
    let [slice, line] = from as [number, number]
    for (; slice < job.counts.slices && !full; slice++, line = 0) {
      const lines = await config.files.segment(job, slice) ?? []
      for (; line < lines.length; line++) {
        const item = JSON.parse(lines[line]!) as { status?: string }
        const isError = ['failed', 'blocked', 'cancelled', 'budget_exceeded'].includes(item.status ?? '')
        if (filter === 'pages' && (isError || item.status === 'duplicate')) continue
        if (filter === 'errors' && !isError) continue
        if (items.length === limit || (items.length > 0 && bytes + lines[line]!.length > PAGE_LIST_MAX_BYTES)) { full = true; break }
        items.push(item)
        bytes += lines[line]!.length
      }
      if (full) break
    }
    const hasMore = slice < job.counts.slices
    return json({ items, nextCursor: hasMore ? `${slice}:${line}` : null, hasMore })
  }

  /** The account's jobs, newest first, a page at a time: `before` is the job the previous page ended at. */
  async function listJobs(caller: JobCaller, url: URL): Promise<Response> {
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam === null ? 20 : Number(limitParam)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return refusal(400, 'invalid_request', 'limit must be 1 to 50')
    const before = url.searchParams.get('before')
    const all = await config.store.list(personalWorkspace(caller.uid))
    const from = before === null ? 0 : all.findIndex((job) => job.id === before) + 1
    if (from === 0 && before !== null) return refusal(400, 'invalid_request', 'before must be a nextBefore this list returned, of a job still kept')
    const jobs = all.slice(from)
    const page = jobs.slice(0, limit)
    return json({ items: page.map(status), nextBefore: jobs.length > limit ? page.at(-1)!.id : null, hasMore: jobs.length > limit })
  }

  /**
   * The account's crawl jobs not yet ended, oldest first, as a local server's GET /v1/crawl/active lists the crawls it runs:
   * in a job's own statuses (queued, running), and without the options each was started with.
   */
  async function activeCrawls(caller: JobCaller): Promise<Response> {
    const crawls = (await config.store.list(personalWorkspace(caller.uid)))
      .filter((job) => job.kind === 'crawl' && (job.status === 'queued' || job.status === 'running'))
      .map((job) => ({ id: job.id, url: (job.request as { url: string }).url, status: job.status, startedAt: job.startedAt ?? job.createdAt, pagesFetched: job.counts.pages + job.counts.errors }))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
    return json({ crawls })
  }

  return {
    /** Whether the account may start jobs, so that an MCP connection lists the job tools only to an account that may. */
    allows: async (uid: string) => config.allows === undefined || await config.allows(uid),
    async handle(request: Request, caller: JobCaller): Promise<Response> {
      const url = new URL(request.url)
      const method = request.method
      if (method === 'POST' && url.pathname === '/v1/batches') return start('batch', request, caller)
      if (method === 'POST' && url.pathname === '/v1/crawl') return start('crawl', request, caller)
      if (method === 'GET' && url.pathname === '/v1/jobs') return listJobs(caller, url)
      if (method === 'GET' && url.pathname === '/v1/crawl/active') return activeCrawls(caller)
      const [, , collection, id, action] = url.pathname.split('/') as [string, string, 'batches' | 'crawl' | 'jobs', string, string | undefined]
      const kind = collection === 'batches' ? 'batch' : collection === 'crawl' ? 'crawl' : null
      if (method === 'POST' && action === 'cancel' && kind !== null) {
        const found = await owned(id, caller, kind)
        if (found instanceof Response) return found
        const cancelled = await config.store.cancel(id, found.workspaceId, now())
        if (!cancelled.ok) return refusal(404, 'not_found', `no ${kind} ${id} for this account`)
        await queuePromoted(cancelled.promoted)
        // A slice that holds the lease finishes the job when it commits, with its pages counted. Otherwise one more delivery,
        // at once and by its own name, writes the export, schedules the expiry and posts the webhook: a slice waiting in the
        // queue with a delay (the next UTC day, a busy host) would hold them back until it came due.
        const sliceRunning = cancelled.job.lease !== null && Date.parse(cancelled.job.lease.expireAt) > now().getTime()
        // A slice still queued for the job finishes it later if this delivery is refused, so nothing is recorded then.
        if (!sliceRunning) await finishNow(cancelled.job, false)
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
