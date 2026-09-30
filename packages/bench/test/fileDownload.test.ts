import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identityBundleFrom, localNetworkPolicy, modeIdentity } from '@w2l/contracts'
import { filenameOf, responseShape, sniffShape } from '../src/files.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { LadderRunner } from '../src/routing/ladder.js'

/**
 * Files fetched as received: PDF text by page, CSV and JSON inline, other
 * downloads kept with their hash, binaries W2L does not keep named as such,
 * and the browser lane refusing to stand in for a download.
 */

/** A small PDF with the given lines per page (Helvetica, one text block per page); an empty page list entry is a page with no text. */
function makePdf(pages: readonly (readonly string[])[]): Buffer {
  const objects: string[] = []
  const add = (body: string): number => { objects.push(body); return objects.length }
  const catalog = add('') // placeholder, filled after pages exist
  const pagesObj = add('')
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pageIds: number[] = []
  for (const lines of pages) {
    let previousCells = 1
    const ops = lines.map((line, index) => {
      const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      // A tab in a line moves the pen right, so two cells land on one row with
      // a gap between them; the next line first undoes the previous line's moves.
      const cells = escaped.split('\t')
      const cellOps = cells.map((cell, cellIndex) => `${cellIndex === 0 ? '' : '120 0 Td '}(${cell}) Tj`).join(' ')
      const op = `${index === 0 ? '72 720 Td' : `${-120 * (previousCells - 1)} -16 Td`} ${cellOps}`
      previousCells = cells.length
      return op
    }).join(' ')
    const content = lines.length === 0 ? '' : `BT /F1 12 Tf ${ops} ET`
    const stream = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`))
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out))
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const REPORT_PDF = makePdf([
  ['Harbour ledger 2024', 'Station\t1.10', 'Ravine gauge\t0.98'],
  ['Second page of the ledger'],
])
const SCANNED_PDF = makePdf([[]])
const CSV = '﻿station,index\nRavine gauge,1.10\nHarbour,0.98\n'
const JSON_BODY = JSON.stringify({ station: 'Ravine gauge', index: 1.1 })
const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(300, 0x01)])
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)])
const LARGE_CSV = Buffer.from('a,b\n'.repeat(40_000)) // 160 KiB

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

let server: Server
let base: string
let filesDir: string
let previousFilesDir: string | undefined

beforeAll(async () => {
  filesDir = await mkdtemp(join(tmpdir(), 'w2l-files-'))
  previousFilesDir = process.env.W2L_FILES_DIR
  process.env.W2L_FILES_DIR = filesDir
  server = createServer((req, res) => {
    const send = (status: number, headers: Record<string, string>, body: Buffer | string) => { res.writeHead(status, headers); res.end(body) }
    switch (req.url) {
      case '/robots.txt': return send(200, { 'content-type': 'text/plain' }, 'User-agent: *\nDisallow:\n')
      case '/report.pdf': return send(200, { 'content-type': 'application/pdf', 'content-length': String(REPORT_PDF.byteLength) }, REPORT_PDF)
      case '/scan.pdf': return send(200, { 'content-type': 'application/pdf' }, SCANNED_PDF)
      case '/data.csv': return send(200, { 'content-type': 'text/csv; charset=utf-8' }, CSV)
      case '/rates': return send(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="rates 2024.xlsx"' }, ZIP_BYTES)
      case '/archive.zip': return send(200, { 'content-type': 'application/zip' }, ZIP_BYTES)
      case '/report.json': return send(200, { 'content-type': 'application/json' }, JSON_BODY)
      case '/logo.png': return send(200, { 'content-type': 'image/png' }, PNG_BYTES)
      case '/page-as-download': return send(200, { 'content-type': 'application/octet-stream' }, '<!doctype html><html><head><title>Ledger</title></head><body><main><article><h1>Ledger</h1><p>The harbour office keeps a ledger of every reading, with the observer and the hour, so a later reader can trace a figure to its source.</p><p>The ledger was digitised page by page and the scans are kept beside the transcription for anyone who asks.</p></article></main></body></html>')
      case '/declared-huge.zip':
        res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(200 * 1024 * 1024) })
        res.write(ZIP_BYTES)
        return res.end()
      case '/large.csv': return send(200, { 'content-type': 'text/csv' }, LARGE_CSV)
      case '/missing.pdf': return send(404, { 'content-type': 'text/html' }, '<html><body><p>No such report.</p></body></html>')
      default: return send(404, { 'content-type': 'text/plain' }, 'nothing here')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  if (previousFilesDir === undefined) delete process.env.W2L_FILES_DIR
  else process.env.W2L_FILES_DIR = previousFilesDir
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(filesDir, { recursive: true, force: true })
})

describe('response shape', () => {
  it('decides from the content type, then the name, then the bytes', () => {
    expect(responseShape('application/pdf', 'https://x.test/a')).toEqual({ kind: 'file', file: 'pdf' })
    expect(responseShape('text/csv; charset=utf-8', 'https://x.test/a')).toEqual({ kind: 'file', file: 'csv' })
    expect(responseShape('application/vnd.ms-excel', 'https://x.test/table.csv')).toEqual({ kind: 'file', file: 'csv' })
    expect(responseShape('application/vnd.ms-excel', 'https://x.test/table')).toEqual({ kind: 'file', file: 'xls' })
    expect(responseShape('text/html; charset=utf-8', 'https://x.test/a.pdf')).toEqual({ kind: 'page' })
    expect(responseShape('image/png', 'https://x.test/a')).toEqual({ kind: 'unsupported' })
    expect(responseShape('application/octet-stream', 'https://x.test/a.pdf')).toEqual({ kind: 'sniff', hint: 'pdf' })
    expect(responseShape('application/octet-stream', 'https://x.test/a', 'attachment; filename="rates.xlsx"')).toEqual({ kind: 'sniff', hint: 'xlsx' })
    expect(responseShape(null, 'https://x.test/a')).toEqual({ kind: 'sniff', hint: null })
    expect(sniffShape(REPORT_PDF, null)).toEqual({ kind: 'file', file: 'pdf' })
    expect(sniffShape(ZIP_BYTES, 'xlsx')).toEqual({ kind: 'file', file: 'xlsx' })
    expect(sniffShape(ZIP_BYTES, null)).toEqual({ kind: 'file', file: 'zip' })
    expect(sniffShape(PNG_BYTES, null)).toEqual({ kind: 'unsupported' })
    expect(sniffShape(Buffer.from('<html></html>'), null)).toEqual({ kind: 'page' })
    expect(sniffShape(Buffer.from('a,b\n1,2\n'), 'csv')).toEqual({ kind: 'file', file: 'csv' })
  })

  it('names the file from Content-Disposition, else from the URL', () => {
    expect(filenameOf('attachment; filename="rates 2024.xlsx"', 'https://x.test/download?id=1')).toBe('rates 2024.xlsx')
    expect(filenameOf("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf", 'https://x.test/d')).toBe('résumé.pdf')
    expect(filenameOf('attachment; filename=../../etc/passwd', 'https://x.test/d')).toBe('passwd')
    expect(filenameOf(null, 'https://x.test/reports/annual-2024.pdf?dl=1')).toBe('annual-2024.pdf')
    expect(filenameOf(null, 'https://x.test/reports/')).toBeNull()
  })
})

describe('http lane files', () => {
  const subject = new ResilientHttpSubject()
  afterAll(async () => { await subject.teardown() })

  it('keeps a PDF as received and returns its text layer page by page', async () => {
    const out = await subject.fetch(`${base}/report.pdf`)
    expect(out.status).toBe('success')
    expect(out.file).toMatchObject({ kind: 'pdf', contentType: 'application/pdf', bytes: REPORT_PDF.byteLength, sha256: sha256(REPORT_PDF), filename: 'report.pdf', pdf: { pages: 2, textPages: 2 } })
    expect(out.file?.path).toBe(join(filesDir, sha256(REPORT_PDF).slice(0, 2), `${sha256(REPORT_PDF)}.pdf`))
    expect(Buffer.compare(await readFile(out.file!.path!), REPORT_PDF)).toBe(0)
    expect(out.evidence.rawBodySha256).toBe(sha256(REPORT_PDF))
    expect(out.evidence.artifacts).toEqual([out.file!.path])
    expect(out.markdown).toContain('<!-- page 1 -->')
    expect(out.markdown).toContain('Harbour ledger 2024')
    expect(out.markdown).toContain('Station 1.10')
    expect(out.markdown).toContain('Ravine gauge 0.98')
    expect(out.markdown).toContain('<!-- page 2 -->\nSecond page of the ledger')
    expect(out.markdown!.indexOf('<!-- page 1 -->')).toBeLessThan(out.markdown!.indexOf('<!-- page 2 -->'))
    expect(out.escalations).toEqual([])
    expect(out.trace.map((event) => event.event)).toContain('file_received')
  })

  it('reports a PDF without a text layer as ocr_required, with the file kept', async () => {
    const out = await subject.fetch(`${base}/scan.pdf`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('ocr_required')
    expect(out.markdown).toBeNull()
    expect(out.file).toMatchObject({ kind: 'pdf', sha256: sha256(SCANNED_PDF), pdf: { pages: 1, textPages: 0, textChars: 0 } })
    expect(out.trace.map((event) => event.event)).toContain('pdf_no_text_layer')
  })

  it('returns a CSV and a JSON file as themselves, byte order mark removed', async () => {
    const csv = await subject.fetch(`${base}/data.csv`)
    expect(csv.status).toBe('success')
    expect(csv.file).toMatchObject({ kind: 'csv', filename: 'data.csv', bytes: Buffer.byteLength(CSV) })
    expect(csv.markdown).toBe('```csv\nstation,index\nRavine gauge,1.10\nHarbour,0.98\n```')
    expect(csv.truncated).toBe(false)
    const json = await subject.fetch(`${base}/report.json`)
    expect(json.file?.kind).toBe('json')
    expect(json.markdown).toBe('```json\n' + JSON_BODY + '\n```')
  })

  it('keeps a spreadsheet and an archive without pretending to read them', async () => {
    const rates = await subject.fetch(`${base}/rates`)
    expect(rates.status).toBe('success')
    expect(rates.file).toMatchObject({ kind: 'xlsx', filename: 'rates 2024.xlsx', sha256: sha256(ZIP_BYTES), contentType: 'application/octet-stream' })
    expect(rates.file?.path).toMatch(/\.xlsx$/)
    expect(rates.markdown).toBeNull()
    expect(rates.trace.find((event) => event.event === 'content_sniffed')?.detail).toEqual({ contentType: 'application/octet-stream', shape: 'xlsx' })
    const archive = await subject.fetch(`${base}/archive.zip`)
    expect(archive.file).toMatchObject({ kind: 'zip', filename: 'archive.zip' })
  })

  it('reads a download that is really a page as the page it is', async () => {
    const out = await subject.fetch(`${base}/page-as-download`)
    expect(out.status).toBe('success')
    expect(out.file).toBeUndefined()
    expect(out.markdown).toContain('keeps a ledger of every reading')
  })

  it('names a binary it does not keep, without reading it', async () => {
    const out = await subject.fetch(`${base}/logo.png`)
    expect(out.status).toBe('failed')
    expect(out.failureReason).toBe('unsupported_content_type')
    expect(out.evidence).toMatchObject({ httpStatus: 200, contentType: 'image/png', rawBodySha256: null })
    expect(out.usage.bytesWire).toBeNull()
    expect(out.file).toBeUndefined()
  })

  it('refuses a file over the cap, from the declared length or from the bytes', async () => {
    const declared = await subject.fetch(`${base}/declared-huge.zip`)
    expect(declared).toMatchObject({ status: 'failed', failureReason: 'body_too_large' })
    expect(declared.trace.find((event) => event.event === 'file_too_large')?.detail).toMatchObject({ declaredLength: 200 * 1024 * 1024 })
    const small = new ResilientHttpSubject('standard', { ...localNetworkPolicy(), maxFileBytes: 64 * 1024 })
    try {
      const streamed = await small.fetch(`${base}/large.csv`)
      expect(streamed).toMatchObject({ status: 'failed', failureReason: 'body_too_large' })
    } finally {
      await small.teardown()
    }
    const fits = await subject.fetch(`${base}/large.csv`)
    expect(fits.status).toBe('success')
    expect(fits.file?.bytes).toBe(LARGE_CSV.byteLength)
  })

  it('treats an error answer for a file URL as the error page it is', async () => {
    const out = await subject.fetch(`${base}/missing.pdf`)
    expect(out).toMatchObject({ status: 'failed', failureReason: 'http_error' })
    expect(out.evidence.httpStatus).toBe(404)
    expect(out.file).toBeUndefined()
  })
})

describe('files and the ladder', () => {
  it('a PDF served on the http lane never escalates to the browser', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const runner = new LadderRunner(
        [
          { id: 'http', identity: identityBundleFrom(modeIdentity('standard')), fetch: (url) => new ResilientHttpSubject().fetch(url) },
          { id: 'browser_local', identity: identityBundleFrom(modeIdentity('standard')), fetch: (url) => browser.fetch(url) },
        ],
        { mode: 'standard' },
      )
      const run = await runner.run(`${base}/report.pdf`)
      expect(run.channelsTried).toEqual(['http'])
      expect(run.result.status).toBe('success')
      expect(run.result.file?.kind).toBe('pdf')
    } finally {
      await browser.teardown()
    }
  })

  it('the browser lane does not stand in for a download', async () => {
    const browser = new BrowserLocalSubject('standard')
    try {
      const out = await browser.fetch(`${base}/data.csv`)
      expect(out.status).toBe('failed')
      expect(out.failureReason).toBe('unsupported_content_type')
      expect(out.file).toBeUndefined()
    } finally {
      await browser.teardown()
    }
  }, 60_000)
})
