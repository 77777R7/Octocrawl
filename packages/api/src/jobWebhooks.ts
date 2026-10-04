/**
 * Job webhooks: a crawl's or batch's events as durable, retried deliveries
 * to the receiver its request named (`webhook`). The destination is
 * `job:<taskId>` in the control database; each event is one delivery keyed
 * by a deterministic event id, so offering a persisted step again (a resume,
 * a restart) never sends a page twice. Nothing here fetches a page or
 * touches its record: a delivery is bookkeeping about the job.
 */

import {
  evaluateHostname,
  hostedNetworkPolicy,
  readWebhook,
  RequestError,
  WEBHOOK_EVENTS,
  wrapJobWebhook,
  type BatchStatusResponse,
  type CrawlPage,
  type CrawlReport,
  type FetchResult,
  type JobWebhookEnvelope,
  type JobWebhookStatus,
  type StepRecord,
  type StoredJobWebhook,
  type Task,
  type WebhookConfig,
  type WebhookEvent,
  type WebhookPayload,
  type WebhookPayloadFormat,
} from '@w2l/contracts'
import { isLoopbackHostname, type DeliveryStore, type TaskStore } from '@w2l/runtime'
import { jobKindOf, type JobTerminalStatus } from './jobEvents.js'

export interface JobWebhookOptions {
  /** A hosted engine takes public https receivers only and refuses the rest at request time. */
  hosted: boolean
  /** A local engine's rule: plain http is admitted for a loopback receiver (127.0.0.0/8, ::1, localhost). */
  allowHttpLoopback: boolean
}

export const WEBHOOK_HTTPS_REQUIRED = 'webhook.url must be https (http is accepted only for a loopback receiver of a local service)'
export const WEBHOOK_PUBLIC_REQUIRED = 'webhook.url must be a public address'

const TERMINAL: ReadonlySet<string> = new Set<JobTerminalStatus>(['completed', 'failed', 'cancelled'])

/** The webhook a task stores, whichever kind it is. */
export function webhookOf(task: Task): StoredJobWebhook | undefined {
  return (task.batch ?? task.crawl)?.webhook
}

export function jobDestinationId(taskId: string): string {
  return `job:${taskId}`
}

/** `<taskId>:completed`, `<taskId>:failed:<attemptId>` and the like. */
function isTerminalEventId(taskId: string, eventId: string): boolean {
  if (!eventId.startsWith(`${taskId}:`)) return false
  return TERMINAL.has(eventId.slice(taskId.length + 1).split(':')[0] ?? '')
}

/** The receiver as a status shows it: origin and path, never its query. */
function displayUrl(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}

/** The page, terminal and handoff counts a job's event numbering runs on (see JobWebhookEnvelope.sequence). */
interface Counters {
  pages: number
  terminals: number
  /** Items a handoff replaced, each one `page` event of its own (see JobWebhooks.replaced). */
  handoffs: number
  /** The highest number an event of the job was enqueued under, -1 for none: no later event takes it or one below it. */
  last: number
}

/** `<taskId>:handoff:<stepId>`: the page a handoff put in place of an item's stopped result. */
const isHandoffEventId = (taskId: string, eventId: string): boolean => eventId.startsWith(`${taskId}:handoff:`)

/**
 * The number the next event of a job takes: one more than every event numbered before it, and above every number already
 * enqueued (an event offered again after a restart, its first enqueue lost, comes after the ones that were not).
 */
function nextSequence(counters: Counters): number {
  counters.last = Math.max(counters.pages + counters.terminals + counters.handoffs, counters.last + 1)
  return counters.last
}

/** The highest of a job's event numbers, -1 for none (a job may have more deliveries than a spread call takes arguments). */
const highest = (numbers: Iterable<number>): number => { let top = -1; for (const n of numbers) if (n > top) top = n; return top }

/** An item whose stopped result a handoff replaced: its result's trace starts from the result it replaced. */
const replacedByHandoff = (step: StepRecord): boolean => step.result?.trace.some((event) => event.event === 'handoff_from') === true

export class JobWebhooks {
  private readonly counters = new Map<string, Counters>()
  private readonly terminalsSeen = new Set<string>()

  constructor(private readonly store: DeliveryStore, private readonly options: JobWebhookOptions) {}

  /**
   * A request's `webhook` under this engine's mode: the parsed configuration,
   * or undefined for none. Beyond the shape (readWebhook), a hosted engine
   * takes https to a public address only; a local one also takes plain http
   * to a loopback receiver, and nothing else over http.
   */
  check(value: unknown): WebhookConfig | undefined {
    const config = readWebhook(value)
    if (config === undefined) return undefined
    const url = new URL(config.url)
    if (url.protocol === 'http:' && (this.options.hosted || !this.options.allowHttpLoopback || !isLoopbackHostname(url.hostname))) throw new RequestError(WEBHOOK_HTTPS_REQUIRED)
    if (this.options.hosted) {
      const decision = evaluateHostname(url.hostname, hostedNetworkPolicy())
      if (decision !== null && !decision.allowed) throw new RequestError(WEBHOOK_PUBLIC_REQUIRED)
    }
    return config
  }

