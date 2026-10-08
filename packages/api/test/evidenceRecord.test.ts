import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Ajv2020 from 'ajv/dist/2020.js'
import { identityForRoute, localNetworkPolicy, modeIdentity, type EvidenceRecord, type FetchOptions, type FetchResult, type NetworkPolicy } from '@w2l/contracts'
import { buildChannels, ProviderSubject, robotsFetcherVia, type Channel, type ProviderTransport } from '@w2l/bench'
import { EXTRACTOR_VERSION } from '@w2l/extract-tf'
import { accessGrantFromText, sha256Utf8 } from '@w2l/http-core'
import { W2L } from '@w2l/sdk'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine, type ApiEngineOptions } from '../src/engine.js'

/**
 * Evidence Record v1 from every lane, validated against the published schema
 * file: the HTTP lane, a real local Chromium, and the provider lane through a
 * vendor transport that fetches from the same fixture server.
 */
const schema = JSON.parse(readFileSync(new URL('../../contracts/schemas/evidence-record.v1.json', import.meta.url), 'utf8')) as object
const AjvClass = Ajv2020 as unknown as new (options: object) => { compile(schema: object): ((data: unknown) => boolean) & { errors?: unknown } }
const validate = new AjvClass({ allErrors: true, allowUnionTypes: true }).compile(schema)

function valid(record: EvidenceRecord | null | undefined): EvidenceRecord {
  expect(validate(record), JSON.stringify(validate.errors)).toBe(true)
  return record!
}

const ROBOTS = 'User-agent: *\nDisallow: /private\n'
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(4)
const ARTICLE = `<!doctype html><html lang="en"><head><title>Tide report</title></head><body><main><article><h1>Tide report</h1><p>${PROSE}</p><p><a href="/missing">Archive</a></p></article></main></body></html>`
const PRODUCT = '<!doctype html><html lang="en"><head><title>Cobalt ash kettle</title>' +
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Cobalt ash kettle","offers":{"@type":"Offer","price":"84.00","priceCurrency":"USD"}}</script></head>' +
  `<body><main><article><h1>Cobalt ash kettle</h1><p>${PROSE}</p><table><tr><th>UPC</th><td>a897fe39b1053632</td></tr><tr><th>Number of reviews</th><td>12</td></tr></table></article></main></body></html>`
const PRODUCT_SCHEMA = { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' }, upc: { type: 'string' }, numberOfReviews: { type: 'integer' } }, required: ['name', 'price', 'upc'] }

const PAGES: Record<string, { status?: number; headers?: Record<string, string>; body: string }> = {
  '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: ROBOTS },
  '/moved': { status: 301, headers: { location: '/article' }, body: '' },
  '/loop/a': { status: 302, headers: { location: '/loop/b' }, body: '' },
  '/loop/b': { status: 302, headers: { location: '/loop/a' }, body: '' },
  // Pages that move on by themselves once they answered: a script and a meta refresh.
  '/leaving': { headers: { 'content-type': 'text/html; charset=windows-1252' }, body: '<!doctype html><html><body><p>Leaving.</p><script>location.replace("/missing")</script></body></html>' },
  '/refresh': { body: '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=/article"></head><body><p>Moving on.</p></body></html>' },
  '/article': { body: ARTICLE },
  '/hub': { body: ARTICLE.replace('<p><a href="/missing">Archive</a></p>', '<p><a href="/article">Report</a> <a href="/missing">Archive</a> <a href="/private">Staff</a></p>') },
  '/missing': { status: 404, body: '<!doctype html><html><head><title>Not found</title></head><body><main><h1>Page not found</h1><p>The page you asked for is not on this server.</p></main></body></html>' },
  '/challenge': { status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '<!doctype html><html><head><title>Just a moment...</title></head><body><h1>Just a moment...</h1><p>Enable JavaScript and cookies to continue.</p></body></html>' },
  '/product': { body: PRODUCT },
  '/private': { body: ARTICLE },
  // Confident HTTP content whose table rows arrive by script: the ladder offers it to the browser rung.
  '/table-shell': { body: `<!doctype html><html><body><main><h1>Tide table, hourly</h1><p>Table 7. Release date 2026-09-23. Frequency: hourly. Station: north pier.</p><form><button>Apply</button><table><thead id="head"></thead><tbody id="body"></tbody></table></form></main></body></html>` },
}

let server: Server
let origin: string
let taskRoot: string
const userAgents: { path: string; userAgent: string | undefined }[] = []
const engines: ApiEngine[] = []
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }

