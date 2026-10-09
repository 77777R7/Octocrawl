/**
 * ExtractTf: the trafilatura-style extraction cascade with a page-type router.
 *
 * Flow: cleanTree -> pruneTree -> routePage -> strategy -> output.
 * The router (route.ts) decides the strategy before the block cascade runs —
 * W2L's precision headroom is on non-article pages (products ~0.670, listings
 * ~0.71 vs articles 0.924 per research), so each page type gets its own
 * extraction path.
 *
 * The cascade is CSS-selector + manual filtering because no Node DOM ships
 * native XPath (bake-off confirmed for jsdom/linkedom/happy-dom).
 */

import type { Extractor, ExtractorOptions, ExtractorOutput, PageType, ProductFacts } from '@w2l/contracts'
import { detachAll, outerHtml, parse, textOf } from './dom.js'
import { cleanTree, pruneRecommendations, pruneTree, selectionBody } from './prune.js'
import { detectRenderSignals, hydrationShown, rawSignals } from './render.js'
import { namedBy } from './selectors.js'
import { classifyBlocks, type ClassifyOptions } from './classify.js'
import { selectMain } from './main.js'
import { collectDeclaredProductFacts, fillPriceFromText, markOptionGroups, selectProduct, settleOptionGroups } from './product.js'
import { pageSignalsFor, routePage, selectCardList, selectDetectedList, selectList, selectTable } from './route.js'
import { collectAmazonProductFacts, inferAmazonCurrency, isAmazonProductPage, selectAmazonProduct } from './amazon.js'
import { adapterFor } from './adapters.js'
import { documentBaseUrl } from './links.js'
import { collectLabelledValues } from './labels.js'
import { collectPageMetadata } from './metadata.js'

const DEFAULT_CLASSIFY: ClassifyOptions = {
  minTextLength: 25,
  maxLinkDensity: 0.2,
}

function pickTitle(doc: Document, main: Element | null): string | null {
  if (main) {
    const h1 = main.querySelector('h1')
    if (h1) {
      const t = textOf(h1).trim()
      if (t.length > 0) return t
    }
  }
  const docTitle = doc.querySelector('title')
  return docTitle ? textOf(docTitle).trim() : null
}

/** The confidence floor of a product region that shows its title heading and its price (confidenceOf). */
const BUY_BOX_CONFIDENCE = 0.45
/** The shortest text block that is a product's description rather than a store's one-line notice. */
const DESCRIPTION_MIN_CHARS = 150

/** Whether the region holds a title heading and shows the price. */
function showsBuyBox(main: Element, price: string): boolean {
  return main.querySelector('h1,h2') !== null && textOf(main).replace(/\s+/g, ' ').includes(price.replace(/\s+/g, ' ').trim())
}

function confidenceOf(
  blocksLen: number,
  main: Element | null,
  totalBlocks: number,
  mainLength: number,
  pageType: PageType,
  productShown: boolean,
  favorPrecision: boolean,
  favorRecall: boolean,
  product: ProductFacts | null,
): number {
  // Base: share of all text blocks inside main.
  let conf = totalBlocks > 0 ? blocksLen / totalBlocks : 0
  // Semantic container presence strengthens it.
  if (main && ['ARTICLE', 'MAIN'].includes(main.tagName)) conf = Math.min(1, conf + 0.15)
  // Size sanity: very little extracted text is suspicious.
  if (mainLength < 80) conf = Math.min(conf, 0.4)
  // Non-article pages carry structurally less prose; cap their confidence
  // lower than a clean article so the escalation tier knows the difference.
  if (pageType !== 'article') conf = Math.min(conf, 0.75)
  // A PDP that declared its own name AND price in machine-readable markup is
  // corroborating our routing with the publisher's own statement. That is
  // evidence about the page, independent of how much prose we recovered —
  // and a terse buy-box is the normal shape of a correct PDP extraction, not
  // a thin one. Raise a floor rather than the value, so a genuinely empty
  // region still can't be dressed up as a good one.
  if (
    product !== null &&
    main !== null &&
    product.name !== null &&
    product.price !== null &&
    product.name.source !== 'text' &&
    product.price.source !== 'text'
  ) {
    conf = Math.max(conf, 0.6)
  }
  // A page the router found a product page by its visible buy box, a title
  // heading and its price, with both in the region, is the same terse shape
  // read from what the page shows rather than what it declares: a lower
  // floor, still above the low-yield escalation's ceiling, so an answer the
  // browser cannot improve is not rendered again for its brevity. The
  // region must describe the product too, in a text block of description
  // length besides its headings (a delivery or returns line is not one): a
  // buy box whose description its scripts draw is what the browser can still
  // fill in. A page routed by its declarations (microdata cards) earns no
  // such floor.
  else if (productShown) {
    conf = Math.max(conf, BUY_BOX_CONFIDENCE)
  }
  if (favorPrecision) conf = Math.min(conf, 0.85)
  if (favorRecall) conf = Math.max(conf, 0.3)
  return Math.round(conf * 100) / 100
}

