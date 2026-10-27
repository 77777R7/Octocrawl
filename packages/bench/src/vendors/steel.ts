/**
 * Steel integration — TRANSPORT layer only.
 *
 * Same discipline as browserbase.ts: this file knows the Steel API and the
 * vendor's capability manifest. Product policy arrives as a PolicyDecision
 * from packages/http-core/src/vendor.ts; the adapter translates it to wire
 * fields and never re-decides it.
 *
 * Steel specifics, from the steel-node SDK source (checked 2026-08-22):
 *   create : POST https://api.steel.dev/v1/sessions   header steel-api-key
 *   connect: wss://connect.steel.dev?apiKey={key}&sessionId={id}
 *            (built per docs; do NOT use the returned websocketUrl directly)
 *   release: POST https://api.steel.dev/v1/sessions/{id}/release
 *   create params (relevant subset):
 *     profileId: string, persistProfile: boolean, sessionContext: {
 *       cookies, localStorage, sessionStorage, indexedDB }
 *   session response: { id, sessionViewerUrl, debugUrl, status }
 *
 * Persistence: `persistProfile: true` + `profileId` restores a previous
 * profile across sessions; `sessionContext` seeds cookies/storage for a new
 * one. sessionViewerUrl is the human-handoff door (a live view of the
 * session), returned by create directly — no second call needed.
 *
 * Credential note: Steel authenticates the CDP websocket with the API key AS
 * A QUERY PARAMETER, so the connect URL itself is a secret. It is listed in
 * `secrets` and the shared transport scrubs it out of every error before one
 * can reach a trace or a bench artifact.
 */

import type { CapabilityOffer, PolicyDecision, VendorPolicy, VendorSessionUsage } from '@w2l/http-core'
import { evaluateVendorPolicy } from '@w2l/http-core'
import { fetchVendorApi, type VendorApi } from './api.js'
import type { VendorOps, VendorResumeContext, VendorSession, VendorSessionState } from './transport.js'

export interface SteelConfig {
  apiKey: string
  /** Override both for a self-hosted Steel (it is open-source). */
  baseUrl?: string
  connectBaseUrl?: string
  /**
   * Under a tariff (ROADMAP PA item 4): the longest a session may live. The session is created with Steel's own `timeout`
   * (milliseconds, at least STEEL_MIN_SESSION_MS), so it ends on Steel's side when a release fails. Absent: Steel's
   * default timeout.
   */
  sessionTimeoutMs?: number
  /**
   * Under a tariff with a per-GB price: the most bytes one session's pages may receive before the transport ends it.
   * Absent: uncounted (a grant without `vendor_residential_proxy` creates the session with `useProxy: false`).
   */
  maxBytesPerCall?: number
  /**
   * The country Steel's residential proxy is asked for (ISO 3166-1 alpha-2, `useProxy.geolocation.country`) when the
   * grant names `vendor_residential_proxy`; US when absent. Steel's docs: US and GB pools have the highest quality.
   */
  proxyCountry?: string
  /**
   * The waits between reads of a released session's `proxyBytesUsed` while it is still 0 under the residential proxy
   * (Steel fills it some time after the release: 12 of 16 reads right after it got 0 on 2026-10-11, arm A). Default
   * STEEL_USAGE_READ_WAITS_MS; a test passes short ones.
   */
  usageReadWaitsMs?: readonly number[]
}

/** The waits between reads of a released session's usage, within the transport's deadline for it. */
export const STEEL_USAGE_READ_WAITS_MS: readonly number[] = [1_500, 1_500, 2_000]
/** Time a read after a wait is given before the deadline. */
export const STEEL_USAGE_READ_MARGIN_MS = 500

/** The country asked for when the grant names the residential proxy and none is configured. */
export const STEEL_DEFAULT_PROXY_COUNTRY = 'US'

/** The shortest session `timeout` Steel accepts (15 s, its sessions configuration page). */
export const STEEL_MIN_SESSION_MS = 15_000

