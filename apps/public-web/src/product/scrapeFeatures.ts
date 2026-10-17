/** The controls on /scrape/: the hero's three recorded scrapes, the harder pages, the Evidence Record's hash check and
 * the hand-off of a reader's own URL to the free tool page. Each works on the recorded runs in scrapeRun.ts; nothing
 * here calls an API, except that the Evidence Record section hashes the recorded docs page's bytes (a copy served from
 * this site) in the reader's browser. */
import { DOCS, DOCS_CELL, DOCS_SAMPLE } from './scrapeRun'

const NOISE = '0123456789abcdef'
const still = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Tabs with arrow keys: show(id) for the one picked. */
function tabbed(tabs: HTMLButtonElement[], key: string, show: (id: string) => void): void {
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(tab.dataset[key]!))
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      const next = tabs[(i + step + tabs.length) % tabs.length]!
      show(next.dataset[key]!)
      next.focus()
    })
  })
}

/** The hero: one recorded scrape per tab. */
function mountDemo(console_: HTMLElement): void {
  const tabs = [...console_.querySelectorAll<HTMLButtonElement>('.pd-tab')]
  const panes = [...console_.querySelectorAll<HTMLElement>('.dm-pane')]
  tabbed(tabs, 'demo', (id) => {
    tabs.forEach((t) => {
      const on = t.dataset.demo === id
      t.setAttribute('aria-selected', String(on))
      t.tabIndex = on ? 0 : -1
    })
    panes.forEach((p) => { p.hidden = p.dataset.demo !== id })
  })
}

/** The hard ones: three recorded runs behind tabs; a run's facts arrive in turn. */
function mountHard(card: HTMLElement): void {
  const tabs = [...card.querySelectorAll<HTMLButtonElement>('.ft-tab')]
  const panes = [...card.querySelectorAll<HTMLElement>('.ft-hard')]
  const show = (id: string): void => {
    tabs.forEach((t) => {
      const on = t.dataset.hard === id
      t.setAttribute('aria-selected', String(on))
      t.tabIndex = on ? 0 : -1
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
  // The first tab plays when the card comes into view, unless the reader has picked one by then.
  let picked = false
  tabbed(tabs, 'hard', (id) => { picked = true; show(id) })
  new IntersectionObserver(([entry], observer) => {
    if (!entry?.isIntersecting) return
    observer.disconnect()
    if (!picked) show(tabs[0]!.dataset.hard!)
  }, { threshold: 0.4 }).observe(card)
}

/** The Evidence Record: the docs page's bytes, as recorded, hashed here once the section is in view; change the cell
 * and the hash moves away from the record's. Until a digest is computed, or when one can't be, nothing claims a match. */
function mountTamper(card: HTMLElement): void {
  const input = card.querySelector<HTMLInputElement>('#ft-cell')
  const hash = card.querySelector<HTMLElement>('#ft-hash')
  const verdict = card.querySelector<HTMLElement>('#ft-verdict')
  const reset = card.querySelector<HTMLButtonElement>('#ft-reset')
  if (!input || !hash || !verdict) return
  const subtle = window.crypto?.subtle
  const fail = (text: string): void => {
    verdict.className = 'ft-verdict is-failed'
    verdict.firstElementChild!.textContent = '!'
    verdict.lastElementChild!.textContent = text
    hash.textContent = 'not computed'
    card.classList.remove('is-tampered')
    if (reset) reset.hidden = true
  }
  if (!subtle) {
    input.readOnly = true
    fail('This browser can’t compute SHA-256 here, so nothing was hashed.')
    return
  }
  let bytes: Promise<Uint8Array> | undefined
  const load = (): Promise<Uint8Array> => (bytes ??= fetch(DOCS_SAMPLE).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).then((b) => new Uint8Array(b)))
  const encoder = new TextEncoder()
  const marker = encoder.encode(DOCS_CELL.before + DOCS_CELL.value + DOCS_CELL.after)
  const skip = encoder.encode(DOCS_CELL.before).length
  const length = encoder.encode(DOCS_CELL.value).length
  /** Where the cell sits in the bytes: inside the only run of before, value and after. */
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
      if (mine === run) fail('The recorded page couldn’t be loaded here, so nothing was hashed.')
      return
    }
    const at = find(data, marker)
    if (at < 0) return void (mine === run && fail('The recorded page isn’t the expected copy, so nothing was hashed.'))
    const start = at + skip
    const end = start + length
    const cell = encoder.encode(input.value)
    const edited = new Uint8Array(start + cell.length + data.length - end)
    edited.set(data.subarray(0, start))
    edited.set(cell, start)
    edited.set(data.subarray(end), start + cell.length)
    const digest = [...new Uint8Array(await subtle.digest('SHA-256', edited))].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (mine !== run) return
    const match = digest === DOCS.rawSha256
    hash.classList.remove('is-pending')
    card.classList.toggle('is-tampered', !match)
    verdict.className = `ft-verdict ${match ? 'is-match' : 'is-mismatch'}`
    verdict.firstElementChild!.textContent = match ? '✓' : '✗'
    verdict.lastElementChild!.textContent = match ? 'Matches: this is the page that was read.' : 'Doesn’t match: this is not the page that was read.'
    if (reset) reset.hidden = match
    // The new hash decodes in from noise, its changed characters marked.
    const mark = (shown: string): string => [...shown].map((ch, i) => (ch !== DOCS.rawSha256[i] ? `<b>${ch}</b>` : ch)).join('')
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
  input.addEventListener('input', () => void update())
  if (!('IntersectionObserver' in window)) void update()
  else new IntersectionObserver(([entry], observer) => {
    if (!entry?.isIntersecting) return
    observer.disconnect()
    void update()
  }, { rootMargin: '200px' }).observe(card)
  reset?.addEventListener('click', () => {
    input.value = DOCS_CELL.value
    void update()
    input.focus()
  })
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
  const cards = [...root.querySelectorAll<HTMLElement>('.sc-grid > :last-child, .rn-wrap, .tr-window')]
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
  const demo = root.querySelector<HTMLElement>('.dm-console')
  if (demo) mountDemo(demo)
  const hard = root.querySelector<HTMLElement>('.hd-window')
  if (hard) mountHard(hard)
  const tamper = root.querySelector<HTMLElement>('#ft-tamper')
  if (tamper) mountTamper(tamper)
  const tryForm = root.querySelector<HTMLFormElement>('#tr-form')
  if (tryForm) mountTry(tryForm)
  mountReveal(root)
}
