import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Ajv2020 from 'ajv/dist/2020.js'
import { localNetworkPolicy, type CrawlPage, type EvidenceRecord, type NetworkPolicy } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * The page cache (`maxAge`, `minAge`, `storeInCache`, `lockdown`) through
 * the API, on the http rung against a loopback fixture that counts every
 * request it answers: a reuse requests nothing and carries the original
 * fetch's Evidence Record; nothing looked up is never called a miss.
 */
const schema = JSON.parse(readFileSync(new URL('../../contracts/schemas/evidence-record.v1.json', import.meta.url), 'utf8')) as object
const AjvClass = Ajv2020 as unknown as new (options: object) => { compile(schema: object): ((data: unknown) => boolean) & { errors?: unknown } }
const validate = new AjvClass({ allErrors: true, allowUnionTypes: true }).compile(schema)

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(4)
const page = (title: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><nav><a href="/">Home</a></nav><main><article><h1>${title}</h1><p>${PROSE}</p></article></main></body></html>`

let server: Server
let origin: string
let taskRoot: string
let engine: ApiEngine
const hits = new Map<string, number>()
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? ''
    hits.set(path, (hits.get(path) ?? 0) + 1)
    if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
    if (path === '/missing') { res.writeHead(404, { 'content-type': 'text/html' }).end('<html><body><h1>Not found</h1></body></html>'); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(`Page ${path}`))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  taskRoot = await mkdtemp(join(tmpdir(), 'w2l-page-cache-'))
  engine = createApiEngine({ taskRoot, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
})

afterAll(async () => {
  await engine.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(taskRoot, { recursive: true, force: true })
})

type Json = Record<string, any>

async function post(path: string, body: Json): Promise<{ status: number; body: Json }> {
  const res = await createApp(engine).request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() as Json }
}

async function scrape(body: Json): Promise<Json> {
  const res = await post('/v1/scrape', body)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body
}

function valid(record: EvidenceRecord): EvidenceRecord {
  expect(validate(record), JSON.stringify(validate.errors)).toBe(true)
  return record
}

/** A job's pages once it has ended. */
async function finished(kind: 'batch' | 'crawl', id: string): Promise<CrawlPage[]> {
  for (let i = 0; i < 400; i++) {
    const report = kind === 'batch' ? await engine.getBatch(id) : await engine.getCrawl(id)
    if (report !== null && ['completed', 'failed', 'cancelled'].includes(report.status)) {
      const list = kind === 'batch' ? await engine.getBatchItems(id, { limit: 50 }) : await engine.getCrawlPages(id, { limit: 50 })
      return [...list!.items]
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`${kind} ${id} did not finish`)
}

const HOUR = 3_600_000

describe('page cache: scrape', () => {
  it('reuses a stored result within maxAge: nothing requested, the original fetch\'s Evidence Record, cacheState hit with cachedAt', async () => {
    const url = `${origin}/reuse`
    const first = await scrape({ url, maxAge: HOUR })
    expect(first.metadata).toMatchObject({ cacheState: 'miss' })
    expect(first.metadata).not.toHaveProperty('cachedAt')
    expect(first.trace.map((event: { event: string }) => event.event)).toEqual(expect.arrayContaining(['cache_miss', 'cache_stored']))
    const fetched = hits.get('/reuse')
    expect(fetched).toBe(1)

    const second = await scrape({ url, maxAge: HOUR })
    expect(hits.get('/reuse')).toBe(fetched)
    expect(second.status).toBe('success')
    expect(second.metadata).toMatchObject({ cacheState: 'hit', cachedAt: first.evidenceRecord.fetchedAt })
    expect(valid(second.evidenceRecord)).toEqual(valid(first.evidenceRecord))
    expect(second.markdown).toBe(first.markdown)
    expect(second.scrapeId).not.toBe(first.scrapeId)
    expect(second.channelsTried).toEqual([])
    expect(second.usage).toMatchObject({ requestCount: 0, attemptCount: 0, bytesWire: 0, browserMs: 0 })

    // The compact shape says the same in its metadata.
    const compact = await scrape({ url, maxAge: HOUR, formats: ['markdown'], debug: false })
    expect(compact.metadata).toMatchObject({ cacheState: 'hit', cachedAt: first.evidenceRecord.fetchedAt })
    expect(compact.evidenceRecord).toEqual(first.evidenceRecord)
    expect(hits.get('/reuse')).toBe(fetched)
  })

  it('looks nothing up without maxAge, or with maxAge 0, and then says nothing about the cache', async () => {
    const url = `${origin}/live`
    const plain = await scrape({ url })
    const bypass = await scrape({ url, maxAge: 0, minAge: 0 })
    expect(hits.get('/live')).toBe(2)
    for (const response of [plain, bypass]) {
      expect(response.metadata).not.toHaveProperty('cacheState')
      expect(response.trace.map((event: { event: string }) => event.event)).not.toContain('cache_miss')
    }
    // Stored all the same (storeInCache defaults to true), so a later lookup finds the latest.
    expect((await scrape({ url, maxAge: HOUR })).metadata).toMatchObject({ cacheState: 'hit', cachedAt: bypass.evidenceRecord.fetchedAt })
    expect(hits.get('/live')).toBe(2)
  })

  it('stores nothing with storeInCache false, and never a page that did not succeed', async () => {
    await scrape({ url: `${origin}/unstored`, storeInCache: false })
    expect((await scrape({ url: `${origin}/unstored`, maxAge: HOUR })).metadata).toMatchObject({ cacheState: 'miss' })
    expect(hits.get('/unstored')).toBe(2)

    const missing = await scrape({ url: `${origin}/missing` })
    expect(missing.status).toBe('failed')
    expect((await scrape({ url: `${origin}/missing`, maxAge: HOUR })).metadata).toMatchObject({ cacheState: 'miss' })
    expect(hits.get('/missing')).toBe(2)
  })

  it('reuses a result only under the options that shaped it', async () => {
    const url = `${origin}/shaped`
    await scrape({ url })
    expect((await scrape({ url, maxAge: HOUR, onlyMainContent: false })).metadata.cacheState).toBe('miss')
    expect((await scrape({ url, maxAge: HOUR, headers: { 'accept-language': 'de' } })).metadata.cacheState).toBe('miss')
    expect((await scrape({ url, maxAge: HOUR, formats: ['markdown', 'html'] })).metadata.cacheState).toBe('miss')
    // The deadline bounds a fetch but does not shape a result; a fragment is not part of the page.
    expect((await scrape({ url: `${url}#top`, maxAge: HOUR, timeout: 20_000 })).metadata.cacheState).toBe('hit')
    expect(hits.get('/shaped')).toBe(4)
  })

  it('reuses only a result at least minAge old', async () => {
    const url = `${origin}/aged`
    await scrape({ url })
    expect((await scrape({ url, minAge: 60_000 })).metadata).toMatchObject({ cacheState: 'miss' })
    expect(hits.get('/aged')).toBe(2)
    expect((await scrape({ url, minAge: 0, maxAge: HOUR })).metadata.cacheState).toBe('hit')
    expect(hits.get('/aged')).toBe(2)
  })

  it('answers lockdown from the cache alone: a stored page is a hit, any other is failed with cache_miss and nothing is requested', async () => {
    const stored = `${origin}/locked-stored`
    await scrape({ url: stored })
    const robots = hits.get('/robots.txt') ?? 0
    const hit = await scrape({ url: stored, lockdown: true })
    expect(hit.metadata).toMatchObject({ cacheState: 'hit' })

    const miss = await scrape({ url: `${origin}/locked-new`, lockdown: true })
    expect(miss).toMatchObject({ status: 'failed', failureReason: 'cache_miss', metadata: { cacheState: 'miss' } })
    expect(valid(miss.evidenceRecord)).toMatchObject({ finalUrl: null, fetchedAt: null, httpStatus: null, reason: 'cache_miss', identity: { userAgent: null, device: null, requestHeaders: null } })
    expect(miss.agentHints[0]).toMatch(/lockdown/)
    expect(hits.get('/locked-new')).toBeUndefined()
    expect(hits.get('/locked-stored')).toBe(1)
    expect(hits.get('/robots.txt') ?? 0).toBe(robots)
  })

  it('never answers from the cache for a URL the request\'s allowlist refuses', async () => {
    const url = `${origin}/governed`
    await scrape({ url })
    const refused = await scrape({ url, maxAge: HOUR, allowlistedDomains: ['example.org'] })
    expect(refused).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
    expect(refused.metadata).not.toHaveProperty('cacheState')
  })

  it('refuses a lookup in mode authed, and contradictory bounds, before anything is fetched', async () => {
    for (const body of [
      { url: `${origin}/refused`, mode: 'authed', maxAge: HOUR },
      { url: `${origin}/refused`, maxAge: 1000, minAge: 2000 },
      { url: `${origin}/refused`, lockdown: true, maxAge: 0 },
      { url: `${origin}/refused`, maxAge: -1 },
    ]) {
      const res = await post('/v1/scrape', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(hits.get('/refused')).toBeUndefined()
  })
})

