// Challenge watch (label: library_probe): what a page shows, second by second, after navigation in the installed Chrome
// (installedChrome.ts, the narrowed launch), for as long as `seconds`. Each read records the main document's URL,
// status and Cloudflare header, the title, the HTML's length, whether Cloudflare's Turnstile widget is on the page, and
// the gate classifier's verdict two ways: decisive evidence only (`contentful: true`, as the challenge wait judges)
// and in full (as the answer is judged). The page is never clicked or typed into. The last HTML read is saved beside
// the report (<out>.last.html).
// Usage: npx tsx research/access/challenge-watch.mts <url> <out.json> [proxy URL] [seconds, default 60]
import { writeFile } from 'node:fs/promises'
import type { Response } from 'playwright'
import { classifyGate } from '@w2l/http-core'
import { launchInstalledChrome } from '../../packages/bench/src/subjects/installedChrome.ts'

const [url, out, proxy, secondsText = '60'] = process.argv.slice(2)
if (url === undefined || out === undefined) throw new Error('usage: challenge-watch.mts <url> <out.json> [proxy URL] [seconds]')
const seconds = Number(secondsText)
const started = Date.now()
const browser = await launchInstalledChrome({ timeout: 30_000, ...(proxy ? { proxy: { server: proxy } } : {}) })
const reads: Record<string, unknown>[] = []
let lastBody: string | null = null
const documents: { at: number; url: string; status: number; cfMitigated: string | null }[] = []
try {
  const page = browser.contexts()[0]!.pages()[0]!
  let last: Response | null = null
  page.on('response', (response) => {
    if (!response.request().isNavigationRequest() || response.frame() !== page.mainFrame()) return
    last = response
    documents.push({ at: Date.now() - started, url: response.url(), status: response.status(), cfMitigated: response.headers()['cf-mitigated'] ?? null })
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: Error) => reads.push({ at: Date.now() - started, gotoError: error.message.slice(0, 160) }))
  for (let second = 0; second <= seconds; second++) {
    const body = await page.content().catch(() => null)
    if (body !== null) lastBody = body
    const response = last as Response | null
    const status = response?.status() ?? null
    const header = (name: string) => response?.headers()[name.toLowerCase()] ?? null
    const verdict = (contentful: boolean) => body === null ? 'unreadable' : classifyGate({ status: status || 200, header, body, contentful })?.reason ?? null
    reads.push({
      at: Date.now() - started, url: page.url(), status, cfMitigated: header('cf-mitigated'),
      title: (await page.title().catch(() => '')).slice(0, 80), htmlChars: body?.length ?? null,
      turnstile: body === null ? null : /challenges\.cloudflare\.com|cf-turnstile/i.test(body),
      waitVerdict: verdict(true), answerVerdict: verdict(false),
    })
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
} finally {
  await browser.close()
}
const report = { url, proxy: proxy ? new URL(proxy).host : null, startedAt: new Date(started).toISOString(), documents, reads }
await writeFile(out, JSON.stringify(report, null, 2))
// The last page read, as it was, for what a check asks of a visitor.
if (lastBody !== null) await writeFile(`${out}.last.html`, lastBody)
console.log(JSON.stringify({ documents, firstReads: reads.slice(0, 8), lastRead: reads.at(-1) }, null, 1))
