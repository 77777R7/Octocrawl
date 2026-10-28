// The pure parts of scripts/seo/snapshot.mjs: windows, Search Console rows, the sitemap, a page's source file and
// dates, the page tracker table and the Markdown summary. No network, no git, no file system, so test/snapshot.test.mjs
// can run them offline.

export const SITE_ORIGIN = 'https://octocrawl.dev'
export const GSC_SITE = 'sc-domain:octocrawl.dev'
export const UNREAD = 'unread'
const CONTENT = 'apps/public-web/content/'

const isoDay = ms => new Date(ms).toISOString().slice(0, 10)

/** The Search Console window: `days` whole UTC days that end `lag` days before today, because the newest days are not
 * in the data yet. `end` is inclusive. */
export function gscWindow(days = 28, now = new Date(), lag = 2) {
  if (!Number.isInteger(days) || days < 1 || days > 480) throw new Error('--days must be a whole number from 1 to 480')
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const end = today - lag * 86_400_000
  return { start: isoDay(end - (days - 1) * 86_400_000), end: isoDay(end), days }
}

/** `YYYY-MM-DDTHHMMSSZ`: names a snapshot folder, so two runs on one day do not share one. */
export const snapshotId = (now = new Date()) => { const iso = now.toISOString(); return `${iso.slice(0, 10)}T${iso.slice(11, 19).replace(/:/g, '')}Z` }

const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** The `<url>` entries of a sitemap: `loc` and `lastmod` (null when absent). A sitemap index is refused, not read as empty. */
export function parseSitemap(xml) {
  if (/<sitemapindex[\s>]/.test(xml)) throw new Error('the sitemap is a sitemap index; snapshot.mjs reads a single urlset')
  if (!/<urlset[\s>]/.test(xml)) throw new Error('the sitemap has no <urlset>')
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(match => {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(match[1])
    if (!loc) return []
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(match[1])
    return [{ loc: decode(loc[1]), lastmod: lastmod ? decode(lastmod[1]) : null }]
  })
}

/** The path of an address on the canonical origin (https://octocrawl.dev) without query or fragment; null for any
 * other origin (http, www, a local address), which the tracker does not merge in. */
export function canonicalPath(address) {
  try {
    const url = new URL(address)
    return url.origin === SITE_ORIGIN ? url.pathname : null
  } catch { return null }
}

/** Search Console page rows ({keys:[url], clicks, impressions, position}) as one entry per canonical path. Rows that
 * differ only by query string add up, with the position weighted by impressions. */
export function pagesByPath(rows) {
  const out = new Map()
  for (const row of rows) {
    const path = canonicalPath(row.keys[0])
    if (path === null) continue
    const entry = out.get(path) ?? { clicks: 0, impressions: 0, weighted: 0 }
    entry.clicks += row.clicks
    entry.impressions += row.impressions
    entry.weighted += row.position * row.impressions
    out.set(path, entry)
  }
  return new Map([...out].map(([path, e]) => [path, { clicks: e.clicks, impressions: e.impressions, position: e.impressions ? e.weighted / e.impressions : null }]))
}

const BRAND = /octocrawl/i

/** What one Search Console pull says, as the numbers the series keeps. `pulls` holds the six answers' `rows` arrays
 * (`total` has one row or none) and `rowLimit` is what the page and query pulls asked for: a pull that came back full
 * is flagged, because rows past the limit are missing, not zero. Page position is each page's average over its
 * queries, so `pagesLe20` says where the exposure sits, not where Octocrawl ranks; it counts pages on the canonical
 * origin, with `#` and query-string spellings merged (the page table has one row per spelling, so it has more rows than
 * pages). Queries Google hides are not in the query rows, so `visibleBrand` is a floor, and no brand rows does not mean
 * no brand searches. */
