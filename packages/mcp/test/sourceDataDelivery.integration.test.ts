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
import { ProviderSubject } from '../../bench/src/subjects/provider.js'
import { createMcpServer } from '../src/server.js'

const target = 'https://www.walmart.com/browse/electronics/laptops/123'
const prose = '<h1>Laptops</h1><p>' + 'Category information and help for shoppers. '.repeat(12) + '</p>'
function fixture(kind: string): string {
  const state = { page: '/browse/[...seo]', query: { seo: ['electronics', 'laptops', '123'] }, props: { pageProps: { initialData: {
    searchResult: { itemStacks: kind === 'products' ? [{ items: [{ name: 'Fixture laptop' }] }] : [] },
    pageMetadata: { pageContext: { browseContext: { errorResponse: { errors: [{ errorType: kind === 'recoverable' ? 'WARNING' : 'FATAL', statusCode: 'POLARIS_1001', statusMsg: 'INVALID_CAT_ID' }] } } } },
  } } } }
  return `<html><head><title>Laptops</title><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script></head><body><main>${kind === 'empty' ? '' : prose}${kind === 'products' ? '<a href="/ip/fixture/42">Fixture laptop $100</a>' : ''}</main></body></html>`
}

describe('publisher error delivery through captured-page extraction, HTTP API, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-source-error-'))
    source = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-fixture-user-agent': req.headers['user-agent']! }).end(fixture(new URL(req.url!, 'http://fixture').pathname.slice(1))))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    // Controlled transport replay through the production provider reader, with real loopback bytes and observed UA.
    // The target URL is retained for classification; there is no live Walmart access, browser or paid provider call.
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'
    const reader = new ProviderSubject({ id: 'browserbase', declaredUserAgent: ua, capabilities: ['headless_browser', 'datacenter_proxy'], honoursCallerUserAgent: false }, {
      fetch: async (url, _deadline, signal) => {
        const response = await fetch(`${origin}/${new URL(url).searchParams.get('fixture') ?? 'error'}`, { signal, headers: { 'user-agent': ua } })
        return { body: await response.text(), status: response.status, finalUrl: url, headers: { 'content-type': response.headers.get('content-type')! }, sentUserAgent: response.headers.get('x-fixture-user-agent') }
      },
    }, 'standard', null, async () => ({ text: 'User-agent: *\nAllow: /', status: 200, contentType: 'text/plain' }))
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy, localSubjects: { http: {
      fetch: (url, deadline, signal, execution, options) => reader.fetch(url, deadline, signal, execution?.onRetryAfter, options),
      teardown: () => reader.teardown(),
    } } }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-source-error-test', version: '1.0.0' })
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
    async function scrape(kind: string, verify?: VerifyContract, debug = false): Promise<CompactScrapeResponse> {
      const args = { url: `${target}?fixture=${kind}`, formats: ['markdown', 'rawHtml'] as const, debug, maxAge: 0, ...(verify === undefined ? {} : { verify }) }
      if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(args.url, args))) as CompactScrapeResponse
      const response = await mcp.callTool({ name: 'scrape', arguments: args })
      expect(response.isError).not.toBe(true)
      const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
      if (structured) expect(response.structuredContent).toEqual(out)
      else expect(response.structuredContent).toBeUndefined()
      return out
    }

    for (const debug of [false, true]) {
      it(`${surface} retains the source reason on ${debug ? 'full' : 'compact'} failed and contractless results, including empty content`, async () => {
        for (const kind of ['error', 'empty']) for (const verify of [undefined, { checks: [{ type: 'markdownIncludes' as const, text: 'Fixture laptop' }] }]) {
          const out = await scrape(kind, verify, debug)
          expect(out.status).toBe(kind === 'empty' ? 'failed' : 'success')
          expect(out.verification.status).toBe(verify === undefined ? 'not_requested' : 'failed')
          expect(out.warnings).toContainEqual(expect.objectContaining({ code: 'source_data_error', message: expect.stringContaining('INVALID_CAT_ID') }))
          expect(out.warning).toContain('Target product data was not served')
          expect(out.readiness).toMatchObject({ state: 'not_served', basis: ['source_data_error'] })
          expect(out.evidenceRecord.readiness).toEqual(out.readiness)
          expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
          expect(out.evidenceRecord.status).toBe(out.status)
          expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture(kind)).digest('hex'))
          if (kind !== 'empty') expect(out.rawHtml).toBe(fixture(kind))
          expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        }
      })
    }

    it(`${surface} preserves an explicitly passed contract without hiding the source warning`, async () => {
      const out = await scrape('error', { checks: [{ type: 'markdownIncludes', text: 'Laptops' }] })
      expect(out.verification.status).toBe('passed')
      expect(out.readiness).toMatchObject({ state: 'ready', basis: ['verified'] })
      expect(out.evidenceRecord.verification?.status).toBe('passed')
      expect(out.evidenceRecord.readiness).toEqual(out.readiness)
      expect(out.warnings?.some(warning => warning.code === 'source_data_error')).toBe(true)
    })

    it(`${surface} retains source attribution when final projection changes the contract verdict`, async () => {
      const verify: VerifyContract = { checks: [
        { type: 'markdownIncludes', text: 'Laptops' },
        { type: 'field', path: 'evidence.httpStatus', equals: 200 },
      ] }
      for (const debug of [false, true]) {
        const out = await scrape('error', verify, debug)
        expect(out.status).toBe('success')
        expect(out.verification.status).toBe(debug ? 'passed' : 'failed')
        expect(out.readiness).toMatchObject(debug ? { state: 'ready', basis: ['verified'] } : { state: 'not_served', basis: ['source_data_error'] })
        expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.warnings?.some(warning => warning.code === 'source_data_error')).toBe(true)
      }
    })

    it(`${surface} leaves populated and recoverable controls unclassified`, async () => {
      for (const kind of ['products', 'recoverable']) {
        const out = await scrape(kind)
        expect(out.status).toBe('success')
        expect(out.verification.status).toBe('not_requested')
        expect(out.readiness.state).toBe('ready')
        expect(out.warnings?.some(warning => warning.code === 'source_data_error') ?? false).toBe(false)
      }
    })
  }
})
