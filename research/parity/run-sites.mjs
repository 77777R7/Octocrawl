#!/usr/bin/env node
// Real-site parity checks: run every case in sites.v1.json against a running
// W2L REST API, save each raw response and report which checks passed.
//
// Usage: npm run api   (in another terminal, from the repo root)
//        node research/parity/run-sites.mjs [--batch 1] [--only S01,S04] [--record <file.md>]
// Env:   W2L_API_URL (default http://127.0.0.1:8787)
//
// Raw responses and results.json go to .w2l/parity/<timestamp>/ (git-ignored).
// --record also writes the Markdown summary to <file.md>, for a dated record
// under research/parity/runs/. Exit code 0 only when every selected check passed.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const api = process.env.W2L_API_URL ?? 'http://127.0.0.1:8787'
const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const batchFilter = flag('--batch')
const onlyFilter = flag('--only')?.split(',').map((id) => id.trim())
const recordFile = flag('--record')
const outDir = join(here, '../../.w2l/parity', new Date().toISOString().replace(/[:.]/g, '-'))

const manifest = JSON.parse(await readFile(join(here, 'sites.v1.json'), 'utf8'))
const cases = manifest.cases.filter((c) =>
  (batchFilter === undefined || String(c.batch) === batchFilter) &&
  (onlyFilter === undefined || onlyFilter.includes(c.id)))

let commit = null
let dirty = null
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() !== ''
} catch {}

async function call(method, path, body) {
  const res = await fetch(api + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { httpStatus: res.status, json, text: json === null ? text : undefined }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Each runner returns { response, doc } where doc is the one scraped document
// the checks look at (for batch/crawl cases: the items array under doc.items).
const runners = {
  async scrape(c) {
    const response = await call('POST', '/v1/scrape', { url: c.url, ...c.request })
    return { response, doc: response.json ?? {} }
  },
  async 'fc-scrape'(c) {
    const response = await call('POST', '/fc/v1/scrape', { url: c.url, ...c.request })
    return { response, doc: response.json ?? {} }
  },
  async batch(c) {
    const start = await call('POST', '/v1/batches', { urls: c.urls, ...c.request })
    const taskId = start.json?.taskId
    if (!taskId) return { response: start, doc: start.json ?? {} }
    let status
    for (let i = 0; i < 120; i++) {
      status = await call('GET', `/v1/batches/${taskId}`)
      if (!['pending', 'running'].includes(status.json?.status)) break
      await sleep(2000)
    }
    const items = await call('GET', `/v1/batches/${taskId}/items?limit=50`)
    return { response: { start, status, items }, doc: { status: status.json?.status, items: items.json?.items ?? [] } }
  },
  async crawl(c) {
    const start = await call('POST', '/v1/crawl', { url: c.url, ...c.request })
    const taskId = start.json?.taskId
    if (!taskId) return { response: start, doc: start.json ?? {} }
    let status
    for (let i = 0; i < 150; i++) {
      status = await call('GET', `/v1/crawl/${taskId}`)
      if (!['pending', 'running'].includes(status.json?.status)) break
      await sleep(2000)
    }
    const pages = await call('GET', `/v1/crawl/${taskId}/pages?limit=100`)
    return { response: { start, status, pages }, doc: { status: status.json?.status, items: pages.json?.pages ?? pages.json?.items ?? [] } }
  },
}

// Markdown link and image targets: [text](target) and ![alt](target).
function markdownTargets(markdown) {
  const targets = []
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(match[1])
  return targets
}
const isAbsolute = (target) => /^(https?:|mailto:|tel:|data:)/i.test(target) || target.startsWith('#')

// The proxy endpoints a saved response records in evidence.envProxy: the API's own statement of its route.
function envProxies(value, found = new Set()) {
  if (Array.isArray(value)) for (const item of value) envProxies(item, found)
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'envProxy' && typeof inner === 'string') found.add(inner)
      else envProxies(inner, found)
    }
  }
  return found
}

function get(object, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object)
}

