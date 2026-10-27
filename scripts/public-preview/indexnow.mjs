#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver and others share one endpoint) which of the public site's
// pages are new, changed or gone. Run it after a deploy that changes pages: `node scripts/public-preview/indexnow.mjs`.
//
//   node scripts/public-preview/indexnow.mjs             send the URLs that are new or changed since the last submission
//   node scripts/public-preview/indexnow.mjs --dry-run   print what it would send, send nothing and write no state
//   node scripts/public-preview/indexnow.mjs --all       send every URL, ignoring the state (a migration; not a routine)
//
// It reads the live sitemap and the live key file, so it submits only what the site really serves, and IndexNow checks
// the key against https://<host>/indexnow-key.txt (apps/public-web/public/indexnow-key.txt). A page changed when its
// sitemap lastmod differs from the one sent last time; a page with no lastmod (the changelog) when the hash of its
// Markdown copy (<url>index.md) does, and one with neither is sent every time and listed; a copy that cannot be read this
// time (anything but a 404) leaves the page as last sent. A 202 (key validation pending) is recorded as not confirmed, and
// the next run sends those URLs again. A URL the sitemap dropped is
// sent as deleted only if it answers 404 or 410. A URL sent less than five minutes ago is held back, and after a 429
// nothing is sent for ten minutes (publishing gate G13, docs/seo/library/policy-gates.md). The first run, with no state,
// sends every URL once. The state (indexnow-state.json) and a log of every response (indexnow-log.jsonl) are kept in
// W2L_SEO_DIR, by default .w2l/seo of the main checkout, so every worktree shares them; they are git-ignored.
// W2L_PUBLIC_ORIGIN picks another site, W2L_INDEXNOW_ENDPOINT another endpoint (the tests use a local one).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSitemap } from '../seo/sitemap.mjs'
import { afterResponse, batches, emptyState, fingerprintOf, plan, readState } from './indexnow-lib.mjs'

/** A page's Markdown copy as a hash: { hash }, { missing } when the site has no copy (404), { unreadable } when the
 * request failed or answered anything else, which says nothing about whether the page changed. */
async function markdownHash(loc) {
  try {
    const response = await fetch(`${loc}index.md`, { signal: AbortSignal.timeout(30_000) })
    if (response.status === 404) return { missing: true }
    if (!response.ok) return { unreadable: true }
    return { hash: createHash('sha256').update(await response.text()).digest('hex').slice(0, 16) }
  } catch { return { unreadable: true } }
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

function stateDir() {
  if (process.env.W2L_SEO_DIR) return resolve(process.env.W2L_SEO_DIR)
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return join(resolve(common, '..'), '.w2l', 'seo')
  } catch { return resolve('.w2l', 'seo') }
}

export function parseArgs(argv) {
  const options = { dryRun: false, all: false }
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--all') options.all = true
    else throw new Error(`unknown option ${arg}`)
  }
  return options
}

async function main(argv) {
  const options = parseArgs(argv)
  const origin = (process.env.W2L_PUBLIC_ORIGIN || 'https://octocrawl.dev').replace(/\/$/, '')
  const endpoint = process.env.W2L_INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow'
  const dir = stateDir()
  const stateFile = join(dir, 'indexnow-state.json')
  const now = new Date()

  const key = (await fetchText(`${origin}/indexnow-key.txt`)).trim()
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('The live IndexNow key file does not hold a valid key')
  const sitemap = parseSitemap(await fetchText(`${origin}/sitemap.xml`))
  if (sitemap.length === 0) throw new Error('The live sitemap lists no URLs')
  if (sitemap.some(entry => new URL(entry.loc).origin !== origin)) throw new Error(`The sitemap lists URLs outside ${origin}`)

  const entries = []
  for (const entry of sitemap) {
    const copy = entry.lastmod ? {} : await markdownHash(entry.loc)
    entries.push({ loc: entry.loc, fingerprint: fingerprintOf(entry, copy.hash ?? null), unreadable: Boolean(copy.unreadable) })
  }
  const fingerprints = new Map(entries.map(entry => [entry.loc, entry.fingerprint]))

  const first = !existsSync(stateFile)
  let state = first ? emptyState(origin) : readState(readFileSync(stateFile, 'utf8'), origin)
  const p = plan({ entries, state, now, all: options.all })
  if (p.blockedUntil) {
    console.log(`IndexNow asked us to wait: nothing is sent until ${p.blockedUntil}`)
    process.exitCode = 1
    return
  }

  const deleted = []
  for (const loc of p.gone) {
    const status = await fetch(loc, { redirect: 'manual', signal: AbortSignal.timeout(30_000) }).then(response => response.status, () => null)
    if (status === 404 || status === 410) deleted.push(loc)
    else console.log(`${loc} is no longer in the sitemap but answers ${status ?? 'nothing'}, so it is not sent as deleted`)
  }

  console.log(`${origin}: ${entries.length} URLs in the sitemap; ${p.fresh.length} new, ${p.changed.length} changed, ${p.unchanged.length + p.unreadable.length} unchanged, ${p.recent.length} held back (sent less than 5 minutes ago), ${deleted.length} deleted`)
  if (first) console.log('No earlier submission is recorded, so this first run sends every URL once.')
  if (options.all) console.log('--all: every URL is sent, whatever the state says.')
  if (p.uncomparable.length) console.log(`No lastmod and no Markdown copy to compare, so sent every time: ${p.uncomparable.join(', ')}`)
  if (p.unreadable.length) console.log(`Could not read the Markdown copy of ${p.unreadable.join(', ')}, so it is left as last sent and compared again next time.`)
  const urlList = [...p.send, ...deleted]
  if (options.dryRun) {
    for (const loc of urlList) console.log(`  would send ${loc}${deleted.includes(loc) ? ' (deleted)' : ''}`)
    console.log('--dry-run: nothing was sent and no state was written.')
    return
  }
  if (urlList.length === 0) { console.log('Nothing to send.'); return }

  mkdirSync(dir, { recursive: true })
  for (const batch of batches(urlList)) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/indexnow-key.txt`, urlList: batch }),
      signal: AbortSignal.timeout(30_000),
    })
    const body = response.status === 200 || response.status === 202 ? '' : await response.text().catch(() => '')
    appendFileSync(join(dir, 'indexnow-log.jsonl'), `${JSON.stringify({ at: now.toISOString(), origin, status: response.status, urls: batch, deleted: batch.filter(loc => deleted.includes(loc)), all: options.all, body: body.slice(0, 300) })}\n`)
    // 200: accepted; 202: accepted, key validation pending. Anything else is a failure worth reading.
    console.log(`IndexNow ${response.status} for ${batch.length} URLs from ${origin}`)
    state = afterResponse(state, { status: response.status, sent: batch.filter(loc => !deleted.includes(loc)), deleted: batch.filter(loc => deleted.includes(loc)), fingerprints, now })
    writeFileSync(`${stateFile}.tmp`, `${JSON.stringify(state, null, 2)}\n`)
    renameSync(`${stateFile}.tmp`, stateFile)
    if (response.status !== 200 && response.status !== 202) {
      console.log(body)
      process.exitCode = 1
      return
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
