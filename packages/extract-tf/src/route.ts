/**
 * Page-type router. W2L's precision headroom is on non-article pages (the
 * published ceiling for products is ~0.670 and listings ~0.71 against 0.924
 * for articles — research/extraction_precision_deep_research.md), so the
 * router decides the strategy before the block cascade runs.
 *
 * Routing runs AFTER cleanTree/pruneTree, so boilerplate (nav, aside, footer)
 * never drives a listing/collection misroute. The semantic page-type signals
 * (JSON-LD, microdata, post markup) are collected BEFORE cleaning — they live
 * in <script type="application/ld+json">, <meta>, and itemprop attributes,
 * and cleanTree strips script/form/button, which would erase them.
 *
 * Page type and strategy are independent: a product page can use the table
 * strategy, but "one standalone table" by itself never proves "product".
 */

import type { PageType } from '@w2l/contracts'
import { classifyBlocks } from './classify.js'
import { detectLists } from './detectList.js'
import { commonAncestor, layoutTables, outerHtml, qsa, tagOf, textOf } from './dom.js'
import { hasRecommendationToken, isRecommendationHeading } from './prune.js'
import { visiblePrices } from './product.js'

interface RouterCounts {
  li: number
  a: number
  table: number
  tableInArticle: number
  article: number
  main: number
  p: number
  textChars: number
  /** Visible text inside tables (outermost tables only). */
  tableChars: number
  headings: number
  /** Links per 100 chars of visible text — div-based listings have high density. */
  linkDensity: number
  /** A visible buy box (see hasVisibleBuyBox). */
  buyBox: boolean
}

/**
 * A product page that declares nothing machine-readable (books.toscrape.com):
 * the page's one h1, then its one visible price in the h1's own section, with
 * no other heading between them and not inside a list item. A price under
 * another heading, or in a list item, belongs to a listed item, and several
 * prices make a listing.
 */
function hasVisibleBuyBox(doc: Document): boolean {
  const h1s = qsa(doc, 'h1')
  const prices = visiblePrices(doc)
  if (h1s.length === 0) return hasBuyBoxUnderH2(doc, prices)
  if (h1s.length !== 1 || prices.length !== 1 || prices[0]!.closest('li') !== null) return false
  let heading: Element | null = null
  for (const el of qsa(doc, '*')) {
    if (el === prices[0]) break
    if (/^h[1-6]$/.test(tagOf(el))) heading = el
  }
  return heading === h1s[0]
}

/**
 * A product page with no h1 (sandbox.oxylabs.io), titled by its one h2, not
 * a link, then the first visible price after it with no other heading
 * between. A few other prices may follow (related products), so that price
 * must be the title's alone and not a card's: the lowest element holding the
 * h2 and the price holds no other price, fewer than PRODUCT_CARDS prices
 * show elsewhere on the page, and the price is not in a list item nor inside
 * an element with two or more siblings of its tag that show a price too. A
 * deal, a price filter or a shipping banner over a listing's grid is none of
 * these.
 */
function hasBuyBoxUnderH2(doc: Document, prices: readonly Element[]): boolean {
  const h2s = qsa(doc, 'h2')
  if (h2s.length !== 1 || h2s[0]!.closest('a') !== null) return false
  const all = qsa(doc, '*')
  const priceSet = new Set(prices)
  let price: Element | null = null
  for (const el of all.slice(all.indexOf(h2s[0]!) + 1)) {
    if (/^h[1-6]$/.test(tagOf(el))) return false
    if (priceSet.has(el)) {
      price = el
      break
    }
  }
  if (price === null || price.closest('li') !== null) return false
  const block = commonAncestor(h2s[0]!, price)
  if (block === null || prices.some((other) => other !== price && block.contains(other))) return false
  if (prices.length - 1 >= PRODUCT_CARDS) return false
  for (let up = price.parentElement; up !== null && up !== doc.body; up = up.parentElement) {
    const siblings = Array.from(up.parentElement?.children ?? []).filter((sibling) => sibling !== up && tagOf(sibling) === tagOf(up) && prices.some((p) => sibling.contains(p)))
    if (siblings.length >= 2) return false
  }
  return true
}

/**
 * Whether the page's first h1 is followed by a price of its own: the first visible price after it sits in no element,
 * short of one that also holds the h1, that names one of the listed products. A product page that declares its related
 * products as an unnamed list shows its own price under its title; a category page's first price is a card's.
 */
function ownPriceAfterTitle(doc: Document, names: readonly string[]): boolean {
  const h1 = qsa(doc, 'h1')[0]
  if (h1 === undefined) return false
  const prices = new Set(visiblePrices(doc))
  const all = qsa(doc, '*')
  const first = all.slice(all.indexOf(h1) + 1).find((el) => prices.has(el))
  if (first === undefined) return false
  for (let up = first.parentElement; up !== null && !up.contains(h1); up = up.parentElement) {
    const text = textOf(up).replace(/\s+/g, ' ')
    if (names.some((name) => text.includes(name))) return false
  }
  return true
}

