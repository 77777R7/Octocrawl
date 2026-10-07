import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { get, type Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FetchResult } from '@w2l/contracts'
import { createPreviewServer, type PreviewServerOptions } from '../src/server.js'
import type { CaptureOutcome } from '../src/preview.js'
import { dailyVisitorId, looksAutomated, parsePublicOrigin, parseWebEvent, type LogLine } from '../src/site.js'

const servers: Server[] = []
const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

function fixture(url: string): CaptureOutcome {
  const result = {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null,
    markdown: '# Example page\n\nContent',
    evidence: { finalUrl: url, httpStatus: 200, rawBodySha256: 'fixture-sha' },
    usage: { attemptCount: 1, browserMs: 0, externalCostUsd: null },
    document: { title: 'Example page', adapter: { id: 'generic' }, adapterValidation: { valid: true, issues: [] } },
  } as unknown as FetchResult
  return { result }
}

/** fetch() cannot set Host, so the configured-domain case goes through node:http. */
function getWithHost(url: string, host: string): Promise<{ body: string; length: string | undefined }> {
  return new Promise((resolve, reject) => get(url, { headers: { host } }, response => {
    const chunks: Buffer[] = []
    response.on('data', chunk => chunks.push(chunk)).on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), length: response.headers['content-length'] }))
  }).on('error', reject))
}

