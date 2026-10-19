/** The Evidence Record as a stage (scrapePage.ts evidence). On wide screens the section holds still while the page
 * scrolls through its track (product.css .is-staged), and how far through it the reader is picks one of five beats
 * (data-beat), each step on the left opening in turn:
 *
 * 0. Where it came from: the record's header decodes, its badge says it is reading, and the URL prints in.
 * 1. When, and was it allowed: the time rolls into place digit by digit, HTTP 200 and Allowed pop up, the first of the
 *    four steps lights, and the badge turns to success.
 * 2. A fingerprint of every byte: the page's own HTML runs past, the byte count runs up, and the SHA-256 decodes.
 * 3. Even a refusal: the receipt steps back and the record of a page Octocrawl wouldn't read comes in front.
 * 4. Check it yourself: the refusal drops away, the receipt folds to its fingerprint, and the check opens under it,
 *    hashing the page's bytes in the reader's browser (scrapeFeatures.ts, on ev:check).
 *
 * Going forward a beat plays it; going back undoes it; a jump (a reload part way down, a fast scroll) shows the beats
 * it passes as they end. On narrow screens nothing holds still: each record writes itself as it comes into view. The
 * stack of records leans a little towards a mouse, under a soft glare, except while its cell is being edited. With
 * reduced motion none of this runs and everything shows as it is. */

const BEATS = 5
/** How long the stage holds still, in window heights beyond its own. */
const TRACK = 2.4
/** The first beat starts a little before the stage pins, as it arrives. */
const LEAD = 0.05
const HEX = '0123456789abcdef'
const NOISE = '#%&*+=<>/0123456789abcdef'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const easeOut = (t: number): number => 1 - (1 - t) ** 3
const pick = (from: string): string => from[Math.floor(Math.random() * from.length)]!

