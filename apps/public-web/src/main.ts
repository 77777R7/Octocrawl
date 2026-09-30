import './styles.css'
import { mountHeroAscii } from './ascii'
import { mountHeroClickSpark } from './clickSpark'
import { mountHowReplay } from './howReplay'
import { sessionMarkup } from './sessionScript'
import { fieldsSchema, isAmazonProduct, mcpPrompt, mcpSnippet, restSnippet, type FieldRequest, type FieldType, type OutputView } from './getCode'

type PreviewStatus = 'success' | 'incomplete' | 'blocked' | 'failed' | 'timeout' | 'invalid_url' | 'quota_exceeded'
type ProductPreview = {
  status: 'complete' | 'incomplete' | 'invalid'
  asin: string | null
  region: string | null
  currency: string | null
  data: Record<string, unknown> | null
  issues: Array<{ code: string; message: string }>
}
type PageMetadata = { title: string | null; description: string | null; language: string | null; keywords: string | null; robots: string | null; favicon: string | null; canonicalUrl: string | null }
type PreviewFile = {
  kind: string
  contentType: string | null
  bytes: number | null
  declaredBytes: number | null
  maxBytes: number
  sha256: string | null
  markdownFrom: 'pdf_text' | 'text' | null
  pdf: { pageCount: number | null; pagesRead: number } | null
  warnings: Array<{ code: string; message: string }>
}
type PreviewResponse = {
  status: PreviewStatus
  requestedUrl: string
  finalUrl: string | null
  title: string | null
  markdown: string | null
  markdownTruncated?: boolean
  totalMs: number
  reason: string | null
  diagnostic?: { code: string; stage: string; evidence: 'observed' | 'unobserved' }
  product?: ProductPreview
  links?: string[]
  linksTotal?: number
  metadata?: PageMetadata
  file?: PreviewFile
  json?: PreviewFields
}
type PreviewFields = {
  status: 'complete' | 'incomplete' | 'invalid'
  data: unknown
  schemaSha256?: string
  evidence: Array<{ path: string; source: string; evidencePath?: string; text?: string }>
  issues: Array<{ code: string; message: string; path?: string }>
}
type CapabilityResponse = { requestedUrl: string; capability: { task: string; support: string; captureMode: 'http' | 'browser_local'; limitation: string } }

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
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
                  <div class="format-rows" role="radiogroup" aria-labelledby="format-title">
                    <label class="format-row"><input type="radio" name="output-view" value="markdown" checked /><span class="row-mark" aria-hidden="true"></span><span class="row-name">Markdown</span><span class="row-note">the page's readable content</span><span class="row-ext">.md</span></label>
                    <label class="format-row"><input type="radio" name="output-view" value="links" /><span class="row-mark" aria-hidden="true"></span><span class="row-name">Links</span><span class="row-note">every link on the page, up to 500</span><span class="row-ext">.links.txt</span></label>
                    <label class="format-row"><input type="radio" name="output-view" value="info" /><span class="row-mark" aria-hidden="true"></span><span class="row-name">Page info</span><span class="row-note">title, description, language; a file's type and pages</span><span class="row-ext">.info.json</span></label>
                    <label class="format-row"><input type="radio" name="output-view" value="fields" /><span class="row-mark" aria-hidden="true"></span><span class="row-name">Fields</span><span class="row-note">the fields you set in Options</span><span class="row-ext">.fields.json</span></label>
                    <label class="format-row"><input type="radio" name="output-view" value="json" /><span class="row-mark" aria-hidden="true"></span><span class="row-name">JSON</span><span class="row-note">the whole result, as the server sent it</span><span class="row-ext">.json</span></label>
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
              <dialog class="code-dialog" id="code-dialog" aria-labelledby="code-title">
                <div class="panel-head">
                  <h2 class="panel-title" id="code-title">Run it on your computer</h2>
                  <button class="panel-close" id="code-close" type="button" aria-label="Close"></button>
                </div>
                <p class="code-lead">No daily limit. Both need a checkout of the W2L repository. A local run can also use a local browser, so its result may differ from this preview.</p>
                <section class="code-block" aria-labelledby="code-rest-title">
                  <div class="code-block-head"><h3 id="code-rest-title">REST · local API</h3><button class="copy-button" type="button" data-copy="code-rest">Copy</button></div>
                  <pre tabindex="0"><code id="code-rest"></code></pre>
                </section>
                <section class="code-block" aria-labelledby="code-mcp-title">
                  <div class="code-block-head"><h3 id="code-mcp-title">MCP · w2l-local</h3><button class="copy-button" type="button" data-copy="code-prompt">Copy prompt</button></div>
                  <p class="code-caption">Ask a client connected to <code>http://127.0.0.1:8791/mcp</code>:</p>
                  <pre tabindex="0"><code id="code-prompt"></code></pre>
                  <div class="code-block-head"><p class="code-caption">Or call the tool:</p><button class="copy-button" type="button" data-copy="code-mcp">Copy call</button></div>
                  <pre tabindex="0"><code id="code-mcp"></code></pre>
                </section>
                <p class="code-links"><a href="/docs/reference/">Advanced reference ↗</a><a href="/docs/connect-mcp/">Connect MCP ↗</a></p>
                <p class="visually-hidden" id="code-status" role="status" aria-live="polite"></p>
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

const hero = document.querySelector<HTMLElement>('.hero')!
// The page is built here, so the browser's own scroll to a linked section (/#how-it-works) would come later,
// animated, and after the hero had reported itself on screen and loaded its decoration: land there directly,
// unless a reload has already restored a scroll position.
try {
  const landing = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null
  if (landing && !hero.contains(landing) && !window.scrollY) landing.scrollIntoView({ behavior: 'instant' })
} catch { /* A malformed fragment keeps the browser's own handling. */ }
mountHeroAscii(document.querySelector<HTMLElement>('#hero-ascii')!, document.querySelector<HTMLElement>('#hero-glyphs')!, hero)
mountHeroClickSpark(document.querySelector<HTMLElement>('#hero-click-spark')!, hero)
mountHowReplay(document.querySelector<HTMLElement>('#how-replay')!)

