/**
 * HTML → Markdown after main-content extraction.
 *
 * ExtractorOutput.mainHtml stays HTML (the extractor's job is the region).
 * This is pipeline step 7: turn that region into LLM-ready Markdown
 * (CommonMark, with GFM tables).
 *
 * The walk follows the browser's default layout without CSS: block elements
 * start new Markdown blocks, the inline content between them forms one
 * paragraph, and whitespace collapses the way a browser collapses it.
 * Tables keep the GFM grid rules the fixture suite already scores.
 *
 * Where a browser capture saw the page's CSS lay an element out differently,
 * its copy of the page carries LAYOUT_MARKERS, and the walk follows them: a
 * marked inline element is a block, a marked hidden one is skipped with all
 * it contains. HTML without markers converts by its tags alone.
 */

import { detachAll, isLayoutTable, parse } from './dom.js'
import { namedBy } from './selectors.js'
import { documentBaseUrl } from './links.js'

export interface MarkdownOptions {
  /**
   * Base for relative link and image targets: the document base URL
   * (ExtractorOutput.baseUrl). A whole document's own `<base href>` is
   * resolved against it. Without a base, targets stay as written.
   */
  baseUrl?: string | null
  /**
   * CSS selectors whose elements are left out with all they contain: the
   * caller's exclusions on a whole page, which no extraction pruned.
   */
  exclude?: readonly string[]
  /**
   * What becomes of an image whose `src` is a `data:` URI. `drop` (the
   * default, Firecrawl's `removeBase64Images`): the image is left out and
   * its alt text kept. `keep`: it is written as `![alt](data:…)`, and the
   * token count then counts it. A `data:` link target is always dropped.
   */
  dataUriImages?: 'drop' | 'keep'
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

/** Never content: skipped together with everything inside. */
const SKIP = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'base',
  'button', 'input', 'select', 'option', 'optgroup', 'datalist', 'textarea',
  'svg', 'canvas', 'iframe', 'object', 'embed', 'audio', 'video', 'source', 'track', 'map', 'area',
  // An inline XBRL filing's hidden facts and contexts.
  'ix:header',
])

/** Elements a browser lays out as blocks by default. Everything else is inline. */
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'dd', 'details', 'dialog',
  'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'html', 'legend', 'li', 'main', 'menu', 'nav', 'ol',
  'p', 'pre', 'search', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])

const LIST = new Set(['ul', 'ol', 'menu', 'dir'])

/**
 * The layout markers a browser capture sets on its own copy of the rendered
 * page, never on the page it keeps as evidence. They go on elements the walk
 * would lay out inline: the tags it lays out as blocks keep that layout, and
 * the tags it skips need none.
 */
export const LAYOUT_MARKERS = {
  /** Set to "block" where the page's CSS lays out an element as a block. */
  display: 'data-w2l-display',
  /** Set where the page's CSS hides an element (display: none). */
  hidden: 'data-w2l-hidden',
  /** Tags the walk lays out as blocks. */
  blockTags: [...BLOCK] as readonly string[],
  /** Tags the walk skips with all they contain. */
  skipTags: [...SKIP] as readonly string[],
} as const

/** HTML's collapsible whitespace, plus the no-break space, which becomes a plain space. */
const WHITESPACE = /[\t\n\f\r \u00a0]+/g

/** Script forms for `<sup>` and `<sub>`: digits, signs and the few letters Unicode has. */
const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
}
const SUBSCRIPT: Readonly<Record<string, string>> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ',
}

/**
 * The script form of a superscript or subscript when every character has
 * one (`m<sup>2</sup>` is m², `H<sub>2</sub>O` is H₂O), else null. Without
 * it a unit's exponent joins the number the page writes next to it: a data
 * centre's `12,000 ft<sup>2</sup> 1,100 m<sup>2</sup>` read "12,000 ft 21,100
 * m 2", and the square-metre figure could not be found in the text.
 */
function scriptText(text: string, tag: string): string | null {
  const map = tag === 'sup' ? SUPERSCRIPT : SUBSCRIPT
  const mapped = Array.from(text).map((c) => map[c])
  return text.length > 0 && mapped.every((c) => c !== undefined) ? mapped.join('') : null
}

interface Context {
  base: URL | null
  /** containsBlock results, so the walk stays linear in the size of the tree. */
  blockMemo: Map<Element, boolean>
  /** The HTML carries layout markers. */
  layout: boolean
  /** `data:` image URIs are written as targets instead of being dropped (MarkdownOptions.dataUriImages 'keep'). */
  keepDataUriImages: boolean
  /** When set, every data table the walk writes as a GFM table is also collected here, in document order (htmlToTables). */
  tables?: ExtractedTable[]
  /** What the collected tables of this page may still hold, in MAX_PAGE_TABLE_CHARS units; shared by every table of one walk. */
  tableBudget?: { left: number }
  /** What the GFM grids of this page's tables may still add as empty cells (MAX_PAGE_TABLE_PADDING). */
  tablePadding: { left: number }
  /**
   * The emphasis of a <b> or <em> (and the like) around blocks: its markers,
   * outermost first, around each paragraph the walk writes in it, and the
   * marks its inline content starts from, so a <b> in it adds none.
   */
  emphasis?: { markers: string[]; marks: Marks }
}

/** Never content, or hidden by the page's CSS: skipped together with everything inside. */
function skipped(el: Element, ctx: Context): boolean {
  return SKIP.has(el.localName) || (ctx.layout && el.hasAttribute(LAYOUT_MARKERS.hidden))
}

/** Laid out as a block by the page's CSS, whatever its tag. */
function cssBlock(el: Element, ctx: Context): boolean {
  return ctx.layout && el.getAttribute(LAYOUT_MARKERS.display) === 'block'
}

/** An element's text without the parts the page's CSS hides. */
function shownText(el: Element, ctx: Context): string {
  if (!ctx.layout) return el.textContent ?? ''
  let text = ''
  // In document order, on a stack of the next node at each level, so a deep page costs no stack frames.
  const next: (Node | null)[] = [el.firstChild]
  while (next.length > 0) {
    const node = next[next.length - 1]!
    if (node === null) {
      next.pop()
      continue
    }
    next[next.length - 1] = node.nextSibling
    if (node.nodeType === TEXT_NODE) text += (node as Text).data
    else if (node.nodeType === ELEMENT_NODE && !(node as Element).hasAttribute(LAYOUT_MARKERS.hidden)) next.push(node.firstChild)
  }
  return text
}

/** One rendered Markdown block, without surrounding blank lines. */
interface Block {
  text: string
  /** A list that may follow a paragraph without a blank line (bullets, or numbers from 1). */
  interrupts?: boolean
}

// ---------------------------------------------------------------- tables

function normalizeCell(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')
}

/**
 * A cell's inline content on one line: links and images keep their targets,
 * as in a paragraph; emphasis and code are plain text; <br> and block
 * boundaries are spaces, so separate lines stay separate words.
 */
function cellText(cell: Element, ctx: Context): string {
  const inline = new Inline({ escape: true })
  inlineChildren(cell, inline, ctx, CELL_MARKS)
  return inline.finish().text.replace(/\n/g, ' ')
}

/** The span limits browsers apply (HTML: colspan at most 1000, rowspan at most 65534). */
const MAX_COLSPAN = 1000
const MAX_ROWSPAN = 65534
/**
 * The most empty cells the GFM grid of one table, and of all a page's
 * tables together, may add for spans and short rows (each is written as
 * ` | `). Padding is what lets a small page make a huge one: one wide row
 * over many one-cell rows pads every row to its width. A table past either
 * is written as its rows of cells, unpadded.
 */
export const MAX_TABLE_PADDING = 500_000
export const MAX_PAGE_TABLE_PADDING = 2_000_000

type GridCell = { value: string; colspan: number; rowspan: number }

/**
 * The cells of a table, one grid row per HTML row, a spanned cell's value
 * in every slot it covers (`fill: 'repeat'`) or in its first slot with the
 * others empty (`fill: 'empty'`, the GFM table), every row padded to the
 * widest; null once the grid would hold more than `maxPadding` slots that
 * are not a cell's first.
 */
