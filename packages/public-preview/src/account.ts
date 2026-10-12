/**
 * The dashboard's data (ROADMAP PH, decided 2026-10-11): what a signed-in person has left this month, what they used,
 * their API keys and the ways they sign in. It reads and writes the collections the hosted API keeps
 * (packages/mcp/src/hostedApi.ts and hostedCredits.ts): `credits/{uid}`, `creditUsage/{uid}-{day}` and
 * `hostedApiKeys/{hmac}`, and reads `users/{uid}`, which sign-in keeps (auth.ts), and `requestLog/{uid}/requests/{id}`,
 * one line per call by the account's keys (hostedCredits.ts). A key is made here the way
 * scripts/hosted/issue-key.mjs makes one: `oc_` and 32 random bytes, shown once, stored only as its HMAC under
 * W2L_QUOTA_HASH_KEY, with the account's uid so its calls spend the account's credits.
 *
 *   GET  /api/account                     { email, providers, credits, usage, keys }
 *   GET  /api/account/activity            { requests, limit, retentionDays }: the latest request lines, newest first
 *   POST /api/account/keys                { label? }  →  { key, id }   (the key, once)
 *   POST /api/account/keys/{id}/revoke    the key stops within a minute (the hosted API caches lookups that long)
 *   POST /api/account/run                 { endpoint: scrape, url, onlyMainContent?, formats? } as the home page's preview
 *                                         takes it, or { endpoint: map, url, search?, limit? }
 *                                         →  the hosted API's answer, with X-Credits-Used and X-Credits-Remaining
 *
 * The Playground's run is the hosted API's own scrape or map, charged and logged there: this server names the account
 * in a header signed with W2L_QUOTA_HASH_KEY (hostedApi.ts, SITE_ACCOUNT_HEADER), so no key changes hands.
 */
