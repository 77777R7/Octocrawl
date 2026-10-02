/**
 * MCP tool dispatch over the native REST contract.
 * No resources, no OAuth, no second result type.
 */

import { MAX_FILE_BYTES_CEILING, parseBatchStartRequest, parseCrawlStartRequest, parseScrapeRequest, RequestError, type PageOptions } from '@w2l/contracts'
import type { RequestOptions, W2L } from '@w2l/sdk'
import { hostedAmazonUrl } from './hostedToolPolicy.js'
import { AMAZON_PRODUCT_SCHEMA } from './productSchema.js'

export const TOOL_NAMES = ['scrape_product', 'batch_products', 'scrape', 'crawl', 'get_crawl', 'get_crawl_pages', 'get_crawl_errors', 'cancel_crawl', 'resume_crawl', 'batch_scrape', 'get_batch', 'get_batch_items', 'wait_batch', 'cancel_batch',
  'preview_monitor','create_monitor','list_monitors','get_monitor','run_monitor','get_monitor_run','pause_monitor','resume_monitor','cancel_monitor_run',
  'create_delivery_destination','list_delivery_destinations','pause_delivery_destination','resume_delivery_destination','list_deliveries','get_delivery','retry_dead_letter'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

const idSchema = {type:'object',properties:{id:{type:'string'},debug:{type:'boolean'}},required:['id'],additionalProperties:false} as const
/** Options scrape, crawl and batch_scrape share; crawl and batch apply them to every page. */
const PAGE_OPTION_PROPERTIES = {
  onlyMainContent: { type: 'boolean', description: 'false returns the whole page (header, navigation and footer kept) instead of the main content. Default true.' },
  waitFor: { type: 'integer', minimum: 0, maximum: 60000, description: 'Milliseconds the browser waits after load before capture. Starts at the browser rung and counts toward timeout. Default 0.' },
  timeout: { type: 'integer', minimum: 1000, maximum: 300000, description: 'Deadline in milliseconds for the whole scrape (per page for crawl and batch). When it fires the result is partial with the content so far, or failed/timeout. Default 300000.' },
  maxFileBytes: { type: 'integer', minimum: 1, maximum: MAX_FILE_BYTES_CEILING, description: 'Largest file (PDF, CSV, XLSX, ZIP, JSON, text) to download, in bytes, below the server\'s own cap (W2L_MAX_FILE_BYTES, default 50 MiB). A larger file is failed with body_too_large and not saved.' },
  includeTags: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 200 }, description: 'CSS selectors naming the only elements to keep: the content is those elements in document order (a named navigation included), whatever onlyMainContent says. Nothing matching is an empty answer. Tag, class, id and attribute selectors, descendant and child combinators, :not(), :is(), :where(), :root and :empty, at most 100 parts in all (a tag name, *, a class, an id, an attribute test and a pseudo-class each count as one); sibling combinators, :nth-child and the like, and :has() are refused by name.' },
  excludeTags: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 200 }, description: 'CSS selectors removed, with everything inside them, from the main content, the whole page (onlyMainContent false) and an includeTags selection. The same selectors and limit as includeTags.' },
  headers: { type: 'object', maxProperties: 32, additionalProperties: { type: 'string', maxLength: 4096 }, description: 'Extra request headers sent to the requested origin (the page, its same-origin hops and the files it loads from that origin) after W2L\'s declared identity, and recorded in the trace: accept, accept-language, referer, cache-control, if-none-match, x-* and the like. User-Agent, client hints, credentials (authorization, cookie) and transport headers are refused by name with HTTP 400; a cross-origin hop gets the identity alone. Anything here is on the record.' },
  mobile: { type: 'boolean', description: 'Fetch as a declared mobile Chrome identity (Android UA, mobile client hints, 412x915 viewport). Default false.' },
  skipTlsVerification: { type: 'boolean', description: 'Local only: load a site with an invalid or self-signed certificate; recorded in the trace and a tls_unverified warning; refused in hosted mode.' },
  fastMode: { type: 'boolean', description: 'http lane only, no browser escalation: a page that needs script execution returns the http lane\'s verdict (a shell is failed/empty_unverified, never rendered). Default false.' },
  blockAds: { type: 'boolean', description: 'Abort requests to a bundled list of ad-serving hosts on the browser lane and remove ad and cookie-banner elements before extraction. Default true; false keeps them.' },
} as const
/** html and rawHtml are carried only when asked for, and are null for a file or a page that was not read as content. */
const FORMATS_DESCRIPTION = 'What to return. html is the cleaned HTML the Markdown is written from (the main content, the whole page when onlyMainContent is false, or the includeTags selection). rawHtml is the page as received: the response body on the HTTP rung, the rendered DOM on a browser rung.'
/** A recorded decision to fetch one URL its host's robots.txt disallows; never a blanket switch. */
const ROBOTS_OVERRIDE_PROPERTIES = {
  reason: { type: 'string', minLength: 1, maxLength: 500, description: 'Why this URL may be fetched despite the rule, e.g. the publisher links the file publicly and the host rule addresses crawlers.' },
  recordedBy: { type: 'string', minLength: 1, maxLength: 200, description: 'Who recorded the decision.' },
} as const
const ROBOTS_OVERRIDE_SCHEMA = {
  type: 'object',
  description: 'Fetch this URL although its host robots.txt disallows it, on a recorded decision with a reason. robots.txt is still read; the rule set aside, the reason and recordedBy go into the trace, a robots_overridden warning and, in the browser lane, the compliance record. An unreachable robots.txt is not set aside. Local HTTP and browser rungs only: such a scrape never goes on to a vendor rung, and a hosted API refuses this field.',
  properties: ROBOTS_OVERRIDE_PROPERTIES,
  required: ['reason'],
  additionalProperties: false,
} as const
const monitorConfigSchema = {type:'object',properties:{preset:{type:'string',enum:['firecrawl-introduction']},monitorId:{type:'string'},revision:{type:'integer',minimum:1},url:{type:'string'},ruleVersion:{type:'string'},intervalMs:{type:'integer',minimum:1},staleAfterMs:{type:'integer',minimum:1},config:{type:'object'},enabled:{type:'boolean'}},additionalProperties:false} as const
const MONITOR_TOOLS = [
  {name:'preview_monitor',description:'Capture a nonpersistent sample and assess identity, fields, evidence, and missing reasons. Start with preset firecrawl-introduction.',inputSchema:monitorConfigSchema},
  {name:'create_monitor',description:'Create a public-document Monitor. Defaults to paused so a delivery destination can be configured first. Use preset firecrawl-introduction for first use.',inputSchema:monitorConfigSchema},
  {name:'list_monitors',description:'List current Monitor state and freshness.',inputSchema:{type:'object',properties:{debug:{type:'boolean'}},additionalProperties:false}},
  {name:'get_monitor',description:'Check a Monitor baseline, latest run, latest event, and next schedule.',inputSchema:idSchema},
  {name:'run_monitor',description:'Queue a durable manual run. Returns runId immediately; disconnection does not cancel execution.',inputSchema:{type:'object',properties:{id:{type:'string'},triggerKey:{type:'string'}},required:['id'],additionalProperties:false}},
  {name:'get_monitor_run',description:'Inspect a run and field assessment with evidence and failure reasons.',inputSchema:{type:'object',properties:{id:{type:'string'},runId:{type:'string'},debug:{type:'boolean'}},required:['id','runId'],additionalProperties:false}},
  {name:'pause_monitor',description:'Pause scheduling and cancel active Monitor execution.',inputSchema:idSchema},
  {name:'resume_monitor',description:'Resume Monitor scheduling; first run becomes due immediately.',inputSchema:idSchema},
  {name:'cancel_monitor_run',description:'Explicitly cancel a queued or running Monitor run.',inputSchema:{type:'object',properties:{id:{type:'string'},runId:{type:'string'}},required:['id','runId'],additionalProperties:false}},
  {name:'create_delivery_destination',description:'Register an HTTPS webhook for a Monitor. The secretEnv names an operator environment variable; never send the secret value.',inputSchema:{type:'object',properties:{id:{type:'string'},monitorId:{type:'string'},url:{type:'string'},secretEnv:{type:'string'},maxAttempts:{type:'integer',minimum:1,maximum:100},enabled:{type:'boolean'}},required:['monitorId','url'],additionalProperties:false}},
  {name:'list_delivery_destinations',description:'List webhook destinations, optionally for one Monitor.',inputSchema:{type:'object',properties:{monitorId:{type:'string'}},additionalProperties:false}},
  ...(['pause_delivery_destination','resume_delivery_destination'] as const).map(name=>({name,description:`${name} for an HTTPS webhook destination`,inputSchema:idSchema})),
  {name:'list_deliveries',description:'Page through delivery state and failures. Defaults to 20 compact results.',inputSchema:{type:'object',properties:{monitorId:{type:'string'},destinationId:{type:'string'},state:{type:'string',enum:['pending','delivering','delivered','dead_letter']},cursor:{type:'string'},limit:{type:'integer',minimum:1,maximum:50},debug:{type:'boolean'}},additionalProperties:false}},
  {name:'get_delivery',description:'Inspect one delivery and its retry attempts.',inputSchema:idSchema},
  {name:'retry_dead_letter',description:'Explicitly retry a dead-letter delivery with the same eventId.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
] as const

export const TOOLS = [
  {
    name:'scrape_product',
    description:'Get evidence-backed JSON for one anonymous Amazon.sg /dp/{ASIN} product. No schema or model setup needed.',
    inputSchema:{type:'object',properties:{url:{type:'string'},debug:{type:'boolean'}},required:['url'],additionalProperties:false},
  },
  {
    name:'batch_products',
    description:'Queue 1-1000 distinct Amazon.sg product URLs with the reviewed JSON schema. Returns taskId; page results with get_batch_items.',
    inputSchema:{type:'object',properties:{urls:{type:'array',minItems:1,maxItems:1000,items:{type:'string'}}},required:['urls'],additionalProperties:false},
  },
  {
    name: 'scrape',
    description: 'Fetch one URL through the W2L coverage ladder. Compact by default; set debug=true for the full audit. The result\'s warnings name what its content cannot vouch for: robots_overridden, or client_rendered_suspected when the HTTP page looks like a shell its scripts fill in and the browser rung found nothing better.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) URL' },
        mode: { type: 'string', enum: ['standard', 'research', 'authed'] },
        allowlistedDomains: { type: 'array', items: { type: 'string' } },
        formats: {
          type: 'array',
          minItems: 1,
          description: FORMATS_DESCRIPTION,
          items: {
            anyOf: [
              { type: 'string', enum: ['markdown', 'links', 'json', 'html', 'rawHtml'] },
              {
                type: 'object',
                properties: {
                  type: { const: 'json' },
                  schema: { type: 'object' },
                  prompt: { type: 'string', maxLength: 4000 },
                  modelFallback: { type: 'boolean' },
                },
                required: ['type', 'schema'],
                additionalProperties: false,
              },
            ],
          },
        },
        includeLinks: { type: 'boolean', description: 'Include outbound links. Defaults to false.' },
        debug: { type: 'boolean', description: 'Include trace, ladderTrace, and full attempt audit.' },
        ...PAGE_OPTION_PROPERTIES,
        robotsOverride: ROBOTS_OVERRIDE_SCHEMA,
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'crawl',
    description: 'Start a multi-page crawl. Returns { taskId } (HTTP 202 equivalent).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        mode: { type: 'string', enum: ['standard', 'research', 'authed'] },
        maxPages: { type: ['number', 'null'] },
        maxDepth: { type: ['number', 'null'] },
        useCached: { type: 'boolean' },
        allowlistedDomains: { type: 'array', items: { type: 'string' } },
        formats: { type: 'array', minItems: 1, description: FORMATS_DESCRIPTION, items: { anyOf: [
          { type: 'string', enum: ['markdown', 'links', 'json', 'html', 'rawHtml'] },
          { type: 'object', properties: { type: { const: 'json' }, schema: { type: 'object' }, prompt: { type: 'string' }, modelFallback: { type: 'boolean' } }, required: ['type', 'schema'], additionalProperties: false },
        ] } },
        includeLinks: { type: 'boolean' },
        includePaths: { type: 'array', items: { type: 'string' }, description: 'Pathname regexes a discovered link must match; the start URL is always fetched.' },
        excludePaths: { type: 'array', items: { type: 'string' }, description: 'Pathname regexes that skip a discovered link; they win over includePaths.' },
        ...PAGE_OPTION_PROPERTIES,
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_crawl',
    description: 'Read a crawl by task id. Returns a CrawlReport.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'taskId from crawl' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_crawl_pages',
    description: 'Read a paginated list of crawl page results by task id. Pages omit the routing audit and trace unless debug is true.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 1000 },
        attemptId: { type: 'string' },
        debug: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_crawl_errors',
    description: 'Read a paginated list of crawl errors by task id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 1000 },
        attemptId: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancel_crawl',
    description: 'Cancel a crawl task. Completed pages remain queryable.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'resume_crawl',
    description: 'Restart a paused or failed crawl with the options it was started with. Returns { taskId }; poll get_crawl.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'batch_scrape',
    description: 'Persist and run 1-1000 explicit URLs. Returns a taskId; use get_batch_items for paginated results.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string' } },
        mode: { type: 'string', enum: ['standard', 'research', 'authed'] },
        formats: { type: 'array', minItems: 1, description: FORMATS_DESCRIPTION, items: { anyOf: [
          { type: 'string', enum: ['markdown', 'links', 'json', 'html', 'rawHtml'] },
          { type: 'object', properties: { type: { const: 'json' }, schema: { type: 'object' }, prompt: { type: 'string' }, modelFallback: { type: 'boolean' } }, required: ['type', 'schema'], additionalProperties: false },
        ] } },
        includeLinks: { type: 'boolean' },
        ...PAGE_OPTION_PROPERTIES,
        robotsOverrides: {
          type: 'array', maxItems: 1000,
          description: 'Recorded robots overrides, each for one URL of urls (see robotsOverride on scrape).',
          items: { type: 'object', properties: { url: { type: 'string' }, ...ROBOTS_OVERRIDE_PROPERTIES }, required: ['url', 'reason'], additionalProperties: false },
        },
      },
      required: ['urls'], additionalProperties: false,
    },
  },
  ...(['get_batch', 'get_batch_items', 'wait_batch', 'cancel_batch'] as const).map(name => ({
    name,
    description: `${name} for a persistent URL-array batch`,
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...(name === 'get_batch_items' ? { cursor: { type: 'string' }, limit: { type: 'number', minimum: 1, maximum: 50 }, debug: { type: 'boolean' } } : {}), ...(name === 'wait_batch' ? { timeoutMs: { type: 'number', minimum: 1, maximum: 300000 } } : {}) }, required: ['id'], additionalProperties: false },
  })),
  ...MONITOR_TOOLS,
] as const

