/**
 * MCP connections by OAuth (ROADMAP PH item 6, docs/mcp-oauth-tasks.md PR ②): the authorization server for
 * `https://mcp.octocrawl.dev/mcp-oauth`, on octocrawl.dev beside sign-in. Only the narrow part of OAuth 2.1 MCP clients
 * use: public clients, the authorization code grant with PKCE S256, and rotating refresh tokens.
 *
 *   GET  /.well-known/oauth-authorization-server   metadata (RFC 8414)
 *   POST /oauth/register                           dynamic registration of a public client (RFC 7591)
 *   GET  /oauth/authorize                          the consent page, after sign-in
 *   POST /oauth/authorize                          the consent page's answer: a code (with `iss`, RFC 9207) or access_denied
 *   POST /oauth/token                              a code or a refresh token for an hour's access token and a new refresh token
 *   POST /oauth/revoke                             RFC 7009: a refresh token ends its connection, an access token goes alone
 *
 * A client is a Client ID Metadata Document (its client_id is the HTTPS address of a JSON document naming it and its
 * callbacks), or one registered here. Each connection is a grant with a key record of its own in `hostedApiKeys`
 * (`kind: oauth`, the account's uid), which the hosted API reads through the connection's access tokens
 * (packages/mcp hostedApi.ts): its calls spend the account's credits and are logged under that key. Codes, access tokens
 * and refresh tokens are kept only as HMACs under W2L_QUOTA_HASH_KEY, as keys are. Collections: `oauthClients`,
 * `oauthGrants`, `oauthCodes`, `oauthTokens`, `oauthRefresh` and `oauthNonces`, each with an `expireAt` for Firestore's TTL.
 *
 * A connection lasts until it is disconnected or goes 90 days unused: each refresh moves its end on. A code used twice,
 * or a refresh token used after it was rotated, ends the connection, as RFC 9700 asks.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage, request as httpRequest, ServerResponse } from 'node:http'
import { evaluateResolved, evaluateUrl, hostedNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { metadataAccessToken } from './quota.js'
import { cookieValue, SESSION_COOKIE, sessionHash, type Session } from './auth.js'
import type { Logger } from './site.js'
import type { Connections } from './account.js'

/** The MCP endpoint tokens are issued for; the hosted API refuses a token whose resource is anything else. */
export const MCP_OAUTH_RESOURCE = 'https://mcp.octocrawl.dev/mcp-oauth'
export const OAUTH_SCOPE = 'mcp'
export const ACCESS_TOKEN_SECONDS = 3_600
const CODE_MS = 60_000
const CONSENT_MS = 600_000
/** A connection, or a registered client, unused this long is gone. */
export const IDLE_DAYS = 90
const IDLE_MS = IDLE_DAYS * 86_400_000
/** Connections an account may hold at once (decided 2026-10-16); they do not count against its five keys. */
export const MAX_CONNECTIONS = 10
const METADATA_MAX_BYTES = 5 * 1024
const METADATA_TIMEOUT_MS = 3_000
const METADATA_CACHE_MS = 86_400_000
const REGISTRATIONS_PER_HOUR = 10
const NAME_MAX = 100
const REDIRECTS_MAX = 10

export interface RegisteredClient { name: string; redirectUris: string[]; applicationType: 'web' | 'native'; createdAt: number; expiresAt: number }
/** A connection. `connected` once its code was exchanged: until then it holds no token and does not count as one of ten. */
export interface GrantRecord { uid: string; clientId: string; clientName: string; redirectHost: string; keyId: string; createdAt: number; lastUsedAt: number; revoked: boolean; connected: boolean }
export interface CodeRecord { uid: string; grantId: string; clientId: string; redirectUri: string; challenge: string; resource: string; expiresAt: number; used: boolean }
/** What the hosted API reads: `keyId`, `resource` and `expiresAt` (hostedApi.ts, FirestoreHostedOAuthTokens). */
export interface AccessRecord { keyId: string; resource: string; expiresAt: number; grantId: string; uid: string }
export interface RefreshRecord { grantId: string; uid: string; clientId: string; keyId: string; resource: string; expiresAt: number; used: boolean }
/** A connection's key record, as the hosted API reads it (hostedApi.ts, FirestoreHostedKeys). */
export interface OAuthKeyRecord { enabled: boolean; uid: string; kind: 'oauth'; grantId: string; label: string; plan: 'account'; browser: true; createdAt: number }

export interface Connection { grantId: string; grant: GrantRecord; keyId: string; label: string; codeHash: string; code: CodeRecord }
export interface Issue {
  grantId: string
  now: number
  access: { hash: string; record: AccessRecord }
  refresh: { hash: string; record: RefreshRecord }
  /** The refresh token this one replaces, as it was read: written as used in the same commit, or nothing is written. */
  rotate?: { hash: string; version: string }
}

export interface OAuthStore {
  client(id: string): Promise<RegisteredClient | null>
  registerClient(id: string, client: RegisteredClient): Promise<void>
  /** A registered client used again: its 90 days start over. */
  touchClient(id: string, expiresAt: number): Promise<void>
  /** True the first time `hash` is used, false after. */
  useOnce(hash: string, expiresAt: number): Promise<boolean>
  /** The account's connections: exchanged their code, and neither disconnected nor 90 days unused. */
  activeGrants(uid: string, now: number): Promise<number>
  /** Every grant the account has, whatever its state. */
  grantsOf(uid: string): Promise<Array<{ id: string; grant: GrantRecord }>>
  /** The grant, its key record and its code, in one commit. */
  connect(connection: Connection): Promise<void>
  /** Marks the code used; `replay` when it already was. Null when there is no such code. */
  takeCode(hash: string): Promise<{ code: CodeRecord; replay: boolean } | null>
  grant(id: string): Promise<GrantRecord | null>
  refresh(hash: string): Promise<(RefreshRecord & { version: string }) | null>
  /** Writes an access and a refresh token and marks the grant used; false when `rotate` was used or changed since its read. */
  issue(issue: Issue): Promise<boolean>
  access(hash: string): Promise<AccessRecord | null>
  deleteAccess(hash: string): Promise<void>
  /** Ends a connection: the grant is marked revoked, its key record disabled (its access tokens stop within a minute) and
   * its refresh tokens deleted. */
  disconnect(grantId: string): Promise<void>
}

