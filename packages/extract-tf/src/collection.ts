/**
 * The lead cards of a news collection. A section page shows its lead story and
 * a few top cards above a longer chronological list of the same cards; the
 * list strategy picks the list and leaves the cards above it out. They are put
 * back only when they are the page's own: cards of the template the list's
 * items repeat, before the list, inside the same main, and not in a sidebar,
 * a navigation, a recommendation or promoted section. Nothing is matched by
 * host. The tree is already cleaned and the caller's exclusions are gone, so
 * no excluded card comes back.
 */

import { commonAncestor, qsa, tagOf, textOf } from './dom.js'
import { hiddenRegion } from './main.js'
import { isRecommendationHeading } from './prune.js'

const CARD_TAGS = 'article,div,section'
/** How many of the list's items a card template must appear in. */
const MIN_REPEATS = 3
/** A card's link names a story: at least this many characters. */
const MIN_LINK_CHARS = 20
const SECONDARY_NAME = /(?:^|[\s_-])(?:sidebar|side-bar|related|recommend(?:ed|ations?)?|most-read|promoted|sponsored|advert(?:isement)?s?)(?:$|[\s_-])/i
const SECONDARY_HEADING = /^(?:recommended|related|popular|promoted|sponsored)(?:\s+(?:stories|articles|news|content))?$|^most\s+(?:read|popular|viewed)$/i

/** Whether an element sits, below `scope`, in a hidden, navigation, sidebar, recommendation or promoted region (memoized per ancestor). */
function secondary(el: Element, scope: Element, cache: Map<Element, boolean>): boolean {
  if (hiddenRegion(el)) return true
  const visited: Element[] = []
  const remember = (value: boolean): boolean => {
    for (const node of visited) cache.set(node, value)
    return value
  }
  for (let up: Element | null = el; up !== null && up !== scope; up = up.parentElement) {
    const known = cache.get(up)
    if (known !== undefined) return remember(known)
    visited.push(up)
    if (up.matches('aside,header,nav,footer,[role="complementary"],[role="navigation"],[role="contentinfo"]')) return remember(true)
    // Class names split at camel case too: `mostRead` reads as `most-Read`.
    if (SECONDARY_NAME.test(`${up.id} ${up.getAttribute('class') ?? ''}`.replace(/([a-z0-9])([A-Z])/g, '$1-$2'))) return remember(true)
    const heading = Array.from(up.children).find((child) => child.matches('h2,h3,[role="heading"]'))
    if (heading !== undefined) {
      const text = textOf(heading).replace(/\s+/g, ' ').trim()
      if (isRecommendationHeading(text) || SECONDARY_HEADING.test(text)) return remember(true)
    }
  }
  return remember(false)
}

/** A card: a heading or a paragraph, and a link long enough to name a story; not a layout or image wrapper. */
function contentCard(el: Element): boolean {
  return el.querySelector('p,h2,h3,h4,h5,h6,[role="heading"]') !== null &&
    qsa(el, 'a[href]').some((a) => textOf(a).trim().length >= MIN_LINK_CHARS)
}

/**
 * The list widened to the lead cards before it, as one region holding the
 * cards and the list and nothing else; the list itself when there are none.
 * The region keeps the original nodes and the headings beside them, and drops
 * the rest of their common ancestor, so confidence and field evidence read the
 * same DOM.
 */
export function includeCollectionLeads(list: Element): Element {
  if (!list.matches('ul,ol') || list.closest('article') !== null) return list
  const scope = list.closest('main,[role="main"]')
  const cache = new Map<Element, boolean>()
  if (scope === null || secondary(list, scope, cache)) return list
  // Card templates (tag and class) and the list items each appears in.
  const templates = new Map<string, Set<Element>>()
  for (const item of qsa(list, ':scope > li')) {
    for (const card of qsa(item, CARD_TAGS).filter(contentCard)) {
      for (const name of Array.from(card.classList)) {
        const key = `${tagOf(card)} ${name}`
        templates.set(key, (templates.get(key) ?? new Set()).add(item))
      }
    }
  }
  const repeated = new Set([...templates].filter(([, items]) => items.size >= MIN_REPEATS).map(([key]) => key))
  if (repeated.size === 0) return list
  const all = qsa(scope, '*')
  const before = all.slice(0, all.indexOf(list))
  const cards = new Set(before.filter((el) => !el.contains(list) &&
    Array.from(el.classList).some((name) => repeated.has(`${tagOf(el)} ${name}`)) &&
    contentCard(el) && !secondary(el, scope, cache)))
  // The outermost cards: a card inside another is part of it.
  const leads = [...cards].filter((el) => {
    for (let up = el.parentElement; up !== null && up !== scope; up = up.parentElement) if (cards.has(up)) return false
    return true
  })
  if (leads.length === 0) return list
  let region: Element = list
  for (const lead of leads) {
    if (region.contains(lead)) continue
    const shared = commonAncestor(region, lead)
    if (shared === null || !scope.contains(shared)) return list
    region = shared
  }
  const roots = new Set<Element>([list, ...leads])
  const paths = new Set<Element>()
  for (const root of roots) {
    for (let up: Element | null = root; up !== null; up = up.parentElement) {
      paths.add(up)
      if (up === region) break
    }
  }
  const pending: Element[] = [region]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (roots.has(node)) continue
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1 && paths.has(child as Element)) pending.push(child as Element)
      // A section's own heading ("News", "Opinion") stays with its cards.
      else if (child.nodeType !== 1 || !(child as Element).matches('h1,h2,h3,h4,h5,h6')) child.parentNode?.removeChild(child)
    }
  }
  return region
}