describe('page cache: what a reuse may and may not carry', () => {
  it('reuses only a result the same build extracted, so a hit\'s Evidence Record names the build that produced it', async () => {
    const saved = process.env.W2L_SOURCE_COMMIT
    try {
      process.env.W2L_SOURCE_COMMIT = 'aaaaaaa'
      const first = await scrape({ url: `${origin}/built`, maxAge: HOUR })
      expect(first.evidenceRecord.extractor.commit).toBe('aaaaaaa')
      expect((await scrape({ url: `${origin}/built`, maxAge: HOUR })).evidenceRecord.extractor.commit).toBe('aaaaaaa')
      process.env.W2L_SOURCE_COMMIT = 'bbbbbbb'
      const upgraded = await scrape({ url: `${origin}/built`, maxAge: HOUR })
      expect(upgraded.metadata.cacheState).toBe('miss')
      expect(upgraded.evidenceRecord.extractor.commit).toBe('bbbbbbb')
      expect(hits.get('/built')).toBe(2)
    } finally {
      if (saved === undefined) delete process.env.W2L_SOURCE_COMMIT
      else process.env.W2L_SOURCE_COMMIT = saved
    }
  })

  it('reports no network timing of the original fetch on a hit', async () => {
    const first = await scrape({ url: `${origin}/timed` })
    expect(first.usage.timings).toHaveProperty('requestMs')
    const hit = await scrape({ url: `${origin}/timed`, maxAge: HOUR })
    expect(hit.metadata.cacheState).toBe('hit')
    expect(Object.keys(hit.usage.timings ?? {}).sort()).toEqual(expect.arrayContaining(['totalMs']))
    for (const key of ['requestMs', 'transportMs', 'robotsMs', 'bodyReadMs', 'queueMs']) expect(hit.usage.timings ?? {}).not.toHaveProperty(key)
  })

  it('keeps custom header values out of the cache unless asked, and out of the Evidence Record always', async () => {
    const headers = { 'x-api-key': 'S3CRET-VALUE' }
    const plain = await scrape({ url: `${origin}/keyed`, headers, formats: ['markdown'], debug: false })
    expect(JSON.stringify(plain)).not.toContain('S3CRET-VALUE')
    expect(plain.evidenceRecord.identity.requestHeaders).toEqual([{ name: 'x-api-key', valueSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }])
    expect((await scrape({ url: `${origin}/keyed`, headers, maxAge: HOUR })).metadata.cacheState).toBe('miss')
    expect(readFileSync(join(taskRoot, 'page-cache.sqlite')).includes('S3CRET-VALUE')).toBe(false)
    // Asked for: stored, and reused for the same headers only.
    await scrape({ url: `${origin}/keyed`, headers, storeInCache: true })
    expect((await scrape({ url: `${origin}/keyed`, headers, maxAge: HOUR })).metadata.cacheState).toBe('hit')
    expect((await scrape({ url: `${origin}/keyed`, headers: { 'x-api-key': 'OTHER' }, maxAge: HOUR })).metadata.cacheState).toBe('miss')
  })
})

