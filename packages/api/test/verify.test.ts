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
  '/article': `<!doctype html><html lang="en"><head><title>Tide report</title></head><body><main><article><h1>Tide report</h1><p>${PROSE}</p><p>High water at 06:12, low water at 12:30.</p></article></main></body></html>`,
}

let server: Server
let origin: string
let taskRoot: string
const engines: ApiEngine[] = []
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
    const body = PAGES[req.url ?? '']
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
  it('answers with a verification beside an unchanged status, in the full and compact responses and the Evidence Record', async () => {
    const engine = engineWith()
    const passed = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, verify: passing })
    expect(passed.status).toBe(200)
    expect(passed.json.status).toBe('success')
    expect(passed.json.verification).toMatchObject({ status: 'passed', verifier: 'verify/1', reason: null, checks: [{ index: 0, type: 'markdownIncludes', data: true, passed: true }, { index: 1, type: 'markdownCountMin', passed: true, observedCount: 2, asked: 2 }] })
    expect(passed.json.verification.contractSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(validate(passed.json.evidenceRecord), JSON.stringify(validate.errors)).toBe(true)
    expect(passed.json.evidenceRecord.verification).toEqual({ status: 'passed', verifier: 'verify/1', contractSha256: passed.json.verification.contractSha256, reason: null, failed: [] })

    // The fetch succeeded and the task was not done: the status says the first, the verification the second.
    const failed = await call(engine, 'POST', '/v1/scrape', { url: `${origin}/article`, verify: failing, formats: ['links'], debug: false })
    expect(failed.json).toMatchObject({ status: 'success', verification: { status: 'failed', reason: 'checks_failed', checks: [{ passed: true }, { type: 'minTables', passed: false, observedCount: 0, asked: 1, observed: '0 tables, at least 1 asked' }] } })
    // Judged on the whole page although the response leaves its Markdown out.
    expect(failed.json.markdown ?? null).toBeNull()
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