import { createHmac, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { HOSTED_MAP_MAX_LIMIT } from '@w2l/contracts'
import { parsePreviewRequest, PREVIEW_BODY_BYTES, type PreviewOptions } from './options.js'
import { metadataAccessToken } from './quota.js'
import type { Session } from './auth.js'

/** The hosted API's monthly grant (W2L_MONTHLY_CREDITS there); the page shows a month not yet started as this. */
export const DEFAULT_MONTHLY_CREDITS = 1_000
/** Keys an account may hold at once; a revoked key does not count. */
export const MAX_ACTIVE_KEYS = 5
export const USAGE_DAYS = 30
/** Request lines the Activity page reads at most, and how long the hosted API keeps them. */
export const ACTIVITY_LIMIT = 1_000
export const ACTIVITY_DAYS = 30

export interface Balance { month: string; grant: number; purchased: number }
export interface UsageDay { day: string; http: number; browser: number; notFound: number; map: number; unread: number; credits: number }
export interface KeyView { id: string; label: string; prefix: string; createdAt: string; enabled: boolean }
/** One call by one of the account's keys, as the hosted API recorded it (hostedCredits.ts, RequestLine). */
export interface RequestView {
  id: string; at: string; endpoint: string; keyId: string; url: string; finalUrl: string | null; lane: string | null; status: string
  httpStatus: number | null; reason: string | null; robots: string | null; sha256: string | null; links: number | null; kind: string; credits: number
  /** The formats a scrape asked for (empty: none named) and how long the call took; null on lines written before
   * the hosted API recorded them (2026-10-12) and, for formats, on a map. */
  formats: string[] | null; ms: number | null
}

export interface AccountData {
  balance(uid: string): Promise<Balance | null>
  usage(uid: string, since: string): Promise<UsageDay[]>
  keys(uid: string): Promise<KeyView[]>
  /** The ways the account has signed in (`google.com`, `github.com`, `emailLink`), as sign-in recorded them. */
  providers(uid: string): Promise<string[]>
  /** The latest request lines, newest first. */
  requests(uid: string, limit: number): Promise<RequestView[]>
  createKey(uid: string, digest: string, record: { label: string; prefix: string; createdAt: string }): Promise<void>
  /** Disables the key if it belongs to the account; false when it does not, or does not exist. */
  revokeKey(uid: string, id: string): Promise<boolean>
}

export class MemoryAccountData implements AccountData {
  readonly balances = new Map<string, Balance>()
  readonly usageDays = new Map<string, UsageDay & { uid: string }>()
  readonly keyRecords = new Map<string, KeyView & { uid: string }>()
  readonly signInMethods = new Map<string, string[]>()
  readonly requestLines = new Map<string, RequestView[]>()
  async balance(uid: string) { return this.balances.get(uid) ?? null }
  async usage(uid: string, since: string) {
    return [...this.usageDays.values()].filter(day => day.uid === uid && day.day >= since).map(({ uid: _uid, ...day }) => day).sort((a, b) => a.day.localeCompare(b.day))
  }
  async keys(uid: string) { return [...this.keyRecords.values()].filter(key => key.uid === uid).map(({ uid: _uid, ...key }) => key) }
  async providers(uid: string) { return this.signInMethods.get(uid) ?? [] }
  async requests(uid: string, limit: number) { return (this.requestLines.get(uid) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit) }
  async createKey(uid: string, digest: string, record: { label: string; prefix: string; createdAt: string }) {
    this.keyRecords.set(digest, { id: digest, uid, enabled: true, ...record })
  }
  async revokeKey(uid: string, id: string) {
    const key = this.keyRecords.get(id)
    if (!key || key.uid !== uid) return false
    key.enabled = false
    return true
  }
}

type Value = { stringValue?: string; integerValue?: string; booleanValue?: boolean; timestampValue?: string; arrayValue?: { values?: Value[] } }
interface Doc { name: string; fields?: Record<string, Value> }

export class FirestoreAccountData implements AccountData {
  private readonly resource: string
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    this.resource = `projects/${projectId}/databases/(default)/documents`
  }
  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    return this.fetcher(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(8_000) })
  }
  /** Documents of a collection whose `uid` field is this account's: a single-field equality, which needs no composite index. */
  private async byUid(collection: string, uid: string): Promise<Doc[]> {
    const response = await this.request(`${this.resource}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
      limit: 200,
    } }) })
    if (!response.ok) throw new Error(`${collection} query failed (${response.status})`)
    const rows = await response.json() as Array<{ document?: Doc }>
    return rows.flatMap(row => row.document ? [row.document] : [])
  }
  async balance(uid: string): Promise<Balance | null> {
    const response = await this.request(`${this.resource}/credits/${uid}`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`credits read failed (${response.status})`)
    const doc = await response.json() as Doc
    const n = (value: Value | undefined) => { const v = Number(value?.integerValue ?? 0); return Number.isSafeInteger(v) && v >= 0 ? v : 0 }
    return { month: doc.fields?.month?.stringValue ?? '', grant: n(doc.fields?.grant), purchased: n(doc.fields?.purchased) }
  }
  async usage(uid: string, since: string): Promise<UsageDay[]> {
    const n = (value: Value | undefined) => Number(value?.integerValue ?? 0) || 0
    return (await this.byUid('creditUsage', uid))
      .map(doc => ({ day: doc.fields?.day?.stringValue ?? '', http: n(doc.fields?.http), browser: n(doc.fields?.browser), notFound: n(doc.fields?.not_found), map: n(doc.fields?.map), unread: n(doc.fields?.unread), credits: n(doc.fields?.credits) }))
      .filter(day => day.day >= since).sort((a, b) => a.day.localeCompare(b.day))
  }
  async keys(uid: string): Promise<KeyView[]> {
    return (await this.byUid('hostedApiKeys', uid)).map(doc => ({
      id: doc.name.split('/').pop()!, label: doc.fields?.label?.stringValue ?? '', prefix: doc.fields?.prefix?.stringValue ?? '',
      createdAt: doc.fields?.createdAt?.timestampValue ?? '', enabled: doc.fields?.enabled?.booleanValue === true,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async providers(uid: string): Promise<string[]> {
    const response = await this.request(`${this.resource}/users/${uid}`)
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`users read failed (${response.status})`)
    const doc = await response.json() as Doc
    return (doc.fields?.providers?.arrayValue?.values ?? []).flatMap(value => typeof value.stringValue === 'string' ? [value.stringValue] : [])
  }
  async requests(uid: string, limit: number): Promise<RequestView[]> {
    // Ids sort newest first (hostedCredits.ts, requestLineId), so the default order needs no index.
    const response = await this.request(`${this.resource}/requestLog/${uid}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'requests' }],
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit,
    } }) })
    if (!response.ok) throw new Error(`requestLog query failed (${response.status})`)
    const rows = await response.json() as Array<{ document?: Doc }>
    const text = (value: Value | undefined) => (typeof value?.stringValue === 'string' ? value.stringValue : null)
    const count = (value: Value | undefined) => { const n = Number(value?.integerValue); return value?.integerValue !== undefined && Number.isSafeInteger(n) ? n : null }
    return rows.flatMap(row => row.document ? [row.document] : []).map(doc => {
      const f = doc.fields ?? {}
      return {
        id: doc.name.split('/').pop()!, at: f.at?.timestampValue ?? '', endpoint: text(f.endpoint) ?? '', keyId: text(f.keyId) ?? '', url: text(f.url) ?? '',
        finalUrl: text(f.finalUrl), lane: text(f.lane), status: text(f.status) ?? '', httpStatus: count(f.httpStatus), reason: text(f.reason), robots: text(f.robots),
        sha256: text(f.sha256), links: count(f.links), kind: text(f.kind) ?? '', credits: count(f.credits) ?? 0,
        formats: f.formats?.arrayValue ? (f.formats.arrayValue.values ?? []).flatMap(value => typeof value.stringValue === 'string' ? [value.stringValue] : []) : null,
        ms: count(f.ms),
      }
    })
  }
  async createKey(uid: string, digest: string, record: { label: string; prefix: string; createdAt: string }) {
    // The fields the hosted API reads (FirestoreHostedKeys), the account's uid, and a prefix to tell keys apart by.
    const response = await this.request(`${this.resource}/hostedApiKeys/${digest}?currentDocument.exists=false`, { method: 'PATCH', body: JSON.stringify({ fields: {
      enabled: { booleanValue: true }, plan: { stringValue: 'account' }, dailyLimit: { integerValue: '0' }, browser: { booleanValue: true },
      label: { stringValue: record.label }, prefix: { stringValue: record.prefix }, createdAt: { timestampValue: record.createdAt }, uid: { stringValue: uid },
    } }) })
    if (!response.ok) throw new Error(`key write failed (${response.status})`)
  }
  async revokeKey(uid: string, id: string): Promise<boolean> {
    const read = await this.request(`${this.resource}/hostedApiKeys/${id}`)
    if (read.status === 404) return false
    if (!read.ok) throw new Error(`key read failed (${read.status})`)
    const doc = await read.json() as Doc & { updateTime?: string }
    if (doc.fields?.uid?.stringValue !== uid) return false
    // The precondition keeps a key from being revoked on the strength of a read another write has since changed.
    const response = await this.request(`${this.resource}/hostedApiKeys/${id}?updateMask.fieldPaths=enabled&currentDocument.updateTime=${encodeURIComponent(doc.updateTime ?? '')}`, { method: 'PATCH', body: JSON.stringify({ fields: { enabled: { booleanValue: false } } }) })
    if (!response.ok) throw new Error(`key revoke failed (${response.status})`)
    return true
  }
}

