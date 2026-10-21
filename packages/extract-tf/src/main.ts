/**
 * Main-content selection: score ancestor containers by the text blocks they
 * contain, prefer semantic containers (article/main), and fall back to the
 * longest run of consecutive blocks when no container dominates.
 */

import { detach, qsa, tagOf } from './dom.js'
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

/** A chapter's number as its heading starts with it: "1. Introduction", "12. References". */
const CHAPTER_NUMBER = /^(\d+)\.\s+\S/

/**
 * Whether the body is one document whose parts it lays out as siblings: a header (title, status, publication date,
 * authors) and then chapters numbered 1, 2, 3… in order, with no article or main around them. An IETF RFC and a W3C
 * Recommendation are built this way, and the scoring below picks their longest chapter or appendix, dropping the
 * header and every other chapter (PA D6: RFC 9110 lost its publication header, WCAG 2.2 its status and date).
 *
 * The structure is read strictly, so that a page of independent sections is not widened to its body: every h1 of the
 * page sits before the first chapter; a chapter is a <div> or <section> child of the body with no h1, whose first h2
 * starts with its number; the numbers run from 1 without a gap, and at least three of the chapters hold prose. The
 * chapters together hold most of the page's text, so an appendix or index cannot carry the decision. A final chapter
 * of short linked entries (references) holds no prose and still counts in the sequence.
 *
 * What the body lays out after its last headed part and holds no prose is not part of the document: a respec page
 * appends a definition pop-up per term ("Permalink", "Referenced in: …") and a back-to-top link. It is removed.
 */
function flatDocument(doc: Document, blocks: TextBlock[], totalLength: number): boolean {
  const body = doc.body
  if (!body || body.querySelector('article,main,[role="main"]')) return false
  const children = Array.from(body.children)
  const chapters: Element[] = []
  for (const child of children) {
    const tag = tagOf(child)
    if ((tag !== 'div' && tag !== 'section') || child.querySelector('h1') !== null || hiddenRegion(child)) continue
    const number = CHAPTER_NUMBER.exec(headingText(child.querySelector('h2')))
    if (number === null) continue
    if (Number(number[1]) !== chapters.length + 1) return false
    chapters.push(child)
  }
  if (chapters.length < 3) return false
  const header = children.slice(0, children.indexOf(chapters[0]!))
  const titles = qsa(body, 'h1')
  if (titles.length === 0 || !titles.every((h1) => !hiddenRegion(h1) && header.some((child) => child.contains(h1)))) return false
  const inChapters = blocks.filter((b) => chapters.some((chapter) => chapter.contains(b.el)))
  if (chapters.filter((chapter) => inChapters.some((b) => chapter.contains(b.el))).length < 3) return false
  if (inChapters.reduce((sum, b) => sum + b.length, 0) < totalLength * 0.5) return false
  for (let i = children.length - 1; i >= 0 && children[i]!.querySelector('h1,h2,h3,h4,h5,h6') === null; i--) {
    const child = children[i]!
    if (!blocks.some((b) => child.contains(b.el))) detach(child)
  }
  return true
}

