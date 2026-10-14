// The latest run's tasks as JSON lines: verdict, status, the route the record names, how the installed_chrome rung's
// wait ended and the gate it saw. For a run whose files stay in the container (run.sh on Cloud Run).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = '.w2l/access/runs'
const dir = join(root, (await readdir(root)).sort().at(-1))
const summary = JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8'))
console.log(JSON.stringify({ run: dir, commit: summary.environment?.commit, exitIp: summary.environment?.exitIp, totals: summary.totals }))
const attempts = (await readFile(join(dir, 'attempts.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
for (const attempt of attempts) {
  const id = attempt.taskId ?? attempt.id
  let detail = {}
  try {
    const doc = JSON.parse(await readFile(join(dir, 'responses', `${id}-cold.json`), 'utf8')).response
    let rung = false
    for (const event of doc.trace ?? []) {
      if (event.event === 'browser_engine' && event.detail?.engine === 'installed_chrome') { rung = true; detail.chrome = event.detail.version }
      if (rung && event.event === 'challenge_wait') detail.wait = `${event.detail.outcome}/${event.detail.ms}`
      if (rung && event.event === 'gate_detected') detail.gate = `${event.detail.status}:${(event.detail.signals ?? []).join(',')}`
      if (rung && event.event === 'navigate_failed') detail.error = String(event.detail?.error ?? '').slice(0, 160)
    }
    detail = { ...detail, status: doc.status, route: doc.evidenceRecord?.access?.route ?? null, tried: doc.channelsTried, wallMs: Math.round(doc.usage?.wallMs ?? 0) }
  } catch (error) { detail.read = String(error).slice(0, 120) }
  console.log(JSON.stringify({ id, verified: attempt.outcome?.verified === true, falseSuccess: attempt.outcome?.falseSuccess === true, ...detail }))
}
