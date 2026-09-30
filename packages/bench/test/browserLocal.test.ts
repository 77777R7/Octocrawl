import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { AccessConfigError, sha256Utf8, verifyLedger } from '@w2l/http-core'
import { BrowserLocalSubject, closePage } from '../src/subjects/browserLocal.js'

/**
 * Browser-local transport behaviour against a bespoke server:
 * the full fixture suite already scores the SPA and timeout cases in the
 * bench; these two tests pin the subject's own semantics without the
 * fixture suite's 60s runner races.
 */

let server: Server
let url: string
let flakyHits = 0
let robotsHits = 0
let privateHits = 0

beforeAll(async () => {
  flakyHits = 0
  robotsHits = 0
  privateHits = 0
  server = createServer((req, res) => {
    if (req.url === '/spa') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><body><div id="root"></div><script>' +
          'document.getElementById("root").innerHTML = "<article><h1>Rendered</h1><p>Loaded after script execution.</p></article>"' +
          '</script></body></html>',
      )
    } else if (req.url === '/flaky') {
      flakyHits++
      if (flakyHits === 1) {
        res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><html><body><h1>Service Unavailable</h1></body></html>')
      } else {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          '<!doctype html><html><body><article><h1>Recovered</h1><p>Succeeded on the second attempt.</p></article></body></html>',
        )
      }
    } else if (req.url === '/delayed') {
      // Part of the article is in the HTML; the rest arrives two seconds after load.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><body><article><h1>Delayed report</h1><p>The opening paragraph is in the HTML the server sends, ' +
          'so it is on the page from the first render onwards and any capture contains it.</p><div id="late"></div></article>' +
          '<script>setTimeout(function () { document.getElementById("late").innerHTML = "<p>The late paragraph arrives two seconds after load.</p>" }, 2000)</script>' +
          '</body></html>',
      )
    } else if (req.url === '/chrome') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><head><title>Chrome page</title><style>p { color: black }</style></head><body>' +
          '<header><a href="/">Site header link</a></header><nav><a href="/a">Navigation entry</a></nav>' +
          '<main><article><h1>Main story</h1><p>The main story is long enough for the extraction cascade to select it as the ' +
          'content of the page, while the header, the navigation and the footer around it are page chrome.</p></article></main>' +
          '<footer><p>Footer notice text</p></footer><script>document.title = "script text never shows"</script></body></html>',
      )
    } else if (req.url === '/css-layout') {
      // S05 and S09 in miniature: the page's CSS, not its tags, puts the quote
      // and its author on separate lines and hides two of three platform names.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><head><style>.quote span.text { display: block } .platform-linux, .platform-windows { display: none }</style></head>' +
          '<body><main><script>document.write("<div class=\'quote\'><span class=\'text\'>“The world as we have created it is a process of our thinking.”</span>' +
          '<span>by <small>Albert Einstein</small></span></div>")</script><ol><li><p>Open <span class="platform-mac">Terminal</span>' +
          '<span class="platform-linux">Terminal</span><span class="platform-windows">Git Bash</span>.</p></li><li><p>Set a Git username.</p></li></ol>' +
          '</main></body></html>',
      )
    } else if (req.url === '/hop/1' || req.url === '/hop/2') {
      // Two server redirects before the page: every hop is a request Chromium makes.
      res.writeHead(req.url === '/hop/1' ? 302 : 301, { location: req.url === '/hop/1' ? '/hop/2' : '/landing' })
      res.end()
    } else if (req.url === '/landing') {
      res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' })
      res.end('<!doctype html><html><body><article><h1>Landing</h1><p>The page two redirects lead to, served with a content type the evidence must repeat as sent.</p></article></body></html>')
    } else if (req.url?.startsWith('/client/')) {
      // Pages that move on by themselves after they answered: a script, a meta
      // refresh or the history API. /client/gone and /client/spa-missing answer 404.
      const article = (title: string) => `<article><h1>${title}</h1><p>The page the browser shows at the end, long enough for the extraction cascade to select it as the content of the page.</p></article>`
      const pages: Record<string, [number, string, string]> = {
        '/client/replace': [200, 'text/html; charset=utf-8', '<p>Leaving for the next page.</p><script>location.replace("/client/gone")</script>'],
        '/client/gone': [404, 'text/html; charset=iso-8859-1', '<main><h1>Page not found</h1><p>The page you asked for is not on this server.</p></main>'],
        '/client/onward': [200, 'text/html; charset=utf-8', '<p>Moving on.</p><script>location.replace("/landing")</script>'],
        '/client/meta': [200, 'text/html; charset=utf-8', '<meta http-equiv="refresh" content="0;url=/landing"><p>Moving on.</p>'],
        '/client/push': [200, 'text/html; charset=utf-8', `${article('Pushed')}<p><a href="detail">Detail</a></p><script>history.pushState(null, "", "/client/sub/pushed")</script>`],
        '/client/fragment': [200, 'text/html; charset=utf-8', `${article('Fragment')}<script>location.hash = "part"</script>`],
        '/client/spa-missing': [404, 'text/html; charset=utf-8', `${article('Home')}<script>history.replaceState(null, "", "/client/home")</script>`],
        '/client/to-gate': [200, 'text/html; charset=utf-8', '<p>Checking.</p><script>location.replace("/gate")</script>'],
        '/client/refresh-loop': [200, 'text/html; charset=utf-8', `<meta http-equiv="refresh" content="0">${article('Again')}`],
      }
      const page = pages[req.url]
      if (req.url === '/client/hop') res.writeHead(302, { location: '/client/onward' }).end()
      else if (req.url === '/client/loop/a' || req.url === '/client/loop/b') res.writeHead(302, { location: req.url.endsWith('a') ? '/client/loop/b' : '/client/loop/a' }).end()
      else if (page === undefined) res.writeHead(404).end()
      else res.writeHead(page[0], { 'content-type': page[1] }).end(`<!doctype html><html><body>${page[2]}</body></html>`)
    } else if (req.url === '/nav-only') {
      // Navigation and a footer, no main block: the extractor finds no content.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><head><title>Harbour office</title></head><body><header><a href="/">Harbour office</a></header>' +
          '<nav><ul><li><a href="/tides">Tide tables</a></li><li><a href="/weather">Weather</a></li></ul></nav>' +
          '<footer><p>Published by the harbour office</p></footer></body></html>',
      )
    } else if (req.url === '/hang') {
      // Never respond; the subject's own timeout must fire and map to `timeout`.
    } else if (req.url === '/gate') {
      res.writeHead(403, {
        'content-type': 'text/html; charset=utf-8',
        'cf-mitigated': 'challenge',
      })
      res.end(
        '<!doctype html><html><head><title>Just a moment...</title></head><body>' +
          '<h1>Just a moment...</h1><p>Enable JavaScript and cookies to continue.</p></body></html>',
      )
    } else if (req.url === '/plain-403') {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><body><h1>403 Forbidden</h1></body></html>')
    } else if (req.url === '/created') {
      res.writeHead(201, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><body><article><h1>Created</h1><p>A 201 page with a full document is judged from its content in the browser lane too.</p></article></body></html>')
    } else if (req.url === '/echo-cookie') {
      // Echoes the Cookie header back as page content, so a test can prove the
      // inherited session really went on the wire rather than just being
      // recorded as if it had.
      const cookie = req.headers.cookie ?? '(none)'
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><body><article><h1>Cookie echo</h1>' +
          `<p>The request arrived carrying ${cookie} in its Cookie header, which is the ` +
          'evidence that an inherited session was attached to the browser context and used ' +
          'for the navigation rather than merely written into the compliance record.</p>' +
          '</article></body></html>',
      )
    } else if (req.url === '/robots.txt') {
      robotsHits++
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('User-agent: *\nDisallow: /private\nAllow: /private/ok\n')
    } else if (req.url?.startsWith('/private')) {
      // Reachable in principle — robots is what must stop us, not the server.
      // Body is substantive so an extraction escalation can't be mistaken for
      // a robots refusal on the paths robots actually allows.
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
    } else {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  url = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('BrowserLocalSubject transport', () => {
  it('executes scripts and extracts the rendered DOM', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/spa`)
      expect(out.status).toBe('success')
      expect(out.lane).toBe('browser_local')
      expect(out.markdown).toContain('Loaded after script execution.')
    } finally {
      await subject.teardown()
    }
  })

  it('produces a compliance record whose declared identity is honest', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/spa`)
      expect(out.compliance).not.toBeNull()
      const record = out.compliance!
      // The mode's declared UA is derived from the *real* Chromium version, so
      // the record must carry that UA — not the CHROME_MAJOR_FLOOR placeholder.
      const declared = record.sentHeaders.headers.find((h) => h.name === 'user-agent')
      expect(declared).toBeDefined()
      expect(declared!.value).toMatch(/Chrome\/\d+\.0\.0\.0 Safari/)
      // The honesty check runs inside fetch and, on a clean context, must be
      // silent — a mismatch surfaces as an identity_mismatch trace event.
      expect(out.trace.filter((t) => t.event === 'identity_mismatch')).toHaveLength(0)
      // robots.txt was really consulted: the record cites the URL it read and
      // the group that governed the decision, not a placeholder.
      expect(record.robots.decision).toBe('allowed')
      expect(record.robots.robotsUrl).toBe(`${url}/robots.txt`)
      expect(record.robots.robotsSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(record.robots.matchedUserAgentGroup).toBe('*')
      expect(record.robots.skippedFetch).toBe(false)
    } finally {
      await subject.teardown()
    }
  })

  it('declares the operator contact in research mode and signs the User-Agent that carried it', async () => {
    const subject = new BrowserLocalSubject('research', null, false, { ...localNetworkPolicy(), contact: 'Jane Doe jane@example.org' })
    try {
      const out = await subject.fetch(`${url}/spa`)
      expect(out.status).toBe('success')
      const sent = out.compliance!.sentHeaders.headers.find((h) => h.name === 'user-agent')
      expect(sent?.value).toMatch(/w2l-research.*; contact: Jane Doe jane@example\.org\)$/)
      expect(out.trace.filter((t) => t.event === 'identity_mismatch')).toHaveLength(0)
    } finally {
      await subject.teardown()
    }
  })

  it('refuses a robots-disallowed path and still mints a record proving it', async () => {
    const subject = new BrowserLocalSubject()
    const before = privateHits
    try {
      const out = await subject.fetch(`${url}/private/secret`)
      // The declared identity claims respectsRobots; the only thing that makes
      // that claim mean anything is the fetch not happening.
      expect(privateHits).toBe(before)
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('policy_denied')
      expect(out.markdown).toBeNull()

      const record = out.compliance!
      expect(record.robots.decision).toBe('disallowed')
      expect(record.robots.skippedFetch).toBe(true)
      // The rule that did it is cited, so the publisher can check the verdict
      // against their own robots.txt rather than take our word for it.
      expect(record.robots.appliedRules.map((r) => r.pattern)).toContain('/private')
      expect(record.robots).not.toHaveProperty('unreachable')
    } finally {
      await subject.teardown()
    }
  })

  it('fetches a robots-disallowed path under a recorded override and signs the override into its record', async () => {
    const subject = new BrowserLocalSubject()
    const before = privateHits
    try {
      const out = await subject.fetch(`${url}/private/secret`, undefined, undefined, undefined, { robotsOverride: { reason: 'The publisher links this page itself; the rule addresses crawlers.', recordedBy: 'test researcher' } })
      expect(privateHits).toBe(before + 1)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Private area')
      // The verdict stays on the record next to the decision that set it aside.
      const record = out.compliance!
      expect(record.robots).toMatchObject({ decision: 'disallowed', skippedFetch: false, override: { reason: 'The publisher links this page itself; the rule addresses crawlers.', recordedBy: 'test researcher' } })
      expect(record.robots.appliedRules.map((r) => r.pattern)).toContain('/private')
      const events = out.trace.map((t) => t.event)
      expect(events.indexOf('robots_overridden')).toBe(events.indexOf('robots_disallowed') + 1)
      expect(out.warnings?.[0]).toMatchObject({ code: 'robots_overridden' })
      expect(out.warnings?.[0]?.message).toContain('recorded by test researcher')
      // The override is part of what the record's hash commits to.
      expect(verifyLedger(subject.ledger()).valid).toBe(true)
    } finally {
      await subject.teardown()
    }
  })

  it('refuses a page whose robots.txt answers 5xx and signs the reason into its record', async () => {
    let pageHits = 0
    const failing = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(503).end('temporarily unavailable'); return }
      pageHits++
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><html><body><article><h1>Must not fetch</h1></article></body></html>')
    })
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve))
    const address = failing.address()
    if (address === null || typeof address === 'string') throw new Error('no address')
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`http://127.0.0.1:${address.port}/page`)
      expect(out).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
      expect(pageHits).toBe(0)
      // A complete disallow W2L assumed (RFC 9309 §2.3.1.4), not one the publisher wrote.
      expect(out.compliance!.robots).toMatchObject({ decision: 'disallowed', unreachable: 'server_error', skippedFetch: true, robotsSha256: null, appliedRules: [] })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'robots_disallowed', detail: expect.objectContaining({ unreachable: 'server_error' }) }))
      // No rule was read, so a recorded override has nothing to set aside.
      const overridden = await subject.fetch(`http://127.0.0.1:${address.port}/page`, undefined, undefined, undefined, { robotsOverride: { reason: 'a rule I know of' } })
      expect(overridden).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
      expect(overridden.compliance!.robots).toMatchObject({ unreachable: 'server_error', skippedFetch: true })
      expect(overridden.compliance!.robots).not.toHaveProperty('override')
      expect(overridden.warnings).toBeUndefined()
      expect(pageHits).toBe(0)
      expect(verifyLedger(subject.ledger()).valid).toBe(true)
    } finally {
      await subject.teardown()
      await new Promise<void>((resolve) => failing.close(() => resolve()))
    }
  })

  it('honours a more-specific Allow beneath a Disallow', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/private/ok`)
      expect(out.status).toBe('success')
      const record = out.compliance!
      expect(record.robots.decision).toBe('allowed')
      expect(record.robots.appliedRules.map((r) => r.pattern)).toEqual(['/private/ok', '/private'])
    } finally {
      await subject.teardown()
    }
  })

  it('fetches robots.txt once per origin, not once per page', async () => {
    const subject = new BrowserLocalSubject()
    const before = robotsHits
    try {
      await subject.fetch(`${url}/spa`)
      await subject.fetch(`${url}/spa`)
      await subject.fetch(`${url}/spa`)
      expect(robotsHits - before).toBe(1)
    } finally {
      await subject.teardown()
    }
  })

  it('chains every record in a run into one verifiable ledger', async () => {
    const subject = new BrowserLocalSubject()
    try {
      await subject.fetch(`${url}/spa`)
      await subject.fetch(`${url}/private/secret`) // denied, but still recorded
      await subject.fetch(`${url}/spa`)

      const ledger = subject.ledger()
      expect(ledger.records).toHaveLength(3)
      expect(ledger.records[0]!.prevRecordHash).toBeNull()
      expect(ledger.records[1]!.prevRecordHash).toBe(ledger.records[0]!.contentHash)
      expect(ledger.records[2]!.prevRecordHash).toBe(ledger.records[1]!.contentHash)

      const verdict = verifyLedger(ledger)
      expect(verdict.valid).toBe(true)
      expect(verdict.headHash).toBe(ledger.records[2]!.contentHash)
    } finally {
      await subject.teardown()
    }
  })

  it('a ledger with the denied fetch removed fails verification', async () => {
    // The reason to chain at all: dropping the inconvenient record must be
    // detectable, or the ledger only proves what we chose to admit.
    const subject = new BrowserLocalSubject()
    try {
      await subject.fetch(`${url}/spa`)
      await subject.fetch(`${url}/private/secret`)
      await subject.fetch(`${url}/spa`)

      const ledger = subject.ledger()
      const scrubbed = {
        ...ledger,
        records: [ledger.records[0]!, ledger.records[2]!],
      }
      const verdict = verifyLedger(scrubbed)
      expect(verdict.valid).toBe(false)
      expect(verdict.violations.some((v) => v.kind === 'broken_link')).toBe(true)
    } finally {
      await subject.teardown()
    }
  })

  it('waits waitFor after load and stability before it captures', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const plain = await subject.fetch(`${url}/delayed`)
      expect(plain.markdown).toContain('The opening paragraph')
      expect(plain.markdown).not.toContain('The late paragraph')
      const waited = await subject.fetch(`${url}/delayed`, undefined, undefined, undefined, { waitFor: 2_500 })
      expect(waited.status).toBe('success')
      expect(waited.markdown).toContain('The late paragraph arrives two seconds after load.')
      expect(waited.trace).toContainEqual(expect.objectContaining({ event: 'wait_for', detail: expect.objectContaining({ requestedMs: 2_500 }) }))
    } finally {
      await subject.teardown()
    }
  })

  it('captures the page so far as partial when the timeout cuts waitFor short', async () => {
    const subject = new BrowserLocalSubject()
    try {
      await subject.fetch(`${url}/spa`) // warm the browser so the deadline covers only this page
      const deadline = Date.now() + 2_500
      const out = await subject.fetch(`${url}/delayed`, deadline, undefined, undefined, { waitFor: 10_000 })
      expect(Date.now()).toBeLessThan(deadline)
      expect(out).toMatchObject({ status: 'partial', failureReason: null, budgetExceeded: null, usage: { deadlineExceeded: true } })
      expect(out.markdown).toContain('The opening paragraph')
      expect(out.markdown).not.toContain('The late paragraph')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'wait_for', detail: expect.objectContaining({ requestedMs: 10_000, cutShortBy: 'timeout' }) }))
    } finally {
      await subject.teardown()
    }
  })

  it('returns the whole page for onlyMainContent false, with the same evidence', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const main = await subject.fetch(`${url}/chrome`)
      const full = await subject.fetch(`${url}/chrome`, undefined, undefined, undefined, { onlyMainContent: false })
      expect(main.markdown).toContain('Main story')
      expect(main.markdown).not.toContain('Navigation entry')
      expect(full.markdown).toContain(`[Navigation entry](${url}/a)`)
      expect(full.markdown).toContain('Site header link')
      expect(full.markdown).toContain('Footer notice text')
      expect(full.markdown).toContain('Main story')
      expect(full.markdown).not.toContain('script text never shows')
      expect(full.status).toBe(main.status)
      expect(full.evidence.rawBodySha256).toBe(main.evidence.rawBodySha256)
    } finally {
      await subject.teardown()
    }
  })

  it('keeps the whole page as evidence when no main block is found, and returns it for onlyMainContent false', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const whole = `[Harbour office](${url}/)\n\n- [Tide tables](${url}/tides)\n- [Weather](${url}/weather)\n\nPublished by the harbour office`
      const main = await subject.fetch(`${url}/nav-only`)
      expect(main).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: whole, usage: { contentTokens: null } })
      expect(main.links).toEqual([`${url}/`, `${url}/tides`, `${url}/weather`])
      expect(main.document).toBeUndefined()
      const full = await subject.fetch(`${url}/nav-only`, undefined, undefined, undefined, { onlyMainContent: false })
      expect(full).toMatchObject({ status: 'success', failureReason: null, markdown: whole, metadata: { title: 'Harbour office' } })
      expect(full.usage.contentTokens).toBeGreaterThan(0)
      expect(full.evidence.rawBodySha256).toBe(main.evidence.rawBodySha256)
      expect(full.trace).toContainEqual(expect.objectContaining({ event: 'extract', detail: expect.objectContaining({ escalate: true, onlyMainContent: false }) }))
    } finally {
      await subject.teardown()
    }
  })

  it('reports the response content type and every redirect hop of the navigation', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const moved = await subject.fetch(`${url}/hop/1`)
      expect(moved.status).toBe('success')
      expect(moved.evidence).toMatchObject({
        finalUrl: `${url}/landing`,
        httpStatus: 200,
        contentType: 'text/html; charset=iso-8859-1',
        redirectChain: [`${url}/hop/1`, `${url}/hop/2`, `${url}/landing`],
        redirectChainComplete: true,
      })
      const direct = await subject.fetch(`${url}/landing`)
      expect(direct.evidence).toMatchObject({ finalUrl: `${url}/landing`, redirectChain: [], redirectChainComplete: true, contentType: 'text/html; charset=iso-8859-1' })
    } finally {
      await subject.teardown()
    }
  })

  it('converts with the layout the page CSS gives, and keeps the evidence unannotated', async () => {
    const previous = process.env.W2L_CAPTURE_RAW_DIR
    const root = await mkdtemp(join(tmpdir(), 'w2l-layout-'))
    process.env.W2L_CAPTURE_RAW_DIR = root
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/css-layout`)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('“The world as we have created it is a process of our thinking.”\n\nby Albert Einstein')
      expect(out.markdown).toContain('1. Open Terminal.\n2. Set a Git username.')
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'layout', detail: expect.objectContaining({ outcome: 'annotated', blocks: 1, hidden: 2 }) }))
      // The evidence is the page as rendered, without W2L's markers.
      const raw = await readFile(out.evidence.artifacts[0]!, 'utf8')
      expect(raw).toContain('Git Bash')
      expect(raw).not.toContain('data-w2l')
      expect(sha256Utf8(raw)).toBe(out.evidence.rawBodySha256)
    } finally {
      await subject.teardown()
      if (previous === undefined) delete process.env.W2L_CAPTURE_RAW_DIR
      else process.env.W2L_CAPTURE_RAW_DIR = previous
      await rm(root, { recursive: true, force: true })
    }
  })

  it('maps a navigation deadline to failureReason timeout', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/hang`)
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('timeout')
    } finally {
      await subject.teardown()
    }
  })

  it('gives navigation until a caller-chosen deadline, never past it, and 20 s without one', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const navigationTimeout = async (deadlineAt?: number, timeout?: number): Promise<unknown> => {
        const out = await subject.fetch(`${url}/spa`, deadlineAt, undefined, undefined, timeout === undefined ? {} : { timeout })
        expect(out.status).toBe('success')
        return out.trace.find((event) => event.event === 'navigate')?.detail?.timeoutMs
      }
      expect(await navigationTimeout()).toBe(20_000)
      expect(await navigationTimeout(Date.now() + 60_000)).toBe(20_000)
      const followed = await navigationTimeout(Date.now() + 60_000, 60_000)
      expect(followed).toBeGreaterThan(50_000)
      expect(followed).toBeLessThanOrEqual(60_000)
      expect(await navigationTimeout(Date.now() + 8_000, 8_000)).toBeLessThanOrEqual(8_000)
    } finally {
      await subject.teardown()
    }
  })

  it('retries a 503 once and succeeds on the second attempt', async () => {
    flakyHits = 0
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/flaky`)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Succeeded on the second attempt.')
      expect(out.usage.attemptCount).toBe(2)
      expect(out.usage.requestCount).toBe(2)
      expect(out.trace.filter((t) => t.event === 'retry')).toHaveLength(1)
    } finally {
      await subject.teardown()
    }
  })

  it('names the gate and escalates to the user-owned proxy, not to itself', async () => {
    // The browser lane is already the escalation target for an http-lane
    // interstitial. When the gate holds *here*, the only honest next step is
    // the user's own network — there is no further capability of ours to offer.
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/gate`)
      expect(out.status).toBe('blocked')
      expect(out.blockReason).toBe('cloudflare_challenge')
      // The 403 block page is evidence of what the server said, not content.
      expect(out.markdown).toContain('Just a moment...')
      expect(out.escalations).toEqual([
        {
          from: 'browser_local',
          to: 'browser_proxy',
          trigger: 'blocked:cloudflare_challenge',
          improved: null,
        },
      ])
    } finally {
      await subject.teardown()
    }
  })

  it('leaves a bare 403 as an ordinary http_error', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/plain-403`)
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('http_error')
      expect(out.blockReason).toBeNull()
      expect(out.evidence.httpStatus).toBe(403)
      expect(out.markdown).toContain('403 Forbidden')
    } finally {
      await subject.teardown()
    }
  })

  it('judges a 201 page from its content like a 200', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/created`)
      expect(out.status).toBe('success')
      expect(out.evidence.httpStatus).toBe(201)
      expect(out.markdown).toContain('judged from its content in the browser lane too')
    } finally {
      await subject.teardown()
    }
  })

  it('reports a server redirect loop as the redirect limit Chromium reached, not a connection error', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/client/loop/a`)
      expect(out).toMatchObject({ status: 'failed', failureReason: 'redirect_limit', evidence: { httpStatus: null } })
    } finally {
      await subject.teardown()
    }
  })

  it('reports a host that does not resolve as dns_error, not policy_denied', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch('http://w2l-dns-failure.invalid/page')
      expect(out).toMatchObject({ status: 'failed', failureReason: 'dns_error' })
    } finally {
      await subject.teardown()
    }
  })
})

