// The committed records of the combined-grant measurement after K1 (ROADMAP, PA bar, the first item to measure next):
// one grant holding installed_chrome and the enhanced arm's Steel routes, against standard, installed_chrome alone and
// Firecrawl Cloud, on K1's 92 tasks, from the manifests k1-window.mjs wrote (--name combined) and the runs they name.
//
// Usage: node research/access/combinedReport.mjs <work dir> --label <date>-combined-w<n>-<commit>
//          one window: research/access/runs/<label>-summary.md and one <label>-<arm>.md per arm (the runner's records);
//          --out <dir> writes them elsewhere
//        node research/access/combinedReport.mjs <w1 dir> <w2 dir> --out <record.md>
//          the two-window record: what held in both windows
//   A file that exists is never replaced. The arms are those the manifests ran (combinedArms.mjs): the combined-grant
//   measurement's standard, installed_chrome, combined and Firecrawl, or the ic_compat measurement's installed_chrome,
//   ic_compat and combined (ROADMAP current phase, decision 17, stage L item 1), which adds its exit, each arm's Steel
//   calls and the #716 gains in ic_compat, and takes Firecrawl's reference from #716's windows.
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
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exitOf, pairsFor, REPORT_ARMS, reportArms, steelCalls, steelTally } from './combinedArms.mjs'

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
// The arms the windows ran, in REPORT_ARMS order: set once the manifests are read.
let ARMS = []
const LOCAL = new Set(REPORT_ARMS.filter((a) => a !== 'firecrawl'))
const readJsonl = async (f) => (await readFile(f, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))
// #716's gains of the combined grant over installed_chrome that held in both its windows, with their routes there.
const HELD_716 = [['T007', 'http_compat/impit'], ['T008', 'w1 http/undici, w2 browser/playwright'], ['T014', 'vendor/steel'], ['T018', 'http_compat/impit'], ['T050', 'vendor/steel']]
const FIRECRAWL_716 = 'Firecrawl was not run in this window. Its reference is #716\'s two windows (research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md, first calls): 67 and 69 of 92 verified, 33 and 34 of the frozen 50, with 15 and 12 false successes (9 and 7 on the frozen 50). Those windows ran on 2026-10-25 and 2026-10-26, so a gap to them is not a same-window comparison.'

