/**
 * Content-Encoding (RFC 9110 §8.4) as the http lane and the sitemap reader
 * receive it. W2L's identity sends no Accept-Encoding, yet some servers encode
 * anyway (www.python.org answers gzip), so a body is decoded by what its
 * header says, whether or not it was asked for: gzip (and its alias x-gzip),
 * deflate (zlib-wrapped, or raw as some servers send it) and br, each coding
 * undone in the reverse of the order it was applied, the output held under
 * the policy's decompressed-size cap. Any other coding is refused by name;
 * its bytes are never read as if they were the representation.
 */

import { promisify } from 'node:util'
import { brotliDecompress, gunzip, inflate, inflateRaw, type ZlibOptions } from 'node:zlib'

const DECODERS = {
  gzip: promisify<Uint8Array, ZlibOptions, Buffer>(gunzip),
  deflate: promisify<Uint8Array, ZlibOptions, Buffer>(inflate),
  br: promisify<Uint8Array, ZlibOptions, Buffer>(brotliDecompress),
} as const
const inflateRawAsync = promisify<Uint8Array, ZlibOptions, Buffer>(inflateRaw)

export type ContentCoding = keyof typeof DECODERS

/** A coding W2L does not decode; `coding` is the first such one in the header. */
export class UnsupportedContentEncodingError extends Error {
  override readonly name = 'UnsupportedContentEncodingError'
  constructor(readonly contentEncoding: string, readonly coding: string) {
    super(`unsupported content coding ${JSON.stringify(coding)}`)
  }
}

/** The decoded body ran past the decompressed-size cap; decoding stopped there. */
export class DecompressedTooLargeError extends Error {
  override readonly name = 'DecompressedTooLargeError'
  constructor(readonly contentEncoding: string, readonly maxBytes: number) {
    super(`decoded body exceeded ${maxBytes} bytes`)
  }
}

/** The bytes are not valid for the coding their header names (corrupt or cut short). */
export class ContentDecodingError extends Error {
  override readonly name = 'ContentDecodingError'
  constructor(readonly contentEncoding: string, readonly coding: ContentCoding, readonly code: string | null) {
    super(`body does not decode as ${coding}${code === null ? '' : ` (${code})`}`)
  }
}

/**
 * The codings a Content-Encoding header lists, lower-cased, in the order they
 * were applied, `identity` left out and `x-gzip` read as `gzip`. Empty for no
 * header or identity alone.
 */
export function contentCodings(header: string | null | undefined): string[] {
  return (header ?? '').split(',').map(token => token.trim().toLowerCase()).filter(token => token !== '' && token !== 'identity').map(token => token === 'x-gzip' ? 'gzip' : token)
}

/** How the evidence names a body's coding: the codings joined in applied order, or `identity` when it had none. */
export function contentEncodingLabel(header: string | null | undefined): string {
  const codings = contentCodings(header)
  return codings.length === 0 ? 'identity' : codings.join(', ')
}

/**
 * The body with every coding its header names undone, at most `maxBytes`
 * after each step; an empty body is returned as it is. Throws UnsupportedContentEncodingError before decoding
 * anything when one coding is unknown, DecompressedTooLargeError over the cap,
 * and ContentDecodingError for bytes the coding rejects.
 */
export async function decodeContentEncoding(bytes: Uint8Array, header: string | null | undefined, maxBytes: number): Promise<{ bytes: Uint8Array; codings: string[] }> {
  const codings = contentCodings(header)
  // An empty body (a 304, a 204, a redirect) has nothing to decode, whatever its header says.
  if (bytes.byteLength === 0) return { bytes, codings }
  const label = contentEncodingLabel(header)
  const unknown = codings.find(coding => !Object.hasOwn(DECODERS, coding))
  if (unknown !== undefined) throw new UnsupportedContentEncodingError(label, unknown)
  let out = bytes
  for (const coding of [...codings].reverse() as ContentCoding[]) {
    const options = { maxOutputLength: maxBytes }
    try {
      out = await DECODERS[coding](out, options).catch(async (error: unknown) => {
        // RFC 9110's deflate is zlib-wrapped, but some servers send the raw stream.
        if (coding === 'deflate' && errorCode(error) === 'Z_DATA_ERROR') return await inflateRawAsync(out, options)
        throw error
      })
    } catch (error) {
      if (errorCode(error) === 'ERR_BUFFER_TOO_LARGE') throw new DecompressedTooLargeError(label, maxBytes)
      throw new ContentDecodingError(label, coding, errorCode(error))
    }
  }
  return { bytes: out, codings }
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}
