import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompactScrapeResponse, FetchResult, JsonFormatRequest, JsonSchema, ProductFacts, ScrapeResponse } from '@w2l/contracts'
import { extractTf } from '@w2l/extract-tf'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Ajv2020 from 'ajv/dist/2020.js'
import { contractSha256, toEvidenceRecord } from '@w2l/runtime'
import { extractStructured, prepareScrapeResponse, structuredModelConfigFromEnv } from '../src/structured.js'

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

/** The arXiv abstract page: a subject heading above the paper's own labelled title, citation_* tags, and metadata rows labelled by data cells. */
const arxivAbstract = `<html lang="en"><head><title>[1706.03762] Attention Is All You Need</title>
<meta name="citation_title" content="Attention Is All You Need" />
<meta name="citation_author" content="Vaswani, Ashish" /><meta name="citation_author" content="Shazeer, Noam" /><meta name="citation_author" content="Parmar, Niki" />
<meta name="citation_date" content="2017/06/12" /><meta name="citation_online_date" content="2023/08/02" />
<meta property="og:title" content="Attention Is All You Need" /></head><body>
<div id="abs-outer"><div class="leftcolumn"><div class="subheader"><h1>Computer Science > Computation and Language</h1></div>
<div id="content-inner"><div id="abs">
<div class="dateline">[Submitted on 12 Jun 2017 (<a href="/abs/1706.03762v1">v1</a>), last revised 2 Aug 2023 (this version, v7)]</div>
<h1 class="title mathjax"><span class="descriptor">Title:</span>Attention Is All You Need</h1>
<div class="authors"><span class="descriptor">Authors:</span><a href="/a/vaswani">Ashish Vaswani</a>, <a href="/a/shazeer">Noam Shazeer</a>, <a href="/a/parmar">Niki Parmar</a></div>
<blockquote class="abstract mathjax"><span class="descriptor">Abstract:</span>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.</blockquote>
<div class="metatable"><table summary="Additional metadata">
<tr><td class="tablecell label">Comments:</td><td class="tablecell comments mathjax">15 pages, 5 figures</td></tr>
<tr><td class="tablecell label">Cite as:</td><td class="tablecell arxivid"><span class="arxivid"><a href="/abs/1706.03762">arXiv:1706.03762</a> [cs.CL]</span></td></tr>
<tr><td class="tablecell label">&nbsp;</td><td class="tablecell arxivdoi"><a href="https://doi.org/10.48550/arXiv.1706.03762">https://doi.org/10.48550/arXiv.1706.03762</a></td></tr>
</table></div></div></div></div></div></body></html>`

/** A GOV.UK news story: its description meta, a NewsArticle JSON-LD node that names the story with `name`, and the From/Published list. */
const govukStory = `<html lang="en"><head><title>Applications open for inquest training course - GOV.UK</title>
<meta name="description" content="Applications are now open for training providers to submit an inquest training course to us for approval.">
<meta name="govuk:first-published-at" content="2026-10-08T15:53:00+01:00">
<script type="application/ld+json">{"@context":"http://schema.org","@type":"NewsArticle","mainEntityOfPage":{"@type":"WebPage","@id":"https://www.gov.uk/government/news/approved-training-course-for-inquests"},"name":"Applications open for inquest training course","datePublished":"2026-10-08T15:53:00+01:00","dateModified":"2026-10-16T13:00:37+01:00","text":"Applications are now open for training providers to submit an inquest training course to us for approval.","publisher":{"@type":"Organization","name":"GOV.UK","url":"https://www.gov.uk"}}</script>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"item":{"name":"Home","@id":"https://www.gov.uk/"}}]}</script>
</head><body><main id="content" class="govuk-main-wrapper">
<h1 class="gem-c-heading__text govuk-heading-xl">Applications open for inquest training course</h1>
<p class="gem-c-lead-paragraph">Applications are now open for training providers to submit an inquest training course to us for approval.</p>
<dl class="gem-c-metadata__list"><dt>From:</dt><dd><a href="/government/organisations/legal-aid-agency">Legal Aid Agency</a></dd>
<dt>Published:</dt><dd>8 October 2026</dd><dt>Last updated:</dt><dd>16 October 2026</dd></dl>
<div class="govspeak"><p>${'Training providers can now apply to have an inquest training course approved, so that providers of legal help at inquests can meet the new supervision standard. '.repeat(3)}</p></div>
</main></body></html>`

/** Wikipedia's taxobox: rank labels in data cells ending in a colon, under header rows. */
const octopusInfobox = `<html lang="en"><head><title>Octopus - Wikipedia</title></head><body><main id="content"><h1>Octopus</h1>
<div class="mw-parser-output"><table class="infobox biota"><tbody>
<tr><th colspan="2">Octopus</th></tr>
<tr><td colspan="2">Common octopus (Octopus vulgaris)</td></tr>
<tr><th colspan="2">Scientific classification</th></tr>
<tr><td>Kingdom:</td><td><a href="/wiki/Animal">Animalia</a></td></tr>
<tr class="taxonrow"><td>Phylum:</td><td><a href="/wiki/Mollusca">Mollusca</a></td></tr>
<tr class="taxonrow"><td>Order:</td><td><a href="/wiki/Octopus">Octopoda</a><br><small><a href="/wiki/William_Elford_Leach">Leach</a>, 1818</small></td></tr>
</tbody></table>
<p>${'The octopus is a soft-bodied, eight-limbed mollusc of the order Octopoda, with around 300 species. '.repeat(3)}</p></div></main></body></html>`

/** A FetchResult for inline HTML, with the document the HTTP lane attaches. */
function page(html: string, url = 'https://books.example/catalogue/a-light-in-the-attic_1000/index.html'): FetchResult {
  const out = extractTf.extract(html, { url })
  return {
    ...result, requestedUrl: url, markdown: 'page', evidence: { ...result.evidence, finalUrl: url }, metadata: out.metadata,
    document: { title: out.title, titlePath: out.titlePath, pageType: out.pageType, strategy: out.strategy, confidence: out.confidence, product: out.product ?? null, adapter: out.adapter, entities: out.entities, adapterValidation: out.adapterValidation, labelledValues: out.labelledValues, declaredValues: out.declaredValues },
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
  it.each([0.42, null])('keeps the cached capture cost %s while judging zero fetch usage for this call', async cost => {
    const run = { ...result, usage: { ...result.usage, externalCostUsd: cost },
      trace: [{ at: 0, lane: 'http' as const, event: 'cache_hit', detail: { cachedAt: '2026-10-15T00:00:00Z', externalCostUsd: cost } }],
      channelsTried: [], ladderTrace: [], summary: {
        channelsTried: [], attempts: [], wallMs: 0, browserMs: 0, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, contentTokens: 0, externalCostUsd: 0,
        externalCost: { knownSubtotal: 0, unknown: false }, contentTokenMeter: { knownSubtotal: 0, unknown: false }, artifacts: [],
      },
    }
    const response = await prepareScrapeResponse(run, { url: run.requestedUrl, formats: ['markdown'], debug: false, verify: { checks: [
      { type: 'field', path: 'usage.requestCount', equals: 0 },
      { type: 'field', path: 'usage.externalCostUsd', equals: 0 },
    ] } }, {}, null, performance.now(), 'cached-call', false) as CompactScrapeResponse
    expect(response.usage.externalCostUsd).toBe(0)
    expect(response.evidenceRecord.access.externalCostUsd).toBe(cost)
    expect(response.evidenceRecord.rawSha256).toBe(result.evidence.rawBodySha256)
    expect(response.verification.status).toBe('passed')
    expect(response.evidenceRecord.verification?.status).toBe('passed')
  })

  it('judges a field on the delivered compact document rather than discarded product facts', async () => {
    const run = { ...result, channelsTried: ['http'], ladderTrace: [], summary: {
      channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, externalCostUsd: null,
      externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 10, unknown: false }, artifacts: [],
    } }
    const verify = { checks: [{ type: 'field' as const, path: 'document.product.price.value', equals: '1299.00' }] }
    const compact = await prepareScrapeResponse(run, { url: run.requestedUrl, debug: false, formats: ['markdown'], verify }, {}, null, performance.now()) as CompactScrapeResponse
    expect(compact.document).not.toHaveProperty('product')
    expect(compact.verification.status).toBe('failed')
    expect(compact.readiness.state).not.toBe('ready')
    expect(compact.evidenceRecord?.verification?.status).toBe('failed')
    const full = await prepareScrapeResponse(run, { url: run.requestedUrl, debug: true, formats: ['markdown'], verify }, {}, null, performance.now()) as ScrapeResponse
    expect(full.document?.product?.price?.value).toBe('1299.00')
    expect(full.verification?.status).toBe('passed')
  })

  it('does not count normalized entities removed from a compact response as delivered records', async () => {
    const run = { ...result, channelsTried: ['http'], ladderTrace: [], summary: {
      channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, externalCostUsd: null,
      externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 10, unknown: false }, artifacts: [],
    } }
    const response = await prepareScrapeResponse(run, { url: run.requestedUrl, debug: false, formats: ['markdown'], verify: { checks: [{ type: 'listRecordsMin', path: 'document.entities', min: 1 }] } }, {}, null, performance.now()) as CompactScrapeResponse
    expect(response.document).not.toHaveProperty('entities')
    expect(response.verification.status).toBe('failed')
  })

  it('delivers Markdown a contract checks when an omitted compact format would otherwise choose only adapter JSON', async () => {
    const run = { ...result, channelsTried: ['http'], ladderTrace: [], summary: {
      channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, externalCostUsd: null,
      externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 10, unknown: false }, artifacts: [],
    } }
    const response = await prepareScrapeResponse(run, { url: run.requestedUrl, debug: false, verify: { checks: [{ type: 'markdownIncludes', text: 'Subject headphones' }] } }, {}, null, performance.now()) as CompactScrapeResponse
    expect(response.verification.status).toBe('passed')
    expect(response.markdown).toContain('Subject headphones')
    expect(response.formats).toContain('markdown')
    expect(response.formats).toContain('json')
    const jsonOnly = await prepareScrapeResponse(run, { url: run.requestedUrl, debug: false, formats: [json({ price: { type: 'number' } }, ['price'])], verify: { checks: [{ type: 'field', path: 'json.data.price', equals: 1299 }] } }, {}, null, performance.now()) as CompactScrapeResponse
    expect(jsonOnly.verification.status).toBe('passed')
    expect(jsonOnly.markdown).toBeUndefined()
    expect(jsonOnly.formats).toEqual(['json'])
  })

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

