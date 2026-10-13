/**
 * ADR 0005 `installed_chrome` (revision of 2026-10-13): the Google Chrome installed on the person's machine, launched
 * by Octocrawl the way the 2026-10-13 and 2026-10-14 library probes measured it, then driven by Playwright over CDP.
 * The launch is what got through Cloudflare and DataDome checks the bundled Chromium did not
 * (research/access/runs/2026-10-14-library-probe-cdp-safe-launch.md and the Playwright-over-CDP comparison of the same
 * day), so it is kept exactly:
 *
 * - nodriver 0.50.6's flags without `--remote-allow-origins`: the page being read cannot open the DevTools WebSocket,
 *   while the driver, which sends no Origin, can;
 * - `--remote-debugging-host=127.0.0.1` with a free port the driver asks the operating system for and passes itself,
 *   never `--remote-debugging-port=0` (Chrome choosing its own port held Cloudflare's challenge) and never a port in use
 *   on the machine;
 * - headed, always: headless reached 1 of 16 tasks;
 * - a fresh temporary profile per launch, deleted when the browser closes; never the person's own profile.
 *
 * Exit and proxy flags are the run's own (`--proxy-server`, `--proxy-bypass-list`). The flags that shape detection are
 * DETECTION_FLAGS and change only after two runs on the 16 tasks (ADR 0005).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { constants, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { chromium, type Browser, type LaunchOptions } from 'playwright'

/** The flags that shape detection, as measured: nodriver 0.50.6's defaults less `--remote-allow-origins`. */
export const DETECTION_FLAGS: readonly string[] = [
  '--no-first-run', '--no-service-autorun', '--no-default-browser-check', '--homepage=about:blank', '--no-pings',
  '--password-store=basic', '--disable-infobars', '--disable-breakpad', '--disable-dev-shm-usage', '--disable-session-crashed-bubble',
  '--disable-search-engine-choice-screen', '--disable-features=IsolateOrigins,site-per-process',
]

/** The name the record gives this flag set, so a later change to DETECTION_FLAGS reads as another set. */
export const DETECTION_FLAGS_ID = 'nodriver-0.50.6-no-allow-origins'

/** Ports a local Octocrawl setup is known to hold; a launch never takes one (ADR 0005: avoid the machine's own). */
export const AVOID_PORTS: ReadonlySet<number> = new Set([8787, 8791, 8792, 8794, 8795, 8796, 8797, 8798, 8812, 8813, 8814])

/** What a machine without Google Chrome is told, by the browser_not_installed warning (ladder.ts) and its hint. */
export const INSTALLED_CHROME_INSTALL = 'install Google Chrome from https://www.google.com/chrome/ (or set W2L_CHROME_PATH to its executable)'

/** Windows the route may hold open at once, across the whole process (ADR 0005: at most 2). */
export const INSTALLED_CHROME_MAX_WINDOWS = 2

/** The error a launch fails with when no Google Chrome is found; browserNotInstalled (browserInstall.ts) reads it. */
export class InstalledChromeMissingError extends Error {
  override readonly name = 'InstalledChromeMissingError'
  constructor(detail: string) { super(`Google Chrome is not installed where Octocrawl runs: ${detail}; ${INSTALLED_CHROME_INSTALL}`) }
}

