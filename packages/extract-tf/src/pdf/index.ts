/**
 * PDF text: the bytes of a PDF become Markdown with page numbers, so that every
 * passage can be traced to its page.
 *
 * The text is the PDF's own text layer, read with Mozilla pdf.js (pdfjs-dist,
 * Apache-2.0, legacy build for Node; no canvas or rendering is used). There is
 * no OCR: a page without a text layer yields no text and a `no_text_layer`
 * warning. Tables are not reconstructed; their cells become lines of text, and
 * every result with text carries a `tables_unverified` warning.
 *
 * pdf.js runs on the calling thread. The time budget is checked before each
 * page, so a page that has started is finished; the page cap bounds the work
 * on long files. Encrypted, malformed or non-PDF input gives an error result.
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { markdownOf, removeRepeatedLines, type PageLines, type PdfPage } from './assemble.js'
import { layoutPage, type TextRun } from './layout.js'

export { pdfPagesForSpan } from './assemble.js'
export type { PdfPage } from './assemble.js'

/**
 * Names the PDF text conversion, like EXTRACTOR_VERSION for HTML. Bump it with
 * any change that can alter the Markdown produced from the same PDF bytes,
 * including an upgrade of the pinned pdfjs-dist.
 */
export const PDF_TEXT_VERSION = 'pdf-text/1'

export const PDF_TEXT_DEFAULTS = {
  maxPages: 1000,
  timeBudgetMs: 60_000,
} as const

export interface PdfToMarkdownOptions {
  /** Pages read at most, from the first. Default 1000; pages past it are reported with `page_cap`. */
  maxPages?: number
  /**
   * Milliseconds for opening the document and reading its pages. Default
   * 60 000. Checked before each page: the pages read so far are returned with
   * a `time_budget` warning, or an error when the document did not open in time.
   */
  timeBudgetMs?: number
  /**
   * Running headers and footers (a line at the top or bottom edge repeated on
   * many pages, such as the report title or "Page 3"): kept by default. With
   * 'remove' they are taken out of the text, listed per page in
   * `pages[].removedLines` and reported with `repeated_lines_removed`.
   */
  repeatedLines?: 'keep' | 'remove'
  /** A `<!-- page N -->` line before each page's text: written by default; false leaves them out (the page offsets still locate each page). */
  pageMarkers?: boolean
}

export type PdfWarningCode =
  | 'tables_unverified'
  | 'no_text_layer'
  | 'page_error'
  | 'page_cap'
  | 'time_budget'
  | 'repeated_lines_removed'

export interface PdfWarning {
  code: PdfWarningCode
  message: string
  /** The page it concerns, for page-level warnings. */
  page?: number
}

/** What the PDF declares about itself; null where it declares nothing. */
export interface PdfInfo {
  /** Pages in the file, including those not read. */
  pageCount: number
  title: string | null
  author: string | null
  subject: string | null
  keywords: string | null
  creator: string | null
  producer: string | null
  /** PDF date strings as declared, e.g. `D:20240315120000+01'00'`. */
  creationDate: string | null
  modificationDate: string | null
  language: string | null
  pdfVersion: string | null
  /** The file uses PDF encryption (it opened without a password). */
  encrypted: boolean
}

export interface PdfText {
  ok: true
  /**
   * The document as Markdown: each page starts with a line `<!-- page N -->`
   * (N is the page's 1-based position in the file), then a blank line and the
   * page's text. A text line that would start like a marker is escaped as
   * `\<!--`, so marker lines are W2L's own.
   */
  markdown: string
  /** Every page read, in order, with the offsets of its text in `markdown`. */
  pages: PdfPage[]
  info: PdfInfo
  warnings: PdfWarning[]
}

export type PdfErrorCode = 'not_pdf' | 'encrypted' | 'malformed' | 'time_budget'

export interface PdfFailure {
  ok: false
  error: { code: PdfErrorCode; message: string }
}

export type PdfToMarkdownResult = PdfText | PdfFailure

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: Promise<Pdfjs> | undefined

/** pdf.js is loaded on first use, so importing this package for HTML never loads it. */
const loadPdfjs = () => (pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs'))

/** CMaps (needed to map CJK text to Unicode) and standard font metrics shipped with pdfjs-dist. */
function assets(): { cMapUrl: string; standardFontDataUrl: string } {
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  return { cMapUrl: `${join(root, 'cmaps')}/`, standardFontDataUrl: `${join(root, 'standard_fonts')}/` }
}

class OutOfTime extends Error {}

function withinBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  promise.catch(() => {})
  if (ms <= 0) return Promise.reject(new OutOfTime())
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OutOfTime()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const failure = (code: PdfErrorCode, message: string): PdfFailure => ({ ok: false, error: { code, message } })
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))
const declared = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

