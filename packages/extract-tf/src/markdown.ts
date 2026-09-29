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
 */

import { parse } from './dom.js'
import { documentBaseUrl } from './links.js'

export interface MarkdownOptions {
  /**
   * Base for relative link and image targets: the document base URL
   * (ExtractorOutput.baseUrl). A whole document's own `<base href>` is
   * resolved against it. Without a base, targets stay as written.
   */
  baseUrl?: string | null
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

/** Never content: skipped together with everything inside. */
const SKIP = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'base',
  'button', 'input', 'select', 'option', 'optgroup', 'datalist', 'textarea',
  'svg', 'canvas', 'iframe', 'object', 'embed', 'audio', 'video', 'source', 'track', 'map', 'area',
])

/** Elements a browser lays out as blocks by default. Everything else is inline. */
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'dd', 'details', 'dialog',
  'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'html', 'legend', 'li', 'main', 'menu', 'nav', 'ol',
  'p', 'pre', 'search', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])

const LIST = new Set(['ul', 'ol', 'menu', 'dir'])

/** HTML's collapsible whitespace, plus the no-break space, which becomes a plain space. */
const WHITESPACE = /[\t\n\f\r \u00a0]+/g

interface Context {
  base: URL | null
  /** containsBlock results, so the walk stays linear in the size of the tree. */
  blockMemo: Map<Element, boolean>
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

/** Cell text with <br> and block boundaries as spaces, so separate lines stay separate words. */
function cellText(cell: Element): string {
  const parts: string[] = []
  const walk = (parent: Node): void => {
    for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
      if (node.nodeType === TEXT_NODE) {
        parts.push((node as Text).data)
      } else if (node.nodeType === ELEMENT_NODE) {
        const tag = (node as Element).localName
        if (SKIP.has(tag)) continue
        const gap = tag === 'br' || BLOCK.has(tag)
        if (gap) parts.push(' ')
        walk(node)
        if (gap) parts.push(' ')
      }
    }
  }
  walk(cell)
  return parts.join('')
}

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
  const caption = captionEl ? normalizeCell(cellText(captionEl)) : null
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th,td')).map((cell) => ({
      value: normalizeCell(cellText(cell)),
      colspan: Number(cell.getAttribute('colspan') ?? 1) || 1,
      rowspan: Number(cell.getAttribute('rowspan') ?? 1) || 1,
    })),
  )
  if (rows.every((row) => row.length === 0)) return ''
  const grid = expandGrid(rows)
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
}

/**
 * The inline content of one paragraph (or of one link, emphasis or heading),
 * with whitespace collapsed as a browser collapses it. A '\n' in the text is a
 * <br>.
 */
class Inline {
  private readonly parts: string[] = []
  private any = false
  private lineStarted = false
  private pendingSpace = false
  private lead = false
  private leadBreak = false

  text(raw: string): void {
    const text = raw.replace(WHITESPACE, ' ')
    if (text.length === 0) return
    const leading = text.startsWith(' ')
    const trailing = text.length > 1 && text.endsWith(' ')
    if (leading) this.space()
    const core = text.slice(leading ? 1 : 0, trailing ? -1 : undefined)
    if (core) this.content(core)
    if (trailing) this.space()
  }

  space(): void {
    if (this.lineStarted) this.pendingSpace = true
    else if (!this.any) this.lead = true
  }

  content(s: string): void {
    if (this.pendingSpace) {
      this.parts.push(' ')
      this.pendingSpace = false
    }
    this.parts.push(s)
    this.any = this.lineStarted = true
  }

  lineBreak(): void {
    this.pendingSpace = false
    if (!this.any) {
      this.leadBreak = true
      return
    }
    this.parts.push('\n')
    this.lineStarted = false
  }

  /**
   * Append a nested run between markers. Its outer whitespace goes outside
   * the markers (`** bold **` is not emphasis), and an empty run emits no
   * markers at all.
   */
  wrap(inner: InlineResult, open: string, close: string): void {
    if (inner.leadBreak) this.lineBreak()
    else if (inner.lead) this.space()
    // A blank line would end the paragraph inside the markers.
    if (inner.text) this.content(open + inner.text.replace(/\n{2,}/g, '\n') + close)
    if (inner.trailBreak) this.lineBreak()
    else if (inner.trail) this.space()
  }

