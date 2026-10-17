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

    it(`${surface} checks own JSON keys and rejects prototype paths even on cache hits`, async () => {
      const options = { formats: ['json' as const, { type: 'list' as const, itemSelector: '.reading', fields: [{ name: 'constructor', selector: '.place' }, { name: 'height', selector: '.height' }] }], maxAge: 3_600_000 }
      const path = `/own-fields-${surface}`
      const first = await scrape({ ...options, verify: { checks: [
        { type: 'field', path: 'json.data.records.0.values.constructor', equals: 'North harbour' },
        { type: 'field', path: 'json.data.records.1.values.height', equals: '3.0' },
      ] } }, path)
      expect(first).toMatchObject({ verification: { status: 'passed' }, readiness: { state: 'ready' }, evidenceRecord: { verification: { status: 'passed' } } })
      expect(Object.hasOwn(first.list!.records[0]!.values, 'constructor')).toBe(true)
      const before = reads
      for (const field of ['json.data.records.0.values.__proto__.toString', 'json.data.constructor', 'json.data.records.constructor']) {
        for (const present of [true, false]) {
          const out = await scrape({ ...options, verify: { checks: [{ type: 'field', path: field, present }] } }, path)
          expect(out.metadata.cacheState).toBe('hit')
          expect(out.verification).toMatchObject({ status: present ? 'failed' : 'passed', checks: [{ data: true, passed: !present }] })
          expect(out.readiness.state === 'ready').toBe(!present)
          expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
          expect(out.evidenceRecord.readiness).toEqual(out.readiness)
          expect(out.json?.data).toEqual(first.json?.data)
          expect(out.evidenceRecord.rawSha256).toBe(first.evidenceRecord.rawSha256)
        }
      }
      expect(reads).toBe(before)
      const absent = await scrape({ formats: ['json', { type: 'list', itemSelector: '.reading', fields: [{ name: 'place', selector: '.place' }] }], verify: { checks: [{ type: 'field', path: 'json.data.records.0.values.constructor', present: true }] } })
      expect(Object.hasOwn(absent.list!.records[0]!.values, 'constructor')).toBe(false)
      expect(absent).toMatchObject({ verification: { status: 'failed' }, evidenceRecord: { verification: { status: 'failed' } } })
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

    it(`${surface} judges cache-hit usage after its final projection`, async () => {
      const options = { formats: ['markdown' as const], maxAge: 3_600_000 }
      const path = `/cached-${surface}`
      const first = await scrape(options, path)
      expect(first.usage.requestCount).toBeGreaterThan(0)
      const before = reads
      const hit = await scrape({ ...options, verify: { checks: [
        { type: 'field', path: 'usage.requestCount', equals: 0 },
        { type: 'field', path: 'usage.bytesDecompressed', equals: 0 },
        { type: 'field', path: 'usage.timings.requestMs', present: false },
        { type: 'markdownIncludes', text: 'Tide report' },
      ] } }, path)
      expect(hit.metadata.cacheState).toBe('hit')
      expect(hit.usage).toMatchObject({ requestCount: 0, bytesDecompressed: 0 })
      expect(hit.verification.status).toBe('passed')
      expect(hit.readiness?.state).toBe('ready')
      expect(hit.evidenceRecord.verification?.status).toBe('passed')
      expect(hit.evidenceRecord.rawSha256).toBe(first.evidenceRecord.rawSha256)
      expect(hit.evidenceRecord.fetchedAt).toBe(first.evidenceRecord.fetchedAt)

      const failed = await scrape({ ...options, verify: { checks: [
        { type: 'field', path: 'usage.requestCount', min: 1 },
        { type: 'field', path: 'usage.bytesDecompressed', min: 1 },
        { type: 'field', path: 'usage.timings.requestMs', present: true },
      ] } }, path)
      expect(failed.verification.status).toBe('failed')
      expect(failed.readiness?.state).not.toBe('ready')
      expect(failed.evidenceRecord.verification?.status).toBe('failed')
      expect(reads).toBe(before)
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
          const result = await mcp.callTool({ name: 'scrape', arguments: { url: `${origin}/article`, ...options } })
          expect(result.isError).toBe(true)
          expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('check source data instead') }])
          expect(result._meta).toEqual({ 'octocrawl/error': { code: 'invalid_request', status: 400 } })
          expect(result.structuredContent).toBeUndefined()
        }
      }
      expect(reads).toBe(before)
    })
  }
})
