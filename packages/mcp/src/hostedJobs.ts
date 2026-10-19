/**
 * Hosted jobs' authoritative state (ROADMAP PH stage H1; docs/launch/2026-10-19-h1-hosted-jobs-plan.md §4–§6).
 *
 * A job document `hostedJobs/{jobId}` holds its owner, status, counts, credits and the lease of the slice running it.
 * A workspace's slots `hostedJobWorkspaces/{workspaceId}` name the jobs it runs and queues, so at most `maxRunning` run
 * and `maxQueued` wait; an `Idempotency-Key` is `hostedJobIdempotency/{workspaceId}-{keyHash}`. Every change that touches
 * more than one of them is one commit with update-time preconditions, retried on a conflict.
 *
 * A slice holds the lease for the job's current `generation`: a delivery for an older generation is stale (Cloud Tasks
 * delivers at least once), and one that finds the lease held is busy until it expires (an instance that died mid-slice).
 * Committing a slice clears the lease and moves to the next generation, or finishes the job and promotes the next queued one.
 */

export type HostedJobKind = 'batch' | 'crawl'
export type HostedJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired'
const FINISHED: ReadonlySet<HostedJobStatus> = new Set(['completed', 'failed', 'cancelled', 'expired'])

/** Days a finished job's results are served, then days its record stays to answer 410 before the TTL deletes it. */
export const JOB_RETENTION_DAYS = 7
export const JOB_TOMBSTONE_DAYS = 30

export interface HostedJob {
  id: string
  workspaceId: string
  uid: string
  keyId: string
  kind: HostedJobKind
  /** The parsed request, without header values. */
  request: unknown
  status: HostedJobStatus
  failureReason: string | null
  counts: { pages: number; errors: number; slices: number }
  credits: { reserved: number; used: number; maxCredits: number | null }
  generation: number
  lease: { holder: string; expireAt: string } | null
  /** Per host, when its last request started and the Crawl-delay robots.txt gave, carried from slice to slice. */
  hosts: Record<string, { lastStartedAt: string; crawlDelayMs: number | null }>
  /**
   * The credits a slice reserved (hostedCredits.ts Reservation, with an id) and, once the slice committed, what it used:
   * kept until it is settled, so that a slice that died, or a settle that failed, is settled by the next delivery. A
   * reservation settles once whoever settles it.
   */
  reservation?: { reservation: unknown; used: number | null; perKind?: Record<string, number> } | null
  /** The job's committed checkpoint object, written by the last committed slice; null before the first. */
  checkpoint?: string | null
  /** The committed slices' page files, in order: what reads page through and the export joins. */
  segments?: string[]
  /** Slices in a row that stored no page; at the worker's limit the job fails (`no_progress`). */
  idleSlices?: number
  /** The queued job this one's end promoted into its slot: a later delivery of this job queues its first slice if no one did. */
  promoted?: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  /** Results are served until then; null while the job runs. */
  expireAt: string | null
  /** The TTL deletes the record then: JOB_TOMBSTONE_DAYS after its expiry, or after its creation for a job never finished. */
  deleteAt: string
}

export interface IdempotencyClaim {
  /** `{workspaceId}-{hex digest of the key}`. */
  id: string
  /** The request's fingerprint: the same key with another request is a conflict. */
  fingerprint: string
  expireAt: string
}

export interface JobLimits { maxRunning: number; maxQueued: number }

export type CreateResult =
  | { ok: true; job: HostedJob; replayed: boolean }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'busy'; running: number; queued: number }
/** `queued`: the job waits for a running slot; its first slice is queued when it is promoted. */
export type LeaseResult = { ok: true; job: HostedJob } | { ok: false; reason: 'missing' | 'queued' | 'stale' | 'busy' | 'finished' }
export type CommitResult = { ok: true; job: HostedJob; promoted: string | null } | { ok: false; reason: 'missing' | 'lost' }
export type CancelResult = { ok: true; job: HostedJob; promoted: string | null } | { ok: false; reason: 'missing' }
export type ExpireResult = { ok: true; job: HostedJob } | { ok: false; reason: 'missing' | 'not_finished' }

