import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { chromium } from 'playwright'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { DETECTION_FLAGS_ID, INSTALLED_CHROME_WINDOWS, installedChromeLaunchOf, launchInstalledChrome } from '../src/subjects/installedChrome.js'
import { CapSolver } from '../src/vendors/capsolver.js'
import { startMockCapSolver } from './mockCapSolver.js'

// Playwright's own Chromium stands in for the installed Google Chrome, headless because CI has no display: the test
// proves the launch, the closed DevTools port, the profile's removal and the lane's wiring, not Chrome's detection.
// A CI runner on Linux forbids Chromium's sandbox, so the stand-in runs without it there, as Playwright's own launch does.
const seams = { executable: chromium.executablePath(), headless: true, ...(process.platform === 'linux' ? { extraArgs: ['--no-sandbox'] } : {}) }

let server: FixtureServer
/** A page of another origin that tries to open the browser's DevTools WebSocket, as a hostile page would. */
let attacker: Server
let attackerUrl = ''
const ARTICLE = `<!doctype html><title>Tide tables</title><main><h1>Tide tables</h1>${'<p>The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year.</p>'.repeat(6)}</main>`
/** A Cloudflare-style managed challenge: 403 with cf-mitigated until its script sets a cookie and reloads (/clears), or for ever (/holds). */
const CHALLENGE = `<!doctype html><title>Just a moment...</title><p>Checking your browser before accessing the site.</p>`
/** DataDome's captcha, which waits for a person or a solver: its iframe from captcha-delivery.com, which blockAds keeps offline here. */
const DATADOME = `<!doctype html><title>shop</title><p>Please enable JS and disable any ad blocker</p><iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=abc&cid=def&t=fe&referer=x" width="100%" height="100%"></iframe>`
/**
 * An ordinary page that loads reCAPTCHA's script for a form and says "please wait": the script from google.com, which
 * blockAds keeps offline here. Where google.com does not answer, its parser-blocking script would hold the page's
 * DOMContentLoaded past the navigation's 20 s.
 */
const WIDGET = ARTICLE.replace('</main>', '</main><script src="https://www.google.com/recaptcha/api.js?render=abc"></script><noscript>Please enable JavaScript</noscript><p>Please wait</p>')
beforeAll(async () => {
  server = await startFixtureServer()
  attacker = createServer((req, res) => {
    if (req.url?.startsWith('/clears') && (req.headers.cookie ?? '').includes('cleared=1')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(ARTICLE); return }
    // The page a cleared check reloads into holds its parser at a script in its head, so for a while the document has no body.
    if (req.url?.startsWith('/slowhead') && (req.headers.cookie ?? '').includes('passed=1')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(ARTICLE.replace('<main>', '<script src="/slow.js"></script><main>')); return }
    if (req.url?.startsWith('/slow.js')) { setTimeout(() => { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end('') }, 3_000); return }
    if (req.url?.startsWith('/slowhead')) { res.writeHead(403, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }); res.end(CHALLENGE + `<script>setTimeout(() => { document.cookie = 'passed=1; path=/'; location.reload() }, 1500)</script>`); return }
    if (req.url?.startsWith('/datadome')) { res.writeHead(403, { 'content-type': 'text/html', 'x-datadome-cid': 'abc' }); res.end(DATADOME); return }
    if (req.url?.startsWith('/widget')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(WIDGET); return }
    if (req.url?.startsWith('/clears') || req.url?.startsWith('/holds')) {
      const script = req.url.startsWith('/clears') ? `<script>setTimeout(() => { document.cookie = 'cleared=1; path=/'; location.reload() }, 1500)</script>` : ''
      res.writeHead(403, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }); res.end(CHALLENGE + script); return
    }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>attacker</title><p>page</p>')
  })
  await new Promise<void>((resolve) => attacker.listen(0, '127.0.0.1', resolve))
  const address = attacker.address()
  attackerUrl = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}/`
})
afterAll(async () => {
  await server.close()
  await new Promise((resolve) => attacker.close(resolve))
})

type Launched = Awaited<ReturnType<typeof launchInstalledChrome>>

/** The temporary profile a launched Chrome was given. */
const profileOf = (browser: Launched) => installedChromeLaunchOf(browser)!.profile

/** The browser's DevTools WebSocket, as /json/version gives it. */
async function debuggerUrlOf(browser: Launched): Promise<string> {
  const version = await (await fetch(`http://127.0.0.1:${installedChromeLaunchOf(browser)!.port}/json/version`)).json() as { webSocketDebuggerUrl: string }
  return version.webSocketDebuggerUrl
}

