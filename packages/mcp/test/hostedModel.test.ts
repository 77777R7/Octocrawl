import { describe, expect, it } from 'vitest'
import type { StructuredModelUsage } from '@w2l/contracts'
import { asksModelFallback, DEFAULT_MODEL_DAILY_CAP_USD, FirestoreModelSpend, firestoreModelSettings, HostedModel, MemoryModelSettings, MemoryModelSpend, MODEL_REFUSALS } from '../src/hostedModel.js'

// The json model fallback on hosted Octocrawl (decided 2026-10-24): the switch, the daily cap and what a page's gate
// reserves and settles. The model itself is never called here.

const DAY = '2026-10-24'
const NOW = new Date(`${DAY}T09:00:00Z`)
const HAIKU = { provider: 'anthropic', model: 'claude-haiku-5-5' }
const usage = (attempts: number, externalCostUsd: number | null): StructuredModelUsage => ({ model: 'claude-haiku-5-5', attempts, inputTokens: attempts * 1_000, outputTokens: attempts * 40, externalCostUsd })

function model(options: { enabled?: boolean; capUsd?: number; spend?: MemoryModelSpend; configured?: boolean; log?: string[] } = {}) {
  const spend = options.spend ?? new MemoryModelSpend()
  const settings = new MemoryModelSettings({ enabled: options.enabled ?? true, dailyCapUsd: options.capUsd ?? DEFAULT_MODEL_DAILY_CAP_USD })
  const hosted = new HostedModel({ model: options.configured === false ? null : HAIKU, settings, spend, now: () => NOW, log: (line) => options.log?.push(line) })
  return { hosted, spend, settings }
}

describe('hosted json model fallback', () => {
  it('reserves the page\'s bound before the call and settles at what the calls cost', async () => {
    const { hosted, spend } = model()
    const { gate, pagesCalled } = hosted.gate(null)
    const admitted = await gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.024 })
    expect(admitted.ok).toBe(true)
    expect(spend.spent.get(DAY)).toBe(24_000)
    if (!admitted.ok) return
    await admitted.settle(usage(1, 0.00112))
    expect(spend.spent.get(DAY)).toBe(1_120)
    expect(pagesCalled()).toBe(1)
  })

  it('gives the whole reservation back when no call was made, and keeps it when the cost is not known', async () => {
    const { hosted, spend } = model()
    const { gate, pagesCalled } = hosted.gate(null)
    const first = await gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.02 })
    if (!first.ok) throw new Error('refused')
    await first.settle(null)
    expect(spend.spent.get(DAY)).toBe(0)
    expect(pagesCalled()).toBe(0)
    const second = await gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.02 })
    if (!second.ok) throw new Error('refused')
    // A call that failed after it was sent may have been billed: its price is unknown, never 0.
    await second.settle(usage(1, null))
    expect(spend.spent.get(DAY)).toBe(20_000)
    expect(pagesCalled()).toBe(1)
  })

  it('refuses a page whose bound would pass the day\'s cap, calling nothing and reserving nothing', async () => {
    const spend = new MemoryModelSpend()
    spend.spent.set(DAY, 4_990_000)
    const log: string[] = []
    const { hosted } = model({ spend, log })
    const { gate } = hosted.gate(null)
    expect(await gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.02 })).toEqual({ ok: false, message: MODEL_REFUSALS.cap(5) })
    expect(spend.spent.get(DAY)).toBe(4_990_000)
    expect(log.map((line) => JSON.parse(line).event)).toEqual(['hosted_model_cap_reached'])
    // What fits under the cap still runs.
    expect((await gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.01 })).ok).toBe(true)
  })

  it('refuses every page while the switch is off, or the caller holds no credits for it, or the price is unknown', async () => {
    const { hosted, settings, spend } = model({ enabled: false })
    expect(await hosted.offered()).toBe(false)
    expect(await hosted.gate(null).gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.02 })).toEqual({ ok: false, message: MODEL_REFUSALS.switchedOff })
    settings.settings = { enabled: true, dailyCapUsd: 5 }
    expect(await hosted.offered()).toBe(true)
    expect(await hosted.gate(MODEL_REFUSALS.credits).gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.02 })).toEqual({ ok: false, message: MODEL_REFUSALS.credits })
    expect(await hosted.gate(null).gate.admit({ model: 'claude-opus-5-5', maxCostUsd: null })).toEqual({ ok: false, message: MODEL_REFUSALS.unpriced })
    expect(spend.spent.size).toBe(0)
    expect(await model({ configured: false }).hosted.offered()).toBe(false)
  })

  it('logs the day, tokens and cost of a call, never the key or anything the page or model said', async () => {
    const log: string[] = []
    const { hosted } = model({ log })
    const admitted = await hosted.gate(null).gate.admit({ model: 'claude-haiku-5-5', maxCostUsd: 0.02 })
    if (!admitted.ok) throw new Error('refused')
    await admitted.settle(usage(2, 0.0021))
    expect(log).toHaveLength(1)
    expect(JSON.parse(log[0]!)).toEqual({ severity: 'INFO', event: 'hosted_model_call', day: DAY, attempts: 2, inputTokens: 2_000, outputTokens: 80, costUsd: 0.0021, reservedUsd: 0.02 })
  })

  it('reads which formats ask for the fallback', () => {
    expect(asksModelFallback([{ type: 'json', schema: {}, modelFallback: true }])).toBe(true)
    expect(asksModelFallback(['json', { type: 'json', schema: {} }, { type: 'json', schema: {}, modelFallback: 'true' }])).toBe(false)
    expect(asksModelFallback(undefined)).toBe(false)
  })
})