const form = document.querySelector<HTMLFormElement>('#preview-form')!
const input = document.querySelector<HTMLInputElement>('#url-input')!
const message = document.querySelector<HTMLElement>('#form-message')!
const submit = document.querySelector<HTMLButtonElement>('#submit-button')!
const submitLabel = document.querySelector<HTMLElement>('#submit-label')!
const section = document.querySelector<HTMLElement>('#result-section')!
const resultHeading = document.querySelector<HTMLElement>('#result-heading')!
const runsGrid = document.querySelector<HTMLElement>('#runs-grid')!
const runDetail = document.querySelector<HTMLElement>('#run-detail')!
const detailUrl = document.querySelector<HTMLElement>('#detail-url')!
const content = document.querySelector<HTMLElement>('#result-content')!
const urlCard = document.querySelector<HTMLElement>('.url-card')!
const capabilityMessage = document.querySelector<HTMLElement>('#capability-message')!
const heroScroll = document.querySelector<HTMLAnchorElement>('#hero-scroll')!
const heroScrollLabel = document.querySelector<HTMLElement>('#hero-scroll-label')!
const urlHelp = document.querySelector<HTMLElement>('#url-help')!
const formatButton = document.querySelector<HTMLButtonElement>('#format-button')!
const formatLabel = document.querySelector<HTMLElement>('#format-label')!
const formatPanel = document.querySelector<HTMLElement>('#format-panel')!
const optionsButton = document.querySelector<HTMLButtonElement>('#options-button')!
const optionsBadge = document.querySelector<HTMLElement>('#options-badge')!
const optionsPanel = document.querySelector<HTMLElement>('#options-panel')!
const mainContent = document.querySelector<HTMLInputElement>('#content-main')!
const contentScope = document.querySelector<HTMLElement>('#content-scope')!
const contentNote = document.querySelector<HTMLElement>('#content-note')!
const fieldNew = document.querySelector<HTMLInputElement>('#field-new')!
const fieldsCountText = document.querySelector<HTMLElement>('#fields-count-text')!
const fieldsList = document.querySelector<HTMLElement>('#fields-list')!
const fieldsCount = document.querySelector<HTMLElement>('#fields-count')!
const fieldsError = document.querySelector<HTMLElement>('#fields-error')!
const fieldAdd = document.querySelector<HTMLButtonElement>('#field-add')!
const codeButton = document.querySelector<HTMLButtonElement>('#code-button')!
const codeDialog = document.querySelector<HTMLDialogElement>('#code-dialog')!
// Chosen with the Format button or in the result panel; kept for the next extraction in this visit.
let outputView: OutputView = 'markdown'
let capabilityTimer: number | undefined
let capabilityRequest: AbortController | undefined
const VIEW_NAMES: Record<OutputView, string> = { markdown: 'Markdown', links: 'Links', info: 'Page info', fields: 'Fields', json: 'JSON' }

function downloadFile(content: string, name: string, type: string): void {
  const objectUrl = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function resultFilename(result: PreviewResponse, extension: 'md' | 'links.txt' | 'info.json' | 'fields.json' | 'json'): string {
  let name = 'page'
  try {
    const url = new URL(result.finalUrl ?? result.requestedUrl)
    const lastSegment = url.pathname.split('/').filter(Boolean).at(-1) ?? 'page'
    name = `${url.hostname.replace(/^www\./, '')}-${lastSegment}`
  } catch { /* An unsuccessful request may not have a parseable URL. */ }
  const safe = name.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'page'
  return `w2l-${safe}.${extension}`
}

document.querySelector<HTMLButtonElement>('#example-button')!.addEventListener('click', () => {
  input.value = 'https://docs.firecrawl.dev/introduction'
  input.focus()
  message.textContent = 'Example URL added. Select “Extract page” to begin.'
  message.className = 'form-message'
  scheduleCapability()
})

function normalizeUrl(value: string): string {
  const raw = value.trim()
  if (!raw) throw new Error('Enter a web page URL to begin.')
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try { url = new URL(withProtocol) } catch { throw new Error('Enter a valid web page URL.') }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.port) {
    throw new Error('Use a public HTTP or HTTPS URL without credentials or a custom port.')
  }
  url.hash = ''
  if (url.toString().length > 2048) throw new Error('The URL is too long. Keep it under 2,048 characters.')
  return url.toString()
}

/** Plain-language note for special addresses; ordinary public pages need none.
 * The route and technical limitation stay in the /api/capability response. */
function capabilityHint(capability: CapabilityResponse['capability']): string {
  if (capability.support === 'unsupported') return 'Can’t preview this address. Use a public page that anyone can open.'
  if (capability.task === 'amazon_sg_product') return 'Amazon.sg product (beta) · We’ll also check the product, delivery region and price, and mark anything we can’t verify.'
  if (capability.task === 'x_public_post' || capability.task === 'reddit_public_post') {
    const site = capability.task === 'x_public_post' ? 'X post' : 'Reddit post'
    return `${site} · This site often requires sign-in or blocks automated access, so the post may not come through.`
  }
  return ''
}

function setInvalid(invalid: boolean): void {
  urlCard.classList.toggle('is-invalid', invalid)
  if (invalid) input.setAttribute('aria-invalid', 'true')
  else input.removeAttribute('aria-invalid')
}

function scheduleCapability(): void {
  window.clearTimeout(capabilityTimer)
  capabilityRequest?.abort()
  const entered = input.value.trim()
  capabilityMessage.textContent = ''
  urlHelp.hidden = false
  if (!entered) return
  let url: string
  try { url = normalizeUrl(entered) }
  catch { return }
  capabilityTimer = window.setTimeout(async () => {
    const request = new AbortController()
    capabilityRequest = request
    try {
      const response = await fetch(`/api/capability?url=${encodeURIComponent(url)}`, { signal: request.signal, credentials: 'same-origin' })
      if (!response.ok) return
      const result = await response.json() as CapabilityResponse
      if (request.signal.aborted || normalizeUrl(input.value) !== url) return
      capabilityMessage.textContent = capabilityHint(result.capability)
      // The hint takes the line the quota note sits on, so the hero keeps its height.
      urlHelp.hidden = Boolean(capabilityMessage.textContent)
    } catch { /* A hint failure must not prevent extraction. */ }
  }, 300)
}

input.addEventListener('input', () => {
  // Editing the address resolves a validation error; don't leave it on screen.
  if (input.hasAttribute('aria-invalid')) {
    setInvalid(false)
    message.textContent = ''
    message.className = 'form-message'
  }
  scheduleCapability()
})

function setBusy(busy: boolean): void {
  submit.disabled = busy
  input.disabled = busy
  // The options of a run in flight are already sent.
  optionsButton.disabled = busy
  if (busy && optionsPanel.matches(':popover-open')) optionsPanel.hidePopover()
  submitLabel.textContent = busy ? 'Extracting' : 'Extract page'
  submit.classList.toggle('is-busy', busy)
  form.setAttribute('aria-busy', String(busy))
}

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.textContent = text
  if (className) element.className = className
  return element
}

function safeWebUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch { return null }
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}

function statusText(status: PreviewStatus, product?: ProductPreview, diagnostic?: PreviewResponse['diagnostic']): string {
  if (diagnostic?.code === 'subject_mismatch') return 'Different product selected'
  if (diagnostic?.code === 'subject_conflicting') return 'Conflicting product identity'
  if (diagnostic?.code === 'quote_unverified') return 'Quote not verified'
  if (diagnostic?.code === 'quote_absent_observed') return 'Unavailable in this page context'
  if (diagnostic?.code === 'quote_conflicting') return 'Conflicting quote evidence'
  if (diagnostic?.code === 'robots_disallowed') return 'Site policy blocks preview'
  if (diagnostic?.code === 'login_required') return 'Login required'
  if (diagnostic?.code === 'challenge') return 'Verification page'
  if (status === 'success' && product?.status === 'incomplete') return 'Page read · Product fields need review'
  if (status === 'success' && product?.status === 'invalid') return 'Page read · Product fields invalid'
  return ({ success: 'Extraction complete', incomplete: 'Partial result', blocked: 'Blocked by site', failed: 'Extraction failed', timeout: 'Timed out', invalid_url: 'Invalid URL', quota_exceeded: 'Daily limit reached' })[status]
}

