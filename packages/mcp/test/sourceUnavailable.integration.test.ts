import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { localNetworkPolicy, type ScrapeRequest, type VerifyContract } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, createApp } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

// Minimized structure of L07's retained HTTP-200 maintenance page, not its raw capture.
const TITLE = "Statistics Canada - We're sorry! The website is currently unavailable"
const NOTICE = "<p>We're sorry! The website is currently unavailable. We apologize for any inconvenience.</p><p>Please visit the Census homepage for a comprehensive collection of census publications.</p><p lang=\"fr\">Nous sommes désolés! Le site Web n'est pas disponible pour le moment. Nous nous excusons pour tout inconvénient.</p>"
const PROSE = 'The statistics office publishes annual population observations with the year, unit and source beside every table. '.repeat(5)
const page = (body: string, title = TITLE) => `<!doctype html><html><head><title>${title}</title></head><body><main>${body}</main></body></html>`
const PAGES: Record<string, string> = {
  notice: page(NOTICE),
  normal: page(`<article><h1>Population report</h1><p>${PROSE}</p></article>`, 'Population report'),
  hidden: page(`<div hidden>${NOTICE}</div><article><h1>Population report</h1><p>${PROSE}</p></article>`),
  quoted: page(`<article><h1>Outage history</h1><blockquote>${NOTICE}</blockquote><p>${PROSE}</p></article>`),
  table: page(`${NOTICE}<table><tr><th>Year</th><th>Population (persons)</th></tr><tr><td>2025</td><td>123456</td></tr></table>`),
  metadata: page(`<article><h1>Population report</h1><p>${PROSE}</p></article>`),
}

const list = { type: 'list' as const, itemSelector: '.card', fields: [{ name: 'id', attribute: 'data-id' }, { name: 'name', selector: 'b' }, { name: 'price', selector: 'i' }] }
const cards = [['a', 'First', '12'], ['a', 'First', '13'], ['b', 'Second', '0'], ['', 'Missing identity', '9']].map(([id, name, price]) => `<article class="card" data-id="${id}"><b>${name}</b><i>${price}</i></article>`).join('')
PAGES.catalog = page(`${NOTICE}<table><tr><th>Year</th><th>Value</th></tr><tr><td>2025</td><td>123456</td></tr></table>${cards}`)

const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }

describe('source unavailable final API / SDK / MCP delivery', () => {
  let source: Server
  let api: ReturnType<typeof serve>
  let engine: ReturnType<typeof createApiEngine>
  let root: string
  let sourceUrl: string
  let apiUrl: string
  let sdk: W2L
  let client: Client
  let mcp: ReturnType<typeof createMcpServer>
  beforeAll(async () => {
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /'); return }
      const html = PAGES[(req.url ?? '').slice(1)]
      res.writeHead(html === undefined ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
    })
    source.listen(0, '127.0.0.1'); await once(source, 'listening')
    sourceUrl = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    root = await mkdtemp(join(tmpdir(), 'octocrawl-source-unavailable-'))
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('HTTP-only fixture must not reach browser') } } } }) })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }); await once(api, 'listening')
    apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
    sdk = new W2L({ baseUrl: apiUrl })
    client = new Client({ name: 'source-unavailable-test', version: '1' })
    mcp = createMcpServer(sdk)
    const [left, right] = InMemoryTransport.createLinkedPair()
    await Promise.all([mcp.connect(right), client.connect(left)])
  })
  afterAll(async () => {
    await client?.close(); await mcp?.close()
    if (api) await new Promise<void>(resolve => api.close(() => resolve()))
    await engine?.close()
    if (source) await new Promise<void>(resolve => source.close(() => resolve()))
    if (root) await rm(root, { recursive: true, force: true })
  })

  async function deliver(request: ScrapeRequest) {
    const response = await fetch(`${apiUrl}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
    expect(response.status).toBe(200)
    const wire = await response.json()
    const sdkResult = JSON.parse(JSON.stringify(await sdk.scrape(request.url, request)))
    const tool = await client.callTool({ name: 'scrape', arguments: { ...request } })
    expect(tool.isError).not.toBe(true)
    const text = tool.content.find(item => item.type === 'text')
    if (text?.type !== 'text') throw new Error('MCP text absent')
    const textResult = JSON.parse(text.text)
    expect(tool.structuredContent).toEqual(textResult)
    return [wire, sdkResult, textResult]
  }

  const cases = Object.keys(PAGES).flatMap(name => [false, true].map(debug => ({ name, debug, configured: 'not_requested' })))
    .concat(['passed', 'failed'].flatMap(configured => [false, true].map(debug => ({ name: 'notice', debug, configured }))))
  it.each(cases)('$name debug=$debug configured=$configured preserves source classification through all three clients', async ({ name, debug, configured }) => {
    const request = { url: `${sourceUrl}/${name}`, formats: ['markdown' as const], debug, fastMode: true, maxAge: 0, ...(configured === 'not_requested' ? {} : { verify: { checks: [{ type: 'markdownIncludes' as const, text: configured === 'passed' ? 'website is currently unavailable' : 'All-items' }] } }) }
    for (const result of await deliver(request)) {
      expect(result.status).toBe('success') // Fetch succeeded; classification is not recovered target data.
      expect(result.verification.status).toBe(configured)
      if (configured === 'not_requested') expect(result.verification).toEqual({ status: 'not_requested' })
      const readiness = configured === 'passed' ? { state: 'ready', basis: ['verified'] } : name === 'notice' ? { state: 'not_served', basis: ['source_unavailable'] } : { state: 'ready', basis: [] }
      expect(result.readiness).toMatchObject(readiness)
      expect(result.evidenceRecord.readiness).toEqual(readiness)
      expect(result.evidenceRecord.verification.status).toBe(configured)
      expect(result.evidenceRecord.httpStatus).toBe(200)
      expect(result.evidenceRecord.rawSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(result.markdown).toBeTruthy()
    }
  })

  it.each([false, true])('composes source diagnosis, cached table/list JSON and final projection: debug=%s', async debug => {
    const request = { url: `${sourceUrl}/catalog`, formats: ['markdown' as const, 'tables' as const, 'json' as const, list], includeTags: ['main'], fastMode: true, debug, maxAge: 3_600_000 }
    const seed = await deliver(request)
    for (const [min, privateField] of [[2, false], [3, false], [2, true]] as const) {
      const verify: VerifyContract = { checks: [
        { type: 'tableRowsMin', tableIndex: 0, columns: [0, 1], min: 1 },
        { type: 'recordFields', fields: ['name', 'price'], uniqueBy: ['id'], min },
        { type: 'field', path: 'json.data.records.2.values.price', equals: '0' },
        { type: 'field', path: 'snapshot.httpStatus', equals: 200 },
        { type: 'field', path: 'usage.requestCount', equals: 0 },
        ...(privateField ? [{ type: 'field' as const, path: 'evidence.httpStatus', equals: 200 }] : []),
      ] }
      for (const [index, result] of (await deliver({ ...request, verify })).entries()) {
        const passed = min === 2 && (!privateField || debug)
        expect(result.metadata.cacheState).toBe('hit')
        expect(result.verification).toMatchObject({ status: passed ? 'passed' : 'failed', verifier: 'verify/9', checks: [{ passed: true }, { observedCount: 2, asked: min }, { passed: true }, { passed: true }, { passed: true }, ...(privateField ? [{ passed: debug }] : [])] })
        expect(result.readiness.state === 'ready').toBe(passed)
        expect(result.readiness.basis).not.toContain('source_unavailable') // The visible table contradicts the stale outage notice.
        expect(result.evidenceRecord.readiness).toEqual(result.readiness)
        expect(result.evidenceRecord.verification.status).toBe(result.verification.status)
        expect(result.tables[0].rows).toEqual([['Year', 'Value'], ['2025', '123456']])
        expect(result.list.records).toHaveLength(4)
        expect(result.list.records[3].missing).toContain('id')
        expect(result.json.data).toEqual({ records: result.list.records })
        expect(result.snapshot.rawBodySha256).toBe(seed[index].snapshot.rawBodySha256)
        expect(result.evidenceRecord.rawSha256).toBe(result.snapshot.rawBodySha256)
      }
    }
  })

})
