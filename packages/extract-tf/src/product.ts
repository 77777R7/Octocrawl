/**
 * Product-detail-page (PDP) extraction.
 *
 * Two jobs the article cascade cannot do:
 *
 *  1. FACTS. A PDP's payload is not prose — it is a name, a price, a currency,
 *     a SKU, availability. The cascade emits mainHtml and leaves a consumer to
 *     re-read the price out of rendered text. This module reads it once, from
 *     the strongest evidence the page offers, and records WHICH evidence that
 *     was (`ProductFactSource`). A price lifted from a JSON-LD `offers` block
 *     is the publisher's own machine-readable claim; a price matched out of a
 *     `<span class="a-price">` is our reading of their layout. Those are not
 *     the same claim and are not reported as the same claim.
 *
 *  2. REGION. On a real PDP the title, the price, and the description sit in
 *     one region, and the rest of the page is other products. Scoring by text
 *     volume (main.ts) reliably picks the recommendation grid, because on a
 *     PDP the recommendations ARE the bulk of the text.
 *
 * Nothing here is keyed to one retailer's class names. The strong path is
 * schema.org (JSON-LD / microdata / OpenGraph product meta), which is what
 * every large storefront actually publishes; the weak path is a bounded
 * price-shape match inside elements whose id/class carries a `price` token,
 * which covers Amazon's `a-price`, Shopify's `price`, and WooCommerce's
 * `woocommerce-Price-amount` without naming any of them.
 */

import type { ProductFact, ProductFactSource, ProductFacts } from '@w2l/contracts'
import { commonAncestor, qsa, tagOf, textOf } from './dom.js'
import type { TextBlock } from './classify.js'

/**
 * A currency-shaped run of text. Bounded on every quantifier: this runs over
 * attacker-supplied page text, and an unbounded alternation here is the same
 * class of bug as the robots matcher's.
 */
const CURRENCY_SYMBOLS = '[$£€¥₹₽₩฿]'
const CURRENCY_CODES = '(?:USD|EUR|GBP|JPY|CNY|RMB|AUD|CAD|CHF|HKD|SGD|INR|KRW|BRL|MXN|SEK|NOK|DKK|PLN|TRY|ZAR)'
/**
 * Thousands grouped by a space of any width or an apostrophe (`1 299,00`,
 * `1'299.00`) are one amount, starting where a number starts; otherwise
 * digits with `.` / `,` separators. A text this matches contains a match of
 * the second form alone, so what counts as price-shaped is unchanged: only the
 * run read as the price grows from its last group to the whole amount.
 */
const AMOUNT = "(?:(?<![\\d.,'’])\\d{1,3}(?:[\\s'’]\\d{3}){1,4}(?:[.,]\\d{1,3})?|\\d{1,12}(?:[.,]\\d{1,3}){0,4})"
const PRICE_RE = new RegExp(
  `(?:${CURRENCY_SYMBOLS}|${CURRENCY_CODES})\\s{0,3}${AMOUNT}|${AMOUNT}\\s{0,3}(?:${CURRENCY_SYMBOLS}|${CURRENCY_CODES})`,
  'u',
)

/** Does this text carry a price-shaped run? Exported for the prune pass. */
export function looksLikePrice(text: string): boolean {
  return PRICE_RE.test(text)
}

