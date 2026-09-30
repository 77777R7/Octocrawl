import { describe, expect, it } from 'vitest'
import { parse } from '../src/dom.js'
import { invalidSelector, namedBy, SUPPORTED_SELECTORS } from '../src/index.js'

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
      ['a < b', 'the character <'],
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
