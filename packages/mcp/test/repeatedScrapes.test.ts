import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'
import { REPEATED_SCRAPES_LIMITS, REPEATED_SCRAPES_WINDOW_MS, RepeatedScrapes, repeatedScrapesHint, withRepeatedScrapesHint } from '../src/repeatedScrapes.js'

// The third scrape of one host in ten minutes, and each one after it, carries an agentHint naming batch_scrape, crawl and
// map (docs/launch/2026-11-05-batch-concurrency-plan.md D13): on 2026-11-04 a list of 272 known URLs was read page by page.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const API_HINT = 'the Markdown was cut; read on with markdownOffset'

async function connect(options: Parameters<typeof createMcpServer>[1] = {}) {
  const client = new W2L({ baseUrl: 'http://127.0.0.1:8787', fetch: (async (input) => String(input).endsWith('/v1/scrape') ? json({ status: 'success', markdown: 'ok', agentHints: [API_HINT] }) : json({ taskId: 'task-1' }, 202)) as typeof fetch })
  const mcp = new Client({ name: 'repeat-test', version: '1' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([createMcpServer(client, options).connect(serverSide), mcp.connect(clientSide)])
  const scrape = async (url: string) => JSON.parse(((await mcp.callTool({ name: 'scrape', arguments: { url } })) as { content: Array<{ text: string }> }).content[0]!.text) as { status: string; agentHints?: string[] }
  return { mcp, scrape }
}

describe('repeated scrapes of one host', () => {
  it('names batch_scrape, crawl and map from the third scrape of a host in ten minutes, after the API\'s own hints, and forgets the host after the window', async () => {
    let now = 1_700_000_000_000
    const tracker = new RepeatedScrapes(() => now)
    const { mcp, scrape } = await connect({ repeatedScrapes: { tracker, caller: 'one' } })
    try {
      expect((await scrape('https://example.com/a')).agentHints).toEqual([API_HINT])
      expect((await scrape('https://example.com/b')).agentHints).toEqual([API_HINT])
      // www and the apex are one site, as map and crawl count them.
      const third = await scrape('https://www.example.com/c')
      expect(third.agentHints).toHaveLength(2)
      expect(third.agentHints?.[0]).toBe(API_HINT)
      expect(third.agentHints?.[1]).toBe('3 scrapes of example.com in the last 10 minutes: a known list of URLs runs as one batch_scrape (then wait_batch and get_batch_items), a section of a site as one crawl, and map lists a site\'s URLs without reading each page')
      expect((await scrape('https://example.com/d')).agentHints?.[1]).toMatch(/^4 scrapes of example\.com /)
      // Another host counts apart.
      expect((await scrape('https://other.example/a')).agentHints).toEqual([API_HINT])
      // Ten minutes on, the earlier scrapes are out of the window.
      now += REPEATED_SCRAPES_WINDOW_MS
      expect((await scrape('https://example.com/e')).agentHints).toEqual([API_HINT])
    } finally { await mcp.close() }
  })

  it('counts each caller apart on a shared tracker', async () => {
    const tracker = new RepeatedScrapes(() => 1_700_000_000_000)
    const one = await connect({ repeatedScrapes: { tracker, caller: 'one' } })
    const two = await connect({ repeatedScrapes: { tracker, caller: 'two' } })
    try {
      for (const path of ['a', 'b', 'c']) await one.scrape(`https://example.com/${path}`)
      expect((await one.scrape('https://example.com/d')).agentHints?.[1]).toMatch(/^4 scrapes of example\.com /)
      expect((await two.scrape('https://example.com/a')).agentHints).toEqual([API_HINT])
    } finally { await Promise.all([one.mcp.close(), two.mcp.close()]) }
  })

  it('says where batch_scrape runs when this deployment lists none, as hosted Octocrawl does to a caller without an account', async () => {
    const tracker = new RepeatedScrapes(() => 1_700_000_000_000)
    const { mcp, scrape } = await connect({ allowedTools: new Set(['scrape', 'map']), repeatedScrapes: { tracker, caller: 'keyless' } })
    try {
      for (const path of ['a', 'b']) await scrape(`https://example.com/${path}`)
      expect((await scrape('https://example.com/c')).agentHints?.[1]).toBe('3 scrapes of example.com in the last 10 minutes: with an account\'s connection a known list of URLs runs as one batch_scrape job (then wait_batch and get_batch_items); or run Octocrawl on your computer (npx octocrawl serve) for batch_scrape and crawl')
    } finally { await mcp.close() }
  })

  it('names the toolset flag, not an account, on a server on the person\'s computer started without the batch toolset', async () => {
    const { mcp, scrape } = await connect({ allowedTools: new Set(['scrape', 'map']) })
    try {
      for (const path of ['a', 'b']) await scrape(`https://example.com/${path}`)
      const hint = (await scrape('https://example.com/c')).agentHints?.[1]
      expect(hint).toBe('3 scrapes of example.com in the last 10 minutes: this server was started without the batch and crawl toolsets; started with --toolsets=all (or batch,crawl beside core), a known list of URLs runs as one batch_scrape and a section of a site as one crawl')
      expect(hint).not.toContain('account')
    } finally { await mcp.close() }
  })

  it('counts without a tracker given, under one caller, so a local server needs no setup', async () => {
    const { mcp, scrape } = await connect()
    try {
      for (const path of ['a', 'b']) await scrape(`https://repeat-default.example/${path}`)
      expect((await scrape('https://repeat-default.example/c')).agentHints?.[1]).toMatch(/^3 scrapes of repeat-default\.example /)
    } finally { await mcp.close() }
  })

  it('hints from the third scrape only, leaves a page that already carries five hints its own, counts no URL without a host, and forgets the oldest host once a caller has seen the limit', () => {
    expect(repeatedScrapesHint(2, 'example.com', true)).toBeNull()
    expect(repeatedScrapesHint(3, 'example.com', true)).toMatch(/^3 scrapes of example\.com /)
    // The API caps a scrape's hints at five (docs/scrape-options.md); the page's own stay, and the batch hint waits for the next scrape.
    const full = { status: 'success', agentHints: ['a', 'b', 'c', 'd', 'e'] }
    expect(withRepeatedScrapesHint(full, 'https://example.com/', 3, true)).toBe(full)
    expect((withRepeatedScrapesHint({ status: 'success' }, 'https://example.com/', 3, true) as { agentHints: string[] }).agentHints).toHaveLength(1)
    const tracker = new RepeatedScrapes(() => 1_700_000_000_000)
    expect(tracker.note('one', 'not a url')).toBe(0)
    expect(tracker.note('one', 'https://first.example/')).toBe(1)
    for (let n = 0; n < REPEATED_SCRAPES_LIMITS.hosts; n++) tracker.note('one', `https://host-${n}.example/`)
    // first.example was the oldest of hosts + 1 hosts: forgotten, so its next scrape counts as the first again.
    expect(tracker.note('one', 'https://first.example/')).toBe(1)
    expect(tracker.note('one', `https://host-${REPEATED_SCRAPES_LIMITS.hosts - 1}.example/`)).toBe(2)
  })
})
