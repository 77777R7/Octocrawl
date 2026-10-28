/**
 * Hosted Octocrawl's access capabilities, granted per request (ROADMAP stage H item 2; ADR 0005). Hosted Octocrawl reads
 * no access grant: a call's capabilities come from the operator's switches, for the caller that sent it.
 *
 *   compatible_transport   `hostedConfig/compatibleTransport`: `enabled` (true turns it on; absent, or anything else, is
 *                          off, so a deploy alone turns nothing on) and `allowedUids` (an array of account uids: only those
 *                          accounts' calls; absent: every caller). Read at most every 30 s; a failed read keeps what was
 *                          read last, and with nothing read yet the switch is off.
 *
 *   hosted_chrome          `hostedConfig/hostedChrome` (ADR 0005, revision of 2026-10-27, decision two: the account's
 *                          switch): `enabled` (exactly true) and `allowedUids`, an allowlist and nothing else: absent or
 *                          empty grants it to no one, and a caller without an account (keyless, or a key issued by
 *                          hand) never holds it. Two numbers D5 decides, with no default: `monthlyCapUsd` (the
 *                          operator's dollar cap a month for the rung) and `dailyAttemptsPerAccount` (the enhanced
 *                          attempts one account may start a UTC day). While either is absent, or not a positive number
 *                          (a whole one for attempts), the switch grants it to no one. Read as the other switch is.
 *                          The rung is used only by an engine built with its operator's config (engine.ts
 *                          `hostedChrome`) and by a call that also chose access enhanced.
 *
 * The gate asks for each scrape (REST and MCP alike), the job worker for each slice of a job, for the job's account. A
 * call that holds the transport reads the hosts its local acceptance named over it (COMPAT_BENEFIT_HOSTS), as a server
 * on the person's computer does, through the engine's address guard; it is still an HTTP page, priced as one.
 */
import { COMPAT_BENEFIT_HOSTS, HOSTED_CALL_CAPABILITIES, type CallCapability } from '@w2l/api'

/** How long a read of the switches is kept. */
const SETTINGS_TTL_MS = 30_000

export interface HostedAccessSettings {
  compatibleTransport: { enabled: boolean; allowedUids: readonly string[] | null }
  /** `hostedConfig/hostedChrome`; absent: off. */
  hostedChrome?: HostedChromeSwitch
}

/** The account switch of ADR 0005 hosted_chrome (see the top of this file). */
export interface HostedChromeSwitch {
  enabled: boolean
  /** The accounts it may be granted to; empty: no one. */
  allowedUids: readonly string[]
  /** D5, pending: the operator's dollar cap a month for the rung; null (unset): granted to no one. */
  monthlyCapUsd: number | null
  /** D5, pending: the enhanced attempts one account may start a UTC day; null (unset): granted to no one. */
  dailyAttemptsPerAccount: number | null
}

export const HOSTED_CHROME_OFF: HostedChromeSwitch = { enabled: false, allowedUids: [], monthlyCapUsd: null, dailyAttemptsPerAccount: null }

/** The operator's switches, as they stand. */
export interface HostedAccessSource { read(): Promise<HostedAccessSettings> }

export const HOSTED_ACCESS_OFF: HostedAccessSettings = { compatibleTransport: { enabled: false, allowedUids: null }, hostedChrome: HOSTED_CHROME_OFF }

/** What a hosted engine is built with to grant capabilities per call: the names, and the hosts the transport serves. */
export const HOSTED_ACCESS_ENGINE = { callCapabilities: HOSTED_CALL_CAPABILITIES, compatHosts: COMPAT_BENEFIT_HOSTS } as const

export class MemoryHostedAccess implements HostedAccessSource {
  constructor(public settings: HostedAccessSettings = HOSTED_ACCESS_OFF) {}
  async read(): Promise<HostedAccessSettings> { return this.settings }
}

