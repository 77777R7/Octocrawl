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

function mountSteps(section: HTMLElement): void {
  const scroll = section.querySelector<HTMLElement>('.fx-scroll')
  const stage = section.querySelector<HTMLElement>('.fx-stage')
  const items = [...section.querySelectorAll<HTMLElement>('.fx-item')]
  const cards = [...section.querySelectorAll<HTMLElement>('.fx-card')]
  if (!scroll || !stage || !items.length) return
  // The opposite of product.css's narrow layout, so a fractional width between the two cannot leave the cards stuck.
  const narrow = window.matchMedia('(max-width: 1000px)')
  let active = -1
  let queued = 0

  /** How far through the pinned stretch the stage is, and the numbers to scroll to a step. */
  const measure = (): { top: number; span: number; progress: number } => {
    const rect = scroll.getBoundingClientRect()
    const pinned = parseFloat(getComputedStyle(stage).top) || 0
    const span = Math.max(1, rect.height - stage.offsetHeight)
    return { top: rect.top, span, progress: Math.min(1, Math.max(0, (pinned - rect.top) / span)) }
  }

  const show = (step: number): void => {
    if (step === active) return
    active = step
    items.forEach((item, i) => item.classList.toggle('is-active', i === step))
    cards.forEach((card, i) => {
      card.classList.toggle('is-active', i === step)
      card.classList.toggle('is-past', i < step)
    })
  }

  const update = (): void => {
    queued = 0
    if (narrow.matches) return
    show(Math.min(items.length - 1, Math.floor(measure().progress * items.length)))
  }
  const queue = (): void => {
    if (!queued) queued = requestAnimationFrame(update)
  }

  for (const button of section.querySelectorAll<HTMLButtonElement>('.fx-head button')) {
    button.addEventListener('click', () => {
      if (narrow.matches) return
      const step = Number(button.dataset.step)
      const { top, span } = measure()
      const pinned = parseFloat(getComputedStyle(stage).top) || 0
      scrollPageTo(window.scrollY + top - pinned + ((step + 0.5) / items.length) * span)
    })
  }
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue)
  narrow.addEventListener('change', queue)
  update()
}
