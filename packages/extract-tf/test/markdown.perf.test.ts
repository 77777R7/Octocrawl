import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from '../src/index.js'

describe('htmlToMarkdown', () => {
  it('bounds what a page of reopened formatting elements costs', () => {
    // 56 KB: 3,000 differently attributed <b> closed by a </div>, then 3,000 paragraphs. The standard reopens
    // every <b> in each paragraph (9 million elements, out of memory); past its budget the page is parsed by linkedom.
    let html = '<!doctype html><html><body><div>'
    for (let i = 0; i < 3000; i++) html += `<b id=${i}>`
    html += `</div>${'<p>x</p>'.repeat(3000)}`
    const started = Date.now()
    expect(htmlToMarkdown(html).split('\n\n')).toHaveLength(3000)
    expect(Date.now() - started).toBeLessThan(5_000)
    // One <b> of 3,000 attributes reopened in 10,000 paragraphs (98 KB): each copy would carry all of them.
    const many = `<!doctype html><html><body><div><b${Array.from({ length: 3000 }, (_, i) => ` a${i}`).join('')}></div>${'<p>x</p>'.repeat(10_000)}`
    const manyStarted = Date.now()
    expect(htmlToMarkdown(many).split('\n\n')).toHaveLength(10_000)
    expect(Date.now() - manyStarted).toBeLessThan(5_000)
    // parse5 and linkedom check each attribute of a tag against those before it: a tag of 100,000 took half a minute.
    const wide = `<!doctype html><html><body><p${Array.from({ length: 100_000 }, (_, i) => ` a${i}`).join('')}>x</p><p>y</p>`
    const wideStarted = Date.now()
    expect(htmlToMarkdown(wide)).toBe('x\n\ny')
    expect(Date.now() - wideStarted).toBeLessThan(5_000)
    // Each later <body> start tag adds its attributes to the body: 200 tags of 255 would make 51,000 on one element.
    const bodies = `<!doctype html><html><body><p>text</p>${Array.from({ length: 200 }, (_, t) => `<body${Array.from({ length: 255 }, (_, i) => ` a${t}_${i}`).join('')}>`).join('')}<p>end</p>`
    const bodiesStarted = Date.now()
    expect(htmlToMarkdown(bodies)).toBe('text\n\nend')
    expect(Date.now() - bodiesStarted).toBeLessThan(5_000)
    // parse5 moved a node's children one by one, each found by a linear search: 80,000 lines under a misnested <b>.
    const moved = `<!doctype html><html><body><b><div>${'x<br>'.repeat(80_000)}</b></div>`
    const movedStarted = Date.now()
    expect(htmlToMarkdown(moved).length).toBeGreaterThan(80_000)
    expect(Date.now() - movedStarted).toBeLessThan(5_000)
  })

  it('counts rowspans stacked over the same columns without visiting every one in every row', () => {
    // ~2 MB: 300 rowspans a thousand columns wide stacked over 100 empty rows, 90 times.
    let stacked = '<table>'
    for (let i = 0; i < 300; i++) stacked += `<tr>${i < 299 ? `<td colspan="${299 - i}"></td>` : ''}<td colspan="1000" rowspan="60000"></td></tr>`
    stacked += `${'<tr></tr>'.repeat(100)}</table>`
    const started = Date.now()
    expect(htmlToMarkdown(stacked.repeat(90)).length).toBeLessThan(2 * stacked.length * 90)
    // About 1 s here and 5 s on a loaded CI runner; visiting every rowspan's columns in every row is some 10^10 steps.
    expect(Date.now() - started).toBeLessThan(20_000)
  })

  const delimiterRows = (md: string) => md.split('\n').filter((line) => /^\| (---( \| ---)*) \|$/.test(line))

  it('writes a table whose padded grid would be too large as its rows of cells, still one GFM table', () => {
    // ~380 KB of HTML: one wide empty row over 20,000 one-cell rows pads to 60 million characters.
    const html = `<table><tr><td colspan="1000"></td></tr>${'<tr><td>y</td></tr>'.repeat(20_000)}</table><table><tr><td>k</td><td>v</td></tr><tr><td>1</td><td>2</td></tr></table>`
    const started = Date.now()
    const md = htmlToMarkdown(html)
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(md.length).toBeLessThan(2 * html.length)
    expect(delimiterRows(md)).toHaveLength(2)
    expect(md.startsWith('|  |\n| --- |\n| y |\n| y |\n')).toBe(true)
    expect(md.split('\n').filter((line) => line === '| y |')).toHaveLength(20_000)
    expect(md.endsWith('\n\n| k | v |\n| --- | --- |\n| 1 | 2 |')).toBe(true)
    // Rowspans over many rows, each spanning cell a thousand columns wide.
    const tall = `<table><tr>${'<td rowspan="65534" colspan="1000">a</td>'.repeat(20)}</tr>${'<tr><td>y</td></tr>'.repeat(2_000)}</table>`
    const tallStarted = Date.now()
    expect(htmlToMarkdown(tall).length).toBeLessThan(2 * tall.length)
    expect(Date.now() - tallStarted).toBeLessThan(5_000)
  })
})

