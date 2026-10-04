/**
 * Persistence seam for crawl checkpoint (ADR 0003).
 *
 * Callers see Task / Attempt / StepRecord only. No SQL, no isolation
 * levels, no lastInsertRowid. Primary keys are caller-generated UUIDs.
 * A repeated put of the same id does not create a second row.
 */

import type { Attempt, StepRecord, StepStatus, Task } from '@w2l/contracts'

export type StepPageKind = 'pages' | 'errors' | 'all'
export interface StepPageQuery {
  attemptId?: string
  cursor?: string
  limit: number
  kind: StepPageKind
  /** For kind `pages`: list the steps whose status is `duplicate` too; left out by default. */
  includeDuplicates?: boolean
}
export interface StepPage {
  steps: readonly StepRecord[]
  nextCursor: string | null
  hasMore: boolean
}

export interface TaskStore {
  putTask(task: Task): Promise<void>
  getTask(taskId: string): Promise<Task | null>
  listTasks(): Promise<readonly Task[]>
  putAttempt(attempt: Attempt): Promise<void>
  getAttempt(attemptId: string): Promise<Attempt | null>
  listAttempts(taskId: string): Promise<readonly Attempt[]>
  putStep(step: StepRecord): Promise<void>
  getStep(stepId: string): Promise<StepRecord | null>
  listSteps(taskId: string, attemptId?: string): Promise<readonly StepRecord[]>
  /** Count terminal URL checkpoints without reading their result bodies. */
  countCompletedSteps(taskId: string): Promise<number>
  /** The ids of a task's steps whose result's trace has an event of this name, without reading their bodies. */
  listStepIdsWithTraceEvent(taskId: string, event: string): Promise<string[]>
  /** How many of an attempt's steps (every attempt's without attemptId) have each status, without reading their bodies. */
  countSteps(taskId: string, attemptId?: string): Promise<Partial<Record<StepStatus, number>>>
  /** How many of a task's `blocked` steps have each block reason, every attempt counted, without reading their bodies' text. */
  countBlockReasons(taskId: string): Promise<Record<string, number>>
  listStepsPage(taskId: string, query: StepPageQuery): Promise<StepPage>
  /**
   * Latest step for this canonical URL on the task (any attempt).
   * Resume uses this to decide refetch vs `--use-cached`.
   */
  getStepByCanonicalUrl(taskId: string, canonicalUrl: string): Promise<StepRecord | null>
  close(): Promise<void>
}

export function assertId(label: string, value: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must be a non-empty caller-generated id`)
  }
}

export function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

export function encodeStepCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url')
}

/** A step cursor that does not parse: one this API did not issue (a client's error, never the store's). */
export class InvalidCursorError extends Error {
  constructor() {
    super('invalid crawl cursor')
    this.name = 'InvalidCursorError'
  }
}

export function decodeStepCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown }
    if (typeof value.createdAt !== 'string' || typeof value.id !== 'string' || value.id.length === 0) throw new Error()
    return { createdAt: value.createdAt, id: value.id }
  } catch {
    throw new InvalidCursorError()
  }
}
