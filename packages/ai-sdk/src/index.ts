// Octocrawl's scrape and map as AI SDK tools (https://ai-sdk.dev). They call an Octocrawl API through the TypeScript
// SDK: hosted Octocrawl by default (no key, a daily allowance per address), or a server of your own (`baseUrl`).
// The published package (@octocrawl/ai-sdk) bundles the SDK; `ai` and `zod` are the caller's (peer dependencies).
// The declarations name only `ai` and this file, so a user needs no Octocrawl type package.

import { tool, type Tool } from 'ai'
import { z } from 'zod'
import { W2L, W2LError } from '@w2l/sdk'
import { AI_SDK_VERSION } from './version.js'

export { AI_SDK_VERSION } from './version.js'

/** Hosted Octocrawl's REST API. */
export const HOSTED_API_URL = 'https://api.octocrawl.dev'

/** What hosted Octocrawl and this package record as the calls' `origin`. */
export const AI_SDK_ORIGIN = `ai-sdk@${AI_SDK_VERSION}`

export interface OctocrawlToolsOptions {
  /**
   * An Octocrawl key (`oc_…`), sent as `Authorization: Bearer`. Omitted, the OCTOCRAWL_API_KEY environment variable
   * is used where there is one; without either, hosted Octocrawl serves the keyless allowance. '' sends no key.
   */
  apiKey?: string
  /** The Octocrawl API to call. Omitted, OCTOCRAWL_API_URL, else hosted Octocrawl (https://api.octocrawl.dev). */
  baseUrl?: string
  /** A fetch to send the requests with (tests, a proxy agent). */
  fetch?: typeof fetch
}

/** The scrape tool's answer: the page, how it was read, and its Evidence Record; or the API's refusal. */
export type ScrapeToolResult = ScrapedPage | OctocrawlRefusal

/** The server's task checks, not an independent accuracy verdict. Kept inline for the standalone package types. */
export type TaskVerification = { status: 'not_requested' } | {
  status: 'passed' | 'failed'
  verifier: string
  contractSha256: string
  reason: string | null
  checks: readonly { index: number; type: string; data: boolean; passed: boolean | null; observed: string; observedCount?: number; asked?: number }[]
}

export interface TaskReadiness {
  state: 'ready' | 'not_loaded' | 'not_extracted' | 'not_served'
  basis: readonly string[]
  waitedMs?: number
}

export interface ScrapedPage {
  /** The read's outcome. Only `success` and `partial` carry the page's content; for the others failureReason or blockReason says why. */
  status: 'success' | 'partial' | 'empty_verified' | 'blocked' | 'failed' | 'cancelled' | 'budget_exceeded' | (string & {})
  requestedUrl: string
  finalUrl: string
  httpStatus: number | null
  title: string | null
  markdown?: string | null
  links?: readonly string[]
  html?: string | null
  tables?: readonly unknown[]
  failureReason?: string | null
  blockReason?: string | null
  /** The fetch's caveats (a thin HTTP answer kept, a suspected client-rendered page), joined. */
  warning?: string
  /** What to change next time, when the API has a suggestion. */
  agentHints?: readonly string[]
  /** Missing on older servers; neither missing nor not_requested is verified completion. */
  verification?: TaskVerification
  readiness?: TaskReadiness
  truncated: boolean
  /** Evidence Record v1 (schema `w2l.evidence/1`): final URL, fetch time, HTTP status, robots.txt decision and hashes. */
  evidenceRecord: Record<string, unknown>
}

/** The map tool's answer: a site's URLs, or the API's refusal. */
export type MapToolResult = MappedSite | OctocrawlRefusal

export interface MappedSite {
  status: 'completed' | 'partial' | 'failed' | (string & {})
  /** The map's record id (GET /v1/maps/:id). */
  id: string
  stoppedBy: 'limit' | 'timeout' | null
  links: readonly { url: string; title?: string; description?: string }[]
  warning?: string
  agentHints?: readonly string[]
  counts: { returned: number; refused: number }
}

/** A request the API refused: over the daily allowance, rate limited, an invalid key or option. */
export interface OctocrawlRefusal {
  status: 'refused'
  httpStatus: number
  code: string | null
  error: string
  /** What to do next: wait, get a key, or run Octocrawl on your own computer. */
  agentHints: readonly string[]
  retryAfterSeconds: number | null
}

