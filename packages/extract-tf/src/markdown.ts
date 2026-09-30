/**
 * HTML → Markdown after main-content extraction.
 *
 * ExtractorOutput.mainHtml stays HTML (the extractor's job is the region).
 * This is pipeline step 7: turn that region into LLM-ready Markdown.
 * Tables keep the GFM grid rules the fixture suite already scores.
 *
 * Rendering model: an element is either inline (rendered into the running
 * paragraph it sits in) or block (starts a new line). Consecutive inline
 * siblings, text nodes included, form one paragraph, so `<div><span>Alpha
 * </span><span>Beta</span></div>` reads "Alpha Beta" and two sibling
 * `<div>`s become two lines rather than one glued word.
 */

import { parse, tagOf, textOf } from './dom.js'

export interface MarkdownOptions {
  /** Page URL used to resolve relative link and image targets. */
  baseUrl?: string
}

const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'img',
  'ins', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong',
  'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr',
])

/** Elements whose content never belongs in the text. */
const SKIPPED_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'button', 'select', 'option', 'textarea', 'input',
  'svg', 'canvas', 'iframe', 'object', 'embed', 'audio', 'video', 'map', 'head', 'title', 'meta', 'link',
])

function entityDecode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? ''
}

/** Hidden from every reader: skip it like a script. */
function isHidden(el: Element): boolean {
  if (el.hasAttribute('hidden')) return true
  if (attr(el, 'aria-hidden') === 'true') return true
  const style = attr(el, 'style').replace(/\s+/g, '').toLowerCase()
  return style.includes('display:none') || style.includes('visibility:hidden')
}

function isInline(node: Node): boolean {
  if (node.nodeType === 3) return true
  if (node.nodeType !== 1) return false
  return INLINE_TAGS.has(tagOf(node as Element))
}

/**
 * Cell text: whitespace-normalized text with a space at every block
 * boundary and `<br>`, so "1.10<br>1.09" and "<p>a</p><p>b</p>" inside a
 * cell read "1.10 1.09" and "a b", not "1.101.09".
 */
function cellText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const el = node as Element
  const tag = tagOf(el)
  if (SKIPPED_TAGS.has(tag) || isHidden(el)) return ''
  if (tag === 'br') return ' '
  const inner = Array.from(el.childNodes).map(cellText).join('')
  return INLINE_TAGS.has(tag) ? inner : ` ${inner} `
}

function normalizeCell(s: string): string {
  return entityDecode(s)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\|/g, '\\|')
}

/**
 * Expand spanned cells into the logical grid: colspan adds '' continuation
 * cells in the same row, rowspan adds '' cells in the same column of the
 * following rows. The fixture ground truth scores exactly this geometry; a
 * converter that repeats the spanning value fails it.
 */
function expandGrid(rows: { value: string; colspan: number; rowspan: number }[][]): string[][] {
  const out: (string | undefined)[][] = []
  const vertical: { col: number; left: number }[] = []
  for (const htmlRow of rows) {
    const row: (string | undefined)[] = []
    let cursor = 0
    const fillOccupied = () => {
      for (;;) {
        const span = vertical.find((s) => s.col === cursor)
        if (!span) break
        row[cursor] = ''
        cursor++
        if (--span.left === 0) vertical.splice(vertical.indexOf(span), 1)
      }
    }
    for (const cell of htmlRow) {
      fillOccupied()
      row[cursor] = cell.value
      const cs = Math.max(1, cell.colspan)
      const rs = Math.max(1, cell.rowspan)
      if (cs > 1) for (let x = 1; x < cs; x++) row[++cursor] = ''
      if (rs > 1) {
        for (let w = 0; w < cs; w++) vertical.push({ col: cursor - cs + 1 + w, left: rs - 1 })
      }
      cursor++
    }
    fillOccupied()
    out.push(row)
  }
  const width = Math.max(0, ...out.map((r) => r.length))
  return out.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? ''))
}

function tableToGfm(table: Element): string {
  const captionEl = table.querySelector('caption')
  const caption = captionEl ? normalizeCell(textOf(captionEl)) : null
  const rows = Array.from(table.querySelectorAll('tr'))
    // Rows of a nested table belong to that table's own grid.
    .filter((tr) => tr.closest('table') === table)
    .map((tr) =>
      Array.from(tr.querySelectorAll('th,td'))
        .filter((cell) => cell.closest('tr') === tr)
        .map((cell) => ({
          value: normalizeCell(cellText(cell)),
          colspan: Number(cell.getAttribute('colspan') ?? 1) || 1,
          rowspan: Number(cell.getAttribute('rowspan') ?? 1) || 1,
        })),
    )
  if (rows.length === 0) return ''
  const grid = expandGrid(rows)
  const header = grid[0]!
  if (header[0] === '') header[0] = '(header)'
  const lines: string[] = []
  if (caption) lines.push(caption)
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`| ${header.map(() => '---').join(' | ')} |`)
  for (const row of grid.slice(1)) lines.push(`| ${row.join(' | ')} |`)
  return lines.join('\n')
}

class Renderer {
  constructor(private readonly baseUrl: string | undefined) {}

  private resolve(target: string): string {
    const trimmed = target.trim()
    if (trimmed.length === 0 || this.baseUrl === undefined) return trimmed
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return trimmed
    try {
      return new URL(trimmed, this.baseUrl).href
    } catch {
      return trimmed
    }
  }