/** Where Google Chrome usually is, per platform; W2L_CHROME_PATH overrides. */
export function chromeCandidates(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const explicit = env.W2L_CHROME_PATH?.trim()
  if (explicit) return [explicit]
  if (platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(env.HOME ?? '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
  if (platform === 'win32') {
    return [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
      .filter((dir): dir is string => typeof dir === 'string' && dir !== '')
      .map((dir) => join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  }
  return (env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((dir) => ['google-chrome', 'google-chrome-stable'].map((name) => join(dir, name)))
}

/** The first candidate that exists and can run, or the missing-Chrome error naming where it looked. */
export async function findInstalledChrome(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Promise<string> {
  const candidates = chromeCandidates(env, platform)
  for (const path of candidates) {
    try { await access(path, platform === 'win32' ? constants.F_OK : constants.X_OK); return path } catch {}
  }
  throw new InstalledChromeMissingError(candidates.length === 0 ? 'no place to look' : `looked at ${candidates.slice(0, 4).join(', ')}`)
}

/** A free port on 127.0.0.1 from the operating system, never one of `avoid`. */
export async function freeDebuggingPort(avoid: ReadonlySet<number> = AVOID_PORTS): Promise<number> {
  for (;;) {
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const value = typeof address === 'object' && address !== null ? address.port : 0
        server.close(() => resolve(value))
      })
    })
    if (port !== 0 && !avoid.has(port)) return port
  }
}

/**
 * Chrome's command line: the detection flags, the profile, the debugging host and port, and the run's egress. A proxy
 * with a login cannot be given to Chrome on its command line, and intercepting requests to answer the challenge is what
 * the route must not do (ADR 0005), so such a proxy is refused by name.
 */
export function installedChromeArgs(profile: string, port: number, launch: Pick<LaunchOptions, 'proxy' | 'args'>): string[] {
  if (launch.proxy?.username !== undefined && launch.proxy.username !== '') {
    throw new Error('installed_chrome cannot use a proxy that needs a login: Chrome takes no proxy credentials on its command line; use a proxy without one (a local forwarder) for this route')
  }
  const egress = launch.proxy !== undefined
    ? [`--proxy-server=${launch.proxy.server}`, ...(launch.proxy.bypass ? [`--proxy-bypass-list=${launch.proxy.bypass}`] : [])]
    : (launch.args ?? []).filter((arg) => arg.startsWith('--proxy-server=') || arg.startsWith('--proxy-bypass-list=') || arg.startsWith('--host-resolver-rules='))
  return [...DETECTION_FLAGS, `--user-data-dir=${profile}`, '--remote-debugging-host=127.0.0.1', `--remote-debugging-port=${port}`, ...egress, 'about:blank']
}

/** A counting gate: at most `max` holders at once, the rest wait in order; a freed slot passes straight to the next waiter. */
export class WindowGate {
  private held = 0
  private readonly waiting: (() => void)[] = []
  constructor(readonly max: number) {}
  async acquire(signal?: AbortSignal): Promise<() => void> {
    const abandoned = () => new DOMException('installed_chrome window wait abandoned', 'AbortError')
    if (signal?.aborted) throw abandoned()
    if (this.held < this.max) this.held++
    else {
      // The slot is handed over by release(): held stays as it is, so no acquire in between can take it.
      await new Promise<void>((resolve, reject) => {
        const go = () => { signal?.removeEventListener('abort', stop); resolve() }
        const stop = () => { const i = this.waiting.indexOf(go); if (i >= 0) this.waiting.splice(i, 1); reject(abandoned()) }
        this.waiting.push(go)
        signal?.addEventListener('abort', stop, { once: true })
      })
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.shift()
      if (next !== undefined) next()
      else this.held--
    }
  }
  get inUse(): number { return this.held }
}

/** The process-wide gate every installed_chrome launch passes (ADR 0005: at most 2 windows on the person's screen). */
export const INSTALLED_CHROME_WINDOWS = new WindowGate(INSTALLED_CHROME_MAX_WINDOWS)

/** Where a launched Chrome listens and keeps its profile, for diagnostics and tests; Chrome itself will not say (no --enable-automation). */
export interface InstalledChromeLaunch { executable: string; port: number; profile: string }
const LAUNCHES = new WeakMap<Browser, InstalledChromeLaunch>()
export function installedChromeLaunchOf(browser: Browser): InstalledChromeLaunch | undefined { return LAUNCHES.get(browser) }

/**
 * Test seams: another executable (a stand-in Chromium), headless where no display exists, and flags a CI runner needs
 * (`--no-sandbox` where the runner forbids Chromium's sandbox, as Playwright's own launch adds on Linux). Never set by
 * the product.
 */
export interface InstalledChromeTestSeams { executable?: string; headless?: boolean; extraArgs?: readonly string[] }

/**
 * The Chromes and profiles still open, ended and deleted if the process exits first (Ctrl-C, process.exit): Playwright's
 * own launch does this for the browsers it starts, and a Chrome spawned here has no one else to do it.
 */
const LIVE = new Set<{ child: ChildProcess | null; profile: string | null }>()
let exitHookSet = false
function onExitCleanUp(): void {
  for (const live of LIVE) {
    try { if (live.child !== null && live.child.exitCode === null) live.child.kill('SIGKILL') } catch {}
    try { if (live.profile !== null) rmSync(live.profile, { recursive: true, force: true }) } catch {}
  }
}

const aborted = () => new DOMException('installed_chrome launch abandoned', 'AbortError')

async function waitForDebugging(port: number, child: ChildProcess, timeoutMs: number, signal?: AbortSignal, said: () => string = () => ''): Promise<void> {
  const until = Date.now() + timeoutMs
  const tail = () => { const text = said().trim(); return text === '' ? '' : `; Chrome said: ${text.slice(-400)}` }
  for (;;) {
    if (signal?.aborted) throw aborted()
    if (child.exitCode !== null) throw new Error(`Chrome exited before it opened its debugging port (exit ${child.exitCode})${tail()}`)
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) return } catch {}
    if (Date.now() > until) throw new Error(`Chrome did not open its debugging port within ${timeoutMs} ms${tail()}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Launch the installed Chrome as measured and connect Playwright to it. The returned Browser's close() also ends the
 * Chrome process, frees its window and deletes its profile. `options.headless` is ignored: the route is headed. A
 * `signal` that aborts while the launch waits for a window or for Chrome stops it there: no Chrome outlives its caller.
 */
export async function launchInstalledChrome(options: LaunchOptions, seams: InstalledChromeTestSeams = {}, signal?: AbortSignal): Promise<Browser> {
  const executable = seams.executable ?? await findInstalledChrome()
  const release = await INSTALLED_CHROME_WINDOWS.acquire(signal)
  let profile: string | null = null
  let child: ChildProcess | null = null
  const live: { child: ChildProcess | null; profile: string | null } = { child: null, profile: null }
  LIVE.add(live)
  if (!exitHookSet) { exitHookSet = true; process.once('exit', onExitCleanUp) }
  const cleanUp = async () => {
    if (child !== null && child.exitCode === null) child.kill('SIGKILL')
    if (profile !== null) {
      // Chrome may still be writing its profile for a moment after the kill.
      for (let attempt = 0; attempt < 5; attempt++) {
        try { await rm(profile, { recursive: true, force: true }); break } catch { await new Promise((resolve) => setTimeout(resolve, 200)) }
      }
    }
    LIVE.delete(live)
    release()
  }
  try {
    profile = await mkdtemp(join(tmpdir(), 'octocrawl-installed-chrome-'))
    live.profile = profile
    if (signal?.aborted) throw aborted()
    const port = await freeDebuggingPort()
    const args = installedChromeArgs(profile, port, options)
    const seamArgs = [...(seams.headless === true ? ['--headless=new'] : []), ...(seams.extraArgs ?? [])]
    child = spawn(executable, seamArgs.length === 0 ? args : [...args.slice(0, -1), ...seamArgs, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
    live.child = child
    const launched = child
    // The last of what Chrome writes to stderr, for a launch that fails; read throughout so the pipe never fills.
    let stderr = ''
    launched.stderr?.setEncoding('utf8')
    launched.stderr?.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2_000) })
    await new Promise<void>((resolve, reject) => {
      launched.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT' ? new InstalledChromeMissingError(`${executable} could not be run`) : error))
      launched.once('spawn', () => resolve())
    })
    await waitForDebugging(port, launched, options.timeout ?? 30_000, signal, () => stderr)
    // An abort during the connect kills Chrome, which ends the connect at once.
    const stopConnect = () => { if (launched.exitCode === null) launched.kill('SIGKILL') }
    signal?.addEventListener('abort', stopConnect, { once: true })
    let browser: Browser
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: options.timeout ?? 30_000 }) } finally { signal?.removeEventListener('abort', stopConnect) }
    if (signal?.aborted) { await browser.close().catch(() => {}); throw aborted() }
    const disconnect = browser.close.bind(browser)
    let closing: Promise<void> | null = null
    browser.close = async () => {
      closing ??= (async () => { await disconnect().catch(() => {}); await cleanUp() })()
      return closing
    }
    browser.on('disconnected', () => { void browser.close() })
    LAUNCHES.set(browser, { executable, port, profile })
    return browser
  } catch (error) {
    await cleanUp()
    throw error
  }
}
