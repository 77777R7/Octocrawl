// The result window builds itself out of glyphs, in the grammar of the nav's printed menus (docs-assets/nav.js):
// a band of noise glyphs runs down it a text line at a time, revealing the window under its dotted print head, and
// its monospaced words decode from noise left to right as the head passes them. Proportional text is revealed, never
// decoded, so its width does not jitter. Instant with reduced motion.

const NOISE = '·:+×#'
const LINE = 18
const running = new Map<HTMLElement, () => void>()

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Prints `part` (the whole window, or only its body on a change of view) once it is on screen. `decode` lists the
 * elements whose text decodes; only their text nodes are written, so the tint spans inside them stay. */
export function buildWindow(part: HTMLElement, decode: readonly HTMLElement[], duration: number): void {
  running.get(part)?.()
  // A window replaced before it came on screen never reports itself: let its watcher go.
  for (const [other, stopOther] of running) if (!other.isConnected) stopOther()
  if (reduced()) return
  // The result sits in a live region: screen readers wait for the real words instead of reading the noise.
  part.setAttribute('aria-busy', 'true')
  // Hidden until it starts, so a window below the fold is built where it is seen, not before. Not by its clip: the
  // browser counts the element's own clip, and a fully clipped window never reports itself on screen.
  part.style.opacity = '0'
  let frame = 0
  let ticks = 0
  let stopped = false
  let observer: IntersectionObserver | null = null
  const head = document.createElement('div')
  head.className = 'build-head'
  head.setAttribute('aria-hidden', 'true')
  const texts: Array<{ node: Text; text: string; settle: number[] }> = []
  const stop = (): void => {
    if (stopped) return
    stopped = true
    observer?.disconnect()
    cancelAnimationFrame(frame)
    for (const item of texts) item.node.nodeValue = item.text
    head.remove()
    part.style.removeProperty('opacity')
    part.style.removeProperty('clip-path')
    part.classList.remove('is-building')
    part.removeAttribute('aria-busy')
    running.delete(part)
  }
  running.set(part, stop)

  const start = (): void => {
    if (stopped) return
    const height = part.offsetHeight
    // The part of the window on screen is printed at the pace; anything below it simply appears at the end.
    const shown = Math.max(LINE, Math.min(height, window.innerHeight - Math.max(0, part.getBoundingClientRect().top)))
    const steps = Math.max(1, Math.ceil(shown / LINE))
    const top = part.getBoundingClientRect().top
    for (const element of decode) {
      const at = element.getBoundingClientRect().top - top
      if (at > shown) continue
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const begin = Math.max(0, at / shown) * duration
      let index = 0
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const text = node.nodeValue ?? ''
        // A long run (a JSON string holding the whole page) appears with the window rather than decoding.
        if (!text.trim() || text.length > 240) { index += text.length; continue }
        const settle = [...text].map((_, i) => begin + (index + i) * 3 + Math.random() * 150)
        index += text.length
        texts.push({ node, text, settle })
      }
    }
    part.classList.add('is-building')
    part.style.clipPath = `inset(0 0 ${Math.max(0, height - LINE)}px 0)`
    part.style.removeProperty('opacity')
    part.append(head)
    const width = Math.max(1, Math.floor(part.clientWidth / 6.6))
    const t0 = performance.now()
    const end = duration + 180
    const tick = (now: number): void => {
      if (stopped) return
      if (!part.isConnected) { stop(); return }
      const t = now - t0
      const step = Math.min(steps, Math.floor((t / duration) * steps) + 1)
      const y = t >= duration ? height : step * LINE
      part.style.clipPath = `inset(0 0 ${Math.max(0, height - y)}px 0)`
      head.style.transform = `translateY(${Math.min(y, height)}px) translateY(-100%)`
      head.hidden = t >= duration
      if (!head.hidden && (ticks++ & 1) === 0) {
        let rows = ''
        for (let r = 0; r < 2; r++) {
          let row = ''
          for (let c = 0; c < width; c++) row += Math.random() < 0.55 ? NOISE[Math.floor(Math.random() * NOISE.length)] : ' '
          rows += r ? `\n${row}` : row
        }
        head.textContent = rows
      }
      for (const item of texts) {
        let out = ''
        let i = 0
        for (const ch of item.text) {
          out += ch === ' ' || t >= item.settle[i]! ? ch : NOISE[(i + Math.floor(t / 30)) % NOISE.length]
          i++
        }
        if (item.node.nodeValue !== out) item.node.nodeValue = out
      }
      if (t >= end) { stop(); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }

  if (!('IntersectionObserver' in window)) { start(); return }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    start()
  }, { threshold: 0.12 })
  observer.observe(part)
}
