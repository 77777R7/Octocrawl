// Compares two browser engines on the PA access task set from run-set.mjs runs (ABBA order).
//
// Usage: node research/access/ab-compare.mjs --a <runDirA1>,<runDirA2> --b <runDirB1>,<runDirB2> [--record <file.md>]
//   Each run dir is a .w2l/access/runs/<timestamp>/ folder written by run-set.mjs (cold attempts only).
//
// Per task, an engine "verified" a task when it did in both of its runs, "failed" it when it did in
// neither, and is "unstable" on it otherwise. A task is a gain for B when B verified it and A failed it,
// a regression for B when A verified it and B failed it; every other combination is no difference or
// unstable. Counts are given for the candidate and the blind tasks apart. Latency is over every attempt
// of the engine. A false success is an attempt the API answered success whose data check failed.

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const dirsA = flag('--a').split(',')
const dirsB = flag('--b').split(',')
const recordFile = flag('--record')

async function run(dir) {
  const rows = (await readFile(join(dir, 'attempts.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.temperature === 'cold' && !r.droppedAfterRun)
  const summary = JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8'))
  return { dir, rows: new Map(rows.map((r) => [r.taskId, r])), summary }
}
const A = await Promise.all(dirsA.map(run))
const B = await Promise.all(dirsB.map(run))
const ids = [...A[0].rows.keys()]
const verdict = (runs, id) => {
  const v = runs.map((r) => r.rows.get(id)?.outcome.verified)
  if (v.some((x) => x === undefined)) return 'missing'
  return v.every(Boolean) ? 'verified' : v.every((x) => !x) ? 'failed' : 'unstable'
}
const rows = ids.map((id) => {
  const a = verdict(A, id), b = verdict(B, id)
  const part = A[0].rows.get(id).part
  const url = A[0].rows.get(id).url ?? ''
  const outcome = a === 'failed' && b === 'verified' ? 'gain' : a === 'verified' && b === 'failed' ? 'regression' : a === b && a !== 'unstable' ? 'same' : 'unstable'
  const lanes = (runs) => [...new Set(runs.map((r) => r.rows.get(id)?.observed.lane).filter(Boolean))].join('/')
  const reasons = (runs) => runs.map((r) => r.rows.get(id)?.observed.reason ?? r.rows.get(id)?.observed.status ?? '').join(' · ')
  return { id, part, url, a, b, outcome, laneA: lanes(A), laneB: lanes(B), reasonsA: reasons(A), reasonsB: reasons(B) }
})
const count = (part, key) => rows.filter((r) => (part === null || r.part === part) && r.outcome === key).length
const pct = (xs, q) => { const s = [...xs].sort((x, y) => x - y); return s.length === 0 ? null : Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) }
const engineStats = (runs) => {
  const all = runs.flatMap((r) => [...r.rows.values()])
  const browser = all.filter((r) => r.observed.lane === 'browser_local' || (r.observed.channelsTried ?? []).includes('browser_local'))
  return {
    attempts: all.length,
    verified: all.filter((r) => r.outcome.verified).length,
    falseSuccess: all.filter((r) => r.outcome.falseSuccess).length,
    p50: pct(all.map((r) => r.outcome.wallMs), 0.5), p95: pct(all.map((r) => r.outcome.wallMs), 0.95),
    browserAttempts: browser.length,
    browserP50: pct(browser.map((r) => r.outcome.wallMs), 0.5), browserP95: pct(browser.map((r) => r.outcome.wallMs), 0.95),
  }
}
const sa = engineStats(A), sb = engineStats(B)
const parts = ['candidate', 'blind']
const out = {
  runs: { A: A.map((r) => ({ dir: r.dir, startedAt: r.summary.environment.startedAt, api: r.summary.environment.api, commit: r.summary.environment.commit })), B: B.map((r) => ({ dir: r.dir, startedAt: r.summary.environment.startedAt, api: r.summary.environment.api, commit: r.summary.environment.commit })) },
  byPart: Object.fromEntries([...parts, null].map((p) => [p ?? 'all', { tasks: rows.filter((r) => p === null || r.part === p).length, gain: count(p, 'gain'), regression: count(p, 'regression'), same: count(p, 'same'), unstable: count(p, 'unstable') }])),
  engines: { A: sa, B: sb },
  rows,
}
console.log(JSON.stringify({ byPart: out.byPart, engines: out.engines }, null, 2))
if (recordFile !== undefined) await writeFile(recordFile.replace(/\.md$/, '.json'), JSON.stringify(out, null, 2) + '\n')
