import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { localNetworkPolicy, type ScrapeRequest, type VerifyContract } from '@w2l/contracts'
import { buildChannels, ResilientHttpSubject } from '@w2l/bench'
import { createApiEngine, createApp } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

const list = { type: 'list' as const, itemSelector: '.product', fields: [
  { name: 'id', attribute: 'data-id' }, { name: 'name', selector: 'a' },
  { name: 'url', selector: 'a', attribute: 'href' }, { name: 'price', selector: '.price' },
] }
const html = '<!doctype html><html><head><title>Men shoes fixture</title></head><body><main><h1>Men shoes</h1>'
  + '<p>Footwear with product names, prices and links from the same card.</p>'
  + [['one', 'Trail Runner', '€79.95'], ['two', 'Walking Shoe', '€59.95'], ['three', 'City Sneaker', '€89.95']]
    .map(([id, name, price]) => '<article class="product" data-id="' + id + '"><a href="/product/' + id + '">' + name + '</a><span class="price">' + price + '</span></article>').join('')
  + '</main></body></html>'
const contract: VerifyContract = { checks: [
  { type: 'markdownIncludes', text: 'Trail Runner' },
  { type: 'recordFields', fields: ['name', 'price', 'url'], uniqueBy: ['id'], min: 3 },
  { type: 'field', path: 'snapshot.httpStatus', equals: 200 },
] }

