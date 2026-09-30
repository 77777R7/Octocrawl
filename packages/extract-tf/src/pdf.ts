/**
 * PDF text layer, page by page. Only what the file already carries as text
 * is read; a scanned page yields nothing, and the caller reports that as
 * `ocr_required` rather than as an empty success.
 *
 * pdf.js is loaded on first use so pages without PDFs never pay for it.
 */

export interface PdfText {
  /** Pages in the document. */
  pages: number
  /** Text of each page read, in page order. */
  texts: readonly string[]
  /** Pages that carried at least one non-blank character. */
  textPages: number
  /** Non-blank characters over the pages read. */
  textChars: number
}

export type PdfParseCode = 'password' | 'invalid' | 'unknown'

export class PdfParseError extends Error {
  override readonly name = 'PdfParseError'
  constructor(readonly code: PdfParseCode, message: string) {
    super(message)
  }
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfjsPromise: Promise<PdfJs> | null = null

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((lib) => {
    // Node has no Web Worker; pdf.js runs its worker code in-process when told where it lives.
    if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
    return lib
  })
  return pdfjsPromise
}

function toParseError(error: unknown): PdfParseError {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'PasswordException') return new PdfParseError('password', 'the PDF is password protected')
  if (name === 'InvalidPDFException' || name === 'FormatError' || name === 'MissingPDFException') return new PdfParseError('invalid', message || 'the file is not a readable PDF')
  return new PdfParseError('unknown', message || 'the PDF could not be read')
}

interface TextItemLike {
  str?: string
  hasEOL?: boolean
  transform?: number[]
  width?: number
}

/**
 * Lines from pdf.js text items: an item's `hasEOL` ends a line, and a gap
 * between two items on the same line becomes a single space. Nothing is
 * reflowed; a table row stays one line of space-separated cells.
 */
export function linesOf(items: readonly TextItemLike[]): string {
  let out = ''
  let previous: TextItemLike | null = null
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    if (previous !== null && !previous.hasEOL && item.str.length > 0 && out.length > 0 && !/\s$/.test(out) && !/^\s/.test(item.str)) {
      const previousEnd = (previous.transform?.[4] ?? 0) + (previous.width ?? 0)
      const start = item.transform?.[4] ?? previousEnd
      if (start - previousEnd > 1) out += ' '
    }
    out += item.str
    if (item.hasEOL) out += '\n'
    previous = item
  }
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractPdfText(bytes: Uint8Array, options: { maxPages?: number } = {}): Promise<PdfText> {
  const lib = await loadPdfJs()
  let doc: Awaited<ReturnType<PdfJs['getDocument']>['promise']>
  try {
    // pdf.js may take the buffer over; a copy keeps the caller's bytes intact.
    doc = await lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise
  } catch (error) {
    throw toParseError(error)
  }
  try {
    const pages = doc.numPages
    const limit = Math.min(pages, options.maxPages ?? pages)
    const texts: string[] = []
    let textPages = 0
    let textChars = 0
    for (let number = 1; number <= limit; number++) {
      const page = await doc.getPage(number)
      try {
        const content = await page.getTextContent()
        const text = linesOf(content.items as readonly TextItemLike[])
        texts.push(text)
        const chars = text.replace(/\s+/g, '').length
        if (chars > 0) textPages++
        textChars += chars
      } finally {
        page.cleanup()
      }
    }
    return { pages, texts, textPages, textChars }
  } catch (error) {
    throw error instanceof PdfParseError ? error : toParseError(error)
  } finally {
    await doc.destroy()
  }
}

/** Markdown for a PDF's text: one marker line per page, so a value can be cited to its page. */
export function pdfMarkdown(text: PdfText): string {
  return text.texts
    .map((pageText, index) => `<!-- page ${index + 1} -->\n${pageText}`)
    .join('\n\n')
}
