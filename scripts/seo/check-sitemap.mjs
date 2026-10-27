#!/usr/bin/env node
// Checks the built public site against its own sitemap (publishing gate G12, docs/seo/library/policy-gates.md): every
// sitemap URL is an absolute trailing-slash address on one origin, listed once, with a valid lastmod that is not in the
// future (as in docsPages.test.ts, up to tomorrow's UTC day), and has a built page that carries exactly one canonical
// link equal to that URL, no noindex or none (in a robots, googlebot or bingbot meta tag), a title and a description.
// The other way round, every built page that is indexable must be in the sitemap. robots.txt must exist, name the
// sitemap, and allow the listed paths to every crawler (`*`, Googlebot, Bingbot; Allow and Disallow with * and $, the
// longest matching rule wins). Offline: it reads files, so CI runs it right after the build.
//
//   npm run build:public && node scripts/seo/check-sitemap.mjs     the default dist is apps/public-web/dist
//   node scripts/seo/check-sitemap.mjs --dist DIR                  another built site
//
// The build writes the placeholder __W2L_ORIGIN__ where the public origin goes (the preview server swaps it in); the
// check takes the origin from the sitemap's first URL and requires every other URL, and every canonical, to use it.
// It cannot see what the live site answers (a status through the CDN, a header); that needs a request to the deployed
// site. A page without a lastmod is allowed and counted (the changelog has none by design).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseSitemap } from './sitemap.mjs'

export const MAX_URLS = 50_000
export const MAX_BYTES = 50 * 1024 * 1024

const attributes = tag => Object.fromEntries([...tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)].map(match => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4].replace(/\/$/, '')]))
const ROBOTS_META = new Set(['robots', 'googlebot', 'bingbot'])
const keepsOut = content => /\b(noindex|none)\b/i.test(content)

/** What a page's head says that the check needs: canonical links, robots directives, title, description. */
export function headFacts(html) {
  const head = html.slice(0, html.search(/<\/head>/i) < 0 ? undefined : html.search(/<\/head>/i))
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]))
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]))
  return {
    canonicals: links.filter(link => (link.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')).map(link => link.href ?? ''),
    robots: metas.filter(meta => ROBOTS_META.has((meta.name ?? '').toLowerCase())).map(meta => meta.content ?? ''),
    title: /<title>([\s\S]*?)<\/title>/i.exec(head)?.[1].trim() ?? '',
    descriptions: metas.filter(meta => (meta.name ?? '').toLowerCase() === 'description').map(meta => (meta.content ?? '').trim()),
  }
}

/** The path a built file serves: `blog/x/index.html` is `/blog/x/`, `index.html` is `/`. Null for any other file. */
export function pagePathOf(file) {
  const parts = file.split(/[\\/]/)
  if (parts.at(-1) !== 'index.html') return null
  return parts.length === 1 ? '/' : `/${parts.slice(0, -1).join('/')}/`
}

/** Every built page of `dist` by path, as its HTML. */
export function builtPages(dist) {
  const pages = new Map()
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const path = pagePathOf(relative(dist, full).split(sep).join('/'))
        if (path) pages.set(path, readFileSync(full, 'utf8'))
      }
    }
  }
  walk(dist)
  return pages
}

const validDay = value => {
  const date = new Date(`${value}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** A robots.txt as { groups, sitemaps }: `groups` maps a lowercase user agent to its rules ({ allow, pattern }); a rule
 * with an empty pattern allows everything and is left out. */
export function readRobots(text) {
  const groups = new Map()
  const sitemaps = []
  let agents = []
  let inRules = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const colon = line.indexOf(':')
    if (!line || colon < 0) continue
    const name = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (name === 'user-agent') {
      if (inRules) { agents = []; inRules = false }
      agents.push(value.toLowerCase())
      for (const agent of agents) if (!groups.has(agent)) groups.set(agent, [])
    } else if (name === 'sitemap') { if (value) sitemaps.push(value) }
    else if (name === 'allow' || name === 'disallow') {
      inRules = true
      if (value) for (const agent of agents) groups.get(agent).push({ allow: name === 'allow', pattern: value })
    }
  }
  return { groups, sitemaps }
}

const matcher = pattern => {
  const end = pattern.endsWith('$')
  const body = (end ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${body}${end ? '$' : ''}`)
}

/** Whether `crawler` may fetch `path`: its own group if robots.txt has one, else the `*` group; the longest matching
 * pattern wins and Allow wins a tie. Returns { allowed, rule } with the rule that decided. */
