import { describe, expect, it } from 'vitest'
import { parse } from '../src/dom.js'
import { resolveReactStreaming } from '../src/streaming.js'

/**
 * Apart from streaming.perf.test.ts so that it runs in a process of its own: run before the deep test there, on ubuntu
 * runners it left that test 3 to 5 times slower in 14 of 40 runs, against 0 of 40 with the sizes before #375 and 2 of
 * 40, about 2.5 times slower, without it (run 38131601210).
 */
describe('resolveReactStreaming (ROADMAP PA item 4)', () => {
  it('takes time linear in the calls a page makes, real or naming nothing in it', () => {
    // A page of n streamed parts each completed in place, and n calls that name no element, beside n other ids.
    const page = (n: number) => {
      const parts = Array.from({ length: n }, (_, i) => `<p id="x${i}">filler ${i}</p><template id="P:${i.toString(16)}"></template>`).join('')
      const segments = Array.from({ length: n }, (_, i) => `<div hidden id="S:${i.toString(16)}"><span>part ${i}</span></div>`).join('')
      const calls = Array.from({ length: n }, (_, i) => `$RS("S:${i.toString(16)}","P:${i.toString(16)}");$RC("B:none${i}","S:none${i}");`).join('')
      return `<!doctype html><html><body><main>${parts}</main>${segments}<script>${calls}</script></body></html>`
    }
    const run = (n: number): number => {
      const doc = parse(page(n))
      const started = performance.now()
      expect(resolveReactStreaming(doc.document)).toBe(n)
      const ms = performance.now() - started
      doc.close()
      return ms
    }
    for (let i = 0; i < 3; i++) run(1_000)
    // The two sizes take turns, so a busy moment of the machine slows both.
    let smallBest = Infinity
    let largeBest = Infinity
    for (let i = 0; i < 7; i++) {
      smallBest = Math.min(smallBest, run(300))
      largeBest = Math.min(largeBest, run(4_800))
    }
    // Sixteen times the calls take about sixteen times the time (15 to 24 measured, up to 30 on an overloaded machine); a
    // lookup that scanned the page for each call took 200 to 280 times as long, about 30 s in all, hence the longer timeout
    // so that the bound, not the timeout, reports it. Four times the calls measured 4.2 against 14 and reached 8.2 on a CI
    // runner, too close for a bound between them to hold. Sixteen times 300 parts stays within the 10 000 calls a page is
    // read for (each part makes two).
    expect(largeBest / smallBest).toBeLessThan(64)
  }, 60_000)
})
