/**
 * Finding the list a page is made of, for a `list` format that names no
 * itemSelector. Elements that repeat beside each other, with the same tag and
 * classes under parents and grandparents of the same tag and classes, are a
 * candidate list (one list may span several parents: a grid's rows). A
 * candidate's itemSelector is the parent's step, `>`, and the items' step,
 * climbing the ancestors when that names more than the list; the candidate is
 * what that selector matches, since that is what will be read. Candidates are
 * scored by how many items they have, how much text the items hold and how
 * alike the items are inside. A list in a site's navigation (nav, header,
 * footer, aside, a menu's role) or hidden is never the page's list, and no
 * item of one is read as a record; a menu by its class (a menu, a dropdown,
 * tabs, pagination), or items that are one short link each, count for little.
 *
 * A candidate's fields are what most of its items hold, at the same path
 * inside them: an element's own text, a link's text and target, an image's
 * source. A text every item has the same (a label, a button) is not a field.
 * Each field's selector is the shortest tail of its path that finds, in every
 * item holding it, the element at that path, and nothing in the items that do
 * not; a path no selector finds that way is left out. Names come from a
 * field's class, `price` for a sum of money, else its kind; never one of the
 * CSV's own columns. The selectors stay within what a request may send back
 * (200 characters each, MAX_SELECTOR_PARTS in all).
 *
 * The work is bounded by the page, whatever its shape: steps and class sets
 * are read once per element, and the matching done to name groups and to try
 * fields stops at a fixed budget (WORK_BUDGET), the largest groups first.
 * Deterministic, no model.
 */

import type { ListField } from '@w2l/contracts'
import { parse, qsa } from './dom.js'
import { textOf } from './list.js'
import { invalidSelector, MAX_SELECTOR_PARTS, namedBy, selectorParts } from './selectors.js'

export interface ListCandidate {
  itemSelector: string
  /** The items itemSelector names on the page (none inside another). */
  count: number
  score: number
  fields: ListField[]
}

/** The fewest items a list needs to be one. */
const MIN_ITEMS = 3
/** A path inside the items is a field when this share of them holds it. */
const FIELD_SHARE = 0.6
const MAX_FIELDS = 12
/** How deep inside an item fields are looked for. */
const MAX_DEPTH = 6
/** The items a candidate's score and fields are read from; a longer list is read from its first ones. */
const SAMPLE = 200
/** The most groups named and scored, the largest first. */
const MAX_GROUPS = 60
/** How many ancestors an itemSelector climbs to tell its items from others. */
const MAX_CLIMB = 8
/** The most paths read inside one item, and the most common paths tried as fields. */
const MAX_PATHS = 300
const MAX_FIELD_PATHS = 48
/** The classes of an element read: a class attribute of thousands is read as its first ones. */
const MAX_CLASSES = 8
/** The classes an item's own selector step names. */
const ITEM_STEP_CLASSES = 3
/** The element-step tests one naming of the groups, and one candidate's fields, may cost. */
const WORK_BUDGET = 3_000_000
/** What a request may send back: a selector's characters. */
const MAX_SELECTOR_CHARS = 200
/** A tag a selector can name: not a namespaced one (Word's `o:p`), which the extractor would read as a pseudo-class. */
const NAMEABLE_TAG = /^[a-z][a-z0-9-]*$/
/** The CSV's own columns: no field takes their names. */
const RESERVED_NAMES: readonly string[] = ['source_url', 'page', 'index']
const SIMPLE_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/
const NAVIGATION_TAGS: ReadonlySet<string> = new Set(['NAV', 'HEADER', 'FOOTER', 'ASIDE'])
const MENU_ROLES: ReadonlySet<string> = new Set(['navigation', 'menu', 'menubar', 'listbox', 'tablist', 'tree'])
const MENU_CLASS = /(?:^|[-_])(?:nav|navbar|menu|dropdown|breadcrumbs?|pagination|pager|tabs)(?:[-_]|$)/i
const NOT_CONTENT: ReadonlySet<string> = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'HR'])
/** Elements that are part of a record, never one: an article's paragraphs and headings, a row's cells, a table's sections, a select's options. */
const NOT_ITEM: ReadonlySet<string> = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'THEAD', 'TBODY', 'TFOOT', 'CAPTION', 'COL', 'COLGROUP', 'OPTION', 'OPTGROUP', 'SOURCE', 'TRACK'])
const IMAGE_SOURCES: readonly string[] = ['src', 'data-src', 'data-original', 'data-lazy-src']
const MONEY = /^(?:[$€£¥₹]|USD|EUR|GBP)\s?\d[\d.,\s]*$|^\d[\d.,\s]*\s?(?:[$€£¥₹]|USD|EUR|GBP|元)$/

