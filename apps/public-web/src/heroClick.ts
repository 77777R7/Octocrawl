/** A click in the hero answers in the artwork's own glyphs: a small diamond of cells lights from the pointer out, each
 * cell running down the artwork's density ramp (X, x, +, :, ·) until it is gone, in about 0.4 s. It is drawn above
 * the form, so a click on a button reads too; the artwork's own glyphs answer with a ripple (heroGlyphs.ts). Mouse
 * and trackpad only, and never with reduced motion. */

// The cells' pitch (css px), the delay from one ring of the diamond to the next, and each cell's life.
const PITCH = 13
const RING_MS = 55
const LIFE_MS = 360
// The diamond: every cell within two steps of the pointer, and the four tips a step further out.
const CELLS: ReadonlyArray<readonly [number, number, number]> = [
  ...Array.from({ length: 25 }, (_, i) => [(i % 5) - 2, Math.floor(i / 5) - 2] as const)
    .filter(([x, y]) => Math.abs(x) + Math.abs(y) <= 2),
  [3, 0], [-3, 0], [0, 3], [0, -3],
].map(([x, y]) => [x, y, Math.abs(x) + Math.abs(y)] as const)
const LAST_MS = 3 * RING_MS + LIFE_MS
// Near the pointer the glyphs burn hottest; the outer ring is lighter, as the artwork's glow falls off. A navy halo
// under each mark keeps it legible on the white card and on the orange mountain alike.
const COLOURS = ['#fff1e0', '#ffc59a', '#ff9a66', '#fb7b4c']
const HALO = 'rgba(4, 18, 58, .55)'

type Burst = { x: number; y: number; at: number }

export function mountHeroClick(container: HTMLElement, hero: HTMLElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = window.matchMedia('(pointer: fine)')
  const compact = window.matchMedia('(max-width: 600px)')
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-click-canvas'
  const context = canvas.getContext('2d')
  if (!context) return
  container.append(canvas)
  const bursts: Burst[] = []
  let raf = 0
  let width = 0
  let height = 0
  let ratio = 1

  function fit(): void {
    const w = container.clientWidth
    const h = container.clientHeight
    const r = Math.min(2, window.devicePixelRatio || 1)
    if (w === width && h === height && r === ratio) return
    width = w
    height = h
    ratio = r
    canvas.width = Math.round(w * r)
    canvas.height = Math.round(h * r)
  }

  /** One mark of the ramp, centred on a cell: 0 X, 1 x, 2 +, 3 :, 4 ·. */
  function mark(shape: number, x: number, y: number): void {
    if (shape <= 2) {
      const half = shape === 0 ? 4.6 : shape === 1 ? 3.2 : 4
      const path = new Path2D()
      if (shape === 2) {
        path.moveTo(x - half, y); path.lineTo(x + half, y)
        path.moveTo(x, y - half); path.lineTo(x, y + half)
      } else {
        path.moveTo(x - half, y - half); path.lineTo(x + half, y + half)
        path.moveTo(x + half, y - half); path.lineTo(x - half, y + half)
      }
      const colour = context!.strokeStyle
      context!.strokeStyle = HALO
      context!.lineWidth = 4.2
      context!.stroke(path)
      context!.strokeStyle = colour
      context!.lineWidth = 2
      context!.stroke(path)
      return
    }
    const path = new Path2D()
    const r = shape === 3 ? 1.3 : 1.45
    if (shape === 3) {
      path.arc(x, y - 2.8, r, 0, Math.PI * 2)
      path.moveTo(x + r, y + 2.8)
      path.arc(x, y + 2.8, r, 0, Math.PI * 2)
    } else path.arc(x, y, r, 0, Math.PI * 2)
    const colour = context!.fillStyle
    context!.strokeStyle = HALO
    context!.lineWidth = 2.2
    context!.stroke(path)
    context!.fillStyle = colour
    context!.fill(path)
  }

  function frame(now: number): void {
    while (bursts.length && now - bursts[0]!.at > LAST_MS) bursts.shift()
    context!.setTransform(ratio, 0, 0, ratio, 0, 0)
    context!.clearRect(0, 0, width, height)
    context!.lineCap = 'round'
    for (const burst of bursts) {
      for (const [dx, dy, ring] of CELLS) {
        const age = now - burst.at - ring * RING_MS
        if (age < 0 || age >= LIFE_MS) continue
        const t = age / LIFE_MS
        // Each cell holds its dense marks longest, then thins quickly; the tips start one step lighter.
        const shape = Math.min(4, Math.floor(t ** 1.4 * 5) + (ring === 3 ? 1 : 0))
        context!.globalAlpha = 1 - t * t * 0.7
        context!.strokeStyle = context!.fillStyle = COLOURS[ring]!
        mark(shape, burst.x + dx * PITCH, burst.y + dy * PITCH)
      }
    }
    context!.globalAlpha = 1
    raf = bursts.length ? requestAnimationFrame(frame) : 0
  }

  hero.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || motion.matches || !pointer.matches || compact.matches) return
    // The header's navigation is for getting somewhere, not for play.
    if ((event.target as Element | null)?.closest('.site-header')) return
    fit()
    const box = container.getBoundingClientRect()
    bursts.push({ x: event.clientX - box.left, y: event.clientY - box.top, at: performance.now() })
    if (bursts.length > 4) bursts.shift()
    if (!raf) raf = requestAnimationFrame(frame)
  }, { passive: true })
}