function statusDetail(status: PreviewStatus, reason: string | null): string {
  if (reason) return reason
  return ({ success: 'The page content is ready.', incomplete: 'We read the page, but could not verify every field.', blocked: 'The site blocked this request.', failed: 'We could not read this page. Please try again later.', timeout: 'The page took too long to respond.', invalid_url: 'Check the URL and try again.', quota_exceeded: 'The daily preview limit has been reached.' })[status]
}

function isPageRead(result: PreviewResponse): boolean {
  return result.status === 'success' || result.status === 'incomplete'
}

/** A short heading for results without a page title, e.g. "reddit.com/r/test". */
function urlLabel(value: string): string {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
  } catch { return value }
}

function setHeading(text: string, isUrl: boolean): void {
  resultHeading.textContent = text
  resultHeading.classList.toggle('is-url', isUrl)
  resultHeading.removeAttribute('title')
  // Long titles are clamped to three lines; keep the full text available on hover.
  requestAnimationFrame(() => {
    if (resultHeading.textContent === text && resultHeading.scrollHeight > resultHeading.clientHeight + 1) resultHeading.title = text
  })
}

/** Next steps only; the server reason above already says what happened. */
function failureAdvice(result: PreviewResponse): string[] {
  const retry = 'Check that the page opens in your browser, then try again in a few minutes.'
  const code = result.diagnostic?.code
  if (code === 'robots_disallowed') return ['Try a page from a different site.']
  if (code === 'login_required') return ['Try a page that anyone can open without signing in. W2L does not bypass login walls.']
  if (code === 'challenge') return ['Try a different public page. W2L does not solve verification challenges.']
  if (code === 'policy_denied') return ['Use a public http:// or https:// address that anyone can open.']
  // A service-side failure carries no capture diagnostic; its reason already says to retry later.
  if (result.status === 'failed' && code !== 'capture_failed') return []
  return ({
    success: [],
    incomplete: [],
    blocked: ['Try a different public page. W2L respects site policy and does not bypass blocks.'],
    failed: [retry],
    timeout: [retry],
    invalid_url: ['Use a public http:// or https:// address that anyone can open.'],
    quota_exceeded: ['Try again after 00:00 UTC, when the daily allowance resets.', 'For regular use, set up W2L through MCP on your own computer.'],
  })[result.status]
}

/** Failed captures get one explanation and next steps instead of an empty content panel. */
function renderGuidance(result: PreviewResponse): HTMLElement {
  const panel = document.createElement('section')
  panel.className = 'guidance-panel'
  panel.setAttribute('aria-labelledby', 'guidance-title')
  panel.append(textElement('p', 'NO READABLE CONTENT', 'panel-kicker'))
  const h3 = textElement('h3', 'What happened')
  h3.id = 'guidance-title'
  panel.append(h3, textElement('p', statusDetail(result.status, result.reason), 'guidance-reason'))
  const advice = failureAdvice(result)
  if (advice.length) {
    panel.append(textElement('h4', 'What you can try'))
    const list = document.createElement('ul')
    for (const item of advice) list.append(textElement('li', item))
    panel.append(list)
  }
  const actions = document.createElement('div')
  actions.className = 'guidance-actions'
  const json = textElement('button', 'View result JSON', 'copy-button')
  json.type = 'button'
  json.id = 'guidance-json-button'
  json.addEventListener('click', () => {
    setOutputView('json')
    content.querySelector<HTMLSelectElement>('.output-view-select')?.focus()
  })
  const docs = result.status === 'quota_exceeded'
    ? textElement('a', 'Connect MCP ↗', 'guidance-link')
    : textElement('a', 'Limits and result states ↗', 'guidance-link')
  docs.href = result.status === 'quota_exceeded' ? '/docs/connect-mcp/' : '/docs/limits/'
  actions.append(json, docs)
  panel.append(actions)
  return panel
}

function appendInline(target: HTMLElement, source: string): void {
  const tokens = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g
  let cursor = 0
  for (const match of source.matchAll(tokens)) {
    const index = match.index ?? 0
    if (index > cursor) target.append(document.createTextNode(source.slice(cursor, index)))
    if (match[2] && match[3]) {
      const href = safeWebUrl(match[3])
      if (href) {
        const link = textElement('a', match[2])
        link.href = href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        target.append(link)
      } else target.append(document.createTextNode(match[0]))
    } else if (match[4]) target.append(textElement('strong', match[4]))
    else if (match[5]) target.append(textElement('code', match[5]))
    cursor = index + match[0].length
  }
  if (cursor < source.length) target.append(document.createTextNode(source.slice(cursor)))
}

/** Render a small, safe Markdown subset; raw page HTML is never inserted into the DOM. */
function renderMarkdown(markdown: string): HTMLElement {
  const body = document.createElement('div')
  body.className = 'readable-content'
  const lines = markdown.slice(0, 150_000).replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: HTMLUListElement | HTMLOListElement | null = null
  let code: string[] | null = null
  const flushParagraph = () => {
    if (!paragraph.length) return
    const p = document.createElement('p')
    appendInline(p, paragraph.join(' '))
    body.append(p)
    paragraph = []
  }
  const flushList = () => { list = null }
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph(); flushList()
      if (code) {
        const pre = document.createElement('pre')
        pre.append(textElement('code', code.join('\n')))
        body.append(pre)
        code = null
      } else code = []
      continue
    }
    if (code) { code.push(line); continue }
    if (!line.trim()) { flushParagraph(); flushList(); continue }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (heading) {
      flushParagraph(); flushList()
      const level = Math.min(4, heading[1].length + 1) as 2 | 3 | 4
      const node = document.createElement(`h${level}`)
      // Documentation sites often prefix headings with a zero-width anchor.
      // Keep the heading text readable without displaying its Markdown syntax.
      appendInline(node, heading[2].replace(/^\[[\u200b\u200c\u200d\uFEFF]*\]\(#[^)]+\)\s*/, ''))
      body.append(node)
      continue
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      const tag = bullet ? 'ul' : 'ol'
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = document.createElement(tag)
        body.append(list)
      }
      const item = document.createElement('li')
      appendInline(item, (bullet ?? numbered)![1])
      list.append(item)
      continue
    }
    const quote = /^>\s*(.*)$/.exec(line)
    if (quote) {
      flushParagraph(); flushList()
      const blockquote = document.createElement('blockquote')
      appendInline(blockquote, quote[1])
      body.append(blockquote)
      continue
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) { flushParagraph(); flushList(); body.append(document.createElement('hr')); continue }
    flushList()
    paragraph.push(line.trim())
  }
  flushParagraph()
  if (code) { const pre = document.createElement('pre'); pre.append(textElement('code', code.join('\n'))); body.append(pre) }
  if (markdown.length > 150_000) body.append(textElement('p', 'This page is long, so the preview shows the first 150,000 characters. Copy content still copies the full returned text.', 'content-note'))
  return body
}