/** Steel's capability manifest — facts, not policy. */
export const STEEL_CAPABILITIES: readonly CapabilityOffer[] = [
  { capability: 'headless_browser', vendorDefaultOn: true, enableKey: null },
  { capability: 'datacenter_proxy', vendorDefaultOn: true, enableKey: null },
  { capability: 'residential_proxy', vendorDefaultOn: false, enableKey: 'residential_proxy' },
  { capability: 'retry_orchestration', vendorDefaultOn: false, enableKey: 'retry_orchestration' },
  { capability: 'session_persistence', vendorDefaultOn: false, enableKey: 'session_persistence' },
  { capability: 'live_view_handoff', vendorDefaultOn: true, enableKey: 'live_view_handoff' },
  { capability: 'captcha_solving', vendorDefaultOn: false, enableKey: 'vendor_captcha_solving' },
  { capability: 'fingerprint_spoofing', vendorDefaultOn: true, enableKey: 'vendor_stealth' },
]

export function steelSessionBody(
  decision: PolicyDecision,
  resume?: VendorResumeContext | null,
  sessionTimeoutMs?: number,
  proxyCountry: string = STEEL_DEFAULT_PROXY_COUNTRY,
): unknown {
  const persistEnabled = decision.enabled.some((c) => c.capability === 'session_persistence')
  const solveEnabled = decision.enabled.some((c) => c.capability === 'captcha_solving')
  const stealthEnabled = decision.enabled.some((c) => c.capability === 'fingerprint_spoofing')
  const residentialEnabled = decision.enabled.some((c) => c.capability === 'residential_proxy')

  return {
    ...(sessionTimeoutMs === undefined ? {} : { timeout: Math.max(sessionTimeoutMs, STEEL_MIN_SESSION_MS) }),
    // Steel's proxy is always said explicitly, never bought by omission: its residential pool (billed per GB) only
    // under the `vendor_residential_proxy` grant, with the country asked for; otherwise the browser machine's own
    // address, which bills no bandwidth.
    useProxy: residentialEnabled ? { geolocation: { country: proxyCountry } } : false,
    // Steel injects a synthetic fingerprint BY DEFAULT. skipFingerprintInjection
    // is the opt-out, sent unless the grant names `vendor_stealth` (ADR 0005);
    // a body without it would buy the capability by omission. Solving follows
    // `vendor_captcha_solving`. humanizeInteractions stays off under any
    // grant: ADR 0005 grants no behaviour simulation.
    stealthConfig: {
      skipFingerprintInjection: !stealthEnabled,
      autoCaptchaSolving: solveEnabled,
      humanizeInteractions: false,
    },
    solveCaptcha: solveEnabled,
    // First use persists the profile so the create response's profileId can
    // be saved and resumed later; a later run passes the saved profileId.
    ...(persistEnabled ? { persistProfile: true } : {}),
    ...(persistEnabled && resume?.steelProfileId !== undefined
      ? { profileId: resume.steelProfileId }
      : {}),
    ...(persistEnabled && resume?.steelSessionContext !== undefined
      ? { sessionContext: resume.steelSessionContext }
      : {}),
  }
}

