import '../styles.css'
import './product.css'
import { trackLinkClicks, trackPageView } from '../analytics'
import { mountHeroField } from './heroField'
import { mountScrapeCode } from './scrapeCode'
import { mountScrapeFeatures } from './scrapeFeatures'
import { mountGlyphRipple } from '../glyphRipple'

// /scrape/: the hero's ground, its three recorded scrapes, the harder pages, the hash check and the code.
const field = document.querySelector<HTMLCanvasElement>('.pd-hero-field')
if (field) mountHeroField(field)
const shell = document.querySelector<HTMLElement>('.product-page')
if (shell) mountScrapeFeatures(shell)
const code = document.querySelector<HTMLElement>('#call-it')
if (code) mountScrapeCode(code)
for (const cloud of document.querySelectorAll<HTMLElement>('.glyph-cloud[data-seed]')) mountGlyphRipple(cloud)
trackPageView()
trackLinkClicks(document.body)
