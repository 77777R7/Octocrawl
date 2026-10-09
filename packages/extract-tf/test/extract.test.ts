import { describe, expect, it, vi } from 'vitest'
import { cleanTree, detectRenderSignals, extractTf, htmlToMarkdown, pruneTree, rawSignals, wholePageBody, withoutLayoutMarkers } from '../src/index.js'
import { parse } from '../src/dom.js'
import { headingsOnly } from '../src/extract.js'

const ARTICLE = `<!doctype html><html><head><title>Kiln temperatures and glaze vitrification</title></head>
<body>
<div id="cookie-consent" role="dialog"><p>We use cookies to personalise content.</p><button>Accept all</button></div>
<nav class="site-nav"><a href="/">Home</a> <a href="/pricing">Pricing</a></nav>
<article>
<h1>Kiln temperatures and glaze vitrification</h1>
<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>
<p>Sediment cores from the estuary date to 1873. Researchers compared them against the almanac kept at the plinth house.</p>
<p>Later experiments repeated the same steps, and the temperature curve matched the first recording within fifteen degrees.</p>
</article>
<aside class="sidebar"><h3>Trending</h3><ul><li><a href="/a">Unrelated link A</a></li></ul></aside>
<footer><p>Copyright 2026 Synthetic Fixture Co. All rights reserved.</p></footer>
</body></html>`