describe('warning string', () => {
  const summary = { channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, externalCostUsd: null, externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 10, unknown: false }, artifacts: [] }

  it('joins the warnings into one warning string on the full and compact responses, and leaves it out with them', async () => {
    const warnings = [
      { code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (script_shell); this HTTP capture may be a shell.' },
      { code: 'low_content_yield', message: 'The http lane extracted 12 tokens at confidence 0.2; the browser lane was not available to this request.' },
    ]
    const run = { ...result, warnings, channelsTried: ['http'], ladderTrace: [], summary }
    const joined = 'The page appears to fill in its data with JavaScript (script_shell); this HTTP capture may be a shell. The http lane extracted 12 tokens at confidence 0.2; the browser lane was not available to this request.'
    const compact = await prepareScrapeResponse(run, { url: result.requestedUrl, formats: ['markdown'], debug: false }, {}, null, performance.now()) as import('@w2l/contracts').CompactScrapeResponse
    expect(compact).toMatchObject({ warnings, warning: joined })
    const full = await prepareScrapeResponse(run, { url: result.requestedUrl }, {}, null, performance.now()) as ScrapeResponse
    expect(full).toMatchObject({ warnings, warning: joined })
    const clean = { ...result, channelsTried: ['http'], ladderTrace: [], summary }
    for (const response of [await prepareScrapeResponse(clean, { url: result.requestedUrl, formats: ['markdown'], debug: false }, {}, null, performance.now()), await prepareScrapeResponse(clean, { url: result.requestedUrl }, {}, null, performance.now())]) {
      expect(response).not.toHaveProperty('warning')
      expect(response).not.toHaveProperty('warnings')
      expect(response).not.toHaveProperty('agentHints')
    }
  })
})

