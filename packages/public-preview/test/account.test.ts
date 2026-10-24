import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { createHmac } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreviewServer } from '../src/server.js'
import { createAuthRoutes, MemoryAccountStore, type IdentityProvider } from '../src/auth.js'
import { accountQuotaIds, createAccountRoutes, FirestoreAccountData, hostedJobPath, MAX_ACTIVE_KEYS, MemoryAccountData, playgroundRequest, type AccountRoutesOptions } from '../src/account.js'
import { accountConnections, MemoryOAuthStore, type GrantRecord } from '../src/oauth.js'
import { hostedNetworkPolicy } from '@w2l/contracts'
// The hosted API itself, so the Playground's signed header is checked by the code that serves it.
import { createHostedApi, keyDigest, MemoryHostedKeys, MemoryHostedQuota } from '../../mcp/src/hostedApi.js'
import { MemoryCreditsStore } from '../../mcp/src/hostedCredits.js'
import { MemoryHostedJobStore, newHostedJob } from '../../mcp/src/hostedJobs.js'

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
  async deleteAccount() {},
}

async function start(now = new Date('2026-10-11T08:00:00Z'), hostedApi?: AccountRoutesOptions['hostedApi'], connections?: AccountRoutesOptions['connections']) {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-account-')); dirs.push(dir)
  await writeFile(join(dir, '404.html'), '<title>Page not found</title>')
  const auth = createAuthRoutes({ identity, accounts: new MemoryAccountStore(), secret: SECRET })
  const data = new MemoryAccountData()
  const account = createAccountRoutes({ data, hashKey: SECRET, current: auth.current, now: () => now, ...(hostedApi ? { hostedApi } : {}), ...(connections ? { connections } : {}) })
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
    data.signInMethods.set('account-0001', ['github.com', 'emailLink'])
    data.usageDays.set('a', { uid: 'account-0001', day: '2026-10-10', http: 3, browser: 1, notFound: 0, map: 1, unread: 2, credits: 9 })
    data.usageDays.set('b', { uid: 'account-0001', day: '2026-08-01', http: 9, browser: 0, notFound: 0, map: 0, unread: 0, credits: 9 })
    data.usageDays.set('c', { uid: 'someone-else', day: '2026-10-10', http: 5, browser: 0, notFound: 0, map: 0, unread: 0, credits: 5 })
    const body = await (await fetch(`${url}/api/account`, { headers: { cookie } })).json()
    expect(body).toEqual({
      email: 'ada@example.org',
      providers: ['github.com', 'emailLink'],
      credits: { remaining: 1_040, monthly: { left: 1_000, of: 1_000, resetsAt: '2026-11-01T00:00:00.000Z' }, purchased: 40 },
      usage: [{ day: '2026-10-10', http: 3, browser: 1, notFound: 0, map: 1, unread: 2, credits: 9 }],
      keys: [],
      // No OAuth connections served here: an empty list, not a missing field.
      connections: [],
    })
    data.balances.set('account-0001', { month: '2026-10', grant: 991, purchased: 40 })
    expect((await (await fetch(`${url}/api/account`, { headers: { cookie } })).json()).credits.monthly.left).toBe(991)
  })

  it('lists the account\'s request lines newest first, only its own and only the last 30 days', async () => {
    const { url, data, cookie } = await start()
    expect((await fetch(`${url}/api/account/activity`)).status).toBe(401)
    const line = (id: string, at: string, extra = {}) => ({ id, at, endpoint: 'scrape', keyId: 'k'.repeat(64), url: 'https://example.org/', finalUrl: 'https://example.org/', lane: 'http', status: 'success', httpStatus: 200, reason: null, robots: 'allowed', sha256: 'f'.repeat(64), links: null, kind: 'http', credits: 1, formats: null, ms: null, ...extra })
    data.requestLines.set('account-0001', [line('8209-b', '2026-10-10T08:00:00.000Z'), line('8208-a', '2026-10-11T07:00:00.000Z', { endpoint: 'map', links: 12 }), line('8300-old', '2026-09-01T00:00:00.000Z')])
    data.requestLines.set('someone-else', [line('8000-x', '2026-10-11T07:30:00.000Z')])
    const body = await (await fetch(`${url}/api/account/activity`, { headers: { cookie } })).json() as { requests: Array<{ id: string }>; limit: number; retentionDays: number }
    expect(body.requests.map(r => r.id)).toEqual(['8208-a', '8209-b'])
    expect([body.limit, body.retentionDays]).toEqual([1_000, 30])
  })

  it('erases the account\'s keys, daily usage, request lines, credits, settled charges and OAuth connections from Firestore, a page at a time', async () => {
    const root = 'projects/octocrawl-test/databases/(default)/documents'
    const deleted: string[] = []
    const left: Record<string, string[]> = {
      hostedApiKeys: ['k1', 'k2'].map(id => `${root}/hostedApiKeys/${id}`),
      creditUsage: ['account-0001-2026-10-12', 'account-0001-2026-10-13'].map(id => `${root}/creditUsage/${id}`),
      // A connection's grant, its code and its tokens (oauth.ts), each kept with the account's uid.
      ...Object.fromEntries(['oauthGrants', 'oauthCodes', 'oauthTokens', 'oauthRefresh'].map(collection => [collection, [`${root}/${collection}/${collection}-1`]])),
      // Hosted jobs and their idempotency keys, each kept with the account's uid (packages/mcp/src/hostedJobs.ts).
      hostedJobs: [`${root}/hostedJobs/job-1`],
      hostedJobIdempotency: [`${root}/hostedJobIdempotency/ws_account-0001-abc`],
      // The jobs' settled charges, each kept with the account's uid (packages/mcp/src/hostedCredits.ts).
      creditSettles: ['job-1-0-h1', 'job-1-1-h2'].map(id => `${root}/creditSettles/${id}`),
      files: ['w/ws_account-0001/jobs/job-1/pages/00000.jsonl.gz', 'w/ws_account-0001/jobs/job-1/checkpoint.sqlite'],
      requests: Array.from({ length: 450 }, (_, i) => `${root}/requestLog/account-0001/requests/${String(i).padStart(4, '0')}`),
    }
    const fetcher = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'token' })
      if (url.endsWith(':runQuery')) {
        const body = JSON.parse(String(init!.body)) as { structuredQuery: { from: Array<{ collectionId: string }>; where: { fieldFilter: { value: { stringValue: string } } } } }
        expect(body.structuredQuery.where.fieldFilter.value.stringValue).toBe('account-0001')
        return Response.json(left[body.structuredQuery.from[0]!.collectionId]!.slice(0, 200).map(name => ({ document: { name } })))
      }
      if (url.includes('/requestLog/account-0001/requests?')) return Response.json({ documents: left.requests!.slice(0, 300).map(name => ({ name })) })
      if (url.startsWith('https://storage.googleapis.com/storage/v1/b/octocrawl-jobs/o?')) {
        expect(new URL(url).searchParams.get('prefix')).toBe('w/ws_account-0001/')
        return Response.json({ items: left.files!.map(name => ({ name })) })
      }
      if (url.startsWith('https://storage.googleapis.com/storage/v1/b/octocrawl-jobs/o/') && init?.method === 'DELETE') {
        const name = decodeURIComponent(url.slice('https://storage.googleapis.com/storage/v1/b/octocrawl-jobs/o/'.length))
        left.files!.splice(left.files!.indexOf(name), 1)
        deleted.push(`gcs:${name}`)
        return new Response(null, { status: 204 })
      }
      if (url.endsWith(':commit')) {
        const names = (JSON.parse(String(init!.body)) as { writes: Array<{ delete: string }> }).writes.map(write => write.delete)
        expect(names.length).toBeLessThanOrEqual(500)
        deleted.push(...names)
        for (const list of Object.values(left)) for (const name of names) { const at = list.indexOf(name); if (at >= 0) list.splice(at, 1) }
        return Response.json({})
      }
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch
    await new FirestoreAccountData('octocrawl-test', fetcher, 'octocrawl-jobs').erase('account-0001', new Date('2026-11-01T05:00:00Z'))
    expect(Object.values(left).flat()).toEqual([])
    // Keys, usage, OAuth, jobs and idempotency keys, settled charges, the workspace's slots, request lines, the balance,
    // three days' counters, and two job files.
    expect(deleted).toHaveLength(2 + 2 + 4 + 2 + 2 + 1 + 450 + 1 + 6 + 2)
    expect(deleted).toContain(`${root}/hostedJobWorkspaces/ws_account-0001`)
    expect(deleted).toEqual(expect.arrayContaining([`${root}/creditSettles/job-1-0-h1`, `${root}/creditSettles/job-1-1-h2`]))
    // The balance first: a call under way cannot then settle and write usage back.
    expect(deleted[0]).toBe(`${root}/credits/account-0001`)
    // With it, the account's daily counters for calls and job pages, by name: they hold no uid to query by.
    expect(deleted.slice(1, 7)).toEqual(['2026-11-01', '2026-10-31', '2026-10-30'].flatMap(day => [`${root}/hostedQuotas/${day}-account-account-0001`, `${root}/hostedQuotas/${day}-jobs-account-account-0001`]))
    await expect(new FirestoreAccountData('octocrawl-test', fetcher).erase('__x__')).rejects.toThrow(/malformed/)
    // In memory, as the routes' tests use it: nothing of the account is left, another account's things are.
    const memory = new MemoryAccountData()
    for (const uid of ['account-0001', 'account-0002']) {
      memory.balances.set(uid, { month: '2026-10', grant: 900, purchased: 0 })
      memory.usageDays.set(`${uid}-2026-10-12`, { uid, day: '2026-10-12', http: 1, browser: 0, notFound: 0, map: 0, unread: 0, credits: 1 })
      memory.keyRecords.set(`key-${uid}`, { uid, id: `key-${uid}`, label: 'k', prefix: 'oc_x', createdAt: '2026-10-12T00:00:00Z', enabled: true })
      memory.requestLines.set(uid, [])
    }
    await memory.erase('account-0001')
    expect([[...memory.balances.keys()], [...memory.usageDays.values()].map(day => day.uid), [...memory.keyRecords.values()].map(key => key.uid), [...memory.requestLines.keys()]])
      .toEqual([['account-0002'], ['account-0002'], ['account-0002'], ['account-0002']])
  })

  it('lists the account\'s own keys from Firestore, not the key records its OAuth connections act as', async () => {
    const root = 'projects/octocrawl-test/databases/(default)/documents'
    const fetcher = (async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'token' })
      if (url.endsWith(':runQuery')) return Response.json([
        { document: { name: `${root}/hostedApiKeys/${'a'.repeat(64)}`, fields: { uid: { stringValue: 'account-0001' }, label: { stringValue: 'laptop' }, prefix: { stringValue: 'oc_abcd' }, createdAt: { timestampValue: '2026-10-12T00:00:00Z' }, enabled: { booleanValue: true } } } },
        { document: { name: `${root}/hostedApiKeys/oauth_grant-1`, fields: { uid: { stringValue: 'account-0001' }, label: { stringValue: 'ChatGPT (chatgpt.com)' }, kind: { stringValue: 'oauth' }, createdAt: { timestampValue: '2026-10-16T00:00:00Z' }, enabled: { booleanValue: true } } } },
      ])
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch
    expect((await new FirestoreAccountData('octocrawl-test', fetcher).keys('account-0001')).map(key => key.label)).toEqual(['laptop'])
  })

  it('reads a request line\'s formats and duration from Firestore, and leaves them null on a line written before them', async () => {
    const doc = (id: string, extra: Record<string, unknown>) => ({ document: { name: `projects/p/databases/(default)/documents/requestLog/account-0001/requests/${id}`, fields: {
      at: { timestampValue: '2026-10-12T10:00:00Z' }, endpoint: { stringValue: 'scrape' }, keyId: { stringValue: 'k'.repeat(64) }, url: { stringValue: 'https://example.org/' },
      status: { stringValue: 'success' }, kind: { stringValue: 'http' }, credits: { integerValue: '1' }, ...extra,
    } } })
    const fetcher = (async (input: string | URL) => {
      if (String(input).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'token' })
      return Response.json([
        doc('1-a', { formats: { arrayValue: { values: [{ stringValue: 'markdown' }, { stringValue: 'json' }] } }, ms: { integerValue: '1834' } }),
        doc('2-b', { formats: { arrayValue: {} }, ms: { integerValue: '12' } }),
        doc('3-c', {}),
      ])
    }) as typeof fetch
    const lines = await new FirestoreAccountData('octocrawl-test', fetcher).requests('account-0001', 10)
    expect(lines.map(line => [line.id, line.formats, line.ms])).toEqual([['1-a', ['markdown', 'json'], 1834], ['2-b', [], 12], ['3-c', null, null]])
  })

  it('remembers what was left of the month under the address\'s key, and carries it to a new account only', async () => {
    const root = 'projects/octocrawl-test/databases/(default)/documents'
    const key = 'a'.repeat(64)
    const NOW = new Date('2026-10-20T12:00:00Z')
    let balance: Record<string, unknown> | null = { month: { stringValue: '2026-10' }, grant: { integerValue: '120' }, purchased: { integerValue: '300' } }
    let kept: Record<string, unknown> | null = null
    let commitStatus = 200
    const commits: unknown[] = []
    const fetcher = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'token' })
      if (url.endsWith(':commit')) { commits.push(JSON.parse(String(init!.body))); return new Response('{}', { status: commitStatus }) }
      if (url.endsWith('/credits/account-0001')) return balance ? Response.json({ name: `${root}/credits/account-0001`, fields: balance }) : new Response('{}', { status: 404 })
      if (url.endsWith(`/creditCarry/${key}`)) return kept ? Response.json({ name: `${root}/creditCarry/${key}`, fields: kept }) : new Response('{}', { status: 404 })
      throw new Error(`unexpected ${url}`)
    }) as typeof fetch
    const data = new FirestoreAccountData('octocrawl-test', fetcher)
    await data.rememberCredits('account-0001', key, 1_000, NOW)
    // The month, what was left of the free grant (not the bought credits), and the month's end for the TTL.
    expect(commits).toEqual([{ writes: [{ update: { name: `${root}/creditCarry/${key}`, fields: { month: { stringValue: '2026-10' }, left: { integerValue: '120' }, expireAt: { timestampValue: '2026-11-01T00:00:00.000Z' } } } }] }])
    // A month not spent in, a grant given back in full, or no balance: nothing to remember.
    for (const next of [{ month: { stringValue: '2026-09' }, grant: { integerValue: '5' } }, { month: { stringValue: '2026-10' }, grant: { integerValue: '1000' } }, null]) {
      balance = next
      await data.rememberCredits('account-0001', key, 1_000, NOW)
    }
    expect(commits).toHaveLength(1)
    // Carried: a balance made only if the account has none, and the record deleted in the same commit.
    kept = { month: { stringValue: '2026-10' }, left: { integerValue: '120' } }
    await data.carryCredits('account-0002', key, NOW)
    expect(commits.at(-1)).toEqual({ writes: [
      { update: { name: `${root}/credits/account-0002`, fields: { month: { stringValue: '2026-10' }, grant: { integerValue: '120' }, purchased: { integerValue: '0' } } }, currentDocument: { exists: false } },
      { delete: `${root}/creditCarry/${key}` },
    ] })
    // An account with a balance keeps it (409); another month's record counts for nothing; a broken commit says so.
    commitStatus = 409
    await expect(data.carryCredits('account-0002', key, NOW)).resolves.toBeUndefined()
    const before = commits.length
    kept = { month: { stringValue: '2026-09' }, left: { integerValue: '3' } }
    await data.carryCredits('account-0002', key, NOW)
    expect(commits).toHaveLength(before)
    kept = { month: { stringValue: '2026-10' }, left: { integerValue: '3' } }
    commitStatus = 500
    await expect(data.carryCredits('account-0002', key, NOW)).rejects.toThrow(/credit carry failed/)
    await expect(data.carryCredits('account-0002', 'not-a-key', NOW)).rejects.toThrow(/malformed/)
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

  it('lists the account\'s live OAuth connections, and disconnects only its own, from this site', async () => {
    const now = new Date('2026-10-11T08:00:00Z')
    const store = new MemoryOAuthStore()
    const id = (letter: string) => letter.repeat(24)
    const grant = (uid: string, extra: Partial<GrantRecord> = {}): GrantRecord => ({ uid, clientId: 'https://chatgpt.com/oauth/client.json', clientName: 'ChatGPT', redirectHost: 'chatgpt.com', keyId: '', createdAt: Date.parse('2026-10-09T10:00:00Z'), lastUsedAt: Date.parse('2026-10-11T07:00:00Z'), revoked: false, connected: true, ...extra })
    for (const [letter, record] of [['a', grant('account-0001')], ['b', grant('someone-else')], ['c', grant('account-0001', { connected: false })], ['d', grant('account-0001', { revoked: true })], ['e', grant('account-0001', { lastUsedAt: Date.parse('2026-07-01T00:00:00Z') })]] as const) {
      store.grants.set(id(letter), { ...record, keyId: `oauth_${id(letter)}` })
      store.keys.set(`oauth_${id(letter)}`, { enabled: !record.revoked, uid: record.uid, kind: 'oauth', grantId: id(letter), label: 'ChatGPT (chatgpt.com)', plan: 'account', browser: true, createdAt: record.createdAt })
      store.refreshTokens.set(`refresh-${letter}`, { grantId: id(letter), uid: record.uid, clientId: record.clientId, keyId: `oauth_${id(letter)}`, resource: 'https://mcp.octocrawl.dev/mcp-oauth', expiresAt: now.getTime() + 86_400_000, used: false, version: 0 })
    }
    const { url, cookie } = await start(now, undefined, accountConnections(store))
    // Only what is connected now: not another account's, one never exchanged, one disconnected, or one 90 days unused.
    const expected = [{ id: id('a'), keyId: `oauth_${id('a')}`, name: 'ChatGPT', host: 'chatgpt.com', createdAt: '2026-10-09T10:00:00.000Z', lastUsedAt: '2026-10-11T07:00:00.000Z' }]
    expect((await (await fetch(`${url}/api/account`, { headers: { cookie } })).json()).connections).toEqual(expected)
    expect(await (await fetch(`${url}/api/account/connections`, { headers: { cookie } })).json()).toEqual({ connections: expected })
    expect((await fetch(`${url}/api/account/connections`)).status).toBe(401)
    const disconnect = (grantId: string, origin = url) => fetch(`${url}/api/account/connections/${grantId}/revoke`, { method: 'POST', headers: { cookie, origin } })
    expect((await disconnect(id('b'))).status).toBe(404)
    expect((await disconnect(id('a'), 'https://evil.example')).status).toBe(403)
    expect((await disconnect('not-an-id')).status).toBe(404)
    expect((await disconnect(id('a'))).status).toBe(204)
    // The grant is marked, its key stops (within the hosted API's minute of cache), and its refresh tokens are gone.
    expect(store.grants.get(id('a'))!.revoked).toBe(true)
    expect(store.keys.get(`oauth_${id('a')}`)!.enabled).toBe(false)
    expect([...store.refreshTokens.keys()].sort()).toEqual(['refresh-b', 'refresh-c', 'refresh-d', 'refresh-e'])
    expect(store.grants.get(id('b'))!.revoked).toBe(false)
    expect((await (await fetch(`${url}/api/account/connections`, { headers: { cookie } })).json()).connections).toEqual([])
    expect((await disconnect(id('a'))).status).toBe(404)
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

describe('the Playground', () => {
  const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${'The harbour office records tide height, wind and visibility for every hour. '.repeat(5)}</p></article></main></body></html>`
  async function hosted(balance = 1_000) {
    const site = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private\n')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
    })
    site.listen(0, '127.0.0.1'); await once(site, 'listening'); servers.push(site)
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>(resolve => probe.close(() => resolve()))
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-playground-')); dirs.push(taskRoot)
    const credits = new MemoryCreditsStore(balance)
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot, hashKey: SECRET, keys: new MemoryHostedKeys(new Map()), quota: new MemoryHostedQuota(), credits, siteDaily: 100,
      networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }, log: () => {},
    })
    if (!service.server.listening) await once(service.server, 'listening')
    closers.push(service.close)
    return { origin: `http://127.0.0.1:${port}`, page: `http://127.0.0.1:${(site.address() as AddressInfo).port}`, credits }
  }
  const closers: Array<() => Promise<void>> = []
  afterEach(async () => { await Promise.all(closers.splice(0).map(close => close())) })
  const run = (url: string, cookie: string, body: unknown, origin = url) => fetch(`${url}/api/account/run`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('scrapes and maps for the signed-in account through the hosted API, which charges its credits and logs the call', async () => {
    const api = await hosted()
    const { url, cookie } = await start(new Date(), { origin: api.origin })
    const page = await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/tides`, formats: ['markdown'] })
    expect(page.status).toBe(200)
    expect([page.headers.get('x-credits-used'), page.headers.get('x-credits-remaining'), page.headers.get('cache-control')]).toEqual(['1', '999', 'no-store'])
    const result = await page.json() as { status: string; markdown: string; evidenceRecord: { requestedUrl: string; rawSha256: string; robotsDecision: { decision: string } } }
    expect(result.status).toBe('success')
    expect(result.markdown).toContain('Tides')
    expect(result.evidenceRecord).toMatchObject({ requestedUrl: `${api.page}/tides`, robotsDecision: { decision: 'allowed' } })
    expect(result.evidenceRecord.rawSha256).toMatch(/^[0-9a-f]{64}$/)
    // The fields, as the home page asks for them: one run, read from the page, each with its status.
    const fields = await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/tides`, formats: ['markdown', 'links', { type: 'json', schema: { type: 'object', properties: { price: { type: ['number', 'null'] } }, required: ['price'], additionalProperties: false } }] })
    expect([fields.status, fields.headers.get('x-credits-used')]).toEqual([200, '1'])
    const read = await fields.json() as { markdown: string; links: unknown[]; metadata: { title: string | null }; json: { status: string; data: unknown; schemaSha256: string } }
    expect(read.markdown).toContain('Tides')
    expect(Array.isArray(read.links)).toBe(true)
    expect(read.metadata.title).toBe('Tides')
    expect(read.json).toMatchObject({ data: { price: null }, schemaSha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
    const map = await run(url, cookie, { endpoint: 'map', url: `${api.page}/tides` })
    expect([map.status, map.headers.get('x-credits-used')]).toEqual([200, '1'])
    expect(((await map.json()) as { links: unknown[] }).links.length).toBeGreaterThan(0)
    // A page robots.txt keeps out costs nothing.
    const kept = await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/private` })
    expect([kept.status, kept.headers.get('x-credits-used'), kept.headers.get('x-credits-remaining')]).toEqual([200, '0', '997'])
    expect(api.credits.requests.get('account-0001')!.map(line => [line.endpoint, line.keyId, line.credits])).toEqual([
      ['scrape', 'playground:account-0001', 0], ['map', 'playground:account-0001', 1], ['scrape', 'playground:account-0001', 1], ['scrape', 'playground:account-0001', 1],
    ])
    // Deleting the account finds, by name, the daily counter the hosted API keeps for it.
    const counters = [...api.credits.site.keys()].filter(id => id.includes('account-0001'))
    expect(counters).toHaveLength(1)
    expect(accountQuotaIds('account-0001', new Date())).toContain(counters[0])
  })

  it('needs a session and a request from the site, refuses what the page never asks for, and passes on a spent balance', async () => {
    const api = await hosted(1)
    const { url, cookie } = await start(new Date(), { origin: api.origin })
    expect((await fetch(`${url}/api/account/run`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
    expect((await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/` }, 'https://evil.example')).status).toBe(403)
    for (const body of [{ endpoint: 'crawl', url: `${api.page}/` }, { endpoint: 'scrape', url: 'ftp://example.org/' }, { endpoint: 'scrape', url: 'not a url' }, { endpoint: 'scrape', url: `${api.page}/`, formats: ['screenshot'] }, { endpoint: 'scrape', url: `${api.page}/`, formats: ['html'] }]) {
      expect((await run(url, cookie, body)).status, JSON.stringify(body)).toBe(400)
    }
    expect((await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/one` })).headers.get('x-credits-remaining')).toBe('0')
    const spent = await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/two` })
    expect(spent.status).toBe(429)
    expect(Number(spent.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(((await spent.json()) as { code: string }).code).toBe('quota_exhausted')
  })

  it('answers 503 without a hosted API, and 502 when the hosted API cannot be reached or refuses the site', async () => {
    const without = await start(new Date())
    expect((await run(without.url, without.cookie, { endpoint: 'map', url: 'https://example.org/' })).status).toBe(503)
    const down = await start(new Date(), { origin: 'http://127.0.0.1:9', fetcher: async () => { throw new TypeError('fetch failed') } })
    const response = await run(down.url, down.cookie, { endpoint: 'map', url: 'https://example.org/' })
    expect([response.status, await response.json()]).toEqual([502, { error: 'hosted_unavailable' }])
    // A header the hosted API refuses (its secret differs) is the site's fault: 502, not the 401 that means signed out.
    const refused = await start(new Date(), { origin: 'http://127.0.0.1:9', fetcher: async () => new Response('{"code":"unauthorized"}', { status: 401 }) })
    const answer = await run(refused.url, refused.cookie, { endpoint: 'map', url: 'https://example.org/' })
    expect([answer.status, await answer.json()]).toEqual([502, { error: 'hosted_refused' }])
  })

  it('holds a scrape to the home page\'s preview rules: one extraction with every view, and the fields when asked for', () => {
    // As the preview: Markdown and links by default, the whole page when asked, and up to 20 fields as a JSON Schema.
    expect(playgroundRequest({ endpoint: 'scrape', url: ' https://example.org/a ' })).toEqual({ endpoint: 'scrape', body: { url: 'https://example.org/a', formats: ['markdown', 'links'] } })
    expect(playgroundRequest({ endpoint: 'scrape', url: 'https://example.org/a', onlyMainContent: false })).toEqual({ endpoint: 'scrape', body: { url: 'https://example.org/a', formats: ['markdown', 'links'], onlyMainContent: false } })
    const schema = { type: 'object', properties: { price: { type: ['number', 'null'] } }, required: ['price'], additionalProperties: false }
    expect(playgroundRequest({ endpoint: 'scrape', url: 'https://example.org/a', formats: ['markdown', 'links', { type: 'json', schema }] })).toEqual({ endpoint: 'scrape', body: { url: 'https://example.org/a', formats: ['markdown', 'links', { type: 'json', schema }] } })
    // An Amazon.sg product page takes no options and comes with its checked product JSON.
    expect(playgroundRequest({ endpoint: 'scrape', url: 'https://www.amazon.sg/dp/B0CHX1W1XY' })).toEqual({ endpoint: 'scrape', body: { url: 'https://www.amazon.sg/dp/B0CHX1W1XY', formats: ['markdown', 'links', 'json'] } })
    // What the preview refuses, the Playground refuses: other formats, an empty list, a model prompt, more than 20 fields.
    for (const extra of [{ formats: ['html'] }, { formats: [] }, { formats: ['screenshot'] }, { formats: [{ type: 'json', prompt: 'the price' }] }, { actions: [] },
      { formats: [{ type: 'json', schema: { type: 'object', properties: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`f${i}`, { type: 'string' }])) } }] }]) {
      expect(playgroundRequest({ endpoint: 'scrape', url: 'https://example.org/', ...extra }), JSON.stringify(extra)).toBeNull()
    }
    expect(playgroundRequest({ endpoint: 'map', url: 'https://example.org', limit: 999_999, search: ' docs ' })).toEqual({ endpoint: 'map', body: { url: 'https://example.org/', limit: 5_000, search: 'docs' } })
  })
})

