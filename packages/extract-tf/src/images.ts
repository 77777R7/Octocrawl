/**
 * Page images from the FULL document as received, like links.ts: every URL
 * an `<img>`, a `<picture>` source, a lazy-loading attribute, a video poster,
 * an image_src link, an og:image or a twitter:image names, resolved against
 * the document base URL, absolute http(s) only, fragment stripped,
 * deduplicated by exact string, in document order. Not a filter on file
 * extensions: an extensionless CDN URL stays. `data:` URIs are counted and
 * left out. Not main-content extraction: includeTags, excludeTags and
 * onlyMainContent do not narrow it.
 */

import { parse, qsa } from './dom.js'
import { documentBaseUrl } from './links.js'

export interface ImageCollection {
  /** The absolute http(s) image URLs, in document order, each once. */
  images: readonly string[]
  /** Candidates read from `srcset` attributes (`img` and `source`), before deduplication. */
  srcsetCandidates: number
  /** Candidates read from lazy-loading attributes (`data-src`, `data-srcset`, `data-lazy-src`, `data-original`). */
  lazy: number
  /** `data:` URIs met and left out. */
  dataUrisDropped: number
}

const LAZY_SRC = ['data-src', 'data-lazy-src', 'data-original'] as const
const LAZY_SRCSET = 'data-srcset'
const META_IMAGES: ReadonlySet<string> = new Set(['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image'])

export function collectImages(html: string, baseUrl: string): ImageCollection {
  const doc = parse(html)
  const out = { images: [] as string[], srcsetCandidates: 0, lazy: 0, dataUrisDropped: 0 }
  const resolvedBase = documentBaseUrl(doc.document, baseUrl)
  if (resolvedBase === null) {
    doc.close()
    return out
  }
  const base = new URL(resolvedBase)
  const seen = new Set<string>()
  const add = (raw: string | null): void => {
    const value = raw?.trim()
    if (value === undefined || value.length === 0) return
    if (/^data:/i.test(value)) {
      out.dataUrisDropped++
      return
    }
    let resolved: URL
    try {
      resolved = new URL(value, base)
    } catch {
      return
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return
    resolved.hash = ''
    if (seen.has(resolved.href)) return
    seen.add(resolved.href)
    out.images.push(resolved.href)
  }
  const addSrcset = (value: string | null, lazy: boolean): void => {
    for (const url of srcsetUrls(value)) {
      out.srcsetCandidates++
      if (lazy) out.lazy++
      add(url)
    }
  }
  const addLazy = (el: Element): void => {
    for (const name of LAZY_SRC) {
      const value = attribute(el, name)
      if (value === null) continue
      out.lazy++
      add(value)
    }
    addSrcset(attribute(el, LAZY_SRCSET), true)
  }
  // One pass in document order over every element that can name an image.
  for (const el of qsa(doc.document, 'img, source, video, link, meta')) {
    switch (el.localName) {
      case 'img':
        add(attribute(el, 'src'))
        addSrcset(attribute(el, 'srcset'), false)
        addLazy(el)
        break
      case 'source':
        // A <video> or <audio> source is media, not an image.
        if (el.parentElement?.localName !== 'picture') break
        addSrcset(attribute(el, 'srcset'), false)
        addLazy(el)
        break
      case 'video':
        add(attribute(el, 'poster'))
        break
      case 'link':
        if ((attribute(el, 'rel') ?? '').toLowerCase().split(/[\t\n\f\r ]+/).includes('image_src')) add(attribute(el, 'href'))
        break
      case 'meta': {
        const name = (attribute(el, 'property') ?? attribute(el, 'name') ?? '').trim().toLowerCase()
        if (META_IMAGES.has(name)) add(attribute(el, 'content'))
        break
      }
    }
  }
  doc.close()
  return out
}

/**
 * The URLs of a `srcset` attribute, as HTML parses it: each candidate is a
 * URL followed by an optional descriptor, candidates separated by commas; a
 * URL may itself hold commas (a `data:` URI), so a comma ends a candidate
 * only when it trails the URL or follows its descriptor.
 */
export function srcsetUrls(srcset: string | null): string[] {
  if (srcset === null) return []
  const urls: string[] = []
  let i = 0
  while (i < srcset.length) {
    while (i < srcset.length && /[\s,]/.test(srcset[i]!)) i++
    if (i >= srcset.length) break
    const start = i
    while (i < srcset.length && !/\s/.test(srcset[i]!)) i++
    let url = srcset.slice(start, i)
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '')
      if (url.length > 0) urls.push(url)
      continue
    }
    urls.push(url)
    // The descriptors, up to the comma that ends the candidate.
    while (i < srcset.length && srcset[i] !== ',') i++
  }
  return urls
}

/** An attribute matched by name case-insensitively, as HTML does; linkedom keeps the source's case. */
function attribute(el: Element, name: string): string | null {
  const value = el.getAttribute(name)
  if (value !== null) return value
  for (const attr of Array.from(el.attributes)) if (attr.name.toLowerCase() === name) return attr.value
  return null
}
