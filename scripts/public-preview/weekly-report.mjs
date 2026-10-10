#!/usr/bin/env node
// A weekly traffic report for octocrawl.dev and hosted Octocrawl, as one Markdown page: where visitors came from, what
// the hosted API and MCP served, sign-ups, GitHub, package downloads and search. Counts only; it prints no address, IP,
// key or visitor id.
//
//   node scripts/public-preview/weekly-report.mjs                 the last 7 days, printed
//   node scripts/public-preview/weekly-report.mjs --days 14       another window (1 to 30 days)
//   node scripts/public-preview/weekly-report.mjs --out FILE      also writes the page to FILE (e.g. under .w2l/reports/)
//   node scripts/public-preview/weekly-report.mjs --json          the collected numbers as JSON instead
//
// It reads Cloud Logging and Firestore with the local gcloud login and needs W2L_PROJECT_ID; GitHub through `gh`;
// npm and PyPI from their public APIs. Search Console is read with the gcloud application-default login when it has
// the webmasters.readonly scope, and Bing when BING_WEBMASTER_API_KEY is set; otherwise those rows say why they were not
// read. Behind a proxy, run it with NODE_USE_ENV_PROXY=1 so Node's own requests use HTTPS_PROXY (gcloud and gh do
// already). A source that cannot be read is reported as not read, never as zero.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SITE_SERVICE = 'w2l-public-preview'
export const API_SERVICE = 'octocrawl-api'
export const REPO = '77777R7/Octocrawl'
export const NPM_PACKAGES = ['octocrawl', '@octocrawl/cli', '@octocrawl/mcp', '@octocrawl/sdk']
export const PYPI_PACKAGE = 'octocrawl-client'
export const SITE = 'https://octocrawl.dev/'
export const DIRECT = '(none: direct, or the referrer was withheld)'

const day = timestamp => String(timestamp).slice(0, 10)
const sortedCounts = (counts, limit = 15) => [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit)

/** Site page events (`w2l_web_event`, `w2l_preview` lines' jsonPayload plus timestamp) as visitor counts. A visitor is
 * one `vid` on one UTC day, since `vid` changes every day: a week's "visitor-days" counts a person once per day they came.
 * Lines marked automated or internal are left out here too, whatever the query asked for. */
export function summarizeSiteEvents(lines) {
  const kept = lines.filter(line => line.automated !== true && line.internal !== true)
  const views = kept.filter(line => line.event === 'w2l_web_event' && line.name === 'page_view')
  const visitorDays = new Set(views.filter(line => line.vid).map(line => `${day(line.timestamp)}:${line.vid}`))
  const perDay = new Map()
  for (const key of visitorDays) perDay.set(key.slice(0, 10), (perDay.get(key.slice(0, 10)) ?? 0) + 1)
  const sources = new Map()
  const paths = new Map()
  for (const line of views) {
    const props = line.props ?? {}
    const source = props.ref ? props.ref : props.utm_source ? `utm_source=${props.utm_source}` : DIRECT
    const entry = sources.get(source) ?? { views: 0, visitors: new Set() }
    entry.views += 1
    if (line.vid) entry.visitors.add(`${day(line.timestamp)}:${line.vid}`)
    sources.set(source, entry)
    paths.set(props.path ?? '(unknown)', (paths.get(props.path ?? '(unknown)') ?? 0) + 1)
  }
  const actions = new Map()
  for (const line of kept) if (line.event === 'w2l_web_event' && line.name !== 'page_view') actions.set(line.name, (actions.get(line.name) ?? 0) + 1)
  const previews = new Map()
  for (const line of kept) if (line.event === 'w2l_preview') previews.set(line.status ?? '(unknown)', (previews.get(line.status ?? '(unknown)') ?? 0) + 1)
  return {
    pageViews: views.length,
    visitorDays: visitorDays.size,
    perDay: [...perDay].sort(([a], [b]) => a.localeCompare(b)),
    sources: [...sources].map(([source, entry]) => ({ source, views: entry.views, visitorDays: entry.visitors.size }))
      .sort((a, b) => b.visitorDays - a.visitorDays || b.views - a.views || a.source.localeCompare(b.source)),
    paths: sortedCounts(paths),
    actions: sortedCounts(actions),
    previews: sortedCounts(previews),
  }
}