describe('readiness (ADR 0007, ROADMAP PA item 11)', () => {
  const summary = { channelsTried: ['http'], attempts: [], wallMs: 10, browserMs: 0, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, externalCostUsd: null, externalCost: { knownSubtotal: 0, unknown: true }, contentTokenMeter: { knownSubtotal: 10, unknown: false }, artifacts: [] }

  it('says on the full and compact responses and their Evidence Record whether the page was ready, read from the full result', async () => {
    const ready = { ...result, channelsTried: ['http'], ladderTrace: [], summary }
    for (const response of [await prepareScrapeResponse(ready, { url: result.requestedUrl, formats: ['markdown'], debug: false }, {}, null, performance.now()), await prepareScrapeResponse(ready, { url: result.requestedUrl }, {}, null, performance.now())]) {
      expect(response.readiness).toEqual({ state: 'ready', basis: [] })
      expect(response.evidenceRecord?.readiness).toEqual({ state: 'ready', basis: [] })
    }
    // WSJ's market data over HTTP: a shell its scripts fill in.
    const shell = { ...ready, warnings: [{ code: 'client_rendered_suspected', message: 'The page appears to fill in its data with JavaScript (loading_text); this HTTP capture may be a shell.' }] }
    const compact = await prepareScrapeResponse(shell, { url: result.requestedUrl, formats: ['markdown'], debug: false }, {}, null, performance.now()) as import('@w2l/contracts').CompactScrapeResponse
    expect(compact.readiness).toEqual({ state: 'not_loaded', basis: ['client_rendered_suspected'] })
    // A rendered page with no main content whose visible text was there: the extractor missed it, whatever formats were asked for.
    const missed = { ...ready, status: 'failed' as const, failureReason: 'empty_unverified' as const, lane: 'browser_local' as const, markdown: 'x'.repeat(5_000), trace: [...ready.trace, { at: 1, lane: 'browser_local' as const, event: 'extract', detail: { textChars: 5_000 } }] }
    const full = await prepareScrapeResponse(missed, { url: result.requestedUrl, formats: ['links'] }, {}, null, performance.now()) as ScrapeResponse
    expect(full.readiness).toEqual({ state: 'not_extracted', basis: ['empty_unverified'] })
    expect(full.evidenceRecord?.readiness).toEqual({ state: 'not_extracted', basis: ['empty_unverified'] })
  })

  it('reads a request\'s task contract with the region wait: what held on the live page but not in the answer was not extracted (ADR 0007)', async () => {
    const verify = { checks: [{ type: 'markdownCountMin' as const, pattern: '\\d{1,3}(?:,\\d{3})+\\.\\d{2}', min: 5 }] }
    const regionWait = (ready: boolean) => ({ at: 1, lane: 'browser_local' as const, event: 'region_wait', detail: { ready, empty: false, waitedMs: 2_000, reads: 5, judged: 5, loading: false, steady: true, contractSha256: contractSha256(verify), checks: [] } })
    const page = (ready: boolean, markdown: string) => ({ ...result, lane: 'browser_local' as const, markdown, channelsTried: ['browser_local'], ladderTrace: [], summary, trace: [...result.trace, regionWait(ready)] })
    const missed = await prepareScrapeResponse(page(true, '# Markets\n\nDow'), { url: result.requestedUrl, verify }, {}, null, performance.now()) as ScrapeResponse
    expect(missed.verification).toMatchObject({ status: 'failed', reason: 'checks_failed' })
    expect(missed.readiness).toEqual({ state: 'not_extracted', basis: ['checks_failed', 'region_ready'], waitedMs: 2_000 })
    expect(missed.evidenceRecord?.readiness).toEqual({ state: 'not_extracted', basis: ['checks_failed', 'region_ready'] })
    const absent = await prepareScrapeResponse(page(false, '# Markets\n\nDow'), { url: result.requestedUrl, verify }, {}, null, performance.now()) as ScrapeResponse
    expect(absent.readiness).toEqual({ state: 'not_served', basis: ['checks_failed', 'region_absent'], waitedMs: 2_000 })
    const done = await prepareScrapeResponse(page(true, '42,510.33 18,311.02 5,801.40 2,050.10 1,990.00'), { url: result.requestedUrl, verify }, {}, null, performance.now()) as ScrapeResponse
    expect(done.readiness).toEqual({ state: 'ready', basis: ['verified'], waitedMs: 2_000 })
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

  it('carries the screenshot asked for on the full and compact responses, null when the run has none, and nulls the attempt copies so the image travels once', async () => {
    const screenshot = { contentType: 'image/png' as const, width: 1280, height: 800, fullPage: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, quality: null, bytes: 3, sha256: 'a'.repeat(64), path: null, base64: 'iVBO' }
    const browser: FetchResult = { ...result, lane: 'browser_local', screenshot }
    const run = { ...browser, channelsTried: ['browser_local'], ladderTrace: [], summary: { ...summary, channelsTried: ['browser_local'], attempts: [{ channel: 'browser_local', result: browser }] } }
    const compact = await prepareScrapeResponse(run, { url: result.requestedUrl, formats: ['markdown', 'screenshot'], debug: false }, {}, null, performance.now()) as CompactScrapeResponse
    expect(compact.formats).toEqual(['markdown', 'screenshot'])
    expect(compact.screenshot).toEqual(screenshot)
    const full = await prepareScrapeResponse(run, { url: result.requestedUrl, formats: ['markdown', { type: 'screenshot' }], debug: true }, {}, null, performance.now()) as ScrapeResponse
    expect(full.screenshot).toEqual(screenshot)
    // debug keeps the attempt's Markdown; the image alone is not repeated.
    expect(full.summary.attempts.map((attempt) => attempt.result.screenshot)).toEqual([null])
    expect(full.summary.attempts[0]!.result.markdown).toBe(result.markdown)
    // Asked for, and the run carried none (no page rendered): null, never invented. Not asked for: no key.
    const none = await prepareScrapeResponse({ ...result, channelsTried: ['browser_local'], ladderTrace: [], summary }, { url: result.requestedUrl, formats: ['screenshot'], debug: false }, {}, null, performance.now()) as CompactScrapeResponse
    expect(none).toMatchObject({ formats: ['screenshot'], screenshot: null })
    expect(await prepareScrapeResponse(run, { url: result.requestedUrl, formats: ['markdown'], debug: false }, {}, null, performance.now())).not.toHaveProperty('screenshot')
  })
})

describe('structured JSON extraction', () => {
  it('defaults compact adapter responses to JSON, including unverified identities', async () => {
    const response = {
      ...result, channelsTried: ['http'], ladderTrace: [], summary: { attempts: [], totalMs: 10 },
    } as unknown as ScrapeResponse
    const good = await prepareScrapeResponse(response, { url: result.requestedUrl, debug: false }, {}, null, performance.now()) as CompactScrapeResponse
    expect(good.formats).toEqual(['json'])
    expect(good.json?.status).toBe('complete')
    expect(good).not.toHaveProperty('markdown')
    expect(good.document).not.toHaveProperty('product')
    expect(good.document).not.toHaveProperty('entities')
    const bad = await prepareScrapeResponse({
      ...response,
      document: { ...response.document!, adapterValidation: { valid: false, issues: ['subject_id_unverified'] } },
    }, { url: result.requestedUrl, debug: false }, {}, null, performance.now()) as CompactScrapeResponse
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
    expect(out.evidence).toContainEqual({ path: '/price', source: 'dom', evidencePath: '#corePrice_feature_div', text: '1299.00', normalized: 1299, conversion: 'number/decimal' })
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
    expect(out.evidence).toContainEqual({ path: '/material', source: 'model', evidencePath: 'markdown line 3', text: 'aluminium' })
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

  it('locates a declared product fact by its JSON Pointer', async () => {
    const out = await extractStructured(page(lamp, 'https://shop.example/lamp'), json({ name: { type: 'string' }, price: { type: 'number' } }, ['name', 'price']), {}, null)
    expect(out).toMatchObject({ status: 'complete', data: { name: 'Harbour lamp', price: 19 }, issues: [] })
    expect(out.evidence).toEqual([
      { path: '/name', source: 'jsonld', evidencePath: '/script/0/name' },
      { path: '/price', source: 'jsonld', evidencePath: '/script/0/offers/price', text: '19.00', normalized: 19, conversion: 'number/decimal', context: { currency: 'GBP', offerType: 'Offer' } },
    ])
  })

  it('leaves out a price the product\'s own sources state differently, naming both', async () => {
    const html = lamp.replace('<body><main>', '<body><main><div itemscope itemtype="https://schema.org/Product"><meta itemprop="sku" content="HL-1"><meta itemprop="price" content="21.00"></div>')
    const out = await extractStructured(page(html, 'https://shop.example/lamp'), json({ name: { type: 'string' }, price: { type: 'number' } }, ['name']), {}, null)
    expect(out.data).toEqual({ name: 'Harbour lamp' })
    expect(out.issues).toContainEqual({
      code: 'field_ambiguous',
      path: '/price',
      message: 'the page states different values for /price: "19.00" (jsonld, /script/0/offers/price), "21.00" (microdata, microdata[0] [itemprop~="price"])',
    })
  })

  it('reports subject_unverified when the page declares products nothing tells apart', async () => {
    const other = '<script type="application/ld+json">{"@type":"Product","name":"Harbour mirror","sku":"HM-2","offers":{"price":"44.00","priceCurrency":"GBP"}}</script>'
    const out = await extractStructured(page(lamp.replace('</head>', `${other}</head>`), 'https://shop.example/lamp'), json({ name: { type: 'string' }, price: { type: 'number' }, currency: { type: 'string' } }, ['name']), {}, null)
    expect(out.status).toBe('incomplete')
    // Only the currency both candidates state is read; neither name nor price is chosen.
    expect(out.data).toEqual({ currency: 'GBP' })
    expect(out.issues.find(issue => issue.code === 'subject_unverified')?.message).toMatch(/^product identity conflicting: .*\/script\/0 \(sku HL-1\).*\/script\/1 \(sku HM-2\)/)
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

  it('maps a book\'s byline authors and leaves its brand null', async () => {
    const authored: FetchResult = { ...result, document: { ...result.document!, product: { ...product, brand: null, authors: [{ value: 'David Thomas', source: 'dom', path: '#bylineInfo .author' }, { value: 'Andrew Hunt', source: 'dom', path: '#bylineInfo .author' }] } } }
    const out = await extractStructured(authored, json({ authors: { type: 'array', items: { type: 'string' } }, brand: { type: ['string', 'null'] } }, ['authors', 'brand']), {}, null)
    expect(out.data).toMatchObject({ authors: ['David Thomas', 'Andrew Hunt'], brand: null })
    expect(out.evidence).toContainEqual({ path: '/authors', source: 'dom', evidencePath: '#bylineInfo .author' })
  })

  it('maps page labels and the visible price to top-level keys and says where each came from', async () => {
    const schema = json({ title: { type: 'string' }, price: { type: 'number' }, availability: { type: 'string' }, upc: { type: 'string' }, isbn: { type: 'string' }, numberOfReviews: { type: 'integer' } }, ['title', 'price', 'availability', 'upc', 'isbn'])
    const out = await extractStructured(page(bookInformation), schema, {}, null)
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ title: 'A Light in the Attic', price: 51.77, availability: 'In stock (22 available)', upc: 'a897fe39b1053632', numberOfReviews: 0 })
    expect(out.issues).toEqual([{ code: 'missing_required', path: '/isbn', message: 'required field unavailable: /isbn' }])
    expect(out.evidence).toEqual([
      { path: '/title', source: 'dom', evidencePath: 'h1[0]' },
      { path: '/price', source: 'text', evidencePath: 'p.price_color', text: '£51.77', normalized: 51.77, conversion: 'number/decimal', context: { currency: '£' } },
      { path: '/availability', source: 'dom', evidencePath: 'table[0] tr[5] "Availability"' },
      { path: '/upc', source: 'dom', evidencePath: 'table[0] tr[0] "UPC"' },
      { path: '/numberOfReviews', source: 'dom', evidencePath: 'table[0] tr[6] "Number of reviews"', text: '0', normalized: 0, conversion: 'number/plain' },
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

  it('takes the heading the page\'s declared title names, not a site, archive or subtitle heading (F2 false successes)', async () => {
    const body = `<p>${'Reusing one HTTP/1 connection for many requests saves a handshake for each of them. '.repeat(4)}</p>`
    const title = async (html: string, url: string, extra: Record<string, JsonSchema> = {}) => {
      const out = await extractStructured(page(html, url), json({ title: { type: 'string' }, ...extra }, ['title']), {}, null)
      return { title: (out.data as { title?: string } | undefined)?.title, evidence: out.evidence.filter((e) => e.path === '/title') }
    }
    // Go blog: the archive's own heading comes first, and is a link to the archive.
    expect(await title(`<html><head><title>Better HTTP/1 connection reuse - The Go Programming Language</title></head><body><main>
<h1 class="small"><a href="/blog/">The Go Blog</a></h1><h1>Better HTTP/1 connection reuse</h1>${body}</main></body></html>`, 'https://go.dev/blog/http-connection-reuse'))
      .toEqual({ title: 'Better HTTP/1 connection reuse', evidence: [{ path: '/title', source: 'dom', evidencePath: 'h1[1]' }] })
    // Rust blog: no h1; the post's h2 opens the <title>, which adds the blog's name.
    expect(await title(`<html><head><title>Announcing Rust 1.99.0 | Rust Blog</title></head><body><main>
<header><h2>Announcing Rust 1.99.0</h2></header>${body}<h2>What's in 1.99.0 stable</h2>${body}</main></body></html>`, 'https://blog.rust-lang.org/2026/10/01/Rust-1.99.0/'))
      .toEqual({ title: 'Announcing Rust 1.99.0', evidence: [{ path: '/title', source: 'dom', evidencePath: 'h2[0]' }] })
    // IETF datatracker: a <small> subtitle inside the heading is not the title.
    expect(await title(`<html><head><title>RFC 9112 - HTTP/1.1</title></head><body><main>
<h1>
    HTTP/1.1
    <br>
    <small class="text-body-secondary">RFC 9112
     also known as <a href="/doc/std99/">STD 99</a>
    </small>
</h1>${body}</main></body></html>`, 'https://datatracker.ietf.org/doc/rfc9112/'))
      .toEqual({ title: 'HTTP/1.1', evidence: [{ path: '/title', source: 'dom', evidencePath: 'h1[0]' }] })
    // PEP: a schema that asks for the number beside the title takes the title without it; one that does not keeps the heading.
    const pep = `<html><head><title>PEP 8 – Style Guide for Python Code | peps.python.org</title></head><body><main>
<h1 class="page-title">PEP 8 – Style Guide for Python Code</h1>${body}</main></body></html>`
    expect(await title(pep, 'https://peps.python.org/pep-0008/', { number: { type: 'string' } }))
      .toEqual({ title: 'Style Guide for Python Code', evidence: [{ path: '/title', source: 'dom', evidencePath: 'h1[0]' }] })
    expect((await title(pep, 'https://peps.python.org/pep-0008/')).title).toBe('PEP 8 – Style Guide for Python Code')
    expect((await title(`<html><head><title>COVID-19: Vaccines and boosters | State Health</title></head><body><main><h1>COVID-19: Vaccines and boosters</h1>${body}</main></body></html>`, 'https://health.example.gov/covid-19/')).title)
      .toBe('COVID-19: Vaccines and boosters')
    expect((await title(pep, 'https://peps.python.org/pep-0008/', { pep_number: { type: 'string' } })).title).toBe('Style Guide for Python Code')
    // A number field about something else (a phone, a case, a model) is not the document's number.
    for (const [heading, extra] of [['NHS 111 – Get urgent help', 'phoneNumber'], ['COVID-19: Vaccines and boosters', 'caseNumber'], ['RTX 4090 – Founders Edition', 'modelNumber']] as const) {
      expect((await title(`<html><head><title>${heading}</title></head><body><main><h1>${heading}</h1>${body}</main></body></html>`, 'https://site.example/page', { [extra]: { type: 'string' } })).title, extra).toBe(heading)
    }
    // PyPI: og:title "requests" is not the README's "Requests"; the project header stays the title.
    expect((await title(`<html><head><title>requests · PyPI</title><meta property="og:title" content="requests"></head><body><main>
<h1 class="project-header__name">requests 2.34.2</h1>${body}<h1 id="user-content-requests">Requests<a href="#user-content-requests"></a></h1>${body}</main></body></html>`, 'https://pypi.org/project/requests/')).title)
      .toBe('requests 2.34.2')
    // A site's name closes the <title>: a heading naming it is not the title, however long it is; the first h1 stays.
    for (const [declared, headings, expected] of [
      ['Release notes for version 3 - Acme Docs', '<h2>Acme Docs</h2><h2>New features</h2>', 'Release notes for version 3 - Acme Docs'],
      ['About | Contoso Pharmaceuticals Ltd', '<h2>Contoso Pharmaceuticals Ltd</h2><h2>Our history</h2>', 'About | Contoso Pharmaceuticals Ltd'],
      ['About us | Contoso Pharmaceuticals Ltd', '<h1>About us</h1><h1>Contoso Pharmaceuticals Ltd</h1>', 'About us'],
      ['Kiln notes | Harbour Pottery', '<h1>Kiln temperatures</h1><h2>Harbour Pottery</h2>', 'Kiln temperatures'],
      // A site's name that opens the <title> is shorter than the subject after it.
      ['Acme Blog: How we scaled Postgres', '<h2>Acme Blog</h2><h2>Results</h2>', 'Acme Blog: How we scaled Postgres'],
      // A first h1 that is not a link to another page stays the title, whatever a later one matches.
      ['Shoes | Nike', '<h1>Air Max 90</h1><h1>Shoes</h1>', 'Air Max 90'],
      ['Home - Acme', '<h1>Welcome</h1><h1>Home</h1>', 'Welcome'],
      ['Star Wars: Episode IV – A New Hope (1977) - IMDb', '<h1>Cast</h1><h1>Star Wars</h1>', 'Cast'],
    ] as const) {
      expect((await title(`<html><head><title>${declared}</title></head><body><main>${headings.replace(/<\/h(\d)>/g, `</h$1>${body}`)}</main></body></html>`, 'https://site.example/about')).title, declared).toBe(expected)
    }
  })

  it('takes a scholarly page\'s title, authors and date from its citation_* tags, never from a heading above the title', async () => {
    const out = await extractStructured(page(arxivAbstract, 'https://arxiv.org/abs/1706.03762'), json({
      title: { type: 'string' }, authors: { type: 'array', items: { type: 'string' } }, author: { type: ['string', 'null'] }, date: { type: 'string' },
      doi: { type: ['string', 'null'] }, submitted: { type: ['string', 'null'] }, comments: { type: 'string' }, citeAs: { type: 'string' },
    }, ['title', 'authors', 'date']), {}, null)
    expect(out.data).toEqual({
      title: 'Attention Is All You Need', authors: ['Vaswani, Ashish', 'Shazeer, Noam', 'Parmar, Niki'], author: null, date: '2017/06/12',
      doi: null, submitted: null, comments: '15 pages, 5 figures', citeAs: 'arXiv:1706.03762 [cs.CL]',
    })
    expect(out.evidence).toEqual([
      { path: '/title', source: 'meta', evidencePath: 'meta[name="citation_title"]' },
      { path: '/authors', source: 'meta', evidencePath: 'meta[name="citation_author"]' },
      { path: '/date', source: 'meta', evidencePath: 'meta[name="citation_date"]' },
      { path: '/comments', source: 'dom', evidencePath: 'table[0] tr[0] "Comments:"' },
      { path: '/citeAs', source: 'dom', evidencePath: 'table[0] tr[1] "Cite as:"' },
    ])
    // Eight authors do not fit one string; the DOI row has no label and no citation_doi tag names it; "Submitted on" is prose.
    expect(out.issues).toEqual([
      { code: 'field_unavailable', path: '/author', message: 'the page declares 3 values for citation_author (meta[name="citation_author"]); a string holds one, so none was chosen' },
      { code: 'field_unavailable', path: '/doi', message: 'no verified source for this nullable field on the selected page' },
      { code: 'field_unavailable', path: '/submitted', message: 'no verified source for this nullable field on the selected page' },
    ])
    expect(out.status).toBe('complete')
  })

  it('takes a DOI, one author and a publication date from citation_* tags, and the tag name itself as a key', async () => {
    const html = `<html><head><title>Tidal mixing | Journal of Coasts</title>
<meta name="citation_title" content="Tidal mixing in shallow estuaries"><meta name="citation_author" content="Okafor, Ada">
<meta name="citation_publication_date" content="2024/03/05"><meta name="citation_doi" content="10.1234/coasts.2024.17"></head>
<body><main><h1>Tidal mixing in shallow estuaries</h1><p>${'We measured tidal mixing across nine shallow estuaries over two summers and report the salinity gradients. '.repeat(3)}</p></main></body></html>`
    const out = await extractStructured(page(html, 'https://journal.example/coasts/17'), json({
      doi: { type: 'string' }, author: { type: 'string' }, authors: { type: 'array', items: { type: 'string' } }, publicationDate: { type: 'string' }, citation_doi: { type: 'string' },
    }, ['doi', 'author', 'authors', 'publicationDate', 'citation_doi']), {}, null)
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({ doi: '10.1234/coasts.2024.17', author: 'Okafor, Ada', authors: ['Okafor, Ada'], publicationDate: '2024/03/05', citation_doi: '10.1234/coasts.2024.17' })
    expect(out.evidence.map(item => [item.path, item.source, item.evidencePath])).toEqual([
      ['/doi', 'meta', 'meta[name="citation_doi"]'],
      ['/author', 'meta', 'meta[name="citation_author"]'],
      ['/authors', 'meta', 'meta[name="citation_author"]'],
      ['/publicationDate', 'meta', 'meta[name="citation_publication_date"]'],
      ['/citation_doi', 'meta', 'meta[name="citation_doi"]'],
    ])
  })

  it('fills description from <meta name="description"> and an article\'s schema.org names from its JSON-LD', async () => {
    const out = await extractStructured(page(govukStory, 'https://www.gov.uk/government/news/approved-training-course-for-inquests'), json({
      title: { type: 'string' }, description: { type: 'string' }, headline: { type: 'string' }, datePublished: { type: 'string' },
      dateModified: { type: 'string' }, published: { type: 'string' },
    }, ['title', 'description', 'headline', 'datePublished', 'dateModified', 'published']), {}, null)
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({
      title: 'Applications open for inquest training course',
      description: 'Applications are now open for training providers to submit an inquest training course to us for approval.',
      headline: 'Applications open for inquest training course', datePublished: '2026-10-08T15:53:00+01:00',
      dateModified: '2026-10-16T13:00:37+01:00', published: '8 October 2026',
    })
    expect(out.evidence).toEqual([
      { path: '/title', source: 'dom', evidencePath: 'h1[0]' },
      { path: '/description', source: 'meta', evidencePath: 'meta[name="description"]' },
      { path: '/headline', source: 'jsonld', evidencePath: 'ld+json[0] NewsArticle.name', context: { published: '2026-10-08T15:53:00+01:00', revised: '2026-10-16T13:00:37+01:00' } },
      { path: '/datePublished', source: 'jsonld', evidencePath: 'ld+json[0] NewsArticle.datePublished', context: { published: '2026-10-08T15:53:00+01:00', revised: '2026-10-16T13:00:37+01:00' } },
      { path: '/dateModified', source: 'jsonld', evidencePath: 'ld+json[0] NewsArticle.dateModified', context: { published: '2026-10-08T15:53:00+01:00', revised: '2026-10-16T13:00:37+01:00' } },
      { path: '/published', source: 'dom', evidencePath: 'dl[0] dt[1] "Published:"' },
    ])
  })

  it('fills description on a page that states nothing else about itself', async () => {
    const html = `<html><head><title>GitHub - python/cpython: The Python programming language</title>
<meta name="description" content="The Python programming language. Contribute to python/cpython development by creating an account on GitHub."></head>
<body><main><h1>python/cpython</h1><p>${'This is Python version 3.15.0 alpha 1, the source of the reference interpreter and its standard library. '.repeat(3)}</p></main></body></html>`
    const out = await extractStructured(page(html, 'https://github.com/python/cpython'), json({ description: { type: 'string' } }, ['description']), {}, null)
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({ description: 'The Python programming language. Contribute to python/cpython development by creating an account on GitHub.' })
  })

  it('leaves out a schema.org name that two articles on the page state differently', async () => {
    const node = (headline: string, date: string) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"${headline}","datePublished":"${date}"}</script>`
    const html = `<html><head><title>Harbour notes</title>${node('Spring tides', '2026-03-01')}${node('Neap tides', '2026-03-08')}</head>
<body><main><h1>Harbour notes</h1><p>${'Two short notes on the tides in the harbour this month, with the times of high water. '.repeat(3)}</p></main></body></html>`
    const out = await extractStructured(page(html, 'https://notes.example/tides'), json({ headline: { type: ['string', 'null'] }, datePublished: { type: ['string', 'null'] } }, ['headline', 'datePublished']), {}, null)
    expect(out.data).toEqual({ headline: null, datePublished: null })
    expect(out.issues.map(issue => [issue.code, issue.path])).toEqual([['field_ambiguous', '/headline'], ['field_ambiguous', '/datePublished']])
  })

  it('never fills from a declared value a field whose page labels disagree, nor a product\'s description or a page\'s name from meta or article JSON-LD', async () => {
    const dated = `<html><head><title>Tide tables</title><meta name="citation_date" content="2017/06/12"><meta name="description" content="Tide tables for the harbour."></head>
<body><main><h1>Tide tables</h1><p>${'Tide tables for the harbour, with the times of high and low water for each day. '.repeat(3)}</p>
<table><tr><th>Date</th><td>1 Jan 2020</td></tr><tr><th>Date</th><td>2 Feb 2021</td></tr><tr><th>Description</th><td>Spring</td></tr><tr><th>Description</th><td>Neap</td></tr></table></main></body></html>`
    const ambiguous = await extractStructured(page(dated, 'https://tides.example/'), json({ date: { type: ['string', 'null'] }, description: { type: ['string', 'null'] } }, ['date', 'description']), {}, null)
    expect(ambiguous.data).toEqual({ date: null, description: null })
    expect(ambiguous.issues.map(issue => [issue.code, issue.path])).toEqual([['field_ambiguous', '/date'], ['field_ambiguous', '/description']])
    // A shop's meta description is its sales line, not the product's description.
    const shopPage = lamp.replace('<title>Harbour lamp | Shop</title>', '<title>Harbour lamp | Shop</title><meta name="description" content="Buy Harbour lamp online at low price. Free shipping on orders over $50.">')
    const product = await extractStructured(page(shopPage, 'https://shop.example/lamp'), json({ description: { type: ['string', 'null'] } }, ['description']), {}, null)
    expect(product.data).toEqual({ description: null })
    const post = `<html><head><title>Jane Doe</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","name":"Ten tips for gardening"}</script></head>
<body><main><h1>Jane Doe</h1><p>${'Jane Doe writes about gardening, allotments and the plants that grow well by the sea. '.repeat(3)}</p></main></body></html>`
    const named = await extractStructured(page(post, 'https://blog.example/jane'), json({ name: { type: ['string', 'null'] }, headline: { type: ['string', 'null'] } }, ['name', 'headline']), {}, null)
    expect(named.data).toEqual({ name: null, headline: 'Ten tips for gardening' })
  })

  it('reads an infobox row whose label is a data cell ending in a colon', async () => {
    const out = await extractStructured(page(octopusInfobox, 'https://en.wikipedia.org/wiki/Octopus'), json({ kingdom: { type: 'string' }, order: { type: 'string' }, family: { type: ['string', 'null'] } }, ['kingdom', 'order', 'family']), {}, null)
    // A line break in the value cell separates its lines, as on the page.
    expect(out.data).toEqual({ kingdom: 'Animalia', order: 'Octopoda Leach, 1818', family: null })
    expect(out.evidence).toEqual([
      { path: '/kingdom', source: 'dom', evidencePath: 'table[0] tr[3] "Kingdom:"' },
      { path: '/order', source: 'dom', evidencePath: 'table[0] tr[5] "Order:"' },
    ])
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
    const out = await extractStructured({ ...page(book), markdown: '# A Light in the Attic\n\nShort poems and line drawings.' }, json({ title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, ['title', 'tags'], true), {}, {
      baseUrl: 'https://model.example', model: 'extractor',
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls++
        expect(JSON.parse(JSON.parse(String(init?.body)).messages[1].content).deterministic).toEqual({ title: 'A Light in the Attic' })
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tags: ['poems'] }) } }] }), { status: 200 })
      }) as typeof fetch,
    })
    expect(calls).toBe(1)
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({ title: 'A Light in the Attic', tags: ['poems'] })
    expect(out.evidence).toContainEqual({ path: '/tags/0', source: 'model', evidencePath: 'markdown line 3', text: 'poems' })
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
      { path: '/price', source: 'text', evidencePath: 'p.price_color', text: '£51.77', normalized: 51.77, conversion: 'number/decimal', context: { currency: '£' } },
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
    const cases: Array<[string, number, string, string, string]> = [
      ['12,99 €', 12.99, '12,99 €', 'decimal', '€'], ['€12,99', 12.99, '€12,99', 'decimal', '€'], ['1.299,00 €', 1299, '1.299,00 €', 'grouped', '€'],
      ['1 299,00 €', 1299, '1 299,00 €', 'grouped', '€'], ["CHF 1'299.00", 1299, "CHF 1'299.00", 'grouped', 'CHF'], ['$1,299.00', 1299, '$1,299.00', 'grouped', '$'], ['£51.77', 51.77, '£51.77', 'decimal', '£'],
    ]
    for (const [shown, value, text, rule, currency] of cases) {
      const out = await extractStructured(page(shop(shown), 'https://shop.example/lampe'), schema, {}, null)
      expect(out.data, shown).toEqual({ title: 'Messinglampe', price: value })
      expect(out.status, shown).toBe('complete')
      // The text the number was read from stays in its evidence.
      expect(out.evidence, shown).toContainEqual({ path: '/price', source: 'text', evidencePath: 'p.price', text, normalized: value, conversion: `number/${rule}`, context: { currency } })
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
    expect(counted.evidence).toContainEqual({ path: '/reviewCount', source: 'dom', evidencePath: '#acrCustomerReviewText', text: '1.234', normalized: 1234, conversion: 'number/count' })
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
    expect(out.evidence).toContainEqual({ path: '/preis', source: 'dom', evidencePath: 'table[0] tr[0] "Preis"', text: '1.299,– €', normalized: 1299, conversion: 'number/grouped', context: { currency: '€' } })
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

  it('keeps every page value and its evidence when the model answers every field, and keeps only what the model wrote that the page supports', async () => {
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
    // The page's "In Stock" is not in the enum: the model's in_stock replaces it and is located in that declared fact.
    // "aluminium" is in the page's text; "two years" is nowhere on the page, so /warranty stays missing (not null).
    expect(deterministic).toEqual({ asin: 'B012345678', title: 'Subject headphones', price: 1299, specifications: { Model: 'SC-10' } })
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ asin: 'B012345678', title: 'Subject headphones', price: 1299, availability: 'in_stock', specifications: { Model: 'SC-10' }, material: 'aluminium' })
    expect(out.evidence).toEqual([
      { path: '/asin', source: 'dom', evidencePath: 'url:/dp/{asin}' },
      { path: '/title', source: 'dom', evidencePath: '#productTitle' },
      { path: '/price', source: 'dom', evidencePath: '#corePrice_feature_div', text: '1299.00', normalized: 1299, conversion: 'number/decimal' },
      { path: '/specifications', source: 'dom', evidencePath: '#productDetails' },
      { path: '/availability', source: 'model', evidencePath: '#availability', text: 'In Stock' },
      { path: '/material', source: 'model', evidencePath: 'markdown line 3', text: 'aluminium' },
    ])
    expect(out.issues).toEqual([
      { code: 'model_unsupported', path: '/warranty', message: 'the model answered "two years", which the page does not state; it is left out' },
      { code: 'missing_required', path: '/warranty', message: 'required field unavailable: /warranty' },
    ])
  })

  it('does not take a model number that the page states only among other products', async () => {
    const unpriced: FetchResult = { ...result, document: { ...result.document!, product: { ...product, price: null, priceCurrency: null } } }
    const schema = json({ asin: { type: 'string' }, price: { type: 'number' } }, ['asin', 'price'], true)
    const ask = (markdown: string) => extractStructured({ ...unpriced, markdown }, schema, {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: openAiEndpoint({ asin: 'B012345678', price: 9.99 }, []),
    })
    const elsewhere = await ask('# Subject headphones\n\nA lightweight product made from aluminium.\n\n## Customers also bought\n\nOther headphones\n\n£9.99\n\n## Product details\n\nWeight 120 g')
    expect(elsewhere.status).toBe('incomplete')
    expect(elsewhere.data).toEqual({ asin: 'B012345678' })
    expect(elsewhere.issues.map(issue => [issue.code, issue.path])).toEqual([['model_unsupported', '/price'], ['missing_required', '/price']])
    // The same number in the product's own part of the page is taken, with its currency beside it.
    const own = await ask('# Subject headphones\n\nNow £9.99 while stocks last.\n\n## Customers also bought\n\nOther headphones\n\n£4.99')
    expect(own.status).toBe('complete')
    expect(own.data).toEqual({ asin: 'B012345678', price: 9.99 })
    expect(own.evidence).toContainEqual({ path: '/price', source: 'model', evidencePath: 'markdown line 3', text: '£9.99', normalized: 9.99, context: { currency: '£' } })
  })

  it('keeps a key the model named for a map only where the page states it, and reports a dropped list item at the list', async () => {
    const schema = json({
      details: { type: 'object', additionalProperties: { type: 'string' } },
      items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' } } } },
    }, ['details', 'items'], true)
    const answer = { details: { 'Warranty years': '112', Pages: '112' }, items: [{ name: 'Zeta', price: 3 }, { name: 'Lamp', price: 9.5 }] }
    const out = await extractStructured({ ...page(book), markdown: '# A Light in the Attic\n\nPages: 112\n\nLamp costs 9.50' }, schema, {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: openAiEndpoint(answer, []),
    })
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ details: { Pages: '112' }, items: [{ name: 'Lamp', price: 9.5 }] })
    expect(out.issues.map(issue => [issue.code, issue.path])).toEqual([['model_unsupported', '/details/Warranty years'], ['model_unsupported', '/items']])
    expect(out.evidence.filter(item => item.source === 'model').map(item => item.path)).toEqual(['/details/Pages', '/items/0/name', '/items/0/price'])
  })

  it('keeps a model-written document number in the form the field asks for: the number alone where the title gives the series (V37)', async () => {
    const body = '<p>This document gives coding conventions for the Python code comprising the standard library. See also PEP 20 and PEP 257.</p>'
    const pep = (heading: string) => {
      const html = `<html><head><title>${heading} | peps.python.org</title></head><body><main><h1>${heading}</h1>${body}</main></body></html>`
      return { ...page(html, 'https://peps.python.org/pep-0008/'), markdown: `# ${heading}\n\nThis document gives coding conventions for the Python code comprising the standard library. See also PEP 20 and PEP 257.` }
    }
    const run = (input: FetchResult, properties: Record<string, JsonSchema>, answer: Record<string, unknown>) =>
      extractStructured(input, json(properties, Object.keys(properties), true), {}, { baseUrl: 'https://model.example', model: 'extractor', fetch: openAiEndpoint(answer, []) })
    const doc = pep('PEP 8 – Style Guide for Python Code')
    // The title gives the series and the number; a string field that asks for the number takes it without the series.
    for (const key of ['number', 'pep_number', 'pep']) {
      for (const written of ['PEP 8', 'pep 8', 'PEP-8']) {
        const out = await run(doc, { [key]: { type: 'string' }, title: { type: 'string' } }, { [key]: written, title: 'Style Guide for Python Code' })
        expect(out.status, `${key} ${written}`).toBe('complete')
        expect(out.data, `${key} ${written}`).toEqual({ [key]: '8', title: 'Style Guide for Python Code' })
        expect(out.evidence.find(item => item.path === `/${key}`), `${key} ${written}`).toEqual({ path: `/${key}`, source: 'model', evidencePath: 'markdown line 1', text: 'PEP 8', normalized: '8' })
      }
    }
    // A number field is never read from `PEP 8` by dropping words: the schema check refuses it, and the field stays missing.
    for (const type of ['number', 'integer'] as const) {
      const out = await run(doc, { number: { type }, title: { type: 'string' } }, { number: 'PEP 8', title: 'Style Guide for Python Code' })
      expect(out.status, type).toBe('invalid')
      expect(out.data, type).toEqual({ title: 'Style Guide for Python Code' })
      expect(out.issues.map(issue => [issue.code, issue.path]), type).toEqual([['model_output_invalid', undefined], ['missing_required', '/number']])
    }
    // Kept as written: the number alone, another document's number, a field that is not the document's number, a price.
    const kept = async (input: FetchResult, properties: Record<string, JsonSchema>, answer: Record<string, unknown>, expected: Record<string, unknown>) => {
      const out = await run(input, properties, answer)
      expect(out.data, JSON.stringify(answer)).toEqual(expected)
      expect(out.evidence.filter(item => item.source === 'model').every(item => item.normalized === undefined), JSON.stringify(answer)).toBe(true)
    }
    await kept(doc, { number: { type: 'string' } }, { number: '8' }, { number: '8' })
    await kept(doc, { number: { type: 'string' } }, { number: 'PEP 20' }, { number: 'PEP 20' })
    await kept(doc, { id: { type: 'string' }, title: { type: 'string' } }, { id: 'PEP 8', title: 'x' }, { id: 'PEP 8', title: 'PEP 8 – Style Guide for Python Code' })
    await kept(doc, { rfc_number: { type: 'string' } }, { rfc_number: 'PEP 8' }, { rfc_number: 'PEP 8' })
    await kept(pep('Style Guide for Python Code'), { number: { type: 'string' } }, { number: 'PEP 8' }, { number: 'PEP 8' })
    const rfc = { ...page(`<html><head><title>RFC 9112: HTTP/1.1</title></head><body><main><h1>RFC 9112: HTTP/1.1</h1>${body}</main></body></html>`, 'https://www.rfc-editor.org/rfc/rfc9112'),
      markdown: '# RFC 9112: HTTP/1.1\n\nPrice: $12.99' }
    await kept(rfc, { id: { type: 'string' }, price: { type: 'string' } }, { id: 'RFC 9112', price: '$12.99' }, { id: 'RFC 9112', price: '$12.99' })
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
    const markdown = '# A Light in the Attic\n\nPublished by HarperCollins in a 20th anniversary edition.'
    const out = await extractStructured({ ...page(bookInformation), markdown }, { type: 'json', schema, modelFallback: true }, {}, {
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
      { path: '/price', source: 'text', evidencePath: 'p.price_color', text: '£51.77', normalized: 51.77, conversion: 'number/decimal', context: { currency: '£' } },
      { path: '/publisher/name', source: 'model', evidencePath: 'markdown line 3', text: 'HarperCollins' },
      { path: '/edition', source: 'model', evidencePath: 'markdown line 3', text: '20th anniversary' },
    ])
  })

  it('sends a schema strict mode cannot express without strict, and records why', async () => {
    const requests: Array<Record<string, any>> = []
    const schema = json({ title: { type: 'string' }, details: { type: 'object', additionalProperties: { type: 'string' } } }, ['title', 'details'], true)
    const out = await extractStructured({ ...page(bookInformation), markdown: '# A Light in the Attic\n\nPages: 112' }, schema, {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: openAiEndpoint({ title: 'Another title', details: { Pages: '112' } }, requests),
    })
    expect(requests[0]!.response_format.json_schema).toMatchObject({ strict: false, schema: schema.schema })
    expect(out).toMatchObject({ status: 'complete', data: { title: 'A Light in the Attic', details: { Pages: '112' } }, modelUsage: { strict: false } })
    expect(out.modelUsage?.strictReason).toContain('/properties/details')
  })

  it('leaves the price of an OpenAI-compatible call unknown, also when it fails', async () => {
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, {
      baseUrl: 'https://model.example', model: 'extractor', fetch: (async () => new Response('oops', { status: 500 })) as typeof fetch,
    })
    expect(out.issues.map(issue => issue.code)).toContain('model_provider_error')
    expect(out.modelUsage).toMatchObject({ attempts: 1, externalCostUsd: null })
  })

  it('sends the OpenAI-compatible endpoint the same request as before Claude support', async () => {
    const sent: Array<{ url: string; headers: unknown; body: string }> = []
    await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, {
      baseUrl: 'https://model.example/', model: 'extractor', apiKey: 'secret',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push({ url: String(input), headers: init?.headers, body: String(init?.body) })
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ material: 'aluminium' }) } }] }), { status: 200 })
      }) as typeof fetch,
    })
    expect(sent).toEqual([{
      url: 'https://model.example/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: OPENAI_REQUEST_BEFORE_CLAUDE,
    }])
  })
})

