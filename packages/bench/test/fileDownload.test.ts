import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy, type FetchResult, type NetworkPolicy } from '@w2l/contracts'
import { textPdf } from '@w2l/fixtures'
import { FileStore } from '../src/fileStore.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/**
 * Files over each lane: the bytes saved as received with their SHA-256 and
 * size, PDF text with page markers, never an escalation to the browser, a
 * size cap that fails honestly, and nothing saved for a refused request.
 */
const REPORT = textPdf([['Annual data summary', 'Capacity reached 120 MW.'], ['Portfolio PUE: 1.32', 'Water use fell by 8%.']], { Title: 'Data summary' })
const SCAN = textPdf([null, null])
const CSV = 'year,pue\n2023,1.35\n2024,1.32\n'
const ZIP = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(60, 7)])
const BIG = textPdf([Array.from({ length: 40 }, (_, i) => `Line ${i} of a report that is longer than the cap.`)])
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

const FILES: Record<string, { type?: string; body: Uint8Array | string; chunked?: boolean }> = {
  '/report.pdf': { type: 'application/pdf', body: REPORT },
  '/scan.pdf': { type: 'application/pdf', body: SCAN },
  '/download?id=7': { type: 'application/octet-stream', body: REPORT },
  '/data.csv': { type: 'text/csv; charset=utf-8', body: CSV },
  '/data.json': { type: 'application/json', body: '{"year":2024,"pue":1.32}' },
  '/archive.zip': { type: 'application/zip', body: ZIP },
  '/big.pdf': { type: 'application/pdf', body: BIG },
  '/stream.csv': { type: 'text/csv', body: CSV.repeat(200), chunked: true },
  '/private/report.pdf': { type: 'application/pdf', body: REPORT },
  '/photo.png': { type: 'image/png', body: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') },
  '/page.txt': { type: 'text/plain', body: '<!doctype html><html><body><article><h1>Mislabelled page</h1><p>This HTML document is sent as text/plain, and it is still read as the web page it is, with its main content extracted like any other page.</p></article></body></html>' },
}

let server: Server
let origin: string
let root: string
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 1, maxFileBytes: 64 * 1024 }

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private\n'); return }
    // The connection breaks off after the headers and part of the body.
    if (req.url === '/broken.pdf') { res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': String(REPORT.length) }); res.write(Buffer.from(REPORT).subarray(0, 100), () => res.socket?.destroy()); return }
    const file = FILES[req.url ?? '']
    if (file === undefined) { res.writeHead(404).end(); return }
    const body = typeof file.body === 'string' ? Buffer.from(file.body) : Buffer.from(file.body)
    res.writeHead(200, { ...(file.type ? { 'content-type': file.type } : {}), ...(file.chunked ? {} : { 'content-length': String(body.length) }) })
    if (file.chunked) { res.write(body.subarray(0, 1000)); res.end(body.subarray(1000)) } else res.end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'w2l-files-'))
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

const saved = async (dir: string) => (await readdir(dir).catch(() => [] as string[])).sort()

function expectSavedFile(out: FetchResult, bytes: Uint8Array | string, kind: string) {
  const hash = sha(bytes)
  expect(out.file).toMatchObject({ kind, sha256: hash, bytes: Buffer.byteLength(typeof bytes === 'string' ? bytes : Buffer.from(bytes)) })
  expect(out.file!.path).toMatch(new RegExp(`${hash}\\.${kind === 'text' ? 'txt' : kind}$`))
  expect(out.evidence.rawBodySha256).toBe(hash)
  expect(out.evidence.artifacts).toContain(out.file!.path)
  expect(out.escalations).toEqual([])
  expect(out.trace.some(event => event.event === 'quality_low_yield')).toBe(false)
}

