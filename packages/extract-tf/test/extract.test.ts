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

  it('drops ARIA landmarks and hidden elements like their tag equivalents', () => {
    const html = `<!doctype html><html><body>
<div role="banner"><a href="/">Site home</a> <a href="/about">About the site</a></div>
<main>
<h1>Kiln temperatures</h1>
<div role="navigation" class="navbox"><table><tr><td><a href="/a">Related list A</a> <a href="/b">Related list B</a></td></tr></table></div>
<p aria-hidden="true">Decorative icon label text here.</p>
<div hidden><p>Hidden draft paragraph that nobody sees on the page.</p></div>
<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>
<p>Sediment cores from the estuary date to 1873. Researchers compared them against the almanac kept at the plinth house.</p>
</main>
<div role="contentinfo"><p>Copyright 2026 Synthetic Fixture Co. All rights reserved.</p></div>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The kiln reached 1240 degrees')
    expect(out.mainHtml).not.toContain('Related list A')
    expect(out.mainHtml).not.toContain('Decorative icon')
    expect(out.mainHtml).not.toContain('Hidden draft')
    expect(out.mainHtml).not.toContain('About the site')
    expect(out.mainHtml).not.toContain('Copyright 2026')
  })

  it('prunes menu-sized bare-link lists from an article region but keeps them on a listing page', () => {
    const menu = Array.from({ length: 20 }, (_, i) => `<li><a href="/lang/${i}">Language ${i}</a></li>`).join('')
    const seeAlso = Array.from({ length: 4 }, (_, i) => `<li><a href="/see/${i}">See also ${i}</a></li>`).join('')
    const article = `<!doctype html><html><body><main>
<h1>Kiln temperatures</h1>
<div class="languages"><ul>${menu}</ul></div>
<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>
<p>Sediment cores from the estuary date to 1873. Researchers compared them against the almanac kept at the plinth house.</p>
<p>Later experiments repeated the same steps, and the temperature curve matched the first recording within fifteen degrees.</p>
<h2>See also</h2><ul>${seeAlso}</ul>
</main></body></html>`
    const out = extractTf.extract(article)
    expect(out.strategy).toBe('article')
    expect(out.mainHtml).toContain('The kiln reached 1240 degrees')
    expect(out.mainHtml).not.toContain('Language 7')
    expect(out.mainHtml).toContain('See also 2')

    const listing = `<!doctype html><html><body><h1>Directory</h1><ul>${menu}</ul></body></html>`
    const dir = extractTf.extract(listing)
    expect(dir.pageType).toBe('listing')
    expect(dir.mainHtml).toContain('Language 7')
  })

  it('recovers the linked list on a card listing whose only prose block is too short', () => {
    const cards = Array.from({ length: 8 }, (_, i) =>
      `<li><article class="product_pod"><h3><a href="/catalogue/book-${i}">Book Title ${i}</a></h3><p class="price_color">£1${i}.50</p><p class="availability">In stock</p></article></li>`,
    ).join('')
    const html = `<!doctype html><html><head><title>Art | Books</title></head><body>
<ul class="breadcrumb"><li><a href="/">Home</a></li><li><a href="/books">Books</a></li><li class="active">Art</li></ul>
<h1>Art</h1>
<ol class="row">${cards}</ol>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.escalate).toBe(false)
    expect(out.recovery).toBe('list')
    expect(out.strategy).toBe('list')
    expect(out.mainHtml).toContain('Book Title 3')
    expect(out.mainHtml).toContain('£13.50')
  })

  it('recovers the cleaned body on a page of short unpunctuated blurbs', () => {
    const html = `<!doctype html><html><body><main>
<h1>Find open data</h1>
<h2>Search 55,000 datasets published by public bodies</h2>
<div class="card"><h3>Environment</h3><p>Air quality, flood risk and land use datasets</p></div>
<div class="card"><h3>Transport</h3><p>Road traffic counts and rail usage statistics</p></div>
<div class="card"><h3>Health</h3><p>Hospital activity and prescribing datasets</p></div>
<div class="card"><h3>Economy</h3><p>Business counts and regional productivity</p></div>
</main></body></html>`
    const out = extractTf.extract(html)
    expect(out.escalate).toBe(false)
    expect(out.recovery).toBe('body')
    expect(out.mainHtml).toContain('Road traffic counts')
  })

  it('still escalates a script shell and flags it as client-rendered', () => {
    const html = `<!doctype html><html><body><div id="root">Loading…</div><script>${'x'.repeat(3_000)}</script></body></html>`
    const out = extractTf.extract(html)
    expect(out.escalate).toBe(true)
    expect(out.recovery ?? null).toBeNull()
    expect(out.mainHtml).toBe('')
    expect(out.render?.clientRendered).toBe(true)
    expect(out.render?.markers).toContain('app_root_empty')
  })

  it('flags a table shell beside scripts as client-rendered, not a static empty table', () => {
    const prose = '<p>The table below lists the monthly consumer price index by geography and product group for the reference period.</p>'
    const shell = `<!doctype html><html><body><main><h1>Table 18-10-0006-01</h1>${prose}<table id="grid"><thead><tr></tr></thead><tbody><tr></tr></tbody></table><script>${'y'.repeat(1_500)}</script></main></body></html>`
    const rendered = extractTf.extract(shell)
    expect(rendered.render?.clientRendered).toBe(true)
    expect(rendered.render?.reason).toBe('empty_table_with_scripts')
    expect(rendered.render?.emptyTables).toBe(1)

    const stat = `<!doctype html><html><body><article><h1>Empty table</h1>${prose}<table></table><p>Text after the table.</p></article></body></html>`
    const staticPage = extractTf.extract(stat)
    expect(staticPage.render?.clientRendered).toBe(false)
    expect(staticPage.render?.emptyTables).toBe(1)
  })

  it('flags an explicit JavaScript fallback when script outweighs text', () => {
    const html = `<!doctype html><html><body><main><h1>Emissions per capita</h1>
<p>Carbon dioxide emissions per person, measured in tonnes per year across the selected countries.</p>
<figure class="GrapherWithFallback__fallback"><picture class="js--hide-if-js-enabled"><img src="/fallback.png" alt=""></picture></figure>
<script>window._OWID_GRAPHER_CONFIG = {${'"k":1,'.repeat(300)}"tab":"table"}</script>
</main></body></html>`
    const out = extractTf.extract(html)
    expect(out.render?.clientRendered).toBe(true)
    expect(out.render?.reason).toBe('js_fallback')
    expect(out.escalate).toBe(false)
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
