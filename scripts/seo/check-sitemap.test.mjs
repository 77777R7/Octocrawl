import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { MAX_URLS, builtPages, checkSitemap, headFacts, pagePathOf, readRobots, robotsAllows } from './check-sitemap.mjs'
import { parseSitemap } from './sitemap.mjs'

const O = '__W2L_ORIGIN__'
const TODAY = '2026-10-28'
const html = (path, { canonical = `${O}${path}`, robots = null, title = 'A page', description = 'About the page', extra = '' } = {}) =>
  `<!doctype html><html><head><meta charset="UTF-8" /><title>${title}</title>${description === null ? '' : `<meta name="description" content="${description}" />`}${canonical === null ? '' : `<link rel="canonical" href="${canonical}" />`}${robots ? `<meta name="robots" content="${robots}" />` : ''}${extra}</head><body><link rel="canonical" href="https://elsewhere.example/body-link/" /></body></html>`
const urlset = entries => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(([path, lastmod]) => `<url><loc>${O}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('')}</urlset>`
const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${O}/sitemap.xml\n`
const site = () => ({
  xml: urlset([['/', '2026-10-23'], ['/docs/', '2026-10-21'], ['/changelog/', null]]),
  pages: new Map([['/', html('/')], ['/docs/', html('/docs/')], ['/changelog/', html('/changelog/')], ['/signin/', html('/signin/', { robots: 'noindex' })]]),
  robotsTxt: ROBOTS,
  today: TODAY,
})
const run = overrides => checkSitemap({ ...site(), ...overrides })
const problemsOf = result => result.problems.map(entry => `${entry.where} ${entry.problem}`)

test('a sound site has no problems, and a page without a lastmod is counted, not failed', () => {
  const result = run({})
  assert.deepEqual(result.problems, [])
  assert.equal(result.urls, 3)
  assert.equal(result.undated, 1)
})

test('a sitemap URL without a built page, with the wrong canonical, with none or two, or noindex is a problem', () => {
  const base = site()
  const result = run({
    xml: urlset([['/', '2026-10-23'], ['/docs/', '2026-10-21'], ['/changelog/', null], ['/gone/', '2026-10-01'], ['/wrong/', '2026-10-01'], ['/none/', '2026-10-01'], ['/two/', '2026-10-01'], ['/hidden/', '2026-10-01']]),
    pages: new Map([...base.pages, ['/wrong/', html('/wrong/', { canonical: `${O}/other/` })], ['/none/', html('/none/', { canonical: null })], ['/two/', html('/two/', { extra: `<link rel="canonical" href="${O}/two/" />` })], ['/hidden/', html('/hidden/', { robots: 'noindex, follow' })]]),
  })
  assert.deepEqual(problemsOf(result), [
    `${O}/gone/ has no built page`,
    `${O}/wrong/ has canonical ${O}/other/, not itself`,
    `${O}/none/ has 0 canonical links, not one`,
    `${O}/two/ has 2 canonical links, not one`,
    `${O}/hidden/ is noindex`,
  ])
})

test('a canonical link in the body is not read as the page canonical', () => {
  assert.deepEqual(headFacts(html('/', { canonical: null })).canonicals, [])
})

test('a title and a description are required', () => {
  const base = site()
  const result = run({ pages: new Map([...base.pages, ['/docs/', html('/docs/', { title: '', description: null })], ['/', html('/', { description: ' ' })]]) })
  assert.deepEqual(problemsOf(result), [`${O}/ has no meta description`, `${O}/docs/ has no <title>`, `${O}/docs/ has no meta description`])
})

test('a built page that can be indexed but is not in the sitemap is a problem; a noindex one is not', () => {
  const base = site()
  const result = run({ pages: new Map([...base.pages, ['/forgotten/', html('/forgotten/')], ['/dashboard/', html('/dashboard/', { robots: 'noindex' })]]) })
  assert.deepEqual(problemsOf(result), [`${O}/forgotten/ is a built page that can be indexed but is not in the sitemap`])
})

test('duplicates, other origins, queries, missing slashes and bad or future lastmod days are problems', () => {
  const xml = `<urlset><url><loc>${O}/</loc><lastmod>2026-10-23</lastmod></url><url><loc>${O}/</loc></url><url><loc>https://other.example/docs/</loc></url><url><loc>${O}/docs/?x=1</loc></url><url><loc>${O}/changelog</loc></url><url><loc>${O}/a/</loc><lastmod>2026-13-40</lastmod></url><url><loc>${O}/b/</loc><lastmod>2026-11-01</lastmod></url><url><loc>${O}/c/</loc><lastmod>Oct 1</lastmod></url></urlset>`
  const base = site()
  const result = run({ xml, pages: new Map([...base.pages, ['/a/', html('/a/')], ['/b/', html('/b/')], ['/c/', html('/c/')]]) })
  assert.deepEqual(problemsOf(result), [
    `${O}/ is listed more than once`,
    'https://other.example/docs/ is not on the sitemap\'s origin __W2L_ORIGIN__',
    `${O}/docs/?x=1 is not a plain absolute path (no query, fragment or space)`,
    `${O}/changelog has no trailing slash, which every canonical here has`,
    `${O}/changelog has no built page`,
    `${O}/a/ has lastmod "2026-13-40", which is not a YYYY-MM-DD day`,
    `${O}/b/ has lastmod 2026-11-01, which is after tomorrow (2026-10-29, UTC)`,
    `${O}/c/ has lastmod "Oct 1", which is not a YYYY-MM-DD day`,
    `${O}/docs/ is a built page that can be indexed but is not in the sitemap`,
    `${O}/changelog/ is a built page that can be indexed but is not in the sitemap`,
  ])
})

