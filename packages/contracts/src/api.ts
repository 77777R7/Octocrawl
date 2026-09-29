/**
 * Native REST contract for scrape + crawl.
 *
 * Request fields match the product CLI. Responses are FetchResult /
 * CrawlReport — no second result enum. Types only.
 */

import type { CrawlMode } from './compliance.js'
import type { CrawlError, CrawlPage, CrawlPageList, CrawlReport } from './crawl.js'
import type { FetchOptions } from './execution.js'
import type { FetchResult, LadderRunAudit } from './result.js'
import { unsafeRegexReason } from './regexSafety.js'
import type { DocumentExtraction } from './extractor.js'
import type { EvidenceRecord } from './evidenceRecord.js'
import type { ScrapeFormat, StructuredExtractionResult } from './structured.js'
import { MAX_FILE_BYTES_CEILING } from './file.js'

export const CRAWL_MODES = ['research', 'standard', 'authed'] as const
export type ApiCrawlMode = (typeof CRAWL_MODES)[number]

/** A scrape's deadline when the request sets no `timeout`, and the largest one it may set. */
export const DEFAULT_SCRAPE_TIMEOUT_MS = 300_000
export const MIN_SCRAPE_TIMEOUT_MS = 1_000
export const MAX_WAIT_FOR_MS = 60_000

/**
 * Per-page capture options shared by scrape, batch and crawl (for batch and
 * crawl they apply to every page).
 */
export interface PageOptions extends FetchOptions {
  /**
   * The whole scrape's deadline in milliseconds, 1 000 to 300 000; default
   * 300 000. When it fires the result is `partial` with the best content a
   * rung produced so far, or `failed` with `timeout`, never an error.
   */
  timeout?: number
}

export interface ScrapeRequest extends PageOptions {
  url: string
  mode?: ApiCrawlMode
  allowlistedDomains?: readonly string[]
  formats?: readonly ScrapeFormat[]
  /** Include outbound links. Kept separate from content formats. */
  includeLinks?: boolean
  /** Omitted preserves the legacy full REST/SDK response. MCP sends false by default. */
  debug?: boolean
}

/** `evidenceRecord` is set on every response the API sends (see evidenceRecord.ts). */
export type ScrapeResponse = FetchResult & LadderRunAudit & { snapshot?: CompactScrapeResponse['snapshot']; evidenceRecord?: EvidenceRecord }

export interface CompactScrapeResponse {
  requestedUrl: string
  finalUrl: string
  /**
   * Small capture identity for field audits; the HTML body remains local.
   * `httpStatus` and `contentType` are the final response's status and
   * `content-type` header (`evidence.httpStatus`, `evidence.contentType`).
   */
  snapshot: { rawBodySha256: string | null; artifacts: readonly string[]; httpStatus: number | null; contentType: string | null }
  /** The result's Evidence Record v1, the same as on the full response. */
  evidenceRecord: EvidenceRecord
  status: FetchResult['status']
  failureReason: FetchResult['failureReason']
  blockReason: FetchResult['blockReason']
  budgetExceeded: FetchResult['budgetExceeded']
  retryAt?: number
  lane: FetchResult['lane']
  formats: readonly ('markdown' | 'links' | 'json')[]
  markdown?: string | null
  links?: readonly string[]
  document?: Pick<DocumentExtraction, 'title' | 'pageType' | 'strategy' | 'confidence' | 'adapter' | 'adapterValidation'> | null
  metadata?: FetchResult['metadata']
  json?: StructuredExtractionResult | null
  /** The file the response was, as on the full response; absent for a web page. */
  file?: FetchResult['file']
  truncated: boolean
  truncatedAt: number | null
  usage: FetchResult['usage'] & { totalMs: number }
  channelsTried: readonly string[]
}

export interface CrawlStartRequest extends PageOptions {
  url: string
  mode?: ApiCrawlMode
  maxPages?: number | null
  maxDepth?: number | null
  useCached?: boolean
  allowlistedDomains?: readonly string[]
  /** Formats for every page, validated as for scrape. Omitted selects Markdown. */
  formats?: readonly ScrapeFormat[]
  /** Include each page's outbound links, like a `links` format. */
  includeLinks?: boolean
  /** Pathname regexes a discovered link must match. The seed URL is always fetched. */
  includePaths?: readonly string[]
  /** Pathname regexes that skip a discovered link; they win over includePaths. */
  excludePaths?: readonly string[]
}