function productField(label: string, value: unknown, missing = 'Not verified'): HTMLElement {
  const field = document.createElement('div')
  field.className = 'product-field'
  field.append(textElement('dt', label))
  const dd = textElement('dd', value === null || value === undefined || value === '' ? missing : String(value))
  if (value === null || value === undefined || value === '') dd.className = 'value-missing'
  field.append(dd)
  return field
}

function renderProduct(product: ProductPreview): HTMLElement {
  const section = document.createElement('section')
  section.className = 'product-panel'
  section.setAttribute('aria-labelledby', 'product-title')
  const top = document.createElement('div')
  top.className = 'product-top'
  const heading = document.createElement('div')
  heading.append(textElement('p', 'AMAZON.SG / PRODUCT SIGNALS', 'panel-kicker'))
  const h3 = textElement('h3', 'Product fields')
  h3.id = 'product-title'
  heading.append(h3)
  top.append(heading)
  const state = textElement('span', product.status === 'complete' ? 'Product and region verified' : 'Fields need review', 'product-state')
  if (product.status !== 'complete') state.classList.add('is-incomplete')
  top.append(state)
  section.append(top)

  const data = product.data ?? {}
  const grid = document.createElement('dl')
  grid.className = 'product-grid'
  grid.append(productField('Product ASIN', product.asin ?? data.asin, 'Product not verified'))
  grid.append(productField('Title', data.title))
  grid.append(productField('Delivery region', product.region ?? data.deliveryLocation, 'Region not verified'))
  grid.append(productField('Currency', product.currency ?? data.currency, 'Currency not verified'))
  const price = product.status === 'complete' && product.asin && product.region && product.currency ? data.price : null
  grid.append(productField('Price', price, 'Price not verified'))
  grid.append(productField('Seller', data.seller))
  section.append(grid)

  if (product.issues.length) {
    const issues = document.createElement('div')
    issues.className = 'product-issues'
    issues.append(textElement('h4', 'What to check'))
    const list = document.createElement('ul')
    for (const issue of product.issues.slice(0, 8)) list.append(textElement('li', issue.message || issue.code))
    issues.append(list)
    section.append(issues)
  }
  const details = document.createElement('details')
  details.className = 'json-details'
  details.append(textElement('summary', 'View structured JSON'))
  details.append(textElement('pre', JSON.stringify(data, null, 2)))
  section.append(details)
  return section
}

/** The views a result has: Markdown, its links and page info when the page was read, and always the whole result. */
function availableViews(result: PreviewResponse): OutputView[] {
  const views: OutputView[] = []
  if (isPageRead(result)) {
    if (result.markdown?.trim()) views.push('markdown')
    if (result.json !== undefined) views.push('fields')
    if (result.links !== undefined) views.push('links')
    if (result.metadata !== undefined || result.file !== undefined) views.push('info')
  }
  views.push('json')
  return views
}

function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null
  return bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** What the page declares about itself, or what the file was. */
function pageInfo(result: PreviewResponse): Record<string, unknown> {
  return { url: result.finalUrl ?? result.requestedUrl, title: result.title, ...(result.metadata ? { metadata: result.metadata } : {}), ...(result.file ? { file: result.file } : {}) }
}

function renderPageInfo(result: PreviewResponse): HTMLElement {
  const grid = document.createElement('dl')
  grid.className = 'product-grid info-grid'
  const file = result.file
  if (file) {
    grid.append(productField('File type', file.kind.toUpperCase()))
    grid.append(productField('Content type', file.contentType, 'Not declared'))
    grid.append(productField('Size', formatBytes(file.bytes), 'Not read'))
    if (file.pdf) grid.append(productField('Pages read', file.pdf.pageCount === null ? String(file.pdf.pagesRead) : `${file.pdf.pagesRead} of ${file.pdf.pageCount}`))
    grid.append(productField('Text', file.markdownFrom === 'pdf_text' ? 'PDF text layer' : file.markdownFrom === 'text' ? 'Text as received' : null, 'No text'))
    for (const warning of file.warnings) grid.append(productField('Warning', warning.message || warning.code))
    return grid
  }
  const metadata = result.metadata
  grid.append(productField('Page title', metadata?.title, 'Not declared'))
  grid.append(productField('Content title', result.title, 'Not found'))
  grid.append(productField('Description', metadata?.description, 'Not declared'))
  grid.append(productField('Language', metadata?.language, 'Not declared'))
  grid.append(productField('Canonical URL', metadata?.canonicalUrl, 'Not declared'))
  grid.append(productField('Robots', metadata?.robots, 'Not declared'))
  grid.append(productField('Keywords', metadata?.keywords, 'Not declared'))
  grid.append(productField('Icon', metadata?.favicon, 'Not declared'))
  grid.append(productField('Final URL', result.finalUrl, 'Not available'))
  return grid
}

const LEDGER_MARKS = { found: '✓', missing: '·', ambiguous: ':' } as const
const FIELD_SOURCES: Record<string, string> = {
  jsonld: 'JSON-LD', microdata: 'Microdata', meta: 'Meta tag', dom: 'Page', text: 'Page text', hydration: 'Page data',
  pdf: 'PDF text', fetch: 'The fetch itself', inferred: 'Inferred from the page', model: 'Model',
}

/** Why a field is empty, in plain words where the reason is a common one. */
function missingReason(issue: PreviewFields['issues'][number] | undefined): string {
  if (!issue || issue.code === 'field_unavailable' || issue.code === 'missing_required') return 'not stated on the page'
  if (issue.code === 'field_ambiguous') return 'the page states more than one value, so none was chosen'
  return issue.message || issue.code
}

/** Each field asked for, in the order asked, as a line of the evidence ledger: its mark (✓ read, · not stated,
 * : more than one value), its name, its value or why there is none, and where on the page the value was read. The
 * marks above the ledger count them, one per field. */
function renderFields(result: PreviewResponse): HTMLElement {
  const box = document.createElement('div')
  box.className = 'fields-view'
  const json = result.json
  if (!json) return box
  const data = json.data !== null && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data as Record<string, unknown> : {}
  const names = Object.keys(data)
  const lines = names.map((name) => {
    const value = data[name]
    const issue = json.issues.find((item) => item.path === `/${name}`)
    const state: keyof typeof LEDGER_MARKS = value !== null && value !== undefined ? 'found' : issue?.code === 'field_ambiguous' ? 'ambiguous' : 'missing'
    return { name, value, issue, state, evidence: json.evidence.find((item) => item.path === `/${name}`) }
  })
  const found = lines.filter((line) => line.state === 'found').length
  const meter = document.createElement('p')
  meter.className = 'ledger-meter'
  if (lines.length) {
    const cells = document.createElement('span')
    cells.className = 'meter-cells'
    cells.setAttribute('aria-hidden', 'true')
    for (const line of lines) cells.append(textElement('span', LEDGER_MARKS[line.state], `is-${line.state}`))
    meter.append(cells)
  }
  meter.append(textElement('span', lines.length ? `${found} of ${lines.length} stated on the page · read without AI` : 'No fields were read from this page.', 'meter-text'))
  box.append(meter)
  if (lines.length) {
    const ledger = document.createElement('dl')
    ledger.className = 'ledger'
    for (const line of lines) {
      const row = document.createElement('div')
      row.className = `ledger-row is-${line.state}`
      const term = document.createElement('dt')
      term.append(textElement('span', LEDGER_MARKS[line.state], 'ledger-mark'), textElement('span', line.name, 'ledger-name'))
      term.firstElementChild!.setAttribute('aria-hidden', 'true')
      row.append(term)
      if (line.state === 'found') {
        const value = line.value
        const code = typeof value === 'number' || typeof value === 'boolean'
        const text = Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ') : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
        row.append(textElement('dd', text, code ? 'ledger-value is-code' : 'ledger-value'))
        const evidence = line.evidence
        if (evidence) row.append(textElement('dd', `↳ ${[FIELD_SOURCES[evidence.source] ?? evidence.source, evidence.evidencePath, evidence.text ? `read from “${evidence.text}”` : ''].filter(Boolean).join(' · ')}`, 'ledger-cite'))
      } else row.append(textElement('dd', missingReason(line.issue), 'ledger-value is-empty'))
      ledger.append(row)
    }
    box.append(ledger)
  }
  const general = json.issues.filter((item) => !item.path || !names.includes(item.path.slice(1)))
  if (general.length) {
    const list = document.createElement('ul')
    list.className = 'ledger-notes'
    for (const item of general.slice(0, 8)) list.append(textElement('li', item.message || item.code))
    box.append(list)
  }
  return box
}

