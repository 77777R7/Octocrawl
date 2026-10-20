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

import type { ProductFact, ProductFactSource, ProductFacts, ProductFieldConflict, QuoteState } from '@w2l/contracts'
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

/** A JSON Pointer reference token (RFC 6901). */
const pointerToken = (key: string | number): string => String(key).replace(/~/g, '~0').replace(/\//g, '~1')

/**
 * schema.org allows a scalar, an object with a `name`, or an array of either
 * almost anywhere (`brand`, `availability`). Reduce to the first scalar we can
 * defend, with the pointer it was read at; never join an array into a
 * synthetic string.
 */
function scalarAt(v: unknown, path: string): { value: string; path: string } | null {
  if (Array.isArray(v)) {
    for (const [index, item] of v.entries()) {
      const found = scalarAt(item, `${path}/${index}`)
      if (found !== null) return found
    }
    return null
  }
  if (typeof v === 'object' && v !== null) {
    const rec = v as Record<string, unknown>
    for (const key of ['name', '@id', 'value']) {
      const s = asString(rec[key])
      if (s !== null) return { value: s, path: `${path}/${pointerToken(key)}` }
    }
    return null
  }
  const s = asString(v)
  return s === null ? null : { value: s, path }
}

/** Strip a schema.org enumeration IRI to its short name (…/InStock -> InStock). */
function shortEnum(v: string | null): string | null {
  if (v === null) return null
  return /[#/]([^#/]+)$/.exec(v.trim())?.[1] ?? v
}

type FactField = ProductFieldConflict['field']
const FACT_FIELDS: readonly FactField[] = ['name', 'price', 'priceCurrency', 'sku', 'brand', 'availability']
/** Fields two sources can contradict. A name is phrased differently by each source; a SKU binds the sources in the first place. */
const COMPARED_FIELDS: ReadonlySet<FactField> = new Set(['price', 'priceCurrency', 'brand', 'availability'])

/** Where the request and its page say they are: the URLs a declared product's `url` or `@id` can name. */
export interface SubjectContext {
  /** The URL that was requested (or fetched): its path segments and query values may name a SKU. */
  url?: string
  /** The page's `<link rel="canonical">`. */
  canonical?: string | null
}

/** A URL as compared here: host without `www.`, path without a trailing slash, query sorted, no fragment or scheme. */
interface UrlKey { full: string; path: string }

function urlKey(raw: string, base: string | undefined): UrlKey | null {
  try {
    const u = new URL(raw.trim(), base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const at = `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '') || '/'}`
    const query = new URLSearchParams([...u.searchParams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))).toString()
    return { path: at, full: query === '' ? at : `${at}?${query}` }
  } catch {
    return null
  }
}

/** The request URL's path segments and query values, lower-cased: where a shop's URL names a SKU or variant. */
function urlTokens(url: string | undefined): Set<string> {
  if (url === undefined) return new Set()
  try {
    const u = new URL(url)
    const segments = u.pathname.split('/').map((s) => {
      try { return decodeURIComponent(s) } catch { return s }
    })
    return new Set([...segments, ...u.searchParams.values()].map(normId).filter((s) => s.length >= 2))
  } catch {
    return new Set()
  }
}

/** Letters and digits only, lower-cased: "In stock" and InStock are one availability. */
const comparable = (v: string): string => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" }
/** The character references JSON-LD often carries escaped once too often (`Tom &amp;amp; Jerry`). */
const decodeEntities = (v: string): string => v.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m)
/** An identifier as compared: letters and digits only, lower-cased, without leading zeros (a GTIN-13 is its GTIN-12 with one). */
const normId = (v: string): string => comparable(v).replace(/^0+(?=.)/, '')

/** The numbers an amount can be read as, with `.` or `,` as its decimal mark. */
function amountReadings(text: string): Set<number> {
  const run = /\d[\d.,'’\s]{0,30}/.exec(text)?.[0].replace(/[\s'’]/g, '').replace(/[.,]+$/, '') ?? ''
  const out = new Set<number>()
  for (const [mark, group] of [['.', ','], [',', '.']] as const) {
    const parts = run.split(group).join('').split(mark)
    if (parts.length > 2) continue
    const n = Number(parts.join('.'))
    if (run !== '' && Number.isFinite(n)) out.add(n)
  }
  return out
}

