/**
 * CSS selectors that come from a request (includeTags, excludeTags).
 *
 * The DOM layer matches a selector by walking back from each candidate
 * element: for a descendant combinator it climbs the element's ancestors,
 * and tries the rest of the selector again from every ancestor that fits;
 * for a sibling combinator or a positional pseudo-class it reads the
 * element's whole sibling list. With selectors the code itself writes that
 * is fine. With one a caller chose it is work without a bound, on the event
 * loop, where no deadline stops it. Measured with linkedom 0.18.13 and
 * css-select 7.0.0: `x ~ p ~ p ~ p` took 4.7 s on a page of 200 paragraphs
 * and did not end in 20 s with one more `~ p`; `x div div div div div div p`
 * took 1.5 s on 500 paragraphs nested 20 deep (0.2 s and 0.6 s with two and
 * one `div` fewer).
 *
 * So a request selector is limited to what can be matched in time
 * proportional to the page (SUPPORTED_SELECTORS), and its combinators are
 * never given to the DOM layer: that layer matches each compound selector on
 * its own, which needs no ancestor and no sibling, and the descendant and
 * child combinators between them are resolved here, one pass over the page
 * for each chain.
 */

import { qsa, selectorSyntaxError } from './dom.js'

/** What a request selector may be built from, as the refusal of any other says it. */
export const SUPPORTED_SELECTORS =
  'tag, class, id and attribute selectors, the descendant and child combinators, :root, :empty, and :not(), :is() and :where() around selectors without combinators'

const PSEUDO_CLASSES: ReadonlySet<string> = new Set(['not', 'is', 'where', 'root', 'empty'])

/** Why a request selector cannot be used. */
export interface SelectorRefusal {
  /** `syntax`: it does not parse. `unsupported`: it parses, and uses something outside SUPPORTED_SELECTORS. */
  kind: 'syntax' | 'unsupported'
  /** The parser's complaint, or what the selector uses (`:nth-child`, `the sibling combinator ~`). */
  reason: string
}

/** One compound selector of a chain, and whether `>` joins it to the one before it (else a descendant combinator does). */
interface Step {
  compound: string
  child: boolean
}

/** Index of the character that closes what opens at `from`: a quoted string, or an attribute selector with the strings in it; the end of the text when nothing does. */
function closing(text: string, from: number, close: string): number {
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\') i++
    else if (c === close) return i
    else if (close === ']' && (c === '"' || c === "'")) i = closing(text, i, c)
  }
  return text.length
}

/** The nearest character that is not whitespace, before `at` (step -1) or after it (step 1). */
function neighbour(text: string, at: number, step: 1 | -1): string {
  for (let i = at + step; i >= 0 && i < text.length; i += step) if (!/\s/.test(text[i]!)) return text[i]!
  return ''
}

/**
 * A selector list as its chains of compound selectors, or why it cannot be
 * used. Attribute selectors, quoted strings and escaped characters are
 * copied whole, so what they contain is never read as a combinator.
 */
