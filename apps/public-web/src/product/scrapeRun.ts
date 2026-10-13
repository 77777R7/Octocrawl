/** The one scrape the /scrape/ page shows, as Octocrawl recorded it. Nothing here is made up or taken from another run.
 *
 * Recorded 2026-10-13 03:35 UTC at source commit 3d6b661c with the local API (`npm run api`, port 8787), through the
 * shell's proxy (127.0.0.1:7890, so the Evidence Record names it):
 *
 *   curl -X POST http://127.0.0.1:8787/v1/scrape -H 'content-type: application/json' -d '{"url":
 *   "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html","formats":["markdown","links","tables",
 *   {"type":"json","schema":{"type":"object","properties":{"title":{"type":"string"},"price":{"type":"string"},
 *   "availability":{"type":"string"},"upc":{"type":"string"},"number_of_reviews":{"type":"integer"}}}}]}'
 *
 * Books to Scrape is a sandbox made for practising scraping. The page's bytes, fetched again the same day, hash to the
 * record's rawSha256. The book's description is shown cut short (the record's Markdown has all of it, and
 * outputSha256.markdown is the hash of that whole Markdown). Timings are left out: this run went through a proxy, and
 * one run says nothing about speed. */

export const RUN = {
  url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
  host: 'books.toscrape.com',
  path: '/catalogue/a-light-in-the-attic_1000/index.html',
  fetchedAt: '2026-10-13T03:35:16.151Z',
  status: 'success',
  httpStatus: 200,
  contentType: 'text/html',
  bytes: 9279,
  lane: 'http',
  pageType: 'product',
  robots: { decision: 'no_robots', url: 'https://books.toscrape.com/robots.txt' },
  rawSha256: 'a6e572bec156bf80ff3149b89b6d218cdcf8866ccc26ccf69a5431db8e142c6a',
  outputSha256: {
    markdown: '29118f2b83f70525c23816276547fa6d82d32345b02acd00f26e4b85bd534d8e',
    json: '9e13be8011c75c31d1bfbaffebdb177003eca2705888b3ebd8a3ed1d4b688b3f',
  },
  extractor: 'extract-tf/26',
  schemaVersion: 'w2l.evidence/1',
  contentTokens: 397,
  credits: 1,
} as const

/** The page as it was served, block by block, for the page the demo draws. `kept` says whether the main content keeps
 * it: the site header, the rating stars and the empty footer are left out. Each block's id ties it to what came of it. */
export type SourceBlock = { id: string; kind: 'header' | 'crumbs' | 'cover' | 'title' | 'price' | 'stock' | 'stars' | 'note' | 'heading' | 'text' | 'table' | 'footer'; kept: boolean }
export const SOURCE: readonly SourceBlock[] = [
  { id: 'header', kind: 'header', kept: false },
  { id: 'crumbs', kind: 'crumbs', kept: true },
  { id: 'cover', kind: 'cover', kept: true },
  { id: 'title', kind: 'title', kept: true },
  { id: 'price', kind: 'price', kept: true },
  { id: 'stock', kind: 'stock', kept: true },
  { id: 'stars', kind: 'stars', kept: false },
  { id: 'note', kind: 'note', kept: true },
  { id: 'desc-h', kind: 'heading', kept: true },
  { id: 'desc', kind: 'text', kept: true },
  { id: 'info-h', kind: 'heading', kept: true },
  { id: 'table', kind: 'table', kept: true },
  { id: 'footer', kind: 'footer', kept: false },
]

/** The page's words, as served. */
export const PAGE = {
  site: 'Books to Scrape',
  tagline: 'We love being scraped!',
  crumbs: ['Home', 'Books', 'Poetry'],
  crumb: 'A Light in the Attic',
  title: 'A Light in the Attic',
  price: '£51.77',
  stock: 'In stock (22 available)',
  note: ['Warning!', 'This is a demo website for web scraping purposes. Prices and ratings here were randomly assigned and have no real meaning.'],
  description: 'It’s hard to imagine a world without A Light in the Attic. This now-classic collection of poetry and drawings from Shel Silverstein celebrates its 20th anniversary with this special edition.',
} as const

/** The table, as the record's `tables[0].rows` (no header row). */
export const TABLE: ReadonlyArray<readonly [string, string]> = [
  ['UPC', 'a897fe39b1053632'],
  ['Product Type', 'Books'],
  ['Price (excl. tax)', '£51.77'],
  ['Price (incl. tax)', '£51.77'],
  ['Tax', '£0.00'],
  ['Availability', 'In stock (22 available)'],
  ['Number of reviews', '0'],
]

/** The Markdown, line by line, each with the block it came from (`src`, or none for a blank line). The description is
 * cut short here; `cut` marks it. */
export type MarkdownLine = { text: string; src?: string; cut?: boolean }
export const MARKDOWN: readonly MarkdownLine[] = [
  { text: '![A Light in the Attic](https://books.toscrape.com/media/cache/fe/72/fe72f0532301ec28892ae79a629a293c.jpg)', src: 'cover' },
  { text: '' },
  { text: '# A Light in the Attic', src: 'title' },
  { text: '' },
  { text: '£51.77', src: 'price' },
  { text: '' },
  { text: 'In stock (22 available)', src: 'stock' },
  { text: '' },
  { text: '---' },
  { text: '' },
  { text: '**Warning!** This is a demo website for web scraping purposes. Prices and ratings here were randomly assigned and have no real meaning.', src: 'note' },
  { text: '' },
  { text: '## Product Description', src: 'desc-h' },
  { text: '' },
  { text: 'It’s hard to imagine a world without A Light in the Attic. This now-classic collection of poetry and drawings from Shel Silverstein celebrates its 20th anniversary with this special edition. …', src: 'desc', cut: true },
  { text: '' },
  { text: '## Product Information', src: 'info-h' },
  { text: '' },
  ...TABLE.flatMap(([label, value], i): MarkdownLine[] => [
    { text: `| ${label} | ${value} |`, src: `row-${i}` },
    ...(i === 0 ? [{ text: '| --- | --- |', src: 'table' }] : []),
  ]),
]

