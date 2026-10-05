import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { identityForRoute, type FetchOptions, type FetchResult } from '@w2l/contracts'
import { buildChannels, type Channel } from '@w2l/bench'
import { SqliteTaskStore } from '@w2l/runtime'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngineOptions } from '../src/engine.js'

/**
 * The execution options through the API: headers refused by name before any
 * fetch and sent with every page otherwise, fastMode's channel selection and
 * hint, the hosted refusal of skipTlsVerification, and mobile and blockAds
 * stored on a task and carried to its pages.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const FAST_MODE_HINT = 'the http lane asked for the browser lane; fastMode declined it; retry without fastMode'

function headersOf(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') out[name.toLowerCase()] = value
  return out
}

/** A browser rung that renders every page and counts what it was asked. */
function renderingBrowser() {
  const calls: Array<{ url: string; options?: FetchOptions }> = []
  return {
    calls,
    fetch: async (url: string, _deadlineAt?: number, _signal?: AbortSignal, _execution?: unknown, options?: FetchOptions): Promise<FetchResult> => {
      calls.push({ url, options })
      return {
        requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'browser_local', escalations: [],
        markdown: '# Rendered', links: [], truncated: false, truncatedAt: null, compliance: null,
        evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
        usage: { wallMs: 1, bytesWire: null, bytesDecompressed: 10, requestCount: 1, attemptCount: 1, contentTokens: 3, browserMs: 1, externalCostUsd: null },
        trace: [],
      }
    },
  }
}

