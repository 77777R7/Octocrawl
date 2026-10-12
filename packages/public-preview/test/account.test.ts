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
import { createAccountRoutes, MAX_ACTIVE_KEYS, MemoryAccountData, playgroundRequest, type AccountRoutesOptions } from '../src/account.js'
import { hostedNetworkPolicy } from '@w2l/contracts'
// The hosted API itself, so the Playground's signed header is checked by the code that serves it.
import { createHostedApi, MemoryHostedKeys, MemoryHostedQuota } from '../../mcp/src/hostedApi.js'
import { MemoryCreditsStore } from '../../mcp/src/hostedCredits.js'

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

async function start(now = new Date('2026-10-11T08:00:00Z'), hostedApi?: AccountRoutesOptions['hostedApi']) {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-account-')); dirs.push(dir)
  await writeFile(join(dir, '404.html'), '<title>Page not found</title>')
  const auth = createAuthRoutes({ identity, accounts: new MemoryAccountStore(), secret: SECRET })
  const data = new MemoryAccountData()
  const account = createAccountRoutes({ data, hashKey: SECRET, current: auth.current, now: () => now, ...(hostedApi ? { hostedApi } : {}) })
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
    })
    data.balances.set('account-0001', { month: '2026-10', grant: 991, purchased: 40 })
    expect((await (await fetch(`${url}/api/account`, { headers: { cookie } })).json()).credits.monthly.left).toBe(991)
  })

  it('lists the account\'s request lines newest first, only its own and only the last 30 days', async () => {
    const { url, data, cookie } = await start()
    expect((await fetch(`${url}/api/account/activity`)).status).toBe(401)
    const line = (id: string, at: string, extra = {}) => ({ id, at, endpoint: 'scrape', keyId: 'k'.repeat(64), url: 'https://example.org/', finalUrl: 'https://example.org/', lane: 'http', status: 'success', httpStatus: 200, reason: null, robots: 'allowed', sha256: 'f'.repeat(64), links: null, kind: 'http', credits: 1, ...extra })
    data.requestLines.set('account-0001', [line('8209-b', '2026-10-10T08:00:00.000Z'), line('8208-a', '2026-10-11T07:00:00.000Z', { endpoint: 'map', links: 12 }), line('8300-old', '2026-09-01T00:00:00.000Z')])
    data.requestLines.set('someone-else', [line('8000-x', '2026-10-11T07:30:00.000Z')])
    const body = await (await fetch(`${url}/api/account/activity`, { headers: { cookie } })).json() as { requests: Array<{ id: string }>; limit: number; retentionDays: number }
    expect(body.requests.map(r => r.id)).toEqual(['8208-a', '8209-b'])
    expect([body.limit, body.retentionDays]).toEqual([1_000, 30])
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
    const map = await run(url, cookie, { endpoint: 'map', url: `${api.page}/tides` })
    expect([map.status, map.headers.get('x-credits-used')]).toEqual([200, '1'])
    expect(((await map.json()) as { links: unknown[] }).links.length).toBeGreaterThan(0)
    // A page robots.txt keeps out costs nothing.
    const kept = await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/private` })
    expect([kept.status, kept.headers.get('x-credits-used'), kept.headers.get('x-credits-remaining')]).toEqual([200, '0', '998'])
    expect(api.credits.requests.get('account-0001')!.map(line => [line.endpoint, line.keyId, line.credits])).toEqual([
      ['scrape', 'playground:account-0001', 0], ['map', 'playground:account-0001', 1], ['scrape', 'playground:account-0001', 1],
    ])
  })

  it('needs a session and a request from the site, refuses what the page never asks for, and passes on a spent balance', async () => {
    const api = await hosted(1)
    const { url, cookie } = await start(new Date(), { origin: api.origin })
    expect((await fetch(`${url}/api/account/run`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
    expect((await run(url, cookie, { endpoint: 'scrape', url: `${api.page}/` }, 'https://evil.example')).status).toBe(403)
    for (const body of [{ endpoint: 'crawl', url: `${api.page}/` }, { endpoint: 'scrape', url: 'ftp://example.org/' }, { endpoint: 'scrape', url: 'not a url' }, { endpoint: 'scrape', url: `${api.page}/`, formats: ['screenshot'] }]) {
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

  it('builds the hosted body from what the page sends', () => {
    expect(playgroundRequest({ endpoint: 'scrape', url: ' https://example.org/a ', formats: ['links', 'markdown'], onlyMainContent: false })).toEqual({ endpoint: 'scrape', body: { url: 'https://example.org/a', formats: ['markdown', 'links'], onlyMainContent: false } })
    expect(playgroundRequest({ endpoint: 'map', url: 'https://example.org', limit: 999_999, search: ' docs ' })).toEqual({ endpoint: 'map', body: { url: 'https://example.org/', limit: 5_000, search: 'docs' } })
    expect(playgroundRequest({ endpoint: 'scrape', url: 'https://example.org/', formats: [] })).toBeNull()
  })
})
