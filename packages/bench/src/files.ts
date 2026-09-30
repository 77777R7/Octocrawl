/**
 * Files fetched as received: which responses are files, what to call them,
 * and where their bytes go. A file is kept byte for byte with its SHA-256;
 * nothing is converted before the hash is taken.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { FileKind } from '@w2l/contracts'

/** What the response is, before its body is read. */
export type ResponseShape =
  | { kind: 'page' }
  | { kind: 'file'; file: FileKind }
  | { kind: 'unsupported' }
  /** A generic type (octet-stream, no type): the first bytes decide. */
  | { kind: 'sniff'; hint: FileKind | null }

const MIME_KIND: Readonly<Record<string, FileKind>> = {
  'application/pdf': 'pdf',
  'application/x-pdf': 'pdf',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'text/tab-separated-values': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/json': 'json',
  'text/json': 'json',
  'application/ld+json': 'json',
}

const EXTENSION_KIND: Readonly<Record<string, FileKind>> = {
  pdf: 'pdf',
  csv: 'csv',
  tsv: 'csv',
  xlsx: 'xlsx',
  xls: 'xls',
  zip: 'zip',
  json: 'json',
}

/** Types servers use when they do not know, or do not say, what a download is. */
const GENERIC_TYPES = new Set(['application/octet-stream', 'binary/octet-stream', 'application/x-download', 'application/force-download', 'application/download', 'application/unknown'])

/** Spreadsheet types some servers put on CSV downloads; the extension then decides. */
const LOOSE_TYPES = new Set(['application/vnd.ms-excel', 'application/excel', 'application/x-excel', 'application/x-msexcel'])

export const FILE_EXTENSION: Readonly<Record<FileKind, string>> = { pdf: 'pdf', csv: 'csv', xlsx: 'xlsx', xls: 'xls', zip: 'zip', json: 'json' }

export function mimeOf(contentType: string | null): string | null {
  if (contentType === null) return null
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return mime.length > 0 ? mime : null
}

function extensionKindOfName(name: string | null): FileKind | null {
  if (name === null || !name.includes('.')) return null
  return EXTENSION_KIND[name.split('.').pop()!.toLowerCase()] ?? null
}

export function extensionKind(url: string): FileKind | null {
  try {
    return extensionKindOfName(basename(new URL(url).pathname))
  } catch {
    return null
  }
}

function isPageType(mime: string): boolean {
  return mime === 'text/html' || mime === 'application/xhtml+xml' || mime === 'text/plain' || mime === 'application/xml' || mime === 'text/xml' || mime.startsWith('text/')
}

/** Decide from the headers and the URL what the response is; a Content-Disposition name counts like the URL's. */
export function responseShape(contentType: string | null, url: string, contentDisposition: string | null = null): ResponseShape {
  const mime = mimeOf(contentType)
  const byExtension = extensionKind(url) ?? (contentDisposition === null ? null : extensionKindOfName(filenameOf(contentDisposition, url)))
  if (mime === null) return byExtension === null ? { kind: 'sniff', hint: null } : { kind: 'sniff', hint: byExtension }
  if (GENERIC_TYPES.has(mime)) return { kind: 'sniff', hint: byExtension }
  if (LOOSE_TYPES.has(mime) && byExtension !== null) return { kind: 'file', file: byExtension }
  const byMime = MIME_KIND[mime]
  if (byMime !== undefined) return { kind: 'file', file: byMime }
  if (isPageType(mime)) return { kind: 'page' }
  return { kind: 'unsupported' }
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte)
}

/** What generic bytes are: a PDF or ZIP signature, otherwise text (a page) or nothing W2L keeps. */
export function sniffShape(bytes: Uint8Array, hint: FileKind | null): { kind: 'page' } | { kind: 'file'; file: FileKind } | { kind: 'unsupported' } {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: 'file', file: 'pdf' } // %PDF-
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return { kind: 'file', file: hint === 'xlsx' ? 'xlsx' : 'zip' } // PK..
  const head = bytes.subarray(0, 512)
  const binary = head.some((byte) => byte === 0)
  if (binary) return hint === 'xls' ? { kind: 'file', file: 'xls' } : { kind: 'unsupported' }
  if (hint === 'csv' || hint === 'json') return { kind: 'file', file: hint }
  return { kind: 'page' }
}

/** The name the server gave the file, else the URL's last path segment when it has an extension. */
export function filenameOf(contentDisposition: string | null, url: string): string | null {
  if (contentDisposition !== null) {
    const encoded = /filename\*\s*=\s*(?:utf-8|UTF-8)''([^;]+)/.exec(contentDisposition)
    if (encoded?.[1] !== undefined) {
      try { return sanitizeFilename(decodeURIComponent(encoded[1].trim())) } catch { /* fall through */ }
    }
    const plain = /filename\s*=\s*("([^"]*)"|([^;]+))/.exec(contentDisposition)
    const value = plain?.[2] ?? plain?.[3]
    if (value !== undefined && value.trim().length > 0) return sanitizeFilename(value.trim())
  }
  try {
    const name = basename(new URL(url).pathname)
    return name.includes('.') ? sanitizeFilename(decodeURIComponent(name)) : null
  } catch {
    return null
  }
}

function sanitizeFilename(name: string): string | null {
  const clean = basename(name).replace(/[\u0000-\u001f]/g, '').trim()
  return clean.length > 0 && clean !== '.' && clean !== '..' ? clean : null
}

/** Directory files are saved under; `off` disables saving. */
export function filesDirectory(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.W2L_FILES_DIR?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit.toLowerCase() === 'off' ? null : resolve(explicit)
  return resolve(env.W2L_TASK_ROOT?.trim() || '.w2l/api', 'files')
}

/** Write the bytes under their hash; a second download of the same file is the same path. */
export async function saveFileBytes(bytes: Uint8Array, sha256: string, kind: FileKind, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const root = filesDirectory(env)
  if (root === null) return null
  const dir = join(root, sha256.slice(0, 2))
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${sha256}.${FILE_EXTENSION[kind]}`)
  try {
    await writeFile(path, bytes, { flag: 'wx' })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  return path
}

export function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
