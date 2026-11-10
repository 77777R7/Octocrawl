import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { chromium, type Browser } from 'playwright'

let server: ViteDevServer
let browser: Browser
let origin: string
beforeAll(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  await server.listen()
  origin = server.resolvedUrls!.local[0]!
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => { await browser?.close(); await server?.close() })

const failed = { status: 'failed', verifier: 'verify/4', contractSha256: 'contract', reason: 'checks_failed', checks: [{ type: 'minTables', passed: false, observed: '0 tables, at least 1 asked' }] }
const passed = { ...failed, status: 'passed', reason: null, checks: [] }

describe('rendered task completion', () => {
  it.each([
    // The demo sends no task contract, so these say what happened and leave the contract unmentioned.
    { name: 'older response', extra: {}, label: 'Page read', tone: 'success', detail: 'Navigation only', absent: 'task contract' },
    { name: 'long URL on phone', extra: { finalUrl: 'https://www.walmart.com/browse/electronics/laptops/3944_3951_1089430_132960' }, label: 'Page read', detail: 'Navigation only', absent: 'task contract' },
    { name: 'not requested', extra: { verification: { status: 'not_requested' } }, label: 'Page read', tone: 'success', detail: 'Navigation only', absent: 'task contract' },
    { name: 'complete JSON without task checks', extra: { json: { status: 'complete', data: { title: 'Captured page' }, evidence: [], issues: [] } }, label: 'Page read', detail: 'Captured page', absent: 'task contract' },
    { name: 'partial read', extra: { status: 'incomplete', verification: { status: 'not_requested' } }, label: 'Partial result', tone: 'partial', detail: 'could not verify every field', absent: 'task contract' },
    { name: 'not requested, content not extracted', extra: { verification: { status: 'not_requested' }, readiness: { state: 'not_extracted', basis: [] } }, label: 'Page read', tone: 'partial', detail: 'target content was not extracted', absent: 'task contract' },
    { name: 'verified empty allowed', extra: { status: 'incomplete', markdown: '', verification: passed }, label: 'Configured checks passed', detail: 'independent field accuracy' },
    { name: 'empty not allowed', extra: { status: 'incomplete', markdown: '', verification: { ...failed, reason: 'empty_not_allowed', checks: [] } }, label: 'Configured checks failed', detail: 'An empty result is not allowed' },
    { name: 'failed checks', extra: { verification: failed, readiness: { state: 'not_extracted', basis: [] } }, label: 'Configured checks failed', tone: 'partial', detail: '0 tables, at least 1 asked' },
    { name: 'passed checks', extra: { verification: passed, readiness: { state: 'ready', basis: [] } }, label: 'Configured checks passed', detail: 'independent field accuracy' },
    { name: 'source error and weak passed check', extra: { verification: passed, readiness: { state: 'not_served', basis: ['source_data_error'] } }, label: 'Target data unavailable', detail: 'Configured checks passed' },
    { name: 'source warning without derived readiness', extra: { warnings: [{ code: 'source_data_error', message: 'Unavailable' }] }, label: 'Target data unavailable', tone: 'partial', detail: 'did not serve the target data', absent: 'task contract' },
    { name: 'login wall', extra: { status: 'blocked', diagnostic: { code: 'login_required', stage: 'acquisition', evidence: 'observed' }, reason: 'The page requires a login.' }, label: 'Login required', detail: 'does not bypass login walls' },
    { name: 'captcha', extra: { status: 'blocked', diagnostic: { code: 'challenge', stage: 'acquisition', evidence: 'observed' }, reason: 'A captcha is required.' }, label: 'Verification page', detail: 'does not solve verification challenges' },
    { name: 'existing quote diagnosis', extra: { status: 'incomplete', diagnostic: { code: 'quote_conflicting', stage: 'field', evidence: 'observed' }, reason: 'Conflicting quotes.' }, label: 'Conflicting quote evidence', detail: 'Conflicting quotes.' },
  ] as { name: string; extra: Record<string, unknown>; label: string; tone?: string; detail: string; absent?: string }[])('$name', async ({ extra, label, tone, detail, absent }) => {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== new URL(origin).origin) return route.abort()
        if (url.pathname === '/api/preview') return route.fulfill({ json: { status: 'success', requestedUrl: 'https://example.test', finalUrl: 'https://example.test', title: 'Captured page', markdown: 'Navigation only', totalMs: 10, reason: null, ...extra } })
        if (url.pathname === '/api/quota') return route.fulfill({ json: { enabled: true, remaining: 5, limit: 5 } })
        if (url.pathname === '/api/capability') return route.fulfill({ json: {} })
        return route.continue()
      })
      await page.goto(origin)
      await page.locator('#url-input').fill('https://example.test')
      await page.locator('#submit-button').click()
      await page.waitForFunction(() => document.querySelector('.run-status') && !document.querySelector('.run-status')!.classList.contains('tone-loading'))
      expect(await page.locator('.run-status').innerText()).toBe(label)
      const bounds = await page.locator('.run-status').evaluate(element => ({ right: element.getBoundingClientRect().right, cardRight: element.closest('.run-card')!.getBoundingClientRect().right }))
      expect(bounds.right).toBeLessThanOrEqual(bounds.cardRight)
      if (tone) expect(await page.locator('.run-status').getAttribute('class')).toContain(`tone-${tone}`)
      expect(await page.locator('#run-detail').innerText()).toContain(detail)
      if (absent) expect(await page.locator('#run-detail').innerText()).not.toContain(absent)
      expect(await page.locator('#run-detail').innerText()).not.toContain('Please try again later')
      expect(errors).toEqual([])
    } finally { await page.close() }
  })
})

