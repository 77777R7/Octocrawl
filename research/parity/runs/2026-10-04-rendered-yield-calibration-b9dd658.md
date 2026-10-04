# Real-site run 2026-10-04: the browser lane's yield, for a thin-rendered-answer warning

What it measures: how much main content the local browser lane's own extraction finds on real pages, and how sure it is (`extract` event: `confidence`, `pageType`; `usage.contentTokens`), to set the threshold below which a rendered answer carries `low_content_yield` (`RENDERED_LOW_YIELD_MAX_TOKENS` in `packages/contracts/src/tokens.ts`). Then the change, checked through the API.

## Calibration

Source commit: `b9dd6586c0857d49dd6c5d70fa3acf418f919c7d` (`main`; the measured lane's code is unchanged on the branch `claude/browser-low-yield`).
Run: 2026-10-04T15:32:18Z → 15:34:33Z (the real-site set), and 15:35:12Z (the targeted pages), from Howard's Mac.
Network: proxied, `withEnvironmentProxy(localNetworkPolicy(), process.env)` with `HTTPS_PROXY=http://127.0.0.1:7890`.
Command, from the repository root, with the script below saved as `packages/bench/measure.tmp.ts` (deleted after the run): `npx tsx packages/bench/measure.tmp.ts <out.json>` (every distinct http(s) page URL of `research/parity/sites.v1.json`, PDFs and loopback left out: 93), then `npx tsx packages/bench/measure.tmp.ts <out.json> targeted` (the seven pages in the script). Each page fetched on `BrowserLocalSubject` alone, standard mode, a 45 s deadline, three at a time.

The real-site set: 93 pages, 73 success, 19 failed, 1 blocked. Of the 73, 8 were extracted at confidence 0.3 or less:

| URL | Status | Main-content tokens | Confidence | Page type |
| --- | --- | --- | --- | --- |
| https://quotes.toscrape.com/tag/humor/page/2/ | success | 135 | 0 | listing |
| https://quotes.toscrape.com/scroll | success | 363 | 0 | listing |
| https://quotes.toscrape.com/js/ | success | 387 | 0 | listing |
| https://quotes.toscrape.com/page/3/ | success | 733 | 0 | listing |
| https://quotes.toscrape.com/ | success | 904 | 0 | listing |
| https://www.bls.gov/news.release/empsit.nr0.htm | success | 2840 | 0.17 | article |
| https://news.ycombinator.com/ | success | 4642 | 0 | collection |
| https://news.ycombinator.com | success | 4654 | 0 | collection |
quotes.toscrape.com/tag/humor/page/2/'s main content was the "Top Ten tags" box, not its two quotes; the other seven hold their content (ten quotes, a news list, a news release). Listings are often extracted at confidence 0, so confidence alone does not tell a thin answer.

The targeted pages: script-drawn data pages, two short ones and the IMF page of the 2026-10-02 formats run (`research/parity/m2-formats-live-checks-2026-10-02.md`, F1):

| URL | Status | Main-content tokens | Confidence | Page type |
| --- | --- | --- | --- | --- |
| https://ourworldindata.org/grapher/co-emissions-per-capita | success | 5053 | 1 | article |
| https://ourworldindata.org/grapher/life-expectancy | success | 6017 | 1 | article |
| https://example.com/ | success | 267 | 1 | article |
| https://www.imf.org/external/datamapper/NGDP_RPCH@WEO/OEMDC/ADVEC/WEOWORLD | success | 226 | 0 | listing |
| https://www.imf.org/en/Data | blocked (bot_detected_generic) | — | — | — |
| https://quotes.toscrape.com/tag/humor/page/2/ | success | 132 | 0 | listing |
| https://www.energy-charts.info/?l=en&c=DE | failed (empty_unverified) | — | 0 | article |
IMF's datamapper renders 226 tokens of social and navigation links at confidence 0, as on 2026-10-02; its figures are drawn by script. example.com, an honest short page, is 267 tokens at confidence 1.

The threshold: 300 tokens at confidence 0.3 or less. It takes IMF (226) and the humor page (132) and leaves the thinnest real listing at confidence 0 (quotes.toscrape.com/scroll, 363) and every other page here.

## Through the API

Source commit: `193272182681a139c5d4dfde2851d1c27bb20ca3` (branch `claude/browser-low-yield`, merged with `main`), `W2L_API_PORT=8787 npm run api`, local mode, the environment proxy `127.0.0.1:7890` on each response's evidence. Run 2026-10-04T15:44:55Z → 15:45:12Z. Command for each URL: `curl -X POST http://127.0.0.1:8787/v1/scrape -H 'content-type: application/json' -d '{"url":"<url>","formats":["markdown"]}'`.

| URL | Status | Lane (tried) | Tokens | Warnings | Agent hints |
| --- | --- | --- | --- | --- | --- |
| https://www.imf.org/external/datamapper/NGDP_RPCH@WEO/OEMDC/ADVEC/WEOWORLD | success | browser_local (http, browser_local) | 226 | `low_content_yield`: "The browser_local lane rendered the page and extracted 226 tokens at confidence 0; that is the answer." | the http lane's 403 and the browser lane serving the page; then "the rendered page's main content was thin and the extraction unsure of it; pass waitFor (up to 60000 ms) when its data loads late, actions (…) when it appears after an interaction, or onlyMainContent: false for the whole page" |
| https://quotes.toscrape.com/scroll | success | browser_local (http, browser_local) | 363 | none | none |
| https://ourworldindata.org/grapher/life-expectancy | success | browser_local (http, browser_local) | 6,017 | none | none |

The same three requests on `29fb44d` (2026-10-04T15:36:41Z → 15:36:59Z) gave the same results, but IMF's warning ended "…; no lane after it was left to try.", which a review found untrue when the ladder stops at a clean browser answer before a rung it did not need; `e6895b7` rewords it.

Script:

```ts
// Every distinct page URL of research/parity/sites.v1.json, fetched on the local browser lane alone (proxied, standard mode),
// with what the lane's own extraction said of it: status, main-content tokens, confidence, page type.
import { readFileSync, writeFileSync } from 'node:fs'
import { localNetworkPolicy, withEnvironmentProxy } from '@w2l/contracts'
import { BrowserLocalSubject } from './src/subjects/browserLocal.js'
const cases = JSON.parse(readFileSync('research/parity/sites.v1.json', 'utf8')).cases as Array<{ id: string; batch: string; url?: string }>
const urls = process.argv[3] === 'targeted' ? ['https://www.imf.org/external/datamapper/NGDP_RPCH@WEO/OEMDC/ADVEC/WEOWORLD', 'https://ourworldindata.org/grapher/co-emissions-per-capita', 'https://ourworldindata.org/grapher/life-expectancy', 'https://www.energy-charts.info/?l=en&c=DE', 'https://example.com/', 'https://quotes.toscrape.com/tag/humor/page/2/', 'https://www.imf.org/en/Data'] : [...new Set(cases.map((c) => c.url).filter((u): u is string => typeof u === 'string' && /^https?:/.test(u) && !/\.pdf($|\?)/i.test(u) && !/127\.0\.0\.1|localhost/.test(u)))]
const subject = new BrowserLocalSubject('standard', null, false, withEnvironmentProxy(localNetworkPolicy(), process.env))
const rows: unknown[] = []
let next = 0
async function worker(): Promise<void> {
  for (;;) {
    const i = next++
    if (i >= urls.length) return
    const url = urls[i]!
    const started = Date.now()
    try {
      const r = await subject.fetch(url, Date.now() + 45_000)
      const extract = r.trace.find((t) => t.event === 'extract')?.detail ?? {}
      rows.push({ url, status: r.status, failureReason: r.failureReason, blockReason: r.blockReason, tokens: r.usage.contentTokens, confidence: extract.confidence ?? null, pageType: extract.pageType ?? null, strategy: extract.strategy ?? null, escalate: extract.escalate ?? null, linkCount: extract.linkCount ?? null, markdownChars: r.markdown?.length ?? 0, head: (r.markdown ?? '').replace(/\s+/g, ' ').slice(0, 160), ms: Date.now() - started })
    } catch (error) {
      rows.push({ url, error: String(error).slice(0, 200), ms: Date.now() - started })
    }
    process.stdout.write(`${rows.length}/${urls.length}\r`)
  }
}
await Promise.all([worker(), worker(), worker()])
await subject.teardown()
writeFileSync(process.argv[2]!, JSON.stringify({ urls: urls.length, rows }, null, 1))
console.log(`\ndone: ${rows.length} rows`)
```
