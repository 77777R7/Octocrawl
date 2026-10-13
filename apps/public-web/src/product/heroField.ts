/** The product hero's ground: the site's glyph lattice, faint, brightest under the headline and fading to the
 * edges, with a few marks twinkling. Drawn only while the hero is on screen; still with reduced motion. */

const CELL = 22
const MARKS = ['+', '×', '·']

export function mountHeroField(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  const host = canvas.parentElement
  if (!context || !host) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  let width = 0
  let height = 0
  let ratio = 1
  let raf = 0
  let last = 0
  let visible = true
  let cells: Array<{ x: number; y: number; base: number; phase: number; period: number; mark: number }> = []

  function layout(): void {
    ratio = Math.min(2, window.devicePixelRatio || 1)
    width = host!.clientWidth
    height = host!.clientHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    cells = []
    for (let y = CELL / 2; y < height; y += CELL) {
      for (let x = CELL / 2; x < width; x += CELL) {
        const dx = (x - width / 2) / (width * 0.62)
        const dy = (y - height * 0.22) / (height * 0.9)
        const base = Math.max(0, 1 - Math.hypot(dx, dy)) * 0.26
        if (base < 0.03) continue
        const r = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
        const h = r - Math.floor(r)
        cells.push({ x, y, base, phase: h, period: 2600 + h * 5200, mark: h < 0.04 ? 1 : h < 0.13 ? 0 : 2 })
      }
    }
    draw(performance.now())
  }

  function draw(now: number): void {
    context!.setTransform(ratio, 0, 0, ratio, 0, 0)
    context!.clearRect(0, 0, width, height)
    context!.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace'
    context!.textAlign = 'center'
    context!.textBaseline = 'middle'
    for (const c of cells) {
      const phase = (now / c.period + c.phase) % 1
      const twinkle = still.matches || c.mark === 2 ? 0 : phase < 0.12 ? Math.sin((phase / 0.12) * Math.PI) : 0
      context!.fillStyle = twinkle > 0.05 ? `rgba(255,174,134,${(c.base + twinkle * 0.42).toFixed(3)})` : `rgba(141,185,232,${c.base.toFixed(3)})`
      context!.fillText(MARKS[c.mark]!, c.x, c.y)
    }
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    if (now - last < 66) return
    last = now
    draw(now)
  }
  function run(): void {
    if (raf || still.matches || !visible || document.hidden) return
    raf = requestAnimationFrame(frame)
  }
  function stop(): void {
    cancelAnimationFrame(raf)
    raf = 0
  }
  new ResizeObserver(layout).observe(host)
  new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting)
    if (visible) run()
    else stop()
  }).observe(host)
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()))
  still.addEventListener('change', () => (still.matches ? (stop(), layout()) : run()))
  layout()
  run()
}
