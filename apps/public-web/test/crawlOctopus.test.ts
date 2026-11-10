import { describe, expect, it } from 'vitest'
import { createOctopus, SLAP_MS, type OctoCell, type OctopusFrame } from '../src/crawlOctopus'

const PITCH_X = 8
const PITCH_Y = 14
const MANTLE = new Set(['lit', 'body', 'shade', 'sheen', 'eye', 'lid'])
const REST = { dt: 16, scale: 1, sx: 1, sy: 1, mode: 'crawl', eyes: 'open', look: 0, heat: 0 } as const

/** An octopus that has stood still at (x, 300) for `ms`, drawn a frame every 16 ms. */
function standing(ms: number, frame: Partial<OctopusFrame> = {}, x = 400): OctoCell[] {
  const octopus = createOctopus({ pitchX: PITCH_X, pitchY: PITCH_Y, size: 1, seed: 7 })
  octopus.place(x, 300, 0)
  for (let now = 16; now <= ms; now += 16) octopus.update({ ...REST, now, x, y: 300, ...frame })
  return octopus.cells(0, 0)
}
/** The cells as rows of text, the eyes' dark cells as `_`. */
function typed(cells: OctoCell[]): string[] {
  const left = Math.min(...cells.map((cell) => cell.col))
  const top = Math.min(...cells.map((cell) => cell.row))
  const rows: string[][] = []
  for (const cell of cells) {
    const row = (rows[cell.row - top] ??= [])
    row[cell.col - left] = cell.tone === 'eye' && cell.char === ' ' ? '_' : cell.char
  }
  return [...rows].map((row) => [...(row ?? [])].map((char) => char ?? ' ').join(''))
}
const mantleOf = (cells: OctoCell[]): OctoCell[] => cells.filter((cell) => MANTLE.has(cell.tone))

