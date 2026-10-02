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
 * child combinators between them are resolved here, in one pass over the
 * page for all the selectors of a list.
 *
 * A selector is read with css-what, the parser the DOM layer reads it with,
 * so the two never divide one differently: an escape that ends in a space
 * (`#\31 23`, the id `123`) is part of a name to both. Each compound selector
 * is handed to the DOM layer as written back from its tokens.
 *
 * What a list costs is the number of its parts (MAX_SELECTOR_PARTS): the DOM
 * layer tests an element against a compound selector part by part, and
 * passes over the page once for the compound selectors that are a whole
 * selector and once for each other one.
 */

import { AttributeAction, isTraversal, parse as parseSelector, SelectorType, type Selector } from 'css-what'
import { qsa, selectorSyntaxError } from './dom.js'

/** What a request selector may be built from, as the refusal of any other says it. */
export const SUPPORTED_SELECTORS =
  'tag, class, id and attribute selectors, the descendant and child combinators, :root, :empty, and :not(), :is() and :where() around selectors without combinators'

/**
 * The parts one list of request selectors may hold in all. A tag name, `*`,
 * a class, an id, an attribute test and a pseudo-class each count as one,
 * those inside `:not()`, `:is()` and `:where()` too: `main > article
 * p:not(.note)` has five. It bounds what a list can make a page cost: at
 * most one test of every element for each part, and one pass over the page
 * for each compound selector.
 */
export const MAX_SELECTOR_PARTS = 100

/** Pseudo-classes without an argument, and those around compound selectors. */
const PLAIN_PSEUDO_CLASSES: ReadonlySet<string> = new Set(['root', 'empty'])
const SELECTOR_PSEUDO_CLASSES: ReadonlySet<string> = new Set(['not', 'is', 'where'])

/** The combinators that are not resolved here, as a refusal names them. */
const UNSUPPORTED_COMBINATORS: Partial<Record<SelectorType, string>> = {
  [SelectorType.Adjacent]: 'the sibling combinator +',
  [SelectorType.Sibling]: 'the sibling combinator ~',
  [SelectorType.Parent]: 'the parent combinator <',
  [SelectorType.ColumnCombinator]: 'the column combinator ||',
}

const ATTRIBUTE_OPERATORS: Record<AttributeAction, string> = {
  [AttributeAction.Exists]: '',
  [AttributeAction.Equals]: '=',
  [AttributeAction.Element]: '~=',
  [AttributeAction.Start]: '^=',
  [AttributeAction.End]: '$=',
  [AttributeAction.Any]: '*=',
  [AttributeAction.Not]: '!=',
  [AttributeAction.Hyphen]: '|=',
}

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

/** A selector list as its chains of compound selectors, and the number of its parts. */
interface Reading {
  chains: Step[][]
  parts: number
}

/** What a selector uses that is not matched here; thrown while it is read, and returned as its refusal. */
class Unsupported extends Error {}

/**
 * A name or a value as the parser reads it back, whatever it holds: every
 * character outside the parser's name characters as a six-digit escape.
 */
function written(text: string): string {
  return text.replace(/[^\w°-￿-]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(6, '0')}`)
}

/**
 * One compound selector written back from its tokens. Counts its parts, and
 * refuses what is outside SUPPORTED_SELECTORS by name.
 */
function compoundText(tokens: readonly Selector[], tally: { parts: number }): string {
  let text = ''
  for (const [index, token] of tokens.entries()) {
    tally.parts++
    switch (token.type) {
      case SelectorType.Tag:
      case SelectorType.Universal:
        if (token.namespace !== null) throw new Unsupported('a namespace')
        // `*p`, or two names with a comment between them: written back, they would read as one name.
        if (index > 0) throw new Unsupported('a tag name after another part of its compound selector')
        text += token.type === SelectorType.Tag ? written(token.name) : '*'
        break
      case SelectorType.Attribute:
        if (token.namespace !== null) throw new Unsupported('a namespace')
        // `.class` and `#id` are the only attribute tests the parser marks `quirks`.
        if (token.ignoreCase === 'quirks') text += `${token.name === 'id' ? '#' : '.'}${written(token.value)}`
        else if (token.action === AttributeAction.Exists) text += `[${written(token.name)}]`
        else text += `[${written(token.name)}${ATTRIBUTE_OPERATORS[token.action]}"${written(token.value)}"${token.ignoreCase === null ? '' : token.ignoreCase ? 'i' : 's'}]`
        break
      case SelectorType.Pseudo: {
        const { name, data } = token
        if (data === null && PLAIN_PSEUDO_CLASSES.has(name)) {
          text += `:${name}`
        } else if (Array.isArray(data) && SELECTOR_PSEUDO_CLASSES.has(name)) {
          const inside = data.map((inner) => {
            if (inner.some(isTraversal)) throw new Unsupported('a combinator inside parentheses')
            return compoundText(inner, tally)
          })
          text += `:${name}(${inside.join(',')})`
        } else {
          throw new Unsupported(`:${name}`)
        }
        break
      }
      case SelectorType.PseudoElement:
        throw new Unsupported(`::${token.name}`)
      default:
        // A combinator: a selector is divided at them before its compound selectors are written.
        throw new Unsupported('a combinator')
    }
  }
  return text
}

/**
 * A compound selector as a step of its chain. What the DOM layer is handed
 * is what was read: it accepts the text, and reads it back as these tokens.
 */
function stepOf(compound: readonly Selector[], child: boolean, tally: { parts: number }): Step {
  const text = compoundText(compound, tally)
  if (selectorSyntaxError(text) !== null || JSON.stringify(parseSelector(text)) !== JSON.stringify([compound])) {
    throw new Unsupported('a name that cannot be written back for the DOM layer')
  }
  return { compound: text, child }
}

