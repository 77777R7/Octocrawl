/**
 * Credits for accounts' keys on hosted Octocrawl (ROADMAP PH, decided 2026-10-11).
 *
 * Every account gets a monthly grant (1,000 credits by default, reset on the 1st, UTC, nothing rolled over), spent
 * before credits it bought. A call reserves the most it could cost before it runs and settles at what its result
 * cost, so two instances can never spend more than the balance, and a call that read nothing costs nothing:
 *
 *   a page read over HTTP          1    (success, partial or empty_verified on the http lane)
 *   a page read in a browser       5    (the same statuses on a browser lane)
 *   a page that does not exist     1    (failed, http_error with HTTP 404 or 410)
 *   a map call that returned URLs  1
 *   anything else                  0    (blocked by a check, a challenge or robots.txt; DNS, timeout, no response;
 *                                        an invalid request; a server error)
 *
 * Keyless callers and keys issued by hand keep their daily allowances (hostedApi.ts); only keys that name an
 * account (`uid`) spend credits. Usage is added up per account and UTC day, for the dashboard.
 *
 * Each call by an account's key also leaves one line in `requestLog/{uid}/requests/{id}`, written in the settle's
 * commit: the URL asked for, what came back (status, HTTP status, lane, robots.txt decision, the body's SHA-256 from the
 * Evidence Record) and what it cost. Never the page's content. Lines expire after 30 days (TTL on `expireAt`), and only
 * the account sees them, on the dashboard's Activity page (decided by Howard on 2026-10-12).
 */
import type { QuotaEntry } from './hostedApi.js'

export const DEFAULT_MONTHLY_CREDITS = 1_000
export const CREDITS = { httpPage: 1, browserPage: 5, notFound: 1, map: 1 } as const
/** Usage records are kept this long, for the account page and questions about a charge. */
export const USAGE_RETENTION_DAYS = 90
/** Request lines are kept this long. */
export const ACTIVITY_RETENTION_DAYS = 30
/** The longest URL a request line keeps; a longer one is cut. */
const ACTIVITY_URL_CHARS = 2_048

/** What the API knows of a call by an account's key when it settles: the request line, before its cost. */
export interface RequestNote {
  endpoint: 'scrape' | 'map'
  /** The key's HMAC: the id the dashboard lists keys by. */
  keyId: string
  url: string
  finalUrl: string | null
  lane: string | null
  /** The result's status (`success`, `blocked`, ...) or the map's; `invalid_request` or `error` when nothing ran. */
  status: string
  httpStatus: number | null
  reason: string | null
  robots: 'allowed' | 'disallowed' | 'no_robots' | null
  /** The Evidence Record's `rawSha256`. */
  sha256: string | null
  /** The URLs a map returned. */
  links: number | null
}
export interface RequestLine extends RequestNote { id: string; at: string; kind: UsageKind; credits: number }

/** A request line's id: newest first in Firestore's default (ascending) order, which needs no index, then a random tail. */
export function requestLineId(now: Date, random = Math.random().toString(36).slice(2, 10)): string {
  return `${String(9_999_999_999_999 - now.getTime()).padStart(13, '0')}-${random.replace(/[^a-z0-9]/g, '').slice(0, 12) || '0'}`
}
/** A half of a surrogate pair with no other half (a caller's body, or a cut at the length limit) becomes U+FFFD:
 * Firestore takes only well-formed text, and a refused line must not refuse the charge it is written with. */
const wellFormed = (text: string) => text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
function requestLine(note: RequestNote, id: string, now: Date, kind: UsageKind, credits: number): RequestLine {
  const clean = (value: string | null, chars = 200) => (value === null ? null : wellFormed(value.slice(0, chars)))
  return {
    ...note, url: wellFormed(note.url.slice(0, ACTIVITY_URL_CHARS)), finalUrl: clean(note.finalUrl, ACTIVITY_URL_CHARS), lane: clean(note.lane), status: wellFormed(note.status.slice(0, 200)),
    reason: clean(note.reason), sha256: clean(note.sha256), id, at: now.toISOString(), kind, credits,
  }
}

/** What a settled call is counted as on the account page. */
export type UsageKind = 'http' | 'browser' | 'not_found' | 'map' | 'unread'

const BROWSER_LANES: ReadonlySet<string> = new Set(['browser_local', 'browser_local_authed', 'browser_proxy', 'provider', 'my_browser'])
const READ_STATUSES: ReadonlySet<string> = new Set(['success', 'partial', 'empty_verified'])

/** The fields of a scrape result the price is read from: the full and the compact response both carry them. */
export interface PricedScrape {
  status?: unknown
  lane?: unknown
  failureReason?: unknown
  evidenceRecord?: { httpStatus?: unknown } | null
  snapshot?: { httpStatus?: unknown } | null
}

