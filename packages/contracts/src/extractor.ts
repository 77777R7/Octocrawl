/**
 * Extractor contract: the seam every main-content extractor implements
 * (extract-tf, the v0 readability wrapper, and any future tier).
 */

/** Page shape the extractor routed to. */
export type PageType = 'article' | 'listing' | 'collection' | 'product' | 'forum'

/** Extraction strategy that produced mainHtml, independent of pageType. */
export type ExtractStrategy = 'article' | 'list' | 'table' | 'product'

/**
 * Where a product fact came from. The ordering is a strength ordering:
 * `jsonld` and `microdata` are the publisher's own machine-readable claim,
 * `meta` is a tag written for machines, `text` is our reading of rendered
 * prose, `inferred` is our derivation from context (e.g., currency from domain).
 * A price we matched out of visible text is a weaker claim than one
 * the publisher declared, and a consumer is entitled to know which it got.
 */
export type ProductFactSource = 'jsonld' | 'microdata' | 'meta' | 'dom' | 'text' | 'inferred' | 'model'

/** Evidence classes allowed on the normalized cross-site entity surface. */
export type EntityFieldSource = 'jsonld' | 'microdata' | 'meta' | 'hydration' | 'dom' | 'inferred'
export type EntityFieldStatus = 'confirmed' | 'unconfirmed'
export type EntityType = 'product' | 'post' | 'thread' | 'comment' | 'profile' | 'community' | 'video' | 'article'
export type AdapterStatus = 'generic' | 'beta adapter' | 'verified adapter' | 'unsupported'

export type EntityValue = string | number | boolean | null | readonly EntityValue[] | { readonly [key: string]: EntityValue }

export interface EntityField<T extends EntityValue = EntityValue> {
  /** Value exactly as observed on the page. */
  raw: T
  /** Stable value used across adapters. */
  normalized: T
  source: EntityFieldSource
  /** CSS selector, JSON Pointer, URL component, or another public-page location. */
  path: string
  status: EntityFieldStatus
}

export interface ExtractedEntity {
  type: EntityType
  id: string | null
  fields: Readonly<Record<string, EntityField>>
  /** IDs of other entities in this response, e.g. parent/author/community. */
  relationships: Readonly<Record<string, string | readonly string[] | null>>
}

export interface AdapterDescriptor {
  id: string
  version: string
  status: AdapterStatus
}

/** Identity and provenance checks performed by a site adapter. */
export interface AdapterValidation {
  valid: boolean
  issues: readonly string[]
}

/** One product fact plus the evidence class it was drawn from. */
export interface ProductFact {
  /** The value exactly as the page carried it. Never normalized — a
   *  normalized price is a claim we would be making, not one we read. */
  value: string
  source: ProductFactSource
  /** JSON Pointer or CSS selector locating the evidence when available. */
  path?: string
}

export interface ProductPrice {
  amount: ProductFact
  currency: ProductFact | null
  priceType: 'current' | 'list' | 'unit' | 'subscription' | 'other'
  seller: ProductFact | null
}

export interface ProductVariant {
  name: string
  value: string
  selected: boolean
  source: ProductFactSource
  path?: string
}

/**
 * Product identity verification result with multi-evidence approach.
 * R1-B: Ensures we never output data for the wrong product.
 */
export interface ProductIdentity {
  /** ASIN or SKU requested by the user (from URL). */
  requestedId: string
  /** ASIN or SKU observed as selected on the page (from DOM multi-evidence). */
  observedSelectedId: string
  /** Parent ASIN if this is a variant product. */
  parentId: string | null
  /** Selected variant attributes if applicable. */
  selectedVariants: readonly ProductVariant[]
  /** Why the selected subject could or could not be verified. */
  status: 'matched' | 'mismatched' | 'unverified' | 'conflicting'
  /** True only when the observed selected product is the requested product. */
  identityMatch: boolean
  /** CSS selectors or paths that contributed to identity determination. */
  identityEvidence: readonly string[]
}

/**
 * Quote/price state classification.
 * R1-C: Distinguishes "definitely absent" from "not found yet" from "present".
 */
