import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createApiEngine } from '@w2l/api'
import { hostedNetworkPolicy, type ParsedBatchStartRequest, type ParsedCrawlStartRequest } from '@w2l/contracts'
import { createHostedApi, HOSTED_API_TOOLS, HOSTED_JOB_TOOLS, HOSTED_SCRAPE_KEYS, hostedPolicy, hostedTools, keyDigest, MemoryHostedKeys, MemoryHostedQuota, oauthTools } from '../src/hostedApi.js'
import { MemoryCreditsStore } from '../src/hostedCredits.js'
import { HOSTED_BATCH_KEYS, HOSTED_CRAWL_KEYS, JOB_MAX_CRAWL_PAGES, JOB_WORKER_COUNT } from '../src/hostedJobRoutes.js'
import { MemoryHostedJobStore } from '../src/hostedJobs.js'
import { HOSTED_ONLY_OPTIONS, OPTION_PARITY, OPTION_TOOLS, parityTable, SHARED_WITH_SCRAPE, TOOL_PARITY, VALUE_PARITY, valueEntry, type OptionEntry, type OptionTool, type ValueEntry, type WhenSent } from '../src/hostedParity.js'
import { TOOL_NAMES, TOOLS } from '../src/tools.js'

/**
 * The hosted parity board (ROADMAP current phase, stage H item 1): every local MCP tool, option and left-out value has an
 * entry, and no entry claims more, or less, than the hosted tool lists, key sets and engine serve.
 */
type Variant = { enum?: unknown[]; properties?: Record<string, unknown> & { type?: { const?: string } } }
type Property = { enum?: unknown[]; maximum?: number; items?: { anyOf?: Variant[] }; properties?: { checks?: { items?: { properties?: { type?: { enum?: string[] } } } } } }
type Listed = readonly { name: string; inputSchema: unknown }[]

/**
 * Every hosted connection, by the tools it lists: keyless (as a key without the browser lane), a key with it, an account's
 * without and with it, and one signed in; on a server that takes the regular-expression checks, as hosted is deployed.
 */
const CONNECTIONS: readonly { name: string; tools: Listed }[] = [
  { name: 'keyless', tools: hostedTools(false, false, true) },
  { name: 'key with the browser lane', tools: hostedTools(true, false, true) },
  { name: 'account without the browser lane', tools: hostedTools(false, true, true) },
  { name: 'account with the browser lane', tools: hostedTools(true, true, true) },
  { name: 'signed in', tools: oauthTools(true, true, true) },
]
const propertiesOf = (tools: Listed, name: string) => (tools.find((tool) => tool.name === name)?.inputSchema as { properties: Record<string, Property> } | undefined)?.properties
const local = (name: string) => propertiesOf(TOOLS, name)!
/**
 * The options crawl and batch_scrape declare as "Same as scrape." and parse as scrape does, so scrape's schema carries their
 * values: locally formats and verify (tools.ts SHARED_FORMATS, SHARED_VERIFY); on hosted verify alone, as it lists scrape's
 * own formats on its job tools (hostedApi.ts hostedJobTool).
 */
const LOOSE = { local: ['formats', 'verify'], hosted: ['verify'] } as const
/** The property that carries an option's values in a tool list: the tool's own, or scrape's where the tool declares it loosely. */
const valueProperty = (tools: Listed, side: keyof typeof LOOSE, tool: OptionTool, option: string): Property | undefined =>
  propertiesOf(tools, tool !== 'scrape' && (LOOSE[side] as readonly string[]).includes(option) ? 'scrape' : tool)?.[option]
/** An option's values: its enum, a format's names (its string values and its objects' types), or verify's check types. */
function valuesOf(property: Property | undefined): string[] {
  if (property === undefined) return []
  if (Array.isArray(property.enum)) return property.enum.map(String)
  const variants = property.items?.anyOf
  if (Array.isArray(variants)) return [...new Set(variants.flatMap((variant) => variant.enum?.map(String) ?? (variant.properties?.type?.const === undefined ? [] : [variant.properties.type.const])))]
  return property.properties?.checks?.items?.properties?.type?.enum ?? []
}
/** Whether a value is in a property: an enum value or type, or `variant.field`, a field of a format object. */
function hasValue(property: Property | undefined, value: string): boolean {
  const [type, field] = value.split('.')
  if (field === undefined) return valuesOf(property).includes(value)
  return property?.items?.anyOf?.some(({ properties }) => properties !== undefined && properties.type?.const === type && field in properties) ?? false
}
const sent = (entry: OptionEntry | ValueEntry): WhenSent | undefined => ('sent' in entry ? entry.sent : undefined)

