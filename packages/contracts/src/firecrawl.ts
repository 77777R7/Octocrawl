/**
 * Firecrawl v1 scrape/crawl snapshot, frozen 2026-09-18.
 *
 * A one-shot migration shim: map the two main paths onto the native
 * contract. Not a compatibility layer. A parameter or format the shim cannot
 * honour is rejected by name (HTTP 400, success: false), never ignored.
 */

import type { CrawlAccepted, CrawlStartRequest, ScrapeRequest } from './api.js'
import { parseCrawlStartRequest, parseScrapeRequest, RequestError } from './api.js'
import type { CrawlReport } from './crawl.js'
import type { FetchResult } from './result.js'
import type { StepRecord, TaskStatus } from './checkpoint.js'

export const FIRECRAWL_SHIM_SNAPSHOT = {
  capturedAt: '2026-09-18',
  apiVersion: 'v1' as const,
  docs: {
    scrape: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/scrape',
    crawl: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-post',
    crawlStatus: 'https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-get',
  },
  paths: ['/scrape', '/crawl', '/crawl/:id'] as const,
  notCovered: ['search', 'interact', 'agent', 'monitor', 'map', 'extract'] as const,
}

export const FIRECRAWL_SHIM_DIFFS = [
  'Challenge / block pages are success: false (Firecrawl often returns them as success markdown).',
  'No fire-engine, proxy pools, actions, JSON extract, or screenshots.',
  'Resume / cache defaults to refetch (useCached is never set from a Firecrawl body).',
  'Omitted limit / maxDepth stay unbounded; Firecrawl defaults are 10000 / 10.',
  'maxDepth counts link hops from the start URL (Firecrawl calls that maxDiscoveryDepth); Firecrawl maxDepth counts URL path depth.',
  'Crawl start is mapped onto native POST /v1/crawl; the shim itself returns 200 {success,id,url}.',
  'creditsUsed and expiresAt are null: W2L counts no credits and keeps crawl results until their task directory is deleted.',
  'Formats other than markdown/links and parameters the shim does not map are rejected by name with HTTP 400 and success: false.',
  'An omitted timeout stays 300000 ms (Firecrawl: 30000). A timeout is answered with HTTP 200: success: true with the content fetched so far (native status partial), or success: false with failed: timeout; Firecrawl answers it with an error.',
  'waitFor skips the HTTP rung, which cannot run scripts, and starts at the browser rung; the wait counts toward timeout.',
  'metadata has title, description, language, keywords, robots and favicon only when the page declares them; other meta tags (og:*, twitter:* and the rest) are not passed through, and a failed or blocked page has none.',
  'A PDF answers success: true with its text layer as markdown, a <!-- page N --> line before each page, and no metadata.numPages; a PDF without a text layer is success: false with failed: empty_unverified (no OCR). CSV, JSON and text files give their text as received; XLSX, XLS and ZIP files are success: true with markdown null. A file over W2L_MAX_FILE_BYTES is success: false with failed: body_too_large.',
] as const

export interface FirecrawlPage {
  markdown: string | null
  links?: string[]
  /** Page fields appear only when the page declares them (W2L's `metadata`, null values left out). */
  metadata: {
    title?: string
    description?: string
    language?: string
    keywords?: string
    robots?: string
    favicon?: string
    sourceURL: string
    statusCode: number | null
    error?: string
  }
}

export interface FirecrawlScrapeResponse {
  success: boolean
  data: FirecrawlPage
  error?: string
}

export interface FirecrawlCrawlStarted {
  success: true
  id: string
  url: string
}

export type FirecrawlCrawlJobStatus = 'scraping' | 'completed' | 'failed'

export interface FirecrawlCrawlStatus {
  status: FirecrawlCrawlJobStatus
  total: number
  completed: number
  /** Null: W2L counts no credits, and an unknown count is not zero. */
  creditsUsed: number | null
  /** Null: crawl results stay until their task directory is deleted. */
  expiresAt: string | null
  next: string | null
  data: FirecrawlPage[]
}