function countAll(doc: Document): RouterCounts {
  const textLength = (el: Element | null): number => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().length
  const textChars = textLength(doc.body)
  const a = qsa(doc, 'a').length
  return {
    buyBox: hasVisibleBuyBox(doc),
    li: qsa(doc, 'li').length,
    a,
    table: qsa(doc, 'table').length,
    tableInArticle: qsa(doc, 'article table').length,
    article: qsa(doc, 'article').length,
    main: qsa(doc, 'main').length,
    p: qsa(doc, 'p').length,
    headings: qsa(doc, 'h1,h2,h3').length,
    textChars,
    tableChars: qsa(doc, 'table')
      .filter((table) => table.parentElement?.closest('table') == null)
      .reduce((sum, table) => sum + textLength(table), 0),
    linkDensity: textChars > 0 ? (a / textChars) * 100 : 0,
  }
}

export interface RouteDecision {
  type: PageType
  /** Which strategy's result to use. */
  strategy: 'article' | 'list' | 'table' | 'product'
  /** Set when the page is a product page by its visible buy box (a title heading and its price) alone. */
  buyBox?: true
}

export interface PageSignals {
  /** Normalized JSON-LD @type names, collected by real JSON parsing. */
  jsonLdTypes: string[]
  /** itemprop tokens (split on HTML whitespace, lower-cased). */
  itempropTokens: string[]
  /** itemtype tokens (microdata scope declarations, lower-cased). */
  itemTypeTokens: string[]
  /** Count of <article class~="post"> elements. */
  postArticles: number
  /**
   * Whether the page's microdata Product scopes are cards of one listing: at
   * least PRODUCT_CARDS of them, the outermost ones all of one tag with at
   * least one class they all carry, none holding an h1, none inside an element
   * named for recommendations, and no recommendation heading before the first.
   */
  productCards: boolean
  /**
   * JSON-LD Products declared as items of an ItemList (a CollectionPage's
   * products). They are not counted in `jsonLdTypes`: a list of products is
   * not the page's own product.
   */
  listedProducts: number
  /** Normalized @type names of the JSON-LD's top-level nodes and @graph members: what the page declares itself. */
  pageTypes: string[]
  /**
   * The most Products one ItemList among those nodes lists as its own items, when the list is not named for
   * recommendations ("You may also like"): a page that declares itself a list of products (H&M's category pages).
   */
  ownListedProducts: number
  /** The names of that list's Products. */
  ownListedNames: string[]
}

/** The fewest alike Product scopes that are a listing's cards rather than one product. */
const PRODUCT_CARDS = 3

/** itemprop tokens that indicate a product/offer context. */
const PRICE_ITEMPROPS = ['price', 'offers', 'sku', 'gtin', 'mpn', 'brand'] as const

/** Split an HTML attribute on ASCII whitespace (like itemprop tokenization). */
function splitTokens(value: string): string[] {
  return value.split(/[\t\n\f\r ]+/).filter((t) => t.length > 0)
}

/**
 * Normalize a JSON-LD @type value to its short name: strip schema.org IRI
 * prefixes ("https://schema.org/Product", "schema:Product") to the last
 * path segment or fragment, lower-cased.
 */
function normalizeTypeName(raw: string): string {
  const trimmed = raw.trim()
  const last =
    /[#/]([^#/]+)$/.exec(trimmed)?.[1] ??
    /^([^:]+):(.+)$/.exec(trimmed)?.[2] ??
    trimmed
  return last.toLowerCase()
}

/** The normalized @type names of a parsed JSON-LD script's top-level nodes and @graph members. */
function collectPageTypes(root: unknown, out: string[]): void {
  for (const node of Array.isArray(root) ? root : [root]) {
    if (typeof node !== 'object' || node === null) continue
    const record = node as Record<string, unknown>
    const t = record['@type']
    for (const type of typeof t === 'string' ? [t] : Array.isArray(t) ? t : []) if (typeof type === 'string') out.push(normalizeTypeName(type))
    if (Array.isArray(record['@graph'])) collectPageTypes(record['@graph'], out)
  }
}

/**
 * The most Products that one ItemList among a parsed JSON-LD script's top-level nodes and @graph members lists as its
 * items (a ListItem's item, or the element itself), skipping a list named for recommendations.
 */
function ownListedProducts(root: unknown): string[] {
  let most: string[] = []
  for (const node of Array.isArray(root) ? root : [root]) {
    if (typeof node !== 'object' || node === null) continue
    const record = node as Record<string, unknown>
    if (Array.isArray(record['@graph'])) {
      const listed = ownListedProducts(record['@graph'])
      if (listed.length > most.length) most = listed
    }
    if (!typeNames(record).includes('itemlist')) continue
    if (typeof record['name'] === 'string' && isRecommendationHeading(record['name'])) continue
    const products: string[] = []
    for (const element of Array.isArray(record['itemListElement']) ? record['itemListElement'] : []) {
      if (typeof element !== 'object' || element === null) continue
      const item = (element as Record<string, unknown>)['item']
      const product = typeNames(element as Record<string, unknown>).includes('product')
        ? element as Record<string, unknown>
        : typeof item === 'object' && item !== null && typeNames(item as Record<string, unknown>).includes('product') ? item as Record<string, unknown> : null
      if (product !== null) products.push(typeof product['name'] === 'string' ? product['name'].replace(/\s+/g, ' ').trim() : '')
    }
    if (products.length > most.length) most = products
  }
  return most
}

/** A JSON-LD node's normalized @type names. */
function typeNames(node: Record<string, unknown>): string[] {
  const t = node['@type']
  return (typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((type): type is string => typeof type === 'string') : []).map(normalizeTypeName)
}

/**
 * Recursively walk parsed JSON-LD (objects, arrays, @graph) and collect
 * every normalized @type. A Product inside an ItemList is counted in
 * `listed.products` instead. Malformed JSON is caught by the caller.
 */
function collectJsonLdTypes(node: unknown, out: string[], listed: { products: number }, inList = false): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, out, listed, inList)
    return
  }
  if (typeof node !== 'object' || node === null) return
  const t = (node as Record<string, unknown>)['@type']
  const types = (typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((item): item is string => typeof item === 'string') : []).map(normalizeTypeName)
  for (const type of types) {
    if (inList && type === 'product') listed.products++
    else out.push(type)
  }
  const list = inList || types.includes('itemlist')
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === 'object' && value !== null) collectJsonLdTypes(value, out, listed, list)
  }
}