export interface CrawlAccepted {
  taskId: string
}

export interface BatchStartRequest extends PageOptions {
  urls: readonly string[]
  mode?: ApiCrawlMode
  formats?: readonly ScrapeFormat[]
  includeLinks?: boolean
}

export interface BatchStatusResponse extends CrawlReport {
  requested: number
  completed: number
  remaining: number
}

export type CrawlStatusResponse = CrawlReport
export interface CrawlPageQuery {
  attemptId?: string
  cursor?: string
  limit?: number
  debug?: boolean
}
export type CrawlPagesResponse = CrawlPageList<CrawlPage>
export type CrawlErrorsResponse = CrawlPageList<CrawlError>

export function isApiCrawlMode(value: string): value is ApiCrawlMode {
  return (CRAWL_MODES as readonly string[]).includes(value)
}

export function defaultApiMode(mode: CrawlMode | undefined): ApiCrawlMode {
  return mode === 'research' || mode === 'authed' ? mode : 'standard'
}

/**
 * The one set of request-error codes, shared by the REST API, /fc, the SDK and
 * MCP. A request error means W2L refused or failed the request itself; what
 * happened to a fetched page is its result status (blocked, failed, ...), not
 * one of these.
 */
export const API_ERROR_CODES = ['invalid_json', 'invalid_request', 'unsupported_parameter', 'unsupported_format', 'unauthorized', 'not_found', 'conflict', 'internal_error'] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** The HTTP status each code is returned with. */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, 400 | 401 | 404 | 409 | 500>> = {
  invalid_json: 400,
  invalid_request: 400,
  unsupported_parameter: 400,
  unsupported_format: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  internal_error: 500,
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (API_ERROR_CODES as readonly unknown[]).includes(value)
}

/** What a request named that W2L cannot honour, as sent (for example `scrapeOptions.actions`). */
export interface ApiErrorDetails {
  parameters?: readonly string[]
  formats?: readonly string[]
}

/** Native error body. /fc sends the same fields after `success: false`. */
export interface ApiErrorBody {
  error: string
  code: ApiErrorCode
  details?: ApiErrorDetails
}

export class RequestError extends Error {
  readonly status = 400
  constructor(
    message: string,
    readonly code: 'invalid_request' | 'unsupported_parameter' | 'unsupported_format' = 'invalid_request',
    readonly details?: ApiErrorDetails,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError('body must be a JSON object')
  }
  return body as Record<string, unknown>
}

const PAGE_KEYS = ['onlyMainContent', 'waitFor', 'timeout', 'maxFileBytes'] as const
const SCRAPE_KEYS = ['url', 'mode', 'allowlistedDomains', 'formats', 'includeLinks', 'debug', ...PAGE_KEYS] as const
const CRAWL_KEYS = ['url', 'mode', 'maxPages', 'maxDepth', 'useCached', 'allowlistedDomains', 'formats', 'includeLinks', 'includePaths', 'excludePaths', ...PAGE_KEYS] as const
const BATCH_KEYS = ['urls', 'mode', 'formats', 'includeLinks', ...PAGE_KEYS] as const

/** An option W2L does not know is an error, never silently dropped. */
function rejectUnknownKeys(rec: Record<string, unknown>, known: readonly string[]): void {
  const unknown = Object.keys(rec).filter((key) => rec[key] !== undefined && !known.includes(key))
  if (unknown.length > 0) {
    throw new RequestError(`unsupported ${unknown.length === 1 ? 'parameter' : 'parameters'}: ${unknown.join(', ')} (supported: ${known.join(', ')})`, 'unsupported_parameter', { parameters: unknown })
  }
}

function readUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new RequestError('url is required')
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new RequestError('url must be http(s)')
    }
  } catch (err) {
    if (err instanceof RequestError) throw err
    throw new RequestError('url must be http(s)')
  }
  return value
}

function readMode(value: unknown): ApiCrawlMode | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !isApiCrawlMode(value)) {
    throw new RequestError('mode must be standard, research, or authed')
  }
  return value
}

function readAllowlist(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new RequestError('allowlistedDomains must be an array of strings')
  }
  return value.filter((item) => item.length > 0)
}

