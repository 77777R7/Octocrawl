import { describe, expect, it } from 'vitest'
import { evaluateProviderGate, evaluateVendorPolicy, verifyLedger } from '@w2l/http-core'
import { ProviderSubject, type RobotsFetcher } from '../src/subjects/provider.js'
import { scrubSecret, type VendorApi, type VendorApiRequest, type VendorApiResponse } from '../src/vendors/api.js'
import type { CdpBrowser, CdpConnector, CdpContext, CdpPage, CdpResponse } from '../src/vendors/cdp.js'
import { browserbaseOps, browserbaseSessionBody } from '../src/vendors/browserbase.js'
import { countSolved, steelOps, steelSessionBody } from '../src/vendors/steel.js'
import { CdpVendorTransport } from '../src/vendors/transport.js'
import { connectVendor } from '../src/vendors/connect.js'
import { captureOf } from '../src/capture.js'

/**
 * Both vendors ship with evasion ON by default (Browserbase solves captchas
 * unless told not to; Steel injects a synthetic fingerprint unless told not
 * to). The session-create body is therefore the compliance claim, and these
 * tests pin it: a refactor that drops the explicit opt-out silently re-buys
 * the capability the gate refuses.
 *
 * The other half is identity. Browserbase has no session-level UA field and
 * Playwright over CDP is lower fidelity than its own protocol, so the design
 * measures the vendor's UA instead of imposing one. The tests hold that line
 * from both ends: the declaration must come from the live session, and a
 * declaration that stops matching must stop the fetch.
 */

const PAGE =
  '<!doctype html><html><body><article><h1>Cobalt ash kettle</h1>' +
  '<p>A stoneware pour-over kettle with four spouts for even infusion, fired to ' +
  'cone ten in a reduction atmosphere so the cobalt ash glaze breaks blue over the ' +
  'shoulder and pools green in the throat of each spout.</p>' +
  '<p>The handle is pulled rather than cast, which leaves the maker thumbprint at ' +
  'the root where it joins the body of the vessel itself.</p></article></body></html>'

const VENDOR_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36'
const HEADLESS_VENDOR_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36'

// --- vendor REST fake -------------------------------------------------------

class FakeApi {
  requests: VendorApiRequest[] = []
  constructor(private readonly respond: (req: VendorApiRequest) => VendorApiResponse) {}
  handler: VendorApi = async (req) => {
    this.requests.push(req)
    return this.respond(req)
  }
}

function sessionServing(sessionId: string, connectUrl = `wss://cdp.example/${sessionId}`) {
  return new FakeApi((req) =>
    req.method === 'POST' && req.url.endsWith('/v1/sessions')
      ? { status: 201, json: { id: sessionId, connectUrl } }
      : { status: 200, json: {} },
  )
}

// --- CDP fake ----------------------------------------------------------------

interface FakeScript {
  userAgent?: string
  status?: number
  headers?: Record<string, string>
  requestHeaders?: Record<string, string>
  /** Throw instead of surfacing request headers, like a thin CDP attachment. */
  hideRequestHeaders?: boolean
  body?: string
  finalUrl?: string
  gotoError?: Error
  /** Simulate a vendor that provisioned no context at all. */
  noContext?: boolean
  /** The page says its data is loading for this many settle samples, then shows it. */
  loadingSamples?: number
  /** What the region view reads on the page (ADR 0007), one per read, the last from then on. */
  regionViews?: string[]
  /** The context opens raw CDP sessions, and each navigation reports this many bytes received (Network.loadingFinished). */
  bytesPerNavigation?: number
  /**
   * The documents the main frame shows after `goto`, in order, as a raw CDP session hears them (Network.responseReceived
   * of type Document, then Page.frameNavigated): the first is the one `goto` answers with, the last the one on screen.
   * The context opens raw CDP sessions when this is set.
   */
  documents?: { url: string; status: number; headers?: Record<string, string> }[]
  /** The raw CDP session never answers Page.enable. */
  hangPageEnable?: boolean
}

interface FakeState {
  navigations: string[]
  pagesOpened: number
  pagesClosed: number
  closed: boolean
}

function fakeBrowser(script: FakeScript = {}): { browser: CdpBrowser; state: FakeState } {
  const state: FakeState = { navigations: [], pagesOpened: 0, pagesClosed: 0, closed: false }
  const ua = script.userAgent ?? VENDOR_UA

  const listeners = new Map<string, ((params: unknown) => void)[]>()
  const emit = (event: string, params: unknown) => { for (const listener of listeners.get(event) ?? []) listener(params) }
  const context: CdpContext = {
    pages: () => [],
    ...(script.bytesPerNavigation === undefined && script.documents === undefined ? {} : {
      async newCDPSession() {
        return { send: (method: string) => script.hangPageEnable === true && method === 'Page.enable' ? new Promise(() => {}) : Promise.resolve({}), on(event: string, handler: (params: unknown) => void) { listeners.set(event, [...listeners.get(event) ?? [], handler]) }, async detach() {} }
      },
    }),
    async newPage(): Promise<CdpPage> {
      state.pagesOpened++
      let current = 'about:blank'
      let samples = 0
      let regionReads = 0
      return {
        async goto(url: string): Promise<CdpResponse | null> {
          if (script.gotoError) throw script.gotoError
          state.navigations.push(url)
          current = script.finalUrl ?? url
          emit('Network.loadingFinished', { requestId: '1', encodedDataLength: script.bytesPerNavigation })
          // goto answers with the first document; a script or a challenge then loads the others.
          for (const [i, doc] of (script.documents ?? []).entries()) {
            emit('Network.responseReceived', { requestId: `doc${i}`, type: 'Document', frameId: 'main', response: { url: doc.url, status: doc.status, headers: doc.headers ?? { 'Content-Type': 'text/html' } } })
            emit('Page.frameNavigated', { frame: { id: 'main', url: doc.url } })
            current = doc.url
          }
          const first = script.documents?.[0]
          return {
            status: () => first?.status ?? script.status ?? 200,
            headers: () => first?.headers ?? script.headers ?? { 'Content-Type': 'text/html; charset=utf-8' },
            request: () => ({
              headers: () => {
                if (script.hideRequestHeaders) throw new Error('request headers unavailable over CDP')
                return script.requestHeaders ?? { 'User-Agent': ua, Accept: '*/*' }
              },
            }),
          }
        },
        async evaluate(expression: string) {
          if (expression === 'navigator.userAgent') return ua
          if (script.regionViews !== undefined && expression.includes('tableCount')) return script.regionViews[Math.min(regionReads++, script.regionViews.length - 1)]
          if (script.loadingSamples === undefined) return undefined
          const loading = samples++ < script.loadingSamples
          return JSON.stringify({ size: loading ? 10 : 90, text: loading ? 'Fetching...' : 'the data', loading })
        },
        async waitForTimeout(ms: number) { if (script.loadingSamples !== undefined) await new Promise((resolve) => setTimeout(resolve, ms)) },
        async content() {
          return script.body ?? PAGE
        },
        url: () => current,
        async close() {
          state.pagesClosed++
        },
      }
    },
  }

  const browser: CdpBrowser = {
    contexts: () => (script.noContext ? [] : [context]),
    async close() {
      state.closed = true
    },
  }
  return { browser, state }
}

