import { createHash } from 'node:crypto'
import { estimateTokens, type FetchResult, type FileDescription, type FilePdfText, type Lane, type PdfPageMarkdown, type PdfParser, type TraceEvent } from '@w2l/contracts'
import { decodeFileText, FILE_EXTENSIONS, PDF_TEXT_DEFAULTS, pdfToMarkdown, TEXT_FILE_KINDS, type FileDecision } from '@w2l/extract-tf'
import type { FileStore } from '../fileStore.js'

/**
 * What every lane does with a file response (see extract-tf `detectFile`):
 * save the bytes as received, hash them, and give the file's text where it
 * has one. A file is never offered to another lane: whatever the outcome,
 * the result carries no escalation.
 *
 * Status by kind:
 * - PDF: `success` with text; `partial` when the page cap, the time budget
 *   or an unreadable page stopped the text short; `failed`/`empty_unverified`
 *   when no page has a text layer (a scan: no OCR is run); `failed`/
 *   `parse_error` when it cannot be opened (not a PDF, encrypted, malformed);
 *   `failed`/`timeout` when it did not open within the time budget.
 * - CSV, JSON, text: `success` with the text as received; without text when
 *   it does not decode (a `text_not_decoded` warning).
 * - XLSX, XLS, ZIP: `success` without text.
 * - Any kind with no bytes at all: `empty_verified`.
 */

/** Time kept before the scrape's deadline when PDF text runs into it. */
const PDF_DEADLINE_RESERVE_MS = 1_000

export interface FileResponse {
  decision: FileDecision
  contentType: string | null
  declaredBytes: number | null
  maxBytes: number
}

export interface FileContext {
  lane: Lane
  store: FileStore | null
  deadlineAt?: number
  trace: TraceEvent[]
  /** Milliseconds since the fetch started, for trace events. */
  at: () => number
  /** The request's `parsers` (FetchOptions.parsers): absent reads a PDF with the defaults, `[]` reads none, a `pdf` entry sets the options. */
  parsers?: readonly PdfParser[]
}

