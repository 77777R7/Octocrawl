import { footerMarkup, siteHeaderMarkup } from '../page'
import { glyphCloud } from '../glyphArt'
import { scrapeSnippet } from './scrapeCode'
import { foldMarkdown, foldedText } from './scrapeMarkdown'
import { AMAZON_FIELDS, AMAZON_ISSUE, DATETIME_TABLE, DEMOS, DOCS, DOCS_CELL, HARD, OCTOPUS_SIZES, PDF_READ } from './scrapeRun'

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

/** A line of a card's window: segments of text, each with its class (h heading, p punctuation, u link target, k key,
 * v value, c comment, a author, w warning). */
type Segment = readonly [string, string]

/** A card's window: a small dark browser window on the painting holding one real result. With `source`, scrapeWindows.ts
 * shows that text in the window's shape first (the raw HTML) and decodes it into the result when the card comes to the
 * front; without it the result types itself in. */
function cardWindow(o: { icon?: string; url: string; tag: string; label: string; source?: string; wrap?: boolean; lines: Segment[][] }): string {
  const lines = o.lines.map((line) => `<span class="fx-ln">${line.map(([cls, text]) => `<span class="${cls}">${esc(text)}</span>`).join('')}</span>`).join('\n')
  const text = o.lines.map((line) => line.map(([, t]) => t).join('').trimEnd()).join('\n')
  // The window decodes in place (scrapeWindows.ts), so assistive tech reads the result from a copy that never changes.
  return `<div class="fx-win${o.wrap ? ' is-wrap' : ''}"${o.source ? ` data-source="${esc(o.source)}"` : ''}>
              <pre class="visually-hidden">${esc(`${o.label}:\n${text}`)}</pre>
              <p class="fx-win-bar" aria-hidden="true">${o.icon ? `<img src="/assets/sites/${o.icon}.png" alt="" width="16" height="16" />` : '<span class="fx-win-dot" aria-hidden="true"></span>'}<span class="fx-win-url">${esc(o.url)}</span><b class="fx-win-tag">${esc(o.tag)}</b></p>
              <pre class="fx-win-body" aria-hidden="true">${lines}</pre>
            </div>`
}

/** A Markdown line split into segments: ** and link brackets as punctuation, link targets as links. */
function markdownSegments(text: string): Segment[] {
  return text.split(/(\*\*|\]\([^)]*\)|\[)/).filter(Boolean).map((part) => [part === '**' || part === '[' ? 'p' : part.startsWith('](') ? 'u' : 'b', part] as const)
}

/** Card 1: the Octopus page's raw HTML decoding into the start of its Markdown, the lead paragraph cut short. */
function markdownWindow(): string {
  const lead = foldedText(DEMOS[0]!.markdownHead.split('\n')[2]!)
  const cut = `${lead.slice(0, lead.lastIndexOf(' ', 230))} …`
  return cardWindow({
    icon: 'wikipedia', url: 'en.wikipedia.org/wiki/Octopus', tag: `${kb(OCTOPUS_SIZES.rawBytes)} → ${kb(OCTOPUS_SIZES.markdownBytes)}`, wrap: true,
    label: 'The start of the Markdown Octocrawl returned for the Wikipedia Octopus page',
    source: DEMOS[0]!.rawHead.replace(/\s+/g, ' ').slice(0, 900),
    lines: [[['p', '# '], ['h', 'Octopus']], [['p', '…']], markdownSegments(cut)],
  })
}

/** Card 3: some of the Amazon.sg product's fields, each with where on the page it was read, and the field it has not. */
function jsonWindow(): string {
  const width = 32
  const field = (key: string, value: string, note: Segment, last = false): Segment[] => {
    const shown = value.length > 18 ? `${value.slice(0, 16)}…"` : value
    const text = `  "${key}": ${shown}${last ? '' : ','}`
    return [['k', `  "${key}"`], ['p', ': '], ['v', `${shown}${last ? '' : ','}`], ['c', ' '.repeat(Math.max(1, width - text.length))], note]
  }
  return cardWindow({
    icon: 'amazon', url: 'amazon.sg/dp/0135957052', tag: 'fields + where read',
    label: 'Fields Octocrawl read from the Amazon.sg product page, each with where on the page it was read',
    lines: [
      [['p', '{']],
      [['p', '  …']],
      ...AMAZON_FIELDS.map(([key, value, at]) => (key ? field(key, value, ['c', `← ${at}`]) : [['p', '  …']] as Segment[])),
      [['p', '  …']],
      field(AMAZON_ISSUE.field, 'null', ['w', `← ${AMAZON_ISSUE.code}`], true),
      [['p', '}']],
    ],
  })
}

