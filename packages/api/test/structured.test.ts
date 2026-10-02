import { describe, expect, it } from 'vitest'
import type { FetchResult, JsonFormatRequest, JsonSchema, ProductFacts, ScrapeResponse } from '@w2l/contracts'
import { extractTf } from '@w2l/extract-tf'
import { extractStructured, prepareScrapeResponse } from '../src/structured.js'

const product: ProductFacts = {
  name: { value: 'Subject headphones', source: 'dom', path: '#productTitle' },
  price: { value: '1299.00', source: 'dom', path: '#corePrice_feature_div' },
  priceCurrency: { value: 'INR', source: 'dom', path: '#corePrice_feature_div' },
  sku: { value: 'B012345678', source: 'dom', path: 'url:/dp/{asin}' },
  brand: { value: 'SoundCo', source: 'dom', path: '#bylineInfo' },
  availability: { value: 'In Stock', source: 'dom', path: '#availability' },
  kind: 'physical',
  subjectId: { value: 'B012345678', source: 'dom', path: 'url:/dp/{asin}' },
  seller: { value: 'SoundCo Direct', source: 'dom', path: '#sellerProfileTriggerId' },
  deliveryLocation: { value: 'India', source: 'dom', path: '#glow-ingress-line2' },
  rating: { value: '4.7', source: 'dom', path: '#acrPopover' },
  reviewCount: { value: '2345', source: 'dom', path: '#acrCustomerReviewText' },
  images: [{ value: 'https://images.example/subject.jpg', source: 'dom', path: '#landingImage' }],
  variants: [],
  specifications: { Model: { value: 'SC-10', source: 'dom', path: '#productDetails' } },
}

const result: FetchResult = {
  requestedUrl: 'https://www.amazon.com/dp/B012345678', status: 'success', failureReason: null, blockReason: null, budgetExceeded: null,
  lane: 'http', escalations: [], markdown: '# Subject headphones\n\nA lightweight product made from aluminium.', links: [], truncated: false, truncatedAt: null,
  compliance: null, evidence: { finalUrl: 'https://www.amazon.com/dp/B012345678', httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: 'x', artifacts: [] },
  usage: { wallMs: 10, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, browserMs: 0, externalCostUsd: null }, trace: [],
  document: {
    title: 'Subject headphones', pageType: 'product', strategy: 'product', confidence: 0.75, product,
    adapter: { id: 'amazon-product', version: '1.0.0', status: 'verified adapter' },
    entities: [{
      type: 'product', id: 'B012345678', relationships: {},
      fields: { asin: { raw: 'B012345678', normalized: 'B012345678', source: 'dom', path: 'url:/dp/{asin}', status: 'confirmed' } },
    }],
  },
}

const format = (extra: Record<string, unknown> = {}): JsonFormatRequest => ({
  type: 'json',
  schema: {
    type: 'object',
    properties: {
      asin: { type: 'string' }, title: { type: 'string' }, price: { type: 'number' }, currency: { type: 'string' }, seller: { type: 'string' },
      material: { type: 'string', description: 'Product material' },
    },
    required: ['asin', 'title', 'price', 'currency', 'seller', ...(extra.requireMaterial ? ['material'] : [])],
    additionalProperties: false,
  },
  ...(extra.modelFallback ? { modelFallback: true } : {}),
})

const book = `<html><head><title>A Light in the Attic | Books to Scrape - Sandbox</title></head><body><article class="product_page">
<h1>A Light in the Attic</h1><p class="price_color">£51.77</p><p class="instock availability">In stock (22 available)</p>
<p>A collection of short poems and line drawings for readers of every age, reissued as an anniversary edition with a few pieces that were not in the first printing.</p>
<table class="table table-striped"><tr><th>UPC</th><td>a897fe39b1053632</td></tr><tr><th>Number of reviews</th><td>0</td></tr></table></article></body></html>`
const lamp = `<html><head><title>Harbour lamp | Shop</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Harbour lamp","sku":"HL-1","offers":{"@type":"Offer","price":"19.00","priceCurrency":"GBP"}}</script></head>
<body><main><h1>Harbour lamp</h1><p>A brass harbour lamp with a frosted glass shade, sized for a desk or a bedside table and wired for a standard bulb.</p></main></body></html>`
/** The L01 book page: a visible price and the "Product Information" table. */
const bookInformation = `<html><head><title>A Light in the Attic | Books to Scrape - Sandbox</title></head><body>
<ul class="breadcrumb"><li><a href="../../index.html">Home</a></li><li><a href="../category/books_1/index.html">Books</a></li><li><a href="../category/books/poetry_23/index.html">Poetry</a></li><li class="active">A Light in the Attic</li></ul>
<article class="product_page"><div class="row"><div class="col-sm-6 product_main"><h1>A Light in the Attic</h1><p class="price_color">£51.77</p>
<p class="instock availability">In stock (22 available)</p></div></div>
<div class="sub-header"><h2>Product Description</h2></div>
<p>It's hard to imagine a world without A Light in the Attic. This now-classic collection of poetry and drawings celebrates its 20th anniversary with this special edition.</p>
<div class="sub-header"><h2>Product Information</h2></div>
<table class="table table-striped"><tr><th>UPC</th><td>a897fe39b1053632</td></tr><tr><th>Product Type</th><td>Books</td></tr>
<tr><th>Price (excl. tax)</th><td>£51.77</td></tr><tr><th>Price (incl. tax)</th><td>£51.77</td></tr><tr><th>Tax</th><td>£0.00</td></tr>
<tr><th>Availability</th><td>In stock (22 available)</td></tr><tr><th>Number of reviews</th><td>0</td></tr></table></article></body></html>`

/** A product page that declares nothing and shows its price in `p.price`, as the page writes it. */
const shop = (price: string) => `<html lang="de"><head><title>Messinglampe | Shop</title></head><body><main><h1>Messinglampe</h1><p class="price">${price}</p>
<p>Eine Messinglampe mit mattiertem Glasschirm, passend für Schreibtisch oder Nachttisch und für eine Standardfassung verdrahtet.</p></main></body></html>`

