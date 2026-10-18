/** The format cards' windows (scrapePage.ts cardWindow): each holds one real result, and it decodes into place when its
 * card comes to the front. A front runs through the text: behind it the result, at it a few marks turning over
 * (·:+×), ahead of it what the window held before. That is the page's raw HTML for a window with a source, in the
 * result's own shape, or nothing, so the result types itself in. The text keeps its classes (headings, keys, notes) as
 * it decodes, so it lands styled.
 *
 * On wide screens a card is at the front when the stack says so (scrapeFormats.ts sends fx:front); on narrow screens,
 * once most of its window is in sight. A card that leaves the front decodes again the next time it comes back. With
 * reduced motion the windows show their result as it is, and nothing here runs. */

const MARKS = '·:+×'
const BAND = 5
const CHARS_PER_SECOND = 300

type Segment = { cls: string; text: string; start: number }
type Window = {
  card: HTMLElement
  body: HTMLElement
  /** The result, line by line, each segment with where it starts in the whole text (line breaks count one). */
  lines: Segment[][]
  length: number
  source: string
  front: boolean
  seen: boolean
  played: boolean
  raf: number
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The window's text with the front at `cursor`: decoded behind it, turning over at it, the source ahead of it. */
function render(win: Window, cursor: number, tick: number): void {
  win.body.innerHTML = win.lines.map((line) => `<span class="fx-ln">${line.map((seg) => {
    let text = ''
    for (let i = 0; i < seg.text.length; i++) {
      const k = seg.start + i
      const ch = seg.text[i]!
      if (k < cursor) text += ch
      else if (k < cursor + BAND && ch !== ' ') text += MARKS[(k * 7 + tick) % MARKS.length]
      else text += win.source ? (win.source[k] ?? ' ') : ' '
    }
    const state = seg.start + seg.text.length <= cursor ? '' : seg.start >= cursor + BAND ? ' is-ahead' : ' is-front'
    return `<span class="${seg.cls}${state}">${escapeHtml(text)}</span>`
  }).join('')}</span>`).join('\n')
}

function play(win: Window): void {
  cancelAnimationFrame(win.raf)
  win.played = true
  const started = performance.now()
  const step = (now: number): void => {
    const cursor = ((now - started) / 1000) * CHARS_PER_SECOND - BAND
    render(win, cursor, Math.floor((now - started) / 50))
    if (cursor < win.length + BAND) win.raf = requestAnimationFrame(step)
  }
  win.raf = requestAnimationFrame(step)
}

export function mountWindows(section: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const narrow = window.matchMedia('(max-width: 1000px)')
  const windows: Window[] = []
  for (const el of section.querySelectorAll<HTMLElement>('.fx-win')) {
    const card = el.closest<HTMLElement>('.fx-card')
    const body = el.querySelector<HTMLElement>('.fx-win-body')
    if (!card || !body) continue
    // Read the result once: each line's segments, their class and text, and where each starts in the whole text.
    const lines: Segment[][] = []
    let at = 0
    for (const line of body.querySelectorAll<HTMLElement>('.fx-ln')) {
      if (lines.length) at += 1
      lines.push([...line.children].map((span) => {
        const seg = { cls: span.className, text: span.textContent ?? '', start: at }
        at += seg.text.length
        return seg
      }))
    }
    const win: Window = { card, body, lines, length: at, source: el.dataset.source ?? '', front: false, seen: false, played: false, raf: 0 }
    windows.push(win)
    // Until it plays, the window holds what it decodes from.
    render(win, -BAND, 0)
  }
  if (!windows.length) return

  const reset = (win: Window): void => {
    cancelAnimationFrame(win.raf)
    win.played = false
    render(win, -BAND, 0)
  }
  const check = (win: Window): void => {
    if ((narrow.matches || win.front) && win.seen && !win.played) play(win)
    // On narrow screens a window scrolled out of sight decodes again when it comes back.
    else if (narrow.matches && !win.seen && win.played) reset(win)
  }
  // The card already at the front when this loaded.
  const first = section.querySelectorAll<HTMLElement>('.fx-card')[Number(section.dataset.front ?? 0)]
  for (const win of windows) win.front = win.card === first
  section.addEventListener('fx:front', (event) => {
    const front = (event as CustomEvent<HTMLElement>).detail
    for (const win of windows) {
      const was = win.front
      win.front = win.card === front
      // Left the front: back to its source, so it decodes when it returns.
      if (was && !win.front) reset(win)
      check(win)
    }
  })
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const win = windows.find((w) => w.body.parentElement === entry.target)
      if (!win) continue
      win.seen = entry.isIntersecting
      check(win)
    }
  }, { threshold: 0.6 })
  for (const win of windows) seen.observe(win.body.parentElement!)
}
