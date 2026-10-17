import { describe, expect, it } from 'vitest'
import { createServer } from 'node:net'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { W2L } from '@w2l/sdk'
import { createMcpServer, toolErrorResult, withoutCampaign, type McpServerOptions } from '../src/server.js'

/**
 * A call that did not run answers as a tool result with isError (docs/mcp-client-ux-tasks.md W5), which clients
 * hand to the model, instead of a JSON-RPC error, which they may drop: the first line is the code and what to do,
 * and every agentHint follows on a line of its own. An unknown tool and a cancelled call stay protocol errors.
 */
type Answer = { status: number; body: unknown; headers?: Record<string, string> }
function apiAnswering(answer: Answer): W2L {
  return new W2L({ baseUrl: 'http://api.test', fetch: (async () => new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json', ...answer.headers } })) as typeof fetch })
}

async function connect(client: W2L, options: McpServerOptions = {}) {
  const mcp = new Client({ name: 'tool-errors-test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([createMcpServer(client, options).connect(serverSide), mcp.connect(clientSide)])
  return mcp
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: unknown; _meta?: Record<string, unknown> }
function expectToolError(result: ToolResult, code: string): string[] {
  expect(result.isError).toBe(true)
  expect(result.structuredContent).toBeUndefined()
  expect(result.content).toHaveLength(1)
  const text = result.content[0]!.text
  expect(text.length).toBeLessThanOrEqual(4_000)
  expect(text).not.toContain('{"error"')
  expect(text).not.toContain('utm_')
  const lines = text.split('\n')
  expect(lines[0]).toMatch(new RegExp(`^${code}: \\S`))
  for (const line of lines.slice(1)) expect(line).toMatch(/^(Next: |Retry after \d+ s$)/)
  expect(result._meta?.['octocrawl/error']).toMatchObject({ code })
  return lines
}

describe('tool errors as isError results', () => {
  it('answers a request the local parser refuses with its code and message', async () => {
    const mcp = await connect(apiAnswering({ status: 200, body: {} }))
    try {
      const result = await mcp.callTool({ name: 'crawl', arguments: { url: 'https://example.com/', sitemap: 'later' } }) as ToolResult
      expect(expectToolError(result, 'invalid_request')[0]).toContain('sitemap must be')
    } finally { await mcp.close() }
  })

  it('answers a hosted refusal with its message and each agentHint on a Next line, campaign tags left out', async () => {
    const hint = 'run Octocrawl on your computer for this: npx octocrawl serve (https://octocrawl.dev/docs/connect-mcp/?utm_source=hosted&utm_medium=hint)'
    const mcp = await connect(apiAnswering({ status: 400, body: { error: 'skipTlsVerification is not available in hosted mode', code: 'invalid_request', agentHints: [hint] } }))
    try {
      const lines = expectToolError(await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/', skipTlsVerification: true } }) as ToolResult, 'invalid_request')
      expect(lines).toEqual(['invalid_request: skipTlsVerification is not available in hosted mode', 'Next: run Octocrawl on your computer for this: npx octocrawl serve (https://octocrawl.dev/docs/connect-mcp/)'])
    } finally { await mcp.close() }
  })

  it('answers a 429 with how long to wait, for a rate limit and for a used-up allowance alike', async () => {
    for (const [body, code] of [
      [{ error: 'too many requests', code: 'rate_limited', retryAfterSeconds: 7 }, 'rate_limited'],
      [{ error: 'the keyless allowance of 20 pages a day is used up', code: 'quota_exhausted', agentHints: ['the allowance resets at 00:00 UTC, in 7 s'] }, 'quota_exhausted'],
    ] as const) {
      const mcp = await connect(apiAnswering({ status: 429, body, headers: { 'retry-after': '7' } }))
      try {
        const lines = expectToolError(await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/' } }) as ToolResult, code)
        expect(lines).toContain('Retry after 7 s')
      } finally { await mcp.close() }
    }
  })

  it('answers a call to a local API that is not running with how to start it', async () => {
    // A port nothing listens on (fetch refuses some low ports outright, such as 9, so one is taken and freed).
    const probe = createServer().listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const apiUrl = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const mcp = await connect(new W2L({ baseUrl: apiUrl }), { apiUrl })
    try {
      const lines = expectToolError(await mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/' } }) as ToolResult, 'api_unreachable')
      expect(lines[0]).toBe(`api_unreachable: no Octocrawl API answered at ${apiUrl}; start it with npx octocrawl serve, or set W2L_API_URL`)
    } finally { await mcp.close() }
  })

  it('answers an unknown job id with not_found and the next step', async () => {
    const mcp = await connect(apiAnswering({ status: 404, body: { error: 'batch not found', code: 'not_found' } }))
    try {
      const lines = expectToolError(await mcp.callTool({ name: 'get_batch', arguments: { id: 'batch-gone' } }) as ToolResult, 'not_found')
      expect(lines.some((line) => line.startsWith('Next: ') && line.includes('start a new'))).toBe(true)
    } finally { await mcp.close() }
  })

  it('keeps an unknown tool and a tool this deployment leaves out as protocol errors that name what is offered', async () => {
    const mcp = await connect(apiAnswering({ status: 200, body: {} }), { allowedTools: new Set(['scrape', 'map']), unavailableHint: 'crawl and batch run locally' })
    try {
      await expect(mcp.callTool({ name: 'crawl', arguments: { url: 'https://example.com/' } })).rejects.toThrow(/tool not available in this deployment: crawl; this server offers scrape, map\. crawl and batch run locally/)
    } finally { await mcp.close() }
    const open = await connect(apiAnswering({ status: 200, body: {} }))
    try {
      await expect(open.callTool({ name: 'no_such_tool', arguments: {} })).rejects.toThrow('unknown tool: no_such_tool')
    } finally { await open.close() }
  })

  it('takes campaign tags out of links only, keeping prose, other parameters and fragments', () => {
    expect(withoutCampaign('see https://octocrawl.dev/docs/?utm_source=hosted&utm_medium=hint now')).toBe('see https://octocrawl.dev/docs/ now')
    expect(withoutCampaign('(https://x.dev/a?utm_source=h&q=1&utm_medium=z&r=2)')).toBe('(https://x.dev/a?q=1&r=2)')
    expect(withoutCampaign('https://x.dev/a?utm_source=h#frag')).toBe('https://x.dev/a#frag')
    expect(withoutCampaign('Did you mean scrape? cats & dogs, verify must be an object: { checks: [...], emptyOk? }')).toBe('Did you mean scrape? cats & dogs, verify must be an object: { checks: [...], emptyOk? }')
    expect(toolErrorResult(new Error('is this a login wall? try again'), 'scrape').content[0].text).toBe('error: is this a login wall? try again')
  })

  it('names a failed connection api_unreachable, and leaves a TLS failure as the error it is', () => {
    const refused = new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), { code: 'ECONNREFUSED' }) })
    expect(toolErrorResult(refused, 'scrape', 'http://127.0.0.1:9').content[0].text).toMatch(/^api_unreachable: /)
    const tls = new TypeError('fetch failed', { cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }) })
    expect(toolErrorResult(tls, 'scrape').content[0].text).toBe('error: fetch failed')
  })

  it('answers a call the client cancels over stdio as a cancellation, never as an isError result', async () => {
    // The API never answers until the call's own signal stops it.
    const hanging = new W2L({ baseUrl: 'http://api.test', fetch: ((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await createMcpServer(hanging).connect(serverSide)
    const received: Record<string, unknown>[] = []
    clientSide.onmessage = (message) => { received.push(message as Record<string, unknown>) }
    await clientSide.start()
    await clientSide.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
    await clientSide.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    await clientSide.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'scrape', arguments: { url: 'https://example.com/' } } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await clientSide.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 2, reason: 'test' } })
    await new Promise((resolve) => setTimeout(resolve, 200))
    // The SDK sends nothing for a request the client cancelled; above all, no isError result.
    expect(received.find((message) => message.id === 2)).toBeUndefined()
    await clientSide.close()
  })
})

describe('the stdio server\'s start', () => {
  it('says once on stderr when nothing answers at the API\'s base URL, and nothing when anything does', async () => {
    const { warnIfUnreachable } = await import('../src/stdio.js')
    const lines: string[] = []
    expect(await warnIfUnreachable('http://127.0.0.1:9', (line) => lines.push(line), (async () => { throw new TypeError('fetch failed') }) as typeof fetch)).toBe(false)
    expect(lines).toEqual(['octocrawl-mcp: no Octocrawl API answered at http://127.0.0.1:9; start it with npx octocrawl serve, or set W2L_API_URL'])
    expect(await warnIfUnreachable('http://127.0.0.1:8787', (line) => lines.push(line), (async () => new Response('not found', { status: 404 })) as typeof fetch)).toBe(true)
    expect(lines).toHaveLength(1)
  })
})
