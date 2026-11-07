import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostedNetworkPolicy, identityBundleFrom, modeIdentity, parseBatchStartRequest, type FetchResult } from '@w2l/contracts'
import type { Channel, ChannelAdmission } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import { browserSlots, withBrowserSlots } from '../src/browserSlots.js'
import { createExecutionScope, raceWithSignal } from '@w2l/http-core'

// The pages a server renders at once (`browserPagesAtOnce`): HTTP pages flow on every worker, and a worker whose page
// needs the browser waits for one of the browser's slots. Hosted job slices read 8 pages at once and render 2.

const PROSE = 'The harbour office records tide height every hour of the day. '.repeat(30)
const page = (url: string, lane: FetchResult['lane']): FetchResult => ({
  requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane,
  escalations: [], handoff: null, markdown: `# Tides\n\n${PROSE}`, truncated: false, truncatedAt: null, compliance: null,
  evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
  usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 400, browserMs: 0, externalCostUsd: 0 },
  trace: [],
})
const stopped = (url: string, lane: FetchResult['lane']): FetchResult => ({ ...page(url, lane), status: 'blocked', blockReason: 'cloudflare_challenge', markdown: null })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('the pages a server renders at once', () => {
  let engine: ApiEngine | undefined
  let root: string | undefined
  afterEach(async () => { await engine?.close(); engine = undefined; if (root) await rm(root, { recursive: true, force: true }); root = undefined })

  /** Four hosts, four workers: every page is stopped over HTTP and read in the browser, which counts how many it renders at once. */
  async function run(browserPagesAtOnce: number | undefined) {
    root = await mkdtemp(join(tmpdir(), 'w2l-browser-slots-'))
    let inFlight = 0
    let most = 0
    const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => stopped(url, 'http') },
      { id: 'browser_local', identity: identityBundleFrom(modeIdentity(mode)), waitsFor: true, fetch: async (url) => { inFlight++; most = Math.max(most, inFlight); await sleep(40); inFlight--; return page(url, 'browser_local') } },
    ]
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor, networkPolicy: { ...hostedNetworkPolicy(), perHostMinDelayMs: 0 }, hosted: true, workerCount: 4, ...(browserPagesAtOnce === undefined ? {} : { browserPagesAtOnce }) })
    const urls = ['a', 'b', 'c', 'd'].map((host) => `https://${host}.test/item`)
    const { taskId } = await engine.startBatch(parseBatchStartRequest({ urls }))
    for (;;) { const status = await engine.getBatch(taskId); if (status?.status === 'completed' || status?.status === 'failed') break; await sleep(20) }
    const items = (await engine.getBatchItems(taskId, { limit: 10 }))!.items
    expect(items.map((item) => item.status)).toEqual(['success', 'success', 'success', 'success'])
    expect(items.map((item) => item.lane)).toEqual(['browser_local', 'browser_local', 'browser_local', 'browser_local'])
    return most
  }

  it('renders no more pages at once than browserPagesAtOnce says, on a batch that reads four at once', async () => {
    expect(await run(1)).toBe(1)
  })

  it('renders as many as the workers read when no cap is set', async () => {
    expect(await run(undefined)).toBeGreaterThan(1)
  })

  it('wraps the rungs that run a browser alone, gives a slot back when the rung\'s own admission refuses, and once the read is settled', async () => {
    const slots = browserSlots(1)
    const settles: Array<Array<unknown>> = []
    let refuse = false
    const identity = identityBundleFrom(modeIdentity('standard'))
    const [http, browser] = withBrowserSlots([
      { id: 'http', identity, fetch: async (url) => page(url, 'http') },
      { id: 'browser_local', identity, waitsFor: true, fetch: async (url) => page(url, 'browser_local'), admit: async (): Promise<ChannelAdmission> => refuse ? { ok: false, reason: 'own', warning: { code: 'hosted_chrome_not_admitted', message: 'own refusal' } } : { ok: true, settle: async (...args: unknown[]) => { settles.push(args) } } },
    ], slots)
    expect(http!.admit).toBeUndefined()
    const first = await browser!.admit!('https://a.test/', {})
    expect(first.ok).toBe(true)
    // The slot is held: a second admission waits until the first read is settled.
    const admitted = { second: false }
    const waiting = browser!.admit!('https://b.test/', {}).then((admission) => { admitted.second = true; return admission })
    await sleep(20)
    expect(admitted.second).toBe(false)
    if (first.ok) await first.settle(null, true)
    const second = await waiting
    expect(second).toMatchObject({ ok: true })
    expect(settles).toEqual([[null, true]])
    if (second.ok) await second.settle(null, false)
    // The rung's own refusal gives the slot back at once: the next admission does not wait.
    refuse = true
    expect(await browser!.admit!('https://c.test/', {})).toMatchObject({ ok: false, reason: 'own' })
    refuse = false
    expect(await browser!.admit!('https://d.test/', {})).toMatchObject({ ok: true })
  })

  it('holds the page\'s deadline while it waits for a slot and says how long it waited', async () => {
    const slots = browserSlots(1)
    const identity = identityBundleFrom(modeIdentity('standard'))
    const [browser] = withBrowserSlots([{ id: 'browser_local', identity, waitsFor: true, fetch: async (url) => page(url, 'browser_local') }], slots)
    const holds: string[] = []
    const execution = { holdDeadline: () => { holds.push('held'); return () => { holds.push('released'); return undefined } } }
    const first = await browser!.admit!('https://a.test/', execution)
    expect(first).toMatchObject({ ok: true, waitedMs: expect.any(Number) })
    expect(holds).toEqual(['held', 'released'])
    const waiting = browser!.admit!('https://b.test/', execution)
    await sleep(60)
    expect(holds).toEqual(['held', 'released', 'held'])
    if (first.ok) await first.settle(null, true)
    const second = await waiting
    expect(holds).toEqual(['held', 'released', 'held', 'released'])
    expect(second.ok && (second.waitedMs ?? 0) >= 50).toBe(true)
    if (second.ok) await second.settle(null, true)
  })

  it('a page queued behind slow renders keeps its whole timeout for its own read, and its trace says how long it waited', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-browser-slots-'))
    const channelsFor = (mode: 'standard' | 'research' | 'authed'): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => stopped(url, 'http') },
      // The rung reads its deadline as the real browser does: a scope of its own from the execution it is given, which must not have run out.
      { id: 'browser_local', identity: identityBundleFrom(modeIdentity(mode)), waitsFor: true, fetch: async (url, _session, execution) => {
        const own = createExecutionScope({ signal: execution?.signal, deadlineAt: execution?.deadlineAt })
        try { await raceWithSignal(sleep(600), own.signal) } finally { own.dispose() }
        return page(url, 'browser_local')
      } },
    ]
    engine = createApiEngine({ taskRoot: join(root, 'tasks'), channelsFor, networkPolicy: { ...hostedNetworkPolicy(), perHostMinDelayMs: 0 }, hosted: true, workerCount: 4, browserPagesAtOnce: 1 })
    // Three pages of 600 ms through one slot under a 1,000 ms timeout: the third waits 1,200 ms before it starts.
    const { taskId } = await engine.startBatch(parseBatchStartRequest({ urls: ['a', 'b', 'c'].map((host) => `https://${host}.test/item`), timeout: 1_000 }))
    for (;;) { const status = await engine.getBatch(taskId); if (status?.status === 'completed' || status?.status === 'failed') break; await sleep(20) }
    const items = (await engine.getBatchItems(taskId, { limit: 10, debug: true }))!.items
    expect(items.map((item) => `${item.status}:${item.failureReason ?? ''}`)).toEqual(['success:', 'success:', 'success:'])
    const waits = items.map((item) => (item.trace ?? []).find((event) => event.event === 'slot_wait')?.detail?.waitedMs as number | undefined)
    // The first page waited for nothing and says nothing; the last waited for the two before it.
    expect(waits.filter((wait) => wait === undefined)).toHaveLength(1)
    expect(Math.max(...waits.map((wait) => wait ?? 0))).toBeGreaterThan(1_000)
  })

  it('stops waiting for a slot when the read is cancelled', async () => {
    const slots = browserSlots(1)
    const identity = identityBundleFrom(modeIdentity('standard'))
    const [browser] = withBrowserSlots([{ id: 'browser_local', identity, waitsFor: true, fetch: async (url) => page(url, 'browser_local') }], slots)
    const held = await browser!.admit!('https://a.test/', {})
    const controller = new AbortController()
    const waiting = browser!.admit!('https://b.test/', { signal: controller.signal })
    controller.abort(new DOMException('stopped', 'AbortError'))
    await expect(waiting).rejects.toThrow('stopped')
    if (held.ok) await held.settle(null, true)
  })
})
