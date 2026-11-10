/** The crawl window's model, without the DOM: the page it draws as a grid of glyphs, how far down that page the
 * octopus may go given what the server has reported, and the Markdown of a read page, set as text, that the grid
 * resolves into. Everything a visitor reads in the window comes from the run itself; the page's silhouette is drawn,
 * never claimed, and once a page is read the silhouette gives way to the page's own words. */

// The stages and how far they let the octopus go live with the octopus itself, so every place that shows a run agrees.
import type { CrawlStage } from '@w2l/octopus'
export { crawlCap, mayRead, PROGRESS_STEPS, stageLabel, stepsDone, type CrawlStage, type StageEvent } from '@w2l/octopus'

/** How far down the page (0 to 1) the window lets the octopus go before the result is back, whatever the stages
 * allow: the rest of the page is kept for its last dive. */
export const DIVE_FROM = 0.62

/** Whether the gate that stands for robots.txt is open, so the octopus's arms may reach past it: only when the
 * server said the file allows the page, or, from a server that reported no robots stage, once it has plainly gone on
 * to the page (the page stage, or a result that read it). A refusal keeps it shut whatever comes after. */
export function gateOpen(seen: ReadonlySet<CrawlStage>, robotsAllowed: boolean | null, pageRead: boolean): boolean {
  return robotsAllowed === true || (robotsAllowed === null && (seen.has('page') || pageRead))
}

/** A cell of the drawn page: nothing, the page's chrome (navigation, sidebar, footer), or its main content. */
export const Cell = { Empty: 0, Chrome: 1, Text: 2, Title: 3, Image: 4 } as const
export type Cell = typeof Cell[keyof typeof Cell]

export interface Block { kind: 'title' | 'text' | 'image'; top: number; bottom: number; left: number; right: number }

export interface PageLayout {
  cols: number
  /** How many rows the page has: the silhouette's, or fewer once closePage has ended it sooner. */
  rows: number
  kind: Uint8Array
  /** The silhouette's own glyph for each cell (a char code; 32 for none). */
  glyph: Uint16Array
  /** The main content's blocks, top to bottom: what the octopus reaches for. */
  blocks: Block[]
  /** The footer's rule near the page's foot: the ground the octopus lands on. */
  floor: number
  /** The columns of the main column, and of the sidebar when the page is wide enough to have one. */
  main: { left: number; right: number }
  aside: { left: number; right: number } | null
}

/** A small deterministic generator, so one link always draws the same page. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashText(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return hash >>> 0
}

const SPACE = 32
const code = (char: string): number => char.charCodeAt(0)

/** A generic page, `rows` tall and `cols` wide: a navigation bar, a main column of a title, paragraphs and pictures,
 * a sidebar when there is room, and a footer. It is a silhouette for the octopus to crawl, not the page itself. */
export function layoutPage(cols: number, rows: number, seed: number): PageLayout {
  const random = seeded(seed)
  const kind = new Uint8Array(cols * rows)
  const glyph = new Uint16Array(cols * rows).fill(SPACE)
  const blocks: Block[] = []
  const set = (x: number, y: number, k: Cell, char: string): void => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return
    kind[y * cols + x] = k
    glyph[y * cols + x] = code(char)
  }
  const margin = Math.max(2, Math.round(cols * 0.04))
  // Navigation: a logo and a few menu items.
  for (let x = margin; x < margin + 6; x++) set(x, 1, Cell.Chrome, '#')
  let menu = Math.round(cols * 0.45)
  while (menu < cols - margin - 4) {
    const length = 3 + Math.floor(random() * 4)
    for (let x = menu; x < Math.min(menu + length, cols - margin); x++) set(x, 1, Cell.Chrome, '=')
    menu += length + 3
  }
  for (let x = 0; x < cols; x++) set(x, 3, Cell.Chrome, '·')
  const sidebar = cols >= 64
  const mainLeft = margin
  const mainRight = sidebar ? Math.round(cols * 0.66) : cols - margin
  const footer = rows - 2
  // Sidebar: short link lists down the right.
  if (sidebar) {
    const left = mainRight + 4
    for (let y = 6; y < footer - 2; y += 1 + Math.floor(random() * 2)) {
      if (random() < 0.3) { y++; continue }
      const length = 4 + Math.floor(random() * (cols - margin - left - 4))
      for (let x = left; x < Math.min(left + length, cols - margin); x++) set(x, y, Cell.Chrome, random() < 0.85 ? '-' : '·')
    }
  }
  // Main column: a title, then paragraphs with a picture now and then.
  let y = 6
  const titleLines = 2
  for (let line = 0; line < titleLines; line++) {
    const length = Math.round((mainRight - mainLeft) * (line === 0 ? 0.9 : 0.55))
    for (let x = mainLeft; x < mainLeft + length; x++) set(x, y + line, Cell.Title, '=')
  }
  blocks.push({ kind: 'title', top: y, bottom: y + titleLines - 1, left: mainLeft, right: mainRight - 1 })
  y += titleLines + 2
  let sincePicture = 0
  while (y < footer - 3) {
    if (sincePicture >= 2 && random() < 0.45 && y + 7 < footer - 3) {
      const height = 5 + Math.floor(random() * 3)
      const width = Math.round((mainRight - mainLeft) * (0.55 + random() * 0.45))
      for (let row = 0; row < height; row++) {
        for (let x = mainLeft; x < mainLeft + width; x++) {
          const edge = row === 0 || row === height - 1 || x === mainLeft || x === mainLeft + width - 1
          set(x, y + row, Cell.Image, edge ? '+' : (x + row) % 4 === 0 ? ':' : '·')
        }
      }
      blocks.push({ kind: 'image', top: y, bottom: y + height - 1, left: mainLeft, right: mainLeft + width - 1 })
      y += height + 2
      sincePicture = 0
      continue
    }
    const lines = Math.min(3 + Math.floor(random() * 4), footer - 3 - y)
    for (let line = 0; line < lines; line++) {
      const last = line === lines - 1
      const length = Math.round((mainRight - mainLeft) * (last ? 0.3 + random() * 0.5 : 0.9 + random() * 0.1))
      for (let x = mainLeft; x < mainLeft + length; x++) set(x, y + line, Cell.Text, '-')
    }
    blocks.push({ kind: 'text', top: y, bottom: y + lines - 1, left: mainLeft, right: mainRight - 1 })
    y += lines + 2
    sincePicture++
  }
  writeFooter(cols, rows, kind, glyph, footer)
  return { cols, rows, kind, glyph, blocks, floor: footer, main: { left: mainLeft, right: mainRight - 1 }, aside: sidebar ? { left: mainRight + 4, right: cols - margin - 1 } : null }
}

