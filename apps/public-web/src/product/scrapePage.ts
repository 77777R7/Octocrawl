import { footerMarkup, siteHeaderMarkup } from '../page'
import { glyphCloud } from '../glyphArt'
import { scrapeSnippet } from './scrapeCode'
import {
  AMAZON_FIELDS, DEMOS, DOCS, DOCS_CELL, DOCS_TABLE, DOCS_TABLE_ROWS, DOCS_TABLES, HARD, WIKIPEDIA_LINKS, WIKIPEDIA_MARKDOWN,
  WIKIPEDIA_TOKENS, type Demo,
} from './scrapeRun'

/** /scrape/: what scraping a page with Octocrawl gives, shown on real scrapes recorded on hosted Octocrawl
 * (scrapeRun.ts). The hero shows three pages' results; below, harder pages, the Evidence Record, the call, the cost and
 * the questions. vite.config.ts prerenders this markup into scrape/index.html. */

export const SCRAPE_PATH = '/scrape/'
export const SCRAPE_TITLE = 'Web Scraping API: Markdown, Tables and Fields | Octocrawl'
export const SCRAPE_DESCRIPTION = 'Scrape a public web page into Markdown, links, tables and fields, with an Evidence Record of where each result came from. A page Octocrawl can’t read comes back with the reason and costs 0 credits.'

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const short = (hash: string): string => `${hash.slice(0, 8)}…${hash.slice(-8)}`
const n = (value: number): string => value.toLocaleString('en-US')

/** One Markdown line, coloured: headings, bold, and links' targets. */
function markdownLine(text: string): string {
  if (!text) return ''
  if (text.startsWith('# ')) return `<span class="md-punct">#</span> <span class="md-heading">${esc(text.slice(2))}</span>`
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<span class="md-punct">**</span><span class="md-strong">$1</span><span class="md-punct">**</span>')
    .replace(/\]\((https?:\/\/[^\s)]+(?:\([^\s)]*\))?|#[^\s)]+)\)/g, '<span class="md-punct">](</span><span class="md-url">$1</span><span class="md-punct">)</span>')
}

const line = (i: number, html: string): string => `<li class="pd-line"><span class="pd-ln" aria-hidden="true">${i}</span><code>${html || '&nbsp;'}</code></li>`

/** What the demo shows for each page, and the sentence under it. */
function demoBody(demo: Demo): { body: string; note: string } {
  if (demo.shows === 'fields') {
    const rows = AMAZON_FIELDS.map((f) => {
      const value = f.json === 'null' ? '<span class="js-null">null</span>' : `<span class="${f.json.startsWith('"') ? 'js-str' : 'js-num'}">${esc(f.json)}</span>`
      const where = f.locator ? `<span class="dm-where">${esc(f.locator)}</span>` : `<span class="dm-issue">${esc(f.issue!)}</span>`
      return `<li class="dm-field${f.locator ? '' : ' is-null'}"><code><span class="js-key">"${f.name}"</span><span class="js-punct">:</span> ${value}</code>${where}</li>`
    }).join('')
    return {
      body: `<ol class="dm-fields" role="list">${rows}</ol>`,
      note: 'Each value comes with the place on the page it was read from. A book has no brand, so <code>brand</code> comes back <code>null</code> with the reason: Octocrawl doesn’t fill a field the page doesn’t state.',
    }
  }
  if (demo.shows === 'markdown') {
    return {
      body: `<ol class="pd-code" role="list">${WIKIPEDIA_MARKDOWN.map((l) => ('gap' in l ? `<li class="pd-line dm-gap"><span class="pd-ln" aria-hidden="true">⋮</span><code>lines ${l.gap[0]}–${l.gap[1]} cut here: ${l.what}</code></li>` : line(l.n, markdownLine(l.text)))).join('')}</ol>`,
      note: `The article as Markdown, ready for a model to read: ${n(WIKIPEDIA_TOKENS)} tokens, with ${n(WIKIPEDIA_LINKS)} links. The site’s menus and sidebars are left out; ask for the whole page to keep them. Shown here: the start of it, with real line numbers. Text: Wikipedia, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.`,
    }
  }
  const [head, ...rows] = DOCS_TABLE
  const table = `<table class="pd-grid dm-table"><thead><tr>${head!.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}<tr><td colspan="4" class="dm-more">… ${DOCS_TABLE_ROWS - 1 - rows.length} more rows</td></tr></tbody></table>`
  return {
    body: table,
    note: `Every data table on the page, as rows and as CSV. This page has ${DOCS_TABLES} tables; the format-code table is 4 columns by ${DOCS_TABLE_ROWS - 1} rows.`,
  }
}

