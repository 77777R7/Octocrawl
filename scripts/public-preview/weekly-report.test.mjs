import test from 'node:test'
import assert from 'node:assert/strict'
import { DIRECT, parseArgs, renderReport, reportWindow, routeOf, summarizeHostedRequests, summarizeQuotaDocs, summarizeSiteEvents, summarizeWaitlist } from './weekly-report.mjs'

const view = (timestamp, vid, props, extra = {}) => ({ event: 'w2l_web_event', name: 'page_view', timestamp, vid, props, automated: false, ...extra })

test('site visitors are browsers per UTC day, without automated or internal lines, by referrer and utm_source', () => {
  const summary = summarizeSiteEvents([
    view('2026-10-09T10:00:00Z', 'a', { path: '/' }),
    view('2026-10-09T11:00:00Z', 'a', { path: '/', from: 'blog-web-scraping-for-rag' }),
    view('2026-10-10T09:00:00Z', 'a', { path: '/', ref: 'news.ycombinator.com' }),
    view('2026-10-10T09:30:00Z', 'b', { path: '/', utm_source: 'devto' }),
    view('2026-10-10T09:40:00Z', 'c', { path: '/' }, { automated: true }),
    view('2026-10-10T09:50:00Z', 'd', { path: '/' }, { internal: true }),
    { event: 'w2l_web_event', name: 'link_click', timestamp: '2026-10-10T09:31:00Z', vid: 'b', props: {} },
    { event: 'w2l_preview', status: 'success', timestamp: '2026-10-10T09:32:00Z', vid: 'b' },
  ])
  assert.equal(summary.pageViews, 4)
  assert.equal(summary.visitorDays, 3)
  assert.deepEqual(summary.perDay, [['2026-10-09', 1], ['2026-10-10', 2]])
  assert.deepEqual(summary.sources, [
    { source: DIRECT, views: 2, visitorDays: 1 },
    { source: 'news.ycombinator.com', views: 1, visitorDays: 1 },
    { source: 'utm_source=devto', views: 1, visitorDays: 1 },
  ])
  assert.deepEqual(summary.paths, [['/', 4]])
  assert.deepEqual(summary.fromTags, [['blog-web-scraping-for-rag', 1]])
  assert.deepEqual(summary.actions, [['link_click', 1]])
  assert.deepEqual(summary.previews, [['success', 1]])
})

test('hosted requests are grouped by route and status class, from the run.app request URL', () => {
  assert.equal(routeOf('https://octocrawl-api-1.asia-southeast1.run.app/mcp'), '/mcp')
  assert.equal(routeOf('https://x.run.app/v1/scrapes/abc'), '/v1/scrapes/:id')
  assert.equal(routeOf('https://x.run.app/.well-known/mcp/server-card.json'), 'health and discovery')
  assert.equal(routeOf('https://x.run.app/.env'), 'other paths')
  assert.equal(routeOf('not a url'), 'other paths')
  assert.deepEqual(summarizeHostedRequests([
    { timestamp: '2026-10-09T01:00:00Z', requestUrl: 'https://x.run.app/mcp', status: 200, userAgent: 'claude-code/2.1' },
    { timestamp: '2026-10-10T01:00:00Z', requestUrl: 'https://x.run.app/mcp', status: 406, userAgent: 'curl/8' },
    { timestamp: '2026-10-10T02:00:00Z', requestUrl: 'https://x.run.app/v1/scrape', status: 502, userAgent: 'node' },
  ]), [
    { route: '/mcp', requests: 2, ok: 1, clientErrors: 1, serverErrors: 0, userAgents: 2, activeDays: 2 },
    { route: '/v1/scrape', requests: 1, ok: 0, clientErrors: 0, serverErrors: 1, userAgents: 1, activeDays: 1 },
  ])
})

test('quota documents count distinct callers per day and kind, ignoring other names', () => {
  const base = 'projects/p/databases/(default)/documents/hostedQuotas/'
  assert.deepEqual(summarizeQuotaDocs([`${base}2026-10-10-keyless-aa`, `${base}2026-10-10-keyless-bb`, `${base}2026-10-10-key-cc`, `${base}2026-10-09-keyless-aa`, `${base}site-total`]), [
    { day: '2026-10-09', kind: 'keyless', callers: 1 },
    { day: '2026-10-10', kind: 'key', callers: 1 },
    { day: '2026-10-10', kind: 'keyless', callers: 2 },
  ])
})

test('waitlist entries are counted in the window by entry point and referrer', () => {
  const summary = summarizeWaitlist([
    { role: 'developer', trigger: 'footer', ref: 'news.ycombinator.com', createdAt: '2026-10-09T00:00:00.000Z' },
    { role: 'researcher', trigger: 'quota', ref: null, createdAt: '2026-09-01T00:00:00.000Z' },
    { role: 'developer', trigger: 'limits', ref: null, createdAt: '2026-10-10T08:00:00.000Z' },
  ], '2026-10-03T00:00:00.000Z', '2026-10-10T00:00:00.000Z')
  assert.equal(summary.total, 3)
  assert.equal(summary.recent, 1)
  assert.deepEqual(summary.byTrigger, [['footer', 1]])
  assert.deepEqual(summary.byRef, [['news.ycombinator.com', 1]])
})

test('a source that could not be read says so, and is never shown as zero', () => {
  const failed = { error: 'gcloud answered 403' }
  const page = renderReport({
    window: { days: 7, start: '2026-10-03', end: '2026-10-10', generatedAt: '2026-10-10 14:00' },
    site: failed, waitlist: failed, hosted: failed, quotas: failed, github: failed, npm: failed, pypi: failed, google: failed, bing: failed,
  })
  assert.equal(page.match(/Not read: gcloud answered 403/g)?.length, 9)
  assert.doesNotMatch(page, /\b0 page views|\b0 clicks|\b0 new/)
})

test('the window is whole UTC days ending yesterday, the same for every source', () => {
  const span = reportWindow(7, new Date('2026-10-10T14:12:00Z'))
  assert.equal(span.start, '2026-10-03')
  assert.equal(span.end, '2026-10-09')
  assert.equal(span.since, '2026-10-03T00:00:00.000Z')
  assert.equal(span.until, '2026-10-10T00:00:00.000Z')
  assert.equal(reportWindow(1, new Date('2026-10-10T00:00:00Z')).start, '2026-10-09')
})

test('arguments are read strictly: a missing value or an unknown flag is refused', () => {
  assert.deepEqual(parseArgs([]), { days: 7, out: null, json: false })
  assert.deepEqual(parseArgs(['--days', '14', '--out', 'r.md']), { days: 14, out: 'r.md', json: false })
  assert.deepEqual(parseArgs(['--days=3', '--out=r.md', '--json']), { days: 3, out: 'r.md', json: true })
  assert.throws(() => parseArgs(['--out']), /needs a value/)
  assert.throws(() => parseArgs(['--out', '--json']), /needs a value/)
  assert.throws(() => parseArgs(['--days', '30']), /1 to 29/)
  assert.throws(() => parseArgs(['--weeks', '2']), /Unknown argument/)
})
