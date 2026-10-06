import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * Transport-resilience integration test against real fixture-server bytes:
 * the four cases the resilient arm exists for, asserted per-fixture (status,
 * failure reason, chain, attempt counts, delivered facts) — not via bench
 * aggregate inference.
 */

let server: FixtureServer
const subject = new ResilientHttpSubject()

beforeAll(async () => {
  server = await startFixtureServer()
})

afterAll(async () => {
  await server.close()
})

async function reset(): Promise<void> {
  const res = await fetch(`${server.url}/__reset`)
  expect(res.status).toBe(204)
  await res.body?.cancel()
}

describe('resilient subject on served fixture bytes', () => {
  it('redirect-chain: follows three hops and delivers the destination fact', async () => {
    const out = await subject.fetch(`${server.url}/redirect/chain/3`)
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('Arrived after three hops.')
    expect(out.evidence.rawBodySha256).toMatch(/^[0-9a-f]{64}$/)
    expect(out.evidence.finalUrl).toBe(`${server.url}/redirect/chain/0`)
    expect(out.evidence.redirectChain).toHaveLength(4)
    expect(out.usage.requestCount).toBe(4)
    expect(out.usage.attemptCount).toBe(1)
  })

  it('redirect-loop: terminates with redirect_loop, never spins', async () => {
    const out = await subject.fetch(`${server.url}/redirect/loop/a`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('redirect_loop')
    expect(out.usage.attemptCount).toBe(1)
    // a -> b -> a: the loop is provable after two wire requests
    expect(out.usage.requestCount).toBe(2)
    // The final URL is b, whose 302 is the last response received.
    expect(out.evidence).toMatchObject({ finalUrl: `${server.url}/redirect/loop/b`, httpStatus: 302, redirectChain: [`${server.url}/redirect/loop/a`, `${server.url}/redirect/loop/b`] })
  })

  it('flaky-once: retries the 503 and succeeds on attempt 2', async () => {
    await reset()
    const out = await subject.fetch(`${server.url}/flaky/once`)
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('Succeeded on the second attempt.')
    expect(out.usage.attemptCount).toBe(2)
    expect(out.usage.requestCount).toBe(2)
    // Retry is a re-visit, not a redirect.
    expect(out.evidence.redirectChain).toHaveLength(0)
  })

  it('block-rate-limit: 429 is blocked/rate_limit with exactly one request', async () => {
    const out = await subject.fetch(`${server.url}/block/rate-limit`)
    expect(out.status).toBe('blocked')
    expect(out.blockReason).toBe('rate_limit')
    expect(out.usage.requestCount).toBe(1)
  })

  it('records a host cooldown after 429 and waits before the next same-host request', async () => {
    const first = await subject.fetch(`${server.url}/block/rate-limit`)
    expect(first.status).toBe('blocked')
    const started = Date.now()
    const second = await subject.fetch(`${server.url}/crawl/listing`)
    expect(second.status).toBe('success')
    expect(second.trace.some((event) => event.event === 'host_cooldown_wait')).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(200)
  })

  it('redirect-to-home: follows to /home; check 4 has no annotation to refute it', async () => {
    // Documented semantic gap for this phase: transport-wise the redirect is
    // followed correctly (finalUrl = /home). Deciding that the DELIVERED
    // content belongs to the wrong page needs the wrong-page probe
    // (content-identity), which is a later milestone. The fixture's
    // expectedStatus stays 'failed', so this arm records a status mismatch
    // there — visible in the bench, not hidden by this test.
    const out = await subject.fetch(`${server.url}/wrong/redirect-home`)
    expect(out.evidence.finalUrl).toBe(`${server.url}/home`)
    expect(out.evidence.redirectChain).toHaveLength(2)
    expect(out.status).toBe('success')
  })

  it('limit-huge-body: stops at maxBodyBytes instead of buffering the stream', async () => {
    const out = await subject.fetch(`${server.url}/limit/huge-body`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('body_too_large')
  })

  it('closes its guarded connection pool after an oversized response', async () => {
    const isolated = new ResilientHttpSubject()
    const out = await isolated.fetch(`${server.url}/limit/huge-body`)
    expect(out.failureReason).toBe('body_too_large')
    await isolated.teardown()
    await isolated.teardown()
  })
})

describe('HTTP lane on non-200 statuses', () => {
  const ARTICLE = '<article><h1>Created record</h1><p>A 201 answer that carries a full document is judged from its content like any other 2xx page, not failed because it is not exactly 200.</p><p><a href="/next">Next record</a></p></article>'
  const pages: Record<string, { status: number; type?: string; body: string }> = {
    '/missing': { status: 404, body: '<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx/1.21.6</center>\n</body>\n</html>' },
    '/broken': { status: 500, body: '<!doctype html><html><body><h1>Internal Server Error</h1><p>The server could not complete the request. <a href="/status">Status page</a></p></body></html>' },
    '/forbidden': { status: 403, body: '<!doctype html><html><body><h1>403 Forbidden</h1><p>You do not have permission to view this directory.</p></body></html>' },
    '/denied': { status: 403, body: '<html><head><title>Access Denied</title></head><body><h1>Access Denied</h1>You don\'t have permission to access this page on this server.<p>Reference #18.2f</p></body></html>' },
    '/created': { status: 201, body: `<!doctype html><html><body>${ARTICLE}</body></html>` },
    '/empty': { status: 204, body: '' },
    '/unchanged': { status: 304, body: '' },
    '/api-missing': { status: 404, type: 'application/json', body: '{"error":"not found"}' },
    '/gone': { status: 410, body: '<!doctype html><html><body><nav><a href="/">Home</a></nav><main><article><h1>This report was withdrawn</h1><p>The quarterly report that used to live at this address was withdrawn by the statistics office and replaced by a revised edition.</p><p>Read the <a href="reports/revised">revised edition</a> or browse <a href="/reports">all reports</a>.</p></article></main></body></html>' },
  }
  let origin: string
  let errorServer: import('node:http').Server
  const http = new ResilientHttpSubject()

  beforeAll(async () => {
    const { createServer } = await import('node:http')
    errorServer = createServer((req, res) => {
      const page = pages[req.url ?? '']
      if (page === undefined) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return }
      res.writeHead(page.status, page.body === '' ? {} : { 'content-type': page.type ?? 'text/html; charset=utf-8' })
      res.end(page.body)
    })
    await new Promise<void>((resolve) => errorServer.listen(0, '127.0.0.1', resolve))
    const address = errorServer.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await http.teardown()
    await new Promise<void>((resolve) => errorServer.close(() => resolve()))
  })

  it('returns a 404 page as evidence on a failed result, never as success', async () => {
    const out = await http.fetch(`${origin}/missing`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'http_error', blockReason: null })
    expect(out.evidence.httpStatus).toBe(404)
    expect(out.evidence.rawBodySha256).toMatch(/^[0-9a-f]{64}$/)
    expect(out.markdown).toContain('404 Not Found')
    expect(out.usage.contentTokens).toBeNull()
    expect(out.document).toBeUndefined()
    expect(out.escalations).toEqual([])
  })

  it('keeps the body and links of a 500 and a bare 403 on their http_error results', async () => {
    const broken = await http.fetch(`${origin}/broken`)
    expect(broken).toMatchObject({ status: 'failed', failureReason: 'http_error' })
    expect(broken.markdown).toContain('Internal Server Error')
    // Link targets resolve against the page URL, as on a success.
    expect(broken.markdown).toContain(`[Status page](${origin}/status)`)
    expect(broken.links).toEqual([`${origin}/status`])
    const forbidden = await http.fetch(`${origin}/forbidden`)
    expect(forbidden).toMatchObject({ status: 'failed', failureReason: 'http_error', blockReason: null })
    expect(forbidden.evidence.httpStatus).toBe(403)
    expect(forbidden.markdown).toContain('403 Forbidden')
  })

  it('resolves the links of an error page with main content against the page URL', async () => {
    const gone = await http.fetch(`${origin}/gone`)
    expect(gone).toMatchObject({ status: 'failed', failureReason: 'http_error' })
    expect(gone.markdown).toContain('# This report was withdrawn')
    expect(gone.markdown).toContain(`Read the [revised edition](${origin}/reports/revised) or browse [all reports](${origin}/reports).`)
    expect(gone.markdown).not.toContain('Home')
  })

  it('names a gated 403 blocked with its signals and keeps the block page as evidence', async () => {
    const out = await http.fetch(`${origin}/denied`)
    expect(out).toMatchObject({ status: 'blocked', blockReason: 'bot_detected_generic', failureReason: null })
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'gate_detected', detail: expect.objectContaining({ signals: ['weak_access_denied', 'status_403'], status: 403 }) }))
    expect(out.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'blocked:bot_detected_generic', improved: null }])
    expect(out.markdown).toContain('Access Denied')
  })

  it('judges a 201 page from its content like a 200', async () => {
    const out = await http.fetch(`${origin}/created`)
    expect(out.status).toBe('success')
    expect(out.evidence.httpStatus).toBe(201)
    expect(out.markdown).toContain('A 201 answer that carries a full document')
    expect(out.links).toEqual([`${origin}/next`])
  })

  it('reports a 204 as proven empty, and keeps 304 and non-text bodies content-free', async () => {
    const empty = await http.fetch(`${origin}/empty`)
    expect(empty).toMatchObject({ status: 'empty_verified', failureReason: null, markdown: null })
    expect(empty.evidence.httpStatus).toBe(204)
    // The monitor runner reads a 304 as "reuse the cached body": no content of its own.
    const unchanged = await http.fetch(`${origin}/unchanged`)
    expect(unchanged).toMatchObject({ status: 'failed', failureReason: 'http_error', markdown: null })
    expect(unchanged.evidence.httpStatus).toBe(304)
    const api = await http.fetch(`${origin}/api-missing`)
    expect(api).toMatchObject({ status: 'failed', failureReason: 'http_error', markdown: null })
    expect(api.evidence.httpStatus).toBe(404)
  })
})

