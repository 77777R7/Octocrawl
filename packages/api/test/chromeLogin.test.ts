import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSessionStore } from '@w2l/bench'
import { normalizeAccessConfig } from '@w2l/http-core'
import { ChromeLoginError, chromeEndpoint, chromeUserDataDir, cookiesForDomain, importChromeLogin, listSavedLogins, loginDomain, removeSavedLogin, type CdpConnection } from '../src/chromeLogin.js'

const COOKIES = [
  { name: '__Host-sid', value: 'cookie-value-1', domain: 'www.example.com', path: '/', expires: -1, httpOnly: true, secure: true, session: true, sameSite: 'Lax' as const },
  { name: 'pref', value: 'cookie-value-2', domain: '.example.com', path: '/', expires: 1893456000, httpOnly: false, secure: false },
  { name: 'api', value: 'cookie-value-3', domain: 'api.www.example.com', path: '/', expires: 1893456000, httpOnly: false, secure: true },
  { name: 'other', value: 'cookie-value-4', domain: '.notexample.com', path: '/', expires: -1, httpOnly: false, secure: false },
  { name: 'tracker', value: 'cookie-value-5', domain: '.com', path: '/', expires: -1, httpOnly: false, secure: false },
]

/**
 * A tab open in the person's Chrome: its address, the localStorage of its top frame's origin, the browser context it is
 * in (`incognito`: not the default profile's) and whether its page answers (`crashed`: it fails at once; `hangs`: it says
 * nothing until the command's timeout; `gone`: Chrome refuses to attach to it, as to a tab closed meanwhile).
 */
type Tab = { url: string; storage?: [string, string][]; context?: string; crashed?: boolean; hangs?: boolean; gone?: boolean }

/** A Chrome holding `cookies`, with `tabs` open; a page's storage is read through a session attached to its tab. */
function fakeChrome(cookies = COOKIES, tabs: Tab[] = [], defaultContext: string | null | 'refused' = 'default') {
  const calls: { endpoint: string; methods: string[]; closed: boolean } = { endpoint: '', methods: [], closed: false }
  const connect = async (endpoint: string): Promise<CdpConnection> => {
    calls.endpoint = endpoint
    return {
      async send(method, params = {}, sessionId, timeoutMs) {
        calls.methods.push(sessionId === undefined ? method : `${method}@${sessionId}`)
        const tab = sessionId === undefined ? undefined : tabs[Number(sessionId.slice(1))]
        if (method === 'Storage.getCookies') return { cookies }
        if (method === 'Target.getBrowserContexts' && defaultContext === 'refused') throw new ChromeLoginError('Chrome refused the request: Not allowed')
        if (method === 'Target.getBrowserContexts') return { browserContextIds: ['incognito'], ...(defaultContext === null ? {} : { defaultBrowserContextId: defaultContext }) }
        if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 'sw', type: 'service_worker', url: 'https://www.example.com/sw.js', browserContextId: 'default' }, ...tabs.map((t, i) => ({ targetId: `t${i}`, type: 'page', url: t.url, browserContextId: t.context ?? 'default' }))] }
        if (method === 'Target.attachToTarget' && tabs[Number(String(params.targetId).slice(1))]?.gone === true) throw new ChromeLoginError('Chrome refused the request: No target with given id found')
        if (method === 'Target.attachToTarget') return { sessionId: `s${String(params.targetId).slice(1)}` }
        // A page that does not answer: Chrome's silence until the command's own timeout.
        if (tab?.hangs === true && method !== 'Target.detachFromTarget') return new Promise((_, reject) => setTimeout(() => reject(new ChromeLoginError(`Chrome did not answer ${method} within ${timeoutMs} ms`)), timeoutMs))
        if (tab?.crashed === true) throw new ChromeLoginError(`Chrome did not answer ${method} within 5 s`)
        if (method === 'Page.getFrameTree') return { frameTree: { frame: { securityOrigin: new URL(tab!.url).origin } } }
        if (method === 'DOMStorage.getDOMStorageItems') return { entries: tab!.storage ?? [] }
        return {}
      },
      close() { calls.closed = true },
    }
  }
  return { calls, connect }
}