/** The page's footer: a rule across row `floor`, and its lines on the rows under it. */
function writeFooter(cols: number, rows: number, kind: Uint8Array, glyph: Uint16Array, floor: number): void {
  const margin = Math.max(2, Math.round(cols * 0.04))
  for (let row = floor; row < rows; row++) {
    for (let x = 0; x < cols; x++) {
      const line = row === floor || (x >= margin && x < cols - margin && (x - margin) % 9 < 5)
      kind[row * cols + x] = line ? Cell.Chrome : Cell.Empty
      glyph[row * cols + x] = line ? code(row === floor ? '·' : '-') : SPACE
    }
  }
}

/** Ends the page at row `floor` (above the silhouette's own): the footer is written there, the row above it is left
 * clear, and nothing below is the page any more. The window ends a read page a set way below what it shows, so the
 * octopus's last dive is as long whenever the result comes. */
export function closePage(layout: PageLayout, floor: number): void {
  if (floor >= layout.floor || floor < 1) return
  const { cols, kind, glyph } = layout
  for (let x = 0; x < cols; x++) { kind[(floor - 1) * cols + x] = Cell.Empty; glyph[(floor - 1) * cols + x] = SPACE }
  writeFooter(cols, floor + 2, kind, glyph, floor)
  layout.rows = floor + 2
  layout.floor = floor
  layout.blocks = layout.blocks.filter(block => block.top < floor - 1).map(block => ({ ...block, bottom: Math.min(block.bottom, floor - 2) }))
}

/** One part of a read page as the window sets it: a heading (with its # marks), a list item or quote (with its
 * marker), a line of code, or a paragraph. */
export type DocKind = 'heading' | 'item' | 'code' | 'text'
export interface DocLine { text: string; kind: DocKind }

/** A line's words without what only a renderer needs: pictures, link targets, tags, emphasis marks, code ticks and
 * table bars. */
