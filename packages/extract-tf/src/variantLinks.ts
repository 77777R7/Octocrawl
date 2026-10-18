/**
 * OTTO's primary card click is encoded on oc-link-v2; its nested anchor is
 * only a family fallback. Restore that existing anchor before cleaning drops
 * the corroborating JSON-LD. No record, URL parameter or price is invented.
 * This preparation is scoped to these carriers, not to a hostname or slug's
 * hardware words. Raw captures and full-document crawl discovery stay raw.
 */
const CARD = 'article[data-product-id][data-variation-id]'
const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function one(value: unknown): Record<string, unknown> | null {
  return record(Array.isArray(value) ? value.length === 1 ? value[0] : null : value)
}
function cents(value: unknown): bigint | null {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))
}
function retailCents(text: string): bigint | null {
  // This carrier's German EUR display only; ab remains in the DOM. Monthly
  // installments, UVP, blanks and unknown currencies cannot corroborate it.
  const match = /^(?:ab )?((?:\d{1,3}(?:\.\d{3}){1,4}|\d{1,12})),(\d{2}) €$/.exec(clean(text))
  return match ? cents(match[1]!.replaceAll('.', '') + '.' + match[2]) : null
}
function safeUrl(value: unknown, base: URL): URL | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) return null
  try {
    const url = new URL(value, base)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === base.origin && !url.username && !url.password ? url : null
  } catch { return null }
}
function key(url: URL): string {
  const copy = new URL(url)
  copy.searchParams.sort()
  return copy.href
}

export function restoreVariantLinks(document: Document, baseUrl: string | null | undefined): void {
  let base: URL
  try { base = new URL(baseUrl!) } catch { return }
  if (document.querySelector('oc-link-v2[data-primary-action][base64-href]') === null) return
  for (const card of Array.from(document.querySelectorAll(CARD))) {
    // A containing article must never borrow a descendant card's identity.
    if (card.querySelector(CARD) !== null) continue
    const productId = card.getAttribute('data-product-id') ?? ''
    const variant = card.getAttribute('data-variation-id') ?? ''
    if (![productId, variant].every(id => /^[A-Za-z0-9_-]{1,128}$/.test(id))) continue
    if (Array.from(card.querySelectorAll('[data-variation-id]')).some(el => el.getAttribute('data-variation-id') !== variant)) continue
    const clicks = card.querySelectorAll('oc-link-v2[data-primary-action][base64-href]')
    const scripts = card.querySelectorAll('script[type="application/ld+json"]')
    const prices = card.querySelectorAll('.reptile-price__retailPrice')
    if (clicks.length !== 1 || scripts.length !== 1 || prices.length !== 1) continue
    const anchors = clicks[0]!.querySelectorAll('a[href]')
    if (anchors.length !== 1) continue
    const anchor = anchors[0]!
    const encoded = clicks[0]!.getAttribute('base64-href') ?? ''
    const json = scripts[0]!.textContent ?? ''
    if (encoded.length === 0 || encoded.length > 11000 || json.length > 65536) continue
    let clicked: URL | null, product: Record<string, unknown> | null
    try {
      clicked = safeUrl(atob(encoded), base)
      product = record(JSON.parse(json))
    } catch { continue }
    if (!clicked || !product || product['@type'] !== 'Product') continue
    const offer = one(product.offers)
    if (!offer || offer['@type'] !== 'Offer' || offer.priceCurrency !== 'EUR') continue
    const family = safeUrl(anchor.getAttribute('href'), base)
    const productUrl = safeUrl(product.url, base), offerUrl = safeUrl(offer.url, base)
    if (!family || !productUrl || !offerUrl || key(clicked) !== key(productUrl) || key(clicked) !== key(offerUrl)) continue
    if (!/^\/p\/[^/]+\/$/.test(clicked.pathname) || !clicked.pathname.endsWith('-' + productId + '/') || clicked.pathname !== family.pathname) continue
    if (clicked.searchParams.getAll('variationId').length !== 1 || clicked.searchParams.get('variationId') !== variant) continue
    const fallbackVariants = family.searchParams.getAll('variationId')
    if (fallbackVariants.length > 0 && (fallbackVariants.length !== 1 || fallbackVariants[0] !== variant)) continue
    const properties = Array.isArray(product.additionalProperty) ? product.additionalProperty : [product.additionalProperty]
    const declared = properties.map(record).filter(p => p?.name === 'variationId')
    if (declared.length !== 1 || declared[0]!.value !== variant) continue
    const name = typeof product.name === 'string' ? clean(product.name) : ''
    const images = card.querySelectorAll('img[alt]')
    if (!name || clean(anchor.getAttribute('aria-label')) !== name || images.length !== 1 || clean(images[0]!.getAttribute('alt')) !== name) continue
    const price = retailCents(prices[0]!.textContent ?? '')
    if (price === null || price !== cents(offer.price)) continue
    anchor.setAttribute('href', clicked.href)
  }
}