describe('octocrawl login import from the user\'s Chrome', () => {
  let root: string
  let userDataDir: string
  let sessionsFile: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-chrome-'))
    userDataDir = join(root, 'Chrome')
    sessionsFile = join(root, 'home', '.w2l', 'sessions.json')
    await import('node:fs/promises').then((fs) => fs.mkdir(userDataDir, { recursive: true }))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads the endpoint Chrome writes while remote debugging is on', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/0b3d-guid\n')
    expect(await chromeEndpoint(userDataDir)).toBe('ws://127.0.0.1:9222/devtools/browser/0b3d-guid')
  })

  it('without the endpoint file, says how to turn remote debugging on', async () => {
    await expect(chromeEndpoint(userDataDir)).rejects.toThrow(/chrome:\/\/inspect\/#remote-debugging/)
    await writeFile(join(userDataDir, 'DevToolsActivePort'), 'not a port\n')
    await expect(chromeEndpoint(userDataDir)).rejects.toBeInstanceOf(ChromeLoginError)
  })

  it('saves only the site\'s cookies, with their attributes, connects once and disconnects', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    const chrome = fakeChrome()
    const imported = await importChromeLogin({ site: 'https://www.example.com/account', sessionsFile, userDataDir, connect: chrome.connect, now: () => new Date('2026-10-03T09:00:00Z') })
    expect(chrome.calls).toEqual({ endpoint: 'ws://127.0.0.1:9333/devtools/browser/abc', methods: ['Storage.getCookies', 'Target.getBrowserContexts', 'Target.getTargets'], closed: true })
    // No tab of the site open: its localStorage was not read, which is not the same as none.
    expect(imported).toMatchObject({ domain: 'www.example.com', cookieCount: 3, localStorage: null, localStorageRead: false, localStorageUnread: [], localStorageUnreadReasons: [], sessionsFile })
    expect(imported.sessionSha256).toMatch(/^[0-9a-f]{64}$/)
    const saved = await new FileSessionStore(sessionsFile).load('www.example.com')
    expect(saved?.vendor).toBe('browser_local_authed')
    expect(saved?.attestedAt).toBe('2026-10-03T09:00:00.000Z')
    expect(saved?.cookies?.map((c) => c.name)).toEqual(['__Host-sid', 'pref', 'api'])
    expect(saved?.cookies?.[0]).toEqual({ name: '__Host-sid', value: 'cookie-value-1', domain: 'www.example.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' })
    expect(saved?.cookies?.[1]?.expires).toBe(1893456000)
    // Readable by the user alone, and the import printed no cookie value.
    if (process.platform !== 'win32') expect((await stat(sessionsFile)).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(imported)).not.toMatch(/cookie-value-/)
  })

  it('saves the localStorage of the site\'s open tabs with its cookies, by origin, reading each tab without loading anything in it', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    const chrome = fakeChrome(COOKIES, [
      { url: 'https://app.example.com/inbox', storage: [['token', 'storage-value-1'], ['user', 'storage-value-2']] },
      { url: 'https://app.example.com/settings', storage: [['token', 'storage-value-1'], ['user', 'storage-value-2']] },
      { url: 'https://example.com/', storage: [] },
      { url: 'https://notexample.com/', storage: [['token', 'storage-value-3']] },
      { url: 'chrome://settings/' },
      // An Incognito window's tab of the site: another account's storage, never saved with the default profile's cookies.
      { url: 'https://www.example.com/', storage: [['token', 'storage-value-4']], context: 'incognito' },
    ])
    const imported = await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: chrome.connect })
    expect(imported).toMatchObject({ cookieCount: 3, localStorage: { origins: ['https://app.example.com'], itemCount: 2 }, localStorageRead: true })
    // Each tab of the site is attached to, read and let go, all at once; another site's tab and a browser page are never attached to.
    expect(chrome.calls.methods.slice(0, 3)).toEqual(['Storage.getCookies', 'Target.getBrowserContexts', 'Target.getTargets'])
    const of = (session: string) => chrome.calls.methods.filter((method) => method.endsWith(`@${session}`))
    for (const session of ['s0', 's1', 's2']) expect(of(session)).toEqual([`Page.getFrameTree@${session}`, `DOMStorage.getDOMStorageItems@${session}`])
    expect(of('s3')).toEqual([])
    expect(chrome.calls.methods.filter((method) => method === 'Target.attachToTarget')).toHaveLength(3)
    expect(chrome.calls.methods.filter((method) => method === 'Target.detachFromTarget')).toHaveLength(3)
    expect(chrome.calls.methods.some((method) => /navigate|evaluate|enable/i.test(method))).toBe(false)
    const saved = await new FileSessionStore(sessionsFile).load('example.com')
    expect(JSON.parse(saved!.storageState!)).toEqual({ cookies: [], origins: [{ origin: 'https://app.example.com', localStorage: [{ name: 'token', value: 'storage-value-1' }, { name: 'user', value: 'storage-value-2' }] }] })
    expect((await listSavedLogins(sessionsFile))[0]).toMatchObject({ domain: 'example.com', cookieCount: 3, localStorage: { origins: ['https://app.example.com'], itemCount: 2 } })
    expect(JSON.stringify([imported, await listSavedLogins(sessionsFile)])).not.toMatch(/storage-value-|cookie-value-/)
    expect(await readFile(sessionsFile, 'utf8')).not.toContain('storage-value-4')
  })

  it('a tab that does not answer is left out and named, the rest of the login saved; a Chrome that names no default profile reads no tab', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    const chrome = fakeChrome(COOKIES, [
      { url: 'https://mail.example.com/', crashed: true },
      { url: 'https://app.example.com/', storage: [['token', 'storage-value-1']] },
      { url: 'https://docs.example.com/', gone: true },
      // A second tab of an origin read in another tab: that origin is read, not unread.
      { url: 'https://app.example.com/other', crashed: true },
    ])
    const imported = await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: chrome.connect })
    expect(imported).toMatchObject({ cookieCount: 3, localStorage: { origins: ['https://app.example.com'], itemCount: 1 }, localStorageRead: true, localStorageUnread: ['https://docs.example.com', 'https://mail.example.com'] })
    // Why each was not read: the step Chrome failed at, and its answer.
    expect(imported.localStorageUnreadReasons).toEqual([
      { origin: 'https://docs.example.com', step: 'Target.attachToTarget', error: 'Chrome refused the request: No target with given id found' },
      { origin: 'https://mail.example.com', step: 'Page.getFrameTree', error: 'Chrome did not answer Page.getFrameTree within 5 s' },
    ])
    // The tabs that did not answer are let go too; the one never attached to has nothing to let go.
    expect(chrome.calls.methods.filter((method) => method === 'Target.detachFromTarget')).toHaveLength(3)
    // Named in the order of their characters, whatever the machine's language.
    const odd = await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: fakeChrome(COOKIES, [{ url: 'https://a_b.example.com/', crashed: true }, { url: 'https://a.example.com/', crashed: true }, { url: 'https://a-b.example.com/', crashed: true }]).connect })
    expect(odd.localStorageUnread).toEqual(['https://a-b.example.com', 'https://a.example.com', 'https://a_b.example.com'])
    expect(odd.localStorageUnreadReasons.map((reason) => reason.origin)).toEqual(odd.localStorageUnread)
    await expect(importChromeLogin({ site: 'jwt.test', sessionsFile, userDataDir, connect: fakeChrome([], [{ url: 'https://jwt.test/', crashed: true }]).connect })).rejects.toThrow(/did not give the localStorage of its open tabs \(https:\/\/jwt.test: Chrome did not answer Page.getFrameTree within 5 s; reload them\)/)
    const unnamed = fakeChrome(COOKIES, [{ url: 'https://app.example.com/', storage: [['token', 'storage-value-1']] }], null)
    expect(await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: unnamed.connect })).toMatchObject({ cookieCount: 3, localStorage: null, localStorageRead: false })
    expect(unnamed.calls.methods).not.toContain('Target.getTargets')
    // A Chrome that refuses to list its contexts still has the site's cookies saved.
    expect(await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: fakeChrome(COOKIES, [], 'refused').connect })).toMatchObject({ cookieCount: 3, localStorage: null, localStorageRead: false })
  })

  it('tabs that do not answer are waited for together, not one after another', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    const chrome = fakeChrome(COOKIES, [
      { url: 'https://a.example.com/', hangs: true },
      { url: 'https://b.example.com/', hangs: true },
      { url: 'https://c.example.com/', hangs: true },
      { url: 'https://app.example.com/', storage: [['token', 'storage-value-1']] },
    ])
    const started = Date.now()
    const imported = await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: chrome.connect })
    // One wait of a tab's read (5 s) for all three, not three.
    expect(Date.now() - started).toBeLessThan(8_000)
    expect(imported).toMatchObject({ localStorage: { origins: ['https://app.example.com'], itemCount: 1 }, localStorageUnread: ['https://a.example.com', 'https://b.example.com', 'https://c.example.com'] })
    expect(imported.localStorageUnreadReasons.map((reason) => reason.step)).toEqual(['Page.getFrameTree', 'Page.getFrameTree', 'Page.getFrameTree'])
  }, 30_000)

  it('names a saved login by the SHA-256 the records of its reads carry', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    const imported = await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: fakeChrome(COOKIES, [{ url: 'https://app.example.com/', storage: [['token', 'storage-value-1']] }]).connect })
    // The session as the authed rung hands it to the browser: the saved cookies and storageState.
    const saved = (await new FileSessionStore(sessionsFile).load('example.com'))!
    const recorded = normalizeAccessConfig({ session: { cookies: saved.cookies, storageState: saved.storageState }, attestation: { principal: saved.attestedBy, at: saved.attestedAt, statement: saved.statement ?? '' } }).sessionSha256
    expect(imported.sessionSha256).toBe(recorded)
    expect((await listSavedLogins(sessionsFile))[0]!.sessionSha256).toBe(recorded)
  })

  it('a site that keeps its login in localStorage alone is saved; with no tab of it open, the refusal says to open one', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    const imported = await importChromeLogin({ site: 'jwt.test', sessionsFile, userDataDir, connect: fakeChrome(COOKIES, [{ url: 'https://jwt.test/app', storage: [['jwt', 'storage-value-1']] }]).connect })
    expect(imported).toMatchObject({ domain: 'jwt.test', cookieCount: 0, localStorage: { origins: ['https://jwt.test'], itemCount: 1 }, localStorageRead: true })
    expect((await new FileSessionStore(sessionsFile).load('jwt.test'))?.cookies).toEqual([])
    await expect(importChromeLogin({ site: 'nothere.org', sessionsFile, userDataDir, connect: fakeChrome().connect })).rejects.toThrow(/no tab of nothere.org is open to read its localStorage from/)
    await expect(importChromeLogin({ site: 'nothere.org', sessionsFile, userDataDir, connect: fakeChrome(COOKIES, [{ url: 'https://nothere.org/', storage: [] }]).connect })).rejects.toThrow(/its open tabs hold no localStorage/)
  })

  it('a site Chrome holds no cookies for is refused with what to do, and nothing is saved', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    const chrome = fakeChrome()
    await expect(importChromeLogin({ site: 'nothere.org', sessionsFile, userDataDir, connect: chrome.connect })).rejects.toThrow(/sign in to nothere.org in Chrome/)
    expect(chrome.calls.closed).toBe(true)
    await expect(readFile(sessionsFile, 'utf8')).rejects.toThrow()
  })

  it('lists saved logins without their cookies, and forgets one', async () => {
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: fakeChrome().connect })
    const listed = await listSavedLogins(sessionsFile)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ domain: 'example.com', cookieCount: 3 })
    expect(JSON.stringify(listed)).not.toMatch(/cookie-value-/)
    expect(await removeSavedLogin(sessionsFile, 'https://example.com/')).toBe(true)
    expect(await removeSavedLogin(sessionsFile, 'example.com')).toBe(false)
    expect(await listSavedLogins(sessionsFile)).toEqual([])
  })

  it('takes a domain or a URL, and refuses what is neither', () => {
    expect(loginDomain('Example.COM')).toBe('example.com')
    expect(loginDomain('https://shop.example.com/cart?x=1')).toBe('shop.example.com')
    expect(() => loginDomain('localhost')).toThrow(ChromeLoginError)
    expect(() => loginDomain('http://')).toThrow(ChromeLoginError)
  })

  it('keeps a parent domain\'s and the subdomains\' cookies, never a lookalike\'s', () => {
    expect(cookiesForDomain(COOKIES, 'example.com').map((c) => c.name)).toEqual(['__Host-sid', 'pref', 'api'])
    expect(cookiesForDomain(COOKIES, 'api.www.example.com').map((c) => c.name)).toEqual(['__Host-sid', 'pref', 'api'])
  })

  it('a public suffix is no site: other sites\' cookies under it are never saved as one login', async () => {
    const underSuffix = [
      { name: 'a', value: 'x', domain: '.bbc.co.uk', path: '/', expires: -1, httpOnly: false, secure: true },
      { name: 'b', value: 'y', domain: 'www.amazon.co.uk', path: '/', expires: -1, httpOnly: false, secure: true },
    ]
    expect(cookiesForDomain(underSuffix, 'co.uk')).toEqual([])
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9333\n/devtools/browser/abc\n')
    await expect(importChromeLogin({ site: 'co.uk', sessionsFile, userDataDir, connect: fakeChrome(underSuffix).connect })).rejects.toThrow(/sets no cookie on co.uk itself.*octocrawl login import bbc.co.uk/)
    await expect(readFile(sessionsFile, 'utf8')).rejects.toThrow()
  })

  it('knows the stable Chrome\'s profile directory on each OS', () => {
    expect(chromeUserDataDir('darwin', {}, '/Users/a')).toBe(join('/Users/a', 'Library', 'Application Support', 'Google', 'Chrome'))
    expect(chromeUserDataDir('linux', {}, '/home/a')).toBe(join('/home/a', '.config', 'google-chrome'))
    expect(chromeUserDataDir('win32', { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, 'C:\\Users\\a')).toBe(join('C:\\Users\\a\\AppData\\Local', 'Google', 'Chrome', 'User Data'))
  })
})