/** What one detection reads of each element once, and the work it has done. */
class Reading {
  work = 0
  private readonly classes = new Map<Element, string[]>()
  private readonly classSets = new Map<Element, Set<string>>()
  private readonly signatures = new Map<Element, string>()
  private readonly navigation = new Map<Element, boolean>()
  private readonly parsed = new Map<string, { tag: string; classes: string[]; id: string | null }>()

  get spent(): boolean {
    return this.work > WORK_BUDGET
  }

  /** An element's classes W2L can name, in the order written, at most MAX_CLASSES. */
  classesOf(el: Element): string[] {
    let classes = this.classes.get(el)
    if (classes === undefined) {
      classes = []
      for (const name of (el.getAttribute('class') ?? '').split(/\s+/)) {
        if (SIMPLE_NAME.test(name) && !classes.includes(name)) classes.push(name)
        if (classes.length >= MAX_CLASSES) break
      }
      this.classes.set(el, classes)
    }
    return classes
  }

  /** An element's tag and classes, sorted: what groups it with its like. */
  signature(el: Element): string {
    let signature = this.signatures.get(el)
    if (signature === undefined) this.signatures.set(el, signature = [el.tagName.toLowerCase(), ...[...this.classesOf(el)].sort()].join('.'))
    return signature
  }

  /** One selector step: the id when `useId` and usable; else the tag and up to `classes` classes as written. */
  step(el: Element, classes: number, useId = false): string {
    if (useId && el.id !== '' && SIMPLE_NAME.test(el.id)) return `#${el.id}`
    return [el.tagName.toLowerCase(), ...this.classesOf(el).slice(0, classes)].join('.')
  }

  /** Whether an element is in a site's navigation, or hidden, itself or by an ancestor below <body>. */
  inNavigation(el: Element): boolean {
    const chain: Element[] = []
    let answer = false
    for (let up: Element | null = el; up !== null && up.tagName !== 'BODY' && up.tagName !== 'HTML'; up = up.parentElement) {
      const known = this.navigation.get(up)
      if (known !== undefined) { answer = known; break }
      chain.push(up)
      if (menuKind(up, this) === 'navigation') { answer = true; break }
    }
    for (const up of chain) this.navigation.set(up, answer)
    return answer
  }

  /** Whether an element fits one step as the extractor matches it: `#id`, or `tag.class...` with every class among its own. */
  fits(el: Element, step: string): boolean {
    this.work++
    let parts = this.parsed.get(step)
    if (parts === undefined) {
      const [tag, ...classes] = step.split('.')
      this.parsed.set(step, parts = step.startsWith('#') ? { tag: '', classes: [], id: step.slice(1) } : { tag: tag!, classes, id: null })
    }
    if (parts.id !== null) return el.id === parts.id
    if (el.tagName.toLowerCase() !== parts.tag) return false
    if (parts.classes.length === 0) return true
    let own = this.classSets.get(el)
    if (own === undefined) this.classSets.set(el, own = new Set((el.getAttribute('class') ?? '').split(/\s+/)))
    return parts.classes.every((name) => own.has(name))
  }