describe('page cache: /fc', () => {
  it('maps maxAge and reports cacheState and cachedAt in data.metadata; a lockdown miss is 404 SCRAPE_LOCKDOWN_CACHE_MISS', async () => {
    const url = `${origin}/fc-cached`
    const first = await post('/fc/v1/scrape', { url, maxAge: HOUR })
    expect(first.body.data.metadata).toMatchObject({ cacheState: 'miss' })
    const second = await post('/fc/v1/scrape', { url, maxAge: HOUR })
    expect(second.body).toMatchObject({ success: true, data: { metadata: { cacheState: 'hit', cachedAt: expect.any(String) } } })
    expect(hits.get('/fc-cached')).toBe(1)

    const miss = await post('/fc/v1/scrape', { url: `${origin}/fc-never`, lockdown: true })
    expect(miss.status).toBe(404)
    expect(miss.body).toMatchObject({ success: false, code: 'SCRAPE_LOCKDOWN_CACHE_MISS' })
    expect(hits.get('/fc-never')).toBeUndefined()
  })
})

describe('page cache: batch and crawl', () => {
  it('reuses a batch\'s stored pages in a later batch, page by page, with each one\'s cacheState', async () => {
    const urls = [`${origin}/batch/a`, `${origin}/batch/b`]
    const first = await post('/v1/batches', { urls })
    const firstItems = await finished('batch', first.body.taskId)
    expect(firstItems.every(item => item.cacheState === undefined && item.cached === false)).toBe(true)

    const second = await post('/v1/batches', { urls: [...urls, `${origin}/batch/c`], maxAge: HOUR })
    const items = await finished('batch', second.body.taskId)
    const byUrl = new Map(items.map(item => [item.url, item]))
    for (const url of urls) {
      const before = firstItems.find(item => item.url === url)!
      expect(byUrl.get(url)).toMatchObject({ status: 'success', cached: true, cacheState: 'hit', cachedAt: before.evidenceRecord!.fetchedAt })
      expect(byUrl.get(url)!.evidenceRecord).toEqual(before.evidenceRecord)
    }
    expect(byUrl.get(`${origin}/batch/c`)).toMatchObject({ status: 'success', cached: false, cacheState: 'miss' })
    expect([hits.get('/batch/a'), hits.get('/batch/b'), hits.get('/batch/c')]).toEqual([1, 1, 1])
  })

  it('serves a crawl\'s pages from the cache in lockdown, and refuses lockdown with a sitemap read', async () => {
    const url = `${origin}/crawl-seed`
    await scrape({ url })
    const refused = await post('/v1/crawl', { url, lockdown: true })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body)).toMatch(/set sitemap to \\"skip\\"/)

    const crawl = await post('/v1/crawl', { url, lockdown: true, sitemap: 'skip', maxDepth: 0 })
    expect(crawl.status).toBe(202)
    const [seed] = await finished('crawl', crawl.body.taskId)
    expect(seed).toMatchObject({ url, status: 'success', cached: true, cacheState: 'hit' })
    expect(hits.get('/crawl-seed')).toBe(1)
    const report = await engine.getCrawl(crawl.body.taskId)
    expect(report).toMatchObject({ status: 'completed', cachedPages: 1 })
  })
})
