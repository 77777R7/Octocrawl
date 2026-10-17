/** The hero demo's read, its own octopus: the page's raw HTML as it was returned fills the pane and "Reading <host>"
 * shows; a glyph octopus dives in head first from the top, its eight arms streaming up behind it and lengthening as it
 * speeds up, faster and faster all the way down. The raw HTML runs longer than the pane, and the view follows the
 * octopus down it, so its landing is always in sight. Every row its arms sweep turns, there and then, into that row of
 * the Markdown the same read returned (as the pane shows it, link targets folded), decoding outward from the octopus's
 * column. At the foot it lands with a thud: the ground row's shock runs out both ways, the pane jumps a row up and down
 * a few times and the window jolts; it squashes, lets go a puff of ink and fades into it, the rows it never reached
 * decode from where it landed, the view glides back to the top, and the pane's own markup (the same Markdown) takes
 * over. Every cell keeps its place on the grid; only its glyph, brightness and colour
 * change. Nothing plays with reduced motion or without a canvas: the Markdown shows as it is. */

const NAVY = '#0a1f50'
// The grid matches the pane's Markdown (product.css .dm-md: 13px, line height 1.75, 22px by 26px padding), so the
// handoff to it does not jump.
const PITCH_Y = 22.75
const FONT = '13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const PAD_X = 26
const PAD_Y = 22
// The timeline, in ms from the start: the raw rows weave in, the octopus's mantle appears at the top, it dives, lands,
// the ink spreads and the rest decodes, and the canvas fades as the pane's markup comes in.
const WEAVE_MS = 320
const ENTER_AT = 650
const DIVE_AT = 900
const DIVE_MS = 2000
const LAND_AT = DIVE_AT + DIVE_MS
const INK_MS = 900
// After the ink, the view glides back to the top of the page before the pane's markup takes over.
const BACK_AT = LAND_AT + 750
const BACK_MS = 700
const FADE_AT = BACK_AT + BACK_MS + 120
const FADE_MS = 360
// The landing's thud: the ground row's shock runs out over SHOCK_MS, the pane's rows jump by these many rows, one step
// every JOLT_STEP_MS, and the window jolts for JOLT_MS (product.css .dm-window.is-impact).
const SHOCK_MS = 380
const JOLT = [2, -1, 1, -1, 1, 0]
const JOLT_STEP_MS = 45
const JOLT_MS = 320
// The raw HTML the octopus dives through: at least the pane, at most this many panes of it.
const DEPTH = 3
// While it dives the view keeps it this far down the pane.
const FOLLOW = 0.62
// A cell decoding runs down the density ramp, then shows the Markdown's character.
const DECODE_MS = 150
const RAMP = ['X', 'x', '+', ':']
const HOT = ['#fff1e0', '#ffc59a', '#ff9a66', '#fb7b4c']

// The diving octopus, head first: its eight arms stream up behind it (two strokes, and a longer trail when fast),
// its collar with two orange eyes that read, and its mantle leading the way down. Every row is 13 cells wide.
const SPRITE_W = 13
const TRAIL = [" .  :   :  . ", "  ' . | . '  "]
const ARMS = [[
  " .  '  .  '  ",
  "  \\ \\ | / /  ",
  "   \\\\|||//   ",
], [
  "  '  .  '  . ",
  "  / \\ | / \\  ",
  "   \\\\|||//   ",
]]
const MANTLE = [
  "  ,=o===o=,  ",
  " =#########= ",
  " =#########= ",
  "  \\#######/  ",
  "   '-----'   ",
]
// Landed: squashed flat, eyes shut, arms splayed on the ground.
const SQUASH = [
  " ,=-=====-=, ",
  "=###########=",
  "\\x\\x\\ | /x/x/",
]
// The ink: rings of these, spreading from where it landed.
const INK = ['~', 'o', '.', '~', '*', '.']

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const easeOut = (t: number): number => 1 - (1 - t) ** 3

export type Drop = { prime(): void; play(): void; stop(): void }

// The Markdown reads at this many characters a line, as the pane shows it (product.css .dm-md).
export const MARKDOWN_COLS = 64

/** A Markdown line's pieces between the places a browser may wrap it: at a space (dropped at a wrap), after a hyphen
 * inside a word, and between a link's ] and (. */