export enum QuoteState {
  /** Quote found and extracted successfully. */
  Present = 'present',
  /** Evidence that quote does not exist (e.g., "Currently unavailable"). */
  AbsentObserved = 'absent_observed',
  /** Not found in current extraction, may exist elsewhere. */
  Unobserved = 'unobserved',
  /** Multiple conflicting quotes found. */
  Conflicting = 'conflicting'
}

/**
 * Facts a product-detail page asserted about the product it is about.
 * Every field is independently nullable: a page may declare a price and no
 * SKU, and inventing the missing one is worse than reporting null.
 */
export interface ProductFacts {
  name: ProductFact | null
  price: ProductFact | null
  priceCurrency: ProductFact | null
  sku: ProductFact | null
  brand: ProductFact | null
  availability: ProductFact | null
  /** Rich product facts are additive so older extractors remain valid. */
  kind?: 'physical' | 'subscription' | 'unknown'
  subjectId?: ProductFact | null
  prices?: readonly ProductPrice[]
  seller?: ProductFact | null
  deliveryLocation?: ProductFact | null
  rating?: ProductFact | null
  reviewCount?: ProductFact | null
  images?: readonly ProductFact[]
  variants?: readonly ProductVariant[]
  specifications?: Readonly<Record<string, ProductFact>>
  /** R1-B: Multi-evidence identity verification. */
  identity?: ProductIdentity
  /** R1-C: Quote state classification. */
  quoteState?: QuoteState
}

/**
 * A value the page states under its own label: a two-cell table row (a `<th>`
 * label and a `<td>` value) or a definition-list pair (one `<dt>`, one
 * `<dd>`) in the main content. Both texts are as the page shows them, with
 * whitespace collapsed; nothing is normalized.
 */
export interface LabelledValue {
  label: string
  value: string
  /**
   * `table[i] tr[j]` or `dl[i] dt[j]`: zero-based, in document order, the
   * table or list among those in the main content and the row or term in it.
   */
  path: string
}

/**
 * What the page's own markup declares about the page, read from the whole
 * document before cleaning. Each value is that declaration or null when the
 * page makes none: nothing is inferred from the URL, the content or another
 * tag (no `og:description` for a missing description, no `/favicon.ico` for a
 * missing icon).
 */
export interface PageMetadata {
  /**
   * The document's `<title>`, whitespace collapsed as `document.title` does
   * (an SVG `<title>` does not count). Unlike `document.title`, the content
   * title, it never comes from a heading.
   */
  title: string | null
  /** `<meta name="description">`. */
  description: string | null
  /** `<html lang>`; when `<html>` has no lang attribute, `<meta http-equiv="content-language">`. */
  language: string | null
  /** `<meta name="keywords">` as declared, not split. */
  keywords: string | null
  /** `<meta name="robots">`. */
  robots: string | null
  /** The first `<link rel~="icon">` that resolves, against the document base URL, to an http(s) URL. */
  favicon: string | null
  /** The first `<link rel~="canonical">` that resolves to an http(s) URL. */
  canonicalUrl: string | null
}

export interface DocumentExtraction {
  title: string | null
  pageType: PageType
  strategy: ExtractStrategy
  confidence: number
  product: ProductFacts | null
  adapter: AdapterDescriptor
  entities: readonly ExtractedEntity[]
  adapterValidation?: AdapterValidation
  /** Label/value pairs of the main content; JSON extraction matches them to schema keys. */
  labelledValues?: readonly LabelledValue[]
}

/** The rule that decided a page's data is most likely rendered client-side (see RenderSignals). */
export type RenderReason = 'empty_table_with_scripts' | 'empty_app_root' | 'script_shell' | 'js_fallback' | 'hydration_shell' | 'aria_busy'

/** A client-side rendering marker found in the page as received (see RenderSignals). */
export type RenderMarker = 'hydration_state' | 'app_root_empty' | 'noscript_notice' | 'js_fallback_marker' | 'aria_busy'

/**
 * Evidence that a page fills its data in with JavaScript after load, read
 * from the server HTML. A shell with an empty app root, a table with no
 * cells beside kilobytes of script, or an explicit "enable JavaScript"
 * fallback all mean the HTTP capture is not the page a browser shows.
 */