/** The capabilities a call holds now: one by `uid`'s account, or by a caller without one. No switches: none. */
export async function grantedCapabilities(source: HostedAccessSource | undefined, caller: { uid?: string | undefined }): Promise<CallCapability[]> {
  if (source === undefined) return []
  const { compatibleTransport, hostedChrome = HOSTED_CHROME_OFF } = await source.read()
  const admitted = compatibleTransport.allowedUids === null || (caller.uid !== undefined && compatibleTransport.allowedUids.includes(caller.uid))
  return [...(compatibleTransport.enabled && admitted ? ['compatible_transport' as const] : []), ...(hostedChromeAdmits(hostedChrome, caller.uid) ? ['hosted_chrome' as const] : [])]
}

/** Whether the hosted_chrome switch grants it to the account `uid`: on, the account listed, and both D5 numbers set. */
export function hostedChromeAdmits(settings: HostedChromeSwitch, uid: string | undefined): boolean {
  const capSet = typeof settings.monthlyCapUsd === 'number' && Number.isFinite(settings.monthlyCapUsd) && settings.monthlyCapUsd > 0
  const attemptsSet = typeof settings.dailyAttemptsPerAccount === 'number' && Number.isInteger(settings.dailyAttemptsPerAccount) && settings.dailyAttemptsPerAccount > 0
  return settings.enabled === true && uid !== undefined && uid !== '' && settings.allowedUids.includes(uid) && capSet && attemptsSet
}

interface Value { booleanValue?: boolean; integerValue?: string; doubleValue?: number; arrayValue?: { values?: Array<{ stringValue?: string }> } }

/** A Firestore number field as a number; null when it is absent or not a number. */
function numberOf(value: Value | undefined): number | null {
  if (value === undefined) return null
  if (typeof value.doubleValue === 'number') return value.doubleValue
  if (typeof value.integerValue === 'string' && /^-?\d+$/.test(value.integerValue)) return Number(value.integerValue)
  return null
}

/** A Firestore array of strings; null when it is absent. */
function stringsOf(value: Value | undefined): string[] | null {
  return value === undefined ? null : (value.arrayValue?.values ?? []).flatMap((item) => typeof item.stringValue === 'string' ? [item.stringValue] : [])
}

/**
 * One switch document, read at most every 30 s: `parse` turns its fields into settings; a 404 is `off`; a failed read
 * keeps what was read last, and with nothing read yet, `off`.
 */
function cachedDocument<T>(url: string, name: string, token: () => Promise<string>, fetcher: typeof fetch, clock: () => number, off: T, parse: (fields: Record<string, Value>) => T): () => Promise<T> {
  let last: { at: number; settings: T } | null = null
  return async () => {
    if (last !== null && clock() - last.at < SETTINGS_TTL_MS) return last.settings
    let settings: T
    try {
      const response = await fetcher(url, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(5_000) })
      if (response.status === 404) settings = off
      else if (!response.ok) throw new Error(`hostedConfig/${name} read failed (${response.status})`)
      else settings = parse((await response.json() as { fields?: Record<string, Value> }).fields ?? {})
    } catch {
      settings = last?.settings ?? off
    }
    last = { at: clock(), settings }
    return settings
  }
}

/** `hostedConfig/compatibleTransport` and `hostedConfig/hostedChrome` in Firestore, each read at most every 30 s (see the top of this file). */
export function firestoreHostedAccess(projectId: string, token: () => Promise<string>, fetcher: typeof fetch = fetch, clock: () => number = Date.now): HostedAccessSource {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
  const documents = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/hostedConfig`
  const compatibleTransport = cachedDocument(`${documents}/compatibleTransport`, 'compatibleTransport', token, fetcher, clock, HOSTED_ACCESS_OFF.compatibleTransport,
    (fields) => ({ enabled: fields.enabled?.booleanValue === true, allowedUids: stringsOf(fields.allowedUids) }))
  const hostedChrome = cachedDocument(`${documents}/hostedChrome`, 'hostedChrome', token, fetcher, clock, HOSTED_CHROME_OFF,
    (fields) => ({ enabled: fields.enabled?.booleanValue === true, allowedUids: stringsOf(fields.allowedUids) ?? [], monthlyCapUsd: numberOf(fields.monthlyCapUsd), dailyAttemptsPerAccount: numberOf(fields.dailyAttemptsPerAccount) }))
  return { read: async () => ({ compatibleTransport: await compatibleTransport(), hostedChrome: await hostedChrome() }) }
}
