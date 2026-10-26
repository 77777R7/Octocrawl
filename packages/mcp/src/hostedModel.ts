/**
 * The json model fallback on hosted Octocrawl (decided by Howard on 2026-10-24): `modelFallback: true` calls Claude
 * Haiku 5.5 on Octocrawl's own Anthropic account for a page whose json the page's own data left incomplete.
 *
 *   price      2 credits more for each page on which the model was called (CREDITS.model), on an account's credits
 *              only; nothing when no call was made (modelFallback off, the json already complete, a refusal below)
 *   switch     `hostedConfig/model` field `enabled`, read at most every 30 s; a document that is absent, or an
 *              `enabled` that is not true, is off, so a deploy alone turns nothing on
 *   cap        USD a UTC day for every hosted call together (`dailyCapUsd` on the same document, else
 *              DEFAULT_MODEL_DAILY_CAP_USD), counted in `hostedModelSpend/{day}` in micro-USD
 *
 * Before a page's first call its gate reserves the most the page's calls can cost (modelCallsMaxCostUsd in
 * @w2l/api: both attempts, a byte bound on the input, the most output a call may write) in one commit with an
 * update-time precondition, so two instances can never pass the cap together; after it, the reservation is replaced
 * by what the calls cost, as `modelUsage.externalCostUsd` reports it, or given back when no call was made. A cost
 * that is not known keeps the whole reservation: unknown is not zero. A switch that is off, a cap that is reached, a
 * caller without credits for the +2 or a budget that cannot be read calls no model and charges nothing: the json
 * stays as deterministic extraction read it, with a `model_unavailable` issue that says which.
 *
 * Log lines name the day, the tokens, the cost and the reservation; never the page, the prompt, the schema, the
 * model's answer or the key.
 */
import type { StructuredModelAdmission, StructuredModelGate, StructuredModelUsage } from '@w2l/contracts'

export const DEFAULT_MODEL_DAILY_CAP_USD = 5
/** How long a read of `hostedConfig/model` is kept. */
const SETTINGS_TTL_MS = 30_000
/** The day's spend record is kept this long, for questions about a day's cost. */
const SPEND_RETENTION_DAYS = 90
const MICRO = 1_000_000

/** The refusals a caller reads in its json's `model_unavailable` issue. */
export const MODEL_REFUSALS = {
  notOffered: 'this hosted server does not offer the json model fallback',
  needsAccount: 'the json model fallback on hosted Octocrawl needs an account\'s key or connection: it costs 2 credits a page on which the model is called',
  switchedOff: 'the json model fallback is switched off on hosted Octocrawl for now',
  credits: 'this account has fewer credits than the page and the json model fallback\'s 2 together, so the model was not called',
  unpriced: 'hosted Octocrawl cannot bound what this model\'s calls cost, so it did not call it',
  budgetUnread: 'hosted Octocrawl could not check its daily budget for the json model fallback, so it did not call the model',
  cap: (capUsd: number) => `hosted Octocrawl's daily budget for the json model fallback ($${capUsd}) is used up; it comes back at 00:00 UTC`,
} as const

/** Whether a scrape body's, or a job request's, formats ask for the json model fallback. */
export function asksModelFallback(formats: unknown): boolean {
  return Array.isArray(formats) && formats.some((format: unknown) => format !== null && typeof format === 'object' && (format as { type?: unknown }).type === 'json' && (format as { modelFallback?: unknown }).modelFallback === true)
}

export interface ModelSettings { enabled: boolean; dailyCapUsd: number }

/** The switch and the cap, as the operator set them. */
export interface ModelSettingsSource { read(): Promise<ModelSettings> }

/** The day's model spend for every hosted call together, in micro-USD. */
export interface ModelSpendStore {
  /** Adds `micro` to the day's spend unless that would pass `capMicro`, in one atomic commit; refuses, adding nothing, when it would. */
  reserve(day: string, micro: number, capMicro: number, now?: Date): Promise<{ ok: true } | { ok: false; spentMicro: number }>
  /** Adds `deltaMicro` (negative to give back) to the day's spend, as a server-side increment. */
  adjust(day: string, deltaMicro: number): Promise<void>
}

export class MemoryModelSettings implements ModelSettingsSource {
  constructor(public settings: ModelSettings = { enabled: false, dailyCapUsd: DEFAULT_MODEL_DAILY_CAP_USD }) {}
  async read(): Promise<ModelSettings> { return this.settings }
}

