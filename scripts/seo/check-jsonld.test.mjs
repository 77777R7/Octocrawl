import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ALLOWED_TYPES, FAQ_PAGES, checkJsonLd, jsonLdBlocks, pageText, requiredTypes } from './check-jsonld.mjs'

const O = '__W2L_ORIGIN__'
const ctx = { '@context': 'https://schema.org' }
const page = (path, data, { title = 'A page', description = 'About the page', body = '<h1>Heading</h1>', head = '' } = {}) => {
  const blocks = (data === undefined ? [] : Array.isArray(data) ? data : [data]).map(block => `<script type="application/ld+json">${typeof block === 'string' ? block : JSON.stringify(block)}</script>`).join('')
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}" /><link rel="canonical" href="${O}${path}" />${head}${blocks}</head><body>${body}</body></html>`
}
const crumbs = (...items) => ({ ...ctx, '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], index) => ({ '@type': 'ListItem', position: index + 1, name, item })) })
const article = (path, extra = {}) => ({ ...ctx, '@type': 'TechArticle', headline: 'Limits and result states', description: 'About the page', url: `${O}${path}`, ...extra })
const GOOD = () => new Map([
  ['/', page('/', [{ ...ctx, '@type': 'WebSite', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'Organization', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'SoftwareApplication', name: 'Octocrawl', url: `${O}/`, applicationCategory: 'DeveloperApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }])],
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
  assert.equal(result.blocks, 7)
})

test('invalid JSON, a non-object entry, an unknown or missing type and a wrong context are problems', () => {
  const problems = problemsOf(run({ pages: withPage('/x/', page('/x/', ['{not json', '[1]', { ...ctx, '@type': 'Product', name: 'x' }, { '@type': 'WebSite', name: 'x' }, { ...ctx, name: 'no type' }])) }))
  assert.deepEqual(problems, [
    '/x/ has a JSON-LD block that is not valid JSON',
    '/x/ has a JSON-LD entry that is not an object',
    '/x/ has a JSON-LD object of type Product, which this site does not use (add it to ALLOWED_TYPES when it is meant)',
    '/x/ has a WebSite object whose @context is undefined, not https://schema.org',
    '/x/ has a JSON-LD object with no @type',
  ])
})

test('ratings and reviews are refused wherever they sit', () => {
  const html = page('/x/', [{ ...ctx, '@type': 'SoftwareApplication', name: 'Octocrawl', url: `${O}/x/`, applicationCategory: 'DeveloperApplication', aggregateRating: { '@type': 'AggregateRating', ratingValue: '5' }, nested: { review: [] } }])
  const problems = problemsOf(run({ pages: withPage('/x/', html) }))
  assert.equal(problems.filter(line => line.includes('ratings and reviews')).length >= 3, true)
})

test('addresses: other origins and hosts are refused, files the data names must exist, fragments and queries are ignored', () => {
  const data = { ...ctx, '@type': 'SoftwareApplication', name: 'x', url: `${O}/x/`, applicationCategory: 'DeveloperApplication', image: `${O}/assets/a.png?v=1`, logo: `${O}/assets/missing.png#x`, sameAs: ['https://github.com/77777R7/Octocrawl', 'https://evil.example/x', 'http://insecure.example/'], '@id': `${O}/#software` }
  const problems = problemsOf(run({ pages: withPage('/x/', page('/x/', data)), fileExists: path => path !== '/assets/missing.png' }))
  assert.deepEqual(problems, [
    `/x/ names ${O}/assets/missing.png#x in logo, which is not in the build`,
    '/x/ names https://evil.example/x in sameAs, on evil.example, which is not an allowed host',
    '/x/ names http://insecure.example/ in sameAs, on insecure.example, which is not an allowed host',
  ])
})

test('url and mainEntityOfPage must equal the canonical', () => {
  const docs = extra => withPage('/docs/', page('/docs/', [article('/docs/', extra), crumbs(['Octocrawl', `${O}/`], ['Limits and result states', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>' }))
  const wrongUrl = problemsOf(run({ pages: docs({ url: `${O}/docs` }) }))
  assert.deepEqual(wrongUrl, [`/docs/ has a TechArticle whose url is ${O}/docs, not the canonical ${O}/docs/`])
  const wrongEntity = problemsOf(run({ pages: docs({ mainEntityOfPage: { '@id': `${O}/other/` } }) }))
  assert.deepEqual(wrongEntity, [`/docs/ has a TechArticle whose mainEntityOfPage is ${O}/other/, not the canonical ${O}/docs/`])
  const noCanonical = problemsOf(run({ pages: withPage('/docs/', page('/docs/', [article('/docs/'), crumbs(['Octocrawl', `${O}/`], ['Limits and result states', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>' }).replace(/<link rel="canonical"[^>]*>/, '')) }))
  assert.match(noCanonical.join('\n'), /not exactly one canonical link/)
})

test('an article needs a headline that is its own, and the meta description; a blog post needs valid, ordered dates that match its meta tags', () => {
  const doc = (extra, { body = '<h1>Limits and result states</h1>', head = '', title = 'A page', crumb = 'Limits and result states' } = {}) =>
    withPage('/docs/', page('/docs/', [article('/docs/', extra), crumbs(['Octocrawl', `${O}/`], [crumb, `${O}/docs/`])], { body, head, title }))
  assert.deepEqual(problemsOf(run({ pages: doc({}) })), [])
  // the breadcrumb name is enough (a blog post's h1 may say more than its title), and so is the h1 (the docs index is "Docs" in the trail)
  assert.deepEqual(problemsOf(run({ pages: doc({ headline: 'A post title' }, { body: '<h1>A post title and more</h1>', crumb: 'A post title' }) })), [])
  assert.deepEqual(problemsOf(run({ pages: doc({ headline: 'A post title' }, { body: '<h1>Something else entirely</h1>', crumb: 'A post title' }) })), [])
  assert.deepEqual(problemsOf(run({ pages: doc({ headline: 'Introduction' }, { body: '<h1>Introduction to Octocrawl</h1>', crumb: 'Docs' }) })), [])
  // the title tag and the navigation do not count: they hold every page's name, and an article name copied from another page would pass
  const neither = '/docs/ has a TechArticle headline that is neither the breadcrumb name nor in the page\'s h1: "Another page"'
  assert.deepEqual(problemsOf(run({ pages: doc({ headline: 'Another page' }, { body: '<nav>Another page</nav><h1>Limits and result states</h1>', title: 'Another page' }) })), [neither])
  assert.deepEqual(problemsOf(run({ pages: doc({ headline: 'Another page' }, { body: '<h1>Limits and result states</h1>' }) })), [neither])
  assert.deepEqual(problemsOf(run({ pages: doc({ headline: '' }) })), ['/docs/ has a TechArticle with no headline'])
  // a headline split over two tags is still in the h1
  assert.deepEqual(problemsOf(run({ pages: doc({}, { body: '<h1>Limits and <em>result</em> states</h1>' }) })), [])
  assert.deepEqual(problemsOf(run({ pages: doc({ description: 'Another description' }) })), ['/docs/ has a TechArticle description that is not the meta description'])
  // the meta tag is HTML-escaped text; the JSON-LD description is plain text, so only the meta side is decoded
  const ampersand = withPage('/docs/', page('/docs/', [article('/docs/', { description: 'Tom & Jerry <b>' }), crumbs(['Octocrawl', `${O}/`], ['Limits and result states', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>', description: 'Tom &amp; Jerry &lt;b&gt;' }))
  assert.deepEqual(problemsOf(run({ pages: ampersand })), [])
  const literal = withPage('/docs/', page('/docs/', [article('/docs/', { description: 'Use &amp; in HTML' }), crumbs(['Octocrawl', `${O}/`], ['Limits and result states', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>', description: 'Use &amp;amp; in HTML' }))
  assert.deepEqual(problemsOf(run({ pages: literal })), [])
  const post = (extra, head) => page('/blog/post/', [{ ...ctx, '@type': 'BlogPosting', headline: 'A post', description: 'About the page', url: `${O}/blog/post/`, datePublished: '2026-10-10', dateModified: '2026-10-22', ...extra }, crumbs(['Octocrawl', `${O}/`], ['A post', `${O}/blog/post/`])], { body: '<h1>A post</h1>', head })
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
  // the builders strip tags without a space; the page body has them as spaces
  const marked = faq('Does it respect robots.txt?', 'Run npx octocrawl serve, then read the result and check it.')
  assert.deepEqual(run({ pages: withPage('/scrape/', page('/scrape/', [marked], { body: '<h3>Does it respect <code>robots.txt</code>?</h3><p>Run <code>npx octocrawl serve</code>, then read the result and check it.</p>' })) }).problems, [])
  // the title tag does not count as the page body
  const inTitle = problemsOf(run({ pages: withPage('/scrape/', page('/scrape/', [faq('Does it respect robots.txt?', answer)], { title: 'Does it respect robots.txt?', body: '<h1>x</h1>' })) }))
  assert.equal(inTitle.some(line => line.includes('FAQ question that is not on the page')), true)
})

test('an @graph keeps the container\'s @context for its members, and a member that is not an object is a problem', () => {
  const graph = members => withPage('/docs/', page('/docs/', [{ '@context': 'https://schema.org', '@graph': members }, article('/docs/'), crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>' }))
  assert.deepEqual(problemsOf(run({ pages: graph([{ '@type': 'Organization', name: 'Octocrawl', url: `${O}/` }]) })).filter(line => !line.includes('url is')), [])
  assert.equal(problemsOf(run({ pages: graph([{ '@type': 'Organization', name: 'Octocrawl', '@context': 'http://schema.org' }]) })).some(line => line.includes('@context is "http://schema.org"')), true)
  assert.equal(problemsOf(run({ pages: graph(['text']) })).some(line => line.includes('@graph member that is not an object')), true)
})

test('only address fields are read as addresses: free text may start with https://, a look-alike origin, a protocol-relative or relative address may not', () => {
  const app = extra => withPage('/', page('/', [{ ...ctx, '@type': 'WebSite', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'Organization', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'SoftwareApplication', name: 'x', url: `${O}/`, applicationCategory: 'DeveloperApplication', ...extra }]))
  assert.deepEqual(problemsOf(run({ pages: app({ description: 'https://api.octocrawl.dev/v1/scrape is the REST route', text: 'http://anything.example' }) })), [])
  for (const [value, expected] of [[`${O}.evil.example/x.png`, 'which is neither on the site\'s origin nor on an allowed host'], ['//cdn.evil.example/x.png', 'which is neither'], ['/assets/x.png', 'which is neither'], ['ftp://files.example/x', 'which is neither'], ['https://evil.example/x', 'not an allowed host']]) {
    assert.equal(problemsOf(run({ pages: app({ image: value }) })).some(line => line.includes(expected)), true, value)
  }
  assert.deepEqual(problemsOf(run({ pages: app({ image: `${O}?x=1`, sameAs: [`${O}#top`] }) })), [])
})

test('a page family that carries structured data must keep it, a family with no requirement need not, and blog category pages are not blog posts', () => {
  assert.deepEqual(requiredTypes('/'), ['WebSite', 'Organization', 'SoftwareApplication'])
  assert.deepEqual(requiredTypes('/docs/'), ['TechArticle', 'BreadcrumbList'])
  assert.deepEqual(requiredTypes('/docs/guides/amazon-product/'), ['TechArticle', 'BreadcrumbList'])
  assert.deepEqual(requiredTypes('/blog/'), ['Blog', 'BreadcrumbList'])
  assert.deepEqual(requiredTypes('/blog/a-post/'), ['BlogPosting', 'BreadcrumbList'])
  assert.equal(requiredTypes('/blog/category/ai-agents/'), null)
  assert.deepEqual(requiredTypes('/tools/'), ['CollectionPage'])
  assert.deepEqual(requiredTypes('/tools/link-extractor/'), ['SoftwareApplication'])
  assert.deepEqual(requiredTypes('/changelog/'), ['BreadcrumbList'])
  for (const path of ['/signin/', '/dashboard/keys/', '/scrape/', '/compare/x/']) assert.equal(requiredTypes(path), null, path)
  const stripped = new Map(GOOD())
  stripped.set('/docs/', page('/docs/', undefined))
  assert.deepEqual(problemsOf(run({ pages: stripped })), ['/docs/ has no structured data; pages like it carry TechArticle, BreadcrumbList'])
  const half = new Map(GOOD())
  half.set('/docs/', page('/docs/', [article('/docs/')], { body: '<h1>Limits and result states</h1>' }))
  assert.deepEqual(problemsOf(run({ pages: half })), ['/docs/ has no BreadcrumbList in its structured data; pages like it carry TechArticle, BreadcrumbList'])
  const category = new Map(GOOD())
  category.set('/blog/category/ai-agents/', page('/blog/category/ai-agents/', undefined))
  assert.deepEqual(run({ pages: category }).problems, [])
})

test('a BreadcrumbList is numbered 1 to n, starts at home, ends at the page and lists built pages', () => {
  const crumbPage = list => withPage('/docs/', page('/docs/', [article('/docs/'), list], { body: '<h1>Limits and result states</h1>' }))
  assert.deepEqual(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`])) })), [])
  assert.match(problemsOf(run({ pages: crumbPage({ ...crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`]), itemListElement: [{ '@type': 'ListItem', position: 2, name: 'Octocrawl', item: `${O}/` }, { '@type': 'ListItem', position: 1, name: 'Docs', item: `${O}/docs/` }] }) })).join('\n'), /positions are not 1 to n/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Docs', `${O}/docs/`])) })).join('\n'), /does not start at the home page/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['Elsewhere', `${O}/elsewhere/`])) })).join('\n'), /ends at __W2L_ORIGIN__\/elsewhere\/, not at the page/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['Gone', `${O}/gone/`], ['Docs', `${O}/docs/`])) })).join('\n'), /item __W2L_ORIGIN__\/gone\/ that is not a built page/)
  assert.match(problemsOf(run({ pages: crumbPage(crumbs(['Octocrawl', `${O}/`], ['', `${O}/docs/`])) })).join('\n'), /item without a name or an address/)
  assert.match(problemsOf(run({ pages: crumbPage({ ...ctx, '@type': 'BreadcrumbList', itemListElement: [] }) })).join('\n'), /BreadcrumbList with no items/)
})

test('a software application needs a category and a numeric price with a currency; named types need a name', () => {
  const app = extra => withPage('/', page('/', [{ ...ctx, '@type': 'WebSite', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'Organization', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'SoftwareApplication', name: 'Octocrawl', url: `${O}/`, applicationCategory: 'DeveloperApplication', ...extra }]))
  assert.deepEqual(problemsOf(run({ pages: app({}) })), [])
  assert.deepEqual(problemsOf(run({ pages: app({ applicationCategory: '' }) })), ['/ has a SoftwareApplication with no applicationCategory'])
  assert.deepEqual(problemsOf(run({ pages: app({ offers: { '@type': 'Offer', price: 'free', priceCurrency: 'USD' } }) })), ['/ has a SoftwareApplication offer without a numeric price and a currency'])
  assert.deepEqual(problemsOf(run({ pages: app({ offers: { '@type': 'Offer', price: '0' } }) })), ['/ has a SoftwareApplication offer without a numeric price and a currency'])
  assert.deepEqual(problemsOf(run({ pages: app({ name: ' ' }) })), ['/ has a SoftwareApplication with no name'])
})

test('page text and the JSON-LD blocks are read the way the check needs', () => {
  assert.equal(pageText('<html><head><title>In the title</title></head><body><script>var a = "hidden"</script><style>p{}</style><p>Tom &amp; Jerry &#8217;s&nbsp;&quot;x&quot; <b>bold</b></p></body></html>'), 'Tom & Jerry ’s "x" bold')
  assert.deepEqual(jsonLdBlocks(`<script type='application/ld+json'>{"a":1}</script><script type="text/javascript">x</script><script type="application/ld+json" data-x>{"b":2}</script>`), ['{"a":1}', '{"b":2}'])
  assert.equal(ALLOWED_TYPES.has('FAQPage'), true)
})

test('the command checks a built folder on disk and exits 1 on a problem', () => {
  const dist = mkdtempSync(join(tmpdir(), 'check-jsonld-test-'))
  try {
    const write = (name, text) => { mkdirSync(dirname(join(dist, name)), { recursive: true }); writeFileSync(join(dist, name), text) }
    write('index.html', page('/', [{ ...ctx, '@type': 'WebSite', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'Organization', name: 'Octocrawl', url: `${O}/` }, { ...ctx, '@type': 'SoftwareApplication', name: 'Octocrawl', url: `${O}/`, applicationCategory: 'DeveloperApplication' }]))
    write('docs/index.html', page('/docs/', [article('/docs/'), crumbs(['Octocrawl', `${O}/`], ['Docs', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>' }))
    const script = new URL('./check-jsonld.mjs', import.meta.url).pathname
    const good = spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' })
    assert.equal(good.status, 0)
    assert.match(good.stdout, /json-ld: 5 blocks on 2 pages, 0 problem\(s\)/)
    write('docs/index.html', page('/docs/', [{ ...article('/docs/'), aggregateRating: { ratingValue: '5' } }, crumbs(['Octocrawl', `${O}/`], ['Limits and result states', `${O}/docs/`])], { body: '<h1>Limits and result states</h1>' }))
    const bad = spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' })
    assert.equal(bad.status, 1)
    assert.match(bad.stdout, /aggregateRating in a TechArticle object/)
    const missing = spawnSync(process.execPath, [script, '--dist', join(dist, 'nope')], { encoding: 'utf8' })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /build the site first/)
  } finally { rmSync(dist, { recursive: true, force: true }) }
})
