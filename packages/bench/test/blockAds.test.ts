import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { AD_HOSTS, isAdHost } from '../src/subjects/adHosts.js'

/**
 * `blockAds` on the local browser lane, with a loopback stand-in for an
 * ad-serving host (the `adHosts` seam): by default the browser never
 * connects to it and the ad container is pruned; with `blockAds: false` both
 * requests arrive and the container stays in the Markdown.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const adHits: string[] = []
let pages: Server
let ads: Server
let origin: string
let adOrigin: string

beforeAll(async () => {
  // The ad host listens on every interface so Chromium reaches it however it resolves `localhost`.
  ads = createServer((req, res) => {
    adHits.push(req.url ?? '')
    if (req.url === '/ad.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end('// an ad script')
    else res.writeHead(200, { 'content-type': 'image/gif' }).end(Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b', 'hex'))
  })
  await new Promise<void>((resolve) => ads.listen(0, resolve))
  adOrigin = `http://localhost:${(ads.address() as AddressInfo).port}`
  pages = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
    if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><head><title>Report</title></head><body><article><h1>Harbour report</h1><p>${PROSE}</p>` +
        `<div class="ad"><p>Advertisement</p></div><p>${PROSE}</p></article>` +
        `<script src="${adOrigin}/ad.js"></script><img src="${adOrigin}/ad.gif" alt=""></body></html>`)
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => pages.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(pages.address() as AddressInfo).port}`
})

afterAll(async () => {
  for (const s of [pages, ads]) await new Promise<void>((resolve) => s.close(() => resolve()))
})

describe('the ad-host list', () => {
  it('matches a listed host and its subdomains, and nothing else', () => {
    expect(AD_HOSTS.length).toBeGreaterThanOrEqual(50)
    expect(isAdHost('doubleclick.net')).toBe(true)
    expect(isAdHost('ad.doubleclick.net')).toBe(true)
    expect(isAdHost('pagead2.googlesyndication.com')).toBe(true)
    expect(isAdHost('notdoubleclick.net')).toBe(false)
    expect(isAdHost('example.com')).toBe(false)
    expect(isAdHost('localhost', ['localhost'])).toBe(true)
  })
})

describe('blockAds on the local browser lane', () => {
  const subject = new BrowserLocalSubject('standard', null, false, localNetworkPolicy(), null, undefined, null, undefined, undefined, null, false, ['localhost'])
  afterAll(async () => { await subject.teardown() })

  it('aborts requests to listed ad hosts before any connection and prunes ad containers, by default', async () => {
    adHits.length = 0
    const out = await subject.fetch(`${origin}/page`, Date.now() + 60_000)
    expect(out.status).toBe('success')
    expect(adHits).toEqual([])
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'ads_blocked', detail: { count: 2, hosts: ['localhost'] } }))
    expect(out.markdown).toContain('Harbour report')
    expect(out.markdown).not.toContain('Advertisement')
  }, 60_000)

  it('loads and keeps them with blockAds: false', async () => {
    adHits.length = 0
    const out = await subject.fetch(`${origin}/page`, Date.now() + 60_000, undefined, undefined, { blockAds: false })
    expect(out.status).toBe('success')
    expect([...adHits].sort()).toEqual(['/ad.gif', '/ad.js'])
    expect(out.trace.some((t) => t.event === 'ads_blocked')).toBe(false)
    expect(out.markdown).toContain('Harbour report')
    expect(out.markdown).toContain('Advertisement')
  }, 60_000)
})
