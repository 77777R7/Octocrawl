#!/usr/bin/env node
// Checks the structured data (JSON-LD) of the built public site (publishing gate G11, docs/seo/library/policy-gates.md,
// the part a script can see): every block parses; every top-level object is a schema.org type this site uses; no
// ratings or reviews; every address in it is on the site's own origin (and a file it names exists) or on an allowed
// host; `url` and `mainEntityOfPage` equal the page's canonical; a TechArticle or BlogPosting has a headline that is on
// the page, a description equal to the meta description and, for a BlogPosting, dates that are valid, in order and equal
// to the article meta tags; a FAQPage appears only where it already did and each question and the start of each answer
// are on the page; a BreadcrumbList is numbered 1..n, ends at the page and lists built pages. Offline: it reads files, so
// CI runs it right after the build, next to check-sitemap.mjs.
//
//   npm run build:public && node scripts/seo/check-jsonld.mjs     the default dist is apps/public-web/dist
//   node scripts/seo/check-jsonld.mjs --dist DIR                  another built site
//
// It cannot tell whether a claim in the data is true (G11 also asks for the Rich Results Test, which needs the live
// site), only that what the data repeats about the page matches the page.

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { builtPages, headFacts } from './check-sitemap.mjs'

export const TOKEN = '__W2L_ORIGIN__'
export const ALLOWED_TYPES = new Set(['WebSite', 'Organization', 'SoftwareApplication', 'TechArticle', 'BlogPosting', 'Blog', 'BreadcrumbList', 'CollectionPage', 'FAQPage'])
// FAQPage no longer earns a rich result (G11), so it is not added to new pages. These two carry one already.
export const FAQ_PAGES = new Set(['/', '/scrape/'])
export const EXTERNAL_HOSTS = new Set(['github.com', 'schema.org'])
const FORBIDDEN_KEYS = new Set(['aggregateRating', 'AggregateRating', 'review', 'Review', 'reviewRating', 'ratingValue'])
const FILE_EXTENSION = /\.(png|jpe?g|webp|gif|svg|ico|pdf|txt|xml|json)$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = text => text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (all, dec, hex, name) => (dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()] ?? all))
const squash = text => text.replace(/\s+/g, ' ').trim()

/** The visible text of a page, roughly: scripts, styles and tags removed, entities decoded, spaces collapsed. */
export const pageText = html => squash(decode(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')))

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
  const problems = []
  let blocks = 0
  let pagesWithData = 0
  const faqPages = []
  for (const [path, html] of pages) {
    const raws = jsonLdBlocks(html)
    if (raws.length === 0) continue
    pagesWithData += 1
    blocks += raws.length
    const add = problem => problems.push({ where: path, problem })
    const facts = headFacts(html)
    const canonical = facts.canonicals.length === 1 ? facts.canonicals[0] : null
    if (canonical === null) add('has structured data but not exactly one canonical link to compare it with')
    const text = pageText(html)
    const items = []
    for (const raw of raws) {
      let parsed
      try { parsed = JSON.parse(raw) } catch { add('has a JSON-LD block that is not valid JSON'); continue }
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        if (item && typeof item === 'object') items.push(...(Array.isArray(item['@graph']) ? item['@graph'] : [item]))
        else add('has a JSON-LD entry that is not an object')
      }
    }
    for (const item of items) {
      const types = [].concat(item['@type'] ?? [])
      const type = types[0] ?? '(none)'
      if (types.length === 0) add('has a JSON-LD object with no @type')
      for (const one of types) if (!ALLOWED_TYPES.has(one)) add(`has a JSON-LD object of type ${one}, which this site does not use (add it to ALLOWED_TYPES when it is meant)`)
      if (item['@context'] !== 'https://schema.org') add(`has a ${type} object whose @context is ${JSON.stringify(item['@context'])}, not https://schema.org`)

      const walk = (value, key) => {
        if (Array.isArray(value)) value.forEach(entry => walk(entry, key))
        else if (value && typeof value === 'object') for (const [name, entry] of Object.entries(value)) {
          if (FORBIDDEN_KEYS.has(name)) add(`has ${name} in a ${type} object; ratings and reviews are only for real, visible ones (G11)`)
          walk(entry, name)
        } else if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith(origin))) {
          if (value.startsWith(origin)) {
            const local = value.slice(origin.length).replace(/[?#].*$/, '')
            if (FILE_EXTENSION.test(local) && !fileExists(local)) add(`names ${value} in ${key}, which is not in the build`)
          } else {
            const host = new URL(value).host
            if (!EXTERNAL_HOSTS.has(host)) add(`names ${value} in ${key}, on ${host}, which is not an allowed host`)
          }
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
          if (!text.includes(name)) add(`has a FAQ question that is not on the page: "${name.slice(0, 60)}"`)
          if (!text.includes(answer.slice(0, 60))) add(`has a FAQ answer whose start is not on the page: "${answer.slice(0, 60)}"`)
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
        for (const address of addresses) if (address.startsWith(origin) && !pages.has(address.slice(origin.length))) add(`has a BreadcrumbList item ${address} that is not a built page`)
        continue
      }

      if (canonical !== null && typeof item.url === 'string' && item.url !== canonical) add(`has a ${type} whose url is ${item.url}, not the canonical ${canonical}`)
      const entity = idOf(item.mainEntityOfPage)
      if (canonical !== null && entity !== null && entity !== canonical) add(`has a ${type} whose mainEntityOfPage is ${entity}, not the canonical ${canonical}`)
      if (['WebSite', 'Organization', 'SoftwareApplication', 'CollectionPage'].includes(type) && !squash(String(item.name ?? ''))) add(`has a ${type} with no name`)

      if (type === 'TechArticle' || type === 'BlogPosting') {
        const headline = squash(String(item.headline ?? ''))
        if (!headline) add(`has a ${type} with no headline`)
        else if (!text.includes(headline)) add(`has a ${type} headline that is not on the page: "${headline.slice(0, 60)}"`)
        const description = facts.descriptions[0] === undefined ? null : squash(decode(facts.descriptions[0]))
        if (squash(decode(String(item.description ?? ''))) !== description) add(`has a ${type} description that is not the meta description`)
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
