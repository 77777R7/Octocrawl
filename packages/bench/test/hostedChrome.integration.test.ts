import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSocket } from 'node:dgram'
import { createServer, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { chromium } from 'playwright'
import { hostedNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { CompatAddressGuard, type GuardDial, type GuardResolver } from '../src/compatGuard.js'
import { hostedChromeProxy, launchHostedChrome } from '../src/subjects/hostedChrome.js'
import { installedChromeLaunchOf } from '../src/subjects/installedChrome.js'

// Playwright's own Chromium stands in for the pinned Google Chrome, headless because CI has no display, without the
// sandbox on a Linux CI runner (as installedChrome.integration.test.ts runs it): the test proves where Chrome's
// connections go, not Chrome's detection. Every name below is one the system cannot resolve: Chrome reaches a page only
// through the guard, which resolves it with the test's resolver and checks the address.
const seams = { executable: chromium.executablePath(), headless: true, ...(process.platform === 'linux' ? { extraArgs: ['--no-sandbox'] } : {}) }

const ARTICLE = `<!doctype html><title>Tide tables</title><main><h1>Tide tables</h1><p>The harbour office records tide height for every hour.</p></main>`
let site: Server
let port = 0
const seen: { url: string; host: string }[] = []

beforeAll(async () => {
  site = createServer((req, res) => {
    // Chrome asks for a favicon of its own after a page loads: not a request the page made.
    if (req.url !== '/favicon.ico') seen.push({ url: req.url ?? '', host: req.headers.host ?? '' })
    if (req.url === '/hop') return void res.writeHead(302, { location: `http://private.test:${port}/secret` }).end()
    if (req.url === '/hop-literal') return void res.writeHead(302, { location: `http://127.0.0.1:${port}/secret` }).end()
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE)
  })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  port = (site.address() as AddressInfo).port
})
afterAll(async () => {
  site.closeAllConnections()
  await new Promise<void>((resolve) => site.close(() => resolve()))
})

/** The hosted policy, letting the names a test gives through to the loopback site: names, never an address range. */
const hosted = (...names: string[]): NetworkPolicy => ({ ...hostedNetworkPolicy(), origin: 'operator', privateAllowlist: names })
/** A resolver that answers 127.0.0.1 for the names given and fails every other. */
const resolver = (...names: string[]): GuardResolver => async (hostname) => {
  if (!names.includes(hostname)) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' })
  return [{ address: '127.0.0.1', family: 4 }]
}

describe('hosted_chrome: Chrome reaches the network only through its address guard', () => {
  it('reads a public name through the guard and is refused loopback, a private hop and its own debugging port', async () => {
    const dialled: string[] = []
    const dial: GuardDial = (address, to) => { dialled.push(`${address}:${to}`); return connect({ host: address, port: to }) }
    // public.test and pinned.test are let through to the site; private.test resolves to it too but is not on the list.
    const guard = new CompatAddressGuard(hosted('public.test', 'pinned.test'), resolver('public.test', 'pinned.test', 'private.test'), { login: false, dial })
    const browser = await launchHostedChrome(guard, { timeout: 30_000 }, seams)
    try {
      const page = browser.contexts()[0]!.pages()[0] ?? await browser.contexts()[0]!.newPage()
      // A name the system cannot resolve: Chrome sent it to the guard, which resolved and checked it.
      await page.goto(`http://pinned.test:${port}/article`)
      expect(await page.title()).toBe('Tide tables')
      expect(seen.at(-1)).toEqual({ url: '/article', host: `pinned.test:${port}` })

      // Loopback skips no proxy (<-loopback>): the guard is asked, and refuses, by address and by name.
      const before = seen.length
      for (const url of [`http://127.0.0.1:${port}/article`, `http://localhost:${port}/article`]) {
        await expect(page.goto(url), url).rejects.toThrow(/net::ERR_/)
      }
      // A hop to a name the operator's list does not let through, and to a loopback literal: refused at the guard.
      for (const path of ['/hop', '/hop-literal']) await expect(page.goto(`http://public.test:${port}${path}`), path).rejects.toThrow(/net::ERR_/)
      // The page cannot reach Chrome's own debugging port, which the driver reaches directly.
      const reader = await browser.contexts()[0]!.newPage()
      await reader.goto(`http://pinned.test:${port}/article`)
      const debugging = installedChromeLaunchOf(browser)!.port
      const reached = await reader.evaluate(async (to) => {
        try { await fetch(`http://127.0.0.1:${to}/json/version`, { mode: 'no-cors' }); return 'reached' } catch { return 'refused' }
      }, debugging)
      expect(reached).toBe('refused')
      expect(seen.slice(before).map((request) => request.url).filter((url) => url !== '/article')).toEqual(['/hop', '/hop-literal'])
      expect(seen.map((request) => request.url)).not.toContain('/secret')
      // Every connection the guard carried on went to the address it checked, never to a name.
      expect(dialled.length).toBeGreaterThan(0)
      expect(new Set(dialled)).toEqual(new Set([`127.0.0.1:${port}`]))
    } finally {
      await browser.close()
      await guard.close()
    }
  }, 60_000)

  it('sends no WebRTC UDP, which no proxy carries: not to a loopback STUN server, and gathers no candidate', async () => {
    // A page names a STUN server at a loopback address; with Chrome's default policy it would get WebRTC's UDP directly.
    const udp = createSocket('udp4')
    let packets = 0
    udp.on('message', () => { packets += 1 })
    await new Promise<void>((resolve) => udp.bind(0, '127.0.0.1', resolve))
    const guard = new CompatAddressGuard(hosted('pinned.test'), resolver('pinned.test'), { login: false })
    const browser = await launchHostedChrome(guard, { timeout: 30_000 }, seams)
    try {
      const page = browser.contexts()[0]!.pages()[0] ?? await browser.contexts()[0]!.newPage()
      await page.goto(`http://pinned.test:${port}/article`)
      const candidates = await page.evaluate(async (to) => {
        const connection = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${to}` }] })
        const found: string[] = []
        connection.onicecandidate = (event) => { if (event.candidate !== null && event.candidate.candidate !== '') found.push(event.candidate.candidate) }
        connection.createDataChannel('probe')
        await connection.setLocalDescription(await connection.createOffer())
        await new Promise((resolve) => setTimeout(resolve, 2_500))
        connection.close()
        return found
      }, (udp.address() as AddressInfo).port)
      expect(candidates).toEqual([])
      expect(packets).toBe(0)
    } finally {
      await browser.close()
      await guard.close()
      udp.close()
    }
  }, 60_000)

  it('takes only its own guard as a proxy', () => {
    expect(hostedChromeProxy('socks5://127.0.0.1:4321')).toEqual({ server: 'socks5://127.0.0.1:4321', bypass: '<-loopback>' })
    for (const url of ['socks5h://u:p@127.0.0.1:4321', 'socks5://u:p@127.0.0.1:4321', 'http://127.0.0.1:4321', 'socks5://10.0.0.7:4321']) {
      expect(() => hostedChromeProxy(url), url).toThrow(/address guard/)
    }
  })
})
