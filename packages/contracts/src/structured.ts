import type {
  AdapterDescriptor,
  ExtractedEntity,
  FactContext,
  ProductFactSource,
} from './extractor.js'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/**
 * The JSON Schema subset accepted by scrape (`readSchema` in api.ts checks
 * it): the structure extraction maps, the assertions it checks on the result
 * and annotations it ignores. `default` is never filled in and `format` is
 * not checked.
 */
export interface JsonSchema {
  /** Root only: draft-07, 2019-09 or 2020-12. */
  $schema?: string
  /** Root only. */
  $id?: string
  $ref?: string
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | readonly ('object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null')[]
  properties?: Readonly<Record<string, JsonSchema>>
  required?: readonly string[]
  items?: JsonSchema
  enum?: readonly JsonValue[]
  const?: JsonValue
  /** A schema and `{ type: 'null' }`, or primitive types only. */
  anyOf?: readonly JsonSchema[]
  oneOf?: readonly JsonSchema[]
  additionalProperties?: boolean | JsonSchema
  $defs?: Readonly<Record<string, JsonSchema>>
  definitions?: Readonly<Record<string, JsonSchema>>
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  title?: string
  description?: string
  $comment?: string
  default?: JsonValue
  examples?: readonly JsonValue[]
  deprecated?: boolean
  readOnly?: boolean
  writeOnly?: boolean
  format?: string
}

export interface JsonFormatRequest {
  type: 'json'
  schema: JsonSchema
  prompt?: string
  /** Page content leaves the process only when this is explicitly true. */
  modelFallback?: boolean
}

/** One CSS selector and the HTML attribute to read from every element it matches (the `attributes` format). */
export interface AttributeSelector {
  /** A non-empty selector of at most 200 characters, within what W2L matches (`invalidSelector`), like `includeTags`. */
  selector: string
  /** An HTML attribute name: `^[A-Za-z_][A-Za-z0-9_:.-]*$`, at most 100 characters. */
  attribute: string
}

/** Firecrawl's `{ type: 'attributes', selectors }`: 1 to 50 selectors, at most one such entry per request. */
export interface AttributesFormatRequest {
  type: 'attributes'
  selectors: readonly AttributeSelector[]
}

/** One column of a `list` format: what to read from each record. */
export interface ListField {
  /** The column's name: 1 to 64 characters, unique within the format. */
  name: string
  /** A selector matched within the record (the first match, in document order); omitted, the record element itself. */
  selector?: string
  /** An HTML attribute to read instead of the text (`href`, `src`, `data-sku`, ...); a link or source is made absolute. */
  attribute?: string
}

/**
 * W2L's `{ type: 'list', itemSelector, fields }`: every element `itemSelector`
 * matches is a record (one nested in another matched one is not a record of
 * its own), and each field is read from it. At most one such entry per request.
 * Without `itemSelector` W2L finds the page's list itself, and without
 * `fields` the fields its items hold (`fields` needs an `itemSelector`):
 * what it chose is the result's `itemSelector` and `detected.fields`.
 */
export interface ListFormatRequest {
  type: 'list'
  itemSelector?: string
  /** 1 to 50 fields. */
  fields?: readonly ListField[]
}

/** A list format with its items and fields named: as asked, or as W2L found them on the page. */
export interface ListSpec {
  type: 'list'
  itemSelector: string
  fields: readonly ListField[]
}

/** The window a screenshot is taken at, in CSS pixels: integers within the declared screen (`readFormats` checks 320..1920 by 240..1080, the desktop identity's 1920x1080 screen). */
export interface ScreenshotViewport {
  width: number
  height: number
}

/**
 * What a screenshot entry asks of the browser lane. Every field is optional:
 * the string `screenshot` alone is a PNG of the declared viewport (1280x800
 * for the desktop identity). `fullPage` captures the document's whole height
 * at the viewport's width, without scrolling first; `quality` (1 to 100)
 * gives a JPEG at that quality instead of a PNG; `viewport` lays the page out
 * in that window, a size within the declared screen and not a change of the
 * identity (User-Agent, client hints, locale, time zone, screen and scale
 * factor stay as declared).
 */
export interface ScreenshotOptions {
  fullPage?: boolean
  quality?: number
  viewport?: ScreenshotViewport
}

/** Firecrawl's `{ type: 'screenshot', fullPage, quality, viewport }`: at most one screenshot entry per request; the strings `screenshot` and `screenshot@fullPage` (Firecrawl v1's full-page spelling) are its shorthands. */
export interface ScreenshotFormatRequest extends ScreenshotOptions {
  type: 'screenshot'
}