export function steelOps(
  config: SteelConfig,
  api: VendorApi = fetchVendorApi,
  policy: VendorPolicy = {},
): VendorOps {
  const base = (config.baseUrl ?? 'https://api.steel.dev').replace(/\/$/, '')
  const connectBase = (config.connectBaseUrl ?? 'wss://connect.steel.dev').replace(/\/$/, '')
  const headers = { 'steel-api-key': config.apiKey } as const
  const decision: PolicyDecision = evaluateVendorPolicy(STEEL_CAPABILITIES, policy)
  const residentialEnabled = decision.enabled.some((c) => c.capability === 'residential_proxy')
  const solveEnabled = decision.enabled.some((c) => c.capability === 'captcha_solving')
  const proxyCountry = config.proxyCountry ?? STEEL_DEFAULT_PROXY_COUNTRY
  if (!/^[A-Z]{2}$/.test(proxyCountry)) throw new Error(`steel: proxyCountry is an ISO 3166-1 alpha-2 code, not "${proxyCountry}"`)

  return {
    vendorId: 'steel',
    secrets: [config.apiKey],
    decision,
    // The byte bound is the residential proxy's: a session on the browser machine's own address moves no billed bytes.
    limits: { maxBytesPerCall: residentialEnabled ? config.maxBytesPerCall ?? null : null, proxyCountry: residentialEnabled ? proxyCountry : null },

    /**
     * First-use persistence: Steel persists the profile when the session is
     * created with `persistProfile: true`, and the create response carries the
     * resulting `profileId`. There is no separate "create profile" call — the
     * session itself is the creation — so this reports null and the profileId
     * from the create response becomes the resume material the ladder saves.
     */
    async ensurePersistence(deadlineMs?: number, signal?: AbortSignal): Promise<VendorResumeContext | null> {
      void deadlineMs
      return null
    },

    // Steel takes the caller's UUID as the session's id (`sessionId`, its session lifecycle docs: "Reserving a Session ID").
    namesSessions: true,

    async createSession(resume?: VendorResumeContext | null, deadlineMs?: number, signal?: AbortSignal, name?: string): Promise<VendorSession> {
      const body = { ...(steelSessionBody(decision, resume ?? null, config.sessionTimeoutMs, proxyCountry) as Record<string, unknown>), ...(name === undefined ? {} : { sessionId: name }) }
      const res = await api({
        method: 'POST',
        url: `${base}/v1/sessions`,
        headers,
        body,
        deadlineMs, signal,
      })
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`steel: session create returned ${res.status}`)
      }
      const json = res.json as {
        id?: unknown
        sessionViewerUrl?: unknown
        profileId?: unknown
      } | null
      if (typeof json?.id !== 'string') {
        throw new Error('steel: session create response missing id')
      }
      if (name !== undefined && json.id !== name) {
        // A session not under the name it was asked for cannot be found by that name after a crash (PA E4): it is ended now
        // and the call fails, so no session of a paid call is ever left where only its name would lead.
        const released = await api({ method: 'POST', url: `${base}/v1/sessions/${encodeURIComponent(json.id)}/release`, headers, deadlineMs: Date.now() + 5_000 }).catch(() => null)
        const ended = released !== null && released.status >= 200 && released.status < 300
        throw new Error(`steel: session create did not take the sessionId it was given (it made ${json.id}, ${ended ? 'released' : 'release unconfirmed'})`)
      }
      // Constructed per Steel's docs rather than read from the response —
      // they explicitly warn against using the returned websocketUrl directly.
      const connectUrl = `${connectBase}?apiKey=${encodeURIComponent(config.apiKey)}&sessionId=${encodeURIComponent(json.id)}`

      const handoffEnabled = decision.enabled.some((c) => c.capability === 'live_view_handoff')
      const handoffUrl = handoffEnabled && typeof json.sessionViewerUrl === 'string' ? json.sessionViewerUrl : null

      const resumeContext: VendorResumeContext | null =
        typeof json.profileId === 'string' ? { steelProfileId: json.profileId } : resume ?? null

      return { sessionId: json.id, connectUrl, handoffUrl, resumeContext }
    },

    async releaseSession(sessionId: string, deadlineMs?: number, signal?: AbortSignal): Promise<void> {
      const res = await api({
        method: 'POST',
        url: `${base}/v1/sessions/${sessionId}/release`,
        headers,
        deadlineMs, signal,
      })
      // A release the vendor did not confirm leaves the session billing until its own timeout.
      if (res.status < 200 || res.status >= 300) throw new Error(`steel: session release returned ${res.status}`)
    },

    /**
     * The session as Steel holds it (GET /v1/sessions/{id}): `status` (`live` while it runs and bills), `releaseReason`
     * and `duration`. Only `released` ends the billing; any other status, or none, is not a release.
     */
    async sessionState(sessionId: string, deadlineMs?: number, signal?: AbortSignal): Promise<VendorSessionState> {
      const res = await api({ method: 'GET', url: `${base}/v1/sessions/${sessionId}`, headers, deadlineMs, signal })
      if (res.status !== 200) throw new Error(`steel: session read returned ${res.status}`)
      const json = res.json as { status?: unknown; releaseReason?: unknown; duration?: unknown } | null
      if (typeof json?.status !== 'string') throw new Error('steel: session read has no status')
      return {
        released: json.status === 'released',
        status: json.status,
        reason: typeof json.releaseReason === 'string' ? json.releaseReason : null,
        durationMs: typeof json.duration === 'number' && Number.isFinite(json.duration) && json.duration >= 0 ? Math.round(json.duration) : null,
      }
    },

    /**
     * What the session used, as Steel reports it after release (ROADMAP PA item 4): `proxyBytesUsed` on the session
     * object (GET /v1/sessions/{id}, its docs: measured on the wire at the proxy, both directions), and the solves on
     * GET /v1/sessions/{id}/captchas/status when solving was granted (a task whose `status` is `solved`; its docs do not
     * say that this count is the billed one, so the record calls it what Steel reported). A figure Steel did not give
     * is null, never zero. Under the residential proxy Steel fills `proxyBytesUsed` some time after the release, so a 0
     * is read again after each wait in `usageReadWaitsMs` within the deadline, and one still 0 then is null: a page
     * through a proxy moved bytes, and the ledger prices the unknown at the ceiling's allowance. The solves are read
     * here only as a fallback: the status answers 404 some time after a release (2026-10-11, arm B: 4 of 17 reads), so
     * the transport asks `liveUsage` for them before the release.
     */
    async sessionUsage(sessionId: string, deadlineMs?: number, signal?: AbortSignal): Promise<VendorSessionUsage | null> {
      const read = async (): Promise<number | null> => {
        const res = await api({ method: 'GET', url: `${base}/v1/sessions/${sessionId}`, headers, deadlineMs, signal })
        if (res.status !== 200) throw new Error(`steel: session read returned ${res.status}`)
        const json = res.json as { proxyBytesUsed?: unknown } | null
        return typeof json?.proxyBytesUsed === 'number' && Number.isFinite(json.proxyBytesUsed) && json.proxyBytesUsed >= 0 ? Math.round(json.proxyBytesUsed) : null
      }
      let proxyBytes = await read()
      if (residentialEnabled && proxyBytes === 0) {
        for (const waitMs of config.usageReadWaitsMs ?? STEEL_USAGE_READ_WAITS_MS) {
          // The wait, and room for the read after it, within the deadline.
          if (deadlineMs !== undefined && Date.now() + waitMs + STEEL_USAGE_READ_MARGIN_MS >= deadlineMs) break
          await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
          if (signal?.aborted) break
          proxyBytes = await read()
          if (proxyBytes !== 0) break
        }
        if (proxyBytes === 0) proxyBytes = null
      }
      let solves: number | null = solveEnabled ? null : 0
      if (solveEnabled) {
        try {
          const status = await api({ method: 'GET', url: `${base}/v1/sessions/${sessionId}/captchas/status`, headers, deadlineMs, signal })
          if (status.status === 200) solves = countSolved(status.json)
        } catch {
          solves = null
        }
      }
      return { proxyBytes, solves }
    },

    /** The solves so far, read while the session lives: Steel's captchas status is gone some time after the release. */
    async liveUsage(sessionId: string, deadlineMs?: number, signal?: AbortSignal): Promise<Partial<VendorSessionUsage> | null> {
      if (!solveEnabled) return { solves: 0 }
      const status = await api({ method: 'GET', url: `${base}/v1/sessions/${sessionId}/captchas/status`, headers, deadlineMs, signal })
      if (status.status !== 200) throw new Error(`steel: captchas status returned ${status.status}`)
      return { solves: countSolved(status.json) }
    },
  }
}

/** The solved tasks in Steel's captchas status answer, whatever it groups them by: every object whose `status` is `solved`. */
export function countSolved(value: unknown): number {
  let count = 0
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (typeof node !== 'object' || node === null) return
    const record = node as Record<string, unknown>
    if (record.status === 'solved') count++
    for (const child of Object.values(record)) if (typeof child === 'object' && child !== null) walk(child)
  }
  walk(value)
  return count
}
