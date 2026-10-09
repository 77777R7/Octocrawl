import { describe, expect, it } from 'vitest'
import { createSpendLedger } from '../src/spend.js'

/** The run's spend ledger (ROADMAP PA item 4): a paid call reserves its ceiling first and settles after. */
describe('the spend ledger', () => {
  it('reserves a ceiling only while it fits the cap, counting what is reserved and not yet settled', () => {
    const run = createSpendLedger(1)
    const a = run.reserve(0.4)!
    const b = run.reserve(0.4)!
    expect(run.reservedUsd).toBeCloseTo(0.8)
    // Two calls in flight hold 0.8 of 1: a third of 0.4 does not fit, one of 0.2 does.
    expect(run.reserve(0.4)).toBeNull()
    const c = run.reserve(0.2)!
    expect(c).not.toBeNull()
    expect(a.settle(0.1)).toBeCloseTo(0.1)
    // Settled below its ceiling: room comes back.
    expect(run.settledUsd).toBeCloseTo(0.1)
    expect(run.reservedUsd).toBeCloseTo(0.6)
    expect(run.reserve(0.3)).not.toBeNull()
    b.release()
    c.release()
    expect(run.reservedUsd).toBeCloseTo(0.3)
  })

  it('charges the ceiling when the provider reports no price, and the reported price when it does, above the ceiling too', () => {
    const run = createSpendLedger(null)
    expect(run.reserve(0.05)!.settle(null)).toBeCloseTo(0.05)
    expect(run.reserve(0.05)!.settle(0.08)).toBeCloseTo(0.08)
    expect(run.settledUsd).toBeCloseTo(0.13)
    expect(run.reservedUsd).toBe(0)
  })

  it('settles or releases a reservation once', () => {
    const run = createSpendLedger(1)
    const r = run.reserve(0.5)!
    expect(r.settle(null)).toBeCloseTo(0.5)
    expect(r.settle(null)).toBe(0)
    r.release()
    expect(run.settledUsd).toBeCloseTo(0.5)
    expect(run.reservedUsd).toBe(0)
  })

  it('caps one page apart from the run it belongs to: a child counts against both', () => {
    const run = createSpendLedger(1)
    const page = run.child(0.3)
    expect(page.reserve(0.4)).toBeNull()
    page.reserve(0.2)!.settle(null)
    expect(page.reserve(0.2)).toBeNull()
    expect(run.settledUsd).toBeCloseTo(0.2)
    // Another page has its own 0.3, within what the run has left.
    const other = run.child(0.3)
    expect(other.reserve(0.3)).not.toBeNull()
    expect(run.reservedUsd).toBeCloseTo(0.3)
    expect(run.child(null).reserve(0.6)).toBeNull()
  })

  it('takes a cap at its exact remainder and refuses a ceiling that is not a price', () => {
    const run = createSpendLedger(0.3)
    run.reserve(0.1)!.settle(null)
    run.reserve(0.1)!.settle(null)
    expect(run.reserve(0.1)).not.toBeNull()
    expect(createSpendLedger(null).reserve(Number.NaN)).toBeNull()
    expect(createSpendLedger(null).reserve(-1)).toBeNull()
    expect(() => createSpendLedger(-1)).toThrow(/non-negative/)
  })
})
