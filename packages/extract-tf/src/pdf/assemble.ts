/**
 * Pages of laid-out lines → one Markdown document with a page marker before
 * each page and the character offsets of every page's text.
 */

import type { Line } from './layout.js'

export interface PdfPage {
  /** 1-based position of the page in the file. */
  number: number
  /** The page label the PDF declares (a printed page number such as "xii" or "12"), or null. */
  label: string | null
  /** The page's text: `markdown.slice(start, end)`. Empty for a page without a text layer. */
  text: string
  start: number
  end: number
  /** With `repeatedLines: 'remove'`: the running header and footer lines taken out of this page's text. */
  removedLines?: string[]
}

export interface PageLines {
  number: number
  label: string | null
  paragraphs: Line[][]
}

const normalise = (text: string) => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/**
 * Takes running headers and footers out of the pages: a line at the top or
 * bottom edge of a page (up to two lines deep) whose text, with digits
 * ignored, stands at the same height on at least three pages and on at least
 * 30% of the pages with text. Returns the removed lines of each page.
 */
export function removeRepeatedLines(pages: PageLines[]): Map<number, string[]> {
  const edges = new Map<number, Line[]>()
  for (const page of pages) {
    const lines = page.paragraphs.flat()
    const direction = lines[0]?.direction
    const upright = lines.filter((line) => line.direction === direction).sort((a, b) => b.y - a.y)
    edges.set(page.number, [...new Set([...upright.slice(0, 2), ...upright.slice(-2)])])
  }
  const seen = new Map<string, Array<{ page: number; y: number }>>()
  for (const [page, lines] of edges) {
    for (const line of lines) {
      const key = normalise(line.text)
      seen.set(key, [...(seen.get(key) ?? []), { page, y: line.y }])
    }
  }
  const threshold = Math.max(3, Math.ceil(0.3 * edges.size))
  const repeated = (line: Line) => new Set((seen.get(normalise(line.text)) ?? [])
    .filter((other) => Math.abs(other.y - line.y) <= 3).map((other) => other.page)).size >= threshold

  const removed = new Map<number, string[]>()
  for (const page of pages) {
    const lines = page.paragraphs.flat()
    const direction = lines[0]?.direction
    const upright = lines.filter((line) => line.direction === direction).sort((a, b) => b.y - a.y)
    const drop = new Set<Line>()
    for (const edge of [upright.slice(0, 2), upright.slice(-2).reverse()]) {
      for (const line of edge) {
        if (!repeated(line)) break
        drop.add(line)
      }
    }
    if (drop.size === 0) continue
    removed.set(page.number, lines.filter((line) => drop.has(line)).map((line) => line.text))
    page.paragraphs = page.paragraphs.map((paragraph) => paragraph.filter((line) => !drop.has(line))).filter((paragraph) => paragraph.length > 0)
  }
  return removed
}

/** How often each word, and each hyphenated compound, occurs in the document's lines. */
export function vocabularyOf(pages: PageLines[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const page of pages) {
    for (const line of page.paragraphs.flat()) {
      for (const [word] of line.text.matchAll(/[\p{L}\p{M}]+(?:[-‐][\p{L}\p{M}]+)*/gu)) {
        const key = word.toLowerCase().replace(/‐/g, '-')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return counts
}

/**
 * Joins a word broken by a hyphen at the end of a line within one paragraph:
 * the first word of the next line, when it starts with a letter or a digit,
 * moves up. The hyphen is removed only when it
 * is a soft hyphen (U+00AD), or when both parts are letters, the second starts
 * in lower case, the document spells the joined word elsewhere and never
 * spells it with the hyphen. Otherwise the hyphen stays (`multi-lateral`,
 * `2020-2025`).
 */
export function joinHyphenated(lines: string[], vocabulary: Map<string, number>): string[] {
  const out = [...lines]
  let i = 0
  while (i + 1 < out.length) {
    const line = out[i]!
    const next = out[i + 1]!
    const hyphen = /\S([-‐­])$/u.exec(line)?.[1]
    const fragment = /^[\p{L}\p{N}]\S*/u.exec(next)?.[0]
    if (hyphen === undefined || fragment === undefined) {
      i++
      continue
    }
    const left = /[\p{L}\p{M}]+(?=[-‐­]$)/u.exec(line)?.[0] ?? ''
    const right = /^[\p{L}\p{M}]+/u.exec(next)?.[0] ?? ''
    const drop = hyphen === '­' || (left !== '' && /^\p{Ll}/u.test(right) &&
      (vocabulary.get(`${left}${right}`.toLowerCase()) ?? 0) > 0 && !vocabulary.has(`${left}-${right}`.toLowerCase()))
    out[i] = (drop ? line.slice(0, -1) : line) + fragment
    const rest = next.slice(fragment.length).trim()
    if (rest === '') {
      out.splice(i + 1, 1)
    } else {
      out[i + 1] = rest
      i++
    }
  }
  return out
}

/** A text line that starts like a page marker is escaped, so every marker line is W2L's own. */
const escapeMarker = (line: string) => (line.startsWith('<!--') ? `\\${line}` : line)

/**
 * The Markdown: for each page, a marker line `<!-- page N -->`, a blank line
 * and the page's paragraphs (lines joined by newlines, paragraphs by blank
 * lines); pages are separated by a blank line and the document ends with a
 * newline. A page without text is its marker alone. Without markers
 * (`markers` false) the pages' text alone, separated by a blank line; a
 * page without text adds nothing, and each page's offsets still locate it.
 */
export function markdownOf(pages: PageLines[], removed: Map<number, string[]> | null, markers = true): { markdown: string; pages: PdfPage[] } {
  const vocabulary = vocabularyOf(pages)
  let markdown = ''
  const out: PdfPage[] = []
  for (const page of pages) {
    const text = page.paragraphs
      .map((paragraph) => joinHyphenated(paragraph.map((line) => line.text), vocabulary).map(escapeMarker).join('\n'))
      .join('\n\n')
    if (markers) {
      if (markdown !== '') markdown += '\n\n'
      markdown += `<!-- page ${page.number} -->`
      if (text !== '') markdown += '\n\n'
    } else if (text !== '' && markdown !== '') markdown += '\n\n'
    const start = markdown.length
    markdown += text
    out.push({ number: page.number, label: page.label, text, start, end: markdown.length, ...(removed ? { removedLines: removed.get(page.number) ?? [] } : {}) })
  }
  return { markdown: `${markdown}\n`, pages: out }
}

/**
 * The numbers of the pages whose text overlaps the span [start, end) of the
 * Markdown, in page order. A span that covers only markers and blank lines
 * belongs to no page.
 */
export function pdfPagesForSpan(pages: readonly PdfPage[], start: number, end = start + 1): number[] {
  const to = Math.max(end, start + 1)
  return pages.filter((page) => page.start < to && start < page.end).map((page) => page.number)
}
