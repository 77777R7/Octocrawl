import { describe, expect, it } from 'vitest'
import { GAME, newGame, secondsLeft, seeded, step, type State, type Steer, type Thing } from '../src/seaGame.js'

const still: Steer = { x: 0, y: 0, ink: false }
/** A game with no surprises: nothing spawns unless a test puts it there. */
function quiet(cols = 80, rows = 30): State {
  const s = newGame(cols, rows, seeded(7))
  s.nextFish = s.nextJelly = Number.POSITIVE_INFINITY
  return s
}
let ids = 1000
const fish = (s: State, kind: Thing['kind'], dx = 1, dy = 1): Thing => {
  const t: Thing = { id: ids++, kind, x: s.octo.x + dx, y: s.octo.y + dy, vx: 0, vy: 0, w: kind === 'big' ? 6 : kind === 'jelly' ? 5 : 3, h: kind === 'jelly' ? 3 : 1, seed: 0 }
  s.things.push(t)
  return t
}

describe('The octopus game', () => {
  it('starts with a full minute, three lives, nothing read, and the crab’s floor along the bottom on one side', () => {
    const s = newGame(80, 30, seeded(1))
    expect(secondsLeft(s)).toBe(GAME.seconds)
    expect(s.lives).toBe(3)
    expect(s.score).toBe(0)
    expect(s.zone.y1).toBe(30)
    expect(s.zone.y1 - s.zone.y0).toBe(GAME.zoneRows)
    expect(s.zone.x0 === 0 || s.zone.x1 === 80).toBe(true)
  })

  it('reads a fish as one page and a big one with braces as three', () => {
    const s = quiet()
    fish(s, 'fish')
    expect(step(s, still, 16)).toEqual([expect.objectContaining({ type: 'catch', points: 1 })])
    fish(s, 'big')
    step(s, still, 16)
    expect(s.score).toBe(4)
    expect(s.pages).toBe(2)
    expect(s.structured).toBe(1)
    expect(s.things).toHaveLength(0)
  })

  it('answers 429 to a third page inside a second, and slows the octopus for a while', () => {
    const s = quiet()
    for (let i = 0; i < 2; i++) { fish(s, 'fish'); step(s, still, 200) }
    expect(s.limited).toBe(0)
    fish(s, 'fish')
    expect(step(s, still, 200).map(e => e.type)).toEqual(['catch', '429'])
    expect(s.octo.slowUntil).toBeGreaterThan(s.t)
    // Slowed, it cannot reach its full speed.
    for (let i = 0; i < 60; i++) step(s, { x: 1, y: 0, ink: false }, 16)
    expect(Math.hypot(s.octo.vx, s.octo.vy)).toBeLessThanOrEqual(GAME.topSpeed * GAME.limited + 1e-9)
  })

  it('does not count pages read a second or more apart', () => {
    const s = quiet()
    for (let i = 0; i < 4; i++) { fish(s, 'fish'); step(s, still, 600) }
    expect(s.pages).toBe(4)
    expect(s.limited).toBe(0)
  })

  it('is stung still by a jellyfish for two seconds, then free, and not stung again straight away', () => {
    const s = quiet()
    const jelly = fish(s, 'jelly', 0, 0)
    expect(step(s, still, 16).map(e => e.type)).toEqual(['stung'])
    const x = s.octo.x
    for (let i = 0; i < 60; i++) step(s, { x: 1, y: 0, ink: false }, 16)
    expect(s.octo.x).toBe(x)
    // Still in the jellyfish's reach just after the sting wears off, it is not stung again during its grace…
    const stungFor = s.octo.stungUntil - s.t
    step(s, still, stungFor + 100)
    jelly.x = s.octo.x
    jelly.y = s.octo.y
    expect(step(s, still, 16).map(e => e.type)).not.toContain('stung')
    expect(s.stung).toBe(1)
    // …and is once the grace is over.
    jelly.x = s.octo.x
    jelly.y = s.octo.y
    expect(step(s, still, s.octo.graceUntil - s.t + 1).map(e => e.type)).toContain('stung')
    expect(s.stung).toBe(2)
    s.things = []
    s.octo.stungUntil = s.t
    const free = s.octo.x
    for (let i = 0; i < 80; i++) step(s, { x: 1, y: 0, ink: false }, 16)
    expect(s.octo.x).toBeGreaterThan(free)
  })

  it('pinches an octopus that goes into the crab’s floor, takes a life, sends it up, and gives it a moment’s grace', () => {
    const s = quiet()
    s.octo.x = s.zone.x0 + 2
    s.octo.y = s.rows - GAME.octoH
    expect(step(s, still, 16).map(e => e.type)).toEqual(['pinched'])
    expect(s.lives).toBe(2)
    expect(s.octo.vy).toBeLessThan(0)
    step(s, still, 16)
    expect(s.lives).toBe(2)
  })

  it('does not read a fish inside the crab’s floor', () => {
    const s = quiet()
    s.octo.x = s.zone.x0 + 2
    s.octo.y = s.zone.y0 - 1
    s.octo.inkUntil = Number.POSITIVE_INFINITY
    fish(s, 'fish', 1, 2)
    step(s, still, 16)
    expect(s.pages).toBe(0)
  })

  it('dashes and is covered while inked, then must wait for the ink to come back', () => {
    const s = quiet()
    s.octo.x = s.zone.x0 + 2
    s.octo.y = s.rows - GAME.octoH - 1
    const y = s.octo.y
    expect(step(s, { x: 0, y: 1, ink: true }, 16).map(e => e.type)).toContain('ink')
    // The dash: faster than it can swim, the way it steered.
    expect(s.octo.vy).toBeGreaterThan(GAME.topSpeed)
    expect(s.octo.y).toBeGreaterThan(y)
    expect(s.lives).toBe(3)
    fish(s, 'jelly', 0, 0)
    step(s, still, 16)
    expect(s.stung).toBe(0)
    expect(step(s, { x: 0, y: -1, ink: true }, 16).map(e => e.type)).not.toContain('ink')
    for (let t = 0; t < GAME.inkCooldownMs; t += 100) step(s, { x: 0, y: -1, ink: false }, 100)
    s.things = []
    expect(step(s, { x: 0, y: -1, ink: true }, 16).map(e => e.type)).toContain('ink')
  })

  it('ends after a minute, or with the last life, and then stands still', () => {
    const a = quiet()
    let events = step(a, still, GAME.seconds * 1000 - 1)
    expect(a.over).toBe(false)
    events = step(a, still, 1)
    expect(events.at(-1)).toEqual({ type: 'over' })
    expect(step(a, still, 16)).toEqual([])
    const b = quiet()
    b.lives = 1
    b.octo.x = b.zone.x0 + 2
    b.octo.y = b.rows - GAME.octoH
    expect(step(b, still, 16).map(e => e.type)).toEqual(['pinched', 'over'])
    expect(b.lives).toBe(0)
  })

  it('keeps the octopus in the sea and the sea busier as the minute goes on', () => {
    const s = newGame(80, 30, seeded(3))
    let early = 0, late = 0
    for (let i = 0; i < GAME.seconds * 1000 / 50; i++) {
      const before = s.nextId
      step(s, { x: Math.sin(i / 20), y: Math.cos(i / 31), ink: false }, 50)
      if (s.over) break
      if (s.t < 20000) early += s.nextId - before
      if (s.t > 40000) late += s.nextId - before
      expect(s.octo.x).toBeGreaterThanOrEqual(0)
      expect(s.octo.x).toBeLessThanOrEqual(80 - GAME.octoW)
      expect(s.octo.y).toBeGreaterThanOrEqual(1)
      expect(s.octo.y).toBeLessThanOrEqual(30 - GAME.octoH)
    }
    expect(late).toBeGreaterThan(early)
  })
})
