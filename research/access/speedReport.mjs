// The committed records of the speed A/B after the 2026-10-26 speed root-cause analysis (O1 #722, O4 #720, O6 #721,
// O7 #723): installed_chrome and combined on the base commit (before #720) against the same arms on main after #723,
// on K1's 92 tasks, from the manifests k1-window.mjs wrote (--name perf --base <dir>) and the runs they name; and the
// probes beside them, from their run directories.
//
// Usage: node research/access/speedReport.mjs <work dir> --new <commit> --out <record.md>   one window; --new: main's
//          commit the runner's packages/ are checked against
//        node research/access/speedReport.mjs <w1 dir> <w2 dir> --out <record.md>      both windows: what held in both
//          (in every mode, a --note line goes into the header as given: what the runs' files cannot say)
//        node research/access/speedReport.mjs --probe <name>/<side>=<run dir> … [--note <line>] … --out <record.md>
//          the probes, each side one or more run-set runs (a side named again adds its run's tasks); a --note line
//          goes into the header as given
//   A file that exists is never replaced.
//
// Method (first calls only; no retry pass is read):
//   latency      each call's wall time (run-set's wallMs), p50/p95 by the rank combinedReport.mjs uses (the earlier
//                records' numbers), over all 92 tasks, over verified answers, and by delivering route (the route
//                run-set read from the Evidence Record, for a verified answer; `not verified` otherwise); paired: per task
//                new minus base, its median and how many tasks got faster.
//   verified     run-set's verdicts. A gain: new verified the task and base did not; a regression: the reverse. Across
//                two windows one holds when it is one in both; any other disagreement is unstable.
//   rungs, phases speedPhases.mjs over each saved response's summary.attempts: per rung its attempts and clock time, per
//                rung and phase the sum, timed or inferred as speedPhases.mjs says.
//   robots       per task, the rungs that checked robots.txt and those whose read took ROBOTS_FETCH_MS or more (counted
//                as fetched: inferred from the time, since no event says whether the cache answered), and their time.
//   challenge    every challenge_wait event, by gate and outcome (cleared, still_gated, not_waited).
//   Steel        the ledger's charge (run-set's chargedUsd; a page it did not report is unknown, never 0); per provider
//                rung its clock, its time outside the lane (clock less wallMs) and, where the answer has them, O7's steps.
//   A task without a saved response stays in every count; its breakdown is unknown, and the tables say how many.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attemptsOf, headersOf, ROBOTS_FETCH_MS } from './speedPhases.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const probes = args.flatMap((a, i) => (args[i - 1] === '--probe' ? [a] : []))
const notes = args.flatMap((a, i) => (args[i - 1] === '--note' ? [a] : []))
const dirs = args.filter((a, i) => !a.startsWith('--') && !['--out', '--probe', '--note', '--new', '--title'].includes(args[i - 1]))
const out = opt('--out')
if (!out || (probes.length === 0 && ![1, 2].includes(dirs.length))) throw new Error('usage: speedReport.mjs <dir> [<dir>] --out <record.md> | --probe <name>/<side>=<run dir> … --out <record.md>')
if (existsSync(out)) throw new Error(`${out} exists: a record is not rewritten`)

const tasks = JSON.parse(await readFile(join(here, 'tasks.v1.json'), 'utf8')).tasks
const ids = tasks.map((t) => t.id)
/** The window's base/new pairs, from its manifest: each `<arm>_base` with its `<arm>`, base first. */
const pairsOf = (m) => m.arms.filter((a) => a.endsWith('_base') && m.arms.includes(a.slice(0, -'_base'.length))).map((b) => [b, b.slice(0, -'_base'.length)])
const readJsonl = async (f) => (await readFile(f, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))
const sh = (cmd) => { try { return execSync(cmd, { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }

/** One run directory's cold attempts by task, each with its saved response and its rungs (speedPhases.mjs). */
async function runRows(runDir) {
  const rows = new Map()
  for (const x of await readJsonl(join(repo, runDir, 'attempts.jsonl'))) {
    if (x.temperature !== 'cold' || x.droppedAfterRun) continue
    let resp = null
    const f = join(repo, runDir, 'responses', `${x.taskId}-cold.json`)
    if (existsSync(f)) try { resp = JSON.parse(await readFile(f, 'utf8')).response ?? null } catch {}
    rows.set(x.taskId, { ...x, resp, rungs: attemptsOf(resp) })
  }
  return rows
}

async function load(dir) {
  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  const pairs = pairsOf(m), armList = pairs.flat()
  const arms = Object.fromEntries(armList.map((a) => [a, new Map()]))
  const env = []
  for (const r of m.runs.filter((x) => x.label.includes('first') && x.runDir && armList.includes(x.arm))) {
    for (const [id, row] of await runRows(r.runDir)) arms[r.arm].set(id, row)
    try { env.push({ label: r.label, ...JSON.parse(await readFile(join(repo, r.runDir, 'summary.json'), 'utf8')).environment }) } catch { env.push({ label: r.label }) }
  }
  let prechecks = null
  try { prechecks = (await readFile(join(dir, 'prechecks.txt'), 'utf8')).trim().split('\n').join('; ') } catch {}
  return { dir, m, pairs, armList, arms, env, prechecks }
}

// ---- figures
const q = (vals, p) => { const v = vals.filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length === 0 ? null : Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))]) }
const ms = (x) => (x === null || x === undefined ? '-' : String(Math.round(x)))
const s1 = (x) => (x === null || x === undefined ? '-' : (x / 1000).toFixed(1))
const signed = (x) => (x === null || x === undefined ? '-' : `${x > 0 ? '+' : ''}${Math.round(x)}`)
const list = (xs) => `${xs.length}${xs.length ? ` (${xs.join(', ')})` : ''}`
const routeOf = (x) => (x.outcome.verified ? x.observed?.deliveredBy ?? x.resp?.evidenceRecord?.access?.route ?? 'unknown' : 'not verified')
const reasonOf = (x) => (x.outcome.verified ? 'verified' : x.outcome.falseSuccess ? 'false success' : x.observed?.reason ?? x.observed?.status ?? 'runner_error')

