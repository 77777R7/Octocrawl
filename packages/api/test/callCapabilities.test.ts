import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostedNetworkPolicy, identityBundleFrom, localNetworkPolicy, modeIdentity, parseScrapeRequest, type FetchResult } from '@w2l/contracts'
import { accessGrantFromText } from '@w2l/http-core'
import { CompatAddressGuard, compatIdentity, type Channel } from '@w2l/bench'
import { createApiEngine, type ApiEngine, type ApiEngineOptions, type CallCapability } from '../src/engine.js'

/**
 * Capabilities granted per call (ROADMAP stage H item 2, the "B8" blocker of the cloud plan): an engine built with
 * `callCapabilities` takes compatible_transport from a call's own context, a scrape's or a job slice's, and gives it to
 * that call alone. A server's own grant still applies to every call, a call never grants itself anything, and a hosted
 * engine grants nothing else per call.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(4)
const GRANT = accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities: ['compatible_transport'] }))
const COMPAT: readonly CallCapability[] = ['compatible_transport']

function page(url: string): FetchResult {
  return {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http',
    escalations: [], handoff: null, markdown: `# Tides\n\n${PROSE}`, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 400, browserMs: 0, externalCostUsd: 0 },
    trace: [],
  }
}

type Audit = { channelsTried: string[]; ladderTrace: { event: string; detail?: unknown }[] }

describe('capabilities granted per call', () => {
  let root: string
  let engine: ApiEngine | null = null
  const seen: [string, string][] = []

  afterEach(async () => {
    await engine?.close()
    engine = null
    seen.length = 0
    await rm(root, { recursive: true, force: true })
  })

  async function setup(options: Partial<ApiEngineOptions> = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-call-capabilities-'))
    const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => { seen.push([url, 'http']); return page(url) } },
      ...(mode === 'standard' ? [{ id: 'http_compat', identity: identityBundleFrom(compatIdentity()), fetch: async (url: string) => { seen.push([url, 'http_compat']); return page(url) } }] : []),
    ]
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor, networkPolicy: { ...hostedNetworkPolicy(), perHostMinDelayMs: 0 }, hosted: true, callCapabilities: COMPAT, compatHosts: ['shop.test'], ...options })
  }

  it('sends a listed host over http_compat on a hosted engine only for a call that holds compatible_transport', async () => {
    await setup()
    const held = await engine!.scrape(parseScrapeRequest({ url: 'https://shop.test/item', debug: true }), { capabilities: COMPAT }) as unknown as Audit
    expect(held.channelsTried).toEqual(['http_compat'])
    expect(held.ladderTrace[0]).toMatchObject({ event: 'ladder_channels_filtered', detail: { reason: 'compatible_transport', dropped: ['http'] } })
    // The next call holds nothing: the http rung, and nothing about the compatible one in its audit.
    const plain = await engine!.scrape(parseScrapeRequest({ url: 'https://shop.test/item', debug: true })) as unknown as Audit
    expect(plain.channelsTried).toEqual(['http'])
    expect(plain.ladderTrace.map((event) => event.event)).not.toContain('ladder_channels_filtered')
    // A host not listed stays on http whatever the call holds; options the transport cannot send keep http too, as locally.
    expect((await engine!.scrape(parseScrapeRequest({ url: 'https://news.test/a', debug: true }), { capabilities: COMPAT }) as unknown as Audit).channelsTried).toEqual(['http'])
    const mobile = await engine!.scrape(parseScrapeRequest({ url: 'https://shop.test/item', debug: true, mobile: true }), { capabilities: COMPAT }) as unknown as Audit
    expect(mobile.channelsTried).toEqual(['http'])
    expect(mobile.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channels_filtered', detail: { reason: 'mobile', dropped: ['http_compat'] } }))
  })

  it('gives a job slice what its worker passed, page by page, and nothing to a slice passed nothing', async () => {
    await setup({ deferLaunch: true })
    const urls = ['https://news.test/a', 'https://shop.test/b', 'https://img.shop.test/c']
    const run = async (capabilities?: readonly CallCapability[]) => {
      seen.length = 0
      const { taskId } = await engine!.startBatch({ urls, maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
      const result = await engine!.runSlice(taskId, { maxNewPages: 10, maxMs: 20_000, ...(capabilities === undefined ? {} : { capabilities }) })
      expect(result?.status).toBe('completed')
      return new Map(seen)
    }
    expect(await run(COMPAT)).toEqual(new Map([['https://news.test/a', 'http'], ['https://shop.test/b', 'http_compat'], ['https://img.shop.test/c', 'http_compat']]))
    expect(await run()).toEqual(new Map(urls.map((url) => [url, 'http'])))
  })

  it('lets a call hold only what the engine grants per call: a local engine grants nothing, its own grant applies to every call', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-call-capabilities-'))
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), networkPolicy: localNetworkPolicy() })
    await expect(engine.scrape(parseScrapeRequest({ url: 'https://shop.test/item' }), { capabilities: COMPAT })).rejects.toThrow(/grants compatible_transport to no call/)
    await engine.close()
    // A server's grant that names the transport: every call holds it, with no context at all.
    const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => { seen.push([url, 'http']); return page(url) } },
      { id: 'http_compat', identity: identityBundleFrom(compatIdentity()), fetch: async (url: string) => { seen.push([url, 'http_compat']); return page(url) } },
    ]
    engine = createApiEngine({ taskRoot: join(root, 'local'), channelsFor, accessGrant: GRANT, compatHosts: ['shop.test'], networkPolicy: { ...localNetworkPolicy(), perHostMinDelayMs: 0 } })
    expect((await engine.scrape(parseScrapeRequest({ url: 'https://shop.test/item', debug: true })) as unknown as Audit).channelsTried).toEqual(['http_compat'])
  })

  it('sends a hosted engine\'s transport through the address guard, and a local engine\'s straight to the site', async () => {
    const site = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tides</h1><p>${PROSE}</p></article></body></html>`)
    })
    await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(site.address() as AddressInfo).port}/page`
    // The site is on both policies' lists, so impit reaches it with or without the guard: whether impit is handed the guard is checked apart.
    const guarded = vi.spyOn(CompatAddressGuard.prototype, 'proxyUrl')
    root = await mkdtemp(join(tmpdir(), 'w2l-call-capabilities-'))
    try {
      engine = createApiEngine({ taskRoot: join(root, 'hosted'), hosted: true, callCapabilities: COMPAT, compatHosts: ['127.0.0.1'], networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.1'], perHostMinDelayMs: 0 } })
      expect(await engine.scrape(parseScrapeRequest({ url, debug: true }), { capabilities: COMPAT })).toMatchObject({ status: 'success', channelsTried: ['http_compat'] })
      expect(guarded).toHaveBeenCalled()
      await engine.close()
      guarded.mockClear()
      engine = createApiEngine({ taskRoot: join(root, 'local'), accessGrant: GRANT, compatHosts: ['127.0.0.1'], networkPolicy: { ...localNetworkPolicy(), perHostMinDelayMs: 0 } })
      expect(await engine.scrape(parseScrapeRequest({ url, debug: true }))).toMatchObject({ status: 'success', channelsTried: ['http_compat'] })
      expect(guarded).not.toHaveBeenCalled()
    } finally {
      guarded.mockRestore()
      site.closeAllConnections()
      await new Promise<void>((resolve) => site.close(() => resolve()))
    }
  })

  it('grants nothing else per call: installed_chrome, the solver, vendors and egress stay with a server\'s grant, which a hosted engine refuses', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-call-capabilities-'))
    for (const name of ['installed_chrome', 'third_party_captcha_solver', 'vendor_remote_browser', 'vendor_stealth', 'egress_sessions', 'enhanced_browser', 'my_browser']) {
      expect(() => createApiEngine({ taskRoot: join(root, name), hosted: true, callCapabilities: [name as CallCapability] }), name).toThrow(/cannot be granted per call/)
    }
    // The compatible transport on a hosted engine comes per call or not at all, whatever a grant says.
    expect(() => createApiEngine({ taskRoot: join(root, 'grant'), hosted: true, accessGrant: GRANT, compatHosts: ['shop.test'] })).toThrow(/refused on a hosted engine unless it is granted per call/)
  })

  describe('hosted_chrome (ADR 0005, revision of 2026-10-27): operator config, the call\'s capability and access enhanced, together', () => {
    const HELD: readonly CallCapability[] = ['compatible_transport', 'hosted_chrome']
    const ATTESTATION = { principal: 'operator', at: '2026-10-28T00:00:00Z', statement: 'Octocrawl runs Google Chrome on its own server for accounts it lets in.' }
    /** A page a check stopped, on the rung that read it. */
    const stopped = (url: string, lane: FetchResult['lane']): FetchResult => ({ ...page(url), lane, status: 'blocked', blockReason: 'cloudflare_challenge', markdown: null, evidence: { ...page(url).evidence, httpStatus: 403 } })
    const asked: string[] = []
    const client = { fetch: async (url: string) => { asked.push(url); return { ...page(url), lane: 'browser_local' as const } }, close: vi.fn(async () => {}) }
    /** A stand-in for the operator's D5 counter: the accounts it was asked for, what it settled, and a refusal to give. */
    const admitted: (string | undefined)[] = []
    const settled: [string | null, boolean][] = []
    let refusal: { reason: string; message: string; detail?: Record<string, unknown> } | null = null
    const meter = {
      admit: async ({ account }: { account: string | undefined }) => {
        admitted.push(account)
        return refusal === null ? { ok: true as const, settle: async (result: FetchResult | null, called: boolean) => { settled.push([result?.status ?? null, called]) } } : { ok: false as const, ...refusal }
      },
    }

    async function hostedSetup(options: Partial<ApiEngineOptions> = {}) {
      asked.length = 0
      admitted.length = 0
      settled.length = 0
      refusal = null
      root = await mkdtemp(join(tmpdir(), 'w2l-call-capabilities-'))
      const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
        { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => { seen.push([url, 'http']); return stopped(url, 'http') } },
        { id: 'browser_local', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => { seen.push([url, 'browser_local']); return stopped(url, 'browser_local') } },
      ]
      engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor, networkPolicy: { ...hostedNetworkPolicy(), perHostMinDelayMs: 0 }, hosted: true, callCapabilities: HELD, hostedChrome: { attestation: ATTESTATION, client, meter }, ...options })
    }
    const scrape = async (request: Record<string, unknown>, capabilities?: readonly CallCapability[], account?: string) =>
      await engine!.scrape(parseScrapeRequest({ url: 'https://shop.test/item', debug: true, ...request }), { ...(capabilities === undefined ? {} : { capabilities }), ...(account === undefined ? {} : { account }) }) as unknown as Audit & { status: string; warnings?: { code: string; message: string }[] }

    it('reads a page the rungs before it could not, after browser_local, only for a call that holds it and chose access enhanced', async () => {
      await hostedSetup()
      const read = await scrape({ access: 'enhanced' }, HELD)
      expect(read.channelsTried).toEqual(['http', 'browser_local', 'hosted_chrome'])
      expect(read.status).toBe('success')
      expect(asked).toEqual(['https://shop.test/item'])
      // Holding it without access enhanced, or access enhanced without holding it (a keyless call holds nothing): no such
      // rung, in the audit either, and the page is what the rungs before it read.
      for (const [request, capabilities] of [[{}, HELD], [{ access: 'standard' }, HELD], [{ access: 'enhanced' }, undefined], [{ access: 'enhanced' }, ['compatible_transport']]] as const) {
        const plain = await scrape(request, capabilities)
        expect(plain.channelsTried, JSON.stringify([request, capabilities])).toEqual(['http', 'browser_local'])
        expect(plain.status).toBe('blocked')
        expect(JSON.stringify(plain.ladderTrace)).not.toContain('hosted_chrome')
      }
      expect(asked).toHaveLength(1)
    })

    it('asks the operator\'s counter for the call\'s account before each read, and settles it with what the rung read', async () => {
      await hostedSetup()
      const read = await scrape({ access: 'enhanced' }, HELD, 'account-1')
      expect(read.channelsTried).toEqual(['http', 'browser_local', 'hosted_chrome'])
      expect(admitted).toEqual(['account-1'])
      expect(settled).toEqual([['success', true]])
      // A call the rung is not built for asks nothing.
      await scrape({}, HELD, 'account-1')
      expect(admitted).toEqual(['account-1'])
    })

    it('over a D5 limit, does not use the rung: the page is what the rungs before it read, and the result and the trace say why', async () => {
      await hostedSetup()
      refusal = { reason: 'daily_attempts', message: 'hosted_chrome was not used: this account\'s 2 attempts for today (UTC) are used up', detail: { limit: 2 } }
      const read = await scrape({ access: 'enhanced' }, HELD, 'account-1')
      expect(read.status).toBe('blocked')
      expect(read.channelsTried).toEqual(['http', 'browser_local'])
      expect(asked).toEqual([])
      expect(settled).toEqual([])
      expect(read.warnings).toContainEqual({ code: 'hosted_chrome_not_admitted', message: refusal.message })
      expect(read.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', channel: 'hosted_chrome', detail: { reason: 'daily_attempts', limit: 2 } }))
    })

    it('builds no rung without the operator\'s config, whatever the call holds: access enhanced is refused as before', async () => {
      await hostedSetup({ hostedChrome: undefined })
      await expect(scrape({ access: 'enhanced' }, HELD)).rejects.toThrow(/no approved budget for enhanced access/)
      expect((await scrape({}, HELD)).channelsTried).toEqual(['http', 'browser_local'])
      expect(asked).toEqual([])
    })

    it('refuses the options installed_chrome refuses, by name, and closes the service client once with the engine', async () => {
      await hostedSetup()
      client.close.mockClear()
      const mobile = await scrape({ access: 'enhanced', mobile: true }, HELD)
      expect(mobile.channelsTried).not.toContain('hosted_chrome')
      expect(JSON.stringify(mobile.ladderTrace)).toContain('hosted_chrome reads the page as Chrome opened it and takes no mobile')
      expect(asked).toEqual([])
      await engine!.close()
      engine = null
      expect(client.close).toHaveBeenCalledTimes(1)
      client.close.mockClear()
    })

    it('gives a job slice the rung only when its worker passed hosted_chrome and the job chose access enhanced', async () => {
      await hostedSetup({ deferLaunch: true })
      const run = async (access: 'enhanced' | undefined, capabilities?: readonly CallCapability[]) => {
        asked.length = 0
        const { taskId } = await engine!.startBatch({ urls: ['https://news.test/a'], maxConcurrency: 1, ...(access === undefined ? {} : { access }) } as Parameters<ApiEngine['startBatch']>[0])
        await engine!.runSlice(taskId, { maxNewPages: 10, maxMs: 20_000, account: 'account-1', ...(capabilities === undefined ? {} : { capabilities }) })
        return [...asked]
      }
      expect(await run('enhanced', HELD)).toEqual(['https://news.test/a'])
      // The counter is asked for the job's account, as the worker named it.
      expect(admitted).toEqual(['account-1'])
      expect(await run('enhanced')).toEqual([])
      expect(await run(undefined, HELD)).toEqual([])
    })

    it('runs only on a hosted engine that grants it per call, with the operator\'s attestation, and never by a grant', async () => {
      root = await mkdtemp(join(tmpdir(), 'w2l-call-capabilities-'))
      const operator = { attestation: ATTESTATION, client, meter }
      // The rung is never wired without its spend counter (D5): the operator's config is refused at once.
      expect(() => createApiEngine({ taskRoot: join(root, 'unmetered'), hosted: true, callCapabilities: HELD, hostedChrome: { attestation: ATTESTATION, client } as unknown as NonNullable<ApiEngineOptions['hostedChrome']> })).toThrow(/spend counter/)
      expect(() => createApiEngine({ taskRoot: join(root, 'local'), hostedChrome: operator })).toThrow(/only on hosted Octocrawl/)
      expect(() => createApiEngine({ taskRoot: join(root, 'unnamed'), hosted: true, callCapabilities: COMPAT, hostedChrome: operator, compatHosts: ['shop.test'] })).toThrow(/callCapabilities must name it/)
      expect(() => createApiEngine({ taskRoot: join(root, 'unattested'), hosted: true, callCapabilities: HELD, hostedChrome: { ...operator, attestation: { ...ATTESTATION, statement: ' ' } } })).toThrow(/attestation/)
      // A local engine whose real-Chrome rung is installed_chrome, and a hosted one that refuses it, the solver and egress proxies as before.
      expect(() => createApiEngine({ taskRoot: join(root, 'grant'), hosted: true, accessGrant: accessGrantFromText(JSON.stringify({ tier: 'enhanced', capabilities: ['installed_chrome'], attestation: ATTESTATION })) })).toThrow(/installed_chrome is refused on a hosted engine/)
      expect(() => accessGrantFromText(JSON.stringify({ tier: 'enhanced', capabilities: ['hosted_chrome'], attestation: ATTESTATION }))).toThrow(/granted per call/)
    })
  })
})