/** A connector that hands out one scripted browser per connection, in order. */
function connectorFor(...browsers: { browser: CdpBrowser; state: FakeState }[]) {
  const wsUrls: string[] = []
  let i = 0
  const connector: CdpConnector = async (wsUrl) => {
    wsUrls.push(wsUrl)
    const next = browsers[Math.min(i, browsers.length - 1)]!
    i++
    return next.browser
  }
  return { connector, wsUrls, connections: () => i }
}

// --- session bodies are the compliance claim ---------------------------------

describe('browserbase session config', () => {
  it('turns captcha solving OFF explicitly — the vendor default is ON', async () => {
    const api = sessionServing('bb_1')
    await browserbaseOps({ apiKey: 'bb_key' }, api.handler).createSession()

    const body = api.requests[0]!.body as { browserSettings: Record<string, unknown> }
    // Explicit false, not merely absent: absent means true on their side.
    expect(body.browserSettings.solveCaptchas).toBe(false)
    expect(body.browserSettings.advancedStealth).toBe(false)
  })

  it('authenticates with X-BB-API-Key against the documented endpoint', async () => {
    const api = sessionServing('bb_1')
    await browserbaseOps({ apiKey: 'bb_key' }, api.handler).createSession()
    expect(api.requests[0]!.url).toBe('https://api.browserbase.com/v1/sessions')
    expect(api.requests[0]!.headers['x-bb-api-key']).toBe('bb_key')
  })

  it('releases by requesting REQUEST_RELEASE on the session resource', async () => {
    const api = sessionServing('bb_1')
    const ops = browserbaseOps({ apiKey: 'bb_key' }, api.handler)
    await ops.createSession()
    await ops.releaseSession('bb_1')
    expect(api.requests[1]!.url).toBe('https://api.browserbase.com/v1/sessions/bb_1')
    expect(api.requests[1]!.body).toEqual({ status: 'REQUEST_RELEASE' })
  })

  it('surfaces a create failure with the vendor status, not a fake session', async () => {
    const api = new FakeApi(() => ({ status: 402, json: { error: 'payment required' } }))
    await expect(browserbaseOps({ apiKey: 'k' }, api.handler).createSession()).rejects.toThrow(
      'browserbase: session create returned 402',
    )
  })

  it('rejects a create response that omits connectUrl', async () => {
    const api = new FakeApi(() => ({ status: 201, json: { id: 'bb_1' } }))
    await expect(browserbaseOps({ apiKey: 'k' }, api.handler).createSession()).rejects.toThrow(
      'missing id/connectUrl',
    )
  })
})

describe('steel session config', () => {
  it('opts out of the default fingerprint injection, and declines solving', async () => {
    const api = sessionServing('st_1')
    await steelOps({ apiKey: 'steel_key' }, api.handler).createSession()

    const body = api.requests[0]!.body as {
      solveCaptcha: boolean
      stealthConfig: Record<string, unknown>
    }
    expect(body.solveCaptcha).toBe(false)
    // Steel injects a synthetic fingerprint BY DEFAULT; true here is the opt-out.
    expect(body.stealthConfig.skipFingerprintInjection).toBe(true)
    expect(body.stealthConfig.autoCaptchaSolving).toBe(false)
    expect(body.stealthConfig.humanizeInteractions).toBe(false)
  })

  it('builds the CDP endpoint per their docs instead of trusting websocketUrl', async () => {
    const api = sessionServing('st_1')
    const session = await steelOps({ apiKey: 'steel_key' }, api.handler).createSession()
    expect(session.connectUrl).toBe('wss://connect.steel.dev?apiKey=steel_key&sessionId=st_1')
    expect(api.requests[0]!.headers['steel-api-key']).toBe('steel_key')
  })

  it('releases via the release endpoint', async () => {
    const api = sessionServing('st_1')
    const ops = steelOps({ apiKey: 'steel_key' }, api.handler)
    await ops.createSession()
    await ops.releaseSession('st_1')
    expect(api.requests[1]!.url).toBe('https://api.steel.dev/v1/sessions/st_1/release')
  })

  it('times a session from before it is asked for to after its release is confirmed (ROADMAP PA item 4)', async () => {
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 60))
    const api = sessionServing('st_1')
    const base = steelOps({ apiKey: 'steel_key' }, api.handler)
    const ops = { ...base, async createSession(...args: Parameters<typeof base.createSession>) { await pause(); return base.createSession(...args) }, async releaseSession(id: string) { await pause(); return base.releaseSession(id) } }
    const transport = new CdpVendorTransport(ops, connectorFor(fakeBrowser()).connector)
    await transport.resolveUserAgent()
    expect(transport.closedSessions()).toEqual([])
    await transport.close()
    const [closed, ...more] = transport.closedSessions()
    expect(more).toEqual([])
    expect(closed!.released).toBe(true)
    // Both the slow create and the slow release are in it, in whole milliseconds.
    expect(Number.isInteger(closed!.sessionMs)).toBe(true)
    expect(closed!.sessionMs).toBeGreaterThanOrEqual(120)
    expect(closed!.sessionMs).toBeLessThan(2_000)
  })

  it('fails a release the vendor did not confirm: the session bills until its timeout (ROADMAP PA item 4)', async () => {
    for (const [vendor, ops, id] of [
      ['steel', (api: FakeApi) => steelOps({ apiKey: 'steel_key' }, api.handler), 'st_1'],
      ['browserbase', (api: FakeApi) => browserbaseOps({ apiKey: 'bb_key' }, api.handler), 'bb_1'],
    ] as const) {
      const api = new FakeApi((req) => req.method === 'POST' && req.url.endsWith('/v1/sessions') ? { status: 201, json: { id, connectUrl: `wss://cdp.example/${id}` } } : { status: 503, json: {} })
      const vendorOps = ops(api)
      await vendorOps.createSession()
      await expect(vendorOps.releaseSession(id), vendor).rejects.toThrow(`${vendor}: session release returned 503`)
    }
  })
})

