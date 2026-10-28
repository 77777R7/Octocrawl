/**
 * Hosted Octocrawl's access capabilities, granted per request (ROADMAP stage H item 2; ADR 0005). Hosted Octocrawl reads
 * no access grant: a call's capabilities come from the operator's switches, for the caller that sent it.
 *
 *   compatible_transport   `hostedConfig/compatibleTransport`: `enabled` (true turns it on; absent, or anything else, is
 *                          off, so a deploy alone turns nothing on) and `allowedUids` (an array of account uids: only those
 *                          accounts' calls; absent: every caller). Read at most every 30 s; a failed read keeps what was
 *                          read last, and with nothing read yet the switch is off.
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
}

/** The operator's switches, as they stand. */
export interface HostedAccessSource { read(): Promise<HostedAccessSettings> }

export const HOSTED_ACCESS_OFF: HostedAccessSettings = { compatibleTransport: { enabled: false, allowedUids: null } }

/** What a hosted engine is built with to grant capabilities per call: the names, and the hosts the transport serves. */
export const HOSTED_ACCESS_ENGINE = { callCapabilities: HOSTED_CALL_CAPABILITIES, compatHosts: COMPAT_BENEFIT_HOSTS } as const

export class MemoryHostedAccess implements HostedAccessSource {
  constructor(public settings: HostedAccessSettings = HOSTED_ACCESS_OFF) {}
  async read(): Promise<HostedAccessSettings> { return this.settings }
}

/** The capabilities a call holds now: one by `uid`'s account, or by a caller without one. No switches: none. */
export async function grantedCapabilities(source: HostedAccessSource | undefined, caller: { uid?: string | undefined }): Promise<CallCapability[]> {
  if (source === undefined) return []
  const { compatibleTransport } = await source.read()
  const admitted = compatibleTransport.allowedUids === null || (caller.uid !== undefined && compatibleTransport.allowedUids.includes(caller.uid))
  return compatibleTransport.enabled && admitted ? ['compatible_transport'] : []
}

interface Value { booleanValue?: boolean; arrayValue?: { values?: Array<{ stringValue?: string }> } }

/** `hostedConfig/compatibleTransport` in Firestore, read at most every 30 s (see the top of this file). */
export function firestoreHostedAccess(projectId: string, token: () => Promise<string>, fetcher: typeof fetch = fetch, clock: () => number = Date.now): HostedAccessSource {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/hostedConfig/compatibleTransport`
  let last: { at: number; settings: HostedAccessSettings } | null = null
  return {
    async read() {
      if (last !== null && clock() - last.at < SETTINGS_TTL_MS) return last.settings
      let settings: HostedAccessSettings
      try {
        const response = await fetcher(url, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(5_000) })
        if (response.status === 404) settings = HOSTED_ACCESS_OFF
        else if (!response.ok) throw new Error(`hostedConfig/compatibleTransport read failed (${response.status})`)
        else {
          const fields = (await response.json() as { fields?: { enabled?: Value; allowedUids?: Value } }).fields ?? {}
          const allowedUids = fields.allowedUids === undefined ? null : (fields.allowedUids.arrayValue?.values ?? []).flatMap((value) => typeof value.stringValue === 'string' ? [value.stringValue] : [])
          settings = { compatibleTransport: { enabled: fields.enabled?.booleanValue === true, allowedUids } }
        }
      } catch {
        settings = last?.settings ?? HOSTED_ACCESS_OFF
      }
      last = { at: clock(), settings }
      return settings
    },
  }
}
