import { describe, expect, it } from 'vitest'
import { Cell, closePage, crawlCap, DIVE_FROM, gateOpen, isWide, layoutPage, markdownLines, mayRead, stageLabel, stepsDone, typesetPage, WIDE_TAIL, type CrawlStage, type PageLayout, type PageWords } from '../src/crawlModel'
import { readPreview } from '../src/previewStream'

const stages = (...names: CrawlStage[]) => new Set<CrawlStage>(names)

describe('crawl window progress', () => {
  it('never lets the octopus reach the foot before the result, and holds it at the door when robots.txt refuses', () => {
    const caps = [stages(), stages('started'), stages('started', 'robots'), stages('started', 'robots', 'page')].map(seen => crawlCap(seen, true, false))
    expect(caps).toEqual([...caps].sort((a, b) => a - b))
    expect(Math.max(...caps)).toBeLessThan(1)
    expect(crawlCap(stages('started', 'robots'), false, false)).toBe(0)
    expect(crawlCap(stages('started'), null, false)).toBe(0)
    expect(crawlCap(stages(), null, true)).toBe(1)
  })

  it('dissolves nothing as read until the result says the page was read', () => {
    // The page stage comes for a challenge page or an empty shell too.
    expect(mayRead(false)).toBe(false)
    expect(mayRead(true)).toBe(true)
  })

  it('keeps part of the page for the last dive: before the result the window stops the octopus short of what the page stage allows', () => {
    expect(DIVE_FROM).toBeGreaterThan(crawlCap(stages('started', 'robots'), true, false))
    expect(DIVE_FROM).toBeLessThan(crawlCap(stages('started', 'robots', 'page'), true, false))
    expect(DIVE_FROM).toBeLessThan(1)
  })

  it('opens the robots.txt gate only when the file allows the page, or when a server that named no robots stage has gone on', () => {
    expect(gateOpen(stages(), null, false)).toBe(false)
    expect(gateOpen(stages('started'), null, false)).toBe(false)
    expect(gateOpen(stages('started', 'robots'), true, false)).toBe(true)
    // A refusal keeps it shut whatever follows.
    expect(gateOpen(stages('started', 'robots'), false, false)).toBe(false)
    expect(gateOpen(stages('started', 'robots', 'page'), false, true)).toBe(false)
    // No robots stage was reported: the page stage, or a read result, shows the server went on.
    expect(gateOpen(stages('started', 'page'), null, false)).toBe(true)
    expect(gateOpen(stages(), null, true)).toBe(true)
  })

  it('fills a step of the bar only once the server reported it', () => {
    expect(stepsDone(stages(), false)).toBe(0)
    expect(stepsDone(stages('started', 'robots'), false)).toBe(2)
    // A server that did not stream reports no stages: only the result fills its step.
    expect(stepsDone(stages(), true)).toBe(1)
  })

  it('says what the server last reported', () => {
    expect(stageLabel(stages('started'), null)).toBe('Checking robots.txt')
    expect(stageLabel(stages('started', 'robots'), false)).toBe('robots.txt disallows this page')
    expect(stageLabel(stages('started', 'robots', 'page'), true)).toBe('Page received · checking it')
  })
})

describe('the drawn page', () => {
  it('is the same for the same link, and keeps its main blocks inside the page', () => {
    const one = layoutPage(90, 84, 7)
    expect(layoutPage(90, 84, 7)).toEqual(one)
    expect(one.blocks[0]!.kind).toBe('title')
    for (const block of one.blocks) {
      expect(block.top).toBeGreaterThanOrEqual(0)
      expect(block.bottom).toBeLessThan(one.rows)
      expect(block.right).toBeLessThan(one.cols)
    }
    expect(one.blocks.some(block => block.kind === 'text')).toBe(true)
  })

  it('keeps its main column clear of its sidebar, and has none on a narrow page', () => {
    const wide = layoutPage(90, 84, 7)
    expect(wide.aside).not.toBeNull()
    expect(wide.main.right).toBeLessThan(wide.aside!.left)
    for (const block of wide.blocks) {
      expect(block.left).toBeGreaterThanOrEqual(wide.main.left)
      expect(block.right).toBeLessThanOrEqual(wide.main.right)
    }
    expect(layoutPage(40, 60, 7).aside).toBeNull()
  })

  it('can be ended sooner: the footer moves up, and nothing below it is the page any more', () => {
    const layout = layoutPage(90, 84, 7)
    const before = layout.floor
    closePage(layout, 40)
    expect(layout.floor).toBe(40)
    expect(layout.rows).toBe(42)
    expect(before).toBeGreaterThan(40)
    for (let x = 0; x < layout.cols; x++) {
      expect(layout.kind[40 * layout.cols + x]).toBe(Cell.Chrome)
      expect(layout.kind[39 * layout.cols + x]).toBe(Cell.Empty)
    }
    for (const block of layout.blocks) expect(block.bottom).toBeLessThan(39)
    // Ending it later than it already ends changes nothing.
    closePage(layout, 60)
    expect(layout.floor).toBe(40)
  })
})

