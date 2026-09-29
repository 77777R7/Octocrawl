import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EXTRACTOR_VERSION, extractTf, htmlToMarkdown } from '../src/index.js'

// Main-content selection and conversion on the pages a Monitor reads. A Monitor
// attributes a field change on an unchanged raw body to W2L by this version, so
// the same HTML under the same version must give the same Markdown.
const PAGES: [url: string, html: string][] = [
  ['https://docs.fixture.test/guide/intro', `<!doctype html><html><head><title>Fixture guide</title></head><body>
<nav><a href="/">Home</a> <a href="/pricing">Pricing</a></nav>
<main><article><h1>Fixture guide</h1>
<p>The web data API for agents. See the <a href="../features/search">Search feature docs</a> for all options, or <strong>scrape</strong> one page.</p>
<div>Crawl every page of a site.</div><div>Map its <em>links</em> <i class="icon"></i>first.</div>
<h2><a href="#install">Install</a></h2>
<ol start="3"><li><p>Open a terminal.</p></li><li><p>Run:</p><pre><code class="language-shell">npm ci
npm test</code></pre></li></ol>
<ul><li>Outputs<ul><li>Markdown</li><li>Links</li></ul></li></ul>
<table><caption>Limits</caption><tr><th>Plan</th><th>Pages<br>per month</th></tr><tr><td>Free</td><td>500</td></tr></table>
<p>First line<br>second line, with an image <img src="/img/a.png" alt="Diagram"> and an inline one <img src="data:image/png;base64,iVBORw0KGgo=" alt="Sparkline">.</p>
</article></main>
<footer><p>Copyright 2026 Fixture Docs. All rights reserved.</p></footer></body></html>`],
  ['https://stats.fixture.test/energy/q2', `<html><head><base href="https://stats.fixture.test/releases/"><title>Quarterly energy release</title></head><body>
<div id="header"><a href="/">Statistics office</a> | <a href="/contact">Contact</a></div>
<div class="layout"><div class="sidebar"><ul><li><a href="q1.html">Q1</a></li><li><a href="q2.html">Q2</a></li></ul></div>
<div class="content"><h1>Quarterly energy release</h1>
<p class="lead">Electricity demand from data centres rose in the second quarter, according to the figures published today.</p>
<p>Consumption is reported in gigawatt hours. Figures for the previous quarter were revised; see <a href="notes.html#revisions">the revision notes</a> for details.</p>
<table><thead><tr><th>Region</th><th>Q1 (GWh)</th><th>Q2 (GWh)</th></tr></thead><tbody><tr><td>North</td><td>1,204</td><td>1,318</td></tr><tr><td>South</td><td>987</td><td>1,021</td></tr></tbody></table>
<p><sup>1</sup> Provisional figures for the second quarter.</p>
</div></div>
<div id="footer">© Statistics office</div></body></html>`],
]

function monitorMarkdown([url, html]: [string, string]): string {
  const extracted = extractTf.extract(html, { url })
  return htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl })
}

describe('EXTRACTOR_VERSION', () => {
  it('is pinned to the Markdown the extractor gives for fixed pages', () => {
    const markdown = PAGES.map(monitorMarkdown)
    expect(markdown.every((page) => page.length > 100)).toBe(true)
    const digest = createHash('sha256').update(markdown.join('\n\u0000\n')).digest('hex')
    // If only the digest differs, the extraction or Markdown output changed:
    // bump EXTRACTOR_VERSION (src/version.ts) and pin the new pair together.
    expect({ version: EXTRACTOR_VERSION, digest }).toEqual({ version: 'extract-tf/2', digest: '2269ef38c956ae04bd27edba14dd50d798d93f62a0f4a9b827cb1127aee0daea' })
  })
})