/** The hosted API's route for a Cloud Run request URL (the run.app address the Cloudflare Worker forwards to). */
export function routeOf(url) {
  let path
  try { path = new URL(url).pathname } catch { return 'other paths' }
  if (path === '/mcp' || path.startsWith('/mcp/')) return '/mcp'
  if (path === '/v1/scrape') return '/v1/scrape'
  if (path === '/v1/map') return '/v1/map'
  if (path.startsWith('/v1/scrapes/')) return '/v1/scrapes/:id'
  if (path.startsWith('/v1/maps/')) return '/v1/maps/:id'
  if (path === '/health' || path.startsWith('/.well-known/')) return 'health and discovery'
  return 'other paths'
}

/** Cloud Run request-log lines (`httpRequest` plus timestamp) per route. The log keeps no caller id (its IP is
 * Cloudflare's), so distinct user agents are the only per-client signal, and a coarse one. */
export function summarizeHostedRequests(requests) {
  const routes = new Map()
  for (const request of requests) {
    const route = routeOf(request.requestUrl)
    const entry = routes.get(route) ?? { requests: 0, ok: 0, clientErrors: 0, serverErrors: 0, agents: new Set(), days: new Set() }
    const status = Number(request.status)
    entry.requests += 1
    if (status >= 200 && status < 400) entry.ok += 1
    else if (status >= 400 && status < 500) entry.clientErrors += 1
    else if (status >= 500) entry.serverErrors += 1
    if (request.userAgent) entry.agents.add(request.userAgent)
    entry.days.add(day(request.timestamp))
    routes.set(route, entry)
  }
  return [...routes].map(([route, entry]) => ({ route, requests: entry.requests, ok: entry.ok, clientErrors: entry.clientErrors, serverErrors: entry.serverErrors, userAgents: entry.agents.size, activeDays: entry.days.size }))
    .sort((a, b) => b.requests - a.requests || a.route.localeCompare(b.route))
}

/** Firestore `hostedQuotas` document names (`{UTC day}-{key|keyless}-{caller hash}`, written when a scrape or map
 * starts, deleted two days on) as distinct callers per day and kind. */