/**
 * Collect semantic signals BEFORE cleanTree/pruneTree removes their carriers.
 * JSON-LD is parsed with JSON.parse (never regex) and walked recursively;
 * malformed scripts are ignored without throwing. itemprop/itemtype
 * attributes are split into whitespace tokens for exact, case-insensitive
 * matching — no substring includes.
 */
function collectPageSignals(doc: Document): PageSignals {
  const jsonLdTypes: string[] = []
  const listed = { products: 0 }
  const pageTypes: string[] = []
  let ownListed: string[] = []
  for (const el of qsa(doc, 'script[type="application/ld+json"]')) {
    const text = (el.textContent ?? '').trim()
    if (text.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(text)
      collectJsonLdTypes(parsed, jsonLdTypes, listed)
      collectPageTypes(parsed, pageTypes)
      const own = ownListedProducts(parsed)
      if (own.length > ownListed.length) ownListed = own
    } catch {
      // Malformed JSON-LD is not a routing signal; ignore it.
    }
  }
  const itempropTokens: string[] = []
  for (const el of qsa(doc, '[itemprop]')) {
    itempropTokens.push(...splitTokens(el.getAttribute('itemprop') ?? '').map((t) => t.toLowerCase()))
  }
  const itemTypeTokens: string[] = []
  for (const el of qsa(doc, '[itemtype]')) {
    // itemtype values are IRIs (https://schema.org/Product) or bare tokens;
    // normalize to the last segment the same way JSON-LD @type names are.
    itemTypeTokens.push(
      ...splitTokens(el.getAttribute('itemtype') ?? '').map((t) => normalizeTypeName(t)),
    )
  }
  return {
    jsonLdTypes,
    itempropTokens,
    itemTypeTokens,
    postArticles: qsa(doc, 'article.post').length,
    productCards: productCards(doc),
    listedProducts: listed.products,
    pageTypes,
    ownListedProducts: ownListed.length,
    ownListedNames: ownListed.filter((name) => name.length > 0),
  }
}

/**
 * Whether the outermost microdata Product scopes are a listing's cards
 * (PageSignals.productCards). Cards a product page shows beside its own
 * product are its recommendations: under a heading or in an element that says
 * so, without a class to tell them from the page's own scope, or beside a
 * lone h1 with a price shown outside them.
 */
function productCards(doc: Document): boolean {
  const scopes = new Set(qsa(doc, '[itemtype]').filter((el) => splitTokens(el.getAttribute('itemtype') ?? '').some((t) => normalizeTypeName(t) === 'product')))
  const outer = [...scopes].filter((el) => {
    for (let up = el.parentElement; up !== null; up = up.parentElement) if (scopes.has(up)) return false
    return true
  })
  if (outer.length < PRODUCT_CARDS) return false
  // One template: one tag and the same classes. Siblings of one container
  // need only share a class, as a card's own classes may differ from its
  // neighbours' (WooCommerce marks each with its post id, its place in the
  // row, its stock and its categories); a product page's own scope is not a
  // sibling of the cards beside it.
  const classes = (el: Element): string[] => splitTokens(el.getAttribute('class') ?? '')
  const exact = new Set(outer.map((el) => `${tagOf(el)} ${classes(el).sort().join(' ')}`)).size === 1 && classes(outer[0]!).length > 0
  const siblings = outer.every((el) => el.parentElement === outer[0]!.parentElement) && new Set(outer.map(tagOf)).size === 1
  const shared = classes(outer[0]!).some((name) => outer.every((el) => classes(el).includes(name)))
  if (!(exact || (siblings && shared)) || outer.some((el) => el.querySelector('h1') !== null)) return false
  for (const card of outer) {
    for (let up = card.parentElement; up !== null; up = up.parentElement) {
      if (hasRecommendationToken(`${up.getAttribute('id') ?? ''} ${up.getAttribute('class') ?? ''}`)) return false
    }
  }
  const all = qsa(doc, '*')
  const first = all.indexOf(outer[0]!)
  if (all.some((el, at) => at < first && /^h[2-6]$/.test(tagOf(el)) && isRecommendationHeading(textOf(el)))) return false
  // A lone h1 with a price of its own outside the cards is a product page's buy box, whatever the cards show. A
  // price in the page's header or navigation is not one (a cart total).
  const h1s = qsa(doc, 'h1')
  return !(h1s.length === 1 && visiblePrices(doc).some((price) => price.closest('header, nav') === null && !outer.some((card) => card.contains(price))))
}

