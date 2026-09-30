/**
 * Page layout for PDF text: the text runs a PDF draws on one page, each with a
 * position, become lines and paragraphs in reading order.
 *
 * - Runs are grouped by text direction, directions within 3° counting as one
 *   (the text layer of a skewed scan). The direction with the most characters
 *   is read first; text in other directions (a rotated axis label, a vertical
 *   margin note) follows as its own paragraphs instead of breaking the lines it
 *   crosses.
 * - Reading order is a recursive XY cut. A region is split at a vertical
 *   gutter, left before right, when the gutter separates columns of text, or
 *   when the lines on its two sides do not share baselines (a text column next
 *   to a figure). Where they do share baselines and are not both prose, the
 *   region is a table or a single line, and its rows stay whole. Otherwise the
 *   region is split at its widest horizontal gaps, top before bottom.
 * - A line is the runs whose vertical extents overlap by half, left to right; a
 *   horizontal gap of more than 0.15 em between runs is a space, and so is an
 *   overlap of more than half an em (text drawn over other text). A run drawn
 *   twice at the same place (simulated bold) counts once.
 * - A paragraph ends where the column changes, the text size changes by more
 *   than a fifth, or the gap to the next line is well above the page's usual
 *   line spacing.
 *
 * No text is added, dropped or reordered within a run.
 */

export interface TextRun {
  /** The run's text as the PDF's text layer maps it to Unicode. */
  text: string
  /** Start of the baseline, in PDF user space (y grows upwards). */
  x: number
  y: number
  /** Advance width along the baseline. */
  width: number
  /** Font size: the run's height in user-space units. */
  size: number
  /** Baseline direction in degrees, counter-clockwise from the x axis. */
  angle: number
}

export interface Line {
  text: string
  /** Baseline and size of the line's longest run, in the frame of its text direction. */
  y: number
  size: number
  /** Which column of the page's XY cut the line belongs to. */
  column: string
  /** The text direction in whole degrees, counter-clockwise. */
  direction: number
}

interface Box {
  text: string
  x0: number
  x1: number
  y: number
  size: number
}

const SPACE_EM = 0.15
const OVERLAP_EM = 0.5
const GUTTER_EM = 0.9

const bottom = (box: { y: number; size: number }) => box.y - 0.25 * box.size
const top = (box: { y: number; size: number }) => box.y + 0.75 * box.size

export function layoutPage(runs: readonly TextRun[]): Line[][] {
  const degrees = new Map<number, TextRun[]>()
  for (const run of runs) {
    if (!/\S/.test(run.text) || ![run.x, run.y, run.width, run.size, run.angle].every(Number.isFinite) || run.size <= 0) continue
    const angle = ((Math.round(run.angle) % 360) + 360) % 360
    const group = degrees.get(angle) ?? []
    group.push(run)
    degrees.set(angle, group)
  }
  const chars = (group: TextRun[]) => group.reduce((sum, run) => sum + run.text.length, 0)
  // Directions within 3° of a heavier one belong to it (a skewed scan's text layer
  // varies by a degree or so from line to line); each group is read in the frame
  // of its heaviest direction.
  const directions: Array<{ angle: number; runs: TextRun[] }> = []
  for (const [angle, group] of [...degrees].sort(([, a], [, b]) => chars(b) - chars(a))) {
    const near = directions.find((direction) => Math.abs(((angle - direction.angle + 540) % 360) - 180) <= 3)
    if (near) near.runs.push(...group)
    else directions.push({ angle, runs: group })
  }
  return directions.flatMap(({ angle, runs: group }) => {
    const lines: Line[] = []
    cut(boxesOf(group, angle), '', angle, lines)
    return paragraphs(lines)
  })
}

