// The committed record of one CAPTCHA and DataDome window, from the manifest captcha-window.mjs wrote and the run
// directories it names: per arm and per challenge type, verified, false success, solves attempted and succeeded, USD per
// solve (the solver's reported figure; unknown stays unknown), time added by solving, and planned / attempted / not run.
//
// Usage: node research/access/captcha-report.mjs <work dir .w2l/access/captcha/<date>-w<n>> --out research/access/runs/<date>-captcha-w<n>-<commit>.md
//   A file that exists is never replaced. Every arm the window named stays in the table: an arm that was not started
//   (no grant, no key) has every task not run, with the reason the manifest gives.
//
// Method: captchaReport.mjs (armCells). First calls only (cold); a task's first row counts. Time added by solving is given
// twice: the solve time the solver reported, and the median of (this arm's wall ms − its base arm's) over the tasks where
// it attempted a solve, the base arm being the same arm without +solver in the same window.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { armCells, baseArmOf, cellsTable, manifestText } from './captchaReport.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const work = args[0]
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined
if (!work || !out) throw new Error('usage: captcha-report.mjs <work dir> --out <record.md>')
if (existsSync(resolve(repo, out))) throw new Error(`${out} exists: a record is not rewritten; name a new file`)
const m = JSON.parse(await readFile(join(resolve(repo, work), 'manifest.json'), 'utf8'))
const taskFile = JSON.parse(await readFile(join(repo, m.tasksFile), 'utf8'))
const tasks = taskFile.tasks.filter((t) => m.tasks.includes(t.id))
const manifestSha = createHash('sha256').update(manifestText(taskFile)).digest('hex')

const rowsOf = async (arm) => {
  if (m.notStarted.some((n) => n.arm === arm)) return null
  const rows = []
  for (const r of m.runs.filter((x) => x.arm === arm && x.runDir)) {
    for (const l of (await readFile(join(repo, r.runDir, 'attempts.jsonl'), 'utf8')).split('\n').filter(Boolean)) rows.push(JSON.parse(l))
  }
  return rows
}
const rows = Object.fromEntries(await Promise.all(m.arms.map(async (a) => [a, await rowsOf(a)])))
// Real pages and vendor demo pages are counted apart: a demo is a test page, never part of the real-task numbers.
const tableOf = (ts) => cellsTable(m.arms.map((arm) => ({ arm, cells: armCells(ts, rows[arm], baseArmOf(arm) === null ? null : rows[baseArmOf(arm)] ?? null) })))
const real = tasks.filter((t) => t.origin !== 'vendor_demo')
const demo = tasks.filter((t) => t.origin === 'vendor_demo')
const balanceText = (b) => (b == null ? 'not read' : b.balanceUsd === null ? `unreadable (${b.errorCode ?? 'no answer'})` : `$${b.balanceUsd} at ${b.at}`)
const notRunOf = (arm) => armCells(tasks, rows[arm]).all.notRun

const md = [
  `# CAPTCHA and DataDome window ${m.window}, ${m.date}`, '',
  `- Driver: \`node research/access/captcha-window.mjs --window ${m.window}\`, runner commit \`${m.runner}\`; report \`node research/access/captcha-report.mjs ${work} --out ${out}\``,
  `- Task file: \`${m.tasksFile}\`, manifest SHA-256 \`${manifestSha}\`${manifestSha === taskFile.manifestSha256 ? ' (matches the frozen one)' : ` (**does not match** the frozen ${taskFile.manifestSha256})`}; ${tasks.length} tasks`,
  `- Window: ${m.runs[0]?.startedAt ?? 'no run'} → ${m.finishedAt ?? 'not finished'}; network: HTTPS_PROXY ${m.proxy.HTTPS_PROXY ?? 'not set'}`,
  ...Object.entries(m.grants).map(([a, g]) => `- Grant of ${a}: ${g === null ? 'none' : `SHA-256 \`${g.sha256}\`; capabilities ${(g.capabilities ?? ['unreadable']).join(', ')}`}`),
  ...m.notStarted.map((n) => `- **Not started:** ${n.arm} (${n.why.join('; ')}); its ${tasks.length} tasks count as not run`),
  ...(m.exits === undefined ? [] : [`- Exits: ${Object.entries(m.exits).map(([a, e]) => `${a} ${e}`).join('; ')}`]),
  ...(m.capsolverBalance === undefined ? [] : [`- CapSolver getBalance: before ${balanceText(m.capsolverBalance.before)}, after ${balanceText(m.capsolverBalance.after)}; billed in the window ${m.capsolverBalance.before?.balanceUsd == null || m.capsolverBalance.after?.balanceUsd == null ? 'unknown' : `$${(m.capsolverBalance.before.balanceUsd - m.capsolverBalance.after.balanceUsd).toFixed(4)}`} (every solver arm together; CapSolver states no per-task price)`]),
  ...m.failures.map((f) => `- Failure: ${f}`),
  '',
  `## Real pages (${real.length})`, '',
  ...tableOf(real), '',
  ...(demo.length === 0 ? [] : [`## Vendor demo pages (${demo.length}; test pages, reported apart)`, '', ...tableOf(demo), '']),
  'Solves not attempted, by arm (type:reason, from the captcha_solve events): ' + m.arms.filter((arm) => baseArmOf(arm) !== null).map((arm) => { const k = armCells(tasks, rows[arm]).all.skipped; return `${arm} ${Object.keys(k).length === 0 ? 'none' : Object.entries(k).sort().map(([r, n]) => `${r} ${n}`).join(', ')}` }).join('; '), '',
  'Not run, by arm: ' + m.arms.map((arm) => `${arm} ${notRunOf(arm).length === 0 ? 'none' : notRunOf(arm).join(', ')}`).join('; '), '',
  'An attempt not run counts as not verified. Unknown is not zero: a solver figure the answers did not report is unknown.', '',
].join('\n')
await writeFile(resolve(repo, out), md)
console.log(md)
