import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import { localNetworkPolicy, type CrawlPage, type EvidenceRecord, type FetchResult, type NetworkPolicy } from '@w2l/contracts'
import { FILE_TEXT_VERSION, PDF_TEXT_VERSION } from '@w2l/extract-tf'
import { textPdf } from '@w2l/fixtures'
import { sha256Utf8 } from '@w2l/http-core'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import { extractStructured } from '../src/structured.js'

/**
 * File download through the API: scrape (full and compact), JSON from a
 * PDF, batch, crawl, /fc and the browser download path, each result's
 * Evidence Record validated against the published schema.
 */
const schema = JSON.parse(readFileSync(new URL('../../contracts/schemas/evidence-record.v1.json', import.meta.url), 'utf8')) as object
const AjvClass = Ajv2020 as unknown as new (options: object) => { compile(schema: object): ((data: unknown) => boolean) & { errors?: unknown } }
const validate = new AjvClass({ allErrors: true, allowUnionTypes: true }).compile(schema)
function valid(record: EvidenceRecord | null | undefined): EvidenceRecord {
  expect(validate(record), JSON.stringify(validate.errors)).toBe(true)
  return record!
}

const REPORT = textPdf([['Annual data summary', 'Capacity reached 120 MW.'], ['Portfolio PUE: 1.32', 'Reporting year: 2024']])
const SCAN = textPdf([null])
const CSV = 'year,pue\n2023,1.35\n2024,1.32\n'
const HUB = '<!doctype html><html><head><title>Reports</title></head><body><main><article><h1>Reports</h1><p>The operator publishes its annual data summary as a PDF and the underlying figures as a CSV file, both linked below for anyone who needs them.</p><p><a href="/report.pdf">Data summary (PDF)</a> <a href="/data.csv">Figures (CSV)</a></p></article></main></body></html>'
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

const RESPONSES: Record<string, { type: string; body: Uint8Array | string }> = {
  '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /private\n' },
  '/hub': { type: 'text/html; charset=utf-8', body: HUB },
  '/report.pdf': { type: 'application/pdf', body: REPORT },
  '/scan.pdf': { type: 'application/pdf', body: SCAN },
  '/data.csv': { type: 'text/csv', body: CSV },
  '/private/report.pdf': { type: 'application/pdf', body: REPORT },
}

let server: Server
let origin: string
let root: string
let engine: ApiEngine
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 1, maxFileBytes: 64 * 1024 }

beforeAll(async () => {
  server = createServer((req, res) => {
    const found = RESPONSES[req.url ?? '']
    if (found === undefined) { res.writeHead(404).end(); return }
    const body = Buffer.from(found.body)
    res.writeHead(200, { 'content-type': found.type, 'content-length': String(body.length) }).end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'w2l-api-files-'))
  engine = createApiEngine({ taskRoot: root, networkPolicy: policy })
})