export interface RenderSignals {
  /** Visible text characters after boilerplate cleaning. */
  textChars: number
  /** Characters of inline script in the raw document. */
  scriptChars: number
  /** `<table>` elements with no data cells. */
  emptyTables: number
  /** Markers found in the page as received. */
  markers: readonly RenderMarker[]
  /** True when the signals say the data is most likely rendered client-side. */
  clientRendered: boolean
  /**
   * The rule that decided `clientRendered`, null when false. Every rule pairs
   * a structural gap with script presence; a `noscript` notice alone counts
   * only on a thin page or beside hydration state.
   */
  reason: RenderReason | null
}

export interface ExtractorOutput {
  /** Page title, or null when none could be found. */
  title: string | null
  /** Extracted main content as HTML. Markdown conversion happens later in the pipeline. */
  mainHtml: string
  /**
   * Base URL for the page's relative URLs: the first `<base href>` resolved
   * against `options.url`, else `options.url`. mainHtml is a fragment without
   * the page's `<base>` element, so Markdown conversion takes this instead.
   * Null when no absolute URL is known.
   */
  baseUrl: string | null
  /** The page's own declarations (title, description, language, ...), from the whole document. */
  metadata: PageMetadata
  /** 0..1 self-assessed extraction confidence. */
  confidence: number
  /**
   * True when this page should be routed to a higher tier (LLM/neural).
   * The escalation target is intentionally unimplemented in v0.
   */
  escalate: boolean
  /** Page type the router detected. */
  pageType: PageType
  /**
   * The strategy that produced mainHtml. Independent of pageType: a product
   * page may use the table strategy, a forum thread the article cascade.
   */
  strategy: ExtractStrategy
  /**
   * Product facts, present only when pageType is 'product'. Null on every
   * other page type — an article has no price, and an empty ProductFacts
   * object would read as "we looked and found none".
   */
  product?: ProductFacts | null
  /** Adapter identity and normalized entities are produced directly from HTML. */
  adapter: AdapterDescriptor
  entities: readonly ExtractedEntity[]
  adapterValidation?: AdapterValidation
  /**
   * Tables in the fetched HTML with no rows at all: an empty `<thead>` and
   * `<tbody>` waiting for a script to fill them. The data is not in this HTML.
   */
  emptyTableShells?: number
  /**
   * Data the page declares its scripts will fetch once they run
   * (`<link rel="preload" as="fetch">`). Whatever the scripts build from it,
   * a table or a chart, is not in this HTML.
   */
  fetchPreloads?: number
  /**
   * Client-side rendering signals read from the page as received: whether
   * its data is most likely filled in by scripts after load, and why. A lane
   * that cannot run scripts reads `clientRendered` as a caveat on its
   * capture; one that rendered the page has no use for it.
   */
  render?: RenderSignals
  /** Label/value pairs of the main content (see LabelledValue). */
  labelledValues?: readonly LabelledValue[]
  /** Monotonic extractor stage timings. */
  timings: { parseMs: number; extractMs: number }
}

export interface ExtractorOptions {
  /** Final URL after redirects. Site adapters use it only as an identity signal. */
  url?: string
  /**
   * Prefer less text but correct extraction (tighten thresholds, require a
   * semantic container). Mirrors trafilatura's favor_precision.
   */
  favorPrecision?: boolean
  /** When unsure, prefer more text (loosen thresholds). Mirrors favor_recall. */
  favorRecall?: boolean
  /**
   * Extra CSS selectors to prune from the tree before extraction. Like
   * `includeSelectors`, limited to the selectors that are matched in time
   * proportional to the page (@w2l/extract-tf `invalidSelector`); any other
   * names nothing.
   */
  pruneSelectors?: readonly string[]
  /**
   * CSS selectors naming the only elements to keep. mainHtml is then a
   * `<body>` holding those elements in document order, copied from the page
   * before cleaning and without `pruneSelectors`, and its confidence is 1
   * when they hold any text or image: what the caller named is the content.
   * Nothing matching gives an empty mainHtml. The page type, title, metadata
   * and product facts are still read from the whole page, and `escalate`
   * stays the page's own signal (the cascade found no main content): a lane
   * reads it for its block check and its offer to the browser, and does not
   * fail a selection for it.
   */
  includeSelectors?: readonly string[]
}

export interface Extractor {
  extract(html: string, options?: ExtractorOptions): ExtractorOutput
}