describe('HTTP lane on a page with no main content', () => {
  const pages: Record<string, string> = {
    '/nav-only': '<!doctype html><html><head><title>Harbour office</title></head><body><header><a href="/">Harbour office</a></header>' +
      '<nav><ul><li><a href="/tides">Tide tables</a></li><li><a href="notices">Notices</a></li></ul></nav><footer><p>Published by the harbour office</p></footer></body></html>',
    '/shell': '<!doctype html><html><head><title>App</title></head><body><div id="root"></div><noscript>Enable JavaScript to run this app.</noscript></body></html>',
    // Site chrome around the script that writes the page (quotes.toscrape.com/js/ reads this way), and an app root with nothing but its script.
    '/tide-board': '<!doctype html><html><head><title>Harbour office</title></head><body><header><a href="/">Harbour office</a></header>' +
      '<nav><ul><li><a href="/tides">Tide tables</a></li></ul></nav><div class="board"></div>' +
      `<script>/* ${'tide board loader '.repeat(120)} */ document.querySelector('.board').innerHTML = '<p>Ravine gauge station: 1.10 m at 06:40</p>'</script>` +
      '<footer><p>Published by the harbour office</p></footer></body></html>',
    '/app': `<!doctype html><html><head><title>App</title></head><body><div id="root"></div><script>/* ${'app loader '.repeat(300)} */ document.getElementById('root').innerHTML = '<h1>Hello</h1>'</script></body></html>`,
  }
  let origin: string
  let server: import('node:http').Server
  const http = new ResilientHttpSubject()

  beforeAll(async () => {
    const { createServer } = await import('node:http')
    server = createServer((req, res) => {
      const page = pages[req.url ?? '']
      if (page === undefined) res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
      else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await http.teardown()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const whole = () => `[Harbour office](${origin}/)\n\n- [Tide tables](${origin}/tides)\n- [Notices](${origin}/notices)\n\nPublished by the harbour office`

  it('keeps the whole page as evidence on a failed result and still asks for the browser lane', async () => {
    const out = await http.fetch(`${origin}/nav-only`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: whole(), usage: { contentTokens: null } })
    expect(out.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }])
    expect(out.links).toEqual([`${origin}/`, `${origin}/tides`, `${origin}/notices`])
    expect(out.document).toBeUndefined()
    // A page with no text at all has no evidence page either.
    expect(await http.fetch(`${origin}/shell`)).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: null })
  })

  it('returns the whole page for onlyMainContent false and still offers it to the browser lane', async () => {
    const out = await http.fetch(`${origin}/nav-only`, undefined, undefined, {}, undefined, { onlyMainContent: false })
    expect(out).toMatchObject({ status: 'success', failureReason: null, escalations: [], markdown: whole(), metadata: { title: 'Harbour office' } })
    expect(out.usage.contentTokens).toBeGreaterThan(0)
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'extract', detail: expect.objectContaining({ escalate: true, onlyMainContent: false }) }))
    expect(out.trace).toContainEqual(expect.objectContaining({ event: 'quality_low_yield' }))
    const shell = await http.fetch(`${origin}/shell`, undefined, undefined, {}, undefined, { onlyMainContent: false })
    expect(shell).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: null })
  })

  it('says why a client-rendered shell has no main content: the warning and the event travel with the evidence', async () => {
    const board = await http.fetch(`${origin}/tide-board`)
    expect(board).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: `[Harbour office](${origin}/)\n\n- [Tide tables](${origin}/tides)\n\nPublished by the harbour office` })
    expect(board.escalations).toEqual([{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }])
    expect(board.warnings).toEqual([{ code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (script_shell); this HTTP capture may be a shell.' }])
    expect(board.trace).toContainEqual(expect.objectContaining({ event: 'quality_client_rendered', detail: expect.objectContaining({ reason: 'script_shell', markers: [], emptyTables: 0, textChars: expect.any(Number), scriptChars: expect.any(Number) }) }))
    // Asked for whole, the same page is a success with the same caveat.
    const whole = await http.fetch(`${origin}/tide-board`, undefined, undefined, {}, undefined, { onlyMainContent: false })
    expect(whole).toMatchObject({ status: 'success', markdown: board.markdown, warnings: [{ code: 'client_rendered_suspected' }] })
    // A shell with no text has no evidence page, and still says why it is empty.
    const app = await http.fetch(`${origin}/app`)
    expect(app).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: null, warnings: [{ code: 'client_rendered_suspected', message: expect.stringContaining('(empty_app_root)') }] })
    expect(app.trace).toContainEqual(expect.objectContaining({ event: 'quality_client_rendered', detail: expect.objectContaining({ reason: 'empty_app_root', markers: ['app_root_empty'] }) }))
  })
})

