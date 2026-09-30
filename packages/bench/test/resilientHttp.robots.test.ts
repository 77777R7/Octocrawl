import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy, type RobotsOverrideApplied } from '@w2l/contracts'
import { ALL_BOILERPLATE, NAV_MARKER, startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { buildChannels } from '../src/ladderCli.js'
import { LadderRunner } from '../src/routing/ladder.js'
import { MemoryRoutingHistory } from '../src/routing/vendorRouter.js'
import { LadderScrapeAtom } from '../src/scrapeAtom.js'

let robotsServer: Server
let robotsUrl: string
let privateHits = 0

beforeAll(async () => {
  privateHits = 0
  robotsServer = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('User-agent: *\nDisallow: /private\nAllow: /private/ok\n')
      return
    }
    if (req.url?.startsWith('/private')) {
      privateHits++
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><body><article><h1>Private area</h1>' +
          '<p>This page sits under the /private prefix that robots.txt disallows, and it is served ' +
          'normally by the origin so that the only thing capable of preventing a fetch is the ' +
          'crawler honouring the rules it claims to honour.</p>' +
          '<p>The more specific Allow rule beneath the same prefix is what distinguishes a correct ' +
          'longest-match implementation from one that simply refuses the whole subtree.</p></article></body></html>',
      )
      return
    }
    if (req.url === '/redirect-metadata') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end()
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => robotsServer.listen(0, '127.0.0.1', resolve))
  const addr = robotsServer.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  robotsUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => robotsServer.close(() => resolve()))
})

