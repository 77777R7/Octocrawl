import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreviewServer } from '../src/server.js'
import { MemoryAccountData } from '../src/account.js'
import { createAuthRoutes, creditCarryKey, FirestoreAccountStore, IdentityToolkit, MemoryAccountStore, safeNext, SignInRefused, type AuthOptions, type IdentityProvider, type SignedIn } from '../src/auth.js'
import type { LogLine } from '../src/site.js'

const SECRET = 's'.repeat(40)
const servers: Server[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** Firebase's Identity Toolkit as this test drives it: what it was asked, and what it answers. */
function fakeIdentity() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  let idp: SignedIn | Error = { uid: 'github-user-0001', email: 'ada@example.org', provider: 'github.com' }
  let link: SignedIn | Error = { uid: 'email-user-0001', email: 'ada@example.org', provider: 'emailLink' }
  const identity: IdentityProvider = {
    async createAuthUri(provider, continueUri) { calls.push({ method: 'createAuthUri', args: [provider, continueUri] }); return { authUri: `https://${provider}/authorize?redirect_uri=${encodeURIComponent(continueUri)}`, sessionId: 'firebase-session-1' } },
    async signInWithIdp(requestUri, sessionId) { calls.push({ method: 'signInWithIdp', args: [requestUri, sessionId] }); if (idp instanceof Error) throw idp; return idp },
    async sendEmailLink(email, continueUrl) { calls.push({ method: 'sendEmailLink', args: [email, continueUrl] }) },
    async signInWithEmailLink(email, oobCode) { calls.push({ method: 'signInWithEmailLink', args: [email, oobCode] }); if (link instanceof Error) throw link; return link },
    async linkIdp(idToken, pending, requestUri) { calls.push({ method: 'linkIdp', args: [idToken, pending, requestUri] }) },
    async deleteAccount(idToken) { calls.push({ method: 'deleteAccount', args: [idToken] }) },
  }
  return { identity, calls, answer: (next: SignedIn | Error) => { idp = next }, linkAnswer: (next: SignedIn | Error) => { link = next } }
}

async function start(emailFinishPage?: () => Promise<string | null>, eraseAccountData?: (uid: string) => Promise<void>, now?: () => Date, creditCarry?: AuthOptions['creditCarry']) {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-auth-')); dirs.push(dir)
  await writeFile(join(dir, '404.html'), '<title>Page not found</title>')
  const fake = fakeIdentity()
  const accounts = new MemoryAccountStore()
  const lines: LogLine[] = []
  const auth = createAuthRoutes({ identity: fake.identity, accounts, secret: SECRET, log: line => lines.push(line), emailFinishPage, ...(eraseAccountData ? { eraseAccountData } : {}), ...(now ? { now } : {}), ...(creditCarry ? { creditCarry } : {}) })
  const server = createPreviewServer({ quota: { consume: async () => 'ok' }, staticDir: dir, amazonState: null, log: line => lines.push(line), visitorCookieSecret: SECRET, auth })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, fake, accounts, lines }
}

/** The `name=value` pairs a response set, by name. */
function cookies(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.getSetCookie().map(line => line.split(';')[0]!.split('=')).map(([name, ...rest]) => [name!, rest.join('=')]))
}

