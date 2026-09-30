type OctopusEvent = CustomEvent<{ state?: 'running' | 'awake' | 'stalled' } | null>

// If the live octopus has not drawn after this long (a slow network), the static one comes up to its own opacity
// meanwhile, so a dim hero never looks broken.
const WAIT_MS = 8000

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
 * React Bits octopus behind the headline and the artwork's own glyphs and night sky lit up around it. They move
 * together or not at all: the glyphs light up from the octopus outwards when it wakes, both loop for as long as the
 * hero is on screen and rest while the visitor works with the form, and both stop if the octopus stalls. */
export function mountHeroAscii(octopus: HTMLElement, artwork: HTMLElement, hero: HTMLElement): void {
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
  // The octopus could not start (its chunk, WebGL or source failed, or it was too slow to draw): the hero stays
  // static for this page view.
  let failed = false
  // The visitor is working with the form: focus inside it, or a preview in flight.
  let yielding = false
  // A preview is in flight: the octopus takes the link.
  let taking = false

  const media = (): boolean => !motion.matches && pointer.matches && !compact.matches
  // Until the WebGL probe has run the hero stays static (see below).
  const eligible = (): boolean => visible && media() && webgl === true && !failed
  // A hero that leaves the screen stops, and starts over when it returns.
  const reconcile = (): void => {
    if (!eligible()) {
      generation++
      dispose?.()
      dispose = null
    } else if (!dispose && !loading) mount()
  }
  // The static octopus waits dim where the live one can run (see the styles); it comes up to its own opacity once
  // the live one is known not to.
  const fail = (): void => {
    failed = true
    octopus.classList.add('is-static')
    // Deferred: the report can come from inside React's commit, which must not unmount its own root.
    window.setTimeout(reconcile, 0)
  }
  /** The hero yields while the visitor works with the real form: while they type the octopus dims (see the styles)
   * and it and the glyphs rest, so nothing moves beside what the visitor is doing. While a preview is extracted the
   * glyphs still rest, but the octopus comes forward and takes the link (w2l:take); the form's own message says how
   * it ended. */
  const sync = (): void => {
    const busy = form?.getAttribute('aria-busy') === 'true'
    const yields = Boolean(form && (busy || form.contains(document.activeElement)))
    if (busy !== taking) {
      taking = busy
      // The form has set its message before it stops being busy.
      const unread = Boolean(hero.querySelector('#form-message.is-error'))
      hero.dispatchEvent(new CustomEvent('w2l:take', { detail: { phase: busy ? 'start' : unread ? 'failure' : 'success' } }))
    }
    hero.classList.toggle('is-yielding', yields && !busy)
    if (yields === yielding) return
    yielding = yields
    hero.dispatchEvent(new CustomEvent('w2l:rest', { detail: { rest: yields } }))
  }
  // focusout fires before focus lands elsewhere; check once it has.
  form?.addEventListener('focusin', () => window.setTimeout(sync, 0))
  form?.addEventListener('focusout', () => window.setTimeout(sync, 0))
  if (form) new MutationObserver(sync).observe(form, { attributes: true, attributeFilter: ['aria-busy'] })

  const mount = (): void => {
    loading = true
    const version = ++generation
    const waiting = window.setTimeout(() => octopus.classList.add('is-static'), WAIT_MS)
    // Each chunk fails on its own; without the octopus nothing animates.
    void Promise.allSettled([import('./asciiReact'), import('./heroGlyphs')]).then(([octo, lights]) => {
      loading = false
      if (version !== generation || !eligible()) {
        window.clearTimeout(waiting)
        if (eligible()) reconcile()
        return
      }
      // The page remains usable without decoration.
      if (octo.status !== 'fulfilled') {
        window.clearTimeout(waiting)
        fail()
        return
      }
      let glyphs = lights.status === 'fulfilled' ? lights.value.playHeroGlyphs(artwork, hero) : null
      let drawn = false
      const onOctopus = (event: Event): void => {
        const state = (event as OctopusEvent).detail?.state
        if (state === 'running') {
          window.clearTimeout(waiting)
          drawn = true
          // The static octopus fades out under the arriving glyphs.
          octopus.classList.add('is-arrived')
          glyphs?.start()
          // A new octopus and new glyphs learn that the hero is already yielding, or a preview in flight.
          if (taking) hero.dispatchEvent(new CustomEvent('w2l:take', { detail: { phase: 'start', late: true } }))
          if (yielding) hero.dispatchEvent(new CustomEvent('w2l:rest', { detail: { rest: true } }))
        } else if (state === 'awake') {
          // The octopus's startup ends in a flash: its light spreads into the landscape.
          glyphs?.enter()
        } else if (state === 'stalled') {
          // The octopus keeps its last whole frame; the glyphs go with it.
          glyphs?.dispose()
          glyphs = null
          // A stall before the first frame means the octopus never drew: no WebGL context, no source, too slow.
          if (!drawn) fail()
        }
      }
      hero.addEventListener('w2l:octopus', onOctopus)
      const unmount = octo.value.mountReactBitsAscii(octopus)
      dispose = () => {
        window.clearTimeout(waiting)
        hero.removeEventListener('w2l:octopus', onOctopus)
        glyphs?.dispose()
        glyphs = null
        unmount()
        octopus.classList.remove('is-arrived')
      }
    })
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting)
    reconcile()
  }, { threshold: 0.05 })
  observer.observe(hero)
  // Probing WebGL creates and drops a context (3–30 ms), so it waits for the first contentful paint and an idle
  // moment after it, and runs only where the rest of the test passes.
  const probe = (): void => {
    if (media() && !hasWebGL()) octopus.classList.add('is-static')
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
