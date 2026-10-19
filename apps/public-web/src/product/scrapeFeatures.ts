/** The controls on /scrape/: the hero's three recorded scrapes, the Evidence Record's hash check and
 * the hand-off of a reader's own URL to the free tool page. Each works on the recorded runs in scrapeRun.ts; nothing
 * here calls an API, except that the Evidence Record section hashes the recorded docs page's bytes (a copy served from
 * this site) in the reader's browser. */
import { mountDrop, type Drop } from './scrapeDrop'
import { scrollPageTo } from '../smoothScroll'
import { foldedText } from './scrapeMarkdown'
import { DEMOS, DOCS, DOCS_CELL, DOCS_SAMPLE } from './scrapeRun'

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

/** The hero: one recorded scrape per tab. Each pane's read plays (scrapeDrop.ts) the first time it shows on screen and
 * again on Play again; with reduced motion the results just show. */
function mountDemo(console_: HTMLElement, replay: HTMLButtonElement | null, hint: HTMLAnchorElement | null): void {
  const tabs = [...console_.querySelectorAll<HTMLButtonElement>('.dm-tab')]
  const panes = [...console_.querySelectorAll<HTMLElement>('.dm-pane')]
  const drops = new Map<string, Drop>()
  const played = new Set<string>()
  let onScreen = false
  let current = tabs[0]?.dataset.demo ?? ''
  if (!still()) {
    for (const pane of panes) {
      const out = pane.querySelector<HTMLElement>('.dm-out')
      const id = pane.dataset.demo!
      const demo = DEMOS.find((d) => d.id === id)
      const drop = out && demo ? mountDrop(out, demo.rawHead, foldedText(demo.markdownHead), () => { if (replay) replay.hidden = false }) : null
      if (drop) drops.set(id, drop)
    }
  }
  const fits = (): boolean => console_.getBoundingClientRect().height <= window.innerHeight
  /** The current pane waits for its read as raw HTML only while the window fits the screen and it has not played. */
  function settle(): void {
    if (played.has(current)) return
    if (fits()) drops.get(current)?.prime()
    else drops.get(current)?.stop()
  }
  const play = (id: string): void => {
    if (!onScreen || played.has(id)) return
    played.add(id)
    if (hint) hint.hidden = true
    drops.get(id)?.play()
  }
  tabbed(tabs, 'demo', (id) => {
    tabs.forEach((t) => {
      const on = t.dataset.demo === id
      t.setAttribute('aria-selected', String(on))
      t.tabIndex = on ? 0 : -1
    })
    drops.get(current)?.stop()
    panes.forEach((p) => { p.hidden = p.dataset.demo !== id })
    current = id
    settle()
    play(id)
  })
  replay?.addEventListener('click', () => {
    played.delete(current)
    play(current)
  })
  if (!drops.size || !('IntersectionObserver' in window)) return
  // The read plays once the whole window is in sight, so its landing is seen; until then the pane shows the raw HTML
  // waiting to be read. A screen too short to hold the window (or one that became so, turned on its side) shows the
  // Markdown and plays it on a tab or Play again.
  window.addEventListener('resize', settle)
  settle()
  // While the first read waits below the fold, a cue at the foot of the screen says to scroll down to it; a click
  // brings the whole window into view. It goes once a read has played.
  hint?.addEventListener('click', (event) => {
    event.preventDefault()
    const box = console_.getBoundingClientRect()
    scrollPageTo(window.scrollY + box.top - Math.max(0, (window.innerHeight - box.height) / 2))
  })
  new IntersectionObserver(([entry]) => {
    settle()
    onScreen = Boolean(entry?.isIntersecting) && (entry!.intersectionRatio >= 0.85 || !fits())
    // Only while the window lies below: a page restored further down has nothing to scroll down to.
    if (hint) hint.hidden = played.size > 0 || onScreen || !fits() || !entry || entry.boundingClientRect.top <= 0
    if (onScreen && fits()) play(current)
  }, { threshold: [0, 0.85] }).observe(console_)
}

/** The Evidence Record's check (scrapePage.ts evidence): the docs page's bytes, as recorded, hashed here, and the
 * digest set digit by digit under the record's own fingerprint. Change the cell and the hash moves: its digits decode
 * afresh, the ones that now differ from the record's flip red and are counted, and the record shakes; put it back and
 * they settle green. The stage (evidenceStage.ts) asks for the check with ev:check when its beat comes, and for the
 * bytes early with ev:prefetch; without the stage the check runs when it comes into view. Pointing at a digit marks the
 * one in the same place in the other fingerprint. Until a digest is computed, or when one can't be, nothing claims a
 * match. */