/** What extraction maps values by. */
const SCHEMA_STRUCTURE = ['type', 'properties', 'required', 'items', 'additionalProperties', 'enum', 'const', '$ref', '$defs', 'definitions', 'anyOf', 'oneOf']
/** Assertions checked on the result, never used to fill a value in. */
const SCHEMA_NUMBERS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']
const SCHEMA_COUNTS = ['minLength', 'maxLength', 'minItems', 'maxItems']
/** Accepted and not acted on: `default` is never filled in and `format` is not checked. */
const SCHEMA_ANNOTATIONS = ['title', 'description', '$comment', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'format']
/** Accepted at the root only. */
const SCHEMA_ROOT = ['$schema', '$id']
const SCHEMA_KEYS = new Set([...SCHEMA_STRUCTURE, ...SCHEMA_NUMBERS, ...SCHEMA_COUNTS, 'pattern', 'uniqueItems', ...SCHEMA_ANNOTATIONS])
const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const PRIMITIVE_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])
/** The dialects whose meaning of these keywords W2L follows. */
const SCHEMA_DIALECTS = /^https?:\/\/json-schema\.org\/(?:draft-07\/schema|draft\/2019-09\/schema|draft\/2020-12\/schema)#?$/

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function schemaTypeList(value: unknown): readonly unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

/** The keys of a node other than annotations, root keywords and definitions: what it asserts. */
function assertingKeys(rec: Record<string, unknown>): string[] {
  return Object.keys(rec).filter(key => !SCHEMA_ANNOTATIONS.includes(key) && !SCHEMA_ROOT.includes(key) && key !== '$defs' && key !== 'definitions')
}

/** `{ type: 'null' }`, with annotations at most. */
function isNullSchema(value: unknown): boolean {
  if (!isSchemaObject(value)) return false
  const types = schemaTypeList(value.type)
  return types.length === 1 && types[0] === 'null' && assertingKeys(value).every(key => key === 'type')
}

/** A schema for one or more primitive types or constants: no object, array, reference or union. */
function isPrimitiveSchema(value: unknown): boolean {
  if (!isSchemaObject(value)) return false
  if (['$ref', 'anyOf', 'oneOf', 'properties', 'items', 'additionalProperties', 'required'].some(key => value[key] !== undefined)) return false
  const types = schemaTypeList(value.type)
  return types.length > 0 ? types.every(type => typeof type === 'string' && PRIMITIVE_TYPES.has(type)) : value.const !== undefined || value.enum !== undefined
}

/** The node a local `$ref` names, or undefined. */
function localTarget(root: unknown, ref: string): unknown {
  let value = root
  for (const part of ref === '#' ? [] : ref.slice(2).split('/')) {
    if (!isSchemaObject(value)) return undefined
    let key: string
    try {
      key = decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')
    } catch {
      return undefined
    }
    value = value[key]
  }
  return value
}

/**
 * The JSON Schema subset W2L extraction honours (JsonSchema in structured.ts),
 * bounded to 64 KiB, 8 levels and 100 properties. A keyword outside it is
 * refused as unsupported_parameter, named with its place in the request
 * (`at`, such as `formats[1].schema`); a malformed value as invalid_request.
 */
