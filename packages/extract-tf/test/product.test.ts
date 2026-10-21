import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown } from '../src/index.js'
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
    expect(out.product?.name).toEqual({ value: 'Four-spout infusion teapot', source: 'jsonld', path: '/script/0/name' })
    expect(out.product?.price).toEqual({ value: '84.00', source: 'jsonld', path: '/script/0/offers/price', unit: 'USD', context: { offerType: 'Offer' } })
    expect(out.product?.sku).toEqual({ value: 'TP-4S-600', source: 'jsonld', path: '/script/0/sku' })
    expect(out.product?.brand).toEqual({ value: 'Harbour Clay', source: 'jsonld', path: '/script/0/brand/name' })
    expect(out.product?.availability).toEqual({ value: 'InStock', rawValue: 'https://schema.org/InStock', source: 'jsonld', path: '/script/0/offers/availability', context: { offerType: 'Offer' } })
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
    expect(out.product?.price).toEqual({ value: '129.50', source: 'microdata', path: 'microdata[0] [itemprop~="price"]', unit: 'GBP' })
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
    expect(out.product?.price).toEqual({ value: '18.00', source: 'jsonld', path: '/script/0/offers/price', context: { offerType: 'Offer' } })
    expect(out.product?.priceCurrency).toEqual({ value: 'EUR', source: 'meta', path: 'meta[property="product:price:currency"]' })
    expect(out.product?.brand).toEqual({ value: 'Estuary Ceramics', source: 'meta', path: 'meta[property="product:brand"]' })
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
    expect(out.product?.price).toEqual({ value: '42.00', source: 'meta', path: 'meta[property="product:price:amount"]', unit: 'USD' })
  })
})

/**
 * Which product a page's declarations are about. A page can declare several
 * products (a recommendation, a variant family, a bundle's parts); the facts
 * reported are the requested product's, bound by what the page and the URL
 * say about identity, never by which node came first.
 */
