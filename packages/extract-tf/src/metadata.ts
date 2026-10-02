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
    ...openGraph(metas, baseUrl),
    ...dublinCore(metas),
    ...article(metas),
  }
}

/** The Open Graph fields a page states (Firecrawl's names), each present only then. */
const OG_FIELDS: ReadonlyArray<[keyof PageMetadata, readonly string[], boolean]> = [
  ['ogTitle', ['og:title'], false],
  ['ogDescription', ['og:description'], false],
  ['ogUrl', ['og:url'], true],
  ['ogImage', ['og:image', 'og:image:secure_url', 'og:image:url'], true],
  ['ogAudio', ['og:audio'], true],
  ['ogVideo', ['og:video', 'og:video:secure_url', 'og:video:url'], true],
  ['ogDeterminer', ['og:determiner'], false],
  ['ogLocale', ['og:locale'], false],
  ['ogSiteName', ['og:site_name'], false],
]

/**
 * `<meta property="og:…">`, then `<meta name="og:…">`, the property matched
 * case-insensitively; the first tag with content wins, except that every
 * `og:locale:alternate` is collected. A URL field is resolved against the
 * document base URL when it parses, else kept as written.
 */
function openGraph(metas: readonly Element[], baseUrl: string | null): Partial<PageMetadata> {
  const out: Partial<Record<keyof PageMetadata, string | readonly string[]>> = {}
  for (const [field, names, isUrl] of OG_FIELDS) {
    for (const name of names) {
      const value = metaProperty(metas, name)
      if (value === null) continue
      out[field] = isUrl ? resolvedUrl(value, baseUrl) : value
      break
    }
  }
  const alternates = metaProperties(metas, 'og:locale:alternate')
  if (alternates.length > 0) out.ogLocaleAlternate = alternates
  return out as Partial<PageMetadata>
}

/** Dublin Core element and term names, each read from `<meta name>` (matched case-insensitively), first non-empty occurrence. */
const DC_FIELDS: ReadonlyArray<[keyof PageMetadata, string]> = [
  ['dcTermsCreated', 'dcterms.created'],
  ['dcDateCreated', 'dc.date.created'],
  ['dcDate', 'dc.date'],
  ['dcTermsType', 'dcterms.type'],
  ['dcType', 'dc.type'],
  ['dcTermsAudience', 'dcterms.audience'],
  ['dcTermsSubject', 'dcterms.subject'],
  ['dcSubject', 'dc.subject'],
  ['dcDescription', 'dc.description'],
  ['dcTermsKeywords', 'dcterms.keywords'],
]

function dublinCore(metas: readonly Element[]): Partial<PageMetadata> {
  const out: Partial<Record<keyof PageMetadata, string>> = {}
  for (const [field, name] of DC_FIELDS) {
    const value = metaNamed(metas, name)
    if (value !== null) out[field] = collapse(value)
  }
  return out as Partial<PageMetadata>
}

/** `article:published_time`, `article:modified_time` and `article:section` (property, then name), and every `article:tag`; times as written. */
function article(metas: readonly Element[]): Partial<PageMetadata> {
  const out: Partial<Record<keyof PageMetadata, string | readonly string[]>> = {}
  const published = metaProperty(metas, 'article:published_time')
  if (published !== null) out.publishedTime = published
  const modified = metaProperty(metas, 'article:modified_time')
  if (modified !== null) out.modifiedTime = modified
  const section = metaProperty(metas, 'article:section')
  if (section !== null) out.articleSection = section
  const tags = metaProperties(metas, 'article:tag')
  if (tags.length > 0) out.articleTag = tags
  return out as Partial<PageMetadata>
}

/** The first non-empty `<meta property=…>` of that name, else the first non-empty `<meta name=…>`, content collapsed. */
function metaProperty(metas: readonly Element[], name: string): string | null {
  return metaProperties(metas, name)[0] ?? null
}

/** Every non-empty `<meta property=…>` of that name in document order, then every `<meta name=…>`, contents collapsed. */
function metaProperties(metas: readonly Element[], name: string): string[] {
  const values: string[] = []
  for (const key of ['property', 'name'] as const) {
    for (const meta of metas) {
      if (attribute(meta, key)?.trim().toLowerCase() !== name) continue
      const value = declared(attribute(meta, 'content'))
      if (value !== null) values.push(collapse(value))
    }
  }
  return values
}

/** The value against the document base URL when both parse, else as written. */
function resolvedUrl(value: string, baseUrl: string | null): string {
  try {
    return new URL(value, baseUrl ?? undefined).href
  } catch {
    return value
  }
}

/** Runs of ASCII whitespace as one space. */
function collapse(value: string): string {
  return value.replace(ASCII_WHITESPACE, ' ')
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
