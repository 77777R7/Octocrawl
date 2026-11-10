/** Judges a decorative frame loop's pace, so a device too slow to animate gives the motion up for the visit. Frames in
 * the first SETTLE_MS after the loop starts or resumes never count: the browser is still busy then whatever the device
 * (a tab brought back to the front, a page the browser restores after discarding it), and a slow frame there once
 * ended the hero's motion for good. */
export const SETTLE_MS = 2000

export interface PaceLimits {
  /** A frame later than this counts as slow; a frame on time takes one back. */
  slowMs: number
  /** For this long after the first counted frame the early limit holds, then the later one. */
  earlyMs: number
  earlyLimit: number
  laterLimit: number
}

export interface FramePace {
  /** The loop starts or resumes at `now`: the count starts over after the settling time. */
  start(now: number): void
  /** A frame `gap` ms after the last one (0 when there was none, or the frame must not count): true once the device
   * has proved too slow. */
  tooSlow(now: number, gap: number): boolean
}

export function framePace(limits: PaceLimits): FramePace {
  let slow = 0
  let first = 0
  let countFrom = 0
  return {
    start(now) {
      slow = 0
      countFrom = now + SETTLE_MS
    },
    tooSlow(now, gap) {
      if (now < countFrom) return false
      first ||= now
      slow = gap > limits.slowMs ? slow + 1 : Math.max(0, slow - 1)
      return slow >= (now - first < limits.earlyMs ? limits.earlyLimit : limits.laterLimit)
    },
  }
}