/** The hero's demo: one tab per page, each with what came back and the facts of the read. */
function demo(): string {
  const tabs = DEMOS.map((d, i) => `<button class="pd-tab" type="button" role="tab" id="dm-tab-${d.id}" aria-controls="dm-pane-${d.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-demo="${d.id}"><span class="dm-host">${d.tab}</span><span class="dm-title">${d.title}</span></button>`).join('')
  const panes = DEMOS.map((d, i) => {
    const { body, note } = demoBody(d)
    return `
              <div class="dm-pane" role="tabpanel" id="dm-pane-${d.id}" aria-labelledby="dm-tab-${d.id}" data-demo="${d.id}"${i ? ' hidden' : ''}>
                <p class="dm-request"><span class="dm-verb">scrape</span><span class="dm-url">${esc(d.url)}</span></p>
                <div class="dm-out">${body}</div>
                <p class="dm-note">${note}</p>
                <p class="pd-status"><span class="pd-status-dot" aria-hidden="true"></span><span>success</span><span class="pd-status-sep" aria-hidden="true">·</span><span>HTTP ${d.httpStatus}</span><span class="pd-status-sep" aria-hidden="true">·</span><span>read over HTTP</span><span class="pd-status-sha" title="SHA-256 of the page’s ${n(d.bytes)} bytes, from its Evidence Record">sha256 ${short(d.rawSha256)}</span></p>
              </div>`
  }).join('')
  return `
          <div class="pd-console dm-console">
            <div class="pd-tabs dm-tabs" role="tablist" aria-label="Three recorded scrapes">${tabs}</div>${panes}
          </div>`
}

/** Harder pages: three recorded runs behind tabs. */
function harder(): string {
  const tabs = HARD.map((h, i) => `<button class="ft-tab" type="button" role="tab" id="ft-tab-${h.id}" aria-controls="ft-hard-${h.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-hard="${h.id}">${h.tab}</button>`).join('')
  const panes = HARD.map((h, i) => `
              <div class="ft-hard" role="tabpanel" id="ft-hard-${h.id}" aria-labelledby="ft-tab-${h.id}" data-hard="${h.id}"${i ? ' hidden' : ''}>
                <p class="ft-url"><span class="ft-dot is-${h.status}" aria-hidden="true"></span>${esc(h.url)}</p>
                <dl class="ft-facts">${h.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
                ${h.lines.length ? `<ol class="ft-md" role="list">${h.lines.map((t) => `<li class="ft-line"><code>${markdownLine(t) || '&nbsp;'}</code></li>`).join('')}</ol>` : `<div class="ft-refused"><span>${h.status === 'blocked' ? 'blocked' : 'never requested'}</span><small>${h.status === 'blocked' ? 'status blocked · captcha · 0 credits' : 'status failed · policy_denied · 0 credits'}</small></div>`}
              </div>`).join('')
  const copy: Record<string, string> = {
    js: 'The page’s quotes are drawn by its script, so after the HTTP read Octocrawl read it in a browser and got all ten. Hosted, that takes an API key and costs 5 credits instead of 1.',
    blocked: 'Walmart answered with a CAPTCHA page. The result says <code>blocked: captcha</code>, explains why, and costs 0 credits.',
    refused: 'Google’s robots.txt disallows <code>/search</code>, so hosted Octocrawl never sent the request. The result says why and costs 0 credits.',
  }
  return `
    <section class="sc-section hd-section" id="harder" aria-labelledby="hd-title">
      <div class="band">
        <div class="frame sc-grid">
          <div class="sc-intro">
            <h2 id="hd-title">When a page is harder</h2>
            <p class="sc-lead">Not every page hands over its content. Here is what Octocrawl does instead of guessing.</p>
            <dl class="hd-cases">${HARD.map((h) => `<div><dt>${h.tab}</dt><dd>${copy[h.id]}</dd></div>`).join('')}</dl>
            <p class="sc-small">Hosted Octocrawl doesn’t get past bot checks or solve CAPTCHAs. For pages behind your own sign-in, run Octocrawl on your computer with <a href="/blog/scrape-website-with-login/">your own Chrome</a>.</p>
          </div>
          <div class="ft-window hd-window">
            <div class="ft-tabs" role="tablist" aria-label="Three harder pages">${tabs}</div>${panes}
          </div>
        </div>
      </div>
    </section>`
}

