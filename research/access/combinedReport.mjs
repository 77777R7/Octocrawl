// The committed records of the combined-grant measurement after K1 (ROADMAP, PA bar, the first item to measure next):
// one grant holding installed_chrome and the enhanced arm's Steel routes, against standard, installed_chrome alone and
// Firecrawl Cloud, on K1's 92 tasks, from the manifests k1-window.mjs wrote (--name combined) and the runs they name.
//
// Usage: node research/access/combinedReport.mjs <work dir> --label <date>-combined-w<n>-<commit>
//          one window: research/access/runs/<label>-summary.md and one <label>-<arm>.md per arm (the runner's records);
//          --out <dir> writes them elsewhere
//        node research/access/combinedReport.mjs <w1 dir> <w2 dir> --out <record.md>
//          the two-window record: what held in both windows
//   A file that exists is never replaced.
//
// Method (first calls are the main metric; the retry pass is reported apart and never enters them):
//   verified, false success  run-set.mjs's verdicts. Two task denominators: all 92 and the 50 frozen tasks (part
//                   `frozen` in tasks.v1.json); false successes over delivered answers (status success or partial) and over
//                   all requests (planned), each with the exact one-sided 95% upper bound (Clopper–Pearson).
//   marginal gain   an arm against a baseline arm on the same tasks: gains (it verified, the baseline did not) and
//                   regressions (the reverse). Across two windows a gain or regression holds when it is one in both
//                   windows; any other disagreement is unstable.
//   delivering rung the Evidence Record's access.route (and executor) of each verified answer: http, http_compat (impit),
//                   browser (browser_local), installed_chrome, vendor (Steel); the paid calls the answer lists.
//   cost            Octocrawl: the spend ledger's charge (the grant's tariff estimate, not Steel's bill); $0 for a free
//                   route. Firecrawl: the change in remaining credits between the manifest's readings. Clash bandwidth,
//                   compute, storage and delivery are not measured (unknown exposure).
//   latency         wall time of the call: p50/p95 over verified answers and over all attempts.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const dirs = args.filter((a, i) => !a.startsWith('--') && !['--label', '--out'].includes(args[i - 1]))
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
if (!(dirs.length === 1 && opt('--label')) && !(dirs.length === 2 && opt('--out'))) throw new Error('usage: combinedReport.mjs <dir> --label <label> | <w1 dir> <w2 dir> --out <record.md>')
const outDir = (dirs.length === 1 && opt('--out')) || join(repo, 'research/access/runs')

const tasks = JSON.parse(await readFile(join(here, 'tasks.v1.json'), 'utf8')).tasks
const ids = tasks.map((t) => t.id)
const frozen = new Set(tasks.filter((t) => t.part === 'frozen').map((t) => t.id))
const ARMS = ['standard', 'installed_chrome', 'combined', 'firecrawl']
const LOCAL = new Set(ARMS.slice(0, 3))
const readJsonl = async (f) => (await readFile(f, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))

async function load(dir) {
  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  const rows = { first: {}, retry: {} }
  for (const phase of ['first', 'retry']) for (const a of ARMS) {
    rows[phase][a] = new Map()
    for (const r of m.runs.filter((x) => x.arm === a && x.label.includes(phase) && x.runDir)) {
      for (const x of await readJsonl(join(repo, r.runDir, 'attempts.jsonl'))) {
        if (x.temperature !== 'cold' || x.droppedAfterRun) continue
        let resp = null
        const f = join(repo, r.runDir, 'responses', `${x.taskId}-cold.json`)
        if (existsSync(f)) try { resp = JSON.parse(await readFile(f, 'utf8')).response ?? null } catch {}
        rows[phase][a].set(x.taskId, { ...x, resp })
      }
    }
  }
  const shas = new Set()
  for (const r of m.runs.filter((x) => x.runDir)) try { shas.add(JSON.parse(await readFile(join(repo, r.runDir, 'summary.json'), 'utf8')).environment.tasksSha256) } catch {}
  const dirty = [], build = { upToDate: 0, stale: [], unknown: [] }
  for (const r of m.runs.filter((x) => x.runDir && LOCAL.has(x.arm))) {
    try {
      const e = JSON.parse(await readFile(join(repo, r.runDir, 'summary.json'), 'utf8')).environment
      if (e.dirty) dirty.push(r.label)
      if (e.build?.upToDate === true) build.upToDate++; else if (e.build?.upToDate === false) build.stale.push(r.label); else build.unknown.push(r.label)
    } catch { build.unknown.push(r.label) }
  }
  let prechecks = null
  try { prechecks = (await readFile(join(dir, 'prechecks.txt'), 'utf8')).trim().split('\n').join('; ') } catch {}
  return { dir, m, first: rows.first, retry: rows.retry, shas, prechecks, dirty, build }
}