// --- identity is measured, not asserted ---------------------------------------

describe('vendor identity', () => {
  it('declares the UA the vendor session actually reports', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser()
    const { connector } = connectorFor(bb)
    const { declaration } = await connectVendor(browserbaseOps({ apiKey: 'k' }, api.handler), connector)

    // Not a flattering string of our choosing — Chrome/141 is what this
    // session runs, so that is what robots.txt gets evaluated against and
    // what the publisher's access log will show. HeadlessChrome is a
    // later refusal, not the identity we measure.
    expect(declaration.declaredUserAgent).toBe(VENDOR_UA)
    expect(declaration.id).toBe('browserbase')
    // We do not impose an identity on the vendor, so this is false — and the
    // gate's "you could pass through our UA" hint correctly stays silent.
    expect(declaration.honoursCallerUserAgent).toBe(false)
  })

  it('checks the declared capabilities against the run grant, not against the decision', async () => {
    // A decision that enables captcha solving and stealth, as a hand-built
    // VendorOps could carry: the gate must still refuse without the grant.
    const ops = {
      ...browserbaseOps({ apiKey: 'k' }, sessionServing('bb_1').handler),
      decision: evaluateVendorPolicy(
        [{ capability: 'captcha_solving', vendorDefaultOn: true, enableKey: null }, { capability: 'fingerprint_spoofing', vendorDefaultOn: true, enableKey: null }],
        { authorized: ['vendor_captcha_solving', 'vendor_stealth'] },
      ),
    }
    const ungranted = await connectVendor(ops, connectorFor(fakeBrowser()).connector)
    expect(ungranted.declaration.capabilities).toEqual(['captcha_solving', 'fingerprint_spoofing'])
    expect(evaluateProviderGate(ungranted.declaration, null, '/').refusal).toBe('ungranted_capability')

    const granted = await connectVendor(ops, connectorFor(fakeBrowser()).connector, null, undefined, undefined, ['vendor_captcha_solving', 'vendor_stealth'])
    expect(evaluateProviderGate(granted.declaration, null, '/').allowed).toBe(true)
  })

  it('measures the UA without touching any origin', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser()
    const { connector } = connectorFor(bb)
    await connectVendor(browserbaseOps({ apiKey: 'k' }, api.handler), connector)

    // The load-bearing assertion: the probe page never navigated anywhere.
    // A probe request before the gate runs would be the exact ordering
    // violation this lane exists to prevent.
    expect(bb.state.navigations).toEqual([])
    expect(bb.state.pagesOpened).toBe(1)
    expect(bb.state.pagesClosed).toBe(1)
  })

  it('uses the vendor default context, never a fresh one', async () => {
    // Both vendors provision a live context and document contexts()[0]; a
    // newContext() would bypass the session-level proxy the caller pays for.
    // The fake exposes no newContext at all, so this passing is the proof.
    const api = sessionServing('bb_1')
    const bb = fakeBrowser()
    const { connector } = connectorFor(bb)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)
    const res = await transport.fetch('https://shop.example/dp/A')
    expect(res.status).toBe(200)
  })

  it('waits past the usual settle for a page that says its data is loading, and reports it (ROADMAP PA item 4)', async () => {
    const api = sessionServing('bb_1')
    // Twenty samples of 100 ms: about 2 s of "Fetching...", past the usual 1.5 s settle.
    const bb = fakeBrowser({ loadingSamples: 20 })
    const { connector } = connectorFor(bb)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)
    const res = await transport.fetch('https://shop.example/dp/A', Date.now() + 20_000)
    expect(res.settle).toMatchObject({ loadingSeen: true, stillLoading: false })
    expect(res.settle!.waitedMs).toBeGreaterThan(1_500)
  })

  it('hands navigateOnce the region a task needs, and returns what its wait saw (ADR 0007)', async () => {
    const api = sessionServing('bb_1')
    const shows = (text: string) => JSON.stringify({ loading: false, text: text.length, href: 'https://site.test/a', html: `<html><body><p>${text}</p></body></html>`, tableCount: 0 })
    const bb = fakeBrowser({ regionViews: [shows('Results'), shows('$1 $2 $3')] })
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connectorFor(bb).connector)
    const region = { contract: { checks: [{ type: 'markdownCountMin' as const, pattern: '\\$\\d', min: 3 }] } }
    const res = await transport.fetch('https://shop.example/dp/A', Date.now() + 20_000, undefined, region)
    expect(res.region).toMatchObject({ ready: true, reads: 3, checks: [{ passed: true, observedCount: 3 }] })
    expect((await transport.fetch('https://shop.example/dp/A', Date.now() + 20_000)).region).toBeUndefined()
  })

  it('reports the status and URL of the document a script moved the page on to, not the first answer (PA B1)', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ documents: [
      { url: 'https://shop.example/dp/A', status: 200 },
      { url: 'https://shop.example/gone', status: 410, headers: { 'Content-Type': 'text/html; charset=iso-8859-1' } },
    ] })
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connectorFor(bb).connector)
    const res = await transport.fetch('https://shop.example/dp/A')
    expect(res).toMatchObject({ status: 410, finalUrl: 'https://shop.example/gone', documentGeneration: 2, responseMatch: 'matched' })
    expect(res.headers['content-type']).toBe('text/html; charset=iso-8859-1')
  })

  it('reports the page a challenge let through, not the challenge (PA B1)', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ documents: [
      { url: 'https://shop.example/dp/A', status: 403, headers: { 'Content-Type': 'text/html', 'CF-Mitigated': 'challenge' } },
      { url: 'https://shop.example/dp/A', status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    ] })
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connectorFor(bb).connector)
    const res = await transport.fetch('https://shop.example/dp/A')
    expect(res).toMatchObject({ status: 200, finalUrl: 'https://shop.example/dp/A', documentGeneration: 2, responseMatch: 'matched' })
    expect(res.headers['cf-mitigated']).toBeUndefined()
  })

  it('goes on unobserved when the CDP session never enables its Page domain (PA B2)', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ hangPageEnable: true, documents: [{ url: 'https://shop.example/dp/A', status: 200 }] })
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connectorFor(bb).connector)
    const res = await transport.fetch('https://shop.example/dp/A', Date.now() + 20_000)
    expect(res).toMatchObject({ status: 200, responseMatch: 'unobserved', documentGeneration: null })
  })

  it('says unobserved, never matched, when the connector opens no CDP session (PA B1)', async () => {
    const api = sessionServing('bb_1')
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connectorFor(fakeBrowser()).connector)
    const res = await transport.fetch('https://shop.example/dp/A')
    expect(res.status).toBe(200)
    expect(res.responseMatch).toBe('unobserved')
    expect(res.documentGeneration).toBeNull()
  })

  it('fails clearly when the vendor provisioned no context', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ noContext: true })
    const { connector } = connectorFor(bb)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)
    await expect(transport.resolveUserAgent()).rejects.toThrow('exposed no browser context')
  })

  it('refuses to fetch when the session UA changes across reconnects', async () => {
    const api = sessionServing('bb_1')
    const first = fakeBrowser({ gotoError: new Error('Target closed') })
    const upgraded = fakeBrowser({ userAgent: VENDOR_UA.replace('141', '142') })
    const { connector } = connectorFor(first, upgraded)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)

    await transport.resolveUserAgent() // pins the 141 string
    await expect(transport.fetch('https://shop.example/dp/A')).rejects.toThrow('Target closed')

    // The reconnect runs a different engine. The permission the gate granted
    // was for the old identity, so the honest move is to stop, not to keep
    // sending a UA this session cannot back.
    await expect(transport.fetch('https://shop.example/dp/A')).rejects.toThrow(
      /user agent changed from .*141.* to .*142/,
    )
    expect(upgraded.state.navigations).toEqual([])
    expect(upgraded.state.closed).toBe(true)
  })

  it('reconnects silently when the UA is unchanged', async () => {
    // The counterpart to the drift test: a dropped session is a normal event,
    // and recovering from it must not require the UA to have changed.
    const api = sessionServing('bb_1')
    const first = fakeBrowser({ gotoError: new Error('Target closed') })
    const same = fakeBrowser()
    const { connector } = connectorFor(first, same)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)

    await expect(transport.fetch('https://shop.example/dp/A')).rejects.toThrow('Target closed')
    const res = await transport.fetch('https://shop.example/dp/A')
    expect(res.status).toBe(200)
    expect(same.state.navigations).toEqual(['https://shop.example/dp/A'])
  })
})

