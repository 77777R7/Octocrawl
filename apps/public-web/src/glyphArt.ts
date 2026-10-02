/** Glyph art the build writes into the page: deterministic, so every build produces the same characters, and free of
 * DOM access, because it runs in Node with page.ts. Only the site's own marks are used (· : + × # and the block
 * shades for the hero's edge). */

function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453
  return s - Math.floor(s)
}

/** Smooth value noise on a 7-cell lattice. */
function noise(x: number, y: number, seed: number): number {
  const size = 7
  const xi = Math.floor(x / size), yi = Math.floor(y / size)
  const fx = x / size - xi, fy = y / size - yi
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed)
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

const trimmed = (lines: string[]) => lines.map(line => line.trimEnd()).join('\n')

/** The edge where a navy band meets the page: evenly spaced marks, each row sparser and offset from the one above, so
 * the navy thins out like a halftone fade. */
export function glyphBand(cols = 240): string {
  const rows = [['+', 2, 0], ['+', 4, 1], ['·', 6, 3], ['·', 12, 7]] as const
  return trimmed(rows.map(([mark, step, offset]) => {
    let line = ''
    for (let x = 0; x < cols; x++) line += x % step === offset % step ? mark : ' '
    return line
  }))
}

/** A ring of glyph cloud that leaves its centre clear for a heading. */
export function glyphCloud(cols: number, rows: number, seed: number): string {
  const glyphs = ' ·:+×#'
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const dx = (x / cols - 0.5) * 2, dy = (y / rows - 0.5) * 2
      const d = Math.sqrt(dx * dx + dy * dy)
      const ring = Math.min(1, Math.max(0, (d - 0.38) / 0.35)) * Math.max(0, 1 - Math.max(0, d - 1) / 0.3)
      const v = Math.max(0, Math.min(0.999, noise(x, y * 2, seed) * ring * 1.35 + (hash(x, y, seed + 3) - 0.5) * 0.12))
      line += glyphs[Math.floor(v * glyphs.length)]
    }
    lines.push(line)
  }
  return trimmed(lines)
}

/** Low waves of marks that thicken towards the bottom row. */
export function glyphWaves(cols: number, rows: number): string {
  const glyphs = ' .·:-=+×'
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const v = noise(x * 1.4, y * 3, 21) * (0.35 + y / rows) - 0.25 + (hash(x, y, 22) - 0.5) * 0.25
      line += glyphs[Math.max(0, Math.min(glyphs.length - 1, Math.floor(v * glyphs.length * 1.4)))]
    }
    lines.push(line)
  }
  return trimmed(lines)
}

/** Loose rows of small marks, for the texture inside a filled bar. */
export function glyphRows(cols: number, rows: number): string {
  const glyphs = '·:+×^"\''
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) line += hash(x, y, 31) < 0.55 ? glyphs[Math.floor(hash(x, y, 32) * glyphs.length)] : ' '
    lines.push(line)
  }
  return trimmed(lines)
}