// This exercises the real 10-second undici header cap. The first request for each unique URL deliberately receives
// no headers; the local browser's subsequent request receives the fixture. It is not a live Zalando recovery claim.
describe('bounded header-timeout fallback final API / SDK / MCP delivery', () => {
  let source: Server
  let api: ReturnType<typeof serve>
  let engine: ReturnType<typeof createApiEngine>
  let taskRoot: string
  let sourceUrl: string
  let apiUrl: string
  let sdk: W2L
  let client: Client
  let mcp: ReturnType<typeof createMcpServer>
  const hits = new Map<string, number>()
  beforeAll(async () => {
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /'); return }
      if (!req.url?.startsWith('/catalog?')) { res.writeHead(404).end(); return }
      const count = (hits.get(req.url) ?? 0) + 1
      hits.set(req.url, count)
      if (count === 1) return // Actual transport timeout: no headers sent, socket closed by undici.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
    })
    source.listen(0, '127.0.0.1'); await once(source, 'listening')
    sourceUrl = 'http://127.0.0.1:' + (source.address() as AddressInfo).port
    taskRoot = await mkdtemp(join(tmpdir(), 'octocrawl-header-fallback-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    // MCP supplies its own 120 s timeout. That leaves the local browser its time after the HTTP lane's 10 s header cap,
    // so the cap holds there too (ADR 0007, amendment of 2026-10-26) and every surface takes the fallback. In fast mode
    // nothing could take the timeout over, so MCP's deadline governs the wait: that case gives MCP 15 s. All wire
    // requests, Chromium, extraction and final serialization are real, through the production subjects. A separate
    // explicit-deadline control keeps a short MCP deadline's behavior.
    engine = createApiEngine({ taskRoot, networkPolicy: policy, channelsFor: mode => {
      const http = new ResilientHttpSubject(mode, policy)
      return buildChannels(mode, { networkPolicy: policy, localSubjects: { http: {
        fetch: (url, deadline, signal, execution, options = {}) => http.fetch(url, deadline, signal, {}, execution?.onRetryAfter, options, execution?.onRobotsOverride, execution?.cookieSession, execution?.onTrace),
        teardown: () => http.teardown(),
      } } })
    } })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }); await once(api, 'listening')
    apiUrl = 'http://127.0.0.1:' + (api.address() as AddressInfo).port
    sdk = new W2L({ baseUrl: apiUrl })
    client = new Client({ name: 'header-timeout-test', version: '1' })
    mcp = createMcpServer(sdk)
    const [left, right] = InMemoryTransport.createLinkedPair()
    await Promise.all([mcp.connect(right), client.connect(left)])
  })
  afterAll(async () => {
    await client?.close(); await mcp?.close()
    if (api) await new Promise<void>(resolve => api.close(() => resolve()))
    await engine?.close()
    if (source) { source.closeAllConnections(); await new Promise<void>(resolve => source.close(() => resolve())) }
    if (taskRoot) await rm(taskRoot, { recursive: true, force: true })
  })

  for (const surface of ['API', 'SDK', 'MCP'] as const) {
    for (const kind of ['passed', 'missing record', 'cropped field', 'no contract', 'fast mode'] as const) {
      it(surface + ' / ' + kind, async () => {
        const path = '/catalog?surface=' + surface + '&case=' + encodeURIComponent(kind)
        const checks: VerifyContract = kind === 'missing record' ? { checks: [{ type: 'recordFields', fields: ['name', 'price', 'url'], uniqueBy: ['id'], min: 4 }] }
          : kind === 'cropped field' ? { checks: [{ type: 'field', path: 'evidence.httpStatus', equals: 200 }] } : contract
        const request: ScrapeRequest = { url: sourceUrl + path, formats: ['markdown', 'json', 'rawHtml', list], includeTags: ['main'], maxAge: 0,
          debug: surface === 'API' && kind !== 'cropped field', ...(kind === 'fast mode' ? { fastMode: true, ...(surface === 'MCP' ? { timeout: 15_000 } : {}) } : {}),
          ...(kind === 'no contract' ? {} : { verify: checks }) }
        let out: any
        if (surface === 'API') {
          const response = await fetch(apiUrl + '/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
          expect(response.status).toBe(200); out = await response.json()
        } else if (surface === 'SDK') out = JSON.parse(JSON.stringify(await sdk.scrape(request.url, request)))
        else {
          const tool = await client.callTool({ name: 'scrape', arguments: { ...request } })
          expect(tool.isError).not.toBe(true)
          const text = tool.content.find(block => block.type === 'text')
          if (text?.type !== 'text') throw new Error('MCP text missing')
          out = JSON.parse(text.text)
          expect(tool.structuredContent).toEqual(out)
        }
        const timedOut = kind === 'fast mode'
        const passed = kind === 'passed'
        expect(out.channelsTried).toEqual(timedOut ? ['http'] : ['http', 'browser_local'])
        expect(hits.get(path)).toBe(timedOut ? 1 : 2)
        expect(out.status).toBe(timedOut ? 'failed' : 'success')
        expect(out.verification.status).toBe(kind === 'no contract' ? 'not_requested' : passed ? 'passed' : 'failed')
        expect(out.readiness.state === 'ready').toBe(passed || kind === 'no contract')
        expect(out.evidenceRecord.readiness).toEqual({ state: out.readiness.state, basis: out.readiness.basis })
        expect(out.evidenceRecord.verification.status).toBe(out.verification.status)
        expect(out.evidenceRecord.status).toBe(out.status)
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        expect(out.snapshot.httpStatus).toBe(timedOut ? null : 200)
        if (!timedOut) {
          expect(out.markdown).toContain('Trail Runner')
          expect(out.markdown).toContain('€79.95')
          expect(out.list.records.map((record: any) => record.values)).toEqual([
            { id: 'one', name: 'Trail Runner', price: '€79.95', url: sourceUrl + '/product/one' },
            { id: 'two', name: 'Walking Shoe', price: '€59.95', url: sourceUrl + '/product/two' },
            { id: 'three', name: 'City Sneaker', price: '€89.95', url: sourceUrl + '/product/three' },
          ])
          expect(out.json.data.records).toEqual(out.list.records)
          expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(out.rawHtml).digest('hex'))
        }
        if (request.debug) {
          expect(out.summary.attempts[0].result.trace).toContainEqual(expect.objectContaining({ event: 'request_failed', detail: expect.objectContaining({ code: 'UND_ERR_HEADERS_TIMEOUT' }) }))
          expect(out.summary.attempts[0].result.usage.deadlineExceeded).not.toBe(true)
          if (!timedOut) expect(out.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_headers_timeout_fallback', detail: expect.objectContaining({ maxMs: 30_000, remainingMs: expect.any(Number) }) }))
        }
      }, 75_000)
    }
  }

  it('honors an actual explicit MCP deadline without offering a browser', async () => {
    const path = '/catalog?surface=MCP-deadline'
    const tool = await client.callTool({ name: 'scrape', arguments: { url: sourceUrl + path, timeout: 1_000, maxAge: 0, verify: contract } })
    expect(tool.isError).not.toBe(true)
    const text = tool.content.find(block => block.type === 'text')
    if (text?.type !== 'text') throw new Error('MCP text missing')
    const out = JSON.parse(text.text)
    expect(tool.structuredContent).toEqual(out)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('timeout')
    expect(out.channelsTried).toEqual(['http'])
    expect(out.verification.status).toBe('failed')
    expect(out.evidenceRecord.verification.status).toBe('failed')
    expect(out.readiness.state).toBe('not_served')
    expect(out.evidenceRecord.readiness).toEqual({ state: out.readiness.state, basis: out.readiness.basis })
    expect(hits.get(path)).toBe(1)
  })
})