export interface FileContent extends Pick<FetchResult, 'status' | 'failureReason' | 'markdown'> {
  file: FileDescription
  rawBodySha256: string
  artifacts: readonly string[]
  contentTokens: number
  /** The scrape's deadline, not the PDF budget, stopped the text. */
  deadlineExceeded: boolean
  /** Monotonic milliseconds spent turning the bytes into text. */
  textMs: number
  /** A PDF's pages, when the `pdf` parser asked for them (`pages: true`) and its text was read. */
  pages?: readonly PdfPageMarkdown[]
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** A Content-Length header as a number of bytes; null when absent or malformed. */
export function declaredLength(value: string | null | undefined): number | null {
  const text = value?.trim() ?? ''
  return /^\d{1,15}$/.test(text) ? Number(text) : null
}

function described(response: FileResponse): FileDescription {
  return {
    kind: response.decision.kind,
    detectedBy: response.decision.detectedBy,
    contentType: response.contentType,
    declaredBytes: response.declaredBytes,
    maxBytes: response.maxBytes,
    bytes: null,
    sha256: null,
    path: null,
    markdownFrom: null,
    encoding: null,
    warnings: [],
    pdf: null,
  }
}

/** A file over the size cap: not read beyond it, not saved, described with the size the server declared. */
export function fileTooLarge(response: FileResponse, context: Pick<FileContext, 'lane' | 'trace' | 'at'>): FileDescription {
  context.trace.push({ at: context.at(), lane: context.lane, event: 'file_too_large', detail: { kind: response.decision.kind, declaredBytes: response.declaredBytes, maxBytes: response.maxBytes } })
  return described(response)
}

export async function readFileResponse(response: FileResponse, bytes: Uint8Array, context: FileContext): Promise<FileContent> {
  const { lane, trace, at } = context
  const kind = response.decision.kind
  const hash = sha256(bytes)
  const path = context.store === null ? null : await context.store.save(bytes, hash, FILE_EXTENSIONS[kind])
  trace.push({ at: at(), lane, event: path === null ? 'file_not_saved' : 'file_saved', detail: { kind, detectedBy: response.decision.detectedBy, contentType: response.contentType, bytes: bytes.byteLength, sha256: hash, ...(path === null ? { reason: 'no file store is configured' } : { path }) } })
  const file: FileDescription = { ...described(response), bytes: bytes.byteLength, sha256: hash, path }
  const content = (status: FileContent['status'], failureReason: FileContent['failureReason'], markdown: string | null, over: Partial<FileDescription> = {}, extra: { deadlineExceeded?: boolean; textMs?: number; pages?: readonly PdfPageMarkdown[] } = {}): FileContent => ({
    status,
    failureReason,
    markdown,
    file: { ...file, ...over },
    rawBodySha256: hash,
    artifacts: path === null ? [] : [path],
    contentTokens: markdown === null ? 0 : estimateTokens(markdown),
    deadlineExceeded: extra.deadlineExceeded ?? false,
    textMs: extra.textMs ?? 0,
    ...(extra.pages === undefined ? {} : { pages: extra.pages }),
  })

  if (bytes.byteLength === 0) return content('empty_verified', null, null)

  if (kind === 'pdf') {
    const parser = context.parsers?.find((entry) => entry.type === 'pdf')
    // `parsers: []` asks for no PDF text: the file is kept as received, like a spreadsheet.
    if (context.parsers !== undefined && parser === undefined) {
      trace.push({ at: at(), lane, event: 'pdf_not_parsed', detail: { reason: 'parsers' } })
      return content('success', null, null, { warnings: [{ code: 'pdf_not_parsed', message: 'The request\'s parsers name no pdf entry, so no text was read; the bytes are saved as received.' }] })
    }
    const left = context.deadlineAt === undefined ? Infinity : context.deadlineAt - PDF_DEADLINE_RESERVE_MS - Date.now()
    const deadlineBound = left < PDF_TEXT_DEFAULTS.timeBudgetMs
    const started = performance.now()
    const text = await pdfToMarkdown(bytes, {
      timeBudgetMs: Math.max(0, Math.min(PDF_TEXT_DEFAULTS.timeBudgetMs, left)),
      ...(parser?.maxPages === undefined ? {} : { maxPages: parser.maxPages }),
      ...(parser?.pageMarkers === undefined ? {} : { pageMarkers: parser.pageMarkers }),
    })
    const textMs = performance.now() - started
    if (!text.ok) {
      trace.push({ at: at(), lane, event: 'pdf_text', detail: { ms: Math.round(textMs), error: text.error.code } })
      const pdf: FilePdfText = { pageCount: null, pagesRead: 0, pages: [], info: null, warnings: [], error: text.error }
      const timedOut = text.error.code === 'time_budget'
      return content('failed', timedOut ? 'timeout' : 'parse_error', null, { pdf }, { deadlineExceeded: timedOut && deadlineBound, textMs })
    }
    const { pageCount, ...info } = text.info
    const pdf: FilePdfText = {
      pageCount,
      pagesRead: text.pages.length,
      pages: text.pages.map(({ number, label, start, end }) => ({ number, label, start, end })),
      info,
      warnings: text.warnings,
      error: null,
    }
    const codes = new Set(text.warnings.map(warning => warning.code))
    trace.push({ at: at(), lane, event: 'pdf_text', detail: { ms: Math.round(textMs), pageCount, pagesRead: pdf.pagesRead, warnings: [...codes] } })
    const outOfTime = codes.has('time_budget')
    if (!text.pages.some(page => page.text !== '')) {
      return content('failed', outOfTime && text.pages.length === 0 ? 'timeout' : 'empty_unverified', null, { pdf }, { deadlineExceeded: outOfTime && deadlineBound, textMs })
    }
    // A cut the request asked for (its own maxPages) is the answer asked for; the default cap's cut is not.
    const stopped = outOfTime || (codes.has('page_cap') && parser?.maxPages === undefined) || codes.has('page_error')
    const pages = parser?.pages === true ? text.pages.map((page) => ({ pageNumber: page.number, markdown: page.text })) : undefined
    return content(stopped ? 'partial' : 'success', null, text.markdown, { pdf, markdownFrom: 'pdf_text' }, { deadlineExceeded: outOfTime && deadlineBound, textMs, ...(pages === undefined ? {} : { pages }) })
  }

  if (TEXT_FILE_KINDS.has(kind)) {
    const decoded = decodeFileText(bytes, response.contentType)
    if (decoded === null) {
      return content('success', null, null, { warnings: [{ code: 'text_not_decoded', message: `The file is not valid text in the encoding it declares or in UTF-8, so no text is returned; the bytes are saved as received.` }] })
    }
    if (decoded.text === '') return content('empty_verified', null, null, { encoding: decoded.encoding })
    return content('success', null, decoded.text, { markdownFrom: 'text', encoding: decoded.encoding })
  }

  return content('success', null, null)
}
