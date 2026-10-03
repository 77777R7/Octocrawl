/**
 * `w2l login import`: the user's own login, taken from the Chrome they
 * already use, so mode `authed` can read a page as them without a second
 * browser or a second sign-in.
 *
 * Chrome (144 and later) lets a local tool attach to the running browser
 * once the user turns on "Allow remote debugging for this browser instance"
 * at chrome://inspect/#remote-debugging, and asks again ("Allow remote
 * debugging?") for every connection. W2L connects once, reads the cookies
 * of the one domain asked for, saves them to the user's sessions file and
 * disconnects; later fetches use the saved cookies in W2L's own browser and
 * never touch the user's tabs. Nothing is read from Chrome's files on disk.
 */

import { readFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { FileSessionStore, sessionCoversHost, sessionFingerprint, type SessionSnapshot, type StoredCookie } from '@w2l/bench'

/** A refusal or failure the person can act on; the message says how. */
export class ChromeLoginError extends Error {}

/** One Chrome DevTools Protocol connection: a command and its answer. */
export interface CdpConnection {
  /** A command to the browser, or with `sessionId` to the page a `Target.attachToTarget` session reaches. */
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown>
  /** Listen to an event (of the browser, or of one page's session); the answer stops listening. A connection without events has none. */
  on?(method: string, sessionId: string | undefined, listener: (params: Record<string, unknown>) => void): () => void
  close(): void
}

/** How long one command waits for Chrome's answer: a Chrome that stopped answering ends the wait, not the handoff's whole budget. */
export const CDP_COMMAND_TIMEOUT_MS = 30_000

/** The Chrome cookie as `Storage.getCookies` gives it. */
interface CdpCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  session?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface ImportChromeLoginOptions {
  /** A domain (`example.com`) or a page URL on it. */
  site: string
  sessionsFile: string
  /** Chrome's user data directory; default the stable channel's for this OS. */
  userDataDir?: string
  /** How long to wait for the person to click Allow in Chrome. Default 120 s. */
  timeoutMs?: number
  /** Opens the connection; a test passes its own. Default a WebSocket. */
  connect?: (endpoint: string, timeoutMs: number) => Promise<CdpConnection>
  now?: () => Date
}

export interface ImportedLogin {
  domain: string
  cookieCount: number
  /** SHA-256 of the saved session, the only trace of it a record carries. */
  sessionSha256: string
  sessionsFile: string
}

export const ENABLE_HINT = 'open chrome://inspect/#remote-debugging in Chrome (144 or later), turn on "Allow remote debugging for this browser instance", then run this again'

/** The stable Chrome's user data directory on this OS. */
export function chromeUserDataDir(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Google', 'Chrome')
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data')
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'google-chrome')
}

/** The browser endpoint Chrome writes to `DevToolsActivePort` while remote debugging is on: a port, then the browser's path. */
export async function chromeEndpoint(userDataDir: string): Promise<string> {
  let text: string
  try {
    text = await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8')
  } catch {
    throw new ChromeLoginError(`Chrome is not accepting a connection (no DevToolsActivePort in ${userDataDir}): ${ENABLE_HINT}`)
  }
  const [port, path] = text.split(/\r?\n/)
  if (port === undefined || !/^\d{1,5}$/.test(port.trim()) || path === undefined || !path.trim().startsWith('/devtools/browser')) {
    throw new ChromeLoginError(`Chrome's DevToolsActivePort in ${userDataDir} is not a port and a browser path: ${ENABLE_HINT}`)
  }
  return `ws://127.0.0.1:${port.trim()}${path.trim()}`
}

/** `example.com`, or the host of a URL; lower case, no leading dot. */
export function loginDomain(site: string): string {
  const text = site.trim()
  let host: string
  try {
    host = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? new URL(text).hostname : new URL(`https://${text}`).hostname
  } catch {
    throw new ChromeLoginError(`${site} is not a domain or a URL`)
  }
  host = host.toLowerCase().replace(/^\./, '')
  if (!host.includes('.') || host.endsWith('.')) throw new ChromeLoginError(`${site} is not a domain: give one like example.com`)
  return host
}

/**
 * The cookies a session for `domain` needs: the ones its pages are sent (its
 * own and a parent domain's) and, when the site sets cookies on `domain`
 * itself, its subdomains'. A name nothing sets a cookie on is not a site:
 * a public suffix (`co.uk`, `github.io`) has only other sites' cookies under
 * it, and Chrome sets none on it.
 */
export function cookiesForDomain(cookies: readonly CdpCookie[], domain: string): StoredCookie[] {
  const bare = (c: CdpCookie): string => c.domain.toLowerCase().replace(/^\./, '')
  // A cookie on a bare top-level domain (`.com`) is no site's; Chrome refuses one anyway.
  const candidates = cookies.filter((c) => bare(c).includes('.'))
  const isSite = candidates.some((c) => bare(c) === domain)
  return candidates
    .filter((c) => sessionCoversHost(c.domain, domain) || (isSite && sessionCoversHost(domain, c.domain)))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      ...(c.session === true || c.expires < 0 ? {} : { expires: c.expires }),
      httpOnly: c.httpOnly,
      secure: c.secure,
      ...(c.sameSite === undefined ? {} : { sameSite: c.sameSite }),
    }))
}

/** The hosts under `domain` Chrome holds cookies for, when none is set on `domain` itself. */
function hostsBelow(cookies: readonly CdpCookie[], domain: string): string[] {
  return [...new Set(cookies.map((c) => c.domain.toLowerCase().replace(/^\./, '')).filter((d) => d !== domain && sessionCoversHost(domain, d)))].sort()
}