function readSchema(value: unknown, at = 'schema'): import('./structured.js').JsonSchema {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength
  if (bytes > 64 * 1024) throw new RequestError('json schema must be at most 64 KiB')
  let properties = 0
  const refs: Array<[string, string]> = []
  const unsupported = (where: string, key: string, why: string): never => {
    throw new RequestError(`unsupported json schema keyword: ${key} at ${where} (${why})`, 'unsupported_parameter', { parameters: [`${where}.${key}`] })
  }
  const invalid = (where: string, message: string): never => {
    throw new RequestError(`json schema ${message} (at ${where})`)
  }
  const visit = (node: unknown, depth: number, where: string): void => {
    if (depth > 8) invalid(where, 'must be at most 8 levels deep')
    if (!isSchemaObject(node)) return invalid(where, 'nodes must be objects')
    const rec = node
    for (const key of Object.keys(rec)) {
      if (SCHEMA_ROOT.includes(key)) {
        if (depth > 0) unsupported(where, key, 'only the root may declare it')
      } else if (!SCHEMA_KEYS.has(key)) {
        unsupported(where, key, 'W2L extraction does not support it')
      }
    }
    if (rec.$schema !== undefined && (typeof rec.$schema !== 'string' || !SCHEMA_DIALECTS.test(rec.$schema))) {
      unsupported(where, '$schema', `W2L follows JSON Schema draft-07, 2019-09 and 2020-12, not ${JSON.stringify(rec.$schema)}`)
    }
    if (rec.$id !== undefined && typeof rec.$id !== 'string') invalid(where, '$id must be a string')
    if (rec.$ref !== undefined) {
      if (typeof rec.$ref !== 'string' || (rec.$ref !== '#' && !rec.$ref.startsWith('#/'))) invalid(where, 'only supports local $ref')
      const beside = assertingKeys(rec).find(key => key !== '$ref')
      if (beside !== undefined) unsupported(where, beside, 'beside $ref, which may carry only annotations')
      refs.push([rec.$ref as string, where])
    }
    if (rec.type !== undefined) {
      const types = schemaTypeList(rec.type)
      if (types.length === 0 || types.some(type => typeof type !== 'string' || !SCHEMA_TYPES.has(type))) invalid(where, 'contains an unsupported type')
    }
    if (rec.required !== undefined && (!Array.isArray(rec.required) || rec.required.some(item => typeof item !== 'string'))) invalid(where, 'required must be an array of strings')
    if (rec.enum !== undefined && !Array.isArray(rec.enum)) invalid(where, 'enum must be an array')
    for (const key of SCHEMA_NUMBERS) {
      const number = rec[key]
      if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || (key === 'multipleOf' && number <= 0))) invalid(where, `${key} must be a ${key === 'multipleOf' ? 'positive ' : ''}number`)
    }
    for (const key of SCHEMA_COUNTS) {
      const count = rec[key]
      if (count !== undefined && (typeof count !== 'number' || !Number.isInteger(count) || count < 0)) invalid(where, `${key} must be a non-negative integer`)
    }
    if (rec.pattern !== undefined) {
      if (typeof rec.pattern !== 'string' || rec.pattern.length > 2000) invalid(where, 'pattern must be a regular expression of at most 2000 characters')
      try {
        new RegExp(rec.pattern as string, 'u')
      } catch {
        invalid(where, `pattern is not a valid regular expression: ${rec.pattern as string}`)
      }
      const unsafe = unsafeRegexReason(rec.pattern as string)
      if (unsafe !== null) invalid(where, `pattern can take too long to match (${unsafe}): ${rec.pattern as string}`)
    }
    for (const key of ['title', 'description', '$comment', 'format']) if (rec[key] !== undefined && typeof rec[key] !== 'string') invalid(where, `${key} must be a string`)
    for (const key of ['uniqueItems', 'deprecated', 'readOnly', 'writeOnly']) if (rec[key] !== undefined && typeof rec[key] !== 'boolean') invalid(where, `${key} must be a boolean`)
    if (rec.examples !== undefined && !Array.isArray(rec.examples)) invalid(where, 'examples must be an array')
    if (rec.properties !== undefined) {
      if (!isSchemaObject(rec.properties)) invalid(where, 'properties must be an object')
      for (const [name, child] of Object.entries(rec.properties as Record<string, unknown>)) { properties++; visit(child, depth + 1, `${where}.properties.${name}`) }
    }
    if (properties > 100) throw new RequestError('json schema must contain at most 100 properties')
    if (rec.items !== undefined) {
      if (!isSchemaObject(rec.items)) invalid(where, 'items must be one schema')
      visit(rec.items, depth + 1, `${where}.items`)
    }
    if (rec.additionalProperties !== undefined && typeof rec.additionalProperties !== 'boolean') visit(rec.additionalProperties, depth + 1, `${where}.additionalProperties`)
    for (const key of ['$defs', 'definitions']) {
      if (rec[key] === undefined) continue
      if (!isSchemaObject(rec[key])) invalid(where, `${key} must be an object`)
      for (const [name, child] of Object.entries(rec[key] as Record<string, unknown>)) visit(child, depth + 1, `${where}.${key}.${name}`)
    }
    for (const key of ['anyOf', 'oneOf']) {
      const branches = rec[key]
      if (branches === undefined) continue
      if (!Array.isArray(branches) || branches.length === 0) invalid(where, `${key} must be a non-empty array of schemas`)
      const beside = assertingKeys(rec).find(other => other !== key)
      if (beside !== undefined) unsupported(where, beside, `beside ${key}, which may carry only annotations`)
      // Extraction maps a value by one schema: a schema or null, or primitive types.
      const union = branches as unknown[]
      const nullable = union.length === 2 && union.some(isNullSchema)
      if (!nullable && !union.every(isPrimitiveSchema)) unsupported(where, key, 'W2L maps a schema-or-null union or a union of primitive types, not a union of objects, arrays or references')
      union.forEach((branch, index) => visit(branch, depth + 1, `${where}.${key}[${index}]`))
    }
  }
  visit(value, 0, at)
  for (const [ref, where] of refs) {
    // A reference may name another reference, but must end at a schema.
    let target = localTarget(value, ref)
    const seen = new Set<unknown>()
    while (isSchemaObject(target) && typeof target.$ref === 'string') {
      if (seen.has(target)) invalid(where, `$ref ${ref} leads only to itself`)
      seen.add(target)
      target = localTarget(value, target.$ref)
    }
    if (!isSchemaObject(target)) invalid(where, `$ref does not resolve: ${ref}`)
  }
  return value as import('./structured.js').JsonSchema
}

