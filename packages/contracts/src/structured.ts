import type {
  AdapterDescriptor,
  ExtractedEntity,
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
export type ScrapeFormat = 'markdown' | 'links' | 'json' | 'html' | 'rawHtml' | 'images' | 'screenshot' | JsonFormatRequest | AttributesFormatRequest | ScreenshotFormatRequest

export interface StructuredFieldEvidence {
  path: string
  /**
   * `fetch`: the value is the fetch's own (`finalUrl`, `requestedUrl`), not read from the page.
   * `pdf`: a `Label: value` line of a PDF's text; its evidencePath is `page N "label"`.
   */
  source: ProductFactSource | 'hydration' | 'fetch' | 'pdf'
  evidencePath?: string
  /** For a number read from the page's text: that text, whitespace collapsed (`1.299,00 €`), so the reading can be checked. */
  text?: string
}

export type StructuredIssueCode =
  | 'adapter_unavailable'
  | 'subject_unverified'
  | 'field_unavailable'
  /** Page labels matching the field state different values, so none was chosen. */
  | 'field_ambiguous'
  | 'missing_required'
  | 'schema_invalid'
  | 'model_unavailable'
  | 'model_provider_error'
  | 'model_output_invalid'
  | 'model_timeout'
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
