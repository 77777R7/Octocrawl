/**
 * Crawl link harvest from the FULL document.
 *
 * Extract-tf prune drops nav/footer before mainHtml is selected. Discovery
 * must run on the original HTML, after extract, before that HTML is dropped.
 * This is not markdown conversion and not main-content extraction.
 */

import { parse, qsa } from './dom.js'

// Page assets linked with <a>: not pages a crawl could visit or a reader
// would cite. Documents (PDF, CSV, XLSX, ZIP) stay: they are the data.
const ASSET_PATH = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|css|js|mjs|map|woff2?|ttf|otf|eot|mp3|mp4|m4a|webm|ogg|wav|mov|avi)$/i

export function collectLinks(html: string, baseUrl: string): readonly string[] {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }

  const doc = parse(html)
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
    if (ASSET_PATH.test(resolved.pathname)) continue
    resolved.hash = ''
    const abs = resolved.href
    if (seen.has(abs)) continue
    seen.add(abs)
    links.push(abs)
  }
  doc.close()
  return links
}
