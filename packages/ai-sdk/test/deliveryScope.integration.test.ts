import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { localNetworkPolicy } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { contractSha256, verify as verifyTask } from '@w2l/runtime'
import { scrapeTool, type ScrapeToolInput } from '../src/index.js'

describe('AI SDK contracts on the final tool result over HTTP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let url: string
  let baseUrl: string
  let apiCalls = 0
  let sourceReads = 0

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-ai-delivery-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      sourceReads++
      if (req.url === '/missing') { res.writeHead(404).end('Not found'); return }
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><head><title>Tide report</title></head><body><main>
        <h1>Tide report</h1><p>${'The harbour office publishes tide height and visibility each morning. '.repeat(5)}</p>
        <a href="/harbour">Harbour observations</a><table><thead><tr><th>Place</th><th>Height</th></tr></thead>
        <tbody><tr><td>North harbour</td><td>2.5</td></tr><tr><td>South harbour</td><td>3.0</td></tr></tbody></table>
        </main></body></html>`)
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(source.address() as AddressInfo).port}/article`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await engine?.close()
    await Promise.all([api, source].filter(Boolean).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
    if (root) await rm(root, { recursive: true, force: true })
  })

  async function scrape(input: Omit<ScrapeToolInput, 'url'>, target = url): Promise<Record<string, unknown>> {
    const tool = scrapeTool({ baseUrl, apiKey: '', fetch: async (...args) => { apiCalls++; return fetch(...args) } })
    return JSON.parse(JSON.stringify(await tool.execute!({ url: target, ...input }, { toolCallId: 'delivery', messages: [], context: {} }))) as Record<string, unknown>
  }

  it('refuses discarded, renamed and verdict fields without calling the API or source', async () => {
    const calls = apiCalls
    const reads = sourceReads
    for (const path of ['snapshot.httpStatus', 'document.title', 'metadata.statusCode', 'usage.requestCount', 'httpStatus', 'title', 'verification.status', 'readiness.state', 'evidenceRecord.verification.status']) {
      const out = await scrape({ verify: { checks: [{ type: 'field', path, present: true }] } })
      expect(out).toMatchObject({ status: 'refused', httpStatus: 400, code: 'invalid_request', retryAfterSeconds: null })
      expect(out).not.toHaveProperty('verification')
      expect(out).not.toHaveProperty('evidenceRecord')
    }
    expect(apiCalls).toBe(calls)
    expect(sourceReads).toBe(reads)
  })

  it('keeps a supported contract unchanged and agrees with the final serialized Markdown, links and tables', async () => {
    const verify: NonNullable<ScrapeToolInput['verify']> = { checks: [
      { type: 'markdownIncludes', text: 'Tide report' },
      { type: 'minTables', min: 1 },
      { type: 'field', path: 'status', equals: 'success' },
      { type: 'field', path: 'requestedUrl', equals: url },
      { type: 'field', path: 'finalUrl', equals: url },
      { type: 'field', path: 'truncated', equals: false },
      { type: 'field', path: 'html', present: true },
      { type: 'field', path: 'links.0', present: true },
      { type: 'listRecordsMin', path: 'links', min: 1 },
      { type: 'listRecordsMin', path: 'tables.0.rows', min: 2 },
      { type: 'tableRowsMin', tableIndex: 0, columns: [0, 1], min: 2 },
    ] }
    const out = await scrape({ formats: ['markdown', 'links', 'html', 'tables'], verify })
    expect(out).toMatchObject({ status: 'success', httpStatus: 200, title: 'Tide report', verification: { status: 'passed', contractSha256: contractSha256(verify) }, readiness: { state: 'ready' }, evidenceRecord: { verification: { status: 'passed' } } })
    expect(verifyTask(verify, out)).toEqual(out.verification)
    expect(out).not.toHaveProperty('snapshot')
    expect(out).not.toHaveProperty('metadata')
    const missing = await scrape({ formats: ['markdown'], verify: { checks: [{ type: 'listRecordsMin', path: 'links', min: 1 }] } })
    expect(missing).not.toHaveProperty('links')
    expect(missing).toMatchObject({ verification: { status: 'failed' }, evidenceRecord: { verification: { status: 'failed' } } })
  })

  it('judges prototype paths as absent while keeping supported indexes and the contract hash', async () => {
    for (const path of ['markdown.constructor', 'markdown.__proto__.toString', 'tables.0.constructor', 'links.__proto__.constructor']) {
      for (const present of [true, false]) {
        const verify: NonNullable<ScrapeToolInput['verify']> = { checks: [{ type: 'field', path, present }] }
        const out = await scrape({ formats: ['markdown', 'tables', 'links'], verify })
        expect(out).toMatchObject({ status: 'success', verification: { status: present ? 'failed' : 'passed', contractSha256: contractSha256(verify) }, evidenceRecord: { verification: { status: present ? 'failed' : 'passed' } } })
        expect((out.readiness as { state: string }).state === 'ready').toBe(!present)
        expect(verifyTask(verify, out)).toEqual(out.verification)
      }
    }
    const verify: NonNullable<ScrapeToolInput['verify']> = { checks: [
      { type: 'field', path: 'tables.0.rows.1.0', equals: 'North harbour' },
      { type: 'field', path: 'links.0', present: true },
    ] }
    expect(await scrape({ formats: ['markdown', 'tables', 'links'], verify })).toMatchObject({ verification: { status: 'passed', contractSha256: contractSha256(verify) }, readiness: { state: 'ready' }, evidenceRecord: { verification: { status: 'passed' } } })
  })

  it('preserves not_requested and unread-page failure without claiming completion', async () => {
    expect(await scrape({})).toMatchObject({ verification: { status: 'not_requested' }, evidenceRecord: { verification: { status: 'not_requested' } } })
    const out = await scrape({ verify: { checks: [{ type: 'markdownIncludes', text: 'Tide report' }] } }, url.replace('/article', '/missing'))
    expect(out).toMatchObject({ status: 'failed', verification: { status: 'failed', reason: 'page_not_read' }, evidenceRecord: { verification: { status: 'failed' } } })
    expect(out.readiness).not.toMatchObject({ state: 'ready' })
  })
})
