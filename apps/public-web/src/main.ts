import './styles.css'
import { mountHeroAscii } from './ascii'
import { mountHeroClickSpark } from './clickSpark'

type PreviewStatus = 'success' | 'incomplete' | 'blocked' | 'failed' | 'timeout' | 'invalid_url' | 'quota_exceeded'
type ProductPreview = {
  status: 'complete' | 'incomplete' | 'invalid'
  asin: string | null
  region: string | null
  currency: string | null
  data: Record<string, unknown> | null
  issues: Array<{ code: string; message: string }>
}
type PreviewResponse = {
  status: PreviewStatus
  requestedUrl: string
  finalUrl: string | null
  title: string | null
  markdown: string | null
  totalMs: number
  reason: string | null
  diagnostic?: { code: string; stage: string; evidence: 'observed' | 'unobserved' }
  product?: ProductPreview
}
type CapabilityResponse = { requestedUrl: string; capability: { task: string; support: string; captureMode: 'http' | 'browser_local'; limitation: string } }
type OutputFormat = 'markdown' | 'json'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="page-shell">
    <div class="hero" id="top">
      <div class="hero-backdrop" aria-hidden="true"></div>
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
            <div class="hero-cell hero-cell-side" aria-hidden="true"></div>
            <div class="hero-cell hero-copy">
              <h1 id="hero-title">One link.<br /><em>Web data, ready.</em></h1>
              <p class="hero-description">Paste a public URL. Get readable content and verifiable fields where supported.</p>
            </div>
            <div class="hero-cell hero-cell-side hero-octopus-cell" id="hero-ascii" aria-hidden="true"></div>
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
                  <p id="url-help">3 free previews a day · Public pages only</p>
                  <button class="example-button" id="example-button" type="button">Try an example</button>
                  <button class="submit-button" id="submit-button" type="submit"><span id="submit-label">Extract page</span><span class="button-arrow" aria-hidden="true">→</span></button>
                </div>
              </div>
              <p class="form-message" id="form-message" role="status" aria-live="polite"></p>
              <p class="capability-message" id="capability-message" role="status" aria-live="polite"></p>
            </form>
          </div>
        </div>
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
        <div class="frame how-head"><p class="section-kicker"><span class="kicker-square"></span> HOW IT WORKS</p><h2 id="how-title">From web page<br />to usable content.</h2></div>
      </div>
      <div class="band">
        <div class="frame how-steps">
          <div class="how-step"><span class="step-number">01</span><h3>Paste a public URL</h3><p>No install or command line. One web address is enough to try it.</p></div>
          <div class="how-step"><span class="step-number">02</span><h3>Read the result</h3><p>See the content, final URL, status, and total time. Failures come with a reason.</p></div>
          <div class="how-step"><span class="step-number">03</span><h3>Check product fields</h3><p>For supported Amazon.sg pages, we also verify the product, region, and currency.</p></div>
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
mountHeroAscii(document.querySelector<HTMLElement>('#hero-ascii')!, hero)
mountHeroClickSpark(document.querySelector<HTMLElement>('#hero-click-spark')!, hero)

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
// Chosen in the result panel; kept for the next extraction in this visit.
let outputFormat: OutputFormat = 'markdown'
let capabilityTimer: number | undefined
let capabilityRequest: AbortController | undefined

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

function resultFilename(result: PreviewResponse, extension: 'md' | 'json'): string {
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
    outputFormat = 'json'
    renderOutputPanel(result)
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

function renderOutputPanel(result: PreviewResponse): void {
  content.querySelector('.output-panel')?.remove()
  const format = outputFormat
  const isJson = format === 'json'
  // A failed capture has no Markdown to show; its guidance panel offers the JSON view.
  if (!isJson && !isPageRead(result)) return
  const output = document.createElement('section')
  output.className = 'output-panel'
  output.setAttribute('aria-labelledby', 'content-title')
  const header = document.createElement('div')
  header.className = 'output-head'
  const title = document.createElement('div')
  title.append(textElement('p', isJson ? 'EXTRACTED RESULT / JSON' : 'EXTRACTED CONTENT / MARKDOWN', 'panel-kicker'))
  const h3 = textElement('h3', isJson ? 'Result JSON' : 'Readable content')
  h3.id = 'content-title'
  title.append(h3)
  header.append(title)

  const actions = document.createElement('div')
  actions.className = 'output-actions'
  const viewLabel = textElement('label', 'View', 'output-view-label')
  const viewSelect = document.createElement('select')
  viewSelect.className = 'output-view-select'
  viewSelect.setAttribute('aria-label', 'View output format')
  viewSelect.append(new Option('Markdown', 'markdown'), new Option('JSON', 'json'))
  viewSelect.value = format
  viewSelect.addEventListener('change', () => {
    outputFormat = viewSelect.value as OutputFormat
    renderOutputPanel(result)
    const nextFocus = content.querySelector<HTMLElement>('.output-view-select') ?? content.querySelector<HTMLElement>('#guidance-json-button')
    nextFocus?.focus()
  })
  viewLabel.append(viewSelect)
  actions.append(viewLabel)
  const payload = isJson ? `${JSON.stringify(result, null, 2)}\n` : result.markdown ?? ''
  const copy = textElement('button', isJson ? 'Copy JSON' : 'Copy content', 'copy-button')
  copy.type = 'button'
  copy.disabled = !payload
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(payload)
      copy.textContent = 'Copied ✓'
      window.setTimeout(() => { copy.textContent = isJson ? 'Copy JSON' : 'Copy content' }, 2200)
    } catch { copy.textContent = 'Copy failed. Select the text manually.' }
  })
  actions.append(copy)
  const download = textElement('button', isJson ? '↓ Download JSON' : '↓ Download Markdown', 'download-button')
  download.type = 'button'
  download.disabled = !payload
  download.addEventListener('click', () => downloadFile(payload, resultFilename(result, isJson ? 'json' : 'md'), isJson ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'))
  actions.append(download)
  header.append(actions)
  output.append(header)
  if (isJson) {
    output.append(textElement('p', 'This is the sanitized server response. Its totalMs measures server processing; the page total above includes browser network time. Verified Amazon.sg product fields appear under “product” when available.', 'output-explanation'))
    output.append(textElement('pre', payload, 'json-output'))
  } else if (payload.trim()) output.append(renderMarkdown(payload))
  else output.append(textElement('p', 'No readable Markdown was returned. Switch to Result JSON to inspect the status and reason.', 'empty-content'))
  content.append(output)
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

function outputLabel(run: Run): string {
  if (!run.result) return '—'
  return isPageRead(run.result) && run.result.markdown?.trim() ? 'Markdown · JSON' : 'JSON'
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
  input.value = url
  setInvalid(false)
  message.textContent = 'Extracting. This temporary result will not be saved.'
  message.className = 'form-message'
  setBusy(true)
  const run: Run = { id: nextRunId++, url, startedAt: new Date(), clientMs: 0, result: null }
  runs = [run, ...runs].slice(0, MAX_RUNS)
  selectedRunId = run.id
  section.hidden = false
  renderRuns()
  renderDetail(run)
  const started = performance.now()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 55_000)
  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
      credentials: 'same-origin',
    })
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || !('status' in value)) throw new Error('The service returned an unrecognized result.')
    const result = value as PreviewResponse
    if (!result.requestedUrl || !Number.isFinite(result.totalMs)) throw new Error('The service returned an incomplete result.')
    finishRun(run, result, started)
    setResultMessage(result)
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
    finishRun(run, result, started)
    setResultMessage(result)
  } finally {
    clearTimeout(timeout)
    setBusy(false)
  }
})