export interface HostedJobStore {
  /** Creates a job running or queued, by its workspace's slots; with a claim, a replay answers the job the key started. */
  create(job: HostedJob, limits: JobLimits, claim: IdempotencyClaim | null, now?: Date): Promise<CreateResult>
  get(id: string): Promise<HostedJob | null>
  acquireLease(id: string, lease: { generation: number; holder: string; ttlMs: number }, now?: Date): Promise<LeaseResult>
  /** Changes a job while `holder` holds its lease, keeping the lease and the generation (a slice's reservation). */
  updateHeld(id: string, holder: string, patch: (job: HostedJob) => HostedJob): Promise<CommitResult>
  /** Writes a slice's outcome while `holder` still holds the lease. A job cancelled meanwhile stays cancelled. */
  commitSlice(id: string, holder: string, patch: (job: HostedJob) => HostedJob, now?: Date): Promise<CommitResult>
  /** Cancels a job of this workspace; another workspace's job is missing. Cancelling a finished job changes nothing. */
  cancel(id: string, workspaceId: string, now?: Date): Promise<CancelResult>
  /** Marks a finished job expired once its results are deleted. */
  expire(id: string, now?: Date): Promise<ExpireResult>
  /** Fails a job not yet finished, with a reason, freeing its slot as a cancel does (a job whose slice could not be queued). */
  fail(id: string, reason: string, now?: Date): Promise<CancelResult>
}

/** A claim belongs to the workspace it names first, so a replay can only ever answer that workspace's own job. */
function checkClaim(job: HostedJob, claim: IdempotencyClaim | null): void {
  if (claim !== null && !claim.id.startsWith(`${job.workspaceId}-`)) throw new Error('idempotency key id must start with its workspace id')
}

const days = (from: Date, n: number) => new Date(from.getTime() + n * 86_400_000).toISOString()

export function newHostedJob(input: { id: string; workspaceId: string; uid: string; keyId: string; kind: HostedJobKind; request: unknown; maxCredits: number | null }, now = new Date()): HostedJob {
  return {
    id: input.id, workspaceId: input.workspaceId, uid: input.uid, keyId: input.keyId, kind: input.kind, request: input.request,
    status: 'queued', failureReason: null, counts: { pages: 0, errors: 0, slices: 0 }, credits: { reserved: 0, used: 0, maxCredits: input.maxCredits },
    generation: 0, lease: null, hosts: {}, createdAt: now.toISOString(), startedAt: null, finishedAt: null, expireAt: null, deleteAt: days(now, JOB_TOMBSTONE_DAYS),
  }
}

interface Slots { running: string[]; queued: string[] }

/** Slots without the jobs whose records are gone (a TTL deleted a job that never finished). */
const pruned = (slots: Slots, alive: (id: string) => boolean): Slots => ({ running: slots.running.filter(alive), queued: slots.queued.filter(alive) })

/** The pure transitions both stores apply, so they cannot drift apart. */
const transitions = {
  create(job: HostedJob, slots: Slots, limits: JobLimits): { job: HostedJob; slots: Slots } | { busy: true } {
    if (slots.running.length < limits.maxRunning) return { job: { ...job, status: 'running' }, slots: { ...slots, running: [...slots.running, job.id] } }
    if (slots.queued.length < limits.maxQueued) return { job: { ...job, status: 'queued' }, slots: { ...slots, queued: [...slots.queued, job.id] } }
    return { busy: true }
  },
  lease(job: HostedJob, lease: { generation: number; holder: string; ttlMs: number }, now: Date): LeaseResult {
    if (FINISHED.has(job.status)) return { ok: false, reason: 'finished' }
    if (job.status === 'queued') return { ok: false, reason: 'queued' }
    if (lease.generation !== job.generation) return { ok: false, reason: 'stale' }
    if (job.lease !== null && Date.parse(job.lease.expireAt) > now.getTime()) return { ok: false, reason: 'busy' }
    return { ok: true, job: { ...job, startedAt: job.startedAt ?? now.toISOString(), lease: { holder: lease.holder, expireAt: new Date(now.getTime() + lease.ttlMs).toISOString() } } }
  },
  /**
   * A job leaving the slots: its own removed, and when it ran, the first queued one promoted to run. `alive` names the
   * jobs whose records still exist: one a TTL deleted holds no slot and is never promoted.
   */
  release(slots: Slots, id: string, alive: (id: string) => boolean = () => true): { slots: Slots; promoted: string | null } {
    const ran = slots.running.includes(id)
    const running = slots.running.filter((other) => other !== id && alive(other))
    const queued = slots.queued.filter((other) => other !== id && alive(other))
    const promoted = ran ? queued[0] ?? null : null
    return { slots: { running: promoted === null ? running : [...running, promoted], queued: promoted === null ? queued : queued.slice(1) }, promoted }
  },
  finish(job: HostedJob, status: HostedJobStatus, now: Date): HostedJob {
    return { ...job, status, lease: null, finishedAt: now.toISOString(), expireAt: days(now, JOB_RETENTION_DAYS), deleteAt: days(now, JOB_RETENTION_DAYS + JOB_TOMBSTONE_DAYS) }
  },
}