/** Read the user's cookies for one site from their running Chrome and save them as that site's login. */
export async function importChromeLogin(options: ImportChromeLoginOptions): Promise<ImportedLogin> {
  const domain = loginDomain(options.site)
  const timeoutMs = options.timeoutMs ?? 120_000
  const endpoint = await chromeEndpoint(options.userDataDir ?? chromeUserDataDir())
  const connection = await (options.connect ?? connectCdp)(endpoint, timeoutMs)
  let all: CdpCookie[]
  try {
    const answer = await connection.send('Storage.getCookies') as { cookies?: CdpCookie[] }
    all = answer.cookies ?? []
  } finally {
    connection.close()
  }
  const cookies = cookiesForDomain(all, domain)
  if (cookies.length === 0) {
    const below = hostsBelow(all, domain)
    if (below.length > 0) throw new ChromeLoginError(`Chrome sets no cookie on ${domain} itself, only on hosts under it (${below.slice(0, 3).join(', ')}${below.length > 3 ? ', ...' : ''}): import the host you sign in on, e.g. w2l login import ${below[0]}`)
    throw new ChromeLoginError(`Chrome has no cookies for ${domain}: sign in to ${domain} in Chrome's default profile, in a normal (not Incognito) window, then run this again. Remote debugging reaches the default profile only`)
  }
  const snapshot: SessionSnapshot = {
    domain,
    attestedBy: localUser(),
    attestedAt: (options.now ?? (() => new Date()))().toISOString(),
    vendor: 'browser_local_authed',
    cookies,
    statement: `cookies for ${domain} taken from the user's own Chrome, with their approval in Chrome's remote debugging dialog`,
  }
  await new FileSessionStore(options.sessionsFile).save(snapshot)
  return { domain, cookieCount: cookies.length, sessionSha256: sessionFingerprint(snapshot), sessionsFile: options.sessionsFile }
}

function localUser(): string {
  try {
    return userInfo().username
  } catch {
    return 'local user'
  }
}

/** A WebSocket to Chrome's browser endpoint. Chrome holds the handshake until the person answers its dialog. */
export function connectCdp(endpoint: string, timeoutMs: number, signal?: AbortSignal): Promise<CdpConnection> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) { reject(new ChromeLoginError('the connection to Chrome was cancelled')); return }
    const socket = new WebSocket(endpoint)
    // Cancelled while Chrome waits for Allow: the connection is dropped, and an Allow clicked later attaches to nothing.
    const cancel = () => { reject(new ChromeLoginError('the connection to Chrome was cancelled')); socket.close() }
    signal?.addEventListener('abort', cancel, { once: true })
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
    const listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>()
    let nextId = 1
    let opened = false
    let closed = false
    const timer = setTimeout(() => {
      socket.close()
      reject(new ChromeLoginError(`no answer from Chrome within ${Math.round(timeoutMs / 1000)} s: Chrome asks "Allow remote debugging?"; click Allow, or ${ENABLE_HINT}`))
    }, timeoutMs)
    socket.addEventListener('open', () => {
      opened = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      if (signal?.aborted === true) { socket.close(); return }
      resolve({
        send(method, params = {}, sessionId) {
          // A closed socket sends nothing and answers nothing: the command fails now, not never.
          if (closed) return Promise.reject(new ChromeLoginError('Chrome closed the connection'))
          const id = nextId++
          return new Promise((done, fail) => {
            const timeout = setTimeout(() => {
              pending.delete(id)
              fail(new ChromeLoginError(`Chrome did not answer ${method} within ${CDP_COMMAND_TIMEOUT_MS / 1000} s`))
            }, CDP_COMMAND_TIMEOUT_MS)
            pending.set(id, { resolve: (value) => { clearTimeout(timeout); done(value) }, reject: (error) => { clearTimeout(timeout); fail(error) } })
            socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }))
          })
        },
        on(method, sessionId, listener) {
          const key = `${sessionId ?? ''}|${method}`
          const set = listeners.get(key) ?? new Set()
          set.add(listener)
          listeners.set(key, set)
          return () => { set.delete(listener) }
        },
        close() {
          socket.close()
        },
      })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: Record<string, unknown>; sessionId?: string; result?: unknown; error?: { message?: string } }
      if (message.id === undefined && message.method !== undefined) {
        for (const listener of listeners.get(`${message.sessionId ?? ''}|${message.method}`) ?? []) listener(message.params ?? {})
        return
      }
      const waiter = message.id === undefined ? undefined : pending.get(message.id)
      if (waiter === undefined) return
      pending.delete(message.id!)
      if (message.error !== undefined) waiter.reject(new ChromeLoginError(`Chrome refused the request: ${message.error.message ?? 'unknown error'}`))
      else waiter.resolve(message.result)
    })
    socket.addEventListener('close', () => {
      closed = true
      clearTimeout(timer)
      for (const waiter of pending.values()) waiter.reject(new ChromeLoginError('Chrome closed the connection'))
      pending.clear()
      if (!opened) reject(new ChromeLoginError(`Chrome did not accept the connection (Allow not clicked, or remote debugging is off): ${ENABLE_HINT}`))
    })
  })
}

/** The saved logins, by domain, without their cookies: what `w2l login list` shows. */
export async function listSavedLogins(sessionsFile: string): Promise<{ domain: string; savedAt: string; cookieCount: number; sessionSha256: string }[]> {
  return (await new FileSessionStore(sessionsFile).list())
    .filter((s) => s.vendor === 'browser_local_authed')
    .map((s) => ({ domain: s.domain, savedAt: s.attestedAt, cookieCount: s.cookies?.length ?? 0, sessionSha256: sessionFingerprint(s) }))
}

/** Forget a saved login. False when none was saved for `site`. */
export async function removeSavedLogin(sessionsFile: string, site: string): Promise<boolean> {
  return new FileSessionStore(sessionsFile).remove(loginDomain(site))
}