/** Exact, case-insensitive membership across all tokens. */
function hasToken(values: readonly string[], needle: string): boolean {
  return values.includes(needle)
}

/** How many tokens from `needles` appear in `values`. */
function countTokens(values: readonly string[], needles: readonly string[]): number {
  let count = 0
  for (const n of needles) if (values.includes(n)) count++
  return count
}

/**
 * Semantic product signals, strength-weighted:
 *  - STRONG: JSON-LD Product, microdata Product scope, itemprop "product"/"offer".
 *    One is enough.
 *  - WEAK: price/sku/gtin/mpn/brand-style itemprops. Needs >=2 independent ones.
 *  - OfferCatalog (JSON-LD or microdata) is a CATALOG, not a single product:
 *    routed to collection.
 * A bare spec table is never a product signal — it stays a collection.
 */
function hasProductSignals(s: PageSignals): boolean {
  const strong =
    hasToken(s.jsonLdTypes, 'product') ||
    hasToken(s.itemTypeTokens, 'product') ||
    hasToken(s.itempropTokens, 'product') ||
    hasToken(s.itempropTokens, 'offer')
  // Products a page lists in JSON-LD made it a product page before they were
  // counted apart; a page they do not make a listing (routeByCounts) stays one.
  if (strong || s.listedProducts > 0) return true
  return countTokens(s.itempropTokens, PRICE_ITEMPROPS) >= 2
}

/** Article and its common schema.org subtypes. */
const ARTICLE_TYPES = ['article', 'newsarticle', 'blogposting', 'report', 'scholarlyarticle', 'techarticle'] as const

/** The publisher declares the page an article: a price on it is not the page's product. */
function hasArticleSignals(s: PageSignals): boolean {
  return ARTICLE_TYPES.some((t) => hasToken(s.jsonLdTypes, t) || hasToken(s.itemTypeTokens, t))
}

function hasOfferCatalogSignals(s: PageSignals): boolean {
  return hasToken(s.jsonLdTypes, 'offercatalog') || hasToken(s.itemTypeTokens, 'offercatalog')
}

/**
 * Multiple posts, or DiscussionForumPosting. Plain JSON-LD Comment / a
 * comment section on an article does NOT make a forum.
 */
function hasForumSignals(s: PageSignals): boolean {
  if (s.postArticles >= 2) return true
  if (hasToken(s.jsonLdTypes, 'discussionforumposting')) return true
  return hasToken(s.jsonLdTypes, 'forum') || hasToken(s.itemTypeTokens, 'forum')
}

/** The fewest alike cards that make a page with little prose of its own a listing of them. */
const GRID_CARDS = 4
/** Elements a listing's card is laid out as: a paragraph that carries a link is prose, not a card. */
const CARD_TAGS: ReadonlySet<string> = new Set(['li', 'div', 'article', 'section'])
/** Letters and digits a card may show before its link (a badge such as "Sponsored" or "Best seller"). */
const CARD_LEAD_CHARS = 24
/** Blocks that are a list's or a table's items, not the page's prose. */
const STRUCTURAL_BLOCKS: ReadonlySet<string> = new Set(['li', 'td', 'th'])
/**
 * Words that name an article's comments or its references in an id or class
 * (`comment-list`, `commentlist`, `replies`, `references`, `reflist`,
 * `cite_note-3`, `footnotes`): such cards lead with a link (the author, the
 * cited source) and outweigh a short article's prose, yet they are not a
 * listing. A part of the name counts when it starts with one of them.
 */
const NOT_LISTING_NAMES = ['comment', 'reply', 'replies', 'reference', 'reflist', 'cite', 'citation', 'footnote', 'endnote'] as const

function namedNotListing(el: Element): boolean {
  const name = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  return name.split(/[\s_-]+/).some((part) => NOT_LISTING_NAMES.some((word) => part.startsWith(word)))
}

/**
 * Whether a card leads with a link to another page: its item's name, or its
 * picture. A section of prose whose heading links to itself (`#name`), or
 * whose links sit inside its sentences, does not.
 */
function leadsWithLink(card: Element): boolean {
  let lead = 0
  const walk = (node: Node): boolean | null => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        lead += ((child.textContent ?? '').match(/[\p{L}\p{N}]/gu) ?? []).length
        if (lead > CARD_LEAD_CHARS) return false
      } else if (child.nodeType === 1) {
        const el = child as Element
        const href = tagOf(el) === 'a' ? (el.getAttribute('href') ?? '').trim() : ''
        if (href !== '' && !href.startsWith('#')) return true
        const found = walk(el)
        if (found !== null) return found
      }
    }
    return null
  }
  return walk(card) === true
}

/**
 * The page's largest group of alike sibling cards (isCard, leading with a
 * link): one tag and class, each a CARD_TAGS element, neither they nor any
 * element around them named for comments or references.
 */