beforeAll(async () => {
  server = createServer((req, res) => {
    userAgents.push({ path: req.url ?? '', userAgent: req.headers['user-agent'] })
    const page = PAGES[req.url ?? '']
    if (page === undefined) { res.writeHead(404).end(); return }
    res.writeHead(page.status ?? 200, { 'content-type': 'text/html; charset=utf-8', ...page.headers }).end(page.body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  taskRoot = await mkdtemp(join(tmpdir(), 'w2l-evidence-'))
})

afterAll(async () => {
  await Promise.all(engines.map(engine => engine.close()))
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(taskRoot, { recursive: true, force: true })
})

function engineWith(options: Partial<ApiEngineOptions>): ApiEngine {
  const engine = createApiEngine({ taskRoot: join(taskRoot, String(engines.length)), networkPolicy: policy, ...options })
  engines.push(engine)
  return engine
}

type BrowserStub = { fetch: (url: string, deadlineAt?: number, signal?: AbortSignal, execution?: unknown, options?: FetchOptions) => Promise<FetchResult> }
const hangingBrowser: BrowserStub = {
  fetch: (_url, _deadlineAt, signal) => new Promise<FetchResult>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true })),
}

async function scrape(engine: ApiEngine, body: Record<string, unknown>): Promise<Record<string, unknown> & { evidenceRecord: EvidenceRecord; markdown?: string | null }> {
  const res = await createApp(engine).request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  expect(res.status).toBe(200)
  return await res.json() as Record<string, unknown> & { evidenceRecord: EvidenceRecord; markdown?: string | null }
}

const robotsAllowed = { decision: 'allowed', robotsUrl: '', robotsSha256: sha256Utf8(ROBOTS), unreachable: null, crawlDelayMs: null, userOverride: false }
const recently = (fetchedAt: string | null) => fetchedAt !== null && Math.abs(Date.parse(fetchedAt) - Date.now()) < 60_000

