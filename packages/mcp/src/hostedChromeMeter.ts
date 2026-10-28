/**
 * hosted_chrome's spend counter (ADR 0005, revision of 2026-10-27; D5 of the stage H plan): the two numbers of the
 * account switch (`hostedConfig/hostedChrome`, hostedAccess.ts), counted before each read of the rung.
 *
 *   monthlyCapUsd            the operator's dollar cap a month (UTC) for the rung, enforced on its monthly ledger
 *                            (openMonthlySpendLedger): opened with the month's fixed rents of the egress tariff settled
 *                            first, then what the month's reads settled (`hostedChromeSpend/{YYYY-MM}`, settled reads
 *                            only), then this instance's reads in flight. A read whose ceiling does not fit is not made.
 *   dailyAttemptsPerAccount  the reads one account may start a UTC day, one `hostedQuotas/{day}-hostedChrome-{uid}`
 *                            counter taken in a commit with an update-time precondition (FirestoreHostedQuota), so two
 *                            instances never pass it together. An attempt is taken once the cap admits the read, and
 *                            is not given back: a read that started and failed still counts.
 *
 * The values are the switch's, with no default: while either is unset the switch grants the rung to no one, and the
 * counter admits nothing. A read the counter refuses does not use the rung, and the scrape does not fail: its page is
 * what the rungs before it read, with a `hosted_chrome_not_admitted` warning and a `ladder_channel_skipped` event that
 * say why (engine.ts HostedChromeMeter). So does a counter that cannot read the month's spend or take an attempt:
 * unread is not zero.
 *
 * A read is charged under the egress tariff, its rent left out (tariffCostUsd): bytes the exit did not report are
 * charged at the ceiling's allowance, and a read that threw at its ceiling. Cloud Run's own egress (`egress: null`)
 * pays no third party, so its reads settle at 0 and are still counted; Cloud Run's compute is the project's billing
 * budget's, not this cap's. The month's total counts settled reads only, so instances that reserve at once can pass the
 * cap by at most the ceilings of the reads the other instances have in flight.
 *
 * Log lines name the month, the day, the charge and the limits; never the page, the proxy or its login.
 */
import {
  normalizeVendorTariff, openMonthlySpendLedger, tariffCeilingUsd, tariffCostUsd, tariffMonthlyFixedUsd,
  type HostedChromeAdmission, type HostedChromeMeter, type VendorTariff,
} from '@w2l/api'
import type { FetchResult } from '@w2l/contracts'
import { HOSTED_CHROME_OFF, hostedChromeAdmits, type HostedAccessSource } from './hostedAccess.js'
import type { HostedQuota } from './hostedApi.js'
import { utcMonth } from './hostedCredits.js'

const MICRO = 1_000_000
/** A month's spend record is kept this long after the month ends, for questions about its cost. */
const SPEND_RETENTION_DAYS = 90
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const PAGE_KEPT = 'the page is what the rungs before it read'

/** What a caller reads in the `hosted_chrome_not_admitted` warning. */
export const HOSTED_CHROME_REFUSALS = {
  switchedOff: `hosted_chrome was not used: it is not switched on for this account; ${PAGE_KEPT}`,
  budgetUnread: `hosted_chrome was not used: hosted Octocrawl could not check its budget for it; ${PAGE_KEPT}`,
  monthlyCap: (capUsd: number) => `hosted_chrome was not used: hosted Octocrawl's monthly budget for it ($${capUsd}) is used up until the 1st (UTC); ${PAGE_KEPT}`,
  dailyAttempts: (limit: number) => `hosted_chrome was not used: this account's ${limit} hosted_chrome attempts for today are used up until 00:00 UTC; ${PAGE_KEPT}`,
} as const

/** The month's settled hosted_chrome spend, in micro-USD, and the reads settled. */
export interface HostedChromeSpendStore {
  /** What the month's settled reads cost together; 0 for a month with none. */
  settledMicro(month: string): Promise<number>
  /** Adds one settled read and what it was charged. */
  settle(month: string, micro: number): Promise<void>
}

export class MemoryHostedChromeSpend implements HostedChromeSpendStore {
  readonly months = new Map<string, { settledMicroUsd: number; calls: number }>()
  async settledMicro(month: string): Promise<number> { return this.months.get(month)?.settledMicroUsd ?? 0 }
  async settle(month: string, micro: number): Promise<void> {
    const held = this.months.get(month) ?? { settledMicroUsd: 0, calls: 0 }
    this.months.set(month, { settledMicroUsd: held.settledMicroUsd + micro, calls: held.calls + 1 })
  }
}

