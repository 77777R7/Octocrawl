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
  const footer = rows - 5
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
  for (let row = footer + 2; row < rows - 1; row++) {
    for (let x = margin; x < cols - margin; x += 9) for (let i = 0; i < 5 && x + i < cols - margin; i++) set(x + i, row, Cell.Chrome, '-')
  }
  return { cols, rows, kind, glyph, blocks }
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
