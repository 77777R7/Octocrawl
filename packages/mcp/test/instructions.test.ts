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
  it('answers initialize on the local server with instructions for the 39 tools and Octocrawl\'s identity', async () => {
    const client = await connect(createMcpServer(new W2L({ baseUrl: 'http://127.0.0.1:1' })))
    try {
      const listed = (await client.listTools()).tools.map((tool) => tool.name)
      expect(listed).toHaveLength(39)
      expectUsableInstructions(client.getInstructions(), listed)
      // The routes it teaches name the tools a first task needs.
      expect(mentionedTools(client.getInstructions()!)).toEqual(expect.arrayContaining(['scrape', 'map', 'crawl', 'batch_scrape', 'wait_batch']))
      expect(client.getServerVersion()).toMatchObject({ name: 'octocrawl', title: 'Octocrawl', version: MCP_VERSION, description: expect.any(String), websiteUrl: expect.stringMatching(/^https:\/\/octocrawl\.dev\//) })
    } finally { await client.close() }
  })

  describe('a page behind the person\'s login', () => {
    const tools = ['scrape', 'get_scrape', 'map']
    const jobs = [...tools, 'crawl', 'wait_crawl', 'get_crawl_pages', 'batch_scrape', 'wait_batch', 'get_batch_items']

    it('tells a local agent what it looks like, to ask first, and how long a yes lasts, before it ever meets one', () => {
      const text = serverInstructions(tools, { kind: 'local' })
      expect(text).toContain('A login wall Octocrawl recognises comes back blocked (login_wall)')
      expect(text).toMatch(/lane my-browser, handoff and mode authed read as them.*ask the person first, naming the site/)
      expect(text).toContain('say when a page was read as them')
      expect(text).toContain('A yes covers that site for this conversation')
    })

    it('says nothing of it on a read-only server, which refuses those options', () => {
      const text = serverInstructions(tools, { kind: 'local', readOnly: true })
      expect(text).not.toContain('login_wall')
      expect(text).not.toContain('my-browser')
    })

    it('on hosted, says a login needs a local server, not this connection, and names no option hosted refuses', () => {
      for (const [names, connection] of [[tools, 'keyless'], [tools, 'key'], [jobs, 'key'], [jobs, 'oauth']] as const) {
        const text = serverInstructions(names, { kind: 'hosted', connection, browser: true })
        // Nothing forwards a hosted read to the person's computer yet (ROADMAP, the decision of 2026-11-04), so it says this connection does not.
        expect(text).toMatch(/logins(,| need).*not (this one|through this one)/)
        expect(text).toContain('npx octocrawl serve')
        expect(text).toContain('ask first, naming the site')
        expect(text).not.toContain('my-browser')
        expectUsableInstructions(text, [...names])
      }
    })
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
    // The number, and that every call counts, where the server knows them: a caller otherwise learns the allowance when it is gone.
    const counted = serverInstructions(['scrape', 'map'], { kind: 'hosted', connection: 'keyless', browser: false, allowance: 20 })
    expect(counted).toContain('within a daily allowance of 20 pages per address (every call counts, whether or not a page came back; it resets at 00:00 UTC)')
    expect(serverInstructions(['scrape', 'map'], { kind: 'hosted', connection: 'keyless', browser: false, sharedPool: true, allowance: 200 })).toContain('a daily allowance of 200 pages that every Claude connector without a key shares')
    const local = serverInstructions(['scrape', 'crawl', 'get_crawl', 'get_crawl_pages'], { kind: 'local' })
    expect(local).not.toMatch(/did not run/)
    expect(local).toContain('may still have begun')
  })

  it('teaches the directory route where batch_scrape is listed, URLs first and one batch, naming map only where it is', () => {
    const jobs = ['scrape', 'map', 'scrape_product', 'batch_scrape', 'get_batch', 'get_batch_items', 'wait_batch', 'cancel_batch', 'get_batch_errors', 'crawl', 'get_crawl', 'wait_crawl', 'get_crawl_pages', 'get_crawl_errors', 'cancel_crawl']
    const hosted = serverInstructions(jobs, { kind: 'hosted', connection: 'oauth', browser: true })
    expectUsableInstructions(hosted, jobs)
    expect(hosted).toContain("A directory's detail pages: URLs first (map where a sitemap lists them; else batch_scrape the listing pages with formats: [\"links\"] and keep the detail links), then one batch_scrape of them, not one scrape each.")
    const noMap = serverInstructions(jobs.filter((name) => name !== 'map'), { kind: 'local' })
    expect(noMap).toContain('(batch_scrape the listing pages with formats: ["links"] and keep the detail links)')
    expect(noMap).not.toContain('map where')
    expect(serverInstructions(['scrape', 'map', 'scrape_product'], { kind: 'hosted', connection: 'keyless', browser: false })).not.toContain("A directory's detail pages")
    // Every hosted shape stays under the length a client keeps whole.
    for (const connection of ['key', 'oauth'] as const) for (const browser of [true, false]) expectUsableInstructions(serverInstructions(jobs, { kind: 'hosted', connection, browser }), jobs)
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