function renderLinks(result: PreviewResponse): HTMLElement {
  const box = document.createElement('div')
  const links = result.links ?? []
  const total = result.linksTotal ?? links.length
  if (!links.length) {
    box.append(textElement('p', 'No links were found on this page.', 'empty-content'))
    return box
  }
  box.append(textElement('p', total > links.length ? `The first ${links.length.toLocaleString()} of ${total.toLocaleString()} links on the page.` : `${total.toLocaleString()} ${total === 1 ? 'link' : 'links'} on the page.`, 'output-explanation'))
  const list = document.createElement('ol')
  list.className = 'links-list'
  for (const link of links) {
    const href = safeWebUrl(link)
    const item = document.createElement('li')
    if (href) {
      const anchor = textElement('a', link)
      anchor.href = href
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      item.append(anchor)
    } else item.append(document.createTextNode(link))
    list.append(item)
  }
  box.append(list)
  return box
}

type ViewText = { kicker: string; title: string; copy: string; download: string; extension: 'md' | 'links.txt' | 'info.json' | 'fields.json' | 'json'; type: string }
const VIEW_TEXT: Record<OutputView, ViewText> = {
  fields: { kicker: 'EXTRACTED CONTENT / FIELDS', title: 'Fields', copy: 'Copy fields', download: '↓ Download fields', extension: 'fields.json', type: 'application/json;charset=utf-8' },
  markdown: { kicker: 'EXTRACTED CONTENT / MARKDOWN', title: 'Readable content', copy: 'Copy content', download: '↓ Download Markdown', extension: 'md', type: 'text/markdown;charset=utf-8' },
  links: { kicker: 'EXTRACTED CONTENT / LINKS', title: 'Links', copy: 'Copy links', download: '↓ Download links', extension: 'links.txt', type: 'text/plain;charset=utf-8' },
  info: { kicker: 'EXTRACTED CONTENT / PAGE INFO', title: 'Page info', copy: 'Copy info', download: '↓ Download info', extension: 'info.json', type: 'application/json;charset=utf-8' },
  json: { kicker: 'EXTRACTED RESULT / JSON', title: 'Result JSON', copy: 'Copy JSON', download: '↓ Download JSON', extension: 'json', type: 'application/json;charset=utf-8' },
}

function viewPayload(result: PreviewResponse, view: OutputView): string {
  if (view === 'links') return result.links?.length ? `${result.links.join('\n')}\n` : ''
  if (view === 'info') return `${JSON.stringify(pageInfo(result), null, 2)}\n`
  if (view === 'fields') return result.json ? `${JSON.stringify(result.json, null, 2)}\n` : ''
  if (view === 'json') return `${JSON.stringify(result, null, 2)}\n`
  return result.markdown ?? ''
}

function renderOutputPanel(result: PreviewResponse): void {
  content.querySelector('.output-panel')?.remove()
  // A failed capture has no content to show; its guidance panel offers the JSON view.
  if (outputView !== 'json' && !isPageRead(result)) return
  const views = availableViews(result)
  // A view this result does not have (links of a file, say) falls back to the first it has; the choice stays.
  const view = views.includes(outputView) ? outputView : views[0]!
  const text = VIEW_TEXT[view]
  const output = document.createElement('section')
  output.className = 'output-panel'
  output.setAttribute('aria-labelledby', 'content-title')
  const header = document.createElement('div')
  header.className = 'output-head'
  const title = document.createElement('div')
  title.append(textElement('p', text.kicker, 'panel-kicker'))
  const h3 = textElement('h3', text.title)
  h3.id = 'content-title'
  title.append(h3)
  header.append(title)

  const actions = document.createElement('div')
  actions.className = 'output-actions'
  const viewLabel = textElement('label', 'View', 'output-view-label')
  const viewSelect = document.createElement('select')
  viewSelect.className = 'output-view-select'
  viewSelect.setAttribute('aria-label', 'View output format')
  for (const option of views) viewSelect.append(new Option(VIEW_NAMES[option], option))
  viewSelect.value = view
  viewSelect.addEventListener('change', () => {
    setOutputView(viewSelect.value as OutputView)
    const nextFocus = content.querySelector<HTMLElement>('.output-view-select') ?? content.querySelector<HTMLElement>('#guidance-json-button')
    nextFocus?.focus()
  })
  viewLabel.append(viewSelect)
  actions.append(viewLabel)
  const payload = viewPayload(result, view)
  const copy = textElement('button', text.copy, 'copy-button')
  copy.type = 'button'
  copy.disabled = !payload
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(payload)
      copy.textContent = 'Copied ✓'
      window.setTimeout(() => { copy.textContent = text.copy }, 2200)
    } catch { copy.textContent = 'Copy failed. Select the text manually.' }
  })
  actions.append(copy)
  const download = textElement('button', text.download, 'download-button')
  download.type = 'button'
  download.disabled = !payload
  download.addEventListener('click', () => downloadFile(payload, resultFilename(result, text.extension), text.type))
  actions.append(download)
  header.append(actions)
  output.append(header)
  if (view === 'json') {
    output.append(textElement('p', 'This is the sanitized server response. Its totalMs measures server processing; the page total above includes browser network time. Verified Amazon.sg product fields appear under “product” when available.', 'output-explanation'))
    output.append(textElement('pre', payload, 'json-output'))
  } else if (view === 'fields') output.append(renderFields(result))
  else if (view === 'links') output.append(renderLinks(result))
  else if (view === 'info') output.append(renderPageInfo(result))
  else {
    if (result.markdownTruncated) output.append(textElement('p', 'This page is very long: the preview returned its first 1,000,000 characters.', 'content-note'))
    if (payload.trim()) output.append(renderMarkdown(payload))
    else output.append(textElement('p', 'No readable Markdown was returned. Switch to Result JSON to inspect the status and reason.', 'empty-content'))
  }
  content.append(output)
}

