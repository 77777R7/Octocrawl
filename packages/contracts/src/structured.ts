import type {
  AdapterDescriptor,
  ExtractedEntity,
  ProductFactSource,
} from './extractor.js'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/** The deliberately small JSON Schema subset accepted by scrape. */
export interface JsonSchema {
  $ref?: string
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | readonly ('object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null')[]
  properties?: Readonly<Record<string, JsonSchema>>
  required?: readonly string[]
  items?: JsonSchema
  enum?: readonly JsonValue[]
  description?: string
  additionalProperties?: boolean | JsonSchema
  $defs?: Readonly<Record<string, JsonSchema>>
}

export interface JsonFormatRequest {
  type: 'json'
  schema: JsonSchema
  prompt?: string
  /** Page content leaves the process only when this is explicitly true. */
  modelFallback?: boolean
}

/** String json returns the canonical envelope; an object maps into a caller schema. */
export type ScrapeFormat = 'markdown' | 'links' | 'json' | JsonFormatRequest

export interface StructuredFieldEvidence {
  path: string
  /** `pdf`: a `Label: value` line of a PDF's text; its evidencePath is `page N "label"`. */
  source: ProductFactSource | 'hydration' | 'pdf'
  evidencePath?: string
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
