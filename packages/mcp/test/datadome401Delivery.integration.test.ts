import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { localNetworkPolicy, type CompactScrapeResponse } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

// The real retained MarketWatch page has HTTP 401 and an actual CAPTCHA iframe.
// These are synthetic controls, without its signed URL or captured response.
const iframe = '<iframe title="DataDome CAPTCHA" src="https://geo.captcha-delivery.com/captcha/?example=1"></iframe>'
const prose = 'This article explains how market data is sourced and how CAPTCHA challenges differ from account authentication. '.repeat(8)
const fixtures = {
  captcha: { status: 401, body: iframe, reason: 'captcha' },
  login: { status: 401, body: '<h1>Sign in</h1><form><input type="password"></form>', reason: 'login_wall' },
  device: { status: 401, body: iframe.replace('/captcha/', '/interstitial/'), reason: 'login_wall' },
  sensor: { status: 401, body: '<script src="https://ct.captcha-delivery.com/c.js"></script>', reason: 'login_wall' },
  lookalike: { status: 401, body: iframe.replace('geo.captcha-delivery.com', 'geo.notcaptcha-delivery.com'), reason: 'login_wall' },
  article: { status: 200, body: '<article><h1>DataDome CAPTCHA guide</h1><p>' + prose + '</p><pre>&lt;iframe src="https://geo.captcha-delivery.com/captcha/"&gt;</pre></article>', reason: null },
  normal: { status: 200, body: '<article><h1>Market report</h1><p>' + prose + '</p></article><script src="https://ct.captcha-delivery.com/c.js"></script>', reason: null },
} as const

describe('DataDome 401 final API / SDK / MCP delivery', () => {
  let source: Server, api: Server, engine: ApiEngine, root: string, origin: string, baseUrl: string, sdk: W2L
  const clients: Client[] = []
  const handles: ReturnType<typeof serveStdio>[] = []
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-datadome-401-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      const key = (req.url ?? '').slice(1) as keyof typeof fixtures
      const item = fixtures[key]
      if (!item) { res.writeHead(404).end(); return }
      res.writeHead(item.status, { 'content-type': 'text/html; charset=utf-8' }).end('<html><head><title>marketwatch.com</title></head><body>' + item.body + '</body></html>')
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = 'http://127.0.0.1:' + (source.address() as AddressInfo).port
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0, egressProxy: null }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    baseUrl = 'http://127.0.0.1:' + (api.address() as AddressInfo).port
    sdk = new W2L({ baseUrl })
    for (const minimalResults of [false, true]) {
      const client = new Client({ name: 'datadome-401-test', version: '1' }, { versionNegotiation: { mode: 'auto' } })
      const [left, right] = InMemoryTransport.createLinkedPair()
      handles.push(serveStdio(() => createMcpServer(sdk, { minimalResults }), { transport: right }))
      await client.connect(left)
      expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28')
      expect((await client.listTools()).tools.find(tool => tool.name === 'scrape')?.outputSchema).toBeDefined()
      clients.push(client)
    }
  })
  afterAll(async () => {
    for (const client of clients) await client.close()
    for (const handle of handles) await handle.close()
    await engine?.close()
    await Promise.all([api, source].filter(Boolean).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
    if (root) await rm(root, { recursive: true, force: true })
  })

  const cases = (Object.keys(fixtures) as Array<keyof typeof fixtures>).flatMap(kind => [false, true].flatMap(debug => [false, true].map(configured => ({ kind, debug, configured }))))
  it.each(cases)('$kind debug=$debug contract=$configured keeps classification and final conclusions aligned', async ({ kind, debug, configured }) => {
    const fixture = fixtures[kind]
    const request = { url: origin + '/' + kind, formats: ['markdown' as const], fastMode: true, debug, maxAge: 0, storeInCache: false, ...(configured ? { verify: { checks: [{ type: 'markdownIncludes' as const, text: fixture.reason ? 'AAPL current price' : 'market data' }] } } : {}) }
    const response = await fetch(baseUrl + '/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
    expect(response.status).toBe(200)
    const results: CompactScrapeResponse[] = [await response.json() as CompactScrapeResponse, JSON.parse(JSON.stringify(await sdk.scrape(request.url, request))) as CompactScrapeResponse]
    for (const client of clients) {
      const tool = await client.callTool({ name: 'scrape', arguments: request })
      expect(tool.isError).not.toBe(true)
      const text = tool.content.find(item => item.type === 'text')
      if (text?.type !== 'text') throw new Error('MCP text absent')
      const result = JSON.parse(text.text) as CompactScrapeResponse
      expect(tool.structuredContent).toEqual(result)
      results.push(result)
    }
    const html = '<html><head><title>marketwatch.com</title></head><body>' + fixture.body + '</body></html>'
    for (const result of results) {
      const verification = !configured ? 'not_requested' : fixture.reason ? 'failed' : 'passed'
      expect(result.status).toBe(fixture.reason ? 'blocked' : 'success')
      expect(result.blockReason).toBe(fixture.reason)
      expect(result.verification.status).toBe(verification)
      if (configured && fixture.reason) expect(result.verification).toMatchObject({ reason: 'page_not_read', checks: [] })
      expect(result.readiness.state).toBe(fixture.reason ? 'not_served' : 'ready')
      if (fixture.reason) expect(result.readiness.basis).toEqual([fixture.reason])
      expect(result.evidenceRecord.status).toBe(result.status)
      expect(result.evidenceRecord.reason).toBe(fixture.reason)
      expect(result.evidenceRecord.readiness).toEqual({ state: result.readiness.state, basis: result.readiness.basis })
      expect(result.evidenceRecord.verification?.status).toBe(verification)
      expect(result.snapshot.httpStatus).toBe(fixture.status)
      expect(result.evidenceRecord.httpStatus).toBe(fixture.status)
      expect(result.snapshot.rawBodySha256).toBe(createHash('sha256').update(html).digest('hex'))
      expect(result.evidenceRecord.rawSha256).toBe(result.snapshot.rawBodySha256)
      if (typeof result.markdown === 'string') expect(result.evidenceRecord.outputSha256.markdown).toBe(createHash('sha256').update(result.markdown).digest('hex'))
      if (fixture.reason) expect(result.markdown ?? '').not.toContain('AAPL current price')
    }
  })
})
