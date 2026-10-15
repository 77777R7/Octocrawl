import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { readinessOf } from '@w2l/runtime'

const padding = `<script>${'x'.repeat(100_000)}</script>`
let server: Server
let origin: string
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
    if (req.url === '/start-login') { res.writeHead(302, { location: '/login.html' }).end(); return }
    if (req.url === '/start-verification') { res.writeHead(302, { location: '/security_verification.html' }).end(); return }
    if (req.url?.startsWith('/datadome/')) {
      const kind = req.url.endsWith('/captcha') ? 'captcha' : 'interstitial'
      res.writeHead(403, { 'content-type': 'text/html', 'x-datadome': 'protected', 'x-datadome-cid': 'example' })
      res.end(`<html><body><iframe src="https://geo.captcha-delivery.com/${kind}/?initialCid=example"></iframe></body></html>`)
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(req.url === '/login.html'
      ? `<html><head><title>Shop</title>${padding}</head><body><h1>Register/Sign in</h1><input autocomplete="username webauthn"><button aria-label="passkey">Passkey</button></body></html>`
      : `<html><head><title>Security verification</title>${padding}</head><body><div>Security Verification</div><div>Fill each box with the required number of objects indicated</div><img src="/objects.png"><div role="button">Submit</div></body></html>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())) })

describe('interactive gate classification in the lane', () => {
  it.each([
    ['captcha', 'captcha', 'datadome_captcha'],
    ['interstitial', 'bot_detected_generic', 'header_x_datadome'],
  ])('classifies the DataDome %s behind its vendor headers', async (kind, reason, signal) => {
    const http = new ResilientHttpSubject('standard')
    try {
      const result = await http.fetch(`${origin}/datadome/${kind}`)
      expect(result.status).toBe('blocked')
      expect(result.blockReason).toBe(reason)
      expect(result.escalations).toContainEqual({
        from: 'http', to: kind === 'captcha' ? 'browser_local_authed' : 'browser_local',
        trigger: `blocked:${reason}`, improved: null,
      })
      expect(result.evidence.httpStatus).toBe(403)
      expect(readinessOf(result).state).toBe('not_served')
      expect(result.trace.find(event => event.event === 'gate_detected')?.detail?.signals).toContain(signal)
    } finally { await http.teardown() }
  })

  it.each([
    ['/start-login', '/login.html', 'login_wall'],
    ['/start-verification', '/security_verification.html', 'captcha'],
  ])('uses the final document URL on %s and reports not_served', async (start, finalPath, reason) => {
    const http = new ResilientHttpSubject('standard')
    try {
      const result = await http.fetch(`${origin}${start}`)
      expect(result.evidence.finalUrl).toBe(`${origin}${finalPath}`)
      expect(result.status).toBe('blocked')
      expect(result.blockReason).toBe(reason)
      expect(readinessOf({ ...result }).state).toBe('not_served')
      expect(result.trace.find(event => event.event === 'gate_detected')?.detail?.signals).toContain(reason === 'captcha' ? 'verification_url' : 'auth_url')
    } finally { await http.teardown() }
  })
})
