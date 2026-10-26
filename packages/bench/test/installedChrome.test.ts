import { afterEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { browserNotInstalled, browserInstallCommand } from '../src/browserInstall.js'
import { CHALLENGE_WAIT_CAP_MS, chromeProxyError, waitOutGate } from '../src/subjects/browserLocal.js'
import {
  AVOID_PORTS, chromeCandidates, DETECTION_FLAGS, findInstalledChrome, freeDebuggingPort, INSTALLED_CHROME_INSTALL,
  InstalledChromeMissingError, installedChromeArgs, installedChromeRefusal, WindowGate,
} from '../src/subjects/installedChrome.js'

describe('installed_chrome: where Chrome is looked for', () => {
  it('takes W2L_CHROME_PATH alone when set', () => {
    expect(chromeCandidates({ W2L_CHROME_PATH: ' /opt/chrome/chrome ' }, 'linux')).toEqual(['/opt/chrome/chrome'])
  })

  it('looks where each platform installs Google Chrome', () => {
    expect(chromeCandidates({ HOME: '/Users/a' }, 'darwin')).toEqual([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Users/a/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ])
    expect(chromeCandidates({ PATH: ['/usr/bin', '/opt/bin'].join(process.platform === 'win32' ? ';' : ':') }, 'linux')).toEqual([
      join('/usr/bin', 'google-chrome'), join('/usr/bin', 'google-chrome-stable'), join('/opt/bin', 'google-chrome'), join('/opt/bin', 'google-chrome-stable'),
    ])
    expect(chromeCandidates({ PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, 'win32')).toEqual([
      join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join('C:\\Users\\a\\AppData\\Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ])
  })

  it('fails with an error that says what is missing and how to install it, which the browser lane reads as not installed', async () => {
    const error = await findInstalledChrome({ W2L_CHROME_PATH: '/nonexistent/octocrawl-test/chrome' }, 'linux').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(InstalledChromeMissingError)
    expect((error as Error).message).toContain('/nonexistent/octocrawl-test/chrome')
    expect((error as Error).message).toContain(INSTALLED_CHROME_INSTALL)
    expect(browserNotInstalled(error)).toBe(true)
    expect(browserInstallCommand('installed_chrome')).toBe(INSTALLED_CHROME_INSTALL)
  })
})

describe('installed_chrome: the narrowed launch (ADR 0005, 2026-10-13 revision)', () => {
  it('passes the measured detection flags, a temporary profile and a loopback debugging port, never --remote-allow-origins', () => {
    const args = installedChromeArgs('/tmp/profile-x', 41234, {})
    expect(args.slice(0, DETECTION_FLAGS.length)).toEqual([...DETECTION_FLAGS])
    expect(args).toContain('--user-data-dir=/tmp/profile-x')
    expect(args).toContain('--remote-debugging-host=127.0.0.1')
    expect(args).toContain('--remote-debugging-port=41234')
    expect(args.some((arg) => arg.startsWith('--remote-allow-origins'))).toBe(false)
    expect(args.some((arg) => arg === '--headless' || arg.startsWith('--headless='))).toBe(false)
    expect(args.at(-1)).toBe('about:blank')
  })

  it("passes the run's egress as Chrome's own proxy flags and keeps nothing else of Playwright's launch arguments", () => {
    expect(installedChromeArgs('/p', 1, { proxy: { server: 'http://127.0.0.1:7890', bypass: 'localhost' } })).toEqual(expect.arrayContaining(['--proxy-server=http://127.0.0.1:7890', '--proxy-bypass-list=localhost']))
    const direct = installedChromeArgs('/p', 1, { args: ['--proxy-server=direct://', '--disable-gpu'] })
    expect(direct).toContain('--proxy-server=direct://')
    expect(direct).not.toContain('--disable-gpu')
    // Never the operating system's proxy: no egress given is a direct connection.
    expect(installedChromeArgs('/p', 1, {})).toContain('--proxy-server=direct://')
  })

  it('refuses a proxy that needs a login, by name, rather than answering its challenge', () => {
    expect(() => installedChromeArgs('/p', 1, { proxy: { server: 'http://proxy.example:8000', username: 'u', password: 'p' } })).toThrow(/installed_chrome cannot use a proxy that needs a login/)
  })

  it("asks the operating system for a port and never takes one of the machine's own", async () => {
    const port = await freeDebuggingPort()
    expect(port).toBeGreaterThan(0)
    expect(AVOID_PORTS.has(port)).toBe(false)
    expect(AVOID_PORTS.has(8791)).toBe(true)
  })
})

describe('installed_chrome: the wait for a check that clears itself (ADR 0005, revision of 2026-10-26)', () => {
  afterEach(() => { vi.useRealTimers() })

  /** A page whose gate is `shown[n]` on its nth read (the last from then on), counting the reads. */
  function page(...shown: Array<string | null>) {
    let reads = 0
    return { reads: () => reads, gateNow: async () => { const reason = shown[Math.min(reads++, shown.length - 1)] ?? null; return reason === null ? null : { reason } } }
  }

  it('does not wait on a captcha, which waits for someone or a solver to answer it, and says so', async () => {
    vi.useFakeTimers()
    expect(CHALLENGE_WAIT_CAP_MS.get('captcha')).toBe(0)
    const captcha = page('captcha', null)
    expect(await waitOutGate(captcha.gateNow, {}, undefined)).toEqual({ blockReason: 'captcha', outcome: 'not_waited', ms: 0, capMs: 0 })
    expect(captcha.reads()).toBe(1)
  })

  it("waits 10 s at most for a Cloudflare challenge or a bot check that does not clear, and never into the capture's reserve", async () => {
    vi.useFakeTimers()
    for (const reason of ['cloudflare_challenge', 'bot_detected_generic']) {
      const held = page(reason)
      const waiting = waitOutGate(held.gateNow, {}, undefined)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(await waiting).toEqual({ blockReason: reason, outcome: 'still_gated', ms: 10_000, capMs: 10_000 })
      expect(held.reads()).toBe(11)
    }
    // A deadline 5 s away leaves the capture its reserve and the last read its second.
    const near = waitOutGate(page('cloudflare_challenge').gateNow, { deadlineAt: Date.now() + 5_000 }, undefined)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await near).toEqual({ blockReason: 'cloudflare_challenge', outcome: 'still_gated', ms: 3_000, capMs: 10_000 })
  })

  it('ends as soon as the check gives way, here 3 s in', async () => {
    vi.useFakeTimers()
    const clears = page('cloudflare_challenge', 'cloudflare_challenge', 'cloudflare_challenge', null)
    const waiting = waitOutGate(clears.gateNow, {}, undefined)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await waiting).toEqual({ blockReason: 'cloudflare_challenge', outcome: 'cleared', ms: 3_000, capMs: 10_000 })
    expect(clears.reads()).toBe(4)
  })

  it('waits on no other gate, and on no page that shows none', async () => {
    expect(await waitOutGate(page('login_required').gateNow, {}, undefined)).toBeNull()
    expect(await waitOutGate(page(null).gateNow, {}, undefined)).toBeNull()
  })
})

describe('installed_chrome: the requests it takes', () => {
  it('takes a page as Chrome opens it and names each option it does not take (ADR 0005)', () => {
    expect(installedChromeRefusal({})).toBeNull()
    expect(installedChromeRefusal({ actions: [], headers: {}, mobile: false, skipTlsVerification: false })).toBeNull()
    expect(installedChromeRefusal({ mobile: true })).toBe('installed_chrome reads the page as Chrome opened it and takes no mobile (ADR 0005)')
    expect(installedChromeRefusal({ actions: [{ type: 'wait', milliseconds: 10 }], screenshot: { fullPage: false }, headers: { 'x-a': '1' }, skipTlsVerification: true }))
      .toBe('installed_chrome reads the page as Chrome opened it and takes no actions, screenshot, headers, skipTlsVerification (ADR 0005)')
  })
})

describe('the egress proxy refusing Chrome', () => {
  it('is told by Chrome\'s tunnel and proxy errors alone', () => {
    expect(chromeProxyError(new Error('page.goto: net::ERR_PROXY_CONNECTION_FAILED at https://example.com/'))).toBe('ERR_PROXY_CONNECTION_FAILED')
    // Chrome gives the tunnel error too when the proxy could not reach the site: not said to be the proxy's.
    expect(chromeProxyError(new Error('page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://example.com/'))).toBeNull()
    expect(chromeProxyError(new Error('page.goto: net::ERR_CONNECTION_REFUSED at https://example.com/'))).toBeNull()
    expect(chromeProxyError('net::ERR_TUNNEL_CONNECTION_FAILED')).toBeNull()
  })
})

describe('installed_chrome: at most two windows at once', () => {
  it('holds a third launch until a window closes, in order, and lets a waiter give up', async () => {
    const gate = new WindowGate(2)
    const first = await gate.acquire()
    const second = await gate.acquire()
    const order: string[] = []
    const third = gate.acquire().then((release) => { order.push('third'); return release })
    const abandon = new AbortController()
    const gaveUp = gate.acquire(abandon.signal).catch((error: Error) => error.name)
    const fourth = gate.acquire().then((release) => { order.push('fourth'); return release })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(order).toEqual([])
    abandon.abort()
    expect(await gaveUp).toBe('AbortError')
    first()
    first()
    const releaseThird = await third
    expect(order).toEqual(['third'])
    expect(gate.inUse).toBe(2)
    second()
    const releaseFourth = await fourth
    expect(order).toEqual(['third', 'fourth'])
    releaseThird()
    releaseFourth()
    expect(gate.inUse).toBe(0)
  })

  it('passes a freed slot to the waiter, so an acquire in between cannot take it, and refuses an already aborted wait', async () => {
    const gate = new WindowGate(1)
    const first = await gate.acquire()
    const waiter = gate.acquire()
    first()
    const late = gate.acquire()
    await waiter
    expect(gate.inUse).toBe(1)
    let lateHeld = false
    void late.then(() => { lateHeld = true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(lateHeld).toBe(false)
    const gone = new AbortController()
    gone.abort()
    await expect(gate.acquire(gone.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
