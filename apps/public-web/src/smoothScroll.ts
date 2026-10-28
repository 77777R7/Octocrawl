import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import './smoothScroll.css'

/** Damped page scrolling (Lenis, MIT): the wheel and the trackpad ease the page to where they point instead of jumping,
 * so a scroll carries a little weight and settles. Touch keeps the device's own scrolling, and with reduced motion
 * nothing is mounted, so the page scrolls as the browser does. Scrolls the page itself starts (a link to a part of the
 * page, a format's name) go through scrollPageTo, so they ease the same way rather than fight it. */

let lenis: Lenis | null = null
const reduce = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** `address: false` leaves the address as it is when a link to a part of the page is followed (the home page keeps its
 * own address); otherwise the link's fragment is pushed, as the browser would. */
export function mountSmoothScroll({ address = true }: { address?: boolean } = {}): void {
  if (lenis || reduce()) return
  const page = new Lenis({ lerp: 0.085, autoRaf: true, allowNestedScroll: true, stopInertiaOnNavigate: true })
  lenis = page
  // While Lenis eases towards a wheel's target it ignores the browser's own scrolling, so a key that scrolls (Page Down,
  // space, an arrow) or focus moving to something off screen would be pulled back. Either one ends the easing first.
  const yield_ = (): void => {
    if (!page.isScrolling) return
    page.stop()
    page.start()
  }
  window.addEventListener('keydown', yield_, true)
  document.addEventListener('focusin', yield_, true)
  // A link to a part of this page eases there too. Lenis's own anchor handling leaves the browser's jump in place, so
  // this one takes the click instead; a handler that already took it (the demo's scroll cue) is left alone.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null
    const id = link?.getAttribute('href')?.slice(1)
    const target = id ? document.getElementById(decodeURIComponent(id)) : null
    if (!target) return
    event.preventDefault()
    // As the browser's own jump would, move focus there, so Tab and a screen reader carry on from the target. Focus moves
    // first: moving it would end an easing already under way.
    if (!target.hasAttribute('tabindex') && !target.matches('a[href], button, input, select, textarea')) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    scrollPageTo(target === document.getElementById('top') ? 0 : window.scrollY + target.getBoundingClientRect().top)
    if (address) history.pushState(null, '', `#${id}`)
  })
}

/** Scrolls the page to `top` (px from the top of the document): eased when the smooth scroll runs, else the browser's
 * smooth scroll, or at once with reduced motion. */
export function scrollPageTo(top: number): void {
  if (lenis) lenis.scrollTo(top)
  else window.scrollTo({ top, behavior: reduce() ? 'auto' : 'smooth' })
}
