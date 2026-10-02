import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { browserUserAgent, CHROME_MAJOR_FLOOR, localNetworkPolicy, mobileBrowserUserAgent } from '@w2l/contracts'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

/**
 * The per-request options that change what goes on the wire, on both local
 * lanes against a bespoke server: custom headers reach the requested origin
 * after the declared identity and never a second origin; the mobile identity
 * is sent, declared and honesty-checked like the desktop one.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const received: Array<{ url: string; headers: Record<string, string> }> = []
let server: Server
let other: Server
let origin: string
let otherOrigin: string

function headersOf(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') out[name.toLowerCase()] = value
  return out
}

/** A page that prints the request headers it was fetched with, one `name: value` per line, beside enough prose to be an article. */
function echoPage(req: IncomingMessage, title: string): string {
  const lines = Object.entries(headersOf(req)).filter(([name]) => name !== 'host' && name !== 'connection').map(([name, value]) => `${name}: ${value}`).join('\n')
  return `<!doctype html><html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${PROSE}</p><pre id="headers">${lines}</pre></article><script src="/app.js"></script></body></html>`
}

function handler(label: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    received.push({ url: `${label}${req.url ?? ''}`, headers: headersOf(req) })
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
    if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end('// nothing to run'); return }
    if (req.url === '/echo-headers') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(echoPage(req, 'Echo')); return }
    if (req.url === '/gallery') {
      // Images in the navigation, the article and the head; one inline data: image.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Gallery</title><meta property="og:image" content="/og/card.png"></head><body><nav><a href="/">Home</a><img src="/nav/logo.svg" alt="Logo"></nav><article><h1>Gallery</h1><p>${PROSE}</p><figure><img src="/media/1.jpg" srcset="/media/1-2x.jpg 2x" alt="Plate"><img src="data:image/gif;base64,R0lGOD" alt="Spacer"></figure></article></body></html>`)
      return
    }
    if (req.url === '/tall') {
      // Thirty blocks of 100 CSS pixels: a document far taller than the 800 px viewport.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Tall</title><style>body{margin:0}section{height:100px}</style></head><body><article><h1>Tall</h1><p>${PROSE}</p>${Array.from({ length: 30 }, (_, i) => `<section>block ${i}</section>`).join('')}</article></body></html>`)
      return
    }
    if (req.url === '/moved-away') { res.writeHead(302, { location: `${otherOrigin}/echo-headers` }).end(); return }
    if (req.url === '/moved-here') { res.writeHead(302, { location: '/echo-headers' }).end(); return }
    if (req.url === '/device') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      // A responsive page: without a viewport meta a mobile browser lays a page out at 980 CSS pixels and scales it, as a phone does.
      res.end(`<!doctype html><html><head><title>Device</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><article><h1>Device</h1><p>${PROSE}</p><pre id="device"></pre></article>` +
        '<script>document.getElementById("device").textContent = "ua: " + navigator.userAgent + "\\nwidth: " + innerWidth + "\\ntouch: " + navigator.maxTouchPoints</script></body></html>')
      return
    }
    res.writeHead(404).end()
  }
}

const sentTo = (label: string, path: string) => received.filter((r) => r.url === `${label}${path}`)

