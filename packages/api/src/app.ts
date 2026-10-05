import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { WSEvents } from 'hono/ws'
import { createNodeWebSocket, type NodeWebSocket } from '@hono/node-ws'
import { createHash } from 'node:crypto'
import { InvalidCursorError } from '@w2l/runtime'
import { CrawlStateError, HandoffUnavailableError, LoginsUnavailableError, TaskNotFoundError, type ApiEngine } from './engine.js'
import { ChromeLoginError } from './chromeLogin.js'
import { bearerTokenMatcher } from './auth.js'
import type { JobKind } from './jobEvents.js'
import { checkStreamCursor, jobStream, readJobReport, sseEvent } from './jobStream.js'
import {
  API_ERROR_STATUS,
  WS_TOKEN_PROTOCOL_PREFIX,
  type AgentHints,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiErrorDetails,
  IDEMPOTENCY_KEY_HEADERS,
  RATE_LIMITED_STATUS,
  rateLimitedBody,
  parseCrawlStartRequest,
  parseBatchErrorsQuery,
  parseBatchStartRequest,
  parseBatchHandoffRequest,
  parseLoginImportRequest,
  parseCrawlPageQuery,
  firecrawlCrawlCounts,
  parseFirecrawlCrawlRequest,
  parseFirecrawlCrawlStatusQuery,
  parseFirecrawlMapRequest,
  parseFirecrawlScrapeRequest,
  parseMapRequest,
  parseScrapeRequest,
  RequestError,
  parseMonitorRevision,
  DOCUMENT_RULE_VERSION,
  FIRECRAWL_INTRO_URL,
  FIRECRAWL_MONITOR_ID,
  type MonitorRevision,
  wrapCrawlAccepted,
  wrapCrawlStatus,
  wrapMap,
  wrapScrape,
  isLockdownCacheMiss,
  type ScrapeResponse,
} from '@w2l/contracts'

export interface AppOptions {
  /** A bearer token requests must present; accepted together with `tokens`. */
  token?: string | null
  /** Bearer tokens any one of which a request may present, e.g. one per client so each can be revoked. */
  tokens?: readonly string[]
  /**
   * Return an unexpected error's own message in its 500 response. Only for a
   * local single-user server; otherwise the response says "internal error" and
   * the cause goes to the server log.
   */
  exposeInternalErrors?: boolean
  /**
   * The operator's per-caller budget for the requests that start work
   * (`POST /v1/scrape`, `/v1/crawl`, `/v1/batches`, `/v1/map`,
   * `/fc/v1/scrape`, `/fc/v1/crawl`, `/fc/v1/map`): this many per sliding minute, per bearer token (or for
   * the one local caller when the server takes no token). Over it: HTTP 429
   * with `Retry-After`. In memory, per process; absent means no limit.
   */
  rateLimit?: { perMinute: number }
  /**
   * Whether the job stream routes are served: `GET /v1/crawl/:id/events`,
   * `GET /v1/batches/:id/events` (server-sent events) and their `/ws`
   * WebSocket upgrades. Default true; false (`W2L_JOB_STREAMS=off`) answers
   * 404 on all four, and clients poll the status and listing routes instead.
   */
  jobStreams?: boolean
  /**
   * Answer only requests addressed to this machine by a loopback name
   * (`Host` 127.0.0.1, localhost or [::1]) and, when a browser sends an
   * `Origin`, from a loopback page. A local server that reads the user's
   * saved logins sets it: a web page the user opens must not reach it
   * through a rebound DNS name and read pages signed in as them.
   */
  loopbackOnly?: boolean
}

