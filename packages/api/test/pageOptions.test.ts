import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FetchOptions, FetchResult } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngineOptions } from '../src/engine.js'

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day. '.repeat(5)
const PAGES: Record<string, string> = {
  '/chrome': '<!doctype html><html><head><title>Hourly survey</title></head><body><header><a href="/">Harbour office</a> <a href="/login">Login</a></header>' +
    `<nav><a href="/tides">Tide tables</a></nav><main><article><h1>Hourly survey</h1><p>${PROSE}</p></article></main>` +
    '<footer><p>Published by the harbour office</p></footer><script>document.title = "never content"</script></body></html>',
  // A confident page whose table rows arrive by script: HTTP content that the ladder offers to the browser rung.
  '/table-shell': '<!doctype html><html><body><main><h1>Tide table, hourly</h1><p>Table 7. Release date 2026-09-23. Frequency: hourly. Station: north pier.</p>' +
    '<form><button>Apply</button><table><thead id="head"></thead><tbody id="body"></tbody></table></form></main></body></html>',
  // Navigation and a footer, no main block: the extractor finds no content.
  '/nav-only': '<!doctype html><html><head><title>Harbour office</title></head><body><header><a href="/">Harbour office</a></header>' +
    '<nav><ul><li><a href="/tides">Tide tables</a></li><li><a href="/weather">Weather</a></li></ul></nav><footer><p>Published by the harbour office</p></footer></body></html>',
}

type BrowserStub = { fetch: (url: string, deadlineAt?: number, signal?: AbortSignal, execution?: unknown, options?: FetchOptions) => Promise<FetchResult> }
interface Seen { url: string; options?: FetchOptions; remainingMs: number | null }

/** A browser rung that only ends when the scrape's deadline or a cancellation stops it. */
const hangingBrowser: BrowserStub = {
  fetch: (_url, _deadlineAt, signal) => new Promise<FetchResult>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true })),
}

/** A browser rung that cannot load the page. */
const unreachableBrowser: BrowserStub = {
  fetch: async url => ({
    requestedUrl: url, status: 'failed', failureReason: 'connection_error', blockReason: null, budgetExceeded: null, lane: 'browser_local', escalations: [],
    markdown: null, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 1, bytesWire: null, bytesDecompressed: 0, requestCount: 0, attemptCount: 1, contentTokens: null, browserMs: 1, externalCostUsd: null },
    trace: [],
  }),
}

