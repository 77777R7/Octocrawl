/**
 * Head metadata: what the page says about itself. Read from the raw
 * document before cleaning, because cleaning drops the head. Every value is
 * null when the page does not state it; nothing is guessed from the body.
 */

import type { PageMetadata } from '@w2l/contracts'
import { qs, qsa } from './dom.js'

function collapse(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text : null
}

function metaContent(doc: Document, name: string): string | null {
  for (const el of qsa(doc, 'meta[name]')) {
    if ((el.getAttribute('name') ?? '').trim().toLowerCase() === name) return collapse(el.getAttribute('content'))
  }
  return null
}

function linkWithRel(doc: Document, rel: string): Element | null {
  for (const el of qsa(doc, 'link[rel]')) {
    const rels = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (rels.includes(rel) && collapse(el.getAttribute('href')) !== null) return el
  }
  return null
}

function resolveHref(href: string | null, base: string | null): string | null {
  const value = collapse(href)
  if (value === null) return null
  try {
    return base === null ? new URL(value).href : new URL(value, base).href
  } catch {
    return null
  }
}

export function readPageMetadata(doc: Document, url?: string): PageMetadata {
  const baseHref = collapse(qs(doc, 'base[href]')?.getAttribute('href'))
  const base = resolveHref(baseHref, url ?? null) ?? url ?? null
  const contentLanguage = qsa(doc, 'meta[http-equiv]').find((el) => (el.getAttribute('http-equiv') ?? '').trim().toLowerCase() === 'content-language')
  const keywords = metaContent(doc, 'keywords')
  return {
    title: collapse(qs(doc, 'title')?.textContent),
    description: metaContent(doc, 'description'),
    language: collapse(doc.documentElement?.getAttribute('lang')) ?? collapse(contentLanguage?.getAttribute('content')),
    keywords: keywords === null ? null : keywords.split(',').map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0),
    robots: metaContent(doc, 'robots'),
    canonical: resolveHref(linkWithRel(doc, 'canonical')?.getAttribute('href') ?? null, base),
    favicon: resolveHref(linkWithRel(doc, 'icon')?.getAttribute('href') ?? null, base),
  }
}
