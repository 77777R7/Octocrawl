import { describe, expect, it } from 'vitest'
import type { VerifyContract } from '@w2l/contracts'
import { RegionTracker, regionSpecOf, regionWaitEvent, waitForRegion } from '../src/regionWait.js'

/** A page whose region view is `views[n]` on its nth read (the last from then on), with a clock the waits move. */
function page(views: unknown[]) {
  let now = 0
  let reads = 0
  return {
    reads: () => reads,
    async evaluate() {
      const view = views[Math.min(reads++, views.length - 1)]
      if (view instanceof Error) throw view
      return JSON.stringify(view)
    },
    async waitForTimeout(ms: number) { now += ms; await new Promise((resolve) => setTimeout(resolve, 0)) },
    now: () => now,
  }
}

const view = (markdown: string, extra: Record<string, unknown> = {}) => ({ loading: false, text: markdown.length, markdown, tableCount: 0, ...extra })
const prices: VerifyContract = { checks: [{ type: 'markdownCountMin', pattern: '\\$\\d+', min: 3 }] }

describe('the wait for the region a task needs (ADR 0007, ROADMAP PA item 11)', () => {
  it('asks for one only with a task contract, and reads records only when the list format names its items and fields', () => {
    expect(regionSpecOf({})).toBeUndefined()
    expect(regionSpecOf({ verify: prices })).toEqual({ contract: prices })
    expect(regionSpecOf({ verify: prices, list: { type: 'list' } })).toEqual({ contract: prices })
    const list = { type: 'list' as const, itemSelector: 'li', fields: [{ name: 'name' }] }
    expect(regionSpecOf({ verify: prices, list })).toEqual({ contract: prices, list: { itemSelector: 'li', fields: [{ name: 'name' }] } })
  })

  it('is ready once every check the view can judge holds on two reads in a row with the same counts', async () => {
    // Tesla's inventory filling in: no price, one, then three on two reads.
    const filling = page([view('Inventory Search Results Fetching...', { loading: true }), view('Model 3 $41,990'), view('$41,990 $43,990 $45,990'), view('$41,990 $43,990 $45,990')])
    const outcome = await waitForRegion(filling, { contract: prices }, { maxMs: 10_000, sampleMs: 500, now: filling.now })
    expect(outcome).toMatchObject({ ready: true, empty: false, reads: 4, loading: false, steady: true, checks: [{ index: 0, type: 'markdownCountMin', passed: true, observedCount: 3 }] })
    // Counts still growing are not yet ready: a fourth price on the second passing read.
    const growing = page([view('$1 $2 $3'), view('$1 $2 $3 $4'), view('$1 $2 $3 $4')])
    expect(await waitForRegion(growing, { contract: prices }, { maxMs: 10_000, now: growing.now })).toMatchObject({ ready: true, reads: 3 })
  })

  it('ends at its bound, at least one read, with what it last saw: still loading, still changing, or settled', async () => {
    const loading = page([view('Loading…', { loading: true })])
    expect(await waitForRegion(loading, { contract: prices }, { maxMs: 2_000, sampleMs: 500, now: loading.now })).toMatchObject({ ready: false, loading: true, steady: true, reads: 5 })
    let n = 0
    const changing = { evaluate: async () => JSON.stringify(view(`${'x'.repeat(n++)}`)), waitForTimeout: async () => {} }
    expect(await waitForRegion(changing, { contract: prices }, { maxMs: 0 })).toMatchObject({ ready: false, steady: false, reads: 1 })
    const settled = page([view('No prices on this page')])
    expect(await waitForRegion(settled, { contract: prices }, { maxMs: 1_000, sampleMs: 500, now: settled.now })).toMatchObject({ ready: false, loading: false, steady: true, checks: [{ passed: false, observedCount: 0 }] })
  })

  it('takes an empty list on a settled page as ready when the contract accepts an empty result', async () => {
    const contract: VerifyContract = { checks: [{ type: 'listRecordsMin', min: 1 }], emptyOk: true }
    const list = { itemSelector: 'li', fields: [{ name: 'name' }] }
    const none = page([view('No results', { list: { records: [] } })])
    expect(await waitForRegion(none, { contract, list }, { maxMs: 5_000, now: none.now })).toMatchObject({ ready: true, empty: true })
    // Without emptyOk it is waited for to its bound.
    const strict = page([view('No results', { list: { records: [] } })])
    expect(await waitForRegion(strict, { contract: { checks: contract.checks }, list }, { maxMs: 1_000, now: strict.now })).toMatchObject({ ready: false, empty: false })
    // Nor is an empty list on a page still loading an empty state.
    const pending = page([view('Loading…', { loading: true, list: { records: [] } })])
    expect(await waitForRegion(pending, { contract, list }, { maxMs: 1_000, now: pending.now })).toMatchObject({ ready: false, empty: false, loading: true })
  })

  it('does not wait on a view that can judge none of the checks, and starts afresh after a read a navigation cut off', async () => {
    const json: VerifyContract = { checks: [{ type: 'field', path: 'json.price', present: true }] }
    const quiet = page([view('A page')])
    expect(await waitForRegion(quiet, { contract: json }, { maxMs: 10_000 })).toBeUndefined()
    expect(quiet.reads()).toBe(1)
    // A navigation between two passing reads: they are not two in a row.
    const moving = page([view('$1 $2 $3'), new Error('Execution context was destroyed, most likely because of a navigation'), view('$1 $2 $3'), view('$1 $2 $3')])
    expect(await waitForRegion(moving, { contract: prices }, { maxMs: 10_000, now: moving.now })).toMatchObject({ ready: true, reads: 4 })
    // Any other error is not the wait's to hide.
    const broken = page([new Error('boom')])
    await expect(waitForRegion(broken, { contract: prices }, { maxMs: 1_000, now: broken.now })).rejects.toThrow('boom')
    // A probe that failed on the page is a read that judged nothing.
    const tracker = new RegionTracker({ contract: prices })
    expect(tracker.observe(JSON.stringify({ error: 'SyntaxError' }))).toBe(false)
    expect(tracker.judgeable).toBe(true)
  })

  it('records the wait by its counts, never the page\'s text', () => {
    const event = regionWaitEvent({ ready: false, empty: false, waitedMs: 4_000, reads: 9, loading: false, steady: true, checks: [{ index: 0, type: 'markdownCountMin', passed: false, observedCount: 1 }] }, 7, 'browser_local')
    expect(event).toEqual({ at: 7, lane: 'browser_local', event: 'region_wait', detail: { ready: false, empty: false, waitedMs: 4_000, reads: 9, loading: false, steady: true, checks: [{ index: 0, type: 'markdownCountMin', passed: false, observedCount: 1 }] } })
    expect(regionWaitEvent(undefined, 7, 'browser_local')).toBeNull()
  })
})
