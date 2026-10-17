/** The glyph octopus and its landing, shared by the home page's crawl window (crawlView.ts) and the /scrape/ page's
 * demo (product/scrapeDrop.ts): its sprite, the density ramp cells run down as they are read, and the thud's debris,
 * dust, burst and shake. */

export const RAMP = ['X', 'x', '+', ':']
/** A read cell settles into one of these, picked by its place, so the read content reads as a glyph texture. */
export const TEXTURE = ['x', '+', ':', '*', '/', '\\', '=', 'x', '+', '#']
export const HOT = ['#fff1e0', '#ffc59a', '#ff9a66', '#fb7b4c']

// The octopus: its mantle, eyes (O, drawn as navy cells as on the hero's static octopus) and two strides of arms.
export const MANTLE = [
  '    ,=####=,    ',
  '  ,##########,  ',
  ' =###O####O###= ',
  ' =############= ',
  '  \\##########/  ',
]
export const ARMS = [[
  '  /x/ x||x \\x\\  ',
  ' / /  x||x  \\ \\ ',
  ' + :  : :: :  + ',
], [
  '  \\x\\ x||x /x/  ',
  '   \\ \\x||x/ /   ',
  '  :  + :: +  :  ',
]]
// Landing: squashed flat, arms splayed.
export const SQUASH = [
  '   ,=########=,   ',
  ' =####O####O####= ',
  '=################=',
  ' \\##############/ ',
  '/x/x/ x||||x \\x\\x\\',
]
export const SPRITE_W = MANTLE[0]!.length
export const SPRITE_H = MANTLE.length + ARMS[0]!.length
/** The thud's flying bits: column speed, upward row speed and glyph, fixed so every landing looks alike. */
export const DEBRIS: ReadonlyArray<readonly [number, number, string]> = [
  [-22, 14, '.'], [-17, 20, "'"], [-13, 26, '*'], [-9, 17, ','], [-6, 29, '.'], [-3, 22, "'"], [-1, 31, '*'],
  [2, 24, "'"], [4, 30, '*'], [7, 19, '.'], [10, 27, ','], [14, 21, "'"], [18, 16, '.'], [23, 13, '*'],
]
/** The dust rolling away along the ground: starting speed (columns a second), row above the ground and glyph. */
export const DUST: ReadonlyArray<readonly [number, number, string]> = [
  [34, 0, '~'], [27, 0, '.'], [22, 1, '~'], [17, 1, ','], [12, 0, '~'], [9, 2, '.'],
]
/** How long the landing's shock, dome and dust run, and how fast the dome spreads (px a ms). */
export const THUD_MS = 900
/** The burst's rays: angle (degrees, 0 along the ground to the right, 90 straight up), length as a share of the
 * window (of its width for the ground-hugging ones, which are two rows thick, else its height), and thickness. */
export const BURST: ReadonlyArray<readonly [number, number, boolean]> = [
  [4, 0.95, true], [16, 0.55, false], [28, 0.8, false], [42, 0.5, false], [57, 0.72, false], [72, 0.45, false],
  [84, 0.85, false], [96, 0.6, false], [110, 0.78, false], [124, 0.48, false], [139, 0.7, false], [152, 0.52, false],
  [164, 0.62, false], [176, 0.95, true],
]
/** The burst shoots out in BURST_GROW_MS, holds until BURST_HOLD_MS, and is eaten from the root in BURST_FADE_MS. */
export const BURST_GROW_MS = 110
export const BURST_HOLD_MS = 360
export const BURST_FADE_MS = 300
/** The window's content jumps by whole rows after the landing: one step every SHAKE_STEP_MS. */
export const SHAKE = [1, -1, 1, 0, -1, 0]
export const SHAKE_STEP_MS = 45

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
export const easeOut = (t: number): number => 1 - (1 - t) ** 3
export const easeIn = (t: number): number => t ** 3
