import { describe, expect, it } from 'vitest'
import { parse } from '../src/dom.js'
import { invalidSelector, MAX_SELECTOR_PARTS, namedBy, selectorParts, SUPPORTED_SELECTORS } from '../src/index.js'

// Selectors that come from a request (includeTags, excludeTags): what may be used, and how it is matched.
const PAGE = `<!doctype html><html class="js"><head><title>Kiln archive</title></head><body class="home">
<header><h1>Kiln archive</h1><nav><a href="/a">Home</a> <a href="https://kiln.test/b">Office</a></nav></header>
<main><article class="report lead"><p class="lead">Readings</p>
<table id="readings"><tr><td><p>Meridian</p><table><tr><td class="x-y">41</td></tr></table></td></tr></table>
<ul><li><a href="https://kiln.test/c" title="a + b ~ c">Ledger</a></li><li></li></ul></article></main>
<footer><p>Copyright 2026</p></footer></body></html>`

describe('request selectors', () => {
  it('accepts the selectors it can match in time proportional to the page', () => {
    for (const selector of [
      'table', 'table.wikitable', '#p-lang-btn', '.mw-editsection', 'div[role="navigation"]', 'a[href^="https://"]', 'a[title="a + b ~ c"]', 'INPUT[type=text i]',
      'h1, h2', 'ul li a', 'main > article > p', 'html.js body.home main', '*', 'p:not(.note)', ':is(h1, h2):not(.x)', ':where(article, main) table', ':root', 'li:empty',
      '.a\\+b', 'ix\\:header', 'p.élan',
    ]) expect(invalidSelector(selector), selector).toBeNull()
  })

  it('refuses a selector that does not parse, and names what it does not match in one that does', () => {
    for (const selector of ['div[[', 'a,,b', ':nope', 'p::before']) expect(invalidSelector(selector), selector).toMatchObject({ kind: 'syntax' })
    const unsupported: Array<[string, string]> = [
      ['li:nth-child(2)', ':nth-child'], ['p:first-child', ':first-child'], ['tr:last-of-type', ':last-of-type'], ['div:has(> img)', ':has'], ['p:contains(tide)', ':contains'],
      ['a:hover', ':hover'], [':is(li:only-child)', ':only-child'], ['h2 + p', 'the sibling combinator +'], ['h2 ~ p ~ p', 'the sibling combinator ~'],
      ['p:not(nav a)', 'a combinator inside parentheses'], [':is(ul > li)', 'a combinator inside parentheses'], ['> p', 'a combinator at its start'], ['div >', 'a combinator at its end'],
      ['a < b', 'the parent combinator <'], ['*p', 'a tag name after another part of its compound selector'],
      // A no-break space is no combinator to the DOM layer: it reads `div\u00a0p` as two tag names in one compound selector.
      ['div\u00a0p', 'a tag name after another part of its compound selector'],
    ]
    for (const [selector, reason] of unsupported) expect(invalidSelector(selector), selector).toEqual({ kind: 'unsupported', reason })
    expect(SUPPORTED_SELECTORS).toContain('descendant and child combinators')
  })

  it('names the elements the DOM layer names for the same selector', () => {
    const { document } = parse(PAGE)
    for (const selector of [
      'p', 'table td', 'table table td', 'main > article > p', 'article > p, td p', 'html.js body.home main p', 'body > main table table .x-y', ':root > body', 'html', '* > * > * > * > * > *',
      'li a[href^="https://"]', '  main   >article ,  nav  a  ', 'article p:not(.lead)', 'article.report :is(p, td)', 'ul > li:empty', 'a[title="a + b ~ c"]', 'x p', 'p x', 'header nav > a, footer > p',
    ]) {
      const named = namedBy(document, [selector])
      const native = Array.from(document.querySelectorAll(selector))
      expect(named.size, selector).toBe(native.length)
      expect(native.every((el) => named.has(el)), selector).toBe(true)
    }
    // Several selectors name the union, and one that cannot be used names nothing.
    expect(namedBy(document, ['h1', 'nav a', 'p:first-child', 'div[[']).size).toBe(3)
  })

  it('reads an escape as the DOM layer does, an escape that ends in a space included', () => {
    // Ids and classes that start with a digit, or hold a colon or a slash, as CSS.escape writes them.
    const { document } = parse(`<!doctype html><html><body><div id="123" class="2xl:grid w-1/2"><p class="7up x">Readings</p><span id="7up"><span>41</span></span></div>
<div class="2xl"><p>Ledger</p></div><p class="a1 23">Office</p><div class=">a"><p>Tide</p></div></body></html>`)
    for (const [selector, count] of [
      ['#\\31 23', 1], ['.\\32 xl\\:grid', 1], ['.\\32 xl', 1], ['.\\32 xl p', 1], ['#\\37 up span', 1], ['div#\\31 23 > p.\\37 up.x', 1], ['.w-1\\/2 > #\\37 up', 1],
      ['.\\000032xl', 1], ['.\\32xl', 1], ['.a\\31 23', 0], ['.a\\31  .\\32 3', 0], ['.\\>a p', 1], ['.>a', 1], ['[id="123"] :not(.\\37 up)', 2],
    ] as const) {
      expect(invalidSelector(selector), selector).toBeNull()
      const named = namedBy(document, [selector])
      const native = Array.from(document.querySelectorAll(selector))
      expect(native, selector).toHaveLength(count)
      expect([...named], selector).toEqual(native)
    }
  })

  it('counts the parts of a selector, and matches a list up to its limit, each compound selector and chain once', () => {
    expect(['table', 'table.wikitable', 'a[href$=".pdf"]', 'main > article p:not(.note)', ':is(h1, h2):not(.x)', 'h1, h2', 'li:nth-child(2)', 'div[['].map(selectorParts)).toEqual([1, 2, 2, 5, 5, 2, 0, 0])
    const { document } = parse(PAGE)
    // From the selector on with which a list passes the limit, nothing is named.
    const full = Array.from({ length: MAX_SELECTOR_PARTS - 1 }, (_, i) => `.none-${i}`)
    expect(namedBy(document, [...full, 'h1', 'footer p']).size).toBe(1)
    expect(namedBy(document, [...full, 'nav a', 'h1']).size).toBe(0)
    // What a list repeats is matched once: a pass for the compound selectors on their own, one for every element's place, one for each compound selector of a chain.
    let passes = 0
    const querySelectorAll = document.querySelectorAll.bind(document)
    document.querySelectorAll = ((selector: string) => { passes++; return querySelectorAll(selector) }) as typeof document.querySelectorAll
    const repeated = Array.from({ length: 10 }, () => 'article p, td p, article p, h1, nav, h1')
    expect(repeated.reduce((sum, selector) => sum + selectorParts(selector), 0)).toBeLessThanOrEqual(MAX_SELECTOR_PARTS)
    expect(namedBy(document, repeated).size).toBe(4)
    expect(passes).toBe(5)
  })

  it('resolves a long chain of combinators in one pass, however many ways the ancestors fit it', () => {
    // 300 paragraphs, each 30 divs deep. Matching `x div ... div p` by walking back from
    // each paragraph tries every choice of 12 of its 30 ancestors before giving up.
    const html = `<!doctype html><html><body>${`${'<div>'.repeat(30)}<p>text</p>${'</div>'.repeat(30)}`.repeat(300)}</body></html>`
    const { document } = parse(html)
    expect(namedBy(document, [`x ${'div '.repeat(12)}p`]).size).toBe(0)
    expect(namedBy(document, [`body ${'div '.repeat(12)}p`, `body > ${'div > '.repeat(30)}p`]).size).toBe(300)
    expect(namedBy(document, [`body > ${'div > '.repeat(29)}p`]).size).toBe(0)
  })
})