  /**
   * Registers the job's destination (`job:<taskId>`, kind `job`) with its
   * events, headers, metadata, secret reference and payload shape, and
   * returns what the task stores: everything but the header values.
   */
  register(taskId: string, config: WebhookConfig, payloadFormat?: WebhookPayloadFormat): StoredJobWebhook {
    const destinationId = jobDestinationId(taskId)
    const events: readonly WebhookEvent[] = config.events ?? [...WEBHOOK_EVENTS]
    this.store.createDestination({
      id: destinationId,
      monitorId: destinationId,
      url: config.url,
      kind: 'job',
      events,
      ...(config.headers === undefined ? {} : { headers: config.headers }),
      ...(config.metadata === undefined ? {} : { metadata: config.metadata }),
      ...(config.secretEnv === undefined ? {} : { secretEnv: config.secretEnv }),
      ...(payloadFormat === undefined ? {} : { payloadFormat }),
    }, Date.now(), { allowHttpLoopback: this.options.allowHttpLoopback && !this.options.hosted })
    this.counters.set(taskId, { pages: 0, terminals: 0, handoffs: 0, last: -1 })
    return {
      url: config.url,
      events,
      metadata: config.metadata ?? {},
      ...(config.secretEnv === undefined ? {} : { secretEnv: config.secretEnv }),
      destinationId,
      ...(payloadFormat === undefined || payloadFormat === 'w2l' ? {} : { payloadFormat }),
    }
  }

  /** The `started` event, sequence 0; nothing when the job's events leave it out. */
  started(task: Task): void {
    const stored = webhookOf(task)
    if (stored === undefined || !stored.events.includes('started')) return
    this.enqueue(task, stored, 'started', `${task.id}:started`, 0, {})
  }

  /**
   * One persisted step: the next sequence number is taken whatever the
   * outcome, and the `page` event is enqueued when the job's events include
   * it. `page` is the step as the items routes list it.
   */
  async page(task: Task, step: StepRecord, page: CrawlPage, taskStore: TaskStore): Promise<void> {
    const stored = webhookOf(task)
    if (stored === undefined) return
    const counters = await this.countersFor(task, stored, taskStore, true)
    counters.pages++
    if (!stored.events.includes('page')) return
    this.enqueue(task, stored, 'page', `${task.id}:page:${step.id}`, nextSequence(counters), { page }, step.result)
  }

  /**
   * An item whose stopped result a handoff replaced with the page the person
   * got through to: a `page` event of its own, `<taskId>:handoff:<stepId>`,
   * numbered after every event before it (the terminal one included), when
   * the job's events include `page`. Its `page` is the item as it now stands.
   */
  async replaced(task: Task, step: StepRecord, page: CrawlPage, taskStore: TaskStore): Promise<void> {
    const stored = webhookOf(task)
    if (stored === undefined || !stored.events.includes('page')) return
    const eventId = `${task.id}:handoff:${step.id}`
    if (this.store.getDeliveryByEvent(stored.destinationId, eventId) !== null) return
    const counters = await this.countersFor(task, stored, taskStore, false)
    counters.handoffs++
    this.enqueue(task, stored, 'page', eventId, nextSequence(counters), { page }, step.result)
  }

  /**
   * The terminal event of the attempt `report` describes, once its task row
   * is terminal: `<taskId>:<status>` for the task's first attempt, with the
   * attempt id appended for a later one (a resume, a batch run again by an
   * append), so a job that finishes twice has two distinct events and an
   * attempt offered twice has one.
   */
  async terminal(task: Task, report: CrawlReport | BatchStatusResponse, taskStore: TaskStore, error?: string): Promise<void> {
    const stored = webhookOf(task)
    if (stored === undefined || !TERMINAL.has(report.status)) return
    const status = report.status as JobTerminalStatus
    const attempts = await taskStore.listAttempts(task.id)
    const first = attempts.length === 0 || attempts[0]!.id === report.attemptId || report.attemptId.length === 0
    const eventId = first ? `${task.id}:${status}` : `${task.id}:${status}:${report.attemptId}`
    if (this.terminalsSeen.has(eventId) || this.store.getDeliveryByEvent(stored.destinationId, eventId) !== null) return
    this.terminalsSeen.add(eventId)
    // Numbered only when sent: after a restart the numbering is rebuilt from the deliveries stored, and a terminal event the
    // job's events leave out has none, so counting it here would number the next event twice.
    if (!stored.events.includes(status)) return
    const counters = await this.countersFor(task, stored, taskStore, false)
    counters.terminals++
    this.enqueue(task, stored, status, eventId, nextSequence(counters), { report, ...(error === undefined ? {} : { error }) })
  }

