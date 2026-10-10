import './styles.css'
import { mountHeroAscii } from './ascii'
import { mountHeroClick } from './heroClick'
import { mountGlyphRipple } from './glyphRipple'
import { mountHowReplay } from './howReplay'
import { mountFeatureSections } from './featureMotion'
import { mountGlyphBand } from './glyphBandMotion'
import { mountOctopusSwim } from './octopusSwim'
import { track, trackLinkClicks, trackPageView } from './analytics'
import { mountWaitlist } from './waitlist'
import { mountCrawlView } from './crawlView'
import { readPreview, STAGE_STREAM } from './previewStream'
import { buildWindow } from './windowBuild'
import { API_SERVER, fieldsSchema, HOSTED_MCP, isAmazonProduct, MCP_SERVER, mcpPrompt, mcpSnippet, restSnippet, type FieldRequest, type FieldType, type OutputView } from './getCode'

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


// Tab sets (recorded results, ways to run W2L). The prerendered page shows every panel and no tabs, so it reads in
// full without script; here the tabs appear and every panel but the selected one is hidden, before anything below
// measures the page.
for (const set of document.querySelectorAll<HTMLElement>('[data-tabs]')) {
  const list = set.querySelector<HTMLElement>('[role="tablist"]')!
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const select = (tab: HTMLButtonElement, focus: boolean): void => {
    for (const other of tabs) {
      const selected = other === tab
      other.setAttribute('aria-selected', String(selected))
      other.tabIndex = selected ? 0 : -1
      const panel = document.getElementById(other.getAttribute('aria-controls')!)
      if (panel) panel.hidden = !selected
    }
    if (focus) tab.focus()
  }
  list.hidden = false
  select(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') ?? tabs[0]!, false)
  for (const tab of tabs) tab.addEventListener('click', () => {
    if (tab.getAttribute('aria-selected') !== 'true') track(set.classList.contains('selfhost-specimen') ? 'selfhost_tab' : 'example_tab', { tab: tab.dataset.tab })
    select(tab, false)
  })
  list.addEventListener('keydown', (event) => {
    const at = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true')
    const next = event.key === 'ArrowRight' ? (at + 1) % tabs.length : event.key === 'ArrowLeft' ? (at + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    event.preventDefault()
    select(tabs[next]!, true)
  })
}

const hero = document.querySelector<HTMLElement>('.hero')!
trackPageView()
trackLinkClicks(document.body)
// The browser's own scroll to a linked section (/#how-it-works) can come after this module has run, animated (the
// page scrolls smoothly), and after the hero had reported itself on screen and loaded its decoration: land there
// directly, unless the browser or a reload has already moved the page.
try {
  const landing = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null
  if (landing && !hero.contains(landing) && !window.scrollY) landing.scrollIntoView({ behavior: 'instant' })
} catch { /* A malformed fragment keeps the browser's own handling. */ }
mountHeroAscii(document.querySelector<HTMLElement>('#hero-ascii')!, document.querySelector<HTMLElement>('#hero-glyphs')!, hero)
mountHeroClick(document.querySelector<HTMLElement>('#hero-click-spark')!, hero)
mountHowReplay(document.querySelector<HTMLElement>('#how-replay')!)
mountFeatureSections()
for (const band of document.querySelectorAll<HTMLElement>('.glyph-band')) mountGlyphBand(band)
const startHead = document.querySelector<HTMLElement>('.start-head')
if (startHead) mountOctopusSwim(startHead)
// The octopus game: its own chunk, loaded when a visitor asks to play, from the button by the kelp or the ▶ the
// octopus holds out when petted.
const playButton = document.querySelector<HTMLButtonElement>('.sea-play')
const openSeaGame = (opener: HTMLElement) => { void import('./octopusGame').then(({ openGame }) => openGame(opener)).catch(() => { /* The page goes on without it. */ }) }
if (playButton) {
  playButton.hidden = false
  playButton.addEventListener('click', () => openSeaGame(playButton))
}
startHead?.addEventListener('octopus:play', () => openSeaGame(playButton ?? startHead))
for (const cloud of document.querySelectorAll<HTMLElement>('.glyph-cloud[data-seed]')) mountGlyphRipple(cloud)

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
const quotaNote = document.querySelector<HTMLElement>('#quota-note')!
const QUOTA_NOTE = quotaNote.textContent ?? ''
const crawl = mountCrawlView(urlCard, hero)
const waitlist = mountWaitlist()
/** After the daily previews run out: a link to the hosted early-access form, saying what a key gives (the hosted
 * API's starting allowance, docs/hosted-api.md) and that keys are issued by hand for now. */
function waitlistLink(className: string): HTMLAnchorElement {
  const link = textElement('a', 'Need more? Ask for a hosted key: 1,000 pages a day to start, issued by hand ↓', className)
  link.href = '#waitlist'
  link.addEventListener('click', event => { event.preventDefault(); waitlist.open('quota') })
  return link
}
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
  return `octocrawl-${safe}.${extension}`
}

document.querySelector<HTMLButtonElement>('#example-button')!.addEventListener('click', () => {
  track('example_click')
  input.value = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview'
  // Focus stays on the button (Extract page is the next stop), so the hero keeps moving: nothing is being typed.
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
      // In the body, not the query string: the hosting request log keeps every request's path and query.
      const response = await fetch('/api/capability', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
        signal: request.signal, credentials: 'same-origin',
      })
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
  if (diagnostic?.code === 'robots_unreachable') return 'robots.txt unreadable'
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
  if (code === 'robots_unreachable') return ['Try again in a few minutes: the site’s robots.txt may answer then.', 'Or try a page from a different site.']
  if (code === 'login_required') return ['Try a page that anyone can open without signing in. Octocrawl does not bypass login walls.']
  if (code === 'challenge') return ['Try a different public page. Octocrawl does not solve verification challenges.']
  if (code === 'policy_denied') return ['Use a public http:// or https:// address that anyone can open.']
  // A service-side failure carries no capture diagnostic; its reason already says to retry later.
  if (result.status === 'failed' && code !== 'capture_failed') return []
  return ({
    success: [],
    incomplete: [],
    blocked: ['Try a different public page. Octocrawl respects site policy and does not bypass blocks.'],
    failed: [retry],
    timeout: [retry],
    invalid_url: ['Use a public http:// or https:// address that anyone can open.'],
    quota_exceeded: ['Try again after 00:00 UTC, when the daily allowance of five previews resets.', 'For regular use, ask for a hosted key (1,000 pages a day to start, issued by hand for now) and connect your agent to mcp.octocrawl.dev or call api.octocrawl.dev, or run Octocrawl on your own computer with no limit.'],
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
    setOutputView('json', 'body')
    content.querySelector<HTMLElement>('.window-tab[aria-selected="true"]')?.focus()
  })
  const docs = result.status === 'quota_exceeded'
    ? textElement('a', 'Run it yourself ↗', 'guidance-link')
    : textElement('a', 'Limits and result states ↗', 'guidance-link')
  docs.href = result.status === 'quota_exceeded' ? 'https://github.com/77777R7/Octocrawl' : '/docs/limits/'
  actions.append(json, docs)
  if (result.status === 'quota_exceeded') actions.append(waitlistLink('guidance-link'))
  panel.append(actions)
  return panel
}

function appendInline(target: HTMLElement, source: string): void {
  // An image is kept as a link to it, marked as one; the page's images are never loaded here.
  const tokens = /(!?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g
  let cursor = 0
  for (const match of source.matchAll(tokens)) {
    const index = match.index ?? 0
    if (index > cursor) target.append(document.createTextNode(source.slice(cursor, index)))
    if (match[2] && match[3]) {
      const href = safeWebUrl(match[3])
      if (href) {
        const link = textElement('a', match[1]!.startsWith('!') ? `▣ ${match[2]}` : match[2])
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

/** What the page declares about itself, as ledger lines: each value with the markup it is read from (nothing is
 * inferred from the URL, the content or another tag), or, for a file, what was read of it. */
function renderPageInfo(result: PreviewResponse): HTMLElement {
  const box = document.createElement('div')
  box.className = 'ledger-view'
  const file = result.file
  if (file) {
    const size = formatBytes(file.bytes)
    const lines: LedgerLine[] = [
      { name: 'file type', state: 'found', value: file.kind.toUpperCase() },
      infoLine('content type', file.contentType, 'not declared', undefined, true),
      size === null ? { name: 'size', state: 'missing', value: 'not read', cite: file.declaredBytes === null ? undefined : `declared ${formatBytes(file.declaredBytes)}, above the ${formatBytes(file.maxBytes)} limit` } : { name: 'size', state: 'found', value: size, code: true },
      ...(file.pdf ? [{ name: 'pages read', state: 'found', value: file.pdf.pageCount === null ? String(file.pdf.pagesRead) : `${file.pdf.pagesRead} of ${file.pdf.pageCount}`, code: true } as LedgerLine] : []),
      infoLine('text', file.markdownFrom === 'pdf_text' ? 'the PDF text layer' : file.markdownFrom === 'text' ? 'the text as received' : null, 'no text'),
      ...file.warnings.map((warning): LedgerLine => ({ name: 'warning', state: 'note', value: warning.message || warning.code })),
    ]
    box.append(ledgerMeter(lines, `${lines.filter((line) => line.state === 'found').length} of ${lines.length} read from the file`), ledgerList(lines))
    return box
  }
  const metadata = result.metadata
  const lines: LedgerLine[] = [
    infoLine('page title', metadata?.title, 'not declared', '<title>'),
    infoLine('description', metadata?.description, 'not declared', '<meta name="description">'),
    infoLine('language', metadata?.language, 'not declared', '<html lang>, or a Content-Language meta', true),
    infoLine('canonical URL', metadata?.canonicalUrl, 'not declared', '<link rel="canonical">', true),
    infoLine('robots', metadata?.robots, 'not declared', '<meta name="robots">', true),
    infoLine('keywords', metadata?.keywords, 'not declared', '<meta name="keywords">'),
    infoLine('icon', metadata?.favicon, 'not declared', '<link rel="icon">', true),
    infoLine('content title', result.title, 'not found'),
    infoLine('final URL', result.finalUrl, 'not available', 'the fetch itself, after redirects', true),
  ]
  box.append(ledgerMeter(lines, `${lines.filter((line) => line.state === 'found').length} of ${lines.length} found · nothing inferred from the URL or the content`), ledgerList(lines))
  return box
}

/** A value the page declares: its line, citing the markup it is read from, or where W2L looked when it is absent. */
function infoLine(name: string, value: string | null | undefined, missing: string, source?: string, code = false): LedgerLine {
  if (value === null || value === undefined || value === '') return { name, state: 'missing', value: missing, cite: source ? `looked for ${source}` : undefined }
  return { name, state: 'found', value, code, cite: source }
}

/** One line of a ledger: a mark, a name, the value (or why there is none) and where it was read. */
type LedgerLine = { name: string; state: keyof typeof LEDGER_MARKS; value: string; code?: boolean; cite?: string }

/** The ledger's head: a mark per line, in order, then the count in words (the marks are for sighted readers). */
function ledgerMeter(lines: readonly LedgerLine[], text: string): HTMLElement {
  const meter = document.createElement('p')
  meter.className = 'ledger-meter'
  if (lines.length) {
    const cells = document.createElement('span')
    cells.className = 'meter-cells'
    cells.setAttribute('aria-hidden', 'true')
    for (const line of lines) cells.append(textElement('span', LEDGER_MARKS[line.state], `is-${line.state}`))
    meter.append(cells)
  }
  meter.append(textElement('span', text, 'meter-text'))
  return meter
}

function ledgerList(lines: readonly LedgerLine[]): HTMLElement {
  const ledger = document.createElement('dl')
  ledger.className = 'ledger'
  for (const line of lines) {
    const row = document.createElement('div')
    row.className = `ledger-row is-${line.state}`
    const term = document.createElement('dt')
    const mark = textElement('span', LEDGER_MARKS[line.state], 'ledger-mark')
    mark.setAttribute('aria-hidden', 'true')
    term.append(mark, textElement('span', line.name, 'ledger-name'))
    row.append(term, textElement('dd', line.value, `ledger-value${line.state === 'missing' ? ' is-empty' : line.code ? ' is-code' : ''}`))
    if (line.cite) row.append(textElement('dd', `↳ ${line.cite}`, 'ledger-cite'))
    ledger.append(row)
  }
  return ledger
}

const LEDGER_MARKS = { found: '✓', missing: '·', ambiguous: ':', note: ':' } as const
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
  box.className = 'ledger-view'
  const json = result.json
  if (!json) return box
  const data = json.data !== null && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data as Record<string, unknown> : {}
  const names = Object.keys(data)
  const lines = names.map((name): LedgerLine => {
    const value = data[name]
    const issue = json.issues.find((item) => item.path === `/${name}`)
    if (value === null || value === undefined) return { name, state: issue?.code === 'field_ambiguous' ? 'ambiguous' : 'missing', value: missingReason(issue) }
    const evidence = json.evidence.find((item) => item.path === `/${name}`)
    const text = Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ') : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
    const cite = evidence ? [FIELD_SOURCES[evidence.source] ?? evidence.source, evidence.evidencePath, evidence.text ? `read from “${evidence.text}”` : ''].filter(Boolean).join(' · ') : undefined
    return { name, state: 'found', value: text, code: typeof value === 'number' || typeof value === 'boolean', cite }
  })
  const found = lines.filter((line) => line.state === 'found').length
  box.append(ledgerMeter(lines, lines.length ? `${found} of ${lines.length} stated on the page · read without AI` : 'No fields were read from this page.'))
  if (lines.length) box.append(ledgerList(lines))
  const general = json.issues.filter((item) => !item.path || !names.includes(item.path.slice(1)))
  if (general.length) {
    const list = document.createElement('ul')
    list.className = 'ledger-notes'
    for (const item of general.slice(0, 8)) list.append(textElement('li', item.message || item.code))
    box.append(list)
  }
  return box
}

/** A URL's text that wraps after its separators (/ ? & = #) rather than inside a word. */
function breakable(text: string, className: string): HTMLElement {
  const span = document.createElement('span')
  span.className = className
  text.split(/(?<=[/?&=#])/).forEach((part, index) => {
    if (index) span.append(document.createElement('wbr'))
    span.append(part)
  })
  return span
}

/** The page's links as a numbered ledger: · for a link on the page's own site, ↗ for one elsewhere, each written as
 * its host and path. It scrolls inside its frame, whose corners and rules stay put. */
function renderLinks(result: PreviewResponse): HTMLElement {
  const box = document.createElement('div')
  box.className = 'ledger-view'
  const links = result.links ?? []
  const total = result.linksTotal ?? links.length
  if (!links.length) {
    box.append(textElement('p', 'No links were found on this page.', 'empty-content'))
    return box
  }
  const siteOf = (host: string): string => host.replace(/^www\./, '')
  let site = ''
  try { site = siteOf(new URL(result.finalUrl ?? result.requestedUrl).hostname) } catch { /* No site to compare with. */ }
  const rows = links.map((link) => {
    let parsed: URL | null = null
    try { parsed = new URL(link) } catch { /* Shown as written. */ }
    return { link, parsed, own: parsed !== null && siteOf(parsed.hostname) === site }
  })
  const own = rows.filter((row) => row.own).length
  const count = total > links.length ? `The first ${links.length.toLocaleString()} of ${total.toLocaleString()} links on the page` : `${total.toLocaleString()} ${total === 1 ? 'link' : 'links'} on the page`
  const meter = document.createElement('p')
  meter.className = 'ledger-meter'
  meter.append(textElement('span', `${count} · ${own.toLocaleString()} on ${site || 'this site'} · ${(rows.length - own).toLocaleString()} elsewhere`, 'meter-text'))
  box.append(meter)
  const frame = document.createElement('div')
  frame.className = 'ledger is-scroll'
  const list = document.createElement('ol')
  list.className = 'ledger-scroll'
  rows.forEach((row, index) => {
    const item = document.createElement('li')
    item.className = `ledger-row link-row ${row.own ? 'is-own' : 'is-away'}`
    const number = textElement('span', String(index + 1).padStart(3, '0'), 'link-index')
    const mark = textElement('span', row.own ? '·' : '↗', 'ledger-mark')
    number.setAttribute('aria-hidden', 'true')
    mark.setAttribute('aria-hidden', 'true')
    const href = safeWebUrl(row.link)
    const target = href ? textElement('a', '', 'link-target') : textElement('span', '', 'link-target')
    if (row.parsed) target.append(breakable(row.parsed.host, 'link-host'), breakable(`${row.parsed.pathname}${row.parsed.search}${row.parsed.hash}`, 'link-path'))
    else target.append(breakable(row.link, 'link-path'))
    if (href && target instanceof HTMLAnchorElement) {
      target.href = href
      target.target = '_blank'
      target.rel = 'noopener noreferrer'
    }
    item.append(number, mark, target)
    list.append(item)
  })
  frame.append(list)
  box.append(frame)
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

/** Raw text as numbered lines. The numbers are drawn by the styles, so a selection copies the text alone, and
 * `tint` marks each line's syntax; text is only ever set as text. */
function sourceView(text: string, tint: (line: string, into: HTMLElement) => void): HTMLElement {
  const pre = document.createElement('pre')
  pre.className = 'source-view'
  const code = document.createElement('code')
  for (const line of text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) {
    const row = document.createElement('span')
    row.className = 'source-line'
    const body = document.createElement('span')
    body.className = 'source-text'
    tint(line, body)
    row.append(body)
    code.append(row)
  }
  pre.append(code)
  return pre
}

function tinted(into: HTMLElement, text: string, className?: string): void {
  if (!text) return
  if (className) into.append(textElement('span', text, className))
  else into.append(text)
}

/** Markdown's syntax marks (#, list markers, link brackets and targets, emphasis, fences) dimmed, so the words read
 * first, as in the Markdown an agent receives. Lines inside a fence are left as written. */
function markdownTint(): (line: string, into: HTMLElement) => void {
  let fenced = false
  return (line, into) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; tinted(into, line, 'tok-mark'); return }
    if (fenced) { tinted(into, line, 'tok-code'); return }
    const heading = /^(#{1,6}\s+)(.*)$/.exec(line)
    if (heading) { tinted(into, heading[1]!, 'tok-mark'); tinted(into, heading[2]!, 'tok-heading'); return }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) { tinted(into, line, 'tok-mark'); return }
    const lead = /^(\s*(?:[-*+]|\d+[.)])\s+|\s*>\s?)/.exec(line)
    if (lead) tinted(into, lead[1]!, 'tok-mark')
    const rest = lead ? line.slice(lead[1]!.length) : line
    let cursor = 0
    for (const match of rest.matchAll(/(!?\[)([^\]]*)(\]\()([^)\s]*)(\))|\*\*|__|`[^`]+`/g)) {
      const index = match.index ?? 0
      tinted(into, rest.slice(cursor, index))
      if (match[1]) {
        tinted(into, match[1], 'tok-mark'); tinted(into, match[2]!); tinted(into, match[3]!, 'tok-mark')
        tinted(into, match[4]!, 'tok-url'); tinted(into, match[5]!, 'tok-mark')
      } else if (match[0].startsWith('`')) tinted(into, match[0], 'tok-code')
      else tinted(into, match[0], 'tok-mark')
      cursor = index + match[0].length
    }
    tinted(into, rest.slice(cursor))
  }
}

function jsonTint(line: string, into: HTMLElement): void {
  let cursor = 0
  for (const match of line.matchAll(/("(?:[^"\\]|\\.)*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g)) {
    const index = match.index ?? 0
    tinted(into, line.slice(cursor, index), 'tok-mark')
    if (match[1]) { tinted(into, match[1], match[2] ? 'tok-key' : 'tok-string'); tinted(into, match[2] ?? '', 'tok-mark') }
    else tinted(into, match[0], 'tok-literal')
    cursor = index + match[0].length
  }
  tinted(into, line.slice(cursor), 'tok-mark')
}

/** How the Markdown view shows the text: as received (the default, what Copy copies) or rendered. Kept for the visit. */
let markdownMode: 'source' | 'preview' = 'source'
const MARKDOWN_PREVIEW_LIMIT = 150_000

/** The result as a window: its views as tabs, Copy and Download beside them, the content scrolling inside the
 * window (the page stays short however long the page read was), and under it the file Download saves. `build`
 * prints it in glyphs: the whole window for a new result, the body alone for another view. */
function renderOutputPanel(result: PreviewResponse, build: 'window' | 'body' | 'none' = 'none'): void {
  content.querySelector('.output-panel')?.remove()
  // A failed capture has no content to show; its guidance panel offers the JSON view.
  if (outputView !== 'json' && !isPageRead(result)) return
  const views = availableViews(result)
  // A view this result does not have (links of a file, say) falls back to the first it has; the choice stays.
  const view = views.includes(outputView) ? outputView : views[0]!
  const text = VIEW_TEXT[view]
  const payload = viewPayload(result, view)
  const output = document.createElement('section')
  output.className = 'output-panel result-window'
  output.setAttribute('aria-labelledby', 'content-title')
  const h3 = textElement('h3', text.title, 'visually-hidden')
  h3.id = 'content-title'

  const bar = document.createElement('div')
  bar.className = 'window-bar'
  const tabs = document.createElement('div')
  tabs.className = 'window-tabs'
  tabs.setAttribute('role', 'tablist')
  tabs.setAttribute('aria-label', 'Output format')
  const tabButtons = views.map((option) => {
    const tab = textElement('button', VIEW_NAMES[option], 'window-tab')
    tab.type = 'button'
    tab.id = `window-tab-${option}`
    tab.dataset.view = option
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(option === view))
    tab.setAttribute('aria-controls', 'window-body')
    tab.tabIndex = option === view ? 0 : -1
    tab.addEventListener('click', () => chooseView(option))
    return tab
  })
  const chooseView = (option: OutputView): void => {
    if (option !== view) track('view_change', { view: option })
    setOutputView(option, 'body')
    content.querySelector<HTMLElement>('.window-tab[aria-selected="true"]')?.focus()
  }
  tabs.addEventListener('keydown', (event) => {
    const at = views.indexOf(view)
    const next = event.key === 'ArrowRight' ? (at + 1) % views.length : event.key === 'ArrowLeft' ? (at + views.length - 1) % views.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : -1
    if (next < 0) return
    event.preventDefault()
    chooseView(views[next]!)
  })
  tabs.append(...tabButtons)

  const actions = document.createElement('div')
  actions.className = 'output-actions'
  const copy = textElement('button', 'Copy', 'copy-button')
  copy.type = 'button'
  copy.title = text.copy
  copy.disabled = !payload
  copy.addEventListener('click', async () => {
    track('result_copy', { view })
    try {
      await navigator.clipboard.writeText(payload)
      copy.textContent = 'Copied ✓'
      window.setTimeout(() => { copy.textContent = 'Copy' }, 2200)
    } catch { copy.textContent = 'Copy failed. Select the text manually.' }
  })
  const filename = resultFilename(result, text.extension)
  const download = textElement('button', `↓ .${text.extension}`, 'download-button')
  download.type = 'button'
  // The name holds the visible label, so it can be spoken to voice control.
  download.setAttribute('aria-label', `Download .${text.extension}`)
  download.title = text.download.replace(/^↓\s*/, '')
  download.disabled = !payload
  download.addEventListener('click', () => {
    track('result_download', { view })
    downloadFile(payload, filename, text.type)
  })
  actions.append(copy, download)
  bar.append(tabs, actions)

  const notes: string[] = []
  if (view === 'json') notes.push('The sanitized server response. Its totalMs measures server processing; the run’s total time includes browser network time. Verified Amazon.sg product fields appear under “product” when available.')
  if (view === 'markdown' && result.markdownTruncated) notes.push('This page is very long: the preview returned its first 1,000,000 characters.')
  if (view === 'markdown' && payload.length > MARKDOWN_PREVIEW_LIMIT) notes.push(`This page is long, so the window shows the first ${MARKDOWN_PREVIEW_LIMIT.toLocaleString()} characters. Copy and Download still take the full returned text.`)

  const body = document.createElement('div')
  body.className = `window-body view-${view}`
  body.id = 'window-body'
  body.setAttribute('role', 'tabpanel')
  body.setAttribute('aria-labelledby', `window-tab-${view}`)
  // Scrolls with the keyboard too.
  body.tabIndex = 0
  if (view === 'json') body.append(sourceView(payload, jsonTint))
  else if (view === 'fields') body.append(renderFields(result))
  else if (view === 'links') body.append(renderLinks(result))
  else if (view === 'info') body.append(renderPageInfo(result))
  else if (!payload.trim()) body.append(textElement('p', 'No readable Markdown was returned. Switch to JSON to inspect the status and reason.', 'empty-content'))
  else if (markdownMode === 'preview') body.append(renderMarkdown(payload))
  else body.append(sourceView(payload.slice(0, MARKDOWN_PREVIEW_LIMIT), markdownTint()))

  const foot = document.createElement('div')
  foot.className = 'window-foot'
  const bytes = formatBytes(new TextEncoder().encode(payload).length)
  const lines = view === 'markdown' || view === 'json' || view === 'links' ? payload.replace(/\n$/, '').split('\n').length : null
  const stats = textElement('p', [filename, bytes, lines === null ? null : `${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'}`].filter(Boolean).join(' · '), 'window-stats')
  foot.append(stats)
  if (view === 'markdown' && payload.trim()) {
    const modes = document.createElement('div')
    modes.className = 'window-modes'
    modes.setAttribute('role', 'group')
    modes.setAttribute('aria-label', 'Show the Markdown')
    for (const [mode, label] of [['source', 'Source'], ['preview', 'Preview']] as const) {
      const button = textElement('button', label, 'window-mode')
      button.type = 'button'
      button.setAttribute('aria-pressed', String(markdownMode === mode))
      button.addEventListener('click', () => {
        if (markdownMode === mode) return
        markdownMode = mode
        track('markdown_mode', { mode })
        renderOutputPanel(result, 'body')
        content.querySelector<HTMLElement>(`.window-mode[aria-pressed="true"]`)?.focus()
      })
      modes.append(button)
    }
    foot.append(modes)
  }

  output.append(h3, bar)
  for (const note of notes) output.append(textElement('p', note, 'window-note'))
  output.append(body, foot)
  content.append(output)
  if (build === 'none') return
  const lead = [...body.querySelectorAll<HTMLElement>('.source-line')].slice(0, 48)
  if (build === 'body') buildWindow(body, lead, 260)
  else buildWindow(output, [...tabButtons, copy, download, stats, ...lead], 620)
}

