import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostedNetworkPolicy, type FetchResult } from '@w2l/contracts'
import type { HostedChromeOperator } from '@w2l/api'
import { createHostedApi, keyDigest, MemoryHostedKeys, MemoryHostedQuota } from '../src/hostedApi.js'
import { MemoryCreditsStore } from '../src/hostedCredits.js'
import { MemoryHostedAccess } from '../src/hostedAccess.js'
import { MemoryHostedJobStore } from '../src/hostedJobs.js'
import { HostedChromeCounter, MemoryHostedChromeSpend } from '../src/hostedChromeMeter.js'

// The hosted gate with hosted_chrome's operator config (ADR 0005, revision of 2026-10-27, decision two): `access:
// "enhanced"` is taken only from a call the account switch admits, and refused for any other; the rung is used after the
// rungs before it were blocked, and counted for its account, and a call the counter turns away gets the earlier page. The octocrawl-chrome
// service is a stand-in that answers the article; the rungs before it run for real (HTTP, then Playwright's Chromium).

const HASH_KEY = 'h'.repeat(40)
const ARTICLE = `<!doctype html><title>Tide tables</title><main><h1>Tide tables</h1>${'<p>The harbour office records tide height for every hour of the day.</p>'.repeat(6)}</main>`
const CHALLENGE = '<!doctype html><html><head><title>Just a moment...</title></head><body><h1>Just a moment...</h1><p>Enable JavaScript and cookies to continue.</p></body></html>'

let site: Server
let origin = ''
beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    if (req.url === '/challenge') return void res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', 'cf-mitigated': 'challenge' }).end(CHALLENGE)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE)
  })
  site.listen(0, '127.0.0.1'); await once(site, 'listening')
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => {
  site.closeAllConnections()
  await new Promise<void>((resolve) => site.close(() => resolve()))
})

/** What the stand-in service answers: the article, read in its Chrome. */
const served = (url: string): FetchResult => ({
  requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'browser_local', escalations: [], handoff: null,
  markdown: '# Tide tables', truncated: false, truncatedAt: null, compliance: null,
  evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
  usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 4, browserMs: 5, externalCostUsd: 0 },
  trace: [{ at: 0, lane: 'browser_local', event: 'identity_sent', detail: {} }, { at: 0, lane: 'browser_local', event: 'browser_engine', detail: { engine: 'hosted_chrome', version: '155.0.8059.79', flags: 'test' } }, { at: 0, lane: 'browser_local', event: 'egress_kind', detail: { kind: 'datacenter' } }],
})