export function summarizeGsc(pulls, rowLimit) {
  const total = pulls.total[0] ?? null
  const dated = pulls.date.filter(row => row.impressions > 0 || row.clicks > 0)
  const pageImpressions = pulls.page.reduce((n, row) => n + row.impressions, 0)
  const canonical = pagesByPath(pulls.page)
  const le20 = [...canonical.values()].filter(entry => entry.position !== null && entry.position <= 20)
  const brand = pulls.query.filter(row => BRAND.test(row.keys[0]))
  return {
    clicks: total?.clicks ?? null,
    impressions: total?.impressions ?? null,
    ctr: total && total.impressions > 0 ? total.clicks / total.impressions : null,
    position: total?.position ?? null,
    lastDateWithData: dated.map(row => row.keys[0]).sort().at(-1) ?? null,
    pageRows: pulls.page.length,
    pageRowsFull: pulls.page.length >= rowLimit,
    pageImpressions,
    canonicalPageImpressions: [...canonical.values()].reduce((n, e) => n + e.impressions, 0),
    pagesLe20: { pages: le20.length, impressions: le20.reduce((n, row) => n + row.impressions, 0) },
    queryRows: pulls.query.length,
    queryRowsFull: pulls.query.length >= rowLimit,
    visibleBrand: { rows: brand.length, impressions: brand.reduce((n, row) => n + row.impressions, 0), clicks: brand.reduce((n, row) => n + row.clicks, 0) },
  }
}

/** The fields of a URL Inspection answer that the series and the tracker use. An answer with no index status, or with no
 * verdict, is not a reading, so it throws and the URL counts as not read. */
export function describeInspection(answer) {
  const status = answer?.inspectionResult?.indexStatusResult
  if (!status) throw new Error('the answer had no indexStatusResult')
  if (!status.verdict || status.verdict === 'VERDICT_UNSPECIFIED') throw new Error('the answer had no verdict')
  return {
    verdict: status.verdict,
    coverageState: status.coverageState ?? null,
    indexingState: status.indexingState ?? null,
    robotsTxtState: status.robotsTxtState ?? null,
    pageFetchState: status.pageFetchState ?? null,
    lastCrawlTime: status.lastCrawlTime ?? null,
    googleCanonical: status.googleCanonical ?? null,
    userCanonical: status.userCanonical ?? null,
  }
}

/** The tracker's 收录 cell for one inspection read on `day`. */
export function indexCell(inspection, day) {
  const state = inspection.coverageState
  if (inspection.verdict === 'PASS') return `通过（${day}）`
  const label = { NEUTRAL: '中性', FAIL: '未通过', PARTIAL: '部分' }[inspection.verdict] ?? '未知'
  return `${label}${state ? `：${state}` : ''}（${day}）`
}

/** Counts of the URLs that were read, by verdict, plus the ones that were not. `results` maps a path to
 * {inspection} or {error}. */
export function summarizeInspections(results) {
  const entries = [...results.values()]
  const read = entries.filter(entry => entry.inspection)
  const count = verdict => read.filter(entry => entry.inspection.verdict === verdict).length
  const pass = count('PASS'), neutral = count('NEUTRAL'), fail = count('FAIL')
  return { urls: entries.length, read: read.length, notRead: entries.length - read.length, pass, neutral, fail, other: read.length - pass - neutral - fail }
}

/** Where a page's source lives and when it appeared, from the site registries (docsPages.mjs, blogPosts.mjs) and the
 * files themselves. `exists(path)` says whether a repo file exists. Returns null for an address with no known source.
 * A blog article has an authoritative `pubDate` (the day it first went live); any other page has only its source
 * file's first commit, which is when it entered the repository, not when it went live. */
export function sourceOfPath(path, { docsPages, blogPosts }, exists) {
  const withFiles = (files, extra = {}) => {
    const present = files.filter(exists)
    return present.length ? { files: present, ...extra } : null
  }
  if (path === '/') return withFiles(['apps/public-web/index.html'])
  if (path === '/scrape/') return withFiles(['apps/public-web/scrape/index.html'])
  if (path === '/tools/') return withFiles(['apps/public-web/tools/index.html'])
  if (path === '/blog/') return withFiles(['apps/public-web/scripts/blogPosts.mjs'])
  const tool = /^\/tools\/([^/]+)\/$/.exec(path)
  if (tool) return withFiles([`apps/public-web/tools/${tool[1]}/index.html`])
  const docs = /^\/docs\/(.*)$/.exec(path)
  if (docs) {
    const slug = docs[1].replace(/\/$/, '')
    const page = docsPages.find(entry => entry.slug === slug)
    return page ? withFiles([CONTENT + page.file]) : null
  }
  const blog = /^\/blog\/([^/]+)\/$/.exec(path)
  if (blog) {
    const post = blogPosts.find(entry => entry.slug === blog[1])
    return post ? withFiles([CONTENT + post.file], post.pubDate ? { pubDate: post.pubDate } : {}) : null
  }
  return null
}