/** A slice's patch applied: a job finished meanwhile (cancelled) keeps its status and finish times, and takes the counts. */
function applySlice(job: HostedJob, patch: (job: HostedJob) => HostedJob, now: Date): { job: HostedJob; finishing: boolean } {
  const patched = patch(job)
  if (FINISHED.has(job.status)) return { job: { ...patched, status: job.status, finishedAt: job.finishedAt, expireAt: job.expireAt, deleteAt: job.deleteAt, lease: null }, finishing: false }
  if (FINISHED.has(patched.status)) return { job: transitions.finish(patched, patched.status, now), finishing: true }
  return { job: { ...patched, status: 'running', lease: null, generation: job.generation + 1 }, finishing: false }
}

export class MemoryHostedJobStore implements HostedJobStore {
  readonly jobs = new Map<string, HostedJob>()
  readonly slots = new Map<string, Slots>()
  readonly claims = new Map<string, { jobId: string; fingerprint: string; expireAt: string }>()
  async create(job: HostedJob, limits: JobLimits, claim: IdempotencyClaim | null, now = new Date()): Promise<CreateResult> {
    checkClaim(job, claim)
    if (claim) {
      const held = this.claims.get(claim.id)
      if (held && Date.parse(held.expireAt) > now.getTime()) {
        if (held.fingerprint !== claim.fingerprint) return { ok: false, reason: 'conflict' }
        const existing = this.jobs.get(held.jobId)
        if (existing && existing.workspaceId === job.workspaceId) return { ok: true, job: existing, replayed: true }
      }
    }
    // A full workspace first lets go of the jobs whose records are gone.
    let slots = this.slots.get(job.workspaceId) ?? { running: [], queued: [] }
    let next = transitions.create(job, slots, limits)
    if ('busy' in next) { slots = pruned(slots, (id) => this.jobs.has(id)); next = transitions.create(job, slots, limits) }
    if ('busy' in next) return { ok: false, reason: 'busy', running: slots.running.length, queued: slots.queued.length }
    this.jobs.set(job.id, next.job)
    this.slots.set(job.workspaceId, next.slots)
    if (claim) this.claims.set(claim.id, { jobId: job.id, fingerprint: claim.fingerprint, expireAt: claim.expireAt })
    return { ok: true, job: next.job, replayed: false }
  }
  async get(id: string): Promise<HostedJob | null> { return this.jobs.get(id) ?? null }
  async acquireLease(id: string, lease: { generation: number; holder: string; ttlMs: number }, now = new Date()): Promise<LeaseResult> {
    const job = this.jobs.get(id)
    if (!job) return { ok: false, reason: 'missing' }
    const result = transitions.lease(job, lease, now)
    if (result.ok) this.jobs.set(id, result.job)
    return result
  }
  async updateHeld(id: string, holder: string, patch: (job: HostedJob) => HostedJob): Promise<CommitResult> {
    const job = this.jobs.get(id)
    if (!job) return { ok: false, reason: 'missing' }
    if (job.lease?.holder !== holder) return { ok: false, reason: 'lost' }
    const next = { ...patch(job), status: job.status, lease: job.lease, generation: job.generation }
    this.jobs.set(id, next)
    return { ok: true, job: next, promoted: null }
  }
  async commitSlice(id: string, holder: string, patch: (job: HostedJob) => HostedJob, now = new Date()): Promise<CommitResult> {
    const job = this.jobs.get(id)
    if (!job) return { ok: false, reason: 'missing' }
    if (job.lease?.holder !== holder) return { ok: false, reason: 'lost' }
    const { job: next, finishing } = applySlice(job, patch, now)
    this.jobs.set(id, next)
    if (!finishing) return { ok: true, job: next, promoted: null }
    const promoted = this.leave(job.workspaceId, id)
    const ended = { ...next, promoted }
    this.jobs.set(id, ended)
    return { ok: true, job: ended, promoted }
  }
  async cancel(id: string, workspaceId: string, now = new Date()): Promise<CancelResult> {
    const job = this.jobs.get(id)
    if (!job || job.workspaceId !== workspaceId) return { ok: false, reason: 'missing' }
    if (FINISHED.has(job.status)) return { ok: true, job, promoted: null }
    // The lease stays: the slice running now writes its pages, and commitSlice keeps the cancel.
    const promoted = this.leave(workspaceId, id)
    const next = { ...transitions.finish(job, 'cancelled', now), lease: job.lease, promoted }
    this.jobs.set(id, next)
    return { ok: true, job: next, promoted }
  }
  async fail(id: string, reason: string, now = new Date()): Promise<CancelResult> {
    const job = this.jobs.get(id)
    if (!job) return { ok: false, reason: 'missing' }
    if (FINISHED.has(job.status)) return { ok: true, job, promoted: null }
    const promoted = this.leave(job.workspaceId, id)
    const next: HostedJob = { ...transitions.finish(job, 'failed', now), failureReason: reason, lease: job.lease, promoted }
    this.jobs.set(id, next)
    return { ok: true, job: next, promoted }
  }
  async expire(id: string): Promise<ExpireResult> {
    const job = this.jobs.get(id)
    if (!job) return { ok: false, reason: 'missing' }
    if (!FINISHED.has(job.status)) return { ok: false, reason: 'not_finished' }
    const next: HostedJob = { ...job, status: 'expired' }
    this.jobs.set(id, next)
    return { ok: true, job: next }
  }
  private leave(workspaceId: string, id: string): string | null {
    const { slots, promoted } = transitions.release(this.slots.get(workspaceId) ?? { running: [], queued: [] }, id, (other) => this.jobs.has(other))
    this.slots.set(workspaceId, slots)
    const next = promoted === null ? undefined : this.jobs.get(promoted)
    if (next) this.jobs.set(next.id, { ...next, status: 'running' })
    return promoted
  }
}

