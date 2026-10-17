import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { W2L } from '@w2l/sdk'
import { createMcpServer, MCP_VERSION, SERVER_IDENTITY } from '../src/server.js'
import { hostedServerCard } from '../src/hostedApi.js'
import { serverInstructions } from '../src/instructions.js'
import { expectUsableInstructions, mentionedTools } from './instructionChecks.js'

async function connect(server: ReturnType<typeof createMcpServer>) {
  const client = new Client({ name: 'instructions-test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

describe('server instructions and identity', () => {
  it('answers initialize on the local server with instructions for the 38 tools and Octocrawl\'s identity', async () => {
    const client = await connect(createMcpServer(new W2L({ baseUrl: 'http://127.0.0.1:1' })))
    try {
      const listed = (await client.listTools()).tools.map((tool) => tool.name)
      expect(listed).toHaveLength(38)
      expectUsableInstructions(client.getInstructions(), listed)
      // The routes it teaches name the tools a first task needs.
      expect(mentionedTools(client.getInstructions()!)).toEqual(expect.arrayContaining(['scrape', 'map', 'crawl', 'batch_scrape', 'wait_batch']))
      expect(client.getServerVersion()).toMatchObject({ name: 'octocrawl', title: 'Octocrawl', version: MCP_VERSION, description: expect.any(String), websiteUrl: expect.stringMatching(/^https:\/\/octocrawl\.dev\//) })
    } finally { await client.close() }
  })

  it('writes instructions for the tools a deployment lists, and nothing about the ones it leaves out', async () => {
    const allowed = new Set(['scrape', 'get_scrape', 'map'])
    const client = await connect(createMcpServer(new W2L({ baseUrl: 'http://127.0.0.1:1' }), { allowedTools: allowed }))
    try {
      expectUsableInstructions(client.getInstructions(), [...allowed])
    } finally { await client.close() }
  })

  it('tells a keyless Claude connector that its allowance is shared, and does not claim an error means nothing ran', () => {
    const shared = serverInstructions(['scrape', 'map'], { kind: 'hosted', connection: 'keyless', browser: false, sharedPool: true })
    expect(shared).toContain('every Claude connector without a key shares')
    expect(shared).not.toContain('per address')
    expect(serverInstructions(['scrape', 'map'], { kind: 'hosted', connection: 'keyless', browser: false })).toContain('per address')
    const local = serverInstructions(['scrape', 'crawl', 'get_crawl', 'get_crawl_pages'], { kind: 'local' })
    expect(local).not.toMatch(/did not run/)
    expect(local).toContain('may still have begun')
  })

  it('keeps MCP_VERSION at the package version, so a release moves both', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(MCP_VERSION).toBe(pkg.version)
  })

  it('says the same name, title and description in serverInfo, the hosted server card and the registry\'s server.json', () => {
    const registry = JSON.parse(readFileSync(new URL('../../../server.json', import.meta.url), 'utf8')) as { title: string; description: string; version: string; packages: { version: string }[] }
    expect({ title: registry.title, description: registry.description, version: registry.version, packageVersion: registry.packages[0]!.version })
      .toEqual({ title: SERVER_IDENTITY.title, description: SERVER_IDENTITY.description, version: MCP_VERSION, packageVersion: MCP_VERSION })
    expect(hostedServerCard().serverInfo).toMatchObject({ ...SERVER_IDENTITY, version: MCP_VERSION })
  })
})
