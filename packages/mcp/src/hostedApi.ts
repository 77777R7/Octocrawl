/**
 * Hosted Octocrawl, phase 1 (ROADMAP PH): the API's hosted mode and a remote
 * MCP endpoint in one process, for `api.octocrawl.dev` and `mcp.octocrawl.dev`.
 *
 * Only scrape and map are served, since both are stateless; every other
 * route and tool is refused by name with a hint to run Octocrawl locally.
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
import { isIP } from 'node:net'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getRequestListener } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'
import { closeIdleOnlyWhenUnread, createApp, createApiEngine, type ApiEngine } from '@w2l/api'
import { API_ERROR_STATUS, hostedNetworkPolicy, HOSTED_MAP_MAX_LIMIT, HOSTED_MAP_MAX_TIMEOUT_MS, parseScrapeRequest, RequestError, withOperatorContact, type NetworkPolicy } from '@w2l/contracts'
import { W2L } from '@w2l/sdk'
import { createMcpServer, MCP_VERSION } from './server.js'
import { TOOLS } from './tools.js'
import { InFlightCalls, trackPost } from './inFlight.js'

/** What a key holder may do. `dailyLimit` counts scrape and map starts per UTC day. */
export interface HostedKeyRecord {
  enabled: boolean
  plan: string
  dailyLimit: number
  /** Whether the browser lane may be used; keyless callers never may. */
  browser: boolean
  label?: string
}

export interface HostedKeys {
  /** The record under the key's HMAC, or null for a key no one issued. */
  lookup(keyHash: string): Promise<HostedKeyRecord | null>
}

export interface QuotaEntry { id: string; limit: number }
export type QuotaResult = { ok: true } | { ok: false; limited: string; limit: number }

export interface HostedQuota {
  /** Consumes one unit of every entry, or none: the first entry at its limit is named. */
  consume(entries: readonly QuotaEntry[], now?: Date): Promise<QuotaResult>
}

export class MemoryHostedKeys implements HostedKeys {
  constructor(private readonly records: ReadonlyMap<string, HostedKeyRecord>) {}
  async lookup(keyHash: string): Promise<HostedKeyRecord | null> { return this.records.get(keyHash) ?? null }
}

export class MemoryHostedQuota implements HostedQuota {
  readonly counts = new Map<string, number>()
  async consume(entries: readonly QuotaEntry[]): Promise<QuotaResult> {
    for (const entry of entries) if ((this.counts.get(entry.id) ?? 0) >= entry.limit) return { ok: false, limited: entry.id, limit: entry.limit }
    for (const entry of entries) this.counts.set(entry.id, (this.counts.get(entry.id) ?? 0) + 1)
    return { ok: true }
  }
}

export const DEFAULT_KEYLESS_DAILY = 20
export const DEFAULT_SITE_DAILY = 1_500
/** Requests per minute a caller may start, so a loop cannot spend a day's allowance in a second. */
export const KEYLESS_PER_MINUTE = 10
export const KEY_PER_MINUTE = 60
/** Requests of any kind per minute from one address, counted before the key lookup, so unknown keys cannot drive the key store. */
export const ADDRESS_PER_MINUTE = 120
/** A file (PDF, CSV, ...) a hosted call may read: the preview's cap. Files land under the task root, which Cloud Run keeps in memory. */
export const HOSTED_MAX_FILE_BYTES = 5 * 1024 * 1024
/** Scrape and map records and saved files are swept from the task root after this long: hosted phase 1 keeps nothing. */
export const HOSTED_RECORD_TTL_MS = 10 * 60_000
const SWEEP_EVERY_MS = 60_000
/** Callers a limiter or cache remembers at most; the oldest are forgotten first, so a flood of addresses or keys cannot grow memory without bound. */
const REMEMBERED_CALLERS = 20_000
/** The tools the remote endpoint offers; the rest are refused by name. */
export const HOSTED_API_TOOLS: ReadonlySet<string> = new Set(['scrape', 'map', 'scrape_product'])
/**
 * What directories that list MCP servers read before, or instead of, a live scan (Smithery's static server card,
 * https://smithery.ai/docs/build/publish): the server, that it needs no sign-in, and the tools it offers, taken from
 * the same definitions tools/list answers with, so the card cannot drift from the server.
 */
