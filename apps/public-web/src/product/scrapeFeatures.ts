/** What it does on /scrape/: the four cards' controls, the cost calculator and the hand-off of a reader's own URL to
 * the free tool page. Each works on the recorded runs in scrapeRun.ts; nothing here calls an API, except that the
 * Evidence Record card hashes the recorded page's bytes (a copy served from this site) in the reader's browser. */
import { choose, current } from './scrapeState'
import { PAGE, RUN, WHOLE_TOKENS } from './scrapeRun'

const SAMPLE = '/samples/books-toscrape-a-light-in-the-attic.html.txt'
const NOISE = '0123456789abcdef'
const still = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Clean Markdown: main content or the whole page. The whole page's extra lines arrive one by one. */
function mountClean(card: HTMLElement): void {
  const buttons = [...card.querySelectorAll<HTMLButtonElement>('[data-scope]')]
  const extra = [...card.querySelectorAll<HTMLElement>('.is-extra')]
  const tokens = card.querySelector<HTMLElement>('[data-tokens]')
  const set = (whole: boolean): void => {
    buttons.forEach((b) => b.setAttribute('aria-checked', String((b.dataset.scope === 'whole') === whole)))
    extra.forEach((line, i) => {
      if (whole) window.setTimeout(() => { line.hidden = false; line.classList.add('is-arriving') }, still() ? 0 : i * 60)
      else { line.hidden = true; line.classList.remove('is-arriving') }
    })
    if (tokens) tokens.textContent = String(whole ? WHOLE_TOKENS : RUN.contentTokens)
    choose({ whole })
  }
  buttons.forEach((b) => b.addEventListener('click', () => set(b.dataset.scope === 'whole')))
  card.querySelector('.ft-switch')?.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key
    if (key !== 'ArrowRight' && key !== 'ArrowLeft') return
    event.preventDefault()
    const whole = !current().whole
    set(whole)
    buttons.find((b) => (b.dataset.scope === 'whole') === whole)?.focus()
  })
}

/** Checked fields: each chip asks for a field; one the page doesn't state arrives as null with its reason. */
function mountFields(card: HTMLElement): void {
  const chips = [...card.querySelectorAll<HTMLButtonElement>('.ft-chip')]
  const lines = new Map([...card.querySelectorAll<HTMLElement>('.ft-field')].map((line) => [line.dataset.field!, line]))
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const on = chip.getAttribute('aria-pressed') !== 'true'
    chip.setAttribute('aria-pressed', String(on))
    const line = lines.get(chip.dataset.field!)
    if (line) {
      line.hidden = !on
      line.classList.toggle('is-arriving', on)
    }
    choose({ fields: chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.field!), fieldsTouched: true })
  }))
}

/** The hard ones: three recorded runs behind tabs; a run's facts arrive in turn. */
function mountHard(card: HTMLElement): void {
  const tabs = [...card.querySelectorAll<HTMLButtonElement>('.ft-tab')]
  const panes = [...card.querySelectorAll<HTMLElement>('.ft-hard')]
  const show = (id: string, focus = false): void => {
    tabs.forEach((t) => {
      const on = t.dataset.hard === id
      t.setAttribute('aria-selected', String(on))
      t.tabIndex = on ? 0 : -1
      if (on && focus) t.focus()
    })
    panes.forEach((p) => {
      p.hidden = p.dataset.hard !== id
      if (!p.hidden) {
        p.classList.remove('is-playing')
        void p.offsetWidth
        p.classList.add('is-playing')
      }
    })
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(tab.dataset.hard!))
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      show(tabs[(i + step + tabs.length) % tabs.length]!.dataset.hard!, true)
    })
  })
  new IntersectionObserver(([entry], observer) => {
    if (!entry?.isIntersecting) return
    observer.disconnect()
    show(tabs[0]!.dataset.hard!)
  }, { threshold: 0.4 }).observe(card)
}

/** The Evidence Record: the page's bytes, as recorded, hashed here; change the price and the hash moves away from the
 * record's. */