export interface AccountRoutesOptions {
  data: AccountData
  /** W2L_QUOTA_HASH_KEY: the hosted API looks keys up by their HMAC under it. */
  hashKey: string
  current: (req: IncomingMessage) => Promise<Session | null>
  monthlyCredits?: number
  now?: () => Date
  /** Where the Playground's runs go: the hosted API's origin (W2L_HOSTED_API_URL). Absent: /api/account/run answers 503. */
  hostedApi?: { origin: string; fetcher?: typeof fetch; timeoutMs?: number }
}

/** The header and its form are hostedApi.ts's (SITE_ACCOUNT_HEADER, siteAccountAssertion), which verifies them. */
export const SITE_ACCOUNT_HEADER = 'x-w2l-site-account'
const SITE_ACCOUNT_TTL_MS = 120_000
export function siteAccountAssertion(hashKey: string, uid: string, now = Date.now()): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('the account id cannot be signed')
  const expires = now + SITE_ACCOUNT_TTL_MS
  return `${uid}.${expires}.${createHmac('sha256', hashKey).update(`site-account:${uid}:${expires}`).digest('hex')}`
}
/** A run waits this long for the hosted API, which gives a request up to two minutes. */
export const RUN_TIMEOUT_MS = 125_000
const RUN_BODY_BYTES = PREVIEW_BODY_BYTES