// ---- statistics and helpers
const lnC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s }
const cdf = (k, n, p) => { let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lnC(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p)); return s }
const upper = (k, n) => { if (n === 0) return null; if (k === 0) return 1 - 0.05 ** (1 / n); if (k >= n) return 1; let lo = k / n, hi = 1; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (cdf(k, n, mid) > 0.05) lo = mid; else hi = mid } return hi }
const pct = (x) => (x === null ? 'n/a' : `${(100 * x).toFixed(1)}%`)
const q = (vals, p) => { const v = vals.filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length === 0 ? null : Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))]) }
const ms = (x) => (x === null ? '-' : String(x))
const reasonOf = (a) => a.outcome.verified ? 'verified' : (a.observed.reason ?? (a.observed.status === null || a.observed.status === undefined ? 'runner_error' : a.observed.status))
const ver = (W, arm, id) => W.first[arm].get(id)?.outcome.verified === true
const cell = (W, arm, id) => { const a = W.first[arm].get(id); if (!a) return 'not run'; return a.outcome.verified ? 'yes' : a.outcome.falseSuccess ? 'FALSE' : `no (${reasonOf(a)})` }
const rungOf = (a) => { const x = a?.resp?.evidenceRecord?.access; return x ? `${x.route ?? 'unknown'}${x.executor ? `/${x.executor}` : ''}` : 'unknown (no Evidence Record access)' }
// The Firecrawl cap the driver was given (--firecrawl-cap; the manifest does not record it). Its check lets a run start
// on 1.5 credits a page, so the spend is checked here against the credits each call reported and the account's readings.
const FIRECRAWL_CAP = 120
const fsAll = (f) => `${f.fs}/${f.planned}, ${f.attempted < f.planned ? `upper unknown (${f.planned - f.attempted} not run)` : pct(upper(f.fs, f.planned))}`
const list = (xs) => `${xs.length}${xs.length ? ` (${xs.join(', ')})` : ''}`

function cost(W, arm, phase) {
  if (arm === 'standard') return { usd: 0, credits: null, text: '$0 (no grant: no paid route)' }
  if (W[phase][arm].size === 0) return { usd: null, credits: null, text: 'not run' }
  if (LOCAL.has(arm)) {
    const c = [...W[phase][arm].values()].map((a) => a.outcome.chargedUsd ?? null)
    const known = c.filter((x) => x !== null).reduce((s, x) => s + x, 0), unknown = c.filter((x) => x === null).length
    return { usd: unknown ? null : known, credits: null, text: `$${known.toFixed(4)} ledger${unknown ? ` + unknown on ${unknown} attempt(s) the ledger did not report` : ''}` }
  }
  const [from, to] = phase === 'first' ? ['before', 'afterFirst'] : ['afterFirst', 'after']
  const a = W.m.credits?.[from]?.[arm], b = W.m.credits?.[to]?.[arm]
  const d = a && b && typeof a.remainingCredits === 'number' && typeof b.remainingCredits === 'number' ? a.remainingCredits - b.remainingCredits : null
  return { usd: null, credits: d, text: d === null ? 'unknown (account not read)' : `${d} credits (Free plan: not priced in USD)` }
}
const per1000 = (n, c) => (n === 0 ? 'n/a (none verified)' : c.usd !== null ? `$${((1000 * c.usd) / n).toFixed(2)}` : c.credits !== null ? `${Math.round((1000 * c.credits) / n)} credits` : 'unknown')