// --- the shared transport ------------------------------------------------------

describe('CdpVendorTransport', () => {
  it("reports the origin's status, never the vendor API's", async () => {
    // The vendor answered 201 (session created). The origin answered 403
    // behind a challenge. The transport must say 403.
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({
      status: 403,
      headers: { 'Content-Type': 'text/html', 'CF-Mitigated': 'challenge' },
    })
    const { connector } = connectorFor(bb)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)

    const res = await transport.fetch('https://shop.example/dp/B0TEST')
    expect(res.status).toBe(403)
    expect(res.headers['cf-mitigated']).toBe('challenge')
    // Neither vendor states a per-request price; an estimate would read as a
    // measurement, so this is null, not a guess.
    expect(res.costUsd).toBeNull()
  })

  it('reuses one session across fetches, one fresh page per fetch', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser()
    const { connector, connections } = connectorFor(bb)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)

    await transport.fetch('https://shop.example/dp/A')
    await transport.fetch('https://shop.example/dp/B')

    expect(connections()).toBe(1)
    expect(api.requests.filter((r) => r.url.endsWith('/v1/sessions'))).toHaveLength(1)
    // 1 UA probe + 2 fetches, every one closed.
    expect(bb.state.pagesOpened).toBe(3)
    expect(bb.state.pagesClosed).toBe(3)
  })

  it('drops and releases the session after a navigation failure', async () => {
    const api = sessionServing('bb_1')
    const broken = fakeBrowser({ gotoError: new Error('Target closed') })
    const healthy = fakeBrowser()
    const { connector } = connectorFor(broken, healthy)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)

    await expect(transport.fetch('https://shop.example/dp/A')).rejects.toThrow('Target closed')
    // The dead session was released, not left running on the vendor's meter.
    expect(api.requests.some((r) => r.url === 'https://api.browserbase.com/v1/sessions/bb_1')).toBe(true)
    expect(broken.state.closed).toBe(true)
  })

  it('reports the observed request UA, and null when it cannot see one', async () => {
    const api = sessionServing('bb_1')
    const seen = fakeBrowser()
    const blind = fakeBrowser({ hideRequestHeaders: true })
    const { connector } = connectorFor(seen)
    const t1 = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)
    expect((await t1.fetch('https://shop.example/dp/A')).sentUserAgent).toBe(VENDOR_UA)

    const { connector: c2 } = connectorFor(blind)
    const t2 = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), c2)
    // Null means UNOBSERVED. The subject must not read that as agreement.
    expect((await t2.fetch('https://shop.example/dp/A')).sentUserAgent).toBeNull()
  })

  it('scrubs the API key out of every error it throws', async () => {
    // Steel's CDP endpoint carries the key as a query parameter, and connect
    // errors echo the URL they were given. That echo must not reach a trace
    // or a bench artifact with the credential still in it.
    const api = sessionServing('st_1')
    const connector: CdpConnector = async (wsUrl) => {
      throw new Error(`WebSocket error connecting to ${wsUrl}`)
    }
    const transport = new CdpVendorTransport(steelOps({ apiKey: 'steel_secret_key' }, api.handler), connector)

    const err = await transport.fetch('https://shop.example/dp/A').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain('steel_secret_key')
    expect((err as Error).message).toContain('<redacted>')
    // And the orphaned session was still released.
    expect(api.requests.some((r) => r.url.endsWith('/v1/sessions/st_1/release'))).toBe(true)
  })

  it('releases the session on close', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser()
    const { connector } = connectorFor(bb)
    const transport = new CdpVendorTransport(browserbaseOps({ apiKey: 'k' }, api.handler), connector)
    await transport.fetch('https://shop.example/dp/A')
    await transport.close()
    expect(bb.state.closed).toBe(true)
    expect(api.requests.some((r) => r.url === 'https://api.browserbase.com/v1/sessions/bb_1')).toBe(true)
  })
})

// --- end to end through the gate ---------------------------------------------

const AMAZON_SHAPED = ['User-agent: *', 'Disallow: /gp/cart', '', 'User-agent: Scrapy', 'Disallow: /'].join('\n')

function robotsServing(text: string) {
  const fetches: string[] = []
  const fetcher: RobotsFetcher = async (robotsUrl, ua) => {
    fetches.push(`${robotsUrl} ${ua}`)
    return { text, status: 200, contentType: 'text/plain' }
  }
  return { fetcher, fetches }
}

