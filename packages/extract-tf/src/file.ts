/**
 * Files among responses: which responses are a PDF, CSV, JSON, plain-text,
 * XLSX, XLS or ZIP file rather than a web page, and the text of those that
 * are text. Every lane uses these rules, so a file is recognised the same way
 * whichever lane received it.
 *
 * The Content-Type decides first. Where it does not say (none, or
 * `application/octet-stream` and its kin), the bytes do: a `%PDF-` header
 * within the first 1024 bytes (as pdf.js reads them), a ZIP header (an XLSX
 * when the file is named `.xlsx`), an OLE header named `.xls`, or a text file
 * named `.csv`, `.json` or `.txt` that decodes as UTF-8. A PDF header at the
 * very start overrides a Content-Type of `text/html` or `text/plain`. A
 * response that none of this makes a file is read as a web page, as before.
 */

import type { FileKind } from '@w2l/contracts'

/**
 * Names the rules that turn a file other than a PDF into `markdown`, like
 * EXTRACTOR_VERSION for web pages and PDF_TEXT_VERSION for PDFs: CSV, JSON
 * and plain text are their text as received (decoded with a byte-order mark,
 * the declared charset or UTF-8, the mark itself dropped); XLSX, XLS and ZIP
 * have no text. Bump it with any change that can alter that output.
 */
export const FILE_TEXT_VERSION = 'file-text/1'

/** The saved file's extension for each kind. */
export const FILE_EXTENSIONS: Readonly<Record<FileKind, string>> = {
  pdf: 'pdf', csv: 'csv', json: 'json', text: 'txt', xlsx: 'xlsx', xls: 'xls', zip: 'zip',
}

/**
 * What a Content-Type says before the body is read: a file kind; `maybe_file`
 * (none, or a generic binary type), where the bytes decide; `unsupported`, a
 * binary type W2L does not read (images, audio, video, fonts, word-processor
 * and presentation documents, other archives); or `page` for everything else.
 */
export type ContentTypeClass = { kind: FileKind } | 'maybe_file' | 'unsupported' | 'page'

export interface FileDecision {
  kind: FileKind
  /** `content_type`: the Content-Type named it. `content`: the bytes did (a PDF or ZIP header, or the text of a file named .csv, .json or .txt). */
  detectedBy: 'content_type' | 'content'
}

const DECLARED: Readonly<Record<string, FileKind>> = {
  'application/pdf': 'pdf', 'application/x-pdf': 'pdf', 'application/acrobat': 'pdf', 'text/pdf': 'pdf', 'text/x-pdf': 'pdf',
  'text/csv': 'csv', 'application/csv': 'csv', 'text/comma-separated-values': 'csv', 'text/x-csv': 'csv', 'application/x-csv': 'csv', 'text/x-comma-separated-values': 'csv',
  'application/json': 'json', 'text/json': 'json',
  'text/plain': 'text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls', 'application/msexcel': 'xls', 'application/x-msexcel': 'xls', 'application/x-excel': 'xls',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'application/x-zip': 'zip', 'multipart/x-zip': 'zip',
}

const GENERIC_BINARY = new Set([
  'application/octet-stream', 'binary/octet-stream', 'application/x-download', 'application/force-download',
  'application/download', 'application/unknown', 'application/binary',
])

const UNSUPPORTED_PREFIXES = ['image/', 'audio/', 'video/', 'font/', 'model/', 'application/vnd.openxmlformats-officedocument.wordprocessingml.', 'application/vnd.openxmlformats-officedocument.presentationml.', 'application/vnd.oasis.opendocument.']
const UNSUPPORTED = new Set([
  'application/msword', 'application/vnd.ms-powerpoint', 'application/rtf', 'application/postscript', 'application/epub+zip',
  'application/x-tar', 'application/gzip', 'application/x-gzip', 'application/x-bzip2', 'application/x-7z-compressed',
  'application/x-rar-compressed', 'application/vnd.rar', 'application/x-msdownload', 'application/java-archive',
  'application/vnd.android.package-archive', 'application/x-apple-diskimage', 'application/wasm', 'application/x-shockwave-flash',
])

/** The media type of a Content-Type, lower-cased without parameters; null when there is none. */
export function mediaTypeOf(contentType: string | null): string | null {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  return type === '' ? null : type
}