describe('Evidence Record: HTTP lane', () => {
  let http: ApiEngine
  let withBrowser: ApiEngine
  beforeAll(() => {
    http = engineWith({ channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    withBrowser = engineWith({ channelsFor: mode => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: hangingBrowser } }) })
  })

  it('records every redirect hop, the robots.txt decision and the delivered Markdown, in the full and compact shapes', async () => {
    const full = await scrape(http, { url: `${origin}/moved` })
    const record = valid(full.evidenceRecord)
    expect(record).toMatchObject({
      schemaVersion: 'w2l.evidence/1',
      requestedUrl: `${origin}/moved`,
      finalUrl: `${origin}/article`,
      redirectChain: { urls: [`${origin}/moved`, `${origin}/article`], complete: true },
      httpStatus: 200, status: 'success', reason: null, lane: 'http',
      robotsDecision: { ...robotsAllowed, robotsUrl: `${origin}/robots.txt` },
      rawSha256: (full.evidence as { rawBodySha256: string }).rawBodySha256,
      outputSha256: { markdown: sha256Utf8(full.markdown!), json: null },
      extractor: { name: 'extract-tf', version: EXTRACTOR_VERSION },
      fieldEvidence: null, artifacts: [], proxy: null,
      identity: { mode: 'standard', contact: null },
    })
    expect(record.identity.userAgent).toMatch(/^Mozilla\/5\.0 /)
    expect(recently(record.fetchedAt)).toBe(true)

    const compact = await scrape(http, { url: `${origin}/moved`, formats: ['markdown'], debug: false })
    expect(valid(compact.evidenceRecord)).toMatchObject({ finalUrl: `${origin}/article`, lane: 'http', outputSha256: { markdown: sha256Utf8(compact.markdown!) } })
    expect(compact).not.toHaveProperty('trace')
  })

  it('states the route and the client: undici on the http rung, impit on the compatible one, in the full and compact shapes', async () => {
    expect(valid((await scrape(http, { url: `${origin}/article` })).evidenceRecord).access)
      .toEqual({ route: 'http', executor: 'undici', executorVersion: null, profile: null, externalCostUsd: 0, completion: 'unattended', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null })
    const grant = accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities: ['compatible_transport'] }))
    const compat = engineWith({ accessGrant: grant, compatHosts: ['127.0.0.1'], channelsFor: mode => buildChannels(mode, { networkPolicy: policy, compatTransport: true }).filter(channel => channel.id === 'http' || channel.id === 'http_compat') })
    const full = await scrape(compat, { url: `${origin}/article` })
    expect(full.channelsTried).toEqual(['http_compat'])
    const expected = { route: 'http_compat', executor: 'impit', executorVersion: '0.14.5', profile: 'chrome142', externalCostUsd: 0, completion: 'unattended', egress: { proxy: null, source: 'direct', switchedFrom: null, exit: null }, session: null }
    expect(valid(full.evidenceRecord).access).toEqual(expected)
    expect(valid((await scrape(compat, { url: `${origin}/article`, formats: ['markdown'], debug: false })).evidenceRecord).access).toEqual(expected)
  })

  it('sends and records the plain standard User-Agent from the local API, without the public preview\'s token', async () => {
    // The API's own channels, not a test's: the token is the hosted preview's alone.
    const local = engineWith({ httpOnly: true })
    userAgents.length = 0
    const record = valid((await scrape(local, { url: `${origin}/article` })).evidenceRecord)
    const standard = modeIdentity('standard').userAgent
    expect(record.identity).toMatchObject({ mode: 'standard', userAgent: standard })
    expect(userAgents.map(request => request.path)).toEqual(['/robots.txt', '/article'])
    for (const request of userAgents) expect(request.userAgent).toBe(standard)
  })

  it('keeps a 404 page as failed evidence, hashes it, and records a block', async () => {
    const missing = await scrape(http, { url: `${origin}/missing`, formats: ['markdown'] })
    expect(valid(missing.evidenceRecord)).toMatchObject({ status: 'failed', reason: 'http_error', httpStatus: 404, finalUrl: `${origin}/missing`, outputSha256: { markdown: sha256Utf8(missing.markdown!) } })
    expect(missing.markdown).toContain('Page not found')
    const blocked = await scrape(http, { url: `${origin}/challenge` })
    expect(valid(blocked.evidenceRecord)).toMatchObject({ status: 'blocked', reason: 'cloudflare_challenge', httpStatus: 403, lane: 'http' })
  })

  it('names the last URL that answered on a redirect loop, with its status', async () => {
    const loop = await scrape(http, { url: `${origin}/loop/a` })
    expect(loop.evidence).toMatchObject({ finalUrl: `${origin}/loop/b`, httpStatus: 302, redirectChain: [`${origin}/loop/a`, `${origin}/loop/b`] })
    expect(valid(loop.evidenceRecord)).toMatchObject({
      finalUrl: `${origin}/loop/b`,
      redirectChain: { urls: [`${origin}/loop/a`, `${origin}/loop/b`], complete: true },
      httpStatus: 302, status: 'failed', reason: 'redirect_loop', lane: 'http',
    })
  })

  it('says no request left for a robots.txt disallow on a server that obeys it for every URL', async () => {
    const obeying = engineWith({ allowRobotsOverride: false, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    const denied = await scrape(obeying, { url: `${origin}/private` })
    expect(valid(denied.evidenceRecord)).toMatchObject({
      status: 'failed', reason: 'policy_denied', finalUrl: null, redirectChain: { urls: [], complete: true }, httpStatus: null, fetchedAt: null, rawSha256: null,
      robotsDecision: { decision: 'disallowed', robotsUrl: `${origin}/robots.txt`, robotsSha256: sha256Utf8(ROBOTS), userOverride: false, overrideBasis: null },
      identity: { userAgent: null },
    })
  })

  it('records the disallow and that the request named the URL when a local server fetches it', async () => {
    const named = await scrape(http, { url: `${origin}/private` })
    expect(valid(named.evidenceRecord)).toMatchObject({
      status: 'success', finalUrl: `${origin}/private`, httpStatus: 200,
      robotsDecision: { decision: 'disallowed', robotsUrl: `${origin}/robots.txt`, robotsSha256: sha256Utf8(ROBOTS), userOverride: true, overrideBasis: 'user_named_url' },
    })
  })

  it('maps JSON fields to where they were read and hashes the delivered data', async () => {
    const body = await scrape(http, { url: `${origin}/product`, formats: [{ type: 'json', schema: PRODUCT_SCHEMA }] })
    const json = body.json as { status: string; data: Record<string, unknown> }
    expect(json.status).toBe('complete')
    const record = valid(body.evidenceRecord)
    expect(record.outputSha256).toEqual({ markdown: null, json: sha256Utf8(JSON.stringify(Object.fromEntries(Object.entries(json.data).sort()))) })
    expect(record.fieldEvidence).toMatchObject({
      '/name': { source: 'jsonld' },
      '/price': { source: 'jsonld' },
      '/upc': { source: 'dom', locator: 'table[0] tr[0] "UPC"' },
      '/numberOfReviews': { source: 'dom', locator: 'table[0] tr[1] "Number of reviews"' },
    })
  })

  it('records a partial result the deadline ended', async () => {
    const body = await scrape(withBrowser, { url: `${origin}/table-shell`, formats: ['markdown'], timeout: 2000 })
    expect(valid(body.evidenceRecord)).toMatchObject({ status: 'partial', reason: null, lane: 'http', httpStatus: 200 })
  })

  it('gives every batch item and crawl page its record', async () => {
    const app = createApp(http)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    const batch = await client.batchScrape([`${origin}/product`, `${origin}/missing`, `${origin}/private`], { formats: ['markdown', { type: 'json', schema: PRODUCT_SCHEMA }] })
    await client.waitBatch(batch.taskId, { pollIntervalMs: 50, timeoutMs: 20_000 })
    const items = (await client.getBatchItems(batch.taskId, { limit: 50 })).items
    expect(items).toHaveLength(3)
    const byUrl = new Map(items.map(item => [item.url, valid(item.evidenceRecord)]))
    expect(byUrl.get(`${origin}/product`)).toMatchObject({ status: 'success', fieldEvidence: { '/upc': { source: 'dom' } }, identity: { mode: 'standard' } })
    expect(byUrl.get(`${origin}/product`)!.outputSha256.markdown).toBe(sha256Utf8(items.find(item => item.url === `${origin}/product`)!.markdown!))
    expect(byUrl.get(`${origin}/missing`)).toMatchObject({ status: 'failed', httpStatus: 404 })
    expect(byUrl.get(`${origin}/private`)).toMatchObject({ status: 'success', robotsDecision: { decision: 'disallowed', userOverride: true, overrideBasis: 'user_named_url' } })

    // The hub's pages are its siblings, outside the /hub/ subtree a crawl keeps to by default.
    const crawl = await client.crawl(`${origin}/hub`, { maxPages: 4, crawlEntireDomain: true })
    await client.waitCrawl(crawl.taskId, { pollIntervalMs: 50, timeoutMs: 20_000 })
    const pages = (await client.getCrawlPages(crawl.taskId)).items
    const errors = (await client.getCrawlErrors(crawl.taskId)).items
    expect(pages.length + errors.length).toBe(4)
    for (const page of [...pages, ...errors]) expect(valid(page.evidenceRecord)).toMatchObject({ requestedUrl: page.url, lane: 'http', fieldEvidence: null })
    expect(pages.find(page => page.url === `${origin}/article`)?.evidenceRecord).toMatchObject({ status: 'success', outputSha256: { markdown: expect.stringMatching(/^[0-9a-f]{64}$/) } })
    // A link the crawl discovered obeys robots.txt, where the batch's named URL above did not.
    expect(errors.find(page => page.url === `${origin}/private`)?.evidenceRecord).toMatchObject({ reason: 'policy_denied', robotsDecision: { decision: 'disallowed', userOverride: false, overrideBasis: null } })

    // A crawl started with ignoreRobotsTxt fetches that link too, and its record says on whose word.
    const ignoring = await client.crawl(`${origin}/hub`, { maxPages: 4, crawlEntireDomain: true, ignoreRobotsTxt: true })
    await client.waitCrawl(ignoring.taskId, { pollIntervalMs: 50, timeoutMs: 20_000 })
    // Its body repeats /article's, so it is listed as that page's duplicate.
    const fetched = (await client.getCrawlPages(ignoring.taskId, { includeDuplicates: true })).items.find(page => page.url === `${origin}/private`)
    expect(valid(fetched?.evidenceRecord)).toMatchObject({ robotsDecision: { decision: 'disallowed', userOverride: true, overrideBasis: 'ignore_robots_txt' } })
    expect(fetched?.warnings).toEqual([expect.objectContaining({ code: 'robots_overridden', message: expect.stringContaining('started with ignoreRobotsTxt') })])
  })
})