describe('extractTf', () => {
  it('extracts the article, its title, and none of the boilerplate', () => {
    const out = extractTf.extract(ARTICLE)
    expect(out.title).toBe('Kiln temperatures and glaze vitrification')
    expect(out.mainHtml).toContain('The kiln reached 1240 degrees')
    expect(out.mainHtml).toContain('Sediment cores from the estuary date to 1873.')
    expect(out.mainHtml).not.toContain('We use cookies')
    expect(out.mainHtml).not.toContain('Pricing')
    expect(out.mainHtml).not.toContain('Copyright 2026')
    expect(out.mainHtml).not.toContain('Trending')
    expect(out.escalate).toBe(false)
    expect(out.confidence).toBeGreaterThan(0.5)
  })

  it('handles CJK prose without requiring sentence-final punctuation', () => {
    const html = `<!doctype html><html><body><article>
<h1>窑温与釉面玻化</h1>
<p>窑温达到一千二百四十度后釉面开始玻化。研究者用罗盘和测温计记录了每一次开窑的读数，并把结果抄录在年鉴里。</p>
<p>后续的实验重复了同样的步骤，温度曲线与第一次记录基本一致，误差不超过十五度。</p>
</article></body></html>`
    const out = extractTf.extract(html)
    expect(out.title).toBe('窑温与釉面玻化')
    expect(out.mainHtml).toContain('窑温达到一千二百四十度')
    expect(out.escalate).toBe(false)
  })

  it('survives malformed markup and still finds the fact', () => {
    const html = `<!doctype html><html><head><title>Broken</title></head><body>
<div class=unquoted><p>The valve seized in the second winter.
<p>Another paragraph with <b>unclosed bold
<ul><li>one<li>two
<p>Trailing text after a stray </div></span>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The valve seized in the second winter.')
  })

  it('prunes cookie banners by id even when they precede content', () => {
    const html = `<!doctype html><html><body>
<div id="onetrust-banner-sdk"><p>Manage your privacy settings</p></div>
<article><h1>Report</h1><p>The survey covers forty villages and three hundred households in the upper valley.</p></article>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The survey covers forty villages')
    expect(out.mainHtml).not.toContain('Manage your privacy')
  })

  it('escalates on a page with no prose at all', () => {
    const out = extractTf.extract('<!doctype html><html><body><div id="root"></div></body></html>')
    expect(out.escalate).toBe(true)
    expect(out.mainHtml).toBe('')
  })

  it('escalates on a page whose main region says nothing beyond its headings and in-page jump links (ROADMAP PA item 4)', () => {
    // The Tesla inventory page through a vendor, loaded with no vehicles: a heading was its whole content.
    const page = (main: string) => `<!doctype html><html><head><title>Inventory</title></head><body>
<header><nav><a href="/models">Model S</a> <a href="/model3">Model 3</a> <a href="/modelx">Model X</a> <a href="/shop">Shop</a></nav></header>
<main class="inventory">${main}</main>
<footer><nav><a href="/about">Tesla © 2026</a> <a href="/privacy">Privacy &amp; Legal</a> <a href="/contact">Contact</a></nav></footer></body></html>`
    for (const main of [
      '<h3>Don\'t see the Tesla you\'re looking for?</h3>',
      '<div><h2>Results</h2><a href="#filters">Skip to Filters</a></div><h1 class="placeholder">Inventory Search Results Fetching...</h1>',
    ]) expect(extractTf.extract(page(main)).escalate, main).toBe(true)
    // A heading with something to say beyond it is content.
    const said = extractTf.extract(page('<h1>Model 3</h1><p>Rear-wheel drive, 363 miles of range, from $42,490.</p>'))
    expect(said.escalate).toBe(false)
    expect(said.mainHtml).toContain('363 miles of range')
  })

  it('keeps short or heading-led pages that are content: cards, a terse product, prose in headings, a one-line notice', () => {
    // Each of these is content under extract-tf/14 too: the rule must leave them so.
    const shell = (head: string, main: string) => `<!doctype html><html><head><title>Page</title>${head}</head><body>
<header><nav><a href="/">Home</a> <a href="/shop">Shop</a> <a href="/about">About</a> <a href="/contact">Contact</a></nav></header>
<main>${main}</main><footer><nav><a href="/terms">Terms</a> <a href="/privacy">Privacy</a></nav></footer></body></html>`
    const pages: Record<string, string> = {
      'category grid': shell('', '<h1>Shop</h1><ul class="products">' + ['Hoodies', 'Shirts', 'Caps', 'Bags'].map((n) => `<li class="product-category product"><a href="/c/${n}"><img src="/${n}.jpg" alt="${n}"><h2>${n} <mark class="count">(3)</mark></h2></a></li>`).join('') + '</ul>'),
      'publications': shell('', '<h1>Publications</h1>' + ['Sparse attention at scale in practice', 'Retrieval for long documents and tables', 'Evaluating extraction on real sites', 'Ladders for web access', 'Evidence records that travel', 'Budgets for paid providers'].map((t, i) => `<div class="pub"><h3><a href="/p/${i}">${t}</a></h3><span>Published in 2024 by the lab</span></div>`).join('')),
      'blog archive': shell('', '<h1>Archive</h1>' + ['How we test extraction on two hundred pages', 'What a spend ledger is for and how it settles', 'Why a provider success is not verified content', 'Reading pages that load their data late'].map((t, i) => `<article><h2><a href="/post/${i}">${t}</a></h2></article>`).join('')),
      'terse product': shell('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Acme Widget","offers":{"@type":"Offer","price":"19.99","priceCurrency":"USD"}}</script>', '<h1>Acme Widget</h1><img src="/w.jpg" alt="widget"><span class="price">$19.99</span><p>In stock</p>'),
      'prose in headings': shell('', '<h1>About us</h1><h3>We have built small kilns by hand since 1990, from a single workshop by the harbour.</h3><h3>Every kiln is fired twice before it leaves, and each one ships with its own logbook.</h3>'),
      'one-line notice': shell('', '<h1>公告</h1><p>本店今日休息，明天照常营业。</p>'),
      'score table': shell('', '<h1>Final score</h1><table><tr><th>Team</th><th>Pts</th></tr><tr><td>Home</td><td>3</td></tr><tr><td>Away</td><td>1</td></tr></table>'),
      'chart': shell('', '<h1>Chart: US inflation rate since 2000</h1><img src="/chart.png" alt="Line chart of US CPI inflation 2000-2026">'),
      // Kept so by the strategy alone: a list of heading-named cards with no thumbnails, a product with its price in a heading.
      'bare category grid': shell('', '<h1>Shop</h1><ul class="products">' + ['Hoodies', 'Shirts', 'Caps', 'Bags'].map((n) => `<li class="product-category product"><a href="/c/${n}"><h2>${n} <mark class="count">(3)</mark></h2></a></li>`).join('') + '</ul>'),
      'price in a heading': shell('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Acme Widget","offers":{"@type":"Offer","price":"19.99","priceCurrency":"USD"}}</script>', '<div class="product"><h1>Acme Widget</h1><h2 class="price">$19.99</h2></div>'),
      'gallery': shell('', '<h1>Gallery: our 2026 summer collection</h1><div class="grid">' + ['dress', 'shirt', 'hat'].map((n) => `<img src="/${n}.jpg" alt="The ${n} in linen">`).join('') + '</div>'),
    }
    for (const [name, html] of Object.entries(pages)) expect(extractTf.extract(html).escalate, name).toBe(false)
  })

  it('judges a region by what it says beside its headings, jump links set aside, without recursing (headingsOnly)', () => {
    const region = (html: string) => parse(`<!doctype html><html><body><main>${html}</main></body></html>`).document.querySelector('main')!
    expect(headingsOnly(region('<h2>Results</h2>'))).toBe(true)
    // A jump link is not content, however long; a link to another page is.
    expect(headingsOnly(region('<h2>Results</h2><a href="#filters">Skip to the filters and the sort order</a>'))).toBe(true)
    expect(headingsOnly(region('<h2>Results</h2><a href="/filters">Filters</a>'))).toBe(false)
    // A symbol or two beside the heading is not content; three characters are; a script's text is not counted.
    expect(headingsOnly(region('<h2>Results</h2><span>▸</span>'))).toBe(true)
    expect(headingsOnly(region('<h2>Results</h2><span>ab</span>'))).toBe(true)
    expect(headingsOnly(region('<h2>公告</h2><p>休息日</p>'))).toBe(false)
    expect(headingsOnly(region('<h2>Results</h2><script>window.results = "loading the results for the page"</script>'))).toBe(true)
    // Text inside a heading's own elements is heading text, and a page's indentation between tags is not text.
    expect(headingsOnly(region('<h3><span>Don\'t see the Tesla</span> <em>you\'re looking for?</em></h3>'))).toBe(true)
    expect(headingsOnly(region('\n    <section>\n      <h3>Don\'t see the Tesla you\'re looking for?</h3>\n      <a href="#filters">Skip to Filters</a>\n    </section>\n  '))).toBe(true)
    // An image beside the heading is content; one inside it is part of the heading; media the Markdown drops are not
    // content (a table drawn on a canvas, a video, an embedded frame).
    expect(headingsOnly(region('<h1>Chart</h1><figure><img src="/c.png" alt="chart"></figure>'))).toBe(false)
    expect(headingsOnly(region('<h1><img src="/logo.png" alt=""> Results</h1>'))).toBe(true)
    for (const media of ['<canvas width="1512" height="640"></canvas>', '<video src="/v.mp4"></video>', '<iframe src="https://example.com/embed"></iframe>', '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', '<img alt="no source">', '<img class="spinner" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">', '<img src="javascript:void(0)" alt="">']) {
      expect(headingsOnly(region(`<h1>Sheet</h1>${media}`)), media).toBe(true)
    }
    // Headings that hold 100 characters or more are content in themselves.
    expect(headingsOnly(region(`<h3>${'a'.repeat(99)}</h3>`))).toBe(true)
    expect(headingsOnly(region(`<h3>${'a'.repeat(100)}</h3>`))).toBe(false)
    // A region that is itself a heading counts its text as heading text.
    const heading = parse('<!doctype html><html><body><h3>Don\'t see the Tesla you\'re looking for?</h3></body></html>').document.querySelector('h3')!
    expect(headingsOnly(heading)).toBe(true)
    // Thousands of elements deep.
    expect(headingsOnly(region('<h1>Title</h1>' + '<div>'.repeat(6000) + '<p>Deep paragraph of real text.</p>' + '</div>'.repeat(6000)))).toBe(false)
  })

  it('keeps a card listing whose short texts the article cascade cannot see', () => {
    // books.toscrape.com's Art category: eight cards of title link, price and
    // stock, no pager, and a category name too short to be a block.
    const card = (slug: string, title: string, price: string) => `<li class="col-xs-6 col-sm-4 col-md-3 col-lg-3"><article class="product_pod">
<div class="image_container"><a href="../../../${slug}/index.html"><img src="../../../../media/cache/${slug}.jpg" alt="${title}" class="thumbnail"></a></div>
<p class="star-rating Four"><i class="icon-star"></i><i class="icon-star"></i></p>
<h3><a href="../../../${slug}/index.html" title="${title}">${title}</a></h3>
<div class="product_price"><p class="price_color">${price}</p><p class="instock availability"><i class="icon-ok"></i> In stock</p>
<form><button type="submit" class="btn btn-primary btn-block">Add to basket</button></form></div>
</article></li>`
    const html = `<!doctype html><html><head><title>Art | Books to Scrape - Sandbox</title></head><body>
<header class="header container-fluid"><div class="row"><div class="col-sm-8 h1"><a href="../../../../index.html">Books to Scrape</a><small> We love being scraped!</small></div></div></header>
<div class="container-fluid page"><div class="page_inner">
<ul class="breadcrumb"><li><a href="../../../../index.html">Home</a></li><li><a href="../../books_1/index.html">Books</a></li><li class="active">Art</li></ul>
<div class="row">
<aside class="sidebar col-sm-4 col-md-3"><ul class="nav nav-list"><li><a href="../travel_2/index.html">Travel</a></li><li><a href="../mystery_3/index.html">Mystery</a></li></ul></aside>
<div class="col-sm-8 col-md-9">
<div class="page-header action"><h1>Art</h1></div>
<form method="get" class="form-horizontal"><strong>8</strong> results.</form>
<section><div class="alert alert-warning" role="alert"><strong>Warning!</strong> This is a demo website for web scraping purposes. Prices and ratings here were randomly assigned and have no real meaning.</div>
<div><ol class="row">
${card('wall-and-piece_971', 'Wall and Piece', '£44.18')}
${card('history-of-beauty_521', 'History of Beauty', '£10.29')}
${card('the-story-of-art_500', 'The Story of Art', '£41.14')}
${card('ways-of-seeing_94', 'Ways of Seeing', '£44.46')}
</ol></div></section>
</div></div></div></div>
<footer class="footer container-fluid"></footer>
</body></html>`
    const out = extractTf.extract(html, { url: 'https://books.toscrape.com/catalogue/category/books/art_25/index.html' })
    expect(out.escalate).toBe(false)
    expect(out.strategy).toBe('list')
    expect(out.mainHtml).toContain('<h1>Art</h1>')
    expect(out.lastResort).toBeUndefined()
    expect(out.mainHtml).toContain('This is a demo website')
    expect(out.mainHtml).toContain('Wall and Piece')
    expect(out.mainHtml).toContain('£44.46')
    expect(out.mainHtml).not.toContain('Mystery')
    expect(out.mainHtml).not.toContain('We love being scraped')
  })

  it('keeps a list of items that carry no link, which the card fallback cannot see', () => {
    // quotes.toscrape.com/js/ after its script ran: each quote is its text, its author and tags without a target, so no item
    // carries a link; a list of quotes is the page's content, though no block of it is prose the cascade keeps.
    const quote = (text: string, author: string, tags: string[]) => `<div class="quote"><span class="text">“${text}”</span><span>by <small class="author">${author}</small></span><div class="tags">Tags: ${tags.map((tag) => `<a class="tag">${tag}</a>`).join(' ')}</div></div>`
    const html = `<!doctype html><html lang="en"><head><title>Quotes to Scrape</title></head><body>
<div class="container">
<div class="row header-box"><div class="col-md-8"><h1><a href="/" style="text-decoration: none">Quotes to Scrape</a></h1></div><div class="col-md-4"><p><a href="/login">Login</a></p></div></div>
${quote('This life is what you make it. No matter what, you\'re going to mess up sometimes, it\'s a universal truth.', 'Marilyn Monroe', ['friends', 'life'])}
${quote('It takes a great deal of bravery to stand up to our enemies, but just as much to stand up to our friends.', 'J.K. Rowling', ['courage', 'friends'])}
${quote('If you can\'t explain it to a six year old, you don\'t understand it yourself.', 'Albert Einstein', ['simplicity', 'understand'])}
${quote('You may not be her first, her last, or her only. She loved before she may love again.', 'Bob Marley', ['love'])}
<nav><ul class="pager"><li class="previous"><a href="/js/"><span aria-hidden="true">&larr;</span> Previous</a></li><li class="next"><a href="/js/page/3/">Next <span aria-hidden="true">&rarr;</span></a></li></ul></nav>
</div>
<footer class="footer"><div class="container"><p class="text-muted">Quotes by: <a href="https://www.goodreads.com/quotes">GoodReads.com</a></p></div></footer>
</body></html>`
    const out = extractTf.extract(html, { url: 'https://quotes.toscrape.com/js/page/2/' })
    expect(out.escalate).toBe(false)
    expect(out.strategy).toBe('list')
    expect(out.mainHtml).toContain('This life is what you make it')
    expect(out.mainHtml).toContain('Bob Marley')
    expect(out.mainHtml).not.toContain('GoodReads.com')
    // Found only by the last resort: the lanes still look for a wall on the page, as on one with nothing found.
    expect(out.lastResort).toBe(true)
  })

  it('keeps a grid of product cards on a page with two h1s', () => {
    // webscraper.io's test e-commerce laptops: a hero h1 above the page's own h1, a category menu beside the cards, and each
    // card declared a schema.org Product, so the page routes as one product and no product region is found.
    const card = (id: number, title: string, price: string, about: string, reviews: number) => `<div class="col-md-4 col-xl-4 col-lg-4"><div class="card thumbnail" itemscope="" itemtype="https://schema.org/Product"><div class="product-wrapper card-body"><img class="img-fluid card-img-top image img-responsive" alt="item" src="/images/test-sites/e-commerce/items/cart2.png" itemprop="image"><div class="caption"><h4 class="price float-end pull-right" itemprop="offers" itemscope="" itemtype="https://schema.org/Offer">${price}</h4><h4><a href="/test-sites/e-commerce/more/product/${id}" class="title" itemprop="name" title="${title}">${title.slice(0, 16)}</a></h4><p class="card-text description" itemprop="description">${about}</p></div><div class="ratings" itemprop="aggregateRating" itemscope="" itemtype="https://schema.org/AggregateRating"><p class="review-count float-end pull-right"><span itemprop="reviewCount">${reviews}</span> reviews</p><p><span class="ws-icon ws-icon-star"></span></p></div></div></div></div>`
    const html = `<!doctype html><html lang="en"><head><title>Web Scraper Test Sites</title></head><body class="ws-v2">
<header class="v2-header"><nav class="v2-navbar"><a href="/" class="v2-navbar__logo">Web Scraper</a><ul class="v2-navbar__menu"><li><a href="/documentation">Documentation</a></li><li><a href="/test-sites">Test Sites</a></li></ul></nav></header>
<div><main>
<div class="container-fluid blog-hero"><div class="container"><div class="row"><div class="col-lg-12"><h1>Test Sites</h1></div></div></div></div>
<div class="container test-site"><div class="row">
<div class="col-lg-3 sidebar"><div class="navbar-light sidebar" role="navigation"><ul class="nav flex-column" id="side-menu"><li class="nav-item"><a href="/test-sites/e-commerce/more" class="nav-link">Home</a></li><li class="nav-item"><a href="/test-sites/e-commerce/more/computers/tablets" class="nav-link subcategory-link">Tablets</a></li><li class="nav-item"><a href="/test-sites/e-commerce/more/phones" class="nav-link">Phones</a></li></ul></div></div>
<div class="col-lg-9">
<h1 class="page-header">Computers / Laptops</h1>
<p class="item-count">117 items</p>
<div class="row ecomerce-items ecomerce-items-more" data-type="more">
${card(60, 'Asus VivoBook X441NA-GA190', '$295.99', 'Asus VivoBook X441NA-GA190 Chocolate Black, 14", Celeron N3450, 4GB, 128GB SSD, Endless OS, ENG kbd', 1)}
${card(61, 'Prestigio SmartBook 133S Dark Grey', '$299', 'Prestigio SmartBook 133S Dark Grey, 13.3" FHD IPS, Celeron N3350 1.1GHz, 4GB, 32GB, Windows 10 Pro + Office 365 1 gadam', 9)}
${card(62, 'Prestigio SmartBook 133S Gold', '$299', 'Prestigio SmartBook 133S Gold, 13.3" FHD IPS, Celeron N3350 1.1GHz, 4GB, 32GB, Windows 10 Pro + Office 365 1 gadam', 12)}
${card(63, 'Aspire E1-510', '$306.99', '15.6", Pentium N3520 2.16GHz, 4GB, 500GB, Linux', 2)}
</div>
<a class="btn btn-lg btn-block btn-primary ecomerce-items-scroll-more">More</a>
</div></div></div>
</main></div>
<footer class="v2-footer"><div class="container"><h2 class="v2-footer__heading">Company</h2><a href="/about-us">About us</a> <a href="/contact">Contact</a></div></footer>
</body></html>`
    const out = extractTf.extract(html, { url: 'https://webscraper.io/test-sites/e-commerce/more/computers/laptops' })
    expect(out.escalate).toBe(false)
    expect(out.strategy).toBe('list')
    expect(out.mainHtml).toContain('Computers / Laptops')
    expect(out.mainHtml).toContain('$295.99')
    expect(out.mainHtml).toContain('Aspire E1-510')
    expect(out.mainHtml).not.toContain('Tablets')
    expect(out.mainHtml).not.toContain('About us')
  })

  it('still finds no content in a page of placeholders that repeat the same text', () => {
    // An application shell drawing loading rows before its data: alike, but they say nothing.
    const row = '<div class="row-skeleton"><span class="line">Loading the latest results for you, please wait…</span></div>'
    const out = extractTf.extract(`<!doctype html><html><head><title>Results</title></head><body><div id="root"><h1>Results</h1><div class="results">${row.repeat(8)}</div></div></body></html>`)
    expect(out.escalate).toBe(true)
  })

  it('keeps a home page of linked cards with short descriptions', () => {
    // data.gov.uk's home page: headings, card links and descriptions without
    // sentence punctuation, so not one block qualifies as prose.
    const item = (slug: string, name: string, about: string) => `<div class="datagovuk-home-collections__item">
<img src="/assets/images/collections/badge-${slug}.png" width="108" height="108" alt="" class="datagovuk-home-collections__item-image" />
<div class="datagovuk-home-collections__item-content"><h3 class="govuk-body"><a href="/collections/${slug}" class="govuk-link">${name}</a></h3>
<p class="govuk-body datagovuk-!-colour-grey">${about}</p></div></div>`
    const html = `<!doctype html><html lang="en"><head><title>National Data Library - The home of UK public data - data.gov.uk</title></head><body>
<header role="banner" class="datagovuk-header"><div class="govuk-width-container">
<a class="datagovuk-header__logo-link" href="/"><img src="/assets/images/logo-ndl.svg" alt="Home" /></a>
<div class="datagovuk-menu" id="datagovuk-menu-data-manual"><h2 class="datagovuk-menu__heading">Data manual</h2><div class="datagovuk-menu__items">
<a href="/data-manual/who-this-manual-is-for/" class="govuk-link">Who this manual is for</a><a href="/data-manual/data-management/" class="govuk-link">Data management</a><a href="/data-manual/data-standards/" class="govuk-link">Data standards</a>
</div></div></div></header>
<main id="main" class="datagovuk-main"><div class="govuk-width-container">
<div class="datagovuk-home-hero"><h1 class="govuk-heading-xl">The home of UK public data to inform decisions and build services</h1>
<p class="govuk-body"><a href="/roadmap/" class="govuk-link">Find out more about the National Data Library</a></p></div>
<div class="datagovuk-home-collections"><h2 class="govuk-heading-l">Collections</h2>
<p class="govuk-body">Curated collections of high-quality, accessible data</p>
<div class="datagovuk-home-collections__items">
${item('business-and-economy', 'Business and economy', 'Company information, prices, trade, economic indicators')}
${item('environment', 'Environment', 'Nature, climate, floods, mapping')}
${item('people', 'People', 'Population, health, immigration, social mobility')}
${item('transport', 'Transport', 'Roads, driving, public transport, shipping')}
</div></div>
<div class="datagovuk-home-publications"><h2 class="govuk-heading-l">Updates</h2><div class="datagovuk-home-publications__items">
<div class="govuk-body datagovuk-home-publications__item"><a href="https://dataingovernment.blog.gov.uk/2026/03/25/whats-changing-on-data-gov-uk-and-why/" class="govuk-link">What's changing on data.gov.uk and why</a><p class="govuk-body">25 March 2026</p></div>
</div></div>
</div></main>
<footer class="govuk-footer"><a href="/accessibility">Accessibility</a></footer>
</body></html>`
    const out = extractTf.extract(html, { url: 'https://www.data.gov.uk/' })
    expect(out.escalate).toBe(false)
    expect(out.mainHtml).toContain('The home of UK public data')
    expect(out.mainHtml).toContain('Company information, prices, trade, economic indicators')
    expect(out.mainHtml).toContain('25 March 2026')
    expect(out.mainHtml).not.toContain('Who this manual is for')
  })

  it('still escalates a shell whose only list is a link-only menu', () => {
    // Menu items carry nothing but their link: navigation, not a listing.
    const menu = ['Products', 'Pricing', 'Customers', 'Careers', 'Contact'].map((name) => `<li><a href="/${name.toLowerCase()}">${name}</a></li>`).join('')
    for (const body of [
      `<div class="menu"><ul>${menu}</ul></div><div id="root"></div>`,
      `<div class="page"><h1>Dashboard</h1><div class="menu"><ul>${menu}</ul></div><div id="root">Loading…</div></div>`,
    ]) {
      const out = extractTf.extract(`<!doctype html><html><head><title>App</title></head><body>${body}</body></html>`)
      expect(out.escalate).toBe(true)
      expect(out.mainHtml).toBe('')
    }
  })

  it('keeps a page whose only paragraph sits directly in <body>', () => {
    // example.com's markup as served on 2026-09-29.
    const html = `<!doctype html><html lang=en><head><title>Example Domain</title></head><body><p>This domain is for use in documentation examples without needing permission. This is not a service, avoid relying on it for testing and monitoring purposes.</p><a href=https://iana.org/help/example-domains>Learn more</a></body></html>`
    const out = extractTf.extract(html)
    expect(out.escalate).toBe(false)
    expect(out.mainHtml).toContain('This domain is for use in documentation examples')
  })

  it('keeps a release held in one long <pre> inside nested wrappers', () => {
    const release = Array.from({ length: 12 }, (_, i) =>
      `Line ${i + 1}: Total nonfarm payroll employment increased by 162,000 in August, and the rate held at 4.1 percent.`).join('\n')
    const html = `<!doctype html><html><head><title>Employment Situation Summary</title></head><body>
<div class="helpFormSection"><p>Are you a survey respondent and need help submitting your data?</p></div>
<div class="helpFormSection"><p>Do you have questions about the monthly estimates?</p></div>
<div id="wrapper"><div id="main-content"><div id="bodytext"><div class="normalnews"><figure><pre>${release}</pre></figure></div></div></div></div>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('Line 12: Total nonfarm payroll employment')
    expect(out.mainHtml).not.toContain('survey respondent')
  })

  it('keeps the text of a filing laid out as divs around its tables, without its hidden XBRL header', () => {
    // An SEC EDGAR inline XBRL filing's shape (IREN's 10-Q, parity case A36):
    // XBRL facts in a hidden <div>, then the document as sibling <div>s of the
    // body, with no <p>, heading or list, tables with spacer cells, and notes
    // wrapped in inline ix: elements.
    const div = (text: string) => `<div style="margin-bottom:12pt;text-align:justify"><span style="font-size:10pt">${text}</span></div>`
    const table = (rows: string[][]) => `<div><table style="border-collapse:collapse;width:100%"><tr>${rows[0]!.map(() => '<td style="width:1%"></td>').join('')}</tr>` +
      rows.map((row) => `<tr>${row.map((cell) => `<td>${cell && `<span>${cell}</span>`}</td>`).join('')}</tr>`).join('') + '</table></div>'
    const html = `<?xml version='1.0' encoding='ASCII'?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance"><head><title>hkl-20251231</title></head><body>
<div style="display:none"><ix:header><ix:hidden><ix:nonNumeric name="dei:EntityCentralIndexKey" contextRef="c-1">0009990001</ix:nonNumeric></ix:hidden>
<ix:resources><xbrli:context id="c-1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0009990001</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-07-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context></ix:resources></ix:header></div>
<div style="text-align:center"><span style="font-weight:700">FORM <ix:nonNumeric name="dei:DocumentType" contextRef="c-1">10-Q</ix:nonNumeric></span></div>
<div style="text-align:center"><span style="font-weight:700"><ix:nonNumeric name="dei:EntityRegistrantName" contextRef="c-1">Harbour Kiln Limited</ix:nonNumeric></span></div>
${table([['x', 'QUARTERLY REPORT PURSUANT TO SECTION 13 OR 15(d)']])}
${div('Item 2. Management’s discussion and analysis of financial condition and results of operations.')}
${div('Revenue rose in the quarter because the second kiln line reached full output in October. The harbour office recorded every firing in its ledger.')}
${div('Operating costs rose less than revenue, as clay and fuel were bought under the contracts signed in the previous year.')}
${div('The Group expects to fund the third kiln line from cash on hand and from the credit facility described in Note 5.')}
${table([['', 'Three months ended', '', 'Six months ended'], ['', '2025', '2024', '2025', '2024'], ['Revenue', '1,204', '987', '2,318', '1,902'], ['Cost of revenue', '(611)', '(540)', '(1,190)', '(1,061)'], ['Net income', '402', '301', '768', '577']])}
<hr style="page-break-after:always"/>
<ix:nonNumeric name="us-gaap:SignificantAccountingPoliciesTextBlock" contextRef="c-1" escape="true">${div('Note 2. Summary of significant accounting policies')}
${div('The condensed financial statements were prepared on the same basis as the annual statements, and all normal recurring adjustments were made.')}
${div('Kiln equipment is depreciated on a straight-line basis over its useful life of twelve years.')}</ix:nonNumeric>
<div style="text-align:center"><span>7</span></div>
</body></html>`
    const out = extractTf.extract(html, { url: 'https://www.sec.gov/Archives/edgar/data/9990001/000999000126000001/hkl-20251231.htm' })
    const md = htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl })
    for (const text of [
      'Harbour Kiln Limited',
      'Revenue rose in the quarter because the second kiln line reached full output in October.',
      'the credit facility described in Note 5.',
      'Note 2. Summary of significant accounting policies',
      'useful life of twelve years.',
      '| Net income | 402 | 301 | 768 | 577 |',
    ]) expect(md).toContain(text)
    expect(md).not.toContain('0009990001')
    expect(md).not.toContain('2025-07-01')
    expect(out.mainHtml).not.toContain('0009990001')
    expect(out.strategy).toBe('article')
  })

  it('keeps a data table that a table viewer wraps in its form', () => {
    const rows = ['Canada', 'Ontario', 'Quebec', 'British Columbia'].map((geo, i) =>
      `<tr><th>${geo}</th><td>${(41_000_000 - i * 9_000_000).toLocaleString('en-US')}</td></tr>`).join('')
    const html = `<!doctype html><html><body><main>
<h1>Population estimates, quarterly</h1>
<form id="viewForm"><label for="ref">Reference period</label><select id="ref"><option>2026</option></select><button>Apply</button>
<div id="viewHtml"><table><thead><tr><th>Geography</th><th>July 1, 2026</th></tr></thead><tbody>${rows}</tbody></table></div>
</form></main></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('British Columbia')
    expect(out.mainHtml).toContain('14,000,000')
    expect(out.mainHtml).not.toContain('Apply')
  })

  it('still drops a short comment form', () => {
    const html = `<!doctype html><html><body><article>
<h1>Kiln temperatures</h1>
<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>
<form class="comment-form"><p>Leave a reply. Your email address will not be published.</p><textarea></textarea><button>Post comment</button></form>
</article></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The kiln reached 1240 degrees')
    expect(out.mainHtml).not.toContain('Leave a reply')
  })

  it('reads label/value pairs from two-cell rows and definition lists in the main content', () => {
    const html = `<!doctype html><html><body>
<aside><table><tr><th>Sidebar label</th><td>not main content</td></tr></table></aside>
<article><h1>A Light in the Attic</h1>
<p>A collection of poems and line drawings for readers of every age, reissued as an anniversary edition.</p>
<table class="table table-striped">
<tr><th>UPC</th><td>a897fe39b1053632</td></tr>
<tr><th>Price (excl. tax)</th><td>£51.77</td></tr>
<tr><th>Availability</th>
<td>In stock
  (22 available)</td></tr>
</table>
<table><tr><th>Year</th><th>Copies</th></tr><tr><th>2023</th><td>12</td><td>14</td></tr><tr><td>Reprint</td><td>yes</td></tr></table>
<dl><div><dt>Unit</dt><dd>tonnes per person</dd></div><div><dt>Date range</dt><dd>1750-2024</dd></div><dt>Managed by</dt><dd>Pablo</dd><dd>Hannah</dd></dl>
</article></body></html>`
    expect(extractTf.extract(html).labelledValues).toEqual([
      { label: 'UPC', value: 'a897fe39b1053632', path: 'table[0] tr[0]' },
      { label: 'Price (excl. tax)', value: '£51.77', path: 'table[0] tr[1]' },
      { label: 'Availability', value: 'In stock (22 available)', path: 'table[0] tr[2]' },
      { label: 'Unit', value: 'tonnes per person', path: 'dl[0] dt[0]' },
      { label: 'Date range', value: '1750-2024', path: 'dl[0] dt[1]' },
    ])
    expect(extractTf.extract('<!doctype html><html><body><div id="root"></div></body></html>').labelledValues).toEqual([])
  })

  it('counts tables whose rows a script has yet to fill', () => {
    const html = `<!doctype html><html><body><main><h1>Population estimates, quarterly</h1>
<p>Table 17-10-0009-01. Release date 2026-09-23. Frequency: quarterly. Geography: Canada, province or territory.</p>
<table id="simpleTable"><thead id="simpleTableHeader"></thead><tbody id="simpleTableBody"></tbody></table>
</main></body></html>`
    expect(extractTf.extract(html).emptyTableShells).toBe(1)
    expect(extractTf.extract(ARTICLE).emptyTableShells).toBe(0)
  })

  it('counts data the page declares its scripts will fetch', () => {
    // ourworldindata.org's table view: the server renders the description and
    // a picture of the chart; the table is built from the preloaded JSON.
    const html = `<!doctype html><html><head><title>CO₂ emissions per capita | Our World in Data</title>
<link rel="preload" href="https://api.ourworldindata.org/v1/indicators/1119914.data.json" as="fetch" crossorigin="anonymous"/>
<link rel="preload" href="/fonts/LatoLatin-Regular.woff2" as="font" type="font/woff2" crossorigin="anonymous"/>
<link rel="modulepreload" href="/assets/owid.mjs"/><link rel="stylesheet" href="/assets/owid.css"/>
</head><body><main><figure class="chart"><picture><img src="/grapher/co-emissions-per-capita.png?tab=table" width="850" height="600" loading="lazy"/></picture></figure>
<h2>CO₂ emissions per capita</h2><p>Carbon dioxide emissions from burning fossil fuels and industrial processes. This includes emissions from transport, electricity generation, and heating, but not land-use change.</p>
</main></body></html>`
    expect(extractTf.extract(html).fetchPreloads).toBe(1)
    expect(extractTf.extract(ARTICLE).fetchPreloads).toBe(0)
  })

  it('flags a table shell beside scripts as client-rendered, not a static empty table', () => {
    // A statistics table viewer (StatCan): prose, a table whose rows a script
    // fills in after load, and the viewer's scripts.
    const prose = '<p>The table below lists the monthly consumer price index by geography and product group for the reference period.</p>'
    const shell = `<!doctype html><html><body><main><h1>Table 18-10-0006-01</h1>${prose}<table id="grid"><thead><tr></tr></thead><tbody><tr></tr></tbody></table><script>${'y'.repeat(1_500)}</script></main></body></html>`
    expect(extractTf.extract(shell).render).toMatchObject({ clientRendered: true, reason: 'empty_table_with_scripts', emptyTables: 1, scriptChars: 1_500 })

    const stat = `<!doctype html><html><body><article><h1>Empty table</h1>${prose}<table></table><p>Text after the table.</p></article></body></html>`
    expect(extractTf.extract(stat).render).toMatchObject({ clientRendered: false, reason: null, emptyTables: 1, scriptChars: 0, markers: [] })
  })

  it('flags an explicit JavaScript fallback when script outweighs text', () => {
    // ourworldindata.org's grapher: a fallback picture the page hides once
    // its scripts run, beside the chart's configuration blob.
    const html = `<!doctype html><html><body><main><h1>Emissions per capita</h1>
<p>Carbon dioxide emissions per person, measured in tonnes per year across the selected countries.</p>
<figure class="GrapherWithFallback__fallback"><picture class="js--hide-if-js-enabled"><img src="/fallback.png" alt=""></picture></figure>
<script>window._OWID_GRAPHER_CONFIG = {${'"k":1,'.repeat(300)}"tab":"table"}</script>
</main></body></html>`
    const out = extractTf.extract(html)
    expect(out.render).toMatchObject({ clientRendered: true, reason: 'js_fallback', markers: ['hydration_state', 'js_fallback_marker'] })
    expect(out.escalate).toBe(false)
  })

  describe('a small product page whose options are controls', () => {
    // webscraper.io's test shop: a microdata product with a price, a name, a
    // one-line description, HDD sizes as swatch buttons, and 2 KB of inline
    // script for its widgets. Everything it shows is in the server HTML.
    const SCRIPT = `<script>${'window.dataLayer = window.dataLayer || []; '.repeat(55)}</script>`
    const product = (options: string) => `<!doctype html><html><head><title>Asus VivoBook</title></head><body>
<nav class="navbar"><a href="/">Web Scraper</a> <a href="/cloud">Cloud</a> <a href="/pricing">Pricing</a></nav>
<main><div class="card thumbnail" itemscope itemtype="https://schema.org/Product"><div class="caption">
<h4 class="price" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="price">$295.99</span><meta itemprop="priceCurrency" content="USD"></h4>
<h4 class="title" itemprop="name">Asus VivoBook X441NA-GA190</h4>
<p class="description" itemprop="description">Asus VivoBook X441NA-GA190 Chocolate Black, 14", Celeron N3450, 4GB, 128GB SSD, Endless OS</p></div>
${options}
<p class="review-count"><span itemprop="reviewCount">14</span> reviews</p></div></main>${SCRIPT}</body></html>`
    const swatches = '<label class="memory">HDD:</label><div class="swatches"><button type="button" class="btn swatch active" value="128">128</button><button type="button" class="btn swatch" value="256">256</button><button type="button" class="btn swatch" value="512">512</button><button type="button" class="btn swatch disabled" value="1024">1024</button></div>'

    it('keeps the option values a product shows as buttons', () => {
      const out = extractTf.extract(product(swatches))
      expect(out.pageType).toBe('product')
      expect(htmlToMarkdown(out.mainHtml)).toContain('128, 256, 512, 1024')
      expect(out.mainHtml).not.toContain('<button')
    })

    // WooCommerce's variation form: the picker is a table inside the add-to-cart form.
    const cartForm = (cells: string) => `<form class="variations_form cart" action="/cart/"><table class="variations"><tr><th class="label">${cells.split('|')[0]}</th><td class="value">${cells.split('|')[1]}</td></tr></table><button type="submit">Add to cart</button></form>`

    it('keeps the choices of a select, without its placeholder', () => {
      const select = cartForm('<label for="size">Size</label>|<select id="size" name="attribute_size"><option value="">Choose an option</option><option value="S">S</option><option value="M">M</option><option value="L">L</option></select>')
      const out = extractTf.extract(product(select))
      expect(htmlToMarkdown(out.mainHtml)).toContain('S, M, L')
      expect(out.mainHtml).not.toContain('Choose an option')
    })

    it('leaves a quantity picker out, and keeps a link after a select apart from its values', () => {
      const quantity = cartForm('<label for="qty">Quantity</label>|<select id="qty" name="quantity">' + Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('') + '</select>')
      expect(htmlToMarkdown(extractTf.extract(product(quantity)).mainHtml)).not.toContain('1, 2, 3')
      const padded = cartForm('<label for="qty">Qty</label>|<select id="qty" name="qty">' + Array.from({ length: 10 }, (_, i) => `<option>${String(i + 1).padStart(2, '0')}</option>`).join('') + '</select>')
      expect(htmlToMarkdown(extractTf.extract(product(padded)).mainHtml)).not.toContain('01, 02, 03')
      // Named for nothing but its place in the add-to-cart form.
      const colour = cartForm('<label for="color">Color</label>|<select id="color" name="pa_colour"><option value="">Choose an option</option><option value="blue">Blue</option><option value="red">Red</option></select><a class="reset_variations" href="#">Clear</a>')
      expect(htmlToMarkdown(extractTf.extract(product(colour)).mainHtml)).toContain('Blue, Red [Clear](#)')
    })

    it('leaves a product page\'s other labelled controls out: review sorting, dates, a player\'s settings', () => {
      // Amazon's product pages carry a gift-date picker and a video player's caption settings; any shop, a review sort.
      const others = [
        '<section class="reviews"><h2>Reviews</h2><label for="sort">Sort by</label><select id="sort"><option>Most recent</option><option>Highest rated</option><option>Lowest rated</option></select></section>',
        '<div class="delivery"><select id="onlineMonth" aria-label="Select Month">' + Array.from({ length: 12 }, (_, i) => `<option>${String(i + 1).padStart(2, '0')}</option>`).join('') + '</select></div>',
        '<div role="dialog" class="captions"><label for="fg">Color</label><select id="fg"><option>White</option><option>Black</option><option>Red</option></select></div>',
        '<section class="reviews"><label>Filter:</label><div class="review-filters"><button type="button">All stars</button><button type="button">5 stars</button><button type="button">4 stars</button></div></section>',
      ]
      for (const other of others) {
        const markdown = htmlToMarkdown(extractTf.extract(product(swatches + other)).mainHtml)
        expect(markdown).toContain('128, 256, 512, 1024')
        for (const noise of ['Most recent, Highest rated', '01, 02, 03', 'White, Black, Red', 'All stars, 5 stars']) expect(markdown).not.toContain(noise)
      }
    })

    it('leaves a product page\'s unlabelled buttons out', () => {
      const out = extractTf.extract(product('<div class="actions"><button type="button">Add to cart</button><button type="button">Buy now</button></div>'))
      expect(out.mainHtml).not.toContain('Add to cart')
    })

    it('does not read the page for a shell: its declared product is what it shows', () => {
      const out = extractTf.extract(product(swatches))
      expect(out.render).toMatchObject({ clientRendered: false, reason: null })
    })

    it('leaves controls out of a page that is not a product page', () => {
      const prose = Array.from({ length: 4 }, (_, i) => `<p>Paragraph ${i + 1}: the survey covers forty villages and three hundred households in the upper valley over two winters.</p>`).join('')
      const out = extractTf.extract(`<!doctype html><html><body><article><h1>Survey</h1>${prose}<label>Sort:</label><div class="sort"><button>Newest</button><button>Oldest</button></div><select><option>English</option><option>Deutsch</option></select></article></body></html>`)
      expect(out.pageType).toBe('article')
      expect(out.mainHtml).not.toContain('Newest')
      expect(out.mainHtml).not.toContain('Deutsch')
    })

    it('still reads a product page with nothing of its product shown for a shell', () => {
      // The product is declared, but its name and price are not in what was extracted: scripts draw them.
      const html = `<!doctype html><html><head><title>Item</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Cobalt teapot","offers":{"@type":"Offer","price":"84.00","priceCurrency":"USD"}}</script></head><body><main><h1>Our shop</h1><p>Please wait while we load the details of this item for you.</p></main>${SCRIPT}</body></html>`
      expect(extractTf.extract(html).render).toMatchObject({ clientRendered: true, reason: 'script_shell' })
    })
  })

  it('still escalates a script shell and flags it as client-rendered', () => {
    const html = `<!doctype html><html><body><div id="root">Loading…</div><script>${'x'.repeat(3_000)}</script></body></html>`
    const out = extractTf.extract(html)
    expect(out.escalate).toBe(true)
    expect(out.mainHtml).toBe('')
    expect(out.render).toMatchObject({ clientRendered: true, reason: 'empty_app_root', markers: ['app_root_empty'] })
  })

  it('does not take a long static page with a noscript notice for a shell', () => {
    // GOV.UK's reports carry a generic "enable JavaScript" line beside their
    // analytics scripts: a notice alone counts only on a thin page.
    const paragraph = (i: number) => `<p>Paragraph ${i}: household consumption in the region rose in the quarter, led by spending on transport and recreation, while spending on housing was flat.</p>`
    const page = (paragraphs: number) => `<!doctype html><html><body><noscript><p>Please enable JavaScript to use this site.</p></noscript>
<main><h1>Subnational consumption</h1>${Array.from({ length: paragraphs }, (_, i) => paragraph(i + 1)).join('\n')}</main>
<script>${'z'.repeat(6_000)}</script></body></html>`
    const report = extractTf.extract(page(30)).render
    expect(report).toMatchObject({ clientRendered: false, reason: null, markers: ['noscript_notice'], scriptChars: 6_000 })
    expect(report?.textChars).toBeGreaterThan(1_500)
    // The same notice on a thin page is what a script-filled shell looks like.
    expect(extractTf.extract(page(3)).render).toMatchObject({ clientRendered: true, reason: 'js_fallback' })
  })

  describe('a listing whose own data lists more records than its markup shows', () => {
    // A Walmart category page: the server draws the first few product tiles,
    // and __NEXT_DATA__ lists the whole page of products the scripts draw next.
    const TOOLS = Array.from({ length: 16 }, (_, i) => `Cedar Ridge Garden Trowel Model ${i + 1}`)
    const card = (name: string, i: number) => `<li class="tile"><a href="/ip/${i + 1}">${name}</a><span class="price">$${12 + i}.99</span><span>4.${i % 10} out of 5 stars</span><div>Forged stainless steel blade with depth markings, a sealed ash handle and a hanging loop. Free shipping, arrives in 3+ days; free pickup today at your store.</div></li>`
    const listing = (shown: number, data: unknown) => `<!doctype html><html><head><title>Garden tools</title></head><body>
<nav class="site-nav"><a href="/">Home</a> <a href="/garden">Garden</a></nav>
<main><h1>Garden tools (16)</h1><div class="intro">Trowels, transplanters and weeders for beds, borders and containers. Prices shown are online prices and may differ in store; availability depends on your pickup store and delivery address.</div><ul class="grid">${TOOLS.slice(0, shown).map(card).join('')}</ul></main>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>
</body></html>`
    const products = (names: readonly string[]) => ({ props: { pageProps: { search: { items: names.map((name, i) => ({ id: `${i + 1}`, name, price: 12 + i })) } } } })

    it('flags the listing as client-rendered and counts the records', () => {
      const out = extractTf.extract(listing(4, products(TOOLS)))
      expect(['listing', 'collection']).toContain(out.pageType)
      expect(out.escalate).toBe(false)
      expect(out.render).toMatchObject({ clientRendered: true, reason: 'hydration_list_partial', listRecords: { declared: 16, shown: 4 } })
    })

    it('does not flag it when the markup shows more than half the records the data lists', () => {
      // A page that shows 9 or more of these tiles routes as an article, so the
      // detector is called as a listing directly, at the half-way boundary.
      const signals = (shown: number) => {
        const doc = parse(listing(shown, products(TOOLS)))
        const raw = rawSignals(doc.document)
        cleanTree(doc.document)
        pruneTree(doc.document)
        const render = detectRenderSignals(raw, doc.document, { listing: true })
        doc.close()
        return render
      }
      expect(signals(8)).toMatchObject({ clientRendered: true, reason: 'hydration_list_partial', listRecords: { declared: 16, shown: 8 } })
      expect(signals(9)).toMatchObject({ clientRendered: false, reason: null })
      expect(signals(9).listRecords).toBeUndefined()
      expect(signals(16)).toMatchObject({ clientRendered: false, reason: null })
    })

    it('does not flag data the page never shows, or shows only a record or two of', () => {
      // Menus, facets and settings a page carries for its scripts.
      const menu = TOOLS.map((name) => name.replace('Garden Trowel', 'Department Menu'))
      expect(extractTf.extract(listing(4, products(menu))).render).toMatchObject({ clientRendered: false, reason: null })
      const two = [...TOOLS.slice(0, 2), ...menu.slice(2)]
      expect(extractTf.extract(listing(4, products(two))).render).toMatchObject({ clientRendered: false, reason: null })
    })

    it('does not flag an article whose data lists more related posts than it shows', () => {
      const posts = TOOLS.map((name) => `${name}: a field review`)
      const prose = Array.from({ length: 6 }, (_, i) => `<p>Paragraph ${i + 1}: the trowel held its edge through a season of clay soil, and the handle did not split after the first frost.</p>`).join('')
      const html = `<!doctype html><html><head><title>Trowel review</title></head><body><main><article><h1>Trowel review</h1>${prose}
<h2>Related</h2><ul>${posts.slice(0, 4).map((name, i) => `<li><a href="/r/${i}">${name}</a></li>`).join('')}</ul></article></main>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(products(posts))}</script></body></html>`
      const out = extractTf.extract(html)
      expect(out.pageType).toBe('article')
      expect(out.render).toMatchObject({ clientRendered: false, reason: null })
    })
  })

  it('filters link-farm paragraphs by link density', () => {
    const html = `<!doctype html><html><body><article>
<h1>Directory</h1>
<p><a href="/a">Alpha link one</a> <a href="/b">Beta link two</a> <a href="/c">Gamma link three</a></p>
<p>This paragraph carries real prose about the harbour and its many lighthouses that guide ships home.</p>
</article></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('real prose about the harbour')
  })

  it('favorPrecision and favorRecall pick different containers', () => {
    // <article> holds several short blocks (below the precision threshold but
    // above the recall threshold); a div holds one long block. Under
    // favorPrecision the short blocks are filtered out and the div wins;
    // under favorRecall the article's semantic bonus dominates.
    const html = `<!doctype html><html><body>
<article><h1>Fragments</h1>
<p>Short observation number one here.</p>
<p>Short observation number two here.</p>
<p>Short observation number three here.</p>
</article>
<div><p>This is a properly long paragraph with real prose content that should dominate precision filtering without any trouble at all.</p></div>
</body></html>`
    const precise = extractTf.extract(html, { favorPrecision: true })
    const recalled = extractTf.extract(html, { favorRecall: true })
    expect(precise.mainHtml).toContain('dominate precision filtering')
    expect(recalled.mainHtml).toContain('Short observation number one')
  })

  it('leaves out what a browser capture marked hidden', () => {
    const menu = 'The collapsed mobile menu repeats every section title of the site in long sentences that no reader of the desktop page sees.'
    const html = `<!doctype html><html><body>
<div class="menu" data-w2l-hidden=""><p>${menu}</p><p>${menu}</p><p>${menu}</p></div>
<div class="report"><p>The survey covers forty villages and three hundred households in the upper valley.</p></div>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The survey covers forty villages')
    expect(out.mainHtml).not.toContain('collapsed mobile menu')
    // Unmarked HTML (every lane but the browser's) still chooses by text alone.
    expect(extractTf.extract(html.replace(' data-w2l-hidden=""', '')).mainHtml).toContain('collapsed mobile menu')
  })

  it('applies caller prune selectors', () => {
    const html = `<!doctype html><html><body><article>
<h1>Report</h1>
<p class="sponsor-note">Brought to you by our generous sponsor.</p>
<p>The harbour master recorded the tides every hour without exception through the winter months.</p>
</article></body></html>`
    const out = extractTf.extract(html, { pruneSelectors: ['.sponsor-note'] })
    expect(out.mainHtml).not.toContain('generous sponsor')
    expect(out.mainHtml).toContain('harbour master recorded the tides')
  })
})

