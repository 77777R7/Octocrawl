/**
 * Hosted Octocrawl, phase 1 (ROADMAP PH): the API's hosted mode and a remote
 * MCP endpoint in one process, for `api.octocrawl.dev` and `mcp.octocrawl.dev`.
 *
 * Every caller is served scrape and map, and scrape_product with the browser
 * lane; an account's key or sign-in is served crawl and batch jobs too
 * (hostedJobRoutes.ts). Every other route and tool is refused by name with a
 * hint to run Octocrawl locally; hostedParity.ts records, tool by tool and
 * option by option, where hosted stands against a local server.
 * A caller is either a key holder (`Authorization: Bearer <key>`, looked up
 * by HMAC in the key store) or keyless (counted by the address the
 * Cloudflare Worker reports, within a daily allowance). Keyless calls use the
 * HTTP lane alone (`fastMode`); a key may use the browser lane. Every call
 * that starts work consumes the caller's and the site's daily allowance in
 * one atomic commit, the public preview's pattern, so an exhausted day is
 * never over-served by two instances.
 */
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { BlockList, isIP } from 'node:net'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getRequestListener } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { closeIdleOnlyWhenUnread, createApp, createApiEngine, type ApiEngine } from '@w2l/api'
import { API_ERROR_STATUS, hostedNetworkPolicy, HOSTED_MAP_MAX_LIMIT, HOSTED_MAP_MAX_TIMEOUT_MS, parseScrapeRequest, RequestError, VERIFY_REGEX_CHECK_TYPES, withOperatorContact, type NetworkPolicy, type ScrapeRun } from '@w2l/contracts'
import { W2L } from '@w2l/sdk'
import { createMcpServer, MCP_VERSION, SERVER_IDENTITY } from './server.js'
import { serverInstructions } from './instructions.js'
import { MAX_WAIT_MS, MCP_SCRAPE_TIMEOUT_MS, SCRAPE_RECORD_HINT, TOOLS } from './tools.js'
import { scrapeSchemaWithout } from './toolsets.js'
import { InFlightCalls, trackPost } from './inFlight.js'
import { serveMcpPost, servesProtocolVersion, unsupportedProtocolVersion } from './serveHttp.js'
import { CREDITS, DEFAULT_MONTHLY_CREDITS, mapCharge, scrapeCharge, secondsToNextGrant, type CreditsStore, type RequestNote, type Reservation } from './hostedCredits.js'
import { asksModelFallback, MODEL_REFUSALS, type HostedModel } from './hostedModel.js'
import { createJobRoutes, HOSTED_BATCH_KEYS, HOSTED_CRAWL_KEYS, isJobRoute, JOB_MAX_CRAWL_PAGES, type HostedJobsConfig } from './hostedJobRoutes.js'

/** What a key holder may do. `dailyLimit` counts scrape and map starts per UTC day. */
export interface HostedKeyRecord {
  enabled: boolean
  plan: string
  dailyLimit: number
  /** Whether the browser lane may be used; keyless callers never may. */
  browser: boolean
  label?: string
  /** The account the key belongs to: its calls spend that account's credits (hostedCredits.ts), not `dailyLimit`. */
  uid?: string
  /** `oauth`: an MCP connection's own key record (docs/mcp-oauth-tasks.md), reached only through its access tokens; it has no plaintext. */
  kind?: 'oauth'
}

/**
 * An OAuth access token's record under `oauthTokens/{accessTokenDigest}`, written by the authorization server on
 * octocrawl.dev: the connection's key record it acts as, the resource it was issued for, and when it stops working.
 */
export interface HostedOAuthTokenRecord {
  /** The id of the connection's record in the key store (`hostedApiKeys/{keyId}`). */
  keyId: string
  resource: string
  /** Milliseconds since the epoch. */
  expiresAt: number
}

export interface HostedOAuthTokens {
  /** The record under the token's digest, or null; `fresh` reads past any cache, as `HostedKeys.lookup` does. */
  lookup(tokenHash: string, options?: { fresh?: boolean }): Promise<HostedOAuthTokenRecord | null>
}

export class MemoryHostedOAuthTokens implements HostedOAuthTokens {
  constructor(private readonly records: ReadonlyMap<string, HostedOAuthTokenRecord> = new Map()) {}
  async lookup(tokenHash: string, _options?: { fresh?: boolean }): Promise<HostedOAuthTokenRecord | null> { return this.records.get(tokenHash) ?? null }
}

/** The MCP endpoint OAuth access tokens are issued for (ROADMAP PH item 6): every token's `resource` must be this. */
export const MCP_OAUTH_RESOURCE = 'https://mcp.octocrawl.dev/mcp-oauth'
/** Its Protected Resource Metadata (RFC 9728), at the path-suffixed well-known URL. */
export const MCP_OAUTH_RESOURCE_METADATA = 'https://mcp.octocrawl.dev/.well-known/oauth-protected-resource/mcp-oauth'
export const OAUTH_ISSUER = 'https://octocrawl.dev'
export const OAUTH_SCOPE = 'mcp'
/** What an access token starts with; refresh tokens start `ocr_` and never reach this service. */
export const ACCESS_TOKEN_PREFIX = 'oca_'

export interface HostedKeys {
  /**
   * The record under the key's HMAC, or null for a key no one issued. `fresh` reads the store past any cache: every start
   * asks for it, so a key revoked by the script stops at its next start (ROADMAP PH item 2).
   */
  lookup(keyHash: string, options?: { fresh?: boolean }): Promise<HostedKeyRecord | null>
}

/**
 * One browser-lane scrape at a time per key (ROADMAP PH item 1): a lease named for the key, held for the call and
 * released after it, with an expiry so a lease an instance never released (a crash) frees itself.
 */
export interface HostedLeases {
  /** Takes the lease `id` for at most `ttlMs`, or says in how many seconds to try again. */
  acquire(id: string, ttlMs: number, now?: Date): Promise<{ ok: true; release: () => Promise<void> } | { ok: false; retryAfterSeconds: number }>
}

/** Seconds a refused browser-lane start is told to wait at most: the running call usually ends sooner than its lease. */
export const BROWSER_BUSY_RETRY_MAX_S = 10

function busyFor(until: number, now: number): number {
  return Math.max(1, Math.min(BROWSER_BUSY_RETRY_MAX_S, Math.ceil((until - now) / 1000)))
}

/** Leases in this process: a local run, and the tests. */
export class MemoryHostedLeases implements HostedLeases {
  readonly held = new Map<string, number>()
  async acquire(id: string, ttlMs: number, now = new Date()): Promise<{ ok: true; release: () => Promise<void> } | { ok: false; retryAfterSeconds: number }> {
    const until = this.held.get(id)
    if (until !== undefined && until > now.getTime()) return { ok: false, retryAfterSeconds: busyFor(until, now.getTime()) }
    const mine = now.getTime() + ttlMs
    this.held.set(id, mine)
    return { ok: true, release: async () => { if (this.held.get(id) === mine) this.held.delete(id) } }
  }
}

/**
 * A daily counter and its limit; `amount` is what one use adds (default 1; a hosted job's slice adds its pages). `alert`
 * marks a pool many callers share: the use that takes it to QUOTA_ALERT_SHARE of its limit logs `hosted_quota_threshold`.
 */
export interface QuotaEntry { id: string; limit: number; amount?: number; alert?: boolean }
/** `counts`: each entry's count after this use, in the entries' order. */
export type QuotaResult = { ok: true; counts?: readonly number[] } | { ok: false; limited: string; limit: number }

export interface HostedQuota {
  /** Consumes one unit of every entry, or none: the first entry at its limit is named. */
  consume(entries: readonly QuotaEntry[], now?: Date): Promise<QuotaResult>
}

export class MemoryHostedKeys implements HostedKeys {
  constructor(private readonly records: ReadonlyMap<string, HostedKeyRecord>) {}
  async lookup(keyHash: string, _options?: { fresh?: boolean }): Promise<HostedKeyRecord | null> { return this.records.get(keyHash) ?? null }
}

export class MemoryHostedQuota implements HostedQuota {
  readonly counts = new Map<string, number>()
  async consume(entries: readonly QuotaEntry[]): Promise<QuotaResult> {
    for (const entry of entries) if ((this.counts.get(entry.id) ?? 0) >= entry.limit) return { ok: false, limited: entry.id, limit: entry.limit }
    for (const entry of entries) this.counts.set(entry.id, (this.counts.get(entry.id) ?? 0) + 1)
    return { ok: true, counts: entries.map((entry) => this.counts.get(entry.id)!) }
  }
}

export const DEFAULT_KEYLESS_DAILY = 20
/**
 * Claude's connectors (claude.ai, the desktop and mobile apps, the API's MCP connector, web fetch) call from Anthropic's
 * servers, whose published outbound range is this one IPv4 block (https://platform.claude.com/docs/en/api/ip-addresses,
 * read 2026-10-11; no outbound IPv6). Counted per address, every Claude user would share one address's 20 pages, so
 * keyless calls from the range share a pool of their own instead, still under the site's daily total.
 */
export const CLAUDE_EGRESS = ['160.79.104.0/21'] as const
export const DEFAULT_CLAUDE_DAILY = 200
/** Starts a minute for the whole Claude pool: many people's calls, so a key holder's rate rather than one address's. */
export const CLAUDE_PER_MINUTE = 60
const claudeEgress = new BlockList()
for (const range of CLAUDE_EGRESS) { const [network, bits] = range.split('/'); claudeEgress.addSubnet(network!, Number(bits), 'ipv4') }
/** Whether an address is in Claude's published egress range. */
export function fromClaude(address: string): boolean {
  return isIP(address) === 4 && claudeEgress.check(address, 'ipv4')
}
/** The day's pages for every caller without an account: keyless callers and keys issued without one. */
export const DEFAULT_SITE_DAILY = 1_500
/**
 * Shares of a day (ROADMAP PH stage H0), so that no one caller can use it up: every keyless caller together, Claude's
 * pool included, within the site's day; each account within the accounts' day. Starts are counted against both.
 */
export const DEFAULT_KEYLESS_TOTAL_DAILY = 500
export const DEFAULT_ACCOUNT_DAILY = 500
/**
 * The day's pages for every account together, apart from the site's day, so that a rush of callers without an account
 * cannot refuse someone who signed in, nor a rush of accounts refuse the keyless. Each account's credits bound it too.
 */
export const DEFAULT_ACCOUNTS_DAILY = 3_000
/** The share of a shared pool's day at which `hosted_quota_threshold` is logged, once: by the use that reaches it. */
export const QUOTA_ALERT_SHARE = 0.7

/**
 * Logs `hosted_quota_threshold` for each entry marked `alert` that this use took to QUOTA_ALERT_SHARE of its limit. Counts
 * only grow during a day and each use is one commit, so exactly one use crosses the mark: one line a pool a day, with no
 * state kept. The pool is named without its day: `site`, `keyless`, `keyless-claude`, `accounts`, `jobs`.
 */