// Same wire checks and bounds as contracts/verify.ts and readVerify; the server remains the authority on
// comparisons, safe regexes, format conflicts and hosted restrictions. Do not strip unknown check keys.
const verifyText = z.string().min(1).max(1_000)
const verifyCount = z.number().int().min(0).max(1_000_000)
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const pattern = { pattern: verifyText, flags: z.string().regex(/^[imsuy]*$/).optional() }
const verifyInput = z.object({
  checks: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('markdownIncludes'), text: verifyText }).strict(),
    z.object({ type: z.literal('markdownMatches'), ...pattern }).strict(),
    z.object({ type: z.literal('markdownCountMin'), ...pattern, min: verifyCount }).strict(),
    z.object({ type: z.literal('minTables'), min: verifyCount }).strict(),
    z.object({ type: z.literal('tableRowsMin'), tableIndex: verifyCount, columns: z.array(verifyCount).min(1).max(50), min: verifyCount }).strict(),
    z.object({ type: z.literal('listRecordsMin'), min: verifyCount, path: verifyText.optional() }).strict(),
    z.object({ type: z.literal('recordFields'), fields: z.array(verifyText).min(1).max(50), min: verifyCount }).strict(),
    z.object({ type: z.literal('field'), path: verifyText, equals: scalar.optional(), in: z.array(scalar).min(1).max(32).optional(), present: z.boolean().optional(), min: z.number().optional(), max: z.number().optional() }).strict(),
  ])).min(1).max(32),
  emptyOk: z.boolean().optional(),
}).strict()

const scrapeInput = z.object({
  url: z.string().describe('The http(s) URL of the page to read.'),
  formats: z.array(z.enum(['markdown', 'links', 'html', 'tables'])).optional()
    .describe('What to return; default ["markdown"]. html is the cleaned main-content HTML; tables gives each data table with its rows and CSV.'),
  onlyMainContent: z.boolean().optional()
    .describe('Default true: the main content without navigation, header and footer. false keeps the whole page body.'),
  verify: verifyInput.optional().describe('Optional task checks on delivered data. passed covers only these checks, not field accuracy. emptyOk permits an already verified empty result, not missing or unavailable data. The server validates comparisons and format requirements; hosted refuses regex checks.'),
})

const mapInput = z.object({
  url: z.string().describe('The http(s) URL of the site or section to list.'),
  search: z.string().optional()
    .describe('Keep only the URLs whose address or title contains every word given (at most 10), case-insensitively.'),
  limit: z.number().int().min(1).max(5000).optional().describe('How many URLs at most; default 100.'),
  includeSubdomains: z.boolean().optional().describe('Also list URLs on subdomains of the start host. Default false.'),
  sitemap: z.enum(['include', 'skip', 'only']).optional()
    .describe('include (default): the start page\'s links and the sitemaps; skip: no sitemap; only: the sitemap entries alone.'),
})

export type ScrapeToolInput = z.infer<typeof scrapeInput>
export type MapToolInput = z.infer<typeof mapInput>

/** Octocrawl's tools for `generateText`, `streamText` or an agent: `{ scrape, map }`. */
export function octocrawlTools(options: OctocrawlToolsOptions = {}): { scrape: Tool<ScrapeToolInput, ScrapeToolResult>; map: Tool<MapToolInput, MapToolResult> } {
  return { scrape: scrapeTool(options), map: mapTool(options) }
}

/** Read one web page as Markdown (or links, HTML, tables), with an Evidence Record. */
export function scrapeTool(options: OctocrawlToolsOptions = {}): Tool<ScrapeToolInput, ScrapeToolResult> {
  return tool({
    description: 'Read one web page with Octocrawl as Markdown (or links, cleaned HTML, tables), with its Evidence Record. status describes the fetch, not task completion: read verification.status and readiness. passed covers only configured checks, not independent field accuracy; not_requested or missing verification is unverified. On failed checks examine failureReason, blockReason and readiness; do not automatically retry login walls, captchas or unavailable data. confidence is not an accuracy probability. Cite finalUrl and the Evidence Record when using content.',
    inputSchema: scrapeInput,
    execute: async (input, { abortSignal }) => {
      const client = clientOf(options)
      try {
        const response = await client.scrape(input.url, {
          formats: input.formats ?? ['markdown'],
          ...(input.onlyMainContent === undefined ? {} : { onlyMainContent: input.onlyMainContent }),
          ...(input.verify === undefined ? {} : { verify: input.verify }),
          debug: false,
          origin: AI_SDK_ORIGIN,
        }, abortSignal === undefined ? {} : { signal: abortSignal })
        return compactPage(response as unknown as CompactScrape)
      } catch (error) {
        return refusalOf(error)
      }
    },
  })
}

