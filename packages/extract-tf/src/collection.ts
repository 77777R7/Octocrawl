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
const SECONDARY_NAME = /(?:^|[\s_-])(?:sidebar|side-bar|rail|secondary|related|recommend(?:ed|ations?)?|most-(?:read|popular|viewed|shared)|trending|popular|promo(?:ted|tion)?|sponsor(?:ed)?|partner|paid|advert(?:isement|orial)?s?)(?:$|[\s_-])/i
/** Headings of what a news page shows beside its own collection: recommendations, rankings, paid and partner content, other sections. */
const SECONDARY_HEADING = /^(?:recommended|related|popular|trending|promoted|sponsored|advertisement|advertorial|partner content|paid (?:content|post)|from our partners|editor'?s picks|recently viewed|you may (?:also )?like|more from|most (?:read|popular|viewed|shared|commented))\b/i

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

/** The most places a card's long links may go: its story, and its topic's page. */
const MAX_CARD_TARGETS = 2

/**
 * A card: one story, with a heading or a paragraph and links long enough to
 * name it; not a layout wrapper holding several stories (or a ranking, or an
 * advert beside them). It has at most one heading, and its long links go to
 * its story and at most one other page (a topic tag).
 */
function contentCard(el: Element): boolean {
  if (el.querySelector('p,h2,h3,h4,h5,h6,[role="heading"]') === null || qsa(el, 'h1,h2,h3,h4,h5,h6,[role="heading"]').length > 1) return false
  const targets = new Set(qsa(el, 'a[href]').filter((a) => textOf(a).trim().length >= MIN_LINK_CHARS).map((a) => a.getAttribute('href')!.trim()))
  return targets.size >= 1 && targets.size <= MAX_CARD_TARGETS
}

const KEEP = 'data-w2l-collection-keep'

/**
 * The list widened to the lead cards before it, as a detached copy of their
 * common ancestor holding the cards, the list, the paths to them and the
 * section headings on those paths, and nothing else; null when there are no
 * such cards. The page itself is left as it was: the checks that read it
 * after this (rendering signals, confidence, labelled values) see the page and
 * the list as before, and only the content written out is wider.
 */
export function includeCollectionLeads(list: Element): Element | null {
  if (!list.matches('ul,ol') || list.closest('article') !== null) return null
  const scope = list.closest('main,[role="main"]')
  const cache = new Map<Element, boolean>()
  if (scope === null || secondary(list, scope, cache)) return null
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
  if (repeated.size === 0) return null
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
  if (leads.length === 0) return null
  let region: Element = list
  for (const lead of leads) {
    if (region.contains(lead)) continue
    const shared = commonAncestor(region, lead)
    if (shared === null || !scope.contains(shared)) return null
    region = shared
  }
  // Mark what stays (the cards and the list whole, the paths to them), copy the region, and prune the copy by the marks.
  const marked: Element[] = []
  const mark = (el: Element, how: string) => {
    if (el.getAttribute(KEEP) === 'root') return
    el.setAttribute(KEEP, how)
    marked.push(el)
  }
  for (const root of [list, ...leads]) {
    mark(root, 'root')
    for (let up = root.parentElement; up !== null; up = up.parentElement) {
      mark(up, 'path')
      if (up === region) break
    }
  }
  const copy = region.cloneNode(true) as Element
  for (const el of marked) el.removeAttribute(KEEP)
  const pending: Element[] = [copy]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const how = node.getAttribute(KEEP)
    node.removeAttribute(KEEP)
    if (how === 'root') {
      for (const el of qsa(node, `[${KEEP}]`)) el.removeAttribute(KEEP)
      continue
    }
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1 && (child as Element).hasAttribute(KEEP)) pending.push(child as Element)
      // A section's own heading ("News", "Opinion") stays with its cards.
      else if (child.nodeType !== 1 || !(child as Element).matches('h1,h2,h3,h4,h5,h6')) child.parentNode?.removeChild(child)
    }
  }
  return copy
}
