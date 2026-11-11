/**
 * Credits for accounts' keys on hosted Octocrawl (ROADMAP PH, decided 2026-10-11).
 *
 * Every account gets a monthly grant (500 credits by default, reset on the 1st, UTC, nothing rolled over), spent
 * before credits it bought. A call reserves the most it could cost before it runs and settles at what its result
 * cost, so two instances can never spend more than the balance, and a call that read nothing costs nothing:
 *
 *   a page read over HTTP          1    (success, partial or empty_verified on the http lane)
 *   a page read in a browser       5    (the same statuses on a browser lane)
 *   a page that does not exist     1    (failed, http_error with HTTP 404 or 410)
 *   a map call that returned URLs  1
 *   the json model fallback        +2   (on a page whose json called the model: hostedModel.ts, decided 2026-10-24)
 *   anything else                  0    (blocked by a check, a challenge or robots.txt; DNS, timeout, no response;
 *                                        an invalid request; a server error)
 *
 * Keyless callers and keys issued by hand keep their daily allowances (hostedApi.ts); only keys that name an
 * account (`uid`) spend credits. Usage is added up per account and UTC day, for the dashboard.
 *
 * Each call by an account's key also leaves one line in `requestLog/{uid}/requests/{id}`, written in the settle's
 * commit: the URL asked for and the formats a scrape named, what came back (status, HTTP status, lane, robots.txt
 * decision, the body's SHA-256 from the Evidence Record), how long the call took and what it cost. Never the page's content. Lines expire after 30 days (TTL on `expireAt`), and only
 * the account sees them, on the dashboard's Activity page (decided by Howard on 2026-10-12).
 *
 * A hosted job leaves one line when it ends, not one a page: what it was asked, its pages by outcome and what it cost
 * (`writeJobLine`). The day's usage counts its pages as they are read, and under `job_pages` how many of them were a
 * job's, so that the dashboard can check every other call has a line.
 */
import type { QuotaEntry } from './hostedApi.js'

export const DEFAULT_MONTHLY_CREDITS = 500
/** Where a person asks for more credits than the grant, until packs are sold (docs/launch/2026-10-18-hosted-business-plan.md). */
export const MORE_CREDITS_ADDRESS = 'hello@octocrawl.dev'
export const MORE_CREDITS_HINT = `for more credits, write to ${MORE_CREDITS_ADDRESS} with a line on what you are reading`
/** How often a job waiting for credits asks again, so credits added by hand or a trial pack get it going within the day. */
export const CREDITS_RECHECK_SECONDS = 6 * 3_600
export const CREDITS = { httpPage: 1, browserPage: 5, notFound: 1, map: 1, model: 2 } as const
/** Usage records are kept this long, for the account page and questions about a charge. */
export const USAGE_RETENTION_DAYS = 90
/** Request lines are kept this long. */
export const ACTIVITY_RETENTION_DAYS = 30
/** The longest URL a request line keeps; a longer one is cut. */
const ACTIVITY_URL_CHARS = 2_048

