import { commonAncestor, qsa, tagOf, textOf } from './dom.js'
import { hiddenRegion } from './main.js'
import { isRecommendationHeading } from './prune.js'

const CARD_TAGS = 'article,div,section'
const SECONDARY_NAME = /(?:^|[\s_-])(?:sidebar|side-bar|related|recommend(?:ed|ations?)?|most-read)(?:$|[\s_-])/i
const SECONDARY_HEADING = /^(?:recommended|related|popular)(?:\s+(?:stories|articles|news))?$|^most\s+read$/i

function secondary(el: Element, scope: Element): boolean {
  for (let up: Element | null = el; up !== null && up !== scope; up = up.parentElement) {
    if (up.matches('aside,header,nav,footer,[role="complementary"],[role="navigation"],[role="contentinfo"]')) return true
    const names = `${up.id} ${up.className}`.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    if (SECONDARY_NAME.test(names)) return true
    const heading = up.querySelector(':scope > h2,:scope > h3,:scope > [role="heading"]')
    if (heading && (isRecommendationHeading(textOf(heading)) || SECONDARY_HEADING.test(textOf(heading).trim()))) return true
  }
  return hiddenRegion(el)
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
  if (!scope || secondary(list, scope)) return list
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
  const repeated = [...templates.values()].filter(template => template.items.size >= 3)
  if (repeated.length === 0) return list
  const all = qsa(scope, '*')
  const preceding = all.slice(0, all.indexOf(list))
  const matches = preceding.filter(el => !el.contains(list) &&
    repeated.some(({ tag, name }) => tagOf(el) === tag && el.classList.contains(name)) &&
    contentCard(el) && !secondary(el, scope))
  const leads = matches.filter(el => !matches.some(other => other !== el && other.contains(el)))
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
  const roots = [list, ...leads]
  function keepSelected(node: Element): void {
    if (roots.includes(node)) return
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1 && roots.some(root => child === root || (child as Element).contains(root))) keepSelected(child as Element)
      else child.parentNode?.removeChild(child)
    }
  }
  keepSelected(region)
  return region
}
