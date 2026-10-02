import { glyphBand, glyphCloud, glyphRows, glyphWaves } from './glyphArt'
import { REAL_SITE_MISSES, REAL_SITE_RUN } from './realSiteRun'
import { sessionMarkup } from './sessionScript'

/** Light sections in page order. Each gets a `[ 0N / 0M ]` bar numbered from this list, so adding or moving a
 * section renumbers the rest. The bar repeats the section's kicker, so screen readers skip it. */
const SECTION_BARS = [
  ['examples', 'WHAT COMES BACK'],
  ['how-it-works', 'HOW IT WORKS'],
  ['why-w2l', 'WHY OCTOCRAWL'],
  ['count-on', 'WHAT YOU CAN COUNT ON'],
  ['run-it-yourself', 'RUN IT YOURSELF'],
  ['status', 'WHAT WORKS TODAY'],
] as const

const pad2 = (n: number) => String(n).padStart(2, '0')

export function sectionBar(id: (typeof SECTION_BARS)[number][0]): string {
  const index = SECTION_BARS.findIndex(([key]) => key === id)
  const [, label] = SECTION_BARS[index]
  return `<div class="band"><div class="frame section-bar" aria-hidden="true"><span>[ <b>${pad2(index + 1)}</b> / ${pad2(SECTION_BARS.length)} ]</span><span>·</span><span class="section-bar-label">${label}</span></div></div>`
}


/** Results this page already shows, with where each came from. Nothing here is new data. */
const TICKER = [
  ['ok', 'docs.firecrawl.dev/introduction — success · 2,509 ms server time'],
  ['ok', 'amazon.sg/dp/B000NI69YA — 6 fields checked against the captured page'],
  ['no', 'linkedin.com/feed — blocked at the robots.txt check · 572 ms'],
  ['ok', '103 of 106 real-site cases passed · 30 Sep 2026'],
  ['ok', '0.0% false success on the 56-case suite · 19 Sep 2026'],
  ['ok', '62 of 72 research-user URLs read · the other 10 with reasons'],
] as const

function tickerItems(): string {
  return TICKER.map(([kind, text]) => `<li class="ticker-item"><span class="ticker-mark is-${kind}" aria-hidden="true">${kind === 'ok' ? '✓' : '✗'}</span>${text}</li>`).join('')
}

/** What each recorded result looked like as a page, drawn in glyphs beside the record itself. */
const DEMO_PAGES = {
  markdown: {
    url: 'https://docs.firecrawl.dev/introduction', kind: 'readable Markdown', pill: ['ok', '✓ success · 2,509 ms server time'],
    art: `┌─ [ nav ] ────────────────────────┐
│ ░░░░  ░░░░  ░░░░  ░░░░    [ ⌕ ] │
└──────────────────────────────────┘

  Get Started                 → Get Started
  ██████████ Introduction     → # Introduction
  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒    → …
  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒

┌─ [ footer ] ─────────────────────┐
│ · · · · · · · · · · · · · · · ·  │
└──────────────────────────────────┘`,
  },
  product: {
    url: 'https://www.amazon.sg/dp/B000NI69YA', kind: 'checked product fields · Beta', pill: ['ok', '✓ 6 fields checked against the page'],
    art: `┌──────────────┐
│   ╱╲    ╱╲   │   Fluke 116 HVAC Multimeter  ← title
│  ╱  ╲  ╱  ╲  │
│ ╱    ╲╱    ╲ │   SGD 290.67                 ← price
│   [ image ]  │
└──────────────┘   Sold by Amazon US          ← seller

  Deliver to Singapore 238823                 ← region
  ASIN B000NI69YA                             ← asin

  · · · · · · · · · · · · · · · · · · · · · ·
  each value checked against the captured page`,
  },
  blocked: {
    url: 'https://www.linkedin.com/feed/', kind: 'a refusal, with its reason', pill: ['no', '✗ blocked · 572 ms server time'],
    art: `  robots.txt ................ checked
  result .................... blocked
  fetch ..................... skipped
  content ................... none

        ╲   ╱
         ╲ ╱      stopped before fetching the page
          ╳
         ╱ ╲      no content — not an empty page
        ╱   ╲

  · · · · · · · · · · · · · · · · · · · · · ·`,
  },
} as const

/** Same-suite comparison from docs/benchmark-gate.md (CI run 35423895294, main@6dc2e6e, 56 synthetic cases). */
const BENCHMARK = {
  verified: { label: 'Verified completion', hint: 'higher is better', values: [66.1, 32.1, 14.3] },
  falseSuccess: { label: 'False success', hint: 'lower is better', values: [0, 67.9, 81.8] },
} as const
const BENCHMARK_TOOLS = ['Octocrawl', 'Firecrawl self-hosted v2.11.162', 'Crawl4AI 0.9.3'] as const

function benchmarkBars(key: keyof typeof BENCHMARK): string {
  const texture = glyphRows(140, 3)
  return BENCHMARK[key].values.map((value, index) => {
    const ours = index === 0
    return `<li class="bench-row${ours ? ' is-ours' : ''}"><span class="bench-badge" aria-hidden="true">${ours ? '◆' : index === 1 ? 'fc' : 'c4'}</span><span class="bench-name">${BENCHMARK_TOOLS[index]}</span><span class="bench-track"><span class="bench-fill" style="--value: ${value}%">${ours ? `<span class="bench-glyphs" aria-hidden="true">${texture}</span>` : ''}</span><span class="bench-value${value < 12 ? ' is-low' : ''}" style="--value: ${value}%">${value.toFixed(1)}%</span></span></li>`
  }).join('')
}

function benchmarkPanels(): string {
  return (Object.keys(BENCHMARK) as Array<keyof typeof BENCHMARK>).map((key) => `<div class="tab-panel bench-panel" role="tabpanel" id="bench-panel-${key}" aria-labelledby="bench-tab-${key}"><p class="bench-hint">${BENCHMARK[key].label} · ${BENCHMARK[key].hint}</p><ul class="bench-list" role="list">${benchmarkBars(key)}</ul></div>`).join('')
}

function benchmarkTabs(): string {
  return (Object.keys(BENCHMARK) as Array<keyof typeof BENCHMARK>).map((key, index) => `<button class="tab" type="button" role="tab" id="bench-tab-${key}" aria-controls="bench-panel-${key}" aria-selected="${index === 0}"${index ? ' tabindex="-1"' : ''} data-tab="bench-${key}"><span class="row-mark" aria-hidden="true"></span>${BENCHMARK[key].label}</button>`).join('')
}

/** One cell per case of the real-site run; the three that did not pass carry their reason. */
function runGrid(): string {
  return REAL_SITE_RUN.map(([id, host, checks]) => {
    const miss = REAL_SITE_MISSES[id]
    const note = miss ? `did not pass · ${miss}` : `${checks} checks passed`
    return `<li class="run-cell${miss ? ' is-miss' : ''}" data-label="${id} · ${host} · ${note}" title="${id} · ${host} · ${note}">${miss ? '✗' : '×'}</li>`
  }).join('')
}

