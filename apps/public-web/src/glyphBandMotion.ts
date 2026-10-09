import { whenVisible } from './motion'

/* The glyph band under the hero, all of it moving: every mark keeps its cell, and two slow waves roll through the
 * band (a long swell left to right, a shorter ripple back the other way). As a wave passes, each mark brightens and
 * turns into its heavier twin (· into :, + into ×), and only the very crest warms to the brand orange, so the band
 * stays as sparse as it is drawn. A canvas draws the same grid over the prerendered marks while the band is on screen
 * and the visitor allows motion; otherwise the marks stay as written. */

const HEAVIER: Record<string, string> = { '+': '×', '·': ':' }
const LIGHTER: Record<string, string> = { '+': '·', '·': '·' }
const NAVY = [7, 27, 79]
const ORANGE = [243, 104, 61]
const FONT = '12px ui-monospace, SFMono-Regular, Menlo, monospace'

export function mountGlyphBand(band: HTMLElement): void {
  const pre = band.querySelector('pre')
  if (!pre) return
  const rows = (pre.textContent ?? '').split('\n')
  const cols = Math.max(...rows.map(r => r.length))
  const cells: Array<{ x: number, y: number, ch: string }> = []
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ' ') cells.push({ x, y, ch }) }))
  const canvas = document.createElement('canvas')
  canvas.className = 'glyph-band-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  band.append(canvas)
  const context = canvas.getContext('2d')
  if (!context) return
  let raf = 0
  let last = 0
  let left = 0
  let top = 0
  let colW = 0
  let rowH = 11
  let ratio = 1

  const layout = () => {
    const box = band.getBoundingClientRect()
    const text = pre.getBoundingClientRect()
    ratio = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(box.width * ratio)
    canvas.height = Math.round(box.height * ratio)
    canvas.style.width = `${box.width}px`
    canvas.style.height = `${box.height}px`
    left = text.left - box.left
    top = text.top - box.top
    colW = text.width / cols
    rowH = Number.parseFloat(getComputedStyle(pre).lineHeight) || 11
  }

  const draw = (now: number) => {
    const t = now / 1000
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = FONT
    context.textBaseline = 'top'
    for (const { x, y, ch } of cells) {
      const px = left + x * colW
      if (px < -colW || px > canvas.width / ratio + colW) continue
      // Each row lags a little behind the one above, so the swell rolls down into the page.
      const swell = Math.sin((x / 64 - t / 7 - y * 0.06) * Math.PI * 2)
      const ripple = Math.sin((x / 23 + t / 3.6 + y * 0.11) * Math.PI * 2)
      const v = Math.max(0, Math.min(1, 0.5 + 0.38 * swell + 0.16 * ripple))
      const mark = v > 0.78 ? HEAVIER[ch] ?? ch : v < 0.22 ? LIGHTER[ch] ?? ch : ch
      const warm = Math.max(0, (v - 0.9) / 0.1)
      const [r, g, b] = NAVY.map((c, i) => Math.round(c + (ORANGE[i]! - c) * warm))
      context.fillStyle = `rgba(${r},${g},${b},${(0.2 + 0.62 * v).toFixed(3)})`
      context.fillText(mark, px, top + y * rowH)
    }
  }

  const frame = (now: number) => {
    // About 30 frames a second is plenty for a slow wave.
    if (now - last > 32) { draw(now); last = now }
    raf = requestAnimationFrame(frame)
  }

  new ResizeObserver(layout).observe(band)
  whenVisible(band, () => {
    layout()
    band.classList.add('is-live')
    raf = requestAnimationFrame(frame)
  }, () => {
    cancelAnimationFrame(raf)
    band.classList.remove('is-live')
  })
}
