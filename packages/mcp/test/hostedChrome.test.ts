import { afterEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { Hono } from 'hono'
import type { FetchResult } from '@w2l/contracts'
import { createHostedChromeService, HOSTED_CHROME_MAX_READ_MS, httpHostedChromeClient, metadataIdToken, serveHostedChrome, type HostedChromeRead } from '../src/hostedChrome.js'

// The octocrawl-chrome service's HTTP surface and the hosted API's client for it (ADR 0005 hosted_chrome, revision of
// 2026-10-27), with a stand-in reader: what the service takes and refuses, and what the client sends.

const NOW = 1_800_000_000_000
const page = (url: string): FetchResult => ({
  requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'browser_local', escalations: [], handoff: null,
  markdown: '# Tides', truncated: false, truncatedAt: null, compliance: null,
  evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
  usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 2, browserMs: 5, externalCostUsd: 0 },
  trace: [],
})

let server: Server | null = null
afterEach(async () => { await new Promise<void>((resolve) => server === null ? resolve() : server.close(() => resolve())); server = null })

describe('the octocrawl-chrome service', () => {
  const reads: HostedChromeRead[] = []
  const app = createHostedChromeService(async (read) => { reads.push(read); return page(read.url) }, () => NOW)
  const post = (body: unknown) => app.request('/v1/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('reads one http(s) page with the options it takes, within its longest deadline', async () => {
    reads.length = 0
    const answer = await post({ url: 'https://shop.test/item', options: { onlyMainContent: false, waitFor: 250 }, deadlineAt: NOW + 30_000 })
    expect(answer.status).toBe(200)
    expect(await answer.json()).toMatchObject({ requestedUrl: 'https://shop.test/item', status: 'success' })
    // No deadline, or one past its longest: the longest.
    await post({ url: 'https://shop.test/item' })
    await post({ url: 'https://shop.test/item', deadlineAt: NOW + 10 * HOSTED_CHROME_MAX_READ_MS })
    expect(reads.map((read) => read.deadlineAt)).toEqual([NOW + 30_000, NOW + HOSTED_CHROME_MAX_READ_MS, NOW + HOSTED_CHROME_MAX_READ_MS])
    expect(reads[0]!.options).toEqual({ onlyMainContent: false, waitFor: 250 })
    // Every option a hosted scrape takes and a measured Chrome honours reaches the lane, removeBase64Images among them.
    reads.length = 0
    const kept = { onlyMainContent: false, removeBase64Images: false, includeTags: ['main'], excludeTags: ['nav'], blockAds: false, maxFileBytes: 1_000, includeHtml: true, includeImages: true, includeTables: true, verify: { checks: [{ type: 'markdownIncludes', text: 'Tides' }] } }
    expect((await post({ url: 'https://shop.test/item', options: kept })).status).toBe(200)
    expect(reads[0]!.options).toEqual(kept)
    expect((await app.request('/health')).status).toBe(200)
  })

  it('refuses what the rung does not take, by name, before reading anything', async () => {
    reads.length = 0
    const refusals: [unknown, RegExp][] = [
      ['not json', /JSON/],
      [[], /url, options/],
      [{ url: 'file:///etc/passwd' }, /http\(s\)/],
      [{ url: 'not a url' }, /not a URL/],
      [{ url: 'https://shop.test/', options: { mobile: true } }, /hosted_chrome reads the page as Chrome opened it and takes no mobile/],
      [{ url: 'https://shop.test/', options: { headers: { 'x-a': '1' } } }, /takes no headers/],
      [{ url: 'https://shop.test/', options: { actions: [{ type: 'wait', milliseconds: 1 }] } }, /takes no actions/],
      [{ url: 'https://shop.test/', options: { screenshot: {} } }, /takes no screenshot/],
      [{ url: 'https://shop.test/', options: { skipTlsVerification: true } }, /takes no skipTlsVerification/],
      [{ url: 'https://shop.test/', deadlineAt: 'soon' }, /deadlineAt/],
      [{ url: 'https://shop.test/', options: 'all' }, /options is an object/],
      // robots.txt is obeyed on every hosted rung, and a ladder's own flags are no caller's: refused by name, not passed on.
      [{ url: 'https://shop.test/', options: { robotsOverride: { reason: 'x', basis: 'user_named_url' } } }, /hosted_chrome takes no robotsOverride/],
      [{ url: 'https://shop.test/', options: { headersTimeoutFallback: true, waitFor: 10 } }, /takes no headersTimeoutFallback/],
      [{ url: 'https://shop.test/', options: { somethingElse: 1 } }, /takes no somethingElse/],
      [{ url: 'https://shop.test/', options: { verify: { checks: [{ type: 'markdownMatches', pattern: '(a+)+$' }] } } }, /markdownMatches/],
      [JSON.stringify({ url: 'https://shop.test/', pad: 'x'.repeat(300 * 1024) }), /256 KiB/],
    ]
    for (const [body, reason] of refusals) {
      const answer = await post(body)
      expect(answer.status, JSON.stringify(body).slice(0, 80)).toBe(400)
      expect(((await answer.json()) as { error: string }).error).toMatch(reason)
    }
    expect(reads).toEqual([])
  })

  it('takes a contract\'s regular-expression checks when its start-up self-test passed, and hands them to the read (ADR 0006, amendment of 2026-10-29)', async () => {
    const taken: HostedChromeRead[] = []
    const open = createHostedChromeService(async (read) => { taken.push(read); return page(read.url) }, () => NOW, { regexChecks: true })
    const send = (body: unknown) => open.request('/v1/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const verify = { checks: [{ type: 'markdownMatches', pattern: 'Tides' }, { type: 'markdownCountMin', pattern: 'Tide', min: 1 }] }
    expect((await send({ url: 'https://shop.test/item', options: { verify } })).status).toBe(200)
    expect(taken.map((read) => read.options)).toEqual([{ verify }])
    // What else it refuses, it still refuses.
    expect((await send({ url: 'https://shop.test/item', options: { verify, mobile: true } })).status).toBe(400)
    expect(taken).toHaveLength(1)
  })

  it('reads one page at a time: a second request while one is read is told to come back', async () => {
    let finish!: () => void
    const held = new Promise<void>((resolve) => { finish = resolve })
    const busy = createHostedChromeService(async (read) => { await held; return page(read.url) }, () => NOW)
    const first = busy.request('/v1/read', { method: 'POST', body: JSON.stringify({ url: 'https://shop.test/a' }) })
    const second = await busy.request('/v1/read', { method: 'POST', body: JSON.stringify({ url: 'https://shop.test/b' }) })
    expect(second.status).toBe(503)
    finish()
    expect((await first).status).toBe(200)
  })
})

