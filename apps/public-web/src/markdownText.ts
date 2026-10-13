/** A page's Markdown as plain text, for the Website to Text tool: the words without the markup. Headings, emphasis and
 * code marks go; a link keeps its text and an image goes; a table's cells are separated by tabs and its rule row goes;
 * list items keep a dash; block quotes lose their marker; HTML comments (a PDF's page markers) go. Line breaks and
 * paragraph breaks stay, with no more than one blank line in a row.
 *
 * The Markdown comes from the engine's converter (packages/extract-tf/src/markdown.ts), which escapes a literal * or _
 * as \* or \_ and leaves parentheses in link targets as they are. So, on each line, code spans and escapes are set
 * aside before anything else, link and image targets are read to their balanced closing parenthesis, and only then is
 * emphasis taken off; what was set aside comes back last, as written. */

// Set-aside pieces are held in Unicode private-use characters, which no page text can contain once they are removed.
const OPEN = ''
const CLOSE = ''

/** Where a link or image target that starts at `from` (just after its "(") ends: its balanced ")", or -1. */
function targetEnd(line: string, from: number): number {
  let depth = 1
  for (let i = from; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\') i++
    else if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return i
  }
  return -1
}

/** A line's links as their text and its images as nothing, reading each target to its balanced parenthesis. */
function dropTargets(line: string): string {
  let out = ''
  let i = 0
  while (i < line.length) {
    const image = line[i] === '!' && line[i + 1] === '['
    if (line[i] !== '[' && !image) {
      out += line[i++]
      continue
    }
    const open = image ? i + 1 : i
    const close = line.indexOf('](', open)
    // A bracket without a target is text.
    const end = close < 0 || line.slice(open + 1, close).includes('\n') ? -1 : targetEnd(line, close + 2)
    if (end < 0) {
      out += line[i++]
      continue
    }
    if (!image) out += line.slice(open + 1, close)
    i = end + 1
  }
  return out
}

function inline(line: string): string {
  const kept: string[] = []
  const keep = (text: string): string => `${OPEN}${kept.push(text) - 1}${CLOSE}`
  let text = line
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks: string, code: string) => keep(code.trim()))
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, (_, ch: string) => keep(ch))
  text = dropTargets(text)
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
  return text.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g'), (_, n: string) => kept[Number(n)] ?? '')
}

export function markdownToText(markdown: string): string {
  const lines: string[] = []
  let fence = false
  const source = markdown
    .replace(/\r\n?/g, '\n')
    .replace(new RegExp(`[${OPEN}${CLOSE}]`, 'g'), '')
    .replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*(\n|$)/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  for (const raw of source.split('\n')) {
    // A code block keeps its lines as they are, without its fences.
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence
      continue
    }
    if (fence) {
      lines.push(raw)
      continue
    }
    // A table's rule row goes; its other rows keep their cells, tab-separated.
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(raw) && raw.includes('|')) continue
    // A horizontal rule goes.
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
      lines.push('')
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      lines.push(raw.trim().slice(1, -1).split(/(?<!\\)\|/).map((cell) => inline(cell.trim())).join('\t'))
      continue
    }
    const heading = /^\s{0,3}#{1,6}\s+/.test(raw)
    const line = (heading ? raw.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s+#+\s*$/, '') : raw)
      .replace(/^(\s*)>\s?/, '$1')
      .replace(/^(\s*)[*+]\s+/, '$1- ')
    // A line that only lost an image keeps its indent but not the space the image left.
    const lead = /^\s*/.exec(line)![0]
    lines.push(lead + inline(line.slice(lead.length)).replace(/^\s+/, '').replace(/\s+$/, ''))
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}