  finish(): InlineResult {
    const joined = this.parts.join('')
    const text = joined.replace(/\n+$/, '')
    return {
      text,
      lead: this.lead,
      trail: this.pendingSpace,
      leadBreak: this.leadBreak,
      trailBreak: text.length < joined.length,
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

interface Marks {
  strong: boolean
  em: boolean
  link: boolean
}

const NO_MARKS: Marks = { strong: false, em: false, link: false }

/**
 * Link and image targets are made absolute against the document base, so the
 * Markdown stands on its own. Same-document fragments ("#section") stay as
 * written: they point at headings of this same Markdown, and Monitor heading
 * rules read heading anchors in that form. Without a base, targets stay as
 * written. javascript: targets and unparseable ones give no target.
 */
function linkTarget(raw: string, base: URL | null): string | null {
  const href = raw.replace(/[\t\n\r]/g, '').trim()
  if (href === '' || /^javascript:/i.test(href)) return null
  if (href.startsWith('#') || base === null) return href
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

/** A target as a CommonMark link destination, in <…> where a space or unbalanced parenthesis would cut it short. */
function destination(target: string): string {
  if (!/[()\s<>]/.test(target)) return target
  let depth = 0
  for (const ch of target) {
    if (ch === '(') depth++
    else if (ch === ')' && --depth < 0) break
  }
  if (depth === 0 && !/[\s<>]/.test(target)) return target
  return `<${target.replace(/</g, '%3C').replace(/>/g, '%3E')}>`
}

function longestBacktickRun(text: string): number {
  let longest = 0
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length)
  return longest
}

function inlineChildren(parent: Node, out: Inline, ctx: Context, marks: Marks): void {
  for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === TEXT_NODE) out.text((node as Text).data)
    else if (node.nodeType === ELEMENT_NODE) inlineElement(node as Element, out, ctx, marks)
  }
}

function inlineElement(el: Element, out: Inline, ctx: Context, marks: Marks): void {
  const tag = el.localName
  if (SKIP.has(tag)) return
  switch (tag) {
    case 'br':
      out.lineBreak()
      return
    case 'img':
      image(el, out, ctx)
      return
    case 'code':
      codeSpan(el, out)
      return
    case 'a':
      if (link(el, out, ctx, marks)) return
      break
    case 'strong':
    case 'b':
      if (marks.strong) break
      emphasis(el, out, ctx, { ...marks, strong: true }, '**')
      return
    case 'em':
    case 'i':
      if (marks.em) break
      emphasis(el, out, ctx, { ...marks, em: true }, '*')
      return
  }
  // Blocks met in inline context (a card inside a link, a paragraph inside a
  // heading) flatten to one line: their boundaries become spaces. The loop is
  // written out (not inlineChildren) so deep nesting costs one stack frame
  // per level.
  const block = BLOCK.has(tag)
  if (block) out.space()
  for (let node = el.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === TEXT_NODE) out.text((node as Text).data)
    else if (node.nodeType === ELEMENT_NODE) inlineElement(node as Element, out, ctx, marks)
  }
  if (block) out.space()
}

function emphasis(el: Element, out: Inline, ctx: Context, marks: Marks, marker: string): void {
  const inner = new Inline()
  inlineChildren(el, inner, ctx, marks)
  out.wrap(inner.finish(), marker, marker)
}

function codeSpan(el: Element, out: Inline): void {
  const inner = new Inline()
  inner.text(el.textContent ?? '')
  const result = inner.finish()
  const fence = '`'.repeat(longestBacktickRun(result.text) + 1)
  const pad = result.text.startsWith('`') || result.text.endsWith('`') ? ' ' : ''
  out.wrap(result, fence + pad, pad + fence)
}

/** Render a link; false when it has no usable target (no href, or inside another link) and is only text. */
function link(el: Element, out: Inline, ctx: Context, marks: Marks): boolean {
  const href = el.getAttribute('href')
  const target = href === null || marks.link ? null : linkTarget(href, ctx.base)
  if (target === null) return false
  const inner = new Inline()
  inlineChildren(el, inner, ctx, { ...marks, link: true })
  const result = inner.finish()
  // A link with no text keeps its target as the text, except a bare
  // same-page anchor (a heading's permalink icon), which says nothing.
  if (!result.text && target.startsWith('#')) out.wrap(result, '', '')
  else out.wrap({ ...result, text: result.text || target }, '[', `](${destination(target)})`)
  return true
}

function image(el: Element, out: Inline, ctx: Context): void {
  const alt = (el.getAttribute('alt') ?? '').replace(WHITESPACE, ' ').trim()
  const src = el.getAttribute('src')
  const target = src === null ? null : linkTarget(src, ctx.base)
  if (target !== null) out.content(`![${alt.replace(/[[\]]/g, '\\$&')}](${destination(target)})`)
  else if (alt) out.content(alt)
}

// ---------------------------------------------------------------- blocks

/** Blocks of one container, plus the paragraph its inline content is building. */
class Flow {
  readonly blocks: Block[] = []
  inline = new Inline()

  constructor(readonly ctx: Context) {}

  flush(): void {
    const text = this.inline.paragraph()
    if (text) this.blocks.push({ text })
    this.inline = new Inline()
  }

  add(...blocks: (Block | null)[]): void {
    this.flush()
    for (const block of blocks) if (block !== null && block.text) this.blocks.push(block)
  }
}

function flowChildren(parent: Node, flow: Flow): void {
  for (let node = parent.firstChild; node !== null; node = node.nextSibling) flowNode(node, flow)
}

