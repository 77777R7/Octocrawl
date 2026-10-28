import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DATA_LINE_PREFIX, canonicalPath, describeInspection, gscWindow, indexChanges, indexCell, launchCell, mergeDataLine, pagesByPath,
  parseSitemap, previousFor, readSeries, renderSummary, seriesAppend, seriesEntry, snapshotId, sourceOfPath, summarizeGsc,
  summarizeInspections, summarizeAiReferrals, assistantOf, updateTracker,
} from './snapshot-lib.mjs'
import { parseArgs } from './snapshot.mjs'

const row = (key, clicks, impressions, position) => ({ keys: [key], clicks, impressions, position })

test('the Search Console window is whole UTC days that end two days before today', () => {
  assert.deepEqual(gscWindow(28, new Date('2026-10-27T23:59:00Z')), { start: '2026-09-28', end: '2026-10-25', days: 28 })
  assert.deepEqual(gscWindow(1, new Date('2026-03-01T00:00:00Z')), { start: '2026-02-27', end: '2026-02-27', days: 1 })
  assert.throws(() => gscWindow(0), /--days/)
  assert.throws(() => gscWindow(2.5), /--days/)
  assert.equal(snapshotId(new Date('2026-10-28T09:05:30Z')), '2026-10-28T090530Z')
  assert.notEqual(snapshotId(new Date('2026-10-28T09:05:01Z')), snapshotId(new Date('2026-10-28T09:05:59Z')))
})

test('a sitemap is read as urlset entries; an index or another document is refused', () => {
  const xml = '<?xml version="1.0"?><urlset xmlns="x"><url><loc>https://octocrawl.dev/</loc></url><url><loc>https://octocrawl.dev/a/?x=1&amp;y=2</loc><lastmod>2026-10-01</lastmod></url><url><lastmod>2026-10-02</lastmod></url></urlset>'
  assert.deepEqual(parseSitemap(xml), [{ loc: 'https://octocrawl.dev/', lastmod: null }, { loc: 'https://octocrawl.dev/a/?x=1&y=2', lastmod: '2026-10-01' }])
  assert.throws(() => parseSitemap('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>'), /sitemap index/)
  assert.throws(() => parseSitemap('<html></html>'), /urlset/)
})

test('only https://octocrawl.dev addresses have a canonical path; query strings are dropped', () => {
  assert.equal(canonicalPath('https://octocrawl.dev/blog/x/?utm=1#top'), '/blog/x/')
  assert.equal(canonicalPath('https://octocrawl.dev'), '/')
  assert.equal(canonicalPath('http://octocrawl.dev/blog/x/'), null)
  assert.equal(canonicalPath('https://www.octocrawl.dev/'), null)
  assert.equal(canonicalPath('http://127.0.0.1:8791'), null)
  assert.equal(canonicalPath('not a url'), null)
})

test('page rows that differ by query string add up, with the position weighted by impressions; other origins are left out', () => {
  const pages = pagesByPath([
    row('https://octocrawl.dev/a/', 1, 10, 4),
    row('https://octocrawl.dev/a/?ref=x', 0, 30, 8),
    row('http://octocrawl.dev/a/', 0, 99, 1),
    row('https://octocrawl.dev/b/', 0, 0, 0),
  ])
  assert.deepEqual([...pages.keys()], ['/a/', '/b/'])
  assert.deepEqual(pages.get('/a/'), { clicks: 1, impressions: 40, position: 7 })
  assert.equal(pages.get('/b/').position, null)
})

test('a Search Console pull is summed into the numbers the series keeps, with full pulls flagged and unread totals null', () => {
  const pulls = {
    total: [{ clicks: 6, impressions: 100, ctr: 0.06, position: 72.2 }],
    query: [row('octocrawl mcp', 2, 10, 3), row('find all pages', 0, 80, 70), row('Octocrawl pricing', 1, 5, 2)],
    page: [row('https://octocrawl.dev/', 3, 30, 4.2), row('https://octocrawl.dev/#free-tiers', 0, 1, 3), row('https://octocrawl.dev/blog/x/', 0, 70, 72.7), row('http://octocrawl.dev/', 0, 1, 1)],
    date: [row('2026-10-24', 3, 60, 70), row('2026-10-25', 3, 40, 74), row('2026-10-26', 0, 0, 0)],
    country: [], device: [],
  }
  const summary = summarizeGsc(pulls, 3)
  assert.equal(summary.clicks, 6)
  assert.equal(summary.ctr, 0.06)
  assert.equal(summary.lastDateWithData, '2026-10-25')
  assert.deepEqual(summary.pagesLe20, { pages: 1, impressions: 31 })
  assert.equal(summary.pageRows, 4)
  assert.equal(summary.pageImpressions, 102)
  assert.equal(summary.canonicalPageImpressions, 101)
  assert.deepEqual(summary.visibleBrand, { rows: 2, impressions: 15, clicks: 3 })
  assert.equal(summary.queryRowsFull, true)
  assert.equal(summary.pageRowsFull, true)
  const empty = summarizeGsc({ total: [], query: [], page: [], date: [], country: [], device: [] }, 5000)
  assert.equal(empty.impressions, null)
  assert.equal(empty.ctr, null)
  assert.equal(empty.lastDateWithData, null)
  assert.equal(empty.queryRowsFull, false)
})

