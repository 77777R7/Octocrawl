// Octocrawl's HTML-to-Markdown path on stored HTML, with no fetching: the main-content extractor and Markdown converter
// a successful scrape uses (packages/bench/src/subjects/resilientHttp.ts), loaded from the compiled packages/extract-tf/dist.
//
//   node research/benchmarks/webmainbench/octocrawl-convert.mjs < pages.jsonl > out.jsonl
//
// Each input line is a JSON object with track_id, html and url; each output line holds track_id, markdown (Octocrawl's
// Markdown), mainHtml (the extracted main content, for the html2text view), fallback (true when the extractor asked for
// escalation or answered only as a last resort, where a live scrape would try the browser; here the whole page is
// converted, as Octocrawl does for an error page) and error. A page that throws is kept with markdown "" and its error.
import { createInterface } from 'node:readline'
import { extractTf, htmlToMarkdown, visibleText } from '../../../packages/extract-tf/dist/index.js'

export function convert(html, url) {
  const extracted = extractTf.extract(html, { url })
  const fallback = extracted.escalate === true || extracted.lastResort === true
  const markdown = fallback ? htmlToMarkdown(html, { baseUrl: url }) : htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl })
  return { markdown: visibleText(markdown) === '' ? '' : markdown, mainHtml: fallback ? html : extracted.mainHtml, fallback }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (line.trim() === '') continue
    const { track_id, html, url } = JSON.parse(line)
    let out
    try {
      out = { track_id, ...convert(html ?? '', url ?? undefined), error: null }
    } catch (err) {
      out = { track_id, markdown: '', mainHtml: '', fallback: null, error: String(err?.message ?? err).slice(0, 300) }
    }
    process.stdout.write(JSON.stringify(out) + '\n')
  }
}
