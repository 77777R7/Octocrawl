import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown, routePage, selectList, selectTable } from '../src/index.js'
import { parse } from '../src/dom.js'

const wrap = (bodyHtml: string, headExtra = '') =>
  `<!doctype html><html><head><title>Page</title>${headExtra}</head><body>${bodyHtml}</body></html>`

const PRODUCT_LD = (over = '') =>
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Four-spout infusion teapot","offers":{"@type":"Offer","price":"84.00","priceCurrency":"USD"}${over}}</script>`

const TABLE_SNIPPET =
  '<table><tr><th>Capacity</th><th>Glaze</th><th>Firing</th></tr><tr><td>600ml</td><td>Cobalt ash</td><td>1260C</td></tr></table>'

const POST_SNIPPET = (n: number) =>
  `<article class="post" data-post-id="${n}"><h2>Re: best kiln temperature</h2><p>Post body ${n} with enough prose to classify as a text block in the cascade.</p></article>`

describe('routePage', () => {
  it('routes a link-farm list to listing', () => {
    const doc = parse(
      wrap('<main><h1>Logs</h1><ul>' +
        Array.from({ length: 10 }, (_, i) => `<li><a href="/l/${i}">Log ${i}</a></li>`).join('') +
        '</ul></main>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('listing')
    expect(d.strategy).toBe('list')
    doc.close()
  })

  it('routes a JSON-LD product page to product with the product strategy', () => {
    const doc = parse(wrap(`<main><h1>Teapot</h1>${TABLE_SNIPPET}<p>Hand-thrown stoneware.</p></main>`, PRODUCT_LD()))
    const d = routePage(doc.document)
    expect(d.type).toBe('product')
    expect(d.strategy).toBe('product')
    doc.close()
  })

  it('routes a single-table page to collection with the table strategy (no product signal)', () => {
    const doc = parse(
      wrap('<main><h1>Readings</h1><table><tr><th>Station</th><th>Flow</th></tr><tr><td>Meridian</td><td>41</td></tr></table></main>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('collection')
    expect(d.strategy).toBe('table')
    doc.close()
  })

  it('does not route a page whose text lies outside its tables to the table strategy', () => {
    const prose = Array.from({ length: 4 }, (_, i) =>
      `<div>Paragraph ${i + 1} explains how the kiln readings were taken and why the quarterly figures in the table were revised.</div>`).join('')
    for (const tables of [1, 3]) {
      const doc = parse(wrap(prose + TABLE_SNIPPET.repeat(tables)))
      expect(routePage(doc.document)).toEqual({ type: 'article', strategy: 'article' })
      doc.close()
    }
  })

  it('does not route a single product-spec-shaped table to product', () => {
    // Product-spec headings alone are not proof of a product page.
    const doc = parse(
      wrap('<main><h1>Kiln archive</h1><table><tr><th>Capacity</th><th>Firing</th></tr><tr><td>600ml</td><td>1260C</td></tr></table></main>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('collection')
    doc.close()
  })

  it('routes a microdata product scope to product', () => {
    const doc = parse(
      wrap('<main><div itemscope itemtype="https://schema.org/Product"><h1>Teapot</h1><span itemprop="name">Four-spout teapot</span></div></main>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('product')
    doc.close()
  })

  it('routes JSON-LD @type array to product', () => {
    const doc = parse(
      wrap('<main><h1>Teapot</h1>' + TABLE_SNIPPET + '</main>',
        '<script type="application/ld+json">{"@type":["Product","Thing"]}</script>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('product')
    doc.close()
  })

  it('routes a full-IRI JSON-LD type to product', () => {
    const doc = parse(
      wrap('<main><h1>Teapot</h1>' + TABLE_SNIPPET + '</main>',
        '<script type="application/ld+json">{"@type":"https://schema.org/Product"}</script>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('product')
    doc.close()
  })

  it('finds Product inside JSON-LD @graph', () => {
    const doc = parse(
      wrap('<main><h1>Teapot</h1>' + TABLE_SNIPPET + '</main>',
        '<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Product"}]}</script>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('product')
    doc.close()
  })

  it('ignores malformed JSON-LD without throwing', () => {
    const doc = parse(
      wrap('<main><h1>Readings</h1><table><tr><th>Station</th><th>Flow</th></tr><tr><td>Meridian</td><td>41</td></tr></table></main>',
        '<script type="application/ld+json">{"@type":"Product", broken</script>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('collection')
    doc.close()
  })

  it('routes two independent weak product signals to product', () => {
    // price alone is not enough; price + sku are two independent weak signals.
    const doc = parse(
      wrap('<main><h1>Teapot</h1><span itemprop="price">84.00</span><span itemprop="sku">TP-04</span></main>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('product')
    doc.close()
  })

  it('routes a visible buy box to product: the one h1, then the one price in its section', () => {
    const doc = parse(wrap('<ul class="breadcrumb"><li><a href="/">Home</a></li><li><a href="/books">Books</a></li><li><a href="/poetry">Poetry</a></li><li>A Light in the Attic</li></ul>' +
      '<article><div class="product_main"><h1>A Light in the Attic</h1><p class="price_color">£51.77</p><p class="availability">In stock (22 available)</p></div>' +
      '<h2>Product Description</h2><p>A collection of poems and line drawings.</p></article>'))
    expect(routePage(doc.document)).toEqual({ type: 'product', strategy: 'product' })
    doc.close()
  })

  it('does not route a price that belongs to a listed item to product', () => {
    // One card under its own heading, or in a list item, is a listing of one.
    for (const body of [
      '<h1>Crime</h1><section><h3><a href="/b/1">The Long Goodbye</a></h3><p class="price_color">£31.12</p></section>',
      '<h1>Deals</h1><ul><li><a href="/b/1">Cobalt teapot</a> <span class="price">£19.00</span></li></ul>',
      '<h1>Teapots</h1>' + ['£19.00', '£24.00'].map((p, i) => `<div><a href="/t/${i}">Teapot ${i}</a><span class="price">${p}</span></div>`).join(''),
    ]) {
      const doc = parse(wrap(body))
      expect(routePage(doc.document).type).not.toBe('product')
      doc.close()
    }
  })

  it('does not take a price box on a page declared an article for a buy box', () => {
    const doc = parse(wrap('<article><h1>Gold hits a record</h1><div class="price-box"><span class="price">$2,410.50</span></div>' +
      '<p>Gold rose for a fifth day as investors sought safety ahead of the central bank meeting.</p></article>',
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"Gold hits a record"}</script>'))
    expect(routePage(doc.document).type).not.toBe('product')
    doc.close()
  })

  it('does not route priceCurrency alone to product', () => {
    const doc = parse(wrap('<main><h1>Teapot</h1><span itemprop="priceCurrency">USD</span></main>'))
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    doc.close()
  })

  it('does not substring-match itemprop values', () => {
    // "brandish" contains "brand" but is not the brand itemprop token.
    const doc = parse(wrap('<main><h1>Teapot</h1><span itemprop="brandish">waved</span></main>'))
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    doc.close()
  })

  describe('a shop listing whose cards declare products', () => {
    const name = (i: number) => `Cedar Ridge Garden Trowel Model ${i + 1}`
    // WooCommerce: every card is a microdata Product scope whose classes
    // differ card to card (post id, first/last in the row, stock, category).
    const woo = (i: number) => {
      const place = i % 4 === 0 ? ' first' : i % 4 === 3 ? ' last' : ''
      const stock = i % 3 === 0 ? 'outofstock' : 'instock'
      return `<li data-products="item" itemscope itemtype="http://schema.org/Product" class="product type-product post-${240 + i} status-publish${place} ${stock} product_cat-tools-${i % 2} has-post-thumbnail purchasable product-type-simple">` +
        `<a href="/shop/trowel-${i + 1}/" class="woocommerce-LoopProduct-link"><img src="/img/${i + 1}.jpg" alt=""><h2 class="woocommerce-loop-product__title">${name(i)}</h2><span class="price">$${12 + i}.00</span></a>` +
        `<a href="/shop/?add-to-cart=${700 + i}" class="button">Add to basket</a></li>`
    }
    // The header's cart total is a price outside the cards, before the page's h1.
    const shop = wrap(`<header class="site-header"><a class="cart-contents" href="/cart/"><span class="woocommerce-Price-amount amount">$0.00</span> 0 items</a></header><main><h1 class="page-title">Shop</h1><p class="woocommerce-result-count">Showing 1–8 of 188 results</p><ul class="products columns-4">${Array.from({ length: 8 }, (_, i) => woo(i)).join('')}</ul></main>`)

    it('routes WooCommerce product cards to collection and keeps every one', () => {
      const doc = parse(shop)
      expect(routePage(doc.document)).toEqual({ type: 'collection', strategy: 'article' })
      doc.close()
      const out = extractTf.extract(shop)
      expect(out.pageType).toBe('collection')
      for (let i = 0; i < 8; i++) expect(out.mainHtml).toContain(name(i))
    })

    // IKEA: the products are declared in JSON-LD only, as a CollectionPage's ItemList.
    const listed = (names: readonly string[]) => `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      mainEntity: { '@type': 'ItemList', itemListElement: names.map((n, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: n, offers: { '@type': 'Offer', price: `${12 + i}.00`, priceCurrency: 'USD' } } })) },
    })}</script>`
    const tile = (i: number) => `<div class="plp-product"><a href="/p/trowel-${i + 1}/">${name(i)}</a><span class="price">$${12 + i}.00</span><span>Forged steel blade, ash handle.</span></div>`
    const names = Array.from({ length: 8 }, (_, i) => name(i))

    it('routes a page whose JSON-LD lists its products in an ItemList to collection and keeps every card', () => {
      const html = wrap(`<main><h1>Garden tools</h1><p>Showing 8 of 46 results</p><div class="plp-grid">${Array.from({ length: 8 }, (_, i) => tile(i)).join('')}</div></main>`, listed(names))
      const doc = parse(html)
      expect(routePage(doc.document)).toEqual({ type: 'collection', strategy: 'article' })
      doc.close()
      const out = extractTf.extract(html)
      for (let i = 0; i < 8; i++) expect(out.mainHtml).toContain(name(i))
    })

    it('keeps a product page whose JSON-LD also lists related products a product page', () => {
      const own = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Cobalt teapot', offers: { '@type': 'Offer', price: '84.00', priceCurrency: 'USD' } })}</script>`
      const html = wrap(`<main><h1>Cobalt teapot</h1><span class="price">$84.00</span><p>Hand-thrown stoneware.</p><div class="plp-grid">${Array.from({ length: 4 }, (_, i) => tile(i)).join('')}</div></main>`, own + listed(names.slice(0, 4)))
      const doc = parse(html)
      expect(routePage(doc.document).type).toBe('product')
      doc.close()
    })
  })

  it('routes JSON-LD OfferCatalog to collection, not product', () => {
    const doc = parse(
      wrap('<main><h1>Catalog</h1><ul><li><a href="/c/1">Cobalt teapot</a></li><li><a href="/c/2">Ash jug</a></li></ul></main>',
        '<script type="application/ld+json">{"@type":"OfferCatalog"}</script>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('collection')
    doc.close()
  })

  it('routes a grid of alike microdata Product cards to collection, and a product page beside such cards to product', () => {
    const card = (n: number) => `<div class="card thumbnail" itemscope itemtype="https://schema.org/Product"><h4 itemprop="offers" itemscope itemtype="https://schema.org/Offer">$${n}99</h4><a href="/p/${n}" itemprop="name">Teapot ${n}</a></div>`
    const grid = Array.from({ length: 4 }, (_, i) => card(i + 1)).join('')
    const listing = parse(wrap(`<main><h1>Teapots</h1><div class="row">${grid}</div></main>`))
    expect(routePage(listing.document)).toEqual({ type: 'collection', strategy: 'article' })
    listing.close()
    // The page's own product is a scope of another shape, holding its h1: the cards beside it are its recommendations.
    const pdp = parse(wrap(`<main><div class="product-main" itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Cobalt teapot</h1><p>Hand-thrown stoneware.</p></div><div class="row">${grid}</div></main>`))
    expect(routePage(pdp.document).type).toBe('product')
    pdp.close()
    // Two cards are not yet a listing; a page declaring its product in JSON-LD stays a product page.
    const two = parse(wrap(`<main><h1>Teapots</h1><div class="row">${card(1)}${card(2)}</div></main>`))
    expect(routePage(two.document).type).toBe('product')
    two.close()
    const declared = parse(wrap(`<main><h1>Teapots</h1><div class="row">${grid}</div></main>`, PRODUCT_LD()))
    expect(routePage(declared.document).type).toBe('product')
    declared.close()
    // A product page that marks up only the cards beside it: its buy box, the heading over the cards, a container named for
    // recommendations, or cards with no class to tell them from the page's own product keep it a product page.
    const priced = grid.replace(/<h4 itemprop="offers"[^>]*>(\$\d+)<\/h4>/g, '<span class="price">$1</span>')
    expect(priced).toContain('class="price"')
    const unmarked = (cards: string) => parse(wrap(`<main><div class="pdp"><h1>Cobalt teapot</h1><span class="price">$49.00</span><button>Add to cart</button><p>Hand-thrown stoneware.</p></div>${cards}</main>`))
    for (const page of [
      unmarked(`<div class="row">${grid}</div>`),
      // Cards that show their prices as the page's own price is shown: the page still has a price of its own beside its h1.
      unmarked(`<div class="row">${priced}</div>`),
      parse(wrap(`<main><div class="pdp"><h1>Cobalt teapot</h1><p>Hand-thrown stoneware.</p></div><section><h2>You may also like</h2><div class="row">${grid}</div></section></main>`)),
      parse(wrap(`<main><div class="pdp"><h1>Cobalt teapot</h1><p>Hand-thrown stoneware.</p></div><div class="related-products">${grid}</div></main>`)),
      parse(wrap(`<main><h1>Cobalt teapot</h1><p>Hand-thrown stoneware.</p><div>${grid.replaceAll(' class="card thumbnail"', '')}</div></main>`)),
    ]) {
      expect(routePage(page.document).type).toBe('product')
      page.close()
    }
  })

  it('does not route an article with JSON-LD comments to forum', () => {
    const doc = parse(
      wrap('<article><h1>Essay</h1>' +
        Array.from({ length: 8 }, (_, i) => `<p>Paragraph ${i} with enough prose to satisfy the text length thresholds and count as real content.</p>`).join('') +
        '</article>',
        '<script type="application/ld+json">{"@type":"Article","comment":[{"@type":"Comment","text":"First comment"}]}</script>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    doc.close()
  })

  it('routes a forum thread to forum with the article strategy', () => {
    const doc = parse(wrap(`<main><h1>Thread: best kiln temperature</h1>${POST_SNIPPET(1)}${POST_SNIPPET(2)}</main>`))
    const d = routePage(doc.document)
    expect(d.type).toBe('forum')
    expect(d.strategy).toBe('article')
    doc.close()
  })

  it('routes a JSON-LD discussion to forum with the article strategy', () => {
    const doc = parse(
      wrap(
        '<main><h1>Thread: kiln notes</h1>' +
          '<div class="comment">The first kiln run held 1240C steady through the night.</div>' +
          '<div class="comment">The second run cooled too fast and the glaze micro-cracked along the rim.</div>' +
          '</main>',
        '<script type="application/ld+json">{"@type":"DiscussionForumPosting"}</script>',
      ),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('forum')
    expect(d.strategy).toBe('article')
    doc.close()
  })

  it('does not route a long prose page to forum', () => {
    const doc = parse(
      wrap('<article><h1>Essay</h1>' +
        Array.from({ length: 10 }, (_, i) => `<p>Paragraph ${i} with enough prose to satisfy the text length thresholds and count as real content.</p>`).join('') +
        '</article>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    doc.close()
  })

  it('does not route a single post to forum', () => {
    const doc = parse(wrap('<main><h1>Thread</h1>' + POST_SNIPPET(1) + '</main>'))
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    doc.close()
  })

  it('does not route a prose page with many comment-shaped divs to forum', () => {
    // Comment word in class names + "opinion" prose: still an article shape.
    const doc = parse(
      wrap('<article><h1>Kiln opinion essay</h1>' +
        '<div class="comments-wrapper">Comments on the winter firing:</div>' +
        Array.from({ length: 4 }, (_, i) => `<div class="comment-body"><p>Comment paragraph ${i} about glaze chemistry, holding schedules and the harbour air during firing week.</p></div>`).join('') +
        '</article>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    doc.close()
  })

  it('does not route a documentation page with breadcrumbs and prose to listing', () => {
    const html = wrap(
      '<main id="content">' +
        '<ol class="breadcrumb"><li><a href="/en-US/docs/Web">Web</a></li><li><a href="/en-US/docs/Web/API">Web APIs</a></li><li><a href="/en-US/docs/Web/API/AbortController">AbortController</a></li></ol>' +
        '<h1>AbortController</h1><h2>Instance methods</h2>' +
        '<p>The AbortController interface represents a controller object that allows you to abort one or more Web requests as and when desired.</p>' +
        '<p>You can create a new AbortController object using the AbortController() constructor. Communicating with an asynchronous operation is done using an AbortSignal object.</p>' +
        '<p>Returns an AbortSignal object instance, which can be used to communicate with, or to abort, an asynchronous operation.</p>' +
        '</main>',
    )
    const doc = parse(html)
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    expect(d.strategy).toBe('article')
    doc.close()
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('article')
    expect(out.mainHtml).toContain('AbortSignal')
    expect(out.mainHtml).toContain('abort')
    expect(out.escalate).toBe(false)
  })

  it('routes a long prose page to article', () => {
    const doc = parse(
      wrap('<article><h1>Essay</h1>' +
        Array.from({ length: 10 }, (_, i) => `<p>Paragraph ${i} with enough prose to satisfy the text length thresholds and count as real content.</p>`).join('') +
        '</article>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('article')
    expect(d.strategy).toBe('article')
    doc.close()
  })

  it('routes a small collection page to collection with article strategy', () => {
    const doc = parse(
      wrap('<main><h1>Seasonal collection 2026</h1><h2>Stoneware</h2>' +
        '<ul><li><a href="/c/1">Cobalt teapot</a></li><li><a href="/c/2">Ash jug</a></li></ul>' +
        '<h2>Porcelain</h2><ul><li><a href="/c/3">Ivory cup</a></li><li><a href="/c/4">Grey saucer</a></li></ul>' +
        '<p>Curated from the winter kiln batch.</p></main>'),
    )
    const d = routePage(doc.document)
    expect(d.type).toBe('collection')
    expect(d.strategy).toBe('article')
    doc.close()
  })

  it('routes a div-based listing to listing with the list strategy', () => {
    // quotes.toscrape.com shape: 55 links in <div class="quote"> cards, no
    // <ul>/<ol> at all, high link density (3.2 links/100 chars).
    const html = wrap(
      '<main><h1>Quotes</h1><div class="container">' +
        Array.from({ length: 10 }, (_, i) =>
          `<div class="quote"><span>Quote ${i} text here</span><a href="/a/${i}">Author ${i}</a><a href="/t/${i}">tag</a></div>`).join('') +
        '</div></main>',
    )
    const d = routePage(parse(html).document)
    expect(d.type).toBe('listing')
    expect(d.strategy).toBe('list')
  })

  it('extracts a div-based listing via the container fallback', () => {
    const html = wrap(
      '<main><h1>Quotes</h1><div class="container">' +
        Array.from({ length: 10 }, (_, i) =>
          `<div class="quote"><span>Quote ${i} text here</span><a href="/a/${i}">Author ${i}</a><a href="/t/${i}">tag</a></div>`).join('') +
        '</div></main>',
    )
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('listing')
    expect(out.escalate).toBe(false)
    expect(out.mainHtml).toContain('Author 0')
    expect(out.mainHtml).toContain('Author 9')
  })

  it('reaches all five PageType values', () => {
    const cases: Array<{ html: string; type: string }> = [
      { html: wrap('<article><h1>Essay</h1>' + Array.from({ length: 10 }, (_, i) => `<p>Paragraph ${i} with enough prose to satisfy the text length thresholds and count as real content.</p>`).join('') + '</article>'), type: 'article' },
      { html: wrap('<main><h1>Logs</h1><ul>' + Array.from({ length: 10 }, (_, i) => `<li><a href="/l/${i}">Log ${i}</a></li>`).join('') + '</ul></main>'), type: 'listing' },
      { html: wrap('<main><h1>Readings</h1><table><tr><th>Station</th><th>Flow</th></tr><tr><td>Meridian</td><td>41</td></tr></table></main>'), type: 'collection' },
      { html: wrap(`<main><h1>Teapot</h1>${TABLE_SNIPPET}<p>Hand-thrown stoneware.</p></main>`, PRODUCT_LD()), type: 'product' },
      { html: wrap(`<main><h1>Thread</h1>${POST_SNIPPET(1)}${POST_SNIPPET(2)}</main>`), type: 'forum' },
    ]
    const seen = new Set(cases.map((c) => {
      const doc = parse(c.html)
      const d = routePage(doc.document)
      doc.close()
      return d.type
    }))
    expect(seen).toEqual(new Set(['article', 'listing', 'collection', 'product', 'forum']))
  })
})

describe('strategies', () => {
  it('selectList picks the list with the most linked items', () => {
    const doc = parse(
      wrap('<main><h1>Catalog</h1><ul>' +
        Array.from({ length: 8 }, (_, i) => `<li><a href="/c/${i}">Item ${i}</a> — description</li>`).join('') +
        '</ul><ul><li>orphan item</li></ul></main>'),
    )
    const list = selectList(doc.document)
    expect(list).not.toBeNull()
    expect(list!.querySelectorAll(':scope > li').length).toBe(8)
    doc.close()
  })

  it('selectTable skips layout tables and picks the data table', () => {
    const doc = parse(
      wrap('<main><h1>Specs</h1>' +
        '<table><tr><td>layout cell</td></tr></table>' +
        '<table><tr><th>Cap</th><th>Glaze</th></tr><tr><td>600ml</td><td>Cobalt</td></tr></table>' +
        '</main>'),
    )
    const table = selectTable(doc.document)
    expect(table).not.toBeNull()
    expect(table!.textContent).toContain('Cobalt')
    doc.close()
  })

  it('selectTable picks the data table inside a layout table, not the layout table around it (Hacker News)', () => {
    const story = (n: number) => `<tr class="athing"><td class="title">${n}.</td><td class="votelinks"><a href="vote?id=${n}"></a></td>` +
      `<td class="title"><a href="https://news.fixture.test/${n}">Story ${n}</a></td></tr>` +
      `<tr><td colspan="2"></td><td class="subtext">${n * 10} points by user${n} | <a href="item?id=${n}">${n} comments</a></td></tr><tr class="spacer"></tr>`
    const html = wrap('<center><table id="hnmain">' +
      '<tr><td><table><tr><td><a href="news">Hacker News</a> <a href="newest">new</a> | <a href="front">past</a></td><td><a href="login">login</a></td></tr></table></td></tr>' +
      `<tr><td><table>${[1, 2, 3, 4].map(story).join('')}</table></td></tr>` +
      '<tr><td><table><tr><td></td></tr></table><center><a href="newsguidelines.html">Guidelines</a> | <a href="newsfaq.html">FAQ</a></center></td></tr>' +
      '</table></center>')
    const doc = parse(html)
    const table = selectTable(doc.document)
    expect(table!.textContent).toContain('Story 4')
    expect(table!.textContent).not.toContain('login')
    expect(table!.textContent).not.toContain('Guidelines')
    doc.close()
    const out = extractTf.extract(html, { url: 'https://news.fixture.test/' })
    expect(out.strategy).toBe('table')
    expect(out.mainHtml).toContain('Story 4')
    expect(out.mainHtml).not.toContain('Guidelines')
  })

  it('selectTable keeps a data table that holds a small table in one cell, not the small table', () => {
    const html = wrap('<div><h2>Kiln survey</h2><table>' +
      '<tr><th>Kiln</th><th>Site</th><th>Firings</th><th>Glazes</th></tr>' +
      '<tr><td>North</td><td>Harbour</td><td>41</td><td><table><tr><td>Cobalt</td><td>12</td></tr><tr><td>Ash</td><td>29</td></tr></table></td></tr>' +
      '<tr><td>South</td><td>Estuary</td><td>37</td><td>Celadon</td></tr>' +
      '<tr><td>West</td><td>Quarry</td><td>22</td><td>Tenmoku</td></tr></table></div>')
    const doc = parse(html)
    expect(selectTable(doc.document)!.textContent).toContain('Quarry')
    doc.close()
    const out = extractTf.extract(html)
    expect(out.strategy).toBe('table')
    const md = htmlToMarkdown(out.mainHtml)
    expect(md).toContain('| North | Harbour | 41 | Cobalt 12 Ash 29 |')
    expect(md).toContain('| West | Quarry | 22 | Tenmoku |')
  })

  // A statistics page: its h1 in a banner, three captioned data tables under h2
  // headings in the content, page chrome around them.
  const statsPage = (heading: 'banner' | 'body' | 'none' | 'two' | 'content') => {
    const rows = (n: number, label: string) => Array.from({ length: n }, (_, i) =>
      `<tr><td>${label} region ${i + 1}</td><td>${1000 + i * 17}</td><td>${1100 + i * 13}</td></tr>`).join('')
    const table = (n: number, caption: string, label: string) =>
      `<table><caption>${caption}</caption><thead><tr><th>Region</th><th>2024 (GWh)</th><th>2025 (GWh)</th></tr></thead><tbody>${rows(n, label)}</tbody></table>`
    const h1 = '<h1>Energy statistics 2025</h1>'
    return wrap(`<header>${heading === 'two' ? '<h1>Statistics office</h1>' : ''}<a href="/">Statistics office</a> <a href="/releases">Releases</a></header>` +
      (heading === 'banner' || heading === 'two' ? `<div class="banner">${h1}</div>` : heading === 'body' ? h1 : '') +
      `<div id="content">${heading === 'content' ? h1 : ''}<p>Final figures for 2025, published 30 September 2026.</p>` +
      `<h2>Electricity</h2>${table(10, 'Table 1: Electricity consumption by region', 'Electricity')}` +
      `<h2>Gas</h2>${table(8, 'Table 2: Gas consumption by region', 'Gas')}` +
      `<h2>Heat</h2>${table(6, 'Table 3: Heat consumption by region', 'Heat')}</div>` +
      '<div class="page-footer"><table><tr><td></td><td></td></tr><tr><td></td><td></td></tr></table>Statistics office, 2026</div>')
  }

  it('selectTable keeps every data table of a table page, with the headings, captions and text between them', () => {
    for (const heading of ['banner', 'body', 'none', 'two', 'content'] as const) {
      const out = extractTf.extract(statsPage(heading), { url: 'https://stats.fixture.test/energy' })
      expect(out.strategy).toBe('table')
      const md = htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl })
      expect(md.match(/^\| --- \| --- \| --- \|$/gm)).toHaveLength(3)
      for (const text of ['Final figures for 2025', '## Electricity', 'Table 1: Electricity consumption by region', '| Electricity region 10 |',
        '## Gas', 'Table 2: Gas consumption by region', '| Gas region 8 |', '## Heat', 'Table 3: Heat consumption by region', '| Heat region 6 |']) {
        expect(md, heading).toContain(text)
      }
      // The page header, the banner and the footer (with its empty spacer table) lie outside the tables' container.
      for (const chrome of ['Releases', 'Statistics office', '|  |  |']) expect(md, heading).not.toContain(chrome)
      // A lone h1 in the tables' own container stays with them.
      expect(md.includes('# Energy statistics 2025'), heading).toBe(heading === 'content')
    }
  })

  it('selectTable leaves out a menu of links laid out as a table in the page\'s side column', () => {
    // NOAA's climate pages: one layout row, a menu table in its left cell, the content in its right cell.
    const menu = '<table>' + ['Climate Outlooks', 'El Niño/La Niña', 'Teleconnections', 'About Us'].map((item, i) => `<tr><td><a href="/m/${i}">${item}</a></td></tr>`).join('') + '</table>'
    const index = `<table><tr><th>Year</th><th>DJF</th><th>JFM</th></tr>${Array.from({ length: 6 }, (_, i) =>
      `<tr><td>${2020 + i}</td><td>-${i}.1</td><td>-${i}.2</td></tr>`).join('')}</table>`
    // Mostly link text, but with figures: data, not a menu.
    const stations = `<table><tr><th>Station</th><th>Readings</th></tr>${['North Harbour buoy', 'South Estuary buoy', 'Quarry Point buoy'].map((station, i) =>
      `<tr><td><a href="/stations/${i}">${station}</a></td><td>${12 + i}</td></tr>`).join('')}</table>`
    const html = wrap(`<table><tr><td class="menu">${menu}</td><td class="content"><h1>Oceanic Niño Index</h1>` +
      `<h2>Historical episodes</h2>${index}<h2>Stations</h2>${stations}</td></tr></table>`)
    const out = extractTf.extract(html, { url: 'https://climate.fixture.test/oni' })
    expect(out.strategy).toBe('table')
    const md = htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl })
    for (const text of ['# Oceanic Niño Index', '## Historical episodes', '| 2025 | -5.1 | -5.2 |', '## Stations', 'Quarry Point buoy', '| 14 |']) expect(md).toContain(text)
    for (const item of ['Climate Outlooks', 'Teleconnections']) expect(md).not.toContain(item)
    // Without its h1, the region is the two tables' container, still without the menu.
    const bare = extractTf.extract(html.replace('<h1>Oceanic Niño Index</h1>', ''), { url: 'https://climate.fixture.test/oni' })
    const bareMd = htmlToMarkdown(bare.mainHtml, { baseUrl: bare.baseUrl })
    for (const text of ['## Historical episodes', '| 2025 | -5.1 | -5.2 |', 'Quarry Point buoy']) expect(bareMd).toContain(text)
    expect(bareMd).not.toContain('Climate Outlooks')
  })

  it('selectTable takes the tables\' container below <body> with a lone h1 that shares it, and the body when only the body holds them all', () => {
    const table = (label: string) => `<table><tr><th>Item</th><th>Value</th></tr><tr><td>${label} one</td><td>1</td></tr><tr><td>${label} two</td><td>2</td></tr></table>`
    const shared = parse(wrap(`<div id="page"><div class="title"><h1>Kiln survey</h1></div><div id="tables">${table('North')}<p>Between the tables.</p>${table('South')}</div></div>`))
    const region = selectTable(shared.document)!
    expect(region.id).toBe('page')
    shared.close()
    const spread = parse(wrap(`<h1>Kiln survey</h1><div>${table('North')}</div><p>Between the tables.</p><div>${table('South')}</div>`))
    expect(selectTable(spread.document)).toBe(spread.document.body)
    spread.close()
  })
})

describe('extractTf page types', () => {
  it('handles an empty body without throwing: escalates, never succeeds', () => {
    // linkedom parses '' to a document with a null documentElement whose
    // body getter throws; parse() must normalize that away (empty 200
    // responses are an everyday crawl case, e.g. the empty-body fixture).
    const out = extractTf.extract('')
    expect(out.escalate).toBe(true)
    expect(out.mainHtml).toBe('')
  })

  it('falls back from a leftover breadcrumb list to the article region', () => {
    const html = wrap(
      '<div>' +
        '<ol class="breadcrumb"><li><a href="/web">Web</a></li><li><a href="/api">Web APIs</a></li><li><a href="/abort">AbortController</a></li><li><a href="/signal">AbortSignal</a></li><li><a href="/fetch">fetch</a></li><li><a href="/more">More APIs</a></li></ol>' +
        '<p>The AbortController interface represents a controller object that allows you to abort one or more Web requests as and when desired.</p>' +
        '<p>You can create a new AbortController object using the AbortController() constructor. Communicating with an asynchronous operation is done using an AbortSignal object.</p>' +
        '<p>Returns an AbortSignal object instance, which can be used to communicate with, or to abort, an asynchronous operation.</p>' +
        '</div>',
    )
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('AbortSignal')
    expect(out.mainHtml).toContain('abort one or more Web requests')
    expect(out.escalate).toBe(false)
  })

  it('extracts a listing page as listing with the list strategy', () => {
    const html = wrap(
      '<main><h1>Bespoke teapot catalog</h1><ul>' +
        Array.from({ length: 10 }, (_, i) =>
          `<li><a href="/pt/item/${i + 1}">Bespoke teapot catalog ${String(i + 1).padStart(2, '0')}</a> — hand-thrown stoneware</li>`).join('') +
        '</ul></main>',
    )
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('listing')
    expect(out.strategy).toBe('list')
    expect(out.mainHtml).toContain('Bespoke teapot catalog 01')
    expect(out.mainHtml).toContain('Bespoke teapot catalog 10')
    expect(out.escalate).toBe(false)
  })

  it('extracts a product page with the product strategy and keeps the description', () => {
    const html = wrap(`<main><h1>Four-spout infusion teapot</h1>${TABLE_SNIPPET}<p>Hand-thrown stoneware with four spouts for even infusion.</p></main>`, PRODUCT_LD())
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('product')
    expect(out.strategy).toBe('product')
    expect(out.mainHtml).toContain('Cobalt ash')
    expect(out.mainHtml).toContain('four spouts')
    expect(out.escalate).toBe(false)
  })

  it('keeps a product page product even when it has no table', () => {
    // Page type and strategy are independent, but a product page now gets
    // the product strategy either way — the spec table is one piece of the
    // product region, not the thing that selects a strategy.
    const html = wrap(
      '<main><h1>Hand-thrown teacup</h1><p>Thrown from harbour clay, glazed with cobalt ash.</p></main>',
      PRODUCT_LD(),
    )
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('product')
    expect(out.escalate).toBe(false)
    expect(out.mainHtml).toContain('harbour clay')
  })

  it('extracts a forum thread as forum via the article cascade, both posts intact', () => {
    const html = wrap(`<main><h1>Thread: best kiln temperature</h1>${POST_SNIPPET(1)}${POST_SNIPPET(2)}</main>`)
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('forum')
    expect(out.strategy).toBe('article')
    expect(out.mainHtml).toContain('Post body 1')
    expect(out.mainHtml).toContain('Post body 2')
    expect(out.escalate).toBe(false)
  })

  it('keeps type and strategy distinct: table strategy is not a product proof', () => {
    const readings = wrap(
      '<main><h1>Readings</h1><table><tr><th>Station</th><th>Flow</th></tr><tr><td>Meridian</td><td>41</td></tr></table></main>',
    )
    const out = extractTf.extract(readings)
    expect(out.pageType).toBe('collection')
    expect(out.strategy).toBe('table')
    expect(out.escalate).toBe(false)
  })
})