function largestCardGroup(doc: Document): Element[] {
  let best: Element[] = []
  // Whether an element or one around it is so named, settled once per element.
  const inNamed = new Map<Element, boolean>()
  const insideNamed = (el: Element): boolean => {
    const unsettled: Element[] = []
    let answer = false
    for (let up: Element | null = el; up !== null; up = up.parentElement) {
      const known = inNamed.get(up)
      if (known !== undefined) {
        answer = known
        break
      }
      unsettled.push(up)
    }
    for (const up of unsettled.reverse()) {
      answer ||= namedNotListing(up)
      inNamed.set(up, answer)
    }
    return answer
  }
  for (const el of qsa(doc, '*')) {
    if (el.children.length < GRID_CARDS || insideNamed(el)) continue
    const templates = new Map<string, Element[]>()
    for (const kid of Array.from(el.children)) {
      if (!CARD_TAGS.has(tagOf(kid)) || namedNotListing(kid) || !isCard(kid) || !leadsWithLink(kid)) continue
      const template = `${tagOf(kid)} ${kid.getAttribute('class') ?? ''}`
      const group = templates.get(template)
      if (group === undefined) templates.set(template, [kid])
      else group.push(kid)
    }
    for (const group of templates.values()) if (group.length > best.length) best = group
  }
  return best
}

/**
 * A grid of cards that is the page's content (a category page whose cards
 * are a name link, a price and a line of text, with no heading in them): at
 * least GRID_CARDS alike cards, holding at least twice the text of the
 * article cascade's prose blocks outside them. An article's grid of related
 * posts is outweighed by the article's own prose; list items and table cells
 * outside the cards (a sidebar of filters) are not prose.
 */
function hasCardGrid(doc: Document): boolean {
  const cards = largestCardGroup(doc)
  if (cards.length < GRID_CARDS) return false
  const collapsedLength = (el: Element) => textOf(el).replace(/\s+/g, ' ').trim().length
  const cardSet = new Set(cards)
  const blocks = classifyBlocks(doc)
  const blockSet = new Set(blocks.map((b) => b.el))
  let outside = 0
  for (const block of blocks) {
    let counted = true
    for (let up = block.el.parentElement; up !== null; up = up.parentElement) {
      // Inside a card, or inside a block already counted.
      if (cardSet.has(up) || blockSet.has(up)) {
        counted = false
        break
      }
    }
    if (counted && !cardSet.has(block.el) && !STRUCTURAL_BLOCKS.has(tagOf(block.el))) outside += block.length
  }
  const inside = cards.reduce((sum, card) => sum + collapsedLength(card), 0)
  return inside >= outside * 2
}

/** JSON-LD page types by which a publisher declares a page a collection of things. */
const COLLECTION_PAGE_TYPES = ['collectionpage', 'searchresultspage'] as const

function routeByCounts(c: RouterCounts, s: PageSignals, doc: Document): RouteDecision {
  let grid: boolean | undefined
  const cardGrid = (): boolean => (grid ??= hasCardGrid(doc))
  // Semantic product signals get the dedicated PDP strategy: a product page's
  // payload is a name/price/spec region, not the longest run of prose, and
  // scoring by text volume on a PDP reliably picks the recommendation grid.
  // The strategy reports null when no defensible product region exists, and
  // the extractor falls back to the article cascade — recording the strategy
  // that actually produced the output, not the one it hoped for.
  // Alike Product cards with no product declared in JSON-LD are a listing of
  // products (a category page), not one: the product strategy would cut them
  // as recommendations. So are products a page its publisher declares a
  // collection (a top-level CollectionPage or SearchResultsPage node; one the
  // page is only part of does not count) lists as an ItemList's items, and so
  // are the products of a top-level ItemList not named for recommendations
  // (H&M's category pages, which declare no CollectionPage), when no microdata
  // scope declares one product. A product page that lists only its related
  // products declares no such page, or names its list for them.
  const listedOnly = s.listedProducts >= PRODUCT_CARDS &&
    (COLLECTION_PAGE_TYPES.some((type) => hasToken(s.pageTypes, type)) || (s.ownListedProducts >= PRODUCT_CARDS && !ownPriceAfterTitle(doc, s.ownListedNames))) &&
    (s.productCards || !hasToken(s.itemTypeTokens, 'product'))
  if ((s.productCards || listedOnly) && !c.buyBox && !hasToken(s.jsonLdTypes, 'product')) {
    return { type: 'collection', strategy: 'article' }
  }
  if (hasProductSignals(s)) {
    return { type: 'product', strategy: 'product' }
  }

  // OfferCatalog is a collection of products, not one product.
  if (hasOfferCatalogSignals(s)) {
    return { type: 'collection', strategy: 'article' }
  }

  // Semantic forum signals (multiple posts, DiscussionForumPosting).
  // Still extracted by the article cascade.
  if (hasForumSignals(s)) return { type: 'forum', strategy: 'article' }

  // A visible buy box is a product page that declares nothing: the product
  // strategy anchors on the same heading and price. A page its publisher
  // declares an article (a price box under a news headline) is not one.
  if (c.buyBox && !hasArticleSignals(s)) return { type: 'product', strategy: 'product', buyBox: true }

  // Documentation / reference pages: breadcrumbs and in-page TOC look like
  // lists, but several prose paragraphs under <main> are the payload.
  // Paragraphs inside a grid of cards (a repository's description on each)
  // are the cards' text, not a document's: such a page goes on to the rules below.
  if (c.main >= 1 && c.p >= 3 && c.headings >= 2 && !cardGrid()) {
    return { type: 'article', strategy: 'article' }
  }

  // The table strategy keeps the tables and what lies between them, so it is
  // for pages whose text is in their tables. A page whose text lies mostly
  // outside them (an SEC filing's paragraphs and notes around its statements)
  // goes on to the rules below.
  const textInTables = c.tableChars >= c.textChars * 0.5

  // A page whose only structure is one standalone table (readings, schedules,
  // dashboards). Tables inside <article> stay on the article cascade.
  if (c.tableInArticle === 0 && c.table === 1 && c.li < 10 && c.a < 20 && c.headings <= 2 && textInTables) {
    return { type: 'collection', strategy: 'table' }
  }

  // Several tables with little prose: a comparison/dashboard page.
  if (c.tableInArticle === 0 && c.table >= 2 && c.li < 15 && textInTables) {
    return { type: 'collection', strategy: 'table' }
  }

  // Link farm: most content is a list of links. Prose paragraphs mean this
  // is not a listing even when leftover nav lists survive pruning.
  if (c.li >= 6 && c.a >= 6 && c.textChars < 2000 && c.p < 3) {
    return { type: 'listing', strategy: 'list' }
  }

  // Div-based listing: no <li> structure, but a high link density means the
  // page IS its links (quotes.toscrape.com: 55 links/1702 chars = 3.2/100;
  // Wikipedia prose: ~1/100). The list strategy falls back to picking the
  // densest link container when no ul/ol qualifies.
  if (c.a >= 15 && c.linkDensity >= 2 && c.table === 0 && c.article === 0 && c.p < 3) {
    return { type: 'listing', strategy: 'list' }
  }

  // Small collection page: some linked sections, not a dominant list.
  if (c.li >= 4 && c.a >= 4 && c.textChars < 2000) {
    return { type: 'collection', strategy: 'article' }
  }

  // Long multi-heading pages with many sections and links are collections.
  if (c.textChars > 3000 && c.headings >= 5 && c.a >= 20) {
    return { type: 'collection', strategy: 'article' }
  }

  // A grid of cards with no heading in them, too much text for the link-farm
  // rules: a category page, not an article. The article cascade still
  // extracts it, as it did.
  if (cardGrid()) return { type: 'collection', strategy: 'article' }

  // Everything else runs the article cascade; when it finds no blocks the
  // result escalates (empty shell, genuinely empty page).
  return { type: 'article', strategy: 'article' }
}

