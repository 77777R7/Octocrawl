import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { createHostedApi, MemoryHostedKeys, MemoryHostedOAuthTokens, MemoryHostedQuota } from '../src/hostedApi.js'

// How long the event loop waited while a hosted scrape with a task contract ran (the hosted_scrape_phases line's
// loopMaxMs; docs/hosted-api.md, The regular-expression checks). A perf file: it measures time, and its pattern is stopped
// at its limit, which on Node 26.8.1 leaves every later global match in the process about 3.7 times slower.

// About 118,000 characters of prose with no x: `(?:\s|\S)*x` backtracks quadratically on them and stops at its 250 ms limit.
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><h1>Tides</h1><p>${PROSE.repeat(1_000)}</p></main></body></html>`
const STOPPED = { checks: [{ type: 'markdownMatches', pattern: '(?:\\s|\\S)*x' }] }
let site: Server
let origin = ''
beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(404).end()
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
  })
  site.listen(0, '127.0.0.1'); await once(site, 'listening')
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => { await new Promise<void>((resolve) => site.close(() => resolve())) })

describe('the event loop\'s wait during a hosted scrape with a task contract', () => {
  it('includes the hold of a pattern check stopped at its limit, on a warm instance too, and not an MCP result\'s re-judgements', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octocrawl-hosted-loop-'))
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const lines: Record<string, unknown>[] = []
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot: root, hashKey: 'h'.repeat(40), keys: new MemoryHostedKeys(new Map()), oauthTokens: new MemoryHostedOAuthTokens(new Map()), quota: new MemoryHostedQuota(),
      keylessDaily: 20, siteDaily: 100, networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }, regexChecks: true,
      log: (line) => { if (line.startsWith('{')) lines.push(JSON.parse(line) as Record<string, unknown>) },
    })
    if (!service.server.listening) await once(service.server, 'listening')
    const phases = () => lines.filter((line) => line.event === 'hosted_scrape_phases')
    try {
      const scrape = async (verify: unknown) => {
        const response = await fetch(`http://127.0.0.1:${port}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${origin}/tides`, verify }) })
        expect(response.status).toBe(200)
        return await response.json() as { verification: unknown }
      }
      expect((await scrape({ checks: [{ type: 'markdownIncludes', text: 'tide height' }] })).verification).toMatchObject({ status: 'passed' })
      // A warm instance answers this page within the first sample's 10 ms, so the hold starts at once.
      for (let i = 0; i < 3; i++) expect((await scrape(STOPPED)).verification).toMatchObject({ status: 'failed', checks: [{ passed: null, limit: 'time' }] })
      const [control, ...held] = phases()
      expect(typeof control!.loopMaxMs).toBe('number')
      expect(held).toHaveLength(3)
      const costs = lines.filter((line) => line.event === 'regex_checks')
      for (const [index, line] of held.entries()) {
        expect(costs[index]!.maxCallMs as number).toBeGreaterThanOrEqual(240)
        // The scan held the loop for its 250 ms: the line says so, beyond the 10 ms between samples.
        expect(line.loopMaxMs as number, `scrape ${index}`).toBeGreaterThanOrEqual(200)
      }
      // Over MCP the result's re-judgements run after the scrape answered: their own line has them, the scrape's does not.
      const client = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
        await client.callTool({ name: 'scrape', arguments: { url: `${origin}/tides`, verify: STOPPED } })
      } finally { await client.close() }
      const mcp = phases()[4]!
      const [results] = lines.filter((line) => line.event === 'regex_checks' && line.kind === 'mcp_result')
      expect(results!.totalMs as number).toBeGreaterThanOrEqual(500)
      expect(mcp.loopMaxMs as number).toBeGreaterThanOrEqual(200)
      expect(mcp.loopMaxMs as number).toBeLessThan((results!.totalMs as number) / 2)
    } finally {
      await service.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
