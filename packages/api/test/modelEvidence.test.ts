import { describe, expect, it } from 'vitest'
import type { FetchResult, ProductFacts } from '@w2l/contracts'
import { modelLocator } from '../src/modelEvidence.js'

const base: FetchResult = {
  requestedUrl: 'https://shop.example/lamp', status: 'success', failureReason: null, blockReason: null, budgetExceeded: null,
  lane: 'http', escalations: [], markdown: '', links: [], truncated: false, truncatedAt: null, compliance: null,
  evidence: { finalUrl: 'https://shop.example/lamp', httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: 'x', artifacts: [] },
  usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 1, browserMs: 0, externalCostUsd: null }, trace: [],
}
const product: ProductFacts = {
  name: { value: 'Harbour lamp', source: 'jsonld', path: '/0/name' },
  price: { value: '19.00', source: 'jsonld', path: '/0/offers/price' },
  priceCurrency: { value: 'GBP', source: 'jsonld', path: '/0/offers/priceCurrency' },
  sku: null, brand: null,
  availability: { value: 'https://schema.org/InStock', source: 'jsonld', path: '/0/offers/availability' },
  deliveryLocation: { value: 'United Kingdom', source: 'dom', path: '#deliver-to' },
}
const article = (markdown: string): FetchResult => ({ ...base, markdown, document: { title: 'Story', pageType: 'article', strategy: 'article', confidence: 1, product: null, adapter: { id: 'generic', version: '1', status: 'generic' }, entities: [] } })
const shop = (markdown: string): FetchResult => ({ ...base, markdown, document: { title: 'Harbour lamp', pageType: 'product', strategy: 'product', confidence: 1, product, adapter: { id: 'generic', version: '1', status: 'generic' }, entities: [] } })

describe('locating a model value on the page', () => {
  it('reads text by its words, case and punctuation aside, on word boundaries', () => {
    const locate = modelLocator(article('# Story\n\nMade of stainless-steel tubing.\n\nThe Steelers won.'))
    expect(locate('Stainless steel')).toEqual({ evidencePath: 'markdown line 3', text: 'stainless-steel' })
    expect(locate('steel tubing')).toEqual({ evidencePath: 'markdown line 3', text: 'steel tubing' })
    // "steel" is a word on line 3; "steeler" is a word nowhere.
    expect(locate('steeler')).toBeNull()
    expect(locate('  ')).toBeNull()
    expect(locate(true)).toBeNull()
  })

  it('searches the declared facts first, and reads a declared price with its currency and delivery region', () => {
    const locate = modelLocator(shop('# Harbour lamp\n\nOnly £19.00 today.'))
    expect(locate('in_stock')).toEqual({ evidencePath: '/0/offers/availability', text: 'InStock' })
    expect(locate(19)).toEqual({ evidencePath: '/0/offers/price', text: '19.00', normalized: 19, context: { currency: 'GBP', region: 'United Kingdom' } })
  })

  it('reads a number by the rules of numbers.ts and names a unit beside it', () => {
    const locate = modelLocator(article('# Story\n\nIt weighs 1.250 kg.\n\nThe list price was $1,299.'))
    // "1.250" could be 1250 or 1.25: nothing settles it, so neither is located.
    expect(locate(1.25)).toBeNull()
    expect(locate(1250)).toBeNull()
    // "$1,299" is not settled either; 1299 is not stated as a settled number.
    expect(locate(1299)).toBeNull()
    expect(modelLocator(article('Battery 5000 mAh'))(5000)).toEqual({ evidencePath: 'markdown line 1', text: '5000', normalized: 5000, context: { unit: 'mAh' } })
  })

  it('does not take a number of the other sign, a word in "in stock" as a unit, or text only a link target holds', () => {
    const locate = modelLocator(article('Overnight low: -5 °C, model SC-10, sizes 8-12.\n\nOnly 7 in stock.\n\n[Buy now](https://shop.example/acme-red-xl?size=42) ![photo](https://cdn.example/lamp-blue.jpg)'))
    expect(locate(5)).toBeNull()
    expect(locate(-5)).toMatchObject({ evidencePath: 'markdown line 1', normalized: -5 })
    // A hyphen joining a word or a range is no minus sign.
    expect(locate(10)).toMatchObject({ evidencePath: 'markdown line 1', text: '10' })
    expect(locate(12)).toMatchObject({ evidencePath: 'markdown line 1', text: '12' })
    expect(locate(7)).toEqual({ evidencePath: 'markdown line 3', text: '7', normalized: 7 })
    expect(locate('acme')).toBeNull()
    expect(locate(42)).toBeNull()
    expect(locate('blue')).toBeNull()
    expect(locate('Buy now')).toEqual({ evidencePath: 'markdown line 5', text: 'Buy now' })
  })

  it('matches an ISO date with the same day as the page writes it', () => {
    const locate = modelLocator(article('# Story\n\nPublished: 8 October 2026\n\nUpdated October 16, 2026'))
    expect(locate('2026-10-08')).toEqual({ evidencePath: 'markdown line 3', text: '8 October 2026', normalized: '2026-10-08' })
    expect(locate('2026-10-16')).toEqual({ evidencePath: 'markdown line 5', text: 'October 16, 2026', normalized: '2026-10-16' })
    expect(locate('2026-10-09')).toBeNull()
  })

  it('leaves out the part of a product page under a heading about other products, up to the next heading of its rank', () => {
    const markdown = '# Harbour lamp\n\n## You may also like\n\nDesk lamp in walnut\n\n### Ceiling lamp\n\nopal glass\n\n## Details\n\nShade in frosted glass'
    const locate = modelLocator(shop(markdown))
    expect(locate('walnut')).toBeNull()
    expect(locate('opal glass')).toBeNull()
    expect(locate('frosted glass')).toEqual({ evidencePath: 'markdown line 13', text: 'frosted glass' })
    // An article has no other products: the same heading does not cut anything.
    expect(modelLocator(article(markdown))('walnut')).toEqual({ evidencePath: 'markdown line 5', text: 'walnut' })
  })
})
