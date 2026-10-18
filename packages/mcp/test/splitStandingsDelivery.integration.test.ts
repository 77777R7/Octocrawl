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
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { localNetworkPolicy, type CompactScrapeResponse, type VerifyContract } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'
import { STANDINGS_TEAMS, splitStandingsFixture } from '@w2l/fixtures'
import { EXTRACTOR_VERSION } from '@w2l/extract-tf'

const fixture = splitStandingsFixture

describe('split standings through localhost HTTP, engine, API, SDK and modern MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let baseUrl: string
  let mcp: Client
  let mcpServer: ReturnType<typeof serveStdio>
  let hosted: Client
  let hostedServer: ReturnType<typeof serveStdio>
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-split-standings-'))
    source = createServer((req, res) => req.url === '/robots.txt' ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': 'text/html' }).end(fixture(new URL(req.url!, 'http://fixture').pathname.slice(1))))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0, egressProxy: null }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
    sdk = new W2L({ baseUrl })
    mcp = new Client({ name: 'octocrawl-split-standings-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    mcpServer = serveStdio(() => createMcpServer(sdk), { transport: serverSide })
    await mcp.connect(clientSide)
    hosted = new Client({ name: 'collection-minimal-test', version: '1' }, { versionNegotiation: { mode: 'auto' } })
    const [left, right] = InMemoryTransport.createLinkedPair()
    hostedServer = serveStdio(() => createMcpServer(sdk, { minimalResults: true }), { transport: right })
    await hosted.connect(left)
    for (const client of [mcp, hosted]) {
      expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28')
      expect((await client.listTools()).tools.find(tool => tool.name === 'scrape')?.outputSchema).toBeDefined()
    }
  })
  afterAll(async () => {
    await mcp?.close()
    await mcpServer?.close()
    await hosted?.close()
    await hostedServer?.close()
    await engine?.close()
    await Promise.all([api, source].filter(Boolean).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
    if (root) await rm(root, { recursive: true, force: true })
  })
  async function scrape(surface: 'API' | 'SDK' | 'MCP' | 'minimal MCP', debug: boolean, kind: string, verify?: VerifyContract, prune = false): Promise<CompactScrapeResponse> {
    const url = `${origin}/${kind}`
    const args = { url, formats: ['markdown', 'html', 'tables', 'links', 'rawHtml'] as const, fastMode: true, debug, maxAge: 0, storeInCache: false, ...(prune ? { excludeTags: ['#team-0'] } : {}), ...(verify === undefined ? {} : { verify }) }
    if (surface === 'API') {
      const response = await fetch(`${baseUrl}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
      expect(response.status).toBe(200)
      return await response.json() as CompactScrapeResponse
    }
    if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(url, args))) as CompactScrapeResponse
    const response = await (surface === 'minimal MCP' ? hosted : mcp).callTool({ name: 'scrape', arguments: args })
    expect(response.isError).not.toBe(true)
    const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
    expect(response.structuredContent).toEqual(out)
    return out
  }
  for (const surface of ['API', 'SDK', 'MCP', 'minimal MCP'] as const) for (const debug of [false, true]) {
    it(`${surface} ${debug ? 'full' : 'compact'} joins only corroborated rows with source season/conference`, async () => {
      const verify: VerifyContract = { checks: [
        { type: 'markdownIncludes', text: 'NBA Preseason Standings 2026-27' },
        ...STANDINGS_TEAMS.flatMap((team, i) => [
          { type: 'markdownIncludes' as const, text: `[${team.name}](${origin}${team.url}) | ${team.stats.join(' | ')} | 2026-27 Preseason | Eastern Conference | ${team.uid}` },
          { type: 'field' as const, path: `tables.0.rows.${i + 1}.8`, equals: team.uid },
        ]),
      ] }
      for (const kind of ['valid', 'reordered', 'wrong-season', 'wrong-stats', 'wrong-url', 'missing-key', 'duplicate-key', 'missing-row', 'wrong-diff']) {
        const out = await scrape(surface, debug, kind, verify)
        const passed = kind === 'valid' || kind === 'reordered'
        expect(out.status, JSON.stringify(out)).toBe('success')
        expect(out.verification.status).toBe(passed ? 'passed' : 'failed')
        expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.readiness.state === 'ready').toBe(passed)
        expect(out.tables).toHaveLength(passed ? 1 : 2)
        expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture(kind)).digest('hex'))
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        expect(out.evidenceRecord.outputSha256.markdown).toBe(createHash('sha256').update(out.markdown!).digest('hex'))
        expect(out.evidenceRecord.extractor.version).toBe(EXTRACTOR_VERSION)
        expect(out.rawHtml).toBe(fixture(kind))
        expect(out.truncated).not.toBe(true)
        if (passed) {
          expect(out.tables![0]!.csvSha256).toBe(createHash('sha256').update(out.tables![0]!.csv).digest('hex'))
          expect(out.tables![0]!.caption).toBe('NBA Preseason Standings 2026-27 — Eastern Conference')
          expect(out.tables![0]!.rows[0]).toEqual(['Team', 'W', 'L', 'PCT', 'GB', 'DIFF', 'Season', 'Conference', 'Team UID'])
          for (const [i, team] of STANDINGS_TEAMS.entries()) expect(out.tables![0]!.rows[i + 1]).toEqual([team.name, ...team.stats, '2026-27 Preseason', 'Eastern Conference', team.uid])
        } else expect(out.markdown).not.toContain('| Team UID |')
      }
      const noContract = await scrape(surface, debug, 'valid')
      expect(noContract.verification.status).toBe('not_requested')
      expect(noContract.evidenceRecord.verification?.status).toBe('not_requested')
      // This small hydration-heavy fixture retains the existing not_loaded classification without a contract.
      expect(noContract.readiness.state).toBe('not_loaded')
      expect(noContract.evidenceRecord.readiness).toEqual(noContract.readiness)
      expect(noContract.tables).toHaveLength(1)
      const pruned = await scrape(surface, debug, 'valid', verify, true)
      expect(pruned.markdown).not.toContain('Harbour Owls')
      expect(pruned.markdown).not.toContain('| Team UID |')
      expect(pruned.verification.status).toBe('failed')
      expect(pruned.evidenceRecord.readiness).toEqual(pruned.readiness)
    })
  }
})