describe('the Jobs page', () => {
  // The hosted API with jobs on and no worker, and a key of another account; the page reads the signed-in account's
  // (account-0001) jobs through the site's signed header.
  async function hosted() {
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>(resolve => probe.close(() => resolve()))
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-jobs-page-')); dirs.push(taskRoot)
    const store = new MemoryHostedJobStore()
    const keys = new MemoryHostedKeys(new Map([
      [keyDigest(SECRET, 'oc_theirs'), { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-0002' }],
    ]))
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot, hashKey: SECRET, keys, quota: new MemoryHostedQuota(), credits: new MemoryCreditsStore(1_000), networkPolicy: hostedNetworkPolicy(), log: () => {},
      // Starts are invite only and the signed-in account is not invited: its reads still answer.
      jobs: { store, files: { segment: async () => null, exportUrl: async job => `https://storage.example/${job.id}.jsonl.gz?signed` }, enqueueSlice: async () => {}, allows: async () => false },
    })
    if (!service.server.listening) await once(service.server, 'listening')
    closers.push(service.close)
    const origin = `http://127.0.0.1:${port}`
    return { origin, store }
  }
  const closers: Array<() => Promise<void>> = []
  afterEach(async () => { await Promise.all(closers.splice(0).map(close => close())) })
  const read = async (url: string, cookie: string, path: string) => { const response = await fetch(`${url}${path}`, { headers: { cookie } }); return [response.status, await response.json()] as [number, Record<string, unknown>] }
  /** A job of `uid`, as a start writes it (the gate refuses starts here, so the store takes it directly), one page read. */
  const job = async (store: MemoryHostedJobStore, id: string, uid: string, kind: 'batch' | 'crawl', createdAt: string) => {
    const request = kind === 'batch' ? { urls: ['https://example.com/a', 'https://example.com/b'] } : { url: 'https://example.com/', maxPages: 100 }
    await store.create(newHostedJob({ id, workspaceId: `ws_${uid}`, uid, keyId: 'oc_mine', kind, request, maxCredits: null }, new Date(createdAt)), { maxRunning: 2, maxQueued: 10 }, null)
    const made = store.jobs.get(id)!
    store.jobs.set(id, { ...made, status: 'running', counts: { pages: 1, errors: 0, slices: 1 }, credits: { ...made.credits, used: 1 } })
  }
  const A = '6f1c2a4e-1b2c-4d3e-8f90-0123456789aa'
  const B = '6f1c2a4e-1b2c-4d3e-8f90-0123456789bb'
  const OTHER = '6f1c2a4e-1b2c-4d3e-8f90-0123456789cc'

  it('lists the account\'s jobs a page at a time, reads one job, and gives a finished job\'s export link', async () => {
    const api = await hosted()
    await job(api.store, A, 'account-0001', 'batch', '2026-10-21T08:00:00.000Z')
    await job(api.store, B, 'account-0001', 'crawl', '2026-10-21T09:00:00.000Z')
    await job(api.store, OTHER, 'account-0002', 'crawl', '2026-10-21T10:00:00.000Z')
    const { url, cookie } = await start(new Date(), { origin: api.origin })
    const [status, first] = await read(url, cookie, '/api/account/jobs?limit=1')
    expect(status).toBe(200)
    expect(first).toMatchObject({ items: [{ taskId: B, kind: 'crawl', status: 'running', pagesFetched: 1 }], nextBefore: B, hasMore: true })
    const [, second] = await read(url, cookie, `/api/account/jobs?limit=1&before=${B}`)
    expect(second).toMatchObject({ items: [{ taskId: A, kind: 'batch', requested: 2, remaining: 1, credits: { used: 1, maxCredits: null } }], nextBefore: null, hasMore: false })
    expect(await read(url, cookie, `/api/account/jobs/batches/${A}`)).toMatchObject([200, { taskId: A, status: 'running' }])
    // Another account's job, or a job asked for under the other kind, is not found.
    expect((await read(url, cookie, `/api/account/jobs/crawl/${OTHER}`))[0]).toBe(404)
    expect((await read(url, cookie, `/api/account/jobs/crawl/${A}`))[0]).toBe(404)
    // A running job has no export yet; a finished one has a link.
    expect((await read(url, cookie, `/api/account/jobs/${A}/export`))[0]).toBe(409)
    api.store.jobs.set(A, { ...api.store.jobs.get(A)!, status: 'completed', finishedAt: '2026-10-21T08:05:00.000Z', expireAt: new Date(Date.now() + 86_400_000).toISOString() })
    expect(await read(url, cookie, `/api/account/jobs/${A}/export`)).toEqual([200, { url: `https://storage.example/${A}.jsonl.gz?signed`, expiresInSeconds: 900 }])
  })

  it('needs a session, reads only, refuses a bad id or query, and answers 503 without a hosted API and 502 when it refuses the site', async () => {
    const api = await hosted()
    const { url, cookie } = await start(new Date(), { origin: api.origin })
    expect((await fetch(`${url}/api/account/jobs`)).status).toBe(401)
    expect(await read(url, cookie, '/api/account/jobs')).toEqual([200, { items: [], nextBefore: null, hasMore: false }])
    expect((await fetch(`${url}/api/account/jobs/batches/${A}`, { method: 'POST', headers: { cookie, origin: url } })).status).toBe(405)
    for (const path of ['/api/account/jobs?limit=0', '/api/account/jobs?limit=51', '/api/account/jobs?before=x', `/api/account/jobs/batches/${A}/cancel`, '/api/account/jobs/x/export']) {
      expect((await read(url, cookie, path))[0], path).toBe(400)
    }
    const without = await start(new Date())
    expect((await read(without.url, without.cookie, '/api/account/jobs'))[0]).toBe(503)
    const refused = await start(new Date(), { origin: 'http://127.0.0.1:9', fetcher: async () => new Response('{"code":"unauthorized"}', { status: 401 }) })
    expect(await read(refused.url, refused.cookie, '/api/account/jobs')).toEqual([502, { error: 'hosted_refused' }])
  })

  it('maps only the reads the page makes', () => {
    const q = (search = '') => new URLSearchParams(search)
    expect(hostedJobPath('/api/account/jobs', q())).toBe('/v1/jobs?limit=20')
    expect(hostedJobPath('/api/account/jobs', q(`limit=50&before=${A}`))).toBe(`/v1/jobs?limit=50&before=${A}`)
    expect(hostedJobPath(`/api/account/jobs/crawl/${A}`, q())).toBe(`/v1/crawl/${A}`)
    expect(hostedJobPath(`/api/account/jobs/${A}/export`, q())).toBe(`/v1/jobs/${A}/export`)
    expect(hostedJobPath('/api/account/jobs', q('limit=05'))).toBeNull()
    expect(hostedJobPath(`/api/account/jobs/jobs/${A}`, q())).toBeNull()
    expect(hostedJobPath('/api/account/activity', q())).toBeUndefined()
  })
})
