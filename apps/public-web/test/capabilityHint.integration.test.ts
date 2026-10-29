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

describe('the address hint (/api/capability)', () => {
  it('is not sent once the form is submitted, and the example button waits while a run is in flight', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const hints: string[] = []
    let release = (): void => {}
    const held = new Promise<void>(resolve => { release = resolve })
    try {
      await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== new URL(origin).origin) return route.abort()
        if (url.pathname === '/api/capability') {
          hints.push(url.pathname)
          return route.fulfill({ json: { capability: { task: 'readable_page', support: 'conditional' } } })
        }
        if (url.pathname === '/api/preview') {
          await held
          return route.fulfill({ json: { status: 'success', requestedUrl: 'https://example.test/', finalUrl: 'https://example.test/', title: 'Page', markdown: 'Text', totalMs: 10, reason: null } })
        }
        if (url.pathname === '/api/quota') return route.fulfill({ json: { enabled: true, remaining: 5, limit: 5 } })
        return route.continue()
      })
      await page.goto(origin)
      // Typing schedules the hint 300 ms later; submitting in the same task always lands inside that wait.
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('#url-input')!
        input.value = 'https://example.test'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector<HTMLFormElement>('#preview-form')!.requestSubmit()
      })
      await page.waitForTimeout(700)
      expect(hints).toEqual([])
      // Mid-run, the example would replace the address being read and schedule a hint of its own.
      await page.locator('#example-button').click()
      await page.waitForTimeout(500)
      expect(await page.locator('#url-input').inputValue()).toBe('https://example.test/')
      expect(hints).toEqual([])
      release()
      await page.waitForFunction(() => document.querySelector('#preview-form')!.getAttribute('aria-busy') === 'false')
      expect(errors).toEqual([])
    } finally {
      release()
      await page.close()
    }
  })
})