/** `request.signal` is the MCP call's: every API request the tool makes, and a wait, stop when the client cancels the call. */
export async function callTool(client: W2L, name: string, args: unknown, request: RequestOptions = {}): Promise<unknown> {
  if (name === 'scrape_product') {
    const input=readRecord(args)
    if (Object.keys(input).some(key=>!['url','debug'].includes(key)) || (input.debug !== undefined && typeof input.debug !== 'boolean')) throw new RequestError('invalid scrape_product options')
    return client.scrape(hostedAmazonUrl(input.url),{mode:'standard',formats:[{type:'json',schema:AMAZON_PRODUCT_SCHEMA,modelFallback:false}],debug:input.debug === true},request)
  }
  if (name === 'batch_products') {
    const input=readRecord(args)
    if (Object.keys(input).some(key=>key!=='urls') || !Array.isArray(input.urls) || input.urls.length<1 || input.urls.length>1000) throw new RequestError('batch_products requires 1..1000 URLs')
    const urls=input.urls.map(hostedAmazonUrl)
    if(new Set(urls).size!==urls.length)throw new RequestError('batch_products URLs must be unique by ASIN')
    return client.batchScrape(urls,{mode:'standard',formats:[{type:'json',schema:AMAZON_PRODUCT_SCHEMA,modelFallback:false}],includeLinks:false},request)
  }
  if (name === 'scrape') {
    const req = parseScrapeRequest(args)
    return client.scrape(req.url, {
      mode: req.mode,
      allowlistedDomains: req.allowlistedDomains,
      formats: req.formats,
      includeLinks: req.includeLinks,
      debug: req.debug ?? false,
      onlyMainContent: req.onlyMainContent,
      waitFor: req.waitFor,
      timeout: req.timeout,
      maxFileBytes: req.maxFileBytes,
      includeTags: req.includeTags,
      excludeTags: req.excludeTags,
      ...executionOptions(req),
      ...(req.robotsOverride === undefined ? {} : { robotsOverride: req.robotsOverride }),
    }, request)
  }
  if (name === 'crawl') {
    const req = parseCrawlStartRequest(args)
    return client.crawl(req.url, {
      mode: req.mode,
      maxPages: req.maxPages,
      maxDepth: req.maxDepth,
      useCached: req.useCached,
      allowlistedDomains: req.allowlistedDomains,
      formats: req.formats,
      includeLinks: req.includeLinks,
      includePaths: req.includePaths,
      excludePaths: req.excludePaths,
      onlyMainContent: req.onlyMainContent,
      waitFor: req.waitFor,
      timeout: req.timeout,
      maxFileBytes: req.maxFileBytes,
      includeTags: req.includeTags,
      excludeTags: req.excludeTags,
      ...executionOptions(req),
    }, request)
  }
  if (name === 'get_crawl') {
    const rec = args !== null && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : null
    const id = rec?.id
    if (typeof id !== 'string' || id.length === 0) throw new RequestError('id is required')
    return client.getCrawl(id, request)
  }
  if (name === 'get_crawl_pages' || name === 'get_crawl_errors') {
    const input = readCrawlQuery(args)
    return name === 'get_crawl_pages' ? client.getCrawlPages(input.id, input.options, request) : client.getCrawlErrors(input.id, input.options, request)
  }
  if (name === 'cancel_crawl' || name === 'resume_crawl') {
    const rec = args !== null && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : null
    const id = rec?.id
    if (typeof id !== 'string' || id.length === 0) throw new RequestError('id is required')
    return name === 'cancel_crawl' ? client.cancelCrawl(id, request) : client.resumeCrawl(id, request)
  }
  if (name === 'batch_scrape') {
    const req = parseBatchStartRequest(args)
    return client.batchScrape(req.urls, { mode: req.mode, formats: req.formats, includeLinks: req.includeLinks, onlyMainContent: req.onlyMainContent, waitFor: req.waitFor, timeout: req.timeout, maxFileBytes: req.maxFileBytes, includeTags: req.includeTags, excludeTags: req.excludeTags, ...executionOptions(req), ...(req.robotsOverrides === undefined ? {} : { robotsOverrides: req.robotsOverrides }) }, request)
  }
  if (name === 'get_batch_items') {
    const input = readCrawlQuery(args)
    return client.getBatchItems(input.id, input.options, request)
  }
  if (name === 'get_batch' || name === 'wait_batch' || name === 'cancel_batch') {
    const rec = args !== null && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : null
    if (typeof rec?.id !== 'string' || !rec.id) throw new RequestError('id is required')
    if (name === 'get_batch') return client.getBatch(rec.id, request)
    if (name === 'cancel_batch') return client.cancelBatch(rec.id, request)
    const timeoutMs = rec.timeoutMs ?? 30_000
    if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new RequestError('timeoutMs must be an integer between 1 and 300000')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('wait_batch timeout', 'TimeoutError')), timeoutMs)
    const signal = request.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, request.signal])
    try { return await client.waitBatch(rec.id, { signal }) }
    catch (error) {
      // Its own timeout answers with the current state; a cancelled call just stops.
      if (!controller.signal.aborted || request.signal?.aborted) throw error
      return client.getBatch(rec.id, request)
    } finally { clearTimeout(timer) }
  }
  if ((TOOL_NAMES as readonly string[]).includes(name)) return callMonitorTool(client,name,readRecord(args),request)
  throw new RequestError(`unknown tool: ${name}`)
}