function pieces(text: string): Array<{ text: string; space: boolean }> {
  const out: Array<{ text: string; space: boolean }> = []
  let piece = ''
  let space = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === ' ') {
      if (piece) out.push({ text: piece, space })
      piece = ''
      space = true
      continue
    }
    piece += ch
    const next = text[i + 1] ?? ''
    if ((ch === '-' && /\p{L}/u.test(text[i - 1] ?? '') && /\p{L}/u.test(next)) || (ch === ']' && next === '(')) {
      out.push({ text: piece, space })
      piece = ''
      space = false
    }
  }
  if (piece) out.push({ text: piece, space })
  return out
}

/** Text as grid rows, whitespace runs collapsed to one space. Raw HTML drops its blank lines and wraps anywhere, as
 * markup runs on; the Markdown keeps them and wraps between words (a word longer than a line breaks anywhere), as the
 * pane shows it. */
export function gridRows(text: string, cols: number, keepBlank: boolean): string[] {
  const rows: string[] = []
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const tidy = line.replace(/\s+/g, ' ').trimEnd()
    if (!tidy.trim()) {
      if (keepBlank) rows.push('')
      continue
    }
    if (!keepBlank) {
      for (let i = 0; i < tidy.length; i += cols) rows.push(tidy.slice(i, i + cols))
      continue
    }
    let row = ''
    for (const piece of pieces(tidy)) {
      const next = row ? `${row}${piece.space ? ' ' : ''}${piece.text}` : piece.text
      if (next.length <= cols) { row = next; continue }
      if (row) rows.push(row)
      let rest = piece.text
      while (rest.length > cols) { rows.push(rest.slice(0, cols)); rest = rest.slice(cols) }
      row = rest
    }
    if (row) rows.push(row)
  }
  return rows
}

