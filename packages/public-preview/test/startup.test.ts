import { describe, expect, it } from 'vitest'
import { startupTimings } from '../src/startup.js'

describe('startupTimings', () => {
  it('splits the start into Node’s boot, loading the modules and setting up, all from the process start', () => {
    const clock = { timeOrigin: Date.UTC(2026, 9, 30, 1, 2, 3, 400), now: () => 1234.6, nodeTiming: { bootstrapComplete: 50.4 } }
    expect(startupTimings(600.2, clock)).toEqual({ processStartedAt: '2026-10-30T01:02:03.400Z', nodeBootMs: 50, importsMs: 550, setupMs: 634, readyMs: 1235 })
  })

  it('reads this process when no clock is given', () => {
    const timings = startupTimings(performance.now())
    expect(Date.parse(timings.processStartedAt)).toBeLessThanOrEqual(Date.now())
    expect(timings.readyMs).toBeGreaterThanOrEqual(timings.nodeBootMs)
    expect(timings.setupMs).toBeGreaterThanOrEqual(0)
  })
})
