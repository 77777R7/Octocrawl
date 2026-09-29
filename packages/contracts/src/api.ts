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
import type { DocumentExtraction } from './extractor.js'
import type { ScrapeFormat, StructuredExtractionResult } from './structured.js'

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

export type ScrapeResponse = FetchResult & LadderRunAudit & { snapshot?: CompactScrapeResponse['snapshot'] }

export interface CompactScrapeResponse {
  requestedUrl: string
  finalUrl: string
  /** Small capture identity for field audits; the HTML body remains local. */
  snapshot: { rawBodySha256: string | null; artifacts: readonly string[]; httpStatus: number | null }
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

const PAGE_KEYS = ['onlyMainContent', 'waitFor', 'timeout'] as const
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

const SCHEMA_KEYS = new Set(['$ref', 'type', 'properties', 'required', 'items', 'enum', 'description', 'additionalProperties', '$defs'])
const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

function readSchema(value: unknown): import('./structured.js').JsonSchema {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength
  if (bytes > 64 * 1024) throw new RequestError('json schema must be at most 64 KiB')
  let properties = 0
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8) throw new RequestError('json schema must be at most 8 levels deep')
    if (node === null || typeof node !== 'object' || Array.isArray(node)) throw new RequestError('json schema nodes must be objects')
    const rec = node as Record<string, unknown>
    for (const key of Object.keys(rec)) if (!SCHEMA_KEYS.has(key)) throw new RequestError(`unsupported json schema keyword: ${key}`)
    if (rec.$ref !== undefined && (typeof rec.$ref !== 'string' || !rec.$ref.startsWith('#/'))) throw new RequestError('json schema only supports local $ref')
    if (rec.type !== undefined) {
      const types = Array.isArray(rec.type) ? rec.type : [rec.type]
      if (types.some(type => typeof type !== 'string' || !SCHEMA_TYPES.has(type))) throw new RequestError('json schema contains an unsupported type')
    }
    if (rec.required !== undefined && (!Array.isArray(rec.required) || rec.required.some(item => typeof item !== 'string'))) throw new RequestError('json schema required must be an array of strings')
    if (rec.enum !== undefined && !Array.isArray(rec.enum)) throw new RequestError('json schema enum must be an array')
    if (rec.description !== undefined && typeof rec.description !== 'string') throw new RequestError('json schema description must be a string')
    if (rec.properties !== undefined) {
      if (rec.properties === null || typeof rec.properties !== 'object' || Array.isArray(rec.properties)) throw new RequestError('json schema properties must be an object')
      for (const child of Object.values(rec.properties as Record<string, unknown>)) { properties++; visit(child, depth + 1) }
    }
    if (properties > 100) throw new RequestError('json schema must contain at most 100 properties')
    if (rec.items !== undefined) visit(rec.items, depth + 1)
    if (typeof rec.additionalProperties === 'object' && rec.additionalProperties !== null) visit(rec.additionalProperties, depth + 1)
    if (rec.$defs !== undefined) {
      if (rec.$defs === null || typeof rec.$defs !== 'object' || Array.isArray(rec.$defs)) throw new RequestError('json schema $defs must be an object')
      for (const child of Object.values(rec.$defs as Record<string, unknown>)) visit(child, depth + 1)
    }
  }
  visit(value, 0)
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
  for (const item of value) {
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
      schema: readSchema(rec.schema),
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

/** Pathname regexes with Firecrawl's documented bounds: at most 1000 patterns of at most 2000 characters. */
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

/** onlyMainContent, waitFor and timeout, shared by scrape, batch and crawl. */
function readPageOptions(rec: Record<string, unknown>): PageOptions {
  if (rec.onlyMainContent !== undefined && typeof rec.onlyMainContent !== 'boolean') throw new RequestError('onlyMainContent must be a boolean')
  return {
    onlyMainContent: rec.onlyMainContent as boolean | undefined,
    waitFor: readMilliseconds(rec.waitFor, 'waitFor', 0, MAX_WAIT_FOR_MS),
    timeout: readMilliseconds(rec.timeout, 'timeout', MIN_SCRAPE_TIMEOUT_MS, DEFAULT_SCRAPE_TIMEOUT_MS),
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
