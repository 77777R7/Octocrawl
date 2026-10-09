/** Finds the Earth artwork's painted glyphs off the main thread, the way heroGlyphsWorker.ts finds the mountain's:
 * each glyph is where its contrast with the local ground peaks. Replies with every glyph's place and kind, and the
 * order in which the free-tiers window lights them: the land first, spreading from a point in eastern North America,
 * then the sea around it. Coordinates are the artwork's natural pixels (public/assets/scene-earth.webp, 1672 × 941). */

import { BEACONS, DISK, FLARE, LAND, ORIGIN, SEA, SKY, SUN, type EarthAnalysis } from './earthArtwork'

// The least distance between two city lights (natural px, about four glyph cells).
const SPACING = 46

/** A box blur (with `max`, a max filter) of radius `r`, along rows and then columns, clamped at the edges. The same
 * filter heroGlyphsWorker.ts uses for the mountain. */
function separable(source: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const pass = (src: Float32Array, dst: Float32Array, length: number, lines: number, step: number, stride: number): void => {
    for (let line = 0; line < lines; line++) {
      const base = line * stride
      if (max) {
        for (let i = 0; i < length; i++) {
          let m = 0
          for (let k = Math.max(0, i - r); k <= Math.min(length - 1, i + r); k++) m = Math.max(m, src[base + k * step]!)
          dst[base + i * step] = m
        }
        continue
      }
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(length - 1, Math.max(0, k)) * step]!
      for (let i = 0; i < length; i++) {
        dst[base + i * step] = sum / (2 * r + 1)
        sum += src[base + Math.min(length - 1, i + r + 1) * step]! - src[base + Math.max(0, i - r) * step]!
      }
    }
  }
  const across = new Float32Array(source.length)
  const out = new Float32Array(source.length)
  pass(source, across, w, h, 1, w)
  pass(across, out, h, w, w, 1)
  return out
}

/** A slow, smooth wobble in [-1, 1], so the lit region grows with an organic edge rather than as a circle. */
const wobble = (x: number, y: number): number => Math.sin(x * 0.011 + Math.sin(y * 0.017) * 1.7) * Math.cos(y * 0.013 - x * 0.007)

function analyse(data: Uint8ClampedArray, w: number, h: number): EarthAnalysis {
  const lum = new Float32Array(w * h)
  for (let i = 0; i < lum.length; i++) lum[i] = 0.3 * data[i * 4]! + 0.6 * data[i * 4 + 1]! + 0.1 * data[i * 4 + 2]!
  const ground = separable(lum, w, h, 6, false)
  const contrast = new Float32Array(lum.length)
  for (let i = 0; i < lum.length; i++) contrast[i] = Math.abs(lum[i]! - ground[i]!)
  const marks = separable(contrast, w, h, 2, false)
  const peaks = separable(marks, w, h, 4, true)
  const found: number[] = []
  const near = new Map<number, number>()
  for (let y = 6; y < h - 6; y++) {
    for (let x = 6; x < w - 6; x++) {
      const i = x + y * w
      // The night sky's glyphs are faint, and a star found there between painted ones still reads as a star.
      if (marks[i]! < (ground[i]! < 60 ? 4.5 : 8) || marks[i]! < peaks[i]!) continue
      const cx = Math.floor(x / 8)
      const cy = Math.floor(y / 8)
      let taken = false
      for (let dy = -1; dy <= 1 && !taken; dy++) for (let dx = -1; dx <= 1 && !taken; dx++) {
        const other = near.get(cx + dx + (cy + dy) * 1024)
        if (other !== undefined && Math.hypot(found[other]! - x, found[other + 1]! - y) < 6) taken = true
      }
      if (taken) continue
      // The mark's own colour is its strongest pixel.
      let best = i
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (contrast[i + dx + dy * w]! > contrast[best]!) best = i + dx + dy * w
      const [r, , b] = [data[best * 4]!, data[best * 4 + 1]!, data[best * 4 + 2]!]
      let kind = SKY
      if (Math.hypot(x - DISK.x, y - DISK.y) < DISK.r) {
        const glare = lum[best]! > 215 && Math.hypot(x - SUN.x, y - SUN.y) < SUN.r
        kind = glare ? FLARE : r - b > 30 && r > 110 ? LAND : SEA
      }
      near.set(cx + cy * 1024, found.length)
      found.push(x, y, kind)
    }
  }
  const glyphs = Float32Array.from(found)
  const order: Array<{ index: number, rank: number }> = []
  for (let g = 0; g < glyphs.length / 3; g++) {
    const kind = glyphs[g * 3 + 2]!
    if (kind !== LAND && kind !== SEA) continue
    const x = glyphs[g * 3]!
    const y = glyphs[g * 3 + 1]!
    const distance = Math.hypot(x - ORIGIN.x, y - ORIGIN.y) * (1 + 0.25 * wobble(x, y))
    order.push({ index: g, rank: (kind === LAND ? 0 : 1e5) + distance })
  }
  order.sort((a, b) => a.rank - b.rank)
  // The first BEACONS lights are cities: land marks, nearest the origin first, but never closer than SPACING to one
  // already chosen, so five lights read as five places rather than one bright spot.
  const beacons: number[] = []
  for (const { index } of order) {
    if (beacons.length >= BEACONS || glyphs[index * 3 + 2] !== LAND) break
    const x = glyphs[index * 3]!
    const y = glyphs[index * 3 + 1]!
    if (beacons.every(b => Math.hypot(glyphs[b * 3]! - x, glyphs[b * 3 + 1]! - y) >= SPACING)) beacons.push(index)
  }
  // A greedy pass can stop short on a small coast; keep scanning the land in order for the rest.
  for (const { index } of order) {
    if (beacons.length >= BEACONS) break
    if (glyphs[index * 3 + 2] !== LAND || beacons.includes(index)) continue
    const x = glyphs[index * 3]!
    const y = glyphs[index * 3 + 1]!
    if (beacons.every(b => Math.hypot(glyphs[b * 3]! - x, glyphs[b * 3 + 1]! - y) >= SPACING)) beacons.push(index)
  }
  const chosen = new Set(beacons)
  return { glyphs, lights: Uint16Array.from([...beacons, ...order.map(o => o.index).filter(i => !chosen.has(i))]) }
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageBitmap>) => void) | null
  postMessage(message: EarthAnalysis, transfer: Transferable[]): void
}
scope.onmessage = ({ data: bitmap }) => {
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('No 2D context')
  context.drawImage(bitmap, 0, 0)
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
  const result = analyse(data, bitmap.width, bitmap.height)
  bitmap.close()
  scope.postMessage(result, [result.glyphs.buffer, result.lights.buffer])
}
