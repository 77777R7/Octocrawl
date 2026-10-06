import { crawlCap, fillWords, hashText, layoutPage, mayRead, PROGRESS_STEPS, stageLabel, stepsDone, Cell, type CrawlStage, type PageLayout, type StageEvent } from './crawlModel'

/** While a preview runs, the URL card grows down into a frameless navy window: an octopus of glyphs crawls a page
 * drawn as a grid, the page scrolling under it. It never goes further down than the server's reported stages allow
 * (crawlModel.ts), and nothing dissolves until the result says the page was read; then it drops to the foot within
 * 1.5 s and lands with a thud, the cells of the main content it passes dissolve into glyphs, the read page's own words
 * settle into the lines, the page's chrome dims, and the window folds back into the card. A page that was not read
 * keeps the octopus at the door with the reason. Along the foot runs a bar of glyphs: each stage the server reports
 * sweeps its segment alight, while the awaited segment only shows a spark running to and fro, never filling.
 *
 * Opening (about 0.9 s, while the request is already out): the white card dissolves into cells from the button out,
 * the address's letters turn into glyphs and drop, an orange scan line pushes the window open with the rows weaving in
 * behind it while two glyph arms hook the card's lower corners and pull, and the letters land as the window's address
 * as the octopus peeks in. Closing (0.5 s) runs it back: the scan line rises, the rows unweave, and cells gather into
 * the white card. Every cell keeps its place on its grid: only its glyph, brightness and colour change. Escape or Skip
 * closes it at once; the run goes on. Nothing plays with reduced motion or once the visitor chose to always skip. */

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
/** Once the result is back the octopus finishes the page within this, however far it had to go. */
const FINISH_MS = 1500
/** After it lands: the thud, then the window folds. */
const SETTLE_MS = 850
const FAILURE_MS = 2200
/** A cell runs down the density ramp as it is read. */
const READ_MS = 280
const RAMP = ['X', 'x', '+', ':']
/** A read cell settles into one of these, picked by its place, so the read content reads as a glyph texture. */
const TEXTURE = ['x', '+', ':', '*', '/', '\\', '=', 'x', '+', '#']
const HOT = ['#fff1e0', '#ffc59a', '#ff9a66', '#fb7b4c']
const NAVY = '#081b42'
const HALO = 'rgba(4, 18, 58, .7)'
const FRAME_MS = 33
// The page's grid sits between the window's top line (the address, Skip) and its foot (the bar, what the server said).
const GRID_TOP = 44
const GRID_FOOT = 78
// The bar: a reported segment sweeps alight in this long, and the cells around its end spark for this long.
const SWEEP_MS = 420
const BURST_MS = 520
// Opening, in ms from the click: the card dissolves until DISSOLVE_MS and turns into the window at SWITCH_MS; the
// window grows from GROW_FROM for GROW_MS; a revealed row weaves in over WEAVE_MS; all is still by INTRO_MS.
const DISSOLVE_MS = 200
const SWITCH_MS = 150
const GROW_FROM = 150
const GROW_MS = 500
const WEAVE_MS = 240
const INTRO_MS = 900
// Closing: the window shrinks for SHRINK_MS, then the cells gather into the card for GATHER_MS.
const SHRINK_MS = 350
const GATHER_MS = 150
/** A cell turns from white through blue to navy in this long. */
const CELL_MS = 80
/** The effects layer reaches this far past the card, for the arms and the falling letters. */
const FX_MARGIN = 110

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
// Landing: squashed flat, arms splayed.
const SQUASH = [
  '   ,=########=,   ',
  ' =####O####O####= ',
  '=################=',
  ' \\##############/ ',
  '/x/x/ x||||x \\x\\x\\',
]
const SPRITE_W = MANTLE[0]!.length
const SPRITE_H = MANTLE.length + ARMS[0]!.length
/** The thud's flying bits: column speed, upward row speed and glyph, fixed so every landing looks alike. */
const DEBRIS: ReadonlyArray<readonly [number, number, string]> = [
  [-22, 14, '.'], [-17, 20, "'"], [-13, 26, '*'], [-9, 17, ','], [-6, 29, '.'], [-3, 22, "'"], [-1, 31, '*'],
  [2, 24, "'"], [4, 30, '*'], [7, 19, '.'], [10, 27, ','], [14, 21, "'"], [18, 16, '.'], [23, 13, '*'],
]
/** The dust rolling away along the ground: starting speed (columns a second), row above the ground and glyph. */
const DUST: ReadonlyArray<readonly [number, number, string]> = [
  [34, 0, '~'], [27, 0, '.'], [22, 1, '~'], [17, 1, ','], [12, 0, '~'], [9, 2, '.'],
]
/** How long the landing's shock, dome and dust run, and how fast the dome spreads (px a ms). */
const THUD_MS = 900
const WAVE_SPEED = 0.85
/** The window's content jumps by whole rows after the landing: one step every SHAKE_STEP_MS. */
const SHAKE = [1, -1, 1, 0, -1, 0]
const SHAKE_STEP_MS = 45

