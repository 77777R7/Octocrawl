/**
 * Sign-in on octocrawl.dev (ROADMAP PH, decided 2026-10-11): GitHub, Google or an email link, through Firebase
 * Authentication's REST API (Identity Toolkit) called from this server. No Firebase script runs in the page, so the
 * site's CSP stays as it is, and the providers' client secrets stay in Firebase.
 *
 *   GET  /auth/github, /auth/google   asks Firebase for the provider's sign-in address and sends the browser there,
 *                                     with Firebase's session id in a short signed cookie
 *   GET  /__/auth/handler             where the provider sends the browser back: Firebase checks the answer
 *   POST /auth/email                  Firebase sends a sign-in link to the address given
 *   GET  /auth/email/finish           the link's page: a button, so a mail scanner that opens links signs no one in
 *   POST /auth/email/finish           signs in with the link's code
 *   POST /auth/logout                 ends the session
 *   GET  /api/me                      who is signed in, if anyone
 *
 * A sign-in ends in a session: a random id in an HttpOnly cookie, kept in Firestore under its HMAC with the account's
 * uid (Firebase's localId, which hostedCredits.ts keys credits by). Accounts are recorded in `users/{uid}`.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { metadataAccessToken } from './quota.js'
import type { Logger } from './site.js'

export type Provider = 'github.com' | 'google.com' | 'emailLink'

export interface SignedIn {
  /** Firebase's id for the account: the key of its credits and keys. */
  uid: string
  email: string | null
  provider: Provider
}

/** Why a sign-in did not complete, as the page shows it. */
export type SignInError = 'cancelled' | 'other_provider' | 'expired' | 'invalid' | 'unavailable'

export class SignInRefused extends Error {
  constructor(readonly code: SignInError, message: string) { super(message) }
}

export interface IdentityProvider {
  createAuthUri(provider: 'github.com' | 'google.com', continueUri: string): Promise<{ authUri: string; sessionId: string }>
  signInWithIdp(requestUri: string, sessionId: string): Promise<SignedIn>
  sendEmailLink(email: string, continueUrl: string): Promise<void>
  signInWithEmailLink(email: string, oobCode: string): Promise<SignedIn>
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
    const body = await this.call('accounts:signInWithIdp', { requestUri, sessionId, returnSecureToken: true }) as
      { localId?: string; idToken?: string; email?: string; providerId?: string; needConfirmation?: boolean; errorMessage?: string }
    // The address already belongs to an account that signs in another way (Firebase links one account per email).
    if (body.needConfirmation) throw new SignInRefused('other_provider', 'this email already signs in another way')
    if (body.errorMessage) throw new SignInRefused('cancelled', body.errorMessage)
    // No ID token means the sign-in is not complete (a second factor pending, say): no session for it.
    if (!body.localId || !body.idToken || (body.providerId !== 'github.com' && body.providerId !== 'google.com')) throw new SignInRefused('invalid', 'Firebase gave no account')
    return { uid: body.localId, email: body.email ?? null, provider: body.providerId }
  }
  async sendEmailLink(email: string, continueUrl: string) {
    await this.call('accounts:sendOobCode', { requestType: 'EMAIL_SIGNIN', email, continueUrl, canHandleCodeInApp: true })
  }
  async signInWithEmailLink(email: string, oobCode: string): Promise<SignedIn> {
    const body = await this.call('accounts:signInWithEmailLink', { email, oobCode }) as { localId?: string; idToken?: string; email?: string }
    if (!body.localId || !body.idToken) throw new SignInRefused('invalid', 'Firebase gave no account')
    return { uid: body.localId, email: body.email ?? email, provider: 'emailLink' }
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
}

export class MemoryAccountStore implements AccountStore {
  readonly users = new Map<string, { email: string | null; providers: Set<Provider>; createdAt: Date; lastSignInAt: Date }>()
  readonly sessions = new Map<string, Session & { expiresAt: Date }>()
  async signIn(user: SignedIn, sessionHash: string, expiresAt: Date, now: Date) {
    const known = this.users.get(user.uid)
    this.users.set(user.uid, { email: user.email ?? known?.email ?? null, providers: new Set([...(known?.providers ?? []), user.provider]), createdAt: known?.createdAt ?? now, lastSignInAt: now })
    this.sessions.set(sessionHash, { uid: user.uid, email: user.email, expiresAt })
  }
  async session(sessionHash: string, now: Date) {
    const found = this.sessions.get(sessionHash)
    return found && found.expiresAt > now ? { uid: found.uid, email: found.email } : null
  }
  async endSession(sessionHash: string) { this.sessions.delete(sessionHash) }
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
            { fieldPath: 'providers', appendMissingElements: { values: [{ stringValue: user.provider }] } },
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
}

export interface AuthOptions {
  identity: IdentityProvider
  accounts: AccountStore
  /** HMAC key for session ids and the short cookies: W2L_QUOTA_HASH_KEY. */
  secret: string
  log?: Logger
  now?: () => Date
}

export const SESSION_COOKIE = 'w2l_session'
const OAUTH_COOKIE = 'w2l_oauth'
const EMAIL_COOKIE = 'w2l_signin_email'
export const SESSION_DAYS = 30
/** Sign-in links one network address, or one email address, may ask for an hour on one instance: a typo and a retry. */
const EMAIL_LINKS_PER_HOUR = 3
/** Links the whole instance sends an hour and a day, far under Firebase's project quota (25,000 a day), so no one
 * caller can use the day's sign-in emails up for everyone. */