// ---- Firestore: the job as JSON beside the fields a TTL or an operator reads; preconditions on every document a commit touches ----

interface Value { stringValue?: string; timestampValue?: string }
interface FirestoreDoc { name: string; fields?: Record<string, Value>; updateTime?: string }
type Read<T> = { name: string; value: T | null; updateTime: string | null }
type Write = { update: { name: string; fields: Record<string, Value> }; currentDocument: { exists: false } | { updateTime: string } }

const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/
/** A document id Firestore accepts: no slash, not of the reserved form __name__. */
function checkedId(id: string, what: string, pattern = JOB_ID): string {
  if (!pattern.test(id) || /^__.*__$/.test(id)) throw new Error(`${what} is malformed`)
  return id
}
const WORKSPACE_ID = /^ws_[A-Za-z0-9_-]{8,128}$/
const CLAIM_ID = /^[A-Za-z0-9_-]{1,200}$/

export class FirestoreHostedJobStore implements HostedJobStore {
  private readonly resource: string
  private readonly endpoint: string
  /** `token` gives an access token for the service identity (hostedApi.ts serviceAccessToken). */
  constructor(projectId: string, private readonly token: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    this.resource = `projects/${projectId}/databases/(default)/documents`
    this.endpoint = `https://firestore.googleapis.com/v1/${this.resource}`
  }

  async create(job: HostedJob, limits: JobLimits, claim: IdempotencyClaim | null, now = new Date()): Promise<CreateResult> {
    checkedId(job.id, 'job id'); checkedId(job.workspaceId, 'workspace id', WORKSPACE_ID)
    checkClaim(job, claim)
    if (claim) checkedId(claim.id, 'idempotency key id', CLAIM_ID)
    return this.retry(async (token) => {
      const [slots, held] = await Promise.all([this.readSlots(job.workspaceId, token), claim ? this.readClaim(claim.id, token) : null])
      const live = held?.value && Date.parse(held.value.expireAt) > now.getTime() ? held.value : null
      if (claim && live) {
        if (live.fingerprint !== claim.fingerprint) return { ok: false, reason: 'conflict' }
        const existing = await this.get(live.jobId)
        if (existing && existing.workspaceId === job.workspaceId) return { ok: true, job: existing, replayed: true }
      }
      let current = slots.value ?? { running: [], queued: [] }
      let next = transitions.create(job, current, limits)
      if ('busy' in next) {
        // A full workspace first lets go of the jobs whose records are gone.
        const ids = [...current.running, ...current.queued]
        const reads = await Promise.all(ids.map((id) => this.readJob(id, token)))
        const alive = new Set(ids.filter((_, index) => reads[index]!.value !== null))
        current = pruned(current, (id) => alive.has(id))
        next = transitions.create(job, current, limits)
      }
      if ('busy' in next) return { ok: false, reason: 'busy', running: current.running.length, queued: current.queued.length }
      const writes = [this.jobWrite(next.job, { exists: false }), this.slotsWrite(job.workspaceId, next.slots, slots.updateTime)]
      if (claim) writes.push({ update: { name: this.name('hostedJobIdempotency', claim.id), fields: { uid: { stringValue: job.uid }, jobId: { stringValue: job.id }, fingerprint: { stringValue: claim.fingerprint }, expireAt: { timestampValue: claim.expireAt } } }, currentDocument: held?.updateTime ? { updateTime: held.updateTime } : { exists: false } })
      let applied: boolean
      try { applied = await this.commit(token, writes) }
      catch (error) {
        // A commit whose answer was lost may have applied: the job's record, under its new random id, says whether it did.
        const written = await this.readJob(job.id, token).catch(() => null)
        if (written?.value) return { ok: true, job: written.value, replayed: false }
        throw error
      }
      return applied ? { ok: true, job: next.job, replayed: false } : undefined
    })
  }

