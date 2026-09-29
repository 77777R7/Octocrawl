import type { SessionReplay } from './sessionReplay'

// A beat on the first run's result before the replay moves on; less after the play button, which asked for it.
const POSTER_HOLD = 1400
const PLAY_HOLD = 240

/** Plays How it works' replay beside its steps, unless motion is reduced. The player's chunk loads when the window
 * comes near the screen, and it starts over each time the window comes back. Until it plays, and when paused, the
 * window shows the first run's result. The button pauses it for the visit and plays it again. */
export function mountHowReplay(container: HTMLElement, toggle: HTMLButtonElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let player: SessionReplay | null = null
  let loading = false
  let near = false
  let paused = false
  let asked = false
  let generation = 0
  const label = (): void => {
    toggle.hidden = motion.matches
    const text = paused ? 'Play replay' : 'Pause replay'
    toggle.setAttribute('aria-label', text)
    toggle.title = text
    toggle.classList.toggle('is-paused', paused)
  }
  const reconcile = (): void => {
    label()
    if (!near || paused || motion.matches) {
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
      // The window left, or the replay was paused, while its chunk loaded.
      if (version !== generation) {
        reconcile()
        return
      }
      player = playSession(container)
      player.start(asked ? PLAY_HOLD : POSTER_HOLD)
      asked = false
    }).catch(() => { loading = false })
  }
  new IntersectionObserver(([entry]) => {
    near = Boolean(entry?.isIntersecting)
    reconcile()
  }, { rootMargin: '0px 0px 160px 0px' }).observe(container)
  motion.addEventListener('change', reconcile)
  toggle.addEventListener('click', () => {
    paused = !paused
    asked = !paused
    reconcile()
  })
  label()
}
