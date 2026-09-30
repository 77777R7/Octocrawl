import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

/**
 * Per-request page handling and response metadata on both lanes: an error
 * page keeps its content beside the status, a redirect is recorded hop by
 * hop with the real content type, `waitFor` reads the DOM after a timer the
 * settle heuristics cannot see, and `onlyMainContent: false` keeps the page
 * chrome a reader would save.
 */

const PAGE = (body: string, head = '') =>
  `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>  Harbour   ledger </title>${head}</head><body>${body}</body></html>`

const NAV = '<nav><a href="/">Home</a> <a href="/about">About the ledger office</a></nav>'
const FOOTER = '<footer><p>Published by the harbour office. All readings are public records.</p></footer>'
const ARTICLE =
  '<main><article><h1>Harbour ledger</h1>' +
  '<p>The harbour office logged every kiln reading in a bound ledger that survived the flood of 1873.</p>' +
  '<p>Each entry names the observer, the instrument and the hour, so a later reader can trace a figure to its source.</p>' +
  '<p>The ledger was digitised page by page and the scans are kept beside the transcription.</p></article></main>'

let server: Server
let base: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const html = (status: number, body: string, head = '') => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE(body, head))
    }
    switch (req.url) {
      case '/robots.txt':
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('User-agent: *\nDisallow:\n')
        return
      case '/page':
        html(200, NAV + ARTICLE + FOOTER, '<meta name="description" content="Readings from the harbour office ledger."><link rel="canonical" href="/page"><link rel="icon" href="/static/ledger.ico">')
        return
      case '/accepted':
        html(203, ARTICLE)
        return
      case '/missing':
        html(404, '<main><h1>Page removed</h1><p>The ledger volume you asked for was withdrawn from the shelf in 1912 after the fire inspection, and the office keeps no copy.</p><p>Ask at the reading room desk for the surviving index cards, which list every entry by observer and hour.</p></main>')
        return
      case '/moved':
        res.writeHead(302, { location: '/page' })
        res.end()
        return
      case '/late':
        html(200, '<main><article><h1>Late readings</h1><p>The page opens with the previous month until the current readings arrive from the field office.</p>' +
          '<div id="slot"></div></article></main><script>setTimeout(function () { document.getElementById("slot").innerHTML = "<p>Current reading: 1240 degrees at the ravine gauge.</p>" }, 2000)</script>')
        return
      default:
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('nothing here')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('http lane', () => {
  const subject = new ResilientHttpSubject()
  afterAll(async () => { await subject.teardown() })

  it('reads the page metadata from the head and resolves its links', async () => {
    const out = await subject.fetch(`${base}/page`)
    expect(out.status).toBe('success')
    expect(out.document?.metadata).toEqual({
      title: 'Harbour ledger',
      description: 'Readings from the harbour office ledger.',
      language: 'en-GB',
      keywords: null,
      robots: null,
      canonical: `${base}/page`,
      favicon: `${base}/static/ledger.ico`,
    })
    expect(out.evidence.contentType).toBe('text/html; charset=utf-8')
  })

  it('keeps the navigation and footer only when the whole page is asked for', async () => {
    const main = await subject.fetch(`${base}/page`)
    expect(main.markdown).not.toContain('About the ledger office')
    expect(main.markdown).not.toContain('Published by the harbour office')
    const whole = await subject.fetch(`${base}/page`, undefined, undefined, {}, undefined, { onlyMainContent: false })
    expect(whole.status).toBe('success')
    expect(whole.markdown).toContain('About the ledger office')
    expect(whole.markdown).toContain('Published by the harbour office')
    expect(whole.markdown).toContain('bound ledger that survived the flood')
    expect(whole.document?.confidence).toBe(main.document?.confidence)
  })

  it('returns an error page as evidence beside its status, not as nothing', async () => {
    const out = await subject.fetch(`${base}/missing`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('http_error')
    expect(out.evidence.httpStatus).toBe(404)
    expect(out.markdown).toContain('withdrawn from the shelf in 1912')
    expect(out.warnings?.map((w) => w.code)).toEqual(['http_error'])
    expect(out.document?.metadata?.title).toBe('Harbour ledger')
  })

  it('treats every 2xx as a served page', async () => {
    const out = await subject.fetch(`${base}/accepted`)
    expect(out.status).toBe('success')
    expect(out.evidence.httpStatus).toBe(203)
    expect(out.markdown).toContain('bound ledger')
  })
})

describe('browser lane', () => {
  const subject = new BrowserLocalSubject('standard')
  afterAll(async () => { await subject.teardown() })

  it('records the real redirect chain and content type of the navigation', async () => {
    const out = await subject.fetch(`${base}/moved`)
    expect(out.status).toBe('success')
    expect(out.evidence.finalUrl).toBe(`${base}/page`)
    expect(out.evidence.redirectChain).toEqual([`${base}/moved`, `${base}/page`])
    expect(out.evidence.contentType).toBe('text/html; charset=utf-8')
    expect(out.document?.metadata?.canonical).toBe(`${base}/page`)
  }, 30_000)

  it('waits the requested time after settling before reading the DOM', async () => {
    const early = await subject.fetch(`${base}/late`)
    expect(early.status).toBe('success')
    expect(early.trace.some((t) => t.event === 'wait_for')).toBe(false)
    const waited = await subject.fetch(`${base}/late`, undefined, undefined, undefined, { waitForMs: 3_000 })
    expect(waited.status).toBe('success')
    expect(waited.markdown).toContain('Current reading: 1240 degrees')
    expect(waited.trace.find((t) => t.event === 'wait_for')?.detail).toEqual({ waitMs: 3_000 })
  }, 60_000)

  it('returns an error page as evidence and the whole page on request', async () => {
    const missing = await subject.fetch(`${base}/missing`)
    expect(missing.status).toBe('failed')
    expect(missing.failureReason).toBe('http_error')
    expect(missing.evidence.httpStatus).toBe(404)
    expect(missing.markdown).toContain('withdrawn from the shelf in 1912')
    expect(missing.warnings?.map((w) => w.code)).toEqual(['http_error'])
    const whole = await subject.fetch(`${base}/page`, undefined, undefined, undefined, { onlyMainContent: false })
    expect(whole.markdown).toContain('About the ledger office')
    expect(whole.markdown).toContain('Published by the harbour office')
  }, 60_000)
})