function mountTamper(card: HTMLElement): void {
  const input = card.querySelector<HTMLInputElement>('#ft-cell')
  const verdict = card.querySelector<HTMLElement>('#ft-verdict')
  const reset = card.querySelector<HTMLButtonElement>('#ft-reset')
  const live = card.querySelector<HTMLElement>('#ev-live')
  const cells = [...card.querySelectorAll<HTMLElement>('#ev-hash-here i')]
  const section = card.closest<HTMLElement>('#evidence-record')
  const panel = card.closest<HTMLElement>('.ev-panel')
  if (!input || !verdict || cells.length !== 64) return
  let run = 0
  /** The verdict in a line, and in full for a screen reader when the reader changed the cell. */
  let announce = false
  const say = (state: 'match' | 'mismatch' | 'failed', mark: string, text: string, spoken = text): void => {
    verdict.className = `ft-verdict is-${state}`
    verdict.firstElementChild!.textContent = mark
    verdict.lastElementChild!.textContent = text
    if (live && announce) live.textContent = spoken
  }
  const subtle = window.crypto?.subtle
  const fail = (text: string): void => {
    say('failed', '!', text)
    cells.forEach((cell) => {
      cell.textContent = '·'
      cell.className = ''
    })
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
  /** The digest into the grid, decoding from noise from the left; then each digit marked as the record's or moved. */
  const show = (digest: string, mine: number): void => {
    const record = DOCS.rawSha256
    const moved = [...digest].filter((ch, i) => ch !== record[i]).length
    const settle = (): void => {
      cells.forEach((cell, i) => {
        cell.textContent = digest[i]!
        cell.className = `is-locked ${digest[i] === record[i] ? 'is-same' : 'is-diff'}`
      })
      if (moved) say('mismatch', '✗', `${moved} of 64 digits moved.`, `${moved} of 64 digits moved: this is not the page that was read.`)
      else say('match', '✓', 'Matches the record, digit for digit.', 'Matches the record, digit for digit: these are the bytes that were read.')
      if (reset) reset.hidden = !moved
      if (still()) return
      // The digits that moved flip in one after another; a match sweeps green from the left.
      void card.offsetWidth
      cells.forEach((cell, i) => {
        if (moved && digest[i] === record[i]) return
        cell.style.animationDelay = `${i * (moved ? 7 : 9)}ms`
        cell.classList.add(moved ? 'is-flip' : 'is-sweep')
      })
      if (moved && panel) {
        panel.classList.remove('is-shake')
        void panel.offsetWidth
        panel.classList.add('is-shake')
      }
    }
    if (still()) return settle()
    const start = performance.now()
    const tick = (now: number): void => {
      if (mine !== run) return
      const t = Math.min(1, (now - start) / 480)
      const locked = Math.floor(cells.length * t)
      cells.forEach((cell, i) => {
        cell.textContent = i < locked ? digest[i]! : NOISE[Math.floor(Math.random() * 16)]!
        cell.className = i < locked ? 'is-locked' : ''
      })
      if (t < 1) requestAnimationFrame(tick)
      else settle()
    }
    requestAnimationFrame(tick)
  }
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
    show(digest, mine)
  }
  input.addEventListener('input', () => {
    announce = true
    void update()
  })
  section?.addEventListener('ev:prefetch', () => void load().catch(() => { /* The check says so when it runs. */ }))
  section?.addEventListener('ev:check', () => void update())
  new IntersectionObserver(([entry], observer) => {
    // On the stage the check waits for its beat (ev:check).
    if (!entry?.isIntersecting || section?.classList.contains('is-staged')) return
    observer.disconnect()
    void update()
  }, { rootMargin: '200px' }).observe(card)
  reset?.addEventListener('click', () => {
    input.value = DOCS_CELL.value
    announce = true
    void update()
    input.focus()
  })
  // Pointing at a digit marks the one in the same place in the other fingerprint.
  const peers = (target: EventTarget | null, on: boolean): void => {
    const digit = target instanceof Element ? target.closest<HTMLElement>('.ev-hash i') : null
    if (!digit || !panel) return
    for (const twin of panel.querySelectorAll<HTMLElement>(`.ev-hash i[data-i="${digit.dataset.i}"]`)) twin.classList.toggle('is-peer', on)
  }
  panel?.addEventListener('pointerover', (event) => peers(event.target, true))
  panel?.addEventListener('pointerout', (event) => peers(event.target, false))
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
  const demo = root.querySelector<HTMLElement>('.dm-window')
  if (demo) mountDemo(demo, root.querySelector<HTMLButtonElement>('#dm-replay'), root.querySelector<HTMLAnchorElement>('#pd-scroll'))
  const tamper = root.querySelector<HTMLElement>('#ft-tamper')
  if (tamper) mountTamper(tamper)
  const tryForm = root.querySelector<HTMLFormElement>('#tr-form')
  if (tryForm) mountTry(tryForm)
  mountReveal(root)
}