/** A FetchResult for inline HTML, with the document the HTTP lane attaches. */
function page(html: string, url = 'https://books.example/catalogue/a-light-in-the-attic_1000/index.html'): FetchResult {
  const out = extractTf.extract(html, { url })
  return {
    ...result, requestedUrl: url, markdown: 'page', evidence: { ...result.evidence, finalUrl: url }, metadata: out.metadata,
    document: { title: out.title, pageType: out.pageType, strategy: out.strategy, confidence: out.confidence, product: out.product ?? null, adapter: out.adapter, entities: out.entities, adapterValidation: out.adapterValidation, labelledValues: out.labelledValues },
  }
}
const json = (properties: Record<string, JsonSchema>, required: string[], modelFallback = false): JsonFormatRequest => ({
  type: 'json', schema: { type: 'object', properties, required }, ...(modelFallback ? { modelFallback } : {}),
})

/** Why OpenAI strict structured outputs would refuse a schema, or null. */
function strictRefusal(node: unknown, at = ''): string | null {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return null
  const rec = node as Record<string, unknown>
  const allowed = ['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', '$ref', '$defs', 'description']
  const other = Object.keys(rec).find(key => !allowed.includes(key))
  if (other !== undefined) return `${at || '/'}: '${other}' is not permitted`
  const types = rec.type === undefined ? [] : ([] as unknown[]).concat(rec.type)
  if (types.includes('object') || rec.properties !== undefined) {
    if (rec.additionalProperties !== false) return `${at || '/'}: 'additionalProperties' must be false`
    const unlisted = Object.keys(rec.properties ?? {}).find(key => !((rec.required ?? []) as string[]).includes(key))
    if (unlisted !== undefined) return `${at || '/'}: 'required' must list every property, missing '${unlisted}'`
  }
  const children = [
    ...Object.entries((rec.properties ?? {}) as Record<string, unknown>).map(([key, child]) => [`${at}/properties/${key}`, child] as const),
    ...Object.entries((rec.$defs ?? {}) as Record<string, unknown>).map(([key, child]) => [`${at}/$defs/${key}`, child] as const),
    ...((rec.anyOf ?? []) as unknown[]).map((child, index) => [`${at}/anyOf/${index}`, child] as const),
    ...(rec.items === undefined ? [] : [[`${at}/items`, rec.items] as const]),
  ]
  for (const [path, child] of children) {
    const refusal = strictRefusal(child, path)
    if (refusal !== null) return refusal
  }
  return null
}

/** A fake OpenAI chat-completions endpoint: HTTP 400 for a strict schema OpenAI would refuse, else the answer. */
const openAiEndpoint = (answer: unknown, requests: Array<Record<string, any>>) => (async (_input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body))
  requests.push(body)
  const format = body.response_format.json_schema
  const refusal = format.strict === true ? strictRefusal(format.schema) : null
  if (refusal !== null) return new Response(JSON.stringify({ error: { message: `Invalid schema for response_format 'w2l_extract': ${refusal}` } }), { status: 400 })
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 40, completion_tokens: 8 } }), { status: 200 })
}) as typeof fetch

describe('scrape response metadata', () => {
  it('carries the Open Graph and article fields the page states beside the seven base fields and the call facts, on the compact response too', async () => {
    const metadata = { title: 'Report', description: null, language: 'en', keywords: null, robots: null, favicon: null, canonicalUrl: null, ogTitle: 'Report card', ogImage: 'https://example.test/og.png', articleTag: ['energy'] }
    const run = {
      ...result, requestedUrl: 'https://example.test/report', evidence: { ...result.evidence, finalUrl: 'https://example.test/report' }, metadata, document: null,
      channelsTried: ['http'], ladderTrace: [],
      summary: { channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, externalCostUsd: null, externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 10, unknown: false }, artifacts: [] },
    }
    const compact = await prepareScrapeResponse(run, { url: run.requestedUrl, formats: ['markdown'], debug: false }, {}, null, performance.now()) as import('@w2l/contracts').CompactScrapeResponse
    expect(compact.metadata).toMatchObject({ title: 'Report', language: 'en', description: null, ogTitle: 'Report card', ogImage: 'https://example.test/og.png', articleTag: ['energy'], sourceURL: run.requestedUrl, url: run.requestedUrl, statusCode: 200 })
    expect(compact.metadata).not.toHaveProperty('ogDescription')
    const full = await prepareScrapeResponse(run, { url: run.requestedUrl }, {}, null, performance.now()) as ScrapeResponse
    expect(full.metadata).toMatchObject({ ogTitle: 'Report card', articleTag: ['energy'] })
  })
})

describe('format entries by type', () => {
  const summary = { channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, externalCostUsd: null, externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 10, unknown: false }, artifacts: [] }
  const attributes = { type: 'attributes' as const, selectors: [{ selector: 'a', attribute: 'href' }] }

  it('never switches on JSON extraction for an attributes entry, and reads the json entry beside it', async () => {
    const run = { ...result, channelsTried: ['http'], ladderTrace: [], summary }
    const compact = await prepareScrapeResponse(run, { url: result.requestedUrl, formats: ['markdown', attributes], debug: false }, {}, null, performance.now()) as import('@w2l/contracts').CompactScrapeResponse
    expect(compact.formats).toEqual(['markdown', 'attributes'])
    expect(compact).not.toHaveProperty('json')
    // Asked for, but the run carried none (a page not read as content): the key is absent, never invented.
    expect(compact).not.toHaveProperty('attributes')
    const extracted = { ...run, attributes: [{ selector: 'a', attribute: 'href', values: ['/x'] }], images: ['https://images.example/subject.jpg'] }
    const both = await prepareScrapeResponse(extracted, { url: result.requestedUrl, formats: [attributes, 'images', { type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } } } }], debug: false }, {}, null, performance.now()) as import('@w2l/contracts').CompactScrapeResponse
    expect(both.formats).toEqual(['images', 'attributes', 'json'])
    expect(both.json?.data).toEqual({ title: 'Subject headphones' })
    expect(both.attributes).toEqual([{ selector: 'a', attribute: 'href', values: ['/x'] }])
    expect(both.images).toEqual(['https://images.example/subject.jpg'])
    // Not asked for: the result's images stay off the compact response.
    expect(await prepareScrapeResponse(extracted, { url: result.requestedUrl, formats: ['markdown'], debug: false }, {}, null, performance.now())).not.toHaveProperty('images')
  })
})

