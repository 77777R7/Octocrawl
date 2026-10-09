import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { loadingWaitEvent, waitForRenderedStability, withStillLoadingWarning } from '../src/browserSettle.js'

describe('waitForRenderedStability', () => {
  it('does not accept a stable shell before the minimum observation window', async () => {
    let now = 0
    let reads = 0
    const page = {
      async evaluate() {
        reads++
        return now < 800 ? '{"size":10,"text":""}' : '{"size":40,"text":"delayed fact"}'
      },
      async waitForTimeout(ms: number) { now += ms },
    }
    await waitForRenderedStability(page, { minMs: 500, maxMs: 1_000, sampleMs: 100 })
    expect(now).toBeGreaterThanOrEqual(900)
    expect(reads).toBeGreaterThan(5)
  })

  it('uses text as well as DOM size when detecting stability', async () => {
    let now = 0
    let reads = 0
    const page = {
      async evaluate() {
        reads++
        const text = reads < 8 ? 'a' : 'b'
        return JSON.stringify({ size: 20, text })
      },
      async waitForTimeout(ms: number) { now += ms },
    }
    await waitForRenderedStability(page, { minMs: 500, maxMs: 1_000, sampleMs: 100 })
    expect(now).toBeGreaterThanOrEqual(700)
  })

  it('keeps waiting past maxMs while the page shows a loading indicator, within loadingMaxMs (ROADMAP PA item 4)', async () => {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
    let reads = 0
    // Loading for the first eight samples, then the data: a stable "Fetching..." must not end the wait.
    const arriving = {
      async evaluate() { reads++; return JSON.stringify(reads <= 8 ? { size: 10, text: 'Fetching...', loading: true } : { size: 90, text: 'six results', loading: false }) },
      waitForTimeout: sleep,
    }
    const arrived = await waitForRenderedStability(arriving, { minMs: 20, maxMs: 60, loadingMaxMs: 5_000, sampleMs: 20 })
    expect(arrived).toMatchObject({ loadingSeen: true, stillLoading: false })
    expect(reads).toBeGreaterThan(8)
    // A loader that never goes ends the wait at loadingMaxMs, still loading.
    const stuck = { async evaluate() { return JSON.stringify({ size: 10, text: 'Loading...', loading: true }) }, waitForTimeout: sleep }
    expect(await waitForRenderedStability(stuck, { minMs: 20, maxMs: 60, loadingMaxMs: 200, sampleMs: 20 })).toMatchObject({ loadingSeen: true, stillLoading: true })
    // Without loadingMaxMs a loading page is waited for no longer than any other.
    expect(await waitForRenderedStability(stuck, { minMs: 20, maxMs: 60, sampleMs: 20 })).toMatchObject({ loadingSeen: true, stillLoading: true })
  })

  it('records the loading wait and warns on a page read as content while still loading', () => {
    expect(loadingWaitEvent(undefined, 5, 'provider')).toBeNull()
    expect(loadingWaitEvent({ loadingSeen: false, stillLoading: false, waitedMs: 600 }, 5, 'provider')).toBeNull()
    const event = loadingWaitEvent({ loadingSeen: true, stillLoading: true, waitedMs: 8_000 }, 5, 'provider')!
    expect(event).toEqual({ at: 5, lane: 'provider', event: 'loading_wait', detail: { waitedMs: 8_000, cleared: false } })
    const page = { status: 'success', trace: [event] } as unknown as FetchResult
    expect(withStillLoadingWarning(page).warnings).toEqual([{ code: 'page_still_loading', message: 'The page still showed a loading indicator when it was read, after 8 s: its data may not be in this answer.' }])
    // A failed or blocked page claims no content, and a page whose indicator went has nothing to warn of.
    expect(withStillLoadingWarning({ ...page, status: 'failed' }).warnings).toBeUndefined()
    expect(withStillLoadingWarning({ ...page, trace: [{ ...event, detail: { waitedMs: 3_000, cleared: true } }] }).warnings).toBeUndefined()
  })
})