describe('hosted model settings and spend in Firestore', () => {
  const PROJECT = 'octocrawl-test-1'
  const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
  const token = async () => 'service-token'

  it('is off while hostedConfig/model is absent, and after a failed first read; on only for enabled: true', async () => {
    let answer: Response | Error = new Response('{}', { status: 404 })
    let t = 0
    const settings = firestoreModelSettings(PROJECT, token, (async () => { if (answer instanceof Error) throw answer; return answer.clone() }) as typeof fetch, () => t)
    expect(await settings.read()).toEqual({ enabled: false, dailyCapUsd: 5 })
    answer = new Response(JSON.stringify({ name: `${BASE}/hostedConfig/model`, fields: { enabled: { stringValue: 'true' } } }), { status: 200 })
    t += 31_000
    expect((await settings.read()).enabled).toBe(false)
    answer = new Response(JSON.stringify({ name: `${BASE}/hostedConfig/model`, fields: { enabled: { booleanValue: true }, dailyCapUsd: { doubleValue: 2.5 } } }), { status: 200 })
    expect((await settings.read()).enabled).toBe(false)
    t += 31_000
    expect(await settings.read()).toEqual({ enabled: true, dailyCapUsd: 2.5 })
    // A failed read keeps what was read last.
    answer = new Error('network down')
    t += 31_000
    expect(await settings.read()).toEqual({ enabled: true, dailyCapUsd: 2.5 })
    const unread = firestoreModelSettings(PROJECT, token, (async () => { throw new Error('network down') }) as typeof fetch)
    expect((await unread.read()).enabled).toBe(false)
  })

  it('reserves under an update-time precondition, read again when another instance wrote first, and refuses past the cap', async () => {
    const doc = { microUsd: 4_000_000, updateTime: '2026-10-24T09:00:00.000000Z' }
    const commits: unknown[] = []
    let raced = false
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith(':commit')) {
        const body = JSON.parse(String(init?.body)) as { writes: Array<{ update: { fields: Record<string, { integerValue?: string }> }; currentDocument?: { updateTime?: string }; updateTransforms?: Array<{ increment: { integerValue: string } }> }> }
        commits.push(body)
        const write = body.writes[0]!
        if (write.updateTransforms) { doc.microUsd += Number(write.updateTransforms[0]!.increment.integerValue); return new Response('{}', { status: 200 }) }
        // Another instance's reservation lands between this one's read and its commit, once.
        if (!raced) { raced = true; doc.microUsd += 900_000; doc.updateTime = '2026-10-24T09:00:01.000000Z'; return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 }) }
        if (write.currentDocument?.updateTime !== doc.updateTime) return new Response('{}', { status: 409 })
        doc.microUsd = Number(write.update.fields.microUsd!.integerValue)
        return new Response('{}', { status: 200 })
      }
      return new Response(JSON.stringify({ name: `projects/${PROJECT}/databases/(default)/documents/hostedModelSpend/${DAY}`, updateTime: doc.updateTime, fields: { microUsd: { integerValue: String(doc.microUsd) } } }), { status: 200 })
    }) as typeof fetch
    const spend = new FirestoreModelSpend(PROJECT, token, fetcher)
    // 4.0 + 0.9 (the other instance) + 0.2 would pass 5: refused after the read again, nothing added.
    expect(await spend.reserve(DAY, 200_000, 5_000_000, NOW)).toEqual({ ok: false, spentMicro: 4_900_000 })
    expect(doc.microUsd).toBe(4_900_000)
    expect(await spend.reserve(DAY, 50_000, 5_000_000, NOW)).toEqual({ ok: true })
    expect(doc.microUsd).toBe(4_950_000)
    await spend.adjust(DAY, -48_000)
    expect(doc.microUsd).toBe(4_902_000)
  })
})