/** Whether two statements of a field say the same thing: one amount read either way, or one text up to case and punctuation. */
function sameValue(field: FactField, a: string, b: string): boolean {
  if (comparable(a) === comparable(b)) return true
  if (field !== 'price') return false
  const readings = amountReadings(b)
  return [...amountReadings(a)].some((n) => readings.has(n))
}

/** The identifier kinds a product declares; a value shared under any kind is one product. */
const ID_KINDS = { sku: ['sku'], mpn: ['mpn'], gtin: ['gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14'], productID: ['productID'] } as const
type IdKind = keyof typeof ID_KINDS

/**
 * One product a page declares in one place (a JSON-LD node, a microdata
 * scope): its fields with their paths, and what identifies it.
 */
interface DeclaredProduct {
  /** Where it is declared: `/script/1`, `/script/0/hasVariant/2`, `microdata[0]`. */
  where: string
  source: 'jsonld' | 'microdata'
  /** Its node identifier as written, fragment included: JSON-LD `@id`, microdata `itemid`. Two different ones are two products. */
  node: string | null
  /** The same as a URL, for the request and canonical tiers. */
  nodeKey: UrlKey | null
  fields: Partial<Record<FactField, ProductFact>>
  /** Fields its offers state differently, none of them selected. */
  ambiguous: Partial<Record<FactField, ProductFact[]>>
  /** Its own identifiers. */
  ids: Partial<Record<IdKind, string[]>>
  /** Its offers' identifiers: a variant's SKU names the product too, but a parent SKU beside it does not contradict it. */
  offerIds: string[]
  /** Its `url` and its offers' `url`. */
  urls: UrlKey[]
  /** The page's mainEntity (or mainEntityOfPage names the page). */
  main: boolean
  /** Declared inside another node's property (a related item, a list), not at the top of its document. */
  nested: boolean
  parentId: string | null
}

const allIds = (d: DeclaredProduct): string[] => [...Object.values(d.ids).flat(), ...d.offerIds]
const tierUrls = (d: DeclaredProduct): UrlKey[] => (d.nodeKey === null ? d.urls : [...d.urls, d.nodeKey])

/** What relation() compares, computed once per declaration. */
interface Keys { ids: Set<string>; kinds: Set<IdKind>; full: Set<string>; paths: Set<string>; name: string | null }
const keyCache = new WeakMap<DeclaredProduct, Keys>()
function keysOf(d: DeclaredProduct): Keys {
  let keys = keyCache.get(d)
  if (keys === undefined) {
    keys = {
      ids: new Set(allIds(d).map(normId)),
      kinds: new Set(Object.keys(d.ids) as IdKind[]),
      full: new Set(d.urls.map((u) => u.full)),
      paths: new Set(d.urls.map((u) => u.path)),
      name: d.fields.name === undefined ? null : comparable(decodeEntities(d.fields.name.value)),
    }
    keyCache.set(d, keys)
  }
  return keys
}
function overlaps<T>(a: Set<T>, b: Set<T>): boolean {
  for (const v of a) if (b.has(v)) return true
  return false
}

/**
 * Whether two declarations are the same product, provably different ones, or
 * cannot be told apart: a shared identifier makes them one; two node
 * identifiers, or two values of one identifier kind, that differ make them
 * two; then their URLs; then their names, which differ between two syntaxes
 * of one product ("Mug", "Mug - Blue") but not between two nodes of one.
 */
function relation(da: DeclaredProduct, db: DeclaredProduct): 'same' | 'different' | 'unknown' {
  const a = keysOf(da)
  const b = keysOf(db)
  if (overlaps(a.ids, b.ids)) return 'same'
  if (da.node !== null && db.node !== null) return da.node === db.node ? 'same' : 'different'
  if (overlaps(a.kinds, b.kinds)) return 'different'
  if (a.full.size > 0 && b.full.size > 0) {
    if (overlaps(a.full, b.full)) return 'same'
    return overlaps(a.paths, b.paths) ? 'unknown' : 'different'
  }
  if (a.name !== null && b.name !== null) return a.name === b.name ? 'same' : da.source === db.source ? 'different' : 'unknown'
  return 'unknown'
}

