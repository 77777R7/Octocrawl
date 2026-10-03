/** Runs `start` while `el` is on screen, the tab is visible and the visitor allows motion, and `stop` as soon as any of
 * those stops being true. Both are called only on a change, never twice in a row. Returns a function that disconnects
 * everything and calls `stop` if the effect was running. */
export function whenVisible(el: Element, start: () => void, stop: () => void, options: IntersectionObserverInit = {}): () => void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let onScreen = false
  let running = false

  const sync = () => {
    const should = onScreen && !document.hidden && !motion.matches
    if (should === running) return
    running = should
    if (should) start()
    else stop()
  }

  const observer = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting)
    sync()
  }, options)
  observer.observe(el)
  document.addEventListener('visibilitychange', sync)
  motion.addEventListener('change', sync)

  return () => {
    observer.disconnect()
    document.removeEventListener('visibilitychange', sync)
    motion.removeEventListener('change', sync)
    if (running) {
      running = false
      stop()
    }
  }
}
