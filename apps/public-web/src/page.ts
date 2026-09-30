import { sessionMarkup } from './sessionScript'

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
          <a class="brand" href="#top" aria-label="W2L home">
            <img class="brand-mark" src="/assets/octopus-original.webp" alt="" width="50" height="50" />
            <span class="brand-name">W2L<span class="brand-dot">.</span></span>
          </a>
          <nav class="site-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="/docs/">Docs <span aria-hidden="true">↗</span></a>
          </nav>
          <a class="github-link" href="https://github.com/77777R7/w2l" aria-label="W2L on GitHub"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg><span class="github-label">GitHub</span><span class="card-arrow" aria-hidden="true">↗</span></a>
        </header>
      </div>

      <main aria-labelledby="hero-title">
        <div class="band band-dark">
          <div class="frame hero-cells">
            <div class="hero-octopus-cell" id="hero-ascii" data-calm="#hero-title, .hero-description" data-reach=".url-card" aria-hidden="true"></div>
            <div class="hero-cell hero-copy">
              <h1 id="hero-title">One link.<br /><em>Web data, ready.</em></h1>
              <p class="hero-description">Paste a public URL. Get readable content and verifiable fields where supported.</p>
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
              <p class="url-help" id="url-help">3 free previews a day · Public pages only</p>
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
                  <p class="code-lead" id="code-lead">The same page, format and options, with no daily limit. It needs a checkout of the W2L repository. A local run can also use a local browser, so its result may differ from this preview.</p>
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
        <a class="hero-scroll" id="hero-scroll" href="#how-it-works"><span class="hero-scroll-glyph" aria-hidden="true"></span><span id="hero-scroll-label">How it works</span></a>
      </main>
    </div>

    <section class="runs-section" id="result-section" aria-labelledby="runs-title" hidden>
      <div class="band">
        <div class="frame runs-head">
          <div><p class="section-kicker"><span class="kicker-square"></span> YOUR RESULTS</p><h2 id="runs-title">Recent runs</h2></div>
          <p class="runs-note">This visit only · cleared when you leave the page</p>
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

    <section class="how-section" id="how-it-works" aria-labelledby="how-title">
      <div class="band">
        <div class="frame how-grid">
          <div class="how-intro">
            <p class="section-kicker"><span class="kicker-square"></span> HOW IT WORKS</p>
            <h2 id="how-title">From web page<br />to usable content.</h2>
            <ol class="how-list" role="list">
              <li class="how-step"><span class="step-number" aria-hidden="true">01</span><div><h3>Paste a public URL</h3><p>No install or sign-up. Paste any public http(s) address; you get 3&nbsp;previews a&nbsp;day.</p></div></li>
              <li class="how-step"><span class="step-number" aria-hidden="true">02</span><div><h3>W2L checks, then reads</h3><p>It respects robots.txt and reads only what anyone can open, then reports the status, final URL and time.</p></div></li>
              <li class="how-step"><span class="step-number" aria-hidden="true">03</span><div><h3>Use the content</h3><p>Copy or download readable Markdown or the result JSON. Amazon.sg product pages add checked fields.</p></div></li>
            </ol>
            <p class="how-links"><a href="/docs/guides/extract-page/">Extract a public page <span aria-hidden="true">↗</span></a><a href="/docs/limits/">Limits and result states <span aria-hidden="true">↗</span></a></p>
          </div>
          <figure class="how-specimen">
            <div class="how-replay" id="how-replay">
              <div class="how-replay-window" aria-hidden="true" inert>${sessionMarkup()}</div>
            </div>
            <figcaption>A replay of two recorded runs, 24–25 Sep 2026: the example page and an Amazon.sg product. Pages change, so your results may differ.<span class="visually-hidden"> Example results: https://docs.firecrawl.dev/introduction passed its robots.txt check and returned success in 2.51 seconds of server time, 11,761 characters of Markdown starting with the heading Introduction. The Amazon.sg product B000NI69YA was matched and verified for Singapore 238823 in SGD at SGD 290.67, sold by Amazon US, in 12.54 seconds in the browser.</span></figcaption>
          </figure>
        </div>
      </div>
    </section>

    <footer class="site-footer">
      <div class="band band-dark">
        <div class="frame footer-top">
          <div class="footer-brand-cell">
            <a class="brand footer-brand" href="#top" aria-label="W2L home"><img class="brand-mark" src="/assets/octopus-original.webp" alt="" width="40" height="40" /><span class="brand-name">W2L<span class="brand-dot">.</span></span></a>
            <p class="footer-tagline">One link. Web data, ready.</p>
            <p class="footer-note">Single-page public web preview</p>
          </div>
          <div class="footer-cards">
            <a class="footer-card" href="https://github.com/77777R7/w2l"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>GitHub<span class="card-arrow" aria-hidden="true">↗</span></a>
            <a class="footer-card" href="/docs/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>Documentation<span class="card-arrow" aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>
      <div class="band band-dark">
        <nav class="frame footer-columns" aria-label="Footer">
          <div class="footer-col"><p class="footer-heading">Product</p><ul><li><a href="#top">Try W2L</a></li><li><a href="#how-it-works">How it works</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Guides</p><ul><li><a href="/docs/guides/extract-page/">Extract a public page</a></li><li><a href="/docs/guides/amazon-product/">Amazon.sg product JSON</a></li><li><a href="/docs/guides/monitor-webhook/">Monitor to HTTPS Webhook</a></li><li><a href="/docs/guides/batch-results/">Page through batch results</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Reference</p><ul><li><a href="/docs/connect-mcp/">Connect MCP</a></li><li><a href="/docs/limits/">Limits and result states</a></li><li><a href="/docs/reference/">Advanced reference</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Project</p><ul><li><a href="https://github.com/77777R7/w2l">GitHub ↗</a></li><li><a href="https://github.com/77777R7/w2l/blob/main/LICENSE">AGPL-3.0 license ↗</a></li><li><a href="#top">Back to top ↑</a></li></ul></div>
        </nav>
      </div>
    </footer>
  </div>
`
}
