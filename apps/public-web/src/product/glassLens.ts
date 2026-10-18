/** Glass for the format cards' windows: a slab with a rounded, convex rim. Light through the rim bends the way it does
 * through real glass, so the painting behind the rim is drawn a little inward and magnified; the flat middle lets it
 * straight through. Nothing is torn or stretched, because the bend is worked out from the rim's shape:
 *
 * - the rim's height across its width follows a squircle (flat in the middle, curving down to the edge), and its slope
 *   gives the surface's normal at each point;
 * - a ray coming straight down through the glass refracts by Snell's law (n = 1.5) and travels through what is left of
 *   the glass below that point, so it lands a little way inward. That distance is the shift: zero at the very edge
 *   (no glass there), largest a short way in, and back to zero where the rim meets the flat middle.
 *
 * The shifts, worked out once along the rim, become a displacement map at the window's pixel size, pointing along the
 * inward normal of its rounded outline; an SVG filter applies it to the window's backdrop (product.css .fx-win.is-lens),
 * and the CSS adds a light even frost, the saturation that keeps colour in it and a lit rim. The map is redrawn when the
 * window's size changes. Only Chromium applies an SVG filter to a backdrop (Safari and Firefox accept the syntax and
 * draw nothing), so other browsers keep their plain frosted glass. */

const SVG = 'http://www.w3.org/2000/svg'
const GLASS_INDEX = 1.5
/** The rim's width, as a share of the window's shorter side, within these bounds in px. */
const RIM_SHARE = 0.16
const RIM_MIN = 16
const RIM_MAX = 34
/** The glass's thickness, as a multiple of the rim's width: thicker glass bends further. */
const THICKNESS = 0.9
/** The corner radius of the outline the map follows, close to the windows' drawn corners. */
const RADIUS = 18
/** Samples along the rim for the shift profile. */
const SAMPLES = 128
/** How fast the shift may fall off across the rim, in px per px. Where it falls faster than 1 the backdrop would fold
 * back on itself and tear into streaks; at this rate the steepest part of the rim magnifies about twofold. */
const STEEPEST = 0.55

/** Only Chromium applies an SVG filter to a backdrop; the others parse it, so the syntax alone cannot tell. */
const lensWorks = (): boolean =>
  'userAgentData' in navigator && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#a) blur(1px)')

/** The rim's height at x, from 0 at the outer edge to 1 where it meets the flat middle: a squircle's quarter. */
const height = (x: number): number => (1 - (1 - Math.min(1, Math.max(0, x))) ** 4) ** 0.25

/** How far inward a straight-down ray lands after passing through the rim at x, in units of the rim's width. */
function shiftAt(x: number): number {
  const step = 1e-3
  const slope = ((height(x + step) - height(x - step)) / (2 * step)) * THICKNESS
  const tilt = Math.atan(slope)
  // The ray meets a surface tilted by `tilt`, refracts towards the normal, and is then off vertical by the difference.
  const bent = tilt - Math.asin(Math.sin(tilt) / GLASS_INDEX)
  return height(x) * THICKNESS * Math.tan(bent)
}

/** The shift across the rim, normalised so its largest value is 1; that largest value in rim widths; and how fast the
 * normalised shift falls at its steepest, per rim width. */
function rimProfile(): { shifts: Float32Array; peak: number; fall: number } {
  const shifts = new Float32Array(SAMPLES)
  let peak = 0
  for (let i = 0; i < SAMPLES; i++) {
    shifts[i] = shiftAt((i + 0.5) / SAMPLES)
    peak = Math.max(peak, shifts[i]!)
  }
  let fall = 0
  for (let i = 0; i < SAMPLES; i++) shifts[i]! /= peak || 1
  for (let i = 1; i < SAMPLES; i++) fall = Math.max(fall, (shifts[i - 1]! - shifts[i]!) * SAMPLES)
  return { shifts, peak, fall }
}

/** Signed distance from (x, y) to a w × h rounded rectangle's outline, centred on the origin: negative inside. */
function outline(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x) - (w / 2 - r)
  const qy = Math.abs(y) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** The map for a w × h window drawn at `ratio` pixels per CSS px, as a PNG data URL: red and green hold the sideways
 * and vertical shift around 128, scaled so ±127 is the largest shift. */
