/**
 * `w2l login import`: the user's own login, taken from the Chrome they
 * already use, so mode `authed` can read a page as them without a second
 * browser or a second sign-in.
 *
 * Chrome (144 and later) lets a local tool attach to the running browser
 * once the user turns on "Allow remote debugging for this browser instance"
 * at chrome://inspect/#remote-debugging, and asks again ("Allow remote
 * debugging?") for every connection. W2L connects once, reads the cookies
 * of the one domain asked for and the localStorage of that site's tabs the
 * user has open, saves them to the user's sessions file and disconnects;
 * later fetches use the saved login in W2L's own browser and never touch
 * the user's tabs. Nothing is read from Chrome's files on disk.
 */

import { readFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import type { LoginStorage } from '@w2l/contracts'
import { FileSessionStore, sessionCoversHost, type SessionSnapshot, type StoredCookie } from '@w2l/bench'
import { sessionSha256 } from '@w2l/http-core'

/** A refusal or failure the person can act on; the message says how. */
export class ChromeLoginError extends Error {}

/** One Chrome DevTools Protocol connection: a command and its answer. */
export interface CdpConnection {
  /** A command to the browser, or with `sessionId` to the page a `Target.attachToTarget` session reaches; answered within `timeoutMs` (default CDP_COMMAND_TIMEOUT_MS). */
  send(method: string, params?: Record<string, unknown>, sessionId?: string, timeoutMs?: number): Promise<unknown>
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
  /** The localStorage saved with the login; null when none was (no tab of the site open, or its storage empty). */
  localStorage: LoginStorage | null
  /** Whether the site's open tabs were found and read: false when none was open in Chrome (or Chrome would not list them), so no localStorage could be; see localStorageUnread for tabs found that did not answer. */
  localStorageRead: boolean
  /** The origins of the site's open tabs whose localStorage Chrome did not give (a tab that crashed or was discarded): saved without it. */
  localStorageUnread: string[]
  /** Why each of localStorageUnread was not read, a tab at a time: the request to Chrome that failed and Chrome's answer, or the wait that ran out. */
  localStorageUnreadReasons: UnreadStorage[]
  /** SHA-256 of the saved session, the only trace of it a record carries. */
  sessionSha256: string
  sessionsFile: string
}

/** A tab of the site whose localStorage Chrome did not give: its origin, the request that failed, and why. */
export interface UnreadStorage {
  origin: string
  step: 'Target.attachToTarget' | 'Page.getFrameTree' | 'DOMStorage.getDOMStorageItems'
  error: string
}

/** One origin's localStorage, as Playwright's storageState keeps it. */
interface OriginStorage {
  origin: string
  localStorage: { name: string; value: string }[]
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

/** Whether a page's address or origin is on the site `domain` names: an http(s) origin of the domain or a subdomain of it. */
function onSite(address: string, domain: string): boolean {
  try {
    const url = new URL(address)
    return (url.protocol === 'https:' || url.protocol === 'http:') && sessionCoversHost(domain, url.hostname)
  } catch {
    return false
  }
}

/** How long one read of a tab's storage waits for Chrome: a tab whose page crashed or was discarded answers nothing. */
const TAB_READ_TIMEOUT_MS = 5_000

/**
 * The localStorage of the site's tabs open in the person's Chrome, in the
 * profile its cookies come from (the default one; never an Incognito window
 * or another profile's): each tab on the site, by its top frame's origin,
 * read through DOMStorage, which loads nothing and runs no script in the
 * page. A frame of another origin inside a tab is not read. Null when no tab
 * of the site is open: Chrome reads an origin's storage only through a frame
 * that shows it, so none could be. `unread`: the tabs Chrome did not give
 * the storage of (a tab that crashed, was discarded or closed meanwhile), by
 * origin, which the import saves without, each with the request that failed.
 */
async function siteStorage(connection: CdpConnection, domain: string): Promise<{ origins: OriginStorage[]; unread: UnreadStorage[] } | null> {
  let defaultBrowserContextId: string | undefined
  let targetInfos: { targetId: string; type: string; url: string; browserContextId?: string }[] | undefined
  try {
    ;({ defaultBrowserContextId } = await connection.send('Target.getBrowserContexts', {}, undefined, TAB_READ_TIMEOUT_MS) as { defaultBrowserContextId?: string })
    // A Chrome that does not name its default profile's context: no tab can be told to be in it, and none is read.
    if (defaultBrowserContextId === undefined) return null
    ;({ targetInfos } = await connection.send('Target.getTargets', {}, undefined, TAB_READ_TIMEOUT_MS) as { targetInfos?: typeof targetInfos })
  } catch {
    // A Chrome that will not list its contexts or tabs leaves the cookies to be saved, and no localStorage read.
    return null
  }
  const tabs = (targetInfos ?? []).filter((target) => target.type === 'page' && target.browserContextId === defaultBrowserContextId && onSite(target.url, domain))
  if (tabs.length === 0) return null
  // Read all at once: a tab that does not answer costs one wait of TAB_READ_TIMEOUT_MS, not one per tab.
  const reads = await Promise.all(tabs.map(async (tab): Promise<OriginStorage | { unread: UnreadStorage } | null> => {
    let sessionId: string | undefined
    let step: UnreadStorage['step'] = 'Target.attachToTarget'
    try {
      ;({ sessionId } = await connection.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true }, undefined, TAB_READ_TIMEOUT_MS) as { sessionId: string })
      step = 'Page.getFrameTree'
      const { frameTree } = await connection.send('Page.getFrameTree', {}, sessionId, TAB_READ_TIMEOUT_MS) as { frameTree: { frame: { securityOrigin: string } } }
      const origin = frameTree.frame.securityOrigin
      if (!onSite(origin, domain)) return null
      step = 'DOMStorage.getDOMStorageItems'
      const { entries } = await connection.send('DOMStorage.getDOMStorageItems', { storageId: { securityOrigin: origin, isLocalStorage: true } }, sessionId, TAB_READ_TIMEOUT_MS) as { entries: [string, string][] }
      return { origin, localStorage: entries.map(([name, value]) => ({ name, value })) }
    } catch (error) {
      // One tab that does not answer leaves the others, and the cookies, to be saved: its origin is said to be unread, and why.
      return { unread: { origin: new URL(tab.url).origin, step, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) } }
    } finally {
      if (sessionId !== undefined) await connection.send('Target.detachFromTarget', { sessionId }, undefined, TAB_READ_TIMEOUT_MS).catch(() => undefined)
    }
  }))
  // Two tabs of one origin share its storage: the first read of it, in the tabs' order, stands.
  const byOrigin = new Map<string, OriginStorage>()
  const failed: UnreadStorage[] = []
  for (const read of reads) {
    if (read === null) continue
    if ('unread' in read) failed.push(read.unread)
    else if (!byOrigin.has(read.origin)) byOrigin.set(read.origin, read)
  }
  return { origins: [...byOrigin.values()], unread: failed.filter((read) => !byOrigin.has(read.origin)).sort((a, b) => (a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0)) }
}