function figures(rows) {
  const all = [...rows.values()]
  const walls = all.map((x) => x.outcome.wallMs), vw = all.filter((x) => x.outcome.verified).map((x) => x.outcome.wallMs)
  const charged = all.map((x) => x.outcome.chargedUsd)
  return { planned: ids.length, attempted: all.length, verified: vw.length, fs: all.filter((x) => x.outcome.falseSuccess).length,
    p50: q(walls, 0.5), p95: q(walls, 0.95), p50v: q(vw, 0.5), p95v: q(vw, 0.95), totalMs: walls.reduce((s, x) => s + (x ?? 0), 0),
    usd: charged.filter((x) => typeof x === 'number').reduce((s, x) => s + x, 0), usdUnknown: charged.filter((x) => typeof x !== 'number').length,
    noSummary: all.filter((x) => x.rungs === null).length }
}
const usdText = (f) => `$${f.usd.toFixed(4)}${f.usdUnknown ? ` + unknown on ${f.usdUnknown}` : ''}`
/** Per task new minus base, on the tasks both ran. */
function paired(base, neu) {
  const d = ids.filter((id) => base.has(id) && neu.has(id)).map((id) => neu.get(id).outcome.wallMs - base.get(id).outcome.wallMs)
  return { n: d.length, median: q(d, 0.5), faster: d.filter((x) => x < 0).length, slower: d.filter((x) => x > 0).length }
}
const ver = (rows, id) => rows.get(id)?.outcome.verified === true

function rungTable(rows) {
  const by = {}
  for (const x of rows.values()) for (const r of x.rungs ?? []) (by[r.channel] ??= []).push(r.clockMs)
  return by
}
function phaseTable(rows) {
  const by = {}
  for (const x of rows.values()) for (const r of x.rungs ?? []) for (const [k, v] of Object.entries(r.phases)) by[`${r.channel} · ${k}`] = (by[`${r.channel} · ${k}`] ?? 0) + v
  return by
}
function robots(rows) {
  const per = [...rows.values()].filter((x) => x.rungs !== null).map((x) => { const r = x.rungs.filter((a) => a.robots !== null); return { checks: r.length, fetched: r.filter((a) => a.robots.fetched).length, ms: r.reduce((s, a) => s + a.robots.ms, 0) } })
  const byRung = {}
  for (const x of rows.values()) for (const a of (x.rungs ?? []).filter((y) => y.robots !== null)) { const b = (byRung[a.channel] ??= { checks: 0, fetched: 0, ms: 0 }); b.checks++; b.fetched += a.robots.fetched ? 1 : 0; b.ms += a.robots.ms }
  const total = (k) => per.reduce((s, p) => s + p[k], 0)
  return { tasks: per.length, checks: total('checks'), fetched: total('fetched'), ms: total('ms'), byRung }
}
function challenge(rows) {
  const by = {}
  for (const x of rows.values()) for (const r of x.rungs ?? []) for (const c of r.challengeWaits) (by[`${c.blockReason} · ${c.outcome}`] ??= []).push(c.ms)
  return by
}
function steel(rows) {
  const calls = [...rows.values()].flatMap((x) => (x.rungs ?? []).filter((r) => r.channel === 'provider'))
  const med = (k) => q(calls.filter((c) => k in c.phases).map((c) => c.phases[k]), 0.5)
  return { calls: calls.length, timed: calls.filter((c) => c.timedSteps).length, clock: q(calls.map((c) => c.clockMs), 0.5), wall: q(calls.map((c) => c.wallMs), 0.5), outside: med('outside_lane'),
    steps: Object.fromEntries(['session_created', 'cdp_connected', 'ua_probed', 'robots_gate', 'page_opened', 'navigate', 'settled', 'gate_read', 'region_read', 'page_read', 'loading_wait', 'region_wait', 'release', 'in_page', 'before_gate'].map((k) => [k, med(k)])), failedBeforeGate: calls.filter((c) => 'before_gate' in c.phases).length }
}

