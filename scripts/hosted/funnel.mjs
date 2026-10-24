#!/usr/bin/env node
// The hosted usage funnel, week by week: accounts that signed up, that hold a key or an OAuth MCP connection, that
// called the hosted API (scrape or map), and that ran a hosted crawl or batch job. Counts only: it prints no address,
// uid, key or URL.
//
//   node scripts/hosted/funnel.mjs                     the last 7 days and everything the records still hold
//   node scripts/hosted/funnel.mjs --days 14           another window (1 to 30 days)
//   node scripts/hosted/funnel.mjs --json              the numbers as JSON instead
//   W2L_FUNNEL_INTERNAL=uid1,uid2 node …               counts those accounts apart, as internal (the operator's own);
//                                                      without it, the uids in .w2l/funnel-internal.txt (git-ignored,
//                                                      one a line, # starts a comment)
//
// It reads Firestore with the local gcloud login and needs W2L_PROJECT_ID. Behind a proxy, run it with
// NODE_USE_ENV_PROXY=1 so Node's own requests use HTTPS_PROXY. A source that cannot be read is reported as not read,
// never as zero.
//
// What each step can see, and for how long (the records' own retention, so "ever" is bounded):
//   signed up        users/{uid}.createdAtMs (kept until the account is deleted)
//   key or MCP       hostedApiKeys with a uid (keys and OAuth connections both write one; kept until deleted)
//   called the API   creditUsage/{uid}-{day} (scrape and map, the Playground too; 90 days)
//   ran a job        hostedJobs (created in the job JSON; 30 to 37 days)
// Every step counts only accounts whose users/{uid} still exists. Sign-ups are also counted by their first source
// (users/{uid}.firstSource, written from the w2l_src cookie since GTM gate R5), and from the service's logs (30 days):
// keyless addresses that started a call (hosted_keyless_usage, by the address's keyed hash) and MCP connections by the
// client's name (hosted_mcp_initialize). Log counts include the operator's own calls, which they cannot tell apart.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DAY_MS = 86_400_000

function parseArgs(argv) {
  const options = { days: 7, json: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') options.json = true
    else if (argv[i] === '--days') options.days = Number(argv[++i])
    else throw new Error(`unknown option ${argv[i]}`)
  }
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 30) throw new Error('--days must be 1 to 30')
  return options
}

/**
 * The funnel from the collections' documents: for every step, accounts in the window and accounts over everything the
 * records hold, each split into external and internal. A step whose source was not read is null, not zero.
 */