/** What a saved login's storageState holds: its origins with localStorage, and how many items; null for none. */
export function loginStorage(storageState: string | undefined): LoginStorage | null {
  if (storageState === undefined) return null
  const origins = ((JSON.parse(storageState) as { origins?: OriginStorage[] }).origins ?? []).filter((origin) => origin.localStorage.length > 0)
  return origins.length === 0 ? null : { origins: origins.map((origin) => origin.origin), itemCount: origins.reduce((sum, origin) => sum + origin.localStorage.length, 0) }
}

/**
 * Read the user's login to one site from their running Chrome, its cookies
 * and the localStorage of the site's tabs they have open, and save it as
 * that site's login, replacing any saved before.
 */
export async function importChromeLogin(options: ImportChromeLoginOptions): Promise<ImportedLogin> {
  const domain = loginDomain(options.site)
  const timeoutMs = options.timeoutMs ?? 120_000
  const endpoint = await chromeEndpoint(options.userDataDir ?? chromeUserDataDir())
  const connection = await (options.connect ?? connectCdp)(endpoint, timeoutMs)
  let all: CdpCookie[]
  let storage: { origins: OriginStorage[]; unread: UnreadStorage[] } | null
  try {
    const answer = await connection.send('Storage.getCookies') as { cookies?: CdpCookie[] }
    all = answer.cookies ?? []
    storage = await siteStorage(connection, domain)
  } finally {
    connection.close()
  }
  const cookies = cookiesForDomain(all, domain)
  const kept = (storage?.origins ?? []).filter((origin) => origin.localStorage.length > 0)
  if (cookies.length === 0 && kept.length === 0) {
    const below = hostsBelow(all, domain)
    if (below.length > 0) throw new ChromeLoginError(`Chrome sets no cookie on ${domain} itself, only on hosts under it (${below.slice(0, 3).join(', ')}${below.length > 3 ? ', ...' : ''}): import the host you sign in on, e.g. w2l login import ${below[0]}`)
    const tabs = storage === null ? `, and no tab of ${domain} is open to read its localStorage from`
      : storage.unread.length > 0 ? `, and Chrome did not give the localStorage of its open tabs (${storage.unread.map((read) => `${read.origin}: ${read.error}`).join(', ')}; reload them)`
        : `, and its open tabs hold no localStorage`
    throw new ChromeLoginError(`Chrome has no cookies for ${domain}${tabs}: sign in to ${domain} in Chrome's default profile, in a normal (not Incognito) window, leave a tab of it open, then run this again. Remote debugging reaches the default profile only`)
  }
  const storageState = kept.length === 0 ? undefined : JSON.stringify({ cookies: [], origins: kept })
  const snapshot: SessionSnapshot = {
    domain,
    attestedBy: localUser(),
    attestedAt: (options.now ?? (() => new Date()))().toISOString(),
    vendor: 'browser_local_authed',
    cookies,
    ...(storageState === undefined ? {} : { storageState }),
    statement: `${storageState === undefined ? 'cookies' : 'cookies and localStorage'} for ${domain} taken from the user's own Chrome, with their approval in Chrome's remote debugging dialog`,
  }
  await new FileSessionStore(options.sessionsFile).save(snapshot)
  return { domain, cookieCount: cookies.length, localStorage: loginStorage(storageState), localStorageRead: storage !== null, localStorageUnread: [...new Set((storage?.unread ?? []).map((read) => read.origin))], localStorageUnreadReasons: storage?.unread ?? [], sessionSha256: recordedSha256(snapshot), sessionsFile: options.sessionsFile }
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
    const pending = new Map<number, { sessionId: string | undefined; resolve: (value: unknown) => void; reject: (error: Error) => void }>()
    // Sessions Chrome detached (their tab closed): it answers none of their commands again, so none is waited for.
    const detached = new Set<string>()
    const tabClosed = () => new ChromeLoginError('Target closed: Chrome detached the tab\'s session (the tab was closed)')
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
        send(method, params = {}, sessionId, within = CDP_COMMAND_TIMEOUT_MS) {
          // A closed socket sends nothing and answers nothing: the command fails now, not never.
          if (closed) return Promise.reject(new ChromeLoginError('Chrome closed the connection'))
          if (sessionId !== undefined && detached.has(sessionId)) return Promise.reject(tabClosed())
          const id = nextId++
          return new Promise((done, fail) => {
            const timeout = setTimeout(() => {
              pending.delete(id)
              fail(new ChromeLoginError(`Chrome did not answer ${method} within ${Math.round(within / 1000)} s`))
            }, within)
            pending.set(id, { sessionId, resolve: (value) => { clearTimeout(timeout); done(value) }, reject: (error) => { clearTimeout(timeout); fail(error) } })
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
        // A tab closed (or W2L let it go): its session's commands in flight fail now, not after their timeout.
        const gone = message.method === 'Target.detachedFromTarget' && message.sessionId === undefined ? message.params?.sessionId : undefined
        if (typeof gone === 'string') {
          detached.add(gone)
          for (const [id, waiter] of pending) if (waiter.sessionId === gone) { pending.delete(id); waiter.reject(tabClosed()) }
        }
        for (const listener of listeners.get(`${message.sessionId ?? ''}|${message.method}`) ?? []) listener(message.params ?? {})
        return
      }
      const waiter = message.id === undefined ? undefined : pending.get(message.id)
      if (waiter === undefined) return
      pending.delete(message.id!)
      if (message.error !== undefined) waiter.reject(new ChromeLoginError(`Chrome refused the request: ${message.error.message ?? 'unknown error'}`))
      else waiter.resolve(message.result)
    })
    // A socket that errs is as gone as one that closes: a close event may come late, or not at all, after Chrome quits.
    const lost = () => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      for (const waiter of pending.values()) waiter.reject(new ChromeLoginError('Chrome closed the connection'))
      pending.clear()
      if (!opened) reject(new ChromeLoginError(`Chrome did not accept the connection (Allow not clicked, or remote debugging is off): ${ENABLE_HINT}`))
    }
    socket.addEventListener('close', lost)
    socket.addEventListener('error', lost)
  })
}

/** A saved login's SHA-256 as the records of its reads carry it: of the cookies and storageState the authed rung hands the browser. */
function recordedSha256(snapshot: SessionSnapshot): string {
  return sessionSha256({ ...(snapshot.cookies === undefined ? {} : { cookies: snapshot.cookies }), ...(snapshot.storageState === undefined ? {} : { storageState: snapshot.storageState }) })
}

/** The saved logins, by domain, without their cookies or storage values: what `w2l login list` shows. */
export async function listSavedLogins(sessionsFile: string): Promise<{ domain: string; savedAt: string; cookieCount: number; localStorage: LoginStorage | null; sessionSha256: string }[]> {
  return (await new FileSessionStore(sessionsFile).list())
    .filter((s) => s.vendor === 'browser_local_authed')
    .map((s) => ({ domain: s.domain, savedAt: s.attestedAt, cookieCount: s.cookies?.length ?? 0, localStorage: loginStorage(s.storageState), sessionSha256: recordedSha256(s) }))
}

/** Forget a saved login. False when none was saved for `site`. */
export async function removeSavedLogin(sessionsFile: string, site: string): Promise<boolean> {
  return new FileSessionStore(sessionsFile).remove(loginDomain(site))
}
