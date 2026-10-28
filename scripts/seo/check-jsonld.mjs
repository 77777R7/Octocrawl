#!/usr/bin/env node
// Checks the structured data (JSON-LD) of the built public site (publishing gate G11, docs/seo/library/policy-gates.md,
// the part a script can see): the page families that carry structured data still do; every block parses; every
// top-level object is a schema.org type this site uses; no ratings or reviews; every address in an address field is on
// the site's own origin (and a file it names exists) or on an allowed host; `url` and `mainEntityOfPage` equal the
// page's canonical; a TechArticle or BlogPosting has a headline that is the page's own (its breadcrumb name or in its
// h1), a description equal to the meta description and, for a BlogPosting, dates that are valid, in order and equal to
// the article meta tags; a FAQPage appears only where it already did and each question and the start of each answer
// are in the page body; a BreadcrumbList is numbered 1..n, ends at the page and lists built pages. Offline: it reads
// files, so CI runs it right after the build, next to check-sitemap.mjs.
//
//   npm run build:public && node scripts/seo/check-jsonld.mjs     the default dist is apps/public-web/dist
//   node scripts/seo/check-jsonld.mjs --dist DIR                  another built site
//
// It cannot tell whether a claim in the data is true (G11 also asks for the Rich Results Test, which needs the live
// site), only that what the data repeats about the page matches the page. A page family that is new and carries no
// structured data is not an error until it is added to REQUIRED_TYPES.

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { builtPages, headFacts } from './check-sitemap.mjs'

export const TOKEN = '__W2L_ORIGIN__'
export const ALLOWED_TYPES = new Set(['WebSite', 'Organization', 'SoftwareApplication', 'TechArticle', 'BlogPosting', 'Blog', 'BreadcrumbList', 'CollectionPage', 'FAQPage'])
// FAQPage no longer earns a rich result (G11), so it is not added to new pages. These two carry one already.
export const FAQ_PAGES = new Set(['/', '/scrape/'])
export const EXTERNAL_HOSTS = new Set(['github.com', 'schema.org'])
const FORBIDDEN_KEYS = new Set(['aggregateRating', 'AggregateRating', 'review', 'Review', 'reviewRating', 'ratingValue'])
// The fields whose string value is an address; free text such as a FAQ answer may start with "https://" without being one.
const ADDRESS_KEYS = new Set(['url', '@id', 'item', 'image', 'logo', 'sameAs', 'mainEntityOfPage', 'license', 'codeRepository', 'thumbnailUrl', 'contentUrl', 'downloadUrl', 'installUrl', 'embedUrl'])
const FILE_EXTENSION = /\.(png|jpe?g|webp|gif|svg|ico|pdf|txt|xml|json)$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The structured-data types a page family must carry, by path; null for a family with no requirement. */
export function requiredTypes(path) {
  if (path === '/') return ['WebSite', 'Organization', 'SoftwareApplication']
  if (path === '/docs/' || /^\/docs\/.+\/$/.test(path)) return ['TechArticle', 'BreadcrumbList']
  if (path === '/blog/') return ['Blog', 'BreadcrumbList']
  if (/^\/blog\/(?!category\/)[^/]+\/$/.test(path)) return ['BlogPosting', 'BreadcrumbList']
  if (path === '/tools/') return ['CollectionPage']
  if (/^\/tools\/[^/]+\/$/.test(path)) return ['SoftwareApplication']
  if (path === '/changelog/') return ['BreadcrumbList']
  return null
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = text => text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (all, dec, hex, name) => (dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()] ?? all))
const squash = text => text.replace(/\s+/g, ' ').trim()
// Text from markup and text built from the same words differ only in spaces (a tag counts as a space on one side and as nothing on the other).
const compact = text => text.replace(/\s+/g, '')

const textOf = markup => squash(decode(markup.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')))

/** The visible text of a page body, roughly: scripts, styles and tags removed, entities decoded, spaces collapsed. The
 * head (the title, meta tags) is not part of it. */
export const pageText = html => textOf(html.includes('</head>') ? html.slice(html.search(/<\/head>/i)) : html)

/** The text of the page's h1 elements. */
const headingText = html => textOf([...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => match[1]).join(' '))

/** The raw text of every JSON-LD script block of a page. */
export const jsonLdBlocks = html => [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1])

const metaProperty = (html, property) => {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (new RegExp(`property\\s*=\\s*["']${property}["']`, 'i').test(tag[0])) return /content\s*=\s*"([^"]*)"/i.exec(tag[0])?.[1] ?? null
  }
  return null
}

