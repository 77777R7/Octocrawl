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

/** A FetchResult for inline HTML, with the document the HTTP lane attaches. */
function page(html: string, url = 'https://books.example/catalogue/a-light-in-the-attic_1000/index.html'): FetchResult {
  const out = extractTf.extract(html, { url })
  return {
    ...result, requestedUrl: url, markdown: 'page', evidence: { ...result.evidence, finalUrl: url },
    document: { title: out.title, pageType: out.pageType, strategy: out.strategy, confidence: out.confidence, product: out.product ?? null, adapter: out.adapter, entities: out.entities, adapterValidation: out.adapterValidation, labelledValues: out.labelledValues },
  }
}
const json = (properties: Record<string, JsonSchema>, required: string[], modelFallback = false): JsonFormatRequest => ({
  type: 'json', schema: { type: 'object', properties, required }, ...(modelFallback ? { modelFallback } : {}),
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
    expect(out.evidence).toContainEqual({ path: '/price', source: 'dom', evidencePath: '#corePrice_feature_div' })
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

  it('maps page labels and the visible price to top-level keys and says where each came from', async () => {
    const schema = json({ title: { type: 'string' }, price: { type: 'number' }, availability: { type: 'string' }, upc: { type: 'string' }, isbn: { type: 'string' }, numberOfReviews: { type: 'integer' } }, ['title', 'price', 'availability', 'upc', 'isbn'])
    const out = await extractStructured(page(bookInformation), schema, {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ title: 'A Light in the Attic', price: 51.77, availability: 'In stock (22 available)', upc: 'a897fe39b1053632', numberOfReviews: 0 })
    expect(out.issues).toEqual([{ code: 'missing_required', path: '/isbn', message: 'required field unavailable: /isbn' }])
    expect(out.evidence).toEqual([
      { path: '/price', source: 'text', evidencePath: 'p.price_color' },
      { path: '/availability', source: 'dom', evidencePath: 'table[0] tr[5] "Availability"' },
      { path: '/upc', source: 'dom', evidencePath: 'table[0] tr[0] "UPC"' },
      { path: '/numberOfReviews', source: 'dom', evidencePath: 'table[0] tr[6] "Number of reviews"' },
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
})