// includeSelectors (the API's includeTags), and the whole page as the html format returns it.
describe('extractTf selection and whole page', () => {
  const PAGE = `<!doctype html><html class="js"><head><title>Kiln archive | Harbour office</title></head><body class="home">
<header><h1>Kiln archive</h1><nav><a href="/a">Home</a></nav></header>
<article><p>The kiln reached 1240 degrees before the glaze vitrified, and every reading was logged in the harbour office ledger.</p>
<table id="readings"><tr><th>Station</th><th>Flow</th></tr><tr><td>Meridian</td><td>41 <sup class="ref">[1]</sup></td></tr></table>
<form><label>Search the archive</label><input name="q"><button>Go</button></form></article>
<table id="legend"><tr><th>Key</th><th>Meaning</th></tr><tr><td>*</td><td>estimate</td></tr></table>
<footer><p>Copyright 2026</p></footer><script>var never = "shown"</script></body></html>`

  it('reduces the page to the included selectors, in document order, and returns that selection whole', () => {
    const out = extractTf.extract(PAGE, { includeSelectors: ['table', 'html.js h1'], pruneSelectors: ['#legend', 'td .ref'] })
    // The <tbody> a browser opens for rows written directly in the table.
    expect(out.mainHtml).toBe('<body><h1>Kiln archive</h1><table id="readings"><tbody><tr><th>Station</th><th>Flow</th></tr><tr><td>Meridian</td><td>41 </td></tr></tbody></table></body>')
    expect(htmlToMarkdown(out.mainHtml)).toBe('# Kiln archive\n\n| Station | Flow |\n| --- | --- |\n| Meridian | 41 |')
    // Exclusions are matched against the whole page too: the footer's paragraph is named by where it was,
    // and an excluded element takes the named elements inside it along.
    for (const excluded of ['footer p', 'footer', 'html > body > footer']) {
      expect(extractTf.extract(PAGE, { includeSelectors: ['p'], pruneSelectors: [excluded] }).mainHtml, excluded)
        .toBe('<body><p>The kiln reached 1240 degrees before the glaze vitrified, and every reading was logged in the harbour office ledger.</p></body>')
    }
    expect(extractTf.extract(PAGE, { includeSelectors: ['p', 'td'], pruneSelectors: ['article', '#legend tr'] }).mainHtml).toBe('<body><p>Copyright 2026</p></body>')
    expect(extractTf.extract(PAGE, { includeSelectors: ['body'], pruneSelectors: ['html'] }).mainHtml).toBe('')
    expect(extractTf.extract(PAGE, { includeSelectors: ['p'], pruneSelectors: ['body'] }).mainHtml).toBe('')
    // The page itself is still read for its type and metadata.
    expect(out).toMatchObject({ confidence: 1, escalate: false, pageType: 'article', metadata: { title: 'Kiln archive | Harbour office' } })
    // The same page without the option is unchanged: its main content, not the selection.
    expect(extractTf.extract(PAGE).mainHtml).toContain('glaze vitrified')
  })

  it('keeps a named navigation, an element inside another named one once, and everything when the body is named', () => {
    expect(extractTf.extract(PAGE, { includeSelectors: ['nav'] }).mainHtml).toBe('<body><nav><a href="/a">Home</a></nav></body>')
    const nested = extractTf.extract(PAGE, { includeSelectors: ['#readings', 'article'] }).mainHtml
    expect(nested.match(/Meridian/g)).toHaveLength(1)
    expect(nested).toContain('glaze vitrified')
    // Scripts and form controls are never shown, in a selection either.
    expect(nested).toContain('<form><label>Search the archive</label></form>')
    const everything = extractTf.extract(PAGE, { includeSelectors: ['body'] }).mainHtml
    for (const text of ['Kiln archive', 'Home', 'Meridian', 'estimate', 'Copyright 2026']) expect(everything).toContain(text)
    expect(everything).not.toContain('never')
  })

  it('gives an empty selection as an empty answer, and leaves escalate the page\'s own signal', () => {
    // The page has main content: nothing named is an empty answer, and nothing asks for a browser render.
    const none = extractTf.extract(PAGE, { includeSelectors: ['.does-not-exist'] })
    expect(none).toMatchObject({ mainHtml: '', escalate: false })
    expect(none.confidence).toBe(extractTf.extract(PAGE).confidence)
    // A page with no main content says so with or without a selection: a lane blocks it on its gate and offers it to the browser.
    const shell = '<!doctype html><html><body><div id="root"></div></body></html>'
    expect(extractTf.extract(shell).escalate).toBe(true)
    expect(extractTf.extract(shell, { includeSelectors: ['table'] })).toMatchObject({ mainHtml: '', escalate: true })
    // Its empty root, when named, is returned, and says no more about the page than no match does.
    expect(extractTf.extract(shell, { includeSelectors: ['#root'] })).toMatchObject({ mainHtml: '<body><div id="root"></div></body>', escalate: true, confidence: 0 })
  })

  it('matches exclusions against the page as it was received, for the main content as for the whole page', () => {
    // A page whose form wraps its content, as an ASP.NET page's does: cleaning unwraps the form.
    const prose = 'The harbour office records tide height, wind and visibility for every hour of the day. '.repeat(5)
    const page = `<!doctype html><html><body><form id="aspnetForm"><div class="wrap"><h1>Report</h1><p>${prose}</p>
<table class="filters"><tr><td>Filter A</td><td>Filter B</td></tr></table>
<table class="data"><tr><th>Station</th><th>Flow</th></tr><tr><td>Meridian</td><td>41</td></tr></table></div></form></body></html>`
    expect(extractTf.extract(page).mainHtml).toContain('Filter A')
    for (const selector of ['table.filters', 'form table.filters', '#aspnetForm > .wrap > .filters', 'body > form .filters']) {
      const main = extractTf.extract(page, { pruneSelectors: [selector] }).mainHtml
      expect(main, selector).toContain('Meridian')
      expect(main, selector).not.toContain('Filter A')
      expect(wholePageBody(page, [selector]), selector).not.toContain('Filter A')
      expect(htmlToMarkdown(page, { exclude: [selector] }), selector).not.toContain('Filter A')
    }
    // An excluded form goes with all it holds, although cleaning would unwrap it; so does the page with its root element.
    for (const selector of ['#aspnetForm', 'html', '*']) {
      expect(extractTf.extract(page, { pruneSelectors: [selector] }), selector).toMatchObject({ mainHtml: '', escalate: true })
      expect(htmlToMarkdown(page, { exclude: [selector] }), selector).toBe('')
      expect(wholePageBody(page, [selector]), selector).not.toContain('Report')
    }
  })

  it('wholePageBody keeps header, navigation and footer, and leaves out exclusions and what Markdown never shows', () => {
    const whole = wholePageBody(PAGE, ['nav', '#legend', 'html.js td .ref'])
    expect(whole.startsWith('<body class="home">')).toBe(true)
    for (const text of ['<h1>Kiln archive</h1>', 'glaze vitrified', '<td>41 </td>', '<label>Search the archive</label>', '<footer><p>Copyright 2026</p></footer>']) expect(whole).toContain(text)
    for (const text of ['Home', 'estimate', '[1]', '<script', '<input', '<button', 'never']) expect(whole).not.toContain(text)
    // It is the HTML the whole-page Markdown with the same exclusions is written from.
    expect(htmlToMarkdown(whole)).toBe(htmlToMarkdown(PAGE, { exclude: ['nav', '#legend', 'html.js td .ref'] }))
    expect(wholePageBody(PAGE)).toContain('<nav><a href="/a">Home</a></nav>')
  })

  it('returns HTML without the layout markers of a browser capture', () => {
    const marked = '<!doctype html><html><body><main><div class="quote"><span class="text" data-w2l-display="block">“The world as we have created it.”</span><span>by Albert Einstein</span></div>' +
      '<p>Open <span>Terminal</span><span data-w2l-hidden="">Git Bash</span>, as the harbour office manual describes for every new workstation.</p></main></body></html>'
    const main = extractTf.extract(marked).mainHtml
    expect(main).toContain('data-w2l-display="block"')
    expect(withoutLayoutMarkers(main)).toBe(main.replace(' data-w2l-display="block"', ''))
    const whole = wholePageBody(marked)
    expect(whole).toContain('<span class="text">“The world as we have created it.”</span>')
    expect(whole).not.toContain('data-w2l')
    expect(whole).not.toContain('Git Bash')
    // Text that only mentions a marker is content, and unmarked HTML is returned as it is.
    const mention = '<p>Set <code>data-w2l-display="block"</code> on the copy.</p>'
    expect(withoutLayoutMarkers(mention)).toBe(mention)
  })

  it('reads a selector it cannot use as naming nothing, in includeSelectors and pruneSelectors alike', () => {
    // The API refuses these by name; a caller that passes one anyway gets no match, never unbounded matching.
    expect(extractTf.extract(PAGE, { includeSelectors: ['tr:first-child', 'h1 ~ nav', 'div[['] }).mainHtml).toBe('')
    expect(extractTf.extract(PAGE, { pruneSelectors: ['article p:first-child', 'table:has(sup)'] }).mainHtml).toContain('glaze vitrified')
    expect(wholePageBody(PAGE, ['header ~ article'])).toContain('glaze vitrified')
  })

  it('removes ad containers and cookie banners by default and keeps them with blockAds: false, never touching a "download" class', () => {
    const prose = 'The kiln reached 1240 degrees before the glaze vitrified, and every reading was logged in the ledger kept by the harbour office for the whole season.'
    const html = `<!doctype html><html><head><title>Kiln report</title></head><body><main>
<div id="cookie-consent" role="dialog"><p>We use cookies to personalise content.</p></div>
<h1>Kiln report</h1>
<p>${prose}</p>
<div class="advertisement"><p>Advertisement: buy the almanac.</p></div>
<p>Sediment cores from the estuary date to 1873, and researchers compared them against the almanac kept at the plinth house through the winter.</p>
<div id="ad-slot"><p>Sponsored slot.</p></div>
<p class="download">Download the report as PDF.</p>
</main></body></html>`
    const pruned = extractTf.extract(html)
    expect(pruned.mainHtml).toContain(prose)
    expect(pruned.mainHtml).toContain('Download the report as PDF.')
    for (const gone of ['Advertisement: buy', 'Sponsored slot', 'We use cookies']) expect(pruned.mainHtml).not.toContain(gone)
    expect(extractTf.extract(html, { blockAds: true }).mainHtml).toBe(pruned.mainHtml)
    const kept = extractTf.extract(html, { blockAds: false })
    expect(kept.mainHtml).toContain(prose)
    for (const stays of ['Advertisement: buy', 'Sponsored slot', 'We use cookies', 'Download the report as PDF.']) expect(kept.mainHtml).toContain(stays)
    // The structural cleaning is not the switch's: scripts and navigation go either way, and a caller's own exclusions still apply.
    const chrome = `<!doctype html><html><body><nav><a href="/">Home</a></nav><main><h1>Kiln report</h1><p>${prose}</p><div class="promo"><p>Promo box.</p></div><script>var x = 1</script></main></body></html>`
    const loose = extractTf.extract(chrome, { blockAds: false, pruneSelectors: ['.promo'] })
    expect(loose.mainHtml).not.toContain('Home')
    expect(loose.mainHtml).not.toContain('var x')
    expect(loose.mainHtml).not.toContain('Promo box')
    expect(extractTf.extract(chrome, { blockAds: false }).mainHtml).toContain('Promo box')
  })

  it('reads a document without <html> as it reads it with one', () => {
    const page = '<head><title>Kiln log</title></head><body><article><h1>Kiln log</h1>' +
      '<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>' +
      '<table><tr><td>Firing</td><td>Peak</td></tr><tr><td>1</td><td>1240</td></tr></table></article></body>'
    const bare = extractTf.extract(`<!doctype html>${page}`)
    const full = extractTf.extract(`<!doctype html><html>${page}</html>`)
    expect(bare.title).toBe('Kiln log')
    expect(bare.mainHtml).toContain('The kiln reached 1240 degrees')
    expect(htmlToMarkdown(bare.mainHtml)).toContain('| Firing | Peak |')
    expect({ ...bare, timings: undefined }).toEqual({ ...full, timings: undefined })
    expect(extractTf.extract('<!doctype html><body><p>Only a body here, with a sentence long enough to be read as content.</p></body>').mainHtml)
      .toContain('Only a body here')
  })

  it('keeps the main content after a <head> tag in the body', () => {
    const html = '<!doctype html><html><head><title>Kiln log</title></head><body><article><h1>Kiln log</h1><head/>' +
      '<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>' +
      '<p>Sediment cores from the estuary date to 1873. Researchers compared them against the almanac kept at the plinth house.</p></article></body></html>'
    const md = htmlToMarkdown(extractTf.extract(html).mainHtml)
    expect(md).toContain('The kiln reached 1240 degrees')
    expect(md).toContain('Sediment cores from the estuary')
  })
})