/** id/class token that marks a price container across storefront conventions. */
function hasPriceToken(el: Element): boolean {
  const attr = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`.toLowerCase()
  return attr.split(/[\s_-]+/).includes('price')
}

// ---------------------------------------------------------------------------
// Fact collection
// ---------------------------------------------------------------------------

function fact(value: string | null | undefined, source: ProductFactSource, path?: string): ProductFact | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length > 0 ? { value: trimmed, source, ...(path === undefined ? {} : { path }) } : null
}

/** Empty facts: we looked at a product page and every field came back unstated. */
function emptyFacts(): ProductFacts {
  return { name: null, price: null, priceCurrency: null, sku: null, brand: null, availability: null }
}

/**
 * Fill only the fields still null. Callers run strongest source first, so a
 * JSON-LD price is never overwritten by a text-scraped one.
 */
function fillMissing(into: ProductFacts, from: Partial<ProductFacts>): void {
  for (const key of ['name', 'price', 'priceCurrency', 'sku', 'brand', 'availability'] as const) {
    if (into[key] === null && from[key]) into[key] = from[key]!
  }
}

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return null
}

/**
 * schema.org allows a scalar, an object with a `name`, or an array of either
 * almost anywhere (`brand`, `availability`). Reduce to the first scalar we can
 * defend; never join an array into a synthetic string.
 */
function scalarOf(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = scalarOf(item)
      if (s !== null) return s
    }
    return null
  }
  if (typeof v === 'object' && v !== null) {
    const rec = v as Record<string, unknown>
    return asString(rec['name']) ?? asString(rec['@id']) ?? asString(rec['value'])
  }
  return asString(v)
}

/** Strip a schema.org enumeration IRI to its short name (…/InStock -> InStock). */
function shortEnum(v: string | null): string | null {
  if (v === null) return null
  return /[#/]([^#/]+)$/.exec(v.trim())?.[1] ?? v
}

/** Depth-first search of parsed JSON-LD for the first node typed Product. */
function findProductNode(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item)
      if (found) return found
    }
    return null
  }
  if (typeof node !== 'object' || node === null) return null
  const rec = node as Record<string, unknown>
  const t = rec['@type']
  const types = (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string')
  // Product and its schema.org subtypes (IndividualProduct, ProductModel,
  // SomeProducts) all describe one product; a ProductGroup does not.
  if (types.some((x) => /(^|[#/:])(individual)?product(model)?$|someproducts$/i.test(x.trim()))) {
    return rec
  }
  for (const value of Object.values(rec)) {
    if (typeof value === 'object' && value !== null) {
      const found = findProductNode(value)
      if (found) return found
    }
  }
  return null
}

/** The first Offer-ish object under a Product node's `offers`. */
function firstOffer(product: Record<string, unknown>): Record<string, unknown> | null {
  const offers = product['offers']
  const list = Array.isArray(offers) ? offers : [offers]
  for (const o of list) {
    if (typeof o === 'object' && o !== null) return o as Record<string, unknown>
  }
  return null
}

function factsFromJsonLd(doc: Document): Partial<ProductFacts> {
  for (const el of qsa(doc, 'script[type="application/ld+json"]')) {
    const text = (el.textContent ?? '').trim()
    if (text.length === 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      continue // Malformed JSON-LD is not evidence.
    }
    const product = findProductNode(parsed)
    if (!product) continue
    const offer = firstOffer(product)
    return {
      name: fact(scalarOf(product['name']), 'jsonld'),
      price: fact(offer ? asString(offer['price']) : null, 'jsonld'),
      priceCurrency: fact(offer ? asString(offer['priceCurrency']) : null, 'jsonld'),
      sku: fact(asString(product['sku']) ?? asString(product['mpn']), 'jsonld'),
      brand: fact(scalarOf(product['brand']), 'jsonld'),
      availability: fact(offer ? shortEnum(scalarOf(offer['availability'])) : null, 'jsonld'),
    }
  }
  return {}
}

/**
 * The value a microdata element asserts: `content`/`href`/`src` when the
 * element carries one (schema.org's escape hatch for machine values), else its
 * text. Reading the text of a `<meta itemprop="price" content="84.00">` would
 * yield the empty string.
 */
function microdataValue(el: Element): string | null {
  const tag = tagOf(el)
  const content = el.getAttribute('content')
  if (content !== null) return content
  if (tag === 'a' || tag === 'link') return el.getAttribute('href')
  if (tag === 'img') return el.getAttribute('src')
  if (tag === 'time') return el.getAttribute('datetime') ?? textOf(el)
  return textOf(el)
}

/** The element scoping a microdata Product, if the page declares one. */
export function microdataProductScope(doc: Document): Element | null {
  for (const el of qsa(doc, '[itemscope][itemtype]')) {
    const raw = el.getAttribute('itemtype') ?? ''
    for (const token of raw.split(/[\t\n\f\r ]+/)) {
      const short = (/[#/]([^#/]+)$/.exec(token.trim())?.[1] ?? token.trim()).toLowerCase()
      if (short === 'product') return el
    }
  }
  return null
}

function factsFromMicrodata(doc: Document): Partial<ProductFacts> {
  const scope = microdataProductScope(doc)
  if (!scope) return {}
  const pick = (prop: string): string | null => {
    for (const el of qsa(scope, `[itemprop~="${prop}"]`)) {
      const v = microdataValue(el)
      if (v !== null && v.trim().length > 0) return v
    }
    return null
  }
  return {
    name: fact(pick('name'), 'microdata'),
    price: fact(pick('price'), 'microdata'),
    priceCurrency: fact(pick('priceCurrency'), 'microdata'),
    sku: fact(pick('sku') ?? pick('mpn'), 'microdata'),
    brand: fact(pick('brand'), 'microdata'),
    availability: fact(shortEnum(pick('availability')), 'microdata'),
  }
}

/** OpenGraph / Facebook product meta tags, the third machine-readable path. */
function factsFromMeta(doc: Document): Partial<ProductFacts> {
  const meta = (names: readonly string[]): string | null => {
    for (const name of names) {
      for (const el of qsa(doc, `meta[property="${name}"],meta[name="${name}"]`)) {
        const v = el.getAttribute('content')
        if (v !== null && v.trim().length > 0) return v
      }
    }
    return null
  }
  return {
    name: fact(meta(['og:title', 'product:title']), 'meta'),
    price: fact(meta(['product:price:amount', 'og:price:amount']), 'meta'),
    priceCurrency: fact(meta(['product:price:currency', 'og:price:currency']), 'meta'),
    sku: fact(meta(['product:retailer_item_id', 'product:sku']), 'meta'),
    brand: fact(meta(['product:brand', 'og:brand']), 'meta'),
    availability: fact(shortEnum(meta(['product:availability', 'og:availability'])), 'meta'),
  }
}

/** An element carrying a `price` id/class token and a short, price-shaped text. */
function isPriceElement(el: Element): boolean {
  if (!hasPriceToken(el)) return false
  const text = textOf(el).trim()
  return text.length > 0 && text.length <= 60 && looksLikePrice(text)
}

/**
 * The prices a page shows: price elements that are not inside another one,
 * so a box holding a "now" and a "was" amount counts once.
 */
export function visiblePrices(scope: ParentNode): Element[] {
  const prices = qsa(scope, '[id],[class]').filter(isPriceElement)
  return prices.filter((el) => !prices.some((other) => other !== el && other.contains(el)))
}

/** A selector naming an element by its tag and id, or its tag and classes. */
function selectorOf(el: Element): string {
  const ident = (s: string) => s.replace(/[^\w-]/g, (ch) => `\\${ch}`)
  const id = el.getAttribute('id')
  if (id) return `${tagOf(el)}#${ident(id)}`
  return tagOf(el) + (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).map((c) => `.${ident(c)}`).join('')
}

