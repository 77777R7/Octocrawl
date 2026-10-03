import { CLOUD_GLYPHS, cloudCell } from './glyphArt'
import { whenVisible } from './motion'

/* The glyph cloud, breathing outward. Every mark stays on its grid cell; the motion is marks changing weight, ink and
 * colour as rings pass through them. Three rings at different speeds give the depth: a slow swell that lights its
 * marks orange and cools back to navy behind it, a quicker ripple, and a fine shimmer. */

/** What a cell shows at one moment: its mark (an index into CLOUD_GLYPHS), its ink alpha, and how far its colour has
 * turned from navy to orange, 0 to 1. */
export interface RippleCell { level: number, alpha: number, warm: number }

const SWELL = { k: 1.15, f: 0.15 }   // rings per unit of distance, rings per second
const RIPPLE = { k: 2.4, f: 0.3 }
const fract = (n: number) => n - Math.floor(n)
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const smooth = (a: number, b: number, n: number) => { const t = clamp01((n - a) / (b - a)); return t * t * (3 - 2 * t) }

/** A ring travelling outward: a soft rise ahead of it, full at the crest, a long tail fading back towards the centre. */
function ring(d: number, t: number, { k, f }: { k: number, f: number }): number {
  const p = fract(t * f - d * k)
  return Math.max(p > 0.9 ? ((p - 0.9) / 0.1) ** 2 : 0, Math.exp(-4.5 * p))
}

/** One cell at time `t` seconds. `d` and `ink` come from cloudCell; `jitter` is a fixed 0–1 value per cell, so the
 * rings' edges are grainy rather than drawn with a compass. The heading's clear centre stays clear. */
export function rippleCell(d: number, ink: number, jitter: number, t: number): RippleCell {
  const reach = smooth(0.3, 0.55, d) * (1 - smooth(1.2, 1.45, d))
  if (reach === 0) return { level: 0, alpha: 0, warm: 0 }
  const swell = ring(d + jitter * 0.05, t, SWELL)
  const ripple = ring(d - jitter * 0.04, t, RIPPLE)
  const shimmer = Math.sin((t * 0.9 + jitter) * Math.PI * 2) * 0.05
  // The cloud's own ink, lifted by the rings; the swell also raises a few marks past the cloud's edge as it spreads.
  const lift = ink * (0.7 + 0.55 * swell + 0.25 * ripple) + reach * (0.16 * swell * jitter + shimmer * ink)
  const level = Math.floor(clamp01(Math.min(0.999, lift)) * CLOUD_GLYPHS.length)
  if (level === 0) return { level: 0, alpha: 0, warm: 0 }
  const warm = clamp01((swell - 0.18) * 1.3) * reach + clamp01(ripple - 0.6) * 0.35 * reach
  return { level, alpha: 0.05 + 0.018 * level + 0.26 * swell * reach + 0.06 * ripple, warm: clamp01(warm) }
}

const NAVY = [20, 37, 74], RUST = [184, 70, 29], ORANGE = [243, 104, 61]
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t))
/** Navy to rust to the brand orange, so a mark warms through the page's own accent colours. */
function colour(warm: number, alpha: number): string {
  const [r, g, b] = warm < 0.5 ? mix(NAVY, RUST, warm * 2) : mix(RUST, ORANGE, (warm - 0.5) * 2)
  return `rgba(${r},${g},${b},${Math.min(0.5, alpha).toFixed(3)})`
}

/** Takes over a prerendered glyph cloud (`data-cols`, `data-rows`, `data-seed` name how it was drawn) with a canvas
 * that draws the same grid, moving, while it is on screen. Without motion, the prerendered marks stay. */
export function mountGlyphRipple(pre: HTMLElement): void {
  const cols = Number(pre.dataset.cols), rows = Number(pre.dataset.rows), seed = Number(pre.dataset.seed)
  if (!cols || !rows || !Number.isFinite(seed)) return
  const cells: Array<{ x: number, y: number, d: number, ink: number, jitter: number }> = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const { d, ink } = cloudCell(x, y, cols, rows, seed)
    const jitter = fract(Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453)
    cells.push({ x, y, d, ink, jitter })
  }

  const canvas = document.createElement('canvas')
  canvas.className = `${pre.className} glyph-ripple`
  canvas.setAttribute('aria-hidden', 'true')
  const context = canvas.getContext('2d')
  if (!context) return
  let cellW = 0, cellH = 0, font = ''
  const size = () => {
    const style = getComputedStyle(pre)
    font = `${style.fontSize} ${style.fontFamily}`
    context.font = font
    cellW = context.measureText('M').width
    cellH = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.1
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.style.width = `${cols * cellW}px`
    canvas.style.height = `${rows * cellH}px`
    canvas.width = Math.round(cols * cellW * dpr)
    canvas.height = Math.round(rows * cellH * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  let frame = 0, last = 0, started = 0
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw)
    if (now - last < 1000 / 30) return
    last = now
    const t = (now - started) / 1000 + 2.5  // start part-way through a swell, so the first frame already moves
    context.clearRect(0, 0, cols * cellW, rows * cellH)
    context.font = font
    context.textBaseline = 'middle'
    for (const cell of cells) {
      const { level, alpha, warm } = rippleCell(cell.d, cell.ink, cell.jitter, t)
      if (!level) continue
      context.fillStyle = colour(warm, alpha)
      context.fillText(CLOUD_GLYPHS[level]!, cell.x * cellW, cell.y * cellH + cellH / 2)
    }
  }

  whenVisible(pre.parentElement ?? pre, () => {
    if (!canvas.isConnected) {
      size()
      pre.after(canvas)
    }
    started ||= performance.now()
    pre.classList.add('is-handed-off')
    canvas.classList.add('is-live')
    frame = requestAnimationFrame(draw)
  }, () => {
    cancelAnimationFrame(frame)
    canvas.classList.remove('is-live')
    pre.classList.remove('is-handed-off')
  })
  window.addEventListener('resize', () => { if (canvas.isConnected) size() })
}