describe('htmlToMarkdown whole documents without <html>', () => {
  it('reads a page that opens with many comments in linear time', () => {
    const comments = '<!-- c -->'.repeat(50_000)
    const started = performance.now()
    expect(htmlToMarkdown(`${comments}<!doctype html><html><body><p>x</p></body></html>`)).toBe('x')
    expect(htmlToMarkdown(`${comments}<head><base href="https://b.fixture.test/x/"></head><body><a href="y">y</a></body>`)).toBe('[y](https://b.fixture.test/x/y)')
    expect(htmlToMarkdown(`${'<!--'.repeat(50_000)}<p>x</p>`)).toBe('')
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})

describe('htmlToMarkdown blocks and inline whitespace', () => {
  it('converts inline elements nested thousands deep without running out of stack', () => {
    const md = (html: string) => htmlToMarkdown(`<!doctype html><html><body><p>a ${html} b</p></body></html>`)
    const nest = (open: string, close: string, depth: number, inner: string) => open.repeat(depth) + inner + close.repeat(depth)
    const started = Date.now()
    for (const [open, close, inner] of [['<sup>', '</sup>', '2'], ['<sub>', '</sub>', 'x'], ['<span>', '</span>', 'x'], ['<i><b>', '</b></i>', 'x'], ['<code>', '</code>', 'x'], ['<sup><i>', '</i></sup>', 'x'], ['<span><u>', '</u></span>', 'x']]) {
      expect(md(nest(open!, close!, 20_000, inner!))).toBe(md(nest(open!, close!, 3, inner!)))
    }
    expect(md(nest('<sup>', '</sup>', 20_000, '2'))).toBe('a ² b')
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('converts blocks nested thousands deep without running out of stack', () => {
    const md = (html: string) => htmlToMarkdown(`<!doctype html><html><body>${html}</body></html>`)
    const nest = (open: string, close: string, depth: number, inner: string) => open.repeat(depth) + inner + close.repeat(depth)
    const started = Date.now()
    // The same Markdown as a few levels give.
    const same: [string, string][] = [['<div>', '</div>'], ['<table><tr><td>', '</td></tr></table>'], ['<b><div>', '</div></b>'], ['<span><div>', '</div></span>'], ['<pre><span>', '</span></pre>']]
    // (10,000 deep: each ran out of stack by 8,000; parsing a page so deep takes long enough already.)
    for (const [open, close] of same) expect(md(nest(open, close, 10_000, 'x'))).toBe(md(nest(open, close, 3, 'x')))
    // Lists and quotes indent their content at each level (their Markdown grows with the square of the depth): 3,000 deep.
    const indented: [string, string][] = [['<ul><li>', '</li></ul>'], ['<ol><li>', '</li></ol>'], ['<blockquote>', '</blockquote>'], ['<ul><span><li>', '</li></span></ul>'], ['<section><p>a</p>', '</section>']]
    for (const [open, close] of indented) expect(md(nest(open, close, 3_000, 'x'))).toMatch(/x$/)
    expect(Date.now() - started).toBeLessThan(15_000)
  })

  it('writes lists and quotes nested deep in time that grows with their Markdown, not faster', () => {
    // Each level indents the text of every level inside it, so the Markdown grows with the square of the depth; writing
    // each level's text again made the time grow with its cube. Measured against a list as long, side by side, whose
    // lines are as long as the nested ones (the same machine at the same moment, so a slow or busy one weighs on both):
    // 2,000 levels of a list, a list of paragraphs and a quote take about twice as long as three of it here, twenty
    // times before. (A bound on the time alone, or on its ratio at two depths, was too noisy on CI.) The shorter of two
    // runs of each.
    const best = (html: string): number => {
      let time = Infinity
      for (let run = 0; run < 2; run++) {
        const started = performance.now()
        htmlToMarkdown(html)
        time = Math.min(time, performance.now() - started)
      }
      return time
    }
    const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`
    const nested = (open: string, close: string) => page(`${open.repeat(2_000)}x${close.repeat(2_000)}`)
    const flat = page(`<ol>${Array.from({ length: 2_000 }, (_, i) => `<li>${'a'.repeat(3 * i + 1)}</li>`).join('')}</ol>`)
    const deep = best(nested('<ol><li>a', '</li></ol>')) + best(nested('<ul><li><p>a</p>', '</li></ul>')) + best(nested('<blockquote><p>a</p>', '</blockquote>'))
    expect(deep / (3 * best(flat))).toBeLessThan(6)
  }, 120_000)

  it('joins adjacent runs of one emphasis or code without rewriting the run each time', () => {
    const md = (html: string) => htmlToMarkdown(`<!doctype html><html><body><p>${html}</p></body></html>`)
    expect(md('<code>a`</code><code>`b</code><code>c</code>')).toBe('```a``bc```')
    expect(md('<code>`a</code><code>b</code>')).toBe('`` `ab ``')
    expect(md('<b>a</b><b>b.</b>c')).toBe('**ab**.c')
    // Only plain text joins: Markdown written for each run, such as its own emphasis, code, a link or a character that pairs with
    // one across the join (`<` and `span>`, `&` and `amp;`), would read otherwise next to the other's.
    expect(md('<b><i>x</i></b><b><i>y</i></b>')).toBe('***x***__*y*__')
    expect(md('<b>Note <i>this</i></b><b><i>now</i> please</b>')).toBe('**Note *this***__*now* please__')
    expect(md('<b>a!</b><b><a href="/u">x</a></b>')).toBe('**a!**__[x](/u)__')
    expect(md('<b>&lt;</b><b>span&gt;x</b>')).toBe('**<**__span>x__')
    expect(md('<b>&amp;</b><b>amp;</b>')).toBe('**&**__amp;__')
    const started = Date.now()
    expect(md('<code>a`</code>'.repeat(80_000)).length).toBeLessThan(200_000)
    expect(md('<b>a.</b>'.repeat(80_000)).length).toBeLessThan(200_000)
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})