/** What the API knows of a call by an account's key when it settles: the request line, before its cost. */
export interface RequestNote {
  endpoint: 'scrape' | 'map' | 'batch' | 'crawl'
  /** The key's HMAC: the id the dashboard lists keys by. */
  keyId: string
  url: string
  finalUrl: string | null
  lane: string | null
  /** The result's status (`success`, `blocked`, ...) or the map's; `invalid_request` or `error` when nothing ran. */
  status: string
  httpStatus: number | null
  reason: string | null
  /** `unreachable`: robots.txt could not be read (a 5xx, a network error or a timeout), which counts as a disallow without being one the site wrote. */
  robots: 'allowed' | 'disallowed' | 'no_robots' | 'unreachable' | null
  /** The Evidence Record's `rawSha256`. */
  sha256: string | null
  /** The URLs a map returned. */
  links: number | null
  /** The formats a scrape asked for, by name (`markdown`, `json`, ...); empty when it named none; null for a map. */
  formats: string[] | null
  /** How long the call took, from its start to its answer, in milliseconds. */
  ms: number | null
  /**
   * The scrape's `scrapeId`, which names its record (GET /v1/scrapes/:id): the line's credits and the record's USD paid
   * calls are joined by it (PA EH1). Null for a map, and for a scrape that ran nothing.
   */
  scrapeId: string | null
  /**
   * The ids of the provider calls the scrape paid for (`paidCallId` on its Evidence Record's `access.paidCalls`), so a
   * paid call's USD and the credits it was answered for can be matched; empty when it made none or none was in a task;
   * null for a map, and for a scrape that ran nothing.
   */
  paidCallIds: string[] | null
  /** The credits of the json model fallback within the line's credits (CREDITS.model, or 0); absent when it was not asked for. */
  modelCredits?: number
  /**
   * The scrape's readiness state (`ready`, `not_loaded`, `not_extracted`, `not_served`): a `success` whose page is not the
   * one asked for (the site answered another page, #821) is `not_served`, and the dashboard says so. Absent on lines from
   * before 2026-11-05, and null for a map.
   */
  readiness?: string | null
  /** What a hosted job came to; only on a job's line. */
  job?: JobLineSummary
}
/** A job's line: `requested` URLs (a crawl's one start URL), the `pages` it read of them, the `errors` among those, and its pages by outcome (hostedJobWorker.ts pageOutcome). */
export interface JobLineSummary { id: string; requested: number; pages: number; errors: number; outcomes: Record<string, number> }
export interface RequestLine extends RequestNote { id: string; at: string; kind: UsageKind | 'job'; credits: number }

/** A request line's id: newest first in Firestore's default (ascending) order, which needs no index, then a random tail, or one given for a line written again. */
export function requestLineId(now: Date, tail = Math.random().toString(36).slice(2, 10)): string {
  return `${String(9_999_999_999_999 - now.getTime()).padStart(13, '0')}-${tail.replace(/[^a-z0-9]/g, '').slice(0, 12) || '0'}`
}
/** A half of a surrogate pair with no other half (a caller's body, or a cut at the length limit) becomes U+FFFD:
 * Firestore takes only well-formed text, and a refused line must not refuse the charge it is written with. */
const wellFormed = (text: string) => text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
function requestLine(note: RequestNote, id: string, now: Date, kind: RequestLine['kind'], credits: number): RequestLine {
  const clean = (value: string | null, chars = 200) => (value === null ? null : wellFormed(value.slice(0, chars)))
  return {
    ...note, url: wellFormed(note.url.slice(0, ACTIVITY_URL_CHARS)), finalUrl: clean(note.finalUrl, ACTIVITY_URL_CHARS), lane: clean(note.lane), status: wellFormed(note.status.slice(0, 200)),
    reason: clean(note.reason), sha256: clean(note.sha256), formats: note.formats === null ? null : note.formats.slice(0, 20).map((name) => wellFormed(name.slice(0, 40))),
    scrapeId: clean(note.scrapeId), paidCallIds: note.paidCallIds === null ? null : note.paidCallIds.slice(0, 20).map((id) => wellFormed(id.slice(0, 200))),
    id, at: now.toISOString(), kind, credits,
  }
}

/** What a settled call is counted as on the account page; `model` counts the pages whose json called the model, and `job_pages` the pages a job read, each beside their own kind. */
export type UsageKind = 'http' | 'browser' | 'not_found' | 'map' | 'unread' | 'model' | 'job_pages'

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
  /**
   * Set when the reservation is settled once at most, whoever settles it (a hosted job's slice, or the next slice after one
   * that died): a second settle of the same id changes nothing (`creditSettles/{id}`).
   */
  id?: string
  /**
   * Daily counters the settle gives back, in its one commit, so they go back once as the credits do: a slice's pages it
   * reserved and did not read. A counter of starts (a scrape's) is not named here: a start stays counted.
   */
  quotasBack?: ReadonlyArray<{ id: string; amount: number }>
}