test('an inspection becomes a tracker cell with its verdict, its coverage state and the day it was read', () => {
  const read = verdict => describeInspection({ inspectionResult: { indexStatusResult: { verdict, coverageState: 'URL is unknown to Google', lastCrawlTime: '2026-10-20T01:00:00Z' } } })
  assert.equal(indexCell(read('PASS'), '2026-10-28'), '通过（2026-10-28）')
  assert.equal(indexCell(read('NEUTRAL'), '2026-10-28'), '中性：URL is unknown to Google（2026-10-28）')
  assert.equal(indexCell(read('FAIL'), '2026-10-28'), '未通过：URL is unknown to Google（2026-10-28）')
  assert.equal(indexCell({ verdict: 'VERDICT_UNSPECIFIED', coverageState: null }, '2026-10-28'), '未知（2026-10-28）')
  assert.equal(read('PASS').lastCrawlTime, '2026-10-20T01:00:00Z')
})

test('an answer with no index status or no verdict is not a reading: it throws, so the URL counts as not read and no cell changes', () => {
  assert.throws(() => describeInspection({}), /indexStatusResult/)
  assert.throws(() => describeInspection({ inspectionResult: {} }), /indexStatusResult/)
  assert.throws(() => describeInspection(null), /indexStatusResult/)
  assert.throws(() => describeInspection({ inspectionResult: { indexStatusResult: {} } }), /no verdict/)
  assert.throws(() => describeInspection({ inspectionResult: { indexStatusResult: { verdict: 'VERDICT_UNSPECIFIED', coverageState: 'x' } } }), /no verdict/)
})

test('inspections are counted by verdict and the URLs that could not be read stay in the denominator', () => {
  const results = new Map([
    ['/', { inspection: { verdict: 'PASS' } }],
    ['/a/', { inspection: { verdict: 'NEUTRAL' } }],
    ['/b/', { inspection: { verdict: 'FAIL' } }],
    ['/c/', { inspection: { verdict: 'PARTIAL' } }],
    ['/d/', { error: 'quota' }],
  ])
  assert.deepEqual(summarizeInspections(results), { urls: 5, read: 4, notRead: 1, pass: 1, neutral: 1, fail: 1, other: 1 })
})

test('a page finds its source file and its date: a blog article has a publication day, anything else only a first commit', () => {
  const registries = {
    docsPages: [{ slug: '', file: 'introduction.md' }, { slug: 'guides/amazon-product', file: 'amazon-product.md' }],
    blogPosts: [{ slug: 'post', file: 'blog/post.md', pubDate: '2026-10-13' }, { slug: 'draft', file: 'blog/draft.md' }],
  }
  const present = new Set(['apps/public-web/index.html', 'apps/public-web/tools/link-extractor/index.html', 'apps/public-web/content/introduction.md', 'apps/public-web/content/amazon-product.md', 'apps/public-web/content/blog/post.md', 'apps/public-web/content/blog/draft.md', 'CHANGELOG.md'])
  const find = path => sourceOfPath(path, registries, file => present.has(file))
  assert.deepEqual(find('/'), { files: ['apps/public-web/index.html'] })
  assert.deepEqual(find('/tools/link-extractor/'), { files: ['apps/public-web/tools/link-extractor/index.html'] })
  assert.deepEqual(find('/docs/'), { files: ['apps/public-web/content/introduction.md'] })
  assert.deepEqual(find('/docs/guides/amazon-product/'), { files: ['apps/public-web/content/amazon-product.md'] })
  assert.deepEqual(find('/blog/post/'), { files: ['apps/public-web/content/blog/post.md'], pubDate: '2026-10-13' })
  assert.deepEqual(find('/blog/draft/'), { files: ['apps/public-web/content/blog/draft.md'] })
  assert.equal(find('/changelog/'), null)
  assert.equal(find('/blog/nope/'), null)
  assert.equal(find('/docs/nope/'), null)
  assert.equal(find('/tools/missing/'), null)
  assert.equal(find('/pricing/'), null)
  assert.equal(launchCell(find('/blog/post/'), '2026-10-01'), '2026-10-13（发布日）')
  assert.equal(launchCell(find('/docs/'), '2026-10-02'), '2026-10-02（首次入库）')
  assert.equal(launchCell(null, null), null)
  assert.equal(launchCell({ files: ['x'] }, null), null)
})