// ---- one window
function header(W) {
  const { m } = W
  const g = m.grants
  const newPkgs = sh(`git diff --name-only ${m.runner} ${W.newCommit ?? m.runner} -- packages ':!packages/*/test/*'`)?.split('\n').filter(Boolean).join(', ') ?? null
  const builds = W.env.filter((e) => e.build).map((e) => e.build.upToDate)
  const firstAt = m.runs.map((r) => r.startedAt).sort()[0]
  const has = (family) => W.pairs.some(([, n]) => n === family)
  return [
    `- Measures: O1 (#722), O4 (#720), O6 (#721), O7 (#723) together, base against new; the read-only analysis \`.w2l/perf/2026-10-26-speed-root-cause.md\` (not in the repository), sections 1, 3 and U10.`,
    `- Command: \`node research/access/k1-window.mjs --window ${m.window} --name perf --arms ${m.arms.join(',')} --base <base checkout> --ic-grant <K1 installed_chrome grant>${has('combined') ? ' --combined-grant <combined grant>' : ''}${has('ic_compat') ? ' --ic-compat-grant <ic_compat grant>' : ''} --steel-grant <Steel grant> --ports ${m.ports.join(',')}${m.steelCap ? ` --steel-cap ${m.steelCap.usd}` : ''} --no-retry\`; report \`node research/access/speedReport.mjs ${W.dir} --new ${W.newCommit ?? '<commit>'} --out ${out}\`.`,
    `- New: the runner \`${m.runner}\`, its packages/ (tests aside) ${newPkgs === '' ? `equal to main \`${(W.newCommit ?? '').slice(0, 8)}\`` : `differ from \`${W.newCommit}\` in ${newPkgs ?? 'unread'}`}; run-set's build check up to date in ${builds.filter((b) => b === true).length} of ${W.env.length} runs (it reads this checkout only).`,
    `- Base: \`${m.base?.commit ?? 'none'}\` in its own checkout and API process; its build \`${m.base?.build?.check}\` ${m.base?.build?.upToDate === true ? 'up to date' : `NOT up to date (${JSON.stringify(m.base?.build)})`} at the start (k1-window.mjs).`,
    `- Grants: installed_chrome arms the K1 grant \`${g.installed_chrome.sha256}\` (${g.installed_chrome.capabilities.join(', ')}); ${has('combined') ? `combined arms \`${g.combined?.sha256 ?? 'none'}\` (${g.combined?.capabilities?.join(', ') ?? '-'}), W2L_VENDORS=steel, $0.05 a request, Steel at the grant's tariff` : 'no arm with Steel (no W2L_VENDORS, no Steel key)'}${has('ic_compat') ? `; ic_compat arms \`${g.ic_compat?.sha256 ?? 'none'}\` (${g.ic_compat?.capabilities?.join(', ') ?? '-'}), the K1 grant plus compatible_transport` : ''}. No CapSolver key or solver grant.`,
    `- Interleaving: ${m.blocks.length} blocks of ${m.blocks[0].length} in task-file order; in block b the four arms one after another, the list rotated by b, so each base arm ran before its new arm in half the blocks. First calls only (--no-retry).`,
    `- Network: ${m.proxy.HTTPS_PROXY || m.proxy.HTTP_PROXY ? 'proxied through Clash' : 'direct'} (HTTPS_PROXY=${m.proxy.HTTPS_PROXY}, HTTP_PROXY=${m.proxy.HTTP_PROXY}, NO_PROXY=${m.proxy.NO_PROXY}); exit addresses as run-set read them: ${[...new Set(W.env.map((e) => e.exitIp ?? 'unread'))].join(', ')}.`,
    `- Machine: ${W.prechecks ?? 'pre-checks not recorded'}. Sleep check (pmset log after each block): ${(m.sleepChecks ?? []).map((s) => `${s.what} ${s.sleeps === null ? 'unread' : s.sleeps.length === 0 ? 'none' : s.sleeps.join(', ')}`).join('; ') || 'none recorded'}.`,
    `- Window: ${firstAt} → ${m.finishedAt ?? 'unfinished'}. Steel cap: ${m.steelCap ? `$${m.steelCap.usd}, a page at most $${m.steelCap.pageCeilingUsd.toFixed(4)}` : 'none'}. Failures and caps: ${(m.failures ?? []).length ? m.failures.join('; ') : 'none'}.`,
  ]
}

function windowBody(W, P) {
  P('', '## Per arm, first calls, all 92 tasks', '',
    '| Arm | Attempted | Verified | False success | p50 all | p95 all | p50 verified | p95 verified | Wall total s | Steel, ledger | No ladder summary |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...W.armList.map((a) => { const f = figures(W.arms[a]); return `| ${a} | ${f.attempted} | ${f.verified} | ${f.fs} | ${ms(f.p50)} | ${ms(f.p95)} | ${ms(f.p50v)} | ${ms(f.p95v)} | ${s1(f.totalMs)} | ${usdText(f)} | ${f.noSummary} |` }),
    '', 'Not run counts as not verified (planned 92 each). Latency in wall ms.')
  P('', '## Base against new', '', '| Pair | Δ p50 all | Δ p95 all | Δ p50 verified | Δ p95 verified | Paired median Δ (n) | Faster / slower | Gains (new only) | Regressions (base only) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const [b, n] of W.pairs) {
    const fb = figures(W.arms[b]), fn = figures(W.arms[n]), p = paired(W.arms[b], W.arms[n])
    const gain = ids.filter((id) => ver(W.arms[n], id) && !ver(W.arms[b], id)), loss = ids.filter((id) => ver(W.arms[b], id) && !ver(W.arms[n], id))
    P(`| ${n} | ${signed(fn.p50 - fb.p50)} | ${signed(fn.p95 - fb.p95)} | ${signed(fn.p50v - fb.p50v)} | ${signed(fn.p95v - fb.p95v)} | ${signed(p.median)} (${p.n}) | ${p.faster} / ${p.slower} | ${list(gain)} | ${list(loss)} |`)
  }
  // An arm against another on the same side, when the window has both (Howard, 2026-10-27: installed_chrome alone against
  // installed_chrome with compatible_transport): what the second arm verified that the first did not, and the reverse.
  for (const [x, y] of [['installed_chrome', 'ic_compat'], ['installed_chrome_base', 'ic_compat_base']].filter(([x, y]) => W.arms[x] && W.arms[y])) {
    const win = ids.filter((id) => ver(W.arms[y], id) && !ver(W.arms[x], id)), lose = ids.filter((id) => ver(W.arms[x], id) && !ver(W.arms[y], id))
    const compat = ids.filter((id) => (W.arms[y].get(id)?.rungs ?? []).some((r) => r.channel === 'http_compat'))
    const fx = figures(W.arms[x]), fy = figures(W.arms[y])
    const at = (a, id) => { const r = W.arms[a].get(id); return r ? `${routeOf(r)}${r.outcome.verified ? '' : ` (${reasonOf(r)})`}` : 'not run' }
    P('', `## ${y} against ${x}, same window`, '', `- Verified ${fx.verified} → ${fy.verified}; p50 ${ms(fx.p50)} → ${ms(fy.p50)}; p95 ${ms(fx.p95)} → ${ms(fy.p95)}.`,
      `- ${y} verified, ${x} not: ${list(win)}${win.length ? `; ${y}'s route, ${x}'s answer: ${win.map((id) => `${id} ${at(y, id)} / ${at(x, id)}`).join('; ')}` : ''}.`,
      `- ${x} verified, ${y} not: ${list(lose)}${lose.length ? `; ${x}'s route, ${y}'s answer: ${lose.map((id) => `${id} ${at(x, id)} / ${at(y, id)}`).join('; ')}` : ''}.`,
      `- Tasks on which ${y} ran an http_compat rung: ${list(compat)}.`)
  }
  P('', '## By delivering route (verified answers; the rest as not verified)', '', '| Arm | Route | n | p50 | p95 |', '| --- | --- | --- | --- | --- |')
  for (const a of W.armList) {
    const by = {}
    for (const x of W.arms[a].values()) (by[routeOf(x)] ??= []).push(x.outcome.wallMs)
    for (const [r, v] of Object.entries(by).sort((x, y) => y[1].length - x[1].length)) P(`| ${a} | ${r} | ${v.length} | ${ms(q(v, 0.5))} | ${ms(q(v, 0.95))} |`)
  }
  P('', '## Wall time per rung (summed over the tasks with a ladder summary)', '', '| Arm | Rung | Attempts | Clock s | Mean ms | p50 ms |', '| --- | --- | --- | --- | --- | --- |')
  for (const a of W.armList) for (const [r, v] of Object.entries(rungTable(W.arms[a])).sort((x, y) => y[1].reduce((s, z) => s + z, 0) - x[1].reduce((s, z) => s + z, 0))) P(`| ${a} | ${r} | ${v.length} | ${s1(v.reduce((s, z) => s + z, 0))} | ${ms(v.reduce((s, z) => s + z, 0) / v.length)} | ${ms(q(v, 0.5))} |`)
  P('', '## Wall time per phase, seconds summed over every rung attempt', '', 'Timed or inferred as research/access/speedPhases.mjs says. The provider\'s outside_lane is its clock less its wallMs (session creation, connection, UA probe and release before O7 timed them); with O7 its session_created, cdp_connected, ua_probed and release are parts of it, not additions.', '')
  for (const [b, n] of W.pairs) {
    const pb = phaseTable(W.arms[b]), pn = phaseTable(W.arms[n])
    const keys = [...new Set([...Object.keys(pb), ...Object.keys(pn)])].filter((k) => (pb[k] ?? 0) + (pn[k] ?? 0) >= 500).sort((x, y) => (pb[y] ?? 0) + (pn[y] ?? 0) - (pb[x] ?? 0) - (pn[x] ?? 0))
    P(`| Rung · phase | ${b} | ${n} | Δ |`, '| --- | --- | --- | --- |', ...keys.map((k) => `| ${k} | ${s1(pb[k] ?? null)} | ${s1(pn[k] ?? null)} | ${pb[k] === undefined || pn[k] === undefined ? '-' : s1(pn[k] - pb[k])} |`), '')
  }
  P(`## robots.txt reads per task (a read of ${ROBOTS_FETCH_MS} ms or more counted as fetched: inferred)`, '', '| Arm | Tasks with a summary | Checks | Per task | Fetched | Per task | Robots s | By rung (checks / fetched) |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...W.armList.map((a) => { const r = robots(W.arms[a]); return `| ${a} | ${r.tasks} | ${r.checks} | ${(r.checks / Math.max(1, r.tasks)).toFixed(2)} | ${r.fetched} | ${(r.fetched / Math.max(1, r.tasks)).toFixed(2)} | ${s1(r.ms)} | ${Object.entries(r.byRung).map(([k, v]) => `${k} ${v.checks}/${v.fetched}`).join(', ')} |` }))
  P('', '## challenge_wait (installed_chrome), by gate and outcome', '', '| Arm | Gate · outcome | n | p50 ms | max ms | Total s |', '| --- | --- | --- | --- | --- | --- |')
  for (const a of W.armList) { const c = challenge(W.arms[a]); const e = Object.entries(c).sort(); if (e.length === 0) P(`| ${a} | none | 0 | - | - | 0 |`); for (const [k, v] of e) P(`| ${a} | ${k} | ${v.length} | ${ms(q(v, 0.5))} | ${ms(Math.max(...v.map((x) => x ?? 0)))} | ${s1(v.reduce((s, x) => s + (x ?? 0), 0))} |`) }
  if (!W.armList.some((a) => steel(W.arms[a]).calls > 0)) P('', '## Steel', '', 'No arm of this window ran a provider (Steel) rung.')
  else P('', W.armList.filter((a) => steel(W.arms[a]).calls > 0).every((a) => a.startsWith('combined')) ? '## Steel (combined arms)' : '## Steel (arms with a provider rung)', '', '| Arm | Provider rungs | Failed before the gate | With O7 steps | Ledger | p50 clock | p50 wallMs | p50 outside lane | p50 session_created / cdp_connected / ua_probed | p50 robots_gate / navigate / settled / region_read / page_read | p50 region_wait / release | p50 in page (inferred) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...W.armList.filter((a) => steel(W.arms[a]).calls > 0).map((a) => { const s = steel(W.arms[a]), st = s.steps, f = figures(W.arms[a]); return `| ${a} | ${s.calls} | ${s.failedBeforeGate} | ${s.timed} | ${usdText(f)} | ${ms(s.clock)} | ${ms(s.wall)} | ${ms(s.outside)} | ${ms(st.session_created)} / ${ms(st.cdp_connected)} / ${ms(st.ua_probed)} | ${ms(st.robots_gate)} / ${ms(st.navigate)} / ${ms(st.settled)} / ${ms(st.region_read)} / ${ms(st.page_read)} | ${ms(st.region_wait)} / ${ms(st.release)} | ${ms(st.in_page)} |` }))
  P('', '## Per task (first calls): verdict and wall ms, base → new', '', 'y = verified, F = false success, n = not (its reason), - = not run.', '',
    `| Task | Part | ${W.pairs.map(([, n]) => n).join(' | ')} |`, `| --- | --- | ${W.pairs.map(() => '---').join(' | ')} |`,
    ...tasks.map((t) => `| ${t.id} | ${t.part} | ${W.pairs.map(([b, n]) => [b, n].map((a) => { const x = W.arms[a].get(t.id); return !x ? '-' : `${x.outcome.verified ? 'y' : x.outcome.falseSuccess ? 'F' : `n (${reasonOf(x)})`} ${x.outcome.wallMs}` }).join(' → ')).join(' | ')} |`), '')
}

// ---- two windows
function twoWindows(A, B, P) {
  const both = (W1, W2, a, id) => ver(W1.arms[a], id) && ver(W2.arms[a], id)
  const neither = (W1, W2, a, id) => !ver(W1.arms[a], id) && !ver(W2.arms[a], id)
  // Only a pair both windows ran is compared across them; a pair one window ran alone is that window's, said so below.
  const PAIRS = A.pairs.filter(([, n]) => B.pairs.some(([, m]) => m === n)), ARMS = PAIRS.flat()
  const single = [...A.pairs.map((p) => [p, A, 1]), ...B.pairs.map((p) => [p, B, 2])].filter(([[, n]]) => !PAIRS.some(([, m]) => m === n))
  P('', '## Per arm and window, first calls, all 92 tasks', '', '| Arm | Verified w1 / w2 | In both | False success w1 / w2 | p50 all w1 / w2 | p95 all w1 / w2 | p50 verified w1 / w2 | p95 verified w1 / w2 | Steel w1 / w2 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...ARMS.map((a) => { const [x, y] = [A, B].map((w) => figures(w.arms[a])); return `| ${a} | ${x.verified} / ${y.verified} | ${ids.filter((id) => both(A, B, a, id)).length} | ${x.fs} / ${y.fs} | ${ms(x.p50)} / ${ms(y.p50)} | ${ms(x.p95)} / ${ms(y.p95)} | ${ms(x.p50v)} / ${ms(y.p50v)} | ${ms(x.p95v)} / ${ms(y.p95v)} | ${usdText(x)} / ${usdText(y)} |` }))
  P('', '## Base against new, per window', '', '| Pair | Δ p50 all w1 / w2 | Δ p95 all w1 / w2 | Paired median Δ w1 / w2 | Gains held in both | Regressions held in both | Unstable |', '| --- | --- | --- | --- | --- | --- | --- |')
  for (const [b, n] of PAIRS) {
    const d = (w, k) => figures(w.arms[n])[k] - figures(w.arms[b])[k]
    const g = ids.filter((id) => both(A, B, n, id) && neither(A, B, b, id)), r = ids.filter((id) => both(A, B, b, id) && neither(A, B, n, id))
    const u = ids.filter((id) => !g.includes(id) && !r.includes(id) && [A, B].some((w) => ver(w.arms[n], id) !== ver(w.arms[b], id)))
    P(`| ${n} | ${signed(d(A, 'p50'))} / ${signed(d(B, 'p50'))} | ${signed(d(A, 'p95'))} / ${signed(d(B, 'p95'))} | ${signed(paired(A.arms[b], A.arms[n]).median)} / ${signed(paired(B.arms[b], B.arms[n]).median)} | ${list(g)} | ${list(r)} | ${list(u)} |`)
  }
  if (single.length) P('', '## Pairs run in one window only (single window: not a two-window result)', '', '| Pair | Window | Verified base → new | p50 all base → new | p95 all base → new | Gains / regressions (that window) |', '| --- | --- | --- | --- | --- | --- |',
    ...single.map(([[b, n], w, k]) => { const fb = figures(w.arms[b]), fn = figures(w.arms[n]); return `| ${n} | ${k} (${w.m.date}) | ${fb.verified} → ${fn.verified} | ${ms(fb.p50)} → ${ms(fn.p50)} | ${ms(fb.p95)} → ${ms(fn.p95)} | ${ids.filter((id) => ver(w.arms[n], id) && !ver(w.arms[b], id)).length} / ${ids.filter((id) => ver(w.arms[b], id) && !ver(w.arms[n], id)).length} |` }))
  P('', '## Key phases per window, seconds summed', '', '| Arm | challenge_wait w1 / w2 | robots w1 / w2 | region_wait w1 / w2 | provider outside lane w1 / w2 | provider rung clock w1 / w2 |', '| --- | --- | --- | --- | --- | --- |')
  for (const a of ARMS) {
    const v = [A, B].map((w) => { const p = phaseTable(w.arms[a]), t = rungTable(w.arms[a]); const by = (suffix) => Object.entries(p).filter(([k]) => k.endsWith(suffix)).reduce((s, [, x]) => s + x, 0); return { cw: by('· challenge_wait'), rb: by('· robots') + by('· robots_gate'), rw: by('· region_wait'), out: p['provider · outside_lane'] ?? 0, prov: (t.provider ?? []).reduce((s, x) => s + x, 0) } })
    P(`| ${a} | ${s1(v[0].cw)} / ${s1(v[1].cw)} | ${s1(v[0].rb)} / ${s1(v[1].rb)} | ${s1(v[0].rw)} / ${s1(v[1].rw)} | ${s1(v[0].out)} / ${s1(v[1].out)} | ${s1(v[0].prov)} / ${s1(v[1].prov)} |`)
  }
  P('', '## challenge_wait outcomes, both windows', '', '| Arm | Gate · outcome | n (w1 + w2) | p50 ms | max ms |', '| --- | --- | --- | --- | --- |')
  for (const a of ARMS) { const c = {}; for (const w of [A, B]) for (const [k, v] of Object.entries(challenge(w.arms[a]))) (c[k] ??= []).push(...v); for (const [k, v] of Object.entries(c).sort()) P(`| ${a} | ${k} | ${v.length} | ${ms(q(v, 0.5))} | ${ms(Math.max(...v.map((x) => x ?? 0)))} |`) }
  // The analysis's what-if estimates (section 3, whatif.py over the combined windows of runner 22bf90e7, linear
  // interpolation): the measured p95 here uses the records' rank, and its base is not that window's commit.
  const p95 = (w, a) => (w.arms[a] ? figures(w.arms[a]).p95 : null), p50 = (w, a) => (w.arms[a] ? figures(w.arms[a]).p50 : null)
  P('', '## Against the analysis\'s estimates (p95 all, s)', '', 'Estimates from `.w2l/perf/2026-10-26-speed-root-cause.md` section 3, simulated per task on the combined windows of 2026-10-25/26 (runner `22bf90e7`, engine main `4dc53ac0`). "O1–O4" there includes O2 (Steel prewarm) and O3 (region-wait memory), neither of which was done; O1 and O4 are the parts that shipped, and O6 and O7 were estimated at 0 and unknown for these runs (run-set sends no `timeout`).', '',
    '| Arm | Estimate O1–O4 (w2; w1) | Estimate O1 alone (w2; w1) | Estimate O4: p50 | Measured base → new w1 | Measured base → new w2 | Measured p50 base → new w1 / w2 |', '| --- | --- | --- | --- | --- | --- | --- |',
    `| combined${A.arms.combined && B.arms.combined ? '' : ` (window ${A.arms.combined ? 1 : 2} only)`} | 53 → 27 (42 → 29) | 53 → 43 (42 → 37) | 6.4 → 5.8 (7.0 → 6.1); p95 −1 | ${s1(p95(A, 'combined_base'))} → ${s1(p95(A, 'combined'))} | ${s1(p95(B, 'combined_base'))} → ${s1(p95(B, 'combined'))} | ${s1(p50(A, 'combined_base'))} → ${s1(p50(A, 'combined'))} / ${s1(p50(B, 'combined_base'))} → ${s1(p50(B, 'combined'))} |`,
    `| installed_chrome | 26 → 18 | 26 → 24.5 | - | ${s1(p95(A, 'installed_chrome_base'))} → ${s1(p95(A, 'installed_chrome'))} | ${s1(p95(B, 'installed_chrome_base'))} → ${s1(p95(B, 'installed_chrome'))} | ${s1(p50(A, 'installed_chrome_base'))} → ${s1(p50(A, 'installed_chrome'))} / ${s1(p50(B, 'installed_chrome_base'))} → ${s1(p50(B, 'installed_chrome'))} |`,
    '', 'Reference, not run here: Firecrawl Cloud in the same 92 tasks, p50 / p95 all 3232 / 10989 ms (2026-10-25) and 3479 / 10213 ms (2026-10-26), from `research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md`.')
  P('', '## Per task, both windows (w1/w2: y = verified, F = false success, n = not, - = not run)', '', `| Task | Part | ${ARMS.join(' | ')} |`, `| --- | --- | ${ARMS.map(() => '---').join(' | ')} |`,
    ...tasks.map((t) => `| ${t.id} | ${t.part} | ${ARMS.map((a) => [A, B].map((w) => { const x = w.arms[a].get(t.id); return !x ? '-' : x.outcome.verified ? 'y' : x.outcome.falseSuccess ? 'F' : 'n' }).join('/')).join(' | ')} |`), '')
}

// ---- probes
async function probeRecord(P) {
  const groups = {}
  for (const p of probes) { const [key, runDir] = p.split('='); const [name, side] = key.split('/'); ((groups[name] ??= {})[side] ??= []).push(runDir) }
  for (const [name, sides] of Object.entries(groups)) {
    P('', `## ${name}`, '')
    const loaded = []
    for (const [side, runDirs] of Object.entries(sides)) {
      const rows = new Map(), sms = []
      for (const runDir of runDirs) { sms.push({ runDir, ...JSON.parse(await readFile(join(repo, runDir, 'summary.json'), 'utf8')) }); for (const [id, x] of await runRows(runDir)) rows.set(id, x) }
      loaded.push({ side, sms, rows, planned: sms.reduce((n, sm) => n + (sm.denominator?.planned ?? 0), 0) })
    }
    for (const s of loaded) for (const sm of s.sms) { const e = sm.environment; P(`- ${s.side}: \`${sm.command}\` against ${e.api}; runner \`${e.commit}\`${e.dirty ? ' (dirty)' : ''}, ${e.proxied ? 'proxied' : 'direct'} (exit ${e.exitIp ?? 'unread'}), grant \`${e.grant?.sha256 ?? 'none'}\`, started ${e.startedAt}; raw run \`${sm.runDir}\`.`) }
    P('', '| Side | Planned | Verified | False success | p50 | p95 | challenge_wait (gate · outcome: n, p50 ms) |', '| --- | --- | --- | --- | --- | --- | --- |')
    for (const s of loaded) {
      const all = [...s.rows.values()], c = challenge(s.rows)
      P(`| ${s.side} | ${s.planned || all.length} | ${all.filter((x) => x.outcome.verified).length} | ${all.filter((x) => x.outcome.falseSuccess).length} | ${ms(q(all.map((x) => x.outcome.wallMs), 0.5))} | ${ms(q(all.map((x) => x.outcome.wallMs), 0.95))} | ${Object.entries(c).sort().map(([k, v]) => `${k}: ${v.length}, ${ms(q(v, 0.5))}`).join('; ') || 'none'} |`)
    }
    const taskIds = [...new Set(loaded.flatMap((s) => [...s.rows.keys()]))]
    P('', `| Task | ${loaded.map((s) => s.side).join(' | ')} |`, `| --- | ${loaded.map(() => '---').join(' | ')} |`)
    for (const id of taskIds) {
      P(`| ${id} | ${loaded.map((s) => { const x = s.rows.get(id); if (!x) return 'not run'; const h = headersOf(x.resp); const cw = (x.rungs ?? []).flatMap((r) => r.challengeWaits).map((c) => `${c.blockReason} ${c.outcome} ${c.ms} ms`).join(', '); return `${x.outcome.verified ? 'verified' : x.outcome.falseSuccess ? 'FALSE success' : `not (${reasonOf(x)})`}, ${x.outcome.wallMs} ms; rungs ${h.rungs.join(' → ') || 'unknown'}; http requestMs ${ms(h.requestMs)}${h.httpFailure ? ` (${h.httpFailure})` : ''}${h.fallback ? `; header-timeout fallback${h.fallback.promised ? ' (promised)' : ''}, ${ms(h.fallback.remainingMs)} ms left` : ''}${cw ? `; challenge_wait ${cw}` : ''}; route ${x.observed?.deliveredBy ?? 'none'}; ledger ${typeof x.outcome.chargedUsd === 'number' ? `$${x.outcome.chargedUsd.toFixed(4)}` : 'unknown'}` }).join(' | ')} |`)
    }
  }
  P('')
}

const L = []
const P = (...l) => L.push(...l)
if (probes.length > 0) {
  P(`# Speed A/B probes: ${opt('--title') ?? 'O1, O4, O6, O7'}`, '', `- Command: \`node research/access/speedReport.mjs ${probes.map((p) => `--probe ${p}`).join(' ')} --out ${out}\`.`, '- Each probe\'s run-set command, API, commit, network and grant are on its lines below.', ...notes.map((n) => `- ${n}`))
  await probeRecord(P)
} else if (dirs.length === 1) {
  const W = await load(dirs[0])
  W.newCommit = opt('--new') ?? null
  P(`# Speed A/B, window ${W.m.window}: base \`${W.m.base?.commit?.slice(0, 8)}\` against new, ${W.pairs.map(([, n]) => n).join(' and ')} on K1's 92 tasks, ${W.m.date}`, '', ...header(W), ...notes.map((n) => `- ${n}`))
  windowBody(W, P)
} else {
  const [A, B] = [await load(dirs[0]), await load(dirs[1])]
  P(`# Speed A/B, two windows: ${A.m.date} and ${B.m.date}`, '', `- Windows \`${A.dir}\` (runner \`${A.m.runner}\`, base \`${A.m.base?.commit?.slice(0, 8)}\`) and \`${B.dir}\` (runner \`${B.m.runner}\`, base \`${B.m.base?.commit?.slice(0, 8)}\`); each window's own record has its conditions.`, `- Command: \`node research/access/speedReport.mjs ${A.dir} ${B.dir} --out ${out}\`. First calls only.`, ...notes.map((n) => `- ${n}`))
  twoWindows(A, B, P)
}
await writeFile(out, L.join('\n'))
console.log(`wrote ${out}`)
