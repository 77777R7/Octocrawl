/**
 * The index of idempotency keys for one task root. A TaskStore is per task
 * directory (ADR 0003), so the keys that tell a retried submission from a new
 * one live beside the task directories, in `<taskRoot>/idempotency.sqlite`.
 *
 * One row per key: the fingerprint of the request it was first sent with, the
 * task it started or extended and the 202 body it answered. A row lives 24
 * hours, or until its task directory is gone; then the key is free again. One
 * API process per task root, as for the batch contract: the index tells one
 * process's submissions apart and is not a lock between processes.
 */

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { configureControlDatabase } from './sqliteSetup.js'

export const IDEMPOTENCY_FILENAME = 'idempotency.sqlite'
/** How long a key stays bound to the submission it was first sent with. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

/** What a key's earlier use means for a new submission: none (`fresh`), the same request again (`replay`, with the stored answer) or another request (`conflict`). */
export type IdempotencyClaim<T = unknown> =
  | { kind: 'fresh' }
  | { kind: 'replay'; taskId: string; response: T }
  | { kind: 'conflict' }

export interface IdempotencyStoreOptions {
  /** The clock rows are dated and aged by; `Date.now` by default. */
  now?: () => number
  /** Whether the task a row names still exists; by default, whether its directory is under the store's task root. A missing task frees its key. */
  taskExists?: (taskId: string) => boolean
  /** How long a row lives; IDEMPOTENCY_TTL_MS by default. */
  ttlMs?: number
}

interface SubmissionRow {
  fingerprint: string
  task_id: string
  response_json: string
  created_at: string
}

export class IdempotencyStore {
  private readonly db: Database.Database
  private readonly now: () => number
  private readonly taskExists: (taskId: string) => boolean
  private readonly ttlMs: number

  /** The index of `taskRoot`, at `<taskRoot>/idempotency.sqlite`; a row's task exists while `<taskRoot>/<taskId>` does. */
  static open(taskRoot: string, options: IdempotencyStoreOptions = {}): IdempotencyStore {
    return new IdempotencyStore(join(taskRoot, IDEMPOTENCY_FILENAME), { taskExists: (taskId) => existsSync(join(taskRoot, taskId)), ...options })
  }

  constructor(path: string, options: IdempotencyStoreOptions = {}) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    configureControlDatabase(this.db)
    this.db.exec('CREATE TABLE IF NOT EXISTS submissions (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, task_id TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL)')
    chmodSync(path, 0o600)
    this.now = options.now ?? (() => Date.now())
    this.taskExists = options.taskExists ?? (() => true)
    this.ttlMs = options.ttlMs ?? IDEMPOTENCY_TTL_MS
  }

  /**
   * What `key` means for a request with `fingerprint`, decided inside one
   * immediate transaction: a key never seen, expired or whose task is gone is
   * `fresh` (the stale row is removed); the same fingerprint is a `replay` of
   * the stored answer; another fingerprint is a `conflict`.
   */
  claim<T = unknown>(key: string, fingerprint: string): IdempotencyClaim<T> {
    return this.db.transaction((): IdempotencyClaim<T> => {
      const row = this.db.prepare('SELECT fingerprint, task_id, response_json, created_at FROM submissions WHERE key = ?').get(key) as SubmissionRow | undefined
      if (row === undefined) return { kind: 'fresh' }
      const expired = Date.parse(row.created_at) + this.ttlMs <= this.now()
      if (expired || !this.taskExists(row.task_id)) {
        this.db.prepare('DELETE FROM submissions WHERE key = ?').run(key)
        return { kind: 'fresh' }
      }
      if (row.fingerprint !== fingerprint) return { kind: 'conflict' }
      return { kind: 'replay', taskId: row.task_id, response: JSON.parse(row.response_json) as T }
    }).immediate()
  }

  /** Bind `key` to the submission that went through: its fingerprint, the task it started or extended and the body it answered, dated now. */
  record(key: string, fingerprint: string, taskId: string, response: unknown): void {
    this.db.prepare(`INSERT INTO submissions (key, fingerprint, task_id, response_json, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET fingerprint = excluded.fingerprint, task_id = excluded.task_id, response_json = excluded.response_json, created_at = excluded.created_at`)
      .run(key, fingerprint, taskId, JSON.stringify(response), new Date(this.now()).toISOString())
  }

  /** Free `key` again: the submission it was recorded for did not go through after all. */
  forget(key: string): void {
    this.db.prepare('DELETE FROM submissions WHERE key = ?').run(key)
  }

  close(): void {
    this.db.close()
  }
}

/**
 * The fingerprint of a parsed request: the sha256 of its JSON with object
 * keys sorted at every level, arrays (the URLs) in their order and absent
 * fields left out, so two requests that ask for the same job hash alike
 * however their fields were spelled out.
 */
export function requestFingerprint(request: unknown): string {
  return createHash('sha256').update(canonicalJson(request)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return `{${Object.keys(rec).filter((key) => rec[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(rec[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