describe('the hosted parity manifest', () => {
  it('has an entry for every local MCP tool and none for a tool that is gone', () => {
    expect(Object.keys(TOOL_PARITY).sort()).toEqual([...TOOL_NAMES].sort())
  })

  it('gives each tool the status the hosted tool lists show', () => {
    const served = new Set([...HOSTED_API_TOOLS, ...HOSTED_JOB_TOOLS])
    // The gate lets through exactly what some connection lists.
    expect([...new Set(CONNECTIONS.flatMap(({ tools }) => tools.map((tool) => tool.name)))].sort()).toEqual([...served].sort())
    for (const name of TOOL_NAMES) {
      const entry = TOOL_PARITY[name]
      const on = CONNECTIONS.filter(({ tools }) => propertiesOf(tools, name) !== undefined)
      // A tool whose options this file does not list one by one is limited where its hosted schema differs at all.
      const changed = !(OPTION_TOOLS as readonly string[]).includes(name) && on.some(({ tools }) => !isDeepStrictEqual(propertiesOf(tools, name), local(name)))
      if (entry.status === 'supported') expect([name, on.length, changed]).toEqual([name, CONNECTIONS.length, false])
      else if (entry.status === 'limited') expect([name, on.length > 0 && (on.length < CONNECTIONS.length || changed)]).toEqual([name, true])
      else expect([name, on.map((connection) => connection.name), served.has(name)]).toEqual([name, [], false])
    }
  })

  it('has an entry for every option of scrape, map, crawl and batch_scrape and none for an option that is gone', () => {
    for (const tool of OPTION_TOOLS) expect([tool, Object.keys(OPTION_PARITY[tool]).sort()]).toEqual([tool, Object.keys(local(tool)).sort()])
  })

  it('gives each option the status the hosted schemas and key sets show', () => {
    const restKeys: Partial<Record<OptionTool, ReadonlySet<string>>> = { scrape: HOSTED_SCRAPE_KEYS, crawl: HOSTED_CRAWL_KEYS, batch_scrape: HOSTED_BATCH_KEYS }
    for (const tool of OPTION_TOOLS) {
      const listing = CONNECTIONS.filter(({ tools }) => propertiesOf(tools, tool) !== undefined)
      for (const [option, entry] of Object.entries(OPTION_PARITY[tool]) as [string, OptionEntry][]) {
        const where = `${tool} ${option}`
        const on = listing.filter(({ tools }) => option in propertiesOf(tools, tool)!)
        const capped = on.filter(({ tools }) => (propertiesOf(tools, tool)![option]!.maximum ?? Infinity) < (local(tool)[option]!.maximum ?? Infinity))
        const keys = restKeys[tool]
        if (entry.status === 'supported') expect([where, on.length, capped.length, keys?.has(option) ?? true]).toEqual([where, listing.length, 0, true])
        // A limit the schemas do not show is named by a value past it, which the calls below send.
        else if (entry.status === 'limited') expect([where, on.length > 0 && (on.length < listing.length || capped.length > 0 || entry.over !== undefined)]).toEqual([where, true])
        else {
          expect([where, on.map((connection) => connection.name)]).toEqual([where, []])
          // REST takes a field it does not list over MCP only when the entry says so.
          if (keys !== undefined) expect([where, keys.has(option)]).toEqual([where, sent(entry) === 'rest_only'])
        }
      }
      // What hosted lists beyond the local options is named as such.
      for (const { name, tools } of listing) {
        const extra = Object.keys(propertiesOf(tools, tool)!).filter((option) => !(option in local(tool)))
        expect([name, tool, extra.sort()]).toEqual([name, tool, Object.keys(HOSTED_ONLY_OPTIONS[tool] ?? {}).sort()])
      }
    }
  })

  it('has an entry for every value a connection leaves out of an option it lists, with the status the schemas show', () => {
    for (const tool of OPTION_TOOLS) {
      const listing = CONNECTIONS.filter(({ tools }) => propertiesOf(tools, tool) !== undefined)
      const listedOn = (option: string, value: string) => listing.filter(({ tools }) => option in propertiesOf(tools, tool)! && hasValue(valueProperty(tools, 'hosted', tool, option), value))
      for (const option of Object.keys(local(tool))) {
        for (const value of valuesOf(valueProperty(TOOLS, 'local', tool, option))) {
          const left = listing.length - listedOn(option, value).length
          const optionOn = listing.filter(({ tools }) => option in propertiesOf(tools, tool)!).length
          if (optionOn > 0 && left > 0) expect([tool, option, value, valueEntry(tool, option, value) !== undefined]).toEqual([tool, option, value, true])
        }
      }
      // Each entry, its own or scrape's for a shared option, names a local value and agrees with the listings.
      const inherited = tool === 'scrape' ? [] : Object.entries(VALUE_PARITY.scrape).filter(([key]) => SHARED_WITH_SCRAPE.includes(key.split('=')[0]!) && key.split('=')[0]! in local(tool) && VALUE_PARITY[tool][key] === undefined)
      for (const [key, entry] of [...Object.entries(VALUE_PARITY[tool]), ...inherited]) {
        const [option, value] = key.split('=') as [string, string]
        const where = `${tool} ${key}`
        expect([where, option in local(tool) && hasValue(valueProperty(TOOLS, 'local', tool, option), value)]).toEqual([where, true])
        const on = listedOn(option, value)
        if (entry.status === 'limited') expect([where, on.length > 0 && on.length < listing.length]).toEqual([where, true])
        else if ('listed' in entry && entry.listed === true) expect([where, on.length]).toEqual([where, listing.length])
        else expect([where, on.map((connection) => connection.name)]).toEqual([where, []])
      }
    }
  })

  it('is the side-by-side table in docs/hosted-api.md', async () => {
    const docs = await readFile(new URL('../../../docs/hosted-api.md', import.meta.url), 'utf8')
    const section = /<!-- hosted-parity:start -->\n([\s\S]*?)\n<!-- hosted-parity:end -->/.exec(docs)?.[1]
    expect(section, 'rewrite it: node --import tsx scripts/hosted/parity-table.ts --write').toBe(parityTable())
  })
})