/** Text cut to `n` characters, an ellipsis marking the cut, padded to `n`. */
const cell = (text: string, n: number): string => (text.length > n ? `${text.slice(0, n - 1)}…` : text.padEnd(n))

/** Card 2: the selectors sent with the Octopus read, and the Markdown they kept: its title, the lead paragraph cut short,
 * and the section headings, "…" wherever the window leaves lines out. */
function selectWindow(): string {
  const tags = DEMOS[0]!.includeTags
  const kept = DEMOS[0]!.markdownHead.split('\n')
  const lines: Segment[][] = [[['p', '"includeTags": [']]]
  tags.forEach((tag, i) => lines.push([['p', '  '], ['v', `"${tag}"`], ['p', i < tags.length - 1 ? ',' : '']]))
  lines.push([['p', ']']], [['c', '']])
  // The Markdown's headings in order, with the lead under the title; a "…" for each run of lines skipped.
  let skipped = false
  for (const [i, line] of kept.entries()) {
    const heading = /^#{1,3} /.exec(line)
    if (heading) {
      if (skipped) lines.push([['p', '…']])
      skipped = false
      lines.push([['p', heading[0]], ['h', line.slice(heading[0].length)]])
      if (lines.length >= 15) {
        lines.push([['p', '…']])
        break
      }
    } else if (i === 2) {
      lines.push(markdownSegments(`${foldedText(line).slice(0, 44)} …`))
    } else if (line) skipped = true
  }
  return cardWindow({
    icon: 'wikipedia', url: 'en.wikipedia.org/wiki/Octopus', tag: `${kb(OCTOPUS_SIZES.rawBytes)} → ${kb(OCTOPUS_SIZES.selectedBytes)}`,
    label: 'The selectors sent with the Wikipedia Octopus read and the start of the Markdown they kept', lines,
  })
}

/** Card 4: the datetime page's format-code table as rows, its first three under the header. */
function tableWindow(): string {
  const widths = [10, 24, 18, 5]
  const row = (cells: readonly string[], head = false): Segment[] => cells.map((text, i) => [head ? 'h' : i === 0 ? 'k' : 'v', `${cell(text, widths[i]!)}${i < cells.length - 1 ? ' ' : ''}`] as const)
  return cardWindow({
    icon: 'docs', url: 'docs.python.org/3/library/datetime.html', tag: `${DATETIME_TABLE.columns} × ${DATETIME_TABLE.rows} · also CSV`,
    label: 'The first rows of the format-code table Octocrawl returned for the Python datetime docs page',
    lines: [
      [['p', `tables[${DATETIME_TABLE.index}]`]],
      row(DATETIME_TABLE.head[0], true),
      [['p', widths.map((w) => '─'.repeat(w)).join(' ')]],
      ...DATETIME_TABLE.head.slice(1, 4).map((cells) => row(cells)),
      [['p', '…']],
    ],
  })
}

/** Card 5: a page drawn by its script, read over HTTP and then in a browser, and the quotes it gave. */
function browserWindow(): string {
  const facts = HARD[0]!.facts.slice(0, 3)
  const quotes = HARD[0]!.lines.filter(Boolean).slice(0, 5)
  return cardWindow({
    url: new URL(HARD[0]!.url).host + new URL(HARD[0]!.url).pathname, tag: 'HTTP → browser', wrap: true,
    label: 'How Octocrawl read the quotes page, drawn by its script, and the start of the Markdown it returned',
    lines: [
      ...facts.map(([k, v]) => [['k', cell(k, 9)], ['v', v]] as Segment[]),
      [['c', '']],
      ...quotes.map((line) => (line.startsWith('#') ? markdownSegments(foldedText(line)).map(([c, t]) => [c === 'b' ? 'h' : c, t] as const) : line.startsWith('by ') ? [['a', line]] as Segment[] : markdownSegments(line))),
      [['p', '…']],
    ],
  })
}

/** Card 6: a paper read from its PDF: page markers, its title and the start of its abstract. */
function pdfWindow(): string {
  return cardWindow({
    url: new URL(PDF_READ.url).host + new URL(PDF_READ.url).pathname, tag: `PDF · ${PDF_READ.pagesRead} of ${PDF_READ.pageCount} pages`, wrap: true,
    label: 'The start of the Markdown Octocrawl returned for a paper read from its PDF',
    lines: [...PDF_READ.lines, '…'].map((line) => (line.startsWith('<!--') ? [['k', line]] : line === '…' ? [['p', line]] : line === 'Attention Is All You Need' || /^(Abstract|1 Introduction)$/.test(line) ? [['h', line]] : [['v', line]]) as Segment[]),
  })
}

const kb = (bytes: number): string => `${Math.round(bytes / 1000)} KB`

