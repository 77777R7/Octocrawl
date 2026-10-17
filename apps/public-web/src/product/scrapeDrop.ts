/** The hero demo's read, in the home page's crawl window's glyphs (octopusGlyphs.ts): the page's raw HTML as it was
 * returned fills the pane, "Reading <host>" shows, the glyph octopus peeks in at the top and drops to the foot faster and
 * faster, the rows it passes run down the density ramp into a glyph texture, it lands with a thud (the ground row's
 * shock, a burst of rays, dust and flying bits, the pane jumping a row), and the raw HTML gives way to the result,
 * which is the pane's own markup (the Markdown). Every cell keeps its place on the grid; only its glyph, brightness and colour change.
 * Nothing plays with reduced motion or without a canvas: the result shows as it is. */
import {
  ARMS, BURST, BURST_FADE_MS, BURST_GROW_MS, BURST_HOLD_MS, clamp01, DEBRIS, DUST, easeOut, HOT, MANTLE, RAMP, SHAKE,
  SHAKE_STEP_MS, SPRITE_H, SPRITE_W, SQUASH, TEXTURE, THUD_MS,
} from '../octopusGlyphs'

const NAVY = '#0a1f50'
const PITCH_Y = 20
const FONT = '12.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
// The grid's margin inside the pane, as the Markdown's.
const PAD_X = 26
const PAD_Y = 16
// The timeline, in ms from the start: the raw rows weave in, the octopus peeks in, drops and lands, the thud runs, and
// the canvas fades as the result comes in.
const WEAVE_MS = 320
const PEEK_AT = 900
const DROP_AT = 1400
const DROP_MS = 1700
const LAND_AT = DROP_AT + DROP_MS
const FADE_AT = LAND_AT + THUD_MS - 100
const FADE_MS = 360
const READ_MS = 280

export type Drop = { play(): void; stop(): void }

/** The raw text as grid rows: whitespace runs collapsed to one space, line breaks kept, long lines wrapped. */
export function rawRows(raw: string, cols: number): string[] {
  const rows: string[] = []
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const text = line.replace(/\s+/g, ' ').trim()
    if (!text) continue
    for (let i = 0; i < text.length; i += cols) rows.push(text.slice(i, i + cols))
  }
  return rows
}

