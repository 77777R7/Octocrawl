import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChromeLoginError, type CdpConnection } from '../src/chromeLogin.js'
import { HandoffNotThrough, openUserChrome } from '../src/chromeHandoff.js'

const GATE = '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>'
const PAGE = `<html><body><article><h1>Page</h1>${'<p>Prose long enough to be the page. </p>'.repeat(4)}</article></body></html>`

type State = { href: string; ready?: string; status?: number | null; html: string; secret?: boolean; typing?: boolean }

/**
 * A Chrome that shows the tab W2L opens as `states`, one per read, the last
 * one from then on ('closed': the tab is gone). It has no events, as a
 * connection without them: the document's status is the page's own report.
 */
function fakeChrome(states: Array<State | 'closed'>) {
  const calls: string[] = []
  let read = 0
  const connect = async (): Promise<CdpConnection> => ({
    async send(method, params, sessionId) {
      calls.push(sessionId === undefined ? method : `${method}@${sessionId}`)
      if (method === 'Browser.getVersion') return { product: 'Chrome/144.0.7000.0' }
      if (method === 'Target.createTarget') return { targetId: `tab:${String((params as { url: string }).url)}` }
      if (method === 'Target.attachToTarget') return { sessionId: 's1' }
      if (method === 'Target.closeTarget' || method === 'Page.navigate') return {}
      if (method === 'Runtime.evaluate') {
        const state = states[Math.min(read++, states.length - 1)]!
        if (state === 'closed') throw new ChromeLoginError('Chrome refused the request: No session with given id')
        return { result: { value: JSON.stringify({ ready: 'complete', status: 200, secret: false, typing: false, ...state }) } }
      }
      throw new Error(`unexpected ${method}`)
    },
    close() { calls.push('close') },
  })
  return { calls, connect }
}

const at = (href: string, html: string, extra: Partial<State> = {}): State => ({ href, html, ...extra })

describe('the person\'s Chrome', () => {
  let userDataDir: string
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'w2l-handoff-chrome-'))
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userDataDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
  })
  afterEach(async () => { await rm(userDataDir, { recursive: true, force: true }) })

  it('opens a blank tab, goes to the page, says when it shows a check, reads it once through on three reads, and closes the tab', async () => {
    const chrome = fakeChrome([at('https://site.test/a', GATE), at('https://site.test/a', PAGE)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const waiting: string[] = []
    const read = await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000, onWaiting: (url, check) => waiting.push(`${url} ${check}`) })
    reader.close()
    expect(waiting).toEqual(['https://site.test/a captcha'])
    expect(read).toMatchObject({ requestedUrl: 'https://site.test/a', finalUrl: 'https://site.test/a', status: 200, contentType: null, html: PAGE, sawGate: 'captcha', browser: 'Chrome/144.0.7000.0' })
    expect(chrome.calls).toEqual(['Browser.getVersion', 'Target.createTarget', 'Target.attachToTarget', 'Page.navigate@s1', ...Array(4).fill('Runtime.evaluate@s1'), 'Target.closeTarget', 'close'])
  })

  it('a page that still shows its check when the wait ends is not read, and its tab is closed', async () => {
    const chrome = fakeChrome([at('https://site.test/a', GATE)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    const failure = await reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HandoffNotThrough)
    expect(failure).toMatchObject({ check: 'captcha', message: expect.stringContaining('still showed a check (captcha)') })
    expect(chrome.calls).toContain('Target.closeTarget')
  })

  it('the person at a sign-in step of their own (a code field, a field they type in) is waited for', async () => {
    const chrome = fakeChrome([
      at('https://site.test/a', '<form><input autocomplete="one-time-code"></form>', { secret: true }),
      at('https://site.test/a', PAGE, { typing: true }),
      at('https://site.test/a', PAGE, { typing: true }),
      at('https://site.test/a', PAGE),
    ])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })
    // Three sign-in reads, then three clear ones.
    expect(chrome.calls.filter((call) => call.startsWith('Runtime.evaluate'))).toHaveLength(6)
  })

  it('a page that does not answer 2xx, or sits on a login path, is not through', async () => {
    for (const state of [at('https://site.test/a', PAGE, { status: 403 }), at('https://site.test/login?next=/a', PAGE)]) {
      const reader = await openUserChrome({ userDataDir, connect: fakeChrome([state]).connect })
      await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 })).rejects.toThrow('it was not yet the page')
    }
  })

  it('a page that ends off the site asked for is not read as that site\'s', async () => {
    const chrome = fakeChrome([at('http://192.168.1.1/admin', PAGE)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 50 })).rejects.toThrow('it was on 192.168.1.1, not site.test')
  })

  it('the person\'s sign-in on another host of the site is waited for, and the page read once back on it', async () => {
    const chrome = fakeChrome([at('https://login.example.org/sso', PAGE), at('https://www.site.test/a', PAGE)])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    expect(await reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).toMatchObject({ finalUrl: 'https://www.site.test/a', sawGate: null })
  })

  it('a tab the person closed is not read', async () => {
    const chrome = fakeChrome([at('https://site.test/a', GATE), 'closed'])
    const reader = await openUserChrome({ userDataDir, connect: chrome.connect })
    await expect(reader.read('https://site.test/a', { pollMs: 1, waitMs: 5_000 })).rejects.toThrow('was closed, or Chrome quit, before W2L read it')
  })

  it('a caller that went away ends the wait', async () => {
    const reader = await openUserChrome({ userDataDir, connect: fakeChrome([at('https://site.test/a', GATE)]).connect })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)
    await expect(reader.read('https://site.test/a', { pollMs: 5, waitMs: 60_000, signal: controller.signal })).rejects.toThrow('was cancelled before W2L read it')
  })

  it('without remote debugging on, says how to turn it on', async () => {
    await rm(join(userDataDir, 'DevToolsActivePort'))
    await expect(openUserChrome({ userDataDir, connect: fakeChrome([]).connect })).rejects.toThrow(/chrome:\/\/inspect\/#remote-debugging/)
  })
})