describe('vendor transport behind the provider gate', () => {
  it('records the measured vendor UA as what went on the wire', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser()
    const { connector } = connectorFor(bb)
    const { declaration, transport } = await connectVendor(
      browserbaseOps({ apiKey: 'k' }, api.handler),
      connector,
    )
    const { fetcher, fetches } = robotsServing(AMAZON_SHAPED)
    const subject = new ProviderSubject(declaration, transport, 'standard', null, fetcher)

    const out = await subject.fetch('https://shop.example/dp/B0TEST')
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('four spouts for even infusion')
    expect(out.compliance!.sentHeaders.headers).toEqual([{ name: 'user-agent', value: VENDOR_UA }])
    // robots.txt was fetched under the vendor's identity too — the question
    // being asked is what THEY are permitted.
    expect(fetches[0]).toContain(VENDOR_UA)
    expect(verifyLedger(subject.ledger()).valid).toBe(true)
  })

  it('flags a mismatch when the wire UA is not the gated UA — and never delivers it as success', async () => {
    // The integration bug this design exists to catch: the gate cleared one
    // identity and the request carried another. Record the truth (what was
    // sent) and say so, rather than record the flattering version. The
    // unified identity rule then turns the contentful fetch into a CLEAR
    // failure — a mismatch is never contentful success.
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ requestHeaders: { 'User-Agent': 'SomethingElse/9' } })
    const { connector } = connectorFor(bb)
    const { declaration, transport } = await connectVendor(
      browserbaseOps({ apiKey: 'k' }, api.handler),
      connector,
    )
    const { fetcher } = robotsServing(AMAZON_SHAPED)
    const subject = new ProviderSubject(declaration, transport, 'standard', null, fetcher)

    const out = await subject.fetch('https://shop.example/dp/B0TEST')
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('identity_compromised')
    expect(out.markdown).toBeNull()
    expect(out.compliance!.sentHeaders.headers).toEqual([
      { name: 'user-agent', value: 'SomethingElse/9' },
    ])
    const mismatch = out.trace.find((t) => t.event === 'identity_mismatch')
    expect(mismatch).toBeDefined()
    expect(mismatch!.detail).toMatchObject({ declared: VENDOR_UA, sent: 'SomethingElse/9' })
  })

  it('says "unobserved" rather than assuming agreement — and also never success', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ hideRequestHeaders: true })
    const { connector } = connectorFor(bb)
    const { declaration, transport } = await connectVendor(
      browserbaseOps({ apiKey: 'k' }, api.handler),
      connector,
    )
    const { fetcher } = robotsServing(AMAZON_SHAPED)
    const subject = new ProviderSubject(declaration, transport, 'standard', null, fetcher)

    const out = await subject.fetch('https://shop.example/dp/B0TEST')
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('identity_compromised')
    expect(out.markdown).toBeNull()
    expect(out.trace.some((t) => t.event === 'identity_unobserved')).toBe(true)
    expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    // The record still says what went on the wire — the declared UA was the
    // only identity we had, and the trace says we could not confirm it.
    expect(out.compliance!.sentHeaders.headers).toEqual([{ name: 'user-agent', value: VENDOR_UA }])
  })

  it('records the document on screen as the evidence and the capture, and no wire bytes it did not measure (PA B2, B3, G1)', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ documents: [
      { url: 'https://shop.example/dp/B0TEST', status: 403, headers: { 'Content-Type': 'text/html', 'CF-Mitigated': 'challenge' } },
      { url: 'https://shop.example/dp/B0TEST', status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    ] })
    const { declaration, transport } = await connectVendor(browserbaseOps({ apiKey: 'k' }, api.handler), connectorFor(bb).connector)
    const subject = new ProviderSubject(declaration, transport, 'standard', null, robotsServing(AMAZON_SHAPED).fetcher)
    const out = await subject.fetch('https://shop.example/dp/B0TEST', undefined, undefined, undefined, { includeTags: ['article'] })
    expect(out.status).toBe('success')
    expect(out.evidence).toMatchObject({ httpStatus: 200, contentType: 'text/html; charset=utf-8' })
    expect(out.usage.bytesWire).toBeNull()
    const capture = captureOf(out.trace)
    expect(capture).toMatchObject({ sourceKind: 'browser_dom', finalUrl: 'https://shop.example/dp/B0TEST', documentGeneration: 2, responseMatch: 'matched', sourceHash: out.evidence.rawBodySha256 })
    expect(out.trace.find(event => event.event === 'view')?.detail).toMatchObject({ captureId: capture!.captureId, selectionVersion: 'includeTags' })

    // A transport that heard no documents is unobserved, never matched.
    const blind = await connectVendor(browserbaseOps({ apiKey: 'k' }, sessionServing('bb_2').handler), connectorFor(fakeBrowser()).connector)
    const unseen = await new ProviderSubject(blind.declaration, blind.transport, 'standard', null, robotsServing(AMAZON_SHAPED).fetcher).fetch('https://shop.example/dp/B0TEST')
    expect(captureOf(unseen.trace)).toMatchObject({ responseMatch: 'unobserved', documentGeneration: null })
  })

  it('HeadlessChrome on the vendor wire is never success', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ userAgent: HEADLESS_VENDOR_UA })
    const { connector } = connectorFor(bb)
    const { declaration, transport } = await connectVendor(
      browserbaseOps({ apiKey: 'k' }, api.handler),
      connector,
    )
    const { fetcher } = robotsServing(AMAZON_SHAPED)
    const subject = new ProviderSubject(declaration, transport, 'standard', null, fetcher)

    const out = await subject.fetch('https://shop.example/dp/B0TEST')
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('identity_compromised')
    expect(out.markdown).toBeNull()
    expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(true)
  })

  it('a robots-banned path never reaches the vendor browser', async () => {
    const api = sessionServing('bb_1')
    const bb = fakeBrowser()
    const { connector } = connectorFor(bb)
    const { declaration, transport } = await connectVendor(
      browserbaseOps({ apiKey: 'k' }, api.handler),
      connector,
    )
    const { fetcher } = robotsServing(AMAZON_SHAPED)
    const subject = new ProviderSubject(declaration, transport, 'standard', null, fetcher)

    const out = await subject.fetch('https://shop.example/gp/cart/view.html')
    expect(out.failureReason).toBe('policy_denied')
    // The session exists (the UA had to be measured), but no navigation ever
    // happened: the wildcard disallow held at the gate.
    expect(bb.state.navigations).toEqual([])
  })

  it('refuses a vendor whose measured UA the target bans site-wide', async () => {
    // The scenario the whole gate is for. Nothing about the vendor changed —
    // the target simply bans the identity it runs, and routing to it would
    // arrange the violation rather than avoid it.
    const api = sessionServing('bb_1')
    const bb = fakeBrowser({ userAgent: 'Scrapy/2.11 (+https://scrapy.org)' })
    const { connector } = connectorFor(bb)
    const { declaration, transport } = await connectVendor(
      browserbaseOps({ apiKey: 'k' }, api.handler),
      connector,
    )
    const { fetcher } = robotsServing(AMAZON_SHAPED)
    const subject = new ProviderSubject(declaration, transport, 'standard', null, fetcher)

    const out = await subject.fetch('https://shop.example/dp/B0TEST')
    expect(out.failureReason).toBe('policy_denied')
    expect(out.compliance!.robots.matchedUserAgentGroup).toBe('scrapy')
    expect(bb.state.navigations).toEqual([])
  })
})