/** Choose what the result panel shows (the Format button and the window's tabs stay in step), and show it for the
 * selected run: every view comes from the same extraction. */
function setOutputView(view: OutputView, build: 'body' | 'none' = 'none'): void {
  outputView = view
  formatLabel.textContent = VIEW_NAMES[view]
  const radio = formatPanel.querySelector<HTMLInputElement>(`input[value="${view}"]`)
  if (radio) radio.checked = true
  const run = runs.find((candidate) => candidate.id === selectedRunId)
  if (run?.result) renderOutputPanel(run.result, build)
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
  renderOutputPanel(result, 'window')
}

/** Point to the result below; its guidance panel carries the reason. */
/** The visitor's previews left today, as the service counted them. Anything it cannot say for sure leaves the
 * prerendered "5 free previews a day" in place: the page never guesses a number. */
async function refreshQuota(): Promise<void> {
  let text = QUOTA_NOTE
  let usedUp = false
  try {
    const response = await fetch('/api/quota', { credentials: 'same-origin' })
    const quota = response.ok ? await response.json() as { enabled?: boolean; state?: QuotaDecision; limit?: number; remaining?: number } : null
    if (quota?.enabled === false) text = 'Previews are paused right now'
    else if (quota?.enabled === true && typeof quota.remaining === 'number' && typeof quota.limit === 'number') {
      usedUp = quota.state === 'global_limited' || quota.state === 'visitor_limited'
      text = quota.state === 'global_limited' ? 'Today’s public previews are used up · resets 00:00 UTC'
        : quota.state === 'visitor_limited' ? `Your ${quota.limit} free previews for today are used · resets 00:00 UTC`
          : `${quota.remaining} of ${quota.limit} free previews left today`
    }
  } catch { /* An unreadable count shows the static note, never an older number. */ }
  quotaNote.textContent = text
  if (usedUp) quotaNote.append(' · ', waitlistLink('url-help-link'))
}
type QuotaDecision = 'ok' | 'visitor_limited' | 'global_limited'
void refreshQuota()

