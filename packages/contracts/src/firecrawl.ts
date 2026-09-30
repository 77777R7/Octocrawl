/**
 * Firecrawl v1 scrape/crawl snapshot, frozen 2026-09-18.
 *
 * A one-shot migration shim: map the two main paths onto the native
 * contract. Not a compatibility layer. Unknown fields are ignored.
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
  'Crawl start is mapped onto native POST /v1/crawl; the shim itself returns 200 {success,id,url}.',
  'creditsUsed and expiresAt are null. Formats other than markdown/links are dropped; onlyMainContent, timeout, waitFor, includePaths and excludePaths are honoured.',
] as const

export interface FirecrawlPage {
  markdown: string | null
  links?: string[]
  metadata: {
    sourceURL: string
    /** The URL that answered, after redirects. */
    url: string
    statusCode: number | null
    contentType?: string
    title?: string
    description?: string
    language?: string
    /** Comma-joined, as Firecrawl reports it. */
    keywords?: string
    robots?: string
    favicon?: string
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
  /** W2L meters no credits: null, never an invented number. */
  creditsUsed: number | null
  /** Results do not expire on a local checkpoint: null, never an invented time. */
  expiresAt: string | null
  next: string | null
  data: FirecrawlPage[]
}

const FIRECRAWL_SERVED_FORMATS = ['markdown', 'links'] as const

export function parseFirecrawlScrapeRequest(body: unknown): ScrapeRequest {
  const rec = asRecord(body)
  const native: Record<string, unknown> = { url: rec.url }
  if (Array.isArray(rec.formats)) {
    // Firecrawl formats are strings or `{ type }` objects. The shim serves
    // markdown and links; anything else is dropped (see FIRECRAWL_SHIM_DIFFS).
    const wanted = rec.formats.map((format) =>
      typeof format === 'string' ? format
        : format !== null && typeof format === 'object' && typeof (format as { type?: unknown }).type === 'string' ? (format as { type: string }).type
          : '')
    const served = FIRECRAWL_SERVED_FORMATS.filter((name) => wanted.includes(name))
    if (served.length > 0) native.formats = served
  }
  if (rec.onlyMainContent !== undefined) native.onlyMainContent = rec.onlyMainContent
  if (rec.timeout !== undefined) native.timeout = rec.timeout
  if (rec.waitFor !== undefined) native.waitFor = rec.waitFor
  return parseScrapeRequest(native)
}

export function parseFirecrawlCrawlRequest(body: unknown): CrawlStartRequest {
  const rec = asRecord(body)
  const native: Record<string, unknown> = { url: rec.url }
  if (rec.limit !== undefined) native.maxPages = rec.limit
  if (rec.maxDepth !== undefined) native.maxDepth = rec.maxDepth
  if (rec.includePaths !== undefined) native.includePaths = rec.includePaths
  if (rec.excludePaths !== undefined) native.excludePaths = rec.excludePaths
  if (rec.scrapeOptions !== null && typeof rec.scrapeOptions === 'object' && !Array.isArray(rec.scrapeOptions)) {
    const scrape = parseFirecrawlScrapeRequest({ ...(rec.scrapeOptions as Record<string, unknown>), url: rec.url })
    const options: Record<string, unknown> = {}
    if (scrape.formats !== undefined) options.formats = scrape.formats
    if (scrape.onlyMainContent !== undefined) options.onlyMainContent = scrape.onlyMainContent
    if (scrape.timeout !== undefined) options.timeout = scrape.timeout
    if (scrape.waitFor !== undefined) options.waitFor = scrape.waitFor
    if (Object.keys(options).length > 0) native.scrapeOptions = options
  }
  return parseCrawlStartRequest(native)
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
  const page = result.document?.metadata
  const title = page?.title ?? result.document?.title ?? null
  return {
    markdown: result.markdown,
    ...(result.links !== undefined ? { links: [...result.links] } : {}),
    metadata: {
      sourceURL: result.requestedUrl,
      url: result.evidence.finalUrl,
      statusCode: result.evidence.httpStatus,
      ...(result.evidence.contentType === null ? {} : { contentType: result.evidence.contentType }),
      ...(title === null ? {} : { title }),
      ...(page?.description == null ? {} : { description: page.description }),
      ...(page?.language == null ? {} : { language: page.language }),
      ...(page?.keywords == null ? {} : { keywords: page.keywords.join(', ') }),
      ...(page?.robots == null ? {} : { robots: page.robots }),
      ...(page?.favicon == null ? {} : { favicon: page.favicon }),
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