describe('scrubSecret', () => {
  it('removes every occurrence and tolerates empty secrets', () => {
    expect(scrubSecret('key=abc url=wss://x?apiKey=abc', 'abc')).toBe(
      'key=<redacted> url=wss://x?apiKey=<redacted>',
    )
    expect(scrubSecret('untouched', '')).toBe('untouched')
  })
})

// --- three-layer split: capability manifest vs product policy ----------------

describe('capability/policy split (transport declares, policy decides)', () => {
  it('browserbase default decision enables route capabilities only, and withholds the grant-gated ones', () => {
    const ops = browserbaseOps({ apiKey: 'k' }, sessionServing('bb_1').handler)
    const enabled = ops.decision.enabled.map((c) => c.capability)
    expect(enabled).toEqual(['headless_browser', 'datacenter_proxy'])
    expect(ops.decision.withheld).toEqual(['captcha_solving', 'fingerprint_spoofing'])
  })

  it('steel default decision enables route capabilities only, and withholds the grant-gated ones', () => {
    const ops = steelOps({ apiKey: 'k' }, sessionServing('st_1').handler)
    const enabled = ops.decision.enabled.map((c) => c.capability)
    expect(enabled).toEqual(['headless_browser', 'datacenter_proxy'])
    expect(ops.decision.withheld).toEqual(['residential_proxy', 'captcha_solving', 'fingerprint_spoofing'])
  })

  it('browserbase turns solving and Verified mode on only with their grants', async () => {
    const api = sessionServing('bb_1')
    await browserbaseOps({ apiKey: 'k' }, api.handler, { authorized: ['vendor_captcha_solving', 'vendor_stealth'] }).createSession()
    const body = api.requests[0]!.body as { browserSettings: Record<string, unknown> }
    expect(body.browserSettings.solveCaptchas).toBe(true)
    expect(body.browserSettings.verified).toBe(true)
    expect(body.browserSettings).not.toHaveProperty('advancedStealth')
  })

  it('steel keeps its fingerprint and turns solving on only with their grants', async () => {
    const api = sessionServing('st_1')
    await steelOps({ apiKey: 'k' }, api.handler, { authorized: ['vendor_captcha_solving', 'vendor_stealth'] }).createSession()
    const body = api.requests[0]!.body as { solveCaptcha: boolean; stealthConfig: Record<string, unknown> }
    expect(body.solveCaptcha).toBe(true)
    expect(body.stealthConfig).toEqual({ skipFingerprintInjection: false, autoCaptchaSolving: true, humanizeInteractions: false })
  })

  it('a deferred or forever-refused name in the policy changes nothing on the wire', async () => {
    const api = sessionServing('bb_1')
    const ops = browserbaseOps({ apiKey: 'k' }, api.handler, { authorized: ['camoufox', 'identity_rotation', 'captcha_solving'] })
    await ops.createSession()
    const body = api.requests[0]!.body as { browserSettings: Record<string, unknown> }
    expect(body.browserSettings.solveCaptchas).toBe(false)
    expect(body.browserSettings.advancedStealth).toBe(false)
    expect(ops.decision.declined.map((v) => [v.capability, v.decision])).toEqual([
      ['camoufox', 'deferred'], ['identity_rotation', 'refused'], ['captcha_solving', 'unknown'],
    ])
  })

  it('browserbase session body gains context persistence ONLY when authorized', async () => {
    const plain = sessionServing('bb_1')
    await browserbaseOps({ apiKey: 'k' }, plain.handler).createSession()
    const plainBody = plain.requests[0]!.body as { browserSettings: Record<string, unknown> }
    expect(plainBody.browserSettings.context).toBeUndefined()

    const persisted = sessionServing('bb_2')
    const ops = browserbaseOps({ apiKey: 'k' }, persisted.handler, {
      authorized: ['session_persistence'],
    })
    await ops.createSession({ browserbaseContextId: 'ctx-123' })
    const persistedBody = persisted.requests[0]!.body as {
      browserSettings: { context?: { id: string; persist: boolean } }
    }
    expect(persistedBody.browserSettings.context).toEqual({ id: 'ctx-123', persist: true })
  })

  it('steel session body carries profileId/persistProfile only when authorized', async () => {
    const plain = sessionServing('st_1')
    await steelOps({ apiKey: 'k' }, plain.handler).createSession()
    const plainBody = plain.requests[0]!.body as Record<string, unknown>
    expect(plainBody.profileId).toBeUndefined()
    expect(plainBody.persistProfile).toBeUndefined()

    const persisted = sessionServing('st_2')
    const ops = steelOps({ apiKey: 'k' }, persisted.handler, { authorized: ['session_persistence'] })
    await ops.createSession({ steelProfileId: 'prof-9' })
    const persistedBody = persisted.requests[0]!.body as Record<string, unknown>
    expect(persistedBody.profileId).toBe('prof-9')
    expect(persistedBody.persistProfile).toBe(true)
  })

  it('browserbase fetches the live-view URL only when handoff is authorized', async () => {
    const plain = sessionServing('bb_1')
    const session = await browserbaseOps({ apiKey: 'k' }, plain.handler).createSession()
    expect(session.handoffUrl).toBeNull()
    expect(plain.requests.some((r) => r.url.includes('/debug'))).toBe(false)

    const withLive = new FakeApi((req) =>
      req.url.endsWith('/debug')
        ? { status: 200, json: { debuggerFullscreenUrl: 'https://live.bb/session/1' } }
        : { status: 201, json: { id: 'bb_2', connectUrl: 'wss://cdp.example/bb_2' } },
    )
    const ops = browserbaseOps({ apiKey: 'k' }, withLive.handler, { authorized: ['live_view_handoff'] })
    const liveSession = await ops.createSession()
    expect(liveSession.handoffUrl).toBe('https://live.bb/session/1')
    expect(withLive.requests.some((r) => r.url.includes('/debug'))).toBe(true)
  })

  it('steel handoff url comes from sessionViewerUrl when authorized', async () => {
    const plain = sessionServing('st_1')
    const session = await steelOps({ apiKey: 'k' }, plain.handler).createSession()
    expect(session.handoffUrl).toBeNull()

    const withViewer = new FakeApi((req) =>
      req.method === 'POST' && req.url.endsWith('/v1/sessions')
        ? { status: 201, json: { id: 'st_2', sessionViewerUrl: 'https://app.steel.dev/session/st_2' } }
        : { status: 200, json: {} },
    )
    const ops = steelOps({ apiKey: 'k' }, withViewer.handler, { authorized: ['live_view_handoff'] })
    const liveSession = await ops.createSession()
    expect(liveSession.handoffUrl).toBe('https://app.steel.dev/session/st_2')
  })
})