export function summarizeFunnel(sources, { now, days, internal }) {
  const since = now - days * DAY_MS
  const sinceDay = new Date(since).toISOString().slice(0, 10)
  // Only accounts that still exist: a deleted account's keys, usage and jobs outlive it for a while.
  const exists = sources.users && new Set(sources.users.map(doc => doc.name.split('/').pop()))
  const split = uids => {
    if (uids === null) return null
    const all = [...uids].filter(uid => exists === null || exists.has(uid))
    return { external: all.filter(uid => !internal.has(uid)).length, internal: all.filter(uid => internal.has(uid)).length }
  }
  const field = (doc, name) => doc.fields?.[name]
  const users = sources.users
  const signedUp = users && new Set(users.map(doc => doc.name.split('/').pop()))
  const signedUpRecent = users && new Set(users.filter(doc => Number(field(doc, 'createdAtMs')?.integerValue ?? 0) >= since).map(doc => doc.name.split('/').pop()))
  const keys = sources.keys
  const keyUids = keys && new Set(keys.map(doc => field(doc, 'uid')?.stringValue).filter(Boolean))
  const keyUidsRecent = keys && new Set(keys.filter(doc => Date.parse(field(doc, 'createdAt')?.timestampValue ?? '') >= since).map(doc => field(doc, 'uid')?.stringValue).filter(Boolean))
  const oauthUids = keys && new Set(keys.filter(doc => field(doc, 'kind')?.stringValue === 'oauth').map(doc => field(doc, 'uid')?.stringValue).filter(Boolean))
  const usage = sources.usage
  const called = usage && new Set(usage.map(doc => field(doc, 'uid')?.stringValue).filter(Boolean))
  const calledRecent = usage && new Set(usage.filter(doc => (field(doc, 'day')?.stringValue ?? '') >= sinceDay).map(doc => field(doc, 'uid')?.stringValue).filter(Boolean))
  const jobs = sources.jobs
  const parsed = jobs && jobs.map(doc => { try { return JSON.parse(field(doc, 'job')?.stringValue ?? 'null') } catch { return null } }).filter(Boolean)
  const ranJob = parsed && new Set(parsed.map(job => job.uid))
  const ranJobRecent = parsed && new Set(parsed.filter(job => Date.parse(job.createdAt) >= since).map(job => job.uid))
  const jobCount = parsed && { all: parsed.length, recent: parsed.filter(job => Date.parse(job.createdAt) >= since).length, externalRecent: parsed.filter(job => Date.parse(job.createdAt) >= since && !internal.has(job.uid)).length }
  // External sign-ups by first source, in the window and over everything held.
  const bySource = users && (() => {
    const counts = new Map()
    for (const doc of users) {
      const uid = doc.name.split('/').pop()
      if (internal.has(uid)) continue
      const label = firstSourceLabel(field(doc, 'firstSource'))
      const count = counts.get(label) ?? { recent: 0, held: 0 }
      count.held++
      if (Number(field(doc, 'createdAtMs')?.integerValue ?? 0) >= since) count.recent++
      counts.set(label, count)
    }
    return [...counts].map(([source, count]) => ({ source, ...count })).sort((a, b) => b.held - a.held || a.source.localeCompare(b.source))
  })()
  const keyless = sources.keyless && (() => {
    const lines = sources.keyless.map(entry => entry.jsonPayload ?? {})
    return { addresses: new Set(lines.map(line => line.address).filter(Boolean)).size, starts: lines.length, claudeStarts: lines.filter(line => line.pool === 'claude').length }
  })()
  const clients = sources.initialize && (() => {
    const counts = new Map()
    for (const entry of sources.initialize) { const name = entry.jsonPayload?.client ?? '(none given)'; counts.set(name, (counts.get(name) ?? 0) + 1) }
    return [...counts].map(([client, connections]) => ({ client, connections })).sort((a, b) => b.connections - a.connections || a.client.localeCompare(b.client))
  })()
  return {
    window: { days, since: new Date(since).toISOString(), until: new Date(now).toISOString() },
    steps: [
      { step: 'signed up', recent: split(signedUpRecent), held: split(signedUp), source: 'users', error: sources.errors.users ?? null },
      { step: 'has a key or an MCP connection', recent: split(keyUidsRecent), held: split(keyUids), source: 'hostedApiKeys', error: sources.errors.keys ?? null },
      { step: '  of which an OAuth MCP connection', recent: null, held: split(oauthUids), source: 'hostedApiKeys kind oauth', error: sources.errors.keys ?? null },
      { step: 'called the hosted API', recent: split(calledRecent), held: split(called), source: 'creditUsage (90 days)', error: sources.errors.usage ?? null },
      { step: 'ran a hosted job', recent: split(ranJobRecent), held: split(ranJob), source: 'hostedJobs (30-37 days)', error: sources.errors.jobs ?? null },
    ],
    jobs: jobCount,
    bySource: bySource ? { rows: bySource, error: null } : { rows: null, error: sources.errors.users ?? null },
    keyless: { counts: keyless, truncated: sources.truncated?.keyless ?? false, error: sources.errors.keyless ?? null },
    clients: { rows: clients, truncated: sources.truncated?.initialize ?? false, error: sources.errors.initialize ?? null },
  }
}

/** A first source's short name, as packages/public-preview/src/site.ts sourceLabel gives it. */
export function firstSourceLabel(value) {
  if (value === undefined) return 'not recorded (before it was, no w2l_src cookie, or Do Not Track)'
  const fields = value.mapValue?.fields ?? {}
  const text = name => fields[name]?.stringValue
  return text('utmSource') ?? text('ref') ?? (text('from') ? `from:${text('from')}` : text('via') ? `via:${text('via')}` : text('landing') ? 'direct' : 'unknown')
}

export function renderFunnel(summary) {
  const cell = value => value === null ? 'not read' : `${value.external} (+${value.internal} internal)`
  const lines = [
    `# Hosted usage funnel, ${summary.window.since.slice(0, 10)} to ${summary.window.until.slice(0, 10)} (UTC)`,
    '',
    `Accounts at each step: in the last ${summary.window.days} days, and over everything the records still hold. "Internal" are the operator's own accounts (W2L_FUNNEL_INTERNAL or .w2l/funnel-internal.txt).`,
    '',
    `| Step | Last ${summary.window.days} days | Held in the records | Source |`,
    '| --- | --- | --- | --- |',
    ...summary.steps.map(step => `| ${step.step} | ${step.recent === null && step.error === null ? '—' : step.error ? 'not read' : cell(step.recent)} | ${step.error ? `not read: ${step.error}` : cell(step.held)} | ${step.source} |`),
    '',
    summary.jobs === null ? 'Jobs: not read.' : `Jobs started: ${summary.jobs.recent} in the window (${summary.jobs.externalRecent} by external accounts), ${summary.jobs.all} held in the records.`,
    '',
    '## External sign-ups by first source',
    '',
    ...(summary.bySource.rows === null ? [`Not read: ${summary.bySource.error}`] : summary.bySource.rows.length === 0 ? ['None.'] : [
      `| First source | Last ${summary.window.days} days | Held in the records |`, '| --- | --- | --- |',
      ...summary.bySource.rows.map(row => `| ${row.source} | ${row.recent} | ${row.held} |`),
    ]),
    '',
    `## From the service's logs, last ${summary.window.days} days (the operator's own calls included)`,
    '',
    summary.keyless.counts === null ? `Keyless starts: not read: ${summary.keyless.error}` : `Keyless starts: ${summary.keyless.counts.starts} (${summary.keyless.counts.claudeStarts} from Claude's connectors), from ${summary.keyless.counts.addresses} address${summary.keyless.counts.addresses === 1 ? '' : 'es'}${summary.keyless.truncated ? ' (more lines than were read: a lower bound)' : ''}.`,
    '',
    ...(summary.clients.rows === null ? [`MCP connections by client: not read: ${summary.clients.error}`] : summary.clients.rows.length === 0 ? ['MCP connections by client: none.'] : [
      `MCP connections by client${summary.clients.truncated ? ' (more lines than were read: a lower bound)' : ''}:`, '', '| Client | Connections |', '| --- | --- |',
      ...summary.clients.rows.map(row => `| ${row.client.replace(/\|/g, '/')} | ${row.connections} |`),
    ]),
  ]
  return lines.join('\n')
}

