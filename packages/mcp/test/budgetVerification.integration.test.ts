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
import { localNetworkPolicy, type VerifyContract, type ScrapeRequest } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, createApp } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'
import { RESULT_TEXT_MAX } from '../src/results.js'

const PREFIX = 'PREFIX_REQUIRED_FIELD'
const TAIL = 'REQUIRED_TAIL_FIELD'
const html = (long: boolean) => `<html><head><title>Final delivery fixture</title></head><body><article><h1>${PREFIX}</h1><p>${'A measured value retains its source, unit and observation date. '.repeat(long ? 1500 : 5)}</p><p>${TAIL}</p></article></body></html>`
const check = (text: string): VerifyContract => ({ checks: [{ type: 'markdownIncludes', text }] })
const cases = [
  { name: 'prefix', path: '/long', verify: check(PREFIX), api: 'passed', mcp: 'passed' },
  { name: 'tail', path: '/long', verify: check(TAIL), api: 'passed', mcp: 'failed' },
  { name: 'already failed', path: '/long', verify: check('MISSING_EVERYWHERE'), api: 'failed', mcp: 'failed' },
  { name: 'shorter length', path: '/long', verify: { checks: [{ type: 'field', path: 'markdown.length', max: RESULT_TEXT_MAX }] } as VerifyContract, api: 'failed', mcp: 'passed' },
  { name: 'metadata retained', path: '/long', verify: { checks: [{ type: 'field', path: 'snapshot.httpStatus', equals: 200 }] } as VerifyContract, api: 'passed', mcp: 'passed' },
  { name: 'truncation projected', path: '/long', verify: { checks: [{ type: 'field', path: 'truncated', equals: true }] } as VerifyContract, api: 'failed', mcp: 'passed' },
  { name: 'no contract', path: '/long', verify: undefined, api: 'not_requested', mcp: 'not_requested' },
  { name: 'small tail', path: '/small', verify: check(TAIL), api: 'passed', mcp: 'passed' },
  { name: 'raw body removed', path: '/long', verify: { checks: [{ type: 'field', path: 'rawHtml.length', min: 60_000 }] } as VerifyContract, api: 'passed', mcp: 'failed', extra: ['rawHtml' as const] },
  { name: 'cleaned body removed', path: '/long', verify: { checks: [{ type: 'field', path: 'html.length', min: 60_000 }] } as VerifyContract, api: 'passed', mcp: 'failed', extra: ['html' as const] },
  { name: 'raw without markdown', path: '/long', verify: { checks: [{ type: 'field', path: 'rawHtml.length', min: 60_000 }] } as VerifyContract, api: 'passed', mcp: 'failed', extra: ['rawHtml' as const], omitMarkdown: true },
  { name: 'all bodies cut in order', path: '/long', verify: { checks: [{ type: 'field', path: 'rawHtml.length', max: 0 }, { type: 'field', path: 'html.length', max: 0 }, { type: 'markdownIncludes', text: PREFIX }] } as VerifyContract, api: 'failed', mcp: 'passed', extra: ['rawHtml' as const, 'html' as const] },
]

describe('MCP budget verifies the final delivered projection', () => {
  let source: Server, api: ReturnType<typeof serve>, engine: ReturnType<typeof createApiEngine>
  let root: string, origin: string, apiUrl: string, sdk: W2L, client: Client, mcp: ReturnType<typeof createMcpServer>
  let reads = 0
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-budget-verification-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      reads++
      res.writeHead(200, { 'content-type': 'text/html' }).end(html(req.url !== '/small'))
    })
    source.listen(0, '127.0.0.1'); await once(source, 'listening')
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }); if (!api.listening) await once(api, 'listening')
    apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
    sdk = new W2L({ baseUrl: apiUrl })
    client = new Client({ name: 'budget-verification-test', version: '1' })
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

  for (const debug of [false, true]) it.each(cases)('$name debug=' + debug, async scenario => {
    const request: ScrapeRequest = { url: `${origin}${scenario.path}`, formats: [...(scenario.omitMarkdown ? [] : ['markdown' as const]), ...(scenario.extra ?? [])], fastMode: true, maxAge: 3_600_000, debug, ...(scenario.verify ? { verify: scenario.verify } : {}) }
    const response = await fetch(apiUrl + '/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
    expect(response.status).toBe(200)
    const wire = await response.json()
    const sdkResult = JSON.parse(JSON.stringify(await sdk.scrape(request.url, request)))
    const tool = await client.callTool({ name: 'scrape', arguments: { ...request } })
    expect(tool.isError).not.toBe(true)
    const block = tool.content.find(item => item.type === 'text')
    if (block?.type !== 'text') throw new Error('MCP text missing')
    expect(block.text.length).toBeLessThanOrEqual(RESULT_TEXT_MAX)
    const result = JSON.parse(block.text)
    expect(tool.structuredContent).toEqual(result)
    for (const [value, expected] of [[wire, scenario.api], [sdkResult, scenario.api], [result, scenario.mcp]] as const) {
      expect(value.status).toBe('success')
      expect(value.verification.status).toBe(expected)
      expect(value.evidenceRecord.verification.status).toBe(expected)
      expect(value.evidenceRecord.readiness).toEqual({ state: value.readiness.state, basis: value.readiness.basis })
      expect(value.evidenceRecord.outputSha256.markdown).toBe(typeof value.markdown === 'string' ? createHash('sha256').update(value.markdown).digest('hex') : null)
      expect(value.evidenceRecord.rawSha256).toBe(wire.snapshot.rawBodySha256)
    }
    expect(result.readiness.state === 'ready').toBe(scenario.mcp !== 'failed')
    if (scenario.name === 'tail') {
      expect(wire.markdown).toContain(TAIL)
      expect(result.markdown).not.toContain(TAIL)
      expect(result.readiness).toMatchObject({ state: 'not_extracted', basis: ['checks_failed', 'mcp_result_truncated'] })
      expect(result.evidenceRecord.verification.failed).toEqual(['markdownIncludes'])
    }
    if (scenario.path === '/long') expect(result.truncated).toBe(true)
    else { expect(result.markdown).toBe(wire.markdown); expect(result.truncated).not.toBe(true) }
  })

  it('rejects verdict self-reference before any source read', async () => {
    for (const path of ['verification.status', 'readiness.state', 'evidenceRecord.verification.status']) {
      const before = reads
      const request = { url: origin + '/self-reference', verify: { checks: [{ type: 'field' as const, path, present: true }] } }
      const response = await fetch(apiUrl + '/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
      expect(response.status).toBe(400)
      await expect(sdk.scrape(request.url, request)).rejects.toThrow()
      expect((await client.callTool({ name: 'scrape', arguments: request })).isError).toBe(true)
      expect(reads).toBe(before)
    }
  })
})
