/**
 * The account page's data (ROADMAP PH, decided 2026-10-11): what a signed-in person has left this month, what they
 * used, and their API keys. It reads and writes the collections the hosted API keeps (packages/mcp/src/hostedApi.ts and
 * hostedCredits.ts): `credits/{uid}`, `creditUsage/{uid}-{day}` and `hostedApiKeys/{hmac}`. A key is made here the way
 * scripts/hosted/issue-key.mjs makes one: `oc_` and 32 random bytes, shown once, stored only as its HMAC under
 * W2L_QUOTA_HASH_KEY, with the account's uid so its calls spend the account's credits.
 *
 *   GET  /api/account                     { email, credits, usage, keys }
 *   POST /api/account/keys                { label? }  →  { key, id }   (the key, once)
 *   POST /api/account/keys/{id}/revoke    the key stops within a minute (the hosted API caches lookups that long)
 */
import { createHmac, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { metadataAccessToken } from './quota.js'
import type { Session } from './auth.js'

/** The hosted API's monthly grant (W2L_MONTHLY_CREDITS there); the page shows a month not yet started as this. */
export const DEFAULT_MONTHLY_CREDITS = 1_000
/** Keys an account may hold at once; a revoked key does not count. */
export const MAX_ACTIVE_KEYS = 5
export const USAGE_DAYS = 30

export interface Balance { month: string; grant: number; purchased: number }
export interface UsageDay { day: string; http: number; browser: number; notFound: number; map: number; unread: number; credits: number }
export interface KeyView { id: string; label: string; prefix: string; createdAt: string; enabled: boolean }

export interface AccountData {
  balance(uid: string): Promise<Balance | null>
  usage(uid: string, since: string): Promise<UsageDay[]>
  keys(uid: string): Promise<KeyView[]>
  createKey(uid: string, digest: string, record: { label: string; prefix: string; createdAt: string }): Promise<void>
  /** Disables the key if it belongs to the account; false when it does not, or does not exist. */
  revokeKey(uid: string, id: string): Promise<boolean>
}

export class MemoryAccountData implements AccountData {
  readonly balances = new Map<string, Balance>()
  readonly usageDays = new Map<string, UsageDay & { uid: string }>()
  readonly keyRecords = new Map<string, KeyView & { uid: string }>()
  async balance(uid: string) { return this.balances.get(uid) ?? null }
  async usage(uid: string, since: string) {
    return [...this.usageDays.values()].filter(day => day.uid === uid && day.day >= since).map(({ uid: _uid, ...day }) => day).sort((a, b) => a.day.localeCompare(b.day))
  }
  async keys(uid: string) { return [...this.keyRecords.values()].filter(key => key.uid === uid).map(({ uid: _uid, ...key }) => key) }
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

type Value = { stringValue?: string; integerValue?: string; booleanValue?: boolean; timestampValue?: string }
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
      const [balance, usage, keys] = await Promise.all([options.data.balance(session.uid), options.data.usage(session.uid, since), options.data.keys(session.uid)])
      // A month the account has not spent in yet has its whole grant: the hosted API resets it on the first call.
      const grant = balance === null || balance.month !== month ? monthly : balance.grant
      const resetsAt = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString()
      send(res, 200, {
        email: session.email,
        credits: { remaining: grant + (balance?.purchased ?? 0), monthly: { left: grant, of: monthly, resetsAt }, purchased: balance?.purchased ?? 0 },
        usage,
        keys,
      })
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
