import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { captureScreenshot } from './screenshotCapture.js'

/**
 * A measurement, for the operator: what the crawl window's screenshot (screenshotCapture.ts, as the preview takes it)
 * costs on this instance, with the Chromium process tree's peak resident memory and CPU time sampled every 50 ms, and
 * the container's memory where the kernel tells it. It returns no image and keeps nothing. The probe CLI runs it as
 * a Cloud Run job from the service's own image.
 */
export interface ScreenshotProbe {
  ok: boolean
  error?: string
  /** Pixels captured: the viewport's width and the lesser of three viewports and the page. */
  clip?: { width: number; height: number }
  jpegBytes?: number
  /** Headings, paragraphs, list items, links, images, tables and code blocks inside the clip. */
  elements?: number
  /** Requests the hosted network policy refused. */
  blocked?: number
  timings: { launchMs?: number; navigateMs?: number; loadMs?: number; loadCapped?: boolean; screenshotMs?: number; totalMs: number }
  /** The Chromium process tree, sampled every 50 ms: peak resident set and CPU time; null where the platform gives none. */
  chromium: { peakRssMb: number | null; cpuSeconds: number | null; samples: number }
  /** This process's resident set before and after, and the container's memory (cgroup v2) where present. */
  node: { rssMbBefore: number; rssMbAfter: number }
  container: { memoryCurrentMb: number | null; memoryPeakMb: number | null; memoryMaxMb: number | null }
}

const BUDGET_MS = 30_000

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
  const rssMbBefore = Math.round(process.memoryUsage().rss / 1024 / 1024)
  // Processes that were already there (a browser of an earlier probe still closing) are not this probe's.
  const before = new Set(descendants().map(row => row.pid))
  let peakRssKb = 0
  let samples = 0
  const cpuByPid = new Map<number, number>()
  const sample = (): void => {
    const rows = descendants().filter(row => !before.has(row.pid))
    if (rows.length === 0) return
    samples++
    peakRssKb = Math.max(peakRssKb, rows.reduce((total, row) => total + row.rssKb, 0))
    for (const row of rows) cpuByPid.set(row.pid, Math.max(cpuByPid.get(row.pid) ?? 0, row.cpuSeconds))
  }
  const timer = setInterval(sample, 50)
  const report = (ok: boolean, rest: Partial<ScreenshotProbe> = {}): ScreenshotProbe => {
    const cpu = [...cpuByPid.values()].reduce((total, value) => total + value, 0)
    return {
      ok, timings: { totalMs: Math.round(performance.now() - started) }, ...rest,
      chromium: { peakRssMb: samples ? Math.round(peakRssKb / 1024) : null, cpuSeconds: samples ? Math.round(cpu * 100) / 100 : null, samples },
      node: { rssMbBefore, rssMbAfter: Math.round(process.memoryUsage().rss / 1024 / 1024) },
      container: { memoryCurrentMb: cgroupMb('memory.current'), memoryPeakMb: cgroupMb('memory.peak'), memoryMaxMb: cgroupMb('memory.max') },
    }
  }
  try {
    const capture = await captureScreenshot(url, { signal, budgetMs: BUDGET_MS })
    sample()
    return report(true, { clip: { width: capture.width, height: capture.height }, jpegBytes: capture.jpeg.length, elements: capture.elements.length, blocked: capture.blocked, timings: capture.timings })
  } catch (error) {
    sample()
    return report(false, { error: (error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 200) })
  } finally {
    clearInterval(timer)
  }
}
