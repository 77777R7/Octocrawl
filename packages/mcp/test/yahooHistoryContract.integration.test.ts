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

const request = parseScrapeRequest(JSON.parse(await readFile(new URL('../../../examples/contracts/yahoo-history.json', import.meta.url), 'utf8')))
const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']
// Synthetic historical values; zero is a valid price or volume, not a missing value.
const values = ['Jan 2, 2026', '0.00', '12.00', '0.00', '10.00', '10.00', '0']
const validRow = `<tr>${values.map(value => `<td>${value}</td>`).join('')}</tr>`
function fixture(kind: string): string {
  const rows = kind === 'valid' ? validRow : kind === 'missing' ? validRow.replace('<td>10.00</td>', '<td></td>')
    : kind === 'dividend' ? '<tr><td>Jan 2, 2026</td><td colspan="6">0.25 Dividend</td></tr>'
      : kind === 'na' ? `<tr>${values.map((value, i) => `<td>${i === 1 ? 'n/a' : value}</td>`).join('')}</tr>`
        : '<tr><td colspan="7">There are no in the selected time period.</td></tr>'
  const columns = kind === 'wrong-columns' ? [...headers.slice(0, 6), 'Market cap'] : headers
  const target = kind === 'outside' ? '' : `<div data-testid="history-table"><p>Currency in USD</p><table><tr>${columns.map(value => `<th>${value}</th>`).join('')}</tr>${rows}</table></div>`
  const unrelated = kind === 'outside' ? `<table><tr>${headers.map(value => `<th>${value}</th>`).join('')}</tr>${validRow}</table>` : ''
  return `<html><head><title>${kind === 'wrong-asset' ? 'Different company' : 'Apple Inc. (AAPL) Stock Historical Prices & Data - Yahoo Finance'}</title></head><body><main><h1>Apple Inc. (AAPL)</h1><p>Current quote 342.00 -0.96 (-0.28%). Premarket 342.40 +0.40 (+0.12%).</p>${target}${unrelated}</main></body></html>`
}

describe('explicit Yahoo historical-row contract through HTTP, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-yahoo-contract-'))
    source = createServer((req, res) => req.url === '/robots.txt' ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': 'text/html' }).end(fixture(new URL(req.url!, 'http://fixture').pathname.slice(1))))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-yahoo-contract-test', version: '1.0.0' })
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
    async function scrape(kind: string, weak = false): Promise<CompactScrapeResponse> {
      const url = `${origin}/${kind}`
      const args = { ...request, url, debug, fastMode: true, formats: ['markdown', 'tables', 'rawHtml'] as const, ...(weak ? { includeTags: ['main'], verify: { checks: [{ type: 'markdownMatches' as const, pattern: 'Apple', flags: 'i' }, { type: 'markdownCountMin' as const, pattern: '\\d+\\.\\d{2}', min: 5 }] } } : {}) }
      if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(url, args))) as CompactScrapeResponse
      const response = await mcp.callTool({ name: 'scrape', arguments: args })
      expect(response.isError).not.toBe(true)
      const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
      if (structured) expect(response.structuredContent).toEqual(out)
      else expect(response.structuredContent).toBeUndefined()
      return out
    }
    it(`${surface} ${debug ? 'full' : 'compact'} rejects current quotes that satisfy the old weak check`, async () => {
      expect(request.verify).toBeDefined()
      const weak = await scrape('empty', true)
      expect(weak.verification.status).toBe('passed')
      const strong = await scrape('empty')
      expect(strong.verification.status).toBe('failed')
      expect(strong.readiness.state).not.toBe('ready')
      expect(strong.evidenceRecord.verification?.status).toBe('failed')
      expect(strong.evidenceRecord.readiness).toEqual(strong.readiness)
      expect(strong.rawHtml).toBe(weak.rawHtml)
    })
    it(`${surface} ${debug ? 'full' : 'compact'} accepts a complete historical row including zero values`, async () => {
      const out = await scrape('valid')
      expect(out.verification.status).toBe('passed')
      expect(out.readiness.state).toBe('ready')
      expect(out.evidenceRecord.verification?.status).toBe('passed')
      expect(out.evidenceRecord.readiness).toEqual(out.readiness)
      expect(out.tables?.[0]?.rows).toEqual([headers, values])
      expect(out.markdown).toContain(values.join(' | '))
      expect(out.tables?.[0]?.csvSha256).toBe(createHash('sha256').update(out.tables![0]!.csv).digest('hex'))
      expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture('valid')).digest('hex'))
      expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
    })
    it(`${surface} ${debug ? 'full' : 'compact'} rejects incomplete, non-price, wrong-column, wrong-asset and out-of-scope rows`, async () => {
      for (const kind of ['missing', 'dividend', 'na', 'wrong-columns', 'wrong-asset', 'outside']) {
        const out = await scrape(kind)
        expect(out.verification.status, kind).toBe('failed')
        expect(out.readiness.state, kind).not.toBe('ready')
        expect(out.evidenceRecord.verification?.status).toBe('failed')
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
      }
    })
  }
})
