import { describe, expect, it } from 'vitest'
import { SETTLE_MS, framePace } from '../src/framePace.js'

// The pace judge the hero's octopus and glyphs share (src/framePace.ts): slow frames while a loop settles never
// count, and a device that stays slow afterwards still gives the motion up.
const limits = { slowMs: 80, earlyMs: 5000, earlyLimit: 6, laterLimit: 12 }

/** Runs frames `gap` ms apart from `from` until `until`, and says when the judge first called the device too slow. */
function run(pace: ReturnType<typeof framePace>, from: number, until: number, gap: number): number | null {
  for (let now = from + gap; now <= until; now += gap) if (pace.tooSlow(now, gap)) return now
  return null
}

describe('framePace', () => {
  it('lets a loop settle after it starts or resumes, however slow its frames are then', () => {
    const pace = framePace(limits)
    pace.start(0)
    expect(run(pace, 0, SETTLE_MS - 1, 150)).toBeNull()
    expect(run(pace, SETTLE_MS, SETTLE_MS + 3000, 16)).toBeNull()
    // A tab brought back to the front, long after the start: slow first frames start nothing either.
    pace.start(200_000)
    expect(run(pace, 200_000, 200_000 + SETTLE_MS - 1, 300)).toBeNull()
  })

  it('still gives up on a device that stays slow once the loop has settled', () => {
    const pace = framePace(limits)
    pace.start(0)
    // Six slow frames after the settling time, while the early limit holds.
    expect(run(pace, 0, 10_000, 120)).toBe(Math.ceil(SETTLE_MS / 120) * 120 + 5 * 120)
  })

  it('counts afresh after a resume, and judges a gap of 0 a frame on time', () => {
    const pace = framePace(limits)
    pace.start(0)
    let now = SETTLE_MS
    for (let i = 0; i < 5; i++) expect(pace.tooSlow((now += 120), 120)).toBe(false)
    pace.start(now)
    now += SETTLE_MS
    for (let i = 0; i < 5; i++) expect(pace.tooSlow((now += 120), 120)).toBe(false)
    expect(pace.tooSlow((now += 16), 0)).toBe(false)
  })
})
