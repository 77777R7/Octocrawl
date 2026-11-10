import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { chromium, type Browser, type Page } from 'playwright'

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

const paragraph = 'The words of the page, read by the octopus and set down the window as the text they are. '
const read = { status: 'success', finalUrl: 'https://example.test/', title: 'Captured page', markdown: `# Captured page\n\n${paragraph.repeat(4)}\n\n## More of it\n\n${paragraph.repeat(4)}`, reason: null }
const loginWall = { status: 'blocked', finalUrl: 'https://example.test/login', title: null, markdown: null, reason: 'The page requires a login.', diagnostic: { code: 'login_required', stage: 'acquisition', evidence: 'observed' } }

/** A page with motion allowed, so the crawl window plays; the preview answers `result` after `delay` ms. */
async function open(result: Record<string, unknown>, delay: number): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== new URL(origin).origin) return route.abort()
    if (url.pathname === '/api/preview') {
      await new Promise(resolve => setTimeout(resolve, delay))
      return route.fulfill({ json: { requestedUrl: 'https://example.test/', totalMs: delay, ...result } }).catch(() => {})
    }
    if (url.pathname === '/api/quota') return route.fulfill({ json: { enabled: true, remaining: 5, limit: 5 } })
    if (url.pathname === '/api/capability') return route.fulfill({ json: {} })
    return route.continue()
  })
  await page.goto(origin)
  await page.locator('#url-input').fill('https://example.test/')
  await page.locator('#submit-button').click()
  return { page, errors }
}

/** How many of the window's canvas pixels are bright and cool, as the octopus's ice-white ink is (crawlView.ts INK).
 * Before a page is read the only other such ink is the gate's ten-letter label; the page's lines are dim and the bar
 * is warm. */
const iceInk = (page: Page): Promise<number> => page.locator('.crawl-canvas').evaluate((canvas: HTMLCanvasElement) => {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  let count = 0
  for (let i = 0; i < data.length; i += 4) if (data[i]! > 150 && data[i + 1]! > 170 && data[i + 2]! > 220 && data[i + 2]! > data[i]!) count++
  return count
})

/** How many pixels of the canvas's left half, above the bar, are all but white: the ink a read page's words are set
 * in. The octopus lands in the right half, and the page's own lines are dim. */
const wordInk = (page: Page): Promise<number> => page.locator('.crawl-canvas').evaluate((canvas: HTMLCanvasElement) => {
  const width = Math.floor(canvas.width / 2)
  const height = Math.floor(canvas.height * 0.75)
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, width, height)
  let count = 0
  for (let i = 0; i < data.length; i += 4) if (data[i]! > 232 && data[i + 1]! > 238 && data[i + 2]! > 248) count++
  return count
})

describe('the crawl window', () => {
  it('plays while a page is read, then folds away and leaves the result', async () => {
    const { page, errors } = await open(read, 2200)
    try {
      await page.locator('.url-card.is-crawling #crawl-window').waitFor({ state: 'visible', timeout: 3000 })
      // The octopus is not there at once: it emerges, and is whole well before the result.
      // (About 900 such pixels as the window opens, about 7,600 once the octopus and its arms are whole.)
      const before = await iceInk(page)
      await expect.poll(() => iceInk(page), { timeout: 1900, interval: 100 }).toBeGreaterThan(before + 3000)
      expect(await page.locator('#crawl-note').isHidden()).toBe(true)
      // Nothing of the page is set as words before its result is back.
      const unread = await wordInk(page)
      expect(unread).toBeLessThan(600)
      await page.waitForFunction(() => document.querySelector('#crawl-status')!.textContent === 'Page read. Your result is below.', null, { timeout: 4000 })
      // Once it has landed, the page's own Markdown stands in the window's left half.
      // (The dive takes 2 s, then the landing's ring runs out.)
      await expect.poll(() => wordInk(page), { timeout: 6000, interval: 80 }).toBeGreaterThan(unread + 2500)
      await page.locator('#crawl-window').waitFor({ state: 'hidden', timeout: 8000 })
      expect(await page.locator('.url-card').getAttribute('class')).toBe('url-card')
      expect(await page.locator('.run-status').innerText()).toBe('Page read')
      // The page comes to rest on the ledger: the run's row has printed itself, with its result under it.
      await expect.poll(() => page.locator('.run-card').evaluate((row: HTMLElement) => `${row.style.opacity}|${row.getAttribute('aria-busy')}`), { timeout: 5000 }).toBe('|null')
      // (16 px below the top of the screen, give or take the smooth scroll's last fraction of a pixel.)
      await expect.poll(() => page.locator('.runs-ledger').evaluate((ledger) => Math.abs(ledger.getBoundingClientRect().top - 16) <= 1.5), { timeout: 5000 }).toBe(true)
      expect(await page.locator('#result-heading').innerText()).toBe('Captured page')
      expect(await page.locator('.run-time').innerText()).toMatch(/^\d+(\.\d+)? (ms|s)$/)
      expect(errors).toEqual([])
    } finally { await page.close() }
  })

  it('shows why a page was not read, then folds away', async () => {
    const { page, errors } = await open(loginWall, 300)
    try {
      await page.locator('#crawl-note').waitFor({ state: 'visible', timeout: 3000 })
      expect(await page.locator('#crawl-note strong').textContent()).toBe('Login required')
      expect(await page.locator('#crawl-note span').textContent()).toBe('The page requires a login.')
      await page.locator('#crawl-window').waitFor({ state: 'hidden', timeout: 8000 })
      expect(await page.locator('.run-status').innerText()).toBe('Login required')
      expect(errors).toEqual([])
    } finally { await page.close() }
  })

  it('closes at once on Escape while the run goes on to its result', async () => {
    const { page, errors } = await open(read, 2500)
    try {
      await page.locator('.url-card.is-crawling #crawl-window').waitFor({ state: 'visible', timeout: 3000 })
      await page.keyboard.press('Escape')
      await page.locator('#crawl-window').waitFor({ state: 'hidden', timeout: 1500 })
      expect(await page.locator('.run-status').innerText()).toBe('Extracting…')
      // The run's row counts its time up while it is out.
      const counted = await page.locator('.run-time').innerText()
      expect(counted).toMatch(/^\d+\.\d s$/)
      await expect.poll(() => page.locator('.run-time').innerText(), { timeout: 1500 }).not.toBe(counted)
      await page.waitForFunction(() => !document.querySelector('.run-status')!.classList.contains('tone-loading'), null, { timeout: 8000 })
      expect(await page.locator('.run-status').innerText()).toBe('Page read')
      expect(errors).toEqual([])
    } finally { await page.close() }
  })
})
