#!/usr/bin/env node
// One SEO snapshot of octocrawl.dev, kept by date so that a week's numbers can be compared with the last: Search
// Console (totals, queries, pages, days, countries, devices), the index status of every sitemap URL (URL Inspection),
// and the site's own analytics (the weekly report). Each snapshot is a folder with the raw answers, a summary page and
// its place in a series file; the page tracker (docs/seo/library/page-tracker.md) can be rewritten from it.
//
//   node scripts/seo/snapshot.mjs                    a 28-day Search Console window, the sitemap's index status, the site's last 7 days
//   node scripts/seo/snapshot.mjs --update-tracker   also rewrite the date, index and 28-day cells of docs/seo/library/page-tracker.md
//                                                    (only with the default 28-day window, a full clone and a sitemap on https://octocrawl.dev)
//   node scripts/seo/snapshot.mjs --days 14          another Search Console window (1 to 480 days; its numbers are not compared with a 28-day snapshot)
//   node scripts/seo/snapshot.mjs --skip-inspection  leave out URL Inspection (one call per sitemap URL; the API allows 2,000 a day)
//   node scripts/seo/snapshot.mjs --skip-first-party leave out the site's own analytics
//   node scripts/seo/snapshot.mjs --out DIR          keep snapshots under DIR (default: W2L_SEO_DIR, else .w2l/seo of the main checkout)
//   node scripts/seo/snapshot.mjs --sitemap URL      another sitemap (default https://octocrawl.dev/sitemap.xml)
//
// Search Console and URL Inspection use the gcloud application-default login with the webmasters.readonly scope; set
// W2L_PROJECT_ID to the Google Cloud project that has the Search Console API enabled (sent as x-goog-user-project). The
// site's analytics need W2L_PROJECT_ID and the local gcloud login too (scripts/public-preview/weekly-report.mjs).
// Behind a proxy, run with NODE_USE_ENV_PROXY=1 so Node's own requests use HTTPS_PROXY; the snapshot says whether it ran
// proxied or direct. A source that cannot be read is recorded as not read with its reason, never as zero.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  GSC_SITE, SITE_ORIGIN, canonicalPath, describeInspection, gscWindow, indexChanges, indexCell, launchCell, pagesByPath,
  parseSitemap, previousFor, readSeries, renderSummary, seriesAppend, seriesEntry, snapshotId, sourceOfPath, summarizeAiReferrals,
  summarizeGsc, summarizeInspections, updateTracker,
} from './snapshot-lib.mjs'

const ROW_LIMIT = 5000
const FIRST_PARTY_DAYS = 7
const TRACKER = 'docs/seo/library/page-tracker.md'
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const QUERY_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`

export function parseArgs(argv) {
  const options = { days: 28, sitemap: `${SITE_ORIGIN}/sitemap.xml`, out: null, skipFirstParty: false, skipInspection: false, updateTracker: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => { if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`); return argv[++i] }
    if (arg === '--days') options.days = Number(value())
    else if (arg === '--sitemap') options.sitemap = value()
    else if (arg === '--out') options.out = value()
    else if (arg === '--skip-first-party') options.skipFirstParty = true
    else if (arg === '--skip-inspection') options.skipInspection = true
    else if (arg === '--update-tracker') options.updateTracker = true
    else throw new Error(`unknown option ${arg}`)
  }
  return options
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const reason = error => (error instanceof Error ? `${error.message.split('\n')[0]}${error.cause?.code ? ` (${error.cause.code})` : ''}` : String(error))

async function settle(work) {
  try { return { value: await work() } } catch (error) { return { error: reason(error) } }
}

async function request(url, init = {}, parse = 'json') {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
    if (response.ok) return parse === 'json' ? response.json() : response.text()
    const retry = (response.status === 429 || response.status >= 500) && attempt < 2
    if (!retry) throw new Error(`${new URL(url).host} answered ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`)
    await new Promise(done => setTimeout(done, 1500 * (attempt + 1)))
  }
}

function googleHeaders() {
  let token
  try { token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { throw new Error('no gcloud application-default login. Run: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform') }
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(process.env.W2L_PROJECT_ID ? { 'x-goog-user-project': process.env.W2L_PROJECT_ID } : {}) }
}