describe('the hosted gate with hosted_chrome\'s operator config', () => {
  it('takes access enhanced from the account the switch lists, uses the rung and counts it; refuses it for every other call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octocrawl-hosted-chrome-gate-'))
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const asked: string[] = []
    const quota = new MemoryHostedQuota()
    const spend = new MemoryHostedChromeSpend()
    // Howard's values of 2026-10-29: one account, $20 a month, 20 attempts a day.
    const settings = new MemoryHostedAccess({ compatibleTransport: { enabled: false, allowedUids: null }, hostedChrome: { enabled: true, allowedUids: ['account-1'], monthlyCapUsd: 20, dailyAttemptsPerAccount: 20 } })
    const hostedChrome: HostedChromeOperator = {
      attestation: { principal: 'operator', at: '2026-10-29T00:00:00Z', statement: 'test' },
      client: { fetch: async (url) => { asked.push(new URL(url).pathname); return served(url) } },
      meter: new HostedChromeCounter({ settings, spend, quota, egress: { vendor: 'webshare', tariff: { perIpMonthUsd: 0.0299, rentedIps: 100 } }, log: () => {} }),
    }
    const keys = new MemoryHostedKeys(new Map([
      [keyDigest(HASH_KEY, 'oc_one'), { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' }],
      [keyDigest(HASH_KEY, 'oc_two'), { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-2' }],
    ]))
    const credits = new MemoryCreditsStore(1_000)
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys, quota, credits, access: settings, hostedChrome, keylessDaily: 5, siteDaily: 100,
      jobs: { store: new MemoryHostedJobStore(), files: { segment: async () => null, exportUrl: async (job) => `https://storage.example/${job.id}` }, enqueueSlice: async () => {} },
      networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'], perHostMinDelayMs: 0 }, log: () => {},
    })
    if (!service.server.listening) await once(service.server, 'listening')
    const scrape = (body: Record<string, unknown>, key?: string) => fetch(`http://127.0.0.1:${port}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key === undefined ? {} : { authorization: `Bearer ${key}` }) }, body: JSON.stringify({ debug: true, ...body }) })
    type Read = { status: string; channelsTried: string[]; markdown: string | null; evidenceRecord: { access: { route: string | null; egress: { kind: string | null } | null } | null } }
    try {
      const one = await scrape({ url: `${origin}/challenge`, access: 'enhanced' }, 'oc_one')
      expect(one.status).toBe(200)
      const read = await one.json() as Read
      expect(read.channelsTried).toEqual(['http', 'browser_local', 'hosted_chrome'])
      expect(read).toMatchObject({ status: 'success', markdown: expect.stringContaining('Tide tables'), evidenceRecord: { access: { route: 'hosted_chrome', egress: { kind: 'datacenter' } } } })
      expect(asked).toEqual(['/challenge'])
      // Counted for the account (D5): one attempt of the day, and the read settled in the month at $0 a read (rent only).
      expect([...quota.counts].filter(([id]) => id.includes('-hostedChrome-'))).toEqual([[`${new Date().toISOString().slice(0, 10)}-hostedChrome-account-1`, 1]])
      expect([...spend.months.values()]).toEqual([{ settledMicroUsd: 0, calls: 1 }])
      // A browser page's price, as any page the browser lane answers.
      expect(one.headers.get('x-credits-used')).toBe('5')

      // An account the switch does not list, and a caller without one: refused as a deploy without the rung refuses it,
      // with nothing read and nothing charged; access standard reads as before.
      for (const key of ['oc_two', undefined]) {
        const other = await scrape({ url: `${origin}/challenge`, access: 'enhanced' }, key)
        expect([key, other.status]).toEqual([key, 400])
        expect(await other.json()).toMatchObject({ code: 'unsupported_parameter', error: expect.stringContaining('hosted_chrome is not switched on for this caller') })
        const standard = await scrape({ url: `${origin}/challenge` }, key)
        const page = await standard.json() as Read
        expect([key, page.status, page.channelsTried.includes('hosted_chrome')]).toEqual([key, 'blocked', false])
        // The refused call took none of the account's credits: only this page's.
        if (key !== undefined) expect(standard.headers.get('x-credits-remaining')).toBe(String(1_000 - Number(standard.headers.get('x-credits-used'))))
      }
      // The listed account, once its day's attempts are used up: the earlier rungs' page, with the counter's warning.
      quota.counts.set(`${new Date().toISOString().slice(0, 10)}-hostedChrome-account-1`, 20)
      const spent = await (await scrape({ url: `${origin}/challenge`, access: 'enhanced' }, 'oc_one')).json() as Read & { warnings?: { code: string }[] }
      expect([spent.status, spent.channelsTried.includes('hosted_chrome'), spent.warnings?.map((warning) => warning.code)]).toEqual(['blocked', false, ['hosted_chrome_not_admitted']])
      quota.counts.set(`${new Date().toISOString().slice(0, 10)}-hostedChrome-account-1`, 1)
      // A page the rungs before it read is not sent on, for the listed account either.
      expect(((await (await scrape({ url: `${origin}/article`, access: 'enhanced' }, 'oc_one')).json()) as Read).channelsTried).toEqual(['http'])
      expect(asked).toEqual(['/challenge'])
      // A batch that chose access enhanced starts: the start is checked on an engine with the same config as the worker's.
      const batch = await fetch(`http://127.0.0.1:${port}/v1/batches`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer oc_one' }, body: JSON.stringify({ urls: [`${origin}/challenge`], access: 'enhanced' }) })
      expect(batch.status).toBe(202)
      const refusedBatch = await fetch(`http://127.0.0.1:${port}/v1/batches`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer oc_two' }, body: JSON.stringify({ urls: [`${origin}/challenge`], access: 'enhanced' }) })
      expect([refusedBatch.status, ((await refusedBatch.json()) as { error: string }).error]).toEqual([400, 'hosted batch jobs do not take access'])
    } finally {
      await service.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
