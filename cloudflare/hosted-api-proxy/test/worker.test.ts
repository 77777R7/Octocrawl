import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error worker.js is plain JavaScript without type declarations
import worker from '../worker.js'

const env = { ORIGIN_URL: 'https://origin.example.run.app', PROXY_SECRET: 'test-secret' }

describe('hosted api proxy worker', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('forwards a scrape POST on api.octocrawl.dev with the proxy headers and the body, without following redirects', async () => {
    const fetchStub = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchStub)
    await worker.fetch(new Request('https://api.octocrawl.dev/v1/scrape?x=1', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer k' }, body: '{"url":"https://example.com"}' }), env)
    const [target, init] = fetchStub.mock.calls[0] as [URL, RequestInit]
    expect(String(target)).toBe('https://origin.example.run.app/v1/scrape?x=1')
    const headers = new Headers(init.headers)
    expect(headers.get('x-forwarded-host')).toBe('api.octocrawl.dev')
    expect(headers.get('x-w2l-proxy-secret')).toBe('test-secret')
    expect(headers.get('authorization')).toBe('Bearer k')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
  })

  it('serves mcp.octocrawl.dev from the same origin and never redirects between hosts', async () => {
    const fetchStub = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchStub)
    const response = await worker.fetch(new Request('https://mcp.octocrawl.dev/mcp', { method: 'POST', body: '{}' }), env)
    expect(response.status).toBe(200)
    expect(String(fetchStub.mock.calls[0][0])).toBe('https://origin.example.run.app/mcp')
    expect(new Headers((fetchStub.mock.calls[0] as [URL, RequestInit])[1].headers).get('x-forwarded-host')).toBe('mcp.octocrawl.dev')
  })

  it('redirects plain http to https and keeps a protocol-relative path on the origin host', async () => {
    const redirect = await worker.fetch(new Request('http://api.octocrawl.dev/health'), env)
    expect(redirect.status).toBe(301)
    expect(redirect.headers.get('location')).toBe('https://api.octocrawl.dev/health')
    const fetchStub = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchStub)
    await worker.fetch(new Request('https://api.octocrawl.dev//evil.example/x'), env)
    const target = new URL(String(fetchStub.mock.calls[0][0]))
    expect(target.host).toBe('origin.example.run.app')
    expect(target.pathname).toBe('//evil.example/x')
  })
})
