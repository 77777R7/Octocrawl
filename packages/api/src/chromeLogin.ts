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
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  close(): void
}

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

const ENABLE_HINT = 'open chrome://inspect/#remote-debugging in Chrome (144 or later), turn on "Allow remote debugging for this browser instance", then run this again'

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

/** The cookies a session for `domain` needs: the ones its pages are sent (a parent domain's too) and its subdomains'. */
export function cookiesForDomain(cookies: readonly CdpCookie[], domain: string): StoredCookie[] {
  return cookies
    // A cookie on a bare top-level domain (`.com`) is no site's; Chrome refuses one anyway.
    .filter((c) => c.domain.replace(/^\./, '').includes('.'))
    .filter((c) => sessionCoversHost(c.domain, domain) || sessionCoversHost(domain, c.domain))
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
  if (cookies.length === 0) throw new ChromeLoginError(`Chrome has no cookies for ${domain}: sign in to ${domain} in Chrome, then run this again`)
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
export function connectCdp(endpoint: string, timeoutMs: number): Promise<CdpConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint)
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
    let nextId = 1
    let opened = false
    const timer = setTimeout(() => {
      socket.close()
      reject(new ChromeLoginError(`no answer from Chrome within ${Math.round(timeoutMs / 1000)} s: Chrome asks "Allow remote debugging?"; click Allow, or ${ENABLE_HINT}`))
    }, timeoutMs)
    socket.addEventListener('open', () => {
      opened = true
      clearTimeout(timer)
      resolve({
        send(method, params = {}) {
          const id = nextId++
          return new Promise((done, fail) => {
            pending.set(id, { resolve: done, reject: fail })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
        close() {
          socket.close()
        },
      })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string } }
      const waiter = message.id === undefined ? undefined : pending.get(message.id)
      if (waiter === undefined) return
      pending.delete(message.id!)
      if (message.error !== undefined) waiter.reject(new ChromeLoginError(`Chrome refused the request: ${message.error.message ?? 'unknown error'}`))
      else waiter.resolve(message.result)
    })
    socket.addEventListener('close', () => {
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