  /**
   * Before a run starts, and for a finished job at startup: seed the
   * numbering from what is persisted, and offer `started` and every step
   * without a delivery again. Already-enqueued events are ignored by their
   * ids, so a resume or a restart sends nothing twice; steps are read only
   * when their count and the page deliveries' differ, and a batch item a
   * handoff replaced only when its event is missing (found by id first).
   */
  async reconcile(task: Task, taskStore: TaskStore, pageOf: (step: StepRecord) => CrawlPage): Promise<void> {
    const stored = webhookOf(task)
    if (stored === undefined) return
    if (this.store.getDestination(stored.destinationId) === null) {
      console.error(JSON.stringify({ component: 'api', event: 'job_webhook_destination_missing', taskId: task.id, destinationId: stored.destinationId }))
      return
    }
    const existing = new Set(this.store.listEventIds(stored.destinationId))
    const total = Object.values(await taskStore.countSteps(task.id)).reduce((sum, count) => sum + (count ?? 0), 0)
    const terminals = [...existing].filter((eventId) => isTerminalEventId(task.id, eventId)).length
    const handoffs = [...existing].filter((eventId) => isHandoffEventId(task.id, eventId)).length
    const taken = new Set(this.store.listEventVersions(stored.destinationId))
    const counters: Counters = { pages: total, terminals, handoffs, last: highest(taken) }
    this.counters.set(task.id, counters)
    if (stored.events.includes('started') && !existing.has(`${task.id}:started`)) {
      this.enqueue(task, stored, 'started', `${task.id}:started`, 0, {})
      counters.last = Math.max(counters.last, 0)
    }
    if (!stored.events.includes('page')) return
    const pageDeliveries = [...existing].filter((eventId) => eventId.startsWith(`${task.id}:page:`)).length
    // A batch's items a handoff replaced may lack their event too (the process stopped between the write and the enqueue):
    // found by their ids alone, so a job with every event enqueued reads no step.
    const unsentHandoffs = task.batch === undefined ? [] : (await taskStore.listStepIdsWithTraceEvent(task.id, 'handoff_from')).filter((id) => !existing.has(`${task.id}:handoff:${id}`))
    if (pageDeliveries < total) {
      const steps = await taskStore.listSteps(task.id)
      steps.forEach((step, index) => {
        const eventId = `${task.id}:page:${step.id}`
        if (existing.has(eventId)) return
        // In step order, numbered as when it was first offered; that number taken by another event, after every number taken.
        const first = index + 1 + terminals + handoffs
        const sequence = taken.has(first) ? counters.last + 1 : first
        taken.add(sequence)
        counters.last = Math.max(counters.last, sequence)
        this.enqueue(task, stored, 'page', eventId, sequence, { page: pageOf(step) }, step.result)
      })
    }
    for (const id of unsentHandoffs) {
      const step = await taskStore.getStep(id)
      if (step === null || !replacedByHandoff(step)) continue
      counters.handoffs++
      this.enqueue(task, stored, 'page', `${task.id}:handoff:${id}`, nextSequence(counters), { page: pageOf(step) }, step.result)
    }
  }

  /** The webhook block of a job's status: the destination, the receiver (no query), the events taken and the delivery counts. */
  status(task: Task): JobWebhookStatus | undefined {
    const stored = webhookOf(task)
    if (stored === undefined) return undefined
    const counts = this.store.countDeliveries(stored.destinationId)
    return { destinationId: stored.destinationId, url: displayUrl(stored.url), events: stored.events, pending: counts.pending + counts.delivering, delivered: counts.delivered, deadLetter: counts.dead_letter }
  }

  /** The job's counters, seeded from the store when no launch seeded them (`excludeCurrent`: the step being numbered is persisted already). */
  private async countersFor(task: Task, stored: StoredJobWebhook, taskStore: TaskStore, excludeCurrent: boolean): Promise<Counters> {
    const existing = this.counters.get(task.id)
    if (existing !== undefined) return existing
    const total = Object.values(await taskStore.countSteps(task.id)).reduce((sum, count) => sum + (count ?? 0), 0)
    const eventIds = this.store.listEventIds(stored.destinationId)
    const terminals = eventIds.filter((eventId) => isTerminalEventId(task.id, eventId)).length
    const handoffs = eventIds.filter((eventId) => isHandoffEventId(task.id, eventId)).length
    const counters: Counters = { pages: Math.max(0, total - (excludeCurrent ? 1 : 0)), terminals, handoffs, last: highest(this.store.listEventVersions(stored.destinationId)) }
    this.counters.set(task.id, counters)
    return counters
  }

  private enqueue(task: Task, stored: StoredJobWebhook, event: WebhookEvent, eventId: string, sequence: number, extra: Partial<Pick<JobWebhookEnvelope, 'page' | 'report' | 'error'>>, result: FetchResult | null = null): boolean {
    const envelope: JobWebhookEnvelope = { schemaVersion: 'w2l.job-event/v1', eventId, sequence, jobId: task.id, jobKind: jobKindOf(task), event, at: new Date().toISOString(), metadata: stored.metadata, ...extra }
    const payload: WebhookPayload = stored.payloadFormat === 'firecrawl' ? wrapJobWebhook(envelope, result) : envelope
    return this.store.enqueueJob(stored.destinationId, eventId, sequence, payload)
  }
}
