import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { assertSafeUrl, browserEngineFor } from '@w2l/bench'
import { hostedNetworkPolicy } from '@w2l/contracts'

/**
 * A measurement, for the operator only (W2L_EVAL_TOKEN): what a cold Chromium costs on this instance when it loads one
 * page and takes the screenshot the crawl window would show (the top three viewports, JPEG), with how many of the
 * elements the window would mark lie within it. It reports time, the Chromium process tree's peak resident memory and
 * CPU time, and the container's memory where the kernel tells it. It returns no image and keeps nothing.
 *
 * It is not the preview's browser lane: no robots.txt decision is taken here (the caller takes it from the HTTP
 * capture first), and only the page's own address is checked against the hosted network policy, not its
 * subresources. That is why it answers to the evaluation token alone.
 */
export interface ScreenshotProbe {
  ok: boolean
  error?: string
  http?: number | null
  /** Pixels captured: the viewport's width and the lesser of three viewports and the page. */
  clip?: { width: number; height: number }
  jpegBytes?: number
  /** Headings, paragraphs, list items, links, images, tables and code blocks inside the clip. */
  elements?: number
  timings: { launchMs?: number; navigateMs?: number; loadMs?: number; loadCapped?: boolean; screenshotMs?: number; elementsMs?: number; totalMs: number }
  /** The Chromium process tree, sampled every 50 ms: peak resident set and CPU time; null where the platform gives none. */
  chromium: { peakRssMb: number | null; cpuSeconds: number | null; samples: number }
  /** This process's resident set before and after, and the container's memory (cgroup v2) where present. */
  node: { rssMbBefore: number; rssMbAfter: number }
  container: { memoryCurrentMb: number | null; memoryPeakMb: number | null; memoryMaxMb: number | null }
}

const VIEWPORT = { width: 1280, height: 800 }
const VIEWPORTS_CAPTURED = 3
const NAVIGATE_TIMEOUT_MS = 20_000
const LOAD_WAIT_MS = 5_000
const SCREENSHOT_TIMEOUT_MS = 15_000
const ELEMENTS = 'h1,h2,h3,p,li,a,img,table,pre'

type ProcRow = { pid: number; ppid: number; rssKb: number; cpuSeconds: number }

/** Every process on the host, read from /proc on Linux or `ps` elsewhere; empty when neither can be read. */
function processes(): ProcRow[] {
  try {
    const pageKb = 4
    const rows: ProcRow[] = []
    const hz = 100
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue
      try {
        const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
        // The command name may hold spaces and parentheses; the fields of interest follow its closing parenthesis.
        const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
        const statm = readFileSync(`/proc/${name}/statm`, 'utf8').split(' ')
        rows.push({ pid: Number(name), ppid: Number(after[1]), rssKb: Number(statm[1]) * pageKb, cpuSeconds: (Number(after[11]) + Number(after[12])) / hz })
      } catch { /* The process ended between the listing and the read. */ }
    }
    if (rows.length > 0) return rows
  } catch { /* Not Linux. */ }
  try {
    return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,time='], { encoding: 'utf8' }).trim().split('\n').map(line => {
      const [pid, ppid, rss, time] = line.trim().split(/\s+/)
      const [clock, frac = '0'] = (time ?? '0').split('.')
      const cpuSeconds = clock!.split(/[-:]/).map(Number).reduce((total, part) => total * 60 + part, 0) + Number(`0.${frac}`)
      return { pid: Number(pid), ppid: Number(ppid), rssKb: Number(rss), cpuSeconds }
    })
  } catch { return [] }
}

/** The descendants of this process: Chromium and its helpers. */
function descendants(): ProcRow[] {
  const rows = processes()
  const kept = new Set([process.pid])
  let grew = true
  while (grew) {
    grew = false
    for (const row of rows) if (!kept.has(row.pid) && kept.has(row.ppid)) { kept.add(row.pid); grew = true }
  }
  return rows.filter(row => row.pid !== process.pid && kept.has(row.pid))
}