function relationToAll(members: readonly DeclaredProduct[], d: DeclaredProduct): 'same' | 'different' | 'unknown' {
  let different = false
  for (const m of members) {
    const r = relation(m, d)
    if (r === 'same') return 'same'
    if (r === 'different') different = true
  }
  return different ? 'different' : 'unknown'
}

const typesOf = (rec: Record<string, unknown>): string[] =>
  (Array.isArray(rec['@type']) ? rec['@type'] : [rec['@type']]).filter((x): x is string => typeof x === 'string').map((x) => x.trim())
// Product and its schema.org subtypes (IndividualProduct, ProductModel,
// SomeProducts) each describe one product; a ProductGroup is a family of them.
const isProductType = (types: readonly string[]) => types.some((x) => /(^|[#/:])(individual)?product(model)?$|someproducts$/i.test(x))
const isGroupType = (types: readonly string[]) => types.some((x) => /(^|[#/:])productgroup$/i.test(x))

const record = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null

function idsOf(read: (name: string) => string | null): Partial<Record<IdKind, string[]>> {
  const out: Partial<Record<IdKind, string[]>> = {}
  for (const [kind, names] of Object.entries(ID_KINDS) as Array<[IdKind, readonly string[]]>) {
    const values = names.map(read).filter((v): v is string => v !== null && v.trim() !== '').map((v) => v.trim())
    if (values.length > 0) out[kind] = [...new Set(values)]
  }
  return out
}

function mergeIds(into: Partial<Record<IdKind, string[]>>, from: Partial<Record<IdKind, string[]>>): void {
  for (const [kind, values] of Object.entries(from) as Array<[IdKind, string[]]>) into[kind] = [...new Set([...(into[kind] ?? []), ...values])]
}

/**
 * The offer a product's `offers` states its price in. One offer is that
 * offer; among several, the one the request URL selects (by its SKU, GTIN or
 * MPN, or by its `url` with the query). Without a selection a field the offers
 * agree on is still stated, and one they state differently is ambiguous.
 */
function offerFields(product: Record<string, unknown>, path: string, ctx: Resolved): Pick<DeclaredProduct, 'fields' | 'ambiguous'> & { ids: Partial<Record<IdKind, string[]>>; urls: UrlKey[] } {
  const raw = product['offers']
  const offers = (Array.isArray(raw) ? raw.map((o, i) => ({ offer: record(o), path: `${path}/offers/${i}` })) : [{ offer: record(raw), path: `${path}/offers` }])
    .filter((o): o is { offer: Record<string, unknown>; path: string } => o.offer !== null)
  const ids: Partial<Record<IdKind, string[]>> = {}
  const urls: UrlKey[] = []
  const urlsOf = (offer: Record<string, unknown>) => [asString(offer['url'])].flatMap((u) => (u === null ? [] : [urlKey(u, ctx.base)])).filter((u): u is UrlKey => u !== null)
  for (const { offer } of offers) {
    mergeIds(ids, idsOf((name) => asString(offer[name])))
    urls.push(...urlsOf(offer))
  }
  let chosen = offers
  if (offers.length > 1) {
    const named = offers.filter(({ offer }) => Object.values(idsOf((name) => asString(offer[name]))).flat().some((v) => ctx.tokens.has(normId(v))))
    const linked = offers.filter(({ offer }) => urlsOf(offer).some((u) => ctx.targets.some((t) => t.full === u.full)))
    if (named.length === 1) chosen = named
    else if (linked.length === 1) chosen = linked
  }
  const fields: Partial<Record<FactField, ProductFact>> = {}
  const ambiguous: Partial<Record<FactField, ProductFact[]>> = {}
  const readers: Array<[FactField, (o: Record<string, unknown>) => string | null, string]> = [
    ['price', (o) => asString(o['price']), 'price'],
    ['priceCurrency', (o) => asString(o['priceCurrency']), 'priceCurrency'],
  ]
  for (const [field, read, key] of readers) {
    const facts = chosen.map(({ offer, path: at }) => fact(read(offer), 'jsonld', `${at}/${key}`)).filter((f): f is ProductFact => f !== null)
    if (facts.length === 0) continue
    if (facts.every((f) => sameValue(field, f.value, facts[0]!.value))) fields[field] = facts[0]!
    else ambiguous[field] = facts
  }
  const availability = chosen.map(({ offer, path: at }) => {
    const found = scalarAt(offer['availability'], `${at}/availability`)
    return found === null ? null : fact(shortEnum(found.value), 'jsonld', found.path)
  }).filter((f): f is ProductFact => f !== null)
  if (availability.length > 0) {
    if (availability.every((f) => sameValue('availability', f.value, availability[0]!.value))) fields.availability = availability[0]!
    else ambiguous.availability = availability
  }
  return { fields, ambiguous, ids, urls }
}

/** The request as subject resolution reads it. */
interface Resolved {
  base: string | undefined
  /** The request URL and the canonical link. */
  targets: UrlKey[]
  tokens: Set<string>
}

/**
 * Every Product node of the page's JSON-LD, in document order, with its JSON
 * Pointer (`/script/<n>` is the n-th ld+json script): top-level nodes, array
 * members, `@graph` members, a ProductGroup's `hasVariant` (each variant
 * taking the group's name and brand when it states none), and Products nested
 * in other nodes' properties, marked as nested.
 */
function jsonLdProducts(doc: Document, ctx: Resolved): DeclaredProduct[] {
  const parsed: unknown[] = []
  for (const el of qsa(doc, 'script[type="application/ld+json"]')) {
    try {
      parsed.push(JSON.parse(el.textContent ?? ''))
    } catch {
      parsed.push(undefined) // Malformed JSON-LD is not evidence; its index still counts.
    }
  }
  // Nodes by @id, for a variant's isVariantOf reference; the ids mainEntity names.
  const byId = new Map<string, { node: Record<string, unknown>; path: string }>()
  const mainIds = new Set<string>()
  const index = (v: unknown, path: string): void => {
    if (Array.isArray(v)) return v.forEach((item, i) => index(item, `${path}/${i}`))
    const rec = record(v)
    if (rec === null) return
    const id = asString(rec['@id'])
    if (id !== null && Object.keys(rec).length > 1 && !byId.has(id)) byId.set(id, { node: rec, path })
    const main = rec['mainEntity']
    const mainId = asString(main) ?? asString(record(main)?.['@id'])
    if (mainId !== null) mainIds.add(mainId)
    for (const [key, value] of Object.entries(rec)) index(value, `${path}/${pointerToken(key)}`)
  }
  parsed.forEach((p, i) => index(p, `/script/${i}`))

  const out: DeclaredProduct[] = []
  const declare = (rec: Record<string, unknown>, path: string, nested: boolean, main: boolean, group: { node: Record<string, unknown>; path: string } | null): void => {
    const own = (key: string) => scalarAt(rec[key], `${path}/${pointerToken(key)}`)
    const inherited = (key: string) => own(key) ?? (group === null ? null : scalarAt(group.node[key], `${group.path}/${pointerToken(key)}`))
    const sku = asString(rec['sku']) !== null ? own('sku') : asString(rec['mpn']) !== null ? own('mpn') : null
    const offers = offerFields(rec, path, ctx)
    const id = asString(rec['@id'])
    const url = asString(rec['url'])
    const urls = [url].flatMap((u) => (u === null ? [] : [urlKey(u, ctx.base)])).filter((u): u is UrlKey => u !== null)
    const ofPage = asString(rec['mainEntityOfPage']) ?? asString(record(rec['mainEntityOfPage'])?.['@id']) ?? asString(record(rec['mainEntityOfPage'])?.['url'])
    const ofPageKey = ofPage === null ? null : urlKey(ofPage, ctx.base)
    const name = inherited('name')
    const brand = inherited('brand')
    out.push({
      where: path,
      fields: {
        ...(name === null ? {} : { name: fact(name.value, 'jsonld', name.path)! }),
        ...(sku === null ? {} : { sku: fact(sku.value, 'jsonld', sku.path)! }),
        ...(brand === null ? {} : { brand: fact(brand.value, 'jsonld', brand.path)! }),
        ...offers.fields,
      },
      source: 'jsonld',
      node: id,
      nodeKey: id === null ? null : urlKey(id, ctx.base),
      ambiguous: offers.ambiguous,
      ids: idsOf((name) => asString(rec[name])),
      offerIds: Object.values(offers.ids).flat(),
      urls: [...urls, ...offers.urls],
      main: main || (id !== null && mainIds.has(id)) || (ofPageKey !== null && ctx.targets.some((t) => t.path === ofPageKey.path)),
      nested,
      parentId: group === null ? null : asString(group.node['productGroupID']) ?? asString(group.node['sku']) ?? asString(group.node['@id']),
    })
  }
  const groupOf = (rec: Record<string, unknown>, path: string): { node: Record<string, unknown>; path: string } | null => {
    const of = rec['isVariantOf']
    const inline = record(of)
    if (inline !== null && isGroupType(typesOf(inline))) return { node: inline, path: `${path}/isVariantOf` }
    const ref = asString(of) ?? asString(inline?.['@id'])
    return ref === null ? null : byId.get(ref) ?? null
  }
  const walk = (v: unknown, path: string, nested: boolean, main: boolean, group: { node: Record<string, unknown>; path: string } | null): void => {
    if (Array.isArray(v)) return v.forEach((item, i) => walk(item, `${path}/${i}`, nested, main, group))
    const rec = record(v)
    if (rec === null) return
    const types = typesOf(rec)
    if (isProductType(types)) {
      declare(rec, path, nested, main, group ?? groupOf(rec, path))
      // A product's offers describe it, and its isVariantOf is its family; other products in it are related items.
      for (const [key, value] of Object.entries(rec)) {
        if (key !== 'offers' && key !== 'isVariantOf') walk(value, `${path}/${pointerToken(key)}`, true, false, null)
      }
      return
    }
    const family = isGroupType(types)
    for (const [key, value] of Object.entries(rec)) {
      const at = `${path}/${pointerToken(key)}`
      if (family && key === 'hasVariant') walk(value, at, nested, main, { node: rec, path })
      else if (key === '@graph') walk(value, at, nested, false, null)
      else if (key === 'mainEntity') walk(value, at, nested, true, null)
      else walk(value, at, true, false, null)
    }
  }
  parsed.forEach((p, i) => walk(p, `/script/${i}`, false, false, null))
  return out
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

function isProductScope(el: Element): boolean {
  const raw = el.getAttribute('itemtype') ?? ''
  return raw.split(/[\t\n\f\r ]+/).some((token) => (/[#/]([^#/]+)$/.exec(token.trim())?.[1] ?? token.trim()).toLowerCase() === 'product')
}

/** The element scoping a microdata Product, if the page declares one. */
export function microdataProductScope(doc: Document): Element | null {
  return qsa(doc, '[itemscope][itemtype]').find(isProductScope) ?? null
}

/**
 * Every microdata Product not inside another one, in document order
 * (`microdata[<n>]`), with the properties it states itself: a Product scope
 * inside it (a related item) keeps its own.
 */
function microdataProducts(doc: Document, ctx: Resolved): DeclaredProduct[] {
  const scopes = new Set(qsa(doc, '[itemscope][itemtype]').filter(isProductScope))
  /** The Product scope an element's property belongs to: its nearest one above it. */
  const owner = (el: Element): Element | null => {
    for (let p = el.parentElement; p !== null; p = p.parentElement) if (scopes.has(p)) return p
    return null
  }
  const outer = [...scopes].filter((el) => owner(el) === null)
  return outer.map((scope, n) => {
    const where = `microdata[${n}]`
    const pick = (prop: string): { value: string; path: string } | null => {
      for (const el of qsa(scope, `[itemprop~="${prop}"]`)) {
        if (owner(el) !== scope) continue
        const v = microdataValue(el)
        if (v !== null && v.trim().length > 0) return { value: v, path: `${where} [itemprop~="${prop}"]` }
      }
      return null
    }
    const read = (prop: string, value: (s: string) => string | null = (s) => s) => {
      const found = pick(prop)
      return found === null ? null : fact(value(found.value), 'microdata', found.path)
    }
    const fields: Partial<Record<FactField, ProductFact>> = {}
    const facts: Array<[FactField, ProductFact | null]> = [
      ['name', read('name')],
      ['price', read('price')],
      ['priceCurrency', read('priceCurrency')],
      ['sku', read('sku') ?? read('mpn')],
      ['brand', read('brand')],
      ['availability', read('availability', shortEnum)],
    ]
    for (const [field, f] of facts) if (f !== null) fields[field] = f
    const itemid = scope.getAttribute('itemid')
    const url = pick('url')?.value ?? null
    const urls = [url].flatMap((u) => (u === null ? [] : [urlKey(u, ctx.base)])).filter((u): u is UrlKey => u !== null)
    const props = (scope.getAttribute('itemprop') ?? '').split(/\s+/)
    return {
      where,
      source: 'microdata' as const,
      node: itemid,
      nodeKey: itemid === null ? null : urlKey(itemid, ctx.base),
      fields,
      ambiguous: {},
      ids: idsOf((name) => pick(name)?.value ?? null),
      offerIds: [],
      urls,
      main: props.includes('mainEntity'),
      nested: props.some((p) => p !== '' && p !== 'mainEntity'),
      parentId: null,
    }
  })
}

/** OpenGraph / Facebook product meta tags, the third machine-readable path: about the page's own product. */
function metaFacts(doc: Document): { fields: Partial<Record<FactField, ProductFact>>; ids: Partial<Record<IdKind, string[]>> } {
  const meta = (names: readonly string[], value: (s: string) => string | null = (s) => s): ProductFact | null => {
    for (const name of names) {
      for (const el of qsa(doc, `meta[property="${name}"],meta[name="${name}"]`)) {
        const v = el.getAttribute('content')
        if (v === null || v.trim().length === 0) continue
        const attr = el.getAttribute('property') === name ? 'property' : 'name'
        return fact(value(v), 'meta', `meta[${attr}="${name}"]`)
      }
    }
    return null
  }
  const fields: Partial<Record<FactField, ProductFact>> = {}
  const facts: Array<[FactField, ProductFact | null]> = [
    ['name', meta(['og:title', 'product:title'])],
    ['price', meta(['product:price:amount', 'og:price:amount'])],
    ['priceCurrency', meta(['product:price:currency', 'og:price:currency'])],
    ['sku', meta(['product:retailer_item_id', 'product:sku'])],
    ['brand', meta(['product:brand', 'og:brand'])],
    ['availability', meta(['product:availability', 'og:availability'], shortEnum)],
  ]
  for (const [field, f] of facts) if (f !== null) fields[field] = f
  return { fields, ids: fields.sku === undefined ? {} : { sku: [fields.sku.value] } }
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

/** How many declared products are compared to find the subject; a page declaring more is a listing. */
const MAX_COMPARED = 250

/** Facts whose price must not be read from the page's text: the page declares other products, or the subject's own sources disagree on it. */
const textPriceBarred = new WeakSet<ProductFacts>()

/** What singles a product out, strongest first: each step keeps the products it holds for, if it holds for some but not all. */
const SUBJECT_TIERS: ReadonlyArray<[string, (members: readonly DeclaredProduct[], ctx: Resolved) => boolean]> = [
  ['its identifier is in the request URL', (members, ctx) => members.some((d) => allIds(d).some((v) => ctx.tokens.has(normId(v))))],
  ['its url is the request URL or the canonical link', (members, ctx) => members.some((d) => tierUrls(d).some((u) => ctx.targets.some((t) => t.full === u.full)))],
  ['its url has the path of the request URL or the canonical link', (members, ctx) => members.some((d) => tierUrls(d).some((u) => ctx.targets.some((t) => t.path === u.path)))],
  ['it is the page\'s mainEntity', (members) => members.some((d) => d.main)],
  ['it is the only one not nested in another node', (members) => members.some((d) => !d.nested)],
]

/** A declaration's place and its first identifier, for identity evidence. */
function label(members: readonly DeclaredProduct[]): string {
  const where = members.map((d) => d.where).join(' + ')
  for (const kind of Object.keys(ID_KINDS) as IdKind[]) {
    const id = members.find((d) => d.ids[kind] !== undefined)?.ids[kind]?.[0]
    if (id !== undefined) return `${where} (${kind} ${id})`
  }
  const name = members.find((d) => d.fields.name !== undefined)?.fields.name?.value
  return name === undefined ? where : `${where} (${JSON.stringify(name)})`
}

/**
 * One product's fields from the declarations bound to it, strongest first.
 * A field its sources state differently (or its offers do, none selected) is
 * null, with every statement kept in `ambiguous`.
 */
function mergeFields(sources: ReadonlyArray<Pick<DeclaredProduct, 'fields' | 'ambiguous'>>): { facts: ProductFacts; ambiguous: ProductFieldConflict[] } {
  const facts = emptyFacts()
  const ambiguous: ProductFieldConflict[] = []
  for (const field of FACT_FIELDS) {
    const stated = sources.flatMap((s) => (s.fields[field] === undefined ? [] : [s.fields[field]!]))
    const offered = sources.flatMap((s) => s.ambiguous[field] ?? [])
    if (offered.length > 0 || (COMPARED_FIELDS.has(field) && stated.some((f) => !sameValue(field, f.value, stated[0]!.value)))) {
      ambiguous.push({ field, facts: [...offered, ...stated] })
    } else if (stated.length > 0) facts[field] = stated[0]!
  }
  return { facts, ambiguous }
}

/**
 * Collect the facts the page DECLARES about the product, strongest evidence
 * first. Machine-readable paths only.
 *
 * The product is chosen before any field is read: every Product the page
 * declares (JSON-LD nodes, microdata scopes) is a candidate, declarations that
 * share an identifier are one product, and the request URL, the canonical
 * link, `mainEntity` and the page's structure single one out (SUBJECT_TIERS).
 * Its fields come from its own declarations, then from declarations that
 * cannot be told apart from it, then from the product meta tags, each filling
 * what the stronger left null; where they disagree the field is ambiguous.
 * When several products are left, `identity.status` is `conflicting` and only
 * the fields every one of them states alike are reported.
 *
 * MUST run on the raw document, before cleanTree: JSON-LD lives in
 * <script>, OpenGraph in <meta>, and cleanTree removes both carriers.
 */
export function collectDeclaredProductFacts(doc: Document, context: SubjectContext = {}): ProductFacts {
  const base = context.url
  const targets = [context.url, context.canonical ?? undefined]
    .flatMap((u) => (u === undefined ? [] : [urlKey(u, base)])).filter((u): u is UrlKey => u !== null)
  const ctx: Resolved = { base, targets, tokens: urlTokens(context.url) }
  const meta = metaFacts(doc)
  const all = [...jsonLdProducts(doc, ctx), ...microdataProducts(doc, ctx)]
  if (all.length === 0) return mergeFields([{ fields: meta.fields, ambiguous: {} }]).facts
  // Comparing declarations is quadratic: past MAX_COMPARED (a listing's worth), only the ones the request or the page names directly are compared.
  const named = (d: DeclaredProduct) => SUBJECT_TIERS.slice(0, 4).some(([, holds]) => holds([d], ctx))
  const declared = all.length <= MAX_COMPARED ? all : all.filter((d, i) => i < MAX_COMPARED || named(d))

  // Declarations of one product form one subject; one that cannot be told apart from those before it waits.
  const subjects: DeclaredProduct[][] = []
  const loose: DeclaredProduct[] = []
  for (const d of declared) {
    let same: DeclaredProduct[] | null = null
    let distinct = true
    for (const members of subjects) {
      const r = relationToAll(members, d)
      if (r === 'same') {
        same = members
        break
      }
      if (r === 'unknown') distinct = false
    }
    if (same !== null) same.push(d)
    else if (distinct) subjects.push([d])
    else loose.push(d)
  }

  let left = subjects
  let reason = 'it is the only product the page declares'
  for (const [why, holds] of SUBJECT_TIERS) {
    if (left.length === 1) break
    const kept = left.filter((members) => holds(members, ctx))
    if (kept.length > 0 && kept.length < left.length) {
      left = kept
      reason = why
    }
  }
  const evidence: string[] = []
  if (declared.length < all.length) evidence.push(`${all.length - declared.length} more declared products were not compared`)
  const others = subjects.filter((members) => !left.includes(members))
  for (const members of others.slice(0, 20)) evidence.push(`${label(members)}: another product, not merged`)
  if (others.length > 20) evidence.push(`${others.length - 20} more declared products, not merged`)

  if (left.length > 1) {
    for (const members of left) evidence.push(`${label(members)}: a candidate nothing tells apart from the others`)
    const merged = left.map((members) => mergeFields(members).facts)
    const facts = emptyFacts()
    for (const field of FACT_FIELDS) {
      const first = merged[0]![field]
      if (first !== null && merged.every((m) => m[field] !== null && sameValue(field, m[field]!.value, first.value))) facts[field] = first
    }
    textPriceBarred.add(facts)
    facts.identity = {
      requestedId: null,
      observedSelectedId: null,
      parentId: null,
      selectedVariants: [],
      status: 'conflicting',
      identityMatch: false,
      identityEvidence: evidence,
    }
    return facts
  }

  const subject = left[0]!
  // A declaration nested in another node's property is a related item unless it is provably this one.
  const bound = loose.filter((d) => !d.nested && relationToAll(subject, d) !== 'different')
  for (const d of loose) if (!bound.includes(d)) evidence.push(`${label([d])}: another product, not merged`)
  // The meta tags are the page's own product unless they name another declared one.
  const metaIds = Object.values(meta.ids).flat().map(normId)
  const metaElsewhere = metaIds.length > 0 && others.some((members) => members.some((d) => allIds(d).some((v) => metaIds.includes(normId(v)))))
  if (metaElsewhere) evidence.push(`meta (sku ${meta.ids.sku?.[0]}): names another product, not merged`)
  evidence.unshift(`${label([...subject, ...bound])}: the subject, ${reason}`)
  const { facts, ambiguous } = mergeFields([...subject, ...bound, ...(metaElsewhere ? [] : [{ fields: meta.fields, ambiguous: {} }])])

  const requested = SUBJECT_TIERS[0]![1](subject, ctx)
    ? subject.flatMap(allIds).find((v) => ctx.tokens.has(normId(v))) ?? null
    : null
  const observed = (['sku', 'mpn', 'productID', 'gtin'] as const).map((kind) => subject.find((d) => d.ids[kind] !== undefined)?.ids[kind]?.[0]).find((v) => v !== undefined) ?? null
  facts.identity = {
    requestedId: requested,
    observedSelectedId: observed,
    parentId: subject.find((d) => d.parentId !== null)?.parentId ?? null,
    selectedVariants: [],
    status: 'matched',
    identityMatch: true,
    identityEvidence: evidence,
  }
  if (ambiguous.length > 0) facts.ambiguous = ambiguous
  if (ambiguous.some((a) => a.field === 'price')) facts.quoteState = 'conflicting' as QuoteState
  if (others.length > 0 || facts.ambiguous?.some((a) => a.field === 'price')) textPriceBarred.add(facts)
  return facts
}

/**
 * Fill a still-missing price from rendered text. Weaker than every declared
 * path, so it only ever fills a null, and never when the declarations say
 * the null is not an omission: the page declares other products whose price
 * the text could be, or the product's own sources disagree on its price.
 *
 * MUST run AFTER recommendation pruning, not before: the deepest price-shaped
 * element on an unpruned PDP is usually a recommendation card's price, and
 * reporting a neighbouring product's price as this product's is the exact
 * contamination this whole module exists to prevent.
 */
export function fillPriceFromText(facts: ProductFacts, doc: Document): void {
  if (textPriceBarred.has(facts)) return
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
/** The text settleOptionGroups wrote: a product's option values, which describe it no more than their labels do. */
const optionValues = new WeakSet<Node>()

export function settleOptionGroups(marked: ReadonlyMap<Element, string>, keep: boolean): void {
  for (const [placeholder, values] of marked) {
    if (keep && placeholder.parentNode !== null) {
      // Spaced, so the values stand apart from a link or label beside them.
      const text = placeholder.ownerDocument.createTextNode(` ${values} `)
      optionValues.add(text)
      placeholder.parentNode.replaceChild(text, placeholder)
    } else placeholder.parentNode?.removeChild(placeholder)
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
 * controls, the option values settleOptionGroups wrote for them and links: a
 * variation picker's table cells ("Size", "Color", "XS, S, M", its "Clear"
 * link) describe nothing.
 */
function describes(block: TextBlock): boolean {
  const unlabelled = (node: Node): string => {
    if (node.nodeType === 3) return optionValues.has(node) ? '' : node.textContent ?? ''
    if (node.nodeType !== 1 || tagOf(node as Element) === 'label' || tagOf(node as Element) === 'a') return ''
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