/** Amazon.sg /dp/{ASIN}, as the home page tells it (apps/public-web/src/getCode.ts, isAmazonProduct). */
const amazonProduct = (url: URL) => (url.hostname === 'amazon.sg' || url.hostname === 'www.amazon.sg') && /^\/dp\/[A-Z0-9]{10}\/?$/i.test(url.pathname)

/**
 * The hosted API body for a Playground run, or null when the request is not one the Playground makes. A scrape is held
 * to the home page's preview rules (options.ts, parsePreviewRequest): the URL, main content or the whole page, and
 * Markdown, links and up to 20 fields. Like the preview it is one extraction with every view in it: Markdown and links
 * unless the fields were asked for too, and for an Amazon.sg product page its checked product JSON.
 */
export function playgroundRequest(body: Record<string, unknown>): { endpoint: 'scrape' | 'map'; body: Record<string, unknown> } | null {
  const { endpoint, ...rest } = body
  if (endpoint !== 'scrape' && endpoint !== 'map') return null
  if (typeof rest.url !== 'string' || rest.url.length > 2_048) return null
  let url: URL
  try { url = new URL(rest.url.trim()) } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (endpoint === 'map') {
    const search = typeof rest.search === 'string' ? rest.search.trim().slice(0, 200) : ''
    const limit = typeof rest.limit === 'number' && Number.isSafeInteger(rest.limit) ? Math.min(Math.max(rest.limit, 1), HOSTED_MAP_MAX_LIMIT) : 100
    return { endpoint, body: { url: url.href, limit, ...(search ? { search } : {}) } }
  }
  let options: PreviewOptions
  try { options = parsePreviewRequest({ ...rest, url: url.href }).options } catch { return null }
  if (amazonProduct(url)) return { endpoint, body: { url: url.href, formats: ['markdown', 'links', 'json'] } }
  return { endpoint, body: { url: url.href, formats: options.formats ?? ['markdown', 'links'], ...(options.onlyMainContent === false ? { onlyMainContent: false } : {}) } }
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
const send = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, JSON_HEADERS).end(JSON.stringify(body)) }

async function readJson(req: IncomingMessage, limit = 1_024): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return {}
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += next.length
    if (length > limit) throw new Error('too large')
    chunks.push(next)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  const body = JSON.parse(text) as unknown
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
}