export function logQuotaThresholds(entries: readonly QuotaEntry[], counts: readonly number[] | undefined, day: string, log: (line: string) => void): void {
  if (counts === undefined) return
  for (const [index, entry] of entries.entries()) {
    const count = counts[index]
    if (entry.alert !== true || count === undefined) continue
    const mark = Math.ceil(entry.limit * QUOTA_ALERT_SHARE)
    if (count >= mark && count - (entry.amount ?? 1) < mark) {
      log(JSON.stringify({ severity: 'WARNING', event: 'hosted_quota_threshold', pool: entry.id.startsWith(`${day}-`) ? entry.id.slice(day.length + 1) : entry.id, day, count, limit: entry.limit }))
    }
  }
}
/** Requests per minute a caller may start, so a loop cannot spend a day's allowance in a second. */
export const KEYLESS_PER_MINUTE = 10
export const KEY_PER_MINUTE = 60
/**
 * Cloud Run's request timeout for this service, the deploy's --timeout (docs/hosted-api.md; hostedApi.test.ts holds the two
 * together): no call here runs longer, a REST scrape's 300 s included.
 */
export const HOSTED_REQUEST_TIMEOUT_MS = 300_000
/** How long a browser-lane lease is held at most: the request timeout and a margin, so a lease left by a crash frees itself. */
export const BROWSER_LEASE_MS = HOSTED_REQUEST_TIMEOUT_MS + 10_000
/** Requests of any kind per minute from one address, counted before the key lookup, so unknown keys cannot drive the key store. */
export const ADDRESS_PER_MINUTE = 120
/** A file (PDF, CSV, ...) a hosted call may read: the preview's cap. Files land under the task root, which Cloud Run keeps in memory. */
export const HOSTED_MAX_FILE_BYTES = 5 * 1024 * 1024
/** The network policy hosted Octocrawl reads under, the gate's and the job worker's: the file cap and the operator's contact. */
export function hostedPolicy(base: NetworkPolicy, env: NodeJS.ProcessEnv = process.env): NetworkPolicy {
  return withOperatorContact({ ...base, maxFileBytes: Math.min(base.maxFileBytes ?? HOSTED_MAX_FILE_BYTES, HOSTED_MAX_FILE_BYTES) }, env)
}
/** Scrape and map records and saved files are swept from the task root after this long: hosted phase 1 keeps nothing. */
export const HOSTED_RECORD_TTL_MS = 10 * 60_000
const SWEEP_EVERY_MS = 60_000
/** Callers a limiter or cache remembers at most; the oldest are forgotten first, so a flood of addresses or keys cannot grow memory without bound. */
const REMEMBERED_CALLERS = 20_000
/** The tools the remote endpoint offers; the rest are refused by name. */
export const HOSTED_API_TOOLS: ReadonlySet<string> = new Set(['scrape', 'map', 'scrape_product'])

/** The tools hosted Octocrawl lists to a caller: scrape_product only to a key with the browser lane, since it needs one,
 * so every tool a client sees can answer. All are read-only here: hosted Octocrawl refuses page actions and logins.
 * scrape's description does not name get_scrape, which is not served here. */
export function hostedTools(browser: boolean, jobs = false) {
  return TOOLS.filter((tool) => (HOSTED_API_TOOLS.has(tool.name) && (browser || tool.name !== 'scrape_product')) || (jobs && HOSTED_JOB_TOOLS.has(tool.name)))
    .map((tool) => HOSTED_JOB_TOOLS.has(tool.name) ? hostedJobTool(tool, browser) : ({
      ...tool,
      description: tool.description.replace(SCRAPE_RECORD_HINT, ''),
      inputSchema: hostedInputSchema(tool.name, tool.inputSchema, browser),
      annotations: { ...tool.annotations, readOnlyHint: true },
      _meta: { ...('_meta' in tool ? tool._meta : {}), ...HOSTED_INVOCATION[tool.name as keyof typeof HOSTED_INVOCATION] },
    }))
}

/**
 * The job tools an account's connection lists (ROADMAP PH H2, docs/h2-hosted-jobs-tasks.md M1): crawl and batch jobs run
 * a slice at a time on hosted Octocrawl and are read back through these. Keyless callers and keys without an account
 * have no credits to spend, so they are not offered.
 */
export const HOSTED_JOB_TOOLS: ReadonlySet<string> = new Set(['crawl', 'get_crawl', 'get_crawl_pages', 'get_crawl_errors', 'cancel_crawl', 'wait_crawl', 'batch_scrape', 'get_batch', 'get_batch_items', 'get_batch_errors', 'cancel_batch', 'wait_batch'])
/** A hosted wait ends as a local one does (MAX_WAIT_MS), well inside the request timeout, and answers the status so far. */
export const HOSTED_MCP_WAIT_MS = MAX_WAIT_MS
/** The most items a hosted job list answers at once (hostedJobRoutes.ts PAGE_LIST_MAX). */
const HOSTED_MCP_LIST_MAX = 100
/** A hosted job's statuses: queued while the account's running slots are taken, expired once its results are deleted. */
const HOSTED_JOB_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled', 'expired'] as const
const HOSTED_JOB_NOTE = ' On hosted Octocrawl a job runs in slices: a crawl reads at most 500 pages and a batch 1,000 URLs, each page costs credits as a scrape does (maxCredits caps the job), and results are kept 7 days after it ends.'

/** get_batch_errors as hosted answers it (H2 M7): the job's failed items in a page list, not the local { errors, robotsBlocked }. */
const HOSTED_BATCH_ERRORS_DESCRIPTION = `List a batch's items that did not succeed (status failed, blocked, cancelled or budget_exceeded), each as get_batch_items lists it: { items, nextCursor, hasMore }, in pages of up to ${HOSTED_MCP_LIST_MAX} (cursor, limit). A URL robots.txt refused is among them, blocked with its blockReason.`

/** A start tool's local description less what hosted does not serve: appendToId, actions, and an unstated retention (HOSTED_JOB_NOTE states it). */
function hostedStartDescription(description: string): string {
  return description
    .replace(' appendToId adds the urls to an existing batch;', '')
    .replace(', actions and the rest', ' and the rest')
    .replace(/ How long the server keeps (them|the results) is not stated\./, '')
}

/** A job tool as hosted serves it: its start options cut to what hosted takes, waits within the request's deadline, its status values. */
function hostedJobTool(tool: (typeof TOOLS)[number], browser: boolean) {
  const schema = structuredClone(tool.inputSchema) as { properties: Record<string, Record<string, unknown>>; required?: string[] }
  const starts = tool.name === 'crawl' || tool.name === 'batch_scrape'
  if (starts) {
    const allowed = tool.name === 'crawl' ? HOSTED_CRAWL_KEYS : HOSTED_BATCH_KEYS
    // REST takes a webhook (H2 W1); a tool does not offer one yet, since its secret would land in the agent's transcript.
    for (const key of Object.keys(schema.properties)) if (!allowed.has(key) || key === 'webhook' || (!browser && key === 'waitFor')) delete schema.properties[key]
    if (tool.name === 'crawl' && schema.properties.maxPages) schema.properties.maxPages = { ...schema.properties.maxPages, maximum: JOB_MAX_CRAWL_PAGES }
    // The job's credit cap, offered where credits are spent: the local tools leave it out, a server on the computer spends none (H2 M6).
    schema.properties.maxCredits = { type: 'integer', minimum: 1, description: 'The most credits this job may spend; it stops when the next page would pass it.' }
    // A page in a job is read as a hosted scrape is (H2 M7, M9): its formats (no screenshot without the browser lane),
    // no authed mode, files up to the hosted cap.
    const scrape = hostedInputSchema('scrape', TOOLS.find((candidate) => candidate.name === 'scrape')!.inputSchema, browser) as { properties: Record<string, Record<string, unknown>> }
    schema.properties.formats = scrape.properties.formats!
    schema.properties.mode = scrape.properties.mode!
    schema.properties.maxFileBytes = { ...schema.properties.maxFileBytes, maximum: HOSTED_MAX_FILE_BYTES }
  }
  // An error list's items lose their usage and trace as pages do (H2 M8): debug asks for them back.
  if (tool.name === 'get_batch_errors' || tool.name === 'get_crawl_errors') schema.properties.debug = { type: 'boolean', description: 'Keep each item\'s usage and trace. Default false.' }
  if (schema.properties.timeoutMs) schema.properties.timeoutMs = { ...schema.properties.timeoutMs, maximum: HOSTED_MCP_WAIT_MS }
  // A page of a hosted job's list is at most HOSTED_MCP_LIST_MAX items, and so is what maxResults follows.
  for (const key of ['limit', 'maxResults']) if (schema.properties[key] && Number(schema.properties[key].maximum) > HOSTED_MCP_LIST_MAX) schema.properties[key] = { ...schema.properties[key], maximum: HOSTED_MCP_LIST_MAX }
  const output = 'outputSchema' in tool && tool.outputSchema !== undefined ? structuredClone(tool.outputSchema) as { properties?: Record<string, Record<string, unknown>> } : undefined
  if (output?.properties?.status !== undefined) output.properties.status = { enum: [...HOSTED_JOB_STATUSES] }
  return {
    ...tool,
    description: starts ? `${hostedStartDescription(tool.description)}${HOSTED_JOB_NOTE}` : tool.name === 'get_batch_errors' ? HOSTED_BATCH_ERRORS_DESCRIPTION : tool.description.replace(/at most 120000/g, `at most ${HOSTED_MCP_WAIT_MS}`),
    inputSchema: schema,
    ...(output === undefined ? {} : { outputSchema: output }),
  }
}

/**
 * The scrape options hosted Octocrawl serves (docs/mcp-client-ux-tasks.md W6): the rest it refuses (actions,
 * robotsOverride, lane, handoff, skipTlsVerification, access other than standard) or takes and cannot honour (mode
 * authed reads anonymously, as it holds no saved login; lockdown always misses, since nothing is cached; storeInCache,
 * maxAge and minAge do nothing for the same reason). Measured against createHostedApi on 2026-10-17;
 * hostedSchema.integration.test.ts calls every listed option, so a new local option reaches hosted only when added here.
 */
export const HOSTED_SCRAPE_KEYS: ReadonlySet<string> = new Set(['url', 'mode', 'allowlistedDomains', 'formats', 'includeLinks', 'debug', 'onlyMainContent', 'waitFor', 'timeout', 'maxFileBytes', 'includeTags', 'excludeTags', 'headers', 'mobile', 'fastMode', 'blockAds', 'removeBase64Images', 'verify', 'integration'])
/** A hosted MCP scrape's deadline when it names none: a local MCP scrape's. */
export const HOSTED_MCP_SCRAPE_TIMEOUT_MS = MCP_SCRAPE_TIMEOUT_MS
/**
 * The longest deadline a hosted MCP scrape may ask for: 60 s inside the 240 s claude.ai and Claude Desktop give a tool call
 * (https://claude.com/docs/connectors/building.md, read 2026-10-27), for a cold start and the answer's assembly. Clients
 * that give a call less (Cursor, Codex CLI and ChatGPT report about 60 s) end it sooner whatever this allows.
 */
export const HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS = 180_000