/** List a site's URLs from its sitemaps and start page, without reading each page. */
export function mapTool(options: OctocrawlToolsOptions = {}): Tool<MapToolInput, MapToolResult> {
  return tool({
    description: 'List a website\'s URLs with Octocrawl, from the sitemaps it declares and the links on its start page, without reading each page. Every URL is on the start host (and its subdomains when asked) and allowed by robots.txt. Use it to find the right page, then read that page with scrape.',
    inputSchema: mapInput,
    execute: async (input, { abortSignal }) => {
      const client = clientOf(options)
      const { url, ...rest } = input
      try {
        const response = await client.map(url, { ...rest, origin: AI_SDK_ORIGIN }, abortSignal === undefined ? {} : { signal: abortSignal })
        return compactMap(response as unknown as FullMap)
      } catch (error) {
        return refusalOf(error)
      }
    },
  })
}

/** The fields of the API's compact scrape response this package reads. */
interface CompactScrape {
  status: string
  requestedUrl: string
  finalUrl: string
  snapshot?: { httpStatus?: number | null }
  document?: { title?: string | null } | null
  markdown?: string | null
  links?: readonly string[]
  html?: string | null
  tables?: readonly unknown[]
  failureReason?: string | null
  blockReason?: string | null
  warning?: string
  agentHints?: readonly string[]
  verification?: TaskVerification
  readiness?: TaskReadiness
  truncated?: boolean
  evidenceRecord: Record<string, unknown>
}

/** The fields of the API's map response this package reads. */
interface FullMap {
  id: string
  status: string
  stoppedBy: 'limit' | 'timeout' | null
  links: readonly { url: string; title?: string; description?: string }[]
  refused?: Record<string, unknown>
  warnings?: readonly { message: string }[]
  agentHints?: readonly string[]
}

function clientOf(options: OctocrawlToolsOptions): W2L {
  const env = environment()
  return new W2L({
    baseUrl: options.baseUrl ?? env['OCTOCRAWL_API_URL'] ?? HOSTED_API_URL,
    // Never the SDK's own fallback (W2L_API_TOKEN, a local server's token): '' sends no Authorization header.
    token: options.apiKey ?? env['OCTOCRAWL_API_KEY'] ?? '',
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })
}

/** The process environment's non-empty values, when the runtime has one (a browser or an edge runtime may not). */
function environment(): Record<string, string | undefined> {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
    return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value.length > 0))
  } catch {
    return {}
  }
}

function compactPage(response: CompactScrape): ScrapedPage {
  return {
    status: response.status,
    requestedUrl: response.requestedUrl,
    finalUrl: response.finalUrl,
    httpStatus: response.snapshot?.httpStatus ?? null,
    title: response.document?.title ?? null,
    ...(response.markdown === undefined ? {} : { markdown: response.markdown }),
    ...(response.links === undefined ? {} : { links: response.links }),
    ...(response.html === undefined ? {} : { html: response.html }),
    ...(response.tables === undefined ? {} : { tables: response.tables }),
    ...(response.failureReason == null ? {} : { failureReason: response.failureReason }),
    ...(response.blockReason == null ? {} : { blockReason: response.blockReason }),
    ...(response.warning === undefined ? {} : { warning: response.warning }),
    ...(response.agentHints === undefined || response.agentHints.length === 0 ? {} : { agentHints: response.agentHints }),
    ...(response.verification === undefined ? {} : { verification: response.verification }),
    ...(response.readiness === undefined ? {} : { readiness: response.readiness }),
    truncated: response.truncated === true,
    evidenceRecord: response.evidenceRecord,
  }
}

function compactMap(response: FullMap): MappedSite {
  const { samples: _samples, ...counters } = response.refused ?? {}
  const refused = Object.values(counters).reduce<number>((sum, n) => sum + (typeof n === 'number' ? n : 0), 0)
  const warnings = response.warnings ?? []
  return {
    status: response.status,
    id: response.id,
    stoppedBy: response.stoppedBy,
    links: response.links.map(({ url, title, description }) => ({ url, ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }) })),
    ...(warnings.length === 0 ? {} : { warning: warnings.map((warning) => warning.message).join(' ') }),
    ...(response.agentHints === undefined || response.agentHints.length === 0 ? {} : { agentHints: response.agentHints }),
    counts: { returned: response.links.length, refused },
  }
}

/** An API refusal as an answer the model can act on; anything else (a network failure, a cancellation) is thrown. */
function refusalOf(error: unknown): OctocrawlRefusal {
  if (!(error instanceof W2LError)) throw error
  const body = error.body !== null && typeof error.body === 'object' ? (error.body as { error?: unknown; code?: unknown }) : {}
  return {
    status: 'refused',
    httpStatus: error.status,
    // The body's own code: the SDK keeps only the codes it knows, and hosted Octocrawl adds its own (quota_exhausted).
    code: typeof body.code === 'string' ? body.code : (error.code ?? null),
    error: typeof body.error === 'string' ? body.error : error.message,
    agentHints: error.agentHints,
    retryAfterSeconds: error.retryAfterMs === null ? null : Math.ceil(error.retryAfterMs / 1000),
  }
}