async function finished<T extends { status: string }>(read: () => Promise<T | null>): Promise<T> {
  for (let i = 0; i < 400; i++) {
    const report = await read()
    if (report !== null && !['pending', 'running'].includes(report.status)) return report
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('task did not finish')
}

describe('headers, mobile, skipTlsVerification, fastMode and blockAds through the API', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function setup(options: Partial<ApiEngineOptions> = {}, extraChannels: (mode: 'standard' | 'research' | 'authed') => Channel[] = () => []) {
    const requests: Array<{ url: string; headers: Record<string, string> }> = []
    const server = createServer((req, res) => {
      requests.push({ url: req.url ?? '', headers: headersOf(req) })
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      if (req.url === '/echo-headers') {
        const lines = Object.entries(headersOf(req)).filter(([name]) => name !== 'host' && name !== 'connection').map(([name, value]) => `${name}: ${value}`).join('\n')
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Echo</title></head><body><article><h1>Echo</h1><p>${PROSE}</p><pre>${lines}</pre></article></body></html>`)
        return
      }
      if (req.url === '/shell') {
        // A page whose content its script writes: the http lane finds no main content and asks for the browser lane.
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><html><head><title>Almanac viewer</title></head><body><div id="root"></div><noscript>This application requires JavaScript.</noscript>' +
          `<script>document.getElementById('root').innerHTML = '<article><h1>Almanac viewer</h1><p>${PROSE}</p></article>'</script></body></html>`)
        return
      }
      if (req.url === '/chrome') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Survey</title></head><body><main><article><h1>Hourly survey</h1><p>${PROSE}</p></article></main></body></html>`); return }
      res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-execution-options-'))
    const browser = renderingBrowser()
    const engine = createApiEngine({ taskRoot, channelsFor: (mode) => [...buildChannels(mode, { localSubjects: { browser_local: browser } }), ...extraChannels(mode)], ...options })
    cleanup.push(async () => {
      await engine.close({ cancelActive: true })
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(taskRoot, { recursive: true, force: true })
    })
    const app = createApp(engine)
    const post = async (path: string, body: unknown) => {
      const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    }
    const storedTask = async (taskId: string) => {
      const store = SqliteTaskStore.openReadOnly(join(taskRoot, taskId))
      try { return await store.getTask(taskId) } finally { await store.close() }
    }
    return { origin, engine, post, browser, requests, storedTask }
  }

  it('refuses by name the headers the lanes never send on a caller\'s behalf, on the native API and /fc, before anything is fetched', async () => {
    const { origin, post, requests } = await setup()
    const url = `${origin}/echo-headers`
    const identity = { error: "headers.user-agent is refused: the User-Agent and client hints are Octocrawl's declared identity", code: 'invalid_request' }
    expect(await post('/v1/scrape', { url, headers: { 'User-Agent': 'curl/8' } })).toEqual({ status: 400, body: identity })
    expect(await post('/fc/v1/scrape', { url, headers: { 'User-Agent': 'curl/8' } })).toEqual({ status: 400, body: { success: false, ...identity } })
    expect(await post('/v1/scrape', { url, headers: { Cookie: 'sid=1' } })).toEqual({ status: 400, body: { error: "headers.cookie is refused: credentials are not sent as headers; mode 'authed' carries your own session on the record", code: 'invalid_request' } })
    expect(await post('/v1/batches', { urls: [url], headers: { 'Accept-Encoding': 'br' } })).toEqual({ status: 400, body: { error: 'headers.accept-encoding is refused: transport headers are set by the lane', code: 'invalid_request' } })
    expect(await post('/v1/crawl', { url, headers: { 'Sec-CH-UA': '"Other"' } })).toEqual({ status: 400, body: { error: "headers.sec-ch-ua is refused: the User-Agent and client hints are Octocrawl's declared identity", code: 'invalid_request' } })
    expect(await post('/v1/scrape', { url, mode: 'research', mobile: true })).toEqual({ status: 400, body: { error: 'mobile is not available in research mode: the research identity declares a bot, not a device', code: 'invalid_request' } })
    expect(requests).toEqual([])
  })

  it('sends custom headers with a scrape and with every page of a crawl, which stores them', async () => {
    const { origin, post, engine, requests, storedTask } = await setup()
    const url = `${origin}/echo-headers`
    const scrape = (await post('/v1/scrape', { url, headers: { 'X-Test': 'w2l', 'Accept-Language': 'de' } })).body
    expect(scrape).toMatchObject({ status: 'success', lane: 'http', channelsTried: ['http'] })
    expect(scrape.markdown).toContain('x-test: w2l')
    expect(scrape.markdown).toContain('accept-language: de')
    expect(scrape.trace).toContainEqual(expect.objectContaining({ event: 'request_headers_added', detail: { headers: [{ name: 'x-test', value: 'w2l' }, { name: 'accept-language', value: 'de' }] } }))
    expect(requests.find((r) => r.url === '/echo-headers')?.headers).toMatchObject({ 'x-test': 'w2l' })
    expect(requests.find((r) => r.url === '/robots.txt')?.headers).not.toHaveProperty('x-test')
    // No vendor rung in standard mode: nothing was dropped, so the audit says nothing about it.
    expect(scrape.ladderTrace.filter((event: { event: string }) => event.event === 'ladder_channels_filtered')).toEqual([])
    // The compact response shows the same page.
    expect((await post('/v1/scrape', { url, headers: { 'X-Test': 'compact' }, debug: false })).body.markdown).toContain('x-test: compact')

    const crawl = await engine.startCrawl({ url, maxPages: 1, headers: { 'x-test': 'crawl' } })
    expect(await finished(() => engine.getCrawl(crawl.taskId))).toMatchObject({ status: 'completed', pagesFetched: 1 })
    const [page] = (await engine.getCrawlPages(crawl.taskId))!.items
    expect(page!.markdown).toContain('x-test: crawl')
    expect((await storedTask(crawl.taskId))?.crawl).toMatchObject({ headers: { 'x-test': 'crawl' } })
  })

  it('drops the vendor rungs for a request that carries headers, and the audit says so', async () => {
    let vendorReached = 0
    const { origin, post } = await setup({}, (mode) => mode === 'research' ? [{
      id: 'provider', vendorId: 'fake', identity: identityForRoute('research'),
      fetch: async () => { vendorReached++; throw new Error('the vendor rung was reached') },
    }] : [])
    const plain = (await post('/v1/scrape', { url: `${origin}/chrome`, mode: 'research' })).body
    expect(plain).toMatchObject({ status: 'success', lane: 'http' })
    expect(plain.ladderTrace.filter((event: { event: string }) => event.event === 'ladder_channels_filtered')).toEqual([])
    const withHeaders = (await post('/v1/scrape', { url: `${origin}/chrome`, mode: 'research', headers: { 'X-Test': 'w2l' } })).body
    expect(withHeaders).toMatchObject({ status: 'success', lane: 'http' })
    expect(withHeaders.ladderTrace[0]).toEqual({ at: 0, event: 'ladder_channels_filtered', channel: '—', detail: { reason: 'headers', dropped: ['provider(fake)'] } })
    expect(vendorReached).toBe(0)
  })

  it('fastMode keeps the http rung alone, reports its verdict, and says what it declined', async () => {
    const { origin, post, engine, browser } = await setup()
    const shell = `${origin}/shell`
    const fast = (await post('/v1/scrape', { url: shell, fastMode: true })).body
    expect(fast).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http', channelsTried: ['http'], summary: { browserMs: 0 }, agentHints: [FAST_MODE_HINT] })
    expect(fast.ladderTrace[0]).toEqual({ at: 0, event: 'ladder_channels_filtered', channel: '—', detail: { reason: 'fastMode', dropped: ['browser_local'] } })
    expect(browser.calls).toHaveLength(0)
    expect((await post('/v1/scrape', { url: shell, fastMode: true, debug: false })).body).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', agentHints: [FAST_MODE_HINT] })
    // Without fastMode the same page reaches the browser rung and is rendered.
    const rendered = (await post('/v1/scrape', { url: shell })).body
    expect(rendered).toMatchObject({ status: 'success', lane: 'browser_local', channelsTried: ['http', 'browser_local'] })
    expect(rendered).not.toHaveProperty('agentHints')
    expect(browser.calls).toHaveLength(1)
    // A page the http lane serves gets no hint: fastMode changed nothing for it.
    const served = (await post('/v1/scrape', { url: `${origin}/chrome`, fastMode: true })).body
    expect(served).toMatchObject({ status: 'success', lane: 'http', channelsTried: ['http'] })
    expect(served).not.toHaveProperty('agentHints')
    // A batch applies it to every URL.
    const batch = await engine.startBatch({ urls: [shell, `${origin}/chrome`], fastMode: true })
    expect(await finished(() => engine.getBatch(batch.taskId))).toMatchObject({ status: 'completed', completed: 2 })
    const items = (await engine.getBatchItems(batch.taskId, { limit: 10, debug: true }))!.items
    expect(items.find((item) => item.url === shell)).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http' })
    expect(items.every((item) => item.audit?.channelsTried.join() === 'http')).toBe(true)
    expect(browser.calls).toHaveLength(1)
  })

  it('fastMode is refused by name for a URL the server binds to the browser lane', async () => {
    const { origin, post } = await setup({ channelPolicy: () => 'browser_only' })
    expect(await post('/v1/scrape', { url: `${origin}/chrome`, fastMode: true })).toEqual({ status: 400, body: { error: 'fastMode is not available for this URL: it is served by the browser lane only', code: 'invalid_request' } })
    expect(await post('/v1/batches', { urls: [`${origin}/chrome`], fastMode: true })).toEqual({ status: 400, body: { error: 'fastMode is not available for this URL: it is served by the browser lane only', code: 'invalid_request' } })
  })

  it('a hosted engine refuses skipTlsVerification before anything is fetched; a local one hands the wire options to the lanes', async () => {
    const hosted = await setup({ hosted: true })
    const refused = { status: 400, body: { error: 'skipTlsVerification is not available in hosted mode', code: 'invalid_request', agentHints: ['a hosted server verifies every certificate; run Octocrawl locally to use skipTlsVerification, which is recorded in the trace and a tls_unverified warning'] } }
    expect(await hosted.post('/v1/scrape', { url: `${hosted.origin}/chrome`, skipTlsVerification: true })).toEqual(refused)
    expect(await hosted.post('/v1/crawl', { url: `${hosted.origin}/chrome`, skipTlsVerification: true })).toEqual(refused)
    expect(await hosted.post('/v1/batches', { urls: [`${hosted.origin}/chrome`], skipTlsVerification: true })).toEqual(refused)
    const { agentHints, ...fields } = refused.body
    expect(await hosted.post('/fc/v1/scrape', { url: `${hosted.origin}/chrome`, skipTlsVerification: true })).toEqual({ status: 400, body: { success: false, ...fields, agent_hints: agentHints } })
    expect(hosted.requests).toEqual([])
    // The other options are allowed there.
    expect((await hosted.post('/v1/scrape', { url: `${hosted.origin}/chrome`, mobile: true, headers: { 'X-Test': 'w2l' }, fastMode: true, blockAds: false })).body).toMatchObject({ status: 'success', lane: 'http' })

    const local = await setup()
    // waitFor starts at the browser rung, which receives every lane option as given.
    const { body } = await local.post('/v1/scrape', { url: `${local.origin}/chrome`, waitFor: 10, mobile: true, skipTlsVerification: true, blockAds: false, headers: { 'X-Test': 'w2l' } })
    expect(body).toMatchObject({ status: 'success', lane: 'browser_local' })
    expect(local.browser.calls[0]?.options).toMatchObject({ waitFor: 10, mobile: true, skipTlsVerification: true, blockAds: false, headers: { 'x-test': 'w2l' } })
    expect(local.browser.calls[0]?.options).not.toHaveProperty('fastMode')
  })

  it('mobile and blockAds are stored on a crawl task and its pages carry the mobile identity', async () => {
    const { origin, engine, storedTask } = await setup()
    const crawl = await engine.startCrawl({ url: `${origin}/echo-headers`, maxPages: 1, mobile: true, blockAds: false })
    expect(await finished(() => engine.getCrawl(crawl.taskId))).toMatchObject({ status: 'completed', pagesFetched: 1 })
    expect((await storedTask(crawl.taskId))?.crawl).toMatchObject({ mobile: true, blockAds: false })
    const [page] = (await engine.getCrawlPages(crawl.taskId, { debug: true }))!.items
    expect(page!.markdown).toMatch(/user-agent: Mozilla\/5\.0 \(Linux; Android 14; Pixel 7\).*Mobile Safari/)
    expect(page!.markdown).toContain('sec-ch-ua-mobile: ?1')
    expect(page!.trace.find((event) => event.event === 'identity_sent')?.detail).toMatchObject({ device: 'mobile' })
    const batch = await engine.startBatch({ urls: [`${origin}/chrome`], blockAds: false, fastMode: true })
    expect(await finished(() => engine.getBatch(batch.taskId))).toMatchObject({ status: 'completed', completed: 1 })
    expect((await storedTask(batch.taskId))?.batch).toMatchObject({ blockAds: false, fastMode: true })
  })
})
