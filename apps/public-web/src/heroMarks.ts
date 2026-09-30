/** Pixel work on the hero artwork for the glyph layer's effects, done once per page in the glyph worker
 * (heroGlyphsWorker.ts): tracing a ridge step for step, lifting painted marks off the artwork as alpha tiles so an
 * effect can relight them in place, and finding the dark ground a spark will show against. */

// A mark is lifted in TILE x TILE artwork px around its glyph's pixel; an atlas holds ROW tiles a row.
export const TILE = 15
export const HALF = 7
const ROW = 128

export type Pixels = { data: Uint8ClampedArray; width: number; height: number }

const luminance = (data: Uint8ClampedArray, p: number): number => 0.3 * data[p] + 0.6 * data[p + 1] + 0.1 * data[p + 2]

/** Where a tile sits in its atlas. */
export const tileAt = (n: number): [number, number] => [(n % ROW) * TILE, Math.floor(n / ROW) * TILE]

/** The atlas's size for this many tiles. */
export const atlasSize = (count: number): [number, number] => [ROW * TILE, Math.max(1, Math.ceil(count / ROW)) * TILE]

/** Lifts each mark's ink, painted in one colour: per tile, its alpha is how far each pixel rises from the ground (the
 * median of a ring 5 to 7 px out, where no mark reaches) towards the mark's brightest pixel, so the ink laid over its
 * own ground gives back the painted mark. Returns the atlas's RGBA bytes. */
export function liftInk(image: Pixels, marks: ReadonlyArray<readonly [number, number]>, color: readonly [number, number, number]): Uint8ClampedArray {
  const { data, width: w } = image
  const [aw, ah] = atlasSize(marks.length)
  const out = new Uint8ClampedArray(aw * ah * 4)
  marks.forEach(([gx, gy], n) => {
    const [tx, ty] = tileAt(n)
    const ring: number[] = []
    let peak = 0
    for (let dy = -HALF; dy <= HALF; dy++) {
      for (let dx = -HALF; dx <= HALF; dx++) {
        const r = Math.hypot(dx, dy)
        const v = luminance(data, ((gy + dy) * w + gx + dx) * 4)
        if (r >= 5 && r <= 7.2) ring.push(v)
        else if (r < 5) peak = Math.max(peak, v)
      }
    }
    ring.sort((a, b) => a - b)
    const ground = ring[ring.length >> 1]
    const range = Math.max(6, peak - ground - 2)
    for (let dy = -HALF; dy <= HALF; dy++) {
      for (let dx = -HALF; dx <= HALF; dx++) {
        const r = Math.hypot(dx, dy)
        if (r >= 5) continue
        const edge = r < 4.2 ? 1 : (5 - r) / 0.8
        const amount = Math.max(0, Math.min(1, (luminance(data, ((gy + dy) * w + gx + dx) * 4) - ground - 2) / range)) * edge
        const q = ((ty + dy + HALF) * aw + tx + dx + HALF) * 4
        out[q] = color[0]
        out[q + 1] = color[1]
        out[q + 2] = color[2]
        out[q + 3] = Math.round(amount * 255)
      }
    }
  })
  return out
}

/** A ridge traced from the artwork, one row per artwork column from `from` to `to`: near a rough guess, the row where
 * the ground (the median of seven pixels across, so marks do not count) darkens most from above to below, following
 * the painting's stepped silhouette. */
export function traceRidge(image: Pixels, guess: (x: number) => number, from: number, to: number, reach = 14): Float32Array {
  const { data, width: w, height: h } = image
  const out = new Float32Array(to - from + 1)
  const row: number[] = []
  const groundAt = (x: number, y: number): number => {
    row.length = 0
    for (let k = -3; k <= 3; k++) row.push(luminance(data, (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x + k))) * 4))
    return row.sort((a, b) => a - b)[3]
  }
  let previous = NaN
  for (let x = from; x <= to; x++) {
    const centre = Math.round(guess(x))
    const lo = Number.isNaN(previous) ? centre - reach : Math.max(centre - reach, previous - 5)
    const hi = Number.isNaN(previous) ? centre + reach : Math.min(centre + reach, previous + 5)
    const column: number[] = []
    for (let y = lo - 4; y <= hi + 4; y++) column.push(groundAt(x, y))
    let best = centre
    let drop = -Infinity
    for (let y = lo; y <= hi; y++) {
      const k = y - (lo - 4)
      const change = column[k - 4] + column[k - 3] + column[k - 2] + column[k - 1] - column[k + 1] - column[k + 2] - column[k + 3] - column[k + 4]
      if (change > drop) {
        drop = change
        best = y
      }
    }
    out[x - from] = best
    previous = best
  }
  // A five-column median takes out single-column spikes.
  const smoothed = new Float32Array(out.length)
  const window: number[] = []
  for (let k = 0; k < out.length; k++) {
    window.length = 0
    for (let d = -2; d <= 2; d++) window.push(out[Math.max(0, Math.min(out.length - 1, k + d))])
    smoothed[k] = window.sort((a, b) => a - b)[2]
  }
  return smoothed
}

/** Whether the ground at a point is dark (the median of the 5 x 5 pixels around it). */
export function darkAt(image: Pixels, x: number, y: number, below = 45): boolean {
  const { data, width: w, height: h } = image
  const values: number[] = []
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = Math.max(0, Math.min(w - 1, Math.round(x) + dx))
      const py = Math.max(0, Math.min(h - 1, Math.round(y) + dy))
      values.push(luminance(data, (py * w + px) * 4))
    }
  }
  return values.sort((a, b) => a - b)[12] < below
}