  /** Whether an element fits steps joined by `>`, the last one its own. */
  fitsChain(el: Element, steps: readonly string[]): boolean {
    let at: Element | null = el
    for (let i = steps.length - 1; i >= 0; i--, at = at.parentElement) if (at === null || !this.fits(at, steps[i]!)) return false
    return true
  }
}

/** The page's lists, best first: at most `limit` candidates. */
export function detectLists(html: string, limit = 3): ListCandidate[] {
  const doc = parse(html)
  const document = doc.document
  const root = document.body ?? document.documentElement
  const reading = new Reading()
  const scored: Array<{ itemSelector: string; items: Element[]; nested: number; score: number }> = []
  if (root !== null) {
    // Elements grouped by their grandparent's, their parent's and their own tag and classes (the rows of one kind of table, not of
    // every table); a group is a list when some parent holds two or more of it. Navigation is never a list, nor part of one.
    const groups = new Map<string, { items: Element[]; repeats: boolean; parents: Set<Element> }>()
    const all = [root, ...qsa(root, '*')]
    const byTag = new Map<string, Element[]>()
    for (const el of all) {
      const tag = el.tagName.toLowerCase()
      const same = byTag.get(tag)
      if (same === undefined) byTag.set(tag, [el])
      else same.push(el)
    }
    for (const parent of all) {
      if (parent.children.length < 2 || reading.inNavigation(parent)) continue
      const above = `${parent.parentElement === null ? '' : reading.signature(parent.parentElement)} > ${reading.signature(parent)} > `
      const here = new Map<string, number>()
      for (const child of Array.from(parent.children)) {
        if (NOT_CONTENT.has(child.tagName) || NOT_ITEM.has(child.tagName) || reading.inNavigation(child)) continue
        const key = above + reading.signature(child)
        let group = groups.get(key)
        if (group === undefined) groups.set(key, group = { items: [], repeats: false, parents: new Set<Element>() })
        group.items.push(child)
        group.parents.add(parent)
        const count = (here.get(key) ?? 0) + 1
        here.set(key, count)
        if (count >= 2) group.repeats = true
      }
    }
    // The largest groups first, until the budget is spent.
    const lists = [...groups.values()].filter((group) => group.repeats && group.items.length >= MIN_ITEMS).sort((a, b) => b.items.length - a.items.length).slice(0, MAX_GROUPS)
    const seen = new Set<string>()
    const byStep = new Map<string, Element[]>()
    for (const group of lists) {
      if (reading.spent) break
      const named = selectorFor(reading, byTag, byStep, group.items, group.parents)
      if (named === null || seen.has(named.selector)) continue
      seen.add(named.selector)
      const score = scoreList(reading, named.items)
      if (score !== null) scored.push({ itemSelector: named.selector, items: named.items, nested: named.nested, score })
    }
  }
  // What is read is what the extractor's matcher names: a candidate it would read otherwise is left out.
  const best: ListCandidate[] = []
  for (const list of scored.sort((a, b) => b.score - a.score)) {
    if (best.length >= limit) break
    if (namedBy(document, [list.itemSelector]).size !== list.items.length + list.nested) continue
    best.push({ itemSelector: list.itemSelector, count: list.items.length, score: Math.round(list.score * 100) / 100, fields: fieldsOf(list.items, list.itemSelector) })
  }
  doc.close()
  return best
}

/** The fields the items an itemSelector names hold, as detectLists finds them; null when it names no item. */
export function detectFields(html: string, itemSelector: string): ListField[] | null {
  const doc = parse(html)
  const named = namedBy(doc.document, [itemSelector])
  const items = [...named].filter((el) => !hasAncestorIn(el, named))
  const fields = items.length === 0 ? null : fieldsOf(items, itemSelector)
  doc.close()
  return fields
}