describe('PDP facts: the subject is chosen before fields are merged', () => {
  const ld = (json: object): string => `<script type="application/ld+json">${JSON.stringify(json)}</script>`
  const page = (head: string, body = '') => `<!doctype html><html><head><title>Shop</title>${head}</head><body><main>
<h1>Product</h1><p>A product page with a description long enough to read as one, about how the thing is made and used.</p>${body}
</main></body></html>`

  it('takes the product the URL names, not a recommended product declared before it', () => {
    const html = page(`<link rel="canonical" href="https://shop.example/products/walnut-board">` +
      ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Maple cutting board', sku: 'MB-200', url: 'https://shop.example/products/maple-board', offers: { '@type': 'Offer', price: '39.00', priceCurrency: 'USD' } }) +
      ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Walnut serving board', sku: 'WB-450', url: 'https://shop.example/products/walnut-board', offers: { '@type': 'Offer', price: '64.00', priceCurrency: 'USD', availability: 'https://schema.org/InStock' } }))
    const out = extractTf.extract(html, { url: 'https://shop.example/products/walnut-board' })
    expect(out.product?.name).toEqual({ value: 'Walnut serving board', source: 'jsonld', path: '/script/1/name' })
    expect(out.product?.price).toEqual({ value: '64.00', source: 'jsonld', path: '/script/1/offers/price', unit: 'USD', context: { offerType: 'Offer' } })
    expect(out.product?.sku?.value).toBe('WB-450')
    expect(out.product?.identity?.status).toBe('matched')
    expect(out.product?.identity?.observedSelectedId).toBe('WB-450')
  })

  it('reports conflicting, and no fields, when nothing tells two declared products apart', () => {
    const html = page(
      ld({ '@type': 'Product', name: 'Maple cutting board', sku: 'MB-200', offers: { price: '39.00', priceCurrency: 'USD' } }) +
      ld({ '@type': 'Product', name: 'Walnut serving board', sku: 'WB-450', offers: { price: '64.00', priceCurrency: 'USD' } }))
    const out = extractTf.extract(html, { url: 'https://shop.example/products/boards' })
    expect(out.product?.identity?.status).toBe('conflicting')
    expect(out.product?.identity?.requestedId).toBeNull()
    expect(out.product?.name).toBeNull()
    expect(out.product?.price).toBeNull()
    expect(out.product?.sku).toBeNull()
    // Both share a currency: a fact true of every candidate is still reported.
    expect(out.product?.priceCurrency?.value).toBe('USD')
  })

  it('does not lend the subject another product\'s microdata price', () => {
    const html = page(
      ld({ '@type': 'Product', name: 'Linen apron', sku: 'LA-01', url: 'https://shop.example/products/linen-apron' }),
      `<aside><div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Canvas tote</span><meta itemprop="sku" content="CT-09">
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span class="price" itemprop="price" content="22.00">$22.00</span><meta itemprop="priceCurrency" content="USD"></div></div></aside>`)
    const out = extractTf.extract(html, { url: 'https://shop.example/products/linen-apron' })
    expect(out.product?.name?.value).toBe('Linen apron')
    expect(out.product?.price).toBeNull()
    expect(out.product?.priceCurrency).toBeNull()
    expect(out.product?.identity?.status).toBe('matched')
    expect(out.product?.identity?.identityEvidence.join('\n')).toMatch(/microdata\[0\].*CT-09.*another product/)
  })

  it('takes the variant a ProductGroup page\'s URL selects', () => {
    const variant = (sku: string, size: string, price: string, availability: string) =>
      ({ '@type': 'Product', name: `Organic cotton tee - ${size}`, sku, size, offers: { '@type': 'Offer', price, priceCurrency: 'EUR', availability: `https://schema.org/${availability}` } })
    const html = page(ld({
      '@context': 'https://schema.org', '@type': 'ProductGroup', name: 'Organic cotton tee', productGroupID: 'TEE', brand: { '@type': 'Brand', name: 'Fieldwork' },
      variesBy: ['https://schema.org/size'],
      hasVariant: [variant('T-S', 'S', '28.00', 'InStock'), variant('T-M', 'M', '28.00', 'InStock'), variant('T-XL', 'XL', '32.00', 'OutOfStock')],
    }))
    const out = extractTf.extract(html, { url: 'https://shop.example/products/tee?variant=T-XL' })
    expect(out.product?.sku).toEqual({ value: 'T-XL', source: 'jsonld', path: '/script/0/hasVariant/2/sku', context: { variant: 'T-XL' } })
    // The page's product meta tags state its default variant's price; they name none of the declared products.
    const withMeta = extractTf.extract(html.replace('</head>', '<meta property="og:price:amount" content="28.00"><meta property="og:price:currency" content="EUR"></head>'), { url: 'https://shop.example/products/tee?variant=T-XL' })
    expect(withMeta.product?.price?.value).toBe('32.00')
    expect(withMeta.product?.ambiguous).toBeUndefined()
    expect(out.product?.price).toEqual({ value: '32.00', source: 'jsonld', path: '/script/0/hasVariant/2/offers/price', unit: 'EUR', context: { offerType: 'Offer', variant: 'T-XL' } })
    expect(out.product?.availability?.value).toBe('OutOfStock')
    // The group's own properties hold for each of its variants.
    expect(out.product?.brand).toEqual({ value: 'Fieldwork', source: 'jsonld', path: '/script/0/brand/name', context: { variant: 'T-XL' } })
    expect(out.product?.identity).toMatchObject({ status: 'matched', requestedId: 'T-XL', observedSelectedId: 'T-XL', parentId: 'TEE' })
  })

  it('takes the offer the URL selects from an offers array, not the first', () => {
    const product = (offers: object[]) => page(ld({ '@type': 'Product', name: 'Knife block', sku: 'KN-8', offers }))
    const offers = [
      { '@type': 'Offer', sku: 'KN-8-OAK', url: 'https://shop.example/products/knife-block?variant=oak', price: '120.00', priceCurrency: 'USD' },
      { '@type': 'Offer', sku: 'KN-8-ASH', url: 'https://shop.example/products/knife-block?variant=ash', price: '98.00', priceCurrency: 'USD' },
    ]
    const selected = extractTf.extract(product(offers), { url: 'https://shop.example/products/knife-block?variant=ash' })
    expect(selected.product?.price).toEqual({ value: '98.00', source: 'jsonld', path: '/script/0/offers/1/price', unit: 'USD', context: { offerType: 'Offer' } })
    // Without a selection, offers that disagree leave the price unstated, with both recorded.
    const unselected = extractTf.extract(product(offers), { url: 'https://shop.example/products/knife-block' })
    expect(unselected.product?.price).toBeNull()
    expect(unselected.product?.priceCurrency?.value).toBe('USD')
    expect(unselected.product?.ambiguous?.find((item) => item.field === 'price')?.facts.map((f) => f.path))
      .toEqual(['/script/0/offers/0/price', '/script/0/offers/1/price'])
  })

  it('does not merge another product whose @id differs only by its fragment', () => {
    const related = page(ld({ '@type': 'Product', '@id': 'https://shop.example/p/a#product', name: 'A', sku: 'A1', offers: { price: '10', priceCurrency: 'USD' },
      isRelatedTo: [{ '@type': 'Product', '@id': 'https://shop.example/p/a#related-0', name: 'B', brand: 'OtherBrand' }] }))
    const a = extractTf.extract(related, { url: 'https://shop.example/p/a' })
    expect(a.product?.identity?.status).toBe('matched')
    expect(a.product?.name?.value).toBe('A')
    expect(a.product?.brand).toBeNull()
    const review = page(ld({ '@graph': [
      { '@type': 'Product', '@id': 'https://blog.example/best-kettles/#kettle-a', name: 'Kettle A', brand: 'Acme' },
      { '@type': 'Product', '@id': 'https://blog.example/best-kettles/#kettle-b', name: 'Kettle B', offers: { price: '49.99', priceCurrency: 'USD' } },
    ] }))
    // The page's meta tags still describe its product when the others are only related items nested in it.
    const withMeta = extractTf.extract(related.replace('</head>', '<meta property="product:brand" content="Harbour Clay"></head>'), { url: 'https://shop.example/p/a' })
    expect(withMeta.product?.brand).toEqual({ value: 'Harbour Clay', source: 'meta', path: 'meta[property="product:brand"]' })
    const kettles = extractTf.extract(review, { url: 'https://blog.example/best-kettles/' })
    expect(kettles.product?.identity?.status).toBe('conflicting')
    expect(kettles.product?.price).toBeNull()
  })

  it('still reads the visible price when the other declared products are only listed or related items', () => {
    const html = page(ld({ '@type': 'Product', name: 'Harbour lamp', sku: 'HL-1' }) +
      ld({ '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', item: { '@type': 'Product', name: 'Mirror', sku: 'HM-2' } }] }),
      '<div class="product-price">£19.00</div>')
    const out = extractTf.extract(html, { url: 'https://shop.example/lamp' })
    expect(out.product?.identity?.status).toBe('matched')
    expect(out.product?.price).toMatchObject({ value: '£19.00', source: 'text' })
  })

  it('reads a listing whose declared products have an empty name (Zara, T016)', () => {
    // Zara's category page (2026-10-21) lists products with `"name": ""` beside named ones; comparing those declarations threw.
    const item = (name: string, price: number) => ({ '@type': 'ListItem', item: { '@type': 'Product', name, offers: { '@type': 'Offer', price, priceCurrency: 'USD' } } })
    const html = page(ld({ '@type': 'ItemList', itemListElement: [item('', 0), item('', 0), item('RELAXED FIT FLUID SHIRT', 99.9), item('LINEN SHIRT', 49.9)] }),
      '<h1>Shirts</h1><ul><li>RELAXED FIT FLUID SHIRT $99.90</li><li>LINEN SHIRT $49.90</li></ul>')
    const out = extractTf.extract(html, { url: 'https://www.zara.com/us/en/man-shirts-l737.html' })
    expect(out.mainHtml).toContain('LINEN SHIRT')
    expect(out.product?.name?.value ?? null).not.toBe('')
  })

  it('binds microdata that writes the same product differently', () => {
    const cases: Array<[string, string, Record<string, string>]> = [
      // An entity escaped twice in the JSON-LD; the microdata names no SKU.
      [ld({ '@type': 'Product', name: 'Tom &amp; Jerry Mug', sku: 'M1', offers: { price: '10', priceCurrency: 'USD' } }),
        '<div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Tom &amp; Jerry Mug</h1><span itemprop="brand">Acme</span></div>', { price: '10', brand: 'Acme' }],
      // The parent's SKU in microdata, the variants' in the JSON-LD offers.
      [ld({ '@type': 'Product', name: 'Tee', offers: [{ '@type': 'Offer', sku: 'TEE-S', price: '20', priceCurrency: 'USD' }, { '@type': 'Offer', sku: 'TEE-M', price: '20', priceCurrency: 'USD' }] }),
        '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Tee</span><meta itemprop="sku" content="TEE"><span itemprop="brand">Acme</span></div>', { price: '20', brand: 'Acme' }],
      // One SKU written two ways, one GTIN with and without its leading zero.
      [ld({ '@type': 'Product', name: 'Bowl', sku: 'AB-123', gtin13: '0012345678905', offers: { price: '5', priceCurrency: 'USD' } }),
        '<div itemscope itemtype="https://schema.org/Product"><meta itemprop="sku" content="ab123"><span itemprop="brand">Acme</span></div>', { price: '5', brand: 'Acme' }],
      [ld({ '@type': 'Product', name: 'Plate', gtin13: '0012345678905', offers: { price: '6', priceCurrency: 'USD' } }),
        '<div itemscope itemtype="https://schema.org/Product"><meta itemprop="gtin13" content="012345678905"><span itemprop="brand">Acme</span></div>', { price: '6', brand: 'Acme' }],
      // A variant suffix on the microdata name, no identifier on either side.
      [ld({ '@type': 'Product', name: 'Mug', offers: { price: '7', priceCurrency: 'USD' } }),
        '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Mug - Blue</span><span itemprop="brand">Acme</span></div>', { price: '7', brand: 'Acme' }],
    ]
    for (const [head, body, expected] of cases) {
      const out = extractTf.extract(page(head, body), { url: 'https://shop.example/p/item' })
      expect(out.product?.identity?.status).toBe('matched')
      expect({ price: out.product?.price?.value, brand: out.product?.brand?.value }).toEqual(expected)
    }
  })

  it('keeps a price two sources state differently for one SKU as conflicting, not either one', () => {
    const html = page(
      ld({ '@type': 'Product', name: 'Cast iron kettle', sku: 'CI-900', offers: { '@type': 'Offer', price: '129.50', priceCurrency: 'GBP' } }),
      `<div itemscope itemtype="https://schema.org/Product"><meta itemprop="sku" content="CI-900">
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="119.50"><meta itemprop="priceCurrency" content="GBP">
<span class="price">£119.50</span></div></div>`)
    const out = extractTf.extract(html, { url: 'https://shop.example/kettle' })
    expect(out.product?.price).toBeNull()
    expect(out.product?.priceCurrency?.value).toBe('GBP')
    expect(out.product?.quoteState).toBe('conflicting')
    expect(out.product?.ambiguous).toEqual([{
      field: 'price',
      facts: [
        { value: '129.50', source: 'jsonld', path: '/script/0/offers/price', unit: 'GBP', context: { offerType: 'Offer' } },
        { value: '119.50', source: 'microdata', path: 'microdata[0] [itemprop~="price"]', unit: 'GBP' },
      ],
    }])
  })
})