function lensMap(w: number, h: number, rim: number, ratio: number, shifts: Float32Array): string {
  const mw = Math.max(2, Math.round(w * ratio))
  const mh = Math.max(2, Math.round(h * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = mw
  canvas.height = mh
  const g = canvas.getContext('2d')
  if (!g) return ''
  const image = g.createImageData(mw, mh)
  const data = image.data
  for (let j = 0; j < mh; j++) {
    const y = (j + 0.5) / ratio - h / 2
    for (let i = 0; i < mw; i++) {
      const x = (i + 0.5) / ratio - w / 2
      const at = (j * mw + i) * 4
      data[at + 2] = 128
      data[at + 3] = 255
      const depth = -outline(x, y, w, h, RADIUS)
      if (depth <= 0 || depth >= rim) {
        data[at] = 128
        data[at + 1] = 128
        continue
      }
      const k = shifts[Math.min(SAMPLES - 1, Math.floor((depth / rim) * SAMPLES))]!
      // The inward normal: the way the depth grows.
      const nx = outline(x - 0.5, y, w, h, RADIUS) - outline(x + 0.5, y, w, h, RADIUS)
      const ny = outline(x, y - 0.5, w, h, RADIUS) - outline(x, y + 0.5, w, h, RADIUS)
      const length = Math.hypot(nx, ny) || 1
      // The backdrop is read from further in: the shift points inward.
      data[at] = Math.round(128 + (nx / length) * k * 127)
      data[at + 1] = Math.round(128 + (ny / length) * k * 127)
    }
  }
  g.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

export function mountGlassLens(section: HTMLElement): void {
  if (!lensWorks()) return
  const windows = [...section.querySelectorAll<HTMLElement>('.fx-win')]
  if (!windows.length) return
  const { shifts, peak, fall } = rimProfile()
  const defs = document.createElementNS(SVG, 'svg')
  defs.setAttribute('aria-hidden', 'true')
  defs.setAttribute('class', 'fx-lens-defs')
  section.append(defs)

  windows.forEach((win, n) => {
    const id = `fx-lens-${n}`
    const filter = document.createElementNS(SVG, 'filter')
    filter.setAttribute('id', id)
    filter.setAttribute('x', '0')
    filter.setAttribute('y', '0')
    filter.setAttribute('width', '1')
    filter.setAttribute('height', '1')
    // In sRGB, 128 in the map means no shift.
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    const map = document.createElementNS(SVG, 'feImage')
    map.setAttribute('result', 'lens')
    map.setAttribute('preserveAspectRatio', 'none')
    map.setAttribute('x', '0')
    map.setAttribute('y', '0')
    const shift = document.createElementNS(SVG, 'feDisplacementMap')
    shift.setAttribute('in', 'SourceGraphic')
    shift.setAttribute('in2', 'lens')
    shift.setAttribute('xChannelSelector', 'R')
    shift.setAttribute('yChannelSelector', 'G')
    filter.append(map, shift)
    defs.append(filter)

    let size = ''
    let wait = 0
    const draw = (): void => {
      const w = win.offsetWidth
      const h = win.offsetHeight
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      if (!w || !h || `${w}x${h}@${ratio}` === size) return
      size = `${w}x${h}@${ratio}`
      const rim = Math.min(RIM_MAX, Math.max(RIM_MIN, Math.min(w, h) * RIM_SHARE))
      map.setAttribute('width', String(w))
      map.setAttribute('height', String(h))
      map.setAttribute('href', lensMap(w, h, rim, ratio, shifts))
      // The largest shift: as far as the glass bends light, but no further than keeps the fall-off under STEEPEST.
      const largest = Math.min(peak * rim, (STEEPEST * rim) / (fall || 1))
      // The filter moves a pixel by scale × (value − 0.5), so the scale is twice the largest shift.
      shift.setAttribute('scale', (2 * largest).toFixed(2))
      win.style.setProperty('--fx-lens', `url(#${id})`)
      win.classList.add('is-lens')
    }
    // A window's height moves while its text decodes, and a resize comes in steps: the map is drawn once it settles.
    new ResizeObserver(() => {
      window.clearTimeout(wait)
      wait = window.setTimeout(draw, size ? 160 : 0)
    }).observe(win)
  })
}
