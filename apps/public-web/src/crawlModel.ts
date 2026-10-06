/** The crawl window's model, without the DOM: the page it draws as a grid of glyphs, how far down that page the
 * octopus may go given what the server has reported, and the words of a read page that its cells resolve into.
 * Everything a visitor reads in the window comes from the run itself; the page's silhouette is drawn, never claimed. */

/** What the server reported while the preview ran (packages/public-preview, PreviewStage), in the order it does. */
export type StageEvent = { stage: 'started' } | { stage: 'robots'; allowed: boolean; unreachable?: true } | { stage: 'page' }
export type CrawlStage = StageEvent['stage']

/** How far down the page (0 to 1) the octopus may crawl. It never runs ahead of what the server has reported: it
 * waits at the door until robots.txt lets it in, and only the result lets it reach the foot. */
export function crawlCap(seen: ReadonlySet<CrawlStage>, robotsAllowed: boolean | null, done: boolean): number {
  if (done) return 1
  if (robotsAllowed === false) return 0
  if (seen.has('page')) return 0.9
  if (seen.has('robots')) return 0.35
  return 0
}

/** Whether the content the octopus passes may dissolve: only once the result says the page was read. The `page`
 * stage is not enough: the server receives a challenge page or an empty shell too, and refuses it after. */
export function mayRead(pageRead: boolean): boolean {
  return pageRead
}

/** The progress bar's steps, in order: the request was taken, robots.txt read, the page read, the result back. */
export const PROGRESS_STEPS = ['started', 'robots', 'page', 'result'] as const

/** How many of the bar's steps the server has completed. Steps are counted only when reported, never estimated. */
export function stepsDone(seen: ReadonlySet<CrawlStage>, done: boolean): number {
  return PROGRESS_STEPS.filter(step => step === 'result' ? done : seen.has(step)).length
}

/** What the server is doing, said plainly from the last thing it reported. */
export function stageLabel(seen: ReadonlySet<CrawlStage>, robotsAllowed: boolean | null, robotsUnreachable = false): string {
  if (robotsAllowed === false) return robotsUnreachable ? 'robots.txt could not be read · not fetching' : 'robots.txt disallows this page'
  if (seen.has('page')) return 'Page received · checking it'
  if (seen.has('robots')) return 'robots.txt allows it · fetching the page'
  if (seen.has('started')) return 'Checking robots.txt'
  return 'Sending the link'
}

/** A cell of the drawn page: nothing, the page's chrome (navigation, sidebar, footer), or its main content. */
export const Cell = { Empty: 0, Chrome: 1, Text: 2, Title: 3, Image: 4 } as const
export type Cell = typeof Cell[keyof typeof Cell]

export interface Block { kind: 'title' | 'text' | 'image'; top: number; bottom: number; left: number; right: number }

export interface PageLayout {
  cols: number
  rows: number
  kind: Uint8Array
  /** The silhouette's own glyph for each cell (a char code; 32 for none). */
  glyph: Uint16Array
  /** The main content's blocks, top to bottom: what the octopus reaches for. */
  blocks: Block[]
  /** The footer's rule near the page's foot: the ground the octopus lands on. */
  floor: number
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
  // Footer.
  for (let x = 0; x < cols; x++) set(x, footer, Cell.Chrome, '·')
  for (let row = footer + 1; row < rows; row++) {
    for (let x = margin; x < cols - margin; x += 9) for (let i = 0; i < 5 && x + i < cols - margin; i++) set(x + i, row, Cell.Chrome, '-')
  }
  return { cols, rows, kind, glyph, blocks, floor: footer }
}

/** A page's Markdown as plain words: no link targets, pictures, emphasis marks, code fences or table rules. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)]|>)\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/(\*\*|__|\*|_|~~)(\S(?:[^*_~]*?\S)?)\1/g, '$2')
    .replace(/`+/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words laid into runs of cells, one run at a time, never split mid-word unless a word is longer than a run, with a
 * space between words. Writes a char code into `out` for each cell it fills, and stops when the words do. */
function pour(words: string[], runs: Array<{ start: number; length: number }>, out: Uint16Array): void {
  let word = 0
  let offset = 0
  for (const run of runs) {
    let at = 0
    while (word < words.length && at < run.length) {
      const rest = words[word]!.slice(offset)
      const room = run.length - at
      if (rest.length > room && at > 0 && rest.length <= run.length) break
      const piece = rest.slice(0, room)
      for (let i = 0; i < piece.length; i++) out[run.start + at + i] = piece.charCodeAt(i)
      if (at + piece.length < run.length) out[run.start + at + piece.length] = SPACE
      at += piece.length + 1
      if (piece.length < rest.length) offset += piece.length
      else { word++; offset = 0 }
    }
    if (word >= words.length) return
  }
}

/** The read page's own words, placed where the silhouette has lines: its title in the title, its text in the
 * paragraphs. Only characters from `title` and `markdown` are ever placed; a page with no words gets none. */