export class MemoryOAuthStore implements OAuthStore {
  readonly clients = new Map<string, RegisteredClient>()
  readonly grants = new Map<string, GrantRecord>()
  readonly keys = new Map<string, OAuthKeyRecord>()
  readonly codes = new Map<string, CodeRecord>()
  readonly tokens = new Map<string, AccessRecord>()
  /** Refresh tokens by HMAC. */
  readonly refreshTokens = new Map<string, RefreshRecord & { version: number }>()
  readonly nonces = new Map<string, number>()
  async client(id: string) { return this.clients.get(id) ?? null }
  async registerClient(id: string, client: RegisteredClient) { this.clients.set(id, client) }
  async touchClient(id: string, expiresAt: number) { const client = this.clients.get(id); if (client) client.expiresAt = expiresAt }
  async useOnce(hash: string, expiresAt: number) {
    if (this.nonces.has(hash)) return false
    this.nonces.set(hash, expiresAt)
    return true
  }
  async activeGrants(uid: string, now: number) { return (await this.grantsOf(uid)).filter(({ grant }) => live(grant, now)).length }
  async grantsOf(uid: string) { return [...this.grants.entries()].filter(([, grant]) => grant.uid === uid).map(([id, grant]) => ({ id, grant: { ...grant } })) }
  async connect(connection: Connection) {
    this.grants.set(connection.grantId, { ...connection.grant })
    this.keys.set(connection.keyId, { enabled: true, uid: connection.grant.uid, kind: 'oauth', grantId: connection.grantId, label: connection.label, plan: 'account', browser: true, createdAt: connection.grant.createdAt })
    this.codes.set(connection.codeHash, { ...connection.code })
  }
  async takeCode(hash: string) {
    const code = this.codes.get(hash)
    if (code === undefined) return null
    const replay = code.used
    code.used = true
    return { code: { ...code }, replay }
  }
  async grant(id: string) { const grant = this.grants.get(id); return grant === undefined ? null : { ...grant } }
  async refresh(hash: string) {
    const record = this.refreshTokens.get(hash)
    if (record === undefined) return null
    const { version, ...rest } = record
    return { ...rest, version: String(version) }
  }
  async issue(issue: Issue) {
    if (issue.rotate) {
      const old = this.refreshTokens.get(issue.rotate.hash)
      if (old === undefined || old.used || String(old.version) !== issue.rotate.version) return false
      old.used = true
      old.version++
    }
    const grant = this.grants.get(issue.grantId)
    if (grant === undefined) return false
    this.tokens.set(issue.access.hash, { ...issue.access.record })
    this.refreshTokens.set(issue.refresh.hash, { ...issue.refresh.record, version: 0 })
    grant.lastUsedAt = issue.now
    grant.connected = true
    return true
  }
  async access(hash: string) { return this.tokens.get(hash) ?? null }
  async deleteAccess(hash: string) { this.tokens.delete(hash) }
  async disconnect(grantId: string) {
    const grant = this.grants.get(grantId)
    if (grant === undefined) return
    grant.revoked = true
    const key = this.keys.get(grant.keyId)
    if (key) key.enabled = false
    for (const [hash, record] of this.refreshTokens) if (record.grantId === grantId) this.refreshTokens.delete(hash)
  }
}

type Value = { stringValue?: string; integerValue?: string; booleanValue?: boolean; timestampValue?: string; arrayValue?: { values?: Value[] } }
interface Doc { name: string; fields?: Record<string, Value>; updateTime?: string }
type Write = { update?: { name: string; fields: Record<string, Value> }; updateMask?: { fieldPaths: string[] }; delete?: string; currentDocument?: { exists?: boolean; updateTime?: string } }

const str = (value: string): Value => ({ stringValue: value })
const bool = (value: boolean): Value => ({ booleanValue: value })
const ts = (ms: number): Value => ({ timestampValue: new Date(ms).toISOString() })
const text = (value: Value | undefined) => (typeof value?.stringValue === 'string' ? value.stringValue : null)
const time = (value: Value | undefined) => { const ms = Date.parse(value?.timestampValue ?? ''); return Number.isFinite(ms) ? ms : null }
/** A grant's fields as Firestore keeps them. */
const grantFrom = (f: Record<string, Value>): GrantRecord => ({
  uid: text(f.uid) ?? '', clientId: text(f.clientId) ?? '', clientName: text(f.clientName) ?? '', redirectHost: text(f.redirectHost) ?? '', keyId: text(f.keyId) ?? '',
  createdAt: time(f.createdAt) ?? 0, lastUsedAt: time(f.lastUsedAt) ?? 0, revoked: f.revoked?.booleanValue === true, connected: f.connected?.booleanValue === true,
})
/** A connection that counts: its code exchanged, not disconnected, used within 90 days. */
const live = (grant: GrantRecord, now: number) => grant.connected && !grant.revoked && grant.lastUsedAt + IDLE_MS > now
/** A document id this store writes or reads by: no slash, no dot path, nothing Firestore reserves. */
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * The records in Firestore, written in commits with preconditions so a code or a refresh token is used once even when
 * two instances race for it.
 */
