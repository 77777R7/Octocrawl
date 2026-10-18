import { footerMarkup, siteHeaderMarkup } from '../page'
import { glyphCloud } from '../glyphArt'
import { scrapeSnippet } from './scrapeCode'
import { foldMarkdown } from './scrapeMarkdown'
import { AMAZON_FIELDS, AMAZON_ISSUE, CARD_MARKDOWN, DATETIME_TABLE, DEMOS, DOCS, DOCS_CELL, HARD, OCTOPUS_SIZES } from './scrapeRun'

/** /scrape/: what scraping a page with Octocrawl gives, shown on real scrapes recorded on hosted Octocrawl
 * (scrapeRun.ts). The hero shows three pages' results; below, harder pages, the Evidence Record, the call, the cost and
 * the questions. vite.config.ts prerenders this markup into scrape/index.html. */

export const SCRAPE_PATH = '/scrape/'
export const SCRAPE_TITLE = 'Web Scraping API: Markdown, Tables and Fields | Octocrawl'
export const SCRAPE_DESCRIPTION = 'Scrape a public web page into Markdown, links, tables and fields your agent reads in fewer tokens than raw HTML, with an Evidence Record of where each result came from.'

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (value: number): string => value.toLocaleString('en-US')

/** One Markdown line, coloured: headings, bold, and links' targets. */
function markdownLine(text: string): string {
  if (!text) return ''
  if (text.startsWith('# ')) return `<span class="md-punct">#</span> <span class="md-heading">${esc(text.slice(2))}</span>`
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<span class="md-punct">**</span><span class="md-strong">$1</span><span class="md-punct">**</span>')
    .replace(/\]\((https?:\/\/[^\s)]+(?:\([^\s)]*\))?|#[^\s)]+)\)/g, '<span class="md-punct">](</span><span class="md-url">$1</span><span class="md-punct">)</span>')
}

/** A page's Markdown as the demo shows it: link targets folded (scrapeMarkdown.ts), headings and bold marked. */
function foldedHtml(markdown: string): string {
  return foldMarkdown(markdown).map((segments) => {
    const heading = /^#{1,6} /.test(segments[0]?.text ?? '')
    const html = segments.map((s) => (s.url
      ? `<span class="md-link" title="${esc(s.url)}">${esc(s.text)}</span>`
      : heading ? esc(s.text) : markdownLine(s.text))).join('')
    return heading ? `<span class="md-heading">${html.replace(/^(#{1,6})/, '<span class="md-punct">$1</span>')}</span>` : html
  }).join('\n')
}

/** The hero's demo, kept plain: a browser window, a tab per page, and the page's Markdown as the read returned it.
 * scrapeDrop.ts plays the read over it (the raw HTML, the octopus's drop, the Markdown). */
function demo(): string {
  const tabs = DEMOS.map((d, i) => `<button class="dm-tab" type="button" role="tab" id="dm-tab-${d.id}" aria-controls="dm-pane-${d.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-demo="${d.id}"><img class="dm-icon" src="/assets/sites/${d.id}.png" alt="" width="20" height="20" /><span class="dm-tab-title">${esc(d.tab)}</span></button>`).join('')
  const panes = DEMOS.map((d, i) => `
            <div class="dm-pane" role="tabpanel" id="dm-pane-${d.id}" aria-labelledby="dm-tab-${d.id}" data-demo="${d.id}"${i ? ' hidden' : ''}>
              <div class="dm-out"><pre class="dm-md" aria-label="The start of the Markdown Octocrawl returned for ${esc(d.url)}">${foldedHtml(d.markdownHead)}</pre><canvas class="dm-drop" aria-hidden="true"></canvas><p class="dm-pill" aria-hidden="true"><span class="dm-glyph"><i>X</i><i>x</i><i>+</i><i>:</i></span>Reading <b>${esc(new URL(d.url).hostname)}</b></p></div>
            </div>`).join('')
  return `
          <div class="dm-window" id="demo">
            <div class="dm-chrome" aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="dm-tabs" role="tablist" aria-label="Three recorded scrapes">${tabs}</div>${panes}
          </div>`
}

const kb = (bytes: number): string => `${Math.round(bytes / 1000)} KB`
const smaller = (from: number, to: number): number => Math.round(100 - (100 * to) / from)

/** The formats the banner names, each with its glyph. */
export const FORMAT_ICONS: ReadonlyArray<readonly [string, string]> = [['#', 'Markdown'], ['{}', 'JSON'], ['┼', 'Tables'], ['≡', 'Lists'], ['↗', 'Links'], ['¶', 'PDF']]

