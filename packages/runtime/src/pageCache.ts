/**
 * The page cache of one task root (`maxAge`, `minAge`, `storeInCache`,
 * `lockdown`), in `<taskRoot>/page-cache.sqlite` beside the task
 * directories, as the idempotency index is.
 *
 * One row per key: the latest successful result of a page fetched under one
 * set of options, whole (its evidence, trace and formats), so a reuse
 * delivers the original fetch's Evidence Record unchanged. Only a `success`
 * with a recorded `fetchedAt` is stored: a partial, failed or blocked page is
 * never served as if it were the page. A row is replaced by the next stored
 * fetch of the same key and is not otherwise expired; its age is measured
 * from the fetch, not from the write. One API process per task root.
 */

import Database from 'better-sqlite3'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FetchResult, LadderRunAudit, TraceEvent } from '@w2l/contracts'
import { requestFingerprint } from './idempotencyStore.js'
import { configureControlDatabase } from './sqliteSetup.js'

export const PAGE_CACHE_FILENAME = 'page-cache.sqlite'

/** The trace events the cache adds to a result it answers with or looks up for. A stored result carries none of them. */
export const CACHE_TRACE_EVENTS: ReadonlySet<string> = new Set(['cache_hit', 'cache_miss', 'cache_stored'])

/** The age bounds of a lookup, in milliseconds: a stored result fits when `minAgeMs <= age` and, unless `maxAgeMs` is null, `age <= maxAgeMs`. */
export interface PageCacheBounds {
  minAgeMs: number
  maxAgeMs: number | null
}

/** A stored result that fits a lookup, with its fetch time and its age when it was found. */
export interface PageCacheHit {
  result: FetchResult
  fetchedAt: string
  ageMs: number
}

export interface PageCacheOptions {
  /** The clock ages are measured by; `Date.now` by default. */
  now?: () => number
}

interface EntryRow {
  fetched_at_ms: number
  result_json: string
}

export class PageCache {
  private readonly db: Database.Database
  private readonly now: () => number

  /** The cache of `taskRoot`, at `<taskRoot>/page-cache.sqlite`. */
  static open(taskRoot: string, options: PageCacheOptions = {}): PageCache {
    return new PageCache(join(taskRoot, PAGE_CACHE_FILENAME), options)
  }

  constructor(path: string, options: PageCacheOptions = {}) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    configureControlDatabase(this.db)
    this.db.exec('CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, url TEXT NOT NULL, fetched_at_ms INTEGER NOT NULL, stored_at TEXT NOT NULL, result_json TEXT NOT NULL)')
    chmodSync(path, 0o600)
    this.now = options.now ?? (() => Date.now())
  }

  /** The stored result of `key` when its age fits `bounds`; null when there is none or it does not fit. A fetch time ahead of this clock counts as age 0. */
  lookup(key: string, bounds: PageCacheBounds): PageCacheHit | null {
    const row = this.db.prepare('SELECT fetched_at_ms, result_json FROM entries WHERE key = ?').get(key) as EntryRow | undefined
    if (row === undefined) return null
    const ageMs = Math.max(0, this.now() - row.fetched_at_ms)
    if (ageMs < bounds.minAgeMs || (bounds.maxAgeMs !== null && ageMs > bounds.maxAgeMs)) return null
    return { result: JSON.parse(row.result_json) as FetchResult, fetchedAt: new Date(row.fetched_at_ms).toISOString(), ageMs }
  }

  /**
   * Store `result` as the latest of `key`, replacing any earlier one, when it
   * is a `success` with a parseable `evidence.fetchedAt`; the cache's own
   * trace events are left out. True when it was stored.
   */
  store(key: string, result: FetchResult): boolean {
    if (result.status !== 'success') return false
    const fetchedAtMs = Date.parse(result.evidence.fetchedAt ?? '')
    if (!Number.isFinite(fetchedAtMs)) return false
    const stored: FetchResult = { ...result, trace: result.trace.filter((event) => !CACHE_TRACE_EVENTS.has(event.event)) }
    this.db.prepare(`INSERT INTO entries (key, url, fetched_at_ms, stored_at, result_json) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET url = excluded.url, fetched_at_ms = excluded.fetched_at_ms, stored_at = excluded.stored_at, result_json = excluded.result_json`)
      .run(key, result.requestedUrl, fetchedAtMs, new Date(this.now()).toISOString(), JSON.stringify(stored))
    return true
  }

  close(): void {
    this.db.close()
  }
}

/**
 * The key of a page under the options that shape its result: the URL as
 * WHATWG parses it, without its fragment, and every other part given, as
 * canonical JSON (keys sorted, absent fields left out). Two requests share a
 * stored result only when every part agrees.
 */
export function pageCacheKey(url: string, parts: Record<string, unknown>): string {
  let href = url
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    href = parsed.href
  } catch {}
  return requestFingerprint({ v: 1, url: href, ...parts })
}

/** A stored result as the answer to this request: unchanged, with a `cache_hit` event that names its fetch time and age at the end of its trace. */
export function cacheHitResult(hit: PageCacheHit): FetchResult {
  const event: TraceEvent = { at: 0, lane: hit.result.lane, event: 'cache_hit', detail: { cachedAt: hit.fetchedAt, ageMs: hit.ageMs } }
  return { ...hit.result, trace: [...hit.result.trace, event] }
}

/**
 * The answer to a cache-only request (`lockdown`) that found no stored
 * result: `failed` with `cache_miss`, nothing requested. The lane is the
 * first rung's, `http`, as for a page refused before any request.
 */
export function cacheMissResult(url: string, bounds: PageCacheBounds): FetchResult {
  return {
    requestedUrl: url,
    status: 'failed',
    failureReason: 'cache_miss',
    blockReason: null,
    budgetExceeded: null,
    lane: 'http',
    escalations: [],
    markdown: null,
    links: [],
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 0, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, contentTokens: null, browserMs: 0, externalCostUsd: null },
    trace: [{ at: 0, lane: 'http', event: 'cache_miss', detail: { lockdown: true, ...bounds } }],
  }
}

/** The result of a live fetch made after a lookup found nothing, with the `cache_miss` event that says the cache was asked. */
export function withCacheMiss(result: FetchResult, bounds: PageCacheBounds): FetchResult {
  return { ...result, trace: [...result.trace, { at: result.usage.wallMs, lane: result.lane, event: 'cache_miss', detail: { ...bounds } }] }
}

/** The result of a live fetch the cache stored, with the `cache_stored` event that says so. */
export function withCacheStored(result: FetchResult): FetchResult {
  return { ...result, trace: [...result.trace, { at: result.usage.wallMs, lane: result.lane, event: 'cache_stored', detail: {} }] }
}

/** The routing audit of an answer no rung produced: nothing tried, nothing requested, `wallMs` spent. */
export function untriedAudit(wallMs: number): LadderRunAudit {
  const none = { knownSubtotal: 0, unknown: false }
  return {
    channelsTried: [],
    ladderTrace: [],
    summary: { channelsTried: [], attempts: [], wallMs, browserMs: 0, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, contentTokens: 0, externalCostUsd: 0, externalCost: none, contentTokenMeter: none, artifacts: [] },
  }
}