  async get(id: string): Promise<HostedJob | null> {
    checkedId(id, 'job id')
    return (await this.readJob(id, await this.token())).value
  }

  async acquireLease(id: string, lease: { generation: number; holder: string; ttlMs: number }, now = new Date()): Promise<LeaseResult> {
    checkedId(id, 'job id')
    return this.retry(async (token) => {
      const read = await this.readJob(id, token)
      if (read.value === null) return { ok: false, reason: 'missing' }
      const result = transitions.lease(read.value, lease, now)
      if (!result.ok) return result
      return await this.commit(token, [this.jobWrite(result.job, { updateTime: read.updateTime! })]) ? result : undefined
    })
  }

  async updateHeld(id: string, holder: string, patch: (job: HostedJob) => HostedJob): Promise<CommitResult> {
    checkedId(id, 'job id')
    return this.retry(async (token) => {
      const read = await this.readJob(id, token)
      if (read.value === null) return { ok: false, reason: 'missing' }
      if (read.value.lease?.holder !== holder) return { ok: false, reason: 'lost' }
      const job = { ...patch(read.value), status: read.value.status, lease: read.value.lease, generation: read.value.generation }
      return await this.commit(token, [this.jobWrite(job, { updateTime: read.updateTime! })]) ? { ok: true, job, promoted: null } : undefined
    })
  }

  async commitSlice(id: string, holder: string, patch: (job: HostedJob) => HostedJob, now = new Date()): Promise<CommitResult> {
    checkedId(id, 'job id')
    return this.retry(async (token) => {
      const read = await this.readJob(id, token)
      if (read.value === null) return { ok: false, reason: 'missing' }
      if (read.value.lease?.holder !== holder) return { ok: false, reason: 'lost' }
      const { job, finishing } = applySlice(read.value, patch, now)
      if (!finishing) return await this.commit(token, [this.jobWrite(job, { updateTime: read.updateTime! })]) ? { ok: true, job, promoted: null } : undefined
      return this.leaveWith(token, job, read.updateTime!)
    })
  }

  async cancel(id: string, workspaceId: string, now = new Date()): Promise<CancelResult> {
    checkedId(id, 'job id')
    return this.retry(async (token) => {
      const read = await this.readJob(id, token)
      if (read.value === null || read.value.workspaceId !== workspaceId) return { ok: false, reason: 'missing' }
      if (FINISHED.has(read.value.status)) return { ok: true, job: read.value, promoted: null }
      return this.leaveWith(token, { ...transitions.finish(read.value, 'cancelled', now), lease: read.value.lease }, read.updateTime!)
    })
  }

  async fail(id: string, reason: string, now = new Date()): Promise<CancelResult> {
    checkedId(id, 'job id')
    return this.retry(async (token) => {
      const read = await this.readJob(id, token)
      if (read.value === null) return { ok: false, reason: 'missing' }
      if (FINISHED.has(read.value.status)) return { ok: true, job: read.value, promoted: null }
      return this.leaveWith(token, { ...transitions.finish(read.value, 'failed', now), failureReason: reason, lease: read.value.lease }, read.updateTime!)
    })
  }

  async expire(id: string): Promise<ExpireResult> {
    checkedId(id, 'job id')
    return this.retry(async (token) => {
      const read = await this.readJob(id, token)
      if (read.value === null) return { ok: false, reason: 'missing' }
      if (!FINISHED.has(read.value.status)) return { ok: false, reason: 'not_finished' }
      const job: HostedJob = { ...read.value, status: 'expired' }
      return await this.commit(token, [this.jobWrite(job, { updateTime: read.updateTime! })]) ? { ok: true, job } : undefined
    })
  }

