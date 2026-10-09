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

/** Free tiers. The planet stays in view behind the section (styles.css .is-story) while the words scroll past it as
 * the browser scrolls them: nothing is pinned but the planet, nothing snaps or folds. The tier whose top has crossed
 * the middle line of the screen is the one lit (the first until then), as a scrollytelling step is; it lights as
 * many of the planet's marks, and the readout on the planet says which of the four it is, what it allows and how
 * far along the four the reader is. A tier's name scrolls it into place. The lights load (in their own chunk, with a
 * worker) only as the section comes near. */
function mountTierRail(): void {
  const rail = document.querySelector<HTMLElement>('#tier-rail')
  const section = rail?.closest<HTMLElement>('section')
  const art = section?.querySelector<HTMLElement>('.earth-art')
  if (!rail || !section || !art) return
  const rows = [...rail.querySelectorAll<HTMLElement>('.tier-row')]
  const readout = document.querySelector<HTMLElement>('#earth-readout')
  const part = (sel: string) => readout?.querySelector<HTMLElement>(sel) ?? null
  const stepN = part('.earth-step-n'), stepName = part('.earth-step-name'), amountN = part('.earth-amount-n')
  const amountUnit = part('.earth-amount-unit'), lit = part('.earth-lit')
  const ticks = readout ? [...readout.querySelectorAll<HTMLElement>('.earth-ticks i')] : []
  const hint = section.querySelector<HTMLElement>('.tier-hint')
  const lightsFor = (row: HTMLElement) => row.dataset.lights === 'all' ? Number.POSITIVE_INFINITY : Number(row.dataset.lights)
  /** Where a step is triggered: the middle of the screen, a little low, so a tier's name is well in view first. */
  const LINE = 0.55
  let active = -1
  let lights: import('./earthLights').EarthLights | null = null

  section.classList.add('is-story')
  if (hint) hint.hidden = false
  if (readout) art.append(readout)

  const select = (index: number) => {
    if (index === active) return
    active = index
    const row = rows[index]!
    rows.forEach((other, i) => {
      other.classList.toggle('is-active', i === index)
      if (i === index) other.setAttribute('aria-current', 'step')
      else other.removeAttribute('aria-current')
    })
    section.classList.toggle('is-begun', index > 0)
    lights?.show(lightsFor(row))
    if (stepN) stepN.textContent = row.querySelector('.tier-n')?.textContent ?? ''
    if (stepName) stepName.textContent = row.querySelector('.tier-name')?.textContent ?? ''
    if (amountN) amountN.textContent = row.querySelector('.tier-amount b')?.textContent ?? ''
    if (amountUnit) amountUnit.textContent = row.dataset.unit ?? ''
    if (lit) lit.textContent = row.dataset.lit ?? ''
    ticks.forEach((tick, i) => tick.classList.toggle('is-on', i <= index))
    if (readout && !readout.hidden && !reduced()) { if (amountN) retyper(amountN).decode(); if (lit) retyper(lit).decode() }
  }
  /** The tier whose top has crossed the trigger line, in px from the window's height (not vh, which moves with a
   * phone's address bar). */
  const current = () => {
    const line = window.innerHeight * LINE
    let index = 0
    rows.forEach((row, i) => { if (row.getBoundingClientRect().top <= line) index = i })
    return index
  }
  let queued = 0
  const update = () => { queued = 0; select(current()) }
  const refresh = () => { if (!queued) queued = requestAnimationFrame(update) }
  update()
  window.addEventListener('scroll', refresh, { passive: true })
  window.addEventListener('resize', refresh)

  rows.forEach(row => {
    row.querySelector('.tier-head')?.addEventListener('click', () => {
      const top = row.getBoundingClientRect().top + window.scrollY - window.innerHeight * (LINE - 0.12)
      window.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' })
    })
  })

  const near = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    near.disconnect()
    void import('./earthLights').then(({ mountEarthLights }) => {
      lights = mountEarthLights(art, section, rail)
      lights.show(lightsFor(rows[active]!))
      return lights.ready.then(() => { if (readout) readout.hidden = false })
    }).catch(() => { /* The artwork stays as painted, and the readout hidden. */ })
  }, { rootMargin: '400px 0px' })
  near.observe(section)
}

export function mountFeatureSections(): void {
  mountCapabilities()
  mountClients()
  mountTierRail()
}