/**
 * The visible price element: the deepest element carrying a `price` id/class
 * token whose own text is price-shaped. Deepest wins so a wrapper reporting
 * "list price / our price / you save" does not become the price.
 */
export function findPriceElement(scope: ParentNode): Element | null {
  let best: Element | null = null
  let bestDepth = -1
  for (const el of qsa(scope, '[id],[class]')) {
    if (!isPriceElement(el)) continue
    let depth = 0
    for (let p = el.parentElement; p; p = p.parentElement) depth++
    if (depth > bestDepth) {
      bestDepth = depth
      best = el
    }
  }
  return best
}

/**
 * Last-resort price: our reading of rendered text. Weaker than every
 * machine-readable path above, and labelled as such, with the element it was
 * read from.
 */
function factsFromText(doc: Document): Partial<ProductFacts> {
  const el = findPriceElement(doc)
  if (!el) return {}
  const text = textOf(el).trim().replace(/\s+/g, ' ')
  const matched = PRICE_RE.exec(text)?.[0] ?? null
  return { price: fact(matched, 'text', selectorOf(el)) }
}

/**
 * Collect the facts the page DECLARES about the product, strongest evidence
 * first. Machine-readable paths only.
 *
 * MUST run on the raw document, before cleanTree: JSON-LD lives in
 * <script>, OpenGraph in <meta>, and cleanTree removes both carriers.
 */