/** The exit hosted_chrome's reads leave through, as the operator's config names it, and its tariff as JSON (normalizeVendorTariff). */
export interface HostedChromeEgress { vendor: string; tariff: unknown }

export interface HostedChromeCounterOptions {
  /** The switches, read for the account switch's two numbers. */
  settings: HostedAccessSource
  spend: HostedChromeSpendStore
  /** The hosted API's daily counters (`hostedQuotas`). */
  quota: HostedQuota
  /** The priced exit, or null for Cloud Run's own egress, which pays no third party. Required: no default. */
  egress: HostedChromeEgress | null
  log?: (line: string) => void
  now?: () => Date
}

export class HostedChromeCounter implements HostedChromeMeter {
  private readonly tariffs: Readonly<Record<string, VendorTariff>>
  private readonly tariff: VendorTariff | null
  private readonly ceilingUsd: number
  private readonly fixedMonthlyUsd: number
  /** What this instance's admitted reads reserved and have not settled, by month. */
  private readonly inFlight = new Map<string, number>()
  private readonly log: (line: string) => void
  private readonly now: () => Date

  constructor(private readonly options: HostedChromeCounterOptions) {
    if (options.egress === undefined) throw new Error('hosted_chrome\'s counter needs its egress: a priced exit, or null for Cloud Run\'s own')
    if (options.egress === null) {
      this.tariff = null
      this.tariffs = {}
    } else {
      const read = normalizeVendorTariff(options.egress.vendor, options.egress.tariff)
      if (!read.ok) throw new Error(`hosted_chrome's egress tariff is refused: ${read.problems.map((problem) => `${problem.field}: ${problem.reason}`).join('; ')}`)
      this.tariff = read.tariff
      this.tariffs = { [options.egress.vendor]: read.tariff }
    }
    this.ceilingUsd = this.tariff === null ? 0 : tariffCeilingUsd(this.tariff)
    this.fixedMonthlyUsd = this.tariff === null ? 0 : tariffMonthlyFixedUsd(this.tariff)
    if (!Number.isFinite(this.ceilingUsd) || this.ceilingUsd < 0) throw new Error('hosted_chrome\'s egress tariff has no finite ceiling a read')
    this.log = options.log ?? ((line: string) => console.log(line))
    this.now = options.now ?? (() => new Date())
  }

  async admit({ account }: { account: string | undefined }): Promise<HostedChromeAdmission> {
    const settings = (await this.options.settings.read().catch(() => null))?.hostedChrome ?? HOSTED_CHROME_OFF
    if (!hostedChromeAdmits(settings, account)) return { ok: false, reason: 'switched_off', message: HOSTED_CHROME_REFUSALS.switchedOff }
    const uid = account!
    const capUsd = settings.monthlyCapUsd!
    const limit = settings.dailyAttemptsPerAccount!
    const at = this.now()
    const month = utcMonth(at)
    const day = at.toISOString().slice(0, 10)
    const unread = (stage: string, error: unknown): HostedChromeAdmission => {
      this.log(JSON.stringify({ severity: 'ERROR', event: 'hosted_chrome_budget_failed', stage, month, day, message: error instanceof Error ? error.message : String(error) }))
      return { ok: false, reason: 'budget_unread', message: HOSTED_CHROME_REFUSALS.budgetUnread }
    }
    let settledMicro: number
    try { settledMicro = await this.options.spend.settledMicro(month) } catch (error) { return unread('month', error) }
    const inFlightUsd = this.inFlight.get(month) ?? 0
    const reservation = openMonthlySpendLedger(capUsd, this.tariffs, settledMicro / MICRO + inFlightUsd).reserve(this.ceilingUsd)
    if (reservation === null) {
      const detail = { capUsd, fixedMonthlyUsd: this.fixedMonthlyUsd, settledUsd: settledMicro / MICRO, inFlightUsd, ceilingUsd: this.ceilingUsd, month }
      this.log(JSON.stringify({ severity: 'WARNING', event: 'hosted_chrome_cap_reached', ...detail }))
      return { ok: false, reason: 'monthly_cap', message: HOSTED_CHROME_REFUSALS.monthlyCap(capUsd), detail }
    }
    // Held before the attempt is taken, so a read admitted meanwhile on this instance sees it.
    this.hold(month, this.ceilingUsd)
    let taken: Awaited<ReturnType<HostedQuota['consume']>>
    try { taken = await this.options.quota.consume([{ id: `${day}-hostedChrome-${uid}`, limit }], at) } catch (error) {
      this.hold(month, -this.ceilingUsd)
      return unread('attempts', error)
    }
    if (!taken.ok) {
      this.hold(month, -this.ceilingUsd)
      this.log(JSON.stringify({ severity: 'WARNING', event: 'hosted_chrome_attempts_reached', day, limit }))
      return { ok: false, reason: 'daily_attempts', message: HOSTED_CHROME_REFUSALS.dailyAttempts(limit), detail: { limit, day } }
    }
    let open = true
    return {
      ok: true,
      settle: async (result: FetchResult | null, called: boolean) => {
        if (!open) return
        open = false
        // A read that never went out costs nothing; its attempt stays taken.
        if (!called) { this.hold(month, -this.ceilingUsd); reservation.release(); return }
        const charged = reservation.settle(this.costUsd(result))
        const micro = Math.ceil(charged * MICRO - 1e-6)
        // The ceiling is held until the month's total has the read, so no read admitted meanwhile here misses it.
        try { await this.options.spend.settle(month, micro) } catch (error) {
          // Not counted: the month's total is short by this read, which the line names.
          this.log(JSON.stringify({ severity: 'ERROR', event: 'hosted_chrome_settle_failed', month, chargedUsd: micro / MICRO, message: error instanceof Error ? error.message : String(error) }))
          return
        } finally { this.hold(month, -this.ceilingUsd) }
        this.log(JSON.stringify({ severity: 'INFO', event: 'hosted_chrome_read', month, day, chargedUsd: micro / MICRO, ceilingUsd: this.ceilingUsd, answered: result !== null }))
      },
    }
  }