export function hostedServerCard() {
  return {
    serverInfo: { name: 'octocrawl', title: 'Octocrawl', version: MCP_VERSION, websiteUrl: 'https://octocrawl.dev/?utm_source=mcp-server-card&utm_medium=listing' },
    authentication: { required: false },
    tools: TOOLS.filter((tool) => HOSTED_API_TOOLS.has(tool.name)),
    resources: [],
    prompts: [],
  }
}
const PROXY_SECRET_HEADER = 'x-w2l-proxy-secret'
const INTERNAL_CLIENT_HEADER = 'x-w2l-hosted-client'
const INTERNAL_SECRET_HEADER = 'x-w2l-hosted-internal'
const BODY_LIMIT = 262_144

export interface HostedApiConfig {
  port: number
  host?: string
  taskRoot: string
  /** HMAC key for key digests and address digests: never the raw key or address is stored or logged. */
  hashKey: string
  keys: HostedKeys
  quota: HostedQuota
  /** Shared with the Cloudflare Worker; proves CF-Connecting-IP. Absent: the socket address is the keyless identity. */
  proxySecret?: string
  keylessDaily?: number
  siteDaily?: number
  /** The public address of this API, named in hints; e.g. https://api.octocrawl.dev */
  publicOrigin?: string
  networkPolicy?: NetworkPolicy
  workerCount?: number
  env?: NodeJS.ProcessEnv
  log?: (line: string) => void
}

export interface HostedCaller {
  kind: 'key' | 'keyless'
  /** The HMAC of the key or of the address: the quota and rate-limit identity. */
  id: string
  dailyLimit: number
  browser: boolean
  plan: string
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
function secondsToUtcMidnight(now: Date): number {
  return Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000))
}
function digest(hashKey: string, kind: 'key' | 'ip', value: string): string {
  return createHmac('sha256', hashKey).update(`${kind}:${value}`).digest('hex')
}
/** The document id a key is stored under: scripts/hosted/issue-key.mjs writes it, the service looks it up. */
export function keyDigest(hashKey: string, key: string): string { return digest(hashKey, 'key', key) }
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

