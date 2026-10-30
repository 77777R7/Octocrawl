import { describe, expect, it } from 'vitest'
import { cleanTree } from '../src/index.js'
import { parse } from '../src/dom.js'

describe('cleanTree', () => {
  it('finds the <aside> that holds the whole page in time linear in the page, however many asides it has or how deep they nest', () => {
    // Comments, scripts and empty asides side by side, then a chain of asides each inside the last, around the page's <main>.
    const page = (n: number) =>
      `<!doctype html><html><body>${'<!---->'.repeat(n)}${'<script></script>'.repeat(n)}${'<aside></aside>'.repeat(n)}${'<aside>'.repeat(n)}<main><p>Kiln notes.</p></main>${'</aside>'.repeat(n)}</body></html>`
    const run = (n: number): number => {
      const doc = parse(page(n))
      const started = performance.now()
      cleanTree(doc.document)
      const elapsed = performance.now() - started
      expect(doc.document.body.textContent).toBe('Kiln notes.')
      expect(doc.document.querySelector('aside')).toBeNull()
      doc.close()
      return elapsed
    }
    run(2_500)
    // The two sizes take turns, so a busy moment of the machine slows both.
    let smallBest = Infinity
    let largeBest = Infinity
    for (let i = 0; i < 5; i++) {
      smallBest = Math.min(smallBest, run(2_500))
      largeBest = Math.min(largeBest, run(10_000))
    }
    // Four times the page takes about four times as long (3.9 to 4.3 measured); a check that looked, for each <aside>, at every element beside it and above it would take about sixteen.
    expect(largeBest / smallBest).toBeLessThan(8)
  })
})