function expandGrid(rows: GridCell[][], maxPadding: number, fill: 'empty' | 'repeat' = 'empty'): string[][] | null {
  const out: string[][] = []
  // Column → the rowspans started over it, newest last, each covering the rows before its `end`.
  const vertical = new Map<number, { end: number; value: string }[]>()
  let slots = 0
  let cells = 0
  for (let y = 0; y < rows.length; y++) {
    const row: string[] = []
    let cursor = 0
    // The rowspans still covering `col` in this row, newest last. Ended spans
    // are popped from the top as they are met, so a row's work is one look per
    // column it covers plus the spans it pops, never every span still pending.
    const live = (col: number) => {
      const spans = vertical.get(col)
      if (spans === undefined) return undefined
      while (spans.length > 0 && spans[spans.length - 1]!.end <= y) spans.pop()
      if (spans.length > 0) return spans
      vertical.delete(col)
      return undefined
    }
    // A slot two spans cover (a table model error) holds the later cell's value.
    const covered = (spans: { value: string }[]) => (fill === 'repeat' ? spans[spans.length - 1]!.value : '')
    const fillOccupied = () => {
      for (let spans = live(cursor); spans !== undefined; spans = live(cursor)) row[cursor++] = covered(spans)
    }
    for (const cell of rows[y]!) {
      fillOccupied()
      row[cursor] = cell.value
      const cs = cell.colspan
      const rs = cell.rowspan
      if (cs > 1) for (let x = 1; x < cs; x++) row[++cursor] = fill === 'repeat' ? cell.value : ''
      // Its columns are behind the cursor now, so the span is not met again in this row.
      if (rs > 1) {
        for (let col = cursor - cs + 1; col <= cursor; col++) {
          const spans = vertical.get(col)
          if (spans) spans.push({ end: y + rs, value: cell.value })
          else vertical.set(col, [{ end: y + rs, value: cell.value }])
        }
      }
      cursor++
      if (slots + cursor - ++cells > maxPadding) return null
    }
    // A rowspan covers every row it spans, as browsers do, also where the
    // row's cells end before its column (the gap between is padding).
    for (const col of vertical.keys()) {
      const spans = live(col)
      if (spans !== undefined && col >= cursor) row[col] = covered(spans)
    }
    slots += row.length
    if (slots - cells > maxPadding) return null
    out.push(row)
  }
  // A loop, not Math.max(...rows): a table of 200,000 rows would overflow the call stack.
  let width = 0
  for (const r of out) width = Math.max(width, r.length)
  if (width * out.length - cells > maxPadding) return null
  return out.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? ''))
}

const ROW_GROUPS = new Set(['thead', 'tbody', 'tfoot'])

/**
 * The `<thead>`, `<tbody>` or `<tfoot>` of the table a row is in, or null for
 * a row directly in the table (a fragment's). The walk stops at the table, so
 * a deep page costs no more than the row's own depth.
 */
function rowGroup(tr: Element, table: Element): Element | null {
  for (let el = tr.parentElement; el !== null && el !== table; el = el.parentElement) {
    if (ROW_GROUPS.has(el.localName)) return el
  }
  return null
}

/**
 * The table's first `<thead>` and first `<tfoot>` in tree order, empty ones
 * included, as CSS takes the first of each as the header and footer. One
 * written in a cell counts too, as the browser's parser closes the cell there;
 * nested tables are not searched.
 */
function headAndFoot(table: Element): { head: Element | null; foot: Element | null } {
  let head: Element | null = null
  let foot: Element | null = null
  const stack: Element[] = []
  for (let child = table.lastElementChild; child !== null; child = child.previousElementSibling) stack.push(child)
  for (let el = stack.pop(); el !== undefined && (head === null || foot === null); el = stack.pop()) {
    if (el.localName === 'thead') head ??= el
    else if (el.localName === 'tfoot') foot ??= el
    if (el.localName === 'table') continue
    // One push per child, not push(...children): a <div> of 30,000 rows would overflow the call stack.
    for (let child = el.lastElementChild; child !== null; child = child.previousElementSibling) stack.push(child)
  }
  return { head, foot }
}

/**
 * The table's own rows, not those of a table nested in one of its cells, by
 * row group in the order browsers lay them out: the first `<thead>` first and
 * the first `<tfoot>` last, wherever they are written. A later `<thead>` or
 * `<tfoot>` stays where it is, as CSS lays out only the first as the header
 * or footer. Each run of rows directly in the table is a group of its own,
 * as the browser's parser wraps each in a `<tbody>`.
 */
function ownRowGroups(table: Element): Element[][] {
  const runs: { group: Element | null; rows: Element[] }[] = []
  for (const tr of ownElements(table, ROWS, 'table')) {
    const group = rowGroup(tr, table)
    const last = runs[runs.length - 1]
    if (last !== undefined && last.group === group) last.rows.push(tr)
    else runs.push({ group, rows: [tr] })
  }
  const { head, foot } = headAndFoot(table)
  const headRun = head === null ? undefined : runs.find((run) => run.group === head)
  const footRun = foot === null ? undefined : runs.find((run) => run.group === foot)
  const body = runs.filter((run) => run !== headRun && run !== footRun)
  return [...(headRun ? [headRun] : []), ...body, ...(footRun ? [footRun] : [])].map((run) => run.rows)
}

function ownRows(table: Element): Element[] {
  return ownRowGroups(table).flat()
}

/** A row's own cells, not those of a table nested in one of them. */
function ownCells(tr: Element): Element[] {
  return ownElements(tr, CELLS, 'tr')
}

const ROWS = new Set(['tr'])
const CELLS = new Set(['th', 'td'])

/**
 * The elements of the names under `top`, in tree order, not looking into an
 * element named `stop` (a nested table's rows are its own), an svg or math
 * (whose <tr> or <td> is not a row or cell) or a <template>'s content (not
 * the page's, as querySelectorAll does not find it). Each element is looked at
 * once, so a table nested thousands deep costs its size, not its size times
 * its depth.
 */
function ownElements(top: Element, names: Set<string>, stop: string): Element[] {
  const found: Element[] = []
  const next: (Element | null)[] = [top.firstElementChild]
  while (next.length > 0) {
    const el = next[next.length - 1]!
    if (el === null) {
      next.pop()
      continue
    }
    next[next.length - 1] = el.nextElementSibling
    const name = el.localName
    if (names.has(name)) found.push(el)
    if (name !== stop && name !== 'svg' && name !== 'math' && name !== 'template') next.push(el.firstElementChild)
  }
  return found
}

/**
 * An attribute read by HTML's rules for parsing non-negative integers:
 * leading whitespace, an optional sign, then the leading digits (`1.5` is 1,
 * `2abc` is 2); null when absent, when no digit follows, or when negative.
 */
function nonNegativeInteger(attr: string | null): number | null {
  const m = attr === null ? null : /^[\t\n\f\r ]*([-+]?)([0-9]+)/.exec(attr)
  if (m === null) return null
  const n = Number(m[2])
  return m[1] === '-' && n !== 0 ? null : n
}

/**
 * A table's caption and cells as `cell` writes each one; a table nested in a
 * cell is that cell's text. Spans are integers of at least 1, read as browsers
 * read them: a colspan that is invalid or 0 is 1, an invalid rowspan is 1, a
 * rowspan of 0 covers the rest of its row group (its `<thead>`, `<tbody>` or
 * `<tfoot>`, or the run of rows directly in the table), and no rowspan goes
 * past the end of its row group.
 */
function tableCells(table: Element, cell: (el: Element) => string): { caption: string | null; rows: GridCell[][] } {
  const captionEl = table.querySelector(':scope > caption')
  const groups = ownRowGroups(table)
  const trs = groups.flat()
  // Row → how many rows from it to the end of its row group.
  const groupLeft = groups.flatMap((group) => group.map((_, i) => group.length - i))
  const rows = trs.map((tr, r) => ownCells(tr).map((el) => {
    const rowspan = nonNegativeInteger(el.getAttribute('rowspan')) ?? 1
    return {
      value: cell(el),
      colspan: Math.min(nonNegativeInteger(el.getAttribute('colspan')) || 1, MAX_COLSPAN),
      rowspan: Math.min(rowspan === 0 ? groupLeft[r]! : rowspan, groupLeft[r]!, MAX_ROWSPAN),
    }
  }))
  return { caption: captionEl ? cell(captionEl) : null, rows }
}

/**
 * The most characters a table's rows may hold once its spans are repeated
 * into every slot they cover and every row is padded to the widest, and the
 * most all of a page's tables may hold together; past either, a table is
 * given as `omitted: 'too_large'` with no rows, so a small page cannot make a
 * huge CSV or response. A cell counts what its CSV field and its JSON string
 * cost: its text, each `"` three more times (`""` in CSV, escaped again in
 * JSON), each `\` once more and each control character five more (`\u00XX`
 * in JSON), plus three for the separators and quotes.
 */