export function summarizeQuotaDocs(names) {
  const seen = new Map()
  for (const name of names) {
    const match = /(\d{4}-\d{2}-\d{2})-(key|keyless)-([^/]+)$/.exec(name)
    if (!match) continue
    const key = `${match[1]} ${match[2]}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen].map(([key, callers]) => ({ day: key.slice(0, 10), kind: key.slice(11), callers })).sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind))
}

/** Waitlist entries (role, trigger, ref, createdAt) created in the window, by entry point and referrer; no addresses. */
export function summarizeWaitlist(entries, since, until) {
  const recent = entries.filter(entry => entry.createdAt && entry.createdAt >= since && entry.createdAt < until)
  const by = key => sortedCounts(recent.reduce((counts, entry) => counts.set(entry[key] ?? '(none)', (counts.get(entry[key] ?? '(none)') ?? 0) + 1), new Map()))
  return { total: entries.length, recent: recent.length, byTrigger: by('trigger'), byRef: by('ref'), byRole: by('role') }
}

export function markdownTable(headers, rows) {
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [`| ${headers.map(cell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n')
}

const notRead = section => `Not read: ${section.error}`

/** The report's window: the `days` whole UTC days that end yesterday, so every source counts the same days and none
 * counts a partial today. `end` is inclusive; `until` is the first instant after it. */
export function reportWindow(days, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const iso = ms => new Date(ms).toISOString()
  return { days, start: iso(today - days * 86_400_000).slice(0, 10), end: iso(today - 86_400_000).slice(0, 10), since: iso(today - days * 86_400_000), until: iso(today), generatedAt: iso(now.getTime()).slice(0, 16).replace('T', ' ') }
}

/** `--days N`, `--days=N`, `--out FILE`, `--out=FILE`, `--json`; anything else, or a flag without its value, is refused. */
export function parseArgs(argv) {
  const options = { days: 7, out: null, json: false }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s)
    const value = () => { const next = inline ?? argv[++i]; if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`); return next }
    if (flag === '--json' && inline === undefined) options.json = true
    else if (flag === '--days') options.days = Number(value())
    else if (flag === '--out') options.out = value()
    else throw new Error(`Unknown argument ${argv[i]} (use --days N, --out FILE, --json)`)
  }
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 29) throw new Error('--days takes a whole number from 1 to 29 (Cloud Logging keeps 30 days, and the window ends yesterday)')
  return options
}

/** The report page from the collected sections. Each section is `{ value }` or `{ error }`. */
export function renderReport(report) {
  const { window: span, site, hosted, quotas, waitlist, github, npm, pypi, google, bing } = report
  const out = [`# Octocrawl traffic, ${span.start} to ${span.end} (UTC)`, '', `${span.days} whole UTC days ending yesterday, generated ${span.generatedAt}. Visitors are visitor-days: one browser on one UTC day. Automated lines (crawlers, headless browsers, Lighthouse) and internal ones (the operator's browsers, the Claude app) are left out.`, '']
  out.push('## Site visitors', '')
  if (site.error) out.push(notRead(site), '')
  else {
    const s = site.value
    out.push(`${s.pageViews} page views from ${s.visitorDays} visitor-days.`, '')
    out.push(markdownTable(['Day', 'Visitors'], s.perDay), '')
    out.push('### Where they came from', '', markdownTable(['Source', 'Visitor-days', 'Page views'], s.sources.map(r => [r.source, r.visitorDays, r.views])), '')
    out.push('### Pages', '', markdownTable(['Path', 'Page views'], s.paths), '')
    out.push('### What they did', '', s.actions.length ? markdownTable(['Event', 'Count'], s.actions) : 'No events besides page views.', '')
    out.push('### Previews', '', s.previews.length ? markdownTable(['Outcome', 'Count'], s.previews) : 'No anonymous previews.', '')
  }
  out.push('## Sign-ups (waitlist)', '')
  if (waitlist.error) out.push(notRead(waitlist), '')
  else {
    const w = waitlist.value
    out.push(`${w.recent} new in the window, ${w.total} in all.`, '')
    if (w.recent) out.push(markdownTable(['Entry point', 'New'], w.byTrigger), '', markdownTable(['Referrer', 'New'], w.byRef), '')
  }
  out.push('## Hosted API and MCP', '')
  if (hosted.error) out.push(notRead(hosted), '')
  else out.push(hosted.value.length ? markdownTable(['Route', 'Requests', '2xx/3xx', '4xx', '5xx', 'User agents', 'Days with requests'], hosted.value.map(r => [r.route, r.requests, r.ok, r.clientErrors, r.serverErrors, r.userAgents, r.activeDays])) : 'No requests.', '', 'The request log keeps no caller id (its IP is Cloudflare\'s), so these are requests, not people. Distinct user agents are a rough upper bound on client kinds, not on callers. Other paths are mostly `/`, `robots.txt` and scanners probing for `.env` or `.git` files.', '')
  out.push('### Distinct scrape and map callers (Firestore, last two days only)', '')
  if (quotas.error) out.push(notRead(quotas), '')
  else out.push(quotas.value.length ? markdownTable(['Day', 'Kind', 'Callers'], quotas.value.map(r => [r.day, r.kind, r.callers])) : 'None.', '', 'Quota records are deleted two days after their day, so a week of callers needs this report run daily, or a per-day counter in the service.', '')
  out.push('## GitHub', '')
  if (github.error) out.push(notRead(github), '')
  else {
    const g = github.value
    out.push(markdownTable(['Stars', 'Forks', 'Views in the window', 'Unique viewers (per day, summed)', 'Clones in the window'], [[g.stars, g.forks, g.views, g.uniqueViewers, g.clones]]), '')
    out.push('Referrers over GitHub\'s last 14 days:', '', g.referrers.length ? markdownTable(['Referrer', 'Views', 'Unique'], g.referrers) : 'None.', '')
  }
  out.push('## Package downloads', '')
  if (npm.error) out.push(notRead(npm), '')
  else out.push(markdownTable(['npm package', 'Downloads in the window'], npm.value), '')
  out.push(pypi.error ? notRead(pypi) : `PyPI \`${PYPI_PACKAGE}\`: ${pypi.value.lastWeek} downloads in pypistats' last week (its own window, without mirrors).`, '', 'Downloads include our own CI and installs; they show interest, not users.', '')
  out.push('## Search', '')
  if (google.error) out.push(`Google Search Console. ${notRead(google)}`, '')
  else {
    const g = google.value
    out.push(`Google: ${g.clicks} clicks, ${g.impressions} impressions, average position ${g.position ?? 'n/a'} (Search Console data lags two to three days).`, '')
    if (g.queries.length) out.push(markdownTable(['Query', 'Clicks', 'Impressions', 'Position'], g.queries), '')
    if (g.pages.length) out.push(markdownTable(['Page', 'Clicks', 'Impressions'], g.pages), '')
  }
  out.push(bing.error ? `Bing Webmaster. ${notRead(bing)}` : `Bing: ${bing.value.clicks} clicks, ${bing.value.impressions} impressions.`, '')
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading the sources. Each returns a value or throws; main() turns a throw into "not read".

function gcloudJson(args) {
  const text = execFileSync('gcloud', [...args, '--format=json'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  return JSON.parse(text || '[]')
}

const LOG_LIMIT = 200_000
function readLogs(project, filter, span) {
  const lines = gcloudJson(['logging', 'read', `${filter} AND timestamp>="${span.since}" AND timestamp<"${span.until}"`, `--project=${project}`, `--limit=${LOG_LIMIT}`, '--order=asc'])
  if (lines.length >= LOG_LIMIT) throw new Error(`more than ${LOG_LIMIT} log lines in the window; shorten --days`)
  return lines
}

async function getJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`)
  return response.json()
}

async function firestoreList(project, collection) {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}`
  const documents = []
  for (let pageToken = ''; ;) {
    const page = await getJson(`${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers: { authorization: `Bearer ${token}` } })
    documents.push(...(page.documents ?? []))
    if (!page.nextPageToken) return documents
    pageToken = page.nextPageToken
  }
}

async function readGithub(span) {
  const gh = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }))
  const repo = gh(`repos/${REPO}`)
  const views = gh(`repos/${REPO}/traffic/views`).views.filter(v => day(v.timestamp) >= span.start && day(v.timestamp) <= span.end)
  const clones = gh(`repos/${REPO}/traffic/clones`).clones.filter(v => day(v.timestamp) >= span.start && day(v.timestamp) <= span.end)
  const referrers = gh(`repos/${REPO}/traffic/popular/referrers`).map(r => [r.referrer, r.count, r.uniques])
  return { stars: repo.stargazers_count, forks: repo.forks_count, views: views.reduce((n, v) => n + v.count, 0), uniqueViewers: views.reduce((n, v) => n + v.uniques, 0), clones: clones.reduce((n, v) => n + v.count, 0), referrers }
}

async function readGoogle(startDay, endDay) {
  let token
  try { token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { throw new Error('no gcloud application-default login. Run: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform') }
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent('sc-domain:octocrawl.dev')}/searchAnalytics/query`
  const query = body => getJson(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(process.env.W2L_PROJECT_ID ? { 'x-goog-user-project': process.env.W2L_PROJECT_ID } : {}) }, body: JSON.stringify({ startDate: startDay, endDate: endDay, ...body }) })
  const total = (await query({})).rows?.[0] ?? { clicks: 0, impressions: 0 }
  const queries = ((await query({ dimensions: ['query'], rowLimit: 20 })).rows ?? []).map(r => [r.keys[0], r.clicks, r.impressions, r.position.toFixed(1)])
  const pages = ((await query({ dimensions: ['page'], rowLimit: 20 })).rows ?? []).map(r => [r.keys[0].replace(SITE, '/'), r.clicks, r.impressions])
  return { clicks: total.clicks, impressions: total.impressions, position: total.position?.toFixed(1), queries, pages }
}

async function readBing(span) {
  const key = process.env.BING_WEBMASTER_API_KEY
  if (!key) throw new Error('BING_WEBMASTER_API_KEY is not set (Bing Webmaster Tools, Settings, API access)')
  const data = await getJson(`https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(SITE)}&apikey=${encodeURIComponent(key)}`)
  const rows = (data.d ?? []).filter(row => { const date = new Date(Number(/\d+/.exec(row.Date)?.[0])).toISOString().slice(0, 10); return date >= span.start && date <= span.end })
  return { clicks: rows.reduce((n, r) => n + (r.Clicks ?? 0), 0), impressions: rows.reduce((n, r) => n + (r.Impressions ?? 0), 0) }
}

async function settle(work) {
  try { return { value: await work() } } catch (error) { return { error: error instanceof Error ? error.message.split('\n')[0] : String(error) } }
}

async function main(argv) {
  const options = parseArgs(argv)
  const project = process.env.W2L_PROJECT_ID
  if (!project) throw new Error('Set W2L_PROJECT_ID to the Google Cloud project of the public preview and the hosted API')
  const span = reportWindow(options.days)

  const report = { window: span }
  report.site = await settle(() => summarizeSiteEvents(readLogs(project, `resource.type="cloud_run_revision" AND resource.labels.service_name="${SITE_SERVICE}" AND (jsonPayload.event="w2l_web_event" OR jsonPayload.event="w2l_preview")`, span)
    .map(entry => ({ ...entry.jsonPayload, timestamp: entry.timestamp }))))
  report.waitlist = await settle(async () => summarizeWaitlist((await firestoreList(project, 'waitlist')).map(doc => {
    const f = doc.fields ?? {}
    const text = field => field?.stringValue ?? null
    return { role: text(f.role), trigger: text(f.trigger), ref: text(f.ref), createdAt: f.createdAtMs?.integerValue ? new Date(Number(f.createdAtMs.integerValue)).toISOString() : null }
  }), span.since, span.until))
  report.hosted = await settle(() => summarizeHostedRequests(readLogs(project, `resource.type="cloud_run_revision" AND resource.labels.service_name="${API_SERVICE}" AND logName="projects/${project}/logs/run.googleapis.com%2Frequests"`, span)
    .map(entry => ({ timestamp: entry.timestamp, ...(entry.httpRequest ?? {}) }))))
  report.quotas = await settle(async () => summarizeQuotaDocs((await firestoreList(project, 'hostedQuotas')).map(doc => doc.name)))
  report.github = await settle(() => readGithub(span))
  report.npm = await settle(async () => Promise.all(NPM_PACKAGES.map(async name => [name, (await getJson(`https://api.npmjs.org/downloads/point/${span.start}:${span.end}/${name}`)).downloads])))
  report.pypi = await settle(async () => ({ lastWeek: (await getJson(`https://pypistats.org/api/packages/${PYPI_PACKAGE}/recent`)).data.last_week }))
  report.google = await settle(() => readGoogle(span.start, span.end))
  report.bing = await settle(() => readBing(span))

  const page = options.json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report)
  process.stdout.write(page)
  if (options.out) { mkdirSync(dirname(options.out), { recursive: true }); writeFileSync(options.out, page) }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
