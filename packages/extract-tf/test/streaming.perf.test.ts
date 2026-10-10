import { describe, expect, it } from 'vitest'
import { parse } from '../src/dom.js'
import { resolveReactStreaming } from '../src/streaming.js'

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
    for (let i = 0; i < 5; i++) {
      smallBest = Math.min(smallBest, run(1_250))
      largeBest = Math.min(largeBest, run(5_000))
    }
    // Four times the calls take about four times the time; a lookup that scanned the page for each call takes sixteen times as long.
    expect(largeBest / smallBest).toBeLessThan(8)
  })

  it('takes time linear in the page when each part is nested in the next and completed innermost first', () => {
    // Every call moves again what the earlier ones moved into its part: without a bound, n parts take n² moves.
    const chain = (kind: 'S' | 'C', n: number) => {
      const next = (i: number) => (kind === 'S' ? `<template id="P:${i}"></template>` : `<!--$?--><template id="B:${i}"></template><b>Loading</b><!--/$-->`)
      const segments = Array.from({ length: n }, (_, i) => `<div hidden id="S:${i}"><span>${i}a</span><span>${i}b</span>${i + 1 < n ? next(i + 1) : ''}</div>`).join('')
      const calls = Array.from({ length: n }, (_, j) => (kind === 'S' ? `$RS("S:${n - 1 - j}","P:${n - 1 - j}");` : `$RC("B:${n - 1 - j}","S:${n - 1 - j}");`)).join('')
      return `<!doctype html><html><body><main>${next(0)}</main>${segments}<script>${calls}</script></body></html>`
    }
    for (const kind of ['S', 'C'] as const) {
      const run = (n: number): number => {
        const doc = parse(chain(kind, n))
        const started = performance.now()
        resolveReactStreaming(doc.document)
        const ms = performance.now() - started
        doc.close()
        return ms
      }
      for (let i = 0; i < 3; i++) run(1_000)
      let smallBest = Infinity
      let largeBest = Infinity
      for (let i = 0; i < 5; i++) {
        smallBest = Math.min(smallBest, run(2_000))
        largeBest = Math.min(largeBest, run(8_000))
      }
      // Moving every part's nodes again takes sixteen times as long for four times the parts.
      expect(largeBest / smallBest, kind).toBeLessThan(8)
    }
  })

  it('takes time linear in the page when each part is nested deep in the one before, completed outermost first', () => {
    // Each call puts the next part ten elements deeper than the last: without a bound, finding where an element is walks n×10 parents.
    const deep = (kind: 'S' | 'C', n: number) => {
      const target = (i: number) => (kind === 'S' ? `<template id="P:${i}"></template>` : `<!--$?--><template id="B:${i}"></template><b>Loading</b><!--/$-->`)
      const segments = Array.from({ length: n }, (_, i) => `<div hidden id="S:${i}">${'<div>'.repeat(10)}<span>${i}</span>${i + 1 < n ? target(i + 1) : ''}${'</div>'.repeat(10)}</div>`).join('')
      const calls = Array.from({ length: n }, (_, i) => (kind === 'S' ? `$RS("S:${i}","P:${i}");` : `$RC("B:${i}","S:${i}");`)).join('')
      return `<!doctype html><html><body><main>${target(0)}</main>${segments}<script>${calls}</script></body></html>`
    }
    for (const kind of ['S', 'C'] as const) {
      const run = (n: number): number => {
        const doc = parse(deep(kind, n))
        const started = performance.now()
        resolveReactStreaming(doc.document)
        const ms = performance.now() - started
        doc.close()
        return ms
      }
      for (let i = 0; i < 3; i++) run(1_000)
      let smallBest = Infinity
      let largeBest = Infinity
      for (let i = 0; i < 5; i++) {
        smallBest = Math.min(smallBest, run(1_000))
        largeBest = Math.min(largeBest, run(8_000))
      }
      // Eight times the parts take about eight times the time (5 to 14 measured on a loaded machine); walking up every
      // part's parents took 50 to 72 times as long. Four times the parts measured 4 to 8.2 against 13 to 18, too close for
      // a bound between them to hold on CI.
      expect(largeBest / smallBest, kind).toBeLessThan(24)
    }
  })

  it("takes time linear in a part's attributes and children", () => {
    // linkedom reads an element's first child past each of its attributes: children moved one first child at a time took attributes × children.
    const wide = (n: number) => `<!doctype html><html><body><main><template id="P:0"></template></main><div hidden id="S:0"${Array.from({ length: n / 10 }, (_, i) => ` a${i}=""`).join('')}>${'<i></i>'.repeat(n)}</div><script>$RS("S:0","P:0")</script></body></html>`
    const run = (n: number): number => {
      const doc = parse(wide(n))
      const started = performance.now()
      expect(resolveReactStreaming(doc.document)).toBe(1)
      const ms = performance.now() - started
      doc.close()
      return ms
    }
    for (let i = 0; i < 3; i++) run(5_000)
    let smallBest = Infinity
    let largeBest = Infinity
    for (let i = 0; i < 5; i++) {
      smallBest = Math.min(smallBest, run(20_000))
      largeBest = Math.min(largeBest, run(80_000))
    }
    // Four times the attributes and children took sixteen times as long.
    expect(largeBest / smallBest).toBeLessThan(8)
  })
})
