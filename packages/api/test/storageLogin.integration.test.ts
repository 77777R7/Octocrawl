import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext } from 'playwright'
import { buildChannels, FileSessionStore } from '@w2l/bench'
import { importChromeLogin } from '../src/chromeLogin.js'

/**
 * A site that keeps its login in localStorage (a token its script reads), in
 * real Chromium: the person signs in in their own Chrome and leaves a tab of
 * it open; the import reads that tab's storage without loading anything, and
 * W2L's own browser then reads the page signed in.
 */

let server: Server
let base: string
let root: string
let chrome: BrowserContext
const requested: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    requested.push(req.url ?? '')
    if (req.url === '/robots.txt') { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><title>Inbox</title></head><body><main id="m"></main><script>
      const token = localStorage.getItem('token')
      document.getElementById('m').innerHTML = token === 'jwt-abc'
        ? '<h1>Your inbox</h1>' + '<p>Signed in with the stored token. This page lists the messages of the account that is signed in, newest first.</p>'.repeat(3)
        : '<h1>Sign in</h1><form><input name="user"><input type="password" name="pw"></form>'
    </script></body></html>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'w2l-storage-login-'))
  // "The person's Chrome": remote debugging on, so Chrome writes DevToolsActivePort in its user data directory.
  chrome = await chromium.launchPersistentContext(join(root, 'chrome'), { args: ['--remote-debugging-port=0'] })
}, 60_000)

afterAll(async () => {
  await chrome?.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

describe('a login kept in localStorage', () => {
  it('is imported from the site\'s open tab without loading anything, and W2L\'s browser reads the page signed in with it', async () => {
    const sessionsFile = join(root, 'sessions.json')
    // The person signs in: the site stores its token, and the tab stays open.
    const tab = await chrome.newPage()
    await tab.goto(`${base}/inbox`)
    await tab.evaluate(() => { localStorage.setItem('token', 'jwt-abc') })
    const before = requested.length

    const imported = await importChromeLogin({ site: `${base}/inbox`, sessionsFile, userDataDir: join(root, 'chrome') })
    expect(imported).toMatchObject({ domain: '127.0.0.1', cookieCount: 0, localStorage: { origins: [base], itemCount: 1 }, localStorageRead: true })
    expect(requested.length).toBe(before)
    expect(tab.url()).toBe(`${base}/inbox`)

    const channels = buildChannels('authed', {})
    const authed = channels.find((channel) => channel.id === 'authed_session')!
    try {
      const session = await new FileSessionStore(sessionsFile).load('127.0.0.1')
      const result = await authed.fetch(`${base}/inbox`, session)
      expect(result.status).toBe('success')
      expect(result.markdown).toContain('Signed in with the stored token')
      expect(result.trace.find((event) => event.event === 'session_attached')?.detail).toMatchObject({ cookieCount: 0, localStorageOrigins: 1 })
      expect(JSON.stringify(result.trace)).not.toContain('jwt-abc')
    } finally {
      for (const channel of channels) await channel.close?.()
    }
  }, 120_000)
})