afterAll(async () => {
  await engine.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

type Body = FetchResult & { evidenceRecord: EvidenceRecord; channelsTried: string[]; formats?: string[] }
async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await createApp(engine).request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: await res.json() as Record<string, unknown> }
}
async function scrape(body: Record<string, unknown>): Promise<Body> {
  const res = await post('/v1/scrape', body)
  expect(res.status).toBe(200)
  return res.json as unknown as Body
}
async function finished<T extends { status: string }>(read: () => Promise<T | null>): Promise<T> {
  for (let i = 0; i < 400; i++) {
    const report = await read()
    if (report !== null && !['pending', 'running'].includes(report.status)) return report
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('task did not finish')
}

const fileArtifact = (bytes: Uint8Array | string, contentType: string, ext: string) => ({
  kind: 'file', path: join(root, 'files', `${sha(bytes)}.${ext}`), sha256: sha(bytes), bytes: Buffer.from(bytes).length, contentType,
})

describe('file download on scrape', () => {
  it('saves a PDF under the task root and names the PDF text extractor in the Evidence Record, without the browser', async () => {
    const full = await scrape({ url: `${origin}/report.pdf` })
    expect(full).toMatchObject({ status: 'success', lane: 'http', channelsTried: ['http'] })
    expect(full.markdown).toContain('<!-- page 2 -->\n\nPortfolio PUE: 1.32')
    expect(full.file).toMatchObject({ kind: 'pdf', path: join(root, 'files', `${sha(REPORT)}.pdf`), sha256: sha(REPORT), bytes: REPORT.length })
    expect(await readFile(join(root, 'files', `${sha(REPORT)}.pdf`))).toEqual(Buffer.from(REPORT))
    expect(valid(full.evidenceRecord)).toMatchObject({
      status: 'success', reason: null, httpStatus: 200, lane: 'http', rawSha256: sha(REPORT),
      outputSha256: { markdown: sha256Utf8(full.markdown!), json: null },
      extractor: { name: 'pdf-text', version: PDF_TEXT_VERSION },
      artifacts: [fileArtifact(REPORT, 'application/pdf', 'pdf')],
    })

    const compact = await scrape({ url: `${origin}/report.pdf`, formats: ['markdown'], debug: false })
    expect(compact.file).toEqual(full.file)
    expect(valid(compact.evidenceRecord).outputSha256.markdown).toBe(sha256Utf8(compact.markdown!))
  })

  it('fails a PDF without a text layer honestly, and describes a CSV with the file-text extractor', async () => {
    const scan = await scrape({ url: `${origin}/scan.pdf` })
    expect(scan).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: null, channelsTried: ['http'] })
    expect(valid(scan.evidenceRecord)).toMatchObject({ reason: 'empty_unverified', extractor: { name: 'pdf-text' }, artifacts: [fileArtifact(SCAN, 'application/pdf', 'pdf')] })
    const csv = await scrape({ url: `${origin}/data.csv` })
    expect(csv).toMatchObject({ status: 'success', markdown: CSV })
    expect(valid(csv.evidenceRecord)).toMatchObject({ extractor: { name: 'file-text', version: FILE_TEXT_VERSION }, artifacts: [fileArtifact(CSV, 'text/csv', 'csv')] })
  })

  it('has no html to give for a file: html and rawHtml are null, and the tag options leave its text as it is', async () => {
    const full = await scrape({ url: `${origin}/data.csv`, formats: ['markdown', 'html', 'rawHtml'], includeTags: ['table'], excludeTags: ['p'] })
    expect(full).toMatchObject({ status: 'success', markdown: CSV, html: null, rawHtml: null, file: { kind: 'csv' } })
    const compact = await scrape({ url: `${origin}/data.csv`, formats: ['html'], debug: false })
    expect(compact).toMatchObject({ status: 'success', html: null, formats: ['html'] })
    const shim = await post('/fc/v1/scrape', { url: `${origin}/data.csv`, formats: ['markdown', 'rawHtml'] })
    expect(shim.json).toMatchObject({ success: true, data: { markdown: CSV, rawHtml: null } })
  })

  it('takes a lower maxFileBytes per request and refuses one above the operator\'s cap', async () => {
    const small = await scrape({ url: `${origin}/report.pdf`, maxFileBytes: 100 })
    expect(small).toMatchObject({ status: 'failed', failureReason: 'body_too_large', markdown: null })
    expect(small.file).toMatchObject({ declaredBytes: REPORT.length, maxBytes: 100, path: null })
    expect(valid(small.evidenceRecord)).toMatchObject({ reason: 'body_too_large', rawSha256: null, artifacts: [] })
    const above = await post('/v1/scrape', { url: `${origin}/report.pdf`, maxFileBytes: 64 * 1024 + 1 })
    expect(above.status).toBe(400)
    expect(above.json).toMatchObject({ code: 'invalid_request' })
  })

  it('reads JSON fields from Label: value lines of the PDF with their page, and never asks a model', async () => {
    const format = { type: 'json' as const, schema: { type: 'object', properties: { portfolioPue: { type: 'number' }, reportingYear: { type: 'integer' }, owner: { type: 'string' } }, required: ['portfolioPue', 'owner'] } }
    const body = await scrape({ url: `${origin}/report.pdf`, formats: [format] })
    expect(body.json).toMatchObject({ status: 'incomplete', data: { portfolioPue: 1.32, reportingYear: 2024 }, issues: [{ code: 'missing_required', path: '/owner' }] })
    expect(valid(body.evidenceRecord).fieldEvidence).toEqual({
      '/portfolioPue': { source: 'pdf', locator: 'page 2 "Portfolio PUE"' },
      '/reportingYear': { source: 'pdf', locator: 'page 2 "Reporting year"' },
    })
    let modelCalls = 0
    const fallback = await extractStructured(body, { ...format, modelFallback: true }, {}, { baseUrl: 'http://model.invalid', model: 'm', fetch: (async () => { modelCalls++; throw new Error('no model') }) as typeof fetch })
    expect(modelCalls).toBe(0)
    expect(fallback.status).toBe('incomplete')
    expect(fallback.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['model_unavailable', 'missing_required']))
  })

  it('answers /fc with the PDF text as markdown', async () => {
    const res = await post('/fc/v1/scrape', { url: `${origin}/report.pdf` })
    expect(res.json).toMatchObject({ success: true, data: { metadata: { statusCode: 200, sourceURL: `${origin}/report.pdf` } } })
    expect((res.json.data as { markdown: string }).markdown).toContain('<!-- page 1 -->\n\nAnnual data summary')
    const scan = await post('/fc/v1/scrape', { url: `${origin}/scan.pdf` })
    expect(scan.json).toMatchObject({ success: false, error: 'failed: empty_unverified' })
  })

  it('catches the browser download when waitFor starts at the browser rung', async () => {
    const body = await scrape({ url: `${origin}/report.pdf`, waitFor: 100 })
    expect(body).toMatchObject({ status: 'success', lane: 'browser_local', channelsTried: ['browser_local'] })
    expect(body.file).toMatchObject({ kind: 'pdf', sha256: sha(REPORT) })
    expect(valid(body.evidenceRecord)).toMatchObject({ lane: 'browser_local', rawSha256: sha(REPORT), extractor: { name: 'pdf-text' }, artifacts: [fileArtifact(REPORT, 'application/pdf', 'pdf')] })
  })
})

