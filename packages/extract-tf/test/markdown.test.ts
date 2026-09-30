import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown } from '../src/index.js'

describe('htmlToMarkdown', () => {
  it('turns headings, paragraphs, and emphasis into GFM', () => {
    const md = htmlToMarkdown(
      '<article><h1>Kiln</h1><p>The kiln reached <strong>1240</strong> degrees.</p></article>',
    )
    expect(md).toContain('# Kiln')
    expect(md).toContain('The kiln reached **1240** degrees.')
    expect(md).not.toContain('<p>')
    expect(md).not.toContain('<h1>')
  })

  it('emits GFM tables the fixture checker can score', () => {
    const md = htmlToMarkdown(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    )
    expect(md).toContain('| A | B |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| 1 | 2 |')
  })

  it('keeps required facts after extract-tf on the article fixture', () => {
    const html = `<!doctype html><html><head><title>Kiln temperatures and glaze vitrification</title></head>
<body>
<div id="cookie-consent" role="dialog"><p>We use cookies to personalise content.</p></div>
<nav class="site-nav"><a href="/pricing">Pricing</a></nav>
<article>
<h1>Kiln temperatures and glaze vitrification</h1>
<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>
<p>Sediment cores from the estuary date to 1873. Researchers compared them against the almanac kept at the plinth house.</p>
</article>
<footer><p>Copyright 2026 Synthetic Fixture Co. All rights reserved.</p></footer>
</body></html>`
    const out = extractTf.extract(html)
    const md = htmlToMarkdown(out.mainHtml)
    expect(md).toContain('The kiln reached 1240 degrees before the glaze vitrified.')
    expect(md).toContain('Sediment cores from the estuary date to 1873.')
    expect(md).not.toContain('We use cookies')
    expect(md).not.toContain('Pricing')
    expect(md).not.toContain('<article')
  })

  it('is empty on empty input', () => {
    expect(htmlToMarkdown('')).toBe('')
  })

  it('keeps sibling blocks on separate lines and inline siblings spaced', () => {
    const md = htmlToMarkdown(
      '<div><div>First block ends with kilns.</div><div>Second block.</div>' +
        '<div><span>Alpha</span> <span>Beta</span></div>' +
        '<div class="tags">Tags: <meta itemprop="keywords" content="x"><a href="/t/a">a</a> <a href="/t/b">b</a></div>' +
        '<dl><dt>Term</dt><dd>Definition</dd></dl><div>Price: <strong>$5</strong></div></div>',
    )
    expect(md.split('\n').filter((l) => l.length > 0)).toEqual([
      'First block ends with kilns.',
      'Second block.',
      'Alpha Beta',
      'Tags: [a](/t/a) [b](/t/b)',
      '**Term**',
      'Definition',
      'Price: **$5**',
    ])
  })

  it('numbers ordered lists and keeps code and tables nested in items', () => {
    const md = htmlToMarkdown(
      '<ol start="3"><li>Step one<pre><code class="language-sh">npm ci</code></pre></li>' +
        '<li>Step two<ul><li>nested</li></ul></li>' +
        '<li>Step three<table><tr><th>A</th></tr><tr><td>1</td></tr></table></li></ol>',
    )
    expect(md).toBe(
      ['3. Step one', '   ```sh', '   npm ci', '   ```', '4. Step two', '   - nested', '5. Step three', '   | A |', '   | --- |', '   | 1 |'].join('\n'),
    )
  })

  it('resolves relative targets against the page URL and drops data: images', () => {
    const md = htmlToMarkdown(
      '<p><a href="/docs/x">rel</a> <a href="https://other.test/y">abs</a> <img src="../i.png" alt="im"> ' +
        '<img src="data:image/png;base64,AAAA" alt="inline pic"> <a href="javascript:void(0)">js</a></p>',
      { baseUrl: 'https://ex.test/a/b/' },
    )
    expect(md).toBe('[rel](https://ex.test/docs/x) [abs](https://other.test/y) ![im](https://ex.test/a/i.png) inline pic js')
  })

  it('leaves relative targets alone without a base URL', () => {
    expect(htmlToMarkdown('<p><a href="/docs/x">rel</a></p>')).toBe('[rel](/docs/x)')
  })

  it('skips hidden elements and joins block content inside table cells', () => {
    const md = htmlToMarkdown(
      '<div><p hidden>secret</p><p aria-hidden="true">icon</p><p style="display: none">gone</p><p>kept</p>' +
        '<table><tr><th>Site</th><th>PUE</th></tr><tr><td>Hamina</td><td>1.10<br>1.09</td></tr><tr><td>Eemshaven</td><td><p>a</p><p>b</p></td></tr></table></div>',
    )
    expect(md).not.toContain('secret')
    expect(md).not.toContain('icon')
    expect(md).not.toContain('gone')
    expect(md).toContain('kept')
    expect(md).toContain('| Hamina | 1.10 1.09 |')
    expect(md).toContain('| Eemshaven | a b |')
  })

  it('keeps the fixture grid geometry for spanned cells', () => {
    const md = htmlToMarkdown(
      '<table><tr><th colspan="3">Full span</th></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>',
    )
    expect(md).toBe('| Full span |  |  |\n| --- | --- | --- |\n| A | B | C |')
  })
})