/** Choose what the result panel shows (the Format button and the panel's own View select stay in step), and show
 * it for the selected run: every view comes from the same extraction. */
function setOutputView(view: OutputView): void {
  outputView = view
  formatLabel.textContent = VIEW_NAMES[view]
  const radio = formatPanel.querySelector<HTMLInputElement>(`input[value="${view}"]`)
  if (radio) radio.checked = true
  const run = runs.find((candidate) => candidate.id === selectedRunId)
  if (run?.result) renderOutputPanel(run.result)
}

/** One extraction in this visit. Runs live only in memory and are never sent anywhere. */
type Run = { id: number; url: string; startedAt: Date; clientMs: number; result: PreviewResponse | null }
const MAX_RUNS = 6
let runs: Run[] = []
let selectedRunId = 0
let nextRunId = 1

/** Display label only; the server decides the actual capture route. */
function runType(run: Run): string {
  if (run.result?.product) return 'Amazon.sg product'
  try {
    const url = new URL(run.result?.finalUrl ?? run.url)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'amazon.sg' && /\/dp\/[a-z0-9]{10}/i.test(url.pathname)) return 'Amazon.sg product'
    if ((host === 'x.com' || host === 'twitter.com') && /\/status\/\d+/.test(url.pathname)) return 'X post'
    if ((host === 'reddit.com' || host === 'old.reddit.com') && /\/comments\//.test(url.pathname)) return 'Reddit post'
  } catch { /* Fall through to the generic label. */ }
  return 'Web page'
}

function runStatus(run: Run): { text: string; tone: 'loading' | 'success' | 'partial' | 'error' } {
  const result = run.result
  if (!result) return { text: 'Extracting…', tone: 'loading' }
  const tone = !isPageRead(result) ? 'error' : result.status === 'incomplete' || result.product && result.product.status !== 'complete' ? 'partial' : 'success'
  return { text: statusText(result.status, result.product, result.diagnostic), tone }
}

const VIEW_SHORT: Record<OutputView, string> = { markdown: 'Markdown', links: 'Links', info: 'Info', fields: 'Fields', json: 'JSON' }
function outputLabel(run: Run): string {
  if (!run.result) return '—'
  return availableViews(run.result).map((view) => VIEW_SHORT[view]).join(' · ')
}

function renderRuns(): void {
  const focusedId = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('.run-card')?.dataset.run : undefined
  runsGrid.replaceChildren(...runs.map((run) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'run-card'
    card.dataset.run = String(run.id)
    card.setAttribute('aria-pressed', String(run.id === selectedRunId))
    const label = urlLabel(run.result?.finalUrl ?? run.url)
    const head = textElement('span', '', 'run-card-head')
    const glyph = textElement('span', label.charAt(0).toUpperCase(), 'run-glyph')
    glyph.setAttribute('aria-hidden', 'true')
    head.append(glyph, textElement('span', label, 'run-url'))
    card.append(head)
    const status = runStatus(run)
    const rows: Array<[string, string, string?]> = [
      ['Type', runType(run)],
      ['Status', status.text, `run-status tone-${status.tone}`],
      ['Total time', run.result ? formatDuration(run.clientMs) : '—', 'run-time'],
      ['Started', run.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
      ['Output', outputLabel(run)],
    ]
    for (const [key, value, extra] of rows) {
      const row = textElement('span', '', 'run-row')
      row.append(textElement('span', key, 'run-key'), textElement('span', value, extra ? `run-val ${extra}` : 'run-val'))
      card.append(row)
    }
    card.addEventListener('click', () => selectRun(run.id))
    return card
  }))
  if (focusedId) runsGrid.querySelector<HTMLElement>(`[data-run="${focusedId}"]`)?.focus()
}

function selectRun(id: number): void {
  const run = runs.find((candidate) => candidate.id === id)
  if (!run) return
  selectedRunId = id
  renderRuns()
  renderDetail(run)
  resultHeading.focus({ preventScroll: true })
  runDetail.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

function renderDetailUrl(result: PreviewResponse | null): void {
  detailUrl.replaceChildren(textElement('span', 'Final URL'))
  const href = safeWebUrl(result?.finalUrl ?? null)
  if (href) {
    const link = textElement('a', href)
    link.href = href
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    detailUrl.append(link)
  } else detailUrl.append(textElement('strong', result ? 'Not available' : 'Waiting for the page…'))
}

/** Status and time live on the run card; the detail explains and shows the content. */
function renderDetail(run: Run): void {
  content.replaceChildren()
  const result = run.result
  renderDetailUrl(result)
  if (!result) {
    setHeading(urlLabel(run.url), true)
    const box = document.createElement('div')
    box.className = 'loading-panel'
    box.setAttribute('role', 'status')
    box.append(textElement('span', '', 'loading-spinner'))
    box.append(textElement('p', 'Reading the page and preparing its content. This usually takes a few seconds.'))
    content.append(box)
    return
  }
  const title = result.title?.trim()
  setHeading(title || urlLabel(result.finalUrl ?? result.requestedUrl), !title)
  if (!isPageRead(result)) content.append(renderGuidance(result))
  else if (result.reason || result.status === 'incomplete' && !result.product) {
    content.append(textElement('p', statusDetail(result.status, result.reason), 'result-note'))
  }
  if (result.product) content.append(renderProduct(result.product))
  renderOutputPanel(result)
}

/** Point to the result below; its guidance panel carries the reason. */
function setResultMessage(result: PreviewResponse): void {
  const read = isPageRead(result)
  message.textContent = read ? 'Your result is below.' : 'No readable content was returned. See why below.'
  message.className = `form-message${read ? '' : ' is-error'}`
}

function finishRun(run: Run, result: PreviewResponse, started: number): void {
  run.result = result
  run.clientMs = performance.now() - started
  renderRuns()
  if (run.id !== selectedRunId) return
  renderDetail(run)
  // The browser measurement includes network and synchronous result rendering.
  requestAnimationFrame(() => {
    run.clientMs = Math.max(run.clientMs, performance.now() - started)
    const time = runsGrid.querySelector<HTMLElement>(`[data-run="${run.id}"] .run-time`)
    if (time) time.textContent = formatDuration(run.clientMs)
  })
  section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

/** A panel opens under its button on wide screens (a sheet at the foot of a phone's screen, in the styles), or
 * above it when there is more room there. Above, it is held by its foot, so a panel that grows (a field added)
 * grows away from the button; either way it scrolls inside once it reaches the edge of the screen. */
function placePanel(panel: HTMLElement, button: HTMLElement): void {
  for (const name of ['--panel-left', '--panel-top', '--panel-bottom', '--panel-max']) panel.style.removeProperty(name)
  if (window.matchMedia('(max-width: 600px)').matches) return
  const box = button.getBoundingClientRect()
  const left = Math.max(12, Math.min(box.left, window.innerWidth - panel.offsetWidth - 12))
  const roomBelow = window.innerHeight - box.bottom - 20
  const roomAbove = box.top - 20
  panel.style.setProperty('--panel-left', `${Math.round(left)}px`)
  if (panel.scrollHeight <= roomBelow || roomBelow >= roomAbove) {
    panel.style.setProperty('--panel-top', `${Math.round(box.bottom + 8)}px`)
    panel.style.setProperty('--panel-max', `${Math.round(Math.max(160, roomBelow))}px`)
  } else {
    panel.style.setProperty('--panel-bottom', `${Math.round(window.innerHeight - box.top + 8)}px`)
    panel.style.setProperty('--panel-max', `${Math.round(roomAbove)}px`)
  }
}
const panels: Array<[HTMLElement, HTMLElement]> = [[formatPanel, formatButton], [optionsPanel, optionsButton]]
for (const [panel, button] of panels) {
  panel.addEventListener('toggle', (event) => {
    const open = (event as Event & { newState?: string }).newState === 'open'
    button.classList.toggle('is-open', open)
    // Options closed with no field named: nothing for the Fields view to show.
    if (!open && panel === optionsPanel && outputView === 'fields' && !readFields().fields.length) setOutputView('markdown')
    if (!open) return
    placePanel(panel, button)
    // The toggle event comes after the panel opened: focus already placed inside it (a new field) stays there.
    if (panel.contains(document.activeElement)) return
    ;(panel.querySelector<HTMLElement>('input:checked') ?? panel.querySelector<HTMLElement>('input, button:not(.sheet-close)'))?.focus()
  })
}
for (const type of ['resize', 'scroll'] as const) {
  window.addEventListener(type, () => { for (const [panel, button] of panels) if (panel.matches(':popover-open')) placePanel(panel, button) }, { passive: true })
}
// A format chosen with the pointer closes the panel; arrow keys only move the choice, and Enter closes it (and never
// submits the form around it).
let pointerChoice = false
formatPanel.addEventListener('pointerdown', (event) => { pointerChoice = Boolean((event.target as HTMLElement).closest('.format-row')) })
formatPanel.addEventListener('change', (event) => {
  const choice = event.target as HTMLInputElement
  if (choice.name !== 'output-view') return
  setOutputView(choice.value as OutputView)
  const closing = pointerChoice
  pointerChoice = false
  // Fields need naming first: open Options at the line that adds one.
  if (choice.value === 'fields' && !readFields().fields.length && !optionsButton.disabled) {
    formatPanel.hidePopover()
    optionsPanel.showPopover()
    fieldNew.focus()
    return
  }
  if (closing && formatPanel.matches(':popover-open')) formatPanel.hidePopover()
})
formatPanel.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  event.preventDefault()
  if (formatPanel.matches(':popover-open')) formatPanel.hidePopover()
})