export const MAX_TABLE_CHARS = 2_000_000
export const MAX_PAGE_TABLE_CHARS = 5_000_000

function cellCost(value: string): number {
  let extra = 3
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c === 34) extra += 3
    else if (c === 92) extra += 1
    // JSON writes a control character as \u00XX.
    else if (c < 32) extra += 5
  }
  return value.length + extra
}

/**
 * One data table as data: its caption and cells as plain text (a link is its
 * text, an image its alt text, whitespace collapsed, no Markdown escaping),
 * a spanned cell's value in every slot it covers, and how many leading rows
 * are headers (in `<thead>`, or made of `<th>` cells alone). Null when it
 * has no cells, as the GFM table is then empty.
 */
function tableData(table: Element, ctx: Context, tableIndex: number): ExtractedTable | null {
  const { caption, rows } = tableCells(table, (el) => plainCell(el, ctx))
  if (rows.every((row) => row.length === 0)) return null
  // What the repeated spans would hold, before any of it is built (a span past the last row adds nothing).
  let chars = 0
  let spanSlots = 0
  let cellCount = 0
  rows.forEach((row, r) => {
    for (const cell of row) {
      const slots = cell.colspan * Math.min(cell.rowspan, rows.length - r)
      chars += cellCost(cell.value) * slots
      spanSlots += slots
      cellCount++
    }
  })
  const budget = ctx.tableBudget
  const limit = Math.min(MAX_TABLE_CHARS, budget?.left ?? Infinity)
  const omitted: ExtractedTable = { tableIndex, caption: caption === '' ? null : caption, headerRows: 0, rows: [], omitted: 'too_large' }
  if (chars > limit) return omitted
  // Every slot past the spans pads a row to the widest and costs cellCost('') = 3:
  // the grid may hold (limit - chars) / 3 of them, and expandGrid stops building
  // once it would hold more.
  const grid = expandGrid(rows, spanSlots - cellCount + Math.floor((limit - chars) / 3), 'repeat')
  if (grid === null) return omitted
  if (budget !== undefined) budget.left -= chars + 3 * (grid.length * grid[0]!.length - spanSlots)
  let headerRows = 0
  for (const tr of ownRows(table)) {
    const cells = ownCells(tr)
    if (cells.length === 0 || !(rowGroup(tr, table)?.localName === 'thead' || cells.every((el) => el.localName === 'th'))) break
    headerRows++
  }
  return { tableIndex, caption: caption === '' ? null : caption, headerRows, rows: grid }
}

function plainCell(cell: Element, ctx: Context): string {
  const inline = new Inline({ escape: false })
  inlineChildren(cell, inline, ctx, TEXT_MARKS)
  return inline.finish().text.replace(/\s+/g, ' ').trim()
}

function tableToGfm(table: Element, ctx: Context): string {
  const { caption, rows } = tableCells(table, (el) => normalizeCell(cellText(el, ctx)))
  if (rows.every((row) => row.length === 0)) return ''
  if (ctx.tables !== undefined) {
    const data = tableData(table, ctx, ctx.tables.length)
    if (data !== null) ctx.tables.push(data)
  }
  const budget = ctx.tablePadding
  const grid = expandGrid(rows, Math.min(MAX_TABLE_PADDING, budget.left))
  // Too large to pad: each row's own cells, in order and unpadded (GFM fills
  // a short body row and drops cells past the header's width when rendering;
  // the text keeps them), so it stays one table of the Markdown.
  if (grid === null) {
    const lines = caption ? [caption] : []
    const header = rows[0]!.length > 0 ? rows[0]!.map((cell) => cell.value) : ['']
    lines.push(`| ${header.join(' | ')} |`)
    lines.push(`| ${header.map(() => '---').join(' | ')} |`)
    for (const row of rows.slice(1)) lines.push(`| ${row.map((cell) => cell.value).join(' | ')} |`)
    return lines.join('\n')
  }
  budget.left -= grid.length * grid[0]!.length - rows.reduce((n, row) => n + row.length, 0)
  // An empty corner cell stays empty: GFM allows it, and any text put there
  // would not be on the page.
  const header = grid[0]!
  const lines: string[] = []
  if (caption) lines.push(caption)
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`| ${header.map(() => '---').join(' | ')} |`)
  for (const row of grid.slice(1)) lines.push(`| ${row.join(' | ')} |`)
  return lines.join('\n')
}

// ---------------------------------------------------------------- inline content

interface InlineResult {
  text: string
  /** Whitespace or a line break before or after the text, re-emitted outside a wrapper's markers. */
  lead: boolean
  trail: boolean
  leadBreak: boolean
  trailBreak: boolean
  /** How much of the text's start and end was written from text, not Markdown of the walk's own (a link, code, an image, emphasis). */
  textLead: number
  textTrail: number
  /**
   * For text ending with an emphasis run that a letter after it would make
   * write otherwise (see closedBeforeLetter): the text so written, without
   * the punctuation moved after the run, and that punctuation.
   */
  closedBeforeLetter?: { text: string; moved: string }
}

/**
 * The inline content of one paragraph (or of one link, emphasis or heading),
 * with whitespace collapsed as a browser collapses it. A '\n' in the text is a
 * <br>.
 */
class Inline {
  private readonly parts: string[] = []
  /** Whether each part was written from text (white space included), not Markdown of the walk's own. */
  private readonly fromText: boolean[] = []
  private any = false
  private lineStarted = false
  private pendingSpace = false
  private lead = false
  private leadBreak = false
  /** Whether text written now starts a line of the Markdown (a paragraph's own first line, or after a <br>). */
  private atLineStart: boolean
  /**
   * The emphasis run the last part is (its marker and what is between the
   * markers): an adjacent run of it continues it instead of writing `****`,
   * and punctuation ending it moves after its closing marker when a letter
   * follows (see emphasize).
   */
  private lastEmphasis: Emphasis | null = null
  /** Text not yet written (see text), in pieces, and whether the last ends in a space. */
  private pendingText: string[] = []
  private pendingEndsSpace = false
  /** The code of the code span the last part is, so an adjacent one joins it instead of writing a double backtick. */
  private lastCode: { pieces: string[]; longest: number; tail: number; startsTick: boolean; endsTick: boolean } | null = null
  /**
   * How to write the last part once nothing more joins it: a run that adjacent
   * runs joined keeps its pieces and is written once, as rewriting it at each
   * join would cost its whole length each time.
   */
  private unwritten: (() => string) | null = null

  private settle(): void {
    if (this.unwritten === null) return
    this.parts[this.parts.length - 1] = this.unwritten()
    this.unwritten = null
  }

  /**
   * `paragraph`: the inline content of a paragraph, whose first line starts a
   * line of the Markdown (a link's or emphasis's starts after its marker).
   * `escape`: text is escaped where CommonMark would read it as Markdown
   * (not in code, nor in the plain text of the `tables` format). `link`: in
   * a link's text, where an unbalanced bracket would end the link. `before`:
   * in an emphasis run, the character before its opening marker, which
   * CommonMark reads with the markers of a run opened at its start too.
   */
  constructor(private readonly options: { paragraph?: boolean; escape?: boolean; link?: boolean; before?: string } = {}) {
    this.atLineStart = options.paragraph === true
  }

  /**
   * Text, collected until other content, a break or the end follows: the
   * parser splits text at each entity (`&lt;div&gt;` is five nodes), and the
   * text is escaped as a whole, so each character is read with its
   * neighbours.
   */
  text(raw: string): void {
    const text = raw.replace(WHITESPACE, ' ')
    if (text.length === 0) return
    const piece = this.pendingEndsSpace && text.startsWith(' ') ? text.slice(1) : text
    if (piece.length === 0) return
    this.pendingText.push(piece)
    this.pendingEndsSpace = piece.endsWith(' ')
  }

  private flushText(): void {
    if (this.pendingText.length === 0) return
    const text = this.pendingText.join('')
    this.pendingText = []
    this.pendingEndsSpace = false
    const leading = text.startsWith(' ')
    const trailing = text.length > 1 && text.endsWith(' ')
    if (leading) this.space()
    const core = text.slice(leading ? 1 : 0, trailing ? -1 : undefined)
    if (core) this.content(this.options.escape === false ? core : escapeText(core, this.atLineStart && !this.pendingSpace, this.options.link === true), true)
    if (trailing) this.space()
  }