describe('the hosted API\'s client for the service', () => {
  it('posts the call\'s URL, options and deadline with an ID token, and gives back the page the service read', async () => {
    const seen: { auth: string | undefined; body: unknown }[] = []
    const served = await serveHostedChrome(createHostedChromeServiceWith(seen), 0)
    server = served.server
    const client = httpHostedChromeClient(`http://127.0.0.1:${served.port}`, async () => 'id-token-for-test')
    const read = await client.fetch('https://shop.test/item', { waitFor: 500 }, { deadlineAt: NOW + 20_000 })
    expect(read).toMatchObject({ requestedUrl: 'https://shop.test/item', status: 'success' })
    expect(seen).toEqual([{ auth: 'Bearer id-token-for-test', body: { url: 'https://shop.test/item', options: { waitFor: 500 }, deadlineAt: NOW + 20_000 } }])
    // A refusal is the rung's failure, named by its status: the ladder records it, and the page is what came before.
    await expect(client.fetch('https://shop.test/item', { mobile: true }, undefined)).rejects.toThrow(/answered 400/)
    // A ladder's own flag, and a robots.txt override no hosted engine sets, are not sent at all.
    seen.length = 0
    await client.fetch('https://shop.test/item', { waitFor: 500, removeBase64Images: false, headersTimeoutFallback: true, robotsOverride: { reason: 'x', basis: 'user_named_url' } } as never, undefined)
    expect(seen.map((request) => request.body)).toEqual([{ url: 'https://shop.test/item', options: { waitFor: 500, removeBase64Images: false } }])
  })

  it('reaches the service over https alone (loopback http is a test\'s), and keeps an ID token until shortly before it expires', async () => {
    expect(() => httpHostedChromeClient('http://octocrawl-chrome.example.run.app', async () => 't')).toThrow(/https/)
    expect(() => httpHostedChromeClient('https://octocrawl-chrome-abc.a.run.app', async () => 't')).not.toThrow()
    let t = NOW
    const asked: string[] = []
    const token = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`
    const id = metadataIdToken('https://octocrawl-chrome-abc.a.run.app', (async (input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(`${String(input)} ${(init?.headers as Record<string, string>)['metadata-flavor']}`)
      return new Response(token(Math.floor(t / 1000) + 3600))
    }) as typeof fetch, () => t)
    const first = await id()
    expect(await id()).toBe(first)
    t += 3600_000 - 299_000
    await id()
    expect(asked).toHaveLength(2)
    expect(asked[0]).toBe('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Foctocrawl-chrome-abc.a.run.app Google')
  })
})

/** The service with a stand-in reader, recording each request's Authorization and body as it arrives. */
function createHostedChromeServiceWith(seen: { auth: string | undefined; body: unknown }[]) {
  const app = createHostedChromeService(async (read) => page(read.url), () => NOW)
  const wrapped = new Hono()
  wrapped.use('*', async (c, next) => { seen.push({ auth: c.req.header('authorization'), body: await c.req.raw.clone().json().catch(() => null) }); await next() })
  wrapped.route('/', app)
  return wrapped
}