const TRACKER = [
  '# 页面追踪表', '',
  '- 说明一行',
  `${DATA_LINE_PREFIX}旧的数据说明`, '',
  '| URL | 类型 | 主承接词 | 上线日 | 收录 | 28 天 展示 / 点击 / 位置 | 备注 |',
  '|---|---|---|---|---|---|---|',
  '| / | 首页 | 品牌词 | 未知 | 通过（2026-10-13） | 33 / 5 / 4.2 | 手写备注 |',
  '| /blog/a/ | 博客 | D 组：x | 未知 | 未知（2026-10-13 未检查） | 页面表无此行（未知，不是 0） |  |',
  '| /old/ | 文档 | — | 未知 | 通过（2026-10-13） | 1 / 0 / 9.0 |  |',
  '',
  '## 新页面', '',
  '| URL | 主承接词组 |', '|---|---|',
].join('\n')

test('the tracker table is rewritten cell by cell: unread sources leave a cell alone, new sitemap pages get a row, other rows stay', () => {
  const pages = new Map([
    ['/', { launch: '2026-10-02（首次入库）', index: '通过（2026-10-28）', gsc: '40 / 6 / 4.0' }],
    ['/blog/a/', { launch: '2026-10-13（发布日）', index: null, gsc: null }],
    ['/tools/new/', { launch: null, index: '中性：URL is unknown to Google（2026-10-28）', gsc: '页面表无此行（未知，不是 0）' }],
  ])
  const result = updateTracker(TRACKER, pages, { launch: '日期说明', index: '收录说明', gsc: 'GSC 说明' })
  const lines = result.markdown.split('\n')
  assert.ok(lines.includes('| URL | 类型 | 主承接词 | 发布日 / 首次入库日 | 收录 | 28 天 展示 / 点击 / 位置 | 备注 |'))
  assert.ok(lines.includes('| / | 首页 | 品牌词 | 2026-10-02（首次入库） | 通过（2026-10-28） | 40 / 6 / 4.0 | 手写备注 |'))
  assert.ok(lines.includes('| /blog/a/ | 博客 | D 组：x | 2026-10-13（发布日） | 未知（2026-10-13 未检查） | 页面表无此行（未知，不是 0） |  |'))
  assert.ok(lines.includes('| /old/ | 文档 | — | 未知 | 通过（2026-10-13） | 1 / 0 / 9.0 |  |'))
  assert.ok(lines.includes('| /tools/new/ | 工具 | 未知（待填） | 未知 | 中性：URL is unknown to Google（2026-10-28） | 页面表无此行（未知，不是 0） | 脚本新增 |'))
  assert.ok(lines.includes(`${DATA_LINE_PREFIX}日期列：日期说明；收录列：收录说明；28 天列：GSC 说明；未随本次更新的行：/old/`))
  assert.deepEqual(result.added, ['/tools/new/'])
  assert.deepEqual(result.missing, ['/old/'])
  assert.equal(result.changed, 2)
  assert.ok(lines.indexOf('| /tools/new/ | 工具 | 未知（待填） | 未知 | 中性：URL is unknown to Google（2026-10-28） | 页面表无此行（未知，不是 0） | 脚本新增 |') < lines.indexOf('## 新页面'))
  assert.equal(updateTracker(result.markdown, pages, { launch: '日期说明', index: '收录说明', gsc: 'GSC 说明' }).changed, 0)
})