const SHIM_FORMATS: readonly string[] = ['markdown', 'links']
/** W2L page metadata fields that Firecrawl's `metadata` also has. */
const SHIM_PAGE_FIELDS = ['title', 'description', 'language', 'keywords', 'robots', 'favicon'] as const
/** Scrape options passed to the native request as they are; the native parser validates them. */
const SHIM_PAGE_OPTIONS = ['onlyMainContent', 'waitFor', 'timeout'] as const

/** Accepted only with the value W2L already implements; any other value is rejected. */
const SHIM_FIXED_VALUES: Readonly<Record<string, { value: boolean; reason: string }>> = {
  ignoreSitemap: { value: true, reason: 'W2L does not read sitemaps' },
}

interface ShimProblems {
  parameters: string[]
  values: string[]
  formats: Set<string>
}

export function parseFirecrawlScrapeRequest(body: unknown): ScrapeRequest {
  const rec = asRecord(body)
  const problems: ShimProblems = { parameters: [], values: [], formats: new Set() }
  // `origin` is the Firecrawl SDKs' client label; it does not change the result.
  const options = readShimScrapeOptions(rec, '', ['url', 'origin'], problems)
  throwShimProblems(problems)
  return parseScrapeRequest({ url: rec.url, ...options })
}

export function parseFirecrawlCrawlRequest(body: unknown): CrawlStartRequest {
  const rec = asRecord(body)
  const problems: ShimProblems = { parameters: [], values: [], formats: new Set() }
  checkShimKeys(rec, '', ['url', 'origin', 'limit', 'maxDepth', 'includePaths', 'excludePaths', 'ignoreSitemap', 'scrapeOptions'], problems)
  checkShimFixedValue(rec, '', 'ignoreSitemap', problems)
  let pageOptions: Record<string, unknown> = {}
  if (rec.scrapeOptions !== undefined) {
    const options = rec.scrapeOptions
    if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new RequestError('scrapeOptions must be an object')
    pageOptions = readShimScrapeOptions(options as Record<string, unknown>, 'scrapeOptions.', [], problems)
  }
  throwShimProblems(problems)
  const native: Record<string, unknown> = { url: rec.url, ...pageOptions }
  if (rec.limit !== undefined) native.maxPages = rec.limit
  if (rec.maxDepth !== undefined) native.maxDepth = rec.maxDepth
  if (rec.includePaths !== undefined) native.includePaths = rec.includePaths
  if (rec.excludePaths !== undefined) native.excludePaths = rec.excludePaths
  return parseCrawlStartRequest(native)
}

/** The scrape options the shim maps: formats (markdown, links), onlyMainContent, waitFor and timeout. */
function readShimScrapeOptions(rec: Record<string, unknown>, prefix: string, keys: readonly string[], problems: ShimProblems): Record<string, unknown> {
  checkShimKeys(rec, prefix, [...keys, 'formats', ...SHIM_PAGE_OPTIONS], problems)
  const mapped: Record<string, unknown> = {}
  for (const key of SHIM_PAGE_OPTIONS) if (rec[key] !== undefined) mapped[key] = rec[key]
  if (rec.formats === undefined) return mapped
  if (!Array.isArray(rec.formats) || rec.formats.some((item) => typeof item !== 'string')) throw new RequestError(`${prefix}formats must be an array of strings`)
  const formats = [...new Set(rec.formats as string[])]
  for (const format of formats) if (!SHIM_FORMATS.includes(format)) problems.formats.add(format)
  return { ...mapped, formats }
}

function checkShimKeys(rec: Record<string, unknown>, prefix: string, known: readonly string[], problems: ShimProblems): void {
  for (const key of Object.keys(rec)) if (rec[key] !== undefined && !known.includes(key)) problems.parameters.push(`${prefix}${key}`)
}