beforeAll(async () => {
  server = createServer(handler('a'))
  other = createServer(handler('b'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  // A second loopback origin: the same host on another port.
  otherOrigin = `http://127.0.0.1:${(other.address() as AddressInfo).port}`
})

afterAll(async () => {
  for (const s of [server, other]) await new Promise<void>((resolve) => s.close(() => resolve()))
})

describe('ResilientHttpSubject wire options', () => {
  it('sends custom headers to the requested origin after the unchanged identity, and records them', async () => {
    const subject = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      received.length = 0
      const out = await subject.fetch(`${origin}/echo-headers`, undefined, undefined, {}, undefined, { headers: { 'x-test': 'w2l', 'accept-language': 'de' } })
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('x-test: w2l')
      expect(out.markdown).toContain('accept-language: de')
      expect(out.markdown).toContain(`user-agent: ${browserUserAgent(CHROME_MAJOR_FLOOR)}`)
      const page = sentTo('a', '/echo-headers').at(-1)!
      expect(page.headers).toMatchObject({ 'x-test': 'w2l', 'accept-language': 'de', 'user-agent': browserUserAgent(CHROME_MAJOR_FLOOR), 'sec-ch-ua-mobile': '?0' })
      // robots.txt is fetched with the identity alone.
      expect(sentTo('a', '/robots.txt').at(-1)!.headers).not.toHaveProperty('x-test')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'request_headers_added', detail: { headers: [{ name: 'x-test', value: 'w2l' }, { name: 'accept-language', value: 'de' }] } }))
      expect(out.trace.find((t) => t.event === 'identity_sent')?.detail?.headers).toContainEqual({ name: 'x-test', value: 'w2l' })
      expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
      expect(out.trace.some((t) => t.event === 'custom_headers_withheld')).toBe(false)
    } finally { await subject.teardown() }
  })

  it('withholds custom headers from a cross-origin hop and says so', async () => {
    const subject = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      received.length = 0
      const out = await subject.fetch(`${origin}/moved-away`, undefined, undefined, {}, undefined, { headers: { 'x-test': 'w2l' } })
      expect(out).toMatchObject({ status: 'success', evidence: { finalUrl: `${otherOrigin}/echo-headers`, redirectChain: [`${origin}/moved-away`, `${otherOrigin}/echo-headers`] } })
      expect(sentTo('a', '/moved-away').at(-1)!.headers).toMatchObject({ 'x-test': 'w2l' })
      expect(sentTo('b', '/echo-headers').at(-1)!.headers).not.toHaveProperty('x-test')
      expect(sentTo('b', '/echo-headers').at(-1)!.headers['user-agent']).toBe(browserUserAgent(CHROME_MAJOR_FLOOR))
      expect(out.markdown).not.toContain('x-test')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'custom_headers_withheld', detail: { to: `${otherOrigin}/echo-headers`, names: ['x-test'] } }))
    } finally { await subject.teardown() }
  })

  it('sends the declared mobile identity when asked, evaluates robots.txt against it and records the device', async () => {
    const subject = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      received.length = 0
      const out = await subject.fetch(`${origin}/echo-headers`, undefined, undefined, {}, undefined, { mobile: true })
      expect(out.status).toBe('success')
      const page = sentTo('a', '/echo-headers').at(-1)!
      expect(page.headers['user-agent']).toBe(mobileBrowserUserAgent(CHROME_MAJOR_FLOOR))
      expect(page.headers['user-agent']).toMatch(/Android.*Mobile Safari/)
      expect(page.headers).toMatchObject({ 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"' })
      expect(sentTo('a', '/robots.txt').at(-1)!.headers['user-agent']).toBe(mobileBrowserUserAgent(CHROME_MAJOR_FLOOR))
      expect(out.trace.find((t) => t.event === 'identity_sent')?.detail).toMatchObject({ mode: 'standard', device: 'mobile' })
      expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
      expect(out.trace.find((t) => t.event === 'robots_checked')?.detail).toMatchObject({ decision: 'allowed' })
      // The desktop identity is the default, and says so.
      const desktop = await subject.fetch(`${origin}/echo-headers`)
      expect(desktop.trace.find((t) => t.event === 'identity_sent')?.detail).toMatchObject({ device: 'desktop' })
      expect(sentTo('a', '/echo-headers').at(-1)!.headers['user-agent']).toBe(browserUserAgent(CHROME_MAJOR_FLOOR))
    } finally { await subject.teardown() }
  })

  it('collects images and attributes from the whole page only when asked, with their trace events, and keeps data: images only with removeBase64Images false', async () => {
    const subject = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      const plain = await subject.fetch(`${origin}/gallery`)
      expect(plain.status).toBe('success')
      expect(plain).not.toHaveProperty('images')
      expect(plain).not.toHaveProperty('attributes')
      expect(plain.markdown).toContain('Spacer')
      expect(plain.markdown).not.toContain('data:image')
      expect(plain.trace.some((t) => t.event === 'images_collected' || t.event === 'attributes_extracted')).toBe(false)
      const asked = await subject.fetch(`${origin}/gallery`, undefined, undefined, {}, undefined, { includeImages: true, attributes: [{ selector: 'nav a', attribute: 'href' }, { selector: 'figure img', attribute: 'alt' }], removeBase64Images: false })
      expect(asked.status).toBe('success')
      // The whole page as received, navigation included, absolute and in document order; the data: image is counted and left out.
      expect(asked.images).toEqual([`${origin}/og/card.png`, `${origin}/nav/logo.svg`, `${origin}/media/1.jpg`, `${origin}/media/1-2x.jpg`])
      expect(asked.attributes).toEqual([{ selector: 'nav a', attribute: 'href', values: ['/'] }, { selector: 'figure img', attribute: 'alt', values: ['Plate', 'Spacer'] }])
      expect(asked.trace).toContainEqual(expect.objectContaining({ event: 'images_collected', detail: { count: 4, srcsetCandidates: 1, lazy: 0, dataUrisDropped: 1 } }))
      expect(asked.trace).toContainEqual(expect.objectContaining({ event: 'attributes_extracted', detail: { selectors: 2, counts: [1, 2] } }))
      expect(asked.markdown).toContain('![Spacer](data:image/gif;base64,R0lGOD)')
      expect(asked.usage.contentTokens!).toBeGreaterThan(plain.usage.contentTokens!)
      expect(asked.evidence.rawBodySha256).toBe(plain.evidence.rawBodySha256)
    } finally { await subject.teardown() }
  })
})