export class MemoryModelSpend implements ModelSpendStore {
  readonly spent = new Map<string, number>()
  async reserve(day: string, micro: number, capMicro: number): Promise<{ ok: true } | { ok: false; spentMicro: number }> {
    const now = this.spent.get(day) ?? 0
    if (now + micro > capMicro) return { ok: false, spentMicro: now }
    this.spent.set(day, now + micro)
    return { ok: true }
  }
  async adjust(day: string, deltaMicro: number): Promise<void> { this.spent.set(day, (this.spent.get(day) ?? 0) + deltaMicro) }
}

export interface HostedModelOptions {
  /** The model the engine calls (structuredModelConfigFromEnv), or null when the server has none. */
  model: { provider?: string; model: string } | null
  settings: ModelSettingsSource
  spend: ModelSpendStore
  log?: (line: string) => void
  now?: () => Date
}

/** A gate for one call or one job slice, and the pages on which its model was called. */
export interface CountedGate { gate: StructuredModelGate; pagesCalled: () => number }

export class HostedModel {
  private readonly log: (line: string) => void
  private readonly now: () => Date
  constructor(private readonly options: HostedModelOptions) {
    this.log = options.log ?? ((line: string) => console.log(line))
    this.now = options.now ?? (() => new Date())
  }

  /** Whether a call may be offered the model now: a model is configured and the switch is on. A failed read is off. */
  async offered(): Promise<boolean> {
    if (this.options.model === null) return false
    return (await this.options.settings.read().catch(() => null))?.enabled === true
  }

  /**
   * A gate for a call or a slice. `refusal` (the caller has no credits reserved for the model) refuses every page with
   * that reason; null admits each page that the switch and the day's budget allow.
   */
  gate(refusal: string | null): CountedGate {
    let pagesCalled = 0
    const refuse = (message: string): StructuredModelAdmission => ({ ok: false, message })
    const gate: StructuredModelGate = {
      admit: async ({ maxCostUsd }) => {
        if (refusal !== null) return refuse(refusal)
        const settings = await this.options.settings.read().catch(() => null)
        if (settings === null || !settings.enabled) return refuse(MODEL_REFUSALS.switchedOff)
        if (maxCostUsd === null || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) return refuse(MODEL_REFUSALS.unpriced)
        const at = this.now()
        const day = at.toISOString().slice(0, 10)
        const reserved = Math.ceil(maxCostUsd * MICRO)
        let taken: Awaited<ReturnType<ModelSpendStore['reserve']>>
        try { taken = await this.options.spend.reserve(day, reserved, Math.floor(settings.dailyCapUsd * MICRO), at) }
        catch (error) {
          this.log(JSON.stringify({ severity: 'ERROR', event: 'hosted_model_budget_failed', day, message: error instanceof Error ? error.message : String(error) }))
          return refuse(MODEL_REFUSALS.budgetUnread)
        }
        if (!taken.ok) {
          this.log(JSON.stringify({ severity: 'WARNING', event: 'hosted_model_cap_reached', day, spentUsd: taken.spentMicro / MICRO, capUsd: settings.dailyCapUsd }))
          return refuse(MODEL_REFUSALS.cap(settings.dailyCapUsd))
        }
        return {
          ok: true,
          settle: async (usage: StructuredModelUsage | null) => {
            const called = usage !== null && usage.attempts > 0
            if (called) pagesCalled++
            // No call gives everything back; a cost that is not known keeps the whole bound, since unknown is not zero.
            const actual = !called ? 0 : usage.externalCostUsd === null ? null : Math.ceil(usage.externalCostUsd * MICRO)
            const delta = actual === null ? 0 : actual - reserved
            this.log(JSON.stringify({ severity: actual === null ? 'WARNING' : 'INFO', event: 'hosted_model_call', day, attempts: usage?.attempts ?? 0, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, costUsd: actual === null ? null : actual / MICRO, reservedUsd: reserved / MICRO }))
            if (delta !== 0) {
              await this.options.spend.adjust(day, delta).catch((error: unknown) => {
                // Not given back: the day counts more than was spent, never less.
                this.log(JSON.stringify({ severity: 'ERROR', event: 'hosted_model_settle_failed', day, deltaUsd: delta / MICRO, message: error instanceof Error ? error.message : String(error) }))
              })
            }
          },
        }
      },
    }
    return { gate, pagesCalled: () => pagesCalled }
  }
}

// ---- Firestore: `hostedConfig/model` holds the switch and the cap, `hostedModelSpend/{day}` the day's spend ----

interface Value { integerValue?: string; doubleValue?: number; booleanValue?: boolean; timestampValue?: string }
interface FirestoreDoc { name: string; fields?: Record<string, Value>; updateTime?: string }

function firestoreDocuments(projectId: string): string {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
  return `projects/${projectId}/databases/(default)/documents`
}