describe('the crawl window octopus', () => {
  it('types one glyph into each cell it covers, every cell on the grid', () => {
    const cells = standing(2000)
    const places = new Set(cells.map((cell) => `${cell.col},${cell.row}`))
    expect(places.size).toBe(cells.length)
    for (const cell of cells) {
      expect(Number.isInteger(cell.col) && Number.isInteger(cell.row)).toBe(true)
      expect(cell.char).toHaveLength(1)
    }
  })

  it('has a mantle that is a stamp: a dome over a belt with two eyes in it, the same on both sides', () => {
    expect(typed(mantleOf(standing(2000)))).toEqual([
      '     ,======,',
      ' ,===########===,',
      '=################=',
      '=################=',
      "=####'_####'_####=",
      '=################=',
      ' \\##############/',
    ])
  })

  it('types the mantle the same wherever it stands between cells, a whole cell further when it has moved one', () => {
    const at = (x: number): string[] => mantleOf(standing(700, {}, x)).map((cell) => `${cell.col},${cell.row},${cell.char}`).sort()
    expect(at(403)).toEqual(at(400))
    expect(at(397)).toEqual(at(400))
    const moved = mantleOf(standing(700, {}, 408))
    expect(Math.min(...moved.map((cell) => cell.col))).toBe(Math.min(...mantleOf(standing(700)).map((cell) => cell.col)) + 1)
  })

  it('draws the same octopus for the same link, and has not drawn its arms before they unfurl', () => {
    expect(standing(2000)).toEqual(standing(2000))
    expect(standing(160).every((cell) => MANTLE.has(cell.tone))).toBe(true)
  })

  it('hangs eight arms below the mantle, one stroke each, holding the page while it stands', () => {
    const cells = standing(2000)
    const foot = Math.max(...mantleOf(cells).map((cell) => cell.row))
    const arms = cells.filter((cell) => !MANTLE.has(cell.tone))
    // No arm shows beside or above the mantle, and no row has more of them than there are arms.
    const perRow = new Map<number, number>()
    for (const cell of arms) {
      expect(cell.row).toBeGreaterThan(foot)
      perRow.set(cell.row, (perRow.get(cell.row) ?? 0) + 1)
    }
    expect(perRow.get(foot + 1)).toBe(8)
    for (const count of perRow.values()) expect(count).toBeLessThanOrEqual(8)
    const holds = cells.filter((cell) => cell.tone === 'tip')
    expect(holds.length).toBeGreaterThanOrEqual(6)
    expect(holds.every((cell) => cell.char === 'J' || cell.char === 'L')).toBe(true)
    expect(holds.some((cell) => cell.char === 'J') && holds.some((cell) => cell.char === 'L')).toBe(true)
  })

  it('reaches no arm past a shut gate, walking or holding on to something beyond it', () => {
    const bar = 300 + 5 * PITCH_Y
    const cells = standing(2000, { bar })
    expect(Math.max(...cells.map((cell) => cell.row))).toBeLessThanOrEqual(Math.floor(bar / PITCH_Y))
    // Asked to hold two points far below the gate, its arms come to rest on the gate instead.
    const grip = [{ x: 320, y: bar + 9 * PITCH_Y }, { x: 480, y: bar + 9 * PITCH_Y }] as const
    const holding = standing(2600, { bar, mode: 'hold', grip })
    expect(Math.max(...holding.map((cell) => cell.row))).toBeLessThanOrEqual(Math.floor(bar / PITCH_Y))
    expect(holding.filter((cell) => cell.tone === 'tip')).toHaveLength(2)
    // With no gate it reaches them.
    const free = standing(2600, { mode: 'hold', grip })
    expect(Math.max(...free.filter((cell) => cell.tone === 'tip').map((cell) => cell.row))).toBe(Math.floor((bar + 9 * PITCH_Y) / PITCH_Y))
  })

  it('keeps its column when the grid under it is stretched', () => {
    const octopus = createOctopus({ pitchX: PITCH_X, pitchY: PITCH_Y, size: 1, seed: 7 })
    octopus.place(400, 300, 0)
    for (let now = 16; now <= 1500; now += 16) octopus.update({ ...REST, now, x: 400, y: 300 })
    const before = Math.min(...mantleOf(octopus.cells(0, 0)).map((cell) => cell.col))
    // Columns half as wide again: the same column is half as far again across the page.
    octopus.setPitch(PITCH_X * 1.5)
    for (let now = 1516; now <= 2400; now += 16) octopus.update({ ...REST, now, x: 600, y: 300 })
    const after = mantleOf(octopus.cells(0, 0))
    // The mantle is as wide in pixels as before, so it takes fewer of the wider columns, about the same centre.
    const centre = (cells: OctoCell[]): number => (Math.min(...cells.map((cell) => cell.col)) + Math.max(...cells.map((cell) => cell.col)) + 1) / 2
    expect(centre(after)).toBe(50)
    expect(Math.min(...after.map((cell) => cell.col))).toBeGreaterThan(before)
    expect(after.every((cell) => Number.isInteger(cell.col))).toBe(true)
  })

  it('lets go and throws its arms above the mantle when it dives, and is nothing before it has grown', () => {
    const octopus = createOctopus({ pitchX: PITCH_X, pitchY: PITCH_Y, size: 1, seed: 7 })
    octopus.place(400, 300, 0)
    expect(octopus.cells(0, 0)).toEqual([])
    for (let now = 16; now <= 1500; now += 16) octopus.update({ ...REST, now, x: 400, y: 300 })
    let y = 300
    for (let now = 1516; now <= 2100; now += 16) octopus.update({ ...REST, now, x: 400, y: (y += 12), mode: 'dive' })
    const cells = octopus.cells(0, 0)
    const top = Math.min(...mantleOf(cells).map((cell) => cell.row))
    const foot = Math.max(...mantleOf(cells).map((cell) => cell.row))
    const arms = cells.filter((cell) => !MANTLE.has(cell.tone))
    expect(arms.length).toBeGreaterThan(8)
    expect(arms.filter((cell) => cell.row < top).length).toBeGreaterThan(arms.length / 2)
    expect(arms.some((cell) => cell.row > foot)).toBe(false)
    expect(cells.some((cell) => cell.tone === 'tip')).toBe(false)
  })

  it('slaps its arms out along the ground when it lands, then throws them up', () => {
    const octopus = createOctopus({ pitchX: PITCH_X, pitchY: PITCH_Y, size: 1, seed: 7 })
    octopus.place(400, 300, 0)
    for (let now = 16; now <= 1500; now += 16) octopus.update({ ...REST, now, x: 400, y: 300 })
    const ground = 420
    const y = ground - octopus.belly
    const land = (from: number, to: number): OctoCell[] => {
      for (let now = from; now <= to; now += 16) octopus.update({ ...REST, now, x: 400, y, mode: 'land', ground, eyes: 'squint' })
      return octopus.cells(0, 0)
    }
    const slapped = land(1516, 1516 + SLAP_MS - 60)
    const flat = slapped.filter((cell) => !MANTLE.has(cell.tone))
    const groundRow = ground / PITCH_Y
    // Along the two rows above the ground, out past the mantle on both sides.
    expect(flat.every((cell) => cell.row === groundRow - 1 || cell.row === groundRow - 2)).toBe(true)
    expect(flat.filter((cell) => cell.char === '~').length).toBeGreaterThan(20)
    expect(Math.min(...flat.map((cell) => cell.col))).toBeLessThan(Math.min(...mantleOf(slapped).map((cell) => cell.col)) - 8)
    expect(Math.max(...flat.map((cell) => cell.col))).toBeGreaterThan(Math.max(...mantleOf(slapped).map((cell) => cell.col)) + 8)
    const thrown = land(1516 + SLAP_MS, 1516 + SLAP_MS + 700)
    const top = Math.min(...mantleOf(thrown).map((cell) => cell.row))
    const up = thrown.filter((cell) => !MANTLE.has(cell.tone))
    expect(up.filter((cell) => cell.row < top).length).toBeGreaterThan(up.length / 2)
    expect(Math.min(...up.map((cell) => cell.row))).toBeGreaterThanOrEqual(Math.floor((y - octopus.rise) / PITCH_Y) - 1)
    const half = Math.max(...up.map((cell) => Math.abs((cell.col + 0.5) * PITCH_X - 400)))
    expect(half).toBeLessThanOrEqual(octopus.span + PITCH_X)
  })
})
