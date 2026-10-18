import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sha256Utf8 } from '@w2l/http-core'
import { captureLayout } from '../src/browserLayout.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

// The real development capture has an empty light-DOM host and an open
// shadow root containing a role=table made of div rows/cells, not <table>.
const shadow = '<style>:host{display:block}[role=table]{display:table}[role=row]{display:table-row}[role=cell]{display:table-cell;padding:4px}</style><div role="table"><div role="row" part="table-header-row"><div role="cell">Date</div><div role="cell">Close/Last</div><div role="cell">Volume</div></div><div role="row"><div role="cell">10/14/2026</div><div role="cell">$342.96</div><div role="cell">50,061,050</div></div><div role="row"><div role="cell">10/13/2026</div><div role="cell">$341.27</div><div role="cell">0</div></div></div>'
const markup = (mode = 'open', style = '', inner = shadow) => `<html><body><main><h1>Historical quotes</h1><quote-table style="${style}"></quote-table><table><tr><th></th></tr><tr><td></td></tr></table></main><script>document.querySelector('quote-table').attachShadow({mode:${JSON.stringify(mode)}}).innerHTML=${JSON.stringify(inner)}</script></body></html>`
let browser: Browser
let server: Server
let url: string
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'text/html' }).end(markup())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
afterAll(async () => { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())) })

describe('visible open shadow table capture', () => {
  it('keeps the original shadow markup as source and materializes its explicit table in the layout copy', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(markup())
      expect(await page.locator('quote-table [role=cell]').allTextContents()).toContain('$342.96')
      const body = await page.content()
      const captured = await captureLayout(page, body)
      expect(captured.html).toContain('<th>Date</th>')
      expect(captured.sourceHtml).toContain('<template shadowrootmode="open">')
      expect(captured.html).toContain('<table')
      expect(captured.html).toContain('<td>$342.96</td>')
      expect(captured.html).toContain('<td>0</td>')
      expect(captured.detail.shadowTables).toMatchObject({ outcome: 'captured', tables: 1, rows: 2 })
      expect(await page.content()).toBe(body)
    } finally { await page.close() }
  })

  it('delivers the data and the same captured source through the browser subject', async () => {
    const subject = new BrowserLocalSubject('standard')
    try {
      const result = await subject.fetch(url, undefined, undefined, undefined, { includeRawHtml: true, includeHtml: true, includeTables: true })
      expect(result.status).toBe('success')
      expect(result.markdown).toContain('$342.96')
      expect(result.tables?.some(table => table.rows.some(row => row.includes('10/14/2026') && row.includes('$342.96') && row.includes('50,061,050')))).toBe(true)
      expect(result.rawHtml).toContain('<template shadowrootmode="open">')
      expect(result.evidence.rawBodySha256).toBe(sha256Utf8(result.rawHtml!))
    } finally { await subject.teardown() }
  })

  it('keeps an excluded host out of the delivered content', async () => {
    const subject = new BrowserLocalSubject('standard')
    try {
      const result = await subject.fetch(url, undefined, undefined, undefined, { includeRawHtml: true, includeTables: true, excludeTags: ['quote-table'] })
      expect(result.markdown ?? '').not.toContain('$342.96')
      expect(result.tables?.some(table => table.rows.some(row => row.includes('$342.96'))) ?? false).toBe(false)
    } finally { await subject.teardown() }
  })

  it('does not invent a capture for closed, hidden, or semantically unheaded roots', async () => {
    const page = await browser.newPage()
    try {
      for (const html of [markup('closed'), markup('open', 'display:none'), markup('open', '', shadow.replace('part="table-header-row"', '')), markup('open', '', shadow.replace('$342.96', '<a href="/quote">$342.96</a>'))]) {
        await page.setContent(html)
        const body = await page.content()
        expect((await captureLayout(page, body)).sourceHtml).toBeUndefined()
        expect(await page.content()).toBe(body)
      }
    } finally { await page.close() }
  })

  it('falls back without partial shadow data at the root, node and source-size limits', async () => {
    const page = await browser.newPage()
    try {
      for (const [options, outcome] of [
        [{ maxShadowRoots: 0 }, 'root_cap'],
        [{ maxShadowElements: 2 }, 'element_cap'],
        [{ maxShadowHtml: 100 }, 'html_cap'],
      ] as const) {
        await page.setContent(markup())
        const body = await page.content()
        const result = await captureLayout(page, body, options)
        expect(result.sourceHtml).toBeUndefined()
        expect(result.detail.shadowTables).toMatchObject({ outcome, tables: 0, rows: 0 })
        expect(await page.content()).toBe(body)
      }
    } finally { await page.close() }
  })

  it('does not lose normal layout markers outside the captured root', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(markup().replace('<main>', '<main><p>Open <span style="display:none">secret</span><span style="display:block">visible</span></p>'))
      const result = await captureLayout(page, await page.content())
      expect(result.html).toContain('data-w2l-hidden')
      expect(result.html).toContain('<td>$342.96</td>')
      expect(result.sourceHtml).not.toContain('data-w2l-hidden')
    } finally { await page.close() }
  })

  it('declines a shadow tree changed by a synchronous layout-attribute reaction', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<html><body><quote-table></quote-table><script>customElements.define('quote-table', class extends HTMLElement { static get observedAttributes() { return ['data-w2l-display']; } constructor() { super(); this.attachShadow({mode:'open'}).innerHTML=${JSON.stringify(shadow)}; } attributeChangedCallback() { this.shadowRoot.querySelector('[role=cell]').textContent = 'Changed'; } });</script></body></html>`)
      const body = await page.content()
      const result = await captureLayout(page, body)
      expect(result.sourceHtml).toBeUndefined()
      expect(result.detail.shadowTables).toMatchObject({ outcome: 'serialization_mismatch', tables: 0 })
      expect(await page.content()).toBe(body)
    } finally { await page.close() }
  })

  it('never substitutes an identical template quoted in a script before the real host', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(markup())
      const quoted = await page.evaluate(() => {
        const host = document.querySelector('quote-table')!
        const quoted = host.getHTML({ shadowRoots: [host.shadowRoot!] }).trim()
        const script = document.createElement('script')
        script.type = 'application/json'
        script.id = 'quoted-template'
        script.textContent = quoted
        document.body.prepend(script)
        return quoted
      })
      const captured = await captureLayout(page, await page.content())
      expect(captured.html).toContain(`<script type="application/json" id="quoted-template">${quoted}</script>`)
      expect(captured.html).toMatch(/<quote-table\b[^>]*><table>/)
    } finally { await page.close() }
  })

  it('keeps identical live hosts separate and locates both source roots', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(markup())
      await page.evaluate((source) => {
        const host = document.createElement('quote-table')
        host.attachShadow({ mode: 'open' }).innerHTML = source
        document.body.appendChild(host)
      }, shadow)
      const result = await captureLayout(page, await page.content())
      expect(result.detail.shadowTables).toMatchObject({ outcome: 'captured', tables: 2, rows: 4 })
      expect(result.detail.shadowTables!.hosts).toHaveLength(2)
      expect(result.html!.match(/<th>Date<\/th>/g)).toHaveLength(2)
      expect(result.sourceHtml!.match(/<template shadowrootmode="open">/g)).toHaveLength(2)
    } finally { await page.close() }
  })
})
