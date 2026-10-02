import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { browserClientHints, CHROME_MAJOR_FLOOR, modeIdentity, PREVIEW_PRODUCT_TOKEN } from '@w2l/contracts'
import { capturePreview, mapPreviewResult } from '../src/preview.js'

/**
 * The preview names itself to the sites it reads. capturePreview runs as
 * deployed, except that the hosted policy's private-address rule admits the
 * loopback fixture below; nothing else about the channels changes.
 */
vi.mock('@w2l/bench', async (importOriginal) => {
  const bench = await importOriginal<typeof import('@w2l/bench')>()
  return {
    ...bench,
    buildChannels: (mode: Parameters<typeof bench.buildChannels>[0], opts: NonNullable<Parameters<typeof bench.buildChannels>[1]> = {}) =>
      bench.buildChannels(mode, { ...opts, networkPolicy: { ...opts.networkPolicy!, privateAllowlist: ['127.0.0.0/8'] } }),
  }
})

const PREVIEW_UA = `${modeIdentity('standard').userAgent} ${PREVIEW_PRODUCT_TOKEN}`
const ARTICLE = '<!doctype html><html><head><title>Tide report</title></head><body><main><article><h1>Tide report</h1><p>' +
  'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(4) +
  '</p></article></main></body></html>'

let server: Server
let origin: string
let robots = ''
let requests: { path: string; userAgent: string | undefined; secChUa: string | undefined }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push({ path: req.url ?? '', userAgent: req.headers['user-agent'], secChUa: req.headers['sec-ch-ua'] as string | undefined })
    if (req.url === '/robots.txt') res.writeHead(200, { 'content-type': 'text/plain' }).end(robots)
    else if (req.url === '/page') res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE)
    else res.writeHead(404).end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

beforeEach(() => { requests = [] })

const capture = (path: string) => {
  const url = { url: `${origin}${path}`, amazonAsin: null }
  return capturePreview(url, new AbortController().signal, Date.now() + 20_000).then(outcome => ({ outcome, response: mapPreviewResult(url.url, url, outcome, 0) }))
}

describe('the public preview identifies itself as W2L', () => {
  it('sends its product token when it reads robots.txt and the page, and records the User-Agent it sent', async () => {
    robots = 'User-agent: *\nAllow: /\n'
    const { outcome, response } = await capture('/page')
    expect(response.status).toBe('success')
    expect(requests.map(request => request.path)).toEqual(['/robots.txt', '/page'])
    for (const request of requests) expect(request.userAgent).toBe(PREVIEW_UA)
    // The client hints still describe the Chrome that sends the request.
    expect(requests.find(request => request.path === '/page')?.secChUa).toBe(browserClientHints(CHROME_MAJOR_FLOOR)['sec-ch-ua'])
    const sent = outcome.result.trace.find(event => event.event === 'identity_sent')?.detail?.headers as { name: string; value: string }[]
    expect(sent).toContainEqual({ name: 'user-agent', value: PREVIEW_UA })
    expect(outcome.result.trace.some(event => event.event === 'identity_mismatch')).toBe(false)
  })

  it('stops at a robots.txt group for w2l-preview that the wildcard group would allow', async () => {
    robots = 'User-agent: *\nAllow: /\n\nUser-agent: w2l-preview\nDisallow: /\n'
    const { outcome, response } = await capture('/page')
    expect(response).toMatchObject({ status: 'blocked', diagnostic: { code: 'robots_disallowed', evidence: 'observed' } })
    expect(outcome.result.trace.find(event => event.event === 'robots_checked')?.detail).toMatchObject({ decision: 'disallowed', matchedGroup: 'w2l-preview' })
    expect(requests.map(request => request.path)).toEqual(['/robots.txt'])
  })
})
