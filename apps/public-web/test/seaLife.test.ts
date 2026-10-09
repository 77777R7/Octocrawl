import { describe, expect, it } from 'vitest'
import { CRAB, crabAlarmed, JELLY, jellyOpen, jellyRows, linkCells, rayRows, readState, renderState, SHOAL, shoalSlots } from '../src/seaLife.js'

describe('Sea life', () => {
  it('swims a shoal as a chevron, the leader at its point and no two fish in one place', () => {
    const slots = shoalSlots(5)
    expect(slots[0]).toEqual([0, 0])
    expect(slots.map(([dc]) => dc)).toEqual([0, 4, 8, 12, 16])
    expect(slots.map(([, dr]) => dr)).toEqual([0, 1, -1, 2, -2])
    expect(new Set(slots.map(s => s.join(','))).size).toBe(5)
    expect(shoalSlots(SHOAL.min)).toHaveLength(SHOAL.min)
  })

  it('alarms the crab only when the octopus is both near along the floor and low in the water', () => {
    const R = 27, floor = 500
    expect(crabAlarmed(300, floor, 300 + 2 * R, floor - R, R)).toBe(true)
    expect(crabAlarmed(300, floor, 300 + CRAB.nearR * R + 1, floor - R, R)).toBe(false)
    expect(crabAlarmed(300, floor, 300, floor - CRAB.lowR * R - 1, R)).toBe(false)
  })

  it('dots a line between two cells, neither end included, every other cell', () => {
    const cells = linkCells(0, 0, 8, 4)
    expect(cells).toEqual([[2, 1], [4, 2], [6, 3]])
    for (const [c, r] of cells) { expect(c).toBeGreaterThan(0); expect(c).toBeLessThan(8); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(4) }
    expect(linkCells(5, 5, 5, 5)).toEqual([])
    expect(linkCells(10, 3, 2, 3).map(([c]) => c)).toEqual([8, 6, 4])
  })

  it('runs the lines first, then reads the fish one by one, then lets the shoal go', () => {
    const n = 3
    expect(readState(0, n)).toEqual({ linking: true, reading: -1, done: false })
    expect(readState(SHOAL.linkMs + 10, n).reading).toBe(0)
    expect(readState(SHOAL.linkMs + SHOAL.readMs + 10, n).reading).toBe(-1)
    expect(readState(SHOAL.linkMs + SHOAL.readEveryMs + 10, n).reading).toBe(1)
    expect(readState(SHOAL.linkMs + 2 * SHOAL.readEveryMs + 10, n).reading).toBe(2)
    const end = SHOAL.linkMs + n * SHOAL.readEveryMs
    expect(readState(end + 10, n)).toEqual({ linking: false, reading: -1, done: false })
    expect(readState(end + SHOAL.restMs, n).done).toBe(true)
  })

  it('opens a jellyfish’s bell quickly and closes it slowly, once a pulse', () => {
    expect(jellyOpen(0)).toBeCloseTo(0)
    expect(jellyOpen(JELLY.pulseMs * 0.3)).toBeCloseTo(1)
    // A tenth of a pulse after it starts to open it is about half open; a tenth after it starts to close it is
    // still nearly open.
    expect(jellyOpen(JELLY.pulseMs * 0.1)).toBeLessThan(0.6)
    expect(jellyOpen(JELLY.pulseMs * 0.4)).toBeGreaterThan(0.9)
    expect(jellyOpen(JELLY.pulseMs)).toBeCloseTo(0)
    for (let t = 0; t < 3 * JELLY.pulseMs; t += 37) { expect(jellyOpen(t)).toBeGreaterThanOrEqual(-1e-9); expect(jellyOpen(t)).toBeLessThanOrEqual(1 + 1e-9) }
    expect(jellyRows(1, 0)[1]!.length).toBeGreaterThan(jellyRows(0, 0)[1]!.length)
    expect(jellyRows(0.5, 1)).toHaveLength(4)
  })

  it('makes the octopus wait out a jellyfish’s render before the { } comes, then lets it go', () => {
    const wait = JELLY.waitPulses * JELLY.pulseMs
    expect(renderState(0)).toEqual({ rendering: true, give: 0, done: false })
    expect(renderState(wait - 1).rendering).toBe(true)
    expect(renderState(wait + JELLY.giveMs / 2).give).toBeCloseTo(0.5)
    expect(renderState(wait + JELLY.giveMs)).toEqual({ rendering: false, give: 1, done: true })
  })

  it('beats a ray’s wings round, every row as wide as the rest, its nose leading the way it swims', () => {
    for (const dir of [1, -1]) for (let b = 0; b < 1; b += 0.1) {
      const rows = rayRows(dir, b)
      expect(rows).toHaveLength(5)
      expect(new Set(rows.map(r => r.length)).size).toBe(1)
      const body = rows[2]!
      if (dir > 0) { expect(body.trimEnd().endsWith('>')).toBe(true); expect(body.startsWith('~')).toBe(true) }
      else { expect(body.startsWith('<')).toBe(true); expect(body.trimEnd().endsWith('~')).toBe(true) }
    }
    expect(rayRows(-1, 0)).not.toEqual(rayRows(-1, 0.6))
    expect(rayRows(-1, 0.1)).toEqual(rayRows(-1, 1.1))
  })
})
