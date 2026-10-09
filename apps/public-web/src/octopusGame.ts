import { GAME, newGame, octoBox, secondsLeft, step, type GameEvent, type State, type Steer, type Thing } from './seaGame'

/* The octopus game, full screen over the page, drawn in the page's glyphs on a dark sea (rules in seaGame.ts). It is
 * its own chunk, loaded only when a visitor asks to play. A dialog: Escape or the close button leaves it, the Tab key
 * stays inside it, the page behind does not scroll, and focus goes back where it came from. Arrow keys or WASD swim,
 * Space inks; on a touch screen the octopus swims to the finger and the ink button inks. The best score stays in this
 * browser only. */

const FONT = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace'
const SMALL = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace'
const LINE = 20
const BEST_KEY = 'octocrawl.seaGame.best'
// The palette's roles on navy (styles.css :root).
const C = { body: '#f3683d', crown: '#ffae86', under: '#b8461d', eye: '#e6eefc', sea: '#b7c8e6', dim: '#9db2d6', warm: '#ffc2a4', ink: '#8db9e8' }
const BURST = '#->*`_'
const INK = '#%*+:.'

// The octopus, 7 × 4 cells: crown, eyes, body, and arms in two strokes.
const OCTO = [' ,x+x, ', 'x+@+@+x', ' x+x+x ']
const ARMS = ['/(/ \\)\\', '\\(| |)/']
const JELLY = [' .-. ', '(   )']
const JELLY_ARMS = [' ;|; ', ' |;| ']

let open = false

const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 } }
const writeBest = (n: number) => { try { localStorage.setItem(BEST_KEY, String(n)) } catch { /* Not kept; the game still works. */ } }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

type Particle = { x: number, y: number, vx: number, vy: number, glyph: string, colour: string, born: number, life: number }

