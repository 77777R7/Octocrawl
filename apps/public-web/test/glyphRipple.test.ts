import { describe, expect, it } from 'vitest'
import { cloudCell } from '../src/glyphArt.js'
import { rippleCell } from '../src/glyphRipple.js'

const COLS = 70, ROWS = 34, SEED = 5
const cells = Array.from({ length: COLS * ROWS }, (_, i) => ({ x: i % COLS, y: Math.floor(i / COLS), ...cloudCell(i % COLS, Math.floor(i / COLS), COLS, ROWS, SEED) }))
const times = Array.from({ length: 40 }, (_, i) => i * 0.37)

describe('Glyph ripple', () => {
  it('keeps the heading’s clear centre clear at every moment', () => {
    for (const t of times) for (const { d, ink } of cells.filter(cell => cell.d < 0.3)) expect(rippleCell(d, ink, 0.5, t).level).toBe(0)
  })

  it('stays within its marks, its ink and its colour range', () => {
    for (const t of times) for (const { d, ink } of cells) {
      const { level, alpha, warm } = rippleCell(d, ink, 0.3, t)
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThan(6)
      expect(warm).toBeGreaterThanOrEqual(0)
      expect(warm).toBeLessThanOrEqual(1)
      if (level === 0) expect(alpha).toBe(0)
    }
  })

  it('moves its orange ring outward and lets it cool behind', () => {
    // The warmest distance along one ray, a moment apart: it grows while the swell spreads (mid-ray around t = 6 s).
    const ray = Array.from({ length: 60 }, (_, i) => 0.4 + i * 0.012)
    const warmest = (t: number) => ray.reduce((best, d) => rippleCell(d, 0.6, 0, t).warm > rippleCell(best, 0.6, 0, t).warm ? d : best, ray[0]!)
    expect(warmest(6)).toBeGreaterThan(warmest(5.6))
    expect(Math.max(...ray.map(d => rippleCell(d, 0.6, 0, 5.8).warm))).toBeGreaterThan(0.6)
    expect(Math.min(...ray.map(d => rippleCell(d, 0.6, 0, 5.8).warm))).toBeLessThan(0.1)
  })
})
