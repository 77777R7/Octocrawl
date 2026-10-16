import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Ajv2020 from 'ajv/dist/2020.js'
import { localNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine, type ApiEngineOptions } from '../src/engine.js'

/**
 * A task contract (`verify`, ADR 0006) on scrape and batch: the verification beside the fetch's status, in the response,
 * each batch page and the Evidence Record, and the regex checks a hosted server refuses.
 */
const schema = JSON.parse(readFileSync(new URL('../../contracts/schemas/evidence-record.v1.json', import.meta.url), 'utf8')) as object
const AjvClass = Ajv2020 as unknown as new (options: object) => { compile(schema: object): ((data: unknown) => boolean) & { errors?: unknown } }
const validate = new AjvClass({ allErrors: true, allowUnionTypes: true }).compile(schema)

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(4)
const PAGES: Record<string, string> = {
  '/blank-table': `<!doctype html><html><head><title>Historical data</title></head><body><main><h1>Historical data</h1><p>${PROSE}</p><table><thead><tr><th>Date</th><th>Close</th></tr></thead><tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody></table></main></body></html>`,
  '/filled-table': `<!doctype html><html><head><title>Historical data</title></head><body><main><h1>Historical data</h1><p>${PROSE}</p><table><thead><tr><th>Date</th><th>Close</th></tr></thead><tbody><tr><td>2026-01</td><td>0</td></tr><tr><td>2026-02</td><td>2.5</td></tr></tbody></table></main></body></html>`,
  '/media-feed': '<!doctype html><html><head><title>Video feed</title></head><body><nav><a href="/help">Help menu</a></nav><main><div><article class="clip"><video src="/a.mp4"></video><a href="/Ada">Ada</a><p>Glass sculpture</p></article><article class="clip"><video src="/b.mp4"></video><a href="/Bo">Bo</a><p>Clay carving</p></article></div></main></body></html>',
  '/duplicate-list': '<html><body><main><div class="card" data-id="a"><a class="name">Glass vase</a><span class="price">12</span></div><div class="card" data-id="a"><a class="name">Glass vase</a><span class="price">12</span></div><div class="card" data-id="b"><a class="name">Clay bowl</a><span class="price">9</span></div></main></body></html>',
  '/article': `<!doctype html><html lang="en"><head><title>Tide report</title></head><body><main><article><h1>Tide report</h1><p>${PROSE}</p><p>High water at 06:12, low water at 12:30.</p></article></main></body></html>`,
}

let server: Server
let origin: string
let taskRoot: string
let articleReads = 0
const engines: ApiEngine[] = []
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
    const body = PAGES[req.url ?? '']
    if (req.url === '/article') articleReads++
    if (body === undefined) { res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><html><body><h1>Not found</h1></body></html>'); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  taskRoot = await mkdtemp(join(tmpdir(), 'w2l-verify-'))
})

afterAll(async () => {
  await Promise.all(engines.map(engine => engine.close()))
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(taskRoot, { recursive: true, force: true })
})