describe('file download in batch and crawl', () => {
  it('gives batch items their file and Evidence Record, and saves nothing for a refused URL', async () => {
    const start = await post('/v1/batches', { urls: [`${origin}/report.pdf`, `${origin}/data.csv`, `${origin}/private/report.pdf`], formats: ['markdown'] })
    const taskId = start.json.taskId as string
    await finished(() => engine.getBatch(taskId))
    const items = (await engine.getBatchItems(taskId, { limit: 10 }))!.items as CrawlPage[]
    const byUrl = new Map(items.map(item => [item.url, item]))
    for (const item of items) valid(item.evidenceRecord)
    expect(byUrl.get(`${origin}/report.pdf`)).toMatchObject({ status: 'success', file: { kind: 'pdf', sha256: sha(REPORT) } })
    expect(byUrl.get(`${origin}/report.pdf`)!.markdown).toContain('<!-- page 1 -->')
    expect(byUrl.get(`${origin}/data.csv`)).toMatchObject({ status: 'success', markdown: CSV, file: { kind: 'csv' } })
    const refused = byUrl.get(`${origin}/private/report.pdf`)!
    expect(refused).toMatchObject({ failureReason: 'policy_denied' })
    expect(refused.file).toBeUndefined()
    expect(refused.evidenceRecord!.artifacts).toEqual([])
  })

  it('reads the PDF and CSV a crawled page links to', async () => {
    // The hub's files are its siblings, outside the /hub/ subtree a crawl keeps to by default.
    const start = await post('/v1/crawl', { url: `${origin}/hub`, maxPages: 5, crawlEntireDomain: true })
    const taskId = start.json.taskId as string
    await finished(() => engine.getCrawl(taskId))
    const pages = (await engine.getCrawlPages(taskId, { limit: 10 }))!.items
    const pdf = pages.find(page => page.url === `${origin}/report.pdf`)
    expect(pdf).toMatchObject({ status: 'success', file: { kind: 'pdf' } })
    expect(pdf!.markdown).toContain('Portfolio PUE: 1.32')
    expect(valid(pdf!.evidenceRecord)).toMatchObject({ extractor: { name: 'pdf-text' }, artifacts: [fileArtifact(REPORT, 'application/pdf', 'pdf')] })
    expect(pages.find(page => page.url === `${origin}/data.csv`)).toMatchObject({ status: 'success', markdown: CSV })
  })
})
