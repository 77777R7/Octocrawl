/**
 * Finding a paid call's provider sessions again after a crash (PA E4).
 *
 * Steel takes no idempotency key on session create (its OpenAPI, docs.steel.dev/openapi.json, 2026-10-20: the create
 * operation has no header or body field for one), but it does take the caller's UUID as the session's id (`sessionId`).
 * A paid call names its sessions from its `paidCallId`, so the run that resumes a crashed task can ask Steel about them
 * by name, whether or not the crashed run lived to write the ids Steel returned.
 */

import { createHash } from 'node:crypto'
import type { ExecutionContext, PaidCallRecord } from '@w2l/contracts'
import { fetchVendorApi, type VendorApi } from './api.js'
import type { VendorOps } from './transport.js'

/** The most sessions one paid call is asked about by name: a call opens one, and a few more only when it fails and retries. */
export const PAID_CALL_MAX_NAMED_SESSIONS = 4

/** RFC 4122 namespace of Octocrawl's paid-call session names (a random UUID, fixed). */
const PAID_SESSION_NAMESPACE = '6f1c2a8e-3b7d-4c55-9a0e-58d2f4b1c9e7'

/** The UUID (version 5) a paid call's `ordinal`-th session is created with: the same for the same call, on any machine. */
export function paidSessionName(paidCallId: string, ordinal: number): string {
  const hash = createHash('sha1').update(Buffer.from(PAID_SESSION_NAMESPACE.replaceAll('-', ''), 'hex')).update(`${paidCallId}#${ordinal}`).digest()
  hash[6] = (hash[6]! & 0x0f) | 0x50
  hash[8] = (hash[8]! & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The ops a paid call's sessions are opened through: each session named from the call's id when the provider takes a
 * name, and told to the call's row as soon as the provider answers. Outside a paid call, the ops as they are.
 */
export function namedForPaidCall(ops: VendorOps, execution: ExecutionContext | undefined): VendorOps {
  const paidCallId = execution?.paidCallId
  const told = execution?.onPaidSession
  if (paidCallId === undefined && told === undefined) return ops
  let opened = 0
  return {
    ...ops,
    createSession: async (resume, deadlineMs, signal) => {
      opened++
      const name = ops.namesSessions === true && paidCallId !== undefined && opened <= PAID_CALL_MAX_NAMED_SESSIONS ? paidSessionName(paidCallId, opened) : undefined
      const session = await ops.createSession(resume, deadlineMs, signal, name)
      try { told?.({ providerSessionId: session.sessionId, ...(name === undefined ? {} : { providerRequestId: name }) }) } catch {}
      return session
    },
  }
}

/** The waits before each new read of a released session's cost that Steel has not finalized yet (409). */
export const STEEL_COST_READ_WAITS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000]

interface SteelSessionState {
  id: string
  status: string
}

/**
 * Settles a Steel paid call an earlier run left open, from what Steel says about the sessions the call named: each one
 * still live is released, and the call is charged the sum of Steel's finalized cost for them (`GET /v1/sessions/{id}/cost`,
 * US dollars). No session under the call's first name, and none it reported, is `released`: the call opened no session,
 * so Steel bills nothing. Anything Steel does not answer plainly leaves the call `unknown` (a `usage_pending` one as it
 * was), never charged as known. A call to another provider is returned as it is.
 */
export function steelPaidCallReconciler(config: { apiKey: string; baseUrl?: string; costReadWaitsMs?: readonly number[] }, api: VendorApi = fetchVendorApi): (call: PaidCallRecord) => Promise<PaidCallRecord> {
  const base = (config.baseUrl ?? 'https://api.steel.dev').replace(/\/$/, '')
  const headers = { 'steel-api-key': config.apiKey } as const
  const deadline = () => Date.now() + 10_000
  const read = async (id: string): Promise<SteelSessionState | null> => {
    const res = await api({ method: 'GET', url: `${base}/v1/sessions/${encodeURIComponent(id)}`, headers, deadlineMs: deadline() })
    if (res.status === 404) return null
    const json = res.json as { id?: unknown; status?: unknown } | null
    if (res.status !== 200 || typeof json?.id !== 'string' || typeof json.status !== 'string') throw new Error(`steel: session read returned ${res.status}`)
    return { id: json.id, status: json.status }
  }
  return async (call) => {
    if (call.vendorId !== 'steel') return call
    const unsettled: PaidCallRecord = call.state === 'usage_pending' ? call : { ...call, state: 'unknown', chargedUsd: null }
    try {
      const sessions: SteelSessionState[] = []
      for (let ordinal = 1; ordinal <= PAID_CALL_MAX_NAMED_SESSIONS; ordinal++) {
        const found = await read(paidSessionName(call.paidCallId, ordinal))
        if (found === null) break
        sessions.push(found)
      }
      if (call.providerSessionId !== null && !sessions.some((session) => session.id === call.providerSessionId)) {
        const reported = await read(call.providerSessionId)
        // A session the call was told of and Steel no longer knows: what it cost cannot be read.
        if (reported === null) return unsettled
        sessions.push(reported)
      }
      if (sessions.length === 0) return { ...call, state: 'released', chargedUsd: null, settledAt: new Date().toISOString() }
      let totalUsd = 0
      for (const session of sessions) {
        if (session.status === 'live') {
          const released = await api({ method: 'POST', url: `${base}/v1/sessions/${encodeURIComponent(session.id)}/release`, headers, deadlineMs: deadline() })
          if (released.status < 200 || released.status >= 300) return unsettled
        }
        // Steel answers 409 until the released session's final usage is written ("retry once final usage has been written",
        // its answer on 2026-10-20): the cost is read again after each wait.
        let cost = await api({ method: 'GET', url: `${base}/v1/sessions/${encodeURIComponent(session.id)}/cost`, headers, deadlineMs: deadline() })
        for (const waitMs of config.costReadWaitsMs ?? STEEL_COST_READ_WAITS_MS) {
          if (cost.status !== 409) break
          await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
          cost = await api({ method: 'GET', url: `${base}/v1/sessions/${encodeURIComponent(session.id)}/cost`, headers, deadlineMs: deadline() })
        }
        const json = cost.json as { totalCost?: unknown; currency?: unknown } | null
        if (cost.status !== 200 || typeof json?.totalCost !== 'number' || !Number.isFinite(json.totalCost) || json.totalCost < 0 || (json.currency !== undefined && json.currency !== 'usd')) return unsettled
        totalUsd += json.totalCost
      }
      return { ...call, state: 'settled', chargedUsd: totalUsd, providerSessionId: call.providerSessionId ?? sessions[0]!.id, settledAt: new Date().toISOString() }
    } catch {
      return unsettled
    }
  }
}
