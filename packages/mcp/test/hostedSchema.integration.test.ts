import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { hostedNetworkPolicy, VERIFY_REGEX_CHECK_TYPES } from '@w2l/contracts'
import { createHostedApi, hostedScrapeArguments, hostedTools, keyDigest, MemoryHostedKeys, MemoryHostedQuota, oauthTools, withMcpScrapeDeadline } from '../src/hostedApi.js'
import { MemoryCreditsStore } from '../src/hostedCredits.js'
import { collectGarbage } from './collectGarbage.js'

/**
 * Hosted Octocrawl lists only the options it serves (docs/mcp-client-ux-tasks.md W6): an agent that reads the
 * schema and sends what it offers is never refused. The drift guard calls a real hosted service with every listed
 * property, so a schema and the engine's hosted refusals cannot part ways unnoticed. It drives the browser lane for
 * a key, so it runs in the timed group.
 */
const HASH_KEY = 'h'.repeat(40)
const PROXY_SECRET = 's'.repeat(32)
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><nav>Harbour</nav><main><article><h1 id="t">Tides</h1><p>${'The harbour office records tide height every hour of the day. '.repeat(8)}</p><a href="/b">Next</a></article></main></body></html>`
let site: Server
let origin: string
beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
  })
  site.listen(0, '127.0.0.1'); await once(site, 'listening')
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => { await new Promise<void>((resolve) => site.close(() => resolve())) })

type Schema = { properties: Record<string, { description?: string; enum?: unknown[]; maximum?: number; items?: { anyOf?: { enum?: unknown[]; properties?: { type?: { const?: string } } }[] }; properties?: { checks?: { items?: { properties?: { type?: { enum?: string[] } } } } } }> }
const schemaOf = (tools: readonly { name: string; inputSchema: unknown }[], name: string) => tools.find((tool) => tool.name === name)!.inputSchema as Schema

/** Options a hosted server refuses, or takes and cannot honour (2026-10-17, measured against createHostedApi). */
const NEVER_HOSTED = ['actions', 'robotsOverride', 'lane', 'handoff', 'skipTlsVerification', 'access', 'lockdown', 'storeInCache', 'maxAge', 'minAge']

describe('hosted tool schemas', () => {
  it('lists, on every hosted connection, none of the options hosted Octocrawl refuses or cannot honour', () => {
    for (const [surface, tools] of [['keyless', hostedTools(false)], ['key', hostedTools(true)], ['oauth', oauthTools(true)]] as const) {
      const scrape = schemaOf(tools, 'scrape')
      expect([surface, NEVER_HOSTED.filter((key) => key in scrape.properties)]).toEqual([surface, []])
      // mode authed would read nothing signed in on hosted Octocrawl: it has no saved logins.
      expect([surface, scrape.properties.mode?.enum]).toEqual([surface, ['standard', 'research']])
      const checks = scrape.properties.verify?.properties?.checks?.items?.properties?.type?.enum ?? []
      expect([surface, checks.filter((type) => (VERIFY_REGEX_CHECK_TYPES as readonly string[]).includes(type))]).toEqual([surface, []])
      // Nor does its description name them: crawl's and batch_scrape's verify is "Same as scrape." (stage H W0).
      expect([surface, VERIFY_REGEX_CHECK_TYPES.filter((type) => String(scrape.properties.verify?.description).includes(type))]).toEqual([surface, []])
      expect([surface, scrape.properties.timeout?.maximum, scrape.properties.maxFileBytes?.maximum]).toEqual([surface, 180_000, 5 * 1024 * 1024])
      expect([surface, scrape.properties.timeout?.description]).toEqual([surface, expect.stringContaining('Here by default 120000, max 180000;')])
      const map = schemaOf(tools, 'map')
      expect([surface, 'ignoreRobotsTxt' in map.properties, map.properties.limit?.maximum, map.properties.timeout?.maximum]).toEqual([surface, false, 5_000, 60_000])
    }
    // Without the browser lane, a keyless caller has no screenshot and no waitFor.
    const keyless = schemaOf(hostedTools(false), 'scrape')
    const formats = keyless.properties.formats?.items?.anyOf ?? []
    expect(formats.flatMap((variant) => variant.enum ?? [variant.properties?.type?.const])).not.toEqual(expect.arrayContaining(['screenshot']))
    expect(formats.some((variant) => (variant.enum ?? []).some((value) => String(value).startsWith('screenshot')))).toBe(false)
    expect('waitFor' in keyless.properties).toBe(false)
    const keyed = schemaOf(hostedTools(true), 'scrape')
    expect('waitFor' in keyed.properties).toBe(true)
    expect((keyed.properties.formats?.items?.anyOf ?? []).some((variant) => (variant.enum ?? []).includes('screenshot'))).toBe(true)
  })

  it('gives a hosted MCP scrape a local one\'s 120 s when it names no deadline, 180 s at most, and leaves other arguments alone (stage H W0)', () => {
    expect(hostedScrapeArguments({ url: 'https://example.com/' })).toEqual({ url: 'https://example.com/', timeout: 120_000 })
    expect(hostedScrapeArguments({ url: 'https://example.com/', timeout: 300_000 })).toEqual({ url: 'https://example.com/', timeout: 180_000 })
    expect(hostedScrapeArguments({ url: 'https://example.com/', timeout: 150_000 })).toEqual({ url: 'https://example.com/', timeout: 150_000 })
    expect(hostedScrapeArguments({ url: 'https://example.com/', timeout: 5_000, onlyMainContent: false })).toEqual({ url: 'https://example.com/', timeout: 5_000, onlyMainContent: false })
  })

  it('gives every scrape the hosted MCP handler sends that deadline, scrape_product\'s too, which names none (stage H W0)', async () => {
    const sent = async (body: unknown) => await (await withMcpScrapeDeadline(new Request('http://hosted.internal/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))).json() as Record<string, unknown>
    // scrape_product's body as tools.ts sends it: no timeout, so the engine's 300 s would run past the 240 s claude.ai gives a call.
    expect(await sent({ url: 'https://www.amazon.sg/dp/B000VW9PIK', mode: 'standard', formats: [{ type: 'json', schema: {}, modelFallback: false }] })).toMatchObject({ url: 'https://www.amazon.sg/dp/B000VW9PIK', timeout: 120_000 })
    expect(await sent({ url: 'https://example.com/', timeout: 250_000 })).toMatchObject({ timeout: 180_000 })
    // Every other request goes to the gate as it came.
    const map = new Request('http://hosted.internal/v1/map', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/' }) })
    expect(await withMcpScrapeDeadline(map)).toBe(map)
  })

  it('keeps the caller\'s cancel on a scrape it gives the deadline, after the request it replaced is collected', async () => {
    const cancel = new AbortController()
    // Made in a call of its own, as the MCP handler's fetch makes it, so nothing here still reaches the request it replaced.
    const send = (signal: AbortSignal) => withMcpScrapeDeadline(new Request('http://hosted.internal/v1/scrape', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/' }), signal }), signal)
    const sent = await send(cancel.signal)
    await collectGarbage()
    cancel.abort()
    expect(sent.signal.aborted).toBe(true)
  })

  it('accepts every option it lists, on a keyless connection and on a key with the browser lane', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octocrawl-hosted-schema-'))
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const keys = new MemoryHostedKeys(new Map(Array.from({ length: 120 }, (_, i) => [keyDigest(HASH_KEY, `oc_browser_${i}`), { enabled: true, plan: 'free', dailyLimit: 1_000, browser: true }] as const)))
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys, quota: new MemoryHostedQuota(), credits: new MemoryCreditsStore(), proxySecret: PROXY_SECRET,
      keylessDaily: 1_000, siteDaily: 10_000, networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }, log: () => {},
    })
    if (!service.server.listening) await once(service.server, 'listening')
    // One legal value for every option hosted lists; a listed option missing here fails the test, so a new one needs a sample.
    const SAMPLES: Record<string, Record<string, unknown>> = {
      scrape: {
        mode: 'research', allowlistedDomains: ['127.0.0.1'], formats: ['markdown', 'html', 'links', 'tables'], includeLinks: true, debug: true, onlyMainContent: false,
        waitFor: 200, timeout: 20_000, maxFileBytes: 1_000_000, includeTags: ['main'], excludeTags: ['nav'], headers: { 'accept-language': 'en' }, mobile: true,
        fastMode: true, blockAds: false, removeBase64Images: false, verify: { checks: [{ type: 'markdownIncludes', text: 'Tides' }] }, integration: 'schema-check',
      },
      map: {
        search: 'b', sitemap: 'skip', includeSubdomains: true, ignoreQueryParameters: true, limit: 10, timeout: 20_000, includePaths: ['/'], excludePaths: ['/x'],
        regexOnFullURL: true, crawlEntireDomain: true, deduplicateSimilarURLs: false, mode: 'research', debug: true, integration: 'schema-check',
      },
    }
    let caller = 0
    try {
      for (const browser of [false, true]) {
        for (const name of ['scrape', 'map']) {
          const listed = Object.keys(schemaOf(hostedTools(browser), name).properties).filter((key) => key !== 'url')
          expect([browser, name, listed.filter((key) => !(key in SAMPLES[name]!))]).toEqual([browser, name, []])
          const extras: Record<string, unknown>[] = listed.map((key) => ({ [key]: SAMPLES[name]![key] }))
          if (name === 'scrape') extras.push({ mode: 'standard' }, ...(browser ? [{ formats: ['screenshot'] }] : []))
          for (const extra of extras) {
            caller++
            // Each call comes from its own address (and key), so the per-minute limits never answer instead.
            const headers: Record<string, string> = { 'x-w2l-proxy-secret': PROXY_SECRET, 'cf-connecting-ip': `10.7.0.${caller}`, ...(browser ? { authorization: `Bearer oc_browser_${caller}` } : {}) }
            const client = new Client({ name: 'hosted-schema-test', version: '1.0.0' })
            await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers } }))
            try {
              const result = await client.callTool({ name, arguments: { url: `${origin}/a`, ...extra } })
              const answer = JSON.parse((result.content as { text: string }[])[0]!.text) as { status: string; failureReason?: string | null }
              expect([browser, name, extra, answer.status]).toEqual([browser, name, extra, name === 'map' ? 'completed' : 'success'])
            } finally { await client.close() }
          }
        }
      }
    } finally {
      await service.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 180_000)

  it('runs mode authed on hosted REST as an anonymous read today, which is why the hosted schema leaves it out', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octocrawl-hosted-authed-'))
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys: new MemoryHostedKeys(new Map()), quota: new MemoryHostedQuota(), credits: new MemoryCreditsStore(),
      keylessDaily: 10, siteDaily: 100, networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }, log: () => {},
    })
    if (!service.server.listening) await once(service.server, 'listening')
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${origin}/a`, mode: 'authed' }) })
      expect(response.status).toBe(200)
      // No saved login exists on a hosted server, so "authed" reads the page as anyone would.
      expect(await response.json()).toMatchObject({ status: 'success', lane: 'http' })
    } finally {
      await service.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})