  space(): void {
    this.flushText()
    this.settle()
    this.lastEmphasis = null
    if (this.lineStarted) this.pendingSpace = true
    else if (!this.any) this.lead = true
  }

  content(s: string, text = false): void {
    this.flushText()
    if (this.lastEmphasis !== null && !this.pendingSpace && s !== '') this.closeEmphasisBefore(s)
    this.settle()
    if (this.pendingSpace) {
      this.parts.push(' ')
      this.fromText.push(true)
      this.pendingSpace = false
    }
    this.parts.push(s)
    this.fromText.push(text)
    this.any = this.lineStarted = true
    this.atLineStart = false
    this.lastEmphasis = null
    this.lastCode = null
  }

  /**
   * CommonMark reads a closing marker after punctuation as text where a
   * letter follows it (`**"x"**b`): the punctuation ending the run moves after
   * the marker (`**"x**"b`), and a run of punctuation alone loses its markers.
   */
  private closeEmphasisBefore(next: string): void {
    if (FLANK_NEUTRAL.test(next[0]!)) return
    const closed = closedBeforeLetter(this.lastEmphasis!)
    if (closed === null) return
    // Punctuation now next to what follows is escaped where it would pair with it: a `<`, `&` or `&#` (a tag or an entity).
    // (Not a `!`: before a link, which would make it an image, nothing moves, as a `[` is punctuation.)
    this.parts[this.parts.length - 1] = closed.run + escapeMovedEnd(closed.moved)
    this.unwritten = null
  }

  lineBreak(): void {
    this.flushText()
    this.settle()
    this.pendingSpace = false
    if (!this.any) {
      this.leadBreak = true
      return
    }
    this.parts.push('\n')
    this.fromText.push(false)
    this.lineStarted = false
    this.atLineStart = true
    this.lastEmphasis = null
    this.lastCode = null
  }

  /**
   * Append a nested run between markers. Its outer whitespace goes outside
   * the markers (`** bold **` is not emphasis), and an empty run emits no
   * markers at all.
   */
  wrap(inner: InlineResult, open: string, close: string): void {
    this.flushText()
    this.settle()
    // A `!` written right before a link would make it an image.
    const last = this.parts.length - 1
    // (Not escaped already: an even run of backslashes before it, none included, escapes only themselves.)
    if (open === '[' && !this.pendingSpace && !inner.lead && !inner.leadBreak && /(?:^|[^\\])(?:\\\\)*!$/.test(this.parts[last] ?? '')) {
      this.parts[last] = `${this.parts[last]!.slice(0, -1)}\\!`
    }
    if (inner.leadBreak) this.lineBreak()
    else if (inner.lead) this.space()
    // A blank line would end the paragraph inside the markers.
    if (inner.text) this.content(open + inner.text.replace(/\n{2,}/g, '\n') + close)
    if (inner.trailBreak) this.lineBreak()
    else if (inner.trail) this.space()
  }

  /**
   * Append a run between emphasis markers, written so CommonMark reads it as
   * emphasis (see emphasisParts); a run of white space alone gets none.
   */
  emphasize(inner: InlineResult, marker: string): void {
    this.flushText()
    if (inner.leadBreak) this.lineBreak()
    else if (inner.lead) this.space()
    const parts = emphasisParts(inner.text.replace(/\n{2,}/g, '\n'))
    const { before, after } = parts
    let { core } = parts
    // Content ending with a run of other emphasis whose punctuation moves after it before a letter: this run's core then
    // (the same start, white space and punctuation moved from it alike), for this run to move that punctuation after its own marker.
    const inside = inner.closedBeforeLetter
    let nestedCore = inside !== undefined && after === '' ? inside.text.replace(/\n{2,}/g, '\n').slice(before.length) : undefined
    // How much of the run's start and end is text: only that may move outside the markers.
    const textLead = Math.max(0, inner.textLead - before.length)
    const textTrail = Math.max(0, inner.textTrail - after.length)
    if (before) this.content(before)
    const previous = this.lastEmphasis
    // (Only runs of plain text join: Markdown written for each, such as its own emphasis, code or a link, or a character that
    // pairs with one across the join, such as `<` with `span>` or `&` with `amp;`, would read otherwise next to the other's.)
    const plain = PLAIN_RUN.test(core)
    if (core && !before && !this.pendingSpace && previous !== null && previous.marker === marker && previous.plain && plain) {
      // Right after a run of the same emphasis (`<b>a</b><b>b</b>`): one run, as `**a****b**` reads otherwise.
      previous.pieces.push(core)
      previous.textTrail = textTrail
      this.unwritten = () => marker + previous.pieces.join('') + marker
    } else if (core) {
      this.settle()
      // An opening marker before punctuation reads as text after a letter (`a**"x"**`): that punctuation goes before it.
      const before = this.preceding()
      const leading = before !== '' && !FLANK_NEUTRAL.test(before) ? /^[\p{P}\p{S}][\s\p{Zs}\p{P}\p{S}]*/u.exec(core.slice(0, textLead))?.[0] : undefined
      if (leading !== undefined) {
        core = core.slice(leading.length)
        // A backslash ending it now comes before the marker, which it would escape; with no marker after it (the run is all
        // punctuation), a `<`, `&` or `&#` ending it would pair with what follows (a tag, an entity): escaped.
        // (As text: a run this one starts moves it before its own marker too.)
        this.content(core === '' ? escapeMovedEnd(escapeLastBackslash(leading)) : escapeLastBackslash(leading), true)
        if (nestedCore !== undefined) nestedCore = nestedCore.slice(leading.length)
      }
      if (core) {
        // Right after a run of the other emphasis, its stars would join this one's (`**x***.y*`): this one is written with underscores.
        const written = previous !== null && this.parts[this.parts.length - 1]?.endsWith('*') && !this.pendingSpace ? marker.replace(/\*/g, '_') : marker
        this.content(written + core + written)
        this.lastEmphasis = { marker: written, pieces: [core], textTrail: Math.min(textTrail, core.length), plain }
        if (nestedCore !== undefined) this.lastEmphasis.nested = { core: nestedCore, moved: inside!.moved }
      }
    }
    if (after) this.content(after)
    if (inner.trailBreak) this.lineBreak()
    else if (inner.trail) this.space()
  }

  /**
   * The character content written next would follow: a space for one pending
   * or leading, else the end of what is written, or at the start of an
   * emphasis run, the character before its marker (see `before`).
   */
  preceding(): string {
    this.flushText()
    if (this.pendingSpace || (this.parts.length === 0 && (this.lead || this.leadBreak))) return ' '
    return (this.parts[this.parts.length - 1] ?? this.options.before ?? '').slice(-1)
  }

  /** A code span: its code between enough backticks; one right after another joins it, as two would read as a double backtick. */
  code(inner: InlineResult): void {
    this.flushText()
    if (inner.leadBreak) this.lineBreak()
    else if (inner.lead) this.space()
    if (inner.text) {
      const piece = inner.text.replace(/\n{2,}/g, '\n')
      const write = (run: NonNullable<Inline['lastCode']>): string => {
        const fence = '`'.repeat(run.longest + 1)
        const pad = run.startsTick || run.endsTick ? ' ' : ''
        return fence + pad + run.pieces.join('') + pad + fence
      }
      const leading = backticksAt(piece, false)
      const trailing = backticksAt(piece, true)
      const run = this.lastCode
      if (run !== null && !this.pendingSpace) {
        // The fence outlasts the longest backtick run of the code, one across the join included.
        run.longest = Math.max(run.longest, longestBacktickRun(piece), run.tail + leading)
        run.tail = leading === piece.length ? run.tail + leading : trailing
        run.endsTick = piece.endsWith('`')
        run.pieces.push(piece)
        this.unwritten = () => write(run)
      } else {
        const started = { pieces: [piece], longest: longestBacktickRun(piece), tail: trailing, startsTick: piece.startsWith('`'), endsTick: piece.endsWith('`') }
        this.content(write(started))
        this.lastCode = started
      }
    }
    if (inner.trailBreak) this.lineBreak()
    else if (inner.trail) this.space()
  }