export type ReserveResult =
  /** `counts`: each daily counter's count after this reservation, in the order the counters were given. */
  | { ok: true; reservation: Reservation; counts?: readonly number[] }
  | { ok: false; limited: 'credits'; remaining: number }
  /** A daily counter is at its limit: the accounts' day, or one account's share of it (`id` names which). */
  | { ok: false; limited: 'quota'; id: string; limit: number }
  /** The account has no `users/{uid}`: it was deleted (a key the API still had cached), or never signed in. */
  | { ok: false; limited: 'account' }

export interface CreditsStore {
  /**
   * Takes `amount` credits from the account (this month's grant first, then bought credits) and one start from each
   * daily counter (the accounts', the account's), in one atomic commit; refuses, taking nothing, when any would go past
   * its limit, naming the first.
   */
  reserve(uid: string, amount: number, quotas: readonly QuotaEntry[], now?: Date, id?: string): Promise<ReserveResult>
  /** Gives back what the call did not cost and adds it to the account's usage for the day, with the call's request line
   * when there is one; returns the balance after. `perKind` counts many reads at once (a hosted job's slice) in place of
   * one of `kind`. */
  settle(reservation: Reservation, used: number, kind: UsageKind, now?: Date, note?: RequestNote, perKind?: Partial<Record<UsageKind, number>>): Promise<{ remaining: number }>
  /** The credits the account has this month, taking nothing; a hosted job's start checks it covers a slice. */
  balance(uid: string, now?: Date): Promise<number>
  /**
   * Adds `amount` bought credits to the account, once for `id` (an order's number, `trial-{uid}` for the operator's trial
   * pack): a second call with the same id adds nothing and says so. Bought credits stay across months and are spent after
   * the grant. Throws for an account that does not exist.
   */
  topUp(uid: string, amount: number, id: string, now?: Date): Promise<{ added: boolean; remaining: number }>
  /**
   * A finished job's one request line, `at` its end and named by its job, so a later delivery writes the same line again.
   * Its `credits` were charged slice by slice, so nothing is settled here. False: the line was not written, the account
   * being gone or its record too busy.
   */
  writeJobLine(uid: string, note: RequestNote, credits: number, at: Date): Promise<boolean>
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
  readonly usage = new Map<string, Partial<Record<UsageKind, number>> & { credits: number }>()
  readonly requests = new Map<string, RequestLine[]>()
  readonly settled = new Set<string>()
  constructor(private readonly monthlyGrant = DEFAULT_MONTHLY_CREDITS) {}
  async reserve(uid: string, amount: number, quotas: readonly QuotaEntry[], now = new Date(), id?: string): Promise<ReserveResult> {
    const month = utcMonth(now)
    const have = current(this.balances.get(uid) ?? null, month, this.monthlyGrant)
    const full = quotas.find((quota) => (this.site.get(quota.id) ?? 0) + (quota.amount ?? 1) > quota.limit)
    if (full) return { ok: false, limited: 'quota', id: full.id, limit: full.limit }
    if (have.grant + have.purchased < amount) return { ok: false, limited: 'credits', remaining: have.grant + have.purchased }
    const { fromGrant, fromPurchased } = take(amount, have)
    const left = { month, grant: have.grant - fromGrant, purchased: have.purchased - fromPurchased }
    this.balances.set(uid, left)
    for (const quota of quotas) this.site.set(quota.id, (this.site.get(quota.id) ?? 0) + (quota.amount ?? 1))
    return { ok: true, reservation: { uid, month, fromGrant, fromPurchased, remaining: left.grant + left.purchased, ...(id === undefined ? {} : { id }) }, counts: quotas.map((quota) => this.site.get(quota.id)!) }
  }
  async balance(uid: string, now = new Date()): Promise<number> {
    const have = current(this.balances.get(uid) ?? null, utcMonth(now), this.monthlyGrant)
    return have.grant + have.purchased
  }
  readonly topUps = new Set<string>()
  async topUp(uid: string, amount: number, id: string, now = new Date()): Promise<{ added: boolean; remaining: number }> {
    if (this.topUps.has(id)) return { added: false, remaining: await this.balance(uid, now) }
    this.topUps.add(id)
    const month = utcMonth(now)
    const have = current(this.balances.get(uid) ?? null, month, this.monthlyGrant)
    this.balances.set(uid, { month, grant: have.grant, purchased: have.purchased + amount })
    return { added: true, remaining: have.grant + have.purchased + amount }
  }
  async settle(reservation: Reservation, used: number, kind: UsageKind, now = new Date(), note?: RequestNote, perKind?: Partial<Record<UsageKind, number>>): Promise<{ remaining: number }> {
    if (reservation.id !== undefined) {
      if (this.settled.has(reservation.id)) return { remaining: await this.balance(reservation.uid, now) }
      this.settled.add(reservation.id)
    }
    const refund = Math.max(0, reservation.fromGrant + reservation.fromPurchased - used)
    const back = giveBack(refund, reservation)
    if (note) this.requests.set(reservation.uid, [requestLine(note, requestLineId(now), now, kind, used), ...(this.requests.get(reservation.uid) ?? [])])
    for (const quota of reservation.quotasBack ?? []) this.site.set(quota.id, (this.site.get(quota.id) ?? 0) - quota.amount)
    const balance = this.balances.get(reservation.uid)!
    balance.grant += back.toGrant
    balance.purchased += back.toPurchased
    const day = `${reservation.uid}-${now.toISOString().slice(0, 10)}`
    // `model` is counted only once a page called the model, as Firestore's increments make the field.
    const counts = this.usage.get(day) ?? { http: 0, browser: 0, not_found: 0, map: 0, unread: 0, credits: 0 }
    if (perKind === undefined) counts[kind] = (counts[kind] ?? 0) + 1
    else for (const [name, n] of Object.entries(perKind) as Array<[UsageKind, number]>) counts[name] = (counts[name] ?? 0) + n
    counts.credits += used
    this.usage.set(day, counts)
    return { remaining: balance.grant + balance.purchased }
  }
  async writeJobLine(uid: string, note: RequestNote, credits: number, at: Date): Promise<boolean> {
    if (!this.balances.has(uid)) return false
    const line = requestLine(note, requestLineId(at, note.job?.id), at, 'job', credits)
    this.requests.set(uid, [line, ...(this.requests.get(uid) ?? []).filter((other) => other.id !== line.id)])
    return true
  }
}