export class FirestoreOAuthStore implements OAuthStore {
  private readonly resource: string
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    this.resource = `projects/${projectId}/databases/(default)/documents`
  }
  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    return this.fetcher(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(8_000) })
  }
  private name(collection: string, id: string): string {
    if (!DOC_ID.test(id)) throw new Error(`${collection} id is malformed`)
    return `${this.resource}/${collection}/${id}`
  }
  private async read(collection: string, id: string): Promise<Doc | null> {
    if (!DOC_ID.test(id)) return null
    const response = await this.request(this.name(collection, id))
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`${collection} read failed (${response.status})`)
    return await response.json() as Doc
  }
  /** 'conflict' when a precondition failed: the document was there, was not, or changed since its read. */
  private async commit(writes: Write[]): Promise<'ok' | 'conflict'> {
    const response = await this.request(`${this.resource}:commit`, { method: 'POST', body: JSON.stringify({ writes }) })
    if (response.ok) return 'ok'
    if (response.status === 404 || response.status === 409 || response.status === 412) return 'conflict'
    if (response.status === 400) {
      const error = await response.json().catch(() => null) as { error?: { status?: string } } | null
      if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED' || error?.error?.status === 'ALREADY_EXISTS') return 'conflict'
    }
    throw new Error(`oauth commit failed (${response.status})`)
  }

  async client(id: string): Promise<RegisteredClient | null> {
    const doc = await this.read('oauthClients', id)
    if (doc === null) return null
    const f = doc.fields ?? {}
    const redirectUris = (f.redirectUris?.arrayValue?.values ?? []).flatMap(value => typeof value.stringValue === 'string' ? [value.stringValue] : [])
    const expiresAt = time(f.expireAt)
    if (redirectUris.length === 0 || expiresAt === null) return null
    return { name: text(f.name) ?? '', redirectUris, applicationType: text(f.applicationType) === 'native' ? 'native' : 'web', createdAt: time(f.createdAt) ?? 0, expiresAt }
  }
  async registerClient(id: string, client: RegisteredClient) {
    const outcome = await this.commit([{ update: { name: this.name('oauthClients', id), fields: {
      name: str(client.name), redirectUris: { arrayValue: { values: client.redirectUris.map(str) } }, applicationType: str(client.applicationType), createdAt: ts(client.createdAt), expireAt: ts(client.expiresAt),
    } }, currentDocument: { exists: false } }])
    if (outcome !== 'ok') throw new Error('client id taken')
  }
  async touchClient(id: string, expiresAt: number) {
    await this.commit([{ update: { name: this.name('oauthClients', id), fields: { expireAt: ts(expiresAt) } }, updateMask: { fieldPaths: ['expireAt'] }, currentDocument: { exists: true } }])
  }
  async useOnce(hash: string, expiresAt: number) {
    return (await this.commit([{ update: { name: this.name('oauthNonces', hash), fields: { expireAt: ts(expiresAt) } }, currentDocument: { exists: false } }])) === 'ok'
  }
  /** Documents of a collection whose `field` equals `value`: a single-field equality, which needs no composite index. */
  private async where(collection: string, field: string, value: string): Promise<Doc[]> {
    const response = await this.request(`${this.resource}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
      limit: 200,
    } }) })
    if (!response.ok) throw new Error(`${collection} query failed (${response.status})`)
    const rows = await response.json() as Array<{ document?: Doc }>
    return rows.flatMap(row => row.document ? [row.document] : [])
  }
  async activeGrants(uid: string, now: number) { return (await this.grantsOf(uid)).filter(({ grant }) => live(grant, now)).length }
  async grantsOf(uid: string) {
    return (await this.where('oauthGrants', 'uid', uid)).map(doc => ({ id: doc.name.split('/').pop()!, grant: grantFrom(doc.fields ?? {}) }))
  }
  async connect(connection: Connection) {
    const { grant, code } = connection
    const outcome = await this.commit([
      { update: { name: this.name('oauthGrants', connection.grantId), fields: {
        uid: str(grant.uid), clientId: str(grant.clientId), clientName: str(grant.clientName), redirectHost: str(grant.redirectHost), keyId: str(grant.keyId),
        createdAt: ts(grant.createdAt), lastUsedAt: ts(grant.lastUsedAt), revoked: bool(false), connected: bool(false), expireAt: ts(grant.lastUsedAt + IDLE_MS),
      } }, currentDocument: { exists: false } },
      // The fields the hosted API reads for any account key, and what makes it a connection's.
      { update: { name: this.name('hostedApiKeys', connection.keyId), fields: {
        enabled: bool(true), plan: str('account'), dailyLimit: { integerValue: '0' }, browser: bool(true), label: str(connection.label), createdAt: ts(grant.createdAt),
        uid: str(grant.uid), kind: str('oauth'), grantId: str(connection.grantId),
      } }, currentDocument: { exists: false } },
      { update: { name: this.name('oauthCodes', connection.codeHash), fields: {
        uid: str(code.uid), grantId: str(code.grantId), clientId: str(code.clientId), redirectUri: str(code.redirectUri), challenge: str(code.challenge), resource: str(code.resource),
        expireAt: ts(code.expiresAt), used: bool(false),
      } }, currentDocument: { exists: false } },
    ])
    if (outcome !== 'ok') throw new Error('connection ids taken')
  }
  async takeCode(hash: string) {
    const doc = await this.read('oauthCodes', hash)
    if (doc === null) return null
    const f = doc.fields ?? {}
    const code: CodeRecord = {
      uid: text(f.uid) ?? '', grantId: text(f.grantId) ?? '', clientId: text(f.clientId) ?? '', redirectUri: text(f.redirectUri) ?? '', challenge: text(f.challenge) ?? '',
      resource: text(f.resource) ?? '', expiresAt: time(f.expireAt) ?? 0, used: f.used?.booleanValue === true,
    }
    if (code.used || !doc.updateTime) return { code, replay: true }
    // Two instances that read the code at once: the second's precondition fails, and it is a replay.
    const outcome = await this.commit([{ update: { name: this.name('oauthCodes', hash), fields: { used: bool(true) } }, updateMask: { fieldPaths: ['used'] }, currentDocument: { updateTime: doc.updateTime } }])
    return { code, replay: outcome !== 'ok' }
  }
  async grant(id: string): Promise<GrantRecord | null> {
    const doc = await this.read('oauthGrants', id)
    if (doc === null) return null
    return grantFrom(doc.fields ?? {})
  }
  async refresh(hash: string) {
    const doc = await this.read('oauthRefresh', hash)
    if (doc === null || !doc.updateTime) return null
    const f = doc.fields ?? {}
    return {
      grantId: text(f.grantId) ?? '', uid: text(f.uid) ?? '', clientId: text(f.clientId) ?? '', keyId: text(f.keyId) ?? '', resource: text(f.resource) ?? '',
      expiresAt: time(f.expireAt) ?? 0, used: f.used?.booleanValue === true, version: doc.updateTime,
    }
  }
  async issue(issue: Issue) {
    const { access, refresh } = issue
    const writes: Write[] = []
    if (issue.rotate) writes.push({ update: { name: this.name('oauthRefresh', issue.rotate.hash), fields: { used: bool(true) } }, updateMask: { fieldPaths: ['used'] }, currentDocument: { updateTime: issue.rotate.version } })
    writes.push(
      // expiresAt is what the hosted API checks; expireAt is the TTL field every collection here has.
      { update: { name: this.name('oauthTokens', access.hash), fields: {
        keyId: str(access.record.keyId), resource: str(access.record.resource), expiresAt: ts(access.record.expiresAt), expireAt: ts(access.record.expiresAt), grantId: str(access.record.grantId), uid: str(access.record.uid),
      } }, currentDocument: { exists: false } },
      { update: { name: this.name('oauthRefresh', refresh.hash), fields: {
        grantId: str(refresh.record.grantId), uid: str(refresh.record.uid), clientId: str(refresh.record.clientId), keyId: str(refresh.record.keyId), resource: str(refresh.record.resource),
        expireAt: ts(refresh.record.expiresAt), used: bool(false),
      } }, currentDocument: { exists: false } },
      { update: { name: this.name('oauthGrants', issue.grantId), fields: { lastUsedAt: ts(issue.now), expireAt: ts(issue.now + IDLE_MS), connected: bool(true) } }, updateMask: { fieldPaths: ['lastUsedAt', 'expireAt', 'connected'] }, currentDocument: { exists: true } },
    )
    return (await this.commit(writes)) === 'ok'
  }
  async access(hash: string): Promise<AccessRecord | null> {
    const doc = await this.read('oauthTokens', hash)
    if (doc === null) return null
    const f = doc.fields ?? {}
    return { keyId: text(f.keyId) ?? '', resource: text(f.resource) ?? '', expiresAt: time(f.expiresAt) ?? 0, grantId: text(f.grantId) ?? '', uid: text(f.uid) ?? '' }
  }
  async deleteAccess(hash: string) {
    if (DOC_ID.test(hash)) await this.commit([{ delete: this.name('oauthTokens', hash) }])
  }
  async disconnect(grantId: string) {
    const grant = await this.grant(grantId)
    if (grant === null) return
    const writes: Write[] = [{ update: { name: this.name('oauthGrants', grantId), fields: { revoked: bool(true) } }, updateMask: { fieldPaths: ['revoked'] }, currentDocument: { exists: true } }]
    if (DOC_ID.test(grant.keyId)) writes.push({ update: { name: this.name('hostedApiKeys', grant.keyId), fields: { enabled: bool(false) } }, updateMask: { fieldPaths: ['enabled'] }, currentDocument: { exists: true } })
    if ((await this.commit(writes)) !== 'ok') throw new Error('disconnect failed')
    // Then its refresh tokens, a page at a time until none is left: a connection refreshed every hour keeps a used token
    // an hour for 90 days, past one query's page. A used one is kept no longer either, as the connection it would end is ended.
    for (let pass = 0; ; pass++) {
      const docs = await this.where('oauthRefresh', 'grantId', grantId)
      if (docs.length === 0) break
      if (pass >= 50) throw new Error('oauthRefresh did not empty')
      if ((await this.commit(docs.map(doc => ({ delete: doc.name })))) !== 'ok') throw new Error('refresh delete failed')
    }
  }
}

type Lookup = (hostname: string, options: { all: true }, callback: (error: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void) => void

/**
 * Reads a Client ID Metadata Document: HTTPS only, from a public address (checked on the address the connection
 * actually uses, so a name that changes its answer cannot reach a private one), at most 5 KB, within 3 seconds, and no
 * redirects. `request`, `lookup` and `policy` are seams for the tests.
 */
export function createClientMetadataFetcher(options: { policy?: NetworkPolicy; lookup?: Lookup; request?: typeof httpRequest; timeoutMs?: number; maxBytes?: number } = {}) {
  const policy = options.policy ?? hostedNetworkPolicy()
  const lookup = options.lookup ?? (dnsLookup as unknown as Lookup)
  const request = options.request ?? (httpsRequest as unknown as typeof httpRequest)
  const timeoutMs = options.timeoutMs ?? METADATA_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? METADATA_MAX_BYTES
  return async (address: string): Promise<unknown> => {
    let url: URL
    try { url = new URL(address) } catch { throw new Error('not a URL') }
    if (url.protocol !== 'https:') throw new Error('a client metadata document must be served over https')
    const literal = evaluateUrl(address, policy)
    if ('allowed' in literal && !literal.allowed) throw new Error(`refused address: ${literal.violation}`)
    const checkedLookup = (hostname: string, lookupOptions: { all?: boolean }, callback: (error: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void) => {
      lookup(hostname, { all: true }, (error, addresses) => {
        if (error) { callback(error, ''); return }
        const decision = evaluateResolved(hostname, addresses.map(entry => entry.address), policy)
        if (!decision.allowed) { callback(new Error(`refused address: ${decision.violation}`), ''); return }
        if (lookupOptions.all) callback(null, addresses)
        else callback(null, addresses[0]!.address, addresses[0]!.family)
      })
    }
    return new Promise((resolve, reject) => {
      let settled = false
      const fail = (error: Error) => { if (!settled) { settled = true; reject(error) } }
      const req = request({
        host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 443), path: `${url.pathname}${url.search}`, method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'Octocrawl-OAuth/1 (+https://octocrawl.dev/)' }, lookup: checkedLookup as never,
      }, (res) => {
        if (res.statusCode !== 200) { res.resume(); fail(new Error(`client metadata answered ${res.statusCode}`)); return }
        const chunks: Buffer[] = []
        let length = 0
        res.on('data', (chunk: Buffer) => {
          length += chunk.length
          if (length > maxBytes) { fail(new Error('client metadata is too large: more than 5 KB')); req.destroy(); return }
          chunks.push(chunk)
        })
        res.on('end', () => {
          if (settled) return
          settled = true
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('client metadata is not JSON')) }
        })
        res.on('error', fail)
      })
      const timer = setTimeout(() => { fail(new Error('client metadata timed out')); req.destroy() }, timeoutMs)
      req.on('error', fail)
      req.on('close', () => clearTimeout(timer))
      req.end()
    })
  }
}

export interface OAuthOptions {
  store: OAuthStore
  /** W2L_QUOTA_HASH_KEY: the hosted API looks access tokens up by their HMAC under it. */
  secret: string
  current: (req: IncomingMessage) => Promise<Session | null>
  /** The account's credits left, shown on the consent page; omitted when absent or unknown. */
  creditsLeft?: (uid: string) => Promise<number | null>
  /** Reads a Client ID Metadata Document; createClientMetadataFetcher() by default. */
  clientMetadata?: (url: string) => Promise<unknown>
  resource?: string
  log?: Logger
  now?: () => Date
}

interface Client { id: string; name: string; redirectUris: string[]; registered: boolean }

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const DCR_ID = /^occ_[A-Za-z0-9_-]{24}$/
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/
const SECRET_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** A callback a client may name: https, or http on the loopback interface (RFC 8252), with no fragment. */
function acceptableRedirect(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_000) return false
  let url: URL
  try { url = new URL(value) } catch { return false }
  if (url.hash || value.includes('#') || url.username || url.password) return false
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))
}

/** Exactly one of the client's callbacks; on the loopback interface the port may differ (RFC 8252 §7.3). */
function redirectMatches(registered: readonly string[], given: string): boolean {
  if (!acceptableRedirect(given)) return false
  if (registered.includes(given)) return true
  const url = new URL(given)
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) return false
  return registered.some((value) => {
    try {
      const known = new URL(value)
      return known.protocol === 'http:' && known.hostname === url.hostname && known.pathname === url.pathname && known.search === url.search
    } catch { return false }
  })
}

const cleanName = (value: unknown, fallback: string) => {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
  return name || fallback
}
const escape = (value: string) => value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '600' }
/** The consent and error pages: the site's CSP without form-action, which Chrome applies to the redirect after the form is
 * sent, and that redirect goes to the client's own host. Framing is refused, so the page cannot be clicked through. */
const PAGE_HEADERS = {
  ...NO_STORE, 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
}

/** Octocrawl's mark, as the site's header shows it. */
const OCTOCRAWL_MARK = '<span class="oauth-mark"><img src="/assets/octopus-160.webp" width="40" height="40" alt="Octocrawl"></span>'

/** One card in the middle of the page (docs-assets/oauth.css); no inline style or script, as the CSP allows neither. */
function page(title: string, card: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} · Octocrawl</title><link rel="stylesheet" href="/docs-assets/docs.css"><link rel="stylesheet" href="/docs-assets/oauth.css"></head><body><main class="oauth-page"><div class="oauth-card">${card}</div></main></body></html>`
}
/** An error's card: Octocrawl's mark, what went wrong, and what to do. `extra` is markup already escaped. */
const errorCard = (title: string, message: string, extra = '') => `<div class="oauth-marks">${OCTOCRAWL_MARK}</div><h1 class="oauth-title">${escape(title)}</h1><p class="oauth-message">${escape(message)}</p>${extra}`

async function readBody(req: IncomingMessage, limit = 8_192): Promise<string> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += next.length
    if (length > limit) throw new Error('too large')
    chunks.push(next)
  }
  return Buffer.concat(chunks).toString('utf8')
}
const isForm = (req: IncomingMessage) => (req.headers['content-type'] ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')

export function createOAuthRoutes(options: OAuthOptions) {
  if (options.secret.length < 32) throw new Error('the OAuth secret must have at least 32 characters')
  const now = () => (options.now ?? (() => new Date()))().getTime()
  const log = options.log ?? (() => {})
  const resource = options.resource ?? MCP_OAUTH_RESOURCE
  const metadata = options.clientMetadata ?? createClientMetadataFetcher()
  const documents = new Map<string, { at: number; client: Client }>()
  const registrations = new Map<string, number[]>()
  const digest = (kind: 'oca' | 'ocr' | 'code' | 'consent', value: string) => createHmac('sha256', options.secret).update(`${kind}:${value}`).digest('hex')
  const random = (bytes = 32) => randomBytes(bytes).toString('base64url')

  /** The client a client_id names: a metadata document (read once a day at most) or a registration still in use. */
  async function resolveClient(id: string): Promise<Client | null> {
    if (DCR_ID.test(id)) {
      const registered = await options.store.client(id)
      return registered === null || registered.expiresAt <= now() ? null : { id, name: registered.name, redirectUris: registered.redirectUris, registered: true }
    }
    if (!id.startsWith('https://') || id.length > 512) return null
    let url: URL
    try { url = new URL(id) } catch { return null }
    if (url.pathname === '/' || url.hash || url.username || url.password) return null
    const cached = documents.get(id)
    if (cached && now() - cached.at < METADATA_CACHE_MS) return cached.client
    let document: unknown
    try { document = await metadata(id) } catch (error) {
      log({ event: 'w2l_oauth', step: 'client_metadata', outcome: 'unreadable', reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' })
      return null
    }
    const doc = (document ?? {}) as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown }
    // The document must name itself: another address's document is not this client.
    if (doc.client_id !== id || !Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0 || doc.redirect_uris.length > REDIRECTS_MAX || !doc.redirect_uris.every(acceptableRedirect)) {
      log({ event: 'w2l_oauth', step: 'client_metadata', outcome: 'invalid' })
      return null
    }
    const client = { id, name: cleanName(doc.client_name, url.hostname), redirectUris: doc.redirect_uris as string[], registered: false }
    while (documents.size >= 1_000) documents.delete(documents.keys().next().value as string)
    documents.set(id, { at: now(), client })
    return client
  }

  const json = (res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) =>
    res.writeHead(status, { ...NO_STORE, ...CORS, 'content-type': 'application/json; charset=utf-8', ...extra }).end(JSON.stringify(body))
  const oauthError = (res: ServerResponse, error: string, description: string, status = 400) => json(res, status, { error, error_description: description })
  const errorPage = (res: ServerResponse, status: number, title: string, message: string) => res.writeHead(status, PAGE_HEADERS).end(page(title, errorCard(title, message)))

  /** The client's callback with an answer, and `iss` (RFC 9207). */
  const answer = (redirectUri: string, origin: string, params: Record<string, string | null>) => {
    const target = new URL(redirectUri)
    for (const [name, value] of Object.entries(params)) if (value !== null) target.searchParams.set(name, value)
    target.searchParams.set('iss', origin)
    return target.href
  }
  /** Sends the browser back to the client, only once the signed-in person answered the consent form. */
  const back = (res: ServerResponse, redirectUri: string, origin: string, params: Record<string, string | null>) => {
    res.writeHead(302, { ...NO_STORE, location: answer(redirectUri, origin, params) }).end()
  }

  interface Request { client: Client; redirectUri: string; state: string | null; challenge: string; scope: string }
  /**
   * An authorization request's checks, in the order A4 sets: the client and its callback, then the rest. Every failure
   * is a page, never an automatic redirect: anyone can register a callback, so following it unasked would make this
   * site an open redirector (RFC 9700 §4.11.2). Past the callback's check, the page links to it with the error, so the
   * person can take the error back to the app.
   */
  async function checkRequest(params: URLSearchParams, res: ServerResponse, origin: string): Promise<Request | null> {
    const client = await resolveClient(params.get('client_id') ?? '')
    if (client === null) { errorPage(res, 400, 'This app cannot connect', 'Octocrawl does not know this app, or could not read its description. Go back to the app and try again.'); return null }
    const redirectUri = params.get('redirect_uri') ?? ''
    if (!redirectMatches(client.redirectUris, redirectUri)) { errorPage(res, 400, 'This app cannot connect', 'The app asked to send you back to an address it has not registered, so Octocrawl will not send you there.'); return null }
    const state = params.get('state')
    const refuse = (error: string, description: string) => {
      const link = answer(redirectUri, origin, { error, error_description: description, state })
      res.writeHead(400, PAGE_HEADERS).end(page('This app cannot connect', errorCard('This app cannot connect', `The app's request is not one Octocrawl can answer: ${description}.`, `<p class="oauth-message"><a href="${escape(link)}">Go back to ${escape(new URL(redirectUri).hostname)}</a></p>`)))
      return null
    }
    if (state !== null && state.length > 1_024) return refuse('invalid_request', 'state is too long')
    if (params.get('response_type') !== 'code') return refuse('unsupported_response_type', 'only response_type=code is supported')
    const challenge = params.get('code_challenge') ?? ''
    if (params.get('code_challenge_method') !== 'S256' || !CHALLENGE.test(challenge)) return refuse('invalid_request', 'PKCE with code_challenge_method=S256 is required')
    if (params.get('resource') !== resource) return refuse('invalid_target', `resource must be ${resource}`)
    const scope = params.get('scope') ?? ''
    if (scope !== '' && scope !== OAUTH_SCOPE) return refuse('invalid_scope', `the only scope is ${OAUTH_SCOPE}`)
    return { client, redirectUri, state, challenge, scope: OAUTH_SCOPE }
  }

  /** What a consent handle is bound to besides the session: the request it was shown for. */
  const requestHash = (request: Request) => createHash('sha256').update(JSON.stringify([request.client.id, request.redirectUri, request.state ?? '', request.challenge, resource, request.scope])).digest('base64url')
  const signHandle = (session: string, payload: string) => createHmac('sha256', options.secret).update(`consent:${session}:${payload}`).digest('base64url')
  const sessionOf = (req: IncomingMessage) => { const id = cookieValue(req, SESSION_COOKIE); return id === null ? '' : sessionHash(options.secret, id) }

  async function consentPage(res: ServerResponse, request: Request, session: Session, sessionKey: string) {
    const payload = Buffer.from(JSON.stringify({ n: random(16), e: now() + CONSENT_MS, p: requestHash(request) })).toString('base64url')
    const handle = `${payload}.${signHandle(sessionKey, payload)}`
    const target = new URL(request.redirectUri)
    const host = escape(target.hostname)
    const name = escape(request.client.name)
    const credits = await options.creditsLeft?.(session.uid).catch(() => null) ?? null
    const hidden = (field: string, value: string | null) => value === null ? '' : `<input type="hidden" name="${field}" value="${escape(value)}">`
    const initial = escape((request.client.name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase())
    const body = [
      `<div class="oauth-marks" aria-hidden="true">${OCTOCRAWL_MARK}<span class="oauth-link"></span><span class="oauth-mark is-client">${initial}</span></div>`,
      `<h1 class="oauth-title"><strong>${name}</strong> would like to connect to your Octocrawl account</h1>`,
      `<p class="oauth-sub">It will send you back to <strong>${host}</strong>.</p>`,
      LOOPBACK.has(target.hostname) ? `<p class="oauth-notice">This app runs on your computer: it sends you back to ${host} on this machine. Connect it only if you started this from an app you use.</p>` : '',
      '<div class="oauth-scopes"><p class="oauth-scopes-label">Your account will be used to:</p><ul>',
      '<li>Use Octocrawl\'s MCP tools, which read web pages and change nothing</li>',
      `<li>Spend your account's credits${credits === null ? '' : `: ${credits} credits left this month`}</li>`,
      `<li>Stay connected until you disconnect it, or until it goes ${IDLE_DAYS} days unused</li>`,
      '</ul></div>',
      '<form class="oauth-actions" method="post" action="/oauth/authorize">',
      hidden('handle', handle), hidden('client_id', request.client.id), hidden('redirect_uri', request.redirectUri), hidden('state', request.state),
      hidden('code_challenge', request.challenge), hidden('code_challenge_method', 'S256'), hidden('resource', resource), hidden('scope', request.scope), hidden('response_type', 'code'),
      '<button class="oauth-authorize" type="submit" name="decision" value="allow">Authorize</button><button class="oauth-decline" type="submit" name="decision" value="deny">Decline</button>',
      '</form>',
      `<div class="oauth-account">Signed in as <strong>${escape(session.email ?? 'your account')}</strong>. Not you? <form method="post" action="/auth/logout"><button type="submit">Sign out</button></form>`,
      '<p class="oauth-note">The connection is listed on your dashboard with its own activity, and you can disconnect it there.</p></div>',
    ].join('')
    res.writeHead(200, PAGE_HEADERS).end(page(`Connect ${request.client.name}`, body))
  }

  async function authorize(req: IncomingMessage, res: ServerResponse, url: URL, origin: string, sameOrigin: boolean) {
    if (req.method === 'GET') {
      const request = await checkRequest(url.searchParams, res, origin)
      if (request === null) return
      const session = await options.current(req)
      if (session === null) { res.writeHead(303, { ...NO_STORE, location: `/signin/?next=${encodeURIComponent(`${url.pathname}${url.search}`)}` }).end(); return }
      await consentPage(res, request, session, sessionOf(req))
      return
    }
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'GET, POST' }).end(); return }
    if (!sameOrigin) { res.writeHead(403, NO_STORE).end(); return }
    let form: URLSearchParams
    try {
      if (!isForm(req)) throw new Error('not a form')
      form = new URLSearchParams(await readBody(req))
    } catch { errorPage(res, 400, 'This page is out of date', 'Go back to the app and connect again.'); return }
    const session = await options.current(req)
    if (session === null) { errorPage(res, 401, 'You are signed out', 'Go back to the app and connect again: Octocrawl will ask you to sign in.'); return }
    // The form's request is checked again as a new one: a page left open, or edited, gets nothing it was not shown.
    const request = await checkRequest(form, res, origin)
    if (request === null) return
    const handle = form.get('handle') ?? ''
    const at = handle.lastIndexOf('.')
    const payload = at > 0 ? handle.slice(0, at) : ''
    const expected = Buffer.from(signHandle(sessionOf(req), payload))
    const given = Buffer.from(handle.slice(at + 1))
    let bound: { n?: unknown; e?: unknown; p?: unknown } = {}
    if (at > 0 && expected.length === given.length && timingSafeEqual(expected, given)) {
      try { bound = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { bound = {} }
    }
    const stale = typeof bound.n !== 'string' || typeof bound.e !== 'number' || bound.e <= now() || bound.p !== requestHash(request)
    if (stale || !(await options.store.useOnce(digest('consent', bound.n as string), bound.e as number))) {
      log({ event: 'w2l_oauth', step: 'consent', outcome: 'stale', client: request.client.id })
      errorPage(res, 400, 'This page is out of date', 'Go back to the app and connect again.')
      return
    }
    const decision = form.get('decision')
    if (decision === 'deny') {
      log({ event: 'w2l_oauth', step: 'consent', outcome: 'denied', client: request.client.id })
      back(res, request.redirectUri, origin, { error: 'access_denied', error_description: 'the account holder cancelled', state: request.state })
      return
    }
    if (decision !== 'allow') { errorPage(res, 400, 'This page is out of date', 'Go back to the app and connect again.'); return }
    const at2 = now()
    if (await options.store.activeGrants(session.uid, at2) >= MAX_CONNECTIONS) {
      log({ event: 'w2l_oauth', step: 'consent', outcome: 'too_many_connections', client: request.client.id })
      errorPage(res, 409, 'Too many connections', `Your account has ${MAX_CONNECTIONS} connections, the most it can hold. Disconnect one on your dashboard, then connect this app again.`)
      return
    }
    const grantId = random(18)
    const keyId = `oauth_${grantId}`
    const code = random()
    const redirectHost = new URL(request.redirectUri).hostname
    await options.store.connect({
      grantId, keyId, label: `${request.client.name} (${redirectHost})`.slice(0, 120), codeHash: digest('code', code),
      grant: { uid: session.uid, clientId: request.client.id, clientName: request.client.name, redirectHost, keyId, createdAt: at2, lastUsedAt: at2, revoked: false, connected: false },
      code: { uid: session.uid, grantId, clientId: request.client.id, redirectUri: request.redirectUri, challenge: request.challenge, resource, expiresAt: at2 + CODE_MS, used: false },
    })
    if (request.client.registered) await options.store.touchClient(request.client.id, at2 + IDLE_MS).catch(() => {})
    log({ event: 'w2l_oauth', step: 'consent', outcome: 'allowed', client: request.client.id })
    back(res, request.redirectUri, origin, { code, state: request.state })
  }

  /** A new access token and refresh token for a grant; null when a rotation lost a race, which the caller refuses. */
  async function issue(grantId: string, grant: GrantRecord, clientId: string, rotate?: Issue['rotate']) {
    const at = now()
    const access = `oca_${random()}`
    const refresh = `ocr_${random()}`
    const written = await options.store.issue({
      grantId, now: at, rotate,
      access: { hash: digest('oca', access), record: { keyId: grant.keyId, resource, expiresAt: at + ACCESS_TOKEN_SECONDS * 1000, grantId, uid: grant.uid } },
      refresh: { hash: digest('ocr', refresh), record: { grantId, uid: grant.uid, clientId, keyId: grant.keyId, resource, expiresAt: at + IDLE_MS, used: false } },
    })
    return written ? { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refresh, scope: OAUTH_SCOPE } : null
  }

  async function token(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') { res.writeHead(405, { ...CORS, allow: 'POST, OPTIONS' }).end(); return }
    let form: URLSearchParams
    try {
      if (!isForm(req)) throw new Error('not a form')
      form = new URLSearchParams(await readBody(req))
    } catch { oauthError(res, 'invalid_request', 'send the request as application/x-www-form-urlencoded'); return }
    const clientId = form.get('client_id') ?? ''
    const grantType = form.get('grant_type')
    const asked = form.get('resource')
    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') { oauthError(res, 'unsupported_grant_type', 'authorization_code and refresh_token only'); return }
    if (clientId === '') { oauthError(res, 'invalid_request', 'client_id is required'); return }
    // A client that also signs a client assertion (ChatGPT's document names private_key_jwt) is answered as the public
    // client this server registers it as; the assertion is not needed.
    if (grantType === 'authorization_code') {
      const code = form.get('code') ?? ''
      const verifier = form.get('code_verifier') ?? ''
      if (!SECRET_TOKEN.test(code) || !VERIFIER.test(verifier)) { oauthError(res, 'invalid_grant', 'the code or code_verifier is not valid'); return }
      const taken = await options.store.takeCode(digest('code', code))
      if (taken === null) { oauthError(res, 'invalid_grant', 'the code is not valid'); return }
      if (taken.replay) {
        await options.store.disconnect(taken.code.grantId)
        log({ event: 'w2l_oauth', step: 'token', outcome: 'code_replayed', client: taken.code.clientId })
        oauthError(res, 'invalid_grant', 'the code was already used; the connection it made is ended')
        return
      }
      const c = taken.code
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      if (c.expiresAt <= now() || c.clientId !== clientId || c.redirectUri !== form.get('redirect_uri') || (asked !== null && asked !== c.resource) || challenge !== c.challenge) {
        oauthError(res, 'invalid_grant', 'the code does not match this request, or it expired')
        return
      }
      const grant = await options.store.grant(c.grantId)
      if (grant === null || grant.revoked) { oauthError(res, 'invalid_grant', 'the connection was ended'); return }
      const tokens = await issue(c.grantId, grant, clientId)
      if (tokens === null) { oauthError(res, 'invalid_grant', 'the connection was ended'); return }
      log({ event: 'w2l_oauth', step: 'token', outcome: 'code', client: clientId })
      json(res, 200, tokens)
      return
    }
    const presented = form.get('refresh_token') ?? ''
    if (!/^ocr_[A-Za-z0-9_-]{43}$/.test(presented)) { oauthError(res, 'invalid_grant', 'the refresh token is not valid'); return }
    const hash = digest('ocr', presented)
    const record = await options.store.refresh(hash)
    if (record === null) { oauthError(res, 'invalid_grant', 'the refresh token is not valid'); return }
    if (record.used) {
      // A rotated refresh token came back: someone holds a copy. The connection ends for both.
      await options.store.disconnect(record.grantId)
      log({ event: 'w2l_oauth', step: 'token', outcome: 'refresh_replayed', client: record.clientId })
      oauthError(res, 'invalid_grant', 'the refresh token was already used; the connection is ended')
      return
    }
    if (record.clientId !== clientId || record.expiresAt <= now() || (asked !== null && asked !== record.resource)) { oauthError(res, 'invalid_grant', 'the refresh token does not match this request, or it expired'); return }
    const scope = form.get('scope')
    if (scope !== null && scope !== '' && scope !== OAUTH_SCOPE) { oauthError(res, 'invalid_scope', `the only scope is ${OAUTH_SCOPE}`); return }
    const grant = await options.store.grant(record.grantId)
    if (grant === null || grant.revoked || grant.lastUsedAt + IDLE_MS <= now()) { oauthError(res, 'invalid_grant', 'the connection was ended'); return }
    const tokens = await issue(record.grantId, grant, clientId, { hash, version: record.version })
    if (tokens === null) { oauthError(res, 'invalid_grant', 'the refresh token was just used'); return }
    json(res, 200, tokens)
  }

  async function revoke(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') { res.writeHead(405, { ...CORS, allow: 'POST, OPTIONS' }).end(); return }
    let form: URLSearchParams
    try {
      if (!isForm(req)) throw new Error('not a form')
      form = new URLSearchParams(await readBody(req))
    } catch { oauthError(res, 'invalid_request', 'send the request as application/x-www-form-urlencoded'); return }
    const presented = form.get('token') ?? ''
    const clientId = form.get('client_id')
    if (/^oca_[A-Za-z0-9_-]{43}$/.test(presented)) await options.store.deleteAccess(digest('oca', presented))
    else if (/^ocr_[A-Za-z0-9_-]{43}$/.test(presented)) {
      const record = await options.store.refresh(digest('ocr', presented))
      if (record !== null && (clientId === null || clientId === record.clientId)) {
        await options.store.disconnect(record.grantId)
        log({ event: 'w2l_oauth', step: 'revoke', outcome: 'disconnected', client: record.clientId })
      }
    }
    // RFC 7009 §2.2: an unknown or already revoked token is answered 200 too.
    json(res, 200, {})
  }

  async function register(req: IncomingMessage, res: ServerResponse, visitor: string) {
    if (req.method !== 'POST') { res.writeHead(405, { ...CORS, allow: 'POST, OPTIONS' }).end(); return }
    const at = now()
    const recent = (registrations.get(visitor) ?? []).filter(time => time > at - 3_600_000)
    if (recent.length >= REGISTRATIONS_PER_HOUR) { json(res, 429, { error: 'too_many_requests', error_description: 'too many registrations from this address; try again in an hour' }, { 'retry-after': '3600' }); return }
    while (registrations.size >= 10_000) registrations.delete(registrations.keys().next().value as string)
    registrations.delete(visitor)
    registrations.set(visitor, [...recent, at])
    let body: Record<string, unknown>
    try {
      if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new Error('not JSON')
      const parsed = JSON.parse(await readBody(req)) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      body = parsed as Record<string, unknown>
    } catch { oauthError(res, 'invalid_client_metadata', 'send the client metadata as a JSON object'); return }
    const uris = body.redirect_uris
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > REDIRECTS_MAX || !uris.every(acceptableRedirect)) {
      oauthError(res, 'invalid_redirect_uri', 'redirect_uris must be https addresses, or http on localhost or 127.0.0.1, without a fragment')
      return
    }
    if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== 'none') { oauthError(res, 'invalid_client_metadata', 'only public clients are registered: token_endpoint_auth_method must be none'); return }
    const grantTypes = body.grant_types
    if (grantTypes !== undefined && (!Array.isArray(grantTypes) || !grantTypes.every(type => type === 'authorization_code' || type === 'refresh_token'))) { oauthError(res, 'invalid_client_metadata', 'grant_types may be authorization_code and refresh_token'); return }
    const responseTypes = body.response_types
    if (responseTypes !== undefined && (!Array.isArray(responseTypes) || !responseTypes.every(type => type === 'code'))) { oauthError(res, 'invalid_client_metadata', 'response_types may be code'); return }
    const id = `occ_${random(18)}`
    const client: RegisteredClient = { name: cleanName(body.client_name, new URL(uris[0] as string).hostname), redirectUris: uris as string[], applicationType: body.application_type === 'native' ? 'native' : 'web', createdAt: at, expiresAt: at + IDLE_MS }
    await options.store.registerClient(id, client)
    log({ event: 'w2l_oauth', step: 'register', outcome: 'ok', client: id })
    json(res, 201, {
      client_id: id, client_id_issued_at: Math.floor(at / 1000), client_name: client.name, redirect_uris: client.redirectUris, application_type: client.applicationType,
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
    })
  }

  /**
   * Answers the authorization server's addresses and returns true, or returns false for any other path. `origin` is the
   * site's public origin, the issuer; `sameOrigin` says whether a POST came from this site's pages; `visitor` is the
   * address registrations are counted by.
   */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL, origin: string, sameOrigin: boolean, visitor: string): Promise<boolean> {
    const path = url.pathname
    const cors = path === '/.well-known/oauth-authorization-server' || path === '/oauth/token' || path === '/oauth/register' || path === '/oauth/revoke'
    if (!cors && path !== '/oauth/authorize') return false
    if (cors && req.method === 'OPTIONS') { res.writeHead(204, CORS).end(); return true }
    if (path === '/.well-known/oauth-authorization-server') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...CORS, allow: 'GET, OPTIONS' }).end(); return true }
      json(res, 200, {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, registration_endpoint: `${origin}/oauth/register`, revocation_endpoint: `${origin}/oauth/revoke`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: [OAUTH_SCOPE],
        client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true,
      })
      return true
    }
    if (path === '/oauth/authorize') await authorize(req, res, url, origin, sameOrigin)
    else if (path === '/oauth/token') await token(req, res)
    else if (path === '/oauth/revoke') await revoke(req, res)
    else await register(req, res, visitor)
    return true
  }

  return { handle }
}

/** The account page's view of its connections (account.ts, /api/account/connections). */
export function accountConnections(store: OAuthStore): Connections {
  return {
    async list(uid, now) {
      return (await store.grantsOf(uid)).filter(({ grant }) => live(grant, now.getTime())).sort((a, b) => b.grant.createdAt - a.grant.createdAt).map(({ id, grant }) => ({
        id, keyId: grant.keyId, name: grant.clientName, host: grant.redirectHost, createdAt: new Date(grant.createdAt).toISOString(), lastUsedAt: new Date(grant.lastUsedAt).toISOString(),
      }))
    },
    async disconnect(uid, id, now) {
      const grant = await store.grant(id)
      if (grant === null || grant.uid !== uid || !live(grant, now.getTime())) return false
      await store.disconnect(id)
      return true
    },
  }
}
