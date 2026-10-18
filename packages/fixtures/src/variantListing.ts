/** Synthetic OTTO-shaped cards; no retained customer/site capture. */
export const VARIANT_CARDS = [
  { product: 'P100', variant: 'V200', name: 'Selected RTX5070 notebook', family: '/p/notebook-old-rtx5060-P100/', price: '799,00 €', amount: '799.00' },
  { product: 'P100', variant: 'V201', name: 'Selected RTX5070 notebook', family: '/p/notebook-old-rtx5060-P100/', price: 'ab 819,00 €', amount: '819.00' },
  { product: 'P300', variant: 'V400', name: 'Another notebook', family: '/p/another-notebook-P300/', price: '699,00 €', amount: '699.00' },
  { product: 'A17', variant: 'Z98', name: 'Independent notebook', family: '/p/other-notebook-A17/', price: '0,00 €', amount: '0.00' },
] as const

export function variantListingFixture(kind = 'valid'): string {
  const cards = VARIANT_CARDS.map((row, i) => {
    let selected = `${row.family}?variationId=${row.variant}&campaign=listing`
    const offer: Record<string, unknown> = { '@type': 'Offer', url: selected, price: row.amount, priceCurrency: 'EUR' }
    const product: Record<string, unknown> = { '@type': 'Product', name: row.name, url: selected, additionalProperty: [{ name: 'variationId', value: row.variant }], offers: [offer] }
    let encoded = Buffer.from(selected).toString('base64'), identity: string = row.variant, extra = '', display: string = row.price
    if (i === 0) {
      if (kind === 'wrong-click') encoded = Buffer.from(selected.replace('V200', 'V201')).toString('base64')
      if (kind === 'missing-click') encoded = ''
      if (kind === 'invalid-base64') encoded = '%%%'
      if (kind === 'wrong-offer') offer.url = selected.replace('V200', 'V201')
      if (kind === 'missing-property') product.additionalProperty = []
      if (kind === 'missing-id') identity = ''
      if (kind === 'wrong-product') product.url = selected.replace('P100', 'P101')
      if (kind === 'wrong-name') product.name = 'Other notebook'
      if (kind === 'wrong-price') offer.price = '20.00'
      if (kind === 'cross-card-price') display = 'ab 819,00 €'
      if (kind === 'other-query') offer.url = selected.replace('campaign=listing', 'campaign=other')
      if (kind === 'wrong-dom-id') identity = 'V201'
      if (kind === 'two-properties') (product.additionalProperty as unknown[]).push({ name: 'variationId', value: row.variant })
      if (kind === 'missing-image') extra = '<img alt="Another configuration" src="/other.jpg">'
      if (kind === 'oversize-json') product.padding = 'x'.repeat(65536)
      if (kind === 'wrong-currency') offer.priceCurrency = 'USD'
      if (kind === 'missing-price') display = ''
      if (kind === 'installment-price') display = '20,00 € mtl. in 48 Raten'
      if (kind === 'two-offers') (product.offers as unknown[]).push({ ...offer })
      if (kind === 'nested-card') extra = '<article data-product-id="OTHER" data-variation-id="OTHER"><script type="application/ld+json">{}</script></article>'
      if (kind === 'two-products') extra = `<script type="application/ld+json">${JSON.stringify(product)}</script>`
      if (['duplicate-query', 'missing-query', 'external', 'unsafe', 'userinfo', 'oversize-url'].includes(kind)) {
        selected = kind === 'duplicate-query' ? selected + '&variationId=V200' : kind === 'missing-query' ? row.family : kind === 'external' ? 'https://other.test' + selected : kind === 'unsafe' ? 'javascript:alert(1)' : kind === 'userinfo' ? 'https://user@shop.fixture.test' + selected : selected + '&padding=' + 'x'.repeat(9000)
        product.url = offer.url = selected
        encoded = Buffer.from(selected).toString('base64')
      }
    }
    const declaration = i === 0 && kind === 'invalid-json' ? '{broken' : JSON.stringify(product)
    const card = `<article class="variant-card" id="card-${i}" data-product-id="${row.product}" data-variation-id="${identity}"><oc-link-v2 data-primary-action base64-href="${encoded}"><a href="${row.family}" aria-label="${row.name}"></a></oc-link-v2><img src="/images/${row.variant}.jpg" alt="${row.name}"><h2>${row.name}</h2><p>Configuration ${row.variant} has its own selected components, image and published offer. The listing describes this notebook in the same card as its retail display; the monthly installment and manufacturer reference are separate observations, not alternative retail amounts.</p><div><span class="reptile-price__retailPrice">${display}</span></div><div><s>UVP 1.199,00 €</s></div><div><span data-qa="reptile-installments">20,00 € mtl. in 48 Raten</span></div><script type="application/ld+json">${declaration}</script>${extra}</article>`
    return kind === 'duplicate' && i === 0 ? card + card : card
  }).join('')
  return `<!doctype html><html><head><title>Notebook variants</title></head><body><main><h1>Notebook variants</h1><section>${cards}</section></main></body></html>`
}