  finish(): InlineResult {
    this.flushText()
    this.settle()
    const joined = this.parts.join('')
    const text = joined.replace(/\n+$/, '')
    let textLead = 0
    for (let i = 0; i < this.parts.length && this.fromText[i]; i++) textLead += this.parts[i]!.length
    let end = this.parts.length
    while (end > 0 && this.parts[end - 1] === '\n') end--
    let textTrail = 0
    for (let i = end - 1; i >= 0 && this.fromText[i]; i--) textTrail += this.parts[i]!.length
    // (The run is the last part while it is the last emphasis: anything written after it ends that.)
    const closed = this.lastEmphasis === null ? null : closedBeforeLetter(this.lastEmphasis)
    return {
      ...(closed !== null && closed.moved !== '' && end === this.parts.length
        ? { closedBeforeLetter: { text: this.parts.slice(0, -1).join('') + closed.run, moved: closed.moved } }
        : {}),
      text,
      lead: this.lead,
      trail: this.pendingSpace,
      leadBreak: this.leadBreak,
      trailBreak: text.length < joined.length,
      textLead,
      textTrail,
    }
  }

  /** The text as paragraph Markdown: a <br> is a hard break, two in a row start a new paragraph. */
  paragraph(): string {
    return this.finish()
      .text.split(/\n{2,}/)
      .map((part) => part.split('\n').join('  \n'))
      .join('\n\n')
  }
}

/**
 * A run of emphasis split so CommonMark reads its markers as emphasis: a
 * marker next to Unicode white space (a full-width space indenting a CJK
 * paragraph, say) is plain text, so that white space goes outside the
 * markers; and a backslash ending the run would escape the closing marker,
 * so it is escaped itself (it still reads as one backslash).
 */
const EDGE_SPACE = /[\p{Zs}\t\f\r]/u

function emphasisParts(text: string): { before: string; core: string; after: string } {
  // Scanned from both ends, so a long run of spaces costs one pass.
  let start = 0
  let end = text.length
  while (start < end && EDGE_SPACE.test(text[start]!)) start++
  while (end > start && EDGE_SPACE.test(text[end - 1]!)) end--
  return { before: text.slice(0, start), core: escapeLastBackslash(text.slice(start, end)), after: text.slice(end) }
}

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/
/** Characters next to which an emphasis marker reads as one either way: white space and punctuation (a line's end too). */
const FLANK_NEUTRAL = /[\s\p{Zs}\p{P}\p{S}]/u
/** A run of emphasis that is text with none of the characters Markdown pairs across a join: one may join the next (see emphasize). */
const PLAIN_RUN = /^[^\\`*_~[\]!<>&]*$/
const WORD_CHARACTER = /[\p{L}\p{N}]/u
const SPACE_CHARACTER = /[\s\p{Zs}]/u

/**
 * Text as Markdown that renders as written, escaped only where CommonMark
 * would read it otherwise: a backslash before punctuation (or at the end,
 * before what follows), a `*` that is not between spaces, a `_` not inside a
 * word, a backtick, a `]` opening a link's target (and in a link's text an
 * unbalanced bracket), a `<` that starts a tag, an `&` that starts an
 * entity, a double `~`; and at the start of a line, what starts a heading,
 * list item, quote, rule, setext underline or link definition. Snake_case
 * names, `2 * 3` and `[1]` stay as written.
 */
function escapeText(text: string, lineStart: boolean, link: boolean): string {
  // In a link's text, the brackets with no partner in this text.
  let unmatched: Set<number> | null = null
  if (link && /[[\]]/.test(text)) {
    unmatched = new Set()
    const open: number[] = []
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '[') open.push(i)
      else if (text[i] === ']') {
        if (open.length > 0) open.pop()
        else unmatched.add(i)
      }
    }
    for (const i of open) unmatched.add(i)
  }
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const prev = text[i - 1]
    const next = text[i + 1]
    switch (c) {
      case '\\':
        out += next === undefined || ASCII_PUNCTUATION.test(next) ? '\\\\' : c
        break
      case '*':
        out += prev !== undefined && next !== undefined && SPACE_CHARACTER.test(prev) && SPACE_CHARACTER.test(next) ? c : '\\*'
        break
      case '_':
        out += prev !== undefined && next !== undefined && WORD_CHARACTER.test(prev) && WORD_CHARACTER.test(next) ? c : '\\_'
        break
      case '`':
        out += '\\`'
        break
      case '[':
        out += unmatched?.has(i) ? '\\[' : c
        break
      case ']':
        out += next === '(' || next === '[' || unmatched?.has(i) ? '\\]' : c
        break
      case '<':
        out += next !== undefined && /[A-Za-z/!?]/.test(next) ? '\\<' : c
        break
      case '&':
        out += /^&#?[A-Za-z0-9]{1,32};/.test(text.slice(i, i + 35)) ? '\\&' : c
        break
      case '~':
        out += prev === '~' || next === '~' ? '\\~' : c
        break
      default:
        out += c
    }
  }
  return lineStart ? escapeLineStart(out) : out
}

/** What would start a block at the start of a line: a heading, list item, quote, rule, setext underline or link definition. */
function escapeLineStart(line: string): string {
  if (/^(?:#{1,6}|[-+]|>)(?=[ \t]|$)/.test(line) || /^>/.test(line)) return `\\${line}`
  const ordered = /^(\d{1,9})([.)])(?=[ \t]|$)/.exec(line)
  if (ordered) return `${ordered[1]}\\${line.slice(ordered[1]!.length)}`
  if (/^(?:=+|-+|(?:-[ \t]*){3,})[ \t]*$/.test(line)) return `\\${line}`
  if (/^\[(?:[^\]\\]|\\.)*\]:/.test(line)) return `\\${line}`
  return line
}

/**
 * An emphasis run written last: its marker and what is between the markers
 * (in pieces, as adjacent runs join it), how much of its end is text, whether
 * it is plain text (see emphasize), and for a run whose content ends with
 * another emphasis run, how that ends before a letter (see closedBeforeLetter).
 */
interface Emphasis {
  marker: string
  pieces: string[]
  textTrail: number
  plain: boolean
  nested?: { core: string; moved: string }
}

/**
 * How an emphasis run is written where a letter follows it, which CommonMark
 * reads its closing marker with: the punctuation ending it after the marker
 * (`**"x**"b`), a run of punctuation alone without markers, an underscore run
 * with stars; or null when it reads as written. `run` is the run as written
 * then, `moved` the punctuation after it. A run ending with another run
 * (`***"y"***`) moves that one's punctuation after both markers.
 */
function closedBeforeLetter({ marker, pieces, textTrail, nested }: Emphasis): { run: string; moved: string } | null {
  const core = pieces.join('')
  // The punctuation, and white space before it (a marker after a space reads as text too), of the text ending the run:
  // never Markdown of the walk's own, such as a link's closing parenthesis. Scanned from the end, so a long run costs one pass.
  const limit = core.length - textTrail
  let start = core.length
  while (start > limit && FLANK_NEUTRAL.test(core[start - 1]!)) start--
  const trailing = start < core.length && !/[\s\p{Zs}]/u.test(core[core.length - 1]!) ? core.slice(start) : ''
  if (trailing === '' && nested !== undefined) return { run: nested.core ? marker + nested.core + marker : '', moved: nested.moved }
  const rest = core.slice(0, core.length - trailing.length)
  // An underscore run (see emphasize) does not close before a letter: it is written with stars again, unless punctuation now follows it.
  const written = trailing === '' ? marker.replace(/_/g, '*') : marker
  if (trailing === '' && written === marker) return null
  return { run: rest ? written + rest + written : '', moved: trailing }
}

/**
 * Punctuation moved out of emphasis markers, now right before what follows: a
 * `<` ending it, or a `&` or `&#` (the `&`), would start a tag or an entity
 * with that, so it is escaped, unless a backslash already escapes it.
 */
function escapeMovedEnd(text: string): string {
  const at = text.endsWith('<') || text.endsWith('&') ? text.length - 1 : text.endsWith('&#') ? text.length - 2 : -1
  if (at < 0) return text
  let backslashes = 0
  while (backslashes < at && text[at - 1 - backslashes] === '\\') backslashes++
  return backslashes % 2 === 1 ? text : `${text.slice(0, at)}\\${text.slice(at)}`
}

/**
 * Text written right before a closing marker, bracket or parenthesis: an odd
 * run of backslashes ending it would escape that delimiter, so the last one is
 * escaped itself (it still reads as one backslash).
 */
function escapeLastBackslash(text: string): string {
  let backslashes = 0
  while (backslashes < text.length && text[text.length - 1 - backslashes] === '\\') backslashes++
  return backslashes % 2 === 1 ? `${text}\\` : text
}