const FORMAT_NAMES: readonly string[] = ['markdown', 'links', 'json']

function readFormats(value: unknown): readonly ScrapeFormat[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) throw new RequestError('formats must be a non-empty array')
  // Name every unsupported format (string or {type}) before any other check.
  const unsupported = new Set<string>()
  for (const item of value) {
    const type: unknown = item !== null && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>).type : item
    if (typeof type === 'string' && !FORMAT_NAMES.includes(type)) unsupported.add(type)
  }
  if (unsupported.size > 0) {
    throw new RequestError(`unsupported ${unsupported.size === 1 ? 'format' : 'formats'}: ${[...unsupported].join(', ')} (supported: ${FORMAT_NAMES.join(', ')})`, 'unsupported_format', { formats: [...unsupported] })
  }
  const formats: ScrapeFormat[] = []
  const logical = new Set<string>()
  for (const [index, item] of value.entries()) {
    if (item === 'markdown' || item === 'links' || item === 'json') {
      if (logical.has(item)) throw new RequestError('formats must not contain duplicates')
      logical.add(item)
      formats.push(item)
      continue
    }
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new RequestError('formats entries must be markdown, links, json, or a json schema request')
    const rec = item as Record<string, unknown>
    for (const key of Object.keys(rec)) if (!['type', 'schema', 'prompt', 'modelFallback'].includes(key)) throw new RequestError(`unsupported json format option: ${key}`)
    if (rec.type !== 'json' || rec.schema === undefined) throw new RequestError('json format requires type=json and schema')
    if (logical.has('json')) throw new RequestError('formats must contain at most one json entry')
    if (rec.prompt !== undefined && (typeof rec.prompt !== 'string' || rec.prompt.length > 4000)) throw new RequestError('json prompt must be a string of at most 4000 characters')
    if (rec.modelFallback !== undefined && typeof rec.modelFallback !== 'boolean') throw new RequestError('json modelFallback must be a boolean')
    logical.add('json')
    formats.push({
      type: 'json' as const,
      schema: readSchema(rec.schema, `formats[${index}].schema`),
      ...(rec.prompt === undefined ? {} : { prompt: rec.prompt }),
      ...(rec.modelFallback === undefined ? {} : { modelFallback: rec.modelFallback }),
    })
  }
  return formats
}

function readBound(value: unknown, name: string, min: number): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new RequestError(`${name} must be a number >= ${min}`)
  }
  return value
}

/**
 * Pathname regexes with Firecrawl's documented bounds: at most 1000 patterns
 * of at most 2000 characters, none that can backtrack catastrophically
 * (unsafeRegexReason).
 */
function readPathPatterns(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 1000 || value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 2000)) {
    throw new RequestError(`${name} must be an array of at most 1000 regular expressions of 1 to 2000 characters`)
  }
  const patterns = value as string[]
  for (const pattern of patterns) {
    try {
      new RegExp(pattern)
    } catch {
      throw new RequestError(`${name} contains an invalid regular expression: ${pattern}`)
    }
    const unsafe = unsafeRegexReason(pattern)
    if (unsafe !== null) throw new RequestError(`${name} contains a regular expression that can take too long to match (${unsafe}): ${pattern}`)
  }
  return patterns
}

function readMilliseconds(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RequestError(`${name} must be an integer number of milliseconds from ${min} to ${max}`)
  }
  return value
}