/** Rows of the run record: three that passed (S12 accepts an honest block), then the three that did not. */
const RECORD_ROWS = [
  ['S01', 'books.toscrape.com', '7/7 checks', 'ok'],
  ['S12', 'www.bls.gov', '1/1 checks · block allowed', 'ok'],
  ['F10', 'www150.statcan.gc.ca', '11/11 checks', 'ok'],
  ['J05', 'demoshop.oxid-esales.com', '1/4 · Cloudflare challenge', 'no'],
  ['J04', 'www.jpc.de', '1/8 · robots.txt timeout', 'no'],
  ['A36', 'www.sec.gov', 'skipped · no contact set', 'no'],
] as const

/** Case J01 of the same run: a real public page, its fields and where each was read. */
const FIELD_ROWS = [
  ['✓', 'title', 'A Light in the Attic', 'h1[0]'],
  ['✓', 'price', '51.77', 'p.price_color'],
  ['✓', 'upc', 'a897fe39b1053632', 'table "UPC"'],
  ['—', 'isbn', 'empty', 'not on the page'],
] as const

const FORMATS = [
  ['#', 'Markdown', 'readable text · .md'],
  ['↗', 'Links', 'every link, up to 500 · .links.txt'],
  ['i', 'Page info', 'title, language; a file’s pages · .info.json'],
  ['{}', 'Fields', 'the fields set in Options · .fields.json'],
  ['[]', 'JSON', 'the whole result · .json'],
  ['▤', 'PDF', 'PDFs and other files up to 5 MiB'],
  ['⧉', 'Copy', 'copy any view to the clipboard'],
  ['↓', 'Download', 'download any view as a file'],
] as const

const STATES = [
  ['✓', 'success', 'Readable page content was captured.', 'ok'],
  ['✗', 'blocked', 'Site policy, a login or a verification page stopped it.', 'no'],
  ['◐', 'incomplete', 'Content or field checks could not be finished.', 'warn'],
  ['◷', 'timed out', 'The preview deadline expired.', 'muted'],
  ['!', 'failed', 'An HTTP or network error, with a diagnostic code.', 'muted'],
] as const

const NOW = [
  ['#', 'Markdown, links and page info', 'This page'],
  ['{}', 'Up to 20 fields you name', 'This page'],
  ['▤', 'PDFs and files up to 5 MiB', 'This page'],
  ['×', 'Amazon.sg products · Beta', 'This page'],
  ['∅', 'No account; results not saved', 'This page'],
  ['›_', 'REST: scrape, 1,000-URL batches, crawl with resume', 'Your computer'],
  ['⇄', 'Local MCP · verified with Codex', 'Your computer'],
  ['ts', 'TypeScript SDK, from the repository', 'Your computer'],
  ['◷', 'Monitor with HTTPS webhook delivery', 'Your computer'],
  ['⌁', 'Your own proxy · Firecrawl v1 shim (partial)', 'Your computer'],
] as const

const NEXT = [
  ['$', 'One-line install with <code>npx</code>'],
  ['py', 'npm packages and a Python client'],
  ['↻', '<code>map</code> and a <code>maxAge</code> cache'],
  ['▦', 'Tables to CSV'],
  ['⧉', 'A browser extension that reads pages in your own browser'],
] as const

/** The page's markup. The build writes it into index.html (see vite.config.ts), so the headline, the form and every
 * section are in the HTML itself: readable before any script runs, by search engines and by LLM readers alike.
 * It must stay free of DOM access and styles, because it runs in Node at build time. */
