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
})

const BASE = 'https://fixture.test/docs/page'

describe('htmlToMarkdown blocks and inline whitespace', () => {
  it('separates adjacent blocks and keeps inline spacing and markup', () => {
    expect(htmlToMarkdown('<div>Alpha</div><div>Beta</div>')).toBe('Alpha\n\nBeta')
    expect(htmlToMarkdown('<div>Hello <b>world</b> <a href="/x">link</a></div>', { baseUrl: BASE }))
      .toBe('Hello **world** [link](https://fixture.test/x)')
    expect(htmlToMarkdown('<div><a href="/a"><h3>A</h3><p>One</p></a><a href="/b"><h3>B</h3><p>Two</p></a></div>', { baseUrl: BASE }))
      .toBe('[A One](https://fixture.test/a)\n\n[B Two](https://fixture.test/b)')
  })

  it('drops empty emphasis and keeps whitespace outside the markers', () => {
    expect(htmlToMarkdown('<h3><i class="flag-icon"></i> Andorra </h3><p><i class="icon-ok"></i> In stock</p>'))
      .toBe('### Andorra\n\nIn stock')
    expect(htmlToMarkdown('<p>a<b> bold </b>b<em></em><strong> </strong>c</p>')).toBe('a **bold** b c')
  })

  it('turns br into a hard line break', () => {
    expect(htmlToMarkdown('<div><strong>Capital:</strong> Andorra la Vella<br>\n  <strong>Population:</strong> 84000<br></div>'))
      .toBe('**Capital:** Andorra la Vella  \n**Population:** 84000')
  })
})

describe('htmlToMarkdown lists and code', () => {
  it('numbers ordered lists from their start and indents nested lists', () => {
    expect(htmlToMarkdown('<ol start="3"><li>c</li><li>d<ul><li>d1</li><li>d2</li></ul></li></ol>'))
      .toBe('3. c\n4. d\n   - d1\n   - d2')
  })

  it('separates a paragraph after a list with a blank line', () => {
    expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul><p>after</p>')).toBe('- a\n- b\n\nafter')
  })

  it('keeps paragraphs, code blocks and tables inside list items', () => {
    const md = htmlToMarkdown(
      '<ul><li><p>Intro</p><pre>x = 1</pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></li></ul>',
    )
    expect(md).toBe('- Intro\n\n  ```\n  x = 1\n  ```\n\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |')
  })

  it('fences pre text exactly, with the language of its class', () => {
    expect(htmlToMarkdown('<pre><code class="hljs language-js">if (a) {\n\n  b(`x`)  \n}\n</code></pre>'))
      .toBe('```js\nif (a) {\n\n  b(`x`)  \n}\n```')
    expect(htmlToMarkdown('<pre class="lang-md">```\nfenced\n```</pre>')).toBe('````md\n```\nfenced\n```\n````')
  })
})

describe('htmlToMarkdown link and image targets', () => {
  it('resolves relative targets against the base URL and keeps fragments, mailto and data', () => {
    const md = htmlToMarkdown(
      '<p><a href="../guide/">Guide</a> <img src="//cdn.fixture.test/a.png" alt="A"> <a href="#top">Top</a> ' +
        '<a href="mailto:x@fixture.test">Mail</a> <img src="data:image/gif;base64,R0lGOD" alt="Dot"> <a href="javascript:void(0)">Menu</a></p>',
      { baseUrl: BASE },
    )
    expect(md).toBe(
      '[Guide](https://fixture.test/guide/) ![A](https://cdn.fixture.test/a.png) [Top](#top) ' +
        '[Mail](mailto:x@fixture.test) ![Dot](data:image/gif;base64,R0lGOD) Menu',
    )
    // A heading's empty permalink anchor says nothing and is dropped.
    expect(htmlToMarkdown('<h2><a class="anchor" href="#install"></a>Install</h2>')).toBe('## Install')
  })

  it('prefers the document <base href>, and keeps targets as written without a base', () => {
    const doc = '<!doctype html><html><head><base href="https://cdn.fixture.test/v2/"></head><body><a href="intro.html">Intro</a></body></html>'
    expect(htmlToMarkdown(doc, { baseUrl: BASE })).toBe('[Intro](https://cdn.fixture.test/v2/intro.html)')
    expect(htmlToMarkdown('<a href="intro.html">Intro</a>')).toBe('[Intro](intro.html)')
  })
})