export function fillWords(layout: PageLayout, title: string | null, markdown: string | null): Uint16Array {
  const out = new Uint16Array(layout.cols * layout.rows)
  const runsOf = (kinds: Cell[]): Array<{ start: number; length: number }> => {
    const runs: Array<{ start: number; length: number }> = []
    for (const block of layout.blocks) {
      for (let y = block.top; y <= block.bottom; y++) {
        let start = -1
        for (let x = block.left; x <= block.right + 1; x++) {
          const inside = x <= block.right && kinds.includes(layout.kind[y * layout.cols + x] as Cell)
          if (inside && start < 0) start = x
          if (!inside && start >= 0) { runs.push({ start: y * layout.cols + start, length: x - start }); start = -1 }
        }
      }
    }
    return runs
  }
  const split = (text: string): string[] => text.split(/\s+/).filter(Boolean)
  const heading = title?.replace(/\s+/g, ' ').trim() ?? ''
  if (heading) pour(split(heading), runsOf([Cell.Title]), out)
  let body = markdown ? plainText(markdown) : ''
  // The Markdown usually opens with the title the title block already shows.
  if (heading && body.startsWith(heading)) body = body.slice(heading.length).trim()
  if (body) pour(split(body), runsOf([Cell.Text]), out)
  return out
}

/** The server's picture of the page (packages/public-preview, the stream's `capture` line): its top as a cold browser
 * rendered it, and where the elements the window may mark sit in it, in the picture's own pixels. */
export interface CaptureElement { tag: string; x: number; y: number; width: number; height: number; text: string }
export interface PageCapture { width: number; height: number; jpeg: string; elements: CaptureElement[] }

const RANK: Record<number, number> = { [Cell.Title]: 3, [Cell.Image]: 2, [Cell.Text]: 1 }

function captureKind(tag: string): Cell {
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') return Cell.Title
  if (tag === 'img' || tag === 'table') return Cell.Image
  return Cell.Text
}

/** The grid over the picture: `cols` cells wide at `pitchX` px, as many rows as the picture scaled by `scale` fills
 * at `pitchY`, plus the floor. A cell is the kind of the element that covers it, a heading winning over a picture
 * over text, and each element is a block for the octopus to reach. The cells' own glyphs come from the picture's
 * brightness (glyphForLuminance), not from here. */
export function captureLayout(page: Pick<PageCapture, 'width' | 'height' | 'elements'>, cols: number, pitchX: number, pitchY: number, scale: number, minRows = 12): PageLayout {
  // At least the window's own rows, so a short picture still fills it and the view never scrolls above the top.
  const rows = Math.max(12, minRows, Math.ceil(page.height * scale / pitchY) + 2)
  const kind = new Uint8Array(cols * rows)
  const glyph = new Uint16Array(cols * rows).fill(32)
  const blocks: Block[] = []
  for (const element of page.elements) {
    const left = Math.max(0, Math.floor(element.x * scale / pitchX))
    const right = Math.min(cols - 1, Math.ceil((element.x + element.width) * scale / pitchX) - 1)
    const top = Math.max(0, Math.floor(element.y * scale / pitchY))
    const bottom = Math.min(rows - 3, Math.ceil((element.y + element.height) * scale / pitchY) - 1)
    if (right < left || bottom < top) continue
    const k = captureKind(element.tag)
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const i = row * cols + col
        if ((RANK[kind[i]!] ?? 0) < RANK[k]!) kind[i] = k
      }
    }
    blocks.push({ kind: k === Cell.Title ? 'title' : k === Cell.Image ? 'image' : 'text', top, bottom, left, right })
    if (blocks.length >= 400) break
  }
  blocks.sort((a, b) => a.top - b.top || a.left - b.left)
  return { cols, rows, kind, glyph, blocks, floor: rows - 2 }
}

/** The glyph a cell of the picture dissolves into: the darker the pixels (ink on a page), the denser the glyph. */
const LUMINANCE_RAMP = ['·', ':', '+', 'x', 'X', '#']
export function glyphForLuminance(luminance: number): string {
  const dark = 1 - Math.max(0, Math.min(255, luminance)) / 255
  return LUMINANCE_RAMP[Math.min(LUMINANCE_RAMP.length - 1, Math.floor(dark * LUMINANCE_RAMP.length))]!
}

/** The elements of the picture whose text the result holds: what was extracted, and so what the window may mark as
 * read. Navigation, sidebars and whatever else the extraction left out stay pixels. A heading counts when the title
 * or the Markdown has it, a picture when the Markdown keeps its alt text, anything else when the Markdown's words
 * contain its first line. Only text the result itself holds can match: nothing is inferred. */
export function extractedElements(elements: CaptureElement[], title: string | null, markdown: string | null): CaptureElement[] {
  const norm = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim()
  // Bare addresses are not words the page said: "faq" in a link's path does not make a "FAQ" heading read.
  const words = norm((markdown ? plainText(markdown) : '').replace(/https?:\/\/\S+/g, ' '))
  const heading = norm(title ?? '')
  const raw = norm(markdown ?? '')
  // The phrase as whole words: "AI" is not in "said", nor "go" in "going".
  const holds = (haystack: string, phrase: string): boolean => new RegExp(`(^|[^\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(haystack)
  return elements.filter(element => {
    const text = norm(element.text)
    if (element.tag === 'img') return text.length >= 2 && raw.includes(`![${text}`)
    const isHeading = /^h[1-4]$/.test(element.tag)
    if (text.length < (isHeading ? 3 : 6)) return false
    return holds(words, text) || (isHeading && heading === text)
  })
}
