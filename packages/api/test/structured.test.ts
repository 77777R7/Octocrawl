import { describe, expect, it } from 'vitest'
import type { CompactScrapeResponse, FetchResult, JsonFormatRequest, JsonSchema, ProductFacts, ScrapeResponse } from '@w2l/contracts'
import { extractTf } from '@w2l/extract-tf'
import { contractSha256 } from '@w2l/runtime'
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
    document: { title: out.title, pageType: out.pageType, strategy: out.strategy, confidence: out.confidence, product: out.product ?? null, adapter: out.adapter, entities: out.entities, adapterValidation: out.adapterValidation, labelledValues: out.labelledValues, declaredValues: out.declaredValues },
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
      { path: '/headline', source: 'jsonld', evidencePath: 'ld+json[0] NewsArticle.name' },
      { path: '/datePublished', source: 'jsonld', evidencePath: 'ld+json[0] NewsArticle.datePublished' },
      { path: '/dateModified', source: 'jsonld', evidencePath: 'ld+json[0] NewsArticle.dateModified' },
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