/** The Evidence Record: what it holds, and the docs page's bytes hashed in the reader's browser. */
function evidence(): string {
  const items = [
    'the URL you asked for, the URL fetched, and any redirects',
    'when it was fetched, and the HTTP status',
    'the robots.txt decision',
    'whether it was read over HTTP or in a browser',
    'SHA-256 hashes of the page’s bytes and of the Markdown and JSON you received',
    'for each field, where on the page it was read',
  ]
  return `
    <section class="sc-section ev-section" id="evidence-record" aria-labelledby="ev-title">
      <div class="band">
        <div class="frame sc-grid">
          <div class="sc-intro">
            <h2 id="ev-title">The Evidence Record</h2>
            <p class="sc-lead">Every result carries a record of how it was made, including a page Octocrawl refused to read:</p>
            <ul class="ev-list">${items.map((t) => `<li>${t}</li>`).join('')}</ul>
            <p class="sc-small">We fetched the Python docs page again the same day and its bytes hashed to the same value as the record. Some pages change between requests; the record still holds the hash of the exact bytes Octocrawl read. <a href="/docs/reference/#evidence-record">Reference</a></p>
          </div>
          <div class="ft-window ft-tamper" id="ft-tamper">
            <p class="ft-url"><span class="ft-dot" aria-hidden="true"></span>${esc(DOCS.url)}</p>
            <pre class="ft-source" aria-label="The page’s HTML at the first row of its format-code table"><span class="ft-src-dim">&lt;tr class="row-even"&gt;&lt;td&gt;&lt;p&gt;&lt;code …&gt;&lt;span class="pre"&gt;</span><input class="ft-price" id="ft-cell" type="text" value="${esc(DOCS_CELL.value)}" aria-label="A cell in the page’s HTML; change it" spellcheck="false" autocomplete="off" /><span class="ft-src-dim">&lt;/span&gt;…</span></pre>
            <dl class="ft-hashes">
              <div><dt>SHA-256 of the page’s ${n(DOCS.bytes)} bytes, here in your browser</dt><dd class="ft-hash is-pending" id="ft-hash" aria-live="polite">not computed yet</dd></div>
              <div><dt>rawSha256 in the Evidence Record</dt><dd class="ft-hash is-record">${DOCS.rawSha256}</dd></div>
            </dl>
            <p class="ft-verdict is-pending" id="ft-verdict"><span aria-hidden="true">…</span> <span>Hashed in your browser when this part of the page is in view.</span></p>
            <button class="ft-reset" type="button" id="ft-reset" hidden>Put it back</button>
          </div>
        </div>
      </div>
    </section>`
}

