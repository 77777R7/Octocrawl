import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createHash } from 'node:crypto'
import { CrawlStateError, type ApiEngine } from './engine.js'
import { bearerTokenMatcher } from './auth.js'
import {
  API_ERROR_STATUS,
  type AgentHints,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiErrorDetails,
  RATE_LIMITED_STATUS,
  rateLimitedBody,
  parseCrawlStartRequest,
  parseBatchStartRequest,
  parseCrawlPageQuery,
  firecrawlCrawlCounts,
  parseFirecrawlCrawlRequest,
  parseFirecrawlCrawlStatusQuery,
  parseFirecrawlScrapeRequest,
  parseScrapeRequest,
  RequestError,
  parseMonitorRevision,
  DOCUMENT_RULE_VERSION,
  FIRECRAWL_INTRO_URL,
  FIRECRAWL_MONITOR_ID,
  type MonitorRevision,
  wrapCrawlAccepted,
  wrapCrawlStatus,
  wrapScrape,
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
   * (`POST /v1/scrape`, `/v1/crawl`, `/v1/batches`, `/fc/v1/scrape`,
   * `/fc/v1/crawl`): this many per sliding minute, per bearer token (or for
   * the one local caller when the server takes no token). Over it: HTTP 429
   * with `Retry-After`. In memory, per process; absent means no limit.
   */
  rateLimit?: { perMinute: number }
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

/** The bearer token a request presents, or '' when it presents none. */
function presentedToken(c: Context): string {
  const header = c.req.header('authorization') ?? ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

/** The requests the rate limit counts: those that start work. Status reads are free. */
const RATE_LIMITED_POSTS: ReadonlySet<string> = new Set(['/v1/scrape', '/v1/crawl', '/v1/batches', '/fc/v1/scrape', '/fc/v1/crawl'])

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

  app.post('/v1/crawl', async (c) => {
    const req = parseCrawlStartRequest(await c.req.json())
    return c.json(await engine.startCrawl(req), 202)
  })

  app.post('/v1/batches', async (c) => {
    const req = parseBatchStartRequest(await c.req.json())
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

  app.post('/v1/batches/:id/cancel', async (c) => {
    const report = await engine.cancelBatch(c.req.param('id'))
    return report ? c.json(report) : fail(c, 'not_found', 'not found')
  })

  /** Reconnecting after a restart receives the current state and terminal event. */
  app.get('/v1/batches/:id/events', async (c) => {
    const id = c.req.param('id')
    if (await engine.getBatch(id) === null) return fail(c, 'not_found', 'not found')
    return streamSSE(c, async (stream) => {
      let last = ''
      while (!c.req.raw.signal.aborted) {
        const report = await engine.getBatch(id)
        if (!report) break
        const data = JSON.stringify(report)
        if (data !== last) {
          await stream.writeSSE({ event: ['completed', 'failed', 'cancelled'].includes(report.status) ? 'complete' : report.status === 'paused' ? 'paused' : 'progress', data })
          last = data
        }
        if (['completed', 'failed', 'cancelled', 'paused'].includes(report.status)) break
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    })
  })

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
  app.get('/v1/delivery/destinations', (c) => c.json(engine.listDeliveryDestinations(c.req.query('monitorId'))))
  for (const action of ['pause', 'resume'] as const) app.post(`/v1/delivery/destinations/:id/${action}`, (c) => {
    try { return c.json(engine.setDeliveryDestinationEnabled(c.req.param('id'), action === 'resume')) }
    catch { return fail(c, 'not_found', 'destination not found') }
  })
  app.get('/v1/deliveries', (c) => {
    const state = c.req.query('state')
    if (state && !['pending','delivering','delivered','dead_letter'].includes(state)) return fail(c, 'invalid_request', 'invalid delivery state')
    return c.json(engine.listDeliveries({monitorId: c.req.query('monitorId'), destinationId: c.req.query('destinationId'), state: state as import('@w2l/contracts').DeliveryState | undefined}))
  })
  app.get('/v1/deliveries/page', (c) => {
    const state = c.req.query('state')
    if (state && !['pending','delivering','delivered','dead_letter'].includes(state)) return fail(c,'invalid_request','invalid delivery state')
    const limit = c.req.query('limit') === undefined ? undefined : Number(c.req.query('limit'))
    try { return c.json(engine.getDeliveriesPage({monitorId:c.req.query('monitorId'),destinationId:c.req.query('destinationId'),state:state as import('@w2l/contracts').DeliveryState | undefined,cursor:c.req.query('cursor'),limit})) }
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
    return c.json(wrapScrape(await engine.scrape({ ...req, debug: true }, { signal: c.req.raw.signal }) as ScrapeResponse), 200)
  })

  app.post('/fc/v1/crawl', async (c) => {
    const body = await c.req.json()
    const req = parseFirecrawlCrawlRequest(body)
    const accepted = await engine.startCrawl(req)
    return c.json(wrapCrawlAccepted(accepted, req.url), 200)
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
    if (err instanceof SyntaxError) return fail(c, 'invalid_json', 'body must be JSON')
    if (options.exposeInternalErrors === true) return fail(c, 'internal_error', err.message)
    console.error(JSON.stringify({ component: 'api', method: c.req.method, path: c.req.path, error: err.stack ?? String(err) }))
    return fail(c, 'internal_error', 'internal error')
  })

  return app
}
