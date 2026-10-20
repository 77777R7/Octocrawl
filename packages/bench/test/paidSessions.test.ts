import { describe, expect, it } from 'vitest'
import type { PaidCallRecord } from '@w2l/contracts'
import type { VendorApi, VendorApiRequest } from '../src/vendors/api.js'
import { namedForPaidCall, paidSessionName, steelPaidCallReconciler } from '../src/vendors/paidSessions.js'
import { steelOps } from '../src/vendors/steel.js'
import type { VendorOps, VendorSession } from '../src/vendors/transport.js'

const CALL: PaidCallRecord = {
  paidCallId: 'task-attempt-1', taskId: 'task', attemptId: 'attempt', url: 'https://example.com/', vendorId: 'steel', ceilingUsd: 0.02, state: 'reserved', chargedUsd: null,
  providerRequestId: null, providerSessionId: null, tariffVersion: null, grantHash: null, deadline: null, createdAt: '2026-10-20T00:00:00.000Z', settledAt: null,
}

/** A Steel API that answers from a table of sessions; every request is kept. */
function steelApi(sessions: Record<string, { status: string; cost?: number | 'refused' }>): VendorApi & { requests: VendorApiRequest[] } {
  const requests: VendorApiRequest[] = []
  const api = (async (req: VendorApiRequest) => {
    requests.push(req)
    const [, id, tail] = /\/v1\/sessions\/([^/]+)(\/.*)?$/.exec(new URL(req.url).pathname) ?? []
    const session = id === undefined ? undefined : sessions[decodeURIComponent(id)]
    if (session === undefined) return { status: 404, json: { message: 'not found' } }
    if (tail === undefined) return { status: 200, json: { id, status: session.status } }
    if (tail === '/release') { session.status = 'released'; return { status: 200, json: { success: true } } }
    if (tail === '/cost') return session.cost === 'refused' || session.cost === undefined ? { status: 409, json: null } : { status: 200, json: { id, currency: 'usd', unit: 'dollar', totalCost: session.cost, usage: { browser: { value: 1, unit: 'minute' }, proxy: { bytes: 0 }, captcha: { solves: 0 } } } }
    return { status: 400, json: null }
  }) as VendorApi & { requests: VendorApiRequest[] }
  api.requests = requests
  return api
}

