/**
 * Finding the list a page is made of, for a `list` format that names no
 * itemSelector. Elements that repeat beside each other, with the same tag and
 * classes under parents of the same tag and classes, are a candidate list
 * (one list may span several parents: a grid's rows). A candidate's
 * itemSelector is the parent's step, `>`, and the items' step, climbing the
 * ancestors when that names more than the list; the candidate is what that
 * selector matches, since that is what will be read. Candidates are scored
 * by how many items they have, how much text the items hold and how alike
 * the items are inside; menus (in nav, header, footer or aside, a menu's role
 * or class, hidden, or items that are one short link each) count for little.
 *
 * A candidate's fields are what most of its items hold, at the same path
 * inside them: an element's own text, a link's text and target, an image's
 * source. A text every item has the same (a label, a button) is not a field.
 * Each field's selector is the shortest tail of its path that finds, in
 * every item, the element at that path; a path no selector finds that way
 * is left out. Names come from a field's class, `price` for a sum of money,
 * else its kind. Deterministic, no model.
 */

import type { ListField } from '@w2l/contracts'
import { parse, qsa } from './dom.js'
import { textOf } from './list.js'
import { namedBy } from './selectors.js'

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
const SIMPLE_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/
const MENU_ANCESTORS: ReadonlySet<string> = new Set(['NAV', 'HEADER', 'FOOTER', 'ASIDE'])
const MENU_ROLES: ReadonlySet<string> = new Set(['navigation', 'menu', 'menubar', 'listbox', 'tablist', 'tree'])
const MENU_CLASS = /(?:^|[-_])(?:nav|navbar|menu|dropdown|breadcrumbs?|pagination|pager|tabs)(?:[-_]|$)/i
const NOT_CONTENT: ReadonlySet<string> = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'HR'])
/** Elements that are part of a record, never one: an article's paragraphs and headings, a row's cells, a table's sections, a select's options. */
const NOT_ITEM: ReadonlySet<string> = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'THEAD', 'TBODY', 'TFOOT', 'CAPTION', 'COL', 'COLGROUP', 'OPTION', 'OPTGROUP', 'SOURCE', 'TRACK'])
const MONEY = /^(?:[$€£¥₹]|USD|EUR|GBP)\s?\d[\d.,\s]*$|^\d[\d.,\s]*\s?(?:[$€£¥₹]|USD|EUR|GBP|元)$/

/** The page's lists, best first: at most `limit` candidates. */
export function detectLists(html: string, limit = 3): ListCandidate[] {
  const doc = parse(html)
  const document = doc.document
  const root = document.body ?? document.documentElement
  const scored: Array<{ itemSelector: string; items: Element[]; nested: number; score: number }> = []
  if (root !== null) {
    // Elements grouped by their grandparent's, their parent's and their own step (the rows of one kind of table, not of every table);
    // a group is a list when some parent holds two or more of it.
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
      const here = new Map<string, number>()
      for (const child of Array.from(parent.children)) {
        if (NOT_CONTENT.has(child.tagName) || NOT_ITEM.has(child.tagName)) continue
        const key = `${parent.parentElement === null ? '' : stepOf(parent.parentElement, false)} > ${stepOf(parent, false)} > ${stepOf(child, false)}`
        let group = groups.get(key)
        if (group === undefined) groups.set(key, group = { items: [], repeats: false, parents: new Set<Element>() })
        group.items.push(child)
        group.parents.add(parent)
        here.set(key, (here.get(key) ?? 0) + 1)
        if (here.get(key)! >= 2) group.repeats = true
      }
    }
    // The largest groups only: each costs a pass over the elements of its tag to name.
    const lists = [...groups.values()].filter((group) => group.repeats && group.items.length >= MIN_ITEMS).sort((a, b) => b.items.length - a.items.length).slice(0, MAX_GROUPS)
    const seen = new Set<string>()
    for (const group of lists) {
      const named = selectorFor(byTag, group.items, group.parents)
      if (named === null || seen.has(named.selector)) continue
      seen.add(named.selector)
      const score = scoreList(named.items)
      if (score !== null) scored.push({ itemSelector: named.selector, items: named.items, nested: named.nested, score })
    }
  }
  // What is read is what the extractor's matcher names: a candidate it would read otherwise is left out.
  const best: ListCandidate[] = []
  for (const list of scored.sort((a, b) => b.score - a.score)) {
    if (best.length >= limit) break
    if (namedBy(document, [list.itemSelector]).size !== list.items.length + list.nested) continue
    best.push({ itemSelector: list.itemSelector, count: list.items.length, score: Math.round(list.score * 100) / 100, fields: fieldsOf(list.items) })
  }
  doc.close()
  return best
}

/** The fields the items an itemSelector names hold, as detectLists finds them; null when it names no item. */
export function detectFields(html: string, itemSelector: string): ListField[] | null {
  const doc = parse(html)
  const named = namedBy(doc.document, [itemSelector])
  const items = [...named].filter((el) => !hasAncestorIn(el, named))
  const fields = items.length === 0 ? null : fieldsOf(items)
  doc.close()
  return fields
}