/** A hosted copy of a tool's input schema, with only what this connection can use. */
function hostedInputSchema(name: string, schema: unknown, browser: boolean): unknown {
  if (name !== 'scrape' && name !== 'map') return schema
  if (name === 'map') {
    const copy = structuredClone(schema) as { properties: Record<string, Record<string, unknown>> }
    const properties = copy.properties
    delete properties.ignoreRobotsTxt
    // The local description points to crawl, which hosted Octocrawl does not list.
    properties.includePaths = { ...properties.includePaths, description: 'Pathname regexes a URL must match.' }
    properties.limit = { ...properties.limit, maximum: HOSTED_MAP_MAX_LIMIT }
    properties.timeout = { ...properties.timeout, maximum: HOSTED_MAP_MAX_TIMEOUT_MS }
    return copy
  }
  const copy = scrapeSchemaWithout(schema, (key) => HOSTED_SCRAPE_KEYS.has(key), 'The declared identity the page is read under: standard (default) or research. A hosted server holds no saved logins, so it has no authed mode.')
  const properties = copy.properties
  properties.timeout = { ...properties.timeout, maximum: HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS, description: `Deadline in milliseconds for the whole scrape. When it fires the result is partial with the content so far, or failed/timeout. Here by default ${HOSTED_MCP_SCRAPE_TIMEOUT_MS}, max ${HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS}; a longer one is lowered to it.` }
  properties.maxFileBytes = { ...properties.maxFileBytes, maximum: HOSTED_MAX_FILE_BYTES }
  const verify = properties.verify as { properties: { checks: { items: { properties: { type: { enum: string[] } } } } } }
  const checkType = verify.properties.checks.items.properties.type
  checkType.enum = checkType.enum.filter((type) => !(VERIFY_REGEX_CHECK_TYPES as readonly string[]).includes(type))
  if (!browser) {
    // Without the browser lane there is no screenshot and nothing to wait for.
    delete properties.waitFor
    const formats = properties.formats as { description: string; items: { anyOf: { enum?: string[]; properties?: { type?: { const?: string } } }[] } }
    formats.items.anyOf = formats.items.anyOf
      .filter((variant) => variant.properties?.type?.const !== 'screenshot')
      .map((variant) => variant.enum === undefined ? variant : { ...variant, enum: variant.enum.filter((value) => !value.startsWith('screenshot')) })
    formats.description = `${formats.description} This connection has no browser lane, so it offers no screenshot.`
  } else {
    // An account's key or connection with fewer credits than a browser page reads over HTTP alone, where a screenshot is refused.
    const formats = properties.formats as { description: string }
    formats.description = `${formats.description} On an account's credits a browser page costs 5; with fewer left, a screenshot is refused.`
  }
  return copy
}

/** A hosted MCP scrape's arguments with its deadline: HOSTED_MCP_SCRAPE_TIMEOUT_MS when it names none, at most HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS (REST keeps the engine's own). */
export function hostedScrapeArguments(args: unknown): unknown {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return args
  const timeout = (args as { timeout?: unknown }).timeout
  return { ...args, timeout: typeof timeout === 'number' ? Math.min(timeout, HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS) : HOSTED_MCP_SCRAPE_TIMEOUT_MS }
}
/**
 * A request the hosted MCP handler sends the gate in-process: every scrape a tool starts gets the MCP deadline
 * (hostedScrapeArguments), scrape_product's too, which names none and would otherwise run the engine's 300 s.
 */
export async function withMcpScrapeDeadline(request: Request): Promise<Request> {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/scrape') return request
  const body = await request.clone().json().catch(() => null) as unknown
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return request
  return new Request(request, { body: JSON.stringify(hostedScrapeArguments(body)) })
}
/** What ChatGPT shows while a hosted tool runs and once it has (Apps SDK openai/toolInvocation/*, 64 characters at most). */
const HOSTED_INVOCATION = {
  scrape: { 'openai/toolInvocation/invoking': 'Reading the page', 'openai/toolInvocation/invoked': 'Read the page' },
  map: { 'openai/toolInvocation/invoking': "Listing the site's URLs", 'openai/toolInvocation/invoked': "Listed the site's URLs" },
  scrape_product: { 'openai/toolInvocation/invoking': 'Reading the product page', 'openai/toolInvocation/invoked': 'Read the product page' },
} as const
/**
 * The tools /mcp-oauth lists: each declares that it needs OAuth with the `mcp` scope, top level and mirrored in `_meta`
 * for clients that read only `_meta`, as ChatGPT asks (https://developers.openai.com/apps-sdk/build/auth, read 2026-10-16).
 */
export function oauthTools(browser: boolean, jobs = false) {
  const securitySchemes = [{ type: 'oauth2', scopes: [OAUTH_SCOPE] }]
  // Merged, not replaced: the hosted copies' own _meta (status lines) stays beside securitySchemes.
  return hostedTools(browser, jobs).map((tool) => ({ ...tool, securitySchemes, _meta: { ...('_meta' in tool ? tool._meta : {}), securitySchemes } }))
}
/** /mcp-oauth's Protected Resource Metadata (RFC 9728). */
export function oauthResourceMetadata() {
  return { resource: MCP_OAUTH_RESOURCE, authorization_servers: [OAUTH_ISSUER], scopes_supported: [OAUTH_SCOPE], bearer_methods_supported: ['header'] }
}
/**
 * What directories that list MCP servers read before, or instead of, a live scan (Smithery's static server card,
 * https://smithery.ai/docs/build/publish): the server, that it needs no sign-in, and the tools it offers, taken from
 * the same definitions tools/list answers a caller without a key, so the card cannot drift from the server.
 */
export function hostedServerCard() {
  return {
    serverInfo: { ...SERVER_IDENTITY, version: MCP_VERSION, websiteUrl: 'https://octocrawl.dev/?utm_source=mcp-server-card&utm_medium=listing' },
    authentication: { required: false },
    tools: hostedTools(false),
    resources: [],
    prompts: [],
  }
}
const PROXY_SECRET_HEADER = 'x-w2l-proxy-secret'
/**
 * The dashboard's Playground (packages/public-preview account.ts) runs a scrape or a map for the signed-in account: the
 * site's server names the account in this header, signed with W2L_QUOTA_HASH_KEY, which both services hold. The call
 * then spends that account's credits and leaves its request line as a key's call does, under the key id
 * `playground:{uid}`, without a key the person would have to hold or count against their five.
 * The dashboard's Jobs page reads the account's jobs (GET /v1/jobs, a job's status and its export link) the same way.
 */
export const SITE_ACCOUNT_HEADER = 'x-w2l-site-account'
/** How long a signed account header is good for; the site signs one per call. */
export const SITE_ACCOUNT_TTL_MS = 120_000
/** How far ahead of this clock the site's may run: a header is not refused for a few seconds' difference between the two. */
const SITE_CLOCK_SKEW_MS = 30_000
const SITE_UID = /^[A-Za-z0-9_-]{1,128}$/
function siteAccountSignature(hashKey: string, uid: string, expires: number): string {
  return createHmac('sha256', hashKey).update(`site-account:${uid}:${expires}`).digest('hex')
}
/** The header's value for an account, good until `SITE_ACCOUNT_TTL_MS` from `now`: `{uid}.{expires ms}.{HMAC}`. */
export function siteAccountAssertion(hashKey: string, uid: string, now = Date.now()): string {
  if (!SITE_UID.test(uid)) throw new Error('the account id cannot be signed')
  const expires = now + SITE_ACCOUNT_TTL_MS
  return `${uid}.${expires}.${siteAccountSignature(hashKey, uid, expires)}`
}
/** The account a signed header names, or null when its signature, form or time is wrong. */
export function verifySiteAccount(hashKey: string, value: string, now = Date.now()): string | null {
  const match = /^([A-Za-z0-9_-]{1,128})\.(\d{13})\.([0-9a-f]{64})$/.exec(value)
  if (!match) return null
  const [, uid, at, signature] = match
  const expires = Number(at)
  if (expires < now || expires > now + SITE_ACCOUNT_TTL_MS + SITE_CLOCK_SKEW_MS) return null
  return sameSecret(signature, siteAccountSignature(hashKey, uid!, expires)) ? uid! : null
}
const INTERNAL_CLIENT_HEADER = 'x-w2l-hosted-client'
const INTERNAL_SECRET_HEADER = 'x-w2l-hosted-internal'
/** Set only by /mcp-oauth's handler: the one way an access token reaches the gate. Separate from the keyless secret, which /mcp sets too. */
const OAUTH_SECRET_HEADER = 'x-w2l-hosted-oauth'
const BODY_LIMIT = 262_144

export interface HostedApiConfig {
  port: number
  host?: string
  taskRoot: string
  /** HMAC key for key digests and address digests: never the raw key or address is stored or logged. */
  hashKey: string
  keys: HostedKeys
  /** OAuth access tokens for /mcp-oauth; while absent, every call there is answered 401. */
  oauthTokens?: HostedOAuthTokens
  quota: HostedQuota
  /** One browser-lane scrape at a time per key; in this process when absent (a local run). */
  leases?: HostedLeases
  /** Accounts' credit balances; a key that names an account is refused while this is absent. */
  credits?: CreditsStore
  /** Hosted batch and crawl jobs (ROADMAP PH H1), for accounts' keys; absent, or without credits: their routes stay refused. */
  jobs?: HostedJobsConfig
  /** The json model fallback on an account's credits (hostedModel.ts); absent: no hosted call calls the model. */
  model?: HostedModel
  /** Shared with the Cloudflare Worker; proves CF-Connecting-IP. Absent: the socket address is the keyless identity. */
  proxySecret?: string
  keylessDaily?: number
  /** Requests a minute one address may make (ADDRESS_PER_MINUTE); a test lowers it. */
  addressPerMinute?: number
  /** Keyless pages a UTC day for every caller in Claude's egress range together (see CLAUDE_EGRESS). */
  claudeDaily?: number
  siteDaily?: number
  /** Keyless pages a UTC day for every keyless caller together, within the site's total. */
  keylessTotalDaily?: number
  /** Pages a UTC day one account's keys may start, within the accounts' total. */
  accountDaily?: number
  /** Pages a UTC day every account together may start, apart from the site's total (DEFAULT_ACCOUNTS_DAILY). */
  accountsDaily?: number
  /** The credits an account gets a month, named in the hint that says to sign in (DEFAULT_MONTHLY_CREDITS). */
  monthlyCredits?: number
  /** The public address of this API, named in hints; e.g. https://api.octocrawl.dev */
  publicOrigin?: string
  networkPolicy?: NetworkPolicy
  workerCount?: number
  env?: NodeJS.ProcessEnv
  log?: (line: string) => void
  /** The clock an access token's expiry is checked against (milliseconds); Date.now by default. */
  now?: () => number
}

/** The URL a scrape or map body asked for, as the request line keeps it; empty when the body named none. */
function requestedUrl(body: unknown): string {
  const url = body !== null && typeof body === 'object' ? (body as { url?: unknown }).url : undefined
  return typeof url === 'string' ? url : ''
}

/** The formats a scrape body named, by name (a string, or an object's `type`), as the caller wrote them; empty when it
 * named none. The line keeps at most 20 names of 40 characters (hostedCredits.ts). */
function requestedFormats(body: unknown): string[] {
  const formats = body !== null && typeof body === 'object' ? (body as { formats?: unknown }).formats : undefined
  if (!Array.isArray(formats)) return []
  return formats.flatMap((format: unknown) => typeof format === 'string' ? [format]
    : format !== null && typeof format === 'object' && typeof (format as { type?: unknown }).type === 'string' ? [(format as { type: string }).type] : [])
}

