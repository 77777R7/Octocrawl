import { expect, it } from 'vitest'
import { parse } from '../src/dom.js'
import { includeCollectionLeads } from '../src/collection.js'

it('keeps a large set of leading cards without comparing every pair or rescanning shared ancestors', () => {
  const card = (i: number) => `<div class="card"><div class="content"><a href="/story/${i}">Technology industry report number ${i}</a><p><a href="/story/${i}">The description belongs to this story.</a></p></div></div>`
  const run = (n: number): number => {
    const doc = parse(`<main><div>${Array.from({ length: n }, (_, i) => card(i)).join('')}</div><ul>${Array.from({ length: 30 }, (_, i) => `<li>${card(n + i)}</li>`).join('')}</ul></main>`)
    const start = performance.now()
    const selected = includeCollectionLeads(doc.document.querySelector('ul')!)
    const elapsed = performance.now() - start
    expect(selected.querySelectorAll('.card')).toHaveLength(n + 30)
    expect(selected.textContent).toContain(`report number ${n + 29}`)
    doc.close()
    return elapsed
  }
  run(250)
  let small = Infinity
  let large = Infinity
  for (let i = 0; i < 3; i++) {
    small = Math.min(small, run(250))
    large = Math.min(large, run(1_000))
  }
  // Four times the cards allows overhead above linear growth, but not the
  // former sixteenfold work from pairwise comparisons and ancestor rescans.
  expect(large / small).toBeLessThan(10)
})