async function site(extra: Partial<PreviewServerOptions> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-site-'))
  tempDirs.push(dir)
  await writeFile(join(dir, 'index.html'), '<link rel="canonical" href="__W2L_ORIGIN__/" /><h1>Home</h1>')
  await writeFile(join(dir, '404.html'), '<title>Page not found</title>')
  await writeFile(join(dir, 'robots.txt'), 'Sitemap: __W2L_ORIGIN__/sitemap.xml\n')
  await mkdir(join(dir, 'docs', 'limits'), { recursive: true })
  await writeFile(join(dir, 'docs', 'limits', 'index.html'), '<h1>Limits</h1>')
  await writeFile(join(dir, 'docs', 'limits', 'index.md'), '# Limits\n')
  const lines: LogLine[] = []
  const server = createPreviewServer({
    quota: { consume: async () => 'ok' }, capture: async target => fixture(target.url), staticDir: dir, amazonState: null,
    log: line => lines.push(line), ...extra,
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, lines }
}

describe('public site routes', () => {
  it('answers unknown paths with the 404 page instead of the home page', async () => {
    const { url } = await site()
    for (const path of ['/pricing', '/docs/missing/', '/assets/missing.js']) {
      const response = await fetch(`${url}${path}`)
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.text()).toContain('Page not found')
    }
    expect((await fetch(url)).status).toBe(200)
  })

  it('writes the request origin, or the configured public origin, into pages and robots.txt', async () => {
    const local = await site()
    expect(await (await fetch(local.url)).text()).toContain(`<link rel="canonical" href="${local.url}/" />`)
    expect(await (await fetch(`${local.url}/robots.txt`)).text()).toBe(`Sitemap: ${local.url}/sitemap.xml\n`)
    const configured = await site({ publicOrigin: 'https://w2l.example' })
    const page = await getWithHost(configured.url, 'w2l.example')
    expect(page.body).toContain('<link rel="canonical" href="https://w2l.example/" />')
    expect(page.length).toBe(String(Buffer.byteLength(page.body)))
  })

  it('redirects page requests on another host to the public origin, but never the API', async () => {
    const { url } = await site({ publicOrigin: 'https://w2l.example' })
    const page = await fetch(`${url}/docs/?utm_source=x`, { redirect: 'manual' })
    expect(page.status).toBe(301)
    expect(page.headers.get('location')).toBe('https://w2l.example/docs/?utm_source=x')
    expect((await fetch(`${url}/api/health`)).status).toBe(200)
    const preview = await fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://docs.example/a?secret=1' }) })
    expect(preview.status).toBe(200)
  })

  it('behind the Cloudflare Worker, trusts X-Forwarded-Host only when it names the public domain', async () => {
    const { url } = await site({ publicOrigin: 'https://w2l.example' })
    const proxied = await fetch(url, { headers: { 'x-forwarded-host': 'w2l.example' }, redirect: 'manual' })
    expect(proxied.status).toBe(200)
    expect(await proxied.text()).toContain('<link rel="canonical" href="https://w2l.example/" />')
    const forged = await fetch(url, { headers: { 'x-forwarded-host': 'evil.example' }, redirect: 'manual' })
    expect(forged.headers.get('location')).toBe('https://w2l.example/')
    const preview = (headers: Record<string, string>) => fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://w2l.example', ...headers }, body: JSON.stringify({ url: 'https://docs.example' }) })
    expect((await preview({ 'x-forwarded-host': 'w2l.example' })).status).toBe(200)
    expect((await preview({})).status).toBe(403)
  })

  it('with a proxy secret, believes the Worker\'s domain and visitor address only when it proves itself', async () => {
    const keys: string[] = []
    const secret = 'p'.repeat(32)
    const { url } = await site({
      publicOrigin: 'https://w2l.example', proxySecret: secret,
      quota: { status: async visitor => { keys.push(visitor); return { decision: 'ok', limit: 5, remaining: 5 } }, consume: async () => 'ok' },
    })
    const proven = { 'x-forwarded-host': 'w2l.example', 'cf-connecting-ip': '203.0.113.7', 'x-w2l-proxy-secret': secret }
    expect((await fetch(url, { headers: proven, redirect: 'manual' })).status).toBe(200)
    await fetch(`${url}/api/quota`, { headers: proven })
    // A direct caller cannot name the domain, or pick the address it is counted under.
    const forged = { 'x-forwarded-host': 'w2l.example', 'cf-connecting-ip': '198.51.100.9', 'x-w2l-proxy-secret': 'q'.repeat(32) }
    expect((await fetch(url, { headers: forged, redirect: 'manual' })).status).toBe(301)
    await fetch(`${url}/api/quota`, { headers: forged })
    await fetch(`${url}/api/quota`, { headers: { 'cf-connecting-ip': '198.51.100.9' } })
    expect(keys[0]).toBe('ip:203.0.113.7')
    expect(keys.slice(1).some(key => key.includes('198.51.100.9'))).toBe(false)
  })

  it('never believes CF-Connecting-IP without a proxy secret', async () => {
    const keys: string[] = []
    const { url } = await site({ quota: { status: async visitor => { keys.push(visitor); return { decision: 'ok', limit: 5, remaining: 5 } }, consume: async () => 'ok' } })
    await fetch(`${url}/api/quota`, { headers: { 'cf-connecting-ip': '198.51.100.9' } })
    expect(keys[0]).not.toContain('198.51.100.9')
  })

  it('moves each page to its one slash address, keeping the query', async () => {
    const { url } = await site()
    for (const [path, location] of [['/docs/limits?a=1', '/docs/limits/?a=1'], ['/index.html', '/'], ['/docs/limits/index.html', '/docs/limits/']]) {
      const response = await fetch(`${url}${path}`, { redirect: 'manual' })
      expect([path, response.status, response.headers.get('location')]).toEqual([path, 301, location])
    }
    expect((await fetch(`${url}/docs/limits/`, { redirect: 'manual' })).status).toBe(200)
    expect((await fetch(`${url}/docs/missing`, { redirect: 'manual' })).status).toBe(404)
    // fetch() would normalise this path; sent raw, it must not redirect to another host (//docs/...).
    const raw = await new Promise<string | undefined>((resolve, reject) => get({ host: '127.0.0.1', port: new URL(url).port, path: '/.//docs/limits' }, response => { response.resume(); resolve(response.headers.location) }).on('error', reject))
    expect(raw).toBe('/docs/limits/')
  })

  it('points a Markdown copy at its page and sends HSTS only over https', async () => {
    const local = await site()
    const copy = await fetch(`${local.url}/docs/limits/index.md`)
    expect(copy.headers.get('link')).toBe(`<${local.url}/docs/limits/>; rel="canonical"`)
    expect((await fetch(`${local.url}/docs/limits/index%2Emd`)).headers.get('link')).toBe(`<${local.url}/docs/limits/>; rel="canonical"`)
    expect(copy.headers.get('strict-transport-security')).toBeNull()
    expect((await fetch(`${local.url}/docs/limits/`)).headers.get('link')).toBeNull()
    const configured = await site({ publicOrigin: 'https://w2l.example' })
    const page = await fetch(configured.url, { headers: { 'x-forwarded-host': 'w2l.example' } })
    expect(page.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
  })

  it('sets the visitor cookie on pages only, so robots.txt stays publicly cacheable', async () => {
    const { url } = await site({ visitorCookieSecret: 's'.repeat(32) })
    expect((await fetch(url)).headers.get('set-cookie')).toMatch(/^w2l_visitor=/)
    for (const path of ['/robots.txt', '/docs/limits/index.md', '/docs/limits', '/missing']) {
      expect([path, (await fetch(`${url}${path}`, { redirect: 'manual' })).headers.get('set-cookie')]).toEqual([path, null])
    }
    expect((await fetch(`${url}/robots.txt`)).headers.get('cache-control')).toBe('public, max-age=3600')
  })

  it('rejects a public origin with a path or plain http', () => {
    expect(parsePublicOrigin('https://w2l.example/')).toBe('https://w2l.example')
    expect(() => parsePublicOrigin('https://w2l.example/app')).toThrow()
    expect(() => parsePublicOrigin('http://w2l.example')).toThrow()
  })
})

describe('remaining previews', () => {
  it('reads the same visitor key a preview consumes, without consuming, logging or setting a cookie', async () => {
    const reads: string[] = []
    const consumed: string[] = []
    const { url, lines } = await site({
      visitorCookieSecret: 's'.repeat(32),
      quota: {
        status: async visitor => { reads.push(visitor); return { decision: 'ok', limit: 5, remaining: 5 - consumed.length } },
        consume: async visitor => { consumed.push(visitor); return 'ok' },
      },
    })
    const cookie = (await fetch(url)).headers.get('set-cookie')!.split(';')[0]!
    const first = await fetch(`${url}/api/quota`, { headers: { cookie } })
    expect(first.headers.get('set-cookie')).toBeNull()
    expect(await first.json()).toMatchObject({ enabled: true, state: 'ok', limit: 5, remaining: 5, basis: 'visitor' })
    await fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ url: 'https://docs.example' }) })
    // A count with previews left is never cached: another instance may have used one.
    expect(await (await fetch(`${url}/api/quota`, { headers: { cookie } })).json()).toMatchObject({ remaining: 4 })
    expect(reads).toEqual([consumed[0], consumed[0]])
    expect(lines.filter(line => line.event !== 'w2l_preview')).toEqual([])
    expect(await (await fetch(`${url}/api/quota`)).json()).toMatchObject({ basis: 'ip' })
  })

  it('caches a used-up day until the next UTC midnight, and only that', async () => {
    let reads = 0
    const { url } = await site({ quota: { status: async () => { reads++; return { decision: 'visitor_limited', limit: 5, remaining: 0 } }, consume: async () => 'ok' } })
    const first = await (await fetch(`${url}/api/quota`)).json() as { resetsAt: string }
    await fetch(`${url}/api/quota`)
    expect(reads).toBe(1)
    expect(Date.parse(first.resetsAt) % 86_400_000).toBe(0)
    expect(Date.parse(first.resetsAt) - Date.now()).toBeLessThanOrEqual(86_400_000)
  })

  it('refuses other methods, parameters and cross-site reads, and never guesses a count', async () => {
    const { url } = await site({ quota: { status: async () => { throw new Error('store down') }, consume: async () => 'ok' } })
    expect((await fetch(`${url}/api/quota`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${url}/api/quota?visitor=x`)).status).toBe(400)
    expect((await fetch(`${url}/api/quota`, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    const down = await fetch(`${url}/api/quota`)
    expect(down.status).toBe(503)
    expect(await down.json()).not.toHaveProperty('remaining')
    const paused = await site({ enabled: false })
    expect(await (await fetch(`${paused.url}/api/quota`)).json()).toEqual({ enabled: false })
    const unsupported = await site()
    expect((await fetch(`${unsupported.url}/api/quota`)).status).toBe(501)
  })
})

describe('first-party analytics', () => {
  it('logs a known page event and refuses unknown names, properties and cross-site posts', async () => {
    const { url, lines } = await site({ visitorCookieSecret: 's'.repeat(32) })
    const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${url}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    expect((await post({ name: 'page_view', props: { path: '/', ref: 'news.ycombinator.com' } })).status).toBe(204)
    expect((await post({ name: 'page_view', props: { email: 'a@b.c' } })).status).toBe(400)
    expect((await post({ name: 'purchase' })).status).toBe(400)
    expect((await post({ name: 'page_view' }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await fetch(`${url}/api/events`)).status).toBe(405)
    expect(lines).toEqual([{ event: 'w2l_web_event', name: 'page_view', props: { path: '/', ref: 'news.ycombinator.com' }, vid: expect.stringMatching(/^[a-f0-9]{16}$/), automated: true }])
  })

  it('flags the operator\'s own browser as internal once it opts in with ?internal=1, and clears it with ?internal=0', async () => {
    const { url, lines } = await site({ visitorCookieSecret: 's'.repeat(32) })
    const on = (await fetch(`${url}/?internal=1`)).headers.getSetCookie()
    expect(on.map(cookie => cookie.split('=')[0])).toEqual(['w2l_visitor', 'w2l_internal'])
    expect(on[1]).toMatch(/^w2l_internal=1; Max-Age=31536000; Path=\/; HttpOnly; SameSite=Lax$/)
    expect((await fetch(`${url}/?internal=0`)).headers.getSetCookie()[1]).toMatch(/^w2l_internal=; Max-Age=0;/)
    expect((await fetch(`${url}/?internal=yes`)).headers.getSetCookie().map(cookie => cookie.split('=')[0])).toEqual(['w2l_visitor'])
    const event = (cookie?: string) => fetch(`${url}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ name: 'page_view', props: { path: '/' } }) })
    await event('w2l_internal=1')
    await event('w2l_internal=0')
    await fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'other=1; w2l_internal=1' }, body: JSON.stringify({ url: 'https://docs.example' }) })
    expect(lines.map(line => [line.event, line.internal])).toEqual([['w2l_web_event', true], ['w2l_web_event', undefined], ['w2l_preview', true]])
  })

  it('flags self-named tools, monitors and stale browser strings as automated, and current browsers as not', () => {
    const automated = (agent: string | undefined) => looksAutomated({ headers: agent === undefined ? {} : { 'user-agent': agent } } as Parameters<typeof looksAutomated>[0])
    const current = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_3_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.95 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:139.0) Gecko/20100101 Firefox/139.0',
      'Mozilla/5.0 (Linux; Android 16; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
    ]
    for (const agent of current) expect(automated(agent), agent).toBe(false)
    const stale = [
      undefined,
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36',
      'Mozilla/5.0 (compatible; FossickBot/1.0; +https://fossick.bot)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 WebtelemetryBot/1.0 (+https://webtelemetry.dev/bot)',
      'Mozilla/5.0 (compatible; Dataprovider.com)',
      'Mozilla/5.0 (compatible; DomainMonitor/0.1)',
      'curl/8.7.1',
      // Browsers no one runs any more: iOS 11 and 13 Safari, Chrome 79 and 102.
      'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36',
      // Forged strings seen on /api/events: a truncated Safari token, EdgeHTML beside Chrome 125, old Firefox, frozen Chrome 117.
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.3',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.60 Safari/537.36 Edge/12.246',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.132 Safari/537.36',
    ]
    for (const agent of stale) expect(automated(agent), String(agent)).toBe(true)
    // Only the one frozen Chrome 117 build is refused, not every Chrome 117.
    expect(automated('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.149 Safari/537.36')).toBe(false)
  })

  it('logs each anonymous preview outcome with the target host only', async () => {
    const { url, lines } = await site()
    await fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://www.docs.example/private/path?token=1' }) })
    await fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1/' }) })
    expect(lines).toMatchObject([
      { event: 'w2l_preview', status: 'success', http: 200, host: 'docs.example', options: false, vid: null },
      { event: 'w2l_preview', status: 'blocked', http: 200, code: 'policy_denied', host: '127.0.0.1' },
    ])
    expect(JSON.stringify(lines)).not.toContain('private/path')
  })

  it('logs nothing for a visitor whose browser sends Do Not Track or Global Privacy Control', async () => {
    const { url, lines } = await site()
    await fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json', 'sec-gpc': '1' }, body: JSON.stringify({ url: 'https://docs.example' }) })
    expect((await fetch(`${url}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json', dnt: '1' }, body: JSON.stringify({ name: 'page_view' }) })).status).toBe(204)
    expect(lines).toEqual([])
  })

  it('keeps event properties short and plain, and rotates the visitor pseudonym daily', () => {
    expect(parseWebEvent({ name: 'result_copy', props: { view: 'markdown' } })).toEqual({ name: 'result_copy', props: { view: 'markdown' } })
    expect(parseWebEvent({ name: 'result_copy', props: { view: 'x'.repeat(121) } })).toBeNull()
    expect(parseWebEvent({ name: 'result_copy', props: { view: { nested: true } } })).toBeNull()
    const day1 = dailyVisitorId('k'.repeat(32), 'visitor:abc', new Date('2026-09-30T12:00:00Z'))
    expect(dailyVisitorId('k'.repeat(32), 'visitor:abc', new Date('2026-09-30T23:00:00Z'))).toBe(day1)
    expect(dailyVisitorId('k'.repeat(32), 'visitor:abc', new Date('2026-10-01T00:00:00Z'))).not.toBe(day1)
    expect(dailyVisitorId(undefined, 'visitor:abc')).toBeNull()
  })
})
