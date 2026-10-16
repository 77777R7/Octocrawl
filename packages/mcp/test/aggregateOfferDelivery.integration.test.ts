import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { localNetworkPolicy, parseScrapeRequest, type CompactScrapeResponse } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'


const cards = Array.from({ length: 3 }, (_, i) => `<div class="card"><a href="/flight/${i + 1}">Route offer ${i + 1}, January ${i + 1}</a><span class="price">£${21 + i}</span><p>Direct travel with carrier ${i + 1} from North to South.</p></div>`).join('')
function fixture(kind: string): string {
  const offers = kind === 'single' ? { '@type': 'Offer', price: 84, priceCurrency: 'GBP' } : { '@type': 'AggregateOffer', lowPrice: 21, priceCurrency: 'GBP' }
  const content = kind === 'aggregate' || kind === 'single' ? `<div>${cards}</div>` : kind === 'recommended' ? `<section><h2>Customers also viewed</h2><div>${cards}</div></section>` : ''
  return `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'North to South travel', offers })}</script></head><body><main><h1>North to South travel</h1><p>Compare departures and choose one of the available route offers for your journey from North to South.</p>${content}</main></body></html>`
}
const verify = { checks: [{ type: 'markdownCountMin' as const, pattern: 'Route offer [1-3], January [1-3]', min: 3 }] }
describe('aggregate offer records through HTTP, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-aggregate-offers-'))
    source = createServer((req, res) => req.url === '/robots.txt' ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': 'text/html' }).end(fixture(new URL(req.url!, 'http://fixture').pathname.slice(1))))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-aggregate-offers-test', version: '1.0.0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([createMcpServer(sdk).connect(serverSide), mcp.connect(clientSide)])
    structured = (await mcp.listTools()).tools.some(tool => tool.name === 'scrape' && tool.outputSchema !== undefined)
  })
  afterAll(async () => {
    await mcp?.close()
    await engine?.close()
    await Promise.all([api, source].filter(Boolean).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
    if (root) await rm(root, { recursive: true, force: true })
  })
  for (const surface of ['SDK', 'MCP'] as const) for (const debug of [false, true]) {
    it(`${surface} ${debug ? 'full' : 'compact'} keeps subject offers and rejects empty or recommended-only results`, async () => {
      for (const kind of ['aggregate', 'single', 'recommended', 'empty']) {
        const url = `${origin}/${kind}`
        const args = { url, formats: ['markdown', 'rawHtml'] as const, fastMode: true, debug, maxAge: 0, verify }
        let out: CompactScrapeResponse
        if (surface === 'SDK') out = JSON.parse(JSON.stringify(await sdk.scrape(url, args))) as CompactScrapeResponse
        else {
          const wire = await mcp.callTool({ name: 'scrape', arguments: args })
          expect(wire.isError).not.toBe(true)
          out = JSON.parse((wire.content as Array<{ type: string; text: string }>).find(x => x.type === 'text')!.text) as CompactScrapeResponse
          if (structured) expect(wire.structuredContent).toEqual(out)
          else expect(wire.structuredContent).toBeUndefined()
        }
        const pass = kind === 'aggregate'
        expect(out.verification.status, kind).toBe(pass ? 'passed' : 'failed')
        expect(out.readiness.state === 'ready', kind).toBe(pass)
        expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture(kind)).digest('hex'))
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        if (pass) for (const i of [1, 2, 3]) {
          expect(out.markdown).toContain(`Route offer ${i}, January ${i}`)
          expect(out.markdown).toContain(`${origin}/flight/${i}`)
          expect(out.markdown).toContain(`£${20 + i}`)
        }
      }
    })
  }
})