interface Marks {
  strong: boolean
  em: boolean
  link: boolean
  /** Emphasis and code spans are written as plain text (a table cell). */
  plain: boolean
  /** Links and images too: a link is its text, an image its alt text (a cell of the `tables` format). */
  text: boolean
}

const NO_MARKS: Marks = { strong: false, em: false, link: false, plain: false, text: false }
const CELL_MARKS: Marks = { ...NO_MARKS, plain: true }
const TEXT_MARKS: Marks = { ...CELL_MARKS, text: true }

/**
 * Link and image targets are made absolute against the document base, so the
 * Markdown stands on its own. Same-document fragments ("#section") stay as
 * written: they point at headings of this same Markdown, and Monitor heading
 * rules read heading anchors in that form. Without a base, targets stay as
 * written. javascript: targets and unparseable ones give no target. Nor does a
 * data: URI, as Firecrawl's removeBase64Images drops image ones by default:
 * the encoded bytes are noise in Markdown and point at no source, so a link
 * keeps only its text and an image only its alt text.
 */
function linkTarget(raw: string, base: URL | null): string | null {
  const href = raw.replace(/[\t\n\r]/g, '').trim()
  if (href === '' || /^(?:javascript|data):/i.test(href)) return null
  if (href.startsWith('#') || base === null) return href
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

/** A target as a CommonMark link destination, in <…> where a space or unbalanced parenthesis would cut it short. */
function destination(target: string): string {
  // A backslash in a destination escapes the punctuation after it, another backslash too: doubled, each reads as one.
  target = target.replace(/\\/g, '\\\\')
  if (!/[()\s<>]/.test(target)) return target
  let depth = 0
  for (const ch of target) {
    if (ch === '(') depth++
    else if (ch === ')' && --depth < 0) break
  }
  if (depth === 0 && !/[\s<>]/.test(target)) return target
  return `<${target.replace(/</g, '%3C').replace(/>/g, '%3E')}>`
}

/** How many backticks start (or end) the text. */
function backticksAt(text: string, end: boolean): number {
  let count = 0
  while (count < text.length && text[end ? text.length - 1 - count : count] === '`') count++
  return count
}

function longestBacktickRun(text: string): number {
  let longest = 0
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return longest
}

/**
 * The children of an element being written as inline content: the next one,
 * where they are written, in which marks, and what is written once they all
 * are (an emphasis's markers, a link's brackets, a block's closing space).
 */
interface InlineLevel {
  next: Node | null
  out: Inline
  marks: Marks
  done?: () => void
}

function inlineChildren(parent: Node, out: Inline, ctx: Context, marks: Marks): void {
  walkInline({ next: parent.firstChild, out, marks }, ctx)
}

function inlineElement(el: Element, out: Inline, ctx: Context, marks: Marks): void {
  const level = openInline(el, out, ctx, marks)
  if (level !== null) walkInline(level, ctx)
}

/** Inline content, depth first on a stack of levels, so nesting thousands deep (a <sup> in a <sup>…) costs no stack frames. */
function walkInline(first: InlineLevel, ctx: Context): void {
  const levels = [first]
  while (levels.length > 0) {
    const level = levels[levels.length - 1]!
    const node = level.next
    if (node === null) {
      levels.pop()
      level.done?.()
      continue
    }
    level.next = node.nextSibling
    if (node.nodeType === TEXT_NODE) level.out.text((node as Text).data)
    else if (node.nodeType === ELEMENT_NODE) {
      const inner = openInline(node as Element, level.out, ctx, level.marks)
      if (inner !== null) levels.push(inner)
    }
  }
}

/** Starts an element written as inline content: what it writes before its children, and the level of those, or null when it has none to write. */
function openInline(el: Element, out: Inline, ctx: Context, marks: Marks): InlineLevel | null {
  const tag = el.localName
  if (skipped(el, ctx)) return null
  // Blocks met in inline context (a card inside a link, a paragraph inside a
  // heading, a box the page's CSS lays out as a block) flatten to one line:
  // their boundaries become spaces.
  const block = BLOCK.has(tag) || cssBlock(el, ctx)
  if (block) out.space()
  // Its children, written to `inner`, then `done` and a block's closing space. (No closure where nothing is to be done.)
  const children = (inner: Inline, innerMarks: Marks, done?: () => void): InlineLevel => ({
    next: el.firstChild,
    out: inner,
    marks: innerMarks,
    done: done === undefined ? (block ? () => out.space() : undefined) : block ? () => (done(), out.space()) : done,
  })
  if (!block && !SPECIAL_INLINE.has(tag)) return el.firstChild === null ? null : { next: el.firstChild, out, marks }
  switch (tag) {
    case 'br':
      out.lineBreak()
      break
    case 'img':
      if (marks.text) {
        const alt = (el.getAttribute('alt') ?? '').replace(WHITESPACE, ' ').trim()
        if (alt) out.content(alt)
      } else image(el, out, ctx)
      break
    case 'code':
      if (marks.plain) return children(out, marks)
      codeSpan(el, out, ctx)
      break
    case 'a': {
      const href = el.getAttribute('href')
      const target = href === null || marks.link || marks.text ? null : linkTarget(href, ctx.base)
      // No usable target (no href, or inside another link): only its text.
      if (target === null) return children(out, marks)
      const inner = new Inline({ link: true })
      return children(inner, { ...marks, link: true }, () => link(inner.finish(), target, out))
    }
    case 'strong':
    case 'b':
      if (marks.strong || marks.plain) return children(out, marks)
      return emphasis(el, out, { ...marks, strong: true }, '**', children)
    case 'em':
    case 'i':
      if (marks.em || marks.plain) return children(out, marks)
      return emphasis(el, out, { ...marks, em: true }, '*', children)
    case 'sup':
    case 'sub': {
      // Digits and signs keep their script form; a footnote mark or a word
      // in a superscript stays as written.
      const inner = new Inline({ escape: !marks.text, link: marks.link })
      return children(inner, marks, () => {
        const run = inner.finish()
        const script = scriptText(run.text, tag)
        out.wrap(script === null ? run : { ...run, text: script }, '', '')
      })
    }
    default:
      return children(out, marks)
  }
  if (block) out.space()
  return null
}

/** The tags openInline writes otherwise than by their children alone. */
const SPECIAL_INLINE = new Set(['br', 'img', 'code', 'a', 'strong', 'b', 'em', 'i', 'sup', 'sub'])

function emphasis(
  el: Element,
  out: Inline,
  marks: Marks,
  marker: string,
  children: (inner: Inline, marks: Marks, done: () => void) => InlineLevel,
): InlineLevel {
  const inner = new Inline({ link: marks.link, before: out.preceding() })
  return children(inner, marks, () => out.emphasize(inner.finish(), marker))
}

function codeSpan(el: Element, out: Inline, ctx: Context): void {
  const inner = new Inline({ escape: false })
  inner.text(shownText(el, ctx))
  out.code(inner.finish())
}

/** A link's text, written between brackets before its target. */
function link(result: InlineResult, target: string, out: Inline): void {
  // A link with no text keeps its target as the text, except a bare
  // same-page anchor (a heading's permalink icon), which says nothing.
  if (!result.text && target.startsWith('#')) out.wrap(result, '', '')
  else out.wrap({ ...result, text: escapeLastBackslash(result.text || target) }, '[', `](${destination(target)})`)
}

/** An image with its alt text and absolute target; only the alt text when it has no target (a `data:` URI, unless the caller keeps those). */
function image(el: Element, out: Inline, ctx: Context): void {
  const alt = (el.getAttribute('alt') ?? '').replace(WHITESPACE, ' ').trim()
  const src = el.getAttribute('src')
  const kept = src === null ? null : src.replace(/[\t\n\r]/g, '').trim()
  const target = kept === null ? null : ctx.keepDataUriImages && /^data:/i.test(kept) ? kept : linkTarget(kept, ctx.base)
  if (target !== null) out.content(`![${escapeLastBackslash(alt.replace(/[[\]]/g, '\\$&'))}](${destination(target)})`)
  else if (alt) out.content(alt)
}

// ---------------------------------------------------------------- blocks

/** Blocks of one container, plus the paragraph its inline content is building. */
class Flow {
  readonly blocks: Block[] = []
  inline = new Inline({ paragraph: true })

  constructor(readonly ctx: Context) {}

  flush(): void {
    const text = this.inline.paragraph()
    if (text) this.blocks.push({ text: emphasized(text, this.ctx) })
    this.inline = new Inline({ paragraph: true })
  }

  add(...blocks: (Block | null)[]): void {
    this.flush()
    for (const block of blocks) if (block !== null && block.text) this.blocks.push(block)
  }
}

/** A paragraph in the emphasis it is written in: each of its parts (a double <br> starts one) between the markers. */
function emphasized(text: string, ctx: Context): string {
  if (ctx.emphasis === undefined) return text
  const open = ctx.emphasis.markers.join('')
  const close = [...ctx.emphasis.markers].reverse().join('')
  return text
    .split('\n\n')
    .map((part) => {
      const { before, core, after } = emphasisParts(part)
      return core ? before + open + core + close + after : part
    })
    .join('\n\n')
}

/** The marks inline content starts from in a paragraph of the walk. */
const flowMarks = (ctx: Context): Marks => ctx.emphasis?.marks ?? NO_MARKS

/**
 * A node's children being written as blocks: the next one, how one is
 * written, and what is written once they all are (a list item's marker, a
 * quote's `>`, a block's closing paragraph break). `single`: only the node
 * `next` names, not its siblings.
 */
interface FlowLevel {
  next: Node | null
  single?: boolean
  step: (node: Node) => void
  done?: () => void
}

/**
 * Block content written depth first on a stack of levels, so nesting
 * thousands deep (a <div> in a <div>, a list in a list) costs no stack
 * frames: what a level writes after its children is its `done`.
 */
class FlowWalk {
  private readonly levels: FlowLevel[] = []

  push(level: FlowLevel): void {
    this.levels.push(level)
  }

  run(): void {
    while (this.levels.length > 0) {
      const level = this.levels[this.levels.length - 1]!
      const node = level.next
      if (node === null) {
        this.levels.pop()
        level.done?.()
        continue
      }
      level.next = level.single ? null : node.nextSibling
      level.step(node)
    }
  }
}

/** The level writing a node's children into a flow, then `done`. */
function flowLevel(parent: Node, flow: Flow, walk: FlowWalk, done?: () => void): FlowLevel {
  return { next: parent.firstChild, step: (node) => flowNode(node, flow, walk), done }
}

/** The level writing one node into a flow, then `done`. */
function nodeLevel(node: Node, flow: Flow, walk: FlowWalk, done?: () => void): FlowLevel {
  return { next: node, single: true, step: (child) => flowNode(child, flow, walk), done }
}

/**
 * A <b>, <strong>, <em> or <i> around blocks, as a browser shows it: its
 * inline runs are written between the markers, and the paragraphs of the
 * blocks in it (a list's items, a quote's paragraphs too) in the emphasis.
 * Headings, code blocks and tables keep their own form. `after`: written
 * once it is.
 */
function emphasisAroundBlocks(el: Element, flow: Flow, strong: boolean, walk: FlowWalk, after: () => void): void {
  const ctx = flow.ctx
  const outer = ctx.emphasis
  const marker = strong ? '**' : '*'
  const marks: Marks = { ...flowMarks(ctx), ...(strong ? { strong: true } : { em: true }) }
  let run = new Inline()
  const endRun = (): void => {
    flow.inline.emphasize(run.finish(), marker)
    run = new Inline()
  }
  walk.push({
    next: el.firstChild,
    step: (node) => {
      if (node.nodeType === TEXT_NODE) {
        run.text((node as Text).data)
        return
      }
      if (node.nodeType !== ELEMENT_NODE) return
      const child = node as Element
      if (skipped(child, ctx)) return
      if (!BLOCK.has(child.localName) && !cssBlock(child, ctx) && !containsBlock(child, ctx)) {
        inlineElement(child, run, ctx, marks)
        return
      }
      // A block: the paragraph so far ends outside the emphasis, the block's own paragraphs are written in it.
      endRun()
      flow.flush()
      ctx.emphasis = { markers: [...(outer?.markers ?? []), marker], marks }
      walk.push(
        nodeLevel(child, flow, walk, () => {
          flow.flush()
          ctx.emphasis = outer
        }),
      )
    },
    done: () => {
      endRun()
      after()
    },
  })
}

function flowNode(node: Node, flow: Flow, walk: FlowWalk): void {
  if (node.nodeType === TEXT_NODE) {
    flow.inline.text((node as Text).data)
    return
  }
  if (node.nodeType !== ELEMENT_NODE) return
  const el = node as Element
  const tag = el.localName
  const ctx = flow.ctx
  if (skipped(el, ctx)) return
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      flow.add(heading(el, ctx))
      return
    case 'pre':
      flow.add(codeBlock(el, ctx))
      return
    case 'table':
      // A table whose nested tables hold most of its text lays out the page
      // (Hacker News puts its header, story list and footer in one), and so
      // does a single row (a bar of links): their cells are blocks, and only
      // the data tables inside are grids. (The row count first: it costs
      // less than looking through the nested tables.)
      if (ownRows(el).length < 2 || isLayoutTable(el)) break
      flow.add({ text: tableToGfm(el, ctx) })
      return
    case 'li': {
      // An item outside any list still renders with its bullet.
      const inner = new Flow(ctx)
      walk.push(
        flowLevel(el, inner, walk, () => {
          inner.flush()
          flow.add({ text: listItem('-', inner.blocks), interrupts: true })
        }),
      )
      return
    }
    case 'blockquote': {
      const inner = new Flow(ctx)
      walk.push(
        flowLevel(el, inner, walk, () => {
          inner.flush()
          flow.add(blockquote(inner.blocks))
        }),
      )
      return
    }
    case 'hr':
      flow.add({ text: '---' })
      return
    case 'br':
      flow.inline.lineBreak()
      return
  }
  if (LIST.has(tag)) {
    list(el, flow, walk)
    return
  }
  const tagBlock = BLOCK.has(tag)
  const block = tagBlock || cssBlock(el, ctx)
  if (!tagBlock && !containsBlock(el, ctx)) {
    // Inline content, in a paragraph of its own when the page's CSS makes
    // the element a block (a link or emphasis keeps its markup).
    if (block) flow.flush()
    inlineElement(el, flow.inline, ctx, flowMarks(ctx))
    if (block) flow.flush()
    return
  }
  if (!tagBlock && tag === 'a' && el.hasAttribute('href')) {
    // A link around blocks (a card) stays one link, with its text flattened,
    // in a paragraph of its own.
    flow.flush()
    inlineElement(el, flow.inline, ctx, flowMarks(ctx))
    flow.flush()
    return
  }
  const marks = flowMarks(ctx)
  const strong = tag === 'b' || tag === 'strong'
  const after = block ? () => flow.flush() : () => {}
  if (!tagBlock && (strong || tag === 'em' || tag === 'i') && !(strong ? marks.strong : marks.em)) {
    if (block) flow.flush()
    emphasisAroundBlocks(el, flow, strong, walk, after)
    return
  }
  // A block container, or an inline element around blocks (a <span> holding
  // <div>s), which is laid out as those blocks.
  if (block) flow.flush()
  walk.push(flowLevel(el, flow, walk, block ? after : undefined))
}

