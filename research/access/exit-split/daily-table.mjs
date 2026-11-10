// M4.2 daily runs (docs/enhanced-access-tasks.md): the tables of the record, from the run directories daily.sh left.
//   node research/access/exit-split/daily-table.mjs [runs directory, default .w2l/access/runs]
// A run belongs here when its arm is `<A|B|C|N>-<YYYY-MM-DD>-r<round>`. Prints Markdown: verified per run, one table per
// day (each cell the run's verdict; for a page not verified, the final blockReason or failure and the real-Chrome
// attempt's gate signals, or its failure when it got no page), the pooled verified/reads per page and arm, and arm B's connection failures.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? '.w2l/access/runs'
const ARMS = ['A', 'B', 'C', 'N']
const runs = []
for (const name of readdirSync(root).sort()) {
  const file = join(root, name, 'summary.json')
  if (!existsSync(file)) continue
  const summary = JSON.parse(readFileSync(file, 'utf8'))
  const match = /^([ABCN])-(\d{4}-\d{2}-\d{2})-r(\d+)$/.exec(summary.arm ?? '')
  if (match === null) continue
  const attempts = readFileSync(join(root, name, 'attempts.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const cells = new Map()
  for (const attempt of attempts) {
    const tried = attempt.observed.channelsTried ?? []
    let cell
    let chromeFailure = null
    if (attempt.outcome.verified) cell = tried.includes('installed_chrome') ? `verified${attempt.observed.deliveredBy === 'installed_chrome' ? '' : ` (${attempt.observed.deliveredBy ?? attempt.observed.lane})`}` : 'verified (no Chrome)'
    else {
      let signals = ''
      let wait = ''
      const saved = join(root, name, 'responses', `${attempt.taskId}-cold.json`)
      if (existsSync(saved)) {
        const chrome = (JSON.parse(readFileSync(saved, 'utf8')).response?.summary?.attempts ?? []).filter((a) => a.channel === 'installed_chrome').at(-1)
        const trace = chrome?.result?.trace ?? []
        const gate = trace.filter((e) => e.event === 'gate_detected').at(-1)
        const waited = trace.filter((e) => e.event === 'challenge_wait').at(-1)
        if (gate) signals = ` \`${gate.detail.signals.join('+')}\``
        if (waited) wait = ` ${waited.detail.outcome === 'not_waited' ? 'not waited' : `${(waited.detail.ms / 1000).toFixed(1)} s`}`
        chromeFailure = chrome?.result?.failureReason ?? null
      }
      cell = `${attempt.observed.reason ?? attempt.observed.status}${signals}${wait}${chromeFailure ? `; real Chrome: ${chromeFailure}` : ''}`
    }
    cells.set(attempt.taskId, { cell, verified: attempt.outcome.verified, chrome: tried.includes('installed_chrome'), chromeFailure })
  }
  runs.push({ arm: match[1], day: match[2], round: Number(match[3]), commit: summary.environment.commit, dir: name, verified: summary.totals.cold.verified, attempts: summary.totals.cold.attempts, cells })
}
const days = [...new Set(runs.map((run) => run.day))].sort()
const tasks = [...new Set(runs.flatMap((run) => [...run.cells.keys()]))]

console.log('Verified per run (of 16):\n')
console.log('| Day (local) | ' + ARMS.flatMap((arm) => [`${arm} r1`, `${arm} r2`]).join(' | ') + ' | commit |')
console.log('|---|' + '---|'.repeat(ARMS.length * 2 + 1))
for (const day of days) {
  const of = (arm, round) => runs.find((run) => run.day === day && run.arm === arm && run.round === round)
  const cellsOfDay = ARMS.flatMap((arm) => [1, 2].map((round) => { const run = of(arm, round); return run ? `${run.verified}${run.attempts === 16 ? '' : ` of ${run.attempts}`}` : 'not run' }))
  console.log(`| ${day} | ${cellsOfDay.join(' | ')} | ${[...new Set(runs.filter((run) => run.day === day).map((run) => run.commit))].join(', ')} |`)
}

for (const day of days) {
  const ofDay = runs.filter((run) => run.day === day).sort((a, b) => a.round - b.round || ARMS.indexOf(a.arm) - ARMS.indexOf(b.arm))
  console.log(`\n### ${day}\n`)
  console.log('| Task | ' + ofDay.map((run) => `${run.arm}${run.round}`).join(' | ') + ' |')
  console.log('|---|' + '---|'.repeat(ofDay.length))
  for (const task of tasks) console.log(`| ${task} | ${ofDay.map((run) => run.cells.get(task)?.cell ?? 'not run').join(' | ')} |`)
}

console.log(`\nPooled over ${days.length} day(s): verified / reads.\n`)
console.log('| Task | ' + ARMS.join(' | ') + ' |')
console.log('|---|' + '---|'.repeat(ARMS.length))
for (const task of tasks) {
  const pooled = ARMS.map((arm) => { const cells = runs.filter((run) => run.arm === arm).map((run) => run.cells.get(task)).filter(Boolean); return `${cells.filter((c) => c.verified).length}/${cells.length}` })
  console.log(`| ${task} | ${pooled.join(' | ')} |`)
}

const bChrome = runs.filter((run) => run.arm === 'B').flatMap((run) => [...run.cells.values()]).filter((c) => c.chrome)
const dead = bChrome.filter((c) => !c.verified && ['connection_error', 'timeout'].includes(c.chromeFailure))
console.log(`\nArm B: ${bChrome.length} reads reached the real Chrome; ${dead.length} of them ended in connection_error or timeout.`)