export function collectDeclaredProductFacts(doc: Document): ProductFacts {
  const facts = emptyFacts()
  fillMissing(facts, factsFromJsonLd(doc))
  fillMissing(facts, factsFromMicrodata(doc))
  fillMissing(facts, factsFromMeta(doc))
  return facts
}

/**
 * Fill a still-missing price from rendered text. Weaker than every declared
 * path, so it only ever fills a null.
 *
 * MUST run AFTER recommendation pruning, not before: the deepest price-shaped
 * element on an unpruned PDP is usually a recommendation card's price, and
 * reporting a neighbouring product's price as this product's is the exact
 * contamination this whole module exists to prevent.
 */
export function fillPriceFromText(facts: ProductFacts, doc: Document): void {
  fillMissing(facts, factsFromText(doc))
}

/**
 * Both passes at once, for callers holding a single document. Prefer the
 * split form inside the cascade, where pruning happens in between.
 */
/**
 * Whether a control group is labelled: a <label> right before it or around
 * it, one naming it by id, or an aria-label or option role of its own. A
 * product's options are named ("HDD:", "Size"); a cart's buttons are not.
 */
function isLabelled(el: Element, doc: Document): boolean {
  if (el.previousElementSibling !== null && tagOf(el.previousElementSibling) === 'label') return true
  if (el.closest('label') !== null || (el.getAttribute('aria-label') ?? '').trim() !== '') return true
  if (['radiogroup', 'listbox'].includes((el.getAttribute('role') ?? '').toLowerCase())) return true
  const id = el.getAttribute('id')
  return id !== null && id !== '' && qsa(doc, 'label[for]').some((label) => label.getAttribute('for') === id)
}

/** Words in a form's action, id or class that make it the add-to-cart form. */
const CART_FORM = /cart|basket|bag/i
/** Words in a control's or its container's name, id or class that name a product option. */
const OPTION_NAME = /swatch|variant|variation|attribute/i

/**
 * Whether a control group is one of the product's options, not some other
 * labelled control on its page (a review sort, a gift-date picker, a video
 * player's settings): it sits in the add-to-cart form, or it or its
 * container is named for a variant, a variation, an attribute or a swatch.
 */
function isProductOption(el: Element): boolean {
  const form = el.closest('form')
  if (form !== null && CART_FORM.test(`${form.getAttribute('action') ?? ''} ${form.getAttribute('id') ?? ''} ${form.getAttribute('class') ?? ''}`)) return true
  return [el, el.parentElement, ...Array.from(el.children)].some((node) =>
    node !== null && OPTION_NAME.test(`${node.getAttribute('name') ?? ''} ${node.getAttribute('id') ?? ''} ${node.getAttribute('class') ?? ''}`))
}

/**
 * A product's options shown as controls, which cleaning removes with every
 * other control: each labelled <select>, and each labelled element whose
 * children are two or more buttons (swatches), that is one of the product's
 * options (isProductOption). Each is replaced by an empty
 * placeholder, returned with the option values it stands for: a select's
 * choices without its empty-valued prompt, the buttons' texts. Run before
 * cleanTree; settleOptionGroups decides once the page is routed. A quantity
 * picker, whose choices count up from 0 or 1 ("01" too), is not an option group.
 */
export function markOptionGroups(doc: Document, excluded: ReadonlySet<Element> = new Set()): Map<Element, string> {
  const marked = new Map<Element, string>()
  const outside = (el: Element) => ![...excluded].some((ex) => ex.contains(el))
  const place = (replaced: Element, values: string[]): void => {
    const unique = [...new Set(values.map((v) => v.replace(/\s+/g, ' ').trim()).filter((v) => v !== ''))]
    if (unique.length < 2) return
    const placeholder = doc.createElement('span')
    replaced.parentNode?.insertBefore(placeholder, replaced)
    marked.set(placeholder, unique.join(', '))
  }
  for (const select of qsa(doc, 'select')) {
    if (!outside(select) || !isLabelled(select, doc) || !isProductOption(select)) continue
    const choices = qsa(select, 'option').filter((option) => option.getAttribute('value') !== '').map((option) => textOf(option).trim())
    // A quantity picker (1, 2, 3, …) is how many to buy, not one of the product's options.
    const counts = choices.every((choice, at) => /^\d+$/.test(choice) && Number(choice) === Number(choices[0]) + at) && [0, 1].includes(Number(choices[0]))
    if (!counts) place(select, choices)
  }
  for (const group of qsa(doc, 'div,span,ul,fieldset,p')) {
    const kids = Array.from(group.children)
    if (kids.length < 2 || !kids.every((kid) => tagOf(kid) === 'button' && (kid.getAttribute('type') ?? '').toLowerCase() !== 'submit')) continue
    if (!outside(group) || !isLabelled(group, doc) || !isProductOption(group)) continue
    place(kids[0]!, kids.map((kid) => textOf(kid)))
  }
  return marked
}

