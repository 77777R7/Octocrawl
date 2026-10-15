import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { localNetworkPolicy, type CompactScrapeResponse, type VerifyContract } from '@w2l/contracts'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

describe('delivered scrape verification over HTTP, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean
  let reads = 0

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-delivery-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      reads++
      if (req.url === '/missing') { res.writeHead(404).end('Not found'); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<html><head><title>Tide report</title></head><body><main>
        <h1>Tide report</h1><p>${'The harbour office publishes tide height and visibility each morning. '.repeat(5)}</p>
        <a href="/harbour">Harbour observations</a>
        <article class="reading"><span class="place">North harbour</span><span class="height">2.5</span></article>
        <article class="reading"><span class="place">South harbour</span><span class="height">3.0</span></article>
        </main></body></html>`)
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    const app = createApp(engine)
    api = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-delivery-test', version: '1.0.0' })
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

  for (const surface of ['SDK', 'MCP'] as const) {
    async function scrape(options: Parameters<W2L['scrape']>[1], path = '/article'): Promise<CompactScrapeResponse> {
      const args = { url: `${origin}${path}`, debug: false as const, maxAge: 0, ...options }
      if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(args.url, { ...args, debug: false }))) as CompactScrapeResponse
      const result = await mcp.callTool({ name: 'scrape', arguments: args })
      expect(result.isError).not.toBe(true)
      const content = result.content as Array<{ type: string; text?: string }>
      const output = JSON.parse(content.find(block => block.type === 'text')!.text!) as CompactScrapeResponse
      if (structured) expect(result.structuredContent).toEqual(output)
      else expect(result.structuredContent).toBeUndefined()
      return output
    }

    for (const [path, status] of [['evidence.httpStatus', 'failed'], ['snapshot.httpStatus', 'passed']] as const) {
      it(`${surface} judges ${path} on the serialized public response`, async () => {
        const out = await scrape({ formats: ['markdown'], verify: { checks: [{ type: 'field', path, equals: 200 }] } })
        expect(out).not.toHaveProperty('evidence')
        expect(out.snapshot.httpStatus).toBe(200)
        expect(out.verification.status).toBe(status)
        expect(out.evidenceRecord.verification?.status).toBe(status)
        expect(out.readiness?.state === 'ready').toBe(status === 'passed')
      })
    }

    it(`${surface} rejects discarded links and passes links explicitly delivered`, async () => {
      const verify: VerifyContract = { checks: [{ type: 'listRecordsMin', path: 'links', min: 1 }] }
      const removed = await scrape({ formats: ['markdown'], verify })
      expect(removed).not.toHaveProperty('links')
      expect(removed.verification.status).toBe('failed')
      const delivered = await scrape({ formats: ['markdown', 'links'], verify })
      expect(delivered.links?.length).toBeGreaterThan(0)
      expect(delivered.verification.status).toBe('passed')
    })

    it(`${surface} preserves selected-list JSON, evidence and verdict`, async () => {
      const out = await scrape({
        formats: ['json', { type: 'list', itemSelector: '.reading', fields: [{ name: 'place', selector: '.place' }, { name: 'height', selector: '.height' }] }],
        verify: { checks: [{ type: 'listRecordsMin', path: 'list.records', min: 2 }, { type: 'field', path: 'json.data.records.0.values.place', equals: 'North harbour' }] },
      })
      expect(out.json?.status).toBe('complete')
      expect(out.list?.records).toHaveLength(2)
      expect(out.json?.data).toEqual({ records: out.list!.records })
      expect(out.json?.evidence).toHaveLength(4)
      expect(out.verification.status).toBe('passed')
      expect(out.evidenceRecord.verification?.status).toBe('passed')
    })

    it(`${surface} keeps a contractless page unverified`, async () => {
      const out = await scrape({ formats: ['markdown'] })
      expect(out.verification.status).toBe('not_requested')
      expect(out.evidenceRecord.verification?.status).toBe('not_requested')
    })

    it(`${surface} keeps an unread page failed rather than completing its task`, async () => {
      const out = await scrape({ formats: ['markdown'], verify: { checks: [{ type: 'field', path: 'snapshot.httpStatus', equals: 404 }] } }, '/missing')
      expect(out.status).toBe('failed')
      expect(out.verification).toMatchObject({ status: 'failed', reason: 'page_not_read' })
      expect(out.evidenceRecord.verification?.status).toBe('failed')
      expect(out.readiness?.state).not.toBe('ready')
    })

    it(`${surface} rejects self-dependent checks without requesting the source`, async () => {
      const before = reads
      for (const path of ['verification.status', 'readiness.state', 'evidenceRecord.verification.status']) {
        const options = { formats: ['markdown' as const], verify: { checks: [{ type: 'field' as const, path, present: true }] } }
        if (surface === 'SDK') await expect(scrape(options)).rejects.toThrow('check source data instead')
        else {
          await expect(mcp.callTool({ name: 'scrape', arguments: { url: `${origin}/article`, ...options } })).rejects.toThrow('check source data instead')
        }
      }
      expect(reads).toBe(before)
    })
  }
})