function check(doc, spec, response) {
  const markdown = typeof doc.markdown === 'string' ? doc.markdown : ''
  switch (spec.type) {
    case 'apiStatus':
      return { pass: response.httpStatus === spec.equals, actual: response.httpStatus }
    case 'field': {
      const actual = get(doc, spec.path)
      if ('in' in spec) return { pass: spec.in.includes(actual), actual }
      if ('notIn' in spec) return { pass: !spec.notIn.includes(actual), actual }
      if ('present' in spec) return { pass: (actual !== undefined && actual !== null && actual !== '') === spec.present, actual: actual === undefined ? 'undefined' : typeof actual }
      if ('includes' in spec) return { pass: typeof actual === 'string' && actual.includes(spec.includes), actual }
      return { pass: actual === spec.equals, actual }
    }
    case 'markdownIncludes':
      return { pass: markdown.includes(spec.text), actual: markdown.length === 0 ? 'no markdown' : undefined }
    case 'markdownExcludes':
      return { pass: markdown !== '' && !markdown.includes(spec.text), actual: markdown.length === 0 ? 'no markdown' : undefined }
    case 'markdownMatches':
      return { pass: new RegExp(spec.pattern, spec.flags ?? 'm').test(markdown), actual: markdown.length === 0 ? 'no markdown' : undefined }
    case 'markdownLinksAbsolute': {
      const relative = markdownTargets(markdown).filter((target) => !isAbsolute(target))
      return { pass: markdown !== '' && relative.length === 0, actual: markdown === '' ? 'no markdown' : `${relative.length} relative, e.g. ${relative.slice(0, 3).join(' ')}` }
    }
    case 'linksAbsolute': {
      const links = Array.isArray(doc.links) ? doc.links : null
      const relative = (links ?? []).filter((link) => !/^https?:\/\//.test(typeof link === 'string' ? link : link?.url ?? ''))
      return { pass: links !== null && links.length > 0 && relative.length === 0, actual: links === null ? 'no links field' : `${links.length} links, ${relative.length} relative` }
    }
    case 'linksInclude': {
      const links = (Array.isArray(doc.links) ? doc.links : []).map((link) => (typeof link === 'string' ? link : link?.url))
      return { pass: links.includes(spec.url), actual: `${links.length} links` }
    }
    case 'jsonIssue': {
      const issues = get(doc, spec.path ?? 'json.issues') ?? []
      const found = issues.some((issue) => JSON.stringify(issue).includes(spec.includes))
      return { pass: found, actual: JSON.stringify(issues).slice(0, 200) }
    }
    case 'eachItem': {
      const items = doc.items ?? []
      const failures = items.map((item) => check(item, spec.check, response)).filter((result) => !result.pass)
      return { pass: items.length >= (spec.minItems ?? 1) && failures.length === 0, actual: `${items.length} items, ${failures.length} failing${failures[0]?.actual ? `: ${failures[0].actual}` : ''}` }
    }
    case 'itemUrls': {
      const urls = (doc.items ?? []).map((item) => item.url ?? item.canonicalUrl ?? '')
      const bad = urls.filter((url) => !new RegExp(spec.pattern).test(url))
      return { pass: urls.length >= (spec.minItems ?? 1) && bad.length === 0, actual: `${urls.length} pages, ${bad.length} outside the pattern${bad[0] ? `: ${bad[0]}` : ''}` }
    }
    case 'anyOf': {
      const results = spec.checks.map((group) => group.map((inner) => check(doc, inner, response)))
      const pass = results.some((group) => group.every((result) => result.pass))
      return { pass, actual: results.map((group) => group.map((result) => (result.pass ? 'ok' : 'x')).join('')).join(' | ') }
    }
    default:
      return { pass: false, actual: `unknown check type ${spec.type}` }
  }
}

await mkdir(outDir, { recursive: true })
const startedAt = new Date().toISOString()
const results = []
for (const c of cases) {
  const runner = runners[c.endpoint ?? 'scrape']
  const began = Date.now()
  let outcome
  try {
    outcome = await runner(c)
  } catch (error) {
    outcome = { response: { error: String(error) }, doc: {} }
  }
  await writeFile(join(outDir, `${c.id}.json`), JSON.stringify(outcome.response, null, 2))
  const checks = c.checks.map((spec) => ({ ...spec, ...check(outcome.doc, spec, outcome.response.start ?? outcome.response) }))
  const passed = checks.filter((result) => result.pass).length
  results.push({ id: c.id, url: c.url ?? c.urls?.join(' '), endpoint: c.endpoint ?? 'scrape', seconds: Math.round((Date.now() - began) / 100) / 10, passed, total: checks.length, envProxies: [...envProxies(outcome.response)], checks })
  console.log(`${c.id} ${passed}/${checks.length} ${c.url ?? c.urls?.[0]}`)
  for (const result of checks.filter((r) => !r.pass)) console.log(`   ✗ [P1-${result.item}] ${result.type} ${result.text ?? result.pattern ?? result.path ?? result.url ?? ''} ${result.actual ?? ''}`)
}

const command = ['node', 'research/parity/run-sites.mjs', ...args].join(' ')
const summary = {
  manifest: manifest.id,
  command,
  api,
  sourceCommit: commit,
  workingTreeDirty: dirty,
  startedAt,
  finishedAt: new Date().toISOString(),
  casesPassed: results.filter((r) => r.passed === r.total).length,
  cases: results.length,
  checksPassed: results.reduce((sum, r) => sum + r.passed, 0),
  checks: results.reduce((sum, r) => sum + r.total, 0),
  results,
}
await writeFile(join(outDir, 'results.json'), JSON.stringify(summary, null, 2))

const proxyVars = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy', 'ALL_PROXY', 'all_proxy'].filter((name) => process.env[name])
const proxiedCases = results.filter((r) => r.envProxies.length > 0).length
const proxyEndpoints = [...new Set(results.flatMap((r) => r.envProxies))]
const lines = [
  `# Real-site run ${startedAt.slice(0, 10)}`,
  '',
  `Command: \`${command}\``,
  `Source commit: \`${commit ?? 'unknown'}\`${dirty ? ' (working tree had uncommitted changes)' : ''}`,
  `Run: ${startedAt} → ${summary.finishedAt} against ${api}`,
  `Network: ${proxyVars.length === 0 ? 'no proxy variables set in the runner' : `${proxyVars.join(', ')} set in the runner's environment`}; ${proxiedCases} of ${results.length} cases' responses record an environment proxy in evidence.envProxy${proxyEndpoints.length === 0 ? '' : ` (${proxyEndpoints.join(', ')})`}.`,
  '',
  `Cases fully passing: ${summary.casesPassed}/${summary.cases}; checks passing: ${summary.checksPassed}/${summary.checks}.`,
  '',
  '| Case | URL | Checks | Failed checks (P1 item) |',
  '| --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.id} | ${r.url} | ${r.passed}/${r.total} | ${r.checks.filter((x) => !x.pass).map((x) => `${x.type}${x.text ? ` "${x.text}"` : ''}${x.path ? ` ${x.path}` : ''} (${x.item})`).join('; ') || '—'} |`),
]
console.log(`\n${lines.join('\n')}\n\nRaw responses: ${outDir}`)
if (recordFile) await writeFile(recordFile, `${lines.join('\n')}\n`)
process.exitCode = summary.casesPassed === summary.cases ? 0 : 1