/**
 * The selector for a group, and the items it names (none inside another;
 * `nested` counts those left out): the parent's tag and first class `>` the
 * items' tag and first classes, an ancestor's before it at a time while it
 * names more than the group, else the one that names the fewest more. A
 * selector that names an element in navigation is not one. An id is tried
 * only when classes do not tell the group apart, and only when the group has
 * one parent, so a selector never names one parent of several. Within
 * MAX_SELECTOR_CHARS.
 */
function selectorFor(reading: Reading, byTag: Map<string, Element[]>, byStep: Map<string, Element[]>, items: Element[], parents: Set<Element>): { selector: string; items: Element[]; nested: number } | null {
  const itemStep = reading.step(items[0]!, ITEM_STEP_CLASSES)
  // The elements the items' own step names, read once for every group that shares it.
  let among = byStep.get(itemStep)
  if (among === undefined) byStep.set(itemStep, among = (byTag.get(items[0]!.tagName.toLowerCase()) ?? []).filter((el) => reading.fits(el, itemStep)))
  let closest: { selector: string; items: Element[]; nested: number } | null = null
  // Classes first: an id is often generated, and differs on the next page.
  for (const useId of parents.size === 1 ? [false, true] : [false]) {
    const steps = [itemStep]
    let up: Element | null = items[0]!.parentElement
    for (let depth = 0; depth < MAX_CLIMB && up !== null && up.tagName !== 'HTML' && !reading.spent; depth++, up = up.parentElement) {
      steps.unshift(reading.step(up, 1, useId))
      const selector = steps.join(' > ')
      if (selector.length > MAX_SELECTOR_CHARS) break
      const named = new Set(among.filter((el) => reading.fitsChain(el, steps)))
      if (!items.every((el) => named.has(el))) break
      if ([...named].some((el) => reading.inNavigation(el))) continue
      const outer = [...named].filter((el) => !hasAncestorIn(el, named))
      const found = { selector, items: outer, nested: named.size - outer.length }
      if (named.size === items.length) return found
      // Else the selector that names the fewest more, the shortest of those.
      if (closest === null || named.size < closest.items.length + closest.nested) closest = found
      if (useId && up.id !== '' && SIMPLE_NAME.test(up.id)) break
    }
  }
  return closest
}

function hasAncestorIn(el: Element, set: Set<Element>): boolean {
  for (let up = el.parentElement; up !== null; up = up.parentElement) if (set.has(up)) return true
  return false
}

/** The paths inside an item, each its chain of tag.firstClass steps, at most MAX_DEPTH deep and MAX_PATHS many, with the first element at each; an element whose tag a selector cannot name is left out, and what is inside it. */
function innerPaths(reading: Reading, item: Element): Map<string, Element> {
  const paths = new Map<string, Element>()
  const walk = (el: Element, path: string, depth: number): void => {
    for (const child of Array.from(el.children)) {
      if (paths.size >= MAX_PATHS) return
      reading.work++
      if (NOT_CONTENT.has(child.tagName) || !NAMEABLE_TAG.test(child.tagName.toLowerCase())) continue
      const key = path === '' ? reading.step(child, 1) : `${path} > ${reading.step(child, 1)}`
      if (!paths.has(key)) paths.set(key, child)
      if (depth < MAX_DEPTH) walk(child, key, depth + 1)
    }
  }
  walk(item, '', 1)
  return paths
}