describe('parse', () => {
  it('reads a <head> inside the body as a browser does also on a page past the parse5 budget, read by linkedom', async () => {
    const { htmlToMarkdown: markdown } = await import('../src/index.js')
    // One tag of 300 attributes sends the page to linkedom's parser.
    const wide = `<div ${Array.from({ length: 300 }, (_, k) => `data-k${k}="v"`).join(' ')}>config</div>`
    expect(markdown(`<head/><p>Some text</p>${wide}`)).toBe('Some text\n\nconfig')
    expect(markdown(`<head><title>T</title><p>Para one.</p>${wide}`)).toBe('Para one.\n\nconfig')
    expect(markdown(`<!doctype html><head><title>T</title><p>Para one.</p>${wide}`)).toBe('Para one.\n\nconfig')
    expect(markdown(`<!doctype html><html><body><article><p>a<head/>b</p><p>c</p></article>${wide}</body></html>`)).toBe('ab\n\nc\n\nconfig')
  })

  it('copies a page parsed again from the tree it built, each document its own', async () => {
    const { parse } = await import('../src/dom.js')
    const page = '<!doctype html><html><body><b>1<p>2</b>3</p><table><tr><td>a</td></tr></table></body></html>'
    const first = parse(page).document
    first.body.innerHTML = ''
    const second = parse(page).document
    expect(second.body.innerHTML).toBe('<b>1</b><p><b>2</b>3</p><table><tbody><tr><td>a</td></tr></tbody></table>')
    expect(first.body.innerHTML).toBe('')
  })

  it('builds each of two pages read by turns once (the rendered page and the body as received)', async () => {
    const { parse } = await import('../src/dom.js')
    const { Parser } = await import('parse5')
    const built = vi.spyOn(Parser, 'parse')
    try {
      const rendered = '<!doctype html><html><body><main><p>rendered</p></main></body></html>'
      const received = '<!doctype html><html><body><main><p>received</p></main></body></html>'
      for (let i = 0; i < 3; i++) {
        expect(parse(rendered).document.body.innerHTML).toBe('<main><p>rendered</p></main>')
        expect(parse(received).document.body.innerHTML).toBe('<main><p>received</p></main>')
      }
      expect(built).toHaveBeenCalledTimes(2)
    } finally {
      built.mockRestore()
    }
  })

  it('reads a page the same way every time, also when its <noscript> goes past the budget', async () => {
    const { htmlToMarkdown } = await import('../src/index.js')
    let noscript = ''
    for (let i = 0; i < 200; i++) noscript += `<b a=${i}>`
    for (let i = 0; i < 200; i++) noscript += `<p>x${i}`
    const page = `<!doctype html><html><body><div><b>1<p>2</b>3</p></div>${'<i>a</i>'.repeat(46)}<noscript>${noscript}</noscript></body></html>`
    expect(htmlToMarkdown(page)).toBe(htmlToMarkdown(page))
  })
})
