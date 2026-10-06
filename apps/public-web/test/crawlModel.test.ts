import { describe, expect, it } from 'vitest'
import { Cell, crawlCap, fillWords, layoutPage, mayRead, plainText, progressBar, stageLabel, stepsDone, type CrawlStage } from '../src/crawlModel'
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

  it('dissolves nothing as read before the server has read the page', () => {
    expect(mayRead(stages('started', 'robots'), false)).toBe(false)
    expect(mayRead(stages('started', 'robots', 'page'), false)).toBe(true)
    // A server that reports no stages: the result says whether the page was read.
    expect(mayRead(stages(), true)).toBe(true)
  })

  it('fills a step of the bar only once the server reported it', () => {
    expect(stepsDone(stages(), false)).toBe(0)
    expect(stepsDone(stages('started', 'robots'), false)).toBe(2)
    // A server that did not stream reports no stages: only the result fills its step.
    expect(stepsDone(stages(), true)).toBe(1)
    expect(progressBar(2, 16)).toBe('########········')
    expect(progressBar(4, 16)).toBe('################')
  })

  it('says what the server last reported', () => {
    expect(stageLabel(stages('started'), null)).toBe('Checking robots.txt')
    expect(stageLabel(stages('started', 'robots'), false)).toBe('robots.txt disallows this page')
    expect(stageLabel(stages('started', 'robots', 'page'), true)).toBe('Page read · finishing')
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
