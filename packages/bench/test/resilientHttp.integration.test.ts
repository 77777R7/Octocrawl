import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * Transport-resilience integration test against real fixture-server bytes:
 * the four cases the resilient arm exists for, asserted per-fixture (status,
 * failure reason, chain, attempt counts, delivered facts) — not via bench
 * aggregate inference.
 */

let server: FixtureServer
const subject = new ResilientHttpSubject()

beforeAll(async () => {
  server = await startFixtureServer()
})

afterAll(async () => {
  await server.close()
})

async function reset(): Promise<void> {
  const res = await fetch(`${server.url}/__reset`)
  expect(res.status).toBe(204)
  await res.body?.cancel()
}

describe('resilient subject on served fixture bytes', () => {
  it('redirect-chain: follows three hops and delivers the destination fact', async () => {
    const out = await subject.fetch(`${server.url}/redirect/chain/3`)
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('Arrived after three hops.')
    expect(out.evidence.rawBodySha256).toMatch(/^[0-9a-f]{64}$/)
    expect(out.evidence.finalUrl).toBe(`${server.url}/redirect/chain/0`)
    expect(out.evidence.redirectChain).toHaveLength(4)
    expect(out.usage.requestCount).toBe(4)
    expect(out.usage.attemptCount).toBe(1)
  })

  it('redirect-loop: terminates with redirect_loop, never spins', async () => {
    const out = await subject.fetch(`${server.url}/redirect/loop/a`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('redirect_loop')
    expect(out.usage.attemptCount).toBe(1)
    // a -> b -> a: the loop is provable after two wire requests
    expect(out.usage.requestCount).toBe(2)
  })

  it('flaky-once: retries the 503 and succeeds on attempt 2', async () => {
    await reset()
    const out = await subject.fetch(`${server.url}/flaky/once`)
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('Succeeded on the second attempt.')
    expect(out.usage.attemptCount).toBe(2)
    expect(out.usage.requestCount).toBe(2)
    // Retry is a re-visit, not a redirect.
    expect(out.evidence.redirectChain).toHaveLength(0)
  })

  it('block-rate-limit: 429 is blocked/rate_limit with exactly one request', async () => {
    const out = await subject.fetch(`${server.url}/block/rate-limit`)
    expect(out.status).toBe('blocked')
    expect(out.blockReason).toBe('rate_limit')
    expect(out.usage.requestCount).toBe(1)
  })

  it('records a host cooldown after 429 and waits before the next same-host request', async () => {
    const first = await subject.fetch(`${server.url}/block/rate-limit`)
    expect(first.status).toBe('blocked')
    const started = Date.now()
    const second = await subject.fetch(`${server.url}/crawl/listing`)
    expect(second.status).toBe('success')
    expect(second.trace.some((event) => event.event === 'host_cooldown_wait')).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(200)
  })

  it('redirect-to-home: follows to /home; check 4 has no annotation to refute it', async () => {
    // Documented semantic gap for this phase: transport-wise the redirect is
    // followed correctly (finalUrl = /home). Deciding that the DELIVERED
    // content belongs to the wrong page needs the wrong-page probe
    // (content-identity), which is a later milestone. The fixture's
    // expectedStatus stays 'failed', so this arm records a status mismatch
    // there — visible in the bench, not hidden by this test.
    const out = await subject.fetch(`${server.url}/wrong/redirect-home`)
    expect(out.evidence.finalUrl).toBe(`${server.url}/home`)
    expect(out.evidence.redirectChain).toHaveLength(2)
    expect(out.status).toBe('success')
  })

  it('limit-huge-body: stops at maxBodyBytes instead of buffering the stream', async () => {
    const out = await subject.fetch(`${server.url}/limit/huge-body`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('body_too_large')
  })

  it('closes its guarded connection pool after an oversized response', async () => {
    const isolated = new ResilientHttpSubject()
    const out = await isolated.fetch(`${server.url}/limit/huge-body`)
    expect(out.failureReason).toBe('body_too_large')
    await isolated.teardown()
    await isolated.teardown()
  })
})

describe('HTTP lane on non-200 statuses', () => {
  const ARTICLE = '<article><h1>Created record</h1><p>A 201 answer that carries a full document is judged from its content like any other 2xx page, not failed because it is not exactly 200.</p><p><a href="/next">Next record</a></p></article>'
  const pages: Record<string, { status: number; type?: string; body: string }> = {
    '/missing': { status: 404, body: '<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx/1.21.6</center>\n</body>\n</html>' },
    '/broken': { status: 500, body: '<!doctype html><html><body><h1>Internal Server Error</h1><p>The server could not complete the request. <a href="/status">Status page</a></p></body></html>' },
    '/forbidden': { status: 403, body: '<!doctype html><html><body><h1>403 Forbidden</h1><p>You do not have permission to view this directory.</p></body></html>' },
    '/denied': { status: 403, body: '<html><head><title>Access Denied</title></head><body><h1>Access Denied</h1>You don\'t have permission to access this page on this server.<p>Reference #18.2f</p></body></html>' },
    '/created': { status: 201, body: `<!doctype html><html><body>${ARTICLE}</body></html>` },
    '/empty': { status: 204, body: '' },
    '/unchanged': { status: 304, body: '' },
    '/api-missing': { status: 404, type: 'application/json', body: '{"error":"not found"}' },
  }
  let origin: string
  let errorServer: import('node:http').Server
  const http = new ResilientHttpSubject()

  beforeAll(async () => {
    const { createServer } = await import('node:http')
    errorServer = createServer((req, res) => {
      const page = pages[req.url ?? '']
      if (page === undefined) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return }
      res.writeHead(page.status, page.body === '' ? {} : { 'content-type': page.type ?? 'text/html; charset=utf-8' })
      res.end(page.body)
    })
    await new Promise<void>((resolve) => errorServer.listen(0, '127.0.0.1', resolve))
    const address = errorServer.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await http.teardown()
    await new Promise<void>((resolve) => errorServer.close(() => resolve()))
  })

  it('returns a 404 page as evidence on a failed result, never as success', async () => {
    const out = await http.fetch(`${origin}/missing`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'http_error', blockReason: null })
    expect(out.evidence.httpStatus).toBe(404)
    expect(out.evidence.rawBodySha256).toMatch(/^[0-9a-f]{64}$/)
    expect(out.markdown).toContain('404 Not Found')
    expect(out.usage.contentTokens).toBeNull()
    expect(out.document).toBeUndefined()
    expect(out.escalations).toEqual([])
  })

  it('keeps the body and links of a 500 and a bare 403 on their http_error results', async () => {
    const broken = await http.fetch(`${origin}/broken`)
    expect(broken).toMatchObject({ status: 'failed', failureReason: 'http_error' })
    expect(broken.markdown).toContain('Internal Server Error')
    expect(broken.links).toEqual([`${origin}/status`])
    const forbidden = await http.fetch(`${origin}/forbidden`)
    expect(forbidden).toMatchObject({ status: 'failed', failureReason: 'http_error', blockReason: null })
    expect(forbidden.evidence.httpStatus).toBe(403)
    expect(forbidden.markdown).toContain('403 Forbidden')
  })

  it('names a gated 403 blocked with its signals and keeps the block page as evidence', async () => {
    const out = await http.fetch(`${origin}/denied`)
    expect(out).toMatchObject({ status: 'blocked', blockReason: 'bot_detected_generic', failureReason: null })
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'gate_detected', detail: expect.objectContaining({ signals: ['weak_access_denied', 'status_403'], status: 403 }) }))
    expect(out.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'blocked:bot_detected_generic', improved: null }])
    expect(out.markdown).toContain('Access Denied')
  })

  it('judges a 201 page from its content like a 200', async () => {
    const out = await http.fetch(`${origin}/created`)
    expect(out.status).toBe('success')
    expect(out.evidence.httpStatus).toBe(201)
    expect(out.markdown).toContain('A 201 answer that carries a full document')
    expect(out.links).toEqual([`${origin}/next`])
  })

  it('reports a 204 as proven empty, and keeps 304 and non-text bodies content-free', async () => {
    const empty = await http.fetch(`${origin}/empty`)
    expect(empty).toMatchObject({ status: 'empty_verified', failureReason: null, markdown: null })
    expect(empty.evidence.httpStatus).toBe(204)
    // The monitor runner reads a 304 as "reuse the cached body": no content of its own.
    const unchanged = await http.fetch(`${origin}/unchanged`)
    expect(unchanged).toMatchObject({ status: 'failed', failureReason: 'http_error', markdown: null })
    expect(unchanged.evidence.httpStatus).toBe(304)
    const api = await http.fetch(`${origin}/api-missing`)
    expect(api).toMatchObject({ status: 'failed', failureReason: 'http_error', markdown: null })
    expect(api.evidence.httpStatus).toBe(404)
  })
})

describe('hosted network policy on the HTTP arm', () => {
  it('denies cloud metadata before a wire request', async () => {
    const hosted = new ResilientHttpSubject('standard', hostedNetworkPolicy())
    const out = await hosted.fetch('http://169.254.169.254/latest/meta-data/')
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('policy_denied')
    expect(out.usage.requestCount).toBe(0)
  })
})
