import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createHmac } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreviewServer } from '../src/server.js'
import { createAuthRoutes, MemoryAccountStore, type IdentityProvider } from '../src/auth.js'
import { createAccountRoutes, MAX_ACTIVE_KEYS, MemoryAccountData } from '../src/account.js'

const SECRET = 's'.repeat(40)
const servers: Server[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

const identity: IdentityProvider = {
  async createAuthUri() { return { authUri: 'https://github.com/authorize', sessionId: 'sid' } },
  async signInWithIdp() { return { uid: 'account-0001', email: 'ada@example.org', provider: 'github.com' } },
  async sendEmailLink() {},
  async signInWithEmailLink() { return { uid: 'account-0001', email: 'ada@example.org', provider: 'emailLink' } },
  async linkIdp() {},
}

async function start(now = new Date('2026-10-11T08:00:00Z')) {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-account-')); dirs.push(dir)
  await writeFile(join(dir, '404.html'), '<title>Page not found</title>')
  const auth = createAuthRoutes({ identity, accounts: new MemoryAccountStore(), secret: SECRET })
  const data = new MemoryAccountData()
  const account = createAccountRoutes({ data, hashKey: SECRET, current: auth.current, now: () => now })
  const server = createPreviewServer({ quota: { consume: async () => 'ok' }, staticDir: dir, amazonState: null, log: () => {}, visitorCookieSecret: SECRET, auth, account })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const oauth = (await fetch(`${url}/auth/github`, { redirect: 'manual' })).headers.getSetCookie()[0]!.split(';')[0]!
  const session = (await fetch(`${url}/__/auth/handler?code=1`, { redirect: 'manual', headers: { cookie: oauth } })).headers.getSetCookie().find(line => line.startsWith('w2l_session='))!.split(';')[0]!
  return { url, data, cookie: session }
}

describe('the account page\'s data', () => {
  it('needs a session, and shows the month\'s grant, the usage of the last 30 days and the keys', async () => {
    const { url, data, cookie } = await start()
    expect((await fetch(`${url}/api/account`)).status).toBe(401)
    // No spending yet this month: the whole grant, with bought credits on top.
    data.balances.set('account-0001', { month: '2026-09', grant: 12, purchased: 40 })
    data.usageDays.set('a', { uid: 'account-0001', day: '2026-10-10', http: 3, browser: 1, notFound: 0, map: 1, unread: 2, credits: 9 })
    data.usageDays.set('b', { uid: 'account-0001', day: '2026-08-01', http: 9, browser: 0, notFound: 0, map: 0, unread: 0, credits: 9 })
    data.usageDays.set('c', { uid: 'someone-else', day: '2026-10-10', http: 5, browser: 0, notFound: 0, map: 0, unread: 0, credits: 5 })
    const body = await (await fetch(`${url}/api/account`, { headers: { cookie } })).json()
    expect(body).toEqual({
      email: 'ada@example.org',
      credits: { remaining: 1_040, monthly: { left: 1_000, of: 1_000, resetsAt: '2026-11-01T00:00:00.000Z' }, purchased: 40 },
      usage: [{ day: '2026-10-10', http: 3, browser: 1, notFound: 0, map: 1, unread: 2, credits: 9 }],
      keys: [],
    })
    data.balances.set('account-0001', { month: '2026-10', grant: 991, purchased: 40 })
    expect((await (await fetch(`${url}/api/account`, { headers: { cookie } })).json()).credits.monthly.left).toBe(991)
  })

  it('makes a key the hosted API will find, shows it once, lists it by prefix, and revokes only the account\'s own keys', async () => {
    const { url, data, cookie } = await start()
    const made = await fetch(`${url}/api/account/keys`, { method: 'POST', headers: { cookie, origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ label: '  laptop   agent ' }) })
    expect(made.status).toBe(201)
    const { key, id } = await made.json() as { key: string; id: string }
    expect(key).toMatch(/^oc_[A-Za-z0-9_-]{43}$/)
    // The id is the hosted API's lookup digest of the key (hostedApi.ts, keyDigest), and the account owns it.
    expect(id).toBe(createHmac('sha256', SECRET).update(`key:${key}`).digest('hex'))
    expect(data.keyRecords.get(id)).toMatchObject({ uid: 'account-0001', label: 'laptop agent', prefix: key.slice(0, 7), enabled: true })
    const listed = (await (await fetch(`${url}/api/account`, { headers: { cookie } })).json()).keys
    expect(listed).toEqual([{ id, label: 'laptop agent', prefix: key.slice(0, 7), createdAt: '2026-10-11T08:00:00.000Z', enabled: true }])
    expect(JSON.stringify(listed)).not.toContain(key)
    // Another account's key, or one from another site's page, is not revoked.
    data.keyRecords.set('f'.repeat(64), { id: 'f'.repeat(64), uid: 'someone-else', label: 'x', prefix: 'oc_abcd', createdAt: '', enabled: true })
    expect((await fetch(`${url}/api/account/keys/${'f'.repeat(64)}/revoke`, { method: 'POST', headers: { cookie, origin: url } })).status).toBe(404)
    expect((await fetch(`${url}/api/account/keys/${id}/revoke`, { method: 'POST', headers: { cookie, origin: 'https://evil.example' } })).status).toBe(403)
    expect((await fetch(`${url}/api/account/keys/${id}/revoke`, { method: 'POST', headers: { cookie, origin: url } })).status).toBe(204)
    expect(data.keyRecords.get(id)!.enabled).toBe(false)
    expect(data.keyRecords.get('f'.repeat(64))!.enabled).toBe(true)
  })

  it('holds at most five active keys, refuses a label with markup, and a key request from another site', async () => {
    const { url, cookie } = await start()
    const make = (body: unknown, origin = url) => fetch(`${url}/api/account/keys`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect((await make({ label: 'x' }, 'https://evil.example')).status).toBe(403)
    expect((await make({ label: '<script>' })).status).toBe(400)
    for (let i = 0; i < MAX_ACTIVE_KEYS; i++) expect((await make({})).status).toBe(201)
    const sixth = await make({})
    expect(sixth.status).toBe(409)
    expect(await sixth.json()).toEqual({ error: 'too_many_keys', limit: 5 })
  })
})