// Options: at most MAX_FIELDS fields, each named as the server accepts, once.
const MAX_FIELDS = 20
const FIELDS_CHECK = 'Check the fields in Options:'
const FIELD_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,63}$/u
const FIELD_TYPES: Array<[FieldType, string]> = [['string', 'text'], ['number', 'number'], ['boolean', 'yes / no'], ['string[]', 'list of text']]
const NEW_FIELD_HINT = 'add a field: type a name, then Enter'
const PRODUCT_FIELDS: FieldRequest[] = [
  { name: 'name', type: 'string' }, { name: 'brand', type: 'string' }, { name: 'price', type: 'number' }, { name: 'currency', type: 'string' },
  { name: 'availability', type: 'string' }, { name: 'sku', type: 'string' }, { name: 'rating', type: 'number' }, { name: 'reviewCount', type: 'number' },
]

/** One field: its number, its name on a dotted rule, its type (the row's data-type draws the type's mark), and ×. */
function fieldRow(field: FieldRequest): HTMLElement {
  const row = document.createElement('div')
  row.className = 'field-row'
  row.setAttribute('role', 'listitem')
  row.dataset.type = field.type
  const index = textElement('span', '', 'field-index')
  index.setAttribute('aria-hidden', 'true')
  const name = document.createElement('input')
  name.className = 'field-name'
  name.maxLength = 64
  name.placeholder = 'field name'
  name.value = field.name
  name.autocomplete = 'off'
  name.spellcheck = false
  const typeBox = document.createElement('span')
  typeBox.className = 'field-type-box'
  const type = document.createElement('select')
  type.className = 'field-type'
  for (const [value, label] of FIELD_TYPES) type.append(new Option(label, value))
  type.value = field.type
  typeBox.append(type)
  const remove = textElement('button', '×', 'field-remove')
  remove.type = 'button'
  row.append(index, name, typeBox, remove)
  return row
}

/** The rows' labels follow their order, so a screen reader hears which field each control belongs to. */
function relabelFields(): void {
  const rows = [...fieldsList.querySelectorAll<HTMLElement>('.field-row')]
  rows.forEach((row, index) => {
    const name = row.querySelector<HTMLInputElement>('.field-name')!
    row.querySelector('.field-index')!.textContent = String(index + 1).padStart(2, '0')
    name.setAttribute('aria-label', `Field ${index + 1} name`)
    row.querySelector('.field-type')!.setAttribute('aria-label', `Field ${index + 1} type`)
    row.querySelector('.field-remove')!.setAttribute('aria-label', `Remove field ${index + 1}${name.value.trim() ? ` (${name.value.trim()})` : ''}`)
  })
  const full = rows.length >= MAX_FIELDS
  fieldAdd.disabled = full
  fieldNew.disabled = full
  fieldNew.placeholder = full ? `${MAX_FIELDS} of ${MAX_FIELDS}: remove one to add another` : NEW_FIELD_HINT
}

/** The fields as set, or why they cannot be sent. Rows without a name do not count. */
function readFields(): { fields: FieldRequest[]; error: string | null } {
  const fields: FieldRequest[] = []
  const seen = new Set<string>()
  let error: string | null = null
  for (const row of fieldsList.querySelectorAll<HTMLElement>('.field-row')) {
    const input = row.querySelector<HTMLInputElement>('.field-name')!
    const name = input.value.trim()
    let invalid = false
    if (name) {
      if (!FIELD_NAME.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)) { invalid = true; error ??= `“${name}” can use letters, digits, spaces, dots, dashes and underscores, starting with a letter or digit.` }
      else if (seen.has(name)) { invalid = true; error ??= `“${name}” is listed twice.` }
      else {
        seen.add(name)
        fields.push({ name, type: row.querySelector<HTMLSelectElement>('.field-type')!.value as FieldType })
      }
    }
    if (invalid) input.setAttribute('aria-invalid', 'true')
    else input.removeAttribute('aria-invalid')
  }
  return { fields, error }
}

/** The Options button says when anything differs from the defaults: how many fields, or a dot for the whole page. */
function syncOptions(): void {
  const { fields, error } = readFields()
  if (!fields.length && !error && outputView === 'fields' && !fieldsList.querySelector('.field-row')) setOutputView('markdown')
  // The fields are fixed: the note that stopped the run goes too.
  if (!error && message.textContent?.startsWith(FIELDS_CHECK)) { message.textContent = ''; message.className = 'form-message' }
  fieldsError.textContent = error ?? ''
  fieldsCount.textContent = `${String(fields.length).padStart(2, '0')}/${MAX_FIELDS}`
  fieldsCountText.textContent = `${fields.length} of ${MAX_FIELDS} fields`
  contentNote.textContent = mainContent.checked ? 'Headers, menus and footers are left out.' : 'The whole page, headers and menus included; a page with no clear main content returns everything.'
  const changed = fields.length > 0 || !mainContent.checked
  optionsBadge.hidden = !changed
  optionsBadge.textContent = fields.length ? String(fields.length) : ''
  optionsButton.title = changed ? [fields.length ? `${fields.length} ${fields.length === 1 ? 'field' : 'fields'}` : '', mainContent.checked ? '' : 'whole page'].filter(Boolean).join(', ') : ''
}