function setResultMessage(result: PreviewResponse): void {
  const read = isPageRead(result)
  message.textContent = read ? 'Your result is below.' : 'No readable content was returned. See why below.'
  message.className = `form-message${read ? '' : ' is-error'}`
}

/** Brings the selected run's result into view, below the hero; the run cards sit just above it. */
function revealResults(): void {
  runDetail.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

/** Shows the run's result; the page moves to it unless the crawl window is still playing (it moves there after). */
function finishRun(run: Run, result: PreviewResponse, started: number, reveal = true): void {
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
  if (reveal) revealResults()
}

/** A panel opens under its button on wide screens (a sheet at the foot of a phone's screen, in the styles), or
 * above it when there is more room there. Above, it is held by its foot, so a panel that grows (a field added)
 * grows away from the button; either way it scrolls inside once it reaches the edge of the screen. */
function placePanel(panel: HTMLElement, button: HTMLElement): void {
  for (const name of ['--panel-left', '--panel-top', '--panel-bottom', '--panel-max']) panel.style.removeProperty(name)
  // A phone's sheet rises from the foot of the screen.
  panel.dataset.side = 'above'
  if (window.matchMedia('(max-width: 600px)').matches) return
  const box = button.getBoundingClientRect()
  const left = Math.max(12, Math.min(box.left, window.innerWidth - panel.offsetWidth - 12))
  const roomBelow = window.innerHeight - box.bottom - 20
  const roomAbove = box.top - 20
  panel.style.setProperty('--panel-left', `${Math.round(left)}px`)
  if (panel.scrollHeight <= roomBelow || roomBelow >= roomAbove) {
    panel.dataset.side = 'below'
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
    panel.classList.toggle('is-placed', false)
    if (!open) return
    placePanel(panel, button)
    // Hidden until placed, so it never shows where it was; then it unfolds from the button's side (the styles).
    panel.classList.add('is-placed')
    // The toggle event comes after the panel opened: focus already placed inside it (a new field) stays there.
    if (panel.contains(document.activeElement)) return
    ;(panel.querySelector<HTMLElement>('input:checked') ?? panel.querySelector<HTMLElement>('input, button:not(.sheet-close)'))?.focus()
  })
}
for (const type of ['resize', 'scroll'] as const) {
  window.addEventListener(type, () => { for (const [panel, button] of panels) if (panel.matches(':popover-open')) placePanel(panel, button) }, { passive: true })
}
/** Each format's icon, drawn on the hero's glyph grid: lit cells (#) over faint dots. Each lit cell comes up at its
 * own moment as the panel unfolds (--d), like the octopus decoding. */