describe('ResilientHttpSubject robots', () => {
  it('never applies a local platform exception to another host', async () => {
    const subject = new ResilientHttpSubject('standard', undefined, undefined, 'http://127.0.0.1:7890', true)
    try {
      await expect(subject.fetch('https://example.com/')).rejects.toThrow('limited to fixed platform hosts')
    } finally { await subject.teardown() }
  })

  it('never fetches the page when robots.txt responds 503, and says robots.txt was unreachable', async () => {
    let pageHits = 0
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') res.writeHead(503).end('temporarily unavailable')
      else { pageHits++; res.writeHead(200).end('<html><body>Must not fetch</body></html>') }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    const subject = new ResilientHttpSubject()
    try {
      const out = await subject.fetch(`http://127.0.0.1:${address.port}/page`)
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('policy_denied')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_checked', detail: expect.objectContaining({ decision: 'disallowed', unreachable: 'server_error', ruleCount: 0 }) }))
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_disallowed', detail: expect.objectContaining({ unreachable: 'server_error', appliedRules: [] }) }))
      expect(pageHits).toBe(0)
    } finally {
      await subject.teardown()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('never fetches the page when robots.txt never answers, and records the timeout', async () => {
    // RFC 9309 §2.3.1.4: an unreachable robots.txt is a complete disallow.
    let pageHits = 0
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') return // never answers
      pageHits++
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><body><article><h1>Slow robots</h1><p>The origin serves this page normally, but its robots.txt never answers within the lookup deadline.</p></article></body></html>')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    const subject = new ResilientHttpSubject('standard', { ...localNetworkPolicy(), robotsTimeoutMs: 100 })
    try {
      const out = await subject.fetch(`http://127.0.0.1:${address.port}/page`)
      expect(out).toMatchObject({ status: 'failed', failureReason: 'policy_denied', markdown: null })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_checked', detail: expect.objectContaining({ decision: 'disallowed', unreachable: 'timeout' }) }))
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_disallowed', detail: expect.objectContaining({ unreachable: 'timeout' }) }))
      expect(pageHits).toBe(0)
    } finally {
      await subject.teardown()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('refuses a robots-disallowed path and never hits the origin', async () => {
    const subject = new ResilientHttpSubject()
    const before = privateHits
    const out = await subject.fetch(`${robotsUrl}/private/secret`)
    expect(privateHits).toBe(before)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('policy_denied')
    expect(out.markdown).toBeNull()
    const disallowed = out.trace.find((t) => t.event === 'robots_disallowed')
    expect(disallowed?.detail).toMatchObject({ appliedRules: [{ pattern: '/private', allow: false }] })
    // A rule the publisher wrote, not an unreachable robots.txt.
    expect(disallowed?.detail).not.toHaveProperty('unreachable')
  })

  it('fetches a disallowed path under a recorded override and says so in the trace and the warnings', async () => {
    const subject = new ResilientHttpSubject()
    const before = privateHits
    try {
      const heard: Array<{ applied: RobotsOverrideApplied; pageHits: number }> = []
      const out = await subject.fetch(`${robotsUrl}/private/secret`, undefined, undefined, {}, undefined, {
        robotsOverride: { reason: 'The publisher links this report from its own site; the host rule addresses crawlers.', recordedBy: 'test researcher' },
      }, (applied) => heard.push({ applied, pageHits: privateHits }))
      expect(privateHits).toBe(before + 1)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Private area')
      // robots.txt was still read and its verdict recorded; the override follows it.
      expect(out.trace.find((t) => t.event === 'robots_checked')?.detail).toMatchObject({ decision: 'disallowed' })
      const events = out.trace.map((t) => t.event)
      expect(events.indexOf('robots_disallowed')).toBeGreaterThan(events.indexOf('robots_checked'))
      expect(events.indexOf('robots_overridden')).toBe(events.indexOf('robots_disallowed') + 1)
      expect(out.trace.find((t) => t.event === 'robots_overridden')?.detail).toEqual({
        url: `${robotsUrl}/private/secret`,
        appliedRules: [{ pattern: '/private', allow: false }],
        reason: 'The publisher links this report from its own site; the host rule addresses crawlers.',
        recordedBy: 'test researcher',
      })
      expect(out.warnings).toEqual([{
        code: 'robots_overridden',
        message: `${robotsUrl}/robots.txt disallows this URL (rule /private); it was fetched under an override recorded by test researcher: The publisher links this report from its own site; the host rule addresses crawlers.`,
      }])
      // The lane said so before its request went out, so a run the deadline cuts short still has the override.
      expect(heard).toEqual([{ applied: { trace: out.trace.filter((t) => t.event.startsWith('robots_')), warning: out.warnings![0] }, pageHits: before }])
      expect(heard[0]!.applied.trace.map((t) => t.event)).toEqual(['robots_checked', 'robots_disallowed', 'robots_overridden'])
    } finally {
      await subject.teardown()
    }
  })

  it('leaves an allowed path untouched by an override: no override event, no warning', async () => {
    const subject = new ResilientHttpSubject()
    try {
      const heard: RobotsOverrideApplied[] = []
      const out = await subject.fetch(`${robotsUrl}/private/ok`, undefined, undefined, {}, undefined, { robotsOverride: { reason: 'not needed here' } }, (applied) => heard.push(applied))
      expect(out.status).toBe('success')
      expect(out.trace.some((t) => t.event === 'robots_overridden')).toBe(false)
      expect(out.warnings).toBeUndefined()
      expect(heard).toEqual([])
    } finally {
      await subject.teardown()
    }
  })

  it('does not set an unreachable robots.txt aside, override or not', async () => {
    let pageHits = 0
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') res.writeHead(503).end('temporarily unavailable')
      else { pageHits++; res.writeHead(200).end('<html><body>Must not fetch</body></html>') }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    const subject = new ResilientHttpSubject()
    try {
      const out = await subject.fetch(`http://127.0.0.1:${address.port}/page`, undefined, undefined, {}, undefined, { robotsOverride: { reason: 'a rule I know of' } })
      expect(out).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_disallowed', detail: expect.objectContaining({ unreachable: 'server_error' }) }))
      expect(out.trace.some((t) => t.event === 'robots_overridden')).toBe(false)
      expect(out.warnings).toBeUndefined()
      expect(pageHits).toBe(0)
    } finally {
      await subject.teardown()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('honours a more-specific Allow beneath a Disallow', async () => {
    const subject = new ResilientHttpSubject()
    const out = await subject.fetch(`${robotsUrl}/private/ok`)
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('Private area')
  })

  it('reports robots.txt Crawl-delay on robots_checked, and the scrape atom hands it to the crawl', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nCrawl-delay: 2.5\nDisallow: /private\n')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><body><article><h1>Polite page</h1><p>This origin asks crawlers to wait two and a half seconds between requests, and the HTTP lane must pass that request on to the crawl frontier instead of dropping it.</p><p>The page itself is ordinary prose, long enough for the extraction cascade to accept it as the main content of an article.</p></article></body></html>')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    const url = `http://127.0.0.1:${address.port}/page`
    const subject = new ResilientHttpSubject()
    const channels = buildChannels('standard', { localSubjects: { browser_local: { fetch: async () => { throw new Error('HTTP only: the browser arm was reached') } } } })
    try {
      const out = await subject.fetch(url)
      expect(out.status).toBe('success')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_checked', detail: expect.objectContaining({ decision: 'allowed', crawlDelayMs: 2500 }) }))
      const atom = new LadderScrapeAtom(new LadderRunner(channels, { mode: 'standard' }, new MemoryRoutingHistory()))
      expect((await atom.scrape(url)).crawlDelayMs).toBe(2500)
    } finally {
      await subject.teardown()
      await Promise.all(channels.map(channel => channel.close?.().catch(() => {})))
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('rejects a redirect to metadata before any follow-up request', async () => {
    const subject = new ResilientHttpSubject()
    const out = await subject.fetch(`${robotsUrl}/redirect-metadata`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('policy_denied')
    expect(out.usage.requestCount).toBe(1)
    expect(out.trace.some(event => event.event === 'ssrf_denied')).toBe(true)
  })
})

describe('ResilientHttpSubject listing links', () => {
  let fixtures: FixtureServer

  beforeAll(async () => {
    fixtures = await startFixtureServer()
  })

  afterAll(async () => {
    await fixtures.close()
  })

  it('puts listing and nav hrefs on the scrape result without leaking chrome into markdown', async () => {
    const subject = new ResilientHttpSubject()
    const out = await subject.fetch(`${fixtures.url}/pt/listing`)
    expect(out.status).toBe('success')
    expect(out.links).toContain(`${fixtures.url}/pt/item/1`)
    expect(out.links).toContain(`${fixtures.url}/pt/item/4`)
    expect(out.links).toContain(`${fixtures.url}/`)
    expect(out.links).toContain(`${fixtures.url}/pricing`)
    expect(out.markdown).toContain('Bespoke teapot catalog 01')
    expect(out.markdown).not.toContain(NAV_MARKER)
    for (const marker of ALL_BOILERPLATE) {
      expect(out.markdown).not.toContain(marker)
    }
    expect(JSON.stringify(out)).not.toMatch(/"html":/)
    expect(out).not.toHaveProperty('html')
  })
})
