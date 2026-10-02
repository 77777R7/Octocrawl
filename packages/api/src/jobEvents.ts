/**
 * The in-process backbone for a job's events: what a crawl or batch records
 * as it runs (its pages and its end), fanned out to the consumers that stream
 * or deliver them. The webhook emitter is called by the engine itself, since
 * its deliveries are durable and numbered; streaming consumers subscribe
 * here. One hub per engine; a listener's error is logged, never raised to
 * the job.
 */

import type { BatchStatusResponse, CrawlPage, CrawlReport, Task } from '@w2l/contracts'

export type JobKind = 'crawl' | 'batch'
export type JobTerminalStatus = 'completed' | 'failed' | 'cancelled'

export type JobEvent =
  | { type: 'started'; taskId: string; jobKind: JobKind }
  /** One page recorded, as the items routes list it (no audit, empty trace). */
  | { type: 'page'; taskId: string; jobKind: JobKind; page: CrawlPage }
  /** The task row is terminal; `report` is the status as its GET route reports it then. */
  | { type: 'terminal'; taskId: string; jobKind: JobKind; status: JobTerminalStatus; report: CrawlReport | BatchStatusResponse }

export type JobEventListener = (event: JobEvent) => void | Promise<void>

export function jobKindOf(task: Pick<Task, 'batch'>): JobKind {
  return task.batch === undefined ? 'crawl' : 'batch'
}

export class JobEventHub {
  private readonly listeners = new Set<JobEventListener>()

  /** Subscribes; the returned function unsubscribes. */
  on(listener: JobEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  /** Hands the event to every listener in turn; a listener that throws is logged and the others still hear the event. */
  async emit(event: JobEvent): Promise<void> {
    for (const listener of [...this.listeners]) {
      try {
        await listener(event)
      } catch (error) {
        console.error(JSON.stringify({ component: 'api', event: 'job_event_listener_failed', taskId: event.taskId, type: event.type, error: error instanceof Error ? error.message : String(error) }))
      }
    }
  }
}