const FORMAT_ICONS: Record<OutputView, string[]> = {
  markdown: ['#####..', '.......', '######.', '#####..', '######.', '.......', '####...'],
  links: ['...####', '.....##', '....#.#', '...#..#', '..#....', '.#.....', '#......'],
  info: ['..###..', '.#...#.', '#..#..#', '#.....#', '#..#..#', '.#.#.#.', '..###..'],
  fields: ['##.####', '.......', '##.###.', '.......', '##.####', '.......', '##.##..'],
  json: ['..#.#..', '.#...#.', '.#...#.', '#.....#', '.#...#.', '.#...#.', '..#.#..'],
}
for (const box of formatPanel.querySelectorAll<HTMLElement>('.tile-icon')) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 49 49')
  svg.setAttribute('class', 'glyph-icon')
  FORMAT_ICONS[box.dataset.icon as OutputView].forEach((row, y) => [...row].forEach((cell, x) => {
    const lit = cell === '#'
    const mark = document.createElementNS('http://www.w3.org/2000/svg', lit ? 'rect' : 'circle')
    if (lit) {
      for (const [name, value] of [['x', x * 7 + 1.2], ['y', y * 7 + 1.2], ['width', 4.6], ['height', 4.6], ['rx', 1]] as const) mark.setAttribute(name, String(value))
      mark.setAttribute('class', 'on')
      mark.style.setProperty('--d', `${((x * 5 + y * 3) % 7) * 28}ms`)
    } else {
      for (const [name, value] of [['cx', x * 7 + 3.5], ['cy', y * 7 + 3.5], ['r', 0.9]] as const) mark.setAttribute(name, String(value))
      mark.setAttribute('class', 'off')
    }
    svg.append(mark)
  }))
  box.append(svg)
}

