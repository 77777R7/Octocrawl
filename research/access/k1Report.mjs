// The committed records of one K1 window (docs/pa-enhancement-tasks.md, Phase 4, K1, and the done criteria at its top),
// from the manifest k1-window.mjs wrote and the run directories it names.
//
// Usage: node research/access/k1Report.mjs <work dir .w2l/access/k1/<date>-w<n>> --label <date>-k1-w<n>-<commit>
//   Writes research/access/runs/<label>-summary.md and one research/access/runs/<label>-<arm>.md per arm (the runner's own
//   records of its blocks, copied whole). A file that exists is never replaced.
//
// Method (first calls are the main metric; the retry pass is reported apart and never enters them):
//   verified        run-set.mjs's verdict (every predicate of the task passed on a success or partial answer).
//   false success   run-set.mjs's: the answer said success and a data predicate failed. Two denominators: delivered
//                   results (answers with status success or partial) and all requests (planned). Each with N and the exact
//                   one-sided 95% upper bound (Clopper–Pearson; 1 − 0.05^(1/N) when there is none).
//   completion      Octocrawl: the Evidence Record's access.completion of a verified answer (unattended, authorized_session,
//                   user_browser, handed_to_person); a competitor: unattended (its API takes no session or person).
//   latency         wall time of the call: p50/p95 over verified answers, over all attempts, and over the attempts of each
//                   failure reason (the answer's reason, or the runner's error).
//   schema status   the answer's verification.status for the task's contract (Octocrawl; a competitor is sent none: n/a),
//                   readiness (ADR 0007), and freshness: live when the Evidence Record's fetchedAt falls inside the call,
//                   otherwise its age; a competitor's: requested maxAge 0 / storeInCache false (Firecrawl), not reported
//                   (ZenRows).
//   cost            Octocrawl: the spend ledger's charge (the grant's tariff estimate, not the vendor's bill) and $0 for a
//                   free route; the Clash exit's bandwidth and this machine's compute are not metered (unknown exposure).
//                   A competitor: the change in its account's usage between the readings the manifest holds (before,
//                   after the first calls, after the retry pass). Storage and delivery are not measured: unknown exposure.
//   marginal gain   each arm against the standard arm on the same tasks: tasks it verified that standard did not, tasks
//                   standard verified that it did not, cost, and p95 of all attempts.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const work = args[0]
const label = args[args.indexOf('--label') + 1]
if (!work || !label || args.indexOf('--label') === -1) throw new Error('usage: k1Report.mjs <work dir> --label <date>-k1-w<n>-<commit>')
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(repo, 'research/access/runs')
const m = JSON.parse(await readFile(join(work, 'manifest.json'), 'utf8'))
const shas = new Set()
for (const r of m.runs.filter((x) => x.runDir)) try { shas.add(JSON.parse(await readFile(join(repo, r.runDir, 'summary.json'), 'utf8')).environment.tasksSha256) } catch {}
const taskFile = JSON.parse(await readFile(join(here, 'tasks.v1.json'), 'utf8'))
const tasks = taskFile.tasks
const ids = tasks.map((t) => t.id)
const healthy = new Set(tasks.filter((t) => t.part === 'healthy').map((t) => t.id))
const ARMS = ['standard', 'enhanced', 'installed_chrome', 'control', 'firecrawl', 'zenrows']
const LOCAL = new Set(ARMS.slice(0, 4))

const readJsonl = async (f) => (await readFile(f, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))
async function rowsOf(arm, phase) {
  const out = new Map()
  for (const r of m.runs.filter((x) => x.arm === arm && x.label.includes(phase) && x.runDir)) {
    for (const a of await readJsonl(join(repo, r.runDir, 'attempts.jsonl'))) {
      if (a.temperature !== 'cold' || a.droppedAfterRun) continue
      let resp = null
      const f = join(repo, r.runDir, 'responses', `${a.taskId}-cold.json`)
      if (existsSync(f)) try { resp = JSON.parse(await readFile(f, 'utf8')).response ?? null } catch {}
      out.set(a.taskId, { ...a, resp, run: r })
    }
  }
  return out
}
const first = {}, retry = {}
for (const a of ARMS) { first[a] = await rowsOf(a, 'first'); retry[a] = await rowsOf(a, 'retry') }