/**
 * Whether the region shows the product the page declares in its own markup
 * (JSON-LD or microdata): its name and its price are in the region's text.
 * Such a page carries its content in its HTML, however much script it has.
 */
function showsDeclaredProduct(main: Element | null, product: ProductFacts | null): boolean {
  if (main === null || product === null || product.name === null || product.price === null) return false
  if (product.name.source === 'text' || product.price.source === 'text') return false
  const text = textOf(main).replace(/\s+/g, ' ')
  const price = product.price.value.replace(/[^\d.,]/g, '')
  return text.includes(product.name.value.replace(/\s+/g, ' ').trim()) && price !== '' && text.includes(price)
}

export class ExtractTf implements Extractor {
  extract(html: string, options: ExtractorOptions = {}): ExtractorOutput {
    const { favorPrecision = false, favorRecall = false, pruneSelectors, includeSelectors, blockAds = true } = options
    const parseStart = performance.now()
    const doc = parse(html)
    const parseMs = Math.max(0, performance.now() - parseStart)
    const extractionStart = performance.now()

    // Semantic page-type signals must be collected BEFORE cleaning: they live
    // in <script type="application/ld+json">, <meta>, and itemprop attributes,
    // and cleanTree strips script/form/button. cleanTree also detaches
    // article.post elements whose only content is a <form> (quick-reply),
    // which would otherwise suppress forum routing.
    const signals = pageSignalsFor(doc.document)
    const preliminaryAdapter = adapterFor(doc.document, options.url)
    const baseUrl = documentBaseUrl(doc.document, options.url)
    // The page's own <title>, <meta> and <link> declarations, read before cleaning.
    const metadata = collectPageMetadata(doc.document, baseUrl)

    // Declared product facts share those carriers, so they are read from the
    // raw tree too. The visible-price fallback runs much later, after
    // recommendation pruning — see below.
    const declaredFacts = collectDeclaredProductFacts(doc.document)
    const amazonProduct = isAmazonProductPage(doc.document, options.url)
    const sourceFacts = amazonProduct
      ? collectAmazonProductFacts(doc.document, options.url, declaredFacts)
      : declaredFacts
    const amazonValidation = amazonProduct ? adapterFor(doc.document, options.url, sourceFacts).validation : null
    // Counted before cleaning, which may drop empty elements.
    const emptyTableShells = Array.from(doc.document.querySelectorAll('table')).filter((table) => table.querySelector('tr') === null).length
    // Data the page's scripts will fetch once they run: whatever they build
    // from it is not in this HTML either.
    const fetchPreloads = Array.from(doc.document.querySelectorAll('link[rel][as]')).filter((link) =>
      (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('preload') &&
      (link.getAttribute('as') ?? '').trim().toLowerCase() === 'fetch').length
    // Rendering signals live in scripts and fallback markup that cleaning
    // removes, so they are read from the raw tree as well; the visible text
    // they are weighed against is the cleaned page's (detectRenderSignals).
    const raw = rawSignals(doc.document)

    // The caller's exclusions (pruneSelectors) are matched here, against
    // the page as it was received: cleaning unwraps a form and removes a
    // navigation that a selector such as `form table.filters` leans on.
    // What is cleaned and pruned is decided on that page too, and the
    // excluded elements are removed after it, with everything inside them.
    const excluded = namedBy(doc.document, pruneSelectors ?? [])
    // A product's options shown as controls are kept aside before cleaning
    // removes the controls, and shown once the page is known to be a product's.
    const optionGroups = markOptionGroups(doc.document, excluded)
    cleanTree(doc.document, excluded)
    pruneTree(doc.document, { blockAds })
    detachAll(excluded)

    const decision = amazonProduct ? { type: 'product' as const, strategy: 'product' as const } : routePage(doc.document, signals)
    settleOptionGroups(optionGroups, decision.type === 'product')
    // Whether the page shows its hydration data's text is asked of the cleaned
    // page before its recommendations are cut, and only on a page whose buy
    // box the router found: the shell check reads the answer nowhere else.
    const dataShown = decision.buyBox === true && raw.hydrationJson.length > 0 && hydrationShown(raw, doc.document)

    // Recommendation carousels are cut only on product pages. On a listing
    // page the priced cards ARE the content, and pruning them would delete
    // the answer.
    if (decision.type === 'product') pruneRecommendations(doc.document)

    const classifyOptions: ClassifyOptions = { ...DEFAULT_CLASSIFY, favorPrecision }
    if (favorPrecision) classifyOptions.minTextLength = 60
    if (favorRecall) classifyOptions.minTextLength = 15

    // Strategy may fall back, and the output must report what actually ran.
    let strategy = decision.strategy
    let main: Element | null
    switch (strategy) {
      case 'list': {
        main = selectList(doc.document)
        const blocks = classifyBlocks(doc.document, classifyOptions)
        const articleMain = selectMain(doc.document, blocks)
        const listText = main ? textOf(main).replace(/\s+/g, ' ').trim().length : 0
        const articleText = articleMain ? textOf(articleMain).replace(/\s+/g, ' ').trim().length : 0
        // Breadcrumbs and leftover TOCs win selectList on documentation pages.
        // If the article cascade recovered a substantially larger region, use it.
        if (main === null || (articleMain !== null && listText < articleText * 0.5)) {
          strategy = 'article'
          main = articleMain
        }
        break
      }
      case 'table':
        main = selectTable(doc.document)
        break
      case 'product': {
        const blocks = classifyBlocks(doc.document, classifyOptions)
        main = (amazonProduct ? selectAmazonProduct(doc.document) : null) ?? selectProduct(doc.document, blocks)
        if (main === null) {
          // No defensible product region. The page is still a product page;
          // the article cascade is just what produced the HTML.
          strategy = 'article'
          main = selectMain(doc.document, blocks)
        }
        break
      }
      default: {
        const blocks = classifyBlocks(doc.document, classifyOptions)
        main = selectMain(doc.document, blocks)
      }
    }
    // A listing of cards has no text block for the cascade to find. Before
    // the page is reported empty, look for one.
    let lastResort = false
    if (main === null) {
      main = selectCardList(doc.document)
      if (main === null) {
        main = selectDetectedList(doc.document)
        lastResort = main !== null
      }
      if (main !== null) strategy = 'list'
    }

    let product: ProductFacts | null = null
    if (decision.type === 'product') {
      product = sourceFacts
      // Only now, on a tree with the neighbouring products removed, is the
      // deepest price-shaped element safe to read as THIS product's price.
      // Amazon's page often contains unit prices and neighbouring offer
      // fragments inside the subject container. The adapter must prefer an
      // honest null over attributing one of those generic price tokens to the
      // main ASIN.
      if (!amazonProduct) fillPriceFromText(product, doc.document)
      if (amazonProduct && product.price !== null && product.priceCurrency === null) product.priceCurrency = inferAmazonCurrency(options.url, product.price.value)
    }

    const blocks = classifyBlocks(doc.document, classifyOptions)
    const mainLength = main ? textOf(main).length : 0
    // A product page found by its visible buy box whose region shows the
    // title, the price and a description (a text block of description length
    // besides its headings): the confidence floor and the shell check read it.
    const productShown = decision.buyBox === true && main !== null && product !== null && product.price !== null &&
      showsBuyBox(main, product.price.value) &&
      blocks.some((b) => main.contains(b.el) && !/^h[1-6]$/.test(b.el.tagName.toLowerCase()) && b.length >= DESCRIPTION_MIN_CHARS)

    const adapter = amazonProduct ? adapterFor(doc.document, options.url, product) : preliminaryAdapter
    // A selection the caller made (includeSelectors) is returned whole: it
    // is read from the page as received, not from the tree cleaned above,
    // and what the caller named is the content, so it counts as identified
    // whatever the cascade made of the page. A selection that holds nothing
    // says no more about the page than the cascade did, and keeps the
    // cascade's confidence. The page itself still went through the cascade
    // for its type, title and main region, and `escalate` below stays what
    // the cascade found of the page.
    const selection = includeSelectors !== undefined && includeSelectors.length > 0 ? selectionBody(html, includeSelectors, pruneSelectors) : null
    const selected = selection !== null && !selection.blank
    const output: ExtractorOutput = {
      title: pickTitle(doc.document, main),
      mainHtml: selection !== null ? selection.html : main ? outerHtml(main) : '',
      baseUrl,
      metadata,
      confidence: selected ? 1 : confidenceOf(
        blocks.filter((b) => main?.contains(b.el)).length,
        main,
        blocks.length,
        mainLength,
        decision.type,
        productShown,
        favorPrecision,
        favorRecall,
        product,
      ),
      // Escalate when a strategy produced nothing at all, or a region that says
      // nothing beyond its headings and in-page jump links (headingsOnly).
      // Routing to a non-article strategy is not by itself an escalation reason.
      escalate: main === null || headingsOnly(main),
      ...(lastResort ? { lastResort: true } : {}),
      pageType: decision.type,
      strategy,
      product,
      adapter: adapter.descriptor,
      entities: adapter.entities,
      adapterValidation: amazonValidation ?? adapter.validation,
      emptyTableShells,
      fetchPreloads,
      render: detectRenderSignals(raw, doc.document, {
        productShown,
        hydrationShown: dataShown,
        contentShown: showsDeclaredProduct(main, product),
        listing: decision.type === 'listing' || decision.type === 'collection',
      }),
      labelledValues: main ? collectLabelledValues(main) : [],
      timings: { parseMs, extractMs: Math.max(0, performance.now() - extractionStart) },
    }

    doc.close()
    return output
  }
}

/** Default instance. */
export const extractTf = new ExtractTf()

/** Text a region needs beyond its headings and in-page jump links to be content. */
const MIN_PROSE_CHARS = 20

/**
 * Whether a region says nothing beyond its headings and its in-page jump links ("Skip to Filters"): fewer than
 * MIN_PROSE_CHARS characters of other text. Such a region names a page but is not its content, and the page escalates as
 * one with none found (ROADMAP PA item 4: a vendor page whose list had not loaded answered `success` with "Don't see the
 * Tesla you're looking for?"). The text of links to other pages counts; only in-page jump links are set aside.
 */
function headingsOnly(region: Element): boolean {
  const heading = (el: Element) => /^h[1-6]$/.test(el.tagName.toLowerCase())
  if (heading(region)) return true
  let prose = 0
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (prose >= MIN_PROSE_CHARS) return
      if (child.nodeType === 3) { prose += (child.textContent ?? '').replace(/\s+/g, ' ').trim().length; continue }
      if (child.nodeType !== 1) continue
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (heading(el) || tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript') continue
      if (tag === 'a' && (el.getAttribute('href') ?? '').startsWith('#')) continue
      walk(el)
    }
  }
  walk(region)
  return prose < MIN_PROSE_CHARS
}