/** What you get, one card each: the left column's words and the right column's card, drawn from the recorded reads. */
export const FORMAT_CARDS: ReadonlyArray<{ id: string; eyebrow: string; title: string; text: string; card: () => string }> = [
  {
    id: 'markdown', eyebrow: 'Built for LLMs', title: 'Clean Markdown.',
    text: 'Menus, ads, sidebars and footers are stripped away. Your model reads the content and nothing else.',
    card: () => `
              <div class="fx-pane is-raw"><p class="fx-label">HTML <b>${kb(OCTOPUS_SIZES.rawBytes)}</b></p><pre>${esc(DEMOS[0]!.rawHead.slice(0, 1400))}</pre></div>
              <div class="fx-pane is-md"><p class="fx-label">Markdown <b>${kb(OCTOPUS_SIZES.markdownBytes)}</b></p><pre>${foldedHtml(CARD_MARKDOWN)}</pre></div>
              <p class="fx-stat"><b>${smaller(OCTOPUS_SIZES.rawBytes, OCTOPUS_SIZES.markdownBytes)}%</b> smaller</p>
              <figcaption>en.wikipedia.org/wiki/Octopus · read 17 Oct 2026</figcaption>`,
  },
  {
    id: 'select', eyebrow: 'Just the part you need', title: 'Precise selection.',
    text: 'Point at sections with CSS selectors and leave the rest of the page behind.',
    card: () => `
              <div class="fx-pane is-select"><p class="fx-label">includeTags</p><ul class="fx-chips">${DEMOS[0]!.includeTags.map((t) => `<li><code>${esc(t)}</code></li>`).join('')}</ul></div>
              <div class="fx-pane is-md"><p class="fx-label">Markdown <b>${kb(OCTOPUS_SIZES.selectedBytes)}</b></p><pre>${foldedHtml(DEMOS[0]!.markdownHead.split('\n').slice(0, 5).join('\n'))}</pre></div>
              <p class="fx-stat"><b>${smaller(OCTOPUS_SIZES.rawBytes, OCTOPUS_SIZES.selectedBytes)}%</b> smaller</p>
              <figcaption>en.wikipedia.org/wiki/Octopus · read 17 Oct 2026</figcaption>`,
  },
  {
    id: 'json', eyebrow: 'Fields with receipts', title: 'Structured JSON.',
    text: 'Describe the fields in a JSON Schema. Each value comes back typed, with the exact spot on the page it was read from. No guessing, no made-up values.',
    card: () => `
              <div class="fx-pane is-json"><p class="fx-label">json.data <span>read from</span></p>
                <dl class="fx-fields">${AMAZON_FIELDS.map(([k, v, at]) => `<div><dt>${k}</dt><dd><code>${esc(v)}</code><small>${esc(at)}</small></dd></div>`).join('')}<div class="is-issue"><dt>${AMAZON_ISSUE.field}</dt><dd><code>null</code><small>${AMAZON_ISSUE.code}</small></dd></div></dl></div>
              <figcaption>amazon.sg/dp/0135957052 · read 17 Oct 2026</figcaption>`,
  },
  {
    id: 'tables', eyebrow: 'Tables as data', title: 'Every table, ready to use.',
    text: 'Each data table comes back as rows for a dataframe, a spreadsheet or a prompt.',
    card: () => `
              <div class="fx-pane is-table"><p class="fx-label">tables[${DATETIME_TABLE.index}] <b>${DATETIME_TABLE.columns} × ${DATETIME_TABLE.rows}</b></p>
                <table><thead><tr>${DATETIME_TABLE.head[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${DATETIME_TABLE.head.slice(1).map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
              <p class="fx-stat"><b>${DATETIME_TABLE.rows}</b> rows, also as CSV</p>
              <figcaption>docs.python.org/3/library/datetime.html · read 17 Oct 2026</figcaption>`,
  },
  {
    id: 'browser', eyebrow: 'Real browser', title: 'JavaScript, rendered.',
    text: 'Pages built with React, Vue or Next.js open in a real browser automatically, so content drawn by scripts comes back too.',
    card: () => `
              <div class="fx-pane is-trace"><p class="fx-label">tried</p><p class="fx-lanes"><span>http</span><span aria-hidden="true">→</span><span class="is-on">browser</span></p><p class="fx-result">success · <b>10 quotes</b> · 387 tokens</p></div>
              <div class="fx-pane is-md"><p class="fx-label">Markdown</p><pre>${HARD[0]!.lines.slice(0, 7).map((t) => markdownLine(t)).join('\n')}</pre></div>
              <figcaption>quotes.toscrape.com/js · read 17 Oct 2026</figcaption>`,
  },
  {
    id: 'files', eyebrow: 'Docs to data', title: 'PDFs and files.',
    text: 'PDFs come back as Markdown, page by page. CSV, JSON and text files come back as text.',
    card: () => `
              <div class="fx-pane is-pdf" aria-hidden="true"><p class="fx-label">PDF <b>p. 1</b></p><i class="is-head"></i><i></i><i></i><i class="is-short"></i><i></i><i></i><i class="is-short"></i><i></i><i></i><i></i><i class="is-short"></i></div>
              <div class="fx-pane is-md" aria-hidden="true"><pre><span class="md-punct">&lt;!-- page 1 --&gt;</span>\n<span class="md-punct">#</span> <span class="fx-bar is-head"></span>\n<span class="fx-bar"></span>\n<span class="fx-bar"></span>\n<span class="fx-bar is-short"></span>\n\n<span class="md-punct">&lt;!-- page 2 --&gt;</span>\n<span class="md-punct">##</span> <span class="fx-bar is-head"></span>\n<span class="fx-bar"></span>\n<span class="fx-bar is-short"></span></pre></div>`,
  },
]