export function pageMarkup(): string {
  return `
  <div class="page-shell">
    <div class="hero" id="top">
      <div class="hero-backdrop" aria-hidden="true"></div>
      <div class="hero-glyphs" id="hero-glyphs" aria-hidden="true"></div>
      <div class="hero-octopus-static" aria-hidden="true"></div>
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-click-spark" id="hero-click-spark" aria-hidden="true"></div>

      <div class="band band-dark">
        <header class="frame site-header">
          <a class="brand" href="#top" aria-label="Octocrawl home">
            <img class="brand-mark" src="/assets/octopus-original.webp" alt="" width="50" height="50" />
            <img class="brand-name" src="/assets/octocrawl-wordmark.svg" alt="" width="149" height="23" />
          </a>
          <nav class="site-nav" aria-label="Main navigation">
            <a class="nav-how" href="#how-it-works">How it works</a>
            <a href="/docs/">Docs <span aria-hidden="true">↗</span></a>
          </nav>
          <a class="github-link" href="https://github.com/77777R7/w2l" aria-label="Octocrawl on GitHub"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg><span class="github-label">GitHub</span><span class="card-arrow" aria-hidden="true">↗</span></a>
        </header>
      </div>

      <main aria-labelledby="hero-title">
        <div class="band band-dark">
          <div class="frame hero-cells">
            <div class="hero-octopus-cell" id="hero-ascii" data-calm="#hero-title, .hero-description" data-reach=".url-card" aria-hidden="true"></div>
            <div class="hero-cell hero-copy">
              <h1 id="hero-title">One link.<br /><em>Web data, ready.</em></h1>
              <p class="hero-description">Readable Markdown and checked fields from public pages, ready for an AI&nbsp;agent, a RAG pipeline or a&nbsp;citation. When a page can’t be read, you get the reason.</p>
            </div>
          </div>
        </div>
        <div class="band band-dark">
          <div class="frame hero-form-row">
            <form class="url-form" id="preview-form" novalidate>
              <label class="visually-hidden" for="url-input">Public web page URL</label>
              <div class="url-card">
                <div class="url-entry">
                  <span class="url-chip" aria-hidden="true">URL</span>
                  <input id="url-input" name="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="Paste a public page URL…" aria-describedby="url-help capability-message form-message" required />
                </div>
                <div class="url-toolbar">
                  <div class="url-tools">
                    <button class="tool-button" id="format-button" type="button" popovertarget="format-panel" aria-haspopup="dialog"><span class="tool-icon tool-icon-format" aria-hidden="true"></span><span class="visually-hidden">Output format: </span><span id="format-label">Markdown</span><span class="tool-caret" aria-hidden="true"></span></button>
                    <button class="tool-button" id="options-button" type="button" popovertarget="options-panel" aria-haspopup="dialog"><span class="tool-icon tool-icon-options" aria-hidden="true"></span><span class="tool-text">Options</span><span class="tool-badge" id="options-badge" hidden></span></button>
                  </div>
                  <button class="tool-button" id="code-button" type="button" aria-haspopup="dialog"><span class="tool-icon tool-icon-code" aria-hidden="true">&lt;/&gt;</span><span class="tool-text">Get code</span></button>
                  <button class="example-button" id="example-button" type="button">Try an example</button>
                  <button class="submit-button" id="submit-button" type="submit"><span id="submit-label">Extract page</span><span class="button-arrow" aria-hidden="true">→</span></button>
                </div>
              </div>
              <p class="form-message" id="form-message" role="status" aria-live="polite"></p>
              <p class="capability-message" id="capability-message" role="status" aria-live="polite"></p>
              <p class="url-help" id="url-help"><span id="quota-note">3 free previews a day</span> · Public pages only · <a class="url-help-link" href="/docs/connect-mcp/">Use it from your agent <span aria-hidden="true">↗</span></a></p>
              <div class="sheet format-sheet" id="format-panel" popover role="dialog" aria-labelledby="format-title">
                <div class="sheet-head">
                  <p class="sheet-title" id="format-title"><span class="kicker-square" aria-hidden="true"></span>Format</p>
                  <span class="sheet-esc" aria-hidden="true">esc</span>
                  <button class="sheet-close" type="button" popovertarget="format-panel" popovertargetaction="hide" aria-label="Close format"></button>
                </div>
                <div class="sheet-scroll">
                  <div class="format-tiles" role="radiogroup" aria-labelledby="format-title">
                    <label class="format-tile"><input type="radio" name="output-view" value="markdown" checked /><span class="tile-icon" data-icon="markdown" aria-hidden="true"></span><span class="tile-name">Markdown</span><span class="tile-note">readable text</span><span class="tile-ext">.md</span></label>
                    <label class="format-tile"><input type="radio" name="output-view" value="links" /><span class="tile-icon" data-icon="links" aria-hidden="true"></span><span class="tile-name">Links</span><span class="tile-note">every link, up to 500</span><span class="tile-ext">.links.txt</span></label>
                    <label class="format-tile"><input type="radio" name="output-view" value="info" /><span class="tile-icon" data-icon="info" aria-hidden="true"></span><span class="tile-name">Page info</span><span class="tile-note">title, language; a file's pages</span><span class="tile-ext">.info.json</span></label>
                    <label class="format-tile"><input type="radio" name="output-view" value="fields" /><span class="tile-icon" data-icon="fields" aria-hidden="true"></span><span class="tile-name">Fields</span><span class="tile-note">the fields set in Options</span><span class="tile-ext">.fields.json</span></label>
                    <label class="format-tile"><input type="radio" name="output-view" value="json" /><span class="tile-icon" data-icon="json" aria-hidden="true"></span><span class="tile-name">JSON</span><span class="tile-note">the whole result</span><span class="tile-ext">.json</span></label>
                  </div>
                  <p class="sheet-note">All from one extraction, so switching never uses another preview.</p>
                </div>
              </div>
              <div class="sheet options-sheet" id="options-panel" popover role="dialog" aria-labelledby="options-title">
                <div class="sheet-head">
                  <p class="sheet-title" id="options-title"><span class="kicker-square" aria-hidden="true"></span>Options</p>
                  <span class="sheet-esc" aria-hidden="true">esc</span>
                  <button class="sheet-close" type="button" popovertarget="options-panel" popovertargetaction="hide" aria-label="Close options"></button>
                </div>
                <div class="sheet-scroll">
                  <div class="sheet-section read-section">
                    <p class="sheet-label" id="read-title">Read</p>
                    <div class="read-body">
                      <div class="scope-choice" id="content-scope" role="radiogroup" aria-labelledby="read-title" aria-describedby="content-note">
                        <label class="scope-option"><input type="radio" name="content-scope" id="content-main" value="main" checked /><span class="row-mark" aria-hidden="true"></span>Main content</label>
                        <label class="scope-option"><input type="radio" name="content-scope" id="content-whole" value="whole" /><span class="row-mark" aria-hidden="true"></span>Whole page</label>
                      </div>
                      <p class="sheet-hint" id="content-note"></p>
                    </div>
                  </div>
                  <section class="sheet-section fields-section" aria-labelledby="fields-title">
                    <div class="fields-head">
                      <p class="sheet-label" id="fields-title">Fields</p>
                      <span class="fields-count" id="fields-count" aria-hidden="true"></span>
                      <span class="visually-hidden" id="fields-count-text" aria-live="polite"></span>
                      <button class="sheet-link" id="fields-preset" type="button" aria-label="Use the product fields: name, brand, price, currency, availability, SKU, rating and review count">+ product fields</button>
                    </div>
                    <div class="fields-list" id="fields-list" role="list" aria-labelledby="fields-title"></div>
                    <div class="field-new">
                      <span class="field-prompt" aria-hidden="true">›</span>
                      <input class="field-new-name" id="field-new" maxlength="64" autocomplete="off" spellcheck="false" aria-label="New field name" />
                      <button class="sheet-link" id="field-add" type="button">add</button>
                    </div>
                    <p class="option-error" id="fields-error" role="alert"></p>
                  </section>
                  <p class="sheet-note">Read from the page itself: JSON-LD, microdata, meta tags, tables and a PDF's "Label: value" lines. No AI: a field the page does not state comes back empty, with the reason.<br />PDFs up to 5 MB · Amazon.sg product pages take no options.</p>
                </div>
              </div>
              <dialog class="code-dialog" id="code-dialog" aria-labelledby="code-title" aria-describedby="code-lead">
                <div class="sheet-head">
                  <p class="sheet-title"><span class="kicker-square" aria-hidden="true"></span>Get code</p>
                  <span class="sheet-esc" aria-hidden="true">esc</span>
                  <button class="sheet-close" id="code-close" type="button" aria-label="Close"></button>
                </div>
                <div class="code-body">
                  <h2 class="code-title" id="code-title">Run it on your computer</h2>
                  <p class="code-lead" id="code-lead">The same page, format and options, with no daily limit. It needs a checkout of the Octocrawl repository. A local run can also use a local browser, so its result may differ from this preview.</p>
                  <div class="code-bar">
                    <div class="code-tabs" role="tablist" aria-label="How to run it">
                      <button class="code-tab" id="code-tab-curl" type="button" role="tab" aria-controls="code-panel" aria-selected="true" data-tab="curl"><span class="row-mark" aria-hidden="true"></span>cURL</button>
                      <button class="code-tab" id="code-tab-mcp" type="button" role="tab" aria-controls="code-panel" aria-selected="false" tabindex="-1" data-tab="mcp"><span class="row-mark" aria-hidden="true"></span>MCP call</button>
                      <button class="code-tab" id="code-tab-prompt" type="button" role="tab" aria-controls="code-panel" aria-selected="false" tabindex="-1" data-tab="prompt"><span class="row-mark" aria-hidden="true"></span>Prompt</button>
                    </div>
                    <button class="code-copy" id="code-copy" type="button">Copy</button>
                  </div>
                  <p class="code-step" id="code-step"></p>
                  <div class="code-panel" id="code-panel" role="tabpanel" tabindex="0" aria-labelledby="code-tab-curl"><ol class="code-lines" id="code-lines"></ol></div>
                  <p class="code-links"><a href="/docs/reference/">Advanced reference ↗</a><a href="/docs/connect-mcp/">Connect MCP ↗</a></p>
                  <p class="visually-hidden" id="code-status" role="status" aria-live="polite"></p>
                </div>
              </dialog>
            </form>
          </div>
        </div>
        <a class="hero-scroll" id="hero-scroll" href="#examples"><span class="hero-scroll-glyph" aria-hidden="true"></span><span id="hero-scroll-label">See what comes back</span></a>
      </main>
    </div>

    <div class="glyph-band" aria-hidden="true"><pre>${glyphBand()}</pre></div>

    <section class="ticker" id="ticker" aria-label="Recorded runs">
      <div class="ticker-head"><p class="ticker-label"><span class="kicker-square" aria-hidden="true"></span> RECORDED RUNS</p><button class="ticker-toggle" id="ticker-toggle" type="button" aria-pressed="false" aria-label="Pause the recorded runs"><span aria-hidden="true">❚❚</span></button></div>
      <div class="ticker-viewport">
        <div class="ticker-track">
          <ul class="ticker-list" role="list">${tickerItems()}</ul>
          <ul class="ticker-list" aria-hidden="true">${tickerItems()}</ul>
        </div>
      </div>
    </section>

    <section class="runs-section" id="result-section" aria-labelledby="runs-title" hidden>
      <div class="band">
        <div class="frame runs-head">
          <div><p class="section-kicker"><span class="kicker-square"></span> YOUR RESULTS</p><h2 id="runs-title">Recent runs</h2></div>
          <div class="runs-aside">
            <p class="runs-note">This visit only · cleared when you leave the page</p>
            <p class="runs-next">Use it in your agent: <a href="/docs/connect-mcp/">Connect MCP</a> · <a href="#run-it-yourself">Run it yourself</a></p>
          </div>
        </div>
      </div>
      <div class="band"><div class="frame runs-grid" id="runs-grid"></div></div>
      <div class="band">
        <div class="frame run-detail" id="run-detail">
          <div class="detail-head">
            <p class="section-kicker"><span class="kicker-square"></span> SELECTED RUN</p>
            <h2 id="result-heading" tabindex="-1">Reading the page…</h2>
            <p class="detail-url" id="detail-url"></p>
          </div>
          <div id="result-content" aria-live="polite" aria-atomic="false"></div>
        </div>
      </div>
    </section>

    <section class="examples-section" id="examples" aria-labelledby="examples-title">
      ${sectionBar('examples')}
      <div class="band">
        <div class="frame section-head is-centered">
          <pre class="glyph-cloud" aria-hidden="true">${glyphCloud(150, 30, 1)}</pre>
          <p class="section-kicker"><span class="kicker-square"></span> RECORDED RESULTS</p>
          <h2 id="examples-title">What comes <em>back.</em></h2>
          <p class="section-lead">Readable Markdown, product fields checked against the page, and a refusal with its reason. Three results Octocrawl recorded, shown as they were.</p>
        </div>
      </div>
      <div class="band">
        <div class="frame demo-wrap">
          <div class="demo-card examples-specimen" data-tabs>
            <div class="demo-chrome"><span class="demo-dots" aria-hidden="true">○○○</span><div class="tabs" role="tablist" aria-label="Recorded results" hidden><button class="tab" type="button" role="tab" id="ex-tab-markdown" aria-controls="ex-panel-markdown" aria-selected="true" data-tab="markdown"><span class="row-mark" aria-hidden="true"></span>Markdown</button><button class="tab" type="button" role="tab" id="ex-tab-product" aria-controls="ex-panel-product" aria-selected="false" tabindex="-1" data-tab="product"><span class="row-mark" aria-hidden="true"></span>Product JSON</button><button class="tab" type="button" role="tab" id="ex-tab-blocked" aria-controls="ex-panel-blocked" aria-selected="false" tabindex="-1" data-tab="blocked"><span class="row-mark" aria-hidden="true"></span>Honest failure</button></div></div>
            <figure class="tab-panel demo-panel" role="tabpanel" id="ex-panel-markdown" aria-labelledby="ex-tab-markdown"><div class="demo-split"><div class="demo-page" aria-hidden="true"><p class="demo-chip"><span>THE PAGE</span>${DEMO_PAGES.markdown.url}</p><pre>${DEMO_PAGES.markdown.art}</pre></div><div class="demo-result ledger-view"><p class="demo-chip"><span>THE RESULT</span>${DEMO_PAGES.markdown.kind}</p><dl class="ledger"><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true">›</span><span class="ledger-name">requestedUrl</span></dt><dd><span class="ledger-value is-code">https://docs.firecrawl.dev/introduction</span></dd></div><div class="ledger-row is-found"><dt><span class="ledger-mark" aria-hidden="true">✓</span><span class="ledger-name">status</span></dt><dd><span class="ledger-value is-code">success</span></dd></div><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true"></span><span class="ledger-name">title</span></dt><dd><span class="ledger-value is-code">Introduction</span></dd></div><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true"></span><span class="ledger-name">finalUrl</span></dt><dd><span class="ledger-value is-code">same as requested</span></dd></div><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true"></span><span class="ledger-name">totalMs</span></dt><dd><span class="ledger-value is-code">2509</span><span class="ledger-cite">server time</span></dd></div><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true"></span><span class="ledger-name">markdown</span></dt><dd><span class="ledger-value is-code">Get Started<br /># Introduction<br />…</span><span class="ledger-cite">the excerpt that was recorded</span></dd></div></dl><p class="demo-pill is-${DEMO_PAGES.markdown.pill[0]}">${DEMO_PAGES.markdown.pill[1]}</p></div></div><figcaption>Recorded 24 Sep 2026 on a local Octocrawl at source commit <code>936fdf0</code>.</figcaption></figure>
            <figure class="tab-panel demo-panel" role="tabpanel" id="ex-panel-product" aria-labelledby="ex-tab-product"><div class="demo-split"><div class="demo-page" aria-hidden="true"><p class="demo-chip"><span>THE PAGE</span>${DEMO_PAGES.product.url}</p><pre>${DEMO_PAGES.product.art}</pre></div><div class="demo-result ledger-view"><p class="demo-chip"><span>THE RESULT</span>${DEMO_PAGES.product.kind}</p><dl class="ledger"><div class="ledger-row is-found"><dt><span class="ledger-mark" aria-hidden="true">✓</span><span class="ledger-name">asin</span></dt><dd><span class="ledger-value is-code">B000NI69YA</span><span class="ledger-cite">matched the captured page</span></dd></div><div class="ledger-row is-found"><dt><span class="ledger-mark" aria-hidden="true">✓</span><span class="ledger-name">title</span></dt><dd><span class="ledger-value">Fluke 116 HVAC Multimeter, Standard</span><span class="ledger-cite">matched the captured page</span></dd></div><div class="ledger-row is-found"><dt><span class="ledger-mark" aria-hidden="true">✓</span><span class="ledger-name">price</span></dt><dd><span class="ledger-value is-code">290.67</span><span class="ledger-cite">matched the captured page</span></dd></div><div class="ledger-row is-found"><dt><span class="ledger-mark" aria-hidden="true">✓</span><span class="ledger-name">currency</span></dt><dd><span class="ledger-value is-code">SGD</span><span class="ledger-cite">matched the captured page</span></dd></div><div class="ledger-row is-found"><dt><span class="ledger-mark" aria-hidden="true">✓</span><span class="ledger-name">seller</span></dt><dd><span class="ledger-value">Amazon US</span><span class="ledger-cite">matched the captured page</span></dd></div><div class="ledger-row is-found"><dt><span class="ledger-mark" aria-hidden="true">✓</span><span class="ledger-name">region</span></dt><dd><span class="ledger-value">Singapore 238823</span><span class="ledger-cite">shown on the captured page</span></dd></div></dl><p class="demo-pill is-${DEMO_PAGES.product.pill[0]}">${DEMO_PAGES.product.pill[1]}</p></div></div><figcaption>Amazon.sg product <code>B000NI69YA</code>, recorded 23 Sep 2026 on a local Octocrawl at source commit <code>991097f</code>. Each value was matched against the captured page and signed off in a 100-product review, where 99 of 100 products came back complete and the one that did not withheld its fields. Amazon.sg support is in Beta.</figcaption></figure>
            <figure class="tab-panel demo-panel" role="tabpanel" id="ex-panel-blocked" aria-labelledby="ex-tab-blocked"><div class="demo-split"><div class="demo-page" aria-hidden="true"><p class="demo-chip"><span>THE PAGE</span>${DEMO_PAGES.blocked.url}</p><pre>${DEMO_PAGES.blocked.art}</pre></div><div class="demo-result ledger-view"><p class="demo-chip"><span>THE RESULT</span>${DEMO_PAGES.blocked.kind}</p><dl class="ledger"><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true">›</span><span class="ledger-name">requestedUrl</span></dt><dd><span class="ledger-value is-code">https://www.linkedin.com/feed/</span></dd></div><div class="ledger-row is-blocked"><dt><span class="ledger-mark" aria-hidden="true">✗</span><span class="ledger-name">status</span></dt><dd><span class="ledger-value is-code">blocked</span></dd></div><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true"></span><span class="ledger-name">reason</span></dt><dd><span class="ledger-value">This site does not allow automated preview of this page.</span></dd></div><div class="ledger-row"><dt><span class="ledger-mark" aria-hidden="true"></span><span class="ledger-name">totalMs</span></dt><dd><span class="ledger-value is-code">572</span><span class="ledger-cite">server time</span></dd></div></dl><p class="demo-pill is-${DEMO_PAGES.blocked.pill[0]}">${DEMO_PAGES.blocked.pill[1]}</p></div></div><figcaption>Recorded 24 Sep 2026 on a local Octocrawl at source commit <code>936fdf0</code>. Octocrawl stopped at the robots.txt check, before fetching the page, and returned no content instead of an empty page. At that commit the same reason was also given when robots.txt could not be read, and this record does not say which; Octocrawl now reports the two apart.</figcaption></figure>
          </div>
          <p class="demo-links"><a href="/docs/guides/extract-page/">Extract a public page <span aria-hidden="true">↗</span></a><a href="/docs/limits/">Limits and result states <span aria-hidden="true">↗</span></a></p>
        </div>
      </div>
    </section>

    <section class="how-section" id="how-it-works" aria-labelledby="how-title">
      ${sectionBar('how-it-works')}
      <div class="band">
        <div class="frame how-grid">
          <div class="how-intro">
            <p class="section-kicker"><span class="kicker-square"></span> HOW IT WORKS</p>
            <h2 id="how-title">From web page<br />to usable content.</h2>
            <ol class="how-list" role="list">
              <li class="how-step"><span class="step-number" aria-hidden="true">01</span><div><h3>Paste a public URL</h3><p>No install or sign-up. Paste any public http(s) address; you get 3&nbsp;previews a&nbsp;day.</p></div></li>
              <li class="how-step"><span class="step-number" aria-hidden="true">02</span><div><h3>Octocrawl checks, then reads</h3><p>It respects robots.txt and reads only what anyone can open, then reports the status, final URL and time.</p></div></li>
              <li class="how-step"><span class="step-number" aria-hidden="true">03</span><div><h3>Use the content</h3><p>Copy or download readable Markdown or the result JSON. Amazon.sg product pages add checked fields.</p></div></li>
            </ol>
            <p class="how-links"><a href="/docs/guides/extract-page/">Extract a public page <span aria-hidden="true">↗</span></a><a href="/docs/limits/">Limits and result states <span aria-hidden="true">↗</span></a></p>
          </div>
          <figure class="how-specimen">
            <div class="how-replay" id="how-replay">
              <div class="how-replay-window" aria-hidden="true" inert>${sessionMarkup()}</div>
            </div>
            <figcaption>A replay of two recorded runs on a local Octocrawl: the example page (24 Sep 2026) and an Amazon.sg product (23 Sep 2026). Pages change, so your results may differ.<span class="visually-hidden"> Example results: https://docs.firecrawl.dev/introduction returned success in 2.51 seconds of server time, with Markdown that starts "Get Started" and "# Introduction". The Amazon.sg product B000NI69YA, a Fluke 116 HVAC Multimeter, was matched for Singapore 238823 at SGD 290.67, sold by Amazon US, in 4.00 seconds measured by the client.</span></figcaption>
          </figure>
        </div>
      </div>
    </section>


    <section class="why-section" id="why-w2l" aria-labelledby="why-title" data-lazy-bg>
      <div class="ink-texture is-mountain" aria-hidden="true"></div>
      ${sectionBar('why-w2l')}
      <div class="band">
        <div class="frame section-head is-centered">
          <p class="section-kicker"><span class="kicker-square"></span> MEASURED, WITH ITS LIMITS</p>
          <h2 id="why-title">Can’t read a page?<br />Octocrawl <em>tells you why.</em></h2>
          <p class="section-lead">A crawler that only checks for a response can hand your agent a login wall, a challenge page or an empty shell as if it were the page. Octocrawl reports what it actually read.</p>
        </div>
      </div>
      <div class="band">
        <div class="frame cell-grid is-two">
          <div class="cell">
            <div class="cell-text">
              <p class="cell-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>Same suite, three tools</p>
              <h3 class="cell-claim">Fewer false successes. <span>On a fixed 56-case suite, no page Octocrawl called read failed the ground-truth check.</span></h3>
              <a class="cell-link" href="https://github.com/77777R7/w2l/blob/main/docs/benchmark-gate.md">See the method <span aria-hidden="true">›</span></a>
            </div>
            <div class="cell-visual bench" data-tabs>
              <div class="tabs bench-tabs" role="tablist" aria-label="Metric" hidden>${benchmarkTabs()}</div>
              ${benchmarkPanels()}
              <p class="cell-source">CI run 35423895294 · main@6dc2e6e · 19 Sep 2026 · a fixed synthetic suite, our own run, not an independent audit. On speed Octocrawl was slower: P95 10.1 s, against 104 ms for Firecrawl and 46.1 s for Crawl4AI. Cost was not compared.</p>
            </div>
          </div>
          <div class="cell">
            <div class="cell-text">
              <p class="cell-label"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>Real sites, every result kept</p>
              <h3 class="cell-claim"><span class="count-up" data-to="103" aria-hidden="true">103</span><span class="visually-hidden">103</span> of 106 passed. <span>Including sites where the right answer is an honest blocked. The three that didn’t stay in the count, with their reasons.</span></h3>
              <a class="cell-link" href="https://github.com/77777R7/w2l/blob/main/research/parity/runs/2026-09-30-main-6024703.md">See the run record <span aria-hidden="true">›</span></a>
            </div>
            <div class="cell-visual record">
              <table class="record-table">
                <thead><tr><th scope="col">Case</th><th scope="col">Site</th><th scope="col">Result</th></tr></thead>
                <tbody>${RECORD_ROWS.map(([id, host, result, kind]) => `<tr class="is-${kind}"><td>${id}</td><td>${host}</td><td><span aria-hidden="true">${kind === 'ok' ? '✓' : '✗'}</span> ${result}</td></tr>`).join('')}</tbody>
              </table>
              <div class="record-mark" aria-hidden="true"><pre>${glyphWaves(110, 7)}</pre><span class="record-octopus"><img src="/assets/octopus-original.webp" alt="" width="76" height="76" loading="lazy" /></span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="band">
        <div class="frame cell-grid">
          <div class="cell run-cells">
            <div class="run-head"><p class="section-kicker"><span class="kicker-square"></span> EVERY CASE IN THE 106-CASE REAL-SITE RUN</p><p class="run-label" id="run-label" aria-hidden="true">Hover a case</p></div>
            <ol class="run-grid" aria-hidden="true">${runGrid()}</ol>
            <p class="run-note">× passed, including honest blocked results · <strong>✗</strong> did not pass: ${Object.entries(REAL_SITE_MISSES).map(([id, why]) => `${id}, ${why}`).join('; ')}. Local API · main@6024703 · 30 Sep 2026. Also: 62 of 72 URLs from our first research user were read; each of the other 10 came back with its reason.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="count-section" id="count-on" aria-labelledby="count-title">
      <div class="count-band">
        <pre class="count-stars is-left" aria-hidden="true">   ·       +
 ·    ×  ·
     ·   <b>+</b>    ·
  ×     ·
       ·    ×</pre>
        <pre class="count-stars is-right" aria-hidden="true">  ·   ×
     ·     ·  <b>×</b>
 +    ·
    ·   ·   +</pre>
        ${sectionBar('count-on')}
        <div class="band">
          <div class="frame section-head is-centered">
            <p class="section-kicker"><span class="kicker-square"></span> ON EVERY PAGE</p>
            <h2 id="count-title">Checked. Honest. <em>Yours.</em><span class="count-caret" aria-hidden="true">▍</span></h2>
            <p class="section-lead">What Octocrawl does on every page, whether it can read it or not.</p>
            <p class="count-rule" aria-hidden="true">× · · · · · <b>×</b> · · · · · ×</p>
          </div>
        </div>
        <div class="band">
          <div class="frame flow-diagram" aria-hidden="true">
            <div class="flow-node"><span class="flow-box"><span class="flow-glyph">›_</span></span><span class="flow-name">YOUR AGENT</span></div>
            <div class="flow-line"><span class="flow-chip">MCP · REST · SDK</span></div>
            <div class="flow-node is-main"><span class="flow-box"><span class="flow-ring"><img src="/assets/octopus-original.webp" alt="" width="68" height="68" loading="lazy" /></span></span><span class="flow-name">OCTOCRAWL</span></div>
            <div class="flow-line"><span class="flow-chip is-ok">robots.txt ✓</span></div>
            <div class="flow-node"><span class="flow-box"><pre class="flow-page">┌──────┐
│ ▒▒▒▒ │
│ ░░░░ │
│ ░░   │
└──────┘</pre></span><span class="flow-name">PUBLIC PAGE</span></div>
          </div>
        </div>
      </div>
      <div class="glyph-band is-navy" aria-hidden="true"><pre>${glyphBand()}</pre></div>
      <div class="band">
        <div class="frame cell-grid is-two">
          <div class="cell">
            <div class="cell-text">
              <p class="cell-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5v16h3M16 4h3v16h-3"/></svg>Fields you can check</p>
              <h3 class="cell-claim">Read from the page itself. <span>JSON-LD, microdata, meta tags and tables — no model. Each field names where it came from; one the page doesn’t state stays empty, with the reason.</span></h3>
            </div>
            <div class="cell-visual fields">
              <span class="fields-ring is-1" aria-hidden="true"></span><span class="fields-ring is-2" aria-hidden="true"></span><span class="fields-ring is-3" aria-hidden="true"></span>
              <pre class="fields-halo" aria-hidden="true">${glyphCloud(80, 30, 11)}</pre>
              <figure class="fields-card">
                <figcaption>books.toscrape.com · case J01 · 30 Sep 2026</figcaption>
                <dl>${FIELD_ROWS.map(([mark, name, value, where]) => `<div class="${mark === '✓' ? 'is-found' : 'is-empty'}"><dt><span aria-hidden="true">${mark}</span>${name}</dt><dd>${value}<span>${where}</span></dd></div>`).join('')}</dl>
              </figure>
            </div>
          </div>
          <div class="cell">
            <div class="cell-text">
              <p class="cell-label"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>One extraction, every view</p>
              <h3 class="cell-claim">Five formats, one preview. <span>Switching views never uses another preview.</span></h3>
            </div>
            <div class="cell-visual formats">
              <p class="formats-bar" aria-hidden="true"><span class="demo-dots">○○○</span><span id="format-note">Markdown — readable text · .md</span></p>
              <ul class="formats-grid" role="list">${FORMATS.map(([icon, name, note]) => `<li class="format-cell" data-note="${name} — ${note}"><span class="format-icon" aria-hidden="true">${icon}</span><span class="format-name">${name}<span class="visually-hidden">: ${note}</span></span></li>`).join('')}</ul>
            </div>
          </div>
        </div>
      </div>
      <div class="band">
        <div class="frame cell-grid">
          <div class="cell states-cell">
            <h3 class="cell-claim">Failures you can see. <span>Never an empty page dressed as success.</span></h3>
            <ul class="states-grid" role="list">${STATES.map(([mark, name, why, kind]) => `<li class="state-tile is-${kind}"><span class="state-icon" aria-hidden="true">${mark}</span><span class="state-name">${name}</span><span class="state-why">${why}</span></li>`).join('')}</ul>
          </div>
        </div>
      </div>
      <div class="band">
        <div class="frame cell-grid is-open">
          <div class="cell">
            <div class="cell-text">
              <p class="cell-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>Open source</p>
              <h3 class="cell-claim">On your machine. <span>AGPL-3.0, no daily limit, your own network and proxy (<code>HTTPS_PROXY</code>), and a local Chromium for pages that need a browser.</span></h3>
              <a class="cell-link" href="https://github.com/77777R7/w2l">Check out the repo <span aria-hidden="true">›</span></a>
            </div>
          </div>
          <div class="cell open-terminal">
            <pre><span>$</span> git clone https://github.com/77777R7/w2l.git
<span>$</span> cd w2l &amp;&amp; npm ci
<span>$</span> npx playwright install chromium
<span>$</span> npm run local:mcp

<i># point your agent at it</i>
<span>$</span> codex mcp add w2l-local --url http://127.0.0.1:8791/mcp</pre>
          </div>
        </div>
      </div>
    </section>

    <section class="selfhost-section is-scene" data-lazy-bg id="run-it-yourself" aria-labelledby="selfhost-title">
      ${sectionBar('run-it-yourself')}
      <div class="band">
        <div class="frame selfhost-grid">
          <div class="selfhost-intro">
            <p class="section-kicker"><span class="kicker-square"></span> RUN IT YOURSELF</p>
            <h2 id="selfhost-title">Three a day here.<br /><em>Unlimited on yours.</em></h2>
            <p class="section-lead">Clone the repository, start Octocrawl on your computer, and call it from your agent through MCP, from your code through REST or the SDK, or from a Firecrawl v1 client. Results stay on your machine.</p>
            <div class="selfhost-actions">
              <a class="cta-primary" href="https://github.com/77777R7/w2l"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>Star on GitHub</a>
              <a class="cta-secondary" href="/docs/connect-mcp/">Connect MCP <span aria-hidden="true">↗</span></a>
              <a class="cta-secondary" href="/docs/reference/">REST and SDK <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <figure class="selfhost-specimen" data-tabs>
            <div class="selfhost-sheet">
              <div class="selfhost-head"><div class="tabs is-dark" role="tablist" aria-label="Ways to run Octocrawl" hidden><button class="tab" type="button" role="tab" id="sh-tab-start" aria-controls="sh-panel-start" aria-selected="true" data-tab="start"><span class="row-mark" aria-hidden="true"></span>Start</button><button class="tab" type="button" role="tab" id="sh-tab-mcp" aria-controls="sh-panel-mcp" aria-selected="false" tabindex="-1" data-tab="mcp"><span class="row-mark" aria-hidden="true"></span>MCP</button><button class="tab" type="button" role="tab" id="sh-tab-sdk" aria-controls="sh-panel-sdk" aria-selected="false" tabindex="-1" data-tab="sdk"><span class="row-mark" aria-hidden="true"></span>SDK</button><button class="tab" type="button" role="tab" id="sh-tab-firecrawl" aria-controls="sh-panel-firecrawl" aria-selected="false" tabindex="-1" data-tab="firecrawl"><span class="row-mark" aria-hidden="true"></span>Firecrawl v1</button></div><button class="selfhost-copy" id="selfhost-copy" type="button">Copy</button></div>
              <div class="tab-panel selfhost-panel" role="tabpanel" id="sh-panel-start" aria-labelledby="sh-tab-start"><ol class="code-lines"><li><span class="code-text">git clone https://github.com/77777R7/w2l.git</span></li><li><span class="code-text">cd w2l &amp;&amp; npm ci</span></li><li><span class="code-text">npx playwright install chromium</span></li><li><span class="code-text">npm run api</span></li><li class="is-comment"><span class="code-text"># in another terminal</span></li><li><span class="code-text">curl -sS -X POST http://127.0.0.1:8787/v1/scrape \\</span></li><li><span class="code-text">  -H 'content-type: application/json' \\</span></li><li><span class="code-text">  -d '{"url":"https://example.com"}'</span></li></ol><p class="selfhost-note">Node.js 22.13 or later. The API listens on this computer only.</p></div><div class="tab-panel selfhost-panel" role="tabpanel" id="sh-panel-mcp" aria-labelledby="sh-tab-mcp"><ol class="code-lines"><li class="is-comment"><span class="code-text"># in the Octocrawl checkout: the local MCP service</span></li><li><span class="code-text">npm run local:mcp</span></li><li class="is-comment"><span class="code-text"># Codex</span></li><li><span class="code-text">codex mcp add w2l-local --url http://127.0.0.1:8791/mcp</span></li><li class="is-comment"><span class="code-text"># Claude Code</span></li><li><span class="code-text">claude mcp add --transport http --scope local \\</span></li><li><span class="code-text">  w2l-local http://127.0.0.1:8791/mcp</span></li></ol><p class="selfhost-note">Local only: the service listens on 127.0.0.1. Verified with Codex; setups for Claude Code, Cursor and OpenCode are in the guide.</p></div><div class="tab-panel selfhost-panel" role="tabpanel" id="sh-panel-sdk" aria-labelledby="sh-tab-sdk"><ol class="code-lines"><li class="is-comment"><span class="code-text">// in the Octocrawl checkout, with npm run api running;</span></li><li class="is-comment"><span class="code-text">// run with: node --import tsx your-script.ts</span></li><li><span class="code-text">import { Octocrawl } from '@w2l/sdk'</span></li><li><span class="code-text"></span></li><li><span class="code-text">const w2l = new Octocrawl({ baseUrl: 'http://127.0.0.1:8787' })</span></li><li><span class="code-text">const page = await w2l.scrape('https://example.com', { debug: false })</span></li><li><span class="code-text">console.log(page.status, page.markdown)</span></li></ol><p class="selfhost-note">Local only. <code>@w2l/sdk</code> lives in the repository; it is not on npm yet.</p></div><div class="tab-panel selfhost-panel" role="tabpanel" id="sh-panel-firecrawl" aria-labelledby="sh-tab-firecrawl"><ol class="code-lines"><li class="is-comment"><span class="code-text"># a Firecrawl v1 client can point at your local Octocrawl</span></li><li><span class="code-text">curl -sS -X POST http://127.0.0.1:8787/fc/v1/scrape \\</span></li><li><span class="code-text">  -H 'content-type: application/json' \\</span></li><li><span class="code-text">  -d '{"url":"https://example.com","formats":["markdown"]}'</span></li></ol><p class="selfhost-note">Partial and local only: Firecrawl v1 <code>scrape</code> and <code>crawl</code>, Markdown and links. No search, map, extract or v2. A migration aid, not a full compatibility layer.</p></div>
            </div>
            <p class="visually-hidden" id="selfhost-status" role="status" aria-live="polite"></p>
          </figure>
        </div>
      </div>
    </section>

    <section class="status-section" id="status" aria-labelledby="status-title" data-lazy-bg>
      <div class="ink-texture is-earth" aria-hidden="true"></div>
      ${sectionBar('status')}
      <div class="band">
        <div class="frame section-head is-centered">
          <p class="section-kicker"><span class="kicker-square"></span> STATUS</p>
          <h2 id="status-title">What’s here, what’s <em>next.</em></h2>
          <p class="section-lead">What you can use now, on this page and on your own computer, and what the roadmap has next.</p>
        </div>
      </div>
      <div class="band">
        <div class="frame cell-grid">
          <ul class="icon-grid" role="list" aria-label="Available now">${NOW.map(([glyph, name, where]) => `<li class="icon-tile"><span class="icon-glyph" aria-hidden="true">${glyph}</span><span class="icon-name">${name}</span><span class="icon-tag${where === 'This page' ? ' is-page' : ''}">${where}</span></li>`).join('')}</ul>
          <p class="icon-grid-head" id="status-next"><span aria-hidden="true">○</span> NEXT</p>
          <ul class="icon-grid is-next" role="list" aria-labelledby="status-next">${NEXT.map(([glyph, name]) => `<li class="icon-tile"><span class="icon-glyph" aria-hidden="true">${glyph}</span><span class="icon-name">${name}</span></li>`).join('')}</ul>
          <div class="status-lines">
            <p><span class="status-key">‖ On hold</span> Hosted API and hosted MCP, until people need runs while their computer is off; search and agent features, until a paying user asks.</p>
            <p><span class="status-key">✗ Not planned</span> Stealth, fingerprint spoofing or proxy pools; getting past logins or CAPTCHAs; scraping sales leads. <a href="https://github.com/77777R7/w2l/blob/main/ROADMAP.md">Roadmap <span aria-hidden="true">↗</span></a></p>
          </div>
        </div>
      </div>
    </section>

    <section class="cta-section" aria-labelledby="cta-title" data-lazy-bg>
      <div class="frame cta-inner">
        <p class="section-kicker"><span class="kicker-square"></span> GET STARTED</p>
        <h2 id="cta-title">Start with one link.</h2>
        <p class="cta-lead">Three free previews a day, no account. Or run it yourself, with no limit.</p>
        <form class="cta-form" id="cta-form" novalidate>
          <label class="visually-hidden" for="cta-url">Public web page URL</label>
          <input id="cta-url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="Paste a public page URL…" />
          <button class="submit-button" type="submit">Extract page <span class="button-arrow" aria-hidden="true">→</span></button>
        </form>
        <p class="cta-help">3 free previews a day · Public pages only · <a href="https://github.com/77777R7/w2l">Run it yourself <span aria-hidden="true">↗</span></a></p>
      </div>
    </section>

    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      <div class="band">
        <div class="frame faq-grid">
          <div class="faq-intro">
            <pre class="glyph-cloud is-side" aria-hidden="true">${glyphCloud(70, 34, 5)}</pre>
            <p class="section-kicker"><span class="kicker-square"></span> FAQ</p>
            <h2 id="faq-title">Questions,<br />answered <em>plainly.</em></h2>
          </div>
          <div class="faq-list"><details class="faq-item"><summary>Does Octocrawl respect robots.txt? Is this legal?</summary><p>We can’t give legal advice; here is what the preview does. It reads a site’s robots.txt before it fetches a page. If the page is disallowed, or robots.txt can’t be reached (a server error, no answer or a timeout), it stops and reports the page as blocked; a robots.txt that answers with a 4xx status counts as no rules, as RFC 9309 provides. It never signs in, solves a CAPTCHA or gets past a verification page, and it refuses private network addresses. What you do with a page is up to you and the site’s terms.</p></details><details class="faq-item"><summary>Which sites work?</summary><p>Public pages anyone can open without signing in. The preview reads them over HTTP without running JavaScript, so a page that only appears in a browser may come back incomplete. It reads pages up to 2 MiB and files such as PDFs up to 5 MiB, and stops after 40 seconds. Amazon.sg product pages (<code>/dp/ASIN</code>) are in Beta. X and Reddit posts often don’t come through: robots rules, sign-in walls or verification pages can stop the preview, and a hosted X or Reddit result hasn’t been verified yet. See <a href="/docs/limits/">Limits and result states</a>.</p></details><details class="faq-item"><summary>Why only three previews a day?</summary><p>The preview is a limited public trial: three previews per visitor and 100 for the whole site each UTC day. A request turned down before a preview starts, such as a malformed URL, or localhost or a private IP address typed into it, doesn’t count. Once a preview starts it counts, whatever the result, including a host name that turns out to point to a private network or a page stopped by robots.txt. Octocrawl on your own computer has no daily limit.</p></details><details class="faq-item"><summary>Do you store the URLs I submit, or the results?</summary><p>Results aren’t saved: your recent runs live in this page and are gone when you leave it. Each preview logs its state and the host of the page, never its path. While you type, the page asks the service for a short hint about the address, so that address appears in our hosting provider’s request log, kept for 30 days. The details are on the <a href="/docs/privacy/">Privacy</a> page.</p></details><details class="faq-item"><summary>How is Octocrawl different from Firecrawl or Crawl4AI?</summary><p>Octocrawl reports what it actually read: a blocked, incomplete or timed-out page is a result with a reason, and checked fields carry their source. The <a href="https://github.com/77777R7/w2l/blob/main/docs/benchmark-gate.md">benchmark notes</a> compare the three tools on the same test suite, with the limits of that comparison. For moving off Firecrawl, Octocrawl has a partial, local Firecrawl v1 shim.</p></details><details class="faq-item"><summary>Can I call the preview from a script?</summary><p>Please don’t: the preview is for trying Octocrawl in a browser. To automate, run Octocrawl yourself and use REST, the SDK or MCP.</p></details><details class="faq-item"><summary>Is it free?</summary><p>The preview is free and needs no account. Octocrawl is open source under the AGPL-3.0, and running it yourself costs nothing but your own machine. There is no paid plan today.</p></details></div>
        </div>
      </div>
    </section>

    <footer class="site-footer">
      <div class="band band-dark">
        <div class="frame footer-top">
          <div class="footer-brand-cell">
            <a class="brand footer-brand" href="#top" aria-label="Octocrawl home"><img class="brand-mark" src="/assets/octopus-original.webp" alt="" width="40" height="40" /><img class="brand-name" src="/assets/octocrawl-wordmark.svg" alt="" width="130" height="20" /></a>
            <p class="footer-tagline">Start with one link.</p>
            <p class="footer-note">Open-source web data you can cite</p>
          </div>
          <div class="footer-cards">
            <a class="footer-card is-primary" href="#top"><span class="footer-card-mark" aria-hidden="true">→</span>Try a page<span class="card-arrow" aria-hidden="true">↑</span></a>
            <a class="footer-card" href="https://github.com/77777R7/w2l"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>Star on GitHub<span class="card-arrow" aria-hidden="true">↗</span></a>
            <a class="footer-card" href="/docs/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>Documentation<span class="card-arrow" aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>
      <div class="band band-dark">
        <nav class="frame footer-columns" aria-label="Footer">
          <div class="footer-col"><p class="footer-heading">Product</p><ul><li><a href="#top">Try Octocrawl</a></li><li><a href="#examples">What comes back</a></li><li><a href="#how-it-works">How it works</a></li><li><a href="#why-w2l">Why Octocrawl</a></li><li><a href="#run-it-yourself">Run it yourself</a></li><li><a href="#faq">FAQ</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Docs</p><ul><li><a href="/docs/guides/extract-page/">Extract a public page</a></li><li><a href="/docs/guides/amazon-product/">Amazon.sg product JSON</a></li><li><a href="/docs/connect-mcp/">Connect MCP</a></li><li><a href="/docs/limits/">Limits and result states</a></li><li><a href="/docs/reference/">Advanced reference</a></li><li><a href="/llms.txt">llms.txt</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Legal</p><ul><li><a href="/docs/terms/">Terms of use</a></li><li><a href="/docs/acceptable-use/">Acceptable use</a></li><li><a href="/docs/privacy/">Privacy</a></li><li><a href="https://github.com/77777R7/w2l/blob/main/LICENSE">AGPL-3.0 license ↗</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Contact</p><ul><li><a href="mailto:hello@octocrawl.dev">hello@octocrawl.dev</a></li><li><a href="https://github.com/77777R7/w2l/issues">GitHub issues ↗</a></li><li><a href="https://github.com/77777R7/w2l">GitHub repository ↗</a></li><li><a href="/docs/contact/">Contact page</a></li><li><a href="#top">Back to top ↑</a></li></ul></div>
        </nav>
      </div>
    </footer>
  </div>
`
}
