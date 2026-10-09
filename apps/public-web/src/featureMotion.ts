/* What it does and Free tiers, brought to life. Motion stays in the page's glyph language: every mark keeps its cell,
 * and what moves is a mark being re-typed through · : + × # until it lands. Without motion the prerendered marks stay
 * as they are, and every control still works. */

const MARKS = '·:+×#'
/** Spaces and box-drawing lines are the art's frame: they never flicker. */
const FRAME = /[\s─│┌┐└┘├┤┬┴┼]/
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A glyph that changes every ~45 ms, picked by the cell's position so neighbours differ. */
const flicker = (i: number, t: number) => MARKS[(i * 7 + Math.floor(t / 45)) % MARKS.length]!

/** Calls `enter(el, order)` once for each element as it first comes on screen; `order` counts the ones that arrived in
 * the same batch, for a stagger. Each element is watched on its own, so a short screen or a single column still
 * reaches every one. */
function onEachEnter(elements: readonly Element[], enter: (el: Element, order: number) => void): void {
  const watch = new IntersectionObserver(entries => {
    let order = 0
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      watch.unobserve(entry.target)
      enter(entry.target, order++)
    }
  }, { rootMargin: '0px 0px -8% 0px' })
  elements.forEach(el => watch.observe(el))
}

type Retype = { hide(): void, show(delay?: number): void, decode(delay?: number): void, dots(): void, shimmer(): void }

/** Re-types a block of glyph art. Each text node keeps its own string, so accents written as <b> stay accents. The
 * marks land in a left-to-right sweep by column, with a little jitter, the way the replay's output decodes. */
function retyper(root: HTMLElement): Retype {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
  const shown = nodes.map(node => node.data)
  const dotted = shown.map(text => [...text].map(ch => FRAME.test(ch) ? ch : '·').join(''))
  // Each character's column, counted across nodes, so the sweep follows the art's columns, not the node order.
  const columns: number[][] = []
  let column = 0
  for (const text of shown) {
    columns.push([...text].map(ch => { const c = column; column = ch === '\n' ? 0 : column + 1; return c }))
  }
  let frame = 0
  let busy = false

  const run = (from: string[], to: string[], delay: number, spread: number) => {
    cancelAnimationFrame(frame)
    if (reduced()) { nodes.forEach((node, i) => { node.data = to[i]! }); busy = false; return }
    const settle = to.map((text, n) => [...text].map((_, i) => delay + 60 + columns[n]![i]! * spread + ((i * 37 + n * 11) % 9) * 18))
    const end = Math.max(0, ...settle.flat()) + 16
    const start = performance.now()
    busy = true
    const tick = (now: number) => {
      const t = now - start
      nodes.forEach((node, n) => {
        const src = [...from[n]!], dst = [...to[n]!]
        let out = ''
        for (let i = 0; i < dst.length; i++) {
          const target = dst[i]!
          if (FRAME.test(target) && FRAME.test(src[i] ?? ' ')) out += target
          else if (t >= settle[n]![i]!) out += target
          else if (t < delay) out += src[i] ?? target
          else out += FRAME.test(target) ? target : flicker(i + n * 31, t)
        }
        if (node.data !== out) node.data = out
      })
      if (t < end) frame = requestAnimationFrame(tick)
      else busy = false
    }
    frame = requestAnimationFrame(tick)
  }

  return {
    /** At once, without motion: the art as dots, ready to decode. */
    hide: () => { cancelAnimationFrame(frame); busy = false; nodes.forEach((node, i) => { node.data = dotted[i]! }) },
    show: (delay = 0) => run(nodes.map(node => node.data), shown, delay, 9),
    decode: (delay = 0) => run(dotted, shown, delay, 9),
    dots: () => run(nodes.map(node => node.data), dotted, 0, 4),
    /** A quick flicker that lands back on the same marks: the hover. */
    shimmer: () => { if (!busy) run(shown, shown, 0, 5) },
  }
}

/** The capabilities grid: the art decodes as the grid comes into view, re-types on hover, and the filter dims what
 * does not run where the visitor asked, turning its art to dots. */
