/**
 * Sign-in on octocrawl.dev (ROADMAP PH, decided 2026-10-11): GitHub, Google or an email link, through Firebase
 * Authentication's REST API (Identity Toolkit) called from this server. No Firebase script runs in the page, so the
 * site's CSP stays as it is, and the providers' client secrets stay in Firebase.
 *
 *   GET  /auth/github, /auth/google   asks Firebase for the provider's sign-in address and sends the browser there,
 *                                     with Firebase's session id in a short signed cookie
 *   GET  /__/auth/handler             where the provider sends the browser back: Firebase checks the answer
 *   POST /auth/email                  { email, next? }: Firebase sends a sign-in link to the address given; `next` is where the
 *                                     sign-in goes on when the link is opened in the same browser
 *   GET  /auth/email/finish           the link's page: a button, so a mail scanner that opens links signs no one in
 *   POST /auth/email/finish           signs in with the link's code
 *   POST /auth/logout                 ends the session
 *   POST /auth/delete/start           { confirm }: the signed-in account's own email address (or DELETE for one without);
 *                                     marks the account for deletion in a short signed cookie and asks for a sign-in
 *   GET  /api/me                      who is signed in, if anyone
 *
 * Deleting an account takes a fresh sign-in (decided by Howard on 2026-10-13): a stolen session cookie alone cannot
 * delete it, and the sign-in's ID token lets Firebase delete its own account without an admin role. When a sign-in
 * completes with the deletion cookie for the same account, the account's record and sessions go first (so a key the hosted
 * API still has cached cannot start a new balance: hostedCredits.ts, reserve), then its data (credits, keys, usage,
 * request lines), then the Firebase account. A failure before the last step leaves the Firebase account, so signing in
 * and deleting again finishes the job; a failure of the last step signs no one in, as the account may be gone.
 *
 * Firebase keeps one account per email address. A GitHub sign-in whose address already has an account (made with
 * Google or an email link) is not refused for good: its credential waits, encrypted in a short cookie, until the visitor
 * signs in the way they did before, in the same browser, with the same address; then GitHub is linked to that account.
 *
 * A sign-in ends in a session: a random id in an HttpOnly cookie, kept in Firestore under its HMAC with the account's
 * uid (Firebase's localId, which hostedCredits.ts keys credits by). Accounts are recorded in `users/{uid}`.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { metadataAccessToken } from './quota.js'
import { optedOut, readSourceCookie, SOURCE_COOKIE, sourceLabel, type FirstSource, type Logger } from './site.js'

export type Provider = 'github.com' | 'google.com' | 'emailLink'

export interface SignedIn {
  /** Firebase's id for the account: the key of its credits and keys. */
  uid: string
  email: string | null
  provider: Provider
  /** Firebase's ID token for this sign-in, used only to link a waiting way of signing in to the account, or to delete it. */
  idToken?: string
  /** Ways of signing in linked to the account during this sign-in, recorded with `provider`. */
  linked?: Provider[]
}

/** A provider's credential for an address that already has an account, waiting to be linked to it. */
export interface PendingLink { provider: 'github.com' | 'google.com'; email: string; accessToken: string }

/** Why a sign-in did not complete, as the page shows it. */
export type SignInError = 'cancelled' | 'other_provider' | 'expired' | 'invalid' | 'unavailable'

export class SignInRefused extends Error {
  constructor(readonly code: SignInError, message: string, readonly pending?: PendingLink) { super(message) }
}

export interface IdentityProvider {
  createAuthUri(provider: 'github.com' | 'google.com', continueUri: string): Promise<{ authUri: string; sessionId: string }>
  signInWithIdp(requestUri: string, sessionId: string): Promise<SignedIn>
  sendEmailLink(email: string, continueUrl: string): Promise<void>
  signInWithEmailLink(email: string, oobCode: string): Promise<SignedIn>
  /** Adds a provider's credential to the account the ID token belongs to. */
  linkIdp(idToken: string, link: PendingLink, requestUri: string): Promise<void>
  /** Deletes the account the ID token belongs to. */
  deleteAccount(idToken: string): Promise<void>
}

