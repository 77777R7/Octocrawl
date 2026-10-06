import { assertSafeUrl, browserEngineFor } from '@w2l/bench'
import { evaluateUrl, hostedNetworkPolicy, modeIdentity, PREVIEW_PRODUCT_TOKEN, type NetworkPolicy } from '@w2l/contracts'

/**
 * The picture the crawl window plays over: the top of the page as a cold Chromium renders it, and where the elements
 * the window may mark sit in it. It is decoration for a page the preview read, never evidence, and it stays out of the
 * preview's result: the server sends it only on the stream, only once the HTTP capture's robots.txt decision allowed
 * the page, and only with a result that read the page.
 *
 * What the browser may do is narrow. It loads the page and nothing else: no clicks, no typing, no downloads, no
 * service workers. Every request it makes, the page's own and each subresource's, passes the hosted network policy
 * first, the same policy the HTTP lane applies: only http(s), and only to public addresses, decided after resolving
 * the name; a WebSocket is never connected. It answers to a budget and to the caller's signal, and it closes the
 * browser whatever happens.
 */
export interface CaptureElement {
  tag: string
  x: number
  y: number
  width: number
  height: number
  /** The element's own text, trimmed to a line; an image's alt text. */
  text: string
}

export interface ScreenshotCapture {
  /** The page's address once its own redirects, each checked, were followed. */
  finalUrl: string
  jpeg: Buffer
  width: number
  height: number
  elements: CaptureElement[]
  /** Requests the policy refused (subresources to private or unresolvable addresses, WebSockets). */
  blocked: number
  timings: { launchMs: number; navigateMs: number; loadMs: number; loadCapped: boolean; screenshotMs: number; totalMs: number }
}

export type Browser = Awaited<ReturnType<Awaited<ReturnType<typeof browserEngineFor>>['launch']>>

export interface CaptureOptions {
  signal: AbortSignal
  /** The whole capture, launch to close, ends within this. */
  budgetMs: number
  /** A browser already launching (launchBrowser), so the launch overlaps whatever came before: used and closed here. */
  browser?: Promise<Browser>
  /** Told each step as it completes, with the ms since the capture began: what a capture that ran late had done. */
  onProgress?: (step: 'launched' | 'navigated' | 'loaded' | 'pictured' | 'elements', ms: number) => void
  policy?: NetworkPolicy
  viewport?: { width: number; height: number }
  /** How many viewports tall the picture is at most. */
  viewports?: number
  quality?: number
}

export type ScreenshotCapturer = (url: string, options: CaptureOptions) => Promise<ScreenshotCapture>

const VIEWPORT = { width: 1280, height: 800 }
const VIEWPORTS = 2
const QUALITY = 60
/** After the document loaded, the window waits this long at most for its images and fonts. */
const LOAD_WAIT_MS = 400
const ELEMENTS_SELECTOR = 'h1,h2,h3,h4,p,li,a,img,table,pre,blockquote'
const ELEMENTS_AT_MOST = 400
const TEXT_AT_MOST = 120
/** An element narrower or shorter than this is not something a reader sees. */
const ELEMENT_SMALLEST_PX = 8
/** As many redirect hops as the HTTP lane follows. */
const REDIRECTS_AT_MOST = 3

const isRedirect = (status: number): boolean => status >= 300 && status < 400
/** A request's headers without those that describe a body it no longer has. */
const withoutBody = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => !['content-type', 'content-length', 'content-encoding', 'transfer-encoding'].includes(name.toLowerCase())))

/** A browser call that takes no timeout of its own, held to the budget. */
async function within<T>(step: string, deadline: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ScreenshotBudgetError(step)), Math.max(1, deadline - performance.now())) })
  try { return await Promise.race([work, late]) }
  finally { clearTimeout(timer) }
}

export class ScreenshotBudgetError extends Error {
  constructor(step: string) { super(`The screenshot's budget ran out while ${step}.`); this.name = 'ScreenshotBudgetError' }
}

