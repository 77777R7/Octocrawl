import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildChannels, formatScrapeReport, parseArgs, USAGE } from '../src/ladderCli.js'
import { identityBundleFrom, modeIdentity, PREVIEW_PRODUCT_TOKEN, type ExecutionContext, type FetchResult, type TraceEvent } from '@w2l/contracts'
import { LadderRunner } from '../src/routing/ladder.js'
import { MemoryRoutingHistory } from '../src/routing/vendorRouter.js'
import { MemorySessionStore } from '../src/routing/sessionStore.js'
import { evaluateVendorPolicy } from '@w2l/http-core'
import type { SessionSnapshot } from '../src/routing/sessionStore.js'
import type { CdpBrowser } from '../src/vendors/cdp.js'
import type { VendorOps, VendorSession } from '../src/vendors/transport.js'

// A real server for the authed-session rung test: proves the REAL
// BrowserLocalSubject sends the session's cookies, not that a fake channel
// was handed a snapshot.
let authServer: Server
let authBase: string

beforeAll(async () => {
  authServer = createServer((req, res) => {
    if (req.url === '/echo-cookie') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      const cookie = req.headers.cookie ?? '(none)'
      res.end(
        '<html><body><article><h1>Cookie echo</h1>' +
        `<p>${cookie}</p>` +
        '<p>The session cookies sent by the real browser are echoed back above. This paragraph exists so the extractor has real content to work with, and the sentence continues at some length.</p>' +
        '</article></body></html>',
      )
    } else {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise<void>((resolve) => authServer.listen(0, '127.0.0.1', resolve))
  authBase = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => authServer.close(() => resolve()))
})

describe('ladder CLI arguments', () => {
  it('defaults to standard mode (http + browser only)', () => {
    expect(parseArgs(['https://example.com/p'])).toEqual({
      url: 'https://example.com/p',
      mode: 'standard',
      allowlistedDomains: [],
      sessionStoreFile: null,
      historyFile: null,
      handoff: false,
      persistSession: false,
      liveView: false,
    })
  })

  it('reads the persist-session / live-view flags, defaulting both off', () => {
    expect(parseArgs(['--persist-session', '--live-view', 'https://example.com/p'])).toMatchObject({
      persistSession: true,
      liveView: true,
    })
    expect(parseArgs(['https://example.com/p'])).toMatchObject({ persistSession: false, liveView: false })
  })

  it('reads research/authed mode flags', () => {
    expect(parseArgs(['--research', 'https://example.com/p']).mode).toBe('research')
    expect(parseArgs(['--authed', 'https://example.com/p']).mode).toBe('authed')
  })

  it('parses the domain allowlist', () => {
    expect(parseArgs(['--allowlist-hosts', 'example.com,*.example.net', 'https://example.com/p']).allowlistedDomains)
      .toEqual(['example.com', '*.example.net'])
    expect(parseArgs(['--allowlist-hosts=only.example', 'https://x.test/p']).allowlistedDomains)
      .toEqual(['only.example'])
  })

  it('parses session store / history file / handoff flags', () => {
    const args = parseArgs([
      '--session-store',
      '/tmp/sessions.json',
      '--history-file',
      '/tmp/history.json',
      '--handoff',
      'https://example.com/p',
    ])
    expect(args.sessionStoreFile).toBe('/tmp/sessions.json')
    expect(args.historyFile).toBe('/tmp/history.json')
    expect(args.handoff).toBe(true)
  })

  it('rejects unknown flags instead of ignoring them', () => {
    expect(() => parseArgs(['--stealth', 'https://example.com/p'])).toThrow(/unknown flag --stealth/)
  })

  it('requires a URL', () => {
    expect(() => parseArgs([])).toThrow(/usage: w2l scrape/)
    expect(() => parseArgs(['nope'])).toThrow(/not a URL/)
  })

  it('accepts the product command prefix scrape/fetch', () => {
    expect(parseArgs(['scrape', 'https://example.com/p']).url).toBe('https://example.com/p')
    expect(parseArgs(['fetch', '--research', 'https://example.com/p']).mode).toBe('research')
  })

  it('help text names w2l scrape, with w2l-fetch as alias', () => {
    expect(USAGE).toContain('w2l scrape')
    expect(USAGE).toContain('w2l-fetch is an alias')
    expect(USAGE).not.toMatch(/^usage: w2l-fetch/)
  })
})

describe('formatScrapeReport', () => {
  it('prints a non-empty identity line and the extracted markdown', () => {
    const report = formatScrapeReport({
      mode: 'standard',
      identity: identityBundleFrom(modeIdentity('standard', 128)),
      url: 'https://example.com/',
      channels: 'http → browser_local',
      tried: ['http'],
      status: 'success',
      blockReason: null,
      failureReason: null,
      lane: 'http',
      tokens: 12,
      wallMs: 40,
      markdown: '# Example Domain\n\nThis domain is for use in illustrative examples.',
    })
    expect(report).toMatch(/^mode        : standard$/m)
    expect(report).toMatch(/^identity    : Chrome\/128 · macOS · en-US$/m)
    expect(report).toContain('tried       : http')
    expect(report).toContain('outcome     : status=success lane=http')
    expect(report).toContain('tokens      : 12')
    expect(report).toContain('wallMs      : 40')
    expect(report).toContain('# Example Domain')
  })

  it('labels an error page as evidence, not as extracted content', () => {
    const report = formatScrapeReport({
      mode: 'standard',
      identity: identityBundleFrom(modeIdentity('standard', 128)),
      url: 'https://example.com/missing',
      channels: 'http → browser_local',
      tried: ['http'],
      status: 'failed',
      blockReason: null,
      failureReason: 'http_error',
      lane: 'http',
      tokens: null,
      wallMs: 40,
      markdown: '# 404 Not Found',
    })
    expect(report).toContain('outcome     : status=failed failure=http_error lane=http')
    expect(report).toContain('--- error page (evidence, not content) ---\n# 404 Not Found')
    expect(report).not.toContain('--- extracted ---')
  })

  it('research mode names the declared bot, not Chrome', () => {
    const report = formatScrapeReport({
      mode: 'research',
      identity: identityBundleFrom(modeIdentity('research')),
      url: 'https://example.com/',
      channels: 'http → browser_local',
      tried: ['http'],
      status: 'success',
      blockReason: null,
      failureReason: null,
      lane: 'http',
      tokens: 4,
      wallMs: 10,
      markdown: 'ok',
    })
    expect(report).toContain('mode        : research')
    expect(report).toContain('identity    : w2l-research')
    expect(report).not.toMatch(/identity    : Chrome\//)
  })
})

describe('buildChannels', () => {
  it('standard mode builds exactly the two local rungs, no vendors', () => {
    const channels = buildChannels('standard')
    expect(channels.map((c) => c.id)).toEqual(['http', 'browser_local'])
    expect(channels.every((c) => c.vendorId === undefined)).toBe(true)
  })

  it('research mode without a vendor key still builds only local rungs — the vendor rung does not exist', () => {
    const channels = buildChannels('research')
    expect(channels.map((c) => c.id)).toEqual(['http', 'browser_local'])
  })

  it('declares the preview product token on the local rungs only when asked, and only in standard mode', () => {
    const standard = modeIdentity('standard').userAgent
    expect(buildChannels('standard').map((c) => c.identity?.userAgent)).toEqual([standard, standard])
    const preview = buildChannels('standard', { previewProductToken: true })
    expect(preview.map((c) => c.identity?.userAgent)).toEqual([`${standard} ${PREVIEW_PRODUCT_TOKEN}`, `${standard} ${PREVIEW_PRODUCT_TOKEN}`])
    for (const mode of ['research', 'authed'] as const) {
      expect(() => buildChannels(mode, { previewProductToken: true }), mode).toThrow(/standard mode/)
    }
  })

  it('every channel exposes close() so the owner can release resources', () => {
    const channels = buildChannels('standard')
    for (const c of channels) expect(typeof c.close).toBe('function')
  })

  it('vendor connection is lazy: nothing connects while channels are built', () => {
    const connected: string[] = []
    const channels = buildChannels('research', { onVendorConnect: (id) => connected.push(id) })
    // Building the channels (which would create paid sessions in the eager
    // design) must not touch the vendor.
    expect(connected).toEqual([])
    expect(channels.map((c) => c.id)).toEqual(['http', 'browser_local'])
  })
})

// --- lazy vendor connection -------------------------------------------------

function fakeBrowser(): CdpBrowser {
  const page = {
    async goto() {
      return {
        status: () => 200,
        headers: () => ({ 'Content-Type': 'text/html' }),
        request: () => ({ headers: () => ({ 'User-Agent': 'TestUA/1.0' }) }),
      }
    },
    async evaluate(expression: string) {
      return expression === 'navigator.userAgent' ? 'TestUA/1.0' : null
    },
    async waitForTimeout() {},
    async content() {
      return (
        '<html><body><article><h1>Rendered by vendor</h1>' +
        '<p>The vendor browser executed the page script and this paragraph is the ' +
        'proof that a rendered document, not a shell, came back from the fetch.</p>' +
        '</article></body></html>'
      )
    },
    url: () => 'about:blank',
    async close() {},
  }
  const context = {
    pages: () => [],
    newPage: async () => page,
  }
  return {
    contexts: () => [context],
    async close() {},
  }
}

function fakeVendorOps(
  vendorId: string,
  onCreate: (resume: unknown) => void,
  opts: {
    persist?: boolean
    onEnsure?: () => void
    onRelease?: () => void
    savedResume?: { browserbaseContextId: string } | { steelProfileId: string }
  } = {},
): VendorOps {
  return {
    vendorId,
    secrets: [],
    decision: evaluateVendorPolicy([
      { capability: 'headless_browser', vendorDefaultOn: true, enableKey: null },
      { capability: 'datacenter_proxy', vendorDefaultOn: true, enableKey: null },
      { capability: 'captcha_solving', vendorDefaultOn: true, enableKey: 'captcha_solving' },
    ]),
    async ensurePersistence() {
      opts.onEnsure?.()
      return opts.persist === true ? { browserbaseContextId: 'ctx-from-ensure' } : null
    },
    async createSession(resume?: unknown, deadlineMs?: number): Promise<VendorSession> {
      void deadlineMs
      onCreate(resume ?? null)
      const contextId = (resume as { browserbaseContextId?: string } | null)?.browserbaseContextId
      const profileId = (resume as { steelProfileId?: string } | null)?.steelProfileId
      return {
        sessionId: 'fake-1',
        connectUrl: 'wss://fake.example/session',
        handoffUrl: null,
        resumeContext:
          contextId !== undefined && contextId !== null
            ? { browserbaseContextId: contextId }
            : profileId !== undefined && profileId !== null
              ? { steelProfileId: profileId }
              : null,
      }
    },
    async releaseSession() { opts.onRelease?.() },
  }
}

describe('lazy vendor connection', () => {
  it('does not create a vendor session while channels are built, only when the provider rung runs', async () => {
    const created: string[] = []
    const connected: string[] = []
    const channels = buildChannels('research', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: fakeVendorOps('steel', () => created.push('steel')) },
      onVendorConnect: (id) => connected.push(id),
      vendorConnector: async () => fakeBrowser(),
      robotsFetcher: async () => ({
        text: 'User-agent: *\nDisallow:\n',
        status: 200,
        contentType: 'text/plain',
      }),
    })

    // Build time: zero vendor activity. The paid session must not exist yet.
    expect(created).toEqual([])
    expect(connected).toEqual([])

    const provider = channels.find((c) => c.vendorId === 'steel')!
    const result = await provider.fetch('https://example.com/p')

    // Fetch time: exactly one connection, and only now.
    expect(created).toEqual(['steel'])
    expect(connected).toEqual(['steel'])
    expect(result.status).toBe('success')

    // The session is reused on the second fetch — still exactly one session.
    await provider.fetch('https://example.com/p')
    expect(created).toEqual(['steel'])

    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('a URL governance refuses never reaches the vendor — zero vendor API calls', async () => {
    const created: string[] = []
    const channels = buildChannels('research', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: fakeVendorOps('steel', () => created.push('steel')) },
      vendorConnector: async () => fakeBrowser(),
      robotsFetcher: async () => ({ text: 'User-agent: *\nDisallow:\n', status: 200, contentType: 'text/plain' }),
    })
    const runner = new LadderRunner(channels, {
      mode: 'research',
      allowlistedDomains: ['allowed.example'],
    })
    const run = await runner.run('https://blocked.example/p')
    expect(run.result.failureReason).toBe('policy_denied')
    expect(run.channelsTried).toEqual([])
    expect(created).toEqual([])
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('a run that set a robots.txt rule aside under a recorded override never opens a vendor session', async () => {
    const url = 'https://example.com/p'
    // A local rung that sets the rule aside, says so, and is then blocked by a bot gate: without the override the ladder would go on to the vendor.
    const blockedUnderOverride = (lane: 'http' | 'browser_local') => ({
      fetch: async (_url: string, _deadlineAt?: number, _signal?: AbortSignal, execution?: ExecutionContext): Promise<FetchResult> => {
        const trace: TraceEvent[] = ['robots_checked', 'robots_disallowed', 'robots_overridden'].map((event) => ({ at: 1, lane, event }))
        const warning = { code: 'robots_overridden', message: 'https://example.com/robots.txt disallows this URL (rule /); it was fetched under an override recorded: publisher link' }
        execution?.onRobotsOverride?.({ trace, warning })
        return { ...(await failingSubject('connection_error').fetch()), status: 'blocked', failureReason: null, blockReason: 'cloudflare_challenge', lane, escalations: [], trace, warnings: [warning] }
      },
    })
    const created: string[] = []
    const channels = buildChannels('research', {
      localSubjects: { http: blockedUnderOverride('http'), browser_local: blockedUnderOverride('browser_local') },
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: fakeVendorOps('steel', () => created.push('steel')) },
      vendorConnector: async () => fakeBrowser(),
      robotsFetcher: async () => ({ text: 'User-agent: *\nDisallow: /\n', status: 200, contentType: 'text/plain' }),
    })
    const run = await new LadderRunner(channels, { mode: 'research' }, new MemoryRoutingHistory()).run(url, undefined, {}, { robotsOverride: { reason: 'publisher link' } })
    expect(run.channelsTried).toEqual(['http', 'browser_local'])
    expect(created).toEqual([])
    // The answer is the last local rung's, with the override on it; the vendor's refusal never replaces it.
    expect(run.result).toMatchObject({ status: 'blocked', lane: 'browser_local', warnings: [{ code: 'robots_overridden' }] })
    expect(run.ladderTrace).toContainEqual(expect.objectContaining({ event: 'ladder_channel_skipped', channel: 'provider' }))
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('first-use persistence: ensurePersistence runs BEFORE the first session, which receives the contextId', async () => {
    const createdResumes: unknown[] = []
    const channels = buildChannels('research', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: {
        steel: fakeVendorOps('steel', (resume) => createdResumes.push(resume), { persist: true }),
      },
      vendorConnector: async () => fakeBrowser(),
      robotsFetcher: async () => ({ text: 'User-agent: *\nDisallow:\n', status: 200, contentType: 'text/plain' }),
    })
    const provider = channels.find((c) => c.vendorId === 'steel')!
    const result = await provider.fetch('https://example.com/p')

    // The FIRST createSession already carries the context the gate was
    // evaluated for — never a second session created after the fact.
    expect(createdResumes[0]).toEqual({ browserbaseContextId: 'ctx-from-ensure' })
    expect(result.status).toBe('success')
    expect(result.resumeContext).toEqual({ browserbaseContextId: 'ctx-from-ensure' })
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('the test ops withhold captcha solving: the ladder passes no grant', () => {
    const ops = fakeVendorOps('browserbase', () => {})
    expect(ops.decision.withheld).toContain('captcha_solving')
    expect(ops.decision.enabled.map((c) => c.capability)).not.toContain('captcha_solving')
  })
})

describe('authed_session rung (real BrowserLocalSubject)', () => {
  it('the real browser sends the session cookies restored from the snapshot', async () => {
    const channels = buildChannels('authed')
    const authed = channels.find((c) => c.id === 'authed_session')!
    expect(authed).toBeDefined()

    const host = new URL(authBase).hostname
    const snapshot: SessionSnapshot = {
      domain: host,
      attestedBy: 'operator@example.com',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browser_local_authed',
      principal: 'operator@example.com',
      statement: 'I authorize fetches under this session for this domain.',
      cookies: [{ name: 'sid', value: 'secret-value', domain: host, path: '/' }],
      // A Playwright storageState blob carrying a second cookie: the real
      // context creation must restore it alongside the explicit cookies.
      storageState: JSON.stringify({
        cookies: [{ name: 'ss-cookie', value: 'from-storage-state', domain: host, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
        origins: [],
      }),
    }

    try {
      const result = await authed.fetch(`${authBase}/echo-cookie`, snapshot)
      expect(result.status).toBe('success')
      expect(result.markdown).toContain('sid=secret-value')
      expect(result.markdown).toContain('ss-cookie=from-storage-state')
    } finally {
      await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
    }
  })

  it('a snapshot scoped to another domain is audited and skipped, not misapplied', async () => {
    const channels = buildChannels('authed')
    const authed = channels.find((c) => c.id === 'authed_session')!
    const snapshot: SessionSnapshot = {
      domain: 'other.example',
      attestedBy: 'operator@example.com',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browser_local_authed',
      cookies: [{ name: 'sid', value: 'secret-value', domain: 'other.example', path: '/' }],
    }
    try {
      const result = await authed.fetch(`${authBase}/echo-cookie`, snapshot)
      // Skip, not a throw: the ladder moves on to the next rung.
      expect(result.status).toBe('failed')
      expect(result.failureReason).toBe('policy_denied')
      expect(result.trace.some((t) => t.event === 'authed_session_skipped')).toBe(true)
      expect(result.escalations.some((e) => e.trigger === 'session_unavailable')).toBe(true)
    } finally {
      await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
    }
  })

  it('a vendor resume handed to the authed rung is audited and skipped, not misapplied', async () => {
    const channels = buildChannels('authed')
    const authed = channels.find((c) => c.id === 'authed_session')!
    const snapshot: SessionSnapshot = {
      domain: new URL(authBase).hostname,
      attestedBy: 'operator@example.com',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'steel',
      resume: { steelProfileId: 'prof-1' },
    }
    try {
      const result = await authed.fetch(`${authBase}/echo-cookie`, snapshot)
      expect(result.status).toBe('failed')
      expect(result.trace.some((t) => t.event === 'authed_session_skipped')).toBe(true)
      expect(result.trace.find((t) => t.event === 'authed_session_skipped')!.detail).toMatchObject({
        reason: 'session_does_not_apply',
        sessionVendor: 'steel',
      })
    } finally {
      await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
    }
  })
})

// --- composition: buildChannels + LadderRunner with session semantics -------

function failingSubject(reason: FetchResult['failureReason']): {
  fetch: () => Promise<FetchResult>
  teardown: () => Promise<void>
} {
  return {
    fetch: async () => ({
      requestedUrl: 'https://example.com/p',
      status: 'failed',
      failureReason: reason,
      blockReason: null,
      budgetExceeded: null,
      lane: 'http',
      // Like the real resilientHttp subject: an unresolved escalation is the
      // subject asking the ladder to keep going.
      escalations: [{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }],
      handoff: null,
      markdown: null,
      truncated: false,
      truncatedAt: null,
      compliance: null,
      evidence: { finalUrl: 'https://example.com/p', httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
      usage: { wallMs: 1, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, contentTokens: null, browserMs: 0, externalCostUsd: null },
      trace: [],
    }),
    teardown: async () => {},
  }
}

describe('buildChannels + LadderRunner session composition', () => {
  const vendorEnv = () => ({
    vendorConnector: async () => fakeBrowser(),
    robotsFetcher: async () => ({ text: 'User-agent: *\nDisallow:\n', status: 200, contentType: 'text/plain' }),
  })

  it('empty session store: authed_session skips and the vendor rung wins', async () => {
    const created: string[] = []
    const channels = buildChannels('authed', {
      localSubjects: { http: failingSubject('empty_unverified'), browser_local: failingSubject('empty_unverified') },
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: fakeVendorOps('steel', () => created.push('steel')) },
      vendorTariffs: { steel: { perCallUsd: 0, perHourUsd: 0, maxSessionMs: null, minBilledMs: 0, billingIncrementMs: 1 } },
      ...vendorEnv(),
    })
    const runner = new LadderRunner(channels, { mode: 'authed' }, new MemoryRoutingHistory(), null, new MemorySessionStore())
    const run = await runner.run('https://example.com/p')

    // The authed rung had no local session: it must decline and let the
    // ladder continue to the provider — never a terminal policy_denied.
    expect(run.channelsTried).toContain('authed_session')
    expect(run.result.status).toBe('success')
    expect(run.result.lane).toBe('provider')
    expect(created).toEqual(['steel'])
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('under a tariff a provider call holds a session of its own, released when the call ends, at the tariff\'s ceiling (ROADMAP PA item 4)', async () => {
    let created = 0
    let released = 0
    const build = (tariffs?: Record<string, import('@w2l/http-core').VendorTariff>) => buildChannels('authed', {
      localSubjects: { http: failingSubject('empty_unverified'), browser_local: failingSubject('empty_unverified') },
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: fakeVendorOps('steel', () => { created++ }, { onRelease: () => { released++ } }) },
      ...(tariffs === undefined ? {} : { vendorTariffs: tariffs }),
      ...vendorEnv(),
    })
    const channels = build({ steel: { perCallUsd: 0.01, perHourUsd: 0.12, maxSessionMs: 60_000, minBilledMs: 0, billingIncrementMs: 1 } })
    const provider = channels.find((c) => c.vendorId === 'steel')!
    expect(provider.priceCeilingUsd).toBeCloseTo(0.01 + 0.002)
    const runner = new LadderRunner(channels, { mode: 'authed' }, new MemoryRoutingHistory(), null, new MemorySessionStore())
    expect((await runner.run('https://example.com/p')).result.lane).toBe('provider')
    expect((await runner.run('https://example.com/q')).result.lane).toBe('provider')
    // Each call opened its own session and released it: no session idles, billing, between calls.
    expect(created).toBe(2)
    expect(released).toBe(2)
    // Concurrent calls each open and release a session of their own: none closes another's, none is left open.
    const both = await Promise.all([provider.fetch('https://example.com/a'), provider.fetch('https://example.com/b')])
    expect(both.map((r) => r.status)).toEqual(['success', 'success'])
    expect(created).toBe(4)
    expect(released).toBe(4)
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
    // Without a tariff the rung has no ceiling, and the ladder does not call it.
    const unpriced = build()
    expect(unpriced.find((c) => c.vendorId === 'steel')!.priceCeilingUsd).toBeNull()
    const run = await new LadderRunner(unpriced, { mode: 'authed' }, new MemoryRoutingHistory(), null, new MemorySessionStore()).run('https://example.com/p')
    expect(run.result.lane).not.toBe('provider')
    await Promise.all(unpriced.map((c) => c.close?.().catch(() => {})))
  })

  it('answers a vendor that cannot open a session as the provider\'s failure, not a thrown error, and keeps its paid call (ROADMAP PA item 4)', async () => {
    // The PA 4 Steel runs: Steel's session create hung past the vendor API's 30 s cap, the error escaped the rung,
    // and the API answered 500 at about 32 s with no record of the page or the call.
    const hung = (): VendorOps => ({
      ...fakeVendorOps('steel', () => {}),
      secrets: ['steel-key-123'],
      async createSession() { throw new Error('steel: session create at wss://connect.steel.dev?apiKey=steel-key-123: This operation was aborted') },
    })
    const channels = buildChannels('authed', {
      localSubjects: { http: failingSubject('empty_unverified'), browser_local: failingSubject('empty_unverified') },
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: hung() },
      vendorTariffs: { steel: { perCallUsd: 0.01, perHourUsd: 0.12, maxSessionMs: 60_000, minBilledMs: 0, billingIncrementMs: 1 } },
      ...vendorEnv(),
    })
    const provider = channels.find((c) => c.vendorId === 'steel')!
    const direct = await provider.fetch('https://example.com/p')
    expect(direct).toMatchObject({ status: 'failed', failureReason: 'provider_error', lane: 'provider', markdown: null })
    // The vendor's key, which its connect URL carries, never reaches the record.
    expect(direct.trace.find((e) => e.event === 'provider_failed')?.detail).toEqual({ error: 'steel: session create at wss://connect.steel.dev?apiKey=<redacted>: This operation was aborted' })
    const run = await new LadderRunner(channels, { mode: 'authed' }, new MemoryRoutingHistory(), null, new MemorySessionStore()).run('https://example.com/p')
    expect(run.channelsTried).toContain('provider')
    expect(run.result).toMatchObject({ status: 'failed', failureReason: 'provider_error', lane: 'provider' })
    // The call is on the record, charged at its ceiling: the session create may have reached the vendor and opened a
    // session that bills, though no id came back.
    expect(run.result.trace.find((e) => e.event === 'paid_calls')?.detail).toMatchObject({ calls: [{ provider: 'steel', outcome: 'failed', reason: 'provider_error', chargedUsd: 0.012, ceilingUsd: 0.012 }] })
    // So is a vendor whose profile setup fails before any session, its key kept out as well.
    const unready = buildChannels('authed', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: { ...hung(), async ensurePersistence() { throw new Error('steel: profile setup with key steel-key-123 returned 503') } } },
      vendorTariffs: { steel: { perCallUsd: 0.01, perHourUsd: 0.12, maxSessionMs: 60_000, minBilledMs: 0, billingIncrementMs: 1 } },
      ...vendorEnv(),
    })
    const setup = await unready.find((c) => c.vendorId === 'steel')!.fetch('https://example.com/p')
    expect(setup).toMatchObject({ status: 'failed', failureReason: 'provider_error' })
    expect(setup.trace.find((e) => e.event === 'provider_failed')?.detail).toEqual({ error: 'steel: profile setup with key <redacted> returned 503' })
    await Promise.all(unready.map((c) => c.close?.().catch(() => {})))
    // A CDP connect, or a robots.txt fetch, that runs out the session's time before the request's own is the
    // provider's timeout, not an error: the session's time is the tariff's, not the request's.
    const capped = (connector: typeof vendorEnv extends () => infer E ? E extends { vendorConnector: infer C } ? C : never : never, robotsFetcher?: () => Promise<never>, maxSessionMs = 300) => buildChannels('authed', {
      localSubjects: { http: failingSubject('empty_unverified'), browser_local: failingSubject('empty_unverified') },
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { steel: fakeVendorOps('steel', () => {}) },
      vendorTariffs: { steel: { perCallUsd: 0.01, perHourUsd: 0.12, maxSessionMs, minBilledMs: 0, billingIncrementMs: 1 } },
      ...vendorEnv(),
      vendorConnector: connector,
      ...(robotsFetcher === undefined ? {} : { robotsFetcher }),
    })
    // As Playwright's connectOverCDP does: it gives up at the deadline it was handed.
    const hangingConnect = async (_url: string, deadlineMs?: number) => await new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('browserType.connectOverCDP: Timeout exceeded')), Math.max(1, (deadlineMs ?? Date.now()) - Date.now())))
    for (const [label, channelsFor] of [
      ['connect', () => capped(hangingConnect)],
      ['robots.txt', () => capped(async () => fakeBrowser(), () => new Promise<never>(() => {}))],
    ] as const) {
      const set = channelsFor()
      const result = await set.find((c) => c.vendorId === 'steel')!.fetch('https://example.com/p', null, { deadlineAt: Date.now() + 10_000 })
      expect(result, label).toMatchObject({ status: 'failed', failureReason: 'timeout', lane: 'provider' })
      expect(result.trace.some((e) => e.event === 'provider_failed'), label).toBe(true)
      await Promise.all(set.map((c) => c.close?.().catch(() => {})))
    }
    // Any other error during the fetch is not the rung's to hide: it still throws.
    const broken = capped(async () => fakeBrowser(), () => Promise.reject(new Error('robots fetcher bug')), 60_000)
    await expect(broken.find((c) => c.vendorId === 'steel')!.fetch('https://example.com/p', null, { deadlineAt: Date.now() + 10_000 })).rejects.toThrow('robots fetcher bug')
    await Promise.all(broken.map((c) => c.close?.().catch(() => {})))
    // The request's own deadline ending first is the ladder's: the rung throws, and the run answers its deadline outcome.
    const late = capped(hangingConnect, undefined, 60_000)
    await expect(late.find((c) => c.vendorId === 'steel')!.fetch('https://example.com/p', null, { deadlineAt: Date.now() + 200 })).rejects.toThrow()
    const ended = await new LadderRunner(late, { mode: 'authed' }, new MemoryRoutingHistory(), null, new MemorySessionStore()).run('https://example.com/p', null, { deadlineAt: Date.now() + 300 })
    expect(ended.result).toMatchObject({ status: 'failed', failureReason: 'timeout' })
    await Promise.all(late.map((c) => c.close?.().catch(() => {})))
    // A cancelled call is still the ladder's to report as such.
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(provider.fetch('https://example.com/p', null, { signal: cancelled.signal })).rejects.toThrow()
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

    it('a saved Browserbase context is injected into the FIRST session; ensurePersistence is skipped', async () => {
    const resumes: unknown[] = []
    let ensureCalls = 0
    const channels = buildChannels('research', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: {
        browserbase: fakeVendorOps('browserbase', (r) => resumes.push(r), { onEnsure: () => ensureCalls++ }),
      },
      ...vendorEnv(),
    })
    const provider = channels.find((c) => c.vendorId === 'browserbase')!
    const snapshot: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'operator',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'browserbase',
      resume: { browserbaseContextId: 'saved-ctx-9' },
    }
    const result = await provider.fetch('https://example.com/p', snapshot)

    expect(result.status).toBe('success')
    // The saved context, not a fresh one from ensurePersistence.
    expect(resumes[0]).toEqual({ browserbaseContextId: 'saved-ctx-9' })
    expect(ensureCalls).toBe(0)
    expect(result.resumeContext).toEqual({ browserbaseContextId: 'saved-ctx-9' })
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('a saved Steel profile is injected into the FIRST session; ensurePersistence is skipped', async () => {
    const resumes: unknown[] = []
    let ensureCalls = 0
    const channels = buildChannels('research', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: {
        steel: fakeVendorOps('steel', (r) => resumes.push(r), { onEnsure: () => ensureCalls++ }),
      },
      ...vendorEnv(),
    })
    const provider = channels.find((c) => c.vendorId === 'steel')!
    const snapshot: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'operator',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'steel',
      resume: { steelProfileId: 'saved-prof-7' },
    }
    const result = await provider.fetch('https://example.com/p', snapshot)

    expect(result.status).toBe('success')
    expect(resumes[0]).toEqual({ steelProfileId: 'saved-prof-7' })
    expect(ensureCalls).toBe(0)
    expect(result.resumeContext).toEqual({ steelProfileId: 'saved-prof-7' })
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('no saved resume: ensurePersistence runs and its context reaches the FIRST session', async () => {
    const resumes: unknown[] = []
    let ensureCalls = 0
    const channels = buildChannels('research', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: {
        browserbase: fakeVendorOps('browserbase', (r) => resumes.push(r), { persist: true, onEnsure: () => ensureCalls++ }),
      },
      ...vendorEnv(),
    })
    const provider = channels.find((c) => c.vendorId === 'browserbase')!
    const result = await provider.fetch('https://example.com/p')

    expect(result.status).toBe('success')
    expect(ensureCalls).toBe(1)
    expect(resumes[0]).toEqual({ browserbaseContextId: 'ctx-from-ensure' })
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })

  it('a Steel snapshot handed to the Browserbase channel is audited and skipped', async () => {
    const created: string[] = []
    const channels = buildChannels('research', {
      vendorPolicy: { authorized: ['vendor_remote_browser'] },
      vendorOps: { browserbase: fakeVendorOps('browserbase', () => created.push('browserbase')) },
      ...vendorEnv(),
    })
    const provider = channels.find((c) => c.vendorId === 'browserbase')!
    const snapshot: SessionSnapshot = {
      domain: 'example.com',
      attestedBy: 'operator',
      attestedAt: '2026-08-22T00:00:00.000Z',
      vendor: 'steel',
      resume: { steelProfileId: 'prof-1' },
    }
    const result = await provider.fetch('https://example.com/p', snapshot)

    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('policy_denied')
    expect(result.trace.some((t) => t.event === 'session_vendor_mismatch')).toBe(true)
    expect(result.escalations.some((e) => e.trigger === 'session_not_for_this_vendor')).toBe(true)
    // The mismatched snapshot never created a session.
    expect(created).toEqual([])
    await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
  })
})