/** The body main sent for `format({ requireMaterial: true, modelFallback: true })` on `result` before Claude support. */
const OPENAI_REQUEST_BEFORE_CLAUDE = JSON.stringify({
  model: 'extractor',
  messages: [
    { role: 'system', content: 'Return only facts supported by the supplied subject content. Do not infer from recommendations or unrelated products.' },
    {
      role: 'user',
      content: JSON.stringify({
        prompt: 'Complete the missing schema fields.',
        deterministic: { asin: 'B012345678', title: 'Subject headphones', price: 1299, currency: 'INR', seller: 'SoundCo Direct' },
        subject: '# Subject headphones\n\nA lightweight product made from aluminium.',
      }),
    },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'w2l_extract',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          asin: { type: 'string' }, title: { type: 'string' }, price: { type: 'number' }, currency: { type: 'string' }, seller: { type: 'string' },
          material: { type: 'string', description: 'Product material' },
        },
        required: ['asin', 'title', 'price', 'currency', 'seller', 'material'],
        additionalProperties: false,
      },
    },
  },
})

/** A fake Anthropic Messages API: the n-th call gets the n-th reply (the last one after that); requests are kept. */
const messagesEndpoint = (replies: Array<Record<string, unknown>>, requests: Array<{ url: string; headers: Headers; body: Record<string, any> }>) => (async (input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body))
  requests.push({ url: input instanceof Request ? input.url : String(input), headers: new Headers(init?.headers), body })
  const reply = replies[Math.min(requests.length, replies.length) - 1]
  return new Response(JSON.stringify({ id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: body.model, stop_sequence: null, stop_details: null, ...reply }), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

/** A Claude reply: an omitted thinking block, then the answer as JSON text. */
const claudeAnswer = (answer: unknown, usage = { input_tokens: 1_200, output_tokens: 40 }) => ({
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: JSON.stringify(answer), citations: null }],
  stop_reason: 'end_turn',
  usage,
})

