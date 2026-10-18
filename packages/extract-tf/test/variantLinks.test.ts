import { describe, expect, it } from 'vitest'
import { VARIANT_CARDS, variantListingFixture } from '@w2l/fixtures'
import { extractTf, htmlToMarkdown } from '../src/index.js'

const base = 'https://shop.fixture.test/listing'
function markdown(kind = 'valid', options = {}): string {
  const out = extractTf.extract(variantListingFixture(kind), { url: base, ...options })
  return htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl })
}

describe('same-card declared variant links', () => {
  it('keeps two same-family variants, opaque IDs, zero, starting prices and separate installments', () => {
    const md = markdown()
    for (const row of VARIANT_CARDS) expect(md).toContain(`https://shop.fixture.test${row.family}?variationId=${row.variant}&campaign=listing`)
    expect(md).toContain('ab 819,00 €')
    expect(md).toContain('799,00 €')
    expect(md).toContain('0,00 €')
    expect(md).toContain('UVP 1.199,00 €')
    expect(md).toContain('20,00 € mtl. in 48 Raten')
  })
  it.each(['wrong-click', 'missing-click', 'invalid-base64', 'wrong-offer', 'missing-property', 'missing-id', 'wrong-product', 'wrong-name', 'wrong-price', 'wrong-currency', 'missing-price', 'installment-price', 'two-offers', 'nested-card', 'two-products', 'duplicate-query', 'missing-query', 'external', 'unsafe', 'userinfo', 'oversize-url', 'invalid-json', 'cross-card-price', 'other-query', 'wrong-dom-id', 'two-properties', 'missing-image', 'oversize-json'])('does not infer the selected URL with %s', kind => {
    const md = markdown(kind)
    expect(md).not.toContain('?variationId=V200')
    expect(md).toContain('https://shop.fixture.test' + VARIANT_CARDS[0].family + ')')
    expect(md).toContain('?variationId=V201&campaign=listing')
  })
  it('does not merge placements or variants, and honors caller exclusions/inclusions', () => {
    const url = 'https://shop.fixture.test' + VARIANT_CARDS[0].family + '?variationId=V200&campaign=listing'
    expect(markdown('duplicate').split(`](${url})`)).toHaveLength(3)
    expect(markdown('valid', { pruneSelectors: ['#card-0'] })).not.toContain('?variationId=V200')
    expect(markdown('valid', { includeSelectors: ['#card-1'] })).not.toContain('?variationId=V200')
    expect(markdown('valid', { includeSelectors: ['#card-1'] })).toContain('ab 819,00 €')
    // Match caller selectors against received hrefs, before preparation.
    const familySelector = `a[href="${VARIANT_CARDS[0].family}"]`
    expect(markdown('valid', { pruneSelectors: [familySelector] })).not.toContain('?variationId=V200')
    expect(markdown('valid', { includeSelectors: [familySelector] })).toContain('?variationId=V200')
  })
})