export function createAccountRoutes(options: AccountRoutesOptions) {
  if (options.hashKey.length < 32) throw new Error('W2L_QUOTA_HASH_KEY must contain at least 32 characters')
  const now = options.now ?? (() => new Date())
  const monthly = options.monthlyCredits ?? DEFAULT_MONTHLY_CREDITS

  /** Answers /api/account and its key routes; false for any other path. A signed-out caller gets 401. */
  async function handle(req: IncomingMessage, res: ServerResponse, pathname: string, sameOrigin: boolean): Promise<boolean> {
    if (pathname !== '/api/account' && !pathname.startsWith('/api/account/')) return false
    const session = await options.current(req)
    if (session === null) { send(res, 401, { error: 'signed_out' }); return true }
    const at = now()

    if (pathname === '/api/account') {
      if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }).end(); return true }
      const month = at.toISOString().slice(0, 7)
      const since = new Date(at.getTime() - (USAGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
      const [balance, usage, keys, providers] = await Promise.all([options.data.balance(session.uid), options.data.usage(session.uid, since), options.data.keys(session.uid), options.data.providers(session.uid)])
      // A month the account has not spent in yet has its whole grant: the hosted API resets it on the first call.
      const grant = balance === null || balance.month !== month ? monthly : balance.grant
      const resetsAt = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString()
      send(res, 200, {
        email: session.email,
        providers,
        credits: { remaining: grant + (balance?.purchased ?? 0), monthly: { left: grant, of: monthly, resetsAt }, purchased: balance?.purchased ?? 0 },
        usage,
        keys,
      })
      return true
    }

    if (pathname === '/api/account/activity') {
      if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }).end(); return true }
      // Firestore's TTL deletes an expired line within a day or so; until then the time here decides.
      const since = new Date(at.getTime() - ACTIVITY_DAYS * 86_400_000).toISOString()
      const requests = (await options.data.requests(session.uid, ACTIVITY_LIMIT)).filter(line => line.at >= since)
      send(res, 200, { requests, limit: ACTIVITY_LIMIT, retentionDays: ACTIVITY_DAYS })
      return true
    }

    if (!sameOrigin) { res.writeHead(403, { 'cache-control': 'no-store' }).end(); return true }
    if (pathname === '/api/account/keys') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      let body: Record<string, unknown>
      try { body = await readJson(req) } catch { send(res, 400, { error: 'invalid_request' }); return true }
      const label = typeof body.label === 'string' ? body.label.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
      if (/[\u0000-\u001f\u007f<>]/.test(label)) { send(res, 400, { error: 'invalid_label' }); return true }
      const active = (await options.data.keys(session.uid)).filter(key => key.enabled).length
      if (active >= MAX_ACTIVE_KEYS) { send(res, 409, { error: 'too_many_keys', limit: MAX_ACTIVE_KEYS }); return true }
      const key = `oc_${randomBytes(32).toString('base64url')}`
      const digest = createHmac('sha256', options.hashKey).update(`key:${key}`).digest('hex')
      await options.data.createKey(session.uid, digest, { label: label || 'API key', prefix: key.slice(0, 7), createdAt: at.toISOString() })
      send(res, 201, { key, id: digest })
      return true
    }

    if (pathname === '/api/account/run') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      let body: Record<string, unknown>
      try { body = await readJson(req, RUN_BODY_BYTES) } catch { send(res, 400, { error: 'invalid_request' }); return true }
      const run = playgroundRequest(body)
      if (run === null) { send(res, 400, { error: 'invalid_request' }); return true }
      const hosted = options.hostedApi
      if (hosted === undefined) { send(res, 503, { error: 'playground_unavailable' }); return true }
      // A visitor who leaves stops the run: the hosted API gives back what it reserved for a cancelled call.
      const controller = new AbortController()
      const left = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', left)
      const timer = setTimeout(() => controller.abort(), hosted.timeoutMs ?? RUN_TIMEOUT_MS)
      try {
        const response = await (hosted.fetcher ?? fetch)(`${hosted.origin.replace(/\/+$/, '')}/v1/${run.endpoint}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', [SITE_ACCOUNT_HEADER]: siteAccountAssertion(options.hashKey, session.uid, at.getTime()) },
          body: JSON.stringify(run.body),
          signal: controller.signal,
        })
        const text = await response.text()
        let answer: unknown
        try { answer = JSON.parse(text) } catch { send(res, 502, { error: 'hosted_unavailable' }); return true }
        // The hosted API refusing the site's header is this server's fault, not the visitor's session: never a 401 here,
        // which the page reads as signed out.
        if (response.status === 401) { send(res, 502, { error: 'hosted_refused' }); return true }
        const headers: Record<string, string> = { ...JSON_HEADERS }
        for (const name of ['x-credits-used', 'x-credits-remaining', 'retry-after']) { const value = response.headers.get(name); if (value !== null) headers[name] = value }
        res.writeHead(response.status, headers).end(JSON.stringify(answer))
      } catch {
        if (!res.writableEnded && !res.destroyed) send(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? 'timeout' : 'hosted_unavailable' })
      } finally {
        clearTimeout(timer)
        res.off('close', left)
      }
      return true
    }

    const revoke = /^\/api\/account\/keys\/([a-f0-9]{64})\/revoke$/.exec(pathname)
    if (revoke) {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      const done = await options.data.revokeKey(session.uid, revoke[1]!)
      if (!done) { send(res, 404, { error: 'not_found' }); return true }
      res.writeHead(204, { 'cache-control': 'no-store' }).end()
      return true
    }
    send(res, 404, { error: 'not_found' })
    return true
  }
  return { handle }
}
