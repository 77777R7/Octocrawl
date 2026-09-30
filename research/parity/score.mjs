#!/usr/bin/env node
// Recompute W2L's Firecrawl parity score from feature-audit.json, and the
// projected score after each milestone in milestones.json (each milestone's
// features, plus earlier ones, counted as solid).
// Usage: node research/parity/score.mjs
import { readdirSync, readFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const audited = JSON.parse(readFileSync(new URL('feature-audit.json', here), 'utf8'))
const milestones = JSON.parse(readFileSync(new URL('milestones.json', here), 'utf8'))

// The audit is a record of 2026-09-28 and is not edited. Later dated
// re-audits (reaudit-YYYY-MM-DD.json, or reaudit-YYYY-MM-DDb.json for a
// second one on the same day: { featureId: { status, evidence } }) are
// applied on top, latest last, to give the current statuses.
const reaudits = readdirSync(here).filter((name) => /^reaudit-\d{4}-\d{2}-\d{2}[a-z]?\.json$/.test(name)).sort()
const current = new Map(audited.map((f) => [f.id, f.audit.status]))
for (const name of reaudits) {
  for (const [id, entry] of Object.entries(JSON.parse(readFileSync(new URL(name, here), 'utf8')))) {
    if (!current.has(id)) throw new Error(`${name}: unknown feature ${id}`)
    if (!['solid', 'weak', 'partial', 'missing'].includes(entry.status)) throw new Error(`${name}: ${id} has status ${entry.status}`)
    if (typeof entry.evidence !== 'string' || entry.evidence.length === 0) throw new Error(`${name}: ${id} has no evidence`)
    current.set(id, entry.status)
  }
}
const features = audited.map((f) => ({ ...f, audit: { ...f.audit, status: current.get(f.id) } }))

const POINTS = { solid: 1, weak: 0.6, partial: 0.4, missing: 0 }
const WEIGHT = { core: 3, common: 2, niche: 1 }

function score(list, solidIds = new Set()) {
  let weighted = 0, weights = 0, plain = 0
  for (const f of list) {
    const points = solidIds.has(f.id) ? 1 : POINTS[f.audit.status] ?? 0
    weighted += WEIGHT[f.tier] * points
    weights += WEIGHT[f.tier]
    plain += points
  }
  return { features: list.length, tierWeighted: +(weighted / weights).toFixed(4), unweighted: +(plain / list.length).toFixed(4) }
}

console.log('audit 2026-09-28', score(audited))
console.log(`current (${reaudits.length === 0 ? 'no re-audit' : reaudits.join(', ')})`, score(features))
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