// --- first-use persistence (the ops-level half of the session loop) ---------

describe('vendor first-use persistence', () => {
  it('browserbase ensurePersistence creates ONE context and returns its id, only when authorized', async () => {
    const contexts: unknown[] = []
    const api = new FakeApi((req) =>
      req.url.endsWith('/v1/contexts')
        ? (contexts.push(req.body), { status: 201, json: { id: 'ctx-42' } })
        : { status: 201, json: { id: 'bb_x', connectUrl: 'wss://cdp.example/bb_x' } },
    )

    const denied = browserbaseOps({ apiKey: 'k' }, api.handler)
    expect(await denied.ensurePersistence!()).toBeNull()
    expect(contexts).toEqual([])

    const authorized = browserbaseOps({ apiKey: 'k' }, api.handler, {
      authorized: ['session_persistence'],
    })
    const resume = await authorized.ensurePersistence!()
    expect(resume).toEqual({ browserbaseContextId: 'ctx-42' })
    expect(contexts).toHaveLength(1)

    // The created context id is exactly what a session body should carry next.
    const session = await authorized.createSession(resume)
    expect(session.resumeContext).toEqual({ browserbaseContextId: 'ctx-42' })
  })

  it('steel ensurePersistence is a no-op by design — the create response carries the profileId', async () => {
    const withProfile = new FakeApi((req) =>
      req.method === 'POST' && req.url.endsWith('/v1/sessions')
        ? { status: 201, json: { id: 'st_9', profileId: 'prof-77' } }
        : { status: 200, json: {} },
    )
    const ops = steelOps({ apiKey: 'k' }, withProfile.handler, {
      authorized: ['session_persistence'],
    })
    expect(await ops.ensurePersistence!()).toBeNull()
    const session = await ops.createSession()
    // The resume material comes from the session itself, saved by the ladder
    // after a contentful fetch.
    expect(session.resumeContext).toEqual({ steelProfileId: 'prof-77' })
    // And the body that created it must have asked Steel to persist.
    const body = withProfile.requests[0]!.body as Record<string, unknown>
    expect(body.persistProfile).toBe(true)
  })
})

describe('a provider session under a tariff (ROADMAP PA item 4)', () => {
  const decision = evaluateVendorPolicy([{ capability: 'headless_browser', vendorDefaultOn: true, enableKey: null }], {})
  it('asks Browserbase to end the session at maxSessionMs (60 s at least), with its proxies off and no keep-alive', () => {
    expect(browserbaseSessionBody(decision, undefined, null, 90_000)).toMatchObject({ timeout: 90, proxies: false, keepAlive: false })
    expect(browserbaseSessionBody(decision, undefined, null, 20_000)).toMatchObject({ timeout: 60 })
    // Without a tariff the body is what it was: the project's defaults.
    expect(browserbaseSessionBody(decision, undefined, null)).not.toHaveProperty('timeout')
  })

  it('asks Steel to end the session at maxSessionMs (15 s at least), with no proxy', () => {
    expect(steelSessionBody(decision, null, 120_000)).toMatchObject({ timeout: 120_000, useProxy: false })
    expect(steelSessionBody(decision, null, 5_000)).toMatchObject({ timeout: 15_000 })
    expect(steelSessionBody(decision, null)).not.toHaveProperty('timeout')
    // The proxy is said either way, never bought by omission.
    expect(steelSessionBody(decision, null)).toMatchObject({ useProxy: false })
  })
})

