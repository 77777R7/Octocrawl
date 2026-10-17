import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { W2L } from '@w2l/sdk'
import { serveMcpStdio } from '../src/stdio.js'
import { TOOL_NAMES, TOOLS } from '../src/tools.js'
import { parseToolSelection, TOOLSET_NAMES, TOOLSETS } from '../src/toolsets.js'
import { expectUsableInstructions } from './instructionChecks.js'

/**
 * A stdio server lists the toolsets it is started with, or read-only tools alone (docs/mcp-client-ux-tasks.md W10):
 * `--toolsets=core,crawl` / W2L_MCP_TOOLSETS and `--read-only` / W2L_MCP_READ_ONLY. With neither it lists every tool.
 */
type Listed = { name: string; annotations?: { readOnlyHint?: boolean }; inputSchema: { properties: Record<string, Record<string, unknown>> } }
const calls: string[] = []
const client = new W2L({ baseUrl: 'http://api.test', fetch: (async (input: RequestInfo | URL) => {
  calls.push(new URL(String(input)).pathname)
  return new Response(JSON.stringify({ status: 'success', markdown: 'ok', requestedUrl: 'https://example.com/' }), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch })

async function started(argv: readonly string[], env: NodeJS.ProcessEnv = {}) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const handle = serveMcpStdio(client, serverSide, undefined, parseToolSelection(argv, env))
  const mcp = new Client({ name: 'toolsets-test', version: '1.0.0' })
  await mcp.connect(clientSide)
  const { tools } = await mcp.listTools()
  return { mcp, tools: tools as unknown as Listed[], instructions: mcp.getInstructions(), close: async () => { await mcp.close(); await handle.close() } }
}

describe('toolsets', () => {
  it('puts every tool in exactly one toolset', () => {
    const grouped = Object.values(TOOLSETS).flat()
    expect([...grouped].sort()).toEqual([...TOOL_NAMES].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  it('lists every tool with no flag or variable, and with all', async () => {
    for (const [argv, env] of [[[], {}], [['--toolsets=all'], {}], [[], { W2L_MCP_TOOLSETS: 'all' }]] as const) {
      const server = await started(argv, env)
      try { expect(server.tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]) } finally { await server.close() }
    }
  })

  it('lists only the toolsets asked for, by flag or variable, with instructions naming only those tools', async () => {
    for (const [argv, env] of [[['--toolsets=core'], {}], [['--toolsets', 'core'], {}], [[], { W2L_MCP_TOOLSETS: 'core' }]] as const) {
      const server = await started(argv, env)
      try {
        expect(server.tools.map((tool) => tool.name)).toEqual(['scrape', 'map', 'get_scrape'])
        expectUsableInstructions(server.instructions, server.tools.map((tool) => tool.name))
      } finally { await server.close() }
    }
    const server = await started(['--toolsets=core,crawl'])
    try {
      expect(server.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES.filter((name) => (TOOLSETS.core as readonly string[]).includes(name) || (TOOLSETS.crawl as readonly string[]).includes(name)))
      expectUsableInstructions(server.instructions, server.tools.map((tool) => tool.name))
      expect(server.instructions).toContain('crawl, then wait_crawl, then get_crawl_pages')
    } finally { await server.close() }
  })

  it('refuses a tool outside the toolsets and names the flag that lists it', async () => {
    const server = await started(['--toolsets=core'])
    try { await expect(server.mcp.callTool({ name: 'wait_batch', arguments: { id: 'b' } })).rejects.toThrow(/tool not available in this deployment: wait_batch; .*--toolsets=batch/) } finally { await server.close() }
  })

  it('refuses an unknown toolset name and names the valid ones', () => {
    expect(() => parseToolSelection(['--toolsets=core,crawls'], {})).toThrow(`unknown toolset: crawls; the toolsets are ${[...TOOLSET_NAMES, 'all'].join(', ')}`)
    expect(() => parseToolSelection([], { W2L_MCP_TOOLSETS: ',' })).toThrow(/unknown toolset/)
  })
})

describe('--read-only', () => {
  it('lists the read-only tools and a scrape with nothing that acts as the person, marked read-only', async () => {
    for (const [argv, env] of [[['--read-only'], {}], [[], { W2L_MCP_READ_ONLY: '1' }]] as const) {
      const server = await started(argv, env)
      try {
        const readOnly = TOOLS.filter((tool) => tool.annotations.readOnlyHint).map((tool) => tool.name)
        expect(server.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES.filter((name) => name === 'scrape' || readOnly.includes(name)))
        expect(server.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
        const scrape = server.tools.find((tool) => tool.name === 'scrape')!.inputSchema.properties
        for (const key of ['actions', 'lane', 'handoff']) expect(scrape, key).not.toHaveProperty(key)
        expect(scrape.mode!.enum).toEqual(['standard', 'research'])
        expect(scrape.access!.enum).toEqual(['standard', 'enhanced'])
        // What reads the page stays: the regex checks and the screenshot.
        expect(JSON.stringify(scrape.verify)).toContain('markdownMatches')
        expect(JSON.stringify(scrape.formats)).toContain('screenshot')
        expectUsableInstructions(server.instructions, server.tools.map((tool) => tool.name))
      } finally { await server.close() }
    }
  })

  it('refuses the scrape options that act as the person before any API call, and a tool that changes something', async () => {
    const server = await started(['--read-only'])
    try {
      calls.length = 0
      for (const args of [{ actions: [{ type: 'wait', milliseconds: 10 }] }, { mode: 'authed' }, { lane: 'my-browser' }, { access: 'my-browser' }, { handoff: true }]) {
        const result = (await server.mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/', ...args } })) as { isError?: boolean; content: Array<{ text: string }> }
        expect(result.isError, JSON.stringify(args)).toBe(true)
        expect(result.content[0]!.text).toMatch(/^unsupported_parameter: .*--read-only/)
      }
      expect(calls).toEqual([])
      const ok = (await server.mcp.callTool({ name: 'scrape', arguments: { url: 'https://example.com/' } })) as { isError?: boolean }
      expect(ok.isError).not.toBe(true)
      await expect(server.mcp.callTool({ name: 'crawl', arguments: { url: 'https://example.com/' } })).rejects.toThrow(/--read-only/)
    } finally { await server.close() }
  })
})