describe('PDP facts: what each fact holds for (D3b field contract)', () => {
  const ld = (json: object): string => `<script type="application/ld+json">${JSON.stringify(json)}</script>`
  const page = (head: string, body = '') => `<!doctype html><html><head><title>Shop</title>${head}</head><body><main>
<h1>Product</h1><p>A product page with a description long enough to read as one, about how the thing is made and used.</p>${body}
</main></body></html>`

  it('keeps the value as written beside the one reported, and the offer a price is stated in', () => {
    const html = page(ld({ '@type': 'Product', name: 'Harbour lamp', sku: 'HL-1', offers: {
      '@type': 'AggregateOffer', price: '19.00', priceCurrency: 'GBP', eligibleRegion: 'GB', availability: 'https://schema.org/InStock',
    } }))
    const out = extractTf.extract(html, { url: 'https://shop.example/lamp' })
    expect(out.product?.price).toEqual({
      value: '19.00', source: 'jsonld', path: '/script/0/offers/price', unit: 'GBP', context: { offerType: 'AggregateOffer', region: 'GB' },
    })
    expect(out.product?.availability).toEqual({
      value: 'InStock', rawValue: 'https://schema.org/InStock', source: 'jsonld', path: '/script/0/offers/availability', context: { offerType: 'AggregateOffer', region: 'GB' },
    })
    // A name is about the product, not one of its offers.
    expect(out.product?.name).toEqual({ value: 'Harbour lamp', source: 'jsonld', path: '/script/0/name' })
  })

  it('names the variant a ProductGroup variant\'s facts hold for', () => {
    const html = page(ld({
      '@type': 'ProductGroup', name: 'Organic cotton tee', productGroupID: 'TEE',
      hasVariant: [
        { '@type': 'Product', sku: 'T-S', offers: { '@type': 'Offer', price: '28.00', priceCurrency: 'EUR' } },
        { '@type': 'Product', sku: 'T-XL', offers: { '@type': 'Offer', price: '32.00', priceCurrency: 'EUR' } },
      ],
    }))
    const out = extractTf.extract(html, { url: 'https://shop.example/products/tee?variant=T-XL' })
    expect(out.product?.price).toEqual({ value: '32.00', source: 'jsonld', path: '/script/0/hasVariant/1/offers/price', unit: 'EUR', context: { offerType: 'Offer', variant: 'T-XL' } })
    expect(out.product?.sku?.context).toEqual({ variant: 'T-XL' })
  })

  it('keeps a unit and context only where every offer stating the value states the same', () => {
    const html = page(ld({ '@type': 'Product', name: 'Lamp', offers: [
      { '@type': 'Offer', price: '10', priceCurrency: 'USD', eligibleRegion: 'US', availability: 'https://schema.org/InStock' },
      { '@type': 'Offer', price: '10', priceCurrency: 'EUR', eligibleRegion: 'DE', availability: 'https://schema.org/InStock' },
    ] }))
    const out = extractTf.extract(html, { url: 'https://shop.example/lamp' })
    expect(out.product?.price).toEqual({ value: '10', source: 'jsonld', path: '/script/0/offers/0/price' })
    expect(out.product?.availability?.context).toBeUndefined()
    expect(out.product?.priceCurrency).toBeNull()
  })

  it('marks a value the page states there is none of as absent, and leaves an unstated one null', () => {
    const html = page('', `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Cast iron kettle</span>
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="price">N/A</span></div></div>`)
    const out = extractTf.extract(html, { url: 'https://shop.example/kettle' })
    expect(out.product?.price).toEqual({ value: 'N/A', source: 'microdata', path: 'microdata[0] [itemprop~="price"]', absent: true })
    // Unobserved: nothing on the page states a brand.
    expect(out.product?.brand).toBeNull()
  })
})