// ---- Firestore: `credits/{uid}` holds the balance, `hostedQuotas/{day}-accounts` every account's starts and `hostedQuotas/{day}-account-{uid}` the account's (a job's slice: `{day}-jobs` and `{day}-jobs-account-{uid}`), `creditUsage/{uid}-{day}` the day's use ----

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
  for (const name of ['endpoint', 'keyId', 'url', 'finalUrl', 'lane', 'status', 'reason', 'robots', 'readiness', 'sha256', 'scrapeId'] as const) {
    const value = line[name]
    if (typeof value === 'string') fields[name] = { stringValue: value }
  }
  if (line.formats !== null) fields.formats = { arrayValue: line.formats.length ? { values: line.formats.map((stringValue) => ({ stringValue })) } : {} }
  if (line.paidCallIds !== null) fields.paidCallIds = { arrayValue: line.paidCallIds.length ? { values: line.paidCallIds.map((stringValue) => ({ stringValue })) } : {} }
  for (const name of ['httpStatus', 'links', 'ms', 'modelCredits'] as const) {
    const value = line[name]
    if (typeof value === 'number' && Number.isSafeInteger(value)) fields[name] = { integerValue: String(value) }
  }
  if (line.job !== undefined) {
    const { id, requested, pages, errors, outcomes } = line.job
    const count = (n: number) => ({ integerValue: String(n) })
    fields.job = { mapValue: { fields: { id: { stringValue: id }, requested: count(requested), pages: count(pages), errors: count(errors), outcomes: { mapValue: { fields: Object.fromEntries(Object.entries(outcomes).map(([name, n]) => [name, count(n)])) } } } } }
  }
  return fields
}