/** The execution options of a parsed request, those that were set: headers, mobile, skipTlsVerification, fastMode and blockAds. */
function executionOptions(req: Pick<PageOptions, 'headers' | 'mobile' | 'skipTlsVerification' | 'fastMode' | 'blockAds'>): Pick<PageOptions, 'headers' | 'mobile' | 'skipTlsVerification' | 'fastMode' | 'blockAds'> {
  return {
    ...(req.headers === undefined ? {} : { headers: req.headers }),
    ...(req.mobile === undefined ? {} : { mobile: req.mobile }),
    ...(req.skipTlsVerification === undefined ? {} : { skipTlsVerification: req.skipTlsVerification }),
    ...(req.fastMode === undefined ? {} : { fastMode: req.fastMode }),
    ...(req.blockAds === undefined ? {} : { blockAds: req.blockAds }),
  }
}

function readRecord(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new RequestError('tool arguments must be an object')
  return args as Record<string, unknown>
}
function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new RequestError(`${name} is required`)
  return value
}
function compactMonitor(view: Awaited<ReturnType<W2L['getMonitor']>>) {
  const latest = view.runs[0]
  return {monitorId:view.revision.monitorId,url:view.revision.url,enabled:view.enabled,freshness:view.freshness,nextRunAt:view.nextRunAt,baseline:view.baseline ? {id:view.baseline.id,version:view.baseline.version,fields:view.baseline.fields} : null,latestRun:latest ? {id:latest.id,state:latest.state,quality:latest.quality,change:latest.change,changeReason:latest.changeReason ?? null,error:latest.error} : null,latestEvent:view.events[0] ?? null,pendingEventCount:view.outbox.filter(item=>item.state==='pending').length}
}
function compactDelivery(delivery: Awaited<ReturnType<W2L['retryDelivery']>>) {
  const {payload:_payload,...rest}=delivery
  return rest
}
async function callMonitorTool(client: W2L, name: string, rec: Record<string, unknown>, request: RequestOptions): Promise<unknown> {
  const id = () => required(rec.id,'id')
  const debug = rec.debug === true
  if (name === 'preview_monitor' || name === 'create_monitor') {
    const input = rec.preset === 'firecrawl-introduction'
      ? {preset:'firecrawl-introduction' as const,...(name === 'create_monitor' ? {enabled:rec.enabled === true} : {})}
      : {...rec,revision:rec.revision ?? 1,...(name === 'create_monitor' ? {enabled:rec.enabled === true} : {})}
    return name === 'preview_monitor' ? client.previewMonitor(input as Parameters<W2L['previewMonitor']>[0], request) : client.createMonitor(input as Parameters<W2L['createMonitor']>[0], request)
  }
  if (name === 'list_monitors') {const views=await client.listMonitors(request);return debug ? views : views.map(compactMonitor)}
  if (name === 'get_monitor' || name === 'pause_monitor' || name === 'resume_monitor') {
    const view = name === 'get_monitor' ? await client.getMonitor(id(), request) : name === 'pause_monitor' ? await client.pauseMonitor(id(), request) : await client.resumeMonitor(id(), request)
    return debug ? view : compactMonitor(view)
  }
  if (name === 'run_monitor') {const run=await client.enqueueMonitorRun(id(),{triggerKey:rec.triggerKey === undefined ? undefined : required(rec.triggerKey,'triggerKey')},request);return {runId:run.id,monitorId:run.monitorId,state:run.state,triggerKey:run.triggerKey}}
  if (name === 'get_monitor_run') {
    const detail = await client.getMonitorRun(id(),required(rec.runId,'runId'),request)
    return debug ? detail : {run:detail.run,assessment:detail.assessment,observation:detail.observation ? {id:detail.observation.id,observedAt:detail.observation.observedAt,clientWallMs:detail.observation.clientWallMs,markdownSha256:detail.observation.markdownSha256,error:detail.observation.error} : null,attempts:detail.attempts}
  }
  if (name === 'cancel_monitor_run') return compactMonitor(await client.cancelMonitorRun(id(),required(rec.runId,'runId'),request))
  if (name === 'create_delivery_destination') return client.createDeliveryDestination({id:rec.id === undefined ? crypto.randomUUID() : id(),monitorId:required(rec.monitorId,'monitorId'),url:required(rec.url,'url'),...(rec.secretEnv === undefined ? {} : {secretEnv:required(rec.secretEnv,'secretEnv')}),...(rec.maxAttempts === undefined ? {} : {maxAttempts:rec.maxAttempts as number}),...(rec.enabled === undefined ? {} : {enabled:rec.enabled as boolean})},request)
  if (name === 'list_delivery_destinations') return client.listDeliveryDestinations({monitorId:rec.monitorId === undefined ? undefined : required(rec.monitorId,'monitorId')},request)
  if (name === 'pause_delivery_destination') return client.pauseDeliveryDestination(id(), request)
  if (name === 'resume_delivery_destination') return client.resumeDeliveryDestination(id(), request)
  if (name === 'list_deliveries') {
    const page = await client.getDeliveriesPage({monitorId:rec.monitorId as string | undefined,destinationId:rec.destinationId as string | undefined,state:rec.state as 'pending' | 'delivering' | 'delivered' | 'dead_letter' | undefined,cursor:rec.cursor as string | undefined,limit:rec.limit as number | undefined},request)
    return debug ? page : {...page,items:page.items.map(compactDelivery)}
  }
  if (name === 'get_delivery') {const detail=await client.getDelivery(id(),request);return debug ? detail : {delivery:compactDelivery(detail.delivery),attempts:detail.attempts}}
  if (name === 'retry_dead_letter') return compactDelivery(await client.retryDelivery(id(),request))
  throw new RequestError(`unknown tool: ${name}`)
}

function readCrawlQuery(args: unknown): { id: string; options: { cursor?: string; limit?: number; attemptId?: string; debug?: boolean } } {
  const rec = args !== null && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : null
  if (typeof rec?.id !== 'string' || rec.id.length === 0) throw new RequestError('id is required')
  if (rec.limit !== undefined && (typeof rec.limit !== 'number' || !Number.isInteger(rec.limit))) throw new RequestError('limit must be an integer')
  if (rec.debug !== undefined && typeof rec.debug !== 'boolean') throw new RequestError('debug must be a boolean')
  return {
    id: rec.id,
    options: {
      cursor: typeof rec.cursor === 'string' ? rec.cursor : undefined,
      limit: rec.limit as number | undefined,
      attemptId: typeof rec.attemptId === 'string' ? rec.attemptId : undefined,
      debug: rec.debug as boolean | undefined,
    },
  }
}