const LOOPBACK_NAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** Whether a `Host` value or an `Origin` URL names this machine by a loopback name. */
export function isLoopbackAuthority(value: string, origin: boolean): boolean {
  try {
    const url = new URL(origin ? value : `http://${value}`)
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_NAMES.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** The WebSocket injectors of the apps that serve stream routes, for injectJobWebSockets. */
const webSocketInjectors = new WeakMap<Hono, NodeWebSocket['injectWebSocket']>()

/**
 * Attaches the app's WebSocket routes to the http server `serve()` returned:
 * upgrade requests are routed through the app (its bearer check included)
 * and completed on the app's socket server. A no-op for an app created with
 * `jobStreams: false`, which serves no such route.
 */
export function injectJobWebSockets(app: Hono, server: Parameters<NodeWebSocket['injectWebSocket']>[0]): void {
  webSocketInjectors.get(app)?.(server)
}

/** Every error response: { error, code, details?, agentHints? }, after success: false under /fc for Firecrawl clients, which read the hints as agent_hints. */
function fail(c: Context, code: ApiErrorCode, message: string, details?: ApiErrorDetails, agentHints?: AgentHints) {
  const body: ApiErrorBody = { error: message, code, ...(details === undefined ? {} : { details }), ...(agentHints === undefined || agentHints.length === 0 ? {} : { agentHints }) }
  return c.json(c.req.path.startsWith('/fc/') ? firecrawlEnvelope(body) : body, API_ERROR_STATUS[code])
}

/** Firecrawl's error envelope: `success: false`, the native fields, and the hints under Firecrawl's spelling. */
function firecrawlEnvelope<T extends { agentHints?: AgentHints }>(body: T): Omit<T, 'agentHints'> & { success: false; agent_hints?: AgentHints } {
  const { agentHints, ...rest } = body
  return { success: false, ...rest, ...(agentHints === undefined ? {} : { agent_hints: agentHints }) }
}

/**
 * The idempotency key a request's `x-idempotency-key` (or `Idempotency-Key`)
 * header carries, the way Firecrawl's clients send it, merged into the body
 * as `idempotencyKey` for the parser; a body key that differs from the header
 * is refused, so one request never names two keys.
 */
function withIdempotencyHeader(c: Context, body: unknown): unknown {
  const header = IDEMPOTENCY_KEY_HEADERS.map((name) => c.req.header(name)).find((value) => value !== undefined)
  if (header === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) return body
  const rec = body as Record<string, unknown>
  if (rec.idempotencyKey !== undefined && rec.idempotencyKey !== header) throw new RequestError('idempotencyKey does not match the x-idempotency-key header')
  return { ...rec, idempotencyKey: header }
}

/**
 * The bearer token a request presents, or '' when it presents none: the
 * Authorization header, or on a WebSocket upgrade, which the WebSocket API
 * gives no headers, the `w2l.token.<token>` subprotocol. Never a query string.
 */
function presentedToken(c: Context): string {
  const header = c.req.header('authorization') ?? ''
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return ''
  const offered = (c.req.header('sec-websocket-protocol') ?? '').split(',').map((protocol) => protocol.trim())
  const token = offered.find((protocol) => protocol.startsWith(WS_TOKEN_PROTOCOL_PREFIX))
  return token === undefined ? '' : token.slice(WS_TOKEN_PROTOCOL_PREFIX.length)
}

/** The requests the rate limit counts: those that start work. Status reads are free. */
const RATE_LIMITED_POSTS: ReadonlySet<string> = new Set(['/v1/scrape', '/v1/crawl', '/v1/batches', '/v1/map', '/fc/v1/scrape', '/fc/v1/crawl', '/fc/v1/map'])

/**
 * A sliding 60 s window per caller key, in memory: the moments of the
 * requests it admitted. Over the budget, it says how many whole seconds
 * until the oldest of them leaves the window (at least 1).
 */
class SlidingWindowLimiter {
  private readonly admitted = new Map<string, number[]>()
  constructor(private readonly perMinute: number) {}

  /** Null when the request is admitted (and counted), else the seconds to wait. */
  retryAfterSeconds(key: string, now = Date.now()): number | null {
    let moments = this.admitted.get(key)
    if (moments === undefined) {
      moments = []
      this.admitted.set(key, moments)
    }
    while (moments.length > 0 && moments[0]! <= now - 60_000) moments.shift()
    if (moments.length >= this.perMinute) return Math.max(1, Math.ceil((moments[0]! + 60_000 - now) / 1000))
    moments.push(now)
    return null
  }
}

export function createApp(engine: ApiEngine, options: AppOptions = {}): Hono {
  const app = new Hono()
  const tokens = [...(options.tokens ?? []), ...(options.token ? [options.token] : [])].filter((token) => token.length > 0)

  if (options.loopbackOnly === true) {
    app.use('*', async (c, next) => {
      const host = c.req.header('host')
      const origin = c.req.header('origin')
      if (host === undefined || !isLoopbackAuthority(host, false) || (origin !== undefined && !isLoopbackAuthority(origin, true))) {
        return fail(c, 'unauthorized', 'this local server answers requests addressed to 127.0.0.1, localhost or [::1] from this machine only')
      }
      // A page on another local port may send a form or text body without asking first: a body that is not JSON is refused.
      // A declared length says it at once; without one (curl -X POST sends none, a chunked body has none) the body is read to tell
      // a bodiless POST from one with content, and the route reads it again from Hono's cache.
      if (!/^application\/json\s*(;|$)/i.test(c.req.header('content-type') ?? '')) {
        const length = c.req.header('content-length')
        const hasBody = length !== undefined ? Number(length) > 0 : c.req.raw.body !== null && (await c.req.text()).length > 0
        if (hasBody) return fail(c, 'invalid_request', 'a request body must be JSON, sent with content-type: application/json')
      }
      await next()
    })
  }

  if (tokens.length > 0) {
    const accepts = bearerTokenMatcher(tokens)
    app.use('*', async (c, next) => {
      const presented = presentedToken(c)
      if (presented.length === 0 || !accepts(presented)) {
        return fail(c, 'unauthorized', 'unauthorized')
      }
      await next()
    })
  }

  if (options.rateLimit !== undefined) {
    const perMinute = options.rateLimit.perMinute
    const limiter = new SlidingWindowLimiter(perMinute)
    // After the token check: an unauthorized request counts for no one. The key is the token's digest, never the token.
    app.use('*', async (c, next) => {
      if (c.req.method !== 'POST' || !RATE_LIMITED_POSTS.has(c.req.path)) return next()
      const key = tokens.length === 0 ? 'local' : createHash('sha256').update(presentedToken(c), 'utf8').digest('hex')
      const retryAfterSeconds = limiter.retryAfterSeconds(key)
      if (retryAfterSeconds === null) return next()
      const body = rateLimitedBody(perMinute, retryAfterSeconds)
      c.header('Retry-After', String(retryAfterSeconds))
      return c.json(c.req.path.startsWith('/fc/') ? firecrawlEnvelope({ error: body.error, code: body.code, agentHints: body.agentHints }) : body, RATE_LIMITED_STATUS)
    })
  }

  app.post('/v1/scrape', async (c) => {
    const req = parseScrapeRequest(await c.req.json())
    return c.json(await engine.scrape(req, { signal: c.req.raw.signal }), 200)
  })

  /** The record of one scrape call, by the `scrapeId` its response carried. */
  app.get('/v1/scrapes/:id', async (c) => {
    const record = await engine.getScrape(c.req.param('id'))
    return record === null ? fail(c, 'not_found', 'not found') : c.json(record, 200)
  })

  /** A map answers at its deadline with what it found (200, never a 408); a client that disconnects cancels it, and nothing is recorded. */
  app.post('/v1/map', async (c) => {
    const req = parseMapRequest(await c.req.json())
    return c.json(await engine.map(req, { signal: c.req.raw.signal }), 200)
  })

  /** The record of one map, by the `id` its response carried. */
  app.get('/v1/maps/:id', async (c) => {
    const record = await engine.getMap(c.req.param('id'))
    return record === null ? fail(c, 'not_found', 'not found') : c.json(record, 200)
  })

  app.post('/v1/crawl', async (c) => {
    const req = parseCrawlStartRequest(withIdempotencyHeader(c, await c.req.json()))
    return c.json(await engine.startCrawl(req), 202)
  })

  /** A new batch, a replay of an earlier submission (`idempotencyKey`) or an append to an existing batch (`appendToId`), each 202. */
  app.post('/v1/batches', async (c) => {
    const req = parseBatchStartRequest(withIdempotencyHeader(c, await c.req.json()))
    return c.json(await engine.startBatch(req), 202)
  })

  app.get('/v1/batches/:id', async (c) => {
    const report = await engine.getBatch(c.req.param('id'))
    return report ? c.json(report) : fail(c, 'not_found', 'not found')
  })

  app.get('/v1/batches/:id/items', async (c) => {
    const query = parseCrawlPageQuery(c.req.query())
    if (query.limit !== undefined && query.limit > 50) throw new RequestError('batch item limit must be at most 50')
    const page = await engine.getBatchItems(c.req.param('id'), query)
    return page ? c.json(page) : fail(c, 'not_found', 'not found')
  })

  /**
   * The items a check stopped (a captcha, a challenge, a login wall), handed
   * to the person in their own Chrome, one at a time, and read there once
   * they are through: the answer comes when every item is read or given up.
   * Offered by a local server on loopback alone; another answers 409, as does one that cannot reach Chrome.
   */
  app.post('/v1/batches/:id/handoff', async (c) => {
    const raw = await c.req.text()
    const req = parseBatchHandoffRequest(raw.trim() === '' ? undefined : JSON.parse(raw))
    try {
      const done = await engine.handOffBatch(c.req.param('id'), req, { signal: c.req.raw.signal })
      return done === null ? fail(c, 'not_found', 'not found') : c.json(done, 200)
    } catch (error) {
      if (error instanceof CrawlStateError) return fail(c, 'conflict', error.message)
      if (error instanceof HandoffUnavailableError) return fail(c, 'conflict', error.message)
      throw error
    }
  })

  /** The batch's errors across every attempt, with the URLs robots.txt refused; no bodies, so pages of up to 1000. */
  app.get('/v1/batches/:id/errors', async (c) => {
    const page = await engine.getBatchErrors(c.req.param('id'), parseBatchErrorsQuery(c.req.query()))
    return page ? c.json(page) : fail(c, 'not_found', 'not found')
  })

  app.post('/v1/batches/:id/cancel', async (c) => {
    const report = await engine.cancelBatch(c.req.param('id'))
    return report ? c.json(report) : fail(c, 'not_found', 'not found')
  })

  if (options.jobStreams !== false) {
    /**
     * The job's stream as server-sent events: `catchup`, one `document` per
     * page (its `id:` the step cursor), `snapshot`, `done`, `error`;
     * `?after=<cursor>` or `Last-Event-ID` resumes after a document. The
     * stream closes after `done`. A batch id on the crawl route streams the
     * crawl report, as `GET /v1/crawl/:id` reports a batch; a crawl id on the
     * batch route is 404, as `GET /v1/batches/:id` is.
     */
    const events = (kind: JobKind) => async (c: Context) => {
      const id = c.req.param('id') ?? ''
      const after = c.req.query('after') ?? c.req.header('last-event-id')
      checkStreamCursor(after)
      if (await readJobReport(engine, kind, id) === null) return fail(c, 'not_found', 'not found')
      return streamSSE(c, async (stream) => {
        for await (const frame of jobStream(engine, kind, id, { ...(after === undefined ? {} : { after }), signal: c.req.raw.signal })) {
          await stream.writeSSE(sseEvent(frame))
        }
      })
    }
    app.get('/v1/crawl/:id/events', events('crawl'))
    app.get('/v1/batches/:id/events', events('batch'))

    // The same frames as JSON over a WebSocket. The upgrade request goes through the app, bearer check included (header or `w2l.token.<token>` subprotocol).
    const sockets = createNodeWebSocket({ app })
    webSocketInjectors.set(app, sockets.injectWebSocket)
    // The token subprotocol is the one echoed back; a protocol W2L does not speak selects none, which fails the client's handshake.
    ;(sockets.wss as unknown as { options: { handleProtocols?: (protocols: Set<string>) => string | false } }).options.handleProtocols = (protocols) => [...protocols].find((protocol) => protocol.startsWith(WS_TOKEN_PROTOCOL_PREFIX)) ?? false
    const socket = (kind: JobKind) => (c: Context): WSEvents => {
      const id = c.req.param('id') ?? ''
      const after = c.req.query('after')
      const controller = new AbortController()
      return {
        onOpen(_event, ws) {
          void (async () => {
            try {
              if (await readJobReport(engine, kind, id) === null) { ws.close(4404, 'not found'); return }
              try { checkStreamCursor(after) } catch (error) {
                ws.send(JSON.stringify({ type: 'error', error: { code: 'invalid_request', message: error instanceof Error ? error.message : String(error) } }))
                ws.close(4400, 'invalid cursor')
                return
              }
              for await (const frame of jobStream(engine, kind, id, { ...(after === undefined ? {} : { after }), signal: controller.signal })) {
                if (controller.signal.aborted) return
                ws.send(JSON.stringify(frame))
              }
              if (!controller.signal.aborted) ws.close(1000, 'done')
            } catch (error) {
              if (controller.signal.aborted) return
              console.error(JSON.stringify({ component: 'api', event: 'job_stream_failed', taskId: id, error: error instanceof Error ? error.message : String(error) }))
              try { ws.close(1011, 'stream failed') } catch {}
            }
          })()
        },
        onClose() { controller.abort() },
        onError() { controller.abort() },
      }
    }
    app.get('/v1/crawl/:id/ws', sockets.upgradeWebSocket(socket('crawl')))
    app.get('/v1/batches/:id/ws', sockets.upgradeWebSocket(socket('batch')))
  }

  /** The crawls this process is running; registered before the `:id` routes, which would otherwise take `active` for an id. Always 200. */
  app.get('/v1/crawl/active', async (c) => c.json(await engine.listActiveCrawls(), 200))

  app.get('/v1/crawl/:id', async (c) => {
    const id = c.req.param('id')
    const report = await engine.getCrawl(id)
    if (report === null) return fail(c, 'not_found', 'not found')
    return c.json(report, 200)
  })

  app.get('/v1/crawl/:id/pages', async (c) => {
    const result = await engine.getCrawlPages(c.req.param('id'), parseCrawlPageQuery(c.req.query()))
    if (result === null) return fail(c, 'not_found', 'not found')
    return c.json(result, 200)
  })

  app.get('/v1/crawl/:id/errors', async (c) => {
    const result = await engine.getCrawlErrors(c.req.param('id'), parseCrawlPageQuery(c.req.query()))
    if (result === null) return fail(c, 'not_found', 'not found')
    return c.json(result, 200)
  })

  app.post('/v1/crawl/:id/cancel', async (c) => {
    const report = await engine.cancelCrawl(c.req.param('id'))
    if (report === null) return fail(c, 'not_found', 'not found')
    return c.json(report, 200)
  })

  /** Restart a paused or failed crawl with its stored options; 202 { taskId } like a crawl start. */
  app.post('/v1/crawl/:id/resume', async (c) => {
    try {
      const accepted = await engine.resumeCrawl(c.req.param('id'))
      return accepted === null ? fail(c, 'not_found', 'not found') : c.json(accepted, 202)
    } catch (error) {
      if (error instanceof CrawlStateError) return fail(c, 'conflict', error.message)
      throw error
    }
  })

  app.post('/v1/monitors/firecrawl-introduction/run', async (c) => {
    const body = await c.req.json() as { triggerKey?: unknown }
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body.triggerKey !== undefined && (typeof body.triggerKey !== 'string' || !body.triggerKey.trim() || body.triggerKey.length > 200))) return fail(c, 'invalid_request', 'invalid triggerKey')
    const triggerKey = body.triggerKey as string | undefined
    return c.json(await engine.runFirecrawlMonitor(triggerKey, { signal: c.req.raw.signal }), 200)
  })

  app.get('/v1/monitors/firecrawl-introduction', async (c) => {
    return c.json(await engine.getFirecrawlMonitor(), 200)
  })

  const revisionFrom = (body: unknown): MonitorRevision => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('monitor request must be an object')
    const input = body as Record<string, unknown>
    if (input.preset === 'firecrawl-introduction') {
      if (Object.keys(input).some(key => !['preset','enabled'].includes(key))) throw new RequestError('preset does not accept custom monitor fields')
      return {monitorId:FIRECRAWL_MONITOR_ID,revision:1,url:FIRECRAWL_INTRO_URL,ruleVersion:DOCUMENT_RULE_VERSION,intervalMs:86_400_000,staleAfterMs:172_800_000,createdAt:Date.now()}
    }
    return parseMonitorRevision({...input,createdAt:Date.now()})
  }

  app.post('/v1/monitors/preview', async (c) => {
    const revision = revisionFrom(await c.req.json())
    return c.json(await engine.previewMonitor(revision,{signal:c.req.raw.signal}),200)
  })

  app.post('/v1/monitors', async (c) => {
    const body = await c.req.json()
    const revision = revisionFrom(body)
    const enabled = (body as Record<string, unknown>).enabled
    if (enabled !== undefined && typeof enabled !== 'boolean') return fail(c,'invalid_request','enabled must be boolean')
    if (revision.revision !== 1) return fail(c, 'invalid_request', 'new monitor requires revision 1')
    try { return c.json(engine.configureMonitor(revision, enabled !== false), 201) }
    catch { return fail(c, 'conflict', 'monitor configuration conflict') }
  })
  app.post('/v1/monitors/:id/revisions', async (c) => {
    const body = await c.req.json()
    const revision = parseMonitorRevision({ ...body, monitorId: c.req.param('id'), createdAt: Date.now() })
    try { return c.json(engine.configureMonitor(revision), 201) }
    catch { return fail(c, 'conflict', 'revision conflict; identity is immutable') }
  })
  app.get('/v1/monitors', (c) => c.json(engine.listMonitors()))
  app.get('/v1/monitors/:id', (c) => {
    const view = engine.getMonitor(c.req.param('id'))
    return view ? c.json(view) : fail(c, 'not_found', 'monitor not found')
  })
  app.get('/v1/monitors/:id/runs/:runId', (c) => {
    const detail = engine.getMonitorRun(c.req.param('id'),c.req.param('runId'))
    return detail ? c.json(detail) : fail(c,'not_found','monitor run not found')
  })
  app.post('/v1/monitors/:id/runs', async (c) => {
    const body = await c.req.json() as {triggerKey?:unknown}
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body.triggerKey !== undefined && (typeof body.triggerKey !== 'string' || !body.triggerKey.trim() || body.triggerKey.length > 200))) return fail(c,'invalid_request','invalid triggerKey')
    try { return c.json(engine.enqueueMonitorRun(c.req.param('id'),body.triggerKey as string | undefined),202) }
    catch (error) { return fail(c,'conflict',error instanceof Error ? error.message : 'run cannot be queued') }
  })
  app.post('/v1/monitors/:id/run', async (c) => {
    const body = await c.req.json() as { triggerKey?: unknown }
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body.triggerKey !== undefined && (typeof body.triggerKey !== 'string' || !body.triggerKey.trim() || body.triggerKey.length > 200))) return fail(c, 'invalid_request', 'invalid triggerKey')
    if (!engine.getMonitor(c.req.param('id'))) return fail(c, 'not_found', 'monitor not found')
    return c.json(await engine.runMonitor(c.req.param('id'), body.triggerKey as string | undefined, { signal: c.req.raw.signal }))
  })

  app.post('/v1/monitors/:id/runs/:runId/cancel', (c) => {
    try { return c.json(engine.cancelMonitorRun(c.req.param('id'), c.req.param('runId'))) }
    catch { return fail(c, 'not_found', 'monitor run not found') }
  })
  for (const action of ['pause', 'resume'] as const) app.post(`/v1/monitors/:id/${action}`, (c) => {
    try { return c.json(engine.setMonitorEnabled(c.req.param('id'), action === 'resume')) }
    catch { return fail(c, 'not_found', 'monitor not found') }
  })
  app.post('/v1/delivery/destinations', async (c) => {
    try { return c.json(engine.createDeliveryDestination(await c.req.json()), 201) }
    catch (error) { return fail(c, error instanceof SyntaxError ? 'invalid_json' : 'invalid_request', error instanceof Error ? error.message : 'invalid destination') }
  })
  /** The destinations of one Monitor (`monitorId`) or one crawl or batch (`jobId`); header names only, never their values. */
  app.get('/v1/delivery/destinations', (c) => c.json(engine.listDeliveryDestinations({ monitorId: c.req.query('monitorId'), jobId: c.req.query('jobId') })))
  for (const action of ['pause', 'resume'] as const) app.post(`/v1/delivery/destinations/:id/${action}`, (c) => {
    try { return c.json(engine.setDeliveryDestinationEnabled(c.req.param('id'), action === 'resume')) }
    catch { return fail(c, 'not_found', 'destination not found') }
  })
  app.get('/v1/deliveries', (c) => {
    const state = c.req.query('state')
    if (state && !['pending','delivering','delivered','dead_letter'].includes(state)) return fail(c, 'invalid_request', 'invalid delivery state')
    return c.json(engine.listDeliveries({monitorId: c.req.query('monitorId'), jobId: c.req.query('jobId'), destinationId: c.req.query('destinationId'), state: state as import('@w2l/contracts').DeliveryState | undefined}))
  })
  app.get('/v1/deliveries/page', (c) => {
    const state = c.req.query('state')
    if (state && !['pending','delivering','delivered','dead_letter'].includes(state)) return fail(c,'invalid_request','invalid delivery state')
    const limit = c.req.query('limit') === undefined ? undefined : Number(c.req.query('limit'))
    try { return c.json(engine.getDeliveriesPage({monitorId:c.req.query('monitorId'),jobId:c.req.query('jobId'),destinationId:c.req.query('destinationId'),state:state as import('@w2l/contracts').DeliveryState | undefined,cursor:c.req.query('cursor'),limit})) }
    catch (error) { return fail(c,'invalid_request',error instanceof Error ? error.message : 'invalid delivery query') }
  })
  app.get('/v1/deliveries/:id', (c) => {
    const detail = engine.getDelivery(c.req.param('id'))
    return detail ? c.json(detail) : fail(c, 'not_found', 'delivery not found')
  })
  app.post('/v1/deliveries/:id/retry', (c) => {
    try { return c.json(engine.retryDelivery(c.req.param('id'))) }
    catch (error) { return fail(c, 'conflict', error instanceof Error ? error.message : 'retry conflict') }
  })

  /** The person's saved logins, as `octocrawl login` keeps them: imported from their Chrome, listed without cookies, forgotten. A server on their machine alone. */
  app.post('/v1/logins/import', async (c) => {
    const req = parseLoginImportRequest(await c.req.json())
    try { return c.json(await engine.importLogin(req), 200) }
    catch (error) {
      if (error instanceof LoginsUnavailableError || error instanceof ChromeLoginError) return fail(c, 'conflict', error.message)
      throw error
    }
  })
  app.get('/v1/logins', async (c) => c.json({ logins: await engine.listLogins() }, 200))
  app.delete('/v1/logins/:site', async (c) => {
    try {
      const removed = await engine.removeLogin(c.req.param('site'))
      return removed ? c.json({ site: c.req.param('site'), removed: true }, 200) : fail(c, 'not_found', 'no login saved for that site')
    } catch (error) {
      if (error instanceof LoginsUnavailableError) return fail(c, 'conflict', error.message)
      throw error
    }
  })

  app.post('/v1/sessions/managed', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    if (typeof body.workspaceId !== 'string' || typeof body.accountRef !== 'string' || typeof body.originScope !== 'string') return fail(c, 'invalid_request', 'workspaceId, accountRef, and originScope are required')
    return c.json(await engine.createManagedSession({ workspaceId: body.workspaceId, accountRef: body.accountRef, originScope: body.originScope, expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null }), 201)
  })

  app.post('/v1/sessions/:id/authorize', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    if (typeof body.accountRef !== 'string') return fail(c, 'invalid_request', 'accountRef is required')
    try { return c.json(await engine.authorizeManagedSession(c.req.param('id'), body.accountRef), 200) }
    catch (error) { return fail(c, 'conflict', error instanceof Error ? error.message : 'authorization rejected') }
  })

  app.post('/v1/sessions/:id/revoke', async (c) => {
    try {
      await engine.revokeManagedSession(c.req.param('id'))
      return c.json({ sessionRef: c.req.param('id'), state: 'revoked' }, 200)
    } catch (error) { return fail(c, 'conflict', error instanceof Error ? error.message : 'revoke rejected') }
  })

  app.get('/v1/sessions/:id', async (c) => {
    try { return c.json(await engine.getManagedSession(c.req.param('id')), 200) }
    catch { return fail(c, 'not_found', 'session not found') }
  })

  app.post('/v1/sessions/:id/renew', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    try { return c.json(await engine.renewManagedSession(c.req.param('id'), typeof body.expiresAt === 'string' ? body.expiresAt : null), 200) }
    catch (error) { return fail(c, 'conflict', error instanceof Error ? error.message : 'renewal rejected') }
  })

  app.post('/v1/sessions/:id/handoff', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    if (typeof body.reason !== 'string' || !body.reason.trim()) return fail(c, 'invalid_request', 'reason is required')
    try { return c.json(await engine.requestManagedHandoff(c.req.param('id'), body.reason, typeof body.expiresAt === 'string' ? body.expiresAt : null), 200) }
    catch (error) { return fail(c, 'conflict', error instanceof Error ? error.message : 'handoff rejected') }
  })

  app.post('/v1/sessions/:id/capture', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    if (typeof body.workspaceId !== 'string' || typeof body.accountRef !== 'string' || typeof body.url !== 'string') return fail(c, 'invalid_request', 'workspaceId, accountRef, and url are required')
    return c.json(await engine.captureManagedSession({ sessionRef: c.req.param('id'), workspaceId: body.workspaceId, accountRef: body.accountRef, url: body.url }), 200)
  })

  app.post('/fc/v1/scrape', async (c) => {
    const req = parseFirecrawlScrapeRequest(await c.req.json())
    // A client disconnect cancels the scrape, as on native /v1/scrape.
    const response = await engine.scrape({ ...req, debug: true }, { signal: c.req.raw.signal }) as ScrapeResponse
    // Firecrawl answers a cache-only miss with 404; nothing was fetched.
    if (isLockdownCacheMiss(response)) return c.json({ success: false, error: 'lockdown: no stored result of this page fits the request, so nothing was fetched', code: 'SCRAPE_LOCKDOWN_CACHE_MISS' }, 404)
    return c.json(wrapScrape(response), 200)
  })

  app.post('/fc/v1/crawl', async (c) => {
    const body = withIdempotencyHeader(c, await c.req.json())
    const req = parseFirecrawlCrawlRequest(body)
    const accepted = await engine.startCrawl(req)
    return c.json(wrapCrawlAccepted(accepted, req.url), 200)
  })

  /** A map as Firecrawl answers one: 200 with the links as strings, success false when it found nothing; a client disconnect cancels it. */
  app.post('/fc/v1/map', async (c) => {
    const req = parseFirecrawlMapRequest(await c.req.json())
    return c.json(wrapMap(await engine.map(req, { signal: c.req.raw.signal })), 200)
  })

  /** One page of the latest attempt's steps; `next` carries the native cursor to the following one. */
  app.get('/fc/v1/crawl/:id', async (c) => {
    const query = parseFirecrawlCrawlStatusQuery(c.req.query())
    const page = await engine.getCrawlStatusPage(c.req.param('id'), query)
    if (page === null) return fail(c, 'not_found', 'not found')
    const counts = firecrawlCrawlCounts(page.status, page.counts, page.ahead)
    const finished = page.status === 'completed' || page.status === 'failed' || page.status === 'cancelled'
    let next: string | undefined
    if (page.hasMore || !finished) {
      const url = new URL(c.req.url)
      if (page.cursor !== null) url.searchParams.set('cursor', page.cursor)
      next = url.href
    }
    return c.json(wrapCrawlStatus({ status: page.status }, page.steps, { ...counts, ...(next === undefined ? {} : { next }) }), 200)
  })

  app.notFound((c) => fail(c, 'not_found', `no route for ${c.req.method} ${c.req.path}`))

  app.onError((err, c) => {
    if (err instanceof RequestError) return fail(c, err.code, err.message, err.details, err.agentHints)
    if (err instanceof CrawlStateError) return fail(c, 'conflict', err.message)
    if (err instanceof TaskNotFoundError) return fail(c, 'not_found', 'not found')
    // A cursor a client made up or truncated, on any route that pages through a task's steps.
    if (err instanceof InvalidCursorError) return fail(c, 'invalid_request', 'cursor is not one this API issued')
    if (err instanceof SyntaxError) return fail(c, 'invalid_json', 'body must be JSON')
    if (options.exposeInternalErrors === true) return fail(c, 'internal_error', err.message)
    console.error(JSON.stringify({ component: 'api', method: c.req.method, path: c.req.path, error: err.stack ?? String(err) }))
    return fail(c, 'internal_error', 'internal error')
  })

  return app
}
