import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostedNetworkPolicy, identityBundleFrom, modeIdentity, parseScrapeRequest, type FetchResult } from '@w2l/contracts'
import type { Channel } from '@w2l/bench'
import { createApiEngine, type ApiEngine, type BrowserTurn } from '../src/engine.js'

// A call's turn on the browser lane (ScrapeContext.browserTurn): asked only when a rung that runs a browser is about to
// start, so a page HTTP reads asks for none, and refused, what the rungs before it read stands and says why.

const URL_ = 'https://shop.test/item'
const PROSE = 'The harbour office records tide height every hour of the day. '.repeat(30)
const page = (url: string, lane: FetchResult['lane']): FetchResult => ({
  requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane,
  escalations: [], handoff: null, markdown: `# Tides\n\n${PROSE}`, truncated: false, truncatedAt: null, compliance: null,
  evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
  usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 400, browserMs: 0, externalCostUsd: 0 },
  trace: [],
})
const stopped = (url: string, lane: FetchResult['lane']): FetchResult => ({ ...page(url, lane), status: 'blocked', blockReason: 'cloudflare_challenge', markdown: null })

const REFUSED: BrowserTurn = { ok: false, code: 'browser_busy', retryAfterSeconds: 3, message: 'another scrape holds the browser lane', hints: ['one', 'two'] }

describe('a call\'s browser turn', () => {
  let engine: ApiEngine | undefined
  let root: string | undefined
  const seen: string[] = []
  afterEach(async () => { await engine?.close(); engine = undefined; if (root) await rm(root, { recursive: true, force: true }); root = undefined; seen.length = 0 })

  async function setup(http: (url: string) => FetchResult, browserOwn: Pick<Channel, 'admit'> = {}) {
    root = await mkdtemp(join(tmpdir(), 'w2l-browser-turn-'))
    const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => { seen.push('http'); return http(url) } },
      { id: 'browser_local', identity: identityBundleFrom(modeIdentity(mode)), waitsFor: true, ...browserOwn, fetch: async (url) => { seen.push('browser'); return page(url, 'browser_local') } },
    ]
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor, networkPolicy: { ...hostedNetworkPolicy(), perHostMinDelayMs: 0 }, hosted: true })
  }
  const scrape = async (browserTurn: () => Promise<BrowserTurn>) => await engine!.scrape(parseScrapeRequest({ url: URL_, debug: true }), { browserTurn }) as unknown as { status: string; lane: string; channelsTried: string[]; warnings?: { code: string; message: string }[]; agentHints?: string[]; ladderTrace: { event: string; detail?: { reason?: string } }[] }

  it('is not asked for a page HTTP reads', async () => {
    await setup((url) => page(url, 'http'))
    let asked = 0
    const read = await scrape(async () => { asked += 1; return { ok: true } })
    expect(read).toMatchObject({ status: 'success', lane: 'http' })
    expect(asked).toBe(0)
  })

  it('is asked just before the browser rung, and admitted, the rung runs', async () => {
    await setup((url) => stopped(url, 'http'))
    const read = await scrape(async () => { seen.push('turn'); return { ok: true } })
    expect(seen).toEqual(['http', 'turn', 'browser'])
    expect(read).toMatchObject({ status: 'success', lane: 'browser_local' })
  })

  it('refused, leaves the rung out: what HTTP read stands, and the warning, the trace and the first hints say why', async () => {
    await setup((url) => stopped(url, 'http'))
    const read = await scrape(async () => REFUSED)
    expect(seen).toEqual(['http'])
    expect(read).toMatchObject({ status: 'blocked', lane: 'http' })
    expect(read.warnings).toContainEqual({ code: 'browser_busy', message: REFUSED.ok ? '' : REFUSED.message })
    expect(read.ladderTrace.some((event) => event.event === 'ladder_channel_skipped' && event.detail?.reason === 'browser_busy')).toBe(true)
    expect(read.agentHints?.slice(0, 2)).toEqual(['one', 'two'])
    expect(read.agentHints?.length).toBeLessThanOrEqual(5)
  })

  it('comes before a rung\'s own admission, which still answers and is settled', async () => {
    const settled: boolean[] = []
    await setup((url) => stopped(url, 'http'), { admit: async () => { seen.push('own'); return { ok: true, settle: async (_result, called) => { settled.push(called) } } } })
    await scrape(async () => { seen.push('turn'); return { ok: true } })
    expect(seen).toEqual(['http', 'turn', 'own', 'browser'])
    expect(settled).toEqual([true])
  })
})
