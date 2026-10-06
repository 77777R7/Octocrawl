// Compares two arms (two browser engines, or a transport off and on) on the PA access task set from
// run-set.mjs runs (ABBA order).
//
// Usage: node research/access/ab-compare.mjs --a <runDirA1>,<runDirA2> --b <runDirB1>,<runDirB2> [--paired <channel>] [--record <file.md>]
//   Each run dir is a .w2l/access/runs/<timestamp>/ folder written by run-set.mjs (cold attempts only).
//
// Per task, an engine "verified" a task when it did in both of its runs, "failed" it when it did in
// neither, and is "unstable" on it otherwise. A task is a gain for B when B verified it and A failed it,
// a regression for B when A verified it and B failed it; every other combination is no difference or
// unstable. Counts are given for the candidate and the blind tasks apart. Latency is over every attempt
// of the engine. A false success is an attempt the API answered success whose data check failed.
// Counts are given per part of the task file: candidate before the freeze; frozen, healthy, unstable
// after it; blind throughout.
//
// --paired <channel> adds the G1 latency rule confirmed in runs/2026-10-06-baseline-29e77ed.md: over the
// tasks both arms verified in every run and B tried <channel> in every run, each task's ratio of B's
// median wall time to A's; the rule is met when the median ratio is at most 1.20.

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const dirsA = flag('--a').split(',')
const dirsB = flag('--b').split(',')
const recordFile = flag('--record')
const pairedChannel = flag('--paired')

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
function paired(channel) {
  const median = (xs) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  const tasks = ids.flatMap((id) => {
    const a = A.map((r) => r.rows.get(id)), b = B.map((r) => r.rows.get(id))
    if ([...a, ...b].some((r) => r === undefined || !r.outcome.verified)) return []
    if (!b.every((r) => (r.observed.channelsTried ?? []).includes(channel))) return []
    const ratio = median(b.map((r) => r.outcome.wallMs)) / median(a.map((r) => r.outcome.wallMs))
    return [{ id, part: a[0].part, ratio: Math.round(ratio * 1000) / 1000 }]
  })
  const medianRatio = tasks.length === 0 ? null : Math.round(median(tasks.map((t) => t.ratio)) * 1000) / 1000
  return { channel, tasks: tasks.length, medianRatio, limit: 1.2, met: medianRatio === null ? null : medianRatio <= 1.2, perTask: tasks }
}
const parts = [...new Set(rows.map((r) => r.part))]
const out = {
  runs: { A: A.map((r) => ({ dir: r.dir, startedAt: r.summary.environment.startedAt, api: r.summary.environment.api, commit: r.summary.environment.commit })), B: B.map((r) => ({ dir: r.dir, startedAt: r.summary.environment.startedAt, api: r.summary.environment.api, commit: r.summary.environment.commit })) },
  byPart: Object.fromEntries([...parts, null].map((p) => [p ?? 'all', { tasks: rows.filter((r) => p === null || r.part === p).length, gain: count(p, 'gain'), regression: count(p, 'regression'), same: count(p, 'same'), unstable: count(p, 'unstable') }])),
  engines: { A: sa, B: sb },
  ...(pairedChannel === undefined ? {} : { paired: paired(pairedChannel) }),
  rows,
}
console.log(JSON.stringify({ byPart: out.byPart, engines: out.engines, ...(out.paired === undefined ? {} : { paired: { ...out.paired, perTask: undefined } }) }, null, 2))
if (recordFile !== undefined) await writeFile(recordFile.replace(/\.md$/, '.json'), JSON.stringify(out, null, 2) + '\n')