function containsBlock(root: Element, ctx: Context): boolean {
  const memo = ctx.blockMemo
  const known = memo.get(root)
  if (known !== undefined) return known
  // Depth first, on a stack of the elements searched and the next child of each, so a deep page costs no stack frames.
  // `found`: whether the element last searched holds a block, which then holds for each element it is in.
  const searched: { el: Element; next: Element | null }[] = [{ el: root, next: root.firstElementChild }]
  let found = false
  while (searched.length > 0) {
    const top = searched[searched.length - 1]!
    const child = found ? null : top.next
    if (child === null) {
      memo.set(top.el, found)
      searched.pop()
      continue
    }
    top.next = child.nextElementSibling
    if (skipped(child, ctx)) continue
    if (BLOCK.has(child.localName) || cssBlock(child, ctx)) found = true
    else {
      const childKnown = memo.get(child)
      if (childKnown !== undefined) found = childKnown
      else searched.push({ el: child, next: child.firstElementChild })
    }
  }
  return found
}

/** The blocks inside a container element. */
function blocksOf(el: Node, ctx: Context): Block[] {
  const flow = new Flow(ctx)
  const walk = new FlowWalk()
  walk.push(flowLevel(el, flow, walk))
  walk.run()
  flow.flush()
  return flow.blocks
}

