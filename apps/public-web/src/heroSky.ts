/** The hero's night sky, drawn on the glyph layer's canvas and clock (heroGlyphs.ts). The painting has almost no
 * stars of its own in the dark sky to the upper left, so this sky is densest and busiest there and thins out towards
 * the sunset: stars that twinkle, some written in the artwork's own marks, with brief flares among them, and meteors
 * now and then, sometimes in pairs. Nothing is drawn over the page's text, the sunset clouds or the mountain. */
import { between, hash, seeded, smooth } from './heroArtwork'

const TAU = Math.PI * 2
// About one star per STAR_AREA square px where the sky is darkest, far fewer towards the sunset and the horizon.
const STAR_AREA = 2600
const STAR_COLORS = ['244,247,255', '207,224,255', '255,234,204']
// Each star colour at 21 levels of light, so no frame builds colour strings.
const STAR_STYLES = STAR_COLORS.map((rgb) => Array.from({ length: 21 }, (_, level) => `rgba(${rgb},${(level / 20).toFixed(2)})`))
// The soft glow around the larger stars (css px), by size.
const STAR_GLOW = [0, 0, 14, 20]
// Sprites are drawn once at this size and scaled down onto the canvas.
const SPRITE = 64
// Every so often a star somewhere flares for a moment, never more than FLARES at once.
const FLARE_REST = [300, 900] as const
const FLARE_MS = [700, 1100] as const
const FLARES = 4
const METEOR_FIRST = [600, 1600] as const
const METEOR_REST = [5000, 12000] as const
// A meteor sheds sparks this far apart (css px) that linger for a moment after it passes.
const DEBRIS_STEP = 26
const DEBRIS_MS = 420

export type SkyView = {
  width: number
  height: number
  // Where the starry sky ends (css px), above the summit.
  skyline: number
  // The artwork's glyph cell on the canvas (css px), which sizes the stars written in its marks.
  cell: number
  // How much light the page lets through at a point (stars may come nearer the header's links), and how much of it
  // the sunset clouds cover (0 to 1).
  calmAt(x: number, y: number, star?: boolean): number
  cloudAt(x: number, y: number): number
}
export type Sky = {
  layout(view: SkyView): void
  /** Starts the sky's own events (flares and meteors) as the glyph layer's clock reaches them. */
  step(clock: number): void
  draw(context: CanvasRenderingContext2D, clock: number, gain: number): void
}

type Star = {
  x: number
  y: number
  size: number
  // Written in the artwork's marks (a dot that opens into a plus) rather than as a point of light.
  mark: boolean
  base: number
  color: number
  period: number
  phase: number
  // Some stars also scintillate: a quick flicker of this depth over their slow twinkle.
  flicker: number
  flickerPeriod: number
  calm: number
  // How dark the sky is around it (0 to 1): flares favour the dark sky.
  dark: number
}
type Flare = { star: Star; at: number; life: number; size: number }
type Meteor = { at: number; x: number; y: number; dx: number; dy: number; speed: number; travel: number; life: number; length: number; width: number; bright: number }

/** A star's soft glow in one colour. */
function glowSprite(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE
  canvas.height = SPRITE
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const mid = SPRITE / 2
  const glow = context.createRadialGradient(mid, mid, 0, mid, mid, mid)
  glow.addColorStop(0, `rgba(${color},1)`)
  glow.addColorStop(0.12, `rgba(${color},0.85)`)
  glow.addColorStop(0.3, `rgba(${color},0.2)`)
  glow.addColorStop(0.6, `rgba(${color},0.04)`)
  glow.addColorStop(1, `rgba(${color},0)`)
  context.fillStyle = glow
  context.fillRect(0, 0, SPRITE, SPRITE)
  return canvas
}

/** A star's rays in one colour, brightest at the centre: four for a twinkle, and for a flare four shorter diagonal
 * ones and a bright core as well, like a bright star's spikes. */