// Golden files: trimmed copies of the real pages in research/parity/sites.v1.json.
describe('htmlToMarkdown golden pages', () => {
  it('quotes.toscrape.com quote blocks (S04)', () => {
    const html = `<div class="col-md-8">
    <div class="quote" itemscope itemtype="http://schema.org/CreativeWork">
        <span class="text" itemprop="text">“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”</span>
        <span>by <small class="author" itemprop="author">Albert Einstein</small>
        <a href="/author/Albert-Einstein">(about)</a>
        </span>
        <div class="tags">
            Tags:
            <meta class="keywords" itemprop="keywords" content="change,deep-thoughts,thinking,world" >

            <a class="tag" href="/tag/change/page/1/">change</a>

            <a class="tag" href="/tag/deep-thoughts/page/1/">deep-thoughts</a>

        </div>
    </div>

    <div class="quote" itemscope itemtype="http://schema.org/CreativeWork">
        <span class="text" itemprop="text">“It is our choices, Harry, that show what we truly are, far more than our abilities.”</span>
        <span>by <small class="author" itemprop="author">J.K. Rowling</small>
        <a href="/author/J-K-Rowling">(about)</a>
        </span>
        <div class="tags">
            Tags:
            <a class="tag" href="/tag/abilities/page/1/">abilities</a>
        </div>
    </div>
</div>`
    expect(htmlToMarkdown(html, { baseUrl: 'https://quotes.toscrape.com/' })).toBe(
      [
        '“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.” by Albert Einstein [(about)](https://quotes.toscrape.com/author/Albert-Einstein)',
        'Tags: [change](https://quotes.toscrape.com/tag/change/page/1/) [deep-thoughts](https://quotes.toscrape.com/tag/deep-thoughts/page/1/)',
        '“It is our choices, Harry, that show what we truly are, far more than our abilities.” by J.K. Rowling [(about)](https://quotes.toscrape.com/author/J-K-Rowling)',
        'Tags: [abilities](https://quotes.toscrape.com/tag/abilities/page/1/)',
      ].join('\n\n'),
    )
  })

  it('docs.github.com numbered steps with code blocks (S09)', () => {
    const html = `<div class="markdown-body"><h2 id="setting-your-git-username" tabindex="-1"><a class="heading-link" href="#setting-your-git-username">Setting your Git username for every repository on your computer<span class="heading-link-symbol" aria-hidden="true"></span></a></h2>
<ol>
<li>
<p>Open <span class="platform-mac">Terminal</span>.</p>
</li>
<li>
<p>Set a Git username:</p>
<pre><code class="hljs language-shell">git config --global user.name "Mona Lisa"
</code></pre>
</li>
<li>
<p>Confirm that you have set the Git username correctly:</p>
<pre><code class="hljs language-shell"><span class="hljs-meta prompt_">$ </span><span class="bash">git config --global user.name</span>
<span class="hljs-meta prompt_">&gt; </span><span class="bash">Mona Lisa</span>
</code></pre>
</li>
</ol>
<h2 id="further-reading" tabindex="-1"><a class="heading-link" href="#further-reading">Further reading<span class="heading-link-symbol" aria-hidden="true"></span></a></h2>
<ul>
<li><a href="/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address">Setting your commit email address</a></li>
<li><a href="https://git-scm.com/book/en/v2/Customizing-Git-Git-Configuration">"Git Configuration" from the <em>Pro Git</em> book</a></li>
</ul></div>`
    expect(htmlToMarkdown(html, { baseUrl: 'https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git' })).toBe(
      [
        '## [Setting your Git username for every repository on your computer](#setting-your-git-username)',
        [
          '1. Open Terminal.',
          '2. Set a Git username:',
          '',
          '   ```shell',
          '   git config --global user.name "Mona Lisa"',
          '   ```',
          '3. Confirm that you have set the Git username correctly:',
          '',
          '   ```shell',
          '   $ git config --global user.name',
          '   > Mona Lisa',
          '   ```',
        ].join('\n'),
        '## [Further reading](#further-reading)',
        '- [Setting your commit email address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)\n' +
          '- ["Git Configuration" from the *Pro Git* book](https://git-scm.com/book/en/v2/Customizing-Git-Git-Configuration)',
      ].join('\n\n'),
    )
  })

  it('books.toscrape.com product listing (S01)', () => {
    const html = `<div class="page_inner">
    <ul class="breadcrumb">
        <li>
            <a href="index.html">Home</a>
        </li>
        <li class="active">All products</li>
    </ul>
        <section>
            <div class="alert alert-warning" role="alert"><strong>Warning!</strong> This is a demo website for web scraping purposes. Prices and ratings here were randomly assigned and have no real meaning.</div>
            <div>
                <ol class="row">
                        <li class="col-xs-6 col-sm-4 col-md-3 col-lg-3">
    <article class="product_pod">
            <div class="image_container">
                    <a href="catalogue/a-light-in-the-attic_1000/index.html"><img src="media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e8b.jpg" alt="A Light in the Attic" class="thumbnail"></a>
            </div>
                <p class="star-rating Three">
                    <i class="icon-star"></i>
                    <i class="icon-star"></i>
                </p>
            <h3><a href="catalogue/a-light-in-the-attic_1000/index.html" title="A Light in the Attic">A Light in the ...</a></h3>
            <div class="product_price">
        <p class="price_color">£51.77</p>
<p class="instock availability">
    <i class="icon-ok"></i>
        In stock
</p>
            </div>
    </article>
</li>
                </ol>
            </div>
        </section>
</div>`
    expect(htmlToMarkdown(html, { baseUrl: 'https://books.toscrape.com/' })).toBe(
      [
        '- [Home](https://books.toscrape.com/index.html)\n- All products',
        '**Warning!** This is a demo website for web scraping purposes. Prices and ratings here were randomly assigned and have no real meaning.',
        [
          '1. [![A Light in the Attic](https://books.toscrape.com/media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e8b.jpg)](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html)',
          '',
          '   ### [A Light in the ...](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html)',
          '',
          '   £51.77',
          '',
          '   In stock',
        ].join('\n'),
      ].join('\n\n'),
    )
  })

  it('scrapethissite.com country cards (S07)', () => {
    const html = `<div class="container">
                <div class="row">
                    <div class="col-md-12">
                        <h1>
                            Countries of the World: A Simple Example
                            <small>250 items</small>
                        </h1>
                        <hr>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <p>
                            <i class="glyphicon glyphicon-education"></i> There are <a href="/lessons/">4 video lessons</a> that show you how to scrape this page.
                        </p>
                        <hr>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-4 country">
                        <h3 class="country-name">
                            <i class="flag-icon flag-icon-ad"></i>
                            Andorra
                        </h3>
                        <div class="country-info">
                            <strong>Capital:</strong> <span class="country-capital">Andorra la Vella</span><br>
                            <strong>Population:</strong> <span class="country-population">84000</span><br>
                            <strong>Area (km<sup>2</sup>):</strong> <span class="country-area">468.0</span><br>
                        </div>
                    </div><!--.col-->
                </div>
</div>`
    expect(htmlToMarkdown(html, { baseUrl: 'https://www.scrapethissite.com/pages/simple/' })).toBe(
      [
        '# Countries of the World: A Simple Example 250 items',
        '---',
        'There are [4 video lessons](https://www.scrapethissite.com/lessons/) that show you how to scrape this page.',
        '---',
        '### Andorra',
        '**Capital:** Andorra la Vella  \n**Population:** 84000  \n**Area (km2):** 468.0',
      ].join('\n\n'),
    )
  })

  it('en.wikipedia.org population table with line breaks in cells (S10)', () => {
    const html = `<table class="wikitable sortable mw-datatable">
<caption>List of countries and territories by total population</caption>
<tbody><tr><th>Location</th>
<th>Population</th>
<th style="width:2em">% of<br>world</th>
<th>Date</th>
<th><span class="nowrap">Source (official or from</span><br>the <a href="https://en.wikipedia.org/wiki/United_Nations" title="United Nations">United Nations</a>)</th>
<th class="unsortable">Notes</th></tr>
<tr>
<td><span class="flagicon"><span class="mw-image-border"><span><img src="//thumb.wikimedia.org/wikipedia/en/thumb/4/41/Flag_of_India.svg/40px-Flag_of_India.svg.png" alt="" height="15" width="23" class="mw-file-element"/></span></span></span> <a href="https://en.wikipedia.org/wiki/Demographics_of_India" title="Demographics of India">India</a></td>
<td style="text-align:right">1,429,404,000</td><td style="text-align:right;font-size:inherit"><span data-sort-value="7,001,172,774,265,385,000♠" style="display:none"></span>17.3%</td><td><span data-sort-value="000000002026-07-01-0000" style="white-space:nowrap">1 Jul 2026</span></td>
<td>Official projection<sup class="mw-ref reference"><a href="#cite_note-5"><span class="mw-reflink-text"><span class="cite-bracket">[</span>4<span class="cite-bracket">]</span></span></a></sup></td><td><sup class="mw-ref reference"><a href="#cite_note-6"><span class="mw-reflink-text"><span class="cite-bracket">[</span>b<span class="cite-bracket">]</span></span></a></sup></td></tr>
</tbody></table>`
    expect(htmlToMarkdown(html, { baseUrl: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population' })).toBe(
      [
        'List of countries and territories by total population',
        '| Location | Population | % of world | Date | Source (official or from the United Nations) | Notes |',
        '| --- | --- | --- | --- | --- | --- |',
        '| India | 1,429,404,000 | 17.3% | 1 Jul 2026 | Official projection[4] | [b] |',
      ].join('\n'),
    )
  })
})
