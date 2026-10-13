/** The /scrape/ hero's stage: one recorded scrape (scrapeRun.ts) played on a drawing of the page. A scan runs down the
 * page; what the main content leaves out crumbles into glyphs, and what it keeps sends its own characters, cell by
 * cell along the glyph lattice, to the line it became, which decodes as they land. Then the stage tours the formats.
 * Pointing at a line lights the part of the page it came from, joined by a dotted trail, and pointing at the page
 * lights what came of it. Without a script the finished result shows; with reduced motion nothing travels. */

import { choose, type View } from './scrapeState'

const CELL = 12
const SCAN_MS = 2600
const HOP_MS = 22
const DECODE_MS = 320
const NOISE = '·:+×*#%=/\\<>'
const TOUR: ReadonlyArray<[view: string, wait: number]> = [['fields', 1800], ['table', 4200], ['evidence', 4200], ['markdown', 4600]]

type Packet = { chars: string; path: Array<[number, number]>; at: number; done?: () => void; landed?: boolean }
type Crumb = { x: number; y: number; ch: string; at: number; life: number; fall: number }

const reduce = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Whether a line from `line` belongs to the page part `part` (a table holds its rows, the breadcrumb its links, the
 * Evidence Record's hashes the whole page or all it kept). */
function related(line: string, part: string, kept: boolean): boolean {
  if (line === part) return true
  if (line === 'page') return true
  if (line === 'kept') return kept
  if (part === 'table') return line.startsWith('row-') || line === 'table'
  if (part === 'crumbs') return line.startsWith('crumb-')
  return false
}

export function mountScrapeStage(stage: HTMLElement): void {
  const page = stage.querySelector<HTMLElement>('.pd-page')
  const canvas = stage.querySelector<HTMLCanvasElement>('.pd-trail')
  const context = canvas?.getContext('2d')
  const replay = document.getElementById('pd-replay')
  if (!page || !canvas || !context) return
  const tabs = [...stage.querySelectorAll<HTMLButtonElement>('.pd-tab')]
  const panes = [...stage.querySelectorAll<HTMLElement>('.pd-pane')]
  const parts = [...page.querySelectorAll<HTMLElement>('[data-src]')]
  const blocks = [...page.querySelectorAll<HTMLElement>('.pd-b')]
  const partOf = (src: string): HTMLElement[] => src === 'page' ? [] : src === 'kept' ? blocks.filter((b) => !b.hasAttribute('data-drop')) : parts.filter((p) => p.dataset.src === src)
  const lines = (view: string): HTMLElement[] => [...(panes.find((p) => p.dataset.view === view)?.querySelectorAll<HTMLElement>('.has-src') ?? [])]

  let packets: Packet[] = []
  let crumbs: Crumb[] = []
  let trail: { from: HTMLElement; to: HTMLElement } | null = null
  let raf = 0
  let width = 0
  let height = 0
  let ratio = 1
  let playing = false
  let touring = 0
  let interacted = false
  let generation = 0

  const box = (el: Element): DOMRect => {
    const s = stage.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return new DOMRect(r.left - s.left, r.top - s.top, r.width, r.height)
  }
  const stacked = (): boolean => stage.clientWidth < 900

  function size(): void {
    ratio = Math.min(2, window.devicePixelRatio || 1)
    width = stage.clientWidth
    height = stage.clientHeight
    canvas!.width = Math.round(width * ratio)
    canvas!.height = Math.round(height * ratio)
  }

  /** A path on the glyph lattice from the right edge of a part of the page to the left edge of a line: out to the
   * gutter, along it, and in. Every point is a cell, so what travels on it moves the way glyphs do. */
  function route(from: Element, to: Element): Array<[number, number]> {
    const a = box(from)
    const b = box(to)
    const gutter = box(stage.querySelector('.pd-flow')!)
    const snap = (v: number): number => Math.round(v / CELL) * CELL
    const x0 = snap(Math.min(a.right + 6, gutter.left))
    const y0 = snap(a.top + Math.min(a.height / 2, 14))
    const xg = snap(gutter.left + gutter.width / 2)
    const pane = to.closest('.pd-pane')
    const p = pane ? box(pane) : b
    const y1 = snap(Math.max(p.top + 8, Math.min(p.bottom - 8, b.top + b.height / 2)))
    const x1 = snap(b.left + 30)
    const path: Array<[number, number]> = []
    for (let x = x0; x <= xg; x += CELL) path.push([x, y0])
    const dy = y1 > y0 ? CELL : -CELL
    for (let y = y0 + dy; dy > 0 ? y <= y1 : y >= y1; y += dy) path.push([xg, y])
    for (let x = xg + CELL; x <= x1; x += CELL) path.push([x, y1])
    return path
  }

  function draw(now: number): void {
    context!.setTransform(ratio, 0, 0, ratio, 0, 0)
    context!.clearRect(0, 0, width, height)
    context!.font = `600 11px ui-monospace, SFMono-Regular, Menlo, monospace`
    context!.textAlign = 'center'
    context!.textBaseline = 'middle'
    if (trail) {
      // The trail between a pointed line and its part of the page: dots on the lattice, a brighter one running along.
      const path = route(trail.from, trail.to)
      const head = Math.floor(now / 28) % Math.max(1, path.length)
      path.forEach(([x, y], i) => {
        const near = Math.abs(i - head)
        context!.fillStyle = near < 3 ? `rgba(255,174,134,${1 - near * 0.25})` : 'rgba(243,104,61,0.55)'
        context!.fillText(near < 2 ? '+' : '·', x, y)
      })
    }
    // Characters travelling to their line, the first in front, each a few cells behind the one before.
    packets = packets.filter((packet) => {
      const step = Math.floor((now - packet.at) / HOP_MS)
      const last = packet.path.length - 1
      // A fading wake of dots behind the last character.
      for (let k = 1; k <= 6; k++) {
        const i = step - (packet.chars.length - 1) * 2 - k
        if (i < 0 || i > last) continue
        const [x, y] = packet.path[i]!
        context!.fillStyle = `rgba(243,104,61,${0.5 - k * 0.07})`
        context!.fillText('·', x, y)
      }
      for (let k = 0; k < packet.chars.length; k++) {
        const i = step - k * 2
        if (i < 0 || i > last) continue
        const [x, y] = packet.path[i]!
        const fade = k / packet.chars.length
        context!.fillStyle = `rgba(255,${194 - fade * 60},${164 - fade * 90},${1 - fade * 0.6})`
        context!.fillText(i > last - 2 ? NOISE[(i + k) % NOISE.length]! : packet.chars[k]!, x, y)
      }
      if (!packet.landed && step >= last) {
        packet.landed = true
        packet.done?.()
      }
      return step - (packet.chars.length - 1) * 2 <= last
    })
    // What the main content leaves out crumbles: each character falls a cell at a time, dimming into dots.
    crumbs = crumbs.filter((c) => {
      const age = now - c.at
      if (age < 0) return true
      if (age > c.life) return false
      const t = age / c.life
      const y = c.y + Math.floor((age / c.life) * c.fall) * CELL
      context!.fillStyle = `rgba(157,178,214,${0.9 * (1 - t)})`
      context!.fillText(t < 0.35 ? c.ch : t < 0.7 ? ':' : '·', c.x, y)
      return true
    })
    if (packets.length || crumbs.length || trail) raf = requestAnimationFrame(draw)
    else {
      raf = 0
      context!.clearRect(0, 0, width, height)
    }
  }
  const animate = (): void => { if (!raf) raf = requestAnimationFrame(draw) }

  /** A line's text decodes from noise into what it says. */
  function decode(line: HTMLElement): void {
    line.classList.add('is-in')
    const code = line.querySelector('code')
    if (!code || reduce()) return
    const html = code.innerHTML
    const text = code.textContent ?? ''
    const start = performance.now()
    const tick = (now: number): void => {
      if (!code.isConnected) return
      const t = (now - start) / DECODE_MS
      if (t >= 1) {
        code.innerHTML = html
        return
      }
      const shown = Math.floor(text.length * t)
      code.textContent = text.slice(0, shown) + [...text.slice(shown)].map((ch, i) => (ch === ' ' ? ' ' : NOISE[(i + Math.floor(now / 40)) % NOISE.length])).join('')
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  function crumble(block: HTMLElement, now: number): void {
    const b = box(block)
    const text = (block.textContent ?? '').replace(/\s+/g, '')
    const cols = Math.max(4, Math.floor(b.width / CELL))
    const rows = Math.max(1, Math.floor(b.height / CELL))
    for (let i = 0; i < Math.min(60, cols * rows); i += 1 + Math.floor(Math.random() * 2)) {
      crumbs.push({
        x: b.left + ((i % cols) + 0.5) * CELL,
        y: b.top + (Math.floor(i / cols) % rows + 0.5) * CELL,
        ch: text[i % Math.max(1, text.length)] ?? '·',
        at: now + Math.random() * 380,
        life: 700 + Math.random() * 500,
        fall: 2 + Math.floor(Math.random() * 4),
      })
    }
  }

  function select(view: string, focus = false): void {
    tabs.forEach((tab) => {
      const on = tab.dataset.view === view
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      if (on && focus) tab.focus()
    })
    panes.forEach((pane) => { pane.hidden = pane.dataset.view !== view })
    stage.dataset.view = view
    choose({ view: view as View })
    light(null)
  }

  /** Lights a source and its lines (or none), and draws the trail between the two that were pointed at. */
  function light(src: string | null, from?: HTMLElement, to?: HTMLElement): void {
    stage.querySelectorAll('.is-lit').forEach((el) => el.classList.remove('is-lit'))
    page!.classList.toggle('is-lit-all', src === 'page')
    trail = null
    if (!src) return animate()
    for (const part of partOf(src)) part.classList.add('is-lit')
    const view = stage.dataset.view ?? 'markdown'
    for (const line of lines(view)) if (related(line.dataset.src!, src, false) || related(src, line.dataset.src!, false)) line.classList.add('is-lit')
    if (from && to && !stacked() && !reduce()) trail = { from, to }
    animate()
  }

  /** Each line of a format, in turn, sends a trail back to where it came from. */
  function trace(view: string): void {
    if (reduce() || stacked()) return
    const now = performance.now()
    lines(view).forEach((line, i) => {
      const part = partOf(line.dataset.src!)[0] ?? page!
      packets.push({ chars: '·+·', path: route(part, line).reverse(), at: now + i * 90, done: () => {
        part.classList.add('is-traced')
        line.classList.add('is-traced')
        window.setTimeout(() => { part.classList.remove('is-traced'); line.classList.remove('is-traced') }, 900)
      } })
    })
    animate()
  }

  function finish(): void {
    stage.classList.remove('is-armed', 'is-scanning')
    stage.classList.add('is-done')
    page!.style.removeProperty('--scan')
    for (const b of blocks) b.classList.remove('is-kept')
    for (const b of blocks) if (b.hasAttribute('data-drop')) b.classList.add('is-dropped')
    stage.querySelectorAll('.is-in').forEach((el) => el.classList.remove('is-in'))
    playing = false
  }

  function stopTour(): void {
    interacted = true
    window.clearTimeout(touring)
  }

  function tour(i: number, run: number): void {
    if (interacted || run !== generation || i >= TOUR.length) return
    const [view, wait] = TOUR[i]!
    touring = window.setTimeout(() => {
      if (interacted || run !== generation) return
      select(view)
      trace(view)
      tour(i + 1, run)
    }, wait)
  }

  function play(): void {
    const run = ++generation
    window.clearTimeout(touring)
    interacted = false
    select('markdown')
    if (reduce()) return finish()
    playing = true
    packets = []
    crumbs = []
    size()
    stage.classList.remove('is-done')
    stage.classList.add('is-armed', 'is-scanning')
    for (const b of blocks) b.classList.remove('is-dropped', 'is-kept')
    stage.querySelectorAll('.is-in').forEach((el) => el.classList.remove('is-in'))
    const markdown = panes[0]!
    markdown.scrollTop = 0
    const mdLines = [...markdown.querySelectorAll<HTMLElement>('.pd-line')]
    const passed = new Set<HTMLElement>()
    const start = performance.now()
    // Lines without a part of the page (blank lines, the rule) arrive with the line before them.
    const arrive = (line: HTMLElement): void => {
      decode(line)
      let next = line.nextElementSibling as HTMLElement | null
      while (next && !next.classList.contains('has-src')) {
        next.classList.add('is-in')
        next = next.nextElementSibling as HTMLElement | null
      }
      // Keep the newest line in view as the Markdown grows.
      const lb = line.offsetTop + line.offsetHeight
      if (lb > markdown.scrollTop + markdown.clientHeight - 24) markdown.scrollTo({ top: lb - markdown.clientHeight + 48, behavior: 'smooth' })
    }
    mdLines[0] && !mdLines[0].classList.contains('has-src') && mdLines[0].classList.add('is-in')
    const scan = (now: number): void => {
      if (run !== generation) return
      const t = Math.min(1, (now - start) / SCAN_MS)
      const y = t * (page!.scrollHeight + 40)
      page!.style.setProperty('--scan', `${y}px`)
      for (const block of blocks) {
        if (passed.has(block) || block.offsetTop > y - 10) continue
        passed.add(block)
        if (block.hasAttribute('data-drop')) {
          block.classList.add('is-dropped')
          crumble(block, now)
          animate()
          continue
        }
        block.classList.add('is-kept')
        const src = block.dataset.src!
        // A table sends each of its rows; everything else sends itself.
        const sources = src === 'table' ? [...block.querySelectorAll<HTMLElement>('tr[data-src]')] : [block]
        sources.forEach((part, k) => {
          for (const line of mdLines.filter((l) => l.dataset.src === part.dataset.src || (src === 'table' && l.dataset.src === 'table' && k === 0))) {
            // Stacked on a narrow screen, the page sits above what came of it: the line simply decodes.
            if (stacked()) {
              window.setTimeout(() => { if (run === generation) arrive(line) }, 120 + k * 120)
              continue
            }
            const chars = (part.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 8) || '···'
            packets.push({ chars, path: route(part, line), at: now + k * 120, done: () => arrive(line) })
          }
        })
        animate()
      }
      if (t < 1) return void requestAnimationFrame(scan)
      // Wait for the last characters to land, then the result's status, then the tour.
      const settle = (): void => {
        if (run !== generation) return
        if (packets.length) return void window.setTimeout(settle, 120)
        if (stacked() && performance.now() - start < SCAN_MS + 1100) return void window.setTimeout(settle, 120)
        stage.querySelectorAll<HTMLElement>('.pd-pane-note, .pd-status > *').forEach((el, i) => window.setTimeout(() => el.classList.add('is-in'), i * 70))
        window.setTimeout(() => {
          if (run !== generation) return
          finish()
          tour(0, run)
        }, 700)
      }
      settle()
    }
    requestAnimationFrame(scan)
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      stopTour()
      if (playing) finish()
      select(tab.dataset.view!)
      trace(tab.dataset.view!)
    })
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      stopTour()
      const next = tabs[(i + step + tabs.length) % tabs.length]!
      select(next.dataset.view!, true)
    })
  })

  stage.addEventListener('pointerover', (event) => {
    if (playing) return
    const target = event.target as HTMLElement
    const line = target.closest<HTMLElement>('.has-src')
    if (line && stage.contains(line)) {
      stopTour()
      const src = line.dataset.src!
      light(src, partOf(src)[0] ?? page!, line)
      return
    }
    const part = target.closest<HTMLElement>('[data-src]')
    if (part && page!.contains(part)) {
      stopTour()
      const src = part.dataset.src!
      light(src)
      const first = lines(stage.dataset.view ?? 'markdown').find((l) => related(l.dataset.src!, src, false))
      if (first && !stacked() && !reduce()) trail = { from: part, to: first }
      animate()
    }
  })
  stage.addEventListener('pointerleave', () => light(null))
  replay?.addEventListener('click', () => play())
  new ResizeObserver(() => size()).observe(stage)

  // It plays once the page it scrapes is in view.
  let seen = false
  new IntersectionObserver(([entry], observer) => {
    if (!entry?.isIntersecting || seen) return
    seen = true
    observer.disconnect()
    play()
  }, { threshold: 0.5 }).observe(stage.querySelector('.pd-window') ?? stage)
  size()
}
