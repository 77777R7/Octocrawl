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
    { name: 'older response', extra: {}, label: 'Page read · Task unverified', detail: 'not been verified' },
    { name: 'not requested', extra: { verification: { status: 'not_requested' } }, label: 'Page read · Task unverified', detail: 'not been verified' },
    { name: 'complete JSON without task checks', extra: { json: { status: 'complete', data: { title: 'Captured page' }, evidence: [], issues: [] } }, label: 'Page read · Task unverified', detail: 'not been verified' },
    { name: 'verified empty allowed', extra: { status: 'incomplete', markdown: '', verification: passed }, label: 'Configured checks passed', detail: 'independent field accuracy' },
    { name: 'empty not allowed', extra: { status: 'incomplete', markdown: '', verification: { ...failed, reason: 'empty_not_allowed', checks: [] } }, label: 'Configured checks failed', detail: 'An empty result is not allowed' },
    { name: 'failed checks', extra: { verification: failed, readiness: { state: 'not_extracted', basis: [] } }, label: 'Configured checks failed', detail: '0 tables, at least 1 asked' },
    { name: 'passed checks', extra: { verification: passed, readiness: { state: 'ready', basis: [] } }, label: 'Configured checks passed', detail: 'independent field accuracy' },
    { name: 'source error and weak passed check', extra: { verification: passed, readiness: { state: 'not_served', basis: ['source_data_error'] } }, label: 'Target data unavailable', detail: 'Configured checks passed' },
    { name: 'source warning without derived readiness', extra: { warnings: [{ code: 'source_data_error', message: 'Unavailable' }] }, label: 'Target data unavailable', detail: 'not been verified' },
    { name: 'login wall', extra: { status: 'blocked', diagnostic: { code: 'login_required', stage: 'acquisition', evidence: 'observed' }, reason: 'The page requires a login.' }, label: 'Login required', detail: 'does not bypass login walls' },
    { name: 'captcha', extra: { status: 'blocked', diagnostic: { code: 'challenge', stage: 'acquisition', evidence: 'observed' }, reason: 'A captcha is required.' }, label: 'Verification page', detail: 'does not solve verification challenges' },
    { name: 'existing quote diagnosis', extra: { status: 'incomplete', diagnostic: { code: 'quote_conflicting', stage: 'field', evidence: 'observed' }, reason: 'Conflicting quotes.' }, label: 'Conflicting quote evidence', detail: 'Conflicting quotes.' },
  ])('$name', async ({ extra, label, detail }) => {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
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
      expect(await page.locator('#run-detail').innerText()).toContain(detail)
      expect(await page.locator('#run-detail').innerText()).not.toContain('Please try again later')
      expect(errors).toEqual([])
    } finally { await page.close() }
  })
})