function figures(W, arm, set) {
  const all = [...W.first[arm].values()].filter((a) => set.has(a.taskId))
  const delivered = all.filter((a) => a.observed.status === 'success' || a.observed.status === 'partial').length
  return { planned: set.size, attempted: all.length, verified: all.filter((a) => a.outcome.verified).length, fs: all.filter((a) => a.outcome.falseSuccess).length, delivered,
    p50v: q(all.filter((a) => a.outcome.verified).map((a) => a.outcome.wallMs), 0.5), p95v: q(all.filter((a) => a.outcome.verified).map((a) => a.outcome.wallMs), 0.95),
    p50: q(all.map((a) => a.outcome.wallMs), 0.5), p95: q(all.map((a) => a.outcome.wallMs), 0.95) }
}
const ALL = new Set(ids)

/** Whether the runner's packages/ equal main's at the commit the window ran from (only research files may differ). */
function engineLine(runner) {
  try {
    const base = execSync(`git merge-base ${runner} origin/main`, { cwd: repo }).toString().trim()
    const differs = execSync(`git diff --name-only ${base} ${runner} -- packages`, { cwd: repo }).toString().trim()
    return differs === '' ? `main \`${base.slice(0, 8)}\` plus research files only; packages/ is main's` : `differs from main \`${base.slice(0, 8)}\` in packages/: ${differs.split('\n').join(', ')}`
  } catch { return 'its relation to main not read' }
}
function firecrawlSpend(W) {
  const calls = ['first', 'retry'].flatMap((p) => [...W[p].firecrawl.values()])
  const perCall = calls.every((a) => typeof a.outcome.credits === 'number') ? calls.reduce((s, a) => s + a.outcome.credits, 0) : null
  const b = W.m.credits?.before?.firecrawl, e = W.m.credits?.after?.firecrawl
  const account = typeof b?.remainingCredits === 'number' && typeof e?.remainingCredits === 'number' ? b.remainingCredits - e.remainingCredits : null
  const worst = Math.max(perCall ?? -1, account ?? -1)
  return `${perCall ?? 'unknown'} by the credits each call reported (${calls.length} calls), ${account ?? 'unknown'} by the account's readings; ${perCall === null && account === null ? 'unknown whether within the cap' : worst > FIRECRAWL_CAP ? `**over the cap by ${worst - FIRECRAWL_CAP}**` : 'within the cap'}`
}