describe('a paid call\'s provider sessions (PA E4)', () => {
  it('names each session of a call with the same version 5 UUID on every run, and different calls differently', () => {
    const first = paidSessionName('task-attempt-1', 1)
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(paidSessionName('task-attempt-1', 1)).toBe(first)
    expect(paidSessionName('task-attempt-1', 2)).not.toBe(first)
    expect(paidSessionName('task-attempt-2', 1)).not.toBe(first)
  })

  it('creates a Steel session under the call\'s name and tells the row, and leaves ops outside a call as they are', async () => {
    const bodies: unknown[] = []
    const api: VendorApi = async (req) => { bodies.push(req.body); return { status: 201, json: { id: (req.body as { sessionId?: string }).sessionId ?? 'steel-made' } } }
    const ops = steelOps({ apiKey: 'k' }, api)
    expect(ops.namesSessions).toBe(true)
    const told: unknown[] = []
    const named = namedForPaidCall(ops, { paidCallId: 'task-attempt-1', onPaidSession: (session) => { told.push(session) } })
    const session = await named.createSession(null)
    expect(session.sessionId).toBe(paidSessionName('task-attempt-1', 1))
    expect(bodies[0]).toMatchObject({ sessionId: paidSessionName('task-attempt-1', 1) })
    expect(told).toEqual([{ providerSessionId: session.sessionId, providerRequestId: session.sessionId }])
    expect(namedForPaidCall(ops, {})).toBe(ops)
    // A provider that takes no name is told nothing of one, and its own id is what the row gets.
    const unnamed: VendorOps = { ...ops, namesSessions: false, createSession: async (_resume, _deadline, _signal, name): Promise<VendorSession> => ({ sessionId: name ?? 'bb-1', connectUrl: 'wss://x', handoffUrl: null, resumeContext: null }) }
    const heard: unknown[] = []
    expect((await namedForPaidCall(unnamed, { paidCallId: 'c', onPaidSession: (s) => { heard.push(s) } }).createSession(null)).sessionId).toBe('bb-1')
    expect(heard).toEqual([{ providerSessionId: 'bb-1' }])
  })

  it('ends a Steel session created under another id than the call asked for, and fails the call, so none is left that its name would not find', async () => {
    const requests: VendorApiRequest[] = []
    const api: VendorApi = async (req) => { requests.push(req); return req.url.endsWith('/v1/sessions') ? { status: 201, json: { id: 'steel-own-id' } } : { status: 200, json: { success: true } } }
    const named = namedForPaidCall(steelOps({ apiKey: 'k' }, api), { paidCallId: 'task-attempt-1', onPaidSession: () => {} })
    await expect(named.createSession(null)).rejects.toThrow('did not take the sessionId it was given (it made steel-own-id, released)')
    expect(requests.map((req) => `${req.method} ${new URL(req.url).pathname}`)).toEqual(['POST /v1/sessions', 'POST /v1/sessions/steel-own-id/release'])
  })

  it('settles a crashed call from Steel\'s finalized cost, releasing a session still live', async () => {
    const name = paidSessionName(CALL.paidCallId, 1)
    const api = steelApi({ [name]: { status: 'live', cost: 0.0034 } })
    const settled = await steelPaidCallReconciler({ apiKey: 'k' }, api)({ ...CALL, state: 'submitted', providerSessionId: name })
    expect(settled).toMatchObject({ state: 'settled', chargedUsd: 0.0034, providerSessionId: name })
    expect(api.requests.map((req) => `${req.method} ${new URL(req.url).pathname}`)).toContain(`POST /v1/sessions/${name}/release`)
  })

  it('releases the reservation only when Steel has no session under the call\'s name and the row names none', async () => {
    const api = steelApi({})
    expect(await steelPaidCallReconciler({ apiKey: 'k' }, api)(CALL)).toMatchObject({ state: 'released', chargedUsd: null })
    // A session the row was told of that Steel no longer has: unknown, never released.
    expect(await steelPaidCallReconciler({ apiKey: 'k' }, steelApi({}))({ ...CALL, state: 'submitted', providerSessionId: 'gone' })).toMatchObject({ state: 'unknown', chargedUsd: null })
  })

  it('leaves a call unknown when Steel gives no finalized cost or does not answer, and a usage_pending one as it was', async () => {
    const name = paidSessionName(CALL.paidCallId, 1)
    expect(await steelPaidCallReconciler({ apiKey: 'k', costReadWaitsMs: [1, 1] }, steelApi({ [name]: { status: 'released', cost: 'refused' } }))(CALL)).toMatchObject({ state: 'unknown', chargedUsd: null })
    // A cost Steel finalizes a moment after the release is read again until it is there: a 409 first, then a 200 that
    // still says $0 with no browser time (as Steel answered in the E7 live run), then the minute it bills.
    let reads = 0
    const finalizing: VendorApi = async (req) => {
      if (req.url.endsWith('/cost')) {
        reads++
        if (reads === 1) return { status: 409, json: null }
        if (reads === 2) return { status: 200, json: { totalCost: 0, currency: 'usd', usage: { browser: { value: 0, unit: 'minute' } } } }
        return { status: 200, json: { totalCost: 0.0005, currency: 'usd', usage: { browser: { value: 1, unit: 'minute' } } } }
      }
      return req.method === 'GET' && req.url.endsWith(name) ? { status: 200, json: { id: name, status: 'released' } } : { status: 404, json: null }
    }
    expect(await steelPaidCallReconciler({ apiKey: 'k', costReadWaitsMs: [1, 1, 1] }, finalizing)(CALL)).toMatchObject({ state: 'settled', chargedUsd: 0.0005 })
    expect(reads).toBe(3)
    // A $0 that never becomes a billed minute is not a known charge: the call stays unknown, never settled at zero.
    const zero: VendorApi = async (req) => req.url.endsWith('/cost') ? { status: 200, json: { totalCost: 0, currency: 'usd', usage: { browser: { value: 0, unit: 'minute' } } } } : req.url.endsWith(name) ? { status: 200, json: { id: name, status: 'released' } } : { status: 404, json: null }
    expect(await steelPaidCallReconciler({ apiKey: 'k', costReadWaitsMs: [1, 1] }, zero)(CALL)).toMatchObject({ state: 'unknown', chargedUsd: null })
    const down: VendorApi = async () => ({ status: 503, json: null })
    expect(await steelPaidCallReconciler({ apiKey: 'k' }, down)(CALL)).toMatchObject({ state: 'unknown' })
    const pending = { ...CALL, state: 'usage_pending' as const, chargedUsd: 0.02, providerSessionId: name }
    expect(await steelPaidCallReconciler({ apiKey: 'k' }, down)(pending)).toEqual(pending)
    // Another provider's call is not Steel's to answer.
    expect(await steelPaidCallReconciler({ apiKey: 'k' }, down)({ ...CALL, vendorId: 'browserbase' })).toEqual({ ...CALL, vendorId: 'browserbase' })
  })
})
