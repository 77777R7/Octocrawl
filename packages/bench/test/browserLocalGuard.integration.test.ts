import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { hostedNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { CompatAddressGuard } from '../src/compatGuard.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

// The hosted engine's plain browser rung (browser_local, Playwright's Chromium). Before 2026-11-11 it checked the URL it
// was given and the final URL only, so a redirect or a subresource reached a private address before any check, and the
// check of the final URL came after the request. Behind its address guard (compatGuard.ts), as hosted_chrome is, every
// connection the page makes is checked first. The site is on loopback; the hosted policy lets the name `localhost`
// through to it (a name, never an address range), so anything that reaches 127.0.0.1 by its literal is what a page
// on a public host does to reach the service's own network.
let site: Server
let port = 0
const seen: string[] = []

beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url !== '/favicon.ico' && req.url !== '/robots.txt') seen.push(req.url ?? '')
    if (req.url === '/robots.txt') return void res.writeHead(404).end()
    if (req.url === '/hop') return void res.writeHead(302, { location: `http://127.0.0.1:${port}/secret` }).end()
    if (req.url === '/embeds') {
      return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
        `<!doctype html><title>Harbour notes</title><main><h1>Harbour notes</h1><p>The harbour office records tide height for every hour of the day.</p>`
        + `<img src="http://127.0.0.1:${port}/secret-image"><script src="http://127.0.0.1:${port}/secret-script"></script></main>`)
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Secret</title><p>internal</p>')
  })
  // Every interface: `localhost` may resolve to ::1 first, and the literal 127.0.0.1 must reach the same site.
  await new Promise<void>((resolve) => site.listen(0, resolve))
  port = (site.address() as AddressInfo).port
})
afterAll(async () => {
  site.closeAllConnections()
  await new Promise<void>((resolve) => site.close(() => resolve()))
})

const hosted = (): NetworkPolicy => ({ ...hostedNetworkPolicy(), origin: 'operator', privateAllowlist: ['localhost'] })

describe('the hosted plain browser behind its address guard', () => {
  it('never connects to a private address a redirect or a subresource names', async () => {
    const policy = hosted()
    const guard = new CompatAddressGuard(policy, undefined, { login: false })
    const subject = new BrowserLocalSubject('standard', null, false, policy, null, undefined, null, undefined, undefined, null, false, undefined, 'playwright', 'declared', {}, null, undefined, null, null, guard)
    try {
      const page = await subject.fetch(`http://localhost:${port}/embeds`, Date.now() + 30_000)
      expect(page.status).toBe('success')
      expect(page.markdown).toContain('tide height')
      const hop = await subject.fetch(`http://localhost:${port}/hop`, Date.now() + 30_000)
      expect(hop.status).not.toBe('success')
      expect(seen).toContain('/embeds')
      expect(seen).toContain('/hop')
      expect(seen.filter((url) => url.startsWith('/secret'))).toEqual([])
    } finally {
      await subject.teardown()
      await guard.close()
    }
  }, 60_000)
})
