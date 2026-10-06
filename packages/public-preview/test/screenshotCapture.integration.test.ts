import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { captureScreenshot, previewBrowserUserAgent, ScreenshotBudgetError } from '../src/screenshotCapture.js'

/**
 * A real Chromium against a loopback fixture: the hosted policy, with loopback admitted for the fixture, must still
 * refuse the page's subresources to private and metadata addresses and never connect a WebSocket. Loopback is
 * reached directly: a proxy in the environment would carry it elsewhere.
 */
for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) delete process.env[name]

let server: Server
let origin = ''
let requests: { path: string; userAgent: string | undefined; upgrade: boolean }[] = []
/** A second server on the other loopback address, which the policy denies: nothing may ever reach it. */
let denied: Server
let deniedOrigin = ''
let deniedHits: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push({ path: req.url ?? '', userAgent: req.headers['user-agent'], upgrade: req.headers.upgrade !== undefined })
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Tide report</title></head><body>
        <main><h1>Tide report</h1><p>The harbour office records tide height, wind and visibility for every hour of the day.</p>
        <img src="/ok.png" alt="Harbour" width="40" height="40">
        <img src="http://10.0.0.1/private.png" alt="private" width="40" height="40">
        <img src="http://169.254.169.254/computeMetadata/v1/" alt="metadata" width="40" height="40">
        <img src="/img-redirect" alt="redirected" width="40" height="40">
        <script>try { new WebSocket('ws://' + location.host + '/ws') } catch {}</script></main></body></html>`)
      return
    }
    // Redirects: a subresource and a page that hop to the denied address, and a page that hops within the fixture.
    if (req.url === '/img-redirect') { res.writeHead(302, { location: `${deniedOrigin}/pixel.png` }).end(); return }
    if (req.url === '/top-redirect') { res.writeHead(302, { location: `${deniedOrigin}/secret` }).end(); return }
    if (req.url === '/go') { res.writeHead(302, { location: '/' }).end(); return }
    if (req.url === '/ok.png') {
      // A 1x1 PNG.
      res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
      return
    }
    res.writeHead(404).end()
  })
  server.on('upgrade', (req, socket) => { requests.push({ path: req.url ?? '', userAgent: req.headers['user-agent'], upgrade: true }); socket.destroy() })
  denied = createServer((req, res) => { deniedHits.push(req.url ?? ''); res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>SECRET</h1>') })
  await new Promise<void>(resolve => denied.listen(0, '::1', resolve))
  deniedOrigin = `http://[::1]:${(denied.address() as AddressInfo).port}`
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  await new Promise<void>(resolve => denied.close(() => resolve()))
})

const policy = { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }

describe('the screenshot capture', () => {
  it('takes the page and its allowed image, refuses private and metadata subresources, never connects a WebSocket, and names the preview', async () => {
    requests = []
    deniedHits = []
    const capture = await captureScreenshot(`${origin}/`, { signal: new AbortController().signal, budgetMs: 20_000, policy })
    expect(capture.width).toBe(1280)
    expect(capture.height).toBe(800)
    expect(capture.jpeg.length).toBeGreaterThan(1_000)
    expect(capture.elements.map(element => [element.tag, element.text])).toEqual(expect.arrayContaining([['h1', 'Tide report'], ['img', 'Harbour']]))
    for (const element of capture.elements) expect(element.y).toBeLessThan(capture.height)
    // The private image, the metadata address, the image that redirects to the denied address, and the WebSocket.
    expect(capture.blocked).toBeGreaterThanOrEqual(4)
    expect(requests.map(request => request.path).sort()).toEqual(['/', '/img-redirect', '/ok.png'])
    expect(deniedHits).toEqual([])
    expect(requests.some(request => request.upgrade)).toBe(false)
    for (const request of requests) expect(request.userAgent).toBe(previewBrowserUserAgent())
    expect(capture.timings.totalMs).toBeGreaterThan(0)
  })

  it('follows a page\'s redirect within the fixture, and never one to a denied address', async () => {
    deniedHits = []
    const capture = await captureScreenshot(`${origin}/go`, { signal: new AbortController().signal, budgetMs: 20_000, policy })
    expect(capture.elements.map(element => element.text)).toContain('Tide report')
    await expect(captureScreenshot(`${origin}/top-redirect`, { signal: new AbortController().signal, budgetMs: 20_000, policy })).rejects.toThrow()
    expect(deniedHits).toEqual([])
  })

  it('refuses a page at a denied address before any browser starts', async () => {
    const started = performance.now()
    await expect(captureScreenshot('http://169.254.169.254/computeMetadata/v1/', { signal: new AbortController().signal, budgetMs: 20_000, policy })).rejects.toThrow()
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  it('ends within its budget', async () => {
    const started = performance.now()
    await expect(captureScreenshot(`${origin}/`, { signal: new AbortController().signal, budgetMs: 1, policy })).rejects.toBeInstanceOf(ScreenshotBudgetError)
    expect(performance.now() - started).toBeLessThan(3_000)
  })

  it('stops when its signal aborts', async () => {
    const controller = new AbortController()
    const pending = captureScreenshot(`${origin}/`, { signal: controller.signal, budgetMs: 20_000, policy })
    // While the browser is still starting: a loopback page is captured in well under a quarter of a second here.
    setTimeout(() => controller.abort(new DOMException('Client disconnected', 'AbortError')), 20)
    await expect(pending).rejects.toThrow()
  })
})
