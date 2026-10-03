import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChromeLoginError, type CdpConnection } from '../src/chromeLogin.js'
import { HandoffNotThrough, openUserChrome } from '../src/chromeHandoff.js'

const GATE = '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>'
const PAGE = `<html><body><article><h1>Page</h1>${'<p>Prose long enough to be the page. </p>'.repeat(4)}</article></body></html>`

/** A Chrome that shows the tab W2L opens as `states`, one per read, the last one from then on; `fail` throws on a read instead. */
function fakeChrome(states: Array<{ href: string; ready?: string; status?: number | null; html: string } | 'closed'>) {
  const calls: string[] = []
  let read = 0
  const connect = async (): Promise<CdpConnection> => ({
    async send(method, params, sessionId) {
      calls.push(sessionId === undefined ? method : `${method}@${sessionId}`)
      if (method === 'Browser.getVersion') return { product: 'Chrome/144.0.7000.0' }
      if (method === 'Target.createTarget') return { targetId: `tab:${String((params as { url: string }).url)}` }
      if (method === 'Target.attachToTarget') return { sessionId: 's1' }
      if (method === 'Target.closeTarget') return { success: true }
      if (method === 'Runtime.evaluate') {
        const state = states[Math.min(read++, states.length - 1)]!
        if (state === 'closed') throw new ChromeLoginError('Chrome refused the request: No session with given id')
        return { result: { value: JSON.stringify({ ready: 'complete', status: 200, ...state }) } }
      }
      throw new Error(`unexpected ${method}`)
    },
    close() { calls.push('close') },
  })
  return { calls, connect }
}

describe('the person\'s Chrome', () => {
  let userDataDir: string
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'w2l-handoff-chrome-'))
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
  })
  afterEach(async () => { await rm(userDataDir, { recursive: true, force: true }) })

  it('opens the page in a new tab, says when it shows a check, reads it once it is through on two reads, and closes the tab', async () => {
    const chrome = fakeChrome([{ href: 'https://site.test/a', html: GATE }, { href: 'https://site.test/a', html: GATE }, { href: 'https://site.test/a', html: PAGE }])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const waiting: string[] = []
    const read = await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000, onWaiting: (url, check) => waiting.push(`${url} ${check}`) })
    reader.close()
    expect(waiting).toEqual(['https://site.test/a captcha'])
    expect(read).toMatchObject({ requestedUrl: 'https://site.test/a', finalUrl: 'https://site.test/a', status: 200, html: PAGE, sawGate: 'captcha', browser: 'Chrome/144.0.7000.0' })
    expect(chrome.calls).toEqual(['Browser.getVersion', 'Target.createTarget', 'Target.attachToTarget', 'Runtime.evaluate@s1', 'Runtime.evaluate@s1', 'Runtime.evaluate@s1', 'Runtime.evaluate@s1', 'Target.closeTarget', 'close'])
  })

  it('a page that still shows its check when the wait ends is not read, and its tab is closed', async () => {
    const chrome = fakeChrome([{ href: 'https://site.test/a', html: GATE }])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const failure = await reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HandoffNotThrough)
    expect(failure).toMatchObject({ check: 'captcha', message: expect.stringContaining('still showed a check (captcha)') })
    expect(chrome.calls).toContain('Target.closeTarget')
  })

  it('a page that ends off the site asked for is not read as that site\'s', async () => {
    const chrome = fakeChrome([{ href: 'http://192.168.1.1/admin', html: PAGE }])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 })).rejects.toThrow('it was on 192.168.1.1, not site.test')
  })

  it('the person\'s sign-in on another host of the site is waited for, and the page read once back on it', async () => {
    const chrome = fakeChrome([{ href: 'https://login.example.org/sso', html: PAGE }, { href: 'https://www.site.test/a', html: PAGE }])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    expect(await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).toMatchObject({ finalUrl: 'https://www.site.test/a', sawGate: null })
  })

  it('a tab the person closed is not read', async () => {
    const chrome = fakeChrome([{ href: 'https://site.test/a', html: GATE }, 'closed'])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).rejects.toThrow('was closed before W2L read it')
  })

  it('without remote debugging on, says how to turn it on', async () => {
    await rm(join(userDataDir, 'DevToolsActivePort'))
    await expect(openUserChrome({ userDataDir, connect: fakeChrome([]).connect })).rejects.toThrow(/chrome:\/\/inspect\/#remote-debugging/)
  })
})
