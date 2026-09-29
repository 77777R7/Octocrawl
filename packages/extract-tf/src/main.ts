/**
 * Main-content selection: score ancestor containers by the text blocks they
 * contain, prefer semantic containers (article/main), and fall back to the
 * longest run of consecutive blocks when no container dominates.
 */

import { qsa, tagOf } from './dom.js'
import type { TextBlock } from './classify.js'
import { LAYOUT_MARKERS } from './markdown.js'

interface Candidate {
  el: Element
  score: number
  blockCount: number
  textLength: number
}

/** Small bonus per heading, so container quality beats raw size on tie. */
const HEADING_BONUS = 60
const SEMANTIC_BONUS = 200

function headingCount(container: Element): number {
  return qsa(container, 'h1,h2,h3,h4,h5,h6').length
}

const BLOCK_TAGS = new Set(LAYOUT_MARKERS.blockTags)

/**
 * The nearest ancestor laid out as a block, as the Markdown converter lays it
 * out: inline elements around a block (a <span>, an inline XBRL
 * <ix:nonNumeric>) are looked through.
 */
function layoutParent(el: Element): Element | null {
  let parent = el.parentElement
  while (parent && !BLOCK_TAGS.has(parent.localName) && parent.getAttribute(LAYOUT_MARKERS.display) !== 'block') {
    parent = parent.parentElement
  }
  return parent
}

/**
 * Pick the container (or container-like run) that represents main content.
 * Returns the element whose HTML should be emitted.
 */
export function selectMain(doc: Document, blocks: TextBlock[]): Element | null {
  if (blocks.length === 0) return null

  // Explicit semantic container: if article/main holds a reasonable share of
  // the blocks, trust it outright.
  for (const sel of ['article', 'main']) {
    const el = doc.querySelector(sel)
    if (!el) continue
    const inside = blocks.filter((b) => el.contains(b.el))
    if (inside.length >= blocks.length * 0.5) return el
  }

  // Blocks the body lays out itself sit in no container below it: an SEC
  // filing is written as sibling <div>s of the body, some wrapped in inline
  // XBRL elements. When they hold most of the text, the body is the region.
  const totalLength = blocks.reduce((sum, b) => sum + b.length, 0)
  const bodyText = blocks.filter((b) => layoutParent(b.el) === doc.body).reduce((sum, b) => sum + b.length, 0)
  if (doc.body && bodyText >= totalLength * 0.5) return doc.body

  // Score every container that holds at least one block.
  const candidates = new Map<Element, Candidate>()
  for (const block of blocks) {
    let el: Element | null = block.el.parentElement
    while (el && el !== doc.body && el !== doc.documentElement) {
      const cand = candidates.get(el) ?? { el, score: 0, blockCount: 0, textLength: 0 }
      cand.blockCount++
      cand.score += block.length
      cand.textLength += block.length
      candidates.set(el, cand)
      el = el.parentElement
    }
  }

  // Fold in bonuses.
  const list = Array.from(candidates.values())
  for (const c of list) {
    const tag = tagOf(c.el)
    if (tag === 'article' || tag === 'main') c.score += SEMANTIC_BONUS
    c.score += headingCount(c.el) * HEADING_BONUS
  }

  list.sort((a, b) => b.score - a.score)
  const best = list[0]
  // Every block sits directly in <body>, which is never a candidate: the body
  // is then the container (example.com is one paragraph and a link).
  if (!best) return longestRun(blocks)

  // A container wins when it holds most blocks or most of the text, or when
  // it dominates the best competing region. Its own ancestors and descendants
  // hold the same blocks, so they are not competitors: counting them would tie
  // one long block (a news release in a single <pre>) with its wrappers.
  const rival = list.find((c) => c !== best && !c.el.contains(best.el) && !best.el.contains(c.el))
  const second = rival?.score ?? 0
  if (
    best.blockCount >= blocks.length * 0.5 ||
    best.textLength >= totalLength * 0.5 ||
    second === 0 ||
    best.score >= second * 1.4
  ) {
    return best.el
  }

  // No dominant container: longest run of consecutive blocks (document order).
  return longestRun(blocks)
}

/**
 * Run of blocks sharing a common parent with the most text, or the single
 * longest block.
 */
function longestRun(blocks: TextBlock[]): Element | null {
  // Blocks arrive in document order (querySelectorAll order).
  let bestRun: TextBlock[] = []
  let bestLength = 0
  let run: TextBlock[] = []
  let runLength = 0
  let prevParent: Element | null = null
  for (const b of blocks) {
    if (prevParent === b.el.parentElement) {
      run.push(b)
      runLength += b.length
    } else {
      run = [b]
      runLength = b.length
      prevParent = b.el.parentElement
    }
    if (runLength > bestLength) {
      bestRun = run
      bestLength = runLength
    }
  }
  if (bestRun.length === 0) return null
  // Emit the common ancestor of the run.
  const parent = bestRun[0]!.el.parentElement
  return parent ?? bestRun[0]!.el
}