function heading(el: Element, ctx: Context): Block | null {
  const inner = new Inline()
  inlineChildren(el, inner, ctx, NO_MARKS)
  // A heading is one line: a <br> inside it becomes a space.
  const text = inner.finish().text.split('\n').filter(Boolean).join(' ')
  return text ? { text: `${'#'.repeat(Number(el.localName[1]))} ${text}` } : null
}

/** Text of a <pre>, exactly, with <br> as a newline. */
function preText(pre: Element, ctx: Context): string {
  const parts: string[] = []
  // In document order, on a stack of the next node at each level, so a deep page costs no stack frames.
  const next: (Node | null)[] = [pre.firstChild]
  while (next.length > 0) {
    const node = next[next.length - 1]!
    if (node === null) {
      next.pop()
      continue
    }
    next[next.length - 1] = node.nextSibling
    if (node.nodeType === TEXT_NODE) {
      parts.push((node as Text).data)
    } else if (node.nodeType === ELEMENT_NODE) {
      if (skipped(node as Element, ctx)) continue
      if ((node as Element).localName === 'br') parts.push('\n')
      else next.push(node.firstChild)
    }
  }
  return parts.join('')
}

const LANGUAGE_CLASS = /(?:^|\s)(?:language|lang)-([^\s`]+)/

function codeLanguage(pre: Element): string {
  for (const el of [pre, pre.querySelector('code')]) {
    const match = LANGUAGE_CLASS.exec(el?.getAttribute('class') ?? '')
    if (match) return match[1]!
  }
  return ''
}

function codeBlock(pre: Element, ctx: Context): Block | null {
  let text = preText(pre, ctx).replace(/\r\n?/g, '\n')
  // The HTML parser drops a newline right after <pre>; the last one only ends the last line.
  if (text.startsWith('\n')) text = text.slice(1)
  text = text.replace(/\n$/, '')
  if (text.trim() === '') return null
  // The fence must be longer than any backtick run that could close it.
  let longest = 0
  for (const match of text.matchAll(/^ {0,3}(`+)/gm)) longest = Math.max(longest, match[1]!.length)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return { text: `${fence}${codeLanguage(pre)}\n${text}\n${fence}` }
}

/** A quote of the blocks inside a <blockquote>. */
function blockquote(blocks: Block[]): Block | null {
  const inner = blocks.map((block) => block.text).join('\n\n')
  if (!inner) return null
  return { text: inner.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n') }
}

/**
 * One list item: the marker, then the item's blocks indented under it. A
 * nested list follows the text before it directly; other blocks are
 * separated by a blank line. An item with no content is dropped.
 */
function listItem(marker: string, blocks: Block[]): string {
  if (blocks.length === 0) return ''
  let body = blocks[0]!.text
  for (const block of blocks.slice(1)) body += (block.interrupts ? '\n' : '\n\n') + block.text
  return `${marker} ${body.replace(/\n(?=.)/g, `\n${' '.repeat(marker.length + 1)}`)}`
}

function hasItemChild(el: Element): boolean {
  for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) {
    if (child.localName === 'li') return true
  }
  return false
}

/**
 * A list, preceded by any content that sits in the list before its first
 * item. Ordered items are numbered from `start` (and an item's `value`).
 * Other children of the list (a nested list written as a sibling of the
 * items) belong to the item before them; wrappers around items are looked
 * through. Written to the flow once its items are.
 */
function list(el: Element, flow: Flow, walk: FlowWalk): void {
  const ctx = flow.ctx
  const ordered = el.localName === 'ol'
  const start = Number.parseInt(el.getAttribute('start') ?? '', 10)
  let number = ordered && start >= 0 ? start : 1
  const before: Block[] = []
  const items: { marker: string; blocks: Block[] }[] = []
  const visit = (parent: Element, done?: () => void): FlowLevel => ({
    next: parent.firstChild,
    step: (node) => {
      const tag = node.nodeType === ELEMENT_NODE ? (node as Element).localName : ''
      if (tag === 'li') {
        const value = ordered ? Number.parseInt((node as Element).getAttribute('value') ?? '', 10) : Number.NaN
        if (value >= 0) number = value
        const item: { marker: string; blocks: Block[] } = { marker: ordered ? `${number}.` : '-', blocks: [] }
        number++
        const inner = new Flow(ctx)
        walk.push(
          flowLevel(node, inner, walk, () => {
            inner.flush()
            item.blocks = inner.blocks
            items.push(item)
          }),
        )
      } else if (tag !== '' && !SKIP.has(tag) && !LIST.has(tag) && hasItemChild(node as Element)) {
        walk.push(visit(node as Element))
      } else {
        const inner = new Flow(ctx)
        walk.push(
          nodeLevel(node, inner, walk, () => {
            inner.flush()
            const last = items[items.length - 1]
            if (last) last.blocks.push(...inner.blocks)
            else before.push(...inner.blocks)
          }),
        )
      }
    },
    done,
  })
  walk.push(
    visit(el, () => {
      const text = items
        .map((item) => listItem(item.marker, item.blocks))
        .filter(Boolean)
        .join('\n')
      flow.add(...before, { text, interrupts: text.startsWith('- ') || text.startsWith('1. ') })
    }),
  )
}

function toUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
  return convert(html, options)
}

/**
 * One data table of a page, as the Markdown writes it as a GFM table:
 * `tableIndex` counts those tables from 0 in document order, so table N here
 * is the Nth GFM table of the Markdown made from the same HTML and options.
 * Layout tables and single-row tables are not data tables, and a table
 * nested in a cell is that cell's text, as in the Markdown.
 */
export interface ExtractedTable {
  tableIndex: number
  /** The `<caption>` as plain text; null when there is none. */
  caption: string | null
  /** Leading rows in `<thead>` or made of `<th>` cells alone. */
  headerRows: number
  /** Every row padded to the table's width; a spanned cell's value fills each slot it covers. Empty when the table is omitted. */
  rows: string[][]
  /** Present when the table's repeated and padded cells would exceed MAX_TABLE_CHARS, or what the page's tables have left of MAX_PAGE_TABLE_CHARS: its rows are not given. */
  omitted?: 'too_large'
}

/** The data tables of the HTML, from the same walk htmlToMarkdown makes with the same options. */
export function htmlToTables(html: string, options: MarkdownOptions = {}): ExtractedTable[] {
  const tables: ExtractedTable[] = []
  convert(html, options, tables)
  return tables
}

/**
 * HTML that starts with <head>, after whitespace and comments, is a page
 * served without <html>; a fragment never starts there. One that starts with
 * <body> may be a fragment (mainHtml is the body itself when that is the main
 * content), so it stays one. A scan, not a regex: a repeated comment pattern
 * backtracks exponentially over a page that opens with many comments.
 */
function startsWithHead(html: string): boolean {
  let at = 0
  for (;;) {
    while (at < html.length && /\s/.test(html[at]!)) at++
    if (!html.startsWith('<!--', at)) break
    const end = html.indexOf('-->', at + 4)
    if (end < 0) return false
    at = end + 3
  }
  return /^<head[\s>]/i.test(html.slice(at, at + 6))
}

function convert(html: string, options: MarkdownOptions, tables?: ExtractedTable[]): string {
  if (html.trim().length === 0) return ''
  const whole = /<html[\s>]|<!doctype/i.test(html) || startsWithHead(html)
  // A fragment is read as a <template>'s content, so its rows and cells stay: it may be one row of a layout table.
  const doc = parse(html, !whole)
  const document = doc.document
  // A whole document may carry its own <base href>; a fragment such as
  // mainHtml is resolved against the base the caller passes.
  const base = toUrl(whole ? documentBaseUrl(document, options.baseUrl) : options.baseUrl)
  detachAll(namedBy(document, options.exclude ?? []))
  const root =
    document.body && document.body.childNodes.length > 0 ? document.body : (document.documentElement ?? document.body)
  if (!root) {
    doc.close()
    return ''
  }
  const layout = document.querySelector(`[${LAYOUT_MARKERS.display}],[${LAYOUT_MARKERS.hidden}]`) !== null
  const markdown = blocksOf(root, { base, blockMemo: new Map(), layout, keepDataUriImages: options.dataUriImages === 'keep', tablePadding: { left: MAX_PAGE_TABLE_PADDING }, ...(tables === undefined ? {} : { tables, tableBudget: { left: MAX_PAGE_TABLE_CHARS } }) })
    .map((block) => block.text)
    .join('\n\n')
  doc.close()
  return markdown
}
