import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { chromium } from 'playwright'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { DETECTION_FLAGS_ID, INSTALLED_CHROME_WINDOWS, installedChromeLaunchOf, launchInstalledChrome } from '../src/subjects/installedChrome.js'

// Playwright's own Chromium stands in for the installed Google Chrome, headless because CI has no display: the test
// proves the launch, the closed DevTools port, the profile's removal and the lane's wiring, not Chrome's detection.
// A CI runner on Linux forbids Chromium's sandbox, so the stand-in runs without it there, as Playwright's own launch does.
const seams = { executable: chromium.executablePath(), headless: true, ...(process.platform === 'linux' ? { extraArgs: ['--no-sandbox'] } : {}) }

let server: FixtureServer
/** A page of another origin that tries to open the browser's DevTools WebSocket, as a hostile page would. */
let attacker: Server
let attackerUrl = ''
beforeAll(async () => {
  server = await startFixtureServer()
  attacker = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>attacker</title><p>page</p>') })
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
