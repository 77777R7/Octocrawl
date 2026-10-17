import '../styles.css'
import './product.css'
import { trackLinkClicks, trackPageView } from '../analytics'
import { mountScrapeCode } from './scrapeCode'
import { mountScrapeFeatures } from './scrapeFeatures'
import { mountGlyphRipple } from '../glyphRipple'

// /scrape/: the hero's artwork brought to life in its own glyphs, its three recorded scrapes, the harder pages, the hash
// check and the code.
mountHeroArt()
const shell = document.querySelector<HTMLElement>('.product-page')
if (shell) mountScrapeFeatures(shell)
const code = document.querySelector<HTMLElement>('#call-it')
if (code) mountScrapeCode(code)
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
