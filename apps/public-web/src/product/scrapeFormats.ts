import { scrollPageTo } from '../smoothScroll'

/** What you get (scrapePage.ts whatYouGet): the banner's light, the cards' artwork once the section is near, and on wide
 * screens the format whose card shows, chosen by how far the reader has scrolled through the pinned stage. A format's
 * name scrolls to its card. Narrow screens show every format with its card, so nothing here runs for them. */

export function mountFormats(section: HTMLElement): void {
  const banner = section.querySelector<HTMLElement>('.fx-banner')
  const light = section.querySelector<HTMLElement>('.fx-light')
  const scroll = section.querySelector<HTMLElement>('.fx-scroll')
  // The section starts about a screen below the top, so each part waits for itself: the light for the banner, the cards'
  // artwork for the cards.
  if (banner && light) {
    once(banner, '200px', () => {
      void import('./glyphLight').then(({ mountGlyphLight }) => {
        // The hill's top sits just above the words, so the light never runs behind them.
        const kicker = section.querySelector<HTMLElement>('.fx-kicker')
        const crest = (): number => (kicker ? Math.max(0.2, (kicker.getBoundingClientRect().top - light.getBoundingClientRect().top - 28) / Math.max(1, light.clientHeight)) : 0.45)
        if (mountGlyphLight(light, { cell: 16, crest })) light.classList.add('is-live')
      }).catch(() => { /* The CSS glow stays. */ })
    })
  }
  if (scroll) once(scroll, '400px', () => section.classList.add('is-near'))
  mountSteps(section)
}

/** Runs `then` the first time `target` comes within `margin` of the viewport. */
function once(target: HTMLElement, margin: string, then: () => void): void {
  new IntersectionObserver((entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    then()
  }, { rootMargin: `${margin} 0px` }).observe(target)
}

/** Scroll units the first card holds before the second starts rising, and the last holds before the stage lets go. */
const LEAD = 0.15
const HOLD = 0.35

/** Ease in and out, so a card gathers speed as it rises and settles onto the stack. */
const glide = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** On wide screens the cards follow the scroll continuously: each one rises from below the stage as its stretch of the
 * pinned scroll passes, from just below the window, and the cards it covers shrink back, lift a little so their top edge shows above it, and darken,
 * by how far they are covered. The left column follows the card most in view; a format's name scrolls to its card.
 * With reduced motion the same stretches swap whole cards instead. Narrow screens keep their stacked layout. */
function mountSteps(section: HTMLElement): void {
  const scroll = section.querySelector<HTMLElement>('.fx-scroll')
  const stage = section.querySelector<HTMLElement>('.fx-stage')
  const items = [...section.querySelectorAll<HTMLElement>('.fx-item')]
  const cards = [...section.querySelectorAll<HTMLElement>('.fx-card')]
  if (!scroll || !stage || !items.length || cards.length !== items.length) return
  // The opposite of product.css's narrow layout, so a fractional width between the two cannot leave the cards stuck.
  const narrow = window.matchMedia('(max-width: 1000px)')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const count = cards.length
  const length = count - 1 + LEAD + HOLD
  const written = new Map<HTMLElement, string>()
  let active = -1
  let queued = 0

  /** Where the pinned stretch starts on the page, and how long it is. */
  const measure = (): { start: number; span: number } => {
    const rect = scroll.getBoundingClientRect()
    const pinned = parseFloat(getComputedStyle(stage).top) || 0
    return { start: window.scrollY + rect.top - pinned, span: Math.max(1, rect.height - stage.offsetHeight) }
  }

  const write = (card: HTMLElement, transform: string, dim: string): void => {
    const key = `${transform}|${dim}`
    if (written.get(card) === key) return
    written.set(card, key)
    card.style.transform = transform
    card.style.setProperty('--fx-dim', dim)
  }

  const showItem = (step: number): void => {
    if (step === active) return
    active = step
    items.forEach((item, i) => item.classList.toggle('is-active', i === step))
  }

  const update = (): void => {
    queued = 0
    if (narrow.matches) {
      if (!written.size) return
      written.clear()
      section.classList.remove('is-linked')
      for (const card of cards) {
        card.style.transform = ''
        card.style.removeProperty('--fx-dim')
      }
      return
    }
    section.classList.add('is-linked')
    const { start, span } = measure()
    const at = Math.min(1, Math.max(0, (window.scrollY - start) / span)) * length - LEAD
    // A card waiting its turn sits just below the bottom of the window, so it rises into view from the screen's edge.
    const below = Math.max(0, window.innerHeight - cards[0]!.offsetTop - stage.getBoundingClientRect().top) + 24
    // How far each card has risen into place, 0 to 1; the first is always there.
    const risen = cards.map((_, i) => {
      if (i === 0) return 1
      const t = Math.min(1, Math.max(0, at - (i - 1)))
      return still ? (t >= 0.5 ? 1 : 0) : glide(t)
    })
    cards.forEach((card, i) => {
      let depth = 0
      for (let j = i + 1; j < count; j++) depth += risen[j]!
      const rise = (1 - risen[i]!) * below
      const lift = Math.min(depth, 1.5) * 5
      const scale = 1 - Math.min(depth, 3) * 0.05
      const transform = depth > 0.001 ? `translateY(${(-lift).toFixed(2)}%) scale(${scale.toFixed(4)})` : rise > 0.1 ? `translateY(${rise.toFixed(1)}px)` : 'none'
      write(card, transform, Math.min(0.75, 1 - 0.6 ** depth).toFixed(3))
    })
    showItem(Math.min(count - 1, Math.max(0, Math.floor(at + 0.5))))
  }
  const queue = (): void => {
    if (!queued) queued = requestAnimationFrame(update)
  }

  for (const button of section.querySelectorAll<HTMLButtonElement>('.fx-head button')) {
    button.addEventListener('click', () => {
      if (narrow.matches) return
      const { start, span } = measure()
      scrollPageTo(start + ((Number(button.dataset.step) + LEAD) / length) * span)
    })
  }
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue)
  narrow.addEventListener('change', queue)
  update()
}