  /** What one read cost the third party: 0 without one; under the tariff for a read that answered; null (its ceiling) for one that threw. */
  private costUsd(result: FetchResult | null): number | null {
    if (this.tariff === null) return 0
    if (result === null) return null
    return tariffCostUsd(this.tariff, result.usage.wallMs, { proxyBytes: result.usage.vendorProxyBytes ?? null, solves: 0 })
  }

  private hold(month: string, usd: number): void {
    const held = Math.max(0, (this.inFlight.get(month) ?? 0) + usd)
    if (held < 1e-9) this.inFlight.delete(month)
    else this.inFlight.set(month, held)
  }
}

interface FirestoreDoc { name: string; fields?: Record<string, { integerValue?: string }>; updateTime?: string }

/**
 * `hostedChromeSpend/{YYYY-MM}`: `settledMicroUsd` and `calls`, added by server-side increments as each read settles,
 * and `expireAt` (TTL) 90 days after the month ends.
 */
export class FirestoreHostedChromeSpend implements HostedChromeSpendStore {
  private readonly resource: string
  private readonly endpoint: string
  constructor(projectId: string, private readonly token: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    this.resource = `projects/${projectId}/databases/(default)/documents`
    this.endpoint = `https://firestore.googleapis.com/v1/${this.resource}`
  }

  async settledMicro(month: string): Promise<number> {
    if (!MONTH.test(month)) throw new Error('month is malformed')
    const name = `${this.resource}/hostedChromeSpend/${month}`
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${name}`, { headers: { authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(5_000) })
    if (response.status === 404) return 0
    if (!response.ok) throw new Error(`hosted_chrome spend read failed (${response.status})`)
    const doc = await response.json() as FirestoreDoc
    const micro = Number(doc.fields?.settledMicroUsd?.integerValue ?? '0')
    if (doc.name !== name || !doc.updateTime || !Number.isSafeInteger(micro) || micro < 0) throw new Error('hosted_chrome spend document is malformed')
    return micro
  }

  async settle(month: string, micro: number): Promise<void> {
    if (!MONTH.test(month)) throw new Error('month is malformed')
    if (!Number.isSafeInteger(micro) || micro < 0) throw new Error('hosted_chrome spend is malformed')
    const [year, monthNumber] = month.split('-').map(Number) as [number, number]
    // The first of the next month, plus the retention.
    const expireAt = new Date(Date.UTC(year, monthNumber, 1 + SPEND_RETENTION_DAYS)).toISOString()
    const increment = (fieldPath: string, by: number) => ({ fieldPath, increment: { integerValue: String(by) } })
    const response = await this.fetcher(`${this.endpoint}:commit`, {
      method: 'POST', headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ writes: [{
        update: { name: `${this.resource}/hostedChromeSpend/${month}`, fields: { month: { stringValue: month }, expireAt: { timestampValue: expireAt } } },
        updateMask: { fieldPaths: ['month', 'expireAt'] },
        updateTransforms: [increment('settledMicroUsd', micro), increment('calls', 1)],
      }] }),
    })
    if (!response.ok) throw new Error(`hosted_chrome spend settle failed (${response.status})`)
  }
}