function recordingBrowser(seen: Seen[]): BrowserStub {
  return {
    fetch: async (url, deadlineAt, _signal, _execution, options) => {
      seen.push({ url, options, remainingMs: deadlineAt === undefined ? null : deadlineAt - Date.now() })
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
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('task did not finish')
}

describe('onlyMainContent, waitFor and timeout on scrape, batch and crawl', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function setup(browser: BrowserStub, options: Partial<ApiEngineOptions> = {}) {
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      const page = PAGES[req.url ?? '']
      if (page !== undefined) res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
      // Any other path (/hang) never answers.
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-page-options-'))
    const engine = createApiEngine({ taskRoot, channelsFor: mode => buildChannels(mode, { localSubjects: { browser_local: browser } }), ...options })
    cleanup.push(async () => {
      await engine.close({ cancelActive: true })
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(taskRoot, { recursive: true, force: true })
    })
    const app = createApp(engine)
    const post = async (path: string, body: unknown) => {
      const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, body: await res.json() }
    }
    return { origin, engine, post }
  }

  it('onlyMainContent false returns the whole page with the evidence of the main-content scrape', async () => {
    const { origin, post } = await setup(hangingBrowser)
    const main = (await post('/v1/scrape', { url: `${origin}/chrome`, formats: ['markdown'] })).body
    const full = (await post('/v1/scrape', { url: `${origin}/chrome`, formats: ['markdown'], onlyMainContent: false })).body
    expect(main.markdown).toContain('Hourly survey')
    for (const chrome of ['Tide tables', 'Login', 'Published by the harbour office']) expect(main.markdown).not.toContain(chrome)
    expect(full.markdown).toContain(`[Tide tables](${origin}/tides)`)
    expect(full.markdown).toContain(`[Login](${origin}/login)`)
    expect(full.markdown).toContain('Published by the harbour office')
    expect(full.markdown).toContain('Hourly survey')
    expect(full.markdown).not.toContain('never content')
    expect(full).toMatchObject({ status: main.status, lane: 'http', snapshot: main.snapshot })
    expect(full.trace).toContainEqual(expect.objectContaining({ event: 'extract', detail: expect.objectContaining({ onlyMainContent: false }) }))
  })

  it('on a page with no main block, false returns the whole page and the default keeps it as evidence', async () => {
    const { origin, post } = await setup(unreachableBrowser)
    const full = (await post('/v1/scrape', { url: `${origin}/nav-only`, formats: ['markdown'], onlyMainContent: false })).body
    expect(full).toMatchObject({ status: 'success', lane: 'http', channelsTried: ['http', 'browser_local'] })
    expect(full.markdown).toBe(`[Harbour office](${origin}/)\n\n- [Tide tables](${origin}/tides)\n- [Weather](${origin}/weather)\n\nPublished by the harbour office`)
    // The browser rung failed without a page: the HTTP page is the answer, as evidence of a failed result.
    const main = (await post('/v1/scrape', { url: `${origin}/nav-only`, formats: ['markdown'] })).body
    expect(main).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http', markdown: full.markdown, channelsTried: ['http', 'browser_local'] })
    expect(main.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_evidence_kept', channel: 'http' }))
    expect((await post('/fc/v1/scrape', { url: `${origin}/nav-only`, onlyMainContent: false })).body).toMatchObject({ success: true, data: { markdown: full.markdown } })
    expect((await post('/fc/v1/scrape', { url: `${origin}/nav-only` })).body).toMatchObject({ success: false, error: 'failed: empty_unverified', data: { markdown: full.markdown } })
  })

  it('a timeout answers HTTP 200 with the HTTP content as partial while the browser rung still runs', async () => {
    const { origin, post } = await setup(hangingBrowser)
    const started = Date.now()
    const { status, body } = await post('/v1/scrape', { url: `${origin}/table-shell`, timeout: 1_500 })
    expect(status).toBe(200)
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(body).toMatchObject({ status: 'partial', lane: 'http', failureReason: null, budgetExceeded: null, channelsTried: ['http', 'browser_local'], usage: { deadlineExceeded: true } })
    expect(body.markdown).toContain('Tide table, hourly')
    expect(body.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_deadline_exceeded', channel: 'browser_local' }))
    const shim = await post('/fc/v1/scrape', { url: `${origin}/table-shell`, timeout: 1_500 })
    expect(shim).toMatchObject({ status: 200, body: { success: true, data: { markdown: expect.stringContaining('Tide table, hourly') } } })
  })

  it('a timeout with nothing fetched yet is failed/timeout, never HTTP 500', async () => {
    const { origin, post } = await setup(hangingBrowser)
    const native = await post('/v1/scrape', { url: `${origin}/hang`, timeout: 1_000, debug: false })
    expect(native).toMatchObject({ status: 200, body: { status: 'failed', failureReason: 'timeout', budgetExceeded: null, usage: { deadlineExceeded: true } } })
    const shim = await post('/fc/v1/scrape', { url: `${origin}/hang`, timeout: 1_000 })
    expect(shim).toMatchObject({ status: 200, body: { success: false, error: 'failed: timeout' } })
  })

  it('waitFor starts at the browser rung with the options, and says so when there is no browser rung', async () => {
    const seen: Seen[] = []
    const { origin, post } = await setup(recordingBrowser(seen))
    const { body } = await post('/v1/scrape', { url: `${origin}/chrome`, waitFor: 2_000, onlyMainContent: false, timeout: 20_000 })
    expect(body).toMatchObject({ status: 'success', lane: 'browser_local', channelsTried: ['browser_local'] })
    expect(body.ladderTrace[0]).toMatchObject({ event: 'ladder_channel_skipped', channel: 'http' })
    expect(seen).toMatchObject([{ url: `${origin}/chrome`, options: { waitFor: 2_000, onlyMainContent: false } }])
    expect(seen[0]!.remainingMs).toBeLessThanOrEqual(20_000)
    expect(seen[0]!.remainingMs).toBeGreaterThan(15_000)

    const httpOnly = await setup(hangingBrowser, { channelsFor: mode => buildChannels(mode, { localSubjects: { browser_local: hangingBrowser } }).filter(channel => channel.id === 'http') })
    const refused = await httpOnly.post('/v1/scrape', { url: `${httpOnly.origin}/chrome`, waitFor: 500 })
    expect(refused).toMatchObject({ status: 200, body: { status: 'failed', failureReason: 'policy_denied', markdown: null } })
    expect(refused.body.trace).toContainEqual(expect.objectContaining({ event: 'wait_for_unavailable' }))
  })

  it('batch and crawl apply the options to every page', async () => {
    const seen: Seen[] = []
    const { origin, engine } = await setup(recordingBrowser(seen))
    const batch = await engine.startBatch({ urls: [`${origin}/chrome`, `${origin}/hang`], onlyMainContent: false, timeout: 1_000 })
    expect(await finished(() => engine.getBatch(batch.taskId))).toMatchObject({ status: 'completed', completed: 2 })
    const items = (await engine.getBatchItems(batch.taskId, { limit: 10 }))!.items
    const chrome = items.find(item => item.url.endsWith('/chrome'))!
    const hang = items.find(item => item.url.endsWith('/hang'))!
    expect(chrome).toMatchObject({ status: 'success', lane: 'http' })
    expect(chrome.markdown).toContain('Published by the harbour office')
    expect(hang).toMatchObject({ status: 'failed', failureReason: 'timeout', usage: { deadlineExceeded: true } })

    const crawl = await engine.startCrawl({ url: `${origin}/chrome`, maxPages: 1, waitFor: 250, timeout: 5_000 })
    expect(await finished(() => engine.getCrawl(crawl.taskId))).toMatchObject({ status: 'completed', pagesFetched: 1 })
    expect(seen).toMatchObject([{ url: `${origin}/chrome`, options: { waitFor: 250 } }])
    expect(seen[0]!.remainingMs).toBeLessThanOrEqual(5_000)
  })
})
