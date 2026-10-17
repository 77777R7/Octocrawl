import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { localNetworkPolicy, type CompactScrapeResponse, type ScrapeRequest, type ScrapeResponse } from '@w2l/contracts'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

type Output = (ScrapeResponse | CompactScrapeResponse) & Required<Pick<ScrapeResponse, 'verification' | 'snapshot'>>
type Endpoint = { api: Server; engine: ApiEngine; sdk: W2L; mcp: Client; baseUrl: string; structured: boolean }

describe('scrape record write failures preserve final HTTP/SDK/MCP verification', () => {
  let root: string
  let source: Server
  let origin: string
  let normal: Endpoint
  let broken: Endpoint
  let traceLength: number
  let reads = 0
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const dataCheck = { type: 'markdownIncludes' as const, text: 'tide height 3.2 metres' }
  const formats: ScrapeRequest['formats'] = ['markdown', 'json', { type: 'list', itemSelector: '.reading', fields: [
    { name: 'place', selector: '.place' }, { name: 'height', selector: '.height' },
  ] }]

  async function endpoint(path: string): Promise<Endpoint> {
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const engine = createApiEngine({ taskRoot: path, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    const api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    const baseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
    const sdk = new W2L({ baseUrl })
    const mcp = new Client({ name: 'octocrawl-record-write-test', version: '1.0.0' })
    const [client, server] = InMemoryTransport.createLinkedPair()
    await Promise.all([createMcpServer(sdk).connect(server), mcp.connect(client)])
    const structured = (await mcp.listTools()).tools.some(tool => tool.name === 'scrape' && tool.outputSchema !== undefined)
    return { api, engine, sdk, mcp, baseUrl, structured }
  }

  async function scrape(target: Endpoint, surface: 'API' | 'SDK' | 'MCP', options: Partial<ScrapeRequest> = {}, path = '/ledger'): Promise<Output> {
    const args: ScrapeRequest = { url: `${origin}${path}`, formats, includeTags: ['main'], fastMode: true, maxAge: 0, storeInCache: false, debug: true, ...options }
    if (surface === 'API') {
      const response = await fetch(`${target.baseUrl}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
      expect(response.status).toBe(200)
      return await response.json() as Output
    }
    if (surface === 'SDK') return JSON.parse(JSON.stringify(await target.sdk.scrape(args.url, args))) as Output
    const wire = await target.mcp.callTool({ name: 'scrape', arguments: { ...args } })
    expect(wire.isError).not.toBe(true)
    const output = JSON.parse((wire.content as Array<{ type: string; text?: string }>).find(block => block.type === 'text')!.text!) as Output
    if (target.structured) expect(wire.structuredContent).toEqual(output)
    else expect(wire.structuredContent).toBeUndefined()
    return output
  }

  function verdict(out: Output, status: 'passed' | 'failed' | 'not_requested') {
    expect(out.verification.status).toBe(status)
    const requested = out.verification.status === 'not_requested' ? null : out.verification
    expect(out.evidenceRecord?.verification).toMatchObject({ status, verifier: requested?.verifier ?? null, contractSha256: requested?.contractSha256 ?? null })
    expect(out.evidenceRecord?.readiness?.state).toBe(out.readiness.state)
    expect(out.evidenceRecord?.readiness?.basis).toEqual(out.readiness.basis)
    if (status === 'failed') expect(out.readiness.state).not.toBe('ready')
    else expect(out.readiness.state).toBe('ready')
  }

  function diagnostic(out: Output) {
    expect('trace' in out).toBe(true)
    if (!('trace' in out)) throw new Error('expected full response')
    expect(out.trace.filter(event => event.event === 'scrape_record_unwritten')).toHaveLength(1)
    expect(out.trace.at(-1)).toMatchObject({ event: 'scrape_record_unwritten', lane: out.lane, detail: { scrapeId: out.metadata.scrapeId } })
    expect(errors.mock.calls.some(([line]) => {
      const event = JSON.parse(String(line)) as { event?: string; scrapeId?: string }
      return event.event === 'scrape_record_unwritten' && event.scrapeId === out.metadata.scrapeId
    })).toBe(true)
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-record-write-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      reads++
      if (req.url === '/missing') { res.writeHead(404).end('Not found'); return }
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><title>Harbour ledger</title><main><h1>Harbour ledger</h1>
        <p>${'The office records tide height 3.2 metres, west winds and pressure 1012 hectopascals in the public ledger. '.repeat(10)}</p>
        <article class="reading"><span class="place">North harbour</span><span class="height">3.2</span></article>
        <article class="reading"><span class="place">South harbour</span><span class="height">2.5</span></article></main></html>`)
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    await mkdir(join(root, 'broken'))
    // A real filesystem error, independent of OS permissions and without mocking persistence.
    await writeFile(join(root, 'broken', 'scrapes'), 'This fixture prevents creation of the record directory.')
    normal = await endpoint(join(root, 'normal'))
    broken = await endpoint(join(root, 'broken'))
    const baseline = await scrape(normal, 'API')
    if (!('trace' in baseline)) throw new Error('expected full baseline')
    traceLength = baseline.trace.length
    expect(traceLength).toBeGreaterThan(0)
  })

  afterAll(async () => {
    for (const target of [normal, broken].filter(Boolean)) {
      await target.mcp.close()
      await target.engine.close()
      await new Promise<void>(resolve => target.api.close(() => resolve()))
    }
    if (source) await new Promise<void>(resolve => source.close(() => resolve()))
    if (root) await rm(root, { recursive: true, force: true })
    errors.mockRestore()
  })

  for (const surface of ['API', 'SDK', 'MCP'] as const) {
    for (const writeFails of [false, true]) {
      it(`${surface} checks the final trace length when persistence ${writeFails ? 'fails' : 'succeeds'}`, async () => {
        const out = await scrape(writeFails ? broken : normal, surface, { verify: { checks: [dataCheck, { type: 'field', path: 'trace.length', equals: traceLength }] } })
        expect(out.status).toBe('success')
        if (!('trace' in out)) throw new Error('expected full response')
        expect(out.trace).toHaveLength(traceLength + (writeFails ? 1 : 0))
        verdict(out, writeFails ? 'failed' : 'passed')
        if (out.verification.status === 'not_requested') throw new Error('expected a configured contract')
        expect(out.verification.checks.map(check => check.passed)).toEqual([true, !writeFails])
        expect(out.json?.data).toEqual({ records: out.list?.records })
        expect(out.list?.records).toHaveLength(2)
        expect(out.evidenceRecord?.outputSha256.markdown).toBe(createHash('sha256').update(out.markdown!).digest('hex'))
        expect(out.evidenceRecord?.rawSha256).toBe(out.snapshot.rawBodySha256)
        if (writeFails) {
          diagnostic(out)
          expect(out.evidenceRecord?.verification?.failed).toHaveLength(1)
        } else {
          expect(out.trace.some(event => event.event === 'scrape_record_unwritten')).toBe(false)
          expect(await normal.sdk.getScrape(out.scrapeId)).toMatchObject({ scrapeId: out.scrapeId, status: out.status, snapshot: out.snapshot })
        }
      })
    }

    it(`${surface} passes a check on the delivered diagnostic, without another source read`, async () => {
      const before = reads
      const out = await scrape(broken, surface, { verify: { checks: [dataCheck,
        { type: 'field', path: 'trace.length', equals: traceLength + 1 },
        { type: 'field', path: `trace.${traceLength}.event`, equals: 'scrape_record_unwritten' },
      ] } })
      verdict(out, 'passed')
      diagnostic(out)
      expect(reads).toBe(before + 1)
    })

    for (const checkTrace of [false, true]) {
      it(`${surface} judges ${checkTrace ? 'hidden trace' : 'delivered data'} on compact write failures`, async () => {
        const out = await scrape(broken, surface, { debug: false, verify: { checks: [dataCheck, checkTrace
          ? { type: 'field', path: 'trace.length', equals: traceLength + 1 }
          : { type: 'field', path: 'snapshot.httpStatus', equals: 200 },
        ] } })
        expect(out).not.toHaveProperty('trace')
        expect(out.snapshot.httpStatus).toBe(200)
        verdict(out, checkTrace ? 'failed' : 'passed')
      })
    }

    it(`${surface} keeps a contractless write failure unverified`, async () => {
      const out = await scrape(broken, surface)
      verdict(out, 'not_requested')
      diagnostic(out)
    })

    it(`${surface} keeps a failed fetch failed after the persistence diagnostic`, async () => {
      const out = await scrape(broken, surface, { verify: { checks: [dataCheck] } }, '/missing')
      expect(out.status).toBe('failed')
      verdict(out, 'failed')
      if (out.verification.status === 'not_requested') throw new Error('expected a configured contract')
      expect(out.verification.reason).toBe('page_not_read')
      diagnostic(out)
    })

    it(`${surface} retains zero cache-hit usage when rechecking a full write failure`, async () => {
      const options = { maxAge: 3_600_000, storeInCache: true }
      const path = `/cache-${surface}`
      await scrape(broken, surface, options, path)
      const before = reads
      const baseline = await scrape(broken, surface, options, path)
      if (!('trace' in baseline)) throw new Error('expected full cache baseline')
      const out = await scrape(broken, surface, { ...options, verify: { checks: [dataCheck,
        { type: 'field', path: 'trace.length', equals: baseline.trace.length },
        { type: 'field', path: 'usage.requestCount', equals: 0 },
        { type: 'field', path: 'usage.bytesDecompressed', equals: 0 },
      ] } }, path)
      expect(out.metadata.cacheState).toBe('hit')
      verdict(out, 'passed')
      diagnostic(out)
      expect(out.evidenceRecord?.rawSha256).toBe(baseline.evidenceRecord?.rawSha256)
      expect(reads).toBe(before)
    })
  }
})
