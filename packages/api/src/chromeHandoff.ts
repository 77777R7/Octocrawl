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
 * closes each when it has read it or given up on it.
 *
 * A page counts as through when, on CLEAR_READS reads a poll apart, it has
 * loaded; its document answered 2xx; W2L's gate, given the document's own
 * status and headers (what the stop was detected by, a vendor header
 * included), finds no check in it; it is on the site asked for (so a page
 * that sends the browser elsewhere is not read as that site's) and not on a
 * login path; and the person is not at a step of their own: no password or
 * one-time-code field showing on the page, no form field whose value they
 * are changing. Its address is Chrome's, not what the page's script says.
 */

import { classifyGate } from '@w2l/http-core'
import { isLoginPath, sessionCoversHost, type UserBrowserRead } from '@w2l/bench'
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
  /** Ends the wait: the caller went away. The page is not read and its tab is closed. */
  signal?: AbortSignal
}

/** Reads in a row a page must pass to count as through. */
const CLEAR_READS = 3

/** A page the person did not get through in time, left (closed its tab, quit Chrome), or that ended off the site asked for: it is not read. */
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
  /** A password or one-time-code field shows on the page: a sign-in step. */
  secret: boolean
  /** The form field the person is in and what it holds, or null: a value that changed between two reads is the person typing. */
  field: string | null
}

/** What the page shows now. */
const STATE = `JSON.stringify({
  href: location.href,
  ready: document.readyState,
  status: (performance.getEntriesByType('navigation')[0] || {}).responseStatus || null,
  html: document.documentElement ? document.documentElement.outerHTML : '',
  secret: Array.from(document.querySelectorAll('input[type=password], input[autocomplete="one-time-code"]')).some((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'),
  field: (() => { const el = document.activeElement; if (!el) return null; if (el.isContentEditable) return 'edit:' + String(el.textContent).slice(0, 500); return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ? el.tagName + ':' + String(el.value).slice(0, 500) : null })(),
})`

/** The main document's last response, as the browser received it. */
interface DocumentResponse {
  url: string
  status: number
  headers: Record<string, string>
}

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
  let sawGate: string | null = null
  // A tab or a Chrome that is gone; a page between two documents ("navigated or closed") is not gone, only moving.
  const gone = (error: unknown): HandoffNotThrough | null =>
    error instanceof ChromeLoginError && !/navigated or closed/i.test(error.message) && /No session with given id|No target with given id|closed the connection|Target closed|target not found/i.test(error.message)
      ? new HandoffNotThrough(`the tab for ${url} was closed, or Chrome quit, before W2L read it`, sawGate)
      : null
  // Any other refusal from Chrome ends this page alone, not the handoff of the others.
  const ended = (error: unknown): unknown => gone(error) ?? (error instanceof ChromeLoginError ? new HandoffNotThrough(`${url} was not read: ${error.message}`, sawGate) : error)
  let targetId: string
  try {
    // A blank tab first, so the page's own responses are heard from its first one.
    targetId = (await connection.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }).targetId
  } catch (error) {
    throw ended(error)
  }
  const stops: Array<() => void> = []
  try {
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string }
    // Set by the event listener: the main document's last response.
    const heard: { document: DocumentResponse | null } = { document: null }
    if (connection.on !== undefined) {
      stops.push(connection.on('Network.responseReceived', sessionId, (params) => {
        const response = params.response as { url?: string; status?: number; headers?: Record<string, string> } | undefined
        if (params.type !== 'Document' || params.frameId !== targetId || response === undefined) return
        heard.document = { url: String(response.url ?? ''), status: Number(response.status ?? 0), headers: Object.fromEntries(Object.entries(response.headers ?? {}).map(([name, value]) => [name.toLowerCase(), String(value)])) }
      }))
      await connection.send('Network.enable', {}, sessionId)
    }
    // Chrome answers Page.navigate when the page's response begins: a slow page is waited for in the reads, not here.
    let navigation: unknown = null
    void connection.send('Page.navigate', { url }, sessionId).catch((error: unknown) => { navigation = error })
    let told = false
    let field: string | null | undefined
    let clear = 0
    let last: { state: PageState; response: DocumentResponse | null } | null = null
    while (Date.now() - started < waitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollMs))
      if (options.signal?.aborted === true) throw new HandoffNotThrough(`the handoff of ${url} was cancelled before W2L read it`, sawGate)
      if (navigation !== null && gone(navigation) !== null) throw gone(navigation)
      let state: PageState
      try {
        const answer = await connection.send('Runtime.evaluate', { expression: STATE, returnByValue: true }, sessionId) as { result?: { value?: string } }
        if (typeof answer.result?.value !== 'string') { clear = 0; continue }
        state = JSON.parse(answer.result.value) as PageState
        // The address as Chrome has it, which the page's own script cannot change.
        const info = await connection.send('Target.getTargetInfo', { targetId }) as { targetInfo?: { url?: string } }
        if (typeof info.targetInfo?.url === 'string') state.href = info.targetInfo.url
      } catch (error) {
        // A page between two documents has no context to evaluate in; one that is gone is the person's answer.
        const left = gone(error)
        if (left !== null) throw left
        clear = 0
        continue
      }
      // The document's own response, when it is the one shown (the address may differ by its fragment alone).
      const response: DocumentResponse | null = heard.document !== null && sameDocument(heard.document.url, state.href) ? heard.document : null
      const status = response?.status ?? state.status
      last = { state, response }
      const gate = classifyGate({ status: status ?? 200, header: (name) => response?.headers[name.toLowerCase()] ?? null, body: state.html })
      if (gate !== null) {
        sawGate ??= gate.reason
        if (!told) { told = true; options.onWaiting?.(url, gate.reason) }
      }
      const typing = state.field !== null && field !== undefined && state.field !== field
      field = state.field
      const through = state.ready === 'complete' && gate === null && (status === null || (status >= 200 && status < 300))
        && sameSite(state.href, host) && !onLoginPath(state.href, url) && !state.secret && !typing
      clear = through ? clear + 1 : 0
      if (clear >= CLEAR_READS) {
        return {
          requestedUrl: url,
          finalUrl: state.href,
          status,
          contentType: response?.headers['content-type'] ?? null,
          html: state.html,
          fetchedAt: new Date().toISOString(),
          wallMs: Date.now() - started,
          sawGate,
          browser,
        }
      }
    }
    const where = last === null ? 'it never loaded'
      : !sameSite(last.state.href, host) ? `it was on ${safeHost(last.state.href)}, not ${host}`
        : sawGate !== null && classifyGate({ status: last.response?.status ?? last.state.status ?? 200, header: (name) => last!.response?.headers[name.toLowerCase()] ?? null, body: last.state.html }) !== null ? `it still showed a check (${sawGate})`
          : 'it was not yet the page: still loading, at a sign-in step, or not answering 2xx'
    throw new HandoffNotThrough(`${url} was not through within ${Math.round(waitMs / 1000)} s: ${where}`, sawGate)
  } catch (error) {
    throw ended(error)
  } finally {
    for (const stop of stops) stop()
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

/** Whether the page is on a login path the URL asked for was not: the site's sign-in, not the page. */
function onLoginPath(href: string, asked: string): boolean {
  try {
    return isLoginPath(new URL(href).pathname) && !isLoginPath(new URL(asked).pathname)
  } catch {
    return false
  }
}

/** Two addresses of one document: the same but for the fragment. */
function sameDocument(a: string, b: string): boolean {
  return a.split('#')[0] === b.split('#')[0]
}

function safeHost(href: string): string {
  try {
    return new URL(href).hostname
  } catch {
    return 'another page'
  }
}