// A format chosen with the pointer closes the panel; arrow keys only move the choice, and Enter closes it (and never
// submits the form around it).
let pointerChoice = false
formatPanel.addEventListener('pointerdown', (event) => { pointerChoice = Boolean((event.target as HTMLElement).closest('.format-tile')) })
formatPanel.addEventListener('change', (event) => {
  const choice = event.target as HTMLInputElement
  if (choice.name !== 'output-view') return
  track('view_change', { view: choice.value })
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
    row.style.setProperty('--i', String(index))
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

/** The same extraction on your own computer: the URL entered (or the example), the chosen view and options, as a
 * cURL call to the local API, an MCP tool call, or a prompt for an MCP client. One listing shows at a time. */
type CodeTab = 'curl' | 'mcp' | 'prompt'
const codeTabs = [...codeDialog.querySelectorAll<HTMLButtonElement>('.code-tab')]
const codeLines = codeDialog.querySelector<HTMLOListElement>('#code-lines')!
const codeStep = codeDialog.querySelector<HTMLElement>('#code-step')!
const codeCopy = codeDialog.querySelector<HTMLButtonElement>('#code-copy')!
const codeStatus = codeDialog.querySelector<HTMLElement>('#code-status')!
let codeTab: CodeTab = 'curl'
let codeTexts: Record<CodeTab, string> = { curl: '', mcp: '', prompt: '' }

/** What to start before the listing, as a prompt line: plain words with the commands in code. */
function codeStepFor(tab: CodeTab): Array<string | [string]> {
  if (tab === 'curl') return ['Hosted, no key needed within the daily allowance; or on your computer after ', [API_SERVER], ':']
  if (tab === 'mcp') return ['Add ', [HOSTED_MCP], ' to your client (or ', [MCP_SERVER], ' after ', [API_SERVER], '), then call the tool:']
  return ['Add ', [HOSTED_MCP], ' to your client (or ', [MCP_SERVER], ' after ', [API_SERVER], '), then ask:']
}

/** Show one listing. Each line is printed in turn (the styles stagger them by --i), so a tab reads as typed. */
function renderCode(): void {
  for (const tab of codeTabs) {
    const selected = tab.dataset.tab === codeTab
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    if (selected) codeDialog.querySelector('#code-panel')!.setAttribute('aria-labelledby', tab.id)
  }
  codeStep.replaceChildren(textElement('span', '›', 'code-prompt'), ...codeStepFor(codeTab).map((part) => typeof part === 'string' ? document.createTextNode(part) : textElement('code', part[0])))
  codeLines.replaceChildren(...codeTexts[codeTab].split('\n').map((line, index) => {
    const item = document.createElement('li')
    if (line.startsWith('#')) item.className = 'is-comment'
    item.style.setProperty('--i', String(index))
    item.append(textElement('span', line || ' ', 'code-text'))
    return item
  }))
  codeCopy.textContent = 'Copy'
}

codeButton.addEventListener('click', () => {
  track('get_code_open')
  let url = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview'
  try { url = normalizeUrl(input.value) } catch { /* The example, until a valid URL is entered. */ }
  const request = { url, view: outputView, onlyMainContent: mainContent.checked, fields: readFields().fields }
  codeTexts = { curl: restSnippet(request), mcp: mcpSnippet(request), prompt: mcpPrompt(request) }
  codeStatus.textContent = ''
  renderCode()
  codeDialog.showModal()
  // Start on the chosen tab rather than the close button.
  codeTabs.find((tab) => tab.dataset.tab === codeTab)?.focus()
})
for (const tab of codeTabs) tab.addEventListener('click', () => { codeTab = tab.dataset.tab as CodeTab; renderCode() })
// Arrow keys, Home and End move between the tabs, as a tab list does.
codeDialog.querySelector('.code-tabs')!.addEventListener('keydown', (event) => {
  const key = (event as KeyboardEvent).key
  const at = codeTabs.findIndex((tab) => tab.dataset.tab === codeTab)
  const next = key === 'ArrowRight' ? (at + 1) % codeTabs.length : key === 'ArrowLeft' ? (at + codeTabs.length - 1) % codeTabs.length : key === 'Home' ? 0 : key === 'End' ? codeTabs.length - 1 : -1
  if (next < 0) return
  event.preventDefault()
  codeTab = codeTabs[next]!.dataset.tab as CodeTab
  renderCode()
  codeTabs[next]!.focus()
})
codeDialog.querySelector('#code-close')!.addEventListener('click', () => codeDialog.close())
// A click on the backdrop closes it too.
codeDialog.addEventListener('click', (event) => { if (event.target === codeDialog) codeDialog.close() })
codeDialog.addEventListener('close', () => codeButton.focus())
codeCopy.addEventListener('click', async () => {
  track('get_code_copy', { tab: codeTab })
  try {
    await navigator.clipboard.writeText(codeTexts[codeTab])
    codeCopy.textContent = 'Copied ✓'
    codeStatus.textContent = 'Copied to the clipboard.'
    window.setTimeout(() => { codeCopy.textContent = 'Copy' }, 2200)
  } catch { codeStatus.textContent = 'Copy failed. Select the text manually.' }
})


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
  // Before the form turns busy, so the window can take focus from the button that sent it.
  const crawling = crawl.begin(url)
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
  /** The window plays out its end, then the page moves to the result. */
  const settle = async (result: PreviewResponse): Promise<void> => {
    finishRun(run, result, started, !crawling)
    if (!crawling) return
    const hadFocus = await crawl.finish({
      read: isPageRead(result), title: result.title, markdown: result.markdown, label: statusText(result.status, result.product, result.diagnostic),
      reason: result.reason, skipScene: result.status === 'quota_exceeded' || result.status === 'invalid_url',
    })
    setBusy(false)
    if (hadFocus) input.focus({ preventScroll: true })
    if (run.id === selectedRunId) revealResults()
  }
  let result: PreviewResponse
  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      // The server reports its stages as they happen to a client that asks; the crawl window shows them.
      headers: { 'Content-Type': 'application/json', Accept: `${STAGE_STREAM}, application/json` },
      body: JSON.stringify(previewBody(url)),
      signal: controller.signal,
      credentials: 'same-origin',
    })
    const value = await readPreview(response, stage => crawl.stage(stage))
    if (!value || typeof value !== 'object' || !('status' in value)) throw new Error('The service returned an unrecognized result.')
    result = value as PreviewResponse
    if (!result.requestedUrl || !Number.isFinite(result.totalMs)) throw new Error('The service returned an incomplete result.')
  } catch {
    const aborted = controller.signal.aborted
    result = {
      status: aborted ? 'timeout' : 'failed',
      requestedUrl: url,
      finalUrl: null,
      title: null,
      markdown: null,
      totalMs: performance.now() - started,
      reason: aborted ? 'The browser timed out. The server may still be processing; try again later.' : 'The service could not return a result. Please try again later.',
    }
  } finally {
    clearTimeout(timeout)
  }
  // Message first: an error style can grow the hero, and the smooth scroll must target the final layout.
  setResultMessage(result)
  try { await settle(result) }
  finally {
    setBusy(false)
    void refreshQuota()
  }
})