function flowNode(node: Node, flow: Flow): void {
  if (node.nodeType === TEXT_NODE) {
    flow.inline.text((node as Text).data)
    return
  }
  if (node.nodeType !== ELEMENT_NODE) return
  const el = node as Element
  const tag = el.localName
  if (SKIP.has(tag)) return
  const ctx = flow.ctx
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
      flow.add(codeBlock(el))
      return
    case 'table':
      flow.add({ text: tableToGfm(el) })
      return
    case 'li': {
      // An item outside any list still renders with its bullet.
      const text = listItem('-', blocksOf(el, ctx))
      flow.add({ text, interrupts: true })
      return
    }
    case 'blockquote':
      flow.add(blockquote(el, ctx))
      return
    case 'hr':
      flow.add({ text: '---' })
      return
    case 'br':
      flow.inline.lineBreak()
      return
  }
  if (LIST.has(tag)) {
    flow.add(...list(el, ctx))
    return
  }
  const block = BLOCK.has(tag)
  if (!block && !containsBlock(el, ctx)) {
    inlineElement(el, flow.inline, ctx, NO_MARKS)
    return
  }
  if (!block && tag === 'a' && el.hasAttribute('href')) {
    // A link around blocks (a card) stays one link, with its text flattened,
    // in a paragraph of its own.
    flow.flush()
    inlineElement(el, flow.inline, ctx, NO_MARKS)
    flow.flush()
    return
  }
  // A block container, or an inline element around blocks (a <span> holding
  // <div>s), which is laid out as those blocks. The loop is written out so
  // deep nesting costs one stack frame per level.
  if (block) flow.flush()
  for (let child = el.firstChild; child !== null; child = child.nextSibling) flowNode(child, flow)
  if (block) flow.flush()
}

function containsBlock(el: Element, ctx: Context): boolean {
  const known = ctx.blockMemo.get(el)
  if (known !== undefined) return known
  let found = false
  for (let child = el.firstElementChild; child !== null && !found; child = child.nextElementSibling) {
    const tag = child.localName
    if (!SKIP.has(tag)) found = BLOCK.has(tag) || containsBlock(child, ctx)
  }
  ctx.blockMemo.set(el, found)
  return found
}

/** The blocks inside a container element. */
function blocksOf(el: Node, ctx: Context): Block[] {
  const flow = new Flow(ctx)
  flowChildren(el, flow)
  flow.flush()
  return flow.blocks
}

/** The blocks one node renders to on its own. */
function nodeBlocks(node: Node, ctx: Context): Block[] {
  const flow = new Flow(ctx)
  flowNode(node, flow)
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
function preText(pre: Element): string {
  const parts: string[] = []
  const walk = (parent: Node): void => {
    for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
      if (node.nodeType === TEXT_NODE) {
        parts.push((node as Text).data)
      } else if (node.nodeType === ELEMENT_NODE) {
        const tag = (node as Element).localName
        if (tag === 'br') parts.push('\n')
        else if (!SKIP.has(tag)) walk(node)
      }
    }
  }
  walk(pre)
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

function codeBlock(pre: Element): Block | null {
  let text = preText(pre).replace(/\r\n?/g, '\n')
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

function blockquote(el: Element, ctx: Context): Block | null {
  const inner = blocksOf(el, ctx)
    .map((block) => block.text)
    .join('\n\n')
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
 * through.
 */
function list(el: Element, ctx: Context): Block[] {
  const ordered = el.localName === 'ol'
  const start = Number.parseInt(el.getAttribute('start') ?? '', 10)
  let number = ordered && start >= 0 ? start : 1
  const before: Block[] = []
  const items: { marker: string; blocks: Block[] }[] = []
  const visit = (parent: Element): void => {
    for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
      const tag = node.nodeType === ELEMENT_NODE ? (node as Element).localName : ''
      if (tag === 'li') {
        const value = ordered ? Number.parseInt((node as Element).getAttribute('value') ?? '', 10) : Number.NaN
        if (value >= 0) number = value
        items.push({ marker: ordered ? `${number}.` : '-', blocks: blocksOf(node, ctx) })
        number++
      } else if (tag !== '' && !SKIP.has(tag) && !LIST.has(tag) && hasItemChild(node as Element)) {
        visit(node as Element)
      } else {
        const blocks = nodeBlocks(node, ctx)
        const last = items[items.length - 1]
        if (last) last.blocks.push(...blocks)
        else before.push(...blocks)
      }
    }
  }
  visit(el)
  const text = items
    .map((item) => listItem(item.marker, item.blocks))
    .filter(Boolean)
    .join('\n')
  return [...before, { text, interrupts: text.startsWith('- ') || text.startsWith('1. ') }]
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
  if (html.trim().length === 0) return ''
  const whole = /<html[\s>]|<!doctype/i.test(html)
  const doc = parse(whole ? html : `<!doctype html><html><body>${html}</body></html>`)
  const document = doc.document
  const root =
    document.body && document.body.childNodes.length > 0 ? document.body : (document.documentElement ?? document.body)
  if (!root) {
    doc.close()
    return ''
  }
  // A whole document may carry its own <base href>; a fragment such as
  // mainHtml is resolved against the base the caller passes.
  const base = toUrl(whole ? documentBaseUrl(document, options.baseUrl) : options.baseUrl)
  const markdown = blocksOf(root, { base, blockMemo: new Map() })
    .map((block) => block.text)
    .join('\n\n')
  doc.close()
  return markdown
}
