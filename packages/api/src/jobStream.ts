/**
 * A job's stream: the frames `GET /v1/crawl/:id/events`, `/v1/batches/:id/events`
 * and their `/ws` routes send (see JobStreamFrame). One subscriber is one
 * async generator: the report as `catchup`, the persisted steps after the
 * cursor as `document` frames (replayed from the checkpoint, one page at a
 * time), then the live steps from the JobEventHub, a `snapshot` after each
 * (the report read once per page event and shared by every subscriber of
 * the job), and `done` with the terminal report. A document is a view of
 * the step as the items routes list it; nothing is recorded about watchers.
 */

import { decodeStepCursor, encodeStepCursor } from '@w2l/runtime'
import { RequestError, type CrawlPage, type JobStreamFrame, type JobStreamReport } from '@w2l/contracts'
import type { ApiEngine } from './engine.js'
import type { JobEvent, JobKind } from './jobEvents.js'

/** Steps read per checkpoint page while a stream catches up. */
export const JOB_STREAM_REPLAY_LIMIT = 200
/** Live events a slow subscriber may leave unread before its stream ends with an error. */
export const JOB_STREAM_QUEUE_LIMIT = 10_000

export interface JobStreamOptions {
  /** The step cursor to resume after (`after=`, `Last-Event-ID`): documents up to and including it are not sent again. */
  after?: string
  /** Ends the stream when it aborts (the client went away). */
  signal?: AbortSignal
}

/** The cursor of a page: the (createdAt, id) position the listing routes take, the `id:` of its SSE event and the `cursor` of its frame. */
export function pageCursor(page: Pick<CrawlPage, 'createdAt' | 'id'>): string {
  return encodeStepCursor(page.createdAt, page.id)
}

/** A stream's `after` cursor must be one this API issued; refused before the stream opens. */
export function checkStreamCursor(cursor: string | undefined): void {
  if (cursor === undefined) return
  try { decodeStepCursor(cursor) } catch { throw new RequestError('cursor is not one this API issued') }
}

/** The report as the job's own GET route gives it: a crawl's for the crawl routes, a batch's (null for a crawl id) for the batch routes. */
export function readJobReport(engine: Pick<ApiEngine, 'getCrawl' | 'getBatch'>, kind: JobKind, taskId: string): Promise<JobStreamReport | null> {
  return kind === 'crawl' ? engine.getCrawl(taskId) : engine.getBatch(taskId)
}

/**
 * One report read per job per page event, shared by every subscriber of the
 * job: the first subscriber to need the report after a step reads it, the
 * others await the same read.
 */
const sharedReads = new Map<string, { stepId: string; report: Promise<JobStreamReport | null> }>()

function sharedReport(engine: Pick<ApiEngine, 'getCrawl' | 'getBatch'>, kind: JobKind, taskId: string, stepId: string): Promise<JobStreamReport | null> {
  const key = `${kind}:${taskId}`
  const existing = sharedReads.get(key)
  if (existing !== undefined && existing.stepId === stepId) return existing.report
  const report = readJobReport(engine, kind, taskId).catch(() => null)
  sharedReads.set(key, { stepId, report })
  return report
}

const TERMINAL: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled'])

/**
 * The frames of one subscriber, in order. Subscribes to the hub before
 * reading anything, so a step or the terminal recorded while the checkpoint
 * is replayed is queued and not lost; a step both replayed and queued is
 * sent once. The hub listener is synchronous (it only queues), so a slow
 * client never holds the crawl's worker. Ends after `done`, after an
 * `error`, or when the signal aborts.
 */
export async function* jobStream(engine: Pick<ApiEngine, 'getCrawl' | 'getBatch' | 'listJobPages' | 'jobEvents'>, kind: JobKind, taskId: string, options: JobStreamOptions = {}): AsyncGenerator<JobStreamFrame, void, undefined> {
  const { after, signal } = options
  const queue: JobEvent[] = []
  let overflow = false
  let wake: (() => void) | null = null
  const notify = (): void => { const resume = wake; wake = null; resume?.() }
  const unsubscribe = engine.jobEvents.on((event) => {
    if (event.taskId !== taskId || event.type === 'started') return
    if (queue.length >= JOB_STREAM_QUEUE_LIMIT) overflow = true
    else queue.push(event)
    notify()
  })
  signal?.addEventListener('abort', notify, { once: true })
  const seen = new Set<string>()
  let lastSnapshot = ''
  const document = (page: CrawlPage): JobStreamFrame | null => {
    if (seen.has(page.id)) return null
    seen.add(page.id)
    return { type: 'document', data: page, cursor: pageCursor(page) }
  }
  try {
    const report = await readJobReport(engine, kind, taskId)
    if (report === null) {
      yield { type: 'error', error: { code: 'not_found', message: `${kind} ${taskId} not found` } }
      return
    }
    lastSnapshot = JSON.stringify(report)
    yield { type: 'catchup', data: report }
    // Every persisted step after the cursor, one checkpoint page at a time.
    let cursor = after
    for (;;) {
      if (signal?.aborted) return
      const page = await engine.listJobPages(taskId, { ...(cursor === undefined ? {} : { cursor }), limit: JOB_STREAM_REPLAY_LIMIT })
      if (page === null) break
      for (const item of page.items) {
        const frame = document(item)
        if (frame !== null) yield frame
      }
      if (!page.hasMore || page.nextCursor === null) break
      cursor = page.nextCursor
    }
    if (TERMINAL.has(report.status)) {
      sharedReads.delete(`${kind}:${taskId}`)
      yield { type: 'done', data: report }
      return
    }
    // Live: the steps and the terminal the hub hands over, in order.
    for (;;) {
      if (signal?.aborted) return
      if (overflow) {
        yield { type: 'error', error: { code: 'stream_overflow', message: `the stream of ${kind} ${taskId} fell more than ${JOB_STREAM_QUEUE_LIMIT} events behind; reconnect with the last cursor` } }
        return
      }
      const event = queue.shift()
      if (event === undefined) {
        await new Promise<void>((resolve) => { wake = resolve })
        continue
      }
      if (event.type === 'page') {
        const frame = document(event.page)
        if (frame === null) continue
        yield frame
        const snapshot = await sharedReport(engine, kind, taskId, event.page.id)
        if (snapshot === null) continue
        const encoded = JSON.stringify(snapshot)
        if (encoded === lastSnapshot) continue
        lastSnapshot = encoded
        yield { type: 'snapshot', data: snapshot }
      } else if (event.type === 'terminal') {
        sharedReads.delete(`${kind}:${taskId}`)
        yield { type: 'done', data: event.report }
        return
      }
    }
  } finally {
    unsubscribe()
    signal?.removeEventListener('abort', notify)
  }
}

/** A frame as a server-sent event: the event name, its JSON data and, on a document, the cursor as the event id. */
export function sseEvent(frame: JobStreamFrame): { event: string; data: string; id?: string } {
  return {
    event: frame.type,
    data: JSON.stringify(frame.type === 'error' ? frame.error : frame.data),
    ...(frame.type === 'document' ? { id: frame.cursor } : {}),
  }
}
