import '../styles.css'
import './product.css'
import { trackLinkClicks, trackPageView } from '../analytics'
import { mountHeroField } from './heroField'
import { mountScrapeCode } from './scrapeCode'
import { mountScrapeFeatures } from './scrapeFeatures'
import { mountScrapePipeline } from './scrapePipeline'
import { RUN } from './scrapeRun'
import { follow } from './scrapeState'
import { mountGlyphRipple } from '../glyphRipple'
import { mountScrapeStage } from './scrapeStage'

// /scrape/: the hero's ground, its recorded scrape, How it works, the cards, the code and the calculator.
const field = document.querySelector<HTMLCanvasElement>('.pd-hero-field')
if (field) mountHeroField(field)
const stage = document.querySelector<HTMLElement>('#pd-stage')
if (stage) mountScrapeStage(stage)
const pipeline = document.querySelector<HTMLElement>('.pl-section')
if (pipeline) mountScrapePipeline(pipeline)
const shell = document.querySelector<HTMLElement>('.product-page')
if (shell) mountScrapeFeatures(shell)
const code = document.querySelector<HTMLElement>('#call-it')
if (code) mountScrapeCode(code, RUN.url, follow)
for (const cloud of document.querySelectorAll<HTMLElement>('.glyph-cloud[data-seed]')) mountGlyphRipple(cloud)
trackPageView()
trackLinkClicks(document.body)
