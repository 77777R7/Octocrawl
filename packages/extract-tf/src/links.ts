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

/** The longest anchor text collectLinkDetails keeps, in characters (code points). */
export const LINK_TEXT_MAX_CHARS = 300

/**
 * The document's absolute http(s) links, each once (fragment stripped), in
 * document order, with the first non-empty text an anchor gave the URL: the
 * anchor's whitespace-collapsed text, else its aria-label, else its title
 * attribute, else the alt of an image inside it, cut at
 * LINK_TEXT_MAX_CHARS; null when no anchor for the URL had any. The same
 * URLs as collectLinks, which stays as it is.
 */
export function collectLinkDetails(html: string, baseUrl: string): Array<{ url: string; text: string | null }> {
  const doc = parse(html)
  const resolvedBase = documentBaseUrl(doc.document, baseUrl)
  if (resolvedBase === null) {
    doc.close()
    return []
  }
  const base = new URL(resolvedBase)
  const byUrl = new Map<string, { url: string; text: string | null }>()
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
    let link = byUrl.get(abs)
    if (link === undefined) {
      link = { url: abs, text: null }
      byUrl.set(abs, link)
    }
    if (link.text === null) link.text = anchorText(a)
  }
  doc.close()
  return [...byUrl.values()]
}

function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/** An anchor's text, aria-label, title or inner image alt, the first that is not empty; null when none is. */
function anchorText(a: Element): string | null {
  const imageAlt = qsa(a, 'img[alt]').map((img) => collapse(img.getAttribute('alt'))).find((alt) => alt.length > 0)
  for (const candidate of [collapse(a.textContent), collapse(a.getAttribute('aria-label')), collapse(a.getAttribute('title')), imageAlt ?? '']) {
    if (candidate.length === 0) continue
    const points = Array.from(candidate)
    return points.length <= LINK_TEXT_MAX_CHARS ? candidate : points.slice(0, LINK_TEXT_MAX_CHARS).join('').trimEnd()
  }
  return null
}
