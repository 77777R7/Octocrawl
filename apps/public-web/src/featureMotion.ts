/* Get started, brought to life. Motion stays in the page's glyph language: every mark keeps its cell,
 * and what moves is a mark being re-typed through · : + × # until it lands. Without motion the prerendered marks stay
 * as they are, and every control still works. */

const MARKS = '·:+×#'
/** Spaces and box-drawing lines are the art's frame: they never flicker. */
const FRAME = /[\s─│┌┐└┘├┤┬┴┼]/
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A glyph that changes every ~45 ms, picked by the cell's position so neighbours differ. */
const flicker = (i: number, t: number) => MARKS[(i * 7 + Math.floor(t / 45)) % MARKS.length]!

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

export function mountFeatureSections(): void {
  mountClients()
}
