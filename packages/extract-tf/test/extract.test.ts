import { describe, expect, it } from 'vitest'
import { extractTf } from '../src/index.js'

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
    expect(out.mainHtml).toContain('This is a demo website')
    expect(out.mainHtml).toContain('Wall and Piece')
    expect(out.mainHtml).toContain('£44.46')
    expect(out.mainHtml).not.toContain('Mystery')
    expect(out.mainHtml).not.toContain('We love being scraped')
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

  it('counts tables whose rows a script has yet to fill', () => {
    const html = `<!doctype html><html><body><main><h1>Population estimates, quarterly</h1>
<p>Table 17-10-0009-01. Release date 2026-09-23. Frequency: quarterly. Geography: Canada, province or territory.</p>
<table id="simpleTable"><thead id="simpleTableHeader"></thead><tbody id="simpleTableBody"></tbody></table>
</main></body></html>`
    expect(extractTf.extract(html).emptyTableShells).toBe(1)
    expect(extractTf.extract(ARTICLE).emptyTableShells).toBe(0)
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