/** The browser identifies itself as the preview does over HTTP, so a site's robots.txt rule for it holds here too. */
export function previewBrowserUserAgent(): string {
  return `${modeIdentity('standard').userAgent} ${PREVIEW_PRODUCT_TOKEN}`
}

/** A headless Chromium, launched now and handed to a capture later. Launching touches no site, so it may begin before
 * robots.txt is read; the caller closes it if no capture takes it. */
export async function launchBrowser(timeoutMs: number): Promise<Browser> {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  const engine = await browserEngineFor('playwright')
  // The environment's proxy when there is one, otherwise direct: never the operating system's proxy settings.
  return engine.launch({ headless: true, timeout: timeoutMs, ...(proxy ? { proxy: { server: proxy } } : { args: ['--proxy-server=direct://'] }) })
}

export const captureScreenshot: ScreenshotCapturer = async (url, options) => {
  const policy = options.policy ?? hostedNetworkPolicy()
  const viewport = options.viewport ?? VIEWPORT
  const started = performance.now()
  const deadline = started + options.budgetMs
  const remaining = (step: string): number => {
    const left = Math.floor(deadline - performance.now())
    if (left <= 0) throw new ScreenshotBudgetError(step)
    return left
  }
  options.signal.throwIfAborted()
  // The page's own address, before any browser exists.
  await assertSafeUrl(url, policy)
  // Each host's verdict is decided once per capture, after resolving its name, so a page with many subresources on
  // one host costs one lookup.
  const verdicts = new Map<string, Promise<boolean>>()
  let blocked = 0
  const allowed = (target: string): Promise<boolean> => {
    const first = evaluateUrl(target, policy)
    if ('allowed' in first) return Promise.resolve(first.allowed)
    let verdict = verdicts.get(first.hostname)
    if (verdict === undefined) {
      verdict = assertSafeUrl(target, policy).then(() => true, () => false)
      verdicts.set(first.hostname, verdict)
    }
    return verdict
  }
  const launchStarted = performance.now()
  const browser = await within('launching the browser', deadline, options.browser ?? launchBrowser(remaining('launching the browser')))
  // With a browser launched earlier this is only the wait for it, which may be nothing.
  const launchMs = Math.round(performance.now() - launchStarted)
  const progress = (step: Parameters<NonNullable<CaptureOptions['onProgress']>>[0]): void => { try { options.onProgress?.(step, Math.round(performance.now() - started)) } catch { /* advisory */ } }
  progress('launched')
  const close = (): void => { void browser.close().catch(() => {}) }
  options.signal.addEventListener('abort', close, { once: true })
  try {
    // Aborted while the browser started: nothing is loaded.
    options.signal.throwIfAborted()
    const context = await within('opening the page', deadline, browser.newContext({
      viewport, deviceScaleFactor: 1, userAgent: previewBrowserUserAgent(),
      acceptDownloads: false, serviceWorkers: 'block',
    }))
    // WebRTC opens TCP and UDP connections of its own (a TURN server, say), which no request routing sees: a page gets
    // no RTCPeerConnection here.
    await context.addInitScript(() => {
      for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) Object.defineProperty(window, name, { value: undefined, configurable: false, writable: false })
    })
    // Every request is made here, not by Chromium, with redirects followed one hop at a time: Chromium would follow a
    // redirect to any address on its own, after the only check it had passed. Each hop's address is judged before it
    // is fetched. A subresource gets the final response; the page itself is navigated again to where its redirects
    // led, so its address, and what its relative links mean, are the final page's.
    let navigateTo: string | null = null
    let hopsTaken = 0
    await context.route('**/*', async route => {
      try {
        const request = route.request()
        let url = request.url()
        if (!(await allowed(url))) { blocked++; await route.abort('blockedbyclient'); return }
        const isPage = request.isNavigationRequest() && request.frame().parentFrame() === null
        let method = request.method()
        // The request as the page made it, body and all; once a redirect turns it into a GET, the context's own
        // request, which carries no body (route.fetch would fall back to the page's).
        let response = await route.fetch({ url, maxRedirects: 0, timeout: remaining('loading the page') })
        for (let hop = isPage ? hopsTaken : 0; isRedirect(response.status()) && response.headers().location !== undefined; hop++) {
          if (hop >= REDIRECTS_AT_MOST) { blocked++; await route.abort('blockedbyclient'); return }
          url = new URL(response.headers().location!, url).href
          if (!(await allowed(url))) { blocked++; await route.abort('blockedbyclient'); return }
          if (isPage) { hopsTaken = hop + 1; navigateTo = url; await route.abort('aborted'); return }
          // As a browser does: a 301, 302 or 303 turns a POST into a GET without its body; a 307 or 308 keeps both.
          if (response.status() !== 307 && response.status() !== 308 && method !== 'GET' && method !== 'HEAD') method = 'GET'
          response = method === request.method()
            ? await route.fetch({ url, maxRedirects: 0, timeout: remaining('loading the page') })
            : await context.request.fetch(url, { method, headers: withoutBody(request.headers()), maxRedirects: 0, timeout: remaining('loading the page') })
        }
        await route.fulfill({ response })
      } catch {
        await route.abort('failed').catch(() => {})
      }
    })
    // A routed WebSocket that is never connected to its server stays silent.
    await context.routeWebSocket('**/*', ws => { blocked++; ws.close() })
    const page = await within('opening the page', deadline, context.newPage())
    const navigateStarted = performance.now()
    let finalUrl = url
    for (;;) {
      try {
        await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: remaining('loading the page') })
        break
      } catch (error) {
        if (navigateTo === null) throw error
        finalUrl = navigateTo
        navigateTo = null
      }
    }
    const navigateMs = Math.round(performance.now() - navigateStarted)
    progress('navigated')
    let loadCapped = false
    await page.waitForLoadState('load', { timeout: Math.min(LOAD_WAIT_MS, remaining('loading the page')) }).catch(() => { loadCapped = true })
    const loadMs = Math.round(performance.now() - navigateStarted)
    progress('loaded')
    const screenshotStarted = performance.now()
    const pageHeight = await within('measuring the page', deadline, page.evaluate(() => document.documentElement.scrollHeight))
    const height = Math.min(viewport.height * (options.viewports ?? VIEWPORTS), Math.max(viewport.height, pageHeight))
    const jpeg = await page.screenshot({
      type: 'jpeg', quality: options.quality ?? QUALITY, fullPage: true, animations: 'disabled',
      clip: { x: 0, y: 0, width: viewport.width, height }, timeout: remaining('taking the picture'),
    })
    const screenshotMs = Math.round(performance.now() - screenshotStarted)
    progress('pictured')
    const elements = await within('finding the elements', deadline, page.evaluate(({ selector, limit, atMost, textAtMost, smallest }) => {
      const found: CaptureElement[] = []
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const box = element.getBoundingClientRect()
        const y = box.top + window.scrollY
        // Too small to see (a page's hidden index for machines sits in a pixel off the edge) or below the picture.
        if (box.width < smallest || box.height < smallest || y + box.height <= 0 || y >= limit) continue
        const raw = element instanceof HTMLImageElement ? element.alt : (element as HTMLElement).innerText ?? element.textContent ?? ''
        found.push({ tag: element.tagName.toLowerCase(), x: Math.round(box.left + window.scrollX), y: Math.round(y), width: Math.round(box.width), height: Math.round(box.height), text: raw.replace(/\s+/g, ' ').trim().slice(0, textAtMost) })
        if (found.length >= atMost) break
      }
      return found.sort((a, b) => a.y - b.y || a.x - b.x)
    }, { selector: ELEMENTS_SELECTOR, limit: height, atMost: ELEMENTS_AT_MOST, textAtMost: TEXT_AT_MOST, smallest: ELEMENT_SMALLEST_PX }))
    progress('elements')
    await within('closing the page', deadline, context.close())
    return { finalUrl, jpeg, width: viewport.width, height, elements, blocked, timings: { launchMs, navigateMs, loadMs, loadCapped, screenshotMs, totalMs: Math.round(performance.now() - started) } }
  } finally {
    options.signal.removeEventListener('abort', close)
    await browser.close().catch(() => {})
  }
}
