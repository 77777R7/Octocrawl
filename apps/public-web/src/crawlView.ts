import { crawlCap, fillWords, hashText, layoutPage, mayRead, PROGRESS_STEPS, stageLabel, stepsDone, Cell, type CrawlStage, type PageLayout, type StageEvent } from './crawlModel'

/** While a preview runs, the URL card grows down into a frameless navy window: an octopus of glyphs crawls a page
 * drawn as a grid, the page scrolling under it. It never goes further down than the server's reported stages allow
 * (crawlModel.ts), and nothing dissolves until the result says the page was read; then it finishes within 1.5 s, the
 * cells of the main content it passes dissolve into glyphs, the read page's own words settle into the lines, the
 * page's chrome dims, and the window folds back into the card. A page that was not read keeps the octopus at the door
 * with the reason. Along the foot runs a bar of glyphs: each stage the server reports sweeps its segment alight,
 * while the awaited segment only shows a spark running to and fro, never filling. Every cell keeps its place on the
 * grid: only its glyph, brightness and colour change. Escape or Skip closes it at once; the run goes on. Nothing
 * plays with reduced motion or once the visitor chose to always skip. */

export interface CrawlResult {
  read: boolean
  title: string | null
  markdown: string | null
  /** The status as the page names it ("Extraction complete", "Site policy blocks preview", ...). */
  label: string
  reason: string | null
  /** No capture ran (no previews left, a refused address): the window closes without a scene. */
  skipScene: boolean
}

export interface CrawlView {
  /** Opens the window for a run; false when it will not play. */
  begin(url: string): boolean
  stage(event: StageEvent): void
  /** Plays the end of the run and closes the window. Resolves once it is closed, with whether the window held focus. */
  finish(result: CrawlResult): Promise<boolean>
}

const SKIP_KEY = 'octocrawl.crawl.skip'
const MORPH_MS = 420
/** Once the result is back the octopus finishes the page within this, however far it had to go. */
const FINISH_MS = 1500
const SETTLE_MS = 600
const FAILURE_MS = 2200
/** A cell runs down the density ramp as it is read. */
const READ_MS = 280
const RAMP = ['X', 'x', '+', ':']
/** A read cell settles into one of these, picked by its place, so the read content reads as a glyph texture. */
const TEXTURE = ['x', '+', ':', '*', '/', '\\', '=', 'x', '+', '#']
const HOT = ['#fff1e0', '#ffc59a', '#ff9a66', '#fb7b4c']
const NAVY = '#081b42'
const FRAME_MS = 33
// The page's grid sits between the window's top line (the address, Skip) and its foot (the bar, what the server said).
const GRID_TOP = 44
const GRID_FOOT = 78
// The bar: a reported segment sweeps alight in this long, and the cells around its end spark for this long.
const SWEEP_MS = 420
const BURST_MS = 520

// The octopus: its mantle, eyes (O, drawn as navy cells as on the hero's static octopus) and two strides of arms.
const MANTLE = [
  '    ,=####=,    ',
  '  ,##########,  ',
  ' =###O####O###= ',
  ' =############= ',
  '  \\##########/  ',
]
const ARMS = [[
  '  /x/ x||x \\x\\  ',
  ' / /  x||x  \\ \\ ',
  ' + :  : :: :  + ',
], [
  '  \\x\\ x||x /x/  ',
  '   \\ \\x||x/ /   ',
  '  :  + :: +  :  ',
]]
const SPRITE_W = MANTLE[0]!.length
const SPRITE_H = MANTLE.length + ARMS[0]!.length

type Phase = 'idle' | 'crawling' | 'finishing' | 'settled' | 'failed' | 'closing'

function storedSkip(): boolean {
  try { return localStorage.getItem(SKIP_KEY) === '1' } catch { return false }
}
function storeSkip(skip: boolean): void {
  try { if (skip) localStorage.setItem(SKIP_KEY, '1'); else localStorage.removeItem(SKIP_KEY) } catch { /* A preference that cannot be kept lasts this visit. */ }
}