/** Firebase Authentication's REST API with the project's web API key (public: Firebase puts it in every web page). */
export class IdentityToolkit implements IdentityProvider {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(apiKey)) throw new Error('W2L_FIREBASE_API_KEY is malformed')
  }
  async createAuthUri(provider: 'github.com' | 'google.com', continueUri: string) {
    // Google answers with an ID token in the URL fragment by default, which never reaches a server: ask for a code instead.
    const google = provider === 'google.com' ? { authFlowType: 'CODE_FLOW', oauthScope: JSON.stringify({ 'google.com': 'openid email profile' }) } : {}
    const body = await this.call('accounts:createAuthUri', { providerId: provider, continueUri, ...google }) as { authUri?: string; sessionId?: string }
    if (!body.authUri || !body.sessionId) throw new SignInRefused('unavailable', 'Firebase gave no sign-in address')
    return { authUri: body.authUri, sessionId: body.sessionId }
  }
  async signInWithIdp(requestUri: string, sessionId: string): Promise<SignedIn> {
    const body = await this.call('accounts:signInWithIdp', { requestUri, sessionId, returnSecureToken: true, returnIdpCredential: true }) as
      { localId?: string; idToken?: string; email?: string; providerId?: string; needConfirmation?: boolean; errorMessage?: string; oauthAccessToken?: string }
    // The address already belongs to an account that signs in another way (Firebase links one account per email). The
    // provider's token comes with the answer, so the way can be linked once the visitor signs in as before.
    if (body.needConfirmation) {
      const pending = body.oauthAccessToken && body.email && (body.providerId === 'github.com' || body.providerId === 'google.com')
        ? { provider: body.providerId, email: body.email.toLowerCase(), accessToken: body.oauthAccessToken } as PendingLink
        : undefined
      throw new SignInRefused('other_provider', 'this email already signs in another way', pending)
    }
    if (body.errorMessage) throw new SignInRefused('cancelled', body.errorMessage)
    // No ID token means the sign-in is not complete (a second factor pending, say): no session for it.
    if (!body.localId || !body.idToken || (body.providerId !== 'github.com' && body.providerId !== 'google.com')) throw new SignInRefused('invalid', 'Firebase gave no account')
    return { uid: body.localId, email: body.email ?? null, provider: body.providerId, idToken: body.idToken }
  }
  async sendEmailLink(email: string, continueUrl: string) {
    await this.call('accounts:sendOobCode', { requestType: 'EMAIL_SIGNIN', email, continueUrl, canHandleCodeInApp: true })
  }
  async signInWithEmailLink(email: string, oobCode: string): Promise<SignedIn> {
    const body = await this.call('accounts:signInWithEmailLink', { email, oobCode }) as { localId?: string; idToken?: string; email?: string }
    if (!body.localId || !body.idToken) throw new SignInRefused('invalid', 'Firebase gave no account')
    return { uid: body.localId, email: body.email ?? email, provider: 'emailLink', idToken: body.idToken }
  }
  async linkIdp(idToken: string, link: PendingLink, requestUri: string) {
    const postBody = new URLSearchParams({ access_token: link.accessToken, providerId: link.provider }).toString()
    const body = await this.call('accounts:signInWithIdp', { idToken, postBody, requestUri, returnSecureToken: true }) as { localId?: string; needConfirmation?: boolean }
    if (!body.localId || body.needConfirmation) throw new SignInRefused('invalid', 'Firebase did not link the provider')
  }
  async deleteAccount(idToken: string) {
    await this.call('accounts:delete', { idToken })
  }
  private async call(method: string, payload: unknown): Promise<unknown> {
    const response = await this.fetcher(`https://identitytoolkit.googleapis.com/v1/${method}?key=${this.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
    })
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
    if (response.ok) return body
    const message = body.error?.message ?? `HTTP ${response.status}`
    // Firebase's messages name the case: an used or old link, a wrong code, a provider that refused.
    if (/EMAIL_EXISTS|FEDERATED_USER_ID_ALREADY_LINKED|NEED_CONFIRMATION/.test(message)) throw new SignInRefused('other_provider', message)
    if (/EXPIRED_OOB_CODE|INVALID_OOB_CODE/.test(message)) throw new SignInRefused('expired', message)
    if (/INVALID_EMAIL|MISSING_EMAIL|INVALID_IDP_RESPONSE|INVALID_CONTINUE_URI|MISSING_OR_INVALID_NONCE/.test(message)) throw new SignInRefused('invalid', message)
    if (/OPERATION_NOT_ALLOWED|QUOTA_EXCEEDED|TOO_MANY_ATTEMPTS/.test(message)) throw new SignInRefused('unavailable', message)
    throw new SignInRefused('unavailable', message)
  }
}

export interface Session { uid: string; email: string | null }

export interface AccountStore {
  /** Records the account (first sign-in time, latest one, the ways it signed in) and opens a session for it. */
  signIn(user: SignedIn, sessionHash: string, expiresAt: Date, now: Date): Promise<void>
  session(sessionHash: string, now: Date): Promise<Session | null>
  endSession(sessionHash: string): Promise<void>
  /** Deletes the account's record and every session it has. */
  forget(uid: string): Promise<void>
  /**
   * Writes how the account first reached the site (site.ts FirstSource) on its record, when the sign-in at `signedInAt`
   * made the account and the record has none yet: `not_new` for an account made before, `kept` for one that has a source.
   */
  recordFirstSource?(uid: string, source: FirstSource, signedInAt: Date): Promise<'recorded' | 'kept' | 'not_new'>
}

export class MemoryAccountStore implements AccountStore {
  readonly users = new Map<string, { email: string | null; providers: Set<Provider>; createdAt: Date; lastSignInAt: Date; firstSource?: FirstSource }>()
  readonly sessions = new Map<string, Session & { expiresAt: Date }>()
  async signIn(user: SignedIn, sessionHash: string, expiresAt: Date, now: Date) {
    const known = this.users.get(user.uid)
    this.users.set(user.uid, { ...known, email: user.email ?? known?.email ?? null, providers: new Set([...(known?.providers ?? []), user.provider, ...(user.linked ?? [])]), createdAt: known?.createdAt ?? now, lastSignInAt: now })
    this.sessions.set(sessionHash, { uid: user.uid, email: user.email, expiresAt })
  }
  async session(sessionHash: string, now: Date) {
    const found = this.sessions.get(sessionHash)
    return found && found.expiresAt > now ? { uid: found.uid, email: found.email } : null
  }
  async endSession(sessionHash: string) { this.sessions.delete(sessionHash) }
  async forget(uid: string) {
    this.users.delete(uid)
    for (const [hash, session] of this.sessions) if (session.uid === uid) this.sessions.delete(hash)
  }
  async recordFirstSource(uid: string, source: FirstSource, signedInAt: Date): Promise<'recorded' | 'kept' | 'not_new'> {
    const user = this.users.get(uid)
    if (user === undefined || user.createdAt.getTime() !== signedInAt.getTime()) return 'not_new'
    if (user.firstSource !== undefined) return 'kept'
    user.firstSource = source
    return 'recorded'
  }
}

/** `users/{uid}` and `sessions/{hmac}` in Firestore; a session document expires (TTL on `expireAt`) when its cookie does. */
export class FirestoreAccountStore implements AccountStore {
  private readonly resource: string
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    this.resource = `projects/${projectId}/databases/(default)/documents`
  }
  async signIn(user: SignedIn, sessionHash: string, expiresAt: Date, now: Date) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(user.uid) || /^__.*__$/.test(user.uid)) throw new Error('account id is malformed')
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    const fields = { lastSignInAt: { timestampValue: now.toISOString() }, ...(user.email === null ? {} : { email: { stringValue: user.email } }) }
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${this.resource}:commit`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ writes: [
        {
          update: { name: `${this.resource}/users/${user.uid}`, fields },
          updateMask: { fieldPaths: Object.keys(fields) },
          // The first sign-in time is kept (the smaller wins), and each way of signing in is added once.
          updateTransforms: [
            { fieldPath: 'createdAtMs', minimum: { integerValue: String(now.getTime()) } },
            { fieldPath: 'providers', appendMissingElements: { values: [user.provider, ...(user.linked ?? [])].map(stringValue => ({ stringValue })) } },
          ],
        },
        {
          update: { name: `${this.resource}/sessions/${sessionHash}`, fields: { uid: { stringValue: user.uid }, ...(user.email === null ? {} : { email: { stringValue: user.email } }), createdAt: { timestampValue: now.toISOString() }, expireAt: { timestampValue: expiresAt.toISOString() } } },
          currentDocument: { exists: false },
        },
      ] }),
    })
    if (!response.ok) throw new Error(`account commit failed (${response.status})`)
  }
  async session(sessionHash: string, now: Date): Promise<Session | null> {
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${this.resource}/sessions/${sessionHash}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`session read failed (${response.status})`)
    const doc = await response.json() as { fields?: Record<string, { stringValue?: string; timestampValue?: string }> }
    const uid = doc.fields?.uid?.stringValue
    const expireAt = Date.parse(doc.fields?.expireAt?.timestampValue ?? '')
    // Firestore's TTL deletes an expired document within a day or so; until then the time here decides.
    if (!uid || !(expireAt > now.getTime())) return null
    return { uid, email: doc.fields?.email?.stringValue ?? null }
  }
  async endSession(sessionHash: string) {
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${this.resource}/sessions/${sessionHash}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    if (!response.ok && response.status !== 404) throw new Error(`session delete failed (${response.status})`)
  }
  async forget(uid: string) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid) || /^__.*__$/.test(uid)) throw new Error('account id is malformed')
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    const call = async (path: string, body: unknown) => {
      const response = await this.fetcher(`https://firestore.googleapis.com/v1/${this.resource}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) })
      if (!response.ok) throw new Error(`account delete failed (${response.status})`)
      return response.json() as Promise<unknown>
    }
    // The account's sessions by its uid (a single-field equality, no composite index), deleted with its record.
    const rows = await call(':runQuery', { structuredQuery: { from: [{ collectionId: 'sessions' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } }, limit: 500 } }) as Array<{ document?: { name: string } }>
    const names = [`${this.resource}/users/${uid}`, ...rows.flatMap(row => row.document ? [row.document.name] : [])]
    await call(':commit', { writes: names.map(name => ({ delete: name })) })
  }
  async recordFirstSource(uid: string, source: FirstSource, signedInAt: Date): Promise<'recorded' | 'kept' | 'not_new'> {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid) || /^__.*__$/.test(uid)) throw new Error('account id is malformed')
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    const name = `https://firestore.googleapis.com/v1/${this.resource}/users/${uid}`
    const read = await this.fetcher(`${name}?mask.fieldPaths=createdAtMs&mask.fieldPaths=firstSource`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    if (read.status === 404) return 'not_new'
    if (!read.ok) throw new Error(`account read failed (${read.status})`)
    const doc = await read.json() as { fields?: { createdAtMs?: { integerValue?: string }; firstSource?: unknown }; updateTime?: string }
    if (doc.fields?.firstSource !== undefined) return 'kept'
    // signIn() set createdAtMs to the smaller of what it held and this sign-in's time: equal only when this sign-in made it.
    if (Number(doc.fields?.createdAtMs?.integerValue) !== signedInAt.getTime() || !doc.updateTime) return 'not_new'
    const fields = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, { stringValue: value }]))
    // Under the update time just read, so a source another sign-in wrote meanwhile is never replaced.
    const write = await this.fetcher(`${name}?updateMask.fieldPaths=firstSource&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`, {
      method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ fields: { firstSource: { mapValue: { fields } } } }),
    })
    if (write.ok) return 'recorded'
    if (write.status === 400 || write.status === 409 || write.status === 412) return 'kept'
    throw new Error(`account source write failed (${write.status})`)
  }
}