describe('a provider\'s residential proxy and what a session used (ROADMAP PA item 4)', () => {
  const session = (sessionId: string, over: Record<string, unknown> = {}, captchas: unknown = []) => new FakeApi((req) =>
    req.method === 'POST' && req.url.endsWith('/v1/sessions') ? { status: 201, json: { id: sessionId } }
      : req.method === 'GET' && req.url.endsWith(`/v1/sessions/${sessionId}/captchas/status`) ? { status: 200, json: captchas }
        : req.method === 'GET' && req.url.endsWith(`/v1/sessions/${sessionId}`) ? { status: 200, json: { id: sessionId, status: 'released', proxyBytesUsed: 4_200_000, creditsUsed: 0.05, proxySource: 'steel', ...over } }
          : { status: 200, json: {} })

  it('asks Steel for its residential pool, in the country configured, only under the vendor_residential_proxy grant', async () => {
    const granted = session('st_1')
    await steelOps({ apiKey: 'k', proxyCountry: 'GB' }, granted.handler, { authorized: ['vendor_residential_proxy'] }).createSession()
    expect((granted.requests[0]!.body as { useProxy: unknown }).useProxy).toEqual({ geolocation: { country: 'GB' } })
    const us = session('st_1')
    await steelOps({ apiKey: 'k' }, us.handler, { authorized: ['vendor_residential_proxy'] }).createSession()
    expect((us.requests[0]!.body as { useProxy: unknown }).useProxy).toEqual({ geolocation: { country: 'US' } })
    // The old operational key is no grant: the browser machine's own address, which bills no bandwidth.
    const old = session('st_1')
    const ops = steelOps({ apiKey: 'k', proxyCountry: 'GB' }, old.handler, { authorized: ['residential_proxy'] })
    await ops.createSession()
    expect((old.requests[0]!.body as { useProxy: unknown }).useProxy).toBe(false)
    expect(ops.limits).toEqual({ maxBytesPerCall: null, proxyCountry: null })
    // The byte bound is the residential proxy's: without the grant a session on the machine's own address is not counted against it.
    expect(steelOps({ apiKey: 'k', maxBytesPerCall: 1_000 }, old.handler).limits).toEqual({ maxBytesPerCall: null, proxyCountry: null })
    expect(() => steelOps({ apiKey: 'k', proxyCountry: 'usa' }, old.handler)).toThrow('ISO 3166-1 alpha-2')
  })

  it('reads what the session used after its release: the bytes through the proxy, and the solves when solving was granted', async () => {
    const api = session('st_1', {}, [{ pageUrl: 'https://a.example/', tasks: [{ id: 't1', status: 'solved' }, { id: 't2', status: 'failed_to_solve' }] }, { pageUrl: 'https://b.example/', tasks: [{ id: 't3', status: 'solved' }] }])
    const solving = steelOps({ apiKey: 'k' }, api.handler, { authorized: ['vendor_captcha_solving'] })
    expect(await solving.sessionUsage!('st_1')).toEqual({ proxyBytes: 4_200_000, solves: 2 })
    // The solves are read while the session lives too, since Steel's status is gone some time after the release.
    expect(await solving.liveUsage!('st_1')).toEqual({ solves: 2 })
    expect(await steelOps({ apiKey: 'k' }, api.handler).liveUsage!('st_1')).toEqual({ solves: 0 })
    await expect(steelOps({ apiKey: 'k' }, new FakeApi(() => ({ status: 404, json: {} })).handler, { authorized: ['vendor_captcha_solving'] }).liveUsage!('st_9')).rejects.toThrow('steel: captchas status returned 404')
    // Solving not granted: none could have been bought, so zero; a figure Steel does not give is null, never zero.
    expect(await steelOps({ apiKey: 'k' }, session('st_1', { proxyBytesUsed: undefined }).handler).sessionUsage!('st_1')).toEqual({ proxyBytes: null, solves: 0 })
    await expect(steelOps({ apiKey: 'k' }, new FakeApi(() => ({ status: 404, json: {} })).handler).sessionUsage!('st_9')).rejects.toThrow('steel: session read returned 404')
    expect(countSolved({ solved: true, items: [{ status: 'solved', nested: { status: 'solved' } }] })).toBe(2)
  })

  it('reads a residential session\'s bytes again while Steel still says 0, and records null when the figure never comes (arm A, 2026-10-11)', async () => {
    // Steel fills proxyBytesUsed some time after the release: the first reads get 0.
    const late = (figures: number[]) => {
      let reads = 0
      return new FakeApi((req) => req.method === 'GET' && req.url.endsWith('/v1/sessions/st_1')
        ? { status: 200, json: { id: 'st_1', status: 'released', proxySource: 'steel', proxyBytesUsed: figures[Math.min(reads++, figures.length - 1)] } }
        : { status: 200, json: {} })
    }
    const residential = (api: FakeApi) => steelOps({ apiKey: 'k', usageReadWaitsMs: [1, 1, 1] }, api.handler, { authorized: ['vendor_residential_proxy'] })
    const came = late([0, 0, 4_200_000])
    expect(await residential(came).sessionUsage!('st_1', Date.now() + 5_000)).toEqual({ proxyBytes: 4_200_000, solves: 0 })
    expect(came.requests.filter((r) => r.method === 'GET')).toHaveLength(3)
    // Still 0 after every wait: unknown, never zero (a page through a proxy moved bytes).
    const never = late([0])
    expect(await residential(never).sessionUsage!('st_1', Date.now() + 5_000)).toEqual({ proxyBytes: null, solves: 0 })
    expect(never.requests.filter((r) => r.method === 'GET')).toHaveLength(4)
    // No wait past the deadline, and none without the residential proxy, whose 0 is the session's own address.
    const cut = late([0])
    expect(await residential(cut).sessionUsage!('st_1', Date.now())).toEqual({ proxyBytes: null, solves: 0 })
    expect(cut.requests.filter((r) => r.method === 'GET')).toHaveLength(1)
    const own = late([0])
    expect(await steelOps({ apiKey: 'k', usageReadWaitsMs: [1] }, own.handler).sessionUsage!('st_1', Date.now() + 5_000)).toEqual({ proxyBytes: 0, solves: 0 })
    expect(own.requests.filter((r) => r.method === 'GET')).toHaveLength(1)
  })

  it('reads the solves before the release and keeps them when the status is gone after it (arm B, 2026-10-11)', async () => {
    let released = false
    const api = new FakeApi((req) => {
      if (req.method === 'POST' && req.url.endsWith('/v1/sessions')) return { status: 201, json: { id: 'st_1' } }
      if (req.method === 'POST' && req.url.endsWith('/release')) { released = true; return { status: 200, json: { success: true } } }
      if (req.url.endsWith('/captchas/status')) return released ? { status: 404, json: { error: 'Not Found' } } : { status: 200, json: [{ tasks: [{ status: 'solved' }] }] }
      return { status: 200, json: { id: 'st_1', status: 'released', proxySource: null, proxyBytesUsed: 0 } }
    })
    const ops = steelOps({ apiKey: 'k' }, api.handler, { authorized: ['vendor_captcha_solving'] })
    const transport = new CdpVendorTransport(ops, connectorFor(fakeBrowser()).connector)
    await transport.resolveUserAgent()
    await transport.close()
    expect(transport.closedSessions()).toEqual([{ sessionMs: expect.any(Number), released: true, usage: { proxyBytes: 0, solves: 1 } }])
    // The status was asked before the release, and again after it as the fallback (404 then): the live figure stands.
    expect(api.requests.map((r) => r.url.split('/').slice(-1)[0])).toEqual(['sessions', 'status', 'release', 'st_1', 'status'])
  })

  it('keeps the provider\'s figures with each closed session, and counts what the page received against maxBytesPerCall', async () => {
    const api = session('st_1')
    const ops = { ...steelOps({ apiKey: 'k', maxBytesPerCall: 1_000 }, api.handler, { authorized: ['vendor_residential_proxy'] }) }
    const small = new CdpVendorTransport(ops, connectorFor(fakeBrowser({ bytesPerNavigation: 400 })).connector)
    expect((await small.fetch('https://shop.example/dp/A')).status).toBe(200)
    await small.close()
    expect(small.closedSessions()).toEqual([{ sessionMs: expect.any(Number), released: true, usage: { proxyBytes: 4_200_000, solves: 0 }, bytesCounted: 400, bytesCapped: false }])
    // Past the cap the page is closed and the fetch fails saying so; the session is released and its count recorded.
    const big = new CdpVendorTransport(ops, connectorFor(fakeBrowser({ bytesPerNavigation: 5_000 })).connector)
    await expect(big.fetch('https://shop.example/dp/A')).rejects.toThrow('maxBytesPerCall: 5000 bytes received on the page against 1000 allowed')
    expect(big.closedSessions()).toEqual([expect.objectContaining({ released: true, bytesCounted: 5_000, bytesCapped: true })])
    // A connector whose context opens no CDP session counts nothing, and says so.
    const blind = new CdpVendorTransport(ops, connectorFor(fakeBrowser()).connector)
    await blind.fetch('https://shop.example/dp/A')
    await blind.close()
    expect(blind.closedSessions()[0]).toMatchObject({ bytesCounted: 0, bytesCapped: false })
  })
})