/** A scrape result's outcome on its request line, from the result and its Evidence Record: never the page's content. */
export function noteScrape(note: RequestNote, result: unknown): void {
  const r = (result ?? {}) as { status?: unknown; lane?: unknown; failureReason?: unknown; scrapeId?: unknown; evidenceRecord?: { finalUrl?: unknown; httpStatus?: unknown; reason?: unknown; robotsDecision?: { decision?: unknown } | null; rawSha256?: unknown; access?: { paidCalls?: unknown } | null } }
  const evidence = r.evidenceRecord ?? {}
  const text = (value: unknown) => (typeof value === 'string' ? value : null)
  note.status = text(r.status) ?? 'error'
  note.lane = text(r.lane)
  note.finalUrl = text(evidence.finalUrl)
  note.httpStatus = typeof evidence.httpStatus === 'number' ? evidence.httpStatus : null
  note.reason = text(evidence.reason) ?? text(r.failureReason)
  const robots = evidence.robotsDecision?.decision
  note.robots = robots === 'allowed' || robots === 'disallowed' || robots === 'no_robots' ? robots : null
  note.sha256 = text(evidence.rawSha256)
  // The scrape's record and its paid calls by id, so the line's credits and the record's USD can be joined (PA EH1).
  note.scrapeId = text(r.scrapeId)
  const paid = evidence.access?.paidCalls
  note.paidCallIds = Array.isArray(paid) ? paid.flatMap((call: unknown) => {
    const id = call !== null && typeof call === 'object' ? (call as { paidCallId?: unknown }).paidCallId : undefined
    return typeof id === 'string' && id !== '' ? [id] : []
  }) : []
}

/** The trace events that are waits on the page: the detail field that holds each one's length, and the outcomes it names besides. */
const PHASE_WAITS: Readonly<Record<string, { length: string; outcomes: readonly string[] }>> = {
  loading_wait: { length: 'waitedMs', outcomes: ['cleared'] },
  steady_wait: { length: 'waitedMs', outcomes: ['steady'] },
  region_wait: { length: 'waitedMs', outcomes: ['ready'] },
  wait_for: { length: 'waitedMs', outcomes: [] },
  // installed_chrome's ChallengeWait (browserLocal.ts) keeps its length under `ms`.
  challenge_wait: { length: 'ms', outcomes: ['outcome'] },
}

/**
 * One line per hosted scrape on where its time went (stage H speed root cause, 2026-10-27): each rung's start and length
 * from the ladder trace, the browser's time, the page's waits, and whether the http rung's header cap handed over to the
 * browser. Logged whatever `debug` asks and never sent to the caller. Of the URL, its host alone: never its path, its
 * query or the page.
 */
export function scrapePhaseLine(url: string, run: ScrapeRun, scrapeId: string | null = null): Record<string, unknown> {
  let host: string | null = null
  try { host = new URL(url).hostname } catch { host = null }
  const ms = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null)
  const ladder = run.ladderTrace ?? []
  const rungs = ladder.flatMap((event, index) => {
    if (event.event !== 'ladder_channel_started') return []
    const step = ladder.slice(index + 1).find((later) => later.event === 'ladder_step' && later.channel === event.channel)
    const status = step?.detail?.status
    return [{ channel: event.channel ?? null, startMs: ms(event.at), ms: step === undefined ? null : ms(step.at), status: typeof status === 'string' ? status : null }]
  })
  const waits = (run.trace ?? []).flatMap((event) => {
    const wait = PHASE_WAITS[event.event]
    if (wait === undefined) return []
    const detail = event.detail ?? {}
    const named = Object.fromEntries(wait.outcomes.flatMap((key) => typeof detail[key] === 'boolean' || typeof detail[key] === 'string' ? [[key, detail[key]]] : []))
    return [{ event: event.event, waitedMs: ms(detail[wait.length]), ...named }]
  })
  return {
    severity: 'INFO', event: 'hosted_scrape_phases', host, scrapeId,
    status: run.status, lane: run.lane, reason: run.blockReason ?? run.failureReason ?? null,
    channelsTried: run.channelsTried, totalMs: ms(run.usage?.wallMs), browserMs: ms(run.usage?.browserMs),
    headersTimeoutFallback: ladder.some((event) => event.event === 'ladder_headers_timeout_fallback'),
    rungs, waits,
  }
}

export interface HostedCaller {
  kind: 'key' | 'keyless'
  /** Keyless calls from Claude's egress range, which share one pool. */
  pool?: 'claude'
  /** The HMAC of the key or of the address: the quota and rate-limit identity. */
  id: string
  dailyLimit: number
  browser: boolean
  plan: string
  /** The account whose credits the call spends; absent for keyless callers and keys issued by hand. */
  uid?: string
}

/** A Map that forgets its oldest entries past a size, so what callers make it remember stays bounded. */
class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly max: number) { super() }
  override set(key: K, value: V): this {
    if (!this.has(key) && this.size >= this.max) this.delete(this.keys().next().value as K)
    return super.set(key, value)
  }
}

class SlidingWindowLimiter {
  private readonly admitted = new BoundedMap<string, number[]>(REMEMBERED_CALLERS)
  constructor(private readonly perMinute: number) {}
  retryAfterSeconds(key: string, now = Date.now()): number | null {
    let moments = this.admitted.get(key)
    if (moments === undefined) { moments = []; this.admitted.set(key, moments) }
    while (moments.length > 0 && moments[0]! <= now - 60_000) moments.shift()
    if (moments.length >= this.perMinute) return Math.max(1, Math.ceil((moments[0]! + 60_000 - now) / 1000))
    moments.push(now)
    return null
  }
}

/** Deletes the scrape and map records and the saved files older than the TTL: hosted phase 1 retains nothing, and the task root is Cloud Run's memory. */
export async function sweepTaskRoot(taskRoot: string, ttlMs = HOSTED_RECORD_TTL_MS, now = Date.now()): Promise<number> {
  let removed = 0
  for (const dir of ['files', 'scrapes', 'maps']) {
    const base = join(taskRoot, dir)
    let entries: string[]
    try { entries = await readdir(base) } catch { continue }
    for (const entry of entries) {
      const path = join(base, entry)
      try {
        const info = await stat(path)
        if (now - info.mtimeMs < ttlMs) continue
        await rm(path, { recursive: true, force: true })
        removed++
      } catch { /* gone meanwhile, or unreadable: the next sweep sees it */ }
    }
  }
  return removed
}

function utcDay(now: Date): string { return now.toISOString().slice(0, 10) }
/** A name or version an MCP client gave, as printable text of at most 64 characters; null when it gave none. */
function clientText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/[^\x20-\x7e]/g, '?').trim().slice(0, 64)
  return text === '' ? null : text
}
function secondsToUtcMidnight(now: Date): number {
  return Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000))
}
function digest(hashKey: string, kind: 'key' | 'ip' | 'oca', value: string): string {
  return createHmac('sha256', hashKey).update(`${kind}:${value}`).digest('hex')
}
/** The document id a key is stored under: scripts/hosted/issue-key.mjs writes it, the service looks it up. */
export function keyDigest(hashKey: string, key: string): string { return digest(hashKey, 'key', key) }
/** The document id an access token is stored under in `oauthTokens`: HMAC-SHA256 of `oca:{token}` with W2L_QUOTA_HASH_KEY. */
export function accessTokenDigest(hashKey: string, token: string): string { return digest(hashKey, 'oca', token) }
function sameSecret(presented: string | undefined, secret: string): boolean {
  return typeof presented === 'string' && timingSafeEqual(createHash('sha256').update(presented).digest(), createHash('sha256').update(secret).digest())
}

/** The address the Worker reports once it proved itself, else the socket's. Raw addresses are hashed before use. */
export function clientAddress(req: IncomingMessage, proxySecret: string | undefined): string {
  const presented = req.headers[PROXY_SECRET_HEADER]
  const reported = req.headers['cf-connecting-ip']
  if (proxySecret && sameSecret(typeof presented === 'string' ? presented : undefined, proxySecret) && typeof reported === 'string' && isIP(reported.trim())) return reported.trim()
  const socket = req.socket?.remoteAddress ?? ''
  return isIP(socket) ? socket : 'unknown'
}

const LOCAL_HINT = 'run Octocrawl on your computer for this: npx octocrawl serve, then npx -y @octocrawl/mcp (https://octocrawl.dev/docs/connect-mcp/?utm_source=hosted&utm_medium=hint)'
/** Why the gate read a scrape over HTTP alone, by what the caller lacks: it replaces the engine's "retry without fastMode",
 * since a retry is pinned the same way. */
const HTTP_ONLY_HINTS = {
  keyless: `hosted Octocrawl reads over HTTP alone without a key, so the browser lane did not run; a key opens it (https://octocrawl.dev/docs/connect-mcp/?utm_source=hosted&utm_medium=hint), or ${LOCAL_HINT}`,
  key: `this key has no browser lane, so hosted Octocrawl read the page over HTTP alone; ${LOCAL_HINT}`,
  credits: `this account has fewer credits than a browser page (${CREDITS.browserPage}), so hosted Octocrawl read the page over HTTP alone; the monthly credits come back on the 1st, or ${LOCAL_HINT}`,
} as const

/** The scrape context that tells the engine the gate pinned fastMode: the answer and the stored record then say why, outright to a caller that sent fastMode: false. */
function httpOnlyPin(body: unknown, reason: string): { fastModePin: { reason: string; askedOff: boolean } } {
  return { fastModePin: { reason, askedOff: (body as { fastMode?: unknown }).fastMode === false } }
}

