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

/**
 * String json returns the canonical envelope; an object maps into a caller schema.
 * `html` is the cleaned HTML the Markdown is written from (the main content,
 * the whole page when onlyMainContent is false, or an includeTags selection);
 * `rawHtml` is the page as the lane received it. `images` is every image URL
 * of the whole document, and an attributes entry reads named attributes off
 * the elements its selectors match.
 */
export type ScrapeFormat = 'markdown' | 'links' | 'json' | 'html' | 'rawHtml' | 'images' | JsonFormatRequest | AttributesFormatRequest

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
