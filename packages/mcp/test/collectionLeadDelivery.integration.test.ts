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
import { localNetworkPolicy, type CompactScrapeResponse, type VerifyContract } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'
import { NEWS_LEADS, newsCollectionFixture } from '@w2l/fixtures'
import { EXTRACTOR_VERSION } from '@w2l/extract-tf'

const fixture = newsCollectionFixture

describe('collection lead cards through localhost HTTP, engine, API, SDK and modern MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let baseUrl: string
  let mcp: Client
  let mcpServer: ReturnType<typeof serveStdio>
  let hosted: Client
  let hostedServer: ReturnType<typeof serveStdio>
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-collection-'))
    source = createServer((req, res) => req.url === '/robots.txt' ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': 'text/html' }).end(fixture(new URL(req.url!, 'http://fixture').pathname.slice(1))))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
    sdk = new W2L({ baseUrl })
    mcp = new Client({ name: 'octocrawl-collection-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    mcpServer = serveStdio(() => createMcpServer(sdk), { transport: serverSide })
    await mcp.connect(clientSide)
    hosted = new Client({ name: 'collection-minimal-test', version: '1' }, { versionNegotiation: { mode: 'auto' } })
    const [left, right] = InMemoryTransport.createLinkedPair()
    hostedServer = serveStdio(() => createMcpServer(sdk, { minimalResults: true }), { transport: right })
    await hosted.connect(left)
    for (const client of [mcp, hosted]) {
      expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28')
      expect((await client.listTools()).tools.find(tool => tool.name === 'scrape')?.outputSchema).toBeDefined()
    }
  })
  afterAll(async () => {
    await mcp?.close()
    await mcpServer?.close()
    await hosted?.close()
    await hostedServer?.close()
    await engine?.close()
    await Promise.all([api, source].filter(Boolean).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
    if (root) await rm(root, { recursive: true, force: true })
  })
  async function scrape(surface: 'API' | 'SDK' | 'MCP' | 'minimal MCP', debug: boolean, kind: string, verify?: VerifyContract, prune = false): Promise<CompactScrapeResponse> {
    const url = `${origin}/${kind}`
    const args = { url, formats: ['markdown', 'tables', 'links', 'rawHtml'] as const, fastMode: true, debug, maxAge: 0, storeInCache: false, ...(prune ? { excludeTags: ['#leads'] } : {}), ...(verify === undefined ? {} : { verify }) }
    if (surface === 'API') {
      const response = await fetch(`${baseUrl}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
      expect(response.status).toBe(200)
      return await response.json() as CompactScrapeResponse
    }
    if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(url, args))) as CompactScrapeResponse
    const response = await (surface === 'minimal MCP' ? hosted : mcp).callTool({ name: 'scrape', arguments: args })
    expect(response.isError).not.toBe(true)
    const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
    expect(response.structuredContent).toEqual(out)
    return out
  }
  for (const surface of ['API', 'SDK', 'MCP', 'minimal MCP'] as const) for (const debug of [false, true]) {
    it(`${surface} ${debug ? 'full' : 'compact'} delivers paired leads and the stream; rejects absent or excluded leads`, async () => {
      const required = NEWS_LEADS.map(([title, href]) => `[${title}](${origin}${href})`)
      const contract: VerifyContract = { checks: required.map(text => ({ type: 'markdownIncludes', text })) }
      for (const [kind, verify, prune] of [['valid', contract, false], ['missing-lead', contract, false], ['valid', contract, true], ['valid', undefined, false]] as const) {
        const out = await scrape(surface, debug, kind, verify, prune)
        const expected = verify === undefined ? 'not_requested' : kind === 'valid' && !prune ? 'passed' : 'failed'
        expect(out.status).toBe('success')
        expect(out.verification.status).toBe(expected)
        expect(out.evidenceRecord.verification?.status).toBe(expected)
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.readiness.state === 'ready').toBe(expected !== 'failed')
        if (kind === 'valid' && !prune) for (const value of required) expect(out.markdown).toContain(value)
        if (kind === 'missing-lead') expect(out.markdown).not.toContain(required[1])
        if (prune) for (const [title] of NEWS_LEADS) expect(out.markdown).not.toContain(title)
        expect(out.markdown).toContain('Chronological report 1 ')
        expect(out.markdown).toContain('Chronological report 24 ')
        for (const value of ['Navigation marker', 'Sidebar marker', 'Recommendation marker', 'Heading recommendation marker', 'Advertisement marker', 'Unrelated marker', 'Following section marker', 'Footer marker']) expect(out.markdown).not.toContain(value)
        expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture(kind)).digest('hex'))
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        expect(out.evidenceRecord.outputSha256.markdown).toBe(createHash('sha256').update(out.markdown!).digest('hex'))
        expect(out.evidenceRecord.extractor.version).toBe(EXTRACTOR_VERSION)
      }
    })
  }

  it('rechecks the hosted telemetry projection: omitted usage fails while debug usage passes', async () => {
    const contract: VerifyContract = { checks: [{ type: 'field', path: 'usage.requestCount', min: 0 }] }
    for (const surface of ['API', 'SDK', 'MCP', 'minimal MCP'] as const) for (const debug of [false, true]) {
      const out = await scrape(surface, debug, 'valid', contract)
      const omitted = surface === 'minimal MCP' && !debug
      expect(out.usage === undefined).toBe(omitted)
      expect(out.verification.status).toBe(omitted ? 'failed' : 'passed')
      expect(out.readiness.state).toBe(omitted ? 'not_extracted' : 'ready')
      if (omitted) expect(out.readiness.basis).toContain('mcp_result_minimized')
      expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
      expect(out.evidenceRecord.readiness).toEqual(out.readiness)
    }
  })
})