function windowRecord(W, label) {
  const { m } = W
  const L = []
  const P = (...l) => L.push(...l)
  const g = m.grants
  P(`# Combined grant, window ${m.window}: installed_chrome and the Steel routes in one grant, on K1's 92 tasks, ${m.date}`, '',
    '- Item: ROADMAP.md, PA bar, the first item to measure next (written by K5, #687): one grant holding `installed_chrome` together with the enhanced arm\'s routes, which K1 ran under separate grants. Asked for by Howard on 2026-10-25.',
    `- Command: \`node research/access/k1-window.mjs --window ${m.window} --name combined --arms ${m.arms.join(',')} --ic-grant <K1 installed_chrome grant> --combined-grant <combined grant> --ports ${m.ports.join(',')} --firecrawl-cap ${FIRECRAWL_CAP}\`; report \`node research/access/combinedReport.mjs ${W.dir} --label ${label}\`.`,
    `- Runner commit: \`${m.runner}\` (${engineLine(m.runner)}). \`npx tsc --build\` ran before the APIs started; run-set's stale-build check (each arm record's Engine build line): up to date in ${W.build.upToDate} local runs${W.build.stale.length ? `, stale in ${W.build.stale.join(', ')}` : ''}${W.build.unknown.length ? `, unread in ${W.build.unknown.join(', ')}` : ''}.`,
    `- Working tree: ${W.dirty.length === 0 ? 'clean at every run\'s start' : `run-set recorded uncommitted changes at the start of ${W.dirty.join(', ')}`}.`,
    `- Task set: research/access/tasks.v1.json, ${m.tasks} tasks (set \`all\`; frozen ${frozen.size}); SHA-256 as each run recorded it: ${[...W.shas].map((x) => `\`${x}\``).join(', ') || 'unknown'}.`,
    `- Arms: standard (no grant, access standard); installed_chrome (the K1 grant \`${g.installed_chrome.sha256}\`, ${g.installed_chrome.capabilities.join(', ')}); combined (\`${g.combined?.sha256 ?? 'not run'}\`, ${g.combined?.capabilities.join(', ') ?? '-'}; W2L_VENDORS=steel; run budget $1, $0.05 per request, Steel at $0.10 per browser hour, the same settings as the Steel grant \`${g.steel.sha256}\`; no vendor_residential_proxy, decision 1); Firecrawl Cloud (markdown, its own strongest route, maxAge 0, storeInCache false). Octocrawl arms with access enhanced except standard.`,
    `- Interleaving: ${m.blocks.length} blocks of ${m.blocks[0].length} in task-file order; in block b the three local arms one after another, order rotated by b; Firecrawl on the same block at the same time. Then one retry pass of each local arm's first-call failures, reported apart; Firecrawl's retry runs only within the window's ${FIRECRAWL_CAP}-credit cap.`,
    `- Network: ${m.proxy.HTTPS_PROXY || m.proxy.HTTP_PROXY ? 'proxied (the shell\'s proxy; Clash on this Mac)' : 'direct (no proxy variable set)'}. HTTPS_PROXY=${m.proxy.HTTPS_PROXY}, HTTP_PROXY=${m.proxy.HTTP_PROXY}, NO_PROXY=${m.proxy.NO_PROXY}; each local arm's exit address is in its arm record. Firecrawl fetches from its own cloud (region not pinned).`,
    `- Machine: ${W.prechecks ?? 'pre-checks not recorded'}. Sleep check (pmset log after each block): ${(m.sleepChecks ?? []).map((s) => `${s.what} ${s.sleeps === null ? 'unread' : s.sleeps.length === 0 ? 'none' : s.sleeps.join(', ')}`).join('; ') || 'none recorded'}.`,
    `- Window: ${m.runs.map((r) => r.startedAt).sort()[0]} → ${m.finishedAt ?? 'unfinished'}. Failures and caps: ${(m.failures ?? []).length ? m.failures.join('; ') : 'none'}.`,
    `- Firecrawl account: before ${JSON.stringify(m.credits.before.firecrawl ?? null)}, after first calls ${JSON.stringify(m.credits.afterFirst?.firecrawl ?? null)}, after ${JSON.stringify(m.credits.after.firecrawl ?? null)}.`,
    `- Firecrawl spend against the ${FIRECRAWL_CAP}-credit cap: ${firecrawlSpend(W)}.`)
  for (const [name, set] of [['all 92 tasks', ALL], [`the ${frozen.size} frozen tasks`, frozen]]) {
    P('', `## First calls, ${name} (main metric)`, '',
      '| Arm | Planned | Attempted | Not run | Verified | False success | FS / delivered (N, 95% upper) | FS / all requests (N, 95% upper) | p50 verified | p95 verified | p50 all | p95 all |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...ARMS.map((a) => { const f = figures(W, a, set); return `| ${a} | ${f.planned} | ${f.attempted} | ${f.planned - f.attempted} | ${f.verified} | ${f.fs} | ${f.fs}/${f.delivered}, ${pct(upper(f.fs, f.delivered))} | ${fsAll(f)} | ${ms(f.p50v)} | ${ms(f.p95v)} | ${ms(f.p50)} | ${ms(f.p95)} |` }))
  }
  P('', 'Not run counts as not verified. Latency in wall ms.', '', '## Cost (first calls, all 92)', '',
    '| Arm | Cost | Cost per 1,000 verified |', '| --- | --- | --- |',
    ...ARMS.map((a) => { const c = cost(W, a, 'first'); return `| ${a} | ${c.text} | ${per1000(figures(W, a, ALL).verified, c)} |` }),
    '', 'Cost per 1,000 verified divides the first calls\' whole cost (failures included) by first-call verified tasks.')
  P('', '## Marginal gain (first calls)', '', '| Arm | Against | Set | Gains | Regressions | Net |', '| --- | --- | --- | --- | --- | --- |')
  for (const [a, base] of [['installed_chrome', 'standard'], ['combined', 'standard'], ['combined', 'installed_chrome']]) for (const [sn, set] of [['92', ids], ['frozen 50', ids.filter((id) => frozen.has(id))]]) {
    const gain = set.filter((id) => ver(W, a, id) && !ver(W, base, id)), loss = set.filter((id) => !ver(W, a, id) && ver(W, base, id))
    P(`| ${a} | ${base} | ${sn} | ${list(gain)} | ${list(loss)} | ${gain.length - loss.length} |`)
  }
  const cv = [...W.first.combined.values()].filter((a) => a.outcome.verified)
  const byRung = {}
  for (const a of cv) (byRung[rungOf(a)] ??= []).push(a.taskId)
  const paid = [...W.first.combined.values()].filter((a) => (a.resp?.evidenceRecord?.access?.paidCalls ?? []).length > 0)
  P('', '## Which rung delivered each combined-arm success (first calls)', '',
    '| Delivering route (access.route/executor) | Verified tasks |', '| --- | --- |',
    ...Object.entries(byRung).sort((x, y) => y[1].length - x[1].length).map(([r, t]) => `| ${r} | ${list(t)} |`),
    '', `- Combined-arm answers that list a Steel paid call: ${list(paid.map((a) => a.taskId))}; of those, verified with Steel as the answer: ${list(paid.filter((a) => a.outcome.verified && (a.resp.evidenceRecord.access.paidCalls ?? []).some((c) => c.answer)).map((a) => a.taskId))}.`,
    `- Combined-arm gains over installed_chrome, by delivering route: ${ids.filter((id) => ver(W, 'combined', id) && !ver(W, 'installed_chrome', id)).map((id) => `${id} ${rungOf(W.first.combined.get(id))}`).join('; ') || 'none'}.`)
  const fc = figures(W, 'firecrawl', ALL).verified, ff = figures(W, 'firecrawl', frozen).verified
  P('', '## Gap to Firecrawl (first calls, same window)', '', '| Arm | All 92 | Gap | Frozen 50 | Gap |', '| --- | --- | --- | --- | --- |',
    ...ARMS.slice(0, 3).map((a) => { const x = figures(W, a, ALL).verified, y = figures(W, a, frozen).verified; return `| ${a} | ${x} vs ${fc} | ${fc - x} | ${y} vs ${ff} | ${ff - y} |` }))
  P('', '## Retry pass (apart from the first calls)', '', '| Arm | Retried | Verified on retry | False success on retry | Verified after retry | Retry cost |', '| --- | --- | --- | --- | --- | --- |',
    ...ARMS.map((a) => { const r = [...W.retry[a].values()]; return `| ${a} | ${r.length} | ${r.filter((x) => x.outcome.verified).length} | ${r.filter((x) => x.outcome.falseSuccess).length} | ${figures(W, a, ALL).verified + r.filter((x) => x.outcome.verified).length} | ${r.length ? cost(W, a, 'retry').text : '-'} |` }))
  P('', '## Per task (first calls)', '', 'yes = verified; FALSE = false success; no (reason) otherwise. Route: the combined arm\'s access.route/executor.', '',
    `| Task | Part | ${ARMS.join(' | ')} | Combined route |`, `| --- | --- | ${ARMS.map(() => '---').join(' | ')} | --- |`,
    ...tasks.map((t) => `| ${t.id} | ${t.part} | ${ARMS.map((a) => cell(W, a, t.id)).join(' | ')} | ${W.first.combined.get(t.id) ? rungOf(W.first.combined.get(t.id)) : '-'} |`),
    '', `Each arm's own records (run-set.mjs, per block and retry) are in \`${label}-<arm>.md\` beside this file; raw runs under \`${W.dir}\` and .w2l/access/runs/ (git-ignored).`, '')
  return L.join('\n')
}

