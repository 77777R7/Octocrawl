import { commonAncestor, qsa, tagOf, textOf } from './dom.js'
import { hiddenRegion } from './main.js'
import { isRecommendationHeading } from './prune.js'

const CARD_TAGS = 'article,div,section'
const SECONDARY_NAME = /(?:^|[\s_-])(?:sidebar|side-bar|related|recommend(?:ed|ations?)?|most-read)(?:$|[\s_-])/i
const SECONDARY_HEADING = /^(?:recommended|related|popular)(?:\s+(?:stories|articles|news))?$|^most\s+read$/i

function secondary(el: Element, scope: Element, cache: Map<Element, boolean>): boolean {
  if (hiddenRegion(el)) return true
  const visited: Element[] = []
  const remember = (value: boolean): boolean => {
    for (const node of visited) cache.set(node, value)
    return value
  }
  for (let up: Element | null = el; up !== null && up !== scope; up = up.parentElement) {
    const previous = cache.get(up)
    if (previous !== undefined) return remember(previous)
    visited.push(up)
    if (up.matches('aside,header,nav,footer,[role="complementary"],[role="navigation"],[role="contentinfo"]')) return remember(true)
    const names = `${up.id} ${up.className}`.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    if (SECONDARY_NAME.test(names)) return remember(true)
    const heading = Array.from(up.children).find(child => child.matches('h2,h3,[role="heading"]'))
    if (heading && (isRecommendationHeading(textOf(heading)) || SECONDARY_HEADING.test(textOf(heading).trim()))) return remember(true)
  }
  return remember(false)
}

/** A card with a linked name and a heading or description, rather than a layout or image wrapper. */
function contentCard(el: Element): boolean {
  return el.querySelector('p,h2,h3,h4,h5,h6,[role="heading"]') !== null &&
    qsa(el, 'a[href]').some(a => textOf(a).trim().length >= 20)
}

/**
 * A news collection can have lead cards beside its longer chronological ul.
 * Keep only preceding cards of a template repeated in at least three list
 * items, inside the same semantic main. Do not widen to the whole page or
 * include following sections, sidebars or recommendations. The cleaned DOM
 * is already subject to the caller's exclusions; no source nodes are restored.
 */
export function includeCollectionLeads(list: Element): Element {
  if (!list.matches('ul,ol') || list.closest('article') !== null) return list
  const scope = list.closest('main,[role="main"]')
  const secondaryCache = new Map<Element, boolean>()
  if (!scope || secondary(list, scope, secondaryCache)) return list
  const items = qsa(list, ':scope > li')
  const templates = new Map<string, { tag: string; name: string; items: Set<Element> }>()
  for (const item of items) for (const el of qsa(item, CARD_TAGS).filter(contentCard)) {
    const tag = tagOf(el)
    for (const name of Array.from(el.classList)) {
      const key = `${tag}\u0000${name}`
      const template = templates.get(key) ?? { tag, name, items: new Set<Element>() }
      template.items.add(item)
      templates.set(key, template)
    }
  }
  const repeated = new Map<string, Set<string>>()
  for (const { tag, name, items } of templates.values()) if (items.size >= 3) {
    const names = repeated.get(tag) ?? new Set<string>()
    names.add(name)
    repeated.set(tag, names)
  }
  if (repeated.size === 0) return list
  const all = qsa(scope, '*')
  const preceding = all.slice(0, all.indexOf(list))
  const matches = preceding.filter(el => !el.contains(list) &&
    Array.from(el.classList).some(name => repeated.get(tagOf(el))?.has(name)) &&
    contentCard(el) && !secondary(el, scope, secondaryCache))
  const matched = new Set(matches)
  const leads = matches.filter(el => {
    for (let up = el.parentElement; up !== null && up !== scope; up = up.parentElement) if (matched.has(up)) return false
    return true
  })
  if (leads.length === 0) return list
  let region = list
  for (const lead of leads) {
    if (region.contains(lead)) continue
    const shared = commonAncestor(region, lead)
    if (shared === null || !scope.contains(shared)) return list
    region = shared
  }
  // Preserve the original nodes so confidence, loading and field evidence
  // still inspect the same selected DOM, rather than a disconnected clone.
  const roots = new Set([list, ...leads])
  const paths = new Set<Element>()
  for (const root of roots) for (let up: Element | null = root; up !== null; up = up.parentElement) {
    paths.add(up)
    if (up === region) break
  }
  const pending = [region]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (roots.has(node)) continue
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1 && paths.has(child as Element)) pending.push(child as Element)
      else child.parentNode?.removeChild(child)
    }
  }
  return region
}
