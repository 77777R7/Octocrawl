import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { once } from 'node:events'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { createPreviewServer } from '../src/server.js'
import { createAuthRoutes, MemoryAccountStore, sessionHash, type IdentityProvider } from '../src/auth.js'
import { ACCESS_TOKEN_SECONDS, createClientMetadataFetcher, createOAuthRoutes, FirestoreOAuthStore, MAX_CONNECTIONS, MCP_OAUTH_RESOURCE, MemoryOAuthStore, type GrantRecord } from '../src/oauth.js'

const SECRET = 's'.repeat(40)
const UID = 'account-0001'
const servers: Server[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

const CHATGPT = 'https://chatgpt.com/oauth/client.json'
const CLAUDE_CODE = 'https://claude.ai/oauth/claude-code-client-metadata'
/** The two clients' published documents, as fetched on 2026-10-16. */
const DOCUMENTS: Record<string, unknown> = {
  [CHATGPT]: { client_id: CHATGPT, client_uri: 'https://chatgpt.com/', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_name: 'ChatGPT' },
  [CLAUDE_CODE]: { client_id: CLAUDE_CODE, client_name: 'Claude Code', client_uri: 'https://claude.ai', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
  'https://other.example/client.json': { client_id: 'https://another.example/client.json', client_name: 'Mismatch', redirect_uris: ['https://other.example/cb'] },
}
const CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect'

const noIdentity = {} as IdentityProvider

async function start(options: { now?: () => Date; store?: MemoryOAuthStore } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-oauth-')); dirs.push(dir)
  await writeFile(join(dir, '404.html'), '<title>Page not found</title>')
  const accounts = new MemoryAccountStore()
  const auth = createAuthRoutes({ identity: noIdentity, accounts, secret: SECRET, ...(options.now ? { now: options.now } : {}) })
  const store = options.store ?? new MemoryOAuthStore()
  const fetched: string[] = []
  const oauth = createOAuthRoutes({
    store, secret: SECRET, current: auth.current, creditsLeft: async () => 742, ...(options.now ? { now: options.now } : {}),
    clientMetadata: async (url) => { fetched.push(url); if (!(url in DOCUMENTS)) throw new Error('not found'); return DOCUMENTS[url] },
  })
  const server = createPreviewServer({ quota: { consume: async () => 'ok' }, staticDir: dir, amazonState: null, log: () => {}, visitorCookieSecret: SECRET, auth, oauth })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  /** A signed-in session for an account, as its cookie. */
  const signIn = async (uid = UID, email = 'ada@example.org') => {
    const id = randomBytes(32).toString('base64url')
    const at = options.now?.() ?? new Date()
    await accounts.signIn({ uid, email, provider: 'github.com' }, sessionHash(SECRET, id), new Date(at.getTime() + 86_400_000), at)
    return `w2l_session=${id}`
  }
  return { url, store, fetched, signIn }
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

function authorizeQuery(overrides: Record<string, string | null> = {}, challenge = pkce().challenge): string {
  const params: Record<string, string | null> = { response_type: 'code', client_id: CHATGPT, redirect_uri: CALLBACK, state: 'state-123', code_challenge: challenge, code_challenge_method: 'S256', resource: MCP_OAUTH_RESOURCE, scope: 'mcp', ...overrides }
  return new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== null)).toString()
}

/** The consent form's hidden fields, read from the page. */
function formFields(html: string): Record<string, string> {
  const form = /<form[^>]*action="\/oauth\/authorize"[^>]*>([\s\S]*?)<\/form>/.exec(html)![1]!
  return Object.fromEntries([...form.matchAll(/<input type="hidden" name="([a-z_]+)" value="([^"]*)">/g)].map(match => [match[1]!, match[2]!.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))]))
}

/** Opens the consent page and answers it: the redirect the browser is sent on. */
async function consent(url: string, cookie: string, query: string, decision: 'allow' | 'deny' = 'allow') {
  const page = await fetch(`${url}/oauth/authorize?${query}`, { headers: { cookie } })
  expect(page.status).toBe(200)
  const fields = formFields(await page.text())
  return fetch(`${url}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie, origin: url, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, decision }).toString() })
}

const token = (url: string, body: Record<string, string>) => fetch(`${url}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://chatgpt.com' }, body: new URLSearchParams(body).toString() })

/** Through consent and the code exchange: the tokens, and the code that was used. */
async function connect(url: string, cookie: string, client = CHATGPT, redirect = CALLBACK) {
  const { verifier, challenge } = pkce()
  const answer = await consent(url, cookie, authorizeQuery({ client_id: client, redirect_uri: redirect }, challenge))
  const code = new URL(answer.headers.get('location')!).searchParams.get('code')!
  const response = await token(url, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: client, resource: MCP_OAUTH_RESOURCE })
  return { code, verifier, response, tokens: await response.json() as { access_token: string; refresh_token: string; token_type: string; expires_in: number; scope: string } }
}

const accessDigest = (value: string) => createHmac('sha256', SECRET).update(`oca:${value}`).digest('hex')

describe('authorization server metadata', () => {
  it('names this site as issuer, the four endpoints, and only what is supported', async () => {
    const { url } = await start()
    const response = await fetch(`${url}/.well-known/oauth-authorization-server`)
    expect(response.status).toBe(200)
    expect([response.headers.get('access-control-allow-origin'), response.headers.get('cache-control')]).toEqual(['*', 'no-store'])
    expect(await response.json()).toEqual({
      issuer: url,
      authorization_endpoint: `${url}/oauth/authorize`, token_endpoint: `${url}/oauth/token`, registration_endpoint: `${url}/oauth/register`, revocation_endpoint: `${url}/oauth/revoke`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: ['mcp'],
      client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true,
    })
  })
})

describe('connecting a client', () => {
  it('signs in first, shows who is asking and where it returns, then issues a code with iss, and tokens bound to /mcp-oauth', async () => {
    const { url, store, signIn, fetched } = await start()
    const query = authorizeQuery()
    // Not signed in: to sign-in, which comes back to the same request.
    const signedOut = await fetch(`${url}/oauth/authorize?${query}`, { redirect: 'manual' })
    expect(signedOut.status).toBe(303)
    expect(signedOut.headers.get('location')).toBe(`/signin/?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`)
    const cookie = await signIn()
    const page = await fetch(`${url}/oauth/authorize?${query}`, { headers: { cookie } })
    expect(page.status).toBe(200)
    const csp = page.headers.get('content-security-policy')!
    expect(csp).toContain("frame-ancestors 'none'")
    // No form-action: Chrome applies it to the redirect after the form is sent, which goes to the client's own host.
    expect(csp).not.toContain('form-action')
    expect([page.headers.get('x-frame-options'), page.headers.get('cache-control')]).toEqual(['DENY', 'no-store'])
    const html = await page.text()
    expect(html).toContain('ChatGPT')
    expect(html).toContain('It will send you back to <strong>chatgpt.com</strong>')
    expect(html).toContain('ada@example.org')
    expect(html).toContain('Not you?')
    expect(html).toContain('742 credits left this month')
    expect(html).toContain('90 days')
    expect(html).not.toContain('API key')
    expect(html).not.toContain('style=')
    expect(html).not.toContain('runs on your computer')
    const fields = formFields(html)
    const answer = await fetch(`${url}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie, origin: url, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, decision: 'allow' }).toString() })
    expect(answer.status).toBe(302)
    const back = new URL(answer.headers.get('location')!)
    expect(`${back.origin}${back.pathname}`).toBe(CALLBACK)
    expect([back.searchParams.get('state'), back.searchParams.get('iss')]).toEqual(['state-123', url])
    expect(back.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // One grant, with its own key record: the account's, marked as OAuth's, named for the client and its host.
    const [grantId, grant] = [...store.grants.entries()][0]!
    expect(grant).toMatchObject({ uid: UID, clientId: CHATGPT, clientName: 'ChatGPT', redirectHost: 'chatgpt.com', revoked: false, connected: false })
    expect(store.keys.get(grant.keyId)).toMatchObject({ enabled: true, uid: UID, kind: 'oauth', grantId, label: 'ChatGPT (chatgpt.com)', plan: 'account', browser: true })
    // A CIMD document is read once and kept.
    expect(fetched).toEqual([CHATGPT])
  })

  it('exchanges the code for an hour\'s access token and a refresh token, stored only as HMACs, with CORS and no-store', async () => {
    const { url, store, signIn } = await start()
    const { response, tokens } = await connect(url, await signIn())
    expect(response.status).toBe(200)
    expect([response.headers.get('access-control-allow-origin'), response.headers.get('cache-control')]).toEqual(['*', 'no-store'])
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: ACCESS_TOKEN_SECONDS, scope: 'mcp' })
    expect(tokens.access_token).toMatch(/^oca_[A-Za-z0-9_-]{43}$/)
    expect(tokens.refresh_token).toMatch(/^ocr_[A-Za-z0-9_-]{43}$/)
    // What the hosted API reads (packages/mcp hostedApi.ts): oauthTokens/{HMAC("oca:"+token)} with keyId, resource and expiresAt.
    const [grant] = [...store.grants.values()]
    const access = store.tokens.get(accessDigest(tokens.access_token))!
    expect(access).toMatchObject({ keyId: grant!.keyId, resource: MCP_OAUTH_RESOURCE, uid: UID })
    expect(access.expiresAt - Date.now()).toBeGreaterThan((ACCESS_TOKEN_SECONDS - 60) * 1000)
    expect(JSON.stringify([...store.tokens.keys(), ...store.refreshTokens.keys(), ...store.codes.keys()])).not.toContain(tokens.access_token.slice(4, 20))
    const preflight = await fetch(`${url}/oauth/token`, { method: 'OPTIONS', headers: { origin: 'https://chatgpt.com', 'access-control-request-method': 'POST' } })
    expect([preflight.status, preflight.headers.get('access-control-allow-origin')]).toEqual([204, '*'])
  })

  it('refuses a wrong PKCE verifier, a plain challenge, a missing one, and a code for another client or callback', async () => {
    const { url, signIn } = await start()
    const cookie = await signIn()
    const { verifier, challenge } = pkce()
    const exchange = async (overrides: Record<string, string>) => {
      const answer = await consent(url, cookie, authorizeQuery({}, challenge))
      const code = new URL(answer.headers.get('location')!).searchParams.get('code')!
      return token(url, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CALLBACK, client_id: CHATGPT, ...overrides })
    }
    for (const overrides of [{ code_verifier: pkce().verifier }, { client_id: CLAUDE_CODE }, { redirect_uri: 'https://chatgpt.com/other' }, { resource: 'https://mcp.octocrawl.dev/mcp' }] as Record<string, string>[]) {
      const refused = await exchange(overrides)
      expect(refused.status, JSON.stringify(overrides)).toBe(400)
      expect(await refused.json()).toMatchObject({ error: 'invalid_grant' })
    }
    expect((await exchange({})).status).toBe(200)
    // An error in a request whose callback is registered is a page with a link back, never an automatic redirect: anyone
    // can register a callback, so following it unasked would make this site an open redirector (RFC 9700 §4.11.2).
    for (const [overrides, error] of [[{ code_challenge_method: 'plain' }, 'invalid_request'], [{ code_challenge: null }, 'invalid_request'], [{ response_type: 'token' }, 'unsupported_response_type'], [{ resource: 'https://mcp.octocrawl.dev/mcp' }, 'invalid_target'], [{ resource: null }, 'invalid_target'], [{ scope: 'admin' }, 'invalid_scope']] as const) {
      for (const headers of [{ cookie }, {}] as Record<string, string>[]) {
        const answer = await fetch(`${url}/oauth/authorize?${authorizeQuery(overrides)}`, { redirect: 'manual', headers })
        expect([answer.status, answer.headers.get('location')], error).toEqual([400, null])
        const link = /<a href="([^"]+)">/.exec(await answer.text())![1]!.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
        const back = new URL(link)
        expect([`${back.origin}${back.pathname}`, back.searchParams.get('error'), back.searchParams.get('state'), back.searchParams.get('iss')], JSON.stringify(overrides)).toEqual([CALLBACK, error, 'state-123', url])
      }
    }
    // An empty scope is the default, mcp.
    expect((await fetch(`${url}/oauth/authorize?${authorizeQuery({ scope: null })}`, { headers: { cookie } })).status).toBe(200)
    const unsupported = await token(url, { grant_type: 'client_credentials', client_id: CHATGPT })
    expect([unsupported.status, (await unsupported.json() as { error: string }).error]).toEqual([400, 'unsupported_grant_type'])
  })

  it('matches the callback exactly, except a loopback port; before that, an error is a page, never a redirect', async () => {
    const { url, signIn } = await start()
    const cookie = await signIn()
    // Claude Code registers loopback callbacks without a port; any port is the same callback (RFC 8252).
    const loopback = await connect(url, cookie, CLAUDE_CODE, 'http://localhost:53682/callback')
    expect(loopback.response.status).toBe(200)
    const page = await (await fetch(`${url}/oauth/authorize?${authorizeQuery({ client_id: CLAUDE_CODE, redirect_uri: 'http://127.0.0.1:41000/callback' })}`, { headers: { cookie } })).text()
    expect(page).toContain('runs on your computer')
    for (const [client, redirect] of [[CHATGPT, 'https://chatgpt.com/connector_platform_oauth_redirect/x'], [CHATGPT, 'https://evil.example/connector_platform_oauth_redirect'], [CHATGPT, null], [CLAUDE_CODE, 'http://localhost:53682/other'], [CLAUDE_CODE, 'http://evil.example/callback'], ['https://unknown.example/client.json', CALLBACK], ['not-a-client', CALLBACK]] as const) {
      const answer = await fetch(`${url}/oauth/authorize?${authorizeQuery({ client_id: client, redirect_uri: redirect })}`, { redirect: 'manual', headers: { cookie } })
      expect(answer.status, `${client} ${redirect}`).toBe(400)
      expect(answer.headers.get('location')).toBeNull()
      expect(answer.headers.get('content-type')).toContain('text/html')
    }
  })

  it('refuses a metadata document whose client_id is not its own address, and does not keep the refusal', async () => {
    const { url, signIn, fetched } = await start()
    const cookie = await signIn()
    for (let i = 0; i < 2; i++) {
      const answer = await fetch(`${url}/oauth/authorize?${authorizeQuery({ client_id: 'https://other.example/client.json', redirect_uri: 'https://other.example/cb' })}`, { redirect: 'manual', headers: { cookie } })
      expect([answer.status, answer.headers.get('location')]).toEqual([400, null])
    }
    expect(fetched).toEqual(['https://other.example/client.json', 'https://other.example/client.json'])
  })

  it('sends the visitor back with access_denied when they cancel, and issues nothing', async () => {
    const { url, store, signIn } = await start()
    const answer = await consent(url, await signIn(), authorizeQuery(), 'deny')
    expect(answer.status).toBe(302)
    const back = new URL(answer.headers.get('location')!)
    expect([back.searchParams.get('error'), back.searchParams.get('state'), back.searchParams.get('iss'), back.searchParams.get('code')]).toEqual(['access_denied', 'state-123', url, null])
    expect(store.grants.size).toBe(0)
  })

  it('takes a consent form once, from this site, from the session it was shown to, within ten minutes', async () => {
    let clock = new Date('2026-10-16T08:00:00Z')
    const { url, store, signIn } = await start({ now: () => clock })
    const cookie = await signIn()
    const html = await (await fetch(`${url}/oauth/authorize?${authorizeQuery()}`, { headers: { cookie } })).text()
    const fields = formFields(html)
    const send = (body: Record<string, string>, headers: Record<string, string> = {}) => fetch(`${url}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie, origin: url, 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ ...body, decision: 'allow' }).toString() })
    expect((await send(fields, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await send({ ...fields, handle: `${fields.handle!.slice(0, -2)}xx` })).status).toBe(400)
    // The handle is bound to the request it was shown for.
    expect((await send({ ...fields, redirect_uri: CALLBACK, state: 'other-state' })).status).toBe(400)
    expect((await send(fields, { cookie: await signIn('account-0002', 'bob@example.org') })).status).toBe(400)
    const used = await send(fields)
    expect(used.status).toBe(302)
    expect((await send(fields)).status).toBe(400)
    const later = formFields(await (await fetch(`${url}/oauth/authorize?${authorizeQuery()}`, { headers: { cookie } })).text())
    clock = new Date(clock.getTime() + 11 * 60_000)
    expect((await send(later)).status).toBe(400)
    expect(store.grants.size).toBe(1)
  })

  it('holds an account to ten connections; the eleventh gets a page and no code', async () => {
    const store = new MemoryOAuthStore()
    const now = Date.now()
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      store.grants.set(`grant-${i}`, { uid: UID, clientId: CHATGPT, clientName: 'ChatGPT', redirectHost: 'chatgpt.com', keyId: `oauth_grant-${i}`, createdAt: now, lastUsedAt: now, revoked: false, connected: true } satisfies GrantRecord)
    }
    // A disconnected one, one unused for 90 days and one whose code was never exchanged do not count.
    store.grants.set('grant-off', { ...store.grants.get('grant-0')!, revoked: true })
    store.grants.set('grant-old', { ...store.grants.get('grant-0')!, lastUsedAt: now - 91 * 86_400_000 })
    store.grants.set('grant-pending', { ...store.grants.get('grant-0')!, connected: false })
    const { url, signIn } = await start({ store })
    const answer = await consent(url, await signIn(), authorizeQuery())
    expect(answer.status).toBe(409)
    expect(answer.headers.get('location')).toBeNull()
    expect(await answer.text()).toContain(`${MAX_CONNECTIONS} connections`)
    expect(store.codes.size).toBe(0)
    store.grants.get('grant-0')!.revoked = true
    expect((await consent(url, await signIn(), authorizeQuery())).status).toBe(302)
  })

  it('escapes a client name a registration chose', async () => {
    const { url, signIn } = await start()
    const registered = await fetch(`${url}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: '<img src=x onerror=alert(1)>"Tool"', redirect_uris: ['https://app.example/cb'] }) })
    const { client_id } = await registered.json() as { client_id: string }
    const html = await (await fetch(`${url}/oauth/authorize?${authorizeQuery({ client_id, redirect_uri: 'https://app.example/cb' })}`, { headers: { cookie: await signIn() } })).text()
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&#60;img src=x onerror=alert(1)&#62;&#34;Tool&#34;')
    expect(html).toContain('It will send you back to <strong>app.example</strong>')
  })
})

describe('tokens', () => {
  it('rotates the refresh token; one used twice ends the connection', async () => {
    const { url, store, signIn } = await start()
    const { tokens } = await connect(url, await signIn())
    const first = await token(url, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: CHATGPT, resource: MCP_OAUTH_RESOURCE })
    expect(first.status).toBe(200)
    const rotated = await first.json() as { access_token: string; refresh_token: string }
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token)
    expect(store.tokens.has(accessDigest(rotated.access_token))).toBe(true)
    // Another client cannot use it.
    expect((await token(url, { grant_type: 'refresh_token', refresh_token: rotated.refresh_token, client_id: CLAUDE_CODE })).status).toBe(400)
    const replay = await token(url, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: CHATGPT })
    expect([replay.status, (await replay.json() as { error: string }).error]).toEqual([400, 'invalid_grant'])
    const [grant] = [...store.grants.values()]
    expect(grant!.revoked).toBe(true)
    expect(store.keys.get(grant!.keyId)!.enabled).toBe(false)
    expect((await token(url, { grant_type: 'refresh_token', refresh_token: rotated.refresh_token, client_id: CHATGPT })).status).toBe(400)
  })

  it('a code used twice ends the connection it made, and a code is good for a minute', async () => {
    let clock = new Date('2026-10-16T08:00:00Z')
    const { url, store, signIn } = await start({ now: () => clock })
    const cookie = await signIn()
    const { code, verifier, tokens } = await connect(url, cookie)
    const again = await token(url, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CALLBACK, client_id: CHATGPT })
    expect([again.status, (await again.json() as { error: string }).error]).toEqual([400, 'invalid_grant'])
    expect([...store.grants.values()][0]!.revoked).toBe(true)
    expect((await token(url, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: CHATGPT })).status).toBe(400)
    const { verifier: late, challenge } = pkce()
    const answer = await consent(url, cookie, authorizeQuery({}, challenge))
    clock = new Date(clock.getTime() + 61_000)
    const expired = await token(url, { grant_type: 'authorization_code', code: new URL(answer.headers.get('location')!).searchParams.get('code')!, code_verifier: late, redirect_uri: CALLBACK, client_id: CHATGPT })
    expect(expired.status).toBe(400)
  })

  it('revokes: a refresh token ends its connection, an access token goes alone, and an unknown one is still 200', async () => {
    const { url, store, signIn } = await start()
    const cookie = await signIn()
    const one = await connect(url, cookie)
    const revoke = (body: Record<string, string>) => fetch(`${url}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() })
    expect((await revoke({ token: one.tokens.access_token, client_id: CHATGPT })).status).toBe(200)
    expect(store.tokens.has(accessDigest(one.tokens.access_token))).toBe(false)
    expect([...store.grants.values()][0]!.revoked).toBe(false)
    expect((await revoke({ token: one.tokens.refresh_token, token_type_hint: 'refresh_token', client_id: CHATGPT })).status).toBe(200)
    expect([...store.grants.values()][0]!.revoked).toBe(true)
    expect((await revoke({ token: 'ocr_nothing', client_id: CHATGPT })).status).toBe(200)
  })
})

