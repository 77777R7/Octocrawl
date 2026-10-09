import { describe, expect, it } from 'vitest'
import { offersPlay, PET, petMood, rollAngle } from '../src/octopusPet.js'

describe('Petting the octopus', () => {
  it('is glad of a touch, turns a somersault on every third in a run, and has had enough of seven in ten seconds', () => {
    const touches: number[] = []
    const touch = (at: number) => { touches.push(at); return petMood(touches, at) }
    expect(touch(0)).toBe('glad')
    expect(touch(800)).toBe('glad')
    expect(touch(1600)).toBe('roll')
    expect(touch(2400)).toBe('glad')
    expect(touch(2500)).toBe('glad')
    expect(touch(2600)).toBe('roll')
    expect(touch(2700)).toBe('fedUp')
  })

  it('forgets touches older than ten seconds, and a pause starts a run afresh', () => {
    const earlier = [0, 100, 200, 300, 400, 500]
    expect(petMood([...earlier, 10600], 10600)).toBe('glad')
    expect(petMood([0, 1000, 6000], 6000)).toBe('glad')
    expect(petMood([0, 1000, 6000, 7000, 8000], 8000)).toBe('roll')
  })

  it('rolls one full turn, upright at both ends and halfway over in the middle', () => {
    expect(rollAngle(0)).toBe(0)
    expect(rollAngle(PET.rollMs / 2)).toBeCloseTo(Math.PI)
    expect(rollAngle(PET.rollMs)).toBeCloseTo(2 * Math.PI)
    expect(rollAngle(PET.rollMs * 2)).toBeCloseTo(2 * Math.PI)
    // Easing: it starts slowly.
    expect(rollAngle(PET.rollMs / 10)).toBeLessThan(2 * Math.PI / 10)
  })

  it('offers a game on the fifth touch inside ten seconds, and only then', () => {
    const touches = [0, 900, 1800, 2700]
    expect(offersPlay(touches, 2700)).toBe(false)
    expect(offersPlay([...touches, 3600], 3600)).toBe(true)
    expect(petMood([...touches, 3600], 3600)).not.toBe('fedUp')
    expect(offersPlay([...touches, 3600, 4500], 4500)).toBe(false)
    expect(offersPlay([0, 900, 1800, 2700, 12000], 12000)).toBe(false)
  })

})