describe('Evidence Record: a page fetched past robots.txt in the cache', () => {
  it('is reused only by a request that sets robots.txt aside too: never by an obeying crawl or a hosted engine on the same task root', async () => {
    const root = join(taskRoot, 'cache-robots')
    const httpOnly = (mode: Parameters<typeof buildChannels>[0]) => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http')
    const local = engineWith({ taskRoot: root, channelsFor: httpOnly })
    const named = await scrape(local, { url: `${origin}/private`, maxAge: 3_600_000 })
    expect(named).toMatchObject({ status: 'success', evidenceRecord: { robotsDecision: { overrideBasis: 'user_named_url' } } })
    // A second named scrape may reuse it: it sets robots.txt aside as the first did.
    expect(await scrape(local, { url: `${origin}/private`, maxAge: 3_600_000 })).toMatchObject({ status: 'success', metadata: { cacheState: 'hit' } })
    const app = createApp(local)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    const crawl = await client.crawl(`${origin}/hub`, { maxPages: 4, crawlEntireDomain: true, maxAge: 3_600_000 })
    await client.waitCrawl(crawl.taskId, { pollIntervalMs: 50, timeoutMs: 20_000 })
    const pages = [...(await client.getCrawlPages(crawl.taskId, { includeDuplicates: true })).items, ...(await client.getCrawlErrors(crawl.taskId)).items]
    expect(pages.find(page => page.url === `${origin}/private`)).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
    await local.close()
    const hosted = engineWith({ taskRoot: root, hosted: true, allowRobotsOverride: false, channelsFor: httpOnly })
    expect(await scrape(hosted, { url: `${origin}/private`, maxAge: 3_600_000 })).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
  })
})

