/**
 * Sitemap XML (the sitemaps.org protocol): a `<urlset>` of `<url><loc>`
 * entries, or a `<sitemapindex>` of `<sitemap><loc>` children.
 *
 * Read with a small scanner rather than an XML library: the two document
 * shapes are fixed, the protocol caps a file at 50 000 entries, and a file
 * that is not quite well formed is read for what it lists instead of being
 * refused. Only `<loc>` elements in the root's own namespace prefix count, so
 * an image or video extension's `<image:loc>` is never taken for a page.
 * Pure functions, no I/O: the fetch, the gzip inflation and the record of
 * each file are the bench's (HttpSitemapSource).
 */

/** The protocol's cap on entries per file; what a file lists past it is dropped and reported as truncated. */
export const SITEMAP_MAX_ENTRIES = 50_000

export interface ParsedSitemap {
  /** `index` for a `<sitemapindex>`, `urlset` for a `<urlset>`, `not_sitemap` when the text has neither root. */
  kind: 'index' | 'urlset' | 'not_sitemap'
  /** The http(s) `<loc>` values in document order, entity-decoded and trimmed. */
  locs: string[]
  /** True when the file listed more than SITEMAP_MAX_ENTRIES entries and the rest were dropped. */
  truncated: boolean
  /** `<loc>` values left out: not http(s), or not a URL at all. */
  dropped: number
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** The five XML entities and numeric character references; anything else is left as written. */
export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}

/** The gzip magic number, `1f 8b`, at the start of a body. */
export function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

/** A sitemap body to inflate: its URL's path ends in `.gz`, or its bytes start with the gzip magic number. */
export function looksGzipped(url: string, bytes: Uint8Array): boolean {
  if (isGzipBytes(bytes)) return true
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.gz')
  } catch {
    return false
  }
}

const ROOT = /<\s*(?:([A-Za-z_][\w.-]*):)?(urlset|sitemapindex)(?=[\s>/])/

export function parseSitemapXml(text: string): ParsedSitemap {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const root = ROOT.exec(body)
  if (root === null) return { kind: 'not_sitemap', locs: [], truncated: false, dropped: 0 }
  const prefix = root[1] === undefined ? '' : `${root[1]}:`
  const kind = root[2] === 'urlset' ? 'urlset' : 'index'
  // `<loc>` in the root's own prefix, with or without a CDATA section around the value.
  const loc = new RegExp(`<${escapeRegExp(prefix)}loc(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${escapeRegExp(prefix)}loc\\s*>`, 'g')
  const locs: string[] = []
  let dropped = 0
  let truncated = false
  for (let match = loc.exec(body); match !== null; match = loc.exec(body)) {
    if (locs.length >= SITEMAP_MAX_ENTRIES) { truncated = true; break }
    const raw = match[1] ?? match[2] ?? ''
    const value = (match[1] === undefined ? decodeXmlEntities(raw) : raw).trim()
    const href = httpHref(value)
    if (href === null) dropped++
    else locs.push(href)
  }
  return { kind, locs, truncated, dropped }
}

/** The absolute http(s) form of a `<loc>` value, or null when it is not one. */
function httpHref(value: string): string | null {
  if (value.length === 0) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
