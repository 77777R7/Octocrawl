/** Built for coming into view, following the scroll (scrapePage.ts builtFor). The headline's words rise into place one
 * after another as it comes up the screen, and its orange words, once in place, turn over through characters before
 * settling on their letters; the lead follows. On wide screens the row of cards then holds still in the middle of the
 * window while the page scrolls on: empty at first, then the two outer cards drop in from above the window and the
 * middle one rises from below it, and they hold together before the page moves on. On narrow screens, where they stack,
 * each rises as it comes up. Scrolling back takes them apart again. A card's edge turns orange and its figure
 * starts to settle (builtForIcons.ts) once it is in place.
 *
 * With reduced motion none of this runs and everything is shown as it is. */

/** How far, in px, words and cards travel into place. */
const WORD_RISE = 22
const CARD_RISE = 160
/** How long the pinned stretch is, in window heights, and where in it (0 to 1) the outer cards and the middle one come
 * in. */
const TRACK = 1.3
const SIDES = [0.12, 0.58] as const
const MIDDLE = [0.26, 0.72] as const
const DECODE_MS = 450
const GLYPHS = '#%@*+=x'

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const easeOut = (t: number): number => 1 - (1 - t) ** 3
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function mountBuiltForReveal(section: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const title = section.querySelector<HTMLElement>('.bf-title')
  const lead = section.querySelector<HTMLElement>('.bf-lead')
  const row = section.querySelector<HTMLElement>('.bf-cards')
  const cards = [...section.querySelectorAll<HTMLElement>('.bf-card')]
  if (!title || !lead || !row || !cards.length) return
  const narrow = window.matchMedia('(max-width: 1000px)')

  // The headline in words, each its own box to move; the orange words keep their letters to decode. Screen readers
  // keep reading the headline whole.
  title.setAttribute('aria-label', title.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  const words: Array<{ box: HTMLElement; letters?: string; decoded: boolean; timer: number }> = []
  for (const node of [...title.childNodes]) {
    if (node instanceof HTMLElement) {
      node.classList.add('bf-word')
      node.setAttribute('aria-hidden', 'true')
      words.push({ box: node, letters: node.textContent ?? '', decoded: false, timer: 0 })
      continue
    }
    const parts = (node.textContent ?? '').split(/(\s+)/)
    const pieces = parts.map((part) => {
      if (!part.trim()) return document.createTextNode(part)
      const box = document.createElement('span')
      box.className = 'bf-word'
      box.setAttribute('aria-hidden', 'true')
      box.textContent = part
      words.push({ box, decoded: true, timer: 0 })
      return box
    })
    node.replaceWith(...pieces)
    // Punctuation straight after an orange word ("read,") stays on its line.
    const first = pieces[0]
    const before = first?.previousSibling
    if (first instanceof HTMLElement && before instanceof HTMLElement) {
      const join = document.createElement('span')
      join.className = 'bf-join'
      before.replaceWith(join)
      join.append(before, first)
    }
  }
  section.classList.add('is-linked')
  // The row on a stage that pins while the page scrolls through a track as long as the animation (wide screens only;
  // product.css).
  const track = document.createElement('div')
  track.className = 'bf-track'
  const stage = document.createElement('div')
  stage.className = 'bf-stage'
  row.replaceWith(track)
  stage.append(row)
  track.append(stage)

  /** An orange word turning over through characters, letter by letter from the left, before it settles. */
  const decode = (word: (typeof words)[number]): void => {
    const letters = word.letters ?? ''
    const started = performance.now()
    cancelAnimationFrame(word.timer)
    // Held at its own width, so the line does not shift as the characters turn over.
    word.box.style.width = `${word.box.getBoundingClientRect().width}px`
    const frame = (now: number): void => {
      const t = (now - started) / DECODE_MS
      if (t >= 1) {
        word.box.textContent = letters
        word.box.style.removeProperty('width')
        return
      }
      word.box.textContent = [...letters].map((ch, i) => (t > (i + 1) / (letters.length + 1) ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join('')
      word.timer = requestAnimationFrame(frame)
    }
    word.timer = requestAnimationFrame(frame)
  }

  /** How far something whose top is at `top` has come up the screen: 0 as it enters at the bottom, 1 by `by` of the
   * way up. */
  const risen = (top: number, by: number): number => clamp01((window.innerHeight - top) / (window.innerHeight * by))

  let queued = 0
  const update = (): void => {
    queued = 0
    const heading = risen(title.getBoundingClientRect().top, 0.45)
    words.forEach((word, i) => {
      const own = easeOut(clamp01(heading * 1.6 - (i / words.length) * 0.6))
      word.box.style.setProperty('--bf-rise', `${((1 - own) * WORD_RISE).toFixed(1)}px`)
      word.box.style.setProperty('--bf-show', own.toFixed(3))
      if (word.letters === undefined) return
      if (own > 0.92 && !word.decoded) {
        word.decoded = true
        decode(word)
      } else if (own < 0.3 && word.decoded) {
        // Gone again: decode afresh when it comes back.
        word.decoded = false
        cancelAnimationFrame(word.timer)
        word.box.textContent = word.letters
        word.box.style.removeProperty('width')
      }
    })
    const after = easeOut(clamp01(heading * 1.6 - 0.75))
    lead.style.setProperty('--bf-rise', `${((1 - after) * WORD_RISE).toFixed(1)}px`)
    lead.style.setProperty('--bf-show', after.toFixed(3))

    if (narrow.matches) {
      // Stacked: each card rises from below as it comes up the screen.
      for (const card of cards) {
        const top = card.getBoundingClientRect().top - (Number.parseFloat(card.style.getPropertyValue('--bf-y')) || 0)
        place(card, easeOut(risen(top, 0.4)), CARD_RISE)
      }
      return
    }
    // Side by side: the row holds still on screen while the page scrolls on through the track behind it. Empty at
    // first; then the outer cards drop in from above the window and the middle one rises from below it, a little after;
    // then they hold together for a moment before the page moves on.
    const box = track.getBoundingClientRect()
    const span = Math.max(1, box.height - stage.offsetHeight)
    const at = clamp01((pinTop - box.top) / span)
    const above = pinTop + stage.offsetHeight + 60
    const below = window.innerHeight - pinTop + 60
    cards.forEach((card, i) => {
      const middle = i === 1
      const [from, to] = middle ? MIDDLE : SIDES
      place(card, easeInOut(clamp01((at - from) / (to - from))), middle ? below : -above)
    })
  }

  /** A card `own` of the way into place from `travel` px away (up is negative). */
  const place = (card: HTMLElement, own: number, travel: number): void => {
    card.style.setProperty('--bf-y', `${((1 - own) * travel).toFixed(1)}px`)
    card.style.setProperty('--bf-show', clamp01(own * 3).toFixed(3))
    card.classList.toggle('is-moving', own < 0.985)
  }

  /** The track's length and where the row is pinned: centred top to bottom in the window. */
  let pinTop = 0
  const measure = (): void => {
    pinTop = Math.max(16, (window.innerHeight - stage.offsetHeight) / 2)
    section.style.setProperty('--bf-pin', `${pinTop.toFixed(0)}px`)
    section.style.setProperty('--bf-track', `${(stage.offsetHeight + window.innerHeight * TRACK).toFixed(0)}px`)
  }
  const queue = (): void => {
    if (!queued) queued = requestAnimationFrame(update)
  }
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', () => {
    measure()
    queue()
  })
  narrow.addEventListener('change', queue)
  measure()
  update()
}
