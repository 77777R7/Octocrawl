import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { localNetworkPolicy, type CompactScrapeResponse, type VerifyContract } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { serveMcpStdio } from '../src/stdio.js'

function fixture(kind: string): string {
  const chapters = [1, 2, 3].map(n => `<section id="chapter-${n}"><h2>${n}. Requirement ${n}</h2>${Array.from({ length: 3 }, (_, i) => `<p>Requirement ${n}, paragraph ${i + 1}: implementations MUST preserve the declared unit and the observation date when returning a measured value.</p>`).join('')}</section>`).join('')
  const html = `<html><head><title>Measurement standard</title></head><body><div><h1>Measurement standard</h1><p>Recommendation <time>12 December 2024</time></p><dl><dt>Authors</dt><dd>A. Writer; B. Editor</dd></dl></div>${chapters}<section><h2>Appendix A. Grammar</h2><div><pre>${'measurement = value unit date; rule\n'.repeat(25)}</pre></div></section></body></html>`
  return kind === 'missing-date' ? html.replace('12 December 2024', '') : kind === 'missing-requirement' ? html.replace('Requirement 3, paragraph 3:', 'Missing requirement:') : html
}
const required = ['Measurement standard', 'Recommendation', '12 December 2024', 'A. Writer; B. Editor', 'Requirement 1, paragraph 1', 'Requirement 3, paragraph 3']
const contract: VerifyContract = { checks: required.map(text => ({ type: 'markdownIncludes', text })) }

describe('standard chapters through localhost HTTP, engine, API, SDK and modern MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let baseUrl: string
  let mcp: Client
  let mcpServer: ReturnType<typeof serveMcpStdio>
  let structured: boolean
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-standard-'))
    source = createServer((req, res) => req.url === '/robots.txt' ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': 'text/html' }).end(fixture(new URL(req.url!, 'http://fixture').pathname.slice(1))))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
    sdk = new W2L({ baseUrl })
    mcp = new Client({ name: 'octocrawl-standard-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    mcpServer = serveMcpStdio(sdk, serverSide)
    await mcp.connect(clientSide)
    expect(mcp.getNegotiatedProtocolVersion()).toBe('2026-07-28')
    structured = (await mcp.listTools()).tools.some(tool => tool.name === 'scrape' && tool.outputSchema !== undefined)
  })
  afterAll(async () => {
    await mcp?.close()
    await mcpServer?.close()
    await engine?.close()
    await Promise.all([api, source].filter(Boolean).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
    if (root) await rm(root, { recursive: true, force: true })
  })
  async function scrape(surface: 'API' | 'SDK' | 'MCP', debug: boolean, kind: string, verify?: VerifyContract): Promise<CompactScrapeResponse> {
    const url = `${origin}/${kind}`
    const args = { url, formats: ['markdown', 'tables', 'links', 'rawHtml'] as const, fastMode: true, debug, maxAge: 0, storeInCache: false, ...(verify === undefined ? {} : { verify }) }
    if (surface === 'API') {
      const response = await fetch(`${baseUrl}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
      expect(response.status).toBe(200)
      return await response.json() as CompactScrapeResponse
    }
    if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(url, args))) as CompactScrapeResponse
    const response = await mcp.callTool({ name: 'scrape', arguments: args })
    expect(response.isError).not.toBe(true)
    const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
    if (structured) expect(response.structuredContent).toEqual(out)
    else expect(response.structuredContent).toBeUndefined()
    return out
  }
  for (const surface of ['API', 'SDK', 'MCP'] as const) for (const debug of [false, true]) {
    it(`${surface} ${debug ? 'full' : 'compact'} delivers header and requirements and rejects missing fields`, async () => {
      for (const [kind, verify] of [['valid', contract], ['missing-date', contract], ['missing-requirement', contract], ['valid', undefined]] as const) {
        const out = await scrape(surface, debug, kind, verify)
        const expected = verify === undefined ? 'not_requested' : kind === 'valid' ? 'passed' : 'failed'
        expect(out.status).toBe('success')
        expect(out.verification.status).toBe(expected)
        expect(out.evidenceRecord.verification?.status).toBe(expected)
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.readiness.state === 'ready').toBe(expected !== 'failed')
        if (kind === 'valid') for (const value of required) expect(out.markdown).toContain(value)
        if (kind === 'missing-date') expect(out.markdown).not.toContain('12 December 2024')
        if (kind === 'missing-requirement') expect(out.markdown).not.toContain('Requirement 3, paragraph 3')
        expect(out.rawHtml).toBe(fixture(kind))
        expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture(kind)).digest('hex'))
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        expect(out.evidenceRecord.outputSha256.markdown).toBe(createHash('sha256').update(out.markdown!).digest('hex'))
        expect(out.evidenceRecord.extractor.version).toBe('extract-tf/32')
      }
    })
  }
})
