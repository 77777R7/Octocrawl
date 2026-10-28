import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ALLOWED_TYPES, FAQ_PAGES, checkJsonLd, jsonLdBlocks, pageText } from './check-jsonld.mjs'

const O = '__W2L_ORIGIN__'
const ctx = { '@context': 'https://schema.org' }
const page = (path, data, { title = 'A page', description = 'About the page', body = '<h1>Heading</h1>', head = '' } = {}) => {
  const blocks = (data === undefined ? [] : Array.isArray(data) ? data : [data]).map(block => `<script type="application/ld+json">${typeof block === 'string' ? block : JSON.stringify(block)}</script>`).join('')
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}" /><link rel="canonical" href="${O}${path}" />${head}${blocks}</head><body>${body}</body></html>`
}
const crumbs = (...items) => ({ ...ctx, '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], index) => ({ '@type': 'ListItem', position: index + 1, name, item })) })
const article = (path, extra = {}) => ({ ...ctx, '@type': 'TechArticle', headline: 'Limits and result states', description: 'About the page', url: `${O}${path}`, ...extra })
const GOOD = () => new Map([
  ['/', page('/', [{ ...ctx, '@type': 'WebSite', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'SoftwareApplication', name: 'Octocrawl', url: `${O}/`, applicationCategory: 'DeveloperApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }])],
  ['/docs/', page('/docs/', [article('/docs/'), crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>' })],
  ['/blog/post/', page('/blog/post/', [{ ...ctx, '@type': 'BlogPosting', headline: 'A post', description: 'About the page', url: `${O}/blog/post/`, mainEntityOfPage: `${O}/blog/post/`, datePublished: '2026-10-10', dateModified: '2026-10-22', image: [`${O}/blog-assets/post/og.jpg`], publisher: { '@type': 'Organization', '@id': `${O}/#organization`, name: 'Octocrawl', url: `${O}/` } }, crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`], ['A post', `${O}/blog/post/`])], { body: '<h1>A post</h1>', head: '<meta property="article:published_time" content="2026-10-10" /><meta property="article:modified_time" content="2026-10-22" />' })],
  ['/signin/', page('/signin/', undefined)],
])
const run = (overrides = {}) => checkJsonLd({ pages: overrides.pages ?? GOOD(), fileExists: overrides.fileExists ?? (() => true) })
const problemsOf = result => result.problems.map(entry => `${entry.where} ${entry.problem}`)
const withPage = (path, html) => new Map([...GOOD(), [path, html]])

test('a sound site has no problems and counts its blocks, ignoring pages with none', () => {
  const result = run()
  assert.deepEqual(result.problems, [])
  assert.equal(result.pages, 3)
  assert.equal(result.blocks, 6)
})

test('invalid JSON, a non-object entry, an unknown or missing type and a wrong context are problems', () => {
  const problems = problemsOf(run({ pages: withPage('/docs/', page('/docs/', ['{not json', '[1]', { ...ctx, '@type': 'Product', name: 'x' }, { '@type': 'WebSite', name: 'x' }, { ...ctx, name: 'no type' }])) }))
  assert.deepEqual(problems, [
    '/docs/ has a JSON-LD block that is not valid JSON',
    '/docs/ has a JSON-LD entry that is not an object',
    '/docs/ has a JSON-LD object of type Product, which this site does not use (add it to ALLOWED_TYPES when it is meant)',
    '/docs/ has a WebSite object whose @context is undefined, not https://schema.org',
    '/docs/ has a JSON-LD object with no @type',
  ])
})

test('ratings and reviews are refused wherever they sit', () => {
  const html = page('/', [{ ...ctx, '@type': 'SoftwareApplication', name: 'Octocrawl', url: `${O}/`, applicationCategory: 'DeveloperApplication', aggregateRating: { '@type': 'AggregateRating', ratingValue: '5' }, nested: { review: [] } }])
  const problems = problemsOf(run({ pages: withPage('/', html) }))
  assert.equal(problems.filter(line => line.includes('ratings and reviews')).length >= 3, true)
})

test('addresses: other origins and hosts are refused, files the data names must exist, fragments and queries are ignored', () => {
  const data = { ...ctx, '@type': 'SoftwareApplication', name: 'x', url: `${O}/`, applicationCategory: 'DeveloperApplication', image: `${O}/assets/a.png?v=1`, logo: `${O}/assets/missing.png#x`, sameAs: ['https://github.com/77777R7/Octocrawl', 'https://evil.example/x', 'http://insecure.example/'], '@id': `${O}/#software` }
  const problems = problemsOf(run({ pages: withPage('/', page('/', data)), fileExists: path => path !== '/assets/missing.png' }))
  assert.deepEqual(problems, [
    `/ names ${O}/assets/missing.png#x in logo, which is not in the build`,
    '/ names https://evil.example/x in sameAs, on evil.example, which is not an allowed host',
    '/ names http://insecure.example/ in sameAs, on insecure.example, which is not an allowed host',
  ])
})

test('url and mainEntityOfPage must equal the canonical', () => {
  const docs = extra => withPage('/docs/', page('/docs/', [article('/docs/', extra)], { body: '<h1>Limits and result states</h1>' }))
  const wrongUrl = problemsOf(run({ pages: docs({ url: `${O}/docs` }) }))
  assert.deepEqual(wrongUrl, [`/docs/ has a TechArticle whose url is ${O}/docs, not the canonical ${O}/docs/`])
  const wrongEntity = problemsOf(run({ pages: docs({ mainEntityOfPage: { '@id': `${O}/other/` } }) }))
  assert.deepEqual(wrongEntity, [`/docs/ has a TechArticle whose mainEntityOfPage is ${O}/other/, not the canonical ${O}/docs/`])
  const noCanonical = problemsOf(run({ pages: withPage('/docs/', page('/docs/', [article('/docs/')], { body: '<h1>Limits and result states</h1>' }).replace(/<link rel="canonical"[^>]*>/, '')) }))
  assert.match(noCanonical.join('\n'), /not exactly one canonical link/)
})

test('an article needs a visible headline and the meta description; a blog post needs valid, ordered dates that match its meta tags', () => {
  const html = (extra, body = '<h1>Limits and result states</h1>', head = '') => page('/docs/', [article('/docs/', extra)], { body, head })
  assert.deepEqual(problemsOf(run({ pages: withPage('/docs/', html({ headline: 'Something else' })) })), ['/docs/ has a TechArticle headline that is not on the page: "Something else"'])
  assert.deepEqual(problemsOf(run({ pages: withPage('/docs/', html({ headline: '' })) })), ['/docs/ has a TechArticle with no headline'])
  assert.deepEqual(problemsOf(run({ pages: withPage('/docs/', html({ description: 'Another description' })) })), ['/docs/ has a TechArticle description that is not the meta description'])
  // a headline split over two tags is still on the page: tags count as spaces
  assert.deepEqual(problemsOf(run({ pages: withPage('/docs/', html({}, '<h1>Limits and result</h1><p>states</p>')) })), [])
  const post = (extra, head) => page('/blog/post/', [{ ...ctx, '@type': 'BlogPosting', headline: 'A post', description: 'About the page', url: `${O}/blog/post/`, datePublished: '2026-10-10', dateModified: '2026-10-22', ...extra }], { body: '<h1>A post</h1>', head })
  const meta = '<meta property="article:published_time" content="2026-10-10" /><meta property="article:modified_time" content="2026-10-22" />'
  assert.deepEqual(problemsOf(run({ pages: withPage('/blog/post/', post({}, meta)) })), [])
  assert.deepEqual(problemsOf(run({ pages: withPage('/blog/post/', post({ datePublished: '2026-02-30' }, '')) })), ['/blog/post/ has a BlogPosting datePublished "2026-02-30" that is not a YYYY-MM-DD day'])
  assert.deepEqual(problemsOf(run({ pages: withPage('/blog/post/', post({ dateModified: 'Oct 22' }, '')) })), ['/blog/post/ has a BlogPosting dateModified "Oct 22" that is not a YYYY-MM-DD day'])
  assert.deepEqual(problemsOf(run({ pages: withPage('/blog/post/', post({ dateModified: '2026-10-01' }, '')) })), ['/blog/post/ has a BlogPosting modified before it was published'])
  assert.deepEqual(problemsOf(run({ pages: withPage('/blog/post/', post({}, '<meta property="article:published_time" content="2026-10-11" /><meta property="article:modified_time" content="2026-10-23T08:00:00Z" />')) })), [
    '/blog/post/ has a BlogPosting datePublished 2026-10-10 that differs from article:published_time 2026-10-11',
    '/blog/post/ has a BlogPosting dateModified 2026-10-22 that differs from article:modified_time 2026-10-23T08:00:00Z',
  ])
})

test('a FAQPage is only allowed where one already is, and its questions and the start of its answers must be on the page', () => {
  const faq = (name, text) => ({ ...ctx, '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }] })
  const answer = 'Hosted, yes: it never requests a disallowed page. On your own computer, a URL you give it is read.'
  const visible = `<h1>x</h1><h3>Does it respect robots.txt?</h3><p>${answer}</p>`
  assert.deepEqual(FAQ_PAGES.has('/scrape/'), true)
  const ok = run({ pages: withPage('/scrape/', page('/scrape/', [faq('Does it respect robots.txt?', answer)], { body: visible })) })
  assert.deepEqual(ok.problems, [])
  assert.deepEqual(ok.faqPages, ['/scrape/'])
  assert.match(problemsOf(run({ pages: withPage('/docs/', page('/docs/', [faq('Does it respect robots.txt?', answer)], { body: visible })) })).join('\n'), /\/docs\/ has a FAQPage, which no longer earns a rich result/)
  const hidden = problemsOf(run({ pages: withPage('/scrape/', page('/scrape/', [faq('Does it respect robots.txt?', answer)], { body: '<h1>x</h1>' })) }))
  assert.equal(hidden.some(line => line.includes('FAQ question that is not on the page')), true)
  assert.equal(hidden.some(line => line.includes('FAQ answer whose start is not on the page')), true)
  assert.deepEqual(problemsOf(run({ pages: withPage('/scrape/', page('/scrape/', [{ ...ctx, '@type': 'FAQPage', mainEntity: [] }])) })), ['/scrape/ has a FAQPage with no questions'])
})

test('a BreadcrumbList is numbered 1 to n, starts at home, ends at the page and lists built pages', () => {
  const crumbPage = list => withPage('/docs/', page('/docs/', [list]))
  assert.deepEqual(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`])) })), [])
  assert.match(problemsOf(run({ pages: crumbPage({ ...crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`]), itemListElement: [{ '@type': 'ListItem', position: 2, name: 'Octocrawl', item: `${O}/` }, { '@type': 'ListItem', position: 1, name: 'Docs', item: `${O}/docs/` }] }) })).join('\n'), /positions are not 1 to n/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Docs', `${O}/docs/`])) })).join('\n'), /does not start at the home page/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['Elsewhere', `${O}/elsewhere/`])) })).join('\n'), /ends at __W2L_ORIGIN__\/elsewhere\/, not at the page/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['Gone', `${O}/gone/`], ['Docs', `${O}/docs/`])) })).join('\n'), /item __W2L_ORIGIN__\/gone\/ that is not a built page/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['', `${O}/docs/`])) })).join('\n'), /item without a name or an address/)
  assert.match(problemsOf(run({ pages: crumbPage({ ...ctx, '@type': 'BreadcrumbList', itemListElement: [] }) })).join('\n'), /BreadcrumbList with no items/)
})

test('a software application needs a category and a numeric price with a currency; named types need a name', () => {
  const app = extra => withPage('/', page('/', [{ ...ctx, '@type': 'SoftwareApplication', name: 'Octocrawl', url: `${O}/`, applicationCategory: 'DeveloperApplication', ...extra }]))
  assert.deepEqual(problemsOf(run({ pages: app({}) })), [])
  assert.deepEqual(problemsOf(run({ pages: app({ applicationCategory: '' }) })), ['/ has a SoftwareApplication with no applicationCategory'])
  assert.deepEqual(problemsOf(run({ pages: app({ offers: { '@type': 'Offer', price: 'free', priceCurrency: 'USD' } }) })), ['/ has a SoftwareApplication offer without a numeric price and a currency'])
  assert.deepEqual(problemsOf(run({ pages: app({ offers: { '@type': 'Offer', price: '0' } }) })), ['/ has a SoftwareApplication offer without a numeric price and a currency'])
  assert.deepEqual(problemsOf(run({ pages: app({ name: ' ' }) })), ['/ has a SoftwareApplication with no name'])
})

test('page text and the JSON-LD blocks are read the way the check needs', () => {
  assert.equal(pageText('<script>var a = "hidden"</script><style>p{}</style><p>Tom &amp; Jerry &#8217;s&nbsp;&quot;x&quot; <b>bold</b></p>'), 'Tom & Jerry ’s "x" bold')
  assert.deepEqual(jsonLdBlocks(`<script type='application/ld+json'>{"a":1}</script><script type="text/javascript">x</script><script type="application/ld+json" data-x>{"b":2}</script>`), ['{"a":1}', '{"b":2}'])
  assert.equal(ALLOWED_TYPES.has('FAQPage'), true)
})

test('the command checks a built folder on disk and exits 1 on a problem', () => {
  const dist = mkdtempSync(join(tmpdir(), 'check-jsonld-test-'))
  try {
    const write = (name, text) => { mkdirSync(dirname(join(dist, name)), { recursive: true }); writeFileSync(join(dist, name), text) }
    write('index.html', page('/', [{ ...ctx, '@type': 'WebSite', name: 'Octocrawl', url: `${O}/` }]))
    write('docs/index.html', page('/docs/', [article('/docs/'), crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>' }))
    const script = new URL('./check-jsonld.mjs', import.meta.url).pathname
    const good = spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' })
    assert.equal(good.status, 0)
    assert.match(good.stdout, /json-ld: 3 blocks on 2 pages, 0 problem\(s\)/)
    write('docs/index.html', page('/docs/', [{ ...article('/docs/'), aggregateRating: { ratingValue: '5' } }], { body: '<h1>Limits and result states</h1>' }))
    const bad = spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' })
    assert.equal(bad.status, 1)
    assert.match(bad.stdout, /aggregateRating in a TechArticle object/)
    const missing = spawnSync(process.execPath, [script, '--dist', join(dist, 'nope')], { encoding: 'utf8' })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /build the site first/)
  } finally { rmSync(dist, { recursive: true, force: true }) }
})
