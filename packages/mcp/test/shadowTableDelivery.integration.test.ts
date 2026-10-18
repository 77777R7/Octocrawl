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
import { localNetworkPolicy, type CompactScrapeResponse } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

// Synthetic values exercise Nasdaq's supported table structure without claiming market facts.
const headers = ['Date', 'Close/Last', 'Volume', 'Open', 'High', 'Low']
const rows = Array.from({ length: 10 }, (_, index) => [`2026-01-${String(index + 1).padStart(2, '0')}`, `$${100 + index}.00`, index === 0 ? '0' : '1,000', '$99.00', '$110.00', '$90.00'])
const shadow = `<style>:host{display:block}[role=table]{display:table}[role=row]{display:table-row}[role=cell]{display:table-cell;padding:4px}</style><div role="table">${[headers, ...rows].map((row, index) => `<div role="row"${index === 0 ? ' part="table-header-row"' : ''}>${row.map(value => `<div role="cell">${value}</div>`).join('')}</div>`).join('')}</div>`

describe('shadow table delivery through HTTP, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let apiOrigin: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-shadow-delivery-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      const hidden = req.url === '/hidden' ? ' style="display:none"' : ''
      const mode = req.url === '/closed' ? 'closed' : 'open'
      const content = req.url === '/unheaded' ? shadow.replace(' part="table-header-row"', '') : shadow
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><body><main><h1>AAPL historical quotes (fixture)</h1><quote-table${hidden}></quote-table><table><tr><th></th></tr><tr><td></td></tr></table></main><script>document.querySelector('quote-table').attachShadow({mode:${JSON.stringify(mode)}}).innerHTML=${JSON.stringify(content)};</script></body></html>`)
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'browser_local') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    apiOrigin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
    sdk = new W2L({ baseUrl: apiOrigin, token: '' })
    mcp = new Client({ name: 'octocrawl-shadow-delivery-test', version: '1.0.0' })
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

  async function scrape(surface: 'API' | 'SDK' | 'MCP', path = '/', excluded = false): Promise<CompactScrapeResponse> {
    const args = { url: `${origin}${path}`, formats: ['markdown', 'tables', 'rawHtml'] as const, debug: false as const, maxAge: 0, timeout: 15_000,
      ...(excluded ? { excludeTags: ['quote-table'] } : {}),
      verify: { checks: [{ type: 'markdownMatches' as const, pattern: 'Apple|AAPL', flags: 'i' }, { type: 'markdownCountMin' as const, pattern: '\\d{1,3}(,\\d{3})*\\.\\d{2}', min: 5 }, { type: 'tableRowsMin' as const, tableIndex: 0, columns: [0, 1, 2, 3, 4, 5], min: 10 }] },
    }
    if (surface === 'API') {
      const response = await fetch(`${apiOrigin}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
      expect(response.status).toBe(200)
      return JSON.parse(await response.text()) as CompactScrapeResponse
    }
    if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(args.url, args))) as CompactScrapeResponse
    const response = await mcp.callTool({ name: 'scrape', arguments: args })
    expect(response.isError).not.toBe(true)
    const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
    if (structured) expect(response.structuredContent).toEqual(out)
    else expect(response.structuredContent).toBeUndefined()
    return out
  }

  for (const surface of ['API', 'SDK', 'MCP'] as const) {
    it(`${surface} delivers all ten rows, six columns and CSV from the same captured shadow source`, async () => {
      const out = await scrape(surface)
      expect(out.status).toBe('success')
      expect(out.verification.status).toBe('passed')
      expect(out.readiness.state).toBe('ready')
      expect(out.evidenceRecord.verification?.status).toBe('passed')
      expect(out.evidenceRecord.readiness).toEqual({ state: out.readiness.state, basis: out.readiness.basis })
      expect(out.tables?.[0]?.rows).toEqual([headers, ...rows])
      expect(out.tables?.[0]?.headerRows).toBe(1)
      expect(out.tables?.[0]?.columns).toBe(6)
      expect(out.tables?.[0]?.csvSha256).toBe(createHash('sha256').update(out.tables![0]!.csv).digest('hex'))
      for (const row of rows) expect(out.markdown).toContain(row.join(' | '))
      expect(out.rawHtml).toContain('<template shadowrootmode="open">')
      expect(out.rawHtml).not.toContain('data-w2l-display')
      expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(out.rawHtml!).digest('hex'))
      expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
    })
  }

  for (const surface of ['API', 'SDK', 'MCP'] as const) {
    it.each([['/closed', false], ['/hidden', false], ['/unheaded', false], ['/', true]] as const)(`${surface} keeps unsupported or excluded hosts unverified: %s, excluded=%s`, async (path, excluded) => {
      const out = await scrape(surface, path, excluded)
      expect(out.verification.status).toBe('failed')
      expect(out.evidenceRecord.verification?.status).toBe('failed')
      expect(out.readiness.state).not.toBe('ready')
      expect(out.evidenceRecord.readiness).toEqual({ state: out.readiness.state, basis: out.readiness.basis })
      expect(out.markdown ?? '').not.toContain('$100.00')
      expect(out.tables?.some(table => table.rows.some(row => row.includes('$100.00'))) ?? false).toBe(false)
    })
  }
})