function mountTamper(card: HTMLElement): void {
  const input = card.querySelector<HTMLInputElement>('#ft-price')
  const hash = card.querySelector<HTMLElement>('#ft-hash')
  const verdict = card.querySelector<HTMLElement>('#ft-verdict')
  const reset = card.querySelector<HTMLButtonElement>('#ft-reset')
  if (!input || !hash || !verdict) return
  const subtle = window.crypto?.subtle
  if (!subtle) {
    input.readOnly = true
    verdict.lastElementChild!.textContent = 'This browser can’t hash here; the record’s value is shown.'
    return
  }
  let bytes: Promise<Uint8Array> | undefined
  const load = (): Promise<Uint8Array> => (bytes ??= fetch(SAMPLE).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).then((b) => new Uint8Array(b)))
  const encoder = new TextEncoder()
  const before = encoder.encode(`<p class="price_color">`)
  const after = encoder.encode(`</p>`)
  /** Where the price sits in the bytes: after the first `<p class="price_color">`. */
  const find = (data: Uint8Array, needle: Uint8Array, from = 0): number => {
    outer: for (let i = from; i <= data.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (data[i + j] !== needle[j]) continue outer
      return i
    }
    return -1
  }
  let run = 0
  const update = async (): Promise<void> => {
    const mine = ++run
    let data: Uint8Array
    try { data = await load() } catch {
      verdict.lastElementChild!.textContent = 'The recorded page couldn’t be loaded here.'
      return
    }
    const start = find(data, before) + before.length
    const end = find(data, after, start)
    if (start < before.length || end < 0) return
    const edited = new Uint8Array([...data.subarray(0, start), ...encoder.encode(input.value), ...data.subarray(end)])
    const digest = [...new Uint8Array(await subtle.digest('SHA-256', edited))].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (mine !== run) return
    const match = digest === RUN.rawSha256
    card.classList.toggle('is-tampered', !match)
    verdict.className = `ft-verdict ${match ? 'is-match' : 'is-mismatch'}`
    verdict.firstElementChild!.textContent = match ? '✓' : '✗'
    verdict.lastElementChild!.textContent = match ? 'Matches: this is the page that was read.' : 'Doesn’t match: this is not the page that was read.'
    if (reset) reset.hidden = match
    // The new hash decodes in from noise, its changed characters marked.
    const mark = (shown: string): string => [...shown].map((ch, i) => (ch !== RUN.rawSha256[i] ? `<b>${ch}</b>` : ch)).join('')
    if (still()) return void (hash.innerHTML = mark(digest))
    const t0 = performance.now()
    const tick = (now: number): void => {
      if (mine !== run) return
      const t = Math.min(1, (now - t0) / 420)
      const n = Math.floor(digest.length * t)
      hash.innerHTML = mark(digest.slice(0, n)) + [...digest.slice(n)].map((_, i) => NOISE[(i * 7 + Math.floor(now / 30)) % 16]).join('')
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  input.addEventListener('focus', () => void load().catch(() => {}), { once: true })
  input.addEventListener('input', () => void update())
  reset?.addEventListener('click', () => {
    input.value = PAGE.price
    void update()
    input.focus()
  })
}

/** The calculator: pages a month on a log scale from 100 to 100,000, and the share that needs a browser. */
function mountCost(form: HTMLFormElement): void {
  const pages = form.querySelector<HTMLInputElement>('#cs-pages')
  const browser = form.querySelector<HTMLInputElement>('#cs-browser')
  const pagesOut = form.querySelector<HTMLOutputElement>('#cs-pages-out')
  const browserOut = form.querySelector<HTMLOutputElement>('#cs-browser-out')
  const total = form.querySelector<HTMLOutputElement>('#cs-total')
  const bar = form.querySelector<HTMLProgressElement>('#cs-bar')
  const verdict = form.querySelector<HTMLElement>('#cs-verdict')
  if (!pages || !browser || !total || !bar || !verdict) return
  const nice = (n: number): number => {
    const step = n < 1000 ? 50 : n < 10000 ? 500 : 5000
    return Math.max(100, Math.round(n / step) * step)
  }
  const update = (): void => {
    const count = nice(10 ** (2 + (3 * Number(pages.value)) / 100))
    const share = Number(browser.value) / 100
    const credits = Math.round(count * (1 - share) + count * share * 5)
    for (const range of [pages, browser]) range.style.setProperty('--fill', `${range.value}%`)
    if (pagesOut) pagesOut.value = count.toLocaleString('en-US')
    if (browserOut) browserOut.value = `${Math.round(share * 100)}%`
    total.value = credits.toLocaleString('en-US')
    bar.value = Math.min(credits, 1000)
    bar.textContent = `${credits.toLocaleString('en-US')} of 1,000`
    form.classList.toggle('is-over', credits > 1000)
    const keyless = share === 0 && count <= 600
    verdict.innerHTML = credits <= 1000
      ? `Fits a free account’s 1,000 credits a month.${keyless ? ' Or no account at all: 20 pages a day without a key.' : ''}`
      : `${(credits - 1000).toLocaleString('en-US')} credits more than a free account’s 1,000. Credit packs aren’t sold yet: run Octocrawl on your own computer, with no limit, or <a href="/docs/contact/">tell us what you need</a>.`
  }
  pages.addEventListener('input', update)
  browser.addEventListener('input', update)
  form.addEventListener('submit', (event) => event.preventDefault())
  update()
}

/** A reader's own URL goes to the free tool page, which runs it once: the hand-off is marked in this tab's session
 * storage, so a link from elsewhere only fills the box. */
function mountTry(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>('#tr-url')
  form.addEventListener('submit', (event) => {
    if (!input) return
    let url = input.value.trim()
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
    try { new URL(url) } catch {
      event.preventDefault()
      input.setCustomValidity('Enter a public page’s URL.')
      input.reportValidity()
      return
    }
    event.preventDefault()
    try { sessionStorage.setItem('w2l:handoff', url) } catch { /* It only fills the box then. */ }
    window.location.assign(`/tools/url-to-markdown/?url=${encodeURIComponent(url)}`)
  })
  input?.addEventListener('input', () => input.setCustomValidity(''))
}

/** Cards rise in as they come into view. */
function mountReveal(root: HTMLElement): void {
  const cards = [...root.querySelectorAll<HTMLElement>('.ft-card, .cd-window, .cs-calc, .tr-window')]
  if (still() || !('IntersectionObserver' in window)) return
  root.classList.add('is-revealing')
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-in')
      observer.unobserve(entry.target)
    }
  }, { threshold: 0.15 })
  cards.forEach((card) => observer.observe(card))
}

export function mountScrapeFeatures(root: HTMLElement): void {
  const clean = root.querySelector<HTMLElement>('.ft-clean')
  if (clean) mountClean(clean)
  const fields = root.querySelector<HTMLElement>('.ft-fields')
  if (fields) mountFields(fields)
  const hard = root.querySelector<HTMLElement>('.ft-hardcard')
  if (hard) mountHard(hard)
  const tamper = root.querySelector<HTMLElement>('.ft-evidence')
  if (tamper) mountTamper(tamper)
  const cost = root.querySelector<HTMLFormElement>('#cs-calc')
  if (cost) mountCost(cost)
  const tryForm = root.querySelector<HTMLFormElement>('#tr-form')
  if (tryForm) mountTry(tryForm)
  mountReveal(root)
}