/**
 * A multi-variant product page shaped like OTTO's (D6): one Product node per
 * variant, each naming its variant by a `variationId` PropertyValue, the
 * family page as the canonical link, and a buy box showing a starting price
 * ("ab"), a struck-through UVP and a monthly instalment beside the price.
 * Synthetic: no retained page.
 */
describe('PDP facts: a selected variant and the kinds of price a page shows (D6)', () => {
  const ld = (json: object): string => `<script type="application/ld+json">${JSON.stringify(json)}</script>`
  const FAMILY = 'https://shop.fixture.test/p/notebook-n15-40-6-cm-16-zoll-1000000001/'
  const VARIANTS = [
    { variation: 'V200', article: '56390001', name: 'Notebook N15 (40,6 cm/16 Zoll, 16 GB RAM, 512 GB SSD)', price: '1299.00' },
    { variation: 'V201', article: '56390002', name: 'Notebook N15 (40,6 cm/16 Zoll, 32 GB RAM, 1000 GB SSD)', price: '1599.00' },
    { variation: 'V202', article: '56390003', name: 'Notebook N15 (40,6 cm/16 Zoll, 64 GB RAM, 2000 GB SSD)', price: '1999.00' },
  ]
  const node = (v: typeof VARIANTS[number], url: string) => ({
    '@context': 'https://schema.org', '@type': 'Product', name: v.name, sku: v.article, url, brand: { '@type': 'Brand', name: 'Fixture' },
    additionalProperty: [{ '@type': 'PropertyValue', name: 'variationId', value: v.variation }],
    offers: [{ '@type': 'Offer', price: v.price, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url }],
  })
  const box = (retail: string) => `<div class="pdp-price"><span class="pdp-price__retail">${retail}</span>` +
    '<span class="pdp-price__uvp">UVP <span class="pdp-price__value pdp-price__value--strikethrough">2.199,00 €</span></span></div>' +
    '<div class="pdp-installment-price">20,00 € mtl. in 48 Raten</div>'
  // The meta tags state the default variant, as a family page's do.
  const META = `<meta property="og:title" content="${VARIANTS[0]!.name}"><meta property="og:price:amount" content="1299.00"><meta property="og:price:currency" content="EUR">`
  const page = (head: string, retail: string) => `<!doctype html><html><head><title>Notebook N15</title><link rel="canonical" href="${FAMILY}">${head}</head>
<body><main><h1>Notebook N15</h1>${box(retail)}
<p>A sixteen-inch notebook whose configurations differ in memory and storage; the chosen configuration has its own article number and price.</p>
</main></body></html>`
  const declared = (urlOf: (v: typeof VARIANTS[number]) => string) => VARIANTS.map((v) => ld(node(v, urlOf(v)))).join('')

  it('delivers the name, SKU and price of the variant the URL selects by its declared variationId', () => {
    const url = `${FAMILY}?variationId=V201`
    // Each variant's node names the family page, as the canonical link does; only its variationId tells them apart.
    const out = extractTf.extract(page(META + declared(() => FAMILY), 'ab 1.299,00 €'), { url })
    expect(out.product?.identity).toMatchObject({
      status: 'matched', requestedId: 'V201', observedSelectedId: '56390002',
      selectedVariants: [{ name: 'variationId', value: 'V201', selected: true, source: 'jsonld', path: '/script/1/additionalProperty/0/value' }],
    })
    expect(out.product?.name).toEqual({ value: VARIANTS[1]!.name, source: 'jsonld', path: '/script/1/name', context: { variant: 'V201' } })
    expect(out.product?.sku?.value).toBe('56390002')
    expect(out.product?.price).toEqual({ value: '1599.00', source: 'jsonld', path: '/script/1/offers/0/price', unit: 'EUR', context: { offerType: 'Offer', variant: 'V201' } })
    // The page's meta tags state its default variant; they name none of the declared products.
    expect(out.product?.ambiguous).toBeUndefined()
    // Nodes whose url carries the selection too, as OTTO's listing cards do.
    const linked = extractTf.extract(page(declared((v) => `${FAMILY}?variationId=${v.variation}`), 'ab 1.299,00 €'), { url })
    expect(linked.product?.sku?.value).toBe('56390002')
    expect(linked.product?.price?.value).toBe('1599.00')
  })

  it('keeps the subject conflicting when the URL selects no variant, and never reads the starting price as its price', () => {
    // D2: the family URL names no variant, so nothing tells the three apart; only what all of them state alike is reported.
    const out = extractTf.extract(page(META + declared(() => FAMILY), 'ab 1.299,00 €'), { url: FAMILY })
    expect(out.product?.identity?.status).toBe('conflicting')
    expect(out.product?.identity?.selectedVariants).toEqual([])
    expect(out.product?.name).toBeNull()
    expect(out.product?.sku).toBeNull()
    expect(out.product?.price).toBeNull()
    expect(out.product?.priceCurrency?.value).toBe('EUR')
    // A variationId that no declared node carries selects nothing either.
    const unknown = extractTf.extract(page(declared(() => FAMILY), 'ab 1.299,00 €'), { url: `${FAMILY}?variationId=V999` })
    expect(unknown.product?.identity?.status).toBe('conflicting')
  })

  it('reads the current price beside a struck-through UVP and a monthly instalment, and names each kind', () => {
    // No declared offer and no price meta: the price is read from the visible buy box.
    const head = ld({ '@type': 'Product', name: VARIANTS[1]!.name, sku: VARIANTS[1]!.article })
    const out = extractTf.extract(page(head, '1.599,00 €'), { url: `${FAMILY}?variationId=V201` })
    expect(out.product?.price).toMatchObject({ value: '1.599,00 €', source: 'text', context: { offerType: 'current' } })
    expect(out.product?.prices?.map((p) => [p.amount.value, p.amount.rawValue ?? null, p.priceType, p.amount.context?.offerType])).toEqual([
      ['1.599,00 €', null, 'current', 'current'],
      ['2.199,00 €', 'UVP 2.199,00 €', 'list', 'list'],
      ['20,00 €', '20,00 € mtl. in 48 Raten', 'other', 'installment'],
    ])
  })

  it('reports no price when the buy box shows only a starting price, a UVP and an instalment', () => {
    const head = ld({ '@type': 'Product', name: VARIANTS[1]!.name, sku: VARIANTS[1]!.article })
    const out = extractTf.extract(page(head, 'ab 1.299,00 €'), { url: FAMILY })
    expect(out.product?.price).toBeNull()
    expect(out.product?.prices?.map((p) => [p.amount.value, p.amount.rawValue ?? null, p.priceType, p.amount.context?.offerType])).toEqual([
      ['1.299,00 €', 'ab 1.299,00 €', 'other', 'from'],
      ['2.199,00 €', 'UVP 2.199,00 €', 'list', 'list'],
      ['20,00 €', '20,00 € mtl. in 48 Raten', 'other', 'installment'],
    ])
  })

  it('leaves a single product page as it was: its price, no price kinds, no variant', () => {
    const out = extractTf.extract(PDP(PRODUCT_LD), { url: 'https://shop.example/p/teapot?variationId=TP-4S-600-B' })
    expect(out.product?.price).toEqual({ value: '84.00', source: 'jsonld', path: '/script/0/offers/price', unit: 'USD', context: { offerType: 'Offer' } })
    expect(out.product?.identity).toMatchObject({ status: 'matched', selectedVariants: [] })
    expect(out.product?.prices).toBeUndefined()
    const doc = parse(PDP())
    pruneRecommendations(doc.document)
    const text = collectProductFacts(doc.document)
    doc.close()
    expect(text.price).toEqual({ value: '$84.00', source: 'text', path: 'span.a-price' })
    expect(text.prices).toBeUndefined()
    // A declared property whose name is not the query parameter's selects nothing.
    const colours = ['blue', 'green'].map((colour) => ld({ '@type': 'Product', name: `Mug ${colour}`, sku: `MUG-${colour}`, url: 'https://shop.example/p/mug',
      additionalProperty: [{ '@type': 'PropertyValue', name: 'color', value: colour }], offers: { '@type': 'Offer', price: '9.00', priceCurrency: 'USD' } })).join('')
    const mug = extractTf.extract(`<!doctype html><html><head>${colours}</head><body><main><h1>Mug</h1><p>A stoneware mug glazed by hand in two colours, each fired twice.</p></main></body></html>`,
      { url: 'https://shop.example/p/mug?variant=blue' })
    expect(mug.product?.identity?.status).toBe('conflicting')
  })

  it('reads the price kinds in the buy box only, never a shipping or add-on price in its place', () => {
    const head = ld({ '@type': 'Product', name: 'Sofa Lund', sku: 'SL-1' })
    const sofa = (beside: string) => `<!doctype html><html><head>${head}</head><body><main><h1>Sofa Lund</h1>
<div class="buybox"><div class="wrap"><div class="inner"><span class="price">ab 999,00 €</span></div></div>${beside}
<p>A three-seat sofa in woven wool, its frame of solid oak, delivered assembled.</p></div></main></body></html>`
    for (const beside of ['<p class="shipping">Versand <span class="shipping-price">4,95 €</span></p>', '<div class="addon"><span class="price">49,00 €</span></div>']) {
      const out = extractTf.extract(sofa(beside), { url: 'https://shop.fixture.test/p/sofa' })
      expect(out.product?.price).toBeNull()
      expect(out.product?.prices?.map((p) => [p.amount.value, p.amount.context?.offerType])).toEqual([['999,00 €', 'from']])
    }
  })

  it('keeps a lone price whose label or note names no other kind of its own amount', () => {
    const head = ld({ '@type': 'Product', name: 'Lamp', sku: 'LP-1' })
    const lamp = (box: string) => `<!doctype html><html><head>${head}</head><body><main><h1>Lamp</h1>${box}
<p>A brass reading lamp with a linen shade, wired for any European socket.</p></main></body></html>`
    // A note after the amount that financing exists, and Spain's statutory retail price label.
    // A former price written as plain text before it ("statt", "UVP"): the label is that amount's, not this one's.
    for (const [box, price] of [['<div><span class="price">499,00 €</span> <small>auch in Raten</small></div>', '499,00 €'], ['<div class="product-price">PVP: 19,99 €</div>', '19,99 €'],
      ['<p>statt 29,99 € <span class="price">19,99 €</span></p>', '19,99 €'], ['<div><span class="old">UVP 29,00 €</span> <span class="price">19,99 €</span></div>', '19,99 €'],
      ['<div><!--ab--><span class="price">19,99 €</span><!--[-1--></div>', '19,99 €']]) {
      const out = extractTf.extract(lamp(box!), { url: 'https://shop.fixture.test/p/lamp' })
      expect(out.product?.price?.value).toBe(price)
      expect(out.product?.prices).toBeUndefined()
    }
  })

  it('reads a price beside thousands of nested empty elements without exhausting the stack', () => {
    const html = `<!doctype html><html><head>${ld({ '@type': 'Product', name: 'Lamp', sku: 'LP-1' })}</head><body><main><h1>Lamp</h1>
<div><span class="price">19,99 €</span>${'<span>'.repeat(20_000)}${'</span>'.repeat(20_000)}</div>
<p>A brass reading lamp with a linen shade, wired for any European socket.</p></main></body></html>`
    expect(extractTf.extract(html, { url: 'https://s.test/p/x' }).product?.price?.value).toBe('19,99 €')
  })

  it('does not split one product over a descriptive property written two ways', () => {
    const html = `<!doctype html><html><head>${ld({ '@type': 'Product', name: 'Mug', sku: 'MUG-1', url: 'https://s.test/p/mug',
      additionalProperty: [{ '@type': 'PropertyValue', name: 'Material', value: 'Stoneware' }], offers: { '@type': 'Offer', price: '9.00', priceCurrency: 'EUR' } })}${ld({
      '@type': 'Product', name: 'Mug', url: 'https://s.test/p/mug', additionalProperty: [{ '@type': 'PropertyValue', name: 'Material', value: 'Stoneware (glazed)' }],
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 10 } })}</head><body><main><h1>Mug</h1>
<p>A stoneware mug glazed by hand, fired twice, holding a third of a litre.</p></main></body></html>`
    const out = extractTf.extract(html, { url: 'https://s.test/p/mug' })
    expect(out.product?.identity?.status).toBe('matched')
    expect(out.product?.price?.value).toBe('9.00')
    expect(out.product?.sku?.value).toBe('MUG-1')
  })
})