/**
 * String json returns the canonical envelope; an object maps into a caller schema.
 * `html` is the cleaned HTML the Markdown is written from (the main content,
 * the whole page when onlyMainContent is false, or an includeTags selection);
 * `rawHtml` is the page as the lane received it. `images` is every image URL
 * of the whole document, an attributes entry reads named attributes off the
 * elements its selectors match, and `screenshot` (or a screenshot entry)
 * captures the rendered page as an image on the browser lane.
 */
export type ScrapeFormat = 'markdown' | 'links' | 'json' | 'html' | 'rawHtml' | 'images' | 'tables' | 'screenshot' | JsonFormatRequest | AttributesFormatRequest | ScreenshotFormatRequest | ListFormatRequest

export interface StructuredFieldEvidence {
  path: string
  /**
   * `fetch`: the value is the fetch's own (`finalUrl`, `requestedUrl`), not read from the page.
   * `pdf`: a `Label: value` line of a PDF's text; its evidencePath is `page N "label"`.
   */
  source: ProductFactSource | 'hydration' | 'fetch' | 'pdf'
  evidencePath?: string
  /**
   * For a number read from the page's text: that text, whitespace collapsed (`1.299,00 €`), so the reading can be checked.
   * For a value the model wrote: the page text it was located in, as written (`In Stock` for `in_stock`).
   */
  text?: string
  /** For a number read from page text, or a number or an ISO date the model wrote: the value `text` was read as. */
  normalized?: number | string
  /** For a number read from page text: the rule it was read by (`number/decimal`, `number/language:de`; numbers.ts). */
  conversion?: string
  /**
   * What stands beside `text` on the page, as written: a currency or unit next to a number (the currency the same
   * declaration states for a declared price), a date in the same line, the delivery region a price is for, and what
   * the fact holds for (FactContext: variant, offer type, a document's version and dates).
   */
  context?: { currency?: string; unit?: string; date?: string; region?: string } & FactContext
  /**
   * Where a `context` entry the value's table states was read, for a number read from a selected table row: the
   * unit (as written, such as a caption `Units of Foreign Currencies per Australian Dollar` or a header's `(Km²)`)
   * and the as-of date (`context.date` holds its ISO day), each with the page's text it was read from and where
   * that text stands (`table caption`, a column header, a block just before the table).
   */
  contextEvidence?: { unit?: StructuredContextEvidence; date?: StructuredContextEvidence }
  /** The page states there is no value (`text`, such as "N/A"): the value is null for that reason, not for want of a source. */
  absent?: true
}

/** The page's text a context entry was read from, whitespace collapsed, and where it stands. */
export interface StructuredContextEvidence {
  text: string
  evidencePath: string
}

export type StructuredIssueCode =
  | 'adapter_unavailable'
  | 'subject_unverified'
  | 'field_unavailable'
  /** The page states there is no value for the field ("N/A"): it is null or left out on the page's word, not unobserved. */
  | 'field_absent'
  /** Page labels matching the field state different values, so none was chosen. */
  | 'field_ambiguous'
  | 'missing_required'
  | 'schema_invalid'
  | 'model_unavailable'
  | 'model_provider_error'
  | 'model_output_invalid'
  | 'model_timeout'
  /** A value the model wrote that the page does not state (or states only for another product): the field is left out. */
  | 'model_unsupported'
  /** The page status is neither `success` nor `partial`, so no fields were read from it. */
  | 'page_unsuccessful'
  /** The page is `partial` (a timeout ended the scrape): fields come from the content fetched so far, never a complete result. */
  | 'page_partial'

export interface StructuredExtractionIssue {
  code: StructuredIssueCode
  message: string
  path?: string
}

export interface StructuredModelUsage {
  model: string
  attempts: number
  inputTokens: number | null
  outputTokens: number | null
  /** Unknown provider pricing stays unknown. */
  externalCostUsd: number | null
  /**
   * True when the request used strict structured outputs with a strict-safe
   * schema W2L derived from the caller's; false when it sent the caller's
   * schema without strict mode, which cannot express it (`strictReason`).
   */
  strict?: boolean
  strictReason?: string
}

export interface CanonicalStructuredData {
  adapter: AdapterDescriptor
  pageType: string
  entities: readonly ExtractedEntity[]
}

export interface StructuredExtractionResult {
  status: 'complete' | 'incomplete' | 'invalid'
  data: JsonValue | CanonicalStructuredData | null
  /** Present for a caller supplied schema; omitted for canonical entity JSON. */
  schemaSha256?: string
  evidence: readonly StructuredFieldEvidence[]
  issues: readonly StructuredExtractionIssue[]
  modelUsage?: StructuredModelUsage | null
}