/**
 * Settle markOptionGroups' placeholders: on a product page each becomes its
 * values as text ("128, 256, 512"), on any other page it is removed.
 */
export function settleOptionGroups(marked: ReadonlyMap<Element, string>, keep: boolean): void {
  for (const [placeholder, values] of marked) {
    // Spaced, so the values stand apart from a link or label beside them.
    if (keep && placeholder.parentNode !== null) placeholder.parentNode.replaceChild(placeholder.ownerDocument.createTextNode(` ${values} `), placeholder)
    else placeholder.parentNode?.removeChild(placeholder)
  }
}

export function collectProductFacts(doc: Document): ProductFacts {
  const facts = collectDeclaredProductFacts(doc)
  fillPriceFromText(facts, doc)
  return facts
}

/** True when no field of a ProductFacts was stated. */
export function hasAnyProductFact(facts: ProductFacts): boolean {
  return Object.values(facts).some((f) => f !== null)
}

// ---------------------------------------------------------------------------
// Region selection
// ---------------------------------------------------------------------------

function isRootish(doc: Document, el: Element | null): boolean {
  return el === null || el === doc.body || el === doc.documentElement
}

/**
 * The region of a PDP that is about THIS product.
 *
 * Anchors on two independent landmarks — the page heading (what the product is
 * called) and the price element (what it costs) — and returns their lowest
 * common ancestor. On a PDP those two sit close together inside the buy-box
 * region; on the recommendation grid they do not, so the grid loses even when
 * it carries more text than the product does.
 *
 * Widens once if the resulting region carries no prose at all, so a
 * title-and-price-only region does not swallow the description. Returns null
 * when no defensible region exists, which is the extractor's signal to fall
 * back to the article cascade rather than emit a guess.
 */
/**
 * Whether a block says something of its own, not only the labels of form
 * controls: a variation picker's table cells ("Size", "Color") label the
 * selects that cleaning removed, and describe nothing.
 */
function describes(block: TextBlock): boolean {
  const unlabelled = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? ''
    if (node.nodeType !== 1 || tagOf(node as Element) === 'label') return ''
    return Array.from(node.childNodes).map(unlabelled).join('')
  }
  return /[\p{L}\p{N}]/u.test(unlabelled(block.el))
}

export function selectProduct(doc: Document, blocks: readonly TextBlock[]): Element | null {
  const described = blocks.filter(describes)
  // A declared microdata scope is the publisher telling us the boundary
  // outright — but only when it is not simply the whole page.
  const scope = microdataProductScope(doc)
  if (scope && !isRootish(doc, scope)) return scope

  const heading = doc.querySelector('h1') ?? doc.querySelector('h2')
  const price = findPriceElement(doc)

  if (heading && price && !price.contains(heading)) {
    const lca = commonAncestor(heading, price)
    if (!isRootish(doc, lca)) {
      const region = lca!
      if (described.some((b) => region.contains(b.el))) return region
      // Title + price but no description: widen to the nearest container
      // that reaches it, never to the page itself.
      for (let wider = region.parentElement; !isRootish(doc, wider); wider = wider!.parentElement) {
        if (described.some((b) => wider!.contains(b.el))) return wider
      }
      return region
    }
  }

  // No price landmark: the smallest container holding the heading and at
  // least one text block still beats scoring the whole page by volume.
  if (heading) {
    for (let p = heading.parentElement; p && !isRootish(doc, p); p = p.parentElement) {
      if (blocks.some((b) => p!.contains(b.el))) return p
    }
  }
  return null
}