describe('structured JSON extraction', () => {
  it('defaults compact adapter responses to JSON, including unverified identities', async () => {
    const response = {
      ...result, channelsTried: ['http'], ladderTrace: [], summary: { attempts: [], totalMs: 10 },
    } as unknown as ScrapeResponse
    const good = await prepareScrapeResponse(response, { url: result.requestedUrl, debug: false }, {}, null, performance.now())
    expect(good.formats).toEqual(['json'])
    expect(good.json?.status).toBe('complete')
    expect(good).not.toHaveProperty('markdown')
    expect(good.document).not.toHaveProperty('product')
    expect(good.document).not.toHaveProperty('entities')
    const bad = await prepareScrapeResponse({
      ...response,
      document: { ...response.document!, adapterValidation: { valid: false, issues: ['subject_id_unverified'] } },
    }, { url: result.requestedUrl, debug: false }, {}, null, performance.now())
    expect(bad.formats).toEqual(['json'])
    expect(bad.json?.status).toBe('incomplete')
    expect(bad.json?.issues[0]?.code).toBe('subject_unverified')
  })
  it('does not publish entities or custom fields when adapter identity is unverified', async () => {
    const unverified: FetchResult = {
      ...result,
      document: { ...result.document!, adapterValidation: { valid: false, issues: ['subject_id_mismatch'] } },
    }
    const canonical = await extractStructured(unverified)
    expect(canonical.status).toBe('incomplete')
    expect(canonical.data).toMatchObject({ entities: [] })
    expect(canonical.issues).toContainEqual({ code: 'subject_unverified', message: 'subject_id_mismatch' })
    const custom = await extractStructured(unverified, format(), {}, null)
    expect(custom.status).toBe('incomplete')
    expect(custom.data).toBeNull()
  })
  it('returns the canonical adapter entity envelope for string json', async () => {
    const out = await extractStructured(result)
    expect(out.status).toBe('complete')
    expect(out.data).toMatchObject({
      adapter: { id: 'amazon-product' },
      entities: [{ type: 'product', id: 'B012345678' }],
    })
    expect(out.evidence).toContainEqual({ path: '/entities/0/fields/asin', source: 'dom', evidencePath: 'url:/dp/{asin}' })
  })

  it('maps deterministic HTML product facts and preserves evidence', async () => {
    const out = await extractStructured(result, format(), {}, null)
    expect(out.status).toBe('complete')
    expect(out.data).toMatchObject({ asin: 'B012345678', title: 'Subject headphones', price: 1299, currency: 'INR', seller: 'SoundCo Direct' })
    expect(out.evidence).toContainEqual({ path: '/price', source: 'dom', evidencePath: '#corePrice_feature_div', text: '1299.00' })
    expect(out.modelUsage).toBeNull()
  })

  it('keeps a verified subject complete while explaining null offer fields', async () => {
    const noOffer: FetchResult = { ...result, document: { ...result.document!, product: { ...product, price:null, priceCurrency:null, seller:null } } }
    const schema: JsonFormatRequest = {type:'json',schema:{type:'object',properties:{asin:{type:'string'},price:{type:['number','null']},currency:{type:['string','null']},seller:{type:['string','null']}},required:['asin','price','currency','seller']}}
    const out=await extractStructured(noOffer,schema,{},null)
    expect(out.status).toBe('complete')
    expect(out.data).toMatchObject({asin:'B012345678',price:null,currency:null,seller:null})
    expect(out.issues.map(issue=>issue.path)).toEqual(['/price','/currency','/seller'])
    expect(out.issues.every(issue=>issue.code==='field_unavailable')).toBe(true)
  })

  it('reports an explicit incomplete result when model fallback is unavailable', async () => {
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['model_unavailable', 'missing_required']))
  })

  it('uses an OpenAI-compatible strict-schema response only for unresolved fields', async () => {
    let calls = 0
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, {
      baseUrl: 'https://model.example', model: 'extractor', apiKey: 'secret',
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls++
        expect(init?.headers).toMatchObject({ authorization: 'Bearer secret' })
        const request = JSON.parse(String(init?.body))
        expect(request.response_format.type).toBe('json_schema')
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ material: 'aluminium' }) } }], usage: { prompt_tokens: 50, completion_tokens: 5 } }), { status: 200 })
      }) as typeof fetch,
    })
    expect(calls).toBe(1)
    expect(out.status).toBe('complete')
    expect(out.data).toMatchObject({ asin: 'B012345678', material: 'aluminium' })
    expect(out.evidence).toContainEqual({ path: '/material', source: 'model' })
    expect(out.modelUsage).toMatchObject({ model: 'extractor', attempts: 1, inputTokens: 50, outputTokens: 5, externalCostUsd: null })
  })

  it('repairs invalid model output once and rejects a second invalid output', async () => {
    let calls = 0
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, {
      baseUrl: 'https://model.example', model: 'extractor',
      fetch: (async () => {
        calls++
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ material: 42 }) } }] }), { status: 200 })
      }) as typeof fetch,
    })
    expect(calls).toBe(2)
    expect(out.status).toBe('invalid')
    expect(out.issues.some(issue => issue.code === 'model_output_invalid')).toBe(true)
  })

  it('accepts one repaired model output after the first response fails validation', async () => {
    let calls = 0
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, {
      baseUrl: 'https://model.example', model: 'extractor',
      fetch: (async () => {
        calls++
        const content = calls === 1 ? { material: 42 } : { material: 'aluminium' }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 })
      }) as typeof fetch,
    })
    expect(calls).toBe(2)
    expect(out.status).toBe('complete')
    expect(out.data).toMatchObject({ material: 'aluminium' })
    expect(out.modelUsage?.attempts).toBe(2)
  })

  it('propagates cancellation into model fallback and reports timeout without failing the page', async () => {
    const controller = new AbortController()
    const pending = extractStructured(result, format({ requireMaterial: true, modelFallback: true }), { signal: controller.signal }, {
      baseUrl: 'https://model.example', model: 'extractor',
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })) as typeof fetch,
    })
    controller.abort(new DOMException('deadline exceeded', 'TimeoutError'))
    const out = await pending
    expect(out.status).toBe('incomplete')
    expect(out.issues.map(issue => issue.code)).toContain('model_timeout')
    expect(out.data).toMatchObject({ asin: 'B012345678', title: 'Subject headphones' })
  })

  it('reports a required array without a source as missing instead of an empty list', async () => {
    const out = await extractStructured(page(book), json({ title: { type: 'string' }, reviews: { type: 'array', items: { type: 'string' } }, tags: { type: 'array' } }, ['title', 'reviews']), {}, null)
    expect(out.status).toBe('incomplete')
    // The optional tags list has no source either: it is left out, not invented as [].
    expect(out.data).toEqual({ title: 'A Light in the Attic' })
    expect(out.issues).toEqual([{ code: 'missing_required', path: '/reviews', message: 'required field unavailable: /reviews' }])
  })

  it('reports required objects and product lists the page never provided as missing', async () => {
    const schema = json({
      name: { type: 'string' }, images: { type: 'array', items: { type: 'string' } }, specifications: { type: 'object' },
      publisher: { type: 'object', properties: { city: { type: ['string', 'null'] } }, required: ['city'] },
    }, ['name', 'images', 'specifications', 'publisher'])
    const out = await extractStructured(page(lamp, 'https://shop.example/lamp'), schema, {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ name: 'Harbour lamp' })
    expect(out.issues.map(issue => [issue.code, issue.path])).toEqual([['missing_required', '/images'], ['missing_required', '/specifications'], ['missing_required', '/publisher']])
    // Lists the Amazon adapter read from the verified subject page stay, even an empty one.
    const observed = await extractStructured(result, json({ images: { type: 'array' }, variants: { type: 'array' } }, ['images', 'variants']), {}, null)
    expect(observed).toMatchObject({ status: 'complete', data: { images: ['https://images.example/subject.jpg'], variants: [] }, issues: [] })
  })

  it('gives a list or map the adapter observed empty an evidence entry too', async () => {
    const empty: FetchResult = { ...result, document: { ...result.document!, product: { ...product, images: [], variants: [], specifications: {}, prices: [] } } }
    const out = await extractStructured(empty, json({ images: { type: 'array' }, variants: { type: 'array' }, specifications: { type: 'object' }, prices: { type: 'array' } }, ['images', 'variants', 'specifications', 'prices']), {}, null)
    expect(out).toMatchObject({ status: 'complete', data: { images: [], variants: [], specifications: {}, prices: [] }, issues: [] })
    // Nothing was read from the page: the adapter reported none on the verified subject.
    expect(out.evidence).toEqual([
      { path: '/images', source: 'inferred', evidencePath: 'document.product.images' },
      { path: '/variants', source: 'inferred', evidencePath: 'document.product.variants' },
      { path: '/specifications', source: 'inferred', evidencePath: 'document.product.specifications' },
      { path: '/prices', source: 'inferred', evidencePath: 'document.product.prices' },
    ])
  })

  it('maps page labels and the visible price to top-level keys and says where each came from', async () => {
    const schema = json({ title: { type: 'string' }, price: { type: 'number' }, availability: { type: 'string' }, upc: { type: 'string' }, isbn: { type: 'string' }, numberOfReviews: { type: 'integer' } }, ['title', 'price', 'availability', 'upc', 'isbn'])
    const out = await extractStructured(page(bookInformation), schema, {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ title: 'A Light in the Attic', price: 51.77, availability: 'In stock (22 available)', upc: 'a897fe39b1053632', numberOfReviews: 0 })
    expect(out.issues).toEqual([{ code: 'missing_required', path: '/isbn', message: 'required field unavailable: /isbn' }])
    expect(out.evidence).toEqual([
      { path: '/title', source: 'dom', evidencePath: 'h1[0]' },
      { path: '/price', source: 'text', evidencePath: 'p.price_color', text: '£51.77' },
      { path: '/availability', source: 'dom', evidencePath: 'table[0] tr[5] "Availability"' },
      { path: '/upc', source: 'dom', evidencePath: 'table[0] tr[0] "UPC"' },
      { path: '/numberOfReviews', source: 'dom', evidencePath: 'table[0] tr[6] "Number of reviews"', text: '0' },
    ])
  })

  it('reports a field that page labels state differently as ambiguous instead of choosing one', async () => {
    const html = `<html><head><title>Harbour lamp</title></head><body><main><h1>Harbour lamp</h1>
<p>A brass harbour lamp with a frosted glass shade, wired for a standard bulb.</p>
<table><tr><th>Price (excl. tax)</th><td>£40.00</td></tr><tr><th>Price (incl. tax)</th><td>£48.00</td></tr><tr><th>Stock</th><td>In stock (22 available)</td></tr></table></main></body></html>`
    const out = await extractStructured(page(html, 'https://shop.example/lamp'), json({ price: { type: 'number' }, priceInclTax: { type: 'number' }, stock: { type: 'number' } }, ['price']), {}, null)
    expect(out.status).toBe('incomplete')
    // The exact label is not ambiguous; stock text is not one number, so it is not read as 22.
    expect(out.data).toEqual({ priceInclTax: 48 })
    expect(out.issues.map(issue => [issue.code, issue.path])).toEqual([['field_ambiguous', '/price'], ['missing_required', '/price']])
    expect(out.issues[0]?.message).toContain('"Price (excl. tax)" = "£40.00"')
    expect(out.issues[0]?.message).toContain('"Price (incl. tax)" = "£48.00"')
  })

  it('does not fill a nested field from a page-level value that shares its key', async () => {
    const schema = json({ title: { type: 'string' }, author: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }, ['title', 'author'])
    const out = await extractStructured(page(book), schema, {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ title: 'A Light in the Attic' })
    expect(out.issues).toEqual([{ code: 'missing_required', path: '/author', message: 'required field unavailable: /author' }])
  })

  it('runs the model fallback when a required array has no deterministic source', async () => {
    let calls = 0
    const out = await extractStructured(page(book), json({ title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, ['title', 'tags'], true), {}, {
      baseUrl: 'https://model.example', model: 'extractor',
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls++
        expect(JSON.parse(JSON.parse(String(init?.body)).messages[1].content).deterministic).toEqual({ title: 'A Light in the Attic' })
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tags: ['poetry'] }) } }] }), { status: 200 })
      }) as typeof fetch,
    })
    expect(calls).toBe(1)
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({ title: 'A Light in the Attic', tags: ['poetry'] })
    expect(out.evidence).toContainEqual({ path: '/tags', source: 'model' })
  })

  it('never reports JSON complete for a page that was not fetched successfully', async () => {
    const body = page('<html><head><title>404 Not Found</title></head><body><h1>Not Found</h1><p>The requested URL was not found on this server.</p></body></html>')
    const notFound: FetchResult = { ...body, status: 'failed', failureReason: 'http_error', evidence: { ...body.evidence, httpStatus: 404 } }
    let calls = 0
    const custom = await extractStructured(notFound, json({ url: { type: 'string' }, title: { type: 'string' } }, ['url', 'title'], true), {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: (async () => { calls++; return new Response('{}') }) as typeof fetch,
    })
    expect(calls).toBe(0)
    expect(custom).toMatchObject({ status: 'incomplete', data: null, issues: [{ code: 'page_unsuccessful' }] })
    expect(custom.issues[0]?.message).toContain('failed (http_error, HTTP 404)')
    // The canonical adapter envelope does not publish entities from such a page either.
    const canonical = await extractStructured({ ...result, status: 'failed', failureReason: 'identity_compromised', markdown: null })
    expect(canonical).toMatchObject({ status: 'incomplete', data: { entities: [] }, issues: [{ code: 'page_unsuccessful' }] })
  })

  it('reads fields from a partial page but never reports it complete and never calls the model', async () => {
    const partial: FetchResult = { ...page(book), status: 'partial', usage: { ...result.usage, deadlineExceeded: true } }
    let calls = 0
    const custom = await extractStructured(partial, json({ title: { type: 'string' }, reviews: { type: 'array', items: { type: 'string' } } }, ['title', 'reviews'], true), {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: (async () => { calls++; return new Response('{}') }) as typeof fetch,
    })
    expect(calls).toBe(0)
    expect(custom).toMatchObject({ status: 'incomplete', data: { title: 'A Light in the Attic' } })
    expect(custom.issues.map(issue => issue.code)).toEqual(['page_partial', 'missing_required'])
    const whole = await extractStructured(partial, json({ title: { type: 'string' } }, ['title']))
    expect(whole).toMatchObject({ status: 'incomplete', data: { title: 'A Light in the Attic' }, issues: [{ code: 'page_partial' }] })
    const canonical = await extractStructured({ ...result, status: 'partial' })
    expect(canonical).toMatchObject({ status: 'incomplete', data: { entities: [{ id: 'B012345678' }] }, issues: [{ code: 'page_partial' }] })
  })

  it('keeps a failed page as evidence Markdown and never hands it to model fallback', async () => {
    const failed = {
      ...result, status: 'failed', failureReason: 'http_error', markdown: '# 404 Not Found', document: undefined,
      evidence: { ...result.evidence, httpStatus: 404 }, channelsTried: ['http'], ladderTrace: [], summary: { attempts: [], totalMs: 1 },
    } as unknown as ScrapeResponse
    let calls = 0
    const out = await prepareScrapeResponse(failed, { url: failed.requestedUrl, formats: ['markdown', format({ modelFallback: true })], debug: false }, {}, {
      baseUrl: 'https://model.example', model: 'extractor',
      fetch: (async () => { calls++; return new Response('{}') }) as typeof fetch,
    }, performance.now())
    expect(out.markdown).toBe('# 404 Not Found')
    expect(calls).toBe(0)
    expect(out.json).toMatchObject({ status: 'incomplete', data: null, issues: [{ code: 'page_unsuccessful' }] })
  })

  it('maps a Pydantic-style schema with annotations and nullable anyOf fields, each value with its evidence', async () => {
    const schema: JsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Book', type: 'object',
      properties: {
        title: { title: 'Title', type: 'string', minLength: 1 },
        price: { title: 'Price', anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }], examples: [9.99] },
        availability: { title: 'Availability', anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
        upc: { title: 'Upc', type: 'string', pattern: '^[0-9a-f]{16}$' },
        isbn: { title: 'Isbn', anyOf: [{ type: 'string' }, { type: 'null' }], default: null, description: 'Not on the page' },
        url: { title: 'Url', type: 'string', format: 'uri' },
      },
      required: ['title', 'price', 'upc', 'url'],
    }
    const out = await extractStructured(page(bookInformation), { type: 'json', schema }, {}, null)
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({
      title: 'A Light in the Attic', price: 51.77, availability: 'In stock (22 available)', upc: 'a897fe39b1053632', isbn: null,
      url: 'https://books.example/catalogue/a-light-in-the-attic_1000/index.html',
    })
    expect(out.issues).toEqual([{ code: 'field_unavailable', path: '/isbn', message: 'no verified source for this nullable field on the selected page' }])
    expect(out.evidence).toEqual([
      { path: '/title', source: 'dom', evidencePath: 'h1[0]' },
      { path: '/price', source: 'text', evidencePath: 'p.price_color', text: '£51.77' },
      { path: '/availability', source: 'dom', evidencePath: 'table[0] tr[5] "Availability"' },
      { path: '/upc', source: 'dom', evidencePath: 'table[0] tr[0] "UPC"' },
      { path: '/url', source: 'fetch', evidencePath: 'finalUrl' },
    ])
  })

  it('gives page-level values evidence: the heading or <title>, the fetched URL and the page type W2L inferred', async () => {
    const html = `<html><head><title>Quarterly figures 2026</title></head><body><main><p>${'The quarterly figures cover sales, costs and staff numbers for every region we operate in. '.repeat(3)}</p></main></body></html>`
    const fetched: FetchResult = { ...page(html, 'https://stats.example/q3'), requestedUrl: 'http://stats.example/q3' }
    const schema = json({ title: { type: 'string' }, url: { type: 'string' }, requestUrl: { type: 'string' }, pageType: { type: 'string' } }, ['title', 'url', 'requestUrl', 'pageType'])
    const out = await extractStructured(fetched, schema, {}, null)
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({ title: 'Quarterly figures 2026', url: 'https://stats.example/q3', requestUrl: 'http://stats.example/q3', pageType: fetched.document?.pageType })
    expect(out.evidence).toEqual([
      { path: '/title', source: 'dom', evidencePath: 'title' },
      { path: '/url', source: 'fetch', evidencePath: 'finalUrl' },
      { path: '/requestUrl', source: 'fetch', evidencePath: 'requestedUrl' },
      { path: '/pageType', source: 'inferred', evidencePath: 'document.pageType' },
    ])
  })

  it('does not read a number out of text that is not one amount', async () => {
    // The lamp's SKU is HL-1 and its URL has no number: neither is -1 or 0.2.
    const out = await extractStructured(page(lamp, 'https://shop.example/lamp/2'), json({ name: { type: 'string' }, sku: { type: 'integer' }, url: { type: ['number', 'null'] } }, ['name', 'sku']), {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ name: 'Harbour lamp', url: null })
    expect(out.issues).toEqual([{ code: 'missing_required', path: '/sku', message: 'required field unavailable: /sku' }])
  })

  it('reads a visible price as the page writes it: decimal comma, thousands groups, currency before or after', async () => {
    const schema = json({ title: { type: 'string' }, price: { type: 'number' } }, ['title', 'price'])
    const cases: Array<[string, number, string]> = [
      ['12,99 €', 12.99, '12,99 €'], ['€12,99', 12.99, '€12,99'], ['1.299,00 €', 1299, '1.299,00 €'],
      ['1 299,00 €', 1299, '1 299,00 €'], ["CHF 1'299.00", 1299, "CHF 1'299.00"], ['$1,299.00', 1299, '$1,299.00'], ['£51.77', 51.77, '£51.77'],
    ]
    for (const [shown, value, text] of cases) {
      const out = await extractStructured(page(shop(shown), 'https://shop.example/lampe'), schema, {}, null)
      expect(out.data, shown).toEqual({ title: 'Messinglampe', price: value })
      expect(out.status, shown).toBe('complete')
      // The text the number was read from stays in its evidence.
      expect(out.evidence, shown).toContainEqual({ path: '/price', source: 'text', evidencePath: 'p.price', text })
    }
  })

  it('leaves a number unfilled with an issue quoting the page when its notation is not settled, never a guess', async () => {
    // "1.299 €" is 1299 in German and 1.299 in English; nothing on this page says which.
    const out = await extractStructured(page(shop('1.299 €'), 'https://shop.example/lampe'), json({ title: { type: 'string' }, price: { type: 'number' } }, ['title', 'price']), {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ title: 'Messinglampe' })
    const unsettled = { code: 'field_unavailable', path: '/price', message: 'the page states "1.299 €" (text, p.price): "." before three digits can separate thousands or decimals, and nothing on the page says which; no number was read' }
    expect(out.issues).toEqual([unsettled, { code: 'missing_required', path: '/price', message: 'required field unavailable: /price' }])
    // A nullable price is null with that issue, not with "no verified source".
    const nullable = await extractStructured(page(shop('$1,299'), 'https://shop.example/lampe'), json({ title: { type: 'string' }, price: { type: ['number', 'null'] } }, ['title', 'price']), {}, null)
    expect(nullable).toMatchObject({ status: 'complete', data: { title: 'Messinglampe', price: null } })
    expect(nullable.issues).toEqual([{ ...unsettled, message: 'the page states "$1,299" (text, p.price): "," before three digits can separate thousands or decimals, and nothing on the page says which; no number was read' }])
    // Asked for as a string, the price is the page's text.
    expect((await extractStructured(page(shop('1.299 €'), 'https://shop.example/lampe'), json({ price: { type: 'string' } }, ['price']), {}, null)).data).toEqual({ price: '1.299 €' })
  })

  it('settles a lone separator only from what the value is: a count, a currency without minor units, or JSON-LD and meta decimals', async () => {
    const facts = (over: Partial<ProductFacts>): FetchResult => ({ ...result, document: { ...result.document!, product: { ...product, ...over } } })
    const schema = json({ price: { type: 'number' }, rating: { type: 'number' }, reviewCount: { type: 'integer' } }, ['price'])
    const read = async (over: Partial<ProductFacts>) => extractStructured(facts(over), schema, {}, null)
    // A review count is whole, so "1.234" groups thousands; "4,5" has one decimal digit.
    const counted = await read({ reviewCount: { value: '1.234', source: 'dom', path: '#acrCustomerReviewText' }, rating: { value: '4,5', source: 'dom', path: '#acrPopover' } })
    expect(counted).toMatchObject({ status: 'complete', data: { price: 1299, rating: 4.5, reviewCount: 1234 } })
    expect(counted.evidence).toContainEqual({ path: '/reviewCount', source: 'dom', evidencePath: '#acrCustomerReviewText', text: '1.234' })
    // A yen amount has no minor unit, whether the text or the page's currency says JPY.
    expect((await read({ price: { value: '1.299', source: 'dom', path: '.price' }, priceCurrency: { value: 'JPY', source: 'jsonld' } })).data).toMatchObject({ price: 1299 })
    expect((await read({ price: { value: '1,299円', source: 'text', path: '.price' } })).data).toMatchObject({ price: 1299 })
    // JSON-LD and product:price:amount write "." as the decimal point; a comma there settles nothing.
    expect((await read({ price: { value: '1.299', source: 'jsonld' } })).data).toMatchObject({ price: 1.299 })
    expect((await read({ price: { value: '1.299', source: 'meta', path: 'meta[property="product:price:amount"]' } })).data).toMatchObject({ price: 1.299 })
    const comma = await read({ price: { value: '1,299', source: 'jsonld' } })
    expect(comma.status).toBe('incomplete')
    expect(comma.issues[0]).toMatchObject({ code: 'field_unavailable', path: '/price', message: expect.stringContaining('"1,299" (jsonld)') })
    // A price that is not a number is not 0, and a count that is not whole is not truncated.
    const words = await read({ price: { value: 'Call for price', source: 'jsonld' }, reviewCount: { value: '4.7', source: 'dom', path: '#acrCustomerReviewText' } })
    expect(words.data).toEqual({ rating: 4.7 })
    expect(words.issues).toEqual([
      { code: 'field_unavailable', path: '/price', message: 'the page states "Call for price" (jsonld): not one number; no number was read' },
      { code: 'field_unavailable', path: '/reviewCount', message: 'the page states "4.7" (dom, #acrCustomerReviewText): not a whole number; no number was read' },
      { code: 'missing_required', path: '/price', message: 'required field unavailable: /price' },
    ])
  })

  it('reads the amounts of a product price list by the same rule, keeping the text of one it cannot settle', async () => {
    const eur = { value: 'EUR', source: 'dom' as const, path: '#corePrice_feature_div' }
    const listed = { ...result, document: { ...result.document!, product: { ...product, prices: [
      { amount: { value: '1.299,00', source: 'dom' as const, path: '#corePrice_feature_div .a-offscreen' }, currency: eur, priceType: 'current' as const, seller: null },
      { amount: { value: '1.199', source: 'dom' as const, path: '#aod-offer-list .a-price' }, currency: eur, priceType: 'other' as const, seller: null },
    ] } } }
    const out = await extractStructured(listed, json({ prices: { type: 'array' } }, ['prices']), {}, null)
    expect(out.data).toEqual({ prices: [
      { amount: 1299, currency: 'EUR', priceType: 'current', seller: null },
      { amount: '1.199', currency: 'EUR', priceType: 'other', seller: null },
    ] })
    expect(out.issues).toEqual([{ code: 'field_unavailable', path: '/prices/1/amount', message: 'the page states "1.199" (dom, #aod-offer-list .a-price): "." before three digits can separate thousands or decimals, and nothing on the page says which; no number was read' }])
  })

  it('reads page labels by the same rule and names a label whose number it cannot settle', async () => {
    const html = `<html><head><title>Messinglampe</title></head><body><main><h1>Messinglampe</h1>
<p>Eine Messinglampe mit mattiertem Glasschirm, passend für Schreibtisch oder Nachttisch und für eine Standardfassung verdrahtet.</p>
<table><tr><th>Preis</th><td>1.299,– €</td></tr><tr><th>Gewicht</th><td>1.250</td></tr><tr><th>Bestand</th><td>12 Stück</td></tr></table></main></body></html>`
    const out = await extractStructured(page(html, 'https://shop.example/lampe'), json({ preis: { type: 'number' }, gewicht: { type: 'number' }, bestand: { type: 'integer' } }, ['preis']), {}, null)
    expect(out).toMatchObject({ status: 'complete', data: { preis: 1299 } })
    expect(out.evidence).toContainEqual({ path: '/preis', source: 'dom', evidencePath: 'table[0] tr[0] "Preis"', text: '1.299,– €' })
    // "12 Stück" is not one amount and is skipped as before; "1.250" is a number whose notation the page does not settle.
    expect(out.issues).toEqual([{ code: 'field_unavailable', path: '/gewicht', message: 'the page states "1.250" (dom, table[0] tr[1] "Gewicht"): "." before three digits can separate thousands or decimals, and nothing on the page says which; no number was read' }])
  })

  it('names a page value that breaks a schema check, also when a required field is missing', async () => {
    const schema = json({ upc: { type: 'string', pattern: '^[0-9]+$' }, isbn: { type: 'string' } }, ['upc', 'isbn'])
    const out = await extractStructured(page(bookInformation), schema, {}, null)
    expect(out).toMatchObject({ status: 'incomplete', data: { upc: 'a897fe39b1053632' } })
    expect(out.issues.map(issue => issue.code)).toEqual(['missing_required', 'field_unavailable'])
    expect(out.issues[1]?.message).toBe('/upc must match pattern "^[0-9]+$"')
  })

  it('matches a schema pattern the linear engine cannot run only on text of at most 2048 characters', async () => {
    // A lookahead runs on the backtracking engine: longer page text is not matched and counts as breaking the pattern.
    const named = (value: string): FetchResult => ({ ...result, document: { ...result.document!, product: { ...product, name: { value, source: 'dom', path: '#productTitle' } } } })
    const schema = json({ name: { type: 'string', pattern: '^(?=S)[A-Za-z ]+$' } }, ['name'])
    expect(await extractStructured(named('Subject headphones'), schema, {}, null)).toMatchObject({ status: 'complete' })
    const long = await extractStructured(named(`S${'a'.repeat(2048)}`), schema, {}, null)
    expect(long.status).toBe('incomplete')
    expect(long.issues).toEqual([{ code: 'field_unavailable', message: '/name must match pattern "^(?=S)[A-Za-z ]+$"' }])
    // The linear engine matches a pattern without lookaround on text of any length.
    expect(await extractStructured(named(`S${'a'.repeat(5000)}`), json({ name: { type: 'string', pattern: '^S[a-z]+$' } }, ['name']), {}, null)).toMatchObject({ status: 'complete' })
    // It keeps the u flag's meaning: one astral character is one character.
    expect(await extractStructured(named('\u{1F3A7}'), json({ name: { type: 'string', pattern: '^.$' } }, ['name']), {}, null)).toMatchObject({ status: 'complete' })
    // The same limit holds for what the linear engine cannot run either: a counted repetition above 16,
    // a \p{…} escape (it needs the u flag), and any text with a character outside the BMP (2 UTF-16 units).
    const limited = async (pattern: string, text: string) => (await extractStructured(named(text), json({ name: { type: 'string', pattern } }, ['name']), {}, null)).status
    expect([await limited('^S[0-9a-f]{32}', `S${'a'.repeat(2047)}`), await limited('^S[0-9a-f]{32}', `S${'a'.repeat(2048)}`)]).toEqual(['complete', 'incomplete'])
    expect([await limited('^S\\p{Ll}+$', `S${'a'.repeat(2047)}`), await limited('^S\\p{Ll}+$', `S${'a'.repeat(2048)}`)]).toEqual(['complete', 'incomplete'])
    expect([await limited('^S', `S${'a'.repeat(2045)}\u{1F3A7}`), await limited('^S', `S${'a'.repeat(2046)}\u{1F3A7}`)]).toEqual(['complete', 'incomplete'])
  })

  it('maps a recursive schema without descending forever', async () => {
    const schema: JsonFormatRequest = { type: 'json', schema: {
      type: 'object', properties: { title: { type: 'string' }, category: { $ref: '#/$defs/Category' } }, required: ['title'],
      $defs: { Category: { type: 'object', properties: { name: { type: 'string' }, parent: { $ref: '#/$defs/Category' } } } },
    } }
    expect(await extractStructured(page(book), schema, {}, null)).toMatchObject({ status: 'complete', data: { title: 'A Light in the Attic' } })
  })

  it('keeps every page value and its evidence when the model answers every field, and marks what the model wrote', async () => {
    let deterministic: unknown
    const schema: JsonFormatRequest = { type: 'json', modelFallback: true, schema: {
      type: 'object', additionalProperties: false,
      properties: {
        asin: { type: 'string' }, title: { type: 'string' }, price: { type: 'number' },
        availability: { type: 'string', enum: ['in_stock', 'out_of_stock'] },
        specifications: { type: 'object', additionalProperties: { type: 'string' } },
        warranty: { type: ['string', 'null'] }, material: { type: 'string' },
      },
      required: ['asin', 'title', 'price', 'availability', 'specifications', 'warranty', 'material'],
    } }
    const answer = { asin: 'B000000000', title: 'Other headphones', price: 1, availability: 'in_stock', specifications: { Model: 'X-1', Colour: 'black' }, warranty: 'two years', material: 'aluminium' }
    const out = await extractStructured(result, schema, {}, {
      baseUrl: 'https://model.example', model: 'extractor',
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        deterministic = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).deterministic
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 })
      }) as typeof fetch,
    })
    expect(out.status).toBe('complete')
    // The page's "In Stock" is not in the enum: the model's value replaces it, and only the model is named as its source.
    expect(deterministic).toEqual({ asin: 'B012345678', title: 'Subject headphones', price: 1299, specifications: { Model: 'SC-10' } })
    expect(out.data).toEqual({ asin: 'B012345678', title: 'Subject headphones', price: 1299, availability: 'in_stock', specifications: { Model: 'SC-10' }, warranty: 'two years', material: 'aluminium' })
    expect(out.evidence).toEqual([
      { path: '/asin', source: 'dom', evidencePath: 'url:/dp/{asin}' },
      { path: '/title', source: 'dom', evidencePath: '#productTitle' },
      { path: '/price', source: 'dom', evidencePath: '#corePrice_feature_div', text: '1299.00' },
      { path: '/specifications', source: 'dom', evidencePath: '#productDetails' },
      { path: '/availability', source: 'model' },
      { path: '/warranty', source: 'model' },
      { path: '/material', source: 'model' },
    ])
  })

  it('sends OpenAI strict mode a strict-safe schema derived from an ordinary one', async () => {
    const requests: Array<Record<string, any>> = []
    const schema: JsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Book', type: 'object',
      properties: {
        title: { title: 'Title', type: 'string' },
        price: { title: 'Price', type: 'number', minimum: 0 },
        publisher: { title: 'Publisher', anyOf: [{ $ref: '#/$defs/Publisher' }, { type: 'null' }], default: null },
        tags: { title: 'Tags', type: 'array', items: { type: 'string' } },
        edition: { title: 'Edition', type: 'string', description: 'The edition statement' },
      },
      required: ['title', 'price', 'edition'],
      $defs: { Publisher: { title: 'Publisher', type: 'object', properties: { name: { type: 'string' }, city: { type: 'string' } }, required: ['name'] } },
    }
    const answer = { title: 'A Light in the Attic', price: 51.77, publisher: { name: 'HarperCollins', city: null }, tags: null, edition: '20th anniversary' }
    const out = await extractStructured(page(bookInformation), { type: 'json', schema, modelFallback: true }, {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: openAiEndpoint(answer, requests),
    })
    expect(out.issues).toEqual([])
    expect(out.status).toBe('complete')
    // Strict mode answers every property; a null the caller's schema does not allow means "not found" and is left out.
    expect(out.data).toEqual({ title: 'A Light in the Attic', price: 51.77, publisher: { name: 'HarperCollins' }, edition: '20th anniversary' })
    expect(out.modelUsage).toMatchObject({ attempts: 1, strict: true })
    const sent = requests[0]!.response_format.json_schema
    expect(sent.strict).toBe(true)
    expect(sent.schema.required).toEqual(['title', 'price', 'publisher', 'tags', 'edition'])
    expect(sent.schema.properties.tags).toEqual({ type: ['array', 'null'], items: { type: 'string' } })
    expect(sent.schema.properties.edition).toEqual({ type: 'string', description: 'The edition statement' })
    expect(sent.schema.$defs.Publisher).toEqual({ type: 'object', properties: { name: { type: 'string' }, city: { type: ['string', 'null'] } }, required: ['name', 'city'], additionalProperties: false })
    expect(out.evidence).toEqual([
      { path: '/title', source: 'dom', evidencePath: 'h1[0]' },
      { path: '/price', source: 'text', evidencePath: 'p.price_color', text: '£51.77' },
      { path: '/publisher', source: 'model' },
      { path: '/edition', source: 'model' },
    ])
  })

  it('sends a schema strict mode cannot express without strict, and records why', async () => {
    const requests: Array<Record<string, any>> = []
    const schema = json({ title: { type: 'string' }, details: { type: 'object', additionalProperties: { type: 'string' } } }, ['title', 'details'], true)
    const out = await extractStructured(page(bookInformation), schema, {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: openAiEndpoint({ title: 'Another title', details: { Pages: '112' } }, requests),
    })
    expect(requests[0]!.response_format.json_schema).toMatchObject({ strict: false, schema: schema.schema })
    expect(out).toMatchObject({ status: 'complete', data: { title: 'A Light in the Attic', details: { Pages: '112' } }, modelUsage: { strict: false } })
    expect(out.modelUsage?.strictReason).toContain('/properties/details')
  })
})