export function classifyContentType(contentType: string | null): ContentTypeClass {
  const type = mediaTypeOf(contentType)
  if (type === null || GENERIC_BINARY.has(type)) return 'maybe_file'
  // Structured suffixes: application/ld+json, application/vnd.sdmx.data+csv (Eurostat, OECD) and the like.
  const kind = DECLARED[type] ?? (/^application\/[\w.+-]+\+json$/.test(type) ? 'json' : /^application\/[\w.+-]+\+csv$/.test(type) ? 'csv' : undefined)
  if (kind !== undefined) return { kind }
  if (UNSUPPORTED.has(type) || UNSUPPORTED_PREFIXES.some(prefix => type.startsWith(prefix))) return 'unsupported'
  return 'page'
}

const startsWith = (bytes: Uint8Array, magic: readonly number[], at = 0) => magic.every((byte, i) => bytes[at + i] === byte)
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
const ZIP = [0x50, 0x4b, 0x03, 0x04]
const EMPTY_ZIP = [0x50, 0x4b, 0x05, 0x06]
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/** A PDF header (`%PDF-`) within the first `window` bytes. */
export function hasPdfHeader(bytes: Uint8Array, window = 1024): boolean {
  const last = Math.min(bytes.length, window) - PDF.length
  for (let i = 0; i <= last; i++) if (startsWith(bytes, PDF, i)) return true
  return false
}

/** The file name a response gives: the Content-Disposition filename, else the last segment of the URL's path. */
export function responseFileName(url: string, contentDisposition: string | null): string {
  const star = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(contentDisposition ?? '')?.[1]
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition ?? '')?.[1]
  if (star !== undefined) {
    try { return decodeURIComponent(star.trim()) } catch { return star.trim() }
  }
  if (plain !== undefined) return plain.trim()
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') } catch { return '' }
}

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''
const NAMED_TEXT: Readonly<Record<string, FileKind>> = { csv: 'csv', json: 'json', txt: 'text' }

/** An HTML document sent as text/plain is still a web page. */
function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).replace(/^﻿/, '').trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

/**
 * Whether a response is a file, from its Content-Type, its bytes and its file
 * name (see `responseFileName`); `unsupported` for a binary type W2L does not
 * read; null for a web page.
 */
export function detectFile(contentType: string | null, bytes: Uint8Array, fileName: string): FileDecision | 'unsupported' | null {
  const declared = classifyContentType(contentType)
  if (declared === 'unsupported') return 'unsupported'
  if (typeof declared === 'object') {
    if (declared.kind === 'text' && startsWith(bytes, PDF)) return { kind: 'pdf', detectedBy: 'content' }
    if (declared.kind === 'text' && looksLikeHtml(bytes)) return null
    return { kind: declared.kind, detectedBy: 'content_type' }
  }
  if (declared === 'page') return startsWith(bytes, PDF) ? { kind: 'pdf', detectedBy: 'content' } : null
  const extension = extensionOf(fileName)
  if (hasPdfHeader(bytes)) return { kind: 'pdf', detectedBy: 'content' }
  if (startsWith(bytes, ZIP) || startsWith(bytes, EMPTY_ZIP)) return { kind: extension === 'xlsx' ? 'xlsx' : 'zip', detectedBy: 'content' }
  if (startsWith(bytes, OLE) && extension === 'xls') return { kind: 'xls', detectedBy: 'content' }
  const named = NAMED_TEXT[extension]
  if (named !== undefined && bytes.length > 0 && !looksLikeHtml(bytes) && decodeFileText(bytes, null) !== null) return { kind: named, detectedBy: 'content' }
  return null
}

/** Kinds whose text W2L returns as `markdown`. */
export const TEXT_FILE_KINDS: ReadonlySet<FileKind> = new Set<FileKind>(['csv', 'json', 'text'])

/**
 * A text file's text: decoded with the encoding its byte-order mark names,
 * else its declared charset, else UTF-8, the mark itself dropped. Null when
 * the bytes are not valid in that encoding, or the charset is unknown:
 * nothing is replaced or guessed.
 */
export function decodeFileText(bytes: Uint8Array, contentType: string | null): { text: string; encoding: string } | null {
  const bom = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 'utf-8' : startsWith(bytes, [0xff, 0xfe]) ? 'utf-16le' : startsWith(bytes, [0xfe, 0xff]) ? 'utf-16be' : null
  const declared = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '')?.[1]
  let decoder: TextDecoder
  try { decoder = new TextDecoder(bom ?? declared ?? 'utf-8', { fatal: true }) } catch { return null }
  try { return { text: decoder.decode(bytes), encoding: decoder.encoding } } catch { return null }
}