describe('client registration', () => {
  it('registers public clients with https or loopback callbacks only, and limits registrations per address', async () => {
    const { url, store } = await start()
    const register = (body: unknown) => fetch(`${url}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    for (const body of [{ redirect_uris: ['http://app.example/cb'] }, { redirect_uris: [] }, { redirect_uris: ['https://app.example/cb#x'] }, { redirect_uris: ['https://app.example/cb'], token_endpoint_auth_method: 'client_secret_basic' }, { redirect_uris: ['https://app.example/cb'], grant_types: ['client_credentials'] }]) {
      const refused = await register(body)
      expect(refused.status, JSON.stringify(body)).toBe(400)
      expect((await refused.json() as { error: string }).error).toMatch(/^invalid_(redirect_uri|client_metadata)$/)
    }
    const made = await register({ client_name: 'Cursor', redirect_uris: ['https://app.example/cb', 'http://127.0.0.1/callback'], application_type: 'native' })
    expect(made.status).toBe(201)
    expect(made.headers.get('access-control-allow-origin')).toBe('*')
    const client = await made.json() as { client_id: string; token_endpoint_auth_method: string; redirect_uris: string[] }
    expect(client).toMatchObject({ token_endpoint_auth_method: 'none', redirect_uris: ['https://app.example/cb', 'http://127.0.0.1/callback'], client_name: 'Cursor', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] })
    expect(store.clients.get(client.client_id)).toMatchObject({ name: 'Cursor', applicationType: 'native' })
    let limited = false
    for (let i = 0; i < 20 && !limited; i++) limited = (await register({ redirect_uris: ['https://app.example/cb'] })).status === 429
    expect(limited).toBe(true)
  })
})

describe('client metadata documents', () => {
  it('reads only https documents at public addresses, at most 5 KB', async () => {
    const bodies: Record<string, string> = {
      '/client.json': JSON.stringify({ client_id: 'x' }),
      '/big.json': JSON.stringify({ client_id: 'x', pad: 'y'.repeat(6_000) }),
    }
    const site = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }).end(bodies[req.url ?? ''] ?? '{}') })
    site.listen(0, '127.0.0.1'); await once(site, 'listening'); servers.push(site)
    const port = (site.address() as AddressInfo).port
    // The transport is plain HTTP here, as the test has no certificate; the address checks are the real ones.
    const local = createClientMetadataFetcher({ request: httpRequest, policy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] } })
    expect(await local(`https://127.0.0.1:${port}/client.json`)).toEqual({ client_id: 'x' })
    await expect(local(`https://127.0.0.1:${port}/big.json`)).rejects.toThrow(/5 KB|too large/)
    const strict = createClientMetadataFetcher({ request: httpRequest, lookup: (_host, _options, callback) => callback(null, [{ address: '10.0.0.5', family: 4 }]) })
    for (const address of ['http://chatgpt.com/oauth/client.json', `https://127.0.0.1:${port}/client.json`, 'https://169.254.169.254/x', 'https://[::1]/x', 'https://private.example/client.json', 'https://user:pass@chatgpt.com/x']) {
      await expect(strict(address), address).rejects.toThrow()
    }
  })
})

describe('Firestore records', () => {
  it('writes a connection in one commit and reads it back, takes a code once, rotates a refresh token once, and disconnects', async () => {
    const { docs, fetcher } = fakeFirestore()
    const store = new FirestoreOAuthStore('octocrawl-test', fetcher)
    const root = 'projects/octocrawl-test/databases/(default)/documents'
    const now = Date.parse('2026-10-16T08:00:00Z')
    await store.connect({
      grantId: 'grant-1', keyId: 'oauth_grant-1', label: 'ChatGPT (chatgpt.com)', codeHash: 'code-1',
      grant: { uid: UID, clientId: CHATGPT, clientName: 'ChatGPT', redirectHost: 'chatgpt.com', keyId: 'oauth_grant-1', createdAt: now, lastUsedAt: now, revoked: false, connected: false },
      code: { uid: UID, grantId: 'grant-1', clientId: CHATGPT, redirectUri: CALLBACK, challenge: 'c', resource: MCP_OAUTH_RESOURCE, expiresAt: now + 60_000, used: false },
    })
    // The key record the hosted API reads (FirestoreHostedKeys): an account's, OAuth's, enabled.
    expect(docs.get(`${root}/hostedApiKeys/oauth_grant-1`)!.fields).toMatchObject({ enabled: { booleanValue: true }, uid: { stringValue: UID }, kind: { stringValue: 'oauth' }, plan: { stringValue: 'account' }, browser: { booleanValue: true }, grantId: { stringValue: 'grant-1' } })
    // Not a connection until its code is exchanged.
    expect(await store.activeGrants(UID, now)).toBe(0)
    expect(await store.takeCode('code-1')).toMatchObject({ replay: false, code: { grantId: 'grant-1', redirectUri: CALLBACK } })
    expect(await store.takeCode('code-1')).toMatchObject({ replay: true })
    expect(await store.takeCode('code-2')).toBeNull()
    const access = { keyId: 'oauth_grant-1', resource: MCP_OAUTH_RESOURCE, expiresAt: now + 3_600_000, grantId: 'grant-1', uid: UID }
    const refresh = { grantId: 'grant-1', uid: UID, clientId: CHATGPT, keyId: 'oauth_grant-1', resource: MCP_OAUTH_RESOURCE, expiresAt: now + 90 * 86_400_000, used: false }
    expect(await store.issue({ grantId: 'grant-1', now, access: { hash: 'a1', record: access }, refresh: { hash: 'r1', record: refresh } })).toBe(true)
    expect(await store.activeGrants(UID, now)).toBe(1)
    // What the hosted API reads (FirestoreHostedOAuthTokens): keyId, resource and expiresAt as a timestamp.
    expect(docs.get(`${root}/oauthTokens/a1`)!.fields).toMatchObject({ keyId: { stringValue: 'oauth_grant-1' }, resource: { stringValue: MCP_OAUTH_RESOURCE }, expiresAt: { timestampValue: new Date(now + 3_600_000).toISOString() } })
    const read = (await store.refresh('r1'))!
    expect(read).toMatchObject({ grantId: 'grant-1', used: false })
    expect(await store.issue({ grantId: 'grant-1', now, access: { hash: 'a2', record: access }, refresh: { hash: 'r2', record: refresh }, rotate: { hash: 'r1', version: read.version } })).toBe(true)
    // The same read again: the token was rotated since, so nothing is written.
    expect(await store.issue({ grantId: 'grant-1', now, access: { hash: 'a3', record: access }, refresh: { hash: 'r3', record: refresh }, rotate: { hash: 'r1', version: read.version } })).toBe(false)
    expect(docs.has(`${root}/oauthTokens/a3`)).toBe(false)
    expect((await store.refresh('r1'))!.used).toBe(true)
    expect((await store.grantsOf(UID)).map(row => [row.id, row.grant.connected])).toEqual([['grant-1', true]])
    await store.disconnect('grant-1')
    expect((await store.grant('grant-1'))!.revoked).toBe(true)
    // Its refresh tokens go with it.
    expect([...docs.keys()].filter(name => name.includes('/oauthRefresh/'))).toEqual([])
    expect(docs.get(`${root}/hostedApiKeys/oauth_grant-1`)!.fields.enabled).toEqual({ booleanValue: false })
    expect(await store.activeGrants(UID, now)).toBe(0)
    expect(await store.useOnce('nonce-1', now + 600_000)).toBe(true)
    expect(await store.useOnce('nonce-1', now + 600_000)).toBe(false)
  })
})

describe('disconnecting in Firestore', () => {
  it('deletes every refresh token of a long-used connection, a page at a time, and no other connection\'s', async () => {
    const { docs, fetcher } = fakeFirestore()
    const store = new FirestoreOAuthStore('octocrawl-test', fetcher)
    const root = 'projects/octocrawl-test/databases/(default)/documents'
    docs.set(`${root}/oauthGrants/grant-1`, { fields: { uid: { stringValue: UID }, keyId: { stringValue: 'oauth_grant-1' }, connected: { booleanValue: true } }, updateTime: 't' })
    docs.set(`${root}/hostedApiKeys/oauth_grant-1`, { fields: { enabled: { booleanValue: true } }, updateTime: 't' })
    // An hour's refresh for ten days and more leaves used tokens past one page of a query.
    for (let i = 0; i < 450; i++) docs.set(`${root}/oauthRefresh/r${i}`, { fields: { grantId: { stringValue: 'grant-1' }, used: { booleanValue: i < 449 } }, updateTime: 't' })
    docs.set(`${root}/oauthRefresh/other`, { fields: { grantId: { stringValue: 'grant-2' }, used: { booleanValue: false } }, updateTime: 't' })
    await store.disconnect('grant-1')
    expect([...docs.keys()].filter(name => name.includes('/oauthRefresh/'))).toEqual([`${root}/oauthRefresh/other`])
    expect(docs.get(`${root}/hostedApiKeys/oauth_grant-1`)!.fields.enabled).toEqual({ booleanValue: false })
  })
})

/** A Firestore REST stand-in: reads, single-field equality queries, and commits whose preconditions are checked. */
function fakeFirestore() {
  const docs = new Map<string, { fields: Record<string, Record<string, unknown>>; updateTime: string }>()
  let clock = 0
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    const href = String(input)
    if (href.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'token', expires_in: 3600 })
    if (href.endsWith(':runQuery')) {
      const { structuredQuery } = JSON.parse(String(init!.body)) as { structuredQuery: { from: Array<{ collectionId: string }>; where: { fieldFilter: { field: { fieldPath: string }; value: { stringValue: string } } } } }
      const { field, value } = structuredQuery.where.fieldFilter
      const limit = (structuredQuery as { limit?: number }).limit ?? Infinity
      return Response.json([...docs.entries()].filter(([name, doc]) => name.split('/').at(-2) === structuredQuery.from[0]!.collectionId && (doc.fields[field.fieldPath] as { stringValue?: string } | undefined)?.stringValue === value.stringValue)
        .slice(0, limit).map(([name, doc]) => ({ document: { name, fields: doc.fields, updateTime: doc.updateTime } })))
    }
    if (href.endsWith(':commit')) {
      const { writes } = JSON.parse(String(init!.body)) as { writes: Array<{ update?: { name: string; fields: Record<string, Record<string, unknown>> }; updateMask?: { fieldPaths: string[] }; delete?: string; currentDocument?: { exists?: boolean; updateTime?: string } }> }
      for (const write of writes) {
        const doc = docs.get(write.update?.name ?? write.delete!)
        const pre = write.currentDocument
        if (pre?.exists === false && doc !== undefined) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 })
        if (pre?.exists === true && doc === undefined) return Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 })
        if (pre?.updateTime !== undefined && doc?.updateTime !== pre.updateTime) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 })
      }
      const writeResults = writes.map((write) => {
        const updateTime = `2026-10-16T00:00:${String(++clock).padStart(2, '0')}Z`
        if (write.delete !== undefined) { docs.delete(write.delete); return { updateTime } }
        const name = write.update!.name
        const fields = write.updateMask ? { ...(docs.get(name)?.fields ?? {}), ...Object.fromEntries(write.updateMask.fieldPaths.map(path => [path, write.update!.fields[path]!])) } : write.update!.fields
        docs.set(name, { fields, updateTime })
        return { updateTime }
      })
      return Response.json({ writeResults })
    }
    const name = href.replace('https://firestore.googleapis.com/v1/', '')
    const doc = docs.get(name)
    return doc === undefined ? new Response('{}', { status: 404 }) : Response.json({ name, fields: doc.fields, updateTime: doc.updateTime })
  }) as typeof fetch
  return { docs, fetcher }
}