describe('files on the HTTP lane', () => {
  const dir = () => join(root, 'http')
  let http: ResilientHttpSubject
  beforeAll(() => { http = new ResilientHttpSubject('standard', policy, undefined, undefined, false, new FileStore(dir())) })
  afterAll(async () => { await http.teardown() })

  it('saves a PDF as received and returns its text with a marker before each page', async () => {
    const out = await http.fetch(`${origin}/report.pdf`)
    expect(out).toMatchObject({ status: 'success', lane: 'http', failureReason: null })
    expectSavedFile(out, REPORT, 'pdf')
    expect(await readFile(out.file!.path!)).toEqual(Buffer.from(REPORT))
    expect(out.file).toMatchObject({ detectedBy: 'content_type', contentType: 'application/pdf', declaredBytes: REPORT.length, maxBytes: 64 * 1024, markdownFrom: 'pdf_text' })
    expect(out.markdown).toBe('<!-- page 1 -->\n\nAnnual data summary\nCapacity reached 120 MW.\n\n<!-- page 2 -->\n\nPortfolio PUE: 1.32\nWater use fell by 8%.\n')
    const pdf = out.file!.pdf!
    expect(pdf).toMatchObject({ pageCount: 2, pagesRead: 2, error: null, info: { title: 'Data summary' } })
    expect(pdf.pages.map(page => out.markdown!.slice(page.start, page.end))).toEqual(['Annual data summary\nCapacity reached 120 MW.', 'Portfolio PUE: 1.32\nWater use fell by 8%.'])
    expect(pdf.warnings.map(warning => warning.code)).toEqual(['tables_unverified'])
    expect(out.usage.contentTokens).toBeGreaterThan(0)
    expect(out.document).toBeUndefined()
  })

  it('fails a PDF without a text layer as empty_unverified, still saved, never escalated', async () => {
    const out = await http.fetch(`${origin}/scan.pdf`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', markdown: null })
    expectSavedFile(out, SCAN, 'pdf')
    expect(out.file!.pdf!.warnings.map(warning => warning.code)).toEqual(['no_text_layer', 'no_text_layer'])
  })

  it('recognises a PDF sent as application/octet-stream by its bytes', async () => {
    const out = await http.fetch(`${origin}/download?id=7`)
    expect(out.status).toBe('success')
    expect(out.file).toMatchObject({ kind: 'pdf', detectedBy: 'content', contentType: 'application/octet-stream' })
    expect(out.markdown).toContain('Portfolio PUE: 1.32')
  })

  it('returns a CSV or JSON file\'s text as received, and a ZIP without text', async () => {
    const csv = await http.fetch(`${origin}/data.csv`)
    expect(csv).toMatchObject({ status: 'success', markdown: CSV })
    expectSavedFile(csv, CSV, 'csv')
    expect(csv.file).toMatchObject({ markdownFrom: 'text', encoding: 'utf-8', pdf: null })
    const json = await http.fetch(`${origin}/data.json`)
    expect(json).toMatchObject({ status: 'success', markdown: '{"year":2024,"pue":1.32}' })
    const zip = await http.fetch(`${origin}/archive.zip`)
    expect(zip).toMatchObject({ status: 'success', markdown: null })
    expectSavedFile(zip, ZIP, 'zip')
    expect(zip.file).toMatchObject({ markdownFrom: null, encoding: null })
  })

  it('stores the same bytes once', async () => {
    const first = await http.fetch(`${origin}/report.pdf`)
    const second = await http.fetch(`${origin}/download?id=7`)
    expect(second.file!.path).toBe(first.file!.path)
    expect((await saved(dir())).filter(name => name.startsWith(sha(REPORT)))).toEqual([`${sha(REPORT)}.pdf`])
  })

  it('fails a file over the cap with body_too_large and its declared size, and saves nothing', async () => {
    const before = await saved(dir())
    const declared = await http.fetch(`${origin}/big.pdf`, undefined, undefined, {}, undefined, { maxFileBytes: 1000 })
    expect(declared).toMatchObject({ status: 'failed', failureReason: 'body_too_large', markdown: null })
    expect(declared.evidence).toMatchObject({ httpStatus: 200, contentType: 'application/pdf', rawBodySha256: null, artifacts: [] })
    expect(declared.file).toMatchObject({ kind: 'pdf', declaredBytes: BIG.length, maxBytes: 1000, bytes: null, sha256: null, path: null })
    const streamed = await http.fetch(`${origin}/stream.csv`, undefined, undefined, {}, undefined, { maxFileBytes: 2000 })
    expect(streamed).toMatchObject({ status: 'failed', failureReason: 'body_too_large' })
    expect(streamed.file).toMatchObject({ kind: 'csv', declaredBytes: null, maxBytes: 2000, bytes: null, path: null })
    // The operator's cap stays the ceiling: a request cannot raise it.
    const operator = await http.fetch(`${origin}/stream.csv`, undefined, undefined, {}, undefined, { maxFileBytes: 10_000_000 })
    expect(operator.file).toMatchObject({ maxBytes: 64 * 1024, bytes: CSV.length * 200 })
    expect((await saved(dir())).filter(name => !before.includes(name))).toEqual([`${sha(CSV.repeat(200))}.csv`])
  })

  it('fails a body that breaks off as a connection error, keeping the status, saving nothing', async () => {
    const before = await saved(dir())
    const out = await http.fetch(`${origin}/broken.pdf`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'connection_error', markdown: null })
    expect(out.evidence).toMatchObject({ httpStatus: 200, contentType: 'application/pdf', rawBodySha256: null, artifacts: [] })
    expect(out.trace.some(event => event.event === 'body_read_failed')).toBe(true)
    expect(await saved(dir())).toEqual(before)
  })

  it('saves nothing when robots.txt refuses the file', async () => {
    const before = await saved(dir())
    const out = await http.fetch(`${origin}/private/report.pdf`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
    expect(out.file).toBeUndefined()
    expect(await saved(dir())).toEqual(before)
  })

  it('does not read an image as a page: unsupported_content_type, not saved, not escalated', async () => {
    const out = await http.fetch(`${origin}/photo.png`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'unsupported_content_type', escalations: [], markdown: null })
    expect(out.evidence).toMatchObject({ httpStatus: 200, contentType: 'image/png', rawBodySha256: null, artifacts: [] })
    expect(out.file).toBeUndefined()
  })

  it('still reads an HTML document sent as text/plain as a page', async () => {
    const out = await http.fetch(`${origin}/page.txt`)
    expect(out.status).toBe('success')
    expect(out.file).toBeUndefined()
    expect(out.markdown).toContain('# Mislabelled page')
  })
})