test('a column that was not written this run keeps its earlier note, and a date the script could not work out stays as it was', () => {
  const first = updateTracker(TRACKER, new Map([['/', { launch: '2026-10-02（首次入库）', index: '通过（2026-10-28）', gsc: '40 / 6 / 4.0' }]]), { launch: '日期说明', index: '收录说明', gsc: 'GSC 说明' }).markdown
  const second = updateTracker(first, new Map([['/', { launch: launchCell(null, null), index: null, gsc: '41 / 6 / 4.0' }]]), { launch: null, index: null, gsc: '新的 GSC 说明' })
  const lines = second.markdown.split('\n')
  assert.ok(lines.includes('| / | 首页 | 品牌词 | 2026-10-02（首次入库） | 通过（2026-10-28） | 41 / 6 / 4.0 | 手写备注 |'))
  assert.ok(lines.includes(`${DATA_LINE_PREFIX}日期列：日期说明；收录列：收录说明；28 天列：新的 GSC 说明；未随本次更新的行：/blog/a/、/old/`))
})

test('the data line says a column was never written by the script, and refuses a clause that would split it', () => {
  assert.equal(mergeDataLine(`${DATA_LINE_PREFIX}旧说明`, { launch: null, index: null, gsc: null }, []), `${DATA_LINE_PREFIX}日期列：尚未由脚本写入；收录列：尚未由脚本写入；28 天列：尚未由脚本写入；未随本次更新的行：无`)
  assert.throws(() => mergeDataLine(`${DATA_LINE_PREFIX}x`, { launch: 'a；b', index: null, gsc: null }, []), /clause/)
})

test('a tracker that does not look the way the script expects is refused, not guessed at', () => {
  assert.throws(() => updateTracker('# x\n', new Map(), 'd'), /no table/)
  assert.throws(() => updateTracker(TRACKER.replace(DATA_LINE_PREFIX, '其他：'), new Map(), 'd'), /数据（脚本写入）/)
  assert.throws(() => updateTracker(TRACKER.replace('| 收录 |', '| 状态 |'), new Map(), 'd'), /no index column/)
})