export function mountEvidenceStage(section: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
  const band = section.querySelector<HTMLElement>('.band')
  const frame = section.querySelector<HTMLElement>('.ev-frame')
  const stack = section.querySelector<HTMLElement>('.ev-stack')
  const read = section.querySelector<HTMLElement>('.ev-read')
  const refused = section.querySelector<HTMLElement>('.ev-refused')
  const site = read?.querySelector<HTMLElement>('.ev-site')
  const status = read?.querySelector<HTMLElement>('#ev-status')
  const count = read?.querySelector<HTMLElement>('.ev-count')
  const print = read?.querySelector<HTMLElement>('.ev-print')
  const grid = read?.querySelector<HTMLElement>('.ev-hash.is-record')
  const pips = read?.querySelector<HTMLElement>('.ev-pips')
  const steps = [...section.querySelectorAll<HTMLElement>('.ev-step')]
  if (!band || !frame || !stack || !read || !refused || !site || !status || !count || !print || !grid || !pips || steps.length !== BEATS) return

  const siteText = site.textContent ?? ''
  const statusText = status.textContent ?? ''
  const total = Number((count.textContent ?? '0').replace(/\D/g, ''))
  const cells = [...grid.querySelectorAll<HTMLElement>('i')]
  const hash = cells.map((cell) => cell.textContent ?? '').join('')
  const digits = [...read.querySelectorAll<HTMLElement>('.ev-digit-col')]
  const rows = (panel: HTMLElement, beat: number): HTMLElement[] => [...panel.querySelectorAll<HTMLElement>(`.ev-row[data-beat="${beat}"], .ev-foot[data-beat="${beat}"]`)]
  const badgesOf = (beat: number): HTMLElement[] => rows(read, beat).flatMap((row) => [...row.querySelectorAll<HTMLElement>('.ev-badge')])

  // The section on a stage that holds still while the page scrolls through a track as long as the beats (wide screens
  // only; product.css).
  section.classList.add('is-live')
  const track = document.createElement('div')
  track.className = 'ev-track'
  const stage = document.createElement('div')
  stage.className = 'ev-stage'
  band.replaceWith(track)
  stage.append(band)
  track.append(stage)

  /** Each beat's run: its timers, and an id its animation frames check, so ending or undoing a beat stops them. */
  const runs = Array.from({ length: BEATS }, () => ({ id: 0, timers: [] as number[] }))
  const begin = (beat: number): (() => boolean) => {
    const run = runs[beat]!
    run.timers.splice(0).forEach((timer) => window.clearTimeout(timer))
    const id = ++run.id
    return () => run.id === id
  }
  const later = (beat: number, ms: number, fn: () => void): void => {
    runs[beat]!.timers.push(window.setTimeout(fn, ms))
  }

  /** A row in: printed from the left behind a glowing head after `delay` ms, or at once. */
  const show = (el: HTMLElement, delay: number | null): void => {
    el.style.setProperty('--ev-delay', `${delay ?? 0}ms`)
    el.classList.add('is-on')
    el.classList.toggle('is-printing', delay !== null)
  }
  const hide = (el: HTMLElement): void => {
    el.style.setProperty('--ev-delay', '0ms')
    el.classList.remove('is-on', 'is-printing')
  }
  /** A badge or the first of the steps popping up after `delay` ms. */
  const pop = (el: HTMLElement, delay: number): void => {
    el.classList.remove('is-pop', 'is-pulse')
    void el.offsetWidth
    el.style.setProperty('--ev-pop-delay', `${delay}ms`)
    el.classList.add(el === pips ? 'is-pulse' : 'is-pop')
  }
  const setStatus = (state: 'waiting' | 'reading' | 'read', popIn = false): void => {
    status.classList.remove('is-ok', 'is-plain', 'is-busy', 'is-pop')
    status.textContent = state === 'read' ? statusText : state === 'reading' ? 'reading…' : 'waiting'
    status.classList.add(state === 'read' ? 'is-ok' : 'is-plain')
    if (state === 'reading') status.classList.add('is-busy')
    if (popIn) pop(status, 0)
  }
  /** Text that turns over through noise, settling from the left. */
  const decode = (el: HTMLElement, text: string, ms: number, alive: () => boolean): void => {
    const start = performance.now()
    const tick = (now: number): void => {
      if (!alive()) return
      const t = clamp01((now - start) / ms)
      const settled = Math.floor(text.length * easeOut(t))
      el.textContent = text.slice(0, settled) + [...text.slice(settled)].map((ch) => (ch === ' ' ? ' ' : pick(NOISE))).join('')
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  /** The time's digits rolling up into place, one after another; or set at once. */
  const roll = (animate: boolean): void => {
    for (const col of digits) {
      col.classList.remove('is-rolling')
      col.style.transitionDelay = '0ms'
      col.style.setProperty('--n', animate ? '10' : '0')
    }
    if (!animate) return
    void read.offsetWidth
    digits.forEach((col, k) => {
      col.style.transitionDelay = `${140 + k * 45}ms`
      col.classList.add('is-rolling')
      col.style.setProperty('--n', '0')
    })
  }
  const finalGrid = (): void => {
    grid.classList.remove('is-hidden', 'is-decoding')
    cells.forEach((cell, i) => {
      cell.textContent = hash[i]!
      cell.classList.remove('is-locked')
    })
  }
  /** The fingerprint decoding, its digits settling roughly from the left. */
  const decodeGrid = (ms: number, alive: () => boolean): void => {
    grid.classList.remove('is-hidden')
    grid.classList.add('is-decoding')
    const at = cells.map((_, i) => (i / cells.length) * 0.7 + Math.random() * 0.3)
    const start = performance.now()
    const tick = (now: number): void => {
      if (!alive()) return
      const t = clamp01((now - start) / ms)
      cells.forEach((cell, i) => {
        const done = t >= at[i]!
        cell.textContent = done ? hash[i]! : pick(HEX)
        cell.classList.toggle('is-locked', done)
      })
      if (t < 1) requestAnimationFrame(tick)
      else finalGrid()
    }
    requestAnimationFrame(tick)
  }
  const countUp = (ms: number, alive: () => boolean): void => {
    const start = performance.now()
    const tick = (now: number): void => {
      if (!alive()) return
      const t = clamp01((now - start) / ms)
      count.textContent = Math.round(total * easeOut(t)).toLocaleString('en-US')
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /** Each beat played, ended at once, or undone. */
  const play = (beat: number): void => {
    const alive = begin(beat)
    if (beat === 0) {
      setStatus('reading', true)
      decode(site, siteText, 600, alive)
      later(0, 650, () => { site.textContent = siteText })
      rows(read, 0).forEach((row) => show(row, 200))
    } else if (beat === 1) {
      rows(read, 1).forEach((row, i) => show(row, i * 160))
      roll(true)
      badgesOf(1).forEach((badge, i) => pop(badge, 900 + i * 110))
      pop(pips, 1050)
      later(1, 1150, () => setStatus('read', true))
    } else if (beat === 2) {
      section.dispatchEvent(new CustomEvent('ev:prefetch'))
      show(print, 0)
      print.classList.add('is-streaming')
      grid.classList.add('is-hidden')
      countUp(1300, alive)
      later(2, 650, () => decodeGrid(900, alive))
      later(2, 1500, () => print.classList.remove('is-streaming'))
      rows(read, 2).filter((el) => el !== print).forEach((el) => show(el, 1100))
    } else if (beat === 3) {
      rows(refused, 3).forEach((row, i) => show(row, 300 + i * 120))
    } else {
      later(4, 300, () => section.dispatchEvent(new CustomEvent('ev:check')))
    }
  }
  const settle = (beat: number): void => {
    begin(beat)
    if (beat === 0) {
      site.textContent = siteText
      setStatus('reading')
      rows(read, 0).forEach((row) => show(row, null))
    } else if (beat === 1) {
      rows(read, 1).forEach((row) => show(row, null))
      roll(false)
      badgesOf(1).forEach((badge) => badge.classList.remove('is-pop'))
      pips.classList.remove('is-pulse')
      setStatus('read')
    } else if (beat === 2) {
      print.classList.remove('is-streaming')
      rows(read, 2).forEach((row) => show(row, null))
      count.textContent = total.toLocaleString('en-US')
      finalGrid()
    } else if (beat === 3) {
      rows(refused, 3).forEach((row) => show(row, null))
    } else {
      section.dispatchEvent(new CustomEvent('ev:check'))
    }
  }
  const undo = (beat: number): void => {
    begin(beat)
    if (beat === 0) {
      site.textContent = siteText
      setStatus('waiting')
      rows(read, 0).forEach(hide)
    } else if (beat === 1) {
      rows(read, 1).forEach(hide)
      roll(false)
      setStatus('reading')
    } else if (beat === 2) {
      print.classList.remove('is-streaming')
      rows(read, 2).forEach(hide)
      count.textContent = total.toLocaleString('en-US')
      finalGrid()
    } else if (beat === 3) {
      rows(refused, 3).forEach(hide)
    }
  }

  // Wide screens: the beat follows the scroll through the track.
  let beat = -1
  let first = true
  const go = (next: number, instant: boolean): void => {
    if (next === beat) return
    if (next > beat) {
      for (let b = Math.max(0, beat); b < next; b++) settle(b)
      if (instant) settle(next)
      else play(next)
    } else {
      for (let b = beat; b > next; b--) undo(b)
      if (next >= 0) settle(next)
    }
    beat = next
    section.dataset.beat = String(beat)
    steps.forEach((step, i) => step.classList.toggle('is-active', i === Math.max(0, beat)))
  }
  const wide = window.matchMedia('(min-width: 1001px)')
  let staged = false
  let queued = 0
  const update = (): void => {
    queued = 0
    if (!staged) return
    const box = track.getBoundingClientRect()
    const at = -box.top / Math.max(1, box.height - window.innerHeight)
    frame.style.setProperty('--ev-pan', `${((Math.min(1.2, Math.max(-0.2, at)) - 0.5) * 40).toFixed(1)}px`)
    const next = at < -LEAD ? -1 : Math.min(BEATS - 1, Math.floor(((at + LEAD) / (1 + LEAD)) * BEATS))
    // Arriving part way down (a reload, a link) shows the beats passed as they end; scrolling into them plays them.
    go(next, first && next > 0)
    first = false
  }
  const queue = (): void => {
    if (!queued) queued = requestAnimationFrame(update)
  }

  // Narrow screens: each record writes itself as it comes into view, the receipt's first three beats in turn.
  const shown = new Set<Element>()
  const narrow = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (staged || !entry.isIntersecting || shown.has(entry.target)) continue
      shown.add(entry.target)
      if (entry.target === refused) {
        play(3)
        continue
      }
      play(0)
      window.setTimeout(() => !staged && (settle(0), play(1)), 1000)
      window.setTimeout(() => !staged && (settle(1), play(2)), 2400)
    }
  }, { threshold: 0.3 })
  narrow.observe(read)
  narrow.observe(refused)

  /** The stage keeps one size through its beats: the stack is held at the height of its tallest, measured with nothing
   * moving. */
  const fit = (): void => {
    if (!staged) {
      stack.style.removeProperty('--ev-stack-h')
      return
    }
    const now = section.dataset.beat ?? '-1'
    section.classList.add('is-measuring')
    stack.style.removeProperty('--ev-stack-h')
    let tallest = 0
    for (const b of ['0', '4']) {
      section.dataset.beat = b
      tallest = Math.max(tallest, stack.offsetHeight)
    }
    section.dataset.beat = now
    stack.style.setProperty('--ev-stack-h', `${tallest}px`)
    void stack.offsetHeight
    section.classList.remove('is-measuring')
  }

  /** Switching between the two (a resize across 1000px): undo everything, then show it the new way. */
  const measure = (): void => {
    section.style.setProperty('--ev-track', `${Math.round(window.innerHeight * (1 + TRACK))}px`)
    const was = staged
    staged = wide.matches
    section.classList.toggle('is-staged', staged)
    fit()
    if (was === staged) return
    for (let b = BEATS - 1; b >= 0; b--) undo(b)
    beat = -1
    section.dataset.beat = '-1'
    if (staged) {
      first = true
      update()
      return
    }
    for (let b = 0; b < BEATS; b++) settle(b)
    shown.add(read)
    shown.add(refused)
  }

  // The stack leans a little towards a mouse under a soft glare; it sits flat while its cell is being edited.
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
  let pointer: { x: number; y: number } | null = null
  let leaning = 0
  const lean = (): void => {
    leaning = 0
    const editing = document.activeElement instanceof HTMLInputElement && stack.contains(document.activeElement)
    if (!pointer || editing) {
      for (const name of ['--ev-rx', '--ev-ry']) stack.style.setProperty(name, '0deg')
      stack.style.setProperty('--ev-glare', '0')
      return
    }
    const box = stack.getBoundingClientRect()
    const x = clamp01((pointer.x - box.left) / box.width) - 0.5
    const y = clamp01((pointer.y - box.top) / box.height) - 0.5
    stack.style.setProperty('--ev-ry', `${(x * 5).toFixed(2)}deg`)
    stack.style.setProperty('--ev-rx', `${(-y * 4).toFixed(2)}deg`)
    stack.style.setProperty('--ev-gx', `${((x + 0.5) * 100).toFixed(1)}%`)
    stack.style.setProperty('--ev-gy', `${((y + 0.5) * 100).toFixed(1)}%`)
    stack.style.setProperty('--ev-glare', '1')
  }
  const leanSoon = (): void => {
    if (!leaning) leaning = requestAnimationFrame(lean)
  }
  frame.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !fine.matches) return
    pointer = { x: event.clientX, y: event.clientY }
    leanSoon()
  })
  frame.addEventListener('pointerleave', () => {
    pointer = null
    leanSoon()
  })
  stack.addEventListener('focusin', leanSoon)
  stack.addEventListener('focusout', leanSoon)

  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', () => {
    measure()
    queue()
  })
  wide.addEventListener('change', () => {
    measure()
    queue()
  })
  measure()
  if (!staged) setStatus('waiting')
  update()
  void document.fonts?.ready.then(fit)
}
