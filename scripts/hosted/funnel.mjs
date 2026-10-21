#!/usr/bin/env node
// The hosted usage funnel, week by week: accounts that signed up, that hold a key or an OAuth MCP connection, that
// called the hosted API (scrape or map), and that ran a hosted crawl or batch job. Counts only: it prints no address,
// uid, key or URL.
//
//   node scripts/hosted/funnel.mjs                     the last 7 days and everything the records still hold
//   node scripts/hosted/funnel.mjs --days 14           another window (1 to 30 days)
//   node scripts/hosted/funnel.mjs --json              the numbers as JSON instead
//   W2L_FUNNEL_INTERNAL=uid1,uid2 node …               counts those accounts apart, as internal (the operator's own)
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
// Every step counts only accounts whose users/{uid} still exists.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

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
  }
}

export function renderFunnel(summary) {
  const cell = value => value === null ? 'not read' : `${value.external} (+${value.internal} internal)`
  const lines = [
    `# Hosted usage funnel, ${summary.window.since.slice(0, 10)} to ${summary.window.until.slice(0, 10)} (UTC)`,
    '',
    `Accounts at each step: in the last ${summary.window.days} days, and over everything the records still hold. "Internal" are the accounts in W2L_FUNNEL_INTERNAL.`,
    '',
    `| Step | Last ${summary.window.days} days | Held in the records | Source |`,
    '| --- | --- | --- | --- |',
    ...summary.steps.map(step => `| ${step.step} | ${step.recent === null && step.error === null ? '—' : step.error ? 'not read' : cell(step.recent)} | ${step.error ? `not read: ${step.error}` : cell(step.held)} | ${step.source} |`),
    '',
    summary.jobs === null ? 'Jobs: not read.' : `Jobs started: ${summary.jobs.recent} in the window (${summary.jobs.externalRecent} by external accounts), ${summary.jobs.all} held in the records.`,
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

async function main(argv) {
  const options = parseArgs(argv)
  const project = process.env.W2L_PROJECT_ID
  if (!project) throw new Error('Set W2L_PROJECT_ID to the Google Cloud project of the hosted API')
  const internal = new Set((process.env.W2L_FUNNEL_INTERNAL ?? '').split(',').map(uid => uid.trim()).filter(Boolean))
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
  const sources = { errors: {} }
  const read = async (name, collection, mask) => {
    try { sources[name] = await firestoreList(project, token, collection, mask) }
    catch (error) { sources[name] = null; sources.errors[name] = error instanceof Error ? error.message : String(error) }
  }
  await Promise.all([
    read('users', 'users', ['createdAtMs']),
    read('keys', 'hostedApiKeys', ['uid', 'kind', 'createdAt']),
    read('usage', 'creditUsage', ['uid', 'day']),
    read('jobs', 'hostedJobs', ['job']),
  ])
  const summary = summarizeFunnel(sources, { now: Date.now(), days: options.days, internal })
  console.log(options.json ? JSON.stringify(summary, null, 2) : renderFunnel(summary))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
}