describe('BrowserLocalSubject after the page moves on by itself', () => {
  it('reports the status and content type of the document it shows, and judges it by them', async () => {
    const subject = new BrowserLocalSubject()
    try {
      // 200, then location.replace to a 404: the 404 page is what the browser shows.
      const gone = await subject.fetch(`${url}/client/replace`)
      expect(gone).toMatchObject({ status: 'failed', failureReason: 'http_error' })
      expect(gone.evidence).toMatchObject({
        finalUrl: `${url}/client/gone`,
        httpStatus: 404,
        contentType: 'text/html; charset=iso-8859-1',
        redirectChain: [`${url}/client/replace`, `${url}/client/gone`],
        redirectChainComplete: true,
      })
      expect(gone.markdown).toContain('Page not found')
      expect(gone.compliance?.finalUrl).toBe(`${url}/client/gone`)

      // A server redirect, then a script: every hop is listed and the last document answers.
      const onward = await subject.fetch(`${url}/client/hop`)
      expect(onward.status).toBe('success')
      expect(onward.evidence).toMatchObject({
        finalUrl: `${url}/landing`,
        httpStatus: 200,
        contentType: 'text/html; charset=iso-8859-1',
        redirectChain: [`${url}/client/hop`, `${url}/client/onward`, `${url}/landing`],
        redirectChainComplete: true,
      })

      // A 403 block page reached by a script is blocked, with its own status.
      const gate = await subject.fetch(`${url}/client/to-gate`)
      expect(gate).toMatchObject({ status: 'blocked', blockReason: 'cloudflare_challenge' })
      expect(gate.evidence).toMatchObject({ finalUrl: `${url}/gate`, httpStatus: 403, redirectChain: [`${url}/client/to-gate`, `${url}/gate`], redirectChainComplete: true })
    } finally {
      await subject.teardown()
    }
  })

  it('settles on the document a zero-second meta refresh loads, with or without waitFor', async () => {
    const subject = new BrowserLocalSubject()
    try {
      for (const options of [{}, { waitFor: 500 }]) {
        const out = await subject.fetch(`${url}/client/meta`, undefined, undefined, undefined, options)
        expect(out.status).toBe('success')
        expect(out.markdown).toContain('The page two redirects lead to')
        expect(out.evidence).toMatchObject({
          finalUrl: `${url}/landing`,
          httpStatus: 200,
          contentType: 'text/html; charset=iso-8859-1',
          redirectChain: [`${url}/client/meta`, `${url}/landing`],
          redirectChainComplete: true,
        })
      }
    } finally {
      await subject.teardown()
    }
  })

  it('reports the URL a document was loaded from when the history API changed it, and keeps a fragment', async () => {
    const subject = new BrowserLocalSubject()
    try {
      // history.pushState: no request answered /client/sub/pushed; /client/push answered the document.
      const pushed = await subject.fetch(`${url}/client/push`)
      expect(pushed.status).toBe('success')
      expect(pushed.markdown).toContain('The page the browser shows at the end')
      expect(pushed.evidence).toMatchObject({
        finalUrl: `${url}/client/push`,
        httpStatus: 200,
        contentType: 'text/html; charset=utf-8',
        redirectChain: [],
        redirectChainComplete: true,
      })
      expect(pushed.compliance?.finalUrl).toBe(`${url}/client/push`)
      expect(pushed.trace).toContainEqual(expect.objectContaining({ event: 'same_document_navigation', detail: { from: `${url}/client/push`, to: `${url}/client/sub/pushed` } }))
      // Relative links resolve as the browser resolves them: against the page's URL.
      expect(pushed.links).toContain(`${url}/client/sub/detail`)

      // The document answered 404, whatever URL the page gave itself afterwards.
      const missing = await subject.fetch(`${url}/client/spa-missing`)
      expect(missing).toMatchObject({ status: 'failed', failureReason: 'http_error' })
      expect(missing.evidence).toMatchObject({ finalUrl: `${url}/client/spa-missing`, httpStatus: 404, contentType: 'text/html; charset=utf-8', redirectChain: [], redirectChainComplete: true })
      expect(missing.markdown).toContain('The page the browser shows at the end')

      // A fragment names a part of the same document: the URL keeps it.
      const fragment = await subject.fetch(`${url}/client/fragment`)
      expect(fragment.status).toBe('success')
      expect(fragment.evidence).toMatchObject({
        finalUrl: `${url}/client/fragment#part`,
        httpStatus: 200,
        contentType: 'text/html; charset=utf-8',
        redirectChain: [],
        redirectChainComplete: true,
      })
    } finally {
      await subject.teardown()
    }
  })

  it('stops waiting for a page close Chromium leaves unanswered', async () => {
    expect(await closePage({ close: () => new Promise<void>(() => {}) }, 50)).toBe(false)
    expect(await closePage({ close: async () => {} }, 50)).toBe(true)
    expect(await closePage({ close: async () => { throw new Error('Target closed') } }, 50)).toBe(true)
  })

  it('never pairs a page that reloads itself without end with another document, bounds its chain and closes it', async () => {
    const subject = new BrowserLocalSubject()
    try {
      // Chromium leaves some closes of such a page unanswered (see closePage).
      for (let fetchIndex = 0; fetchIndex < 3; fetchIndex++) {
        const out = await subject.fetch(`${url}/client/refresh-loop`, Date.now() + 4_000)
        // Either a read held still (the document read is the one that answered)
        // or none did (nothing is delivered): which depends on timing.
        if (out.status === 'success') expect(out.evidence).toMatchObject({ httpStatus: 200, contentType: 'text/html; charset=utf-8' })
        else {
          expect(out).toMatchObject({ status: 'failed', failureReason: 'redirect_loop', markdown: null, evidence: { finalUrl: `${url}/client/refresh-loop`, httpStatus: null, contentType: null } })
          expect(out.trace).toContainEqual(expect.objectContaining({ event: 'page_kept_navigating' }))
        }
        expect(out.evidence.redirectChain.length).toBeGreaterThan(2)
        expect(out.evidence.redirectChain.length).toBeLessThanOrEqual(21)
        expect(out.evidence.redirectChainComplete).toBe(false)
      }
    } finally {
      await subject.teardown()
    }
  })
})

