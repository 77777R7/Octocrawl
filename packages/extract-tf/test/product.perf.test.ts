import { describe, expect, it } from 'vitest'
import { looksLikePrice } from '../src/index.js'

describe('price shape', () => {
  it('terminates promptly on adversarial input', () => {
    // The matcher runs over attacker-supplied page text; an unbounded
    // quantifier here is the same class of bug as a ReDoS in the robots
    // matcher. Bounded quantifiers must keep this linear.
    const hostile = '$' + '1'.repeat(50_000) + ',' + '9'.repeat(50_000) + 'x'
    const start = process.hrtime.bigint()
    looksLikePrice(hostile)
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    expect(ms).toBeLessThan(200)
  })
})

describe('visible-price fallback', () => {
  it('reads a page of thousands of shown prices in time bounded by parsing it', async () => {
    const { collectProductFacts } = await import('../src/index.js')
    const { parse } = await import('../src/dom.js')
    // Measured against parsing the same HTML, each the faster of two runs. On 2026-10-21, 12,000
    // prices took 2 parses; main before D6 1.5; D6's first draft, which compared every price with
    // every other, 130.
    const cards = Array.from({ length: 12_000 }, (_, n) => `<div><div><div><span class="price">€${n}.00</span></div></div></div>`).join('')
    const html = `<!doctype html><html><body><main><h1>Lamp</h1>${cards}</main></body></html>`
    const time = (run: () => void): number => {
      let best = Infinity
      for (let i = 0; i < 2; i++) {
        const started = Date.now()
        run()
        best = Math.min(best, Date.now() - started)
      }
      return best
    }
    let fresh = 0
    const parsed = Math.max(time(() => parse(`${html}<!--${fresh++}-->`).close()), 20)
    const read = time(() => {
      const doc = parse(`${html}<!--${fresh++}-->`)
      collectProductFacts(doc.document)
      doc.close()
    })
    expect(read / parsed).toBeLessThan(12)
  })
})
