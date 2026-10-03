import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSessionStore } from '@w2l/bench'
import { ChromeLoginError, chromeEndpoint, chromeUserDataDir, cookiesForDomain, importChromeLogin, listSavedLogins, loginDomain, removeSavedLogin, type CdpConnection } from '../src/chromeLogin.js'

const COOKIES = [
  { name: '__Host-sid', value: 'v1', domain: 'www.example.com', path: '/', expires: -1, httpOnly: true, secure: true, session: true, sameSite: 'Lax' as const },
  { name: 'pref', value: 'v2', domain: '.example.com', path: '/', expires: 1893456000, httpOnly: false, secure: false },
  { name: 'api', value: 'v3', domain: 'api.www.example.com', path: '/', expires: 1893456000, httpOnly: false, secure: true },
  { name: 'other', value: 'v4', domain: '.notexample.com', path: '/', expires: -1, httpOnly: false, secure: false },
  { name: 'tracker', value: 'v5', domain: '.com', path: '/', expires: -1, httpOnly: false, secure: false },
]

function fakeChrome(cookies = COOKIES) {
  const calls: { endpoint: string; methods: string[]; closed: boolean } = { endpoint: '', methods: [], closed: false }
  const connect = async (endpoint: string): Promise<CdpConnection> => {
    calls.endpoint = endpoint
    return {
      async send(method) { calls.methods.push(method); return { cookies } },
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
    expect(chrome.calls).toEqual({ endpoint: 'ws://127.0.0.1:9333/devtools/browser/abc', methods: ['Storage.getCookies'], closed: true })
    expect(imported).toMatchObject({ domain: 'www.example.com', cookieCount: 3, sessionsFile })
    expect(imported.sessionSha256).toMatch(/^[0-9a-f]{64}$/)
    const saved = await new FileSessionStore(sessionsFile).load('www.example.com')
    expect(saved?.vendor).toBe('browser_local_authed')
    expect(saved?.attestedAt).toBe('2026-10-03T09:00:00.000Z')
    expect(saved?.cookies?.map((c) => c.name)).toEqual(['__Host-sid', 'pref', 'api'])
    expect(saved?.cookies?.[0]).toEqual({ name: '__Host-sid', value: 'v1', domain: 'www.example.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' })
    expect(saved?.cookies?.[1]?.expires).toBe(1893456000)
    // Readable by the user alone, and the import printed no cookie value.
    if (process.platform !== 'win32') expect((await stat(sessionsFile)).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(imported)).not.toMatch(/v1|v2|v3/)
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
    expect(JSON.stringify(listed)).not.toMatch(/v1|v2|v3/)
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

  it('knows the stable Chrome\'s profile directory on each OS', () => {
    expect(chromeUserDataDir('darwin', {}, '/Users/a')).toBe(join('/Users/a', 'Library', 'Application Support', 'Google', 'Chrome'))
    expect(chromeUserDataDir('linux', {}, '/home/a')).toBe(join('/home/a', '.config', 'google-chrome'))
    expect(chromeUserDataDir('win32', { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, 'C:\\Users\\a')).toBe(join('C:\\Users\\a\\AppData\\Local', 'Google', 'Chrome', 'User Data'))
  })
})