/**
 * Collect pre-clean semantic signals for the page being routed. Extract
 * calls this once on the raw document, before cleanTree/pruneTree, so
 * script/meta-carried signals survive to routePage.
 */
export function pageSignalsFor(doc: Document): PageSignals {
  return collectPageSignals(doc)
}

/**
 * Route the page to a page type + strategy. `signals` are the pre-clean
 * semantic signals; when omitted they are collected from the current tree
 * (so direct routePage callers keep working on already-cleaned documents).
 */
export function routePage(doc: Document, signals: PageSignals = collectPageSignals(doc)): RouteDecision {
  return routeByCounts(countAll(doc), signals, doc)
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/** The article cascade: blocks -> semantic/container scoring (unchanged). */
export { selectMain } from './main.js'

/**
 * Listing strategy: the ordered/unordered list whose items share a common
 * link-plus-text shape. Returns the list element, or null.
 */
export function selectList(doc: Document): Element | null {
  let best: Element | null = null
  let bestItems = 0
  for (const el of qsa(doc, 'ul,ol')) {
    const items = qsa(el, ':scope > li')
    const linked = items.filter((li) => qsa(li, 'a').length > 0).length
    if (linked >= 3 && linked >= items.length * 0.6 && linked > bestItems) {
      bestItems = linked
      best = el
    }
  }
  if (best) return best

  // Div-based listings: no list markup, but the page's content is a set of
  // link-carrying sibling cards. Pick the container with the most linked
  // children, preferring the DEEPEST qualifying one so the whole page
  // wrapper doesn't win by aggregate link count.
  let bestDiv: Element | null = null
  let bestDivDepth = -1
  let bestDivLinks = 0
  for (const el of qsa(doc, 'div,section')) {
    const kids = Array.from(el.children)
    const linkedKids = kids.filter((k) => qsa(k, 'a').length > 0).length
    if (linkedKids < 3) continue
    let depth = 0
    for (let p = el.parentElement; p; p = p.parentElement) depth++
    if (linkedKids > bestDivLinks || (linkedKids === bestDivLinks && depth > bestDivDepth)) {
      bestDivLinks = linkedKids
      bestDivDepth = depth
      bestDiv = el
    }
  }
  return bestDiv
}

/** Text of a node outside any link. */
function textOutsideLinks(node: Node): string {
  let text = ''
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) text += child.textContent ?? ''
    else if (child.nodeType === 1 && (child as Element).tagName.toLowerCase() !== 'a') text += ` ${textOutsideLinks(child)}`
  }
  return text
}

/**
 * A listing card: an item carrying a link and text of its own besides the
 * link (a price, a date, a description), or a link that holds the item's
 * name as a heading (WooCommerce puts a product's picture, name and price all
 * inside one link). A menu or breadcrumb item is only its link and never
 * qualifies.
 */
function isCard(item: Element): boolean {
  const links = qsa(item, 'a[href]')
  if (links.length === 0) return false
  if ((textOutsideLinks(item).match(/[\p{L}\p{N}]/gu) ?? []).length >= 3) return true
  return links.some((link) => qsa(link, 'h2,h3,h4,h5,h6').some((heading) => /[\p{L}\p{N}]/u.test(textOf(heading))))
}