async function load(dir) {
  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  const rows = { first: {}, retry: {} }
  for (const phase of ['first', 'retry']) for (const a of REPORT_ARMS) {
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
  // A note on the window that its manifest cannot hold (a start stopped and set aside), written into its record as is.
  let note = null
  try { note = (await readFile(join(dir, 'note.md'), 'utf8')).trim() || null } catch {}
  return { dir, m, first: rows.first, retry: rows.retry, shas, prechecks, note, dirty, build }
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
    const changed = execSync(`git diff --name-only ${base} ${runner} -- packages`, { cwd: repo }).toString().trim().split('\n').filter(Boolean)
    // A test the runner adds is not engine code: the API loads packages/*/dist, built from src.
    const tests = changed.filter((f) => /^packages\/[^/]+\/test\//.test(f)), differs = changed.filter((f) => !tests.includes(f))
    return differs.length === 0 ? `main \`${base.slice(0, 8)}\` plus research files only; packages/ is main's${tests.length ? ` apart from tests (${tests.join(', ')})` : ''}` : `differs from main \`${base.slice(0, 8)}\` in packages/: ${differs.join(', ')}`
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
  const runner = `- Runner commit: \`${m.runner}\` (${engineLine(m.runner)}). \`npx tsc --build\` ran before the APIs started; run-set's stale-build check (each arm record's Engine build line): up to date in ${W.build.upToDate} local runs${W.build.stale.length ? `, stale in ${W.build.stale.join(', ')}` : ''}${W.build.unknown.length ? `, unread in ${W.build.unknown.join(', ')}` : ''}.`
  const tree = `- Working tree: ${W.dirty.length === 0 ? 'clean at every run\'s start' : `run-set recorded uncommitted changes at the start of ${W.dirty.join(', ')}`}.`
  const taskSet = `- Task set: research/access/tasks.v1.json, ${m.tasks} tasks (set \`all\`; frozen ${frozen.size}); SHA-256 as each run recorded it: ${[...W.shas].map((x) => `\`${x}\``).join(', ') || 'unknown'}.`
  const network = `- Network: ${m.proxy.HTTPS_PROXY || m.proxy.HTTP_PROXY ? 'proxied (the shell\'s proxy; Clash on this Mac)' : 'direct (no proxy variable set)'}. HTTPS_PROXY=${m.proxy.HTTPS_PROXY}, HTTP_PROXY=${m.proxy.HTTP_PROXY}, NO_PROXY=${m.proxy.NO_PROXY}; each local arm's exit address is in its arm record.`
  const machine = `- Machine: ${W.prechecks ?? 'pre-checks not recorded'}. Sleep check (pmset log after each block): ${(m.sleepChecks ?? []).map((s) => `${s.what} ${s.sleeps === null ? 'unread' : s.sleeps.length === 0 ? 'none' : s.sleeps.join(', ')}`).join('; ') || 'none recorded'}.`
  const span = `- Window: ${m.runs.map((r) => r.startedAt).sort()[0]} → ${m.finishedAt ?? 'unfinished'}. Failures and caps: ${(m.failures ?? []).length ? m.failures.join('; ') : 'none'}.`
  if (!ARMS.includes('ic_compat')) P(`# Combined grant, window ${m.window}: installed_chrome and the Steel routes in one grant, on K1's 92 tasks, ${m.date}`, '',
    '- Item: ROADMAP.md, PA bar, the first item to measure next (written by K5, #687): one grant holding `installed_chrome` together with the enhanced arm\'s routes, which K1 ran under separate grants. Asked for by Howard on 2026-10-25.',
    `- Command: \`node research/access/k1-window.mjs --window ${m.window} --name combined --arms ${m.arms.join(',')} --ic-grant <K1 installed_chrome grant> --combined-grant <combined grant> --ports ${m.ports.join(',')} --firecrawl-cap ${FIRECRAWL_CAP}\`; report \`node research/access/combinedReport.mjs ${W.dir} --label ${label}\`.`,
    runner, tree, taskSet,
    `- Arms: standard (no grant, access standard); installed_chrome (the K1 grant \`${g.installed_chrome.sha256}\`, ${g.installed_chrome.capabilities.join(', ')}); combined (\`${g.combined?.sha256 ?? 'not run'}\`, ${g.combined?.capabilities.join(', ') ?? '-'}; W2L_VENDORS=steel; run budget $1, $0.05 per request, Steel at $0.10 per browser hour, the same settings as the Steel grant \`${g.steel.sha256}\`; no vendor_residential_proxy, decision 1); Firecrawl Cloud (markdown, its own strongest route, maxAge 0, storeInCache false). Octocrawl arms with access enhanced except standard.`,
    `- Interleaving: ${m.blocks.length} blocks of ${m.blocks[0].length} in task-file order; in block b the three local arms one after another, order rotated by b; Firecrawl on the same block at the same time. Then one retry pass of each local arm's first-call failures, reported apart; Firecrawl's retry runs only within the window's ${FIRECRAWL_CAP}-credit cap.`,
    `${network} Firecrawl fetches from its own cloud (region not pinned).`,
    machine, span,
    `- Firecrawl account: before ${JSON.stringify(m.credits.before.firecrawl ?? null)}, after first calls ${JSON.stringify(m.credits.afterFirst?.firecrawl ?? null)}, after ${JSON.stringify(m.credits.after.firecrawl ?? null)}.`,
    `- Firecrawl spend against the ${FIRECRAWL_CAP}-credit cap: ${firecrawlSpend(W)}.`)
  else P(`# installed_chrome with compatible_transport and no Steel, window ${m.window}: against installed_chrome alone and the combined grant, on K1's 92 tasks, ${m.date}`, '',
    '- Item: ROADMAP.md, current phase (decision 17 in docs/pa-enhancement-tasks.md), stage L item 1: the candidate local default, `installed_chrome` with `compatible_transport` (http_compat/impit) and no Steel, which no earlier run measured; the combined grant of #716 is the reference arm. Exit: in both windows ic_compat verifies at least the combined arm\'s count minus 2, with no more false successes.',
    `- Command: \`node research/access/k1-window.mjs --window ${m.window} --name ${basename(dirname(W.dir))} --arms ${m.arms.join(',')} --ic-grant <K1 installed_chrome grant> --ic-compat-grant <ic_compat grant> --combined-grant <combined grant> --ports ${m.ports.join(',')}${m.steelCap ? ` --steel-cap ${m.steelCap.usd}` : ''}${m.steelProbe ? ' --steel-probe' : ''}\`; report \`node research/access/combinedReport.mjs ${W.dir} --label ${label}\`.`,
    runner, tree, taskSet,
    `- Arms: installed_chrome (the K1 grant \`${g.installed_chrome.sha256}\`, ${g.installed_chrome.capabilities.join(', ')}); ic_compat (\`${g.ic_compat.sha256}\`, ${g.ic_compat.capabilities.join(', ')}; the K1 grant's tier, budget, scope and tariffs by the engine's parser, checked by the driver; no W2L_VENDORS and no Steel key, so no route that spends money); combined (\`${g.combined?.sha256 ?? 'not run'}\`, ${g.combined?.capabilities.join(', ') ?? '-'}; W2L_VENDORS=steel; the Steel grant \`${g.steel.sha256}\`'s tier, budget, scope and tariffs by the engine's parser; no vendor_residential_proxy, decision 1). Every arm with access enhanced. No standard arm and no Firecrawl; Firecrawl's reference is #716's (below).`,
    `- Interleaving: ${m.blocks.length} blocks of ${m.blocks[0].length} in task-file order; in block b the ${m.arms.length} arms one after another, the list ${m.arms.join(', ')} rotated by b. ${m.retryPlanned ? 'Then one retry pass of each arm\'s first-call failures, reported apart.' : 'No retry pass.'}`,
    network, machine,
    `${span}${m.steelCap ? ` Steel cap: $${m.steelCap.usd} by the ledger over the window, a page at most $${m.steelCap.pageCeilingUsd.toFixed(4)} (the tariff's ceiling).` : ''}`,
    `- Steel's API at the window's start: ${m.steelProbe ? `\`${m.steelProbe.request}\` (read-only, through the shell's proxy) answered ${m.steelProbe.status ?? `nothing (${m.steelProbe.error})`} in ${m.steelProbe.ms} ms at ${m.steelProbe.at}` : 'not read'}.`)
  if (W.note) P('', W.note)
  for (const [name, set] of [['all 92 tasks', ALL], [`the ${frozen.size} frozen tasks`, frozen]]) {
    P('', `## First calls, ${name} (main metric)`, '',
      '| Arm | Planned | Attempted | Not run | Verified | False success | FS / delivered (N, 95% upper) | FS / all requests (N, 95% upper) | p50 verified | p95 verified | p50 all | p95 all |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...ARMS.map((a) => { const f = figures(W, a, set); return `| ${a} | ${f.planned} | ${f.attempted} | ${f.planned - f.attempted} | ${f.verified} | ${f.fs} | ${f.fs}/${f.delivered}, ${pct(upper(f.fs, f.delivered))} | ${fsAll(f)} | ${ms(f.p50v)} | ${ms(f.p95v)} | ${ms(f.p50)} | ${ms(f.p95)} |` }))
  }
  P('', 'Not run counts as not verified. Latency in wall ms.')
  if (ARMS.includes('ic_compat')) P('', '## Exit in this window', '', 'ic_compat verifies at least the combined arm\'s count minus 2, with no more false successes (unknown when tasks not run could decide it). The exit is read on all 92 tasks; the frozen 50 are shown beside it.', '', ...exitRows([W]))
  P('', '## Cost (first calls, all 92)', '',
    '| Arm | Cost | Cost per 1,000 verified |', '| --- | --- | --- |',
    ...ARMS.map((a) => { const c = cost(W, a, 'first'); return `| ${a} | ${c.text} | ${per1000(figures(W, a, ALL).verified, c)} |` }),
    '', 'Cost per 1,000 verified divides the first calls\' whole cost (failures included) by first-call verified tasks.')
  P('', '## Marginal gain (first calls)', '', '| Arm | Against | Set | Gains | Regressions | Net |', '| --- | --- | --- | --- | --- | --- |')
  for (const [a, base] of pairsFor(ARMS)) for (const [sn, set] of [['92', ids], ['frozen 50', ids.filter((id) => frozen.has(id))]]) {
    const gain = set.filter((id) => ver(W, a, id) && !ver(W, base, id)), loss = set.filter((id) => !ver(W, a, id) && ver(W, base, id))
    P(`| ${a} | ${base} | ${sn} | ${list(gain)} | ${list(loss)} | ${gain.length - loss.length} |`)
  }
  /** The tasks `a` verified and `base` did not, each with the route that delivered it in arm `by`. */
  const routed = (a, base, by = a) => ids.filter((id) => ver(W, a, id) && !ver(W, base, id)).map((id) => `${id} ${rungOf(W.first[by].get(id))}`).join('; ') || 'none'
  for (const a of ROUTED.filter((x) => ARMS.includes(x))) {
    const byRung = {}
    for (const x of [...W.first[a].values()].filter((x) => x.outcome.verified)) (byRung[rungOf(x)] ??= []).push(x.taskId)
    const paid = [...W.first[a].values()].filter((x) => (x.resp?.evidenceRecord?.access?.paidCalls ?? []).length > 0)
    const steel = a === 'combined' ? 'Steel' : null
    P('', `## Which rung delivered each ${a}-arm success (first calls)`, '',
      '| Delivering route (access.route/executor) | Verified tasks |', '| --- | --- |',
      ...Object.entries(byRung).sort((x, y) => y[1].length - x[1].length).map(([r, t]) => `| ${r} | ${list(t)} |`),
      '', `- ${a === 'combined' ? 'Combined' : a}-arm answers that list a ${steel ? 'Steel ' : ''}paid call: ${list(paid.map((x) => x.taskId))}; of those, verified with ${steel ?? 'a paid call'} as the answer: ${list(paid.filter((x) => x.outcome.verified && (x.resp.evidenceRecord.access.paidCalls ?? []).some((c) => c.answer)).map((x) => x.taskId))}.`,
      `- ${a === 'combined' ? 'Combined' : a}-arm gains over installed_chrome, by delivering route: ${routed(a, 'installed_chrome')}.`,
      ...(a === 'ic_compat' && ARMS.includes('combined') ? [`- What dropping Steel lost in this window: the combined arm's gains over ic_compat, by combined's delivering route: ${routed('combined', 'ic_compat')}.`, `- ic_compat-arm gains over combined, by delivering route: ${routed('ic_compat', 'combined')}.`] : []))
  }
  if (ARMS.includes('firecrawl')) {
    const fc = figures(W, 'firecrawl', ALL).verified, ff = figures(W, 'firecrawl', frozen).verified
    P('', '## Gap to Firecrawl (first calls, same window)', '', '| Arm | All 92 | Gap | Frozen 50 | Gap |', '| --- | --- | --- | --- | --- |',
      ...ARMS.filter((a) => a !== 'firecrawl').map((a) => { const x = figures(W, a, ALL).verified, y = figures(W, a, frozen).verified; return `| ${a} | ${x} vs ${fc} | ${fc - x} | ${y} vs ${ff} | ${ff - y} |` }))
  } else P('', '## Firecrawl', '', FIRECRAWL_716)
  P('', '## Retry pass (apart from the first calls)', '', '| Arm | Retried | Verified on retry | False success on retry | Verified after retry | Retry cost |', '| --- | --- | --- | --- | --- | --- |',
    ...ARMS.map((a) => { const r = [...W.retry[a].values()]; return `| ${a} | ${r.length} | ${r.filter((x) => x.outcome.verified).length} | ${r.filter((x) => x.outcome.falseSuccess).length} | ${figures(W, a, ALL).verified + r.filter((x) => x.outcome.verified).length} | ${r.length ? cost(W, a, 'retry').text : '-'} |` }))
  if (m.steelCap || m.steelProbe) P(...steelSection(W))
  const routes = ROUTED.filter((x) => ARMS.includes(x))
  P('', '## Per task (first calls)', '', `yes = verified; FALSE = false success; no (reason) otherwise. ${routes.length === 1 ? 'Route: the combined arm\'s access.route/executor.' : 'Routes: each arm\'s access.route/executor.'}`, '',
    `| Task | Part | ${ARMS.join(' | ')} | ${routes.map((a) => (a === 'combined' ? 'Combined route' : `${a} route`)).join(' | ')} |`, `| --- | --- | ${ARMS.map(() => '---').join(' | ')} | ${routes.map(() => '---').join(' | ')} |`,
    ...tasks.map((t) => `| ${t.id} | ${t.part} | ${ARMS.map((a) => cell(W, a, t.id)).join(' | ')} | ${routes.map((a) => (W.first[a].get(t.id) ? rungOf(W.first[a].get(t.id)) : '-')).join(' | ')} |`),
    '', `Each arm's own records (run-set.mjs, per block and retry) are in \`${label}-<arm>.md\` beside this file; raw runs under \`${W.dir}\` and .w2l/access/runs/ (git-ignored).`, '')
  return L.join('\n')
}

