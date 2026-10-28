/**
 * The run's spend ledger (ROADMAP PA item 4, ADR 0005): what a run may spend on third parties, reserved before each
 * paid call and settled after it. Concurrent pages, retries and providers of one run reserve from the same ledger, so
 * none of them can pass its cap; a page's own cap (`perRequestUsd`) is a child ledger over the same totals.
 */

import type { SpendLedger, SpendReservation } from '@w2l/contracts'
import { tariffMonthlyFixedUsd, type VendorTariff } from './accessGrant.js'

/** Floating sums of cents: a reservation equal to what is left still fits. */
const EPSILON = 1e-9

class Ledger implements SpendLedger {
  settledUsd = 0
  reservedUsd = 0

  constructor(readonly capUsd: number | null, private readonly parent: Ledger | null) {}

  private fits(amountUsd: number): boolean {
    const own = this.capUsd === null || this.settledUsd + this.reservedUsd + amountUsd <= this.capUsd + EPSILON
    return own && (this.parent === null || this.parent.fits(amountUsd))
  }

  private add(field: 'settledUsd' | 'reservedUsd', amountUsd: number): void {
    this[field] += amountUsd
    this.parent?.add(field, amountUsd)
  }

  reserve(ceilingUsd: number): SpendReservation | null {
    if (!Number.isFinite(ceilingUsd) || ceilingUsd < 0 || !this.fits(ceilingUsd)) return null
    this.add('reservedUsd', ceilingUsd)
    let open = true
    return {
      settle: (reportedUsd) => {
        if (!open) return 0
        open = false
        // A reported price is the charge, above the ceiling too (the record then shows it); none reported is charged at the ceiling.
        const charged = typeof reportedUsd === 'number' && Number.isFinite(reportedUsd) && reportedUsd >= 0 ? reportedUsd : ceilingUsd
        this.add('reservedUsd', -ceilingUsd)
        this.add('settledUsd', charged)
        return charged
      },
      release: () => {
        if (!open) return
        open = false
        this.add('reservedUsd', -ceilingUsd)
      },
    }
  }

  child(capUsd: number | null): SpendLedger {
    return new Ledger(capUsd, this)
  }
}

/** A run's ledger with this cap (null: none), opened with what the task's earlier runs already settled. */
export function createSpendLedger(capUsd: number | null, alreadySettledUsd = 0): SpendLedger {
  if (capUsd !== null && (!Number.isFinite(capUsd) || capUsd < 0)) throw new Error('a spend cap is a non-negative number of US dollars, or null')
  const ledger = new Ledger(capUsd, null)
  if (Number.isFinite(alreadySettledUsd) && alreadySettledUsd > 0) ledger.settledUsd = alreadySettledUsd
  return ledger
}

/**
 * The operator's ledger for one month (ADR 0005, revision of 2026-10-27, decision three): its monthly cap (null: none),
 * opened with the month's fixed rents settled first, each tariff's `perIpMonthUsd` for every rented IP, and what the
 * month's calls already settled. A rent is charged here once a month, never to a call; what a call may spend is what
 * the cap leaves after it.
 */
export function openMonthlySpendLedger(capUsd: number | null, tariffs: Readonly<Record<string, VendorTariff>>, settledThisMonthUsd = 0): SpendLedger {
  const fixedUsd = Object.values(tariffs).reduce((sum, tariff) => sum + tariffMonthlyFixedUsd(tariff), 0)
  // A month whose rents do not sum to a finite amount is never opened as if none were owed.
  if (!Number.isFinite(fixedUsd)) throw new Error('the month\'s fixed rents do not sum to a finite number of US dollars')
  return createSpendLedger(capUsd, fixedUsd + Math.max(settledThisMonthUsd, 0))
}
