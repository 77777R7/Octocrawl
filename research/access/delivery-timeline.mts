// Delivery timeline (TASKS item 3, label: library_probe): does a task's data arrive late, or does it arrive and get lost
// on the way to the Markdown? One page in the installed Chrome (installedChrome.ts, the narrowed launch), the same page
// read again at fixed times after its check cleared: the visible text, the whole page as Markdown and the main content
// as Markdown the way the browser lane makes it (captureLayout, extractTf.extract, htmlToMarkdown), each counted
// against the task's own predicates. The page is never clicked or typed into. With `scroll`, it is then scrolled down
// by 0.9 of a screen at a time as the region wait scrolls (regionWait.ts), read at the bottom, scrolled back to the top
// as the region wait ends, and read again: whether what scrolling loaded is still there to read. Each read's HTML and Markdown
// are saved under the output directory, which stays outside the repository.
// Usage: npx tsx research/access/delivery-timeline.mts <task id> <out dir> [proxy URL] [checkpoints s, e.g. 5,10,20,30] [scroll]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Response } from 'playwright'
import { classifyGate } from '@w2l/http-core'
import { extractTf, htmlToMarkdown } from '@w2l/extract-tf'
import { launchInstalledChrome } from '../../packages/bench/src/subjects/installedChrome.ts'
import { captureLayout } from '../../packages/bench/src/browserLayout.ts'

const [taskId, outDir, proxy, marks = '5,10,20,30', scrollMode] = process.argv.slice(2)
if (taskId === undefined || outDir === undefined) throw new Error('usage: delivery-timeline.mts <task id> <out dir> [proxy URL] [checkpoints]')
const tasks = JSON.parse(await readFile(new URL('./tasks.v1.json', import.meta.url), 'utf8')) as { tasks: { id: string; url: string; predicates: { type: string; pattern?: string; flags?: string; min?: number }[] }[] }
const task = tasks.tasks.find((t) => t.id === taskId)
if (task === undefined) throw new Error(`no task ${taskId}`)
const checkpoints = marks.split(',').map(Number)
await mkdir(outDir, { recursive: true })

/** Each predicate of the task on a text: how many matches, and whether it holds. */
function judge(text: string) {
  return task!.predicates.map((p) => {
    if (p.pattern === undefined) return { type: p.type, judged: false }
    const flags = (p.flags ?? '').includes('g') ? p.flags! : `${p.flags ?? ''}g`
    const count = (text.match(new RegExp(p.pattern, flags)) ?? []).length
    return { type: p.type, count, holds: p.type === 'markdownCountMin' ? count >= (p.min ?? 1) : count > 0 }
  })
}

const started = Date.now()
const at = () => Date.now() - started
const browser = await launchInstalledChrome({ timeout: 30_000, ...(proxy ? { proxy: { server: proxy } } : {}) })
const timeline: Record<string, unknown>[] = []
try {
  const page = browser.contexts()[0]!.pages()[0]!
  let documentResponse: Response | null = null
  page.on('response', (response) => { if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) documentResponse = response })
  await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: Error) => timeline.push({ at: at(), event: 'goto_failed', error: error.message.slice(0, 160) }))
  const gateNow = async () => {
    const body = await page.content().catch(() => null)
    if (body === null) return { body: null, gate: undefined }
    const r = documentResponse as Response | null
    return { body, gate: classifyGate({ status: r?.status() || 200, header: (name) => r?.headers()[name.toLowerCase()] ?? null, body, contentful: true }) }
  }
  // The check, waited out as the rung waits (decisive evidence only), 30 s at most.
  let cleared: number | null = null
  for (let i = 0; i < 30; i++) {
    const { gate } = await gateNow()
    if (gate === null) { cleared = at(); break }
    if (i === 0) timeline.push({ at: at(), event: 'gate', gate })
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  timeline.push({ at: at(), event: cleared === null ? 'still_gated' : 'cleared', status: (documentResponse as Response | null)?.status() ?? null })
  const base = cleared ?? at()
  const read = async (mark: number | string) => {
    const { body, gate } = await gateNow()
    if (body === null) { timeline.push({ at: at(), mark, event: 'unreadable' }); return }
    const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
    const layout = await captureLayout(page, body)
    const converted = layout.html ?? body
    const extracted = extractTf.extract(converted, { url: page.url() })
    const mainMarkdown = htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl })
    const wholeMarkdown = htmlToMarkdown(converted, { baseUrl: page.url() })
    const stem = join(outDir, `${taskId}-${typeof mark === 'number' ? `${String(mark).padStart(2, '0')}s` : mark}`)
    await writeFile(`${stem}.html`, body)
    await writeFile(`${stem}.main.md`, mainMarkdown)
    await writeFile(`${stem}.whole.md`, wholeMarkdown)
    timeline.push({
      at: at(), mark, url: page.url(), title: await page.title().catch(() => ''), gate: gate ?? null,
      readyState: await page.evaluate(() => document.readyState).catch(() => null),
      scrollY: await page.evaluate(() => window.scrollY).catch(() => null),
      extractor: { pageType: extracted.pageType, strategy: extracted.strategy, confidence: extracted.confidence, escalate: extracted.escalate, textChars: extracted.render?.textChars ?? null },
      chars: { visibleText: text.length, mainMarkdown: mainMarkdown.length, wholeMarkdown: wholeMarkdown.length },
      visibleText: judge(text), wholeMarkdown: judge(wholeMarkdown), mainMarkdown: judge(mainMarkdown),
    })
  }
  for (const mark of checkpoints) {
    const wait = base + mark * 1_000 - at()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    await read(mark)
  }
  if (scrollMode === 'scroll') {
    for (let step = 0; step < 15; step++) {
      const moved = await page.evaluate(() => { const y = window.scrollY; window.scrollBy(0, Math.max(200, Math.round(window.innerHeight * 0.9))); return window.scrollY !== y }).catch(() => false)
      await new Promise((resolve) => setTimeout(resolve, 800))
      if (!moved) break
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await read('scrolled')
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    await read('back-top')
  }
} finally {
  await browser.close()
}
const report = { taskId, url: task.url, proxy: proxy ? new URL(proxy).host : null, startedAt: new Date(started).toISOString(), checkpoints, timeline }
await writeFile(join(outDir, `${taskId}-timeline.json`), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
