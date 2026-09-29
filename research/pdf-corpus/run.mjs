#!/usr/bin/env node
// PDF text on real reports: for every report in manifest.v1.json, reuse or
// download the PDF, check its SHA-256, run pdfToMarkdown and evaluate the
// manifest's checks (a phrase or number that must be on a given page).
//
// Usage: node research/pdf-corpus/run.mjs [--only S1,R2] [--record <file.md>]
//        It first runs `tsc --build packages/extract-tf`, so the measured build is
//        the current source, then loads packages/extract-tf/dist with plain Node
//        (tsx would transform pdf.js too and add some 400 MB to the memory figures).
//
// Files live in .w2l/pdf-corpus/<id>.pdf (git-ignored). A missing file is
// downloaded once: robots.txt of each host on the way is read first (User-agent *
// group, RFC 9309; a 4xx robots.txt allows everything, a 5xx or an unreachable one
// disallows), redirects are followed by hand, and requests go through
// HTTPS_PROXY / HTTP_PROXY (NO_PROXY honoured) with the research User-Agent.
// A report without a recorded sha256 gets the downloaded file's hash written into
// the manifest; a different hash fails the report.
//
// Markdown outputs and results.json go to .w2l/pdf-corpus/runs/<timestamp>/.
// --record also writes the Markdown summary, for a dated record under
// research/pdf-corpus/runs/. Exit code 0 only when every selected report passed.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EnvHttpProxyAgent, fetch } from 'undici'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const only = flag('--only')?.split(',').map((id) => id.trim())
const recordFile = flag('--record')
const startedAt = new Date().toISOString()
const filesDir = join(root, '.w2l/pdf-corpus')
const outDir = join(filesDir, 'runs', startedAt.replace(/[:.]/g, '-'))
const manifestPath = join(here, 'manifest.v1.json')
const UA = 'Mozilla/5.0 (compatible; w2l-research/0.1; +https://github.com/77777R7/w2l; research benchmark, one request per page)'

execFileSync(join(root, 'node_modules/.bin/tsc'), ['--build', join(root, 'packages/extract-tf')], { stdio: 'inherit' })
const { pdfToMarkdown, PDF_TEXT_VERSION } = await import('../../packages/extract-tf/dist/index.js')
const pdfjsVersion = JSON.parse(await readFile(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'), 'utf8')).version

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const reports = manifest.reports.filter((report) => only === undefined || only.includes(report.id))

let commit = null
let dirty = null
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim() !== ''
} catch {}

const dispatcher = new EnvHttpProxyAgent()
const robotsCache = new Map()

/** Whether robots.txt lets the User-agent * group fetch url. */
async function robots(url) {
  const target = new URL(url)
  if (!robotsCache.has(target.origin)) {
    const robotsUrl = `${target.origin}/robots.txt`
    let verdict
    try {
      const res = await fetch(robotsUrl, { dispatcher, headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) })
      if (res.status >= 500) verdict = { rules: null, note: `${robotsUrl}: HTTP ${res.status}, disallow all` }
      else if (res.status >= 400) verdict = { rules: [], note: `${robotsUrl}: HTTP ${res.status}, no restrictions` }
      else verdict = { rules: starRules(await res.text()), note: `${robotsUrl}: HTTP ${res.status}` }
    } catch (error) {
      verdict = { rules: null, note: `${robotsUrl}: unreachable (${error.message}), disallow all` }
    }
    robotsCache.set(target.origin, verdict)
  }
  const { rules, note } = robotsCache.get(target.origin)
  if (rules === null) return { allowed: false, note }
  const path = target.pathname + target.search
  // * matches any run of characters and a final $ anchors the end; everything else is literal.
  const pattern = (rule) => new RegExp(`^${rule.pattern.replace(/\$$/, '\0').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace('\0', '$')}`)
  const matching = rules.filter((rule) => pattern(rule).test(path))
  const best = matching.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow))[0]
  return { allowed: best === undefined || best.allow, note: best ? `${note}, ${best.allow ? 'Allow' : 'Disallow'}: ${best.pattern}` : note }
}