function mountCapabilities(): void {
  const grid = document.querySelector<HTMLElement>('#can-grid')
  if (!grid) return
  const status = document.querySelector<HTMLElement>('#can-status')
  const cells = [...grid.querySelectorAll<HTMLElement>('.can-cell')].map(cell => ({
    cell, hosted: cell.dataset.hosted === 'true', art: retyper(cell.querySelector<HTMLElement>('.can-art')!),
  }))

  const filter = document.querySelector<HTMLElement>('.can-filter')
  if (filter) filter.hidden = false
  if (!reduced()) {
    cells.forEach(({ art }) => art.hide())
    onEachEnter(cells.map(({ cell }) => cell), (el, order) => {
      const item = cells.find(({ cell }) => cell === el)!
      if (!item.cell.classList.contains('is-out')) item.art.show(order * 110)
    })
  }
  for (const { cell, art } of cells) {
    const shimmer = () => { if (!cell.classList.contains('is-out')) art.shimmer() }
    cell.addEventListener('pointerenter', shimmer)
    cell.addEventListener('focusin', shimmer)
  }

  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="can-where"]')) {
    input.addEventListener('change', () => {
      const where = input.value
      let shown = 0
      cells.forEach(({ cell, hosted, art }, i) => {
        const keep = where !== 'hosted' || hosted
        if (keep) shown++
        if (keep === !cell.classList.contains('is-out')) return
        cell.classList.toggle('is-out', !keep)
        if (keep) art.show(i * 40)
        else art.dots()
      })
      if (status) status.textContent = where === 'hosted' ? `${shown} of ${cells.length} run on hosted Octocrawl.` : `All ${cells.length} run on your computer.`
    })
  }
}

/** Use it from: tabs over the code, with arrow keys, and the code decoding into place when its tab opens. */
function mountClients(): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.use-tab')]
  const copy = document.querySelector<HTMLButtonElement>('#use-copy')
  const status = document.querySelector<HTMLElement>('#use-status')
  if (!tabs.length || !copy) return
  const panelOf = (tab: HTMLButtonElement) => document.getElementById(tab.getAttribute('aria-controls')!)!
  const codes = new Map(tabs.map(tab => [tab, retyper(panelOf(tab).querySelector<HTMLElement>('.use-code')!)]))
  let current = tabs.find(tab => tab.getAttribute('aria-selected') === 'true') ?? tabs[0]!
  // Without a script every panel shows under its own label; with one, the tabs take over.
  tabs[0]!.parentElement!.hidden = false
  copy.hidden = false
  document.querySelector('#use-window')?.classList.add('is-tabbed')
  for (const tab of tabs) panelOf(tab).hidden = tab !== current

  const select = (tab: HTMLButtonElement, focus: boolean) => {
    if (tab === current) return
    for (const other of tabs) {
      const on = other === tab
      other.setAttribute('aria-selected', String(on))
      other.tabIndex = on ? 0 : -1
      panelOf(other).hidden = !on
    }
    current = tab
    const title = document.querySelector('#use-title')
    if (title) title.textContent = panelOf(tab).dataset.title ?? ''
    if (focus) tab.focus()
    const code = codes.get(tab)!
    if (!reduced()) code.decode()
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab, false))
    tab.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      const jump = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : step ? tabs[(i + step + tabs.length) % tabs.length] : null
      if (!jump) return
      event.preventDefault()
      select(jump, true)
    })
  })

  let reset = 0
  copy.addEventListener('click', () => {
    const text = panelOf(current).dataset.copy ?? ''
    const failed = () => {
      copy.textContent = 'Select the code'
      if (status) status.textContent = 'Copy is not available here; select the code instead.'
      clearTimeout(reset)
      reset = window.setTimeout(() => { copy.textContent = 'Copy' }, 2400)
    }
    if (!navigator.clipboard) { failed(); return }
    void navigator.clipboard.writeText(text).then(() => {
      copy.textContent = 'Copied ✓'
      if (status) status.textContent = `${current.textContent} code copied.`
      clearTimeout(reset)
      reset = window.setTimeout(() => { copy.textContent = 'Copy' }, 1600)
    }).catch(failed)
  })
}

/** Half a step's hold on the last tier before the window lets go. styles.css (.is-story .tier-stage) adds the same. */
const TAIL = 0.5

/** Free tiers. On a screen wide and tall enough the window is pinned (styles.css .is-story) while the page scrolls
 * one step per tier: the step is what the stage is taller than the window, shared out over the tiers and the hold,
 * so the tier the scroll has reached is simply the nearest whole step, and it opens in the list. Elsewhere the tiers
 * pass one by one over the planet, and the one nearest the middle of the screen is lit. Either way the scroll is
 * the browser's own: nothing settles or snaps it. A tier's name turns to it, and so does focus landing in a folded
 * one. The lights load (in their own chunk, with a worker) only as the section comes near. */