async function pullGsc(window, headers) {
  const ask = async body => (await request(QUERY_URL, { method: 'POST', headers, body: JSON.stringify({ startDate: window.start, endDate: window.end, ...body }) })).rows ?? []
  return {
    total: await ask({}),
    query: await ask({ dimensions: ['query'], rowLimit: ROW_LIMIT }),
    page: await ask({ dimensions: ['page'], rowLimit: ROW_LIMIT }),
    date: await ask({ dimensions: ['date'], rowLimit: 500 }),
    country: await ask({ dimensions: ['country'], rowLimit: 300 }),
    device: await ask({ dimensions: ['device'], rowLimit: 10 }),
  }
}

/** One URL Inspection call per sitemap URL, four at a time. Returns path -> { inspection } or { error }. */
async function inspectAll(locs, headers) {
  const results = new Map()
  let next = 0
  const worker = async () => {
    while (next < locs.length) {
      const loc = locs[next++]
      const key = canonicalPath(loc) ?? loc
      const outcome = await settle(async () => {
        const raw = await request(INSPECT_URL, { method: 'POST', headers, body: JSON.stringify({ inspectionUrl: loc, siteUrl: GSC_SITE, languageCode: 'en-US' }) })
        return { inspection: describeInspection(raw), raw }
      })
      results.set(key, outcome.error ? { error: outcome.error } : outcome.value)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return new Map([...results].sort((a, b) => a[0].localeCompare(b[0])))
}

function readFirstParty(repoRoot) {
  if (!process.env.W2L_PROJECT_ID) throw new Error('W2L_PROJECT_ID is not set')
  const script = join(repoRoot, 'scripts/public-preview/weekly-report.mjs')
  const text = execFileSync(process.execPath, [script, '--json', '--days', String(FIRST_PARTY_DAYS)], { env: process.env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 600_000, stdio: ['ignore', 'pipe', 'ignore'] })
  const report = JSON.parse(text)
  if (report.site?.error) throw new Error(`the site's page events were not read: ${report.site.error}`)
  return report
}

const byImpressions = rows => [...rows].sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
const sha8 = text => text.slice(0, 8)

/** Rewrites docs/seo/library/page-tracker.md from this snapshot; returns the line the summary shows. */
async function rewriteTracker({ repoRoot, sitemap, gscRaw, inspections, index, id, now, window, sourceCommit }) {
  const registries = {
    docsPages: (await import(pathToFileURL(join(repoRoot, 'apps/public-web/scripts/docsPages.mjs')))).pages,
    blogPosts: (await import(pathToFileURL(join(repoRoot, 'apps/public-web/scripts/blogPosts.mjs')))).posts,
  }
  const gscPages = gscRaw && gscRaw.page.length ? pagesByPath(gscRaw.page) : null
  const day = now.toISOString().slice(0, 10)
  const pages = new Map()
  for (const { loc } of sitemap) {
    const path = canonicalPath(loc)
    const source = sourceOfPath(path, registries, file => existsSync(join(repoRoot, file)))
    const days = source ? source.files.map(file => git(['log', '--follow', '--diff-filter=A', '--format=%as', '--', file], repoRoot).split('\n').filter(Boolean).at(-1)).filter(Boolean).sort() : []
    const result = inspections?.get(path)
    const stats = gscPages?.get(path)
    pages.set(path, {
      launch: launchCell(source, days[0] ?? null),
      index: result?.inspection ? indexCell(result.inspection, day) : null,
      gsc: !gscPages ? null : stats ? `${stats.impressions} / ${stats.clicks} / ${stats.position.toFixed(1)}` : '页面表无此行（未知，不是 0）',
    })
  }
  const clauses = {
    launch: `快照 ${id} 写入，博客取 blogPosts.mjs 的发布日，其余取 git 首次提交日（git log --follow，含合并前分支上的提交），源提交 ${sha8(sourceCommit)}`,
    index: index && index.read ? `${day} 读，URL Inspection ${index.read}/${index.urls} 个读到，读不到的行保持上次的值（快照 ${id}）` : null,
    gsc: gscPages ? `GSC ${window.start} 至 ${window.end}（28 天，页面表，只算 ${SITE_ORIGIN} 规范地址，# 片段和查询串并入同一页，没有这一行不等于 0，快照 ${id}）` : null,
  }
  const file = join(repoRoot, TRACKER)
  const result = updateTracker(readFileSync(file, 'utf8'), pages, clauses)
  writeFileSync(file, result.markdown)
  return `Rewrote ${TRACKER}: ${result.changed} rows changed, ${result.added.length} added${result.added.length ? ` (${result.added.join(', ')})` : ''}${result.missing.length ? `; in the tracker but not in the sitemap, left as they were: ${result.missing.join(', ')}` : ''}.${gscPages ? '' : ' The 28-day column was not rewritten: no page rows were read.'}${clauses.index ? '' : ' The index column was not rewritten: no URL was read.'}`
}

async function main(argv) {
  const options = parseArgs(argv)
  const repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd())
  const now = new Date()
  const window = gscWindow(options.days, now)
  if (options.updateTracker) {
    if (window.days !== 28) throw new Error('--update-tracker rewrites a column headed "28 天", so it needs the default --days 28')
    if (git(['rev-parse', '--is-shallow-repository'], repoRoot) === 'true') throw new Error('--update-tracker takes first-commit dates from git history, and this clone is shallow')
  }
  const mainCheckout = resolve(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], repoRoot), '..')
  const root = resolve(options.out ?? process.env.W2L_SEO_DIR ?? join(mainCheckout, '.w2l', 'seo'))
  const id = snapshotId(now)
  const dir = join(root, 'snapshots', id)
  const seriesFile = join(root, 'series.jsonl')
  const route = process.env.NODE_USE_ENV_PROXY === '1' && (process.env.HTTPS_PROXY || process.env.https_proxy) ? 'proxied (HTTPS_PROXY, NODE_USE_ENV_PROXY=1)' : 'direct'
  const sourceCommit = git(['rev-parse', 'HEAD'], repoRoot)
  const dirty = git(['status', '--porcelain'], repoRoot) !== ''
  const scriptSha256 = createHash('sha256').update(['snapshot.mjs', 'snapshot-lib.mjs'].map(name => readFileSync(join(repoRoot, 'scripts/seo', name), 'utf8')).join('\0')).digest('hex').slice(0, 12)
  const notRead = {}

  let headers = null
  const auth = await settle(async () => googleHeaders())
  if (auth.error) { notRead['Search Console'] = auth.error; notRead['URL Inspection'] = auth.error } else headers = auth.value

  let gscRaw = null, gsc = null
  if (headers) {
    const pulled = await settle(() => pullGsc(window, headers))
    if (pulled.error) notRead['Search Console'] = pulled.error
    else { gscRaw = pulled.value; gsc = summarizeGsc(gscRaw, ROW_LIMIT) }
  }

  let sitemap = null
  const fetched = await settle(async () => parseSitemap(await request(options.sitemap, {}, 'text')))
  if (fetched.error) notRead.Sitemap = fetched.error; else sitemap = fetched.value
  if (options.updateTracker && sitemap) {
    const foreign = sitemap.filter(entry => canonicalPath(entry.loc) === null).map(entry => entry.loc)
    if (foreign.length) throw new Error(`--update-tracker matches tracker rows by path on ${SITE_ORIGIN}, and the sitemap lists ${foreign.length} other address(es), e.g. ${foreign[0]}`)
  }

  let inspections = null
  if (options.skipInspection) notRead['URL Inspection'] = 'skipped with --skip-inspection'
  else if (!sitemap) notRead['URL Inspection'] ??= 'the sitemap was not read, so there is no URL list'
  else if (headers) inspections = await inspectAll(sitemap.map(entry => entry.loc), headers)

  let firstPartyRaw = null, firstParty = null
  if (options.skipFirstParty) notRead['Site analytics'] = 'skipped with --skip-first-party'
  else {
    const attempt = await settle(() => readFirstParty(repoRoot))
    if (attempt.error) notRead['Site analytics'] = attempt.error
    else {
      const site = attempt.value.site.value
      firstPartyRaw = attempt.value
      firstParty = { days: FIRST_PARTY_DAYS, pageViews: site.pageViews, visitorDays: site.visitorDays, ai: summarizeAiReferrals(site.sources, site.pageViews), chatgptTag: site.chatgptTag ?? null }
    }
  }

  const passCounts = inspections ? summarizeInspections(inspections) : null
  if (passCounts && passCounts.notRead) notRead['URL Inspection'] = `${passCounts.notRead} of ${passCounts.urls} URLs were not read: ${[...inspections].filter(([, r]) => r.error).slice(0, 3).map(([p, r]) => `${p} (${r.error.slice(0, 80)})`).join('; ')}`
  // A pass that read no URL at all is not an index reading: it stays out of the series, so it cannot become the next baseline.
  const index = passCounts && passCounts.read > 0 ? passCounts : null

  // What this snapshot is compared with. A series file or earlier snapshot that cannot be read costs the comparison, not the snapshot.
  let series = { entries: [], bad: 0 }
  try { if (existsSync(seriesFile)) series = readSeries(readFileSync(seriesFile, 'utf8')) } catch (error) { notRead['Series file'] = reason(error) }
  if (series.bad) notRead['Series file'] = `${series.bad} line(s) of ${seriesFile} are not JSON and were skipped`
  const previous = previousFor(series.entries, window.days)
  let before = null
  let compareNote = previous.indexId ? null : 'there is no earlier URL Inspection pass in the series'
  if (previous.indexId) {
    try {
      const file = join(root, 'snapshots', previous.indexId, 'inspection.json')
      if (!existsSync(file)) throw new Error(`${previous.indexId} has no inspection.json`)
      before = new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8'))).map(([path, r]) => [path, r.inspection?.verdict ?? null]))
    } catch (error) { compareNote = reason(error); notRead['Earlier index status'] = compareNote }
  }

  const entry = seriesEntry({ id, takenAt: now.toISOString(), sourceCommit, dirty, scriptSha256, route, window, gsc, index, firstParty, notRead })
  mkdirSync(join(root, 'snapshots'), { recursive: true })
  mkdirSync(dir)
  const save = (name, value) => writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`)
  if (gscRaw) save('gsc.json', gscRaw)
  if (sitemap) save('sitemap.json', sitemap)
  if (inspections) save('inspection.json', Object.fromEntries([...inspections].map(([path, r]) => [path, r.error ? { error: r.error } : { inspection: r.inspection, raw: r.raw }])))
  if (firstPartyRaw) save('first-party.json', firstPartyRaw)
  save('snapshot.json', { ...entry, command: `node scripts/seo/snapshot.mjs ${argv.join(' ')}`.trim(), node: process.version })

  // The summary and the series line are written before the tracker, so a tracker that has changed shape cannot lose them.
  const summary = renderSummary(entry, previous, {
    indexCompare: inspections ? (before ? { since: previous.indexId, changes: indexChanges(inspections, before) } : { note: compareNote }) : undefined,
    topQueries: gscRaw ? byImpressions(gscRaw.query).slice(0, 10) : [],
    topPages: gscRaw ? byImpressions(gscRaw.page).slice(0, 10) : [],
  })
  writeFileSync(join(dir, 'summary.md'), summary)
  const gotNumbers = Boolean(gsc || index || firstParty)
  if (gotNumbers) appendFileSync(seriesFile, seriesAppend(existsSync(seriesFile) ? readFileSync(seriesFile, 'utf8') : '', entry))

  let trackerNote = ''
  if (options.updateTracker) {
    try {
      if (!sitemap) throw new Error('the sitemap was not read')
      trackerNote = `\n## Page tracker\n\n${await rewriteTracker({ repoRoot, sitemap, gscRaw, inspections, index, id, now, window, sourceCommit })}\n`
    } catch (error) {
      trackerNote = `\n## Page tracker\n\nNot rewritten: ${reason(error)}\n`
      process.exitCode = 1
    }
    appendFileSync(join(dir, 'summary.md'), trackerNote)
  }
  process.stdout.write(summary + trackerNote)
  console.error(`${gotNumbers ? 'Snapshot' : 'Nothing was read; not added to the series. Snapshot'} written to ${dir}`)
  if (!gotNumbers) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch(error => { console.error(reason(error)); process.exitCode = 1 })
}