/** The page's links, each once: the site header's (the same as Home) and the breadcrumb's. */
export const LINKS: ReadonlyArray<{ href: string; src: string }> = [
  { href: 'https://books.toscrape.com/index.html', src: 'crumb-0' },
  { href: 'https://books.toscrape.com/catalogue/category/books_1/index.html', src: 'crumb-1' },
  { href: 'https://books.toscrape.com/catalogue/category/books/poetry_23/index.html', src: 'crumb-2' },
]

/** The fields asked for, as read, each with how and where on the page it was read (`source` and `locator`, the record's
 * fieldEvidence) and the block that is. */
export type Field = { name: string; value: string; json: string; source: string; locator: string; src: string }
export const FIELDS: readonly Field[] = [
  { name: 'title', source: 'dom', value: 'A Light in the Attic', json: '"A Light in the Attic"', locator: 'h1[0]', src: 'title' },
  { name: 'price', source: 'text', value: '51.77', json: '"51.77"', locator: 'p.price_color', src: 'price' },
  { name: 'availability', source: 'dom', value: 'In stock (22 available)', json: '"In stock (22 available)"', locator: 'table[0] tr[5] "Availability"', src: 'row-5' },
  { name: 'upc', source: 'dom', value: 'a897fe39b1053632', json: '"a897fe39b1053632"', locator: 'table[0] tr[0] "UPC"', src: 'row-0' },
  { name: 'number_of_reviews', source: 'dom', value: '0', json: '0', locator: 'table[0] tr[6] "Number of reviews"', src: 'row-6' },
]

/** The same page with `onlyMainContent: false`, recorded the same way at 2026-10-13 03:5x UTC: the whole page adds the
 * site's header and the breadcrumb as a list before what the main content keeps (the rest is the same Markdown). Its
 * links are the same three (the header's link is the breadcrumb's Home). */
export const WHOLE_EXTRA: readonly string[] = [
  '[Books to Scrape](https://books.toscrape.com/index.html) We love being scraped!',
  '',
  '- [Home](https://books.toscrape.com/index.html)',
  '- [Books](https://books.toscrape.com/catalogue/category/books_1/index.html)',
  '- [Poetry](https://books.toscrape.com/catalogue/category/books/poetry_23/index.html)',
  '- A Light in the Attic',
  '',
]
export const WHOLE_TOKENS = 475

/** Fields the page does not state, asked for as nullable and required (schema title, price, author, isbn), recorded the
 * same way: they come back null with the record's issue, never filled in. */
export const MISSING: ReadonlyArray<{ name: string; value: string | null; locator?: string; issue?: string }> = [
  { name: 'title', value: '"A Light in the Attic"', locator: 'h1[0]' },
  { name: 'price', value: '"51.77"', locator: 'p.price_color' },
  { name: 'author', value: null, issue: 'field_unavailable: no verified source for this nullable field on the selected page' },
  { name: 'isbn', value: null, issue: 'field_unavailable: no verified source for this nullable field on the selected page' },
]

/** Three harder pages, each recorded on 2026-10-13:
 * - `js`: https://quotes.toscrape.com/js/ on the local API (proxied, 03:58:14 UTC): the HTTP attempt found only an empty
 *   shell (`empty_unverified`), the browser read it (`lane: browser_local`, status success, pageType listing).
 * - `pdf`: https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf on the local API (03:58:17 UTC):
 *   application/pdf, read through the browser lane, Markdown with its page marker.
 * - `blocked`: https://www.google.com/search?q=octocrawl on hosted Octocrawl (api.octocrawl.dev, keyless, 03:58:42 UTC):
 *   google.com's robots.txt disallows /search, so the page was never requested: status failed, reason policy_denied,
 *   httpStatus null, no credit. */
export type Hard = { id: string; tab: string; url: string; status: string; lane: string; lines: readonly string[]; facts: ReadonlyArray<readonly [string, string]> }
export const HARD: readonly Hard[] = [
  {
    id: 'js', tab: 'Drawn by JavaScript', url: 'https://quotes.toscrape.com/js/', status: 'success', lane: 'browser',
    lines: ['# [Quotes to Scrape](https://quotes.toscrape.com/)', '', '[Login](https://quotes.toscrape.com/login)', '', '“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”', '', 'by Albert Einstein', '', 'Tags: change deep-thoughts thinking world', '', '“It is our choices, Harry, that show what we truly are, far more than our abilities.”', '', 'by J.K. Rowling'],
    facts: [['HTTP read', 'empty shell (empty_unverified)'], ['then', 'read in a browser'], ['status', 'success · HTTP 200'], ['hosted cost', '5 credits']],
  },
  {
    id: 'pdf', tab: 'A PDF', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', status: 'success', lane: 'browser',
    lines: ['<!-- page 1 -->', '', 'Dummy PDF file'],
    facts: [['content type', 'application/pdf'], ['read', 'its text layer, page by page'], ['status', 'success · HTTP 200'], ['scanned pages', 'no OCR: text layer only']],
  },
  {
    id: 'blocked', tab: 'Not allowed', url: 'https://www.google.com/search?q=octocrawl', status: 'failed', lane: 'http',
    lines: [],
    facts: [['robots.txt', 'disallows /search'], ['page requested', 'never'], ['status', 'failed · policy_denied'], ['cost', '0 credits']],
  },
]
