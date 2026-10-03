import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildChannels } from '../src/ladderCli.js'
import type { SessionSnapshot } from '../src/routing/sessionStore.js'

/**
 * The authed rung in real Chromium against a local page that shows which
 * login it was sent: a login imported again (the old one expired) must be
 * the one used next, in the same long-running process.
 */

let server: Server
let base: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? 'nobody'
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><title>Account</title></head><body><main><h1>Account</h1><p>Signed in with session ${sid}. This page lists the orders and the saved addresses of the account that is signed in.</p></main></body></html>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const login = (sid: string): SessionSnapshot => ({
  domain: '127.0.0.1',
  attestedBy: 'test',
  attestedAt: '2026-10-03T00:00:00.000Z',
  vendor: 'browser_local_authed',
  cookies: [{ name: 'sid', value: sid, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }],
})

describe('authed rung, real browser', () => {
  it('uses the login it is handed, and a re-imported one replaces the old cookies', async () => {
    const channels = buildChannels('authed', {})
    const authed = channels.find((channel) => channel.id === 'authed_session')!
    try {
      const first = await authed.fetch(`${base}/account`, login('first-login'))
      expect(first.trace.some((event) => event.event === 'session_attached')).toBe(true)
      expect(first.markdown).toContain('Signed in with session first-login')
      const second = await authed.fetch(`${base}/account`, login('second-login'))
      expect(second.markdown).toContain('Signed in with session second-login')
    } finally {
      for (const channel of channels) await channel.close?.()
    }
  }, 60_000)
})
