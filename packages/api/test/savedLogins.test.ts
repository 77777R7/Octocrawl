import { afterEach, describe, expect, it } from 'vitest'
import { connect, type AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
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
    expect(item.agentHints).toEqual([expect.stringMatching(/www\.example\.com no longer accepts the saved login for example\.com.*octocrawl login import example\.com/)])
  })

  describe('the hint of a login wall names the routes this server has for this request', () => {
    const walled = (): Channel[] => [{ id: 'browser_local', identity: identityBundleFrom(modeIdentity('standard')), fetch: async (url) => ({ ...page(url, 'browser_local', ''), status: 'blocked', blockReason: 'login_wall', markdown: null }) }]
    const hintOn = async (options: { sessions: boolean; chrome: boolean }, request: Record<string, unknown> = {}) => {
      root = await mkdtemp(join(tmpdir(), 'w2l-logins-'))
      engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor: walled, sessionsFile: options.sessions ? join(root, 'sessions.json') : null, ...(options.chrome ? { userChrome: {} } : {}) })
      const res = await engine.scrape({ url: URL_, ...request } as Parameters<ApiEngine['scrape']>[0])
      expect(res.blockReason).toBe('login_wall')
      return res.agentHints![0]!
    }

    it('on a server on the person\'s machine, their Chrome and a saved login', async () => {
      const hint = await hintOn({ sessions: true, chrome: true })
      expect(hint).toContain('ask the person first, naming www.example.com')
      expect(hint).toContain('lane my-browser')
      expect(hint).toContain('octocrawl login import www.example.com')
    })

    it('for a request their Chrome cannot give, the saved login alone, and not that the server has neither', async () => {
      const hint = await hintOn({ sessions: true, chrome: true }, { formats: ['screenshot'] })
      expect(hint).not.toContain('my-browser')
      expect(hint).not.toContain('this server reads no')
      expect(hint).toContain('octocrawl login import www.example.com')
    })

    it('for a request with a script, which neither route takes, says to drop it first', async () => {
      const hint = await hintOn({ sessions: true, chrome: true }, { actions: [{ type: 'executeJavascript', script: '1 + 1' }] })
      expect(hint).toContain('send the request without its executeJavascript action')
      expect(hint).not.toContain('my-browser')
    })

    it('on a server with neither, says so', async () => {
      expect(await hintOn({ sessions: false, chrome: false })).toContain('this server reads no saved login and no Chrome of the person\'s')
    })

    it('never on hosted, which keeps its own hint', async () => {
      root = await mkdtemp(join(tmpdir(), 'w2l-logins-'))
      engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor: walled, hosted: true, sessionsFile: join(root, 'sessions.json'), userChrome: {} })
      const res = await engine.scrape({ url: URL_ } as Parameters<ApiEngine['scrape']>[0])
      expect(res.agentHints![0]).toContain('hosted Octocrawl holds no logins')
    })
  })

  describe('a finished batch says what to do about the pages that asked for a login', () => {
    const walled = (url: string): FetchResult => ({ ...page(url, 'browser_local', ''), status: 'blocked', blockReason: 'login_wall', markdown: null })
    const open = 'https://open.example.org/page'
    const channels = (): Channel[] => [{ id: 'browser_local', identity: identityBundleFrom(modeIdentity('standard')), fetch: async (url) => url === open ? page(url, 'browser_local', 'A public page with enough words to count as content for this test.') : walled(url) }]
    const finished = async (urls: readonly string[], extra: { sessions?: boolean; chrome?: boolean } = {}) => {
      root = await mkdtemp(join(tmpdir(), 'w2l-logins-'))
      engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor: channels, sessionsFile: extra.sessions === false ? null : join(root, 'sessions.json'), ...(extra.chrome === false ? {} : { userChrome: {} }) })
      const accepted = await engine.startBatch({ urls } as Parameters<ApiEngine['startBatch']>[0])
      let status = await engine.getBatch(accepted.taskId)
      for (let i = 0; i < 200 && !['completed', 'failed', 'cancelled'].includes(status?.status ?? ''); i++) { await new Promise((resolve) => setTimeout(resolve, 20)); status = await engine.getBatch(accepted.taskId) }
      return status!
    }

    it('in one line, counting those pages alone, with the routes this server has', async () => {
      const status = await finished(['https://www.example.com/a', 'https://www.example.com/b', open])
      expect(status.agentHints).toEqual([expect.stringMatching(/^2 pages of www\.example\.com asked for a login: ask the person first, naming the site, whether to read them with hand_off_batch .*lane my-browser.*import_login www\.example\.com/)])
    })

    it('offers the handoff only for pages it would take: a list batch hands over lists stopped at a check, not a page at a login wall', async () => {
      const list = 'https://list.example.org/page'
      const stopped = (url: string): FetchResult => ({ ...page(url, 'browser_local', ''), status: 'blocked', blockReason: 'captcha', markdown: null, actions: { lists: [{ type: 'paginate', stoppedBy: 'challenge', challenge: { blockReason: 'captcha', url } }] } } as unknown as FetchResult)
      root = await mkdtemp(join(tmpdir(), 'w2l-logins-'))
      engine = createApiEngine({ taskRoot: join(root, 'tasks'), sessionsFile: join(root, 'sessions.json'), userChrome: {}, channelsFor: () => [{ id: 'browser_local', identity: identityBundleFrom(modeIdentity('standard')), fetch: async (url) => url === list ? stopped(url) : walled(url) }] })
      const accepted = await engine.startBatch({ urls: [list, 'https://www.example.com/a'], actions: [{ type: 'paginate', selector: 'a.next', itemSelector: '.item', maxPages: 2 }] } as unknown as Parameters<ApiEngine['startBatch']>[0])
      let status = await engine.getBatch(accepted.taskId)
      for (let i = 0; i < 200 && !['completed', 'failed', 'cancelled'].includes(status?.status ?? ''); i++) { await new Promise((resolve) => setTimeout(resolve, 20)); status = await engine.getBatch(accepted.taskId) }
      expect(status?.waitingForPerson).toBe(1)
      // The login line offers no handoff for the page at the login wall; the list stopped at a captcha gets its own line, which names the batch handoff.
      expect(status?.agentHints).toEqual([expect.stringContaining('1 page of www.example.com asked for a login'), expect.stringContaining('1 page of list.example.org gates automated access')])
      expect(status?.agentHints?.[0]).not.toContain('hand_off_batch')
    })

    it('says nothing when no page asked for one', async () => {
      expect((await finished([open])).agentHints).toBeUndefined()
    })

    it('says what to do about the rest of the failed pages too, a line a reason, after the login line', async () => {
      const empty = 'https://empty.example.org/'
      const slow = 'https://slow.example.org/'
      const failing = (url: string): FetchResult => url.startsWith(empty)
        ? { ...page(url, 'http', ''), status: 'failed', failureReason: 'empty_unverified', markdown: null, trace: [{ at: 1, lane: 'http', event: 'quality_low_yield' }] }
        : url.startsWith(slow) ? { ...page(url, 'http', ''), status: 'failed', failureReason: 'timeout', markdown: null } : url === open ? page(url, 'http', 'A public page with enough words to count as content for this test.') : walled(url)
      root = await mkdtemp(join(tmpdir(), 'w2l-logins-'))
      engine = createApiEngine({ taskRoot: join(root, 'tasks'), sessionsFile: join(root, 'sessions.json'), channelsFor: () => [{ id: 'http', identity: identityBundleFrom(modeIdentity('standard')), fetch: async (url) => failing(url) }] })
      const accepted = await engine.startBatch({ urls: [`${empty}a`, `${empty}b`, `${slow}a`, 'https://www.example.com/a', open], fastMode: true, timeout: 20_000 } as Parameters<ApiEngine['startBatch']>[0])
      let status = await engine.getBatch(accepted.taskId)
      for (let i = 0; i < 200 && !['completed', 'failed', 'cancelled'].includes(status?.status ?? ''); i++) { await new Promise((resolve) => setTimeout(resolve, 20)); status = await engine.getBatch(accepted.taskId) }
      expect(status?.failed).toBe(4)
      expect(status?.agentHints).toEqual([
        expect.stringContaining('1 page of www.example.com asked for a login'),
        '2 pages of empty.example.org read empty over HTTP and asked for the browser lane, which fastMode declined: a new batch of those URLs without fastMode reads them in a browser',
        expect.stringContaining('1 page of slow.example.org ran out of its 20000 ms timeout'),
      ])
    })

    it('on a server with neither route, names none as its own', async () => {
      const status = await finished(['https://www.example.com/a'], { sessions: false, chrome: false })
      expect(status.agentHints).toEqual([expect.stringContaining('this server reads no saved login')])
    })
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
    // A page on another local port can send a form or a text body without asking the server first; a body that is not JSON is refused before it is read.
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const res = await app.request('http://127.0.0.1:8787/v1/scrape', { method: 'POST', headers: { host: '127.0.0.1:8787', origin: 'http://localhost:3000', 'content-type': type }, body: JSON.stringify({ url: URL_, mode: 'authed' }) })
      expect(res.status, type).toBe(400)
    }
    const bare = await app.request('http://127.0.0.1:8787/v1/scrape', { method: 'POST', headers: { host: '127.0.0.1:8787' }, body: JSON.stringify({ url: URL_ }) })
    expect(bare.status).toBe(400)
    // A POST without a body (cancel, resume) needs no type.
    expect((await app.request('http://127.0.0.1:8787/v1/crawl/00000000-0000-4000-8000-000000000000/cancel', { method: 'POST', headers: { host: '127.0.0.1:8787' } })).status).toBe(404)
    // Over a real socket too: curl -X POST sends neither a length nor a type, and the server still sees a body stream.
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()))
      const { port } = server.address() as AddressInfo
      // The bytes curl -X POST sends: no Content-Length, no Transfer-Encoding, no body.
      const status = await new Promise<number>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1', () => socket.write(`POST /v1/crawl/00000000-0000-4000-8000-000000000000/cancel HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAccept: */*\r\nConnection: close\r\n\r\n`))
        let reply = ''
        socket.on('data', (chunk) => { reply += String(chunk) })
        socket.on('end', () => resolve(Number(/^HTTP\/1\.1 (\d+)/.exec(reply)?.[1] ?? 0)))
        socket.on('error', reject)
      })
      expect(status).toBe(404)
    } finally {
      server.close()
    }
    expect(isLoopbackAuthority('[::1]:8787', false)).toBe(true)
    expect(isLoopbackAuthority('localhost.evil.example', false)).toBe(false)
  })

  it('the default file is W2L_SESSIONS_FILE, else ~/.w2l/sessions.json', () => {
    expect(defaultSessionsFile({ W2L_SESSIONS_FILE: '/tmp/s.json' })).toBe('/tmp/s.json')
    expect(defaultSessionsFile({})).toMatch(/[/\\]\.w2l[/\\]sessions\.json$/)
  })
})
