/** Link Extractor's whole-site read: with Whole site chosen over the card, a submitted URL goes to the site's /api/map
 * (the site's sitemaps and start page's links, one of the visitor's five a day) instead of the one-page preview, and the
 * pages found are listed under the card, each with where it was found, what was left out and why, a filter, and copies
 * as text or CSV. This page leaves the card to main.ts, which shows the page's links. */

type Via = 'start' | 'link' | 'sitemap'
type MapLink = { url: string; title?: string; via: Via[]; lastmod?: string; robots: string }
type Refused = Record<'duplicate' | 'collapsed' | 'hostDenied' | 'subtreeDenied' | 'pathDenied' | 'assetDenied' | 'robots' | 'robotsUnchecked' | 'overLimit', number>
type PreviewMap = {
  status: 'completed' | 'partial' | 'failed'
  stoppedBy: 'limit' | 'timeout' | null
  links: MapLink[]
  refused: Refused
  sources: { sitemap: { listed: number; truncated: string | null; files: Array<{ kind: string }> } | null } | null
  warnings: Array<{ code: string }>
}
type MapReply = { status: string; requestedUrl: string; reason: string | null; totalMs: number; map?: PreviewMap }

const VIA_NAMES: Record<Via, string> = { start: 'start page', link: 'link', sitemap: 'sitemap' }
/** What each count of left-out URLs means, as the result says it. */
const REFUSED: Array<[keyof Refused, string]> = [
  ['robots', 'disallowed by robots.txt'],
  ['hostDenied', 'on other sites'],
  ['duplicate', 'duplicates'],
  ['collapsed', 'variants of a URL listed'],
  ['assetDenied', 'files such as images'],
  ['robotsUnchecked', 'on sites whose robots.txt wasn’t read'],
  ['subtreeDenied', 'outside the start path'],
  ['pathDenied', 'excluded paths'],
]
const WARNINGS: Record<string, string> = {
  start_page_client_rendered: 'The start page looks drawn by JavaScript, so links a script adds may be missing. The sitemap was read either way.',
  start_page_unreadable: 'The start page could not be read, so only the sitemap was used.',
  sitemap_unreadable: 'Some of the site’s sitemap files could not be read; the pages found in the rest are listed.',
  sitemap_files_capped: 'The site lists more than 50 sitemap files; the first 50 were read.',
  map_timeout: 'Time ran out before every source was read; these are the pages found so far.',
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function download(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = el('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A CSV cell: quoted when it must be, and a cell a spreadsheet would read as a formula (a site's title starting with
 * = + - @, a tab or a return) starts with ' so it stays text. */
export const csvCell = (raw: string): string => {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function render(body: HTMLElement, heading: HTMLElement, reply: MapReply): void {
  body.replaceChildren()
  let host = reply.requestedUrl
  try { host = new URL(reply.requestedUrl).host } catch { /* As written. */ }
  const map = reply.map
  if (reply.status !== 'success' || !map) {
    heading.textContent = host || 'No pages found'
    const box = el('div', 'map-guidance')
    box.append(el('p', 'panel-kicker', reply.status === 'quota_exceeded' ? 'DAILY LIMIT' : 'NO PAGES FOUND'), el('p', 'map-reason', reply.reason ?? 'No pages could be found.'))
    const next = el('p', 'map-next')
    const signin = el('a', '', reply.status === 'quota_exceeded' ? 'Sign in for 1,000 free credits a month →' : 'Limits and result states →')
    signin.href = reply.status === 'quota_exceeded' ? '/signin/' : '/docs/limits/'
    next.append(signin)
    box.append(next)
    body.append(box)
    return
  }
  const links = map.links
  heading.textContent = `${links.length.toLocaleString('en-US')} ${links.length === 1 ? 'page' : 'pages'} on ${host}`
  const fromSitemap = links.filter((link) => link.via.includes('sitemap')).length
  const fromLinks = links.filter((link) => link.via.includes('link')).length
  const more = map.refused.overLimit
  const summary = el('p', 'map-summary')
  summary.textContent = `${fromSitemap.toLocaleString('en-US')} from the sitemap · ${fromLinks.toLocaleString('en-US')} from the start page’s links · ${map.stoppedBy === 'limit' ? 'stopped at 500' : map.stoppedBy === 'timeout' ? 'stopped when time ran out' : 'everything found'} · ${(reply.totalMs / 1000).toFixed(1)} s`
  body.append(summary)
  const left = REFUSED.filter(([key]) => map.refused[key] > 0)
  if (left.length || more) {
    const chips = el('ul', 'map-refused')
    chips.setAttribute('aria-label', 'Left out')
    if (more) chips.append(el('li', 'is-more', `${more.toLocaleString('en-US')}+ more past the limit`))
    for (const [key, words] of left) chips.append(el('li', '', `${map.refused[key].toLocaleString('en-US')} ${words}`))
    body.append(chips)
  }
  for (const warning of map.warnings) if (WARNINGS[warning.code]) body.append(el('p', 'map-warning', WARNINGS[warning.code]))
  // A site without a sitemap at all: the sitemap step ran to its end and found no sitemap file (none named in
  // robots.txt, nothing at /sitemap.xml). A map that stopped before its sitemaps (500 links on the start page, or time)
  // says nothing of them.
  const sitemap = map.sources?.sitemap
  if (sitemap && sitemap.truncated === null && sitemap.files.length > 0 && sitemap.files.every((file) => file.kind === 'absent' || file.kind === 'not_sitemap')) body.append(el('p', 'map-warning', 'This site has no sitemap, so these are the start page’s links. Paste another of its pages to see the links there.'))
  if (more || map.stoppedBy === 'limit') {
    const upsell = el('p', 'map-upsell', 'This site has more than 500 pages. Signed in, the Playground lists up to 5,000 for 1 credit, from 1,000 free a month. ')
    const link = el('a', '', 'Open the Playground →')
    link.href = document.cookie.includes('w2l_account=1') ? '/dashboard/map/' : '/signin/'
    upsell.append(link)
    body.append(upsell)
  }
  if (!links.length) return

  const bar = el('div', 'map-bar')
  const filter = el('input', 'map-filter')
  filter.type = 'search'
  filter.placeholder = 'Filter URLs and titles…'
  filter.setAttribute('aria-label', 'Filter the pages')
  const shows = el('div', 'link-filter')
  shows.setAttribute('role', 'group')
  shows.setAttribute('aria-label', 'Where found')
  let via: Via | 'all' = 'all'
  const viaButtons = (['all', 'sitemap', 'link'] as const).map((choice) => {
    const count = choice === 'all' ? links.length : choice === 'sitemap' ? fromSitemap : fromLinks
    const button = el('button', 'link-filter-button', `${choice === 'all' ? 'All' : choice === 'sitemap' ? 'Sitemap' : 'Links'} ${count.toLocaleString('en-US')}`)
    button.type = 'button'
    button.setAttribute('aria-pressed', String(choice === 'all'))
    button.addEventListener('click', () => {
      via = choice
      for (const other of viaButtons) other.setAttribute('aria-pressed', String(other === button))
      apply()
    })
    return button
  })
  shows.append(...viaButtons)
  const actions = el('div', 'map-actions')
  const name = host.replace(/[^a-z0-9.-]+/gi, '-') || 'site'
  const copy = el('button', 'copy-button', 'Copy')
  copy.type = 'button'
  const txt = el('button', 'download-button', '↓ .txt')
  txt.type = 'button'
  const csv = el('button', 'download-button', '↓ .csv')
  csv.type = 'button'
  actions.append(copy, txt, csv)
  bar.append(filter, shows, actions)
  body.append(bar)

  const list = el('ol', 'map-list')
  const rows = links.map((link, index) => {
    const item = el('li', 'map-row')
    const number = el('span', 'link-index', String(index + 1).padStart(3, '0'))
    number.setAttribute('aria-hidden', 'true')
    const main = el('div', 'map-main')
    const anchor = el('a', 'map-url')
    try {
      const parsed = new URL(link.url)
      anchor.append(el('span', 'link-host', parsed.host), el('span', 'link-path', `${parsed.pathname}${parsed.search}`))
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') anchor.href = parsed.href
    } catch { anchor.textContent = link.url }
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    main.append(anchor)
    if (link.title) main.append(el('span', 'map-title', link.title))
    const tags = el('span', 'map-via')
    for (const source of link.via) tags.append(el('span', `via-${source}`, VIA_NAMES[source]))
    item.append(number, main, tags)
    return { item, link, text: `${link.url} ${link.title ?? ''}`.toLowerCase() }
  })
  list.append(...rows.map((row) => row.item))
  body.append(list)
  const visible = (): MapLink[] => rows.filter((row) => !row.item.hidden).map((row) => row.link)
  function apply(): void {
    const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean)
    for (const row of rows) row.item.hidden = (via !== 'all' && !row.link.via.includes(via)) || !words.every((word) => row.text.includes(word))
  }
  filter.addEventListener('input', apply)
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${visible().map((link) => link.url).join('\n')}\n`)
      copy.textContent = 'Copied ✓'
    } catch { copy.textContent = 'Select to copy' }
    window.setTimeout(() => { copy.textContent = 'Copy' }, 2000)
  })
  txt.addEventListener('click', () => download(`${visible().map((link) => link.url).join('\n')}\n`, `octocrawl-${name}-pages.txt`, 'text/plain;charset=utf-8'))
  csv.addEventListener('click', () => download(`url,title,found_via,lastmod,robots\n${visible().map((link) => [link.url, link.title ?? '', link.via.join(' '), link.lastmod ?? '', link.robots].map(csvCell).join(',')).join('\n')}\n`, `octocrawl-${name}-pages.csv`, 'text/csv;charset=utf-8'))
}

/** Hands a whole-site read to /api/map while Whole site is chosen; `normalize` is main.ts's URL check, so both modes
 * accept the same input. */
export function mountMapResults(hero: HTMLElement, form: HTMLFormElement, input: HTMLInputElement, normalize: (value: string) => string, onDone: () => void): void {
  const section = document.querySelector<HTMLElement>('#map-section')
  const body = document.querySelector<HTMLElement>('#map-body')
  const heading = document.querySelector<HTMLElement>('#map-title')
  const message = document.querySelector<HTMLElement>('#form-message')
  const submit = document.querySelector<HTMLButtonElement>('#submit-button')
  const label = document.querySelector<HTMLElement>('#submit-label')
  const modes = [...hero.querySelectorAll<HTMLButtonElement>('[data-map-mode]')]
  if (!section || !body || !heading || !modes.length) return
  const results = document.querySelector<HTMLElement>('#result-section')
  const setMode = (mode: 'site' | 'page'): void => {
    hero.dataset.toolMap = mode
    for (const button of modes) button.setAttribute('aria-checked', String(button.dataset.mapMode === mode))
    if (label) label.textContent = mode === 'site' ? 'Find pages' : 'Extract links'
    if (results && mode === 'site') results.hidden = true
    if (mode === 'page') section.hidden = true
  }
  modes.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mapMode === 'page' ? 'page' : 'site')))
  hero.querySelector('.map-mode')?.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return
    event.preventDefault()
    const next = hero.dataset.toolMap === 'site' ? 'page' : 'site'
    setMode(next)
    modes.find((button) => button.dataset.mapMode === next)?.focus()
  })
  setMode('site')
  let busy = false
  // Before main.ts's own submit handler (on the form): a document-level capture listener runs first.
  document.addEventListener('submit', async (event) => {
    if (event.target !== form || hero.dataset.toolMap !== 'site') return
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    let url: string
    try { url = normalize(input.value) } catch (error) {
      if (message) {
        message.textContent = error instanceof Error ? error.message : 'Enter a valid URL.'
        message.className = 'form-message is-error'
      }
      input.focus()
      return
    }
    input.value = url
    busy = true
    form.setAttribute('aria-busy', 'true')
    if (submit) submit.disabled = true
    if (message) {
      message.textContent = 'Reading the site’s robots.txt, sitemaps and start page. This can take up to 40 seconds.'
      message.className = 'form-message'
    }
    section.hidden = false
    heading.textContent = 'Finding pages…'
    body.replaceChildren(el('p', 'map-loading', 'Reading robots.txt, the sitemaps it names and the start page’s links…'))
    section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    const started = performance.now()
    let reply: MapReply
    try {
      const response = await fetch('/api/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }), credentials: 'same-origin' })
      reply = await response.json() as MapReply
    } catch {
      reply = { status: 'failed', requestedUrl: url, reason: 'The service could not return a result. Please try again later.', totalMs: performance.now() - started }
    }
    render(body, heading, reply)
    if (message) message.textContent = ''
    busy = false
    form.removeAttribute('aria-busy')
    if (submit) submit.disabled = false
    heading.focus({ preventScroll: true })
    onDone()
  }, true)
}
