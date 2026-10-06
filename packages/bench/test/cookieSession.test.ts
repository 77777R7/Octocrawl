import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { TaskCookieSession } from '../src/cookieSession.js'
import { CompatTransport } from '../src/compatTransport.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * A task's cookie session (ADR 0005 `egress_sessions`): RFC 6265 matching, and the HTTP rungs
 * (undici and impit) sending and keeping cookies through it, values never recorded.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p></article></body></html>`
const TOKEN = 'k9-secret-token-value'
let server: Server
let origin: string
const seen: { url: string; cookie: string | undefined }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? '', cookie: req.headers.cookie })
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    // The first page sets two cookies, one of them on a redirect hop; the second needs both.
    if (req.url === '/start') return void res.writeHead(302, { location: '/landing', 'set-cookie': [`token=${TOKEN}; Path=/; HttpOnly`] }).end()
    if (req.url === '/landing') return void res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': ['seen=1; Path=/', 'scoped=x; Path=/other'] }).end(PAGE)
    if (req.url === '/needs') {
      const ok = (req.headers.cookie ?? '').includes(`token=${TOKEN}`) && (req.headers.cookie ?? '').includes('seen=1')
      return void res.writeHead(ok ? 200 : 403, { 'content-type': 'text/html' }).end(ok ? PAGE : '<h1>Forbidden</h1>')
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('TaskCookieSession', () => {
  it('sends a cookie to the domain and path that set it, a Secure one over https only, and drops an expired one', async () => {
    const session = new TaskCookieSession()
    expect(await session.store('https://shop.example/a/page', ['sid=1; Path=/', 'deep=2; Path=/a', 'wide=3; Domain=shop.example; Path=/', 'safe=4; Path=/; Secure', 'old=5; Path=/; Expires=Thu, 01 Jan 2015 00:00:00 GMT'])).toBe(4)
    expect(await session.cookieHeader('https://shop.example/a/next')).toBe('deep=2; sid=1; wide=3; safe=4')
    expect(await session.cookieHeader('http://shop.example/b')).toBe('sid=1; wide=3')
    expect(await session.cookieHeader('https://www.shop.example/')).toBe('wide=3')
    expect(await session.cookieHeader('https://other.example/')).toBe('')
    // Another task's session holds none of them.
    expect(await new TaskCookieSession().cookieHeader('https://shop.example/a/next')).toBe('')
  })

  it('hands a browser context the cookies it holds, and keeps what the context changed, host-only or domain-wide', async () => {
    const session = new TaskCookieSession()
    await session.store('https://shop.example/', ['sid=1; Path=/; HttpOnly; SameSite=Strict'])
    const startedWith = await session.browserCookies('https://shop.example/')
    expect(startedWith).toEqual([{ name: 'sid', value: '1', domain: 'shop.example', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Strict' }])
    const changes = await session.storeBrowserChanges(startedWith, [
      ...startedWith,
      { name: 'cf', value: 'cleared', domain: '.shop.example', path: '/', expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: true, sameSite: 'None' },
      { name: 'host', value: 'h', domain: 'shop.example', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
    ])
    // The unchanged sid is not counted or rewritten.
    expect(changes).toEqual({ kept: 2, removed: 0 })
    expect(await session.cookieHeader('https://www.shop.example/')).toBe('cf=cleared')
    expect(await session.cookieHeader('https://shop.example/')).toBe('sid=1; cf=cleared; host=h')
  })

  it('never writes a stale copy over a newer value, and deletes what the page dropped unless another page changed it', async () => {
    const session = new TaskCookieSession()
    await session.store('https://shop.example/', ['sid=OLD; Path=/', 'gone=1; Path=/', 'raced=1; Path=/'])
    const startedWith = await session.browserCookies('https://shop.example/')
    // Meanwhile an HTTP page of the same task rotated sid and raced.
    await session.store('https://shop.example/', ['sid=NEW; Path=/', 'raced=2; Path=/'])
    // The context changed nothing but dropped gone and raced.
    const held = startedWith.filter((c) => c.name === 'sid')
    expect(await session.storeBrowserChanges(startedWith, held)).toEqual({ kept: 0, removed: 1 })
    expect(await session.cookieHeader('https://shop.example/')).toBe('sid=NEW; raced=2')
  })

})

describe('the HTTP rungs with a task cookie session', () => {
  const run = async (subject: ResilientHttpSubject, session?: TaskCookieSession) => {
    try {
      const first = await subject.fetch(`${origin}/start`, undefined, undefined, {}, undefined, {}, undefined, session)
      const second = await subject.fetch(`${origin}/needs`, undefined, undefined, {}, undefined, {}, undefined, session)
      return { first, second }
    } finally { await subject.teardown() }
  }

  for (const [name, make] of [
    ['undici', () => new ResilientHttpSubject('standard', localNetworkPolicy())],
    ['impit', () => new ResilientHttpSubject('standard', localNetworkPolicy(), undefined, undefined, false, null, false, undefined, new CompatTransport(localNetworkPolicy()))],
  ] as const) {
    it(`over ${name}: keeps the cookies of every hop and sends them to the next page of the site, counted, never valued`, async () => {
      seen.length = 0
      const session = new TaskCookieSession()
      const { first, second } = await run(make(), session)
      expect(first.status).toBe('success')
      expect(second).toMatchObject({ status: 'success', evidence: { httpStatus: 200 } })
      expect(seen.find((r) => r.url === '/landing')?.cookie).toBe(`token=${TOKEN}`)
      expect(seen.find((r) => r.url === '/needs')?.cookie).toBe(`token=${TOKEN}; seen=1`)
      expect(first.trace).toContainEqual(expect.objectContaining({ event: 'session_cookies', detail: { session: session.id, requestsWithCookies: 1, kept: 3 } }))
      expect(second.trace).toContainEqual(expect.objectContaining({ event: 'session_cookies', detail: { session: session.id, requestsWithCookies: 1, kept: 0 } }))
      expect(JSON.stringify([first, second])).not.toContain(TOKEN)
    })
  }

  it('without a session sends no cookie and keeps none, as before', async () => {
    seen.length = 0
    const { second } = await run(new ResilientHttpSubject('standard', localNetworkPolicy()))
    expect(second).toMatchObject({ evidence: { httpStatus: 403 } })
    expect(seen.every((r) => r.cookie === undefined)).toBe(true)
    expect(second.trace.map((e) => e.event)).not.toContain('session_cookies')
  })
})
