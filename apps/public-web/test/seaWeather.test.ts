import { describe, expect, it } from 'vitest'
import { rippleCell } from '../src/glyphRipple.js'
import { currentAt, glintAt, scanCell, scanSeconds, snowCells, wakeLift, WEATHER, weatherMix } from '../src/seaWeather.js'

const times = Array.from({ length: 600 }, (_, i) => i * 0.5)

describe('Sea weather', () => {
  it('is calm at the start of each round, then a current, calm again, then surface light, never two at once', () => {
    expect(weatherMix(0)).toEqual({ current: 0, glints: 0 })
    expect(weatherMix(26).current).toBe(1)
    expect(weatherMix(56)).toEqual({ current: 0, glints: 0 })
    expect(weatherMix(86).glints).toBe(1)
    expect(weatherMix(114)).toEqual({ current: 0, glints: 0 })
    expect(weatherMix(26 + WEATHER.cycle).current).toBe(1)
    for (const t of times) { const { current, glints } = weatherMix(t); expect(current * glints).toBe(0) }
  })

  it('fades each state in and out rather than switching it', () => {
    const [a] = WEATHER.current
    const mid = weatherMix(a + WEATHER.fade / 2).current
    expect(mid).toBeGreaterThan(0.2)
    expect(mid).toBeLessThan(0.8)
  })

  it('runs the current across the cloud once in its window', () => {
    const [a, b] = WEATHER.current
    const peak = (t: number) => Array.from({ length: 101 }, (_, i) => i / 100).reduce((best, x) => currentAt(x, 0.5, t) > currentAt(best, 0.5, t) ? x : best, 0)
    expect(peak(a + 8)).toBeLessThan(peak(a + 20))
    expect(peak(a + 20)).toBeLessThan(peak(b - 8))
  })

  it('keeps the surface light to the top third', () => {
    for (const t of times.slice(0, 80)) for (let col = 0; col < 150; col += 3) expect(glintAt(col, 12, 30, t)).toBe(0)
    expect(Math.max(...times.slice(0, 80).flatMap(t => Array.from({ length: 50 }, (_, c) => glintAt(c * 3, 2, 30, t))))).toBeGreaterThan(0.5)
  })

  it('lets only a few flakes fall, each down one column, inside the cloud', () => {
    for (const t of times) {
      const cells = snowCells(t, 150, 30, 11)
      expect(cells).toHaveLength(WEATHER.flakes)
      for (const [c, r] of cells) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(150); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(30) }
    }
    const [c0, r0] = snowCells(10, 150, 30, 11)[0]!
    const [c1, r1] = snowCells(11, 150, 30, 11)[0]!
    expect(c1).toBe(c0)
    expect(r1).toBeGreaterThanOrEqual(r0)
  })

  it('re-types a trail behind the scan and leaves the row settled once it has passed', () => {
    expect(scanCell(50, 0)).toBeNull()
    const at = 50 / WEATHER.scanSpeed
    expect(scanCell(50, at)!.warm).toBeGreaterThan(0.8)
    expect(scanCell(50, at + 5 / WEATHER.scanSpeed)!.lift).toBeLessThan(scanCell(50, at)!.lift)
    expect(scanCell(50, at + (WEATHER.scanTrail + 1) / WEATHER.scanSpeed)).toBeNull()
    for (let age = 0; age < 3; age += 0.05) { const s = scanCell(10, age); if (s) { expect(s.level).toBeGreaterThanOrEqual(1); expect(s.level).toBeLessThanOrEqual(4) } }
    expect(scanCell(149, scanSeconds(150))).toBeNull()
  })

  it('leaves a wake that is strongest on the path, reaches a few cells and fades', () => {
    expect(wakeLift(0, 0, 0)).toBe(1)
    expect(wakeLift(2, 0, 0)).toBeLessThan(wakeLift(1, 0, 0))
    expect(wakeLift(0, 1, 0)).toBeLessThan(wakeLift(1, 0, 0))
    expect(wakeLift(WEATHER.wakeReach, 0, 0)).toBe(0)
    expect(wakeLift(0, 0, WEATHER.wakeMs / 2)).toBeCloseTo(0.5)
    expect(wakeLift(0, 0, WEATHER.wakeMs)).toBe(0)
  })

  it('never fills the heading’s clear centre, whatever the weather adds', () => {
    for (const t of times.slice(0, 40)) for (const d of [0, 0.1, 0.2, 0.29]) expect(rippleCell(d, 0, 0.5, t, { lift: 1, warm: 1 }).level).toBe(0)
  })

  it('lifts and warms the cloud’s marks where the weather adds, and leaves it as before where it adds nothing', () => {
    for (const t of times.slice(0, 40)) {
      expect(rippleCell(0.8, 0.4, 0.3, t, { lift: 0, warm: 0 })).toEqual(rippleCell(0.8, 0.4, 0.3, t))
      const plain = rippleCell(0.8, 0.4, 0.3, t)
      const lifted = rippleCell(0.8, 0.4, 0.3, t, { lift: 0.5, warm: 0.6 })
      expect(lifted.level).toBeGreaterThanOrEqual(plain.level)
      expect(lifted.warm).toBeGreaterThanOrEqual(plain.warm)
    }
  })
})