/** Allow and Disallow rules of every group whose User-agent lines include *. */
function starRules(text) {
  const rules = []
  let agents = []
  let inRules = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      if (inRules) agents = []
      inRules = false
      agents.push(value.toLowerCase())
    } else if (key === 'allow' || key === 'disallow') {
      inRules = true
      if (agents.includes('*') && value !== '') rules.push({ allow: key === 'allow', pattern: value })
    }
  }
  return rules
}

async function download(url) {
  let current = url
  for (let hop = 0; hop < 6; hop++) {
    const allowed = await robots(current)
    if (!allowed.allowed) throw new Error(`robots.txt disallows ${current} (${allowed.note})`)
    const res = await fetch(current, { dispatcher, redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(300_000) })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      current = new URL(location, current).href
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${current}`)
    return { bytes: new Uint8Array(await res.arrayBuffer()), finalUrl: current }
  }
  throw new Error(`more than 5 redirects from ${url}`)
}

const collapse = (text) => text.replace(/\s+/g, ' ').trim()
const mb = (bytes) => Math.round(bytes / 1e5) / 10

await mkdir(outDir, { recursive: true })
let manifestChanged = false
const results = []
for (const report of reports) {
  const file = join(filesDir, `${report.id}.pdf`)
  const result = { id: report.id, publisher: report.publisher, url: report.url, file: 'reused', expectedPages: report.expectedPages, checks: [] }
  results.push(result)
  let bytes
  try {
    bytes = new Uint8Array(await readFile(file))
  } catch {
    try {
      const fetched = await download(report.url)
      bytes = fetched.bytes
      await writeFile(file, bytes)
      result.file = `downloaded from ${fetched.finalUrl}`
    } catch (error) {
      result.error = `download failed: ${error.message}`
      console.log(`${report.id} ✗ ${result.error}`)
      continue
    }
  }
  result.bytes = bytes.length
  result.sha256 = createHash('sha256').update(bytes).digest('hex')
  if (report.sha256 == null) {
    report.sha256 = result.sha256
    report.bytes = bytes.length
    manifestChanged = true
    result.sha256Recorded = true
  }
  result.sha256Ok = report.sha256 === result.sha256

  const began = performance.now()
  const out = await pdfToMarkdown(bytes)
  result.ms = Math.round(performance.now() - began)
  result.rssMb = mb(process.memoryUsage().rss)
  if (!out.ok) {
    result.error = `${out.error.code}: ${out.error.message}`
  } else {
    await writeFile(join(outDir, `${report.id}.md`), out.markdown)
    result.pageCount = out.info.pageCount
    result.pagesRead = out.pages.length
    result.offsetsOk = out.pages.every((page) => out.markdown.slice(page.start, page.end) === page.text)
    result.warnings = {}
    for (const warning of out.warnings) (result.warnings[warning.code] ??= []).push(warning.page ?? null)
    result.checks = report.checks.map((check) => {
      const page = out.pages.find((candidate) => candidate.number === check.page)
      const pass = page !== undefined && collapse(page.text).includes(collapse(check.text))
      const foundOn = pass ? [check.page] : out.pages.filter((candidate) => collapse(candidate.text).includes(collapse(check.text))).map((candidate) => candidate.number)
      return { ...check, pass, foundOn }
    })
  }
  const passedChecks = result.checks.filter((check) => check.pass).length
  result.pass = result.error === undefined && result.sha256Ok && result.offsetsOk && result.pageCount === report.expectedPages &&
    result.pagesRead === report.expectedPages && passedChecks === report.checks.length
  console.log(`${report.id} ${result.pass ? '✓' : '✗'} pages ${result.pagesRead ?? '-'}/${report.expectedPages} checks ${passedChecks}/${report.checks.length} ${result.ms ?? '-'} ms${result.error ? ` ${result.error}` : ''}`)
}
if (manifestChanged) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const command = ['node', 'research/pdf-corpus/run.mjs', ...args].join(' ')
const maxRssMb = mb(process.resourceUsage().maxRSS * 1024)
const summary = {
  manifest: manifest.id,
  command,
  sourceCommit: commit,
  workingTreeDirty: dirty,
  node: process.version,
  pdfjsDist: pdfjsVersion,
  pdfText: PDF_TEXT_VERSION,
  startedAt,
  finishedAt: new Date().toISOString(),
  reportsPassed: results.filter((r) => r.pass).length,
  reports: results.length,
  checksPassed: results.reduce((sum, r) => sum + r.checks.filter((c) => c.pass).length, 0),
  checks: reports.reduce((sum, r) => sum + r.checks.length, 0),
  pagesRead: results.reduce((sum, r) => sum + (r.pagesRead ?? 0), 0),
  pagesExpected: reports.reduce((sum, r) => sum + r.expectedPages, 0),
  maxRssMb,
  results,
}
await writeFile(join(outDir, 'results.json'), JSON.stringify(summary, null, 2))

const proxyVars = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'].filter((name) => process.env[name])
const downloaded = results.filter((r) => r.file.startsWith('downloaded')).length
const warningsOf = (r) => Object.entries(r.warnings ?? {}).filter(([code]) => code !== 'tables_unverified')
  .map(([code, pages]) => `${code}${pages.some((p) => p !== null) ? ` (p. ${pages.join(', ')})` : ''}`).join('; ')
const largest = [...results].filter((r) => r.ms !== undefined).sort((a, b) => b.bytes - a.bytes)[0]
const lines = [
  `# PDF text corpus run ${startedAt.slice(0, 10)}`,
  '',
  `Command: \`${command}\``,
  `Source commit: \`${commit ?? 'unknown'}\`${dirty ? ' (working tree had uncommitted changes)' : ''}`,
  `Run: ${startedAt} → ${summary.finishedAt}; Node ${process.version}, pdfjs-dist ${pdfjsVersion}, ${PDF_TEXT_VERSION}, default options`,
  `Files: ${results.length - downloaded} reused from .w2l/pdf-corpus/, ${downloaded} downloaded${downloaded > 0 ? ` (${proxyVars.length === 0 ? 'no proxy variables set' : `${proxyVars.join(', ')} set`})` : ''}.`,
  '',
  `Reports passing: ${summary.reportsPassed}/${summary.reports}; checks passing: ${summary.checksPassed}/${summary.checks}; pages read: ${summary.pagesRead}/${summary.pagesExpected}.`,
  '',
  '| Report | Publisher | Pages | SHA-256 | Checks | Time | Warnings besides tables_unverified | Failed |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.id} | ${r.publisher} | ${r.pagesRead ?? '—'}/${r.expectedPages} | ${r.sha256Ok === undefined ? '—' : r.sha256Ok ? 'match' : 'differs'} | ${r.checks.filter((c) => c.pass).length}/${manifest.reports.find((m) => m.id === r.id).checks.length} | ${r.ms ?? '—'} ms | ${warningsOf(r) || '—'} | ${r.error ?? (r.checks.filter((c) => !c.pass).map((c) => `p. ${c.page} "${c.text}"${c.foundOn.length ? ` (found on p. ${c.foundOn.join(', ')})` : ' (absent)'}`).join('; ') || '—')} |`),
  '',
  `Time is pdfToMarkdown on bytes in memory, including pdf.js loading on the first report. Largest file: ${largest ? `${largest.id}, ${mb(largest.bytes)} MB, ${largest.pagesRead} pages, ${largest.ms} ms` : 'none'}; peak resident memory of the whole run ${maxRssMb} MB.`,
]
console.log(`\n${lines.join('\n')}\n\nOutputs: ${outDir}`)
if (recordFile) await writeFile(recordFile, `${lines.join('\n')}\n`)
process.exitCode = summary.reportsPassed === summary.reports ? 0 : 1