export class FirestoreCreditsStore implements CreditsStore {
  private readonly resource: string
  private readonly endpoint: string
  /**
   * `token` gives an access token for the service identity; hostedApi.ts passes its metadata-server helper. The
   * balance and the daily counters are read, then written in one commit whose update-time preconditions make a
   * concurrent spender retry; a refund and the day's usage are server-side increments, which need no read.
   */
  constructor(projectId: string, private readonly token: () => Promise<string>, private readonly monthlyGrant = DEFAULT_MONTHLY_CREDITS, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    this.resource = `projects/${projectId}/databases/(default)/documents`
    this.endpoint = `https://firestore.googleapis.com/v1/${this.resource}`
  }

  async balance(uid: string, now = new Date()): Promise<number> {
    if (!validAccountId(uid)) throw new Error('account id is malformed')
    const doc = await this.read(`credits/${uid}`, await this.token())
    const balance = doc === null ? null : { month: doc.fields?.month?.stringValue ?? '', grant: integer(doc.fields?.grant, 'grant'), purchased: integer(doc.fields?.purchased, 'purchased') }
    const have = current(balance, utcMonth(now), this.monthlyGrant)
    return have.grant + have.purchased
  }

  async topUp(uid: string, amount: number, id: string, now = new Date()): Promise<{ added: boolean; remaining: number }> {
    if (!validAccountId(uid)) throw new Error('account id is malformed')
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('a top-up is a positive number of credits')
    // No colon: Firestore's REST path would read a trailing `:name` as a verb.
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(id)) throw new Error('a top-up id is 1 to 120 letters, digits, _ . or -')
    const token = await this.token()
    if (await this.read(`creditTopUps/${id}`, token) !== null) return { added: false, remaining: await this.balance(uid, now) }
    // One commit: the top-up's record, created once, the account's record (which must exist, as a first balance needs it),
    // and the bought credits as a server-side increment, which needs no read and no month: a balance written this month or
    // an earlier one keeps its grant as `current` reads it, and a balance not written yet is created with the credits alone.
    const committed = await this.commit(token, [
      { update: { name: `${this.resource}/users/${uid}`, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'createdAtMs', minimum: { integerValue: String(Number.MAX_SAFE_INTEGER) } }], currentDocument: { exists: true } },
      { update: { name: `${this.resource}/creditTopUps/${id}`, fields: { uid: { stringValue: uid }, amount: { integerValue: String(amount) }, at: { timestampValue: now.toISOString() } } }, currentDocument: { exists: false } },
      { update: { name: `${this.resource}/credits/${uid}`, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'purchased', increment: { integerValue: String(amount) } }] },
    ], true)
    if (committed === 'missing') throw new Error(`account ${uid} does not exist: no top-up`)
    // The record was created meanwhile (a second worker, the same order): nothing added here.
    return { added: committed !== 'retry', remaining: await this.balance(uid, now) }
  }

  async reserve(uid: string, amount: number, quotas: readonly QuotaEntry[], now = new Date(), id?: string): Promise<ReserveResult> {
    if (!validAccountId(uid)) throw new Error('account id is malformed')
    const month = utcMonth(now)
    for (let attempt = 0; attempt < 6; attempt++) {
      const token = await this.token()
      const [balanceDoc, ...quotaDocs] = await Promise.all([this.read(`credits/${uid}`, token), ...quotas.map((quota) => this.read(`hostedQuotas/${quota.id}`, token))])
      const counts = quotaDocs.map((doc) => doc === null ? 0 : integer(doc.fields?.count, 'quota count'))
      const full = quotas.findIndex((quota, index) => counts[index]! + (quota.amount ?? 1) > quota.limit)
      if (full >= 0) return { ok: false, limited: 'quota', id: quotas[full]!.id, limit: quotas[full]!.limit }
      const balance = balanceDoc === null ? null : {
        month: balanceDoc.fields?.month?.stringValue ?? '',
        grant: integer(balanceDoc.fields?.grant, 'grant'),
        purchased: integer(balanceDoc.fields?.purchased, 'purchased'),
      }
      const have = current(balance, month, this.monthlyGrant)
      if (have.grant + have.purchased < amount) return { ok: false, limited: 'credits', remaining: have.grant + have.purchased }
      const { fromGrant, fromPurchased } = take(amount, have)
      const left = { grant: have.grant - fromGrant, purchased: have.purchased - fromPurchased }
      const quotaExpireAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2)).toISOString()
      // An account's first balance needs the account: `users/{uid}`, which sign-in writes and deleting the account removes
      // first (packages/public-preview auth.ts). A key the hosted API still has cached for a minute after its account was
      // deleted cannot bring the balance back. The write changes nothing: the smaller of the first sign-in time and the
      // largest safe number is the first sign-in time, which every sign-in sets; it is there for its precondition.
      const accountExists = balanceDoc === null ? [{
        update: { name: `${this.resource}/users/${uid}`, fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: 'createdAtMs', minimum: { integerValue: String(Number.MAX_SAFE_INTEGER) } }],
        currentDocument: { exists: true },
      }] : []
      const committed = await this.commit(token, [
        ...accountExists,
        {
          update: { name: `${this.resource}/credits/${uid}`, fields: { month: { stringValue: month }, grant: { integerValue: String(left.grant) }, purchased: { integerValue: String(left.purchased) } } },
          updateMask: { fieldPaths: ['month', 'grant', 'purchased'] },
          currentDocument: balanceDoc === null ? { exists: false } : { updateTime: balanceDoc.updateTime },
        },
        ...quotas.map((quota, index) => ({
          update: { name: `${this.resource}/hostedQuotas/${quota.id}`, fields: { count: { integerValue: String(counts[index]! + (quota.amount ?? 1)) }, expireAt: { timestampValue: quotaExpireAt } } },
          currentDocument: quotaDocs[index] === null ? { exists: false } : { updateTime: quotaDocs[index]!.updateTime },
        })),
      ], true)
      if (committed === 'missing') {
        // A document that had to exist is gone: the account's record (deleted), or a balance or counter deleted since it
        // was read. Which, the record says; anything else is read again.
        if (await this.read(`users/${uid}`, token) === null) return { ok: false, limited: 'account' }
        continue
      }
      if (committed === 'retry') continue
      return { ok: true, reservation: { uid, month, fromGrant, fromPurchased, remaining: left.grant + left.purchased, ...(id === undefined ? {} : { id }) }, counts: quotas.map((quota, index) => counts[index]! + (quota.amount ?? 1)) }
    }
    throw new Error('credits contention exceeded retry budget')
  }

  async settle(reservation: Reservation, used: number, kind: UsageKind, now = new Date(), note?: RequestNote, perKind?: Partial<Record<UsageKind, number>>): Promise<{ remaining: number }> {
    const refund = Math.max(0, reservation.fromGrant + reservation.fromPurchased - used)
    const back = giveBack(refund, reservation)
    const day = now.toISOString().slice(0, 10)
    // The id is fixed before the first attempt, so a retried commit writes the same line again rather than a second one.
    const line = note ? requestLine(note, requestLineId(now), now, kind, used) : null
    const expireAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + USAGE_RETENTION_DAYS)).toISOString()
    const quotaExpireAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2)).toISOString()
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
        updateTransforms: [...(perKind === undefined ? [increment(kind, 1)] : Object.entries(perKind).filter(([, n]) => n > 0).map(([name, n]) => increment(name, n))), increment('credits', used)],
      },
      ...(line === null || !withLine ? [] : [{ update: { name: `${this.resource}/requestLog/${reservation.uid}/requests/${line.id}`, fields: requestLineFields(line, reservation.uid, now) } }]),
      // No precondition: a counter its TTL already took comes back negative and past its day, which no reservation reads, and goes again.
      ...(reservation.quotasBack ?? []).filter((quota) => quota.amount > 0).map((quota) => ({
        update: { name: `${this.resource}/hostedQuotas/${quota.id}`, fields: { expireAt: { timestampValue: quotaExpireAt } } },
        updateMask: { fieldPaths: ['expireAt'] },
        updateTransforms: [increment('count', -quota.amount)],
      })),
      // Settled once: the record must not exist yet, so a second settle of the same reservation applies nothing.
      ...(reservation.id === undefined ? [] : [{ update: { name: `${this.resource}/creditSettles/${reservation.id}`, fields: { uid: { stringValue: reservation.uid }, used: { integerValue: String(used) }, expireAt: { timestampValue: new Date(now.getTime() + 30 * 86_400_000).toISOString() } } }, currentDocument: { exists: false } }]),
    ]
    if (reservation.id !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(reservation.id)) throw new Error('reservation id is malformed')
    const settledAlready = async () => reservation.id !== undefined && (await this.read(`creditSettles/${reservation.id}`, await this.token())) !== null
    if (await settledAlready()) return { remaining: reservation.remaining }
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
    if (response === 'retry') {
      // Refused for its precondition: another settle of the same reservation came first.
      if (await settledAlready()) return { remaining: reservation.remaining }
      throw new Error('credits settle was refused')
    }
    const results = response.writeResults?.[0]?.transformResults ?? []
    const grant = Number(results[0]?.integerValue)
    const purchased = Number(results[1]?.integerValue)
    // The balance after the refund, as the server computed it; else what the reservation left plus the refund.
    return { remaining: Number.isSafeInteger(grant) && Number.isSafeInteger(purchased) ? grant + purchased : reservation.remaining + refund }
  }

  async writeJobLine(uid: string, note: RequestNote, credits: number, at: Date): Promise<boolean> {
    const line = requestLine(note, requestLineId(at, note.job?.id), at, 'job', credits)
    const writes = [
      // Adds nothing: the commit holds only while the account does, so an account erased as its job ended keeps no line.
      { update: { name: `${this.resource}/credits/${uid}`, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'grant', increment: { integerValue: '0' } }], currentDocument: { exists: true } },
      { update: { name: `${this.resource}/requestLog/${uid}/requests/${line.id}`, fields: requestLineFields(line, uid, at) } },
    ]
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.commit(await this.token(), writes, true)
      if (response === 'missing') return false
      if (response !== 'retry') return true
    }
    return false
  }

  private async read(path: string, token: string): Promise<FirestoreDoc | null> {
    const response = await this.fetcher(`${this.endpoint}/${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`credits read failed (${response.status})`)
    const doc = await response.json() as FirestoreDoc
    if (doc.name !== `${this.resource}/${path}` || !doc.updateTime) throw new Error('credits document is malformed')
    return doc
  }

  /** `missing` (only when asked for) is a write whose document had to exist and does not: Firestore answers 404. */
  private async commit(token: string, writes: unknown[]): Promise<CommitResponse | 'retry'>
  private async commit(token: string, writes: unknown[], allowMissing: true): Promise<CommitResponse | 'retry' | 'missing'>
  private async commit(token: string, writes: unknown[], allowMissing = false): Promise<CommitResponse | 'retry' | 'missing'> {
    const response = await this.fetcher(`${this.endpoint}:commit`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ writes }),
    })
    if (response.ok) return await response.json() as CommitResponse
    if (allowMissing && response.status === 404) return 'missing'
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