/** From your code: the Wikipedia read as a call, and where each part runs. */
function callIt(): string {
  const tabs = [['curl', 'cURL'], ['mcp', 'MCP'], ['cli', 'CLI'], ['ts', 'TypeScript'], ['py', 'Python']]
  const rows: Array<[string, string, string]> = [
    ['Start', '<code>api.octocrawl.dev</code> / <code>mcp.octocrawl.dev</code>', '<code>npx octocrawl serve</code>'],
    ['Limit', '20 pages a day without a key; 1,000 credits a month with a free account', 'None'],
    ['Pages that need a browser', 'With an API key', 'Yes'],
    ['Crawl, batch, actions, signed-in pages', '—', 'Yes'],
    ['robots.txt', 'Never requests a page it disallows', 'Reads a URL you give it, and records the decision'],
  ]
  return `
    <section class="sc-section cd-section" id="call-it" aria-labelledby="cd-title">
      <div class="band">
        <div class="frame sc-grid">
          <div class="sc-intro">
            <h2 id="cd-title">From your code</h2>
            <p class="sc-lead">The Wikipedia read above, from curl, an MCP client, the CLI, TypeScript or Python.</p>
          </div>
          <div class="cd-window">
            <div class="cd-tabs" role="tablist" aria-label="Ways to call it">${tabs.map(([id, label], i) => `<button class="cd-tab" type="button" role="tab" id="cd-tab-${id}" aria-controls="cd-code" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-lang="${id}">${label}</button>`).join('')}<button class="cd-copy" type="button" id="cd-copy">Copy</button></div>
            <pre class="cd-code" id="cd-code" role="tabpanel" aria-labelledby="cd-tab-curl" tabindex="0"><code>${esc(scrapeSnippet('curl'))}</code></pre>
            <p class="cd-note" id="cd-note"></p>
          </div>
        </div>
        <div class="frame rn-wrap">
          <table class="rn-table"><thead><tr><th scope="col"><span class="visually-hidden">What</span></th><th scope="col">Hosted</th><th scope="col">On your own computer</th></tr></thead><tbody>${rows.map(([a, b, c]) => `<tr><th scope="row">${a}</th><td>${b}</td><td>${c}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>
    </section>`
}

function cost(): string {
  const rows: Array<[string, string]> = [['Page read over HTTP', '1'], ['Page read in a browser', '5'], ['Page not found (404, 410)', '1'], ['Blocked, not allowed, or nothing read', '0']]
  return `
    <section class="sc-section cs-section" id="cost" aria-labelledby="cs-title">
      <div class="band">
        <div class="frame sc-grid">
          <div class="sc-intro">
            <h2 id="cs-title">What it costs</h2>
            <p class="sc-lead">The three pages above were read over HTTP: 1 credit each on an account, or free within the 20 a day without a key. A free account gets 1,000 credits a month. On your own computer there is no limit. Paid credit packs aren’t sold yet.</p>
            <p class="sc-small"><a href="/#free-tiers">Free tiers</a> · <a href="/docs/limits/">Limits</a></p>
          </div>
          <table class="cs-table"><thead><tr><th scope="col">Result</th><th scope="col">Credits</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>
    </section>`
}

/** Questions people ask about scraping a page, answered for Octocrawl. */
export const SCRAPE_FAQ: ReadonlyArray<readonly [question: string, answer: string]> = [
  ['What’s the difference between scrape, map and crawl?', 'Scrape reads one page. Map lists a site’s URLs without reading each page. Crawl follows links from a start page and scrapes each one; it runs on your own computer with <code>npx octocrawl serve</code>, as does batch.'],
  ['Does it read pages that need JavaScript?', 'Yes. It reads over HTTP first and switches to a browser when the HTML is an empty shell. Hosted, browser reads need an API key and cost 5 credits.'],
  ['Does it respect robots.txt?', 'Hosted, yes: it never requests a disallowed page. On your own computer, a URL you give it is read, and the robots.txt decision is recorded.'],
  ['Can it read PDFs?', 'The text layer, page by page. No OCR. Files up to 5 MiB hosted.'],
  ['Does it use an LLM?', 'Not by default. Markdown, tables and fields come from the page itself. A model fallback for fields is available and off unless you turn it on.'],
]

/** The page's structured data: the questions above. */
export function scrapeJsonLd(): string {
  const text = (html: string): string => html.replace(/<[^>]+>/g, '')
  const data = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: SCRAPE_FAQ.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: text(answer) } })) }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function faq(): string {
  return `
    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      <div class="band">
        <div class="frame faq-grid">
          <div class="faq-intro">
            <pre class="glyph-cloud is-side" data-cols="70" data-rows="34" data-seed="7" aria-hidden="true">${glyphCloud(70, 34, 7)}</pre>
            <h2 id="faq-title">Questions</h2>
          </div>
          <div class="faq-list">${SCRAPE_FAQ.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </div>
      </div>
    </section>`
}

/** Try a page of your own: the free tool page runs it. */
function tryIt(): string {
  return `
    <section class="tr-section" id="try" aria-labelledby="tr-title">
      <div class="band">
        <div class="frame tr-window">
          <h2 id="tr-title">Try a page of your own</h2>
          <form class="tr-form" id="tr-form" action="/tools/url-to-markdown/" method="get">
            <label class="visually-hidden" for="tr-url">A public page’s URL</label>
            <input class="tr-input" id="tr-url" name="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://…" required />
            <button class="pd-button is-primary" type="submit">Scrape <span aria-hidden="true">→</span></button>
          </form>
          <p class="tr-note">Five pages a day on the free tool, no sign-up.</p>
        </div>
      </div>
    </section>`
}

export function scrapePageMarkup(): string {
  return `
  <div class="page-shell product-page">
    <div class="pd-hero" id="top">
      <canvas class="pd-hero-field" aria-hidden="true"></canvas>
${siteHeaderMarkup()}      <main aria-labelledby="pd-title">
        <div class="band">
          <div class="frame pd-intro">
            <h1 id="pd-title">Scrape a web page.</h1>
            <p class="pd-lead">Give Octocrawl a public URL. You get the page as Markdown, its links and tables, the fields you name, and an Evidence Record of where each one came from.</p>
            <div class="pd-actions">
              <a class="pd-button is-primary" href="/tools/url-to-markdown/">Try a URL, free, no sign-up <span aria-hidden="true">→</span></a>
              <a class="pd-button" href="/docs/reference/#rest-and-sdk">API reference</a>
            </div>
          </div>
        </div>
        <div class="band">
          <div class="frame dm-frame">${demo()}
            <p class="pd-caption">Three real pages, each read once on hosted Octocrawl on 17 October 2026. Every value in this demo is from those reads. Also: HTML, raw HTML, images and screenshots; all formats are in the <a href="/docs/reference/">reference</a>.</p>
          </div>
        </div>
      </main>
    </div>
${harder()}
${evidence()}
${callIt()}
${cost()}
${faq()}
${tryIt()}

${footerMarkup('/', false)}  </div>
`
}