describe('signing in with GitHub or Google', () => {
  it('sends the browser to the provider, then opens a session on the way back and goes where it was going', async () => {
    const { url, fake, accounts } = await start()
    const begin = await fetch(`${url}/auth/github?next=/dashboard/keys/`, { redirect: 'manual' })
    expect(begin.status).toBe(302)
    expect(begin.headers.get('location')).toBe(`https://github.com/authorize?redirect_uri=${encodeURIComponent(`${url}/__/auth/handler`)}`)
    expect(begin.headers.get('cache-control')).toBe('no-store')
    const oauth = begin.headers.getSetCookie()[0]!
    expect(oauth).toMatch(/^w2l_oauth=[^;]+; Path=\/__\/auth; HttpOnly; SameSite=Lax; Max-Age=600$/)
    const back = await fetch(`${url}/__/auth/handler?code=abc&state=xyz`, { redirect: 'manual', headers: { cookie: oauth.split(';')[0]! } })
    expect(back.status).toBe(303)
    expect(back.headers.get('location')).toBe('/dashboard/keys/')
    expect(fake.calls.find(call => call.method === 'signInWithIdp')!.args).toEqual([`${url}/__/auth/handler?code=abc&state=xyz`, 'firebase-session-1'])
    const session = cookies(back).w2l_session!
    expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(back.headers.getSetCookie().find(line => line.startsWith('w2l_session='))).toMatch(/Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/)
    expect(accounts.users.get('github-user-0001')).toMatchObject({ email: 'ada@example.org', providers: new Set(['github.com']) })
    const me = await fetch(`${url}/api/me`, { headers: { cookie: `w2l_session=${session}` } })
    expect(await me.json()).toEqual({ signedIn: true, uid: 'github-user-0001', email: 'ada@example.org' })
    expect((await (await fetch(`${url}/api/me`)).json())).toEqual({ signedIn: false })
  })

  it('refuses a way back it did not start, a forged or old state cookie, a cancelled sign-in and an address that signs in another way', async () => {
    const { url, fake, lines } = await start()
    const noState = await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual' })
    expect([noState.status, noState.headers.get('location')]).toEqual([303, '/signin/?error=expired'])
    const forged = await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: 'w2l_oauth=eyJzIjoieCJ9.bad' } })
    expect(forged.headers.get('location')).toBe('/signin/?error=expired')
    const begin = async () => (await fetch(`${url}/auth/google`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    const cancelled = await fetch(`${url}/__/auth/handler?error=access_denied`, { redirect: 'manual', headers: { cookie: await begin() } })
    expect(cancelled.headers.get('location')).toBe('/signin/?error=cancelled')
    fake.answer(new SignInRefused('other_provider', 'linked'))
    const other = await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: await begin() } })
    expect(other.headers.get('location')).toBe('/signin/?error=other_provider')
    expect(cookies(other).w2l_session).toBeUndefined()
    expect(fake.calls.filter(call => call.method === 'signInWithIdp')).toHaveLength(1)
    // Firebase's reason goes into the log line, without the email address it may name.
    fake.answer(new SignInRefused('invalid', 'INVALID_IDP_RESPONSE : bad_verification_code for ada@example.org'))
    await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: await begin() } })
    expect(lines.at(-1)).toMatchObject({ event: 'w2l_auth', provider: 'google.com', outcome: 'invalid', reason: 'INVALID_IDP_RESPONSE : bad_verification_code for <email>' })
  })

  it('keeps a GitHub sign-in for an address that has an account, and links it when the account signs in as before', async () => {
    const { url, fake, accounts, lines } = await start()
    const begin = async (provider: string) => (await fetch(`${url}/auth/${provider}`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    const pending = { provider: 'github.com' as const, email: 'ada@example.org', accessToken: 'gho_secret_token' }
    fake.answer(new SignInRefused('other_provider', 'this email already signs in another way', pending))
    const refused = await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: await begin('github') } })
    expect([refused.status, refused.headers.get('location')]).toEqual([303, '/signin/?error=link_needed&provider=github'])
    expect(cookies(refused).w2l_session).toBeUndefined()
    const waiting = cookies(refused).w2l_link!
    expect(refused.headers.getSetCookie().find(line => line.startsWith('w2l_link='))).toMatch(/; Path=\/; HttpOnly; SameSite=Lax; Max-Age=1800$/)
    // The token is sealed, not just signed: the cookie does not carry it, nor the address, readably.
    expect(Buffer.from(waiting, 'base64url').toString('latin1')).not.toMatch(/gho_secret_token|ada@example/)
    // A sign-in as a different address keeps its own account and links nothing.
    fake.answer({ uid: 'google-user-0002', email: 'bob@example.org', provider: 'google.com', idToken: 'bob-token' })
    const other = await fetch(`${url}/__/auth/handler?code=def`, { redirect: 'manual', headers: { cookie: `${await begin('google')}; w2l_link=${waiting}` } })
    expect(other.headers.get('location')).toBe('/dashboard/')
    expect(fake.calls.some(call => call.method === 'linkIdp')).toBe(false)
    expect(cookies(other).w2l_link).toBe('')
    // The same address, signed in with Google as before: GitHub is linked to that account, and the account page says so.
    fake.answer({ uid: 'google-user-0001', email: 'Ada@example.org', provider: 'google.com', idToken: 'ada-token' })
    const linked = await fetch(`${url}/__/auth/handler?code=ghi`, { redirect: 'manual', headers: { cookie: `${await begin('google')}; w2l_link=${waiting}` } })
    expect([linked.status, linked.headers.get('location')]).toEqual([303, '/dashboard/?linked=github'])
    expect(fake.calls.at(-1)).toEqual({ method: 'linkIdp', args: ['ada-token', pending, `${url}/__/auth/handler`] })
    expect(cookies(linked).w2l_link).toBe('')
    expect(accounts.users.get('google-user-0001')?.providers).toEqual(new Set(['google.com', 'github.com']))
    expect(lines).toContainEqual(expect.objectContaining({ event: 'w2l_auth', step: 'link', provider: 'github.com', outcome: 'ok' }))
    // A forged or tampered cookie links nothing.
    const linksBefore = fake.calls.filter(call => call.method === 'linkIdp').length
    await fetch(`${url}/__/auth/handler?code=jkl`, { redirect: 'manual', headers: { cookie: `${await begin('google')}; w2l_link=${waiting.slice(0, -4)}AAAA` } })
    expect(fake.calls.filter(call => call.method === 'linkIdp')).toHaveLength(linksBefore)
  })

  it('links a waiting GitHub sign-in when the account signs in with an email link', async () => {
    const { url, fake, accounts } = await start()
    fake.answer(new SignInRefused('other_provider', 'linked', { provider: 'github.com', email: 'ada@example.org', accessToken: 'gho_token' }))
    const oauth = (await fetch(`${url}/auth/github`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    const waiting = cookies(await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: oauth } })).w2l_link!
    fake.linkAnswer({ uid: 'email-user-0001', email: 'ada@example.org', provider: 'emailLink', idToken: 'ada-token' })
    const signed = await fetch(`${url}/auth/email/finish`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: url, cookie: `w2l_link=${waiting}` }, body: 'email=ada%40example.org&oobCode=code-0123456789' })
    expect(signed.headers.get('location')).toBe('/dashboard/?linked=github')
    expect(accounts.users.get('email-user-0001')?.providers).toEqual(new Set(['emailLink', 'github.com']))
  })

  it('keeps the way back on this site: another host or a protocol-relative path is the dashboard', () => {
    expect(safeNext('/blog/')).toBe('/blog/')
    for (const unsafe of ['//evil.example/', 'https://evil.example/', '/\\evil.example', 'blog', null, undefined, '/a b', '/é']) expect(safeNext(unsafe), String(unsafe)).toBe('/dashboard/')
  })
})