/** The tracker's date cell: the article's publication day or the first commit of the source file; null when neither is
 * known, which leaves a cell as it was and gives a new row 未知. */
export function launchCell(source, firstCommitDay) {
  if (source?.pubDate) return `${source.pubDate}（发布日）`
  if (firstCommitDay) return `${firstCommitDay}（首次入库）`
  return null
}

export function pageType(path) {
  if (path.startsWith('/docs/')) return '文档'
  if (path.startsWith('/blog/')) return '博客'
  if (path.startsWith('/tools/')) return '工具'
  return '未知'
}

const splitRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim())
const joinRow = cells => `| ${cells.join(' | ')} |`
const LAUNCH_HEADER = '发布日 / 首次入库日'
export const DATA_LINE_PREFIX = '数据（脚本写入）：'
const DATA_CLAUSES = [['launch', '日期列：'], ['index', '收录列：'], ['gsc', '28 天列：']]
const SKIPPED_CLAUSE = '未随本次更新的行：'

/** The `数据（脚本写入）：` line, one clause per column the script writes. A column that was not written this run keeps
 * its earlier clause, so the line never says a window or a day for numbers it did not just write; a column the script
 * has never written says so. */
export function mergeDataLine(previous, clauses, skipped) {
  for (const text of Object.values(clauses)) if (text?.includes('；')) throw new Error('a data-line clause may not contain "；", which separates the clauses')
  const old = previous.slice(DATA_LINE_PREFIX.length).split('；')
  const parts = DATA_CLAUSES.map(([name, key]) => (clauses[name] ? key + clauses[name] : old.find(clause => clause.startsWith(key)) ?? `${key}尚未由脚本写入`))
  parts.push(SKIPPED_CLAUSE + (skipped.length ? skipped.join('、') : '无'))
  return DATA_LINE_PREFIX + parts.join('；')
}

/** Rewrites the first table of docs/seo/library/page-tracker.md (the one headed `| URL | 类型 |`) from a snapshot.
 * `pages` maps a path to { launch, index, gsc }, each a finished cell or null, and null leaves the cell as it was: a
 * source that was not read never turns a cell into unknown or into 0. A sitemap path with no row gets a new row. A row
 * whose path is not in `pages` is kept and listed in `missing`. The `数据（脚本写入）：` line is merged with `clauses`
 * ({ launch, index, gsc }: a clause text for each column written this run, null for one that was not). */
export function updateTracker(markdown, pages, clauses) {
  const lines = markdown.split('\n')
  const head = lines.findIndex(line => /^\|\s*URL\s*\|\s*类型\s*\|/.test(line))
  if (head < 0) throw new Error('page-tracker.md has no table headed "| URL | 类型 |"')
  const headers = splitRow(lines[head])
  const column = test => headers.findIndex(test)
  const at = { url: column(h => h === 'URL'), type: column(h => h === '类型'), term: column(h => h === '主承接词'), launch: column(h => h === '上线日' || h === LAUNCH_HEADER), index: column(h => h === '收录'), gsc: column(h => h.startsWith('28 天')), note: column(h => h === '备注') }
  for (const [name, value] of Object.entries(at)) if (value < 0) throw new Error(`page-tracker.md table has no ${name} column`)
  headers[at.launch] = LAUNCH_HEADER
  lines[head] = joinRow(headers)

  let last = head + 1
  const seen = new Set()
  let changed = 0
  for (let i = head + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    last = i
    const cells = splitRow(lines[i])
    const path = cells[at.url]
    seen.add(path)
    const update = pages.get(path)
    if (!update) continue
    const before = lines[i]
    if (update.launch) cells[at.launch] = update.launch
    if (update.index) cells[at.index] = update.index
    if (update.gsc) cells[at.gsc] = update.gsc
    lines[i] = joinRow(cells)
    if (lines[i] !== before) changed += 1
  }
  const added = []
  for (const [path, update] of pages) {
    if (seen.has(path)) continue
    const cells = headers.map(() => '')
    cells[at.url] = path
    cells[at.type] = pageType(path)
    cells[at.term] = '未知（待填）'
    cells[at.launch] = update.launch ?? '未知'
    cells[at.index] = update.index ?? '未知'
    cells[at.gsc] = update.gsc ?? '未知'
    cells[at.note] = '脚本新增'
    lines.splice(last + 1 + added.length, 0, joinRow(cells))
    added.push(path)
  }
  const line = lines.findIndex(entry => entry.startsWith(DATA_LINE_PREFIX))
  if (line < 0) throw new Error(`page-tracker.md has no line starting with ${DATA_LINE_PREFIX}`)
  const missing = [...seen].filter(path => !pages.has(path))
  lines[line] = mergeDataLine(lines[line], clauses, missing)
  return { markdown: lines.join('\n'), added, changed, missing }
}