describe('model fallback through the Claude Messages API (F2, provider anthropic)', () => {
  const claude = (fetchImpl: typeof fetch, model = 'claude-haiku-5-5') => ({ provider: 'anthropic' as const, model, apiKey: 'sk-ant-test-key', fetch: fetchImpl })

  it('asks for structured output with the strict-safe schema and keeps only what the page states', async () => {
    const requests: Array<{ url: string; headers: Headers; body: Record<string, any> }> = []
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, claude(messagesEndpoint([claudeAnswer({ material: 'aluminium', seller: 'Someone else' })], requests)))
    expect(requests).toHaveLength(1)
    const [{ url, headers, body }] = requests as [typeof requests[number]]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(headers.get('x-api-key')).toBe('sk-ant-test-key')
    expect(headers.get('authorization')).toBeNull()
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'output_config', 'system'])
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 16_000 })
    expect(body.output_config.effort).toBe('low')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.output_config.format.schema).toMatchObject({ additionalProperties: false, required: ['asin', 'title', 'price', 'currency', 'seller', 'material'] })
    expect(body.output_config.format.schema.properties.material).toEqual({ type: 'string', description: 'Product material' })
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
    expect(JSON.parse(body.messages[0].content)).toMatchObject({ prompt: 'Complete the missing schema fields.', subject: result.markdown, deterministic: { asin: 'B012345678', seller: 'SoundCo Direct' } })
    // A value read from the page stays whatever the model answers; the model's own value has model evidence.
    expect(out.status).toBe('complete')
    expect(out.data).toMatchObject({ asin: 'B012345678', seller: 'SoundCo Direct', material: 'aluminium' })
    expect(out.evidence).toContainEqual({ path: '/material', source: 'model', evidencePath: 'markdown line 3', text: 'aluminium' })
    expect(out.modelUsage).toMatchObject({ model: 'claude-haiku-5-5', attempts: 1, inputTokens: 1_200, outputTokens: 40, strict: true })
    // Claude Haiku 5.5 at $0.10 / $0.50 per million tokens for a prompt up to 100,000 tokens.
    expect(out.modelUsage?.externalCostUsd).toBeCloseTo(0.00014, 10)
    expect(JSON.stringify(out)).not.toContain('sk-ant-test-key')
  })

  it('repairs an answer that breaks the caller schema once, counting both calls', async () => {
    const requests: Array<{ url: string; headers: Headers; body: Record<string, any> }> = []
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, claude(messagesEndpoint([
      claudeAnswer({ material: 42 }, { input_tokens: 1_000, output_tokens: 20 }),
      claudeAnswer({ material: 'aluminium' }, { input_tokens: 1_100, output_tokens: 30 }),
    ], requests), 'claude-sonnet-5-5'))
    expect(requests).toHaveLength(2)
    expect(JSON.parse(requests[0]!.body.messages[0].content)).not.toHaveProperty('repair')
    expect(JSON.parse(requests[1]!.body.messages[0].content).repair).toContain('/material')
    expect(out.status).toBe('complete')
    expect(out.data).toMatchObject({ material: 'aluminium' })
    expect(out.modelUsage).toMatchObject({ model: 'claude-sonnet-5-5', attempts: 2, inputTokens: 2_100, outputTokens: 50 })
    // Claude Sonnet 5.5 at $2 / $10 per million tokens.
    expect(out.modelUsage?.externalCostUsd).toBeCloseTo((2_100 * 2 + 50 * 10) / 1e6, 10)
  })

  it('reports a refusal as a provider error without a repair round, keeping the page values and the billed tokens', async () => {
    const requests: Array<{ url: string; headers: Headers; body: Record<string, any> }> = []
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, claude(messagesEndpoint([{
      content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null }, usage: { input_tokens: 900, output_tokens: 0 },
    }], requests)))
    expect(requests).toHaveLength(1)
    expect(out.status).toBe('incomplete')
    expect(out.data).toMatchObject({ asin: 'B012345678', seller: 'SoundCo Direct' })
    expect(out.data).not.toHaveProperty('material')
    const provider = out.issues.find(issue => issue.code === 'model_provider_error')
    expect(provider?.message).toContain('refusal')
    expect(provider?.message).toContain('cyber')
    expect(out.issues).toContainEqual({ code: 'missing_required', path: '/material', message: 'required field unavailable: /material' })
    expect(out.modelUsage).toMatchObject({ attempts: 1, inputTokens: 900, outputTokens: 0 })
    expect(out.modelUsage?.externalCostUsd).toBeCloseTo(0.00009, 10)
  })

  it('reports an answer cut off at max_tokens as a provider error', async () => {
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, claude(messagesEndpoint([{
      content: [{ type: 'text', text: '{"material": "alum', citations: null }], stop_reason: 'max_tokens', usage: { input_tokens: 900, output_tokens: 16_000 },
    }], [])))
    expect(out.status).toBe('incomplete')
    expect(out.issues.find(issue => issue.code === 'model_provider_error')?.message).toContain('max_tokens')
    expect(out.modelUsage).toMatchObject({ attempts: 1, inputTokens: 900, outputTokens: 16_000 })
  })

  it('asks for JSON in the prompt when strict structured output cannot express the schema, and records why', async () => {
    const requests: Array<{ url: string; headers: Headers; body: Record<string, any> }> = []
    const schema = json({ title: { type: 'string' }, details: { type: 'object', additionalProperties: { type: 'string' } } }, ['title', 'details'], true)
    const reply = { content: [{ type: 'text', text: '```json\n{"title": "Another title", "details": {"Pages": "112"}}\n```', citations: null }], stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 30 } }
    const out = await extractStructured({ ...page(bookInformation), markdown: '# A Light in the Attic\n\nPages: 112' }, schema, {}, claude(messagesEndpoint([reply], requests)))
    expect(requests[0]!.body.output_config).toEqual({ effort: 'low' })
    expect(JSON.parse(requests[0]!.body.messages[0].content).schema).toEqual(schema.schema)
    expect(requests[0]!.body.system).toContain('JSON')
    expect(out).toMatchObject({ status: 'complete', data: { title: 'A Light in the Attic', details: { Pages: '112' } }, modelUsage: { strict: false } })
    expect(out.modelUsage?.strictReason).toContain('/properties/details')
  })

  it('leaves the price unknown for a model without a published price in the table', async () => {
    const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, claude(messagesEndpoint([claudeAnswer({ material: 'aluminium' })], []), 'claude-opus-5-5'))
    expect(out.modelUsage).toMatchObject({ model: 'claude-opus-5-5', inputTokens: 1_200, outputTokens: 40, externalCostUsd: null })
  })

  describe('configuration from the environment', () => {
    afterEach(() => { vi.unstubAllEnvs() })
    const env = (values: Record<string, string>) => {
      for (const name of ['W2L_EXTRACT_PROVIDER', 'W2L_EXTRACT_BASE_URL', 'W2L_EXTRACT_MODEL', 'W2L_EXTRACT_API_KEY', 'W2L_EXTRACT_EFFORT', 'ANTHROPIC_API_KEY']) vi.stubEnv(name, values[name] ?? '')
    }

    it('reports model_unavailable when no key is set, and never sends the page', async () => {
      env({ W2L_EXTRACT_PROVIDER: 'anthropic', W2L_EXTRACT_MODEL: 'claude-haiku-5-5' })
      expect(structuredModelConfigFromEnv()).toBeNull()
      const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, structuredModelConfigFromEnv())
      expect(out.status).toBe('incomplete')
      expect(out.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['model_unavailable', 'missing_required']))
      expect(out.modelUsage).toBeNull()
    })

    it('takes W2L_EXTRACT_API_KEY, else ANTHROPIC_API_KEY, and an optional base URL and effort', () => {
      env({ W2L_EXTRACT_PROVIDER: 'anthropic', W2L_EXTRACT_MODEL: 'claude-sonnet-5-5', ANTHROPIC_API_KEY: 'from-anthropic' })
      expect(structuredModelConfigFromEnv()).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'from-anthropic' })
      env({ W2L_EXTRACT_PROVIDER: 'anthropic', W2L_EXTRACT_MODEL: 'claude-sonnet-5-5', ANTHROPIC_API_KEY: 'from-anthropic', W2L_EXTRACT_API_KEY: 'from-w2l', W2L_EXTRACT_BASE_URL: 'http://127.0.0.1:9', W2L_EXTRACT_EFFORT: 'medium' })
      expect(structuredModelConfigFromEnv()).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'from-w2l', baseUrl: 'http://127.0.0.1:9', effort: 'medium' })
      // An effort or provider the code does not know is not a configuration.
      env({ W2L_EXTRACT_PROVIDER: 'anthropic', W2L_EXTRACT_MODEL: 'claude-sonnet-5-5', ANTHROPIC_API_KEY: 'k', W2L_EXTRACT_EFFORT: 'extreme' })
      expect(structuredModelConfigFromEnv()).toBeNull()
      env({ W2L_EXTRACT_PROVIDER: 'gemini', W2L_EXTRACT_BASE_URL: 'https://model.example', W2L_EXTRACT_MODEL: 'm' })
      expect(structuredModelConfigFromEnv()).toBeNull()
    })

    it('keeps the OpenAI-compatible endpoint the default, and does not read ANTHROPIC_API_KEY for it', () => {
      env({ W2L_EXTRACT_BASE_URL: 'https://model.example', W2L_EXTRACT_MODEL: 'extractor', ANTHROPIC_API_KEY: 'from-anthropic' })
      expect(structuredModelConfigFromEnv()).toEqual({ baseUrl: 'https://model.example', model: 'extractor' })
      env({ W2L_EXTRACT_PROVIDER: 'openai', W2L_EXTRACT_BASE_URL: 'https://model.example', W2L_EXTRACT_MODEL: 'extractor', W2L_EXTRACT_API_KEY: 'secret' })
      expect(structuredModelConfigFromEnv()).toEqual({ baseUrl: 'https://model.example', model: 'extractor', apiKey: 'secret' })
    })

    it('calls the Messages API at the configured base URL with the key from the environment', async () => {
      const seen: Array<{ path: string | undefined; key: string | string[] | undefined; body: Record<string, any> }> = []
      const server = createServer((req, res) => {
        let raw = ''
        req.on('data', chunk => { raw += chunk })
        req.on('end', () => {
          const body = JSON.parse(raw)
          seen.push({ path: req.url, key: req.headers['x-api-key'], body })
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_sequence: null, stop_details: null, ...claudeAnswer({ material: 'aluminium' }) }))
        })
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      try {
        env({ W2L_EXTRACT_PROVIDER: 'anthropic', W2L_EXTRACT_MODEL: 'claude-haiku-5-5', ANTHROPIC_API_KEY: 'sk-ant-env-key', W2L_EXTRACT_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })
        const out = await extractStructured(result, format({ requireMaterial: true, modelFallback: true }), {}, structuredModelConfigFromEnv())
        expect(seen).toHaveLength(1)
        expect(seen[0]).toMatchObject({ path: '/v1/messages', key: 'sk-ant-env-key', body: { model: 'claude-haiku-5-5' } })
        expect(out).toMatchObject({ status: 'complete', data: { material: 'aluminium' } })
        expect(JSON.stringify(out)).not.toContain('sk-ant-env-key')
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
    })
  })
})

