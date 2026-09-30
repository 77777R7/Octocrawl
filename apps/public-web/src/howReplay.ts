import type { SessionReplay } from './sessionReplay'

// A beat on the first run's result before the replay moves on.
const POSTER_HOLD = 1400

/** Plays How it works' replay beside its steps, looping for as long as it is on screen, unless motion is reduced.
 * The player's chunk loads when the window comes near the screen, and it starts over each time the window comes
 * back. Until it plays the window shows the first run's result. */
export function mountHowReplay(container: HTMLElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let player: SessionReplay | null = null
  let loading = false
  let near = false
  let generation = 0
  const reconcile = (): void => {
    if (!near || motion.matches) {
      generation++
      player?.dispose()
      player = null
      return
    }
    if (player || loading) return
    loading = true
    const version = ++generation
    void import('./sessionReplay').then(({ playSession }) => {
      loading = false
      // The window left, or motion was reduced, while its chunk loaded.
      if (version !== generation) {
        reconcile()
        return
      }
      player = playSession(container)
      player.start(POSTER_HOLD)
    }).catch(() => { loading = false })
  }
  new IntersectionObserver(([entry]) => {
    near = Boolean(entry?.isIntersecting)
    reconcile()
  }, { rootMargin: '0px 0px 160px 0px' }).observe(container)
  motion.addEventListener('change', reconcile)
}
