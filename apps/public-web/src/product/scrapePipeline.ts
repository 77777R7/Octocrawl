/** How it works on /scrape/: the steps scroll, and the stage beside them shows the step at the middle of the screen.
 * Within a step its drawing follows the scroll (`--p`, 0 to 1): the request runs down the HTTP lane, the clutter falls
 * off the page, the Evidence Record prints and is sealed. Without a script the stage shows the sealed record; with
 * reduced motion each step shows finished. */

const smooth = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

export function mountScrapePipeline(section: HTMLElement): void {
  const stage = section.querySelector<HTMLElement>('.pl-stage')
  const steps = [...section.querySelectorAll<HTMLElement>('.pl-step')]
  const cards = new Map([...section.querySelectorAll<HTMLElement>('.pl-card')].map((card) => [card.dataset.step!, card]))
  if (!stage || !steps.length) return
  stage.classList.add('is-live')
  section.querySelector('.pl-steps')?.classList.add('is-live')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  const railLine = stage.querySelector<HTMLElement>('.pl-rail')
  const rail = [...stage.querySelectorAll<HTMLElement>('.pl-rail li')]
  let active = ''
  let frame = 0

  function update(): void {
    frame = 0
    // The line a step must pass to be current: the middle of the screen, or on a phone, where the stage sits on top,
    // the middle of what is left below it.
    const top = getComputedStyle(stage!).position === 'sticky' && stage!.getBoundingClientRect().top < window.innerHeight * 0.2 ? stage!.getBoundingClientRect().bottom : 0
    const middle = top + (window.innerHeight - top) * 0.5
    let current = steps[0]!
    for (const step of steps) if (step.getBoundingClientRect().top < middle) current = step
    const id = current.dataset.step!
    if (id !== active) {
      active = id
      const index = steps.indexOf(current)
      for (const step of steps) step.classList.toggle('is-active', step === current)
      for (const [key, card] of cards) card.classList.toggle('is-active', key === id)
      rail.forEach((node, i) => {
        node.classList.toggle('is-past', i < index)
        node.classList.toggle('is-active', i === index)
      })
      railLine?.style.setProperty('--rail', (index / Math.max(1, steps.length - 1)).toFixed(3))
    }
    const box = current.getBoundingClientRect()
    const p = still.matches ? 1 : Math.max(0, Math.min(1, (middle - box.top) / Math.max(1, box.height)))
    const card = cards.get(id)
    if (!card) return
    const shaped = id === 'fetch' ? smooth(0.05, 0.55, p) : id === 'clean' ? smooth(0.15, 0.6, p) : id === 'seal' ? smooth(0.02, 0.5, p) : p
    card.style.setProperty('--p', shaped.toFixed(3))
    card.classList.toggle('is-sealed', id === 'seal' && (still.matches || p > 0.55))
    card.classList.toggle('is-complete', id === 'fetch' && (still.matches || p > 0.6))
  }
  const schedule = (): void => { if (!frame) frame = requestAnimationFrame(update) }
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  still.addEventListener('change', schedule)
  update()
}