export function robotsAllows(robots, crawler, path) {
  const rules = robots.groups.get(crawler) ?? robots.groups.get('*') ?? []
  let best = null
  for (const rule of rules) {
    if (!matcher(rule.pattern).test(path)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule
  }
  return { allowed: best ? best.allow : true, rule: best }
}

export const CRAWLERS = ['*', 'googlebot', 'bingbot']

/** The sitemap's problems, as { where, problem } lines, plus counts. `xml` is the sitemap, `pages` the built pages by
 * path (HTML), `robotsTxt` the built robots.txt or null, `today` a YYYY-MM-DD day. */
export function checkSitemap({ xml, pages, robotsTxt, today }) {
  const problems = []
  const add = (where, problem) => problems.push({ where, problem })
  let entries
  try { entries = parseSitemap(xml) } catch (error) { return { problems: [{ where: 'sitemap.xml', problem: error.message }], urls: 0, undated: 0 } }
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  if (entries.length === 0) add('sitemap.xml', 'lists no URLs')
  if (entries.length > MAX_URLS) add('sitemap.xml', `lists ${entries.length} URLs; one file may list at most ${MAX_URLS}`)
  if (Buffer.byteLength(xml) > MAX_BYTES) add('sitemap.xml', `is larger than ${MAX_BYTES} bytes`)

  const origin = entries[0] ? /^(https?:\/\/[^/]+|__W2L_ORIGIN__)/.exec(entries[0].loc)?.[0] ?? null : null
  if (entries.length && !origin) add(entries[0].loc, 'does not start with an origin')
  const seen = new Set()
  const listed = new Set()
  let undated = 0
  for (const { loc, lastmod } of entries) {
    if (seen.has(loc)) { add(loc, 'is listed more than once'); continue }
    seen.add(loc)
    if (!origin || !loc.startsWith(origin)) { add(loc, `is not on the sitemap's origin ${origin}`); continue }
    const path = loc.slice(origin.length)
    if (!path.startsWith('/') || /[?#\s]/.test(path)) { add(loc, 'is not a plain absolute path (no query, fragment or space)'); continue }
    if (!path.endsWith('/')) add(loc, 'has no trailing slash, which every canonical here has')
    listed.add(path)
    if (lastmod === null) undated += 1
    else if (!validDay(lastmod)) add(loc, `has lastmod "${lastmod}", which is not a YYYY-MM-DD day`)
    else if (lastmod > tomorrow) add(loc, `has lastmod ${lastmod}, which is after tomorrow (${tomorrow}, UTC)`)
    const html = pages.get(path)
    if (html === undefined) { add(loc, 'has no built page'); continue }
    const facts = headFacts(html)
    if (facts.canonicals.length !== 1) add(loc, `has ${facts.canonicals.length} canonical links, not one`)
    else if (facts.canonicals[0] !== loc) add(loc, `has canonical ${facts.canonicals[0]}, not itself`)
    if (facts.robots.some(keepsOut)) add(loc, 'is noindex')
    if (!facts.title) add(loc, 'has no <title>')
    if (facts.descriptions.length === 0 || facts.descriptions.some(description => !description)) add(loc, 'has no meta description')
  }
  for (const [path, html] of pages) {
    if (listed.has(path)) continue
    if (!headFacts(html).robots.some(keepsOut)) add(origin ? origin + path : path, 'is a built page that can be indexed but is not in the sitemap')
  }
  if (robotsTxt === null) add('robots.txt', 'is missing')
  else {
    const robots = readRobots(robotsTxt)
    if (origin && !robots.sitemaps.includes(`${origin}/sitemap.xml`)) add('robots.txt', `does not name ${origin}/sitemap.xml`)
    for (const crawler of CRAWLERS) for (const path of listed) {
      const { allowed, rule } = robotsAllows(robots, crawler, path)
      if (!allowed) add(origin + path, `is disallowed for ${crawler} by robots.txt (Disallow: ${rule.pattern})`)
    }
  }
  return { problems, urls: entries.length, undated }
}

function main(argv) {
  let dist = fileURLToPath(new URL('../../apps/public-web/dist', import.meta.url))
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist' && argv[i + 1]) dist = resolve(argv[++i])
    else throw new Error(`unknown option ${argv[i]}`)
  }
  if (!existsSync(join(dist, 'sitemap.xml'))) throw new Error(`${dist} has no sitemap.xml; build the site first (npm run build:public)`)
  const result = checkSitemap({
    xml: readFileSync(join(dist, 'sitemap.xml'), 'utf8'),
    pages: builtPages(dist),
    robotsTxt: existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : null,
    today: new Date().toISOString().slice(0, 10),
  })
  console.log(`sitemap: ${result.urls} URLs (${result.undated} without lastmod), ${result.problems.length} problem(s)`)
  for (const { where, problem } of result.problems) console.log(`  ${where} ${problem}`)
  if (result.problems.length) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(process.argv.slice(2)) } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
}