/**
 * A selector list as its chains of compound selectors, or why it cannot be
 * used: the DOM layer does not accept it, or it uses something outside
 * SUPPORTED_SELECTORS, named in the order the selector writes it.
 */
function read(selector: string): Reading | SelectorRefusal {
  const syntax = selectorSyntaxError(selector)
  if (syntax !== null) return { kind: 'syntax', reason: syntax }
  const tally = { parts: 0 }
  const chains: Step[][] = []
  try {
    for (const tokens of parseSelector(selector)) {
      const steps: Step[] = []
      let compound: Selector[] = []
      let child = false
      for (const token of tokens) {
        if (!isTraversal(token)) {
          compound.push(token)
          continue
        }
        const follows = compound.length > 0
        if (follows) steps.push(stepOf(compound, child, tally))
        const refused = UNSUPPORTED_COMBINATORS[token.type]
        if (refused !== undefined) throw new Unsupported(refused)
        if (!follows) throw new Unsupported('a combinator at its start')
        compound = []
        child = token.type === SelectorType.Child
      }
      if (compound.length === 0) throw new Unsupported('a combinator at its end')
      steps.push(stepOf(compound, child, tally))
      chains.push(steps)
    }
  } catch (error) {
    if (error instanceof Unsupported) return { kind: 'unsupported', reason: error.message }
    return { kind: 'syntax', reason: error instanceof Error ? error.message : String(error) }
  }
  return { chains, parts: tally.parts }
}

/**
 * Why a CSS selector from a request cannot be used, or null when it can. A
 * caller that takes selectors from a request checks them here, so that one
 * is refused by name: `namedBy` reads a selector it cannot use as naming
 * nothing.
 */
export function invalidSelector(selector: string): SelectorRefusal | null {
  const reading = read(selector)
  return 'chains' in reading ? null : reading
}

/** The parts of a request selector, as MAX_SELECTOR_PARTS counts them; 0 for one that cannot be used. */
export function selectorParts(selector: string): number {
  const reading = read(selector)
  return 'chains' in reading ? reading.parts : 0
}

/**
 * The elements of the document that any of the selectors names. A selector
 * that cannot be used (invalidSelector) names nothing, and neither does one
 * from which on the list holds more than MAX_SELECTOR_PARTS parts: the API
 * refuses both by name before a page is fetched, and no other caller gets to
 * run a list whose cost the page does not bound. A compound selector or a
 * chain the list repeats is matched once.
 */
export function namedBy(document: Document, selectors: readonly string[]): Set<Element> {
  const named = new Set<Element>()
  const alone = new Set<string>()
  const chains = new Map<string, Step[]>()
  let parts = 0
  for (const selector of selectors) {
    const reading = read(selector)
    if (!('chains' in reading)) continue
    parts += reading.parts
    if (parts > MAX_SELECTOR_PARTS) break
    for (const steps of reading.chains) {
      if (steps.length === 1) alone.add(steps[0]!.compound)
      else chains.set(steps.map((step) => `${step.child ? '>' : ' '}${step.compound}`).join(''), steps)
    }
  }
  // A compound selector on its own is the DOM layer's to match: all of them in one pass.
  if (alone.size > 0) for (const el of qsa(document, [...alone].join(','))) named.add(el)
  const root = document.documentElement
  if (chains.size === 0 || root === null) return named
  // Every element's place in document order: what a compound selector
  // matches is then one byte per element, read once for all the chains
  // that hold it.
  const place = new Map<Element, number>()
  for (const el of qsa(document, '*')) place.set(el, place.size)
  const matched = new Map<string, Uint8Array>()
  const fits: Uint8Array[] = []
  const child: boolean[] = []
  const opens: boolean[] = []
  const closes: boolean[] = []
  for (const steps of chains.values()) {
    for (const [index, step] of steps.entries()) {
      let flags = matched.get(step.compound)
      if (flags === undefined) {
        flags = new Uint8Array(place.size)
        for (const el of qsa(document, step.compound)) flags[place.get(el)!] = 1
        matched.set(step.compound, flags)
      }
      fits.push(flags)
      child.push(step.child)
      opens.push(index === 0)
      closes.push(index === steps.length - 1)
    }
  }
  resolveChains(root, place, fits, child, opens, closes, named)
  return named
}

/**
 * Adds to `named` the elements that chains of compound selectors name: one
 * pass in document order for all of them, which carries down the path from
 * the root how far each chain has come. The steps of all chains are numbered
 * in one row; `opens` marks the first step of a chain and `closes` its last.
 * For the element at each depth of the path, `here` says which steps end at
 * the element itself, and `above` which end at it or at one of its
 * ancestors: step i ends at an element that its compound selector matches
 * (`fits[i]`) and, unless it opens its chain, whose parent (after `>`), or
 * any ancestor, ends step i - 1. No step is tried twice for an element,
 * however many ways its ancestors fit the steps before it.
 */
function resolveChains(root: Element, place: ReadonlyMap<Element, number>, fits: readonly Uint8Array[], child: readonly boolean[], opens: readonly boolean[], closes: readonly boolean[], named: Set<Element>): void {
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
      const before = opens[i] ? 1 : depth === 0 ? 0 : child[i] ? here[parent + i - 1]! : above[parent + i - 1]!
      const ends = before === 1 && at !== undefined && fits[i]![at] === 1 ? 1 : 0
      here[row + i] = ends
      above[row + i] = ends === 1 || (depth > 0 && above[parent + i] === 1) ? 1 : 0
      if (ends === 1 && closes[i]) named.add(el)
    }
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