export function mountDrop(out: HTMLElement, raw: string, markdown: string, onDone: () => void): Drop | null {
  const canvas = out.querySelector<HTMLCanvasElement>('.dm-drop')
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return null
  const ctx = context
  let raf = 0
  let start = 0
  let width = 0
  let height = 0
  let ratio = 1
  let pitchX = 7.5
  let cols = 0
  let visible = 0
  let rows = 0
  let rawRows: string[] = []
  let mdRows: string[] = []
  // When each cell turns into the Markdown, on the run's clock.
  let decodeAt: number[][] = []
  let octoX = 0

  const fit = (): void => {
    const box = out.getBoundingClientRect()
    ratio = window.devicePixelRatio || 1
    width = box.width
    height = box.height
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.font = FONT
    pitchX = ctx.measureText('M').width
    cols = Math.max(SPRITE_W + 6, Math.floor((width - 2 * PAD_X) / pitchX))
    visible = Math.max(MANTLE.length + 6, Math.floor((height - 2 * PAD_Y) / PITCH_Y))
    rawRows = gridRows(raw, cols, false).slice(0, visible * DEPTH)
    rows = Math.max(visible, rawRows.length)
    mdRows = gridRows(markdown, Math.min(cols, MARKDOWN_COLS), true).slice(0, rows)
    decodeAt = Array.from({ length: rows }, () => Array.from({ length: cols }, () => Infinity))
    octoX = Math.floor((cols - SPRITE_W) * 0.46)
  }
  // Rows are the page's (0 at its top, `ground` its last); the view shows `visible` of them from `view(t)` on.
  const ground = (): number => rows - 1
  const x = (col: number): number => PAD_X + col * pitchX + pitchX / 2
  let top = 0
  // The thud's jump: every row drawn this many rows lower (or higher), all together.
  let jolt = 0
  const y = (row: number): number => PAD_Y + (row - top + jolt) * PITCH_Y + PITCH_Y / 2
  const frameEl = out.closest<HTMLElement>('.dm-window')
  const shown = (row: number): boolean => row >= top && row < top + visible
  const centre = (): number => octoX + SPRITE_W / 2

  /** How far the dive has gone (0 to 1): a small start speed, then faster and faster. */
  const dive = (t: number): number => {
    const d = clamp01((t - DIVE_AT) / DIVE_MS)
    return 0.15 * d + 0.85 * d * d
  }
  /** The row the mantle's leading edge is on (its last row); before the dive, sliding in from above. */
  const lead = (t: number): number => {
    const first = MANTLE.length - 1
    if (t < ENTER_AT) return -1
    if (t < DIVE_AT) return Math.round(-1 + easeOut((t - ENTER_AT) / (DIVE_AT - ENTER_AT)) * first)
    return Math.round(first + dive(t) * (ground() - first))
  }

  /** The first row in view: following the octopus down while it dives, holding while it lands, then gliding back up. */
  const view = (t: number): number => {
    const last = rows - visible
    if (t < BACK_AT) return Math.max(0, Math.min(last, lead(t) - Math.round(visible * FOLLOW)))
    const k = clamp01((t - BACK_AT) / BACK_MS)
    return Math.round(last * (1 - k * k * (3 - 2 * k)))
  }

  /** The rows the arms have swept decode from the octopus's column outward; once it lands, the rest from there. */
  function mark(t: number): void {
    const swept = t < DIVE_AT ? -1 : lead(t) - MANTLE.length
    for (let r = 0; r < rows; r++) {
      const row = decodeAt[r]!
      if (row[0] !== Infinity) continue
      if (r <= swept) {
        for (let c = 0; c < cols; c++) row[c] = t + Math.abs(c - centre()) * 3
      } else if (t >= LAND_AT) {
        for (let c = 0; c < cols; c++) row[c] = t + Math.hypot((c - centre()) * 0.5, r - ground()) * 22
      }
    }
  }

  function drawRows(t: number): void {
    for (let r = top; r < Math.min(rows, top + visible); r++) {
      if (t - (r - top) * (WEAVE_MS / visible) < 0) continue
      const rawRow = rawRows[r] ?? ''
      const mdRow = mdRows[r] ?? ''
      const heading = mdRow.startsWith('#')
      for (let c = 0; c < cols; c++) {
        const age = t - decodeAt[r]![c]!
        if (age < 0) {
          const ch = rawRow[c]
          if (!ch || ch === ' ') continue
          ctx.globalAlpha = 1
          ctx.fillStyle = 'rgba(168, 201, 250, .38)'
          ctx.fillText(ch, x(c), y(r))
          continue
        }
        const ch = mdRow[c]
        const had = (rawRow[c] ?? ' ') !== ' '
        if (age < DECODE_MS && (had || (ch && ch !== ' '))) {
          const step = Math.min(RAMP.length - 1, Math.floor(age / DECODE_MS * RAMP.length))
          ctx.globalAlpha = 1
          ctx.fillStyle = HOT[step]!
          ctx.fillText(RAMP[step]!, x(c), y(r))
          continue
        }
        if (!ch || ch === ' ') continue
        ctx.globalAlpha = 1
        ctx.fillStyle = heading ? '#fb7b4c' : '#ffc59a'
        ctx.fillText(ch, x(c), y(r))
      }
    }
  }

  /** A row of the sprite, its cells covering what is under them. */
  function spriteRow(line: string, row: number, left: number, colour: (ch: string) => string, alpha: number): void {
    if (row < 0 || row > ground() || !shown(row)) return
    const first = line.search(/\S/)
    if (first < 0) return
    const last = line.length - 1 - [...line].reverse().join('').search(/\S/)
    ctx.globalAlpha = alpha
    ctx.fillStyle = NAVY
    ctx.fillRect(x(left + first) - pitchX / 2, y(row) - PITCH_Y / 2, (last - first + 1) * pitchX, PITCH_Y)
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!
      if (ch === ' ') continue
      ctx.fillStyle = colour(ch)
      ctx.fillText(ch, x(left + i), y(row))
    }
  }

  function drawOctopus(t: number): void {
    const since = t - LAND_AT
    if (t < ENTER_AT || since > INK_MS * 0.6) return
    const alpha = since < 150 ? 1 : 1 - clamp01((since - 150) / (INK_MS * 0.6 - 150))
    const colour = (ch: string): string => (ch === 'o' ? '#fb7b4c' : ch === '#' || ch === '=' || ch === ',' ? '#d6e6ff' : '#a8c9fa')
    if (since >= 0) {
      SQUASH.forEach((line, i) => spriteRow(line, ground() - SQUASH.length + 1 + i, octoX, colour, alpha))
      return
    }
    // The faster it goes, the quicker its arms stroke and the longer they stream behind it.
    const speed = t < DIVE_AT ? 0 : clamp01((t - DIVE_AT) / DIVE_MS)
    const stroke = ARMS[Math.floor(t / (speed > 0.5 ? 120 : 220)) % 2]!
    const trail = speed > 0.75 ? TRAIL : speed > 0.4 ? TRAIL.slice(1) : []
    const lines = [...trail, ...stroke, ...MANTLE]
    const top = lead(t) - lines.length + 1
    lines.forEach((line, i) => {
      // The arms sway from side to side, more the slower it goes.
      const sway = i < trail.length + stroke.length ? Math.round(Math.sin(t / 160 + i) * (1 - speed) * 0.8) : 0
      spriteRow(line, top + i, octoX + sway, colour, i < trail.length ? 0.6 : 1)
    })
  }

  /** The thud's shock: the ground row flares from where it landed outward, each cell running down the ramp. */
  function drawShock(t: number): void {
    const since = t - LAND_AT
    if (since < 0 || since >= SHOCK_MS + cols * 9) return
    ctx.save()
    ctx.shadowColor = 'rgba(251, 123, 76, .9)'
    for (let col = 0; col < cols; col++) {
      const age = since - Math.abs(col + 0.5 - centre()) * 9
      if (age < 0 || age >= SHOCK_MS) continue
      const step = Math.min(RAMP.length - 1, Math.floor(age / SHOCK_MS * RAMP.length))
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
      ctx.fillStyle = NAVY
      ctx.fillRect(x(col) - pitchX / 2, y(ground()) - PITCH_Y / 2, pitchX, PITCH_Y)
      ctx.shadowBlur = step < 2 ? 12 : 0
      ctx.fillStyle = HOT[step]!
      ctx.fillText(RAMP[step]!, x(col), y(ground()))
    }
    ctx.restore()
  }

  /** The ink: rings of glyphs spreading from where it landed, cooling from orange to the window's blue as they go. */
  function drawInk(t: number): void {
    const since = t - LAND_AT
    if (since < 0 || since > INK_MS) return
    const k = since / INK_MS
    const radius = easeOut(k) * Math.max(10, cols * 0.42)
    for (let ring = 0; ring < 3; ring++) {
      const rr = radius - ring * 2.2
      if (rr <= 0.5) continue
      const steps = Math.ceil(rr * 6)
      for (let s = 0; s < steps; s++) {
        const a = Math.PI + (Math.PI * s) / Math.max(1, steps - 1)
        const col = Math.round(centre() + Math.cos(a) * rr)
        const row = Math.round(ground() + Math.sin(a) * rr * 0.45)
        if (col < 0 || col >= cols || row < 0 || row > ground() || !shown(row)) continue
        ctx.globalAlpha = (1 - k) * (1 - ring * 0.28)
        ctx.fillStyle = k < 0.3 ? '#ff9a66' : ring === 0 ? '#a8c9fa' : '#6f86b0'
        ctx.fillText(INK[(s + ring * 2) % INK.length]!, x(col), y(row))
      }
    }
  }

  let primed = false

  /** Draws the read as it stands at `t`. */
  function paint(t: number): void {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.font = FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    out.classList.toggle('is-scraping', t < LAND_AT)
    if (t >= FADE_AT) out.classList.add('is-fading')
    top = view(t)
    const since = t - LAND_AT
    const step = Math.floor(since / JOLT_STEP_MS)
    jolt = since >= 0 && step < JOLT.length ? JOLT[step]! : 0
    frameEl?.classList.toggle('is-impact', since >= 0 && since < JOLT_MS)
    mark(t)
    drawRows(t)
    drawShock(t)
    drawInk(t)
    drawOctopus(t)
    ctx.globalAlpha = 1
  }

  function frame(now: number): void {
    const t = now - start
    paint(t)
    if (t < FADE_AT + FADE_MS) raf = requestAnimationFrame(frame)
    else finish()
  }

  function finish(): void {
    cancelAnimationFrame(raf)
    raf = 0
    jolt = 0
    frameEl?.classList.remove('is-impact')
    ctx.clearRect(0, 0, width, height)
    out.classList.remove('is-raw', 'is-scraping', 'is-fading')
    out.classList.add('is-read')
    onDone()
  }

  return {
    /** Shows the raw HTML, as it was returned, and "Reading <host>", ready for the octopus. */
    prime() {
      if (raf) return
      out.classList.remove('is-read', 'is-fading')
      out.classList.add('is-raw', 'is-scraping')
      fit()
      primed = true
      paint(WEAVE_MS)
    },
    play() {
      if (raf) cancelAnimationFrame(raf)
      out.classList.remove('is-read', 'is-fading')
      out.classList.add('is-raw')
      fit()
      // Primed, the raw HTML is already in: the run starts where it would be once woven in.
      start = performance.now() - (primed ? WEAVE_MS : 0)
      primed = false
      raf = requestAnimationFrame(frame)
    },
    /** Ends a run at once (the Markdown shows), or takes back a prime that never played. */
    stop() {
      if (raf) finish()
      else if (primed) {
        primed = false
        ctx.clearRect(0, 0, width, height)
        out.classList.remove('is-raw', 'is-scraping')
      }
    },
  }
}
