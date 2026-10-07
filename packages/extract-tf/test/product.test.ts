import { describe, expect, it } from 'vitest'
import { extractTf } from '../src/index.js'
import {
  collectProductFacts,
  findPriceElement,
  looksLikePrice,
  pruneRecommendations,
  selectProduct,
} from '../src/index.js'
import { classifyBlocks } from '../src/classify.js'
import { parse } from '../src/dom.js'

/**
 * A storefront PDP shaped like the real thing: a thin buy-box carrying the
 * price, a description, and a recommendation grid that carries MORE text than
 * the product does. That last property is the whole problem — text-volume
 * scoring picks the grid, and an LLM then summarizes the wrong products.
 *
 * Class names follow Amazon's conventions (a-price, a-carousel) because that
 * is the DOM the user named, but nothing in the implementation keys on them:
 * the price token is `price`, which Shopify and WooCommerce also emit, and the
 * grid trigger is structural.
 */
const RECOMMENDED_CARD = (n: number) =>
  `<div class="card"><a href="/dp/REC${n}">Recommended teapot number ${n}</a>` +
  `<span class="a-price">$${19 + n}.99</span>` +
  `<p>A completely different teapot with its own long marketing description about ` +
  `cast iron construction and a lifetime warranty that has nothing to do with the ` +
  `product actually being viewed on this page right now, number ${n}.</p></div>`

const PDP = (headExtra = '') => `<!doctype html><html><head>
<title>Four-spout infusion teapot</title>${headExtra}</head><body>
<div id="dp-container">
  <div id="titleSection"><h1 id="productTitle">Four-spout infusion teapot</h1></div>
  <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$84.00</span></span></div>
  <div id="feature-bullets"><p>Hand-thrown stoneware with four spouts for even infusion, fired to 1260C in a reduction kiln over eighteen hours.</p></div>
</div>
<div id="similarities_feature_div">
  <h2>Customers who viewed this item also viewed</h2>
  <div class="a-carousel">${[1, 2, 3, 4].map(RECOMMENDED_CARD).join('')}</div>
</div>
</body></html>`

