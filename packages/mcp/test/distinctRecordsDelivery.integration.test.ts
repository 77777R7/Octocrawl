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

const cards = [
  ['a', 'Glass vase', '12'], ['a', 'Glass vase', '13'], ['b', 'Clay bowl', '0'],
  [null, 'No identity', '9'], ['  ', 'Blank identity', '9'],
  ['c', 'Incomplete name', ''], ['c', '', '19'],
]
const html = `<html><head><title>Fixture catalog</title></head><body><main>${cards.map(([id, name, price]) => `<article class="card"${id === null ? '' : ` data-id="${id}"`}><span class="name">${name}</span><span class="price">${price}</span></article>`).join('')}</main></body></html>`
const list = { type: 'list' as const, itemSelector: '.card', fields: [{ name: 'id', attribute: 'data-id' }, { name: 'name', selector: '.name' }, { name: 'price', selector: '.price' }] }

describe('distinct complete records through HTTP, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let url: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-distinct-records-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(source.address() as AddressInfo).port}/catalog`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-distinct-records-test', version: '1.0.0' })
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
    async function scrape(verify?: VerifyContract, debug = false): Promise<CompactScrapeResponse> {
      const args = { url, formats: ['json', 'rawHtml', list] as const, debug, maxAge: 0, ...(verify === undefined ? {} : { verify }) }
      if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(url, args))) as CompactScrapeResponse
      const response = await mcp.callTool({ name: 'scrape', arguments: args })
      expect(response.isError).not.toBe(true)
      const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
      if (structured) expect(response.structuredContent).toEqual(out)
      else expect(response.structuredContent).toBeUndefined()
      return out
    }

    const contract = (min: number, uniqueBy?: string[]): VerifyContract => ({ checks: [{ type: 'recordFields', fields: ['name', 'price'], min, ...(uniqueBy === undefined ? {} : { uniqueBy }) }] })

    for (const debug of [false, true]) {
      it(`${surface} rejects inflated distinct counts on ${debug ? 'full' : 'compact'} delivery without deleting source records`, async () => {
        const out = await scrape(contract(3, ['id']), debug)
        expect(out.status).toBe('success')
        expect(out.verification).toMatchObject({ status: 'failed', verifier: 'verify/7', checks: [{ observedCount: 2, asked: 3 }] })
        expect(out.readiness.state).not.toBe('ready')
        expect(out.evidenceRecord.verification).toMatchObject({ status: 'failed', failed: ['recordFields'] })
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.list?.records).toHaveLength(7)
        expect(out.list?.records.map(record => record.source.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
        expect(out.list?.records[2]?.values.price).toBe('0')
        expect(out.list?.records.slice(3, 5).every(record => record.missing.includes('id'))).toBe(true)
        expect(out.json?.status).toBe('incomplete')
        expect(out.json?.data).toEqual({ records: out.list?.records })
        expect(out.json?.evidence.length).toBeGreaterThan(0)
        expect(out.rawHtml).toBe(html)
        expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(html).digest('hex'))
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
      })
    }

    it(`${surface} passes two complete identities and rejects an identity that was never extracted`, async () => {
      const passed = await scrape(contract(2, ['id']))
      expect(passed.verification).toMatchObject({ status: 'passed', checks: [{ observedCount: 2 }] })
      expect(passed.readiness).toMatchObject({ state: 'ready', basis: ['verified'] })
      expect(passed.evidenceRecord.verification?.status).toBe('passed')
      const missing = await scrape(contract(1, ['notCaptured']))
      expect(missing.verification).toMatchObject({ status: 'failed', checks: [{ observedCount: 0 }] })
      expect(missing.evidenceRecord.verification?.status).toBe('failed')
    })

    it(`${surface} keeps legacy record counting and absent contracts unchanged`, async () => {
      const legacy = await scrape(contract(5))
      expect(legacy.verification).toMatchObject({ status: 'passed', checks: [{ observedCount: 5 }] })
      const unverified = await scrape()
      expect(unverified.verification.status).toBe('not_requested')
      expect(unverified.evidenceRecord.verification?.status).toBe('not_requested')
      expect(unverified.list?.records).toEqual(legacy.list?.records)
    })
  }
})
