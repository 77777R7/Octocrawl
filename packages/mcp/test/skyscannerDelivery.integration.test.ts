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
import { localNetworkPolicy, type CompactScrapeResponse, type TraceEvent } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { ProviderSubject } from '../../bench/src/subjects/provider.js'
import { createMcpServer } from '../src/server.js'

const route = 'https://www.skyscanner.net/routes/lond/pari/london-to-paris.html'
const challenge = 'https://www.skyscanner.net/sttc/px/captcha-v2/index.html?url=L3JvdXRlcw=='
const heading = '<h1>Are you a person or a robot?</h1>'
const loader = '<div id="px-captcha"><div id="px-loader"></div></div>'
const frame = '<div id="px-captcha"><iframe title="Human verification challenge"></iframe></div>'
function fixture(kind: string): string {
  const prose = '<p>' + 'London to Paris route information is published in this fixture guide. '.repeat(7) + '</p>'
  const body = kind === 'empty' ? `<nav>${heading}</nav>${loader}<main></main>`
    : kind === 'normal' ? `<main><h1>London to Paris</h1>${prose}</main>`
      : kind === 'quoted' ? `<main>${heading}${prose}<template>${frame}</template></main>`
        : `${heading}<p>Please don’t take this personally - some scripts and bots are remarkably lifelike these days!</p>${kind === 'rendered' ? frame : loader}`
  return `<html><head><title>Skyscanner fixture</title></head><body>${body}</body></html>`
}

describe('Skyscanner challenge classification in final HTTP SDK/MCP responses', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-skyscanner-'))
    source = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-fixture-ua': req.headers['user-agent']! }).end(fixture(new URL(req.url!, 'http://fixture').pathname.slice(1))))
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'
    // Controlled transport replay through the production reader. Only localhost is fetched; final URLs are fixtures.
    const reader = new ProviderSubject({ id: 'browserbase', declaredUserAgent: ua, capabilities: ['headless_browser', 'datacenter_proxy'], honoursCallerUserAgent: false }, {
      fetch: async (url, _deadline, signal) => {
        const kind = new URL(url).searchParams.get('fixture')!
        const response = await fetch(`${origin}/${kind}`, { signal, headers: { 'user-agent': ua } })
        return { status: response.status, body: await response.text(), finalUrl: kind === 'normal' ? route : challenge, headers: { 'content-type': response.headers.get('content-type')! }, sentUserAgent: response.headers.get('x-fixture-ua') }
      },
    }, 'standard', null, async () => ({ text: 'User-agent: *\nAllow: /', status: 200, contentType: 'text/plain' }))
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, sessionsFile: null, userChrome: null, channelsFor: mode => buildChannels(mode, { networkPolicy: policy, localSubjects: { http: {
      fetch: (url, deadline, signal, execution, options) => reader.fetch(url, deadline, signal, execution?.onRetryAfter, options), teardown: () => reader.teardown(),
    } } }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-skyscanner-test', version: '1.0.0' })
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
    async function scrape(kind: string, contracted = false, debug = false): Promise<CompactScrapeResponse> {
      const args = { url: `${route}?fixture=${kind}`, formats: ['markdown', 'rawHtml'] as const, maxAge: 0, debug,
        ...(contracted ? { verify: { checks: [{ type: 'markdownIncludes' as const, text: 'Are you a person or a robot?' }], emptyOk: true } } : {}) }
      if (surface === 'SDK') return JSON.parse(JSON.stringify(await sdk.scrape(args.url, args))) as CompactScrapeResponse
      const response = await mcp.callTool({ name: 'scrape', arguments: args })
      expect(response.isError).not.toBe(true)
      const out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
      if (structured) expect(response.structuredContent).toEqual(out)
      else expect(response.structuredContent).toBeUndefined()
      return out
    }

    for (const debug of [false, true]) it.each(['loader', 'rendered', 'empty'])(`${surface} classifies %s on ${debug ? 'full' : 'compact'} delivery, regardless of a weak contract`, async kind => {
      for (const contracted of [false, true]) {
        const out = await scrape(kind, contracted, debug)
        expect(out).toMatchObject({ status: 'blocked', blockReason: 'captcha', failureReason: null, markdown: null })
        expect(out.readiness).toMatchObject({ state: 'not_served', basis: ['captcha'] })
        expect(out.verification).toMatchObject(contracted ? { status: 'failed', reason: 'page_not_read', checks: [] } : { status: 'not_requested' })
        expect(out.evidenceRecord).toMatchObject({ status: 'blocked', reason: 'captcha' })
        expect(out.evidenceRecord.readiness).toEqual(out.readiness)
        expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
        expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture(kind)).digest('hex'))
        expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
        if (debug && kind === 'empty') expect((out as unknown as { trace: TraceEvent[] }).trace.some(event => event.event === 'extract' && event.detail?.escalate === true)).toBe(true)
      }
    })

    it(`${surface} leaves normal routes and quoted controls unclassified`, async () => {
      for (const kind of ['normal', 'quoted']) {
        const out = await scrape(kind)
        expect(out.status).toBe('success')
        expect(out.blockReason).toBeNull()
        expect(out.markdown).toContain('London to Paris')
        expect(out.verification.status).toBe('not_requested')
        expect(out.readiness.state).toBe('ready')
      }
    })
  }
})