export interface AuthOptions {
  identity: IdentityProvider
  accounts: AccountStore
  /** HMAC key for session ids and the short cookies: W2L_QUOTA_HASH_KEY. */
  secret: string
  log?: Logger
  now?: () => Date
  /** The site's page for an email link (apps/public-web builds /signin/email/), with the form going between its
   * `<!--w2l:email-finish-->` markers; null, or no markers, gives a plain page. */
  emailFinishPage?: () => Promise<string | null>
  /** Deletes the account's data that is not sign-in's own: keys, credits, usage, request lines (account.ts, erase).
   * Without it, accounts cannot be deleted here. */
  eraseAccountData?: (uid: string) => Promise<void>
  /** This month's free credits, kept across deleting an account and signing up again with the same email address
   * (account.ts, rememberCredits and carryCredits), so deleting cannot restart the month's grant. Each takes the
   * account's uid and its email address's key (creditCarryKey). */
  creditCarry?: { remember(uid: string, emailKey: string): Promise<void>; carry(uid: string, emailKey: string): Promise<void> }
}

/** The key a remembered month of credits is kept under: a keyed hash of the email address, never the address. */
export function creditCarryKey(secret: string, email: string): string {
  return createHmac('sha256', secret).update(`credit-carry:${email.trim().toLowerCase()}`).digest('hex')
}

