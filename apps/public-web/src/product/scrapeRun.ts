/** The scrapes the /scrape/ page shows, as hosted Octocrawl recorded them. Nothing here is made up or taken from another
 * run; research/hosted/2026-10-17-scrape-page-demos-e1e128d4.md holds the commands, times and hashes.
 *
 * Recorded 2026-10-17 on api.octocrawl.dev (revision octocrawl-api-fields-e1e128d, source commit e1e128d4), keyless
 * REST except the JavaScript page, which went through a signed-in MCP connection (the browser lane needs an account).
 * Every page fetch left the hosted server directly (no proxy). Long values are cut on the page where marked; the record
 * has them whole. */

export type Demo = {
  id: 'amazon' | 'wikipedia' | 'docs'
  tab: string
  title: string
  url: string
  fetchedAt: string
  httpStatus: number
  lane: 'http'
  bytes: number
  rawSha256: string
  /** What the demo shows: fields, Markdown or a table. */
  shows: 'fields' | 'markdown' | 'table'
}

/** Amazon.sg, read with the request the hosted MCP tool scrape_product sends (research/amazon-product-schema.v1.json). */
export const AMAZON = {
  id: 'amazon', tab: 'amazon.sg', title: 'The Pragmatic Programmer', shows: 'fields',
  url: 'https://www.amazon.sg/dp/0135957052', fetchedAt: '2026-10-17T09:28:52.626Z', httpStatus: 200, lane: 'http',
  bytes: 1_370_155, rawSha256: '06a6973ce8b0d53e30dc6640e068a0a3c0d77e7d375db8d91ae0b303d1367d5b',
} as const satisfies Demo

/** Seven of the fields it returned, each with where on the page it was read; brand is the one the page doesn't state. */
export const AMAZON_FIELDS: ReadonlyArray<{ name: string; json: string; locator: string | null; issue?: string }> = [
  { name: 'title', json: '"Pragmatic Programmer, The: your journey to mastery, 20th Anniversary Edition"', locator: '#productTitle' },
  { name: 'price', json: '64.55', locator: '#buybox .a-price .a-offscreen' },
  { name: 'currency', json: '"SGD"', locator: '#buybox .a-price .a-offscreen' },
  { name: 'availability', json: '"In stock"', locator: '#availability span' },
  { name: 'rating', json: '4.8', locator: '#acrPopover' },
  { name: 'reviewCount', json: '2578', locator: '#acrCustomerReviewText' },
  { name: 'brand', json: 'null', locator: null, issue: 'field_unavailable' },
]

/** The Octopus article on English Wikipedia (text CC BY-SA 4.0): Markdown, links, tables and four infobox fields. */
export const WIKIPEDIA = {
  id: 'wikipedia', tab: 'en.wikipedia.org', title: 'Octopus', shows: 'markdown',
  url: 'https://en.wikipedia.org/wiki/Octopus', fetchedAt: '2026-10-17T09:28:44.066Z', httpStatus: 200, lane: 'http',
  bytes: 922_203, rawSha256: '0962dd1b780cabdb7e8fc16f55dd713dbd16e685d8978d512c1c7f6e1e439cf6',
} as const satisfies Demo
export const WIKIPEDIA_TOKENS = 39_370
export const WIKIPEDIA_LINKS = 1_277
/** Lines of the Markdown as returned, by their line number: line 1, then lines 2–29 cut (named in the gap), then the
 * first two sentences of line 30, the lead paragraph; the rest of the article is cut. */
export type MarkdownLine = { n: number; text: string } | { gap: readonly [number, number]; what: string }
export const WIKIPEDIA_MARKDOWN: readonly MarkdownLine[] = [
  { n: 1, text: '# Octopus' },
  { gap: [2, 29], what: 'two badges, the tagline, a disambiguation note and the infobox as a table' },
  { n: 30, text: 'An **octopus** (pl.: **octopuses** or **octopodes**[[a]](#cite_note-3)) is a soft-bodied, eight-limbed [mollusc](https://en.wikipedia.org/wiki/Mollusc) of the [order](https://en.wikipedia.org/wiki/Order_(biology)) **Octopoda** ([/ɒkˈtɒpədə/](https://en.wikipedia.org/wiki/Help:IPA/English), [*ok-TOP-ə-də*](https://en.wikipedia.org/wiki/Help:Pronunciation_respelling_key)[[3]](#cite_note-4)). The order consists of some 300 [species](https://en.wikipedia.org/wiki/Species) and is grouped within the class [Cephalopoda](https://en.wikipedia.org/wiki/Cephalopod) with [squids](https://en.wikipedia.org/wiki/Squid), [cuttlefish](https://en.wikipedia.org/wiki/Cuttlefish), and [nautiloids](https://en.wikipedia.org/wiki/Nautiloid). …' },
]
/** The request that read it, which the code section shows. */
export const WIKIPEDIA_REQUEST = {
  url: WIKIPEDIA.url,
  formats: ['markdown', 'links', 'tables', { type: 'json', schema: { type: 'object', properties: { kingdom: { type: ['string', 'null'] }, phylum: { type: ['string', 'null'] }, class: { type: ['string', 'null'] }, order: { type: ['string', 'null'] } } } }],
} as const
export const WIKIPEDIA_FIELDS: ReadonlyArray<readonly [name: string, value: string, locator: string]> = [
  ['kingdom', 'Animalia', 'table[0] tr[4] "Kingdom:"'],
  ['phylum', 'Mollusca', 'table[0] tr[5] "Phylum:"'],
  ['class', 'Cephalopoda', 'table[0] tr[6] "Class:"'],
  ['order', 'Octopoda Leach, 1818[1]', 'table[0] tr[10] "Order:"'],
]

