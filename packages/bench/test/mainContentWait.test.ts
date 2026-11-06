import { describe, expect, it } from 'vitest'
import { BACKGROUND_REQUEST_MS, mainContentWaitEvents, waitForMainContent, type AwaitedRequest, type MainContentWaitPage } from '../src/mainContentWait.js'

/** A page whose text and HTML the test sets as it goes; each sample is a real 5 ms sleep. */
function fakePage(state: { text: number; html: string }, onSample: (samples: number) => void = () => {}): MainContentWaitPage & { samples: number } {
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
const sent = (data = true, startedAt = Date.now(), path = 'https://example.test/data'): AwaitedRequest => ({ startedAt, data, path })

describe('waitForMainContent', () => {
  it('does not wait on a page with main content, plenty of text, or a check', async () => {
    const requests = () => [sent()]
    expect(await waitForMainContent(fakePage({ text: 10, html: '<main>Done</main>' }), { maxMs: 500, hasContent, requests })).toBeNull()
    expect(await waitForMainContent(fakePage({ text: 5_000, html: '<div></div>' }), { maxMs: 500, hasContent, requests })).toBeNull()
    expect(await waitForMainContent(fakePage({ text: 10, html: '<div></div>' }), { maxMs: 500, hasContent, requests, gated: async () => true })).toBeNull()
  })

  it('keeps waiting on a still frame while its data is on the way, and ends when the main content comes', async () => {
    const state = { text: 20, html: '<header>Docs</header><div id="app"></div>' }
    const data = sent()
    // The frame stays still for 30 samples with its data on the way, far past the quiet window; then the data renders.
    const page = fakePage(state, (samples) => { if (samples === 30) { data.finishedAt = Date.now(); state.text = 27; state.html = '<header>Docs</header><main>Session</main>' } })
    const outcome = await waitForMainContent(page, { maxMs: 5_000, hasContent, requests: () => [data], quietMs: 20 })
    expect(outcome).toMatchObject({ ended: 'content', pending: 0, stillLoading: false })
    expect(page.samples).toBe(30)
    expect(mainContentWaitEvents(outcome, 1, 'browser_local')).toEqual([{ at: 1, lane: 'browser_local', event: 'content_wait', detail: { ended: 'content', waitedMs: outcome!.waitedMs, pending: 0 } }])
  })

  it('reads a page with nothing on the way that stopped changing as done, not as loading', async () => {
    const outcome = await waitForMainContent(fakePage({ text: 20, html: '<header>Docs</header>' }), { maxMs: 5_000, hasContent, requests: () => [], quietMs: 30 })
    expect(outcome).toMatchObject({ ended: 'settled', stillLoading: false })
    expect(outcome!.waitedMs).toBeLessThan(1_000)
    expect(mainContentWaitEvents(outcome, 1, 'browser_local').map((event) => event.event)).toEqual(['content_wait'])
  })

  it('does not read a request that just finished as the page being done before the page changed', async () => {
    const state = { text: 20, html: '<div id="app"></div>' }
    const data = sent()
    // The request finishes at sample 10, the quiet window (20 ms, about 4 samples) long passed; the app renders 2 samples later.
    const page = fakePage(state, (samples) => {
      if (samples === 10) data.finishedAt = Date.now()
      if (samples === 12) { state.text = 27; state.html = '<main>Session</main>' }
    })
    expect(await waitForMainContent(page, { maxMs: 5_000, hasContent, requests: () => [data], quietMs: 20 })).toMatchObject({ ended: 'content' })
  })

  it('does not wait on a body streamed on and on, a request on the way for long, or a page that polls', async () => {
    const page = () => fakePage({ text: 20, html: '<nav>Docs</nav>' })
    // An event stream answered at once whose body never ends.
    const streamed: AwaitedRequest = { ...sent(), respondedAt: Date.now() }
    expect(await waitForMainContent(page(), { maxMs: 5_000, hasContent, requests: () => [streamed], quietMs: 30 })).toMatchObject({ ended: 'settled' })
    // A long poll sent with the page, on the way since before the wait for longer than a page's data takes.
    const longPoll = sent(true, Date.now() - BACKGROUND_REQUEST_MS)
    expect(await waitForMainContent(page(), { maxMs: 5_000, hasContent, requests: () => [longPoll], quietMs: 30 })).toMatchObject({ ended: 'settled' })
    // A page that asks again every 20 ms and changes nothing: after three such requests, what it sends is not waited on.
    const polls: AwaitedRequest[] = []
    const polling = fakePage({ text: 20, html: '<nav>Docs</nav>' }, (samples) => {
      if (samples % 4 === 1) polls.push(sent())
      if (samples % 4 === 3) polls[polls.length - 1]!.finishedAt = Date.now()
    })
    const outcome = await waitForMainContent(polling, { maxMs: 5_000, hasContent, requests: () => polls, quietMs: 30, sampleMs: 5 })
    expect(outcome).toMatchObject({ ended: 'settled', stillLoading: false })
    expect(polls.length).toBeLessThan(40)
  })

  it('still waits for the data after one-off requests that changed nothing (a settings file, a locale, a config)', async () => {
    const state = { text: 20, html: '<nav>Docs</nav><div id="app"></div>' }
    const requests: AwaitedRequest[] = []
    // Three different files answered at once, then the page's data, out for 40 samples, which renders the main content.
    // Nothing is on the way before sample 4, so quietMs must outlast those samples on a busy machine (at 20 ms it did not,
    // about 18 ms idle), and stay under the 220 ms the 44 samples take, so a data request not waited on still ends settled.
    const page = fakePage(state, (samples) => {
      if (samples === 2) for (const name of ['settings', 'locale', 'config']) requests.push({ ...sent(true, Date.now(), `https://example.test/${name}.json`), finishedAt: Date.now() + 1 })
      if (samples === 4) requests.push(sent(true, Date.now(), 'https://example.test/data.json'))
      if (samples === 44) { requests[3]!.finishedAt = Date.now(); state.text = 27; state.html = '<nav>Docs</nav><main>Session</main>' }
    })
    expect(await waitForMainContent(page, { maxMs: 5_000, hasContent, requests: () => requests, quietMs: 100, sampleMs: 5 })).toMatchObject({ ended: 'content' })
  })

  it('still waits for a query sent to the same URL beside two quick ones that changed nothing (one GraphQL endpoint)', async () => {
    const state = { text: 20, html: '<nav>Docs</nav><div id="app"></div>' }
    const requests: AwaitedRequest[] = []
    const graphql = 'https://example.test/graphql'
    const page = fakePage(state, (samples) => {
      if (samples === 2) {
        requests.push({ ...sent(true, Date.now(), graphql), finishedAt: Date.now() + 1 }, { ...sent(true, Date.now(), graphql), finishedAt: Date.now() + 1 })
        requests.push(sent(true, Date.now(), graphql))
      }
      if (samples === 40) { requests[2]!.finishedAt = Date.now(); state.text = 27; state.html = '<nav>Docs</nav><main>Session</main>' }
    })
    expect(await waitForMainContent(page, { maxMs: 5_000, hasContent, requests: () => requests, quietMs: 20, sampleMs: 5 })).toMatchObject({ ended: 'content' })
  })

  it('reads a page that goes on changing with nothing to fetch (an animation, a typewriter headline) as done, not as loading', async () => {
    const state = { text: 20, html: '<nav>Docs</nav><h1>A</h1>' }
    const page = fakePage(state, (samples) => { state.text = 20 + (samples % 7); state.html = `<nav>Docs</nav><h1>${'A'.repeat(samples % 7)}</h1>` })
    const outcome = await waitForMainContent(page, { maxMs: 5_000, hasContent, requests: () => [], quietMs: 30 })
    expect(outcome).toMatchObject({ ended: 'settled', stillLoading: false })
    expect(outcome!.waitedMs).toBeLessThan(1_000)
  })

  it('ends at its bound with the data still on the way, and says the page was still loading', async () => {
    const outcome = await waitForMainContent(fakePage({ text: 20, html: '<div id="app"></div>' }), { maxMs: 100, hasContent, requests: () => [sent(), sent(false)], quietMs: 10 })
    expect(outcome).toMatchObject({ ended: 'deadline', pending: 2, stillLoading: true })
    expect(mainContentWaitEvents(outcome, 7, 'browser_local')).toEqual([
      { at: 7, lane: 'browser_local', event: 'content_wait', detail: { ended: 'deadline', waitedMs: outcome!.waitedMs, pending: 2 } },
      { at: 7, lane: 'browser_local', event: 'loading_wait', detail: { waitedMs: outcome!.waitedMs, cleared: false } },
    ])
    expect(mainContentWaitEvents(null, 7, 'browser_local')).toEqual([])
  })
})
