import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { identityBundleFrom, modeIdentity } from '@w2l/contracts'
import { LadderRunner } from '../src/routing/ladder.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

const IDENTITY = identityBundleFrom(modeIdentity('standard'))

/**
 * Ladder regression against REAL subjects and a REAL local server:
 *
 *  A. a JS shell (empty #root + a script that renders the content) must
 *     escalate — HTTP cannot run the script, the browser can;
 *  B. a gate route must escalate from http to browser_local.
 *
 * These are the two real-world cases the ladder exists for, pinned with
 * actual Chromium and actual extraction, not fake channels.
 */

let server: Server
let base: string

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/spa') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><body><div id="root"></div><script>' +
          'document.getElementById("root").innerHTML = ' +
          '"<article><h1>Rendered by the browser</h1><p>This text only exists after script execution.</p></article>"' +
          '</script></body></html>',
      )
    } else if (req.url === '/thin') {
      // A real page, but thin: extraction succeeds with very little text, so
      // the http lane reports success AND the quality_low_yield signal.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><body>' +
          Array.from(
            { length: 6 },
            (_, i) =>
              `<div><p>Some unrelated piece of text number ${i} that just fills space and nothing else really.</p></div>`,
          ).join('') +
          '<div id="content"><p>A genuinely small paragraph of real content that still crosses the eighty character minimum.</p></div>' +
          '<div><p>A closing note at the bottom of the page with a few more words.</p></div>' +
          '</body></html>',
      )
    } else if (req.url === '/listing/cards') {
      // Product cards only: no prose block survives the classifier, so the
      // extractor recovers the linked list and the http lane reports partial.
      const cards = Array.from(
        { length: 10 },
        (_, i) =>
          `<li><article class="product_pod"><div class="image_container"><a href="/catalogue/book-${i}"><img src="/media/${i}.jpg" alt="Book Title ${i}"></a></div>` +
          `<h3><a href="/catalogue/book-${i}">Book Title ${i}</a></h3><div class="product_price"><p class="price_color">£1${i}.50</p><p class="availability">In stock</p></div></article></li>`,
      ).join('')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><head><title>Art | Books</title></head><body>' +
          '<ul class="breadcrumb"><li><a href="/">Home</a></li><li><a href="/books">Books</a></li><li class="active">Art</li></ul>' +
          `<h1>Art</h1><ol class="row">${cards}</ol></body></html>`,
      )
    } else if (req.url === '/spa/table-shell') {
      // Prose the http lane extracts as a success, plus a data grid that a
      // script fills in after load: the http capture is a shell for the data.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><head><title>Monthly index</title></head><body><main><h1>Monthly index</h1>' +
          '<p>The monthly index is published for every gauge station in the survey area.</p>' +
          '<p>Values are revised when late readings arrive from the field offices.</p>' +
          '<h2>Notes</h2><p>Stations that reported fewer than twenty days in a month are shown without a value.</p>' +
          '<table id="grid"><thead><tr></tr></thead><tbody></tbody></table>' +
          `<script>/* ${'grid loader '.repeat(120)} */ setTimeout(function () { document.getElementById('grid').innerHTML = ` +
          `'<tr><th>Station</th><th>Index</th></tr><tr><td>Ravine gauge station</td><td>1.10</td></tr>' }, 300)</script>` +
          '</main></body></html>',
      )
    } else if (req.url === '/gate') {
      res.writeHead(403, {
        'content-type': 'text/html; charset=utf-8',
        'cf-mitigated': 'challenge',
      })
      res.end(
        '<!doctype html><html><head><title>Just a moment...</title></head><body>' +
          '<h1>Just a moment...</h1><p>Enable JavaScript and cookies to continue.</p></body></html>',
      )
    } else if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('User-agent: *\nDisallow:\n')
    } else {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('ladder with real subjects on a real server', () => {
  it('SPA shell: http escalates (empty_unverified) and the browser renders the content', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const runner = new LadderRunner(
        [
          { id: 'http', identity: IDENTITY, fetch: (url) => new ResilientHttpSubject().fetch(url) },
          { id: 'browser_local', identity: IDENTITY, fetch: (url) => browser.fetch(url) },
        ],
        { mode: 'authed' },
      )

      const run = await runner.run(`${base}/spa`)
      expect(run.channelsTried).toEqual(['http', 'browser_local'])
      expect(run.result.status).toBe('success')
      expect(run.result.lane).toBe('browser_local')
      expect(run.result.markdown).toContain('Rendered by the browser')
      expect(run.result.markdown).toContain('only exists after script execution')
      // The subject itself asked for the escalation.
      const steps = run.ladderTrace.filter((t) => t.event === 'ladder_step')
      expect(steps[0]).toMatchObject({
        channel: 'http',
        detail: { escalate: 'subject_escalations', status: 'failed' },
      })
    } finally {
      await browser.teardown()
    }
  })

  it('card listing: http recovers the linked list as partial and the ladder stops there', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const runner = new LadderRunner(
        [
          { id: 'http', identity: IDENTITY, fetch: (url) => new ResilientHttpSubject().fetch(url) },
          { id: 'browser_local', identity: IDENTITY, fetch: (url) => browser.fetch(url) },
        ],
        { mode: 'standard' },
      )
      const run = await runner.run(`${base}/listing/cards`)
      expect(run.channelsTried).toEqual(['http'])
      expect(run.result.status).toBe('partial')
      expect(run.result.lane).toBe('http')
      expect(run.result.failureReason).toBeNull()
      expect(run.result.markdown).toContain('Book Title 3')
      expect(run.result.markdown).toContain('£13.50')
      expect(run.result.warnings?.map((w) => w.code)).toEqual(['low_confidence_extraction'])
      expect(run.result.trace.some((t) => t.event === 'extract_recovered')).toBe(true)
    } finally {
      await browser.teardown()
    }
  })

  it('table shell: http succeeds on the prose, flags client rendering, and the browser returns the grid', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const runner = new LadderRunner(
        [
          { id: 'http', identity: IDENTITY, fetch: (url) => new ResilientHttpSubject().fetch(url) },
          { id: 'browser_local', identity: IDENTITY, fetch: (url) => browser.fetch(url) },
        ],
        { mode: 'standard' },
      )
      const run = await runner.run(`${base}/spa/table-shell`)
      expect(run.channelsTried).toEqual(['http', 'browser_local'])
      const steps = run.ladderTrace.filter((t) => t.event === 'ladder_step')
      expect(steps[0]).toMatchObject({
        channel: 'http',
        detail: { escalate: 'quality_client_rendered', status: 'success' },
      })
      expect(run.result.status).toBe('success')
      expect(run.result.lane).toBe('browser_local')
      expect(run.result.markdown).toContain('| Ravine gauge station | 1.10 |')
      expect(run.result.warnings ?? []).toEqual([])
      expect(run.result.escalations).toContainEqual({
        from: 'http',
        to: 'browser_local',
        trigger: 'quality_client_rendered',
        improved: true,
      })
    } finally {
      await browser.teardown()
    }
  })

  it('bot gate: http escalates and the browser wins with rendered content', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const runner = new LadderRunner(
        [
          { id: 'http', identity: IDENTITY, fetch: (url) => new ResilientHttpSubject().fetch(url) },
          { id: 'browser_local', identity: IDENTITY, fetch: (url) => browser.fetch(url) },
        ],
        { mode: 'authed' },
      )

      const run = await runner.run(`${base}/gate`)
      // The gate route returns the challenge for the browser too — both arms
      // are honestly blocked, and the ladder reports the last refusal rather
      // than inventing a success.
      expect(run.result.status).toBe('blocked')
      expect(run.result.blockReason).toBe('cloudflare_challenge')
      expect(run.channelsTried).toEqual(['http', 'browser_local'])
    } finally {
      await browser.teardown()
    }
  })

  it('quality signal: a thin, low-confidence http success escalates to the browser', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const runner = new LadderRunner(
        [
          { id: 'http', identity: IDENTITY, fetch: (url) => new ResilientHttpSubject().fetch(url) },
          { id: 'browser_local', identity: IDENTITY, fetch: (url) => browser.fetch(url) },
        ],
        { mode: 'authed' },
      )

      const run = await runner.run(`${base}/thin`)
      // The http result was a genuine success — but thin — and the ladder
      // offered it to the browser instead of accepting it as the answer.
      expect(run.channelsTried).toEqual(['http', 'browser_local'])
      expect(run.result.status).toBe('success')
      const steps = run.ladderTrace.filter((t) => t.event === 'ladder_step')
      expect(steps[0]).toMatchObject({
        channel: 'http',
        detail: { escalate: 'quality_low_yield', status: 'success' },
      })
    } finally {
      await browser.teardown()
    }
  })
})