/** onlyMainContent, waitFor, timeout and maxFileBytes, shared by scrape, batch and crawl. */
function readPageOptions(rec: Record<string, unknown>): PageOptions {
  if (rec.onlyMainContent !== undefined && typeof rec.onlyMainContent !== 'boolean') throw new RequestError('onlyMainContent must be a boolean')
  const maxFileBytes = rec.maxFileBytes
  if (maxFileBytes !== undefined && (typeof maxFileBytes !== 'number' || !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > MAX_FILE_BYTES_CEILING)) {
    throw new RequestError(`maxFileBytes must be an integer number of bytes from 1 to ${MAX_FILE_BYTES_CEILING}`)
  }
  return {
    onlyMainContent: rec.onlyMainContent as boolean | undefined,
    waitFor: readMilliseconds(rec.waitFor, 'waitFor', 0, MAX_WAIT_FOR_MS),
    timeout: readMilliseconds(rec.timeout, 'timeout', MIN_SCRAPE_TIMEOUT_MS, DEFAULT_SCRAPE_TIMEOUT_MS),
    ...(maxFileBytes === undefined ? {} : { maxFileBytes: maxFileBytes as number }),
  }
}

export function parseScrapeRequest(body: unknown): ScrapeRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, SCRAPE_KEYS)
  if (rec.debug !== undefined && typeof rec.debug !== 'boolean') throw new RequestError('debug must be a boolean')
  if (rec.includeLinks !== undefined && typeof rec.includeLinks !== 'boolean') throw new RequestError('includeLinks must be a boolean')
  return {
    url: readUrl(rec.url),
    mode: readMode(rec.mode),
    allowlistedDomains: readAllowlist(rec.allowlistedDomains),
    formats: readFormats(rec.formats),
    includeLinks: rec.includeLinks as boolean | undefined,
    debug: rec.debug as boolean | undefined,
    ...readPageOptions(rec),
  }
}

export function parseCrawlStartRequest(body: unknown): CrawlStartRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, CRAWL_KEYS)
  const useCached = rec.useCached
  if (useCached !== undefined && typeof useCached !== 'boolean') {
    throw new RequestError('useCached must be a boolean')
  }
  if (rec.includeLinks !== undefined && typeof rec.includeLinks !== 'boolean') throw new RequestError('includeLinks must be a boolean')
  return {
    url: readUrl(rec.url),
    mode: readMode(rec.mode),
    maxPages: readBound(rec.maxPages, 'maxPages', 1),
    maxDepth: readBound(rec.maxDepth, 'maxDepth', 0),
    useCached,
    allowlistedDomains: readAllowlist(rec.allowlistedDomains),
    formats: readFormats(rec.formats),
    includeLinks: rec.includeLinks as boolean | undefined,
    includePaths: readPathPatterns(rec.includePaths, 'includePaths'),
    excludePaths: readPathPatterns(rec.excludePaths, 'excludePaths'),
    ...readPageOptions(rec),
  }
}

export function parseBatchStartRequest(body: unknown): BatchStartRequest {
  const rec = asRecord(body)
  rejectUnknownKeys(rec, BATCH_KEYS)
  if (!Array.isArray(rec.urls) || rec.urls.length < 1 || rec.urls.length > 1000) {
    throw new RequestError('urls must contain 1 to 1000 URLs')
  }
  const urls = rec.urls.map(readUrl)
  if (new Set(urls.map(url => new URL(url).href)).size !== urls.length) throw new RequestError('urls must be unique')
  if (rec.includeLinks !== undefined && typeof rec.includeLinks !== 'boolean') throw new RequestError('includeLinks must be a boolean')
  return { urls, mode: readMode(rec.mode), formats: readFormats(rec.formats), includeLinks: rec.includeLinks as boolean | undefined, ...readPageOptions(rec) }
}

export function parseCrawlPageQuery(query: Record<string, string | undefined>): CrawlPageQuery {
  const limitValue = query.limit
  const limit = limitValue === undefined ? undefined : Number(limitValue)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) {
    throw new RequestError('limit must be an integer between 1 and 1000')
  }
  if (query.cursor !== undefined && query.cursor.length === 0) throw new RequestError('cursor must not be empty')
  if (query.attemptId !== undefined && query.attemptId.length === 0) throw new RequestError('attemptId must not be empty')
  if (query.debug !== undefined && query.debug !== 'true' && query.debug !== 'false') throw new RequestError('debug must be true or false')
  return { cursor: query.cursor, limit, attemptId: query.attemptId, debug: query.debug === undefined ? undefined : query.debug === 'true' }
}