const HASH_KEY = 'h'.repeat(40)
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${'The harbour office records tide height every hour of the day. '.repeat(8)}</p></article></main></body></html>`
/** One legal value for each option a call below sends. A job's start reads no page here: no worker runs. */
const SAMPLES: Record<string, unknown> = {
  mode: 'research', maxPages: 5, maxDepth: 1, allowlistedDomains: ['example.com'], formats: ['markdown'], includeLinks: true, includePaths: ['/'], excludePaths: ['/x'],
  regexOnFullURL: true, ignoreQueryParameters: true, deduplicateSimilarURLs: false, crawlEntireDomain: true, allowSubdomains: true, allowExternalLinks: true, sitemap: 'skip',
  maxConcurrency: 1, idempotencyKey: 'parity-check', onlyMainContent: false, waitFor: 200, timeout: 20_000, maxFileBytes: 1_000_000, includeTags: ['main'], excludeTags: ['nav'],
  headers: { 'accept-language': 'en' }, mobile: true, fastMode: true, blockAds: false, removeBase64Images: false, verify: { checks: [{ type: 'markdownIncludes', text: 'Tides' }] },
  integration: 'parity-check', ignoreInvalidURLs: true,
  handoff: true, lane: 'my-browser', access: 'enhanced', skipTlsVerification: true, maxAge: 60_000, minAge: 1, storeInCache: true, lockdown: true,
  actions: [{ type: 'wait', milliseconds: 1 }], robotsOverride: { reason: 'parity check' }, robotsOverrides: [{ url: 'https://example.com/a', reason: 'parity check' }],
  ignoreRobotsTxt: true, useCached: true, appendToId: 'batch-1', webhook: 'https://example.com/hook',
}
/** batch_scrape takes only false for these locally (a batch follows no link). */
const BATCH_SAMPLES: Record<string, unknown> = { allowExternalLinks: false, includeSubdomains: false }
const JSON_MODEL = { formats: [{ type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } } }, modelFallback: true }] }
const VALUE_SAMPLES: Record<string, Record<string, unknown>> = {
  'mode=authed': { mode: 'authed' },
  'access=my-browser': { access: 'my-browser' },
  'formats=json.modelFallback': JSON_MODEL,
}
const sample = (tool: OptionTool, option: string): Record<string, unknown> => {
  // One worker engine takes every job below, so each tool's start claims its own key.
  if (option === 'idempotencyKey') return { idempotencyKey: `parity-check-${tool}` }
  const value = tool === 'batch_scrape' && option in BATCH_SAMPLES ? BATCH_SAMPLES[option] : SAMPLES[option]
  if (value === undefined) throw new Error(`no sample for ${tool} ${option}`)
  return { [option]: value }
}
const valueSample = (key: string): Record<string, unknown> => {
  const body = VALUE_SAMPLES[key]
  if (body === undefined) throw new Error(`no sample for ${key}`)
  return body
}
type Answer = { status?: string; failureReason?: string | null; metadata?: { cacheState?: string } }
/**
 * What shows that a scrape took an option or value and did not honour it: the calls made, each on its own page, and what
 * the last answer must show. A page cache hosted kept would answer the later calls from what the first stored.
 */
const NOT_HONOURED: Record<string, { calls: Record<string, unknown>[]; holds: (answer: Answer, response: Response) => boolean }> = {
  maxAge: { calls: [{}, { maxAge: 3_600_000 }], holds: (answer) => answer.status === 'success' && answer.metadata?.cacheState !== 'hit' },
  minAge: { calls: [{}, { minAge: 1 }], holds: (answer) => answer.metadata?.cacheState !== 'hit' },
  storeInCache: { calls: [{ storeInCache: true }, { maxAge: 3_600_000 }], holds: (answer) => answer.status === 'success' && answer.metadata?.cacheState !== 'hit' },
  lockdown: { calls: [{}, { lockdown: true }], holds: (answer) => answer.status === 'failed' && answer.failureReason === 'cache_miss' },
  'mode=authed': { calls: [{ mode: 'authed' }], holds: (answer) => answer.status === 'success' },
  'formats=json.modelFallback': { calls: [JSON_MODEL], holds: (answer, response) => answer.status === 'success' && response.headers.get('x-credits-model') === '0' },
}

describe('what hosted does with what it does not list', () => {
  let site: Server
  let origin: string
  let api: string
  let root: string
  let close: () => Promise<void>
  const jobs = new MemoryHostedJobStore()
  // Each call is a new account's key, so no per-key rate, lease or job limit answers instead.
  let calls = 0
  const post = (path: string, body: unknown) => fetch(`${api}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer oc_parity_${calls++}` }, body: JSON.stringify(body) })
  beforeAll(async () => {
    site = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
    })
    site.listen(0, '127.0.0.1'); await once(site, 'listening')
    origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
    root = await mkdtemp(join(tmpdir(), 'octocrawl-hosted-parity-'))
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const keys = new MemoryHostedKeys(new Map(Array.from({ length: 300 }, (_, i) => [keyDigest(HASH_KEY, `oc_parity_${i}`), { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: `account-${i}` }] as const)))
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot: join(root, 'api'), hashKey: HASH_KEY, keys, quota: new MemoryHostedQuota(), credits: new MemoryCreditsStore(), addressPerMinute: 10_000, regexChecks: true,
      networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }, log: () => {},
      jobs: { store: jobs, files: { segment: async () => null, exportUrl: async (job) => `https://storage.example/${job.id}` }, enqueueSlice: async () => {} },
    })
    close = service.close
    if (!service.server.listening) await once(service.server, 'listening')
    api = `http://127.0.0.1:${port}`
  })
  afterAll(async () => {
    await close?.()
    await new Promise<void>((resolve) => site.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })

  it('refuses each scrape and map option and value it does not list, or shows it took it without honouring it, as its entry says', async () => {
    const cases = [
      ...(['scrape', 'map'] as const).flatMap((tool) => (Object.entries(OPTION_PARITY[tool]) as [string, OptionEntry][]).flatMap(([option, entry]) => {
        const how = sent(entry)
        return how === undefined ? [] : [{ tool, what: option, body: sample(tool, option), how }]
      })),
      ...Object.entries(VALUE_PARITY.scrape).flatMap(([key, entry]) => {
        const how = sent(entry)
        return how === undefined ? [] : [{ tool: 'scrape', what: key, body: valueSample(key), how }]
      }),
    ]
    for (const [i, { tool, what, body, how }] of cases.entries()) {
      if (how === 'refused') {
        const response = await post(`/v1/${tool}`, { url: `${origin}/`, ...body })
        expect([tool, what, response.status]).toEqual([tool, what, 400])
        continue
      }
      expect([tool, what, how, what in NOT_HONOURED]).toEqual([tool, what, 'not_honoured', true])
      const check = NOT_HONOURED[what]!
      let response: Response | undefined
      for (const call of check.calls) response = await post(`/v1/${tool}`, { url: `${origin}/not-honoured-${i}`, ...call })
      expect([tool, what, response!.status]).toEqual([tool, what, 200])
      expect([tool, what, check.holds(await response!.json() as Answer, response!)]).toEqual([tool, what, true])
    }
  })

  it('starts a job with every crawl and batch_scrape option it lists, and refuses or fails the rest as their entries say', async () => {
    // The job worker's engine (hostedJobWorker.ts runJobSlice), which a job's first slice starts the stored request on.
    const worker = createApiEngine({ taskRoot: join(root, 'worker'), hosted: true, defaultMaxPages: JOB_MAX_CRAWL_PAGES, allowRobotsOverride: false, sessionsFile: null, userChrome: null, workerCount: JOB_WORKER_COUNT, resumeOnStart: false, deferLaunch: true, networkPolicy: hostedPolicy(hostedNetworkPolicy()) })
    try {
      // It starts the request the start stored, as runJobSlice does.
      const firstSlice = async (tool: 'crawl' | 'batch_scrape', started: Response) => {
        const stored = jobs.jobs.get((await started.json() as { taskId: string }).taskId)!.request
        try {
          if (tool === 'crawl') await worker.startCrawl(stored as ParsedCrawlStartRequest)
          else await worker.startBatch(stored as ParsedBatchStartRequest)
          return 'taken'
        } catch { return 'refused' }
      }
      for (const tool of ['crawl', 'batch_scrape'] as const) {
        const base = tool === 'crawl' ? { url: 'https://example.com/' } : { urls: ['https://example.com/a'] }
        const path = tool === 'crawl' ? '/v1/crawl' : '/v1/batches'
        const cases = [
          ...(Object.entries(OPTION_PARITY[tool]) as [string, OptionEntry][]).filter(([option]) => !(option in base)).flatMap(([option, entry]) => [
            { what: option, body: sample(tool, option), how: sent(entry) },
            ...(entry.status === 'limited' && entry.over !== undefined ? [{ what: `${option} past the limit`, body: { [option]: entry.over.value }, how: entry.over.sent }] : []),
          ]),
          ...valueKeys(tool).map((key) => ({ what: key, body: valueSample(key), how: sent(valueEntry(tool, ...(key.split('=') as [string, string]))!) })),
        ]
        for (const { what, body, how } of cases) {
          const request = { ...base, ...body }
          const response = await post(path, request)
          // refused: at the start, by name. fails_job: started, then refused at the first slice. Listed, not honoured or REST
          // only: started and taken by the first slice too (the start keeps a webhook out of the stored request).
          const answer = response.status === 400 ? 'refused' : response.status === 202 ? (await firstSlice(tool, response) === 'refused' ? 'fails_job' : 'taken') : `HTTP ${response.status}`
          expect([tool, what, answer]).toEqual([tool, what, how === 'refused' || how === 'fails_job' ? how : 'taken'])
        }
      }
    } finally { await worker.close() }
  })
})

/** The values of a job tool whose entries say what hosted does when they are sent: its own, and scrape's for a shared option. */
function valueKeys(tool: 'crawl' | 'batch_scrape'): string[] {
  const own = Object.keys(VALUE_PARITY[tool])
  const shared = Object.keys(VALUE_PARITY.scrape).filter((key) => SHARED_WITH_SCRAPE.includes(key.split('=')[0]!) && !own.includes(key))
  return [...own, ...shared].filter((key) => sent(valueEntry(tool, ...(key.split('=') as [string, string]))!) !== undefined)
}