export function createHostedApi(config: HostedApiConfig): { server: HttpServer; engine: ApiEngine; close: () => Promise<void> } {
  if (config.hashKey.length < 32) throw new Error('hashKey must contain at least 32 characters')
  const env = config.env ?? process.env
  const log = config.log ?? ((line: string) => console.log(line))
  const jobRoutes = config.jobs === undefined || config.credits === undefined ? null : createJobRoutes(config.jobs, config.credits, log)
  const keylessDaily = config.keylessDaily ?? DEFAULT_KEYLESS_DAILY
  const claudeDaily = config.claudeDaily ?? DEFAULT_CLAUDE_DAILY
  const siteDaily = config.siteDaily ?? DEFAULT_SITE_DAILY
  const keylessTotalDaily = config.keylessTotalDaily ?? DEFAULT_KEYLESS_TOTAL_DAILY
  const accountDaily = config.accountDaily ?? DEFAULT_ACCOUNT_DAILY
  const accountsDaily = config.accountsDaily ?? DEFAULT_ACCOUNTS_DAILY
  // Signing in is free and its credits are outside every keyless pool, so a caller without an account is told so first.
  const signInHint = `sign in free for ${(config.monthlyCredits ?? DEFAULT_MONTHLY_CREDITS).toLocaleString('en-US')} credits a month: an MCP client connects to ${MCP_OAUTH_RESOURCE} and signs in there, and the API takes a key made at https://octocrawl.dev/signin/?utm_source=hosted&utm_medium=quota`
  const policy = hostedPolicy(config.networkPolicy ?? hostedNetworkPolicy(), env)
  const engine = createApiEngine({
    taskRoot: config.taskRoot,
    networkPolicy: policy,
    hosted: true,
    // No page calls the model without the gate a start passes: its credits, the switch and the day's cap.
    requireModelGate: true,
    defaultMaxPages: 1,
    mapMaxLimit: HOSTED_MAP_MAX_LIMIT,
    mapMaxTimeoutMs: HOSTED_MAP_MAX_TIMEOUT_MS,
    allowRobotsOverride: false,
    sessionsFile: null,
    userChrome: null,
    workerCount: config.workerCount ?? 2,
  })
  const inner = createApp(engine, { exposeInternalErrors: false, jobStreams: false })
  // A process-local secret lets the MCP handler hand the gate a keyless caller's identity; no outside request can present it.
  const internalSecret = randomBytes(32).toString('hex')
  const oauthSecret = randomBytes(32).toString('hex')
  const leases = config.leases ?? new MemoryHostedLeases()
  const keylessLimiter = new SlidingWindowLimiter(KEYLESS_PER_MINUTE)
  const keyLimiter = new SlidingWindowLimiter(KEY_PER_MINUTE)
  const claudeLimiter = new SlidingWindowLimiter(CLAUDE_PER_MINUTE)
  const addressLimiter = new SlidingWindowLimiter(config.addressPerMinute ?? ADDRESS_PER_MINUTE)
  const sweeper = setInterval(() => { sweepTaskRoot(config.taskRoot).catch((error) => log(JSON.stringify({ severity: 'WARNING', event: 'hosted_sweep_failed', message: String(error) }))) }, SWEEP_EVERY_MS)
  sweeper.unref()

  const refuse = (c: Context, status: 401 | 403 | 404 | 429, code: string, message: string, hints: readonly string[], headers: Record<string, string> = {}) => {
    for (const [name, value] of Object.entries(headers)) c.header(name, value)
    return c.json({ error: message, code, agentHints: hints }, status)
  }

  /**
   * The connection an OAuth access token acts as, or null when the token is unknown, issued for another resource, expired,
   * or its connection was disconnected. The caller is the connection's key record, an account's key like any other.
   */
  const identifyOAuth = async (presented: string, fresh = false): Promise<HostedCaller | null> => {
    const tokens = config.oauthTokens
    if (tokens === undefined || !presented.startsWith(ACCESS_TOKEN_PREFIX) || presented.length > 256) return null
    const token = await tokens.lookup(accessTokenDigest(config.hashKey, presented), { fresh })
    if (token === null || token.resource !== MCP_OAUTH_RESOURCE || !(token.expiresAt > (config.now ?? Date.now)()) || !SITE_UID.test(token.keyId)) return null
    const record = await config.keys.lookup(token.keyId, { fresh })
    if (record === null || !record.enabled || record.kind !== 'oauth' || record.uid === undefined) return null
    return { kind: 'key', id: token.keyId, uid: record.uid, dailyLimit: 0, browser: record.browser, plan: 'account' }
  }

  /**
   * Who is calling: a key holder, a keyless caller, or neither (an unknown key, an OAuth access token sent anywhere but
   * through /mcp-oauth, whose handler calls the gate in-process with its own secret, or one whose connection ended). A
   * start reads the key fresh.
   */
  const identify = async (headers: Headers, socketAddress: string, fresh = false): Promise<HostedCaller | 'unknown_key' | 'oauth_token' | 'oauth_ended'> => {
    const authorization = headers.get('authorization') ?? ''
    const internal = headers.get(INTERNAL_SECRET_HEADER)
    const fromInside = internal !== null && sameSecret(internal, internalSecret)
    const viaOAuth = headers.get(OAUTH_SECRET_HEADER)
    if (authorization.toLowerCase().startsWith('bearer ')) {
      const presented = authorization.slice(7).trim()
      if (presented.length === 0 || presented.length > 256) return 'unknown_key'
      if (presented.startsWith(ACCESS_TOKEN_PREFIX)) return viaOAuth !== null && sameSecret(viaOAuth, oauthSecret) ? (await identifyOAuth(presented, fresh)) ?? 'oauth_ended' : 'oauth_token'
      const id = digest(config.hashKey, 'key', presented)
      const record = await config.keys.lookup(id, { fresh })
      if (record === null || !record.enabled) return 'unknown_key'
      if (record.uid !== undefined) return { kind: 'key', id, uid: record.uid, dailyLimit: 0, browser: record.browser, plan: 'account' }
      return { kind: 'key', id, dailyLimit: record.dailyLimit, browser: record.browser, plan: record.plan }
    }
    const address = fromInside ? (headers.get(INTERNAL_CLIENT_HEADER) ?? socketAddress) : socketAddress
    if (fromClaude(address)) return { kind: 'keyless', pool: 'claude', id: 'claude', dailyLimit: claudeDaily, browser: false, plan: 'keyless' }
    return { kind: 'keyless', id: digest(config.hashKey, 'ip', address), dailyLimit: keylessDaily, browser: false, plan: 'keyless' }
  }

  type GateEnv = { Bindings: { socketAddress: string }; Variables: { caller: HostedCaller } }
  const gate = new Hono<GateEnv>()
  // /health, not /healthz: Google's front end answers /healthz on a Cloud Run URL itself (a 404 page) and the request never reaches the container.
  gate.get('/health', (c) => c.json({ ok: true, service: 'octocrawl-hosted-api', tools: [...HOSTED_API_TOOLS] }))
  // Discovery files are public and cheap: the server card, and a plain 404 for every other /.well-known file, so a client
  // looking for OAuth metadata learns there is none instead of reading a refusal as a sign-in wall.
  gate.get('/.well-known/mcp/server-card.json', (c) => c.json(hostedServerCard(), 200, { 'cache-control': 'public, max-age=3600' }))
  // /mcp-oauth signs in, so its metadata is published (RFC 9728); /mcp needs no sign-in and has none.
  gate.get('/.well-known/oauth-protected-resource/mcp-oauth', (c) => c.json(oauthResourceMetadata(), 200, { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' }))
  gate.all('/.well-known/*', (c) => refuse(c, 404, 'not_found', `${c.req.path} is not published by hosted Octocrawl`, ['the server card is at /.well-known/mcp/server-card.json; no sign-in is needed: call POST /mcp without an Authorization header']))
  gate.use('*', async (c, next) => {
    const method = c.req.method
    const path = c.req.path
    const starts = method === 'POST' && (path === '/v1/scrape' || path === '/v1/map')
    const reads = method === 'GET' && (path.startsWith('/v1/scrapes/') || path.startsWith('/v1/maps/'))
    const jobRoute = jobRoutes !== null && isJobRoute(method, path)
    const jobStart = jobRoute && method === 'POST' && (path === '/v1/batches' || path === '/v1/crawl')
    if (method === 'GET' && path === '/health') return next()
    if (!starts && !reads && !jobRoute) {
      return refuse(c, 403, 'hosted_unavailable', jobRoutes === null
        ? `${method} ${path} is not served by hosted Octocrawl: scrape and map only (POST /v1/scrape, POST /v1/map)`
        : `${method} ${path} is not served by hosted Octocrawl: scrape and map, and with an account crawl and batch jobs (POST /v1/crawl, POST /v1/batches)`,
      [LOCAL_HINT, 'Monitors, logins and /fc run on your computer'])
    }
    // The site's signed header is checked without a store, and every Playground call comes from the site's few addresses,
    // so it is not counted per address; the account's own rate below still applies.
    const signed = c.req.header(SITE_ACCOUNT_HEADER)
    let caller: HostedCaller | 'unknown_key' | 'oauth_token' | 'oauth_ended'
    if (signed !== undefined) {
      const uid = verifySiteAccount(config.hashKey, signed)
      if (uid === null) return refuse(c, 401, 'unauthorized', 'the site\'s account header is not valid, or it expired', ['sign in again at https://octocrawl.dev/dashboard/'])
      caller = { kind: 'key', id: `playground:${uid}`, uid, dailyLimit: 0, browser: true, plan: 'account' }
    } else {
      // Every request counts against its address first, before any lookup, so a flood of made-up keys reaches no store.
      // A call the MCP handler makes in this process (a wait's polls among them) was counted with its MCP POST.
      const internal = c.req.header(INTERNAL_SECRET_HEADER)
      const fromInside = internal !== undefined && sameSecret(internal, internalSecret)
      const addressWait = fromInside ? null : addressLimiter.retryAfterSeconds(digest(config.hashKey, 'ip', c.env.socketAddress))
      if (addressWait !== null) return refuse(c, 429, 'rate_limited', `too many requests from this address: at most ${config.addressPerMinute ?? ADDRESS_PER_MINUTE} a minute`, [`retry after ${addressWait} s`], { 'Retry-After': String(addressWait) })
      caller = await identify(c.req.raw.headers, c.env.socketAddress, starts || jobStart)
    }
    if (caller === 'oauth_token') return refuse(c, 401, 'unauthorized', `an OAuth access token works only at the MCP endpoint ${MCP_OAUTH_RESOURCE}`, ['call the API with an account key (oc_...) from https://octocrawl.dev/dashboard/'])
    // Reached only between /mcp-oauth's own fresh read and this one: the person signs in again, they hold no key.
    if (caller === 'oauth_ended') return refuse(c, 401, 'unauthorized', 'this connection was disconnected or its sign-in expired: sign in again', [])
    if (caller === 'unknown_key') return refuse(c, 401, 'unauthorized', 'this key is not one Octocrawl issued, or it was revoked', ['send no Authorization header to use the keyless allowance, or ask for a key at https://octocrawl.dev/docs/connect-mcp/?utm_source=hosted&utm_medium=hint'])
    c.set('caller', caller)
    if (jobRoute) {
      // A job spends an account's credits over many pages: keyless callers and keys without an account have none to spend.
      if (caller.kind !== 'key' || caller.uid === undefined) return refuse(c, 403, 'jobs_need_account', 'hosted batch and crawl jobs need an account\'s key', [signInHint, 'or run it on your computer: npx octocrawl serve'])
      if (jobStart) {
        const wait = keyLimiter.retryAfterSeconds(caller.id)
        if (wait !== null) return refuse(c, 429, 'rate_limited', `too many requests: at most ${KEY_PER_MINUTE} starts a minute`, [`retry after ${wait} s`], { 'Retry-After': String(wait) })
      }
      return jobRoutes!.handle(c.req.raw, { uid: caller.uid, keyId: caller.id, browser: caller.browser })
    }
    if (!starts) return next()
    const limiter = caller.kind === 'key' ? keyLimiter : caller.pool === 'claude' ? claudeLimiter : keylessLimiter
    const retryAfter = limiter.retryAfterSeconds(caller.id)
    if (retryAfter !== null) return refuse(c, 429, 'rate_limited', `too many requests: at most ${caller.kind === 'key' ? KEY_PER_MINUTE : caller.pool === 'claude' ? CLAUDE_PER_MINUTE : KEYLESS_PER_MINUTE} starts a minute`, [`retry after ${retryAfter} s`], { 'Retry-After': String(retryAfter) })
    const now = new Date()
    const day = utcDay(now)
    // A key's scrape that may use the browser lane holds the key's lease for its run: a second one waits (ROADMAP PH item 1).
    // A request that asks for the HTTP lane alone (fastMode) needs none.
    let lease: { release: () => Promise<void> } | null = null
    if (path === '/v1/scrape' && caller.kind === 'key' && caller.browser && !(await asksHttpOnly(c))) {
      const taken = await leases.acquire(`browser-${caller.id}`, BROWSER_LEASE_MS, now)
      if (!taken.ok) {
        return refuse(c, 429, 'browser_busy', 'this key already has a scrape running on the browser lane: one at a time per key', [`retry after ${taken.retryAfterSeconds} s, when the running call ends`, 'or send fastMode: true to read this page over HTTP alone'], { 'Retry-After': String(taken.retryAfterSeconds) })
      }
      lease = taken
    }
    try {
      return await keyedStart(c, caller, path, day, now, next)
    } finally {
      await lease?.release().catch((error: unknown) => log(JSON.stringify({ severity: 'WARNING', event: 'hosted_lease_release_failed', message: error instanceof Error ? error.message : String(error) })))
    }
  })

  /** Whether a scrape body asks for the HTTP lane alone; a body that is not JSON does not (it is refused later). */
  async function asksHttpOnly(c: Context<GateEnv>): Promise<boolean> {
    const body = await c.req.json().catch(() => null) as { fastMode?: unknown } | null
    return body !== null && typeof body === 'object' && body.fastMode === true
  }

  /**
   * The day's usage line for a start: a key's per key (its digest's first 16 characters, never the key); a keyless one
   * per address, by the first 16 characters of the address's keyed hash, the daily counter's (never the address), or as
   * Claude's pool, so active keyless addresses can be counted (GTM gate R5).
   */
  function logUsage(caller: HostedCaller, path: string, day: string): void {
    if (caller.kind === 'keyless') {
      log(JSON.stringify({ severity: 'INFO', event: 'hosted_keyless_usage', address: caller.pool === 'claude' ? null : caller.id.slice(0, 16), pool: caller.pool === 'claude' ? 'claude' : 'address', endpoint: path === '/v1/scrape' ? 'scrape' : 'map', day }))
      return
    }
    if (caller.kind !== 'key') return
    log(JSON.stringify({ severity: 'INFO', event: 'hosted_usage', key: caller.id.slice(0, 16), plan: caller.plan, ...(caller.uid === undefined ? {} : { uid: caller.uid }), endpoint: path === '/v1/scrape' ? 'scrape' : 'map', day }))
  }

  /** A start that passed the rate limits: an account's key spends credits, any other caller its daily allowance. */
  async function keyedStart(c: Context<GateEnv>, caller: HostedCaller, path: string, day: string, now: Date, next: () => Promise<void>) {
    if (caller.uid !== undefined) return accountStart(c, caller, caller.uid, path, day, now, next)
    const keylessTotal = `${day}-keyless`
    const entries: QuotaEntry[] = [
      { id: `${day}-site`, limit: siteDaily, alert: true },
      ...(caller.kind === 'keyless' ? [{ id: keylessTotal, limit: keylessTotalDaily, alert: true }] : []),
      // Claude's pool is shared by every connector's user; an address's or a key's own day is one caller's.
      { id: `${day}-${caller.kind}-${caller.id}`, limit: caller.dailyLimit, alert: caller.pool === 'claude' },
    ]
    const quota = await config.quota.consume(entries, now)
    if (!quota.ok) {
      const seconds = secondsToUtcMidnight(now)
      const site = quota.limited.endsWith('-site')
      const shared = quota.limited === keylessTotal
      return refuse(c, 429, 'quota_exhausted', site ? `hosted Octocrawl has served the ${quota.limit} pages a day it serves without an account` : shared ? `the ${quota.limit} pages a day that hosted Octocrawl serves without a key are used up` : caller.pool === 'claude' ? `the ${quota.limit} pages a day that every Claude connector without a key shares are used up` : `the ${caller.kind === 'key' ? 'key' : 'keyless'} allowance of ${quota.limit} pages a day is used up`,
        [...(caller.kind === 'keyless' ? [signInHint] : []), LOCAL_HINT, `the allowance resets at 00:00 UTC, in ${seconds} s`], { 'Retry-After': String(seconds) })
    }
    logQuotaThresholds(entries, quota.counts, day, log)
    logUsage(caller, path, day)
    if (path === '/v1/scrape') {
      // The scrape route runs here with the request pinned: nothing is stored for reuse (the page cache would grow with every
      // caller's pages), and a caller without the browser lane reads over HTTP alone (`fastMode`). The inner app serves map and the reads.
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: 'the request body must be JSON', code: 'invalid_json' }, 400) }
      const pinned = body !== null && typeof body === 'object' && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>), storeInCache: false, ...(caller.browser ? {} : { fastMode: true }) }
        : body
      const req = parseScrapeRequest(pinned)
      // The model's +2 is charged in credits, which only an account has.
      const modelGate = { admit: async () => ({ ok: false as const, message: config.model === undefined ? MODEL_REFUSALS.notOffered : MODEL_REFUSALS.needsAccount }) }
      return c.json(await engine.scrape(req, { signal: c.req.raw.signal, modelGate, observe: (run, scrapeId) => log(JSON.stringify(scrapePhaseLine(req.url, run, scrapeId))), ...(caller.browser ? {} : httpOnlyPin(body, HTTP_ONLY_HINTS[caller.kind])) }), 200)
    }
    await next()
    return c.res
  }
  /**
   * A start by an account's key: reserves what the call could cost (five credits where the browser lane may answer, one
   * for an HTTP page or a map, two more where the json model fallback may be called), runs it, then settles at what its
   * result cost and says so in `X-Credits-Used` and `X-Credits-Remaining`, and the model's part in `X-Credits-Model`.
   * An account with too few credits for the model's two runs the page without it; with at least one credit but fewer
   * than five, it reads over HTTP alone this time.
   */
  async function accountStart(c: Context<GateEnv>, caller: HostedCaller, uid: string, path: string, day: string, now: Date, next: () => Promise<void>) {
    const credits = config.credits
    if (credits === undefined) return c.json({ error: 'account credits are unavailable on this server', code: 'internal_error' }, 503)
    const accounts = { id: `${day}-accounts`, limit: accountsDaily, alert: true }
    const quotas: QuotaEntry[] = [accounts, { id: `${day}-account-${uid}`, limit: accountDaily }]
    const isScrape = path === '/v1/scrape'
    let browser = isScrape && caller.browser
    // The model's two credits are reserved only where it may be called: asked for, and offered (configured, switched on).
    const wantsModel = isScrape && asksModelFallback((await c.req.json().catch(() => null) as { formats?: unknown } | null)?.formats)
    const offered = wantsModel && config.model !== undefined && await config.model.offered()
    let modelExtra = offered ? CREDITS.model : 0
    let modelRefusal: string | null = modelExtra > 0 ? null : config.model === undefined ? MODEL_REFUSALS.notOffered : MODEL_REFUSALS.switchedOff
    const reserve = (amount: number) => credits.reserve(uid, amount, quotas, now).catch((error: unknown) => {
      // A commit that timed out may still have applied: the line names what may have been taken, to check against credits/{uid}.
      log(JSON.stringify({ severity: 'ERROR', event: 'hosted_credits_reserve_failed', uid, amount, message: error instanceof Error ? error.message : String(error) }))
      throw error
    })
    const base = () => browser ? CREDITS.browserPage : isScrape ? CREDITS.httpPage : CREDITS.map
    let reserved = await reserve(base() + modelExtra)
    if (!reserved.ok && reserved.limited === 'credits' && modelExtra > 0) {
      modelExtra = 0
      modelRefusal = MODEL_REFUSALS.credits
      reserved = await reserve(base())
    }
    if (!reserved.ok && reserved.limited === 'credits' && browser && reserved.remaining >= CREDITS.httpPage) {
      browser = false
      reserved = await reserve(CREDITS.httpPage)
    }
    if (!reserved.ok) {
      // A key the API still had cached for a minute after its account was deleted (public-preview auth.ts).
      if (reserved.limited === 'account') return refuse(c, 401, 'unauthorized', 'this key\'s account no longer exists', [])
      if (reserved.limited === 'quota') {
        const seconds = secondsToUtcMidnight(now)
        return refuse(c, 429, 'quota_exhausted', reserved.id === accounts.id ? `hosted Octocrawl has served the ${reserved.limit} pages a day it serves to accounts` : `this account has started its ${reserved.limit} hosted pages for today`, [LOCAL_HINT, `the allowance resets at 00:00 UTC, in ${seconds} s`], { 'Retry-After': String(seconds) })
      }
      const seconds = secondsToNextGrant(now)
      return refuse(c, 429, 'quota_exhausted', `this account's credits are used up (${reserved.remaining} left)`,
        [`the monthly credits come back on the 1st at 00:00 UTC, in ${seconds} s`, LOCAL_HINT], { 'Retry-After': String(seconds), 'X-Credits-Remaining': String(reserved.remaining) })
    }
    logQuotaThresholds(quotas, reserved.counts, day, log)
    logUsage(caller, path, day)
    const reservation: Reservation = reserved.reservation
    let charge: ReturnType<typeof scrapeCharge> = { credits: 0, kind: 'unread' }
    let modelCharged = 0
    // The call's line for the dashboard's Activity page: what was asked for, then what came back.
    const note: RequestNote = { endpoint: isScrape ? 'scrape' : 'map', keyId: caller.id, url: '', finalUrl: null, lane: null, status: 'error', httpStatus: null, reason: null, robots: null, sha256: null, links: null, formats: null, ms: null, scrapeId: null, paidCallIds: null }
    // From the call's arrival at the gate, so the reservation's round trip counts too.
    const started = now.getTime()
    const settle = async () => {
      note.ms = Date.now() - started
      if (wantsModel) note.modelCredits = modelCharged
      const used = charge.credits + modelCharged
      log(JSON.stringify({ severity: 'INFO', event: 'hosted_credits', uid, kind: charge.kind, used, ...(wantsModel ? { model: modelCharged } : {}), reserved: reservation.fromGrant + reservation.fromPurchased }))
      // A settle that fails keeps what was reserved: the call is answered, and the log names the credits to give back.
      return credits.settle(reservation, used, charge.kind, now, note, modelCharged > 0 ? { [charge.kind]: 1, model: 1 } : undefined).catch((error: unknown) => {
        log(JSON.stringify({ severity: 'ERROR', event: 'hosted_credits_settle_failed', uid, reserved: reservation.fromGrant + reservation.fromPurchased, used, message: error instanceof Error ? error.message : String(error) }))
        return null
      })
    }
    let response: Response
    try {
      if (isScrape) {
        let body: unknown = null
        let parsed = true
        try { body = await c.req.json() } catch { parsed = false }
        note.url = requestedUrl(body)
        note.formats = requestedFormats(body)
        if (!parsed) { note.status = 'invalid_request'; response = c.json({ error: 'the request body must be JSON', code: 'invalid_json' }, 400) } else {
          const pinned = body !== null && typeof body === 'object' && !Array.isArray(body)
            ? { ...(body as Record<string, unknown>), storeInCache: false, ...(browser ? {} : { fastMode: true }) }
            : body
          const model = config.model?.gate(modelRefusal) ?? null
          const modelGate = model?.gate ?? { admit: async () => ({ ok: false as const, message: MODEL_REFUSALS.notOffered }) }
          const req = parseScrapeRequest(pinned)
          const result = await engine.scrape(req, { signal: c.req.raw.signal, modelGate, observe: (run, scrapeId) => log(JSON.stringify(scrapePhaseLine(req.url, run, scrapeId))), ...(browser ? {} : httpOnlyPin(body, caller.browser ? HTTP_ONLY_HINTS.credits : HTTP_ONLY_HINTS.key)) })
          charge = scrapeCharge(result as Parameters<typeof scrapeCharge>[0])
          // Two more where the model was called for the page: never more than was reserved, as only a reserved gate admits.
          modelCharged = modelExtra > 0 && (model?.pagesCalled() ?? 0) > 0 ? CREDITS.model : 0
          noteScrape(note, result)
          response = c.json(result, 200)
        }
      } else {
        note.url = requestedUrl(await c.req.raw.clone().json().catch(() => null))
        await next()
        const answer = await c.res.clone().json().catch(() => ({})) as { status?: unknown; links?: unknown }
        if (c.res.status === 200) charge = mapCharge(answer)
        note.status = c.res.status === 200 && typeof answer.status === 'string' ? answer.status : c.res.status >= 500 ? 'error' : 'invalid_request'
        note.links = Array.isArray(answer.links) ? answer.links.length : null
        response = new Response(c.res.body, c.res)
      }
    } catch (error) {
      // A refused request, an engine error or a cancelled call cost nothing: everything reserved goes back.
      charge = { credits: 0, kind: 'unread' }
      modelCharged = 0
      note.status = error instanceof RequestError ? 'invalid_request' : 'error'
      await settle()
      throw error
    }
    const settled = await settle()
    response.headers.set('X-Credits-Used', String(charge.credits + modelCharged))
    if (wantsModel) response.headers.set('X-Credits-Model', String(modelCharged))
    if (settled !== null) response.headers.set('X-Credits-Remaining', String(settled.remaining))
    c.res = response
    return response
  }

  gate.route('/', inner)
  gate.onError((error, c) => {
    if (error instanceof RequestError) return c.json({ error: error.message, code: error.code, ...(error.agentHints && error.agentHints.length > 0 ? { agentHints: error.agentHints } : {}) }, API_ERROR_STATUS[error.code])
    log(JSON.stringify({ severity: 'ERROR', event: 'hosted_api_error', message: error instanceof Error ? error.message : String(error) }))
    return c.json({ error: 'internal error', code: 'internal_error' }, 500)
  })

  const apiListener = getRequestListener(async (request, { incoming }) => {
    // The gate reads the socket address through a context variable, set per request from the node socket.
    const address = clientAddress(incoming as IncomingMessage, config.proxySecret)
    return gate.fetch(request, { socketAddress: address })
  }) as unknown as (req: IncomingMessage, res: ServerResponse) => void
  const calls = new InFlightCalls()
  const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }).end(JSON.stringify(body))
  }

  /** /mcp-oauth's challenge (RFC 6750 §3, RFC 9728 §5.1): no error code when no token came, so the client starts sign-in. */
  const challenge = (error?: 'invalid_token') => `Bearer resource_metadata="${MCP_OAUTH_RESOURCE_METADATA}", scope="${OAUTH_SCOPE}"${error === undefined ? '' : `, error="${error}"`}`

  const OAUTH_ENDED = { error: 'this access token is not valid: it expired, or its connection was ended' }
  const oauthPresented = (authorization: string | undefined) => typeof authorization === 'string' && /^bearer /i.test(authorization) ? authorization.slice(7).trim() : ''
  /** Whether a JSON-RPC message, or any message of a batch, calls a tool. */
  const callsTool = (message: unknown): boolean => Array.isArray(message) ? message.some(callsTool)
    : message !== null && typeof message === 'object' && (message as { method?: unknown }).method === 'tools/call'

  /** /mcp: keyless or an account key. /mcp-oauth (`oauth`): an OAuth access token only, and 401 with a challenge without one. */
  const mcp = async (req: IncomingMessage, res: ServerResponse, oauth: boolean): Promise<void> => {
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? '')) { sendJson(res, 405, { error: 'method not allowed' }); return }
    const version = req.headers['mcp-protocol-version']
    if (!servesProtocolVersion(version)) { sendJson(res, 400, unsupportedProtocolVersion(version)); return }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'stream and session management unavailable: every request is answered on its own POST' }); return }
    const address = clientAddress(req, config.proxySecret)
    const addressWait = addressLimiter.retryAfterSeconds(digest(config.hashKey, 'ip', address))
    if (addressWait !== null) { sendJson(res, 429, { error: `too many requests from this address: at most ${ADDRESS_PER_MINUTE} a minute` }, { 'retry-after': String(addressWait) }); return }
    const headers = new Headers()
    const authorization = req.headers.authorization
    if (typeof authorization === 'string') headers.set('authorization', authorization)
    let caller: HostedCaller
    if (oauth) {
      const presented = oauthPresented(authorization)
      if (presented === '') { sendJson(res, 401, { error: 'sign in to Octocrawl to connect: this endpoint takes an OAuth access token' }, { 'www-authenticate': challenge() }); return }
      const connection = await identifyOAuth(presented)
      if (connection === null) { sendJson(res, 401, OAUTH_ENDED, { 'www-authenticate': challenge('invalid_token') }); return }
      caller = connection
    } else {
      const identified = await identify(headers, address)
      if (identified === 'unknown_key' || identified === 'oauth_token' || identified === 'oauth_ended') { sendJson(res, 401, { error: 'this key is not one Octocrawl issued, or it was revoked' }, { 'www-authenticate': 'Bearer' }); return }
      caller = identified
    }
    const size = Number(req.headers['content-length'] ?? 0)
    if (size > BODY_LIMIT) { sendJson(res, 413, { error: 'request too large' }); return }
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.byteLength
      if (bytes > BODY_LIMIT) { sendJson(res, 413, { error: 'request too large' }); return }
      chunks.push(buffer)
    }
    let parsed: unknown
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { sendJson(res, 400, { error: 'invalid JSON' }); return }
    // A tool call reads the token and its connection past the cache, so a connection disconnected on the dashboard is
    // answered 401 at once and the client signs in again, rather than a tool error for up to a minute. Other methods keep the cache.
    if (oauth && callsTool(parsed)) {
      const connection = await identifyOAuth(oauthPresented(authorization), true)
      if (connection === null) { sendJson(res, 401, OAUTH_ENDED, { 'www-authenticate': challenge('invalid_token') }); return }
      caller = connection
    }
    // Which MCP clients connect (GTM gate R5): the name and version a client gives when it initializes, and nothing else
    // of it. Only a body that is one initialize: the protocol never batches it, and a batch could fill the log.
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as { method?: unknown }).method === 'initialize') {
      const info = (parsed as { params?: { clientInfo?: { name?: unknown; version?: unknown } } }).params?.clientInfo
      log(JSON.stringify({ severity: 'INFO', event: 'hosted_mcp_initialize', endpoint: oauth ? '/mcp-oauth' : '/mcp', caller: oauth ? 'oauth' : caller.kind, client: clientText(info?.name), clientVersion: clientText(info?.version) }))
    }
    // The tools call the API in-process through the gate, so quota, lane and refusals are the REST ones.
    const client = new W2L({
      baseUrl: 'http://hosted.internal',
      ...(typeof authorization === 'string' ? { token: authorization.replace(/^Bearer\s+/i, '') } : {}),
      fetch: async (input, init) => {
        const request = await withMcpScrapeDeadline(new Request(input, init))
        // Every call from here is this handler's own: the MCP POST that carries it was counted against the address already.
        request.headers.set(INTERNAL_SECRET_HEADER, internalSecret)
        if (caller.kind === 'keyless') request.headers.set(INTERNAL_CLIENT_HEADER, address)
        // The gate takes an access token only from this handler, and reads it again there (fresh for a start).
        if (oauth) request.headers.set(OAUTH_SECRET_HEADER, oauthSecret)
        return gate.fetch(request, { socketAddress: address })
      },
    })
    const post = trackPost(calls, req, res, parsed, [caller.id])
    // An account's connection, on a server that runs jobs, is offered the job tools too.
    const account = jobRoutes !== null && caller.kind === 'key' && caller.uid !== undefined
    // While jobs are invite only (hostedConfig/jobs.allowedUids), an account not on the list is not offered them.
    const invited = account && await jobRoutes!.allows(caller.uid!)
    const jobs = account && invited
    const tools = oauth ? oauthTools(caller.browser, jobs) : hostedTools(caller.browser === true, jobs)
    const instructions = serverInstructions(tools.map((tool) => tool.name), { kind: 'hosted', connection: oauth ? 'oauth' : caller.kind === 'key' ? 'key' : 'keyless', browser: caller.browser === true, sharedPool: caller.kind === 'keyless' && caller.pool === 'claude' })
    await serveMcpPost(req, res, parsed, () => createMcpServer(client, {
      allowedTools: jobs ? new Set([...HOSTED_API_TOOLS, ...HOSTED_JOB_TOOLS]) : HOSTED_API_TOOLS,
      tools,
      instructions,
      minimalResults: true,
      calls: post,
      unavailableHint: jobs
        ? 'Monitors and saved logins run on a server on your computer: npx octocrawl serve, then npx -y @octocrawl/mcp.'
        : account
          ? 'Hosted crawls and batches are open to invited accounts for now. They, Monitors and saved logins run on a server on your computer: npx octocrawl serve, then npx -y @octocrawl/mcp.'
          : jobRoutes !== null
          ? `Crawls and batches run on hosted Octocrawl for an account: connect with an account's key from https://octocrawl.dev/dashboard/ or sign in at ${MCP_OAUTH_RESOURCE}. Monitors and saved logins run on a server on your computer: npx octocrawl serve, then npx -y @octocrawl/mcp.`
          : 'Crawls, batches, Monitors and saved logins run on a server on your computer: npx octocrawl serve, then npx -y @octocrawl/mcp.',
      normalizeCall: (name, args) => {
        if (HOSTED_JOB_TOOLS.has(name)) {
          if (!jobs) throw new Error(`${name} runs a hosted job, which needs an account: connect with an account's key from https://octocrawl.dev/dashboard/ or sign in at ${MCP_OAUTH_RESOURCE}, or run it on your computer: ${LOCAL_HINT}`)
          // A wait ends within this request's deadline, with the status so far.
          const call = { ...((args ?? {}) as Record<string, unknown>) }
          // The start's answer would carry the webhook's secret into the agent's transcript (H2 W2).
          if (call.webhook !== undefined && call.webhook !== null) throw new Error(`${name} on hosted Octocrawl takes no webhook over MCP, since the answer carries its signing secret; start the job with POST /v1/${name === 'crawl' ? 'crawl' : 'batches'} to have its end posted`)
          // debug on an error list only keeps the items whole here (withoutTelemetry); the list itself takes none.
          if (name === 'get_batch_errors' || name === 'get_crawl_errors') delete call.debug
          if (typeof call.timeoutMs === 'number') call.timeoutMs = Math.min(call.timeoutMs, HOSTED_MCP_WAIT_MS)
          for (const key of ['limit', 'maxResults']) if (typeof call[key] === 'number') call[key] = Math.min(call[key] as number, HOSTED_MCP_LIST_MAX)
          return call
        }
        if (!HOSTED_API_TOOLS.has(name)) throw new Error(`${name} is not served by hosted Octocrawl: scrape, map and scrape_product only; ${LOCAL_HINT}`)
        if (name === 'scrape_product' && !caller.browser) throw new Error('scrape_product reads Amazon.sg in a browser, which needs a key; keyless callers use scrape over HTTP')
        return name === 'scrape' ? hostedScrapeArguments(args) : args
      },
    }))
  }

  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://hosted.internal').pathname
    if (pathname === '/mcp' || pathname === '/mcp-oauth') {
      mcp(req, res, pathname === '/mcp-oauth').catch((error) => {
        log(JSON.stringify({ severity: 'ERROR', event: 'hosted_mcp_error', message: error instanceof Error ? error.message : String(error) }))
        if (!res.headersSent) sendJson(res, 500, { error: 'internal error' }); else res.end()
      })
      return
    }
    apiListener(req, res)
  })
  server.requestTimeout = 120_000
  // A crawl's extraction runs in this process and can stall it past the keep-alive timeout: a request sent meanwhile is answered, not reset.
  closeIdleOnlyWhenUnread(server)
  server.listen(config.port, config.host ?? '127.0.0.1')
  let closing: Promise<void> | null = null
  return {
    server, engine,
    close: () => {
      closing ??= (async () => {
        clearInterval(sweeper)
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await engine.close({ cancelActive: true })
      })()
      return closing
    },
  }
}