describe('Evidence Record: browser lane', () => {
  let browser: ApiEngine
  beforeAll(() => { browser = engineWith({ channelPolicy: () => 'browser_only' }) })

  it('records what a real Chromium observed, every redirect hop included', async () => {
    const moved = await scrape(browser, { url: `${origin}/moved` })
    const record = valid(moved.evidenceRecord)
    expect(moved.evidence).toMatchObject({ contentType: 'text/html; charset=utf-8' })
    expect(record).toMatchObject({
      finalUrl: `${origin}/article`,
      redirectChain: { urls: [`${origin}/moved`, `${origin}/article`], complete: true },
      httpStatus: 200, status: 'success', lane: 'browser_local',
      robotsDecision: { ...robotsAllowed, robotsUrl: `${origin}/robots.txt` },
      rawSha256: (moved.evidence as { rawBodySha256: string }).rawBodySha256,
      identity: { mode: 'standard', contact: null },
    })
    expect(record.identity.userAgent).toMatch(/Chrome\/\d+/)
    expect(recently(record.fetchedAt)).toBe(true)

    const missing = await scrape(browser, { url: `${origin}/missing`, formats: ['markdown'] })
    expect(valid(missing.evidenceRecord)).toMatchObject({ status: 'failed', reason: 'http_error', httpStatus: 404, lane: 'browser_local' })
    const blocked = await scrape(browser, { url: `${origin}/challenge` })
    expect(valid(blocked.evidenceRecord)).toMatchObject({ status: 'blocked', httpStatus: 403, lane: 'browser_local' })
  })

  it('records the document a script or a meta refresh moved on to, in every response shape', async () => {
    const snapshot = { httpStatus: 404, contentType: 'text/html; charset=utf-8' }
    const full = await scrape(browser, { url: `${origin}/leaving`, formats: ['markdown'] })
    expect(full).toMatchObject({ status: 'failed', failureReason: 'http_error', evidence: { finalUrl: `${origin}/missing`, ...snapshot } })
    expect(full.markdown).toContain('Page not found')
    expect(valid(full.evidenceRecord)).toMatchObject({
      finalUrl: `${origin}/missing`,
      redirectChain: { urls: [`${origin}/leaving`, `${origin}/missing`], complete: true },
      httpStatus: 404, status: 'failed', reason: 'http_error', lane: 'browser_local',
    })
    const compact = await scrape(browser, { url: `${origin}/leaving`, formats: ['markdown'], debug: false })
    expect(compact).toMatchObject({ status: 'failed', finalUrl: `${origin}/missing`, snapshot })
    const shim = await createApp(browser).request('/fc/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${origin}/leaving` }) })
    expect(await shim.json()).toMatchObject({ success: false, error: 'failed: http_error', data: { metadata: { url: `${origin}/missing`, statusCode: 404, contentType: 'text/html; charset=utf-8', error: 'http_error' } } })

    const refreshed = await scrape(browser, { url: `${origin}/refresh`, formats: ['markdown'], waitFor: 500 })
    expect(refreshed).toMatchObject({ status: 'success', evidence: { finalUrl: `${origin}/article`, httpStatus: 200 } })
    expect(valid(refreshed.evidenceRecord)).toMatchObject({ finalUrl: `${origin}/article`, redirectChain: { urls: [`${origin}/refresh`, `${origin}/article`], complete: true }, httpStatus: 200, status: 'success' })
  })

  it('records JSON field evidence and a partial capture', async () => {
    const product = await scrape(browser, { url: `${origin}/product`, formats: [{ type: 'json', schema: PRODUCT_SCHEMA }] })
    expect(valid(product.evidenceRecord)).toMatchObject({ lane: 'browser_local', fieldEvidence: { '/price': { source: 'jsonld' }, '/upc': { source: 'dom' } } })
    const partial = await scrape(browser, { url: `${origin}/article`, formats: ['markdown'], waitFor: 20_000, timeout: 4000 })
    expect(valid(partial.evidenceRecord)).toMatchObject({ status: 'partial', reason: null, lane: 'browser_local' })
  })
})

describe('Evidence Record: provider lane', () => {
  const VENDOR_UA = 'Mozilla/5.0 (compatible; fixture-vendor/1.0; +https://vendor.example/bot)'
  let provider: ApiEngine
  beforeAll(() => {
    const transport: ProviderTransport = {
      async fetch(url) {
        const res = await fetch(url, { headers: { 'user-agent': VENDOR_UA } })
        return { status: res.status, body: await res.text(), finalUrl: res.url, headers: Object.fromEntries(res.headers), sentUserAgent: VENDOR_UA }
      },
    }
    const subject = new ProviderSubject({ id: 'fixture', declaredUserAgent: VENDOR_UA, capabilities: ['headless_browser'], honoursCallerUserAgent: false }, transport, 'research', null, robotsFetcherVia())
    const channel: Channel = {
      id: 'provider', vendorId: 'fixture', identity: identityForRoute('research', { resume: true }),
      fetch: (url, _session, execution, options) => subject.fetch(url, execution?.deadlineAt, execution?.signal, execution?.onRetryAfter, options),
    }
    provider = engineWith({ channelsFor: () => [channel] })
  })

  it('records the vendor\'s answer and User-Agent, and an unreported route as no proxy', async () => {
    const moved = await scrape(provider, { url: `${origin}/moved`, mode: 'research' })
    const record = valid(moved.evidenceRecord)
    expect(record).toMatchObject({
      finalUrl: `${origin}/article`, redirectChain: { urls: [`${origin}/moved`, `${origin}/article`], complete: false },
      httpStatus: 200, status: 'success', lane: 'provider', proxy: null,
      robotsDecision: { ...robotsAllowed, robotsUrl: `${origin}/robots.txt` },
      identity: { userAgent: VENDOR_UA, mode: 'research', contact: null },
    })
    expect(recently(record.fetchedAt)).toBe(true)
    const missing = await scrape(provider, { url: `${origin}/missing`, mode: 'research', formats: ['markdown'] })
    expect(valid(missing.evidenceRecord)).toMatchObject({ status: 'failed', reason: 'http_error', httpStatus: 404, outputSha256: { markdown: sha256Utf8(missing.markdown!) } })
    const blocked = await scrape(provider, { url: `${origin}/challenge`, mode: 'research' })
    expect(valid(blocked.evidenceRecord)).toMatchObject({ status: 'blocked', httpStatus: 403, lane: 'provider' })
  })

  it('records JSON field evidence and a refusal under robots.txt', async () => {
    const product = await scrape(provider, { url: `${origin}/product`, mode: 'research', formats: [{ type: 'json', schema: PRODUCT_SCHEMA }] })
    expect(valid(product.evidenceRecord)).toMatchObject({ lane: 'provider', fieldEvidence: { '/name': { source: 'jsonld' }, '/upc': { source: 'dom' } } })
    const denied = await scrape(provider, { url: `${origin}/private`, mode: 'research' })
    expect(valid(denied.evidenceRecord)).toMatchObject({ status: 'failed', reason: 'policy_denied', finalUrl: null, robotsDecision: { decision: 'disallowed' }, identity: { userAgent: null } })
  })
})