describe('BrowserLocalSubject user-owned access', () => {
  const ATTESTATION = {
    principal: 'acct_test (tester@example.com)',
    at: '2026-08-21T09:00:00.000Z',
    statement: 'I own this session and accept responsibility for fetches made with it.',
  }

  it('records operator ownership when the caller brings nothing', async () => {
    const subject = new BrowserLocalSubject()
    try {
      const out = await subject.fetch(`${url}/spa`)
      const access = out.compliance!.access
      expect(access.egressOwner).toBe('operator')
      expect(access.sessionOwner).toBe('none')
      expect(access.attestedBy).toBeNull()
    } finally {
      await subject.teardown()
    }
  })

  it('attaches an inherited session and records who accepted responsibility', async () => {
    const subject = new BrowserLocalSubject('standard', {
      session: {
        cookies: [{ name: 'sid', value: 'USER-SECRET', domain: '127.0.0.1', path: '/' }],
      },
      attestation: ATTESTATION,
    })
    try {
      const out = await subject.fetch(`${url}/echo-cookie`)
      expect(out.status).toBe('success')
      // The cookie really reached the origin — the fact is not a claim about
      // an intent, it describes a request that actually carried the session.
      expect(out.markdown).toContain('sid=USER-SECRET')

      const access = out.compliance!.access
      expect(access.sessionOwner).toBe('user')
      expect(access.sessionSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(access.attestedBy).toBe(ATTESTATION.principal)
      expect(access.attestationStatement).toBe(ATTESTATION.statement)
      // Egress did not move: we attached their session, not their network.
      expect(access.egressOwner).toBe('operator')
    } finally {
      await subject.teardown()
    }
  })

  it('keeps the session value out of the record and the trace', async () => {
    const subject = new BrowserLocalSubject('standard', {
      session: {
        cookies: [{ name: 'sid', value: 'USER-SECRET', domain: '127.0.0.1', path: '/' }],
      },
      attestation: ATTESTATION,
    })
    try {
      const out = await subject.fetch(`${url}/spa`)
      expect(JSON.stringify(out.compliance)).not.toContain('USER-SECRET')
      expect(JSON.stringify(out.trace)).not.toContain('USER-SECRET')
      // The attachment is still visible as an event — hidden is not the goal,
      // credential-free is.
      expect(out.trace.some((t) => t.event === 'session_attached')).toBe(true)
    } finally {
      await subject.teardown()
    }
  })

  it('does not change the declared identity when a session is inherited', async () => {
    // The whole No-go: bringing your own access changes the route and the
    // credentials. It must not change the UA, or we would be spoofing.
    const plain = new BrowserLocalSubject()
    const withSession = new BrowserLocalSubject('standard', {
      session: { cookies: [{ name: 'sid', value: 'x', domain: '127.0.0.1', path: '/' }] },
      attestation: ATTESTATION,
    })
    try {
      const a = await plain.fetch(`${url}/spa`)
      const b = await withSession.fetch(`${url}/spa`)
      const uaOf = (r: typeof a) =>
        r.compliance!.sentHeaders.headers.find((h) => h.name === 'user-agent')!.value
      expect(uaOf(b)).toBe(uaOf(a))
      expect(b.trace.filter((t) => t.event === 'identity_mismatch')).toHaveLength(0)
    } finally {
      await plain.teardown()
      await withSession.teardown()
    }
  })

  it('still refuses a robots-disallowed path when the user brought a session', async () => {
    // The load-bearing one. "I brought my own session" is a transfer of
    // responsibility, not a licence — robots is the publisher's rule and it
    // still stops the fetch.
    const subject = new BrowserLocalSubject('standard', {
      session: { cookies: [{ name: 'sid', value: 'x', domain: '127.0.0.1', path: '/' }] },
      attestation: ATTESTATION,
    })
    const before = privateHits
    try {
      const out = await subject.fetch(`${url}/private/secret`)
      expect(privateHits).toBe(before)
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('policy_denied')
      // And the refusal record still names who was responsible for the access.
      expect(out.compliance!.access.sessionOwner).toBe('user')
      expect(out.compliance!.access.attestedBy).toBe(ATTESTATION.principal)
    } finally {
      await subject.teardown()
    }
  })

  it('refuses to construct when access is supplied with no attestation', () => {
    expect(
      () =>
        new BrowserLocalSubject('standard', {
          session: { cookies: [{ name: 'sid', value: 'x', domain: '127.0.0.1', path: '/' }] },
        }),
    ).toThrow(AccessConfigError)
  })

  it('produces a ledger that verifies with user access in every record', async () => {
    const subject = new BrowserLocalSubject('standard', {
      session: { cookies: [{ name: 'sid', value: 'x', domain: '127.0.0.1', path: '/' }] },
      attestation: ATTESTATION,
    })
    try {
      await subject.fetch(`${url}/spa`)
      await subject.fetch(`${url}/private/secret`)
      const verdict = verifyLedger(subject.ledger())
      expect(verdict.violations).toEqual([])
      expect(verdict.valid).toBe(true)
    } finally {
      await subject.teardown()
    }
  })
})