/** What a scrape result costs, and what it is counted as. */
export function scrapeCharge(result: PricedScrape): { credits: number; kind: UsageKind } {
  const status = typeof result.status === 'string' ? result.status : ''
  if (READ_STATUSES.has(status)) {
    return typeof result.lane === 'string' && BROWSER_LANES.has(result.lane) ? { credits: CREDITS.browserPage, kind: 'browser' } : { credits: CREDITS.httpPage, kind: 'http' }
  }
  const httpStatus = result.evidenceRecord?.httpStatus ?? result.snapshot?.httpStatus
  if (status === 'failed' && result.failureReason === 'http_error' && (httpStatus === 404 || httpStatus === 410)) return { credits: CREDITS.notFound, kind: 'not_found' }
  return { credits: 0, kind: 'unread' }
}

/** What a map answer costs: one credit when it returned URLs (completed or partial with links), nothing otherwise. */
export function mapCharge(response: { status?: unknown; links?: unknown }): { credits: number; kind: UsageKind } {
  const returned = Array.isArray(response.links) && response.links.length > 0
  return returned && (response.status === 'completed' || response.status === 'partial') ? { credits: CREDITS.map, kind: 'map' } : { credits: 0, kind: 'unread' }
}

/** Credits taken for one call, from the monthly grant and from bought credits, before it ran. */
export interface Reservation {
  uid: string
  month: string
  fromGrant: number
  fromPurchased: number
  /** What the account had left once these were taken. */
  remaining: number
}

export type ReserveResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; limited: 'credits'; remaining: number }
  | { ok: false; limited: 'site'; limit: number }

export interface CreditsStore {
  /**
   * Takes `amount` credits from the account (this month's grant first, then bought credits) and one start from the
   * site's daily counter, in one atomic commit; refuses, taking nothing, when either would go past its limit.
   */
  reserve(uid: string, amount: number, site: QuotaEntry, now?: Date): Promise<ReserveResult>
  /** Gives back what the call did not cost and adds it to the account's usage for the day, with the call's request line
   * when there is one; returns the balance after. */
  settle(reservation: Reservation, used: number, kind: UsageKind, now?: Date, note?: RequestNote): Promise<{ remaining: number }>
}

export function utcMonth(now: Date): string { return now.toISOString().slice(0, 7) }
/** Seconds until the next month's grant, at 00:00 UTC on the 1st. */
export function secondsToNextGrant(now: Date): number {
  return Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now.getTime()) / 1000))
}

/** The balance an account has this month: a grant from an earlier month is replaced by this month's. */
function current(balance: { month: string; grant: number; purchased: number } | null, month: string, monthlyGrant: number): { grant: number; purchased: number } {
  if (balance === null) return { grant: monthlyGrant, purchased: 0 }
  return { grant: balance.month === month ? balance.grant : monthlyGrant, purchased: balance.purchased }
}

/** Splits a charge between the grant and bought credits, the grant first. */
function take(amount: number, have: { grant: number; purchased: number }): { fromGrant: number; fromPurchased: number } {
  const fromGrant = Math.min(amount, have.grant)
  return { fromGrant, fromPurchased: amount - fromGrant }
}

/** Splits a refund back to where it came from, the bought credits first, so a refund never inflates a grant past what was taken. */
function giveBack(refund: number, reservation: Reservation): { toGrant: number; toPurchased: number } {
  const toPurchased = Math.min(refund, reservation.fromPurchased)
  return { toGrant: Math.min(refund - toPurchased, reservation.fromGrant), toPurchased }
}

export class MemoryCreditsStore implements CreditsStore {
  readonly balances = new Map<string, { month: string; grant: number; purchased: number }>()
  readonly site = new Map<string, number>()
  readonly usage = new Map<string, Record<UsageKind | 'credits', number>>()
  readonly requests = new Map<string, RequestLine[]>()
  constructor(private readonly monthlyGrant = DEFAULT_MONTHLY_CREDITS) {}
  async reserve(uid: string, amount: number, site: QuotaEntry, now = new Date()): Promise<ReserveResult> {
    const month = utcMonth(now)
    const have = current(this.balances.get(uid) ?? null, month, this.monthlyGrant)
    if ((this.site.get(site.id) ?? 0) >= site.limit) return { ok: false, limited: 'site', limit: site.limit }
    if (have.grant + have.purchased < amount) return { ok: false, limited: 'credits', remaining: have.grant + have.purchased }
    const { fromGrant, fromPurchased } = take(amount, have)
    const left = { month, grant: have.grant - fromGrant, purchased: have.purchased - fromPurchased }
    this.balances.set(uid, left)
    this.site.set(site.id, (this.site.get(site.id) ?? 0) + 1)
    return { ok: true, reservation: { uid, month, fromGrant, fromPurchased, remaining: left.grant + left.purchased } }
  }
  async settle(reservation: Reservation, used: number, kind: UsageKind, now = new Date(), note?: RequestNote): Promise<{ remaining: number }> {
    const refund = Math.max(0, reservation.fromGrant + reservation.fromPurchased - used)
    const back = giveBack(refund, reservation)
    if (note) this.requests.set(reservation.uid, [requestLine(note, requestLineId(now), now, kind, used), ...(this.requests.get(reservation.uid) ?? [])])
    const balance = this.balances.get(reservation.uid)!
    balance.grant += back.toGrant
    balance.purchased += back.toPurchased
    const day = `${reservation.uid}-${now.toISOString().slice(0, 10)}`
    const counts = this.usage.get(day) ?? { http: 0, browser: 0, not_found: 0, map: 0, unread: 0, credits: 0 }
    counts[kind] += 1
    counts.credits += used
    this.usage.set(day, counts)
    return { remaining: balance.grant + balance.purchased }
  }
}