function runsOf(items: ReadonlyArray<object>): TextRun[] {
  const runs: TextRun[] = []
  for (const item of items) {
    if (!('str' in item) || !('transform' in item) || typeof item.str !== 'string' || !Array.isArray(item.transform)) continue
    const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = item.transform as number[]
    const width = 'width' in item && typeof item.width === 'number' ? item.width : 0
    runs.push({ text: item.str, x, y, width, size: Math.hypot(c, d) || Math.hypot(a, b), angle: (Math.atan2(b, a) * 180) / Math.PI })
  }
  return runs
}

export async function pdfToMarkdown(bytes: Uint8Array | ArrayBuffer, options: PdfToMarkdownOptions = {}): Promise<PdfToMarkdownResult> {
  const maxPages = options.maxPages ?? PDF_TEXT_DEFAULTS.maxPages
  const budget = options.timeBudgetMs ?? PDF_TEXT_DEFAULTS.timeBudgetMs
  const deadline = performance.now() + budget
  const timeLeft = () => deadline - performance.now()

  // A copy: pdf.js takes over the buffer it is given, and the caller still needs its bytes.
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes.slice(0)) : new Uint8Array(bytes)
  if (!String.fromCharCode(...data.subarray(0, 1024)).includes('%PDF-')) {
    return failure('not_pdf', data.length === 0 ? 'The input is empty.' : 'The input has no PDF header (%PDF-) in its first 1024 bytes.')
  }

  const lib = await loadPdfjs()
  const task = lib.getDocument({ data, ...assets(), verbosity: lib.VerbosityLevel.ERRORS, useSystemFonts: false, disableFontFace: true })
  try {
    let doc: Awaited<typeof task.promise>
    try {
      doc = await withinBudget(task.promise, timeLeft())
      if (timeLeft() <= 0) throw new OutOfTime()
    } catch (error) {
      if (error instanceof OutOfTime) return failure('time_budget', `The PDF did not open within the time budget of ${budget} ms.`)
      if (error instanceof Error && error.name === 'PasswordException') return failure('encrypted', 'The PDF is encrypted and needs a password to open.')
      return failure('malformed', `The PDF could not be read: ${reason(error)}`)
    }
    if (doc.numPages < 1) return failure('malformed', 'The PDF has no pages.')

    const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as Record<string, unknown>
    const labels = await doc.getPageLabels().catch(() => null)
    const warnings: PdfWarning[] = []
    const pages: PageLines[] = []
    const last = Math.min(doc.numPages, Math.max(0, Math.floor(maxPages)))
    let outOfTime = false
    for (let number = 1; number <= last; number++) {
      const label = labels?.[number - 1] || null
      try {
        if (timeLeft() <= 0) throw new OutOfTime()
        const page = await withinBudget(doc.getPage(number), timeLeft())
        const content = await withinBudget(page.getTextContent(), timeLeft())
        page.cleanup()
        const paragraphs = layoutPage(runsOf(content.items))
        if (paragraphs.length === 0) {
          warnings.push({ code: 'no_text_layer', page: number, message: `Page ${number} has no text layer (a scanned image or an empty page); no OCR was run.` })
        }
        pages.push({ number, label, paragraphs })
      } catch (error) {
        if (error instanceof OutOfTime) {
          outOfTime = true
          warnings.push({ code: 'time_budget', message: `Read ${pages.length} of ${doc.numPages} pages: the time budget of ${budget} ms ran out.` })
          break
        }
        warnings.push({ code: 'page_error', page: number, message: `Page ${number} could not be read: ${reason(error)}` })
        pages.push({ number, label, paragraphs: [] })
      }
    }
    if (!outOfTime && last < doc.numPages) {
      warnings.push({ code: 'page_cap', message: `Read the first ${last} of ${doc.numPages} pages (maxPages).` })
    }

    const removed = options.repeatedLines === 'remove' ? removeRepeatedLines(pages) : null
    if (removed && removed.size > 0) {
      warnings.push({ code: 'repeated_lines_removed', message: `Removed running headers and footers from ${removed.size} pages; each page lists them in removedLines.` })
    }
    const { markdown, pages: read } = markdownOf(pages, removed, options.pageMarkers !== false)
    if (read.some((page) => page.text !== '')) {
      warnings.unshift({ code: 'tables_unverified', message: 'Tables are not reconstructed: their cells become lines of text in reading order, so values read from a table are unverified.' })
    }
    return {
      ok: true,
      markdown,
      pages: read,
      info: {
        pageCount: doc.numPages,
        title: declared(info.Title),
        author: declared(info.Author),
        subject: declared(info.Subject),
        keywords: declared(info.Keywords),
        creator: declared(info.Creator),
        producer: declared(info.Producer),
        creationDate: declared(info.CreationDate),
        modificationDate: declared(info.ModDate),
        language: declared(info.Language),
        pdfVersion: declared(info.PDFFormatVersion),
        encrypted: declared(info.EncryptFilterName) !== null,
      },
      warnings,
    }
  } finally {
    await task.destroy().catch(() => {})
  }
}