/** A heading's text with its runs of white space made one space, trimmed; empty for none. */
function headingText(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Pick the container (or container-like run) that represents main content.
 * Returns the element whose HTML should be emitted.
 */
export function selectMain(doc: Document, blocks: TextBlock[]): Element | null {
  const picked = pickRegion(doc, blocks)
  // A region the cascade found outside the page's <main>, when every h1 of the page is in that <main>, is not its
  // content: the blocks it won on are chrome (Sephora's category page, whose header promotion was its one block of
  // prose while its <main> held the title and the product tiles, link-heavy and so no blocks of their own). A region
  // in a part React streams hidden is left as it is: React streams a page's body in `<div hidden id="S:1">` outside
  // the <main> its script moves it into (x.com). A region the page hides is chrome as well (nasa.gov's closed
  // mega-menu, whose teasers and column headings outweighed the article in its <main>); with no such <main> it stands,
  // for the extractor to report as hidden.
  const main = doc.querySelector('main')
  if (picked === null || main === null || main.contains(picked) || picked.contains(main)) return picked
  if (picked.closest('[hidden]') !== null && !hiddenRegion(picked)) return picked
  const h1s = qsa(doc, 'h1')
  return h1s.length > 0 && h1s.every((h1) => main.contains(h1)) ? main : picked
}

function pickRegion(doc: Document, blocks: TextBlock[]): Element | null {
  if (blocks.length === 0) return null

  // Explicit semantic container: if article/main, or the element the page
  // marks role="main" (eBay's <div id="mainContent" role="main">), holds a
  // reasonable share of the blocks, trust it outright. A role="main" with an
  // h1 of the page outside it is not all of the content: a Stack Exchange
  // question's title sits above its #mainbar, a hero's above python.org's.
  for (const sel of ['article', 'main', '[role="main"]']) {
    const el = doc.querySelector(sel)
    if (!el) continue
    if (sel === '[role="main"]' && qsa(doc, 'h1').some((h1) => !el.contains(h1))) continue
    const inside = blocks.filter((b) => el.contains(b.el))
    if (inside.length >= blocks.length * 0.5) return el
  }

  // Blocks the body lays out itself sit in no container below it: an SEC
  // filing is written as sibling <div>s of the body, some wrapped in inline
  // XBRL elements. When they hold most of the text, the body is the region.
  const totalLength = blocks.reduce((sum, b) => sum + b.length, 0)
  const bodyText = blocks.filter((b) => layoutParent(b.el) === doc.body).reduce((sum, b) => sum + b.length, 0)
  if (doc.body && bodyText >= totalLength * 0.5) return doc.body

  // A document laid out flat in the body, its header beside its numbered chapters: the whole body (see flatDocument).
  if (flatDocument(doc, blocks, totalLength)) return doc.body

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

/**
 * Whether the page hides the region: it, or an element around it, carries `hidden`. What the page does not show is not
 * its content, however much text it holds (ROADMAP PA item 4: Eurostat's data browser read in a browser, whose only
 * prose was the EU banner's hidden dropdown, answered `success` with it). A hidden part inside a shown region, a
 * collapsed answer for one, stays part of that region. Not hidden: `hidden="until-found"`, which a reader's search
 * opens; a React streaming segment (`<div hidden id="S:1">`), which the page's script moves into place; and
 * `aria-hidden`, which a modal sets on the page behind it and which hides nothing from the eye.
 */
export function hiddenRegion(region: Element): boolean {
  for (let el: Element | null = region; el !== null; el = el.parentElement) {
    const hidden = el.getAttribute('hidden')
    if (hidden !== null && hidden.toLowerCase() !== 'until-found' && !reactStreamedSegment(el)) return true
  }
  return false
}

/** The id React gives a part of the page it streams hidden and then moves into place (an optional identifier prefix, `S:`, a hex number). */
const REACT_STREAMED_SEGMENT = /S:[0-9a-f]+$/i

/**
 * Whether a hidden element is a part React streams: `<div hidden id="S:1">`, or inside a table a bare `<table hidden>`
 * around the part that carries the id (`<tbody id="S:1">`, `<colgroup id="S:1">`, or `<tr id="S:1">` under the tbody
 * the parser adds).
 */
function reactStreamedSegment(el: Element): boolean {
  if (REACT_STREAMED_SEGMENT.test(el.id)) return true
  if (el.tagName.toLowerCase() !== 'table' || el.id !== '') return false
  const part = el.firstElementChild
  if (part === null) return false
  if (REACT_STREAMED_SEGMENT.test(part.id)) return true
  return part.tagName.toLowerCase() === 'tbody' && part.id === '' && REACT_STREAMED_SEGMENT.test(part.firstElementChild?.id ?? '')
}
