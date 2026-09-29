/** Load click decoration only for mouse/trackpad users who allow motion, once the hero has been on screen. */
export function mountHeroClickSpark(container: HTMLElement, hero: HTMLElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = window.matchMedia('(pointer: fine)')
  const compact = window.matchMedia('(max-width: 600px)')
  let dispose: (() => void) | null = null
  let generation = 0
  let loading = false
  // A page opened further down (a section link) fetches no React until the visitor comes back to the hero.
  let seen = false

  const eligible = (): boolean => seen && !motion.matches && pointer.matches && !compact.matches
  const reconcile = (): void => {
    if (!eligible()) {
      generation++
      dispose?.()
      dispose = null
      return
    }
    if (dispose || loading) return
    loading = true
    const version = ++generation
    void import('./clickSparkReact').then(({ mountReactBitsClickSpark }) => {
      loading = false
      if (version === generation && eligible()) dispose = mountReactBitsClickSpark(container, hero)
      else if (eligible()) reconcile()
    }).catch(() => { loading = false }) // Decoration must never prevent preview use.
  }

  // The same threshold as the hero's other decoration: a hero that only touches the viewport edge is not seen.
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    seen = true
    observer.disconnect()
    reconcile()
  }, { threshold: 0.05 })
  observer.observe(hero)
  motion.addEventListener('change', reconcile)
  pointer.addEventListener('change', reconcile)
  compact.addEventListener('change', reconcile)
}