/** Opens the game. `opener` gets focus back when it closes. */
export function openGame(opener: HTMLElement): void {
  if (open) return
  open = true
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // The dialog and its parts.
  const root = el('div', 'sea-game')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'sea-game-title')
  root.tabIndex = -1
  const hud = el('div', 'sea-hud')
  const score = el('span', 'sea-hud-score', 'pages 0')
  const clock = el('span', 'sea-hud-clock', `0:${String(GAME.seconds).padStart(2, '0')}`)
  const lives = el('span', 'sea-hud-lives', '<3 <3 <3')
  lives.setAttribute('aria-label', `${GAME.lives} lives`)
  const best = el('span', 'sea-hud-best', `best ${readBest()}`)
  const close = el('button', 'sea-close', 'esc ×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close the game')
  // Ink in the bar, beside the way out, so it never covers the sea.
  const ink = el('button', 'sea-ink', 'ink')
  ink.type = 'button'
  ink.setAttribute('aria-label', 'Ink: a dash with a moment’s cover')
  hud.append(score, clock, lives, best, ink, close)
  const canvas = el('canvas', 'sea-field')
  canvas.setAttribute('aria-hidden', 'true')
  const panel = el('div', 'sea-panel')
  const status = el('p', 'visually-hidden')
  status.setAttribute('role', 'status')
  root.append(hud, canvas, panel, status)
  const context = canvas.getContext('2d')
  if (!context) { open = false; return }
  const ctx: CanvasRenderingContext2D = context

  // The page behind keeps still while the game is open.
  const html = document.documentElement
  const overflow = html.style.overflow
  html.style.overflow = 'hidden'
  document.body.append(root)

  let state: State | null = null
  let phase: 'ready' | 'playing' | 'over' = 'ready'
  let cellW = 10
  let width = 0
  let height = 0
  let frame = 0
  let last = 0
  let paused = false
  const keys = new Set<string>()
  let inkAsked = false
  let target: { x: number, y: number } | null = null
  const particles: Particle[] = []
  const notes: Array<{ x: number, y: number, text: string, colour: string, born: number }> = []
  let lastCatch = -1e9
  // Space is the ink key: one pressed or held as the game ends must not also press the end screen's first button.
  let spaceDown = false
  let swallowSpace = false
  let guardUntil = 0

  const layout = () => {
    const box = canvas.getBoundingClientRect()
    width = box.width
    height = box.height
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.font = FONT
    cellW = ctx.measureText('M').width
    if (state) {
      // A resize mid-game: the sea takes the new size, and the octopus and the crab's floor stay in it.
      const cols = Math.max(30, Math.floor(width / cellW))
      const rows = Math.max(16, Math.floor(height / LINE))
      const zw = state.zone.x1 - state.zone.x0
      const right = state.zone.x1 >= state.cols
      state.cols = cols
      state.rows = rows
      state.zone = { x0: right ? cols - zw : 0, x1: right ? cols : zw, y0: rows - GAME.zoneRows, y1: rows }
      state.octo.x = Math.min(state.octo.x, cols - GAME.octoW)
      state.octo.y = Math.min(state.octo.y, rows - GAME.octoH)
      state.crabX = Math.max(state.zone.x0 + 2, Math.min(state.zone.x1 - 6, state.crabX))
    }
  }

  const showPanel = (heading: string, lines: string[], buttons: Array<[string, () => void]>) => {
    panel.replaceChildren()
    const h = el('h2', 'sea-panel-title', heading)
    h.id = 'sea-game-title'
    panel.append(h)
    if (lines.length) {
      const list = el('ul', 'sea-panel-lines')
      for (const line of lines) list.append(el('li', '', line))
      panel.append(list)
    }
    const row = el('div', 'sea-panel-buttons')
    for (const [label, act] of buttons) {
      const b = el('button', 'sea-button', label)
      b.type = 'button'
      b.addEventListener('click', act)
      row.append(b)
    }
    panel.append(row)
    panel.hidden = false
    ;(row.firstElementChild as HTMLElement | null)?.focus()
  }

  const start = () => {
    layout()
    state = newGame(Math.max(30, Math.floor(width / cellW)), Math.max(16, Math.floor(height / LINE)))
    particles.length = 0
    notes.length = 0
    phase = 'playing'
    panel.hidden = true
    root.focus()
    status.textContent = 'The game has started.'
    last = 0
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(loop)
  }

  const finish = () => {
    if (!state) return
    phase = 'over'
    guardUntil = performance.now() + 900
    if (spaceDown) swallowSpace = true
    const previous = readBest()
    const record = state.score > previous
    if (record) writeBest(state.score)
    best.textContent = `best ${Math.max(previous, state.score)}`
    const pages = `${state.pages} page${state.pages === 1 ? '' : 's'}`
    showPanel(record && state.score > 0 ? `A new best: ${state.score}` : `You read ${pages}`, [
      `score ${state.score} · ${pages}, ${state.structured} with structured data`,
      `pinched by the crab ${state.pinched} · stung ${state.stung} · 429 ${state.limited}`,
      state.lives <= 0 ? 'Out of lives. Mind the crab’s floor.' : 'Out of time.',
    ], [['Play again', start], ['Back to the page', shut]])
    status.textContent = `Game over. Score ${state.score}.`
  }

  const steer = (): Steer => {
    let x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0)
    let y = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0)
    if (target && state) {
      const box = octoBox(state.octo)
      const dx = target.x / cellW - (box.x + box.w / 2)
      const dy = target.y / LINE - (box.y + box.h / 2)
      const d = Math.hypot(dx, dy * 2)
      if (d > 0.6) { const k = Math.min(1, d / 3) / d; x = dx * k; y = dy * 2 * k }
    }
    const wantInk = inkAsked
    inkAsked = false
    return { x, y, ink: wantInk }
  }

  const react = (events: GameEvent[], now: number) => {
    for (const e of events) {
      if (e.type === 'over') { finish(); continue }
      const px = e.x * cellW
      const py = e.y * LINE
      if (e.type === 'catch') {
        notes.push({ x: px, y: py - LINE, text: `+${e.points}`, colour: C.warm, born: now })
        if (!reduced) for (let i = 0; i < 6 + e.points * 2; i++) particles.push({ x: px, y: py, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60, glyph: BURST[i % BURST.length]!, colour: C.crown, born: now, life: 900 })
      }
      if (e.type === '429') notes.push({ x: px, y: py - 3 * LINE, text: '429', colour: C.warm, born: now })
      if (e.type === 'stung') notes.push({ x: px, y: py - 3 * LINE, text: '!', colour: C.eye, born: now })
      if (e.type === 'pinched') notes.push({ x: px, y: py - 3 * LINE, text: 'disallow', colour: C.warm, born: now })
      if (e.type === 'ink' && !reduced) for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 70; particles.push({ x: px, y: py + LINE, vx: Math.cos(a) * v, vy: Math.sin(a) * v, glyph: '', colour: C.ink, born: now, life: 900 + Math.random() * 500 }) }
    }
  }

  const draw = (now: number) => {
    const s = state
    ctx.clearRect(0, 0, width, height)
    if (!s) return
    ctx.textBaseline = 'top'
    ctx.font = FONT
    const put = (col: number, row: number, glyph: string, colour: string, alpha = 1) => {
      if (glyph === ' ') return
      ctx.globalAlpha = alpha
      ctx.fillStyle = colour
      ctx.fillText(glyph, Math.round(col) * cellW, Math.round(row) * LINE)
    }
    const text = (col: number, row: number, words: string, colour: string, alpha = 1) => [...words].forEach((g, i) => put(col + i, row, g, colour, alpha))

    // Plankton, still, so the sea reads as water.
    for (let i = 0; i < s.cols * s.rows / 90; i++) put((i * 37) % s.cols, (i * 53) % s.rows, '·', C.dim, 0.18)

    // The crab's floor: a dotted fence, the word on it, and the crab, claws up when the octopus comes near.
    const z = s.zone
    for (let c = z.x0; c < z.x1; c += 2) put(c, z.y0, ':', C.dim, 0.45)
    for (let r = z.y0; r < z.y1; r++) put(z.x0 === 0 ? z.x1 - 1 : z.x0, r, ':', C.dim, 0.45)
    text(z.x0 === 0 ? 1 : z.x0 + 2, z.y0 + 1, 'disallow', C.dim, 0.55)
    const near = octoBox(s.octo).y + GAME.octoH > z.y0 - 3 && s.octo.x + GAME.octoW > z.x0 - 4 && s.octo.x < z.x1 + 4
    text(s.crabX, s.rows - 1, near ? '\\(\\/)/' : '(\\/)', C.sea, 0.9)

    // Fish and jellyfish.
    const fishLook = (t: Thing) => t.kind === 'big' ? (t.vx > 0 ? '><{{°>' : '<°}}><') : (t.vx > 0 ? '><>' : '<><')
    for (const t of s.things) {
      if (t.kind === 'jelly') {
        const row = Math.round(t.y)
        JELLY.forEach((line, r) => text(t.x, row + r, line, C.sea, 0.85))
        text(t.x, row + 2, JELLY_ARMS[Math.floor(now / 300 + t.seed) % 2]!, C.warm, 0.7)
        continue
      }
      const off = t.x + t.w / 2 >= z.x0 && t.x + t.w / 2 < z.x1 && t.y >= z.y0
      text(t.x, t.y, fishLook(t), t.kind === 'big' ? C.warm : C.sea, off ? 0.3 : 0.95)
    }

    // The octopus: blinking while it may not be hurt, dim while stung, its eyes saying how it is.
    const o = s.octo
    const graced = s.t < o.graceUntil
    if (!(graced && !reduced && Math.floor(now / 120) % 2)) {
      const stung = s.t < o.stungUntil
      const eye = stung ? 'x' : s.t < o.slowUntil ? '-' : s.t < o.inkUntil ? '>' : now - lastCatch < 600 ? '^' : 'o'
      OCTO.forEach((line, r) => [...line].forEach((g, c) => put(o.x + c, o.y + r, g === '@' ? eye : g, g === '@' ? C.eye : r === 0 ? C.crown : C.body, stung ? 0.55 : 1)))
      const arms = ARMS[Math.hypot(o.vx, o.vy) > 3 ? Math.floor(now / 160) % 2 : 0]!
      text(o.x, o.y + 3, arms, C.under, stung ? 0.55 : 1)
    }

    // Ink and bursts, then the words that float up.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      const f = (now - p.born) / p.life
      if (f >= 1) { particles.splice(i, 1); continue }
      const glyph = p.glyph || INK[Math.min(INK.length - 1, Math.floor(f * INK.length))]!
      ctx.globalAlpha = 1 - f
      ctx.fillStyle = p.colour
      ctx.fillText(glyph, Math.round((p.x + p.vx * f) / cellW) * cellW, Math.round((p.y + p.vy * f) / LINE) * LINE)
    }
    ctx.font = SMALL
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i]!
      const f = (now - n.born) / 1100
      if (f >= 1) { notes.splice(i, 1); continue }
      ctx.globalAlpha = 1 - f * f
      ctx.fillStyle = n.colour
      ctx.fillText(n.text, n.x, n.y - (reduced ? 0 : f * 24))
    }
    ctx.globalAlpha = 1
  }

  function loop(now: number) {
    frame = requestAnimationFrame(loop)
    if (paused || !state) { last = 0; return }
    const dt = last ? Math.min(50, now - last) : 16
    last = now
    if (phase === 'playing') {
      const events = step(state, steer(), dt)
      if (events.some(e => e.type === 'catch')) lastCatch = now
      react(events, now)
      score.textContent = `pages ${state.score}`
      const left = secondsLeft(state)
      clock.textContent = `0:${String(left).padStart(2, '0')}`
      lives.textContent = Array.from({ length: GAME.lives }, (_, i) => i < state!.lives ? '<3' : '..').join(' ')
      lives.setAttribute('aria-label', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'}`)
      ink.disabled = state.t < state.octo.inkReadyAt
    }
    draw(now)
  }

  // Input.
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' '])
  const onKey = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      spaceDown = true
      if (phase !== 'playing' && (event.repeat || swallowSpace || performance.now() < guardUntil)) { event.preventDefault(); swallowSpace = true; return }
    }
    if (event.key === 'Escape') { event.preventDefault(); shut(); return }
    if (event.key === 'Tab') {
      // Keep the Tab key inside the dialog.
      const stops = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')].filter(b => b.offsetParent !== null)
      if (!stops.length) { event.preventDefault(); return }
      const i = stops.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i === -1 || i === stops.length - 1 ? 0 : i + 1)
      event.preventDefault()
      stops[next]!.focus()
      return
    }
    if (phase !== 'playing') return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (!GAME_KEYS.has(key)) return
    event.preventDefault()
    if (key === ' ') { if (!event.repeat) inkAsked = true; return }
    keys.add(key)
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      spaceDown = false
      if (swallowSpace) { event.preventDefault(); swallowSpace = false }
    }
    keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key)
  }
  const point = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect()
    target = { x: event.clientX - box.left, y: event.clientY - box.top }
  }
  // Only the main button or a finger steers: a context menu would swallow the release.
  canvas.addEventListener('pointerdown', (event) => { if (phase === 'playing' && event.button === 0) { canvas.setPointerCapture(event.pointerId); point(event) } })
  canvas.addEventListener('pointermove', (event) => { if (target) point(event) })
  const letGo = () => { target = null }
  canvas.addEventListener('pointerup', letGo)
  canvas.addEventListener('pointercancel', letGo)
  canvas.addEventListener('lostpointercapture', letGo)
  canvas.addEventListener('contextmenu', (event) => { event.preventDefault(); letGo() })
  ink.addEventListener('click', () => { if (phase === 'playing') inkAsked = true })
  close.addEventListener('click', () => shut())
  const onVisibility = () => { paused = document.hidden; keys.clear() }
  const onBlur = () => { keys.clear(); spaceDown = false; target = null }
  const onResize = () => layout()
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)

  function shut() {
    cancelAnimationFrame(frame)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibility)
    root.remove()
    html.style.overflow = overflow
    open = false
    opener.focus({ preventScroll: true })
  }

  layout()
  showPanel('Crawl the sea', [
    '><>  a page · 1 point',
    '><{{°>  structured data · 3 points',
    '(\\/)  disallow: keep out of the crab’s floor',
    '(\u00a0\u00a0\u00a0)  a jellyfish holds you up for 2 s',
    '429  three pages in a second slows you down',
    'Arrow keys or WASD to swim, Space to ink. On a touch screen, swim to your finger.',
  ], [['Start', start], ['Back to the page', shut]])
  frame = requestAnimationFrame(loop)
}