function read(selector: string): Step[][] | SelectorRefusal {
  const syntax = selectorSyntaxError(selector)
  if (syntax !== null) return { kind: 'syntax', reason: syntax }
  const unsupported = (reason: string): SelectorRefusal => ({ kind: 'unsupported', reason })
  const chains: Step[][] = []
  let steps: Step[] = []
  let compound = ''
  /** The combinator read since the last compound selector. */
  let combinator: 'descendant' | 'child' | null = null
  /** Open parentheses: inside :not(), :is() and :where(). */
  let depth = 0
  const endCompound = (): void => {
    if (compound === '') return
    steps.push({ compound, child: combinator === 'child' })
    compound = ''
    combinator = null
  }
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!
    if (c === '\\') {
      compound += selector.slice(i, i + 2)
      i++
    } else if (c === '[' || c === '"' || c === "'") {
      const end = closing(selector, i, c === '[' ? ']' : c)
      compound += selector.slice(i, end + 1)
      i = end
    } else if (c === ':') {
      const name = /^::?([\w-]*)/.exec(selector.slice(i))![1]!.toLowerCase()
      if (!PSEUDO_CLASSES.has(name)) return unsupported(`:${name}`)
      compound += c
    } else if (c === '(' || c === ')') {
      depth += c === '(' ? 1 : -1
      compound += c
    } else if (c === '+' || c === '~') {
      return unsupported(`the sibling combinator ${c}`)
    } else if (depth > 0) {
      // Inside parentheses: compound selectors and the commas between them.
      const between = /\s/.test(c) && !'(,'.includes(neighbour(selector, i, -1)) && !'),'.includes(neighbour(selector, i, 1))
      if (c === '>' || between) return unsupported('a combinator inside parentheses')
      if (!/[\w\s\-.#*,]/.test(c) && c.charCodeAt(0) < 0x80) return unsupported(`the character ${c}`)
      compound += c
    } else if (/\s/.test(c)) {
      endCompound()
      if (steps.length > 0 && combinator === null) combinator = 'descendant'
    } else if (c === '>') {
      endCompound()
      if (steps.length === 0) return unsupported('a combinator at its start')
      combinator = 'child'
    } else if (c === ',') {
      endCompound()
      if (combinator === 'child') return unsupported('a combinator at its end')
      chains.push(steps)
      steps = []
      combinator = null
    } else if (/[\w\-.#*]/.test(c) || c.charCodeAt(0) >= 0x80) {
      compound += c
    } else {
      return unsupported(`the character ${c}`)
    }
  }
  endCompound()
  if (combinator === 'child') return unsupported('a combinator at its end')
  chains.push(steps)
  return chains.filter((chain) => chain.length > 0)
}

/**
 * Why a CSS selector from a request cannot be used, or null when it can. A
 * caller that takes selectors from a request checks them here, so that one
 * is refused by name: `namedBy` reads a selector it cannot use as naming
 * nothing.
 */
export function invalidSelector(selector: string): SelectorRefusal | null {
  const chains = read(selector)
  return Array.isArray(chains) ? null : chains
}

/**
 * The elements of the document that any of the selectors names. A selector
 * that cannot be used (invalidSelector) names nothing: the API refuses it by
 * name before a page is fetched, and no other caller gets to run one whose
 * cost the page does not bound.
 */
export function namedBy(document: Document, selectors: readonly string[]): Set<Element> {
  const named = new Set<Element>()
  const chains: Step[][] = []
  for (const selector of selectors) {
    const read_ = read(selector)
    if (!Array.isArray(read_)) continue
    for (const steps of read_) {
      // A compound selector on its own is the DOM layer's to match.
      if (steps.length === 1) for (const el of qsa(document, steps[0]!.compound)) named.add(el)
      else chains.push(steps)
    }
  }
  const root = document.documentElement
  if (chains.length === 0 || root === null) return named
  // Every element's place in document order: what a compound selector
  // matches is then one byte per element, for one chain at a time.
  const place = new Map<Element, number>()
  for (const el of qsa(document, '*')) place.set(el, place.size)
  for (const steps of chains) {
    const matched = new Map<string, Uint8Array>()
    const fits = steps.map(({ compound }) => {
      let flags = matched.get(compound)
      if (flags === undefined) {
        flags = new Uint8Array(place.size)
        for (const el of qsa(document, compound)) flags[place.get(el)!] = 1
        matched.set(compound, flags)
      }
      return flags
    })
    resolveChain(root, place, fits, steps.map((step) => step.child), named)
  }
  return named
}

/**
 * Adds to `named` the elements a chain of compound selectors names: one pass
 * in document order, which carries down the path from the root how far the
 * chain has come. For the element at each depth of that path, `here` says
 * which steps end at the element itself, and `above` which end at it or at
 * one of its ancestors: step i ends at an element that its compound selector
 * matches (`fits[i]`) and whose parent (after `>`), or any ancestor, ends
 * step i - 1. No step is tried twice for an element, however many ways its
 * ancestors fit the steps before it.
 */
function resolveChain(root: Element, place: ReadonlyMap<Element, number>, fits: readonly Uint8Array[], child: readonly boolean[], named: Set<Element>): void {
  const steps = fits.length
  // One row of `steps` flags per depth of the current path.
  let here = new Uint8Array(64 * steps)
  let above = new Uint8Array(64 * steps)
  let depth = 0
  let el: Element | null = root
  while (el !== null) {
    const row = depth * steps
    if (row + steps > here.length) {
      const deeperHere = new Uint8Array(here.length * 2)
      const deeperAbove = new Uint8Array(above.length * 2)
      deeperHere.set(here)
      deeperAbove.set(above)
      here = deeperHere
      above = deeperAbove
    }
    const at = place.get(el)
    const parent = row - steps
    for (let i = 0; i < steps; i++) {
      const before = i === 0 ? 1 : depth === 0 ? 0 : child[i] ? here[parent + i - 1]! : above[parent + i - 1]!
      const ends = before === 1 && at !== undefined && fits[i]![at] === 1 ? 1 : 0
      here[row + i] = ends
      above[row + i] = ends === 1 || (depth > 0 && above[parent + i] === 1) ? 1 : 0
    }
    if (here[row + steps - 1] === 1) named.add(el)
    if (el.firstElementChild !== null) {
      el = el.firstElementChild
      depth++
      continue
    }
    while (el !== null && el.nextElementSibling === null) {
      el = el.parentElement
      depth--
    }
    el = el === null ? null : el.nextElementSibling
  }
}
