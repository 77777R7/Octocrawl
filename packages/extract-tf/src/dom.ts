/**
 * Thin DOM adapter over linkedom. The bake-off (research/dom_bakeoff.md)
 * settled on linkedom as the parse layer; this module keeps every linkedom
 * touchpoint in one file so the implementation can be swapped for jsdom as a
 * regression oracle without touching the cascade.
 */

import { parseHTML } from 'linkedom'

export interface DomDoc {
  document: Document
  /** Release resources when available (no-op for linkedom). */
  close(): void
}

export function parse(html: string): DomDoc {
  let { document } = parseHTML(html)
  // linkedom parses '' (and whitespace-only input) to a document whose
  // documentElement is null; its head/body getters then THROW on access.
  // Real crawls hit empty 200 bodies constantly (the empty-body fixture),
  // so normalize to a minimal empty document instead.
  const root = (document as unknown as { documentElement: Element | null }).documentElement
  if (root == null) {
    ;({ document } = parseHTML('<html><head></head><body></body></html>'))
  } else if (root.tagName !== 'HTML') {
    document = rooted(document as unknown as Document) as unknown as typeof document
  }
  unwrapStrayHeads(document as unknown as Document)
  return {
    document: document as unknown as Document,
    close: () => {},
  }
}

/** Elements a browser puts in <head> when they come before any content. */
const HEAD_ELEMENTS = new Set(['BASE', 'LINK', 'META', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'TEMPLATE', 'TITLE'])

/**
 * A document without <html> rebuilt as <html><head><body>, as a browser
 * builds it. linkedom has no implied elements: it makes the first top-level
 * element the documentElement, leaves the elements after it as its siblings,
 * and its `body` getter inserts an empty <head> and <body> into that element.
 * `<!doctype html><table>…` then had an empty body and a table as its root,
 * and `<!doctype html><head>…</head><body>…</body>` lost its body.
 */
function rooted(parsed: Document): Document {
  const { document } = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const html = document.documentElement
  const head = document.head
  const body = document.body
  let inBody = false
  const copyAttributes = (from: Element, to: Element): void => {
    for (const { name, value } of Array.from(from.attributes)) if (!to.hasAttribute(name)) to.setAttribute(name, value)
  }
  const place = (node: Node): void => {
    if (node.nodeType === 1) {
      const el = node as Element
      if (el.tagName === 'HTML' || el.tagName === 'HEAD' || el.tagName === 'BODY') {
        copyAttributes(el, el.tagName === 'HTML' ? html : el.tagName === 'HEAD' ? head : body)
        if (el.tagName === 'BODY') inBody = true
        for (const child of Array.from(el.childNodes)) place(child)
        return
      }
      if (!inBody && HEAD_ELEMENTS.has(el.tagName)) {
        head.appendChild(document.importNode(el, true))
        return
      }
      inBody = true
      body.appendChild(document.importNode(el, true))
    } else if (node.nodeType === 3) {
      if (!inBody && (node.textContent ?? '').trim() === '') return
      inBody = true
      body.appendChild(document.importNode(node, true))
    } else if (node.nodeType === 8) {
      ;(inBody ? body : head).appendChild(document.importNode(node, true))
    }
  }
  for (const node of Array.from(parsed.childNodes)) place(node)
  return document as unknown as Document
}

/**
 * A browser ignores a <head> tag inside the body; linkedom makes it an
 * element, and since `<head/>` is an open tag (a slash closes only void
 * elements) everything after it up to its parent's end went inside it, where
 * the Markdown skips it. Each such element is replaced by its children.
 * The document's own head, a child of <html> or the root itself, stays.
 */
function unwrapStrayHeads(document: Document): void {
  const root = document.documentElement
  for (const head of Array.from(document.querySelectorAll('head'))) {
    const parent = head.parentNode
    if (!parent || head === root || (parent === root && root.tagName === 'HTML')) continue
    while (head.firstChild) parent.insertBefore(head.firstChild, head)
    parent.removeChild(head)
  }
}

/** All elements matching a CSS selector, in document order. */
export function qsa(scope: ParentNode, selector: string): Element[] {
  try {
    return Array.from(scope.querySelectorAll(selector))
  } catch {
    // Invalid selector: the caller's problem, surfaced as "no match".
    return []
  }
}

export function qs(scope: ParentNode, selector: string): Element | null {
  try {
    return scope.querySelector(selector)
  } catch {
    return null
  }
}

let probe: Document | undefined

/** The DOM layer's complaint about a CSS selector it cannot parse or compile, or null when it can. */
export function selectorSyntaxError(selector: string): string | null {
  try {
    probe ??= parse('<html><body></body></html>').document
    probe.querySelector(selector)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Serialize an element back to HTML. */
export function outerHtml(el: Element): string {
  return el.outerHTML
}

/** Detach a node from the tree (deletion, not hiding). */
export function detach(node: Node): void {
  node.parentNode?.removeChild(node)
}

/**
 * Detach elements a caller named, each with all it holds. A document's root
 * element is emptied instead: linkedom's `head` and `body` getters throw on
 * a document that has none (see `parse`).
 */
export function detachAll(elements: Iterable<Element>): void {
  for (const el of elements) {
    if (el === el.ownerDocument?.documentElement) el.replaceChildren()
    else detach(el)
  }
}

export function textOf(el: Element): string {
  return el.textContent ?? ''
}

/** All element children of a node. */
export function children(el: Element): Element[] {
  return Array.from(el.children)
}

/** Tag name, lower-cased. */
export function tagOf(el: Element): string {
  return el.tagName.toLowerCase()
}

/**
 * Lowest element that contains both `a` and `b`, or null when they are in
 * different trees. Used wherever a strategy must widen from a single anchor
 * node (a heading, a price) to the region that actually holds the content.
 */
export function commonAncestor(a: Element, b: Element): Element | null {
  const ancestors = new Set<Element>()
  let p: Element | null = a.parentElement
  while (p) {
    ancestors.add(p)
    p = p.parentElement
  }
  p = b
  while (p) {
    if (ancestors.has(p)) return p
    p = p.parentElement
  }
  return null
}

/**
 * A table that lays out other tables: the tables nested in it hold at least
 * half of its text (Hacker News puts its header, story list and footer in
 * one). A data table with a small table in one of its cells is not one.
 */
export function isLayoutTable(table: Element): boolean {
  const nested = qsa(table, 'table').filter((inner) => inner.parentElement?.closest('table') === table)
  if (nested.length === 0) return false
  const length = (el: Element): number => (el.textContent ?? '').replace(/\s+/g, '').length
  return nested.reduce((sum, inner) => sum + length(inner), 0) * 2 >= length(table)
}