type Phase = 'idle' | 'crawling' | 'finishing' | 'settled' | 'failed' | 'closing'
type Letter = { char: string; x: number; y: number; tx: number; ty: number; land: number; gone: boolean }

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const easeOut = (t: number): number => 1 - (1 - t) ** 3
const easeIn = (t: number): number => t ** 3

function storedSkip(): boolean {
  try { return localStorage.getItem(SKIP_KEY) === '1' } catch { return false }
}
function storeSkip(skip: boolean): void {
  try { if (skip) localStorage.setItem(SKIP_KEY, '1'); else localStorage.removeItem(SKIP_KEY) } catch { /* A preference that cannot be kept lasts this visit. */ }
}

export function mountCrawlView(card: HTMLElement, hero: HTMLElement): CrawlView {
  const form = card.parentElement!
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
  const input = card.querySelector<HTMLInputElement>('input[type="url"]')
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const coarse = window.matchMedia('(max-width: 600px)')
  const context = canvas.getContext('2d')
  const fx = document.createElement('canvas')
  fx.className = 'crawl-fx'
  fx.setAttribute('aria-hidden', 'true')
  form.append(fx)
  const fxContext = fx.getContext('2d')

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
  let slamAt = -Infinity
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
  let closeDone: (() => void) | null = null
  let focusInside = false
  // Opening and closing.
  let introAt = -Infinity
  let outroAt = -Infinity
  let switched = false
  let h0 = 0
  let h1 = 0
  let shrinkFrom = 0
  let origin = { x: 0, y: 0 }
  let letters: Letter[] = []
  let fxDirty = false

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
    // Hidden (before the card turns into the window, or after) it has no size: keep the last one.
    if (w === 0 || h === 0 || (w === width && h === height && r === ratio)) return
    width = w
    height = h
    ratio = r
    canvas.width = Math.round(w * r)
    canvas.height = Math.round(h * r)
    if (layout) pitchX = width / layout.cols
  }

  /** Where each visible letter of the address sits in the input, relative to the card. */
  function readLetters(url: string, box: DOMRect): Letter[] {
    if (!input || !fxContext) return []
    const style = getComputedStyle(input)
    const field = input.getBoundingClientRect()
    fxContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const text = input.value || url
    const start = field.left - box.left + parseFloat(style.paddingLeft) - input.scrollLeft
    const out: Letter[] = []
    for (let i = 0; i < text.length && out.length < 140; i++) {
      const x = start + fxContext.measureText(text.slice(0, i)).width + fxContext.measureText(text[i]!).width / 2
      if (x < field.left - box.left || x > field.right - box.left) continue
      out.push({ char: text[i]!, x, y: field.top - box.top + field.height / 2, tx: x, ty: 0, land: 0, gone: false })
    }
    return out
  }

  /** Where each letter lands: its place in the window's address line. */
  function aimLetters(): void {
    if (!fxContext) return
    const box = card.getBoundingClientRect()
    const line = address.getBoundingClientRect()
    const style = getComputedStyle(address)
    fxContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const advance = fxContext.measureText('0').width
    const spacing = Math.min(6, 300 / Math.max(1, letters.length))
    letters.forEach((letter, i) => {
      letter.tx = line.left - box.left + i * advance + advance / 2
      letter.ty = line.top - box.top + line.height / 2
      letter.gone = letter.tx > line.right - box.left
      letter.land = 600 + i * spacing
    })
  }

  function begin(url: string): boolean {
    if (phase !== 'idle' || motion.matches || alwaysSkip.checked || !context || !fxContext) return false
    seen = new Set()
    robotsAllowed = null
    robotsUnreachable = false
    done = false
    result = null
    words = null
    depth = 0
    reach = null
    slamAt = -Infinity
    stepAt = PROGRESS_STEPS.map(() => Infinity)
    note.hidden = true
    note.textContent = ''
    address.textContent = url
    const box = card.getBoundingClientRect()
    h0 = card.offsetHeight
    const button = form.querySelector('#submit-button')?.getBoundingClientRect()
    origin = button ? { x: button.left + button.width / 2 - box.left, y: button.top + button.height / 2 - box.top } : { x: box.width - 60, y: h0 - 30 }
    letters = readLetters(url, box)
    // The window is laid out for one synchronous measure, then hidden again until the card has dissolved.
    windowEl.hidden = false
    card.classList.add('is-crawling')
    h1 = card.offsetHeight
    pitchX = coarse.matches ? 9 : 8
    pitchY = coarse.matches ? 16 : 14
    width = height = 0
    fit()
    card.classList.remove('is-crawling')
    windowEl.hidden = true
    const cols = Math.max(24, Math.floor(width / pitchX))
    visibleRows = Math.max(10, Math.floor((height - GRID_TOP - GRID_FOOT) / pitchY))
    layout = layoutPage(cols, visibleRows * 3, hashText(url))
    pitchX = width / cols
    readAt = new Float64Array(cols * layout.rows).fill(Infinity)
    reached = layout.blocks.map(() => false)
    octoX = Math.round(layout.blocks[0]!.left + 2)
    const active = document.activeElement
    focusInside = active instanceof HTMLElement && form.contains(active)
    card.style.transition = 'none'
    switched = false
    startedAt = phaseAt = introAt = performance.now()
    outroAt = -Infinity
    phase = 'crawling'
    hero.classList.add('is-crawling')
    updateFoot(startedAt)
    status.textContent = 'Extracting the page. Press Escape to skip the animation.'
    // Bring the whole window on screen without moving more than needed.
    window.setTimeout(() => { if (phase !== 'idle' && phase !== 'closing') card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, GROW_FROM + GROW_MS)
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
    focusInside = focusInside || windowEl.contains(document.activeElement)
    phase = 'closing'
    outroAt = performance.now()
    shrinkFrom = card.offsetHeight
    card.style.transition = 'none'
    if (switched) card.style.height = `${shrinkFrom}px`
    windowEl.classList.remove('is-arriving')
    const folded = closing = new Promise<void>(resolve => { closeDone = resolve })
    // Before the card turned into the window there is nothing to fold: it is simply put back (finalize clears
    // `closing`, so the promise is kept here).
    if (!switched) finalize()
    return folded
  }

  function finalize(): void {
    card.classList.remove('is-crawling')
    windowEl.hidden = true
    card.style.height = ''
    card.style.transition = ''
    hero.classList.remove('is-crawling')
    fxContext?.setTransform(1, 0, 0, 1, 0, 0)
    fxContext?.clearRect(0, 0, fx.width, fx.height)
    fxDirty = false
    cancelAnimationFrame(raf)
    raf = 0
    phase = 'idle'
    const doneClosing = closeDone
    closeDone = null
    closing = null
    doneClosing?.()
    const resolve = closed
    closed = null
    resolve?.()
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

  /** The window's height while it opens, from the card's at the click to the window's own. */
  const edgeAt = (t: number): number => h0 + (h1 - h0) * easeOut(clamp01((t - GROW_FROM) / GROW_MS))
  /** When, after the click, the opening window reached a line `y` px below its top. */
  function revealedAt(y: number): number {
    if (y <= h0) return SWITCH_MS
    const p = clamp01((y - h0) / Math.max(1, h1 - h0))
    return GROW_FROM + GROW_MS * (1 - Math.cbrt(1 - p))
  }
  /** The window's height while it closes. */
  const shrinkEdge = (t: number): number => shrinkFrom - (shrinkFrom - h0) * easeIn(clamp01(t / SHRINK_MS))

  /** The row the octopus's mantle starts on, from how far down the page it is; while the window opens it peeks in. */
  function headRow(now: number): number {
    const door = 4
    // At the foot the octopus stands on the footer's rule, near the window's bottom.
    const last = layout!.floor - SPRITE_H
    const peek = Math.round((1 - easeOut(clamp01((now - introAt - 550) / 350))) * (SPRITE_H + 6))
    return Math.round(door + depth * (last - door)) - peek
  }

  function advance(now: number, dt: number): void {
    if (phase === 'crawling') {
      const cap = crawlCap(seen, robotsAllowed, false)
      // Toward the cap, slower as it nears it: never past what the server has reported.
      depth += (cap - depth) * (1 - Math.exp(-dt / (cap < depth ? 300 : 1400)))
    } else if (phase === 'finishing') {
      // It drops faster and faster, so it lands with a thud.
      const t = Math.min(1, (now - phaseAt) / finishMs)
      depth = finishFrom + (1 - finishFrom) * t * t
      if (t >= 1) { phase = 'settled'; phaseAt = now; slamAt = now; markAll(now) }
    } else if (phase === 'failed') {
      depth += (0 - depth) * (1 - Math.exp(-dt / 160))
      if (now - phaseAt > FAILURE_MS) void close()
    } else if (phase === 'settled' && now - phaseAt > SETTLE_MS) void close()
    // Once the result says the page was read, the blocks the mantle has reached dissolve, from where an arm touched
    // them outward; the ones it passed before then dissolve together.
    const head = headRow(now)
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
    // Opening and closing run every frame; the crawl itself at about 30 fps.
    const moving = now - introAt < INTRO_MS + WEAVE_MS || phase === 'closing'
    if ((!moving && now - lastFrame < FRAME_MS) || !layout || !context) return
    const dt = Math.min(100, now - (lastFrame || now))
    lastFrame = now
    if (phase === 'closing') {
      if (outro(now)) return
    } else {
      opening(now)
      fit()
      advance(now, dt)
      updateFoot(now)
    }
    draw(now)
    drawFx(now)
  }

  /** The card turns into the window, which grows. */
  function opening(now: number): void {
    const t = now - introAt
    if (t >= INTRO_MS + WEAVE_MS) return
    if (!switched && t >= SWITCH_MS) {
      switched = true
      card.style.height = `${h0}px`
      windowEl.hidden = false
      windowEl.classList.add('is-arriving')
      card.classList.add('is-crawling')
      aimLetters()
      if (focusInside) skipButton.focus({ preventScroll: true })
    }
    if (!switched) return
    if (t < GROW_FROM + GROW_MS) card.style.height = `${edgeAt(t)}px`
    else if (card.style.height) card.style.height = ''
    if (t >= INTRO_MS) {
      windowEl.classList.remove('is-arriving')
      card.style.transition = ''
    }
  }

  /** The window folds back into the card. Returns true once it is closed. */
  function outro(now: number): boolean {
    const t = now - outroAt
    if (t < SHRINK_MS) card.style.height = `${shrinkEdge(t)}px`
    else if (card.classList.contains('is-crawling')) {
      card.classList.remove('is-crawling')
      windowEl.hidden = true
      card.style.height = `${h0}px`
    }
    if (t >= SHRINK_MS + GATHER_MS + CELL_MS) { finalize(); return true }
    return false
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
    const head = headRow(now)
    // After the landing the page jumps a row up and down a few times: the cells stay put, what they show shifts.
    const shakeStep = Math.floor((now - slamAt) / SHAKE_STEP_MS)
    const shake = now >= slamAt && shakeStep < SHAKE.length ? SHAKE[shakeStep]! : 0
    const top = Math.max(0, Math.min(rows - visibleRows, head - Math.floor(visibleRows * 0.35))) - shake
    const ending = phase === 'settled' ? Math.min(1, (now - phaseAt) / 300) : 0
    const failing = phase === 'failed' ? Math.min(1, (now - phaseAt) / 300) : 0
    const chromeAlpha = 0.32 - 0.2 * ending - 0.14 * failing
    const sinceOpen = now - introAt
    const weaving = sinceOpen < INTRO_MS + WEAVE_MS
    // While it closes, the rows just above the rising edge unweave.
    const edge = phase === 'closing' ? shrinkEdge(now - outroAt) : Infinity
    const band = pitchY * 2.5
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, GRID_TOP - pitchY / 2, width, height - GRID_TOP - GRID_FOOT + pitchY)
    ctx.clip()
    for (let row = top; row < Math.min(rows, top + visibleRows + 1); row++) {
      const y = rowY(row, top)
      const woven = weaving ? sinceOpen - revealedAt(y + pitchY / 2) : Infinity
      if (woven < 0) continue
      const unwoven = edge - y
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col
        const k = kind[i]!
        const x = col * pitchX + pitchX / 2
        // A row coming in, or going out, runs down the ramp across its whole width, empty cells too.
        if (woven < WEAVE_MS || unwoven < band) {
          const t = woven < WEAVE_MS ? woven / WEAVE_MS : clamp01(unwoven / band)
          const step = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))
          if (k === Cell.Empty && (col + row) % 3 !== 0) continue
          ctx.fillStyle = HOT[step]!
          ctx.globalAlpha = k === Cell.Empty ? 0.45 : 1
          ctx.fillText(RAMP[step]!, x, y)
          ctx.globalAlpha = 1
          continue
        }
        if (k === Cell.Empty) continue
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
    drawThud(now, head, top)
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

  /** The landing: the ground row takes the shock both ways, a dome-shaped wave runs out from where it hit, dust rolls
   * away along the ground, bits fly up and fall back, and the ground keeps a dent. */
  function drawThud(now: number, head: number, top: number): void {
    // Nothing before it has landed (slamAt stays -Infinity until then).
    if (!Number.isFinite(slamAt) || now < slamAt) return
    const since = now - slamAt
    const ctx = context!
    const ground = head + SPRITE_H
    const centre = octoX + SPRITE_W / 2
    const cellAt = (col: number, row: number, char: string, colour: string, alpha: number, glow = 0): void => {
      const x = col * pitchX + pitchX / 2
      const y = rowY(row, top)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
      ctx.fillStyle = NAVY
      ctx.fillRect(x - pitchX / 2, y - pitchY / 2, pitchX, pitchY)
      ctx.shadowBlur = glow
      ctx.globalAlpha = alpha
      ctx.fillStyle = colour
      ctx.fillText(char, x, y)
    }
    ctx.save()
    ctx.shadowColor = 'rgba(251, 123, 76, .9)'
    if (since < THUD_MS) {
      // The ground row: the shock runs out both ways, each cell flaring then cooling.
      for (let col = 0; col < layout!.cols; col++) {
        const age = since - Math.abs(col + 0.5 - centre) * 9
        if (age < 0 || age >= 380) continue
        const step = Math.min(RAMP.length - 1, Math.floor(age / 380 * RAMP.length))
        cellAt(col, ground, RAMP[step]!, HOT[step]!, 1, step < 2 ? 12 : 0)
        cellAt(col, ground + 1, RAMP[Math.min(RAMP.length - 1, step + 1)]!, HOT[step]!, 0.45)
      }
      // The dome: a ring, two cells thick, spreading from the point of impact, heavy at its crest and fading as it
      // grows. Distance is measured in pixels, so the ring is round on the page's tall cells.
      const radius = since * WAVE_SPEED
      const reach = Math.max(width, height)
      const strength = 1 - radius / reach
      if (strength > 0) {
        const span = Math.ceil((radius + pitchX * 2) / pitchY)
        for (let row = ground - span; row < ground; row++) {
          for (let col = 0; col < layout!.cols; col++) {
            const d = Math.hypot((col + 0.5 - centre) * pitchX, (row - ground) * pitchY) - radius
            if (d > pitchX * 1.2 || d < -pitchX * 2.6) continue
            const crest = d > -pitchX * 0.8
            cellAt(col, row, crest ? 'X' : (col + row) % 2 ? 'x' : '+', crest ? HOT[0]! : HOT[2]!, strength * (crest ? 1 : 0.6), crest ? 10 : 0)
          }
        }
      }
      // Dust rolls away along the ground, slowing as it goes.
      const s = since / 1000
      for (const [speed, row, char] of DUST) {
        const travel = speed * s - 0.5 * speed * 1.6 * s * s
        if (s > 0.6) break
        for (const side of [-1, 1]) cellAt(Math.round(centre + side * travel), ground - row, char, '#c9d8f2', 1 - s / 0.6)
      }
      // Bits fly up and fall back.
      for (const [speed, lift, char] of DEBRIS) {
        const rise = lift * s - 0.5 * 55 * s * s
        if (rise < 0 || s > 0.8) continue
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1 - s / 0.8
        ctx.fillStyle = '#ffc59a'
        ctx.fillText(char, Math.round(centre + speed * s) * pitchX + pitchX / 2, rowY(ground - 1 - Math.round(rise), top))
      }
    }
    // The dent stays in the ground where it hit, once the shock has passed it.
    if (since > 120) {
      const half = Math.floor(SPRITE_W / 2) + 2
      const from = Math.round(centre) - half
      for (let i = 0; i <= half * 2; i++) cellAt(from + i, ground, i === 0 ? '\\' : i === half * 2 ? '/' : '_', '#8fb3ee', 0.9)
    }
    ctx.restore()
  }

  /** The bar along the window's foot: a segment per step, lit only once the server reported it. */
  function drawBar(now: number): void {
    const ctx = context!
    ctx.save()
    ctx.font = `700 ${pitchY - 1}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const steps = PROGRESS_STEPS.length
    const left = 16
    const span = width - 32
    const cells = Math.max(steps * 4, Math.floor(span / pitchX))
    const pitch = span / cells
    const per = cells / steps
    const y = height - GRID_FOOT + 22
    // A page that was not read: the step where it stopped turns red (robots.txt when it refused, otherwise the first
    // step the server never reported), and nothing after it lights.
    const failedAt = !done || !result || result.read ? -1 : robotsAllowed === false ? PROGRESS_STEPS.indexOf('robots') : Math.min(stepsDone(seen, false), steps - 1)
    // The awaited step: the first not yet reported, while the run goes on.
    const awaited = done ? -1 : stepAt.findIndex(at => at === Infinity)
    const all = stepAt.every(at => at !== Infinity) && result?.read === true
    // The landing flashes the whole lit bar white for a moment.
    const flash = now >= slamAt ? clamp01(1 - (now - slamAt) / 260) : 0
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
      if (flash > 0 && lit >= local) { colour = flash > 0.4 ? '#ffffff' : '#fff1e0'; char = 'X' }
      const glows = colour.startsWith('#') || s === failedAt
      ctx.shadowColor = s === failedAt ? 'rgba(255, 112, 88, .9)' : 'rgba(251, 123, 76, .85)'
      ctx.shadowBlur = glows ? 9 + 16 * flash : 0
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
    const fromY = headRow(now) + SPRITE_H - 1
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
    const since = now - slamAt
    // Landing: squashed flat with its eyes screwed shut, a short hop back up, then itself, eyes still shut a moment.
    const squashed = since >= 0 && since < 200
    const hop = since >= 200 && since < 320 ? 1 : 0
    const squint = since >= 0 && since < 400
    const stride = Math.floor(now / (phase === 'failed' ? 520 : 240)) % 2
    const blink = !squint && (phase === 'failed' ? Math.floor(now / 700) % 3 === 0 : (now % 2600) < 140)
    // Dropping fast, it stretches a row taller and leaves streaks above it.
    const drop = phase === 'finishing' ? clamp01((now - phaseAt) / finishMs) : 0
    const stretched = drop > 0.6
    const lines = squashed ? SQUASH : stretched ? [...MANTLE.slice(0, 4), MANTLE[3]!, MANTLE[4]!, ...ARMS[stride]!] : [...MANTLE, ...ARMS[stride]!]
    const row0 = head + (squashed ? SPRITE_H - SQUASH.length : stretched ? -1 : -hop)
    const left = octoX - (squashed ? 1 : 0)
    if (drop > 0.35) {
      const length = Math.round(1 + 4 * (drop - 0.35) / 0.65)
      for (let k = 1; k <= length; k++) {
        const y = rowY(row0 - k, top)
        if (y < GRID_TOP - pitchY) break
        ctx.globalAlpha = 0.85 * (1 - k / (length + 1))
        ctx.fillStyle = '#a8c9fa'
        for (let dx = 3; dx < SPRITE_W - 3; dx += 2) ctx.fillText(k === 1 ? '|' : k === 2 ? ':' : '.', (left + dx) * pitchX + pitchX / 2, y)
      }
      ctx.globalAlpha = 1
    }
    lines.forEach((line, dy) => {
      const y = rowY(row0 + dy, top)
      if (y < GRID_TOP - pitchY || y > height - GRID_FOOT + pitchY) return
      // The cells under the octopus are covered, so the page never shows through its mantle or between its arms.
      const first = line.search(/\S/)
      const last = line.length - 1 - line.split('').reverse().join('').search(/\S/)
      ctx.fillStyle = NAVY
      ctx.fillRect((left + first - 1) * pitchX, y - pitchY / 2, (last - first + 3) * pitchX, pitchY)
      let eye = 0
      for (let dx = 0; dx < line.length; dx++) {
        const char = line[dx]!
        if (char === ' ') continue
        const x = (left + dx) * pitchX + pitchX / 2
        if (char === 'O') {
          if (squint) { ctx.fillStyle = '#ffffff'; ctx.fillText(eye++ === 0 ? '>' : '<', x, y) }
          else if (blink) { ctx.fillStyle = '#a8c9fa'; ctx.fillText('-', x, y) }
          else { ctx.fillStyle = '#011758'; ctx.fillRect(x - pitchX * 0.4, y - pitchY * 0.3, pitchX * 0.8, pitchY * 0.6) }
          continue
        }
        ctx.fillStyle = squashed || dy < MANTLE.length + (stretched ? 1 : 0) ? '#d6e6ff' : '#a8c9fa'
        ctx.fillText(char, x, y)
      }
    })
  }

  /** The effects around the card while it opens and closes: its cells, the scan line, the arms and the letters. */
  function drawFx(now: number): void {
    const ctx = fxContext!
    const openingNow = now - introAt < INTRO_MS
    const closingNow = phase === 'closing'
    if (!openingNow && !closingNow) {
      if (fxDirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fx.width, fx.height); fxDirty = false }
      return
    }
    fxDirty = true
    const w = card.offsetWidth + FX_MARGIN * 2
    const h = Math.max(h0, h1) + FX_MARGIN * 2
    const r = Math.min(2, window.devicePixelRatio || 1)
    fx.style.left = `${card.offsetLeft - FX_MARGIN}px`
    fx.style.top = `${card.offsetTop - FX_MARGIN}px`
    fx.style.width = `${w}px`
    fx.style.height = `${h}px`
    if (fx.width !== Math.round(w * r) || fx.height !== Math.round(h * r)) { fx.width = Math.round(w * r); fx.height = Math.round(h * r) }
    ctx.setTransform(r, 0, 0, r, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.translate(FX_MARGIN, FX_MARGIN)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${pitchY - 2}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    if (closingNow) {
      const t = now - outroAt
      if (t < SHRINK_MS) scanLine(shrinkEdge(t), 1)
      // The card is white again under these: navy cells turn back to white, the far ones first, the button last.
      else cells((age) => age < 0 ? 'navy' : age < CELL_MS ? 'back' : null, (d, far) => (1 - d / far) * GATHER_MS, t - SHRINK_MS)
      return
    }
    const t = now - introAt
    // Before the switch the card is still white under these, after it navy: a cell not yet turned stays white.
    cells((age) => age < 0 ? (switched ? 'white' : null) : age < CELL_MS ? 'turn' : switched ? null : 'navy', (d, far) => d / far * DISSOLVE_MS, t)
    if (t >= GROW_FROM && switched) scanLine(edgeAt(t), 1 - clamp01((t - GROW_FROM - GROW_MS) / 200))
    arms(t)
    drawLetters(t)
  }

  /** The card's own cells, each changing at the time `when` gives it from its distance to the button. */
  function cells(state: (age: number) => 'white' | 'navy' | 'turn' | 'back' | null, when: (d: number, far: number) => number, t: number): void {
    const ctx = fxContext!
    const cw = card.offsetWidth
    const far = Math.max(Math.hypot(origin.x, origin.y), Math.hypot(cw - origin.x, origin.y), Math.hypot(origin.x, h0 - origin.y), Math.hypot(cw - origin.x, h0 - origin.y))
    for (let y = 0; y < h0; y += pitchY) {
      for (let x = 0; x < cw; x += pitchX) {
        const w = Math.min(pitchX, cw - x)
        const h = Math.min(pitchY, h0 - y)
        const age = t - when(Math.hypot(x + w / 2 - origin.x, y + h / 2 - origin.y), far)
        const look = state(age)
        if (look === null) continue
        if (look === 'white' || look === 'navy') {
          ctx.fillStyle = look === 'white' ? '#ffffff' : NAVY
          ctx.fillRect(x, y, w, h)
          continue
        }
        // White to pale blue to navy as it dissolves; the reverse as it gathers.
        const k = clamp01(age / CELL_MS)
        const late = look === 'turn' ? k > 0.45 : k < 0.55
        ctx.fillStyle = late ? '#2f4f8f' : '#dce8ff'
        ctx.fillRect(x, y, w, h)
        ctx.fillStyle = late ? '#a8c9fa' : '#5f86c8'
        ctx.fillText(late ? ':' : '+', x + w / 2, y + h / 2)
      }
    }
  }

  /** The orange line at the window's moving edge, with two cooler rows behind it. */
  function scanLine(edge: number, alpha: number): void {
    if (alpha <= 0) return
    const ctx = fxContext!
    const cw = card.offsetWidth
    const base = Math.floor(edge / pitchY) * pitchY - pitchY / 2
    ctx.save()
    ctx.globalAlpha = alpha
    for (const [dy, glow, colour, chars] of [[0, 12, '#fff1e0', 'X='], [-1, 6, '#fb7b4c', '+x'], [-2, 0, 'rgba(251, 123, 76, .45)', ':·']] as const) {
      ctx.shadowColor = 'rgba(251, 123, 76, .9)'
      ctx.shadowBlur = glow
      ctx.fillStyle = colour
      for (let x = 0, i = 0; x < cw; x += pitchX, i++) ctx.fillText(chars[i % 2]!, x + pitchX / 2, base + dy * pitchY)
    }
    ctx.restore()
  }

  /** Two arms of glyphs reach in from beside the card, hook its lower corners and pull them down, then let go. */
  function arms(t: number): void {
    const out = clamp01((t - 80) / 220)
    const back = clamp01((t - 660) / 200)
    if (out <= 0 || back >= 1) return
    const ctx = fxContext!
    const cw = card.offsetWidth
    const edge = switched ? edgeAt(t) : h0
    for (const side of [-1, 1] as const) {
      const anchor = { x: side < 0 ? -FX_MARGIN + 18 : cw + FX_MARGIN - 18, y: -FX_MARGIN * 0.55 }
      const tip = { x: side < 0 ? -6 : cw + 6, y: edge - 6 }
      const bend = { x: side < 0 ? -FX_MARGIN * 0.75 : cw + FX_MARGIN * 0.75, y: (anchor.y + tip.y) * 0.55 }
      const length = Math.hypot(tip.x - anchor.x, tip.y - anchor.y) * 1.15
      const count = Math.max(6, Math.round(length / pitchY))
      // Reaching out it grows from its root; letting go it draws back toward its root.
      const shown = Math.round(count * out * (1 - back))
      let last = { col: NaN, row: NaN }
      for (let i = 0; i <= shown; i++) {
        const u = i / count
        const px = (1 - u) ** 2 * anchor.x + 2 * (1 - u) * u * bend.x + u * u * tip.x
        const py = (1 - u) ** 2 * anchor.y + 2 * (1 - u) * u * bend.y + u * u * tip.y
        const col = Math.round(px / pitchX)
        const row = Math.round(py / pitchY)
        if (col === last.col && row === last.row) continue
        const dx = Number.isNaN(last.col) ? 0 : col - last.col
        const dy = Number.isNaN(last.row) ? 1 : row - last.row
        last = { col, row }
        const tipCell = i >= shown - 1 && back === 0
        const char = tipCell ? (side < 0 ? 'L' : 'J') : i % 4 === 3 ? 'x' : dx === 0 ? '|' : dy === 0 ? '-' : dx * dy > 0 ? '\\' : '/'
        const y = row * pitchY + pitchY / 2
        // Two strands, the outer one lighter, so the arm reads as a limb rather than a line.
        for (const [offset, alpha] of tipCell ? [[0, 1]] as const : [[0, 1], [side, 0.55]] as const) {
          const x = (col + offset) * pitchX + pitchX / 2
          ctx.globalAlpha = alpha
          ctx.lineWidth = 3
          ctx.strokeStyle = HALO
          ctx.strokeText(offset === 0 ? char : i % 2 ? ':' : '+', x, y)
          ctx.fillStyle = tipCell ? '#ffc59a' : '#a8c9fa'
          ctx.fillText(offset === 0 ? char : i % 2 ? ':' : '+', x, y)
        }
        ctx.globalAlpha = 1
      }
    }
  }

  /** The address's letters turn into glyphs, drop a few rows cell by cell, then hop to their place in the window. */
  function drawLetters(t: number): void {
    const ctx = fxContext!
    letters.forEach((letter, i) => {
      if (letter.gone && letter.land > 0 && t > letter.land - 120) return
      // Landed, it holds its place in the address line until the line itself shows (at INTRO_MS).
      if (letter.land > 0 && t >= letter.land) {
        ctx.fillStyle = '#9db2d6'
        ctx.fillText(letter.char, letter.tx, letter.ty)
        return
      }
      const lift = Math.min(1, (t - i * 3) / 120)
      if (lift < 0) return
      const start = 150 + i * 2
      const travel = 260
      let x = letter.x
      let y = letter.y
      if (t > start) {
        const fall = Math.min(3, Math.floor(((t - start) / 1000) ** 2 * 140))
        y = letter.y + fall * pitchY
        const hopFrom = letter.land - travel
        if (letter.land > 0 && t > hopFrom) {
          const k = easeOut(clamp01((t - hopFrom) / travel))
          x = letter.x + (letter.tx - letter.x) * k
          y = y + (letter.ty - y) * k
        }
      }
      // A letter keeps its own column (snapping proportional letters to the grid would stack them); it falls and
      // hops by whole rows.
      const cx = x
      const cy = Math.round(y / pitchY) * pitchY + pitchY / 2
      ctx.lineWidth = 3
      ctx.strokeStyle = HALO
      ctx.strokeText(letter.char, cx, cy)
      ctx.fillStyle = lift < 1 ? '#14254a' : letter.land > 0 && t > letter.land - 160 ? '#dce8ff' : '#ffc59a'
      ctx.fillText(letter.char, cx, cy)
    })
  }

  return { begin, stage, finish }
}
