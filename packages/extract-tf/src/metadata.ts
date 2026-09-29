/**
 * Page metadata: what the document's own markup declares about the page.
 *
 * Read from the whole document before cleaning, because the head is outside
 * every main block and cleanTree drops svg (whose `<title>` must not count).
 * Each value is the page's declaration or null; nothing is inferred from the
 * URL, the content or a different tag.
 */

import type { PageMetadata } from '@w2l/contracts'
import { qsa, textOf } from './dom.js'

const ASCII_WHITESPACE = /[\t\n\f\r ]+/g

export function collectPageMetadata(document: Document, baseUrl: string | null): PageMetadata {
  const metas = qsa(document, 'meta')
  const links = qsa(document, 'link')
  return {
    title: pageTitle(document),
    description: metaNamed(metas, 'description'),
    language: pageLanguage(document, metas),
    keywords: metaNamed(metas, 'keywords'),
    robots: metaNamed(metas, 'robots'),
    favicon: linkedUrl(links, 'icon', baseUrl),
    canonicalUrl: linkedUrl(links, 'canonical', baseUrl),
  }
}

/** The first HTML `<title>`, as `document.title` reads it. */
function pageTitle(document: Document): string | null {
  const title = qsa(document, 'title').find((el) => el.closest('svg') === null)
  return title === undefined ? null : declared(textOf(title).replace(ASCII_WHITESPACE, ' '))
}

/** The first non-empty `<meta name=...>` of that name. */
function metaNamed(metas: readonly Element[], name: string): string | null {
  for (const meta of metas) {
    if (attribute(meta, 'name')?.trim().toLowerCase() !== name) continue
    const value = declared(attribute(meta, 'content'))
    if (value !== null) return value
  }
  return null
}

/**
 * The root's lang attribute; without one, the Content-Language pragma, which
 * HTML applies only then (the last valid one wins). `lang=""` declares the
 * language unknown, so it gives null and the pragma is not read.
 */
function pageLanguage(document: Document, metas: readonly Element[]): string | null {
  const root = document.documentElement
  const lang = root !== null && root.tagName === 'HTML' ? attribute(root, 'lang') : null
  if (lang !== null) return declared(lang)
  let pragma: string | null = null
  for (const meta of metas) {
    if (attribute(meta, 'http-equiv')?.trim().toLowerCase() !== 'content-language') continue
    const content = attribute(meta, 'content') ?? ''
    if (content.includes(',')) continue
    pragma = declared(content)?.split(ASCII_WHITESPACE)[0] ?? pragma
  }
  return pragma
}

/** The first `<link>` with this rel token whose href resolves, against the base URL, to an http(s) URL. */
function linkedUrl(links: readonly Element[], rel: string, baseUrl: string | null): string | null {
  for (const link of links) {
    if (!(attribute(link, 'rel') ?? '').toLowerCase().split(ASCII_WHITESPACE).includes(rel)) continue
    const href = declared(attribute(link, 'href'))
    if (href === null) continue
    try {
      const url = new URL(href, baseUrl ?? undefined)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    } catch {
      // A relative href with no base URL, or one that does not parse, is not reported.
    }
  }
  return null
}

/** An attribute matched by name case-insensitively, as HTML does; linkedom keeps the source's case. */
function attribute(el: Element, name: string): string | null {
  const value = el.getAttribute(name)
  if (value !== null) return value
  for (const attr of Array.from(el.attributes)) if (attr.name.toLowerCase() === name) return attr.value
  return null
}

/** The value without surrounding whitespace, or null when nothing is left. */
function declared(value: string | null): string | null {
  const trimmed = value?.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '') ?? ''
  return trimmed.length > 0 ? trimmed : null
}