/** After any change to the fields: numbers, labels, the count and the Options button follow, and the first field
 * named shows the Fields view next. */
function fieldsChanged(): void {
  const had = Boolean(optionsBadge.textContent)
  relabelFields()
  syncOptions()
  if (!had && readFields().fields.length && outputView === 'markdown') setOutputView('fields')
}

function addField(field: FieldRequest): void {
  if (fieldsList.querySelectorAll('.field-row').length >= MAX_FIELDS) return
  fieldsList.append(fieldRow(field))
}

/** The add line: a typed name becomes a field of text, and the line clears for the next one. */
function addNewField(): void {
  const name = fieldNew.value.trim()
  if (!name) { fieldNew.focus(); return }
  addField({ name, type: 'string' })
  fieldNew.value = ''
  fieldsChanged()
  fieldNew.focus()
}

fieldAdd.addEventListener('click', addNewField)
document.querySelector<HTMLButtonElement>('#fields-preset')!.addEventListener('click', () => {
  fieldsList.replaceChildren()
  for (const field of PRODUCT_FIELDS) addField(field)
  fieldsChanged()
  fieldNew.focus()
})
fieldsList.addEventListener('click', (event) => {
  const remove = (event.target as HTMLElement).closest('.field-remove')
  if (!remove) return
  const row = remove.closest('.field-row')!
  const next = row.nextElementSibling?.querySelector<HTMLElement>('.field-name') ?? row.previousElementSibling?.querySelector<HTMLElement>('.field-name') ?? fieldNew
  row.remove()
  fieldsChanged()
  next.focus()
})
fieldsList.addEventListener('input', fieldsChanged)
fieldsList.addEventListener('change', (event) => {
  const type = event.target as HTMLElement
  if (type.classList.contains('field-type')) type.closest<HTMLElement>('.field-row')!.dataset.type = (type as HTMLSelectElement).value
  syncOptions()
})
// A single radio unchecked by its neighbour fires no change of its own: listen on the group.
contentScope.addEventListener('change', syncOptions)
// Enter never submits the form around the panel: on the add line it adds the field, in a field's name it moves to
// the add line.
optionsPanel.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement
  if (event.key !== 'Enter' || target.tagName === 'BUTTON') return
  event.preventDefault()
  if (target === fieldNew) addNewField()
  else if (target.classList.contains('field-name') && !fieldNew.disabled) fieldNew.focus()
})
relabelFields()
syncOptions()

/** What a run asks for: the URL, and for an ordinary page the options (Amazon.sg product pages take none). */
function previewBody(url: string): Record<string, unknown> {
  const body: Record<string, unknown> = { url }
  if (isAmazonProduct(url)) return body
  if (!mainContent.checked) body.onlyMainContent = false
  const schema = fieldsSchema(readFields().fields)
  if (schema) body.formats = ['markdown', 'links', { type: 'json', schema }]
  return body
}

/** The same extraction on your own computer: the URL entered (or the example), the chosen view and options. */
codeButton.addEventListener('click', () => {
  let url = 'https://docs.firecrawl.dev/introduction'
  try { url = normalizeUrl(input.value) } catch { /* The example, until a valid URL is entered. */ }
  const request = { url, view: outputView, onlyMainContent: mainContent.checked, fields: readFields().fields }
  codeDialog.querySelector('#code-rest')!.textContent = restSnippet(request)
  codeDialog.querySelector('#code-prompt')!.textContent = mcpPrompt(request)
  codeDialog.querySelector('#code-mcp')!.textContent = mcpSnippet(request)
  codeDialog.querySelector('#code-status')!.textContent = ''
  codeDialog.showModal()
})
codeDialog.querySelector('#code-close')!.addEventListener('click', () => codeDialog.close())
// A click on the backdrop closes it too.
codeDialog.addEventListener('click', (event) => { if (event.target === codeDialog) codeDialog.close() })
codeDialog.addEventListener('close', () => codeButton.focus())
for (const button of codeDialog.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  const label = button.textContent ?? 'Copy'
  button.addEventListener('click', async () => {
    const source = codeDialog.querySelector(`#${button.dataset.copy}`)?.textContent ?? ''
    const status = codeDialog.querySelector('#code-status')!
    try {
      await navigator.clipboard.writeText(source)
      button.textContent = 'Copied ✓'
      status.textContent = 'Copied to the clipboard.'
      window.setTimeout(() => { button.textContent = label }, 2200)
    } catch { status.textContent = 'Copy failed. Select the text manually.' }
  })
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (submit.disabled) return
  let url: string
  try { url = normalizeUrl(input.value) }
  catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Enter a valid URL.'
    message.className = 'form-message is-error'
    setInvalid(true)
    input.focus()
    return
  }
  const fieldsCheck = readFields()
  if (fieldsCheck.error && !isAmazonProduct(url)) {
    message.textContent = `${FIELDS_CHECK} ${fieldsCheck.error}`
    message.className = 'form-message is-error'
    optionsButton.focus()
    return
  }
  input.value = url
  setInvalid(false)
  message.textContent = 'Extracting. This temporary result will not be saved.'
  message.className = 'form-message'
  setBusy(true)
  const run: Run = { id: nextRunId++, url, startedAt: new Date(), clientMs: 0, result: null }
  runs = [run, ...runs].slice(0, MAX_RUNS)
  selectedRunId = run.id
  section.hidden = false
  // The cue names what sits directly below the hero.
  heroScroll.setAttribute('href', '#result-section')
  heroScrollLabel.textContent = 'Recent runs'
  renderRuns()
  renderDetail(run)
  const started = performance.now()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 55_000)
  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(previewBody(url)),
      signal: controller.signal,
      credentials: 'same-origin',
    })
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || !('status' in value)) throw new Error('The service returned an unrecognized result.')
    const result = value as PreviewResponse
    if (!result.requestedUrl || !Number.isFinite(result.totalMs)) throw new Error('The service returned an incomplete result.')
    // Message first: an error style can grow the hero, and the smooth scroll must target the final layout.
    setResultMessage(result)
    finishRun(run, result, started)
  } catch (error) {
    const aborted = controller.signal.aborted
    const result: PreviewResponse = {
      status: aborted ? 'timeout' : 'failed',
      requestedUrl: url,
      finalUrl: null,
      title: null,
      markdown: null,
      totalMs: performance.now() - started,
      reason: aborted ? 'The browser timed out. The server may still be processing; try again later.' : 'The service could not return a result. Please try again later.',
    }
    setResultMessage(result)
    finishRun(run, result, started)
  } finally {
    clearTimeout(timeout)
    setBusy(false)
  }
})