/**
 * `hostedConfig/model`: `enabled` (a boolean; anything else is off) and `dailyCapUsd` (a positive number; absent:
 * DEFAULT_MODEL_DAILY_CAP_USD). Read at most every 30 s; a failed read keeps what was read last, and with nothing read
 * yet the switch is off.
 */
export function firestoreModelSettings(projectId: string, token: () => Promise<string>, fetcher: typeof fetch = fetch, clock: () => number = Date.now): ModelSettingsSource {
  const resource = firestoreDocuments(projectId)
  let last: { at: number; settings: ModelSettings } | null = null
  return {
    async read() {
      if (last !== null && clock() - last.at < SETTINGS_TTL_MS) return last.settings
      let settings: ModelSettings
      try {
        const response = await fetcher(`https://firestore.googleapis.com/v1/${resource}/hostedConfig/model`, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(5_000) })
        if (response.status === 404) settings = { enabled: false, dailyCapUsd: DEFAULT_MODEL_DAILY_CAP_USD }
        else if (!response.ok) throw new Error(`hostedConfig/model read failed (${response.status})`)
        else {
          const fields = (await response.json() as FirestoreDoc).fields ?? {}
          const cap = fields.dailyCapUsd?.doubleValue ?? (fields.dailyCapUsd?.integerValue === undefined ? undefined : Number(fields.dailyCapUsd.integerValue))
          settings = { enabled: fields.enabled?.booleanValue === true, dailyCapUsd: typeof cap === 'number' && Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_MODEL_DAILY_CAP_USD }
        }
      } catch {
        settings = last?.settings ?? { enabled: false, dailyCapUsd: DEFAULT_MODEL_DAILY_CAP_USD }
      }
      last = { at: clock(), settings }
      return settings
    },
  }
}

/** `hostedModelSpend/{day}`: `microUsd`, reserved in a commit with an update-time precondition, adjusted by increments. */
export class FirestoreModelSpend implements ModelSpendStore {
  private readonly resource: string
  private readonly endpoint: string
  constructor(projectId: string, private readonly token: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {
    this.resource = firestoreDocuments(projectId)
    this.endpoint = `https://firestore.googleapis.com/v1/${this.resource}`
  }

  async reserve(day: string, micro: number, capMicro: number, now = new Date()): Promise<{ ok: true } | { ok: false; spentMicro: number }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('day is malformed')
    const name = `${this.resource}/hostedModelSpend/${day}`
    const expireAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + SPEND_RETENTION_DAYS)).toISOString()
    for (let attempt = 0; attempt < 6; attempt++) {
      const token = await this.token()
      const read = await this.fetcher(`https://firestore.googleapis.com/v1/${name}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
      let spent = 0
      let updateTime: string | null = null
      if (read.status !== 404) {
        if (!read.ok) throw new Error(`model spend read failed (${read.status})`)
        const doc = await read.json() as FirestoreDoc
        spent = Number(doc.fields?.microUsd?.integerValue ?? '0')
        if (doc.name !== name || !doc.updateTime || !Number.isSafeInteger(spent)) throw new Error('model spend document is malformed')
        updateTime = doc.updateTime
      }
      if (spent + micro > capMicro) return { ok: false, spentMicro: spent }
      const response = await this.fetcher(`${this.endpoint}:commit`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
        body: JSON.stringify({ writes: [{
          update: { name, fields: { day: { stringValue: day }, microUsd: { integerValue: String(spent + micro) }, expireAt: { timestampValue: expireAt } } },
          currentDocument: updateTime === null ? { exists: false } : { updateTime },
        }] }),
      })
      if (response.ok) return { ok: true }
      if (response.status === 409 || response.status === 412) continue
      if (response.status === 400) {
        const error = await response.json().catch(() => null) as { error?: { status?: string } } | null
        if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED') continue
      }
      throw new Error(`model spend commit failed (${response.status})`)
    }
    throw new Error('model spend contention exceeded retry budget')
  }

  async adjust(day: string, deltaMicro: number): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('day is malformed')
    if (!Number.isSafeInteger(deltaMicro)) throw new Error('model spend delta is malformed')
    const response = await this.fetcher(`${this.endpoint}:commit`, {
      method: 'POST', headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ writes: [{
        update: { name: `${this.resource}/hostedModelSpend/${day}`, fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: 'microUsd', increment: { integerValue: String(deltaMicro) } }],
        // The day's reservation made the document; an adjust never makes one.
        currentDocument: { exists: true },
      }] }),
    })
    if (!response.ok) throw new Error(`model spend adjust failed (${response.status})`)
  }
}
