import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { configureControlDatabase } from './sqliteSetup.js'
import { classifyIp, WEBHOOK_EVENTS, webhookHeaderRefusal, type DeliveryAttempt, type DeliveryDestination, type DeliveryDestinationInput, type DeliveryDestinationKind, type DeliveryPage, type DeliveryPageQuery, type DeliveryQuery, type DeliveryState, type WebhookDelivery, type WebhookEvent, type WebhookEventEnvelope, type WebhookPayload, type WebhookPayloadFormat } from '@w2l/contracts'

/** Columns added to delivery_destinations after its first schema, each created when missing. */
const DESTINATION_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['secret_env', 'secret_env TEXT'],
  ['kind', "kind TEXT NOT NULL DEFAULT 'monitor'"],
  ['events_json', 'events_json TEXT'],
  ['headers_json', 'headers_json TEXT'],
  ['metadata_json', 'metadata_json TEXT'],
  ['payload_format', 'payload_format TEXT'],
]

export function createDeliveryTables(db: Database.Database): void {
  db.transaction(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_destinations (
      id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL, url TEXT NOT NULL, max_attempts INTEGER NOT NULL,
      enabled INTEGER NOT NULL, created_at INTEGER NOT NULL, secret_env TEXT,
      kind TEXT NOT NULL DEFAULT 'monitor', events_json TEXT, headers_json TEXT, metadata_json TEXT, payload_format TEXT
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY, destination_id TEXT NOT NULL, monitor_id TEXT NOT NULL, event_id TEXT NOT NULL,
      event_version INTEGER NOT NULL, state TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, lease_until INTEGER,
      fencing_token INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, delivered_at INTEGER,
      last_status INTEGER, last_error TEXT, payload_json TEXT NOT NULL,
      UNIQUE(destination_id,event_id)
    );
    CREATE INDEX IF NOT EXISTS webhook_delivery_due ON webhook_deliveries(state,next_attempt_at);
    CREATE TABLE IF NOT EXISTS delivery_origin_cooldowns (origin TEXT PRIMARY KEY, not_before INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS delivery_attempts (
      id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL, fencing_token INTEGER NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT NOT NULL, status INTEGER,
      error TEXT, retry_after_at INTEGER, UNIQUE(delivery_id,fencing_token)
    );
  `)
  const columns = new Set((db.prepare('PRAGMA table_info(delivery_destinations)').all() as { name: string }[]).map(column => column.name))
  for (const [name, definition] of DESTINATION_COLUMNS) if (!columns.has(name)) db.exec(`ALTER TABLE delivery_destinations ADD COLUMN ${definition}`)
  }).immediate()
}

/**
 * Caller owns the transaction. One delivery for a job destination
 * (`job:<taskId>`), keyed by its event id: a second enqueue of the same event
 * is ignored, so a resume or a restart can offer every persisted step again
 * and no page is sent twice. The payload is stored as given and never changes.
 */
export function enqueueJobDelivery(db: Database.Database, destinationId: string, eventId: string, sequence: number, payload: WebhookPayload, now: number): boolean {
  const destination = db.prepare('SELECT * FROM delivery_destinations WHERE id=?').get(destinationId) as DestinationRow | undefined
  if (!destination || destination.kind !== 'job') throw new Error('job webhook destination not found')
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('invalid job event sequence')
  return db.prepare(`INSERT OR IGNORE INTO webhook_deliveries
    (id,destination_id,monitor_id,event_id,event_version,state,max_attempts,next_attempt_at,created_at,payload_json)
    VALUES (?,?,?,?,?,'pending',?,?,?,?)`)
    .run(crypto.randomUUID(), destination.id, destination.monitor_id, eventId, sequence, destination.max_attempts, Math.max(now, deliveryOriginNotBefore(db, destination.url)), now, JSON.stringify(payload)).changes === 1
}

/** Caller owns the transaction: invoke alongside event and outbox insertion. No network I/O. */
export function enqueueEventDeliveries(db: Database.Database, payload: WebhookEventEnvelope, now: number): number {
  const destinations = db.prepare('SELECT * FROM delivery_destinations WHERE monitor_id=?').all(payload.monitorId) as DestinationRow[]
  let count = 0
  for (const destination of destinations) {
    count += db.prepare(`INSERT OR IGNORE INTO webhook_deliveries
      (id,destination_id,monitor_id,event_id,event_version,state,max_attempts,next_attempt_at,created_at,payload_json)
      VALUES (?,?,?,?,?,'pending',?,?,?,?)`)
      .run(crypto.randomUUID(), destination.id, payload.monitorId, payload.eventId, payload.eventVersion, destination.max_attempts, Math.max(now, deliveryOriginNotBefore(db, destination.url)), now, JSON.stringify(payload)).changes
  }
  if (count > 0 && hasMonitorOutbox(db)) db.prepare("UPDATE monitor_outbox SET state='pending',acknowledged_at=NULL WHERE event_id=?").run(payload.eventId)
  return count
}

function deliveryOriginNotBefore(db: Database.Database, url: string): number {
  return (db.prepare('SELECT not_before FROM delivery_origin_cooldowns WHERE origin=?').get(new URL(url).origin) as { not_before: number } | undefined)?.not_before ?? 0
}

function hasMonitorOutbox(db: Database.Database): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='monitor_outbox'").get())
}

export interface DestinationUrlOptions {
  /** A local service's rule: a plain-http receiver is admitted when its host is loopback (127.0.0.0/8, ::1, localhost); hosted mode never sets it. */
  allowHttpLoopback?: boolean
}

/** Whether a URL's host names the machine itself: a loopback literal, or `localhost` (whose resolved address the transport checks again). */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || classifyIp(host) === 'loopback_address'
}

export function validateDestinationUrl(value: string, options: DestinationUrlOptions = {}): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('webhook destination must be HTTPS without credentials or fragment') }
  if (url.username || url.password || url.hash) throw new Error('webhook destination must be HTTPS without credentials or fragment')
  if (url.protocol === 'https:') return url.href
  if (url.protocol === 'http:' && options.allowHttpLoopback === true) {
    if (isLoopbackHostname(url.hostname)) return url.href
    throw new Error('webhook destination must be HTTPS, or plain http to a loopback receiver')
  }
  throw new Error('webhook destination must be HTTPS without credentials or fragment')
}

interface DestinationRow { id: string; monitor_id: string; url: string; max_attempts: number; enabled: number; created_at: number; secret_env: string | null; kind: DeliveryDestinationKind; events_json: string | null; headers_json: string | null; metadata_json: string | null; payload_format: WebhookPayloadFormat | null }
interface DeliveryRow { id: string; destination_id: string; monitor_id: string; event_id: string; event_version: number; state: DeliveryState; attempt_count: number; max_attempts: number; next_attempt_at: number; lease_until: number | null; fencing_token: number; created_at: number; delivered_at: number | null; last_status: number | null; last_error: string | null; payload_json: string }
interface AttemptRow { id: string; delivery_id: string; fencing_token: number; started_at: number; ended_at: number | null; outcome: DeliveryAttempt['outcome']; status: number | null; error: string | null; retry_after_at: number | null }
/** A claimed delivery with its destination and, for a job destination, the custom header values the worker sends (never part of the public destination). */
export interface DeliveryClaim { delivery: WebhookDelivery; destination: DeliveryDestination; attemptId: string; headers: Readonly<Record<string, string>> }
export interface DeliveryCompletion { state: 'delivered' | 'pending' | 'dead_letter'; status: number | null; error: string | null; nextAttemptAt?: number; retryAfterAt?: number | null }

/** The job-destination options as they are stored: events in request order, header names lower-cased, metadata as given. */
function jobDestinationFields(input: DeliveryDestinationInput): { events: readonly WebhookEvent[] | null; headers: Record<string, string> | null; metadata: Record<string, string> | null; payloadFormat: WebhookPayloadFormat | null } {
  let events: readonly WebhookEvent[] | null = null
  if (input.events !== undefined) {
    if (!Array.isArray(input.events) || input.events.length === 0 || input.events.some(event => !(WEBHOOK_EVENTS as readonly string[]).includes(event)) || new Set(input.events).size !== input.events.length) throw new Error(`events must be a non-empty array of ${WEBHOOK_EVENTS.join(', ')} without duplicates`)
    events = [...input.events]
  }
  let headers: Record<string, string> | null = null
  if (input.headers !== undefined) {
    if (input.headers === null || typeof input.headers !== 'object' || Array.isArray(input.headers) || Object.values(input.headers).some(value => typeof value !== 'string' || /[\r\n]/.test(value))) throw new Error('headers must be an object of string values without line breaks')
    headers = {}
    for (const [name, value] of Object.entries(input.headers)) {
      const lower = name.toLowerCase()
      const refusal = webhookHeaderRefusal(lower)
      if (refusal !== null) throw new Error(refusal)
      headers[lower] = value
    }
  }
  let metadata: Record<string, string> | null = null
  if (input.metadata !== undefined) {
    if (input.metadata === null || typeof input.metadata !== 'object' || Array.isArray(input.metadata) || Object.values(input.metadata).some(value => typeof value !== 'string')) throw new Error('metadata must be an object of string values')
    metadata = { ...input.metadata }
  }
  if (input.payloadFormat !== undefined && input.payloadFormat !== 'w2l' && input.payloadFormat !== 'firecrawl') throw new Error('payloadFormat must be w2l or firecrawl')
  return { events, headers, metadata, payloadFormat: input.payloadFormat ?? null }
}

/** Caller owns the write transaction so subscription creation and historical enqueue can commit together. */
export function registerDeliveryDestination(db: Database.Database, input: DeliveryDestinationInput, now = Date.now(), options: DestinationUrlOptions = {}): DeliveryDestination {
  if (!input || typeof input.id !== 'string' || !input.id.trim() || input.id.length > 200 || typeof input.monitorId !== 'string' || !input.monitorId.trim() || input.monitorId.length > 200) throw new Error('invalid destination or monitor ID')
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new Error('enabled must be boolean')
  if (input.secretEnv !== undefined && !/^W2L_WEBHOOK_SECRET_[A-Z0-9_]+$/.test(input.secretEnv)) throw new Error('secretEnv must name an operator W2L_WEBHOOK_SECRET_* variable')
  const kind: DeliveryDestinationKind = input.kind ?? 'monitor'
  if (kind !== 'monitor' && kind !== 'job') throw new Error('kind must be monitor or job')
  // The job options wait for the Monitor destinations: a Monitor's receiver gets every event, W2L's headers and the Monitor envelope.
  if (kind === 'monitor' && (input.events !== undefined || input.headers !== undefined || input.metadata !== undefined || input.payloadFormat !== undefined)) throw new Error('events, headers, metadata and payloadFormat are job webhook options; a Monitor destination takes none')
  const fields = jobDestinationFields(input)
  // A job destination's receiver was checked by the engine under its mode; a Monitor destination stays HTTPS-only.
  const url = validateDestinationUrl(input.url, kind === 'job' ? options : {})
  const maxAttempts = input.maxAttempts ?? 8
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new Error('maxAttempts must be an integer from 1 to 100')
  const row = db.prepare('SELECT * FROM delivery_destinations WHERE id=?').get(input.id) as DestinationRow | undefined
  if (row) {
    const same = row.monitor_id === input.monitorId && row.url === url && row.max_attempts === maxAttempts && (row.secret_env ?? undefined) === input.secretEnv && row.kind === kind
      && (row.events_json ?? null) === (fields.events === null ? null : JSON.stringify(fields.events)) && (row.headers_json ?? null) === (fields.headers === null ? null : JSON.stringify(fields.headers))
      && (row.metadata_json ?? null) === (fields.metadata === null ? null : JSON.stringify(fields.metadata)) && (row.payload_format ?? null) === fields.payloadFormat
    if (!same) throw new Error('destination identity is immutable; create a new destination ID')
    return destinationFrom(row)
  }
  db.prepare('INSERT INTO delivery_destinations (id,monitor_id,url,max_attempts,enabled,created_at,secret_env,kind,events_json,headers_json,metadata_json,payload_format) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(input.id, input.monitorId, url, maxAttempts, input.enabled === false ? 0 : 1, now, input.secretEnv ?? null, kind, fields.events === null ? null : JSON.stringify(fields.events), fields.headers === null ? null : JSON.stringify(fields.headers), fields.metadata === null ? null : JSON.stringify(fields.metadata), fields.payloadFormat)
  return destinationFrom(db.prepare('SELECT * FROM delivery_destinations WHERE id=?').get(input.id) as DestinationRow)
}

export class DeliveryStore {
  private constructor(private readonly db: Database.Database) { createDeliveryTables(db) }
  static open(path: string): DeliveryStore {
    mkdirSync(dirname(path), { recursive: true })
    const db = new Database(path)
    try {
      chmodSync(path, 0o600)
      configureControlDatabase(db)
      return new DeliveryStore(db)
    } catch (error) { db.close(); throw error }
  }
  close(): void { this.db.close() }
  createDestination(input: DeliveryDestinationInput, now = Date.now(), options: DestinationUrlOptions = {}): DeliveryDestination {
    return this.db.transaction(() => registerDeliveryDestination(this.db, input, now, options)).immediate()
  }
  getDestination(id: string): DeliveryDestination | null {
    const row = this.destinationRow(id)
    return row ? destinationFrom(row) : null
  }
  private destinationRow(id: string): DestinationRow | undefined {
    return this.db.prepare('SELECT * FROM delivery_destinations WHERE id=?').get(id) as DestinationRow | undefined
  }
  /** One job event for a job destination, ignored when that event is already enqueued; true when a row was added. */
  enqueueJob(destinationId: string, eventId: string, sequence: number, payload: WebhookPayload, now = Date.now()): boolean {
    return this.db.transaction(() => enqueueJobDelivery(this.db, destinationId, eventId, sequence, payload, now)).immediate()
  }
  /** The event ids a destination has deliveries for, in whatever state. */
  listEventIds(destinationId: string): string[] {
    return (this.db.prepare('SELECT event_id FROM webhook_deliveries WHERE destination_id=? ORDER BY created_at,id').all(destinationId) as { event_id: string }[]).map(row => row.event_id)
  }
  getDeliveryByEvent(destinationId: string, eventId: string): WebhookDelivery | null {
    const row = this.db.prepare('SELECT * FROM webhook_deliveries WHERE destination_id=? AND event_id=?').get(destinationId, eventId) as DeliveryRow | undefined
    return row ? deliveryFrom(row) : null
  }
  /** How a destination's deliveries stand, by state; every state present, 0 when none. */
  countDeliveries(destinationId: string): Record<DeliveryState, number> {
    const counts: Record<DeliveryState, number> = { pending: 0, delivering: 0, delivered: 0, dead_letter: 0 }
    for (const row of this.db.prepare('SELECT state, COUNT(*) AS count FROM webhook_deliveries WHERE destination_id=? GROUP BY state').all(destinationId) as { state: DeliveryState; count: number }[]) counts[row.state] = row.count
    return counts
  }
  listDestinations(monitorId?: string): DeliveryDestination[] {
    const rows = monitorId === undefined ? this.db.prepare('SELECT * FROM delivery_destinations ORDER BY created_at,id').all() : this.db.prepare('SELECT * FROM delivery_destinations WHERE monitor_id=? ORDER BY created_at,id').all(monitorId)
    return (rows as DestinationRow[]).map(destinationFrom)
  }
  setDestinationEnabled(id: string, enabled: boolean, _now = Date.now()): DeliveryDestination {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean')
    if (!this.db.prepare('UPDATE delivery_destinations SET enabled=? WHERE id=?').run(enabled ? 1 : 0, id).changes) throw new Error('destination not found')
    return this.getDestination(id)!
  }
  /** Use this only when no monitor commit transaction is involved (e.g. explicit replay). */
  enqueue(payload: WebhookEventEnvelope, now = Date.now()): number {
    return this.db.transaction(() => enqueueEventDeliveries(this.db, payload, now)).immediate()
  }
  getDelivery(id: string): WebhookDelivery | null {
    const row = this.db.prepare('SELECT * FROM webhook_deliveries WHERE id=?').get(id) as DeliveryRow | undefined
    return row ? deliveryFrom(row) : null
  }
  listDeliveries(query: DeliveryQuery = {}): WebhookDelivery[] {
    const clauses: string[] = []
    const values: string[] = []
    for (const [column, value] of [['monitor_id', query.monitorId], ['destination_id', query.destinationId], ['state', query.state]]) {
      if (value !== undefined) { clauses.push(`${column}=?`); values.push(value) }
    }
    return (this.db.prepare(`SELECT * FROM webhook_deliveries ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at,id`).all(...values) as DeliveryRow[]).map(deliveryFrom)
  }
  listDeliveriesPage(query: DeliveryPageQuery = {}): DeliveryPage {
    const limit = query.limit ?? 20
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be 1..50')
    let cursor: {createdAt:number;id:string} | null = null
    if (query.cursor) {
      try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as {createdAt:number;id:string} }
      catch { throw new Error('invalid delivery cursor') }
      if (!cursor || !Number.isSafeInteger(cursor.createdAt) || typeof cursor.id !== 'string' || !cursor.id) throw new Error('invalid delivery cursor')
    }
    const clauses: string[] = []
    const values: Array<string | number> = []
    for (const [column, value] of [['monitor_id', query.monitorId], ['destination_id', query.destinationId], ['state', query.state]] as const) {
      if (value !== undefined) { clauses.push(`${column}=?`); values.push(value) }
    }
    if (cursor) { clauses.push('(created_at>? OR (created_at=? AND id>?))'); values.push(cursor.createdAt,cursor.createdAt,cursor.id) }
    const rows = this.db.prepare(`SELECT * FROM webhook_deliveries ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at,id LIMIT ?`).all(...values,limit+1) as DeliveryRow[]
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return { items:page.map(deliveryFrom),hasMore:rows.length>limit,nextCursor:rows.length>limit && last ? Buffer.from(JSON.stringify({createdAt:last.created_at,id:last.id})).toString('base64url') : null }
  }
  attempts(id: string): DeliveryAttempt[] {
    return (this.db.prepare('SELECT * FROM delivery_attempts WHERE delivery_id=? ORDER BY fencing_token').all(id) as AttemptRow[]).map(row => ({ id: row.id, deliveryId: row.delivery_id, fencingToken: row.fencing_token, startedAt: row.started_at, endedAt: row.ended_at, outcome: row.outcome, status: row.status, error: row.error, retryAfterAt: row.retry_after_at }))
  }
  /** Claims/reclaims atomically across processes; a lease is never an exactly-once network guarantee. */
  claim(now: number, leaseMs: number): DeliveryClaim | null {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new Error('invalid delivery lease')
    return this.db.transaction(() => {
      const rows = this.db.prepare(`SELECT d.* FROM webhook_deliveries d JOIN delivery_destinations s ON s.id=d.destination_id
        WHERE s.enabled=1 AND ((d.state='pending' AND d.next_attempt_at<=?) OR (d.state='delivering' AND d.lease_until<=?))
        ORDER BY d.next_attempt_at,d.created_at,d.id`).all(now, now) as DeliveryRow[]
      for (const row of rows) {
        const destinationRow = this.destinationRow(row.destination_id)!
        const destination = destinationFrom(destinationRow)
        if (deliveryOriginNotBefore(this.db, destination.url) > now) continue
        if (row.state === 'delivering') this.db.prepare("UPDATE delivery_attempts SET outcome='lease_expired',ended_at=?,error='worker lease expired; acknowledgement unknown' WHERE delivery_id=? AND fencing_token=? AND outcome='sending'").run(now, row.id, row.fencing_token)
        if (row.attempt_count >= row.max_attempts) {
          this.db.prepare("UPDATE webhook_deliveries SET state='dead_letter',lease_until=NULL,last_error='attempt budget exhausted after lease expiry' WHERE id=?").run(row.id)
          continue
        }
        const token = row.fencing_token + 1
        const attemptId = crypto.randomUUID()
        this.db.prepare("UPDATE webhook_deliveries SET state='delivering',attempt_count=attempt_count+1,fencing_token=?,lease_until=? WHERE id=?").run(token, now + leaseMs, row.id)
        this.db.prepare("INSERT INTO delivery_attempts (id,delivery_id,fencing_token,started_at,outcome) VALUES (?,?,?,?,'sending')").run(attemptId, row.id, token, now)
        return { delivery: this.getDelivery(row.id)!, destination, attemptId, headers: destinationRow.headers_json ? JSON.parse(destinationRow.headers_json) as Record<string, string> : {} }
      }
      return null
    }).immediate()
  }
  complete(id: string, fencingToken: number, result: DeliveryCompletion, now = Date.now()): boolean {
    return this.db.transaction(() => {
      const changed = this.db.prepare(`UPDATE webhook_deliveries SET state=?,lease_until=NULL,next_attempt_at=?,delivered_at=?,last_status=?,last_error=?
        WHERE id=? AND state='delivering' AND fencing_token=? AND lease_until>?`)
        .run(result.state, result.nextAttemptAt ?? now, result.state === 'delivered' ? now : null, result.status, result.error, id, fencingToken, now).changes
      if (!changed) return false
      if (result.retryAfterAt !== undefined && result.retryAfterAt !== null && result.retryAfterAt > now) {
        const delivery = this.getDelivery(id)!
        const origin = new URL(this.getDestination(delivery.destinationId)!.url).origin
        this.db.prepare('INSERT INTO delivery_origin_cooldowns (origin,not_before) VALUES (?,?) ON CONFLICT(origin) DO UPDATE SET not_before=MAX(not_before,excluded.not_before)').run(origin, result.retryAfterAt)
        // Make the effective retry schedule observable on already-queued sibling events.
        for (const destination of this.listDestinations()) {
          if (new URL(destination.url).origin === origin) this.db.prepare("UPDATE webhook_deliveries SET next_attempt_at=MAX(next_attempt_at,?) WHERE destination_id=? AND state='pending'").run(result.retryAfterAt, destination.id)
        }
      }
      this.db.prepare('UPDATE delivery_attempts SET ended_at=?,outcome=?,status=?,error=?,retry_after_at=? WHERE delivery_id=? AND fencing_token=?')
        .run(now, result.state === 'pending' ? 'retry' : result.state, result.status, result.error, result.retryAfterAt ?? null, id, fencingToken)
      if (result.state === 'delivered' && hasMonitorOutbox(this.db)) {
        const eventId = this.getDelivery(id)!.eventId
        if (!this.db.prepare("SELECT 1 FROM webhook_deliveries WHERE event_id=? AND state<>'delivered'").get(eventId)) this.db.prepare("UPDATE monitor_outbox SET state='acknowledged',acknowledged_at=? WHERE event_id=?").run(now, eventId)
      }
      return true
    }).immediate()
  }
  /** An explicit operator replay adds one fresh attempt budget but preserves identity/payload/history. */
  replayDeadLetter(id: string, now = Date.now()): WebhookDelivery {
    return this.db.transaction(() => {
      const delivery = this.getDelivery(id)
      if (!delivery || delivery.state !== 'dead_letter') throw new Error('delivery not found or not dead-lettered')
      const notBefore = deliveryOriginNotBefore(this.db, this.getDestination(delivery.destinationId)!.url)
      this.db.prepare("UPDATE webhook_deliveries SET state='pending',next_attempt_at=MAX(next_attempt_at,?),lease_until=NULL,max_attempts=attempt_count+1 WHERE id=? AND state='dead_letter'").run(Math.max(now, notBefore), id)
      return this.getDelivery(id)!
    }).immediate()
  }
}
/** The public destination: header names without their values, which only a claim carries. */
function destinationFrom(row: DestinationRow): DeliveryDestination {
  const kind: DeliveryDestinationKind = row.kind ?? 'monitor'
  return {
    id: row.id, monitorId: row.monitor_id, url: row.url, maxAttempts: row.max_attempts, enabled: row.enabled === 1, createdAt: row.created_at,
    ...(row.secret_env ? { secretEnv: row.secret_env } : {}),
    kind,
    ...(kind === 'job' && row.monitor_id.startsWith('job:') ? { jobId: row.monitor_id.slice('job:'.length) } : {}),
    ...(row.events_json ? { events: JSON.parse(row.events_json) as WebhookEvent[] } : {}),
    headerNames: row.headers_json ? Object.keys(JSON.parse(row.headers_json) as Record<string, string>) : [],
    ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) as Record<string, string> } : {}),
    ...(row.payload_format ? { payloadFormat: row.payload_format } : {}),
  }
}
function deliveryFrom(row: DeliveryRow): WebhookDelivery {
  return { id: row.id, destinationId: row.destination_id, monitorId: row.monitor_id, eventId: row.event_id, eventVersion: row.event_version, state: row.state, attemptCount: row.attempt_count, maxAttempts: row.max_attempts, nextAttemptAt: row.next_attempt_at, leaseUntil: row.lease_until, fencingToken: row.fencing_token, createdAt: row.created_at, deliveredAt: row.delivered_at, lastStatus: row.last_status, lastError: row.last_error, payload: JSON.parse(row.payload_json) as WebhookPayload }
}
