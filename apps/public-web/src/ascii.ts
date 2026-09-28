/** Load the decorative React Bits renderer only in the wide desktop layout with a fine pointer. */
export function mountHeroAscii(container: HTMLElement, hero: HTMLElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = window.matchMedia('(pointer: fine)')
  // Matches the CSS breakpoint below which the hero is one column and the octopus cell is hidden.
  const compact = window.matchMedia('(max-width: 1049px)')
  let dispose: (() => void) | null = null
  let generation = 0
  let loading = false
  let visible = true

  const eligible = (): boolean => visible && !motion.matches && pointer.matches && !compact.matches
  const reconcile = (): void => {
    if (!eligible()) {
      generation++
      dispose?.()
      dispose = null
      container.classList.remove('is-animated')
      return
    }
    if (dispose || loading) return
    loading = true
    const version = ++generation
    void import('./asciiReact').then(({ mountReactBitsAscii }) => {
      loading = false
      if (version === generation && eligible()) {
        dispose = mountReactBitsAscii(container)
        // The hero cell shows the static octopus until the animation replaces it.
        container.classList.add('is-animated')
      }
      else if (eligible()) reconcile()
    }).catch(() => { loading = false }) // The page remains usable without decoration.
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting)
    reconcile()
  }, { threshold: 0.05 })
  observer.observe(hero)
  for (const query of [motion, pointer, compact]) query.addEventListener('change', reconcile)
  reconcile()
}