describe('a read page set as text', () => {
  /** The rows of `words` as text, from the main column. */
  const lines = (layout: PageLayout, words: PageWords, from: number, to: number): string[] => {
    const out: string[] = []
    for (let row = from; row <= to; row++) {
      let line = ''
      for (let col = layout.main.left; col <= layout.main.right; col++) {
        const point = words.chars[row * layout.cols + col]!
        line += point === WIDE_TAIL ? '' : point === 0 ? ' ' : String.fromCodePoint(point)
      }
      out.push(line.trimEnd())
    }
    return out
  }

  it('reads Markdown as the parts it sets: headings with their marks, items with their markers, paragraphs joined', () => {
    expect(markdownLines('## Heading\n\nA **bold** [link](https://a.b)\nrunning on.\n\n- one\n- `two`\n\n| a | b |\n|---|---|\n\n---\n\n```js\ncode()\n```\n![chart](a.png)')).toEqual([
      { text: '## Heading', kind: 'heading' },
      { text: 'A bold link running on.', kind: 'text' },
      { text: '- one', kind: 'item' },
      { text: '- two', kind: 'item' },
      { text: 'a b', kind: 'text' },
      { text: 'code()', kind: 'code' },
    ])
  })

  it('sets the page’s own Markdown down the main column: a clear row between parts, a list’s items together', () => {
    const layout = layoutPage(90, 84, 3)
    const markdown = '# Tide report\n\nThe [harbour office](https://example.com) records tide height ![chart](a.png) **hourly**.\n\n- high water\n- low water\n\n## Notes\n\nNone.'
    const words = typesetPage(layout, 'Tide report', markdown, { from: 10, to: 40 })
    expect(lines(layout, words, 10, 20)).toEqual(['# Tide report', '', 'The harbour office records tide height hourly.', '', '- high water', '- low water', '', '## Notes', '', 'None.', ''])
    expect(words.lastRow).toBe(19)
    // Headings are marked, and nothing is set outside the rows asked for or the main column.
    const at = (row: number, col: number): number => row * layout.cols + col
    expect(words.heading[at(10, layout.main.left)]).toBe(1)
    expect(words.heading[at(17, layout.main.left + 3)]).toBe(1)
    expect(words.heading[at(12, layout.main.left)]).toBe(0)
    words.chars.forEach((point, i) => {
      if (!point) return
      const row = Math.floor(i / layout.cols)
      const col = i % layout.cols
      expect(row >= 10 && row <= 40 && col >= layout.main.left && col <= layout.main.right).toBe(true)
    })
  })

  it('leads with the page’s title when the Markdown has no heading of its own, without saying it twice', () => {
    const layout = layoutPage(90, 84, 3)
    expect(lines(layout, typesetPage(layout, 'Tide report', 'Tide report\n\nHourly.', { from: 0, to: 9 }), 0, 2)).toEqual(['Tide report', '', 'Hourly.'])
    expect(lines(layout, typesetPage(layout, null, 'Hourly.', { from: 0, to: 9 }), 0, 0)).toEqual(['Hourly.'])
  })

  it('wraps at the column, cuts a word longer than a line, and stops where the rows end', () => {
    const layout = layoutPage(40, 60, 3)
    const width = layout.main.right - layout.main.left + 1
    const long = 'x'.repeat(width + 5)
    const words = typesetPage(layout, null, `one two three four five six seven eight nine ten eleven twelve\n\n${long}\n\nlast part that is never reached`, { from: 2, to: 6 })
    const set = lines(layout, words, 2, 8)
    for (const line of set) expect(line.length).toBeLessThanOrEqual(width)
    expect(set.slice(0, 2).join(' ')).toBe('one two three four five six seven eight nine ten eleven twelve')
    expect(set[2]).toBe('')
    expect(set[3]).toBe('x'.repeat(width))
    expect(set[4]).toBe('xxxxx')
    // Rows 7 and 8 are past the last row asked for: the third part is never set.
    expect(set.slice(5)).toEqual(['', ''])
    expect(words.lastRow).toBe(6)
  })

  it('gives a character of a wide script two cells', () => {
    expect(isWide('页'.codePointAt(0)!)).toBe(true)
    expect(isWide('a'.codePointAt(0)!)).toBe(false)
    const layout = layoutPage(90, 84, 3)
    const words = typesetPage(layout, null, '网页 ok', { from: 0, to: 3 })
    const row = [...words.chars.slice(layout.main.left, layout.main.left + 7)]
    expect(row).toEqual(['网'.codePointAt(0), WIDE_TAIL, '页'.codePointAt(0), WIDE_TAIL, 0, 'o'.codePointAt(0), 'k'.codePointAt(0)])
  })

  it('breaks a line of a wide script between any two characters, so its lines fill the column', () => {
    const layout = layoutPage(90, 84, 3)
    const width = layout.main.right - layout.main.left + 1
    const words = typesetPage(layout, null, `HTTP ${'页'.repeat(80)}`, { from: 0, to: 9 })
    const cells = (row: number): number => [...words.chars.slice(row * layout.cols + layout.main.left, row * layout.cols + layout.main.right + 1)].filter(Boolean).length
    // The first line holds the Latin word, a space and as many wide characters as fit: not the word alone.
    expect(cells(0)).toBeGreaterThanOrEqual(width - 2)
    expect(cells(1)).toBeGreaterThanOrEqual(width - 1)
    // Every character is set, on no more lines than they need.
    expect([...words.chars].filter((point) => point === '页'.codePointAt(0)).length).toBe(80)
    expect(words.lastRow).toBe(Math.ceil((5 + 160) / (width - 1)) - 1)
  })

  it('sets any input without running away: narrow columns, wide characters that do not fit, rows that do not exist', () => {
    const layout = layoutPage(24, 30, 3)
    const texts = ['', '   ', 'a', '页', '😀😀😀', `${'x'.repeat(500)} ${'页'.repeat(500)}`, '---\n\n```\n```\n\n| a |\n|---|', 'a\r\nb\r\n\r\n# c', '\ud83d oops \udc00']
    for (const width of [1, 2, 3, 20]) {
      layout.main = { left: 2, right: 2 + width - 1 }
      for (const text of texts) {
        for (const rows of [{ from: 0, to: 29 }, { from: 5, to: 2 }, { from: 28, to: 500 }, { from: -3, to: 0 }]) {
          const words = typesetPage(layout, text, text, rows)
          expect(words.lastRow).toBeLessThanOrEqual(Math.min(29, rows.to))
          words.chars.forEach((point, i) => {
            if (!point) return
            const col = i % layout.cols
            expect(col >= 2 && col <= 2 + width - 1).toBe(true)
            if (point !== WIDE_TAIL) expect(text.includes(String.fromCodePoint(point))).toBe(true)
          })
        }
      }
    }
  })

  it('reads only the start of a very long Markdown, ended at a line’s end', () => {
    const layout = layoutPage(90, 84, 3)
    const paragraph = `${'word '.repeat(30).trim()}\n\n`
    const long = `# Long\n\n${paragraph.repeat(8000)}`
    expect(long.length).toBeGreaterThan(1_000_000)
    const words = typesetPage(layout, null, long, { from: 0, to: 80 })
    // One line of a hundred thousand brackets, the worst case for the inline pass, is cut down the same way.
    typesetPage(layout, null, '['.repeat(100_000), { from: 0, to: 80 })
    typesetPage(layout, null, '😀'.repeat(60_000), { from: 0, to: 80 })
    expect(words.lastRow).toBe(80)
    expect(lines(layout, words, 0, 2)).toEqual(['# Long', '', 'word '.repeat(11).trim()])
  })

  it('places nothing for a page with no words', () => {
    const layout = layoutPage(60, 60, 3)
    expect(typesetPage(layout, null, null, { from: 0, to: 50 }).chars.some(Boolean)).toBe(false)
    expect(typesetPage(layout, '  ', '', { from: 0, to: 50 }).lastRow).toBe(-1)
  })
})

describe('reading a preview', () => {
  const stream = (chunks: string[]) => new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  }), { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } })

  it('tells each stage as its line arrives, even split across chunks, and returns the result', async () => {
    const told: unknown[] = []
    const body = await readPreview(stream([
      '{"type":"stage","stage":"started","ms":1}\n{"type":"stage","stage":"rob',
      'ots","allowed":true,"ms":40}\n{"type":"stage","stage":"page","ms":90}\n',
      '{"type":"result","http":200,"body":{"status":"success"}}\n',
    ]), stage => told.push(stage))
    expect(told).toEqual([{ stage: 'started' }, { stage: 'robots', allowed: true }, { stage: 'page' }])
    expect(body).toEqual({ status: 'success' })
  })

  it('takes a plain JSON answer as the result, and refuses a stream that ends without one', async () => {
    const plain = new Response('{"status":"quota_exceeded"}', { headers: { 'content-type': 'application/json; charset=utf-8' } })
    expect(await readPreview(plain, () => {})).toEqual({ status: 'quota_exceeded' })
    await expect(readPreview(stream(['{"type":"stage","stage":"started","ms":1}\n']), () => {})).rejects.toThrow('incomplete result')
  })
})
