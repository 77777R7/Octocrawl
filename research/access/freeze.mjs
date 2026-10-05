// Freeze the PA access task set from two baseline windows (G0).
//
// Usage: node research/access/freeze.mjs <windowDirA> <windowDirB> [--write]
//   Each window dir is a .w2l/access/runs/<timestamp>/ folder written by run-set.mjs over the same
//   candidate (and blind) tasks, on different days. Both windows must have been judged against the
//   current tasks.v1.json (same SHA-256; re-judge an older window with run-set.mjs --rejudge first).
//   Only cold attempts decide; warm ones are printed beside them. An attempt the API itself did not
//   answer (no response, or an HTTP status other than 200 from the API) is a harness failure, not a
//   site verdict: the task counts as missing from that window.
//
// A candidate becomes `frozen` when it is not verified in either window, `healthy` when it is
// verified in both, and `unstable` when the windows disagree. Unstable tasks stay in the file and
// in every later denominator. Blind tasks keep part `blind` and get the same per-window verdicts.
// The freeze is allowed when the windows agree on at least 90% of the tasks, started on different
// days, and no task is missing; otherwise the script says so and, with --write, refuses to write.
//
// With --write it sets each candidate's part, stamps frozenAt and baselineCommit in
// tasks.v1.json, and prints the per-task table for the baseline record.

import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [dirA, dirB] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const write = process.argv.includes('--write')
if (!dirA || !dirB) throw new Error('usage: node research/access/freeze.mjs <windowDirA> <windowDirB> [--write]')
if (resolve(dirA) === resolve(dirB)) throw new Error('the two windows are the same folder')

async function window(dir) {
  const rows = (await readFile(join(dir, 'attempts.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const summary = JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8'))
  const live = rows.filter((r) => !r.droppedAfterRun && r.observed.apiStatus === 200)
  const cold = new Map(live.filter((r) => r.temperature === 'cold').map((r) => [r.taskId, r]))
  const warm = new Map(live.filter((r) => r.temperature === 'warm').map((r) => [r.taskId, r]))
  const harness = rows.filter((r) => !r.droppedAfterRun && r.observed.apiStatus !== 200).map((r) => `${r.taskId} ${r.temperature}`)
  return { cold, warm, harness, environment: summary.environment, judgedWith: summary.rejudged?.tasksSha256 ?? summary.environment.tasksSha256 ?? null }
}
const A = await window(dirA)
const B = await window(dirB)
const problems = []
if (A.environment.startedAt.slice(0, 10) === B.environment.startedAt.slice(0, 10)) problems.push('both windows started on the same day; the method asks for different days')

const file = join(here, 'tasks.v1.json')
const taskText = await readFile(file, 'utf8')
const currentSha = createHash('sha256').update(taskText).digest('hex')
for (const [name, w] of [['A', A], ['B', B]]) {
  if (w.judgedWith !== currentSha) problems.push(`window ${name} was judged against tasks.v1.json ${w.judgedWith ?? '(unrecorded)'}, not the current ${currentSha}: re-judge it first`)
  if (w.harness.length > 0) problems.push(`window ${name} has harness failures (the API did not answer): ${w.harness.join(', ')}`)
}
const taskFile = JSON.parse(taskText)
const lines = []
let agree = 0, counted = 0
for (const task of taskFile.tasks) {
  const a = A.cold.get(task.id), b = B.cold.get(task.id)
  if (a === undefined || b === undefined) { lines.push({ task, a, b, verdict: 'missing' }); continue }
  counted++
  const va = a.outcome.verified, vb = b.outcome.verified
  if (va === vb) agree++
  const verdict = va && vb ? 'healthy' : !va && !vb ? 'frozen' : 'unstable'
  lines.push({ task, a, b, verdict })
}
const agreement = counted === 0 ? 0 : agree / counted
console.log(`windows: ${A.environment.startedAt} (${A.environment.commit}) and ${B.environment.startedAt} (${B.environment.commit})`)
console.log(`agreement on cold verdicts: ${agree}/${counted} = ${(agreement * 100).toFixed(1)}%`)
for (const p of problems) console.log(`problem: ${p}`)
const missing = lines.filter((l) => l.verdict === 'missing')
if (missing.length > 0) console.log(`missing from a window: ${missing.map((l) => l.task.id).join(', ')}`)

console.log('\n| Task | Part | URL | Window A cold | Window B cold | Verdict | Window A warm | Window B warm | Reason A | Reason B |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const l of lines) {
  const cell = (r) => (r === undefined ? 'missing' : r.outcome.verified ? 'verified' : 'not verified')
  console.log(`| ${l.task.id} | ${l.task.part} | ${l.task.url} | ${cell(l.a)} | ${cell(l.b)} | ${l.verdict} | ${cell(A.warm.get(l.task.id))} | ${cell(B.warm.get(l.task.id))} | ${l.a?.observed.reason ?? ''} | ${l.b?.observed.reason ?? ''} |`)
}

if (write) {
  if (agreement < 0.9) throw new Error('agreement below 90%: not frozen; run another window')
  if (missing.length > 0) throw new Error('a task is missing from a window: not frozen')
  if (problems.length > 0) throw new Error(`not frozen: ${problems.join('; ')}`)
  for (const l of lines) if (l.task.part === 'candidate') l.task.part = l.verdict
  for (const l of lines) l.task.baseline = { windowA: { verified: l.a.outcome.verified, reason: l.a.observed.reason }, windowB: { verified: l.b.outcome.verified, reason: l.b.observed.reason } }
  taskFile.frozenAt = new Date().toISOString().slice(0, 10)
  taskFile.baselineCommit = A.environment.commit === B.environment.commit ? A.environment.commit : `${A.environment.commit} / ${B.environment.commit}`
  await writeFile(file, JSON.stringify(taskFile, null, 2) + '\n')
  console.log(`\nwritten: ${lines.filter((l) => l.task.part === 'frozen').length} frozen, ${lines.filter((l) => l.task.part === 'healthy').length} healthy, ${lines.filter((l) => l.task.part === 'unstable').length} unstable, ${lines.filter((l) => l.task.part === 'blind').length} blind`)
}
