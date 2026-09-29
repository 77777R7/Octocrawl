#!/usr/bin/env node
// Recompute W2L's Firecrawl parity score from feature-audit.json, and the
// projected score after each milestone in milestones.json (each milestone's
// features, plus earlier ones, counted as solid).
// Usage: node research/parity/score.mjs
import { readFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const features = JSON.parse(readFileSync(new URL('feature-audit.json', here), 'utf8'))
const milestones = JSON.parse(readFileSync(new URL('milestones.json', here), 'utf8'))

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