// ---- Firestore: `credits/{uid}` holds the balance, `hostedQuotas/{day}-site` the site's starts, `creditUsage/{uid}-{day}` the day's use ----

interface Value { integerValue?: string; stringValue?: string; timestampValue?: string }
interface FirestoreDoc { name: string; fields?: Record<string, Value>; updateTime?: string }
interface CommitResponse { writeResults?: Array<{ transformResults?: Value[] }> }

const UID = /^[A-Za-z0-9_-]{8,128}$/
/** An account id usable as a Firestore document id: Firestore reserves ids of the form __name__. */
export function validAccountId(uid: string): boolean { return UID.test(uid) && !/^__.*__$/.test(uid) }

/** A request line as Firestore fields; nulls are left out, and it expires ACTIVITY_RETENTION_DAYS after it was made. */
function requestLineFields(line: RequestLine, uid: string, now: Date): Record<string, unknown> {
  const expireAt = new Date(now.getTime() + ACTIVITY_RETENTION_DAYS * 86_400_000).toISOString()
  const fields: Record<string, unknown> = { uid: { stringValue: uid }, at: { timestampValue: line.at }, expireAt: { timestampValue: expireAt }, kind: { stringValue: line.kind }, credits: { integerValue: String(line.credits) } }
  for (const name of ['endpoint', 'keyId', 'url', 'finalUrl', 'lane', 'status', 'reason', 'robots', 'sha256'] as const) {
    const value = line[name]
    if (typeof value === 'string') fields[name] = { stringValue: value }
  }
  for (const name of ['httpStatus', 'links'] as const) {
    const value = line[name]
    if (typeof value === 'number' && Number.isSafeInteger(value)) fields[name] = { integerValue: String(value) }
  }
  return fields
}

export class FirestoreCreditsStore implements CreditsStore {
  private readonly resource: string
  private readonly endpoint: string
  /**
   * `token` gives an access token for the service identity; hostedApi.ts passes its metadata-server helper. The
   * balance and the site counter are read, then written in one commit whose update-time preconditions make a
   * concurrent spender retry; a refund and the day's usage are server-side increments, which need no read.
   */
  constructor(projectId: string, private readonly token: () => Promise<string>, private readonly monthlyGrant = DEFAULT_MONTHLY_CREDITS, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    this.resource = `projects/${projectId}/databases/(default)/documents`
    this.endpoint = `https://firestore.googleapis.com/v1/${this.resource}`
  }