describe('installed_chrome: the launch', () => {
  it("connects over a port the page cannot open, and close ends Chrome and deletes its profile", async () => {
    const browser = await launchInstalledChrome({ timeout: 30_000 }, seams)
    let profile = ''
    try {
      expect(INSTALLED_CHROME_WINDOWS.inUse).toBe(1)
      profile = profileOf(browser)
      expect(profile).toMatch(/octocrawl-installed-chrome-/)
      expect(existsSync(profile)).toBe(true)
      const page = browser.contexts()[0]!.pages()[0] ?? await browser.contexts()[0]!.newPage()
      await page.goto(attackerUrl)
      // The page learns the port the way an attacker would (scanning); here it is handed it. Without
      // --remote-allow-origins Chrome refuses a WebSocket whose Origin is a web page's, while the driver connected.
      const wsUrl = await debuggerUrlOf(browser)
      const opened = await page.evaluate(async (url) => await new Promise<string>((resolve) => {
        const socket = new WebSocket(url)
        socket.onopen = () => { socket.close(); resolve('open') }
        socket.onerror = () => resolve('refused')
        setTimeout(() => resolve('timeout'), 5_000)
      }), wsUrl)
      expect(opened).toBe('refused')
    } finally {
      await browser.close()
    }
    expect(existsSync(profile)).toBe(false)
    expect(INSTALLED_CHROME_WINDOWS.inUse).toBe(0)
  }, 60_000)
})

describe('installed_chrome: a launch its caller gave up', () => {
  it('never opens a Chrome for a caller that aborted while it waited for a window, and frees every slot', async () => {
    const holders = await Promise.all([launchInstalledChrome({ timeout: 30_000 }, seams), launchInstalledChrome({ timeout: 30_000 }, seams)])
    const gone = new AbortController()
    const waiting = launchInstalledChrome({ timeout: 30_000 }, seams, gone.signal)
    gone.abort()
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    expect(INSTALLED_CHROME_WINDOWS.inUse).toBe(2)
    for (const holder of holders) await holder.close()
    expect(INSTALLED_CHROME_WINDOWS.inUse).toBe(0)
  }, 60_000)
})

