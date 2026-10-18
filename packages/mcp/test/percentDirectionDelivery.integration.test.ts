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
import { localNetworkPolicy, type CompactScrapeResponse, type VerifyContract } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

const headers = ['Asset', 'Change']
const rows = [['Down', '-1.3%'], ['Up', '2.5%'], ['Zero', '0.0%'], ['Rounded zero', '0.0%'], ['Literal', '-3.0%'], ['Decorative', '4.0%']]
const values = [
  ['-1.25', '<i class="fa-caret-down"></i>1.3%'],
  ['2.48', '<i class="fa-caret-up"></i>2.5%'],
  ['0', '<i class="fa-caret-down"></i>0.0%'],
  ['-0.0002', '<i class="fa-caret-down"></i>0.0%'],
  ['-3', '<i class="fa-caret-down"></i>-3.0%'],
  ['-4', '<i class="arrow-down"></i>4.0%'],
]
const html = `<html><head><title>Percent changes fixture</title></head><body><main><h1>Percent changes fixture</h1><table><tr>${headers.map(x => `<th>${x}</th>`).join('')}</tr>${rows.map((row, i) => `<tr><td>${row[0]}</td><td data-percent-change-sort="true" data-sort="${values[i]![0]}"><span data-percent-change-target="percent">${values[i]![1]}</span></td></tr>`).join('')}</table></main></body></html>`

describe('percent direction through localhost HTTP, engine, API, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-percent-'))
    source = createServer((req, res) => req.url === '/robots.txt' ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': 'text/html' }).end(html))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-percent-test', version: '1.0.0' })
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
  async function scrape(surface: 'SDK' | 'MCP', debug: boolean, verify?: VerifyContract): Promise<CompactScrapeResponse> {
    const args = { url: origin, formats: ['markdown', 'tables', 'rawHtml'] as const, includeTags: ['main'], fastMode: true, debug, maxAge: 0, ...(verify === undefined ? {} : { verify }) }
    if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(origin, args))) as CompactScrapeResponse
    const response = await mcp.callTool({ name: 'scrape', arguments: args })
    expect(response.isError).not.toBe(true)
    const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
    if (structured) expect(response.structuredContent).toEqual(out)
    else expect(response.structuredContent).toBeUndefined()
    return out
  }
  for (const surface of ['SDK', 'MCP'] as const) for (const debug of [false, true]) {
    it(`${surface} ${debug ? 'full' : 'compact'} delivers the same signed rows, CSV and evidence with and without checks`, async () => {
      const checks: VerifyContract['checks'] = [{ type: 'markdownIncludes', text: '| Down | -1.3% |' }, { type: 'field', path: 'tables.0.rows.1.1', equals: '-1.3%' }]
      for (const verify of [undefined, { checks }]) {
        const out = await scrape(surface, debug, verify)
        expect(out.status).toBe('success')
        expect(out.verification.status).toBe(verify === undefined ? 'not_requested' : 'passed')
        expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.readiness.state).toBe('ready')
        expect(out.tables?.[0]?.rows).toEqual([headers, ...rows])
        for (const row of rows) expect(out.markdown).toContain(`| ${row.join(' | ')} |`)
        expect(out.tables?.[0]?.csv).toContain('Down,-1.3%')
        expect(out.tables?.[0]?.csvSha256).toBe(createHash('sha256').update(out.tables![0]!.csv).digest('hex'))
        expect(out.rawHtml).toBe(html)
        expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(html).digest('hex'))
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        expect(out.evidenceRecord.extractor.version).toBe('extract-tf/36')
      }
    })
    it(`${surface} ${debug ? 'full' : 'compact'} rejects a contract expecting the dropped sign`, async () => {
      const out = await scrape(surface, debug, { checks: [{ type: 'field', path: 'tables.0.rows.1.1', equals: '1.3%' }] })
      expect(out.verification.status).toBe('failed')
      expect(out.readiness.state).not.toBe('ready')
      expect(out.evidenceRecord.verification?.status).toBe('failed')
      expect(out.evidenceRecord.readiness).toEqual(out.readiness)
      expect(out.tables?.[0]?.rows[1]).toEqual(rows[0])
    })
  }
})