test('an empty sitemap, an index, another document and an oversize list are refused rather than passed', () => {
  assert.match(problemsOf(run({ xml: urlset([]) })).join('\n'), /lists no URLs/)
  assert.match(problemsOf(run({ xml: '<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>' })).join('\n'), /sitemap index/)
  assert.match(problemsOf(run({ xml: '<html></html>' })).join('\n'), /no <urlset>/)
  const many = urlset(Array.from({ length: MAX_URLS + 1 }, (_, i) => [`/p${i}/`, null]))
  assert.match(problemsOf(run({ xml: many, pages: new Map() })).join('\n'), /lists 50001 URLs/)
})

test('robots.txt must exist, name the sitemap, and allow every listed path to every crawler, by the longest matching rule', () => {
  assert.deepEqual(problemsOf(run({ robotsTxt: null })), ['robots.txt is missing'])
  assert.match(problemsOf(run({ robotsTxt: 'User-agent: *\nAllow: /\n' })).join('\n'), /robots\.txt does not name __W2L_ORIGIN__\/sitemap\.xml/)
  assert.match(problemsOf(run({ robotsTxt: `User-agent: *\nDisallow: /docs/\nSitemap: ${O}/sitemap.xml\n` })).join('\n'), /\/docs\/ is disallowed for \* by robots\.txt \(Disallow: \/docs\/\)/)
  const wild = problemsOf(run({ robotsTxt: `User-agent: *\nDisallow: /*/\nSitemap: ${O}/sitemap.xml\n` }))
  assert.equal(wild.some(line => line.includes('/docs/ is disallowed for *')), true)
  const google = problemsOf(run({ robotsTxt: `User-agent: *\nDisallow: /api/\n\nUser-agent: Googlebot\nDisallow: /\nSitemap: ${O}/sitemap.xml\n` }))
  assert.equal(google.some(line => line.includes('/docs/ is disallowed for googlebot')), true)
  assert.equal(google.some(line => line.includes('for *')), false)
  assert.deepEqual(run({ robotsTxt: `User-agent: Other\nDisallow: /\n\nUser-agent: *\nDisallow: /api/\nSitemap: ${O}/sitemap.xml\n` }).problems, [])
  assert.deepEqual(run({ robotsTxt: `User-agent: *\nDisallow: /docs/\nAllow: /docs/\nSitemap: ${O}/sitemap.xml\n` }).problems, [])
  assert.equal(robotsAllows(readRobots('User-agent: *\nDisallow: /a/\nAllow: /a/b/'), '*', '/a/b/c/').allowed, true)
  assert.equal(robotsAllows(readRobots('User-agent: *\nDisallow: /a/\nAllow: /a/b/'), '*', '/a/x/').allowed, false)
  assert.equal(robotsAllows(readRobots('User-agent: *\nDisallow: /*.pdf$'), '*', '/x.pdf').allowed, false)
  assert.equal(robotsAllows(readRobots('User-agent: *\nDisallow: /*.pdf$'), '*', '/x.pdf/').allowed, true)
  assert.equal(robotsAllows(readRobots('User-agent: *\nDisallow:'), '*', '/anything/').allowed, true)
  assert.equal(robotsAllows(readRobots('User-agent: a\nUser-agent: b\nDisallow: /x/'), 'b', '/x/').allowed, false)
  const parsed = readRobots('User-agent: *\nDisallow: /api/ # x\nSitemap: https://a.example/sitemap.xml')
  assert.deepEqual(parsed.groups.get('*'), [{ allow: false, pattern: '/api/' }])
  assert.deepEqual(parsed.sitemaps, ['https://a.example/sitemap.xml'])
})

