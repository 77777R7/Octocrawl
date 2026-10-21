/**
 * Values the page's markup declares about the work it shows, for JSON
 * extraction (see DeclaredValue): its Highwire Press `citation_*` meta tags
 * and the schema.org article nodes of its JSON-LD. Read from the whole
 * document before cleaning, which removes scripts. Each value is as written,
 * whitespace collapsed; nothing is inferred from the content or another tag.
 */

import type { DeclaredValue } from '@w2l/contracts'
import { qsa } from './dom.js'

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** The article properties read from JSON-LD, as schema.org names them. */
const ARTICLE_PROPERTIES = ['headline', 'name', 'datePublished', 'dateModified', 'description'] as const

/** schema.org's Article and its subtypes (NewsArticle, ScholarlyArticle, …), BlogPosting and Report. */
function articleType(node: Record<string, unknown>): string | null {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  for (const type of types) {
    if (typeof type !== 'string') continue
    const short = /[^/#]*$/.exec(type.trim())?.[0] ?? ''
    if (/Article$/.test(short) || ['BlogPosting', 'LiveBlogPosting', 'Report'].includes(short)) return short
  }
  return null
}

/** The nodes of a JSON-LD document: the top level, a top-level array, and `@graph`; not the nodes nested in their properties. */
function topNodes(parsed: unknown): Record<string, unknown>[] {
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return []
    const node = item as Record<string, unknown>
    return Array.isArray(node['@graph']) ? [node, ...topNodes(node['@graph'])] : [node]
  })
}

function citationTags(document: Document): DeclaredValue[] {
  const byName = new Map<string, string[]>()
  for (const meta of qsa(document, 'meta[name]')) {
    const name = (meta.getAttribute('name') ?? '').trim().toLowerCase()
    if (!name.startsWith('citation_')) continue
    const value = collapse(meta.getAttribute('content') ?? '')
    if (value.length === 0) continue
    byName.set(name, [...(byName.get(name) ?? []), value])
  }
  return [...byName].map(([name, values]) => ({ name, values, source: 'meta', path: `meta[name="${name}"]` }))
}

/** One value per property of each article node: two articles that state a property differently are told apart by their paths. */
function articleProperties(document: Document): DeclaredValue[] {
  const out: DeclaredValue[] = []
  for (const [index, script] of qsa(document, 'script[type="application/ld+json"]').entries()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(script.textContent ?? '')
    } catch {
      continue // Malformed JSON-LD is not evidence.
    }
    for (const node of topNodes(parsed)) {
      const type = articleType(node)
      if (type === null) continue
      // What every value of the node holds for: the version and dates the node states (DeclaredValue.context).
      const stated = (key: string): string => (typeof node[key] === 'string' || typeof node[key] === 'number' ? collapse(String(node[key])) : '')
      const context = Object.fromEntries(([['version', 'version'], ['published', 'datePublished'], ['revised', 'dateModified']] as const)
        .map(([as, key]) => [as, stated(key)] as const).filter(([, value]) => value.length > 0))
      for (const name of ARTICLE_PROPERTIES) {
        const raw = node[name]
        const value = typeof raw === 'string' ? collapse(raw) : ''
        if (value.length > 0) out.push({ name, values: [value], source: 'jsonld', path: `ld+json[${index}] ${type}.${name}`, ...(Object.keys(context).length > 0 ? { context } : {}) })
      }
    }
  }
  return out
}

export function collectDeclaredValues(document: Document): DeclaredValue[] {
  return [...citationTags(document), ...articleProperties(document)]
}
