#!/usr/bin/env node
// What a cold Chromium screenshot costs on a public-preview instance, measured as a Cloud Run job running the
// service's own image under its limits (screenshotProbe.ts). Each page is captured over HTTP first, as the preview
// captures it, for its robots.txt decision and its own time; only where robots.txt allowed the page is it then loaded
// in a cold Chromium for the top three viewports. One JSON line per page goes to stdout, and a summary line last.
// Nothing is saved. ROUNDS sets how many passes (1 by default); W2L_PROBE_URLS, comma-separated, replaces the list.
import { capturePreview, mapPreviewResult, normalizePreviewUrl } from './preview.js'
import { probeScreenshot, type ScreenshotProbe } from './screenshotProbe.js'

// The ten pages of the local measurement of 2026-10-06: practice sites, documentation, a JavaScript-rendered page, a
// large table page, a government report, a data site and a marketing page.
const DEFAULT_URLS = [
  'https://example.com/',
  'https://docs.firecrawl.dev/introduction',
  'https://books.toscrape.com/',
  'https://quotes.toscrape.com/js/',
  'https://www.scrapethissite.com/pages/forms/?per_page=100',
  'https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git',
  'https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)',
  'https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2',
  'https://ourworldindata.org/grapher/co-emissions-per-capita?tab=table',
  'https://www.apple.com/environment/',
]
const CAPTURE_DEADLINE_MS = 40_000

const rounds = Math.max(1, Number(process.env.ROUNDS ?? 1) || 1)
const urls = process.env.W2L_PROBE_URLS ? process.env.W2L_PROBE_URLS.split(',').map(url => url.trim()).filter(Boolean) : DEFAULT_URLS
const probes: ScreenshotProbe[] = []
let refused = 0

console.log(JSON.stringify({ event: 'probe_start', sourceCommit: process.env.W2L_SOURCE_COMMIT ?? null, rounds, urls: urls.length, cpus: (await import('node:os')).cpus().length, platform: process.platform }))
for (let round = 1; round <= rounds; round++) {
  for (const url of urls) {
    let line: Record<string, unknown>
    try {
      const target = normalizePreviewUrl(url)
      const stages: Record<string, number> = {}
      const started = performance.now()
      const outcome = await capturePreview(target, new AbortController().signal, Date.now() + CAPTURE_DEADLINE_MS, null, false, undefined, undefined, false, {}, stage => { stages[stage.stage] = Math.round(performance.now() - started) })
      const mapped = mapPreviewResult(target.url, target, outcome, performance.now() - started)
      const code = mapped.diagnostic?.code ?? null
      const robotsRefused = code === 'robots_disallowed' || code === 'robots_unreachable'
      const browser = robotsRefused ? null : await probeScreenshot(target.url, new AbortController().signal)
      if (browser === null) refused++
      else probes.push(browser)
      line = { event: 'probe', round, url: target.url, preview: { status: mapped.status, code, stages, totalMs: Math.round(mapped.totalMs) }, browser }
    } catch (error) {
      line = { event: 'probe', round, url, error: error instanceof Error ? error.message : String(error) }
    }
    console.log(JSON.stringify(line))
  }
}
const ok = probes.filter(probe => probe.ok)
const stat = (values: number[]): { min: number; median: number; max: number } | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return { min: sorted[0]!, median: sorted[Math.floor(sorted.length / 2)]!, max: sorted[sorted.length - 1]! }
}
console.log(JSON.stringify({
  event: 'probe_summary', captures: ok.length, failed: probes.length - ok.length, robotsRefused: refused,
  totalMs: stat(ok.map(probe => probe.timings.totalMs)),
  launchMs: stat(ok.flatMap(probe => probe.timings.launchMs === undefined ? [] : [probe.timings.launchMs])),
  loadMs: stat(ok.flatMap(probe => probe.timings.loadMs === undefined ? [] : [probe.timings.loadMs])),
  screenshotMs: stat(ok.flatMap(probe => probe.timings.screenshotMs === undefined ? [] : [probe.timings.screenshotMs])),
  peakRssMb: stat(ok.flatMap(probe => probe.chromium.peakRssMb === null ? [] : [probe.chromium.peakRssMb])),
  cpuSeconds: stat(ok.flatMap(probe => probe.chromium.cpuSeconds === null ? [] : [probe.chromium.cpuSeconds])),
  containerPeakMb: stat(probes.flatMap(probe => probe.container.memoryPeakMb === null ? [] : [probe.container.memoryPeakMb])),
}))