function cgroupMb(file: string): number | null {
  try {
    const text = readFileSync(`/sys/fs/cgroup/${file}`, 'utf8').trim()
    return text === 'max' ? null : Math.round(Number(text) / 1024 / 1024)
  } catch { return null }
}

export async function probeScreenshot(url: string, signal: AbortSignal): Promise<ScreenshotProbe> {
  const started = performance.now()
  const timings: ScreenshotProbe['timings'] = { totalMs: 0 }
  const rssMbBefore = Math.round(process.memoryUsage().rss / 1024 / 1024)
  let peakRssKb = 0
  let samples = 0
  const cpuByPid = new Map<number, number>()
  const sample = (): void => {
    const rows = descendants()
    if (rows.length === 0) return
    samples++
    peakRssKb = Math.max(peakRssKb, rows.reduce((total, row) => total + row.rssKb, 0))
    for (const row of rows) cpuByPid.set(row.pid, Math.max(cpuByPid.get(row.pid) ?? 0, row.cpuSeconds))
  }
  const report = (ok: boolean, rest: Partial<ScreenshotProbe> = {}): ScreenshotProbe => {
    timings.totalMs = Math.round(performance.now() - started)
    const cpu = [...cpuByPid.values()].reduce((total, value) => total + value, 0)
    return {
      ok, ...rest, timings,
      chromium: { peakRssMb: samples ? Math.round(peakRssKb / 1024) : null, cpuSeconds: samples ? Math.round(cpu * 100) / 100 : null, samples },
      node: { rssMbBefore, rssMbAfter: Math.round(process.memoryUsage().rss / 1024 / 1024) },
      container: { memoryCurrentMb: cgroupMb('memory.current'), memoryPeakMb: cgroupMb('memory.peak'), memoryMaxMb: cgroupMb('memory.max') },
    }
  }
  try { await assertSafeUrl(url, hostedNetworkPolicy()) }
  catch (error) { return report(false, { error: `refused: ${error instanceof Error ? error.message : String(error)}` }) }
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  const engine = await browserEngineFor('playwright')
  const launchStarted = performance.now()
  const browser = await engine.launch({ headless: true, timeout: 30_000, ...(proxy ? { proxy: { server: proxy } } : {}) })
  timings.launchMs = Math.round(performance.now() - launchStarted)
  const timer = setInterval(sample, 50)
  const abort = (): void => { void browser.close().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const navigateStarted = performance.now()
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATE_TIMEOUT_MS })
    timings.navigateMs = Math.round(performance.now() - navigateStarted)
    await page.waitForLoadState('load', { timeout: LOAD_WAIT_MS }).catch(() => { timings.loadCapped = true })
    timings.loadMs = Math.round(performance.now() - navigateStarted)
    const screenshotStarted = performance.now()
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    const height = Math.min(VIEWPORT.height * VIEWPORTS_CAPTURED, Math.max(VIEWPORT.height, pageHeight))
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height }, timeout: SCREENSHOT_TIMEOUT_MS })
    timings.screenshotMs = Math.round(performance.now() - screenshotStarted)
    const elementsStarted = performance.now()
    const elements = await page.evaluate(({ selector, limit }) => {
      let count = 0
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const box = element.getBoundingClientRect()
        if (box.width > 0 && box.height > 0 && box.top + window.scrollY < limit) count++
      }
      return count
    }, { selector: ELEMENTS, limit: height })
    timings.elementsMs = Math.round(performance.now() - elementsStarted)
    sample()
    await context.close()
    return report(true, { http: response?.status() ?? null, clip: { width: VIEWPORT.width, height }, jpegBytes: jpeg.length, elements })
  } catch (error) {
    sample()
    return report(false, { error: (error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 200) })
  } finally {
    clearInterval(timer)
    signal.removeEventListener('abort', abort)
    await browser.close().catch(() => {})
  }
}
