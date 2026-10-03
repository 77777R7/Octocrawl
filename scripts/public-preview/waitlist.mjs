#!/usr/bin/env node
// Reads the hosted early-access list (Firestore `waitlist`, written by POST /api/waitlist) as the owner.
//
//   node scripts/public-preview/waitlist.mjs                 counts by role, need and entry point; prints no address
//   node scripts/public-preview/waitlist.mjs --emails        also prints every entry as CSV (email first)
//   node scripts/public-preview/waitlist.mjs --delete ADDR   removes that address's entry (a removal request)
//   node scripts/public-preview/waitlist.mjs --expire        removes entries older than 12 months (docs/privacy)
//
// It authenticates with the local gcloud login (`gcloud auth print-access-token`) and needs W2L_PROJECT_ID.

import { execFileSync } from 'node:child_process'

const project = process.env.W2L_PROJECT_ID
if (!project) throw new Error('Set W2L_PROJECT_ID to the Google Cloud project that holds the waitlist')
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`

async function request(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Firestore answered ${response.status}: ${await response.text().catch(() => '')}`)
  return response.status === 204 ? null : response.json()
}

const value = field => field?.stringValue ?? field?.timestampValue ?? null
const entries = []
for (let pageToken = ''; ;) {
  const page = await request(`${base}/waitlist?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`)
  for (const doc of page.documents ?? []) {
    const f = doc.fields ?? {}
    entries.push({
      name: doc.name, email: value(f.email), role: value(f.role), trigger: value(f.trigger), ref: value(f.ref),
      needs: (f.needs?.arrayValue?.values ?? []).map(v => v.stringValue), useCase: value(f.useCase),
      createdAt: f.createdAtMs?.integerValue ? new Date(Number(f.createdAtMs.integerValue)).toISOString() : null, updatedAt: value(f.updatedAt),
    })
  }
  if (!page.nextPageToken) break
  pageToken = page.nextPageToken
}

const args = process.argv.slice(2)
if (args[0] === '--delete') {
  const address = (args[1] ?? '').trim().toLowerCase()
  const matches = entries.filter(entry => entry.email === address)
  for (const entry of matches) await request(`https://firestore.googleapis.com/v1/${entry.name}`, { method: 'DELETE' })
  console.log(`Removed ${matches.length} entr${matches.length === 1 ? 'y' : 'ies'} for that address`)
} else if (args[0] === '--expire') {
  const cutoff = Date.now() - 365 * 86_400_000
  const old = entries.filter(entry => entry.createdAt && Date.parse(entry.createdAt) < cutoff)
  for (const entry of old) await request(`https://firestore.googleapis.com/v1/${entry.name}`, { method: 'DELETE' })
  console.log(`Removed ${old.length} entries created before ${new Date(cutoff).toISOString().slice(0, 10)}`)
} else {
  const count = (values) => Object.entries(values.reduce((all, key) => ({ ...all, [key]: (all[key] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
  console.log(`${entries.length} entries`)
  for (const [title, values] of [
    ['role', entries.map(entry => entry.role ?? '(none)')],
    ['needs', entries.flatMap(entry => entry.needs.length ? entry.needs : ['(none)'])],
    ['entry point', entries.map(entry => entry.trigger ?? '(none)')],
    ['referrer', entries.map(entry => entry.ref ?? '(none)')],
  ]) console.log(`\n${title}\n${count(values).map(([key, n]) => `  ${String(n).padStart(4)}  ${key}`).join('\n')}`)
  if (args[0] === '--emails') {
    // A leading = + - @ would run as a formula in a spreadsheet; a leading apostrophe keeps it text.
    const csv = text => `"${String(text ?? '').replace(/^[=+\-@]/, "'$&").replaceAll('"', '""')}"`
    console.log(`\nemail,role,needs,useCase,trigger,ref,createdAt`)
    for (const entry of entries) console.log([entry.email, entry.role, entry.needs.join(' '), entry.useCase, entry.trigger, entry.ref, entry.createdAt].map(csv).join(','))
  }
}
