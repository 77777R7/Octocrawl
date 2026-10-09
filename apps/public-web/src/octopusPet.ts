/* What a touch on the octopus means (octopusSwim.ts), kept pure so it can be tested: the octopus itself needs a canvas. */

export const PET = {
  /** Touches this close together make a run, and every third touch in a run turns a somersault. */
  runMs: 4000,
  rollEvery: 3,
  /** This many touches inside this long, and it has had enough. */
  fedUpAt: 7,
  fedUpMs: 10000,
  /** A finger kept on it this long tickles. */
  holdMs: 500,
  /** How long a somersault takes. */
  rollMs: 900,
  /** The touch, counted in the last fedUpMs, at which it offers a game (▶), and how long the offer stands. */
  playAt: 5,
  playMs: 6000,
} as const

export type PetMood = 'glad' | 'roll' | 'fedUp'

/** What the touch at `now` means, given when it and the earlier ones landed. Touches older than fedUpMs are
 * forgotten. */
export function petMood(times: readonly number[], now: number): PetMood {
  const recent = times.filter(at => now - at < PET.fedUpMs)
  if (recent.length >= PET.fedUpAt) return 'fedUp'
  const run = recent.filter(at => now - at < PET.runMs).length
  return run > 0 && run % PET.rollEvery === 0 ? 'roll' : 'glad'
}

/** The somersault's angle `age` ms in: one full turn, easing in and out, upright again at the end. */
export function rollAngle(age: number, ms: number = PET.rollMs): number {
  const f = Math.max(0, Math.min(1, age / ms))
  return 2 * Math.PI * (f < 0.5 ? 2 * f * f : 1 - (2 - 2 * f) ** 2 / 2)
}

/** Whether the touch at `now` is the one at which it offers a game. */
export const offersPlay = (times: readonly number[], now: number): boolean => times.filter(at => now - at < PET.fedUpMs).length === PET.playAt