describe('installed_chrome: the browser lane on it', () => {
  it("reads a page with the browser's own identity, names the Chrome it ran, and launches one Chrome per fetch", async () => {
    const subject = new BrowserLocalSubject('standard', null, true, undefined, null, undefined, null, undefined, undefined, null, false, undefined, 'installed_chrome', 'actual', seams)
    try {
      const out = await subject.fetch(`${server.url}/static/article`)
      expect(out).toMatchObject({ status: 'success', lane: 'browser_local' })
      const engine = out.trace.find((event) => event.event === 'browser_engine')
      expect(engine?.detail).toMatchObject({ engine: 'installed_chrome', flags: DETECTION_FLAGS_ID })
      expect(typeof engine?.detail?.version).toBe('string')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'identity_declared', detail: expect.objectContaining({ identity: 'actual' }) }))
      expect(INSTALLED_CHROME_WINDOWS.inUse).toBe(0)
      const again = await subject.fetch(`${server.url}/static/article`)
      expect(again.status).toBe('success')
      expect(again.trace.filter((event) => event.event === 'browser_engine')).toHaveLength(1)
    } finally {
      await subject.teardown()
    }
  }, 90_000)

  it('waits out a check that clears itself, reading the page it then shows, and stops waiting at the deadline for one that does not', async () => {
    const subject = new BrowserLocalSubject('standard', null, true, undefined, null, undefined, null, undefined, undefined, null, false, ['google.com'], 'installed_chrome', 'actual', seams)
    try {
      const cleared = await subject.fetch(`${attackerUrl}clears`)
      expect(cleared).toMatchObject({ status: 'success', evidence: { httpStatus: 200 } })
      expect(cleared.markdown).toContain('Tide tables')
      expect(cleared.trace).toContainEqual(expect.objectContaining({ event: 'challenge_wait', detail: expect.objectContaining({ blockReason: 'cloudflare_challenge', outcome: 'cleared' }) }))
      const started = Date.now()
      const held = await subject.fetch(`${attackerUrl}holds`, Date.now() + 9_000)
      expect(held).toMatchObject({ status: 'blocked', blockReason: 'cloudflare_challenge' })
      expect(held.trace).toContainEqual(expect.objectContaining({ event: 'challenge_wait', detail: expect.objectContaining({ outcome: 'still_gated' }) }))
      expect(Date.now() - started).toBeLessThan(12_000)
      // An ordinary page that loads a captcha script for a form, or says "please wait", is not waited on.
      const widgetStarted = Date.now()
      const widget = await subject.fetch(`${attackerUrl}widget`)
      expect(widget.status).toBe('success')
      expect(widget.trace).toContainEqual(expect.objectContaining({ event: 'ads_blocked', detail: expect.objectContaining({ hosts: ['www.google.com'] }) }))
      expect(widget.trace.some((event) => event.event === 'challenge_wait')).toBe(false)
      expect(Date.now() - widgetStarted).toBeLessThan(15_000)
    } finally {
      await subject.teardown()
    }
  }, 90_000)

  it('reads the page a cleared check reloads into once it has a body, not while its parser waits on a script in its head (ADR 0005 gate run 1, T076)', async () => {
    const subject = new BrowserLocalSubject('standard', null, true, undefined, null, undefined, null, undefined, undefined, null, false, ['google.com'], 'installed_chrome', 'actual', seams)
    try {
      const out = await subject.fetch(`${attackerUrl}slowhead`)
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'challenge_wait', detail: expect.objectContaining({ blockReason: 'cloudflare_challenge', outcome: 'cleared' }) }))
      expect(out).toMatchObject({ status: 'success', evidence: { httpStatus: 200 } })
      expect(out.markdown).toContain('harbour office')
    } finally {
      await subject.teardown()
    }
  }, 90_000)

  it("does not wait on a captcha, and hands it straight to the grant's solver (ADR 0005, revision of 2026-10-26)", async () => {
    const mock = await startMockCapSolver(() => ({ solution: { cookie: 'datadome=dd-secret-3; Path=/' } }))
    const solving = { solver: new CapSolver({ apiKey: 'CAP-int-key-51ee', baseUrl: mock.url, pollMs: 20 }), perSolveUsd: 0.003, maxSolvesPerCall: 1, egress: null, grantHash: 'f'.repeat(64) }
    const subject = new BrowserLocalSubject('standard', null, true, undefined, null, undefined, null, undefined, undefined, null, false, ['captcha-delivery.com'], 'installed_chrome', 'actual', seams, solving)
    try {
      const started = Date.now()
      const out = await subject.fetch(`${attackerUrl}datadome`)
      expect(out).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'challenge_wait', detail: { blockReason: 'captcha', outcome: 'not_waited', ms: 0, capMs: 0 } }))
      // The solver saw the page at once; a DataDome answer is bought only on the grant's solver exit, which this grant chose none of.
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'captcha_solve', detail: expect.objectContaining({ type: 'datadome', rung: 'installed_chrome', outcome: 'egress_mismatch', reason: 'grant_chose_no_solver_exit' }) }))
      expect(mock.tasks).toEqual([])
      expect(Date.now() - started).toBeLessThan(10_000)
    } finally {
      await subject.teardown()
      await mock.close()
    }
  }, 60_000)

  it('says Google Chrome is missing, with where to get it, when there is none', async () => {
    const subject = new BrowserLocalSubject('standard', null, true, undefined, null, undefined, null, undefined, undefined, null, false, undefined, 'installed_chrome', 'actual', { executable: '/nonexistent/octocrawl-test/chrome' })
    try {
      const out = await subject.fetch(`${server.url}/static/article`)
      expect(out).toMatchObject({ status: 'failed', failureReason: 'connection_error' })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'browser_unavailable', detail: expect.objectContaining({ engine: 'installed_chrome', install: expect.stringContaining('install Google Chrome') }) }))
      expect(INSTALLED_CHROME_WINDOWS.inUse).toBe(0)
    } finally {
      await subject.teardown()
    }
  }, 30_000)

  it('runs only as the standard public browser with its own identity', () => {
    expect(() => new BrowserLocalSubject('research', null, true, undefined, null, undefined, null, undefined, undefined, null, false, undefined, 'installed_chrome', 'actual')).toThrow(/installed_chrome runs only/)
    expect(() => new BrowserLocalSubject('standard', null, true, undefined, null, undefined, null, undefined, undefined, null, false, undefined, 'installed_chrome', 'declared')).toThrow(/installed_chrome runs only/)
    expect(() => new BrowserLocalSubject('standard', null, true, undefined, null, undefined, null, ['example.com'], undefined, null, false, undefined, 'installed_chrome', 'actual')).toThrow(/installed_chrome runs only/)
  })
})
