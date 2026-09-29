#!/usr/bin/env node
// Recompute W2L's Firecrawl parity score from feature-audit.json, and the
// projected score after each milestone in milestones.json (each milestone's
// features, plus earlier ones, counted as solid).
// Usage: node research/parity/score.mjs
//        node research/parity/score.mjs --status <file.csv>
// --status overlays a dated status record (a CSV with `id` and `status_now` columns, such as
// core-status-2026-09-29.csv) on the audit's statuses and prints the scores with them too;
// `paused` counts as missing. Without it the output is unchanged.
import { readFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const features = JSON.parse(readFileSync(new URL('feature-audit.json', here), 'utf8'))
const milestones = JSON.parse(readFileSync(new URL('milestones.json', here), 'utf8'))

const POINTS = { solid: 1, weak: 0.6, partial: 0.4, missing: 0 }
const WEIGHT = { core: 3, common: 2, niche: 1 }

function score(list, solidIds = new Set(), statusOf = (f) => f.audit.status) {
  let weighted = 0, weights = 0, plain = 0
  for (const f of list) {
    const points = solidIds.has(f.id) ? 1 : POINTS[statusOf(f)] ?? 0
    weighted += WEIGHT[f.tier] * points
    weights += WEIGHT[f.tier]
    plain += points
  }
  return { features: list.length, tierWeighted: +(weighted / weights).toFixed(4), unweighted: +(plain / list.length).toFixed(4) }
}

console.log('baseline', score(features))
for (const tier of Object.keys(WEIGHT)) console.log(`  ${tier}`, score(features.filter((f) => f.tier === tier)))

const known = new Set(features.map((f) => f.id))
const solid = new Set()
for (const [name, ids] of Object.entries(milestones)) {
  for (const id of ids) {
    if (!known.has(id)) throw new Error(`${name}: unknown feature ${id}`)
    solid.add(id)
  }
  const days = ids.reduce((sum, id) => sum + Number(features.find((f) => f.id === id).audit.effortDays ?? 0), 0)
  console.log(`after ${name} (${ids.length} features, ${days} audit days)`, score(features, solid))
}

// --status: the dated record's statuses in place of the audit's, for the features it lists.
const statusIndex = process.argv.indexOf('--status')
if (statusIndex !== -1) {
  const file = process.argv[statusIndex + 1]
  if (file === undefined) throw new Error('--status needs a CSV file')
  const [header, ...rows] = parseCsv(readFileSync(file, 'utf8'))
  const col = (name) => { const i = header.indexOf(name); if (i === -1) throw new Error(`${file}: no ${name} column`); return i }
  const overlay = new Map(rows.filter((row) => row.length > 1).map((row) => [row[col('id')], row[col('status_now')]]))
  for (const [id, status] of overlay) {
    if (!known.has(id)) throw new Error(`${file}: unknown feature ${id}`)
    if (!(status in POINTS) && status !== 'paused') throw new Error(`${file}: ${id} has unknown status ${status}`)
  }
  const statusOf = (f) => (overlay.has(f.id) ? (overlay.get(f.id) === 'paused' ? 'missing' : overlay.get(f.id)) : f.audit.status)
  const counts = {}
  for (const f of features.filter((f) => f.tier === 'core')) {
    const status = overlay.get(f.id) ?? f.audit.status
    counts[status] = (counts[status] ?? 0) + 1
  }
  console.log(`with ${file} (${overlay.size} features overlaid; paused counts as missing)`, score(features, new Set(), statusOf))
  for (const tier of Object.keys(WEIGHT)) console.log(`  ${tier}`, score(features.filter((f) => f.tier === tier), new Set(), statusOf))
  console.log('  core statuses', counts)
}

// Rows of a CSV file: comma-separated, fields optionally in double quotes with "" for a quote.
function parseCsv(text) {
  const rows = [[]]
  let field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { rows.at(-1).push(field); field = '' }
    else if (ch === '\n') { rows.at(-1).push(field); field = ''; rows.push([]) }
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || rows.at(-1).length > 0) rows.at(-1).push(field)
  return rows.filter((row) => row.length > 0)
}