function engineWith(options: Partial<ApiEngineOptions> = {}): ApiEngine {
  const engine = createApiEngine({ taskRoot: join(taskRoot, String(engines.length)), networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http'), ...options })
  engines.push(engine)
  return engine
}

async function call(engine: ApiEngine, method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, any> }> {
  const res = await createApp(engine).request(path, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
  return { status: res.status, json: await res.json() as Record<string, any> }
}

const passing = { checks: [{ type: 'markdownIncludes', text: 'High water' }, { type: 'markdownCountMin', pattern: '\\d\\d:\\d\\d', min: 2 }] }
const failing = { checks: [{ type: 'markdownIncludes', text: 'High water' }, { type: 'minTables', min: 1 }] }

describe('task verification on a request (ADR 0006)', () => {
  it('counts distinct complete records while keeping all source records in the delivered list', async () => {
    const engine = engineWith()
    const list = { type: 'list', itemSelector: '.card', fields: [{ name: 'id', attribute: 'data-id' }, { name: 'name', selector: '.name' }, { name: 'price', selector: '.price' }] }
    const request = { url: `${origin}/duplicate-list`, formats: ['markdown', list], debug: false }
    const legacy = await call(engine, 'POST', '/v1/scrape', { ...request, verify: { checks: [{ type: 'recordFields', fields: ['name', 'price'], min: 3 }] } })
    expect(legacy.json.verification.status).toBe('passed')
    const distinct = await call(engine, 'POST', '/v1/scrape', { ...request, verify: { checks: [{ type: 'recordFields', fields: ['name', 'price'], min: 3, uniqueBy: ['id'] }] } })
    expect(distinct.status).toBe(200)
    expect(distinct.json.list.records).toHaveLength(3)
    expect(distinct.json.list.records.map((r: any) => r.source.index)).toEqual([0, 1, 2])
    expect(distinct.json.verification).toMatchObject({ status: 'failed', checks: [{ observedCount: 2, asked: 3 }] })
    expect(distinct.json.evidenceRecord.verification.status).toBe('failed')
  })

  it('checks required cells in the delivered table, rejecting blank data rows without changing the fetch status', async () => {
    const engine = engineWith()
    const verify = { checks: [{ type: 'tableRowsMin', tableIndex: 0, columns: [0, 1], min: 2 }] }
    for (const [page, status, observedCount] of [['blank-table', 'failed', 0], ['filled-table', 'passed', 2]] as const) {
      for (const debug of [false, true]) {
        const response = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/${page}`, onlyMainContent: false, formats: ['tables'], verify, debug })
        expect(response.status).toBe(200)
        expect(response.json).toMatchObject({ status: 'success', tables: [{ tableIndex: 0, headerRows: 1 }], verification: { status, checks: [{ type: 'tableRowsMin', passed: status === 'passed', observedCount, asked: 2 }] } })
        expect(response.json.tables[0].rows).toHaveLength(3)
        expect(validate(response.json.evidenceRecord), JSON.stringify(validate.errors)).toBe(true)
      }
    }
  })

  it('requires explicit delivered tables for tableRowsMin before fetching or creating a job', async () => {
    const engine = engineWith()
    const before = articleReads
    for (const [path, target] of [['/v1/scrape', { url: `${origin}/article` }], ['/v1/batches', { urls: [`${origin}/article`] }], ['/v1/crawl', { url: `${origin}/article`, maxPages: 1 }]] as const) {
      for (const formats of [undefined, ['markdown']]) {
        const response = await call(engine, 'POST', path, { ...target, formats, verify: { checks: [{ type: 'tableRowsMin', tableIndex: 0, columns: [0, 1], min: 1 }] } })
        expect(response.status).toBe(400)
        expect(response.json.error).toContain('formats must include tables')
      }
    }
    expect(articleReads).toBe(before)
  })

  it('delivers a sparse video feed through the default HTTP extraction path without an explicit list selector', async () => {
    const response = await call(engineWith(), 'POST', '/v1/scrape', {
      url: `${origin}/media-feed`, formats: ['markdown'], debug: false,
      verify: { checks: [{ type: 'markdownIncludes', text: 'Glass sculpture' }, { type: 'markdownIncludes', text: 'Clay carving' }] },
    })
    expect(response.status).toBe(200)
    expect(response.json.verification.status).toBe('passed')
    expect(response.json.markdown).toContain('Glass sculpture')
    expect(response.json.markdown).toContain('Clay carving')
    expect(response.json.markdown).not.toContain('Help menu')
  })

  it('refuses Markdown checks when explicit formats omit their data, before fetching or creating a job', async () => {
    const engine = engineWith()
    const before = articleReads
    for (const [path, target] of [
      ['/v1/scrape', { url: `${origin}/article` }],
      ['/v1/batches', { urls: [`${origin}/article`] }],
      ['/v1/crawl', { url: `${origin}/article`, maxPages: 1 }],
    ] as const) {
      const response = await call(engine, 'POST', path, { ...target, formats: ['links'], verify: passing })
      expect(response.status).toBe(400)
      expect(response.json.error).toContain('formats must include markdown')
    }
    expect(articleReads).toBe(before)
  })

  it('also requires delivered Markdown for minTables and a field check on Markdown', async () => {
    const engine = engineWith()
    for (const check of [{ type: 'minTables', min: 1 }, { type: 'field', path: 'markdown', present: true }]) {
      const response = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, formats: ['tables'], verify: { checks: [check] } })
      expect(response.status).toBe(400)
      expect(response.json.error).toContain('formats must include markdown')
    }
    const plain = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, formats: ['links'] })
    expect(plain.status).toBe(200)
    expect(plain.json.markdown ?? null).toBeNull()
    expect(plain.json.verification.status).toBe('not_requested')
  })

  it('answers with a verification beside an unchanged status, in the full and compact responses and the Evidence Record', async () => {
    const engine = engineWith()
    const passed = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, verify: passing })
    expect(passed.status).toBe(200)
    expect(passed.json.status).toBe('success')
    expect(passed.json.verification).toMatchObject({ status: 'passed', verifier: 'verify/6', reason: null, checks: [{ index: 0, type: 'markdownIncludes', data: true, passed: true }, { index: 1, type: 'markdownCountMin', passed: true, observedCount: 2, asked: 2 }] })
    expect(passed.json.verification.contractSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(validate(passed.json.evidenceRecord), JSON.stringify(validate.errors)).toBe(true)
    expect(passed.json.evidenceRecord.verification).toEqual({ status: 'passed', verifier: 'verify/6', contractSha256: passed.json.verification.contractSha256, reason: null, failed: [] })

    // The fetch succeeded and the task was not done: the status says the first, the verification the second.
    const failed = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, verify: failing, formats: ['markdown', 'links'], debug: false })
    expect(failed.json).toMatchObject({ status: 'success', verification: { status: 'failed', reason: 'checks_failed', checks: [{ passed: true }, { type: 'minTables', passed: false, observedCount: 0, asked: 1, observed: '0 tables, at least 1 asked' }] } })
    // The Markdown checks read is also delivered, even when a check fails.
    expect(failed.json.markdown).toContain('High water')
    expect(validate(failed.json.evidenceRecord), JSON.stringify(validate.errors)).toBe(true)
    expect(failed.json.evidenceRecord.verification).toMatchObject({ status: 'failed', reason: 'checks_failed', failed: ['minTables'] })

    const notRead = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/gone`, verify: passing })
    expect(notRead.json).toMatchObject({ status: 'failed', verification: { status: 'failed', reason: 'page_not_read', checks: [] } })

    const plain = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article` })
    expect(plain.json.verification).toEqual({ status: 'not_requested' })
    expect(validate(plain.json.evidenceRecord), JSON.stringify(validate.errors)).toBe(true)
    expect(plain.json.evidenceRecord.verification).toEqual({ status: 'not_requested', verifier: null, contractSha256: null, reason: null, failed: [] })
  })

  it('verifies each page of a batch against the task contract', async () => {
    const engine = engineWith()
    const started = await call(engine, 'POST', '/v1/batches', { urls: [`${origin}/article`, `${origin}/gone`], verify: passing })
    expect(started.status).toBe(202)
    const id = started.json.taskId ?? started.json.id
    for (let i = 0; i < 200; i++) {
      const report = await call(engine, 'GET', `/v1/batches/${id}`)
      if (!['pending', 'running'].includes(report.json.status)) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const items = (await call(engine, 'GET', `/v1/batches/${id}/items?debug=true`)).json.items as Record<string, any>[]
    const byUrl = Object.fromEntries(items.map(item => [item.url, item]))
    expect(byUrl[`${origin}/article`]).toMatchObject({ status: 'success', verification: { status: 'passed' } })
    expect(byUrl[`${origin}/gone`]).toMatchObject({ status: 'failed', verification: { status: 'failed', reason: 'page_not_read' } })
    expect(validate(byUrl[`${origin}/article`].evidenceRecord), JSON.stringify(validate.errors)).toBe(true)
    expect(byUrl[`${origin}/article`].evidenceRecord.verification).toMatchObject({ status: 'passed' })
    // The status counts the contract beside succeeded and failed; a batch without one carries no such count.
    expect((await call(engine, 'GET', `/v1/batches/${id}`)).json).toMatchObject({ succeeded: 1, failed: 1, verified: 1, verificationFailed: 1 })
    const plain = await call(engine, 'POST', '/v1/batches', { urls: [`${origin}/article`] })
    for (let i = 0; i < 200; i++) {
      if (!['pending', 'running'].includes((await call(engine, 'GET', `/v1/batches/${plain.json.taskId ?? plain.json.id}`)).json.status)) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const plainStatus = (await call(engine, 'GET', `/v1/batches/${plain.json.taskId ?? plain.json.id}`)).json
    expect(plainStatus.succeeded).toBe(1)
    expect(plainStatus).not.toHaveProperty('verified')
    expect(plainStatus).not.toHaveProperty('verificationFailed')
  })

  it('counts a crawl\'s pages against the task contract on its status', async () => {
    const engine = engineWith()
    const started = await call(engine, 'POST', '/v1/crawl', { url: `${origin}/article`, maxPages: 1, verify: failing })
    expect(started.status).toBe(202)
    const id = started.json.taskId ?? started.json.id
    let report: Record<string, any> = {}
    for (let i = 0; i < 200; i++) {
      report = (await call(engine, 'GET', `/v1/crawl/${id}`)).json
      if (!['pending', 'running'].includes(report.status)) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    expect(report).toMatchObject({ status: 'completed', pagesFetched: 1, verified: 0, verificationFailed: 1 })
  })

  it('judges a batch page whose fetch threw against the contract, not as one sent without it', async () => {
    const engine = engineWith({ channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http').map(channel => Object.assign(Object.create(Object.getPrototypeOf(channel) as object) as typeof channel, channel, { fetch: async () => { throw new Error('the lane broke') } })) })
    const started = await call(engine, 'POST', '/v1/batches', { urls: [`${origin}/article`], verify: passing })
    const id = started.json.taskId ?? started.json.id
    for (let i = 0; i < 200; i++) {
      if (!['pending', 'running'].includes((await call(engine, 'GET', `/v1/batches/${id}`)).json.status)) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const [item] = (await call(engine, 'GET', `/v1/batches/${id}/items?debug=true`)).json.items as Record<string, any>[]
    expect(item).toMatchObject({ status: 'failed', verification: { status: 'failed', verifier: 'verify/6', reason: 'page_not_read', checks: [] } })
    expect(validate(item!.evidenceRecord), JSON.stringify(validate.errors)).toBe(true)
    expect(item!.evidenceRecord.verification).toMatchObject({ status: 'failed', reason: 'page_not_read', contractSha256: item!.verification.contractSha256 })
  })

  it('goes on up the ladder from a page that fails the contract, and stops at the first page without one', async () => {
    // A stand-in for the browser rung: the HTTP rung's page, with the line the task asks for.
    const withBrowser = (mode: Parameters<typeof buildChannels>[0]) => {
      const http = buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http')
      const browser = { id: 'browser_local', identity: http[0]!.identity, fetch: async (...args: Parameters<typeof http[0]['fetch']>) => { const read = await http[0]!.fetch(...args); return { ...read, lane: 'browser_local' as const, markdown: `${read.markdown}\n\nHarbour fee: 12` } } }
      return [...http, browser]
    }
    const engine = engineWith({ channelsFor: withBrowser })
    const contract = { checks: [{ type: 'markdownIncludes', text: 'Harbour fee' }] }
    const verified = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, verify: contract, debug: true })
    expect(verified.json).toMatchObject({ status: 'success', lane: 'browser_local', channelsTried: ['http', 'browser_local'], verification: { status: 'passed' } })
    expect(verified.json.ladderTrace.filter((t: { event: string }) => t.event === 'verification_checked').map((t: { detail: { verdict: string } }) => t.detail.verdict)).toEqual(['failed', 'passed'])
    const plain = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, debug: true, maxAge: 0 })
    expect(plain.json).toMatchObject({ lane: 'http', channelsTried: ['http'] })
  })

  it('is refused with its regex checks by a hosted server, which takes the others', async () => {
    const hosted = engineWith({ hosted: true })
    const refused = await call(hosted, 'POST', '/v1/scrape', { url: `${origin}/article`, verify: passing })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.json)).toContain('markdownCountMin checks are not available in hosted mode')
    const batch = await call(hosted, 'POST', '/v1/batches', { urls: [`${origin}/article`], verify: { checks: [{ type: 'markdownMatches', pattern: 'High' }] } })
    expect(batch.status).toBe(400)
  })

  it('refuses a malformed contract before anything is fetched', async () => {
    const res = await call(engineWith(), 'POST', '/v1/scrape', { url: `${origin}/article`, verify: { checks: [{ type: 'markdownCountMin', pattern: '(a+)+$', min: 1 }] } })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.json)).toContain('verify.checks[0].pattern is refused')
  })
})
