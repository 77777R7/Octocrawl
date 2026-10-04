import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { identityBundleFrom, identityForRoute, modeIdentity, type FetchResult } from '@w2l/contracts'
import { FileSessionStore, type Channel, type SessionSnapshot } from '@w2l/bench'
import { createApiEngine, defaultSessionsFile, type ApiEngine } from '../src/engine.js'
import { createApp, isLoopbackAuthority } from '../src/app.js'

const URL_ = 'https://www.example.com/account'

function page(url: string, lane: FetchResult['lane'], markdown: string): FetchResult {
  return {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane,
    escalations: [], handoff: null, markdown, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 4, browserMs: 0, externalCostUsd: null },
    trace: [],
  }
}

/** A public rung that answers with the logged-out page, and an authed rung that records the session it was handed. */
function stubChannels(seen: (SessionSnapshot | null | undefined)[], signedOut = false) {
  return (mode: 'standard' | 'research' | 'authed'): Channel[] => {
    const channels: Channel[] = [{ id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => page(url, 'http', 'Please sign in to continue.') }]
    // signedOut: the site refused the saved login and redirected to its login page.
    const authedPage = (url: string): FetchResult => signedOut
      ? { ...page(url, 'browser_local_authed', 'Login Page'), evidence: { finalUrl: 'https://www.example.com/login', httpStatus: 200, redirectChain: [url, 'https://www.example.com/login'], contentType: 'text/html', rawBodySha256: null, artifacts: [] } }
      : page(url, 'browser_local_authed', 'Your orders: 3')
    if (mode === 'authed') channels.push({ id: 'authed_session', identity: identityForRoute('authed', { session: true }), fetch: async (url, session) => { seen.push(session); return authedPage(url) } })
    return channels
  }
}

describe('saved logins in the API engine', () => {
  let root: string
  let engine: ApiEngine | null = null

  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  async function setup(options: { hosted?: boolean; withFile?: boolean; signedOut?: boolean } = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-logins-'))
    const sessionsFile = join(root, 'sessions.json')
    await new FileSessionStore(sessionsFile).save({ domain: 'example.com', attestedBy: 'test', attestedAt: '2026-10-03T00:00:00.000Z', vendor: 'browser_local_authed', cookies: [{ name: 'sid', value: 'secret', domain: '.example.com', path: '/' }] })
    const seen: (SessionSnapshot | null | undefined)[] = []
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor: stubChannels(seen, options.signedOut), hosted: options.hosted, sessionsFile: options.withFile === false ? null : sessionsFile })
    return { seen, sessionsFile }
  }

  it('mode authed reads the page with the login saved for its domain, and never writes the file', async () => {
    const { seen, sessionsFile } = await setup()
    const before = await readFile(sessionsFile, 'utf8')
    const res = await engine!.scrape({ url: URL_, mode: 'authed' })
    expect(res.lane).toBe('browser_local_authed')
    expect(res.markdown).toBe('Your orders: 3')
    expect(seen.map((s) => s?.domain)).toEqual(['example.com'])
    expect(await readFile(sessionsFile, 'utf8')).toBe(before)
  })

  it('a crawl never carries a saved login, even one stored in mode authed before crawl refused it', async () => {
    const { seen } = await setup()
    // (No sitemap read: it would request the page's host for real, and the pages here are stubbed.)
    const accepted = await engine!.startCrawl({ url: URL_, mode: 'authed', maxDepth: 0, maxPages: 1, sitemap: 'skip' } as Parameters<ApiEngine['startCrawl']>[0])
    for (let i = 0; i < 100 && !['completed', 'failed', 'cancelled'].includes((await engine!.getCrawl(accepted.taskId))?.status ?? ""); i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen.every((session) => session === null || session === undefined)).toBe(true)
  })

  it('a batch in mode authed reads each page with the saved login', async () => {
    const { seen } = await setup()
    const accepted = await engine!.startBatch({ urls: [URL_], mode: 'authed' } as Parameters<ApiEngine['startBatch']>[0])
    for (let i = 0; i < 100 && !['completed', 'failed', 'cancelled'].includes((await engine!.getBatch(accepted.taskId))?.status ?? ""); i++) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen.map((session) => session?.domain)).toEqual(['example.com'])
  })

  it('a batch page whose saved login the site refused is login_wall, with the hint to import it again', async () => {
    await setup({ signedOut: true })
    const accepted = await engine!.startBatch({ urls: [URL_], mode: 'authed' } as Parameters<ApiEngine['startBatch']>[0])
    let status = await engine!.getBatch(accepted.taskId)
    for (let i = 0; i < 100 && !['completed', 'failed', 'cancelled'].includes(status?.status ?? ''); i++) { await new Promise((resolve) => setTimeout(resolve, 20)); status = await engine!.getBatch(accepted.taskId) }
    const item = (await engine!.getBatchItems(accepted.taskId))!.items[0]!
    expect(item.status).toBe('blocked')
    expect(item.agentHints).toEqual([expect.stringMatching(/refused your saved login for example\.com.*w2l login import example\.com/)])
  })

  it('other modes never load a saved login', async () => {
    const { seen } = await setup()
    const res = await engine!.scrape({ url: URL_ })
    expect(res.lane).toBe('http')
    expect(seen).toEqual([])
  })

  it('a hosted engine never reads the operator\'s saved logins', async () => {
    const { seen } = await setup({ hosted: true })
    await engine!.scrape({ url: URL_, mode: 'authed' })
    expect(seen.every((s) => s === null || s === undefined)).toBe(true)
  })

  it('without a sessions file mode authed has no session to use', async () => {
    const { seen } = await setup({ withFile: false })
    const res = await engine!.scrape({ url: URL_, mode: 'authed' })
    expect(res.lane).toBe('http')
    expect(seen).toEqual([])
  })

  it('a loopback-only server refuses a request addressed by another name or sent from another origin', async () => {
    await setup()
    const app = createApp(engine!, { loopbackOnly: true })
    const post = (headers: Record<string, string>) => app.request('http://127.0.0.1:8787/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ url: URL_, mode: 'authed' }) })
    expect((await post({ host: 'rebound.example:8787' })).status).toBe(401)
    expect((await post({ host: '127.0.0.1:8787', origin: 'https://evil.example' })).status).toBe(401)
    const ok = await post({ host: '127.0.0.1:8787', origin: 'http://localhost:3000' })
    expect(ok.status).toBe(200)
    expect(isLoopbackAuthority('[::1]:8787', false)).toBe(true)
    expect(isLoopbackAuthority('localhost.evil.example', false)).toBe(false)
  })

  it('the default file is W2L_SESSIONS_FILE, else ~/.w2l/sessions.json', () => {
    expect(defaultSessionsFile({ W2L_SESSIONS_FILE: '/tmp/s.json' })).toBe('/tmp/s.json')
    expect(defaultSessionsFile({})).toMatch(/[/\\]\.w2l[/\\]sessions\.json$/)
  })
})