describe('HTTP lane on a client-rendered shell', () => {
  it('keeps the success, warns that the capture may be a shell, and says why in the trace', async () => {
    const { createServer } = await import('node:http')
    // A data page whose grid a script fills in: prose the lane extracts as a
    // success, and a table with a row but no cells beside the grid's script.
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<!doctype html><html><head><title>Monthly index</title></head><body><main><h1>Monthly index</h1>' +
          '<p>The monthly index is published for every gauge station in the survey area, and revised when late readings arrive.</p>' +
          '<table id="grid"><thead><tr></tr></thead><tbody></tbody></table>' +
          `<script>/* ${'grid loader '.repeat(120)} */ document.getElementById('grid').innerHTML = '<tr><td>Ravine gauge station</td><td>1.10</td></tr>'</script>` +
          '</main></body></html>',
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    const http = new ResilientHttpSubject()
    try {
      const out = await http.fetch(`http://127.0.0.1:${address.port}/index`)
      expect(out).toMatchObject({ status: 'success', lane: 'http', failureReason: null, escalations: [] })
      expect(out.markdown).toContain('Monthly index')
      expect(out.warnings).toEqual([{ code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (empty_table_with_scripts); this HTTP capture may be a shell.' }])
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'quality_client_rendered', detail: expect.objectContaining({ reason: 'empty_table_with_scripts', markers: [], emptyTables: 1, scriptChars: expect.any(Number), textChars: expect.any(Number) }) }))
      // The table has a row, so it is not one of the row-less shells quality_low_yield counts: this signal stands on its own.
      expect(out.trace.some((event) => event.event === 'quality_low_yield')).toBe(false)
    } finally {
      await http.teardown()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('HTTP lane on a terse product page beside cut recommendations', () => {
  it('answers it itself: no low-yield or shell offer to the browser', async () => {
    const { createServer } = await import('node:http')
    // sandbox.oxylabs.io: a Next.js product page, titled by its one h2, whose
    // related games are cut and whose sidebar holds short platform entries.
    const blurb = 'Thrown into a parallel world by the mischievous actions of a possessed Skull Kid, Link finds a land in grave danger and only seventy-two hours to save it.'
    const related = (n: number) => `<div class="card"><a href="/products/${n}"><h4>Related game ${n}</h4></a><p>${blurb} ${blurb} ${blurb}</p><div class="price-wrapper">8${n},99 €</div></div>`
    const platforms = ['wii', 'wii-u', 'nintendo-64', 'switch', 'gamecube', 'game-boy-advance', '3ds'].map((p) => `<li>${p}</li>`).join('')
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><html><head><title>Zelda</title></head><body><main><div class="categories"><p>Game platforms:</p><ul><li><a href="/c/nintendo">Nintendo platform</a><ul>${platforms}</ul></li><li>Dreamcast</li><li>Stadia</li></ul></div>` +
          '<div class="product"><div class="product-info-wrapper"><h2>The Legend of Zelda: Ocarina of Time</h2><p><b>Developer:</b> Nintendo</p>' +
          '<p class="description">As a young boy, Link is tricked by Ganondorf, the King of the Gerudo Thieves. The evil human uses Link to gain access to the Sacred Realm, where he places his tainted hands on Triforce and transforms the beautiful Hyrulean landscape into a barren wasteland. Link is determined to fix the problems he helped to create, so with the help of Rauru he travels through time gathering the powers of the Seven Sages.</p>' +
          `<div class="price">91,99 €</div><p>In stock</p></div></div><section class="related"><h3>You may also like</h3>${related(1)}${related(2)}</section></main>` +
          `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { product: { id: 1, blurb: blurb.repeat(16) } } } })}</script></body></html>`,
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    const http = new ResilientHttpSubject()
    try {
      const out = await http.fetch(`http://127.0.0.1:${address.port}/products/1`)
      expect(out).toMatchObject({ status: 'success', lane: 'http', failureReason: null, escalations: [] })
      expect(out.markdown).toContain('Seven Sages')
      expect(out.markdown).not.toContain('Related game 1')
      expect(out.warnings ?? []).toEqual([])
      expect(out.trace.some((event) => event.event === 'quality_low_yield' || event.event === 'quality_client_rendered')).toBe(false)
    } finally {
      await http.teardown()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('hosted network policy on the HTTP arm', () => {
  it('denies cloud metadata before a wire request', async () => {
    const hosted = new ResilientHttpSubject('standard', hostedNetworkPolicy())
    const out = await hosted.fetch('http://169.254.169.254/latest/meta-data/')
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('policy_denied')
    expect(out.usage.requestCount).toBe(0)
    // The address policy is the reason, not the robots.txt it also blocks.
    expect(out.trace.some(event => event.event === 'ssrf_denied')).toBe(true)
    expect(out.trace.some(event => event.event === 'robots_disallowed')).toBe(false)
  })
})

describe('HTTP lane egress failures', () => {
  it('accepts about 20 KiB of response headers, above undici\'s 16 KiB default', async () => {
    const { createServer } = await import('node:http')
    const server = createServer((_req, res) => {
      for (let i = 0; i < 20; i++) res.setHeader(`x-padding-${i}`, 'x'.repeat(1024))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><body><article><h1>Global locations</h1><p>A page whose server sends more header bytes than the HTTP client accepted by default, which failed as a connection error before the limit was raised.</p></article></body></html>')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no fixture address')
    const http = new ResilientHttpSubject()
    try {
      const out = await http.fetch(`http://127.0.0.1:${address.port}/emea`)
      expect(out.status).toBe('success')
      expect(out.markdown).toContain('Global locations')
    } finally {
      await http.teardown()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('reports a host that does not resolve as dns_error, not policy_denied', async () => {
    const http = new ResilientHttpSubject()
    try {
      const out = await http.fetch('http://w2l-dns-failure.invalid/page')
      expect(out).toMatchObject({ status: 'failed', failureReason: 'dns_error' })
      expect(out.usage.requestCount).toBe(0)
      expect(out.trace.some(event => event.event === 'dns_failed')).toBe(true)
    } finally { await http.teardown() }
  })
})
