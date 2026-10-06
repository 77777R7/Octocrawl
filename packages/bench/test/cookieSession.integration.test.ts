import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { TaskCookieSession } from '../src/cookieSession.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * A task's cookie session across rungs (ADR 0005 `egress_sessions`): a cookie a page's script set in
 * the real browser is sent by the HTTP rung on the task's next page, and the browser starts with the
 * session's cookies. The values reach no result.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const page = (body: string) => `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p>${body}</article></body></html>`
const GATE = 'cleared-by-script-7f3a'
let server: Server
let origin: string
const seen: { url: string; cookie: string | undefined }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? '', cookie: req.headers.cookie })
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    // A check a browser clears by running its script: the cookie is set by the page, not by a header.
    if (req.url === '/check') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page(`<script>document.cookie = 'gate=${GATE}; path=/'</script>`))
    if (req.url === '/data') {
      const ok = (req.headers.cookie ?? '').includes(`gate=${GATE}`)
      return void res.writeHead(ok ? 200 : 403, { 'content-type': 'text/html' }).end(ok ? page('') : '<h1>Forbidden</h1>')
    }
    if (req.url === '/echo') return void res.writeHead(200, { 'content-type': 'text/html' }).end(page(`<p>cookie header present: ${(req.headers.cookie ?? '').includes('sid=') ? 'yes' : 'no'}</p>`))
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('a task cookie session across the browser and HTTP rungs', () => {
  it('lets the HTTP rung send the cookie a page script set in the browser, values in no result', async () => {
    const browser = new BrowserLocalSubject('standard', null, false, localNetworkPolicy())
    const http = new ResilientHttpSubject('standard', localNetworkPolicy())
    const session = new TaskCookieSession()
    try {
      // Without the session, the data page refuses the HTTP rung.
      expect((await http.fetch(`${origin}/data`)).evidence.httpStatus).toBe(403)
      const cleared = await browser.fetch(`${origin}/check`, undefined, undefined, undefined, {}, undefined, session)
      expect(cleared.status).toBe('success')
      expect(cleared.trace).toContainEqual(expect.objectContaining({ event: 'session_cookies', detail: { session: session.id, startedWith: 0, kept: 1, removed: 0, read: true } }))
      const data = await http.fetch(`${origin}/data`, undefined, undefined, {}, undefined, {}, undefined, session)
      expect(data).toMatchObject({ status: 'success', evidence: { httpStatus: 200 } })
      expect(JSON.stringify([cleared, data])).not.toContain(GATE)
    } finally {
      await browser.teardown()
      await http.teardown()
    }
  })

  it('starts the browser with the cookies the session holds for the site', async () => {
    const browser = new BrowserLocalSubject('standard', null, false, localNetworkPolicy())
    const session = new TaskCookieSession()
    await session.store(`${origin}/`, ['sid=held-by-task; Path=/'])
    try {
      seen.length = 0
      const out = await browser.fetch(`${origin}/echo`, undefined, undefined, undefined, {}, undefined, session)
      expect(out.markdown).toContain('cookie header present: yes')
      expect(seen.find((r) => r.url === '/echo')?.cookie).toBe('sid=held-by-task')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'session_cookies', detail: expect.objectContaining({ session: session.id, startedWith: 1 }) }))
    } finally {
      await browser.teardown()
    }
  })
})