/** Runs in the frame of their direction, so that their baselines are horizontal. */
function boxesOf(runs: TextRun[], angle: number): Box[] {
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const boxes: Box[] = []
  const byText = new Map<string, Box[]>()
  for (const run of runs) {
    const x = run.x * cos + run.y * sin
    const box = { text: run.text, x0: x, x1: x + Math.max(run.width, 0), y: -run.x * sin + run.y * cos, size: run.size }
    const near = 0.3 * box.size
    const same = byText.get(box.text) ?? []
    if (same.some((other) => Math.abs(other.x0 - box.x0) < near && Math.abs(other.y - box.y) < near)) continue
    same.push(box)
    byText.set(box.text, same)
    boxes.push(box)
  }
  return boxes
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function cut(boxes: Box[], column: string, direction: number, out: Line[]): void {
  if (boxes.length === 0) return
  const split = verticalSplit(boxes)
  if (split) {
    cut(split[0], `${column}0`, direction, out)
    cut(split[1], `${column}1`, direction, out)
    return
  }
  const bands = horizontalBands(boxes)
  if (bands.length > 1) {
    for (const band of bands) cut(band, column, direction, out)
    return
  }
  out.push(...linesOf(boxes, column, direction))
}

/** The widest vertical gutter that separates columns, as [left, right], or null. */
function verticalSplit(boxes: Box[]): [Box[], Box[]] | null {
  const size = median(boxes.map((box) => box.size))
  const sorted = [...boxes].sort((a, b) => a.x0 - b.x0)
  const gaps: Array<{ at: number; width: number }> = []
  let reach = -Infinity
  sorted.forEach((box, at) => {
    if (at > 0 && box.x0 - reach >= GUTTER_EM * size) gaps.push({ at, width: box.x0 - reach })
    reach = Math.max(reach, box.x1)
  })
  for (const gap of gaps.sort((a, b) => b.width - a.width)) {
    const left = sorted.slice(0, gap.at)
    const right = sorted.slice(gap.at)
    if (columns(linesOf(left, '', 0), linesOf(right, '', 0), size)) return [left, right]
  }
  return null
}

/** Whether the lines on the two sides of a gutter are read one side after the other. */
function columns(left: Line[], right: Line[], size: number): boolean {
  if (prose(left) && prose(right)) return true
  const [few, many] = left.length <= right.length ? [left, right] : [right, left]
  const tolerance = Math.max(1, 0.2 * size)
  const aligned = few.filter((line) => many.some((other) => Math.abs(other.y - line.y) <= tolerance)).length
  return aligned < 0.5 * few.length
}

/** At least three lines of mostly letters, with a median length of 20 characters. */
function prose(lines: Line[]): boolean {
  if (lines.length < 3) return false
  const text = lines.map((line) => line.text).join('')
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  const visible = text.match(/\S/gu)?.length ?? 0
  return median(lines.map((line) => line.text.length)) >= 20 && letters >= 0.6 * visible
}

/** The region split at its widest horizontal gaps, top to bottom. */
function horizontalBands(boxes: Box[]): Box[][] {
  const sorted = [...boxes].sort((a, b) => top(b) - top(a))
  const bands: Box[][] = []
  const gaps: number[] = []
  let floor = Infinity
  for (const box of sorted) {
    if (bands.length > 0 && top(box) < floor) {
      gaps.push(floor - top(box))
      bands.push([])
    }
    if (bands.length === 0) bands.push([])
    bands[bands.length - 1]!.push(box)
    floor = Math.min(floor, bottom(box))
  }
  if (bands.length < 2) return [boxes]
  const widest = Math.max(...gaps)
  const out: Box[][] = [bands[0]!]
  gaps.forEach((gap, i) => {
    if (gap >= 0.9 * widest) out.push([])
    out[out.length - 1]!.push(...bands[i + 1]!)
  })
  return out
}

/** Runs grouped into lines by vertical overlap, top to bottom, each read left to right. */
function linesOf(boxes: Box[], column: string, direction: number): Line[] {
  const rows: Array<{ boxes: Box[]; main: Box }> = []
  for (const box of [...boxes].sort((a, b) => b.y - a.y || a.x0 - b.x0)) {
    let best: (typeof rows)[number] | undefined
    let bestOverlap = 0.5
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 4; i--) {
      const row = rows[i]!
      const overlap = (Math.min(top(row.main), top(box)) - Math.max(bottom(row.main), bottom(box))) / Math.min(row.main.size, box.size)
      if (overlap >= bestOverlap) {
        best = row
        bestOverlap = overlap
      }
    }
    if (best) {
      best.boxes.push(box)
      if (box.text.length > best.main.text.length) best.main = box
    } else {
      rows.push({ boxes: [box], main: box })
    }
  }
  const lines: Line[] = []
  for (const row of rows) {
    let text = ''
    let reach = -Infinity
    let previous: Box | null = null
    for (const box of row.boxes.sort((a, b) => a.x0 - b.x0)) {
      const gap = (box.x0 - reach) / Math.max(previous?.size ?? 0, box.size)
      if (previous && (gap > SPACE_EM || gap < -OVERLAP_EM)) text += ' '
      text += box.text
      reach = Math.max(reach, box.x1)
      previous = box
    }
    text = text.replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
    if (text !== '') lines.push({ text, y: row.main.y, size: row.main.size, column, direction })
  }
  return lines
}

/** Lines in reading order grouped into paragraphs. */
function paragraphs(lines: Line[]): Line[][] {
  const ratios: number[] = []
  lines.forEach((line, i) => {
    const previous = lines[i - 1]
    if (previous && previous.column === line.column && previous.size === line.size) {
      const ratio = (previous.y - line.y) / line.size
      if (ratio > 0.8 && ratio < 3) ratios.push(ratio)
    }
  })
  const limit = Math.max(1.6, 1.3 * (ratios.length > 0 ? median(ratios) : 1.2))
  const out: Line[][] = []
  lines.forEach((line, i) => {
    const previous = lines[i - 1]
    const size = previous ? Math.max(previous.size, line.size) : 0
    const continues = previous !== undefined &&
      previous.column === line.column &&
      size <= 1.2 * Math.min(previous.size, line.size) &&
      previous.y - line.y > 0 &&
      previous.y - line.y <= limit * size
    if (continues) out[out.length - 1]!.push(line)
    else out.push([line])
  })
  return out
}
