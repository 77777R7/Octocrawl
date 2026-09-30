/**
 * Crawl link harvest from the FULL document.
 *
 * Extract-tf prune drops nav/footer before mainHtml is selected. Discovery
 * must run on the original HTML, after extract, before that HTML is dropped.
 * This is not markdown conversion and not main-content extraction.
 */

import { parse, qs, qsa } from './dom.js'

/**
 * The document base URL, as HTML defines it: the first `<base href>` resolved
 * against the page URL, else the page URL. A data: or javascript: base, or one
 * that does not parse, is ignored. Null when no absolute URL results.
 */
export function documentBaseUrl(document: Document, pageUrl?: string | null): string | null {
  let fallback: URL | null = null
  try {
    if (pageUrl) fallback = new URL(pageUrl)
  } catch {
    fallback = null
  }
  const href = qs(document, 'base[href]')?.getAttribute('href')?.trim()
  if (href) {
    try {
      const base = new URL(href, fallback ?? undefined)
      if (base.protocol !== 'data:' && base.protocol !== 'javascript:') return base.href
    } catch {
      // fall back to the page URL
    }
  }
  return fallback?.href ?? null
}

/** Absolute http(s) links of the document, resolved against its base URL (`<base href>` included). */
export function collectLinks(html: string, baseUrl: string): readonly string[] {
  const doc = parse(html)
  const resolvedBase = documentBaseUrl(doc.document, baseUrl)
  if (resolvedBase === null) {
    doc.close()
    return []
  }
  const base = new URL(resolvedBase)
  const seen = new Set<string>()
  const links: string[] = []
  for (const a of qsa(doc.document, 'a[href]')) {
    const href = a.getAttribute('href')?.trim()
    if (href === undefined || href.length === 0) continue
    let resolved: URL
    try {
      resolved = new URL(href, base)
    } catch {
      continue
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue
    resolved.hash = ''
    const abs = resolved.href
    if (seen.has(abs)) continue
    seen.add(abs)
    links.push(abs)
  }
  doc.close()
  return links
}