/** What to append to the series file for `entry`: a newline first when the file is not empty and does not end with one,
 * so a truncated last line cannot swallow the new entry. */
export const seriesAppend = (existing, entry) => `${existing && !existing.endsWith('\n') ? '\n' : ''}${JSON.stringify(entry)}\n`

/** The series file's lines as entries; a line that is not JSON is counted, not guessed at. */
export function readSeries(text) {
  const entries = []
  let bad = 0
  for (const line of text.split('\n').filter(Boolean)) {
    try { entries.push(JSON.parse(line)) } catch { bad += 1 }
  }
  return { entries, bad }
}

/** What this snapshot is compared with: the latest earlier Search Console numbers for a window of the same length, and
 * the latest earlier index counts, each from its own entry, because a snapshot that skipped one source has null there. */
export function previousFor(entries, days) {
  const last = test => entries.findLast(test) ?? null
  const hasIndex = entry => entry.index && entry.index.read > 0
  return {
    gsc: last(entry => entry.gsc && entry.window?.days === days)?.gsc ?? null,
    index: last(hasIndex)?.index ?? null,
    indexId: last(hasIndex)?.id ?? null,
  }
}

/** The verdict changes between two URL Inspection passes. `before` maps a path to its verdict, or null where it was not
 * read; a null `before` (no earlier pass to compare with) gives no changes at all. */
export function indexChanges(now, before) {
  if (!before) return []
  const out = []
  for (const [path, result] of now) {
    if (!before.has(path)) { out.push(`${path}: new in the sitemap`); continue }
    const was = before.get(path)
    if (result.inspection && was !== null && was !== result.inspection.verdict) out.push(`${path}: ${was} to ${result.inspection.verdict}${result.inspection.coverageState ? ` (${result.inspection.coverageState})` : ''}`)
  }
  for (const path of before.keys()) if (!now.has(path)) out.push(`${path}: no longer in the sitemap`)
  return out
}

const pct = value => (value === null || value === undefined ? 'unknown' : `${(value * 100).toFixed(2)}%`)
const num = value => (value === null || value === undefined ? 'unknown' : value.toLocaleString('en-US'))
const delta = (now, before) => (now === null || now === undefined || before === null || before === undefined ? 'unknown' : `${now - before >= 0 ? '+' : ''}${Number((now - before).toFixed(2))}`)

// The AI assistants whose visits can be told from the site's own analytics, with the utm_source values and referrer hosts
// that mark them. The lists are those of research/seo/2026-10-27-geo-research.md section 5 (PostHog's channel
// definitions, Google's GA4 channel rules and vendor measurements); a platform can change what it sends, so this is a
// floor, and an assistant app that sends neither lands in "direct".
export const AI_ASSISTANTS = [
  { name: 'ChatGPT', utm: ['chatgpt', 'chatgpt.com'], hosts: ['chatgpt.com', 'chat.openai.com'] },
  { name: 'Claude', utm: ['claude', 'claude.ai'], hosts: ['claude.ai'] },
  { name: 'Perplexity', utm: ['perplexity'], hosts: ['perplexity.ai', 'ai.perplexity.app'] },
  { name: 'Gemini', utm: ['gemini'], hosts: ['gemini.google.com'] },
  { name: 'Copilot', utm: ['copilot', 'copilot.com'], hosts: ['copilot.microsoft.com', 'copilot.cloud.microsoft', 'copilot.com'] },
  { name: 'DeepSeek', utm: ['deepseek'], hosts: ['chat.deepseek.com', 'deepseek.com'] },
  { name: 'Grok', utm: ['grok'], hosts: ['grok.com'] },
  { name: 'Other assistants', utm: [], hosts: ['meta.ai', 'you.com', 'phind.com', 'chat.mistral.ai', 'kimi.com'] },
]

