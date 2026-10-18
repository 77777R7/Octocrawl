import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { localNetworkPolicy, type FetchResult, type ScrapeRequest } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, createApp } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

const url = 'https://fixture.example/catalog'
function timeout(): FetchResult {
  return { requestedUrl: url, status: 'failed', failureReason: 'timeout', blockReason: null, budgetExceeded: null,
    lane: 'http', escalations: [], handoff: null, markdown: null, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 10_000, bytesWire: 0, bytesDecompressed: 0, requestCount: 1, attemptCount: 1, contentTokens: null, browserMs: 0, externalCostUsd: 0 },
    trace: [{ at: 10_000, lane: 'http', event: 'request_failed', detail: { reason: 'timeout', error: 'HeadersTimeoutError', code: 'UND_ERR_HEADERS_TIMEOUT' } }] }
}
function partial(): FetchResult {
  const base = timeout()
  return { ...base, status: 'partial', failureReason: null, lane: 'browser_local', markdown: '# Shoes\nTrail Runner €79.95',
    evidence: { ...base.evidence, httpStatus: 200 },
    usage: { ...base.usage, wallMs: 30_000, browserMs: 30_000, contentTokens: 12, deadlineExceeded: true }, trace: [] }
}

// Controlled rung results isolate local-cap accounting; no external source or real 30-second wait.
// The companion headersTimeout fixture covers actual HTTP timeout and local Chromium.
describe('local fallback cap preserves final loading signal', () => {
  let root: string
  let api: ReturnType<typeof serve>
  let engine: ReturnType<typeof createApiEngine>
  let sdk: W2L
  let apiUrl: string
  let client: Client
  let mcp: ReturnType<typeof createMcpServer>
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-local-cap-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy,
      localSubjects: { http: { fetch: async () => timeout() }, browser_local: { fetch: async () => partial() } } }) })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }); await once(api, 'listening')
    apiUrl = 'http://127.0.0.1:' + (api.address() as AddressInfo).port
    sdk = new W2L({ baseUrl: apiUrl })
    client = new Client({ name: 'local-cap-test', version: '1' })
    mcp = createMcpServer(sdk)
    const [left, right] = InMemoryTransport.createLinkedPair()
    await Promise.all([mcp.connect(right), client.connect(left)])
  })
  afterAll(async () => {
    await client?.close(); await mcp?.close()
    if (api) await new Promise<void>(resolve => api.close(() => resolve()))
    await engine?.close()
    if (root) await rm(root, { recursive: true, force: true })
  })
  for (const surface of ['API', 'SDK', 'MCP'] as const) for (const configured of ['none', 'pass', 'fail'] as const) {
    it(surface + ' / ' + configured, async () => {
      const request: ScrapeRequest = { url, formats: ['markdown'], debug: surface === 'API', maxAge: 0,
        ...(configured === 'none' ? {} : { verify: { checks: [{ type: 'markdownIncludes', text: configured === 'pass' ? 'Trail Runner' : 'not delivered' }] } }) }
      let out: any
      if (surface === 'API') {
        const response = await fetch(apiUrl + '/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
        expect(response.status).toBe(200); out = await response.json()
      } else if (surface === 'SDK') out = JSON.parse(JSON.stringify(await sdk.scrape(url, request)))
      else {
        const tool = await client.callTool({ name: 'scrape', arguments: { ...request } })
        expect(tool.isError).not.toBe(true)
        const text = tool.content.find(block => block.type === 'text')
        if (text?.type !== 'text') throw new Error('MCP text missing')
        out = JSON.parse(text.text)
        expect(tool.structuredContent).toEqual(out)
      }
      expect(out.status).toBe('partial')
      expect(out.markdown).toContain('Trail Runner')
      expect(out.channelsTried).toEqual(['http', 'browser_local'])
      expect(out.usage.deadlineExceeded).not.toBe(true)
      expect(out.verification.status).toBe(configured === 'none' ? 'not_requested' : configured === 'pass' ? 'passed' : 'failed')
      expect(out.readiness.state).toBe(configured === 'pass' ? 'ready' : 'not_loaded')
      if (configured !== 'pass') expect(out.readiness.basis).toContain('deadline_exceeded')
      expect(out.evidenceRecord.readiness).toEqual({ state: out.readiness.state, basis: out.readiness.basis })
      expect(out.evidenceRecord.verification.status).toBe(out.verification.status)
      expect(out.evidenceRecord.status).toBe('partial')
      if (request.debug) {
        expect(out.summary.attempts[1].result.usage.deadlineExceeded).toBe(true)
        expect(out.trace).toContainEqual(expect.objectContaining({ event: 'local_fallback_deadline', detail: { trigger: 'http_headers_timeout', maxMs: 30_000 } }))
      }
    })
  }
})
