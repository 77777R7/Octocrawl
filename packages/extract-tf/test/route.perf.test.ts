import { describe, expect, it } from 'vitest'
import { selectTable } from '../src/index.js'
import { parse } from '../src/dom.js'

const wrap = (bodyHtml: string, headExtra = '') =>
  `<!doctype html><html><head><title>Page</title>${headExtra}</head><body>${bodyHtml}</body></html>`

describe('strategies', () => {
  it('selectTable takes time linear in the page, however deep its tables sit or are nested', () => {
    const grid = '<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>'
    // A chain of data tables each nested in the last cell of the one around it, then a quarter as many side by side, as deep in the page.
    const page = (n: number) =>
      `${'<div>'.repeat(n)}${'<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>'.repeat(n)}x${'</td></tr></table>'.repeat(n)}${grid.repeat(n / 4)}${'</div>'.repeat(n)}`
    const small = parse(wrap(page(1_000)))
    const large = parse(wrap(page(2_000)))
    const run = (doc: typeof small, n: number): number => {
      const started = performance.now()
      for (let i = 0; i < 3; i++) expect(selectTable(doc.document)!.childElementCount).toBe(n / 4 + 1)
      return performance.now() - started
    }
    run(small, 1_000)
    // The two sizes take turns, so a busy moment of the machine slows both.
    let smallBest = Infinity
    let largeBest = Infinity
    for (let i = 0; i < 3; i++) {
      smallBest = Math.min(smallBest, run(small, 1_000))
      largeBest = Math.min(largeBest, run(large, 2_000))
    }
    small.close()
    large.close()
    // Twice the depth takes about twice the time; it took five to ten times as long when each table was measured, and compared with every other, on its own.
    expect(largeBest / smallBest).toBeLessThan(3)
  })
})