/** The Python docs' datetime page: six tables; the format-code table is shown. Its bytes were fetched again the same
 * day and hashed to the same value, so public/samples/python-docs-datetime.html.txt is the page that was read. */
export const DOCS = {
  id: 'docs', tab: 'docs.python.org', title: 'datetime', shows: 'table',
  url: 'https://docs.python.org/3/library/datetime.html', fetchedAt: '2026-10-17T09:28:48.842Z', httpStatus: 200, lane: 'http',
  bytes: 429_471, rawSha256: 'bad4d2ecc5603a45bb46a8a4dcaa8354ec22af3010939f41be6e97379da614c2',
} as const satisfies Demo
export const DOCS_TABLES = 6
/** tableIndex 4: 4 columns, 38 rows with the header. The first five are shown. */
export const DOCS_TABLE_ROWS = 38
export const DOCS_TABLE: ReadonlyArray<readonly string[]> = [
  ['Directive', 'Meaning', 'Example', 'Notes'],
  ['%a', 'Weekday as locale’s abbreviated name.', 'Sun, Mon, …, Sat (en_US); So, Mo, …, Sa (de_DE)', '(1)'],
  ['%A', 'Weekday as locale’s full name.', 'Sunday, Monday, …, Saturday (en_US); Sonntag, Montag, …, Samstag (de_DE)', '(1)'],
  ['%b', 'Month as locale’s abbreviated name.', 'Jan, Feb, …, Dec (en_US); Jan, Feb, …, Dez (de_DE)', '(1)'],
  ['%B', 'Month as locale’s full name.', 'January, February, …, December (en_US); Januar, Februar, …, Dezember (de_DE)', '(1)'],
]
export const DOCS_CSV_SHA256 = '718101f42742c93714824664fa79c42786731b215ce388d005615d5d0f725b4f'
/** The copy of the page's bytes the Evidence Record section hashes, and the cell in it the reader may change: found by
 * before, value and after together, which occur once (the first row of the format-code table). */
export const DOCS_SAMPLE = '/samples/python-docs-datetime.html.txt'
export const DOCS_CELL = { before: '<tr class="row-even"><td><p><code class="docutils literal notranslate"><span class="pre">', value: '%a', after: '</span>' } as const

export const DEMOS: readonly Demo[] = [AMAZON, WIKIPEDIA, DOCS]

/** Harder pages, the same day on the same server. */
export type Hard = { id: string; tab: string; url: string; status: string; facts: ReadonlyArray<readonly [string, string]>; lines: readonly string[] }
export const HARD: readonly Hard[] = [
  {
    id: 'js', tab: 'Drawn by JavaScript', url: 'https://quotes.toscrape.com/js/', status: 'success',
    facts: [['tried', 'HTTP, then a browser'], ['status', 'success · HTTP 200'], ['returned', '10 quotes · 387 tokens'], ['hosted cost', '5 credits, with a key']],
    lines: ['# [Quotes to Scrape](https://quotes.toscrape.com/)', '', '“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”', '', 'by Albert Einstein', '', '“It is our choices, Harry, that show what we truly are, far more than our abilities.”', '', 'by J.K. Rowling', '', '…'],
  },
  {
    id: 'blocked', tab: 'Blocked', url: 'https://www.walmart.com/ip/5689919121', status: 'blocked',
    facts: [['answered with', 'a CAPTCHA page (walmart.com/blocked)'], ['status', 'blocked · captcha'], ['robots.txt', 'allowed'], ['cost', '0 credits']],
    lines: [],
  },
  {
    id: 'refused', tab: 'Not allowed', url: 'https://www.google.com/search?q=octocrawl', status: 'failed',
    facts: [['robots.txt', 'disallows /search'], ['status', 'failed · policy_denied'], ['requests sent', '0'], ['cost', '0 credits']],
    lines: [],
  },
]