  async reserve(uid: string, amount: number, site: QuotaEntry, now = new Date()): Promise<ReserveResult> {
    if (!validAccountId(uid)) throw new Error('account id is malformed')
    const month = utcMonth(now)
    for (let attempt = 0; attempt < 6; attempt++) {
      const token = await this.token()
      const [balanceDoc, siteDoc] = await Promise.all([this.read(`credits/${uid}`, token), this.read(`hostedQuotas/${site.id}`, token)])
      const siteCount = siteDoc === null ? 0 : integer(siteDoc.fields?.count, 'site count')
      if (siteCount >= site.limit) return { ok: false, limited: 'site', limit: site.limit }
      const balance = balanceDoc === null ? null : {
        month: balanceDoc.fields?.month?.stringValue ?? '',
        grant: integer(balanceDoc.fields?.grant, 'grant'),
        purchased: integer(balanceDoc.fields?.purchased, 'purchased'),
      }
      const have = current(balance, month, this.monthlyGrant)
      if (have.grant + have.purchased < amount) return { ok: false, limited: 'credits', remaining: have.grant + have.purchased }
      const { fromGrant, fromPurchased } = take(amount, have)
      const left = { grant: have.grant - fromGrant, purchased: have.purchased - fromPurchased }
      const siteExpireAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2)).toISOString()
      const committed = await this.commit(token, [
        {
          update: { name: `${this.resource}/credits/${uid}`, fields: { month: { stringValue: month }, grant: { integerValue: String(left.grant) }, purchased: { integerValue: String(left.purchased) } } },
          updateMask: { fieldPaths: ['month', 'grant', 'purchased'] },
          currentDocument: balanceDoc === null ? { exists: false } : { updateTime: balanceDoc.updateTime },
        },
        {
          update: { name: `${this.resource}/hostedQuotas/${site.id}`, fields: { count: { integerValue: String(siteCount + 1) }, expireAt: { timestampValue: siteExpireAt } } },
          currentDocument: siteDoc === null ? { exists: false } : { updateTime: siteDoc.updateTime },
        },
      ])
      if (committed === 'retry') continue
      return { ok: true, reservation: { uid, month, fromGrant, fromPurchased, remaining: left.grant + left.purchased } }
    }
    throw new Error('credits contention exceeded retry budget')
  }

  async settle(reservation: Reservation, used: number, kind: UsageKind, now = new Date(), note?: RequestNote): Promise<{ remaining: number }> {
    const refund = Math.max(0, reservation.fromGrant + reservation.fromPurchased - used)
    const back = giveBack(refund, reservation)
    const day = now.toISOString().slice(0, 10)
    // The id is fixed before the first attempt, so a retried commit writes the same line again rather than a second one.
    const line = note ? requestLine(note, requestLineId(now), now, kind, used) : null
    const expireAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + USAGE_RETENTION_DAYS)).toISOString()
    const increment = (fieldPath: string, by: number) => ({ fieldPath, increment: { integerValue: String(by) } })
    // Increments need no read, so a refused commit is retried as it is; one that timed out may have applied (see the log line).
    const writes = (withLine: boolean) => [
      {
        update: { name: `${this.resource}/credits/${reservation.uid}`, fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [increment('grant', back.toGrant), increment('purchased', back.toPurchased)],
        currentDocument: { exists: true },
      },
      {
        update: { name: `${this.resource}/creditUsage/${reservation.uid}-${day}`, fields: { uid: { stringValue: reservation.uid }, day: { stringValue: day }, expireAt: { timestampValue: expireAt } } },
        updateMask: { fieldPaths: ['uid', 'day', 'expireAt'] },
        updateTransforms: [increment(kind, 1), increment('credits', used)],
      },
      ...(line === null || !withLine ? [] : [{ update: { name: `${this.resource}/requestLog/${reservation.uid}/requests/${line.id}`, fields: requestLineFields(line, reservation.uid, now) } }]),
    ]
    let response: CommitResponse | 'retry' = 'retry'
    for (let attempt = 0; attempt < 3 && response === 'retry'; attempt++) {
      try {
        response = await this.commit(await this.token(), writes(line !== null))
      } catch (error) {
        // The request line is the only part a caller shapes: a commit Firestore refuses with it is sent once more without it.
        if (line === null) throw error
        response = await this.commit(await this.token(), writes(false))
      }
    }
    if (response === 'retry') throw new Error('credits settle was refused')
    const results = response.writeResults?.[0]?.transformResults ?? []
    const grant = Number(results[0]?.integerValue)
    const purchased = Number(results[1]?.integerValue)
    // The balance after the refund, as the server computed it; else what the reservation left plus the refund.
    return { remaining: Number.isSafeInteger(grant) && Number.isSafeInteger(purchased) ? grant + purchased : reservation.remaining + refund }
  }

  private async read(path: string, token: string): Promise<FirestoreDoc | null> {
    const response = await this.fetcher(`${this.endpoint}/${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`credits read failed (${response.status})`)
    const doc = await response.json() as FirestoreDoc
    if (doc.name !== `${this.resource}/${path}` || !doc.updateTime) throw new Error('credits document is malformed')
    return doc
  }

  private async commit(token: string, writes: unknown[]): Promise<CommitResponse | 'retry'> {
    const response = await this.fetcher(`${this.endpoint}:commit`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ writes }),
    })
    if (response.ok) return await response.json() as CommitResponse
    if (response.status === 409 || response.status === 412) return 'retry'
    if (response.status === 400) {
      const error = await response.json().catch(() => null) as { error?: { status?: string } } | null
      if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED') return 'retry'
    }
    throw new Error(`credits commit failed (${response.status})`)
  }
}

function integer(value: Value | undefined, name: string): number {
  // A field a writer has not set yet (a purchase that wrote only `purchased`) is zero, not a broken account.
  if (value === undefined) return 0
  const n = Number(value.integerValue)
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`credits document has a malformed ${name}`)
  return n
}