/**
 * The most sibling cards of one template: one tag, and either no class on
 * any of them or at least one class they all carry (a WooCommerce card also
 * carries its own post id, place in the row, stock and categories). When the
 * cards of one tag share no class, those with the very same classes.
 */
function alikeCards(cards: readonly Element[]): number {
  const byTag = new Map<string, Element[]>()
  for (const card of cards) {
    const group = byTag.get(tagOf(card))
    if (group === undefined) byTag.set(tagOf(card), [card])
    else group.push(card)
  }
  let most = 0
  for (const group of byTag.values()) {
    const classes = group.map((card) => new Set(splitTokens(card.getAttribute('class') ?? '')))
    const classless = classes.every((set) => set.size === 0)
    const shared = [...classes[0]!].some((name) => classes.every((set) => set.has(name)))
    if (classless || shared) {
      most = Math.max(most, group.length)
      continue
    }
    const exact = new Map<string, number>()
    for (const set of classes) {
      const key = [...set].sort().join(' ')
      exact.set(key, (exact.get(key) ?? 0) + 1)
    }
    most = Math.max(most, ...exact.values())
  }
  return most
}

/**
 * Last resort when no strategy found a region: a listing of cards, which the
 * article cascade cannot see. Each card's text is mostly its title link, and
 * the rest (a price, a date, a short description) is too short to be prose,
 * so a sparse listing yields no text block at all. A listing here is at
 * least three sibling cards of one template (same tag and class) after the
 * page's lone h1 and outside any header. The region widens to the container
 * the cards share with the h1, so the heading and its introduction stay.
 * Null otherwise: a page whose only structure is navigation, or an
 * application shell, still has no content and escalates.
 */
export function selectCardList(doc: Document): Element | null {
  const h1s = qsa(doc, 'h1')
  if (h1s.length !== 1) return null
  const h1 = h1s[0]!
  // Document order by index: linkedom's compareDocumentPosition is unreliable
  // across subtrees.
  const all = qsa(doc, '*')
  const h1At = all.indexOf(h1)
  let best: Element | null = null
  let bestCards = 0
  for (const [at, el] of all.entries()) {
    if (at <= h1At || el.children.length < 3 || h1.contains(el) || !['ul', 'ol', 'div', 'section'].includes(tagOf(el))) continue
    if (el.closest('header') !== null) continue
    const cards = alikeCards(Array.from(el.children).filter(isCard))
    if (cards >= 3 && cards > bestCards) {
      bestCards = cards
      best = el
    }
  }
  if (best === null) return null
  const shared = commonAncestor(best, h1)
  return shared !== null && shared !== doc.body && shared !== doc.documentElement ? shared : best
}

/** A detected list is the page's content when at least this many of its items each hold DETECTED_ITEM_CHARS characters of text, all different. */
const DETECTED_LIST_ITEMS = 3
const DETECTED_ITEM_CHARS = 40

/**
 * Last resort after selectCardList: the list the `list` format finds on the
 * page (detectLists), read on the page as cleaned. Items that carry no link
 * (quotes and their authors), or cards on a page with more than one h1, are
 * no listing of cards to selectCardList, yet a list of such items is the
 * page's content. It counts when at least DETECTED_LIST_ITEMS of its items
 * hold DETECTED_ITEM_CHARS characters of text each, all different: rows of
 * placeholders saying one thing are not content. The region is the lowest
 * element holding every item, widened to the container it shares with the
 * last h1 before them when that is below <body>, so the page's own heading
 * stays. Null otherwise: the page still has no content and escalates.
 */
export function selectDetectedList(doc: Document): Element | null {
  const root = doc.documentElement
  if (root === null) return null
  const [list] = detectLists(outerHtml(root), 1)
  if (list === undefined) return null
  // The detection read a copy of this page: its selector names the same items here.
  const items = qsa(doc, list.itemSelector)
  if (items.length < 2) return null
  const texts = items.map((item) => textOf(item).replace(/\s+/g, ' ').trim()).filter((text) => text.length >= DETECTED_ITEM_CHARS)
  if (new Set(texts).size < DETECTED_LIST_ITEMS) return null
  let region = commonAncestor(items[0]!, items[1]!)
  for (const item of items.slice(2)) if (region !== null && !region.contains(item)) region = commonAncestor(region, item)
  if (region === null) return null
  const all = qsa(doc, '*')
  const first = all.indexOf(items[0]!)
  const h1 = all.filter((el, at) => at < first && tagOf(el) === 'h1').pop()
  if (h1 !== undefined && !region.contains(h1)) {
    const shared = commonAncestor(region, h1)
    if (shared !== null && shared !== doc.body && shared !== doc.documentElement) region = shared
  }
  return region
}

/**
 * Table strategy: the region that holds a table page's data tables. A data
 * table has at least two rows, four cells and some text: single-cell, empty
 * and spacer tables are not data. A table whose nested tables hold most of its
 * text is a layout table (Hacker News lays out its header, story list and
 * footer in one): the data tables inside it are the page's, and it is chosen
 * only when no other data table exists, then the largest. The region is the
 * lowest element that holds the largest data table and every other one that
 * is not a menu laid out as a table (mostly link text, and no figure outside
 * its links; a table of links with figures is data), so the headings,
 * captions and text between them stay and a page's own header, footer and
 * side column, outside that element, do not; one data table is its own
 * region, and a table nested in a data table's cell is part of that table.
 * When a lone page heading shares a container with the region below <body>
 * (product pages: title + specs), that container is returned instead so the
 * title survives.
 */