function checkShimFixedValue(rec: Record<string, unknown>, prefix: string, key: string, problems: ShimProblems): void {
  const value = rec[key]
  const fixed = SHIM_FIXED_VALUES[key]!
  if (value === undefined) return
  if (typeof value !== 'boolean') throw new RequestError(`${prefix}${key} must be a boolean`)
  if (value !== fixed.value) problems.values.push(`${prefix}${key}: ${String(value)} is not supported (${fixed.reason})`)
}

function throwShimProblems(problems: ShimProblems): void {
  const parts: string[] = []
  if (problems.parameters.length > 0) {
    parts.push(`unsupported ${problems.parameters.length === 1 ? 'parameter' : 'parameters'}: ${problems.parameters.join(', ')}`)
  }
  parts.push(...problems.values)
  if (problems.formats.size > 0) {
    parts.push(`unsupported ${problems.formats.size === 1 ? 'format' : 'formats'}: ${[...problems.formats].join(', ')} (the /fc shim supports ${SHIM_FORMATS.join(', ')})`)
  }
  if (parts.length === 0) return
  // A value problem reads "<name>: <value> is not supported (...)"; its parameter is listed too.
  const parameters = [...problems.parameters, ...problems.values.map((value) => value.split(':', 1)[0] ?? value)]
  const formats = [...problems.formats]
  throw new RequestError(parts.join('; '), parameters.length > 0 ? 'unsupported_parameter' : 'unsupported_format', {
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(formats.length > 0 ? { formats } : {}),
  })
}

export function wrapScrape(result: FetchResult): FirecrawlScrapeResponse {
  const data = firecrawlPage(result)
  if (result.status === 'success' || result.status === 'partial') {
    return { success: true, data }
  }
  return { success: false, error: scrapeError(result), data }
}

export function wrapCrawlAccepted(native: CrawlAccepted, seedUrl: string): FirecrawlCrawlStarted {
  return { success: true, id: native.taskId, url: seedUrl }
}

export function wrapCrawlStatus(report: CrawlReport, steps: readonly StepRecord[]): FirecrawlCrawlStatus {
  const data: FirecrawlPage[] = []
  for (const step of steps) {
    if (step.result !== null) data.push(firecrawlPage(step.result))
  }
  return {
    status: firecrawlCrawlStatus(report.status),
    total: steps.length,
    completed: report.pagesFetched,
    creditsUsed: null,
    expiresAt: null,
    next: null,
    data,
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError('body must be a JSON object')
  }
  return body as Record<string, unknown>
}

function firecrawlPage(result: FetchResult): FirecrawlPage {
  const error =
    result.status === 'blocked'
      ? (result.blockReason ?? 'blocked')
      : result.status === 'failed'
        ? (result.failureReason ?? 'failed')
        : result.status === 'budget_exceeded'
          ? (result.budgetExceeded ?? 'budget_exceeded')
          : result.status === 'success' || result.status === 'partial'
            ? undefined
            : result.status
  // Firecrawl's page fields, only those the page declares.
  const declared: Partial<Record<(typeof SHIM_PAGE_FIELDS)[number], string>> = {}
  for (const key of SHIM_PAGE_FIELDS) {
    const value = result.metadata?.[key]
    if (value !== undefined && value !== null) declared[key] = value
  }
  return {
    markdown: result.markdown,
    ...(result.links !== undefined ? { links: [...result.links] } : {}),
    metadata: {
      ...declared,
      sourceURL: result.requestedUrl,
      statusCode: result.evidence.httpStatus,
      ...(error !== undefined ? { error } : {}),
    },
  }
}

function scrapeError(result: FetchResult): string {
  if (result.status === 'blocked') return `blocked: ${result.blockReason ?? 'unknown'}`
  if (result.status === 'failed') return `failed: ${result.failureReason ?? 'unknown'}`
  if (result.status === 'budget_exceeded') return `budget_exceeded: ${result.budgetExceeded ?? 'unknown'}`
  return result.status
}

function firecrawlCrawlStatus(status: TaskStatus): FirecrawlCrawlJobStatus {
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return 'scraping'
}