// ---- Firestore stores: the key records an operator writes with scripts/hosted/issue-key.mjs, and the daily counters ----

interface FirestoreDoc { name: string; fields?: Record<string, { integerValue?: string; stringValue?: string; booleanValue?: boolean; timestampValue?: string }>; updateTime?: string }

/** An access token for the Cloud Run service identity, from the metadata server, kept until a minute before it expires. */
const tokenCache = new WeakMap<typeof fetch, { token: string; until: number }>()
async function metadataAccessToken(fetcher: typeof fetch, signal: AbortSignal): Promise<string> {
  const cached = tokenCache.get(fetcher)
  if (cached && Date.now() < cached.until) return cached.token
  const response = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' }, signal })
  if (!response.ok) throw new Error('Cloud Run service identity is unavailable')
  const body = await response.json() as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('Cloud Run service identity returned no token')
  const seconds = typeof body.expires_in === 'number' && body.expires_in > 120 ? body.expires_in : 300
  tokenCache.set(fetcher, { token: body.access_token, until: Date.now() + (seconds - 60) * 1000 })
  return body.access_token
}

/** The service identity's access token, for a store outside this file (the credits ledger, hostedCredits.ts). */
export function serviceAccessToken(fetcher: typeof fetch = fetch): () => Promise<string> {
  return () => metadataAccessToken(fetcher, AbortSignal.timeout(3_000))
}