const validDay = value => {
  const date = new Date(`${value}T00:00:00Z`)
  return typeof value === 'string' && DAY.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const idOf = value => (typeof value === 'string' ? value : value && typeof value === 'object' ? value['@id'] ?? null : null)

/** The structured-data problems of a built site, as { where, problem } lines, plus counts. `pages` maps a path to its
 * HTML (check-sitemap's builtPages), `fileExists(path)` says whether a file the data names exists in the build. */
export function checkJsonLd({ pages, fileExists, origin = TOKEN }) {
  const sameOrigin = value => value === origin || ['/', '?', '#'].some(next => value.startsWith(origin + next))
  const problems = []
  let blocks = 0
  let pagesWithData = 0
  const faqPages = []
  for (const [path, html] of pages) {
    const raws = jsonLdBlocks(html)
    const add = problem => problems.push({ where: path, problem })
    const required = requiredTypes(path)
    if (raws.length === 0) {
      if (required) add(`has no structured data; pages like it carry ${required.join(', ')}`)
      continue
    }
    pagesWithData += 1
    blocks += raws.length
    const facts = headFacts(html)
    const canonical = facts.canonicals.length === 1 ? facts.canonicals[0] : null
    if (canonical === null) add('has structured data but not exactly one canonical link to compare it with')
    const body = pageText(html)
    const items = []
    for (const raw of raws) {
      let parsed
      try { parsed = JSON.parse(raw) } catch { add('has a JSON-LD block that is not valid JSON'); continue }
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!item || typeof item !== 'object') { add('has a JSON-LD entry that is not an object'); continue }
        if (Array.isArray(item['@graph'])) items.push(...item['@graph'].map(member => ({ item: member, context: member?.['@context'] ?? item['@context'] })))
        else items.push({ item, context: item['@context'] })
      }
    }
    const present = new Set(items.flatMap(({ item }) => [].concat(item?.['@type'] ?? [])))
    for (const type of required ?? []) if (!present.has(type)) add(`has no ${type} in its structured data; pages like it carry ${required.join(', ')}`)
    const lastCrumb = items.find(({ item }) => item?.['@type'] === 'BreadcrumbList')?.item?.itemListElement?.at?.(-1)?.name

    for (const { item, context } of items) {
      if (!item || typeof item !== 'object') { add('has a JSON-LD @graph member that is not an object'); continue }
      const types = [].concat(item['@type'] ?? [])
      const type = types[0] ?? '(none)'
      if (types.length === 0) add('has a JSON-LD object with no @type')
      for (const one of types) if (!ALLOWED_TYPES.has(one)) add(`has a JSON-LD object of type ${one}, which this site does not use (add it to ALLOWED_TYPES when it is meant)`)
      if (context !== 'https://schema.org') add(`has a ${type} object whose @context is ${JSON.stringify(context)}, not https://schema.org`)

      const walk = (value, key) => {
        if (Array.isArray(value)) value.forEach(entry => walk(entry, key))
        else if (value && typeof value === 'object') {
          for (const [name, entry] of Object.entries(value)) {
            if (FORBIDDEN_KEYS.has(name)) add(`has ${name} in a ${type} object; ratings and reviews are only for real, visible ones (G11)`)
            walk(entry, name)
          }
        } else if (typeof value === 'string' && ADDRESS_KEYS.has(key)) {
          if (sameOrigin(value)) {
            const local = value.slice(origin.length).replace(/[?#].*$/, '')
            if (FILE_EXTENSION.test(local) && !fileExists(local)) add(`names ${value} in ${key}, which is not in the build`)
          } else if (/^https?:\/\//i.test(value)) {
            const host = new URL(value).host
            if (!EXTERNAL_HOSTS.has(host)) add(`names ${value} in ${key}, on ${host}, which is not an allowed host`)
          } else add(`names ${JSON.stringify(value)} in ${key}, which is neither on the site's origin nor on an allowed host`)
        }
      }
      walk(item, '@root')

      if (type === 'FAQPage') {
        if (!FAQ_PAGES.has(path)) add('has a FAQPage, which no longer earns a rich result and is not added to new pages (G11)')
        else faqPages.push(path)
        const questions = Array.isArray(item.mainEntity) ? item.mainEntity : []
        if (questions.length === 0) add('has a FAQPage with no questions')
        for (const question of questions) {
          const name = squash(String(question?.name ?? ''))
          const answer = squash(String(question?.acceptedAnswer?.text ?? ''))
          if (!name || !answer) { add('has a FAQ question without a name or an answer'); continue }
          if (!compact(body).includes(compact(name))) add(`has a FAQ question that is not on the page: "${name.slice(0, 60)}"`)
          if (!compact(body).includes(compact(answer.slice(0, 60)))) add(`has a FAQ answer whose start is not on the page: "${answer.slice(0, 60)}"`)
        }
        continue
      }

      if (type === 'BreadcrumbList') {
        const elements = Array.isArray(item.itemListElement) ? item.itemListElement : []
        if (elements.length === 0) { add('has a BreadcrumbList with no items'); continue }
        if (elements.some((element, index) => element?.position !== index + 1)) add('has a BreadcrumbList whose positions are not 1 to n in order')
        if (elements.some(element => !squash(String(element?.name ?? '')) || typeof element?.item !== 'string')) add('has a BreadcrumbList item without a name or an address')
        const addresses = elements.map(element => element?.item).filter(address => typeof address === 'string')
        if (addresses[0] !== `${origin}/`) add('has a BreadcrumbList that does not start at the home page')
        if (canonical !== null && addresses.at(-1) !== canonical) add(`has a BreadcrumbList that ends at ${addresses.at(-1)}, not at the page`)
        for (const address of addresses) if (sameOrigin(address) && !pages.has(address.slice(origin.length))) add(`has a BreadcrumbList item ${address} that is not a built page`)
        continue
      }

      if (canonical !== null && typeof item.url === 'string' && item.url !== canonical) add(`has a ${type} whose url is ${item.url}, not the canonical ${canonical}`)
      const entity = idOf(item.mainEntityOfPage)
      if (canonical !== null && entity !== null && entity !== canonical) add(`has a ${type} whose mainEntityOfPage is ${entity}, not the canonical ${canonical}`)
      if (['WebSite', 'Organization', 'SoftwareApplication', 'CollectionPage'].includes(type) && !squash(String(item.name ?? ''))) add(`has a ${type} with no name`)

      if (type === 'TechArticle' || type === 'BlogPosting') {
        const headline = squash(String(item.headline ?? ''))
        if (!headline) add(`has a ${type} with no headline`)
        else if (headline !== (lastCrumb === undefined ? null : squash(String(lastCrumb))) && !compact(headingText(html)).includes(compact(headline))) add(`has a ${type} headline that is neither the breadcrumb name nor in the page's h1: "${headline.slice(0, 60)}"`)
        const description = facts.descriptions[0] === undefined ? null : squash(decode(facts.descriptions[0]))
        if (squash(String(item.description ?? '')) !== description) add(`has a ${type} description that is not the meta description`)
      }
      if (type === 'BlogPosting') {
        const published = item.datePublished
        const modified = item.dateModified
        if (!validDay(published)) add(`has a BlogPosting datePublished ${JSON.stringify(published)} that is not a YYYY-MM-DD day`)
        if (modified !== undefined && !validDay(modified)) add(`has a BlogPosting dateModified ${JSON.stringify(modified)} that is not a YYYY-MM-DD day`)
        if (validDay(published) && validDay(modified) && modified < published) add('has a BlogPosting modified before it was published')
        const metaPublished = metaProperty(html, 'article:published_time')
        const metaModified = metaProperty(html, 'article:modified_time')
        if (metaPublished !== null && String(metaPublished).slice(0, 10) !== published) add(`has a BlogPosting datePublished ${published} that differs from article:published_time ${metaPublished}`)
        if (metaModified !== null && String(metaModified).slice(0, 10) !== modified) add(`has a BlogPosting dateModified ${modified} that differs from article:modified_time ${metaModified}`)
      }
      if (type === 'SoftwareApplication') {
        if (!squash(String(item.applicationCategory ?? ''))) add('has a SoftwareApplication with no applicationCategory')
        if (item.offers !== undefined && !(/^\d+(\.\d+)?$/.test(String(item.offers?.price ?? '')) && squash(String(item.offers?.priceCurrency ?? '')))) add('has a SoftwareApplication offer without a numeric price and a currency')
      }
    }
  }
  return { problems, blocks, pages: pagesWithData, faqPages }
}

function main(argv) {
  let dist = fileURLToPath(new URL('../../apps/public-web/dist', import.meta.url))
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist' && argv[i + 1]) dist = resolve(argv[++i])
    else throw new Error(`unknown option ${argv[i]}`)
  }
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`${dist} has no index.html; build the site first (npm run build:public)`)
  const result = checkJsonLd({ pages: builtPages(dist), fileExists: path => existsSync(join(dist, path)) })
  console.log(`json-ld: ${result.blocks} blocks on ${result.pages} pages, ${result.problems.length} problem(s)`)
  if (result.faqPages.length) console.log(`  note: FAQPage on ${result.faqPages.join(', ')} (no longer earns a rich result, G11; kept, not added elsewhere)`)
  for (const { where, problem } of result.problems) console.log(`  ${where} ${problem}`)
  if (result.problems.length) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(process.argv.slice(2)) } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
}