  /** Render an inline node into paragraph text. `\n` survives only from `<br>`. */
  inline(node: Node): string {
    if (node.nodeType === 3) return (node.textContent ?? '').replace(/\s+/g, ' ')
    if (node.nodeType !== 1) return ''
    const el = node as Element
    const tag = tagOf(el)
    if (SKIPPED_TAGS.has(tag) || isHidden(el)) return ''
    if (!INLINE_TAGS.has(tag)) {
      // A block inside an inline run (a <div> inside an <a>): keep its text on
      // this line rather than losing it.
      return ` ${this.blocks(el).replace(/\s+/g, ' ').trim()} `
    }
    const inner = Array.from(el.childNodes).map((c) => this.inline(c)).join('')
    switch (tag) {
      case 'br':
        return '\n'
      case 'wbr':
        return ''
      case 'strong':
      case 'b': {
        const t = inner.trim()
        return t ? `**${t}**` : ''
      }
      case 'em':
      case 'i': {
        const t = inner.trim()
        return t ? `*${t}*` : ''
      }
      case 'del':
      case 's':
      case 'strike': {
        const t = inner.trim()
        return t ? `~~${t}~~` : ''
      }
      case 'code':
      case 'kbd':
      case 'samp': {
        const t = inner.trim()
        return t ? `\`${t}\`` : ''
      }
      case 'a': {
        const href = this.resolve(attr(el, 'href'))
        const text = inner.trim() || href
        if (!href || /^javascript:/i.test(href)) return text
        return `[${text}](${href})`
      }
      case 'img': {
        const alt = attr(el, 'alt').replace(/\s+/g, ' ').trim()
        const src = this.resolve(attr(el, 'src'))
        // Inline data: URIs are bytes, not a reference a reader can follow.
        if (!src || /^data:/i.test(src)) return alt
        return `![${alt}](${src})`
      }
      default:
        return inner
    }
  }

  /** One paragraph from a run of inline siblings. */
  private paragraph(run: Node[]): string {
    const text = run.map((n) => this.inline(n)).join('')
    return text
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{2,}/g, '\n')
      .trim()
  }

  /**
   * Render the children of a container as blocks, blank-line separated by
   * default (`separator` = '\n' keeps list items tight).
   */
  blocks(root: Element, separator = '\n\n'): string {
    const parts: string[] = []
    let run: Node[] = []
    const flush = () => {
      if (run.length === 0) return
      const text = this.paragraph(run)
      if (text) parts.push(text)
      run = []
    }
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType === 1) {
        const el = child as Element
        // A skipped or hidden element is not a paragraph boundary: the text
        // around a <meta> or a hidden icon stays one paragraph.
        if (SKIPPED_TAGS.has(tagOf(el)) || isHidden(el)) continue
      }
      if (isInline(child)) {
        run.push(child)
        continue
      }
      if (child.nodeType !== 1) continue
      flush()
      const rendered = this.block(child as Element)
      if (rendered) parts.push(rendered)
    }
    flush()
    return parts.join(separator)
  }

  private list(el: Element, ordered: boolean): string {
    const start = ordered ? Number(attr(el, 'start')) || 1 : 1
    const items = Array.from(el.children).filter((c) => tagOf(c) === 'li')
    const lines: string[] = []
    items.forEach((li, index) => {
      const marker = ordered ? `${start + index}. ` : '- '
      const indent = ' '.repeat(marker.length)
      const body = this.blocks(li, '\n').split('\n')
      const first = body.shift() ?? ''
      lines.push(`${marker}${first}`.trimEnd())
      for (const line of body) lines.push(line ? `${indent}${line}` : '')
    })
    return lines.join('\n')
  }

  block(el: Element): string {
    const tag = tagOf(el)
    if (SKIPPED_TAGS.has(tag) || isHidden(el)) return ''
    if (tag === 'table') return tableToGfm(el)
    if (/^h[1-6]$/.test(tag)) {
      const text = this.paragraph(Array.from(el.childNodes)).replace(/\n+/g, ' ').trim()
      return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : ''
    }
    if (tag === 'p') return this.paragraph(Array.from(el.childNodes))
    if (tag === 'blockquote') {
      const body = this.blocks(el)
      return body
        ? body
            .split('\n')
            .map((l) => (l.length ? `> ${l}` : '>'))
            .join('\n')
        : ''
    }
    if (tag === 'pre') {
      const code = el.querySelector('code')
      const lang = code ? /\blanguage-([\w+-]+)/.exec(attr(code, 'class'))?.[1] ?? '' : ''
      const body = textOf(el).replace(/\n$/, '')
      return `\`\`\`${lang}\n${body}\n\`\`\``
    }
    if (tag === 'ul') return this.list(el, false)
    if (tag === 'ol') return this.list(el, true)
    if (tag === 'li') return this.list(el.parentElement ?? el, false)
    if (tag === 'hr') return '---'
    if (tag === 'dt') {
      const text = this.paragraph(Array.from(el.childNodes)).replace(/\n+/g, ' ').trim()
      return text ? `**${text}**` : ''
    }
    if (tag === 'dd') return this.blocks(el)
    if (tag === 'figcaption' || tag === 'summary') {
      const text = this.paragraph(Array.from(el.childNodes)).trim()
      return text ? `*${text}*` : ''
    }
    // Any other element (div, section, article, main, header, td…) is a
    // container: its inline runs become paragraphs, its blocks stay blocks.
    return this.blocks(el)
  }
}

export function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
  if (html.trim().length === 0) return ''
  const wrapped = /<html[\s>]|<!doctype/i.test(html)
    ? html
    : `<!doctype html><html><body>${html}</body></html>`
  const doc = parse(wrapped)
  const root =
    doc.document.body && doc.document.body.childNodes.length > 0
      ? doc.document.body
      : (doc.document.documentElement ?? doc.document.body)
  if (!root) {
    doc.close()
    return ''
  }
  const md = new Renderer(options.baseUrl)
    .blocks(root)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  doc.close()
  return md
}
