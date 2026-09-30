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
  const?: JsonValue
  description?: string
  additionalProperties?: boolean | JsonSchema
  $defs?: Readonly<Record<string, JsonSchema>>
  /** A nullable or alternative shape, as `anyOf: [{type:'string'},{type:'null'}]` writes it. */
  anyOf?: readonly JsonSchema[]
  oneOf?: readonly JsonSchema[]
  /** Annotations and value constraints are kept for the validator and the model; the mapper ignores them. */
  title?: string
  $schema?: string
  default?: JsonValue
  examples?: readonly JsonValue[]
  format?: string
  pattern?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}

export interface JsonFormatRequest {
  type: 'json'
  schema: JsonSchema
  prompt?: string
  /** Page content leaves the process only when this is explicitly true. */
  modelFallback?: boolean
}

/** String json returns the canonical envelope; an object maps into a caller schema. */
/** `html` is the cleaned content region (the whole cleaned page when onlyMainContent is false); `rawHtml` is the page as the lane received it. */
export type ScrapeFormat = 'markdown' | 'links' | 'json' | 'html' | 'rawHtml' | JsonFormatRequest

export interface StructuredFieldEvidence {
  path: string
  /** Where the value came from; `url` is the request or final URL itself. */
  source: ProductFactSource | 'hydration' | 'url'
  evidencePath?: string
}

export type StructuredIssueCode =
  | 'adapter_unavailable'
  | 'subject_unverified'
  | 'field_unavailable'
  | 'missing_required'
  | 'schema_invalid'
  | 'model_unavailable'
  | 'model_provider_error'
  | 'model_output_invalid'
  | 'model_timeout'

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