async function firestoreList(project, token, collection, mask) {
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}`
  const masks = mask.map(name => `&mask.fieldPaths=${encodeURIComponent(name)}`).join('')
  const documents = []
  for (let pageToken = ''; ;) {
    const response = await fetch(`${base}?pageSize=300${masks}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers: { authorization: `Bearer ${token}`, 'x-goog-user-project': project }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`${collection} answered ${response.status}`)
    const page = await response.json()
    documents.push(...(page.documents ?? []))
    if (!page.nextPageToken) return documents
    pageToken = page.nextPageToken
  }
}

/** Log entries of one event since a time, newest first, a page at a time up to `max`; `truncated` when more were left. */
async function logEntries(project, token, event, since, max = 20_000) {
  const entries = []
  for (let pageToken = ''; ;) {
    const response = await fetch('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'content-type': 'application/json' }, signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ resourceNames: [`projects/${project}`], filter: `resource.type="cloud_run_revision" AND jsonPayload.event="${event}" AND timestamp>="${since}"`, orderBy: 'timestamp desc', pageSize: 1000, ...(pageToken ? { pageToken } : {}) }),
    })
    if (!response.ok) throw new Error(`logs answered ${response.status}`)
    const page = await response.json()
    entries.push(...(page.entries ?? []))
    if (!page.nextPageToken) return { entries, truncated: false }
    if (entries.length >= max) return { entries, truncated: true }
    pageToken = page.nextPageToken
  }
}

/** The operator's own accounts: W2L_FUNNEL_INTERNAL, else .w2l/funnel-internal.txt, else none. */
function internalUids() {
  const listed = process.env.W2L_FUNNEL_INTERNAL
  if (listed !== undefined && listed.trim() !== '') return { uids: new Set(listed.split(',').map(uid => uid.trim()).filter(Boolean)), from: 'W2L_FUNNEL_INTERNAL' }
  const file = fileURLToPath(new URL('../../.w2l/funnel-internal.txt', import.meta.url))
  try {
    const uids = readFileSync(file, 'utf8').split('\n').map(line => line.replace(/#.*/, '').trim()).filter(Boolean)
    return { uids: new Set(uids), from: '.w2l/funnel-internal.txt' }
  } catch { return { uids: new Set(), from: 'none (no W2L_FUNNEL_INTERNAL, no .w2l/funnel-internal.txt)' } }
}

async function main(argv) {
  const options = parseArgs(argv)
  const project = process.env.W2L_PROJECT_ID
  if (!project) throw new Error('Set W2L_PROJECT_ID to the Google Cloud project of the hosted API')
  const { uids: internal, from: internalFrom } = internalUids()
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
  const now = Date.now()
  const sources = { errors: {}, truncated: {} }
  const read = async (name, collection, mask) => {
    try { sources[name] = await firestoreList(project, token, collection, mask) }
    catch (error) { sources[name] = null; sources.errors[name] = error instanceof Error ? error.message : String(error) }
  }
  await Promise.all([
    read('users', 'users', ['createdAtMs', 'firstSource']),
    read('keys', 'hostedApiKeys', ['uid', 'kind', 'createdAt']),
    read('usage', 'creditUsage', ['uid', 'day']),
    read('jobs', 'hostedJobs', ['job']),
    ...[['keyless', 'hosted_keyless_usage'], ['initialize', 'hosted_mcp_initialize']].map(async ([name, event]) => {
      try { const read = await logEntries(project, token, event, new Date(now - options.days * DAY_MS).toISOString()); sources[name] = read.entries; sources.truncated[name] = read.truncated }
      catch (error) { sources[name] = null; sources.errors[name] = error instanceof Error ? error.message : String(error) }
    }),
  ])
  const summary = { ...summarizeFunnel(sources, { now, days: options.days, internal }), internalFrom, internalCount: internal.size }
  console.log(options.json ? JSON.stringify(summary, null, 2) : `${renderFunnel(summary)}\n\nInternal accounts: ${internal.size}, from ${internalFrom}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
}