export const SESSION_COOKIE = 'w2l_session'
const OAUTH_COOKIE = 'w2l_oauth'
const EMAIL_COOKIE = 'w2l_signin_email'
/** Where an email sign-in goes on, as the provider buttons carry it in their state: an OAuth authorization, say. */
const NEXT_COOKIE = 'w2l_signin_next'
const ACCOUNT_HINT_COOKIE = 'w2l_account'
const LINK_COOKIE = 'w2l_link'
const DELETE_COOKIE = 'w2l_delete'
/** How long a deletion waits for its sign-in. */
const DELETE_SECONDS = 600
/** How long a waiting credential is kept: time to sign in the other way, or to ask for and open an email link. */
const LINK_SECONDS = 1_800
export const SESSION_DAYS = 30
/** Sign-in links one network address, or one email address, may ask for an hour on one instance: a typo and a retry. */
const EMAIL_LINKS_PER_HOUR = 3
/** Links the whole instance sends an hour and a day, far under Firebase's project quota (25,000 a day), so no one
 * caller can use the day's sign-in emails up for everyone. */
const EMAIL_LINKS_SITE_PER_HOUR = 100
const EMAIL_LINKS_SITE_PER_DAY = 500
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }

export function cookieValue(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1)
  return raw === undefined || raw === '' ? null : raw
}
function sign(secret: string, purpose: string, payload: string): string {
  return `${payload}.${createHmac('sha256', secret).update(`${purpose}:${payload}`).digest('base64url')}`
}
function verify(secret: string, purpose: string, value: string | null): string | null {
  if (value === null) return null
  const at = value.lastIndexOf('.')
  if (at < 1) return null
  const payload = value.slice(0, at)
  const expected = Buffer.from(sign(secret, purpose, payload).slice(at + 1))
  const given = Buffer.from(value.slice(at + 1))
  return expected.length === given.length && timingSafeEqual(expected, given) ? payload : null
}
/** AES-256-GCM under a key drawn from the secret: the provider's token is the visitor's own, but stays unreadable in the cookie. */
function seal(secret: string, value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', createHmac('sha256', secret).update('link-cookie').digest(), iv)
  const sealed = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url')
}
function unseal(secret: string, value: string | null): string | null {
  if (value === null || !/^[A-Za-z0-9_-]{40,4000}$/.test(value)) return null
  try {
    const raw = Buffer.from(value, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', createHmac('sha256', secret).update('link-cookie').digest(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  } catch { return null }
}
export function sessionHash(secret: string, id: string): string { return createHmac('sha256', secret).update(`session:${id}`).digest('hex') }

/** A path on this site to come back to; anything else (another host, `//host`, a backslash) is the dashboard. Long
 * enough for an OAuth authorization request (oauth.ts), whose query carries a client's URL, a challenge and its state. */
export function safeNext(value: string | null | undefined): string {
  return typeof value === 'string' && /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]{0,2000}$/.test(value) ? value : '/dashboard/'
}

function cookie(origin: string, name: string, value: string, path: string, maxAgeSeconds: number): string {
  const secure = origin.startsWith('https:') ? '; Secure' : ''
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
}

/** `w2l_account=1`, readable by the page: only a hint for the header's label, never trusted by the server. */
function hintCookie(origin: string, signedIn: boolean): string {
  const secure = origin.startsWith('https:') ? '; Secure' : ''
  return `${ACCOUNT_HINT_COOKIE}=${signedIn ? '1' : ''}; Path=/; SameSite=Lax; Max-Age=${signedIn ? SESSION_DAYS * 86_400 : 0}${secure}`
}

function page(title: string, body: string): string {
  // The site's own stylesheet; no inline style or script, as the CSP allows neither.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Octocrawl</title><link rel="stylesheet" href="/docs-assets/docs.css"></head><body><main class="doc-article auth-page"><h1>${title}</h1>${body}</main></body></html>`
}
const escape = (value: string) => value.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)