const PRODUCT_LD = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product",
"name":"Four-spout infusion teapot","sku":"TP-4S-600","brand":{"@type":"Brand","name":"Harbour Clay"},
"offers":{"@type":"Offer","price":"84.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>`

describe('PDP extraction: recommendation contamination', () => {
  it('keeps the product and drops every recommended product', () => {
    const out = extractTf.extract(PDP(PRODUCT_LD))
    expect(out.pageType).toBe('product')
    expect(out.mainHtml).toContain('four spouts for even infusion')
    // The failure this exists to prevent: a neighbouring product's prose
    // reaching a summarizer as if it described this product.
    expect(out.mainHtml).not.toContain('cast iron construction')
    expect(out.mainHtml).not.toContain('Recommended teapot number')
    expect(out.mainHtml).not.toContain('also viewed')
  })

  it('reports THIS product price, not a recommended one', () => {
    const out = extractTf.extract(PDP(PRODUCT_LD))
    expect(out.product?.price?.value).toBe('84.00')
    expect(out.product?.priceCurrency?.value).toBe('USD')
    // Recommended cards are priced $20.99..$23.99; none may surface.
    expect(out.product?.price?.value).not.toMatch(/2[0-3]\.99/)
  })

  it('reads the visible price when the page declares nothing (and says so)', () => {
    // No JSON-LD, no microdata, no meta: only rendered markup. The price is
    // still recoverable, but it is OUR reading of their layout, not their
    // claim, and must be labelled 'text'.
    const doc = parse(PDP())
    pruneRecommendations(doc.document)
    const facts = collectProductFacts(doc.document)
    expect(facts.price?.value).toBe('$84.00')
    expect(facts.price?.source).toBe('text')
    doc.close()
  })

  it('would have picked a recommendation card without pruning', () => {
    // Guards the ordering in extract.ts: reading the visible price BEFORE
    // pruning finds a neighbour's price. If someone reorders those two steps,
    // this test is what tells them what they broke.
    const doc = parse(PDP())
    const unpruned = findPriceElement(doc.document)
    expect(unpruned).not.toBeNull()
    expect(unpruned!.textContent).toMatch(/2[0-3]\.99/)
    pruneRecommendations(doc.document)
    const pruned = findPriceElement(doc.document)
    expect(pruned!.textContent).toContain('84.00')
    doc.close()
  })
})

describe('PDP facts: evidence is labelled, never invented', () => {
  it('prefers JSON-LD over rendered text and records the source', () => {
    const out = extractTf.extract(PDP(PRODUCT_LD))
    expect(out.product?.name).toEqual({ value: 'Four-spout infusion teapot', source: 'jsonld' })
    expect(out.product?.price).toEqual({ value: '84.00', source: 'jsonld' })
    expect(out.product?.sku).toEqual({ value: 'TP-4S-600', source: 'jsonld' })
    expect(out.product?.brand).toEqual({ value: 'Harbour Clay', source: 'jsonld' })
    expect(out.product?.availability).toEqual({ value: 'InStock', source: 'jsonld' })
  })

  it('reads microdata content attributes, not their (empty) text', () => {
    const html = `<!doctype html><html><head><title>Kettle</title></head><body>
<div itemscope itemtype="https://schema.org/Product">
<h1 itemprop="name">Cast iron kettle</h1>
<meta itemprop="sku" content="CI-900">
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
<meta itemprop="price" content="129.50"><meta itemprop="priceCurrency" content="GBP">
<link itemprop="availability" href="https://schema.org/OutOfStock">
</div>
<p>Seasoned cast iron with an enamel interior, suited to induction hobs and open flame alike.</p>
</div></body></html>`
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('product')
    expect(out.product?.price).toEqual({ value: '129.50', source: 'microdata' })
    expect(out.product?.priceCurrency?.value).toBe('GBP')
    expect(out.product?.availability?.value).toBe('OutOfStock')
    expect(out.product?.sku?.value).toBe('CI-900')
  })

  it('falls back to OpenGraph product meta', () => {
    const html = `<!doctype html><html><head><title>Mug</title>
<meta property="og:title" content="Speckled stoneware mug">
<meta property="product:price:amount" content="18.00">
<meta property="product:price:currency" content="EUR">
<meta property="product:brand" content="Estuary Ceramics">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","offers":{"@type":"Offer","price":"18.00"}}</script>
</head><body><main><h1>Speckled stoneware mug</h1>
<p>Thrown from grogged clay and glazed in a speckled oatmeal that breaks over the rim.</p>
</main></body></html>`
    const out = extractTf.extract(html)
    // JSON-LD supplies the price; the meta tags fill what it left null.
    expect(out.product?.price).toEqual({ value: '18.00', source: 'jsonld' })
    expect(out.product?.priceCurrency).toEqual({ value: 'EUR', source: 'meta' })
    expect(out.product?.brand).toEqual({ value: 'Estuary Ceramics', source: 'meta' })
  })

  it('reports null for facts the page never stated', () => {
    const html = `<!doctype html><html><head><title>Bowl</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Nesting bowl"}</script>
</head><body><main><h1>Nesting bowl</h1>
<p>A shallow serving bowl thrown to nest inside its siblings for storage in a small kitchen.</p>
</main></body></html>`
    const out = extractTf.extract(html)
    expect(out.product?.name?.value).toBe('Nesting bowl')
    expect(out.product?.price).toBeNull()
    expect(out.product?.sku).toBeNull()
    expect(out.product?.availability).toBeNull()
  })

  it('carries no product facts on a non-product page', () => {
    const html = `<!doctype html><html><head><title>Report</title></head><body><article>
<h1>Harbour dredging report</h1>
<p>The survey covers forty villages and three hundred households in the upper valley, recorded over two winters.</p>
</article></body></html>`
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('article')
    expect(out.product ?? null).toBeNull()
  })

  it('ignores malformed JSON-LD instead of throwing', () => {
    // The broken script contributes NO signal, so the page routes to product
    // on its microdata tokens alone (sku + brand) — and the meta tags supply
    // the facts the unparseable script could not.
    const html = `<!doctype html><html><head><title>Broken</title>
<script type="application/ld+json">{"@type":"Product", "name": unquoted}</script>
<meta property="product:price:amount" content="42.00">
<meta property="product:price:currency" content="USD">
</head><body><main><h1>Salvaged item</h1>
<p>The markup on this page is broken but the meta tags still say what it costs and what it is.</p>
<span itemprop="sku">SLV-1</span><span itemprop="brand">Salvage Co</span>
</main></body></html>`
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('product')
    expect(out.product?.price).toEqual({ value: '42.00', source: 'meta' })
  })
})

describe('PDP region selection', () => {
  it('picks the buy-box region, not the largest text container', () => {
    const doc = parse(PDP(PRODUCT_LD))
    pruneRecommendations(doc.document)
    const blocks = classifyBlocks(doc.document, { minTextLength: 25, maxLinkDensity: 0.2 })
    const region = selectProduct(doc.document, blocks)
    expect(region).not.toBeNull()
    expect(region!.textContent).toContain('four spouts')
    doc.close()
  })

  it('falls back to the article cascade and reports the strategy honestly', () => {
    // A product page with no h1 and no price element: selectProduct has no
    // landmark, so the article cascade runs. The output must say 'article',
    // not claim a product strategy that never produced anything.
    const html = `<!doctype html><html><head><title>Unstructured</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Mystery item"}</script>
</head><body><div><p>This page describes an item at length but gives it no heading and shows no price anywhere in its markup at all.</p>
<p>A second paragraph continues the description with more prose so the cascade has something to select.</p></div>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('product')
    expect(out.strategy).toBe('article')
    expect(out.mainHtml).toContain('describes an item at length')
  })

  it('keeps the description and details a product shows in tabs beside its buy box', () => {
    // WooCommerce (scrapingcourse.com): the summary holds the title, price, a
    // one-line excerpt and the size and colour picker, whose labels are short
    // table cells; the description and the product's attributes are in tabs, a
    // sibling of the summary in the product's own element.
    const html = `<!doctype html><html><head><title>Abominable Hoodie</title>${PRODUCT_LD}</head><body>
<header class="site-header"><a class="cart-contents" href="/cart/"><span class="amount">$0.00</span> 0 items</a></header>
<main id="main"><div id="product-246" class="product type-product">
<div class="woocommerce-product-gallery"><img src="/hoodie.jpg" alt=""></div>
<div class="summary entry-summary"><h1 class="product_title">Abominable Hoodie</h1><p class="price"><span class="amount">$69.00</span></p>
<div class="woocommerce-product-details__short-description"><p>This is a variable product called a Abominable Hoodie</p></div>
<form class="variations_form cart"><table class="variations"><tr><th class="label"><label for="size">Size</label></th><td class="value"><select id="size"><option>XS</option><option>S</option></select></td></tr>
<tr><th class="label"><label for="color">Color</label></th><td class="value"><select id="color"><option>Blue</option></select><a class="reset_variations" href="#">Clear</a></td></tr></table><button type="submit">Add to cart</button></form>
<div class="product_meta">SKU: MH09</div></div>
<div class="woocommerce-tabs wc-tabs-wrapper"><ul class="tabs"><li><a href="#tab-description">Description</a></li><li><a href="#tab-additional_information">Additional information</a></li></ul>
<div id="tab-description" class="woocommerce-Tabs-panel"><h2>Description</h2><p>It took CoolTech weather apparel know-how and lots of wind-resistant fabric to get the Abominable Hoodie just right.</p><ul><li>Blue heather hoodie.</li><li>Relaxed fit.</li><li>Moisture-wicking.</li></ul></div>
<div id="tab-additional_information" class="woocommerce-Tabs-panel"><h2>Additional information</h2><table><tr><th>Size</th><td>XS, S, M, L, XL</td></tr><tr><th>Color</th><td>Blue, Green, Red</td></tr></table></div></div>
<section class="related products"><h2>Related products</h2><ul class="products">${[1, 2, 3].map((n) => `<li><a href="/p/${n}/">Other hoodie ${n}</a><span class="amount">$${50 + n}.00</span></li>`).join('')}</ul></section>
</div></main></body></html>`
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('product')
    expect(out.strategy).toBe('product')
    expect(out.mainHtml).toContain('$69.00')
    expect(out.mainHtml).toContain('wind-resistant fabric')
    expect(out.mainHtml).toContain('XS, S, M, L, XL')
    expect(out.mainHtml).not.toContain('Other hoodie')
    expect(out.mainHtml).not.toContain('0 items')
  })

  it('keeps the tabs when the picker shows its values and a reset link beside them', () => {
    // The Adrienne Trek Jacket: longer colour names leave the "Clear" link under the block filter's link density, so the
    // cell is a block; its values and its link describe the product no more than its label does.
    const html = `<!doctype html><html><head><title>Jacket</title>${PRODUCT_LD}</head><body><main><div class="product">
<div class="summary"><h1>Adrienne Trek Jacket</h1><p class="price"><span class="amount">$57.00</span></p><p>This is a variable product called a Adrienne Trek Jacket</p>
<form class="variations_form cart" action="/cart/"><table class="variations"><tr><th class="label"><label for="color">Color</label></th><td class="value"><select id="color" name="attribute_color"><option value="">Choose an option</option><option value="gray">Charcoal Gray</option><option value="orange">Sunset Orange</option></select><a class="reset_variations" href="#">Clear</a></td></tr></table><button type="submit">Add to cart</button></form></div>
<div class="woocommerce-tabs"><div id="tab-description"><h2>Description</h2><p>You're ready for a cross-country jog or a coffee on the patio in the Adrienne Trek Jacket.</p></div></div>
</div></main></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('Charcoal Gray, Sunset Orange')
    expect(out.mainHtml).toContain('coffee on the patio')
  })

  it('keeps a buy box whose own description is short: bullets, a spec table, CJK prose', () => {
    const page = (lang: string, buyBox: string, beside: string) => `<!doctype html><html lang="${lang}"><head><title>Product</title>${PRODUCT_LD}</head><body>
<main><div class="product">${buyBox}</div>${beside}</main></body></html>`
    for (const [lang, buyBox, beside, outside] of [
      ['en', '<h1>Linen shirt</h1><span class="price">$84.00</span><ul><li>Organic linen</li><li>Machine washable</li><li>Made in Portugal</li></ul>',
        '<div class="rich-text"><p>Since 1998 we have made every garment in small batches in our own workshop by the sea.</p></div>', 'Since 1998'],
      ['en', '<h1>Cordless drill</h1><span class="price">$129.00</span><table><tr><th>Voltage</th><td>18 V</td></tr><tr><th>Weight</th><td>1.2 kg</td></tr></table>',
        '<div class="blog-teaser"><p>Five things every homeowner should know before buying a power tool this winter.</p></div>', 'Five things'],
      ['zh', '<h1>防风保暖连帽衫</h1><span class="price">¥199.00</span><p>采用防风面料，轻便保暖，适合秋冬户外穿着</p>',
        '<div class="notice"><p>本店所有商品均为正品，支持七天无理由退换，请放心选购。</p></div>', '本店所有商品'],
    ] as const) {
      const out = extractTf.extract(page(lang, buyBox, beside))
      expect(out.strategy).toBe('product')
      expect(out.mainHtml).not.toContain(outside)
    }
  })

  it('widens a bare buy box to the product that holds its description', () => {
    // books.toscrape.com: title, price and stock sit in one column, the
    // description and the Product Information table two levels further up.
    const html = `<!doctype html><html><head><title>A Light in the Attic | Books to Scrape - Sandbox</title></head><body>
<header class="header container-fluid"><div class="col-sm-8 h1"><a href="../../index.html">Books to Scrape</a></div></header>
<div class="page_inner"><ul class="breadcrumb"><li><a href="../../index.html">Home</a></li><li><a href="../category/books_1/index.html">Books</a></li><li><a href="../category/books/poetry_23/index.html">Poetry</a></li><li class="active">A Light in the Attic</li></ul>
<article class="product_page"><div class="row">
<div class="col-sm-6"><div id="product_gallery" class="carousel"><img src="../../media/cache/fe/72/fe72f0532301ec28892ae79a629a293c.jpg" alt="A Light in the Attic" /></div></div>
<div class="col-sm-6 product_main"><h1>A Light in the Attic</h1><p class="price_color">£51.77</p>
<p class="instock availability"><i class="icon-ok"></i> In stock (22 available)</p><p class="star-rating Three"><i class="icon-star"></i></p></div>
</div>
<div id="product_description" class="sub-header"><h2>Product Description</h2></div>
<p>It's hard to imagine a world without A Light in the Attic. This now-classic collection of poetry and drawings from Shel Silverstein celebrates its 20th anniversary with this special edition.</p>
<div class="sub-header"><h2>Product Information</h2></div>
<table class="table table-striped"><tr><th>UPC</th><td>a897fe39b1053632</td></tr><tr><th>Price (excl. tax)</th><td>£51.77</td></tr></table>
</article></div></body></html>`
    const out = extractTf.extract(html, { url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html' })
    expect(out.pageType).toBe('product')
    expect(out.strategy).toBe('product')
    expect(out.product?.price).toEqual({ value: '£51.77', source: 'text', path: 'p.price_color' })
    expect(out.mainHtml).toContain("It's hard to imagine a world without A Light in the Attic.")
    expect(out.mainHtml).toContain('a897fe39b1053632')
    expect(out.mainHtml).not.toContain('Books to Scrape')
  })

  it('honours a declared microdata scope as the product boundary', () => {
    const html = `<!doctype html><html><head><title>Scoped</title></head><body>
<div id="page">
<div itemscope itemtype="https://schema.org/Product" id="the-product">
<h1 itemprop="name">Scoped teapot</h1><span class="price">$55.00</span>
<p>The publisher drew this boundary itself, so the extractor does not need to guess where it is.</p>
</div>
<div class="also-viewed"><p>Neighbouring product prose that sits outside the declared scope entirely.</p></div>
</div></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('publisher drew this boundary')
    expect(out.mainHtml).not.toContain('Neighbouring product prose')
  })
})

describe('recommendation pruning: precision guards', () => {
  it('does not prune a listing page (its cards ARE the content)', () => {
    const html = `<!doctype html><html><head><title>Teapot catalog</title></head><body>
<main><h1>Teapot catalog</h1><div class="grid">${[1, 2, 3, 4].map(RECOMMENDED_CARD).join('')}</div></main>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.pageType).not.toBe('product')
    expect(out.mainHtml).toContain('Recommended teapot number 1')
  })

  it('keeps sections about THIS product', () => {
    const html = `<!doctype html><html><head><title>Kettle</title>${PRODUCT_LD}</head><body>
<main><h1>Four-spout infusion teapot</h1><span class="price">$84.00</span>
<h2>Product description</h2><p>Hand-thrown stoneware fired to 1260C over eighteen hours in a reduction kiln.</p>
<h2>Specifications</h2><p>Capacity six hundred millilitres, cobalt ash glaze, dishwasher safe on the lower rack.</p>
<h2>Customers also bought</h2><div>${[1, 2, 3].map(RECOMMENDED_CARD).join('')}</div>
</main></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('reduction kiln')
    expect(out.mainHtml).toContain('cobalt ash glaze')
    expect(out.mainHtml).not.toContain('Customers also bought')
    expect(out.mainHtml).not.toContain('cast iron construction')
  })

  it('does not prune a related-articles rail on an article page', () => {
    // Links without prices are not a product grid. This is why the grid
    // trigger requires a price: an article's "read next" list must survive.
    const html = `<!doctype html><html><head><title>Report</title></head><body>
<article><h1>Dredging report</h1>
<p>The survey covers forty villages and three hundred households in the upper valley over two winters.</p>
<div class="read-next"><a href="/a">Story A</a><a href="/b">Story B</a><a href="/c">Story C</a></div>
</article></body></html>`
    const doc = parse(html)
    pruneRecommendations(doc.document)
    expect(doc.document.body.innerHTML).toContain('Story A')
    doc.close()
  })

  it('does not cut the product gallery for being a carousel', () => {
    // A bare "carousel" token is the product's OWN image gallery on most
    // storefronts; only co-purchase-specific tokens may cut.
    const doc = parse(`<!doctype html><html><body>
<div class="image-carousel"><img src="/1.jpg"><p>Product photography of the item being sold on this page.</p></div>
</body></html>`)
    pruneRecommendations(doc.document)
    expect(doc.document.body.innerHTML).toContain('Product photography')
    doc.close()
  })

  it('does not take the page for a grid when its header, product and sticky bar each show a link and a price', () => {
    // WooCommerce's Storefront theme (scrapeme.live): the page wrapper's
    // children are the header with its cart total, the breadcrumb, the
    // product, the footer and a sticky add-to-cart bar.
    const html = `<!doctype html><html><head><title>Bulbasaur</title>${PRODUCT_LD}</head><body>
<div id="page" class="hfeed site">
<header id="masthead" class="site-header"><a class="cart-contents" href="/basket/"><span class="amount">£0.00</span> 0 items</a></header>
<div class="storefront-breadcrumb"><a href="/">Home</a> / Bulbasaur</div>
<div id="content" class="site-content"><div class="product"><h1 class="product_title">Bulbasaur</h1><p class="price"><span class="amount">£63.00</span></p>
<p>Bulbasaur can be seen napping in bright sunlight. There is a seed on its back that grows by soaking up the sun's rays.</p>
<a href="#reviews">Reviews (0)</a>
<section class="related products"><h2>Related products</h2><ul class="products">${[1, 2, 3].map((n) => `<li><a href="/shop/${n}/">Related ${n}</a><span class="amount">£${60 + n}.00</span></li>`).join('')}</ul></section></div></div>
<footer id="colophon" class="site-footer"><p>© ScrapeMe 2026</p></footer>
<section class="storefront-sticky-add-to-cart"><a href="#product">Bulbasaur</a><span class="amount">£63.00</span></section>
</div></body></html>`
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('product')
    expect(out.escalate).toBe(false)
    expect(out.mainHtml).toContain('napping in bright sunlight')
    expect(out.mainHtml).not.toContain('Related 1')
  })

  it('does not take such a page wrapper for a grid when the product title is not an h1', () => {
    const doc = parse(`<!doctype html><html><body><div id="page" class="hfeed site">
<header class="site-header"><a class="cart-contents" href="/basket/"><span class="amount">£0.00</span> 0 items</a></header>
<div id="content" class="site-content"><h2 class="product_title">Bulbasaur</h2><p class="price">£63.00</p><a href="#reviews">Reviews (0)</a><p>Bulbasaur can be seen napping in bright sunlight.</p></div>
<section class="sticky-add-to-cart"><a href="#product">Bulbasaur</a><span class="amount">£63.00</span></section>
</div></body></html>`)
    pruneRecommendations(doc.document)
    expect(doc.document.body.innerHTML).toContain('napping in bright sunlight')
    doc.close()
  })

  it('does not cut the product for a merchandising class that names recommendations', () => {
    const doc = parse(`<!doctype html><html><body>
<div class="product recommended"><h1>Cobalt teapot</h1><span class="price">$84.00</span><p>Hand-thrown stoneware fired in a reduction kiln.</p></div>
</body></html>`)
    pruneRecommendations(doc.document)
    expect(doc.document.body.innerHTML).toContain('reduction kiln')
    doc.close()
  })

  it('never cuts the element that holds the page\'s h1', () => {
    // A page laid out in alike rows: the header with its cart, the product, a sticky bar.
    const doc = parse(`<!doctype html><html><body><div id="page">
<div class="row"><a href="/cart">Cart</a><span class="price">$0.00</span></div>
<div class="row"><h1>Cobalt teapot</h1><span class="price">$84.00</span><a href="#reviews">Reviews</a><p>Hand-thrown stoneware fired in a reduction kiln.</p></div>
<div class="row"><a href="#buy">Buy now</a><span class="price">$84.00</span></div>
</div></body></html>`)
    pruneRecommendations(doc.document)
    expect(doc.document.body.innerHTML).toContain('reduction kiln')
    doc.close()
  })

  it('still cuts a grid whose cards each carry an h1 of their own', () => {
    // The guard is for the page's one h1; cards that each hold one are no product's title.
    const doc = parse(`<!doctype html><html><body>
<div class="product"><h1>Cobalt teapot</h1><span class="price">$84.00</span><p>Hand-thrown stoneware fired in a reduction kiln.</p></div>
<div class="shelf">${[1, 2, 3].map((n) => `<div class="card"><h1><a href="/p/${n}">Other teapot ${n}</a></h1><span class="price">$${n}9.00</span></div>`).join('')}</div>
</body></html>`)
    pruneRecommendations(doc.document)
    const html = doc.document.body.innerHTML
    expect(html).toContain('reduction kiln')
    expect(html).not.toContain('Other teapot')
    doc.close()
  })

  it('cuts CJK recommendation headings too', () => {
    const doc = parse(`<!doctype html><html><body>
<div id="main"><h1>四嘴泡茶壶</h1><p>手工拉坯的炻器茶壶，四个壶嘴使茶汤浸出更均匀，在还原焰中烧至一千二百六十度。</p></div>
<div id="recs"><h2>购买了此商品的顾客也买了</h2><p>另一件完全不同的商品的描述文字，与本页正在浏览的商品毫无关系。</p></div>
</body></html>`)
    pruneRecommendations(doc.document)
    const html = doc.document.body.innerHTML
    expect(html).toContain('四个壶嘴')
    expect(html).not.toContain('购买了此商品的顾客')
    expect(html).not.toContain('毫无关系')
    doc.close()
  })
})

describe('price shape', () => {
  it('matches the currency conventions storefronts actually ship', () => {
    for (const s of ['$84.00', '£1,299.99', '€18,50', '¥3980', 'USD 84.00', '84.00 EUR', '₹1,49,900', '1 299,00 €', "CHF 1'299.00"]) {
      expect(looksLikePrice(s)).toBe(true)
    }
  })

  it('reads a price grouped by spaces or apostrophes as one amount, not its last group', () => {
    const visible = (text: string): string | undefined => {
      const doc = parse(`<html><body><h1>Lampe</h1><p class="price">${text}</p></body></html>`)
      const value = collectProductFacts(doc.document).price?.value
      doc.close()
      return value
    }
    expect(visible('1 299,00 €')).toBe('1 299,00 €')
    expect(visible('€ 1 299,00')).toBe('€ 1 299,00')
    expect(visible("CHF 1'299.00")).toBe("CHF 1'299.00")
    expect(visible('1’299.50 CHF')).toBe('1’299.50 CHF')
    // A group starts where a number starts: a year before a price is not its thousands.
    expect(visible('2024 299 €')).toBe('299 €')
  })

  it('does not match bare numbers or dates', () => {
    for (const s of ['600ml', '1260C', '2026-08-21', 'eighteen hours', '4.7 out of 5 stars']) {
      expect(looksLikePrice(s)).toBe(false)
    }
  })
})

describe('Amazon product adapter', () => {
  it('does not promote an unbound unit price to the subject offer', () => {
    const html = `<!doctype html><html><body><div id="dp-container">
      <h1 id="productTitle">Subject lotion</h1><p id="feature-bullets">A complete subject description.</p>
      <div class="unit-price">$1.21 / fl oz</div>
    </div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.product?.price).toBeNull()
    expect(out.entities[0]?.fields.price).toBeUndefined()
  })

  it('normalizes Singapore dollar symbols and marketplace inference', () => {
    const html = `<!doctype html><html><body><div id="dp-container">
      <input name="ASIN" value="B012345678"><h1 id="productTitle">Subject wipes</h1>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">S$32.73</span></span></div>
      <p id="feature-bullets">A complete subject description.</p>
    </div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.sg/dp/B012345678' })
    expect(out.product?.price?.value).toBe('32.73')
    expect(out.product?.priceCurrency?.value).toBe('SGD')
  })

  it('keeps explicit foreign dollar prefixes distinct from the Singapore storefront', () => {
    for (const [raw, expected] of [['US$12.50', 'USD'], ['C$12.50', 'CAD'], ['A$12.50', 'AUD'], ['$12.50', 'SGD']] as const) {
      const html = `<!doctype html><html><body><div id="dp-container">
        <input name="ASIN" value="B012345678"><h1 id="productTitle">Subject item</h1>
        <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">${raw}</span></span></div>
      </div></body></html>`
      const out = extractTf.extract(html, { url: 'https://www.amazon.sg/dp/B012345678' })
      expect(out.product?.priceCurrency?.value, raw).toBe(expected)
      expect(out.product?.prices?.[0]?.currency?.value, raw).toBe(expected)
    }
  })

  it('reads the primary offer seller from Amazon offer display and labels unit prices', () => {
    const html = `<!doctype html><html><body><div id="dp-container">
      <input name="ASIN" value="B012345678"><h1 id="productTitle">Cotton rounds</h1>
      <div id="corePrice_feature_div">
        <span class="a-price apex-pricetopay-value"><span class="a-offscreen">S$3.77</span></span>
        <span class="a-price apex-priceperunit-value"><span class="a-offscreen">S$0.04</span></span>
      </div>
      <div id="merchantInfoFeature_feature_div"><span class="offer-display-feature-text-message">Amazon.com</span></div>
      <section class="related-products"><span class="offer-display-feature-text-message">Other Shop</span></section>
    </div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.product?.seller?.value).toBe('Amazon.com')
    expect(out.product?.seller?.path).toBe('#merchantInfoFeature_feature_div .offer-display-feature-text-message')
    expect(out.product?.prices?.map(price => price.priceType)).toEqual(['current', 'unit'])
  })

  it('skips the Amazon location placeholder and normalizes the visible Singapore postal code', () => {
    const html = `<html><body><span id="glow-ingress-line2">Update location</span>
      <span id="contextualIngressPtLabel_deliveryShortLine">Delivering to Singapore 170000 – Update location</span>
      <div id="dp-container"><input name="ASIN" value="B012345678"><h1 id="productTitle">Subject wipes</h1>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">S$32.73</span></span></div></div>
    </body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.product?.deliveryLocation?.value).toBe('Singapore 170000')
    expect(out.product?.deliveryLocation?.path).toBe('#contextualIngressPtLabel_deliveryShortLine')
  })

  it('normalizes Amazon brand labels without changing the subject evidence location', () => {
    const html = `<html><head><link rel="canonical" href="https://www.amazon.sg/dp/B012345678"></head><body>
      <div id="dp-container"><input name="ASIN" value="B012345678"><h1 id="productTitle">Subject lotion</h1>
      <a id="bylineInfo">Brand: eos</a></div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.product?.brand).toEqual({ value: 'eos', source: 'dom', path: '#bylineInfo' })
    expect(out.entities[0]?.fields.brand?.normalized).toBe('eos')
  })

  it('uses the /dp subject identity even when the page declares an OfferCatalog', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"OfferCatalog","name":"Related products"}</script>
    </head><body>
      <span id="glow-ingress-line2">India</span>
      <div id="dp-container">
        <input name="ASIN" value="B012345678">
        <h1 id="productTitle">Subject headphones</h1>
        <a id="bylineInfo">Visit the SoundCo Store</a>
        <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">INR 1,299.00</span></span></div>
        <a id="sellerProfileTriggerId">SoundCo Direct</a>
        <div id="availability"><span>In Stock</span></div>
        <span id="acrPopover" title="4.7 out of 5 stars"></span><span id="acrCustomerReviewText">2,345 ratings</span>
        <img id="landingImage" src="https://images.example/subject.jpg">
        <div id="feature-bullets"><p>Subject-only features and description.</p></div>
        <table id="productDetails_techSpec_section_1"><tr><th>Model</th><td>SC-10</td></tr></table>
        <section class="related-products"><h2>Related products</h2><a href="/dp/REC0000001">Other headphones</a><span class="a-price">$12.57</span><img src="https://images.example/recommended.jpg"></section>
      </div>
    </body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.pageType).toBe('product')
    expect(out.strategy).toBe('product')
    expect(out.product?.subjectId?.value).toBe('B012345678')
    expect(out.product?.name?.value).toBe('Subject headphones')
    expect(out.product?.price?.value).toBe('1,299.00')
    expect(out.product?.priceCurrency?.value).toBe('INR')
    expect(out.product?.seller?.value).toBe('SoundCo Direct')
    expect(out.product?.deliveryLocation?.value).toBe('India')
    expect(out.product?.rating?.value).toBe('4.7')
    expect(out.product?.reviewCount?.value).toBe('2345')
    expect(out.product?.specifications?.Model?.value).toBe('SC-10')
    expect(out.mainHtml).not.toContain('12.57')
    expect(out.mainHtml).not.toContain('recommended.jpg')
  })

  it('marks an Amazon subscription offer without treating it as a physical item', () => {
    const html = `<!doctype html><html><body><div id="dp-container">
      <input name="ASIN" value="B08JHCVHTY"><h1 id="productTitle">Blink Plus subscription plan</h1>
      <p>Billing: Monthly</p><div id="subscriptionPrice">$11.99</div>
      <p id="feature-bullets">Cloud video storage subscription plan for supported devices.</p>
    </div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B08JHCVHTY' })
    expect(out.pageType).toBe('product')
    expect(out.product?.kind).toBe('subscription')
    expect(out.product?.prices?.[0]?.priceType).toBe('subscription')
  })

  it('binds a Blink subscription price to the selected buy box instead of another plan', () => {
    const html = `<!doctype html><html><head><title>Blink plus plan</title></head><body>
      <main><input name="ASIN" value="B08JHCVHTY"></main><div data-cy="twister-plus-label-text">Plan: Blink plus</div>
      <div>Blink plus ai $14.99/month</div>
      <div>Billing: Monthly</div>
      <div data-cy="subs-buy-box-container"><span>$11.99/month</span></div>
      <div data-cy="sold-by-value">Blink</div>
    </body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B08JHCVHTY' })
    expect(out.product?.kind).toBe('subscription')
    expect(out.product?.price?.value).toBe('11.99')
    expect(out.product?.price?.path).toBe('[data-cy="subs-buy-box-container"], #subs-buy-box-container')

    const noSelectedOffer = extractTf.extract(html.replace('<div data-cy="subs-buy-box-container"><span>$11.99/month</span></div>', ''),
      { url: 'https://www.amazon.com/dp/B08JHCVHTY' })
    expect(noSelectedOffer.product?.price).toBeNull()
  })

  it('binds JSON-LD to the URL ASIN and ignores a recommended Product record', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">{"@graph":[
        {"@type":"Product","sku":"REC0000001","name":"Recommended item","image":"https://images.example/recommended.jpg","offers":{"price":"12.57","priceCurrency":"USD"}},
        {"@type":"Product","sku":"B012345678","name":"Subject from JSON-LD","brand":{"name":"Subject Brand"},"image":"https://images.example/subject.jpg","offers":{"price":"1299.00","priceCurrency":"INR","seller":{"name":"Subject Seller"},"availability":"https://schema.org/InStock"}}
      ]}</script>
    </head><body><div id="dp-container"><input name="ASIN" value="B012345678"><h1 id="productTitle">Subject headphones</h1><p id="feature-bullets">The main product description has enough content to identify this item.</p></div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.product?.price).toBeNull()
    expect(out.product?.quoteState).toBe('unobserved')
    expect(out.product?.prices?.[0]?.amount).toMatchObject({ value: '1299.00', source: 'jsonld' })
    expect(out.product?.seller?.value).toBe('Subject Seller')
    expect(out.product?.images?.map(image => image.value)).toEqual(['https://images.example/subject.jpg'])
    expect(JSON.stringify(out.product)).not.toContain('REC0000001')
    expect(JSON.stringify(out.product)).not.toContain('12.57')
    expect(JSON.stringify(out.product)).not.toContain('recommended.jpg')
  })

  it('returns null price with an explicit shipping restriction instead of borrowing a recommendation price', () => {
    const html = `<!doctype html><html><body><div id="dp-container">
      <input name="ASIN" value="B012345678"><h1 id="productTitle">Unavailable subject</h1><div id="availability">This item cannot be shipped to your selected delivery location. Please choose a different delivery location.</div>
      <div id="twister"><button class="a-button-selected" title="Black">Black</button></div>
      <section class="related-products"><a href="/dp/REC0000001">Other</a><span class="a-price"><span class="a-offscreen">$19.99</span></span></section>
    </div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.product?.price).toBeNull()
    expect(out.product?.availability?.value).toContain('cannot be shipped')
    expect(out.product?.variants?.[0]).toMatchObject({ value: 'Black', selected: true })
    expect(JSON.stringify(out.product)).not.toContain('19.99')
  })

  it('keeps alternate offer prices paired with their sellers', () => {
    const html = `<!doctype html><html><body><div id="dp-container"><input name="ASIN" value="B012345678"><h1 id="productTitle">Multi-seller subject</h1>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$20.00</span></span></div><a id="sellerProfileTriggerId">Primary Shop</a>
      <div id="aod-offer-list"><div class="aod-information-block"><span class="a-price"><span class="a-offscreen">$21.50</span></span><span class="aod-offer-soldBy"><a>Second Shop</a></span></div></div>
    </div></body></html>`
    const out = extractTf.extract(html, { url: 'https://www.amazon.com/dp/B012345678' })
    expect(out.product?.prices).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: expect.objectContaining({ value: '20.00' }), seller: expect.objectContaining({ value: 'Primary Shop' }) }),
      expect.objectContaining({ amount: expect.objectContaining({ value: '21.50' }), seller: expect.objectContaining({ value: 'Second Shop' }) }),
    ]))
  })
})