function firestoreBase(projectId: string): { resource: string; endpoint: string } {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
  const resource = `projects/${projectId}/databases/(default)/documents`
  return { resource, endpoint: `https://firestore.googleapis.com/v1/${resource}` }
}

/**
 * Key records under `hostedApiKeys/{hmac}`: enabled, plan, dailyLimit, browser, label. A lookup is cached for a minute for
 * what starts no work (the MCP tool list, reading a result); a start reads the record fresh, so a revoked key stops there.
 */
export class FirestoreHostedKeys implements HostedKeys {
  private readonly base: { resource: string; endpoint: string }
  private readonly cache = new BoundedMap<string, { at: number; record: HostedKeyRecord | null }>(REMEMBERED_CALLERS)
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch, private readonly cacheMs = 60_000, private readonly clock: () => number = Date.now) { this.base = firestoreBase(projectId) }
  async lookup(keyHash: string, options: { fresh?: boolean } = {}): Promise<HostedKeyRecord | null> {
    const cached = this.cache.get(keyHash)
    if (options.fresh !== true && cached && this.clock() - cached.at < this.cacheMs) return cached.record
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    const response = await this.fetcher(`${this.base.endpoint}/hostedApiKeys/${keyHash}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    let record: HostedKeyRecord | null = null
    if (response.status !== 404) {
      if (!response.ok) throw new Error(`key store read failed (${response.status})`)
      const doc = await response.json() as FirestoreDoc
      const fields = doc.fields ?? {}
      const dailyLimit = Number(fields.dailyLimit?.integerValue)
      record = {
        enabled: fields.enabled?.booleanValue === true,
        plan: fields.plan?.stringValue ?? 'free',
        dailyLimit: Number.isSafeInteger(dailyLimit) && dailyLimit > 0 ? dailyLimit : 0,
        browser: fields.browser?.booleanValue === true,
        ...(fields.label?.stringValue === undefined ? {} : { label: fields.label.stringValue }),
        ...(fields.uid?.stringValue === undefined ? {} : { uid: fields.uid.stringValue }),
        ...(fields.kind?.stringValue === 'oauth' ? { kind: 'oauth' as const } : {}),
      }
    }
    this.cache.set(keyHash, { at: this.clock(), record })
    return record
  }
}

/**
 * Access tokens under `oauthTokens/{accessTokenDigest}`: keyId, resource and expiresAt, written by the authorization server
 * on octocrawl.dev. A lookup is cached for a minute, as a key's is; a start reads it fresh. A record missing a field is no token.
 */
export class FirestoreHostedOAuthTokens implements HostedOAuthTokens {
  private readonly base: { resource: string; endpoint: string }
  private readonly cache = new BoundedMap<string, { at: number; record: HostedOAuthTokenRecord | null }>(REMEMBERED_CALLERS)
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch, private readonly cacheMs = 60_000, private readonly clock: () => number = Date.now) { this.base = firestoreBase(projectId) }
  async lookup(tokenHash: string, options: { fresh?: boolean } = {}): Promise<HostedOAuthTokenRecord | null> {
    const cached = this.cache.get(tokenHash)
    if (options.fresh !== true && cached && this.clock() - cached.at < this.cacheMs) return cached.record
    const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
    const response = await this.fetcher(`${this.base.endpoint}/oauthTokens/${tokenHash}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    let record: HostedOAuthTokenRecord | null = null
    if (response.status !== 404) {
      if (!response.ok) throw new Error(`token store read failed (${response.status})`)
      const fields = (await response.json() as FirestoreDoc).fields ?? {}
      const expiresAt = Date.parse(fields.expiresAt?.timestampValue ?? '')
      const keyId = fields.keyId?.stringValue
      const resource = fields.resource?.stringValue
      if (keyId !== undefined && resource !== undefined && Number.isFinite(expiresAt)) record = { keyId, resource, expiresAt }
    }
    this.cache.set(tokenHash, { at: this.clock(), record })
    return record
  }
}

