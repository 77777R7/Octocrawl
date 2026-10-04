import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSessionStore } from '@w2l/bench'
import { ChromeLoginError, chromeEndpoint, chromeUserDataDir, cookiesForDomain, importChromeLogin, listSavedLogins, loginDomain, removeSavedLogin, type CdpConnection } from '../src/chromeLogin.js'

const COOKIES = [
  { name: '__Host-sid', value: 'cookie-value-1', domain: 'www.example.com', path: '/', expires: -1, httpOnly: true, secure: true, session: true, sameSite: 'Lax' as const },
  { name: 'pref', value: 'cookie-value-2', domain: '.example.com', path: '/', expires: 1893456000, httpOnly: false, secure: false },
  { name: 'api', value: 'cookie-value-3', domain: 'api.www.example.com', path: '/', expires: 1893456000, httpOnly: false, secure: true },
  { name: 'other', value: 'cookie-value-4', domain: '.notexample.com', path: '/', expires: -1, httpOnly: false, secure: false },
  { name: 'tracker', value: 'cookie-value-5', domain: '.com', path: '/', expires: -1, httpOnly: false, secure: false },
]

/** A tab open in the person's Chrome: its address, and the localStorage of its top frame's origin. */
type Tab = { url: string; storage?: [string, string][] }

/** A Chrome holding `cookies`, with `tabs` open; a page's storage is read through a session attached to its tab. */
function fakeChrome(cookies = COOKIES, tabs: Tab[] = []) {
  const calls: { endpoint: string; methods: string[]; closed: boolean } = { endpoint: '', methods: [], closed: false }
  const connect = async (endpoint: string): Promise<CdpConnection> => {
    calls.endpoint = endpoint
    return {
      async send(method, params = {}, sessionId) {
        calls.methods.push(sessionId === undefined ? method : `${method}@${sessionId}`)
        const tab = sessionId === undefined ? undefined : tabs[Number(sessionId.slice(1))]
        if (method === 'Storage.getCookies') return { cookies }
        if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 'sw', type: 'service_worker', url: 'https://www.example.com/sw.js' }, ...tabs.map((t, i) => ({ targetId: `t${i}`, type: 'page', url: t.url }))] }
        if (method === 'Target.attachToTarget') return { sessionId: `s${String(params.targetId).slice(1)}` }
        if (method === 'Page.getFrameTree') return { frameTree: { frame: { securityOrigin: new URL(tab!.url).origin } } }
        if (method === 'DOMStorage.getDOMStorageItems') return { entries: tab!.storage ?? [] }
        return {}
      },
      close() { calls.closed = true },
    }
  }
  return { calls, connect }
}

describe('w2l login import from the user\'s Chrome', () => {
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
    expect(chrome.calls).toEqual({ endpoint: 'ws://127.0.0.1:9333/devtools/browser/abc', methods: ['Storage.getCookies', 'Target.getTargets'], closed: true })
    // No tab of the site open: its localStorage was not read, which is not the same as none.
    expect(imported).toMatchObject({ domain: 'www.example.com', cookieCount: 3, localStorage: null, localStorageRead: false, sessionsFile })
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
    ])
    const imported = await importChromeLogin({ site: 'example.com', sessionsFile, userDataDir, connect: chrome.connect })
    expect(imported).toMatchObject({ cookieCount: 3, localStorage: { origins: ['https://app.example.com'], itemCount: 2 }, localStorageRead: true })
    // Each tab of the site is attached to, read and let go; another site's tab and a browser page are never attached to.
    expect(chrome.calls.methods).toEqual(['Storage.getCookies', 'Target.getTargets',
      'Target.attachToTarget', 'Page.getFrameTree@s0', 'DOMStorage.getDOMStorageItems@s0', 'Target.detachFromTarget',
      'Target.attachToTarget', 'Page.getFrameTree@s1', 'Target.detachFromTarget',
      'Target.attachToTarget', 'Page.getFrameTree@s2', 'DOMStorage.getDOMStorageItems@s2', 'Target.detachFromTarget'])
    expect(chrome.calls.methods.some((method) => /navigate|evaluate|enable/i.test(method))).toBe(false)
    const saved = await new FileSessionStore(sessionsFile).load('example.com')
    expect(JSON.parse(saved!.storageState!)).toEqual({ cookies: [], origins: [{ origin: 'https://app.example.com', localStorage: [{ name: 'token', value: 'storage-value-1' }, { name: 'user', value: 'storage-value-2' }] }] })
    expect((await listSavedLogins(sessionsFile))[0]).toMatchObject({ domain: 'example.com', cookieCount: 3, localStorage: { origins: ['https://app.example.com'], itemCount: 2 } })
    expect(JSON.stringify([imported, await listSavedLogins(sessionsFile)])).not.toMatch(/storage-value-|cookie-value-/)
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
    await expect(importChromeLogin({ site: 'co.uk', sessionsFile, userDataDir, connect: fakeChrome(underSuffix).connect })).rejects.toThrow(/sets no cookie on co.uk itself.*w2l login import bbc.co.uk/)
    await expect(readFile(sessionsFile, 'utf8')).rejects.toThrow()
  })

  it('knows the stable Chrome\'s profile directory on each OS', () => {
    expect(chromeUserDataDir('darwin', {}, '/Users/a')).toBe(join('/Users/a', 'Library', 'Application Support', 'Google', 'Chrome'))
    expect(chromeUserDataDir('linux', {}, '/home/a')).toBe(join('/home/a', '.config', 'google-chrome'))
    expect(chromeUserDataDir('win32', { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, 'C:\\Users\\a')).toBe(join('C:\\Users\\a\\AppData\\Local', 'Google', 'Chrome', 'User Data'))
  })
})
