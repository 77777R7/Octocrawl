import { describe, expect, it } from 'vitest'
import { detectLists } from '../src/index.js'
import { parse } from '../src/dom.js'

/**
 * Detection on a hostile page costs a bounded multiple of reading the page:
 * measured against parsing the same HTML on the same machine, not against a
 * wall clock that a loaded CI runner stretches, each the faster of two runs
 * so a pause elsewhere in the run does not count. Measured on these pages,
 * the detector costs 1 to 4 parses alone and up to 10 while the whole suite
 * runs; before each bound it cost 13 (text-free subtrees) to over 100 (a
 * list deep in a page).
 */
const MAX_PARSES = 12
function expectBounded(html: string, maxParses = MAX_PARSES): ReturnType<typeof detectLists> {
  // Warm: the first run of the detector's code is not what is measured.
  detectLists('<ul class="w"><li>one item</li><li>two items</li><li>three items</li></ul>')
  const time = (run: () => void): number => {
    let best = Infinity
    for (let i = 0; i < 2; i++) {
      const started = Date.now()
      run()
      best = Math.min(best, Date.now() - started)
    }
    return best
  }
  // A parse of a string not parsed before: dom.ts keeps the last pages' trees, so parsing the same string again only copies one.
  let fresh = 0
  const parsed = Math.max(time(() => parse(`${html}<!--${fresh++}-->`).close()), 20)
  let found: ReturnType<typeof detectLists> = []
  const detected = time(() => { found = detectLists(html) })
  expect(detected / parsed).toBeLessThan(maxParses)
  return found
}

const product = (n: number) => `<div class="product"><a href="/p/${n}"><img src="/img/${n}.png" alt=""></a><h3 class="name"><a href="/p/${n}">Product ${n}</a></h3><p class="price">£${n}.99</p><button class="buy">Add to cart</button></div>`

describe('detectLists, on pages that would mislead it', () => {
  it('a parent with a class attribute of thousands is read in bounded time', () => {
    const k = 10_000
    const html = `<main><div class="${Array.from({ length: k }, (_, i) => `c${i}`).join(' ')}">${'<i>ab</i>'.repeat(k)}</div></main>`
    // 11.8 s before classes were read once per element, and at most eight of them.
    expectBounded(html)
  }, 30_000)

  it('a page of many groups of one shape is named in bounded time', () => {
    const group = (k: number) => `<div class="p k${k}">${'<div class="a">xx</div>'.repeat(1000)}</div>`
    const html = `<div class="w"><div class="h"><div class="g">${Array.from({ length: 64 }, (_, k) => group(k)).join('')}</div></div></div>`
    // 15.4 s before the work was bounded.
    expectBounded(html)
  }, 30_000)

  it('a parent tag name of millions of characters is read in bounded time', () => {
    const tag = `x-${'a'.repeat(1_000_000)}`
    // 14 s when every read of the tag copied it.
    expectBounded(`<body><${tag}>${'<i>x</i>'.repeat(80_000)}</${tag}></body>`)
  }, 60_000)

  it('a parent class name of millions of characters is read in bounded time', () => {
    const html = `<body><div class="${'a'.repeat(2_000_000)}">${'<i>x</i>'.repeat(80_000)}</div></body>`
    // 12 to 17 s when every child's group key held its parent's whole class.
    expectBounded(html)
  }, 60_000)

  it('a text node of megabytes is scored in bounded time', () => {
    let html = `<i>${'a '.repeat(4_000_000)}</i>`
    for (let k = 59; k >= 0; k--) html = `<div class="p${k}"><div class="g${k}">xx ${html}</div><div class="g${k}">yy</div><div class="g${k}">zz</div></div>`
    // 11.9 s when every group read the whole text.
    expectBounded(`<body>${html}</body>`)
  }, 60_000)

  it('a list deep in a page is named in bounded time', () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => `<li class="it">item number ${i} text</li>`).join('')
    const html = `<body>${'<div class="w">'.repeat(4000)}<div class="a b"><ul class="l">${items(10_000)}</ul></div><div class="a c"><ul class="l">${items(10_000)}</ul></div>${'</div>'.repeat(4000)}</body>`
    // 17 s, 119 parses, when every climb walked every item's ancestors; 3 to 12 parses since (a deep page parses fast).
    expectBounded(html, 40)
  }, 60_000)

  it('items with large text-free subtrees are scored in bounded time', () => {
    const tree = (depth: number): string => depth === 0 ? '<b></b>' : `<a>${tree(depth - 1)}${tree(depth - 1)}</a>`
    let html = tree(18)
    for (let k = 59; k >= 0; k--) html = `<div class="p${k}"><div class="g${k}">xx ${html}</div><div class="g${k}">yy</div><div class="g${k}">zz</div></div>`
    // 3.7 MB: 9.6 s when every group read its items' whole text, 2 s with the text read bounded.
    expectBounded(`<body>${html}</body>`, 8)
  }, 60_000)

  it('items with thousands of distinct parts are read in bounded time', () => {
    const item = (i: number) => `<div class="it">${Array.from({ length: 8000 }, (_, k) => `<span class="c${k}">v${i}_${k}</span>`).join('')}</div>`
    const html = `<main><div class="list">${[1, 2, 3, 4, 5].map(item).join('')}</div></main>`
    // 22 s before the bound on paths per item.
    const best = expectBounded(html)[0]
    expect(best!.fields.length).toBeLessThanOrEqual(12)
  }, 30_000)
})
