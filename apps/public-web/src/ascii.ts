type OctopusEvent = CustomEvent<{ state?: 'running' | 'stalled' } | null>

const PAUSED_KEY = 'w2l:hero-motion-paused'
// The octopus renders with three.js, which needs WebGL 2; without it neither chunk is worth loading.
let webgl: boolean | undefined
function hasWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const context = document.createElement('canvas').getContext('webgl2')
      webgl = Boolean(context)
      context?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch { webgl = false }
  }
  return webgl
}

/** Load the hero decorations only in the wide desktop layout with a fine pointer, motion allowed and WebGL: the
 * React Bits octopus behind the headline and the artwork's own glyphs lit up around it. They move together or not
 * at all: the glyphs start once the octopus renders, both loop while the hero is on screen and rest while the
 * visitor works with the form, and both stop if the octopus stalls. The motion button pauses them for the rest of
 * the visit. */
export function mountHeroAscii(octopus: HTMLElement, artwork: HTMLElement, hero: HTMLElement, toggle: HTMLButtonElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = window.matchMedia('(pointer: fine)')
  // Matches the CSS breakpoint below which the hero is one column and shows a static octopus instead.
  const compact = window.matchMedia('(max-width: 1049px)')
  const form = hero.querySelector<HTMLFormElement>('#preview-form')
  let dispose: (() => void) | null = null
  let generation = 0
  let loading = false
  // Nothing loads before the hero's first intersection report, so a page opened further down (a section link,
  // a restored scroll position) fetches no decoration.
  let visible = false
  let paused = false
  // The octopus stalled after it had drawn: nothing moves until it is played again.
  let still = false
  // The octopus could not start (its chunk, WebGL or source failed, or it was too slow to draw): the hero stays
  // static for this page view and offers no motion to pause.
  let failed = false
  // The visitor is working with the form: focus inside it, or a preview in flight.
  let yielding = false
  try { paused = sessionStorage.getItem(PAUSED_KEY) === '1' } catch { /* Blocked storage only forgets the choice. */ }
  // Motion has been on screen, or a paused visit can resume it. From then on the button stays for this page view,
  // so a remount never takes it from under the pointer or keyboard focus.
  let offered = paused

  const media = (): boolean => !motion.matches && pointer.matches && !compact.matches
  // Until the WebGL probe has run the hero stays static (see below).
  const capable = (): boolean => media() && webgl === true && !failed
  const eligible = (): boolean => visible && !paused && capable()
  // Never offered for motion that has not started, or cannot run.
  const label = (): void => {
    toggle.hidden = !capable() || !offered
    const text = paused || still ? 'Play motion' : 'Pause motion'
    toggle.setAttribute('aria-label', text)
    toggle.title = text
    toggle.classList.toggle('is-paused', paused || still)
  }
  const reconcile = (): void => {
    if (!eligible()) {
      generation++
      dispose?.()
      dispose = null
    } else if (!dispose && !loading) mount()
    // After the dispose: a hero that left the screen starts over when it returns, so it offers Pause, not Play.
    label()
  }
  const fail = (): void => {
    failed = true
    // Deferred: the report can come from inside React's commit, which must not unmount its own root.
    window.setTimeout(reconcile, 0)
  }
  /** The hero yields while the visitor works with the real form: the octopus dims (see the styles), and it and the
   * glyphs rest, so nothing moves beside what the visitor is doing. */
  const sync = (): void => {
    const yields = Boolean(form && (form.contains(document.activeElement) || form.getAttribute('aria-busy') === 'true'))
    if (yields === yielding) return
    yielding = yields
    hero.classList.toggle('is-yielding', yields)
    hero.dispatchEvent(new CustomEvent('w2l:rest', { detail: { rest: yields } }))
  }
  // focusout fires before focus lands elsewhere; check once it has.
  form?.addEventListener('focusin', () => window.setTimeout(sync, 0))
  form?.addEventListener('focusout', () => window.setTimeout(sync, 0))
  if (form) new MutationObserver(sync).observe(form, { attributes: true, attributeFilter: ['aria-busy'] })

  const mount = (): void => {
    loading = true
    const version = ++generation
    // Each chunk fails on its own; without the octopus nothing animates.
    void Promise.allSettled([import('./asciiReact'), import('./heroGlyphs')]).then(([octo, lights]) => {
      loading = false
      if (version !== generation || !eligible()) {
        if (eligible()) reconcile()
        return
      }
      // The page remains usable without decoration.
      if (octo.status !== 'fulfilled') {
        fail()
        return
      }
      let glyphs = lights.status === 'fulfilled' ? lights.value.playHeroGlyphs(artwork, hero) : null
      let drawn = false
      const onOctopus = (event: Event): void => {
        const state = (event as OctopusEvent).detail?.state
        if (state === 'running') {
          drawn = true
          offered = true
          // The static octopus fades out under the arriving glyphs.
          octopus.classList.add('is-arrived')
          glyphs?.start()
          // A new octopus and new glyphs learn that the hero is already yielding.
          if (yielding) hero.dispatchEvent(new CustomEvent('w2l:rest', { detail: { rest: true } }))
          label()
        } else if (state === 'stalled') {
          glyphs?.dispose()
          glyphs = null
          // A stall before the first frame means the octopus never drew: no WebGL context, no source, too slow.
          if (!drawn) {
            fail()
            return
          }
          drawn = false
          still = true
          label()
        }
      }
      hero.addEventListener('w2l:octopus', onOctopus)
      const unmount = octo.value.mountReactBitsAscii(octopus)
      dispose = () => {
        hero.removeEventListener('w2l:octopus', onOctopus)
        glyphs?.dispose()
        glyphs = null
        unmount()
        octopus.classList.remove('is-arrived')
        still = false
      }
    })
  }

  toggle.addEventListener('click', () => {
    if (still && !paused) {
      // Stopped: remount, so the octopus and the glyphs start over.
      generation++
      dispose?.()
      dispose = null
      reconcile()
      return
    }
    paused = !paused
    try {
      if (paused) sessionStorage.setItem(PAUSED_KEY, '1')
      else sessionStorage.removeItem(PAUSED_KEY)
    } catch { /* The choice then lasts until the page reloads. */ }
    reconcile()
  })
  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting)
    reconcile()
  }, { threshold: 0.05 })
  observer.observe(hero)
  // Probing WebGL creates and drops a context (3–30 ms), so it waits for the first contentful paint and an idle
  // moment after it, and runs only where the rest of the test passes.
  const probe = (): void => {
    if (media()) hasWebGL()
    reconcile()
  }
  const soon = (): void => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(probe, { timeout: 1000 })
    else setTimeout(probe, 50)
  }
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('paint')) {
    new PerformanceObserver((list, paints) => {
      if (!list.getEntriesByName('first-contentful-paint').length) return
      paints.disconnect()
      soon()
    }).observe({ type: 'paint', buffered: true })
  } else setTimeout(soon, 300)
  for (const query of [motion, pointer, compact]) query.addEventListener('change', probe)
}