/** What you get: a banner of light in characters that opens the formats, then the formats themselves, the words on the
 * left and a card on the right that changes as the reader scrolls (scrapeFormats.ts). */
function whatYouGet(): string {
  const items = FORMAT_CARDS.map((c, i) => `
            <li class="fx-item${i ? '' : ' is-active'}" data-step="${i}"><h3 class="fx-head"><button type="button" data-step="${i}" aria-controls="fx-card-${c.id}">${c.title}</button></h3><div class="fx-body"><p class="fx-eyebrow">${c.eyebrow}</p><p>${c.text}</p></div></li>`).join('')
  const cards = FORMAT_CARDS.map((c, i) => `
            <figure class="fx-card is-${c.id}${i ? '' : ' is-active'}" id="fx-card-${c.id}" data-step="${i}">${c.card()}
            </figure>`).join('')
  return `
    <section class="fx-section" id="what-you-get" aria-labelledby="fx-title">
      <div class="band">
        <div class="frame">
          <div class="fx-banner">
            <div class="fx-light" aria-hidden="true"></div>
            <div class="fx-copy">
              <p class="fx-kicker">What you get</p>
              <h2 id="fx-title">Every format your agent needs. <span>One call.</span></h2>
              <p class="fx-lead">Markdown, tables, typed fields, links and screenshots, all from the same read. No HTML to clean, no parser to write.</p>
              <ul class="fx-formats" aria-label="Formats">${FORMAT_ICONS.map(([g, label]) => `<li><span class="fx-glyph" aria-hidden="true">${esc(g)}</span>${label}</li>`).join('')}</ul>
            </div>
          </div>
          <div class="fx-scroll">
            <div class="fx-stage">
              <ol class="fx-list">${items}
              </ol>
              <div class="fx-stack">${cards}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`
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
            <p class="sc-small">The bytes here are the docs page exactly as that read returned them. Read earlier the same day, the page hashed to a different value: only its “Last updated” line had changed. The record holds the hash of the exact bytes Octocrawl read. <a href="/docs/reference/#evidence-record">Reference</a></p>
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
            <p class="sc-lead">The Wikipedia page above, with its links, tables and four fields, from curl, an MCP client, the CLI, TypeScript or Python.</p>
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
            <p class="sc-lead">The three pages above were read over HTTP: 1 credit each on an account, or within the 20 free pages a day without a key. A free account gets 1,000 credits a month. On your own computer there is no limit. Paid credit packs aren’t sold yet.</p>
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
      <div class="pd-art" data-art="road" aria-hidden="true"><div class="hero-backdrop"></div><div class="hero-glyphs"></div></div>
      <div class="hero-shade pd-shade" aria-hidden="true"></div>
${siteHeaderMarkup()}      <main aria-labelledby="pd-title">
        <div class="band">
          <div class="frame pd-intro">
            <h1 id="pd-title">Scrape a web page.</h1>
            <p class="pd-lead">Give Octocrawl a public URL. You get the page as Markdown, its links and tables, the fields you name, and an Evidence Record of where each one came from.</p>
            <div class="pd-actions">
              <a class="pd-button is-primary" href="/dashboard/scrape/">Scrape now <span aria-hidden="true">→</span></a>
              <a class="pd-button" href="/docs/scrape/">Read the docs</a>
            </div>
          </div>
        </div>
        <div class="band">
          <div class="frame dm-frame">${demo()}
            <a class="pd-scroll" id="pd-scroll" href="#demo" hidden><span class="pd-scroll-glyph" aria-hidden="true"></span>Scroll to watch it read</a>
            <p class="pd-caption"><span>Three real pages read on hosted Octocrawl on 17 October 2026, each asking for its content (<code>includeTags</code>): the start of the raw HTML and of the Markdown that read returned. Link targets are folded here except the first; point at a link to see where it goes. Wikipedia text: <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</span><button class="pd-replay" type="button" id="dm-replay" hidden><span aria-hidden="true">↻</span> Play again</button></p>
          </div>
        </div>
      </main>
    </div>
${whatYouGet()}
${harder()}
${evidence()}
${callIt()}
${cost()}
${faq()}
${tryIt()}

${footerMarkup('/', false)}  </div>
`
}