/** An element's classes W2L can name, in the order written. */
function classesOf(el: Element): string[] {
  return [...new Set((el.getAttribute('class') ?? '').split(/\s+/))].filter((name) => SIMPLE_NAME.test(name))
}

/** One selector step: the element's id when `useId` and it has a usable one; else its tag and classes (sorted), or with `firstClass` its tag and first class. */
function stepOf(el: Element, useId: boolean, firstClass = false): string {
  if (useId && el.id !== '' && SIMPLE_NAME.test(el.id)) return `#${el.id}`
  const classes = classesOf(el)
  return [el.tagName.toLowerCase(), ...(firstClass ? classes.slice(0, 1) : classes.sort())].join('.')
}

/**
 * The selector for a group, and the items it names (none inside another;
 * `nested` counts those left out): the parent's tag and first class `>` the
 * items' step, an ancestor's before it at a time while it names more than the
 * group, else the one that names the fewest more. An id is tried only when
 * classes do not tell the group apart, and only when the group has one
 * parent, so a selector never names one parent of several.
 */
function selectorFor(byTag: Map<string, Element[]>, items: Element[], parents: Set<Element>): { selector: string; items: Element[]; nested: number } | null {
  const among = byTag.get(items[0]!.tagName.toLowerCase()) ?? []
  // Classes first: an id is often generated, and differs on the next page.
  let closest: { selector: string; items: Element[]; nested: number } | null = null
  for (const useId of parents.size === 1 ? [false, true] : [false]) {
    const steps = [stepOf(items[0]!, false)]
    let up: Element | null = items[0]!.parentElement
    for (let depth = 0; depth < 4 && up !== null && up.tagName !== 'HTML'; depth++, up = up.parentElement) {
      steps.unshift(stepOf(up, useId, true))
      const named = new Set(among.filter((el) => fitsChain(el, steps)))
      if (!items.every((el) => named.has(el))) break
      const outer = [...named].filter((el) => !hasAncestorIn(el, named))
      const found = { selector: steps.join(' > '), items: outer, nested: named.size - outer.length }
      if (named.size === items.length) return found
      // Else the selector that names the fewest more, the shortest of those.
      if (closest === null || named.size < closest.items.length + closest.nested) closest = found
      if (useId && up.id !== '' && SIMPLE_NAME.test(up.id)) break
    }
  }
  return closest
}

/** Whether an element fits one step as the extractor matches it: `#id`, or `tag.class...` with every class among its own. */
function fits(el: Element, step: string): boolean {
  if (step.startsWith('#')) return el.id === step.slice(1)
  const [tag, ...classes] = step.split('.')
  if (el.tagName.toLowerCase() !== tag) return false
  if (classes.length === 0) return true
  const own = new Set((el.getAttribute('class') ?? '').split(/\s+/))
  return classes.every((name) => own.has(name))
}

/** Whether an element fits steps joined by `>`, the last one its own. */
function fitsChain(el: Element, steps: readonly string[]): boolean {
  let at: Element | null = el
  for (let i = steps.length - 1; i >= 0; i--, at = at.parentElement) if (at === null || !fits(at, steps[i]!)) return false
  return true
}

function hasAncestorIn(el: Element, set: Set<Element>): boolean {
  for (let up = el.parentElement; up !== null; up = up.parentElement) if (set.has(up)) return true
  return false
}

/** The paths inside an item, each its chain of tag.firstClass steps, at most MAX_DEPTH deep, with the first element at each. */
function innerPaths(item: Element): Map<string, Element> {
  const paths = new Map<string, Element>()
  const walk = (el: Element, path: string, depth: number): void => {
    for (const child of Array.from(el.children)) {
      if (NOT_CONTENT.has(child.tagName)) continue
      const key = path === '' ? stepOf(child, false, true) : `${path} > ${stepOf(child, false, true)}`
      if (!paths.has(key)) paths.set(key, child)
      if (depth < MAX_DEPTH) walk(child, key, depth + 1)
    }
  }
  walk(item, '', 1)
  return paths
}

/** How much a group looks like the page's list: more items, more text in them, alike inside; a menu counts for little. Null when its items hold no text. */
function scoreList(all: Element[]): number | null {
  if (all.length < MIN_ITEMS) return null
  const items = all.slice(0, SAMPLE)
  const texts = items.map((item) => textOf(item) ?? '')
  if (texts.filter((text) => text.length >= 2).length < MIN_ITEMS) return null
  const avgText = texts.reduce((sum, text) => sum + text.length, 0) / items.length
  const paths = items.map(innerPaths)
  const common = commonPaths(paths)
  const avgPaths = paths.reduce((sum, set) => sum + set.size, 0) / items.length
  const similarity = avgPaths === 0 ? 0.5 : Math.min(1, common.length / avgPaths)
  // A menu: a list in a menu, or hidden, or items that are each one short link.
  let inMenu = false
  for (let up: Element | null = items[0]!; up !== null && up.tagName !== 'BODY' && !inMenu; up = up.parentElement) inMenu = menuLike(up)
  const linkOnly = items.every((item, i) => texts[i]!.length < 30 && (item.tagName === 'A' ? qsa(item, 'a').length === 0 : qsa(item, 'a').length === 1) && paths[i]!.size <= 2)
  const penalty = inMenu ? 0.15 : linkOnly ? 0.3 : 1
  return Math.sqrt(all.length) * Math.log1p(avgText) * (0.5 + similarity) * penalty
}