export function selectTable(doc: Document): Element | null {
  const tables = qsa(doc, 'table')
  if (tables.length === 0) return null
  const counts = elementCounts(doc)
  const of = (el: Element): ElementCounts => counts.get(el)!
  // A table's text is not all white space when what is left of it without white space is not empty.
  const dataTables = tables.filter((t) => of(t).rows >= 2 && of(t).cells >= 4 && of(t).text > 0)
  if (dataTables.length === 0) return null
  const layoutTable = layoutTables()
  const unlaid = dataTables.filter((t) => !layoutTable(t))
  // The first of the tables with the most cells.
  const largest = (unlaid.length > 0 ? unlaid : dataTables).reduce((best, t) => (of(t).cells > of(best).cells ? t : best))
  const menu = (t: Element): boolean => of(t).linkText * 2 >= of(t).text && !of(t).digitOutsideLinks
  // Whether `a` is `b` or holds it.
  const holds = (a: Element, b: Element): boolean => of(a).start <= of(b).start && of(b).start < of(a).end
  // The unlaid tables around the one looked at, outermost first: tables come in document order, so one that does not hold it holds none after it.
  const around: Element[] = []
  let region = largest
  // The root element the region stays under: a page may have several (linkedom's parser leaves what follows </html> beside it), and one under another has no element in common with the region.
  let root = largest
  while (root.parentElement !== null) root = root.parentElement
  for (const t of unlaid) {
    while (around.length > 0 && !holds(around[around.length - 1]!, t)) around.pop()
    const nested = around.length > 0
    around.push(t)
    if (t === largest || menu(t) || nested) continue
    // commonAncestor(t, region): the lowest element above t that is the region or holds it.
    // The region only widens, so it moves up the page's depth once in all.
    const parent = t.parentElement
    if (parent === null || !holds(root, parent)) continue
    let shared: Element | null = region
    while (shared !== null && !holds(shared, parent)) shared = shared.parentElement
    region = shared ?? region
  }
  if (region === doc.documentElement && doc.body) region = doc.body

  const h1s = qsa(doc, 'h1')
  if (h1s.length === 1 && !region.contains(h1s[0]!)) {
    const lca = commonAncestor(region, h1s[0]!)
    if (lca && lca !== doc.body && lca !== doc.documentElement) return lca
  }
  return region
}

interface ElementCounts {
  /** Its `<tr>`s, its `<td>`s and `<th>`s, and the text of its links (each `<a>`'s text, white space left out), as querySelectorAll finds them: not in a `<template>`. */
  rows: number
  cells: number
  linkText: number
  /** Characters of its text (its textContent), white space left out. */
  text: number
  /** A digit in its text outside its links (textOutsideLinks). */
  digitOutsideLinks: boolean
  /** Its place in document order, and that of the first element after all it holds. */
  start: number
  end: number
}

/**
 * What selectTable reads of each element of the page, measured in one walk,
 * children before parents and without recursion, so a page whose tables are
 * nested or sit thousands of elements deep costs its size, not its size times
 * the number of its tables.
 */
function elementCounts(doc: Document): Map<Element, ElementCounts> {
  const counts = new Map<Element, ElementCounts>()
  let order = 0
  const starts = new Map<Element, number>()
  const next: [Element, boolean][] = Array.from(doc.children, (el): [Element, boolean] => [el, false]).reverse()
  while (next.length > 0) {
    const [el, open] = next.pop()!
    if (!open) {
      starts.set(el, order++)
      next.push([el, true])
      const children = Array.from(el.children)
      for (let i = children.length - 1; i >= 0; i--) next.push([children[i]!, false])
      continue
    }
    const own: ElementCounts = { rows: 0, cells: 0, linkText: 0, text: 0, digitOutsideLinks: false, start: starts.get(el)!, end: order }
    for (const node of Array.from(el.childNodes)) {
      // textContent is the text of the Text and CDATA nodes under an element; textOutsideLinks reads only the Text nodes.
      if (node.nodeType === 3 || node.nodeType === 4) {
        const text = node.textContent ?? ''
        own.text += text.replace(/\s+/g, '').length
        if (node.nodeType === 3 && /\d/.test(text)) own.digitOutsideLinks = true
      }
      if (node.nodeType !== 1) continue
      const child = counts.get(node as Element)!
      const name = (node as Element).localName
      own.text += child.text
      if (name !== 'a' && child.digitOutsideLinks) own.digitOutsideLinks = true
      if (name === 'template') continue
      own.rows += child.rows + (name === 'tr' ? 1 : 0)
      own.cells += child.cells + (name === 'td' || name === 'th' ? 1 : 0)
      own.linkText += child.linkText + (name === 'a' ? child.text : 0)
    }
    counts.set(el, own)
  }
  return counts
}

/**
 * Minimal extraction for pages with no recognizable shape: the page heading.
 * Used by callers that want a graceful small result; the extractor itself
 * falls back to the article cascade instead (a page whose only content is a
 * heading should escalate, not be reported as content).
 */
export function selectMinimal(doc: Document): Element | null {
  return doc.querySelector('h1') ?? doc.querySelector('h2,h3')
}