/** The assistant a source label of the weekly report names, or null. A label is `utm_source=<value>` or a referrer host
 * (the report shows the referrer when there is one and the tag only when there is not). */
export function assistantOf(label) {
  const text = String(label).toLowerCase().replace(/^www\./, '')
  const value = text.startsWith('utm_source=') ? text.slice('utm_source='.length) : null
  for (const assistant of AI_ASSISTANTS) {
    if (value !== null ? assistant.utm.includes(value) : assistant.hosts.includes(text)) return assistant.name
  }
  return null
}

/** The page views the site's analytics attribute to AI assistants, from the weekly report's `sources`
 * ([{ source, views, visitorDays }]): per assistant, and in total with the share of all page views. The count is a
 * floor: a visit with no referrer and no tag is counted as direct. `visitorDays` of a total adds the assistants'
 * counts, so a visitor-day that came through two of them counts twice. */
export function summarizeAiReferrals(sources, pageViews) {
  const by = new Map()
  for (const { source, views, visitorDays } of sources) {
    const name = assistantOf(source)
    if (name === null) continue
    const entry = by.get(name) ?? { name, views: 0, visitorDays: 0, sources: [] }
    entry.views += views
    entry.visitorDays += visitorDays
    entry.sources.push(source)
    by.set(name, entry)
  }
  const assistants = [...by.values()].sort((a, b) => b.views - a.views || a.name.localeCompare(b.name))
  const views = assistants.reduce((n, entry) => n + entry.views, 0)
  return { views, visitorDays: assistants.reduce((n, entry) => n + entry.visitorDays, 0), viewShare: pageViews > 0 ? views / pageViews : null, assistants }
}

/** The first-party block of a series entry, from the weekly report's `site` summary. */
export function firstPartySummary(site, days) {
  return { days, pageViews: site.pageViews, visitorDays: site.visitorDays, ai: summarizeAiReferrals(site.sources, site.pageViews), chatgptTag: site.chatgptTag ?? null }
}

/** The series line for one snapshot: only numbers that were read; a source that was not read is null with its reason in
 * `notRead`. */
export function seriesEntry({ id, takenAt, sourceCommit, dirty, scriptSha256, route, window, gsc, index, firstParty, notRead }) {
  return { id, takenAt, sourceCommit, dirty, scriptSha256, route, window, gsc: gsc ?? null, index: index ?? null, firstParty: firstParty ?? null, notRead }
}