export function mountDrop(out: HTMLElement, raw: string, onDone: () => void): Drop | null {
  const canvas = out.querySelector<HTMLCanvasElement>('.dm-drop')
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return null
  const ctx = context
  let raf = 0
  let start = 0
  let width = 0
  let height = 0
  let pitchX = 7
  let cols = 0
  let rows: string[] = []
  let visible = 0
  let readAt: number[][] = []
  let octoX = 0

  const fit = (): void => {
    const box = out.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    width = box.width
    height = box.height
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.font = FONT
    pitchX = ctx.measureText('M').width
    cols = Math.max(SPRITE_W + 4, Math.floor((width - 2 * PAD_X) / pitchX))
    visible = Math.max(SPRITE_H + 3, Math.floor((height - 2 * PAD_Y) / PITCH_Y))
    rows = rawRows(raw, cols).slice(0, visible)
    readAt = rows.map((row) => Array.from({ length: row.length }, () => Infinity))
    octoX = Math.floor((cols - SPRITE_W) * 0.42)
  }
  const ground = (): number => visible - 1
  const x = (col: number): number => PAD_X + col * pitchX + pitchX / 2
  const y = (row: number): number => PAD_Y + row * PITCH_Y + PITCH_Y / 2
  /** Where the octopus's head is (a row; above 0 is out of sight). */
  const headAt = (t: number): number => {
    if (t < PEEK_AT) return -SPRITE_H - 1
    if (t < DROP_AT) return -SPRITE_H + Math.round(easeOut((t - PEEK_AT) / (DROP_AT - PEEK_AT)) * (SPRITE_H - 2))
    // Thrown down: a small start speed, then faster and faster all the way, so it lands with a thud.
    const d = clamp01((t - DROP_AT) / DROP_MS)
    return Math.round(-2 + (0.15 * d + 0.85 * d * d) * (ground() - SPRITE_H + 2))
  }
  const cell = (col: number, row: number, char: string, colour: string, alpha = 1, glow = 0): void => {
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
    ctx.fillStyle = NAVY
    ctx.fillRect(x(col) - pitchX / 2, y(row) - PITCH_Y / 2, pitchX, PITCH_Y)
    ctx.shadowBlur = glow
    ctx.globalAlpha = alpha
    ctx.fillStyle = colour
    ctx.fillText(char, x(col), y(row))
  }

  function drawRows(t: number, shake: number): void {
    const head = headAt(t)
    rows.forEach((row, r) => {
      const shown = r + shake
      const woven = t - r * (WEAVE_MS / Math.max(1, rows.length))
      if (woven < 0) return
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]!
        if (ch === ' ') continue
        // A row the octopus's arms have passed is read, from the column under it outward.
        if (readAt[r]![c] === Infinity && head + SPRITE_H > r && t >= DROP_AT) readAt[r]![c] = t + Math.abs(c - (octoX + SPRITE_W / 2)) * 4
        const age = t - readAt[r]![c]!
        ctx.globalAlpha = 1
        if (age < 0) {
          ctx.fillStyle = 'rgba(168, 201, 250, .4)'
          ctx.fillText(ch, x(c), y(shown))
        } else if (age < READ_MS) {
          const step = Math.min(RAMP.length - 1, Math.floor(age / READ_MS * RAMP.length))
          ctx.fillStyle = HOT[step]!
          ctx.fillText(RAMP[step]!, x(c), y(shown))
        } else {
          ctx.fillStyle = 'rgba(251, 154, 108, .5)'
          ctx.fillText(TEXTURE[(r * 7 + c * 3) % TEXTURE.length]!, x(c), y(shown))
        }
      }
    })
  }

  function drawOctopus(t: number, shake: number): void {
    const head = headAt(t)
    if (head + SPRITE_H < 0) return
    const since = t - LAND_AT
    const squashed = since >= 0 && since < 200
    const hop = since >= 200 && since < 320 ? 1 : 0
    const squint = since >= 0 && since < 400
    const stride = Math.floor(t / 240) % 2
    const drop = t >= DROP_AT ? clamp01((t - DROP_AT) / DROP_MS) : 0
    const stretched = drop > 0.7 && since < 0
    const lines = squashed ? SQUASH : stretched ? [...MANTLE.slice(0, 4), MANTLE[3]!, MANTLE[4]!, ...ARMS[stride]!] : [...MANTLE, ...ARMS[stride]!]
    const row0 = head + shake + (squashed ? SPRITE_H - SQUASH.length : stretched ? -1 : -hop)
    const left = octoX - (squashed ? 1 : 0)
    if (drop > 0.55 && since < 0) {
      // Streaks above it while it drops fast.
      const length = Math.round(1 + 4 * (drop - 0.55) / 0.45)
      for (let k = 1; k <= length; k++) {
        if (row0 - k < 0) break
        ctx.globalAlpha = 0.85 * (1 - k / (length + 1))
        ctx.fillStyle = '#a8c9fa'
        for (let dx = 3; dx < SPRITE_W - 3; dx += 2) ctx.fillText(k === 1 ? '|' : k === 2 ? ':' : '.', x(left + dx), y(row0 - k))
      }
      ctx.globalAlpha = 1
    }
    lines.forEach((line, dy) => {
      const row = row0 + dy
      if (row < 0 || row > ground()) return
      const first = line.search(/\S/)
      const last = line.length - 1 - [...line].reverse().join('').search(/\S/)
      ctx.globalAlpha = 1
      ctx.fillStyle = NAVY
      ctx.fillRect(x(left + first - 1) - pitchX / 2, y(row) - PITCH_Y / 2, (last - first + 3) * pitchX, PITCH_Y)
      let eye = 0
      for (let dx = 0; dx < line.length; dx++) {
        const ch = line[dx]!
        if (ch === ' ') continue
        if (ch === 'O') {
          if (squint) { ctx.fillStyle = '#ffffff'; ctx.fillText(eye++ === 0 ? '>' : '<', x(left + dx), y(row)) }
          else { ctx.fillStyle = '#011758'; ctx.fillRect(x(left + dx) - pitchX * 0.4, y(row) - PITCH_Y * 0.3, pitchX * 0.8, PITCH_Y * 0.6) }
          continue
        }
        ctx.fillStyle = squashed || dy < MANTLE.length + (stretched ? 1 : 0) ? '#d6e6ff' : '#a8c9fa'
        ctx.fillText(ch, x(left + dx), y(row))
      }
    })
  }

  /** The landing: the ground row's shock both ways, rays of glyphs bursting out, dust rolling away, bits flying up. */
  function drawThud(t: number): void {
    const since = t - LAND_AT
    if (since < 0 || since >= THUD_MS) return
    const g = ground()
    const centre = octoX + SPRITE_W / 2
    ctx.save()
    ctx.shadowColor = 'rgba(251, 123, 76, .9)'
    for (let col = 0; col < cols; col++) {
      const age = since - Math.abs(col + 0.5 - centre) * 9
      if (age < 0 || age >= 380) continue
      const step = Math.min(RAMP.length - 1, Math.floor(age / 380 * RAMP.length))
      cell(col, g, RAMP[step]!, HOT[step]!, 1, step < 2 ? 12 : 0)
    }
    const grow = easeOut(clamp01(since / BURST_GROW_MS))
    const eaten = clamp01((since - BURST_HOLD_MS) / BURST_FADE_MS)
    if (eaten < 1) {
      const ox = x(0) - pitchX / 2 + centre * pitchX
      const oy = y(g)
      for (const [angle, share, thick] of BURST) {
        const length = share * (thick ? width : height * 0.75) * grow
        const rad = angle * Math.PI / 180
        const char = angle < 20 || angle > 160 ? '=' : angle < 70 ? '/' : angle <= 110 ? '|' : '\\'
        let last = ''
        for (let d = pitchX * 1.5; d <= length; d += Math.min(pitchX, PITCH_Y) * 0.7) {
          const f = d / Math.max(1, length)
          if (f < eaten) continue
          const col = Math.floor((ox + Math.cos(rad) * d - PAD_X) / pitchX)
          const row = Math.round((oy - Math.sin(rad) * d - PAD_Y - PITCH_Y / 2) / PITCH_Y)
          if (`${col},${row}` === last || col < 0 || col >= cols || row < 0) continue
          last = `${col},${row}`
          const colour = f < 0.18 ? '#ffffff' : f < 0.4 ? HOT[0]! : f < 0.62 ? HOT[1]! : f < 0.84 ? HOT[3]! : '#d9542f'
          cell(col, row, f < 0.2 ? 'X' : char, colour, 1 - 0.5 * eaten, f < 0.6 ? 12 : 4)
        }
      }
    }
    const s = since / 1000
    for (const [speed, lift, char] of DUST) {
      if (s > 0.6) break
      const travel = speed * s - 0.5 * speed * 1.6 * s * s
      for (const side of [-1, 1]) cell(Math.round(centre + side * travel), g - lift, char, '#c9d8f2', 1 - s / 0.6)
    }
    ctx.shadowBlur = 0
    for (const [speed, lift, char] of DEBRIS) {
      const rise = lift * s - 0.5 * 55 * s * s
      if (rise < 0 || s > 0.8) continue
      ctx.globalAlpha = 1 - s / 0.8
      ctx.fillStyle = '#ffc59a'
      ctx.fillText(char, x(Math.round(centre + speed * s)), y(g - 1 - Math.round(rise)))
    }
    ctx.restore()
  }

  function frame(now: number): void {
    const t = now - start
    const step = Math.floor((t - LAND_AT) / SHAKE_STEP_MS)
    const shake = t >= LAND_AT && step < SHAKE.length ? SHAKE[step]! : 0
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.font = FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    out.classList.toggle('is-scraping', t < LAND_AT)
    if (t >= FADE_AT) out.classList.add('is-fading')
    drawRows(t, shake)
    drawThud(t)
    drawOctopus(t, shake)
    if (t < FADE_AT + FADE_MS) raf = requestAnimationFrame(frame)
    else finish()
  }

  function finish(): void {
    cancelAnimationFrame(raf)
    raf = 0
    ctx.clearRect(0, 0, width, height)
    out.classList.remove('is-raw', 'is-scraping', 'is-fading')
    out.classList.add('is-read')
    onDone()
  }

  return {
    play() {
      if (raf) cancelAnimationFrame(raf)
      out.classList.remove('is-read', 'is-fading')
      out.classList.add('is-raw')
      fit()
      start = performance.now()
      raf = requestAnimationFrame(frame)
    },
    stop() {
      if (raf) finish()
    },
  }
}