function inlineText(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/(\*\*|__|\*|_|~~)(\S(?:[^*_~]*?\S)?)\1/g, '$2')
    .replace(/`+/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A page's Markdown as the parts the window sets: each heading with its # marks, each list item or quote with its
 * marker, each paragraph joined into one line, code as it is written. Rules, table rules and code fences' own lines
 * are left out. Characters are only ever taken away, never added. */
export function markdownLines(markdown: string): DocLine[] {
  const lines: DocLine[] = []
  let paragraph = ''
  let fenced = false
  const flush = (): void => {
    if (paragraph) lines.push({ text: paragraph, kind: 'text' })
    paragraph = ''
  }
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; flush(); continue }
    if (fenced) {
      const code = raw.replace(/\s+/g, ' ').trim()
      if (code) lines.push({ text: code, kind: 'code' })
      continue
    }
    // A rule, a heading's underline, or the rule under a table's head.
    if (/^\s*([-*_=]\s*){3,}$/.test(raw) || /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(raw)) { flush(); continue }
    const text = inlineText(raw)
    if (!text) { flush(); continue }
    const heading = /^(#{1,6})\s+(.+)$/.exec(text)
    if (heading) { flush(); lines.push({ text: `${heading[1]} ${heading[2]}`, kind: 'heading' }); continue }
    if (/^([-*+]|\d+[.)]|>)\s+\S/.test(text)) { flush(); lines.push({ text, kind: 'item' }); continue }
    paragraph = paragraph ? `${paragraph} ${text}` : text
  }
  flush()
  return lines
}

/** A character that takes two cells of the grid: CJK and the other wide scripts, full-width forms, and what lies
 * past the basic plane (emoji among it). */
export function isWide(point: number): boolean {
  return (point >= 0x1100 && point <= 0x115f) || (point >= 0x2e80 && point <= 0xa4cf) || (point >= 0xac00 && point <= 0xd7a3)
    || (point >= 0xf900 && point <= 0xfaff) || (point >= 0xfe30 && point <= 0xfe4f) || (point >= 0xff00 && point <= 0xff60)
    || (point >= 0xffe0 && point <= 0xffe6) || point >= 0x1f000
}

/** In PageWords.chars: the second cell of a character two cells wide. */
export const WIDE_TAIL = 0xffffffff

/** What a read page's cells show. */
export interface PageWords {
  /** The character each cell shows (a code point; 0 for none, WIDE_TAIL for the second cell of a wide one). */
  chars: Uint32Array
  /** 1 where the cell is part of a heading. */
  heading: Uint8Array
  /** The last row that took a character, -1 when none did. */
  lastRow: number
}

/** What a line may not be broken inside: a word, or a single character of a wide script (those scripts are written
 * without spaces, and break between any two characters). `glued` says it follows the one before with no space. */
interface Atom { chars: string[]; cells: number; glued: boolean }

function atomsOf(text: string): Atom[] {
  const atoms: Atom[] = []
  for (const word of text.split(' ')) {
    let run: string[] = []
    let glued = false
    const flush = (): void => {
      if (!run.length) return
      atoms.push({ chars: run, cells: run.length, glued })
      glued = true
      run = []
    }
    for (const char of word) {
      if (!isWide(char.codePointAt(0)!)) { run.push(char); continue }
      flush()
      atoms.push({ chars: [char], cells: 2, glued })
      glued = true
    }
    flush()
  }
  return atoms
}

/** No more of a page's Markdown than this many characters is read to set the window's one screen of it: a page can
 * be a megabyte long, and the result is set while the animation runs. */
const TYPESET_SOURCE = 8000

/** The start of a long Markdown, ended at a line's end (or else between two words), so nothing is cut in half. */
function opening(markdown: string): string {
  if (markdown.length <= TYPESET_SOURCE) return markdown
  const cut = markdown.slice(0, TYPESET_SOURCE)
  const line = cut.lastIndexOf('\n')
  if (line > 0) return cut.slice(0, line)
  const space = cut.lastIndexOf(' ')
  // One unbroken run: all of the cut, less a surrogate left without its pair.
  return space > 0 ? cut.slice(0, space) : cut.replace(/[\ud800-\udbff]$/, '')
}

/** The read page's own Markdown set as text in the page's main column, on rows `from` to `to`: its title first when
 * the Markdown does not open with a heading of its own, then part after part, each wrapped to the column (a word
 * longer than a line is cut at the line's end) with a clear row between parts; the items of one list, and the lines
 * of one block of code, follow each other directly. It stops where the rows end. Only characters of `title` and
 * `markdown` are ever placed; a page with no words gets none. */
export function typesetPage(layout: PageLayout, title: string | null, markdown: string | null, rows: { from: number; to: number }): PageWords {
  const words: PageWords = { chars: new Uint32Array(layout.kind.length), heading: new Uint8Array(layout.kind.length), lastRow: -1 }
  const width = layout.main.right - layout.main.left + 1
  const lines = markdown ? markdownLines(opening(markdown)) : []
  const named = title?.replace(/\s+/g, ' ').trim() ?? ''
  if (named && lines[0]?.kind !== 'heading') {
    // The Markdown often opens by saying the title again.
    if (lines[0]?.text === named) lines.shift()
    lines.unshift({ text: named, kind: 'heading' })
  }
  const last = Math.min(rows.to, Math.floor(layout.kind.length / layout.cols) - 1)
  let row = Math.max(0, rows.from)
  let before: DocKind | null = null
  for (const line of lines) {
    if (before !== null && !(before === line.kind && (line.kind === 'item' || line.kind === 'code'))) row++
    before = line.kind
    let at = 0
    for (const atom of atomsOf(line.text)) {
      // A space before it, unless it starts the line or is glued to what came before.
      let lead = atom.glued || at === 0 ? 0 : 1
      if (at > 0 && at + lead + atom.cells > width) { row++; at = 0; lead = 0 }
      let taken = 0
      while (taken < atom.chars.length) {
        if (row > last) return words
        const point = atom.chars[taken]!.codePointAt(0)!
        const size = isWide(point) ? 2 : 1
        if (at + lead + size > width) {
          // A character the column is too narrow for is left out; otherwise the word goes on at the next line.
          if (at === 0) break
          row++
          at = 0
          lead = 0
          continue
        }
        const cell = row * layout.cols + layout.main.left + at + lead
        words.chars[cell] = point
        words.heading[cell] = line.kind === 'heading' ? 1 : 0
        if (size === 2) { words.chars[cell + 1] = WIDE_TAIL; words.heading[cell + 1] = words.heading[cell]! }
        words.lastRow = row
        at += lead + size
        lead = 0
        taken++
      }
    }
    if (at > 0) row++
  }
  return words
}
