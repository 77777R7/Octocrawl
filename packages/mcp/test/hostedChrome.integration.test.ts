import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { hostedNetworkPolicy, identityBundleFrom, modeIdentity, parseScrapeRequest, type FetchResult, type NetworkPolicy } from '@w2l/contracts'
import { createApiEngine } from '@w2l/api'
import { HOSTED_CHROME_PROFILE_ID, type Channel } from '@w2l/bench'
import { toEvidenceRecord } from '@w2l/runtime'
import { createHostedChromeService, hostedChromeReader, httpHostedChromeClient, serveHostedChrome } from '../src/hostedChrome.js'
import { MemoryHostedAccess } from '../src/hostedAccess.js'
import { MemoryHostedQuota } from '../src/hostedApi.js'
import { HostedChromeCounter, MemoryHostedChromeSpend } from '../src/hostedChromeMeter.js'

// The octocrawl-chrome service end to end, on this machine (ADR 0005 hosted_chrome, revision of 2026-10-27): the hosted
// engine's rung asks the service over HTTP, the service reads the page in the browser lane on the hosted_chrome engine
// behind its address guard, and the record names the route, the launch and the exit's kind. Playwright's Chromium stands
// in for the pinned Google Chrome, headless because CI has no display, without the sandbox on a Linux CI runner.
const seams = { executable: chromium.executablePath(), headless: true, ...(process.platform === 'linux' ? { extraArgs: ['--no-sandbox'] } : {}) }

const ARTICLE = `<!doctype html><title>Tide tables</title><main><h1>Tide tables</h1>${'<p>The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year.</p>'.repeat(6)}</main>`
let site: Server
let origin = ''
const asked: string[] = []

beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url !== '/favicon.ico') asked.push(req.url ?? '')
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private\n')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE)
  })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => {
  site.closeAllConnections()
  await new Promise<void>((resolve) => site.close(() => resolve()))
})

/** The hosted policy with the test site's loopback address on the operator's list; every other private address refused. */
const policy: NetworkPolicy = { ...hostedNetworkPolicy(), origin: 'operator', privateAllowlist: ['127.0.0.1'], perHostMinDelayMs: 0 }

describe('hosted_chrome: the octocrawl-chrome service end to end', () => {
  it('reads a page the rungs before it could not, and its record says hosted_chrome, the launch and a google exit', async () => {
    const reader = hostedChromeReader(policy, 'google', seams)
    const served = await serveHostedChrome(createHostedChromeService(reader.read), 0)
    const root = await mkdtemp(join(tmpdir(), 'w2l-hosted-chrome-'))
    const blocked = (url: string, lane: FetchResult['lane']): FetchResult => ({
      requestedUrl: url, status: 'blocked', failureReason: null, blockReason: 'cloudflare_challenge', budgetExceeded: null, lane, escalations: [], handoff: null, markdown: null, truncated: false, truncatedAt: null, compliance: null,
      evidence: { finalUrl: url, httpStatus: 403, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
      usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 0, browserMs: 0, externalCostUsd: 0 }, trace: [],
    })
    const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => blocked(url, 'http') },
      { id: 'browser_local', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => blocked(url, 'browser_local') },
    ]
    const client = httpHostedChromeClient(`http://127.0.0.1:${served.port}`, async () => 'id-token-for-test')
    // The D5 counter, over Cloud Run's own egress: each read is counted for the account, at $0 to a third party.
    const spend = new MemoryHostedChromeSpend()
    const quota = new MemoryHostedQuota()
    const settings = new MemoryHostedAccess({ compatibleTransport: { enabled: false, allowedUids: null }, hostedChrome: { enabled: true, allowedUids: ['account-1'], monthlyCapUsd: 1, dailyAttemptsPerAccount: 5 } })
    const meter = new HostedChromeCounter({ settings, spend, quota, egress: null, log: () => {} })
    const engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor, networkPolicy: policy, hosted: true, callCapabilities: ['compatible_transport', 'hosted_chrome'],
      hostedChrome: { attestation: { principal: 'operator', at: '2026-10-28T00:00:00Z', statement: 'test' }, client, meter } })
    try {
      const read = await engine.scrape(parseScrapeRequest({ url: `${origin}/article`, access: 'enhanced', debug: true }), { capabilities: ['hosted_chrome'], account: 'account-1' }) as unknown as FetchResult & { channelsTried: string[]; evidenceRecord: ReturnType<typeof toEvidenceRecord> }
      expect(read.channelsTried).toEqual(['http', 'browser_local', 'hosted_chrome'])
      expect([...spend.months.values()]).toEqual([{ settledMicroUsd: 0, calls: 1 }])
      expect([...quota.counts.values()]).toEqual([1])
      expect(read.status).toBe('success')
      expect(read.markdown).toContain('Tide tables')
      expect(read.evidenceRecord.access).toMatchObject({ route: 'hosted_chrome', executor: 'chrome', profile: HOSTED_CHROME_PROFILE_ID, egress: { proxy: null, source: 'direct', kind: 'google' } })
      expect(read.evidenceRecord.access!.executorVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
      // The service read robots.txt and obeyed it, as every hosted rung does: a disallowed page is not opened.
      const before = asked.filter((path) => path === '/private').length
      const disallowed = await engine.scrape(parseScrapeRequest({ url: `${origin}/private`, access: 'enhanced' }), { capabilities: ['hosted_chrome'], account: 'account-1' }) as unknown as FetchResult
      expect(disallowed.status).not.toBe('success')
      expect(asked.filter((path) => path === '/private').length).toBe(before)
    } finally {
      await engine.close()
      await new Promise<void>((resolve) => served.server.close(() => resolve()))
      await reader.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 90_000)
})
