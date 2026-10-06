import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { identityBundleFrom, localNetworkPolicy, modeIdentity, type FetchResult } from '@w2l/contracts'
import { accessGrantFromText } from '@w2l/http-core'
import { compatIdentity, type Channel } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * W2L_COMPAT_HOSTS in the engine (ADR 0005 `compatible_transport`): a listed host's pages take the
 * `http_compat` rung in place of `http`, a scrape's audit says so, every other host is untouched,
 * and a batch decides page by page.
 */

const GRANT = accessGrantFromText(JSON.stringify({ tier: 'enhanced', capabilities: ['compatible_transport'], attestation: { principal: 'operator@example.test', at: '2026-10-06T00:00:00Z', statement: 'I accept the terms.' } }))
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(4)

function page(url: string): FetchResult {
  return {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http',
    escalations: [], handoff: null, markdown: `# Tides\n\n${PROSE}`, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 400, browserMs: 0, externalCostUsd: 0 },
    trace: [],
  }
}

describe('the compatible transport for listed hosts', () => {
  let root: string
  let engine: ApiEngine | null = null
  const seen: [string, string][] = []

  afterEach(async () => {
    await engine?.close()
    engine = null
    seen.length = 0
    await rm(root, { recursive: true, force: true })
  })

  async function setup(compatHosts: readonly string[] = ['shop.test']) {
    root = await mkdtemp(join(tmpdir(), 'w2l-compat-'))
    const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => { seen.push([url, 'http']); return page(url) } },
      ...(mode === 'standard' ? [{ id: 'http_compat', identity: identityBundleFrom(compatIdentity()), fetch: async (url: string) => { seen.push([url, 'http_compat']); return page(url) } }] : []),
    ]
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor, accessGrant: GRANT, compatHosts, networkPolicy: { ...localNetworkPolicy(), perHostMinDelayMs: 0 } })
  }

  it('sends a listed host and its subdomains over http_compat, and says http was set aside', async () => {
    await setup()
    const res = await engine!.scrape({ url: 'https://www.shop.test/item', debug: true }) as unknown as { channelsTried: string[]; ladderTrace: { event: string; detail?: unknown }[] }
    expect(res.channelsTried).toEqual(['http_compat'])
    expect(res.ladderTrace[0]).toMatchObject({ event: 'ladder_channels_filtered', detail: { reason: 'compatible_transport', dropped: ['http'] } })
  })

  it('leaves every other host on http, with nothing about the compatible rung in its audit', async () => {
    await setup()
    const res = await engine!.scrape({ url: 'https://news.test/a', debug: true }) as unknown as { channelsTried: string[]; ladderTrace: { event: string }[] }
    expect(res.channelsTried).toEqual(['http'])
    expect(res.ladderTrace.map((event) => event.event)).not.toContain('ladder_channels_filtered')
  })

  it('keeps http for a listed host when the request asks for headers or mobile, and says why', async () => {
    await setup()
    for (const [ask, reason] of [[{ headers: { 'x-team': 'a' } }, 'headers'], [{ mobile: true }, 'mobile']] as const) {
      const res = await engine!.scrape({ url: 'https://shop.test/item', debug: true, ...ask }) as unknown as { channelsTried: string[]; ladderTrace: { event: string; detail?: unknown }[] }
      expect(res.channelsTried).toEqual(['http'])
      expect(res.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channels_filtered', detail: { reason, dropped: ['http_compat'] } }))
    }
  })

  it('picks the rung page by page in a batch', async () => {
    await setup()
    const urls = ['https://news.test/a', 'https://shop.test/b', 'https://img.shop.test/c']
    const { taskId } = await engine!.startBatch({ urls, maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
    let report = await engine!.getBatch(taskId)
    for (let i = 0; i < 200 && (report === null || ['pending', 'running'].includes(report.status)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      report = await engine!.getBatch(taskId)
    }
    expect(report).toMatchObject({ status: 'completed', completed: 3 })
    expect(new Map(seen)).toEqual(new Map([['https://news.test/a', 'http'], ['https://shop.test/b', 'http_compat'], ['https://img.shop.test/c', 'http_compat']]))
  })

  it("reads a map's start page on the http rung, under the identity the map reports", async () => {
    // robots.txt is read for real before the start page; the pages themselves come from the stub rungs.
    const robots = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'))
    await new Promise<void>((resolve) => robots.listen(0, '127.0.0.1', resolve))
    try {
      await setup(['127.0.0.1'])
      const url = `http://127.0.0.1:${(robots.address() as AddressInfo).port}/`
      const res = await engine!.map({ url, sitemap: 'skip' } as Parameters<ApiEngine['map']>[0])
      expect(seen).toEqual([[url, 'http']])
      expect(res.identity?.userAgent).toContain('Chrome/128.')
    } finally {
      robots.closeAllConnections()
      await new Promise<void>((resolve) => robots.close(() => resolve()))
    }
  })

  it('is refused without a grant that names compatible_transport, and on a hosted engine', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-compat-'))
    expect(() => createApiEngine({ taskRoot: join(root, 'a'), compatHosts: ['shop.test'] })).toThrow(/names compatible_transport/)
    expect(() => createApiEngine({ taskRoot: join(root, 'b'), compatHosts: ['shop.test'], accessGrant: GRANT, hosted: true })).toThrow(/refused on a hosted engine/)
  })
})
