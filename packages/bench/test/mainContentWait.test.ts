import { describe, expect, it } from 'vitest'
import { mainContentWaitEvents, waitForMainContent, type MainContentWaitPage } from '../src/mainContentWait.js'

/** A page whose text, HTML and requests on the way the test sets as it goes; each sample is a real 5 ms sleep. */
function fakePage(state: { text: number; html: string; pending: number }, onSample: (samples: number) => void = () => {}): MainContentWaitPage & { samples: number } {
  const page = {
    samples: 0,
    async evaluate(expression: string) {
      return expression.includes('outerHTML') ? `${state.html.length}:${state.text}` : state.text
    },
    async waitForTimeout(ms: number) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 5)))
      page.samples++
      onSample(page.samples)
    },
    async content() { return state.html },
    url() { return 'https://example.test/docs' },
  }
  return page
}

const hasContent = (html: string) => html.includes('<main>')

describe('waitForMainContent', () => {
  it('does not wait on a page with main content, plenty of text, or a check', async () => {
    const pending = () => 1
    expect(await waitForMainContent(fakePage({ text: 10, html: '<main>Done</main>', pending: 1 }), { maxMs: 500, hasContent, pending })).toBeNull()
    expect(await waitForMainContent(fakePage({ text: 5_000, html: '<div></div>', pending: 1 }), { maxMs: 500, hasContent, pending })).toBeNull()
    expect(await waitForMainContent(fakePage({ text: 10, html: '<div></div>', pending: 1 }), { maxMs: 500, hasContent, pending, gated: async () => true })).toBeNull()
  })

  it('keeps waiting on a still frame while its data is on the way, and ends when the main content comes', async () => {
    const state = { text: 20, html: '<header>Docs</header><div id="app"></div>', pending: 1 }
    // The frame stays still for 30 samples with a request on the way, far past the quiet window; then the data renders.
    const page = fakePage(state, (samples) => { if (samples === 30) { state.pending = 0; state.text = 27; state.html = '<header>Docs</header><main>Session</main>' } })
    const outcome = await waitForMainContent(page, { maxMs: 5_000, hasContent, pending: () => state.pending, quietMs: 20 })
    expect(outcome).toMatchObject({ ended: 'content', pending: 0 })
    expect(page.samples).toBe(30)
    expect(mainContentWaitEvents(outcome, 1, 'browser_local')).toEqual([{ at: 1, lane: 'browser_local', event: 'content_wait', detail: { ended: 'content', waitedMs: outcome!.waitedMs, pending: 0 } }])
  })

  it('reads a page with nothing on the way that stopped changing as done, not as loading', async () => {
    const state = { text: 20, html: '<header>Docs</header>', pending: 0 }
    const outcome = await waitForMainContent(fakePage(state), { maxMs: 5_000, hasContent, pending: () => state.pending, quietMs: 30 })
    expect(outcome?.ended).toBe('settled')
    expect(outcome!.waitedMs).toBeLessThan(1_000)
    expect(mainContentWaitEvents(outcome, 1, 'browser_local').map((event) => event.event)).toEqual(['content_wait'])
  })

  it('does not read a request that just finished as the page being done before the page changed', async () => {
    const state = { text: 20, html: '<div id="app"></div>', pending: 1 }
    // The request finishes at sample 10, the quiet window (20 ms, about 4 samples) long passed; the app renders 2 samples later.
    const page = fakePage(state, (samples) => {
      if (samples === 10) state.pending = 0
      if (samples === 12) { state.text = 27; state.html = '<main>Session</main>' }
    })
    expect(await waitForMainContent(page, { maxMs: 5_000, hasContent, pending: () => state.pending, quietMs: 20 })).toMatchObject({ ended: 'content' })
  })

  it('ends at its bound with the data still on the way, and says the page was still loading', async () => {
    const state = { text: 20, html: '<div id="app"></div>', pending: 2 }
    const outcome = await waitForMainContent(fakePage(state), { maxMs: 100, hasContent, pending: () => state.pending, quietMs: 10 })
    expect(outcome).toMatchObject({ ended: 'deadline', pending: 2 })
    expect(mainContentWaitEvents(outcome, 7, 'browser_local')).toEqual([
      { at: 7, lane: 'browser_local', event: 'content_wait', detail: { ended: 'deadline', waitedMs: outcome!.waitedMs, pending: 2 } },
      { at: 7, lane: 'browser_local', event: 'loading_wait', detail: { waitedMs: outcome!.waitedMs, cleared: false } },
    ])
    expect(mainContentWaitEvents(null, 7, 'browser_local')).toEqual([])
  })
})
