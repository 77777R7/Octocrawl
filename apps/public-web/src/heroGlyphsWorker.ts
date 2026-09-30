/** Finds the hero artwork's painted glyphs off the main thread, where the pixel work can take as long as it
 * needs without costing the page a frame. The artwork is hand-drawn, so its glyphs drift off any regular
 * lattice; each is found where its contrast with the local ground peaks, and classed by where it sits and what it
 * looks like. Replies with [x, y, kind, weight] per glyph, with the sea of clouds' pixel work (heroFog.ts) and the
 * embers a rising spark would show above (those with dark ground three to eight cells up). */
import { CLOUD, COOL, EMBER, FACE, NIGHT, onMountain } from './heroArtwork'
import { fogTransfer, prepareFog, type FogPrep } from './heroFog'
import { darkAt } from './heroMarks'

// The artwork's glyph cell (natural px).
const CELL = 12.5

export type Analysis = { found: Float32Array; fog: FogPrep; sparks: Int32Array }

// Rows are read in bands to keep the working set small. The blurs and the peak search reach 12 rows, so each band
// reads 16 more on either side.
const STRIP = 200
const MARGIN = 16

/** A box blur (with `max`, a max filter) of radius `r`, along rows and then columns, clamped at the edges. */
function separable(source: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const pass = (src: Float32Array, dst: Float32Array, length: number, lines: number, step: number, stride: number): void => {
    for (let line = 0; line < lines; line++) {
      const base = line * stride
      if (max) {
        for (let i = 0; i < length; i++) {
          let m = 0
          for (let k = Math.max(0, i - r); k <= Math.min(length - 1, i + r); k++) m = Math.max(m, src[base + k * step])
          dst[base + i * step] = m
        }
        continue
      }
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(length - 1, Math.max(0, k)) * step]
      for (let i = 0; i < length; i++) {
        dst[base + i * step] = sum / (2 * r + 1)
        sum += src[base + Math.min(length - 1, i + r + 1) * step] - src[base + Math.max(0, i - r) * step]
      }
    }
  }
  const across = new Float32Array(source.length)
  const out = new Float32Array(source.length)
  pass(source, across, w, h, 1, w)
  pass(across, out, h, w, w, 1)
  return out
}

function analyse(bitmap: ImageBitmap): Float32Array {
  const w = bitmap.width
  const h = bitmap.height
  const context = new OffscreenCanvas(w, STRIP + MARGIN * 2).getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('No 2D context')
  const found: number[] = []
  // The last glyph kept in each 8 px cell: a flat top reports neighbouring maxima, and one closer than 6 px to a
  // kept glyph is the same glyph.
  const near = new Map<number, number>()
  for (let top = 0; top < h; top += STRIP) {
    const from = Math.max(0, top - MARGIN)
    const rows = Math.min(h, top + STRIP + MARGIN) - from
    context.clearRect(0, 0, w, STRIP + MARGIN * 2)
    context.drawImage(bitmap, 0, -from)
    const { data } = context.getImageData(0, 0, w, rows)
    const lum = new Float32Array(w * rows)
    for (let i = 0; i < lum.length; i++) lum[i] = 0.3 * data[i * 4] + 0.6 * data[i * 4 + 1] + 0.1 * data[i * 4 + 2]
    const ground = separable(lum, w, rows, 6, false)
    const contrast = new Float32Array(lum.length)
    for (let i = 0; i < lum.length; i++) contrast[i] = Math.abs(lum[i] - ground[i])
    const marks = separable(contrast, w, rows, 2, false)
    const peaks = separable(marks, w, rows, 4, true)
    const last = Math.min(h - 6, top + STRIP) - from
    for (let y = Math.max(6, top) - from; y < last; y++) {
      for (let x = 6; x < w - 6; x++) {
        const i = x + y * w
        // The night sky's glyphs are faint, and a star found there between painted ones still reads as a star.
        if (marks[i] < (ground[i] < 60 ? 4.5 : 8) || marks[i] < peaks[i]) continue
        const ay = from + y
        const cx = Math.floor(x / 8)
        const cy = Math.floor(ay / 8)
        let taken = false
        for (let dy = -1; dy <= 1 && !taken; dy++) for (let dx = -1; dx <= 1 && !taken; dx++) {
          const other = near.get(cx + dx + (cy + dy) * 1024)
          if (other !== undefined && Math.hypot(found[other] - x, found[other + 1] - ay) < 6) taken = true
        }
        if (taken) continue
        // The mark's own colour is its strongest pixel; the ground's warmth is the average around it.
        let best = i
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (contrast[i + dx + dy * w] > contrast[best]) best = i + dx + dy * w
        let warm = 0
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) warm += data[(i + dx + dy * w) * 4] - data[(i + dx + dy * w) * 4 + 2]
        warm /= 81
        const [r, g, b] = [data[best * 4], data[best * 4 + 1], data[best * 4 + 2]]
        const mountain = onMountain(x, ay)
        // Sunset clouds: a warm ground, or warm marks on the blue at their edges.
        let kind = (warm > 25 && ground[i] > 70) || (r - b > 40 && lum[best] > 110) ? CLOUD : NIGHT
        if (mountain >= 0.5) kind = ground[i] > 100 && warm > 50 ? FACE : r > 1.2 * g && r > 100 ? EMBER : COOL
        near.set(cx + cy * 1024, found.length)
        found.push(x, ay, kind, kind === FACE || kind === EMBER || kind === COOL ? mountain : 1 - mountain)
      }
    }
  }
  return Float32Array.from(found)
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageBitmap>) => void) | null
  postMessage(message: Analysis, transfer: Transferable[]): void
}
scope.onmessage = ({ data: bitmap }) => {
  const found = analyse(bitmap)
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('No 2D context')
  context.drawImage(bitmap, 0, 0)
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  const glyphs: Array<{ x: number; y: number; kind: number }> = []
  for (let i = 0; i < found.length; i += 4) glyphs.push({ x: found[i], y: found[i + 1], kind: found[i + 2] })
  const fog = prepareFog(image, glyphs)
  const sparks = Int32Array.from(glyphs.flatMap((g, i) => (g.kind === EMBER && [3, 4, 5, 6, 7, 8].every((k) => darkAt(image, g.x, g.y - k * CELL)) ? [i] : [])))
  scope.postMessage({ found, fog, sparks }, [found.buffer, sparks.buffer, ...fogTransfer(fog)])
}