export function createHostedApi(config: HostedApiConfig): { server: HttpServer; engine: ApiEngine; close: () => Promise<void> } {
  if (config.hashKey.length < 32) throw new Error('hashKey must contain at least 32 characters')
  const env = config.env ?? process.env
  const log = config.log ?? ((line: string) => console.log(line))
  const keylessDaily = config.keylessDaily ?? DEFAULT_KEYLESS_DAILY
  const siteDaily = config.siteDaily ?? DEFAULT_SITE_DAILY
  const base = config.networkPolicy ?? hostedNetworkPolicy()
  const policy = withOperatorContact({ ...base, maxFileBytes: Math.min(base.maxFileBytes ?? HOSTED_MAX_FILE_BYTES, HOSTED_MAX_FILE_BYTES) }, env)
  const engine = createApiEngine({
    taskRoot: config.taskRoot,
    networkPolicy: policy,
    hosted: true,
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
  const keylessLimiter = new SlidingWindowLimiter(KEYLESS_PER_MINUTE)
  const keyLimiter = new SlidingWindowLimiter(KEY_PER_MINUTE)
  const addressLimiter = new SlidingWindowLimiter(ADDRESS_PER_MINUTE)
  const sweeper = setInterval(() => { sweepTaskRoot(config.taskRoot).catch((error) => log(JSON.stringify({ severity: 'WARNING', event: 'hosted_sweep_failed', message: String(error) }))) }, SWEEP_EVERY_MS)
  sweeper.unref()

  const refuse = (c: Context, status: 401 | 403 | 404 | 429, code: string, message: string, hints: readonly string[], headers: Record<string, string> = {}) => {
    for (const [name, value] of Object.entries(headers)) c.header(name, value)
    return c.json({ error: message, code, agentHints: hints }, status)
  }

  /** Who is calling: a key holder, a keyless caller, or neither (an unknown key). */
  const identify = async (headers: Headers, socketAddress: string): Promise<HostedCaller | 'unknown_key'> => {
    const authorization = headers.get('authorization') ?? ''
    if (authorization.toLowerCase().startsWith('bearer ')) {
      const presented = authorization.slice(7).trim()
      if (presented.length === 0 || presented.length > 256) return 'unknown_key'
      const id = digest(config.hashKey, 'key', presented)
      const record = await config.keys.lookup(id)
      if (record === null || !record.enabled) return 'unknown_key'
      return { kind: 'key', id, dailyLimit: record.dailyLimit, browser: record.browser, plan: record.plan }
    }
    const internal = headers.get(INTERNAL_SECRET_HEADER)
    const address = internal !== null && sameSecret(internal, internalSecret) ? (headers.get(INTERNAL_CLIENT_HEADER) ?? socketAddress) : socketAddress
    return { kind: 'keyless', id: digest(config.hashKey, 'ip', address), dailyLimit: keylessDaily, browser: false, plan: 'keyless' }
  }

  type GateEnv = { Bindings: { socketAddress: string }; Variables: { caller: HostedCaller } }
  const gate = new Hono<GateEnv>()
  // /health, not /healthz: Google's front end answers /healthz on a Cloud Run URL itself (a 404 page) and the request never reaches the container.
  gate.get('/health', (c) => c.json({ ok: true, service: 'octocrawl-hosted-api', tools: [...HOSTED_API_TOOLS] }))
  // Discovery files are public and cheap: the server card, and a plain 404 for every other /.well-known file, so a client
  // looking for OAuth metadata learns there is none instead of reading a refusal as a sign-in wall.
  gate.get('/.well-known/mcp/server-card.json', (c) => c.json(hostedServerCard(), 200, { 'cache-control': 'public, max-age=3600' }))
  gate.all('/.well-known/*', (c) => refuse(c, 404, 'not_found', `${c.req.path} is not published by hosted Octocrawl`, ['the server card is at /.well-known/mcp/server-card.json; no sign-in is needed: call POST /mcp without an Authorization header']))
  gate.use('*', async (c, next) => {
    const method = c.req.method
    const path = c.req.path
    const starts = method === 'POST' && (path === '/v1/scrape' || path === '/v1/map')
    const reads = method === 'GET' && (path.startsWith('/v1/scrapes/') || path.startsWith('/v1/maps/'))
    if (method === 'GET' && path === '/health') return next()
    if (!starts && !reads) {
      return refuse(c, 403, 'hosted_unavailable', `${method} ${path} is not served by hosted Octocrawl: scrape and map only (POST /v1/scrape, POST /v1/map)`, [LOCAL_HINT, 'batch, crawl and Monitor are hosted in a later phase of the roadmap'])
    }
    // Every request counts against its address first, before any lookup, so a flood of made-up keys reaches no store.
    const addressWait = addressLimiter.retryAfterSeconds(digest(config.hashKey, 'ip', c.env.socketAddress))
    if (addressWait !== null) return refuse(c, 429, 'rate_limited', `too many requests from this address: at most ${ADDRESS_PER_MINUTE} a minute`, [`retry after ${addressWait} s`], { 'Retry-After': String(addressWait) })
    const caller = await identify(c.req.raw.headers, c.env.socketAddress)
    if (caller === 'unknown_key') return refuse(c, 401, 'unauthorized', 'this key is not one Octocrawl issued, or it was revoked', ['send no Authorization header to use the keyless allowance, or ask for a key at https://octocrawl.dev/docs/connect-mcp/?utm_source=hosted&utm_medium=hint'])
    c.set('caller', caller)
    if (!starts) return next()
    const retryAfter = (caller.kind === 'key' ? keyLimiter : keylessLimiter).retryAfterSeconds(caller.id)
    if (retryAfter !== null) return refuse(c, 429, 'rate_limited', `too many requests: at most ${caller.kind === 'key' ? KEY_PER_MINUTE : KEYLESS_PER_MINUTE} starts a minute`, [`retry after ${retryAfter} s`], { 'Retry-After': String(retryAfter) })
    const now = new Date()
    const day = utcDay(now)
    const quota = await config.quota.consume([{ id: `${day}-site`, limit: siteDaily }, { id: `${day}-${caller.kind}-${caller.id}`, limit: caller.dailyLimit }], now)
    if (!quota.ok) {
      const seconds = secondsToUtcMidnight(now)
      const site = quota.limited.endsWith('-site')
      return refuse(c, 429, 'quota_exhausted', site ? `hosted Octocrawl has served its ${quota.limit} pages for today` : `the ${caller.kind === 'key' ? 'key' : 'keyless'} allowance of ${quota.limit} pages a day is used up`,
        [caller.kind === 'keyless' && !site ? 'a key raises the allowance: https://octocrawl.dev/docs/connect-mcp/?utm_source=hosted&utm_medium=hint' : LOCAL_HINT, `the allowance resets at 00:00 UTC, in ${seconds} s`], { 'Retry-After': String(seconds) })
    }
    if (path === '/v1/scrape') {
      // The scrape route runs here with the request pinned: nothing is stored for reuse (the page cache would grow with every
      // caller's pages), and a caller without the browser lane reads over HTTP alone (`fastMode`). The inner app serves map and the reads.
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: 'the request body must be JSON', code: 'invalid_json' }, 400) }
      const pinned = body !== null && typeof body === 'object' && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>), storeInCache: false, ...(caller.browser ? {} : { fastMode: true }) }
        : body
      const req = parseScrapeRequest(pinned)
      return c.json(await engine.scrape(req, { signal: c.req.raw.signal }), 200)
    }
    return next()
  })
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

  const mcp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? '')) { sendJson(res, 405, { error: 'method not allowed' }); return }
    const version = req.headers['mcp-protocol-version']
    if (version && (typeof version !== 'string' || !SUPPORTED_PROTOCOL_VERSIONS.includes(version))) { sendJson(res, 400, { error: 'unsupported MCP protocol version' }); return }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'stream and session management unavailable: every request is answered on its own POST' }); return }
    const address = clientAddress(req, config.proxySecret)
    const addressWait = addressLimiter.retryAfterSeconds(digest(config.hashKey, 'ip', address))
    if (addressWait !== null) { sendJson(res, 429, { error: `too many requests from this address: at most ${ADDRESS_PER_MINUTE} a minute` }, { 'retry-after': String(addressWait) }); return }
    const headers = new Headers()
    const authorization = req.headers.authorization
    if (typeof authorization === 'string') headers.set('authorization', authorization)
    const caller = await identify(headers, address)
    if (caller === 'unknown_key') { sendJson(res, 401, { error: 'this key is not one Octocrawl issued, or it was revoked' }, { 'www-authenticate': 'Bearer' }); return }
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
    // The tools call the API in-process through the gate, so quota, lane and refusals are the REST ones.
    const client = new W2L({
      baseUrl: 'http://hosted.internal',
      ...(typeof authorization === 'string' ? { token: authorization.replace(/^Bearer\s+/i, '') } : {}),
      fetch: async (input, init) => {
        const request = new Request(input, init)
        if (caller.kind === 'keyless') { request.headers.set(INTERNAL_SECRET_HEADER, internalSecret); request.headers.set(INTERNAL_CLIENT_HEADER, address) }
        return gate.fetch(request, { socketAddress: address })
      },
    })
    const server = createMcpServer(client, {
      allowedTools: HOSTED_API_TOOLS,
      calls: trackPost(calls, req, res, parsed, [caller.id]),
      normalizeCall: (name, args) => {
        if (!HOSTED_API_TOOLS.has(name)) throw new Error(`${name} is not served by hosted Octocrawl: scrape, map and scrape_product only; ${LOCAL_HINT}`)
        if (name === 'scrape_product' && !caller.browser) throw new Error('scrape_product reads Amazon.sg in a browser, which needs a key; keyless callers use scrape over HTTP')
        return args
      },
    })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    try { await server.connect(transport); await transport.handleRequest(req, res, parsed) }
    finally { await server.close() }
  }

  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://hosted.internal').pathname
    if (pathname === '/mcp') {
      mcp(req, res).catch((error) => {
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

interface FirestoreDoc { name: string; fields?: Record<string, { integerValue?: string; stringValue?: string; booleanValue?: boolean }>; updateTime?: string }

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

function firestoreBase(projectId: string): { resource: string; endpoint: string } {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
  const resource = `projects/${projectId}/databases/(default)/documents`
  return { resource, endpoint: `https://firestore.googleapis.com/v1/${resource}` }
}

/** Key records under `hostedApiKeys/{hmac}`: enabled, plan, dailyLimit, browser, label. A lookup is cached for a minute. */
export class FirestoreHostedKeys implements HostedKeys {
  private readonly base: { resource: string; endpoint: string }
  private readonly cache = new BoundedMap<string, { at: number; record: HostedKeyRecord | null }>(REMEMBERED_CALLERS)
  constructor(projectId: string, private readonly fetcher: typeof fetch = fetch, private readonly cacheMs = 60_000) { this.base = firestoreBase(projectId) }
  async lookup(keyHash: string): Promise<HostedKeyRecord | null> {
    const cached = this.cache.get(keyHash)
    if (cached && Date.now() - cached.at < this.cacheMs) return cached.record
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
      }
    }
    this.cache.set(keyHash, { at: Date.now(), record })
    return record
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
      if (response.ok) return { ok: true }
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