const EMAIL_LINKS_SITE_PER_HOUR = 100
const EMAIL_LINKS_SITE_PER_DAY = 500
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }

function cookieValue(req: IncomingMessage, name: string): string | null {
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
export function sessionHash(secret: string, id: string): string { return createHmac('sha256', secret).update(`session:${id}`).digest('hex') }

/** A path on this site to come back to; anything else (another host, `//host`, a backslash) is the account page. */
export function safeNext(value: string | null | undefined): string {
  return typeof value === 'string' && /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]{0,300}$/.test(value) ? value : '/account/'
}

function cookie(origin: string, name: string, value: string, path: string, maxAgeSeconds: number): string {
  const secure = origin.startsWith('https:') ? '; Secure' : ''
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
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

  async function startSession(res: ServerResponse, origin: string, user: SignedIn, extraCookies: string[] = []): Promise<void> {
    const id = randomBytes(32).toString('base64url')
    const at = now()
    const expiresAt = new Date(at.getTime() + SESSION_DAYS * 86_400_000)
    await options.accounts.signIn(user, sessionHash(options.secret, id), expiresAt, at)
    res.setHeader('set-cookie', [cookie(origin, SESSION_COOKIE, id, '/', SESSION_DAYS * 86_400), ...extraCookies])
  }

  async function current(req: IncomingMessage): Promise<Session | null> {
    const id = cookieValue(req, SESSION_COOKIE)
    if (id === null || !/^[A-Za-z0-9_-]{43}$/.test(id)) return null
    return options.accounts.session(sessionHash(options.secret, id), now())
  }

  /** `visitor` is the caller's network address (behind the Worker, CF-Connecting-IP), never a cookie a caller can mint. */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL, origin: string, sameOrigin: boolean, visitor: string): Promise<boolean> {
    const path = url.pathname
    const fail = (code: SignInError, provider: string) => {
      log({ event: 'w2l_auth', step: 'sign_in', provider, outcome: code })
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
        const user = await options.identity.signInWithIdp(`${origin}${path}${url.search}`, state.s)
        await startSession(res, origin, user, [clearOauth])
        log({ event: 'w2l_auth', step: 'sign_in', provider: user.provider, outcome: 'ok' })
        res.writeHead(303, { ...NO_STORE, location: safeNext(state.n) }).end()
      } catch (error) {
        res.setHeader('set-cookie', clearOauth)
        fail(error instanceof SignInRefused ? error.code : 'unavailable', state.p)
      }
      return true
    }

    if (path === '/auth/email') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      if (!sameOrigin) { res.writeHead(403, NO_STORE).end(); return true }
      let email = ''
      try { email = (await readForm(req)).get('email')?.trim().toLowerCase() ?? '' } catch { email = '' }
      if (!EMAIL.test(email)) { res.writeHead(400, { ...NO_STORE, 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_email' })); return true }
      const at = now().getTime()
      if (!sendAllowed([`a:${visitor}`, `e:${email}`], at)) { res.writeHead(429, { ...NO_STORE, 'content-type': 'application/json' }).end(JSON.stringify({ error: 'too_many_requests' })); return true }
      try {
        await options.identity.sendEmailLink(email, `${origin}/auth/email/finish`)
        log({ event: 'w2l_auth', step: 'email_link', outcome: 'sent' })
        res.writeHead(200, { ...NO_STORE, 'content-type': 'application/json', 'set-cookie': cookie(origin, EMAIL_COOKIE, sign(options.secret, 'email', Buffer.from(email).toString('base64url')), '/auth/email', 3_600) })
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
        const emailField = rememberedEmail === null
          ? '<p>Enter the email address the link was sent to.</p><p><label>Email <input type="email" name="email" required autocomplete="email"></label></p>'
          : `<p>Sign in as <strong>${escape(rememberedEmail)}</strong>.</p><input type="hidden" name="email" value="${escape(rememberedEmail)}">`
        res.writeHead(200, { ...NO_STORE, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'none'; form-action 'self'; frame-ancestors 'none'" })
          .end(page('Sign in to Octocrawl', `<form method="post" action="/auth/email/finish">${emailField}<input type="hidden" name="oobCode" value="${escape(code)}"><p><button type="submit">Sign in</button></p></form>`))
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
        const user = await options.identity.signInWithEmailLink(email, code)
        await startSession(res, origin, user, [cookie(origin, EMAIL_COOKIE, '', '/auth/email', 0)])
        log({ event: 'w2l_auth', step: 'sign_in', provider: 'emailLink', outcome: 'ok' })
        res.writeHead(303, { ...NO_STORE, location: '/account/' }).end()
      } catch (error) { fail(error instanceof SignInRefused ? error.code : 'unavailable', 'emailLink') }
      return true
    }

    if (path === '/auth/logout') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return true }
      if (!sameOrigin) { res.writeHead(403, NO_STORE).end(); return true }
      const id = cookieValue(req, SESSION_COOKIE)
      if (id !== null && /^[A-Za-z0-9_-]{43}$/.test(id)) await options.accounts.endSession(sessionHash(options.secret, id)).catch(() => {})
      res.writeHead(303, { ...NO_STORE, location: '/', 'set-cookie': cookie(origin, SESSION_COOKIE, '', '/', 0) }).end()
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
