/**
 * React's streamed server rendering, put together as the page's own scripts put it together (ROADMAP PA item 4).
 *
 * A React 18/19 page streams the parts that were not ready with its shell: the shell holds a boundary
 * (`<!--$?--><template id="B:0"></template>…fallback…<!--/$-->`) or a placeholder (`<template id="P:1">`), and the part
 * comes later in `<div hidden id="S:0">`, with an inline call that moves it into place:
 *
 * - `$RC("B:0","S:0")` (and `$RR`, the same with the stylesheets it waits for) completes a boundary: the fallback after
 *   the boundary's `<!--$?-->` marker, up to its matching `<!--/$-->`, gives way to the part's children;
 * - `$RS("S:1","P:1")` completes a segment: the part's children take the placeholder's place.
 *
 * Read without running scripts (the HTTP lane), the page is otherwise its shell with its body hidden outside it: x.com's
 * posts sit in a hidden `S:1` outside the `<main>` that holds the profile they belong to. The calls are applied here in
 * the order the page makes them; one whose part is not in the page (a page a browser already put together, a malformed
 * call) is skipped, and a part whose target is gone (a boundary in a fallback an earlier call replaced) is removed, as
 * React's calls remove the part before they look for its target.
 */

const STREAM_CALL = /\$R([CRS])\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g

/** How many calls one page's scripts are read for: a guard on a page that repeats them without end. */
const MAX_STREAM_CALLS = 10_000

/**
 * How many steps the calls may take, per element of the page: a node moved or removed, or a parent walked past to see
 * where an element is. A part streamed into a part moves its nodes again and sits deeper, so a page that nests each part
 * in the next one would otherwise take time quadratic in its size. A real page takes a few steps per node at most.
 */
const STEPS_PER_NODE = 4

interface Budget {
  left: number
}

/** Apply the page's streamed-rendering calls to its document, in place. Returns how many it applied. */
export function resolveReactStreaming(doc: Document): number {
  const calls: { kind: string; first: string; second: string }[] = []
  for (const script of Array.from(doc.querySelectorAll('script:not([src])'))) {
    const text = script.textContent ?? ''
    if (!text.includes('$R')) continue
    for (const match of text.matchAll(STREAM_CALL)) {
      calls.push({ kind: match[1]!, first: match[2]!, second: match[3]! })
      if (calls.length >= MAX_STREAM_CALLS) break
    }
    if (calls.length >= MAX_STREAM_CALLS) break
  }
  if (calls.length === 0) return 0
  // The page's ids, read once: the first element of each, as getElementById finds it.
  const byId = new Map<string, Element>()
  for (const el of Array.from(doc.querySelectorAll('[id]'))) if (!byId.has(el.id)) byId.set(el.id, el)
  const budget: Budget = { left: STEPS_PER_NODE * (doc.querySelectorAll('*').length + 1) }
  const page: Page = { doc, byId, budget }
  let applied = 0
  for (const call of calls) {
    if (budget.left <= 0) break
    if (call.kind === 'S' ? completeSegment(page, call.first, call.second) : completeBoundary(page, call.first, call.second)) applied++
  }
  return applied
}

interface Page {
  doc: Document
  byId: Map<string, Element>
  budget: Budget
}

/**
 * Where an element is, walking up its parents with each one charged: `detached` when it is not in the document (a
 * fallback a boundary removed, as getElementById would not find it) or the budget ran out, `inside` when `ancestor` is
 * one of its parents, else `placed`.
 */
function placeOf(page: Page, node: Node, ancestor: Node | null): 'detached' | 'inside' | 'placed' {
  for (let at: Node | null = node; at !== null; at = at.parentNode) {
    if (at === page.doc) return 'placed'
    if (at === ancestor) return 'inside'
    if (--page.budget.left < 0) return 'detached'
  }
  return 'detached'
}

/** Charge a call's moves and removals, or, when they would pass what is left, refuse it and stop the calls after it. */
function charge(budget: Budget, steps: number): boolean {
  if (steps > budget.left) {
    budget.left = 0
    return false
  }
  budget.left -= steps
  return true
}

/** A part whose target is gone, or that holds its own target, goes too: React's calls remove the part first. */
function dropPart(page: Page, segment: Element): false {
  if (charge(page.budget, 1)) segment.remove()
  return false
}

/** `$RS(segment, placeholder)`: the segment's children take the placeholder's place. */
function completeSegment(page: Page, segmentId: string, placeholderId: string): boolean {
  const segment = page.byId.get(segmentId)
  if (segment === undefined || placeOf(page, segment, null) !== 'placed') return false
  const placeholder = page.byId.get(placeholderId)
  if (placeholder === undefined || placeOf(page, placeholder, segment) !== 'placed' || placeholder.parentNode === null) return dropPart(page, segment)
  const children = Array.from(segment.childNodes)
  // A call that would pass the budget is not made, so no part is left half moved.
  if (!charge(page.budget, children.length)) return false
  segment.remove()
  for (const child of children) placeholder.parentNode.insertBefore(child, placeholder)
  placeholder.remove()
  return true
}

/** `$RC(boundary, segment)`: the boundary's fallback, up to its matching end marker, gives way to the segment's children. */
function completeBoundary(page: Page, boundaryId: string, segmentId: string): boolean {
  const segment = page.byId.get(segmentId)
  if (segment === undefined || placeOf(page, segment, null) !== 'placed') return false
  const boundary = page.byId.get(boundaryId)
  if (boundary === undefined || placeOf(page, boundary, segment) !== 'placed') return dropPart(page, segment)
  // A boundary whose sibling before it is not its marker comment is left as it is.
  const marker = boundary.previousSibling
  const parent = marker?.parentNode ?? null
  if (marker === null || parent === null || marker.nodeType !== 8) return dropPart(page, segment)
  // The fallback: what follows the marker up to its matching end marker, nested boundaries counted.
  const fallback: ChildNode[] = []
  let end = marker.nextSibling
  for (let depth = 0; end !== null && fallback.length <= page.budget.left; end = end.nextSibling) {
    if (end.nodeType === 8) {
      const data = (end as Comment).data
      if (data === '/$') {
        if (depth === 0) break
        depth--
      } else if (data === '$' || data === '$?' || data === '$!' || data === '$~') {
        depth++
      }
    }
    fallback.push(end)
  }
  const children = Array.from(segment.childNodes)
  // A call that would pass the budget is not made, so no part is left half moved.
  if (!charge(page.budget, fallback.length + children.length)) return false
  segment.remove()
  for (const node of fallback) node.remove()
  for (const child of children) parent.insertBefore(child, end)
  ;(marker as Comment).data = '$'
  return true
}
