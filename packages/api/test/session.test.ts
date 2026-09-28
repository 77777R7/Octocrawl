import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.js'
import { createApiEngine } from '../src/engine.js'

describe('B3 managed session API', () => {
  let root: string | undefined
  let engine: ReturnType<typeof createApiEngine> | undefined
  // The capture step targets a loopback origin, not the live internet, so the
  // lifecycle assertions cannot fail on a third-party site's availability.
  let server: Server
  let origin: string
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('User-agent: *\nAllow: /\n')
      } else if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><html><body><article><h1>Managed session</h1>'
          + '<p>This page is served to the managed session capture so the lifecycle test exercises a real browser navigation without depending on the public internet.</p>'
          + '</article></body></html>')
      } else {
        res.writeHead(404).end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no address')
    origin = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })
  afterEach(async () => { await engine?.close(); if (root) await rm(root, { recursive: true, force: true }) })

  it('creates, waits for, authorizes, captures with, and revokes a managed session', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-b3-api-'))
    engine = createApiEngine({ taskRoot: root })
    const app = createApp(engine)
    const created = await app.request('/v1/sessions/managed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: 'w1', accountRef: 'acct-a', originScope: origin }) })
    expect(created.status).toBe(201)
    const session = await created.json() as { sessionRef: string; state: string; grantEpoch: number }
    expect(session.state).toBe('waiting_user')

    const waiting = await app.request(`/v1/sessions/${session.sessionRef}/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: 'w1', accountRef: 'acct-a', url: `${origin}/` }) })
    expect((await waiting.json() as { kind: string }).kind).toBe('waiting_user')

    const authorized = await app.request(`/v1/sessions/${session.sessionRef}/authorize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountRef: 'acct-a' }) })
    expect((await authorized.json() as { state: string }).state).toBe('active')
    const captured = await app.request(`/v1/sessions/${session.sessionRef}/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: 'w1', accountRef: 'acct-a', url: `${origin}/` }) })
    const capture = await captured.json() as { status: string; markdown: string | null }
    expect(capture.status).toBe('success')
    expect(capture.markdown).toContain('Managed session')

    const revoked = await app.request(`/v1/sessions/${session.sessionRef}/revoke`, { method: 'POST' })
    expect(revoked.status).toBe(200)
    const denied = await app.request(`/v1/sessions/${session.sessionRef}/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: 'w1', accountRef: 'acct-a', url: `${origin}/` }) })
    expect((await denied.json() as { kind: string }).kind).toBe('revoked')

    const handoff = await app.request(`/v1/sessions/${session.sessionRef}/handoff`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 're-authentication_required' }) })
    expect(handoff.status).toBe(409)
    const queried = await app.request(`/v1/sessions/${session.sessionRef}`)
    expect((await queried.json() as { state: string }).state).toBe('revoked')
  }, 120000)

  it('renews an expired active session into waiting_user with a new epoch', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-b3-api-'))
    engine = createApiEngine({ taskRoot: root })
    const app = createApp(engine)
    const created = await app.request('/v1/sessions/managed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: 'w1', accountRef: 'acct-a', originScope: 'https://example.com', expiresAt: '2030-01-01T00:00:00.000Z' }) })
    const session = await created.json() as { sessionRef: string }
    await app.request(`/v1/sessions/${session.sessionRef}/authorize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountRef: 'acct-a' }) })
    const renew = await app.request(`/v1/sessions/${session.sessionRef}/renew`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresAt: '2031-01-04T00:00:00.000Z' }) })
    const body = await renew.json() as { state: string; grantEpoch: number; handoff: { reason: string } }
    expect(body.state).toBe('waiting_user')
    expect(body.grantEpoch).toBe(2)
    expect(body.handoff.reason).toBe('renewal_authorization_required')
  })
})