describe('files on the browser lane', () => {
  const dir = () => join(root, 'browser')
  let browser: BrowserLocalSubject
  beforeAll(() => { browser = new BrowserLocalSubject('standard', null, false, policy, null, undefined, null, undefined, undefined, new FileStore(dir())) })
  afterAll(async () => { await browser.teardown() })

  it('catches the download a PDF starts instead of failing the navigation', async () => {
    const out = await browser.fetch(`${origin}/report.pdf`)
    expect(out).toMatchObject({ status: 'success', lane: 'browser_local' })
    expectSavedFile(out, REPORT, 'pdf')
    expect(await readFile(out.file!.path!)).toEqual(Buffer.from(REPORT))
    expect(out.evidence).toMatchObject({ finalUrl: `${origin}/report.pdf`, httpStatus: 200, contentType: 'application/pdf' })
    expect(out.markdown).toContain('<!-- page 2 -->\n\nPortfolio PUE: 1.32')
    expect(out.compliance?.robots.decision).toBe('allowed')
    expect(out.trace.some(event => event.event === 'identity_mismatch' || event.event === 'navigate_failed')).toBe(false)
  })

  it('reads a JSON file the browser displays from its response bytes', async () => {
    const out = await browser.fetch(`${origin}/data.json`)
    expect(out).toMatchObject({ status: 'success', markdown: '{"year":2024,"pue":1.32}' })
    expect(out.file).toMatchObject({ kind: 'json', contentType: 'application/json' })
  })

  it('fails a download over the cap and saves nothing', async () => {
    const out = await browser.fetch(`${origin}/big.pdf`, undefined, undefined, undefined, { maxFileBytes: 1000 })
    expect(out).toMatchObject({ status: 'failed', failureReason: 'body_too_large' })
    expect(out.file).toMatchObject({ declaredBytes: BIG.length, maxBytes: 1000, path: null })
    expect((await saved(dir())).some(name => name.startsWith(sha(BIG)))).toBe(false)
  })
})