function twoWindowRecord(W) {
  const [A, B] = W
  const both = (a, id) => ver(A, a, id) && ver(B, a, id)
  const neither = (a, id) => !ver(A, a, id) && !ver(B, a, id)
  const L = []
  const P = (...l) => L.push(...l)
  P(`# Combined grant, two windows: ${A.m.date} and ${B.m.date}`, '',
    `- Item: ROADMAP.md, PA bar, the first item to measure next. Windows \`${A.dir}\` (runner \`${A.m.runner}\`) and \`${B.dir}\` (runner \`${B.m.runner}\`); combined grant \`${A.m.grants.combined?.sha256}\` / \`${B.m.grants.combined?.sha256}\`. Each window's own record has its conditions.`,
    `- Command: \`node research/access/combinedReport.mjs ${A.dir} ${B.dir} --out ${opt('--out')}\`. First calls only.`)
  for (const [name, set] of [['all 92 tasks', ids], [`the ${frozen.size} frozen tasks`, ids.filter((id) => frozen.has(id))]]) {
    const S = new Set(set)
    P('', `## Verified per window and across both, ${name}`, '',
      `| Arm | Window 1 | Window 2 | In both | In one only | In neither | False success w1 / w2 | Both windows (of ${2 * set.length}, 95% upper) | p50 / p95 all w1 | p50 / p95 all w2 |`, '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...ARMS.map((a) => { const f0 = figures(A, a, S), f1 = figures(B, a, S); return `| ${a} | ${f0.verified} | ${f1.verified} | ${set.filter((id) => both(a, id)).length} | ${set.filter((id) => ver(A, a, id) !== ver(B, a, id)).length} | ${set.filter((id) => neither(a, id)).length} | ${f0.fs} / ${f1.fs} | ${f0.fs + f1.fs}/${2 * set.length}, ${f0.attempted + f1.attempted < 2 * set.length ? `upper unknown (${2 * set.length - f0.attempted - f1.attempted} not run)` : pct(upper(f0.fs + f1.fs, 2 * set.length))} | ${ms(f0.p50)} / ${ms(f0.p95)} | ${ms(f1.p50)} / ${ms(f1.p95)} |` }))
  }
  P('', '## Marginal gain held in both windows', '', 'A gain: the arm verified the task in both windows and the baseline in neither. A regression: the reverse. Any other disagreement is unstable.', '',
    '| Arm | Against | Set | Gains in both | Regressions in both | Net | Unstable |', '| --- | --- | --- | --- | --- | --- | --- |')
  for (const [a, base] of [['installed_chrome', 'standard'], ['combined', 'standard'], ['combined', 'installed_chrome']]) for (const [sn, set] of [['92', ids], ['frozen 50', ids.filter((id) => frozen.has(id))]]) {
    const g = set.filter((id) => both(a, id) && neither(base, id)), r = set.filter((id) => both(base, id) && neither(a, id))
    const u = set.filter((id) => !g.includes(id) && !r.includes(id) && !(both(a, id) && both(base, id)) && !(neither(a, id) && neither(base, id)))
    P(`| ${a} | ${base} | ${sn} | ${list(g)} | ${list(r)} | ${g.length - r.length} | ${list(u)} |`)
  }
  const held = ids.filter((id) => both('combined', id) && neither('installed_chrome', id))
  P('', '## The combined arm\'s gains over installed_chrome that held, by delivering route', '',
    held.length === 0 ? '- None.' : held.map((id) => `- ${id}: window 1 ${rungOf(A.first.combined.get(id))}, window 2 ${rungOf(B.first.combined.get(id))}`).join('\n'))
  P('', '## Cost and gap to Firecrawl, per window', '', '| Arm | Cost w1 | Cost w2 | Per 1,000 verified w1 | Per 1,000 verified w2 | Gap to Firecrawl, 92: w1 / w2 | Gap, frozen 50: w1 / w2 |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...ARMS.map((a) => { const c = [A, B].map((w) => cost(w, a, 'first')); const gap = (w, set) => figures(w, 'firecrawl', set).verified - figures(w, a, set).verified; return `| ${a} | ${c[0].text} | ${c[1].text} | ${per1000(figures(A, a, ALL).verified, c[0])} | ${per1000(figures(B, a, ALL).verified, c[1])} | ${a === 'firecrawl' ? '-' : `${gap(A, ALL)} / ${gap(B, ALL)}`} | ${a === 'firecrawl' ? '-' : `${gap(A, frozen)} / ${gap(B, frozen)}`} |` }),
    '', 'Cost: Octocrawl arms, the spend ledger over first calls (the grant\'s tariff estimate); Firecrawl, the change in remaining credits over its first calls. Clash bandwidth, compute, storage and delivery are not measured (unknown exposure).')
  P('', '## Per task, first calls (w1/w2: y = verified, F = false success, n = not, - = not run)', '',
    `| Task | Part | ${ARMS.join(' | ')} |`, `| --- | --- | ${ARMS.map(() => '---').join(' | ')} |`,
    ...tasks.map((t) => `| ${t.id} | ${t.part} | ${ARMS.map((a) => [A, B].map((w) => { const x = w.first[a].get(t.id); return !x ? '-' : x.outcome.verified ? 'y' : x.outcome.falseSuccess ? 'F' : 'n' }).join('/')).join(' | ')} |`), '')
  return L.join('\n')
}

if (dirs.length === 1) {
  const W = await load(dirs[0])
  const label = opt('--label')
  const out = join(outDir, `${label}-summary.md`)
  if (existsSync(out)) throw new Error(`${out} exists`)
  await writeFile(out, windowRecord(W, label))
  for (const a of ARMS) {
    const f = join(outDir, `${label}-${a}.md`)
    if (existsSync(f)) throw new Error(`${f} exists`)
    const parts = [`# Combined grant, window ${W.m.window}, arm ${a}, ${W.m.date}`, '', `The runner's own records of this arm's runs in the window, copied whole; the comparison is in \`${label}-summary.md\`.`, '']
    for (const r of W.m.runs.filter((x) => x.arm === a)) parts.push(`## ${r.label} (${r.startedAt} → ${r.finishedAt}, exit ${r.exitCode})`, '', `Raw run: \`${r.runDir ?? 'none'}\`.`, '', (existsSync(join(repo, r.record)) ? await readFile(join(repo, r.record), 'utf8') : '(no record written)').replace(/^# .*\n/, '').replace(/^#{1,2} /gm, '### ').trim(), '')
    await writeFile(f, parts.join('\n'))
  }
  console.log(`wrote ${out} and ${ARMS.length} arm records`)
} else {
  const out = opt('--out')
  if (existsSync(out)) throw new Error(`${out} exists`)
  await writeFile(out, twoWindowRecord([await load(dirs[0]), await load(dirs[1])]))
  console.log(`wrote ${out}`)
}