/**
 * Whether an element is a menu's or hidden: nav, header, footer or aside; a
 * menu's role; a class that names a menu, a dropdown, tabs or pagination; the
 * `hidden` attribute, `aria-hidden`, or a closed <details>.
 */
function menuLike(el: Element): boolean {
  if (MENU_ANCESTORS.has(el.tagName) || MENU_ROLES.has(el.getAttribute('role') ?? '')) return true
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true' || (el.tagName === 'DETAILS' && !el.hasAttribute('open'))) return true
  return classesOf(el).some((name) => MENU_CLASS.test(name))
}

/** The paths at least FIELD_SHARE of the items hold, in the order first met. */
function commonPaths(paths: Map<string, Element>[]): string[] {
  const counts = new Map<string, number>()
  for (const set of paths) for (const key of set.keys()) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts.entries()].filter(([, n]) => n >= Math.ceil(paths.length * FIELD_SHARE)).map(([key]) => key)
}

function fieldsOf(all: Element[]): ListField[] {
  const items = all.slice(0, SAMPLE)
  const paths = items.map(innerPaths)
  return fieldsFor(items, commonPaths(paths), paths)
}

/** The fields most items hold, in document order. */
function fieldsFor(items: Element[], common: string[], paths: Map<string, Element>[]): ListField[] {
  const fields: ListField[] = []
  const names = new Set<string>()
  const descendants = items.map((item) => qsa(item, '*'))
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
  for (const path of common) {
    const holders = at(path)
    const el = holders[0]!.el
    if (el.tagName === 'IMG') {
      const attribute = ['src', 'data-src'].find((name) => holders.some((h) => (h.el.getAttribute(name) ?? '') !== ''))
      const selector = attribute === undefined ? null : selectorWithin(path, holders, descendants)
      if (selector !== null) add('image', { selector, attribute })
      continue
    }
    if (el.tagName === 'A' && holders.some((h) => (h.el.getAttribute('href') ?? '') !== '')) {
      const selector = selectorWithin(path, holders, descendants)
      if (selector === null) continue
      const label = nameFrom(el, holders, 'title', path)
      if (varies(holders.map((h) => textOf(h.el)))) add(label, { selector })
      add(names.has('link') ? `${label}_link` : 'link', { selector, attribute: 'href' })
      continue
    }
    // A text: an element with text of its own beside its children, or with no children (its children's texts are fields of their own).
    const own = Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.nodeValue ?? '').trim() !== '')
    if (!own && el.children.length > 0) continue
    const values = holders.map((h) => textOf(h.el))
    if (!varies(values)) continue
    const selector = selectorWithin(path, holders, descendants)
    if (selector !== null) add(nameFrom(el, holders, 'text', path), { selector })
  }
  // A list whose items hold no common path (a plain <li>text</li>): the item itself.
  if (fields.length === 0) fields.push({ name: 'text' })
  return fields
}

/** Whether a field's values differ between items: a value every item has the same is a label, not data. */
function varies(values: Array<string | null>): boolean {
  const present = values.filter((value): value is string => value !== null)
  return present.length > 0 && (new Set(present).size > 1 || present.length < MIN_ITEMS)
}

/** The shortest tail of a path (its steps joined by `>`) whose first match in each item is the element at the path; null when not even the whole path is. */
function selectorWithin(path: string, holders: Array<{ i: number; el: Element }>, descendants: Element[][]): string | null {
  const steps = path.split(' > ')
  for (let n = 1; n <= steps.length; n++) {
    const tail = steps.slice(-n)
    if (holders.every((h) => descendants[h.i]!.find((el) => fitsChain(el, tail)) === h.el)) return tail.join(' > ')
  }
  return null
}

/** A field's name: `price` for a sum of money; else its first class without a digit, as words, or its parent's within the item (a heading's link); else `fallback`. */
function nameFrom(el: Element, holders: Array<{ el: Element }>, fallback: string, path: string): string {
  const money = holders.filter((h) => MONEY.test((textOf(h.el) ?? '').trim())).length
  if (money >= Math.ceil(holders.length * FIELD_SHARE)) return 'price'
  // A class with a digit in it is a layout utility (col-9, mr-3), not a name.
  const named = (of: Element) => classesOf(of).find((name) => !/\d/.test(name))
  const cls = named(el) ?? (path.includes(' > ') && el.parentElement !== null ? named(el.parentElement) : undefined)
  if (cls !== undefined) {
    const word = cls.replace(/[-_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
    if (/^[a-z]/.test(word) && word.length <= 40) return word
  }
  return fallback
}