/** How much a group looks like the page's list: more items, more text in them, alike inside; a menu by its class counts for little. Null when its items hold no text. */
function scoreList(reading: Reading, all: Element[]): number | null {
  if (all.length < MIN_ITEMS) return null
  const items = all.slice(0, SAMPLE)
  const texts = items.map((item) => textOf(item) ?? '')
  reading.work += texts.reduce((sum, text) => sum + text.length, 0) / 10
  if (texts.filter((text) => text.length >= 2).length < MIN_ITEMS) return null
  const avgText = texts.reduce((sum, text) => sum + text.length, 0) / items.length
  const paths = items.map((item) => innerPaths(reading, item))
  const common = commonPaths(paths)
  const avgPaths = paths.reduce((sum, set) => sum + set.size, 0) / items.length
  const similarity = avgPaths === 0 ? 0.5 : Math.min(1, common.length / avgPaths)
  let inMenu = false
  for (let up: Element | null = items[0]!; up !== null && up.tagName !== 'BODY' && !inMenu; up = up.parentElement) inMenu = menuKind(up, reading) === 'menu'
  const linkOnly = items.every((item, i) => texts[i]!.length < 30 && (item.tagName === 'A' ? qsa(item, 'a').length === 0 : qsa(item, 'a').length === 1) && paths[i]!.size <= 2)
  const penalty = inMenu ? 0.15 : linkOnly ? 0.3 : 1
  return Math.sqrt(all.length) * Math.log1p(avgText) * (0.5 + similarity) * penalty
}

/**
 * Whether an element is a site's navigation or hidden (nav, header, footer
 * or aside; a menu's role; the `hidden` attribute, `aria-hidden`, a closed
 * <details>), or a menu by its class (a menu, a dropdown, tabs, pagination).
 */
function menuKind(el: Element, reading: Reading): 'navigation' | 'menu' | null {
  if (NAVIGATION_TAGS.has(el.tagName) || MENU_ROLES.has(el.getAttribute('role') ?? '')) return 'navigation'
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true' || (el.tagName === 'DETAILS' && !el.hasAttribute('open'))) return 'navigation'
  return reading.classesOf(el).some((name) => MENU_CLASS.test(name)) ? 'menu' : null
}

/** The paths at least FIELD_SHARE of the items hold, in the order first met. */
function commonPaths(paths: Map<string, Element>[]): string[] {
  const counts = new Map<string, number>()
  for (const set of paths) for (const key of set.keys()) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts.entries()].filter(([, n]) => n >= Math.ceil(paths.length * FIELD_SHARE)).map(([key]) => key)
}

/** The fields of a list's items, within what a request may send back with its itemSelector: MAX_SELECTOR_CHARS a selector, MAX_SELECTOR_PARTS in all. */
function fieldsOf(all: Element[], itemSelector: string): ListField[] {
  const reading = new Reading()
  const items = all.slice(0, SAMPLE)
  const paths = items.map((item) => innerPaths(reading, item))
  const found = fieldsFor(reading, items, commonPaths(paths), paths)
  const fields: ListField[] = []
  let parts = selectorParts(itemSelector)
  for (const field of found) {
    if (field.selector !== undefined) {
      const cost = selectorParts(field.selector)
      if (field.selector.length > MAX_SELECTOR_CHARS || invalidSelector(field.selector) !== null || parts + cost > MAX_SELECTOR_PARTS) continue
      parts += cost
    }
    fields.push(field)
  }
  return fields.length === 0 ? [{ name: 'text' }] : fields
}