// The arms whose delivering routes a record lists: the combined grant's, and the ic_compat arm's when it ran.
const ROUTED = ['ic_compat', 'combined']

/** The exit of the ic_compat measurement (combinedArms.mjs exitOf), one row per window and task set. */
function exitRows(windows) {
  const yes = (x) => (x === null ? 'unknown' : x ? 'yes' : 'no')
  return ['| Window | Set | ic_compat verified | Combined verified | At least | ic_compat FS | Combined FS | Verified | No more false successes | Met |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...windows.flatMap((w) => [['all 92', ALL], [`frozen ${frozen.size}`, frozen]].map(([sn, set]) => {
      const i = figures(w, 'ic_compat', set), c = figures(w, 'combined', set), e = exitOf(i, c)
      return `| ${w.m.window} (${w.m.date}) | ${sn} | ${i.verified} | ${c.verified} | ${e.needed} | ${i.fs} | ${c.fs} | ${yes(e.verified)} | ${yes(e.falseSuccess)} | ${yes(e.met)} |`
    }))]
}

/** Each local arm's Steel calls in the window (combinedArms.mjs steelTally), first calls and retry apart. */
function steelSection(W) {
  const rows = ARMS.filter((a) => LOCAL.has(a)).flatMap((a) => ['first', 'retry'].filter((p) => W[p][a].size > 0).map((p) => {
    const s = steelTally([...W[p][a].values()].map((x) => steelCalls(x.resp)))
    // With an unread answer every count is a lower bound.
    const lb = s.complete ? '' : '≥ '
    const t = (n) => (n === null ? 'unknown' : Object.entries(n).map(([key, v]) => `${key} × ${lb}${v}`).join(', ') || (s.complete ? 'none' : 'none read'))
    const k = (x) => (x === null ? 'unknown' : `${lb}${x}`)
    return `| ${a} | ${p} | ${s.responses} | ${s.unread} | ${k(s.calls)} | ${k(s.refused)} | ${k(s.created)} | ${s.createMs === null ? '-' : `${s.createMs.p50} / ${s.createMs.max}`} | ${k(s.createFailed)}${s.createFailed ? ` (${t(s.createErrors)})` : ''} | ${k(s.createdWithoutRelease)} | ${k(s.releases)} | ${t(s.releasedBy)} | ${k(s.unconfirmed)}${s.unconfirmed ? ` (${t(s.unconfirmedStates)})` : ''} | ${t(s.basis)} | ${s.chargedUsd === null ? 'unknown' : `$${s.chargedUsd.toFixed(4)}`} |`
  }))
  return ['', '## Steel calls', '',
    'From each answer\'s ladder summary (the provider rungs, as run-set saved the response): a call whose session was never created, with the error the lane gave; each session\'s release, confirmed by a release call or, when none was, by Steel\'s own state (GET /v1/sessions/{id}, #725); and the ledger\'s basis for each call\'s charge. An answer without a ladder summary is counted as unread: its calls are unknown, not none, so with any unread answer the counts are lower bounds (≥) and the ledger total is unknown. Unknown session and release counts: an engine before the provider\'s step events (#723) traced neither.', '',
    '| Arm | Phase | Answers | Unread | Steel calls | Refused | Sessions created | Create ms p50 / max | Create failed (error × n) | Created, no release event | Releases | Released, by | Unconfirmed (Steel\'s state) | Charge basis | Ledger |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows]
}

function twoWindowRecord(W) {
  const [A, B] = W
  const both = (a, id) => ver(A, a, id) && ver(B, a, id)
  const neither = (a, id) => !ver(A, a, id) && !ver(B, a, id)
  const L = []
  const P = (...l) => L.push(...l)
  const ic = ARMS.includes('ic_compat')
  if (!ic) P(`# Combined grant, two windows: ${A.m.date} and ${B.m.date}`, '',
    `- Item: ROADMAP.md, PA bar, the first item to measure next. Windows \`${A.dir}\` (runner \`${A.m.runner}\`) and \`${B.dir}\` (runner \`${B.m.runner}\`); combined grant \`${A.m.grants.combined?.sha256}\` / \`${B.m.grants.combined?.sha256}\`. Each window's own record has its conditions.`)
  else P(`# installed_chrome with compatible_transport and no Steel, two windows: ${A.m.date} and ${B.m.date}`, '',
    `- Item: ROADMAP.md, current phase (decision 17), stage L item 1. Windows \`${A.dir}\` (runner \`${A.m.runner}\`) and \`${B.dir}\` (runner \`${B.m.runner}\`); ic_compat grant \`${A.m.grants.ic_compat?.sha256}\` / \`${B.m.grants.ic_compat?.sha256}\`, combined grant \`${A.m.grants.combined?.sha256}\` / \`${B.m.grants.combined?.sha256}\`; arms listed ${A.m.arms.join(', ')} in window 1 and ${B.m.arms.join(', ')} in window 2. Each window's own record has its conditions.`)
  P(`- Command: \`node research/access/combinedReport.mjs ${A.dir} ${B.dir} --out ${opt('--out')}\`. First calls only.`)
  for (const [n, X] of [[1, A], [2, B]]) if (X.note) P(`- Window ${n}'s record carries a note on the window (${X.note.split('\n')[0].replace(/^#+\s*/, '')}); nothing it describes is counted here.`)
  for (const [name, set] of [['all 92 tasks', ids], [`the ${frozen.size} frozen tasks`, ids.filter((id) => frozen.has(id))]]) {
    const S = new Set(set)
    P('', `## Verified per window and across both, ${name}`, '',
      `| Arm | Window 1 | Window 2 | In both | In one only | In neither | False success w1 / w2 | Both windows (of ${2 * set.length}, 95% upper) | p50 / p95 all w1 | p50 / p95 all w2 |`, '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...ARMS.map((a) => { const f0 = figures(A, a, S), f1 = figures(B, a, S); return `| ${a} | ${f0.verified} | ${f1.verified} | ${set.filter((id) => both(a, id)).length} | ${set.filter((id) => ver(A, a, id) !== ver(B, a, id)).length} | ${set.filter((id) => neither(a, id)).length} | ${f0.fs} / ${f1.fs} | ${f0.fs + f1.fs}/${2 * set.length}, ${f0.attempted + f1.attempted < 2 * set.length ? `upper unknown (${2 * set.length - f0.attempted - f1.attempted} not run)` : pct(upper(f0.fs + f1.fs, 2 * set.length))} | ${ms(f0.p50)} / ${ms(f0.p95)} | ${ms(f1.p50)} / ${ms(f1.p95)} |` }))
  }
  P('', '## Marginal gain held in both windows', '', 'A gain: the arm verified the task in both windows and the baseline in neither. A regression: the reverse. Any other disagreement is unstable.', '',
    '| Arm | Against | Set | Gains in both | Regressions in both | Net | Unstable |', '| --- | --- | --- | --- | --- | --- | --- |')
  for (const [a, base] of pairsFor(ARMS)) for (const [sn, set] of [['92', ids], ['frozen 50', ids.filter((id) => frozen.has(id))]]) {
    const g = set.filter((id) => both(a, id) && neither(base, id)), r = set.filter((id) => both(base, id) && neither(a, id))
    const u = set.filter((id) => !g.includes(id) && !r.includes(id) && !(both(a, id) && both(base, id)) && !(neither(a, id) && neither(base, id)))
    P(`| ${a} | ${base} | ${sn} | ${list(g)} | ${list(r)} | ${g.length - r.length} | ${list(u)} |`)
  }
  /** The tasks `a` verified in both windows and `base` in neither, each with the route that delivered it in arm `by`, per window. */
  const heldBy = (a, base, by = a) => { const held = ids.filter((id) => both(a, id) && neither(base, id)); return held.length === 0 ? '- None.' : held.map((id) => `- ${id}: window 1 ${rungOf(A.first[by].get(id))}, window 2 ${rungOf(B.first[by].get(id))}`).join('\n') }
  if (ic) {
    const verdict = (w, a, id) => { const x = w.first[a].get(id); return !x ? 'not run' : x.outcome.verified ? `yes (${rungOf(x)})` : x.outcome.falseSuccess ? 'FALSE' : `no (${reasonOf(x)})` }
    P('', '## The ic_compat arm\'s gains over installed_chrome that held, by delivering route', '', heldBy('ic_compat', 'installed_chrome'),
      '', '## What dropping Steel lost: the combined arm\'s gains over ic_compat that held, by combined\'s delivering route', '', heldBy('combined', 'ic_compat'),
      '', '## The ic_compat arm\'s gains over combined that held, by delivering route', '', heldBy('ic_compat', 'combined'),
      '', '## #716\'s held gains over installed_chrome, in these windows', '', 'The five tasks the combined grant gained over installed_chrome in both of #716\'s windows (research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md), with the route #716 recorded.', '',
      '| Task | #716 route | ic_compat w1 | ic_compat w2 | Combined w1 | Combined w2 | installed_chrome w1 / w2 |', '| --- | --- | --- | --- | --- | --- | --- |',
      ...HELD_716.map(([id, r]) => `| ${id} | ${r} | ${verdict(A, 'ic_compat', id)} | ${verdict(B, 'ic_compat', id)} | ${verdict(A, 'combined', id)} | ${verdict(B, 'combined', id)} | ${[A, B].map((w) => (ver(w, 'installed_chrome', id) ? 'yes' : 'no')).join(' / ')} |`),
      '', '## Exit', '', 'In both windows, ic_compat verifies at least the combined arm\'s count minus 2, with no more false successes (unknown when tasks not run could decide it). The exit is read on all 92 tasks; the frozen 50 are shown beside it.', '', ...exitRows([A, B]),
      '', `- Exit ${(() => { const e = [A, B].map((w) => exitOf(figures(w, 'ic_compat', ALL), figures(w, 'combined', ALL)).met); return e.every((x) => x === true) ? 'met' : e.some((x) => x === false) ? 'not met' : 'unknown' })()} on all 92 tasks.`)
  }
  if (ARMS.includes('combined') && ARMS.includes('installed_chrome')) P('', '## The combined arm\'s gains over installed_chrome that held, by delivering route', '', heldBy('combined', 'installed_chrome'))
  const fc = ARMS.includes('firecrawl')
  P('', `## Cost${fc ? ' and gap to Firecrawl' : ''}, per window`, '', `| Arm | Cost w1 | Cost w2 | Per 1,000 verified w1 | Per 1,000 verified w2 |${fc ? ' Gap to Firecrawl, 92: w1 / w2 | Gap, frozen 50: w1 / w2 |' : ''}`, `| --- | --- | --- | --- | --- |${fc ? ' --- | --- |' : ''}`,
    ...ARMS.map((a) => { const c = [A, B].map((w) => cost(w, a, 'first')); const gap = (w, set) => figures(w, 'firecrawl', set).verified - figures(w, a, set).verified; return `| ${a} | ${c[0].text} | ${c[1].text} | ${per1000(figures(A, a, ALL).verified, c[0])} | ${per1000(figures(B, a, ALL).verified, c[1])} |${fc ? ` ${a === 'firecrawl' ? '-' : `${gap(A, ALL)} / ${gap(B, ALL)}`} | ${a === 'firecrawl' ? '-' : `${gap(A, frozen)} / ${gap(B, frozen)}`} |` : ''}` }),
    '', `Cost: Octocrawl arms, the spend ledger over first calls (the grant's tariff estimate)${fc ? '; Firecrawl, the change in remaining credits over its first calls' : ''}. Clash bandwidth, compute, storage and delivery are not measured (unknown exposure).`)
  if (!fc) P('', FIRECRAWL_716.replace('in this window', 'in these windows'))
  P('', '## Per task, first calls (w1/w2: y = verified, F = false success, n = not, - = not run)', '',
    `| Task | Part | ${ARMS.join(' | ')} |`, `| --- | --- | ${ARMS.map(() => '---').join(' | ')} |`,
    ...tasks.map((t) => `| ${t.id} | ${t.part} | ${ARMS.map((a) => [A, B].map((w) => { const x = w.first[a].get(t.id); return !x ? '-' : x.outcome.verified ? 'y' : x.outcome.falseSuccess ? 'F' : 'n' }).join('/')).join(' | ')} |`), '')
  return L.join('\n')
}

if (dirs.length === 1) {
  const W = await load(dirs[0])
  ARMS = reportArms(W.m.arms)
  const label = opt('--label')
  const out = join(outDir, `${label}-summary.md`)
  if (existsSync(out)) throw new Error(`${out} exists`)
  await writeFile(out, windowRecord(W, label))
  for (const a of ARMS) {
    const f = join(outDir, `${label}-${a}.md`)
    if (existsSync(f)) throw new Error(`${f} exists`)
    const parts = [`# ${ARMS.includes('ic_compat') ? 'installed_chrome with compatible_transport and no Steel' : 'Combined grant'}, window ${W.m.window}, arm ${a}, ${W.m.date}`, '', `The runner's own records of this arm's runs in the window, copied whole; the comparison is in \`${label}-summary.md\`.`, '']
    for (const r of W.m.runs.filter((x) => x.arm === a)) parts.push(`## ${r.label} (${r.startedAt} → ${r.finishedAt}, exit ${r.exitCode})`, '', `Raw run: \`${r.runDir ?? 'none'}\`.`, '', (existsSync(join(repo, r.record)) ? await readFile(join(repo, r.record), 'utf8') : '(no record written)').replace(/^# .*\n/, '').replace(/^#{1,2} /gm, '### ').trim(), '')
    await writeFile(f, parts.join('\n'))
  }
  console.log(`wrote ${out} and ${ARMS.length} arm records`)
} else {
  const out = opt('--out')
  if (existsSync(out)) throw new Error(`${out} exists`)
  const W = [await load(dirs[0]), await load(dirs[1])]
  ARMS = reportArms(...W.map((w) => w.m.arms))
  await writeFile(out, twoWindowRecord(W))
  console.log(`wrote ${out}`)
}