function raySprite(color: string, flare: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE
  canvas.height = SPRITE
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const mid = SPRITE / 2
  context.translate(mid, mid)
  const ray = (angle: number, reach: number, alpha: number): void => {
    context.save()
    context.rotate(angle)
    const fade = context.createLinearGradient(-reach, 0, reach, 0)
    fade.addColorStop(0, `rgba(${color},0)`)
    fade.addColorStop(0.5, `rgba(${color},${alpha})`)
    fade.addColorStop(1, `rgba(${color},0)`)
    context.fillStyle = fade
    context.fillRect(-reach, -1.5, reach * 2, 3)
    context.restore()
  }
  ray(0, mid, 1)
  ray(Math.PI / 2, mid, 1)
  if (flare) {
    ray(Math.PI / 4, mid * 0.55, 0.45)
    ray(-Math.PI / 4, mid * 0.55, 0.45)
    const core = context.createRadialGradient(0, 0, 0, 0, 0, mid * 0.3)
    core.addColorStop(0, `rgba(${color},0.9)`)
    core.addColorStop(1, `rgba(${color},0)`)
    context.fillStyle = core
    context.fillRect(-mid, -mid, SPRITE, SPRITE)
  }
  return canvas
}

export function createSky(): Sky {
  const glows = STAR_COLORS.map((color) => glowSprite(color))
  const sparkles = STAR_COLORS.map((color) => raySprite(color, false))
  const flareSprites = STAR_COLORS.map((color) => raySprite(color, true))
  let view: SkyView | undefined
  let stars: Star[] = []
  let flares: Flare[] = []
  let meteors: Meteor[] = []
  let now = 0
  let flareAt = between([100, 500])
  let meteorAt = between(METEOR_FIRST)

  function layout(next: SkyView): void {
    view = next
    const { width, skyline } = next
    const random = seeded(Math.round(width) * 7919 + Math.round(next.height))
    stars = []
    for (let n = Math.round((width * skyline) / STAR_AREA); n > 0; n--) {
      const x = random() * width
      const y = 4 + random() ** 1.25 * Math.max(0, skyline - 4)
      const keep = random()
      const roll = random()
      const tint = random()
      const shape = random()
      const bright = random()
      const period = 1800 + random() * 4800
      const phase = random()
      const flick = random()
      const flickerPeriod = 380 + random() * 620
      // Most stars go where the sky is darkest: to the upper left, far from the sunset.
      const low = y / Math.max(1, skyline)
      const dark = (1 - 0.72 * smooth(0.2, 0.95, x / width)) * (1 - 0.4 * low)
      if (keep > dark) continue
      const calm = next.calmAt(x, y, true) * (1 - next.cloudAt(x, y)) * (1 - 0.3 * low)
      if (calm < 0.05) continue
      const size = roll < 0.1 ? 3 : roll < 0.36 ? 2 : 1
      stars.push({
        x,
        y,
        size,
        mark: size < 3 && shape < 0.22,
        base: size === 3 ? 0.85 + bright * 0.15 : size === 2 ? 0.6 + bright * 0.3 : 0.45 + bright * 0.4,
        color: tint < 0.6 ? 0 : tint < 0.85 ? 1 : 2,
        period,
        phase,
        flicker: flick < 0.38 ? 0.25 + flick * 0.5 : 0,
        flickerPeriod,
        calm,
        dark,
      })
    }
    // The flaring stars may have moved.
    flares = []
  }

  /** Open sky: inside the sky and clear of the page's text, the octopus and the sunset clouds. */
  function openAt(x: number, y: number): boolean {
    if (!view) return false
    return x >= 0 && x <= view.width && y >= 0 && y <= view.skyline && view.cloudAt(x, y) === 0 && view.calmAt(x, y) >= 0.9
  }

  /** How far a meteor can fall from a point through open sky, up to `most` px: it burns out before it would reach
   * the page's text, the octopus, the clouds or the end of the sky. */
  function fall(x: number, y: number, dx: number, dy: number, most: number): number {
    let travel = 0
    while (travel + 12 <= most && openAt(x + dx * (travel + 12), y + dy * (travel + 12))) travel += 12
    return travel
  }

  /** A meteor falling gently left or right, mostly across the dark sky, starting anywhere in the open sky. */
  function spawnMeteor(): Meteor | null {
    if (!view) return null
    const { width, skyline } = view
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = ((16 + Math.random() * 18) * Math.PI) / 180
      const left = Math.random() < 0.65
      const dx = Math.cos(angle) * (left ? -1 : 1)
      const dy = Math.sin(angle)
      const x = width * (left ? 0.1 + Math.random() * 0.8 : 0.02 + Math.random() * 0.7)
      const y = skyline * (0.08 + Math.random() * 0.55)
      if (!openAt(x, y)) continue
      const travel = fall(x, y, dx, dy, 200 + Math.random() * 220)
      if (travel < 120) continue
      const speed = 0.55 + Math.random() * 0.35
      return { at: now, x, y, dx, dy, speed, travel, life: travel / speed, length: travel * (0.35 + Math.random() * 0.2), width: 1.1 + Math.random() * 0.6, bright: 0.75 + Math.random() * 0.25 }
    }
    return null
  }

  /** Now and then a second, fainter meteor follows the first a moment later, beside its path. */
  function companion(meteor: Meteor): Meteor | null {
    const side = (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 30)
    const back = 20 + Math.random() * 40
    const x = meteor.x - meteor.dy * side - meteor.dx * back
    const y = meteor.y + meteor.dx * side - meteor.dy * back
    if (!openAt(x, y)) return null
    const travel = fall(x, y, meteor.dx, meteor.dy, meteor.travel * (0.55 + Math.random() * 0.25))
    if (travel < 80) return null
    return {
      ...meteor,
      at: meteor.at + 180 + Math.random() * 420,
      x,
      y,
      travel,
      life: travel / meteor.speed,
      length: travel * 0.45,
      width: meteor.width * 0.85,
      bright: meteor.bright * 0.75,
    }
  }

  function step(clock: number): void {
    now = clock
    flares = flares.filter((flare) => clock - flare.at < flare.life)
    if (clock >= flareAt) {
      flareAt = clock + between(FLARE_REST)
      if (flares.length < FLARES && stars.length) {
        // Of a few stars picked at random, the one in the darkest, clearest sky flares.
        let best: Star | undefined
        let score = 0
        for (let k = 0; k < 4; k++) {
          const star = stars[Math.floor(Math.random() * stars.length)]
          const value = star.calm * star.dark * (star.size > 1 ? 1.4 : 1)
          if (value > score && !flares.some((flare) => flare.star === star)) {
            best = star
            score = value
          }
        }
        if (best) flares.push({ star: best, at: clock, life: between(FLARE_MS), size: 16 + Math.random() * 14 })
      }
    }
    meteors = meteors.filter((meteor) => clock - meteor.at < meteor.life + DEBRIS_MS)
    if (clock >= meteorAt) {
      meteorAt = clock + between(METEOR_REST)
      const meteor = spawnMeteor()
      if (meteor) {
        meteors.push(meteor)
        const second = Math.random() < 0.22 ? companion(meteor) : null
        if (second) meteors.push(second)
      }
    }
  }

  /** The stars twinkle on their own clocks, some also scintillating; the brightest sparkle at their peak. */
  function drawStars(context: CanvasRenderingContext2D, clock: number, gain: number): void {
    if (!view) return
    const { cell } = view
    context.lineWidth = 1
    for (const star of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin((clock / star.period + star.phase) * TAU)
      const scintillate = star.flicker ? 1 - star.flicker * (0.5 + 0.5 * Math.sin((clock / star.flickerPeriod + star.phase * 7) * TAU)) : 1
      const light = star.base * (0.4 + 0.6 * twinkle) * scintillate * gain * star.calm
      if (light < 0.04) continue
      if (star.mark) {
        // A star in the artwork's marks: a dot that opens into a plus as it brightens.
        const style = STAR_STYLES[star.color][Math.round(Math.min(1, light * 1.3) * 20)]
        if (light < 0.32) {
          context.fillStyle = style
          context.fillRect(star.x - 0.7, star.y - 0.7, 1.4, 1.4)
        } else {
          const arm = cell * (0.12 + 0.16 * smooth(0.32, 0.8, light))
          context.strokeStyle = style
          context.beginPath()
          context.moveTo(star.x - arm, star.y)
          context.lineTo(star.x + arm, star.y)
          context.moveTo(star.x, star.y - arm)
          context.lineTo(star.x, star.y + arm)
          context.stroke()
        }
        continue
      }
      if (star.size === 1) {
        context.fillStyle = STAR_STYLES[star.color][Math.round(Math.min(1, light) * 20)]
        context.fillRect(star.x - 0.75, star.y - 0.75, 1.5, 1.5)
        continue
      }
      const glow = STAR_GLOW[star.size]
      context.globalAlpha = light
      context.drawImage(glows[star.color], star.x - glow / 2, star.y - glow / 2, glow, glow)
      if (star.size === 3 && twinkle > 0.62) {
        const peak = (twinkle - 0.62) / 0.38
        const spark = 8 + 12 * peak
        context.globalAlpha = light * peak
        context.drawImage(sparkles[star.color], star.x - spark / 2, star.y - spark / 2, spark, spark)
      }
      context.globalAlpha = 1
    }
    // Flares swell quickly and fade slowly.
    for (const flare of flares) {
      const t = (clock - flare.at) / flare.life
      if (t < 0 || t >= 1) continue
      const swell = t < 0.25 ? smooth(0, 0.25, t) : (1 - (t - 0.25) / 0.75) ** 2
      const size = flare.size * (0.55 + 0.45 * swell)
      context.globalAlpha = swell * gain * flare.star.calm
      context.drawImage(flareSprites[flare.star.color], flare.star.x - size / 2, flare.star.y - size / 2, size, size)
    }
    context.globalAlpha = 1
  }

  /** Each meteor: a bright head and a tail that grows as it sets off, fading in, then out before it ends, and
   * sparks that linger a moment along its path. */
  function drawMeteors(context: CanvasRenderingContext2D, clock: number, gain: number): void {
    for (const meteor of meteors) {
      const age = clock - meteor.at
      if (age < 0) continue
      const along = Math.min(meteor.travel, meteor.speed * age)
      const strength = gain * meteor.bright
      for (let s = DEBRIS_STEP; s < along; s += DEBRIS_STEP) {
        const left = 1 - (age - s / meteor.speed) / DEBRIS_MS
        if (left <= 0) continue
        const jitter = (hash(s, meteor.x) - 0.5) * 5
        context.fillStyle = `rgba(255,236,214,${(0.5 * left * strength).toFixed(2)})`
        context.fillRect(meteor.x + meteor.dx * s - meteor.dy * jitter - 0.6, meteor.y + meteor.dy * s + meteor.dx * jitter - 0.6, 1.2, 1.2)
      }
      const t = age / meteor.life
      if (t >= 1) continue
      const alpha = strength * Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.35)
      if (alpha <= 0) continue
      const hx = meteor.x + meteor.dx * along
      const hy = meteor.y + meteor.dy * along
      const tail = meteor.length * Math.min(1, t * 3)
      const streak = context.createLinearGradient(hx - meteor.dx * tail, hy - meteor.dy * tail, hx, hy)
      streak.addColorStop(0, 'rgba(255,240,220,0)')
      streak.addColorStop(1, `rgba(255,246,232,${(0.85 * alpha).toFixed(2)})`)
      context.strokeStyle = streak
      context.lineWidth = meteor.width
      context.beginPath()
      context.moveTo(hx - meteor.dx * tail, hy - meteor.dy * tail)
      context.lineTo(hx, hy)
      context.stroke()
      context.globalAlpha = 0.8 * alpha
      context.drawImage(glows[2], hx - 4.5, hy - 4.5, 9, 9)
      context.globalAlpha = 1
      context.fillStyle = `rgba(255,250,240,${alpha.toFixed(2)})`
      context.fillRect(hx - 1.1, hy - 1.1, 2.2, 2.2)
    }
  }

  return {
    layout,
    step,
    draw(context, clock, gain) {
      drawStars(context, clock, gain)
      drawMeteors(context, clock, gain)
    },
  }
}