function mountTierRail(): void {
  const rail = document.querySelector<HTMLElement>('#tier-rail')
  const section = rail?.closest<HTMLElement>('section')
  const stage = section?.querySelector<HTMLElement>('.tier-stage')
  const pin = section?.querySelector<HTMLElement>('.tier-pin')
  const art = section?.querySelector<HTMLElement>('.earth-art')
  if (!rail || !section || !stage || !pin || !art) return
  const rows = [...rail.querySelectorAll<HTMLElement>('.tier-row')]
  const caption = document.querySelector<HTMLElement>('#earth-caption')
  const hint = section.querySelector<HTMLElement>('.tier-hint')
  // The same query pins the window in styles.css (.is-story .tier-pin); the two must agree.
  const pinned = window.matchMedia('(min-width: 861px) and (min-height: 720px)')
  const lightsFor = (row: HTMLElement) => row.dataset.lights === 'all' ? Number.POSITIVE_INFINITY : Number(row.dataset.lights)
  let active = -1
  let lights: import('./earthLights').EarthLights | null = null

  // The number of steps, for the stylesheet's stage height (styles.css .is-story .tier-stage). Set here through the
  // CSSOM: the site's Content-Security-Policy (style-src 'self') drops a style attribute written in the markup.
  stage.style.setProperty('--tiers', String(rows.length))
  section.classList.add('is-story')
  if (hint) hint.hidden = false
  if (caption) art.append(caption)

  const select = (index: number) => {
    if (index === active) return
    active = index
    rows.forEach((row, i) => {
      row.classList.toggle('is-active', i === index)
      if (i === index) row.setAttribute('aria-current', 'step')
      else row.removeAttribute('aria-current')
    })
    section.classList.toggle('is-begun', index > 0)
    lights?.show(lightsFor(rows[index]!))
    if (caption) {
      caption.textContent = rows[index]!.dataset.caption ?? ''
      if (!caption.hidden && !reduced()) retyper(caption).decode()
    }
  }
  /** The page's scroll with the window pinned, in px per tier; 0 when the stylesheet has not pinned it. */
  const step = () => pinned.matches ? Math.max(0, (stage.offsetHeight - pin.offsetHeight) / (rows.length - 1 + TAIL)) : 0
  /** Where the page would be scrolled to show tier i: the stage's top plus i steps when pinned, otherwise the tier
   * in the middle of the screen. */
  const stop = (i: number) => {
    if (step()) return stage.getBoundingClientRect().top + window.scrollY + i * step()
    const box = rows[i]!.getBoundingClientRect()
    return box.top + window.scrollY + box.height / 2 - window.innerHeight / 2
  }
  /** How far through the tiers the scroll is: 0 at the first, 1 at the second, and so on. */
  const progress = () => {
    const y = window.scrollY
    if (step()) return (y - stop(0)) / step()
    const stops = rows.map((_, i) => stop(i))
    if (y <= stops[0]!) return (y - stops[0]!) / window.innerHeight
    for (let i = 1; i < stops.length; i++) if (y <= stops[i]!) return i - 1 + (y - stops[i - 1]!) / (stops[i]! - stops[i - 1]!)
    return stops.length - 1 + (y - stops.at(-1)!) / window.innerHeight
  }
  let queued = 0
  const update = () => { queued = 0; select(Math.max(0, Math.min(rows.length - 1, Math.round(progress())))) }
  const refresh = () => { if (!queued) queued = requestAnimationFrame(update) }
  update()
  window.addEventListener('scroll', refresh, { passive: true })
  window.addEventListener('resize', refresh)
  pinned.addEventListener('change', refresh)

  const go = (i: number) => window.scrollTo({ top: stop(i), behavior: reduced() ? 'auto' : 'smooth' })
  rows.forEach((row, i) => {
    row.querySelector('.tier-head')?.addEventListener('click', () => go(i))
    row.addEventListener('focusin', () => { if (i !== active) go(i) })
  })

  const near = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    near.disconnect()
    void import('./earthLights').then(({ mountEarthLights }) => {
      lights = mountEarthLights(art, section, rail)
      lights.show(lightsFor(rows[active]!))
      return lights.ready.then(() => { if (caption) caption.hidden = false })
    }).catch(() => { /* The artwork stays as painted, and the caption hidden. */ })
  }, { rootMargin: '400px 0px' })
  near.observe(section)
}

export function mountFeatureSections(): void {
  mountCapabilities()
  mountClients()
  mountTierRail()
}