/** The snapshot's summary page. `previous` is the series line before this one, or null. */
export function renderSummary(entry, previous, extras = {}) {
  const out = [`# SEO snapshot ${entry.id}`, '', `Source commit ${entry.sourceCommit}${entry.dirty ? ' (working tree had uncommitted changes)' : ''}, snapshot scripts sha256 ${entry.scriptSha256}. Route: ${entry.route}. Taken ${entry.takenAt}.`, '']
  const unread = Object.entries(entry.notRead)
  if (unread.length) out.push('**Not read** (unknown, not zero):', ...unread.map(([name, why]) => `- ${name}: ${why}`), '')
  if (entry.gsc) {
    const g = entry.gsc, p = previous?.gsc ?? null
    out.push(`## Search Console, ${entry.window.start} to ${entry.window.end} (${entry.window.days} days, newest day with data ${g.lastDateWithData ?? 'unknown'})`, '',
      '| Metric | Now | Before | Change |', '|---|---:|---:|---:|',
      `| Impressions | ${num(g.impressions)} | ${num(p?.impressions)} | ${delta(g.impressions, p?.impressions)} |`,
      `| Clicks | ${num(g.clicks)} | ${num(p?.clicks)} | ${delta(g.clicks, p?.clicks)} |`,
      `| CTR | ${pct(g.ctr)} | ${pct(p?.ctr)} | |`,
      `| Average position | ${g.position === null ? 'unknown' : g.position.toFixed(1)} | ${p?.position == null ? 'unknown' : p.position.toFixed(1)} | ${delta(g.position, p?.position)} |`,
      `| Impressions on pages averaging position 20 or better | ${num(g.pagesLe20.impressions)} of ${num(g.canonicalPageImpressions)} (${g.pagesLe20.pages} pages) | ${p ? `${num(p.pagesLe20.impressions)} of ${num(p.canonicalPageImpressions)}` : 'unknown'} | |`,
      `| Visible queries naming octocrawl | ${g.visibleBrand.rows} rows, ${num(g.visibleBrand.impressions)} impressions, ${num(g.visibleBrand.clicks)} clicks | ${p ? `${num(p.visibleBrand.impressions)} impressions` : 'unknown'} | |`, '',
      `The page table sums to ${num(g.pageImpressions)} impressions, of which ${num(g.canonicalPageImpressions)} are on https://octocrawl.dev addresses; the property total (${num(g.impressions)}) is counted differently and is not meant to match. Queries Google hides are not in the query rows, so the brand row is a floor.`)
    if (p && g.lastDateWithData !== null && g.lastDateWithData === p.lastDateWithData) out.push('', `The newest day with data is ${g.lastDateWithData} in both snapshots, so a change of +0 can mean that Search Console has no newer day yet, not that nothing changed.`)
    if (g.pageRowsFull || g.queryRowsFull) out.push('', `**Row limit reached** (${[g.pageRowsFull && 'pages', g.queryRowsFull && 'queries'].filter(Boolean).join(' and ')}): rows past the limit are missing.`)
    out.push('')
  }
  if (entry.index) {
    const i = entry.index, p = previous?.index ?? null
    out.push('## URL Inspection', '',
      `${i.read} of ${i.urls} sitemap URLs were read: ${i.pass} PASS, ${i.neutral} NEUTRAL, ${i.fail} FAIL, ${i.other} other; ${i.notRead} not read.${p ? ` Before: ${p.read} of ${p.urls} read, ${p.pass} PASS.` : ''}`, '')
    const compare = extras.indexCompare
    if (compare?.note) out.push(`Not compared with an earlier pass: ${compare.note}.`, '')
    else if (compare?.changes.length) out.push(`Changed since ${compare.since}:`, ...compare.changes.map(change => `- ${change}`), '')
    else if (compare) out.push(`No verdict changed since ${compare.since}.`, '')
  }
  if (entry.firstParty) {
    const f = entry.firstParty
    out.push('## First-party site analytics', '', `${f.days} days: ${num(f.pageViews)} page views, ${num(f.visitorDays)} visitor-days (automated and internal lines left out).`, '')
    if (f.ai) {
      out.push(`From AI assistants (at least; counted by the weekly report's source label, which is the referrer when there is one and the utm tag otherwise; a visit with neither counts as direct): ${num(f.ai.views)} page views${f.ai.viewShare === null ? '' : ` (${pct(f.ai.viewShare)} of all)`}${f.ai.assistants.length ? `: ${f.ai.assistants.map(a => `${a.name} ${num(a.views)} views, ${num(a.visitorDays)} visitor-days`).join('; ')}` : ''}. Visitor-days are counted per source label, so one that came through two labels counts twice.`, '')
    }
    if (f.chatgptTag) out.push(f.chatgptTag.views > 0 ? `ChatGPT page views by tag or by referrer: ${num(f.chatgptTag.views)}, of which ${num(f.chatgptTag.tagged)} carry utm_source=chatgpt.com (${pct(f.chatgptTag.taggedShare)}; this can exceed the ChatGPT line above by views that have a tag and another site's referrer. A view with neither the tag nor a ChatGPT referrer is not counted here, so a tag that has gone shows as fewer views a day, not necessarily as a lower share); by day (views, tagged): ${f.chatgptTag.byDay.map(([date, views, tagged]) => `${date} ${views}, ${tagged}`).join('; ')}.` : 'ChatGPT page views by tag or by referrer: none in the window, so the tagged share is unknown.', '')
  }
  if (extras.topQueries?.length) out.push('## Top queries', '', '| Query | Clicks | Impressions | Position |', '|---|---:|---:|---:|', ...extras.topQueries.map(row => `| ${row.keys[0].replace(/\|/g, '\\|')} | ${row.clicks} | ${row.impressions} | ${row.position.toFixed(1)} |`), '')
  if (extras.topPages?.length) out.push('## Top pages', '', '| Page | Clicks | Impressions | Position |', '|---|---:|---:|---:|', ...extras.topPages.map(row => `| ${row.keys[0].replace(/\|/g, '\\|')} | ${row.clicks} | ${row.impressions} | ${row.position.toFixed(1)} |`), '')
  if (extras.tracker) out.push('## Page tracker', '', extras.tracker, '')
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}
