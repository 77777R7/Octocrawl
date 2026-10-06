import { describe, expect, it } from 'vitest'
import { captureLayout, Cell, crawlCap, fillWords, glyphForLuminance, layoutPage, mayRead, plainText, stageLabel, stepsDone, type CrawlStage, type PageCapture } from '../src/crawlModel'
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

  it('places only the read page’s own words, the title in the title and the text in the paragraphs', () => {
    const layout = layoutPage(60, 60, 3)
    const title = 'Tide report'
    const markdown = '# Tide report\n\nThe [harbour office](https://example.com) records tide height ![chart](a.png) **hourly**.'
    const words = fillWords(layout, title, markdown)
    const placed = (kind: number) => [...words].map((char, i) => layout.kind[i] === kind && char ? String.fromCharCode(char) : '').join('').trim()
    expect(placed(Cell.Title)).toBe('Tide report')
    expect(placed(Cell.Text)).toBe('The harbour office records tide height hourly.')
    expect([...words].every((char, i) => char === 0 || layout.kind[i] === Cell.Title || layout.kind[i] === Cell.Text)).toBe(true)
  })

  it('places nothing for a page with no words', () => {
    const layout = layoutPage(60, 60, 3)
    expect(fillWords(layout, null, null).some(Boolean)).toBe(false)
    expect(fillWords(layout, '  ', '').some(Boolean)).toBe(false)
  })

  it('reads Markdown as plain words', () => {
    expect(plainText('## Heading\n\n- one [link](https://a.b)\n- `two`\n\n| a | b |\n|---|---|\n\n```js\ncode()\n```')).toBe('Heading one link two a b')
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

describe('the grid over the server\'s picture', () => {
  const page = { width: 1280, height: 2400, elements: [
    { tag: 'h1', x: 100, y: 200, width: 600, height: 60, text: 'Tide report' },
    { tag: 'p', x: 100, y: 300, width: 800, height: 120, text: 'The harbour office…' },
    { tag: 'a', x: 100, y: 300, width: 120, height: 20, text: 'harbour' },
    { tag: 'img', x: 100, y: 500, width: 400, height: 300, text: 'Harbour' },
    { tag: 'p', x: 100, y: 5000, width: 800, height: 40, text: 'below the picture' },
  ] }
  // The window is 640 px wide for a 1280 px picture: half scale, 8 px columns, 14 px rows.
  const layout = captureLayout(page, 80, 8, 14, 0.5)

  it('is as tall as the picture plus the floor, and marks each element\'s cells by its kind', () => {
    expect(layout.rows).toBe(Math.ceil(1200 / 14) + 2)
    expect(layout.floor).toBe(layout.rows - 2)
    const at = (px: number, py: number) => layout.kind[Math.floor(py * 0.5 / 14) * 80 + Math.floor(px * 0.5 / 8)]
    expect(at(150, 220)).toBe(Cell.Title)
    expect(at(500, 360)).toBe(Cell.Text)
    expect(at(200, 600)).toBe(Cell.Image)
    expect(at(1000, 100)).toBe(Cell.Empty)
  })

  it('makes a block of each element inside the picture, top to bottom, and none of one below it', () => {
    expect(layout.blocks.map(block => block.kind)).toEqual(['title', 'text', 'text', 'image'])
    for (const block of layout.blocks) expect(block.bottom).toBeLessThan(layout.floor)
  })

  it('dissolves dark pixels into dense glyphs and light ones into faint ones', () => {
    expect(glyphForLuminance(255)).toBe('·')
    expect(glyphForLuminance(0)).toBe('#')
    expect(['x', 'X']).toContain(glyphForLuminance(90))
  })

  it('reads a capture line from the stream and leaves out an element that is not one', async () => {
    const { readPreview } = await import('../src/previewStream')
    const captures: PageCapture[] = []
    const line = JSON.stringify({ type: 'capture', width: 1280, height: 800, jpeg: 'AAAA', blocked: 1, ms: 900, elements: [{ tag: 'h1', x: 1, y: 2, width: 3, height: 4, text: 'Tide' }, { tag: 'p' }] })
    const response = new Response(`${line}\n{"type":"result","http":200,"body":{"status":"success"}}\n`, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } })
    expect(await readPreview(response, () => {}, capture => captures.push(capture))).toEqual({ status: 'success' })
    expect(captures).toEqual([{ width: 1280, height: 800, jpeg: 'AAAA', elements: [{ tag: 'h1', x: 1, y: 2, width: 3, height: 4, text: 'Tide' }] }])
  })
})