describe('signing in with an email link', () => {
  it('puts the confirmation form into the site\'s own page for the link, between its markers', async () => {
    const site = '<header>Octocrawl</header><div class="account-panel"><!--w2l:email-finish--><p>Open the link</p><!--/w2l:email-finish--></div><script src="/docs-assets/nav.js"></script>'
    const { url } = await start(async () => site)
    const html = await (await fetch(`${url}/auth/email/finish?oobCode=code-0123456789`)).text()
    expect(html).toMatch(/^<header>Octocrawl<\/header><div class="account-panel"><form class="account-form" method="post" action="\/auth\/email\/finish">.*<input type="hidden" name="oobCode" value="code-0123456789">.*<\/form><\/div><script/)
    expect(html).not.toContain('Open the link')
    // Without the site's page (not built, or no markers) the form still comes, on a plain page.
    for (const missing of [async () => null, async () => '<p>no markers</p>', async () => { throw new Error('ENOENT') }]) {
      const { url: other } = await start(missing)
      expect(await (await fetch(`${other}/auth/email/finish?oobCode=code-0123456789`)).text()).toContain('<h1>Finish signing in</h1><form class="account-form"')
    }
  })

  it('sends a link, shows a button on the link\'s page instead of signing in, and signs in from the button', async () => {
    const { url, fake, accounts } = await start()
    const sent = await fetch(`${url}/auth/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ email: ' Ada@Example.org ' }) })
    expect(sent.status).toBe(200)
    expect(fake.calls.at(-1)).toEqual({ method: 'sendEmailLink', args: ['ada@example.org', `${url}/auth/email/finish`] })
    const remembered = cookies(sent).w2l_signin_email!
    // Opening the link (a person, or a mail scanner) only shows the page.
    const opened = await fetch(`${url}/auth/email/finish?mode=signIn&oobCode=code-0123456789&apiKey=x`, { headers: { cookie: `w2l_signin_email=${remembered}` } })
    const html = await opened.text()
    expect(opened.status).toBe(200)
    expect(html).toContain('Signing in as <strong>ada@example.org</strong>')
    expect(html).not.toContain('style=')
    expect(opened.headers.get('content-security-policy')).toContain("form-action 'self'")
    expect(fake.calls.some(call => call.method === 'signInWithEmailLink')).toBe(false)
    // On another device the address is asked for.
    expect(await (await fetch(`${url}/auth/email/finish?oobCode=code-0123456789`)).text()).toContain('The email address the link was sent to')
    const signed = await fetch(`${url}/auth/email/finish`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: url }, body: 'email=ada%40example.org&oobCode=code-0123456789' })
    expect([signed.status, signed.headers.get('location')]).toEqual([303, '/dashboard/'])
    expect(fake.calls.at(-1)).toEqual({ method: 'signInWithEmailLink', args: ['ada@example.org', 'code-0123456789'] })
    expect(cookies(signed).w2l_session).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(accounts.users.get('email-user-0001')?.providers).toEqual(new Set(['emailLink']))
  })

  it('refuses another site\'s form, a bad address, a used link, and a fourth link an hour', async () => {
    const { url, fake } = await start()
    const send = (email: string, origin = url) => fetch(`${url}/auth/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email }) })
    expect((await send('ada@example.org', 'https://evil.example')).status).toBe(403)
    expect((await send('not an address')).status).toBe(400)
    for (let i = 0; i < 3; i++) expect((await send(`ada${i}@example.org`)).status).toBe(200)
    expect((await send('ada9@example.org')).status).toBe(429)
    // A fresh visitor cookie does not reset it: the count is the network address's.
    const fresh = await fetch(`${url}/auth/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url, cookie: 'w2l_visitor=' + 'a'.repeat(32) + '.' + 'b'.repeat(64) }, body: JSON.stringify({ email: 'ada10@example.org' }) })
    expect(fresh.status).toBe(429)
    fake.linkAnswer(new SignInRefused('expired', 'EXPIRED_OOB_CODE'))
    const used = await fetch(`${url}/auth/email/finish`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: url }, body: 'email=ada%40example.org&oobCode=code-0123456789' })
    expect(used.headers.get('location')).toBe('/signin/?error=expired')
    const crossSite = await fetch(`${url}/auth/email/finish`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, body: 'email=ada%40example.org&oobCode=code-0123456789' })
    expect(crossSite.status).toBe(403)
  })
})

describe('sessions', () => {
  it('ends a session on sign-out, and a sign-out from another site is refused', async () => {
    const { url, accounts } = await start()
    const begin = (await fetch(`${url}/auth/github`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    const session = cookies(await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: begin } })).w2l_session!
    expect(accounts.sessions.size).toBe(1)
    expect((await fetch(`${url}/auth/logout`, { method: 'POST', redirect: 'manual', headers: { cookie: `w2l_session=${session}`, origin: 'https://evil.example' } })).status).toBe(403)
    // A browser names the request's site in Sec-Fetch-Site: another site's form is refused, even with a matching Origin.
    expect((await fetch(`${url}/auth/logout`, { method: 'POST', redirect: 'manual', headers: { cookie: `w2l_session=${session}`, origin: url, 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await fetch(`${url}/auth/logout`, { method: 'POST', redirect: 'manual', headers: { cookie: `w2l_session=${session}`, origin: url, 'sec-fetch-site': 'same-site' } })).status).toBe(403)
    expect(accounts.sessions.size).toBe(1)
    // The site's own form: under its no-referrer policy the browser sends Origin: null, and Sec-Fetch-Site same-origin.
    const own = await fetch(`${url}/auth/logout`, { method: 'POST', redirect: 'manual', headers: { cookie: `w2l_session=${session}`, origin: 'null', 'sec-fetch-site': 'same-origin' } })
    expect(own.status).toBe(303)
    expect(accounts.sessions.size).toBe(0)
    const again = cookies(await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: (await fetch(`${url}/auth/github`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]! } })).w2l_session!
    const out = await fetch(`${url}/auth/logout`, { method: 'POST', redirect: 'manual', headers: { cookie: `w2l_session=${again}`, origin: url } })
    expect([out.status, out.headers.get('location')]).toEqual([303, '/'])
    expect(out.headers.getSetCookie()).toEqual(['w2l_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', 'w2l_account=; Path=/; SameSite=Lax; Max-Age=0'])
    expect(accounts.sessions.size).toBe(0)
    expect(await (await fetch(`${url}/api/me`, { headers: { cookie: `w2l_session=${again}` } })).json()).toEqual({ signedIn: false })
  })

  it('without sign-in configured, its addresses are ordinary paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-auth-off-')); dirs.push(dir)
    await writeFile(join(dir, '404.html'), '<title>Page not found</title>')
    const server = createPreviewServer({ quota: { consume: async () => 'ok' }, staticDir: dir, amazonState: null, log: () => {} })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    expect((await fetch(`${base}/api/me`)).status).toBe(404)
    expect((await fetch(`${base}/auth/github`, { redirect: 'manual' })).status).toBe(404)
  })
})

describe('deleting an account', () => {
  /** Signs in with GitHub (the fake's answer) and returns the session cookie. */
  const signIn = async (url: string) => {
    const begin = (await fetch(`${url}/auth/github`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    return `w2l_session=${cookies(await fetch(`${url}/__/auth/handler?code=abc`, { redirect: 'manual', headers: { cookie: begin } })).w2l_session!}`
  }
  const startDeletion = (url: string, session: string, confirm: string, headers: Record<string, string> = { origin: url }) =>
    fetch(`${url}/auth/delete/start`, { method: 'POST', headers: { cookie: session, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ confirm }) })
  /** Signs in again through GitHub with the deletion cookie, as the sign-in page sends the visitor. */
  const signInAgain = async (url: string, deletion: string) => {
    const begin = (await fetch(`${url}/auth/github?next=/dashboard/settings/`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    return fetch(`${url}/__/auth/handler?code=again`, { redirect: 'manual', headers: { cookie: `${begin}; w2l_delete=${deletion}` } })
  }

  it('needs a session, the site\'s own request and the account\'s own address, then asks for a sign-in', async () => {
    const erased: string[] = []
    const { url } = await start(undefined, async uid => { erased.push(uid) })
    const session = await signIn(url)
    expect((await startDeletion(url, '', 'ada@example.org')).status).toBe(401)
    expect((await startDeletion(url, session, 'ada@example.org', { origin: 'https://evil.example' })).status).toBe(403)
    const wrong = await startDeletion(url, session, 'eve@example.org')
    expect([wrong.status, await wrong.json()]).toEqual([400, { error: 'confirm_mismatch' }])
    const started = await startDeletion(url, session, ' ADA@example.org ')
    expect([started.status, await started.json()]).toEqual([200, { next: '/signin/?reauth=delete' }])
    expect(started.headers.getSetCookie()[0]).toMatch(/^w2l_delete=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600$/)
    // Starting deletes nothing: the sign-in does.
    expect(erased).toEqual([])
  })

  it('deletes the account when the same account signs in again: its record and sessions, its data, then Firebase\'s account', async () => {
    const order: string[] = []
    const { url, fake, accounts, lines } = await start(undefined, async uid => { order.push(`erase ${uid}`) })
    fake.answer({ uid: 'github-user-0001', email: 'ada@example.org', provider: 'github.com', idToken: 'id-token-1' })
    const session = await signIn(url)
    const deletion = cookies(await startDeletion(url, session, 'ada@example.org')).w2l_delete!
    const forget = accounts.forget.bind(accounts)
    accounts.forget = async uid => { order.push(`forget ${uid}`); await forget(uid) }
    const deleteAccount = fake.identity.deleteAccount.bind(fake.identity)
    fake.identity.deleteAccount = async token => { order.push(`firebase ${token}`); await deleteAccount(token) }
    const done = await signInAgain(url, deletion)
    expect([done.status, done.headers.get('location')]).toEqual([303, '/signin/?deleted=1'])
    // The record first, so a cached key cannot start a new balance (hostedCredits.ts); Firebase's account last.
    expect(order).toEqual(['forget github-user-0001', 'erase github-user-0001', 'firebase id-token-1'])
    expect(accounts.users.has('github-user-0001')).toBe(false)
    expect(accounts.sessions.size).toBe(0)
    // Signed out, and the deletion cookie is gone.
    const set = cookies(done)
    expect([set.w2l_session, set.w2l_account, set.w2l_delete]).toEqual(['', '', ''])
    expect(await (await fetch(`${url}/api/me`, { headers: { cookie: session } })).json()).toEqual({ signedIn: false })
    expect(lines.filter(line => line.step === 'delete').map(line => line.outcome)).toEqual(['started', 'ok'])
  })

  it('deletes nothing when another account signs in, or a forged or old cookie comes back, and says so on Settings', async () => {
    const erased: string[] = []
    let clock = Date.now()
    const { url, fake } = await start(undefined, async uid => { erased.push(uid) }, () => new Date(clock))
    fake.answer({ uid: 'github-user-0001', email: 'ada@example.org', provider: 'github.com', idToken: 'id-token-1' })
    const deletion = cookies(await startDeletion(url, await signIn(url), 'ada@example.org')).w2l_delete!
    fake.answer({ uid: 'github-user-0002', email: 'bob@example.org', provider: 'github.com', idToken: 'id-token-2' })
    const other = await signInAgain(url, deletion)
    expect([other.status, other.headers.get('location')]).toEqual([303, '/dashboard/settings/?delete=other_account'])
    expect(cookies(other).w2l_session).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cookies(other).w2l_delete).toBe('')
    // A cookie this server did not sign is no deletion at all: an ordinary sign-in.
    fake.answer({ uid: 'github-user-0001', email: 'ada@example.org', provider: 'github.com', idToken: 'id-token-1' })
    const forged = await signInAgain(url, `${deletion.slice(0, -4)}AAAA`)
    expect(forged.headers.get('location')).toBe('/dashboard/settings/')
    // Nor is one more than ten minutes old.
    const old = cookies(await startDeletion(url, await signIn(url), 'ada@example.org')).w2l_delete!
    clock += 601_000
    expect((await signInAgain(url, old)).headers.get('location')).toBe('/dashboard/settings/')
    expect(erased).toEqual([])
    expect(fake.calls.some(call => call.method === 'deleteAccount')).toBe(false)
  })

  it('signs the visitor in and says so when the deletion fails part way, keeping Firebase\'s account so it can run again', async () => {
    let fail = true
    const { url, fake } = await start(undefined, async () => { if (fail) throw new Error('commit failed (503)') })
    fake.answer({ uid: 'github-user-0001', email: 'ada@example.org', provider: 'github.com', idToken: 'id-token-1' })
    const deletion = cookies(await startDeletion(url, await signIn(url), 'ada@example.org')).w2l_delete!
    const failed = await signInAgain(url, deletion)
    expect([failed.status, failed.headers.get('location')]).toEqual([303, '/dashboard/settings/?delete=failed'])
    expect(cookies(failed).w2l_session).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(fake.calls.some(call => call.method === 'deleteAccount')).toBe(false)
    // Again, and this time it goes through.
    fail = false
    const again = cookies(await startDeletion(url, `w2l_session=${cookies(failed).w2l_session}`, 'ada@example.org')).w2l_delete!
    expect((await signInAgain(url, again)).headers.get('location')).toBe('/signin/?deleted=1')
  })

  it('signs no one in when Firebase\'s own deletion does not answer, as the account may be gone', async () => {
    const { url, fake, accounts } = await start(undefined, async () => {})
    fake.answer({ uid: 'github-user-0001', email: 'ada@example.org', provider: 'github.com', idToken: 'id-token-1' })
    const deletion = cookies(await startDeletion(url, await signIn(url), 'ada@example.org')).w2l_delete!
    fake.identity.deleteAccount = async () => { throw new SignInRefused('unavailable', 'timeout') }
    const done = await signInAgain(url, deletion)
    expect([done.status, done.headers.get('location')]).toEqual([303, '/signin/?error=delete_unfinished'])
    expect([cookies(done).w2l_session, cookies(done).w2l_delete]).toEqual(['', ''])
    expect([accounts.users.has('github-user-0001'), accounts.sessions.size]).toEqual([false, 0])
  })

  it('drops a waiting deletion on sign-out, so a later sign-in deletes nothing', async () => {
    const erased: string[] = []
    const { url, fake } = await start(undefined, async uid => { erased.push(uid) })
    fake.answer({ uid: 'github-user-0001', email: 'ada@example.org', provider: 'github.com', idToken: 'id-token-1' })
    const session = await signIn(url)
    const deletion = cookies(await startDeletion(url, session, 'ada@example.org')).w2l_delete!
    const out = await fetch(`${url}/auth/logout`, { method: 'POST', redirect: 'manual', headers: { cookie: `${session}; w2l_delete=${deletion}`, origin: url } })
    expect(out.headers.getSetCookie()).toContain('w2l_delete=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
    // Without the cookie (as the browser now has it), signing in again is just signing in.
    const begin = (await fetch(`${url}/auth/github`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    expect((await fetch(`${url}/__/auth/handler?code=x`, { redirect: 'manual', headers: { cookie: begin } })).headers.get('location')).toBe('/dashboard/')
    expect(erased).toEqual([])
  })

  it('deletes after an email-link sign-in too, and answers 503 where accounts cannot be deleted', async () => {
    const erased: string[] = []
    const { url, fake } = await start(undefined, async uid => { erased.push(uid) })
    fake.linkAnswer({ uid: 'email-user-0001', email: 'ada@example.org', provider: 'emailLink', idToken: 'id-token-e' })
    const signed = await fetch(`${url}/auth/email/finish`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: url }, body: 'email=ada%40example.org&oobCode=code-0123456789' })
    const deletion = cookies(await startDeletion(url, `w2l_session=${cookies(signed).w2l_session}`, 'ada@example.org')).w2l_delete!
    const done = await fetch(`${url}/auth/email/finish`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: url, cookie: `w2l_delete=${deletion}` }, body: 'email=ada%40example.org&oobCode=code-9876543210' })
    expect(done.headers.get('location')).toBe('/signin/?deleted=1')
    expect([erased, fake.calls.at(-1)]).toEqual([['email-user-0001'], { method: 'deleteAccount', args: ['id-token-e'] }])
    const off = await start()
    const session = await signIn(off.url)
    expect((await startDeletion(off.url, session, 'ada@example.org')).status).toBe(503)
  })
})

describe('deleting an account and signing up again', () => {
  const month = new Date().toISOString().slice(0, 7)
  const setUp = async () => {
    const data = new MemoryAccountData()
    const started = await start(undefined, uid => data.erase(uid), undefined, { remember: (uid, key) => data.rememberCredits(uid, key, 1_000), carry: (uid, key) => data.carryCredits(uid, key) })
    return { ...started, data }
  }
  const signInAs = async (url: string, fake: ReturnType<typeof fakeIdentity>, user: SignedIn, extraCookie = '') => {
    fake.answer(user)
    const begin = (await fetch(`${url}/auth/github`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
    return fetch(`${url}/__/auth/handler?code=x`, { redirect: 'manual', headers: { cookie: `${begin}${extraCookie}` } })
  }
  const deleteAccount = async (url: string, fake: ReturnType<typeof fakeIdentity>, user: SignedIn) => {
    const session = `w2l_session=${cookies(await signInAs(url, fake, user)).w2l_session}`
    const started = await fetch(`${url}/auth/delete/start`, { method: 'POST', headers: { cookie: session, origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: user.email ?? 'DELETE' }) })
    return signInAs(url, fake, user, `; w2l_delete=${cookies(started).w2l_delete}`)
  }
  const ADA = { uid: 'github-user-0001', email: 'Ada@Example.org', provider: 'github.com' as const, idToken: 'id-token-1' }

  it('goes on with what was left of the month, not a new grant, for the same address', async () => {
    const { url, fake, data } = await setUp()
    data.balances.set(ADA.uid, { month, grant: 120, purchased: 300 })
    expect((await deleteAccount(url, fake, ADA)).headers.get('location')).toBe('/signin/?deleted=1')
    expect(data.balances.has(ADA.uid)).toBe(false)
    // Kept under the address's key only: no address, no old uid, no bought credits.
    expect([...data.carried.entries()]).toEqual([[creditCarryKey(SECRET, 'ada@example.org'), { month, left: 120 }]])
    // The same address, any case, signs up again as a new account.
    await signInAs(url, fake, { ...ADA, uid: 'github-user-0002', email: ' ada@example.org' })
    expect(data.balances.get('github-user-0002')).toEqual({ month, grant: 120, purchased: 0 })
    expect(data.carried.size).toBe(0)
    // Another address starts with nothing remembered: its first call gets the month's grant (account.ts, a missing balance).
    await signInAs(url, fake, { ...ADA, uid: 'github-user-0003', email: 'bob@example.org' })
    expect(data.balances.has('github-user-0003')).toBe(false)
  })

  it('remembers nothing when the month was not spent in, or the account has no address', async () => {
    const { url, fake, data } = await setUp()
    data.balances.set(ADA.uid, { month: '2026-01', grant: 3, purchased: 0 })
    await deleteAccount(url, fake, ADA)
    expect(data.carried.size).toBe(0)
    data.balances.set('github-user-0009', { month, grant: 10, purchased: 0 })
    const noAddress = await deleteAccount(url, fake, { ...ADA, uid: 'github-user-0009', email: null as unknown as string })
    expect(noAddress.headers.get('location')).toBe('/signin/?deleted=1')
    expect(data.carried.size).toBe(0)
  })
})

describe('Firebase\'s REST API', () => {
  it('maps Firebase\'s answers and its error messages to sign-in outcomes', async () => {
    const answers: Array<{ status: number; body: unknown }> = []
    const sent: Array<{ url: string; body: unknown }> = []
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      const next = answers.shift()!
      return new Response(JSON.stringify(next.body), { status: next.status })
    }) as typeof fetch
    const toolkit = new IdentityToolkit('AIzaSyTestKey0123456789abcdef', fetcher)
    answers.push({ status: 200, body: { authUri: 'https://accounts.google.com/o/oauth2/auth?response_type=code', sessionId: 'sid' } })
    await toolkit.createAuthUri('google.com', 'https://octocrawl.dev/__/auth/handler')
    // Google is asked for a code, which reaches the server; its default ID-token flow puts the token in the fragment.
    expect(sent.shift()!.body).toEqual({ providerId: 'google.com', continueUri: 'https://octocrawl.dev/__/auth/handler', authFlowType: 'CODE_FLOW', oauthScope: '{"google.com":"openid email profile"}' })
    answers.push({ status: 200, body: { localId: 'uid-000000001', idToken: 't', email: 'ada@example.org', providerId: 'google.com' } })
    expect(await toolkit.signInWithIdp('https://octocrawl.dev/__/auth/handler?code=1', 'sid')).toEqual({ uid: 'uid-000000001', email: 'ada@example.org', provider: 'google.com', idToken: 't' })
    expect(sent[0]).toEqual({ url: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=AIzaSyTestKey0123456789abcdef', body: { requestUri: 'https://octocrawl.dev/__/auth/handler?code=1', sessionId: 'sid', returnSecureToken: true, returnIdpCredential: true } })
    // Without an ID token (a second factor pending) there is no sign-in.
    answers.push({ status: 200, body: { localId: 'uid-000000001', email: 'ada@example.org', providerId: 'github.com', mfaPendingCredential: 'x' } })
    await expect(toolkit.signInWithIdp('https://octocrawl.dev/__/auth/handler?code=3', 'sid')).rejects.toMatchObject({ code: 'invalid' })
    answers.push({ status: 400, body: { error: { message: 'FEDERATED_USER_ID_ALREADY_LINKED' } } })
    await expect(toolkit.signInWithIdp('https://octocrawl.dev/__/auth/handler?code=4', 'sid')).rejects.toMatchObject({ code: 'other_provider' })
    answers.push({ status: 200, body: { needConfirmation: true, email: 'ada@example.org', providerId: 'github.com' } })
    await expect(toolkit.signInWithIdp('https://octocrawl.dev/__/auth/handler?code=2', 'sid')).rejects.toMatchObject({ code: 'other_provider', pending: undefined })
    // With the provider's token in the answer, the credential can wait to be linked; linking sends it with the account's ID token.
    answers.push({ status: 200, body: { needConfirmation: true, email: 'Ada@Example.org', providerId: 'github.com', oauthAccessToken: 'gho_token' } })
    await expect(toolkit.signInWithIdp('https://octocrawl.dev/__/auth/handler?code=5', 'sid')).rejects.toMatchObject({ code: 'other_provider', pending: { provider: 'github.com', email: 'ada@example.org', accessToken: 'gho_token' } })
    answers.push({ status: 200, body: { localId: 'uid-000000001', idToken: 't2' } })
    await toolkit.linkIdp('id-token', { provider: 'github.com', email: 'ada@example.org', accessToken: 'gho_token' }, 'https://octocrawl.dev/__/auth/handler')
    expect(sent.at(-1)!.body).toEqual({ idToken: 'id-token', postBody: 'access_token=gho_token&providerId=github.com', requestUri: 'https://octocrawl.dev/__/auth/handler', returnSecureToken: true })
    answers.push({ status: 400, body: { error: { message: 'FEDERATED_USER_ID_ALREADY_LINKED' } } })
    await expect(toolkit.linkIdp('id-token', { provider: 'github.com', email: 'ada@example.org', accessToken: 'gho_token' }, 'https://octocrawl.dev/__/auth/handler')).rejects.toMatchObject({ code: 'other_provider' })
    answers.push({ status: 400, body: { error: { message: 'EXPIRED_OOB_CODE' } } })
    await expect(toolkit.signInWithEmailLink('ada@example.org', 'code')).rejects.toMatchObject({ code: 'expired' })
    answers.push({ status: 400, body: { error: { message: 'INVALID_EMAIL' } } })
    await expect(toolkit.sendEmailLink('x', 'https://octocrawl.dev/auth/email/finish')).rejects.toMatchObject({ code: 'invalid' })
    expect(sent.at(-1)!.body).toEqual({ requestType: 'EMAIL_SIGNIN', email: 'x', continueUrl: 'https://octocrawl.dev/auth/email/finish', canHandleCodeInApp: true })
    expect(() => new IdentityToolkit('bad key!')).toThrow(/malformed/)
    // Deleting the account is the account's own call, with its ID token.
    answers.push({ status: 200, body: { kind: 'identitytoolkit#DeleteAccountResponse' } })
    await toolkit.deleteAccount('id-token-1')
    expect(sent.at(-1)).toEqual({ url: 'https://identitytoolkit.googleapis.com/v1/accounts:delete?key=AIzaSyTestKey0123456789abcdef', body: { idToken: 'id-token-1' } })
    answers.push({ status: 400, body: { error: { message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' } } })
    await expect(toolkit.deleteAccount('id-token-1')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('forgets an account in Firestore: its record and every session it has, in one commit', async () => {
    const sent: Array<{ url: string; body: unknown }> = []
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'token' })
      sent.push({ url, body: JSON.parse(String(init?.body)) })
      if (url.endsWith(':runQuery')) return Response.json([{ document: { name: 'projects/octocrawl-test/databases/(default)/documents/sessions/h1' } }, { document: { name: 'projects/octocrawl-test/databases/(default)/documents/sessions/h2' } }, { readTime: 'x' }])
      return Response.json({})
    }) as typeof fetch
    await new FirestoreAccountStore('octocrawl-test', fetcher).forget('github-user-0001')
    expect(sent[0]!.body).toMatchObject({ structuredQuery: { from: [{ collectionId: 'sessions' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: 'github-user-0001' } } } } })
    expect(sent[1]!.body).toEqual({ writes: ['users/github-user-0001', 'sessions/h1', 'sessions/h2'].map(path => ({ delete: `projects/octocrawl-test/databases/(default)/documents/${path}` })) })
    await expect(new FirestoreAccountStore('octocrawl-test', fetcher).forget('../x')).rejects.toThrow(/malformed/)
  })
})