/**
 * Browser-lane leases under `hostedLeases/{id}`: `expireAt` and the holder's token, taken in a commit with an update-time
 * precondition (one instance wins a race), deleted on release only while the holder's own write stands. A lease whose
 * `expireAt` has passed is taken over; `expireAt` also suits a Firestore TTL policy.
 */
export class FirestoreHostedLeases implements HostedLeases {
  private readonly base: { resource: string; endpoint: string }
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch) { this.base = firestoreBase(projectId) }
  async acquire(id: string, ttlMs: number, now = new Date()): Promise<{ ok: true; release: () => Promise<void> } | { ok: false; retryAfterSeconds: number }> {
    const name = `${this.base.resource}/hostedLeases/${id}`
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
      const read = await this.fetcher(`https://firestore.googleapis.com/v1/${name}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
      let updateTime: string | null = null
      if (read.status !== 404) {
        if (!read.ok) throw new Error(`lease read failed (${read.status})`)
        const doc = await read.json() as { updateTime?: string; fields?: { expireAt?: { timestampValue?: string } } }
        const until = Date.parse(doc.fields?.expireAt?.timestampValue ?? '')
        if (Number.isFinite(until) && until > now.getTime()) return { ok: false, retryAfterSeconds: busyFor(until, now.getTime()) }
        updateTime = doc.updateTime ?? null
        if (updateTime === null) throw new Error('lease document is malformed')
      }
      const holder = randomBytes(12).toString('hex')
      const commit = await this.fetcher(`${this.base.endpoint}:commit`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
        body: JSON.stringify({ writes: [{
          update: { name, fields: { holder: { stringValue: holder }, expireAt: { timestampValue: new Date(now.getTime() + ttlMs).toISOString() } } },
          currentDocument: updateTime === null ? { exists: false } : { updateTime },
        }] }),
      })
      if (commit.status === 409 || commit.status === 412) continue
      if (commit.status === 400) {
        const error = await commit.json().catch(() => null) as { error?: { status?: string } } | null
        if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED') continue
        throw new Error('lease commit failed (400)')
      }
      if (!commit.ok) throw new Error(`lease commit failed (${commit.status})`)
      const written = (await commit.json() as { writeResults?: { updateTime?: string }[] }).writeResults?.[0]?.updateTime
      return {
        ok: true,
        release: async () => {
          if (written === undefined) return
          const releaseToken = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
          // Deleted only while our write stands: a lease that expired and was taken over is the new holder's.
          const response = await this.fetcher(`${this.base.endpoint}:commit`, {
            method: 'POST', headers: { authorization: `Bearer ${releaseToken}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
            body: JSON.stringify({ writes: [{ delete: name, currentDocument: { updateTime: written } }] }),
          })
          if (!response.ok && response.status !== 400 && response.status !== 409 && response.status !== 412) throw new Error(`lease release failed (${response.status})`)
        },
      }
    }
    // Lost every race for the lease: someone else holds it now.
    return { ok: false, retryAfterSeconds: 1 }
  }
}

/** Daily counters under `hostedQuotas/{id}`, consumed in one commit with update-time preconditions, as the preview's quota. */
export class FirestoreHostedQuota implements HostedQuota {
  private readonly base: { resource: string; endpoint: string }
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch) { this.base = firestoreBase(projectId) }
  async consume(entries: readonly QuotaEntry[], now = new Date()): Promise<QuotaResult> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const token = await metadataAccessToken(this.fetcher, AbortSignal.timeout(3_000))
      const reads = await Promise.all(entries.map((entry) => this.read(`${this.base.resource}/hostedQuotas/${entry.id}`, token)))
      for (const [index, entry] of entries.entries()) if (reads[index]!.count >= entry.limit) return { ok: false, limited: entry.id, limit: entry.limit }
      const expireAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2)).toISOString()
      const response = await this.fetcher(`${this.base.endpoint}:commit`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
        body: JSON.stringify({ writes: reads.map((doc) => ({
          update: { name: doc.name, fields: { count: { integerValue: String(doc.count + 1) }, expireAt: { timestampValue: expireAt } } },
          currentDocument: doc.updateTime === null ? { exists: false } : { updateTime: doc.updateTime },
        })) }),
      })
      if (response.ok) return { ok: true, counts: reads.map((doc) => doc.count + 1) }
      if (response.status === 409 || response.status === 412) continue
      if (response.status === 400) {
        const error = await response.json().catch(() => null) as { error?: { status?: string } } | null
        if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED') continue
      }
      throw new Error(`quota commit failed (${response.status})`)
    }
    throw new Error('quota contention exceeded retry budget')
  }
  private async read(name: string, token: string): Promise<{ name: string; count: number; updateTime: string | null }> {
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${name}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
    if (response.status === 404) return { name, count: 0, updateTime: null }
    if (!response.ok) throw new Error(`quota read failed (${response.status})`)
    const doc = await response.json() as FirestoreDoc
    const count = Number(doc.fields?.count?.integerValue)
    if (doc.name !== name || !Number.isSafeInteger(count) || count < 0 || !doc.updateTime) throw new Error('quota document is malformed')
    return { name, count, updateTime: doc.updateTime }
  }
}
