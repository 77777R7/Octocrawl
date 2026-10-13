import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText, isStepCount } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { AI_SDK_ORIGIN, HOSTED_API_URL, mapTool, octocrawlTools, scrapeTool } from '../src/index.js'

interface Sent { url: string; method: string; headers: Headers; body: Record<string, unknown> }

/** A fetch that records each request and answers with the next reply. */
function fakeFetch(...replies: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  const sent: Sent[] = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) })
    const reply = replies.shift()
    if (reply === undefined) throw new Error('no reply left')
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json', ...reply.headers } })
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent }
}

const EVIDENCE = { schemaVersion: 'w2l.evidence/1', requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', httpStatus: 200, status: 'success' }
const PAGE = {
  requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http',
  snapshot: { rawBodySha256: 'abc', artifacts: [], httpStatus: 200, contentType: 'text/html' }, document: { title: 'Example Domain' },
  formats: ['markdown'], markdown: '# Example Domain', metadata: { scrapeId: 's1' }, verification: { status: 'not_requested' }, readiness: {},
  truncated: false, truncatedAt: null, usage: { totalMs: 10 }, channelsTried: ['http'], evidenceRecord: EVIDENCE,
}
const MAP = {
  id: 'm1', url: 'https://example.com/', status: 'completed', stoppedBy: null,
  links: [{ url: 'https://example.com/', title: 'Example', via: 'start' }, { url: 'https://example.com/docs', via: 'sitemap', lastmod: '2026-10-01' }],
  sources: { startPage: null, sitemap: null }, refused: { duplicate: 0, collapsed: 0, hostDenied: 2, subtreeDenied: 0, pathDenied: 0, assetDenied: 0, robots: 1, robotsUnchecked: 0, searchFiltered: 0, overLimit: 0, samples: { collapsed: [], hostDenied: ['https://other.test/'], robots: [] } },
  identity: { mode: 'standard', userAgent: 'x' }, warnings: [], elapsedMs: 5,
}

afterEach(() => { vi.unstubAllEnvs() })

describe('scrape tool', () => {
  it('reads a page through hosted Octocrawl with no key, recording its origin, and answers compactly', async () => {
    // A local server's token in the environment must never reach hosted Octocrawl.
    vi.stubEnv('W2L_API_TOKEN', 'local-token')
    vi.stubEnv('OCTOCRAWL_API_KEY', '')
    vi.stubEnv('OCTOCRAWL_API_URL', '')
    const { fetch, sent } = fakeFetch({ body: PAGE })
    const result = await scrapeTool({ fetch }).execute!({ url: 'https://example.com/' }, { toolCallId: 't1', messages: [], context: {} })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe(`${HOSTED_API_URL}/v1/scrape`)
    expect(sent[0]!.method).toBe('POST')
    expect(sent[0]!.headers.get('authorization')).toBeNull()
    expect(sent[0]!.body).toEqual({ url: 'https://example.com/', formats: ['markdown'], debug: false, origin: AI_SDK_ORIGIN })
    expect(result).toEqual({
      status: 'success', requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', httpStatus: 200, title: 'Example Domain',
      markdown: '# Example Domain', truncated: false, evidenceRecord: EVIDENCE,
    })
  })

  it('sends a key as a bearer header and calls the server it is given, from options or the environment', async () => {
    const first = fakeFetch({ body: PAGE })
    await scrapeTool({ fetch: first.fetch, apiKey: 'oc_test', baseUrl: 'http://127.0.0.1:8787/' }).execute!({ url: 'https://example.com/', formats: ['links', 'tables'], onlyMainContent: false }, { toolCallId: 't', messages: [], context: {} })
    expect(first.sent[0]!.url).toBe('http://127.0.0.1:8787/v1/scrape')
    expect(first.sent[0]!.headers.get('authorization')).toBe('Bearer oc_test')
    expect(first.sent[0]!.body).toMatchObject({ formats: ['links', 'tables'], onlyMainContent: false })

    vi.stubEnv('OCTOCRAWL_API_KEY', 'oc_env')
    vi.stubEnv('OCTOCRAWL_API_URL', 'https://octocrawl.internal.test')
    const second = fakeFetch({ body: PAGE })
    await scrapeTool({ fetch: second.fetch }).execute!({ url: 'https://example.com/' }, { toolCallId: 't', messages: [], context: {} })
    expect(second.sent[0]!.url).toBe('https://octocrawl.internal.test/v1/scrape')
    expect(second.sent[0]!.headers.get('authorization')).toBe('Bearer oc_env')
  })

  it('keeps a page that could not be read as that status, with its reason', async () => {
    const blocked = { ...PAGE, status: 'blocked', blockReason: 'challenge', markdown: null, warning: 'a challenge page', agentHints: ['retry later'] }
    const { fetch } = fakeFetch({ body: blocked })
    const result = await scrapeTool({ fetch }).execute!({ url: 'https://example.com/' }, { toolCallId: 't', messages: [], context: {} })
    expect(result).toMatchObject({ status: 'blocked', blockReason: 'challenge', markdown: null, warning: 'a challenge page', agentHints: ['retry later'] })
    expect(result).not.toHaveProperty('failureReason')
  })

  it('answers a refusal (the daily allowance used up) with what to do next, instead of throwing', async () => {
    const { fetch } = fakeFetch({
      status: 429,
      body: { error: 'the keyless allowance of 20 pages a day is used up', code: 'quota_exhausted', agentHints: ['a key raises the allowance', 'the allowance resets at 00:00 UTC, in 3600 s'] },
      headers: { 'retry-after': '3600' },
    })
    const result = await scrapeTool({ fetch }).execute!({ url: 'https://example.com/' }, { toolCallId: 't', messages: [], context: {} })
    expect(result).toEqual({
      status: 'refused', httpStatus: 429, code: 'quota_exhausted', error: 'the keyless allowance of 20 pages a day is used up',
      agentHints: ['a key raises the allowance', 'the allowance resets at 00:00 UTC, in 3600 s'], retryAfterSeconds: 3600,
    })
  })

  it('throws what is not an API answer (a network failure), and passes the call\'s abort signal on', async () => {
    const failing = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    await expect(scrapeTool({ fetch: failing }).execute!({ url: 'https://example.com/' }, { toolCallId: 't', messages: [], context: {} })).rejects.toThrow('fetch failed')

    const { fetch, sent } = fakeFetch({ body: PAGE })
    const seen: Array<AbortSignal | null | undefined> = []
    const watching = (async (input: string | URL | Request, init?: RequestInit) => { seen.push(init?.signal); return fetch(input, init) }) as typeof globalThis.fetch
    const controller = new AbortController()
    await scrapeTool({ fetch: watching }).execute!({ url: 'https://example.com/' }, { toolCallId: 't', messages: [], context: {}, abortSignal: controller.signal })
    expect(sent).toHaveLength(1)
    controller.abort()
    expect(seen[0]?.aborted).toBe(true)
  })
})

describe('map tool', () => {
  it('lists a site\'s URLs with the options given, compactly, with what was left out counted', async () => {
    const { fetch, sent } = fakeFetch({ body: MAP })
    const result = await mapTool({ fetch }).execute!({ url: 'https://example.com/', search: 'docs', limit: 50, sitemap: 'only' }, { toolCallId: 't', messages: [], context: {} })
    expect(sent[0]!.url).toBe(`${HOSTED_API_URL}/v1/map`)
    expect(sent[0]!.body).toEqual({ url: 'https://example.com/', search: 'docs', limit: 50, sitemap: 'only', origin: AI_SDK_ORIGIN })
    expect(result).toEqual({
      status: 'completed', id: 'm1', stoppedBy: null,
      links: [{ url: 'https://example.com/', title: 'Example' }, { url: 'https://example.com/docs' }],
      counts: { returned: 2, refused: 3 },
    })
  })
})

describe('with the AI SDK', () => {
  it('runs as the tools of generateText: the model calls scrape and reads the page back', async () => {
    const { fetch, sent } = fakeFetch({ body: PAGE })
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
    let call = 0
    const prompts: unknown[] = []
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        prompts.push(options.prompt)
        call += 1
        return call === 1
          ? { content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'scrape', input: JSON.stringify({ url: 'https://example.com/' }) }], finishReason: { unified: 'tool-calls', raw: undefined }, usage, warnings: [] }
          : { content: [{ type: 'text', text: 'The page is titled Example Domain.' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
      },
    })
    const result = await generateText({ model, tools: octocrawlTools({ fetch }), stopWhen: isStepCount(3), prompt: 'What is the title of https://example.com/?' })
    expect(sent).toHaveLength(1)
    expect(result.text).toBe('The page is titled Example Domain.')
    const toolResults = result.steps.flatMap((step) => step.toolResults)
    expect(toolResults).toHaveLength(1)
    expect(toolResults[0]).toMatchObject({ toolName: 'scrape', output: { status: 'success', title: 'Example Domain', markdown: '# Example Domain' } })
    // The second model call saw the tool's answer.
    expect(JSON.stringify(prompts[1])).toContain('Example Domain')
  })

  it('offers each tool a JSON schema the model can fill in', async () => {
    const seen: Array<{ name: string; inputSchema: Record<string, unknown> }> = []
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        for (const entry of options.tools ?? []) if (entry.type === 'function') seen.push({ name: entry.name, inputSchema: entry.inputSchema as Record<string, unknown> })
        return { content: [{ type: 'text', text: 'ok' }], finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] }
      },
    })
    await generateText({ model, tools: octocrawlTools(), prompt: 'hi' })
    expect(seen.map((entry) => entry.name).sort()).toEqual(['map', 'scrape'])
    const scrape = seen.find((entry) => entry.name === 'scrape')!.inputSchema as { required?: string[]; properties?: Record<string, unknown> }
    expect(scrape.required).toEqual(['url'])
    expect(Object.keys(scrape.properties ?? {})).toEqual(['url', 'formats', 'onlyMainContent'])
  })
})
