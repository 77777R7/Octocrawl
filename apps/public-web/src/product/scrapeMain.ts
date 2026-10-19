import '../styles.css'
import './product.css'
import { trackLinkClicks, trackPageView } from '../analytics'
import { mountScrapeFeatures } from './scrapeFeatures'
import { mountFormats } from './scrapeFormats'
import { mountBuiltForReveal } from './builtForReveal'
import { mountGlyphRipple } from '../glyphRipple'
import { mountSmoothScroll } from '../smoothScroll'

// /scrape/: damped scrolling, the hero's artwork brought to life in its own glyphs, its three recorded scrapes, what
// you get, who it is built for, how it climbs to read a page, and the hash check.
mountSmoothScroll()
mountHeroArt()
const shell = document.querySelector<HTMLElement>('.product-page')
if (shell) mountScrapeFeatures(shell)
const builtFor = document.querySelector<HTMLElement>('#built-for')
if (builtFor) mountBuiltForReveal(builtFor)
if (builtFor) void import('./builtForIcons').then(({ mountBuiltForIcons }) => mountBuiltForIcons(builtFor)).catch(() => { /* The cards keep their words. */ })
const ladder = document.querySelector<HTMLElement>('#ladder')
if (ladder) void import('./ladderScene').then(({ mountLadder }) => mountLadder(ladder)).catch(() => { /* The steps keep their words. */ })
const evidence = document.querySelector<HTMLElement>('#evidence-record')
if (evidence) void import('./evidenceStage').then(({ mountEvidenceStage }) => mountEvidenceStage(evidence)).catch(() => { /* The record shows as it is. */ })
const formats = document.querySelector<HTMLElement>('#what-you-get')
if (formats) mountFormats(formats)
for (const cloud of document.querySelectorAll<HTMLElement>('.glyph-cloud[data-seed]')) mountGlyphRipple(cloud)
trackPageView()
trackLinkClicks(document.body)

/** The hero's coastal road (heroArtwork.ts, the road scene) lit in its own glyphs by the home page's glyph layer: stars,
 * meteors, light through the clouds and up the cliff, the swell rolling in. Only with motion allowed and room beside
 * the demo window; it rests while the hero is off screen. Without it the painted artwork shows as it is. */
function mountHeroArt(): void {
  const hero = document.querySelector<HTMLElement>('.pd-art')
  const layer = hero?.querySelector<HTMLElement>('.hero-glyphs')
  if (!hero || !layer || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(min-width: 760px)').matches) return
  void import('../heroGlyphs').then(({ playHeroGlyphs }) => {
    const glyphs = playHeroGlyphs(layer, hero)
    glyphs.start()
    glyphs.enter()
    new IntersectionObserver(([entry]) => {
      hero.dispatchEvent(new CustomEvent('w2l:rest', { detail: { rest: !entry?.isIntersecting } }))
    }).observe(hero)
  }).catch(() => { /* The painted artwork stays as it is. */ })
}