describe('field contract: raw text, normalized value, unit, rule and context (PA D3b)', () => {
  const recordSchema = JSON.parse(readFileSync(new URL('../../contracts/schemas/evidence-record.v1.json', import.meta.url), 'utf8')) as object
  const AjvClass = Ajv2020 as unknown as new (options: object) => { compile(schema: object): ((data: unknown) => boolean) & { errors?: unknown } }
  const validRecord = new AjvClass({ allErrors: true, allowUnionTypes: true }).compile(recordSchema)
  const recordOf = (out: Awaited<ReturnType<typeof extractStructured>>) => {
    const read = page(rows('en', []))
    return toEvidenceRecord({ ...read, evidence: { ...read.evidence, rawBodySha256: 'a'.repeat(64) } }, { mode: 'standard' }, { markdown: null, json: out })
  }
  const rows = (lang: string, cells: ReadonlyArray<[string, string]>) => `<html lang="${lang}"><head><title>Report</title></head><body><main><h1>Report</h1>
<p>${'A report on the harbour office figures, published every morning with the tide, wind and visibility readings for each hour. '.repeat(2)}</p>
<table>${cells.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join('')}</table></main></body></html>`

  it('keeps a signed percentage\'s sign, number and unit, in the result and its Evidence Record', async () => {
    const out = await extractStructured(page(rows('en', [['Change', '-3.2%'], ['Spread', '+0.5 pp'], ['Yield', '−1,25 %']]), 'https://stats.example/report'),
      json({ change: { type: 'number' }, spread: { type: 'number' }, yield: { type: 'number' } }, ['change', 'spread', 'yield']), {}, null)
    expect(out).toMatchObject({ status: 'complete', data: { change: -3.2, spread: 0.5, yield: -1.25 } })
    expect(out.evidence).toEqual([
      { path: '/change', source: 'dom', evidencePath: 'table[0] tr[0] "Change"', text: '-3.2%', normalized: -3.2, conversion: 'number/decimal', context: { unit: '%' } },
      { path: '/spread', source: 'dom', evidencePath: 'table[0] tr[1] "Spread"', text: '+0.5 pp', normalized: 0.5, conversion: 'number/decimal', context: { unit: 'pp' } },
      { path: '/yield', source: 'dom', evidencePath: 'table[0] tr[2] "Yield"', text: '−1,25 %', normalized: -1.25, conversion: 'number/decimal', context: { unit: '%' } },
    ])
    const record = recordOf(out)
    expect(validRecord(record), JSON.stringify(validRecord.errors)).toBe(true)
    expect(record.fieldEvidence?.['/change']).toEqual({ source: 'dom', locator: 'table[0] tr[0] "Change"', reading: { raw: '-3.2%', normalized: -3.2, unit: '%', conversion: 'number/decimal', absent: false } })
    expect(record.fieldEvidence?.['/spread']?.reading).toEqual({ raw: '+0.5 pp', normalized: 0.5, unit: 'pp', conversion: 'number/decimal', absent: false })
  })

  it('reads a lone separator before three digits by the page\'s language, keeping the text, but not in a currency amount', async () => {
    const schema = json({ population: { type: 'number' }, ratio: { type: 'number' } }, ['population', 'ratio'])
    const de = await extractStructured(page(rows('de-DE', [['Population', '1.299'], ['Ratio', '0,125']]), 'https://stats.example/de'), schema, {}, null)
    expect(de.data).toEqual({ population: 1299, ratio: 0.125 })
    expect(de.evidence[0]).toEqual({ path: '/population', source: 'dom', evidencePath: 'table[0] tr[0] "Population"', text: '1.299', normalized: 1299, conversion: 'number/language:de-DE' })
    const en = await extractStructured(page(rows('en', [['Population', '1,299'], ['Ratio', '1.299']]), 'https://stats.example/en'), schema, {}, null)
    expect(en.data).toEqual({ population: 1299, ratio: 1.299 })
    expect(en.evidence.map(item => [item.text, item.conversion])).toEqual([['1,299', 'number/language:en'], ['1.299', 'number/language:en']])
    // A page without a language settles nothing.
    const none = await extractStructured(page(rows('', [['Population', '1.299']]), 'https://stats.example/none'), json({ population: { type: ['number', 'null'] } }, []), {}, null)
    expect(none.data).toEqual({ population: null })
    // A price keeps its rule: the page's language does not settle "1.299 €" (an English page of a German shop writes it too).
    const price = await extractStructured(page(shop('1.299 €'), 'https://shop.example/lampe'), json({ price: { type: ['number', 'null'] } }, []), {}, null)
    expect(price.data).toEqual({ price: null })
    // Nor a label that names money without a mark, or any label on a product page.
    const priced = await extractStructured(page(rows('en', [['Price', '1.299'], ['Total cost', '1,299']]), 'https://shop.example/lamp'), json({ price: { type: ['number', 'null'] }, totalCost: { type: ['number', 'null'] } }, []), {}, null)
    expect(priced.data).toEqual({ price: null, totalCost: null })
    const productPage = rows('en', [['Weight', '1.250']]).replace('</head>', `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Lamp', offers: { price: '19.00', priceCurrency: 'GBP' } })}</script></head>`)
    expect((await extractStructured(page(productPage, 'https://shop.example/lamp'), json({ weight: { type: ['number', 'null'] } }, []), {}, null)).data).toEqual({ weight: null })
  })

  it('tells a value the page states there is none of from one no source states', async () => {
    const out = await extractStructured(page(rows('en', [['Price', 'N/A'], ['Colour', 'Brass']]), 'https://shop.example/lamp'),
      json({ price: { type: ['number', 'null'] }, colour: { type: 'string' }, weight: { type: ['number', 'null'] } }, ['price', 'colour', 'weight']), {}, null)
    expect(out).toMatchObject({ status: 'complete', data: { price: null, colour: 'Brass', weight: null } })
    // Absent: the page says so, and where.
    expect(out.evidence).toContainEqual({ path: '/price', source: 'dom', evidencePath: 'table[0] tr[0] "Price"', text: 'N/A', absent: true })
    expect(out.issues).toContainEqual({ code: 'field_absent', path: '/price', message: 'the page states there is no value for /price: "N/A" (dom, table[0] tr[0] "Price")' })
    // Unobserved: no source on the page, so no evidence and the usual issue.
    expect(out.evidence.some(item => item.path === '/weight')).toBe(false)
    expect(out.issues).toContainEqual({ code: 'field_unavailable', path: '/weight', message: 'no verified source for this nullable field on the selected page' })
    expect(out.issues.some(issue => issue.path === '/price' && issue.code === 'field_unavailable')).toBe(false)
    const record = recordOf(out)
    expect(validRecord(record), JSON.stringify(validRecord.errors)).toBe(true)
    expect(record.fieldEvidence?.['/price']).toEqual({ source: 'dom', locator: 'table[0] tr[0] "Price"', reading: { raw: 'N/A', normalized: null, unit: null, conversion: null, absent: true } })
    expect(record.fieldEvidence?.['/colour']).toEqual({ source: 'dom', locator: 'table[0] tr[1] "Colour"', reading: null })
    // A field that cannot be null is left out, and still says the page states none.
    const strict = await extractStructured(page(rows('en', [['Price', 'n/a']]), 'https://shop.example/lamp'), json({ price: { type: 'number' } }, ['price']), {}, null)
    expect(strict.data).toEqual({})
    expect(strict.issues.map(issue => issue.code)).toEqual(['field_absent', 'missing_required'])
  })

  it('reports an Amazon quote the page shows as unavailable as absent, located at its availability', async () => {
    const unavailable: FetchResult = { ...result, document: { ...result.document!, product: { ...product, price: null, prices: [], quoteState: 'absent_observed' as ProductFacts['quoteState'], availability: { value: 'Currently unavailable.', source: 'dom', path: '#availability' } } } }
    const out = await extractStructured(unavailable, json({ asin: { type: 'string' }, price: { type: ['number', 'null'] } }, ['asin', 'price']), {}, null)
    expect(out.data).toEqual({ asin: 'B012345678', price: null })
    expect(out.evidence).toContainEqual({ path: '/price', source: 'dom', evidencePath: '#availability', text: 'Currently unavailable.', absent: true })
    expect(out.issues.map(issue => issue.code)).toContain('field_absent')
  })

  it('carries a declared price\'s currency and offer, and a declared article value\'s dates, as its context', async () => {
    const lampOut = await extractStructured(page(lamp, 'https://shop.example/lamp'), json({ price: { type: 'number' } }, ['price']), {}, null)
    expect(lampOut.evidence).toEqual([{ path: '/price', source: 'jsonld', evidencePath: '/script/0/offers/price', text: '19.00', normalized: 19, conversion: 'number/decimal', context: { currency: 'GBP', offerType: 'Offer' } }])
    const article = `<html lang="en"><head><title>Tide report</title><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline: 'Spring tides return', datePublished: '2026-10-01', dateModified: '2026-10-03', version: '2' })}</script></head>
<body><main><article><h1>Spring tides return</h1><p>${'The harbour office records tide height, wind and visibility for every hour of the day. '.repeat(4)}</p></article></main></body></html>`
    const articleOut = await extractStructured(page(article, 'https://news.example/tides'), json({ datePublished: { type: 'string' } }, ['datePublished']), {}, null)
    expect(articleOut.evidence).toContainEqual({ path: '/datePublished', source: 'jsonld', evidencePath: 'ld+json[0] NewsArticle.datePublished', context: { published: '2026-10-01', revised: '2026-10-03', version: '2' } })
  })
})