export function mountCrawlView(card: HTMLElement, hero: HTMLElement): CrawlView {
  const windowEl = card.querySelector<HTMLElement>('#crawl-window')!
  const canvas = windowEl.querySelector<HTMLCanvasElement>('.crawl-canvas')!
  const stageEl = windowEl.querySelector<HTMLElement>('.crawl-stage')!
  const address = windowEl.querySelector<HTMLElement>('#crawl-url')!
  const note = windowEl.querySelector<HTMLElement>('#crawl-note')!
  const label = windowEl.querySelector<HTMLElement>('#crawl-label')!
  const time = windowEl.querySelector<HTMLElement>('#crawl-time')!
  const skipButton = windowEl.querySelector<HTMLButtonElement>('#crawl-skip')!
  const alwaysSkip = windowEl.querySelector<HTMLInputElement>('#crawl-always-skip')!
  const status = windowEl.querySelector<HTMLElement>('#crawl-status')!
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const coarse = window.matchMedia('(max-width: 600px)')
  const context = canvas.getContext('2d')

  let phase: Phase = 'idle'
  let layout: PageLayout | null = null
  let words: Uint16Array | null = null
  let wordsAt = 0
  let seen = new Set<CrawlStage>()
  let robotsAllowed: boolean | null = null
  let robotsUnreachable = false
  let done = false
  let result: CrawlResult | null = null
  let startedAt = 0
  let endedAt = 0
  let phaseAt = 0
  let depth = 0
  let finishFrom = 0
  let finishMs = FINISH_MS
  let readAt = new Float64Array(0)
  let reached: boolean[] = []
  let reach: { x: number; y: number; at: number } | null = null
  /** When each of the bar's steps was reported (performance.now), Infinity until then. */
  let stepAt: number[] = []
  let octoX = 0
  let raf = 0
  let lastFrame = 0
  let pitchX = 8
  let pitchY = 14
  let visibleRows = 0
  let width = 0
  let height = 0
  let ratio = 1
  let closed: (() => void) | null = null
  let closing: Promise<void> | null = null
  let focusInside = false

  alwaysSkip.checked = storedSkip()
  alwaysSkip.addEventListener('change', () => {
    storeSkip(alwaysSkip.checked)
    if (alwaysSkip.checked) skip()
  })
  skipButton.addEventListener('click', () => skip())
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || phase === 'idle' || phase === 'closing') return
    event.preventDefault()
    skip()
  })

  function fit(): void {
    const w = stageEl.clientWidth
    const h = stageEl.clientHeight
    const r = Math.min(2, window.devicePixelRatio || 1)
    if (w === width && h === height && r === ratio) return
    width = w
    height = h
    ratio = r
    canvas.width = Math.round(w * r)
    canvas.height = Math.round(h * r)
    if (layout) pitchX = width / layout.cols
  }

  function morph(change: () => void): Promise<void> {
    const from = card.getBoundingClientRect().height
    change()
    const to = card.getBoundingClientRect().height
    if (from === to) return Promise.resolve()
    const animation = card.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: MORPH_MS, easing: 'cubic-bezier(.2, .7, .2, 1)' })
    return animation.finished.then(() => {}, () => {})
  }

  function begin(url: string): boolean {
    if (phase !== 'idle' || motion.matches || alwaysSkip.checked || !context || typeof card.animate !== 'function') return false
    focusInside = false
    seen = new Set()
    robotsAllowed = null
    robotsUnreachable = false
    done = false
    result = null
    words = null
    depth = 0
    reach = null
    stepAt = PROGRESS_STEPS.map(() => Infinity)
    note.hidden = true
    note.textContent = ''
    address.textContent = url
    startedAt = phaseAt = performance.now()
    phase = 'crawling'
    hero.classList.add('is-crawling')
    void morph(() => {
      windowEl.hidden = false
      card.classList.add('is-crawling')
    })
    pitchX = coarse.matches ? 9 : 8
    pitchY = coarse.matches ? 16 : 14
    width = height = 0
    fit()
    const cols = Math.max(24, Math.floor(width / pitchX))
    visibleRows = Math.max(10, Math.floor((height - GRID_TOP - GRID_FOOT) / pitchY))
    layout = layoutPage(cols, visibleRows * 3, hashText(url))
    pitchX = width / cols
    readAt = new Float64Array(cols * layout.rows).fill(Infinity)
    reached = layout.blocks.map(() => false)
    octoX = Math.round(layout.blocks[0]!.left + 2)
    updateFoot(startedAt)
    status.textContent = 'Extracting the page. Press Escape to skip the animation.'
    const active = document.activeElement
    if (active instanceof HTMLElement && card.closest('form')?.contains(active)) {
      skipButton.focus({ preventScroll: true })
      focusInside = true
    }
    // Bring the whole window on screen without moving more than needed.
    window.setTimeout(() => card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), MORPH_MS)
    if (!raf) raf = requestAnimationFrame(frame)
    return true
  }

  function markSteps(now: number): void {
    PROGRESS_STEPS.forEach((step, i) => {
      const reported = step === 'result' ? done : seen.has(step)
      if (reported && stepAt[i] === Infinity) stepAt[i] = now
    })
  }

  function stage(event: StageEvent): void {
    if (phase !== 'crawling') return
    seen.add(event.stage)
    if (event.stage === 'robots') {
      robotsAllowed = event.allowed
      robotsUnreachable = event.unreachable === true
    }
    markSteps(performance.now())
  }

  function finish(outcome: CrawlResult): Promise<boolean> {
    if (phase === 'idle') return Promise.resolve(false)
    if (phase === 'closing') return closing!.then(() => focusInside)
    done = true
    result = outcome
    const now = performance.now()
    endedAt = now
    markSteps(now)
    if (outcome.skipScene) return close().then(() => focusInside)
    if (outcome.read) {
      words = fillWords(layout!, outcome.title, outcome.markdown)
      wordsAt = now
      finishFrom = depth
      finishMs = 400 + (FINISH_MS - 400) * (1 - depth)
      phase = 'finishing'
    } else {
      phase = 'failed'
      note.replaceChildren(text('strong', outcome.label), ...(outcome.reason ? [text('span', outcome.reason)] : []))
      note.hidden = false
    }
    phaseAt = now
    status.textContent = outcome.read ? 'Page read. Your result is below.' : `${outcome.label}. ${outcome.reason ?? ''}`.trim()
    updateFoot(now)
    return new Promise<void>(resolve => { closed = resolve }).then(() => focusInside)
  }

  function skip(): void {
    if (phase === 'idle' || phase === 'closing') return
    void close()
  }

  function close(): Promise<void> {
    if (closing) return closing
    phase = 'closing'
    focusInside = focusInside || windowEl.contains(document.activeElement)
    closing = morph(() => {
      card.classList.remove('is-crawling')
      windowEl.hidden = true
    }).then(() => {
      hero.classList.remove('is-crawling')
      cancelAnimationFrame(raf)
      raf = 0
      phase = 'idle'
      closing = null
      const resolve = closed
      closed = null
      resolve?.()
    })
    return closing
  }

  function text(tag: 'strong' | 'span', value: string): HTMLElement {
    const element = document.createElement(tag)
    element.textContent = value
    return element
  }

  let footText = ''
  function updateFoot(now: number): void {
    const said = done && result ? result.label : stageLabel(seen, robotsAllowed, robotsUnreachable)
    // The time runs until the result is back, then stays at the time it took.
    const seconds = `${(((done ? endedAt : now) - startedAt) / 1000).toFixed(1)} s`
    if (`${said}|${seconds}` === footText) return
    footText = `${said}|${seconds}`
    label.textContent = said
    time.textContent = seconds
  }

  /** The row the octopus's mantle starts on, from how far down the page it is. */
  function headRow(): number {
    const door = 4
    const last = layout!.rows - SPRITE_H - 6
    return Math.round(door + depth * (last - door))
  }

  function advance(now: number, dt: number): void {
    if (phase === 'crawling') {
      const cap = crawlCap(seen, robotsAllowed, false)
      // Toward the cap, slower as it nears it: never past what the server has reported.
      depth += (cap - depth) * (1 - Math.exp(-dt / (cap < depth ? 300 : 1400)))
    } else if (phase === 'finishing') {
      const t = Math.min(1, (now - phaseAt) / finishMs)
      depth = finishFrom + (1 - finishFrom) * (1 - (1 - t) ** 2)
      if (t >= 1) { phase = 'settled'; phaseAt = now; markAll(now) }
    } else if (phase === 'failed') {
      depth += (0 - depth) * (1 - Math.exp(-dt / 160))
      if (now - phaseAt > FAILURE_MS) void close()
    } else if (phase === 'settled' && now - phaseAt > SETTLE_MS) void close()
    // Once the result says the page was read, the blocks the mantle has reached dissolve, from where an arm touched
    // them outward; the ones it passed before then dissolve together.
    const head = headRow()
    const reading = phase !== 'failed' && mayRead(result?.read === true)
    layout!.blocks.forEach((block, index) => {
      if (reached[index] || !reading || head + SPRITE_H < block.top) return
      reached[index] = true
      const x = Math.min(block.right, Math.max(block.left, octoX + Math.floor(SPRITE_W / 2)))
      const y = block.top
      reach = { x, y, at: now }
      spread(block, x, y, now)
    })
    // The octopus leans toward the next block it will reach.
    const next = layout!.blocks.find((block) => block.top > head + SPRITE_H)
    if (next) {
      const goal = Math.round(next.left + (next.right - next.left) * 0.3 - SPRITE_W / 2)
      if (Math.abs(goal - octoX) > 1) octoX += Math.sign(goal - octoX)
    }
    octoX = Math.max(0, Math.min(layout!.cols - SPRITE_W, octoX))
  }

  function spread(block: PageLayout['blocks'][number], x: number, y: number, now: number): void {
    const { cols } = layout!
    for (let row = block.top; row <= block.bottom; row++) {
      for (let col = block.left; col <= block.right; col++) {
        const i = row * cols + col
        if (layout!.kind[i] === Cell.Empty || readAt[i] !== Infinity) continue
        readAt[i] = now + (Math.abs(col - x) * 0.6 + Math.abs(row - y) * 2) * 9
      }
    }
  }

  function markAll(now: number): void {
    layout!.blocks.forEach((block, index) => {
      if (reached[index]) return
      reached[index] = true
      spread(block, block.left, block.top, now)
    })
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    if (now - lastFrame < FRAME_MS || !layout || !context) return
    const dt = Math.min(100, now - (lastFrame || now))
    lastFrame = now
    if (phase === 'closing') return
    fit()
    advance(now, dt)
    updateFoot(now)
    draw(now)
  }

  /** The vertical centre of a grid row on the canvas, given the first row shown. */
  const rowY = (row: number, top: number): number => GRID_TOP + (row - top) * pitchY + pitchY / 2

  function draw(now: number): void {
    const ctx = context!
    const { cols, rows, kind, glyph } = layout!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.font = `${pitchY - 3}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const head = headRow()
    const top = Math.max(0, Math.min(rows - visibleRows, head - Math.floor(visibleRows * 0.35)))
    const ending = phase === 'settled' ? Math.min(1, (now - phaseAt) / 300) : 0
    const failing = phase === 'failed' ? Math.min(1, (now - phaseAt) / 300) : 0
    const chromeAlpha = 0.32 - 0.2 * ending - 0.14 * failing
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, GRID_TOP - pitchY / 2, width, height - GRID_TOP - GRID_FOOT + pitchY)
    ctx.clip()
    for (let row = top; row < Math.min(rows, top + visibleRows + 1); row++) {
      const y = rowY(row, top)
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col
        const k = kind[i]!
        if (k === Cell.Empty) continue
        const x = col * pitchX + pitchX / 2
        if (k === Cell.Chrome) {
          ctx.fillStyle = `rgba(168, 201, 250, ${chromeAlpha})`
          ctx.fillText(String.fromCharCode(glyph[i]!), x, y)
          continue
        }
        const age = now - readAt[i]!
        if (age < 0 || readAt[i] === Infinity) {
          ctx.fillStyle = `rgba(168, 201, 250, ${(k === Cell.Title ? 0.5 : 0.34) - 0.2 * failing})`
          ctx.fillText(String.fromCharCode(glyph[i]!), x, y)
        } else if (age < READ_MS) {
          const step = Math.min(RAMP.length - 1, Math.floor(age / READ_MS * RAMP.length))
          ctx.fillStyle = HOT[step]!
          ctx.fillText(RAMP[step]!, x, y)
        } else {
          // A read cell shows the page's own word once the result has it, decoding in a short stagger.
          const word = words?.[i] ?? 0
          const decoded = word !== 0 && now > Math.max(readAt[i]! + READ_MS, wordsAt) + ((i * 37) % 11) * 40
          if (decoded && word === 32) continue
          // The texture stays below the octopus's own brightness; the page's words, once decoded, are the brightest.
          ctx.fillStyle = decoded ? (k === Cell.Title ? '#ffc59a' : '#f4f8ff') : k === Cell.Title ? 'rgba(251, 154, 108, .8)' : k === Cell.Image ? 'rgba(127, 166, 230, .6)' : 'rgba(150, 180, 235, .62)'
          ctx.fillText(decoded ? String.fromCharCode(word) : TEXTURE[(i * 7 + (i >> 3)) % TEXTURE.length]!, x, y)
        }
      }
    }
    drawReach(now, top)
    drawOctopus(now, head, top)
    ctx.restore()
    // The page fades into the window's navy at its top and foot.
    const fade = (y: number, h: number, down: boolean): void => {
      const gradient = ctx.createLinearGradient(0, y, 0, y + h)
      gradient.addColorStop(down ? 0 : 1, NAVY)
      gradient.addColorStop(down ? 1 : 0, 'rgba(8, 27, 66, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, y, width, h)
    }
    fade(GRID_TOP - pitchY / 2, pitchY * 1.5, true)
    fade(height - GRID_FOOT - pitchY, pitchY * 1.5, false)
    drawBar(now)
  }

  /** The bar along the window's foot: a segment per step, lit only once the server reported it. */
  function drawBar(now: number): void {
    const ctx = context!
    const steps = PROGRESS_STEPS.length
    const left = 16
    const span = width - 32
    const cells = Math.max(steps * 4, Math.floor(span / pitchX))
    const pitch = span / cells
    const per = cells / steps
    const y = height - GRID_FOOT + 22
    // A page that was not read: the step where it stopped turns red (robots.txt when it refused, otherwise the first
    // step the server never reported), and nothing after it lights.
    ctx.save()
    ctx.font = `700 ${pitchY - 1}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const failedAt = !done || !result || result.read ? -1 : robotsAllowed === false ? PROGRESS_STEPS.indexOf('robots') : Math.min(stepsDone(seen, false), steps - 1)
    // The awaited step: the first not yet reported, while the run goes on.
    const awaited = done ? -1 : stepAt.findIndex(at => at === Infinity)
    const all = stepAt.every(at => at !== Infinity) && result?.read === true
    for (let c = 0; c < cells; c++) {
      const s = Math.min(steps - 1, Math.floor(c / per))
      const local = c - s * per
      const x = left + c * pitch + pitch / 2
      const lit = stepAt[s]! !== Infinity ? (now - stepAt[s]!) / SWEEP_MS * per : -1
      let char = '·'
      let colour = 'rgba(168, 201, 250, .22)'
      if (failedAt >= 0 && s > failedAt) { /* stays dim */ }
      else if (s === failedAt) {
        char = c % 2 ? 'x' : '+'
        colour = `rgba(255, 112, 88, ${0.55 + 0.35 * Math.sin(now / 180 + c * 0.4)})`
      } else if (lit >= local) {
        const behind = lit - local
        if (behind < 1.2 && lit < per + 1) { char = 'X'; colour = '#fff1e0' }
        else {
          // Lit cells shimmer: a wave of brightness runs right along them, the glyph stepping with it.
          const wave = 0.5 + 0.5 * Math.sin(c * 0.55 - now / 110)
          char = wave > 0.75 ? 'X' : wave > 0.45 ? 'x' : wave > 0.2 ? '+' : ':'
          colour = all ? (wave > 0.6 ? '#fff1e0' : '#ffc59a') : wave > 0.6 ? '#ffc59a' : '#fb7b4c'
        }
      } else if (s === awaited) {
        // A spark runs to and fro inside the awaited segment; it never fills it.
        const spark = (0.5 + 0.5 * Math.sin(now / 340)) * (per - 1)
        const d = Math.abs(local - spark)
        if (d < 3.5) {
          char = RAMP[Math.min(RAMP.length - 1, Math.floor(d))]!
          colour = `rgba(251, 123, 76, ${1 - d / 4})`
        } else {
          char = ':'
          colour = 'rgba(168, 201, 250, .3)'
        }
      }
      // Lit and red cells glow; the rest stay flat.
      const glows = colour.startsWith('#') || s === failedAt
      ctx.shadowColor = s === failedAt ? 'rgba(255, 112, 88, .9)' : 'rgba(251, 123, 76, .85)'
      ctx.shadowBlur = glows ? 9 : 0
      ctx.fillStyle = colour
      ctx.fillText(char, x, y)
    }
    ctx.shadowBlur = 0
    // Where a step was just reported, the cells around its end spark and cool.
    for (let s = 0; s < steps; s++) {
      const age = now - stepAt[s]! - SWEEP_MS
      if (age < 0 || age > BURST_MS || stepAt[s] === Infinity) continue
      const t = age / BURST_MS
      const x = left + Math.min(cells - 1, Math.round((s + 1) * per) - 1) * pitch + pitch / 2
      const glyphs: Array<[number, number, string]> = [[0, -1, '+'], [0, 1, '+'], [-1, -1, '\\'], [1, -1, '/'], [-1, 1, '/'], [1, 1, '\\'], [0, -2, ':'], [0, 2, ':'], [2, 0, 'x']]
      ctx.globalAlpha = 1 - t
      glyphs.forEach(([dx, dy, char], i) => {
        if (i >= 6 && t < 0.25) return
        ctx.fillStyle = HOT[Math.min(HOT.length - 1, Math.floor(t * HOT.length))]!
        ctx.fillText(char, x + dx * pitch * (1 + t), y + dy * pitchY * 0.8 * (1 + t * 0.6))
      })
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  function drawReach(now: number, top: number): void {
    if (!reach || now - reach.at > 420 || phase === 'failed') return
    const ctx = context!
    const fromX = octoX + Math.floor(SPRITE_W / 2)
    const fromY = headRow() + SPRITE_H - 1
    const steps = Math.max(Math.abs(reach.x - fromX), Math.abs(reach.y - fromY))
    const life = 1 - (now - reach.at) / 420
    for (let s = 1; s < steps; s++) {
      const col = Math.round(fromX + (reach.x - fromX) * s / steps)
      const row = Math.round(fromY + (reach.y - fromY) * s / steps)
      if (row < top || row > top + visibleRows) continue
      ctx.fillStyle = `rgba(251, 123, 76, ${0.35 + 0.65 * life})`
      ctx.fillText(s % 3 === 0 ? '+' : ':', col * pitchX + pitchX / 2, rowY(row, top))
    }
  }

  function drawOctopus(now: number, head: number, top: number): void {
    const ctx = context!
    const stride = Math.floor(now / (phase === 'failed' ? 520 : 240)) % 2
    const blink = phase === 'failed' ? Math.floor(now / 700) % 3 === 0 : (now % 2600) < 140
    const lines = [...MANTLE, ...ARMS[stride]!]
    lines.forEach((line, dy) => {
      const y = rowY(head + dy, top)
      if (y < GRID_TOP - pitchY || y > height - GRID_FOOT + pitchY) return
      // The cells under the octopus are covered, so the page never shows through its mantle or between its arms.
      const first = line.search(/\S/)
      const last = line.length - 1 - line.split('').reverse().join('').search(/\S/)
      ctx.fillStyle = NAVY
      ctx.fillRect((octoX + first) * pitchX, y - pitchY / 2, (last - first + 1) * pitchX, pitchY)
      for (let dx = 0; dx < line.length; dx++) {
        const char = line[dx]!
        if (char === ' ') continue
        const x = (octoX + dx) * pitchX + pitchX / 2
        if (char === 'O') {
          if (blink) { ctx.fillStyle = '#a8c9fa'; ctx.fillText('-', x, y) }
          else { ctx.fillStyle = '#011758'; ctx.fillRect(x - pitchX * 0.4, y - pitchY * 0.3, pitchX * 0.8, pitchY * 0.6) }
          continue
        }
        ctx.fillStyle = dy < MANTLE.length ? '#d6e6ff' : '#a8c9fa'
        ctx.fillText(char, x, y)
      }
    })
  }

  return { begin, stage, finish }
}