/**
 * A route page shaped like a flight-comparison site's (D6, aggregate offers):
 * the page declares one Product whose only offer is an AggregateOffer with a
 * lowPrice, and shows the offers it aggregates as a grid of linked, priced
 * cards with no heading of their own, beside one bigger "from" price. The
 * cards are the subject's offers, not recommendations, and the lowPrice is a
 * bound across them, not a price of the subject. Synthetic: no retained page.
 */
describe('PDP facts: a product that declares only aggregate offers (D6)', () => {
  const ld = (json: object): string => `<script type="application/ld+json">${JSON.stringify(json)}</script>`
  const cards = (prefix = 'Offer') => `<div class="deal-grid">${[1, 2, 3].map((i) =>
    `<div class="deal-card"><a href="/offers/${prefix}-${i}">${prefix} ${i}, departing ${i} January, one way</a><span class="deal-price">£${20 + i}</span>` +
    `<p>Direct travel from North to South with carrier ${i}, taxes and charges included.</p></div>`).join('')}</div>`
  const AGGREGATE = { '@type': 'AggregateOffer', lowPrice: 21, priceCurrency: 'GBP' }
  const page = (offers: unknown, extra = '') => `<!doctype html><html><head>${ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Travel from North to South', offers })}</head>
<body><main><h1>Travel from North to South</h1><p>Compare the travel offers for this route found in the last days, and choose the departure that suits your journey.</p>
<div class="hero"><span class="hero-price">£64</span></div>${cards()}${extra}</main></body></html>`
  const URL = 'https://travel.fixture.test/routes/north/south/'
  const markdown = (html: string) => {
    const out = extractTf.extract(html, { url: URL })
    return { out, md: htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl }) }
  }

  it('keeps every aggregated offer card and reads no visible price as the subject price', () => {
    const { out, md } = markdown(page(AGGREGATE))
    expect(out.pageType).toBe('product')
    for (const i of [1, 2, 3]) {
      expect(md).toContain(`[Offer ${i}, departing ${i} January, one way](https://travel.fixture.test/offers/Offer-${i})`)
      expect(md).toContain(`£${20 + i}`)
    }
    // Neither the lowPrice (a bound across offers) nor a visible price is the subject's one price.
    expect(out.product?.price).toBeNull()
    expect(out.product?.prices).toBeUndefined()
    expect(out.product?.priceCurrency?.value).toBe('GBP')
    expect(out.product?.identity?.identityEvidence.some((e) => /AggregateOffer/.test(e))).toBe(true)
  })

  it('recognises the aggregate type however it is written', () => {
    for (const type of ['https://schema.org/AggregateOffer', 'schema:AggregateOffer', ['AggregateOffer']]) {
      expect(markdown(page({ ...AGGREGATE, '@type': type })).md).toContain('Offer 1, departing 1 January')
    }
    expect(markdown(page([AGGREGATE, { ...AGGREGATE, lowPrice: '23.50', priceCurrency: 'GBP' }])).md).toContain('Offer 3, departing 3 January')
  })

  it('still removes a labelled recommendation section beside the aggregated offers', () => {
    const { md } = markdown(page(AGGREGATE, `<section><h2>Customers also viewed</h2>${cards('Unrelated')}</section>`))
    expect(md).toContain('Offer 1, departing 1 January')
    expect(md).not.toContain('Unrelated 1, departing')
  })

  it('leaves a product with a single declared price as it was: the unlabelled grid is cut, the declared price kept', () => {
    const { out, md } = markdown(page({ '@type': 'Offer', price: 84, priceCurrency: 'GBP' }))
    expect(md).not.toContain('Offer 1, departing')
    expect(out.product?.price?.value).toBe('84')
  })

  it('does not take an untyped, invalid or priced aggregate as aggregate offers', () => {
    for (const offers of [{ lowPrice: 21, priceCurrency: 'GBP' }, { ...AGGREGATE, lowPrice: '' }, { ...AGGREGATE, lowPrice: 'unknown' }, { ...AGGREGATE, lowPrice: -1 },
      { '@type': 'AggregateOffer', priceCurrency: 'GBP' }, [AGGREGATE, { '@type': 'Offer', price: 84, priceCurrency: 'GBP' }]]) {
      expect(markdown(page(offers)).md).not.toContain('Offer 1, departing')
    }
  })

  it('keeps only a grid whose prices fill the aggregate range', () => {
    // Cards at 21, 22, 23: one at the lowPrice, none outside the range.
    expect(markdown(page({ ...AGGREGATE, highPrice: 23 })).md).toContain('Offer 3, departing 3 January')
    // Not starting at the lowPrice, a price below it, a price above the highPrice: other products.
    for (const offers of [{ ...AGGREGATE, lowPrice: 19 }, { ...AGGREGATE, lowPrice: 22 }, { ...AGGREGATE, highPrice: 22 }]) {
      expect(markdown(page(offers)).md).not.toContain('Offer 1, departing')
    }
  })

  it('still cuts other products beside a product whose variants span a declared range', () => {
    // A single shop's product declares its variants' price range as an AggregateOffer; the grid beside it is other products.
    const range = { '@type': 'AggregateOffer', lowPrice: '20.00', highPrice: '30.00', offerCount: 3, priceCurrency: 'GBP' }
    const items = [1, 2, 3, 4].map((i) => `<li class="item"><a href="/product/other-${i}">Other jacket ${i}</a><span class="amount">£${40 + i}.00</span></li>`).join('')
    const html = `<!doctype html><html><head>${ld({ '@type': 'Product', name: 'Rain Jacket', sku: 'RJ-1', offers: range })}</head><body><main><div class="product">
<h1>Rain Jacket</h1><p class="price"><span class="amount">£20.00</span> – <span class="amount">£30.00</span></p>
<p>A lightweight waterproof rain jacket with taped seams, an adjustable hood and two zipped pockets.</p>
<section class="look"><h2>Complete the look</h2><ul class="items">${items}</ul></section></div></main></body></html>`
    const out = extractTf.extract(html, { url: 'https://shop.fixture.test/product/rain-jacket/' })
    expect(htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl })).not.toContain('Other jacket 1')
    // The range's low end is no price of the product.
    expect(out.product?.price).toBeNull()
  })

  it('cuts a grid under a heading that names something else, even when its prices fall inside the range', () => {
    const range = { '@type': 'AggregateOffer', lowPrice: '20.00', highPrice: '30.00', offerCount: 4, priceCurrency: 'GBP' }
    const items = [20, 20, 25, 30].map((p, i) => `<li class="item"><a href="/product/other-${i}">Other tee ${'ABCD'[i]}</a> <span class="amount">£${p}.00</span></li>`).join('')
    for (const offers of [range, { ...range, highPrice: undefined }]) {
      const html = `<!doctype html><html><head>${ld({ '@type': 'Product', name: 'Basic Tee', sku: 'BT-1', offers })}</head><body><main><div class="product">
<h1>Basic Tee</h1><p class="price"><span class="amount">£20.00</span> – <span class="amount">£30.00</span></p>
<p>A heavyweight cotton tee with a relaxed fit, a ribbed collar and double-stitched hems; larger sizes cost more.</p>
<section class="look"><h2>Pairs well with</h2><ul class="items">${items}</ul></section></div></main></body></html>`
      const out = extractTf.extract(html, { url: 'https://shop.fixture.test/product/basic-tee/' })
      expect(htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl })).not.toContain('Other tee A')
    }
  })

  it('reads each card\'s price, not a time, size or count written before it', () => {
    // The text before each price ends in a number: a departure time.
    const html = page(AGGREGATE).replace(/, one way<\/a>/g, ', one way, departs 07:45</a>')
    expect(markdown(html).md).toContain('Offer 2, departing 2 January, one way, departs 07:45')
    expect(markdown(html.replace(/<\/a><span/g, '</a> <span')).md).toContain('Offer 3, departing 3 January')
  })

  it('does not let a related product with aggregate offers protect the grid of the page subject', () => {
    const own = { '@type': 'Product', name: 'Travel from North to South', url: URL, offers: { '@type': 'Offer', price: 84, priceCurrency: 'GBP' } }
    const related = { '@type': 'Product', name: 'Travel from East to West', url: 'https://travel.fixture.test/routes/east/west/', offers: AGGREGATE }
    const html = page(AGGREGATE).replace(/<script type="application\/ld\+json">.*?<\/script>/, ld({ '@graph': [own, related] }))
    const { out, md } = markdown(html)
    expect(out.product?.price?.value).toBe('84')
    expect(md).not.toContain('Offer 1, departing')
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