describe('BrowserLocalSubject wire options', () => {
  const subject = new BrowserLocalSubject('standard', null, false, localNetworkPolicy())
  afterAll(async () => { await subject.teardown() })

  it('sends custom headers with the document and its same-origin requests, and the compliance record carries them as sent', async () => {
    received.length = 0
    const out = await subject.fetch(`${origin}/echo-headers`, Date.now() + 60_000, undefined, undefined, { headers: { 'x-test': 'w2l', 'accept-language': 'de' } })
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('x-test: w2l')
    expect(sentTo('a', '/echo-headers').at(-1)!.headers).toMatchObject({ 'x-test': 'w2l', 'accept-language': 'de' })
    expect(sentTo('a', '/app.js').at(-1)!.headers).toMatchObject({ 'x-test': 'w2l' })
    expect(sentTo('a', '/robots.txt').at(-1)!.headers).not.toHaveProperty('x-test')
    expect(out.compliance?.sentHeaders.headers).toContainEqual({ name: 'x-test', value: 'w2l' })
    expect(out.compliance?.sentHeaders.headers).toContainEqual({ name: 'accept-language', value: 'de' })
    expect(out.compliance?.sentHeaders.headers.find((h) => h.name === 'user-agent')?.value).toMatch(/Chrome\//)
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'request_headers_added', detail: { headers: [{ name: 'x-test', value: 'w2l' }, { name: 'accept-language', value: 'de' }] } }))
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'identity_declared', detail: { mode: 'standard', device: 'desktop' } }))
    expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    expect(out.trace.some((t) => t.event === 'custom_headers_withheld')).toBe(false)
    // The page's own requests carry the declared client hints too, never the headless shell's own brands.
    const declaredHints = out.compliance!.sentHeaders.headers.find((h) => h.name === 'sec-ch-ua')!.value
    expect(declaredHints).toMatch(/"Google Chrome";v="\d+"/)
    expect(sentTo('a', '/app.js').at(-1)!.headers['sec-ch-ua']).toBe(declaredHints)
    expect(sentTo('a', '/echo-headers').at(-1)!.headers['sec-ch-ua']).toBe(declaredHints)
    expect(JSON.stringify(received)).not.toContain('HeadlessChrome')
  }, 60_000)

  it('withholds custom headers from a server redirect to another origin, where Chromium regenerates its own hints, and says so', async () => {
    received.length = 0
    const out = await subject.fetch(`${origin}/moved-away`, Date.now() + 60_000, undefined, undefined, { headers: { 'x-test': 'w2l' } })
    expect(out).toMatchObject({ status: 'success', evidence: { finalUrl: `${otherOrigin}/echo-headers`, redirectChain: [`${origin}/moved-away`, `${otherOrigin}/echo-headers`] } })
    expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    const hop = sentTo('b', '/echo-headers').at(-1)!.headers
    expect(hop['sec-ch-ua']).toBe(out.compliance!.sentHeaders.headers.find((h) => h.name === 'sec-ch-ua')!.value)
    expect(hop['sec-ch-ua']).not.toContain('HeadlessChrome')
    // The requested origin gets the headers; the origin the redirect led to gets the identity alone, on the
    // document as on its own requests, and the trace and the signed record say so.
    expect(sentTo('a', '/moved-away').at(-1)!.headers).toMatchObject({ 'x-test': 'w2l' })
    expect(hop).not.toHaveProperty('x-test')
    expect(sentTo('b', '/app.js').at(-1)!.headers).not.toHaveProperty('x-test')
    expect(out.markdown).not.toContain('x-test')
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'custom_headers_withheld', detail: { to: `${otherOrigin}/echo-headers`, names: ['x-test'] } }))
    expect(out.trace.some((t) => t.event === 'custom_headers_forwarded')).toBe(false)
    expect(out.compliance!.sentHeaders.headers.some((h) => h.name === 'x-test')).toBe(false)
  }, 60_000)

  it('keeps custom headers on a same-origin redirect hop, and the record carries them as sent', async () => {
    received.length = 0
    const out = await subject.fetch(`${origin}/moved-here`, Date.now() + 60_000, undefined, undefined, { headers: { 'x-test': 'w2l' } })
    expect(out).toMatchObject({ status: 'success', evidence: { finalUrl: `${origin}/echo-headers`, redirectChain: [`${origin}/moved-here`, `${origin}/echo-headers`] } })
    expect(sentTo('a', '/moved-here').at(-1)!.headers).toMatchObject({ 'x-test': 'w2l' })
    expect(sentTo('a', '/echo-headers').at(-1)!.headers).toMatchObject({ 'x-test': 'w2l' })
    expect(out.markdown).toContain('x-test: w2l')
    expect(out.compliance?.sentHeaders.headers).toContainEqual({ name: 'x-test', value: 'w2l' })
    expect(out.trace.some((t) => t.event === 'custom_headers_withheld')).toBe(false)
    expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
  }, 60_000)

  it('collects images and attributes from the rendered DOM when asked, and keeps data: images only with removeBase64Images false', async () => {
    const out = await subject.fetch(`${origin}/gallery`, Date.now() + 60_000, undefined, undefined, { includeImages: true, attributes: [{ selector: 'nav a', attribute: 'href' }], removeBase64Images: false })
    expect(out.status).toBe('success')
    expect(out.images).toEqual([`${origin}/og/card.png`, `${origin}/nav/logo.svg`, `${origin}/media/1.jpg`, `${origin}/media/1-2x.jpg`])
    expect(out.attributes).toEqual([{ selector: 'nav a', attribute: 'href', values: ['/'] }])
    expect(out.trace).toContainEqual(expect.objectContaining({ lane: 'browser_local', event: 'images_collected', detail: expect.objectContaining({ count: 4, dataUrisDropped: 1 }) }))
    expect(out.markdown).toContain('![Spacer](data:image/gif;base64,R0lGOD)')
    const plain = await subject.fetch(`${origin}/gallery`, Date.now() + 60_000)
    expect(plain).not.toHaveProperty('images')
    expect(plain.markdown).not.toContain('data:image')
  }, 60_000)

  it('captures a PNG of the declared 1280x800 viewport when asked, CSS-pixel sized, hashed and traced, and leaves the page and its evidence as they were', async () => {
    const plain = await subject.fetch(`${origin}/gallery`, Date.now() + 60_000)
    const out = await subject.fetch(`${origin}/gallery`, Date.now() + 60_000, undefined, undefined, { screenshot: {} })
    expect(out.status).toBe('success')
    const shot = out.screenshot!
    expect(shot).toMatchObject({ contentType: 'image/png', width: 1280, height: 800, fullPage: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, quality: null, path: null })
    const bytes = Buffer.from(shot.base64, 'base64')
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // The IHDR chunk says the image is viewport-sized in CSS pixels, not device pixels.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1280, 800])
    expect(shot.bytes).toBe(bytes.length)
    expect(shot.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(out.trace).toContainEqual(expect.objectContaining({ lane: 'browser_local', event: 'screenshot_captured', detail: expect.objectContaining({ fullPage: false, viewport: { width: 1280, height: 800 }, scale: 'css', deviceScaleFactor: 2, contentType: 'image/png', quality: null, width: 1280, height: 800, bytes: bytes.length, sha256: shot.sha256 }) }))
    expect(out.trace.some((t) => t.event === 'screenshot_viewport' || t.event === 'screenshot_failed')).toBe(false)
    expect(out).not.toHaveProperty('warnings')
    expect(out.markdown).toBe(plain.markdown)
    expect(out.evidence.rawBodySha256).toBe(plain.evidence.rawBodySha256)
    expect(out.evidence.artifacts).toEqual([])
    expect(plain).not.toHaveProperty('screenshot')
  }, 60_000)

  it('captures a JPEG at the quality asked for, and attaches the capture to an error page kept as evidence', async () => {
    const out = await subject.fetch(`${origin}/gallery`, Date.now() + 60_000, undefined, undefined, { screenshot: { quality: 60 } })
    expect(out.status).toBe('success')
    expect(out.screenshot).toMatchObject({ contentType: 'image/jpeg', quality: 60, width: 1280, height: 800, fullPage: false })
    expect([...Buffer.from(out.screenshot!.base64, 'base64').subarray(0, 2)]).toEqual([0xff, 0xd8])
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'screenshot_captured', detail: expect.objectContaining({ contentType: 'image/jpeg', quality: 60 }) }))
    const missing = await subject.fetch(`${origin}/missing`, Date.now() + 60_000, undefined, undefined, { screenshot: {} })
    expect(missing).toMatchObject({ status: 'failed', failureReason: 'http_error', screenshot: { contentType: 'image/png', width: 1280, height: 800 } })
  }, 60_000)

  it('lays the page out in the viewport asked for, a window within the declared screen, records it, and keeps the declared identity and the content', async () => {
    const out = await subject.fetch(`${origin}/device`, Date.now() + 60_000, undefined, undefined, { screenshot: { viewport: { width: 800, height: 600 } } })
    expect(out.status).toBe('success')
    expect(out.screenshot).toMatchObject({ width: 800, height: 600, viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 })
    const bytes = Buffer.from(out.screenshot!.base64, 'base64')
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([800, 600])
    // The page sees the window; the identity it sees, and the one on the wire, stay the declared desktop one.
    expect(out.markdown).toContain('width: 800')
    expect(out.markdown).toMatch(/ua: Mozilla\/5\.0 \(Macintosh/)
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'screenshot_viewport', detail: { requested: { width: 800, height: 600 }, viewport: { width: 800, height: 600 }, declared: { width: 1280, height: 800 }, screen: { width: 1920, height: 1080 }, deviceScaleFactor: 2 } }))
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'identity_declared', detail: { mode: 'standard', device: 'desktop' } }))
    expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    // The lane declares the Chromium it runs, so the version is the real one, not the floor.
    expect(out.compliance?.sentHeaders.headers.find((h) => h.name === 'user-agent')?.value).toMatch(/^Mozilla\/5\.0 \(Macintosh; Intel Mac OS X 10_15_7\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/)
    const gallery = await subject.fetch(`${origin}/gallery`, Date.now() + 60_000, undefined, undefined, { screenshot: { viewport: { width: 800, height: 600 } } })
    const plain = await subject.fetch(`${origin}/gallery`, Date.now() + 60_000)
    expect(gallery.markdown).toBe(plain.markdown)
  }, 60_000)

  it('captures the whole document with fullPage, the viewport\'s width and the document\'s height, and writes it under W2L_CAPTURE_RAW_DIR when set', async () => {
    const previous = process.env.W2L_CAPTURE_RAW_DIR
    const root = await mkdtemp(join(tmpdir(), 'w2l-shot-'))
    process.env.W2L_CAPTURE_RAW_DIR = root
    try {
      const out = await subject.fetch(`${origin}/tall`, Date.now() + 60_000, undefined, undefined, { screenshot: { fullPage: true } })
      expect(out.status).toBe('success')
      const shot = out.screenshot!
      expect(shot).toMatchObject({ contentType: 'image/png', fullPage: true, width: 1280, viewport: { width: 1280, height: 800 } })
      expect(shot.height).toBeGreaterThanOrEqual(3000)
      const bytes = Buffer.from(shot.base64, 'base64')
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1280, shot.height])
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'screenshot_captured', detail: expect.objectContaining({ fullPage: true, width: 1280, height: shot.height, path: join(root, `${shot.sha256}.png`) }) }))
      // The image is saved beside the raw HTML, named by its hash, and listed with it.
      expect(shot.path).toBe(join(root, `${shot.sha256}.png`))
      expect(out.evidence.artifacts.map((path) => basename(path))).toEqual([`${out.evidence.rawBodySha256}.html`, `${shot.sha256}.png`])
    } finally {
      if (previous === undefined) delete process.env.W2L_CAPTURE_RAW_DIR
      else process.env.W2L_CAPTURE_RAW_DIR = previous
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('declares the mobile identity, which the page sees as Android with a phone viewport and touch', async () => {
    const out = await subject.fetch(`${origin}/device`, Date.now() + 60_000, undefined, undefined, { mobile: true })
    expect(out.status).toBe('success')
    expect(out.markdown).toMatch(/ua: Mozilla\/5\.0 \(Linux; Android 14; Pixel 7\).*Mobile Safari/)
    expect(out.markdown).toContain('width: 412')
    expect(out.markdown).toMatch(/touch: [1-9]/)
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'identity_declared', detail: { mode: 'standard', device: 'mobile' } }))
    expect(out.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    expect(out.compliance?.sentHeaders.headers.find((h) => h.name === 'user-agent')?.value).toMatch(/Android 14; Pixel 7.*Mobile Safari/)
    expect(out.compliance?.sentHeaders.headers).toContainEqual({ name: 'sec-ch-ua-mobile', value: '?1' })
    expect(out.compliance?.sentHeaders.headers).toContainEqual({ name: 'sec-ch-ua-platform', value: '"Android"' })
  }, 60_000)
})
