/**
 * Handing a page to a person, in the Chrome they already use: a page W2L
 * was stopped at (a captcha, a challenge, a login wall) is opened in a new
 * tab of their Chrome, they get through it there as they would on their own,
 * and W2L reads the page once it is through. W2L passes no check itself and
 * changes nothing about the browser: the person does, in their browser.
 *
 * The connection is the one `w2l login import` uses: Chrome's remote
 * debugging, turned on by the person at chrome://inspect/#remote-debugging
 * and approved by them in Chrome's "Allow remote debugging?" dialog, once
 * for all the pages of one handoff. W2L touches only the tabs it opens, and
 * closes each when it has read it. A page counts as through when it has
 * loaded, shows no check (W2L's own gate, the one that stopped it) on two
 * reads a poll apart, and is on the site that was asked for, so a page that
 * sends the browser elsewhere is not read as that site's.
 */

import { classifyGate } from '@w2l/http-core'
import { sessionCoversHost, type UserBrowserRead } from '@w2l/bench'
import { chromeEndpoint, chromeUserDataDir, ChromeLoginError, connectCdp, type CdpConnection } from './chromeLogin.js'

export interface UserChromeOptions {
  /** Chrome's user data directory; default the stable channel's for this OS. */
  userDataDir?: string
  /** How long to wait for the person to click Allow in Chrome. Default 120 s. */
  approveTimeoutMs?: number
  /** Opens the connection; a test passes its own. Default a WebSocket. */
  connect?: (endpoint: string, timeoutMs: number) => Promise<CdpConnection>
}

export interface UserChromeReadOptions {
  /** How long to wait for the person to get through, per page. Default 10 minutes. */
  waitMs?: number
  /** Between two reads of the page. Default 1 s. */
  pollMs?: number
  /** Told once, when the page shows a check the person has to pass. */
  onWaiting?: (url: string, check: string) => void
}

/** A page the person did not get through in time, left (closed its tab), or that ended off the site asked for: it is not read. */
export class HandoffNotThrough extends Error {
  constructor(message: string, readonly check: string | null) {
    super(message)
  }
}

export interface UserChrome {
  /** Open `url` in a new tab, wait for the person to get through, read the page, close the tab. */
  read(url: string, options?: UserChromeReadOptions): Promise<UserBrowserRead>
  close(): void
}

interface PageState {
  href: string
  ready: string
  status: number | null
  html: string
}

/** What the page shows now: its address, whether it has loaded, the document's HTTP status and its HTML. */
const STATE = `JSON.stringify({ href: location.href, ready: document.readyState, status: (performance.getEntriesByType('navigation')[0] || {}).responseStatus || null, html: document.documentElement ? document.documentElement.outerHTML : '' })`

/** Connect to the person's running Chrome, with their approval. */
export async function openUserChrome(options: UserChromeOptions = {}): Promise<UserChrome> {
  const endpoint = await chromeEndpoint(options.userDataDir ?? chromeUserDataDir())
  const connection = await (options.connect ?? connectCdp)(endpoint, options.approveTimeoutMs ?? 120_000)
  let browser = 'chrome'
  try {
    const version = await connection.send('Browser.getVersion') as { product?: string }
    if (typeof version.product === 'string' && version.product.length > 0) browser = version.product
  } catch {
    // The version is evidence, not a condition: unknown is recorded as `chrome`.
  }
  return {
    read: (url, readOptions = {}) => readPage(connection, browser, url, readOptions),
    close: () => connection.close(),
  }
}

async function readPage(connection: CdpConnection, browser: string, url: string, options: UserChromeReadOptions): Promise<UserBrowserRead> {
  const waitMs = options.waitMs ?? 600_000
  const pollMs = options.pollMs ?? 1_000
  const host = new URL(url).hostname
  const started = Date.now()
  const { targetId } = await connection.send('Target.createTarget', { url }) as { targetId: string }
  try {
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string }
    let sawGate: string | null = null
    let told = false
    let clear = 0
    let through = false
    let last: PageState | null = null
    while (Date.now() - started < waitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollMs))
      let state: PageState
      try {
        const answer = await connection.send('Runtime.evaluate', { expression: STATE, returnByValue: true }, sessionId) as { result?: { value?: string }; exceptionDetails?: unknown }
        if (typeof answer.result?.value !== 'string') continue
        state = JSON.parse(answer.result.value) as PageState
      } catch (error) {
        // A page between two documents has no context to evaluate in; one that is gone is the person's answer.
        if (error instanceof ChromeLoginError && /closed|No session|No target|not found/i.test(error.message)) throw new HandoffNotThrough(`the tab for ${url} was closed before W2L read it`, sawGate)
        continue
      }
      last = state
      const gate = classifyGate({ status: state.status ?? 200, header: () => null, body: state.html })
      const onSite = sameSite(state.href, host)
      if (gate !== null) {
        sawGate ??= gate.reason
        if (!told) { told = true; options.onWaiting?.(url, gate.reason) }
      }
      clear = gate === null && onSite && state.ready === 'complete' ? clear + 1 : 0
      if (clear >= 2) { through = true; break }
    }
    if (!through || last === null) {
      const where = last === null ? 'it never loaded' : !sameSite(last.href, host) ? `it was on ${safeHost(last.href)}, not ${host}` : sawGate === null ? 'it had not loaded' : `it still showed a check (${sawGate})`
      throw new HandoffNotThrough(`${url} was not through within ${Math.round(waitMs / 1000)} s: ${where}`, sawGate)
    }
    return {
      requestedUrl: url,
      finalUrl: last.href,
      status: last.status,
      html: last.html,
      fetchedAt: new Date().toISOString(),
      wallMs: Date.now() - started,
      sawGate,
      browser,
    }
  } finally {
    await connection.send('Target.closeTarget', { targetId }).catch(() => undefined)
  }
}

/** Whether a page's address is on the site asked for: the same host, a subdomain of it, or a parent domain of it. */
function sameSite(href: string, host: string): boolean {
  let page: string
  try {
    page = new URL(href).hostname
  } catch {
    return false
  }
  return sessionCoversHost(page, host) || sessionCoversHost(host, page)
}

function safeHost(href: string): string {
  try {
    return new URL(href).hostname
  } catch {
    return 'another page'
  }
}