async function readForm(req: IncomingMessage, limit = 4_096): Promise<URLSearchParams> {
  const type = (req.headers['content-type'] ?? '').toLowerCase()
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += next.length
    if (length > limit) throw new Error('too large')
    chunks.push(next)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (type.startsWith('application/json')) {
    const body = JSON.parse(text) as Record<string, unknown>
    return new URLSearchParams(Object.entries(body).filter(([, v]) => typeof v === 'string') as [string, string][])
  }
  if (type.startsWith('application/x-www-form-urlencoded')) return new URLSearchParams(text)
  throw new Error('unsupported body')
}

/**
 * The sign-in routes. `handle` answers a request it owns and returns true, or returns false for any other path.
 * `origin` is the site's public origin (https://octocrawl.dev), which the provider calls back on; `sameOrigin` says
 * whether a POST came from this site's own pages; `visitor` is the key rate limits count by.
 */
export function createAuthRoutes(options: AuthOptions) {
  if (options.secret.length < 32) throw new Error('the auth secret must have at least 32 characters')
  const now = options.now ?? (() => new Date())
  const log = options.log ?? (() => {})
  const sent = new Map<string, number[]>()
  const siteSent: number[] = []
  /** Whether every key may send one more link now; records the send against all of them only when all may. */
  const sendAllowed = (keys: string[], at: number) => {
    while (siteSent.length > 0 && siteSent[0]! <= at - 86_400_000) siteSent.shift()
    if (siteSent.length >= EMAIL_LINKS_SITE_PER_DAY || siteSent.filter(time => time > at - 3_600_000).length >= EMAIL_LINKS_SITE_PER_HOUR) return false
    const recent = keys.map(key => (sent.get(key) ?? []).filter(time => time > at - 3_600_000))
    if (recent.some(times => times.length >= EMAIL_LINKS_PER_HOUR)) return false
    // The oldest callers are forgotten first, never everyone at once.
    while (sent.size >= 10_000) sent.delete(sent.keys().next().value as string)
    keys.forEach((key, i) => { sent.delete(key); sent.set(key, [...recent[i]!, at]) })
    siteSent.push(at)
    return true
  }

  /** Links a waiting way of signing in when this sign-in is the same address's account signed in another way. A link
   * that fails, or does not match, still lets the sign-in through; the cookie goes either way. */
  async function linkWaiting(req: IncomingMessage, origin: string, user: SignedIn): Promise<SignedIn> {
    const raw = unseal(options.secret, cookieValue(req, LINK_COOKIE))
    if (raw === null) return user
    let pending: (PendingLink & { e: number }) | null = null
    try { pending = JSON.parse(raw) } catch { pending = null }
    if (pending === null || typeof pending.accessToken !== 'string' || !(pending.e > now().getTime()) || pending.provider === user.provider || user.email?.toLowerCase() !== pending.email || !user.idToken) {
      log({ event: 'w2l_auth', step: 'link', provider: pending?.provider ?? 'unknown', outcome: 'skipped' })
      return user
    }
    try {
      await options.identity.linkIdp(user.idToken, { provider: pending.provider, email: pending.email, accessToken: pending.accessToken }, `${origin}/__/auth/handler`)
      log({ event: 'w2l_auth', step: 'link', provider: pending.provider, outcome: 'ok' })
      return { ...user, linked: [pending.provider] }
    } catch (error) {
      log({ event: 'w2l_auth', step: 'link', provider: pending.provider, outcome: error instanceof SignInRefused ? error.code : 'unavailable' })
      return user
    }
  }

  async function startSession(res: ServerResponse, origin: string, user: SignedIn, extraCookies: string[] = [], source: FirstSource | null = null): Promise<void> {
    const id = randomBytes(32).toString('base64url')
    const at = now()
    const expiresAt = new Date(at.getTime() + SESSION_DAYS * 86_400_000)
    await options.accounts.signIn(user, sessionHash(options.secret, id), expiresAt, at)
    // How a new account first reached the site (GTM gate R5); a failure here never stops the sign-in.
    if (source !== null && options.accounts.recordFirstSource) {
      const outcome = await options.accounts.recordFirstSource(user.uid, source, at).catch((error: unknown) => {
        log({ event: 'w2l_auth', step: 'first_source', outcome: 'failed', reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' })
        return null
      })
      if (outcome === 'recorded') log({ event: 'w2l_auth', step: 'first_source', outcome, source: sourceLabel(source) })
    }
    // A new account for an address whose account was deleted this month goes on with that month's free credits.
    if (options.creditCarry && user.email) {
      await options.creditCarry.carry(user.uid, creditCarryKey(options.secret, user.email)).catch((error: unknown) => {
        log({ event: 'w2l_auth', step: 'credit_carry', outcome: 'failed', reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' })
      })
    }
    res.setHeader('set-cookie', [cookie(origin, SESSION_COOKIE, id, '/', SESSION_DAYS * 86_400), hintCookie(origin, true), ...extraCookies])
  }

  /** What a sign-in knows of how its browser first reached the site: the `w2l_src` cookie, and whether it is on its way
   * to an MCP client's authorization (oauth.ts). Null when it knows neither, so most sign-ins of an existing account read
   * nothing more, and for a visitor who sent Do Not Track or Global Privacy Control. */
  function signInSource(req: IncomingMessage, next: string): FirstSource | null {
    if (optedOut(req)) return null
    const cookie = readSourceCookie(req)
    const mcp = next.startsWith('/oauth/authorize')
    return cookie === null && !mcp ? null : { ...cookie, ...(mcp ? { via: 'mcp-oauth' } : {}) }
  }

  /** The account a deletion is waiting to delete, from its signed cookie; null when there is none or it is old. */
  function pendingDeletion(req: IncomingMessage): string | null {
    const raw = verify(options.secret, 'delete', cookieValue(req, DELETE_COOKIE))
    if (raw === null) return null
    try {
      const { u, e } = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { u?: unknown; e?: unknown }
      return typeof u === 'string' && typeof e === 'number' && e > now().getTime() ? u : null
    } catch { return null }
  }

  /**
   * Where a sign-in ends: a session and the way on, or, when a deletion is waiting for this account, the deletion. A
   * deletion that fails before Firebase's step signs the visitor in and says so on Settings, so they can try again; one
   * that fails at Firebase's step signs no one in. `clear` are the sign-in's own cookies to remove either way.
   */
  async function finishSignIn(req: IncomingMessage, res: ServerResponse, origin: string, user: SignedIn, clearOwn: string[], next: string): Promise<void> {
    const source = signInSource(req, next)
    // The source cookie has done its work once the browser is signed in.
    const clear = [...clearOwn, ...(cookieValue(req, SOURCE_COOKIE) === null ? [] : [cookie(origin, SOURCE_COOKIE, '', '/', 0)])]
    const deleting = pendingDeletion(req)
    if (deleting === null) {
      await startSession(res, origin, user, clear, source)
      res.writeHead(303, { ...NO_STORE, location: next }).end()
      return
    }
    const clearDelete = cookie(origin, DELETE_COOKIE, '', '/', 0)
    if (deleting !== user.uid || !user.idToken || options.eraseAccountData === undefined) {
      log({ event: 'w2l_auth', step: 'delete', outcome: deleting !== user.uid ? 'other_account' : 'unavailable' })
      await startSession(res, origin, user, [...clear, clearDelete], source)
      res.writeHead(303, { ...NO_STORE, location: `/dashboard/settings/?delete=${deleting !== user.uid ? 'other_account' : 'failed'}` }).end()
      return
    }
    try {
      await options.accounts.forget(user.uid)
      // Before the balance goes: what is left of this month's free credits, under the address's key.
      if (options.creditCarry && user.email) await options.creditCarry.remember(user.uid, creditCarryKey(options.secret, user.email))
      await options.eraseAccountData(user.uid)
    } catch (error) {
      log({ event: 'w2l_auth', step: 'delete', outcome: 'failed', reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' })
      await startSession(res, origin, user, [...clear, clearDelete])
      res.writeHead(303, { ...NO_STORE, location: '/dashboard/settings/?delete=failed' }).end()
      return
    }
    try { await options.identity.deleteAccount(user.idToken) } catch (error) {
      // Firebase may have deleted the account and not said so in time: a new session would write a record for an
      // account that may be gone. Signing in again shows which: an account still there signs in, and deleting it again
      // finishes the job.
      log({ event: 'w2l_auth', step: 'delete', outcome: 'firebase_failed', reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' })
      res.writeHead(303, { ...NO_STORE, location: '/signin/?error=delete_unfinished', 'set-cookie': [...clear, clearDelete, cookie(origin, SESSION_COOKIE, '', '/', 0), hintCookie(origin, false)] }).end()
      return
    }
    log({ event: 'w2l_auth', step: 'delete', outcome: 'ok' })
    res.writeHead(303, { ...NO_STORE, location: '/signin/?deleted=1', 'set-cookie': [...clear, clearDelete, cookie(origin, SESSION_COOKIE, '', '/', 0), hintCookie(origin, false)] }).end()
  }

  async function current(req: IncomingMessage): Promise<Session | null> {
    const id = cookieValue(req, SESSION_COOKIE)
    if (id === null || !/^[A-Za-z0-9_-]{43}$/.test(id)) return null
    return options.accounts.session(sessionHash(options.secret, id), now())
  }

  /** `visitor` is the caller's network address (behind the Worker, CF-Connecting-IP), never a cookie a caller can mint. */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL, origin: string, sameOrigin: boolean, visitor: string): Promise<boolean> {
    const path = url.pathname
    const fail = (code: SignInError, provider: string, error?: unknown) => {
      // Firebase's own message says why (a wrong client secret reads INVALID_IDP_RESPONSE); any email address in it is cut.
      const reason = error instanceof Error ? error.message.replace(/[^\s@]+@[^\s@]+/g, '<email>').slice(0, 200) : undefined
      log({ event: 'w2l_auth', step: 'sign_in', provider, outcome: code, ...(reason === undefined ? {} : { reason }) })
      res.writeHead(303, { ...NO_STORE, location: `/signin/?error=${code}` }).end()
    }

    if (path === '/auth/github' || path === '/auth/google') {
      if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }).end(); return true }
      const provider = path === '/auth/github' ? 'github.com' : 'google.com'
      try {
        const { authUri, sessionId } = await options.identity.createAuthUri(provider, `${origin}/__/auth/handler`)
        const state = Buffer.from(JSON.stringify({ s: sessionId, p: provider, n: safeNext(url.searchParams.get('next')), e: now().getTime() + 600_000 })).toString('base64url')
        res.writeHead(302, { ...NO_STORE, location: authUri, 'set-cookie': cookie(origin, OAUTH_COOKIE, sign(options.secret, 'oauth', state), '/__/auth', 600) }).end()
      } catch { fail('unavailable', provider) }
      return true
    }

    if (path === '/__/auth/handler') {
      if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }).end(); return true }
      const raw = verify(options.secret, 'oauth', cookieValue(req, OAUTH_COOKIE))
      const clearOauth = cookie(origin, OAUTH_COOKIE, '', '/__/auth', 0)
      let state: { s: string; p: string; n: string; e: number } | null = null
      try { state = raw === null ? null : JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) } catch { state = null }
      if (state === null || typeof state.s !== 'string' || !(state.e > now().getTime())) { res.setHeader('set-cookie', clearOauth); fail('expired', 'unknown'); return true }
      if (url.searchParams.has('error')) { res.setHeader('set-cookie', clearOauth); fail('cancelled', state.p); return true }
      try {
        const user = await linkWaiting(req, origin, await options.identity.signInWithIdp(`${origin}${path}${url.search}`, state.s))
        log({ event: 'w2l_auth', step: 'sign_in', provider: user.provider, outcome: 'ok' })
        await finishSignIn(req, res, origin, user, [clearOauth, cookie(origin, LINK_COOKIE, '', '/', 0)], user.linked ? `/dashboard/?linked=${user.linked[0] === 'github.com' ? 'github' : 'google'}` : safeNext(state.n))
      } catch (error) {
        if (error instanceof SignInRefused && error.pending) {
          // Kept until the visitor signs in the way they did before; the page says so.
          const waiting = seal(options.secret, JSON.stringify({ ...error.pending, e: now().getTime() + LINK_SECONDS * 1_000 }))
          res.setHeader('set-cookie', [clearOauth, cookie(origin, LINK_COOKIE, waiting, '/', LINK_SECONDS)])
          log({ event: 'w2l_auth', step: 'sign_in', provider: error.pending.provider, outcome: 'link_needed' })
          res.writeHead(303, { ...NO_STORE, location: `/signin/?error=link_needed&provider=${error.pending.provider === 'github.com' ? 'github' : 'google'}` }).end()
          return true
        }
        res.setHeader('set-cookie', clearOauth)
        fail(error instanceof SignInRefused ? error.code : 'unavailable', state.p, error)
      }
      return true
    }

    if (path === '/auth/email') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      if (!sameOrigin) { res.writeHead(403, NO_STORE).end(); return true }
      let email = ''
      let next: string | null = null
      try {
        const form = await readForm(req)
        email = form.get('email')?.trim().toLowerCase() ?? ''
        next = form.get('next')
      } catch { email = '' }
      if (!EMAIL.test(email)) { res.writeHead(400, { ...NO_STORE, 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_email' })); return true }
      const at = now().getTime()
      if (!sendAllowed([`a:${visitor}`, `e:${email}`], at)) { res.writeHead(429, { ...NO_STORE, 'content-type': 'application/json' }).end(JSON.stringify({ error: 'too_many_requests' })); return true }
      try {
        await options.identity.sendEmailLink(email, `${origin}/auth/email/finish`)
        log({ event: 'w2l_auth', step: 'email_link', outcome: 'sent' })
        // A way on that is not a path on this site is not kept: the sign-in then goes to the dashboard.
        const keepNext = next !== null && next !== '/dashboard/' && safeNext(next) === next ? [cookie(origin, NEXT_COOKIE, sign(options.secret, 'next', Buffer.from(next).toString('base64url')), '/auth/email', 3_600)] : []
        res.writeHead(200, { ...NO_STORE, 'content-type': 'application/json', 'set-cookie': [cookie(origin, EMAIL_COOKIE, sign(options.secret, 'email', Buffer.from(email).toString('base64url')), '/auth/email', 3_600), ...keepNext] })
          .end(JSON.stringify({ sent: true }))
      } catch (error) {
        log({ event: 'w2l_auth', step: 'email_link', outcome: error instanceof SignInRefused ? error.code : 'unavailable' })
        res.writeHead(error instanceof SignInRefused && error.code === 'invalid' ? 400 : 503, { ...NO_STORE, 'content-type': 'application/json' }).end(JSON.stringify({ error: 'not_sent' }))
      }
      return true
    }

    if (path === '/auth/email/finish') {
      const remembered = verify(options.secret, 'email', cookieValue(req, EMAIL_COOKIE))
      const rememberedEmail = remembered === null ? null : Buffer.from(remembered, 'base64url').toString('utf8')
      if (req.method === 'GET') {
        const code = url.searchParams.get('oobCode') ?? ''
        if (!/^[A-Za-z0-9_-]{10,400}$/.test(code)) { res.writeHead(303, { ...NO_STORE, location: '/signin/?error=invalid' }).end(); return true }
        // Opening the link signs no one in: a mail scanner that follows it would use the code up. The button does.
        // Another browser has no record of the address: the visitor types it, as Firebase checks the two belong together.
        const emailField = rememberedEmail === null
          ? '<label for="finish-email">The email address the link was sent to<input id="finish-email" type="email" name="email" required autocomplete="email" maxlength="254"></label>'
          : `<p>Signing in as <strong>${escape(rememberedEmail)}</strong></p><input type="hidden" name="email" value="${escape(rememberedEmail)}">`
        const form = `<form class="account-form" method="post" action="/auth/email/finish">${emailField}<input type="hidden" name="oobCode" value="${escape(code)}"><button class="account-button" type="submit">Continue to your account</button></form>`
        const site = await options.emailFinishPage?.().catch(() => null) ?? null
        const marked = site?.match(/<!--w2l:email-finish-->[\s\S]*?<!--\/w2l:email-finish-->/)
        res.writeHead(200, { ...NO_STORE, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'" })
          .end(site && marked ? site.replace(marked[0], () => form) : page('Finish signing in', form))
        return true
      }
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'GET, POST' }).end(); return true }
      if (!sameOrigin) { res.writeHead(403, NO_STORE).end(); return true }
      let form: URLSearchParams
      try { form = await readForm(req) } catch { fail('invalid', 'emailLink'); return true }
      const email = form.get('email')?.trim().toLowerCase() ?? ''
      const code = form.get('oobCode') ?? ''
      if (!EMAIL.test(email) || !/^[A-Za-z0-9_-]{10,400}$/.test(code)) { fail('invalid', 'emailLink'); return true }
      try {
        const user = await linkWaiting(req, origin, await options.identity.signInWithEmailLink(email, code))
        log({ event: 'w2l_auth', step: 'sign_in', provider: 'emailLink', outcome: 'ok' })
        const kept = verify(options.secret, 'next', cookieValue(req, NEXT_COOKIE))
        const next = safeNext(kept === null ? null : Buffer.from(kept, 'base64url').toString('utf8'))
        await finishSignIn(req, res, origin, user, [cookie(origin, EMAIL_COOKIE, '', '/auth/email', 0), cookie(origin, NEXT_COOKIE, '', '/auth/email', 0), cookie(origin, LINK_COOKIE, '', '/', 0)], user.linked ? `/dashboard/?linked=${user.linked[0] === 'github.com' ? 'github' : 'google'}` : next)
      } catch (error) { fail(error instanceof SignInRefused ? error.code : 'unavailable', 'emailLink', error) }
      return true
    }

    if (path === '/auth/logout') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      if (!sameOrigin) { res.writeHead(403, NO_STORE).end(); return true }
      const id = cookieValue(req, SESSION_COOKIE)
      if (id !== null && /^[A-Za-z0-9_-]{43}$/.test(id)) await options.accounts.endSession(sessionHash(options.secret, id)).catch(() => {})
      // Signing out also drops a deletion still waiting for its sign-in, so a later sign-in cannot delete by surprise.
      const pending = cookieValue(req, DELETE_COOKIE) === null ? [] : [cookie(origin, DELETE_COOKIE, '', '/', 0)]
      res.writeHead(303, { ...NO_STORE, location: '/', 'set-cookie': [cookie(origin, SESSION_COOKIE, '', '/', 0), hintCookie(origin, false), ...pending] }).end()
      return true
    }

    if (path === '/auth/delete/start') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      if (!sameOrigin) { res.writeHead(403, NO_STORE).end(); return true }
      const json = (status: number, body: unknown, extra: Record<string, string> = {}) => res.writeHead(status, { ...NO_STORE, 'content-type': 'application/json', ...extra }).end(JSON.stringify(body))
      if (options.eraseAccountData === undefined) { json(503, { error: 'unavailable' }); return true }
      let session: Session | null
      try { session = await current(req) } catch { json(503, { error: 'unavailable' }); return true }
      if (session === null) { json(401, { error: 'signed_out' }); return true }
      let confirm = ''
      try { confirm = (await readForm(req)).get('confirm')?.trim() ?? '' } catch { confirm = '' }
      // The account's own address, typed; an account Firebase gave no address confirms with the word DELETE.
      const expected = session.email === null ? 'DELETE' : session.email.toLowerCase()
      if ((session.email === null ? confirm : confirm.toLowerCase()) !== expected) { json(400, { error: 'confirm_mismatch' }); return true }
      const marked = sign(options.secret, 'delete', Buffer.from(JSON.stringify({ u: session.uid, e: now().getTime() + DELETE_SECONDS * 1_000 })).toString('base64url'))
      log({ event: 'w2l_auth', step: 'delete', outcome: 'started' })
      json(200, { next: '/signin/?reauth=delete' }, { 'set-cookie': cookie(origin, DELETE_COOKIE, marked, '/', DELETE_SECONDS) })
      return true
    }

    if (path === '/api/me') {
      if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }).end(); return true }
      let session: Session | null
      try { session = await current(req) } catch { res.writeHead(503, { ...NO_STORE, 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unavailable' })); return true }
      res.writeHead(200, { ...NO_STORE, 'content-type': 'application/json' }).end(JSON.stringify(session === null ? { signedIn: false } : { signedIn: true, uid: session.uid, email: session.email }))
      return true
    }
    return false
  }

  return { handle, current }
}
