import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error worker.js is plain JavaScript without type declarations
import worker from '../worker.js'

const env = {
  ORIGIN_URL: 'https://origin.example.run.app',
  PRIMARY_HOST: 'octocrawl.dev',
  PROXY_SECRET: 'test-secret',
}

async function proxiedTarget(url: string): Promise<URL> {
  const fetchStub = vi.fn(async () => new Response('ok'))
  vi.stubGlobal('fetch', fetchStub)
  await worker.fetch(new Request(url), env)
  expect(fetchStub).toHaveBeenCalledTimes(1)
  return new URL(String(fetchStub.mock.calls[0][0]))
}

describe('public preview proxy worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps a protocol-relative path on the origin host', async () => {
    const target = await proxiedTarget('https://octocrawl.dev//evil.example/x?a=1')
    expect(target.host).toBe('origin.example.run.app')
    expect(target.pathname).toBe('//evil.example/x')
    expect(target.search).toBe('?a=1')
  })

  it('keeps a dot-segment path that normalizes to // on the origin host', async () => {
    const target = await proxiedTarget('https://octocrawl.dev/.//x')
    expect(target.host).toBe('origin.example.run.app')
    expect(target.pathname).toBe('//x')
  })

  it('forwards a normal path and query with the proxy headers', async () => {
    const fetchStub = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchStub)
    await worker.fetch(new Request('https://octocrawl.dev/docs/api?tab=scrape&x=1'), env)
    const [target, init] = fetchStub.mock.calls[0] as [URL, RequestInit]
    expect(String(target)).toBe('https://origin.example.run.app/docs/api?tab=scrape&x=1')
    const headers = new Headers(init.headers)
    expect(headers.get('x-forwarded-host')).toBe('octocrawl.dev')
    expect(headers.get('x-w2l-proxy-secret')).toBe('test-secret')
    expect(init.redirect).toBe('manual')
  })

  it('answers with the paused notice itself and never calls the service while PAUSED is set, still redirecting other hosts', async () => {
    const fetchStub = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchStub)
    const paused = { ...env, PAUSED: '1' }
    const response = await worker.fetch(new Request('https://octocrawl.dev/docs/api?tab=scrape'), paused)
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('retry-after')).toBe('86400')
    expect(await response.text()).toContain('Octocrawl is paused')
    const redirect = await worker.fetch(new Request('https://octocrawl.app/x'), paused)
    expect(redirect.status).toBe(301)
    expect(redirect.headers.get('location')).toBe('https://octocrawl.dev/x')
    expect(fetchStub).not.toHaveBeenCalled()
  })
})
