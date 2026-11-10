import { closePage, crawlCap, DIVE_FROM, gateOpen as gateOpenFor, hashText, isWide, layoutPage, mayRead, PROGRESS_STEPS, stageLabel, stepsDone, typesetPage, Cell, WIDE_TAIL, type CrawlStage, type PageLayout, type PageWords, type StageEvent } from './crawlModel'
import { createOctopus, SLAP_MS, type Eyes, type Mode, type Octopus, type Point, type Tone } from './crawlOctopus'

/** While a preview runs, the URL card grows down into a frameless navy window: an octopus of glyphs (crawlOctopus.ts)
 * blooms out of one cell, unfurls eight arms and walks a page drawn as a grid, the page scrolling under it and the
 * lines near it lit by it. It waits with its arms on a gate that stands for robots.txt, which opens only when the
 * server says the file allows the page, and it never goes further down than the server's reported stages allow
 * (crawlModel.ts). Nothing dissolves until the result says the page was read; then the rows it has reached dissolve
 * into glyphs from under it outward, it gathers itself and dives to the page's foot, its arms streaming above it, and
 * lands with a thud: the arms slap out along the ground, rays shoot up, and a ring runs out through every cell. Where
 * the ring has passed, the glyphs are the page's own Markdown, set as text beside the octopus, which throws up its
 * arms and hops; then the window folds back into the card. A page that was not read brings the octopus back to the
 * door, shaking its head, to hold the reason. Along the foot runs a bar of glyphs: each stage the server reports
 * sweeps its segment alight, while the awaited segment only shows a spark running to and fro, never filling.
 *
 * Opening (about 0.9 s, while the request is already out): the white card dissolves into cells from the button out,
 * the address's letters turn into glyphs and drop, an orange scan line pushes the window open with the rows weaving in
 * behind it while two glyph arms hook the card's lower corners and pull, and the letters land as the window's address
 * as the octopus emerges. Closing (0.5 s) runs it back: the scan line rises, the rows unweave, and cells gather into
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
/** Once the result is back the octopus dives to the page's foot within this, however far it has to go. */
const DIVE_MS = 1400
/** The page's silhouette is this many windows tall. Before the result the octopus walks as if it were WALK_WINDOWS
 * tall, so the rest is always there for its dive. */
const PAGE_WINDOWS = 5
const WALK_WINDOWS = 3
/** At the result the page is ended this many windows below the top of what the window shows: the dive crosses the
 * rest of the window and two more. */
const DIVE_WINDOWS = 3
/** It does not dive before it is whole, arms and all: a result that comes sooner after the click waits until then. */
const DIVE_AFTER_MS = 1300
/** After it lands: the thud, its arms thrown up, a hop, then the window folds. */
const SETTLE_MS = 1000
/** The hop it gives as its arms go up: how long, and how many rows high. */
const HOP_MS = 340
const HOP_ROWS = 1.2
const FAILURE_MS = 2200
/** A cell runs down the density ramp as it is read. */
const READ_MS = 280
const RAMP = ['X', 'x', '+', ':']
/** A read cell settles into one of these, picked by its place, so the read content reads as a glyph texture. */
const TEXTURE = ['x', '+', ':', '*', '/', '\\', '=', 'x', '+', '#']
const HOT = ['#fff1e0', '#ffc59a', '#ff9a66', '#fb7b4c']
/** The window's own navy (--navy-deep in the styles): a cell painted with it shows nothing of what is under it. */
const NAVY = '#061634'
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

// The octopus emerges EMERGE_AT after the click, growing from one cell to its size (and a little past) in EMERGE_MS,
// warm at first; its eyes open once it is whole.
const EMERGE_AT = 430
const EMERGE_MS = 460
/** The page row its mantle's top waits on, at the door, and how far down the window it rides while the page scrolls. */
const DOOR = 4
const ANCHOR = 0.24
/** The gate opens outward from the octopus, a cell every GATE_STEP_MS, each running down the ramp in GATE_MS; the page
 * behind it then comes up to its own brightness row by row. */
const GATE_STEP_MS = 7
const GATE_MS = 260
const GATE_LABEL = ' robots.txt '
/** The ring that runs out from the landing through every cell: its speed (px a ms), width (px) and life. */
const RING_SPEED = 2.6
const RING_WIDTH = 18
const RING_MS = 500
/** How far the octopus's light reaches over the page, in rows from its mantle's centre. */
const LIGHT = 12
/** While it waits for the page, a ring of that light runs out from it once in PING_MS, PING_REACH px far and
 * PING_WIDTH px wide. */