describe('a view the result cannot fill', () => {
  it('says so in that view and keeps the panel and its other views', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== new URL(origin).origin) return route.abort()
        // Links that are not the strings the view reads.
        if (url.pathname === '/api/preview') return route.fulfill({ json: { status: 'success', requestedUrl: 'https://example.test', finalUrl: 'https://example.test', title: 'Captured page', markdown: 'The page’s words', totalMs: 10, reason: null, links: [{ url: 'https://example.test/a' }], linksTotal: 1 } })
        if (url.pathname === '/api/quota') return route.fulfill({ json: { enabled: true, remaining: 5, limit: 5 } })
        if (url.pathname === '/api/capability') return route.fulfill({ json: {} })
        return route.continue()
      })
      await page.goto(origin)
      await page.locator('#url-input').fill('https://example.test')
      await page.locator('#submit-button').click()
      await page.locator('.window-tab', { hasText: 'Links' }).click()
      expect(await page.locator('#window-body').innerText()).toContain('The Links view could not be shown for this result.')
      expect(await page.locator('.window-tab[aria-selected="true"]').innerText()).toBe('Links')
      expect(await page.locator('.output-panel .copy-button').isDisabled()).toBe(true)
      await page.locator('.window-tab', { hasText: 'Markdown' }).click()
      expect(await page.locator('#window-body').innerText()).toContain('The page’s words')
      expect(errors).toEqual([])
    } finally { await page.close() }
  })
})

describe('Try an example', () => {
  it('reads the example page at once, dropping an earlier hint still on its way without sending one for the example', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const previews: unknown[] = []
    const hints: string[] = []
    let release = (): void => {}
    const held = new Promise<void>(resolve => { release = resolve })
    try {
      await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== new URL(origin).origin) return route.abort()
        if (url.pathname === '/api/preview') {
          previews.push(route.request().postDataJSON())
          return route.fulfill({ json: { status: 'success', requestedUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview', finalUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview', title: 'Overview of HTTP', markdown: '# Overview of HTTP', totalMs: 10, reason: null, verification: { status: 'not_requested' } } })
        }
        if (url.pathname === '/api/capability') {
          hints.push(url.pathname)
          await held
          // The page has dropped the request by then.
          return route.fulfill({ json: { capability: { task: 'readable_page', support: 'unsupported' } } }).catch(() => {})
        }
        if (url.pathname === '/api/quota') return route.fulfill({ json: { enabled: true, remaining: 5, limit: 5 } })
        return route.continue()
      })
      await page.goto(origin)
      // A hint for an address typed before must not land beside the example's run. The example sits in the note
      // under the card, which a hint already shown replaces, so the hint here is still on its way.
      await page.locator('#url-input').fill('https://example.test/other')
      await expect.poll(() => hints.length, { timeout: 10_000 }).toBe(1)
      await page.locator('#example-button').click()
      await page.waitForFunction(() => document.querySelector('.run-status') && !document.querySelector('.run-status')!.classList.contains('tone-loading'))
      expect(previews).toEqual([{ url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview' }])
      expect(await page.locator('.run-status').innerText()).toBe('Page read')
      release()
      await page.waitForTimeout(400)
      expect(hints).toEqual(['/api/capability'])
      expect(await page.locator('#capability-message').textContent()).toBe('')
      expect(await page.locator('#url-help').isHidden()).toBe(false)
      expect(errors).toEqual([])
    } finally { release(); await page.close() }
  })
})