test('noindex is found in single-quoted, unquoted, none, googlebot and bingbot meta tags, and not in an unrelated tag', () => {
  const noindex = extra => problemsOf(run({ pages: new Map([...site().pages, ['/docs/', html('/docs/', { extra })]]) })).filter(line => line.includes('is noindex'))
  for (const extra of ["<meta name='robots' content='noindex'>", '<meta name=robots content=noindex>', '<meta name="robots" content="none">', '<meta name="googlebot" content="noindex, nofollow">', '<meta name="BingBot" content="NOINDEX">']) assert.equal(noindex(extra).length, 1, extra)
  for (const extra of ['<meta name="robots" content="index, follow">', '<meta name="author" content="noindex">', '<meta name="robots" content="nofollow">']) assert.equal(noindex(extra).length, 0, extra)
})

test('a lastmod of tomorrow (UTC) is allowed, the day after is not, and a day that does not exist is not', () => {
  const base = site()
  const withDay = day => problemsOf(run({ xml: urlset([['/', day], ['/docs/', '2026-10-21'], ['/changelog/', null]]), pages: base.pages })).filter(line => line.includes('lastmod'))
  assert.deepEqual(withDay('2026-10-29'), [])
  assert.equal(withDay('2026-10-30').length, 1)
  assert.equal(withDay('2026-02-30').length, 1)
  assert.equal(withDay('2026-02-28').length, 0)
})

test('built files map to page paths, and the sitemap reader refuses what it cannot read', () => {
  assert.equal(pagePathOf('index.html'), '/')
  assert.equal(pagePathOf('blog/x/index.html'), '/blog/x/')
  assert.equal(pagePathOf('docs\\a\\index.html'), '/docs/a/')
  assert.equal(pagePathOf('404.html'), null)
  assert.equal(pagePathOf('docs/index.md'), null)
  assert.deepEqual(parseSitemap(urlset([['/', '2026-10-23'], ['/a/', null]])), [{ loc: `${O}/`, lastmod: '2026-10-23' }, { loc: `${O}/a/`, lastmod: null }])
  assert.throws(() => parseSitemap('<sitemapindex></sitemapindex>'), /index/)
})

test('the command checks a built folder on disk and exits 1 on a problem', () => {
  const dist = mkdtempSync(join(tmpdir(), 'check-sitemap-test-'))
  try {
    const write = (name, text) => { mkdirSync(dirname(join(dist, name)), { recursive: true }); writeFileSync(join(dist, name), text) }
    write('sitemap.xml', urlset([['/', '2026-10-23'], ['/docs/', '2026-10-21']]))
    write('robots.txt', ROBOTS)
    write('index.html', html('/'))
    write('docs/index.html', html('/docs/'))
    write('docs/extra.md', 'not a page')
    assert.equal(builtPages(dist).size, 2)
    const script = new URL('./check-sitemap.mjs', import.meta.url).pathname
    const good = spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' })
    assert.equal(good.status, 0)
    assert.match(good.stdout, /sitemap: 2 URLs \(0 without lastmod\), 0 problem\(s\)/)
    write('docs/index.html', html('/docs/', { robots: 'noindex' }))
    const bad = spawnSync(process.execPath, [script, '--dist', dist], { encoding: 'utf8' })
    assert.equal(bad.status, 1)
    assert.match(bad.stdout, /__W2L_ORIGIN__\/docs\/ is noindex/)
    const missing = spawnSync(process.execPath, [script, '--dist', join(dist, 'nope')], { encoding: 'utf8' })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /build the site first/)
  } finally { rmSync(dist, { recursive: true, force: true }) }
})