const PING_MS = 2600
const PING_REACH = 560
const PING_WIDTH = 30
/** How the octopus's cells are inked (crawlOctopus.ts Tone); a warm cell takes the hot colours instead. */
const INK: Record<Tone, string> = { lit: '#f4f8ff', body: '#d6e6ff', shade: '#b6cef7', sheen: '#ffffff', arm: '#a8c9fa', far: '#7fa3de', tip: '#ffc59a', eye: '#ffffff', lid: '#f4f8ff' }
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
/** The burst's rays: angle (degrees, 0 along the ground to the right, 90 straight up), length as a share of the
 * window (of its width for the ground-hugging ones, which are two rows thick, else its height), and thickness. */
const BURST: ReadonlyArray<readonly [number, number, boolean]> = [
  [4, 0.95, true], [16, 0.55, false], [28, 0.8, false], [42, 0.5, false], [57, 0.72, false], [72, 0.45, false],
  [84, 0.85, false], [96, 0.6, false], [110, 0.78, false], [124, 0.48, false], [139, 0.7, false], [152, 0.52, false],
  [164, 0.62, false], [176, 0.95, true],
]
/** The burst shoots out in BURST_GROW_MS, holds until BURST_HOLD_MS, and is eaten from the root in BURST_FADE_MS. */
const BURST_GROW_MS = 110
const BURST_HOLD_MS = 360
const BURST_FADE_MS = 300
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
  let words: PageWords | null = null
  /** When the page was ended early for the last dive (-Infinity when it was not). */
  let floorAt = -Infinity
  /** When a read page's dive may start, while it waits for the octopus to be whole (Infinity when none waits). */
  let diveAt = Infinity
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
  let finishMs = DIVE_MS
  // Reading: when each row of the page began to dissolve (Infinity until it has), the column that spread from, and
  // the last row begun.
  let rowAt = new Float64Array(0)
  let rowFrom = new Float32Array(0)
  let readTo = -1
  // The octopus: its mantle's height in rows, the column its centre is on and the one it leans toward, the pose it
  // was last given, and where the failure note's top edge is (stage px) for it to hold.
  let octo: Octopus | null = null
  let mantleRows = 0
  let octoCol = 0
  let octoGoal = 0
  // The dive glides from the column it starts on to the one it lands on; and where the mantle's centre last was
  // (page px), for the light it casts on the page.
  let diveFrom = 0
  let landCol = 0
  let poseAt: Point = { x: 0, y: 0 }
  let poseScale = 0
  let mode: Mode = 'crawl'
  let noteTop: { x: number; y: number } | null = null
  // The gate: its page row, when it opened, and where its label starts.
  let gateRow = 0
  let gateAt = Infinity
  let gateLabel = 0
  /** When each of the bar's steps was reported (performance.now), Infinity until then. */
  let stepAt: number[] = []
  let slamAt = -Infinity
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
    if (layout) {
      pitchX = width / layout.cols
      // The window was resized while it played: the octopus keeps its column.
      octo?.setPitch(pitchX)
    }
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
    floorAt = -Infinity
    diveAt = Infinity
    poseScale = 0
    depth = 0
    mode = 'crawl'
    noteTop = null
    gateAt = Infinity
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
    // The last run's page is let go first: fit() would size this window's cells to its columns.
    layout = null
    width = height = 0
    fit()
    card.classList.remove('is-crawling')
    windowEl.hidden = true
    // A window that measures no size (the card not laid out) would give the grid no pitch: the run goes on unshown.
    if (width === 0 || height === 0) return false
    const cols = Math.max(24, Math.floor(width / pitchX))
    visibleRows = Math.max(10, Math.floor((height - GRID_TOP - GRID_FOOT) / pitchY))
    layout = layoutPage(cols, visibleRows * PAGE_WINDOWS, hashText(url))
    pitchX = width / cols
    rowAt = new Float64Array(layout.rows).fill(Infinity)
    rowFrom = new Float32Array(layout.rows)
    readTo = -1
    const active = document.activeElement
    focusInside = active instanceof HTMLElement && form.contains(active)
    card.style.transition = 'none'
    switched = false
    startedAt = phaseAt = introAt = performance.now()
    outroAt = -Infinity
    phase = 'crawling'
    // Full size in a wide, tall window; smaller on a phone or in a short one, so it and its arms still fit.
    octo = createOctopus({ pitchX, pitchY, size: Math.max(0.62, Math.min(1, cols / 84, visibleRows / 24)), seed: hashText(url) })
    mantleRows = (octo.ry + octo.belly) / pitchY
    octoCol = octoGoal = homeCol(layout.blocks[0]!)
    gateRow = Math.round(DOOR + mantleRows + 6 * octo.ry / (3.7 * pitchY))
    // The gate's label keeps clear of the octopus, at the door and in the middle where it holds a failure's note.
    gateLabel = Math.max(2, Math.min(cols - GATE_LABEL.length - 2, Math.round(Math.max(cols * 0.62, cols / 2 + octo.rx / pitchX + 5))))
    octo.place(octoCol * pitchX, DOOR * pitchY + octo.ry, startedAt + EMERGE_AT)
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
      // The dive starts at once, or as soon as the octopus is whole.
      if (now >= introAt + DIVE_AFTER_MS) startDive(now)
      else diveAt = introAt + DIVE_AFTER_MS
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

  /** A read page's last dive begins: the page is ended below, its Markdown set, and the octopus lets go. */
  function startDive(now: number): void {
    // The page ends DIVE_WINDOWS below the top of what the window shows now (the silhouette always reaches that far,
    // since the walk keeps to its first WALK_WINDOWS), so the last dive is as long whenever the result comes: about
    // three windows of page pass under the octopus. The last screen is where the page's own Markdown is
    // set: down the main column beside the octopus where the page has a sidebar for it to land in, else in the
    // rows above where it lands. (The row at the very top of the window is under its fade.)
    const head = headAt()
    const outcome = result!
    const foot = Math.max(Math.round(scrollAt()) + Math.round(DIVE_WINDOWS * visibleRows) - 2, Math.ceil(head + mantleRows) + 4)
    if (foot < layout!.floor) {
      closePage(layout!, foot)
      floorAt = now
      depth = clamp01((head - DOOR) / (layout!.floor - mantleRows - DOOR))
    }
    const ground = layout!.floor
    // (The rows it takes up once its arms are up, at the top of its hop.)
    const cheer = Math.ceil((octo!.belly + octo!.rise) / pitchY + HOP_ROWS)
    words = typesetPage(layout!, outcome.title, outcome.markdown, { from: Math.max(0, layout!.rows - visibleRows) + 1, to: layout!.aside ? ground - 2 : ground - cheer - 1 })
    finishFrom = depth
    // The longer the drop, the longer it takes.
    finishMs = Math.max(520, Math.min(DIVE_MS, 320 + (ground - mantleRows - head) * 26))
    diveFrom = octoCol
    landCol = landingCol()
    phase = 'finishing'
    phaseAt = now
    diveAt = Infinity
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

  /** The page row the mantle's top is on (between rows while it moves), from how far down the page it is. */
  const headAt = (): number => DOOR + depth * (layout!.floor - mantleRows - DOOR)
  /** How far the page has scrolled under it, in rows: the mantle rides ANCHOR of the way down the window. */
  const scrollAt = (): number => Math.max(0, Math.min(layout!.rows - visibleRows, headAt() - visibleRows * ANCHOR))
  /** Whether the octopus may pass the gate (crawlModel.ts). */
  const gateOpen = (): boolean => gateOpenFor(seen, robotsAllowed, result?.read === true)
  /** The column the mantle's centre keeps to beside a block of the page. */
  function homeCol(block: PageLayout['blocks'][number]): number {
    const half = octo ? octo.rx / pitchX + 2 : 10
    const at = block.left + (block.right - block.left) * (0.36 + 0.14 * ((block.top * 37) % 7) / 6)
    return Math.max(half, Math.min(layout!.cols - half, at))
  }

  /** The column it lands on when the page was read: in the sidebar where the page has one, so the words set down
   * the main column stand clear of it; else in the middle, under them. */
  function landingCol(): number {
    const { cols, aside } = layout!
    // Room for its arms once they are thrown up.
    const half = octo!.span / pitchX + 1
    return Math.max(half, Math.min(cols - half, aside ? (aside.left + aside.right + 1) / 2 : cols / 2))
  }

  /** Where the failure note's top edge is on the stage, for the octopus to hold; measured once the note is laid out. */
  function measureNote(): void {
    if (noteTop || note.hidden || !switched || note.offsetWidth === 0) return
    const stage = stageEl.getBoundingClientRect()
    const box = note.getBoundingClientRect()
    noteTop = { x: box.left + box.width / 2 - stage.left, y: box.top - stage.top }
  }

  /** The octopus's pose this frame: its size while it emerges, its stretch while it dives and its squash when it
   * lands, what its eyes do, and how its arms behave. */
  function pose(now: number, dt: number): void {
    const rig = octo!
    const born = now - introAt - EMERGE_AT
    const grow = clamp01(born / EMERGE_MS)
    // Past its size and back: it blooms.
    const scale = born <= 0 ? 0 : 1 + 2.70158 * (grow - 1) ** 3 + 1.70158 * (grow - 1) ** 2
    // At rest the mantle keeps its shape exactly (it is a stamp, typed the same every frame): only the dive's
    // stretch and the landing's squash change it.
    let sx = 1
    let sy = 1
    let heat = born > 0 ? clamp01(1 - (born - 140) / 420) : 0
    const drop = phase === 'finishing' ? clamp01((now - phaseAt) / finishMs) : 0
    // It gathers itself for a moment before it dives, then stretches as it falls.
    const crouch = phase === 'finishing' ? Math.sin(Math.PI * clamp01((now - phaseAt) / 170)) : 0
    sx *= (1 - 0.1 * drop * drop) * (1 + 0.07 * crouch)
    sy *= (1 + 0.24 * drop * drop) * (1 - 0.13 * crouch)
    // -1 until it has landed.
    const since = Number.isFinite(slamAt) ? now - slamAt : -1
    if (since >= 0) {
      // Flat on landing, then it springs back past its shape and settles.
      const squash = 0.4 * (since < 80 ? since / 80 : Math.exp(-(since - 80) / 140) * Math.cos((since - 80) / 55))
      sx *= 1 + 0.75 * squash
      sy *= 1 - squash
      heat = Math.max(heat, clamp01(1 - since / 280))
    }
    const settledNow = phase === 'settled' || (phase === 'closing' && since >= 0)
    if (phase === 'finishing') mode = 'dive'
    else if (settledNow) mode = 'land'
    else if (phase === 'failed') mode = 'hold'
    const eyes: Eyes = born < EMERGE_MS + 90 ? 'shut' : since >= 0 && since < SLAP_MS ? 'squint' : settledNow ? 'happy'
      : phase === 'failed' ? (Math.floor(now / 700) % 3 === 0 ? 'shut' : 'open') : now % 2900 < 140 ? 'shut' : 'open'
    const look = phase === 'failed' ? 0 : octoGoal > octoCol + 0.6 || Math.floor(now / 2300) % 4 === 3 ? 1 : 0
    const top = scrollAt()
    // Landed, it stands on the ground; as it throws its arms up it hops.
    const hop = since > SLAP_MS ? Math.sin(Math.PI * clamp01((since - SLAP_MS) / HOP_MS)) * pitchY * HOP_ROWS : 0
    let y = settledNow ? layout!.floor * pitchY - rig.belly * sy - hop : headAt() * pitchY + rig.ry
    // A page that was not read: it shakes its head.
    const no = phase === 'failed' ? Math.sin((now - phaseAt) / 58) * Math.exp(-(now - phaseAt) / 190) * pitchX * 1.2 : 0
    let grip: [Point, Point] | undefined
    if (phase === 'failed' && noteTop) {
      // It comes to rest just above the note and lays two arms on the note's top edge.
      const edge = noteTop.y - GRID_TOP + Math.round(top) * pitchY
      const k = easeOut(clamp01((now - phaseAt) / 500))
      // In a short window the note sits high: the mantle then stays whole at the window's top, the note over its foot.
      y += (Math.max(Math.round(top) * pitchY + rig.ry, Math.min(y, edge - pitchY * 1.6 - rig.belly)) - y) * k
      const half = rig.rx * 1.05
      grip = [{ x: octoCol * pitchX - half, y: edge + 2 }, { x: octoCol * pitchX + half, y: edge + 2 }]
    }
    // Until the gate opens no arm reaches past it: the tips rest on the row above. A gate that robots.txt keeps shut
    // stays one when the run has ended (the arms then hold on to it, not to the note below); any other end lets it go.
    const bar = gateOpen() || (phase === 'failed' && robotsAllowed !== false) ? {} : { bar: gateRow * pitchY - pitchY / 2 }
    poseAt = { x: octoCol * pitchX + no, y }
    poseScale = Math.min(1, scale)
    rig.update({ now, dt, x: poseAt.x, y, scale, sx, sy, mode, eyes, look, heat, ground: layout!.floor * pitchY, ...bar, ...(grip ? { grip } : {}) })
  }

  function advance(now: number, dt: number): void {
    if (phase === 'crawling' && now >= diveAt) startDive(now)
    if (phase === 'crawling') {
      // Never past what the server has reported, nor, before the result, past where the window keeps the rest of the
      // page for the last dive: the walk's share is of the page's first WALK_WINDOWS. Toward that, slower as it nears.
      const cap = Math.min(crawlCap(seen, robotsAllowed, false), DIVE_FROM) * WALK_WINDOWS / PAGE_WINDOWS
      depth += (cap - depth) * (1 - Math.exp(-dt / (cap < depth ? 300 : 1400)))
    } else if (phase === 'finishing') {
      // It drops faster and faster, so it lands with a thud.
      const t = Math.min(1, (now - phaseAt) / finishMs)
      depth = finishFrom + (1 - finishFrom) * t * t
      // It glides across to where it will land as it falls.
      octoCol = octoGoal = diveFrom + (landCol - diveFrom) * t * t * (3 - 2 * t)
      if (t >= 1) { phase = 'settled'; phaseAt = now; slamAt = now; readRows(layout!.rows - 1, layout!.floor, now) }
    } else if (phase === 'failed') {
      depth += (0 - depth) * (1 - Math.exp(-dt / 160))
      if (now - phaseAt > FAILURE_MS) void close()
    } else if (phase === 'settled' && now - phaseAt > SETTLE_MS) void close()
    // Once the result says the page was read, the rows the octopus has reached dissolve, from under its mantle
    // outward: all it had passed by then together, the rest as it dives past them.
    const head = headAt()
    if (phase !== 'failed' && mayRead(result?.read === true)) readRows(Math.floor(head + mantleRows + 3), head + mantleRows / 2, now)
    if (gateAt === Infinity && gateOpen()) gateAt = now
    // The octopus leans toward the next block it will reach; a page that was not read brings it to the middle, where
    // the note is.
    const next = layout!.blocks.find((block) => block.top > head + mantleRows)
    if (phase === 'failed') octoGoal = layout!.cols / 2
    else if (next && phase === 'crawling') octoGoal = homeCol(next)
    if (phase === 'crawling' || phase === 'failed') octoCol += (octoGoal - octoCol) * (1 - Math.exp(-dt / 520))
    measureNote()
    pose(now, dt)
  }

  /** Starts the dissolve of every row down to `to` that has not begun it, each a little later the further it is
   * from row `from`. */
  function readRows(to: number, from: number, now: number): void {
    const last = Math.min(layout!.rows - 1, to)
    for (let row = readTo + 1; row <= last; row++) {
      rowAt[row] = now + Math.abs(row - from) * 14
      rowFrom[row] = octoCol
    }
    readTo = Math.max(readTo, last)
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    // Opening, the dive, the landing and closing run every frame; the crawl itself at about 30 fps.
    const moving = now - introAt < INTRO_MS + WEAVE_MS || phase === 'closing' || phase === 'finishing' || phase === 'settled'
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
    // After the landing the page jumps a row up and down a few times: the cells stay put, what they show shifts.
    const shakeStep = Math.floor((now - slamAt) / SHAKE_STEP_MS)
    const shake = now >= slamAt && shakeStep < SHAKE.length ? SHAKE[shakeStep]! : 0
    const scroll = scrollAt()
    const top = Math.round(scroll) - shake
    // The cells the arms' tips hold show a little brighter: touched, not read.
    const held = new Set<number>()
    for (const point of octo!.holds()) {
      const at = Math.floor(point.y / pitchY) * cols + Math.floor(point.x / pitchX)
      held.add(at - 1).add(at).add(at + 1)
    }
    // The octopus lights the page around it: cells near its mantle show brighter, fading out over LIGHT rows.
    const light = { x: poseAt.x, y: GRID_TOP + poseAt.y - top * pitchY, reach: (LIGHT * pitchY) ** 2, power: poseScale }
    // Let in and waiting for the page, it sends a ring of that light out over the page now and then.
    const ping = phase === 'crawling' && gateAt !== Infinity && poseScale >= 1 ? ((now - gateAt) % PING_MS) / PING_MS : -1
    // Landed on a page with words: the ring that runs out from where it hit turns the grid into them.
    const ground = layout!.floor
    const turning = Number.isFinite(slamAt) && words !== null && words.lastRow >= 0
    const ringX = octoCol * pitchX
    const ringY = rowY(ground, top)
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
    for (let row = Math.max(0, top); row < Math.min(rows, top + visibleRows + 1); row++) {
      const y = rowY(row, top)
      // Behind the gate the page waits dim; once the gate has opened it comes up row by row.
      const lit = row <= gateRow ? 1 : 0.45 + 0.55 * clamp01((now - gateAt - (row - gateRow) * 16) / 320)
      // A row weaves in as the opening window reaches it; so does the footer of a page that was ended early.
      const woven = Math.min(weaving ? sinceOpen - revealedAt(y + pitchY / 2) : Infinity, row >= layout!.floor ? now - floorAt : Infinity)
      if (woven < 0) continue
      const lightRow = (y - light.y) ** 2
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
        // Where the landing's ring has passed, the page is its own Markdown: a cell shows its character of it, or
        // nothing; the silhouette and its chrome are gone, all but the ground. (A page read with no words keeps the
        // texture, so it still shows as read.)
        if (turning && row < ground && now >= slamAt + Math.hypot(x - ringX, y - ringY) / RING_SPEED + ((i * 37) % 11) * 14) {
          const point = words!.chars[i]!
          if (point === 0 || point === WIDE_TAIL) continue
          ctx.fillStyle = words!.heading[i] ? '#ffc59a' : '#f4f8ff'
          ctx.fillText(String.fromCodePoint(point), isWide(point) ? x + pitchX / 2 : x, y)
          continue
        }
        if (k === Cell.Empty) continue
        const away = (x - light.x) ** 2 + lightRow
        const near = Math.max(0, 1 - away / light.reach)
        const ring = ping < 0 ? 0 : Math.max(0, 1 - Math.abs(Math.sqrt(away) - ping * PING_REACH) / PING_WIDTH) * (1 - ping)
        const glow = 1 + 1.25 * light.power * near * near + 1.5 * ring
        if (k === Cell.Chrome) {
          ctx.fillStyle = `rgba(168, 201, 250, ${chromeAlpha * lit * glow})`
          ctx.fillText(String.fromCharCode(glyph[i]!), x, y)
          continue
        }
        const age = now - rowAt[row]! - Math.abs(col - rowFrom[row]!) * 5.4
        if (!(age >= 0)) {
          ctx.fillStyle = `rgba(168, 201, 250, ${held.has(i) ? 0.9 : Math.min(0.9, ((k === Cell.Title ? 0.5 : 0.34) - 0.2 * failing) * lit * glow)})`
          ctx.fillText(String.fromCharCode(glyph[i]!), x, y)
        } else if (age < READ_MS) {
          const step = Math.min(RAMP.length - 1, Math.floor(age / READ_MS * RAMP.length))
          ctx.fillStyle = HOT[step]!
          ctx.fillText(RAMP[step]!, x, y)
        } else {
          // Read, the cell is one glyph of a texture, kept below the octopus's own brightness.
          ctx.fillStyle = k === Cell.Title ? 'rgba(251, 154, 108, .8)' : k === Cell.Image ? 'rgba(127, 166, 230, .6)' : 'rgba(150, 180, 235, .62)'
          ctx.fillText(TEXTURE[(i * 7 + (i >> 3)) % TEXTURE.length]!, x, y)
        }
      }
    }
    drawGate(now, top)
    drawThud(now, top)
    drawOctopus(scroll - shake, top)
    ctx.restore()
    // The page fades into the window's navy at its top and foot.
    const fade = (y: number, h: number, down: boolean): void => {
      const gradient = ctx.createLinearGradient(0, y, 0, y + h)
      gradient.addColorStop(down ? 0 : 1, NAVY)
      gradient.addColorStop(down ? 1 : 0, 'rgba(6, 22, 52, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, y, width, h)
    }
    fade(GRID_TOP - pitchY / 2, pitchY * 1.5, true)
    fade(height - GRID_FOOT - pitchY, pitchY * 1.5, false)
    drawBar(now)
  }

  /** The landing: the ground row takes the shock both ways, rays shoot up from where it hit, a ring runs out through
   * every cell, dust rolls away along the ground, bits fly up and fall back, and the ground keeps a dent. */
  function drawThud(now: number, top: number): void {
    // Nothing before it has landed (slamAt stays -Infinity until then).
    if (!Number.isFinite(slamAt) || now < slamAt) return
    const since = now - slamAt
    const ctx = context!
    const ground = layout!.floor
    const centre = octoCol
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
      // The burst: rays of glyphs shoot out from where it hit, up and to both sides, the ones along the ground longest
      // and two rows thick. Each runs white-hot at its root through orange to a dark red tip, flickers, then is eaten
      // from the root out. Lengths are in pixels, so the fan keeps its shape on the page's tall cells.
      const grow = easeOut(clamp01(since / BURST_GROW_MS))
      const eaten = clamp01((since - BURST_HOLD_MS) / BURST_FADE_MS)
      if (eaten < 1) {
        // The page dims behind the burst, so the rays stand out from the read text.
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
        ctx.fillStyle = `rgba(6, 22, 52, ${0.62 * grow * (1 - eaten)})`
        ctx.fillRect(0, GRID_TOP - pitchY / 2, width, height - GRID_TOP - GRID_FOOT + pitchY)
        ctx.font = `700 ${pitchY - 2}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
        const ox = centre * pitchX
        const oy = rowY(ground, top)
        for (const [angle, share, thick] of BURST) {
          const length = share * (thick ? width : height * 0.75) * grow * (0.92 + 0.08 * Math.sin(since / 30 + angle))
          const rad = angle * Math.PI / 180
          const dx = Math.cos(rad)
          const dy = -Math.sin(rad)
          const char = angle < 20 || angle > 160 ? '=' : angle < 70 ? '/' : angle <= 110 ? '|' : '\\'
          let last = ''
          for (let d = pitchX * 1.5; d <= length; d += Math.min(pitchX, pitchY) * 0.7) {
            const f = d / Math.max(1, length)
            if (f < eaten) continue
            const col = Math.floor((ox + dx * d) / pitchX)
            const row = top + Math.round((oy + dy * d - rowY(top, top)) / pitchY)
            if (`${col},${row}` === last || col < 0 || col >= layout!.cols) continue
            last = `${col},${row}`
            const tip = length - d < Math.min(pitchX, pitchY) * 1.2
            const colour = f < 0.18 ? '#ffffff' : f < 0.4 ? HOT[0]! : f < 0.62 ? HOT[1]! : f < 0.84 ? HOT[3]! : '#d9542f'
            const glyph = tip ? (Math.floor(since / 60) % 2 ? '*' : '+') : f < 0.2 ? 'X' : char
            cellAt(col, row, glyph, colour, 1 - 0.5 * eaten, f < 0.6 ? 12 : 4)
            // Every ray is two cells wide (the ground-hugging ones a row above, the others a column beside), its
            // second strand lighter.
            if (thick) cellAt(col, row - 1, f < 0.3 ? 'x' : '-', colour, 0.6 * (1 - eaten), 6)
            else if (!tip) cellAt(col + (dx < 0 ? -1 : 1), row, f < 0.3 ? 'x' : char, colour, 0.5 * (1 - eaten), 4)
          }
        }
      }
      // A ring runs out from where it hit through every cell it crosses, the empty ones too: each flares as the ring
      // passes. Behind it the page is its own words (draw).
      if (since < RING_MS) {
        const radius = since * RING_SPEED
        const fadeOut = 1 - since / RING_MS
        const ox = centre * pitchX
        const oy = rowY(ground, top)
        ctx.shadowBlur = 0
        ctx.font = `${pitchY - 3}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
        for (let row = Math.max(0, top); row < Math.min(layout!.rows, top + visibleRows + 1); row++) {
          const y = rowY(row, top)
          for (let col = 0; col < layout!.cols; col++) {
            const off = Math.abs(Math.hypot(col * pitchX + pitchX / 2 - ox, y - oy) - radius)
            if (off > RING_WIDTH) continue
            const empty = layout!.kind[row * layout!.cols + col] === Cell.Empty
            if (empty && (col + row) % 2) continue
            const core = off < RING_WIDTH * 0.4
            cellAt(col, row, core ? (empty ? '+' : 'X') : empty ? ':' : 'x', core ? HOT[0]! : HOT[2]!, (empty ? 0.55 : 1) * fadeOut)
          }
        }
        ctx.font = `700 ${pitchY - 2}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
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
      // As wide as the mantle and two cells more each side, about the line between two columns its stamp is centred on.
      const half = Math.round(octo!.rx / pitchX) + 2
      const from = Math.round(centre) - half
      for (let i = 0; i < half * 2; i++) cellAt(from + i, ground, i === 0 ? '\\' : i === half * 2 - 1 ? '/' : '_', '#8fb3ee', 0.9)
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

  /** The gate across the page that stands for robots.txt. Shut, it is a rule of glyphs with the file's name on it, a
   * spark running along it while the server reads the file. When the file allows the page the gate opens outward from
   * the octopus; when it refuses, the gate turns red and stays. A run that ends some other way lets it fade. */
  function drawGate(now: number, top: number): void {
    if (gateRow < top || gateRow > top + visibleRows) return
    const ctx = context!
    const { cols } = layout!
    const y = rowY(gateRow, top)
    const refused = robotsAllowed === false
    const quiet = phase === 'failed' && !refused ? 1 - clamp01((now - phaseAt) / 300) : 1
    const opened = now - gateAt
    if (quiet <= 0 || opened > cols * GATE_STEP_MS + GATE_MS) return
    const waiting = !done && seen.has('started') && robotsAllowed === null
    const spark = (0.5 + 0.5 * Math.sin(now / 420)) * (cols - 5) + 2
    for (let col = 2; col < cols - 2; col++) {
      const x = col * pitchX + pitchX / 2
      const letter = GATE_LABEL[col - gateLabel]
      let char = letter ?? (col % 2 ? '=' : '-')
      let colour = letter ? 'rgba(214, 230, 255, .92)' : 'rgba(168, 201, 250, .5)'
      let alpha = quiet
      if (refused) {
        if (!letter) char = col % 2 ? 'x' : '+'
        colour = letter ? '#ffb4a4' : `rgba(255, 112, 88, ${0.55 + 0.35 * Math.sin(now / 180 + col * 0.4)})`
      } else if (opened >= 0) {
        const age = opened - Math.abs(col + 0.5 - octoCol) * GATE_STEP_MS
        if (age >= GATE_MS) continue
        if (age >= 0) {
          const step = Math.min(RAMP.length - 1, Math.floor(age / GATE_MS * RAMP.length))
          char = letter && step < 2 ? letter : RAMP[step]!
          colour = HOT[step]!
        }
      } else if (waiting && !letter) {
        const d = Math.abs(col - spark)
        if (d < 3.5) { char = RAMP[Math.min(RAMP.length - 1, Math.floor(d))]!; colour = HOT[Math.min(HOT.length - 1, Math.floor(d))]!; alpha = quiet * (1 - d / 5) }
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = NAVY
      ctx.fillRect(col * pitchX, y - pitchY / 2, pitchX + 0.5, pitchY)
      ctx.globalAlpha = alpha
      ctx.fillStyle = colour
      ctx.fillText(char, x, y)
    }
    ctx.globalAlpha = 1
  }

  /** The octopus's cells (crawlOctopus.ts), each on the window's grid. A cell it covers shows none of the page; the
   * mantle keeps a cell of clear navy to either side, so the page's lines never touch it. */
  function drawOctopus(scroll: number, top: number): void {
    const ctx = context!
    const cells = octo!.cells(scroll * pitchY, top * pitchY)
    const floor = Math.floor((height - GRID_TOP - GRID_FOOT) / pitchY) + 1
    ctx.fillStyle = NAVY
    // Between the arms that hang below it there is no page either: each row is clear from its first arm to its last.
    const skirt = new Map<number, [number, number]>()
    for (const cell of cells) {
      if (cell.row < -1 || cell.row > floor) continue
      const mantle = cell.tone !== 'arm' && cell.tone !== 'far' && cell.tone !== 'tip'
      ctx.fillRect((cell.col - (mantle ? 1 : 0)) * pitchX, GRID_TOP + cell.row * pitchY, pitchX * (mantle ? 3 : 1) + 0.5, pitchY)
      if (!cell.skirt) continue
      const span = skirt.get(cell.row)
      if (!span) skirt.set(cell.row, [cell.col, cell.col])
      else { span[0] = Math.min(span[0], cell.col); span[1] = Math.max(span[1], cell.col) }
    }
    for (const [row, [from, to]] of skirt) ctx.fillRect((from - 1) * pitchX, GRID_TOP + row * pitchY, (to - from + 3) * pitchX, pitchY)
    for (const cell of cells) {
      if (cell.row < -1 || cell.row > floor) continue
      const x = cell.col * pitchX + pitchX / 2
      const y = GRID_TOP + cell.row * pitchY + pitchY / 2
      if (cell.tone === 'eye') {
        ctx.fillStyle = '#011758'
        ctx.fillRect(cell.col * pitchX, y - pitchY * 0.36, pitchX + 0.5, pitchY * 0.72)
        if (cell.char === ' ') continue
      }
      ctx.fillStyle = cell.heat > 0.7 ? HOT[0]! : cell.heat > 0.45 ? HOT[1]! : cell.heat > 0.2 ? HOT[2]! : INK[cell.tone]
      ctx.fillText(cell.char, x, y)
    }
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
