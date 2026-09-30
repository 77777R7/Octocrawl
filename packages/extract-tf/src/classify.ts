/**
 * Block-level text classification: the paragraph filter trafilatura's cascade
 * runs before selecting the main region. Reference thresholds follow jusText /
 * trafilatura (link density <= 0.2, minimum text length), with a CJK carve-out
 * (CJK text carries meaning without sentence-final punctuation, and one CJK
 * char is roughly one token rather than 1/4).
 */

import { LAYOUT_MARKERS } from './markdown.js'

const MIN_TEXT_LENGTH = 25
const MIN_CJK_LENGTH = 8
const MAX_LINK_DENSITY = 0.2
// Structural content (table cells, list items) is inherently short; requiring
// prose-length text here would drop every table the fixtures exist to test.
const MIN_STRUCT_LENGTH = 5
const MIN_STRUCT_LENGTH_PRECISE = 12
/**
 * trafilatura's MIN_EXTRACTED_SIZE (250) times 3: below this much <p> text it
 * takes <div>s as paragraphs too. Here they must also hold that much prose
 * between them, so one alert <div> above a listing of cards does not make one.
 */
const MIN_PARAGRAPH_TEXT = 750

const CANDIDATES = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre'
const BLOCK_SELECTOR = LAYOUT_MARKERS.blockTags.join(',')

export interface TextBlock {
  /** Element the text came from. */
  el: Element
  /** Plain text of the block. */
  text: string
  /** Text length in characters. */
  length: number
  /** Fraction of text characters inside links, 0..1. */
  linkDensity: number
}

function isCjk(text: string): boolean {
  let cjk = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0xac00 && cp <= 0xd7af)
    ) {
      cjk++
    }
  }
  return cjk > 0 && cjk / text.length > 0.3
}

/** Does this look like running prose rather than a label/nav fragment? */
function looksProse(text: string): boolean {
  if (isCjk(text)) return true
  // ASCII prose: ends with sentence-final punctuation, or contains one mid-sentence.
  return /[.!?;:]["')\]]?\s|\.$|[.!?]$/.test(text.trim())
}

export interface ClassifyOptions {
  minTextLength?: number
  maxLinkDensity?: number
  /** Raise the structural threshold (table cells / list items) too. */
  favorPrecision?: boolean
}

/**
 * A <div> that is one paragraph: nothing inside it is laid out as a block,
 * and it is not already inside a candidate element.
 */
function isParagraphDiv(div: Element): boolean {
  return div.querySelector(BLOCK_SELECTOR) === null && div.closest(CANDIDATES) === null
}

/**
 * Extract and classify text blocks from a document.
 * Candidate elements: p, h1-h6, li, td, th, blockquote, pre, and paragraph
 * <div>s on a page that writes its prose in them instead of <p> (an SEC inline
 * XBRL filing has no <p> at all).
 *
 * Table cells (td/th) and list items (li) use a short structural threshold and
 * skip the prose test — structured content is short by nature and a
 * sentence-final-punctuation requirement would drop every table.
 */
export function classifyBlocks(
  doc: Document,
  options: ClassifyOptions = {},
): TextBlock[] {
  const minLength = options.minTextLength ?? MIN_TEXT_LENGTH
  const maxDensity = options.maxLinkDensity ?? MAX_LINK_DENSITY
  const structLength = options.favorPrecision ? MIN_STRUCT_LENGTH_PRECISE : MIN_STRUCT_LENGTH

  const paragraphText = Array.from(doc.querySelectorAll('p')).reduce((sum, p) => sum + (p.textContent ?? '').replace(/\s+/g, ' ').trim().length, 0)
  const divs = paragraphText < MIN_PARAGRAPH_TEXT
  const els = doc.querySelectorAll(divs ? `${CANDIDATES},div` : CANDIDATES)
  const blocks: TextBlock[] = []
  let divText = 0
  for (const el of Array.from(els)) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'div' && !isParagraphDiv(el)) continue
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text.length === 0) continue

    const structural = tag === 'td' || tag === 'th' || tag === 'li'

    // CJK carve-out: shorter text is meaningful.
    const threshold = isCjk(text) ? MIN_CJK_LENGTH : structural ? structLength : minLength
    if (text.length < threshold) continue

    const linkText = Array.from(el.querySelectorAll('a'))
      .map((a) => a.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const density = linkText.length / text.length

    if (density > maxDensity) continue
    if (!structural && !looksProse(text)) continue

    if (tag === 'div') divText += text.length
    blocks.push({ el, text, length: text.length, linkDensity: density })
  }
  return divText >= MIN_PARAGRAPH_TEXT ? blocks : blocks.filter((b) => b.el.tagName.toLowerCase() !== 'div')
}