/** The formats the banner names, each with its glyph. */
export const FORMAT_ICONS: ReadonlyArray<readonly [string, string]> = [['#', 'Markdown'], ['{}', 'JSON'], ['┼', 'Tables'], ['≡', 'Lists'], ['↗', 'Links'], ['¶', 'PDF']]

/** What you get, one per format: the left column's words; its card on the right shows a painting for now. */
export const FORMAT_CARDS: ReadonlyArray<{ id: string; eyebrow: string; title: string; text: string; window?: () => string }> = [
  {
    id: 'markdown', eyebrow: 'Built for LLMs', title: 'Clean Markdown.', window: markdownWindow,
    text: 'Menus, ads, sidebars and footers are stripped away. Your model reads the content and nothing else.',
  },
  {
    id: 'select', eyebrow: 'Just the part you need', title: 'Precise selection.', window: selectWindow,
    text: 'Point at sections with CSS selectors and leave the rest of the page behind.',
  },
  {
    id: 'json', eyebrow: 'Fields with receipts', title: 'Structured JSON.', window: jsonWindow,
    text: 'Describe the fields in a JSON Schema. Each value comes back typed, with the exact spot on the page it was read from. No guessing, no made-up values.',
  },
  {
    id: 'tables', eyebrow: 'Tables as data', title: 'Every table, ready to use.', window: tableWindow,
    text: 'Each data table comes back as rows for a dataframe, a spreadsheet or a prompt.',
  },
  {
    id: 'browser', eyebrow: 'Real browser', title: 'JavaScript, rendered.', window: browserWindow,
    text: 'Pages built with React, Vue or Next.js open in a real browser automatically, so content drawn by scripts comes back too.',
  },
  {
    id: 'files', eyebrow: 'Docs to data', title: 'PDFs and files.', window: pdfWindow,
    text: 'PDFs come back as Markdown, page by page. CSV, JSON and text files come back as text.',
  },
]

/** What you get: a banner of light in characters that opens the formats, then the formats themselves, the words on the
 * left and a card on the right that changes as the reader scrolls (scrapeFormats.ts). */
function whatYouGet(): string {
  const items = FORMAT_CARDS.map((c, i) => `
            <li class="fx-item${i ? '' : ' is-active'}" data-step="${i}"><h3 class="fx-head"><button type="button" data-step="${i}" aria-controls="fx-card-${c.id}">${c.title}</button></h3><div class="fx-body"><p class="fx-eyebrow">${c.eyebrow}</p><p>${c.text}</p></div></li>`).join('')
  const cards = FORMAT_CARDS.map((c, i) => `
            <div class="fx-card is-${c.id}${i ? '' : ' is-active'}" id="fx-card-${c.id}" data-step="${i}">${c.window ? `
            ${c.window()}
            ` : ''}</div>`).join('')
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

/** Built for: who Octocrawl is for, a card each, each with a figure drawn in characters that answers the pointer
 * (builtForIcons.ts). */
export const BUILT_FOR: ReadonlyArray<{ icon: string; title: string; text: string; label: string }> = [
  {
    icon: 'orbit', title: 'Web access for any agent',
    text: 'Give Claude Code, Cursor, Codex or any MCP client a scrape tool. It reads clean Markdown and knows when a read failed instead of guessing.',
    label: 'Agents · MCP',
  },
  {
    icon: 'stack', title: 'Clean input for every model',
    text: 'Pages become Markdown and tables your RAG pipeline can index straight away, each output hashed so you know exactly what you stored.',
    label: 'Pipelines · SDK',
  },
  {
    icon: 'radar', title: 'Data that stays current',
    text: 'Pull prices, specs and tables as typed JSON. Run Octocrawl on your own computer to read them again on a schedule and get every change at your webhook.',
    label: 'Monitoring · Webhooks',
  },
]

function builtFor(): string {
  const cards = BUILT_FOR.map((c) => `
            <li class="bf-card">
              <div class="bf-inner">
                <h3>${c.title}</h3>
                <div class="bf-art"><canvas class="bf-icon" data-icon="${c.icon}" aria-hidden="true"></canvas></div>
                <p class="bf-text">${c.text}</p>
                <p class="bf-foot">${c.label}</p>
              </div>
            </li>`).join('')
  return `
    <section class="bf-section" id="built-for" aria-labelledby="bf-title">
      <div class="band">
        <div class="frame">
          <h2 id="bf-title" class="bf-title">Built for agents that <b>read</b>, pipelines that <b>learn</b>, and jobs that <b>watch</b>.</h2>
          <p class="bf-lead">Octocrawl turns any public page into clean, sourced data, ready for whatever reads it next.</p>
          <ul class="bf-cards">${cards}
          </ul>
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
${builtFor()}
${harder()}
${evidence()}
${callIt()}
${cost()}
${faq()}
${tryIt()}

${footerMarkup('/', false)}  </div>
`
}