test('the summary says what was not read, shows unknown for a missing earlier snapshot, and warns when a pull was full', () => {
  const gsc = summarizeGsc({ total: [{ clicks: 6, impressions: 100, position: 72.2 }], query: [row('q', 1, 2, 3)], page: [row('https://octocrawl.dev/', 3, 30, 4.2)], date: [row('2026-10-25', 6, 100, 72)], country: [], device: [] }, 1)
  const entry = seriesEntry({ id: '2026-10-28T090500Z', takenAt: '2026-10-28T09:05:00.000Z', sourceCommit: 'abc', dirty: true, scriptSha256: 'f00', route: 'direct', window: { start: '2026-09-28', end: '2026-10-25', days: 28 }, gsc, index: null, firstParty: null, notRead: { 'URL Inspection': 'skipped with --skip-inspection' } })
  const page = renderSummary(entry, null)
  assert.match(page, /Not read\*\* \(unknown, not zero\)/)
  assert.match(page, /working tree had uncommitted changes/)
  assert.match(page, /URL Inspection: skipped/)
  assert.match(page, /\| Impressions \| 100 \| unknown \| unknown \|/)
  assert.match(page, /Row limit reached\*\* \(pages and queries\)/)
  assert.doesNotMatch(page, /## URL Inspection/)
  const next = renderSummary({ ...entry, gsc: { ...gsc, impressions: 130 } }, entry)
  assert.match(next, /\| Impressions \| 130 \| 100 \| \+30 \|/)
})

test('the command line accepts the documented options and refuses others', () => {
  assert.deepEqual(parseArgs([]), { days: 28, sitemap: 'https://octocrawl.dev/sitemap.xml', out: null, skipFirstParty: false, skipInspection: false, updateTracker: false })
  const options = parseArgs(['--days', '14', '--skip-inspection', '--skip-first-party', '--update-tracker', '--out', '/tmp/x'])
  assert.equal(options.days, 14)
  assert.equal(options.skipInspection && options.skipFirstParty && options.updateTracker, true)
  assert.equal(options.out, '/tmp/x')
  assert.throws(() => parseArgs(['--days']), /needs a value/)
  assert.throws(() => parseArgs(['--nope']), /unknown option/)
})

test('the series is read line by line, and a line that is not JSON is counted instead of failing the run', () => {
  const { entries, bad } = readSeries('{"id":"a"}\nnot json\n\n{"id":"b"}\n')
  assert.deepEqual(entries.map(entry => entry.id), ['a', 'b'])
  assert.equal(bad, 1)
})

test('each source is compared with its own latest earlier reading: a snapshot that skipped a source is not the one to compare with', () => {
  const entries = [
    { id: 'a', window: { days: 28 }, gsc: { impressions: 1 }, index: { read: 29 } },
    { id: 'b', window: { days: 14 }, gsc: { impressions: 2 }, index: null },
    { id: 'c', window: { days: 28 }, gsc: { impressions: 3 }, index: null },
    { id: 'd', window: { days: 28 }, gsc: { impressions: 4 }, index: { read: 0, urls: 29 } },
  ]
  assert.deepEqual(previousFor(entries, 28), { gsc: { impressions: 4 }, index: { read: 29 }, indexId: 'a' })
  assert.deepEqual(previousFor(entries, 14), { gsc: { impressions: 2 }, index: { read: 29 }, indexId: 'a' })
  assert.deepEqual(previousFor(entries, 7), { gsc: null, index: { read: 29 }, indexId: 'a' })
  assert.deepEqual(previousFor([], 28), { gsc: null, index: null, indexId: null })
})

test('index changes compare verdicts only, skip URLs that were not read last time, and say nothing without an earlier pass', () => {
  const now = new Map([
    ['/same/', { inspection: { verdict: 'PASS' } }],
    ['/moved/', { inspection: { verdict: 'FAIL', coverageState: 'Crawled - currently not indexed' } }],
    ['/unread-before/', { inspection: { verdict: 'PASS' } }],
    ['/unread-now/', { error: 'quota' }],
    ['/new/', { inspection: { verdict: 'PASS' } }],
  ])
  const before = new Map([['/same/', 'PASS'], ['/moved/', 'PASS'], ['/unread-before/', null], ['/unread-now/', 'PASS'], ['/gone/', 'PASS']])
  assert.deepEqual(indexChanges(now, before), ['/moved/: PASS to FAIL (Crawled - currently not indexed)', '/new/: new in the sitemap', '/gone/: no longer in the sitemap'])
  assert.deepEqual(indexChanges(now, null), [])
})

test('the summary says whether the index status was compared, and with what', () => {
  const gsc = summarizeGsc({ total: [{ clicks: 1, impressions: 2, position: 3 }], query: [], page: [], date: [], country: [], device: [] }, 5000)
  const index = { urls: 29, read: 29, notRead: 0, pass: 27, neutral: 2, fail: 0, other: 0 }
  const entry = seriesEntry({ id: 'x', takenAt: 't', sourceCommit: 'abc', dirty: false, scriptSha256: 'f00', route: 'direct', window: { start: 'a', end: 'b', days: 28 }, gsc, index, firstParty: null, notRead: {} })
  assert.match(renderSummary(entry, null, { indexCompare: { since: 'earlier', changes: [] } }), /No verdict changed since earlier\./)
  assert.match(renderSummary(entry, null, { indexCompare: { since: 'earlier', changes: ['/a/: PASS to FAIL'] } }), /Changed since earlier:\n- \/a\/: PASS to FAIL/)
  assert.match(renderSummary(entry, null, { indexCompare: { note: 'earlier has no inspection.json' } }), /Not compared with an earlier pass: earlier has no inspection\.json\./)
  assert.doesNotMatch(renderSummary(entry, null, {}), /verdict changed|Not compared/)
})

test('a new series line goes on its own line even when the file ends in a truncated one', () => {
  const entry = { id: 'new' }
  assert.equal(seriesAppend('', entry), '{"id":"new"}\n')
  assert.equal(seriesAppend('{"id":"a"}\n', entry), '{"id":"new"}\n')
  const glued = '{"id":"a"}\n{"id":"b","tak' + seriesAppend('{"id":"a"}\n{"id":"b","tak', entry)
  const { entries, bad } = readSeries(glued)
  assert.deepEqual(entries.map(e => e.id), ['a', 'new'])
  assert.equal(bad, 1)
})

test('the command line refuses a tracker rewrite on another window before it touches the network or creates a snapshot', () => {
  const out = mkdtempSync(join(tmpdir(), 'seo-snapshot-test-'))
  try {
    const script = fileURLToPath(new URL('./snapshot.mjs', import.meta.url))
    const run = spawnSync(process.execPath, [script, '--update-tracker', '--days', '14', '--out', out], { encoding: 'utf8', timeout: 20_000 })
    assert.equal(run.status, 1)
    assert.match(run.stderr, /needs the default --days 28/)
    assert.equal(existsSync(join(out, 'snapshots')), false)
    assert.equal(existsSync(join(out, 'series.jsonl')), false)
  } finally { rmSync(out, { recursive: true, force: true }) }
})

test('a source label is an AI assistant when its utm_source or its referrer host is on the documented lists', () => {
  for (const [label, name] of [['utm_source=chatgpt.com', 'ChatGPT'], ['UTM_SOURCE=ChatGPT', 'ChatGPT'], ['chatgpt.com', 'ChatGPT'], ['chat.openai.com', 'ChatGPT'], ['claude.ai', 'Claude'], ['utm_source=claude', 'Claude'], ['perplexity.ai', 'Perplexity'], ['www.perplexity.ai', 'Perplexity'], ['gemini.google.com', 'Gemini'], ['utm_source=copilot', 'Copilot'], ['copilot.microsoft.com', 'Copilot'], ['chat.deepseek.com', 'DeepSeek'], ['grok.com', 'Grok'], ['you.com', 'Other assistants'], ['phind.com', 'Other assistants']]) assert.equal(assistantOf(label), name, label)
  for (const label of ['google.com', 'news.ycombinator.com', 'github.com', 'utm_source=devto', 'utm_source=google.com', '(none: direct, or the referrer was withheld)', 'chatgpt.com.evil.example', 'notclaude.ai']) assert.equal(assistantOf(label), null, label)
})

test('AI-assistant page views are summed per assistant and in total as a floor, with the share of all page views', () => {
  const sources = [
    { source: '(none: direct, or the referrer was withheld)', views: 62, visitorDays: 29 },
    { source: 'utm_source=chatgpt.com', views: 27, visitorDays: 23 },
    { source: 'chatgpt.com', views: 3, visitorDays: 2 },
    { source: 'claude.ai', views: 2, visitorDays: 2 },
    { source: 'google.com', views: 1, visitorDays: 1 },
  ]
  const result = summarizeAiReferrals(sources, 95)
  assert.equal(result.views, 32)
  assert.equal(result.visitorDays, 27)
  assert.equal(result.viewShare, 32 / 95)
  assert.deepEqual(result.assistants, [
    { name: 'ChatGPT', views: 30, visitorDays: 25, sources: ['utm_source=chatgpt.com', 'chatgpt.com'] },
    { name: 'Claude', views: 2, visitorDays: 2, sources: ['claude.ai'] },
  ])
  assert.deepEqual(summarizeAiReferrals([], 0), { views: 0, visitorDays: 0, viewShare: null, assistants: [] })
})

test('the summary shows the AI-assistant views as at least, and the ChatGPT tag share by day, or says it is unknown', () => {
  const base = { id: 'x', takenAt: 't', sourceCommit: 'abc', dirty: false, scriptSha256: 'f00', route: 'direct', window: { start: 'a', end: 'b', days: 28 }, gsc: null, index: null, notRead: {} }
  const ai = summarizeAiReferrals([{ source: 'utm_source=chatgpt.com', views: 27, visitorDays: 23 }], 90)
  const withTag = renderSummary(seriesEntry({ ...base, firstParty: { days: 7, pageViews: 90, visitorDays: 49, ai, chatgptTag: { views: 30, tagged: 27, taggedShare: 0.9, byDay: [['2026-10-20', 10, 9], ['2026-10-21', 20, 18]] } } }), null)
  assert.match(withTag, /From AI assistants \(at least; a visit with no referrer and no tag counts as direct\): 27 page views \(30\.00% of all\): ChatGPT 27 views, 23 visitor-days\./)
  assert.match(withTag, /ChatGPT utm tag: 27 of 30 ChatGPT page views carry utm_source=chatgpt\.com \(90\.00%\); by day \(views, tagged\): 2026-10-20 10, 9; 2026-10-21 20, 18\./)
  const none = renderSummary(seriesEntry({ ...base, firstParty: { days: 7, pageViews: 90, visitorDays: 49, ai: summarizeAiReferrals([], 90), chatgptTag: { views: 0, tagged: 0, taggedShare: null, byDay: [] } } }), null)
  assert.match(none, /From AI assistants \(at least; .*\): 0 page views \(0\.00% of all\)\./)
  assert.match(none, /no ChatGPT page views in the window, so the tagged share is unknown/)
  const older = renderSummary(seriesEntry({ ...base, firstParty: { days: 7, pageViews: 90, visitorDays: 49 } }), null)
  assert.doesNotMatch(older, /AI assistants|utm tag/)
})