/** The fields most items hold, in document order. */
function fieldsFor(reading: Reading, items: Element[], common: string[], paths: Map<string, Element>[]): ListField[] {
  const fields: ListField[] = []
  const names = new Set<string>(RESERVED_NAMES)
  const descendants = items.map((item) => qsa(item, '*'))
  const itemStep = reading.step(items[0]!, ITEM_STEP_CLASSES)
  const add = (base: string, field: Omit<ListField, 'name'>): void => {
    if (fields.length >= MAX_FIELDS) return
    let name = base
    for (let n = 2; names.has(name); n++) name = `${base}_${n}`
    names.add(name)
    fields.push({ name, ...field })
  }
  // The items holding a path, and the element at it in each.
  const at = (path: string) => items.flatMap((_, i) => {
    const el = paths[i]!.get(path)
    return el === undefined ? [] : [{ i, el }]
  })
  for (const path of common.slice(0, MAX_FIELD_PATHS)) {
    if (fields.length >= MAX_FIELDS || reading.spent) break
    const holders = at(path)
    const el = holders[0]!.el
    if (el.tagName === 'IMG') {
      // The source that differs between items: a lazy image's real one, not a placeholder every item has.
      const present = IMAGE_SOURCES.filter((name) => holders.some((h) => (h.el.getAttribute(name) ?? '') !== ''))
      const attribute = present.find((name) => varies(holders.map((h) => h.el.getAttribute(name)))) ?? present[0]
      const selector = attribute === undefined ? null : selectorWithin(reading, path, holders, descendants, itemStep)
      if (selector !== null) add('image', { selector, attribute })
      continue
    }
    if (el.tagName === 'A' && holders.some((h) => (h.el.getAttribute('href') ?? '') !== '')) {
      const selector = selectorWithin(reading, path, holders, descendants, itemStep)
      if (selector === null) continue
      const label = nameFrom(reading, el, holders, 'title', path)
      if (varies(holders.map((h) => textOf(h.el)))) add(label, { selector })
      add(names.has('link') ? `${label}_link` : 'link', { selector, attribute: 'href' })
      continue
    }
    // A text: an element with text of its own beside its children, or with no children (its children's texts are fields of their own).
    const own = Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.nodeValue ?? '').trim() !== '')
    if (!own && el.children.length > 0) continue
    const values = holders.map((h) => textOf(h.el))
    if (!varies(values)) continue
    const selector = selectorWithin(reading, path, holders, descendants, itemStep)
    if (selector !== null) add(nameFrom(reading, el, holders, 'text', path), { selector })
  }
  return fields
}

/** Whether a field's values differ between items: a value every item has the same is a label, not data. */
function varies(values: Array<string | null>): boolean {
  const present = values.filter((value): value is string => value !== null && value !== '')
  return present.length > 0 && (new Set(present).size > 1 || present.length < MIN_ITEMS)
}

/**
 * The shortest tail of a path (its steps joined by `>`) whose first match in
 * each item that holds the path is the element at it, and that matches
 * nothing in the items that do not (their value is then missing, not another
 * element's); else the whole path from the item's own step (`div.p > span`,
 * a span that is the item's child and not one deeper); null when not even
 * that is.
 */
function selectorWithin(reading: Reading, path: string, holders: Array<{ i: number; el: Element }>, descendants: Element[][], itemStep: string): string | null {
  const steps = path.split(' > ')
  const at = new Map(holders.map((h) => [h.i, h.el]))
  const tails = [...steps.map((_, n) => steps.slice(steps.length - n - 1)), [itemStep, ...steps]]
  for (const tail of tails) {
    if (reading.spent) return null
    if (descendants.every((inside, i) => (inside.find((el) => reading.fitsChain(el, tail)) ?? null) === (at.get(i) ?? null))) return tail.join(' > ')
  }
  return null
}

/** A field's name: `price` for a sum of money; else its first class without a digit, as words, or its parent's within the item (a heading's link); else `fallback`. */
function nameFrom(reading: Reading, el: Element, holders: Array<{ el: Element }>, fallback: string, path: string): string {
  const money = holders.filter((h) => MONEY.test((textOf(h.el) ?? '').trim())).length
  if (money >= Math.ceil(holders.length * FIELD_SHARE)) return 'price'
  // A class with a digit in it is a layout utility (col-9, mr-3), not a name.
  const named = (of: Element) => reading.classesOf(of).find((name) => !/\d/.test(name))
  const cls = named(el) ?? (path.includes(' > ') && el.parentElement !== null ? named(el.parentElement) : undefined)
  if (cls !== undefined) {
    const word = cls.replace(/[-_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
    if (/^[a-z]/.test(word) && word.length <= 40) return word
  }
  return fallback
}
