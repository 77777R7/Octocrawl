/**
 * A response W2L took for a file rather than a web page: a PDF, CSV, JSON,
 * plain-text, XLSX, XLS or ZIP file. The bytes are saved as received, with
 * their SHA-256 and size, and never sent to the browser as a page would be.
 * Types and the size cap only; detection lives in @w2l/extract-tf, saving in
 * @w2l/bench.
 */

import type { NetworkPolicy } from './policy.js'

export const FILE_KINDS = ['pdf', 'csv', 'json', 'text', 'xlsx', 'xls', 'zip'] as const
export type FileKind = (typeof FILE_KINDS)[number]

/** The operator cap on a file's size when `W2L_MAX_FILE_BYTES` is not set: 50 MiB. */
export const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024
/** The largest cap `W2L_MAX_FILE_BYTES` may set: 500 MiB. A file is held in memory while it is hashed and read. */
export const MAX_FILE_BYTES_CEILING = 500 * 1024 * 1024

/** What the PDF declares about itself; null where it declares nothing (pdfToMarkdown's `info`). */
export interface PdfDocumentInfo {
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
  encrypted: boolean
}

/** The text of a PDF as W2L read it into `markdown`. */
export interface FilePdfText {
  /** Pages in the file; null when it could not be opened. */
  pageCount: number | null
  /** Pages read into `markdown`, from the first. */
  pagesRead: number
  /**
   * Every page read: its 1-based number, the page label the PDF declares
   * (a printed number such as "xii"), and the offsets of its text in
   * `markdown` (`markdown.slice(start, end)`), which follows the line
   * `<!-- page N -->`.
   */
  pages: readonly { number: number; label: string | null; start: number; end: number }[]
  info: PdfDocumentInfo | null
  /**
   * `tables_unverified` on every PDF with text; `no_text_layer` per page
   * without text (no OCR is run); `page_error`, `page_cap`, `time_budget`.
   */
  warnings: readonly { code: string; message: string; page?: number }[]
  /** Why no text could be read at all (`not_pdf`, `encrypted`, `malformed`, `time_budget`); null otherwise. */
  error: { code: string; message: string } | null
}

export interface FileWarning {
  /**
   * `text_not_decoded`: the bytes are not valid text in their declared or
   * default (UTF-8) encoding, so no text is returned. `pdf_not_parsed`: the
   * request's `parsers` named no `pdf` entry, so a PDF's text was not read.
   */
  code: 'text_not_decoded' | 'pdf_not_parsed'
  message: string
}

export interface FileDescription {
  kind: FileKind
  /**
   * `content_type`: the response's Content-Type named the kind. `content`:
   * the bytes did, when the Content-Type did not (a `%PDF-` or ZIP header
   * under `application/octet-stream`, or no Content-Type at all).
   */
  detectedBy: 'content_type' | 'content'
  /** The Content-Type header as received; null when the response had none. */
  contentType: string | null
  /** The Content-Length the server declared; null when it declared none. */
  declaredBytes: number | null
  /** The size cap that applied: the operator's `W2L_MAX_FILE_BYTES`, or a request's lower `maxFileBytes`. */
  maxBytes: number
  /** Bytes received, all of them; null when the file was not read (over the cap). */
  bytes: number | null
  /** SHA-256 (hex) of the bytes received; null when not read. */
  sha256: string | null
  /**
   * Where the bytes were saved, as received: `<task root>/files/<sha256>.<ext>`.
   * Null when they were not saved (over the cap, or no file store is configured).
   */
  path: string | null
  /**
   * What `markdown` carries: `pdf_text` (the PDF's text layer, one
   * `<!-- page N -->` marker per page), `text` (a CSV, JSON or plain-text
   * file's text as received), or null (no text: binary kinds, or text that
   * could not be decoded).
   */
  markdownFrom: 'pdf_text' | 'text' | null
  /** The encoding text was decoded with (the declared charset, else UTF-8); null without text. */
  encoding: string | null
  warnings: readonly FileWarning[]
  /** PDF files that were read; null otherwise. */
  pdf: FilePdfText | null
}

/**
 * The operator's file cap from `W2L_MAX_FILE_BYTES` (bytes, an integer from 1
 * to MAX_FILE_BYTES_CEILING), else `fallback`. Anything else is an error, so
 * a mistyped cap stops the service at start instead of being ignored.
 */
export function maxFileBytesFromEnv(env: Readonly<Record<string, string | undefined>>, fallback = DEFAULT_MAX_FILE_BYTES): number {
  const raw = env['W2L_MAX_FILE_BYTES']?.trim()
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > MAX_FILE_BYTES_CEILING) {
    throw new Error(`W2L_MAX_FILE_BYTES must be a whole number of bytes from 1 to ${MAX_FILE_BYTES_CEILING}`)
  }
  return value
}

/** The cap for one fetch: the policy's (operator) cap, lowered by the request's `maxFileBytes` when it sets one. */
export function fileByteCap(policy: Pick<NetworkPolicy, 'maxFileBytes'>, requested?: number): number {
  const operator = policy.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  return requested === undefined ? operator : Math.min(operator, requested)
}