// ---- statistics
const lnC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s }
const cdf = (k, n, p) => { if (p <= 0) return 1; if (p >= 1) return k >= n ? 1 : 0; let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lnC(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p)); return s }
/** Exact one-sided 95% upper bound for k events in n. */
function upper(k, n) { if (n === 0) return null; if (k === 0) return 1 - 0.05 ** (1 / n); if (k >= n) return 1; let lo = k / n, hi = 1; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (cdf(k, n, mid) > 0.05) lo = mid; else hi = mid } return hi }
const pct = (x) => (x === null ? 'n/a' : `${(100 * x).toFixed(1)}%`)
const q = (vals, p) => { const v = vals.filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length === 0 ? null : Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))]) }
const ms = (x) => (x === null ? '-' : String(x))
const reasonOf = (a) => a.outcome.verified ? 'verified' : (a.observed.reason ?? (a.observed.status === null || a.observed.status === undefined ? 'runner_error' : a.observed.status))

// ---- cost
const creditDelta = (c, from, to) => {
  const a = m.credits?.[from]?.[c], b = m.credits?.[to]?.[c]
  if (!a || !b) return null
  if (c === 'firecrawl') return typeof a.remainingCredits === 'number' && typeof b.remainingCredits === 'number' ? a.remainingCredits - b.remainingCredits : null
  return typeof a.usage_credits === 'number' && typeof b.usage_credits === 'number' ? b.usage_credits - a.usage_credits : null
}
function costOf(arm, phase) {
  if (arm === 'standard') return { usd: 0, credits: null, text: '$0 (no grant: no paid route)' }
  if (LOCAL.has(arm)) {
    const c = [...(phase === 'first' ? first[arm] : retry[arm]).values()].map((a) => a.outcome.chargedUsd ?? null)
    const known = c.filter((x) => x !== null).reduce((s2, x) => s2 + x, 0), unknown = c.filter((x) => x === null).length
    return { usd: unknown ? null : known, credits: null, text: `$${known.toFixed(4)} ledger${unknown ? ` + unknown on ${unknown} attempt(s) the ledger did not report (a runner error)` : ''}` }
  }
  const [from, to] = phase === 'first' ? ['before', 'afterFirst'] : ['afterFirst', 'after']
  const d = creditDelta(arm, from, to)
  const u = d === null ? null : arm === 'zenrows' ? d / 1000 : null // ZenRows' own usage reads $0.001 per credit on this plan; Firecrawl's plan is credits only
  return { usd: u, credits: d, text: d === null ? 'unknown (account not read)' : `${d} credits${arm === 'zenrows' ? ` ($${(d / 1000).toFixed(3)} as ZenRows' usage prices them)` : ' (Firecrawl Free plan: USD not priced per credit)'}` }
}

// ---- per-arm figures
function figures(arm) {
  const rows = first[arm]
  const all = [...rows.values()]
  const planned = ids.length
  const attempted = all.length
  const verified = all.filter((a) => a.outcome.verified).length
  const fs = all.filter((a) => a.outcome.falseSuccess).length
  const delivered = all.filter((a) => a.observed.status === 'success' || a.observed.status === 'partial').length
  const comp = {}
  for (const a of all.filter((x) => x.outcome.verified)) { const c = LOCAL.has(arm) ? (a.resp?.evidenceRecord?.access?.completion ?? 'unknown') : 'unattended'; comp[c] = (comp[c] ?? 0) + 1 }
  const reasons = {}
  for (const a of all) (reasons[reasonOf(a)] ??= []).push(a.outcome.wallMs)
  const rv = [...retry[arm].values()]
  return { arm, planned, attempted, notRun: planned - attempted, verified, fs, delivered, comp, reasons,
    p50v: q(all.filter((a) => a.outcome.verified).map((a) => a.outcome.wallMs), 0.5), p95v: q(all.filter((a) => a.outcome.verified).map((a) => a.outcome.wallMs), 0.95),
    p50: q(all.map((a) => a.outcome.wallMs), 0.5), p95: q(all.map((a) => a.outcome.wallMs), 0.95),
    cost: costOf(arm, 'first'), retryCost: costOf(arm, 'retry'), retried: rv.length, retryVerified: rv.filter((a) => a.outcome.verified).length, retryFs: rv.filter((a) => a.outcome.falseSuccess).length,
    healthyVerified: all.filter((a) => healthy.has(a.taskId) && a.outcome.verified).length }
}
const F = Object.fromEntries(ARMS.map((a) => [a, figures(a)]))
const v = (arm, id) => first[arm].get(id)?.outcome.verified === true
const cell = (arm, id) => { const a = first[arm].get(id); if (!a) return 'not run'; return a.outcome.verified ? 'yes' : a.outcome.falseSuccess ? 'FALSE' : `no (${reasonOf(a)})` }
const per1000 = (f, cost) => (cost.usd === null || f === 0 ? (cost.credits !== null && f > 0 ? `${Math.round((1000 * cost.credits) / f)} credits` : 'unknown') : `$${((1000 * cost.usd) / f).toFixed(2)}`)

const lines = []
const P = (...l) => lines.push(...l)
const span = (arm) => { const r = m.runs.filter((x) => x.arm === arm); return r.length === 0 ? 'not run' : `${r.map((x) => x.startedAt).sort()[0]} → ${r.map((x) => x.finishedAt).sort().at(-1)}` }
P(`# K1 window ${m.window}: six arms on the 92 access tasks, ${m.date}`, '',
  `- Item: docs/pa-enhancement-tasks.md, Phase 4, K1 (two-window competitor comparison), window ${m.window}. Driver research/access/k1-window.mjs, report research/access/k1Report.mjs.`,
  `- Runner commit: \`${m.runner}\` (this checkout's API for standard, enhanced and installed_chrome, built with \`npx tsc --build\` before the run); control API: \`${m.control}\` (its own checkout and build).`,
  `- Task set: research/access/tasks.v1.json, ${m.tasks} tasks (set \`all\`; healthy ${healthy.size}); SHA-256 as each run recorded it: ${[...shas].map((x) => `\`${x}\``).join(', ') || 'unknown'}.`,
  `- Interleaving: ${m.blocks.length} blocks of ${m.blocks[0].length} in task-file order; in block b the four local arms one after another, order rotated by b; Firecrawl and ZenRows on the same block at the same time. Then one retry pass of each arm's first-call failures, reported apart.`,
  `- Network: proxied. HTTPS_PROXY=${m.proxy.HTTPS_PROXY}, HTTP_PROXY=${m.proxy.HTTP_PROXY}, NO_PROXY=${m.proxy.NO_PROXY}; the local arms' exit address as each run recorded it is in the arm records. Competitors fetch from their own clouds (region: their default, not pinned).`,
  `- Mode and cache: first call, cold, maxAge 0 for every arm (Firecrawl also storeInCache false); each task's own timeout (Firecrawl at most 300 s, ZenRows 200 s client limit).`,
  `- Grants: enhanced and control \`${m.grants.steel.sha256}\` (${m.grants.steel.capabilities.join(', ')}; run budget $1, $0.05 per request); installed_chrome \`${m.grants.installed_chrome.sha256}\` (${m.grants.installed_chrome.capabilities.join(', ')}); standard none. No vendor_residential_proxy (decision 1).`,
  `- Window: ${m.runs.map((r) => r.startedAt).sort()[0]} → ${m.finishedAt ?? 'unfinished'}.${(m.failures ?? []).length ? ` Failures: ${m.failures.join('; ')}.` : ''}`,
  `- Sleep check (pmset log after each block): ${(m.sleepChecks ?? []).map((s) => `${s.what} ${s.sleeps === null ? 'unread' : s.sleeps.length === 0 ? 'none' : s.sleeps.join(', ')}`).join('; ') || 'none recorded'}.`,
  `- Competitor accounts: ${['firecrawl', 'zenrows'].map((c) => `${c} before ${JSON.stringify(m.credits.before[c] ?? null)}, after first calls ${JSON.stringify(m.credits.afterFirst?.[c] ?? null)}, after ${JSON.stringify(m.credits.after[c] ?? null)}`).join('; ')}.`,
  '', '## First calls (main metric)', '',
  '| Arm | Planned | Attempted | Not run | Verified | False success | FS / delivered (N, 95% upper) | FS / all requests (N, 95% upper) | p50 verified | p95 verified | p50 all | p95 all | Cost | Cost per 1,000 verified |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...ARMS.map((a) => { const f = F[a]; return `| ${a} | ${f.planned} | ${f.attempted} | ${f.notRun} | ${f.verified} | ${f.fs} | ${f.fs}/${f.delivered}, ${pct(upper(f.fs, f.delivered))} | ${f.fs}/${f.planned}, ${pct(upper(f.fs, f.planned))} | ${ms(f.p50v)} | ${ms(f.p95v)} | ${ms(f.p50)} | ${ms(f.p95)} | ${f.cost.text} | ${per1000(f.verified, f.cost)} |` }),
  '', 'Not run counts as not verified. Cost per 1,000 verified divides the first calls\' whole cost (failures included) by first-call verified tasks; it leaves out the Clash exit\'s bandwidth, this machine\'s compute, storage and delivery (not measured: unknown exposure).',
  '', '## Verified by completion (access.completion)', '',
  '| Arm | Unattended | Authorized session | User browser | Handed to person | Unknown |', '| --- | --- | --- | --- | --- | --- |',
  ...ARMS.map((a) => { const c = F[a].comp; return `| ${a} | ${c.unattended ?? 0} | ${c.authorized_session ?? 0} | ${c.user_browser ?? 0} | ${c.handed_to_person ?? 0} | ${c.unknown ?? 0} |` }),
  '', '## Retry pass (apart from the first calls)', '',
  '| Arm | Retried (first-call failures) | Verified on retry | False success on retry | Verified after retry | Retry cost | Cost per 1,000 verified incl. retry |', '| --- | --- | --- | --- | --- | --- | --- |',
  ...ARMS.map((a) => { const f = F[a]; const tot = f.cost.usd !== null && f.retryCost.usd !== null ? { usd: f.cost.usd + f.retryCost.usd, credits: null } : { usd: null, credits: f.cost.credits !== null && f.retryCost.credits !== null ? f.cost.credits + f.retryCost.credits : null }; return `| ${a} | ${f.retried} | ${f.retryVerified} | ${f.retryFs} | ${f.verified + f.retryVerified} | ${f.retryCost.text} | ${per1000(f.verified + f.retryVerified, tot)} |` }),
  '', '## Marginal gain against the standard arm (first calls)', '',
  '| Arm | New verified tasks | Regressions | Net | Cost | p95 all (ms) vs standard |', '| --- | --- | --- | --- | --- | --- |',
  ...ARMS.filter((a) => a !== 'standard').map((a) => { const gain = ids.filter((id) => v(a, id) && !v('standard', id)); const loss = ids.filter((id) => !v(a, id) && v('standard', id)); return `| ${a} | ${gain.length}${gain.length ? ` (${gain.join(', ')})` : ''} | ${loss.length}${loss.length ? ` (${loss.join(', ')})` : ''} | ${gain.length - loss.length} | ${F[a].cost.text} | ${ms(F[a].p95)} vs ${ms(F.standard.p95)} |` }),
  '', '## Candidate against the pinned control (enhanced arm vs control, same grant)', '',
  `- All 92: enhanced ${F.enhanced.verified}, control ${F.control.verified}. Healthy 25: enhanced ${F.enhanced.healthyVerified}, control ${F.control.healthyVerified}.`,
  ...(() => { const ch = ids.filter((id) => v('enhanced', id) !== v('control', id)); return [`- Tasks that differ (${ch.length}): ${ch.length === 0 ? 'none' : ch.map((id) => `${id}${healthy.has(id) ? ' (healthy)' : ''} enhanced ${cell('enhanced', id)}, control ${cell('control', id)}`).join('; ')}`] })(),
  '', '## Gap to the best competitor (first calls)', '',
  ...(() => { const best = Math.max(F.firecrawl.verified, F.zenrows.verified); return ARMS.slice(0, 4).map((a) => `- ${a}: ${F[a].verified} vs ${best} (gap ${best - F[a].verified}; false successes ${F[a].fs} vs Firecrawl ${F.firecrawl.fs}, ZenRows ${F.zenrows.fs})`) })(),
  '', '## Latency by failure reason (first calls, wall ms)', '',
  '| Arm | Reason | Attempts | p50 | p95 |', '| --- | --- | --- | --- | --- |',
  ...ARMS.flatMap((a) => Object.entries(F[a].reasons).sort((x, y) => y[1].length - x[1].length).map(([r, w]) => `| ${a} | ${r} | ${w.length} | ${ms(q(w, 0.5))} | ${ms(q(w, 0.95))} |`)),
  '', '## Per task (first calls)', '',
  'yes = verified; FALSE = false success; no (reason) otherwise. Schema status is the task contract\'s verification.status on the Octocrawl arms (competitors are sent none). Freshness: live = the Evidence Record\'s fetchedAt falls inside the call.', '',
  `| Task | Part | ${ARMS.join(' | ')} | Contract status (std/enh/ic/ctl) | Readiness (std/enh/ic/ctl) | Freshness (std/enh/ic/ctl) |`, `| --- | --- | ${ARMS.map(() => '---').join(' | ')} | --- | --- | --- |`,
  ...tasks.map((t) => {
    const loc = ARMS.slice(0, 4).map((a) => first[a].get(t.id))
    const status = loc.map((a) => a?.resp?.verification?.status ?? '-').join('/')
    const ready = loc.map((a) => a?.observed?.readiness?.state ?? '-').join('/')
    const fresh = loc.map((a) => { const at = a?.resp?.evidenceRecord?.fetchedAt; if (!a || !at) return '-'; const end = Date.parse(a.environment.at) + a.outcome.wallMs + 5000; const start = Date.parse(a.environment.at) - 5000; const f = Date.parse(at); return f >= start && f <= end ? 'live' : `age ${Math.round((end - f) / 1000)} s` }).join('/')
    return `| ${t.id} | ${t.part} | ${ARMS.map((a) => cell(a, t.id)).join(' | ')} | ${status} | ${ready} | ${fresh} |`
  }),
  '', `Each arm's own records (run-set.mjs, per block and retry) are in \`${label}-<arm>.md\` beside this file; raw runs under \`${work}\` and .w2l/access/runs/ (git-ignored).`, '')

const out = join(outDir, `${label}-summary.md`)
if (existsSync(out)) throw new Error(`${out} exists`)
await writeFile(out, lines.join('\n'))
for (const a of ARMS) {
  const f = join(outDir, `${label}-${a}.md`)
  if (existsSync(f)) throw new Error(`${f} exists`)
  const parts = [`# K1 window ${m.window}, arm ${a}, ${m.date}`, '', `The runner's own records of this arm's runs in the window, copied whole; the comparison is in \`${label}-summary.md\`.`, '']
  for (const r of m.runs.filter((x) => x.arm === a)) parts.push(`## ${r.label} (${r.startedAt} → ${r.finishedAt}, exit ${r.exitCode})`, '', `Raw run: \`${r.runDir ?? 'none'}\`.`, '', (existsSync(join(repo, r.record)) ? await readFile(join(repo, r.record), 'utf8') : '(no record written)').replace(/^# .*\n/, '').replace(/^#{1,2} /gm, '### ').trim(), '')
  await writeFile(f, parts.join('\n'))
}
console.log(`wrote ${out} and ${ARMS.length} arm records`)