  /** Writes a finishing job with its workspace's slots released, in one commit; undefined asks for a retry. */
  private async leaveWith(token: string, job: HostedJob, jobUpdateTime: string): Promise<{ ok: true; job: HostedJob; promoted: string | null } | undefined> {
    const slots = await this.readSlots(job.workspaceId, token)
    const queued = slots.value?.queued ?? []
    const queuedReads = await Promise.all(queued.map((id) => this.readJob(id, token)))
    const gone = new Set(queued.filter((_, index) => queuedReads[index]!.value === null))
    const { slots: left, promoted } = transitions.release(slots.value ?? { running: [], queued: [] }, job.id, (other) => !gone.has(other))
    job = { ...job, promoted }
    const writes = [this.jobWrite(job, { updateTime: jobUpdateTime }), this.slotsWrite(job.workspaceId, left, slots.updateTime)]
    let promotedUpdate: Read<HostedJob> | null = null
    if (promoted !== null) {
      promotedUpdate = await this.readJob(promoted, token)
      if (promotedUpdate.value !== null) writes.push(this.jobWrite({ ...promotedUpdate.value, status: 'running' }, { updateTime: promotedUpdate.updateTime! }))
    }
    return await this.commit(token, writes) ? { ok: true, job, promoted } : undefined
  }

  private name(collection: string, id: string): string { return `${this.resource}/${collection}/${id}` }
  private jobWrite(job: HostedJob, currentDocument: Write['currentDocument']): Write {
    return { update: { name: this.name('hostedJobs', job.id), fields: {
      workspaceId: { stringValue: job.workspaceId }, uid: { stringValue: job.uid }, status: { stringValue: job.status },
      deleteAt: { timestampValue: job.deleteAt }, job: { stringValue: JSON.stringify(job) },
    } }, currentDocument }
  }
  private slotsWrite(workspaceId: string, slots: Slots, updateTime: string | null): Write {
    return { update: { name: this.name('hostedJobWorkspaces', workspaceId), fields: { slots: { stringValue: JSON.stringify(slots) } } }, currentDocument: updateTime === null ? { exists: false } : { updateTime } }
  }
  private async readJob(id: string, token: string): Promise<Read<HostedJob>> {
    return this.read(this.name('hostedJobs', id), token, (fields) => JSON.parse(fields.job?.stringValue ?? 'null') as HostedJob)
  }
  private async readSlots(workspaceId: string, token: string): Promise<Read<Slots>> {
    return this.read(this.name('hostedJobWorkspaces', workspaceId), token, (fields) => JSON.parse(fields.slots?.stringValue ?? 'null') as Slots)
  }
  private async readClaim(id: string, token: string): Promise<Read<{ jobId: string; fingerprint: string; expireAt: string }>> {
    return this.read(this.name('hostedJobIdempotency', id), token, (fields) => ({ jobId: fields.jobId?.stringValue ?? '', fingerprint: fields.fingerprint?.stringValue ?? '', expireAt: fields.expireAt?.timestampValue ?? '' }))
  }
  private async read<T>(name: string, token: string, decode: (fields: Record<string, Value>) => T): Promise<Read<T>> {
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${name}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    if (response.status === 404) return { name, value: null, updateTime: null }
    if (!response.ok) throw new Error(`job store read failed (${response.status})`)
    const doc = await response.json() as FirestoreDoc
    if (doc.name !== name || !doc.updateTime) throw new Error('job store document is malformed')
    return { name, value: decode(doc.fields ?? {}), updateTime: doc.updateTime }
  }
  /** True when the commit applied; false when a precondition failed and the reads must be repeated. */
  private async commit(token: string, writes: Write[]): Promise<boolean> {
    const response = await this.fetcher(`${this.endpoint}:commit`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ writes }),
    })
    if (response.ok) return true
    if (response.status === 404 || response.status === 409 || response.status === 412) return false
    if (response.status === 400) {
      const error = await response.json().catch(() => null) as { error?: { status?: string } } | null
      if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED') return false
    }
    throw new Error(`job store commit failed (${response.status})`)
  }
  private async retry<T>(attempt: (token: string) => Promise<T | undefined>): Promise<T> {
    for (let i = 0; i < 6; i++) {
      const result = await attempt(await this.token())
      if (result !== undefined) return result
    }
    throw new Error('job store contention exceeded retry budget')
  }
}
